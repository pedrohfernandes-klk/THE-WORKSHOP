# Porrada orgânica

Depende de DADOS#148; empilhado após o leitor#149. Base624197d, alcance2,1m preservado. Aplicar `git apply --check tools/organic-data-integration.patch` e depois `git apply tools/organic-data-integration.patch` após os dois patches anteriores.

A chapada isolada mantém primeira pessoa. A porrada exige manterQ durante700ms ou escolher as luvas: começa em guarda, sem ataque automático. Rixas de NPCs não arrastam o visitante para combate. Durante a luta desaparecem falas, caixas e seletores; ficam pílulas de BRIO e controlos com ícones e nomes acessíveis.

Golpes têm antecipação, ataque curto, contacto único, hit-stop60ms, seguimento e recuperação amortecida. Articulações novas e pesos misturados dobram membros; formas de pele/roupa deixam de usar caixas. Cabeça, barriga, chapéu e cabelo têm movimento secundário. Pés usam um solver planar; não é IK de terreno irregular nem simulação de tecido. Poeira/suor usam um único InstancedMesh global.

240 testes na composição DADOS+orgânica;243 incluindo leitor. Testes específicos verificam entrada voluntária, atores tardios, impacto único, silêncio, saída e27rigs low/high:1SkinnedMesh, pesos normalizados e máximo12.992triângulos. A fixture de pesos usa tolerância1e-6 paraFloat32. Sintaxe e aplicação do patch verificadas.

Falta revisão visual/auditiva e medição GPU pelo integrador. Testar silhuetas, trajes, pés, câmara/obstáculos, comboio, estátuas e Hall. Custo estrutural adicional:1draw global durante partículas;60fps não foram comprovados. Balões chegam em PR dependente.
