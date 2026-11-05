import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

// Gerente IA | Mandar para a máquina (05/11/2026). Pedido do Henrique: "ela resolve: fala com a máquina e manda pronto para a equipe revisar e mandar para o cliente".
// A cada 2 min pega os cards de PEDIDO que a Gerente criou e ainda não foram para máquina e usa o mesmo "mandar → máquina" da Central de Demandas
// (longo e shorts pedem link do bruto; carrossel e peças do escritório vão direto). A máquina entrega em revisão para a equipe; nada vai ao cliente aqui.
// Quando o cliente manda o link depois, o card sai sozinho de "Falta do cliente" e vai para a máquina (material recebido).
// Só cards novos (até 30 min do card nascer), para não puxar card que a equipe já distribuiu.
// Sem link do material: card fica "Falta do cliente" com o Ismael e a Gerente avisa no #aprovações-gerente.
const PG = { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } };
const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const DISCORD = { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } };

const cada2 = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada 2 minutos', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 2 }] } } } });

const pendentes = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Cards para a máquina', credentials: PG, alwaysOutputData: true, parameters: { operation: 'executeQuery',
  query: `ALTER TABLE gerente_rascunhos ADD COLUMN IF NOT EXISTS maquina_status TEXT, ADD COLUMN IF NOT EXISTS maquina_em TIMESTAMPTZ;
SELECT r.id, r.card_id, r.card_url, r.cliente, r.chat_id, r.discord_msg, (r.maquina_status = 'falta_link') AS recebido,
  (SELECT substring(q.texto from '(https://[^\\s<>"]+)') FROM mensagens q
    WHERE q.chat_id = r.chat_id AND NOT q.from_me AND q.texto ~ 'https://' AND q.enviado_em > r.ultima_cliente - interval '6 hours'
    ORDER BY (q.texto ~* 'drive\\.google|dropbox|wetransfer|onedrive|icloud|mega\\.nz|youtu') DESC, q.enviado_em DESC LIMIT 1) AS link
FROM gerente_rascunhos r
WHERE r.card_id IS NOT NULL AND r.classe = 'pedido' AND r.criado_em > now() - interval '7 days'
  AND ((r.maquina_status IS NULL AND GREATEST(r.criado_em, COALESCE(r.decidido_em, r.criado_em)) > now() - interval '30 minutes')
    OR (r.maquina_status = 'falta_link' AND EXISTS (SELECT 1 FROM mensagens q WHERE q.chat_id = r.chat_id AND NOT q.from_me AND q.texto ~ 'https://' AND q.enviado_em > r.maquina_em)))
ORDER BY r.id LIMIT 5;`, options: {} } } });

const acessos = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Acessos', executeOnce: true, alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'id', value: 'ilXDZWGAcOjoajx7', cachedResultName: 'Painel equipe · acesso' }, returnAll: true } } });

const preparar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Preparar', parameters: { jsCode: `const A = $('Acessos').all().map(i => i.json).filter(a => a && a.token && a.ativo === true);
const dir = A.find(a => a.papel === 'diretor'), tst = A.find(a => a.papel === 'teste');
return $('Cards para a máquina').all().filter(i => i.json.id && i.json.card_id).map(i => {
  const r = i.json, teste = /^TESTE/i.test(String(r.cliente || ''));
  const a = teste ? tst : dir;
  return { json: { ...r, teste, sem_acesso: !a, corpo: JSON.stringify({ u: a ? a.token : '', pin: a ? String(a.pin) : '', acao: 'mandar', destino: 'maquina',
    card: String(r.card_id).replace(/-/g, ''), link: r.link || '', nota: 'pela Gerente IA (pedido do grupo)' }) } };
});` } } });

const mandar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Mandar pela Central', onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://n8n.grupoeuforia.tech/webhook/euforia-painel-central', sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}',
  options: { timeout: 90000, response: { response: { neverError: true } }, batching: { batch: { batchSize: 1, batchInterval: 1500 } } } } } });

const resultado = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Resultado', parameters: { jsCode: `const agora = DateTime.now().setZone('America/Recife');
const MOTIVO = { link: 'falta o link do material bruto', semmaquina: 'esse tipo de peça não tem máquina', etapa: 'o card já saiu de A fazer', card: 'não achei o card',
  cliente: 'não achei a ficha do cliente', teste: 'card de teste', acesso: 'acesso da Central recusado' };
return $input.all().map((it, i) => {
  const r = $('Preparar').itemMatching(i).json, x = it.json || {};
  let status, nota, falta = false;
  if (x.ok) { status = 'enviado'; nota = (r.recebido ? '📥 O cliente mandou o material. ' : '') + '🏭 Card foi para a **' + (x.para || 'máquina') + '**. A peça pronta cai na revisão da equipe, que manda para o cliente.'; }
  else if (x.motivo === 'link') { status = 'falta_link'; falta = true; nota = '📎 Card fica com o Ismael como **Falta do cliente**: ' + MOTIVO.link + '. Quando o cliente mandar, vai para a máquina.'; }
  else { status = 'erro:' + (x.motivo || 'sem resposta'); nota = '⚠️ Não mandei para a máquina (' + (MOTIVO[x.motivo] || x.motivo || 'a Central não respondeu') + '). Card fica com o Ismael.'; }
  const discord = r.discord_msg ? JSON.stringify({ content: nota, message_reference: { message_id: r.discord_msg, fail_if_not_exists: false }, allowed_mentions: { parse: [] } }) : '';
  const card = falta ? JSON.stringify({ properties: { '🏢 Escritório IA': { select: { name: 'Falta do cliente' } } } }) : JSON.stringify({ properties: {} });
  return { json: { id: r.id, card_id: r.card_id, status, discord, card,
    evento: { quando: agora.toISO(), dia: agora.toISODate(), evento: x.ok ? 'maquina' : 'maquina_nao', modo: 'piloto', chat_id: r.chat_id, cliente: r.cliente, classe: 'pedido', qtd_msgs: 0, trava_palavra: false, ref: x.ok ? String(x.para || '') : status, minutos: 0 } } };
});` } } });

const marcarCard = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Marcar card', credentials: NOTION, onError: 'continueRegularOutput', parameters: {
  method: 'PATCH', url: '=https://api.notion.com/v1/pages/{{ $json.card_id }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] }, sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.card }}',
  options: { batching: { batch: { batchSize: 1, batchInterval: 400 } } } } } });

const gravar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Gravar status', credentials: PG, alwaysOutputData: true, parameters: { operation: 'executeQuery',
  query: `UPDATE gerente_rascunhos r SET maquina_status = x.status, maquina_em = now()
FROM json_to_recordset($1::json) AS x(id int, status text) WHERE r.id = x.id RETURNING r.id;`,
  options: { queryReplacement: "={{ [ JSON.stringify($('Resultado').all().map(i => ({ id: i.json.id, status: i.json.status }))) ] }}" } }, executeOnce: true } });

const avisos = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Avisos', parameters: { jsCode: "return $('Resultado').all().filter(i => i.json.discord).map(i => ({ json: { discord: i.json.discord, evento: i.json.evento } }));" } } });

const avisar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Responder no #aprovações-gerente', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://discord.com/api/v10/channels/1567643418270634136/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.discord }}', options: { batching: { batch: { batchSize: 1, batchInterval: 1200 } } } } } });

const eventos = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Eventos', parameters: { jsCode: "return $('Resultado').all().map(i => ({ json: { evento: i.json.evento } }));" } } });

const gravarEv = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Gravar eventos', parameters: { resource: 'row', operation: 'insert',
  dataTableId: { __rl: true, mode: 'id', value: 'BHqPtAKnMtZTS5Q0', cachedResultName: 'Gerente IA · eventos' },
  columns: { mappingMode: 'defineBelow', value: {
    quando: '={{ $json.evento.quando }}', dia: '={{ $json.evento.dia }}', evento: '={{ $json.evento.evento }}', modo: '={{ $json.evento.modo }}',
    chat_id: '={{ $json.evento.chat_id }}', cliente: '={{ $json.evento.cliente }}', classe: '={{ $json.evento.classe }}', qtd_msgs: '={{ $json.evento.qtd_msgs }}',
    trava_palavra: '={{ $json.evento.trava_palavra }}', ref: '={{ $json.evento.ref }}', minutos: '={{ $json.evento.minutos }}' },
    matchingColumns: [], schema: [
      { id: 'quando', displayName: 'quando', type: 'dateTime', display: true }, { id: 'dia', displayName: 'dia', type: 'string', display: true },
      { id: 'evento', displayName: 'evento', type: 'string', display: true }, { id: 'modo', displayName: 'modo', type: 'string', display: true },
      { id: 'chat_id', displayName: 'chat_id', type: 'string', display: true }, { id: 'cliente', displayName: 'cliente', type: 'string', display: true },
      { id: 'classe', displayName: 'classe', type: 'string', display: true }, { id: 'qtd_msgs', displayName: 'qtd_msgs', type: 'number', display: true },
      { id: 'trava_palavra', displayName: 'trava_palavra', type: 'boolean', display: true }, { id: 'ref', displayName: 'ref', type: 'string', display: true },
      { id: 'minutos', displayName: 'minutos', type: 'number', display: true } ] },
  options: {} } } });

const nota = sticky('## Gerente IA · mandar para a máquina (V1)\nA cada 2 min: cards de PEDIDO criados pela Gerente (gerente_rascunhos com card_id e sem maquina_status) vão para a máquina pelo mesmo "mandar" da Central de Demandas (acesso do diretor lido da tabela de acesso; cliente TESTE usa o acesso de teste). Longo e shorts precisam do link do bruto (pego da mensagem do cliente). Sem link: card fica "Falta do cliente" com o Ismael. A máquina entrega em revisão para a equipe. Nada vai ao cliente aqui.', [], { color: 4 });

export default workflow('gerente-maquina', 'Gerente IA | Mandar para a máquina (V1)')
  .add(cada2).to(pendentes).to(acessos).to(preparar).to(mandar).to(resultado).to(marcarCard).to(gravar).to(avisos).to(avisar).to(eventos).to(gravarEv)
  .add(nota);
