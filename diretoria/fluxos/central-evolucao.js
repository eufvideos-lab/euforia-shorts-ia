import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

// Diretoria | Painel Central (evolução): aba "Evolução" da Minha mesa. Só leitura do "Diário da diretoria", só o login do Henrique.
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const PESSOAS = { __rl: true, mode: 'id', value: 'bcimSpwlGuGZ2940', cachedResultName: 'Painel · pessoas' };
const PG = { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } };
const DIARIO = { __rl: true, mode: 'id', value: 'kp8wqRf26deB86X4', cachedResultName: 'Diário da diretoria' };

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Pedido da aba Evolução', parameters: {
  httpMethod: 'POST', path: 'diretoria-central-evolucao', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

const pessoas = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Pessoas', executeOnce: true, alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: PESSOAS, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'usuario', condition: 'eq', keyValue: 'henrique' }] }, limit: 1 } } });

const conferir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Conferir sessão', parameters: { jsCode: `const b = $('Pedido da aba Evolução').first().json.body || {};
const p = $('Pessoas').first().json || {};
const agora = DateTime.now().setZone('America/Recife');
const teste = ['manual', 'test'].includes($execution.mode);
const ok = teste || (p.usuario === 'henrique' && p.ativo !== false && p.papel === 'diretor' && String(b.usuario || '').toLowerCase() === 'henrique'
  && !!p.sessao && String(b.token || '') === p.sessao && !!p.sessao_expira && DateTime.fromISO(p.sessao_expira) > agora);
return [{ json: { ok } }];
` } } });

const pode = ifElse({ version: 2.2, config: { name: 'Sessão válida?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const diario = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Ler diário', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: DIARIO, returnAll: true } } });

// Entrou no caixa = Entradas com Status Pago no 💸 Lançamentos (cópia notion_cache), sem aporte, empréstimo nem escopo Pessoal.
const entradas = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Ler entradas pagas', credentials: PG, executeOnce: true, alwaysOutputData: true, parameters: {
  operation: 'executeQuery',
  query: `SELECT COALESCE(jsonb_agg(jsonb_build_object('dia', x.dia, 'valor', x.valor, 'desc', x.descr, 'cat', x.cat) ORDER BY x.dia DESC), '[]'::jsonb) AS entradas FROM (
  SELECT left(c.props->'Pago em'->'date'->>'start', 10) AS dia, (c.props->'Valor'->>'number')::numeric AS valor,
    coalesce(c.props->'Descrição'->'title'->0->>'plain_text', '') AS descr, coalesce(c.props->'Categoria'->'select'->>'name', '') AS cat
  FROM notion_cache c WHERE c.db = 'lancamentos' AND NOT c.arquivado
    AND c.props->'Tipo'->'select'->>'name' = 'Entrada' AND c.props->'Status'->'select'->>'name' = 'Pago'
    AND coalesce(c.props->'Categoria'->'select'->>'name', '') NOT IN ('Aporte', 'Empréstimo recebido')
    AND coalesce(c.props->'Escopo'->'select'->>'name', 'Empresa') <> 'Pessoal'
    AND c.props->'Pago em'->'date'->>'start' IS NOT NULL AND (c.props->'Valor'->>'number') IS NOT NULL) x;`, options: {} } } });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar diário', parameters: { jsCode: `const hoje = DateTime.now().setZone('America/Recife').toISODate();
const num = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);
const itens = $('Ler diário').all().map(i => i.json).filter(r => r && r.dia && r.titulo).map(r => ({
  dia: String(r.dia).slice(0, 10), projeto: r.projeto || '', area: r.area || '', tipo: r.tipo || '', titulo: String(r.titulo),
  detalhe: String(r.detalhe || '').slice(0, 1200), meta: r.meta || '', valor: num(r.valor) }))
  .sort((a, b) => b.dia.localeCompare(a.dia));
const entradas = (($('Ler entradas pagas').first() || {}).json || {}).entradas || [];
return [{ json: { resp: { ok: true, hoje, itens, entradas: entradas.map(e => ({ dia: e.dia, valor: Number(e.valor), desc: e.desc, cat: e.cat })) } } }];
` } } });

const devolver = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver diário', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resp) }}', options: {} } } });

const negar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: false, erro: "sessao" }) }}', options: {} } } });

const nota = sticky('## Aba Evolução (Painel Central)\nSó leitura do "Diário da diretoria" (kp8wqRf26deB86X4), o mesmo da aba Evolução do painel da equipe. Só o login do Henrique (sessão do Painel | Login único). Execução manual = teste sem sessão.', [], { color: 4 });

export default workflow('diretoria-central-evolucao', 'Diretoria | Painel Central (evolução)')
  .add(pedir).to(pessoas).to(conferir).to(pode.onTrue(diario.to(entradas).to(montar).to(devolver)).onFalse(negar))
  .add(nota);
