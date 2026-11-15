# Entrega coordenada ao Claude

Base: `main` em `c8937e1bc3718e1f806338356b48576bf69ee7e8`. Os seis PRs contêm apenas ficheiros novos; alterações aos originais estão nos patches, por aplicar.

| Pacote | PR | Estado |
|---|---|---|
| W1 — mercado e marginal | [126](https://github.com/pedrohfernandes-klk/THE-WORKSHOP/pull/126) | Código e ligações pedonais propostos |
| Desempenho e QA | [127](https://github.com/pedrohfernandes-klk/THE-WORKSHOP/pull/127) | Instrumentação, corte conservador do espelho, blink e candidato para murais |
| W3 — personagens | [128](https://github.com/pedrohfernandes-klk/THE-WORKSHOP/pull/128) | Modelo articulado, casting e patch de integração |
| W2 — missões | [129](https://github.com/pedrohfernandes-klk/THE-WORKSHOP/pull/129) | Cinco missões, atores e silêncio do Hall |
| W5 — design | [130](https://github.com/pedrohfernandes-klk/THE-WORKSHOP/pull/130) | Interface, orientação e luz noturna sem novas luzes reais |
| W4 — interatividade | [131](https://github.com/pedrohfernandes-klk/THE-WORKSHOP/pull/131) | Reações e inventário; cobertura física por certificar |

## Compor os patches

Não aplicar cegamente os patches em sequência: partilham pontos de inserção na base. Compor os registos de espaços numa única lista: W1 adiciona mercado/marginal; W2 arraial/quests; W5 substitui signage por wayfinding e adiciona lightpools. Evitar duplicados.

Combinar os imports e hooks de main.js. Instalar o mapa W4 antes do batching. Preservar o silêncio W2 ao integrar o modelo W3 em npcs.js. Os hitboxes W3 precisam de `visible=true` e `material.visible=false`. O candidato dos murais só deve avançar após isolamento A/B.

## Aceitação pendente

Por instrução do dono, Claude executa todos os testes e medições. Não estão certificados: 60 fps, tempos de entrada, chamadas/triângulos renderizados, cobertura de 80%, contraste em contexto ou resultado fotorrealista. Cada relatório define a verificação necessária. Leo aprova design/som; a sala revê comédia. Nenhum PR foi integrado ou publicado.

