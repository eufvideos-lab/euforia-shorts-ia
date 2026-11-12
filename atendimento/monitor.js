import { workflow, node, trigger, switchCase, languageModel, outputParser } from '@n8n/workflow-sdk';

// Atendimento | Monitor de respostas (Fase 1), fluxo ZKssPuYTO3JlJmNH. Cópia no repo desde 12/11/2026.
// 12/11 (Henrique escolheu "Manter Monitor e corrigir"): aviso de almoço sai 1 vez por grupo a cada 3h
// (antes repetia a cada mensagem nova do cliente no almoço; Nova Acrópole recebeu 5 em 40 min no dia 10/11).
// Credenciais ficam no n8n (o update pelo MCP mantém as dos nós com o mesmo nome).

const cada5 = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada 5 minutos', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } } } });

const garantir = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Garantir tabela de estado', parameters: { operation: 'executeQuery', options: {},
  query: `CREATE TABLE IF NOT EXISTS atendimento_estado (msg_id TEXT PRIMARY KEY, chat_id TEXT, ultima_acao TEXT, alerta30_em TIMESTAMPTZ, acolhimento_em TIMESTAMPTZ, fora_horario_em TIMESTAMPTZ, classificacao JSONB, criado_em TIMESTAMPTZ DEFAULT now()); CREATE INDEX IF NOT EXISTS idx_atend_chat ON atendimento_estado(chat_id); SELECT 1 AS ok;` } } });

const buscar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Buscar clientes sem resposta', executeOnce: true, parameters: { operation: 'executeQuery', options: {},
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
         max(autor_jid) AS autor_jid, max(autor_nome) AS autor_nome, max(tipo) AS tipo, max(texto) AS texto
  FROM mensagens
  WHERE chat_id LIKE '%@g.us' AND enviado_em > now() - interval '3 days'
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
  (SELECT string_agg(to_char(x.enviado_em AT TIME ZONE 'America/Recife','DD/MM HH24:MI') || ' ' ||
      CASE WHEN x.da_equipe THEN 'Euforia' ELSE COALESCE(x.autor_nome,'Cliente') END ||
      ': ' || left(COALESCE(x.texto,'['||x.tipo||']'),300), E'\\n' ORDER BY x.enviado_em)
     FROM (SELECT * FROM msgs y WHERE y.chat_id = u.chat_id ORDER BY y.enviado_em DESC LIMIT 10) x) AS contexto,
  e.alerta30_em, e.acolhimento_em, e.fora_horario_em,
  EXISTS (SELECT 1 FROM atendimento_estado e2 WHERE e2.chat_id = u.chat_id AND e2.ultima_acao IN ('fora_horario','fora_urgente')
          AND (
            (e2.fora_horario_em > now() - interval '14 hours'
             AND NOT (EXTRACT(ISODOW FROM e2.fora_horario_em AT TIME ZONE 'America/Recife') <= 5 AND EXTRACT(HOUR FROM e2.fora_horario_em AT TIME ZONE 'America/Recife') IN (12, 13)))
            OR (e2.fora_horario_em > now() - interval '3 hours'
             AND EXTRACT(ISODOW FROM e2.fora_horario_em AT TIME ZONE 'America/Recife') <= 5 AND EXTRACT(HOUR FROM e2.fora_horario_em AT TIME ZONE 'America/Recife') IN (12, 13))
          )) AS fora_horario_recente
FROM ult u
LEFT JOIN atendimento_estado e ON e.msg_id = u.msg_id
WHERE NOT u.da_equipe
  AND u.chat_id NOT IN (SELECT chat_id FROM internos)
  AND u.enviado_em > now() - interval '24 hours'
  AND EXISTS (SELECT 1 FROM chats c WHERE c.chat_id = u.chat_id AND c.origem = 'suporte')
  AND (e.msg_id IS NULL OR e.ultima_acao NOT IN ('ignorar','urgente','fora_urgente'))
ORDER BY u.enviado_em
LIMIT 30;` } } });

const decidir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Decidir ação', parameters: { jsCode: `const now = DateTime.now().setZone('America/Recife');
// Feriados sem expediente (AAAA-MM-DD). Para incluir um novo, é só acrescentar na lista.
const FERIADOS = ['2026-10-12', '2026-11-02', '2026-11-20', '2026-12-25', '2027-01-01'];
const ehFeriado = (d) => FERIADOS.includes(d.toISODate());
const diaUtil = (d) => d.weekday <= 5 && !ehFeriado(d);
const ehAlmoco = (d) => diaUtil(d) && d.hour >= 12 && d.hour < 14;
const ehUtil = (d) => diaUtil(d) && d.hour >= 8 && d.hour < 18 && !ehAlmoco(d);
const ehExpediente = (d) => diaUtil(d) && d.hour >= 8 && d.hour < 18;
const agoraUtil = ehUtil(now);
const agoraAlmoco = ehAlmoco(now);
const DIAS = ['', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'];
function textoRetorno() {
  if (agoraAlmoco) return 'hoje, a partir das 14h,';
  if (diaUtil(now) && now.hour < 8) return 'hoje, a partir das 8h,';
  let d = now.plus({ days: 1 }).startOf('day');
  while (!diaUtil(d)) d = d.plus({ days: 1 });
  const dias = Math.round(d.diff(now.startOf('day'), 'days').days);
  if (dias === 1) return 'amanhã, a partir das 8h,';
  const temFeriado = FERIADOS.some(f => f > now.toISODate() && f < d.toISODate());
  if (temFeriado) return 'na ' + DIAS[d.weekday] + ' (' + d.toFormat('dd/MM') + '), a partir das 8h,';
  return 'na ' + DIAS[d.weekday] + ', a partir das 8h,';
}
const retornoPadrao = textoRetorno();
const saida = [];
for (const it of $input.all()) {
  const r = it.json;
  if (!r.msg_id) continue;
  const msg = DateTime.fromJSDate(new Date(r.enviado_em)).setZone('America/Recife');
  const idadeH = now.diff(msg, 'hours').hours;
  const mesmoDia = msg.hasSame(now, 'day');
  let acao = null;
  let espera = 0;
  let pendente = false;
  if (agoraUtil) {
    const abertura = now.set({ hour: 8, minute: 0, second: 0, millisecond: 0 });
    const voltaAlmoco = now.set({ hour: 14, minute: 0, second: 0, millisecond: 0 });
    let ref = msg < abertura ? abertura : msg;
    if (mesmoDia && ehAlmoco(msg) && now >= voltaAlmoco) ref = voltaAlmoco;
    espera = Math.round(now.diff(ref, 'minutes').minutes);
    if (!r.acolhimento_em && espera >= 45 && mesmoDia && !r.fora_horario_em && idadeH <= 24) acao = 'acolhimento45';
    else if (!r.alerta30_em && espera >= 30) acao = 'alerta30';
  } else {
    espera = Math.round(now.diff(msg, 'minutes').minutes);
    if (!agoraAlmoco && ehExpediente(msg) && !r.fora_horario_em && !r.fora_horario_recente && idadeH <= 14) { acao = 'fora_horario'; pendente = espera >= 30; }
    else if (!ehUtil(msg) && !r.fora_horario_em && !r.fora_horario_recente && idadeH <= 12) acao = 'fora_horario';
  }
  if (!acao) continue;
  saida.push({ json: { ...r, acao, espera_min: espera, retorno: retornoPadrao, almoco: agoraAlmoco, pendente } });
}
return saida;` } } });

const haiku = languageModel({ type: '@n8n/n8n-nodes-langchain.lmChatAnthropic', version: 1.5, config: { name: 'Claude Haiku', parameters: { model: { __rl: true, mode: 'id', value: 'claude-haiku-4-5' }, options: { maxTokensToSample: 400, temperature: 0 } } } });

const formato = outputParser({ type: '@n8n/n8n-nodes-langchain.outputParserStructured', version: 1.3, config: { name: 'Formato da classificação', parameters: { jsonSchemaExample: '{ "precisa_resposta": true, "sensivel": false, "tema": "entrega", "resumo": "cliente pede o link do vídeo" }' } } });

const classificar = node({ type: '@n8n/n8n-nodes-langchain.chainLlm', version: 1.9, config: { name: 'Classificar mensagem', parameters: {
  promptType: 'define',
  text: `=Grupo: {{ $json.grupo }}
Últimas mensagens (a mais recente por último):
{{ $json.contexto }}

Última mensagem do cliente ({{ $json.autor }}): {{ $json.texto }}`,
  hasOutputParser: true,
  messages: { messageValues: [{ message: `Você analisa mensagens de clientes de uma empresa de mídia (conteúdo para YouTube e redes sociais) em grupos de WhatsApp. Responda só com o JSON pedido.
- precisa_resposta: true se a última mensagem do cliente pergunta algo, pede algo, cobra algo, envia material que precisa de confirmação ou reclama. false se for só agradecimento, confirmação (ok, boa, combinado, perfeito, obrigado), emoji, parabéns, bom dia sem pedido, ou algo que não espera retorno. Áudio, arquivo ou imagem sem texto: true.
- sensivel: true se envolver dinheiro, pagamento, cobrança, boleto, reembolso, cancelamento, pausa ou rescisão do contrato, ameaça jurídica (advogado, processo, Procon, Reclame Aqui), reclamação forte, irritação clara ou pedido para falar com uma pessoa ou responsável.
- tema: uma palavra (entrega, prazo, dúvida, material, financeiro, cancelamento, reclamação, outro).
- resumo: até 15 palavras em português dizendo o que o cliente quer.` }] },
  batching: {} },
  subnodes: { model: haiku, outputParser: formato } } });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar resultado', parameters: { jsCode: `const base = $('Decidir ação').all();
const assinatura = '\\n\\n*Érica, time de suporte, Grupo Euforia*';
const LIMITE_ENVIOS = 3;
// Madrugada (22h às 7h): o suporte não manda mensagem automática; só o alerta no Discord.
const horaAgora = DateTime.now().setZone('America/Recife').hour;
const madrugada = horaAgora >= 22 || horaAgora < 7;
const sorteia = (lista) => lista[Math.floor(Math.random() * lista.length)];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const acolhimentos = [
  'Oi! Recebemos sua mensagem e a equipe já está verificando por aqui. Em breve te retornamos 😊',
  'Olá! Sua mensagem chegou certinho. Já estamos olhando isso com a equipe e logo voltamos com o retorno.',
  'Oi, tudo bem? Já vimos sua mensagem e a equipe está cuidando disso. Te damos um retorno em breve por aqui.',
  'Olá! Obrigada pela mensagem. O time já está verificando e em breve respondemos por aqui 😊',
  'Oi! Sua mensagem chegou e já passamos para a pessoa responsável. Em breve te retornamos por aqui 😊',
  'Olá! Já estamos vendo isso por aqui e logo voltamos com o retorno.',
  'Oi, tudo bem? Recebemos sua mensagem e a equipe já está cuidando. Em breve respondemos por aqui.',
  'Olá! Obrigada por avisar 😊 O time já está verificando e te dá um retorno em breve.'
];
const foraHorario = (ret) => [
  'Oi! Recebemos sua mensagem 😊 Nossa equipe já encerrou o expediente, mas ' + ret + ' damos sequência por aqui. Obrigada pela paciência!',
  'Olá! Sua mensagem chegou certinho. Nosso time está fora do expediente agora, e ' + ret + ' retomamos o atendimento por aqui.',
  'Oi, tudo bem? Já registramos sua mensagem. Nosso expediente se encerrou, mas ' + ret + ' a equipe te responde por aqui.',
  'Olá! Obrigada pela mensagem 😊 A equipe está fora do horário de atendimento agora, e ' + ret + ' damos continuidade por aqui.',
  'Oi! Sua mensagem chegou 😊 Estamos fora do horário de atendimento agora, mas ' + ret + ' a equipe te responde por aqui.',
  'Olá! Obrigada por escrever. Nosso expediente já terminou e ' + ret + ' retomamos seu atendimento por aqui.',
  'Oi, tudo bem? Registramos sua mensagem 😊 ' + cap(ret) + ' nossa equipe dá continuidade por aqui.',
  'Olá! Recebemos sua mensagem. Neste momento a equipe está fora do expediente, e ' + ret + ' te retornamos por aqui.'
];
const pendenteDia = (ret) => [
  'Oi! Já estamos vendo isso para você. ' + cap(ret) + ' te damos o retorno por aqui.'
];
const almoco = [
  'Oi! Recebemos sua mensagem 😊 Nossa equipe está no horário de almoço e, a partir das 14h, damos sequência por aqui.',
  'Olá! Sua mensagem chegou certinho. Estamos em horário de almoço e retomamos o atendimento às 14h.',
  'Oi, tudo bem? Já registramos sua mensagem. A equipe saiu para o almoço e, a partir das 14h, te responde por aqui.',
  'Olá! Obrigada pela mensagem 😊 Voltamos do almoço às 14h e damos continuidade por aqui.',
  'Oi! Sua mensagem chegou 😊 A equipe está em pausa para o almoço e às 14h te responde por aqui.',
  'Olá! Obrigada pela mensagem. Estamos no intervalo de almoço e retomamos às 14h.',
  'Oi, tudo bem? Registramos sua mensagem. Às 14h a equipe volta do almoço e dá sequência por aqui 😊'
];
let envios = 0;
const saida = [];
$input.all().forEach((it, i) => {
  const b = base[i].json;
  const c = it.json.output || {};
  const precisa = c.precisa_resposta !== false;
  const sensivel = c.sensivel === true;
  let acao_final = 'ignorar';
  if (precisa) {
    if (b.acao === 'fora_horario') acao_final = sensivel ? 'fora_urgente' : 'fora_horario';
    else if (sensivel) acao_final = 'urgente';
    else if (b.acao === 'acolhimento45') acao_final = 'acolher45';
    else acao_final = 'alerta30';
  }
  // Madrugada: comum fica para depois das 7h (não registra agora); sensível vira só alerta no Discord.
  if (madrugada && acao_final === 'fora_horario') return;
  if (madrugada && acao_final === 'fora_urgente') acao_final = 'urgente';
  // Grupos sem mensagem automática para o cliente (só alerta para a equipe)
  const SEM_AUTO = ['120363426418022941@g.us'];
  if (SEM_AUTO.includes(b.chat_id) && acao_final !== 'ignorar') acao_final = 'urgente';
  const vaiWhatsapp = acao_final === 'acolher45' || acao_final === 'fora_horario' || acao_final === 'fora_urgente';
  if (vaiWhatsapp) {
    if (envios >= LIMITE_ENVIOS) return;
    envios++;
  }
  const trecho = String(b.texto || '').slice(0, 300);
  const resumo = c.resumo || '';
  let discord = '';
  if (acao_final === 'alerta30') discord = '⏰ **' + b.grupo + '** está sem resposta há ' + b.espera_min + ' min\\n> ' + b.autor + ': ' + trecho + '\\n📝 ' + resumo;
  if (acao_final === 'acolher45') discord = '🤖 **' + b.grupo + '**: sem resposta há ' + b.espera_min + ' min. A Érica mandou uma mensagem de acolhimento, mas o cliente ainda precisa da resposta.\\n> ' + b.autor + ': ' + trecho + '\\n📝 ' + resumo;
  if (acao_final === 'urgente') discord = '🔴 @here **ATENÇÃO: ' + b.grupo + '** (' + (c.tema || 'sensível') + ')\\n> ' + b.autor + ': ' + trecho + '\\n📝 ' + resumo + '\\nAssunto sensível: precisa de uma pessoa da equipe. A IA não respondeu o cliente.';
  if (acao_final === 'fora_urgente') discord = '🔴 @here **ATENÇÃO (fora do horário): ' + b.grupo + '** (' + (c.tema || 'sensível') + ')\\n> ' + b.autor + ': ' + trecho + '\\n📝 ' + resumo + '\\nAssunto sensível: a Érica mandou só a mensagem automática de retorno. Precisa de uma pessoa da equipe logo cedo.';
  let whatsapp = '';
  if (acao_final === 'acolher45') whatsapp = sorteia(acolhimentos) + assinatura;
  if (acao_final === 'fora_horario' || acao_final === 'fora_urgente') whatsapp = sorteia(b.almoco ? almoco : (b.pendente ? pendenteDia(b.retorno) : foraHorario(b.retorno))) + assinatura;
  const digitando_ms = 4000 + Math.floor(Math.random() * 5000);
  saida.push({ json: { chat_id: b.chat_id, grupo: b.grupo, msg_id: b.msg_id, acao: b.acao, acao_final, pendente: b.pendente === true, espera_min: b.espera_min, discord_msg: discord, whatsapp_texto: whatsapp, digitando_ms, classificacao: c }, pairedItem: { item: i } });
});
return saida;` } } });

const registrar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Registrar estado', parameters: { operation: 'executeQuery',
  query: `INSERT INTO atendimento_estado (msg_id, chat_id, ultima_acao, alerta30_em, acolhimento_em, fora_horario_em, classificacao)
VALUES ($1, $2, $3::text,
  CASE WHEN $3::text IN ('alerta30','urgente','acolher45','ignorar','fora_urgente') THEN now() END,
  CASE WHEN $3::text IN ('acolher45','urgente','ignorar') THEN now() END,
  CASE WHEN $3::text IN ('fora_horario','fora_urgente','ignorar') THEN now() END,
  $4::jsonb)
ON CONFLICT (msg_id) DO UPDATE SET
  ultima_acao = EXCLUDED.ultima_acao,
  alerta30_em = COALESCE(atendimento_estado.alerta30_em, EXCLUDED.alerta30_em),
  acolhimento_em = COALESCE(atendimento_estado.acolhimento_em, EXCLUDED.acolhimento_em),
  fora_horario_em = COALESCE(atendimento_estado.fora_horario_em, EXCLUDED.fora_horario_em),
  classificacao = EXCLUDED.classificacao
RETURNING msg_id, ultima_acao;`,
  options: { queryReplacement: '={{ [ $json.msg_id, $json.chat_id, $json.acao_final, JSON.stringify($json.classificacao || {}) ] }}' } } } });

const qual = switchCase({ version: 3.4, config: { name: 'Qual ação?', parameters: { rules: { values: [
  { outputKey: 'alerta30', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 1 }, conditions: [{ leftValue: "={{ $('Montar resultado').item.json.acao_final }}", operator: { type: 'string', operation: 'equals' }, rightValue: 'alerta30' }], combinator: 'and' } },
  { outputKey: 'urgente', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 1 }, conditions: [{ leftValue: "={{ $('Montar resultado').item.json.acao_final }}", operator: { type: 'string', operation: 'equals' }, rightValue: 'urgente' }], combinator: 'and' } },
  { outputKey: 'acolher45', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 1 }, conditions: [{ leftValue: "={{ $('Montar resultado').item.json.acao_final }}", operator: { type: 'string', operation: 'equals' }, rightValue: 'acolher45' }], combinator: 'and' } },
  { outputKey: 'fora_horario', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 1 }, conditions: [{ leftValue: "={{ $('Montar resultado').item.json.acao_final }}", operator: { type: 'string', operation: 'equals' }, rightValue: 'fora_horario' }], combinator: 'and' } },
  { outputKey: 'fora_urgente', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 1 }, conditions: [{ leftValue: "={{ $('Montar resultado').item.json.acao_final }}", operator: { type: 'string', operation: 'equals' }, rightValue: 'fora_urgente' }], combinator: 'and' } }
] }, options: {} } } });

const d30 = node({ type: 'n8n-nodes-base.discord', version: 2, config: { name: 'Discord: alerta 30 min', onError: 'continueRegularOutput', parameters: { authentication: 'webhook', content: "={{ $('Montar resultado').item.json.discord_msg }}", options: {} } } });
const dUrg = node({ type: 'n8n-nodes-base.discord', version: 2, config: { name: 'Discord: urgente', onError: 'continueRegularOutput', parameters: { authentication: 'webhook', content: "={{ $('Montar resultado').item.json.discord_msg }}", options: {} } } });
const d45 = node({ type: 'n8n-nodes-base.discord', version: 2, config: { name: 'Discord: acolhido aos 45 min', onError: 'continueRegularOutput', parameters: { authentication: 'webhook', content: "={{ $('Montar resultado').item.json.discord_msg }}", options: {} } } });
const dSens = node({ type: 'n8n-nodes-base.discord', version: 2, config: { name: 'Discord: sensível fora do horário', onError: 'continueRegularOutput', parameters: { authentication: 'webhook', content: "={{ $('Montar resultado').item.json.discord_msg }}", options: {} } } });
const z45 = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'WhatsApp: acolhimento 45 min', onError: 'continueRegularOutput', parameters: { method: 'POST', url: 'https://api.grupoeuforia.tech/message/sendText/suporte', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json', jsonBody: "={{ JSON.stringify({ number: $('Montar resultado').item.json.chat_id, text: $('Montar resultado').item.json.whatsapp_texto, delay: $('Montar resultado').item.json.digitando_ms }) }}", options: { batching: { batch: { batchSize: 1, batchInterval: 35000 } }, timeout: 30000 } } } });
const zFora = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'WhatsApp: fora do horário', onError: 'continueRegularOutput', parameters: { method: 'POST', url: 'https://api.grupoeuforia.tech/message/sendText/suporte', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json', jsonBody: "={{ JSON.stringify({ number: $('Montar resultado').item.json.chat_id, text: $('Montar resultado').item.json.whatsapp_texto, delay: $('Montar resultado').item.json.digitando_ms }) }}", options: { batching: { batch: { batchSize: 1, batchInterval: 35000 } }, timeout: 30000 } } } });
const zSens = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'WhatsApp: fora do horário (sensível)', onError: 'continueRegularOutput', parameters: { method: 'POST', url: 'https://api.grupoeuforia.tech/message/sendText/suporte', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json', jsonBody: "={{ JSON.stringify({ number: $('Montar resultado').item.json.chat_id, text: $('Montar resultado').item.json.whatsapp_texto, delay: $('Montar resultado').item.json.digitando_ms }) }}", options: { batching: { batch: { batchSize: 1, batchInterval: 35000 } }, timeout: 30000 } } } });

export default workflow('atendimento-monitor', 'Atendimento | Monitor de respostas (Fase 1)', { executionOrder: 'v1', availableInMCP: true, binaryMode: 'separate' })
  .add(cada5).to(garantir).to(buscar).to(decidir).to(classificar).to(montar).to(registrar)
  .to(qual
    .onCase(0, d30)
    .onCase(1, dUrg)
    .onCase(2, z45.to(d45))
    .onCase(3, zFora)
    .onCase(4, zSens.to(dSens)));
