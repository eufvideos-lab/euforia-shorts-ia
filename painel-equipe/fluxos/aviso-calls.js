import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

const AGENDA = { googleCalendarOAuth2Api: { id: '3WJH3L4Izc9Ytx7o', name: 'Google Agenda Euforia' } };
const DISCORD = { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } };
const AVISADAS = { __rl: true, mode: 'id', value: 'ErgWvonDMX6wcKgC', cachedResultName: 'Painel · calls avisadas' };

const relogio = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'A cada 10 minutos', parameters: {
  rule: { interval: [{ field: 'minutes', minutesInterval: 10 }] } } } });

// Só avisa das 7h às 21h. O que for marcado de madrugada sai no primeiro aviso da manhã (a busca olha as últimas 24h).
const hora = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Horário de aviso', parameters: { jsCode: `const agora = DateTime.now().setZone('America/Recife');
if (agora.hour < 7 || agora.hour >= 21) return [];
return [{ json: { desde: agora.minus({ hours: 24 }).toISO(), agora: agora.toISO() } }];
` } } });

const eventos = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Eventos mexidos nas últimas 24h', credentials: AGENDA, parameters: {
  method: 'GET', url: 'https://www.googleapis.com/calendar/v3/calendars/estrategia%40euforiamedia.com.br/events',
  authentication: 'predefinedCredentialType', nodeCredentialType: 'googleCalendarOAuth2Api', sendQuery: true,
  queryParameters: { parameters: [{ name: 'updatedMin', value: '={{ $json.desde }}' }, { name: 'timeMin', value: '={{ $json.agora }}' },
    { name: 'singleEvents', value: 'true' }, { name: 'maxResults', value: '100' }, { name: 'timeZone', value: 'America/Recife' }] },
  options: {} } } });

const avisadas = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Calls já avisadas', executeOnce: true, alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: AVISADAS, returnAll: true } } });

// Call nova = criada nas últimas 24h e ainda por vir. A Call 1 marcada pela página do cliente já avisa sozinha (Meet pedido com "call1-").
const novas = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Calls novas', parameters: { jsCode: `const Z = 'America/Recife';
const agora = DateTime.now().setZone(Z);
const ja = new Set($('Calls já avisadas').all().map(i => i.json.evento).filter(Boolean));
const itens = ($('Eventos mexidos nas últimas 24h').first().json.items) || [];
const out = [];
for (const e of itens) {
  if (e.status === 'cancelled' || !e.start || !e.start.dateTime || ja.has(e.id)) continue;
  if (!e.created || agora.diff(DateTime.fromISO(e.created), 'hours').hours > 24) continue;
  const ini = DateTime.fromISO(e.start.dateTime).setZone(Z);
  if (ini < agora) continue;
  const req = ((e.conferenceData || {}).createRequest || {}).requestId || '';
  const t = String(e.summary || 'Sem título').trim();
  const sem = t.replace(/^\\[?EUFORIA\\]?\\s*\\|?\\s*/i, '');
  const b = sem.match(/\\[([^\\]]+)\\]\\s*$/);
  const tipo = (b ? sem.slice(0, b.index) : sem).replace(/\\s*[|·-]\\s*$/, '').trim();
  const cliente = b ? b[1].trim() : tipo;
  const quando = ini.setLocale('pt-BR').toFormat("cccc, dd/MM 'às' HH'h'mm");
  const texto = '📅 **Call nova na agenda:** ' + cliente + (b && tipo ? ' · ' + tipo : '') + ', ' + quando + '. <@1490768736876237082> <@1410287139169763471> ela já está na aba Próximas calls do painel.\\n— Érica, time de suporte, Grupo Euforia';
  out.push({ json: { evento: e.id, titulo: t.slice(0, 200), inicio: ini.toISO(), pagina: req.startsWith('call1-'), body: JSON.stringify({ content: texto, allowed_mentions: { users: ['1490768736876237082', '1410287139169763471'] } }) } });
}
return out;
` } } });

const daPagina = ifElse({ version: 2.2, config: { name: 'Já avisada pela página?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.pagina }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const avisar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Avisar no #dia-a-dia', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://discord.com/api/v10/channels/1556642691410956339/messages',
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.body }}', options: {} } } });

const anotar = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Anotar como avisada', parameters: {
  resource: 'row', operation: 'insert', dataTableId: AVISADAS,
  columns: { mappingMode: 'defineBelow', value: { evento: '={{ $("Calls novas").item.json.evento }}', titulo: '={{ $("Calls novas").item.json.titulo }}', inicio: '={{ $("Calls novas").item.json.inicio }}' },
    matchingColumns: [], schema: [{ id: 'evento', displayName: 'evento', type: 'string', display: true }, { id: 'titulo', displayName: 'titulo', type: 'string', display: true }, { id: 'inicio', displayName: 'inicio', type: 'string', display: true }] },
  options: {} } } });

const nota = sticky('## Painel · aviso de call nova (V1)\nA cada 10 min (7h às 21h) olha a agenda Assessoria EDL. Evento criado nas últimas 24h e ainda por vir → aviso no #dia-a-dia marcando Rômulo e Ismael, uma vez só (tabela "Painel · calls avisadas").\nCall 1 marcada pela página do cliente já tem aviso próprio no fluxo "Setup | Agendar Call 1": aqui só é anotada, sem mandar de novo.', [], { color: 4 });

export default workflow('painel-aviso-calls', 'Painel | Aviso de call nova (V1)')
  .add(relogio).to(hora).to(eventos).to(avisadas).to(novas).to(daPagina.onTrue(anotar).onFalse(avisar.to(anotar)))
  .add(nota);
