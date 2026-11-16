// The fighting-game layer of the porrada: strings (blows chained by a key inside a short window),
// counter-hits, one launcher per character and its juggle, the bear hug (a throw that can be
// broken) and best-of-three rounds with a K.O. Tables and pure helpers live here; combat.js owns
// the fighters, the frame and the camera. Everything here is allocation-free once loaded.

// Timing, in seconds of fight time (frozen during hit-stop, slowed during the K.O.).
export const BUFFER=.25;        // a key pressed this long before its window still comes out
export const CANCEL=.07;        // on a clean hit, the next blow of a string may start this long after contact
export const CHAIN_GRACE=.25;   // after a blow ends, its string can still be continued for this long
export const BLOCKSTUN=.16;
export const COUNTER_DAMAGE=1.4,COUNTER_STUN=.12,COUNTER_STOP=.07;
// Launch: 4.6 m/s against 11.5 m/s² is a 0.8 s arc, 0.92 m high. Each juggle hit pops the body
// up again, weaker every time, while gravity grows by 30% a hit: a juggle always comes down.
export const LAUNCH_V=4.6,GRAVITY=11.5,JUGGLE_GRAVITY=.3,POP_V=2.6,POP_DECAY=.8,JUGGLE_MAX=5,JUGGLE_CEILING=1.05;
export const BOUNCE_V=2.5,TRIP_V=1.8,OTG_V=2.6,TRAM_LIFT=.6;
export const DOWN_TIME=.6,RISE_TIME=.35,SPLAT_TIME=.5,SPLAT_HEIGHT=.35,WALL_REACH=.55;
export const GRAB=11,GRAB_RANGE=1.65,GRAB_HOLD=.95,BREAK_WINDOW=.5,THROW_POWER=24,AI_BREAK=.3;
// The opponent: strings 45% of its attacks after the first, two quick juggle hits after a launch,
// a guard against 30% of the visitor's blows, half the time a guard as it recovers under pressure,
// a quick blow right after it blocks (a blocked chapada leaves the visitor 0.08 s short), 30% of
// hugs broken.
export const STRING_CHANCE=.45,AI_JUGGLES=2,AI_GUARD=.3,AI_WAKE_GUARD=.5;
export const WINS=2; // rounds to win the match: best of three
// The K.O.: 0.6 s of real time at 30% speed (none with reduced motion), then the winner's pose
// and line; the next round, or the end of the match.
export const KO_SLOW=.6,KO_TIME_SCALE=.3,KO_PUSH=.3,KO_ROUND=2.8,KO_MATCH=3.3,TAUNT_AT=.9;

// A string is a path of blows. The first comes out from neutral (any key that starts it); each
// next one needs the key at the same place in `keys`, pressed inside the chain window. Keys:
// Q the chosen blow (a chapada unless the visitor picked another), R revés, Z rasteira, C abraço
// de urso, F chinelada. `moves` index MOVES in combat.js. A signature string has an `owner`.
export const STRINGS=Object.freeze([
  ['chapada-rasteira','Chapada, chapada, rasteira','QQZ',[0,0,7]],
  ['sanduiche-no-ar','Sanduíche no ar','QC',[0,2]],
  ['pisa-e-chinela','Rasteira, pisadela, chinelada','ZZF',[7,6,9]],
  ['ida-e-volta','Ida e volta','QRF',[0,1,9]],
  ['pega-de-caras','Pega de caras','QQC',[0,0,11],'forcado'],
  ['bengalada-da-reforma','Bengalada da reforma','QF',[3,8],'velho'],
  ['barrigada-de-domingo','Barrigada de domingo','QC',[12,2],'gordo'],
  ['transferencia','Transferência','QQ',[13,3],'mano'],
  ['aquecimento','Aquecimento com abraço','QC',[12,11],'urso_treino'],
  ['focinhada-de-gestor','Focinhada de gestor','QQ',[14,10],'porco_fato'],
].map(([id,label,keys,moves,owner=''],index)=>Object.freeze({id,label,keys,moves:Object.freeze(moves),owner,index})));
// The blow that launches, per character (the sanduíche for everybody else). The forcado's and
// the training bear's signatures are throws, so they launch with the sanduíche too.
export const LAUNCHER=Object.freeze({velho:8,mano:3,porco_fato:10});
export function launcherOf(id){return LAUNCHER[id]??2;}
// Quick blows the opponent uses to keep a launched body up.
export const JUGGLE_MOVES=Object.freeze([0,3,13,15]);

// The string `owner`'s blows so far (`path`, `depth` long) continue with `key`: its index, or -1.
export function findContinuation(owner,path,depth,key){
  if(depth<1||!key)return -1;
  for(let i=0;i<STRINGS.length;i++){const s=STRINGS[i];
    if(s.owner&&s.owner!==owner||s.moves.length<=depth||s.keys[depth]!==key)continue;
    let j=0;while(j<depth&&s.moves[j]===path[j])j++;if(j===depth)return i;}
  return -1;
}
// Would these blows, after `last` used `repeats` times running, give one blow three times in a row?
export function tripleRun(moves,last=-1,repeats=0){
  let prev=last,run=last>=0?repeats:0;
  for(let i=0;i<moves.length;i++){run=moves[i]===prev?run+1:1;prev=moves[i];if(run>=3)return true;}
  return false;
}
// Damage of the n-th hit of a combo (1 for the first): 12% less each, never under 40%.
export function comboScale(hits){return Math.max(.4,1-.12*Math.max(0,hits-1));}
// Hitstun long enough for every string to combo on a clean hit, short enough that the same blow
// pressed again after its recovery never loops (it would need recovery + the quickest wind-up).
export function hitstunOf(move){return Math.min(.25+.007*move.power,move.duration-move.windup+.09);}
// The juggle's vertical motion, exact for any frame length. True on the frame the body lands.
export function stepAir(r,dt){
  if(!r.airborne||dt<=0)return false;const g=GRAVITY*(1+JUGGLE_GRAVITY*r.juggles);
  r.air+=r.airV*dt-.5*g*dt*dt;r.airV-=g*dt;if(r.air>0)return false;r.air=0;r.airV=0;return true;
}
export function liftOff(r,v){r.airborne=true;r.airV=v;r.air=Math.max(r.air,.001);r.stun=0;}
// A hit on a body in the air: counts the juggle and, while juggles remain, pops it up again, never
// past JUGGLE_CEILING (the fight camera keeps the whole body in the shot).
export function juggleHit(r,scale=1){
  r.juggles++;if(r.juggles>JUGGLE_MAX)return;const g=GRAVITY*(1+JUGGLE_GRAVITY*r.juggles);
  r.airV=Math.max(r.airV,Math.min(POP_V*POP_DECAY**(r.juggles-1)*scale,Math.sqrt(2*g*Math.max(0,JUGGLE_CEILING*scale-r.air))));
}
// Seconds until a launched body touches the ground (for a juggle follow-up that must still reach it).
export function landsIn(r){
  if(!r.airborne)return 0;const g=GRAVITY*(1+JUGGLE_GRAVITY*r.juggles);
  return (r.airV+Math.sqrt(r.airV*r.airV+2*g*Math.max(0,r.air)))/g;
}

// Names over the BRIO bars, and each winner's line. Invented people; the joke is on the speaker.
// Swearing is bleeped as #%&@.
const NAMES=Object.freeze({visitor:'Tu',forcado:'O forcado',velho:'O da bengala',gordo:'O da barrigada',mano:'O mano',
  influencer:'O influencer',tio:'O tio',arrumador:'O arrumador',vizinha:'A vizinha',critico:'O crítico',adepto:'O adepto',
  turista:'O turista',tio_camisola:'O da camisola',senhor_banho:'O dos calções',cusco_roupao:'O cusco',porco_fato:'O porco de fato',
  urso_treino:'O urso de treino',fabinhe:'Fabinhe',bull:'O touro',goat:'A cabra',pigeon:'O pombo',horse:'O cavalo',cat:'O gato',
  pig:'O porco',walrus:'A morsa',rooster:'O galo',tortoise:'A tartaruga',raccoon:'O guaxinim'});
export function nameOf(id){return NAMES[id]||(id?id.replace(/_/g,' '):'?');}
const TAUNTS=Object.freeze({
  visitor:['Vai-te sentar, ó nabo. Isto foi só o aquecimento.','Tens uma testa que parece um papo seco, e eu estava com fome!',
    'Leva o troco, cara de papo. SAPAS!','Cala-te, #%&@! Ganhei eu!','Ó estupidozinho, para a próxima traz brio de casa.'],
  forcado:['Limites? Quem tem limite é o cartão de crédito, hahahah!','Pegado de caras, ó nabo! Nem o touro foi tão fácil.'],
  velho:['No meu tempo levavas com a bengala e ainda agradecias, ó estupidozinho!','Reformado sim, acabado não, ó cara de papo!'],
  gordo:['Esta barriga é blindada, ó nabo!','Barrigada de domingo, ó estupidozinho! Agora vai buscar o pão.'],
  mano:['Isto já não é o que era, ai egrégios avós... mas tu levaste, bro!','Calma, bro! Mando-te o recibo das chapadas por mensagem.'],
  influencer:['Gosto, partilha e vai-te deitar, ó cara de papo!','Isto vai viral: o nabo que levou três seguidas!'],
  porco_fato:['Focinhada de gestor, ó porco! Assina aqui a derrota.','Reunião encerrada, ó estupidozinho. Próximo ponto: o chão.'],
  urso_treino:['Abraço de urso grátis, ó nabo! O ginásio cobra à hora.','Eu aqueci. Tu é que arrefeceste, cara de papo!'],
  tio:['Ó sobrinho, levaste mais do que no Natal!'],critico:['Uma estrela. E é por pena, ó estupidozinho.'],
  adepto:['Golo! E tu fora de jogo, ó nabo!'],turista:['Que típico! Levaste como um local, ó cara de papo!'],
  arrumador:['Fica aí estacionado, ó nabo. São dois euros.'],vizinha:['Já liguei ao prédio todo, ó porco! Amanhã toda a gente sabe.'],
  tio_camisola:['Nem despenteei a camisola, ó estupidozinho!'],senhor_banho:['Vai tomar banho, ó cara de papo. Eu já fui.'],
  cusco_roupao:['Eu vi tudo, ó nabo. E vou contar a toda a gente!'],fabinhe:['Esta chapada tem refrão, ó cara de papo! Lá, lá, lá!'],
  bull:['Muuu! Isto é que é uma pega, ó papo seco!'],goat:['Mééé! Cabeçada de cabra, ó nabo!'],rooster:['Cocoricó! Acorda, ó estupidozinho!'],
  pigeon:['Pru-pru! Volta para o ninho, ó nabo!'],horse:['Hiii! O coice foi de borla, ó cara de papo!'],cat:['Miau. Sete vidas, e tu nem uma, ó nabo.'],
  pig:['Oinc! Afinal o porco és tu!'],walrus:['Bigode de morsa, brio de campeão, ó estupidozinho!'],
  tortoise:['Devagar se vai ao longe, ó nabo. E tu foste ao chão.'],raccoon:['Roubei-te o brio, ó cara de papo. A carteira fica para a próxima.'],
  other:['Ó nabo, levanta-te que o chão não é teu!','Cara de papo! Volta quando tiveres brio.','Ó estupidozinho, essa guarda é de papel?',
    'Tens uma testa que parece um papo seco, ó trombil!','Cala-te, #%&@, que ainda levas a terceira!'],
});
export function tauntOf(id,n=0){const list=TAUNTS[id]||TAUNTS.other;return list[((n%list.length)+list.length)%list.length];}
// The winner's pose: 0 arms up, 1 hands on hips with the chest out, 2 a flex.
export const VICTORY=Object.freeze({forcado:1,mano:1,vizinha:1,critico:1,urso_treino:2,gordo:2,influencer:2,adepto:2});

// Text the HUD shows, built once.
const COMBO_TEXT=[],SHOUT_TEXT=[],HITS=[],POP=[];
for(let i=0;i<=40;i++){COMBO_TEXT.push(i+' GOLPES');SHOUT_TEXT.push(i<3?'':i<5?'SAPAS!':i<7?'SAPAS SAPAS!':'SAPAS À BRUTA!');HITS.push(String(Math.min(i,12)));POP.push(String(1.2+Math.min(i,10)*.07));}
const ROUND_TEXT=Object.freeze(['','RONDA 1','RONDA 2','RONDA FINAL']);
const CALL=Object.freeze({round:['.85s','combat-call is-round pop-a','combat-call is-round pop-b'],fight:['.8s','combat-call is-fight pop-a','combat-call is-fight pop-b'],
  counter:['.7s','combat-call is-counter pop-a','combat-call is-counter pop-b'],ko:['2.4s','combat-call is-ko pop-a','combat-call is-ko pop-b'],
  wall:['.8s','combat-call is-wall pop-a','combat-call is-wall pop-b'],bounce:['.7s','combat-call is-wall pop-a','combat-call is-wall pop-b'],
  grab:['.9s','combat-call is-grab is-hold','combat-call is-grab is-hold'],escape:['.8s','combat-call is-grab pop-a','combat-call is-grab pop-b'],
  slam:['.9s','combat-call is-counter pop-a','combat-call is-counter pop-b']});
const COMBO_LINGER=.9;
const LIFE=Object.freeze({round:.85,fight:.8,counter:.7,ko:2.4,wall:.8,bounce:.7,grab:9,escape:.8,slam:.9});
export const MOVE_HINT='Q Q Z rasteira · Q C sanduíche no ar · Z Z F pisa e chinela · Q R F ida e volta · C abraço de urso, e C solta-te';
export const TOUCH_HINT='✋✋🦵 rasteira · ✋🤗 sanduíche no ar · 🦵🦵👟 pisa e chinela · ✋↶👟 ida e volta · 🤗 abraço, e 🤗 solta-te';

// The arcade HUD: names and round pips over the BRIO bars (`tags`, two nodes for the panel), and
// one fixed layer with the combo counter, the big call and the winner's line. Text and classes
// change on fight events only; update() just hides what has run its time.
export function createArcadeHud(doc){
  const el=(tag,className)=>{const e=doc.createElement(tag);e.className=className;return e;};
  const tags=[el('div','combat-tag'),el('div','combat-tag is-foe')];
  const layer=el('div','combat-fx'),combo=el('div','combat-combo'),count=el('b',''),shout=el('em',''),call=el('div','combat-call'),line=el('p','combat-line');
  // The counter and the calls are pictures of the fight; the line (hints, the winner's taunt) is read out.
  layer.hidden=true;combo.setAttribute('aria-hidden','true');call.setAttribute('aria-hidden','true');line.setAttribute('aria-live','polite');
  combo.append(count,shout);layer.append(combo,call,line);
  let flip=false,comboFlip=false,callUntil=0,lineUntil=0,queued='',queuedKind='',queuedAt=0,comboOn=false,comboAt=0,comboHide=0,comboFoe=false,still=false;
  for(const t of tags)t.setAttribute('data-wins','0');
  const api={tags,layer,
    setStill(value){still=!!value;layer.className=still?'combat-fx is-still':'combat-fx';},
    show(value){if(layer.hidden!==!value)layer.hidden=!value;},
    setNames(a,b){tags[0].textContent=a;tags[1].textContent=b;},
    setWins(a,b){tags[0].setAttribute('data-wins',HITS[a]||'0');tags[1].setAttribute('data-wins',HITS[b]||'0');
      tags[0].setAttribute('aria-label',tags[0].textContent+': '+a+' ronda(s)');tags[1].setAttribute('aria-label',tags[1].textContent+': '+b+' ronda(s)');},
    // Bigger and bouncier with every hit; it stays up COMBO_LINGER after the last one.
    combo(hits,foe,now=0){const n=Math.min(hits,40);count.textContent=COMBO_TEXT[n];shout.textContent=SHOUT_TEXT[n];
      combo.style.setProperty('--hits',HITS[n]);combo.style.setProperty('--pop',POP[n]);comboFlip=!comboFlip;comboOn=true;comboAt=now;comboHide=0;comboFoe=!!foe;
      combo.className=(foe?'combat-combo is-foe is-on ':'combat-combo is-on ')+(comboFlip?'bump-a':'bump-b');},
    comboEnd(now=0){if(comboOn&&!comboHide)comboHide=Math.max(now,comboAt+COMBO_LINGER);},
    call(kind,text,now,delay=0){if(delay>0){queued=text;queuedKind=kind;queuedAt=now+delay;return;}
      const c=CALL[kind]||CALL.fight;flip=!flip;call.textContent=text;call.style.setProperty('--life',c[0]);call.className=flip?c[1]:c[2];callUntil=now+(LIFE[kind]||.8);},
    round(n,final,now){api.call('round',final&&n>1?ROUND_TEXT[3]:ROUND_TEXT[Math.min(n,3)]||'RONDA',now);api.call('fight','PORRADA!',now,.8);},
    clearCall(){call.className='combat-call';callUntil=0;queued='';},
    line(text,now,seconds,hint=false){line.textContent=text;line.className=hint?'combat-line is-hint is-on':'combat-line is-on';lineUntil=now+seconds;},
    update(now){
      if(comboHide&&now>=comboHide){comboHide=0;comboOn=false;combo.className=comboFoe?'combat-combo is-foe':'combat-combo';}
      if(queued&&now>=queuedAt){const text=queued,kind=queuedKind;queued='';api.call(kind,text,now);}
      if(callUntil&&now>=callUntil){callUntil=0;call.className='combat-call';}
      if(lineUntil&&now>=lineUntil){lineUntil=0;line.className='combat-line';}},
    clear(){comboHide=0;comboOn=false;combo.className='combat-combo';api.clearCall();lineUntil=0;line.className='combat-line';layer.hidden=true;},
    dispose(){layer.remove();for(const t of tags)t.remove();}};
  return api;
}
