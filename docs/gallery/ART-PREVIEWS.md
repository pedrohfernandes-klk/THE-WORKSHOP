# Previews das obras — ficheiros medidos

64 obras em assets/gallery/catalogue.js,63WebP e1JPEG, todas em assets/extracted ou assets/new. Não incluem texturasPBR. Originais intactos:9.404.288bytes. A referência30imagens/3,095MB não corresponde ao catálogo completo; classificar esses pedidos exige o registo de rede da sessão.

Gerados64previews WebP, sem corte, ampliação, alteração de conteúdo ou redesenho. Lanczos, aresta máxima512, qualidade78→58 e redução adicional apenas quando necessária para cumprir36.000bytes por ficheiro. PerfisICC preservados se existirem (nenhum dos64originais atuais contémICC). A composição e a proporção mantêm-se; a versão completa deve substituir a preview por proximidade.

| Conjunto | Bytes |
|---|---:|
| Originais completos | 9.404.288 |
|64previews completos |1.900.320|
| Maior preview |35.962|
| Manifesto |30.415|
|15maiores previews + manifesto |566.011|
|14quadros iniciais, originais |2.388.444|
|14quadros iniciais, previews + manifesto |471.673|

Redução de bytes da disposição inicial:80,3%, incluindo manifesto. Isto mede ficheiros em disco, não duração de transferência, tempo até Entrar, GPU ou FPS. Não prova a meta de entrada2s/JS1,3MB.

## Integração

Novo assets/gallery/previews/manifest.json contém bySrc[work.src]={preview,width,height,bytes,sha256,sourceSha256,...} e byId[work.id]=caminho. Todos os caminhos são relativos à raiz do site, compatíveis com self/CSP. Carregar apenas os quadros selecionados; não fazer preload dos64ficheiros. O produtor altera textures/main para preview imediata e upgrade do original após primeiro movimento e proximidade; esta entrega não edita esses ficheiros.

Gerar: python tools/build-art-previews.py
Verificar sem escrever: python tools/build-art-previews.py --check
Testar cobertura/digests/orçamento: node --test tests/art-previews.test.mjs

Pillow12.2.0/libwebp1.6.0; versões registadas no manifesto, sem timestamp. Bytes reproduzíveis com as mesmas versões. Gerador valida todos os originais antes de escrever; ficheiro ausente falha explicitamente sem produzir saída parcial. Os testes detetam previews/originais ausentes ou desatualizados e cobertura incompleta de WORKS.

Nenhuma imagem foi gerada por IA. Inspeção visual da preview Cadavre Expat confirma a composição completa; os testes verificam proporção e dimensões de todas.

## Validação concluída

Gerador --check regenerou os64previews e confirmou igualdade byte a byte. Teste de origem ausente passou sem saída parcial. npm test na cópia isolada _dev/qa-art-previews:215/215 passaram. Log: _dev/qa-art-previews/art-preview-test-results.txt. Os originais continuam com os SHA256 registados.
