# Senha da casa — entrega ROUND2

Quatro porteiros estáticos e painéis opacos bloqueiam as entradas reais: Studio **(-11,44)**; Arcade **(11,44)**; edifício escolar **(0,56)**; cinema **(0,4.96), chão7.2**. O edifício escolar recebe apenas um distintivo geométrico, sem placa escrita. Os porteiros têm geometria de corpo, roupa, rosto e olhos; são modelos estáticos próprios, não o elenco animado. Acabamento visual ainda por validar.

`tools/password-integration.patch` altera apenas `main.js` (bus `ctx.events`, bloqueio de controlos durante o diálogo) e `world.js` (registo `passwords`). Aplicar sobre `_dev/ROUND2-base`. Os novos módulos/CSS seguem no mesmo pacote. Não depende de níveis: só a senha desbloqueia. Não há conservação entre sessões, nem pedido externo.

São22 frases, com as duas primeiras literais do dono;22.ª: «Pôs a ___ no trombone.». Uma resposta errada avança o enunciado sem apagar erros. Aceita «boca»/«a boca», espaços e maiúsculas. Três erros dão a pista literal. Três edifícios distintos acertados consecutivamente à primeira revelam a senha da casa. O Wi-Fi é consumido só quando o diálogo abre. Emite `workshop`/`password-ok` com `buildingId`, `firstTry`, `eventId`.

Estimativa estrutural: **8draw calls, menos de12mil triângulos**, incluindo quatro porteiros e quatro portas; proxies não desenham. Sem luzes novas. Oito comparações de proximidade/entrada mantêm colisões, sem alocações por frame; porteiros invisíveis além40m. Saída automática temporária não concede recompensa nem desbloqueio.

**Não testado:** cinco testes de lógica escritos, sem execução. Claude deve medir renderer, testar teclado/Enter/Esc, foco restaurado,390×844, entradas/saídas e cinema sem colisão no Hall. Avaliar porteiros visualmente antes de aprovação artística.
