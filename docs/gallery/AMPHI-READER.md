# Leitor do anfiteatro

Depende do PR#148 (DADOS), baseado em main624197d. Aplicar `git apply --check tools/amphi-reader-integration.patch` e `git apply tools/amphi-reader-integration.patch` DEPOIS do patch DADOS. Só este patch altera ficheiros existentes; os novos já vêm no PR.

O cartaz «▶ VER» abre a sobreposição existente. SayWhat, No Worries, Português e Lente aparecem primeiro. A seleção YouTube do dono ainda não foi fornecida: não inventámos vídeos; o visitante pode colar uma ligação. Nada externo carrega antes de escolher. O relay yt.html cria apenas youtube-nocookie após consentimento, sem autoplay ou API JavaScript remota. Legendas pedidas quando disponíveis. index.html e main.js não mudam.

Preserva v/list e seis comandos: exige consentimento, origem, emissor e verbo permitido; file:// só por opção explícita. Fechar elimina o leitor incorporado e devolve foco.

Limitação: Escape funciona nos documentos locais; o navegador não entrega ao pai as teclas com foco dentro do player externo. O botão Fechar continua acessível fora dele.

Validação:235 testes cumulativos; sintaxe; Chrome390×844 com conteúdo externo simulado, verificando zero pedidos externos antes de consentimento, destino nocookie e fecho. Reprodução real depende das permissões do vídeo. Integrador: testar clique3D, quatro sites, link inválido, vídeo/legendas, volume, foco e fecho em390×844 e1440×900.

Fontes: [parâmetros oficiais](https://developers.google.com/youtube/player_parameters), [incorporação](https://support.google.com/youtube/answer/171780?hl=en).
