import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const DISCORD = { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } };
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };

const relogio = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'A cada 10 minutos', parameters: {
  rule: { interval: [{ field: 'minutes', minutesInterval: 10 }] } } } });

// Só pedidos criados a partir de 26/10/2026 (início do portal), aprovados pela equipe e ainda não passados ao portal.
const aprovados = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Pedidos de longos aprovados', credentials: NOTION, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/3fea57fbb3ca4a7d9d16921d2f0b00cf/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '{"filter":{"and":[{"property":"Status","select":{"equals":"Aprovado"}},{"property":"Log da máquina","rich_text":{"does_not_contain":"[portal]"}},{"timestamp":"created_time","created_time":{"on_or_after":"2026-10-26T00:00:00Z"}}]},"page_size":20}',
  options: {} } } });

const separar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Separar pedidos', parameters: { jsCode: `const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; return a ? a.map(t => t.plain_text).join('').trim() : ''; };
const out = [];
for (const pg of ($input.first().json.results || [])) {
  const pr = pg.properties || {};
  const cliente = (((pr['Cliente'] || {}).relation || [])[0] || {}).id || '';
  const video = (pr['Vídeo pronto'] || {}).url || '';
  if (!cliente || !video) continue;
  const titulo = txt(pr['Pedido']);
  const nn = (titulo.match(/V[IÍ]DEO\\s*0*(\\d+)/i) || [])[1] || '';
  out.push({ json: { pedido: pg.id, cliente, video, titulo, nn, log: txt(pr['Log da máquina']),
    busca: JSON.stringify({ filter: { and: [
      { property: 'Cliente', relation: { contains: cliente } },
      { property: 'Tipo', select: { equals: 'Vídeo longo' } },
      { or: ['A fazer', 'Fazendo', 'Em revisão', 'Ajustes'].map(s => ({ property: 'Status', select: { equals: s } })) }] },
      sorts: [{ property: 'Postar em', direction: 'ascending' }], page_size: 30 }) } });
}
return out;
` } } });

const cards = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Cards de vídeo longo do cliente', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/74b3076a325749e3bac4ba6659215e48/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.busca }}', options: {} } } });

const decidir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Escolher o card', parameters: { mode: 'runOnceForEachItem', jsCode: `const Z = 'America/Recife';
const p = $('Separar pedidos').item.json;
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; return a ? a.map(t => t.plain_text).join('').trim() : ''; };
const lista = $json.results || [];
const nn = p.nn ? String(Number(p.nn)).padStart(2, '0') : '';
const re = nn ? new RegExp('V[IÍ]DEO\\\\s*0*' + Number(nn) + '(?!\\\\d)', 'i') : null;
const card = (re && lista.find(c => re.test(txt(c.properties['Entrega'])))) || lista[0] || null;
const agora = DateTime.now().setZone(Z).toFormat('dd/MM HH:mm');
const nomeCard = card ? txt(card.properties['Entrega']) : '';
const obsAntiga = card ? txt(card.properties['Obs']) : '';
const obs = ('[Máquina ' + agora + '] Vídeo editado pela IA e aprovado pela equipe. Liberado no portal para o cliente aprovar.' + (obsAntiga ? '\\n' + obsAntiga : '')).slice(0, 1900);
const t = s => [{ type: 'text', text: { content: s } }];
const patchCard = card ? JSON.stringify({ properties: { 'Status': { select: { name: 'Aguardando cliente' } }, 'Link do arquivo': { url: p.video }, 'Obs': { rich_text: t(obs) } } }) : '';
const linha = '[portal] ' + agora + ': ' + (card ? 'card "' + nomeCard + '" foi para Aguardando cliente.' : 'nenhum card de vídeo longo aberto achado.');
const patchLog = JSON.stringify({ properties: { 'Log da máquina': { rich_text: t((linha + (p.log ? '\\n' + p.log : '')).slice(0, 1900)) } } });
const msg = card
  ? '🎞️ Vídeo longo aprovado pela equipe foi liberado no portal: **' + nomeCard + '**. O cliente já pode aprovar ou pedir ajuste por lá.\\n— Érica, time de suporte, Grupo Euforia'
  : '⚠️ O pedido **' + p.titulo + '** foi aprovado, mas não achei card de vídeo longo aberto desse cliente no Entregas. Coloquem o link no card certo e mudem para "Aguardando cliente": ' + p.video + '\\n— Érica, time de suporte, Grupo Euforia';
return { json: { achou: !!card, cardId: card ? card.id : '', patchCard, patchLog, pedido: p.pedido, discord: JSON.stringify({ content: msg.slice(0, 1990) }) } };
` } } });

const achou = ifElse({ version: 2.2, config: { name: 'Achou o card?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.achou }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const atualizarCard = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Card para Aguardando cliente', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'PATCH', url: '={{ "https://api.notion.com/v1/pages/" + $json.cardId }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.patchCard }}', options: {} } } });

const anotar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Anotar no pedido', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'PATCH', url: '={{ "https://api.notion.com/v1/pages/" + $("Escolher o card").item.json.pedido }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $("Escolher o card").item.json.patchLog }}', options: {} } } });

const avisar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Avisar no #dia-a-dia', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://discord.com/api/v10/channels/1556642691410956339/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $("Escolher o card").item.json.discord }}', options: {} } } });

const nota = sticky('## Portal · vídeo longo aprovado → cliente (V1)\nA cada 10 min: pedidos do 🎞️ Pedidos de Vídeos Longos IA com Status "Aprovado" (aprovado pela equipe), criados desde 26/10/2026 e sem "[portal]" no log.\nAcha o card de vídeo longo aberto do cliente no Entregas (o da mesma VÍDEO NN, senão o que vai ao ar primeiro), põe o link e muda para "Aguardando cliente" (aparece no portal). Anota "[portal]" no log do pedido e avisa no #dia-a-dia. Nunca manda nada ao cliente.', [], { color: 4 });

export default workflow('portal-liberar-longo', 'Portal | Vídeo longo aprovado vai para o cliente (V1)')
  .add(relogio).to(aprovados).to(separar).to(cards).to(decidir)
  .to(achou.onTrue(atualizarCard.to(anotar)).onFalse(anotar))
  .add(anotar).to(avisar)
  .add(nota);
