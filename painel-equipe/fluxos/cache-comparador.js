import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

// TESTE | Painéis: cópia x Notion (temporário, 1 semana)
// Roda as mesmas consultas que os painéis fazem (Fila de cada pessoa, Pedidos, Clientes, Diretor, Central)
// pela cópia e pelo Notion, e grava as diferenças na tabela cache_comparacao. Só leitura no Notion.
// Card mexido nos últimos 5 min não conta (a cópia atualiza a cada 2 min).

const PG = { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } };
const ACESSO = { __rl: true, mode: 'id', value: 'ilXDZWGAcOjoajx7', cachedResultName: 'Painel equipe · acesso' };
const SUB = { __rl: true, mode: 'id', value: 'MsQKViah1gK8oetH', cachedResultName: 'Cache | Consultar como Notion (V1)' };
const SCHEMA = [
  { id: 'db', displayName: 'db', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
  { id: 'consulta', displayName: 'consulta', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
  { id: 'forcar', displayName: 'forcar', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }];

const relogio = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'De hora em hora (8h-20h Recife)', parameters: {
  rule: { interval: [{ field: 'cronExpression', expression: '0 11-23 * * 1-6' }] } } } });

const pessoas = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Pessoas do painel', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: ACESSO, returnAll: true } } });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar consultas', parameters: { jsCode: `// Mesmas consultas dos painéis (copiadas de fila.js, clientes-equipe.js, diretor.js e central.js).
const hoje = DateTime.now().setZone('America/Recife');
const amanha = hoje.plus({ days: hoje.weekday === 5 ? 3 : 1 }).toISODate();
const out = [];
const add = (nome, db, consulta) => out.push({ json: { nome, db, consulta: JSON.stringify(consulta), ordem: (consulta.sorts && consulta.sorts[0]) || null } });
const naoFechado = ['Postado', 'Feito', 'Cancelado', 'Aprovado', 'Agendado'].map(s => ({ property: 'Status', select: { does_not_equal: s } }));
const livre = { and: [{ property: 'Responsável', relation: { is_empty: true } }, ...['Postado', 'Feito', 'Cancelado', 'Aprovado', 'Agendado', 'Em revisão', 'Aguardando cliente'].map(s => ({ property: 'Status', select: { does_not_equal: s } }))] };
const vistos = new Set();
for (const it of $input.all()) {
  const r = it.json || {};
  if (r.ativo !== true || !r.ficha || vistos.has(r.papel + r.ficha)) continue;
  vistos.add(r.papel + r.ficha);
  let filtro;
  if (r.papel === 'teste') filtro = { and: [{ property: 'Entrega', title: { contains: 'TESTE PAINEL' } }, { property: 'Status', select: { does_not_equal: 'Postado' } }, { property: 'Status', select: { does_not_equal: 'Feito' } }, { property: 'Status', select: { does_not_equal: 'Cancelado' } }] };
  else if (['revisor', 'conferente', 'diretor'].includes(r.papel)) filtro = { or: [
    { and: [{ property: 'Responsável', relation: { contains: r.ficha } }, ...naoFechado] },
    { property: 'Status', select: { equals: 'Em revisão' } },
    { property: 'Status', select: { equals: 'Aguardando cliente' } },
    { and: [{ property: 'Status', select: { equals: 'Aprovado' } }, { property: 'Postar em', date: { on_or_before: amanha } }] },
    { and: [{ property: 'Status', select: { equals: 'Agendado' } }, { property: 'Postar em', date: { on_or_before: amanha } }] }, livre] };
  else if (r.papel === 'calls' || r.papel === 'producao') filtro = { or: [
    { and: [{ property: 'Responsável', relation: { contains: r.ficha } }, ...naoFechado] },
    { property: 'Status', select: { equals: 'Aguardando cliente' } },
    { and: [{ property: 'Status', select: { equals: 'Aprovado' } }, { property: 'Postar em', date: { on_or_before: amanha } }] },
    { and: [{ property: 'Status', select: { equals: 'Agendado' } }, { property: 'Postar em', date: { on_or_before: amanha } }] }, livre] };
  else filtro = { or: [{ and: [{ property: 'Responsável', relation: { contains: r.ficha } }, ...naoFechado] }, livre] };
  add('Fila · ' + (r.nome || r.papel), 'entregas', { filter: filtro, sorts: [{ property: 'Postar em', direction: 'ascending' }] });
}
add('Fila · Meus pedidos', 'entregas', { filter: { and: [{ property: 'Entrega', title: { contains: '(painel)' } }, { property: 'Entrega', title: { does_not_contain: 'TESTE PAINEL' } }, { timestamp: 'created_time', created_time: { on_or_after: '2026-10-26' } }] }, sorts: [{ timestamp: 'created_time', direction: 'descending' }] });
add('Clientes ativos (Fila, Diretor, Central)', 'clientes', { filter: { property: 'Situação', select: { does_not_equal: 'Encerrado' } }, sorts: [{ property: 'Cliente', direction: 'ascending' }] });
add('Clientes da equipe · fichas', 'clientes', { filter: { and: [{ property: 'Situação', select: { does_not_equal: 'Encerrado' } }, { property: 'Cliente', title: { does_not_contain: 'TESTE' } }] }, sorts: [{ property: 'Cliente', direction: 'ascending' }] });
const abertos = (desde, campos) => ({ and: [{ property: 'Status', select: { does_not_equal: 'Cancelado' } }, { or: [{ property: 'Status', select: { is_empty: true } }, ...['A fazer', 'Fazendo', 'Em revisão', 'Ajustes', 'Aguardando cliente', 'Aprovado', 'Agendado'].map(s => ({ property: 'Status', select: { equals: s } })), ...campos.map(c => ({ property: c, date: { on_or_after: desde } }))] }] });
add('Clientes da equipe · entregas do ano', 'entregas', { filter: abertos(hoje.minus({ months: 13 }).toISODate(), ['Postado em', 'Concluído em']) });
add('Diretor · visão geral', 'entregas', { filter: abertos(hoje.minus({ days: 7 }).toISODate(), ['Postado em', 'Concluído em']), sorts: [{ property: 'Prazo', direction: 'ascending' }] });
add('Diretor · entregas do ano', 'entregas', { filter: abertos(hoje.minus({ days: 400 }).toISODate(), ['Postado em', 'Concluído em']), sorts: [{ property: 'Postado em', direction: 'descending' }] });
const seg = hoje.minus({ days: hoje.weekday - 1 }).toISODate();
add('Central · cards abertos e da semana', 'entregas', { filter: { and: [{ property: 'Status', select: { does_not_equal: 'Cancelado' } }, { or: [{ property: 'Status', select: { equals: 'A fazer' } }, { property: 'Status', select: { equals: 'Fazendo' } }, { property: 'Status', select: { equals: 'Ajustes' } }, { property: 'Postar em', date: { on_or_after: seg } }] }] }, sorts: [{ property: 'Prazo', direction: 'ascending' }] });
return out;
` } } });

const pelaCopia = node({ type: 'n8n-nodes-base.executeWorkflow', version: 1.3, config: { name: 'Pela cópia', parameters: {
  source: 'database', workflowId: SUB, mode: 'each', options: { waitForSubWorkflow: true },
  workflowInputs: { mappingMode: 'defineBelow', value: { db: '={{ $json.db }}', consulta: '={{ $json.consulta }}', forcar: 'copia' }, matchingColumns: [], schema: SCHEMA } } } });

const resumirCopia = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Resumir cópia', parameters: { mode: 'runOnceForEachItem', jsCode: `const m = $('Montar consultas').itemMatching($itemIndex).json;
const chaveDe = (p, o) => { if (!o) return ''; if (o.timestamp) return String(p[o.timestamp] || '').slice(0, 16); const v = (p.properties || {})[o.property] || {}; if (v.date) return v.date.start || ''; if (v.select) return v.select.name; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join(''); return ''; };
const res = ($json.results || []).map(p => ({ id: String(p.id).replace(/-/g, ''), e: p.last_edited_time, k: chaveDe(p, m.ordem) }));
return { json: { nome: m.nome, db: m.db, consulta: m.consulta, copia: res, idade: $json.idade, fonteCopia: $json.fonte } };
` } } });

const peloNotion = node({ type: 'n8n-nodes-base.executeWorkflow', version: 1.3, config: { name: 'Pelo Notion', parameters: {
  source: 'database', workflowId: SUB, mode: 'each', options: { waitForSubWorkflow: true },
  workflowInputs: { mappingMode: 'defineBelow', value: { db: '={{ $json.db }}', consulta: '={{ $json.consulta }}', forcar: 'notion' }, matchingColumns: [], schema: SCHEMA } } } });

const comparar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Comparar', parameters: { jsCode: `const agora = Date.now();
const recente = e => e && (agora - new Date(e).getTime()) < 5 * 60 * 1000;
const copias = $('Resumir cópia').all();
const consultas = $('Montar consultas').all();
const chaveDe = (p, o) => { if (!o) return ''; if (o.timestamp) return String(p[o.timestamp] || '').slice(0, 16); const v = (p.properties || {})[o.property] || {}; if (v.date) return v.date.start || ''; if (v.select) return v.select.name; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join(''); return ''; };
const linhas = [];
$input.all().forEach((it, i) => {
  const c = (copias[i] || {}).json || {};
  const o = ((consultas[i] || {}).json || {}).ordem;
  const n = (it.json.results || []).map(p => ({ id: String(p.id).replace(/-/g, ''), e: p.last_edited_time, k: chaveDe(p, o) }));
  const ignorar = new Set([...n, ...(c.copia || [])].filter(x => recente(x.e)).map(x => x.id));
  const ln = n.map(x => x.id).filter(id => !ignorar.has(id));
  const lc = (c.copia || []).map(x => x.id).filter(id => !ignorar.has(id));
  const sc = new Set(lc), sn = new Set(ln);
  const faltando = ln.filter(id => !sc.has(id));
  const sobrando = lc.filter(id => !sn.has(id));
  // Ordem: compara a sequência dos valores do campo de ordenação (empate pode vir em qualquer ordem, como no Notion).
  const kn = n.filter(x => !ignorar.has(x.id)).map(x => x.k).join('|'), kc = (c.copia || []).filter(x => !ignorar.has(x.id)).map(x => x.k).join('|');
  const ordem = faltando.length || sobrando.length ? null : kn === kc;
  let obs = null;
  if (ordem === false) { const a = kn.split('|'), b = kc.split('|'); const k = a.findIndex((x, j) => x !== b[j]); obs = 'posição ' + k + ': Notion ' + a.slice(Math.max(0, k - 1), k + 2).join(' / ') + ' · cópia ' + b.slice(Math.max(0, k - 1), k + 2).join(' / '); }
  linhas.push({ consulta: c.nome, notion: ln.length, copia: lc.length, faltando: faltando.slice(0, 20), sobrando: sobrando.slice(0, 20),
    ordem_igual: ordem, idade_copia: c.idade, fonte_copia: c.fonteCopia, ignorados: ignorar.size, obs });
});
return [{ json: { linhas: JSON.stringify(linhas), diferentes: linhas.filter(l => l.faltando.length || l.sobrando.length).length, total: linhas.length } }];
` } } });

const garantir = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Garantir tabela', credentials: PG, executeOnce: true, parameters: {
  operation: 'executeQuery',
  query: `CREATE TABLE IF NOT EXISTS cache_comparacao (id serial PRIMARY KEY, quando timestamptz NOT NULL DEFAULT now(), consulta text, notion int, copia int,
  faltando jsonb, sobrando jsonb, ordem_igual boolean, idade_copia int, fonte_copia text, ignorados int);
ALTER TABLE cache_comparacao ADD COLUMN IF NOT EXISTS obs text;`, options: {} } } });

const gravar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Gravar comparação', credentials: PG, parameters: {
  operation: 'executeQuery',
  query: `WITH ins AS (
  INSERT INTO cache_comparacao (consulta, notion, copia, faltando, sobrando, ordem_igual, idade_copia, fonte_copia, ignorados, obs)
  SELECT consulta, notion, copia, faltando, sobrando, ordem_igual, idade_copia, fonte_copia, ignorados, obs
  FROM jsonb_to_recordset($1::jsonb) AS x(consulta text, notion int, copia int, faltando jsonb, sobrando jsonb, ordem_igual boolean, idade_copia int, fonte_copia text, ignorados int, obs text)
  RETURNING 1)
SELECT (SELECT count(*) FROM ins) AS gravadas, $2::int AS diferentes, $3::int AS total;`,
  options: { queryReplacement: '={{ [ $json.linhas, $json.diferentes, $json.total ] }}' } } } });

const nota = sticky('## TESTE | Painéis: cópia x Notion\nTemporário (1 semana). De hora em hora, seg a sáb, roda as mesmas consultas dos painéis pela cópia (notion_cache) e pelo Notion e grava as diferenças na tabela cache_comparacao (Postgres).\nCard mexido nos últimos 5 min não conta. Depois da semana: apagar este fluxo e a tabela.', [], { color: 3 });

export default workflow('teste-cache-comparador', 'TESTE | Painéis: cópia x Notion')
  .add(relogio).to(garantir).to(pessoas).to(montar).to(pelaCopia).to(resumirCopia).to(peloNotion).to(comparar).to(gravar)
  .add(nota);
