# Medição — entrega ao integrador

Base: `c8937e1bc3718e1f806338356b48576bf69ee7e8` (`main`). Por decisão do dono, todos os testes e medições pertencem ao Claude. **Não existem resultados de GPU nesta entrega.** Não confundir orçamento de geometria com `renderer.info.render` medido.

## Instalação

1. Rever/aplicar `tools/performance-integration.patch`. Regista duas marcas apenas com `?test`, mantém o texto ENTRAR a pelo menos 0,55 de opacidade, instala o corte do espelho e remove a alocação periódica da janela estatística do governador. Não muda patamares de qualidade.
2. Executar `npm test`, `node --check` nos JS novos e `npm run serve` conforme o processo do integrador.
3. Abrir `http://localhost:8080/?test&quality=medium&nobatch`. O `?test` é obrigatório: o projeto só expõe `window.__gallery` neste modo.
4. Colar o conteúdo completo de `tools/measure.js` na consola. Não requer CDN, pedidos externos ou alteração da CSP. O ficheiro `tools/` não é publicado pelo workflow Pages.

## Tempos de entrada

`workshopMeasure.startup()` devolve tempos desde o início da navegação: `entryReadyMs` quando o botão fica ativo; `campusBuiltMs` quando `createWorld` resolve. Esta segunda marca **não** significa que todas as texturas estejam carregadas nem que os shaders tenham sido compilados. Sem o patch, os tempos são `null`; colar tarde na consola não permite reconstruir o instante exato.

Fazer três navegações com cache limpa e três com cache quente em cada qualidade `high`, `medium`, `low`. Registar máquina, GPU, navegador, resolução, escala, cache, alimentação e rede. Não comparar localhost com produção como se fossem a mesma carga de rede. Em Pages usar o mesmo commit e registar os recursos mais lentos/pesados.

## FPS e desenho

Depois da entrada e de estabilizarem texturas/governador, olhar sempre na mesma direção durante cada amostra:

```js
workshopMeasure.start('Hall: centro, porta fora de vista', 20);
// Aguardar a amostra terminar antes de mudar de lugar.
workshopMeasure.start('Praça: piscina e Hall', 20);
// Repetir: jardim, anfiteatro, escola, metro, mercado, marginal.
workshopMeasure.download();
```

O medidor agrega `renderer.info.render.calls/triangles` de **todos os passes dentro de `post.render`**, incluindo espelhos e pós-processamento. A leitura simples após o último passe costuma contar apenas esse passe. O wrapper restaura `autoReset` mesmo se houver erro. Os tempos incluem intervalos longos reais; tabulações ocultas são excluídas. O medidor tem custo próprio pequeno, não mede GPU time nem garante 60 fps. Não abrir o catálogo durante uma amostra de movimento (o projeto reduz deliberadamente o ritmo de desenho).

Não iniciar duas amostras em simultâneo: `start` encerra a anterior. `dispose()` restaura o método e qualquer diagnóstico temporário. A captura tem limite de 36 000 frames, suficiente para 300 s a 120 Hz; para ecrãs mais rápidos usar 20 s.

## Artefactos pretos: ensaio causal

Mesma qualidade medium, posição, direção, tempo e exposição; capturar antes/depois:

```js
workshopMeasure.diagnostic('murals', false); // só murais ocultos
workshopMeasure.diagnostic('murals', true);  // restaurar
workshopMeasure.diagnostic('sun', false);    // só luz solar oculta
workshopMeasure.diagnostic('sun', true);     // restaurar
```

Depois ensaiar ambas ocultas e voltar ao baseline. Não inferir causa de comparar duas recargas com meteorologia diferente. O código atual já elimina a luz direta nos materiais preparados do Hall (`room.js`, `prep`), e os murais não projetam sombras. Por isso, «512 px» ou «é o sol» não são diagnósticos demonstrados. Se ocultar murais resolver isoladamente, experimentar **separadamente** `tools/murals-candidate.patch`: oculta apenas os dois painéis exteriores enquanto a câmara está dentro do Hall. É mitigação candidata, não correção confirmada; validar limiar da porta e do elevador. Se não resolver, não aplicar. Investigar AO/normal pass, profundidade e materiais dos elementos afetados.

## Espelho e batching

Comparar baseline com patch do espelho, Hall ao fundo olhando para a porta e de costas, junto da porta, no limiar, no elevador e no exterior. O corte testa a abertura refletida, mantém ambiente/fachada, não atua durante atualização de sombras, nem em passes de override ou câmaras secundárias. O estado anterior de cada grupo é restaurado em `finally`. Não assumir poupança de «450 calls» sem medir. Confirmar reflexo da porta e ausência de desaparecimentos.

Repetir percurso com `?test&quality=medium&batch` e `?test&quality=medium&nobatch`, igualando meteorologia/governador. Aguardar `world.batchStats.done`, além da estabilização. Guardar contagens, screenshots e cliques/sentar. **Recomendação atual: manter batching desligado por defeito** até passar esta comparação. W4 marca objetos que animam e deve fazê-lo antes do batching; objetos interativos não podem ser fundidos e perder identidade.

## Governador

Guardar `environment.governor` no JSON, incluindo histórico. O patch corrige o histórico para registar a EMA anterior à mudança, em vez da EMA já reiniciada. Mede 60 s parado + percurso em cada tier. Só afinar limiares após comparar estabilidade, mudanças de nível e recuperação. Verificar a hipótese de falso «cap 30 Hz»: o algoritmo atual pode confundir GPU estável a ~33 ms com limite do ecrã. Não baixar qualidade só porque o monitor está limitado; não fixar esse cap sem evidência adicional. Nenhum patamar foi apresentado como calibrado.

## Cortes concretos propostos

| Custo identificado no código | Proposta ao integrador | Validação necessária |
|---|---|---|
| `hangInitial` espera todas as obras; loader usa sempre a origem e guarda texturas sem limite | Gerar derivados locais 512/1024 WebP, ≤200 KB cada, selecionados pelo tier; manter original para exportação. Carregar primeiro as obras visíveis, restantes por proximidade/gaze, com placeholder e erro explícito | Qualidade visual, links de exposições e cache com orçamento VRAM/LRU seguro (nunca destruir textura ainda usada) |
| Exemplos existentes: `chartres-light.webp` 572 040 B, `untitled.webp` 455 702 B | Derivados novos, sem substituir originais; limites por dimensão e bytes | Tamanhos e comparação visual pelo Claude |
| Medium já usa mapas 512; low já evita normal/roughness | Preservar 512 para materiais próximos; priorizar céu 1k; adiar céu 2k e texturas de zonas distantes | Não atribuir artefactos pretos à resolução sem ensaio |
| Todos os módulos são construídos no arranque do campus | Fase futura: manter chão/regions/colliders/shell críticos imediatos; adiar decoração de ruínas, metro, arraial, escola e novas zonas até raio de pré-carga ~60 m | Não adiar chão sob o visitante. Requer loader incremental, registo de pickables/owners e materiais lazy; não basta tirar nomes de SPACES |
| Reflexo repete campus invisível | Helper de abertura refletida entregue | Imagem e calls com porta visível/invisível |
| `trackCap` cria array e callback de ordenação | Janela auxiliar tipada pré-alocada no patch | Mesmas decisões com séries de frames de referência |

## Resultados a preencher pelo Claude

| Commit / dispositivo / tier / cache | Entrada ms | Campus construído ms | Zona / direção | FPS / p95 ms | Calls p50/p95 | Triângulos p50/p95 | Erros |
|---|---:|---:|---|---|---|---|---|
| Pendente | — | — | — | — | — | — | — |

## Relatório técnico (≤250 palavras)

Entregues `measure.js`, este protocolo, o helper `mirror-campus-gate.js`, o diff de integração e uma mitigação separada dos murais. O medidor exporta tempos marcados, intervalos, calls e triângulos agregados, GPU, qualidade, batching e histórico do governador. O helper atua apenas no reflexo do chão do Hall; não acrescenta geometria nem luzes. O diff mantém ENTRAR visível, remove a alocação periódica da janela do governador e corrige o valor registado antes da mudança de nível.

Integração: novo import junto de `createProps`; chamada `gateHallCampus` antes do `gate(room.floor, …)` existente; marcas em `worldReady` e `ready`. As linhas exatas de contexto estão em `performance-integration.patch`. O patch de murais é independente e condicionado ao ensaio A/B.

Posição: Hall, chão y=0, abertura z≈17,4. Draw calls e triângulos adicionados pelo helper: zero por construção; custos e poupanças do cenário não medidos. Testes, medição real, isolamento visual da causa, afinação dos patamares e aprovação final ficam com o Claude, por instrução do dono. Batching permanece opt-in. Streaming por proximidade e derivados de imagens são propostas concretas, ainda não implementadas.
