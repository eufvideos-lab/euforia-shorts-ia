import { workflow, node, trigger, switchCase, sticky } from '@n8n/workflow-sdk';

// Portal | Aprovação do cliente (V1). O cliente abre lp.grupoeuforia.tech/aprovar?t=TOKEN, vê só as peças que esperam a aprovação
// dele (status "Aguardando cliente") e as últimas já resolvidas, e clica Aprovar ou Pedir ajuste. Grava no Notion (Entregas),
// atualiza a cópia no Postgres e avisa a equipe no #avisos-operação. Nunca mostra atrasos, Obs interna, valores ou financeiro.
const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const DISCORD = { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } };
const PG = { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } };
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };
const PORTAL = { __rl: true, mode: 'id', value: 'aum3zipJOpn5uhSJ', cachedResultName: 'Portal · clientes (aprovação)' };

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Pedido do portal', parameters: {
  httpMethod: 'POST', path: 'portal-aprovacao', responseMode: 'responseNode', options: { allowedOrigins: 'https://lp.grupoeuforia.tech' } } } });

const acesso = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Acesso do cliente', executeOnce: true, alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: PORTAL, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'token', condition: 'eq', keyValue: "={{ String(($json.body || {}).t || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 64) || 'sem-token' }}" }] }, limit: 1 } } });

const conferir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Conferir link', parameters: { jsCode: `const b = $('Pedido do portal').first().json.body || {};
const a = $('Acesso do cliente').first().json || {};
const t = String(b.t || '');
const ok = t.length >= 24 && a.token === t && a.ativo === true && /^[0-9a-f]{32}$/.test(String(a.cliente_id || '').replace(/-/g, ''));
if (!ok) return [{ json: { valido: false, cliente: '' } }];
return [{ json: { valido: true, cliente: String(a.cliente_id).replace(/-/g, ''), nome: a.nome || '' } }];
` } } });

const lerCartoes = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Ler peças do cliente', credentials: PG, alwaysOutputData: true, parameters: {
  operation: 'executeQuery',
  query: `SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'p', c.props, 'e', c.editado) ORDER BY c.editado DESC), '[]'::jsonb) AS pecas
FROM notion_cache c
WHERE $1::text <> '' AND c.db = 'entregas' AND NOT c.arquivado
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(c.props->'Cliente'->'relation', '[]'::jsonb)) r WHERE replace(r->>'id', '-', '') = $1::text)
  AND (coalesce(c.props->'Status'->'select'->>'name', '') = 'Aguardando cliente'
    OR (coalesce(c.props->'Status'->'select'->>'name', '') IN ('Aprovado', 'Ajustes', 'Agendado', 'Postado') AND c.editado > now() - interval '14 days'));`,
  options: { queryReplacement: '={{ [ $json.cliente ] }}' } } } });

const decidir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar ou gravar', parameters: { jsCode: `const b = $('Pedido do portal').first().json.body || {};
const k = $('Conferir link').first().json;
if (!k.valido) return [{ json: { rota: 'negado', resp: { ok: false, erro: 'link' } } }];
const raw = $input.first().json.pecas;
const lista = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
const txt = (p, n) => ((p[n] || {}).title || (p[n] || {}).rich_text || []).map(x => x.plain_text || (x.text || {}).content || '').join('');
const st = p => ((p.Status || {}).select || {}).name || '';
const STATUS = { 'Aguardando cliente': 'aguardando', 'Ajustes': 'ajuste', 'Aprovado': 'aprovado', 'Agendado': 'aprovado', 'Postado': 'publicado' };
const pecas = lista.map(c => { const p = c.p || {};
  // Tira o nome do cliente do título ("CLIENTE | VÍDEO PADRÃO | TER 03/11" vira "VÍDEO PADRÃO | TER 03/11").
  const tit = txt(p, 'Entrega').split('|').map(s => s.trim()).filter(Boolean);
  return { id: c.id, titulo: (tit.length > 1 ? tit.slice(1) : tit).join(' · '), tipo: ((p.Tipo || {}).select || {}).name || '',
    postar: ((p['Postar em'] || {}).date || {}).start || '', link: (p['Link do arquivo'] || {}).url || '', situacao: STATUS[st(p)] || 'aprovado', obs: txt(p, 'Obs') }; })
  // Só peças de conteúdo com arquivo: "Aguardando cliente" também é usado em tarefas de setup (call, acesso), que não são para aprovar.
  .filter(x => x.tipo && x.tipo !== 'Outro' && /^https:[/][/]/.test(x.link));
const acao = String(b.acao || 'ler');
const pub = pecas.map(x => ({ id: x.id, titulo: x.titulo, tipo: x.tipo, postar: x.postar, link: x.link, situacao: x.situacao }));
if (acao === 'ler') return [{ json: { rota: 'ler', resp: { ok: true, nome: k.nome, pecas: pub } } }];
const id = String(b.id || '').replace(/-/g, '');
const alvo = pecas.find(x => x.id === id);
if (!alvo) return [{ json: { rota: 'negado', resp: { ok: false, erro: 'Essa peça não está mais esperando a sua aprovação. Atualize a página.' } } }];
if (alvo.situacao !== 'aguardando') return [{ json: { rota: 'negado', resp: { ok: false, erro: 'Essa peça já foi respondida. Atualize a página.' } } }];
const agora = DateTime.now().setZone('America/Recife').toFormat('dd/MM HH:mm');
const pedido = String(b.texto || '').replace(/\\r/g, '').trim().slice(0, 1500);
let novo, linha, aviso;
if (acao === 'aprovar') { novo = 'Aprovado'; linha = '[Portal ' + agora + '] Cliente aprovou pelo portal.';
  aviso = '✅ **' + k.nome + '** aprovou pelo portal: ' + alvo.titulo + '. Pode seguir para a postagem.'; }
else if (acao === 'ajustar') {
  if (pedido.length < 5) return [{ json: { rota: 'negado', resp: { ok: false, erro: 'Conte o que você quer ajustar.' } } }];
  novo = 'Ajustes'; linha = '[Portal ' + agora + '] Cliente pediu ajuste: ' + pedido;
  aviso = '✏️ **' + k.nome + '** pediu ajuste pelo portal em ' + alvo.titulo + ':\\n> ' + pedido.slice(0, 900).replace(/\\n/g, '\\n> '); }
else return [{ json: { rota: 'negado', resp: { ok: false, erro: 'Pedido inválido.' } } }];
const obs = (linha + (alvo.obs ? '\\n' + alvo.obs : '')).slice(0, 1990);
const corpo = { properties: { Status: { select: { name: novo } }, Obs: { rich_text: [{ type: 'text', text: { content: obs } }] } } };
return [{ json: { rota: 'notion', url: 'https://api.notion.com/v1/pages/' + id, corpo: JSON.stringify(corpo),
  aviso: JSON.stringify({ content: aviso.slice(0, 1900) + '\\n— Érica, time de suporte, Grupo Euforia', allowed_mentions: { parse: [] } }) } }];
` } } });

const rota = switchCase({ version: 3.2, config: { name: 'Rota', parameters: { rules: { values: [
  { outputKey: 'ler', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
    conditions: [{ leftValue: '={{ $json.rota }}', rightValue: 'ler', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
  { outputKey: 'notion', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
    conditions: [{ leftValue: '={{ $json.rota }}', rightValue: 'notion', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
  { outputKey: 'negado', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
    conditions: [{ leftValue: '={{ $json.rota }}', rightValue: 'negado', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } }] }, options: {} } } });

const devolver = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver peças', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resp) }}', options: {} } } });

const gravar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Gravar no Notion', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'PATCH', url: '={{ $json.url }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}',
  options: { timeout: 30000, response: { response: { neverError: true } } } } } });

const depois = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Depois do Notion', parameters: { jsCode: `const r = $input.first().json || {};
const ok = r.object === 'page' && !!r.id;
const linhas = ok ? [{ db: 'entregas', id: String(r.id).replace(/-/g, ''), props: r.properties || {}, criado: r.created_time || null, editado: r.last_edited_time || null }] : [];
return [{ json: { ok, linhas: JSON.stringify(linhas), aviso: $('Montar ou gravar').first().json.aviso } }];
` } } });

const copia = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Atualizar cópia', credentials: PG, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  operation: 'executeQuery',
  query: `INSERT INTO notion_cache (db, id, props, criado, editado, arquivado, visto_em)
SELECT x.db, x.id, x.props, x.criado, x.editado, false, now()
FROM jsonb_to_recordset($1::jsonb) AS x(db text, id text, props jsonb, criado timestamptz, editado timestamptz)
ON CONFLICT (db, id) DO UPDATE SET props = EXCLUDED.props, criado = EXCLUDED.criado, editado = EXCLUDED.editado, arquivado = false, visto_em = now();`,
  options: { queryReplacement: "={{ [ $('Depois do Notion').first().json.linhas ] }}" } } } });

const avisar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Avisar a equipe', credentials: DISCORD, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'POST', url: 'https://discord.com/api/v10/channels/1554823457781452813/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: "={{ $('Depois do Notion').first().json.ok ? $('Depois do Notion').first().json.aviso : JSON.stringify({ content: '⚠️ Portal: não consegui gravar uma resposta de cliente no Notion. Conferir o fluxo Portal | Aprovação do cliente.' }) }}",
  options: { response: { response: { neverError: true } } } } } });

const confirmar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar resposta', parameters: {
  respondWith: 'json', responseBody: "={{ JSON.stringify($('Depois do Notion').first().json.ok ? { ok: true } : { ok: false, erro: 'Não consegui registrar agora. Tente de novo em instantes.' }) }}", options: {} } } });

const negar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resp) }}', options: {} } } });

const nota = sticky('## Portal | Aprovação do cliente (V1)\nLink por cliente na tabela "Portal · clientes (aprovação)" (aum3zipJOpn5uhSJ): token, cliente_id (página do Clientes no Notion), nome, ativo. Mostra só "Aguardando cliente" + o que foi resolvido nos últimos 14 dias. Nunca mostra atraso, Obs, valor ou financeiro. Aprovar = Aprovado; ajuste = Ajustes + texto na Obs; aviso no #avisos-operação.', [], { color: 4 });

export default workflow('portal-aprovacao', 'Portal | Aprovação do cliente (V1)')
  .add(pedir).to(acesso).to(conferir).to(lerCartoes).to(decidir)
  .to(rota
    .onCase(0, devolver)
    .onCase(1, gravar.to(depois).to(copia).to(avisar).to(confirmar))
    .onCase(2, negar))
  .add(nota);
