import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };
const ACESSO = { __rl: true, mode: 'id', value: 'ilXDZWGAcOjoajx7', cachedResultName: 'Painel equipe · acesso' };
const MARCAS = { __rl: true, mode: 'id', value: 'eyJ8FrBneYnl3Htu', cachedResultName: 'Painel · grade marcações' };

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Grade do painel', parameters: {
  httpMethod: 'POST', path: 'euforia-painel-grade', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

const ler = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler pedido', parameters: { jsCode: `const b = ($input.first().json.body) || {};
const u = String(b.u || '').toLowerCase();
const id = v => { const s = String(v || '').replace(/-/g, '').toLowerCase(); return /^[0-9a-f]{32}$/.test(s) ? s : ''; };
const s = b.slot || {};
const PLAT = ['YouTube', 'TikTok', 'Instagram', 'Blog'];
const FORM = ['Vídeo padrão', 'Podcast', 'Corte horizontal', 'Shorts', 'Blog', 'Carrossel', 'Reels', 'Outro'];
const DIAS = ['1 Seg', '2 Ter', '3 Qua', '4 Qui', '5 Sex', '6 Sáb', '7 Dom'];
const hora = String(s.horario || '').trim();
return [{ json: { u: /^[0-9a-f]{24}$/.test(u) ? u : 'x', pin: String(b.pin || '').replace(/[^0-9]/g, '').slice(0, 6),
  acao: ['salvar', 'pausar', 'reativar', 'marcar'].includes(b.acao) ? b.acao : 'listar',
  marca: ['programado', 'postado'].includes(b.marca) ? b.marca : '', data: /^\\d{4}-\\d{2}-\\d{2}$/.test(String(b.data || '')) ? String(b.data) : '',
  link: (l => /^https?:\\/\\/[^\\s<>"']+\\.[^\\s<>"']+$/i.test(l) ? l.slice(0, 500) : '')(String(b.link || '').trim()),
  slot: { id: id(s.id), cliente: id(s.cliente), plataforma: PLAT.includes(s.plataforma) ? s.plataforma : '', formato: FORM.includes(s.formato) ? s.formato : '',
    dia: DIAS.includes(s.dia) ? s.dia : '', horario: (m => m && Number(m[1]) < 24 && Number(m[2] || 0) < 60 ? m[1].padStart(2, '0') + ':' + (m[2] || '00') : '')(hora.toLowerCase().match(/^(\\d{1,2})(?:[:h](\\d{2})?)?$/)),
    qtd: Math.max(1, Math.min(10, parseInt(s.qtd, 10) || 1)), obs: String(s.obs || '').trim().slice(0, 300) } } }];
` } } });

const acesso = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Achar pessoa', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: ACESSO, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'token', condition: 'eq', keyValue: '={{ $json.u }}' }] }, limit: 1 } } });

// Para ajustar ou pausar, confere que o horário existe e é mesmo da Grade de Postagem.
const slotAtual = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Horário atual', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://api.notion.com/v1/pages/{{ $("Ler pedido").first().json.slot.id || "00000000000000000000000000000000" }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, options: {} } } });

const clienteNode = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Cliente do horário', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://api.notion.com/v1/pages/{{ $("Ler pedido").first().json.slot.cliente || "00000000000000000000000000000000" }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, options: {} } } });

// Todos veem a grade. Só Ismael (revisor), Rômulo (calls) e o teste mudam; o teste só mexe no cliente TESTE Portal.
const validar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validar pedido', parameters: { jsCode: `const Z = 'America/Recife';
const p = $('Ler pedido').first().json;
const r = $('Achar pessoa').first().json || {};
const atual = $('Horário atual').first().json || {};
const cli = $('Cliente do horário').first().json || {};
const sem = v => String(v || '').replace(/-/g, '');
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; return ''; };
const acessoOk = !!r.token && r.token === p.u && r.ativo === true && String(r.pin) === p.pin;
const teste = r.papel === 'teste';
const muda = ['revisor', 'calls', 'teste', 'diretor'].includes(r.papel);
const TESTE = '40598c0cdde081c78b98f3984e7009e8';
// Cliente que a pessoa não pode atender (decisão da diretoria 04/11: Victor fora da Ana Mangia e da Além do CNPJ).
const BLOQUEIO = { '3ea98c0cdde08182a952f3d9a5b73575': ['3ea98c0cdde081578305ec053b215822', '3ea98c0cdde081aaa244c92b808677f9'] };

const ap = atual.properties || {};
const daGrade = sem((atual.parent || {}).database_id) === '2d21b7a7166240f5afaa4d697c3d1ae8';
const cliAtual = sem((((ap['Cliente'] || {}).relation || [])[0] || {}).id);
const s = p.slot;
let erro = '';
if (!acessoOk) erro = 'acesso';
else if (p.acao !== 'listar' && p.acao !== 'marcar' && !muda) erro = 'permissao';
else if (p.acao !== 'listar' && s.id && !daGrade) erro = 'horario';
else if (p.acao === 'salvar' && (!s.cliente || sem((cli.parent || {}).database_id) !== '3ddc91b406be49e98e630c298d9162d8')) erro = 'cliente';
else if (p.acao === 'salvar' && (!s.plataforma || !s.formato || !s.dia)) erro = 'campos';
else if (teste && p.acao !== 'listar' && ((s.cliente && s.cliente !== TESTE) || (s.id && cliAtual !== TESTE))) erro = 'permissao';
else if ((p.acao === 'pausar' || p.acao === 'reativar' || p.acao === 'marcar') && !s.id) erro = 'horario';
if (!erro && p.acao !== 'listar' && (BLOQUEIO[r.ficha] || []).some(c => c === cliAtual || c === s.cliente)) erro = 'bloqueio';
const agora = DateTime.now().setZone(Z);
// Marcar Programado / Postado: vale para o dia daquele horário, de 3 semanas atrás até 2 semanas à frente.
if (!erro && p.acao === 'marcar') {
  const d = DateTime.fromISO(p.data, { zone: Z });
  const diaSlot = txt(ap['Dia']);
  const dif = d.isValid ? Math.round(d.startOf('day').diff(agora.startOf('day'), 'days').days) : 99;
  if (!d.isValid || !diaSlot || Number(diaSlot[0]) !== d.weekday || dif < -21 || dif > 14) erro = 'data';
  // Henrique 05/11: só marca Programado/Postado com o link da publicação.
  else if (p.marca && !p.link) erro = 'link';
}
const desde = agora.startOf('day').minus({ days: (agora.weekday - 1) + 14 }).toISODate();
const nomeCli = txt((cli.properties || {})['Cliente']);
const curto = { 'Vídeo padrão': 'VÍDEO PADRÃO', 'Corte horizontal': 'CORTE HORIZONTAL' };
const verbo = p.acao === 'pausar' ? 'pausou' : p.acao === 'reativar' ? 'reativou' : s.id ? 'ajustou' : 'criou';
const linha = '[Painel ' + agora.toFormat('dd/MM HH:mm') + '] ' + (r.nome || '') + ' ' + verbo + (p.acao === 'salvar' ? ': ' + s.plataforma + ', ' + s.formato + ', ' + s.dia.slice(2) + (s.horario ? ' ' + s.horario : '') + (s.qtd > 1 ? ', ' + s.qtd + ' peças' : '') : '');
const obsAntiga = txt(ap['Obs']);
const obs = { rich_text: [{ type: 'text', text: { content: (linha + (s.obs && p.acao === 'salvar' ? ' · ' + s.obs : '') + (obsAntiga ? '\\n' + obsAntiga : '')).slice(0, 1990) } }] };
let props = { 'Obs': obs };
if (p.acao === 'salvar') {
  props = Object.assign(props, {
    'Slot': { title: [{ type: 'text', text: { content: (nomeCli.toUpperCase() + ' | ' + (s.plataforma === 'YouTube' ? '' : s.plataforma.toUpperCase() + ' ') + (curto[s.formato] || s.formato.toUpperCase()) + ' | ' + s.dia.slice(2).toUpperCase()).slice(0, 200) } }] },
    'Cliente': { relation: [{ id: s.cliente }] }, 'Plataforma': { select: { name: s.plataforma } }, 'Formato': { select: { name: s.formato } },
    'Dia': { select: { name: s.dia } }, 'Horário': { rich_text: s.horario ? [{ type: 'text', text: { content: s.horario } }] : [] }, 'Quantidade': { number: s.qtd } });
  if (!s.id) props['Status do slot'] = { select: { name: '✅ Publicar' } };
}
if (p.acao === 'pausar') props['Status do slot'] = { select: { name: '⏸️ Pausado' } };
if (p.acao === 'reativar') props['Status do slot'] = { select: { name: '✅ Publicar' } };
const cria = p.acao === 'salvar' && !s.id;
return [{ json: { ok: !erro, listar: p.acao === 'listar', marcar: p.acao === 'marcar', podeMudar: muda, podeMarcar: true, teste, desde, bloq: BLOQUEIO[r.ficha] || [],
  marca: { chave: s.id + '|' + p.data, slot: s.id, dia: p.data, status: p.marca, por: r.nome || '', quando: agora.toFormat('dd/MM HH:mm'), link: p.marca ? p.link : '' },
  // Henrique 10/11: Programado/Postado com link na grade fecha também o card do Entregas daquele cliente e daquela data.
  card: { fechar: p.acao === 'marcar' && !!p.marca && !!p.link && !teste && !!cliAtual, cliente: cliAtual, formato: txt(ap['Formato']), ficha: r.ficha || '' },
  metodo: cria ? 'POST' : 'PATCH', url: cria ? 'https://api.notion.com/v1/pages' : 'https://api.notion.com/v1/pages/' + s.id,
  body: JSON.stringify(cria ? { parent: { database_id: '2d21b7a7166240f5afaa4d697c3d1ae8' }, properties: props } : { properties: props }),
  resposta: { ok: false, motivo: erro } } }];
` } } });

const podeSeguir = ifElse({ version: 2.2, config: { name: 'Pedido válido?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const ehListar = ifElse({ version: 2.2, config: { name: 'Listar ou mudar?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.listar }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const ehNovo = ifElse({ version: 2.2, config: { name: 'Horário novo?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.metodo }}', rightValue: 'POST', operator: { type: 'string', operation: 'equals' } }],
  combinator: 'and' } } } });

const criar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Criar horário', credentials: NOTION, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/pages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.body }}', options: {} } } });

const ajustar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Ajustar horário', credentials: NOTION, parameters: {
  method: 'PATCH', url: '={{ $json.url }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.body }}', options: {} } } });

const confirmar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar criação', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: true, id: String($json.id || "").replace(/-/g, "") }) }}', options: {} } } });

const confirmarAjuste = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar ajuste', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: true, id: String($json.id || "").replace(/-/g, "") }) }}', options: {} } } });

const grade = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Horários da grade', credentials: NOTION, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/2d21b7a7166240f5afaa4d697c3d1ae8/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { property: "Status do slot", select: { does_not_equal: "⛔ Encerrado" } }, page_size: 100 }) }}',
  options: { pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest',
    parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] },
    paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.has_more }}', limitPagesFetched: true, maxRequests: 10 } } } } } });

const clientes = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Clientes ativos', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/3ddc91b406be49e98e630c298d9162d8/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { property: "Situação", select: { does_not_equal: "Encerrado" } }, sorts: [{ property: "Cliente", direction: "ascending" }], page_size: 100 }) }}',
  options: { pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest',
    parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] },
    paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.has_more }}', limitPagesFetched: true, maxRequests: 10 } } } } } });

// Só sai o que a grade precisa: cliente, faixa, atenção e os horários. Nada de contrato, valores ou clima.
const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar grade', parameters: { jsCode: `const v = $('Validar pedido').first().json;
const sem = id => String(id || '').replace(/-/g, '');
const txt = x => { if (!x) return ''; const a = x.title || x.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (x.select) return x.select.name; if (x.formula) return String(x.formula.string || ''); return ''; };
const cli = {};
for (const it of $('Clientes ativos').all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {};
  const nome = txt(pr['Cliente']);
  if (!v.teste && /^TESTE/i.test(nome)) continue;
  cli[sem(p.id)] = { id: sem(p.id), nome, faixa: txt(pr['Faixa']) || txt(pr['Faixa base']), atencao: !!(pr['🔴 Atenção redobrada'] || {}).checkbox, situacao: txt(pr['Situação']),
    yt: ((pr['Dias YouTube'] || {}).multi_select || []).map(o => o.name).join(', '), tt: ((pr['Dias TikTok'] || {}).multi_select || []).map(o => o.name).join(', ') };
}
const horarios = [];
for (const it of $('Horários da grade').all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {};
  const c = sem((((pr['Cliente'] || {}).relation || [])[0] || {}).id);
  if (!cli[c] || (v.bloq || []).includes(c)) continue;
  const obs = txt(pr['Obs']);
  horarios.push({ id: sem(p.id), cliente: c, plataforma: txt(pr['Plataforma']), formato: txt(pr['Formato']), dia: txt(pr['Dia']), horario: txt(pr['Horário']),
    qtd: (pr['Quantidade'] || {}).number || 1, status: txt(pr['Status do slot']), nota: obs.split('\\n').filter(l => !/^\\[Painel /.test(l)).join(' ').slice(0, 200) });
}
const lista = Object.values(cli).map(c => ({ id: c.id, nome: c.nome, faixa: c.faixa, atencao: c.atencao, ativo: c.situacao === 'Ativo', pausado: c.situacao === 'Pausado', yt: c.yt, tt: c.tt }));
const ids = new Set(horarios.map(h => h.id));
const marcas = {};
for (const it of $('Marcações da grade').all()) { const m = it.json || {}; if (m.chave && m.status && ids.has(m.slot)) marcas[m.chave] = { status: m.status, por: m.por || '', quando: m.quando || '', link: m.link || '' }; }
return [{ json: { ok: true, podeMudar: v.podeMudar, podeMarcar: v.podeMarcar, clientes: lista, horarios, marcas } }];
` } } });

// Programado (cinza) e Postado (laranja) de cada horário em cada data. Uma linha por horário+data; desmarcar grava status vazio.
const marcacoes = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Marcações da grade', executeOnce: true, alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: MARCAS, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'dia', condition: 'gte', keyValue: '={{ $("Validar pedido").first().json.desde }}' }] }, returnAll: true } } });

const ehMarcar = ifElse({ version: 2.2, config: { name: 'Marcar ou ajustar?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.marcar }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const gravarMarca = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Gravar marcação', parameters: {
  resource: 'row', operation: 'upsert', dataTableId: MARCAS, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'chave', condition: 'eq', keyValue: '={{ $json.marca.chave }}' }] },
  columns: { mappingMode: 'defineBelow', value: {
    chave: '={{ $json.marca.chave }}', slot: '={{ $json.marca.slot }}', dia: '={{ $json.marca.dia }}', status: '={{ $json.marca.status }}',
    por: '={{ $json.marca.por }}', quando: '={{ $json.marca.quando }}', link: '={{ $json.marca.link }}' }, matchingColumns: [], schema: [
    { id: 'chave', displayName: 'chave', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'slot', displayName: 'slot', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'dia', displayName: 'dia', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'status', displayName: 'status', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'por', displayName: 'por', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'quando', displayName: 'quando', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'link', displayName: 'link', type: 'string', display: true, required: false, defaultMatch: false }] }, options: {} } } });

const confirmarMarca = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar marcação', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: true, marca: $("Validar pedido").first().json.marca }) }}', options: {} } } });

// Fecha o card do Entregas: mesmo cliente, Postar em = data marcada, tipo que bate com o formato do horário.
const cardsDoHorario = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Cards do horário', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/74b3076a325749e3bac4ba6659215e48/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { and: [ { property: "Cliente", relation: { contains: $("Validar pedido").first().json.card.cliente } }, { property: "Postar em", date: { equals: $("Validar pedido").first().json.marca.dia } }, { property: "Status", select: { does_not_equal: "Cancelado" } } ] }, sorts: [{ timestamp: "created_time", direction: "ascending" }], page_size: 20 }) }}', options: {} } } });

const montarCard = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar fechamento do card', parameters: { jsCode: `const v = $('Validar pedido').first().json;
const m = v.marca, c = v.card;
const txt = x => { if (!x) return ''; const a = x.title || x.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (x.select) return x.select.name; return ''; };
const TIPOS = { 'Vídeo padrão': ['Vídeo longo'], 'Corte horizontal': ['Vídeo longo'], 'Podcast': ['Podcast', 'Vídeo longo'], 'Shorts': ['Shorts'], 'Reels': ['Shorts'], 'Carrossel': ['Carrossel'], 'Blog': ['Blog'] };
const tipos = TIPOS[c.formato] || [];
const nome = c.formato.toUpperCase();
const cards = (($input.first().json || {}).results || []).map(p => ({ id: p.id, pr: p.properties || {} }))
  .filter(k => tipos.includes(txt(k.pr['Tipo'])) && !['Feito', 'Cancelado'].includes(txt(k.pr['Status'])));
// Mais de um card no mesmo dia: o que tem o formato no nome, depois o que ainda não foi fechado, depois o mais antigo.
const nota = k => (txt(k.pr['Entrega']).toUpperCase().includes(nome) ? 0 : 2) + (['Postado', 'Agendado'].includes(txt(k.pr['Status'])) ? 1 : 0);
const k = cards.sort((a, b) => nota(a) - nota(b))[0];
if (!k) return [{ json: { fechar: false } }];
const status = txt(k.pr['Status']);
// O que o Victor agenda ou posta fica em Agendado até o Daniel ou o Ismael conferir (regra de 04/11).
const assistente = c.ficha === '3ea98c0cdde08182a952f3d9a5b73575';
const para = status === 'Postado' ? 'Postado' : (m.status === 'postado' && !assistente) ? 'Postado' : 'Agendado';
const linha = '[Painel ' + m.quando + '] ' + m.por + ' marcou ' + (m.status === 'postado' ? 'Postado' : 'Programado') + ' na grade (' + m.link + ')';
const obs = (linha + (txt(k.pr['Obs']) ? '\\n' + txt(k.pr['Obs']) : '')).match(/[\\s\\S]{1,1990}/g).slice(0, 10).map(x => ({ type: 'text', text: { content: x } }));
const props = { 'Status': { select: { name: para } }, 'Link da postagem': { url: m.link }, 'Obs': { rich_text: obs } };
if (para === 'Postado' && !((k.pr['Postado em'] || {}).date || {}).start) props['Postado em'] = { date: { start: m.dia } };
return [{ json: { fechar: true, url: 'https://api.notion.com/v1/pages/' + k.id, body: JSON.stringify({ properties: props }) } }];
` } } });

const temCard = ifElse({ version: 2.2, config: { name: 'Achou o card?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.fechar }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const fecharCard = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Fechar card', credentials: NOTION, onError: 'continueRegularOutput', parameters: {
  method: 'PATCH', url: '={{ $json.url }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.body }}', options: {} } } });

const vaiFechar = ifElse({ version: 2.2, config: { name: 'Fechar card?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $("Validar pedido").first().json.card.fechar }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const devolver = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver grade', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: {} } } });

const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Painel da equipe · grade de postagem (V1)\nLê o banco Grade de Postagem (horários fixos de cada cliente: plataforma, formato, dia, horário, quantidade) e devolve a semana para a aba Grade.\nTodos veem. Ismael (revisor), Rômulo (calls) e o teste podem criar, ajustar, pausar e reativar um horário. Toda mudança vira uma linha [Painel dd/mm] no topo da Obs do horário. Nunca encerra nem apaga.\nTodos marcam Programado ou Postado em cada data, sempre com o link da publicação (tabela Painel · grade marcações; desmarcar grava status vazio).\nDesde 10/11: a marcação com link também fecha o card do Entregas do mesmo cliente e da mesma data (Programado → Agendado, Postado → Postado + Postado em + Link da postagem; o que o Victor marca fica em Agendado). Desmarcar não mexe no card.', [], { color: 4 });

export default workflow('painel-grade', 'Painel | Grade de postagem (V1)')
  .add(pedir).to(ler).to(acesso).to(slotAtual).to(clienteNode).to(validar)
  .to(podeSeguir
    .onTrue(ehListar
      .onTrue(grade.to(clientes).to(marcacoes).to(montar).to(devolver))
      .onFalse(ehMarcar.onTrue(gravarMarca.to(confirmarMarca).to(vaiFechar.onTrue(cardsDoHorario.to(montarCard).to(temCard.onTrue(fecharCard)))))
        .onFalse(ehNovo.onTrue(criar.to(confirmar)).onFalse(ajustar.to(confirmarAjuste)))))
    .onFalse(recusar))
  .add(nota);
