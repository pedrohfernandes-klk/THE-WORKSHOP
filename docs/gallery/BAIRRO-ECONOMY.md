# Economia do bairro — relatório

ORGULHO é uma carteira persistente, separada do BRIO de cada luta. Vitória rende `10 + floor(BRIO restante / 10)`; derrota tira cinco, sem saldo negativo, e conserva rancor. Missão e senha dão prémio uma única vez por identificador. Falhas de armazenamento não bloqueiam a sessão.

A máquina vende sete bens e o bolso guarda três. Consultar disponibilidade ou provocar um encravamento não cobra: a transação ocorre apenas ao recolher da gaveta. CORAGEM só funciona à terça-feira. I abre/fecha o bolso; Escape e Fechar também fecham e devolvem o foco.

PACIÊNCIA interrompe perseguições durante 60 s; CORAGEM duplica dano por 30 s; SILÊNCIO dura 20 s; SAUDADE muda a luz e a música para uma resposta de guitarra/chiptune por 60 s; WI-FI guarda uma pista; SEGUNDA-FEIRA abranda o comportamento por 45 s; DESCULPA termina rancor/perseguição perto do alvo. As falas mantêm o ritmo normal e a memória cómica não é apagada.

Dependências: S, comédia/Fabinhe, BRIO, ESTÁTUAS, máquina existente e eventos de missão. O prémio de senha e a pista WI-FI dependem do PR SENHA #142. Este pacote não implementa níveis.

Integração: ficheiros novos `bairro-wallet.js`, `bairro-economy.js`, `bairro-ui.css`, mais o patch consolidado preparado pelo responsável. Todos os hooks NPC já estão no único `tools/bairro-economy-integration.patch`; não aplicar patches auxiliares. Zero geometria nova no código da carteira; custos reais não medidos. npm test: 204/204 passaram na base empilhada (191 anteriores + 13 novos); sintaxe dos 16 JS envolvidos validada. Browser e desempenho por Claude.

## Guião de Claude

- Executar `tests/bairro-wallet.test.mjs`, testes gerais e sintaxe após composição.
- Ganhar com BRIO 100 e 55: receber 20 e 15. Repetir o mesmo evento não paga novamente; `amount` forjado é ignorado. Perder com saldo zero mantém zero.
- Selecionar sem recolher, provocar encravamento e desbloquear: nada é cobrado antes da gaveta. Recolher cobra uma vez.
- Encher três bolsos: quarta compra não cobra. Consumir liberta espaço. Testar indisponibilidade de saldo, carteira ainda a carregar e armazenamento bloqueado/corrompido.
- CORAGEM: testar segunda/terça e mudança de dia entre queda e recolha. O bem impossível de recolher não pode bloquear a máquina indefinidamente; CORAGEM é devolvida automaticamente ao tentar recolher fora de terça, sem cobrança.
- Testar cada efeito e expiração; PACIÊNCIA contra perseguição já ativa; SEGUNDA-FEIRA sem abrandar fala, combate ou passageiros; DESCULPA sem apagar histórico cómico.
- SILÊNCIO com contexto NPC congelado: ambos os contextos e TTS silenciam; retomar não ressuscita voz cancelada.
- Reabrir a página: saldo, bolso, prémios únicos e rancor conservados. Confirmar I/Escape/Fechar, foco, teclado e 390×844.
- Após SENHA, confirmar prémio único por edifício e consumo da pista WI-FI. Sem esse PR, não afirmar integração da senha concluída.
