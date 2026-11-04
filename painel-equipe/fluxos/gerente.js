import { workflow, node, trigger, switchCase, sticky } from '@n8n/workflow-sdk';

// Aba "Aprovar" do painel do diretor (Gerente IA, 04/11/2026): só o papel diretor.
// ver: rascunhos esperando decisão + últimos decididos + números. decidir: grava a escolha (enviar, com ou sem texto corrigido, ou cancelar);
// quem envia é o fluxo "Gerente IA | Aprovações" no minuto seguinte (mesmas travas: equipe já respondeu, 22h–7h, assinatura Érica). Primeiro toque vale (painel ou Discord).
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const ACESSO = { __rl: true, mode: 'id', value: 'ilXDZWGAcOjoajx7', cachedResultName: 'Painel equipe · acesso' };
const PG = { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } };

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Pedido do Aprovar', parameters: {
  httpMethod: 'POST', path: 'euforia-painel-gerente', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

const ler = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler pedido', parameters: { jsCode: `const b = ($input.first().json.body) || {};
const u = String(b.u || '').toLowerCase();
return [{ json: { u: /^[0-9a-f]{24}$/.test(u) ? u : 'x', pin: String(b.pin || '').replace(/[^0-9]/g, '').slice(0, 6),
  acao: ['ver', 'decidir', 'metricas'].includes(b.acao) ? b.acao : '', id: Math.max(0, parseInt(b.id, 10) || 0),
  escolha: ['enviar', 'cancelar'].includes(b.escolha) ? b.escolha : '', texto: String(b.texto || '').trim().slice(0, 1500) } }];
` } } });

const acesso = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Achar pessoa', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: ACESSO, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'token', condition: 'eq', keyValue: '={{ $json.u }}' }] }, limit: 1 } } });

const validar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validar acesso', parameters: { jsCode: `const p = $('Ler pedido').first().json;
const r = $input.first().json || {};
const ok = !!r.token && r.token === p.u && r.ativo === true && String(r.pin) === p.pin;
let motivo = ok ? '' : 'acesso';
if (!motivo && r.papel !== 'diretor') motivo = 'permissao';
if (!motivo && !p.acao) motivo = 'acao';
if (!motivo && p.acao === 'decidir' && (!p.id || !p.escolha)) motivo = 'campos';
return [{ json: { ...p, acao: motivo ? 'recusar' : p.acao, resposta: { ok: false, motivo } } }];
` } } });

const caminho = switchCase({ version: 3.2, config: { name: 'O que fazer', parameters: { rules: { values: [
    { outputKey: 'ver', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ $json.acao }}', rightValue: 'ver', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
    { outputKey: 'decidir', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ $json.acao }}', rightValue: 'decidir', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
    { outputKey: 'metricas', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ $json.acao }}', rightValue: 'metricas', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
    { outputKey: 'recusar', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ $json.acao }}', rightValue: 'recusar', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } }
  ] }, options: {} } } });

const ver = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Ler rascunhos', credentials: PG, parameters: { operation: 'executeQuery',
  query: `ALTER TABLE gerente_rascunhos ADD COLUMN IF NOT EXISTS painel_acao TEXT, ADD COLUMN IF NOT EXISTS painel_texto TEXT, ADD COLUMN IF NOT EXISTS painel_em TIMESTAMPTZ;
SELECT json_build_object(
  'agora', to_char(now() AT TIME ZONE 'America/Recife', 'HH24:MI'),
  'abertos', (SELECT COALESCE(json_agg(x ORDER BY x.id DESC), '[]'::json) FROM (
    SELECT r.id, to_char(r.criado_em AT TIME ZONE 'America/Recife', 'DD/MM HH24:MI') AS criado, r.cliente, r.classe, r.urgencia, r.texto, r.card_url,
      (r.card_corpo IS NOT NULL AND r.card_id IS NULL) AS card_no_ok, r.status, r.painel_acao,
      (SELECT string_agg(to_char(q.enviado_em AT TIME ZONE 'America/Recife', 'HH24:MI') || ' ' || COALESCE(q.autor_nome, 'Cliente') || ': ' || left(COALESCE(q.texto, '[' || q.tipo || ']'), 300), E'\\n' ORDER BY q.enviado_em)
         FROM (SELECT DISTINCT ON (m.msg_id) m.* FROM mensagens m WHERE m.chat_id = r.chat_id AND m.enviado_em <= r.ultima_cliente AND m.enviado_em > r.ultima_cliente - interval '6 hours'
               AND NOT m.from_me AND m.tipo NOT IN ('reactionMessage', 'protocolMessage') ORDER BY m.msg_id, m.enviado_em) q
         WHERE q.enviado_em > r.ultima_cliente - interval '6 hours') AS cliente_disse
    FROM gerente_rascunhos r WHERE r.status IN ('aguardando', 'aprovado_espera') AND r.criado_em > now() - interval '3 days' ORDER BY r.id DESC LIMIT 30) x),
  'recentes', (SELECT COALESCE(json_agg(y ORDER BY y.id DESC), '[]'::json) FROM (
    SELECT r.id, to_char(COALESCE(r.decidido_em, r.criado_em) AT TIME ZONE 'America/Recife', 'DD/MM HH24:MI') AS quando, r.cliente, r.classe, r.status,
      COALESCE(NULLIF(r.texto_final, ''), r.texto) AS texto, COALESCE(r.corrigida, false) AS corrigida, r.painel_acao IS NOT NULL AS pelo_painel
    FROM gerente_rascunhos r WHERE r.status NOT IN ('aguardando', 'aprovado_espera') ORDER BY r.id DESC LIMIT 20) y),
  'numeros', (SELECT json_build_object('total', count(*), 'enviadas', count(*) FILTER (WHERE status = 'enviado'),
      'sem_correcao', count(*) FILTER (WHERE status = 'enviado' AND NOT COALESCE(corrigida, false)),
      'canceladas', count(*) FILTER (WHERE status = 'cancelado'), 'expiradas', count(*) FILTER (WHERE status = 'expirado'),
      'equipe', count(*) FILTER (WHERE status = 'equipe_respondeu'))
    FROM gerente_rascunhos WHERE cliente NOT ILIKE 'TESTE%')
) AS r;`, options: {} } } });

const devolver = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver rascunhos', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify(Object.assign({ ok: true }, $json.r || {})) }}', options: {} } } });

const gravar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Gravar escolha', credentials: PG, alwaysOutputData: true, parameters: { operation: 'executeQuery',
  query: `UPDATE gerente_rascunhos SET painel_acao = $2, painel_texto = NULLIF($3, ''), painel_em = now()
WHERE id = $1::int AND status = 'aguardando' AND painel_acao IS NULL
RETURNING id;`, options: { queryReplacement: '={{ [ $json.id, $json.escolha, $json.escolha === "enviar" ? $json.texto : "" ] }}' } } } });

const confirmar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.id ? { ok: true } : { ok: false, motivo: "decidido" }) }}', options: {} } } });


// Etapa 3: números da Gerente IA (sem os testes). Eventos da tabela "Gerente IA · eventos" + cards do Entregas com "✍️ Criada por" = Gerente IA.
const eventos = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Eventos da Gerente', executeOnce: true, alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'id', value: 'BHqPtAKnMtZTS5Q0', cachedResultName: 'Gerente IA · eventos' }, returnAll: true } } });

const cardsGerente = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Cards da Gerente', executeOnce: true, alwaysOutputData: true, onError: 'continueRegularOutput',
  credentials: { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } },
  parameters: { method: 'POST', url: 'https://api.notion.com/v1/databases/74b3076a325749e3bac4ba6659215e48/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
    sendHeaders: true, headerParameters: { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] }, sendBody: true, specifyBody: 'json',
    jsonBody: '={{ JSON.stringify({ filter: { property: "✍️ Criada por", relation: { contains: "40e98c0c-dde0-817e-b798-f6e045686b7c" } }, page_size: 100 }) }}',
    options: { pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest', parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] },
      paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.has_more }}', limitPagesFetched: true, maxRequests: 10 } } } } } });

const contar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar números', parameters: { jsCode: `const agora = DateTime.now().setZone('America/Recife');
const hoje = agora.toISODate();
const teste = n => /^TESTE/i.test(String(n || ''));
const ev = $('Eventos da Gerente').all().map(i => i.json).filter(e => e && e.evento && !teste(e.cliente));
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join(''); if (v.select) return v.select.name; if (v.date) return v.date.start || ''; if (v.unique_id) return (v.unique_id.prefix ? v.unique_id.prefix + '-' : '') + v.unique_id.number; return ''; };
const cards = [];
for (const it of $('Cards da Gerente').all()) for (const p of (it.json.results || [])) {
  if (p.in_trash || p.archived) continue;
  const pr = p.properties || {};
  const titulo = txt(pr['Entrega']);
  if (teste(titulo)) continue;
  const fim = (txt(pr['Concluído em']) || txt(pr['Postado em']) || '').slice(0, 19);
  cards.push({ criado: p.created_time, status: txt(pr['Status']), fim, prazo: txt(pr['Prazo']).slice(0, 10) });
}
const ENTREGUE = ['Aprovado', 'Agendado', 'Postado'];
const media = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const periodo = dias => {
  const desde = agora.minus({ days: dias - 1 }).toISODate();
  const E = ev.filter(e => String(e.dia || '') >= desde);
  const n = t => E.filter(e => e.evento === t);
  const lidas = E.filter(e => ['classificada', 'escalado'].includes(e.evento)).reduce((a, e) => a + (Number(e.qtd_msgs) || 0), 0);
  const env = n('resposta_enviada');
  const sem = env.filter(e => e.ref === 'sem_correcao').length;
  const C = cards.filter(c => DateTime.fromISO(c.criado).setZone('America/Recife').toISODate() >= desde);
  const ent = C.filter(c => ENTREGUE.includes(c.status));
  const horas = ent.filter(c => c.fim).map(c => Math.max(0, DateTime.fromISO(c.fim, { zone: 'America/Recife' }).diff(DateTime.fromISO(c.criado), 'hours').hours));
  const classes = {};
  for (const e of E.filter(e => ['classificada', 'escalado'].includes(e.evento))) classes[e.classe] = (classes[e.classe] || 0) + 1;
  return { dias, lidas, conversas: E.filter(e => ['classificada', 'escalado'].includes(e.evento)).length,
    demandas_criadas: C.length, entregues: ent.length, abertas: C.filter(c => !ENTREGUE.includes(c.status) && c.status !== 'Cancelado').length,
    atrasadas: C.filter(c => !ENTREGUE.includes(c.status) && c.status !== 'Cancelado' && c.prazo && c.prazo < hoje).length,
    tempo_resposta_min: media(env.map(e => Number(e.minutos) || 0)), tempo_entrega_h: media(horas),
    escalados: n('escalado').length, travas: E.filter(e => e.evento === 'escalado' && e.trava_palavra).length,
    rascunhos: n('rascunho').length, enviadas: env.length, sem_correcao: sem, pct_sem_correcao: env.length ? Math.round(sem / env.length * 100) : null,
    canceladas: n('cancelada').length, expiradas: n('expirada').length, equipe_antes: n('equipe_respondeu').length, classes };
};
const serie = [];
for (let k = 13; k >= 0; k--) {
  const d = agora.minus({ days: k }).toISODate();
  const E = ev.filter(e => e.dia === d);
  serie.push({ dia: d, lidas: E.filter(e => ['classificada', 'escalado'].includes(e.evento)).reduce((a, e) => a + (Number(e.qtd_msgs) || 0), 0),
    escalados: E.filter(e => e.evento === 'escalado').length, enviadas: E.filter(e => e.evento === 'resposta_enviada').length });
}
const tot = periodo(3650);
return [{ json: { ok: true, agora: agora.toFormat('HH:mm'), p1: periodo(1), p7: periodo(7), p30: periodo(30), serie,
  fase1b: { enviadas: tot.enviadas, pct: tot.pct_sem_correcao, pronto: tot.enviadas >= 30 && (tot.pct_sem_correcao || 0) >= 95 } } }];
` } } });

const devolverNumeros = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver números', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: {} } } });

const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Painel · Gerente IA (aba Aprovar, V1)\nSó diretoria. ver: rascunhos do #aprovações-gerente esperando decisão, o que o cliente disse, os últimos decididos e os números (sem TESTE).\nmetricas: números da etapa 3 (eventos + cards do Entregas criados pela Gerente; sem TESTE).\ndecidir: grava painel_acao (enviar/cancelar) e o texto corrigido em gerente_rascunhos. Quem manda é o fluxo Gerente IA | Aprovações no minuto seguinte, com as mesmas travas. Primeiro toque vale.', [], { color: 4 });

export default workflow('painel-gerente', 'Painel | Gerente IA · Aprovar (V1)')
  .add(pedir).to(ler).to(acesso).to(validar).to(caminho
    .onCase(0, ver.to(devolver))
    .onCase(1, gravar.to(confirmar))
    .onCase(2, eventos.to(cardsGerente).to(contar).to(devolverNumeros))
    .onCase(3, recusar))
  .add(nota);
