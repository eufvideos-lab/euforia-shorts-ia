import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const EVOLUTION = { httpHeaderAuth: { id: 'MqNLRX9duuYKJSR2', name: 'Evolution API' } };
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Cliente escreve no portal', parameters: {
  httpMethod: 'POST', path: 'euforia-portal-mensagem', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

const lerPedido = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler mensagem', parameters: { jsCode: `const b = ($input.first().json.body) || {};
const id = String(b.a || '').replace(/-/g, '').toLowerCase();
const texto = String(b.texto || '').replace(/\\s+$/g, '').trim().slice(0, 2000);
return [{ json: { id: /^[0-9a-f]{32}$/.test(id) ? id : '00000000000000000000000000000000', texto, robo: !!b.site_url } }];
` } } });


// Cada pessoa do cliente tem o seu link (?a=<id da linha no 🔑 Acessos do portal>). Desmarcar "Ativo" corta o acesso.
const acessoNode = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Acesso da pessoa', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://api.notion.com/v1/pages/{{ $("Ler mensagem").first().json.id }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, options: {} } } });

const conferir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Conferir acesso', parameters: { jsCode: `const a = $input.first().json || {};
const pr = a.properties || {};
const txt = v => { if (!v) return ''; const t = v.title || v.rich_text; if (t) return t.map(x => x.plain_text).join('').trim(); if (v.select) return v.select.name; return ''; };
const valido = a.object === 'page' && !a.archived && !a.in_trash && ((a.parent || {}).database_id || '') === 'a95cdc41-6645-47f5-8c0f-99a85e31fb4e' && (pr['Ativo'] || {}).checkbox === true;
const cliente = valido ? ((((pr['Cliente'] || {}).relation || [])[0] || {}).id || '').replace(/-/g, '') : '';
const papel = txt(pr['Papel']) || 'Equipe';
return [{ json: { id: /^[0-9a-f]{32}$/.test(cliente) ? cliente : '00000000000000000000000000000000', pessoa: valido ? txt(pr['Pessoa']).replace(/\\s*\\(.*?\\)\\s*$/, '') : '', papel, podeAprovar: ['Dono', 'Sócio'].includes(papel), fone8: String((pr['WhatsApp'] || {}).phone_number || '').replace(/[^0-9]/g, '').slice(-8) } }];
` } } });

const fichaNode = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Ficha do cliente', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://api.notion.com/v1/pages/{{ $("Conferir acesso").first().json.id }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, options: {} } } });

const instancias = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Instâncias do WhatsApp', credentials: EVOLUTION, onError: 'continueRegularOutput', alwaysOutputData: true, executeOnce: true, parameters: {
  method: 'GET', url: 'https://api.grupoeuforia.tech/instance/fetchInstances', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', options: {} } } });

const validar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validar mensagem', parameters: { jsCode: `const p = $('Ler mensagem').first().json;
const fp = ($('Ficha do cliente').first().json.properties) || {};
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; return a ? a.map(t => t.plain_text).join('').trim() : ''; };
const nome = txt(fp['Cliente']);
const grupo = txt(fp['Grupo WhatsApp (ID)']);
const suporteOn = $('Instâncias do WhatsApp').all().some(i => i.json.name === 'suporte' && i.json.connectionStatus === 'open');
let erro = '';
if (!nome) erro = 'link';
else if (p.robo || p.texto.length < 1) erro = 'texto';
else if (!grupo || !/@g\\.us$/.test(grupo)) erro = 'sem-grupo';
else if (!suporteOn) erro = 'fora';
const pessoa = $('Conferir acesso').first().json.pessoa || nome.split(' ')[0];
const texto = '💬 Pelo portal, ' + pessoa + ':\\n' + p.texto;
return [{ json: { ok: !erro, envio: JSON.stringify({ number: grupo, text: texto }), resposta: erro ? { ok: false, motivo: erro } : { ok: true } } }];
` } } });

const podeSeguir = ifElse({ version: 2.2, config: { name: 'Pode enviar?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

// Só pelo número do suporte (Érica). A Isabela não é plano B.
const enviar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Mandar no grupo do cliente', credentials: EVOLUTION, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://api.grupoeuforia.tech/message/sendText/suporte', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.envio }}', options: { timeout: 30000, response: { response: { fullResponse: true, neverError: true } } } } } });

const resultado = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Resultado do envio', parameters: { jsCode: `const r = $input.first().json;
const ok = r.statusCode >= 200 && r.statusCode < 300;
return [{ json: { resposta: ok ? { ok: true } : { ok: false, motivo: 'fora' } } }];
` } } });

const confirmar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar ao cliente', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar mensagem', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Portal do cliente · mensagens (V1)\nO que o cliente escreve no portal vai para o grupo do WhatsApp dele pelo número do suporte (Érica), com "💬 Pelo portal, Nome:" na frente. A equipe responde no grupo e a resposta aparece no portal (lida do banco mensagens). Se o suporte estiver fora do ar, o portal pede para o cliente usar o grupo. Isabela não entra como plano B.', [], { color: 4 });

export default workflow('portal-mensagem', 'Portal | Mensagem do cliente para o grupo (V1)')
  .add(pedir).to(lerPedido).to(acessoNode).to(conferir).to(fichaNode).to(instancias).to(validar)
  .to(podeSeguir.onTrue(enviar.to(resultado).to(confirmar)).onFalse(recusar))
  .add(nota);
