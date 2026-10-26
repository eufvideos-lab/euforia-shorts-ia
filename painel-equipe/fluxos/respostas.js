import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const PG = { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } };
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };
const ACESSO = { __rl: true, mode: 'id', value: 'ilXDZWGAcOjoajx7', cachedResultName: 'Painel equipe · acesso' };

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Fila de respostas do painel', parameters: {
  httpMethod: 'POST', path: 'euforia-painel-respostas', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

const ler = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler pedido', parameters: { jsCode: `const b = ($input.first().json.body) || {};
const u = String(b.u || '').toLowerCase();
return [{ json: { u: /^[0-9a-f]{24}$/.test(u) ? u : 'x', pin: String(b.pin || '').replace(/[^0-9]/g, '').slice(0, 6),
  acao: b.acao === 'dispensar' ? 'dispensar' : 'listar',
  msg: /^[A-Za-z0-9_-]{6,80}$/.test(String(b.msg || '')) ? b.msg : '',
  chat: /^[0-9-]{6,40}@g\\.us$/.test(String(b.chat || '')) ? b.chat : '' } }];
` } } });

const acesso = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Achar pessoa', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: ACESSO, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'token', condition: 'eq', keyValue: '={{ $json.u }}' }] }, limit: 1 } } });

// Só quem atende cliente vê esta fila: Ismael (revisor), Rômulo (calls) e o teste.
const validar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validar acesso', parameters: { jsCode: `const p = $('Ler pedido').first().json;
const r = $input.first().json || {};
const ok = !!r.token && r.token === p.u && r.ativo === true && String(r.pin) === p.pin && ['revisor', 'calls', 'teste', 'diretor'].includes(r.papel);
let motivo = ok ? '' : 'acesso';
if (ok && p.acao === 'dispensar' && (!p.msg || !p.chat)) motivo = 'mensagem';
return [{ json: { ok: !motivo, acao: p.acao, msg: p.msg, chat: p.chat, nome: r.nome || '', diretor: r.papel === 'diretor', resposta: { ok: false, motivo } } }];
` } } });

const podeSeguir = ifElse({ version: 2.2, config: { name: 'Acesso válido?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const ehDispensar = ifElse({ version: 2.2, config: { name: 'Dispensar ou listar?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
  conditions: [{ leftValue: '={{ $json.acao }}', rightValue: 'dispensar', operator: { type: 'string', operation: 'equals' } }],
  combinator: 'and' } } } });

// "Não precisa responder": grava na mesma tabela do Monitor de respostas, que para de alertar sobre essa mensagem.
const dispensar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Marcar como não precisa', credentials: PG, parameters: {
  operation: 'executeQuery',
  query: "INSERT INTO atendimento_estado (msg_id, chat_id, ultima_acao, alerta30_em, acolhimento_em, fora_horario_em, classificacao)\nVALUES ($1, $2, 'ignorar', now(), now(), now(), jsonb_build_object('painel', $3::text))\nON CONFLICT (msg_id) DO UPDATE SET ultima_acao = 'ignorar',\n  classificacao = COALESCE(atendimento_estado.classificacao, '{}'::jsonb) || jsonb_build_object('painel', $3::text)\nRETURNING msg_id;",
  options: { queryReplacement: '={{ [ $json.msg, $json.chat, $json.nome ] }}' } } } });

const okDispensa = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar dispensa', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: true }) }}', options: {} } } });

// Mesma regra do Monitor de respostas: último recado num grupo de cliente do suporte foi do cliente e ninguém da equipe respondeu depois.
const buscar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Clientes esperando resposta', credentials: PG, alwaysOutputData: true, parameters: {
  operation: 'executeQuery',
  query: `WITH team AS (
  SELECT DISTINCT m.autor_jid FROM mensagens m
  WHERE m.chat_id IN (SELECT chat_id FROM chats WHERE nome ILIKE '%pend%ncias%')
    AND NOT m.from_me AND m.autor_jid IS NOT NULL
  UNION SELECT '5581996928808@s.whatsapp.net'
  UNION SELECT '5581995667045@s.whatsapp.net'
),
internos AS (
  SELECT DISTINCT chat_id FROM chats
  WHERE nome ILIKE ANY (ARRAY['%pend%ncias%','%euforia | marketing%','%central de gest%','%sala de guerra%','%teste wo%','%aquecimento%'])
),
msgs AS (
  SELECT msg_id, min(chat_id) AS chat_id, min(enviado_em) AS enviado_em,
         bool_or(from_me) OR bool_or(COALESCE(autor_nome,'') ILIKE '%euforia%') OR bool_or(autor_jid IN (SELECT autor_jid FROM team WHERE autor_jid IS NOT NULL)) AS da_equipe,
         max(autor_nome) AS autor_nome, max(tipo) AS tipo, max(texto) AS texto
  FROM mensagens
  WHERE chat_id LIKE '%@g.us' AND enviado_em > now() - interval '4 days'
  GROUP BY msg_id
),
ult AS (
  SELECT DISTINCT ON (chat_id) * FROM msgs
  WHERE da_equipe OR tipo NOT IN ('reactionMessage','stickerMessage','protocolMessage','pollUpdateMessage')
  ORDER BY chat_id, enviado_em DESC
)
SELECT u.chat_id,
  COALESCE((SELECT c.nome FROM chats c WHERE c.chat_id = u.chat_id AND c.nome IS NOT NULL LIMIT 1), u.chat_id) AS grupo,
  u.msg_id, COALESCE(u.autor_nome, 'Cliente') AS autor, u.tipo,
  COALESCE(u.texto, '[' || u.tipo || ']') AS texto, u.enviado_em,
  (SELECT min(y.enviado_em) FROM msgs y WHERE y.chat_id = u.chat_id AND NOT y.da_equipe
     AND y.enviado_em > COALESCE((SELECT max(z.enviado_em) FROM msgs z WHERE z.chat_id = u.chat_id AND z.da_equipe), 'epoch')) AS esperando_desde,
  (SELECT count(*) FROM msgs y WHERE y.chat_id = u.chat_id AND NOT y.da_equipe
     AND y.enviado_em > COALESCE((SELECT max(z.enviado_em) FROM msgs z WHERE z.chat_id = u.chat_id AND z.da_equipe), 'epoch')) AS qtd,
  (SELECT string_agg(to_char(x.enviado_em AT TIME ZONE 'America/Recife','DD/MM HH24:MI') || ' ' ||
      CASE WHEN x.da_equipe THEN 'Euforia' ELSE COALESCE(x.autor_nome,'Cliente') END ||
      ': ' || left(COALESCE(x.texto,'['||x.tipo||']'),300), E'\\n' ORDER BY x.enviado_em)
     FROM (SELECT * FROM msgs y WHERE y.chat_id = u.chat_id ORDER BY y.enviado_em DESC LIMIT 6) x) AS contexto,
  e.ultima_acao, e.classificacao
FROM ult u
LEFT JOIN atendimento_estado e ON e.msg_id = u.msg_id
WHERE NOT u.da_equipe
  AND u.chat_id NOT IN (SELECT chat_id FROM internos)
  AND EXISTS (SELECT 1 FROM chats c WHERE c.chat_id = u.chat_id AND c.origem LIKE 'suporte%')
  AND (e.msg_id IS NULL OR e.ultima_acao <> 'ignorar')
ORDER BY u.enviado_em
LIMIT 60;`, options: {} } } });

const clientes = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Clientes com grupo', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/3ddc91b406be49e98e630c298d9162d8/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { and: [{ property: "Situação", select: { does_not_equal: "Encerrado" } }, { property: "Grupo WhatsApp (ID)", rich_text: { is_not_empty: true } }] }, page_size: 100 }) }}',
  options: { pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest',
    parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] },
    paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.has_more }}', limitPagesFetched: true, maxRequests: 10 } } } } } });

// Prioridade: sensível, 🔴 atenção, faixa A/B/C, depois quem espera há mais tempo. Assunto de dinheiro, contrato ou jurídico não mostra o texto: é da diretoria.
const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar fila de respostas', parameters: { jsCode: `const Z = 'America/Recife';
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; if (v.formula) return String(v.formula.string || ''); return ''; };
const cli = {};
for (const it of $('Clientes com grupo').all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {};
  const g = txt(pr['Grupo WhatsApp (ID)']).trim();
  if (g) cli[g] = { nome: txt(pr['Cliente']), faixa: txt(pr['Faixa']) || txt(pr['Faixa base']), atencao: !!(pr['🔴 Atenção redobrada'] || {}).checkbox };
}
const agora = DateTime.now().setZone(Z);
const DIRECAO = ['financeiro', 'cancelamento', 'jurídico', 'juridico'];
const itens = [];
for (const it of $('Clientes esperando resposta').all()) {
  const r = it.json;
  if (!r.chat_id || !r.msg_id) continue;
  const c = r.classificacao || {};
  if (c.precisa_resposta === false) continue;
  const k = cli[r.chat_id] || {};
  const desde = DateTime.fromJSDate(new Date(r.esperando_desde || r.enviado_em)).setZone(Z);
  const direcao = c.sensivel === true && DIRECAO.includes(String(c.tema || '').toLowerCase()) && !$('Validar acesso').first().json.diretor;
  itens.push({ chat: r.chat_id, msg: r.msg_id, grupo: r.grupo, cliente: k.nome || '', faixa: k.faixa || '', atencao: !!k.atencao,
    sensivel: c.sensivel === true, direcao, tema: c.tema || '', resumo: direcao ? '' : (c.resumo || ''),
    autor: r.autor, texto: direcao ? '' : String(r.texto || '').slice(0, 400), contexto: direcao ? '' : String(r.contexto || '').slice(0, 1800),
    qtd: Number(r.qtd) || 1, desde: desde.toFormat('dd/MM HH:mm'), espera: Math.max(0, Math.round(agora.diff(desde, 'minutes').minutes)),
    alertado: !!r.ultima_acao });
}
const peso = x => (x.sensivel ? 0 : 10) + (x.atencao ? 0 : 5) + ({ A: 0, B: 1, C: 2 }[x.faixa] ?? 3);
itens.sort((a, b) => peso(a) - peso(b) || b.espera - a.espera);
return [{ json: { resposta: { ok: true, agora: agora.toFormat('HH:mm'), itens } } }];
` } } });

const devolver = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver fila', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Painel da equipe · fila de respostas (V1)\nAba "Responder" do Ismael e do Rômulo: grupos de cliente dos números de suporte (suporte, suporte-ismael, suporte-romulo) em que a última mensagem é do cliente (mesma regra do "Atendimento | Monitor de respostas"). Prioridade: sensível, 🔴 atenção, faixa, tempo de espera.\nDinheiro, cancelamento e jurídico aparecem só como "com a diretoria", sem texto.\n"Não precisa responder" marca ignorar na atendimento_estado (o monitor para de alertar).', [], { color: 4 });

export default workflow('painel-respostas', 'Painel | Fila de respostas (V1)')
  .add(pedir).to(ler).to(acesso).to(validar)
  .to(podeSeguir
    .onTrue(ehDispensar
      .onTrue(dispensar.to(okDispensa))
      .onFalse(buscar.to(clientes).to(montar).to(devolver)))
    .onFalse(recusar))
  .add(nota);
