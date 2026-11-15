# W3 — Mirones e personalidades opt-in

## Estado da entrega

Código novo: `assets/gallery/npc-onlookers.js`. Integração reunida no NOVO `tools/w3-integration.patch`, que inclui também a proposta de modelos W3. **Base do patch: main `facadcd423398477662ad2ea484617a05c412011`**, após integração W4/W5. Rebase efetuado por merge de texto contra snapshots, preservando as falas novas; aplicação e execução ficam para Claude. Nenhum ficheiro original foi alterado. Não foram executados testes, navegador ou medições: pertencem ao integrador por instrução do dono.

## Ativação concreta: catorze slots, cinco substituições

Definir antes de `createWorld(ctx)`:

```js
scene.userData.npcAssignments = [
  'bull', 'goat', 'tio_camisola', 'horse', 'cat', 'pig',
  'senhor_banho', 'cusco_roupao', 'tortoise', 'raccoon',
  'forcado', 'porco_fato', 'gordo', 'urso_treino'
];
```

Sem esta opção mantêm-se os catorze atores legados. A opção substitui cinco slots, não acrescenta atores. Os três mirones usam os slots exteriores 2, 6 e 7: nas proximidades de (-6,44.5), (-15,30) e (15,28). Porco e urso usam 11 e 13: (-21,35.6) e (7.6,41). As posições iniciais concretas incluem o primeiro ponto da patrulha original. Não usar os slots sentados ou interiores para estes cinco perfis. Os destinos não são garantidos sem validação no navegador.

## Comportamento e limites

Mirones observam chapadas, gestos ruidosos e início/derrota da cobra. Tentam manter 3–6 metros e escolher cobertura atrás de colunas/troncos estreitos. Se o visitante olha para eles, desviam a cara. Riso e apontar continuam no agendador original `hysterics`; não existe um segundo coro. Comentários próprios têm intervalo individual de 15 s e global de 5 s. O pedido de observação expira em 7 s.

Movimento máximo 0,7 m/s, raio doméstico 12 m, chão plano, segmento amostrado a cada 0,18 m. A navegação recebe **world real**, nunca um `ctx.world` inventado. Filtra obstáculos num quadrado de 32 m centrado no ponto inicial e conserva referências a colliders dinâmicos. Mais de 256 obstáculos locais desativa deslocação; nunca ignora obstáculos para ganhar velocidade. Considera no máximo oito coberturas, verifica uma rota por planeamento e permite um planeamento global a cada 0,8 s. Sem rota segura fica parado. Não é um pathfinder: pode não conseguir atingir 3–6 m. Não atravessa portas fechadas nem escadas. Revalida cada avanço e evita visitante/atores.

Porco cheira em breves movimentos da cabeça e ronca depois das frases. Urso abre os braços durante 1,1 s após conversa, com intervalo de 18 s; não move câmara, visitante ou collider. Sons de chapada/risada substituem o efeito genérico quando aplicável, com Web Audio sintetizado, oito vozes máximas, limpeza ao terminar, volume por distância e leitura tardia do contexto/bus/mute.

Fora de 40 m os comportamentos dormem. `reducedMotion` retira deslocação, espreitar animado, cheirar e abraço. `questQuiet` cancela comentários, deslocações e efeitos agendados, limpa presets e para vozes. A animação original tem prioridade sobre personalidade durante queda, perseguição, chapada, ocupação, recuperação do chapéu e gestos especiais. Não há geometria, textura, luz nem draw call novos. Não há objetos/arrays/closures criados por atualização; os nós de áudio são criados apenas ao disparar efeitos.

## Hooks para integrar preservando a main atual

1. Importar `createNpcPersonalities` em `spaces/npcs.js`. Declarar `let personalities = null` antes da construção; criar depois de atribuir `n.col`: `createNpcPersonalities(ctx, { npcs, castById, chooseLine, say })`.
2. Atualização: `personalities.before(dt, frame)` antes de `step`, `personalities.after(dt, frame)` depois. Manter `effects.update` do W3.
3. Exportar no retorno `setNavigation: personalities.setNavigation`. Em `main.js`, imediatamente depois de `world = w`: `w.modules.get('npcs')?.setNavigation?.(w)`.
4. `say`: chamar `onEvent('speech',n)` depois de atribuir `talkT`, **depois** do early return `questQuiet` de W2. `talk`: chamar `onEvent('talk',n)` apenas após guardas de queda/ocupação. `doSlap`: emitir `onEvent('slap',n)` uma vez. Não emitir a partir de `talkT`: isso criaria reações em cascata.
5. `startLaugh`: usar `sound('laugh',n)` como substituto condicional do som original; resposta a chapada idem `sound('slap',n)`. O helper devolve true quando assume/suprime o som de um perfil aplicável.
6. `laughLine`: novos perfis usam `bystander_laugh` do cast. Frases contextuais protegidas devem ser excluídas pelo picker quando não existe alvo autorizado; não as dirigir ao visitante.
7. Director legado: iniciar argumento apenas se os slots ainda são horse/cat; perseguir apenas pigeon/pig; monólogo GO apenas goat. Assim trocar um slot não lhe atribui cenas de outra personagem.
8. Em `floorsnake.js`, publicar um objeto reutilizado `scene.userData.snakeEvent = {time:0,x:CX,z:CZ,kind:''}`. `time` é um contador monotónico de eventos, não relógio. `startRound` incrementa time e escreve `kind:'start'`, x/z do visitante; `finish` incrementa e escreve `kind:'win'|'lose'`. O helper reage só a start/lose e consome eventos durante quiet sem os repetir mais tarde.
9. Preservar `hit.material.visible = false`, não `hit.visible = false`; merge de modelo deve manter a precedência de `entry.model` sobre defaults legados. Ao desmontar manualmente, chamar `personalities.dispose()` para parar vozes/presets; o mundo atual não possui lifecycle público de desmontagem.

## QA exclusivamente Claude

Aplicação do patch contra a base identificada, sintaxe/imports e testes existentes; verificar os cinco perfis no preset acima e os catorze legados sem opção; nenhuma regressão em falar/sentar/chapada; silêncio total W2 durante efeitos ativos; movimento junto a coluna/árvore e porta fechada; snake start/lose reais; ausência de caminho implica ficar parado; reducedMotion; mute antes e durante som; navegador sem erros; medir custo e frame máximo em qualidade low/medium/high. Budget de desenho acrescentado pelo helper: 0; custo CPU e contagem total de NPCs ainda não medidos.

### Convivência com W2

W2 e W3 tocam `say`, `audioOn`/sons e o ciclo dos NPCs. Integrar os dois patches em conjunto, independentemente da ordem: a guarda `questQuiet` de W2 precede qualquer efeito/`onEvent` em `say`; a limpeza de fala já ativa de W2 permanece no ciclo; conservar os hooks before/after de W3. W3 protege as suas próprias vozes, mas não substitui a supressão global de voz/som do W2. O collider usa a maior largura de torso entre perfil legado e modelo, com a escala limitada do rig, sem usar o comprimento de adereços como pau de selfie.

Ordem de integração desta revisão: **W3 → W2**, usando exclusivamente `tools/w2-after-w3.patch` do PR #129 (não aplicar também `tools/w2-integration.patch`). O rebase W3 preserva imports e hooks W4/W5 da main `facadcd`.
