import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

// Gerente IA | Pauta, risco e placar (05/11/2026). Henrique: "pode, vamos descer a lenha, minha equipe é muito júnior" / "quero mitigar os erros com eles".
// 8:00 seg–sáb: pauta do dia no 1x1 de cada um (vencidos, hoje, amanhã).
// 8:30 seg–sáb: alerta de risco de cliente só para a diretoria (#aprovações-gerente): reclamação, espera >1h, cards vencidos, cliente esfriando ou sumido.
// Sexta 17:30: placar da semana por pessoa (entregues, vencidos) no 1x1 de cada um e o geral na diretoria.
// Nada aqui fala com cliente. Sem valores, sem financeiro.
const PG = { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } };
const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const DISCORD = { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } };



// ---------- Pauta do dia ----------
const t8 = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'Pauta 8h (seg–sáb)', parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 8 * * 1-6' }] } } } });
const abertosA = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Cards abertos (pauta)', credentials: NOTION, executeOnce: true, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/74b3076a325749e3bac4ba6659215e48/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] }, sendBody: true, specifyBody: 'json',
  jsonBody: "={{ JSON.stringify({ page_size: 100, sorts: [{ property: 'Prazo', direction: 'ascending' }], filter: { and: [{ property: 'Status', select: { does_not_equal: 'Postado' } }, { property: 'Status', select: { does_not_equal: 'Cancelado' } }] } }) }}",
  options: { pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest', parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] }, paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.has_more }}', limitPagesFetched: true, maxRequests: 10 } } } } } });
const pauta = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar pautas', parameters: { jsCode: `const NL = String.fromCharCode(10);
const P = {
  romulo: { id: '3ea98c0c-dde0-8129-9709-cf901fac7275', canal: '1556650881921978511', user: '1490768736876237082' },
  ismael: { id: '3ea98c0c-dde0-812d-9cb4-c41ce70df4ae', canal: '1556650886678454403', user: '1410287139169763471' },
  victor: { id: '3ea98c0c-dde0-8182-a952-f3d9a5b73575', canal: '1556650891732459620', user: '1142062975071551528' },
  lorena: { id: '3ea98c0c-dde0-8163-bd16-f0213b098cb5', canal: '1556650896962879518', user: '827882215185973279' },
  daniel: { id: '3ea98c0c-dde0-817e-87ae-e637a96d4fd1', canal: '1556650902448771104', user: '1470387767337816128' }
};
const FORA = ['Aguardando cliente', 'Aprovado', 'Agendado'];
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; if (v.date) return v.date.start || ''; if (v.unique_id) return (v.unique_id.prefix ? v.unique_id.prefix + '-' : '') + v.unique_id.number; return ''; };
const agora = DateTime.now().setZone('America/Recife');
const hoje = agora.toISODate(), amanha = agora.plus({ days: 1 }).toISODate();
const ddmm = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '';
const cards = $input.all().flatMap(i => i.json.results || []).map(p => { const pr = p.properties || {}; return {
  titulo: txt(pr['Entrega']), codigo: txt(pr['Código']), status: txt(pr['Status']), prazo: txt(pr['Prazo']).slice(0, 10), postar: txt(pr['Postar em']).slice(0, 10),
  resp: ((pr['Responsável'] || {}).relation || []).map(x => x.id), url: p.url }; }).filter(c => !/^TESTE/i.test(c.titulo) && !FORA.includes(c.status));
const linha = c => '• **' + (c.codigo || 'card') + '** ' + c.titulo.slice(0, 70) + (c.prazo ? ' · prazo ' + ddmm(c.prazo) : '') + (c.postar ? ' · posta ' + ddmm(c.postar) : '');
const bloco = (nome, lista) => lista.length ? NL + '**' + nome + ' (' + lista.length + ')**' + NL + lista.slice(0, LIM).map(linha).join(NL) + (lista.length > LIM ? NL + '• e mais ' + (lista.length - LIM) + ' no painel' : '') + NL : '';
const LIM = 5;
const out = [];
for (const k of Object.keys(P)) {
  const meus = cards.filter(c => c.resp.includes(P[k].id));
  const venc = meus.filter(c => c.prazo && c.prazo < hoje);
  const hj = meus.filter(c => !venc.includes(c) && (c.prazo === hoje || c.postar === hoje));
  const am = meus.filter(c => !venc.includes(c) && !hj.includes(c) && (c.prazo === amanha || c.postar === amanha));
  let t = '☀️ <@' + P[k].user + '> **Sua pauta de hoje (' + agora.setLocale('pt-BR').toFormat('cccc dd/MM') + ')**' + NL;
  if (!venc.length && !hj.length && !am.length) t += 'Nada vencido nem para hoje ou amanhã. Puxe o próximo da Central de Demandas.';
  else {
    t += bloco('🔴 Vencidos, primeiro', venc) + bloco('📌 Para hoje', hj) + bloco('🗓️ Amanhã', am);
    t += NL + 'Abra no painel pelo código. Ordem: vencidos primeiro, depois o que posta hoje. Se algo não vai dar tempo, avise e combine prazo novo antes de vencer.';
  }
  out.push({ json: { canal: P[k].canal, corpo: JSON.stringify({ content: t.slice(0, 1950), allowed_mentions: { users: [P[k].user] } }) } });
}
return out;` } } });
const postA = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Mandar pautas', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: '=https://discord.com/api/v10/channels/{{ $json.canal }}/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}', options: { batching: { batch: { batchSize: 1, batchInterval: 1200 } } } } } });

// ---------- Risco de cliente ----------
const t830 = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'Risco 8:30 (seg–sáb)', parameters: { rule: { interval: [{ field: 'cronExpression', expression: '30 8 * * 1-6' }] } } } });
const sinais = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Sinais dos grupos', credentials: PG, executeOnce: true, parameters: { operation: 'executeQuery',
  query: `CREATE TABLE IF NOT EXISTS gerente_cobranca (chave TEXT PRIMARY KEY, chat_id TEXT, grupo TEXT, desde TIMESTAMPTZ, n1_em TIMESTAMPTZ, n2_em TIMESTAMPTZ, n3_em TIMESTAMPTZ, respondido_em TIMESTAMPTZ, criado_em TIMESTAMPTZ DEFAULT now());
WITH team AS (
  SELECT DISTINCT m.autor_jid FROM mensagens m
  WHERE m.chat_id IN (SELECT chat_id FROM chats WHERE nome ILIKE '%pend%ncias%') AND NOT m.from_me AND m.autor_jid IS NOT NULL
  UNION SELECT '5581996928808@s.whatsapp.net'
  UNION SELECT '5581995667045@s.whatsapp.net'
),
msgs AS (
  SELECT msg_id, min(chat_id) AS chat_id, min(enviado_em) AS enviado_em,
    bool_or(from_me) OR bool_or(COALESCE(autor_nome,'') ILIKE '%euforia%') OR bool_or(autor_jid IN (SELECT autor_jid FROM team WHERE autor_jid IS NOT NULL)) AS da_equipe,
    max(tipo) AS tipo, max(texto) AS texto
  FROM mensagens WHERE chat_id LIKE '%@g.us' AND enviado_em > now() - interval '14 days'
  GROUP BY msg_id
)
SELECT m.chat_id,
  count(*) FILTER (WHERE NOT m.da_equipe AND m.tipo NOT IN ('reactionMessage','stickerMessage','protocolMessage','pollUpdateMessage') AND m.enviado_em > now() - interval '7 days') AS cli7,
  count(*) FILTER (WHERE NOT m.da_equipe AND m.tipo NOT IN ('reactionMessage','stickerMessage','protocolMessage','pollUpdateMessage') AND m.enviado_em <= now() - interval '7 days') AS cli_ant,
  count(*) FILTER (WHERE NOT m.da_equipe AND m.enviado_em > now() - interval '7 days'
    AND lower(COALESCE(m.texto, '')) ~ '(cad[eê] |de novo|absurd|decepcion|insatisf|n[aã]o gostei|errad|[?][?]|demora|ningu[eé]m respond|sem resposta|cobrando|ter que cobrar)') AS queixas,
  EXTRACT(DAY FROM now() - max(m.enviado_em) FILTER (WHERE NOT m.da_equipe))::int AS dias_sem_falar,
  (SELECT count(*) FROM gerente_cobranca g WHERE g.chat_id = m.chat_id AND g.n2_em > now() - interval '7 days') AS esperas
FROM msgs m GROUP BY m.chat_id;`, options: {} } } });
const fichas = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Clientes ativos', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/3ddc91b406be49e98e630c298d9162d8/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] }, sendBody: true, specifyBody: 'json',
  jsonBody: "={{ JSON.stringify({ page_size: 100, filter: { property: 'Situação', select: { equals: 'Ativo' } } }) }}",
  options: { pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest', parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] }, paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.has_more }}', limitPagesFetched: true, maxRequests: 5 } } } } } });
const abertosB = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Cards abertos (risco)', credentials: NOTION, executeOnce: true, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/74b3076a325749e3bac4ba6659215e48/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] }, sendBody: true, specifyBody: 'json',
  jsonBody: "={{ JSON.stringify({ page_size: 100, sorts: [{ property: 'Prazo', direction: 'ascending' }], filter: { and: [{ property: 'Status', select: { does_not_equal: 'Postado' } }, { property: 'Status', select: { does_not_equal: 'Cancelado' } }] } }) }}",
  options: { pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest', parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] }, paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.has_more }}', limitPagesFetched: true, maxRequests: 10 } } } } } });
const risco = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar alerta de risco', parameters: { jsCode: `const NL = String.fromCharCode(10);
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; if (v.date) return v.date.start || ''; return ''; };
const agora = DateTime.now().setZone('America/Recife');
const hoje = agora.toISODate(), ha3 = agora.minus({ days: 3 }).toISODate();
const sinal = {};
for (const i of $('Sinais dos grupos').all()) if (i.json.chat_id) sinal[i.json.chat_id] = i.json;
const porCliente = {};
for (const p of $('Cards abertos (risco)').all().flatMap(i => i.json.results || [])) {
  const pr = p.properties || {};
  if (/^TESTE/i.test(txt(pr['Entrega']))) continue;
  const st = txt(pr['Status']), prazo = txt(pr['Prazo']).slice(0, 10);
  for (const c of ((pr['Cliente'] || {}).relation || [])) {
    const x = porCliente[c.id] = porCliente[c.id] || { venc: 0, aguard: 0 };
    if (st === 'Aguardando cliente') { if (prazo && prazo < ha3) x.aguard++; }
    else if (!['Aprovado', 'Agendado'].includes(st) && prazo && prazo < hoje) x.venc++;
  }
}
const lista = [];
for (const p of $('Clientes ativos').all().flatMap(i => i.json.results || [])) {
  const pr = p.properties || {};
  const nome = txt(pr['Cliente']);
  if (!nome || /^TESTE/i.test(nome)) continue;
  const g = txt(pr['Grupo WhatsApp (ID)']).trim();
  const s = sinal[g] || { cli7: 0, cli_ant: 0, queixas: 0, dias_sem_falar: null, esperas: 0 };
  const c = porCliente[p.id] || { venc: 0, aguard: 0 };
  const q = Number(s.queixas) || 0, e = Number(s.esperas) || 0, c7 = Number(s.cli7) || 0, ca = Number(s.cli_ant) || 0;
  const dias = s.dias_sem_falar == null ? 14 : Number(s.dias_sem_falar);
  const motivos = []; let score = 0;
  if (q) { motivos.push('reclamou ' + q + 'x na semana'); score += 3 * Math.min(q, 3); }
  if (e) { motivos.push('esperou mais de 1h por resposta ' + e + 'x'); score += 2 * Math.min(e, 3); }
  if (c.venc) { motivos.push(c.venc + ' card' + (c.venc > 1 ? 's' : '') + ' vencido' + (c.venc > 1 ? 's' : '')); score += Math.min(c.venc, 5); }
  if (ca >= 6 && c7 * 3 <= ca) { motivos.push('esfriou no grupo (' + ca + ' → ' + c7 + ' mensagens)'); score += 3; }
  if (g && dias >= 10) { motivos.push('sem falar no grupo há ' + (dias >= 14 ? 'mais de 14' : dias) + ' dias'); score += 2; }
  if (c.aguard) { motivos.push(c.aguard + ' peça' + (c.aguard > 1 ? 's' : '') + ' esperando aprovação dele há mais de 3 dias'); score += 1; }
  const atencao = !!(pr['🔴 Atenção redobrada'] || {}).checkbox;
  if (score && atencao) score += 2;
  if (score >= 6) lista.push({ nome: nome + (atencao ? ' 🔴' : ''), score, motivos, url: p.url });
}
lista.sort((a, b) => b.score - a.score);
let t = '🧭 **Clientes em risco hoje** (' + agora.setLocale('pt-BR').toFormat('cccc dd/MM') + ')' + NL;
if (!lista.length) t += '✅ Nenhum cliente com sinal forte de risco hoje.';
else { let n = 0; const ls = []; for (const x of lista) { const l = (n < 3 ? '🔴' : '🟠') + ' **[' + x.nome + '](<' + x.url + '>)** · ' + x.motivos.join(' · '); if (t.length + ls.join(NL).length + l.length > 1650 || n >= 8) break; ls.push(l); n++; } t += ls.join(NL) + (lista.length > n ? NL + '• e mais ' + (lista.length - n) + ' com sinal de risco' : '') + NL + NL; }
 t += '' + 'Sinais: reclamação, espera por resposta, card vencido, cliente esfriando ou sumido. Só a diretoria vê.';
return [{ json: { canal: '1567643418270634136', corpo: JSON.stringify({ content: t.slice(0, 1950), allowed_mentions: { parse: [] } }) } }];` } } });
const postB = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Mandar alerta de risco', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: '=https://discord.com/api/v10/channels/{{ $json.canal }}/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}', options: { batching: { batch: { batchSize: 1, batchInterval: 1200 } } } } } });

// ---------- Placar da semana ----------
const tSex = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'Placar sexta 17:30', parameters: { rule: { interval: [{ field: 'cronExpression', expression: '30 17 * * 5' }] } } } });
const esperasSem = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Esperas da semana', credentials: PG, executeOnce: true, parameters: { operation: 'executeQuery',
  query: `CREATE TABLE IF NOT EXISTS gerente_cobranca (chave TEXT PRIMARY KEY, chat_id TEXT, grupo TEXT, desde TIMESTAMPTZ, n1_em TIMESTAMPTZ, n2_em TIMESTAMPTZ, n3_em TIMESTAMPTZ, respondido_em TIMESTAMPTZ, criado_em TIMESTAMPTZ DEFAULT now());
SELECT count(*) FILTER (WHERE n2_em IS NOT NULL) AS mais1h, count(*) FILTER (WHERE n3_em IS NOT NULL) AS mais2h
FROM gerente_cobranca WHERE desde > now() - interval '5 days';`, options: {} } } });
const abertosC = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Cards abertos (placar)', credentials: NOTION, executeOnce: true, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/74b3076a325749e3bac4ba6659215e48/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] }, sendBody: true, specifyBody: 'json',
  jsonBody: "={{ JSON.stringify({ page_size: 100, sorts: [{ property: 'Prazo', direction: 'ascending' }], filter: { and: [{ property: 'Status', select: { does_not_equal: 'Postado' } }, { property: 'Status', select: { does_not_equal: 'Cancelado' } }] } }) }}",
  options: { pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest', parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] }, paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.has_more }}', limitPagesFetched: true, maxRequests: 10 } } } } } });
const feitos = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Entregues na semana', credentials: NOTION, executeOnce: true, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/74b3076a325749e3bac4ba6659215e48/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] }, sendBody: true, specifyBody: 'json',
  jsonBody: "={{ JSON.stringify({ page_size: 100, filter: { property: 'Concluído em', date: { on_or_after: $now.setZone('America/Recife').startOf('week').toISODate() } } }) }}",
  options: { pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest', parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] }, paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.has_more }}', limitPagesFetched: true, maxRequests: 5 } } } } } });
const placar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar placar', parameters: { jsCode: `const NL = String.fromCharCode(10);
const P = {
  romulo: { nome: 'Rômulo', id: '3ea98c0c-dde0-8129-9709-cf901fac7275', canal: '1556650881921978511', user: '1490768736876237082', grupos: true },
  ismael: { nome: 'Ismael', id: '3ea98c0c-dde0-812d-9cb4-c41ce70df4ae', canal: '1556650886678454403', user: '1410287139169763471', grupos: true },
  victor: { nome: 'Victor', id: '3ea98c0c-dde0-8182-a952-f3d9a5b73575', canal: '1556650891732459620', user: '1142062975071551528' },
  lorena: { nome: 'Lorena', id: '3ea98c0c-dde0-8163-bd16-f0213b098cb5', canal: '1556650896962879518', user: '827882215185973279' },
  daniel: { nome: 'Daniel', id: '3ea98c0c-dde0-817e-87ae-e637a96d4fd1', canal: '1556650902448771104', user: '1470387767337816128' }
};
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; if (v.date) return v.date.start || ''; return ''; };
const hoje = DateTime.now().setZone('America/Recife').toISODate();
const resp = p => (((p.properties || {})['Responsável'] || {}).relation || []).map(x => x.id);
const titulo = p => txt((p.properties || {})['Entrega']);
const abertos = $('Cards abertos (placar)').all().flatMap(i => i.json.results || []).filter(p => !/^TESTE/i.test(titulo(p)));
const feitos = $('Entregues na semana').all().flatMap(i => i.json.results || []).filter(p => !/^TESTE/i.test(titulo(p)));
const esp = $('Esperas da semana').first().json || {};
const linhas = [], out = [];
for (const k of Object.keys(P)) {
  const ent = feitos.filter(p => resp(p).includes(P[k].id)).length;
  const venc = abertos.filter(p => { const pr = p.properties || {}; const st = txt(pr['Status']); const pz = txt(pr['Prazo']).slice(0, 10); return resp(p).includes(P[k].id) && pz && pz < hoje && !['Aguardando cliente', 'Aprovado', 'Agendado'].includes(st); }).length;
  const sinal = venc === 0 ? '🟢' : venc <= 3 ? '🟡' : '🔴';
  linhas.push(sinal + ' **' + P[k].nome + '** · ' + ent + ' entregue' + (ent === 1 ? '' : 's') + ' · ' + venc + ' vencido' + (venc === 1 ? '' : 's'));
  let t = '🏁 <@' + P[k].user + '> **Seu placar da semana**' + NL + '• Entregues: **' + ent + '**' + NL + '• Cards com prazo vencido agora: **' + venc + '**' + NL;
  if (P[k].grupos) t += '• Clientes que esperaram mais de 1h no grupo (vocês dois cobrem): **' + (Number(esp.mais1h) || 0) + '**' + NL;
  t += NL + (venc === 0 ? 'Semana sem nada vencido. É esse o padrão. 👏' : 'Meta da próxima semana: zero vencido. Comece segunda pelos vencidos e avise antes de vencer o que não vai dar tempo.');
  out.push({ json: { canal: P[k].canal, corpo: JSON.stringify({ content: t.slice(0, 1950), allowed_mentions: { users: [P[k].user] } }) } });
}
const d = '🏁 **Placar da semana da equipe**' + NL + linhas.join(NL) + NL + NL + '**Grupos:** ' + (Number(esp.mais1h) || 0) + ' clientes esperaram mais de 1h, ' + (Number(esp.mais2h) || 0) + ' mais de 2h.' + NL + 'Cada um recebeu o seu no privado.';
out.push({ json: { canal: '1567643418270634136', corpo: JSON.stringify({ content: d.slice(0, 1950), allowed_mentions: { parse: [] } }) } });
return out;` } } });
const postC = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Mandar placar', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: '=https://discord.com/api/v10/channels/{{ $json.canal }}/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}', options: { batching: { batch: { batchSize: 1, batchInterval: 1200 } } } } } });

const nota = sticky('## Gerente IA · pauta, risco e placar (V1) · 8:00 seg–sáb: pauta do dia no 1x1 de Rômulo, Ismael, Victor, Lorena e Daniel (vencidos, hoje, amanhã). · 8:30 seg–sáb: clientes em risco só para a diretoria. · Sexta 17:30: placar da semana por pessoa no 1x1 e o geral na diretoria. · Nada fala com cliente.', [], { color: 4 });

export default workflow('gerente-pauta', 'Gerente IA | Pauta, risco e placar (V1)', { executionOrder: 'v1', availableInMCP: true, timezone: 'America/Recife' })
  .add(t8).to(abertosA).to(pauta).to(postA)
  .add(t830).to(sinais).to(fichas).to(abertosB).to(risco).to(postB)
  .add(tSex).to(esperasSem).to(abertosC).to(feitos).to(placar).to(postC)
  .add(nota);
