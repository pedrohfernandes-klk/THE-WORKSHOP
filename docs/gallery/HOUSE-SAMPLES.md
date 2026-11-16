# Seis sons fornecidos pelo dono

Depende dos balões#152, após148/149/150. Aplicar `git apply --check tools/house-samples-integration.patch` e `git apply tools/house-samples-integration.patch`. PatchLF sómain; não toca alcance2,1m nem o gestor de vozes. Helper importado após primeiro movimento real, amostras apenas quando usadas. Originais deDownloads intactos; não se alegaCC0.

Campainha acompanha senha certa, impacto acompanha contacto e um sopro cómico aparece raramente emKO. O primeiro uso automático aquece o buffer sem tocar atrasado: o som sintetizado continua imediato. Vozes curtas alternam após cada cinco chapadas, esperando uma pausa entre3–12s, sem interromper fala próxima e com90s entre remates. Eventos expirados e silêncio não acumulam reproduções futuras.

Uma amostra de cada vez; intervalos8s globais e30–90s por som. Usa o broker existente, prioridade1, HRTF até40m quando existe posição. Mute/Hall/quiet do comboio cortam; estátuas calam vozes. Respeita fade30ms do roubo de voz. Nenhum AudioContext adicional. Seis ficheiros entre22.272 e114.566bytes;WAV convertido paraMP3mono, pack longo paraOpusmono12kbps.

Validação:9 testes específicos e256 cumulativos; sintaxe e aplicação do patch. Não houve audição pelo agente. Integrador deve ouvir volumes/compressão/timing em `tools/house-samples-preview.html`. O pack anunciante95,9s exige curadoria de offset/duração até4s, permanece manual e nunca toca inteiro no jogo. Esse excerto ainda falta escolher; os outros cinco sons já têm ligações contextuais.

**Integrador (após #155).**
- O anunciante passou a `announcer-rounds.mp3`: 6,8 s, 54 KB, MP3 mono. Tem as quatro chamadas cortadas do pacote: First round (28,22 s), Second round (31,73 s), Third round (35,32 s) e Final round (75,28 s), separadas por 0,3 s.
- Descodifica em todos os browsers, incluindo Safari anterior ao 18.4.
- Guarda 6,8 s em memória em vez de 95,9 s, cerca de 18 MB a menos.
- O `.opus` do pacote completo saiu do repositório.
- Os offsets estão em `ROUND_CALLS`, no `main.js`.
- Uma amostra que falhe a carregar só volta a ser pedida 30 s depois.
