import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

// Henrique 23/11/2026 (caso Valicir: brutos 10, 11 e 12 no Drive e cards marcados "cliente ainda não gravou").
// De hora em hora olha os vídeos novos no Drive compartilhado. Vídeo dentro de "ARQUIVOS BRUTOS" de um cliente ativo vira
// pedido na máquina de longos (Status Editar) e devolve para A fazer os cards do cliente parados em "cliente ainda não gravou".
const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const DRIVE = { googleDriveOAuth2Api: { id: 'rtZfUhZ3pDHQMYO1', name: 'Google Drive Euforia' } };
const HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };
const PAGINAR = { pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest',
  parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] },
  paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.has_more }}', limitPagesFetched: true, maxRequests: 10 } } };
const VIGIA = { __rl: true, mode: 'id', value: 'giluD8bc6kChoaKY', cachedResultName: 'Vigia · brutos que chegaram' };

const hora = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'De hora em hora', parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 20 * * * *' }] } } } });

const drive = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Vídeos novos no Drive', credentials: DRIVE, executeOnce: true, parameters: {
  method: 'GET', url: 'https://www.googleapis.com/drive/v3/files', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api',
  sendQuery: true, queryParameters: { parameters: [
    { name: 'q', value: "={{ \"mimeType contains 'video/' and trashed = false and createdTime > '\" + $now.minus({ hours: 30 }).toUTC().toFormat(\"yyyy-MM-dd'T'HH:mm:ss\") + \"'\" }}" },
    { name: 'corpora', value: 'drive' }, { name: 'driveId', value: '0AGhEQwuC5NyjUk9PVA' },
    { name: 'includeItemsFromAllDrives', value: 'true' }, { name: 'supportsAllDrives', value: 'true' },
    { name: 'pageSize', value: '500' }, { name: 'fields', value: 'files(id,name,parents,createdTime)' }] }, options: {} } } });

// Agrupa por pasta. Espera 45 min depois do último arquivo, para o cliente terminar de subir todas as partes.
const pastas = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Pastas com vídeo novo', parameters: { jsCode: `const fs = ($input.first().json.files) || [];
const lim = Date.now() - 45 * 60000;
const por = {};
for (const f of fs) { const p = (f.parents || [])[0]; if (p) (por[p] = por[p] || []).push(f); }
const out = [];
for (const [pasta, L] of Object.entries(por)) {
  const ult = Math.max(...L.map(f => Date.parse(f.createdTime)));
  if (ult < lim) out.push({ json: { pasta, arquivos: L.map(f => f.name).slice(0, 8), total: L.length, chegou: new Date(ult).toISOString() } });
}
return out;
` } } });

const pastaInfo = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Pasta do vídeo', credentials: DRIVE, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://www.googleapis.com/drive/v3/files/{{ $json.pasta }}', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api',
  sendQuery: true, queryParameters: { parameters: [{ name: 'fields', value: 'id,name,parents' }, { name: 'supportsAllDrives', value: 'true' }] }, options: {} } } });

const cima = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Pasta de cima', credentials: DRIVE, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://www.googleapis.com/drive/v3/files/{{ ($json.parents || ["x"])[0] }}', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api',
  sendQuery: true, queryParameters: { parameters: [{ name: 'fields', value: 'id,name,parents' }, { name: 'supportsAllDrives', value: 'true' }] }, options: {} } } });

const clientes = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Clientes ativos', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/3ddc91b406be49e98e630c298d9162d8/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify({ page_size: 100, filter: { property: "Situação", select: { equals: "Ativo" } } }) }}', options: PAGINAR } } });

const vistos = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Brutos já vistos', executeOnce: true, alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: VIGIA, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'dia', condition: 'gte', keyValue: '={{ $now.minus({ days: 120 }).toISODate() }}' }] }, returnAll: true } } });

const pedidos = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Pedidos de longos recentes', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/3fea57fbb3ca4a7d9d16921d2f0b00cf/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify({ page_size: 100, filter: { timestamp: "created_time", created_time: { on_or_after: $now.minus({ days: 120 }).toISODate() } } }) }}', options: PAGINAR } } });

const decidir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Bruto novo de cliente?', parameters: { jsCode: `const Z = 'America/Recife';
const novos = $('Pastas com vídeo novo').all().map(i => i.json);
const hoje = DateTime.now().setZone(Z);
const info = $('Pasta do vídeo').all().map(i => i.json || {});
const cima = $('Pasta de cima').all().map(i => i.json || {});
const sem = v => String(v || '').replace(/-/g, '');
const txt = x => { if (!x) return ''; const a = x.title || x.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (x.url) return x.url; return ''; };
const cli = {};
for (const it of $('Clientes ativos').all()) for (const p of (it.json.results || [])) {
  const d = txt((p.properties || {})['Drive']) || ((p.properties || {})['Drive'] || {}).url || '';
  const m = String(d).match(/folders\\/([\\w-]{10,})/);
  if (m) cli[m[1]] = { id: sem(p.id), nome: txt((p.properties || {})['Cliente']), editor: (((p.properties || {})['Editor'] || {}).relation || []).map(r => r.id) };
}
const visto = new Set($('Brutos já vistos').all().map(i => i.json && i.json.pasta).filter(Boolean));
const links = $('Pedidos de longos recentes').all().flatMap(i => i.json.results || []).map(p => (((p.properties || {})['Vídeo bruto (link do Drive)'] || {}).url || '')).join(' ');
const out = [];
novos.forEach((n, i) => {
  const P = info[i] || {}, C = cima[i] || {};
  let pastaCli = '', rotulo = '';
  if (/BRUTO/i.test(P.name || '')) { pastaCli = (P.parents || [])[0]; rotulo = n.arquivos[0] || ''; }
  else if (/BRUTO/i.test(C.name || '')) { pastaCli = (C.parents || [])[0]; rotulo = P.name || ''; }
  const c = cli[pastaCli];
  if (!c || visto.has(n.pasta) || links.includes(n.pasta)) return;
  const num = ((rotulo.match(/V[ÍI]DEO\\s*0*(\\d+)/i) || [])[1]) || '';
  const quando = DateTime.fromISO(n.chegou).setZone(Z).toFormat('dd/MM HH:mm');
  const link = 'https://drive.google.com/drive/folders/' + n.pasta;
  const t = s => [{ type: 'text', text: { content: String(s).slice(0, 1990) } }];
  // Pasta "VÍDEO NN ..." com poucos arquivos = um vídeo (em partes): vai direto para a máquina.
  // Qualquer outra (ex.: "8 VÍDEOS", arquivos soltos) pode ser vários vídeos: vira card com passo a passo para o editor do cliente.
  const direto = !!num && /BRUTO/i.test(C.name || '') && n.total <= 6;
  let body;
  if (direto) {
    const titulo = (c.nome.toUpperCase() + ' | VÍDEO ' + num.padStart(2, '0') + ' (bruto chegou ' + quando.slice(0, 5) + ')').slice(0, 200);
    const obs = 'Pedido automático do vigia de brutos: o material chegou no Drive em ' + quando + ' (pasta "' + (P.name || '') + '"; arquivos: ' + n.arquivos.join(', ') + '). Seguir o padrão dos últimos vídeos aprovados deste cliente (cores, fontes, recorte) e entregar na pasta VÍDEOS EDITADOS dele. A ordem das partes pode não ser a do nome: conferir pela fala. A equipe confere a data de ir ao ar no card.';
    body = { parent: { database_id: '3fea57fbb3ca4a7d9d16921d2f0b00cf' }, properties: { 'Pedido': { title: t(titulo) }, 'Cliente': { relation: [{ id: c.id }] },
      'Status': { select: { name: 'Editar' } }, 'Modelo': { select: { name: /ACR[ÓO]POLE/i.test(c.nome) ? 'Nova Acrópole' : 'Padrão' } },
      'Vídeo bruto (link do Drive)': { url: link }, 'Observações para a máquina': { rich_text: t(obs) } } };
  } else {
    const nomePasta = (/BRUTO/i.test(P.name || '') ? 'arquivos soltos em ' : '') + (P.name || 'pasta');
    const passo = 'Bruto novo no Drive em ' + quando + ': ' + n.total + ' arquivo(s) em "' + nomePasta + '" (' + n.arquivos.join(', ') + (n.total > n.arquivos.length ? ', ...' : '') + ').\\n' +
      'Passo a passo: 1) Abra a pasta pelo Link do arquivo. 2) Veja se é um vídeo em partes ou vários vídeos separados. 3) Para cada vídeo, peça à máquina de longos pelo painel (Pedir ao escritório > Vídeo longo), com o link da pasta ou do arquivo e o número do roteiro. 4) Os cards da grade deste cliente marcados "não gravou" já voltaram para A fazer: ligue cada vídeo ao card do dia certo. 5) Feito isso, marque este card como Feito.';
    let prazo = hoje.plus({ days: 1 }); if (prazo.weekday === 7) prazo = prazo.plus({ days: 1 });
    const props = { 'Entrega': { title: t((c.nome.toUpperCase() + ' | BRUTO NOVO: ' + nomePasta.toUpperCase()).slice(0, 180)) }, 'Cliente': { relation: [{ id: c.id }] },
      'Tipo': { select: { name: 'Vídeo longo' } }, 'Status': { select: { name: 'A fazer' } }, 'Prioridade': { select: { name: 'Urgente' } },
      'Prazo': { date: { start: prazo.toISODate() } }, 'Link do arquivo': { url: link }, 'Obs': { rich_text: t(passo) } };
    if (c.editor.length) props['Responsável'] = { relation: c.editor.map(id => ({ id })) };
    body = { parent: { database_id: '74b3076a325749e3bac4ba6659215e48' }, properties: props };
  }
  out.push({ json: { cliente: c.id, nome: c.nome, pasta: n.pasta, pastaNome: P.name || '', video: num, chegou: n.chegou, quando, direto, pedido: JSON.stringify(body) } });
});
return out;
` } } });

const criarPedido = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Pedido à máquina ou card', credentials: NOTION, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/pages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.pedido }}',
  options: { batching: { batch: { batchSize: 1, batchInterval: 400 } }, response: { response: { fullResponse: true, neverError: true } } } } } });

// Cards do cliente parados em Aguardando cliente: os que a última marca é "cliente ainda não gravou" voltam para A fazer.
const parados = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Cards parados do cliente', credentials: NOTION, alwaysOutputData: true, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/74b3076a325749e3bac4ba6659215e48/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { and: [ { property: "Cliente", relation: { contains: $("Bruto novo de cliente?").item.json.cliente } }, { property: "Status", select: { equals: "Aguardando cliente" } } ] }, page_size: 50 }) }}', options: {} } } });

const montarVolta = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Cards que voltam', parameters: { jsCode: `const novos = $('Bruto novo de cliente?').all().map(i => i.json);
const pedidos = $('Pedido à máquina ou card').all().map(i => i.json || {});
const res = $input.all().map(i => i.json || {});
const txt = x => { if (!x) return ''; const a = x.title || x.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); return ''; };
const hoje = DateTime.now().setZone('America/Recife');
const out = [];
novos.forEach((n, i) => {
  const ok = (pedidos[i].statusCode || 0) < 300;
  const cards = ((res[i] || {}).results || []).filter(p => {
    const obs = txt((p.properties || {})['Obs']);
    return (obs.split('\\n').find(x => /marcou: cliente (ainda não gravou|mandou o material)/.test(x)) || '').includes('ainda não gravou');
  });
  for (const p of cards) {
    const obs = txt(p.properties['Obs']);
    const linha = '[Vigia ' + hoje.toFormat('dd/MM HH:mm') + '] Bruto novo no Drive (' + (n.pastaNome || 'vídeo') + ', chegou ' + n.quando + '): marcou: cliente mandou o material. Voltou para A fazer' + (ok ? (n.direto ? '; pedido feito à máquina de longos.' : '; card BRUTO NOVO criado com o passo a passo.') : '.');
    out.push({ json: { i, url: 'https://api.notion.com/v1/pages/' + p.id, body: JSON.stringify({ properties: { 'Status': { select: { name: 'A fazer' } }, 'Obs': { rich_text: (linha + (obs ? '\\n' + obs : '')).match(/[\\s\\S]{1,1990}/g).slice(0, 10).map(x => ({ type: 'text', text: { content: x } })) } } }) } });
  }
});
return out.length ? out : [{ json: { nada: true } }];
` } } });

const temCard = ifElse({ version: 2.2, config: { name: 'Algum card volta?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ !!$json.url }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const voltar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Voltar card para A fazer', credentials: NOTION, parameters: {
  method: 'PATCH', url: '={{ $json.url }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.body }}',
  options: { batching: { batch: { batchSize: 1, batchInterval: 400 } }, response: { response: { fullResponse: true, neverError: true } } } } } });

const registrar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Linhas do registro', parameters: { jsCode: `const novos = $('Bruto novo de cliente?').all().map(i => i.json);
const pedidos = $('Pedido à máquina ou card').all().map(i => i.json || {});
const voltas = $('Cards que voltam').all().map(i => i.json).filter(x => x.url);
return novos.map((n, i) => ({ json: { pasta: n.pasta, cliente: n.cliente, nome_cliente: n.nome, video: n.video, pasta_nome: n.pastaNome, chegou: n.chegou, dia: DateTime.now().setZone('America/Recife').toISODate(),
  pedido: (pedidos[i].statusCode || 0) < 300 ? (n.direto ? 'máquina ' : 'card ') + String(((pedidos[i].body || {}).url) || 'ok') : 'erro ' + pedidos[i].statusCode, cards_voltaram: voltas.filter(v => v.i === i).length } }));
` } } });

const gravar = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Gravar bruto visto', parameters: {
  resource: 'row', operation: 'insert', dataTableId: VIGIA,
  columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: [], schema: [] }, options: {} } } });

const nota = sticky('## Vigia de brutos no Drive (V1) · 23/11/2026\nDe hora em hora (min 20) lê os vídeos criados nas últimas 30h no Drive EUFORIA MEDIA. Pasta de vídeo dentro de "ARQUIVOS BRUTOS" (ou o próprio ARQUIVOS BRUTOS) de cliente Ativo (campo Drive da ficha), 45 min depois do último arquivo:\n1) pasta "VÍDEO NN" com até 6 arquivos: cria pedido na máquina de longos (Status Editar, link da pasta), se ainda não houver pedido com essa pasta; qualquer outra (ex.: "8 VÍDEOS"): card Urgente BRUTO NOVO para o editor do cliente com passo a passo;\n2) cards do cliente em Aguardando cliente marcados "cliente ainda não gravou" voltam para A fazer com linha [Vigia] na Obs;\n3) grava na tabela Vigia · brutos que chegaram (o botão "não gravou" do painel consulta essa tabela).\nNunca manda nada ao cliente.', [], { color: 4 });

export default workflow('vigia-brutos', 'Grade | Vigia de brutos no Drive (V1)')
  .add(hora).to(drive).to(pastas).to(pastaInfo).to(cima).to(clientes).to(vistos).to(pedidos).to(decidir).to(criarPedido).to(parados).to(montarVolta)
  .to(temCard.onTrue(voltar.to(registrar).to(gravar)).onFalse(registrar))
  .add(nota);
