import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };
const ACESSO = { __rl: true, mode: 'id', value: 'ilXDZWGAcOjoajx7', cachedResultName: 'Painel equipe · acesso' };

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Pedido ao escritório', parameters: {
  httpMethod: 'POST', path: 'euforia-painel-pedido', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

const ler = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler pedido', parameters: { jsCode: `const b = ($input.first().json.body) || {};
const u = String(b.u || '').toLowerCase();
const cli = String(b.cliente || '').replace(/-/g, '').toLowerCase();
const link = String(b.link || '').trim().slice(0, 500);
return [{ json: { u: /^[0-9a-f]{24}$/.test(u) ? u : 'x', pin: String(b.pin || '').replace(/[^0-9]/g, '').slice(0, 6),
  cliente: /^[0-9a-f]{32}$/.test(cli) ? cli : '00000000000000000000000000000000',
  tipo: String(b.tipo || '').slice(0, 20), modo: b.modo === 'mao' ? 'mao' : 'auto', ferramenta: String(b.ferramenta || '').slice(0, 60),
  prazo: /^\\d{4}-\\d{2}-\\d{2}$/.test(String(b.prazo || '')) ? b.prazo : '', link, texto: String(b.texto || '').trim().slice(0, 1500) } }];
` } } });

const acesso = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Achar pessoa', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: ACESSO, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'token', condition: 'eq', keyValue: '={{ $json.u }}' }] }, limit: 1 } } });

const fichaNode = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Ficha do cliente', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://api.notion.com/v1/pages/{{ $("Ler pedido").first().json.cliente }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, options: {} } } });

// Catálogo igual ao da página. Enquanto o Tipo do Entregas não ganha as opções novas, o nome do pedido vai no título.
const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar card', parameters: { jsCode: `const Z = 'America/Recife';
const p = $('Ler pedido').first().json;
const r = $('Achar pessoa').first().json || {};
const ficha = $('Ficha do cliente').first().json || {};
const fp = ficha.properties || {};
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; return ''; };
const CAT = {
  longo: ['Vídeo longo', 'VÍDEO LONGO', 'Máquina de Longos'], shorts: ['Shorts', 'SHORTS', 'Máquina de Shorts'], ajvid: ['Vídeo longo', 'AJUSTE EM VÍDEO', ''],
  carrossel: ['Carrossel', 'CARROSSEL', 'Máquina de Carrosséis'], thumb: ['Thumbnail', 'THUMB', 'Máquina do Escritório'], arte: ['Arte', 'ARTE', 'Máquina do Escritório'],
  idv: ['ID visual', 'ID VISUAL', 'Máquina do Escritório'], alinhamento: ['Outro', 'APRESENTAÇÃO DE ALINHAMENTO', 'Máquina do Escritório'],
  call: ['Outro', 'APRESENTAÇÃO DE CALL', 'Máquina do Escritório'], relatorio: ['Outro', 'RELATÓRIO', 'Máquina do Escritório'],
  recuperacao: ['Outro', 'ESTRATÉGIA DE RECUPERAÇÃO', 'Máquina do Escritório'], pautas: ['Roteiro', 'PAUTAS E ROTEIROS', 'Máquina do Escritório'],
  pagina: ['Página', 'PÁGINA', 'Máquina do Escritório'], funil: ['Funil', 'FUNIL', 'Máquina do Escritório'], insta: ['Copy', 'INSTA-BLINDADO', 'Máquina do Escritório'],
  copy: ['Copy', 'COPY', 'Máquina do Escritório'], outro: ['Outro', 'PEDIDO', 'Máquina do Escritório'] };
const c = CAT[p.tipo];
const acessoOk = !!r.token && r.token === p.u && r.ativo === true && String(r.pin) === p.pin;
const nome = txt(fp['Cliente']);
const hoje = DateTime.now().setZone(Z);
const teste = r.papel === 'teste';
const manual = p.modo === 'mao' || !(c && c[2]);
let erro = '';
if (!acessoOk) erro = 'acesso';
else if (!c) erro = 'tipo';
else if (!nome || String((ficha.parent || {}).database_id || '').replace(/-/g, '') !== '3ddc91b406be49e98e630c298d9162d8' || txt(fp['Situação']) === 'Encerrado') erro = 'cliente';
else if (!p.prazo || p.prazo < hoje.toISODate()) erro = 'prazo';
else if (p.texto.length < 5) erro = 'texto';
const t = s => [{ type: 'text', text: { content: String(s).slice(0, 1990) } }];
const titulo = (teste ? 'TESTE PAINEL | ' : '') + nome.toUpperCase() + ' | ' + (c ? c[1] : '') + ' (painel)';
const obs = '[Painel ' + hoje.toFormat('dd/MM HH:mm') + '] Pedido de ' + r.nome + ' · ' + (manual ? 'À MÃO' + (p.ferramenta ? ' em ' + p.ferramenta : '') : 'Automático (' + (c ? c[2] : '') + ')') + '\\n' + p.texto + (p.link ? '\\nLink: ' + p.link : '');
const props = {
  'Entrega': { title: t(titulo) }, 'Cliente': { relation: [{ id: p.cliente }] }, 'Tipo': { select: { name: c ? c[0] : 'Outro' } },
  'Status': { select: { name: 'A fazer' } }, 'Origem': { select: { name: 'Extra' } }, 'Prazo': { date: { start: p.prazo } }, 'Obs': { rich_text: t(obs) } };
if (!teste) {
  props['Responsável'] = { relation: [{ id: '3ea98c0cdde0812bba06cba7e4261426' }] };
  props['🏢 Escritório IA'] = { select: { name: manual ? 'Precisa da Direção' : 'Na fila' } };
}
if (/^https:\\/\\//.test(p.link)) props['Link do arquivo'] = { url: p.link };
return [{ json: { ok: !erro, body: JSON.stringify({ parent: { database_id: '74b3076a325749e3bac4ba6659215e48' }, properties: props }),
  resposta: erro ? { ok: false, motivo: erro } : { ok: true, quem: manual ? 'Escritório, à mão' : c[2], titulo } } }];
` } } });

const podeSeguir = ifElse({ version: 2.2, config: { name: 'Pedido válido?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const criar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Criar card no Entregas', credentials: NOTION, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/pages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $("Montar card").first().json.body }}', options: {} } } });

const confirmar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($("Montar card").first().json.resposta) }}', options: {} } } });

const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Painel da equipe · pedir ao escritório (V1)\nCria card no Entregas: Responsável = Escritório (Flau + IA), Origem Extra, Status A fazer, Prazo e o texto na Obs.\nAutomático: 🏢 Escritório IA = Na fila (a Máquina do Escritório pega ou manda para a máquina certa). À mão: = Precisa da Direção, até existir a opção "À mão (Flau)".\nTeste: título "TESTE PAINEL", sem Responsável, para nenhuma máquina pegar.', [], { color: 4 });

export default workflow('painel-pedido', 'Painel | Pedido ao escritório (V1)')
  .add(pedir).to(ler).to(acesso).to(fichaNode).to(montar)
  .to(podeSeguir.onTrue(criar.to(confirmar)).onFalse(recusar))
  .add(nota);
