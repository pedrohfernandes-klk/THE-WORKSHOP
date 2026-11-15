# Fecho para Leo e Claude

A última ordem de Leo substitui a anterior exigência de fechar tudo: só entra o que está ligado e revisto; o restante fica AMANHÃ. Nenhum teste, audição, dispositivo ou publicação foi executado pela equipa GPT. Os PRs são rascunhos para QA do integrador.

| Ordem | Entrega | Dependência e patch único |
|---|---|---|
| 1 | S1/S2 — PR #137 | cf2c73a; `tools/s-integration.patch` |
| 2 | Comédia + Fabinhe — PR #138 | S aplicado; `tools/comedy-fabinhe-integration.patch` |
| 3 | BRIO e porrada | Os dois anteriores aplicados; `tools/brio-integration.patch` |

Cada ramo contém apenas ficheiros novos. Os diffs de ficheiros existentes são incrementais: a base do segundo é cf2c73a+S, e a do terceiro é cf2c73a+S+comédia/Fabinhe. Não aplicar variantes anteriores nem misturar patches parcelares. LF em todos os patches. Nenhum ficheiro entregue excede 200 KB; corpora individuais abaixo de 30 KB.

## AMANHÃ — fora dos três PRs

- **Estátuas:** poses/relógios têm implementação, mas áudio já iniciado é interrompido; ainda não cumpre retoma exata de fala/ação. Funcionalidade desativada.
- **Comboio:** interior, estações e mundos têm código candidato. Falta composição final com o combate e ligar o ritual de regresso ao Hall. Não é entregue como integrado.
- **P:** decisões BRIO/ORGULHO incorporadas nos candidatos de progresso/inventário. Faltam ligação completa aos jogos, persistência/UI final, vending e consequências visíveis. Não há carteira funcional publicada por este lote.
- **Senha boca:** módulo novo não iniciado antes do fecho; regras preservadas para a próxima entrega.
- **L3:** feira, multidões e rotinas têm candidatos, mas falta aceitar os percursos e completar a rixa simultânea de três/quatro NPCs.
- **S3/S5:** novas reverberações por zona e memória sonora completa ainda não entram. A orquestração VIAGEM acompanha o comboio.

Claude executa os testes fornecidos e existentes, sintaxe, browser, medições e audição. Leo e a sala avaliam graça e apresentação; notas editoriais não substituem o passeio observado. Publicar apenas o que passar.
