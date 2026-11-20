import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const DISCORD = { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } };
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };

const relogio = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'A cada 10 minutos (min 2)', parameters: {
  rule: { interval: [{ field: 'cronExpression', expression: '2,12,22,32,42,52 * * * *' }] } } } });

// Trava: só pedidos abertos pelo fluxo do portal ("[auto-portal]" nas observações).
const FILTRO = '{"filter":{"and":[{"property":"Status","select":{"equals":"Aprovado"}},{"property":"Observações para a máquina","rich_text":{"contains":"[auto-portal]"}},{"property":"Log da máquina","rich_text":{"does_not_contain":"[portal]"}}]},"page_size":20}';

const shorts = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Shorts aprovados', credentials: NOTION, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/8205f7673c224763b28891e768cb3916/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: FILTRO, options: {} } } });

const carrosseis = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Carrosséis aprovados', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/4cc9fd21563940afb1512e1d4f9a2bfb/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: FILTRO, options: {} } } });

const separar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Separar pedidos', parameters: { jsCode: `const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; return a ? a.map(t => t.plain_text).join('').trim() : ''; };
const url1 = s => (String(s || '').match(/https?:\\/\\/\\S+/) || [''])[0];
const lotes = [
  { tipo: 'Shorts', lista: $('Shorts aprovados').first().json.results || [], link: pr => (pr['Pasta dos shorts'] || {}).url || url1(txt(pr['Shorts prontos'])) },
  { tipo: 'Carrossel', lista: $input.first().json.results || [], link: pr => (pr['Carrosséis prontos'] || {}).url || '' },
];
const out = [];
for (const l of lotes) for (const pg of l.lista) {
  const pr = pg.properties || {};
  const cliente = (((pr['Cliente'] || {}).relation || [])[0] || {}).id || '';
  const link = l.link(pr);
  if (!cliente || !link) continue;
  out.push({ json: { pedido: pg.id, tipo: l.tipo, cliente, link, titulo: txt(pr['Pedido']), log: txt(pr['Log da máquina']),
    busca: JSON.stringify({ filter: { and: [
      { property: 'Cliente', relation: { contains: cliente } },
      { property: 'Tipo', select: { equals: l.tipo } },
      { or: ['A fazer', 'Fazendo', 'Em revisão', 'Ajustes'].map(s => ({ property: 'Status', select: { equals: s } })) }] },
      sorts: [{ property: 'Postar em', direction: 'ascending' }], page_size: 10 }) } });
}
return out;
` } } });

const cards = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Cards do cliente no Entregas', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/74b3076a325749e3bac4ba6659215e48/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.busca }}', options: {} } } });

const decidir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Escolher o card', parameters: { mode: 'runOnceForEachItem', jsCode: `const Z = 'America/Recife';
const p = $('Separar pedidos').item.json;
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; return a ? a.map(t => t.plain_text).join('').trim() : ''; };
const lista = $json.results || [];
const card = lista[0] || null;
const agora = DateTime.now().setZone(Z).toFormat('dd/MM HH:mm');
const nomeCard = card ? txt(card.properties['Entrega']) : '';
const oque = p.tipo === 'Shorts' ? 'Shorts feitos pela IA' : 'Carrossel feito pela IA';
const obsAntiga = card ? txt(card.properties['Obs']) : '';
const obs = ('[Máquina ' + agora + '] ' + oque + ' e aprovado pela equipe. Liberado no portal para o cliente aprovar.' + (obsAntiga ? '\\n' + obsAntiga : '')).slice(0, 1900);
const t = s => [{ type: 'text', text: { content: s } }];
const patchCard = card ? JSON.stringify({ properties: { 'Status': { select: { name: 'Aguardando cliente' } }, 'Link do arquivo': { url: p.link }, 'Obs': { rich_text: t(obs) } } }) : '';
const linha = '[portal] ' + agora + ': ' + (card ? 'card "' + nomeCard + '" foi para Aguardando cliente.' : 'nenhum card de ' + p.tipo + ' aberto achado.');
const patchLog = JSON.stringify({ properties: { 'Log da máquina': { rich_text: t((linha + (p.log ? '\\n' + p.log : '')).slice(0, 1900)) } } });
const emoji = p.tipo === 'Shorts' ? '🎬' : '🖼️';
const extra = p.tipo === 'Shorts' && lista.length > 1 ? ' Se essa leva tiver mais de um card de shorts, coloquem o mesmo link nos outros.' : '';
const msg = card
  ? emoji + ' ' + p.tipo + ' aprovado pela equipe foi liberado no portal: **' + nomeCard + '**. O cliente já pode aprovar ou pedir ajuste por lá.' + extra + '\\n— Érica, time de suporte, Grupo Euforia'
  : '⚠️ O pedido **' + p.titulo + '** foi aprovado, mas não achei card de ' + p.tipo + ' aberto desse cliente no Entregas. Coloquem o link no card certo e mudem para "Aguardando cliente": ' + p.link + '\\n— Érica, time de suporte, Grupo Euforia';
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

const nota = sticky('## Portal · shorts e carrossel aprovados → cliente (V1)\nA cada 10 min (minutos 2, 12, 22...): pedidos de shorts e de carrossel abertos pelo portal ("[auto-portal]" nas observações), com Status "Aprovado" e sem "[portal]" no log.\nAcha o card aberto do mesmo tipo (Shorts ou Carrossel) do cliente no Entregas (o que vai ao ar primeiro), põe o link da pasta e muda para "Aguardando cliente" (aparece no portal). Anota "[portal]" no log e avisa no #dia-a-dia. Nunca manda nada ao cliente.', [], { color: 4 });

export default workflow('portal-liberar-derivados', 'Portal | Shorts e carrossel aprovados vão para o cliente (V1)')
  .add(relogio).to(shorts).to(carrosseis).to(separar).to(cards).to(decidir)
  .to(achou.onTrue(atualizarCard.to(anotar)).onFalse(anotar))
  .add(anotar).to(avisar)
  .add(nota);
