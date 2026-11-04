import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

// Fase 2 da arquitetura (04/11/2026): cronograma vivo.
// Gerador (:05): promessa "Prometido" sem card vira card no Entregas e fica "Com card".
// Vigia (:25): confere o card de cada promessa aberta e muda o Status da promessa (Cumprido / Em risco / Atrasado),
// avisando só quando o status muda, para não repetir alerta.
const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const DISCORD = { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } };
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };
const PROMESSAS = '824c669471e5424d8c846936a63c16d4';
const PAGINAR = { pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest',
  parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] },
  paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.has_more }}', limitPagesFetched: true, maxRequests: 10 } } };
const HTTP = { authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendHeaders: true, headerParameters: NOTION_HDR };

// Segunda a sábado, 8h às 19h (Recife).
const HORA = `const agora = DateTime.now().setZone('America/Recife');
if (agora.weekday === 7 || agora.hour < 8 || agora.hour > 19) return [];
return [{ json: { hoje: agora.toISODate(), hora: agora.hour, carimbo: agora.toFormat('dd/MM HH:mm') } }];
`;
const TXT = `const sem = id => String(id || '').replace(/-/g, '');
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; if (v.date) return v.date.start || ''; if (v.unique_id) return (v.unique_id.prefix ? v.unique_id.prefix + '-' : '') + v.unique_id.number; return ''; };
const rel = v => ((v || {}).relation || []).map(r => sem(r.id));
`;

// ---------- Gerador ----------
const relogioG = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Gerador de hora em hora', parameters: {
  rule: { interval: [{ field: 'hours', hoursInterval: 1, triggerAtMinute: 5 }] } } } });
const horaG = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Hora do gerador', parameters: { jsCode: HORA } } });
const semCard = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Promessas sem card', credentials: NOTION, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/' + PROMESSAS + '/query', ...HTTP, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { and: [{ property: "Status", select: { equals: "Prometido" } }, { property: "Card", relation: { is_empty: true } }] }, page_size: 100 }) }}',
  options: PAGINAR } } });
const clientesG = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Clientes', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/3ddc91b406be49e98e630c298d9162d8/query', ...HTTP, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ page_size: 100 }) }}', options: PAGINAR } } });

// Card: "CLIENTE | MARCO | DD/MM". Tipo postável: Postar em = Quando e Prazo = D-3 (fim de semana vale a sexta antes, nunca antes de hoje).
// Outros tipos: Prazo = Quando.
const montarCards = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar cards', parameters: { jsCode: TXT + `const Z = 'America/Recife';
const h = $('Hora do gerador').first().json;
const hoje = DateTime.fromISO(h.hoje, { zone: Z });
const nomes = {};
for (const it of $('Clientes').all()) for (const p of (it.json.results || [])) nomes[sem(p.id)] = txt((p.properties || {})['Cliente']);
const TIPO = { 'Vídeo longo': 'Vídeo longo', 'Shorts': 'Shorts', 'Carrossel': 'Carrossel', 'Thumbnail': 'Thumbnail', 'Página': 'Página', 'Arte': 'Arte' };
const POSTAVEL = ['Vídeo longo', 'Shorts', 'Carrossel'];
const out = [];
for (const it of $('Promessas sem card').all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {}, marco = txt(pr['Marco']), quando = txt(pr['Quando']).slice(0, 10), tipo = txt(pr['Tipo']);
  if (!marco || !quando) continue;
  const cli = rel(pr['Cliente'])[0], resp = rel(pr['Responsável']);
  const nome = (nomes[cli] || 'CLIENTE').toUpperCase();
  const dia = DateTime.fromISO(quando, { zone: Z });
  const props = { 'Entrega': { title: [{ text: { content: nome + ' | ' + marco.toUpperCase() + ' | ' + dia.toFormat('dd/MM') } }] },
    'Tipo': { select: { name: TIPO[tipo] || 'Outro' } }, 'Status': { select: { name: 'A fazer' } }, 'Origem': { select: { name: 'Extra' } } };
  if (POSTAVEL.includes(tipo)) {
    let pz = dia.minus({ days: 3 });
    if (pz.weekday === 6) pz = pz.minus({ days: 1 }); if (pz.weekday === 7) pz = pz.minus({ days: 2 });
    if (pz < hoje) pz = hoje;
    props['Postar em'] = { date: { start: quando } }; props['Prazo'] = { date: { start: pz.toISODate() } };
  } else props['Prazo'] = { date: { start: quando < h.hoje ? h.hoje : quando } };
  if (cli) props['Cliente'] = { relation: [{ id: cli }] };
  if (resp.length) props['Responsável'] = { relation: resp.map(id => ({ id })) };
  const origem = txt(pr['Origem']);
  props['Obs'] = { rich_text: [{ text: { content: ('[Promessas ' + h.carimbo + '] Card criado pela promessa ' + txt(pr['Código']) + ': "' + marco + '" para ' + dia.toFormat('dd/MM') + '.' + (origem ? ' Origem: ' + origem : '')).slice(0, 1990) } }] };
  out.push({ json: { prom: sem(p.id), body: JSON.stringify({ parent: { database_id: '74b3076a325749e3bac4ba6659215e48' }, properties: props }) } });
}
return out;
` } } });
const criarCard = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Criar card', credentials: NOTION, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/pages', ...HTTP, sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.body }}', options: {} } } });
const ligarCard = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Ligar card na promessa', credentials: NOTION, onError: 'continueRegularOutput', parameters: {
  method: 'PATCH', url: '={{ "https://api.notion.com/v1/pages/" + $("Montar cards").item.json.prom }}', ...HTTP, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ properties: { "Card": { relation: [{ id: $json.id }] }, "Status": { select: { name: "Com card" } } } }) }}', options: {} } } });

// ---------- Vigia ----------
const relogioV = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Vigia de hora em hora', parameters: {
  rule: { interval: [{ field: 'hours', hoursInterval: 1, triggerAtMinute: 25 }] } } } });
const horaV = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Hora do vigia', parameters: { jsCode: HORA } } });
const abertas = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Promessas abertas', credentials: NOTION, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/' + PROMESSAS + '/query', ...HTTP, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { and: [{ property: "Card", relation: { is_not_empty: true } }, { or: ["Prometido", "Com card", "Em risco", "Atrasado"].map(s => ({ property: "Status", select: { equals: s } })) }] }, sorts: [{ property: "Quando", direction: "ascending" }], page_size: 100 }) }}',
  options: PAGINAR } } });
const clientesV = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Clientes do vigia', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/3ddc91b406be49e98e630c298d9162d8/query', ...HTTP, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ page_size: 100 }) }}', options: PAGINAR } } });
const lista = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Lista para conferir', parameters: { jsCode: TXT + `const nomes = {}, guard = {};
for (const it of $('Clientes do vigia').all()) for (const p of (it.json.results || [])) { nomes[sem(p.id)] = txt((p.properties || {})['Cliente']); guard[sem(p.id)] = rel((p.properties || {})['🛡️ Guardião']); }
const out = [];
for (const it of $('Promessas abertas').all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {}, card = rel(pr['Card'])[0];
  if (!card) continue;
  out.push({ json: { prom: sem(p.id), card, marco: txt(pr['Marco']), quando: txt(pr['Quando']), tipo: txt(pr['Tipo']), status: txt(pr['Status']),
    alerta: parseInt(txt(pr['Alerta às']), 10) || 14, depende: !!(pr['Depende do cliente'] || {}).checkbox, resp: rel(pr['Responsável']),
    cliente: nomes[rel(pr['Cliente'])[0]] || '', guardiao: guard[rel(pr['Cliente'])[0]] || [], codigo: txt(pr['Código']) } });
}
return out;
` } } });
const lerCard = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Ler card', credentials: NOTION, onError: 'continueRegularOutput', parameters: {
  method: 'GET', url: '={{ "https://api.notion.com/v1/pages/" + $json.card }}', ...HTTP, options: {} } } });

// Card feito: Postado (longo, shorts, carrossel); Aguardando cliente/Aprovado/Agendado/Postado (aprovação do cliente);
// Aprovado/Agendado/Postado (resto). Feito vira Cumprido. No dia, depois do "Alerta às", sem feito: Em risco.
// Passou do dia sem feito: Atrasado. Só avisa quando o status muda. "Depende do cliente" muda o status mas não chama a equipe.
const decidir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Decidir', parameters: { jsCode: TXT + `const h = $('Hora do vigia').first().json;
const base = $('Lista para conferir').all(), cards = $input.all();
const SO_POSTADO = ['Vídeo longo', 'Shorts', 'Carrossel'];
const DISC = { '3ea98c0cdde0812d9cb4c41ce70df4ae': '1410287139169763471', '3ea98c0cdde0817e87aee637a96d4fd1': '1470387767337816128',
  '3ea98c0cdde081299709cf901fac7275': '1490768736876237082', '3ea98c0cdde08182a952f3d9a5b73575': '1142062975071551528', '3ea98c0cdde08163bd16f0213b098cb5': '827882215185973279' };
const ROMULO = '1490768736876237082';
// Fase 3: o guardião do cliente (campo 🛡️ Guardião da ficha) é chamado; sem guardião, o Rômulo.
const guardioes = p => { const g = (p.guardiao || []).map(id => DISC[id]).filter(Boolean); return g.length ? g : [ROMULO]; };
const mudar = [], risco = [], atraso = [];
base.forEach((b, i) => {
  const p = b.json, c = (cards[i] || {}).json || {};
  if (!c.properties) return;
  const st = txt(c.properties['Status']);
  const feitos = SO_POSTADO.includes(p.tipo) ? ['Postado'] : p.tipo === 'Aprovação do cliente' ? ['Aguardando cliente', 'Aprovado', 'Agendado', 'Postado'] : ['Aprovado', 'Agendado', 'Postado'];
  const dia = p.quando.slice(0, 10);
  let novo = p.status;
  if (feitos.includes(st)) novo = 'Cumprido';
  else if (st === 'Cancelado') novo = p.status;
  else if (dia < h.hoje) novo = 'Atrasado';
  else if (dia === h.hoje && h.hora >= p.alerta) novo = p.status === 'Atrasado' ? 'Atrasado' : 'Em risco';
  else if (p.status === 'Prometido') novo = 'Com card';
  if (novo === p.status) return;
  mudar.push({ json: { prom: p.prom, status: novo } });
  const resp = (p.resp.length ? p.resp : rel(c.properties['Responsável'])).map(id => DISC[id]).filter(Boolean);
  const linha = { txt: '**' + (p.cliente || 'Cliente') + '** · ' + p.marco + ' · prometido para ' + dia.split('-').reverse().slice(0, 2).join('/') + ' · card em ' + (st || '?') + (p.depende ? ' · depende do cliente' : '') + ' · ' + (c.url || ''), resp, guard: guardioes(p), depende: p.depende };
  if (novo === 'Em risco') risco.push(linha);
  if (novo === 'Atrasado') atraso.push(linha);
});
const avisos = [];
const ment = l => [...new Set([...l.flatMap(x => x.guard), ...l.flatMap(x => x.depende ? [] : x.resp)])];
const r = risco.filter(x => !x.depende);
if (r.length) { const ids = ment(r);
  avisos.push({ canal: '1556642691410956339', body: JSON.stringify({ content: ('⏰ ' + ids.map(i => '<@' + i + '>').join(' ') + ' promessa(s) para HOJE ainda não feitas:\\n' + r.map(x => '• ' + x.txt).join('\\n') + '\\n\\nSe já fez, mude o card. Se não vai dar, avise agora o guardião do cliente (o primeiro marcado aqui).').slice(0, 1990), allowed_mentions: { users: ids } }) }); }
const a = atraso.filter(x => !x.depende);
if (a.length) { const ids = ment(a);
  avisos.push({ canal: '1556642691410956339', body: JSON.stringify({ content: ('🚨 ' + ids.map(i => '<@' + i + '>').join(' ') + ' promessa(s) ATRASADA(S):\\n' + a.map(x => '• ' + x.txt).join('\\n') + '\\n\\nGuardião, resolva hoje e registre o novo combinado na promessa.').slice(0, 1990), allowed_mentions: { users: ids } }) }); }
if (atraso.length) avisos.push({ canal: '1560627456837427250', body: JSON.stringify({ content: ('🚨 Promessa(s) atrasada(s) (' + h.carimbo + ').' + (a.length ? ' O guardião foi chamado.' : '') + '\\n' + atraso.map(x => '• ' + x.txt).join('\\n')).slice(0, 1990), allowed_mentions: { parse: [] } }) });
return mudar.map((m, i) => ({ json: Object.assign({}, m.json, { avisos: i === 0 ? avisos : [] }) }));
` } } });
const gravar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Gravar status', credentials: NOTION, onError: 'continueRegularOutput', parameters: {
  method: 'PATCH', url: '={{ "https://api.notion.com/v1/pages/" + $json.prom }}', ...HTTP, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ properties: { "Status": { select: { name: $json.status } } } }) }}', options: {} } } });
const separar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Avisos', parameters: { jsCode: `return (($('Decidir').first().json.avisos) || []).map(a => ({ json: a }));
` } } });
const avisar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Avisar no Discord', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: '={{ "https://discord.com/api/v10/channels/" + $json.canal + "/messages" }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.body }}', options: {} } } });

const nota = sticky('## Painel · Promessas: gerador e vigia (V1)\nBanco 🗓️ Promessas (Esteira de Entregas). Segunda a sábado, 8h às 19h (Recife).\nGerador (:05): promessa "Prometido" sem card vira card no Entregas ("CLIENTE | MARCO | DD/MM", Origem Extra). Longo/shorts/carrossel: Postar em = Quando e Prazo = D-3. Resto: Prazo = Quando. A promessa fica "Com card".\nVigia (:25): lê o card de cada promessa aberta. Feito = Cumprido. No dia, depois do "Alerta às" = Em risco (aviso no #dia-a-dia marcando o guardião do cliente, campo 🛡️ Guardião da ficha, ou o Rômulo se vazio, e o responsável). Passou do dia = Atrasado (#dia-a-dia + #avisos-escritório). Só avisa quando o status muda. "Depende do cliente" não chama a equipe.', [], { color: 4 });

export default workflow('painel-promessas', 'Painel | Promessas: gerador e vigia (V1)')
  .add(relogioG).to(horaG).to(semCard).to(clientesG).to(montarCards).to(criarCard).to(ligarCard)
  .add(relogioV).to(horaV).to(abertas).to(clientesV).to(lista).to(lerCard).to(decidir).to(gravar).to(separar).to(avisar)
  .add(nota);
