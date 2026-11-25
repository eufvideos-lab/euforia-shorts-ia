import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const cada10 = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada 10 minutos', position: [0, 0], parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 10 }] } } } });

const fechados = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Cards fechados agora', position: [224, 0], credentials: { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } }, executeOnce: true,
  parameters: { method: 'POST', url: 'https://api.notion.com/v1/databases/74b3076a325749e3bac4ba6659215e48/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendHeaders: true,
    headerParameters: { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] }, sendBody: true, specifyBody: 'json',
    jsonBody: '={{ JSON.stringify($json.teste_codigos ? { filter: { or: $json.teste_codigos.map(n => ({ property: "Código", unique_id: { equals: n } })) }, page_size: 20 } : { filter: { and: [{ property: "Status", select: { equals: "Feito" } }, { timestamp: "last_edited_time", last_edited_time: { on_or_after: $now.minus({ minutes: 40 }).toISO() } }] }, page_size: 100 }) }}',
    options: {} } } });

const cobrancas = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Cards de responder grupo', position: [448, 0], credentials: { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } }, executeOnce: true, alwaysOutputData: true,
  parameters: { operation: 'executeQuery', query: "SELECT replace(card_id, '-', '') AS card_id, respondido_em, desde, grupo FROM gerente_cobranca WHERE card_id IS NOT NULL AND criado_em > now() - interval '20 days';", options: {} } } });

const decidir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Decidir trava', position: [672, 0], parameters: { jsCode: `// Trava de fechamento (Henrique 25/11, caso Jean Crapanzani):
// 1) Card "RESPONDER GRUPO" só fica Feito se a equipe respondeu de verdade no grupo (a Cobrança grava respondido_em; bom dia, "vou verificar" e resposta automática não contam). Senão volta para A fazer.
// 2) Card de entrega (Tipo diferente de Outro) só fica Feito com a prova em "Link da postagem" (link do canal/página/arquivo enviado ou print no Drive). Senão volta para Aprovado.
// Exceções: card feito pela máquina do Escritório ("Feito pela IA") ou com "[sem prova: diretoria]" na Obs.
const ATIVO_DESDE = new Date('2026-11-25T18:00:00Z');
const NL = String.fromCharCode(10);
const agora = DateTime.now().setZone('America/Recife');
const teste = !!($('A cada 10 minutos').first().json || {}).teste_codigos;
const sem = id => String(id || '').replace(/-/g, '');
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; if (v.url) return v.url; return ''; };
const resp = {};
for (const it of $('Cards de responder grupo').all()) if (it.json && it.json.card_id) resp[it.json.card_id] = it.json;
const out = [];
for (const it of $('Cards fechados agora').all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {};
  const status = txt(pr['Status']);
  if (!teste && (status !== 'Feito' || new Date(p.last_edited_time) < ATIVO_DESDE)) continue;
  const titulo = txt(pr['Entrega']);
  const tipo = txt(pr['Tipo']);
  const obs = txt(pr['Obs']);
  const link = (pr['Link da postagem'] || {}).url || '';
  const ia = txt(pr['🏢 Escritório IA']);
  const u = (pr['Código'] || {}).unique_id;
  const codigo = u ? (u.prefix ? u.prefix + '-' : '') + u.number : '';
  if (/\\[sem prova: diretoria\\]/i.test(obs) || ia === 'Feito pela IA') continue;
  let novo = '', motivo = '';
  if (/RESPONDER GRUPO/i.test(titulo)) {
    const r = resp[sem(p.id)];
    if (r && !r.respondido_em) { novo = 'A fazer'; motivo = 'Voltou para A fazer: ainda não há resposta de verdade da equipe no grupo (bom dia, ok, "vou verificar", "te retorno hoje" e resposta automática não contam). Responda pelo painel (Conversas › Sugerir resposta) e o card fecha sozinho.'; }
  } else if (tipo && tipo !== 'Outro' && !String(link).trim()) {
    novo = 'Aprovado'; motivo = 'Voltou para Aprovado: card de entrega só fica Feito com a prova. Cole em "Link da postagem" o link do que foi entregue (canal com o banner novo, página no ar, mensagem/arquivo enviado no grupo) ou o print salvo no Drive, e marque Feito de novo.';
  }
  if (!novo) continue;
  const linha = '[Trava ' + agora.toFormat('dd/MM HH:mm') + '] ' + motivo;
  out.push({ json: { teste, card_id: p.id, url: p.url, codigo, titulo, tipo, status_antes: status, novo, motivo,
    resp: ((pr['Responsável'] || {}).relation || []).map(x => sem(x.id)),
    corpo: JSON.stringify({ properties: { Status: { select: { name: novo } }, Obs: { rich_text: [{ text: { content: (linha + NL + obs).slice(0, 1990) } }] } } }) } });
}
return out;
` } } });

const valendo = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Só fora do teste', position: [896, 0], parameters: { jsCode: 'return $input.all().filter(i => !i.json.teste);' } } });

const reabrir = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Reabrir card', position: [1120, 0], credentials: { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } }, onError: 'continueRegularOutput',
  parameters: { method: 'PATCH', url: '=https://api.notion.com/v1/pages/{{ $json.card_id }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendHeaders: true,
    headerParameters: { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] }, sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}',
    options: { batching: { batch: { batchSize: 1, batchInterval: 400 } } } } } });

const avisos = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Avisos', position: [1344, 0], parameters: { jsCode: `// AVISAR_EQUIPE = false: por enquanto o aviso vai só para a diretoria (#avisos-escritório). O card já mostra o motivo na Obs.
// Com o OK do Henrique, true manda também no 1x1 do responsável.
const AVISAR_EQUIPE = false;
const NL = String.fromCharCode(10);
const ESCRITORIO_CANAL = '1560627456837427250';
const P = {
  '3ea98c0cdde081299709cf901fac7275': { user: '1490768736876237082', canal: '1556650881921978511' },
  '3ea98c0cdde0812d9cb4c41ce70df4ae': { user: '1410287139169763471', canal: '1556650886678454403' },
  '3ea98c0cdde08163bd16f0213b098cb5': { user: '827882215185973279', canal: '1556650896962879518' },
  '3ea98c0cdde0817e87aee637a96d4fd1': { user: '1470387767337816128', canal: '1556650902448771104' }
};
const base = $('Só fora do teste').all();
const out = [], diretoria = [];
$input.all().forEach((it, i) => {
  const b = (base[i] || {}).json; if (!b || !(it.json || {}).id) return;
  const l = '🔒 **' + b.titulo + '** (' + (b.codigo || 'card') + ') ' + (b.novo === 'A fazer' ? 'voltou para A fazer: sem resposta de verdade no grupo.' : 'voltou para Aprovado: marcado Feito sem a prova em Link da postagem.') + ' <' + b.url + '>';
  diretoria.push(l);
  if (AVISAR_EQUIPE) for (const r of b.resp) if (P[r]) out.push({ canal: P[r].canal, corpo: JSON.stringify({ content: ('<@' + P[r].user + '> ' + l + NL + b.motivo).slice(0, 1950), allowed_mentions: { users: [P[r].user] } }) });
});
if (diretoria.length) out.push({ canal: ESCRITORIO_CANAL, corpo: JSON.stringify({ content: ('**Trava de fechamento**' + NL + diretoria.join(NL)).slice(0, 1950), allowed_mentions: { parse: [] } }) });
return out.map(m => ({ json: m }));
` } } });

const mandar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Mandar no Discord', position: [1568, 0], credentials: { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } }, onError: 'continueRegularOutput',
  parameters: { method: 'POST', url: '=https://discord.com/api/v10/channels/{{ $json.canal }}/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}',
    options: { batching: { batch: { batchSize: 1, batchInterval: 1200 } } } } } });

const nota = sticky('## Gerente IA · Trava de fechamento (V1, 25/11, caso Jean)\nA cada 10 min olha os cards do Entregas que viraram **Feito** nos últimos 40 min.\n• **RESPONDER GRUPO** sem resposta de verdade no grupo (tabela gerente_cobranca, respondido_em) → volta para **A fazer**.\n• Card de entrega (Tipo ≠ Outro) sem **Link da postagem** → volta para **Aprovado**.\nMotivo vai na Obs do card; aviso na diretoria (#avisos-escritório). Exceções: Feito pela IA ou "[sem prova: diretoria]" na Obs. Teste: rodar com teste_codigos no gatilho (não grava nada).', [], { position: [0, 240], width: 900, height: 220, color: 4 });

export default workflow('gerente-trava-fechamento', 'Gerente IA | Trava de fechamento (V1)', { executionOrder: 'v1', availableInMCP: true, timezone: 'America/Recife' })
  .add(cada10).to(fechados).to(cobrancas).to(decidir).to(valendo).to(reabrir).to(avisos).to(mandar)
  .add(nota);
