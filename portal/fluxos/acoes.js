import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const DISCORD = { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } };
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Cliente aprova ou pede ajuste', parameters: {
  httpMethod: 'POST', path: 'euforia-portal-acao', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

const lerPedido = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler pedido', parameters: { jsCode: `const b = ($input.first().json.body) || {};
const limpa = v => String(v || '').replace(/-/g, '').toLowerCase();
const id = limpa(b.c), card = limpa(b.card);
const ok32 = v => /^[0-9a-f]{32}$/.test(v);
const acao = ['aprovar', 'ajuste'].includes(b.acao) ? b.acao : '';
const texto = String(b.texto || '').trim().slice(0, 1500);
const tc = String(b.minuto || '').trim().slice(0, 12);
return [{ json: { id: ok32(id) ? id : '00000000000000000000000000000000', card: ok32(card) ? card : '00000000000000000000000000000000', acao, texto, tc } }];
` } } });

const fichaNode = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Ficha do cliente', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://api.notion.com/v1/pages/{{ $("Ler pedido").first().json.id }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, options: {} } } });

const cardNode = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Card da entrega', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://api.notion.com/v1/pages/{{ $("Ler pedido").first().json.card }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, options: {} } } });

const validar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validar pedido', parameters: { jsCode: `const Z = 'America/Recife';
const p = $('Ler pedido').first().json;
const ficha = $('Ficha do cliente').first().json;
const card = $('Card da entrega').first().json;
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; return ''; };
const fp = ficha.properties || {}, cp = card.properties || {};
const nome = txt(fp['Cliente']);
const doCliente = ((cp['Cliente'] || {}).relation || []).some(r => r.id.replace(/-/g, '') === p.id);
const status = txt(cp['Status']);
let erro = '';
if (!nome || !card.id || !doCliente) erro = 'link';
else if (!p.acao) erro = 'acao';
else if (status !== 'Aguardando cliente') erro = 'status';
else if (p.acao === 'ajuste' && p.texto.length < 3) erro = 'texto';
const agora = DateTime.now().setZone(Z);
const titulo = txt(cp['Entrega']);
const obsAntiga = txt(cp['Obs']);
const carimbo = '[Portal ' + agora.toFormat('dd/MM HH:mm') + '] ';
const novaObs = p.acao === 'aprovar'
  ? carimbo + 'Cliente aprovou pelo portal.'
  : carimbo + 'Cliente pediu ajuste pelo portal' + (p.tc ? ' (minuto ' + p.tc + ')' : '') + ': ' + p.texto;
const obs = (novaObs + (obsAntiga ? '\\n' + obsAntiga : '')).slice(0, 1990);
const props = { 'Status': { select: { name: p.acao === 'aprovar' ? 'Aprovado' : 'Ajustes' } }, 'Obs': { rich_text: [{ type: 'text', text: { content: obs } }] } };
if (p.acao === 'aprovar') props['Concluído em'] = { date: { start: agora.toISODate() } };
const M = { '3ea98c0cdde081299709cf901fac7275': '<@1490768736876237082>', '3ea98c0cdde0812d9cb4c41ce70df4ae': '<@1410287139169763471>' };
const quem = ((fp['Responsável principal'] || {}).relation || []).map(r => M[r.id.replace(/-/g, '')]).filter(Boolean).join(' ') || 'Equipe';
const aviso = p.acao === 'aprovar'
  ? '✅ **' + nome + '** aprovou pelo portal: **' + titulo + '**. ' + quem + ', pode seguir para a postagem.'
  : '🔁 **' + nome + '** pediu ajuste pelo portal em **' + titulo + '**' + (p.tc ? ' (minuto ' + p.tc + ')' : '') + ':\\n> ' + p.texto.replace(/\\n/g, '\\n> ') + '\\n' + quem + ', o card voltou para Ajustes.';
return [{ json: { ok: !erro, erro, cardId: card.id, body: JSON.stringify({ properties: props }), discord: JSON.stringify({ content: (aviso + '\\n— Érica, time de suporte, Grupo Euforia').slice(0, 1990) }),
  resposta: erro ? { ok: false, motivo: erro } : { ok: true, acao: p.acao } } }];
` } } });

const podeSeguir = ifElse({ version: 2.2, config: { name: 'Pedido válido?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const atualizar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Atualizar card no Entregas', credentials: NOTION, parameters: {
  method: 'PATCH', url: '=https://api.notion.com/v1/pages/{{ $("Validar pedido").first().json.cardId }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $("Validar pedido").first().json.body }}', options: {} } } });

const avisar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Avisar no #dia-a-dia', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://discord.com/api/v10/channels/1556642691410956339/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $("Validar pedido").first().json.discord }}', options: {} } } });

const confirmar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar ao cliente', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($("Validar pedido").first().json.resposta) }}', options: {} } } });

const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar pedido', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Portal do cliente · aprovar / pedir ajuste (V1)\nSó vale para card do próprio cliente em "Aguardando cliente".\nAprovar: Status Aprovado + Concluído em hoje. Ajuste: Status Ajustes. Nos dois, a Obs ganha uma linha [Portal dd/mm] no topo e sai aviso no #dia-a-dia marcando o responsável.', [], { color: 4 });

export default workflow('portal-acoes', 'Portal | Aprovar ou pedir ajuste (V1)')
  .add(pedir).to(lerPedido).to(fichaNode).to(cardNode).to(validar)
  .to(podeSeguir.onTrue(atualizar.to(avisar).to(confirmar)).onFalse(recusar))
  .add(nota);
