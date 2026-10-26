# Portal do cliente (V1)

Página única que o cliente abre com `grupoeuforia.com.br/portal?c=<id da ficha no Notion>`.
Abas: Início, Entregas (aprovar / pedir ajuste), Gravações (roteiros + envio do vídeo bruto para ARQUIVOS BRUTOS no Drive) e Mensagens (espelho do grupo do WhatsApp).
`?demo=1` mostra dados de exemplo.

- `portal.html`: a página publicada (sobe pelo fluxo "Sites | Publicar LP", slug `portal`).
- `fluxos/`: código dos 5 fluxos n8n "Portal | ... (V1)" que a página chama.

Regras: o cliente vê só percentuais de canal; mensagem do portal vai para o grupo pelo número do suporte (nunca pela Isabela).
