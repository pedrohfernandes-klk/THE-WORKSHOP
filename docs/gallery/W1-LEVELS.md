# W1 — Mercado e Marginal

**Código pronto para integração; testes e medições reservados ao Claude por instrução do dono.** Nenhum ficheiro existente foi alterado.

Mercado: `(102,32)`, chão `y=0,35`, bancas com toldos, fruta, peixe, balança, pastelaria e pombos. Cinco ações curtas e banco acessível. Entrada pela plataforma do metro, `x=83,8…93`, `z=40…43`: sobreposição de 0,78 m com a plataforma e 1 m com o mercado. É uma passagem de nível; o metro atual não tem colisão do veículo. Claude deve verificar o cruzamento com o veículo em circulação.

Marginal: `(4,80)`, chão `y=0`, passeio, quatro bancos, cinco candeeiros, quiosque, luneta, boia e canal. Acesso pelo alpendre da escola em `(21,54,65)`, contornando a parede leste por `x=24…27`. Sobreposições de 1 m entre regiões novas e com o alpendre. Não atravessa salas nem paredes.

Cada zona usa **sete meshes materiais fundidos**; proxies de interação têm material invisível. Isto é uma contagem estrutural, **não** `renderer.info.render`. Triângulos renderizados, tempo de atualização e consola: **pendentes de medição**. Sem novas texturas ou luzes; toldos reagem à tempestade, emissivos aquecem à noite; movimento reduzido imobiliza toldos. Atualizações dormem além de 40 m.

Integração: aplicar `tools/w1-integration.patch`, que acrescenta os módulos em `SPACES` e os nomes em `AREAS`; `main.js` já trata `sit`. W2: caixa em `(96,35)`, ação `mercado/nata`, aproximação livre `(96,37,2)`.

Acabamento revisto: a água deixa de usar padrões de mármore, passa a dielétrico com ondulação de normais filtrada, rugosidade sensível à tempestade e reflexos do ambiente existente. Sem novo passe de reflexão, textura ou triângulo; movimento reduzido fixa a ondulação. Não há refração nem reflexo planar dos objetos próximos.

Claude: executar sintaxe, suites, percurso a pé desde praça, cliques/assentos, três qualidades, noite/tempestade, movimento reduzido e contadores de renderização. Validar especialmente canal contra terreno, shader da água e travessia do metro. Leo valida composição/som; argumentistas validam falas.
