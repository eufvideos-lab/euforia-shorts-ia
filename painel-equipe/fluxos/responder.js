import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

const EVO = { httpHeaderAuth: { id: 'MqNLRX9duuYKJSR2', name: 'Evolution API' } };
const PG = { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } };
const BASE = 'https://api.grupoeuforia.tech';
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const ACESSO = { __rl: true, mode: 'id', value: 'ilXDZWGAcOjoajx7', cachedResultName: 'Painel equipe · acesso' };
const SEM_ERRO = { response: { response: { neverError: true, fullResponse: true } } };

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Responder pelo painel', parameters: {
  httpMethod: 'POST', path: 'euforia-painel-responder', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

const ler = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler pedido', parameters: { jsCode: `const b = ($input.first().json.body) || {};
const u = String(b.u || '').toLowerCase();
return [{ json: { u: /^[0-9a-f]{24}$/.test(u) ? u : 'x', pin: String(b.pin || '').replace(/[^0-9]/g, '').slice(0, 6),
  msg: /^[A-Za-z0-9_-]{6,80}$/.test(String(b.msg || '')) ? b.msg : '',
  chat: /^[0-9-]{6,40}@g\\.us$/.test(String(b.chat || '')) ? b.chat : '',
  texto: String(b.texto || '').replace(/\\r/g, '').trim().slice(0, 2000) } }];
` } } });

const acesso = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Achar pessoa', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: ACESSO, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'token', condition: 'eq', keyValue: '={{ $json.u }}' }] }, limit: 1 } } });

const validar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validar acesso', parameters: { jsCode: `const p = $('Ler pedido').first().json;
const r = $input.first().json || {};
const ok = !!r.token && r.token === p.u && r.ativo === true && String(r.pin) === p.pin && ['revisor', 'calls', 'teste', 'diretor'].includes(r.papel);
let motivo = ok ? '' : 'acesso';
if (ok && (!p.chat || !p.msg)) motivo = 'mensagem';
else if (ok && p.texto.length < 2) motivo = 'texto';
return [{ json: { ok: !motivo, chat: p.chat || '-', msg: p.msg || '-', resposta: { ok: false, motivo } } }];
` } } });

const podeSeguir = ifElse({ version: 2.2, config: { name: 'Acesso válido?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

// Só grupos de cliente que passam pelo suporte; o assunto da mensagem vem da classificação do Monitor de respostas.
const grupo = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Conferir grupo', credentials: PG, alwaysOutputData: true, parameters: {
  operation: 'executeQuery',
  query: "SELECT (SELECT c.nome FROM chats c WHERE c.chat_id = $1 AND c.origem LIKE 'suporte%' AND c.nome IS NOT NULL LIMIT 1) AS nome,\n  (SELECT e.classificacao FROM atendimento_estado e WHERE e.msg_id = $2 LIMIT 1) AS classificacao;",
  options: { queryReplacement: '={{ [ $json.chat, $json.msg ] }}' } } } });

// Dinheiro, contrato e jurídico ficam com a diretoria. O teste só responde em grupo de teste.
const conferir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Conferir pedido', parameters: { jsCode: `const r = $('Achar pessoa').first().json || {};
const g = $input.first().json || {};
const c = g.classificacao || {};
const DIRECAO = ['financeiro', 'cancelamento', 'jurídico', 'juridico'];
const diretor = r.papel === 'diretor';
let motivo = '';
if (!g.nome) motivo = 'grupo';
else if (r.papel === 'teste' && !/teste/i.test(g.nome)) motivo = 'grupo';
else if (!diretor && c.sensivel === true && DIRECAO.includes(String(c.tema || '').toLowerCase())) motivo = 'direcao';
const slug = String(r.nome || '').split(' ')[0].normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
return [{ json: { ok: !motivo, inst: diretor ? 'suporte' : 'suporte-' + slug, diretor, resposta: { ok: false, motivo } } }];
` } } });

const podeMandar = ifElse({ version: 2.2, config: { name: 'Pode mandar?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const estado = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Número conectado?', credentials: EVO, parameters: {
  method: 'GET', url: `=${BASE}/instance/connectionState/{{ $json.inst }}`, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', options: SEM_ERRO } } });

const noGrupo = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Número está no grupo?', credentials: EVO, parameters: {
  method: 'GET', url: `=${BASE}/group/findGroupInfos/{{ $("Conferir pedido").first().json.inst }}`, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendQuery: true, queryParameters: { parameters: [{ name: 'groupJid', value: '={{ $("Validar acesso").first().json.chat }}' }] }, options: SEM_ERRO } } });

// Sai pelo número da pessoa quando ele está conectado e no grupo. Senão, pelo número do suporte.
const escolher = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Escolher número', parameters: { jsCode: `const r = $('Achar pessoa').first().json || {};
const p = $('Ler pedido').first().json;
const v = $('Conferir pedido').first().json;
const st = $('Número conectado?').first().json || {};
const gi = $input.first().json || {};
const aberto = st.statusCode >= 200 && st.statusCode < 300 && String(((st.body || {}).instance || st.body || {}).state) === 'open';
const membro = gi.statusCode >= 200 && gi.statusCode < 300 && !!(gi.body || {}).id;
const proprio = !v.diretor && aberto && membro;
const nome = String(r.nome || '').split(' ')[0];
// Sempre com o nome em negrito na frente, pelo número de quem for: assim um número pode ser usado por mais de uma pessoa.
const texto = v.diretor ? p.texto + '\\n\\n*Érica, time de suporte, Grupo Euforia*' : '*' + nome + ':* ' + p.texto;
return [{ json: { inst: proprio ? v.inst : 'suporte', proprio, corpo: JSON.stringify({ number: $('Validar acesso').first().json.chat, text: texto }) } }];
` } } });

const mandar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Mandar no grupo', credentials: EVO, parameters: {
  method: 'POST', url: `=${BASE}/message/sendText/{{ $json.inst }}`, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}', options: SEM_ERRO } } });

const resultado = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Resultado', parameters: { jsCode: `const r = $input.first().json || {};
const ok = r.statusCode >= 200 && r.statusCode < 300;
const e = $('Escolher número').first().json;
return [{ json: { resposta: ok ? { ok: true, pelo: e.proprio ? 'seu número' : 'número do suporte' } : { ok: false, motivo: 'whatsapp' } } }];
` } } });

const confirmar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const recusarGrupo = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar grupo', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Painel da equipe · responder cliente (V1)\nIsmael, Rômulo (e teste, só em grupo de teste) respondem pela aba Responder. Sempre com "*Nome:*" na frente. Sai pelo número de suporte da pessoa (suporte-<nome>) se estiver conectado e no grupo; senão pelo "suporte". Diretoria sai pelo "suporte" assinado como Érica.\nAssunto de dinheiro, contrato ou jurídico é recusado (só a diretoria). A mensagem cai no banco pelo webhook e o cliente sai da fila sozinho.', [], { color: 4 });

export default workflow('painel-responder', 'Painel | Responder cliente (V1)')
  .add(pedir).to(ler).to(acesso).to(validar)
  .to(podeSeguir
    .onTrue(grupo.to(conferir).to(podeMandar
      .onTrue(estado.to(noGrupo).to(escolher).to(mandar).to(resultado).to(confirmar))
      .onFalse(recusarGrupo)))
    .onFalse(recusar))
  .add(nota);
