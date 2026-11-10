import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

const EVO = { httpHeaderAuth: { id: 'MqNLRX9duuYKJSR2', name: 'Evolution API' } };
const PG = { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } };
const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };
const BASE = 'https://api.grupoeuforia.tech';
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const ACESSO = { __rl: true, mode: 'id', value: 'ilXDZWGAcOjoajx7', cachedResultName: 'Painel equipe · acesso' };
const ENVIOS = { __rl: true, mode: 'id', value: 'Ygn3HyERIHdHpva4', cachedResultName: 'Painel · conversas enviadas' };
const SEM_ERRO = { response: { response: { neverError: true, fullResponse: true } } };
// Quem usa a aba: Lorena e Rômulo (calls), Ismael (revisor), diretoria e teste.
const PAPEIS = "['revisor', 'calls', 'diretor', 'teste']";
// Assinatura da resposta: 'erica' = termina com "Érica, time de suporte, Grupo Euforia"; 'nome' = "*Lorena:* texto".
const ASSINATURA = 'nome';

// Mesma régua do "Painel | Fila de respostas": quem é da equipe e quais grupos são internos.
const TEAM_SQL = `team AS (
  SELECT DISTINCT m.autor_jid FROM mensagens m
  WHERE m.chat_id IN (SELECT chat_id FROM chats WHERE nome ILIKE '%pend%ncias%')
    AND NOT m.from_me AND m.autor_jid IS NOT NULL
  UNION SELECT '5581996928808@s.whatsapp.net'
  UNION SELECT '5581995667045@s.whatsapp.net'
),
internos AS (
  SELECT DISTINCT chat_id FROM chats
  WHERE nome ILIKE ANY (ARRAY['%pend%ncias%','%euforia | marketing%','%central de gest%','%sala de guerra%','%teste wo%','%aquecimento%'])
)`;

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Conversas do painel', parameters: {
  httpMethod: 'POST', path: 'euforia-painel-conversas', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

const ler = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler pedido', parameters: { jsCode: `const b = ($input.first().json.body) || {};
const u = String(b.u || '').toLowerCase();
const acao = ['lista', 'abrir', 'midia', 'mandar'].includes(b.acao) ? b.acao : 'lista';
return [{ json: { u: /^[0-9a-f]{24}$/.test(u) ? u : 'x', pin: String(b.pin || '').replace(/[^0-9]/g, '').slice(0, 6), acao,
  chat: /^[0-9-]{6,40}@g[.]us$/.test(String(b.chat || '')) ? b.chat : '',
  msg: /^[A-Za-z0-9_-]{6,80}$/.test(String(b.msg || '')) ? b.msg : '',
  texto: String(b.texto || '').split(String.fromCharCode(13)).join('').trim().slice(0, 3000) } }];
` } } });

const acesso = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Achar pessoa', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: ACESSO, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'token', condition: 'eq', keyValue: '={{ $json.u }}' }] }, limit: 1 } } });

const validar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validar acesso', parameters: { jsCode: `const p = $('Ler pedido').first().json;
const r = $input.first().json || {};
const ok = !!r.token && r.token === p.u && r.ativo === true && String(r.pin) === p.pin && ${PAPEIS}.includes(r.papel);
let motivo = ok ? '' : 'acesso';
if (ok && p.acao !== 'lista' && !p.chat) motivo = 'grupo';
else if (ok && p.acao === 'midia' && !p.msg) motivo = 'mensagem';
else if (ok && p.acao === 'mandar' && p.texto.length < 2) motivo = 'texto';
return [{ json: { ok: !motivo, acao: p.acao, chat: p.chat || '-', msg: p.msg || '-', texto: p.texto, nome: r.nome || '', papel: r.papel || '',
  diretor: r.papel === 'diretor', teste: r.papel === 'teste', resposta: { ok: false, motivo } } }];
` } } });

const podeSeguir = ifElse({ version: 2.2, config: { name: 'Acesso válido?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } } });
const ehLista = ifElse({ version: 2.2, config: { name: 'É a lista?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: '={{ $json.acao }}', rightValue: 'lista', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } } } });
const ehAbrir = ifElse({ version: 2.2, config: { name: 'É abrir conversa?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: '={{ $json.acao }}', rightValue: 'abrir', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } } } });
const ehMidia = ifElse({ version: 2.2, config: { name: 'É ver foto?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: '={{ $json.acao }}', rightValue: 'midia', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } } } });

// ---------- LISTA: todos os grupos de cliente do suporte com conversa nos últimos 30 dias ----------
const buscarLista = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Grupos com conversa', credentials: PG, alwaysOutputData: true, parameters: {
  operation: 'executeQuery',
  query: `WITH ${TEAM_SQL},
msgs AS (
  SELECT msg_id, min(chat_id) AS chat_id, min(enviado_em) AS enviado_em,
         bool_or(from_me) OR bool_or(COALESCE(autor_nome,'') ILIKE '%euforia%') OR bool_or(autor_jid IN (SELECT autor_jid FROM team WHERE autor_jid IS NOT NULL)) AS da_equipe,
         max(autor_nome) AS autor_nome, max(tipo) AS tipo, max(texto) AS texto
  FROM mensagens
  WHERE chat_id LIKE '%@g.us' AND enviado_em > now() - interval '30 days'
    AND tipo NOT IN ('reactionMessage','stickerMessage','protocolMessage','pollUpdateMessage')
  GROUP BY msg_id
),
ult AS (SELECT DISTINCT ON (chat_id) * FROM msgs ORDER BY chat_id, enviado_em DESC),
ult_equipe AS (SELECT chat_id, max(enviado_em) AS em FROM msgs WHERE da_equipe GROUP BY chat_id)
SELECT u.chat_id,
  (SELECT c.nome FROM chats c WHERE c.chat_id = u.chat_id AND c.nome IS NOT NULL LIMIT 1) AS grupo,
  u.msg_id, u.da_equipe, COALESCE(u.autor_nome, 'Cliente') AS autor, u.tipo, COALESCE(u.texto, '') AS texto, u.enviado_em,
  (SELECT count(*) FROM msgs y WHERE y.chat_id = u.chat_id AND NOT y.da_equipe AND y.enviado_em > COALESCE(ue.em, 'epoch')) AS sem_resposta,
  e.ultima_acao, e.classificacao
FROM ult u
LEFT JOIN ult_equipe ue ON ue.chat_id = u.chat_id
LEFT JOIN atendimento_estado e ON e.msg_id = u.msg_id
WHERE u.chat_id NOT IN (SELECT chat_id FROM internos)
  AND EXISTS (SELECT 1 FROM chats c WHERE c.chat_id = u.chat_id AND c.origem LIKE 'suporte%')
ORDER BY u.enviado_em DESC
LIMIT 300;`, options: {} } } });

const clientes = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Clientes com grupo', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/3ddc91b406be49e98e630c298d9162d8/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { and: [{ property: "Situação", select: { does_not_equal: "Encerrado" } }, { property: "Grupo WhatsApp (ID)", rich_text: { is_not_empty: true } }] }, page_size: 100 }) }}',
  options: { pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest',
    parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] },
    paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.has_more }}', limitPagesFetched: true, maxRequests: 10 } } } } } });

// Mostra só grupo de ficha não encerrada (o teste só vê grupo de teste). Assunto de dinheiro, contrato ou jurídico não mostra o texto para a equipe.
const montarLista = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar lista', parameters: { jsCode: `const Z = 'America/Recife';
const v = $('Validar acesso').first().json;
const txt = x => { if (!x) return ''; const a = x.title || x.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (x.select) return x.select.name; return ''; };
const cli = {};
for (const it of $('Clientes com grupo').all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {};
  const g = txt(pr['Grupo WhatsApp (ID)']).trim();
  if (g) cli[g] = { nome: txt(pr['Cliente']), faixa: txt(pr['Faixa']) || txt(pr['Faixa base']), atencao: !!(pr['🔴 Atenção redobrada'] || {}).checkbox };
}
const DIRECAO = ['financeiro', 'cancelamento', 'jurídico', 'juridico'];
const SENS = /(R[$]|(^|[^a-z])pix([^a-z]|$)|boleto|reembols|estorn|advogad|procon|reclame aqui|processo judicial|cancelar (o )?contrato|distrato)/i;
const agora = DateTime.now().setZone(Z);
const out = [];
for (const it of $('Grupos com conversa').all()) {
  const r = it.json;
  if (!r.chat_id) continue;
  const k = cli[r.chat_id];
  const teste = /teste/i.test(r.grupo || '');
  if (v.teste ? !teste : !k) continue;
  const c = r.classificacao || {};
  const oculto = !v.diretor && !r.da_equipe && ((c.sensivel === true && DIRECAO.includes(String(c.tema || '').toLowerCase())) || SENS.test(r.texto || ''));
  const em = DateTime.fromJSDate(new Date(r.enviado_em)).setZone(Z);
  const espera = Number(r.sem_resposta) > 0 && r.ultima_acao !== 'ignorar' && !r.da_equipe;
  out.push({ chat: r.chat_id, nome: (k && k.nome) || r.grupo || 'Grupo', grupo: r.grupo || '', faixa: (k && k.faixa) || '', atencao: !!(k && k.atencao),
    ultima: oculto ? '🔒 Assunto da diretoria' : (r.da_equipe ? 'Euforia: ' : '') + (r.texto || '[' + String(r.tipo || 'mensagem').replace('Message', '') + ']').slice(0, 120),
    quando: em.hasSame(agora, 'day') ? em.toFormat('HH:mm') : em.toFormat('dd/MM'), ts: em.toMillis(),
    espera, naoLidas: espera ? Number(r.sem_resposta) : 0 });
}
return [{ json: { resposta: { ok: true, agora: agora.toFormat('HH:mm'), conversas: out } } }];
` } } });

// ---------- ABRIR: últimas mensagens de um grupo ----------
const buscarConversa = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Mensagens do grupo', credentials: PG, alwaysOutputData: true, parameters: {
  operation: 'executeQuery',
  query: `WITH ${TEAM_SQL},
msgs AS (
  SELECT msg_id, min(enviado_em) AS enviado_em, bool_or(from_me) AS from_me,
         bool_or(from_me) OR bool_or(COALESCE(autor_nome,'') ILIKE '%euforia%') OR bool_or(autor_jid IN (SELECT autor_jid FROM team WHERE autor_jid IS NOT NULL)) AS da_equipe,
         max(autor_nome) AS autor_nome, max(tipo) AS tipo, max(texto) AS texto
  FROM mensagens
  WHERE chat_id = $1 AND enviado_em > now() - interval '60 days'
    AND tipo NOT IN ('reactionMessage','protocolMessage','pollUpdateMessage')
  GROUP BY msg_id
)
SELECT (SELECT c.nome FROM chats c WHERE c.chat_id = $1 AND c.nome IS NOT NULL LIMIT 1) AS grupo,
  ($1 IN (SELECT chat_id FROM internos)) AS interno,
  EXISTS (SELECT 1 FROM chats c WHERE c.chat_id = $1 AND c.origem LIKE 'suporte%') AS do_suporte,
  COALESCE((SELECT json_agg(x ORDER BY x.enviado_em) FROM (
    SELECT m.msg_id, m.enviado_em, m.from_me, m.da_equipe, m.autor_nome, m.tipo, m.texto, e.classificacao
    FROM msgs m LEFT JOIN atendimento_estado e ON e.msg_id = m.msg_id
    ORDER BY m.enviado_em DESC LIMIT 80) x), '[]'::json) AS mensagens;`,
  options: { queryReplacement: '={{ [ $json.chat ] }}' } } } });

const montarConversa = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar conversa', parameters: { jsCode: `const Z = 'America/Recife';
const v = $('Validar acesso').first().json;
const r = $input.first().json || {};
if (!r.grupo || r.interno || !r.do_suporte || (v.teste && !/teste/i.test(r.grupo))) return [{ json: { resposta: { ok: false, motivo: 'grupo' } } }];
const DIRECAO = ['financeiro', 'cancelamento', 'jurídico', 'juridico'];
const SENS = /(R[$]|(^|[^a-z])pix([^a-z]|$)|boleto|reembols|estorn|advogad|procon|reclame aqui|processo judicial|cancelar (o )?contrato|distrato)/i;
const TIPO = { imageMessage: '📷 Foto', videoMessage: '🎬 Vídeo', documentMessage: '📄 Documento', audioMessage: '🎤 Áudio', stickerMessage: 'Figurinha', contactMessage: '👤 Contato', locationMessage: '📍 Localização', documentWithCaptionMessage: '📄 Documento' };
const agora = DateTime.now().setZone(Z);
let bloqueio = '';
const msgs = (r.mensagens || []).map(m => {
  const c = m.classificacao || {};
  const oculto = !v.diretor && !m.da_equipe && ((c.sensivel === true && DIRECAO.includes(String(c.tema || '').toLowerCase())) || SENS.test(m.texto || ''));
  const em = DateTime.fromJSDate(new Date(m.enviado_em)).setZone(Z);
  return { id: m.msg_id, eu: !!m.da_equipe, autor: m.da_equipe ? (m.from_me ? 'Euforia' : (m.autor_nome || 'Euforia')) : (m.autor_nome || 'Cliente'),
    tipo: TIPO[m.tipo] || '', foto: !oculto && m.tipo === 'imageMessage', oculto,
    texto: oculto ? '' : String(m.texto || '').slice(0, 3000),
    hora: em.toFormat('HH:mm'), dia: em.hasSame(agora, 'day') ? 'Hoje' : em.hasSame(agora.minus({ days: 1 }), 'day') ? 'Ontem' : em.toFormat('dd/MM/yyyy') };
});
// Se a última mensagem do cliente (sem resposta da equipe depois) é assunto da diretoria, a equipe não responde por aqui.
for (let i = msgs.length - 1; i >= 0; i--) { if (msgs[i].eu) break; if (msgs[i].oculto) { bloqueio = 'direcao'; break; } }
const h = agora.hour;
return [{ json: { resposta: { ok: true, chat: v.chat, grupo: r.grupo, mensagens: msgs, bloqueio,
  noite: !v.diretor && (h >= 22 || h < 7), assinatura: '${ASSINATURA}', agora: agora.toFormat('HH:mm') } } }];
` } } });

// ---------- MÍDIA: abrir a foto de uma mensagem ----------
const buscarMidia = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Achar a foto', credentials: PG, alwaysOutputData: true, parameters: {
  operation: 'executeQuery',
  query: `SELECT m.origem, m.from_me, m.texto, m.autor_nome, a.classificacao
FROM mensagens m LEFT JOIN atendimento_estado a ON a.msg_id = m.msg_id
WHERE m.msg_id = $1 AND m.chat_id = $2 AND m.tipo = 'imageMessage'
  AND m.chat_id NOT IN (SELECT chat_id FROM chats WHERE nome ILIKE ANY (ARRAY['%pend%ncias%','%euforia | marketing%','%central de gest%','%sala de guerra%']))
  AND EXISTS (SELECT 1 FROM chats c WHERE c.chat_id = m.chat_id AND c.origem LIKE 'suporte%')
ORDER BY (m.origem = 'suporte') DESC LIMIT 1;`,
  options: { queryReplacement: '={{ [ $json.msg, $json.chat ] }}' } } } });

const baixar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Baixar foto', credentials: EVO, parameters: {
  method: 'POST', url: `=${BASE}/chat/getBase64FromMediaMessage/{{ $json.origem || 'suporte' }}`, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ message: { key: { id: $("Validar acesso").first().json.msg, remoteJid: $("Validar acesso").first().json.chat, fromMe: $json.from_me === true } }, convertToMp4: false }) }}',
  options: { timeout: 60000, response: { response: { neverError: true, fullResponse: true } } } } } });

const montarMidia = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar foto', parameters: { jsCode: `const r = $input.first().json || {};
const b = r.body || {};
const ok = r.statusCode >= 200 && r.statusCode < 300 && typeof b.base64 === 'string' && b.base64.length < 12000000;
return [{ json: { resposta: ok ? { ok: true, mime: String(b.mimetype || 'image/jpeg').split(';')[0], base64: b.base64 } : { ok: false, motivo: 'foto' } } }];
` } } });

// ---------- MANDAR: resposta da equipe no grupo, pelo número do suporte ----------
const conferirGrupo = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Conferir grupo', credentials: PG, alwaysOutputData: true, parameters: {
  operation: 'executeQuery',
  query: `WITH ${TEAM_SQL},
msgs AS (
  SELECT msg_id, min(enviado_em) AS enviado_em,
         bool_or(from_me) OR bool_or(COALESCE(autor_nome,'') ILIKE '%euforia%') OR bool_or(autor_jid IN (SELECT autor_jid FROM team WHERE autor_jid IS NOT NULL)) AS da_equipe,
         max(tipo) AS tipo, max(texto) AS texto
  FROM mensagens WHERE chat_id = $1 AND enviado_em > now() - interval '30 days'
    AND tipo NOT IN ('reactionMessage','stickerMessage','protocolMessage','pollUpdateMessage')
  GROUP BY msg_id
)
SELECT (SELECT c.nome FROM chats c WHERE c.chat_id = $1 AND c.origem LIKE 'suporte%' AND c.nome IS NOT NULL LIMIT 1) AS grupo,
  ($1 IN (SELECT chat_id FROM internos)) AS interno,
  COALESCE((SELECT json_agg(json_build_object('texto', y.texto, 'classificacao', e.classificacao)) FROM msgs y
     LEFT JOIN atendimento_estado e ON e.msg_id = y.msg_id
     WHERE NOT y.da_equipe AND y.enviado_em > COALESCE((SELECT max(z.enviado_em) FROM msgs z WHERE z.da_equipe), 'epoch')), '[]'::json) AS pendentes;`,
  options: { queryReplacement: '={{ [ $json.chat ] }}' } } } });

const conferir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Conferir envio', parameters: { jsCode: `const v = $('Validar acesso').first().json;
const g = $input.first().json || {};
const DIRECAO = ['financeiro', 'cancelamento', 'jurídico', 'juridico'];
const SENS = /(R[$]|(^|[^a-z])pix([^a-z]|$)|boleto|reembols|estorn|advogad|procon|reclame aqui|processo judicial|cancelar (o )?contrato|distrato)/i;
const h = DateTime.now().setZone('America/Recife').hour;
let motivo = '';
if (!g.grupo || g.interno) motivo = 'grupo';
else if (v.teste && !/teste/i.test(g.grupo)) motivo = 'grupo';
else if (!v.diretor && (h >= 22 || h < 7)) motivo = 'noite';
else if (!v.diretor && (g.pendentes || []).some(p => { const c = p.classificacao || {}; return (c.sensivel === true && DIRECAO.includes(String(c.tema || '').toLowerCase())) || SENS.test(p.texto || ''); })) motivo = 'direcao';
const nome = String(v.nome || '').split(' ')[0];
// Diretoria sempre sai como Érica. Equipe: conforme ASSINATURA.
const texto = v.diretor || '${ASSINATURA}' === 'erica' ? v.texto + String.fromCharCode(10, 10) + '*Érica, time de suporte, Grupo Euforia*' : '*' + nome + ':* ' + v.texto;
return [{ json: { ok: !motivo, grupo: g.grupo || '', corpo: JSON.stringify({ number: v.chat, text: texto }), resposta: { ok: false, motivo } } }];
` } } });

const podeMandar = ifElse({ version: 2.2, config: { name: 'Pode mandar?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } } });

const mandar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Mandar no grupo', credentials: EVO, parameters: {
  method: 'POST', url: `${BASE}/message/sendText/suporte`, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}', options: SEM_ERRO } } });

const resultado = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Resultado do envio', parameters: { jsCode: `const r = $input.first().json || {};
const v = $('Validar acesso').first().json;
const ok = r.statusCode >= 200 && r.statusCode < 300;
return [{ json: { quando: new Date().toISOString(), nome: v.nome, chat_id: v.chat, grupo: $('Conferir envio').first().json.grupo, texto: v.texto, ok,
  resposta: ok ? { ok: true } : { ok: false, motivo: 'whatsapp' } } }];
` } } });

// Registro de quem mandou o quê (a mensagem sai pelo número do suporte; aqui fica o nome de quem apertou).
const registrar = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Registrar envio', parameters: {
  resource: 'row', operation: 'insert', dataTableId: ENVIOS,
  columns: { mappingMode: 'defineBelow', value: { quando: '={{ $json.quando }}', nome: '={{ $json.nome }}', chat_id: '={{ $json.chat_id }}', grupo: '={{ $json.grupo }}', texto: '={{ $json.texto }}', ok: '={{ $json.ok }}' },
    matchingColumns: [], schema: [
      { id: 'quando', displayName: 'quando', required: false, defaultMatch: false, display: true, type: 'dateTime', canBeUsedToMatch: true },
      { id: 'nome', displayName: 'nome', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
      { id: 'chat_id', displayName: 'chat_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
      { id: 'grupo', displayName: 'grupo', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
      { id: 'texto', displayName: 'texto', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
      { id: 'ok', displayName: 'ok', required: false, defaultMatch: false, display: true, type: 'boolean', canBeUsedToMatch: true }] },
  options: {} } } });

const responderEnvio = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar envio', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($("Resultado do envio").first().json.resposta) }}', options: {} } } });

const devLista = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver lista', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });
const devConversa = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver conversa', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });
const devFoto = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver foto', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });
const recusarEnvio = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar envio', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });
const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Painel da equipe · conversas (V1)\nAba "Conversas" (estilo WhatsApp): lista os grupos de cliente do número do suporte, abre as últimas mensagens e responde dali.\nAções: lista, abrir, midia (foto), mandar. Sai sempre pelo número "suporte"; assinatura conforme ASSINATURA no código. Quem apertou fica na tabela "Painel · conversas enviadas".\nTravas: só grupo de ficha não encerrada (teste só grupo de teste); dinheiro, contrato e jurídico ficam ocultos e bloqueiam a resposta da equipe; nada da equipe sai entre 22h e 7h.', [], { color: 4 });

export default workflow('painel-conversas', 'Painel | Conversas com clientes (V1)')
  .add(pedir).to(ler).to(acesso).to(validar)
  .to(podeSeguir
    .onTrue(ehLista
      .onTrue(buscarLista.to(clientes).to(montarLista).to(devLista))
      .onFalse(ehAbrir
        .onTrue(buscarConversa.to(montarConversa).to(devConversa))
        .onFalse(ehMidia
          .onTrue(buscarMidia.to(baixar).to(montarMidia).to(devFoto))
          .onFalse(conferirGrupo.to(conferir).to(podeMandar
            .onTrue(mandar.to(resultado).to(registrar).to(responderEnvio))
            .onFalse(recusarEnvio))))))
    .onFalse(recusar))
  .add(nota);
