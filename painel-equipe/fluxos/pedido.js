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
  prazo: /^\\d{4}-\\d{2}-\\d{2}$/.test(String(b.prazo || '')) ? b.prazo : '', link, texto: String(b.texto || '').trim().slice(0, 1500),
  anexos: (Array.isArray(b.anexos) ? b.anexos : []).slice(0, 20).map(a => ({ nome: String((a || {}).nome || 'Anexo').replace(/[\\r\\n]+/g, ' ').slice(0, 120), link: String((a || {}).link || '').trim().slice(0, 500) })).filter(a => /^https:\\/\\/[^\\s]+$/.test(a.link)) } }];
` } } });

const acesso = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Achar pessoa', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: ACESSO, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'token', condition: 'eq', keyValue: '={{ $json.u }}' }] }, limit: 1 } } });

const fichaNode = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Ficha do cliente', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://api.notion.com/v1/pages/{{ $("Ler pedido").first().json.cliente }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, options: {} } } });

// Catálogo igual ao da página: [Tipo no Entregas, nome no título, máquina que faz].
const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar card', parameters: { jsCode: `const Z = 'America/Recife';
const p = $('Ler pedido').first().json;
const r = $('Achar pessoa').first().json || {};
const ficha = $('Ficha do cliente').first().json || {};
const fp = ficha.properties || {};
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; return ''; };
const CAT = {
  longo: ['Vídeo longo', 'VÍDEO LONGO', 'Máquina de Longos'], shorts: ['Shorts', 'SHORTS', 'Máquina de Shorts'], ajvid: ['Vídeo longo', 'AJUSTE EM VÍDEO', ''],
  carrossel: ['Carrossel', 'CARROSSEL', 'Máquina de Carrosséis'], thumb: ['Thumbnail', 'THUMB', 'Máquina do Escritório'], arte: ['Arte', 'ARTE', 'Máquina do Escritório'],
  idv: ['ID visual', 'ID VISUAL', 'Máquina do Escritório'], alinhamento: ['Apresentação', 'APRESENTAÇÃO DE ALINHAMENTO', 'Máquina do Escritório'],
  call: ['Apresentação', 'APRESENTAÇÃO DE CALL', 'Máquina do Escritório'], relatorio: ['Relatório', 'RELATÓRIO', 'Máquina do Escritório'],
  recuperacao: ['Estratégia', 'ESTRATÉGIA DE RECUPERAÇÃO', 'Máquina do Escritório'], pautas: ['Roteiro', 'PAUTAS E ROTEIROS', 'Máquina do Escritório'],
  pagina: ['Página', 'PÁGINA', 'Máquina do Escritório'], funil: ['Funil', 'FUNIL', 'Máquina do Escritório'], insta: ['Insta-Blindado', 'INSTA-BLINDADO', 'Máquina do Escritório'],
  copy: ['Copy', 'COPY', 'Máquina do Escritório'], outro: ['Outro', 'PEDIDO', 'Máquina do Escritório'] };
const c = CAT[p.tipo];
const acessoOk = !!r.token && r.token === p.u && r.ativo === true && String(r.pin) === p.pin;
const nome = txt(fp['Cliente']);
const hoje = DateTime.now().setZone(Z);
const teste = r.papel === 'teste';
const manual = p.modo === 'mao' || !(c && c[2]);
let erro = '';
if (!acessoOk || r.papel === 'editor') erro = 'acesso';
else if (!c) erro = 'tipo';
else if (!nome || String((ficha.parent || {}).database_id || '').replace(/-/g, '') !== '3ddc91b406be49e98e630c298d9162d8' || txt(fp['Situação']) === 'Encerrado') erro = 'cliente';
else if (!p.prazo || p.prazo < hoje.toISODate()) erro = 'prazo';
else if (p.texto.length < 5 || (p.tipo === 'outro' && p.texto.length < 40)) erro = 'texto';
else if (p.tipo === 'thumb' && !/Tema da thumb: *\\S{2,}/.test(p.texto)) erro = 'tema';
// Notion aceita até 2000 caracteres por pedaço de texto: a Obs vai em pedaços para caber os anexos.
const t = s => (String(s).match(/[\\s\\S]{1,1990}/g) || ['']).slice(0, 8).map(c => ({ type: 'text', text: { content: c } }));
const titulo = (teste ? 'TESTE PAINEL | ' : '') + nome.toUpperCase() + ' | ' + (c ? c[1] : '') + ' (painel)';
const obs = '[Painel ' + hoje.toFormat('dd/MM HH:mm') + '] Pedido de ' + r.nome + ' · ' + (manual ? 'À MÃO' + (p.ferramenta ? ' em ' + p.ferramenta : '') : 'Automático (' + (c ? c[2] : '') + ')') + '\\n' + p.texto + (p.link ? '\\nLink: ' + p.link : '') + (p.anexos.length ? '\\nAnexos:\\n' + p.anexos.map(a => '- ' + a.nome + ': ' + a.link).join('\\n') : '');
const props = {
  'Entrega': { title: t(titulo) }, 'Cliente': { relation: [{ id: p.cliente }] }, 'Tipo': { select: { name: c ? c[0] : 'Outro' } },
  'Status': { select: { name: 'A fazer' } }, 'Origem': { select: { name: 'Extra' } }, 'Prazo': { date: { start: p.prazo } }, 'Obs': { rich_text: t(obs) } };
if (!teste) {
  props['Responsável'] = { relation: [{ id: '3ea98c0cdde0812bba06cba7e4261426' }] };
  props['🏢 Escritório IA'] = { select: { name: manual ? 'À mão (Flau)' : 'Na fila' } };
}
if (/^https:\\/\\//.test(p.link)) props['Link do arquivo'] = { url: p.link };
else if (p.anexos.length) props['Link do arquivo'] = { url: p.anexos[0].link };
// Longo, shorts e carrossel no automático também viram pedido no quadro da máquina, que é o que cada máquina lê.
const NA = /ACR[ÓO]POLE/i.test(nome);
const resumo = p.texto + (p.link ? '\\nLink: ' + p.link : '') + (p.anexos.length ? '\\nAnexos:\\n' + p.anexos.map(a => '- ' + a.nome + ': ' + a.link).join('\\n') : '') + '\\nPedido de ' + r.nome + ' pelo painel. Card no Entregas: ';
let quadro = null;
if (!teste && !manual && p.tipo === 'longo') quadro = { db: '3fea57fbb3ca4a7d9d16921d2f0b00cf', nome: 'quadro de Vídeos Longos IA', props: {
  'Pedido': { title: t(nome.toUpperCase() + ' | VÍDEO LONGO (painel)') }, 'Cliente': { relation: [{ id: p.cliente }] }, 'Status': { select: { name: 'Editar' } },
  'Modelo': { select: { name: NA ? 'Nova Acrópole' : 'Padrão' } }, ...(/^https:\\/\\//.test(p.link) ? { 'Vídeo bruto (link do Drive)': { url: p.link } } : {}) } };
if (!teste && !manual && p.tipo === 'shorts') { const est = NA ? 'Nova Acrópole' : /viral/i.test(p.texto) ? 'Viral' : /institucional/i.test(p.texto) ? 'Institucional' : '';
  quadro = { db: '8205f7673c224763b28891e768cb3916', nome: 'quadro de Shorts IA', props: {
  'Pedido': { title: t(nome.toUpperCase() + ' | SHORTS (painel)') }, 'Cliente': { relation: [{ id: p.cliente }] }, 'Status': { select: { name: 'Editar' } },
  'Quantidade': { select: { name: /\\b(1|um) short\\b/i.test(p.texto) ? '1 short' : '3 shorts' } }, ...(est ? { 'Estilo': { select: { name: est } } } : {}),
  ...(/^https:\\/\\//.test(p.link) ? { 'Vídeo editado (link do Drive)': { url: p.link } } : {}) } }; }
if (!teste && !manual && p.tipo === 'carrossel') quadro = { db: '4cc9fd21563940afb1512e1d4f9a2bfb', nome: 'quadro de Carrosséis IA', props: {
  'Pedido': { title: t(nome.toUpperCase() + ' | CARROSSEL (painel)') }, 'Cliente': { relation: [{ id: p.cliente }] }, 'Status': { select: { name: 'Criar' } },
  'Pacote': { select: { name: '1 carrossel' } } } };
return [{ json: { ok: !erro, body: JSON.stringify({ parent: { database_id: '74b3076a325749e3bac4ba6659215e48' }, properties: props }),
  temQuadro: !erro && !!quadro, quadroNome: quadro ? quadro.nome : '', quadroDb: quadro ? quadro.db : '', quadroProps: quadro ? JSON.stringify(quadro.props) : '', resumo, obs,
  resposta: erro ? { ok: false, motivo: erro } : { ok: true, quem: manual ? 'Escritório, à mão' : c[2], titulo } } }];
` } } });

const podeSeguir = ifElse({ version: 2.2, config: { name: 'Pedido válido?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const criar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Criar card no Entregas', credentials: NOTION, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/pages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $("Montar card").first().json.body }}', options: {} } } });

const vaiQuadro = ifElse({ version: 2.2, config: { name: 'Vai para o quadro da máquina?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $("Montar card").first().json.temQuadro }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

// O link do card do Entregas vai nas Observações, para a máquina devolver o resultado no card certo.
const criarQuadro = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Criar pedido no quadro da máquina', credentials: NOTION, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/pages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ parent: { database_id: $("Montar card").first().json.quadroDb }, properties: Object.assign(JSON.parse($("Montar card").first().json.quadroProps), { "Observações para a máquina": { rich_text: (($("Montar card").first().json.resumo + $("Criar card no Entregas").first().json.url).match(/[\\s\\S]{1,1990}/g) || [""]).slice(0, 8).map(x => ({ type: "text", text: { content: x } })) } }) }) }}',
  options: {} } } });

const ligar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ligar card ao quadro', parameters: { jsCode: `const m = $('Montar card').first().json;
const q = $input.first().json || {};
const card = $('Criar card no Entregas').first().json || {};
const hora = DateTime.now().setZone('America/Recife').toFormat('dd/MM HH:mm');
const linha = q.id ? '[Painel ' + hora + '] Pedido criado no ' + m.quadroNome + ': ' + q.url : '[Painel ' + hora + '] Não consegui criar o pedido no ' + m.quadroNome + '. A Máquina do Escritório precisa repassar.';
const obs = (linha + '\\n' + m.obs).match(/[\\s\\S]{1,1990}/g).slice(0, 8).map(x => ({ type: 'text', text: { content: x } }));
const props = { 'Obs': { rich_text: obs } };
if (q.id) props['🏢 Escritório IA'] = { select: { name: 'Foi para outra máquina' } };
return [{ json: { cardId: card.id, body: JSON.stringify({ properties: props }) } }];
` } } });

const atualizarCard = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Atualizar card do Entregas', credentials: NOTION, onError: 'continueRegularOutput', parameters: {
  method: 'PATCH', url: '=https://api.notion.com/v1/pages/{{ $json.cardId }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.body }}', options: {} } } });

const confirmarQuadro = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar com quadro', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($("Montar card").first().json.resposta) }}', options: {} } } });

const confirmar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($("Montar card").first().json.resposta) }}', options: {} } } });

const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Painel da equipe · pedir ao escritório (V1)\nCria card no Entregas: Responsável = Escritório (Flau + IA), Origem Extra, Status A fazer, Prazo e o texto na Obs.\nAutomático: 🏢 Escritório IA = Na fila (a Máquina do Escritório pega ou manda para a máquina certa). À mão: = À mão (Flau).\nTeste: título "TESTE PAINEL", sem Responsável, para nenhuma máquina pegar.\nAnexos: arquivos sobem antes pelo fluxo de envio (PEDIDOS DO PAINEL na pasta do cliente) e entram como links na Obs; o 1º vira Link do arquivo se não houver link.\nLongo, shorts e carrossel no automático: cria também o pedido no quadro da máquina (Longos: Editar + Modelo; Shorts: Editar + Quantidade/Estilo; Carrosséis: Criar + 1 carrossel), com o texto e o link do card nas Observações, e marca o card como "Foi para outra máquina".', [], { color: 4 });

export default workflow('painel-pedido', 'Painel | Pedido ao escritório (V1)')
  .add(pedir).to(ler).to(acesso).to(fichaNode).to(montar)
  .to(podeSeguir.onTrue(criar.to(vaiQuadro.onTrue(criarQuadro.to(ligar).to(atualizarCard).to(confirmarQuadro)).onFalse(confirmar))).onFalse(recusar))
  .add(nota);
