import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

// Ler página do Notion no painel (10/11/2026): a equipe não tem conta no Notion. Quem revisa abre o link do card
// (roteiro, pauta, estratégia, funil) dentro do painel, só leitura, sem precisar de acesso ao Notion.
const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };
const ACESSO = { __rl: true, mode: 'id', value: 'ilXDZWGAcOjoajx7', cachedResultName: 'Painel equipe · acesso' };
const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Abrir página', parameters: {
  httpMethod: 'POST', path: 'euforia-painel-notion', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

const ler = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler pedido', parameters: { jsCode: `const b = ($input.first().json.body) || {};
const id = v => { const s = String(v || '').replace(/-/g, '').toLowerCase(); return /^[0-9a-f]{32}$/.test(s) ? s : ''; };
const u = String(b.u || '').toLowerCase();
return [{ json: { u: /^[0-9a-f]{24}$/.test(u) ? u : 'x', pin: String(b.pin || '').replace(/[^0-9]/g, '').slice(0, 6), card: id(b.card) || '00000000000000000000000000000000', pagina: id(b.pagina) } }];
` } } });

const acesso = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Achar pessoa', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: ACESSO, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'token', condition: 'eq', keyValue: '={{ $json.u }}' }] }, limit: 1 } } });

const cardNode = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Card da entrega', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://api.notion.com/v1/pages/{{ $("Ler pedido").first().json.card }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendHeaders: true, headerParameters: NOTION_HDR, options: {} } } });

// O alvo é a página pedida (link dentro da página, linha da base) ou, sem pedido, o Link do arquivo do card.
const alvoNode = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Achar o alvo', parameters: { jsCode: `const p = $('Ler pedido').first().json;
const card = $('Card da entrega').first().json || {};
const link = String(((card.properties || {})['Link do arquivo'] || {}).url || '');
const m = link.match(/notion\\.(?:so|site|com)\\/[^?#]*?([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[?#]|$)/i);
const linkId = m ? m[1].replace(/-/g, '').toLowerCase() : '';
return [{ json: { linkId, alvo: p.pagina || linkId || '00000000000000000000000000000000' } }];
` } } });

const paginaNode = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Página alvo', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://api.notion.com/v1/pages/{{ $("Achar o alvo").first().json.alvo }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendHeaders: true, headerParameters: NOTION_HDR, options: {} } } });
const baseNode = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Base alvo', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://api.notion.com/v1/databases/{{ $("Achar o alvo").first().json.alvo }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendHeaders: true, headerParameters: NOTION_HDR, options: {} } } });

// Só abre o que pertence ao card: o próprio link, o card, páginas dentro dele, linhas da base ligada e páginas do mesmo cliente.
const validar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validar leitura', parameters: { jsCode: `const p = $('Ler pedido').first().json;
const r = $('Achar pessoa').first().json || {};
const card = $('Card da entrega').first().json || {};
const { linkId, alvo } = $('Achar o alvo').first().json;
const pg = $('Página alvo').first().json || {};
const db = $('Base alvo').first().json || {};
const sem = v => String(v || '').replace(/-/g, '').toLowerCase();
const txt = a => (a || []).map(t => t.plain_text).join('').trim();
const cp = card.properties || {};
const acessoOk = !!r.token && r.token === p.u && r.ativo === true && String(r.pin) === p.pin;
const doEntregas = sem((card.parent || {}).database_id) === '74b3076a325749e3bac4ba6659215e48';
const cliente = sem((((cp['Cliente'] || {}).relation || [])[0] || {}).id);
const resp = ((cp['Responsável'] || {}).relation || []).map(x => sem(x.id));
const teste = r.papel === 'teste';
const titulo = txt((cp['Entrega'] || {}).title);
// Editor só abre os próprios cards; teste só os cards TESTE.
const veCard = teste ? /TESTE PAINEL/.test(titulo) : r.papel !== 'editor' || resp.includes(sem(r.ficha));
const ehPagina = pg.object === 'page' && !pg.in_trash && !pg.archived;
const ehBase = !ehPagina && db.object === 'database' && !db.in_trash && !db.archived;
const pp = pg.properties || {};
const doCliente = !!cliente && Object.values(pp).some(v => v && v.type === 'relation' && (v.relation || []).some(x => sem(x.id) === cliente));
const pai = pg.parent || {};
let erro = '';
if (!acessoOk) erro = 'acesso';
else if (!card.id || !doEntregas) erro = 'card';
else if (!veCard) erro = 'permissao';
else if (!linkId && !p.pagina) erro = 'sem-notion';
else if (!ehPagina && !ehBase) erro = 'nao-achei';
else if (ehBase && alvo !== linkId) erro = 'permissao';
else if (ehPagina && !(alvo === linkId || alvo === sem(card.id) || [linkId, cliente, sem(card.id)].includes(sem(pai.page_id)) || doCliente)) erro = 'permissao';
let nome = '';
if (ehPagina) { const t = Object.values(pp).find(v => v && v.type === 'title'); nome = t ? txt(t.title) : ''; }
if (ehBase) nome = txt(db.title);
// Propriedades simples da página (status, tipo, número), para quem revisa saber o que está lendo.
const props = ehPagina ? Object.entries(pp).map(([k, v]) => {
  const val = v.type === 'select' ? (v.select || {}).name : v.type === 'status' ? (v.status || {}).name : v.type === 'number' ? v.number
    : v.type === 'rich_text' ? txt(v.rich_text).slice(0, 300) : v.type === 'multi_select' ? (v.multi_select || []).map(x => x.name).join(', ') : v.type === 'url' ? v.url : '';
  return val === null || val === undefined || val === '' ? null : [k, String(val)]; }).filter(Boolean).slice(0, 12) : [];
const temCliente = ehBase && Object.values(db.properties || {}).some(v => v && v.type === 'relation' && (v.name === 'Cliente'));
if (!erro && ehBase && !temCliente) erro = 'permissao';
return [{ json: { ok: !erro, base: ehBase, alvo, nome, props,
  consulta: JSON.stringify({ page_size: 100, filter: { property: 'Cliente', relation: { contains: cliente || '00000000000000000000000000000000' } }, sorts: [{ timestamp: 'created_time', direction: 'descending' }] }),
  resposta: { ok: false, motivo: erro } } }];
` } } });

const podeLer = ifElse({ version: 2.2, config: { name: 'Pode ler?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } } });

const ehBase = ifElse({ version: 2.2, config: { name: 'É uma base?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $("Validar leitura").first().json.base }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } } });

const consultar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Linhas do cliente', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'POST', url: '=https://api.notion.com/v1/databases/{{ $("Validar leitura").first().json.alvo }}/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $("Validar leitura").first().json.consulta }}', options: {} } } });

const montarLista = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar lista', parameters: { jsCode: `const v = $('Validar leitura').first().json;
const res = ($input.first().json || {}).results || [];
const txt = a => (a || []).map(t => t.plain_text).join('').trim();
const linhas = res.filter(x => !x.in_trash && !x.archived).map(x => { const pp = x.properties || {};
  const t = Object.values(pp).find(q => q && q.type === 'title');
  const st = Object.values(pp).find(q => q && (q.type === 'status' || (q.type === 'select' && /status/i.test(q.name || ''))));
  return { id: x.id.replace(/-/g, ''), t: t ? txt(t.title) : '(sem título)', s: st ? ((st.select || st.status || {}).name || '') : '' }; });
return [{ json: { resposta: { ok: true, tipo: 'base', nome: v.nome, linhas } } }];
` } } });

const blocos = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Blocos', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://api.notion.com/v1/blocks/{{ $("Validar leitura").first().json.alvo }}/children?page_size=100', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendHeaders: true, headerParameters: NOTION_HDR, options: {} } } });

// Um nível a mais: listas, toggles e chamadas com conteúdo dentro.
const filhos = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Blocos com filhos', parameters: { jsCode: `const res = ($input.first().json || {}).results || [];
const ids = res.filter(b => b.has_children && !['child_page', 'child_database'].includes(b.type)).map(b => b.id).slice(0, 25);
return (ids.length ? ids : ['00000000000000000000000000000000']).map(id => ({ json: { id } }));
` } } });

const blocosFilhos = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Conteúdo dos filhos', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://api.notion.com/v1/blocks/{{ $json.id }}/children?page_size=100', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendHeaders: true, headerParameters: NOTION_HDR, options: {} } } });

const montarPagina = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar página', parameters: { jsCode: `const v = $('Validar leitura').first().json;
const topo = $('Blocos').first().json || {};
const sem = s => String(s || '').replace(/-/g, '');
const seg = arr => (arr || []).map(t => { const o = { x: t.plain_text || '' }; const a = t.annotations || {};
  if (a.bold) o.b = 1; if (a.italic) o.i = 1;
  if (t.type === 'mention' && t.mention && t.mention.type === 'page') o.p = sem(t.mention.page.id);
  else if (t.type === 'mention' && t.mention && t.mention.type === 'database') o.p = sem(t.mention.database.id);
  else if (t.href && /^https:\\/\\//.test(t.href)) { const m = t.href.match(/notion\\.(?:so|site|com)\\/(?:[^?#]*?)([0-9a-f]{32})(?:[?#]|$)/); if (m) o.p = m[1]; else o.a = t.href; }
  return o; });
const arq = f => f ? (f.type === 'external' ? (f.external || {}).url : (f.file || {}).url) || '' : '';
const um = b => { const d = b[b.type] || {}; const o = { k: b.type };
  if (d.rich_text) o.s = seg(d.rich_text);
  if (b.type === 'to_do') o.c = d.checked ? 1 : 0;
  if (b.type === 'callout' && d.icon && d.icon.emoji) o.e = d.icon.emoji;
  if (b.type === 'child_page') { o.p = sem(b.id); o.s = [{ x: d.title || 'Página' }]; }
  if (b.type === 'child_database') { o.p = sem(b.id); o.s = [{ x: d.title || 'Base' }]; }
  if (b.type === 'link_to_page') { o.k = 'child_page'; o.p = sem(d.page_id || d.database_id); o.s = [{ x: 'Abrir página ligada' }]; }
  if (['image', 'video', 'file', 'pdf', 'audio'].includes(b.type)) { o.u = arq(d); o.s = seg(d.caption); }
  if (['bookmark', 'embed', 'link_preview'].includes(b.type)) o.u = d.url || '';
  if (b.type === 'code') o.s = seg(d.rich_text);
  if (b.type === 'table_row') o.cel = (d.cells || []).map(seg);
  return o; };
const kids = {};
for (const it of $('Conteúdo dos filhos').all()) { const j = it.json || {}; const res = j.results || []; if (res.length && res[0].parent && res[0].parent.block_id) kids[sem(res[0].parent.block_id)] = res.map(um); }
const lista = (topo.results || []).map(b => { const o = um(b); const k = kids[sem(b.id)]; if (k) o.f = k; return o; });
return [{ json: { resposta: { ok: true, tipo: 'pagina', nome: v.nome, props: v.props, blocos: lista, mais: !!topo.has_more } } }];
` } } });

const respLista = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Responder lista', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });
const respPagina = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Responder página', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });
const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Painel da equipe · ler página do Notion (V1)\nA equipe não tem conta no Notion. O painel abre aqui, só leitura, o Link do arquivo do card (roteiro, pautas, estratégia, funil) e as páginas ligadas a ele.\nSó abre: o link do card, o próprio card, páginas dentro dele ou da ficha do cliente, linhas da base ligada filtradas pelo Cliente do card e páginas com relação ao mesmo cliente. Editor só abre cards dele. Não grava nada no Notion.', [], { color: 4 });

export default workflow('painel-notion', 'Painel | Ler página do Notion (V1)')
  .add(pedir).to(ler).to(acesso).to(cardNode).to(alvoNode).to(paginaNode).to(baseNode).to(validar)
  .to(podeLer
    .onTrue(ehBase
      .onTrue(consultar.to(montarLista).to(respLista))
      .onFalse(blocos.to(filhos).to(blocosFilhos.to(montarPagina).to(respPagina))))
    .onFalse(recusar))
  .add(nota);
