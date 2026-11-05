import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

// Gerente IA | Avisos 1x1 (05/11/2026). Ideia do Henrique: "ela avisa os meninos quando precisa de algo no Discord? podemos usar aqueles canais 1x1".
// A cada 5 min (7h–22h Recife) olha os rascunhos da Gerente das últimas 24h e avisa no canal 1x1 de cada um:
// - Ismael: card que ficou com ele (Falta do cliente, não foi para a máquina, pedido de ajuste).
// - Rômulo: cliente falou de call/reunião no grupo.
// Nunca vai assunto sério (esses nem viram rascunho) e valores são mascarados. Cada aviso sai uma vez só.
const PG = { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } };
const DISCORD = { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } };

const cada5 = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada 5 minutos', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } } } });

const pendentes = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Avisos pendentes', credentials: PG, executeOnce: true, parameters: { operation: 'executeQuery',
  query: `ALTER TABLE gerente_rascunhos ADD COLUMN IF NOT EXISTS aviso_ismael_em TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS aviso_romulo_em TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS confirmar TEXT, ADD COLUMN IF NOT EXISTS confirmar_quem TEXT, ADD COLUMN IF NOT EXISTS confirmar_msg TEXT, ADD COLUMN IF NOT EXISTS confirmado TEXT, ADD COLUMN IF NOT EXISTS confirmar_em TIMESTAMPTZ;
SELECT * FROM (
  SELECT r.id, r.cliente, r.card_url, r.classe, r.maquina_status, r.confirmar, r.confirmar_quem,
    (r.confirmar IS NOT NULL AND r.confirmar_msg IS NULL AND r.confirmado IS NULL AND r.status IN ('aguardando', 'aprovado_confirmar')) AS p_conf,
    (r.aviso_ismael_em IS NULL AND r.card_id IS NOT NULL AND (r.maquina_status = 'falta_link' OR r.maquina_status LIKE 'erro:%' OR r.classe = 'ajuste')) AS p_ismael,
    CASE WHEN r.aviso_romulo_em IS NULL THEN (SELECT left(q.texto, 300) FROM mensagens q
      WHERE q.chat_id = r.chat_id AND NOT q.from_me AND q.texto IS NOT NULL
        AND q.enviado_em BETWEEN r.ultima_cliente - interval '6 hours' AND r.ultima_cliente + interval '1 minute'
        AND lower(q.texto) ~ '(^|[^a-zà-ú])(call|reuni|ligar|liga[cç][aã]o|chamada|meet|zoom)'
      ORDER BY q.enviado_em DESC LIMIT 1) END AS texto_call
  FROM gerente_rascunhos r
  WHERE r.criado_em > now() - interval '1 day' AND r.criado_em > '2026-11-05 11:55:00+00' AND COALESCE(r.cliente, '') NOT ILIKE 'TESTE%'
    AND EXTRACT(HOUR FROM now() AT TIME ZONE 'America/Recife') BETWEEN 7 AND 21
) t WHERE t.p_ismael OR t.texto_call IS NOT NULL OR t.p_conf
ORDER BY t.id LIMIT 10;`, options: {} } } });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar avisos', parameters: { jsCode: `const CANAL = { ismael: '1556650886678454403', romulo: '1556650881921978511' };
const USER = { ismael: '1410287139169763471', romulo: '1490768736876237082' };
const mascara = s => String(s || '').replace(/r\\$\\s*[\\d.,]+(\\s*(mil|k))?/gi, '[valor]').replace(/\\b\\d{1,3}(\\.\\d{3})+(,\\d{1,2})?\\b/g, '[valor]').replace(/https?:\\/\\/\\S+/g, '[link]');
const card = r => r.card_url ? ' [abrir card](<' + r.card_url + '>)' : '';
const MOTIVO = { 'erro:semmaquina': 'esse tipo de peça não tem máquina', 'erro:etapa': 'o card já tinha saído de A fazer', 'erro:card': 'não achei o card', 'erro:cliente': 'não achei a ficha do cliente' };
const out = [];
for (const it of $input.all()) {
  const r = it.json;
  if (!r.id) continue;
  if (r.p_ismael) {
    let t;
    if (r.maquina_status === 'falta_link') t = '📎 <@' + USER.ismael + '> card novo da Gerente IA ficou com você como **Falta do cliente** · **' + r.cliente + '**.' + card(r) + '\\nFalta o link do material bruto. Quando o cliente mandar no grupo, vai sozinho para a máquina.';
    else if (String(r.maquina_status || '').startsWith('erro:')) t = '⚠️ <@' + USER.ismael + '> pedido da **' + r.cliente + '** não foi para a máquina (' + (MOTIVO[r.maquina_status] || 'a máquina não aceitou') + '). Fica com você para distribuir.' + card(r);
    else t = '✂️ <@' + USER.ismael + '> pedido de **ajuste** da **' + r.cliente + '** no grupo. O card fica com você.' + card(r);
    out.push({ json: { id: r.id, quem: 'ismael', canal: CANAL.ismael, corpo: JSON.stringify({ content: t.slice(0, 1900), allowed_mentions: { users: [USER.ismael] } }) } });
  }
  if (r.p_conf) {
    const q = r.confirmar_quem === 'romulo' ? 'romulo' : 'ismael';
    const t = '❓ <@' + USER[q] + '> pergunta rápida sobre **' + r.cliente + '** antes de responder o cliente:\\n> ' + mascara(r.confirmar) + '\\nReaja ✅ se **sim** ou ❌ se **não**. A resposta ao cliente só sai depois do seu ✅.';
    out.push({ json: { id: r.id, quem: 'conf', canal: CANAL[q], corpo: JSON.stringify({ content: t.slice(0, 1900), allowed_mentions: { users: [USER[q]] } }) } });
  }
  if (r.texto_call) {
    const t = '📞 <@' + USER.romulo + '> a **' + r.cliente + '** falou de call ou reunião no grupo:\\n> ' + mascara(r.texto_call).replace(/\\n/g, '\\n> ') + '\\nDá uma olhada no grupo. A resposta de texto da Gerente continua passando pela diretoria.';
    out.push({ json: { id: r.id, quem: 'romulo', canal: CANAL.romulo, corpo: JSON.stringify({ content: t.slice(0, 1900), allowed_mentions: { users: [USER.romulo] } }) } });
  }
}
return out;` } } });

const postar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Postar no 1x1', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: '=https://discord.com/api/v10/channels/{{ $json.canal }}/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}', options: { batching: { batch: { batchSize: 1, batchInterval: 1200 } } } } } });

const marcar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Quem recebeu', parameters: { jsCode: `const por = {};
$input.all().forEach((it, i) => {
  const a = $('Montar avisos').itemMatching(i).json;
  if (!(it.json && it.json.id)) return;
  por[a.id] = por[a.id] || { id: a.id, ismael: false, romulo: false, conf_msg: null };
  if (a.quem === 'conf') por[a.id].conf_msg = it.json.id; else por[a.id][a.quem] = true;
});
return [{ json: { linhas: JSON.stringify(Object.values(por)) } }];` } } });

const gravar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Gravar avisados', credentials: PG, parameters: { operation: 'executeQuery',
  query: `UPDATE gerente_rascunhos r SET
  aviso_ismael_em = CASE WHEN x.ismael THEN now() ELSE r.aviso_ismael_em END,
  aviso_romulo_em = CASE WHEN x.romulo THEN now() ELSE r.aviso_romulo_em END,
  confirmar_msg = COALESCE(x.conf_msg, r.confirmar_msg)
FROM json_to_recordset($1::json) AS x(id int, ismael boolean, romulo boolean, conf_msg text) WHERE r.id = x.id RETURNING r.id;`,
  options: { queryReplacement: '={{ [ $json.linhas ] }}' } } } });

const nota = sticky('## Gerente IA · avisos 1x1 (V1)\nA cada 5 min, das 7h às 22h: Ismael recebe no 1x1 dele os cards da Gerente que ficaram com ele (Falta do cliente, não foi para a máquina, ajuste). Rômulo recebe no 1x1 quando o cliente fala de call/reunião. Trava de confirmação: quando a resposta afirma algo que só a equipe sabe, pergunta ao Rômulo ou Ismael (✅/❌) e o Aprovações só manda depois do sim. Cada aviso sai uma vez (colunas aviso_ismael_em / aviso_romulo_em em gerente_rascunhos). Assunto sério nunca vem para cá.', [], { color: 4 });

export default workflow('gerente-avisos-1x1', 'Gerente IA | Avisos 1x1 no Discord (V1)', { executionOrder: 'v1', availableInMCP: true })
  .add(cada5).to(pendentes).to(montar).to(postar).to(marcar).to(gravar)
  .add(nota);
