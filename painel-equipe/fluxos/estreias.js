import { workflow, node, trigger, switchCase, sticky } from '@n8n/workflow-sdk';

// Estreias do canal (Máquina de Resultados, 02/11/2026): data e hora do Vídeo 1 de cada cliente.
// Rômulo (calls), Ismael (revisor) e diretoria marcam na Reunião de Lançamento: mínimo 7 dias à frente (ideal 14).
// O checklist do lançamento (ativação) é só da diretoria: a equipe nunca recebe os checks.
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const ACESSO = { __rl: true, mode: 'id', value: 'ilXDZWGAcOjoajx7', cachedResultName: 'Painel equipe · acesso' };
const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const TABELA = { __rl: true, mode: 'id', value: 'mg63BiWRYW8BAXvw', cachedResultName: 'Painel · estreias' };

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Pedido de Estreias', parameters: {
  httpMethod: 'POST', path: 'euforia-painel-estreias', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

const ler = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler pedido', parameters: { jsCode: `const b = ($input.first().json.body) || {};
const u = String(b.u || '').toLowerCase();
const e = b.estreia || {};
const hex = x => { const s = String(x || '').replace(/-/g, '').toLowerCase(); return /^[0-9a-f]{32}$/.test(s) ? s : ''; };
const hm = String(e.hora || '').trim().match(/^(\\d{1,2})(?:[:h](\\d{2}))?$/);
const estreia = { cliente: hex(e.cliente), clienteNome: String(e.clienteNome || '').trim().slice(0, 120),
  data: /^\\d{4}-\\d{2}-\\d{2}$/.test(String(e.data || '')) ? String(e.data) : '',
  hora: hm && Number(hm[1]) < 24 && Number(hm[2] || 0) < 60 ? hm[1].padStart(2, '0') + ':' + (hm[2] || '00') : '',
  checks: Array.isArray(e.checks) ? e.checks.filter(x => /^[a-z0-9]{1,20}$/.test(String(x))).slice(0, 20).join(',') : null,
  obs: String(e.obs || '').trim().slice(0, 400) };
return [{ json: { u: /^[0-9a-f]{24}$/.test(u) ? u : 'x', pin: String(b.pin || '').replace(/[^0-9]/g, '').slice(0, 6),
  acao: ['listar', 'marcar', 'checar'].includes(b.acao) ? b.acao : '', estreia, busca: estreia.cliente || 'nenhum' } }];
` } } });

const acesso = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Achar pessoa', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: ACESSO, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'token', condition: 'eq', keyValue: '={{ $json.u }}' }] }, limit: 1 } } });

// Todos veem as estreias (o Vídeo 1 aparece destacado na grade). Marcam: Rômulo, Ismael, diretoria, teste (só cliente TESTE).
// Checklist: só diretoria.
const validar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validar acesso', parameters: { jsCode: `const p = $('Ler pedido').first().json;
const r = $input.first().json || {};
const ok = !!r.token && r.token === p.u && r.ativo === true && String(r.pin) === p.pin;
const e = p.estreia;
const hoje = DateTime.now().setZone('America/Recife').startOf('day');
let motivo = ok ? '' : 'acesso';
if (!motivo && !p.acao) motivo = 'acao';
if (!motivo && p.acao === 'marcar') {
  if (!['revisor', 'calls', 'diretor', 'teste'].includes(r.papel)) motivo = 'permissao';
  else if (!e.cliente || !e.data || !e.hora) motivo = 'campos';
  else if (r.papel === 'teste' && !/TESTE/i.test(e.clienteNome)) motivo = 'permissao';
  else if (r.papel !== 'diretor' && (dd => dd >= 0 && dd < 7)(DateTime.fromISO(e.data, { zone: 'America/Recife' }).diff(hoje, 'days').days)) motivo = 'cedo'; // data passada = Vídeo 1 que já saiu (só registrar)
}
if (!motivo && p.acao === 'checar' && (r.papel !== 'diretor' || !e.cliente || e.checks === null)) motivo = 'permissao';
return [{ json: { ok: !motivo, acao: motivo ? 'recusar' : p.acao, nome: r.nome || '', papel: r.papel || '', resposta: { ok: false, motivo } } }];
` } } });

const caminho = switchCase({ version: 3.2, config: { name: 'O que fazer', parameters: { rules: { values: [
    { outputKey: 'listar', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ $json.acao }}', rightValue: 'listar', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
    { outputKey: 'mudar', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ ["marcar", "checar"].includes($json.acao) }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } },
    { outputKey: 'recusar', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ $json.acao }}', rightValue: 'recusar', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } }
  ] }, options: {} } } });

const todas = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Todas as estreias', executeOnce: true, alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: TABELA, returnAll: true } } });

// Clientes ativos: para listar os novos (início nos últimos 60 dias) que ainda não têm a estreia marcada.
const fichas = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Clientes ativos', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/3ddc91b406be49e98e630c298d9162d8/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] }, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { property: "Situação", select: { equals: "Ativo" } }, page_size: 100 }) }}',
  options: { pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest',
    parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] },
    paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.has_more }}', limitPagesFetched: true, maxRequests: 10 } } } } } });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar estreias', parameters: { jsCode: `const quem = $('Validar acesso').first().json;
const dir = quem.papel === 'diretor';
const estreias = $('Todas as estreias').all().map(i => i.json).filter(r => r && r.cliente && r.data).map(r => {
  const v = { cliente: r.cliente, clienteNome: r.clienteNome || '', data: r.data, hora: r.hora || '', por: r.por || '', quando: r.quando || '' };
  if (dir) { v.checks = String(r.checks || '').split(',').filter(Boolean); v.obs = r.obs || ''; }
  return v; }).sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
const tem = new Set(estreias.map(e => e.cliente)), hoje = DateTime.now().setZone('America/Recife').startOf('day');
const txt = x => { if (!x) return ''; const a = x.title || x.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (x.select) return x.select.name; if (x.date) return x.date.start || ''; return ''; };
const novos = [];
for (const it of $('Clientes ativos').all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {}, id = String(p.id || '').replace(/-/g, ''), nome = txt(pr['Cliente']);
  if (!nome || tem.has(id) || (/^TESTE/i.test(nome) && !['teste', 'diretor'].includes(quem.papel))) continue;
  const m = txt(pr['Resumo do contrato']).match(/contrato de (\\d{2})\\/(\\d{2})\\/(\\d{4})/i);
  const inicio = m ? m[3] + '-' + m[2] + '-' + m[1] : txt(pr['Entrada (onboarding)']).slice(0, 10);
  const d = inicio ? DateTime.fromISO(inicio, { zone: 'America/Recife' }) : null;
  if (!d || !d.isValid) continue;
  const dias = Math.round(hoje.diff(d.startOf('day'), 'days').days);
  if (dias >= 0 && dias <= 60) novos.push({ cliente: id, clienteNome: nome, inicio, dias });
}
novos.sort((a, b) => b.dias - a.dias);
return [{ json: { ok: true, diretor: dir, estreias, novos } }];
` } } });

const devolver = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver estreias', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: {} } } });

const atual = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Estreia atual', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: TABELA, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'cliente', condition: 'eq', keyValue: '={{ $("Ler pedido").first().json.busca }}' }] }, limit: 1 } } });

// Marcar troca data/hora e mantém os checks; checar troca só os checks. Uma estreia (Vídeo 1) por cliente.
const juntar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Juntar estreia', parameters: { jsCode: `const p = $('Ler pedido').first().json, quem = $('Validar acesso').first().json;
const velho = ($input.first().json && $input.first().json.cliente) ? $input.first().json : {};
const e = p.estreia, agora = DateTime.now().setZone('America/Recife').toFormat('dd/MM HH:mm');
if (p.acao === 'checar') return [{ json: { cliente: e.cliente, clienteNome: velho.clienteNome || e.clienteNome, data: velho.data || '', hora: velho.hora || '', por: velho.por || '', quando: velho.quando || '', checks: e.checks, obs: e.obs || velho.obs || '' } }];
return [{ json: { cliente: e.cliente, clienteNome: e.clienteNome || velho.clienteNome || '', data: e.data, hora: e.hora, por: quem.nome, quando: agora, checks: velho.checks || '', obs: quem.papel === 'diretor' && e.obs ? e.obs : (velho.obs || '') } }];
` } } });

const gravar = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Gravar estreia', parameters: {
  resource: 'row', operation: 'upsert', dataTableId: TABELA, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'cliente', condition: 'eq', keyValue: '={{ $json.cliente }}' }] },
  columns: { mappingMode: 'defineBelow', value: { cliente: '={{ $json.cliente }}', clienteNome: '={{ $json.clienteNome }}', data: '={{ $json.data }}', hora: '={{ $json.hora }}', por: '={{ $json.por }}', quando: '={{ $json.quando }}', checks: '={{ $json.checks }}', obs: '={{ $json.obs }}' }, matchingColumns: [],
    schema: [
    { id: 'cliente', displayName: 'cliente', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'clienteNome', displayName: 'clienteNome', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'data', displayName: 'data', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'hora', displayName: 'hora', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'por', displayName: 'por', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'quando', displayName: 'quando', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'checks', displayName: 'checks', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'obs', displayName: 'obs', type: 'string', display: true, required: false, defaultMatch: false }] }, options: {} } } });

const confirmar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: true }) }}', options: {} } } });

const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Painel · Estreias (V1)\nData e hora do Vídeo 1 (estreia do canal) de cada cliente, tabela "Painel · estreias" (uma linha por cliente).\nlistar: todos (a grade destaca o Vídeo 1). marcar: Rômulo, Ismael, diretoria; mínimo 7 dias à frente (diretoria pode qualquer data).\nchecar: checklist do lançamento, SÓ diretoria; a equipe nunca recebe os checks nem a obs.', [], { color: 4 });

export default workflow('painel-estreias', 'Painel | Estreias (V1)')
  .add(pedir).to(ler).to(acesso).to(validar).to(caminho
    .onCase(0, todas.to(fichas).to(montar).to(devolver))
    .onCase(1, atual.to(juntar).to(gravar).to(confirmar))
    .onCase(2, recusar))
  .add(nota);
