# ESTÁTUAS — relatório

Base: main 7f17b2b (lote 4 publicado). Adicionar `statue-director.js`, aplicar `tools/statues-integration.patch` (UTF-8/LF). Originais de produção intactos; validação feita numa cópia isolada. npm test: 186/186 passaram (181 existentes + cinco novos), zero falhas; os 11 testes do gestor S permanecem intactos.

X e HUD congelam NPCs, pose, falas, filas, Fabinhe e combate. S continua a recuar; visitante, ambiente, clima e música continuam. Um pombo PBR pousa sobre o ator próximo após um segundo; ao descongelar, o comentário espera a fala/ação anterior terminar e respeita a memória de 600 segundos. Sem luz nova. Pombo: uma malha/material, um draw call previsto; medição e triângulos ficam para Claude.

Para pausar sons agendados sem perder envelopes, há um segundo AudioContext exclusivo de NPCs/combate. Ambos usam o mesmo gestor: 24 vozes, seis em primeiro plano, duas caudas de roubo; auditoria de teste soma os dois contextos. Tokens suspensos preservam a reserva e o relógio; continuam sujeitos ao roubo normal por prioridade global. O roubo mantém a cauda de 30 ms no relógio principal, também quando o transporte NPC está suspenso. O contexto principal nunca suspende. Cada contexto tem ganho mestre 0,45; o novo tem compressor próprio. Isto reserva margem, mas não constitui medição de picos.

TTS pausa apenas o proprietário conhecido; a capacidade real de retoma depende da implementação local do navegador. Suspensão Web Audio ocorre na fronteira de processamento de áudio, não numa amostra arbitrária. Mute/silêncio cancelam vozes mesmo congeladas. A retoma pode requerer novo gesto se o navegador recusar autoplay.

A base não contém figurantes/crowds adicionais: `scene.userData.npcStatues` continua o contrato obrigatório de L3. Não se afirma congelamento de módulos ainda inexistentes.

## QA de Claude

- Repetir `npm test` após integração: 186/186 passaram nesta cópia de main 7f17b2b + patch. A aceitação no browser continua com Claude.
- Congelar fala TTS, Fabinhe no refrão, queda, dominó, dueto e golpe; aguardar dez segundos e retomar. Comparar pose, fase e restante áudio; repetir rapidamente X.
- Caminhar, mudar clima e verificar música contínua durante a pausa. Confirmar S, HUD móvel e X sem interferência em campos de texto.
- Congelar e ativar silêncio/mute: confirmar silêncio real nos dois contextos; retomar sem ressuscitar som cancelado.
- Testar duas famílias de navegador com voz local; se pause/resume TTS falhar, não declarar esse critério aprovado.
- Com `?test`, verificar auditoria agregada, pico global 24/6/2 e vozes suspensas; medir margem da mistura e draw calls do pombo. Testar entrada sem áudio desbloqueado e primeiro gesto posterior.
- Conferir pombo em cabeças/chapéus diferentes, deslocação para fora de 40 m e desaparecimento ao retomar. Comentários não devem substituir a fala anterior.
