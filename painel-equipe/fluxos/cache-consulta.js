import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

// Cache | Consultar como Notion (V1)
// Os painéis chamam este sub-fluxo no lugar do "POST /databases/<id>/query" do Notion.
// Entrada: db ('entregas' ou 'clientes') + consulta (o mesmo corpo JSON que iria para o Notion: filter + sorts).
// Saída: um item { results: [...páginas no formato do Notion], fonte: 'copia' | 'notion', idade } — o código dos painéis não muda.
// Lê da cópia notion_cache (Postgres, atualizada a cada 2 min pelo "Cache | Notion → Postgres").
// Se a cópia estiver com mais de 10 min ou com erro, volta a ler o Notion direto (mesmo filtro), para nunca mostrar dado velho.

const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const PG = { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } };
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };

const entrada = trigger({ type: 'n8n-nodes-base.executeWorkflowTrigger', version: 1.1, config: { name: 'Pedido do painel', parameters: {
  inputSource: 'workflowInputs', workflowInputs: { values: [{ name: 'db', type: 'string' }, { name: 'consulta', type: 'string' }, { name: 'forcar', type: 'string' }] } } } });

const preparar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Preparar', parameters: { jsCode: `const BANCOS = { entregas: '74b3076a325749e3bac4ba6659215e48', clientes: '3ddc91b406be49e98e630c298d9162d8' };
const j = $input.first().json || {};
const db = String(j.db || '');
if (!BANCOS[db]) throw new Error('Banco fora da cópia: ' + db);
let c = j.consulta;
if (typeof c === 'string') { try { c = JSON.parse(c || '{}'); } catch (e) { throw new Error('Consulta inválida'); } }
c = c || {};
delete c.start_cursor;
c.page_size = 100;
// Pré-filtro no SQL: traduz o filtro do Notion para um WHERE folgado (traz um pouco a mais, nunca a menos).
// O filtro exato é refeito depois em JS ("Filtrar como o Notion"). O que não sabe traduzir vira TRUE.
const lit = v => "'" + String(v).replace(/'/g, "''") + "'";
const P = n => 'c.props->' + lit(n);
const dia = (x, d) => DateTime.fromISO(String(x).slice(0, 10)).plus({ days: d }).toISODate();
function data(col, f) {
  const [op, alvo] = Object.entries(f || {})[0] || [];
  if (op === 'is_empty') return col + " = ''";
  if (op === 'is_not_empty') return col + " <> ''";
  if (!alvo || !/^\\d{4}-\\d{2}-\\d{2}/.test(String(alvo))) return 'TRUE';
  if (op === 'on_or_after' || op === 'after') return '(' + col + " <> '' AND " + col + ' >= ' + lit(dia(alvo, -1)) + ')';
  if (op === 'on_or_before' || op === 'before') return '(' + col + " <> '' AND left(" + col + ', 10) <= ' + lit(dia(alvo, 1)) + ')';
  if (op === 'equals') return '(' + col + ' >= ' + lit(dia(alvo, -1)) + ' AND left(' + col + ', 10) <= ' + lit(dia(alvo, 1)) + ')';
  return 'TRUE';
}
function sql(f) {
  if (!f) return 'TRUE';
  if (f.and) return '(' + (f.and.map(sql).join(' AND ') || 'TRUE') + ')';
  if (f.or) return '(' + (f.or.map(sql).join(' OR ') || 'TRUE') + ')';
  if (f.timestamp) return data("coalesce(to_char(" + (f.timestamp === 'created_time' ? 'c.criado' : 'c.editado') + " AT TIME ZONE 'UTC', 'YYYY-MM-DD\\"T\\"HH24:MI:SS'), '')", f[f.timestamp]);
  const p = P(f.property);
  if (f.select || f.status) {
    const v = "coalesce(" + p + "->'select'->>'name', " + p + "->'status'->>'name', '')";
    const [op, alvo] = Object.entries(f.select || f.status)[0] || [];
    if (op === 'equals') return v + ' = ' + lit(alvo);
    if (op === 'does_not_equal') return v + ' <> ' + lit(alvo);
    if (op === 'is_empty') return v + " = ''";
    if (op === 'is_not_empty') return v + " <> ''";
    return 'TRUE';
  }
  if (f.relation) {
    const arr = "(CASE WHEN jsonb_typeof(" + p + "->'relation') = 'array' THEN " + p + "->'relation' ELSE '[]'::jsonb END)";
    const [op, alvo] = Object.entries(f.relation)[0] || [];
    if (op === 'contains') return "EXISTS (SELECT 1 FROM jsonb_array_elements(" + arr + ") r WHERE replace(r->>'id', '-', '') = " + lit(String(alvo).replace(/-/g, '').toLowerCase()) + ')';
    if (op === 'is_empty') return 'jsonb_array_length(' + arr + ') = 0';
    if (op === 'is_not_empty') return 'jsonb_array_length(' + arr + ') > 0';
    return 'TRUE';
  }
  if (f.date) return data("coalesce(" + p + "->'date'->>'start', '')", f.date);
  if (f.title || f.rich_text) {
    const [op, alvo] = Object.entries(f.title || f.rich_text)[0] || [];
    if (op !== 'contains' || !alvo) return 'TRUE';
    const t = "(SELECT coalesce(string_agg(x->>'plain_text', ''), '') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(" + p + "->'title') = 'array' THEN " + p + "->'title' WHEN jsonb_typeof(" + p + "->'rich_text') = 'array' THEN " + p + "->'rich_text' ELSE '[]'::jsonb END) x)";
    return t + ' ILIKE ' + lit('%' + String(alvo).replace(/[\\\\%_]/g, m => '\\\\' + m) + '%');
  }
  return 'TRUE';
}
const where = sql(c.filter);
const sqlTxt = "SELECT (SELECT extract(epoch FROM now() - ultima_sync)::int FROM notion_cache_estado WHERE db = $1) AS idade,\\n" +
  "  (SELECT erro FROM notion_cache_estado WHERE db = $1) AS erro,\\n" +
  "  CASE WHEN $2 = 'notion' THEN '[]'::jsonb ELSE (SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'p', c.props, 'c', c.criado, 'e', c.editado)), '[]'::jsonb)\\n" +
  "    FROM notion_cache c WHERE c.db = $1 AND NOT c.arquivado AND " + where + ") END AS linhas;";
return [{ json: { db, dbid: BANCOS[db], consulta: JSON.stringify(c), forcar: String(j.forcar || 'nada'), sql: sqlTxt } }];
` } } });

const lerCopia = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Ler cópia', credentials: PG, executeOnce: true, parameters: {
  operation: 'executeQuery', query: '={{ $json.sql }}',
  options: { queryReplacement: '={{ [ $json.db, $json.forcar ] }}' } } } });

const filtrar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Filtrar como o Notion', parameters: { jsCode: `const pedido = $('Preparar').first().json;
const r = $input.first().json || {};
const idade = r.idade == null ? 99999 : Number(r.idade);
const velha = pedido.forcar === 'notion' || (pedido.forcar !== 'copia' && (idade > 600 || !!r.erro));
if (velha) return [{ json: { velha: true, idade, consulta: pedido.consulta, dbid: pedido.dbid } }];
const q = JSON.parse(pedido.consulta);
const linhas = Array.isArray(r.linhas) ? r.linhas : JSON.parse(r.linhas || '[]');

// ---- valor de uma propriedade, no formato que o Notion usa para filtrar ----
const plano = a => (a || []).map(t => t.plain_text || (t.text && t.text.content) || '').join('');
function textoDe(v) {
  if (!v) return '';
  if (v.title) return plano(v.title);
  if (v.rich_text) return plano(v.rich_text);
  if (v.type === 'url') return v.url || '';
  if (v.type === 'email') return v.email || '';
  if (v.type === 'phone_number') return v.phone_number || '';
  if (v.type === 'formula' && v.formula) return v.formula.string == null ? '' : String(v.formula.string);
  return '';
}
const selDe = v => v ? ((v.select && v.select.name) || (v.status && v.status.name) || '') : '';
function dataDe(v) {
  if (!v) return '';
  if (v.date) return v.date.start || '';
  if (v.type === 'created_time') return v.created_time || '';
  if (v.type === 'last_edited_time') return v.last_edited_time || '';
  if (v.type === 'formula' && v.formula && v.formula.date) return v.formula.date.start || '';
  return '';
}
const semH = s => String(s || '').replace(/-/g, '').toLowerCase();
// Data: valor só-dia compara pelo dia (fuso de Recife quando o card tem hora); valor com hora compara o instante.
function cmpData(val, alvo) {
  if (!val) return null;
  const soDia = String(alvo).length <= 10;
  if (soDia) {
    const d = String(val).length > 10 ? DateTime.fromISO(val).setZone('America/Recife').toISODate() : String(val).slice(0, 10);
    return d < alvo ? -1 : d > alvo ? 1 : 0;
  }
  const a = DateTime.fromISO(val).toMillis(), b = DateTime.fromISO(alvo).toMillis();
  return a < b ? -1 : a > b ? 1 : 0;
}
function casaData(val, f) {
  if ('is_empty' in f) return !val;
  if ('is_not_empty' in f) return !!val;
  if (!val) return false;
  const [op, alvo] = Object.entries(f)[0];
  const c = cmpData(val, alvo);
  if (op === 'equals') return c === 0;
  if (op === 'before') return c < 0;
  if (op === 'after') return c > 0;
  if (op === 'on_or_before') return c <= 0;
  if (op === 'on_or_after') return c >= 0;
  throw new Error('Filtro de data não suportado: ' + op);
}
function casaTexto(val, f) {
  const v = String(val || '').toLowerCase();
  const [op, alvoR] = Object.entries(f)[0];
  const alvo = String(alvoR == null ? '' : alvoR).toLowerCase();
  if (op === 'equals') return v === alvo;
  if (op === 'does_not_equal') return v !== alvo;
  if (op === 'contains') return v.includes(alvo);
  if (op === 'does_not_contain') return !v.includes(alvo);
  if (op === 'starts_with') return v.startsWith(alvo);
  if (op === 'ends_with') return v.endsWith(alvo);
  if (op === 'is_empty') return !v;
  if (op === 'is_not_empty') return !!v;
  throw new Error('Filtro de texto não suportado: ' + op);
}
function casaSel(val, f) {
  const [op, alvo] = Object.entries(f)[0];
  if (op === 'equals') return val === alvo;
  if (op === 'does_not_equal') return val !== alvo;
  if (op === 'is_empty') return !val;
  if (op === 'is_not_empty') return !!val;
  throw new Error('Filtro de select não suportado: ' + op);
}
function casa(pg, f) {
  if (f.and) return f.and.every(x => casa(pg, x));
  if (f.or) return f.or.some(x => casa(pg, x));
  if (f.timestamp) {
    const k = f.timestamp;
    return casaData(k === 'created_time' ? pg.c : pg.e, f[k] || {});
  }
  const v = (pg.p || {})[f.property];
  if (f.title || f.rich_text || f.url || f.email || f.phone_number) return casaTexto(textoDe(v), f.title || f.rich_text || f.url || f.email || f.phone_number);
  if (f.select || f.status) return casaSel(selDe(v), f.select || f.status);
  if (f.date) return casaData(dataDe(v), f.date);
  if (f.created_time) return casaData(pg.c, f.created_time);
  if (f.last_edited_time) return casaData(pg.e, f.last_edited_time);
  if (f.checkbox) { const b = !!(v && v.checkbox); if ('equals' in f.checkbox) return b === !!f.checkbox.equals; return b !== !!f.checkbox.does_not_equal; }
  if (f.relation) {
    const ids = ((v && v.relation) || []).map(x => semH(x.id));
    const [op, alvo] = Object.entries(f.relation)[0];
    if (op === 'contains') return ids.includes(semH(alvo));
    if (op === 'does_not_contain') return !ids.includes(semH(alvo));
    if (op === 'is_empty') return ids.length === 0;
    if (op === 'is_not_empty') return ids.length > 0;
    throw new Error('Filtro de relação não suportado: ' + op);
  }
  if (f.multi_select) {
    const ns = ((v && v.multi_select) || []).map(x => x.name);
    const [op, alvo] = Object.entries(f.multi_select)[0];
    if (op === 'contains') return ns.includes(alvo);
    if (op === 'does_not_contain') return !ns.includes(alvo);
    if (op === 'is_empty') return ns.length === 0;
    if (op === 'is_not_empty') return ns.length > 0;
    throw new Error('Filtro de multi_select não suportado: ' + op);
  }
  if (f.number) {
    const n = v && typeof v.number === 'number' ? v.number : null;
    const [op, alvo] = Object.entries(f.number)[0];
    if (op === 'is_empty') return n === null;
    if (op === 'is_not_empty') return n !== null;
    if (n === null) return op === 'does_not_equal';
    if (op === 'equals') return n === alvo;
    if (op === 'does_not_equal') return n !== alvo;
    if (op === 'greater_than') return n > alvo;
    if (op === 'less_than') return n < alvo;
    if (op === 'greater_than_or_equal_to') return n >= alvo;
    if (op === 'less_than_or_equal_to') return n <= alvo;
  }
  throw new Error('Filtro não suportado na cópia: ' + JSON.stringify(f).slice(0, 200));
}

// ---- ordem: igual ao Notion (vazio vai para o fim, empate pela criação mais nova) ----
function chave(pg, s) {
  if (s.timestamp) return s.timestamp === 'created_time' ? pg.c : pg.e;
  const v = (pg.p || {})[s.property];
  if (!v) return '';
  if (v.date || v.type === 'date') return dataDe(v);
  if (v.select || v.status) return selDe(v);
  if (typeof v.number === 'number') return v.number;
  if (v.unique_id) return v.unique_id.number;
  return textoDe(v);
}
const sorts = q.sorts || [];
let saida = linhas.filter(pg => !q.filter || casa(pg, q.filter));
saida.sort((a, b) => {
  for (const s of sorts) {
    const x = chave(a, s), y = chave(b, s);
    const vx = x === '' || x == null, vy = y === '' || y == null;
    if (vx && vy) continue;
    if (vx) return 1;
    if (vy) return -1;
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR');
    if (c) return s.direction === 'descending' ? -c : c;
  }
  return String(b.c || '').localeCompare(String(a.c || ''));
});
const comH = id => id.length === 32 ? id.slice(0, 8) + '-' + id.slice(8, 12) + '-' + id.slice(12, 16) + '-' + id.slice(16, 20) + '-' + id.slice(20) : id;
const results = saida.map(pg => ({ object: 'page', id: comH(pg.id), created_time: pg.c, last_edited_time: pg.e,
  url: 'https://www.notion.so/' + pg.id, properties: pg.p || {} }));
return [{ json: { velha: false, fonte: 'copia', idade, results, has_more: false, next_cursor: null } }];
` } } });

const ehVelha = ifElse({ version: 2.2, config: { name: 'Cópia velha?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.velha }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const notion = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Ler Notion direto', credentials: NOTION, parameters: {
  method: 'POST', url: '={{ "https://api.notion.com/v1/databases/" + $json.dbid + "/query" }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.consulta }}',
  options: { pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest',
    parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] },
    paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.has_more }}', limitPagesFetched: true, maxRequests: 50 } } } } } });

const juntar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Juntar páginas do Notion', parameters: { jsCode: `const results = [];
for (const it of $input.all()) for (const p of (it.json.results || [])) results.push(p);
return [{ json: { velha: true, fonte: 'notion', idade: $('Filtrar como o Notion').first().json.idade, results, has_more: false, next_cursor: null } }];
` } } });

const pronto = node({ type: 'n8n-nodes-base.noOp', version: 1, config: { name: 'Pronto (cópia)' } });

const nota = sticky('## Cache | Consultar como Notion (V1)\nSub-fluxo dos painéis: recebe db (entregas/clientes) + o corpo da consulta do Notion (filter e sorts) e devolve { results } igual ao Notion.\nLê a cópia notion_cache (Postgres): pré-filtro folgado no SQL + filtro exato em JS. Se a cópia passou de 10 min ou deu erro, lê o Notion direto.\nforcar = "copia" (só para o comparador) ou "notion".\nO Notion continua sendo a fonte e o único lugar onde se grava.', [], { color: 4 });

// Execução com sucesso não é guardada: o resultado é grande e ficaria pesado no banco do n8n (erros continuam guardados).
export default workflow('cache-consultar', 'Cache | Consultar como Notion (V1)', { settings: { executionOrder: 'v1', saveDataSuccessExecution: 'none' } })
  .add(entrada).to(preparar).to(lerCopia).to(filtrar)
  .to(ehVelha.onTrue(notion.to(juntar)).onFalse(pronto))
  .add(nota);
