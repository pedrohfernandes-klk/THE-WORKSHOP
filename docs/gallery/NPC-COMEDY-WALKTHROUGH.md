# Ensaio de comédia — cinco minutos

Estado: guião de aceitação proposto; ainda não executado. A sala de argumentistas julga a escrita, Leo aprova apresentação e ritmo, Claude verifica o comportamento. Nenhuma pontuação editorial significa riso medido.

## Preparação

Usar uma sessão nova, relógio visível e elenco de ensaio com os pares dos duetos aprovados. Conservar o limite de 14 personagens. Desligar missões durante a primeira passagem; não desligar colisões, distâncias, cooldowns ou áudio espacial. Confirmar que o visitante pode sair a qualquer momento. Não iniciar cenas por simples carregamento.

O percurso exige 25 piadas diferentes: oito duetos completos, dez respostas contextuais e sete gags/callbacks. Preparação e remate da mesma piada contam como um único momento. Os oito duetos começam com pelo menos 20 segundos de intervalo; os restantes momentos ocupam os intervalos sem atropelar falas. Os prefixos d04, g02 e restantes identificam univocamente os IDs completos do manifesto entregue. Nenhum riso é garantido.

## Critério editorial

1: retirar; sem observação reconhecível ou apenas insulto. 2: ideia reconhecível, execução previsível. 3: aproveitável, mas falta viragem ou corte. 4: observação concreta, preparação clara, remate inesperado e encenável. 5: além disso, a reação visual acrescenta significado sem explicar a piada. Só 4–5 entram na seleção de ensaio; 1–3 voltam à escrita. A avaliação identifica a frase fraca e uma direção de reescrita, nunca atribui quatro automaticamente ao lote inteiro.

Cada dueto deve sobreviver à leitura sem vozes engraçadas. Cortar explicações depois do remate. Não confundir aumento de volume, insulto ou chapadas repetidas com progressão cómica. A pausa pertence à reação e à compreensão, não a um atraso fixo universal.

## Registo de aceitação

Por momento: anotar ID, hora real, emissor, destinatário, texto/gesto emitido, preparação percebida, pausa, remate, reação e interrupções. Distinguir riso observado, sorriso, compreensão sem riso e confusão. Se o remate não se percebe, registar a causa em vez de aumentar a frequência de falas.

Checkpoints obrigatórios: nenhuma fala repetida em 600 segundos, incluindo outros emissores e situações; nenhum dueto sobreposto; pelo menos 20 segundos entre inícios; no máximo três participantes na cadeia de riso; nenhuma personagem ri de si por engano; resposta às chapadas respeita o grau; nenhum alvo protegido ou pessoa real; regresso ao silêncio após o remate.

## Segunda passagem técnica

1. Repetir a mesma provocação com outro NPC e outro gatilho antes de dez minutos: a fala usada deve ficar indisponível; silêncio é preferível a repetição.
2. Interromper um dueto antes da resposta com a missão séria: apagar a fila e os sons, sem retomar o remate antigo quando o silêncio termina.
3. Afastar o visitante e derrubar o interlocutor antes do remate: não lançar uma fala fantasma fora de contexto.
4. Provocar um riso perto de todos os NPCs: a cadeia fica limitada e cada reação tem uma origem identificável.
5. Repetir insistência e chapadas em duas personagens: a memória local progride independentemente; o bloqueio das falas continua global.
6. Deixar passar exatamente 600 segundos no relógio de testes: a fala volta a ser elegível. O simples ato de a consultar não reinicia nem consome o prazo.

Os testes fornecidos em `tests/npc-comedy.test.mjs` são para execução por Claude. A validação visual, os custos de renderização e o tempo do update continuam pendentes.

## Percurso proposto: 25 piadas completas

Amostra de elenco (13 lugares, nunca acrescentar ao total ativo): `porco_fato`, `urso_treino`, `influencer`, `critico`, `tio`, `arrumador`, `tortoise`, `turista`, `pigeon`, `raccoon`, `cat`, `goat`, `mano`. Preparar uma distribuição caminhável que permita encontrar os pares; não teletransportar NPCs no meio do ensaio. Se os lugares existentes não permitirem este percurso em cinco minutos, o ensaio falha a preparação e deve ser reagendado, sem acelerar falas ou retirar cooldowns.

Os tempos são janelas de ensaio, não agendamento automático. A resposta contextual só entra depois do remate anterior e da reação. Cada dueto/gag completo é UM momento. Pausa de 0,4–0,8 s depois da fala terminar; ajustar por compreensão observada.

| Tempo | Momento | Preparação → remate | Reação e checkpoint |
|---|---|---|---|
| 0:00 | 1 · d04 reunião | Atraso à reunião → hibernação já é experiência profissional | Porco mantém seriedade; urso percebe tarde. |
| 0:10 | 2 · cat/approach | Aproximação casual → «Estava ocupado a não precisar de ti.» | Gato retoma descanso; sem perseguição verbal. |
| 0:20 | 3 · g02 espontâneo | Ensaio da espontaneidade → improviso marcado para amanhã | Telemóvel mantém-se pronto; absurdo de controlo. |
| 0:30 | 4 · cat/ignored | Visitante afasta-se → «Excelente. Uma conversa sem despesas.» | Alívio visível, não uma segunda chamada. |
| 0:40 | 5 · d06 emails | Pato não responde → é por isso que flutua | Urso responde como facto prático; pausa sem explicação. |
| 0:50 | 6 · cat/run | Passar a correr → «Essa pressa toda e ainda vais em pé.» | Gato fica instalado; contraste entre esforço e conforto. |
| 1:00 | 7 · g03 decisão | Cheiro a decisão → papel vazio significa reunião | Porco fareja; mano mostra a falta de conteúdo. |
| 1:10 | 8 · cat/jump | Salto diante do gato → «Fiz o mesmo com os olhos. Exige menos espaço.» | Movimento mínimo do olhar; não saltar também. |
| 1:20 | 9 · d13 câmara | Crítico diz que a câmara o olha → pelo menos trabalha de graça | Influencer aceita a vaidade como mão de obra. |
| 1:30 | 10 · cat/gesture8 | Gesto rude → «Eu também podia responder. Prefiro mobília.» | Gato escolhe olhar para o banco, sem escalada automática. |
| 1:40 | 11 · g05 parafuso | Falta um; depois sobra um → declarar resolvido | Pausa na contradição; não fingir reparação funcional. |
| 1:50 | 12 · cat/slap1 | Uma chapada → «Isto não é carinho. Nem tu tens jeito para marketing.» | Recuo curto; registar grau, não impor gargalhada. |
| 2:00 | 13 · d16 parede | Atalho garantido → parede apenas «recente» | Tio protege a certeza; arrumador olha para a parede. |
| 2:10 | 14 · cat/slap2 | Insistência física → «Isso já não é falta de jeito. É assinatura.» | Tom mais firme; não reutilizar resposta anterior. |
| 2:20 | 15 · g06 reserva | Lugar vazio contestado → preferência por ninguém | Usar revisão editorial aprovada; versão abstrata rejeitada. |
| 2:30 | 16 · cat/slap3 | Nova insistência → «A visita terminou. Falta-te perceber a saída.» | Encerrar interação; deixar recuperação antes de nova cena. |
| 2:40 | 17 · d17 previsão | Tio anuncia previsão → foi a chegada do sol | Tortoise dá espaço à revelação banal. |
| 2:50 | 18 · cat/sunny | Gato escolhe sombra → «O sol tornou-se insistente.» | Mesma mania aplicada ao tempo; sem voz elevada. |
| 3:00 | 19 · g07 migalha | Uma migalha chama outra → não deixar que comam sozinhas | Pigeon justifica o próprio apetite com solicitude. |
| 3:10 | 20 · cat/photo | Pedir foto → «Não me peças naturalidade. Já estou a fazer-te esse favor.» | Pose quase imóvel; lente vira a inconveniência. |
| 3:20 | 21 · d20 metro | Turista pede caminho → pão muda o empenho, não o percurso | Pigeon assume o interesse sem pudor. |
| 3:40 | 22 · g08 legenda | Leitura interpretativa → falta sal | Goat responde literalmente; crítico perde o enquadramento. |
| 4:00 | 23 · d21 perdidos | Dois perdidos → seguir quem não perguntar | Primeiro passo confiante, pausa ao não saber para onde. |
| 4:20 | 24 · g10 estacionar | Tio não se move → arrumador aprova a manobra | Gesto de estacionamento completo para resultado nulo. |
| 4:40 | 25 · d22 olhar | Crítico chama recusa do olhar → gato chama sesta | Última palavra curta; terminar com espaço e silêncio. |

As dez falas individuais são alvos editoriais do ensaio, não resultados garantidos pela ordem do selecionador. Claude deve expor seleção de fixtures no ambiente de QA ou registar as variantes efetivamente ouvidas; não alterar o jogo público para forçar estas falas. Se forem escolhidas outras, continuam a exigir dez piadas distintas e a mesma avaliação.

## Primeira revisão editorial do manifesto

Devolvidos à escrita: d03 (3/5, cliché das prestações), d05 (3/5, ternura sem remate concreto), d15 (3/5, fórmula «papel à medida»), d18 (3/5, desculpa previsível do árbitro), d19 (2/5, mero ralhete), d23 (2/5, última frase mata o trocadilho), g04 (3/5, adiar treino previsível), g06 (2/5, reserva de lugar para outro lugar não se compreende). Estas notas referem-se à primeira versão; manter histórico e voltar a ler as revisões.

Seleção forte nessa leitura: d06 e d20 (5/5, causalidade absurda muito clara); d08 (5/5, negação desmentida pelo instrumento); d16 e d24 (4/5, defesa concreta de certezas/burocracia); g02 e g05 (4/5, contradição encenável); g08 (5/5, interpretação literal ancorada na personagem). São juízos da escrita, não medições de audiência.

Revisão seguinte: d15, d18, d19 e d23 passaram a 4/5 após remates novos; g06 passou a 4/5 com a reserva para «a pessoa» que é o lugar vazio. d03 e d05 precisaram de outra passagem: saída interrompida pela conta e abraço convertido em reunião são agora 4/5. g04 passou a 4/5 ao trocar uma ação não implementada pelo relato do apito: o urso atrai três pessoas, promove-se a treinador e deixa de precisar de correr. Esta aprovação editorial mantém a aceitação em jogo pendente.
