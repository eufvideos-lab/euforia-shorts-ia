import { workflow, node, trigger, ifElse, switchCase, sticky } from '@n8n/workflow-sdk';

const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const PG = { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } };
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };
const ACESSO = { __rl: true, mode: 'id', value: 'ilXDZWGAcOjoajx7', cachedResultName: 'Painel equipe · acesso' };
const PAGINAR = { pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest',
  parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] },
  paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.has_more }}', limitPagesFetched: true, maxRequests: 20 } } };

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Pedido do painel do diretor', parameters: {
  httpMethod: 'POST', path: 'euforia-painel-diretor', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

// Tudo que chega da página é conferido aqui: ids em hexa, datas AAAA-MM-DD, opções só da lista do Entregas.
const ler = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler pedido', parameters: { jsCode: `const b = ($input.first().json.body) || {};
const u = String(b.u || '').toLowerCase();
const hex = v => { const s = String(v || '').replace(/-/g, '').toLowerCase(); return /^[0-9a-f]{32}$/.test(s) ? s : ''; };
const data = v => /^\\d{4}-\\d{2}-\\d{2}$/.test(String(v || '')) ? String(v) : '';
const url = v => { const s = String(v || '').trim().slice(0, 500); return /^https:\\/\\/[^\\s]+$/.test(s) ? s : ''; };
const STATUS = ['A fazer', 'Fazendo', 'Em revisão', 'Ajustes', 'Aguardando cliente', 'Aprovado', 'Agendado', 'Postado', 'Cancelado'];
const TIPOS = ['Vídeo longo', 'Shorts', 'Podcast', 'Carrossel', 'Thumbnail', 'Arte', 'Banner', 'ID visual', 'Limpeza de canal', 'Página', 'Funil', 'Blog', 'Roteiro', 'Copy', 'Apresentação', 'Relatório', 'Estratégia', 'Insta-Blindado', 'Outro'];
const c = b.campos || {};
const tem = k => Object.prototype.hasOwnProperty.call(c, k);
const campos = {};
if (tem('status') && STATUS.includes(c.status)) campos.status = c.status;
if (tem('tipo') && TIPOS.includes(c.tipo)) campos.tipo = c.tipo;
if (tem('prioridade') && ['Urgente', 'Normal', ''].includes(c.prioridade)) campos.prioridade = c.prioridade;
if (tem('prazo')) campos.prazo = data(c.prazo);
if (tem('postar')) campos.postar = data(c.postar);
if (tem('link')) campos.link = url(c.link);
if (tem('linkPost')) campos.linkPost = url(c.linkPost);
if (tem('qtd')) campos.qtd = Math.max(1, Math.min(50, parseInt(c.qtd, 10) || 1));
if (tem('resp') && Array.isArray(c.resp)) campos.resp = c.resp.map(hex).filter(Boolean).slice(0, 5);
// Ficha do cliente: só clima, risco, recuperação, atenção e próximo alinhamento, com as opções do banco Clientes.
const k = b.ficha || {};
const temK = x => Object.prototype.hasOwnProperty.call(k, x);
const ficha = {};
if (temK('clima') && ['Eufórico', 'Neutro', 'Sensível', 'Ex-sensível', 'Em rescisão', ''].includes(k.clima)) ficha.clima = k.clima;
if (temK('risco') && ['Baixo', 'Médio', 'Alto', ''].includes(k.risco)) ficha.risco = k.risco;
if (temK('recuperacao') && ['🚨 SOS', '⏸️ Travado no cliente', '🆕 Onboarding', '✅ Estável', '👔 Direção', ''].includes(k.recuperacao)) ficha.recuperacao = k.recuperacao;
if (temK('atencao') && typeof k.atencao === 'boolean') ficha.atencao = k.atencao;
if (temK('alinhamento')) ficha.alinhamento = data(k.alinhamento);
const ACOES = ['visao', 'editar', 'criar', 'mensagens', 'clientes', 'ficha'];
return [{ json: { u: /^[0-9a-f]{24}$/.test(u) ? u : 'x', pin: String(b.pin || '').replace(/[^0-9]/g, '').slice(0, 6),
  acao: ACOES.includes(b.acao) ? b.acao : '', card: hex(b.card) || '00000000000000000000000000000000',
  cliente: hex(b.cliente), clienteNome: String(b.clienteNome || '').replace(/[|\\n]/g, ' ').trim().slice(0, 60),
  nome: String(b.nome || '').replace(/[|\\n]/g, ' ').trim().slice(0, 80), nota: String(b.nota || '').trim().slice(0, 1200), campos, ficha } }];
` } } });

const acesso = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Achar pessoa', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: ACESSO, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'token', condition: 'eq', keyValue: '={{ $json.u }}' }] }, limit: 1 } } });

// Só o papel "diretor" entra aqui.
const validar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validar acesso', parameters: { jsCode: `const p = $('Ler pedido').first().json;
const r = $input.first().json || {};
const ok = !!r.token && r.token === p.u && r.ativo === true && String(r.pin) === p.pin && r.papel === 'diretor';
let motivo = ok ? '' : 'acesso';
if (ok && !p.acao) motivo = 'acao';
if (ok && p.acao === 'criar' && (!p.cliente || !p.nome || !p.campos.tipo)) motivo = 'campos';
if (ok && p.acao === 'ficha' && (!p.cliente || !Object.keys(p.ficha).length)) motivo = 'nada';
const hoje = DateTime.now().setZone('America/Recife');
return [{ json: { ok: !motivo, acao: motivo ? 'recusar' : p.acao, nome: r.nome || '',
  semana: hoje.minus({ days: 7 }).toISODate(), ano: hoje.minus({ days: 400 }).toISODate(), resposta: { ok: false, motivo } } }];
` } } });

const caminho = switchCase({ version: 3.2, config: { name: 'O que fazer', parameters: { rules: { values: [
    { outputKey: 'visao', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ $json.acao }}', rightValue: 'visao', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
    { outputKey: 'editar', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ $json.acao }}', rightValue: 'editar', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
    { outputKey: 'criar', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ $json.acao }}', rightValue: 'criar', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
    { outputKey: 'mensagens', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ $json.acao }}', rightValue: 'mensagens', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
    { outputKey: 'clientes', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ $json.acao }}', rightValue: 'clientes', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
    { outputKey: 'ficha', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ $json.acao }}', rightValue: 'ficha', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
    { outputKey: 'recusar', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ $json.acao }}', rightValue: 'recusar', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } }
  ] }, options: {} } } });

// ---------- Visão: tudo que está aberto + o que foi ao ar nos últimos 7 dias ----------
const entregas = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Cards abertos e da semana', credentials: NOTION, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/74b3076a325749e3bac4ba6659215e48/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { and: [{ property: "Status", select: { does_not_equal: "Cancelado" } }, { or: [{ property: "Status", select: { does_not_equal: "Postado" } }, { property: "Postado em", date: { on_or_after: $json.semana } }] }] }, sorts: [{ property: "Prazo", direction: "ascending" }], page_size: 100 }) }}',
  options: PAGINAR } } });

const clientes = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Clientes ativos', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/3ddc91b406be49e98e630c298d9162d8/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { property: "Situação", select: { does_not_equal: "Encerrado" } }, sorts: [{ property: "Cliente", direction: "ascending" }], page_size: 100 }) }}',
  options: PAGINAR } } });

const montarVisao = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar visão', parameters: { jsCode: `const Z = 'America/Recife';
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; if (v.date) return v.date.start; if (v.url !== undefined) return v.url || ''; if (v.formula) return String(v.formula.string || v.formula.number || ''); return ''; };
const sem = id => String(id || '').replace(/-/g, '');
const EQUIPE = [
  { id: '3ea98c0cdde08182a952f3d9a5b73575', nome: 'Victor', papel: 'Edição' }, { id: '3ea98c0cdde08163bd16f0213b098cb5', nome: 'Lorena', papel: 'Edição' },
  { id: '3ea98c0cdde0817e87aee637a96d4fd1', nome: 'Daniel', papel: 'Edição' }, { id: '3ea98c0cdde0812d9cb4c41ce70df4ae', nome: 'Ismael', papel: 'Revisão e postagem' },
  { id: '3ea98c0cdde081299709cf901fac7275', nome: 'Rômulo', papel: 'Calls e canal' }, { id: '3ea98c0cdde0812bba06cba7e4261426', nome: 'Escritório', papel: 'Flau + IA' }];
const cli = {};
for (const it of $('Clientes ativos').all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {};
  cli[sem(p.id)] = { id: sem(p.id), nome: txt(pr['Cliente']), faixa: txt(pr['Faixa']) || txt(pr['Faixa base']), situacao: txt(pr['Situação']),
    atencao: !!(pr['🔴 Atenção redobrada'] || {}).checkbox };
}
const cards = [];
for (const it of $('Cards abertos e da semana').all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {};
  const titulo = txt(pr['Entrega']);
  const cid = sem((((pr['Cliente'] || {}).relation || [])[0] || {}).id);
  const partes = titulo.split('|').map(s => s.trim()).filter(Boolean);
  cards.push({ id: sem(p.id), cod: ((pr['Código'] || {}).unique_id || {}).number || null, url: p.url,
    titulo, nome: partes.length > 1 ? partes.slice(1).join(' · ') : titulo,
    cliente: cid, clienteNome: (cli[cid] || {}).nome || partes[0] || '',
    tipo: txt(pr['Tipo']), qtd: (pr['Quantidade'] || {}).number || 1, status: txt(pr['Status']),
    prazo: txt(pr['Prazo']), postar: txt(pr['Postar em']), postado: txt(pr['Postado em']), prioridade: txt(pr['Prioridade']),
    origem: txt(pr['Origem']), escritorio: txt(pr['🏢 Escritório IA']),
    link: txt(pr['Link do arquivo']), linkPost: txt(pr['Link da postagem']), obs: txt(pr['Obs']).slice(0, 1990),
    resp: ((pr['Responsável'] || {}).relation || []).map(r => sem(r.id)),
    comecou: txt(pr['⏱️ Começou em']), voltas: (pr['⏱️ Voltas de ajuste'] || {}).number || 0,
    horasProducao: (pr['⏱️ Horas de produção'] || {}).number || null, editado: p.last_edited_time });
}
const hoje = DateTime.now().setZone(Z);
return [{ json: { resposta: { ok: true, nome: $('Validar acesso').first().json.nome, hoje: hoje.toISODate(),
  hojeTexto: hoje.setLocale('pt-BR').toFormat("cccc, dd 'de' LLLL"), agora: hoje.toFormat('HH:mm'),
  equipe: EQUIPE, cards, clientes: Object.values(cli) } } }];
` } } });

const devolverVisao = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver visão', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

// ---------- Editar: muda só o que veio, confere o card e registra na Obs ----------
const cardAtual = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Card atual', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://api.notion.com/v1/pages/{{ $("Ler pedido").first().json.card }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, options: {} } } });

const montarEdicao = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar edição', parameters: { jsCode: `const Z = 'America/Recife';
const p = $('Ler pedido').first().json;
const quem = $('Validar acesso').first().json.nome || 'Diretor';
const card = $input.first().json || {};
const cp = card.properties || {};
const sem = id => String(id || '').replace(/-/g, '');
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; if (v.date) return v.date.start; if (v.url !== undefined) return v.url || ''; return ''; };
const NOMES = { '3ea98c0cdde08182a952f3d9a5b73575': 'Victor', '3ea98c0cdde08163bd16f0213b098cb5': 'Lorena', '3ea98c0cdde0817e87aee637a96d4fd1': 'Daniel', '3ea98c0cdde0812d9cb4c41ce70df4ae': 'Ismael', '3ea98c0cdde081299709cf901fac7275': 'Rômulo', '3ea98c0cdde0812bba06cba7e4261426': 'Escritório' };
const doEntregas = sem((card.parent || {}).database_id) === '74b3076a325749e3bac4ba6659215e48';
if (!card.id || !doEntregas) return [{ json: { ok: false, resposta: { ok: false, motivo: 'card' } } }];
const c = p.campos, props = {}, mud = [];
const br = s => s ? s.split('-').reverse().slice(0, 2).join('/') : 'vazio';
const sel = (campo, prop, rot) => { if (c[campo] === undefined) return; const a = txt(cp[prop]); if (a === c[campo]) return; props[prop] = { select: c[campo] ? { name: c[campo] } : null }; mud.push(rot + ' ' + (a || 'vazio') + ' → ' + (c[campo] || 'vazio')); };
const dat = (campo, prop, rot) => { if (c[campo] === undefined) return; const a = String(txt(cp[prop]) || '').slice(0, 10); if (a === c[campo]) return; props[prop] = { date: c[campo] ? { start: c[campo] } : null }; mud.push(rot + ' ' + br(a) + ' → ' + br(c[campo])); };
const lnk = (campo, prop, rot) => { if (c[campo] === undefined) return; const a = txt(cp[prop]); if (a === c[campo]) return; props[prop] = { url: c[campo] || null }; mud.push(rot + (c[campo] ? ' trocado' : ' apagado')); };
sel('status', 'Status', 'status');
sel('tipo', 'Tipo', 'tipo');
sel('prioridade', 'Prioridade', 'prioridade');
dat('prazo', 'Prazo', 'prazo');
dat('postar', 'Postar em', 'vai ao ar');
lnk('link', 'Link do arquivo', 'link do arquivo');
lnk('linkPost', 'Link da postagem', 'link da postagem');
if (c.qtd !== undefined && c.qtd !== ((cp['Quantidade'] || {}).number || 1)) { props['Quantidade'] = { number: c.qtd }; mud.push('quantidade → ' + c.qtd); }
if (c.resp !== undefined) {
  const antes = ((cp['Responsável'] || {}).relation || []).map(r => sem(r.id));
  if (antes.slice().sort().join() !== c.resp.slice().sort().join()) {
    props['Responsável'] = { relation: c.resp.map(id => ({ id })) };
    mud.push('responsável ' + (antes.map(i => NOMES[i] || 'outro').join(', ') || 'ninguém') + ' → ' + (c.resp.map(i => NOMES[i] || 'outro').join(', ') || 'ninguém'));
  }
}
const agora = DateTime.now().setZone(Z);
if (c.status === 'Postado' && txt(cp['Status']) !== 'Postado' && !txt(cp['Postado em'])) props['Postado em'] = { date: { start: agora.toISODate() } };
if (!mud.length && !p.nota) return [{ json: { ok: false, resposta: { ok: false, motivo: 'nada' } } }];
const linha = '[Painel ' + agora.toFormat('dd/MM HH:mm') + '] ' + quem + (mud.length ? ' mudou ' + mud.join('; ') : ' anotou') + (p.nota ? ': ' + p.nota : '');
const obs = txt(cp['Obs']);
props['Obs'] = { rich_text: [{ type: 'text', text: { content: (linha + (obs ? '\\n' + obs : '')).slice(0, 1990) } }] };
return [{ json: { ok: true, cardId: card.id, body: JSON.stringify({ properties: props }), resposta: { ok: true, linha } } }];
` } } });

const podeEditar = ifElse({ version: 2.2, config: { name: 'Edição válida?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const salvar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Salvar no Entregas', credentials: NOTION, parameters: {
  method: 'PATCH', url: '=https://api.notion.com/v1/pages/{{ $("Montar edição").first().json.cardId }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $("Montar edição").first().json.body }}', options: {} } } });

const okEdicao = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar edição', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($("Montar edição").first().json.resposta) }}', options: {} } } });

const erroEdicao = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar edição', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

// ---------- Criar card novo ----------
const montarCriacao = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar card novo', parameters: { jsCode: `const Z = 'America/Recife';
const p = $('Ler pedido').first().json;
const quem = $('Validar acesso').first().json.nome || 'Diretor';
const c = p.campos;
const agora = DateTime.now().setZone(Z);
const props = {
  'Entrega': { title: [{ type: 'text', text: { content: (p.clienteNome ? p.clienteNome.toUpperCase() + ' | ' : '') + p.nome } }] },
  'Cliente': { relation: [{ id: p.cliente }] },
  'Tipo': { select: { name: c.tipo } },
  'Status': { select: { name: c.status || 'A fazer' } },
  'Origem': { select: { name: 'Extra' } },
  'Obs': { rich_text: [{ type: 'text', text: { content: ('[Painel ' + agora.toFormat('dd/MM HH:mm') + '] ' + quem + ' criou pelo painel do diretor' + (p.nota ? ': ' + p.nota : '')).slice(0, 1990) } }] } };
if (c.resp && c.resp.length) props['Responsável'] = { relation: c.resp.map(id => ({ id })) };
if (c.prazo) props['Prazo'] = { date: { start: c.prazo } };
if (c.postar) props['Postar em'] = { date: { start: c.postar } };
if (c.prioridade) props['Prioridade'] = { select: { name: c.prioridade } };
if (c.qtd) props['Quantidade'] = { number: c.qtd };
if (c.link) props['Link do arquivo'] = { url: c.link };
return [{ json: { body: JSON.stringify({ parent: { database_id: '74b3076a325749e3bac4ba6659215e48' }, properties: props }) } }];
` } } });

const criar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Criar no Entregas', credentials: NOTION, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/pages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.body }}', options: {} } } });

const okCriacao = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar card novo', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: true, id: String($json.id || "").replace(/-/g, "") }) }}', options: {} } } });

// ---------- Mensagens que a equipe mandou nos grupos de cliente (3 dias) ----------
const mensagens = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Mensagens da equipe', credentials: PG, alwaysOutputData: true, parameters: {
  operation: 'executeQuery',
  query: `SELECT m.origem, m.chat_id,
  COALESCE((SELECT c.nome FROM chats c WHERE c.chat_id = m.chat_id AND c.nome IS NOT NULL LIMIT 1), m.chat_id) AS grupo,
  m.tipo, left(COALESCE(m.texto, '[' || m.tipo || ']'), 600) AS texto,
  to_char(m.enviado_em AT TIME ZONE 'America/Recife', 'YYYY-MM-DD"T"HH24:MI') AS quando
FROM mensagens m
WHERE m.from_me AND m.origem IN ('suporte-ismael', 'suporte-romulo', 'suporte')
  AND m.chat_id LIKE '%@g.us' AND m.enviado_em > now() - interval '3 days'
  AND m.tipo NOT IN ('reactionMessage', 'protocolMessage', 'pollUpdateMessage')
ORDER BY m.enviado_em DESC
LIMIT 400;`, options: {} } } });

// No número do suporte, quem é da equipe assina "*Rômulo:*" no começo. Sem assinatura, é a Érica (automática) ou o escritório.
const montarMensagens = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar mensagens', parameters: { jsCode: `const QUEM = { 'suporte-ismael': 'Ismael', 'suporte-romulo': 'Rômulo', 'suporte': 'Érica e escritório' };
const itens = $input.all().map(i => i.json).filter(r => r && r.chat_id).map(r => {
  const t = String(r.texto || ''), m = t.match(/^\\*([A-Za-zÀ-ú ]{2,20}):\\*\\s*/);
  return { quem: m ? m[1].trim() : (QUEM[r.origem] || r.origem), grupo: r.grupo, chat: r.chat_id, texto: m ? t.slice(m[0].length) : t, quando: r.quando };
});
return [{ json: { resposta: { ok: true, itens } } }];
` } } });

const devolverMensagens = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver mensagens', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

// ---------- Clientes: ficha, contrato e o que já foi entregue ----------
const fichas = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Fichas dos clientes', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/3ddc91b406be49e98e630c298d9162d8/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { property: "Situação", select: { does_not_equal: "Encerrado" } }, sorts: [{ property: "Cliente", direction: "ascending" }], page_size: 100 }) }}',
  options: PAGINAR } } });

// Tudo que foi ao ar no último ano e tudo que ainda está aberto (para contar o feito e o que falta).
const doAno = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Entregas do ano', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/74b3076a325749e3bac4ba6659215e48/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { and: [{ property: "Status", select: { does_not_equal: "Cancelado" } }, { or: [{ property: "Status", select: { does_not_equal: "Postado" } }, { property: "Postado em", date: { on_or_after: $("Validar acesso").first().json.ano } }] }] }, sorts: [{ property: "Postado em", direction: "descending" }], page_size: 100 }) }}',
  options: { pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest',
    parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] },
    paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.has_more }}', limitPagesFetched: true, maxRequests: 50 } } } } } });

const conversas = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Conversa nos grupos', credentials: PG, alwaysOutputData: true, executeOnce: true, parameters: {
  operation: 'executeQuery',
  query: `SELECT m.chat_id,
  (SELECT c.nome FROM chats c WHERE c.chat_id = m.chat_id AND c.nome IS NOT NULL LIMIT 1) AS grupo,
  to_char(max(m.enviado_em) AT TIME ZONE 'America/Recife', 'YYYY-MM-DD"T"HH24:MI') AS ultima,
  count(*) FILTER (WHERE m.enviado_em > now() - interval '7 days') AS semana
FROM mensagens m
WHERE m.chat_id LIKE '%@g.us' AND m.enviado_em > now() - interval '90 days'
  AND m.tipo NOT IN ('reactionMessage', 'protocolMessage', 'pollUpdateMessage')
GROUP BY m.chat_id;`, options: {} } } });

// O contrato vem do texto "Resumo do contrato": "6 meses, contrato de 25/04/2026. Total: 20 longos, 60 shorts, 20 carrosséis".
// Sem total no texto, a conta usa o ritmo por semana da ficha desde o início.
const montarClientes = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar clientes', parameters: { jsCode: `const Z = 'America/Recife';
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; if (v.date) return v.date.start; if (v.url !== undefined) return v.url || ''; if (v.formula) return String(v.formula.string || v.formula.number || ''); if (v.rollup) return String((v.rollup.date || {}).start || v.rollup.number || ''); if (v.phone_number !== undefined) return v.phone_number || ''; return ''; };
const num = v => (v && typeof v.number === 'number') ? v.number : null;
const sem = id => String(id || '').replace(/-/g, '');
const norm = s => String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/ct/g, 't').replace(/[^a-z0-9 ]/g, ' ').replace(/\\s+/g, ' ').trim();
const VAZIAS = new Set(['grupo', 'euforia', 'assessoria', 'edl', 'protocolo', 'dra', 'dr', 'consultoria', 'the', 'dos', 'das', 'com']);
const palavras = s => norm(s).split(' ').filter(w => w.length > 2 && !VAZIAS.has(w));
const hoje = DateTime.now().setZone(Z).startOf('day');
const RESP = { '3ea98c0cdde08182a952f3d9a5b73575': 'Victor', '3ea98c0cdde08163bd16f0213b098cb5': 'Lorena', '3ea98c0cdde0817e87aee637a96d4fd1': 'Daniel', '3ea98c0cdde0812d9cb4c41ce70df4ae': 'Ismael', '3ea98c0cdde081299709cf901fac7275': 'Rômulo', '3ea98c0cdde0812bba06cba7e4261426': 'Escritório' };
const GRUPO = { 'Vídeo longo': 'longos', 'Podcast': 'longos', 'Shorts': 'shorts', 'Carrossel': 'carrosseis', 'Thumbnail': 'thumbs' };
const ABERTO = ['A fazer', 'Fazendo', 'Ajustes', 'Em revisão', 'Aguardando cliente', 'Aprovado', 'Agendado'];
const grupos = $('Conversa nos grupos').all().map(i => i.json).filter(r => r && r.chat_id).map(r => Object.assign(r, { p: palavras(r.grupo) }));
const entregas = {};
for (const it of $('Entregas do ano').all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {};
  const cid = sem((((pr['Cliente'] || {}).relation || [])[0] || {}).id); if (!cid) continue;
  const titulo = txt(pr['Entrega']), partes = titulo.split('|').map(x => x.trim()).filter(Boolean);
  (entregas[cid] = entregas[cid] || []).push({ id: sem(p.id), nome: partes.length > 1 ? partes.slice(1).join(' · ') : titulo, tipo: txt(pr['Tipo']),
    qtd: num(pr['Quantidade']) || 1, status: txt(pr['Status']), prazo: txt(pr['Prazo']).slice(0, 10), postar: txt(pr['Postar em']).slice(0, 10),
    postado: txt(pr['Postado em']).slice(0, 10), linkPost: txt(pr['Link da postagem']), resp: ((pr['Responsável'] || {}).relation || []).map(r => RESP[sem(r.id)] || 'outro') });
}
const clientes = [];
for (const it of $('Fichas dos clientes').all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {}, id = sem(p.id), nome = txt(pr['Cliente']);
  const resumo = txt(pr['Resumo do contrato']);
  const mm = resumo.match(/(\\d{1,2})\\s*meses/i), dm = resumo.match(/contrato de (\\d{2})\\/(\\d{2})\\/(\\d{4})/i);
  const entrada = txt(pr['Entrada (onboarding)']).slice(0, 10);
  const inicio = dm ? dm[3] + '-' + dm[2] + '-' + dm[1] : entrada;
  const meses = mm ? Number(mm[1]) : null;
  const tot = re => { const m = resumo.match(re); return m ? Number(m[1]) : null; };
  const total = { longos: tot(/(\\d+)\\s*(?:v[ií]deos? )?longos/i), shorts: tot(/(\\d+)\\s*shorts/i), carrosseis: tot(/(\\d+)\\s*carross/i) };
  const ritmo = { longos: num(pr['Longos por semana']), shorts: num(pr['Shorts por semana']), carrosseis: num(pr['Carrosséis por semana']), thumbs: num(pr['Thumbs por semana']) };
  let contrato = null;
  if (inicio) {
    const ini = DateTime.fromISO(inicio, { zone: Z });
    const fim = meses ? ini.plus({ months: meses }) : null;
    const decorrido = Math.max(0, hoje.diff(ini, 'days').days);
    contrato = { inicio, meses, fim: fim ? fim.toISODate() : '', mes: Math.floor(hoje.diff(ini, 'months').months) + 1,
      pct: fim ? Math.max(0, Math.min(100, Math.round(decorrido / Math.max(1, fim.diff(ini, 'days').days) * 100))) : null,
      faltamDias: fim ? Math.round(fim.diff(hoje, 'days').days) : null, semanas: Math.floor(decorrido / 7) };
  }
  const lista = entregas[id] || [];
  const feito = { longos: 0, shorts: 0, carrosseis: 0, thumbs: 0 }, mes = { longos: 0, shorts: 0, carrosseis: 0, thumbs: 0 };
  const ini = contrato ? contrato.inicio : '', mes0 = hoje.startOf('month').toISODate();
  for (const e of lista) { const g = GRUPO[e.tipo]; if (!g || e.status !== 'Postado') continue;
    if (!ini || (e.postado || '') >= ini) feito[g] += e.qtd; if ((e.postado || '') >= mes0) mes[g] += e.qtd; }
  const abertos = lista.filter(e => ABERTO.includes(e.status));
  const atrasados = abertos.filter(e => ['A fazer', 'Fazendo', 'Ajustes'].includes(e.status) && e.prazo && e.prazo < hoje.toISODate()).length;
  const postados = lista.filter(e => e.status === 'Postado' && e.postado).slice(0, 12);
  const gid = txt(pr['Grupo WhatsApp (ID)']);
  // Grupo: pelo id gravado pela Máquina de Setup; senão pelo nome (o que tem mais palavras do nome do cliente; uma palavra só vale se for o único grupo com ela e não for só o primeiro nome).
  let grupo = grupos.find(g => g.chat_id === gid) || null;
  if (!grupo) {
    const nn = palavras(nome);
    const pont = grupos.map(g => ({ g, n: nn.filter(w => g.p.includes(w)).length, sobrenome: nn.slice(1).some(w => g.p.includes(w)) })).filter(x => x.n).sort((a, b) => b.n - a.n);
    if (pont.length && (pont[0].n >= 2 || (pont[0].n === 1 && pont.filter(x => x.n === 1).length === 1 && (nn.length === 1 || pont[0].sobrenome)))) grupo = pont[0].g;
  }
  clientes.push({ id, nome, url: p.url, situacao: txt(pr['Situação']), fase: txt(pr['Fase']), clima: txt(pr['Clima']), risco: txt(pr['Risco de cancelamento']),
    recuperacao: txt(pr['Recuperação']), atencao: !!(pr['🔴 Atenção redobrada'] || {}).checkbox, faixa: txt(pr['Faixa']) || txt(pr['Faixa base']), tipo: txt(pr['Tipo de cliente']),
    resumo: resumo.slice(0, 1500), obs: txt(pr['Obs importante']).slice(0, 1500), extras: ((pr['Extras do contrato'] || {}).multi_select || []).map(x => x.name),
    alinhamento: txt(pr['Próximo alinhamento']).slice(0, 10), ultimaPostagem: txt(pr['Última postagem']).slice(0, 10), canalDesde: txt(pr['Canal no ar desde']).slice(0, 10),
    drive: txt(pr['Drive']), youtube: txt(pr['YouTube']), instagram: txt(pr['Instagram']), tiktok: txt(pr['TikTok']),
    contrato, total, ritmo, feito, mes, atrasados, abertos: abertos.slice(0, 40), postados,
    grupo: grupo ? { nome: grupo.grupo || '', ultima: grupo.ultima || '', semana: Number(grupo.semana || 0) } : null });
}
return [{ json: { resposta: { ok: true, hoje: hoje.toISODate(), agora: DateTime.now().setZone(Z).toFormat('HH:mm'), clientes } } }];
` } } });

const devolverClientes = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver clientes', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

// ---------- Ficha: clima, risco, recuperação, atenção e próximo alinhamento ----------
const fichaAtual = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Ficha atual', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://api.notion.com/v1/pages/{{ $("Ler pedido").first().json.cliente }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, options: {} } } });

const montarFicha = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar ficha', parameters: { jsCode: `const p = $('Ler pedido').first().json;
const pg = $input.first().json || {};
const sem = id => String(id || '').replace(/-/g, '');
if (!pg.id || sem((pg.parent || {}).database_id) !== '3ddc91b406be49e98e630c298d9162d8') return [{ json: { ok: false, resposta: { ok: false, motivo: 'cliente' } } }];
const f = p.ficha, props = {};
if (f.clima !== undefined) props['Clima'] = { select: f.clima ? { name: f.clima } : null };
if (f.risco !== undefined) props['Risco de cancelamento'] = { select: f.risco ? { name: f.risco } : null };
if (f.recuperacao !== undefined) props['Recuperação'] = { select: f.recuperacao ? { name: f.recuperacao } : null };
if (f.atencao !== undefined) props['🔴 Atenção redobrada'] = { checkbox: f.atencao };
if (f.alinhamento !== undefined) props['Próximo alinhamento'] = { date: f.alinhamento ? { start: f.alinhamento } : null };
return [{ json: { ok: true, id: pg.id, body: JSON.stringify({ properties: props }), resposta: { ok: true } } }];
` } } });

const podeFicha = ifElse({ version: 2.2, config: { name: 'Ficha válida?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const salvarFicha = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Salvar ficha', credentials: NOTION, parameters: {
  method: 'PATCH', url: '=https://api.notion.com/v1/pages/{{ $("Montar ficha").first().json.id }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $("Montar ficha").first().json.body }}', options: {} } } });

const okFicha = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar ficha', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: true }) }}', options: {} } } });

const erroFicha = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar ficha', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Painel do diretor (V1)\nPágina grupoeuforia.com.br/diretor?u=<token> + PIN de 6 números. Só o papel "diretor" da tabela "Painel equipe · acesso" entra.\nAções: visao (cards abertos + postados nos últimos 7 dias, clientes ativos, equipe), editar (status, tipo, prioridade, prazo, vai ao ar, links, quantidade, responsável; registra "[Painel ...] Flau mudou ..." no topo da Obs), criar (card novo, Origem Extra), mensagens (o que Ismael, Rômulo e o suporte mandaram nos grupos de cliente nos últimos 3 dias), clientes (ficha, contrato, feito x total, abertos, postados, conversa no grupo), ficha (muda clima, risco, recuperação, atenção e próximo alinhamento no banco Clientes).\nNão apaga card: para tirar da fila, status Cancelado.', [], { color: 4 });

export default workflow('painel-diretor', 'Painel | Diretor (V1)')
  .add(pedir).to(ler).to(acesso).to(validar)
  .to(caminho
    .onCase(0, entregas.to(clientes).to(montarVisao).to(devolverVisao))
    .onCase(1, cardAtual.to(montarEdicao).to(podeEditar.onTrue(salvar.to(okEdicao)).onFalse(erroEdicao)))
    .onCase(2, montarCriacao.to(criar).to(okCriacao))
    .onCase(3, mensagens.to(montarMensagens).to(devolverMensagens))
    .onCase(4, fichas.to(doAno).to(conversas).to(montarClientes).to(devolverClientes))
    .onCase(5, fichaAtual.to(montarFicha).to(podeFicha.onTrue(salvarFicha.to(okFicha)).onFalse(erroFicha)))
    .onCase(6, recusar))
  .add(nota);
