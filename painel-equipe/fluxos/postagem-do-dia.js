import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

// Alerta da postagem do dia (Fase 1 da arquitetura, 04/11/2026): confere a Grade de postagem de hoje
// e avisa quem precisa agir quando um horário ainda não está marcado como Programado ou Postado.
const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const DISCORD = { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } };
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };
const MARCAS = { __rl: true, mode: 'id', value: 'eyJ8FrBneYnl3Htu', cachedResultName: 'Painel · grade marcações' };
const PAGINAR = { pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest',
  parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] },
  paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.has_more }}', limitPagesFetched: true, maxRequests: 10 } } };

const relogio = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'De hora em hora', parameters: {
  rule: { interval: [{ field: 'hours', hoursInterval: 1 }] } } } });

// Dois alertas por dia, de segunda a sábado (Recife):
// 14h = 1º aviso ao Ismael e ao Daniel (quem posta); 17h = o que continua pendente volta ao Ismael e ao Daniel e vai à diretoria.
// 10/11/2026 (Henrique): quem posta é o Ismael e o Daniel, não o Rômulo. O Rômulo não é chamado na postagem.
const hora = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Hora do alerta', parameters: { jsCode: `const agora = DateTime.now().setZone('America/Recife');
const ETAPAS = { 14: 'primeiro', 17: 'reforco' };
const etapa = ETAPAS[agora.hour];
if (!etapa || agora.weekday === 7) return [];
const DIAS = ['1 Seg', '2 Ter', '3 Qua', '4 Qui', '5 Sex', '6 Sáb', '7 Dom'];
return [{ json: { etapa, hoje: agora.toISODate(), dia: DIAS[agora.weekday - 1], hojeTexto: agora.setLocale('pt-BR').toFormat("cccc dd/MM") } }];
` } } });

const grade = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Horários de hoje', credentials: NOTION, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/2d21b7a7166240f5afaa4d697c3d1ae8/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { and: [{ property: "Status do slot", select: { equals: "✅ Publicar" } }, { property: "Dia", select: { equals: $json.dia } }] }, page_size: 100 }) }}',
  options: PAGINAR } } });

const clientes = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Clientes ativos', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/3ddc91b406be49e98e630c298d9162d8/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { property: "Situação", select: { equals: "Ativo" } }, page_size: 100 }) }}',
  options: PAGINAR } } });

const marcacoes = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Marcações de hoje', executeOnce: true, alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: MARCAS, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'dia', condition: 'eq', keyValue: '={{ $("Hora do alerta").first().json.hoje }}' }] }, returnAll: true } } });

// Pendente = horário de hoje de cliente ativo, que não está esperando o cliente gravar, sem Programado nem Postado.
// Clientes em foco (⭐) vêm primeiro na lista.
const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar alerta', parameters: { jsCode: `const h = $('Hora do alerta').first().json;
const sem = id => String(id || '').replace(/-/g, '');
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; if (v.date) return v.date.start; return ''; };
const cli = {};
for (const it of $('Clientes ativos').all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {}, nome = txt(pr['Cliente']);
  if (/^TESTE/i.test(nome)) continue;
  cli[sem(p.id)] = { nome, foco: txt(pr['⭐ Foco até']).slice(0, 10) >= h.hoje, esperando: !!txt(pr['🎥 Aguardando gravação']) };
}
const marcado = {};
for (const it of $('Marcações de hoje').all()) { const m = it.json || {}; if (m.slot && ['programado', 'postado'].includes(m.status)) marcado[m.slot] = m.status; }
const pend = [];
for (const it of $('Horários de hoje').all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {}, c = cli[sem((((pr['Cliente'] || {}).relation || [])[0] || {}).id)];
  if (!c || c.esperando || marcado[sem(p.id)]) continue;
  pend.push({ nome: c.nome, foco: c.foco, plat: txt(pr['Plataforma']), formato: txt(pr['Formato']), hora: txt(pr['Horário']), qtd: (pr['Quantidade'] || {}).number || 1 });
}
if (!pend.length) return [];
pend.sort((a, b) => (b.foco - a.foco) || (a.hora || '99').localeCompare(b.hora || '99') || a.nome.localeCompare(b.nome));
const linhas = pend.slice(0, 25).map(x => '• ' + (x.foco ? '⭐ ' : '') + '**' + x.nome + '** · ' + x.plat + ' ' + x.formato.toLowerCase() + (x.qtd > 1 ? ' ×' + x.qtd : '') + (x.hora ? ' · ' + x.hora : ''));
if (pend.length > 25) linhas.push('… e mais ' + (pend.length - 25));
const ISMAEL = '1410287139169763471', DANIEL = '1470387767337816128';
const equipe = h.etapa === 'primeiro'
  ? '📅 <@' + ISMAEL + '> <@' + DANIEL + '> postagens de hoje (' + h.hojeTexto + ') ainda sem **Programado** na Grade:\\n' + linhas.join('\\n') + '\\n\\nSe já programou ou postou, marque na aba Grade do painel. Se travou, avise a diretoria.'
  : '⚠️ <@' + ISMAEL + '> <@' + DANIEL + '> estas postagens de hoje continuam sem Programado nem Postado:\\n' + linhas.join('\\n') + '\\n\\nPostem ou programem agora e marquem na aba Grade com o link. O que não der para sair hoje, avisem a diretoria.';
const ids = [ISMAEL, DANIEL];
const out = { equipe: JSON.stringify({ content: equipe.slice(0, 1990), allowed_mentions: { users: ids } }), diretoria: '', paraDiretoria: h.etapa === 'reforco' };
if (out.paraDiretoria) out.diretoria = JSON.stringify({ content: ('📅 Postagem do dia (' + h.hojeTexto + ', 17h): ' + pend.length + ' horário(s) ainda sem Programado nem Postado. Ismael e Daniel foram chamados.\\n' + linhas.join('\\n')).slice(0, 1990), allowed_mentions: { parse: [] } });
return [{ json: out }];
` } } });

const avisarEquipe = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Avisar no #postagens-do-dia', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://discord.com/api/v10/channels/1567577411489501374/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $("Montar alerta").first().json.equipe }}', options: {} } } });

const praDiretoria = ifElse({ version: 2.2, config: { name: 'Também para a diretoria?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $("Montar alerta").first().json.paraDiretoria }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const avisarDiretoria = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Avisar no #avisos-escritório', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://discord.com/api/v10/channels/1560627456837427250/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $("Montar alerta").first().json.diretoria }}', options: {} } } });

const nota = sticky('## Painel · alerta da postagem do dia (V1)\nDe segunda a sábado, às 14h e às 17h (Recife). Lê os horários "✅ Publicar" de hoje na Grade de Postagem, tira cliente que não está Ativo e cliente com "🎥 Aguardando gravação", e confere a tabela "Painel · grade marcações" (botões Programado/Postado da aba Grade).\n14h: o que falta vai ao #postagens-do-dia marcando o Ismael e o Daniel. 17h: o que continua faltando vai de novo ao #postagens-do-dia marcando o Ismael e o Daniel e ao #avisos-escritório (diretoria). Quem posta é o Ismael e o Daniel (Henrique 10/11); o Rômulo não é chamado. Cliente em foco (⭐ Foco até) vem primeiro. Sem pendência, não manda nada.', [], { color: 4 });

export default workflow('painel-postagem-do-dia', 'Painel | Alerta da postagem do dia (V1)')
  .add(relogio).to(hora).to(grade).to(clientes).to(marcacoes).to(montar).to(avisarEquipe).to(praDiretoria.onTrue(avisarDiretoria))
  .add(nota);
