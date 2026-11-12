import { workflow, node, trigger, sticky, languageModel, outputParser } from '@n8n/workflow-sdk';

// Gerente IA | Sombra do fora do horário (05/11/2026). Henrique escolheu "Sombra 1 semana, depois troca":
// a Gerente calcula o que mandaria fora do horário/almoço (mesmas regras do Monitor de respostas ZKssPuYTO3JlJmNH),
// grava em gerente_sombra e NÃO manda nada ao cliente. Em 12/11 comparo com atendimento_estado (o que o Monitor mandou)
// e, com o ok do Henrique, a Gerente assume o envio e o Monitor para essa parte. Arquivar este fluxo depois da troca.
// V2 (12/11, Henrique escolheu "Manter Monitor e corrigir"): a regra sozinha respondia "obrigada/feito"; agora a
// classificação é a mesma do Monitor (Claude Haiku), e a TRAVA por palavra continua como segurança extra.

const PG = { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } };

const cada5 = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada 5 minutos', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } } } });

const candidatos = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Clientes sem resposta', credentials: PG, executeOnce: true, parameters: { operation: 'executeQuery', query: `CREATE TABLE IF NOT EXISTS gerente_sombra (msg_id TEXT PRIMARY KEY, chat_id TEXT, grupo TEXT, acao TEXT, motivo TEXT, texto_cliente TEXT, texto_resposta TEXT, msg_em TIMESTAMPTZ, criado_em TIMESTAMPTZ DEFAULT now());
WITH team AS (
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
  WHERE chat_id LIKE '%@g.us' AND enviado_em > now() - interval '2 days'
  GROUP BY msg_id
),
ult AS (
  SELECT DISTINCT ON (chat_id) * FROM msgs
  WHERE da_equipe OR tipo NOT IN ('reactionMessage','stickerMessage','protocolMessage','pollUpdateMessage')
  ORDER BY chat_id, enviado_em DESC
)
SELECT u.chat_id,
  COALESCE((SELECT c.nome FROM chats c WHERE c.chat_id = u.chat_id AND c.nome IS NOT NULL LIMIT 1), u.chat_id) AS grupo,
  u.msg_id, COALESCE(u.autor_nome, 'Cliente') AS autor, u.tipo, COALESCE(u.texto, '[' || u.tipo || ']') AS texto, u.enviado_em,
  (SELECT string_agg(to_char(x.enviado_em AT TIME ZONE 'America/Recife','DD/MM HH24:MI') || ' ' ||
      CASE WHEN x.da_equipe THEN 'Euforia' ELSE COALESCE(x.autor_nome,'Cliente') END ||
      ': ' || left(COALESCE(x.texto,'['||x.tipo||']'),300), E'\\n' ORDER BY x.enviado_em)
     FROM (SELECT * FROM msgs y WHERE y.chat_id = u.chat_id ORDER BY y.enviado_em DESC LIMIT 10) x) AS contexto,
  EXISTS (SELECT 1 FROM gerente_sombra s WHERE s.chat_id = u.chat_id AND s.acao IN ('fora_horario','fora_urgente')
          AND ((s.criado_em > now() - interval '14 hours'
                AND NOT (EXTRACT(ISODOW FROM s.criado_em AT TIME ZONE 'America/Recife') <= 5 AND EXTRACT(HOUR FROM s.criado_em AT TIME ZONE 'America/Recife') IN (12, 13)))
            OR (s.criado_em > now() - interval '3 hours'
                AND EXTRACT(ISODOW FROM s.criado_em AT TIME ZONE 'America/Recife') <= 5 AND EXTRACT(HOUR FROM s.criado_em AT TIME ZONE 'America/Recife') IN (12, 13)))) AS recente
FROM ult u
WHERE NOT u.da_equipe
  AND u.chat_id NOT IN (SELECT chat_id FROM internos)
  AND u.enviado_em > now() - interval '24 hours'
  AND EXISTS (SELECT 1 FROM chats c WHERE c.chat_id = u.chat_id AND c.origem = 'suporte')
  AND NOT EXISTS (SELECT 1 FROM gerente_sombra s WHERE s.msg_id = u.msg_id)
ORDER BY u.enviado_em
LIMIT 30;`, options: {} } } });

const decidir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Decidir (sombra)', parameters: { jsCode: `const now = DateTime.now().setZone('America/Recife');
const FERIADOS = ['2026-11-20', '2026-12-25', '2027-01-01'];
const diaUtil = d => d.weekday <= 5 && !FERIADOS.includes(d.toISODate());
const ehAlmoco = d => diaUtil(d) && d.hour >= 12 && d.hour < 14;
const ehExpediente = d => diaUtil(d) && d.hour >= 8 && d.hour < 18;
const ehUtil = d => ehExpediente(d) && !ehAlmoco(d);
if (ehUtil(now)) return [];
const madrugada = now.hour >= 22 || now.hour < 7;
const almoco = ehAlmoco(now);
const DIAS = ['', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'];
function retorno() {
  if (almoco) return 'hoje, a partir das 14h,';
  if (diaUtil(now) && now.hour < 8) return 'hoje, a partir das 8h,';
  let d = now.plus({ days: 1 }).startOf('day');
  while (!diaUtil(d)) d = d.plus({ days: 1 });
  const dias = Math.round(d.diff(now.startOf('day'), 'days').days);
  return dias === 1 ? 'amanhã, a partir das 8h,' : 'na ' + DIAS[d.weekday] + ', a partir das 8h,';
}
const ret = retorno();
const out = [];
for (const it of $input.all()) {
  const r = it.json;
  if (!r.msg_id) continue;
  const msg = DateTime.fromJSDate(new Date(r.enviado_em)).setZone('America/Recife');
  const idadeH = now.diff(msg, 'hours').hours;
  const espera = Math.round(now.diff(msg, 'minutes').minutes);
  let quer = false, pendente = false;
  if (!almoco && ehExpediente(msg) && !r.recente && idadeH <= 14) { quer = true; pendente = espera >= 30; }
  else if (!ehUtil(msg) && !r.recente && idadeH <= 12) quer = true;
  if (!quer) continue;
  out.push({ json: { msg_id: r.msg_id, chat_id: r.chat_id, grupo: r.grupo, autor: r.autor, texto: r.texto, contexto: r.contexto, enviado_em: r.enviado_em, pendente, almoco, madrugada, ret } });
}
return out;` } } });

const haiku = languageModel({ type: '@n8n/n8n-nodes-langchain.lmChatAnthropic', version: 1.5, config: { name: 'Claude Haiku', credentials: { anthropicApi: { id: 'NSAFLaAWGkUDHJLn', name: 'Anthropic account' } }, parameters: { model: { __rl: true, mode: 'id', value: 'claude-haiku-4-5' }, options: { maxTokensToSample: 400, temperature: 0 } } } });

const formato = outputParser({ type: '@n8n/n8n-nodes-langchain.outputParserStructured', version: 1.3, config: { name: 'Formato da classificação', parameters: { jsonSchemaExample: '{ "precisa_resposta": true, "sensivel": false, "tema": "entrega", "resumo": "cliente pede o link do vídeo" }' } } });

// Mesmo prompt do Monitor de respostas (atendimento/monitor.js), para a comparação ser justa.
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

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar (sombra)', parameters: { jsCode: `const base = $('Decidir (sombra)').all();
const TRAVA = /r\\$|\\bpix\\b|boleto|pagament|\\bpagar\\b|paguei|cobranc|fatura|nota fiscal|reembols|estorn|parcela|mensalidade|\\bvalor(es)?\\b|desconto|\\bmulta\\b|contrato|cancelar|cancelament|rescis|distrato|advogad|procon|reclame ?aqui|processo|juridic|insatisf|decepcion|absurdo|falar com (o )?respons/;
const sem = s => String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().trim();
const SEM_AUTO = ['120363426418022941@g.us'];
const out = [];
$input.all().forEach((it, i) => {
  const r = base[i].json;
  const c = it.json.output || {};
  const sensivel = c.sensivel === true || TRAVA.test(sem(r.texto));
  let acao, motivo;
  if (c.precisa_resposta === false && !sensivel) { acao = 'ignorar'; motivo = 'IA: não precisa de resposta' + (c.resumo ? ' (' + c.resumo + ')' : ''); }
  else if (sensivel) { acao = r.madrugada ? 'urgente' : 'fora_urgente'; motivo = 'sensível: ' + (c.tema || 'palavra') + (c.resumo ? ' (' + c.resumo + ')' : ''); }
  else { acao = 'fora_horario'; motivo = 'IA: ' + (c.resumo || 'precisa de resposta'); }
  if (r.madrugada && acao === 'fora_horario') return; // como o Monitor: comum fica para depois das 7h
  if (SEM_AUTO.includes(r.chat_id) && acao !== 'ignorar') acao = 'urgente';
  let resposta = '';
  if (acao === 'fora_horario' || acao === 'fora_urgente') resposta = r.almoco ? 'Oi! Recebemos sua mensagem 😊 Nossa equipe está no horário de almoço e, a partir das 14h, damos sequência por aqui.'
    : r.pendente ? 'Oi! Já estamos vendo isso para você. ' + r.ret.charAt(0).toUpperCase() + r.ret.slice(1) + ' te damos o retorno por aqui.'
    : 'Oi! Recebemos sua mensagem 😊 Nossa equipe já encerrou o expediente, mas ' + r.ret + ' damos sequência por aqui. Obrigada pela paciência!';
  out.push({ json: { params: [r.msg_id, r.chat_id, r.grupo, acao, motivo, String(r.texto || '').slice(0, 300), resposta, r.enviado_em] }, pairedItem: { item: i } });
});
return out;` } } });
const gravar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Gravar sombra', credentials: PG, parameters: { operation: 'executeQuery',
  query: 'INSERT INTO gerente_sombra (msg_id, chat_id, grupo, acao, motivo, texto_cliente, texto_resposta, msg_em) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz) ON CONFLICT (msg_id) DO NOTHING RETURNING msg_id;',
  options: { queryReplacement: '={{ $json.params }}' } } } });

const nota = sticky('## Gerente IA · sombra do fora do horário (V2)\nClassificação com Claude Haiku (mesmo prompt do Monitor) + trava por palavra. Só registra (tabela gerente_sombra) o que a Gerente mandaria fora do horário e no almoço. **Não manda nada ao cliente.** O Monitor de respostas continua enviando. Nova comparação ~19/11; depois da troca, arquivar este fluxo.', [decidir], { color: 5 });

export default workflow('gerente-sombra-fora-horario', 'Gerente IA | Sombra do fora do horário (V2)', { executionOrder: 'v1', availableInMCP: true, timezone: 'America/Recife' })
  .add(cada5).to(candidatos).to(decidir).to(classificar).to(montar).to(gravar)
  .add(nota);
