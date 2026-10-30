# Portal do cliente (V1)

Página única que o cliente abre com `grupoeuforia.com.br/portal?c=<id da ficha no Notion>`.
Abas: Início, Entregas (aprovar / pedir ajuste), Gravações (roteiros + envio do vídeo bruto para ARQUIVOS BRUTOS no Drive), Temas quentes (temas em alta da semana; o cliente pede 1 roteiro por mês, que conta como roteiro do pacote) e Mensagens (espelho do grupo do WhatsApp).
`?demo=1` mostra dados de exemplo.

- `portal.html`: a página publicada (sobe pelo fluxo "Sites | Publicar LP", slug `portal`).
- `fluxos/`: código dos fluxos n8n "Portal | ... (V1)": os 5 que a página chama e o `liberar-longo.js` (a cada 10 min, vídeo longo aprovado pela equipe vai para "Aguardando cliente" no Entregas e aparece no portal), o `derivados.js` (longo do portal aprovado abre 3 shorts e 1 carrossel nas máquinas) o `liberar-derivados.js` (shorts e carrossel aprovados vão para "Aguardando cliente" no Entregas) e o `tema.js` (cliente pede roteiro de tema quente: card do Escritório no Entregas, tema marcado no 🔥 Temas quentes, aviso no #dia-a-dia).
- Temas da semana: rotina do Claude seguindo `escritorio/temas-quentes/TEMAS.md` (segunda 7h).

Regras: o cliente vê só percentuais de canal; mensagem do portal vai para o grupo pelo número do suporte (nunca pela Isabela).
