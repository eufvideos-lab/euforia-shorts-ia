import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const DRIVE = { googleDriveOAuth2Api: { id: 'rtZfUhZ3pDHQMYO1', name: 'Google Drive Euforia' } };
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };
const ACESSO = { __rl: true, mode: 'id', value: 'ilXDZWGAcOjoajx7', cachedResultName: 'Painel equipe · acesso' };
const PASTA_PAINEL = 'ENTREGAS DO PAINEL';

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Envio de arquivo do painel', parameters: {
  httpMethod: 'POST', path: 'euforia-painel-arquivo', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

const ler = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler pedido', parameters: { jsCode: `const j = $input.first().json;
const b = j.body || {}, h = j.headers || {};
const u = String(b.u || '').toLowerCase();
const card = String(b.card || '').replace(/-/g, '').toLowerCase();
const cli = String(b.cliente || '').replace(/-/g, '').toLowerCase();
const ORIG = ['https://lp.grupoeuforia.tech', 'https://grupoeuforia.com.br', 'https://www.grupoeuforia.com.br'];
const limpa = (v, n) => String(v || '').replace(/[\\\\/:*?"<>|\\r\\n]+/g, ' ').trim().slice(0, n);
const tipo = /^[a-z]+\\/[a-z0-9.+-]+$/i.test(String(b.tipo || '')) ? b.tipo : 'application/octet-stream';
return [{ json: { u: /^[0-9a-f]{24}$/.test(u) ? u : 'x', pin: String(b.pin || '').replace(/[^0-9]/g, '').slice(0, 6),
  card: /^[0-9a-f]{32}$/.test(card) ? card : '00000000000000000000000000000000',
  modo: b.modo === 'pedido' ? 'pedido' : 'entrega', cliente: /^[0-9a-f]{32}$/.test(cli) ? cli : '00000000000000000000000000000000',
  etapa: ['iniciar', 'pronto'].includes(b.etapa) ? b.etapa : '', origem: ORIG.includes(h.origin) ? h.origin : 'https://grupoeuforia.com.br',
  arquivo: limpa(b.nome, 120) || 'arquivo', tipo, tamanho: Math.max(0, Math.floor(Number(b.tamanho) || 0)),
  fileId: /^[A-Za-z0-9_-]{10,80}$/.test(String(b.arquivo || '')) ? b.arquivo : '' } }];
` } } });

const acesso = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Achar pessoa', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: ACESSO, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'token', condition: 'eq', keyValue: '={{ $json.u }}' }] }, limit: 1 } } });

const cardNode = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Card da entrega', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://api.notion.com/v1/pages/{{ $("Ler pedido").first().json.card }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, options: {} } } });

const fichaNode = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Ficha do cliente', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://api.notion.com/v1/pages/{{ $("Ler pedido").first().json.modo === "pedido" ? $("Ler pedido").first().json.cliente : ((($json.properties || {})["Cliente"] || {}).relation || [{ id: "00000000000000000000000000000000" }])[0].id }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, options: {} } } });

// Mesmo jeito do portal: o campo Drive da ficha costuma estar vazio; aí procura "NN - NOME" na pasta CLIENTES.
const pastaCliente = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Achar pasta do cliente', credentials: DRIVE, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: 'https://www.googleapis.com/drive/v3/files', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api',
  sendQuery: true, queryParameters: { parameters: [
    { name: 'q', value: "={{ \"'1mKfwiEOXjEj-6HDx9BFpZv9AesJRxGHR' in parents and name contains '\" + ((($json.properties || {})['Cliente'] || {}).title || []).map(t => t.plain_text).join('').trim().toUpperCase().replace(/'/g, \"\\\\'\") + \"' and mimeType = 'application/vnd.google-apps.folder' and trashed = false\" }}" },
    { name: 'fields', value: 'files(id,name)' },
    { name: 'supportsAllDrives', value: 'true' },
    { name: 'includeItemsFromAllDrives', value: 'true' }] }, options: {} } } });

const validar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validar envio', parameters: { jsCode: `const p = $('Ler pedido').first().json;
const r = $('Achar pessoa').first().json || {};
const card = $('Card da entrega').first().json || {};
const fp = ($('Ficha do cliente').first().json.properties) || {};
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; return ''; };
const cp = card.properties || {};
const sem = id => String(id || '').replace(/-/g, '');
const titulo = txt(cp['Entrega']);
const status = txt(cp['Status']);
const resp = ((cp['Responsável'] || {}).relation || []).map(x => sem(x.id));
const acessoOk = !!r.token && r.token === p.u && r.ativo === true && String(r.pin) === p.pin;
const meu = r.papel === 'teste' ? /TESTE PAINEL/.test(titulo) : resp.includes(r.ficha);
const doLink = (String((fp['Drive'] || {}).url || '').match(/folders\\/([A-Za-z0-9_-]{10,})/) || [])[1];
const cliente = doLink || ((($('Achar pasta do cliente').first().json.files) || [])[0] || {}).id || '';
// Anexo de pedido ao escritório: ainda não tem card; quem pede é Ismael, Rômulo, diretoria ou teste, e vai para a pasta de pedidos do cliente.
const pedido = p.modo === 'pedido';
const ficha = $('Ficha do cliente').first().json || {};
let erro = '';
if (!acessoOk) erro = 'acesso';
else if (!p.etapa) erro = 'etapa';
else if (pedido && !['revisor', 'calls', 'diretor', 'teste'].includes(r.papel)) erro = 'permissao';
else if (pedido && sem((ficha.parent || {}).database_id) !== '3ddc91b406be49e98e630c298d9162d8') erro = 'cliente';
else if (pedido && !cliente) erro = 'sem-pasta';
else if (pedido) { if (p.etapa === 'iniciar' && (p.tamanho < 1 || p.tamanho > 5 * 1024 ** 3)) erro = 'tamanho'; else if (p.etapa === 'pronto' && !p.fileId) erro = 'arquivo'; }
else if (!card.id || sem((card.parent || {}).database_id) !== '74b3076a325749e3bac4ba6659215e48') erro = 'card';
else if (!meu) erro = 'permissao';
else if (!['A fazer', 'Fazendo', 'Ajustes'].includes(status)) erro = 'etapa';
else if (!cliente) erro = 'sem-pasta';
else if (p.etapa === 'iniciar' && (p.tamanho < 1 || p.tamanho > 20 * 1024 ** 3)) erro = 'tamanho';
else if (p.etapa === 'pronto' && !p.fileId) erro = 'arquivo';
const agora = DateTime.now().setZone('America/Recife');
const nomeArq = pedido ? 'PEDIDO - ' + agora.toFormat('dd-MM HH\\'h\\'mm') + ' - ' + r.nome + ' - ' + p.arquivo : (titulo.replace(/[\\\\/:*?"<>|]+/g, ' ').replace(/\\s+/g, ' ').trim() || 'ENTREGA') + ' - ' + agora.toFormat('dd-MM HH\\'h\\'mm') + ' - ' + p.arquivo;
return [{ json: { ok: !erro, etapa: p.etapa, cliente, nomeArq, pastaNome: pedido ? 'PEDIDOS DO PAINEL' : '${PASTA_PAINEL}', origem: p.origem, tipo: p.tipo, tamanho: p.tamanho, fileId: p.fileId,
  resposta: { ok: false, motivo: erro } } }];
` } } });

const podeSeguir = ifElse({ version: 2.2, config: { name: 'Envio válido?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const qualEtapa = ifElse({ version: 2.2, config: { name: 'Começo ou fim do envio?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
  conditions: [{ leftValue: '={{ $json.etapa }}', rightValue: 'iniciar', operator: { type: 'string', operation: 'equals' } }],
  combinator: 'and' } } } });

const acharPainel = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Achar pasta do painel', credentials: DRIVE, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: 'https://www.googleapis.com/drive/v3/files', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api',
  sendQuery: true, queryParameters: { parameters: [
    { name: 'q', value: "={{ \"'\" + $json.cliente + \"' in parents and name = '\" + $json.pastaNome + \"' and mimeType = 'application/vnd.google-apps.folder' and trashed = false\" }}" },
    { name: 'fields', value: 'files(id,name)' },
    { name: 'supportsAllDrives', value: 'true' },
    { name: 'includeItemsFromAllDrives', value: 'true' }] }, options: {} } } });

const decidir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Pasta existe?', parameters: { jsCode: `const v = $('Validar envio').first().json;
const achada = (($input.first().json.files || [])[0] || {}).id || '';
return [{ json: { pasta: achada, meta: JSON.stringify({ name: v.pastaNome, mimeType: 'application/vnd.google-apps.folder', parents: [v.cliente] }) } }];
` } } });

const temPasta = ifElse({ version: 2.2, config: { name: 'Já tem a pasta?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.pasta }}', rightValue: '', operator: { type: 'string', operation: 'notEmpty', singleValue: true } }],
  combinator: 'and' } } } });

const criarPasta = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Criar pasta do painel', credentials: DRIVE, parameters: {
  method: 'POST', url: 'https://www.googleapis.com/drive/v3/files', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api',
  sendQuery: true, queryParameters: { parameters: [{ name: 'supportsAllDrives', value: 'true' }, { name: 'fields', value: 'id,name' }] },
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.meta }}', options: {} } } });

// O navegador manda o arquivo direto para o Google com o endereço que sai daqui (não passa pelo n8n).
const abrir = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Abrir envio no Drive', credentials: DRIVE, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://www.googleapis.com/upload/drive/v3/files', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api',
  sendQuery: true, queryParameters: { parameters: [{ name: 'uploadType', value: 'resumable' }, { name: 'supportsAllDrives', value: 'true' }] },
  sendHeaders: true, headerParameters: { parameters: [
    { name: 'X-Upload-Content-Type', value: '={{ $("Validar envio").first().json.tipo }}' },
    { name: 'X-Upload-Content-Length', value: '={{ String($("Validar envio").first().json.tamanho) }}' },
    { name: 'Origin', value: '={{ $("Validar envio").first().json.origem }}' }] },
  sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify({ name: $("Validar envio").first().json.nomeArq, parents: [$json.pasta || $json.id] }) }}',
  options: { response: { response: { fullResponse: true, neverError: true } } } } } });

const endereco = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Endereço do envio', parameters: { jsCode: `const r = $input.first().json;
const url = (r.headers || {}).location || '';
return [{ json: { resposta: url ? { ok: true, url } : { ok: false, motivo: 'drive' } } }];
` } } });

const devolverEndereco = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver endereço', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const conferir = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Conferir arquivo no Drive', credentials: DRIVE, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://www.googleapis.com/drive/v3/files/{{ $json.fileId }}', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api',
  sendQuery: true, queryParameters: { parameters: [{ name: 'fields', value: 'id,name,createdTime,webViewLink' }, { name: 'supportsAllDrives', value: 'true' }] }, options: {} } } });

const link = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Link do arquivo', parameters: { jsCode: `const f = $input.first().json;
const novo = f.id && f.createdTime && (Date.now() - new Date(f.createdTime)) < 24 * 3600 * 1000;
return [{ json: { resposta: novo ? { ok: true, link: f.webViewLink || ('https://drive.google.com/file/d/' + f.id + '/view'), nome: f.name } : { ok: false, motivo: 'arquivo' } } }];
` } } });

const devolverLink = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver link', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar envio', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Painel da equipe · envio de arquivo (V1)\n1) "iniciar": confere pessoa e card, acha a pasta do cliente (Drive da ficha ou "NN - NOME" em CLIENTES), cria "' + PASTA_PAINEL + '" se faltar e abre um envio no Drive. O navegador manda o arquivo direto ao Google.\n2) "pronto": confere o arquivo e devolve o link. Quem grava no card é o fluxo "Painel | Botões da equipe" (Mandar para revisão).\nModo "pedido" (anexos do Pedir ao escritório): sem card, com o cliente escolhido; só Ismael, Rômulo, diretoria e teste; vai para "PEDIDOS DO PAINEL" na pasta do cliente; até 5 GB por arquivo.', [], { color: 4 });

export default workflow('painel-arquivo', 'Painel | Envio de arquivo da equipe (V1)')
  .add(pedir).to(ler).to(acesso).to(cardNode).to(fichaNode).to(pastaCliente).to(validar)
  .to(podeSeguir
    .onTrue(qualEtapa
      .onTrue(acharPainel.to(decidir).to(temPasta
        .onTrue(abrir.to(endereco).to(devolverEndereco))
        .onFalse(criarPasta.to(abrir))))
      .onFalse(conferir.to(link).to(devolverLink)))
    .onFalse(recusar))
  .add(nota);
