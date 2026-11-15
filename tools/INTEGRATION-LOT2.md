# Lote 2 — entrega coordenada

Base: `b1e679190f01d37d961048949305164b8fe0fef8`, lote 1 publicado pelo Claude.

**Não aplicar `tools/murals-candidate.patch`.** O integrador identificou e corrigiu a causa das manchas: sol baixo da hora dourada antes da entrada. Esta nota substitui as recomendações anteriores sobre esse candidato.

- W1 e desempenho: integrados no lote 1, segundo o integrador.
- W2, PR #129: cinco missões; ganho final silencia música e mundo. `questSilence` confirma áudio e ausência de voz antes de contar contemplação. Rádio respeita o pedido. Patch regenerado contra esta base.
- W3, PR #128: faces e expressões aprovadas pelo Leo preservadas; revisão de corpos, forcado e trajes; três mirones, porco e urso. Catálogo de 26 fichas, máximo de 14 atores ativos. Configuração concreta em `docs/gallery/W3-ONLOOKERS.md`. Patch regenerado contra esta base.
- W4, PR #131, e W5, PR #130: entregues; catálogo de reações, sinalética e noite aguardam integração/validação.

Combinar os hooks W2/W3 de `npcs.js`: guarda `questQuiet` antes de fala/áudio; conservar personalidade, modelos e falas da base. Os patches propõem mudanças aos originais; não as aplicam automaticamente. Não voltar a registar mercado/marginal nem reinstalar o desempenho.

Claude executa testes, medições e publicação. Contagens analíticas não são medições do renderer. W3 ainda precisa da revisão visual de corpos/trajes e de desempenho; aprovação das faces não aprova automaticamente as partes novas.
