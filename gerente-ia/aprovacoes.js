import { workflow, node, trigger, sticky, ifElse, merge } from '@n8n/workflow-sdk';

const cadaMinuto = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada 2 minutos', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 2 }] } } } });

const abertos = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Rascunhos abertos', executeOnce: true,
  parameters: { operation: 'executeQuery', query: "ALTER TABLE gerente_rascunhos ADD COLUMN IF NOT EXISTS painel_acao TEXT, ADD COLUMN IF NOT EXISTS painel_texto TEXT, ADD COLUMN IF NOT EXISTS painel_em TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS confirmar TEXT, ADD COLUMN IF NOT EXISTS confirmar_quem TEXT, ADD COLUMN IF NOT EXISTS confirmar_msg TEXT, ADD COLUMN IF NOT EXISTS confirmado TEXT, ADD COLUMN IF NOT EXISTS confirmar_em TIMESTAMPTZ;\nWITH team AS (\n  SELECT DISTINCT m.autor_jid FROM mensagens m\n  WHERE m.chat_id IN (SELECT chat_id FROM chats WHERE nome ILIKE '%pend%ncias%')\n    AND NOT m.from_me AND m.autor_jid IS NOT NULL\n  UNION SELECT '5581996928808@s.whatsapp.net'\n  UNION SELECT '5581995667045@s.whatsapp.net'\n)\nSELECT r.id, r.criado_em, r.chat_id, r.cliente, r.classe, r.urgencia, r.ultima_cliente, r.texto, r.card_id, r.card_url, r.card_corpo, r.discord_msg, r.status, r.texto_final, r.corrigida, r.nota, r.painel_acao, r.painel_texto, r.confirmar, r.confirmar_quem, r.confirmar_msg, r.confirmado,\n  EXISTS (SELECT 1 FROM mensagens m WHERE m.chat_id = r.chat_id AND m.enviado_em > r.ultima_cliente\n    AND (m.from_me OR COALESCE(m.autor_nome,'') ILIKE '%euforia%' OR m.autor_jid IN (SELECT autor_jid FROM team WHERE autor_jid IS NOT NULL))\n    AND NOT (m.chat_id = '120363414189297847@g.us' AND COALESCE(m.texto,'') ILIKE '[cliente]%')) AS equipe_respondeu\nFROM gerente_rascunhos r\nWHERE r.status IN ('aguardando', 'aprovado_espera', 'aprovado_confirmar') AND r.discord_msg IS NOT NULL AND r.criado_em > now() - interval '3 days'\nORDER BY r.id\nLIMIT 30;\n", options: {} },
  credentials: { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } } } });

const respostas = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Respostas no canal', executeOnce: true, onError: 'continueRegularOutput',
  parameters: { method: 'GET', url: 'https://discord.com/api/v10/channels/1567643418270634136/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
    sendQuery: true, queryParameters: { parameters: [{ name: 'limit', value: '100' }, { name: 'after', value: "={{ $('Rascunhos abertos').all().map(i => i.json.discord_msg).filter(Boolean).sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1))[0] }}" }] },
    options: { response: { response: { fullResponse: true, neverError: true } } } },
  credentials: { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } } } });

const lista = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Lista', parameters: { jsCode: "return $('Rascunhos abertos').all().filter(it => it.json.id).map((it, i) => ({ json: it.json, pairedItem: { item: i } }));\n" } } });

const lerMsg = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Ler mensagem do rascunho', onError: 'continueRegularOutput',
  parameters: { method: 'GET', url: '=https://discord.com/api/v10/channels/1567643418270634136/messages/{{ $json.discord_msg }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
    options: { batching: { batch: { batchSize: 1, batchInterval: 300 } }, response: { response: { fullResponse: true, neverError: true } } } },
  credentials: { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } } } });

const decidir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Decidir', parameters: { jsCode: "// Decide o que fazer com cada rascunho: primeiro toque vale. Resposta (reply) à mensagem = texto corrigido, e é ele que sai.\n// Trava de confirmação (Henrique 05/11): rascunho com \"confirmar\" só sai depois que o Rômulo/Ismael reagir ✅ no 1x1. Texto corrigido pelo Henrique passa direto.\nconst BOT = '1554810804065402901';\n// Henrique 05/11: rascunho novo se aprova só pelo painel; o Discord vira aviso (reação e resposta lá não valem mais).\nconst SO_PAINEL_DESDE = new Date('2026-11-05T13:30:00Z');\nconst QUEM = { romulo: 'Rômulo', ismael: 'Ismael' };\nconst agora = DateTime.now().setZone('America/Recife');\nconst noite = agora.hour >= 22 || agora.hour < 7;\nconst resp = (($('Respostas no canal').first().json || {}).body) || [];\nconst lista = Array.isArray(resp) ? resp : [];\nconst out = [];\nconst conta = (m, e) => { const x = ((m || {}).reactions || []).find(k => k.emoji && k.emoji.name === e); return x ? x.count - (x.me ? 1 : 0) : 0; };\n$input.all().forEach((cit, i) => {\n  const r = $('Lista').itemMatching(i).json;\n  const it = $('Ler mensagem do rascunho').itemMatching(i);\n  const st = it.json.statusCode; const m = it.json.body || {};\n  const cb = cit.json || {};\n  const cm = (cb.statusCode === 200 && cb.body && !Array.isArray(cb.body) && r.confirmar_msg && cb.body.id === r.confirmar_msg) ? cb.body : null;\n  const precisa = !!r.confirmar;\n  let novoConf = null;\n  if (precisa && !r.confirmado && cm) { if (conta(cm, '❌') > 0) novoConf = 'nao'; else if (conta(cm, '✅') > 0) novoConf = 'sim'; }\n  const conf = novoConf || r.confirmado || null;\n  const respostas = lista.filter(x => x.message_reference && x.message_reference.message_id === r.discord_msg && x.author && x.author.id !== BOT && !x.author.bot).sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));\n  const ultima = respostas[respostas.length - 1];\n  const velho = agora.diff(DateTime.fromJSDate(new Date(r.criado_em)), 'hours').hours > 24;\n  const soPainel = new Date(r.criado_em) >= SO_PAINEL_DESDE;\n  let acao = 'nada', texto = null, corrigida = false;\n  if (r.status === 'aprovado_confirmar') {\n    texto = r.texto_final; corrigida = !!r.corrigida;\n    if (!soPainel && st === 200 && conta(m, '❌') > 0) acao = 'cancelar';\n    else if (r.painel_acao === 'cancelar') acao = 'cancelar';\n    else if (conf === 'sim') acao = 'enviar';\n    else if (conf === 'nao') acao = 'bloq_nao';\n    else if (velho) acao = 'expirar_conf';\n  }\n  else if (r.status === 'aguardando' && r.painel_acao === 'cancelar') acao = 'cancelar';\n  else if (r.status === 'aguardando' && r.painel_acao === 'enviar') { acao = 'enviar'; texto = String(r.painel_texto || r.texto || '').trim().slice(0, 1500); corrigida = !!r.painel_texto && String(r.painel_texto).trim() !== String(r.texto || '').trim(); }\n  else if (r.status === 'aprovado_espera') { acao = noite ? 'nada' : 'enviar'; texto = r.texto_final; corrigida = !!r.corrigida; }\n  else if (soPainel) { if (velho) acao = 'expirar'; }\n  else if (st === 404) acao = 'sumiu';\n  else if (!(st >= 200 && st < 300)) acao = 'nada';\n  else if (ultima) {\n    const t = String(ultima.content || '').replace(/<@!?\\d+>/g, '').trim();\n    if (t.length >= 2) { acao = 'enviar'; texto = t.slice(0, 1500); corrigida = true; }\n    else if (r.nota !== 'sem_texto') acao = 'aviso_texto';\n  }\n  else if (conta(m, '❌') > 0) acao = 'cancelar';\n  else if (conta(m, '✅') > 0) { acao = 'enviar'; texto = r.texto; }\n  else if (velho) acao = 'expirar';\n  // Trava: sem o sim da equipe, não sai (a não ser que o Henrique tenha escrito o texto).\n  if (acao === 'enviar' && precisa && !corrigida && conf !== 'sim') {\n    if (conf === 'nao') acao = (novoConf || r.status === 'aprovado_confirmar') ? 'bloq_nao' : 'nada';\n    else acao = 'aguardar_conf';\n  }\n  if (acao === 'nada' && novoConf) acao = novoConf === 'sim' ? 'conf_sim' : 'conf_nao';\n  if (acao === 'enviar' && r.equipe_respondeu) acao = 'equipe';\n  if (acao === 'enviar' && noite) acao = 'esperar';\n  if (acao === 'enviar' && !String(texto || '').trim()) acao = 'nada';\n  if (acao === 'nada') return;\n  out.push({ json: { ...r, acao, texto_final: texto, corrigida, confirmado_novo: novoConf || '', quem_nome: QUEM[r.confirmar_quem] || 'time', criar_card: acao === 'enviar' && !!r.card_corpo && !r.card_id } });\n});\nreturn out;\n" } } });

const lerConf = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Ler resposta do 1x1', onError: 'continueRegularOutput',
  parameters: { method: 'GET', url: "={{ 'https://discord.com/api/v10/channels/' + ($('Lista').item.json.confirmar_quem === 'romulo' ? '1556650881921978511' : '1556650886678454403') + '/messages/' + ($('Lista').item.json.confirmar_msg || '1') }}", authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
    options: { batching: { batch: { batchSize: 1, batchInterval: 300 } }, response: { response: { fullResponse: true, neverError: true } } } },
  credentials: { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } } } });

const precisaCard = ifElse({ version: 2.2, config: { name: 'Precisa criar card?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: '={{ $json.criar_card }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } } });

const criarCard = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Criar card (hiperurgente)', onError: 'continueRegularOutput',
  parameters: { method: 'POST', url: 'https://api.notion.com/v1/pages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
    sendHeaders: true, headerParameters: { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] },
    sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.card_corpo }}', options: {} },
  credentials: { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } } } });

const anexarCard = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Anexar card', parameters: { jsCode: "return $input.all().map((it, i) => {\n  const b = $('Precisa criar card?').itemMatching(i).json;\n  const p = it.json || {};\n  const u = ((p.properties || {})['C\u00f3digo'] || {}).unique_id;\n  return { json: { ...b, card_id: p.id || null, card_url: p.url || null, card_codigo: u ? (u.prefix ? u.prefix + '-' : '') + u.number : '', card_novo: !!p.id } };\n});\n" } } });

const juntarCard = merge({ version: 3.2, config: { name: 'Juntar card', parameters: { mode: 'append' } } });

const vaiEnviar = ifElse({ version: 2.2, config: { name: 'Vai enviar?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: '={{ $json.acao === "enviar" }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } } });

const enviar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Mandar no grupo (suporte)', onError: 'continueRegularOutput',
  parameters: { method: 'POST', url: 'https://api.grupoeuforia.tech/message/sendText/suporte', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
    sendBody: true, specifyBody: 'json', jsonBody: "={{ JSON.stringify({ number: $json.chat_id, text: $json.texto_final + '\\n\\n*Érica, time de suporte, Grupo Euforia*' }) }}",
    options: { batching: { batch: { batchSize: 1, batchInterval: 1500 } }, response: { response: { fullResponse: true, neverError: true } } } },
  credentials: { httpHeaderAuth: { id: 'MqNLRX9duuYKJSR2', name: 'Evolution API' } } } });

const resultado = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Resultado do envio', parameters: { jsCode: "return $input.all().map((it, i) => {\n  const b = $('Vai enviar?').itemMatching(i).json;\n  const ok = it.json.statusCode >= 200 && it.json.statusCode < 300;\n  return { json: { ...b, enviado: ok } };\n});\n" } } });

const juntarEnvio = merge({ version: 3.2, config: { name: 'Juntar envio', parameters: { mode: 'append' } } });

const fechar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Fechar', parameters: { jsCode: "// Fecha cada rascunho: status no banco, nota no Discord (resposta à mensagem) e evento das métricas.\nconst agora = DateTime.now().setZone('America/Recife');\nconst hhmm = agora.toFormat('HH:mm');\nreturn $input.all().map(it => {\n  const x = it.json;\n  let status = x.status, nota = '', aviso = '', evento = '', ref = '';\n  if (x.acao === 'enviar') {\n    if (x.enviado) { status = 'enviado'; aviso = '✅ Enviado no grupo às ' + hhmm + (x.corrigida ? ' (com a sua correção)' : '') + (x.painel_acao ? ' · pelo painel' : '') + (x.card_novo ? ' · card criado: ' + (x.card_codigo || '') + ' <' + x.card_url + '>' : ''); evento = 'resposta_enviada'; ref = x.corrigida ? 'corrigida' : 'sem_correcao'; }\n    else { status = 'erro_envio'; aviso = '⚠️ Não consegui mandar no WhatsApp (número do suporte fora do ar?). Nada saiu. Pode tentar de novo pelo painel.'; evento = 'erro_envio'; }\n  }\n  if (x.acao === 'cancelar') { status = 'cancelado'; aviso = '❌ Cancelado' + (x.painel_acao ? ' pelo painel' : '') + '. Nada saiu.'; evento = 'cancelada'; }\n  if (x.acao === 'sumiu') { status = 'cancelado'; evento = 'cancelada'; ref = 'mensagem apagada'; }\n  if (x.acao === 'equipe') { status = 'equipe_respondeu'; aviso = 'A equipe já respondeu no grupo depois do cliente. Não mandei, para não duplicar.'; evento = 'equipe_respondeu'; }\n  if (x.acao === 'esperar') { status = 'aprovado_espera'; aviso = '🌙 Aprovado. Sai às 7h (silêncio das 22h às 7h).'; }\n  if (x.acao === 'expirar') { status = 'expirado'; aviso = '⏳ Passaram 24h sem decisão. Arquivei; nada saiu.'; evento = 'expirada'; }\n  if (x.acao === 'aguardar_conf') { status = 'aprovado_confirmar'; aviso = '👍 Aprovado. Sai assim que o ' + x.quem_nome + ' responder sim no 1x1 (' + x.confirmar + ').'; }\n  if (x.acao === 'conf_sim') { aviso = '✅ O ' + x.quem_nome + ' confirmou: ' + x.confirmar + ' Já pode aprovar no painel.'; }\n  if (x.acao === 'conf_nao' || x.acao === 'bloq_nao') { status = 'aguardando'; aviso = '🚫 O ' + x.quem_nome + ' respondeu NÃO: ' + x.confirmar + ' Não mandei. Corrija o texto no painel (Minha mesa › Aprovar) ou cancele.'; }\n  if (x.acao === 'expirar_conf') { status = 'expirado'; aviso = '⏳ O ' + x.quem_nome + ' não confirmou em 24h. Arquivei; nada saiu.'; evento = 'expirada'; ref = 'sem_confirmacao'; }\n  if (x.acao === 'aviso_texto') { nota = 'sem_texto'; aviso = 'Não consegui ler o texto da sua resposta. Responda de novo com a resposta marcando a Érica (@ ligado).'; }\n  const minutos = Math.max(0, Math.round(agora.diff(DateTime.fromJSDate(new Date(x.ultima_cliente)), 'minutes').minutes));\n  const base = { quando: agora.toISO(), dia: agora.toISODate(), modo: 'piloto', chat_id: x.chat_id, cliente: x.cliente, classe: x.classe, qtd_msgs: 0, trava_palavra: false, minutos };\n  const eventos = [];\n  if (evento) eventos.push({ ...base, evento, ref });\n  if (x.card_novo) eventos.push({ ...base, evento: 'demanda_criada', ref: x.card_codigo || x.card_id });\n  return { json: {\n    params: [String(x.id), status, x.texto_final || '', x.corrigida ? 'true' : 'false', x.card_id || '', x.card_url || '', nota || x.nota || '', x.confirmado_novo || ''],\n    discord: aviso ? JSON.stringify({ content: aviso.slice(0, 1900), message_reference: { message_id: x.discord_msg, fail_if_not_exists: false }, allowed_mentions: { parse: [] } }) : '',\n    eventos\n  } };\n});\n" } } });

const atualizar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Atualizar rascunho',
  parameters: { operation: 'executeQuery', query: "UPDATE gerente_rascunhos SET status = $2, texto_final = COALESCE(NULLIF($3, ''), texto_final), corrigida = ($4 = 'true'), decidido_em = now(),\n  enviado_em = CASE WHEN $2 = 'enviado' THEN now() ELSE enviado_em END,\n  card_id = COALESCE(NULLIF($5, ''), card_id), card_url = COALESCE(NULLIF($6, ''), card_url), nota = NULLIF($7, ''),\n  confirmado = COALESCE(NULLIF($8, ''), confirmado), painel_acao = CASE WHEN $2 = 'aguardando' THEN NULL ELSE painel_acao END, painel_texto = CASE WHEN $2 = 'aguardando' THEN NULL ELSE painel_texto END, confirmar_em = CASE WHEN NULLIF($8, '') IS NOT NULL THEN now() ELSE confirmar_em END\nWHERE id = $1::int RETURNING id;", options: { queryReplacement: '={{ $json.params }}' } },
  credentials: { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } } } });

const temAviso = node({ type: 'n8n-nodes-base.filter', version: 2.2, config: { name: 'Tem aviso?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: '={{ $json.discord }}', rightValue: '', operator: { type: 'string', operation: 'notEmpty', singleValue: true } }], combinator: 'and' } } } });

const avisar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Responder no #aprovações-gerente', onError: 'continueRegularOutput',
  parameters: { method: 'POST', url: 'https://discord.com/api/v10/channels/1567643418270634136/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
    sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.discord }}', options: { batching: { batch: { batchSize: 1, batchInterval: 1200 } } } },
  credentials: { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } } } });

const listaEventos = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Lista de eventos', parameters: { jsCode: "return $('Fechar').all().flatMap(i => i.json.eventos).map(e => ({ json: { evento: e } }));" } } });

const gravar = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Gravar eventos', parameters: { resource: 'row', operation: 'insert',
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

const nota = sticky('## Gerente IA · aprovações (V1)\nA cada 2 minutos lê os rascunhos abertos (tabela Postgres gerente_rascunhos) e o #aprovações-gerente. Primeiro toque vale: resposta (reply) à mensagem = texto corrigido, e é ele que sai; ❌ cancela; ✅ envia o rascunho. Antes de mandar confere se a equipe já respondeu no grupo (aí não manda). Silêncio 22h–7h: aprovado à noite sai às 7h. Sai pelo número suporte assinado Érica. Hiperurgente: cria o card no ✅. Sem decisão em 24h: expira.', [decidir, enviar, fechar], { color: 4 });

export default workflow('gerente-ia-aprovacoes', 'Gerente IA | Aprovações (V1)')
  .add(cadaMinuto)
  .to(abertos)
  .to(respostas)
  .to(lista)
  .to(lerMsg)
  .to(lerConf)
  .to(decidir)
  .to(precisaCard
    .onTrue(criarCard.to(anexarCard).to(juntarCard.input(0)))
    .onFalse(juntarCard.input(1)))
  .add(juntarCard)
  .to(vaiEnviar
    .onTrue(enviar.to(resultado).to(juntarEnvio.input(0)))
    .onFalse(juntarEnvio.input(1)))
  .add(juntarEnvio)
  .to(fechar)
  .to(atualizar)
  .add(fechar)
  .to(temAviso)
  .to(avisar)
  .add(fechar)
  .to(listaEventos)
  .to(gravar);
