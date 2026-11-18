import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const AGENDA = { googleCalendarOAuth2Api: { id: '3WJH3L4Izc9Ytx7o', name: 'Google Agenda Euforia' } };
const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };
const PAGINAS = { pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest',
  parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] },
  paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.has_more }}', limitPagesFetched: true, maxRequests: 10 } } };

const relogio = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'De hora em hora', parameters: {
  rule: { interval: [{ field: 'hours', hoursInterval: 1, triggerAtMinute: 5 }] } } } });

const hora = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Horário comercial', parameters: { jsCode: `const agora = DateTime.now().setZone('America/Recife');
if (agora.hour < 7 || agora.hour >= 20) return [];
return [{ json: { de: agora.toISO(), ate: agora.plus({ hours: 48 }).toISO(), desde: agora.minus({ days: 4 }).toISODate() } }];
` } } });

const eventos = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Calls das próximas 48h', credentials: AGENDA, parameters: {
  method: 'GET', url: 'https://www.googleapis.com/calendar/v3/calendars/estrategia%40euforiamedia.com.br/events',
  authentication: 'predefinedCredentialType', nodeCredentialType: 'googleCalendarOAuth2Api', sendQuery: true,
  queryParameters: { parameters: [{ name: 'timeMin', value: '={{ $json.de }}' }, { name: 'timeMax', value: '={{ $json.ate }}' },
    { name: 'singleEvents', value: 'true' }, { name: 'orderBy', value: 'startTime' }, { name: 'maxResults', value: '100' }, { name: 'timeZone', value: 'America/Recife' }] },
  options: {} } } });

const clientes = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Clientes ativos', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/3ddc91b406be49e98e630c298d9162d8/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { property: "Situação", select: { does_not_equal: "Encerrado" } }, page_size: 100 }) }}', options: PAGINAS } } });

const feitas = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Apresentações já pedidas', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/74b3076a325749e3bac4ba6659215e48/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { and: [{ property: "Entrega", title: { contains: "APRESENTAÇÃO" } }, { timestamp: "created_time", created_time: { on_or_after: $("Horário comercial").first().json.desde } }] }, page_size: 100 }) }}',
  options: PAGINAS } } });

// Uma apresentação por call de cliente. Reunião de Onboarding + Oferta fica de fora: ela já tem dossiê e roteiro da Máquina de Setup.
// Se já existe card de apresentação do cliente nos últimos 4 dias (feito à mão ou por aqui; cliente com call toda semana não fica bloqueado), não cria outro.
const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar cards', parameters: { jsCode: `const Z = 'America/Recife';
const agora = DateTime.now().setZone(Z);
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; return a ? a.map(t => t.plain_text).join('').trim() : ''; };
const norm = s => String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\\s+/g, ' ').trim();
const cli = [];
for (const it of $('Clientes ativos').all()) for (const p of (it.json.results || [])) cli.push({ id: p.id.replace(/-/g, ''), nome: txt((p.properties || {})['Cliente']) });
const ja = [];
for (const it of $('Apresentações já pedidas').all()) for (const p of (it.json.results || [])) ja.push({ cliente: (((p.properties || {})['Cliente'] || {}).relation || []).map(r => r.id.replace(/-/g, '')), obs: txt((p.properties || {})['Obs']), titulo: norm(txt((p.properties || {})['Entrega'])) });
// Acha o cliente pelo nome entre colchetes do evento: nome igual, ou todas as palavras do evento no nome da ficha (ou o contrário).
const acha = nome => { const n = norm(nome), w = n.split(' ').filter(x => x.length > 2);
  let m = cli.find(c => norm(c.nome) === n); if (m) return m;
  const cand = cli.filter(c => { const cn = norm(c.nome), cw = cn.split(' '); return w.length && (w.every(x => cn.includes(x)) || (cw.filter(x => x.length > 2).length > 0 && cw.filter(x => x.length > 2).every(x => n.includes(x)))); });
  if (cand.length === 1) return cand[0];
  // Grafia diferente (João Vítor / João Victor): mesmo primeiro nome e, se houver mais de um, sobrenome começando igual.
  const p1 = cli.filter(c => w[0] && norm(c.nome).split(' ')[0] === w[0]);
  if (p1.length === 1) return p1[0];
  const p2 = p1.filter(c => { const s = norm(c.nome).split(' ')[1] || ''; return w[1] && s.slice(0, 2) === w[1].slice(0, 2); });
  return p2.length === 1 ? p2[0] : null; };
const out = [];
for (const e of ($('Calls das próximas 48h').first().json.items) || []) {
  if (e.status === 'cancelled' || !e.start || !e.start.dateTime) continue;
  const t = String(e.summary || '').trim();
  const sem = t.replace(/^\\[?EUFORIA\\]?\\s*\\|?\\s*/i, '');
  const b = sem.match(/\\[([^\\]]+)\\]\\s*$/);
  if (!b) continue;
  const tipo = sem.slice(0, b.index).replace(/\\s*[|·-]\\s*$/, '').trim();
  if (/onboarding/i.test(tipo)) continue;
  const nome = b[1].trim(), c = acha(nome);
  if (ja.some(x => x.obs.includes(e.id) || (c && x.cliente.includes(c.id)) || (!c && x.titulo.includes(norm(nome))))) continue;
  const ini = DateTime.fromISO(e.start.dateTime).setZone(Z);
  const vespera = ini.minus({ days: 1 }).toISODate();
  const prazo = vespera < agora.toISODate() ? agora.toISODate() : vespera;
  const quando = ini.setLocale('pt-BR').toFormat("cccc, dd/MM 'às' HH'h'mm");
  const meet = e.hangoutLink || '';
  const obs = '[Agenda ' + agora.toFormat('dd/MM HH:mm') + '] Apresentação automática para a call "' + (tipo || 'Reunião') + '" de ' + quando + '. Evento da agenda: ' + e.id + (meet ? '. Meet: ' + meet : '') + '.' + ' Cliente na agenda: "' + nome + '"' + (c ? '.' : ' (não achei a ficha, conferir).') +
    '\\nFazer a apresentação completa em slides no padrão das calls: entregas do mês, números do canal só em percentual, próximos passos e o slide de feedback ("O que vocês estão achando do Grupo Euforia até agora?") antes do agradecimento.' +
    '\\nPublicar como página com link secreto (slug "apresentacao-<cliente>-<data>-<8 letras aleatórias>", fora de busca) e pôr o link em Link do arquivo. Ela aparece sozinha na aba Próximas calls do painel do Rômulo e do Ismael.';
  const props = { 'Entrega': { title: [{ text: { content: (c ? c.nome : nome).toUpperCase() + ' | APRESENTAÇÃO DE CALL (agenda)' } }] },
    'Tipo': { select: { name: 'Apresentação' } }, 'Status': { select: { name: 'A fazer' } }, 'Origem': { select: { name: 'Extra' } },
    'Prazo': { date: { start: prazo } }, 'Responsável': { relation: [{ id: '3ea98c0cdde0812bba06cba7e4261426' }] },
    '🏢 Escritório IA': { select: { name: 'Na fila' } }, 'Obs': { rich_text: [{ text: { content: obs.slice(0, 1990) } }] } };
  if (c) props['Cliente'] = { relation: [{ id: c.id }] };
  out.push({ json: { body: JSON.stringify({ parent: { database_id: '74b3076a325749e3bac4ba6659215e48' }, properties: props }) } });
  if (c) ja.push({ cliente: [c.id], obs: e.id, titulo: '' });
}
return out;
` } } });

const criar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Criar card da apresentação', credentials: NOTION, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/pages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.body }}', options: {} } } });

const nota = sticky('## Painel · apresentação automática das calls (V1)\nDe hora em hora (7h às 20h) olha as calls de cliente das próximas 48h na agenda Assessoria EDL.\nPara cada call sem apresentação pedida nos últimos 4 dias, cria card no Entregas: "CLIENTE | APRESENTAÇÃO DE CALL (agenda)", Tipo Apresentação, Responsável Escritório, Na fila, prazo na véspera. O id do evento vai na Obs.\nA Máquina do Escritório faz, publica com link secreto e põe em Link do arquivo; a aba Próximas calls mostra o botão "Abrir apresentação".\nReunião de Onboarding + Oferta fica de fora (já tem dossiê e roteiro).', [], { color: 4 });

export default workflow('painel-apresentacao-calls', 'Painel | Apresentação das próximas calls (V1)')
  .add(relogio).to(hora).to(eventos).to(clientes).to(feitas).to(montar).to(criar)
  .add(nota);
