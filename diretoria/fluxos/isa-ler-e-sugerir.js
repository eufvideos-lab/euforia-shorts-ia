import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

// Isa | Ler e sugerir (V1): lê o privado do WhatsApp administrativo (instância isabela), sugere ação e resposta
// para o Henrique aprovar no Painel Central (aba Isa) e alerta no #alertas-diretoria o que é sério. NADA é enviado daqui.
const PG = { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } };
const DISCORD = { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } };
const ANTHROPIC = { anthropicApi: { id: 'NSAFLaAWGkUDHJLn', name: 'Anthropic account' } };
const CANAL = '1567875379979620474'; // #alertas-diretoria

const cada2 = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada 2 minutos', parameters: {
  rule: { interval: [{ field: 'minutes', minutesInterval: 2 }] } } } });

const conversas = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Conversas esperando', credentials: PG, executeOnce: true, parameters: {
  operation: 'executeQuery',
  query: `CREATE TABLE IF NOT EXISTS isa_lote (chat_id TEXT PRIMARY KEY, ate TIMESTAMPTZ, atualizado_em TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS isa_sugestoes (id SERIAL PRIMARY KEY, criado_em TIMESTAMPTZ DEFAULT now(), chat_id TEXT, contato TEXT, quem TEXT,
  gravidade TEXT, categoria TEXT, resumo TEXT, acao TEXT, texto TEXT, primeira_cliente TIMESTAMPTZ, ultima_cliente TIMESTAMPTZ, mensagens TEXT, contexto TEXT,
  status TEXT DEFAULT 'aguardando', texto_final TEXT, decidido_em TIMESTAMPTZ, enviado_em TIMESTAMPTZ, alertado_em TIMESTAMPTZ, lembrete_em TIMESTAMPTZ, nota TEXT);
ALTER TABLE isa_sugestoes ADD COLUMN IF NOT EXISTS tarefa TEXT, ADD COLUMN IF NOT EXISTS todo_id TEXT;
UPDATE isa_sugestoes SET status = 'arquivada', decidido_em = now(), nota = 'fora da Isa' WHERE status = 'aguardando' AND chat_id IN ('558195231886@s.whatsapp.net');
WITH r AS (UPDATE isa_sugestoes SET status = 'refeita', decidido_em = now() WHERE status = 'aguardando' AND tarefa IS NULL RETURNING chat_id)
DELETE FROM isa_lote WHERE chat_id IN (SELECT chat_id FROM r);
UPDATE isa_sugestoes s SET status = 'respondida_fora', decidido_em = now()
WHERE s.status = 'aguardando' AND EXISTS (SELECT 1 FROM mensagens m WHERE m.chat_id = s.chat_id AND m.origem = 'isabela' AND m.from_me AND m.enviado_em > s.ultima_cliente);
WITH priv AS (
  SELECT DISTINCT ON (msg_id) msg_id, chat_id, from_me, autor_nome, tipo, texto, enviado_em
  FROM mensagens
  WHERE origem = 'isabela' AND NOT COALESCE(is_group, false) AND chat_id NOT LIKE '%@g.us' AND chat_id NOT LIKE '%broadcast%'
    AND chat_id NOT IN ('558195231886@s.whatsapp.net') -- Diogo (equipe): fora da Isa, pedido do Henrique 05/11
    AND enviado_em > now() - interval '12 days'
    AND tipo NOT IN ('reactionMessage','protocolMessage','pollUpdateMessage','stickerMessage')
  ORDER BY msg_id, enviado_em
),
ult AS (
  SELECT chat_id, max(enviado_em) FILTER (WHERE from_me) AS ult_isa, max(enviado_em) FILTER (WHERE NOT from_me) AS ult_cli, max(enviado_em) AS ult
  FROM priv GROUP BY chat_id
),
pend AS (
  SELECT u.* FROM ult u LEFT JOIN isa_lote l ON l.chat_id = u.chat_id
  WHERE u.ult_cli IS NOT NULL AND (u.ult_isa IS NULL OR u.ult_cli > u.ult_isa)
    AND u.ult_cli > COALESCE(l.ate, now() - interval '10 days')
    AND u.ult < now() - interval '2 minutes'
)
SELECT p.chat_id,
  COALESCE((SELECT c.nome FROM chats c WHERE c.chat_id = p.chat_id AND c.nome IS NOT NULL AND c.nome <> '' ORDER BY (c.origem = 'isabela') DESC LIMIT 1), split_part(p.chat_id, '@', 1)) AS contato,
  p.ult_cli AS ultima,
  (SELECT min(x.enviado_em) FROM priv x WHERE x.chat_id = p.chat_id AND NOT x.from_me AND x.enviado_em > COALESCE(p.ult_isa, '-infinity'::timestamptz)) AS primeira,
  (SELECT count(*) FROM priv x WHERE x.chat_id = p.chat_id AND NOT x.from_me AND x.enviado_em > COALESCE(p.ult_isa, '-infinity'::timestamptz)) AS qtd,
  (SELECT string_agg(to_char(x.enviado_em AT TIME ZONE 'America/Recife', 'DD/MM HH24:MI') || ' Contato: ' || left(COALESCE(x.texto, '[' || x.tipo || ']'), 700), E'\\n' ORDER BY x.enviado_em)
     FROM (SELECT * FROM priv y WHERE y.chat_id = p.chat_id AND NOT y.from_me AND y.enviado_em > COALESCE(p.ult_isa, '-infinity'::timestamptz) ORDER BY y.enviado_em DESC LIMIT 15) x) AS textos,
  (SELECT string_agg(to_char(x.enviado_em AT TIME ZONE 'America/Recife', 'DD/MM HH24:MI') || CASE WHEN x.from_me THEN ' Isabela (Euforia): ' ELSE ' Contato: ' END || left(COALESCE(x.texto, '[' || x.tipo || ']'), 500), E'\\n' ORDER BY x.enviado_em)
     FROM (SELECT * FROM priv y WHERE y.chat_id = p.chat_id AND y.enviado_em <= COALESCE(p.ult_isa, '-infinity'::timestamptz) ORDER BY y.enviado_em DESC LIMIT 12) x) AS contexto
FROM pend p
ORDER BY p.ult_cli
LIMIT 6;`, options: {} } } });

const preparar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Preparar pedido', parameters: { jsCode: `const NL = String.fromCharCode(10);
// Números da equipe e do advogado (mesma lista do Avisos VIP).
const EQUIPE = ['8198809439', '7998951723', '8198857489', '8199389101', '8196657296', '8196864164', '8199253989', '8197883850', '8196928808', '8195667045'];
const ADVOGADO = ['8189039320'];
const sem = s => String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
const so = s => String(s || '').split('@')[0].replace(/\\D/g, '');
const tira9 = d => d.length === 13 && d.startsWith('55') ? d.slice(2, 4) + d.slice(5) : d.length === 12 && d.startsWith('55') ? d.slice(2) : d;
const TRAVA = /rescis|distrato|cancelar|cancelament|quero sair|encerrar (o )?contrato|nao quero mais|advogad|procon|reclame ?aqui|processar|processo|justica|juridic|notificacao|danos morais|reembols|estorn|chargeback|golpe|enganad|absurdo|descaso|inaceitavel|sem resposta|ninguem responde|nenhum retorno|algum retorno/;
const agora = DateTime.now().setZone('America/Recife');
let util = agora.plus({ days: 1 }); while (util.weekday > 5) util = util.plus({ days: 1 });
const PRAZO = util.setLocale('pt-BR').toFormat("cccc (dd/MM)");
const SYSTEM = [
'Você é a Isa, assistente da diretoria do Grupo Euforia, empresa de mídia que cria e cuida do ecossistema digital (YouTube e redes sociais) de especialistas.',
'Você lê as mensagens que chegaram no WhatsApp ADMINISTRATIVO da empresa (a "Isabela", que cuida de financeiro, contratos, cobrança e assuntos sérios) e sugere à diretoria o que fazer e um rascunho de resposta. Nada é enviado sem a diretoria aprovar.',
'Responda SÓ com um JSON válido, sem nenhum texto fora dele, neste formato:',
'{"gravidade":"normal","categoria":"duvida","resumo":"...","acao":"...","precisa_resposta":true,"resposta":"...","tarefa":"..."}',
'',
'gravidade:',
'- serio: pedido de rescisão, cancelamento, pausa ou distrato; ameaça; advogado, Procon, Reclame Aqui, processo ou notificação; cliente irritado, inseguro com o contrato ou querendo rever termos; reclamação de qualidade; reembolso ou estorno; cobrança contestada; contato cobrando retorno que não recebeu.',
'- atencao: pagamento, comprovante, Pix, boleto, nota fiscal, renovação, contrato sem conflito, documento a assinar, prazo combinado.',
'- normal: cumprimento, dúvida simples, agradecimento, recado.',
'categoria (uma só): rescisao, cancelamento, juridico, reclamacao, renegociacao, cobranca, pagamento, nota_fiscal, contrato, documento, equipe, duvida, agradecimento, outro.',
'resumo: uma frase curta do que a pessoa quer, sem valores em reais nem dados pessoais.',
'acao: o que a diretoria deve fazer, em 1 ou 2 frases práticas (ex.: "Levar ao Dr. Rinaldo antes de responder", "Confirmar o recebimento no extrato e agradecer").',
'tarefa: se a resposta compromete a Euforia a fazer algo (enviar documento, emitir nota fiscal, formalizar proposta, enviar contrato, conferir pagamento, levar um ponto à direção), escreva a tarefa curta para o to-do da diretoria, começando com verbo e com o que for preciso para fazê-la (ex.: "Enviar a formalização da renovação para o e-mail financeiro informado pela cliente"). Se não houver nada a fazer, "".',
'precisa_resposta: false se a última mensagem não pede resposta (ex.: só "obrigada", emoji, ok) ou se o assunto é jurídico.',
'',
'Regras da resposta (rascunho em nome da Isabela, do time administrativo):',
'- Português do Brasil, cordial, curta (até 5 linhas), tratando a pessoa pelo primeiro nome quando souber. NÃO coloque assinatura: ela é adicionada depois.',
'- Nunca cite Henrique, Flau ou qualquer nome da direção; diga "a direção" quando precisar.',
'- Diga "ecossistema digital", nunca "canal".',
'- Nunca admita falha, erro, atraso ou descaso; não peça desculpas por erro. Pode agradecer a paciência. Mudanças são apresentadas como melhoria boa para os dois lados.',
'- Nunca invente nem prometa valor, data, prazo, desconto, multa, reembolso, condição ou decisão que não esteja escrita nas mensagens. Quando a decisão for da direção, diga que vai levar o ponto à direção e retorna por aqui.',
'- Prazo: nunca prometa "agora", "agora mesmo", "hoje", "ainda hoje" nem "em instantes". Quando a Euforia tiver que entregar algo (documento, nota fiscal, formalização, contrato, retorno da direção), o prazo é o próximo dia útil: escreva "até ' + PRAZO + '".',
'- Nunca diga que um pagamento foi recebido ou confirmado: diga que o comprovante chegou e que o financeiro vai conferir.',
'- Rescisão, cancelamento ou renegociação: acolha, diga que o pedido foi registrado e levado à direção e que retorna por escrito; não aceite nem recuse.',
'- Jurídico (advogado, Procon, Reclame Aqui, processo, notificação): precisa_resposta=false e resposta vazia; a diretoria fala com o advogado antes.',
'- Nunca peça nem repita senha, cartão, conta ou documento pessoal.',
'- Se for alguém da equipe falando de pagamento dela: resposta curta e neutra, sem citar valores de outras pessoas.'
].join(NL);
return $input.all().filter(it => it.json.chat_id).map(it => {
  const r = it.json;
  const d = tira9(so(r.chat_id));
  const quem = EQUIPE.includes(d) ? 'equipe' : ADVOGADO.includes(d) ? 'advogado' : 'contato';
  const trava = TRAVA.test(sem(r.textos));
  const horas = Math.max(0, agora.diff(DateTime.fromJSDate(new Date(r.primeira || r.ultima)), 'hours').hours);
  const user = 'Contato: ' + r.contato + (quem === 'equipe' ? ' (pessoa da EQUIPE da Euforia)' : quem === 'advogado' ? ' (advogado da empresa)' : '') + NL +
    'Hoje é ' + agora.setLocale('pt-BR').toFormat('cccc dd/MM/yyyy HH:mm') + '. A primeira mensagem sem resposta foi há ' + Math.round(horas) + ' hora(s).' + NL + NL +
    'Conversa anterior (contexto):' + NL + (r.contexto || '(sem histórico recente)') + NL + NL +
    'Mensagens novas, ainda sem resposta:' + NL + r.textos;
  return { json: { ...r, quem, trava, horas, corpo: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 900, temperature: 0.2, system: SYSTEM, messages: [{ role: 'user', content: user }] }) } };
});` } } });

const claude = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Sugerir (Claude)', credentials: ANTHROPIC, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://api.anthropic.com/v1/messages', authentication: 'predefinedCredentialType', nodeCredentialType: 'anthropicApi',
  sendHeaders: true, headerParameters: { parameters: [{ name: 'anthropic-version', value: '2023-06-01' }] },
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}',
  options: { batching: { batch: { batchSize: 1, batchInterval: 500 } }, timeout: 90000 } } } });

const ler = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler sugestão', parameters: { jsCode: `const GRAV = ['normal', 'atencao', 'serio'];
const linhas = [];
$input.all().forEach((it, i) => {
  const b = $('Preparar pedido').itemMatching(i).json;
  let s = {};
  try { const t = ((it.json.content || [])[0] || {}).text || ''; s = JSON.parse((t.match(/\\{[\\s\\S]*\\}/) || ['{}'])[0]); } catch (e) { s = {}; }
  let grav = GRAV.includes(s.gravidade) ? s.gravidade : 'atencao';
  if (b.trava) grav = 'serio';
  if (!s.resumo) grav = grav === 'normal' ? 'atencao' : grav; // sem leitura da IA: não deixar passar como normal
  const juridico = s.categoria === 'juridico';
  let texto = String(s.resposta || '').trim();
  texto = texto.replace(/\\bcanal\\b/gi, 'ecossistema digital').replace(/\\bcanais\\b/gi, 'ecossistemas digitais');
  if (/henrique|\\bflau\\b/i.test(texto)) texto = texto.replace(/henrique|\\bflau\\b/gi, 'a direção');
  texto = texto.replace(/\\*?isabela, time administrativo, grupo euforia\\*?/gi, '').trim();
  if (juridico || s.precisa_resposta === false) texto = juridico ? '' : texto;
  linhas.push({ chat_id: b.chat_id, contato: b.contato, quem: b.quem, gravidade: grav, categoria: String(s.categoria || 'outro').slice(0, 40),
    resumo: String(s.resumo || 'Não consegui ler a conversa; abra e veja.').replace(/r\\$\\s*[\\d.,]+/gi, '[valor]').slice(0, 300),
    acao: String(s.acao || '').slice(0, 400) + (s.precisa_resposta === false && !juridico ? ' (a Isa acha que não precisa responder)' : ''),
    status: grav === 'normal' && s.precisa_resposta === false ? 'arquivada' : 'aguardando',
    tarefa: String(s.tarefa || '').trim().slice(0, 300), texto: texto.slice(0, 1500), primeira_cliente: b.primeira, ultima_cliente: b.ultima, mensagens: String(b.textos || '').slice(-4000), contexto: String(b.contexto || '').slice(-3000) });
});
return [{ json: { linhas: JSON.stringify(linhas) } }];` } } });

const gravar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Gravar sugestões', credentials: PG, executeOnce: true, parameters: {
  operation: 'executeQuery',
  query: `WITH x AS (SELECT * FROM json_to_recordset($1::json) AS x(chat_id text, contato text, quem text, gravidade text, categoria text, resumo text, acao text, texto text, tarefa text,
    primeira_cliente timestamptz, ultima_cliente timestamptz, mensagens text, contexto text, status text)),
velhas AS (UPDATE isa_sugestoes s SET status = 'substituida', decidido_em = now() FROM x WHERE s.chat_id = x.chat_id AND s.status = 'aguardando' RETURNING s.id),
lote AS (INSERT INTO isa_lote (chat_id, ate, atualizado_em) SELECT chat_id, ultima_cliente, now() FROM x
  ON CONFLICT (chat_id) DO UPDATE SET ate = GREATEST(isa_lote.ate, EXCLUDED.ate), atualizado_em = now() RETURNING chat_id)
INSERT INTO isa_sugestoes (chat_id, contato, quem, gravidade, categoria, resumo, acao, texto, tarefa, primeira_cliente, ultima_cliente, mensagens, contexto, status, decidido_em)
SELECT chat_id, contato, quem, gravidade, categoria, resumo, acao, texto, COALESCE(tarefa, ''), primeira_cliente, ultima_cliente, mensagens, contexto, COALESCE(status, 'aguardando'), CASE WHEN status = 'arquivada' THEN now() END FROM x
RETURNING id, chat_id, contato, quem, gravidade, categoria, resumo, acao, primeira_cliente, mensagens, (SELECT count(*) FROM velhas) AS substituidas, (SELECT count(*) FROM lote) AS lotes;`,
  options: { queryReplacement: '={{ [ $json.linhas ] }}' } } } });

const alertas = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar alertas', parameters: { jsCode: `const NL = String.fromCharCode(10);
const mascara = s => String(s || '').replace(/r\\$\\s*[\\d.,]+(\\s*(mil|k))?/gi, '[valor]').replace(/\\b\\d{1,3}(\\.\\d{3})+(,\\d{1,2})?\\b/g, '[valor]').replace(/https?:\\/\\/\\S+/g, '[link]').replace(/\\b\\d{8,}\\b/g, '[número]');
const agora = DateTime.now().setZone('America/Recife');
const fmt = h => h >= 48 ? Math.floor(h / 24) + ' dias' : h >= 1 ? Math.floor(h) + 'h' : Math.round(h * 60) + ' min';
const CAT = { rescisao: 'rescisão', cancelamento: 'cancelamento', juridico: 'jurídico', reclamacao: 'reclamação', renegociacao: 'renegociação', cobranca: 'cobrança', pagamento: 'pagamento', nota_fiscal: 'nota fiscal' };
return $input.all().filter(it => it.json.id && it.json.gravidade === 'serio').map(it => {
  const r = it.json;
  const desde = DateTime.fromJSDate(new Date(r.primeira_cliente)).setZone('America/Recife');
  const h = agora.diff(desde, 'hours').hours;
  const trecho = String(r.mensagens || '').split(NL).slice(-3).map(l => '> ' + mascara(l).slice(0, 220)).join(NL);
  const t = '🚨 **Isa · assunto sério** · **' + r.contato + '**' + (r.quem === 'equipe' ? ' (equipe)' : '') + ' · ' + (CAT[r.categoria] || r.categoria) + NL +
    'Esperando resposta desde ' + desde.toFormat('dd/MM HH:mm') + ' (' + fmt(h) + ')' + NL + trecho + NL +
    '**Resumo:** ' + mascara(r.resumo) + NL + '**Sugestão:** ' + mascara(r.acao) + NL +
    'Decida no Painel Central › Minha mesa › **Isa** (#' + r.id + '). Nada sai sem você.';
  return { json: { id: r.id, corpo: JSON.stringify({ content: t.slice(0, 1950), allowed_mentions: { parse: [] } }) } };
});` } } });

const postar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Alertar no #alertas-diretoria', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://discord.com/api/v10/channels/' + CANAL + '/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}', options: { batching: { batch: { batchSize: 1, batchInterval: 1200 } } } } } });

const marcar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Marcar alertado', credentials: PG, parameters: {
  operation: 'executeQuery', query: 'UPDATE isa_sugestoes SET alertado_em = now() WHERE id = $1::int RETURNING id;',
  options: { queryReplacement: "={{ [ $('Montar alertas').itemMatching($itemIndex).json.id ] }}" } } } });

// ---------- Lembrete: assunto sério ainda sem decisão ----------
const cada30 = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'Lembrete (30 min, 8h-19h)', parameters: {
  rule: { interval: [{ field: 'cronExpression', expression: '*/30 8-19 * * 1-6' }] } } } });

const atrasadas = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Sérios parados', credentials: PG, executeOnce: true, parameters: {
  operation: 'executeQuery',
  query: `UPDATE isa_sugestoes SET lembrete_em = now()
WHERE status = 'aguardando' AND lembrete_em IS NULL AND (
  (gravidade = 'serio' AND criado_em < now() - interval '2 hours') OR (gravidade = 'atencao' AND criado_em < now() - interval '6 hours'))
RETURNING id, contato, gravidade, resumo, primeira_cliente;`, options: {} } } });

const lembrar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar lembrete', parameters: { jsCode: `const NL = String.fromCharCode(10);
const L = $input.all().map(i => i.json).filter(r => r.id);
if (!L.length) return [];
const agora = DateTime.now().setZone('America/Recife');
const fmt = h => h >= 48 ? Math.floor(h / 24) + ' dias' : Math.floor(h) + 'h';
const linhas = L.map(r => '• ' + (r.gravidade === 'serio' ? '🔴 ' : '🟠 ') + '**' + r.contato + '** · ' + String(r.resumo || '').replace(/r\\$\\s*[\\d.,]+/gi, '[valor]').slice(0, 140) +
  ' · esperando há ' + fmt(agora.diff(DateTime.fromJSDate(new Date(r.primeira_cliente)), 'hours').hours) + ' (#' + r.id + ')');
const t = '⏰ **Isa · ainda sem decisão**' + NL + linhas.join(NL) + NL + 'Decida no Painel Central › Minha mesa › Isa.';
return [{ json: { corpo: JSON.stringify({ content: t.slice(0, 1950), allowed_mentions: { parse: [] } }) } }];` } } });

const postarLembrete = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Lembrar no #alertas-diretoria', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://discord.com/api/v10/channels/' + CANAL + '/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}', options: {} } } });

const nota = sticky('## Isa · ler e sugerir (V1)\nA cada 2 min lê o PRIVADO da instância isabela (WhatsApp administrativo). Conversa cuja última mensagem é do contato vira sugestão (normal que não pede resposta já nasce arquivada) (Claude Sonnet) na tabela isa_sugestoes: gravidade, resumo, ação e rascunho assinado Isabela. Sério (palavra-trava ou IA) alerta no #alertas-diretoria. NADA é enviado daqui: o envio só acontece com o Henrique, no Painel Central (aba Isa) ou no #aprovações-isa (fluxo Isa | Aprovações pelo Discord).\nSe a Isabela responder por outro caminho (Telegram, celular), a sugestão fecha sozinha (respondida_fora). Lembrete a cada 30 min: sério parado 2h, atenção 6h.\nGrupos de clientes NÃO entram aqui: são da Gerente IA (#aprovações-gerente).', [], { color: 4 });

export default workflow('isa-ler-e-sugerir', 'Isa | Ler e sugerir (V1)')
  .add(cada2).to(conversas).to(preparar).to(claude).to(ler).to(gravar).to(alertas).to(postar).to(marcar)
  .add(cada30).to(atrasadas).to(lembrar).to(postarLembrete)
  .add(nota);
