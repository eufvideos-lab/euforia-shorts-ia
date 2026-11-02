import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

// Blog | Contador de visitas: cada página do blog chama este endereço (imagem invisível) ao abrir.
// Guarda caminho, de onde veio (Google, Instagram, direto...) e um código anônimo do navegador. Robôs são ignorados.
const PG = { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } };

const visita = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Visita no blog', parameters: {
  httpMethod: 'GET', path: 'blog-visita', responseMode: 'responseNode', options: {} } } });

const limpar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Conferir visita', parameters: { jsCode: `const x = $input.first().json || {};
const q = x.query || {}, h = x.headers || {};
const ua = String(h['user-agent'] || '');
const robo = !ua || /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|python|curl|wget/i.test(ua);
let p = String(q.p || '').slice(0, 160).toLowerCase().split('?')[0].split('#')[0];
if (!p.startsWith('/')) p = '/' + p;
const valido = /^\\/blog[a-z0-9-]*(\\.html)?$/.test(p) || p === '/blog/';
let host = '';
const mh = String(q.r || '').match(/^https?:\\/\\/([^\\/?#:]+)/i);
host = mh ? mh[1].toLowerCase().replace(/^www\\./, '').slice(0, 80) : '';
const f = host;
let fonte = 'Direto';
if (/google\\./.test(f)) fonte = 'Google';
else if (/bing\\.|duckduckgo|yahoo|ecosia/.test(f)) fonte = 'Outras buscas';
else if (/instagram/.test(f)) fonte = 'Instagram';
else if (/facebook|fb\\.com/.test(f)) fonte = 'Facebook';
else if (/youtube|youtu\\.be/.test(f)) fonte = 'YouTube';
else if (/linkedin|lnkd/.test(f)) fonte = 'LinkedIn';
else if (/whatsapp|wa\\.me/.test(f)) fonte = 'WhatsApp';
else if (/chatgpt|openai|perplexity|claude|gemini|copilot/.test(f)) fonte = 'IA (ChatGPT etc.)';
else if (/grupoeuforia/.test(f)) fonte = 'Site Euforia';
else if (f) fonte = 'Outros sites';
const v = String(q.v || '').replace(/[^a-z0-9]/gi, '').slice(0, 16);
return [{ json: { gravar: valido && !robo, caminho: p, fonte, ref: host, visitante: v } }];
` } } });

const tabela = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Garantir tabela', credentials: PG, executeOnce: true, alwaysOutputData: true, parameters: {
  operation: 'executeQuery',
  query: `CREATE TABLE IF NOT EXISTS blog_visitas (id bigserial PRIMARY KEY, quando timestamptz NOT NULL DEFAULT now(), caminho text NOT NULL, fonte text, ref text, visitante text);
CREATE INDEX IF NOT EXISTS blog_visitas_quando ON blog_visitas (quando);` } } });

const gravar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Gravar visita', credentials: PG, executeOnce: true, alwaysOutputData: true, parameters: {
  operation: 'executeQuery',
  query: `INSERT INTO blog_visitas (caminho, fonte, ref, visitante) SELECT $1, $2, $3, $4 WHERE $5::boolean;`,
  options: { queryReplacement: "={{ [ $('Conferir visita').first().json.caminho, $('Conferir visita').first().json.fonte, $('Conferir visita').first().json.ref, $('Conferir visita').first().json.visitante, $('Conferir visita').first().json.gravar ] }}" } } } });

const responder = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Responder', parameters: {
  respondWith: 'text', responseBody: 'ok', options: { responseHeaders: { entries: [{ name: 'Cache-Control', value: 'no-store' }] } } } } });

const nota = sticky('## Blog | Contador de visitas\nChamado pelas páginas do blog (lp.grupoeuforia.tech/blog*) ao abrir. Grava em blog_visitas (Postgres): caminho, fonte (Google, Instagram, direto...), site de origem e código anônimo do navegador. Robôs ignorados. Lido pela aba Marketing do Painel Central.', [], { color: 4 });

export default workflow('blog-contador-visitas', 'Blog | Contador de visitas')
  .add(visita).to(limpar).to(tabela).to(gravar).to(responder)
  .add(nota);
