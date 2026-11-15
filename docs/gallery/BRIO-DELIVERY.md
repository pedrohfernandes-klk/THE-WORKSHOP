# BRIO — terceira entrega

Depende de **#138 e #137, com ambos os patches aplicados**. Origem `cf2c73a`. Acrescentar os ficheiros novos e aplicar apenas `tools/brio-integration.patch`: um diff consolidado para controlos, main, NPCs e modelos. Preserva a migração de som, a comédia e o Fabinhe.

Entrego 16 golpes, combos de três toques, defesa, esquiva, contra-ataque, recuo com colisão, BRIO cheio no início e KO cómico. Alcance máximo de 1,8 m, verificação do piso e obstáculos. O visitante ganha corpo W3 só na luta; um NPC é ocultado/pausado em compensação. A câmara procura enquadramento livre, regressando à primeira pessoa no fim. «PORRADA!» e «trombil» integram a apresentação.

WASD mantém-se; clique/revés, Q/Z/C/F, Shift e Espaço seguem o contrato. E defende durante a luta e mantém a função anterior fora dela. Quatro botões móveis. Áudio sintetizado usa o broker S; impactos não esperam pelo som. Movimento reduzido retira tremor e hit-stop visual.

Não altera a carteira ORGULHO: publica resultado e BRIO restante para P. Armas são poses/metadados; recolha no mercado depende de P. Sem botão de perdão gratuito.

**Não executei testes ou medições.** Claude verifica sintaxe, suíte, alcance, colisão, câmara/restauro, KO, móvel, áudio e custo alvo de 0,2 ms. Avatar +1 corpo e NPC −1; draw calls/triângulos reais por medir.

**AMANHÃ:** ativação das estátuas, combate simultâneo de quatro NPCs e integração com comboio/progressão. X permanece inativo neste PR. Nenhuma proposta alternativa de patch deve ser aplicada em conjunto.
