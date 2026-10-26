import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const DISCORD = { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } };
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };
const ACESSO = { __rl: true, mode: 'id', value: 'ilXDZWGAcOjoajx7', cachedResultName: 'Painel equipe · acesso' };

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Botão do painel', parameters: {
  httpMethod: 'POST', path: 'euforia-painel-acao', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

const ler = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler pedido', parameters: { jsCode: `const b = ($input.first().json.body) || {};
const u = String(b.u || '').toLowerCase();
const card = String(b.card || '').replace(/-/g, '').toLowerCase();
const ACOES = ['comecar', 'revisao', 'aprovar', 'ajuste', 'agendei', 'postei', 'passar', 'naoemeu', 'jafeito', 'pegar', 'completar'];
const PARA = ['victor', 'lorena', 'daniel', 'escritorio'];
const link = String(b.link || '').trim().slice(0, 500);
return [{ json: { u: /^[0-9a-f]{24}$/.test(u) ? u : 'x', pin: String(b.pin || '').replace(/[^0-9]/g, '').slice(0, 6),
  card: /^[0-9a-f]{32}$/.test(card) ? card : '00000000000000000000000000000000',
  acao: ACOES.includes(b.acao) ? b.acao : '', para: PARA.includes(b.para) ? b.para : '', fim: ['Postado', 'Cancelado'].includes(b.fim) ? b.fim : '', texto: String(b.texto || '').trim().slice(0, 1200),
  link: /^https:\\/\\/[^\\s]+$/.test(link) ? link : '',
  anexos: (Array.isArray(b.anexos) ? b.anexos : []).slice(0, 20).map(a => ({ nome: String((a || {}).nome || 'Anexo').replace(/[\\r\\n]+/g, ' ').slice(0, 120), link: String((a || {}).link || '').trim().slice(0, 500) })).filter(a => /^https:\\/\\/[^\\s]+$/.test(a.link)) } }];
` } } });

const acesso = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Achar pessoa', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: ACESSO, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'token', condition: 'eq', keyValue: '={{ $json.u }}' }] }, limit: 1 } } });

const cardNode = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Card da entrega', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://api.notion.com/v1/pages/{{ $("Ler pedido").first().json.card }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, options: {} } } });

// Limite da Fila de demandas: conta os cards em produção (A fazer, Fazendo, Ajustes) que já estão no nome da pessoa.
const abertosNode = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Cards abertos da pessoa', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/74b3076a325749e3bac4ba6659215e48/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { and: [{ property: "Responsável", relation: { contains: $("Achar pessoa").first().json.ficha || "00000000000000000000000000000000" } }, { or: [{ property: "Status", select: { equals: "A fazer" } }, { property: "Status", select: { equals: "Fazendo" } }, { property: "Status", select: { equals: "Ajustes" } }] }] }, page_size: 100 }) }}',
  options: {} } } });

// Cada botão só vale para quem pode apertar e só na etapa certa. Fora disso, nada muda no Notion.
const validar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validar botão', parameters: { jsCode: `const Z = 'America/Recife';
const p = $('Ler pedido').first().json;
const r = $('Achar pessoa').first().json || {};
const card = $('Card da entrega').first().json || {};
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; return ''; };
const cp = card.properties || {};
const sem = id => String(id || '').replace(/-/g, '');
const acessoOk = !!r.token && r.token === p.u && r.ativo === true && String(r.pin) === p.pin;
const titulo = txt(cp['Entrega']);
const status = txt(cp['Status']);
const doEntregas = sem((card.parent || {}).database_id) === '74b3076a325749e3bac4ba6659215e48';
const teste = r.papel === 'teste';
const resp = ((cp['Responsável'] || {}).relation || []).map(x => sem(x.id));
const meu = teste ? /TESTE PAINEL/.test(titulo) : resp.includes(r.ficha);
const revisor = teste ? /TESTE PAINEL/.test(titulo) : ['revisor', 'diretor'].includes(r.papel);
const posta = revisor || (!teste && r.papel === 'calls');
// Passar para: Ismael, Rômulo e diretoria mudam o Responsável. O Escritório cai na fila da máquina.
const QUEM = { victor: ['3ea98c0cdde08182a952f3d9a5b73575', 'Victor', '1142062975071551528'], lorena: ['3ea98c0cdde08163bd16f0213b098cb5', 'Lorena', '827882215185973279'],
  daniel: ['3ea98c0cdde0817e87aee637a96d4fd1', 'Daniel', '1470387767337816128'], escritorio: ['3ea98c0cdde0812bba06cba7e4261426', 'Escritório (máquinas)', ''] };
const alvo = QUEM[p.para];
const LIMITE = 8;
const TIPOS_LIVRE = ['Vídeo longo', 'Shorts', 'Podcast', 'Carrossel', 'Thumbnail'];
const abertos = (($('Cards abertos da pessoa').first().json || {}).results || []).length;
const REGRA = {
  comecar: { pode: meu, de: ['A fazer'], para: 'Fazendo', verbo: 'começou' },
  revisao: { pode: meu, de: ['A fazer', 'Fazendo', 'Ajustes'], para: 'Em revisão', verbo: 'mandou para revisão', precisaLink: true },
  aprovar: { pode: revisor, de: ['Em revisão'], para: 'Aguardando cliente', verbo: 'aprovou na revisão' },
  ajuste: { pode: revisor, de: ['Em revisão'], para: 'Ajustes', verbo: 'pediu ajuste', precisaTexto: true },
  agendei: { pode: posta, de: ['Aprovado'], para: 'Agendado', verbo: 'agendou', precisaLink: true },
  postei: { pode: posta, de: ['Aprovado', 'Agendado'], para: 'Postado', verbo: 'postou', precisaLink: true },
  naoemeu: { pode: meu, de: ['A fazer', 'Fazendo', 'Ajustes', 'Em revisão', 'Aguardando cliente', 'Aprovado', 'Agendado'], para: '', verbo: 'disse que não é com ele(a)', precisaTexto: true },
  jafeito: { pode: meu, de: ['A fazer', 'Fazendo', 'Ajustes', 'Em revisão', 'Aguardando cliente', 'Aprovado', 'Agendado'], para: p.fim, verbo: 'marcou como já feito (' + (p.fim === 'Cancelado' ? 'cancelado' : 'postado') + ')', precisaTexto: true },
  // Completar pedido: a Máquina do Escritório devolveu o card a quem pediu com "Falta informação"; a pessoa completa e o card volta para a fila da máquina.
  completar: { pode: meu, de: ['A fazer', 'Fazendo', 'Ajustes'], para: 'A fazer', verbo: 'completou o pedido', precisaTexto: true },
  pegar: { pode: teste ? /TESTE PAINEL/.test(titulo) : !!r.ficha && r.papel !== 'teste', de: ['A fazer', 'Fazendo', 'Ajustes'], para: '', verbo: 'pegou na fila de demandas' },
  passar: { pode: posta, de: ['A fazer', 'Fazendo', 'Em revisão', 'Ajustes', 'Aguardando cliente', 'Aprovado', 'Agendado'], para: '', verbo: 'passou para ' + (alvo ? alvo[1] : '') } };
const g = REGRA[p.acao];
let erro = '';
if (!acessoOk) erro = 'acesso';
else if (!g) erro = 'acao';
else if (!card.id || !doEntregas) erro = 'card';
else if (!g.pode) erro = 'permissao';
else if (!g.de.includes(status)) erro = 'etapa';
else if (g.precisaLink && !p.link) erro = 'link';
else if (g.precisaTexto && p.texto.length < 3) erro = 'texto';
else if (p.acao === 'jafeito' && !p.fim) erro = 'fim';
else if (p.acao === 'completar' && txt(cp['🏢 Escritório IA']) !== 'Falta informação') erro = 'etapa';
else if (p.acao === 'pegar' && !teste && (resp.length || !TIPOS_LIVRE.includes(txt(cp['Tipo'])))) erro = 'pego';
else if (p.acao === 'pegar' && !teste && abertos >= LIMITE) erro = 'limite';
else if (p.acao === 'passar' && (!alvo || (!teste && resp.length === 1 && resp[0] === alvo[0]))) erro = 'pessoa';
const agora = DateTime.now().setZone(Z);
const linha = '[Painel ' + agora.toFormat('dd/MM HH:mm') + '] ' + (r.nome || '') + ' ' + (g ? g.verbo : '') + (p.texto ? ': ' + p.texto : '') + (p.link && ['revisao', 'completar'].includes(p.acao) ? ' (' + p.link + ')' : '')
  + (p.acao === 'completar' && p.anexos.length ? '\\nAnexos:\\n' + p.anexos.map(a => '- ' + a.nome + ': ' + a.link).join('\\n') : '');
// Notion aceita até 2000 caracteres por pedaço de texto: a Obs vai em pedaços.
const pedacos = s => (String(s).match(/[\\s\\S]{1,1990}/g) || ['']).slice(0, 10).map(x => ({ type: 'text', text: { content: x } }));
const obsAntiga = txt(cp['Obs']);
const props = g ? { 'Status': { select: { name: g.para || status } }, 'Obs': { rich_text: pedacos(linha + (obsAntiga ? '\\n' + obsAntiga : '')) } } : {};
if (p.acao === 'revisao') props['Link do arquivo'] = { url: p.link };
if (p.acao === 'agendei' || p.acao === 'postei') props['Link da postagem'] = { url: p.link };
if (p.acao === 'postei' || (p.acao === 'jafeito' && p.fim === 'Postado')) props['Postado em'] = { date: { start: agora.toISODate() } };
if (p.acao === 'jafeito' && p.link) props['Link da postagem'] = { url: p.link };
// Não é comigo: tira só o nome de quem apertou; o card fica com os outros ou cai em "Sem responsável".
if (p.acao === 'naoemeu' && !teste) props['Responsável'] = { relation: resp.filter(x => x !== r.ficha).map(id => ({ id })) };
if (p.acao === 'pegar' && !teste) props['Responsável'] = { relation: [{ id: r.ficha }] };
// Teste só ganha a linha no histórico: trocar o Responsável jogaria o card TESTE na fila real de alguém.
if (p.acao === 'passar' && alvo && !teste) {
  props['Responsável'] = { relation: [{ id: alvo[0] }] };
  props['🏢 Escritório IA'] = p.para === 'escritorio' ? { select: { name: 'Na fila' } } : { select: null };
}
if (p.acao === 'completar') props['🏢 Escritório IA'] = teste ? { select: null } : { select: { name: 'Na fila' } };
if (p.acao === 'completar' && !teste) props['Responsável'] = { relation: [{ id: QUEM.escritorio[0] }] };
let aviso = '';
if (p.acao === 'revisao') aviso = '🎬 **' + titulo + '** foi para revisão (' + r.nome + '). <@1410287139169763471>, está na sua fila do painel.' + (p.texto ? '\\n> ' + p.texto : '');
if (p.acao === 'passar' && alvo) aviso = '📌 **' + titulo + '** passou para ' + (alvo[2] ? '<@' + alvo[2] + '>' : 'o Escritório (máquinas)') + ' (por ' + r.nome + ').' + (p.texto ? '\\n> ' + p.texto : '');
if (p.acao === 'naoemeu') aviso = '↩️ **' + titulo + '** voltou: ' + r.nome + ' disse que não é com ele(a). <@1410287139169763471> <@1490768736876237082>, passem para alguém pelo painel.\\n> ' + p.texto;
if (p.acao === 'jafeito') aviso = '✅ **' + titulo + '** marcado como ' + (p.fim === 'Cancelado' ? 'cancelado' : 'já postado') + ' por ' + r.nome + '.\\n> ' + p.texto;
if (p.acao === 'pegar') aviso = '🙋 **' + titulo + '** foi pego por ' + r.nome + ' na Fila de demandas.';
if (p.acao === 'ajuste') aviso = '🔁 **' + titulo + '** voltou para ajuste. O pedido está no card e no topo da fila de quem fez.';
return [{ json: { ok: !erro, cardId: card.id || '', avisar: !!aviso && !teste,
  body: JSON.stringify({ properties: props }),
  discord: JSON.stringify({ content: (aviso + '\\n— Érica, time de suporte, Grupo Euforia').slice(0, 1990), allowed_mentions: { users: p.acao === 'naoemeu' ? ['1410287139169763471', '1490768736876237082'] : ['jafeito', 'pegar'].includes(p.acao) ? [] : [p.acao === 'passar' ? (alvo && alvo[2]) || '' : '1410287139169763471'].filter(Boolean) } }),
  resposta: erro ? { ok: false, motivo: erro, status } : { ok: true, status: g.para } } }];
` } } });

const podeSeguir = ifElse({ version: 2.2, config: { name: 'Botão válido?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const atualizar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Atualizar card no Entregas', credentials: NOTION, parameters: {
  method: 'PATCH', url: '=https://api.notion.com/v1/pages/{{ $("Validar botão").first().json.cardId }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $("Validar botão").first().json.body }}', options: {} } } });

const precisaAviso = ifElse({ version: 2.2, config: { name: 'Precisa de aviso?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $("Validar botão").first().json.avisar }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const avisar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Avisar no #dia-a-dia', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://discord.com/api/v10/channels/1556642691410956339/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $("Validar botão").first().json.discord }}', options: {} } } });

const confirmar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($("Validar botão").first().json.resposta) }}', options: {} } } });

const confirmarSemAviso = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar sem aviso', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($("Validar botão").first().json.resposta) }}', options: {} } } });

const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Painel da equipe · botões (V1)\nComecei (A fazer → Fazendo), Mandar para revisão (link obrigatório → Em revisão + Link do arquivo + aviso ao Ismael), Aprovar (Em revisão → Aguardando cliente), Pedir ajuste (texto obrigatório → Ajustes), Agendei / Postei (link obrigatório → Agendado / Postado + Link da postagem), Passar para (Ismael, Rômulo e diretoria trocam o Responsável para Victor, Lorena, Daniel ou Escritório; aviso no #dia-a-dia marcando a pessoa), Não é comigo (quem é Responsável sai do card, motivo obrigatório, aviso ao Ismael e Rômulo), Já foi feito (Responsável marca Postado ou Cancelado, motivo obrigatório), Pegar (Fila de demandas: card sem Responsável de edição vira da pessoa; limite de 8 em produção), Completar pedido (card que a Máquina do Escritório devolveu com 🏢 Escritório IA = Falta informação: texto obrigatório, links e anexos na Obs, volta para Escritório + Na fila).\nSó o Responsável mexe no próprio card; revisão é do Ismael; postagem do Ismael e do Rômulo. Toda ação vira uma linha [Painel dd/mm] no topo da Obs. Teste só mexe em cards "TESTE PAINEL" e não avisa no Discord.', [], { color: 4 });

export default workflow('painel-acao', 'Painel | Botões da equipe (V1)')
  .add(pedir).to(ler).to(acesso).to(cardNode).to(abertosNode).to(validar)
  .to(podeSeguir
    .onTrue(atualizar.to(precisaAviso.onTrue(avisar.to(confirmar)).onFalse(confirmarSemAviso)))
    .onFalse(recusar))
  .add(nota);
