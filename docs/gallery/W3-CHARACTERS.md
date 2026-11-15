# W3 — personagens articuladas

Estado: código e proposta de integração. **Não testado**: por instrução do dono, testes, browser e medições pertencem ao Claude integrador. Sem afirmação de aprovação pelo Leo ou pela sala de argumentistas.

## Entrega

- `assets/gallery/npc-models.js`: `buildCharacter(THREE,M,spec)` devolve `{mesh,bones,height,mouth,eyes,setExpression,hasHat,triangles,dispose}`. Um SkinnedMesh e um material PBR por corpo, sem texturas novas. Ossos simples, boca e sobrancelhas articuladas, pupilas móveis. O chapéu continua na mesma malha mesmo quando o osso sai da cabeça.
- `assets/data/npc-cast.json`: 26 fichas, todas com pelo menos 15 falas distintas e todas as situações pedidas; doze alternativas originais com momento humano. Frases protegidas transcritas literalmente. O JSON é carregado por `fetch` da mesma origem, na construção do módulo. As últimas cinco fichas foram coordenadas com W2.
- `tools/w3-integration.patch`: alteração proposta apenas em `spaces/npcs.js`. Os originais não foram editados.
- `tests/w3-models.test.mjs`: verificações para o integrador executar; não executadas aqui.

## O elenco existente tem 14, não 7

`bull, goat, pigeon, horse, cat, pig, walrus, rooster, tortoise, raccoon, forcado, velho, gordo, mano` ficam ativos por defeito, nas posições existentes. As doze novas fichas são alternativas de casting; não se somam automaticamente. O Leo pode definir `ctx.scene.userData.npcAssignments` antes de construir o mundo: array por posição dos 14 slots existentes. IDs novos substituem um slot, herdando a sua zona e pontos de passeio. O JSON não faz nascer NPCs sozinho.

O patch preserva falas, estados, percursos, interações e coreografia do elenco atual. Os novos usam os mesmos comportamentos genéricos e o seletor de falas sem repetição consecutiva. Não foi criada uma nova simulação social. A dança do forcado, o barrete verde/vermelho, faixa, meias e bigode mantêm-se; o modelo original não referencia ninguém real.

## Contrato de animação

`bones.body === bones.spine`; `bones.head`, `bones.arms[0/1]`, `bones.legs[0/1]`, `bones.hat`, `bones.pelvis`, `bones.brows[0/1]`. São THREE.Bone, usando as mesmas âncoras locais que a animação atual. `shape=[escalaGlobal,perna,cabeça]`; a escala global continua aplicada pelo chamador ao grupo exterior. `height` é a altura local antes dessa escala. Pés próximos de y=0, frente +z.

`mouth.setOpen(0..1)`, `eyes.setLook(-1..1,-1..1)` e `setExpression(abertura,inclinaçãoSobrancelha)` não alocam. O patch chama expressões apenas dentro de 40m. O corpo usa cores por vértice e rugosidade por superfície; pele, olhos e roupa partilham um material da biblioteca clonado, com trama procedural suave filtrada por derivadas. Não é pixel art sobre a pele. O visual requer avaliação do Leo em contexto real.

## Orçamento proposto, não medido

Por passe principal: 14 corpos + 1 lote de adereços estáticos + 1 lote de sombras de contacto + 1 lote de estrelas + até 3 balões = **20 chamadas previstas**. O limite refere-se ao conjunto NPC no passe principal; reflexos e passes auxiliares podem repetir chamadas e têm de ser medidos separadamente. Não existe aqui medição `renderer.info.render`.

Os hitboxes mantêm `visible=true` porque `main.pickAt` ignora objetos invisíveis; apenas o material fica invisível para evitar desenho. Permanecem na cena e na lista de pickables. Sombras e estrelas conservam proxies de animação e são desenhadas com InstancedMesh. Máximo de três balões visíveis, escolhidos por distância; o estado das restantes falas continua. Texturas de balão passam para 256×128 com NearestFilter. A simulação de cada personagem adormece a >40m e retoma o estado ao regressar. Isto altera deliberadamente a apresentação de multidões e a progressão fora de vista; não altera a máquina de interação perto do visitante.

## Integração e QA do Claude

Aplicar o patch à base `main` da entrega, depois executar `node --check assets/gallery/npc-models.js`, `node --check assets/gallery/spaces/npcs.js` e `npm test`. Testar com `npm run serve` nas três qualidades. Confirmar skinning sem erros GLSL, chapéus a sair/voltar, cliques em hitboxes invisíveis, limites de texto, salto/queda/gestos/assentos e percurso do forcado. Inspecionar corpos de frente e de costas, olhos, sombras, noite e escala.

Medir chamadas/triângulos com 14 corpos enquadrados e três balões/estrelas ativos; comparar também reflexo do Hall. Verificar alocações e tempo de update no aparelho real. Verificar seleção opcional das sete fichas e validação visual da roupa (avental, colete, cachecol, telemóvel, meias/sandálias). O carregamento do JSON e a reconstrução do shader precisam de medição, não de uma promessa de tempo.

Ficam pendentes: todos os testes e medições acima, aprovação do casting, aprovação visual e revisão final das falas pela sala de argumentistas. O patch conserva as falas antigas exatamente, incluindo inglês; as novas falas são em português.

## Revisão de realismo e expressão

Esta revisão altera apenas `npc-models.js`, este documento e os testes novos do pacote. O patch de integração mantém-se intacto.

O crânio passou de uma esfera simples para uma superfície contínua esculpida, com subdivisão 48×32 (24×16 em low), órbitas, maçãs, sobrancelha óssea, mandíbula, queixo e assimetria discreta. Nos humanos, ponte e ponta nasal fazem parte da mesma superfície; narinas são recessos escuros pequenos. Nos animais, focinhos têm duas almofadas, sulco central e mandíbula achatada; bicos têm parte inferior articulada. O gato recebe focinho, nariz e bigodes finos. Não se aplica uma boca humana aos bicos.

Todos os olhos têm pálpebras superior/inferior articuladas, esclera curva, íris convexa com fibras radiais procedurais e pupila separada. Medium/high usam uma camada física de brilho apenas nos olhos; low mantém a rugosidade baixa sem essa camada. É uma aproximação opaca da córnea, **sem refração/transmissão**, para preservar uma única malha/material. Não há reflexos pintados: o brilho depende da iluminação real da cena.

Os humanos têm contorno de lábios, gengiva, seis dentes superiores individualizados e quatro inferiores em medium/high. Cabelo é uma massa contínua com silhueta irregular e detalhe fino filtrado. Pele, tecido, couro e pelo recebem tratamentos distintos; a pele nunca recebe a grelha do tecido. Poros e microvariação de tom desaparecem com a distância para evitar cintilação. A roupa ganhou gola dobrada, carcela, vivos de bolso, costura posterior, punhos, botões, vinco das calças e solas com espessura. Os detalhes finos de botões/bigodes são reduzidos em low.

`setPreset('incredulidade' | 'orgulho_fragil' | 'susto_contido', peso)` mistura assimetrias de sobrancelhas, pálpebras, olhar e mandíbula com `setExpression(abertura, sobrancelha)` já usado pela fala. `setPreset(null)` repõe a expressão neutra; `eyes.setLook(x,y)` continua independente. Os presets partilham tabelas numéricas e não criam objetos por frame. O integrador escolhe quando os aciona; não mudam automaticamente o comportamento legado.

Mantêm-se uma malha, um material e zero texturas externas adicionais. A revisão acrescenta geometria facial e custo de shader; **não há medição de triângulos, GPU, qualidade visual ou tempo de frame nesta entrega**. Os testes fornecidos verificam o teto de 15 mil triângulos quando Claude os executar. O resultado não é anunciado como fotorrealismo validado: faltam revisão visual a distância de conversa, comparação low/medium/high, luz diurna/noturna e validação dos shaders no dispositivo real. O material não simula dispersão subsuperficial da pele nem fibras individuais de cabelo.

Reserva atual por soma conservadora dos construtores, sem construir/renderizar os modelos: corpo, roupa e mãos até 4 500 triângulos; crânio 2 976; olhos/pálpebras 1 976; orelhas/sobrancelhas 416; nariz/boca/dentes/cabelo/bigode humanos até 2 992; chapéu/adereços por traje até 1 000. Total de reserva **13 860**. Os perfis de membros usam 12 segmentos em medium/high, libertando margem para os adereços sem retirar detalhe às faces aprovadas. Os extras animais ficam abaixo da reserva humana. Isto é uma estimativa analítica para as 26 fichas entregues, não `renderer.info.render` nem resultado de teste; combinações arbitrárias de flags fora das fichas não estão cobertas. O teste continua obrigatório.

A íris guarda coordenadas radiais próprias (`irisUV`) antes de `M.boxUV`; o padrão não depende da projeção UV da pele. `dFdx`, `dFdy` e `fwidth` operam apenas no fragment shader WebGL2, com nomes de atributos/varyings correspondentes. O brilho de córnea é aplicado depois do bloco físico do Three r170 e é desativado em low. A compilação real permanece pendente. Os presets são **opt-in**: o patch existente chama `setExpression`, mas não escolhe nem chama `setPreset`.

## Adendas: corpos, trajes e cinco personagens

As faces/expressões anteriormente aprovadas foram preservadas. Os corpos passaram a perfis de ombro, cintura, cotovelo e joelho; mãos têm palma, polegar e quatro dedos arredondados. `bodyWidth` altera torso e distância entre membros; `armLength` altera o comprimento dos braços. `rig.shape`, `rig.bodyY0`, `rig.headY` e `rig.height` dão dimensões efetivas ao integrador; a altura é local, anterior à escala global.

O forcado veste jaqueta curta de ramagens, calção justo creme, faixa vermelha, meias brancas até ao joelho, sapatos rasos e barrete com banda verde e coroa vermelha caída para o lado. Ramagens, flores e riscas são padrões materiais suaves filtrados, não sinalética pixel. Os restantes trajes deixam de herdar um fato indiferenciado: influencer com casaco brilhante, boné e pau de selfie; adepto com barriga, riscas e cachecol; turista de calções, meias/sandálias, chapéu e câmara; arrumador com colete e bandas claras; vizinha de bata florida e rolos; crítico com seda, óculos redondos e boina; tio com polo e cinto alto. As bandas do colete usam PBR brilhante; não implementam retroreflexão óptica.

| ID opcional | Modelo e adereços |
|---|---|
| `tio_camisola` | Camisola de alças, calções, meias/sandálias, toalha sobre o ombro, óculos na testa e braços compridos. |
| `senhor_banho` | Calções de banho, pele de tom avermelhado, chapéu de palha e jornal dobrado. |
| `cusco_roupao` | Roupão aberto sobre pijama às riscas, chinelos e binóculos de plástico. |
| `porco_fato` | Fato e gravata, focinho rosa ligado a `bones.snout`; `mouth.setOpen` move o focinho sem alterar a API de fala. |
| `urso_treino` | Cabeça com pelo irregular, orelhas redondas, fato de treino brilhante com bandas e corrente/medalhão de plástico dourado. |

Os três mirones são personagens fictícios adultos; a comédia está na cusquice. W4 detém o comportamento e o patch de integração; esta revisão não os alterou. `createLinePicker(entry,situação,contexto)` exclui por defeito as falas em `entry.lineContext`. As duas falas sobre proporções só ficam elegíveis com alvo fictício e evento explicitamente autorizados; não se dirigem ao visitante.

Todos os adereços integram o mesmo SkinnedMesh e os ossos existentes. Não há luzes, texturas externas ou chamadas de desenho novas por traje. A contagem estrutural continua um corpo = uma chamada por passe; medições e testes continuam exclusivamente para Claude.

Correções finais de construção: o pau de selfie prolonga-se para cima da mão, com o telefone no extremo superior; a camisola de alças termina efetivamente em y=1,32, deixando peito/ombros em pele e ligando alças contínuas por cima dos ombros. `armRadius` é explícito (0,052m por defeito no tio de camisola, 0,067m nos restantes), independente do comprimento. Turista e tio usam pés de meia branca sob as tiras e solas das sandálias, sem a massa de um sapato fechado. A camisola ganhou 120 triângulos líquidos pela substituição da antiga pele sobreposta e alças decorativas por construção completa; continua abaixo da reserva geral, dominada pelos outros trajes. Sem alteração ao teto analítico de 13 860 ou à contagem de chamadas.
