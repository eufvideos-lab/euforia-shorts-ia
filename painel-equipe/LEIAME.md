# Painel da Equipe (V1, rascunho)

Tela da equipe por cima do Notion. O Notion continua sendo o banco (Entregas, Clientes, Equipe); a equipe só aperta botões.

- `painel.html`: a página. Abre com `?u=<token>` e pede o PIN de 4 números. `?demo=1` mostra dados de exemplo e não envia nada.
- `fluxos/`: os 4 fluxos do n8n (código do Workflow SDK).
  - `fila.js` → "Painel | Fila da equipe (V1)": devolve os cards da pessoa conforme o papel (editor, revisor, calls, teste).
  - Pedir ao escritório: só revisor, calls, diretor e teste. Editor não vê a aba e o `pedido.js` recusa (decisão do Henrique em 26/10/2026).
  - `acao.js` → "Painel | Botões da equipe (V1)": Comecei, Mandar para revisão, Aprovar, Pedir ajuste, Agendei, Postei. Cada botão só vale para quem pode e na etapa certa.
  - `arquivo.js` → "Painel | Envio de arquivo da equipe (V1)": abre o envio direto ao Drive (pasta do cliente › ENTREGAS DO PAINEL) e confere no fim.
  - `diretor.js` → "Painel | Diretor (V1)": só o papel diretor. Visão de todos os cards e da equipe, editar qualquer campo, criar card e ver as mensagens que a equipe mandou nos grupos de cliente.
  - `pedido.js` → "Painel | Pedido ao escritório (V1)": cria card no Entregas para o Escritório (Flau + IA), automático ou à mão.

Acesso: tabela do n8n "Painel equipe · acesso" (token, PIN, nome, ficha, papel, ativo). Token e PIN nunca vão para o Notion, Discord ou este repositório.
Papel diretor (Henrique): no mesmo link do painel ganha Visão geral, Por pessoa, Todos os cards e Mensagens da equipe; a "Minha fila" vira a fila do Escritório e ele revisa, posta e mexe na grade como o Ismael.
O usuário de teste só enxerga e mexe em cards com "TESTE PAINEL" no título, e não avisa no Discord.

Nada aqui está publicado. Publicar os fluxos e subir a página (slug `equipe`) só com OK do Henrique.
