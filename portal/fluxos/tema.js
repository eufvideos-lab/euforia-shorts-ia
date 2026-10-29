import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const DISCORD = { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } };
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };
// 🔥 Temas quentes (Esteira de Entregas). Criado em 29/10/2026.
const TEMAS_DB = 'c963e3f9e0064f1ca7be64cdc55e868d';

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Cliente pede roteiro do tema', parameters: {
  httpMethod: 'POST', path: 'euforia-portal-tema', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

const lerPedido = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler pedido', parameters: { jsCode: `const b = ($input.first().json.body) || {};
const limpa = v => String(v || '').replace(/-/g, '').toLowerCase();
const id = limpa(b.a), tema = limpa(b.tema);
const ok32 = v => /^[0-9a-f]{32}$/.test(v);
const obs = String(b.obs || '').trim().slice(0, 1500);
return [{ json: { id: ok32(id) ? id : '00000000000000000000000000000000', tema: ok32(tema) ? tema : '00000000000000000000000000000000', obs } }];
` } } });

// Cada pessoa do cliente tem o seu link (?a=<id da linha no 🔑 Acessos do portal>). Desmarcar "Ativo" corta o acesso.
const acessoNode = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Acesso da pessoa', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://api.notion.com/v1/pages/{{ $("Ler pedido").first().json.id }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, options: {} } } });

const conferir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Conferir acesso', parameters: { jsCode: `const a = $input.first().json || {};
const pr = a.properties || {};
const txt = v => { if (!v) return ''; const t = v.title || v.rich_text; if (t) return t.map(x => x.plain_text).join('').trim(); if (v.select) return v.select.name; return ''; };
const valido = a.object === 'page' && !a.archived && !a.in_trash && ((a.parent || {}).database_id || '') === 'a95cdc41-6645-47f5-8c0f-99a85e31fb4e' && (pr['Ativo'] || {}).checkbox === true;
const cliente = valido ? ((((pr['Cliente'] || {}).relation || [])[0] || {}).id || '').replace(/-/g, '') : '';
const papel = txt(pr['Papel']) || 'Equipe';
return [{ json: { id: /^[0-9a-f]{32}$/.test(cliente) ? cliente : '00000000000000000000000000000000', pessoa: valido ? txt(pr['Pessoa']).replace(/\\s*\\(.*?\\)\\s*$/, '') : '', papel, podeAprovar: ['Dono', 'Sócio'].includes(papel) } }];
` } } });

const fichaNode = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Ficha do cliente', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://api.notion.com/v1/pages/{{ $("Conferir acesso").first().json.id }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, options: {} } } });

const temaNode = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Tema escolhido', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://api.notion.com/v1/pages/{{ $("Ler pedido").first().json.tema }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, options: {} } } });

// Limite: 1 pedido por mês por cliente (decisão do Henrique, 29/10/2026).
const doMes = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Pedidos do mês', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/' + TEMAS_DB + '/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { and: [ { property: "Cliente", relation: { contains: $("Conferir acesso").first().json.id } }, { property: "Pedido em", date: { on_or_after: $now.setZone("America/Recife").startOf("month").toISODate() } } ] }, page_size: 10 }) }}',
  options: {} } } });

const validar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validar pedido', parameters: { jsCode: `const Z = 'America/Recife';
const p = $('Ler pedido').first().json;
const acc = $('Conferir acesso').first().json;
const ficha = $('Ficha do cliente').first().json;
const tema = $('Tema escolhido').first().json;
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; return ''; };
const fp = ficha.properties || {}, tp = tema.properties || {};
const nome = txt(fp['Cliente']);
const doCliente = ((tp['Cliente'] || {}).relation || []).some(r => r.id.replace(/-/g, '') === acc.id);
const daBase = ((tema.parent || {}).database_id || '').replace(/-/g, '') === 'c963e3f9e0064f1ca7be64cdc55e868d';
const jaPediu = ($('Pedidos do mês').first().json.results || []).length > 0;
let erro = '';
if (!nome || !tema.id || !daBase || !doCliente || tema.archived || tema.in_trash) erro = 'link';
else if (!acc.podeAprovar) erro = 'papel';
else if (txt(tp['Status']) !== 'Sugerido') erro = 'status';
else if (jaPediu) erro = 'limite';

const agora = DateTime.now().setZone(Z);
// Prazo interno do Escritório: 2 dias úteis.
let prazo = agora.startOf('day'); let uteis = 0;
while (uteis < 2) { prazo = prazo.plus({ days: 1 }); if (prazo.weekday <= 5) uteis++; }
const t = { tema: txt(tp['Tema']), porque: txt(tp['Por que está quente']), gancho: txt(tp['Como entra no conteúdo']), titulo: txt(tp['Título sugerido']), origem: txt(tp['Origem']) };
const carimbo = '[Portal ' + agora.toFormat('dd/MM HH:mm') + '] ';
const temaUrl = 'https://app.notion.com/p/' + String(tema.id || '').replace(/-/g, '');
const obs = carimbo + acc.pessoa + ' pediu pelo portal um roteiro do tema quente "' + t.titulo + '". Conta como 1 dos roteiros do pacote do mês. Tema: ' + temaUrl;
const rt = s => [{ type: 'text', text: { content: String(s || '').slice(0, 1990) } }];
const par = s => ({ object: 'block', type: 'paragraph', paragraph: { rich_text: rt(s) } });
const h3 = s => ({ object: 'block', type: 'heading_3', heading_3: { rich_text: rt(s) } });
const filhos = [
  h3('🔥 Roteiro de tema quente (pedido do cliente pelo portal)'),
  par('Tema: ' + t.tema + (t.origem ? ' (' + t.origem + ')' : '')),
  par('Por que está quente: ' + t.porque),
  par('Como entra no conteúdo: ' + t.gancho),
  par('Título sugerido: ' + t.titulo),
  par('História que o cliente contou: ' + (p.obs || '(nenhuma)')),
  par('Conta como 1 dos roteiros do pacote do mês. Escrever com dossiê, histórias e negócio do cliente, no padrão da skill de pautas e roteiros. Salvar no 🎬 Pautas e Roteiros (Em revisão) e ligar o roteiro no tema: ' + temaUrl)
];
const card = { parent: { database_id: '74b3076a325749e3bac4ba6659215e48' }, properties: {
  'Entrega': { title: rt(nome.toUpperCase() + ' | ROTEIRO TEMA QUENTE | ' + t.titulo) },
  'Cliente': { relation: [{ id: acc.id }] },
  'Tipo': { select: { name: 'Roteiro' } },
  'Status': { select: { name: 'A fazer' } },
  'Origem': { select: { name: 'Pacote semanal' } },
  'Responsável': { relation: [{ id: '3ea98c0c-dde0-812b-ba06-cba7e4261426' }] },
  '🏢 Escritório IA': { select: { name: 'Na fila' } },
  'Prazo': { date: { start: prazo.toISODate() } },
  'Obs': { rich_text: rt(obs) } }, children: filhos };
return [{ json: { ok: !erro, erro, temaId: tema.id, nome, pessoa: acc.pessoa, titulo: t.titulo, obs: p.obs, hoje: agora.toISODate(),
  card: JSON.stringify(card), resposta: erro ? { ok: false, motivo: erro } : { ok: true } } }];
` } } });

const podeSeguir = ifElse({ version: 2.2, config: { name: 'Pedido válido?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const criarCard = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Criar card do Escritório', credentials: NOTION, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/pages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $("Validar pedido").first().json.card }}', options: {} } } });

const marcarTema = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Marcar tema como pedido', credentials: NOTION, parameters: {
  method: 'PATCH', url: '=https://api.notion.com/v1/pages/{{ $("Validar pedido").first().json.temaId }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ properties: { "Status": { select: { name: "Pedido pelo cliente" } }, "Pedido por": { rich_text: [{ type: "text", text: { content: $("Validar pedido").first().json.pessoa } }] }, "Pedido em": { date: { start: $("Validar pedido").first().json.hoje } }, "História do cliente": { rich_text: [{ type: "text", text: { content: $("Validar pedido").first().json.obs } }] }, "Card no Entregas": { url: $json.url || null } } }) }}',
  options: {} } } });

const avisar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Avisar no #dia-a-dia', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://discord.com/api/v10/channels/1556642691410956339/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ content: ("🔥 **" + $("Validar pedido").first().json.pessoa + "** (" + $("Validar pedido").first().json.nome + ") pediu pelo portal um roteiro de tema quente: **" + $("Validar pedido").first().json.titulo + "**. Já está na fila do Escritório e conta como 1 dos roteiros do mês. Card: " + ($("Criar card do Escritório").first().json.url || "") + "\\n— Érica, time de suporte, Grupo Euforia").slice(0, 1990) }) }}',
  options: {} } } });

const confirmar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar ao cliente', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($("Validar pedido").first().json.resposta) }}', options: {} } } });

const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar pedido', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Portal do cliente · pedir roteiro de tema quente (V1)\nSó Dono/Sócio, só tema do próprio cliente em "Sugerido", 1 pedido por mês (conta como roteiro do pacote).\nCria card no Entregas para o Escritório (Na fila, prazo 2 dias úteis), marca o tema como "Pedido pelo cliente" e avisa no #dia-a-dia.', [], { color: 4 });

export default workflow('portal-tema', 'Portal | Pedir roteiro de tema quente (V1)')
  .add(pedir).to(lerPedido).to(acessoNode).to(conferir).to(fichaNode).to(temaNode).to(doMes).to(validar)
  .to(podeSeguir.onTrue(criarCard.to(marcarTema).to(avisar).to(confirmar)).onFalse(recusar))
  .add(nota);
