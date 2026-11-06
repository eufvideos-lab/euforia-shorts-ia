import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

const PG = { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } };
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const ACESSO = { __rl: true, mode: 'id', value: 'ilXDZWGAcOjoajx7', cachedResultName: 'Painel equipe · acesso' };

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Buscar no painel', parameters: {
  httpMethod: 'POST', path: 'euforia-painel-busca', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

const ler = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler pedido', parameters: { jsCode: `const b = ($input.first().json.body) || {};
const u = String(b.u || '').toLowerCase();
return [{ json: { u: /^[0-9a-f]{24}$/.test(u) ? u : 'x', pin: String(b.pin || '').replace(/[^0-9]/g, '').slice(0, 6),
  q: String(b.q || '').replace(/[\\r\\n]/g, ' ').trim().slice(0, 300) } }];
` } } });

const acesso = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Achar pessoa', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: ACESSO, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'token', condition: 'eq', keyValue: '={{ $json.u }}' }] }, limit: 1 } } });

const validar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validar acesso', parameters: { jsCode: `const p = $('Ler pedido').first().json;
const r = $input.first().json || {};
const ok = !!r.token && r.token === p.u && r.ativo === true && String(r.pin) === p.pin;
let motivo = ok ? '' : 'acesso';
if (ok && p.q.length < 2) motivo = 'busca';
const ficha = String(r.ficha || '').replace(/-/g, '').toLowerCase();
if (ok && !motivo && r.papel !== 'diretor' && r.papel !== 'teste' && !/^[0-9a-f]{32}$/.test(ficha)) motivo = 'acesso';
return [{ json: { ok: !motivo, papel: r.papel || '', ficha: ficha || '-', resposta: { ok: false, motivo } } }];
` } } });

const podeSeguir = ifElse({ version: 2.2, config: { name: 'Acesso válido?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

// Lê da cópia do Entregas no Postgres (Cache | Notion → Postgres, a cada 2 min). Diretoria: tudo. Teste: só "TESTE PAINEL".
// Operação: só cards em que a pessoa é (ou foi) Responsável.
const cards = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Cards que a pessoa pode ver', credentials: PG, alwaysOutputData: true, parameters: {
  operation: 'executeQuery',
  query: `WITH e AS (
  SELECT e.id, e.editado, e.props p,
    (SELECT string_agg(t->>'plain_text', '') FROM jsonb_array_elements(COALESCE(e.props->'Entrega'->'title', '[]'::jsonb)) t) AS titulo,
    (SELECT string_agg(replace(r->>'id', '-', ''), ',') FROM jsonb_array_elements(COALESCE(e.props->'Responsável'->'relation', '[]'::jsonb)) r) AS resp
  FROM notion_cache e WHERE e.db = 'entregas' AND NOT e.arquivado)
SELECT e.id, e.editado, e.titulo, e.resp,
  e.p->'Status'->'select'->>'name' AS status, e.p->'Tipo'->'select'->>'name' AS tipo,
  e.p->'Código'->'unique_id'->>'number' AS cod,
  COALESCE(e.p->'Link do arquivo'->>'url', (SELECT string_agg(t->>'plain_text', '') FROM jsonb_array_elements(COALESCE(e.p->'Link do arquivo'->'rich_text', '[]'::jsonb)) t)) AS link,
  COALESCE(e.p->'Link da postagem'->>'url', (SELECT string_agg(t->>'plain_text', '') FROM jsonb_array_elements(COALESCE(e.p->'Link da postagem'->'rich_text', '[]'::jsonb)) t)) AS linkpost,
  e.p->'Prioridade'->'select'->>'name' AS prioridade, e.p->'Origem'->'select'->>'name' AS origem, e.p->'🏢 Escritório IA'->'select'->>'name' AS escritorio,
  (e.p->'Quantidade'->>'number')::int AS qtd,
  e.p->'Prazo'->'date'->>'start' AS prazo, e.p->'Postar em'->'date'->>'start' AS postar, e.p->'Postado em'->'date'->>'start' AS postado,
  left((SELECT string_agg(t->>'plain_text', '') FROM jsonb_array_elements(COALESCE(e.p->'Obs'->'rich_text', '[]'::jsonb)) t), 4000) AS obs,
  replace(e.p->'Cliente'->'relation'->0->>'id', '-', '') AS cliente,
  (SELECT string_agg(t->>'plain_text', '') FROM jsonb_array_elements(COALESCE(c.props->'Cliente'->'title', '[]'::jsonb)) t) AS cliente_nome
FROM e LEFT JOIN notion_cache c ON c.db = 'clientes' AND c.id = replace(e.p->'Cliente'->'relation'->0->>'id', '-', '')
WHERE CASE WHEN $1 = 'diretor' THEN true
  WHEN $1 = 'teste' THEN e.titulo ILIKE '%TESTE PAINEL%'
  ELSE (',' || COALESCE(e.resp, '') || ',') LIKE ('%,' || $2 || ',%') END;`,
  options: { queryReplacement: '={{ [ $json.papel, $json.ficha ] }}' } } } });

// Mesma busca da página: cliente, entrega, código (#475 / ESTEIRA-475), link do Drive/YouTube e, para a diretoria, nome do responsável.
const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Achar e montar', parameters: { jsCode: `const quem = $('Validar acesso').first().json;
const q = $('Ler pedido').first().json.q;
const EQUIPE = { '3ea98c0cdde08182a952f3d9a5b73575': 'Victor', '3ea98c0cdde08163bd16f0213b098cb5': 'Lorena', '3ea98c0cdde0817e87aee637a96d4fd1': 'Daniel', '3ea98c0cdde0812d9cb4c41ce70df4ae': 'Ismael', '3ea98c0cdde081299709cf901fac7275': 'Rômulo', '3ea98c0cdde0812bba06cba7e4261426': 'Escritório' };
const semAcento = t => String(t || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
const diretor = quem.papel === 'diretor';
const ids = /https?:|drive|youtu|notion/i.test(q) ? (q.match(/[-\\w]{20,}/g) || []) : [];
const cod = (q.match(/^(?:esteira[-\\s]*|#)?(\\d{1,6})$/i) || [])[1];
const termos = semAcento(q).replace(/^#/, '').split(/\\s+/).filter(Boolean);
const pts = [];
for (const it of $input.all()) {
  const c = it.json || {};
  if (!c.id) continue;
  const resp = String(c.resp || '').split(',').filter(Boolean).map(r => EQUIPE[r] || 'Outro');
  const titulo = c.titulo || '';
  const partes = titulo.split('|').map(s => s.trim()).filter(Boolean);
  const nome = partes.length > 1 ? partes.slice(1).join(' · ') : titulo;
  const clienteNome = c.cliente_nome || partes[0] || '';
  let n = 0;
  if (cod && String(c.cod) === cod) n = 100;
  else if (ids.length) { const alvo = [c.link, c.linkpost, c.obs].join(' '); if (ids.some(i => alvo.includes(i))) n = 90; }
  if (!n && !ids.length) {
    const txt = semAcento([clienteNome, titulo, c.tipo, c.status, c.cod ? 'esteira-' + c.cod + ' #' + c.cod : '', diretor ? resp.join(' ') : ''].join(' '));
    if (termos.every(t => txt.includes(t))) n = 10 + (semAcento(titulo).includes(termos.join(' ')) ? 20 : 0) + (semAcento(clienteNome).includes(termos[0]) ? 5 : 0);
  }
  if (!n) continue;
  pts.push([n, String(c.editado || ''), { id: c.id, cod: c.cod ? Number(c.cod) : null, titulo, nome, cliente: c.cliente || '', clienteNome,
    tipo: c.tipo || '', status: c.status || '', prazo: c.prazo || '', postar: c.postar || '', postado: c.postado || '',
    link: c.link || '', linkPost: c.linkpost || '', resp,
    obs: String(c.obs || '').split('\\n').slice(0, diretor ? 12 : 4).join('\\n').slice(0, diretor ? 1500 : 600),
    url: diretor ? 'https://www.notion.so/' + c.id : '', antigo: true,
    // Só a diretoria recebe o que a gaveta de edição precisa (ids do Responsável, prioridade, origem).
    ...(diretor ? { respIds: String(c.resp || '').split(',').filter(Boolean), qtd: c.qtd || 1, prioridade: c.prioridade || '', origem: c.origem || '', escritorio: c.escritorio || '' } : {}) }]);
}
pts.sort((a, b) => b[0] - a[0] || (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));
return [{ json: { resposta: { ok: true, total: pts.length, cards: pts.slice(0, 40).map(x => x[2]) } } }];
` } } });

const devolver = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Painel da equipe · busca nos antigos (V1)\nA caixa de busca do painel pergunta aqui quando quer cards antigos (token + PIN da tabela "Painel equipe · acesso").\nLê só a cópia do Entregas no Postgres (notion_cache, atualizada a cada 2 min). Não grava nada.\nDiretoria: qualquer card. Operação: só cards em que a pessoa é ou foi Responsável. Teste: só "TESTE PAINEL".\nSai sem valores: só cliente, entrega, etapa, datas, links e o começo da Obs. A diretoria edita o card antigo pela gaveta normal (fluxo Painel | Diretor).', [], { color: 4 });

export default workflow('painel-busca', 'Painel | Busca de demandas (V1)')
  .add(pedir).to(ler).to(acesso).to(validar)
  .to(podeSeguir
    .onTrue(cards.to(montar).to(devolver))
    .onFalse(recusar))
  .add(nota);
