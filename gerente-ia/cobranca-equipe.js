import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

// Gerente IA | Cobrança da equipe (05/11/2026). Pedido do Henrique: "quero que a gerente puxe a orelha dessa galera" e
// "precisa ficar ligada nessas mensagens que a equipe não responde" (caso Ana Mangia foi a gota d'água).
// Parte 1, a cada 5 min no expediente (8h–18h úteis, almoço 12h–14h não conta): cliente esperando resposta no grupo
//   30 min → cobra o Rômulo no 1x1 · 1h → cobra Rômulo e Ismael no 1x1 e vira ocorrência · 2h → avisa a diretoria.
//   Usa a classificação do Monitor de respostas (só o que precisa de resposta; assunto sensível fica com a diretoria).
// Parte 2, 17:55 dias úteis: resumo do dia no 1x1 de cada um (grupos que esperaram mais de 1h + cards vencidos) e na diretoria.
// Sempre no privado (1x1), tom firme e respeitoso, só fatos. Valores e links mascarados. Nunca vai assunto de dinheiro/contrato/jurídico.
const PG = { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } };
const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const DISCORD = { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } };



const cada5 = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada 5 minutos', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } } } });

const pendentes = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Clientes esperando', credentials: PG, executeOnce: true, parameters: { operation: 'executeQuery', query: `CREATE TABLE IF NOT EXISTS gerente_cobranca (chave TEXT PRIMARY KEY, chat_id TEXT, grupo TEXT, desde TIMESTAMPTZ, n1_em TIMESTAMPTZ, n2_em TIMESTAMPTZ, n3_em TIMESTAMPTZ, respondido_em TIMESTAMPTZ, criado_em TIMESTAMPTZ DEFAULT now());
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
upd AS (
  UPDATE gerente_cobranca c SET respondido_em = (SELECT min(m.enviado_em) FROM msgs m WHERE m.chat_id = c.chat_id AND m.da_equipe AND m.enviado_em > c.desde)
  WHERE c.respondido_em IS NULL AND EXISTS (SELECT 1 FROM msgs m WHERE m.chat_id = c.chat_id AND m.da_equipe AND m.enviado_em > c.desde)
  RETURNING 1
),
ult AS (
  SELECT DISTINCT ON (chat_id) * FROM msgs
  WHERE da_equipe OR tipo NOT IN ('reactionMessage','stickerMessage','protocolMessage','pollUpdateMessage')
  ORDER BY chat_id, enviado_em DESC
),
pend AS (
  SELECT u.chat_id, (SELECT max(t.enviado_em) FROM msgs t WHERE t.chat_id = u.chat_id AND t.da_equipe) AS ult_equipe
  FROM ult u JOIN atendimento_estado e ON e.msg_id = u.msg_id
  WHERE NOT u.da_equipe AND e.ultima_acao IN ('alerta30','acolher45')
    AND u.enviado_em > now() - interval '24 hours'
    AND u.chat_id NOT IN (SELECT chat_id FROM internos)
    AND EXISTS (SELECT 1 FROM chats c WHERE c.chat_id = u.chat_id AND c.origem = 'suporte')
)
SELECT p.chat_id || ':' || f.msg_id AS chave, p.chat_id,
  COALESCE((SELECT c.nome FROM chats c WHERE c.chat_id = p.chat_id AND c.nome IS NOT NULL LIMIT 1), p.chat_id) AS grupo,
  f.enviado_em AS desde, COALESCE(f.autor_nome, 'Cliente') AS autor, left(COALESCE(f.texto, '[' || f.tipo || ']'), 250) AS texto,
  g.n1_em, g.n2_em, g.n3_em, (SELECT count(*) FROM upd) AS respondidos_agora
FROM pend p
CROSS JOIN LATERAL (SELECT * FROM msgs m WHERE m.chat_id = p.chat_id AND NOT m.da_equipe
    AND m.tipo NOT IN ('reactionMessage','stickerMessage','protocolMessage','pollUpdateMessage')
    AND m.enviado_em > COALESCE(p.ult_equipe, '-infinity'::timestamptz) ORDER BY m.enviado_em LIMIT 1) f
LEFT JOIN gerente_cobranca g ON g.chave = p.chat_id || ':' || f.msg_id
WHERE g.n3_em IS NULL
ORDER BY f.enviado_em LIMIT 30;`, options: {} } } });

const decidir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Decidir cobrança', parameters: { jsCode: `const NL = String.fromCharCode(10);
const CANAL = { ismael: '1556650886678454403', romulo: '1556650881921978511', diretoria: '1567643418270634136' };
const USER = { ismael: '1410287139169763471', romulo: '1490768736876237082' };
const TRAVA = /r\\$|\\bpix\\b|boleto|pagament|\\bpagar\\b|paguei|cobranc|fatura|nota fiscal|reembols|estorn|parcela|mensalidade|\\bvalor(es)?\\b|desconto|\\bmulta\\b|contrato|cancelar|cancelament|rescis|distrato|advogad|procon|reclame ?aqui|processo|juridic/;
const sem = s => String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
const mascara = s => String(s || '').replace(/r\\$\\s*[\\d.,]+(\\s*(mil|k))?/gi, '[valor]').replace(/\\b\\d{1,3}(\\.\\d{3})+(,\\d{1,2})?\\b/g, '[valor]').replace(/https?:\\/\\/\\S+/g, '[link]').replace(/\\s+/g, ' ').slice(0, 220);
const fmt = m => m >= 60 ? Math.floor(m / 60) + 'h' + String(Math.round(m % 60)).padStart(2, '0') : Math.round(m) + ' min';
const post = (quem, texto) => ({ canal: CANAL[quem], corpo: JSON.stringify({ content: texto.slice(0, 1950), allowed_mentions: USER[quem] ? { users: [USER[quem]] } : { parse: [] } }) });
const now = DateTime.now().setZone('America/Recife');
const FERIADOS = ['2026-11-20', '2026-12-25', '2027-01-01'];
const util = now.weekday <= 5 && !FERIADOS.includes(now.toISODate()) && now.hour >= 8 && now.hour < 18 && !(now.hour >= 12 && now.hour < 14);
const linhas = [], envios = [];
if (util) for (const it of $input.all()) {
  const r = it.json;
  if (!r.chave) continue;
  if (TRAVA.test(sem(r.texto))) continue; // assunto da diretoria: a equipe não é cobrada por ele
  const abre = now.set({ hour: 8, minute: 0, second: 0, millisecond: 0 });
  let ref = DateTime.fromJSDate(new Date(r.desde)).setZone('America/Recife');
  if (ref < abre) ref = abre;
  const a12 = now.set({ hour: 12, minute: 0, second: 0, millisecond: 0 }), a14 = now.set({ hour: 14, minute: 0, second: 0, millisecond: 0 });
  let espera = now.diff(ref, 'minutes').minutes;
  const ini = ref > a12 ? ref : a12, fim = now < a14 ? now : a14;
  if (fim > ini) espera -= fim.diff(ini, 'minutes').minutes;
  const nivel = espera >= 120 ? 3 : espera >= 60 ? 2 : espera >= 30 ? 1 : 0;
  if (!nivel) continue;
  const feito = { 1: r.n1_em, 2: r.n2_em, 3: r.n3_em };
  const falta = [1, 2, 3].filter(k => k <= nivel && !feito[k]);
  if (!falta.length) continue;
  const n = Math.max(...falta); // se pulou etapas, manda só a mais alta
  const trecho = '> ' + r.autor + ': ' + mascara(r.texto);
  const t = fmt(espera);
  if (n === 1) envios.push(post('romulo', '⏰ <@' + USER.romulo + '> a **' + r.grupo + '** está esperando resposta no grupo há ' + t + ':' + NL + '' + trecho + '' + NL + 'Responda agora, por favor. Se não for com você, passe para quem resolve e avise o cliente que já está sendo visto.'));
  if (n === 2) for (const q of ['romulo', 'ismael']) envios.push(post(q, '🔴 <@' + USER[q] + '> a **' + r.grupo + '** está há ' + t + ' sem resposta no grupo. Isso já ficou registrado como ocorrência e vai no resumo da diretoria. Responda agora.' + NL + '' + trecho));
  if (n === 3) envios.push(post('diretoria', '🚨 **' + r.grupo + '** está há ' + t + ' sem resposta da equipe no grupo. Rômulo foi cobrado no privado aos 30 min e Rômulo e Ismael com 1h.' + NL + '' + trecho));
  linhas.push({ chave: r.chave, chat_id: r.chat_id, grupo: r.grupo, desde: r.desde, n1: falta.includes(1), n2: falta.includes(2), n3: falta.includes(3) });
}
return [{ json: { linhas: JSON.stringify(linhas), envios } }];` } } });

const gravar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Gravar cobranças', credentials: PG, parameters: { operation: 'executeQuery',
  query: `INSERT INTO gerente_cobranca (chave, chat_id, grupo, desde, n1_em, n2_em, n3_em)
SELECT x.chave, x.chat_id, x.grupo, x.desde, CASE WHEN x.n1 THEN now() END, CASE WHEN x.n2 THEN now() END, CASE WHEN x.n3 THEN now() END
FROM json_to_recordset($1::json) AS x(chave text, chat_id text, grupo text, desde timestamptz, n1 boolean, n2 boolean, n3 boolean)
ON CONFLICT (chave) DO UPDATE SET
  n1_em = COALESCE(gerente_cobranca.n1_em, EXCLUDED.n1_em), n2_em = COALESCE(gerente_cobranca.n2_em, EXCLUDED.n2_em), n3_em = COALESCE(gerente_cobranca.n3_em, EXCLUDED.n3_em)
RETURNING chave;`, options: { queryReplacement: '={{ [ $json.linhas ] }}' } }, alwaysOutputData: true } });

const lista = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Lista de cobranças', parameters: { jsCode: "return $('Decidir cobrança').first().json.envios.map(e => ({ json: e }));" } } });

const postarCob = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Cobrar no Discord', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: '=https://discord.com/api/v10/channels/{{ $json.canal }}/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}', options: { batching: { batch: { batchSize: 1, batchInterval: 1200 } } } } } });

// Parte 2: resumo do fim do dia
const fimDoDia = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'Fim do dia (17:55 úteis)', parameters: { rule: { interval: [{ field: 'cronExpression', expression: '55 17 * * 1-5' }] } } } });

const doDia = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Esperas de hoje', credentials: PG, executeOnce: true, parameters: { operation: 'executeQuery',
  query: `CREATE TABLE IF NOT EXISTS gerente_cobranca (chave TEXT PRIMARY KEY, chat_id TEXT, grupo TEXT, desde TIMESTAMPTZ, n1_em TIMESTAMPTZ, n2_em TIMESTAMPTZ, n3_em TIMESTAMPTZ, respondido_em TIMESTAMPTZ, criado_em TIMESTAMPTZ DEFAULT now());
SELECT grupo, (n3_em IS NOT NULL) AS mais2h, to_char(respondido_em AT TIME ZONE 'America/Recife', 'HH24:MI') AS respondido
FROM gerente_cobranca
WHERE n2_em IS NOT NULL AND (n2_em AT TIME ZONE 'America/Recife')::date = (now() AT TIME ZONE 'America/Recife')::date
ORDER BY desde;`, options: {} } } });

const vencidos = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Cards vencidos', credentials: NOTION, executeOnce: true, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/74b3076a325749e3bac4ba6659215e48/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] }, sendBody: true, specifyBody: 'json',
  jsonBody: `={{ JSON.stringify({ page_size: 100, sorts: [{ property: 'Prazo', direction: 'ascending' }], filter: { and: [
    { property: 'Prazo', date: { before: $now.setZone('America/Recife').toISODate() } },
    { property: 'Status', select: { does_not_equal: 'Postado' } }, { property: 'Status', select: { does_not_equal: 'Cancelado' } },
    { property: 'Status', select: { does_not_equal: 'Aprovado' } }, { property: 'Status', select: { does_not_equal: 'Agendado' } },
    { property: 'Status', select: { does_not_equal: 'Aguardando cliente' } },
    { or: [ { property: 'Responsável', relation: { contains: '3ea98c0c-dde0-8129-9709-cf901fac7275' } }, { property: 'Responsável', relation: { contains: '3ea98c0c-dde0-812d-9cb4-c41ce70df4ae' } } ] } ] } }) }}`,
  options: {} } } });

const resumo = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar resumo', parameters: { jsCode: `const NL = String.fromCharCode(10);
const CANAL = { ismael: '1556650886678454403', romulo: '1556650881921978511', diretoria: '1567643418270634136' };
const USER = { ismael: '1410287139169763471', romulo: '1490768736876237082' };
const TRAVA = /r\\$|\\bpix\\b|boleto|pagament|\\bpagar\\b|paguei|cobranc|fatura|nota fiscal|reembols|estorn|parcela|mensalidade|\\bvalor(es)?\\b|desconto|\\bmulta\\b|contrato|cancelar|cancelament|rescis|distrato|advogad|procon|reclame ?aqui|processo|juridic/;
const sem = s => String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
const mascara = s => String(s || '').replace(/r\\$\\s*[\\d.,]+(\\s*(mil|k))?/gi, '[valor]').replace(/\\b\\d{1,3}(\\.\\d{3})+(,\\d{1,2})?\\b/g, '[valor]').replace(/https?:\\/\\/\\S+/g, '[link]').replace(/\\s+/g, ' ').slice(0, 220);
const fmt = m => m >= 60 ? Math.floor(m / 60) + 'h' + String(Math.round(m % 60)).padStart(2, '0') : Math.round(m) + ' min';
const post = (quem, texto) => ({ canal: CANAL[quem], corpo: JSON.stringify({ content: texto.slice(0, 1950), allowed_mentions: USER[quem] ? { users: [USER[quem]] } : { parse: [] } }) });
const ID = { romulo: '3ea98c0c-dde0-8129-9709-cf901fac7275', ismael: '3ea98c0c-dde0-812d-9cb4-c41ce70df4ae' };
const NOME = { romulo: 'Rômulo', ismael: 'Ismael' };
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.date) return v.date.start || ''; if (v.unique_id) return (v.unique_id.prefix ? v.unique_id.prefix + '-' : '') + v.unique_id.number; return ''; };
const ddmm = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '';
const esperas = $('Esperas de hoje').all().map(i => i.json).filter(r => r.grupo);
const linhaEspera = r => '• **' + r.grupo + '** · esperou mais de ' + (r.mais2h ? '2h' : '1h') + ' · ' + (r.respondido ? 'respondido às ' + r.respondido : 'ainda sem resposta');
const cards = { romulo: [], ismael: [] };
for (const p of ($('Cards vencidos').first().json.results || [])) {
  const pr = p.properties || {};
  const titulo = txt(pr['Entrega']);
  if (/^TESTE/i.test(titulo)) continue;
  const resp = ((pr['Responsável'] || {}).relation || []).map(x => x.id);
  for (const q of ['romulo', 'ismael']) if (resp.includes(ID[q])) cards[q].push({ codigo: txt(pr['Código']), titulo, prazo: txt(pr['Prazo']).slice(0, 10), url: p.url });
}
const linhaCard = c => '• [' + (c.codigo || 'card') + '](<' + c.url + '>) ' + mascara(c.titulo).slice(0, 90) + ' · venceu ' + ddmm(c.prazo);
const out = [];
for (const q of ['romulo', 'ismael']) {
  const cs = cards[q];
  let t = '📋 <@' + USER[q] + '> **Resumo do dia da Gerente**' + NL + '';
  if (!esperas.length && !cs.length) t += '✅ Hoje nenhum cliente esperou mais de 1h no grupo e seus cards estão no prazo. Bom trabalho.';
  else {
    if (esperas.length) t += '' + NL + '**Clientes que esperaram mais de 1h no grupo hoje** (vocês dois cobrem os grupos):' + NL + '' + esperas.slice(0, 12).map(linhaEspera).join('' + NL + '') + (esperas.length > 12 ? '' + NL + '• e mais ' + (esperas.length - 12) : '') + '' + NL + '';
    if (cs.length) t += '' + NL + '**Seus cards com prazo vencido** (' + cs.length + '):' + NL + '' + cs.slice(0, 10).map(linhaCard).join('' + NL + '') + (cs.length > 10 ? '' + NL + '• e mais ' + (cs.length - 10) : '') + '' + NL + '';
    t += '' + NL + 'Isso vai para a diretoria. Para amanhã: nenhum cliente esperando mais de 30 min, e card que não vai dar tempo ganha prazo novo com aviso antes de vencer.';
  }
  out.push(post(q, t));
}
let d = '📋 **Resumo do dia da equipe**' + NL + '';
d += esperas.length ? '' + NL + '**Clientes que esperaram mais de 1h no grupo:** ' + esperas.length + '' + NL + '' + esperas.slice(0, 15).map(linhaEspera).join('' + NL + '') + '' + NL + '' : '' + NL + '✅ Nenhum cliente esperou mais de 1h no grupo hoje.' + NL + '';
d += '' + NL + '**Cards vencidos:** Rômulo ' + cards.romulo.length + ' · Ismael ' + cards.ismael.length + '' + NL + 'Os dois receberam o resumo no privado.';
out.push(post('diretoria', d));
return out.map(e => ({ json: e }));` } } });

const postarRes = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Mandar resumo', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: '=https://discord.com/api/v10/channels/{{ $json.canal }}/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}', options: { batching: { batch: { batchSize: 1, batchInterval: 1200 } } } } } });

const nota = sticky('## Gerente IA · cobrança da equipe (V1) · **A cada 5 min, no expediente:** cliente esperando resposta no grupo (o Monitor de respostas já marcou que precisa de resposta) → 30 min cobra o Rômulo no 1x1; 1h cobra Rômulo e Ismael (ocorrência); 2h avisa a diretoria no #aprovações-gerente. Assunto de dinheiro/contrato/jurídico não vai para a equipe. · **17:55 dias úteis:** resumo no 1x1 de cada um (grupos que esperaram mais de 1h + cards vencidos) e na diretoria. · Tabela gerente_cobranca.', [], { color: 4 });

export default workflow('gerente-cobranca', 'Gerente IA | Cobrança da equipe (V1)', { executionOrder: 'v1', availableInMCP: true, timezone: 'America/Recife' })
  .add(cada5).to(pendentes).to(decidir).to(gravar).to(lista).to(postarCob)
  .add(fimDoDia).to(doDia).to(vencidos).to(resumo).to(postarRes)
  .add(nota);
