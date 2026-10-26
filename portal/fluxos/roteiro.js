import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Cliente abre um roteiro', parameters: {
  httpMethod: 'GET', path: 'euforia-portal-roteiro', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

const lerLink = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler pedido', parameters: { jsCode: `const q = ($input.first().json.query) || {};
const limpa = v => String(v || '').replace(/-/g, '').toLowerCase();
const ok = v => /^[0-9a-f]{32}$/.test(v) ? v : '00000000000000000000000000000000';
return [{ json: { id: ok(limpa(q.a)), r: ok(limpa(q.r)) } }];
` } } });


// Cada pessoa do cliente tem o seu link (?a=<id da linha no 🔑 Acessos do portal>). Desmarcar "Ativo" corta o acesso.
const acessoNode = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Acesso da pessoa', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://api.notion.com/v1/pages/{{ $("Ler pedido").first().json.id }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, options: {} } } });

const conferir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Conferir acesso', parameters: { jsCode: `const a = $input.first().json || {};
const pr = a.properties || {};
const txt = v => { if (!v) return ''; const t = v.title || v.rich_text; if (t) return t.map(x => x.plain_text).join('').trim(); if (v.select) return v.select.name; return ''; };
const valido = a.object === 'page' && !a.archived && !a.in_trash && ((a.parent || {}).database_id || '') === 'a95cdc41-6645-47f5-8c0f-99a85e31fb4e' && (pr['Ativo'] || {}).checkbox === true;
const cliente = valido ? ((((pr['Cliente'] || {}).relation || [])[0] || {}).id || '').replace(/-/g, '') : '';
const papel = txt(pr['Papel']) || 'Equipe';
return [{ json: { id: /^[0-9a-f]{32}$/.test(cliente) ? cliente : '00000000000000000000000000000000', pessoa: valido ? txt(pr['Pessoa']).replace(/\\s*\\(.*?\\)\\s*$/, '') : '', papel, podeAprovar: ['Dono', 'Sócio'].includes(papel), fone8: String((pr['WhatsApp'] || {}).phone_number || '').replace(/[^0-9]/g, '').slice(-8) } }];
` } } });

const pagina = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Página do roteiro', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://api.notion.com/v1/pages/{{ $("Ler pedido").first().json.r }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, options: {} } } });

const blocos = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Texto do roteiro', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://api.notion.com/v1/blocks/{{ $("Ler pedido").first().json.r }}/children', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendQuery: true, queryParameters: { parameters: [{ name: 'page_size', value: '100' }] },
  sendHeaders: true, headerParameters: NOTION_HDR, options: {} } } });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar roteiro', parameters: { jsCode: `const p = $('Ler pedido').first().json;
const pg = $('Página do roteiro').first().json;
const pr = pg.properties || {};
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; return ''; };
const doCliente = ((pr['Cliente'] || {}).relation || []).some(x => x.id.replace(/-/g, '') === $('Conferir acesso').first().json.id);
const LIBERADO = ['📤 Enviado ao cliente', '👍 Aprovado pelo cliente', '🎬 Gravado'];
if (!pg.id || !doCliente || txt(pr['Tipo']) !== 'Roteiro' || !LIBERADO.includes(txt(pr['Status']))) return [{ json: { resposta: { ok: false, motivo: 'link' } } }];
const TIPOS = { heading_1: 'h', heading_2: 'h', heading_3: 'h', paragraph: 'p', bulleted_list_item: 'li', numbered_list_item: 'li', quote: 'q', callout: 'q', to_do: 'li' };
// Só o roteiro em si: começa no título "ROTEIRO ..." e para na ficha dos cortes. Notas internas (Escritório: ...) saem.
const blocos = $('Texto do roteiro').first().json.results || [];
const temInicio = blocos.some(b => /^heading_/.test(b.type) && /roteiro/i.test(((b[b.type] || {}).rich_text || []).map(x => x.plain_text).join('')));
let dentro = !temInicio;
const partes = [];
for (const b of blocos) {
  const k = TIPOS[b.type];
  if (!k) continue;
  let t = ((b[b.type] || {}).rich_text || []).map(x => x.plain_text).join('').trim();
  if (k === 'h' && /cortes|shorts|ficha/i.test(t)) break;
  if (k === 'h' && /roteiro/i.test(t)) { dentro = true; continue; }
  if (!dentro) continue;
  t = t.replace(/\\(\\s*Escrit[óo]rio:[^)]*\\)/gi, '').replace(/\\s+$/, '').trim();
  if (t) partes.push({ k, t: t.slice(0, 3000) });
}
const n = (pr['Nº'] || {}).number;
const titulo = txt(pr['Título']).split('|').slice(-1)[0].replace(/^\\s*Roteiro\\s*\\d+\\s*·\\s*/i, '').trim();
return [{ json: { resposta: { ok: true, n: n == null ? null : n, t: titulo, partes } } }];
` } } });

const devolver = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver roteiro', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Portal do cliente · roteiro (V1)\nMostra o texto de um roteiro do 🎬 Pautas e Roteiros no portal. Só se o roteiro for do próprio cliente e estiver Enviado, Aprovado ou Gravado. Só leitura.', [], { color: 4 });

export default workflow('portal-roteiro', 'Portal | Roteiro para o cliente (V1)')
  .add(pedir).to(lerLink).to(acessoNode).to(conferir).to(pagina).to(blocos).to(montar).to(devolver)
  .add(nota);
