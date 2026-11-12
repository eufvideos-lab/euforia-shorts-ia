import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

// Gerente IA | Vigias do dia (12/11/2026). Henrique aprovou ("manda bala") os ajustes dos casos Regina e Maíra:
// D  · 14h (seg–sex): cards do Entregas com prazo HOJE ainda em "A fazer" vão para o 1x1 de quem é responsável
//      (na thread do dia, se a pessoa tiver); cards do Escritório e sem dono vão para o #avisos-escritório.
// SOS · 8:10 (seg–sáb): cliente ATIVO com Recuperação = 🚨 SOS ganha 🔴 Atenção redobrada sozinho (só liga, nunca desliga).
// Sem editor · 8:10: cliente ativo em produção sem Editor na ficha gera aviso no #avisos-escritório.
// Postado sem link · 8:10: card de peça que vai ao ar marcado "Postado" sem "Link da postagem" nos últimos 3 dias
//      volta para "Aprovado" com nota no Obs e aviso no #revisora-ia e no 1x1 do Ismael e do Daniel.
// Avisos de cliente/card só repetem depois de 7 dias (tabela vigia_avisos). Nada vai para cliente.
const PG = { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } };
const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const DISCORD = { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } };
const NH = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };

const as14 = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: '14h (seg–sex)', parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 14 * * 1-5' }] } } } });

const cardsHoje = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Cards de hoje em A fazer', credentials: NOTION, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/74b3076a325749e3bac4ba6659215e48/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NH, sendBody: true, specifyBody: 'json',
  jsonBody: "={{ JSON.stringify({ page_size: 100, filter: { and: [{ property: 'Prazo', date: { equals: $now.setZone('America/Recife').toISODate() } }, { property: 'Status', select: { equals: 'A fazer' } }] } }) }}",
  options: {} } } });

const threads = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Threads de hoje', credentials: PG, executeOnce: true, alwaysOutputData: true, parameters: { operation: 'executeQuery',
  query: `CREATE TABLE IF NOT EXISTS discord_thread_dia (pessoa TEXT NOT NULL, data DATE NOT NULL, canal TEXT, thread_id TEXT, criado_em TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (pessoa, data));
SELECT pessoa, canal, thread_id FROM discord_thread_dia WHERE data = (now() AT TIME ZONE 'America/Recife')::date;`, options: {} } } });

const montar14 = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar aviso das 14h', parameters: { jsCode: `const NL = String.fromCharCode(10);
const P = {
  romulo: { id: '3ea98c0c-dde0-8129-9709-cf901fac7275', canal: '1556650881921978511', user: '1490768736876237082' },
  ismael: { id: '3ea98c0c-dde0-812d-9cb4-c41ce70df4ae', canal: '1556650886678454403', user: '1410287139169763471' },
  lorena: { id: '3ea98c0c-dde0-8163-bd16-f0213b098cb5', canal: '1556650896962879518', user: '827882215185973279' },
  daniel: { id: '3ea98c0c-dde0-817e-87ae-e637a96d4fd1', canal: '1556650902448771104', user: '1470387767337816128' }
};
const ESCRITORIO_CANAL = '1560627456837427250';
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; if (v.date) return v.date.start || ''; if (v.unique_id) return (v.unique_id.prefix ? v.unique_id.prefix + '-' : '') + v.unique_id.number; return ''; };
const TH = {};
for (const r of $('Threads de hoje').all()) if (r.json && r.json.pessoa && r.json.thread_id) TH[r.json.pessoa] = r.json.thread_id;
const cards = $('Cards de hoje em A fazer').all().flatMap(i => i.json.results || []).map(p => { const pr = p.properties || {}; return {
  titulo: txt(pr['Entrega']), codigo: txt(pr['Código']), resp: ((pr['Responsável'] || {}).relation || []).map(x => x.id), url: p.url }; }).filter(c => !/^TESTE/i.test(c.titulo));
const linha = c => '• **' + (c.codigo || 'card') + '** ' + c.titulo.slice(0, 80);
const out = [];
const usados = new Set();
for (const k of Object.keys(P)) {
  const meus = cards.filter(c => c.resp.includes(P[k].id));
  if (!meus.length) continue;
  meus.forEach(c => usados.add(c));
  const t = '⏰ <@' + P[k].user + '> **São 14h e ' + (meus.length === 1 ? 'este card vence hoje e ainda está' : 'estes ' + meus.length + ' cards vencem hoje e ainda estão') + ' em "A fazer":**' + NL + meus.slice(0, 8).map(linha).join(NL) + (meus.length > 8 ? NL + '• e mais ' + (meus.length - 8) + ' no painel' : '') + NL + NL + 'Comece agora ou, se não vai dar tempo, mude o prazo no painel antes de vencer.';
  out.push({ json: { canal: TH[k] || P[k].canal, corpo: JSON.stringify({ content: t.slice(0, 1950), allowed_mentions: { users: [P[k].user] } }) } });
}
const resto = cards.filter(c => !usados.has(c));
if (resto.length) {
  const t = '⏰ **14h: ' + resto.length + ' card(s) do Escritório ou sem responsável vencem hoje e ainda estão em "A fazer":**' + NL + resto.slice(0, 10).map(c => linha(c) + ' · <' + c.url + '>').join(NL);
  out.push({ json: { canal: ESCRITORIO_CANAL, corpo: JSON.stringify({ content: t.slice(0, 1950), allowed_mentions: { parse: [] } }) } });
}
return out;` } } });

const mandar14 = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Mandar aviso das 14h', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: '=https://discord.com/api/v10/channels/{{ $json.canal }}/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}', options: { batching: { batch: { batchSize: 1, batchInterval: 1200 } } } } } });

const manha = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'Manhã 8:10 (seg–sáb)', parameters: { rule: { interval: [{ field: 'cronExpression', expression: '10 8 * * 1-6' }] } } } });

const clientes = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Clientes (vigia)', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/3ddc91b406be49e98e630c298d9162d8/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NH, sendBody: true, specifyBody: 'json',
  jsonBody: "={{ JSON.stringify({ page_size: 100, filter: { property: 'Situação', select: { does_not_equal: 'Encerrado' } } }) }}",
  options: { pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest', parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] }, paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.has_more }}', limitPagesFetched: true, maxRequests: 10 } } } } } });

const postados = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Postados sem link', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/74b3076a325749e3bac4ba6659215e48/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NH, sendBody: true, specifyBody: 'json',
  jsonBody: "={{ JSON.stringify({ page_size: 100, filter: { and: [{ property: 'Status', select: { equals: 'Postado' } }, { property: 'Link da postagem', url: { is_empty: true } }, { timestamp: 'last_edited_time', last_edited_time: { on_or_after: $now.minus({ days: 3 }).toISO() } }] } }) }}",
  options: {} } } });

const candidatos = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Achar o que corrigir', parameters: { jsCode: `const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; if (v.date) return v.date.start || ''; if (v.unique_id) return (v.unique_id.prefix ? v.unique_id.prefix + '-' : '') + v.unique_id.number; return ''; };
const VAI_AO_AR = ['Vídeo longo', 'Shorts', 'Carrossel', 'Arte', 'Banner', 'Blog'];
const sos = [], semEditor = [], semLink = [];
for (const it of $('Clientes (vigia)').all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {};
  const nome = txt(pr['Cliente']);
  if (!nome || /^TESTE/i.test(nome)) continue;
  const situacao = txt(pr['Situação']), fase = txt(pr['Fase']);
  if (situacao === 'Ativo' && txt(pr['Recuperação']) === '🚨 SOS' && !(pr['🔴 Atenção redobrada'] || {}).checkbox) sos.push({ id: p.id, nome, url: p.url });
  const editor = ((pr['Editor'] || {}).relation || []).length;
  if (situacao === 'Ativo' && !editor && !['1. Onboarding', '2. Setup (aprovação criativa)', '5. Saída'].includes(fase)) semEditor.push({ id: p.id, nome, url: p.url });
}
for (const it of $('Postados sem link').all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {};
  const titulo = txt(pr['Entrega']);
  // Card de AJUSTE não tem link próprio (a peça original é que vai ao ar).
  if (/^TESTE/i.test(titulo) || /\\| AJUSTE /i.test(titulo) || !VAI_AO_AR.includes(txt(pr['Tipo']))) continue;
  semLink.push({ id: p.id, codigo: txt(pr['Código']), titulo, obs: txt(pr['Obs']).slice(0, 1700), url: p.url });
}
const chaves = [...sos.map(x => 'sos:' + x.id), ...semEditor.map(x => 'editor:' + x.id), ...semLink.map(x => 'link:' + x.id)];
return [{ json: { sos, semEditor, semLink, chaves: JSON.stringify(chaves) } }];` } } });

const filtrar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Só avisos novos', credentials: PG, alwaysOutputData: true, parameters: { operation: 'executeQuery',
  query: `CREATE TABLE IF NOT EXISTS vigia_avisos (chave TEXT PRIMARY KEY, criado_em TIMESTAMPTZ DEFAULT now());
INSERT INTO vigia_avisos (chave) SELECT x FROM json_array_elements_text($1::json) AS x
ON CONFLICT (chave) DO UPDATE SET criado_em = now() WHERE vigia_avisos.criado_em < now() - interval '7 days'
RETURNING chave;`,
  options: { queryReplacement: '={{ [ $json.chaves ] }}' } } } });

const acoes = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar correções e avisos', parameters: { jsCode: `const NL = String.fromCharCode(10);
const c = $('Achar o que corrigir').first().json;
const novos = new Set($input.all().map(i => i.json && i.json.chave).filter(Boolean));
const agora = DateTime.now().setZone('America/Recife');
const ESCRITORIO = '1560627456837427250', REVISORA = '1567917509431263302';
const ISMAEL = { canal: '1556650886678454403', user: '1410287139169763471' }, DANIEL = { canal: '1556650902448771104', user: '1470387767337816128' };
const out = [];
const discord = (canal, content, users) => out.push({ json: { notion: false, canal, corpo: JSON.stringify({ content: content.slice(0, 1950), allowed_mentions: users ? { users } : { parse: [] } }) } });
const notion = (id, properties) => out.push({ json: { notion: true, url: 'https://api.notion.com/v1/pages/' + id, corpo: JSON.stringify({ properties }) } });
// SOS vira 🔴 (sempre corrige; só avisa se for novo)
for (const x of c.sos) notion(x.id, { '🔴 Atenção redobrada': { checkbox: true } });
const sosNovos = c.sos.filter(x => novos.has('sos:' + x.id));
if (sosNovos.length) discord(ESCRITORIO, '🔴 **Atenção redobrada ligada sozinha** (cliente em 🚨 SOS): ' + sosNovos.map(x => x.nome).join(', ') + '.' + NL + 'Passam a entrar na avaliação diária do Rômulo e do Ismael. Para tirar, mude a Recuperação na ficha e desmarque o 🔴.');
// Cliente ativo sem editor
const edNovos = c.semEditor.filter(x => novos.has('editor:' + x.id));
if (edNovos.length) discord(ESCRITORIO, '✂️ **Cliente ativo sem editor na ficha** (' + edNovos.length + '): ' + edNovos.map(x => x.nome).join(', ') + '.' + NL + 'Sem editor, tudo cai no Ismael. Defina o campo Editor na ficha do cliente.');
// Postado sem link volta para Aprovado
for (const x of c.semLink) {
  const linha = '[Revisora IA ' + agora.toFormat('dd/MM HH:mm') + '] voltou de Postado para Aprovado: falta o link da postagem. Marque "Postei" no painel com o link.';
  notion(x.id, { 'Status': { select: { name: 'Aprovado' } }, 'Obs': { rich_text: [{ text: { content: (linha + NL + (x.obs || '')).slice(0, 1900) } }] } });
}
const lkNovos = c.semLink.filter(x => novos.has('link:' + x.id));
if (lkNovos.length) {
  const lista = lkNovos.slice(0, 10).map(x => '• **' + (x.codigo || 'card') + '** ' + x.titulo.slice(0, 80)).join(NL);
  discord(REVISORA, '🔎 **Postado sem link** (' + lkNovos.length + '): voltei para Aprovado.' + NL + lista);
  discord(ISMAEL.canal, '🔎 <@' + ISMAEL.user + '> estes cards estavam como **Postado sem o link da postagem** e voltaram para **Aprovado**:' + NL + lista + NL + NL + 'Se já foi ao ar, marque "Postei" no painel com o link. Se não foi, poste e marque.', [ISMAEL.user]);
  discord(DANIEL.canal, '🔎 <@' + DANIEL.user + '> estes cards estavam como **Postado sem o link da postagem** e voltaram para **Aprovado**:' + NL + lista + NL + NL + 'Se já foi ao ar, marque "Postei" no painel com o link. Se não foi, poste e marque.', [DANIEL.user]);
}
return out;` } } });

const ehNotion = ifElse({ version: 2.2, config: { name: 'É correção no Notion?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: '={{ $json.notion }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } } });

const corrigir = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Corrigir no Notion', credentials: NOTION, onError: 'continueRegularOutput', parameters: {
  method: 'PATCH', url: '={{ $json.url }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendHeaders: true, headerParameters: NH,
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}', options: { batching: { batch: { batchSize: 1, batchInterval: 400 } } } } } });

const avisar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Avisar no Discord', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: '=https://discord.com/api/v10/channels/{{ $json.canal }}/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}', options: { batching: { batch: { batchSize: 1, batchInterval: 1200 } } } } } });

const nota = sticky('## Gerente IA · vigias do dia (V1)\n**14h seg–sex:** cards com prazo hoje ainda em "A fazer" → 1x1 do responsável (thread do dia se houver); Escritório/sem dono → #avisos-escritório.\n**8:10 seg–sáb:** SOS liga 🔴; cliente ativo sem Editor → #avisos-escritório; peça Postado sem link (3 dias) volta para Aprovado + aviso no #revisora-ia e no 1x1 do Ismael e do Daniel. Avisos só repetem após 7 dias (vigia_avisos). Nada vai ao cliente.', [montar14], { color: 5 });

export default workflow('gerente-vigias-do-dia', 'Gerente IA | Vigias do dia (V1)', { executionOrder: 'v1', availableInMCP: true, timezone: 'America/Recife' })
  .add(as14).to(cardsHoje).to(threads).to(montar14).to(mandar14)
  .add(manha).to(clientes).to(postados).to(candidatos).to(filtrar).to(acoes)
  .to(ehNotion.onTrue(corrigir).onFalse(avisar))
  .add(nota);
