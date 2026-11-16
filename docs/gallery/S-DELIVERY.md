# S — primeira entrega da cadeia

Base: `cf2c73a70e8952a6712aa85b57390e21ce549430`. Dependências: nenhuma. Aplicar **apenas `tools/s-integration.patch`**, após acrescentar os ficheiros novos deste PR. O patch reúne áudio, música, efeitos, emissores e ligação ao `main.js`; não aplicar propostas parcelares antigas.

Entrego S1/S2: composição a 96 BPM em lá menor pentatónico, notas com admissão explícita, gestor global de 24 vozes sustentadas/seis foreground e duas reservas de fade. O roubo admite a nova voz imediatamente e termina a antiga em 30 ms. `preparePunchline()` baixa o fundo 12 dB durante 250 ms e abre um intervalo de 40 ms, incluindo as caudas partilhadas. O remate usa esse intervalo no PR seguinte; impactos não esperam por ele.

`audio.stats()` devolve `voices`, `foreground`, `fading`, `stolen`, `unmanaged`. Em `?test`, `audio.diagnostics()` distingue fontes Web Audio de vozes lógicas; `window.__gallery.audio` permite medir. Um som composto pode usar vários osciladores. TTS ocupa reserva, mas usa a síntese nativa: não atravessa o limitador Web Audio.

Sem novas malhas ou ficheiros de áudio. Sem medições de CPU, latência, draw calls ou audição; **testes não executados**, conforme divisão de trabalho. Testes do gestor estão incluídos para Claude, juntamente com a suíte existente. Verificar saturação, fades, fontes não geridas, mute, silêncio, mudança de separador e recuperação das ambiências.

**AMANHÃ:** reverberações novas por zona, memória sonora completa e afinação artística S3/S5. A roupa VIAGEM acompanha o PR do comboio. Não fazem parte da aceitação desta entrega.
