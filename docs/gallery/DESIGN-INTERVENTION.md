# W5 — forma para orientar, luz para respirar

**Proposta ao Leo. Aprovação de design e som pendente.** Base: `main`, commit `c8937e1bc3718e1f806338356b48576bf69ee7e8`. Só ficheiros novos; o patch contém alterações propostas, não aplicadas.

O site publicado foi solicitado à ferramenta de leitura web; a resposta foi «not accessible». Não houve inspeção visual no navegador. Esta auditoria é **de código e contrato**, baseada em `index.html`, `ui.js`, `world.js`, `signage.js`, `furniture.js`, `studio.js`, `arcade.js`, `terrace.js`, CANON e nos pacotes W1/W3. O Claude fará observação em produção, testes e medições conforme instrução do dono. Os “antes” seguintes descrevem comportamento implementado nas fontes, não screenshots observadas.

Os princípios do briefing entram como regras de trabalho, sem imitar nem falar em nome dos autores: estrutura honesta, cor funcional, espaço legível, emoção sem excesso de texto e ligações que se descobrem a pé. O CANON atual já suporta esta direção; não proponho um CANON v2.

## Dez intervenções

| # | Antes, nas fontes | Depois e porquê | Custo / estado |
|---|---|---|---|
| 1 | Entrada centrada com vários tratamentos de sombra, título, lede e legenda sobre a cena | Conservar o título, dar ao lede uma placa escura e uma única barra solar; botão largo e uma forma que muda de quadrado para círculo quando pronto. Um foco para entrar, sem nova frase | CSS entregue. Sem imagem, fonte ou animação nova; um ficheiro CSS local pequeno |
| 2 | A animação `blink` vai a opacidade zero | Integrar o patch W0 para mínimo 0,55; W5 dá fundo `ink` opaco ao botão. O rótulo continua legível durante a pausa | Correção W0, não duplicada no patch W5. Custo desprezável; validar composição real |
| 3 | Botões da prateleira superior medem 36 px em rato e 44 px em toque | 44 px sempre; foco de teclado separado, visível e sem deslocar o layout | CSS entregue, sem lógica nova; evita alvos demasiado pequenos |
| 4 | Placas a 92% e texto suave competem com fundos variáveis | Placas opacas `ink`, texto `paper`; acentos assinalam função, não substituem a leitura. Cor mais forma para não depender só da cor | CSS entregue. Paper/ink ≈15,3:1 por cálculo; alvo ≥4,5:1. Sem blur ou filtros novos |
| 5 | Nome da zona, controlos e catálogo partilham o topo no ecrã pequeno; etiquetas podem crescer muito | Faixa da zona abaixo dos controlos, catálogo limitado, marca compacta abaixo de 520 px; etiqueta com altura limitada e scroll | CSS entregue com breakpoints para 390×844 e 1440×900; validação de layout pelo Claude |
| 6 | `signage.js` gera muitas faces de texto, carrega fontes Instrument e tem uma gramática diferente do CANON | Substituir esse registo por `wayfinding`: postes reais em aço, esmalte e pedra, 14 pares únicos de círculo/quadrado/triângulo e cor. Clicar identifica o destino; na escola não há palavra nem clique narrado | 3 meshes materiais, limite geométrico conservador <6 mil triângulos. Sem CanvasTexture/fontes. Contagem de renderização pendente |
| 7 | A praça contém vários destinos e obstáculos; uma seta direta pode apontar através da piscina ou de uma parede | Incrustações pequenas nos pontos de decisão; os percursos contornam a piscina, seguem o corredor das ruínas, a passagem do metro e o exterior da escola | Incluído nos mesmos 3 batches. Não cria ruas pintadas nem novos corredores. Percurso e colisões pendentes |
| 8 | Os candeeiros têm lentes emissivas, mas isso não ilumina por si só o pavimento; as janelas usam vidro transparente | `lightpools`: treze poças suaves sob candeeiros reais e dois cartões recortados nas janelas existentes. Calor aproximado de 2700 K, superfície ainda visível, nenhum novo foco | 4 batches / 30 triângulos por construção, zero texturas ou luzes reais; só noite e células a ≤40 m. GPU/overdraw pendentes |
| 9 | Os NPCs atuais são montados em muitas peças, com letras e balões de escala distinta da interface | Integrar W3: silhuetas legíveis, um corpo articulado por personagem e expressões com pausa. O humano aparece no gesto, não em mais acessórios. Não acrescentar roupa/brilho redundante em W5 | Dependência W3, sem duplicar modelos. Seu teto de 20 calls precisa de medição; aprovação do casting pelo Leo |
| 10 | Muito estímulo pode competir com a obra, o vento e os momentos sérios | Não acrescentar som à sinalética nem pulsação aos cartões; preservar o silêncio do Hall e a missão séria W2. Catálogo perde sombras decorativas fortes e a faixa cromática diminui | CSS entregue; nenhum oscilador, agendamento ou loop sonoro novo. Direção sonora final do Leo |

## Gramática no chão

| Destino | Forma | Cor CANON |
|---|---|---|
| Hall | círculo | paper |
| Cinema | triângulo | paper |
| Terraço | quadrado | paper |
| Estúdio | quadrado | tangerine |
| Arcada | triângulo | tangerine |
| Jardim | círculo | signal |
| Anfiteatro | triângulo | signal |
| Zona sem palavras | quadrado | signal |
| Metro | quadrado | sea |
| Mercado | triângulo | sun |
| Marginal | círculo | sea |
| Ruínas | triângulo | sea |
| Praça | círculo | sun |
| Arraial | quadrado | sun |

É redundância forma/cor, não um código obrigatório para memorizar: a arquitetura continua a orientar; cada poste, exceto o da escola, diz o destino **apenas se o visitante pedir**. O Hall responde “Hall. Cinema pelo elevador.” Nenhum modal, tutorial ou HUD novo. O Skyliner não recebe caminho pedonal fictício: o módulo atual não fornece regiões caminháveis. A aviação também não é tratada como destino acessível.

As placas não são pixel art: são objetos PBR. Não há novo sprite decorativo só para cumprir a palavra «colagem». O unexpected já pertence às personagens, nata, touro e máquinas dos outros pacotes. Aqui, cortar é dar-lhes espaço.

## Luz e materiais

`wayfinding.js` usa `ctx.M.get` e `boxUV`, com aço escuro, esmalte simulado em plaster e pedra. Cores por vértice permitem fundir peças sem uma chamada por cor. Todas as coordenadas são em metros; os postes têm 1,7 m e plinto de 0,30 m. Os obstáculos são AABBs; as incrustações não colidem. A sinalética é estática: `update()` vazio.

`lightpools.js` é exclusivamente efeito luminoso: shader analítico sem textura, depth test ativo, depth write desligado, blending aditivo, fog, tomapping e conversão de cor. Não ilumina personagens nem lança sombras; não deve ser apresentado como iluminação física real. As janelas ficam junto dos vidros norte existentes do estúdio e da arcada. A luz não pisca. Quatro retângulos espaciais desligam desenho além de 40 m; `nightK` controla a transição. O fallback aceita `frame.weather` como string. Sem alocação intencional no update.

Não foram alterados sol, fog global, céu, exposição ou sombras existentes. O ajuste de luz global pertence à correção W0 e à avaliação do Leo; um decalque não deve mascarar um problema de exposição.

## Contraste e carregamento

Preservam-se todos os tokens CANON, IDs e classes. Não há fontes novas. O cálculo sRGB de `paper` sobre `ink` dá aproximadamente 15,3:1; o mesmo texto a opacidade 0,55, composto sobre o fundo opaco `ink`, dá aproximadamente 5,5:1. Estes são cálculos das cores prescritas, **não medições de screenshot**. Os acentos do CSS são bordas/indicadores ou texto sobre ink; texto pequeno permanece paper. O foco é sun sobre ink e ink sobre paper.

A ligação CSS adiciona um pequeno recurso local. Não prometo igualdade de tempo sem medir. A substituição de `signage` elimina as suas telas procedurais e pedidos próprios de fontes; o novo módulo não cria texturas. Os módulos do campus continuam a carregar depois do Hall no mecanismo existente. Comparar `entryReadyMs`, não só a duração de carregamento da página; aceitar a mudança apenas se não piorar a entrada além do ruído de medição.

## Integração

1. Rever `tools/w5-integration.patch`: `<link>` depois do `<style>` atual de `index.html`; em `SPACES`, trocar `signage` por `wayfinding` e acrescentar `lightpools`. O ficheiro original de sinalética não é apagado nem editado.
2. Integrar W1 (mercado/marginal) e W2 (registo arraial) antes de ativar os destinos correspondentes. Se esses pacotes forem adiados, retirar as entradas `market`, `quay`, `arraial` e respetivos waypoints num diff de integração, não deixar guias para zonas inexistentes.
3. Integrar W0 para o mínimo 0,55 de blink. Nenhuma alteração de `ui.js` é necessária.
4. Não aplicar cegamente vários hunks que acrescentam nomes a `SPACES`: combinar as listas sem duplicações.

## Aceitação entregue ao Claude

Sem testes executados, por decisão do dono. Verificar sintaxe, `npm test`, servidor local e consola; todos os cliques e percursos, incluindo paredes, bancos, porta do cinema e elevador; renderização high/medium/low; noite/golden/storm; ocultação >40 m e regresso; janelas vistas do norte sem tapar portas; ausência de spill das poças na água da marginal; importmap/CSP; contraste efetivo em todas as fases do botão e foco; zoom 200%; 390×844, 1440×900 e paisagem curta. Medir draw calls/triângulos por passe e totais. O total estrutural W5 é **7 batches visíveis no máximo**, abaixo do teto pedido de 16; passes auxiliares podem repetir desenhos. A contagem real fica pendente.

## Relatório (≤250 palavras)

Entregues interface `ui-v2.css`, sinalética `wayfinding.js`, luz noturna `lightpools.js`, este documento e diff de integração. A proposta preserva tokens e tipografia do CANON: superfícies legíveis, alvos de 44 px, foco visível e menos ornamento no catálogo. Substitui a sinalética textual antiga por formas e cores em materiais reais, com nomes só a pedido e nenhum texto na escola.

Sinalética distribuída pelo Hall, praça, pavilhões, jardim, anfiteatro, ruínas, metro, arraial, mercado e marginal; luz junto dos candeeiros da praça e marginal, e janelas norte dos pavilhões. Orçamento estrutural: 3 batches de sinalética e 4 de luz; as 15 superfícies luminosas têm 30 triângulos. Não são medições `renderer.info.render`.

O integrador liga o CSS após o estilo existente, troca `signage` por `wayfinding` e regista `lightpools`, conforme linhas do patch. W1/W2 fornecem os novos destinos; W0 corrige o blink. Não há mudanças em `ui.js`, novas fontes, texturas ou luzes reais.

Ficam pendentes auditoria visual do site publicado, todos os testes e medições, confirmação do tempo de entrada e aprovação do Leo. A leitura web do site falhou; não foi alegada observação visual nem aprovação inexistente.
