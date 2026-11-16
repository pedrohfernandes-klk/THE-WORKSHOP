# Comboio1 — três estações

## Entrega (validação reservada a Claude)

Carruagem PBR caminhável entre Campus (86,29), Mercado (115,37) e Marginal (32,81), com chão a0,35m, bancos utilizáveis, varões, pegas, portas e cais próprios. Janelas abertas para o campus real. Sem importação de mundos surreais, Feira ou ritual do Hall.

Percursos18s; porrada entre dois passageiros pode provocar arrancada de4s em quatro de cada cinco viagens. O visitante participa apenas se quiser. Impulso oposto ao movimento0,75m/0,3s, limitado pelas colisões locais; FOV e inclinação curtos. Movimento reduzido conserva transporte, sons e paisagem, sem impulso nem oscilação.

Quatro slots existentes, tortoise/raccoon/cat/walrus, são atribuídos inicialmente antes da entrada; nunca se teletransportam personagens visivelmente. Se o carregamento terminar depois da entrada, só embarcam personagens que já chegaram ao cais. As posições originais são guardadas para dispose. O elenco não aumenta. Estátuas preservam a pose enquanto o veículo transporta os atores.

Anúncios em português, incluindo «Por motivos de porrada, vamos acelerar.». Voz local pt-PT quando disponível, admitida pelo broker; caso contrário, legenda. Música96BPM/A menor pentatónica, síntese local e broker S.

Sete batches geométricos do módulo, sem contar os personagens existentes. Não são métricas medidas. Testes automatizados executados após autorização:190/190 passaram na cópia isolada main7f17b2b+A (181debase+9novos). Verificação sintática dos6JS envolvidos passou. Browser, audição, consola e mediçõesGPU continuam pendentes de Claude.

## Integração

Copiar assets/gallery/spaces/tram-ride.js e assets/gallery/commuter-score.js. Aplicar tools/tram-commuter-integration.patch sobre main7f17b2b verificado, compondo eventuais alterações posteriores de estátuas. Patch único LF: world regista módulo; metro oculta carruagens antigas; controls transporta posição/bancos em coordenadas locais; main liga transporte/impulso e restaura FOV/lean depois de renderizar. O patch não importa tram-worlds.js nem tram-score.js.

API scene.userData.tramRide: initializePassengers(actors,beforeEntry), board(n), leave(n), hasPassenger(n), depart(), getStation(id), carrier, phase, station e dispose(). Main passa actors reais apenas depois de worldReady e a autorização beforeEntry é !state.entered. CombatAPI de #139 fornece startScripted/getScriptedResult/getVisitorStatus. Não existe dependência de rotinas/Feira.

## Guião de aceitação (não executado)

1. Entrar no Campus, caminhar pelo cais e cruzar a porta; percorrer o corredor e sentar/levantar em cada banco.
2. Partir de pé, andar durante uma curva e verificar chão estável, sem atravessar paredes/bancos; repetir sentado e durante levantar.
3. Fazer Campus→Mercado→Marginal→Campus, saindo a pé em cada estação. Confirmar ligações aos pavimentos existentes e abertura completa antes de sair.
4. Nas quatro primeiras viagens, observar a porrada se os atores estão disponíveis; não clicar neles e verificar que o visitante nunca é obrigado a combater. Participar depois numa viagem separada.
5. Durante arrancada confirmar deslocamento≤1m, duração≤0,3s, contra o avanço, sem atravessar banco/parede. Confirmar que FOV/roll regressam exatamente ao valor anterior.
6. Ativar movimento reduzido e repetir: sem impulso, roll, FOV ou malas oscilantes; percurso e áudio continuam.
7. Ativar estátuas durante viagem: atores imóveis na pose, transportados com a carruagem; desativar sem saltos.
8. Mute e silêncio do Hall cancelam anúncios/notas; sem pt-PT local, legenda disponível e nenhum pedido externo de voz.
9. Carregamento tardio após entrada não desloca atores visivelmente; admite viagem sozinho. Medir chamadas/triângulos e erros na consola em cada qualidade.

Limite explícito: garantia de porrada depende dos quatro slots disponíveis, não ocupados por outra ação nem congelados. A recusa legítima de combatAPI não é tratada como combate concluído.

## Revisão A — roda e segurança de saída

Os dois primeiros passageiros lutam na extremidade da carruagem; dois espectadores completam a roda, virados para o centro durante o combate. A porta central e os bancos mantêm-se acessíveis. Nenhum personagem novo é criado. Em modo estátuas não se alteram poses nem orientação.

Se o visitante sair durante o fecho, a partida é cancelada e as portas reabrem no mesmo cais. O embarque lê controls.readPosition através de bindControls, sem usar a câmara de combate. O transporte acontece antes de combat.update; a câmara3/4 é aplicada/restaurada só durante render. A saídaNPC atualiza root, sombra, collider e translada os waypoints para o cais atual, eliminando o salto para a origem anterior.

O ctx recebe o EventTarget comum scene.userData.workshopEvents. Ao compor com economia, usar o mesmo ctx.events existente, nunca criar dois buses. Eventos são CustomEvent('workshop',{detail:{type,value}}), com tripId para deduplicar.

Hooks mínimos para B: carrierGroup, windowApertures (dados locais x/y/z/w/h/yaw), isVisitorAboard(), travelProgress e travelDuration. São apenas acesso; A não importa nem ativa mundos. B deve fornecer patch incremental separado após A.

Nove testes cobrem circuito, atraso de carregamento, restauro dos atores, movimento reduzido, impulso limitado, cancelamento ao sair, câmara independente e desembarque e colisões reais do carrier durante rotação/inércia. Executados com sucesso na cópia isolada.

## Correções durante QA autorizada

moveInWorld recebe agora carrierActive, uma lista reutilizada; o booleano anterior causava erro em execução. O teste do carrier cobre este caminho, colisão com parede, rotação90graus, piso.35 e impulso limitado. O corpo exterior deixou de ser alvo PARTIR: usam-se portas e luz interior, sempre com verificação de presença pelo controls. O pulsoFOV/roll dura apenas.45s; a arrancada e a inclinação dos passageiros mantêm4s. getVisitorPosition(out) expõe posição real sem alocação para B.

Registo integral da última execução: _dev/qa-tram/tram-test-results.txt. Nenhuma alteração foi aplicada aos ficheiros originais publicados.

Dependência final: #143 (ORGULHO), após #142 e #141 corrigidos. Aplicar apenas o patch consolidado de A; os mundos B são um PR separado. A composição preserva o diálogo da senha e um único barramento de eventos.

Validação da cadeia completa até A: npm test 213/213 passou; os seis JS de A passaram node --check; o patch passou git apply --check contra a etapa #143.
