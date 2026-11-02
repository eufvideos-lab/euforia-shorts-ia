import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

// YouTube | Postar vídeo: fluxo único para postar no canal do Henrique. Outros fluxos chamam com o nó "Execute Workflow".
// Entrada: video (link ou ID do Drive), titulo, descricao, tags (lista ou texto com vírgulas), privacidade (public | unlisted | private),
// publicar_em (data ISO, opcional: agenda), thumb (link ou ID do Drive, opcional), origem (quem pediu).
// Enquanto a auditoria do Google não sai, o YouTube trava todo envio como PRIVADO. Depois da auditoria vale o que for pedido.
const PG = { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } };
const YT = { googleOAuth2Api: { id: 'HCURLnh3Nf1ZIxhN', name: 'YouTube Euforia' } };
const DRIVE = { googleDriveOAuth2Api: { id: 'rtZfUhZ3pDHQMYO1', name: 'Google Drive Euforia' } };

const chamado = trigger({ type: 'n8n-nodes-base.executeWorkflowTrigger', version: 1.1, config: { name: 'Chamado por outro fluxo', parameters: { inputSource: 'passthrough' } } });

const preparar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Preparar', parameters: { jsCode: `const x = $input.first().json || {};
const idDrive = v => { const s = String(v || '').trim(); const m = s.match(/(?:\\/d\\/|[?&]id=)([A-Za-z0-9_-]{20,})/); return m ? m[1] : (/^[A-Za-z0-9_-]{20,}$/.test(s) ? s : ''); };
const erros = [];
const video = idDrive(x.video);
if (!video) erros.push('video: mande o link ou o ID do arquivo no Google Drive');
const titulo = String(x.titulo || '').replace(/[<>]/g, '').trim();
if (!titulo) erros.push('titulo vazio');
if (titulo.length > 100) erros.push('titulo passa de 100 caracteres');
const descricao = String(x.descricao || '').replace(/[<>]/g, '');
if (descricao.length > 5000) erros.push('descricao passa de 5000 caracteres');
let tags = Array.isArray(x.tags) ? x.tags : String(x.tags || '').split(',');
tags = tags.map(t => String(t).replace(/[<>]/g, '').trim()).filter(Boolean);
while (tags.join(',').length > 480) tags.pop();
const privacidade = ['public', 'unlisted', 'private'].includes(String(x.privacidade || '')) ? String(x.privacidade) : 'private';
let publicarEm = '';
if (x.publicar_em) { const d = DateTime.fromISO(String(x.publicar_em), { zone: 'America/Recife' }); if (d.isValid && d > DateTime.now()) publicarEm = d.toUTC().toISO(); else erros.push('publicar_em inválido ou no passado'); }
const thumb = x.thumb ? idDrive(x.thumb) : '';
if (x.thumb && !thumb) erros.push('thumb: mande o link ou o ID da imagem no Google Drive');
const meta = { snippet: { title: titulo, description: descricao, tags, categoryId: String(x.categoria || '22'), defaultLanguage: 'pt-BR', defaultAudioLanguage: 'pt-BR' },
  status: { privacyStatus: publicarEm ? 'private' : privacidade, selfDeclaredMadeForKids: false } };
if (publicarEm) meta.status.publishAt = publicarEm;
return [{ json: { ok: erros.length === 0, erros, video, thumb, meta, titulo, privacidade: publicarEm ? 'agendado' : privacidade, publicarEm, origem: String(x.origem || '').slice(0, 80) } }];
` } } });

const valido = ifElse({ version: 2.2, config: { name: 'Pedido certo?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const recusar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Devolver erro', parameters: { jsCode: `return [{ json: { ok: false, erros: $('Preparar').first().json.erros } }];` } } });

const iniciar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Abrir envio no YouTube', credentials: YT, parameters: {
  method: 'POST', url: 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
  authentication: 'predefinedCredentialType', nodeCredentialType: 'googleOAuth2Api',
  sendHeaders: true, headerParameters: { parameters: [{ name: 'X-Upload-Content-Type', value: 'video/*' }] },
  sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.meta) }}',
  options: { response: { response: { fullResponse: true } } } } } });

const baixarVideo = node({ type: 'n8n-nodes-base.googleDrive', version: 3, config: { name: 'Baixar vídeo do Drive', credentials: DRIVE, parameters: {
  resource: 'file', operation: 'download', fileId: { __rl: true, mode: 'id', value: "={{ $('Preparar').first().json.video }}" }, options: { binaryPropertyName: 'data' } } } });

const enviar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Enviar vídeo', credentials: YT, parameters: {
  method: 'PUT', url: "={{ $('Abrir envio no YouTube').first().json.headers.location }}",
  authentication: 'predefinedCredentialType', nodeCredentialType: 'googleOAuth2Api',
  sendBody: true, contentType: 'binaryData', inputDataFieldName: 'data',
  options: { timeout: 3600000 } } } });

const temThumb = ifElse({ version: 2.2, config: { name: 'Tem thumb?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: "={{ !!$('Preparar').first().json.thumb }}", rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const baixarThumb = node({ type: 'n8n-nodes-base.googleDrive', version: 3, config: { name: 'Baixar thumb do Drive', credentials: DRIVE, parameters: {
  resource: 'file', operation: 'download', fileId: { __rl: true, mode: 'id', value: "={{ $('Preparar').first().json.thumb }}" }, options: { binaryPropertyName: 'data' } } } });

const subirThumb = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Subir thumb', credentials: YT, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: "={{ 'https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=' + $('Enviar vídeo').first().json.id }}",
  authentication: 'predefinedCredentialType', nodeCredentialType: 'googleOAuth2Api',
  sendBody: true, contentType: 'binaryData', inputDataFieldName: 'data', options: {} } } });

const resultado = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Resultado', parameters: { jsCode: `const v = $('Enviar vídeo').first().json || {};
const pr = $('Preparar').first().json;
let thumb = 'sem thumb';
try { const t = $('Subir thumb').first().json; thumb = t && t.error ? 'thumb falhou: ' + String(t.error.message || t.error).slice(0, 120) : 'thumb aplicada'; } catch (e) {}
const final = (v.status || {}).privacyStatus || '';
return [{ json: { ok: !!v.id, video_id: v.id || '', link: v.id ? 'https://youtu.be/' + v.id : '', studio: v.id ? 'https://studio.youtube.com/video/' + v.id + '/edit' : '',
  pedido: pr.privacidade, ficou: final, publicar_em: pr.publicarEm || '', thumb,
  aviso: final === 'private' && pr.privacidade !== 'private' && !pr.publicarEm ? 'O YouTube travou como privado porque a auditoria ainda não saiu. Mude para público ou não listado no YouTube Studio.' : '' } }];
` } } });

const registrar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Registrar postagem', credentials: PG, executeOnce: true, alwaysOutputData: true, onError: 'continueRegularOutput', parameters: {
  operation: 'executeQuery',
  query: `CREATE TABLE IF NOT EXISTS youtube_postagens (id bigserial PRIMARY KEY, quando timestamptz NOT NULL DEFAULT now(), video_id text, titulo text, pedido text, ficou text, publicar_em text, thumb text, origem text);
INSERT INTO youtube_postagens (video_id, titulo, pedido, ficou, publicar_em, thumb, origem) VALUES ($1, $2, $3, $4, $5, $6, $7);`,
  options: { queryReplacement: "={{ [ $('Resultado').first().json.video_id, $('Preparar').first().json.titulo, $('Resultado').first().json.pedido, $('Resultado').first().json.ficou, $('Resultado').first().json.publicar_em, $('Resultado').first().json.thumb, $('Preparar').first().json.origem ] }}" } } } });

const devolver = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Devolver resultado', parameters: { jsCode: `return [{ json: $('Resultado').first().json }];` } } });

const nota = sticky('## YouTube | Postar vídeo\nChame com o nó "Execute Workflow" passando: video (link do Drive), titulo, descricao, tags, privacidade (public / unlisted / private), publicar_em (opcional, agenda), thumb (link do Drive, opcional), origem.\nDevolve video_id, link, studio, ficou (status real) e aviso.\nATÉ A AUDITORIA DO GOOGLE SAIR, TODO VÍDEO FICA PRIVADO. Cota: cada envio gasta 1.600 de 10.000 unidades/dia (uns 6 vídeos por dia).\nRegistro em youtube_postagens (Postgres).', [], { color: 4 });

export default workflow('youtube-postar-video', 'YouTube | Postar vídeo')
  .add(chamado).to(preparar).to(valido
    .onTrue(iniciar.to(baixarVideo).to(enviar).to(temThumb
      .onTrue(baixarThumb.to(subirThumb).to(resultado.to(registrar).to(devolver)))
      .onFalse(resultado)))
    .onFalse(recusar))
  .add(nota);
