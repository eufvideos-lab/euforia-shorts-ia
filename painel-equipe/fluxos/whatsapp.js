import { workflow, node, trigger, ifElse, switchCase, sticky } from '@n8n/workflow-sdk';

const EVO = { httpHeaderAuth: { id: 'MqNLRX9duuYKJSR2', name: 'Evolution API' } };
const BASE = 'https://api.grupoeuforia.tech';
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const ACESSO = { __rl: true, mode: 'id', value: 'ilXDZWGAcOjoajx7', cachedResultName: 'Painel equipe · acesso' };
const SEM_ERRO = { response: { response: { neverError: true, fullResponse: true } } };

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'WhatsApp do painel', parameters: {
  httpMethod: 'POST', path: 'euforia-painel-whatsapp', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

const ler = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler pedido', parameters: { jsCode: `const b = ($input.first().json.body) || {};
const u = String(b.u || '').toLowerCase();
return [{ json: { u: /^[0-9a-f]{24}$/.test(u) ? u : 'x', pin: String(b.pin || '').replace(/[^0-9]/g, '').slice(0, 6),
  acao: ['conectar', 'desconectar'].includes(b.acao) ? b.acao : 'status' } }];
` } } });

const acesso = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Achar pessoa', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: ACESSO, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'token', condition: 'eq', keyValue: '={{ $json.u }}' }] }, limit: 1 } } });

// Cada pessoa tem a própria instância na Evolution: "suporte-" + primeiro nome (Ismael -> suporte-ismael).
const validar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validar acesso', parameters: { jsCode: `const p = $('Ler pedido').first().json;
const r = $input.first().json || {};
const ok = !!r.token && r.token === p.u && r.ativo === true && String(r.pin) === p.pin && ['revisor', 'calls', 'teste'].includes(r.papel);
const slug = String(r.nome || '').split(' ')[0].normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
return [{ json: { ok: ok && !!slug, acao: p.acao, inst: 'suporte-' + slug, resposta: { ok: false, motivo: 'acesso' } } }];
` } } });

const podeSeguir = ifElse({ version: 2.2, config: { name: 'Acesso válido?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const estado = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Ver estado', credentials: EVO, parameters: {
  method: 'GET', url: `=${BASE}/instance/connectionState/{{ $json.inst }}`, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', options: SEM_ERRO } } });

const decidir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Decidir', parameters: { jsCode: `const v = $('Validar acesso').first().json;
const r = $input.first().json || {};
const st = r.statusCode || 0;
const b = r.body || {};
const existe = st >= 200 && st < 300;
const est = existe ? String((b.instance || b).state || 'close') : (st === 404 ? 'inexistente' : 'erro');
let etapa = 'responder';
if (v.acao === 'conectar' && est !== 'open' && est !== 'erro') etapa = existe ? 'conectar' : 'criar';
if (v.acao === 'desconectar' && est === 'open') etapa = 'sair';
const conectado = est === 'open';
return [{ json: { inst: v.inst, etapa, resposta: { ok: est !== 'erro', estado: conectado ? 'conectado' : (est === 'connecting' ? 'aguardando' : 'desconectado'), motivo: est === 'erro' ? 'erro' : '' } } }];
` } } });

const caminho = switchCase({ version: 3.2, config: { name: 'Próximo passo', parameters: { rules: { values: [
    { outputKey: 'responder', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ $json.etapa }}', rightValue: 'responder', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
    { outputKey: 'criar', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ $json.etapa }}', rightValue: 'criar', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
    { outputKey: 'conectar', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ $json.etapa }}', rightValue: 'conectar', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
    { outputKey: 'sair', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ $json.etapa }}', rightValue: 'sair', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } }
  ] }, options: {} } } });

// A instância nova recebe o mesmo webhook do número "suporte", para as mensagens irem ao mesmo banco.
const webhookSuporte = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Copiar webhook do suporte', credentials: EVO, parameters: {
  method: 'GET', url: `${BASE}/webhook/find/suporte`, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', options: {} } } });

const corpo = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar instância nova', parameters: { jsCode: `const w = $input.first().json.webhook || $input.first().json;
if (!w.url) throw new Error('Webhook do suporte não encontrado');
return [{ json: { corpo: { instanceName: $('Decidir').first().json.inst, integration: 'WHATSAPP-BAILEYS', qrcode: true,
  webhook: { enabled: true, url: w.url, byEvents: !!(w.webhookByEvents ?? w.byEvents), base64: !!(w.webhookBase64 ?? w.base64), events: w.events || [] } } } }];
` } } });

const criar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Criar instância', credentials: EVO, parameters: {
  method: 'POST', url: `${BASE}/instance/create`, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify($json.corpo) }}', options: SEM_ERRO } } });

const conectar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Pedir QR', credentials: EVO, parameters: {
  method: 'GET', url: `=${BASE}/instance/connect/{{ $json.inst }}`, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', options: SEM_ERRO } } });

const montarQR = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar QR', parameters: { jsCode: `const r = $input.first().json || {};
const b = r.body || {};
const q = b.qrcode || b;
let img = String(q.base64 || '');
if (img && !img.startsWith('data:')) img = 'data:image/png;base64,' + img;
const ok = r.statusCode >= 200 && r.statusCode < 300 && !!img;
return [{ json: { resposta: { ok, estado: 'aguardando', qr: ok ? img : '', motivo: ok ? '' : 'erro' } } }];
` } } });

const sair = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Desconectar', credentials: EVO, parameters: {
  method: 'DELETE', url: `=${BASE}/instance/logout/{{ $json.inst }}`, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', options: SEM_ERRO } } });

const saiu = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Confirmar saída', parameters: { jsCode: `const r = $input.first().json || {};
const ok = r.statusCode >= 200 && r.statusCode < 300;
return [{ json: { resposta: { ok, estado: ok ? 'desconectado' : 'conectado', motivo: ok ? '' : 'erro' } } }];
` } } });

const devolverEstado = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver estado', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const devolverQR = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver QR', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const devolverSaida = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver saída', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Painel da equipe · WhatsApp de suporte (V1)\nIsmael e Rômulo ligam o número de suporte de trabalho deles pelo QR na aba "Responder". Cada um tem a própria instância na Evolution (suporte-<nome>), criada na primeira conexão com o mesmo webhook do número "suporte" (mensagens vão para o mesmo banco).\nAções: status, conectar (devolve o QR), desconectar.', [], { color: 4 });

export default workflow('painel-whatsapp', 'Painel | Conectar WhatsApp (V1)')
  .add(pedir).to(ler).to(acesso).to(validar)
  .to(podeSeguir
    .onTrue(estado.to(decidir).to(caminho
      .onCase(0, devolverEstado)
      .onCase(1, webhookSuporte.to(corpo).to(criar).to(montarQR).to(devolverQR))
      .onCase(2, conectar.to(montarQR))
      .onCase(3, sair.to(saiu).to(devolverSaida))))
    .onFalse(recusar))
  .add(nota);
