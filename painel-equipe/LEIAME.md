# Painel da Equipe (V1, rascunho)

Tela da equipe por cima do Notion. O Notion continua sendo o banco (Entregas, Clientes, Equipe); a equipe só aperta botões.

- `painel.html`: a página. Abre com `?u=<token>` e pede o PIN de 4 números. `?demo=1` mostra dados de exemplo e não envia nada.
- `fluxos/`: os 4 fluxos do n8n (código do Workflow SDK).
  - `fila.js` → "Painel | Fila da equipe (V1)": devolve os cards da pessoa conforme o papel (editor, revisor, calls, teste).
  - Pedir ao escritório: só revisor, calls, diretor e teste. Editor não vê a aba e o `pedido.js` recusa (decisão do Henrique em 26/10/2026).
  - Passar para: Ismael, Rômulo e diretoria trocam o Responsável do card para Victor, Lorena, Daniel ou Escritório (botão na gaveta do card, `acao: 'passar'` no `acao.js`). Aviso no #dia-a-dia marcando a pessoa.
  - Fila de demandas: `fila.js` manda também os cards abertos sem Responsável de vídeo longo, shorts, podcast, carrossel e thumb (`livre`); `acao.js` ação `pegar` (vira Responsável; limite de 8 em produção; aviso no #dia-a-dia).
  - Anexos no Pedir ao escritório: arquivos sobem pelo `arquivo.js` em modo `pedido` (pasta PEDIDOS DO PAINEL do cliente, até 5 GB cada, 10 por pedido) e os links entram na Obs do card pelo `pedido.js`.
  - Não é comigo / Já foi feito: quem é Responsável sai do card (`naoemeu`, aviso ao Ismael e Rômulo) ou marca Postado/Cancelado (`jafeito`), sempre com motivo obrigatório.
  - `responder.js` → "Painel | Responder cliente (V1)": Ismael e Rômulo respondem pela aba Responder. Sai pelo número de suporte da pessoa se conectado e no grupo; senão pelo "suporte" com "*Nome:*" na frente. Assunto de diretoria é recusado.
  - `acao.js` → "Painel | Botões da equipe (V1)": Comecei, Mandar para revisão, Aprovar, Pedir ajuste, Agendei, Postei. Cada botão só vale para quem pode e na etapa certa.
  - `arquivo.js` → "Painel | Envio de arquivo da equipe (V1)": abre o envio direto ao Drive (pasta do cliente › ENTREGAS DO PAINEL) e confere no fim.
  - `diretor.js` → "Painel | Diretor (V1)": só o papel diretor. Visão de todos os cards e da equipe, editar qualquer campo, criar card, ver as mensagens que a equipe mandou nos grupos de cliente, aba Clientes (`acao: 'clientes'`: ficha, contrato lido do "Resumo do contrato", feito x total desde o início do contrato, abertos, postados do último ano e última conversa no grupo) e mudar clima, risco, recuperação, atenção e próximo alinhamento da ficha (`acao: 'ficha'`).
  - `pedido.js` → "Painel | Pedido ao escritório (V1)": cria card no Entregas para o Escritório (Flau + IA), automático ou à mão.

Acesso: tabela do n8n "Painel equipe · acesso" (token, PIN, nome, ficha, papel, ativo). Token e PIN nunca vão para o Notion, Discord ou este repositório.
Papel diretor (Henrique): no mesmo link do painel ganha Visão geral (com calls de hoje e amanhã e a apresentação de cada uma, apresentações pendentes e pedidos parados por falta de informação), Clientes (clima, mês do contrato, quanto já foi entregue do total, atrasados, última postagem e conversa no grupo; gaveta com detalhes e edição da ficha), Por pessoa, Todos os cards e Mensagens da equipe; a "Minha fila" vira a fila do Escritório e ele revisa, posta e mexe na grade como o Ismael.
O usuário de teste só enxerga e mexe em cards com "TESTE PAINEL" no título, e não avisa no Discord.

Nada aqui está publicado. Publicar os fluxos e subir a página (slug `equipe`) só com OK do Henrique.

## Falta informação (Máquina do Escritório devolve o pedido)
Quando um pedido ao escritório não dá para fazer, a máquina põe o Responsável = quem pediu, "🏢 Escritório IA" = "Falta informação" e uma linha "[Escritório dd/MM HH:mm] Falta informação: ..." no topo da Obs, e marca a pessoa no #dia-a-dia.
No painel o card aparece no topo da Minha fila (grupo "Falta informação para o escritório", faixa vermelha) com o que falta. O botão "Completar pedido" abre o campo de texto (obrigatório), arquivos (vão para PEDIDOS DO PAINEL na pasta do cliente) e links. O fluxo de botões (ação `completar`) grava tudo na Obs e devolve o card ao Escritório com "Na fila".
