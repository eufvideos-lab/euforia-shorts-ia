import { workflow, node, trigger, switchCase, sticky } from '@n8n/workflow-sdk';

const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const ACESSO = { __rl: true, mode: 'id', value: 'ilXDZWGAcOjoajx7', cachedResultName: 'Painel equipe · acesso' };
const COFRE = { __rl: true, mode: 'id', value: 'mPERK6l1pOJnbu5w', cachedResultName: 'Painel · acessos dos clientes' };
const SCHEMA = [{ id: 'cliente', displayName: 'cliente', type: 'string', display: true }, { id: 'clienteNome', displayName: 'clienteNome', type: 'string', display: true }, { id: 'servico', displayName: 'servico', type: 'string', display: true }, { id: 'login', displayName: 'login', type: 'string', display: true }, { id: 'senha', displayName: 'senha', type: 'string', display: true }, { id: 'link', displayName: 'link', type: 'string', display: true }, { id: 'obs', displayName: 'obs', type: 'string', display: true }, { id: 'por', displayName: 'por', type: 'string', display: true }, { id: 'quando', displayName: 'quando', type: 'string', display: true }];
const VALORES = {
  cliente: '={{ $("Validar").first().json.linha.cliente }}',
  clienteNome: '={{ $("Validar").first().json.linha.clienteNome }}',
  servico: '={{ $("Validar").first().json.linha.servico }}',
  login: '={{ $("Validar").first().json.linha.login }}',
  senha: '={{ $("Validar").first().json.linha.senha }}',
  link: '={{ $("Validar").first().json.linha.link }}',
  obs: '={{ $("Validar").first().json.linha.obs }}',
  por: '={{ $("Validar").first().json.linha.por }}',
  quando: '={{ $("Validar").first().json.linha.quando }}' };

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Acessos do cliente', parameters: {
  httpMethod: 'POST', path: 'euforia-painel-acessos', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

const ler = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler pedido', parameters: { jsCode: `const b = ($input.first().json.body) || {};
const u = String(b.u || '').toLowerCase();
const cli = String(b.cliente || '').replace(/-/g, '').toLowerCase();
const a = b.acesso || {};
const s = (v, n) => String(v || '').replace(/[\\r\\n]+/g, ' ').trim().slice(0, n);
return [{ json: { u: /^[0-9a-f]{24}$/.test(u) ? u : 'x', pin: String(b.pin || '').replace(/[^0-9]/g, '').slice(0, 6),
  acao: ['listar', 'salvar', 'apagar'].includes(b.acao) ? b.acao : '', cliente: /^[0-9a-f]{32}$/.test(cli) ? cli : '',
  clienteNome: s(b.clienteNome, 120), id: /^\\d{1,9}$/.test(String(a.id || '')) ? String(a.id) : '',
  servico: s(a.servico, 80), login: s(a.login, 200), senha: s(a.senha, 200), link: s(a.link, 500), obs: String(a.obs || '').trim().slice(0, 600) } }];
` } } });

const acesso = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Achar pessoa', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: ACESSO, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'token', condition: 'eq', keyValue: '={{ $json.u }}' }] }, limit: 1 } } });

// Só Ismael (revisor), Rômulo (calls), diretoria e o teste. Editores nunca veem os acessos.
const validar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validar', parameters: { jsCode: `const p = $('Ler pedido').first().json;
const r = $('Achar pessoa').first().json || {};
const ok = !!r.token && r.token === p.u && r.ativo === true && String(r.pin) === p.pin && ['revisor', 'calls', 'diretor', 'teste'].includes(r.papel);
let erro = '';
if (!ok) erro = 'acesso';
else if (!p.acao || !p.cliente) erro = 'campos';
else if (p.acao === 'salvar' && (p.servico.length < 2 || (!p.login && !p.senha && !p.link && !p.obs))) erro = 'campos';
else if (p.acao === 'apagar' && !p.id) erro = 'campos';
const etapa = erro ? 'erro' : p.acao === 'salvar' ? (p.id ? 'atualizar' : 'criar') : p.acao;
const quando = DateTime.now().setZone('America/Recife').toFormat('dd/MM/yyyy HH:mm');
return [{ json: { etapa, id: p.id, cliente: p.cliente,
  linha: { cliente: p.cliente, clienteNome: p.clienteNome, servico: p.servico, login: p.login, senha: p.senha, link: p.link, obs: p.obs, por: r.nome || '', quando },
  resposta: { ok: false, motivo: erro } } }];
` } } });

const caminho = switchCase({ version: 3.2, config: { name: 'O que fazer', parameters: { rules: { values: [
    { outputKey: 'listar', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ $json.etapa }}', rightValue: 'listar', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
    { outputKey: 'criar', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ $json.etapa }}', rightValue: 'criar', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
    { outputKey: 'atualizar', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ $json.etapa }}', rightValue: 'atualizar', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
    { outputKey: 'apagar', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ $json.etapa }}', rightValue: 'apagar', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
    { outputKey: 'erro', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ $json.etapa }}', rightValue: 'erro', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } }
  ] }, options: {} } } });

const listar = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Acessos guardados', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: COFRE, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'cliente', condition: 'eq', keyValue: '={{ $("Validar").first().json.cliente }}' }] }, returnAll: true } } });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar lista', parameters: { jsCode: `const l = $input.all().map(i => i.json).filter(x => x && x.id)
  .map(x => ({ id: x.id, servico: x.servico || '', login: x.login || '', senha: x.senha || '', link: x.link || '', obs: x.obs || '', por: x.por || '', quando: x.quando || '' }))
  .sort((a, b) => a.servico.localeCompare(b.servico));
return [{ json: { resposta: { ok: true, acessos: l } } }];
` } } });

const criar = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Guardar acesso novo', parameters: {
  resource: 'row', operation: 'insert', dataTableId: COFRE,
  columns: { mappingMode: 'defineBelow', value: VALORES, matchingColumns: [], schema: SCHEMA }, options: {} } } });

// Ajuste e exclusão sempre conferem o cliente junto com o id.
const atualizar = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Ajustar acesso', parameters: {
  resource: 'row', operation: 'update', dataTableId: COFRE, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: '={{ $("Validar").first().json.id }}' }, { keyName: 'cliente', condition: 'eq', keyValue: '={{ $("Validar").first().json.cliente }}' }] },
  columns: { mappingMode: 'defineBelow', value: VALORES, matchingColumns: [], schema: SCHEMA }, options: {} } } });

const apagar = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Apagar acesso', parameters: {
  resource: 'row', operation: 'deleteRows', dataTableId: COFRE, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: '={{ $("Validar").first().json.id }}' }, { keyName: 'cliente', condition: 'eq', keyValue: '={{ $("Validar").first().json.cliente }}' }] }, options: {} } } });

const devolver = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver lista', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });
const okCriar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Guardado', parameters: {
  respondWith: 'json', responseBody: '{"ok":true}', options: {} } } });
const okAtualizar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Ajustado', parameters: {
  respondWith: 'json', responseBody: '{"ok":true}', options: {} } } });
const okApagar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Apagado', parameters: {
  respondWith: 'json', responseBody: '{"ok":true}', options: {} } } });
const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Painel da equipe · acessos dos clientes (V1)\nAba Clientes do Ismael, do Rômulo e da diretoria: guarda os acessos que o cliente manda (hospedagem, domínio, Instagram...) na tabela "Painel · acessos dos clientes" do n8n. Nunca no Notion nem no Discord.\nAções: listar (de um cliente por vez, só quando a pessoa abre), salvar (novo ou ajuste) e apagar. Editores não têm acesso.', [], { color: 4 });

export default workflow('painel-acessos', 'Painel | Acessos dos clientes (V1)')
  .add(pedir).to(ler).to(acesso).to(validar)
  .to(caminho
    .onCase(0, listar.to(montar).to(devolver))
    .onCase(1, criar.to(okCriar))
    .onCase(2, atualizar.to(okAtualizar))
    .onCase(3, apagar.to(okApagar))
    .onCase(4, recusar))
  .add(nota);
