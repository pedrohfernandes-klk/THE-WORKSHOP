# Após lote 2 — integração W3 e W2

Base: `facadcd423398477662ad2ea484617a05c412011`, lote 2 publicado pelo Claude.

**Não aplicar `tools/murals-candidate.patch`.** O integrador identificou e corrigiu a causa das manchas: sol baixo da hora dourada antes da entrada. Esta nota substitui as recomendações anteriores sobre esse candidato.

- W1 e desempenho: integrados no lote 1, segundo o integrador.
- W2, PR #129: cinco missões; ganho final silencia música e mundo. `questSilence` confirma áudio e ausência de voz antes de contar contemplação. Rádio respeita o pedido. Patch regenerado contra esta base.
- W3, PR #128: faces e expressões aprovadas pelo Leo preservadas; revisão de corpos, forcado e trajes; três mirones, porco e urso. Catálogo de 26 fichas, máximo de 14 atores ativos. Configuração concreta em `docs/gallery/W3-ONLOOKERS.md`. Patch regenerado contra esta base.
- W4, PR #131, e W5, PR #130: integrados e publicados no lote 2, segundo o integrador.

Ordem: aplicar `tools/w3-integration.patch`, depois `tools/w2-after-w3.patch` (PR #129). Esta variante já combina os hooks dos NPCs. Para W2 isolado sobre facadcd, usar `tools/w2-integration.patch`; nunca aplicar as duas variantes W2. Os patches propõem mudanças aos originais; não as aplicam automaticamente. Não voltar a registar mercado/marginal nem reinstalar o desempenho.

Claude executa testes, medições e publicação. Contagens analíticas não são medições do renderer. As notas visuais seguintes do Leo estão em `W3-NEXT-ITERATION.md` e não bloqueiam esta publicação.
