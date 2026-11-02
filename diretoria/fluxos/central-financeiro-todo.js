import { workflow, node, trigger, switchCase, sticky } from '@n8n/workflow-sdk';

// Diretoria | Painel Central (financeiro e to-do). Só o login do Henrique (sessão do Painel | Login único).
// Lê da cópia no Postgres (notion_cache) e grava no Notion, que continua sendo a fonte oficial; depois de gravar,
// atualiza a mesma linha na cópia para a mudança aparecer na hora.
const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const DISCORD = { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } };
const EVO = { httpHeaderAuth: { id: 'MqNLRX9duuYKJSR2', name: 'Evolution API' } };
const PG = { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } };
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };
const PESSOAS = { __rl: true, mode: 'id', value: 'bcimSpwlGuGZ2940', cachedResultName: 'Painel · pessoas' };
const ACESSO = { __rl: true, mode: 'id', value: 'ilXDZWGAcOjoajx7', cachedResultName: 'Painel equipe · acesso' };

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Pedido do Painel Central', parameters: {
  httpMethod: 'POST', path: 'diretoria-central', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

const pessoas = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Pessoas', executeOnce: true, alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: PESSOAS, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'usuario', condition: 'eq', keyValue: 'henrique' }] }, limit: 1 } } });

const acesso = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Acesso diretor', executeOnce: true, alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: ACESSO, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'papel', condition: 'eq', keyValue: 'diretor' }] }, returnAll: true } } });

// Tudo que chega da página é conferido aqui. Opções só das listas do Notion; valores e datas no formato certo.
const conferir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Conferir pedido', parameters: { jsCode: `const b = $('Pedido do Painel Central').first().json.body || {};
const p = $('Pessoas').first().json || {};
const agora = DateTime.now().setZone('America/Recife');
const hoje = agora.toISODate();
// Execução manual (só quem entra no n8n) serve para testar sem sessão.
const teste = ['manual', 'test'].includes($execution.mode);
const sessaoOk = teste || (p.usuario === 'henrique' && p.ativo !== false && p.papel === 'diretor' && String(b.usuario || '').toLowerCase() === 'henrique'
  && !!p.sessao && String(b.token || '') === p.sessao && !!p.sessao_expira && DateTime.fromISO(p.sessao_expira) > agora);
const nega = m => [{ json: { rota: 'negado', resp: { ok: false, erro: m } } }];
if (!sessaoOk) return nega('sessao');

const acao = String(b.acao || '');
const c = b.campos || {};
const tem = k => Object.prototype.hasOwnProperty.call(c, k);
const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n || 500);
const hex = v => { const x = String(v || '').replace(/-/g, '').toLowerCase(); return /^[0-9a-f]{32}$/.test(x) ? x : ''; };
const data = v => /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(v || '')) ? String(v) : '';
const num = v => { const n = Number(String(v == null ? '' : v).replace(/[^0-9,.-]/g, '').replace(/[.](?=[0-9]{3}([^0-9]|$))/g, '').replace(',', '.')); return isFinite(n) && String(v).trim() !== '' ? Math.round(n * 100) / 100 : NaN; };
const rt = t => ({ rich_text: (String(t).match(/[^]{1,1990}/g) || []).slice(0, 4).map(x => ({ type: 'text', text: { content: x } })) });
const tt = t => ({ title: [{ type: 'text', text: { content: String(t).slice(0, 1990) } }] });
const sel = v => ({ select: v ? { name: v } : null });
const dt = v => ({ date: v ? { start: v } : null });
const marca = agora.toFormat('dd/MM HH:mm');

const PRIO = ['🔴 Urgente', '🟠 Alta', '🟡 Média', '⚪ Baixa'];
const SETOR = ['Clientes', 'Comercial', 'Financeiro', 'Equipe', 'Jurídico', 'Pessoal'];
const STP = ['A fazer', 'Em andamento', 'Aguardando terceiros', 'Feito'];
const RESP = ['Flau', 'Isabela', 'Rômulo', 'Ismael', 'Diogo'];
const PARA = ['Rômulo', 'Ismael', 'Diogo', 'Rômulo + Ismael', 'Advogado'];
const TIPOPC = ['Resposta ao cliente', 'Entrega', 'Rescisão / Jurídico', 'Agenda', 'Processo interno'];
const PRIOPC = ['Urgente', 'Alta', 'Média', 'Baixa'];
const TIPOL = ['Entrada', 'Saída'];
const STL = ['Previsto', 'Pago', 'Possível venda', 'Não realizado', 'Cancelado'];
const CAT = ['Nova venda', 'Renovação', 'Mensalidade / recebimento', 'Avulso / upsell', 'Sinal', 'Aporte', 'Empréstimo recebido', 'Equipe', 'Comissões e bônus',
  'Ferramentas', 'Escritório', 'Tráfego', 'Equipamentos', 'Treinamentos', 'Reembolso', 'Dívida', 'Impostos e contador', 'Fatura de cartão', 'Reserva para meta',
  'Casa e família', 'Pró-labore', 'Retirada', 'Outras entradas', 'Outras saídas'];
const ESC = ['Empresa', 'Pessoal'];
const MAQ = ['longo', 'shorts', 'ajvid', 'carrossel', 'thumb', 'arte', 'idv', 'alinhamento', 'call', 'relatorio', 'recuperacao', 'pautas', 'pagina', 'funil', 'insta',
  'copy', 'outro', 'setup', 'estrategia', 'situacao', 'cronograma'];
const PAGES = 'https://api.notion.com/v1/pages';
const notion = (metodo, url, corpo) => [{ json: { rota: 'notion', acao, metodo, url, corpo: JSON.stringify(corpo) } }];

if (['todo', 'fin', 'estado'].includes(acao)) return [{ json: { rota: 'ler', acao } }];

if (acao === 'todo_criar') {
  const t = s(c.texto, 300);
  if (t.length < 2) return nega('Escreva a pendência.');
  const pr = { 'Pendência': tt(t), 'Status': sel('A fazer'), 'Responsável': sel(RESP.includes(c.resp) ? c.resp : 'Flau') };
  if (data(c.data)) pr['Data limite'] = dt(data(c.data));
  if (PRIO.includes(c.prio)) pr['Prioridade'] = sel(c.prio);
  if (SETOR.includes(c.setor)) pr['Setor'] = sel(c.setor);
  if (s(c.contexto)) pr['Contexto'] = rt(s(c.contexto, 1900));
  return notion('POST', PAGES, { parent: { database_id: '0fbba4fb020149aba045b4e34436a1cd' }, properties: pr });
}
if (acao === 'todo_mudar') {
  const id = hex(b.id); if (!id) return nega('Item inválido.');
  const pr = {};
  if (tem('status') && STP.includes(c.status)) pr['Status'] = sel(c.status);
  if (tem('data')) pr['Data limite'] = dt(data(c.data));
  if (tem('prio') && (PRIO.includes(c.prio) || c.prio === '')) pr['Prioridade'] = sel(c.prio);
  if (tem('setor') && (SETOR.includes(c.setor) || c.setor === '')) pr['Setor'] = sel(c.setor);
  if (tem('resp') && RESP.includes(c.resp)) pr['Responsável'] = sel(c.resp);
  if (tem('texto') && s(c.texto).length >= 2) pr['Pendência'] = tt(s(c.texto, 300));
  if (tem('link')) pr['Link'] = { url: /^https:[/][/][^ ]+$/.test(s(c.link)) ? s(c.link) : null };
  if (tem('contexto')) pr['Contexto'] = rt(s(c.contexto, 7900));
  if (!Object.keys(pr).length) return nega('Nada para mudar.');
  return notion('PATCH', PAGES + '/' + id, { properties: pr });
}
if (acao === 'todo_passar') {
  const t = s(c.texto, 300);
  if (!PARA.includes(c.para)) return nega('Escolha para quem passar.');
  if (t.length < 3) return nega('Escreva a tarefa.');
  const pr = { 'Tarefa': tt(t), 'Responsável': sel(c.para), 'Status': sel('A fazer'),
    'Tipo': sel(TIPOPC.includes(c.tipo) ? c.tipo : 'Processo interno'), 'Prioridade': sel(PRIOPC.includes(c.prio) ? c.prio : 'Média'),
    'Contexto': rt((s(c.contexto, 1700) ? s(c.contexto, 1700) + '\\n' : '') + '[Painel Central ' + marca + '] Passado pela direção.') };
  if (data(c.prazo)) pr['Prazo'] = dt(data(c.prazo));
  if (s(c.cliente)) pr['Cliente'] = rt(s(c.cliente, 120));
  return notion('POST', PAGES, { parent: { database_id: 'fa64ba8633e34778a7343bea2e0f0d86' }, properties: pr });
}
if (acao === 'fin_lancar') {
  const d = s(c.desc, 200), v = num(c.valor);
  if (d.length < 2) return nega('Escreva a descrição.');
  if (!TIPOL.includes(c.tipo)) return nega('Escolha entrada ou saída.');
  if (!(v > 0)) return nega('Valor inválido.');
  if (!CAT.includes(c.cat)) return nega('Escolha a categoria.');
  const st = STL.includes(c.status) ? c.status : 'Previsto';
  const venc = data(c.venc), pago = data(c.pago) || (st === 'Pago' ? hoje : '');
  if (!venc && st !== 'Pago') return nega('Informe o vencimento.');
  const pr = { 'Descrição': tt(d), 'Tipo': sel(c.tipo), 'Valor': { number: v }, 'Categoria': sel(c.cat), 'Status': sel(st),
    'Escopo': sel(ESC.includes(c.esc) ? c.esc : 'Empresa'), 'Origem': sel('Manual'), 'Vencimento': dt(venc || pago) };
  if (pago && st === 'Pago') pr['Pago em'] = dt(pago);
  pr['Observação'] = rt((s(c.obs, 1500) ? s(c.obs, 1500) + ' · ' : '') + 'Lançado pelo Painel Central em ' + marca + '.');
  return notion('POST', PAGES, { parent: { database_id: 'ee19f5b4342e48b3a1fa6281a1d77c06' }, properties: pr });
}
if (acao === 'fin_mudar') {
  const id = hex(b.id); if (!id) return nega('Lançamento inválido.');
  const pr = {};
  if (tem('status') && STL.includes(c.status)) { pr['Status'] = sel(c.status); if (c.status === 'Pago') pr['Pago em'] = dt(data(c.pago) || hoje); }
  if (tem('venc') && data(c.venc)) pr['Vencimento'] = dt(data(c.venc));
  if (tem('valor')) { const v = num(c.valor); if (!(v > 0)) return nega('Valor inválido.'); pr['Valor'] = { number: v }; }
  if (!Object.keys(pr).length) return nega('Nada para mudar.');
  return notion('PATCH', PAGES + '/' + id, { properties: pr });
}
if (acao === 'fin_saldo') {
  const v = num(c.valor);
  if (!isFinite(v)) return nega('Valor inválido.');
  const dia = data(c.dia) || hoje;
  if (dia > hoje) return nega('O saldo é de hoje ou de um dia que já passou.');
  return [{ json: { rota: 'pg', acao, j: JSON.stringify({ dia, valor: v, contas: s(c.contas, 200), obs: s(c.obs, 300) }) } }];
}
if (acao === 'fin_config') {
  const raw = s(c.imposto_pct, 10);
  const v = raw === '' ? '' : num(raw);
  if (v !== '' && !(v > 0 && v <= 30)) return nega('Percentual entre 0 e 30.');
  return [{ json: { rota: 'pg', acao, j: JSON.stringify({ imposto_pct: v === '' ? '' : String(v) }) } }];
}
if (acao === 'todo_zerar') return [{ json: { rota: 'pg', acao, j: JSON.stringify({ quando: agora.toUTC().toISO() }) } }];
if (acao === 'msg_buscar') {
  const q = s(c.q, 60);
  if (q.replace(/[^0-9A-Za-zÀ-ú]/g, '').length < 2) return nega('Digite pelo menos 2 letras.');
  return [{ json: { rota: 'msgbusca', acao, q: '%' + q.replace(/[%_]/g, '') + '%', dig: '%' + q.replace(/[^0-9]/g, '') + '%' } }];
}
if (acao === 'msg_enviar') {
  const INST = ['isabela', 'suporte'];
  if (!INST.includes(c.inst)) return nega('Escolha por qual número sai (Isabela ou suporte).');
  let para = s(c.para, 60);
  if (/^[0-9]{10,13}$/.test(para.replace(/[^0-9]/g, '')) && !/@/.test(para)) { para = para.replace(/[^0-9]/g, ''); if (para.length <= 11) para = '55' + para; }
  if (!/^([0-9]{12,13}(@s[.]whatsapp[.]net)?|[0-9-]{10,40}@g[.]us)$/.test(para)) return nega('Destinatário inválido.');
  const t = String(c.texto == null ? '' : c.texto).replace(/\\r/g, '').trim().slice(0, 3000);
  if (t.length < 2) return nega('Escreva a mensagem.');
  if (/henrique|flau/i.test(t)) return nega('A mensagem cita Henrique/Flau. Para cliente, assine como Isabela ou Érica.');
  return [{ json: { rota: 'whats', acao, inst: c.inst, corpo: JSON.stringify({ number: para, text: t }) } }];
}
if (acao === 'avisar') {
  const t = s(c.texto, 1800);
  if (t.length < 3) return nega('Escreva o aviso.');
  return [{ json: { rota: 'discord', acao, corpo: JSON.stringify({ content: t, allowed_mentions: { parse: [] } }) } }];
}
if (acao === 'maquina') {
  const dirs = $('Acesso diretor').all().map(i => i.json).filter(a => a && a.token && a.ativo !== false && a.papel === 'diretor');
  const d = dirs.find(a => /^henrique/i.test(String(a.nome || ''))) || dirs[0];
  if (!d) return nega('Sem acesso de diretor no painel da equipe.');
  if (!hex(c.cliente)) return nega('Escolha o cliente.');
  if (!MAQ.includes(c.tipo)) return nega('Escolha o que a máquina vai fazer.');
  return [{ json: { rota: 'maquina', acao, corpo: JSON.stringify({ u: d.token, pin: String(d.pin), cliente: hex(c.cliente), tipo: c.tipo,
    modo: c.modo === 'mao' ? 'mao' : 'auto', prazo: data(c.prazo), texto: s(c.texto, 1500), link: s(c.link, 500), anexos: [] }) } }];
}
return nega('Pedido inválido.');
` } } });

const rota = switchCase({ version: 3.2, config: { name: 'Rota', parameters: { rules: { values: [
  { outputKey: 'ler', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
    conditions: [{ leftValue: '={{ $json.rota }}', rightValue: 'ler', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
  { outputKey: 'notion', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
    conditions: [{ leftValue: '={{ $json.rota }}', rightValue: 'notion', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
  { outputKey: 'pg', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
    conditions: [{ leftValue: '={{ $json.rota }}', rightValue: 'pg', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
  { outputKey: 'maquina', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
    conditions: [{ leftValue: '={{ $json.rota }}', rightValue: 'maquina', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
  { outputKey: 'discord', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
    conditions: [{ leftValue: '={{ $json.rota }}', rightValue: 'discord', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
  { outputKey: 'msgbusca', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
    conditions: [{ leftValue: '={{ $json.rota }}', rightValue: 'msgbusca', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
  { outputKey: 'whats', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
    conditions: [{ leftValue: '={{ $json.rota }}', rightValue: 'whats', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
  { outputKey: 'negado', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
    conditions: [{ leftValue: '={{ $json.rota }}', rightValue: 'negado', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } }] }, options: {} } } });

// ---------- Leitura: tudo da cópia no Postgres ----------
const lerCopia = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Ler cópia', credentials: PG, parameters: {
  operation: 'executeQuery',
  query: `WITH a AS (SELECT $1::text AS acao)
SELECT a.acao,
  CASE WHEN a.acao = 'todo' THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'p', c.props, 'e', c.editado, 'c', c.criado) ORDER BY c.editado DESC), '[]'::jsonb)
    FROM notion_cache c WHERE c.db = 'pendencias' AND NOT c.arquivado
    AND (coalesce(c.props->'Status'->'select'->>'name', '') <> 'Feito' OR c.editado > now() - interval '3 days')) END AS pend,
  CASE WHEN a.acao = 'todo' THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nome',
      (SELECT string_agg(x->>'plain_text', '') FROM jsonb_array_elements(c.props->'Cliente'->'title') x))), '[]'::jsonb)
    FROM notion_cache c WHERE c.db = 'clientes' AND NOT c.arquivado
    AND coalesce(c.props->'Situação'->'select'->>'name', c.props->'Situação'->'status'->>'name', '') <> 'Encerrado') END AS clientes,
  CASE WHEN a.acao = 'fin' THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'p', c.props)), '[]'::jsonb)
    FROM notion_cache c WHERE c.db = 'lancamentos' AND NOT c.arquivado
    AND (coalesce(c.props->'Status'->'select'->>'name', '') IN ('Previsto', 'Possível venda')
      OR left(coalesce(c.props->'Pago em'->'date'->>'start', ''), 10) >= to_char(date_trunc('month', now() AT TIME ZONE 'America/Recife') - interval '1 month', 'YYYY-MM-DD'))) END AS lanc,
  CASE WHEN a.acao = 'fin' THEN (SELECT to_jsonb(s) FROM (SELECT id, to_char(dia, 'YYYY-MM-DD') AS dia, valor::float AS valor, contas, obs,
      to_char(criado AT TIME ZONE 'America/Recife', 'DD/MM HH24:MI') AS criado FROM diretoria_saldo ORDER BY dia DESC, id DESC LIMIT 1) s) END AS saldo,
  (SELECT coalesce(jsonb_object_agg(chave, valor), '{}'::jsonb) FROM diretoria_config) AS config,
  (SELECT coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) FROM (SELECT db, to_char(ultima_sync AT TIME ZONE 'America/Recife', 'DD/MM HH24:MI') AS sync, linhas, erro,
      extract(epoch FROM now() - ultima_sync)::int AS idade FROM notion_cache_estado ORDER BY db) e) AS estado
FROM a;`,
  options: { queryReplacement: '={{ [ $json.acao ] }}' } } } });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar resposta', parameters: { jsCode: `const r = $input.first().json || {};
const acao = r.acao;
const T = p => ((p && (p.title || p.rich_text)) || []).map(x => x.plain_text || '').join('').trim();
const S = p => (p && ((p.select && p.select.name) || (p.status && p.status.name))) || '';
const D = p => (p && p.date && p.date.start) ? String(p.date.start).slice(0, 10) : '';
const N = p => (p && typeof p.number === 'number') ? p.number : null;
const R = v => Math.round(v * 100) / 100;
const soma = l => R(l.reduce((t, x) => t + (x.v || 0), 0));
const agora = DateTime.now().setZone('America/Recife');
const hoje = agora.toISODate();
const DIAS = ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const rot = d => { const x = DateTime.fromISO(d); return DIAS[x.weekday] + ' ' + x.toFormat('dd/MM'); };
const estado = (r.estado || []).map(e => ({ db: e.db, sync: e.sync, linhas: e.linhas, erro: e.erro ? String(e.erro).slice(0, 200) : '', velho: (e.idade || 0) > 600 }));
const out = { ok: true, acao, hoje, rotHoje: rot(hoje), estado, config: r.config || {} };

if (acao === 'todo') {
  const corteRaw = String((r.config || {}).todo_zerado_em || '');
  const corte = corteRaw ? DateTime.fromISO(corteRaw).toUTC().startOf('minute').toMillis() : 0;
  out.corte = corteRaw;
  out.itens = (r.pend || []).map(i => { const p = i.p || {}; return { id: i.id, t: T(p['Pendência']), st: S(p['Status']), pr: S(p['Prioridade']), se: S(p['Setor']),
    re: S(p['Responsável']), d: D(p['Data limite']), cx: T(p['Contexto']).slice(0, 7900), cp: T(p['Cliente / Pessoa']), link: (p['Link'] || {}).url || '',
    e: i.e, url: 'https://www.notion.so/' + i.id, antiga: !!(corte && i.c && DateTime.fromISO(String(i.c)).toMillis() < corte) }; });
  out.clientes = (r.clientes || []).filter(x => x.nome).map(x => ({ id: x.id, nome: x.nome.trim() })).sort((a, b) => a.nome.localeCompare(b.nome));
}
if (acao === 'fin') {
  const L = (r.lanc || []).map(i => { const p = i.p || {}; return { id: i.id, d: T(p['Descrição']), tipo: S(p['Tipo']), st: S(p['Status']), v: N(p['Valor']),
    venc: D(p['Vencimento']), pago: D(p['Pago em']), cat: S(p['Categoria']), esc: S(p['Escopo']), obs: T(p['Observação']).slice(0, 200), parc: T(p['Parcela']) }; });
  const sinal = x => x.tipo === 'Saída' ? -(x.v || 0) : (x.v || 0);
  const base = r.saldo || null;
  let saldoAgora = null, depois = [];
  if (base) {
    depois = L.filter(x => x.st === 'Pago' && x.v != null && x.pago && x.pago > base.dia);
    saldoAgora = R(base.valor + depois.reduce((t, x) => t + sinal(x), 0));
  }
  const prev = L.filter(x => x.st === 'Previsto' && x.v != null);
  const ord = (a, b) => (a.venc || '9').localeCompare(b.venc || '9');
  const atrasados = prev.filter(x => x.venc && x.venc < hoje).sort(ord);
  const ate = n => agora.plus({ days: n }).toISODate();
  const dias = [];
  let acum = saldoAgora;
  for (let k = 0; k < 7; k++) {
    const d = ate(k);
    const ent = prev.filter(x => x.tipo === 'Entrada' && x.venc === d), sai = prev.filter(x => x.tipo === 'Saída' && x.venc === d);
    const e = soma(ent), sv = soma(sai);
    if (acum != null) acum = R(acum + e - sv);
    dias.push({ d, rot: rot(d), ent: e, sai: sv, saldo: acum, itens: ent.concat(sai) });
  }
  const FOLHA = ['Equipe', 'Comissões e bônus'];
  const VENDAS = ['Nova venda', 'Renovação', 'Mensalidade / recebimento', 'Avulso / upsell', 'Sinal'];
  const mesIni = agora.startOf('month').toISODate(), mesFim = agora.endOf('month').toISODate();
  const pagosMes = L.filter(x => x.st === 'Pago' && x.v != null && x.pago >= mesIni && x.pago <= mesFim);
  const cats = {};
  pagosMes.filter(x => x.tipo === 'Saída').forEach(x => { const k = x.cat || 'Sem categoria'; cats[k] = R((cats[k] || 0) + x.v); });
  const porEsc = (tipo, esc) => soma(pagosMes.filter(x => x.tipo === tipo && (x.esc || 'Empresa') === esc));
  const pct = Number(String((r.config || {}).imposto_pct || '').replace(',', '.'));
  const vendasPagas = soma(pagosMes.filter(x => x.tipo === 'Entrada' && VENDAS.includes(x.cat) && (x.esc || 'Empresa') === 'Empresa'));
  const vendasPrev = soma(prev.filter(x => x.tipo === 'Entrada' && VENDAS.includes(x.cat) && x.venc >= mesIni && x.venc <= mesFim));
  Object.assign(out, {
    base, saldoAgora, depois,
    semana: dias,
    fimSemana: acum,
    atrasados,
    aReceber: prev.filter(x => x.tipo === 'Entrada' && x.venc && x.venc >= hoje && x.venc <= ate(30)).sort(ord),
    aPagar: prev.filter(x => x.tipo === 'Saída' && x.venc && x.venc >= hoje && x.venc <= ate(30) && !FOLHA.includes(x.cat)).sort(ord),
    folha: prev.filter(x => x.tipo === 'Saída' && FOLHA.includes(x.cat) && (!x.venc || x.venc <= ate(40))).sort(ord),
    semData: prev.filter(x => !x.venc),
    possiveis: L.filter(x => x.st === 'Possível venda').sort(ord),
    semValor: L.filter(x => x.v == null && ['Previsto', 'Pago'].includes(x.st)).length,
    mes: { nome: agora.setLocale('pt-BR').toFormat('LLLL'), entradas: soma(pagosMes.filter(x => x.tipo === 'Entrada')), saidas: soma(pagosMes.filter(x => x.tipo === 'Saída')),
      entEmp: porEsc('Entrada', 'Empresa'), saiEmp: porEsc('Saída', 'Empresa'), entPes: porEsc('Entrada', 'Pessoal'), saiPes: porEsc('Saída', 'Pessoal'),
      cats: Object.keys(cats).map(k => ({ cat: k, v: cats[k] })).sort((a, b) => b.v - a.v).slice(0, 8) },
    imposto: pct > 0 ? { pct, sobrePago: R(vendasPagas * pct / 100), sobrePrevisto: R(vendasPrev * pct / 100), vendasPagas, vendasPrev } : null
  });
}
return [{ json: { resp: out } }];
` } } });

const devolver = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver leitura', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resp) }}', options: {} } } });

// ---------- Gravação no Notion + atualização da cópia ----------
const gravarNotion = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Gravar no Notion', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: '={{ $json.metodo }}', url: '={{ $json.url }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}',
  options: { timeout: 30000, response: { response: { neverError: true } } } } } });

const depoisNotion = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Depois do Notion', parameters: { jsCode: `const r = $input.first().json || {};
const ok = r.object === 'page' && !!r.id;
const MAP = { '0fbba4fb020149aba045b4e34436a1cd': 'pendencias', 'ee19f5b4342e48b3a1fa6281a1d77c06': 'lancamentos' };
const db = MAP[String((r.parent || {}).database_id || '').replace(/-/g, '')];
const id = ok ? String(r.id).replace(/-/g, '') : '';
const linhas = ok && db ? [{ db, id, props: r.properties || {}, criado: r.created_time || null, editado: r.last_edited_time || null }] : [];
const erro = String(r.message || (r.error && (r.error.message || r.error)) || 'O Notion não aceitou.').slice(0, 300);
return [{ json: { linhas: JSON.stringify(linhas), resp: ok ? { ok: true, id, url: r.url || '' } : { ok: false, erro } } }];
` } } });

const atualizarCopia = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Atualizar cópia', credentials: PG, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  operation: 'executeQuery',
  query: `INSERT INTO notion_cache (db, id, props, criado, editado, arquivado, visto_em)
SELECT x.db, x.id, x.props, x.criado, x.editado, false, now()
FROM jsonb_to_recordset($1::jsonb) AS x(db text, id text, props jsonb, criado timestamptz, editado timestamptz)
ON CONFLICT (db, id) DO UPDATE SET props = EXCLUDED.props, criado = EXCLUDED.criado, editado = EXCLUDED.editado, arquivado = false, visto_em = now();`,
  options: { queryReplacement: '={{ [ $json.linhas ] }}' } } } });

const okNotion = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar gravação', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($("Depois do Notion").first().json.resp) }}', options: {} } } });

// ---------- Saldo do banco e percentual do imposto (só no Postgres) ----------
const gravarPg = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Gravar saldo ou ajuste', credentials: PG, parameters: {
  operation: 'executeQuery',
  query: `WITH a AS (SELECT $1::text AS acao, $2::jsonb AS j),
s AS (INSERT INTO diretoria_saldo (dia, valor, contas, obs)
  SELECT (j->>'dia')::date, (j->>'valor')::numeric, nullif(j->>'contas', ''), nullif(j->>'obs', '') FROM a WHERE acao = 'fin_saldo' RETURNING id),
c AS (INSERT INTO diretoria_config (chave, valor, atualizado)
  SELECT 'imposto_pct', j->>'imposto_pct', now() FROM a WHERE acao = 'fin_config'
  ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado = now() RETURNING 1),
z AS (INSERT INTO diretoria_config (chave, valor, atualizado)
  SELECT 'todo_zerado_em', j->>'quando', now() FROM a WHERE acao = 'todo_zerar'
  ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado = now() RETURNING 1)
SELECT (SELECT count(*) FROM s) + (SELECT count(*) FROM c) + (SELECT count(*) FROM z) AS feitos;`,
  options: { queryReplacement: '={{ [ $json.acao, $json.j ] }}' } } } });

const okPg = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar saldo ou ajuste', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: Number($json.feitos) > 0 }) }}', options: {} } } });

// ---------- Mandar para a máquina: o mesmo "Pedido ao escritório" do painel da equipe ----------
const maquina = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Pedido ao escritório', onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'POST', url: 'https://n8n.grupoeuforia.tech/webhook/euforia-painel-pedido', sendHeaders: true,
  headerParameters: { parameters: [{ name: 'Origin', value: 'https://lp.grupoeuforia.tech' }] },
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}',
  options: { timeout: 60000, response: { response: { neverError: true } } } } } });

const okMaquina = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar pedido', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.ok === true ? { ok: true, quem: $json.quem || "", titulo: $json.titulo || "" } : { ok: false, erro: $json.motivo || $json.message || "não aceito" }) }}', options: {} } } });

// ---------- Aviso no Discord (#dia-a-dia): só sai quando ele clica em Enviar ----------
const avisar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Avisar no #dia-a-dia', credentials: DISCORD, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'POST', url: 'https://discord.com/api/v10/channels/1556642691410956339/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}', options: { response: { response: { neverError: true } } } } } });

const okAviso = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar aviso', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: !!$json.id }) }}', options: {} } } });

// ---------- Mandar mensagem (WhatsApp): achar contato e enviar só depois do clique em Enviar ----------
const buscarContato = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Buscar contato', credentials: PG, alwaysOutputData: true, parameters: {
  operation: 'executeQuery',
  query: `SELECT coalesce(jsonb_agg(x ORDER BY x->>'ultima' DESC NULLS LAST), '[]'::jsonb) AS lista FROM (
  SELECT jsonb_build_object('chat', c.chat_id, 'nome', c.nome, 'inst', c.origem,
    'ultima', (SELECT to_char(max(m.enviado_em) AT TIME ZONE 'America/Recife', 'YYYY-MM-DD HH24:MI') FROM mensagens m WHERE m.chat_id = c.chat_id AND m.origem = c.origem)) AS x
  FROM chats c WHERE c.origem IN ('isabela', 'suporte') AND c.chat_id NOT LIKE '%@lid'
    AND (c.nome ILIKE $1 OR (length($2) > 5 AND c.chat_id LIKE $2))
  LIMIT 30) t;`,
  options: { queryReplacement: '={{ [ $json.q, $json.dig ] }}' } } } });

const okBusca = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver contatos', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: true, lista: $json.lista || [] }) }}', options: {} } } });

const mandarWhats = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Mandar no WhatsApp', credentials: EVO, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'POST', url: '=https://api.grupoeuforia.tech/message/sendText/{{ $json.inst }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}', options: { response: { response: { neverError: true, fullResponse: true } } } } } });

const okWhats = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar mensagem', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.statusCode >= 200 && $json.statusCode < 300 ? { ok: true } : { ok: false, erro: "O WhatsApp não aceitou (número desconectado ou inválido)." }) }}', options: {} } } });

const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resp) }}', options: {} } } });

const nota = sticky('## Diretoria | Painel Central (financeiro e to-do)\nSó o login do Henrique (sessão do Painel | Login único). Lê da cópia no Postgres (notion_cache: pendencias, lancamentos, clientes) e grava no Notion (✅ Minhas Pendências, 💸 Lançamentos, Pendências de Clientes); depois atualiza a cópia.\nSaldo do banco e % do imposto ficam em diretoria_saldo e diretoria_config. Execução manual = teste sem sessão.', [], { color: 4 });

export default workflow('diretoria-central', 'Diretoria | Painel Central (financeiro e to-do)')
  .add(pedir).to(pessoas).to(acesso).to(conferir)
  .to(rota
    .onCase(0, lerCopia.to(montar).to(devolver))
    .onCase(1, gravarNotion.to(depoisNotion).to(atualizarCopia).to(okNotion))
    .onCase(2, gravarPg.to(okPg))
    .onCase(3, maquina.to(okMaquina))
    .onCase(4, avisar.to(okAviso))
    .onCase(5, buscarContato.to(okBusca))
    .onCase(6, mandarWhats.to(okWhats))
    .onCase(7, recusar))
  .add(nota);
