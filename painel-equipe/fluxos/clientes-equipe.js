import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const ACESSO = { __rl: true, mode: 'id', value: 'ilXDZWGAcOjoajx7', cachedResultName: 'Painel equipe · acesso' };
const PAGINAR = { pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest',
  parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] },
  paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.has_more }}', limitPagesFetched: true, maxRequests: 50 } } };

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Pedir clientes da equipe', parameters: {
  httpMethod: 'POST', path: 'euforia-painel-clientes', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

const ler = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler pedido', parameters: { jsCode: `const b = ($input.first().json.body) || {};
const u = String(b.u || '').toLowerCase();
return [{ json: { u: /^[0-9a-f]{24}$/.test(u) ? u : 'x', pin: String(b.pin || '').replace(/[^0-9]/g, '').slice(0, 6) } }];
` } } });

const acesso = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Achar pessoa', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: ACESSO, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'token', condition: 'eq', keyValue: '={{ $json.u }}' }] }, limit: 1 } } });

// Só Ismael, Rômulo e diretoria (e o usuário de teste) veem a carteira.
const validar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validar acesso', parameters: { jsCode: `const p = $('Ler pedido').first().json;
const r = $input.first().json || {};
const ok = !!r.token && r.token === p.u && r.ativo === true && String(r.pin) === p.pin && ['revisor', 'calls', 'diretor', 'teste'].includes(r.papel);
return [{ json: { ok, ano: DateTime.now().setZone('America/Recife').minus({ months: 13 }).toISODate(), resposta: { ok: false, motivo: 'acesso' } } }];
` } } });

const podeSeguir = ifElse({ version: 2.2, config: { name: 'Acesso válido?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const fichas = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Fichas dos clientes', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/3ddc91b406be49e98e630c298d9162d8/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { and: [{ property: "Situação", select: { does_not_equal: "Encerrado" } }, { property: "Cliente", title: { does_not_contain: "TESTE" } }] }, sorts: [{ property: "Cliente", direction: "ascending" }], page_size: 100 }) }}',
  options: PAGINAR } } });

const entregas = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Entregas do ano', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/74b3076a325749e3bac4ba6659215e48/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { and: [{ property: "Status", select: { does_not_equal: "Cancelado" } }, { or: [{ property: "Status", select: { does_not_equal: "Postado" } }, { property: "Postado em", date: { on_or_after: $("Validar acesso").first().json.ano } }] }] }, page_size: 100 }) }}',
  options: PAGINAR } } });

// O contrato vem do texto "Resumo do contrato" da ficha. A equipe recebe só plano, tempo e entregas:
// nada de e-mail, link do contrato, valores, pagamento, garantia ou cláusula (frases com essas palavras são cortadas aqui).
// Sem total no texto, usa o catálogo do plano e avisa "pelo catálogo".
const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar clientes', parameters: { jsCode: `const Z = 'America/Recife';
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; if (v.date) return v.date.start; if (v.formula) return String(v.formula.string || v.formula.number || ''); return ''; };
const num = v => (v && typeof v.number === 'number') ? v.number : null;
const sem = id => String(id || '').replace(/-/g, '');
const hoje = DateTime.now().setZone(Z).startOf('day');
const PROIBIDO = /R\\$|pag[oa]|pagamento|valor|multa|rescis|garantia|cl[aá]usula|termo|condicionad|e-?mail|@|https?:|closer|assinad|parcela|desconto|juros|reembolso|custo|pre[cç]o|cobran|boleto|cart[aã]o|pasta|confirmar com a dire/i;
const limpa = s => String(s || '').replace(/\\\\/g, '').replace(/\\[([^\\]]*)\\]\\([^)]*\\)/g, '$1').replace(/\\s+/g, ' ').trim();
const GRUPO = { 'Vídeo longo': 'longos', 'Podcast': 'longos', 'Shorts': 'shorts', 'Carrossel': 'carrosseis', 'Thumbnail': 'thumbs', 'Roteiro': 'roteiros' };
const EXTRAS = ['Página', 'Copy', 'Funil', 'ID visual', 'Banner', 'Limpeza de canal', 'Insta-Blindado', 'Blog'];
const ABERTO = ['A fazer', 'Fazendo', 'Ajustes', 'Em revisão', 'Aguardando cliente', 'Aprovado', 'Agendado'];
const CATALOGO = { impl: { longos: 2, shorts: 4, carrosseis: 2, roteiros: 2 }, tri: { longos: 8, shorts: 24, carrosseis: 8, roteiros: 8 },
  sem: { longos: 20, shorts: 60, carrosseis: 20, roteiros: 20 }, anual: { longos: 44, shorts: 132, carrosseis: 44, roteiros: 44 } };
const porCliente = {};
for (const it of $('Entregas do ano').all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {}, cid = sem((((pr['Cliente'] || {}).relation || [])[0] || {}).id); if (!cid) continue;
  (porCliente[cid] = porCliente[cid] || []).push({ tipo: txt(pr['Tipo']), qtd: num(pr['Quantidade']) || 1, status: txt(pr['Status']), prazo: txt(pr['Prazo']).slice(0, 10), postado: txt(pr['Postado em']).slice(0, 10) });
}
const clientes = [];
for (const it of $('Fichas dos clientes').all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {}, id = sem(p.id), nome = txt(pr['Cliente']);
  const r = limpa(txt(pr['Resumo do contrato']));
  // A primeira frase diz o plano; "implementação" solta no meio do texto não conta.
  const p1 = r.split(/[.(]/)[0];
  let plano = '', chave = '';
  if (/assessoria/i.test(p1) && /trimestral/i.test(p1)) { plano = 'Assessoria trimestral'; chave = 'tri'; }
  else if (/assessoria/i.test(p1) && /semestral/i.test(p1)) { plano = 'Assessoria semestral'; chave = 'sem'; }
  else if (/assessoria/i.test(p1) && /anual/i.test(p1)) { plano = 'Assessoria anual'; chave = 'anual'; }
  else if (/protocolo/i.test(p1)) plano = 'Protocolo EDL';
  else if (/implementa/i.test(p1)) { plano = 'Implementação EDL'; chave = 'impl'; }
  else if (/lan[cç]amento/i.test(p1)) plano = 'Lançamento';
  else if (/simplificado|especial/i.test(p1)) plano = 'Contrato especial';
  const tags = [];
  if (/clone de voz/i.test(r)) tags.push('Clone de voz e imagem');
  if (/relan[cç]amento/i.test(r)) tags.push('Relançamento do canal');
  if (/2 canais/i.test(r)) tags.push('2 canais');
  // Tempo
  const dm = r.match(/(?:contrato de|assinado em)\\s*(\\d{2})\\/(\\d{2})\\/(\\d{4})/i);
  const inicio = dm ? dm[3] + '-' + dm[2] + '-' + dm[1] : txt(pr['Entrada (onboarding)']).slice(0, 10);
  const dd = r.match(/(\\d{2,3})\\s*dias(?!\\s*[uú]teis)/i), mm = r.match(/(\\d+(?:[.,]\\d+)?)\\s*meses/i);
  let meses = { tri: 3, sem: 6, anual: 12 }[chave] || null;
  if (!meses && chave === 'impl' && dd) meses = Math.round(Number(dd[1]) / 30 * 10) / 10;
  if (!meses && mm) meses = Number(mm[1].replace(',', '.'));
  if (!meses && dd) meses = Math.round(Number(dd[1]) / 30 * 10) / 10;
  let contrato = null;
  if (inicio) {
    const ini = DateTime.fromISO(inicio, { zone: Z }), fim = meses ? ini.plus({ days: Math.round(meses * 30.4) }) : null;
    const dec = Math.max(0, hoje.diff(ini, 'days').days);
    contrato = { inicio, meses, fim: fim ? fim.toISODate() : '', mes: Math.floor(hoje.diff(ini, 'months').months) + 1,
      pct: fim ? Math.max(0, Math.min(100, Math.round(dec / Math.max(1, fim.diff(ini, 'days').days) * 100))) : null,
      faltamDias: fim ? Math.round(fim.diff(hoje, 'days').days) : null };
  }
  // Previsto: o que está no texto; sem número no texto, o catálogo do plano.
  // Conta do total: a parte "Total:" ou "produção de"; sem ela, o texto sem as frases de mínimo por mês.
  const base = (r.match(/Total:([^.]*)/i) || r.match(/produ[cç][aã]o de([^.;]*)/i) || [])[1] || r.split(/;|\\.\\s/).filter(x => !/m[ií]nim|cad[eê]ncia|por m[eê]s|a partir do/i.test(x)).join('; ');
  const tot = re => { const m = base.match(re); return m ? Number(m[1]) : null; };
  const total = { longos: tot(/(\\d+)\\s*(?:v[ií]deos?\\s*)?longos/i), shorts: tot(/(\\d+)\\s*shorts/i), carrosseis: tot(/(\\d+)\\s*carross/i),
    thumbs: tot(/(\\d+)\\s*thumbs?/i), roteiros: tot(/(\\d+)\\s*roteiros/i) };
  let catalogo = false;
  if (chave && !/anexo|n[aã]o localizado/i.test(r)) for (const k in CATALOGO[chave]) if (!total[k]) { total[k] = CATALOGO[chave][k]; catalogo = true; }
  if (!total.thumbs && total.longos) total.thumbs = total.longos;
  // O que mais está no contrato (lista "Inclui:") e diferenças do catálogo, sem frases de dinheiro ou jurídico.
  const inc = (r.match(/Inclui:\\s*([^]*?)(?:\\(Contrato|$)/i) || [])[1] || (r.match(/Segue o cat[aá]logo:\\s*([^]*?)(?:Contrato assinado|$)/i) || [])[1] || '';
  const inclui = inc.split(/;|\\.\\s/).map(x => x.trim().replace(/\\.$/, '')).filter(x => x.length > 2 && !PROIBIDO.test(x)).slice(0, 20);
  const dif = (r.match(/DIFEREN[CÇ]AS DO CONTRATO:\\s*([^]*?)(?:Contrato assinado|$)/i) || [])[1] || '';
  const diferencas = dif.split(/;|\\.\\s/).map(x => x.trim().replace(/\\.$/, '')).filter(x => x.length > 2 && !PROIBIDO.test(x)).slice(0, 10);
  for (const x of r.split(/;|\\.\\s/)) if (/congelad|retomad|pausad/i.test(x) && !PROIBIDO.test(x)) diferencas.push(x.trim().replace(/\\.$/, ''));
  // Feito desde o início do contrato (roteiro conta quando aprovado ou postado).
  const lista = porCliente[id] || [];
  const feito = { longos: 0, shorts: 0, carrosseis: 0, thumbs: 0, roteiros: 0 }, mes = { longos: 0, shorts: 0, carrosseis: 0, thumbs: 0, roteiros: 0 };
  const mes0 = hoje.startOf('month').toISODate();
  for (const e of lista) { const g = GRUPO[e.tipo]; if (!g) continue;
    const pronto = e.status === 'Postado' || (g === 'roteiros' && e.status === 'Aprovado'); if (!pronto) continue;
    const quando = e.postado || '';
    if (!inicio || !quando || quando >= inicio) feito[g] += e.qtd; if (quando >= mes0) mes[g] += e.qtd; }
  const extrasFicha = ((pr['Extras do contrato'] || {}).multi_select || []).map(x => x.name);
  const ACHA = { 'Página': /p[aá]gina/i, 'Copy': /\\bcop(y|ies)/i, 'Funil': /funil/i, 'ID visual': /ID do canal|identidade visual/i, 'Banner': /banner/i, 'Limpeza de canal': /limpeza/i, 'Insta-Blindado': /insta(gram)?.?blindado/i, 'Blog': /\\bblog/i };
  const contrato_txt = inclui.concat(diferencas).filter(x => !/n[aã]o (inclui|aparece|menciona)/i.test(x)).join('; ');
  const extras = EXTRAS.filter(t => lista.some(e => e.tipo === t) || extrasFicha.some(x => x === t || (x === 'Limpeza' && t === 'Limpeza de canal')) || ACHA[t].test(contrato_txt))
    .map(t => { const l = lista.filter(e => e.tipo === t); return { tipo: t, estado: l.some(e => ['Postado', 'Aprovado'].includes(e.status)) ? 'feito' : l.some(e => ABERTO.includes(e.status)) ? 'andando' : 'falta' }; });
  const abertos = lista.filter(e => ABERTO.includes(e.status)).length;
  const atrasados = lista.filter(e => ['A fazer', 'Fazendo', 'Ajustes'].includes(e.status) && e.prazo && e.prazo < hoje.toISODate()).length;
  clientes.push({ id, nome, faixa: txt(pr['Faixa']) || txt(pr['Faixa base']), atencao: !!(pr['🔴 Atenção redobrada'] || {}).checkbox,
    situacao: txt(pr['Situação']), fase: txt(pr['Fase']).replace(/^\\d\\.\\s*/, ''), plano, tags, semContrato: !r || /n[aã]o localizado/i.test(r),
    contrato, total, catalogo, feito, mes, inclui, diferencas, extras, abertos, atrasados,
    dias: ((pr['Dias YouTube'] || {}).multi_select || []).map(x => x.name), alinhamento: txt(pr['Próximo alinhamento']).slice(0, 10), drive: /^https:/.test((pr['Drive'] || {}).url || '') ? pr['Drive'].url : '' });
}
return [{ json: { resposta: { ok: true, hoje: hoje.toISODate(), clientes } } }];
` } } });

const devolver = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver clientes', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar acesso', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Painel da equipe · clientes (V1)\nAba "Clientes" do Ismael, do Rômulo e da diretoria: plano do contrato, tempo (início, fim, mês atual), entregas previstas x feitas desde o início e o que mais o contrato inclui.\nTudo sai do "Resumo do contrato" da ficha. Frases com valor, pagamento, garantia, cláusula, e-mail ou link são cortadas antes de sair daqui. Prioridade só por faixa A/B/C.\nSó leitura.', [], { color: 4 });

export default workflow('painel-clientes-equipe', 'Painel | Clientes da equipe (V1)')
  .add(pedir).to(ler).to(acesso).to(validar)
  .to(podeSeguir.onTrue(fichas.to(entregas).to(montar).to(devolver)).onFalse(recusar))
  .add(nota);
