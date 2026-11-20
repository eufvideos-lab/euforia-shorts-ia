import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const DRIVE = { googleDriveOAuth2Api: { id: 'rtZfUhZ3pDHQMYO1', name: 'Google Drive Euforia' } };
const DISCORD = { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } };
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Cliente envia gravação', parameters: {
  httpMethod: 'POST', path: 'euforia-portal-gravacao', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

const lerPedido = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler pedido', parameters: { jsCode: `const j = $input.first().json;
const b = j.body || {}, h = j.headers || {};
const id = String(b.a || '').replace(/-/g, '').toLowerCase();
const ORIG = ['https://lp.grupoeuforia.tech', 'https://grupoeuforia.com.br', 'https://www.grupoeuforia.com.br'];
const origem = ORIG.includes(h.origin) ? h.origin : 'https://grupoeuforia.com.br';
const limpa = (v, n) => String(v || '').replace(/[\\\\/:*?"<>|\\r\\n]+/g, ' ').trim().slice(0, n);
const etapa = ['iniciar', 'pronto'].includes(b.etapa) ? b.etapa : '';
const tamanho = Math.max(0, Math.floor(Number(b.tamanho) || 0));
const tipo = /^(video|audio|image)\\/[a-z0-9.+-]+$/i.test(String(b.tipo || '')) ? b.tipo : 'application/octet-stream';
return [{ json: { id: /^[0-9a-f]{32}$/.test(id) ? id : '00000000000000000000000000000000', etapa, origem,
  arquivo: limpa(b.nome, 120) || 'gravacao.mp4', tipo, tamanho, roteiro: limpa(b.roteiro, 90),
  fileId: /^[A-Za-z0-9_-]{10,80}$/.test(String(b.arquivo || '')) ? b.arquivo : '' } }];
` } } });


// Cada pessoa do cliente tem o seu link (?a=<id da linha no 🔑 Acessos do portal>). Desmarcar "Ativo" corta o acesso.
const acessoNode = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Acesso da pessoa', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://api.notion.com/v1/pages/{{ $("Ler pedido").first().json.id }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, options: {} } } });

const conferirAcesso = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Conferir acesso', parameters: { jsCode: `const a = $input.first().json || {};
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

// Fallback: o campo Drive da ficha costuma estar vazio; aí procura "NN - NOME" na pasta CLIENTES.
const pastaCliente = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Achar pasta do cliente', credentials: DRIVE, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: 'https://www.googleapis.com/drive/v3/files', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api',
  sendQuery: true, queryParameters: { parameters: [
    { name: 'q', value: "={{ \"'1mKfwiEOXjEj-6HDx9BFpZv9AesJRxGHR' in parents and name contains '\" + ((($json.properties || {})['Cliente'] || {}).title || []).map(t => t.plain_text).join('').trim().toUpperCase().replace(/'/g, \"\\\\'\") + \"' and mimeType = 'application/vnd.google-apps.folder' and trashed = false\" }}" },
    { name: 'fields', value: 'files(id,name)' },
    { name: 'supportsAllDrives', value: 'true' },
    { name: 'includeItemsFromAllDrives', value: 'true' }] }, options: {} } } });

const escolher = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Escolher pasta do cliente', parameters: { jsCode: `const fp = $('Ficha do cliente').first().json.properties || {};
const doLink = (String((fp['Drive'] || {}).url || '').match(/folders\\/([A-Za-z0-9_-]{10,})/) || [])[1];
const achada = (($input.first().json.files || [])[0] || {}).id;
return [{ json: { cliente: doLink || achada || 'nenhuma' } }];
` } } });

// A ARQUIVOS BRUTOS pode estar na pasta do cliente ou uma pasta abaixo (clientes antigos: "[NOME] & [EUFORIA]").
const subpastas = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Subpastas do cliente', credentials: DRIVE, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: 'https://www.googleapis.com/drive/v3/files', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api',
  sendQuery: true, queryParameters: { parameters: [
    { name: 'q', value: "={{ \"'\" + $json.cliente + \"' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false\" }}" },
    { name: 'fields', value: 'files(id,name)' },
    { name: 'pageSize', value: '50' },
    { name: 'supportsAllDrives', value: 'true' },
    { name: 'includeItemsFromAllDrives', value: 'true' }] }, options: {} } } });

const brutos = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Achar ARQUIVOS BRUTOS', parameters: { jsCode: `const filhas = $input.first().json.files || [];
const direta = filhas.find(f => /^ARQUIVOS BRUTOS$/i.test(String(f.name).trim()));
return [{ json: { direta: direta ? direta.id : '', netas: direta ? [] : filhas.map(f => f.id) } }];
` } } });

const brutosNeta = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Procurar um nível abaixo', credentials: DRIVE, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: 'https://www.googleapis.com/drive/v3/files', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api',
  sendQuery: true, queryParameters: { parameters: [
    { name: 'q', value: "={{ \"name = 'ARQUIVOS BRUTOS' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and (\" + (($json.netas.length ? $json.netas : ['nenhuma']).slice(0, 20).map(id => \"'\" + id + \"' in parents\").join(' or ')) + \")\" }}" },
    { name: 'fields', value: 'files(id,name)' },
    { name: 'supportsAllDrives', value: 'true' },
    { name: 'includeItemsFromAllDrives', value: 'true' }] }, options: {} } } });

const validar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validar pedido', parameters: { jsCode: `const Z = 'America/Recife';
const p = $('Ler pedido').first().json;
const fp = ($('Ficha do cliente').first().json.properties) || {};
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; return a ? a.map(t => t.plain_text).join('').trim() : ''; };
const nome = txt(fp['Cliente']);
const pasta = $('Achar ARQUIVOS BRUTOS').first().json.direta || ((($('Procurar um nível abaixo').first().json.files) || [])[0] || {}).id || '';
let erro = '';
if (!nome) erro = 'link';
else if (!p.etapa) erro = 'etapa';
else if (!pasta) erro = 'sem-pasta';
else if (p.etapa === 'iniciar' && (p.tamanho < 1 || p.tamanho > 30 * 1024 ** 3)) erro = 'tamanho';
else if (p.etapa === 'pronto' && !p.fileId) erro = 'arquivo';
const agora = DateTime.now().setZone(Z);
const nomeArq = agora.toFormat('dd-MM HH\\'h\\'mm') + ' Portal - ' + (p.roteiro ? p.roteiro + ' - ' : '') + p.arquivo;
const M = { '3ea98c0cdde081299709cf901fac7275': '<@1490768736876237082>', '3ea98c0cdde0812d9cb4c41ce70df4ae': '<@1410287139169763471>' };
const quem = ((fp['Responsável principal'] || {}).relation || []).map(r => M[r.id.replace(/-/g, '')]).filter(Boolean).join(' ') || 'Equipe';
return [{ json: { ok: !erro, etapa: p.etapa, pasta, nome, quem, origem: p.origem, tipo: p.tipo, tamanho: p.tamanho, fileId: p.fileId, roteiro: p.roteiro,
  meta: JSON.stringify({ name: nomeArq, parents: [pasta] }), resposta: { ok: false, motivo: erro } } }];
` } } });

const podeSeguir = ifElse({ version: 2.2, config: { name: 'Pedido válido?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const qualEtapa = ifElse({ version: 2.2, config: { name: 'Começo ou fim do envio?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
  conditions: [{ leftValue: '={{ $json.etapa }}', rightValue: 'iniciar', operator: { type: 'string', operation: 'equals' } }],
  combinator: 'and' } } } });

// O navegador do cliente manda o arquivo direto para o Google com o endereço que sai daqui (não passa pelo n8n).
const abrir = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Abrir envio no Drive', credentials: DRIVE, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://www.googleapis.com/upload/drive/v3/files', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api',
  sendQuery: true, queryParameters: { parameters: [{ name: 'uploadType', value: 'resumable' }, { name: 'supportsAllDrives', value: 'true' }] },
  sendHeaders: true, headerParameters: { parameters: [
    { name: 'X-Upload-Content-Type', value: '={{ $json.tipo }}' },
    { name: 'X-Upload-Content-Length', value: '={{ String($json.tamanho) }}' },
    { name: 'Origin', value: '={{ $json.origem }}' }] },
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.meta }}',
  options: { response: { response: { fullResponse: true, neverError: true } } } } } });

const endereco = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Endereço do envio', parameters: { jsCode: `const r = $input.first().json;
const url = (r.headers || {}).location || '';
return [{ json: { resposta: url ? { ok: true, url } : { ok: false, motivo: 'drive' } } }];
` } } });

const entregarEndereco = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver endereço', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const conferir = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Conferir arquivo no Drive', credentials: DRIVE, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://www.googleapis.com/drive/v3/files/{{ $json.fileId }}', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api',
  sendQuery: true, queryParameters: { parameters: [{ name: 'fields', value: 'id,name,parents,size,createdTime,webViewLink' }, { name: 'supportsAllDrives', value: 'true' }] }, options: {} } } });

const montarAviso = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar aviso', parameters: { jsCode: `const v = $('Validar pedido').first().json;
const f = $input.first().json;
const novo = f.createdTime && (Date.now() - new Date(f.createdTime)) < 2 * 24 * 3600 * 1000;
const ok = (f.parents || []).includes(v.pasta) && novo;
return [{ json: { ok, pasta: v.pasta, resposta: ok ? { ok: true } : { ok: false, motivo: 'arquivo' } } }];
` } } });

const avisoOk = ifElse({ version: 2.2, config: { name: 'Arquivo confere?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

// Edição automática: o vídeo vai para uma pasta "VÍDEO NN" nova e abre um pedido "Editar" no quadro de Vídeos Longos IA.
const listarVideos = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Pastas VÍDEO NN', credentials: DRIVE, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: 'https://www.googleapis.com/drive/v3/files', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api',
  sendQuery: true, queryParameters: { parameters: [
    { name: 'q', value: "={{ \"'\" + $json.pasta + \"' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false\" }}" },
    { name: 'fields', value: 'files(id,name)' },
    { name: 'pageSize', value: '200' },
    { name: 'supportsAllDrives', value: 'true' },
    { name: 'includeItemsFromAllDrives', value: 'true' }] }, options: {} } } });

const numerar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Próximo número', parameters: { jsCode: `const nums = ($input.first().json.files || []).map(f => (String(f.name).trim().match(/^V[IÍ]DEO\\s*0*(\\d+)/i) || [])[1]).filter(Boolean).map(Number);
const n = (nums.length ? Math.max(...nums) : 0) + 1;
const nome = 'VÍDEO ' + String(n).padStart(2, '0');
return [{ json: { n, nome, meta: JSON.stringify({ name: nome, mimeType: 'application/vnd.google-apps.folder', parents: [$('Montar aviso').first().json.pasta] }) } }];
` } } });

const criarPasta = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Criar pasta VÍDEO NN', credentials: DRIVE, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'POST', url: 'https://www.googleapis.com/drive/v3/files', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api',
  sendQuery: true, queryParameters: { parameters: [{ name: 'supportsAllDrives', value: 'true' }, { name: 'fields', value: 'id,name' }] },
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.meta }}', options: {} } } });

const mover = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Mover vídeo para a pasta', credentials: DRIVE, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'PATCH', url: '={{ "https://www.googleapis.com/drive/v3/files/" + $("Validar pedido").first().json.fileId }}', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api',
  sendQuery: true, queryParameters: { parameters: [
    { name: 'addParents', value: '={{ $json.id || "" }}' },
    { name: 'removeParents', value: '={{ $json.id ? $("Montar aviso").first().json.pasta : "" }}' },
    { name: 'supportsAllDrives', value: 'true' },
    { name: 'fields', value: 'id,name,parents,size,webViewLink' }] },
  sendBody: true, specifyBody: 'json', jsonBody: '{}', options: {} } } });

const montarPedido = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar pedido de edição', parameters: { jsCode: `const Z = 'America/Recife';
const v = $('Validar pedido').first().json;
const p = $('Ler pedido').first().json;
const f = $('Conferir arquivo no Drive').first().json;
const pasta = $('Criar pasta VÍDEO NN').first().json;
const nn = pasta.id ? $('Próximo número').first().json.nome : '';
const link = f.webViewLink || ('https://drive.google.com/file/d/' + v.fileId + '/view');
const agora = DateTime.now().setZone(Z).toFormat('dd/MM HH:mm');
const titulo = v.nome.toUpperCase() + ' | ' + (nn || 'VÍDEO') + ' (portal)';
const obs = 'Enviado por ' + ($('Conferir acesso').first().json.pessoa || 'cliente') + ' pelo portal em ' + agora + '.' + (v.roteiro ? ' Roteiro: ' + v.roteiro + '.' : '');
const t = s => [{ type: 'text', text: { content: String(s).slice(0, 1900) } }];
const body = { parent: { database_id: '3fea57fbb3ca4a7d9d16921d2f0b00cf' }, properties: {
  'Pedido': { title: t(titulo) },
  'Cliente': { relation: [{ id: $('Conferir acesso').first().json.id }] },
  'Vídeo bruto (link do Drive)': { url: link },
  'Status': { select: { name: 'Editar' } },
  'Modelo': { select: { name: /acr[oó]pole/i.test(v.nome) ? 'Nova Acrópole' : 'Padrão' } },
  'Observações para a máquina': { rich_text: t(obs) } } };
const mb = f.size ? (Number(f.size) / 1024 ** 2 >= 1024 ? (Number(f.size) / 1024 ** 3).toFixed(1) + ' GB' : Math.round(Number(f.size) / 1024 ** 2) + ' MB') : '';
return [{ json: { body: JSON.stringify(body), nn, link, mb, nomeArq: f.name } }];
` } } });

const criarPedido = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Abrir pedido de edição', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/pages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.body }}', options: {} } } });

const montarDiscord = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar aviso da equipe', parameters: { jsCode: `const v = $('Validar pedido').first().json;
const m = $('Montar pedido de edição').first().json;
const pedido = $input.first().json;
const onde = 'ARQUIVOS BRUTOS' + (m.nn ? ' › ' + m.nn : '');
const edicao = pedido.id ? 'Pedido de edição aberto no quadro de Vídeos Longos IA (Editar): ' + (pedido.url || '') : '⚠️ Não consegui abrir o pedido de edição; abram no quadro de Vídeos Longos IA.';
const msg = '📥 **' + ($('Conferir acesso').first().json.pessoa || v.nome) + '** (' + v.nome + ') enviou uma gravação pelo portal' + (v.roteiro ? ' (roteiro: **' + v.roteiro + '**)' : '') + ':\\n' + m.nomeArq + (m.mb ? ' · ' + m.mb : '') + '\\nJá está em ' + onde + ': ' + m.link + '\\n' + edicao + '\\n' + v.quem + ', acompanhem a edição.\\n— Érica, time de suporte, Grupo Euforia';
return [{ json: { discord: JSON.stringify({ content: msg.slice(0, 1990) }) } }];
` } } });

const avisar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Avisar no #dia-a-dia', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://discord.com/api/v10/channels/1556642691410956339/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.discord }}', options: {} } } });

const confirmar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar ao cliente', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($("Montar aviso").first().json.resposta) }}', options: {} } } });

const recusarArq = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar arquivo', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar pedido', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Portal do cliente · envio de gravação (V1)\n1) "iniciar": acha a pasta ARQUIVOS BRUTOS do cliente (link Drive da ficha ou "NN - NOME" em CLIENTES) e abre um envio no Drive. O navegador manda o vídeo direto ao Google, em partes.\n2) "pronto": confere o arquivo, cria a pasta "VÍDEO NN" seguinte em ARQUIVOS BRUTOS, move o vídeo para ela, abre o pedido "Editar" no quadro 🎞️ Pedidos de Vídeos Longos IA e avisa no #dia-a-dia marcando o responsável.\nNome do arquivo: "dd-MM HHhmm Portal - roteiro - nome original".', [], { color: 4 });

export default workflow('portal-gravacao', 'Portal | Envio de gravação (V1)')
  .add(pedir).to(lerPedido).to(acessoNode).to(conferirAcesso).to(fichaNode).to(pastaCliente).to(escolher).to(subpastas).to(brutos).to(brutosNeta).to(validar)
  .to(podeSeguir
    .onTrue(qualEtapa
      .onTrue(abrir.to(endereco).to(entregarEndereco))
      .onFalse(conferir.to(montarAviso).to(avisoOk.onTrue(listarVideos.to(numerar).to(criarPasta).to(mover).to(montarPedido).to(criarPedido).to(montarDiscord).to(avisar).to(confirmar)).onFalse(recusarArq))))
    .onFalse(recusar))
  .add(nota);
