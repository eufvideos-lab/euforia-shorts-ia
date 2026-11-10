import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

// Painel | Conversas · Sugerir resposta (V1) — 10/11/2026, pedido do Henrique.
// Na aba Conversas: "✨ Sugerir resposta" (rascunho no jeito do Henrique, a pessoa edita e envia pela aba)
// e "🪄 Passar para a Gerente" (cria card CASO no Entregas para as Mãos da Gerente resolverem).
// Fluxo separado do "Painel | Conversas com clientes (V1)" de propósito: não mexe no que já está no ar.

const PG = { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } };
const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const ANTH = { anthropicApi: { id: 'NSAFLaAWGkUDHJLn', name: 'Anthropic account' } };
const DISCORD = { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } };
const CANAL_SUG = '1569805651872579607'; // #sugestoes-enviadas (DIREÇÃO, só diretoria)
const ENVIADAS = { __rl: true, mode: 'id', value: 'BHS6qiCR4FlF20J5', cachedResultName: 'Gerente IA · sugestões enviadas' };
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const ACESSO = { __rl: true, mode: 'id', value: 'ilXDZWGAcOjoajx7', cachedResultName: 'Painel equipe · acesso' };
const TEXTOS = { __rl: true, mode: 'id', value: 'hBQ4lzOeYTTYAkyc', cachedResultName: 'Gerente IA · textos' };
const PAPEIS = "['revisor', 'calls', 'diretor', 'teste']";
const CLIENTES_DB = '3ddc91b406be49e98e630c298d9162d8';
const ENTREGAS_DB = '74b3076a-3257-49e3-bac4-ba6659215e48';
const GERENTE = '40e98c0c-dde0-817e-b798-f6e045686b7c';

const TEAM_SQL = `team AS (
  SELECT DISTINCT m.autor_jid FROM mensagens m
  WHERE m.chat_id IN (SELECT chat_id FROM chats WHERE nome ILIKE '%pend%ncias%')
    AND NOT m.from_me AND m.autor_jid IS NOT NULL
  UNION SELECT '5581996928808@s.whatsapp.net'
  UNION SELECT '5581995667045@s.whatsapp.net'
)`;

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Sugerir do painel', parameters: {
  httpMethod: 'POST', path: 'euforia-painel-sugerir', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

const ler = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler pedido', parameters: { jsCode: `const b = ($input.first().json.body) || {};
const u = String(b.u || '').toLowerCase();
return [{ json: { u: /^[0-9a-f]{24}$/.test(u) ? u : 'x', pin: String(b.pin || '').replace(/[^0-9]/g, '').slice(0, 6),
  acao: ['gerente', 'enviado'].includes(b.acao) ? b.acao : 'sugerir',
  sugestao: String(b.sugestao || '').slice(0, 3000), enviado: String(b.enviado || '').slice(0, 3000),
  chat: /^[0-9-]{6,40}@g[.]us$/.test(String(b.chat || '')) ? b.chat : '',
  pedido: String(b.pedido || '').split(String.fromCharCode(13)).join('').trim().slice(0, 600) } }];
` } } });

const acesso = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Achar pessoa', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: ACESSO, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'token', condition: 'eq', keyValue: '={{ $json.u }}' }] }, limit: 1 } } });

const validar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validar acesso', parameters: { jsCode: `const p = $('Ler pedido').first().json;
const r = $input.first().json || {};
const ok = !!r.token && r.token === p.u && r.ativo === true && String(r.pin) === p.pin && ${PAPEIS}.includes(r.papel);
let motivo = ok ? '' : 'acesso';
if (ok && !p.chat) motivo = 'grupo';
if (ok && p.acao === 'enviado' && (!p.sugestao || !p.enviado)) motivo = 'texto';
return [{ json: { ok: !motivo, acao: p.acao, chat: p.chat || '-', pedido: p.pedido, sugestao: p.sugestao, enviado: p.enviado, nome: r.nome || '', papel: r.papel || '',
  diretor: r.papel === 'diretor', teste: r.papel === 'teste', resposta: { ok: false, motivo } } }];
` } } });

const podeSeguir = ifElse({ version: 2.2, config: { name: 'Acesso válido?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } } });

// Conversa: últimas 40 mensagens do grupo (mesma régua de equipe da aba Conversas).
const buscarConversa = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Conversa do grupo', credentials: PG, alwaysOutputData: true, parameters: {
  operation: 'executeQuery',
  query: `WITH ${TEAM_SQL},
msgs AS (
  SELECT msg_id, min(enviado_em) AS enviado_em,
         bool_or(from_me) OR bool_or(COALESCE(autor_nome,'') ILIKE '%euforia%') OR bool_or(autor_jid IN (SELECT autor_jid FROM team WHERE autor_jid IS NOT NULL)) AS da_equipe,
         max(autor_nome) AS autor_nome, max(tipo) AS tipo, max(texto) AS texto
  FROM mensagens
  WHERE chat_id = $1 AND enviado_em > now() - interval '45 days'
    AND tipo NOT IN ('reactionMessage','stickerMessage','protocolMessage','pollUpdateMessage')
  GROUP BY msg_id
)
SELECT (SELECT c.nome FROM chats c WHERE c.chat_id = $1 AND c.nome IS NOT NULL LIMIT 1) AS grupo,
  EXISTS (SELECT 1 FROM chats c WHERE c.chat_id = $1 AND c.origem LIKE 'suporte%') AS do_suporte,
  COALESCE((SELECT json_agg(x ORDER BY x.enviado_em) FROM (
    SELECT m.enviado_em, m.da_equipe, m.autor_nome, m.tipo, m.texto, e.classificacao
    FROM msgs m LEFT JOIN atendimento_estado e ON e.msg_id = m.msg_id
    ORDER BY m.enviado_em DESC LIMIT 40) x), '[]'::json) AS mensagens;`,
  options: { queryReplacement: '={{ [ $json.chat ] }}' } } } });

const fichaCliente = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Ficha do cliente', credentials: NOTION, alwaysOutputData: true, parameters: {
  method: 'POST', url: `https://api.notion.com/v1/databases/${CLIENTES_DB}/query`, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { property: "Grupo WhatsApp (ID)", rich_text: { contains: $("Validar acesso").first().json.chat } }, page_size: 1 }) }}',
  options: { response: { response: { neverError: true } } } } } });

const juntarCliente = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Juntar cliente', parameters: { jsCode: `const v = $('Validar acesso').first().json;
const conv = $('Conversa do grupo').first().json || {};
const f = (($input.first().json || {}).results || [])[0] || null;
const txt = x => { if (!x) return ''; const a = x.title || x.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (x.select) return x.select.name; if (x.date) return x.date.start || ''; if (x.checkbox !== undefined) return x.checkbox ? 'sim' : ''; return ''; };
const pr = f ? f.properties || {} : {};
const nomeProp = Object.keys(pr).find(k => pr[k].type === 'title');
let motivo = '';
if (!conv.grupo || !conv.do_suporte || (v.teste && !/teste/i.test(conv.grupo))) motivo = 'grupo';
else if (!f) motivo = 'ficha';
return [{ json: { ok: !motivo, acao: v.acao, cliente_id: f ? f.id : '', cliente: f ? txt(pr[nomeProp]) : '', grupo: conv.grupo || '',
  atencao: f ? txt(pr['🔴 Atenção redobrada']) === 'sim' : false, foco: f ? txt(pr['⭐ Foco até']) : '',
  mensagens: conv.mensagens || [], resposta: { ok: false, motivo } } }];
` } } });

const temCliente = ifElse({ version: 2.2, config: { name: 'Achou o cliente?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } } });

const ehGerente = ifElse({ version: 2.2, config: { name: 'Passar para a Gerente?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: '={{ $json.acao }}', rightValue: 'gerente', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } } } });

// ---------- SUGERIR ----------
const cardsAbertos = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Cards abertos', credentials: NOTION, alwaysOutputData: true, parameters: {
  method: 'POST', url: `https://api.notion.com/v1/databases/${ENTREGAS_DB}/query`, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { and: [{ property: "Cliente", relation: { contains: $json.cliente_id } }, { property: "Status", select: { does_not_equal: "Postado" } }, { property: "Status", select: { does_not_equal: "Cancelado" } }] }, sorts: [{ timestamp: "last_edited_time", direction: "descending" }], page_size: 30 }) }}',
  options: { response: { response: { neverError: true } } } } } });

const lerTextos = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Ler textos', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: TEXTOS, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'chave', condition: 'eq', keyValue: 'sugerir_system' }] } } } });

const montarPedido = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar pedido ao Claude', parameters: { jsCode: `const Z = 'America/Recife';
const v = $('Validar acesso').first().json;
const c = $('Juntar cliente').first().json;
const linhas = $('Ler textos').all().map(i => i.json).filter(r => r.chave === 'sugerir_system' && r.texto);
linhas.sort((a, b) => (Number(b.versao) || 0) - (Number(a.versao) || 0));
const SYSTEM = (linhas[0] || {}).texto;
if (!SYSTEM) return [{ json: { pular: true, resposta: { ok: false, motivo: 'prompt' } } }];
const DIRECAO = ['financeiro', 'cancelamento', 'jurídico', 'juridico'];
const SENS = /(R[$]|(^|[^a-z])pix([^a-z]|$)|boleto|reembols|estorn|advogad|procon|reclame aqui|processo judicial|cancelar (o )?contrato|distrato|notifica[cç][aã]o extrajudicial)/i;
const sens = m => (((m.classificacao || {}).sensivel === true) && DIRECAO.includes(String((m.classificacao || {}).tema || '').toLowerCase())) || SENS.test(m.texto || '');
const M = c.mensagens || [];
// Pendência do cliente (depois da última fala da equipe) com assunto da diretoria: sem sugestão.
for (let i = M.length - 1; i >= 0; i--) { if (M[i].da_equipe) break; if (sens(M[i])) return [{ json: { pular: true, resposta: { ok: false, motivo: 'direcao' } } }]; }
const TIPO = { imageMessage: '[foto]', videoMessage: '[vídeo]', documentMessage: '[documento]', audioMessage: '[áudio]', documentWithCaptionMessage: '[documento]' };
const conversa = M.map(m => DateTime.fromJSDate(new Date(m.enviado_em)).setZone(Z).toFormat('dd/MM HH:mm') + ' · ' + (m.da_equipe ? 'EUFORIA' : (m.autor_nome || 'Cliente')) + ': '
  + (sens(m) ? '(assunto da diretoria, oculto)' : ((TIPO[m.tipo] ? TIPO[m.tipo] + ' ' : '') + String(m.texto || '').replace(/R[$]\\s?[0-9.,]+/g, '[valor]').slice(0, 700)))).join(String.fromCharCode(10));
const txt = x => { if (!x) return ''; const a = x.title || x.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (x.select) return x.select.name; if (x.date) return x.date.start || ''; if (x.unique_id) return (x.unique_id.prefix ? x.unique_id.prefix + '-' : '') + x.unique_id.number; return ''; };
const ddmm = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '';
const cards = (($('Cards abertos').first().json || {}).results || []).map(p => { const pr = p.properties || {};
  return '- ' + txt(pr['Código']) + ' · ' + txt(pr['Entrega']) + ' · ' + txt(pr['Tipo']) + ' · status ' + txt(pr['Status']) + (txt(pr['Prazo']) ? ' · prazo ' + ddmm(txt(pr['Prazo']).slice(0, 10)) : '') + (txt(pr['Postar em']) ? ' · posta ' + ddmm(txt(pr['Postar em']).slice(0, 10)) : ''); });
const agora = DateTime.now().setZone(Z);
const CAL = Array.from({ length: 8 }, (_, k) => agora.plus({ days: k }).setLocale('pt-BR').toFormat('cccc dd/MM')).join(', ');
const user = 'Hoje é ' + agora.setLocale('pt-BR').toFormat('cccc dd/MM/yyyy HH:mm') + '. Próximos dias: ' + CAL + '.'
  + String.fromCharCode(10) + 'Cliente: ' + c.cliente + (c.atencao ? ' (🔴 atenção redobrada)' : '') + (c.foco ? ' (⭐ em foco)' : '')
  + String.fromCharCode(10) + 'Quem vai enviar: ' + String(v.nome || '').split(' ')[0] + (v.diretor ? ' (diretoria)' : ' (equipe)')
  + (v.pedido ? String.fromCharCode(10) + 'Orientação de quem pediu a sugestão: ' + v.pedido : '')
  + String.fromCharCode(10, 10) + 'Cards do cliente (Entregas, mais recentes primeiro):' + String.fromCharCode(10) + (cards.join(String.fromCharCode(10)) || '(nenhum)')
  + String.fromCharCode(10, 10) + 'Conversa do grupo (mais antiga em cima):' + String.fromCharCode(10) + (conversa || '(sem mensagens)');
return [{ json: { pular: false, corpo: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 900, temperature: 0.4, system: SYSTEM, messages: [{ role: 'user', content: user }] }) } }];
` } } });

const vaiPedir = ifElse({ version: 2.2, config: { name: 'Pedir ao Claude?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: '={{ $json.pular }}', rightValue: '', operator: { type: 'boolean', operation: 'false', singleValue: true } }], combinator: 'and' } } } });

const claude = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Sugerir (Claude)', credentials: ANTH, parameters: {
  method: 'POST', url: 'https://api.anthropic.com/v1/messages', authentication: 'predefinedCredentialType', nodeCredentialType: 'anthropicApi',
  sendHeaders: true, headerParameters: { parameters: [{ name: 'anthropic-version', value: '2023-06-01' }] },
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}', options: { timeout: 90000, response: { response: { neverError: true } } } } } });

const lerSugestao = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler sugestão', parameters: { jsCode: `const r = $input.first().json || {};
let s = {};
try { const t = ((r.content || [])[0] || {}).text || ''; s = JSON.parse((t.match(/\\{[\\s\\S]*\\}/) || ['{}'])[0]); } catch (e) { s = {}; }
const resposta = String(s.resposta || '').replace(/R[$]\\s?[0-9.,]+/g, '').trim().slice(0, 2500);
if (!resposta) return [{ json: { resposta: { ok: false, motivo: 'ia' } } }];
return [{ json: { resposta: { ok: true, texto: resposta, entender: String(s.entender || '').slice(0, 300),
  produzir: s.produzir === true, o_que_produzir: String(s.o_que_produzir || '').slice(0, 400),
  diretoria: String(s.diretoria || '').slice(0, 300), conferir: String(s.conferir || '').slice(0, 300) } } }];
` } } });

// ---------- PASSAR PARA A GERENTE: card CASO no Entregas ----------
const montarCaso = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar caso', parameters: { jsCode: `const v = $('Validar acesso').first().json;
const c = $('Juntar cliente').first().json;
const agora = DateTime.now().setZone('America/Recife');
const pedido = (v.pedido || 'resolver o que o cliente pediu no grupo').replace(/R[$]\\s?[0-9.,]+/g, '[valor]');
const titulo = ('CASO | ' + c.cliente.toUpperCase() + ' | ' + pedido.toUpperCase()).slice(0, 180);
const obs = ('[Painel ' + agora.toFormat('dd/MM HH:mm') + '] Pedido por ' + v.nome + ' na aba Conversas.' + String.fromCharCode(10) + pedido + String.fromCharCode(10) + 'Grupo: ' + c.grupo).slice(0, 1900);
const props = {
  'Entrega': { title: [{ text: { content: titulo } }] },
  'Cliente': { relation: [{ id: c.cliente_id }] },
  'Tipo': { select: { name: 'Outro' } },
  'Status': { select: { name: 'A fazer' } },
  'Prioridade': { select: { name: 'Urgente' } },
  'Prazo': { date: { start: agora.toISODate() } },
  'Origem': { select: { name: 'Extra' } },
  'Responsável': { relation: [{ id: '${GERENTE}' }] },
  'Obs': { rich_text: [{ text: { content: obs } }] }
};
return [{ json: { corpo: JSON.stringify({ parent: { database_id: '${ENTREGAS_DB}' }, properties: props }) } }];
` } } });

const criarCaso = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Criar card CASO', credentials: NOTION, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/pages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}',
  options: { response: { response: { neverError: true } } } } } });

const resultadoCaso = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Resultado do caso', parameters: { jsCode: `const r = $input.first().json || {};
return [{ json: { resposta: r.id ? { ok: true, card: r.url || '' } : { ok: false, motivo: 'notion' } } }];
` } } });

// ---------- AVISO: resposta enviada usando a sugestão (pedido do Henrique, 10/11) ----------
const ehAviso = ifElse({ version: 2.2, config: { name: 'É aviso de envio?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: '={{ $json.acao }}', rightValue: 'enviado', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } } } });

const montarAviso = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar aviso', parameters: { jsCode: `const v = $('Validar acesso').first().json;
const c = $('Juntar cliente').first().json;
const agora = DateTime.now().setZone('America/Recife');
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter(Boolean);
const a = norm(v.sugestao), b = norm(v.enviado);
// Parecido = palavras em comum na mesma ordem (LCS) sobre o tamanho do maior texto.
const n = a.length, m = b.length; let prev = new Array(m + 1).fill(0);
for (let i = 1; i <= n; i++) { const cur = new Array(m + 1).fill(0); for (let j = 1; j <= m; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]); prev = cur; }
const parecido = Math.round(100 * prev[m] / Math.max(1, n, m));
const igual = v.sugestao.trim() === v.enviado.trim();
const NL = String.fromCharCode(10);
const cita = s => s.trim().slice(0, 850).split(NL).map(l => '> ' + l).join(NL) + (s.trim().length > 850 ? NL + '> (…)' : '');
const selo = igual ? '✅ Enviou igual à sugestão' : (parecido >= 80 ? '✏️ Ajuste leve (' + parecido + '% igual)' : '⚠️ Mudou bastante (' + parecido + '% igual)');
let content = '**✨ Sugestão usada · ' + c.cliente + '**' + NL + 'Enviada por ' + v.nome + ' às ' + agora.toFormat('HH:mm') + ' · ' + selo + NL + NL
  + (igual ? '**Enviado (igual à sugestão):**' + NL + cita(v.enviado) : '**Sugestão:**' + NL + cita(v.sugestao) + NL + NL + '**Enviado:**' + NL + cita(v.enviado))
  + NL + NL + 'Se ficou ruim: apague no grupo e mande outra pela aba Conversas.';
content = content.slice(0, 1990);
return [{ json: { discord: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
  linha: { quando: agora.toISO(), cliente: c.cliente, chat: v.chat, quem: v.nome, sugestao: v.sugestao, enviado: v.enviado, igual, parecido },
  resposta: { ok: true } } }];
` } } });

const avisarDiscord = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Avisar no #sugestoes-enviadas', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: `https://discord.com/api/v10/channels/${CANAL_SUG}/messages`, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.discord }}', options: {} } } });

const registrarEnvio = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Registrar sugestão enviada', onError: 'continueRegularOutput', parameters: {
  resource: 'row', operation: 'insert', dataTableId: ENVIADAS,
  columns: { mappingMode: 'defineBelow', value: {
      quando: '={{ $("Montar aviso").first().json.linha.quando }}', cliente: '={{ $("Montar aviso").first().json.linha.cliente }}', chat: '={{ $("Montar aviso").first().json.linha.chat }}',
      quem: '={{ $("Montar aviso").first().json.linha.quem }}', sugestao: '={{ $("Montar aviso").first().json.linha.sugestao }}', enviado: '={{ $("Montar aviso").first().json.linha.enviado }}',
      igual: '={{ $("Montar aviso").first().json.linha.igual }}', parecido: '={{ $("Montar aviso").first().json.linha.parecido }}' },
    matchingColumns: [], schema: [
      { id: 'quando', displayName: 'quando', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
      { id: 'cliente', displayName: 'cliente', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
      { id: 'chat', displayName: 'chat', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
      { id: 'quem', displayName: 'quem', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
      { id: 'sugestao', displayName: 'sugestao', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
      { id: 'enviado', displayName: 'enviado', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
      { id: 'igual', displayName: 'igual', required: false, defaultMatch: false, display: true, type: 'boolean', canBeUsedToMatch: true },
      { id: 'parecido', displayName: 'parecido', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true }] },
  options: {} } } });

const devAviso = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar aviso', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($("Montar aviso").first().json.resposta) }}', options: {} } } });

const devSugestao = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver sugestão', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });
const devSemSugestao = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Sem sugestão', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });
const devCaso = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver caso', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });
const devSemCliente = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Sem cliente', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });
const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Painel · Conversas · Sugerir resposta (V1)\nAba Conversas: "✨ Sugerir resposta" lê as últimas 40 mensagens do grupo + cards do cliente e escreve a resposta no jeito do Henrique (prompt na tabela "Gerente IA · textos", chave sugerir_system, maior versão). Quem pediu edita e envia pela própria aba (fluxo de Conversas). Nada sai daqui.\n"🪄 Passar para a Gerente" cria card CASO no Entregas com Responsável = Gerente IA (as Mãos da Gerente resolvem).\n"Enviado": quando alguém manda a resposta usando a sugestão, avisa no #sugestoes-enviadas (sugestão x enviado, % igual) e registra na tabela "Gerente IA · sugestões enviadas".\nTravas: mesmas pessoas da aba; assunto da diretoria (dinheiro, contrato, jurídico) não ganha sugestão; valores mascarados.', [], { color: 4 });

export default workflow('painel-sugerir', 'Painel | Conversas · Sugerir resposta (V1)')
  .add(pedir).to(ler).to(acesso).to(validar)
  .to(podeSeguir
    .onTrue(buscarConversa.to(fichaCliente).to(juntarCliente).to(temCliente
      .onTrue(ehAviso
        .onTrue(montarAviso.to(avisarDiscord).to(registrarEnvio).to(devAviso))
        .onFalse(ehGerente
          .onTrue(montarCaso.to(criarCaso).to(resultadoCaso).to(devCaso))
          .onFalse(cardsAbertos.to(lerTextos).to(montarPedido).to(vaiPedir
            .onTrue(claude.to(lerSugestao).to(devSugestao))
            .onFalse(devSemSugestao)))))
      .onFalse(devSemCliente)))
    .onFalse(recusar))
  .add(nota);
