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
  acao: ['ver', 'decidir'].includes(b.acao) ? b.acao : '', id: Math.max(0, parseInt(b.id, 10) || 0),
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

const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Painel · Gerente IA (aba Aprovar, V1)\nSó diretoria. ver: rascunhos do #aprovações-gerente esperando decisão, o que o cliente disse, os últimos decididos e os números (sem TESTE).\ndecidir: grava painel_acao (enviar/cancelar) e o texto corrigido em gerente_rascunhos. Quem manda é o fluxo Gerente IA | Aprovações no minuto seguinte, com as mesmas travas. Primeiro toque vale.', [], { color: 4 });

export default workflow('painel-gerente', 'Painel | Gerente IA · Aprovar (V1)')
  .add(pedir).to(ler).to(acesso).to(validar).to(caminho
    .onCase(0, ver.to(devolver))
    .onCase(1, gravar.to(confirmar))
    .onCase(2, recusar))
  .add(nota);
