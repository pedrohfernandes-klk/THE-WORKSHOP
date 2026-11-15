# Comédia + Fabinhe — segunda entrega

Depende de **S, PR #137, incluindo o seu patch aplicado**. Base de origem: `cf2c73a`. Aplicar apenas `tools/comedy-fabinhe-integration.patch`: um diff incremental para NPCs, modelos e fichas, já composto com S. Não reaplicar propostas antigas de comédia ou Fabinhe.

Entrego 27 corpora: 207–210 falas por principal e 42 por secundária, 3 462 entradas no total, além de 25 duetos, dez piadas recorrentes e callbacks. Carregamento a menos de 40 m, até duas solicitações simultâneas; cada corpus ocupa menos de 30 KB. «Ganda sapa!», «porrada», «trombil» e as falas protegidas do dono mantêm-se.

O motor impede repetição global durante 600 s, sobe o grau com insistência/chapadas e espaça cenas em 20 s. Remates usam a preparação sonora de S; quedas propagam-se por contacto a, no máximo, dois vizinhos. Silêncio cancela filas e eventos pendentes.

Fabinhe substitui o galo por defeito em (15, 28), conservando 14 atores. Dois dentes, boné lateral e fato de treino largo; canção literal sobre melodia original, até 8,2 s. Voz local portuguesa ou inglesa; sem voz local, legenda e síntese instrumental. TTS é fala com prosódia, não canto natural garantido.

**Sem testes, audição ou medições executados.** Claude verifica os testes fornecidos, percurso de cinco minutos, consola, LF, draw calls/triângulos e orçamento de update. Os valores editoriais não são gargalhadas medidas. Leo avalia apresentação e graça. A integração combina as correções de cancelamento, distância e confirmação explícita de fala; estátuas continuam desativadas até aceitação própria.
