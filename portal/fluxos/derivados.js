import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const DISCORD = { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } };
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };

// Minutos 5, 15, 25...: fora do horário do fluxo "Vídeo longo aprovado vai para o cliente", que também escreve no log do pedido.
const relogio = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'A cada 10 minutos (min 5)', parameters: {
  rule: { interval: [{ field: 'cronExpression', expression: '5,15,25,35,45,55 * * * *' }] } } } });

// Trava: só pedidos de longos que nasceram do portal (gravação enviada pelo cliente).
const aprovados = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Longos do portal aprovados', credentials: NOTION, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/3fea57fbb3ca4a7d9d16921d2f0b00cf/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '{"filter":{"and":[{"property":"Status","select":{"equals":"Aprovado"}},{"property":"Observações para a máquina","rich_text":{"contains":"pelo portal"}},{"property":"Log da máquina","rich_text":{"does_not_contain":"[derivados]"}},{"timestamp":"created_time","created_time":{"on_or_after":"2026-10-26T00:00:00Z"}}]},"page_size":20}',
  options: {} } } });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar pedidos', parameters: { jsCode: `const Z = 'America/Recife';
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; return a ? a.map(t => t.plain_text).join('').trim() : ''; };
const t = s => [{ type: 'text', text: { content: s.slice(0, 1900) } }];
const agora = DateTime.now().setZone(Z).toFormat('dd/MM HH:mm');
const out = [];
for (const pg of ($input.first().json.results || [])) {
  const pr = pg.properties || {};
  const cliente = (((pr['Cliente'] || {}).relation || [])[0] || {}).id || '';
  const video = (pr['Vídeo pronto'] || {}).url || '';
  if (!cliente || !video) continue;
  const titulo = txt(pr['Pedido']);
  const base = titulo.replace(/\\s*\\(portal\\)\\s*$/i, '').trim();
  const obsLongo = txt(pr['Observações para a máquina']);
  const roteiro = ((obsLongo.match(/Roteiro:\\s*(.+?)\\.?\\s*$/m) || [])[1] || '').trim();
  const acropole = ((pr['Modelo'] || {}).select || {}).name === 'Nova Acrópole';
  const origem = '[auto-portal] Aberto sozinho em ' + agora + ': o vídeo longo "' + titulo + '" foi aprovado pela equipe.';
  const shorts = { parent: { database_id: '8205f7673c224763b28891e768cb3916' }, properties: {
    'Pedido': { title: t(base + ' · shorts (portal)') },
    'Cliente': { relation: [{ id: cliente }] },
    'Vídeo editado (link do Drive)': { url: video },
    'Status': { select: { name: 'Editar' } },
    'Quantidade': { select: { name: '3 shorts' } },
    'Estilo': { select: { name: acropole ? 'Nova Acrópole' : 'Institucional' } },
    'Observações para a máquina': { rich_text: t(origem + (acropole ? ' O vídeo já tem legenda amarela gravada embaixo: cortar a parte de baixo (--cortar-baixo 0.22).' : ' O vídeo já está editado e sem legenda gravada.')) } } };
  const carrossel = { parent: { database_id: '4cc9fd21563940afb1512e1d4f9a2bfb' }, properties: {
    'Pedido': { title: t(base + ' · carrossel (portal)') },
    'Cliente': { relation: [{ id: cliente }] },
    'Pacote': { select: { name: '1 carrossel' } },
    'Status': { select: { name: 'Criar' } },
    'Observações para a máquina': { rich_text: t(origem + (roteiro ? ' Usar o roteiro "' + roteiro + '" do 🎬 Pautas e Roteiros (o mesmo do vídeo).' : ' Usar o roteiro do mesmo vídeo; sem como saber, o mais recente do cliente.')) } } };
  out.push({ json: { pedido: pg.id, titulo, log: txt(pr['Log da máquina']), shorts: JSON.stringify(shorts), carrossel: JSON.stringify(carrossel) } });
}
return out;
` } } });

const criarShorts = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Abrir pedido de shorts', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/pages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $("Montar pedidos").item.json.shorts }}', options: {} } } });

const criarCarrossel = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Abrir pedido de carrossel', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/pages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $("Montar pedidos").item.json.carrossel }}', options: {} } } });

const resultado = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Resultado', parameters: { mode: 'runOnceForEachItem', jsCode: `const Z = 'America/Recife';
const p = $('Montar pedidos').item.json;
const s = $('Abrir pedido de shorts').item.json || {};
const c = $json || {};
const agora = DateTime.now().setZone(Z).toFormat('dd/MM HH:mm');
const ok = r => r && r.object === 'page' && r.id;
const linha = '[derivados] ' + agora + ': shorts ' + (ok(s) ? 'aberto' : 'NÃO abriu') + ', carrossel ' + (ok(c) ? 'aberto' : 'NÃO abriu') + '.';
const t = x => [{ type: 'text', text: { content: x.slice(0, 1900) } }];
const patchLog = JSON.stringify({ properties: { 'Log da máquina': { rich_text: t(linha + (p.log ? '\\n' + p.log : '')) } } });
const partes = [];
partes.push(ok(s) ? '3 shorts (' + s.url + ')' : '⚠️ o pedido de shorts não abriu');
partes.push(ok(c) ? '1 carrossel (' + c.url + ')' : '⚠️ o pedido de carrossel não abriu');
const msg = '🎬 Vídeo longo aprovado: **' + p.titulo + '**. Já abri nas máquinas: ' + partes.join(' e ') + '.' + (ok(s) && ok(c) ? '' : ' A diretoria vai olhar o que falhou.') + '\\n— Érica, time de suporte, Grupo Euforia';
return { json: { pedido: p.pedido, patchLog, discord: JSON.stringify({ content: msg.slice(0, 1990) }) } };
` } } });

const anotar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Anotar no pedido de longo', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'PATCH', url: '={{ "https://api.notion.com/v1/pages/" + $("Resultado").item.json.pedido }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $("Resultado").item.json.patchLog }}', options: {} } } });

const avisar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Avisar no #dia-a-dia', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://discord.com/api/v10/channels/1556642691410956339/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $("Resultado").item.json.discord }}', options: {} } } });

const nota = sticky('## Portal · longo aprovado abre shorts e carrossel (V1)\nA cada 10 min (minutos 5, 15, 25...): pedidos do 🎞️ Pedidos de Vídeos Longos IA que nasceram do portal ("pelo portal" nas observações), com Status "Aprovado" e sem "[derivados]" no log.\nAbre 1 pedido de 3 shorts (Status Editar, com o vídeo editado) no 🎬 Pedidos de Shorts IA e 1 pedido de 1 carrossel (Status Criar, com o roteiro do vídeo) no 🖼️ Pedidos de Carrosséis IA. Marca "[auto-portal]" nas observações deles. Anota "[derivados]" no log do longo e avisa no #dia-a-dia. Nunca manda nada ao cliente.', [], { color: 4 });

export default workflow('portal-derivados', 'Portal | Longo aprovado abre shorts e carrossel (V1)')
  .add(relogio).to(aprovados).to(montar).to(criarShorts).to(criarCarrossel).to(resultado).to(anotar).to(avisar)
  .add(nota);
