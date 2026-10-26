# Painel da Equipe (V1, rascunho)

Tela da equipe por cima do Notion. O Notion continua sendo o banco (Entregas, Clientes, Equipe); a equipe só aperta botões.

- `painel.html`: a página. Abre com `?u=<token>` e pede o PIN de 4 números. `?demo=1` mostra dados de exemplo e não envia nada.
- `fluxos/`: os 4 fluxos do n8n (código do Workflow SDK).
  - `fila.js` → "Painel | Fila da equipe (V1)": devolve os cards da pessoa conforme o papel (editor, revisor, calls, teste).
  - `acao.js` → "Painel | Botões da equipe (V1)": Comecei, Mandar para revisão, Aprovar, Pedir ajuste, Agendei, Postei. Cada botão só vale para quem pode e na etapa certa.
  - `arquivo.js` → "Painel | Envio de arquivo da equipe (V1)": abre o envio direto ao Drive (pasta do cliente › ENTREGAS DO PAINEL) e confere no fim.
  - `pedido.js` → "Painel | Pedido ao escritório (V1)": cria card no Entregas para o Escritório (Flau + IA), automático ou à mão.

Acesso: tabela do n8n "Painel equipe · acesso" (token, PIN, nome, ficha, papel, ativo). Token e PIN nunca vão para o Notion, Discord ou este repositório.
O usuário de teste só enxerga e mexe em cards com "TESTE PAINEL" no título, e não avisa no Discord.

Nada aqui está publicado. Publicar os fluxos e subir a página (slug `equipe`) só com OK do Henrique.
