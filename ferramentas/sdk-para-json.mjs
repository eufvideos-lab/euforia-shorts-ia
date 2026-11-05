// Converte um fluxo escrito com o SDK do n8n (arquivo .js deste repo) em JSON do n8n,
// para o fluxo "Utilitário | Aplicar fluxo do GitHub (manual)" gravar no n8n.
// Uso: node ferramentas/sdk-para-json.mjs portal/fluxos/dados.js > portal/fluxos/dados.json
import fs from 'fs';
import crypto from 'crypto';
const src = fs.readFileSync(process.argv[2], 'utf8');
const nos = []; const notas = []; let meta = null; const ligacoes = [];
const novo = (d) => {
  const n = { d, saidas: {} };
  n.to = (x) => { ligar(n, 0, x); return x; };
  n.onTrue = (x) => { ligar(n, 0, x); return n; };
  n.onFalse = (x) => { ligar(n, 1, x); return n; };
  nos.push(n); return n;
};
const ligar = (de, saida, para) => { ligacoes.push([de, saida, para]); };
const sdk = {
  node: novo, trigger: novo,
  ifElse: (d) => novo({ type: 'n8n-nodes-base.if', ...d }),
  sticky: (c, ns, o) => { notas.push({ c, o: o || {} }); return {}; },
  workflow: (id, name) => { meta = { id, name }; let atual = null; const w = { add: (x) => { atual = x; return w; }, to: (x) => { if (atual) ligar(atual, 0, x); atual = x; return w; } }; return w; },
};
const corpo = src.replace(/^import .*$/m, '').replace(/export default/, 'const __w =');
new Function('workflow', 'node', 'trigger', 'ifElse', 'sticky', corpo)(sdk.workflow, sdk.node, sdk.trigger, sdk.ifElse, sdk.sticky);
const uuid = (s) => { const h = crypto.createHash('sha1').update(meta.id + '|' + s).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
const nodes = nos.map((n, i) => {
  const c = n.d.config || {};
  const o = { id: uuid(c.name), name: c.name, type: n.d.type, typeVersion: n.d.version, position: [i * 224, 0], parameters: c.parameters || {} };
  if (c.credentials) o.credentials = c.credentials;
  for (const k of ['alwaysOutputData', 'onError', 'executeOnce', 'webhookId']) if (c[k] !== undefined) o[k] = c[k];
  if (n.d.type === 'n8n-nodes-base.webhook' && !o.webhookId) o.webhookId = uuid('webhook');
  return o;
});
notas.forEach((s, i) => nodes.push({ id: uuid('nota' + i), name: 'Nota ' + (i + 1), type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [0, 260 + i * 200], parameters: { content: s.c, width: 640, height: 220, color: s.o.color || 4 } }));
const connections = {};
for (const [de, saida, para] of ligacoes) {
  const nome = de.d.config.name; connections[nome] = connections[nome] || { main: [] };
  while (connections[nome].main.length <= saida) connections[nome].main.push([]);
  const alvo = para.d.config.name;
  if (!connections[nome].main[saida].some(x => x.node === alvo)) connections[nome].main[saida].push({ node: alvo, type: 'main', index: 0 });
}
process.stdout.write(JSON.stringify({ name: meta.name, nodes, connections, settings: { executionOrder: 'v1', availableInMCP: true } }, null, 1) + '\n');
