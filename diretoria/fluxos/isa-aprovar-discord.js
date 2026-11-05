import { workflow, node, trigger, ifElse, merge, sticky } from '@n8n/workflow-sdk';

// Isa | Aprovações pelo Discord (V1): cada sugestão aberta da Isa vira um cartão no #aprovações-isa.
// ✅ envia o rascunho · ❌ recusa · 👍 já resolvi · responder o cartão = enviar o texto da resposta.
// Envia pelo WhatsApp da Isabela, assinado "Isabela, time administrativo, Grupo Euforia". Silêncio 22h-7h (sai às 7h).
const PG = { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } };
const DISCORD = { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } };
const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const EVO = { httpHeaderAuth: { id: 'MqNLRX9duuYKJSR2', name: 'Evolution API' } };
const CH = 'https://discord.com/api/v10/channels/1567878609060765718/messages';

const cada1 = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada minuto', parameters: {
  rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] } } } });

// ---------- A) Postar sugestões novas ----------
const novas = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Sugestões novas', credentials: PG, executeOnce: true, parameters: {
  operation: 'executeQuery',
  query: `SELECT id, contato, quem, gravidade, categoria, resumo, acao, texto, tarefa, primeira_cliente, mensagens
FROM isa_sugestoes WHERE status = 'aguardando' AND discord_msg IS NULL ORDER BY id LIMIT 15;`, options: {} } } });

const cartao = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar aviso', parameters: { jsCode: `// Um aviso curto por rodada: quem tem pendência nova no painel. A decisão é no Painel Central (aba Isa).
const NL = String.fromCharCode(10);
const CAT = { rescisao: 'rescisão', cancelamento: 'cancelamento', juridico: 'jurídico', reclamacao: 'reclamação', renegociacao: 'renegociação', cobranca: 'cobrança', pagamento: 'pagamento', nota_fiscal: 'nota fiscal', contrato: 'contrato', documento: 'documento', duvida: 'dúvida' };
const G = { serio: '🔴', atencao: '🟠', normal: '⚪' };
const L = $input.all().map(it => it.json).filter(r => r.id);
if (!L.length) return [];
const linhas = L.map(r => G[r.gravidade] + ' **' + r.contato + '** · ' + (CAT[r.categoria] || r.categoria || 'mensagem'));
const t = '📨 **Isa · ' + (L.length === 1 ? '1 pendência nova' : L.length + ' pendências novas') + ' no seu painel**' + NL + linhas.join(NL) + NL +
  'Aprove em Painel Central › Minha mesa › **Isa**.';
return [{ json: { ids: L.map(r => r.id).join(','), corpo: JSON.stringify({ content: t.slice(0, 1950), allowed_mentions: { parse: [] } }) } }];` } } });

const postar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Avisar no #aprovações-isa', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: CH, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}',
  options: { response: { response: { fullResponse: true, neverError: true } } } } } });

const gravarMsg = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Marcar avisadas', credentials: PG, parameters: {
  operation: 'executeQuery',
  query: `UPDATE isa_sugestoes SET discord_msg = $2, discord_fechado = true WHERE id = ANY(string_to_array($1, ',')::int[]) AND $2 <> '' RETURNING id;`,
  options: { queryReplacement: "={{ [ $('Montar aviso').item.json.ids, String(($json.body && $json.body.id) || '') ] }}" } } } });

// ---------- B) Ler decisões ----------
const abertas = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Cartões abertos', credentials: PG, executeOnce: true, parameters: {
  operation: 'executeQuery',
  query: `SELECT s.id, s.chat_id, s.contato, s.status, s.texto, s.texto_final, s.discord_msg, s.nota, s.criado_em,
  EXISTS (SELECT 1 FROM mensagens m WHERE m.chat_id = s.chat_id AND m.origem = 'isabela' AND m.from_me AND m.enviado_em > s.ultima_cliente) AS ja_respondida
FROM isa_sugestoes s
WHERE s.discord_msg IS NOT NULL AND NOT COALESCE(s.discord_fechado, false) AND s.status <> 'enviando'
ORDER BY s.id LIMIT 30;`, options: {} } } });

const respostas = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Respostas no canal', credentials: DISCORD, executeOnce: true, onError: 'continueRegularOutput', parameters: {
  method: 'GET', url: CH, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendQuery: true, queryParameters: { parameters: [{ name: 'limit', value: '100' },
    { name: 'after', value: "={{ $('Cartões abertos').all().map(i => i.json.discord_msg).filter(Boolean).sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1))[0] }}" }] },
  options: { response: { response: { fullResponse: true, neverError: true } } } } } });

const lista = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Lista', parameters: { jsCode: `return $('Cartões abertos').all().filter(it => it.json.id).map((it, i) => ({ json: it.json, pairedItem: { item: i } }));` } } });

const lerCartao = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Ler cartão', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'GET', url: "={{ '" + CH + "/' + $json.discord_msg }}", authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  options: { batching: { batch: { batchSize: 1, batchInterval: 300 } }, response: { response: { fullResponse: true, neverError: true } } } } } });

const decidir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Decidir', parameters: { jsCode: `// Primeiro toque vale. Resposta ao cartão = texto que sai (tem prioridade sobre as reações).
const NL = String.fromCharCode(10);
const BOT = '1554810804065402901';
const ASSINA = '*Isabela, time administrativo, Grupo Euforia*';
const agora = DateTime.now().setZone('America/Recife');
const noite = agora.hour >= 22 || agora.hour < 7;
const resp = (($('Respostas no canal').first().json || {}).body) || [];
const lista = Array.isArray(resp) ? resp : [];
const out = [];
$input.all().forEach((it, i) => {
  const r = $('Lista').itemMatching(i).json;
  const st = it.json.statusCode; const m = it.json.body || {};
  const conta = e => { const x = (m.reactions || []).find(k => k.emoji && k.emoji.name === e); return x ? x.count - (x.me ? 1 : 0) : 0; };
  const resps = lista.filter(x => x.message_reference && x.message_reference.message_id === r.discord_msg && x.author && x.author.id !== BOT && !x.author.bot)
    .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
  const ultima = resps[resps.length - 1];
  let acao = 'nada', texto = null;
  if (r.status !== 'aguardando' && r.status !== 'aprovado_espera') acao = 'fechar';
  else if (r.status === 'aprovado_espera') { acao = noite ? 'nada' : 'enviar'; texto = r.texto_final; }
  else if (st === 404) acao = 'sumiu';
  else if (!(st >= 200 && st < 300)) acao = 'nada';
  else if (ultima && r.nota !== 'resp:' + ultima.id) {
    const t = String(ultima.content || '').replace(/<@!?\\d+>/g, '').replace(/^\`\`\`|\`\`\`$/g, '').trim();
    if (t.length >= 2) { acao = 'enviar'; texto = t.slice(0, 3000); }
    else acao = 'aviso_texto';
  }
  else if (conta('❌') > 0) acao = 'recusar';
  else if (conta('👍') > 0) acao = 'resolver';
  else if (conta('✅') > 0) {
    if (String(r.texto || '').trim().length >= 2) { acao = 'enviar'; texto = r.texto; }
    else acao = 'sem_rascunho';
  }
  if (acao === 'enviar' && r.status === 'aguardando' && r.nota === 'erro_envio') acao = 'nada';
  if (acao === 'enviar' && /henrique|\\bflau\\b/i.test(texto || '')) acao = 'nome';
  if (acao === 'enviar' && r.ja_respondida) acao = 'respondida';
  if (acao === 'enviar' && noite) acao = 'esperar';
  // avisos que já foram dados não se repetem
  if (['aviso_texto', 'sem_rascunho', 'nome'].includes(acao) && String(r.nota || '').startsWith(acao)) acao = 'nada';
  if (acao === 'nada') return;
  let final = String(texto || '').trim();
  if (final && !/isabela, time administrativo, grupo euforia/i.test(final)) final = final + NL + NL + ASSINA;
  out.push({ json: { ...r, acao, texto_final: final, resp_id: ultima ? ultima.id : '', corpo: JSON.stringify({ number: r.chat_id, text: final }) } });
});
return out;` } } });

const vaiEnviar = ifElse({ version: 2.2, config: { name: 'Vai enviar?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.acao === "enviar" }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } } });

const reservar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Reservar envio', credentials: PG, parameters: {
  operation: 'executeQuery',
  query: `UPDATE isa_sugestoes SET status = 'enviando' WHERE id = $1::int AND status IN ('aguardando', 'aprovado_espera') RETURNING id;`,
  options: { queryReplacement: '={{ [ $json.id ] }}' } } } });

const mandar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Mandar pela Isabela', credentials: EVO, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://api.grupoeuforia.tech/message/sendText/isabela', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: "={{ $('Vai enviar?').item.json.corpo }}",
  options: { batching: { batch: { batchSize: 1, batchInterval: 1500 } }, response: { response: { fullResponse: true, neverError: true } } } } } });

const resultado = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Resultado do envio', parameters: { jsCode: `return $input.all().map((it, i) => {
  const b = $('Vai enviar?').itemMatching(i).json;
  const ok = it.json.statusCode >= 200 && it.json.statusCode < 300;
  return { json: { ...b, enviado: ok, status_lido: 'enviando' } };
});` } } });

const juntar = merge({ version: 3.2, config: { name: 'Juntar', parameters: { mode: 'append' } } });

const fechar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Fechar', parameters: { jsCode: `// Status no banco + nota no Discord (resposta ao cartão).
const agora = DateTime.now().setZone('America/Recife');
const hhmm = agora.toFormat('HH:mm');
const FIM = { enviado: '✅ Enviado pelo painel. Nada mais a fazer aqui.', recusado: '❌ Recusado pelo painel. Nada saiu.', resolvido: '👍 Marcado como resolvido no painel.',
  arquivada: 'Arquivada.', substituida: '🔁 O contato mandou mais mensagens. Saiu um cartão novo, mais atual; este fica sem efeito.',
  respondida_fora: 'A Isabela respondeu por outro caminho (celular ou Telegram). Fechei; nada saiu daqui.',
  refeita: '🔁 Refiz esta sugestão com as regras novas (prazo de 1 dia útil e to-do no painel). Ela está no painel (aba Isa).' };
return $input.all().map(it => {
  const x = it.json;
  const lido = x.status_lido || x.status;
  let status = x.status === 'enviando' ? 'aguardando' : x.status, nota = x.nota || '', aviso = '', fecha = false, decide = false, texto = '';
  if (x.acao === 'enviar') {
    if (x.enviado) { status = 'enviado'; fecha = true; decide = true; texto = x.texto_final; aviso = '✅ Enviado para ' + x.contato + ' às ' + hhmm + (x.resp_id ? ' (com o seu texto)' : '') + '.'; }
    else { status = 'aguardando'; nota = 'erro_envio'; aviso = '⚠️ O WhatsApp da Isabela não aceitou (número desconectado?). Nada saiu. Tente pelo Painel Central › Minha mesa › Isa.'; }
  }
  if (x.acao === 'fechar') { fecha = true; aviso = x.nota === 'fora da Isa' ? 'Fechado: esse contato saiu da Isa, a seu pedido.' : (FIM[x.status] || ('Fechado (' + x.status + ').')); }
  if (x.acao === 'recusar') { status = 'recusado'; fecha = true; decide = true; aviso = '❌ Recusado. Nada saiu.'; }
  if (x.acao === 'resolver') { status = 'resolvido'; fecha = true; decide = true; aviso = '👍 Marcado como resolvido. Nada saiu.'; }
  if (x.acao === 'sumiu') { fecha = true; }
  if (x.acao === 'respondida') { status = 'respondida_fora'; fecha = true; decide = true; aviso = 'A Isabela já respondeu esse contato por outro caminho. Não mandei, para não duplicar.'; }
  if (x.acao === 'esperar') { status = 'aprovado_espera'; decide = true; texto = x.texto_final; aviso = '🌙 Aprovado. Sai às 7h (silêncio das 22h às 7h).'; }
  if (x.acao === 'aviso_texto') { nota = 'aviso_texto'; aviso = 'Não consegui ler o texto da sua resposta. Responda o cartão de novo, só com o texto que deve sair.'; }
  if (x.acao === 'sem_rascunho') { nota = 'sem_rascunho'; aviso = 'Esse cartão não tem rascunho. Responda esta mensagem com o texto que a Isabela deve mandar, ou use ❌ / 👍.'; }
  if (x.acao === 'nome') { nota = 'nome:' + (x.resp_id || ''); aviso = 'O texto cita o seu nome. Para cliente, use "a direção". Responda de novo com o texto ajustado.'; }
  return { json: {
    params: [String(x.id), status, texto || '', nota || '', fecha ? 'true' : 'false', decide ? 'true' : 'false', lido],
    discord: aviso ? JSON.stringify({ content: aviso.slice(0, 1900), message_reference: { message_id: x.discord_msg, fail_if_not_exists: false }, allowed_mentions: { parse: [] } }) : ''
  } };
});` } } });

const atualizar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Atualizar sugestão', credentials: PG, parameters: {
  operation: 'executeQuery',
  query: `UPDATE isa_sugestoes SET status = $2, texto_final = COALESCE(NULLIF($3, ''), texto_final), nota = NULLIF($4, ''),
  discord_fechado = ($5 = 'true'), decidido_em = CASE WHEN $6 = 'true' THEN now() ELSE decidido_em END,
  enviado_em = CASE WHEN $2 = 'enviado' AND enviado_em IS NULL THEN now() ELSE enviado_em END
WHERE id = $1::int AND status = $7 RETURNING id;`,
  options: { queryReplacement: '={{ $json.params }}' } } } });

const temAviso = node({ type: 'n8n-nodes-base.filter', version: 2.2, config: { name: 'Tem aviso?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.discord }}', rightValue: '', operator: { type: 'string', operation: 'notEmpty', singleValue: true } }], combinator: 'and' } } } });

const avisar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Responder no cartão', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: CH, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.discord }}', options: { batching: { batch: { batchSize: 1, batchInterval: 1200 } } } } } });

// ---------- C) Enviado com tarefa: vira to-do no Painel Central (✅ Minhas Pendências) ----------
const comTarefa = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Enviados com tarefa', credentials: PG, executeOnce: true, parameters: {
  operation: 'executeQuery',
  query: `SELECT id, contato, gravidade, categoria, resumo, tarefa, texto_final, enviado_em FROM isa_sugestoes
WHERE status = 'enviado' AND COALESCE(tarefa, '') <> '' AND todo_id IS NULL AND enviado_em > now() - interval '3 days' ORDER BY id LIMIT 5;`, options: {} } } });

const montarTodo = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar to-do', parameters: { jsCode: `const NL = String.fromCharCode(10);
const SETOR = { pagamento: 'Financeiro', cobranca: 'Financeiro', nota_fiscal: 'Financeiro', renegociacao: 'Clientes', rescisao: 'Clientes', cancelamento: 'Clientes', reclamacao: 'Clientes', juridico: 'Jurídico', contrato: 'Clientes', documento: 'Clientes', equipe: 'Equipe' };
const rt = t => ({ rich_text: (String(t).match(/[^]{1,1990}/g) || []).slice(0, 4).map(x => ({ type: 'text', text: { content: x } })) });
return $input.all().filter(it => it.json.id).map(it => {
  const r = it.json;
  let d = DateTime.fromJSDate(new Date(r.enviado_em)).setZone('America/Recife').plus({ days: 1 });
  while (d.weekday > 5) d = d.plus({ days: 1 });
  const pr = {
    'Pendência': { title: [{ type: 'text', text: { content: (r.tarefa + ' — ' + r.contato).slice(0, 300) } }] },
    'Status': { select: { name: 'A fazer' } }, 'Responsável': { select: { name: 'Flau' } },
    'Data limite': { date: { start: d.toISODate() } },
    'Prioridade': { select: { name: r.gravidade === 'serio' ? '🔴 Urgente' : '🟠 Alta' } },
    'Setor': { select: { name: SETOR[r.categoria] || 'Clientes' } },
    'Contexto': rt('Isa #' + r.id + ' · ' + (r.resumo || '') + NL + NL + 'Resposta enviada pela Isabela:' + NL + (r.texto_final || ''))
  };
  return { json: { id: r.id, corpo: JSON.stringify({ parent: { database_id: '0fbba4fb020149aba045b4e34436a1cd' }, properties: pr }) } };
});` } } });

const criarTodo = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Criar to-do no Notion', credentials: NOTION, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/pages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] },
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}',
  options: { batching: { batch: { batchSize: 1, batchInterval: 500 } }, response: { response: { neverError: true } } } } } });

const marcarTodo = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Marcar to-do e copiar', credentials: PG, parameters: {
  operation: 'executeQuery',
  query: `WITH u AS (UPDATE isa_sugestoes SET todo_id = $2 WHERE id = $1::int RETURNING id)
INSERT INTO notion_cache (db, id, props, criado, editado, arquivado, visto_em)
SELECT 'pendencias', $2, $3::jsonb, now(), now(), false, now() WHERE $2 NOT IN ('', 'erro')
ON CONFLICT (db, id) DO UPDATE SET props = EXCLUDED.props, editado = EXCLUDED.editado, arquivado = false, visto_em = now();`,
  options: { queryReplacement: "={{ [ $('Montar to-do').item.json.id, ($json.object === 'page' && $json.id) ? String($json.id).replace(/-/g, '') : 'erro', JSON.stringify($json.properties || {}) ] }}" } } } });

const nota = sticky('## Isa · avisos e to-do (V2)\n05/11: a pedido do Henrique, a aprovação é só no Painel Central (aba Isa). (A) Um aviso curto no #aprovações-isa com quem tem pendência nova. (B) Cartões antigos (V1) ainda leem ✅/❌/👍/resposta até fecharem e recebem nota quando decididos no painel. (C) Enviado com tarefa vira to-do no ✅ Minhas Pendências (Flau, próximo dia útil). Envio pela Isabela com assinatura; 22h-7h sai às 7h; "enviando" reserva para não sair duas vezes.', [], { color: 4 });

export default workflow('isa-aprovar-discord', 'Isa | Avisos e to-do (V2)')
  .add(cada1).to(novas).to(cartao).to(postar).to(gravarMsg)
  .add(cada1).to(abertas).to(respostas).to(lista).to(lerCartao).to(decidir)
  .to(vaiEnviar.onTrue(reservar.to(mandar).to(resultado).to(juntar.input(0))).onFalse(juntar.input(1)))
  .add(juntar).to(fechar)
  .add(fechar).to(atualizar)
  .add(fechar).to(temAviso).to(avisar)
  .add(cada1).to(comTarefa).to(montarTodo).to(criarTodo).to(marcarTodo)
  .add(nota);
