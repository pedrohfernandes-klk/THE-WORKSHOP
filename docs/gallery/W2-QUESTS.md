# W2 — recados com consequências

Base do patch: `b1e679190f01d37d961048949305164b8fe0fef8` (lote 1 publicado). Preserva W1, desempenho e novas falas do dono.

## Entrega ao integrador (menos de 250 palavras)

Cinco missões opt-in, definidas em `assets/data/missions.json`, com motor em
`assets/gallery/spaces/quests.js`. O aro físico em **(8, 41)** inicia-as por ordem;
`start(id)` permite atribuí-las numa conversa com um NPC. Não há objetivos, sons
ou notificações antes desse pedido. O aro acompanha o objetivo atual.

`quest-actors.js` fornece três atores originais independentes: um pombo foge com
a nata até **(60, 29)**; um touro de cartão em **(14, 36)** tomba ao toque; um
turista em **(8, 41)** segue o caminho efetivamente percorrido pelo visitante
até ao metro **(83, 29)**. Só o ator da missão atual fica visível. O momento
sério escolhe a obra mais observada ainda exposta, mantém-na pendurada e conta
90 segundos de atenção real à noite, sem fanfarra.

Orçamento estrutural: **1 mesh para o marcador + no máximo 1 ator visível**,
sem luzes novas. Draw calls, triângulos em `renderer.info.render`, tempo de
`update` e durações reais: **por medir por Claude**. Os 120–240 segundos no JSON
são uma intenção de ritmo, não resultados; correr pode abreviar os percursos.

Aplicar `tools/w2-integration.patch`: registo de `arraial`/`quests`, publicação
de cliques, ligação ao curador e silêncio confirmado da música e do mundo. Aplicar W1 para `mercado` (`nata` e `fruta`).

Ficam para Claude os testes, medições, circulação real e revisão visual/sonora;
para Leo e a sala, a aprovação estética e cómica. Nenhum teste foi executado
pelo autor deste pacote, conforme a instrução posterior do dono.

## Integração concreta

O patch foi **gerado por `git diff --no-index` entre cópias temporárias**. Não foi
aplicado a nenhum ficheiro existente. Todos os ficheiros entregues são novos.
Os pontos de inserção abaixo referem-se à base lida; o patch contém os contextos
exatos e os números de linha. Fundir o registo `SPACES` com os restantes pacotes
para não registar `arraial` duas vezes.

| Ficheiro existente | Ponto exato | Ligação |
| --- | --- | --- |
| `world.js` | `SPACES`, depois de `'mercado', 'marginal',` | Acrescentar `'arraial', 'quests'`. |
| `main.js` | Depois de `const curator = createCurator(...)` | Publicar `scene.userData.questArt`. |
| `main.js` | Em `act`, depois de `const { action, module, object } = found;` | Atualizar `lastModulePick`. |
| `main.js` | Imediatamente antes de `audio.update(dt);` | Atualizar `questSilence`, chamar `audio.setQuiet` e confirmar o ganho final e a ausência de voz. |
| `audio.js` | `buildEngine`, getter `bus`, arranque e API | Rota de efeitos e ganho final `questGate`; `setQuiet(bool)` com fade total de 350 ms. |
| `spaces/npcs.js` | `audioOn`, `say`, cancelamento de fala | Impedir novas falas e cancelar voz em curso durante o momento sério. |

O bus público continua a ser um AudioNode. Música e efeitos convergem no master; depois do limitador e soft clip, `questGate` desce linearmente a zero em 350 ms. `audio.quietConfirmed` só confirma após o prazo do relógio de áudio e ganho final zero (ou quando ainda não existe motor de áudio). A preferência `audio.muted` é preservada. `main.js` cancela voz sintetizada e publica confirmação apenas quando não há fala ativa nem pendente. A missão exige essa confirmação e reinicia o tempo acumulado se a perder. Sons emitidos fora do bus contratado não são abrangidos.

O ficheiro existente `arraial.js` já tem a Rosa (`id: 'rosa'`) mas não estava
registado. W2 não modifica a sua música nem as suas falas. Deve ser revisto
por Leo no contexto do cânone atual antes de publicação.

### Eventos e API

```js
// Atualizar no clique, em segundos da performance clock; não em Date.now().
scene.userData.lastModulePick = { module: 'mercado', id: 'nata', time };
// Emissor: main.js, act(found, hit), no clique efetivamente encaminhado.

// Emissor: main.js, imediatamente antes de audio.update(dt), objeto reutilizado.
scene.userData.questSilence = { requested: true, confirmed: true };
// requested segue questQuiet; confirmed exige audio.quietConfirmed e nenhuma TTS.
// O motor da missão nunca fabrica este reconhecimento.

// Já publicados pelo projeto; podem estar ausentes durante o arranque.
scene.userData.lastGesture = { name: 'dance', time };
scene.userData.stats = { slaps: 2 };
scene.userData.weather = { mode: 'night' };

// Apenas numa interação explícita, nunca por proximidade:
world.modules.get('quests').start('turista');
world.modules.get('quests').cancel();
// Diagnóstico, fora do loop de render:
world.modules.get('quests').state;
```

O motor consome um evento uma só vez, rejeita eventos anteriores à etapa,
eventos futuros, eventos fora do lugar e cliques no módulo/id errado. O gatilho
`chapadas` conta apenas o incremento desde a entrada na etapa; nenhuma missão
autorizada exige bater em pessoas. `olhar` é a extensão necessária para o
momento sério: atenção apenas à favorita congelada, imóvel e de noite.

`questArt.select(out)` preenche um objeto prealocado com `id,x,y,z` (posição
segura de observação, piso, não o centro da tela). `isLooking(id)` consulta o
gaze real do Hall. `lock()` e `release()` preservam o estado anterior do curador,
incluindo uma exposição partilhada. Sem esta ligação, a missão séria recusa
iniciar; não inventa uma favorita. Sem atenção anterior, o convite pede ao
visitante que olhe primeiro para uma obra.

### Atores, caminho e custo

- O pombo arranca em `(68, 29)` com a nata visível no bico e recua pelo caminho
  até `(60, 29)`. A recuperação exige clicar nele perto do destino; a entrega
  exige o aro em `(8, 41)`.
- O touro é cartão tridimensional fino, com dobras e fita, sem animação de um
  animal real. A queda é reduzida a uma pequena inclinação em reduced motion.
- O turista guarda a rota do visitante num anel de 512 pontos prealocado.
  Segue a 1,75 m/s; cada checkpoint só avança quando ambos chegaram. A fonte
  tem de ser contornada pelo jogador, e o acompanhante repete esse desvio.
  Se o jogador se afastar mais de 40 m, o ator dorme até ele regressar. Não
  existe teletransporte de recuperação; Claude deve testar correr/voltar e
  completar o percurso a pé. A rota não atravessa os carris.
- Os atores são props simples deste pacote, não substituem nem alteram o
  elenco de `npcs.js`. O turista pode futuramente usar o modelo W3; nesta
  entrega segue como um mesh rígido, sem animação de pernas. Nenhuma missão
  depende dessa substituição.
- O marcador tem 240 triângulos por construção (toro, 6×20×2), sem textura
  própria. Atores: geometria unida por ator, um material PBR com cores e
  acabamento por vértice. O passe de realismo acrescenta cartão recortado de
  18 mm, cortes escuros/caneluras e canal de dobra; penas sobrepostas e bico
  cónico; gola, carcela, botões, bainhas, punhos de meias, palmilhas e solas
  curvas no turista. Pele, algodão, papel, fita, couro, borracha e olhos têm
  roughness distinta no mesmo shader; o microgrão desaparece por derivadas
  antes de criar cintilação à distância. Não há superfícies pixelizadas,
  texturas novas, luzes novas ou alterações ao loop de movimento.
  Contagens finais de render ficam por medir, incluindo
  reflexos e passes auxiliares, sem confundir meshes com draw calls totais.
- Os caminhos já pertencem a regiões do mundo/W1. O pacote não cria chão ou
  regiões novas. Os atores não bloqueiam circulação; não há colliders novos.
- O loop usa escalares e o anel prealocado; não cria arrays, vetores, closures
  ou nós de áudio. Transições chamam `ui.toast`, cuja implementação externa
  pode alocar; isso é uma ação pontual, não trabalho em todos os frames. A
  fanfarra reutiliza oscilador/gain armados no clique, lê mute/context/bus ao
  tocar e não acrescenta áudio durante o momento sério.

## Validação reservada a Claude

`tests/w2-quests.test.mjs` cobre os cinco percursos lógicos, eventos obsoletos,
contagem de gestos, alvo/altura errados, opt-in e cancelamento da missão séria.
Não substitui a travessia no browser nem o teste do grafo de áudio modificado.

Antes de aceitar: aplicar patches numa cópia de integração, executar
`node --check` nos dois JS novos, `npm test`, servir localmente e percorrer as
cinco missões em high/medium/low. Confirmar 390×844, toque/gestos, mute durante
fanfarra, troca de tempo, alvo favorito, cancelar/restaurar áudio e curador,
ausência de erros e os limites de 0,1 ms / draw calls. Cronometrar do pedido à
conclusão: ajustar distâncias/etapas se o percurso normal sair de 2–4 minutos,
sem acrescentar esperas para disfarçar duração. Sprint não fica proibido.

### Rádio e voz fora do Hall

O patch inclui `spaces/radio.js`: `startTalk` recusa `questQuiet`, e a atualização trata o pedido como silêncio para cancelar voz ativa. Assim o rádio não volta a iniciar TTS enquanto a missão séria está ativa, mesmo se o visitante regressar ao terraço.
