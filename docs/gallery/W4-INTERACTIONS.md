# W4 — contactos curtos, ações preservadas

Base: `c8937e1bc3718e1f806338356b48576bf69ee7e8`. Só ficheiros novos; alterações ao projeto estão em `tools/w4-integration.patch`. Por instrução posterior do dono, **nenhum teste foi executado**: testes, cobertura física, tempos e contadores pertencem ao Claude.

## Entrega

- `assets/gallery/interactions.js`: `REACTIONS` e `createInteractions(ctx)`.
- `assets/data/interactions.json`: inventário de objetos por módulo, nome/raiz/posição, tipo, linha e âncora de origem. Distingue reações novas, ações nativas e casos não resolvidos.
- `tools/w4-integration.patch`: import, carga local do JSON, ligação ao clique e aos prompts, ciclo de atualização e nomes/tags nos objetos anteriormente anónimos.

O catálogo cobre `bench`, `bin`, `lamp`, `door`, `tree`, `fountain`, `sign`, `plant`, `car`, `bike`, `screen`, `railing`, `bollard`, `phone`, `window`. Um fallback `object` serve apenas objetos explicitamente identificados, sem inferir que todo o edifício é um objeto móvel. Cada perfil tem envelope, frequência/timbre e duração próprios (0,38–1,15 s). Não há falas em todos os toques: no máximo uma a cada quatro usos desse objeto e com intervalo global superior a 12 s. Avisos têm até seis palavras.

## API e ordem de execução

```js
const interactions = createInteractions(ctx);
const interactionFrame = { camera }; // criar uma vez
interactions.attach(mesh, 'bin');
// Opcional, só para objetos independentes sem animação própria:
interactions.attach(independentRoot, 'car', { motion: true });
// No clique, depois de respeitar as ações nativas:
interactions.react(hit.object, hit); // true = tratou; false = deixar continuar

// No loop, nesta ordem:
interactions.beforeUpdate();        // remove a microtranslação anterior
world.update(dt, frame);            // comportamento autoritativo dos módulos
room.update(dt, camera);
interactions.update(dt, interactionFrame);
```

`attach` nunca substitui `userData.action`. `react` rejeita assentos e NPCs: continuam no fluxo original de sentar/falar/chapada. Ecrãs e telefone com ações existentes continuam a abrir a aplicação ou a falar pelo seu módulo. As entradas `native` do mapa não recebem uma segunda reação redundante. O patch não altera o comportamento dos módulos.

`installMap(world, data)` faz a ligação uma vez depois da construção dos módulos. `find`, `label`, `audit`, `dispose` e `active` apoiam integração e inspeção. A carga do JSON é same-origin, não bloqueia ENTRAR nem exige CSP mais permissiva. O hook opcional `ctx.prepareInteractions` é aguardado em `world.js` **antes da criação do batcher**: elimina a corrida entre tags e batching. O fetch tem timeout de oito segundos, para a falta do JSON não prender o campus. Erro de carga deixa o campus original utilizável e é registado na consola. A marca de campus pronto inclui agora a preparação das interações.

## Geometria fundida e instâncias

Um toque num guarda-corpos ou janela fundidos com outros objetos produz som e uma pequena bolha pixel **no ponto de contacto**. Não move a escola inteira, não desloca colliders, não extrai geometria nem multiplica draw calls por objeto. A bolha regressa ao tamanho/posição inicial e desaparece; é a animação de reação segura para batches.

Microtranslação física está desativada por defeito. O carro independente das ruínas é o único opt-in do mapa: deslocamento máximo 1,2 cm, sempre restaurado antes do update do módulo. `instanceId` é respeitado quando uma instância independente é explicitamente opt-in; nunca se move o `InstancedMesh` inteiro. Não ativar este modo em conjuntos de peças sem agrupar o objeto físico.

Árvores são camada 1 no mundo atual. O mapa usa apenas os troncos como identidade (não conta copas duas vezes) e cria proxies instanciados na camada 0, com material `visible:false`. Assim, não se torna toda a vegetação alvo do raycaster nem do espelho. Os proxies não desenham. A geometria corresponde a troncos aproximados; Claude valida alcance e coincidência com os troncos visuais.

Portas/janelas/guarda-corpos fazem parte do inventário, mesmo sendo arquitetura. Volumes são testados pelo `hit.point`, não pelo centro do batch: estar perto de uma janela não torna toda a parede interativa. Não há deslocamento físico por defeito nestes casos. A escola não recebe falas/texto e o mapa suprime também o som dos contactos escolares.

## Orçamento por construção — não medição

O feedback partilhado tem um `InstancedMesh`, oito triângulos por bolha e capacidade fixa de 12: **um draw call e até 96 triângulos no passe principal** quando ativo; zero quando adormecido. Camada 1 exclui-o do espelho habitual. Sem textura, sombra ou luz nova. Proxies usam material invisível. Não se está a atribuir esse valor a todos os passes de `renderer.info.render`.

O pool, vetores, matrizes e slots são pré-alocados. `update` percorre só reações ativas; sem ativos, retorna. A criação de nós de áudio e closures ocorre no evento de toque, nunca no update. Os nós terminam e desligam-se; falha parcial também é limpa. O som consulta `ctx.audio.context/bus/muted` no momento de tocar, tem atenuação/filtro/pan por distância, e limite global de disparo. Não usa ficheiros de som. Toques exigem 4,5 m; reações abandonadas além de 40 m são encerradas. `reducedMotion` mantém apenas feedback estático curto. `scene.userData.questQuiet` cancela reações cómicas e impede novos sons/toasts durante a missão séria.

## Cobertura: não trocar objetos por malhas

**A aceitação de ≥80% ainda não está certificada.** O mapa é uma base de ligação, não uma medição do cenário instanciado. Somar os oito postes, oito cabeças e oito lentes não dá 24 candeeiros: são oito. Cinco arcos de um suporte não são cinco bicicletas. Uma malha fundida pode conter vinte objetos. Campos `physicalGroup`, `count`, `status` e notas evitam essas equivalências falsas.

`window.__gallery.interactions.audit()` devolve identidades resolvidas por linha e casos não encontrados, mas deixa `measuredPhysicalCoverage:null`. Os números `resolved` são handles de malhas/instâncias; não são o numerador da aceitação. O denominador físico tem de incluir todos os objetos suportados, incluindo famílias não resolvidas e objetos não listados. Não excluir portas/janelas por serem difíceis.

O mapa contém também uma lista explícita de módulos com **fallback de contacto** para malhas físicas sem tipo/nome: responde no ponto tocado, sem mover geometria e sem roubar ações nativas. Janelas/portas/guarda-corpos não ficam excluídos só por pertencerem a uma construção. Superfícies horizontais ao nível dos pés mantêm o clique para andar. Efeitos transparentes, fundos e donos de ações nativas ficam fora deste fallback. Uma tag `userData.kind` válida prevalece sobre `object`.

Famílias a refinar/confirmar estão em `coverage.unresolvedFamilies`: plantas da pérgola/jardim, divisão das janelas traseiras/laterais, janelas do estúdio, portas móveis do metro/elevador, alguns candeeiros/floreiras e W5. Onde o fallback se aplica já há contacto genérico, mas não se deve declarar a classificação específica nem contagem física confirmadas. Portas móveis conservam a animação do proprietário; o contacto genérico nunca as desloca. A instrumentação indica a linha onde colocar `userData.kind` nos anónimos; os casos fundidos usam volumes/proxies ou apenas a bolha de contacto.

## Integração e revisão do Claude

Aplicar os hunks de `main.js` juntamente com W2/W0, sem substituir ficheiros completos. O patch modifica a assinatura de `labelFor(o, hit)` e os dois chamadores; acrescenta reação apenas após os caminhos nativos. `beforeUpdate` precede `world.update`, `update` segue `room.update`. O objeto de frame é criado uma vez. A propriedade `interactions` só entra na superfície `?test`.

Os nomes/tags de furniture/trees/ruins/arcade são diffs independentes. O hook de `world.js` instala o mapa antes da recolha do batcher. O fallback deixa `userData.interaction` nos objetos: o batcher conservador atual deve ignorá-los. Isso pode reduzir a poupança do batching; medir a troca, sem prometer simultaneamente interatividade individual e fusão indiscriminada.

Checklist de aceitação a executar pelo Claude:

1. `node --check` em cada JS novo, `npm test`, `npm run serve` e consola limpa.
2. Clique/E/toque em cada tipo, incluindo árvore, janela transparente e guarda-corpos fundido; sentar/falar/chapada e abrir apps preservados.
3. Repetir rapidamente, interromper por afastamento, reduzir movimento, silenciar som, iniciar missão séria, destruir runtime: sem offsets residuais nem nós ligados.
4. Medir update ativo/inativo, draw calls/triângulos com e sem reação, high/medium/low e batching.
5. Contar objetos físicos únicos, completar famílias não resolvidas e calcular `objetos com reação nova ou nativa / todos os objetos elegíveis`. Só aceitar ≥0,80 depois disso.

## Relatório (≤250 palavras)

Entreguei um motor de reações curtas com 15 tipos, som Web Audio sintetizado e espacializado, feedback pixel localizado, movimento físico opcional e pool de 12 reações. Preserva as ações de sentar, falar, chapada e aplicações. Reage só a pedido, com alcance de 4,5 m, silêncio para a missão séria e recuperação do estado original. Não acrescenta luzes nem texturas.

O mapa referencia nomes, raízes, volumes e linhas dos módulos originais; inclui candeeiros/bins/balizadores, árvores, sinais, bancos, ecrãs, portas/janelas, guarda-corpos, fonte e ruínas. O fallback explícito dá contacto genérico aos restantes props físicos dos módulos listados. A cobertura física de 80% não está certificada: classificações a refinar estão listadas, sem confundir partes de uma malha com objetos.

Integração está em `tools/w4-integration.patch`: import/instância, JSON same-origin, caminhos de clique/prompts, remoção de offsets antes do mundo e aplicação depois, além de nomes/tags. A bolha tem um draw call/96 triângulos máximos por construção; medições renderer, tempos e testes ficam integralmente para Claude. Localizações abrangem o campus; carro com reação física em `(−44,−22,8)`, fonte em `(46,29)`.
