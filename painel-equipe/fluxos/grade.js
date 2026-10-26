import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };
const ACESSO = { __rl: true, mode: 'id', value: 'ilXDZWGAcOjoajx7', cachedResultName: 'Painel equipe · acesso' };

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
  acao: ['salvar', 'pausar', 'reativar'].includes(b.acao) ? b.acao : 'listar',
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
const muda = ['revisor', 'calls', 'teste'].includes(r.papel);
const TESTE = '40598c0cdde081c78b98f3984e7009e8';
const ap = atual.properties || {};
const daGrade = sem((atual.parent || {}).database_id) === '2d21b7a7166240f5afaa4d697c3d1ae8';
const cliAtual = sem((((ap['Cliente'] || {}).relation || [])[0] || {}).id);
const s = p.slot;
let erro = '';
if (!acessoOk) erro = 'acesso';
else if (p.acao !== 'listar' && !muda) erro = 'permissao';
else if (p.acao !== 'listar' && s.id && !daGrade) erro = 'horario';
else if (p.acao === 'salvar' && (!s.cliente || sem((cli.parent || {}).database_id) !== '3ddc91b406be49e98e630c298d9162d8')) erro = 'cliente';
else if (p.acao === 'salvar' && (!s.plataforma || !s.formato || !s.dia)) erro = 'campos';
else if (teste && p.acao !== 'listar' && ((s.cliente && s.cliente !== TESTE) || (s.id && cliAtual !== TESTE))) erro = 'permissao';
else if ((p.acao === 'pausar' || p.acao === 'reativar') && !s.id) erro = 'horario';
const agora = DateTime.now().setZone(Z);
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
return [{ json: { ok: !erro, listar: p.acao === 'listar', podeMudar: muda, teste,
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
  if (!cli[c]) continue;
  const obs = txt(pr['Obs']);
  horarios.push({ id: sem(p.id), cliente: c, plataforma: txt(pr['Plataforma']), formato: txt(pr['Formato']), dia: txt(pr['Dia']), horario: txt(pr['Horário']),
    qtd: (pr['Quantidade'] || {}).number || 1, status: txt(pr['Status do slot']), nota: obs.split('\\n').filter(l => !/^\\[Painel /.test(l)).join(' ').slice(0, 200) });
}
const lista = Object.values(cli).map(c => ({ id: c.id, nome: c.nome, faixa: c.faixa, atencao: c.atencao, ativo: c.situacao === 'Ativo', pausado: c.situacao === 'Pausado', yt: c.yt, tt: c.tt }));
return [{ json: { ok: true, podeMudar: v.podeMudar, clientes: lista, horarios } }];
` } } });

const devolver = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver grade', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: {} } } });

const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Painel da equipe · grade de postagem (V1)\nLê o banco Grade de Postagem (horários fixos de cada cliente: plataforma, formato, dia, horário, quantidade) e devolve a semana para a aba Grade.\nTodos veem. Ismael (revisor), Rômulo (calls) e o teste podem criar, ajustar, pausar e reativar um horário. Toda mudança vira uma linha [Painel dd/mm] no topo da Obs do horário. Nunca encerra nem apaga.', [], { color: 4 });

export default workflow('painel-grade', 'Painel | Grade de postagem (V1)')
  .add(pedir).to(ler).to(acesso).to(slotAtual).to(clienteNode).to(validar)
  .to(podeSeguir
    .onTrue(ehListar
      .onTrue(grade.to(clientes).to(montar).to(devolver))
      .onFalse(ehNovo.onTrue(criar.to(confirmar)).onFalse(ajustar.to(confirmarAjuste))))
    .onFalse(recusar))
  .add(nota);
