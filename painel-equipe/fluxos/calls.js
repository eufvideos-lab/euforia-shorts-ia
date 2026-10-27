import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };
const AGENDA = { googleCalendarOAuth2Api: { id: '3WJH3L4Izc9Ytx7o', name: 'Google Agenda Euforia' } };
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const ACESSO = { __rl: true, mode: 'id', value: 'ilXDZWGAcOjoajx7', cachedResultName: 'Painel equipe · acesso' };

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Pedir próximas calls', parameters: {
  httpMethod: 'POST', path: 'euforia-painel-calls', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

const ler = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler pedido', parameters: { jsCode: `const b = ($input.first().json.body) || {};
const u = String(b.u || '').toLowerCase();
return [{ json: { u: /^[0-9a-f]{24}$/.test(u) ? u : 'x', pin: String(b.pin || '').replace(/[^0-9]/g, '').slice(0, 6) } }];
` } } });

const acesso = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Achar pessoa', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: ACESSO, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'token', condition: 'eq', keyValue: '={{ $json.u }}' }] }, limit: 1 } } });

// Só Ismael, Rômulo e diretoria (e o usuário de teste) veem a agenda de calls.
const validar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validar acesso', parameters: { jsCode: `const p = $('Ler pedido').first().json;
const r = $input.first().json || {};
const ok = !!r.token && r.token === p.u && r.ativo === true && String(r.pin) === p.pin && ['revisor', 'calls', 'diretor', 'teste'].includes(r.papel);
const agora = DateTime.now().setZone('America/Recife');
return [{ json: { ok, de: agora.minus({ hours: 2 }).toISO(), ate: agora.plus({ days: 21 }).endOf('day').toISO(), resposta: { ok: false, motivo: 'acesso' } } }];
` } } });

const podeSeguir = ifElse({ version: 2.2, config: { name: 'Acesso válido?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const eventos = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Eventos da agenda', credentials: AGENDA, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: 'https://www.googleapis.com/calendar/v3/calendars/estrategia%40euforiamedia.com.br/events',
  authentication: 'predefinedCredentialType', nodeCredentialType: 'googleCalendarOAuth2Api', sendQuery: true,
  queryParameters: { parameters: [{ name: 'timeMin', value: '={{ $json.de }}' }, { name: 'timeMax', value: '={{ $json.ate }}' },
    { name: 'singleEvents', value: 'true' }, { name: 'orderBy', value: 'startTime' }, { name: 'maxResults', value: '150' }, { name: 'timeZone', value: 'America/Recife' }] },
  options: {} } } });

// Cards de apresentação criados pelo fluxo "Apresentação das próximas calls": o id do evento está na Obs.
const apresentacoes = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Apresentações das calls', credentials: NOTION, executeOnce: true, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/74b3076a325749e3bac4ba6659215e48/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { and: [{ property: "Entrega", title: { contains: "APRESENTAÇÃO DE CALL (agenda)" } }, { timestamp: "created_time", created_time: { on_or_after: $now.minus({ days: 10 }).toISODate() } }] }, page_size: 100 }) }}',
  options: {} } } });

// Título da agenda: "EUFORIA | Reunião de Estratégia [Fulana]" ou "[EUFORIA] Alinhamento [Fulano]". Sai tipo e cliente separados.
const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar calls', parameters: { jsCode: `const Z = 'America/Recife';
const d = $('Eventos da agenda').first().json || {};
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; if (v.url !== undefined) return v.url || ''; return ''; };
const ap = {};
for (const p of (($input.first().json || {}).results || [])) {
  const pr = p.properties || {}, m = txt(pr['Obs']).match(/Evento da agenda: ([A-Za-z0-9_]+)/);
  if (m) ap[m[1]] = { link: txt(pr['Link do arquivo']), status: txt(pr['Status']) };
}
if (d.error || !Array.isArray(d.items)) return [{ json: { resposta: { ok: false, motivo: 'agenda' } } }];
const agora = DateTime.now().setZone(Z);
const calls = d.items.filter(e => e.status !== 'cancelled' && e.start && e.start.dateTime && e.eventType !== 'workingLocation' && e.eventType !== 'outOfOffice').map(e => {
  const t = String(e.summary || 'Sem título').trim();
  const sem = t.replace(/^\\[?EUFORIA\\]?\\s*\\|?\\s*/i, '');
  const b = sem.match(/\\[([^\\]]+)\\]\\s*$/);
  const tipo = (b ? sem.slice(0, b.index) : sem).replace(/\\s*[|·-]\\s*$/, '').trim();
  const ini = DateTime.fromISO(e.start.dateTime).setZone(Z), fim = DateTime.fromISO(e.end.dateTime).setZone(Z);
  return { id: e.id, titulo: t, tipo: b ? tipo : '', cliente: b ? b[1].trim() : tipo,
    inicio: ini.toISO({ suppressMilliseconds: true }), dia: ini.toISODate(), hora: ini.toFormat('HH:mm'), fimHora: fim.toFormat('HH:mm'),
    meet: e.hangoutLink || (e.conferenceData && e.conferenceData.entryPoints || []).filter(x => x.entryPointType === 'video').map(x => x.uri)[0] || '',
    convidados: (e.attendees || []).filter(a => !a.self).length,
    novo: e.created ? agora.diff(DateTime.fromISO(e.created), 'hours').hours < 24 : false,
    agora: ini <= agora && fim > agora,
    apresentacao: ap[e.id] ? (ap[e.id].link && /^https:/.test(ap[e.id].link) ? ap[e.id].link : 'producao') : '' };
});
return [{ json: { resposta: { ok: true, hoje: agora.toISODate(), agora: agora.toFormat('HH:mm'), calls } } }];
` } } });

const devolver = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver calls', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar acesso', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Painel da equipe · próximas calls (V1)\nAba "Próximas calls" do Ismael, do Rômulo e da diretoria: lê a agenda Assessoria EDL (estrategia@euforiamedia.com.br) das últimas 2 horas até 21 dias para frente.\nDevolve só dia, hora, tipo de reunião, cliente, link do Meet, se foi marcada nas últimas 24h e a apresentação automática (link pronto ou "producao"). Nada de descrição do evento.\nSó leitura.', [], { color: 4 });

export default workflow('painel-calls', 'Painel | Próximas calls (V1)')
  .add(pedir).to(ler).to(acesso).to(validar)
  .to(podeSeguir.onTrue(eventos.to(apresentacoes).to(montar).to(devolver)).onFalse(recusar))
  .add(nota);
