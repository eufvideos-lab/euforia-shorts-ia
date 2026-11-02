import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

// Cache | Notion → Postgres: cópia de leitura rápida dos bancos que os painéis da diretoria usam.
// O Notion continua sendo a fonte oficial. A cada 2 minutos copia só o que mudou; uma vez por dia (3h de Recife) faz a carga
// completa e marca como arquivado o que sumiu do Notion.
const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const PG = { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } };
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };

const cada2 = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada 2 minutos', parameters: {
  rule: { interval: [{ field: 'minutes', minutesInterval: 2 }] } } } });

const rodar = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Rodar agora', parameters: {
  httpMethod: 'POST', path: 'cache-notion-rodar', responseMode: 'onReceived', options: {} } } });

const tabelas = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Garantir tabelas', credentials: PG, executeOnce: true, parameters: {
  operation: 'executeQuery',
  query: `CREATE TABLE IF NOT EXISTS notion_cache (
  db text NOT NULL, id text NOT NULL, props jsonb NOT NULL, criado timestamptz, editado timestamptz,
  arquivado boolean NOT NULL DEFAULT false, visto_em timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (db, id));
CREATE INDEX IF NOT EXISTS notion_cache_db_ativo ON notion_cache (db) WHERE NOT arquivado;
CREATE TABLE IF NOT EXISTS notion_cache_estado (db text PRIMARY KEY, ultima_sync timestamptz, ultima_completa timestamptz, linhas int, erro text, atualizado timestamptz);
CREATE TABLE IF NOT EXISTS diretoria_saldo (id serial PRIMARY KEY, dia date NOT NULL, valor numeric(14,2) NOT NULL, contas text, obs text, criado timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS diretoria_config (chave text PRIMARY KEY, valor text, atualizado timestamptz DEFAULT now());`, options: {} } } });

const estado = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Estado atual', credentials: PG, executeOnce: true, alwaysOutputData: true, parameters: {
  operation: 'executeQuery',
  query: `SELECT db, to_char(ultima_sync AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ultima_sync,
  to_char(ultima_completa AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ultima_completa FROM notion_cache_estado;`, options: {} } } });

const plano = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Plano', parameters: { jsCode: `// Quais bancos copiar e se a cópia é completa ou só do que mudou.
const BANCOS = [
  { db: 'entregas', dbid: '74b3076a325749e3bac4ba6659215e48' },
  { db: 'clientes', dbid: '3ddc91b406be49e98e630c298d9162d8' },
  { db: 'lancamentos', dbid: 'ee19f5b4342e48b3a1fa6281a1d77c06' },
  { db: 'pendencias', dbid: '0fbba4fb020149aba045b4e34436a1cd' }
];
const est = {};
for (const i of $('Estado atual').all()) if (i.json && i.json.db) est[i.json.db] = i.json;
let pediuCompleto = false;
try { pediuCompleto = !!(($('Rodar agora').first().json.body || {}).completo); } catch (e) {}
const agora = DateTime.now().setZone('America/Recife');
return BANCOS.map(b => {
  const e = est[b.db] || {};
  const ultComp = e.ultima_completa ? DateTime.fromISO(e.ultima_completa) : null;
  const madrugada = agora.hour === 3 && (!ultComp || agora.diff(ultComp, 'hours').hours > 20);
  const completo = pediuCompleto || !e.ultima_sync || !ultComp || madrugada;
  const desde = completo ? null : DateTime.fromISO(e.ultima_sync).minus({ minutes: 5 }).toUTC().toISO();
  const corpo = { page_size: 100 };
  if (!completo) corpo.filter = { timestamp: 'last_edited_time', last_edited_time: { on_or_after: desde } };
  return { json: { db: b.db, dbid: b.dbid, completo, corpo: JSON.stringify(corpo) } };
});` } } });

const consultar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Ler do Notion', credentials: NOTION, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: '={{ "https://api.notion.com/v1/databases/" + $json.dbid + "/query" }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}',
  options: { timeout: 60000, pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest',
    parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] },
    paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.has_more }}', limitPagesFetched: true, maxRequests: 200 } } } } } });

const linhas = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Juntar linhas', parameters: { jsCode: `const plano = $('Plano').all().map(i => i.json);
const porId = Object.fromEntries(plano.map(p => [p.dbid, p.db]));
const erros = {};
const vistos = {};
const rows = [];
const sem = s => String(s || '').replace(/-/g, '');
$input.all().forEach((it, n) => {
  const pi = Array.isArray(it.pairedItem) ? it.pairedItem[0] : it.pairedItem;
  const p = plano[pi && typeof pi.item === 'number' ? pi.item : n] || {};
  const j = it.json || {};
  if (j.error || !Array.isArray(j.results)) { if (p.db) erros[p.db] = String((j.error && (j.error.message || j.error)) || j.message || 'resposta sem resultados').slice(0, 300); return; }
  if (p.db) vistos[p.db] = true;
  for (const r of j.results) {
    if (!r || r.object !== 'page' || r.archived || r.in_trash) continue;
    const db = porId[sem(r.parent && r.parent.database_id)] || p.db;
    if (!db) continue;
    rows.push({ db, id: sem(r.id), props: r.properties || {}, criado: r.created_time || null, editado: r.last_edited_time || null });
  }
});
const status = plano.map(p => ({ db: p.db, completo: !!p.completo, erro: erros[p.db] || null }));
return [{ json: { linhas: JSON.stringify(rows), n: rows.length, status: JSON.stringify(status) } }];` } } });

const gravar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Gravar cópia', credentials: PG, executeOnce: true, parameters: {
  operation: 'executeQuery',
  query: `WITH ins AS (
  INSERT INTO notion_cache (db, id, props, criado, editado, arquivado, visto_em)
  SELECT x.db, x.id, x.props, x.criado, x.editado, false, now()
  FROM jsonb_to_recordset($1::jsonb) AS x(db text, id text, props jsonb, criado timestamptz, editado timestamptz)
  ON CONFLICT (db, id) DO UPDATE SET props = EXCLUDED.props, criado = EXCLUDED.criado, editado = EXCLUDED.editado, arquivado = false, visto_em = now()
  RETURNING 1)
SELECT (SELECT count(*) FROM ins) AS gravadas, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS gravado;`,
  options: { queryReplacement: '={{ [ $json.linhas ] }}' } } } });

const fechar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Atualizar estado', credentials: PG, executeOnce: true, parameters: {
  operation: 'executeQuery',
  query: `WITH p AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(db text, completo boolean, erro text)),
arq AS (
  UPDATE notion_cache c SET arquivado = true FROM p
  WHERE p.completo AND p.erro IS NULL AND c.db = p.db AND NOT c.arquivado AND c.visto_em < $2::timestamptz
  RETURNING 1)
INSERT INTO notion_cache_estado (db, ultima_sync, ultima_completa, erro, atualizado)
SELECT p.db, CASE WHEN p.erro IS NULL THEN $2::timestamptz END, CASE WHEN p.completo AND p.erro IS NULL THEN $2::timestamptz END, p.erro, now() FROM p
ON CONFLICT (db) DO UPDATE SET
  ultima_sync = COALESCE(EXCLUDED.ultima_sync, notion_cache_estado.ultima_sync),
  ultima_completa = COALESCE(EXCLUDED.ultima_completa, notion_cache_estado.ultima_completa),
  erro = EXCLUDED.erro, atualizado = now(),
  linhas = (SELECT count(*) FROM notion_cache c2 WHERE c2.db = EXCLUDED.db AND NOT c2.arquivado);`,
  options: { queryReplacement: '={{ [ $("Juntar linhas").first().json.status, $json.gravado ] }}' } } } });

const nota = sticky('## Cache | Notion → Postgres\nCópia de leitura no Postgres (banco euforia, tabela notion_cache) de Entregas, Clientes, 💸 Lançamentos e ✅ Minhas Pendências.\nA cada 2 min copia o que mudou (last_edited_time − 5 min). Carga completa às 3h de Recife (ou POST em cache-notion-rodar com {"completo": true}); o que não veio na completa vira arquivado.\nO Notion continua sendo a fonte. Os painéis leem daqui e, se a cópia tiver mais de 10 min, voltam a ler o Notion.\nLançamentos e Minhas Pendências só são lidos pelos fluxos da diretoria (login do Henrique).', [], { color: 4 });

export default workflow('cache-notion', 'Cache | Notion → Postgres')
  .add(cada2).to(tabelas).to(estado).to(plano).to(consultar).to(linhas).to(gravar).to(fechar)
  .add(rodar).to(tabelas)
  .add(nota);
