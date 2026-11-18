import { workflow, node, trigger, switchCase, sticky } from '@n8n/workflow-sdk';

// Máquina de Resultados (V1, 02/11/2026): métricas por cliente e por vídeo.
// Views totais com a origem separada internamente (orgânico x ativação), e o que o cliente informa:
// mensagens pela palavra-chave, respostas da lista de transmissão, reuniões e contratos.
// Ativação (views da ativação, orgânico, campanha, verba, gasto, piloto): só a diretoria vê e muda.
// A equipe e o cliente não sabem do processo de crescimento (Henrique, 02/11/2026).
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const ACESSO = { __rl: true, mode: 'id', value: 'ilXDZWGAcOjoajx7', cachedResultName: 'Painel equipe · acesso' };
const TABELA = { __rl: true, mode: 'id', value: 'BezGvdw9Xrsv4ZNw', cachedResultName: 'Resultados · vídeos' };
const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Pedido de Resultados', parameters: {
  httpMethod: 'POST', path: 'euforia-painel-resultados', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

// Tudo que chega da página é conferido aqui.
const ler = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler pedido', parameters: { jsCode: `const b = ($input.first().json.body) || {};
const u = String(b.u || '').toLowerCase();
const v = b.video || {};
const t = (x, n) => String(x == null ? '' : x).trim().slice(0, n);
const n = x => { if (x === '' || x == null) return null; const k = Number(String(x).replace(/[^0-9.,-]/g, '').replace(/\\.(?=\\d{3}(\\D|$))/g, '').replace(',', '.')); return isFinite(k) && k >= 0 ? Math.round(k * 100) / 100 : null; };
const hex = x => { const s = String(x || '').replace(/-/g, '').toLowerCase(); return /^[0-9a-f]{32}$/.test(s) ? s : ''; };
const link = t(v.link, 300);
const video = {
  chave: /^r-[0-9a-z]{6,20}$/.test(String(v.chave || '')) ? String(v.chave) : '',
  cliente: hex(v.cliente), clienteNome: t(v.clienteNome, 120), video: t(v.video, 160),
  link: /^https:\\/\\/(www\\.|m\\.)?(youtube\\.com|youtu\\.be)\\/[^\\s]+$/.test(link) ? link : '',
  publicado: /^\\d{4}-\\d{2}-\\d{2}$/.test(String(v.publicado || '')) ? String(v.publicado) : '',
  palavra: t(v.palavra, 20).toUpperCase().normalize('NFD').replace(/[^A-Z0-9]/g, ''), piloto: v.piloto === true,
  campanha: t(v.campanha, 120), viewsTotal: n(v.viewsTotal), viewsAtivacao: n(v.viewsAtivacao), verba: n(v.verba), gasto: n(v.gasto),
  mensagens: n(v.mensagens), respostasLista: n(v.respostasLista), reunioes: n(v.reunioes), contratos: n(v.contratos), obs: t(v.obs, 600) };
return [{ json: { u: /^[0-9a-f]{24}$/.test(u) ? u : 'x', pin: String(b.pin || '').replace(/[^0-9]/g, '').slice(0, 6),
  acao: ['ver', 'salvar'].includes(b.acao) ? b.acao : '', video, chaveBusca: video.chave || 'nova' } }];
` } } });

const acesso = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Achar pessoa', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: ACESSO, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'token', condition: 'eq', keyValue: '={{ $json.u }}' }] }, limit: 1 } } });

// Ismael (revisor), Rômulo (calls), diretoria e o usuário de teste (só mexe em cliente com TESTE no nome).
const validar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validar acesso', parameters: { jsCode: `const p = $('Ler pedido').first().json;
const r = $input.first().json || {};
const ok = !!r.token && r.token === p.u && r.ativo === true && String(r.pin) === p.pin && ['revisor', 'calls', 'diretor', 'teste'].includes(r.papel);
let motivo = ok ? '' : 'acesso';
if (!motivo && !p.acao) motivo = 'acao';
if (!motivo && p.acao === 'salvar') {
  const v = p.video;
  if (!v.cliente || !v.video) motivo = 'campos';
  else if (r.papel === 'teste' && !/TESTE/i.test(v.clienteNome)) motivo = 'permissao';
}
return [{ json: { ok: !motivo, acao: motivo ? 'recusar' : p.acao, nome: r.nome || '', papel: r.papel || '', resposta: { ok: false, motivo } } }];
` } } });

const caminho = switchCase({ version: 3.2, config: { name: 'O que fazer', parameters: { rules: { values: [
    { outputKey: 'ver', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ $json.acao }}', rightValue: 'ver', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
    { outputKey: 'salvar', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ $json.acao }}', rightValue: 'salvar', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
    { outputKey: 'recusar', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ $json.acao }}', rightValue: 'recusar', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } }
  ] }, options: {} } } });

// ---------- Ver ----------
const todas = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Todos os vídeos', executeOnce: true, alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: TABELA, returnAll: true } } });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar resultados', parameters: { jsCode: `const quem = $('Validar acesso').first().json;
const dir = quem.papel === 'diretor';
const num = x => typeof x === 'number' && isFinite(x) ? x : null;
const videos = $input.all().map(i => i.json).filter(r => r && r.chave).map(r => {
  const total = num(r.viewsTotal), ativ = num(r.viewsAtivacao);
  const v = { chave: r.chave, cliente: r.cliente, clienteNome: r.clienteNome, video: r.video, link: r.link, publicado: r.publicado, palavra: r.palavra,
    viewsTotal: total,
    mensagens: num(r.mensagens), respostasLista: num(r.respostasLista), reunioes: num(r.reunioes), contratos: num(r.contratos),
    obs: r.obs || '', atualizadoPor: r.atualizadoPor || '', atualizadoEm: r.atualizadoEm || '' };
  if (dir) { v.piloto = r.piloto === true; v.campanha = r.campanha || ''; v.viewsAtivacao = ativ; v.viewsOrganico = total != null ? Math.max(0, total - (ativ || 0)) : null; v.verba = num(r.verba); v.gasto = num(r.gasto); v.custoView = v.gasto != null && ativ ? Math.round(v.gasto / ativ * 1000) / 1000 : null; }
  return v; }).sort((a, b) => String(b.publicado || '').localeCompare(String(a.publicado || '')) || String(a.clienteNome).localeCompare(String(b.clienteNome)));
return [{ json: { ok: true, diretor: dir, videos, agora: DateTime.now().setZone('America/Recife').toFormat("dd/MM HH:mm") } }];
` } } });

const devolver = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver resultados', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: {} } } });

// ---------- Salvar ----------
const atual = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Linha atual', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: TABELA, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'chave', condition: 'eq', keyValue: '={{ $("Ler pedido").first().json.chaveBusca }}' }] }, limit: 1 } } });

// Junta o que chegou com a linha que já existe. Quem não é diretoria nunca mexe em nada da ativação.
const juntar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Juntar linha', parameters: { jsCode: `const p = $('Ler pedido').first().json, quem = $('Validar acesso').first().json;
const velho = ($input.first().json && $input.first().json.chave) ? $input.first().json : {};
const v = Object.assign({}, p.video);
if (quem.papel !== 'diretor') for (const k of ['verba', 'gasto', 'viewsAtivacao', 'campanha', 'piloto']) v[k] = velho[k] == null ? (k === 'campanha' ? '' : k === 'piloto' ? false : null) : velho[k];
v.chave = velho.chave || ('r-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
v.atualizadoPor = quem.nome; v.atualizadoEm = DateTime.now().setZone('America/Recife').toFormat('yyyy-MM-dd HH:mm');
return [{ json: v }];
` } } });

const gravar = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Gravar vídeo', parameters: {
  resource: 'row', operation: 'upsert', dataTableId: TABELA, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'chave', condition: 'eq', keyValue: '={{ $json.chave }}' }] },
  columns: { mappingMode: 'defineBelow', value: { chave: '={{ $json.chave }}', cliente: '={{ $json.cliente }}', clienteNome: '={{ $json.clienteNome }}', video: '={{ $json.video }}', link: '={{ $json.link }}', publicado: '={{ $json.publicado }}', palavra: '={{ $json.palavra }}', piloto: '={{ $json.piloto }}', campanha: '={{ $json.campanha }}', viewsTotal: '={{ $json.viewsTotal }}', viewsAtivacao: '={{ $json.viewsAtivacao }}', verba: '={{ $json.verba }}', gasto: '={{ $json.gasto }}', mensagens: '={{ $json.mensagens }}', respostasLista: '={{ $json.respostasLista }}', reunioes: '={{ $json.reunioes }}', contratos: '={{ $json.contratos }}', obs: '={{ $json.obs }}', atualizadoPor: '={{ $json.atualizadoPor }}', atualizadoEm: '={{ $json.atualizadoEm }}' }, matchingColumns: [],
    schema: [
    { id: 'chave', displayName: 'chave', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'cliente', displayName: 'cliente', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'clienteNome', displayName: 'clienteNome', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'video', displayName: 'video', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'link', displayName: 'link', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'publicado', displayName: 'publicado', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'palavra', displayName: 'palavra', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'piloto', displayName: 'piloto', type: 'boolean', display: true, required: false, defaultMatch: false },
    { id: 'campanha', displayName: 'campanha', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'viewsTotal', displayName: 'viewsTotal', type: 'number', display: true, required: false, defaultMatch: false },
    { id: 'viewsAtivacao', displayName: 'viewsAtivacao', type: 'number', display: true, required: false, defaultMatch: false },
    { id: 'verba', displayName: 'verba', type: 'number', display: true, required: false, defaultMatch: false },
    { id: 'gasto', displayName: 'gasto', type: 'number', display: true, required: false, defaultMatch: false },
    { id: 'mensagens', displayName: 'mensagens', type: 'number', display: true, required: false, defaultMatch: false },
    { id: 'respostasLista', displayName: 'respostasLista', type: 'number', display: true, required: false, defaultMatch: false },
    { id: 'reunioes', displayName: 'reunioes', type: 'number', display: true, required: false, defaultMatch: false },
    { id: 'contratos', displayName: 'contratos', type: 'number', display: true, required: false, defaultMatch: false },
    { id: 'obs', displayName: 'obs', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'atualizadoPor', displayName: 'atualizadoPor', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'atualizadoEm', displayName: 'atualizadoEm', type: 'string', display: true, required: false, defaultMatch: false }] }, options: {} } } });

const confirmar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: true, chave: $("Juntar linha").first().json.chave }) }}', options: {} } } });

const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Painel · Resultados (V1)\nMáquina de Resultados: uma linha por vídeo na tabela "Resultados · vídeos".\nver: todos os vídeos. Orgânico x ativação, campanha, piloto, verba, gasto e custo por view SÓ para a diretoria.\nsalvar: Ismael, Rômulo e diretoria lançam/ajustam (teste só cliente TESTE). Quem não é diretoria nunca vê nem muda nada da ativação.\nViews totais digitadas no V1 (automático no V2 pelo fluxo de dados do YouTube). Proibido views compradas.', [], { color: 4 });

export default workflow('painel-resultados', 'Painel | Resultados (V1)')
  .add(pedir).to(ler).to(acesso).to(validar).to(caminho
    .onCase(0, todas.to(montar).to(devolver))
    .onCase(1, atual.to(juntar).to(gravar).to(confirmar))
    .onCase(2, recusar))
  .add(nota);
