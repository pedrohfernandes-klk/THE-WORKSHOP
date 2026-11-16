# Porrada orgânica

Depende de DADOS#148; empilhado após o leitor#149. Base624197d, alcance2,1m preservado. Aplicar `git apply --check tools/organic-data-integration.patch` e depois `git apply tools/organic-data-integration.patch` após os dois patches anteriores.

A chapada isolada mantém primeira pessoa. A porrada exige manterQ durante700ms ou escolher as luvas: começa em guarda, sem ataque automático. Rixas de NPCs não arrastam o visitante para combate. Durante a luta desaparecem falas, caixas e seletores; ficam pílulas de BRIO e controlos com ícones e nomes acessíveis.

Golpes têm antecipação, ataque curto, contacto único, hit-stop60ms, seguimento e recuperação amortecida. Articulações novas e pesos misturados dobram membros; formas de pele/roupa deixam de usar caixas. Cabeça, barriga, chapéu e cabelo têm movimento secundário. Pés usam um solver planar; não é IK de terreno irregular nem simulação de tecido. Poeira/suor usam um único InstancedMesh global.

240 testes na composição DADOS+orgânica;243 incluindo leitor. Testes específicos verificam entrada voluntária, atores tardios, impacto único, silêncio, saída e27rigs low/high:1SkinnedMesh, pesos normalizados e máximo12.992triângulos. A fixture de pesos usa tolerância1e-6 paraFloat32. Sintaxe e aplicação do patch verificadas.

Falta revisão visual/auditiva e medição GPU pelo integrador. Testar silhuetas, trajes, pés, câmara/obstáculos, comboio, estátuas e Hall. Custo estrutural adicional:1draw global durante partículas;60fps não foram comprovados. Balões chegam em PR dependente.

## Afinação depois da luta no browser (porrada-polish)

- **Guarda (manter Q 0,7 s).** Conta tempo real, no máximo 0,1 s por frame (um engasgo nunca a dispara), e aguenta até 0,15 s sem alvo: um frame em que o estado do NPC pisca já não recomeça a contagem. Largar Q recomeça logo. Um anel à volta da mira enche durante a guarda (um só elemento, escondido fora dela). Q sem ninguém ao alcance diz «Chega mais perto do trombil.» uma vez por toque, no máximo uma vez a cada 2 s; o botão 🥊 também.
- **Alcance 2,1 m, como a chapada.** Entre 1,8 e 2,1 m o visitante dá primeiro meio passo até 1,7 m, pela colisão normal (`controls.combatMove`). Se o passo não chega ou a luta é recusada, o passo é desfeito. `nearestActor()` e `begin()` usam o mesmo limite.
- **Câmara.** Prefere o perfil (os dois de lado, a 3,6 m, o visitante à esquerda) e mantém o plano escolhido enquanto for válido; só muda quando fica tapado ou sem chão. Ficam os planos de três quartos, sobre o ombro, o anel apertado, a grua e a vista de cima, e as regras do comboio. Da grua e da vista de cima procura-se um plano melhor a cada 0,6 s.
- **Golpes do adversário.** `chooseMove()` pesa os 16 golpes pela distância e pelo alcance, nunca dá o mesmo golpe três vezes seguidas e deixa um golpe em cada quatro ao golpe de assinatura (a pega do forcado, a bengalada do velho…).
- **Poses.** Antecipação e recuo 30% maiores (`WIND_UP` 0,286; recuo e mola ×1,3). O hit-stop fica em 60 ms.
- **Touro.** Estava dentro do canteiro leste do parterre (colisor x 5,4–10,1, z 20,9–35,1, 1 m de altura) e não se podia lutar com ele. Passou para (6,8; 37,4), entre o fim do canteiro e o fim da piscina, com o mesmo raio de passeio. `tests/npc-slots-clear.test.mjs` constrói em Node todos os módulos do campus menos `environment` e `npcs` e verifica que nenhum slot (nem os pontos de passeio) fica dentro de um colisor com 0,9 m ou mais. Não cobre o hall (`room.js`, `props.js`).
