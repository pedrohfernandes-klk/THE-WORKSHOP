# Adenda do elenco — W3

O catálogo passa a 26 personagens, mantendo os 14 lugares originais ativos por defeito. Os 12 suplentes só entram por `npcAssignments`: as preferências `casting.preferredSlots` não ativam nem acrescentam personagens. Leo decide a distribuição.

Os três mirones (`tio_camisola`, `senhor_banho`, `cusco_roupao`), o porco de fato (`porco_fato`) e o urso de treino (`urso_treino`) têm roupas, proporções e paletas próprias, mais de 15 falas e um momento humano. Os mirones fornecem `peek`, `feign` e `comment`; o porco fornece `sniff`/`snort`; o urso fornece `hug`. Os cinco comportamentos dependem da integração de `npc-onlookers.js`.

Os sete arquétipos anteriores recebem roupas explícitas e flags neutras para não herdarem gravatas, suspensórios ou capuzes do lugar substituído. O forcado conserva o desenho aprovado, com calção justo creme, faixa, meias e barrete. `bodyWidth`, `armLength` e `shape` distinguem silhuetas; o modelo e os volumes de interação devem usar as mesmas medidas efetivas.

As 21 falas do dono constam literalmente em `protectedLines` e nas situações do elenco. Duas sobre proporções têm restrições em `protectedLineContext`: só se dirigem a personagens fictícias indicadas, num evento entre NPCs. O selecionador deve excluí-las quando não conhece um alvo autorizado. Nunca usar o visitante ou corpos reais como alvo.

Esta adenda só altera dados; não acrescenta malhas, luzes ou personagens ativos. Não foram executados testes nem medições, por instrução do dono. Claude verifica leitura do JSON, roupa nos lugares substituídos, restrições de diálogo, alturas, poses, ausência de repetição seguida e orçamento na integração.

