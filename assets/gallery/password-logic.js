export const PASSWORD_PHRASES = Object.freeze([
  'Levaste na ___.', 'Tens ganda ___.', 'Cala a ___!',
  'Em ___ fechada não entra mosca.', 'Pela ___ morre o peixe.',
  'Quem tem ___ vai a Roma.', 'Fiquei de ___ aberta.', 'Ficou de ___ à banda.',
  'Fica-me água na ___.', 'Disse-o da ___ para fora.', 'Não fales de ___ cheia!',
  'Tiraste-me as palavras da ___.', 'Falam disso à ___ pequena.',
  'Queimei o céu da ___ com a sopa.', 'Senti um aperto na ___ do estômago.',
  'Encontramo-nos à ___ do metro.', 'Não estaciones à frente da ___ de incêndio.',
  'Acende a ___ do fogão.', 'Calças à ___ de sino.', 'Fiquei com a ___ seca.',
  'Abri a ___ de sono.', 'Pôs a ___ no trombone.',
]);
export const PASSWORD_HINT = 'É sempre a mesma coisa. Abre-a para responder.';
export function isPassword(answer) {
  const value = String(answer ?? '').trim().toLocaleLowerCase('pt-PT').replace(/\s+/g, ' ');
  return value === 'boca' || value === 'a boca';
}
export function createPasswordState(ids) {
  const buildings = Object.create(null), sequence = [];
  for (const id of ids) buildings[id] = { unlocked: false, failures: 0, phrase: null };
  let cursor = 0, discovered = false, serial = 0;
  return {
    buildings,
    get discovered() { return discovered; },
    prompt(id) {
      const entry = buildings[id];
      if (!entry) return null;
      if (entry.phrase === null) entry.phrase = PASSWORD_PHRASES[cursor++ % PASSWORD_PHRASES.length];
      return discovered ? 'Já sabes.' : entry.phrase;
    },
    answer(id, text) {
      const entry = buildings[id];
      if (!entry || entry.unlocked) return { accepted: false, duplicate: !!entry?.unlocked };
      if (!isPassword(text)) {
        entry.failures++; sequence.length = 0;
        entry.phrase = PASSWORD_PHRASES[cursor++ % PASSWORD_PHRASES.length];
        return { accepted: false, phrase: discovered ? 'Já sabes.' : entry.phrase, hint: entry.failures >= 3 ? PASSWORD_HINT : 'Experimenta outra vez.' };
      }
      entry.unlocked = true;
      const firstTry = entry.failures === 0;
      if (firstTry) { if (!sequence.includes(id)) sequence.push(id); }
      else sequence.length = 0;
      const achievement = !discovered && sequence.length >= 3;
      if (achievement) discovered = true;
      return { accepted: true, firstTry, achievement, buildingId: id, eventId: `password-${++serial}-${id}` };
    },
  };
}
