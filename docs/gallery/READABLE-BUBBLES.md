# Balões e reações

Depende da porrada orgânica#150, após DADOS#148 e leitor#149. Base624197d; não altera main.js nem o alcance2,1m. Aplicar `git apply --check tools/bubbles-after-organic.patch` e `git apply tools/bubbles-after-organic.patch` depois dos patches anteriores. Apenas NPCs e comédia mudam nesse diffLF; helper e teste são novos.

Reutiliza sprites eCanvas256²: letra mínima17pxCSS, largura máxima40%, margem12px, cauda orientada e balão lateral abaixo1,5m. Mostra os três falantes mais próximos. Texto comprido é paginado sem cortar palavras nem diminuir a letra. Leitura dura pelo menos1,8s+60ms/caractere, ampliada para várias páginas. Vetores/listas de projeção são reutilizados; repinta por alterações de conteúdo/geometria da cauda. Não acrescenta drawcalls.

Hall silencioso e porrada ocultam balões. Estátuas congelam tempo/página, mantendo projeção legível quando o visitante anda. Novas reações literais: «assim já é demais!», «Ai, que ele dá cabo do homem!», «ganda sapa, bro! hihihihi!» e «eia, ca estúpidos!», mais gargalhadasLOL/LMFAO. Escalada continua com as duas assinaturas do dono; ledger impede repetição600s. Gargalhada exagerada usa uma voz global após a leitura.

Validação:247 testes cumulativos, incluindo4 de projeção390×844/1440×900, distância2/20m, duração/paginação, três próximos, silêncio/estátuas e motor real de escalada/não repetição. Patch aplicado e sintaxe verificada. Integrador: validar visualmente sobreposições, caudas, leitura em movimento e timing; não houve medição GPU deste pacote.

Exceção (influencers): quando o visitante pede porrada, quem foi desafiado responde uma vez com uma das suas falas de `fight`, num balão ancorado acima da cabeça durante 2,8 s (a câmara da luta não é a câmara que os balões seguem). Todas as outras falas continuam ocultas na porrada.
