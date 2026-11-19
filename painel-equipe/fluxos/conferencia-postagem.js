import { workflow, node, trigger, sticky, switchCase } from '@n8n/workflow-sdk';

// Grade | Véspera e conferência no YouTube (V1) — pedido do Henrique 19/11/2026 (thread "Entender por que o Ismael não posta").
// Diagnóstico: 40 de 46 marcações eram feitas no próprio dia; sábado e domingo caíam. Regra nova: tudo agendado no YouTube
// até as 18h da véspera (sábado e domingo na sexta; segunda no sábado) e conferência automática do que foi ao ar.
//  16h  (seg–sáb) véspera: o que vai ao ar amanhã (sexta: sáb + dom) e ainda não está Programado → #postagens-do-dia (Ismael + Daniel)
//  18h  (seg–sáb) véspera: o que continua sem agendar → #postagens-do-dia + #avisos-escritório; grava a "foto" da véspera
//  20h30 (todo dia) noite: horários de hoje até 20h30 conferidos no feed do YouTube; achou → marca Postado sozinho; não achou → aviso
//  8h   (todo dia) manhã: fecha o dia anterior (no ar / atrasado / perdida) e manda as perdidas ao #avisos-escritório
//  8h30 (segunda)  placar da semana anterior no #avisos-escritório
const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const DISCORD = { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } };
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };
const MARCAS = { __rl: true, mode: 'id', value: 'eyJ8FrBneYnl3Htu', cachedResultName: 'Painel · grade marcações' };
const CONF = { __rl: true, mode: 'id', value: 'Dnt5L9W6IvrNGZ9b', cachedResultName: 'Grade · conferência YouTube' };
const PAGINAR = { pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest',
  parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] },
  paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.has_more }}', limitPagesFetched: true, maxRequests: 10 } } };
const col = id => ({ id, displayName: id, type: 'string', display: true, required: false, defaultMatch: false });

const relogio = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Horários da conferência', parameters: {
  rule: { interval: [
    { field: 'cronExpression', expression: '0 0 8,16,18 * * *' },
    { field: 'cronExpression', expression: '0 30 20 * * *' },
    { field: 'cronExpression', expression: '0 30 8 * * 1' }
  ] } } } });

const etapa = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Qual etapa', parameters: { jsCode: `const Z = 'America/Recife';
const ent = $input.first().json || {};
// Teste: { etapa, agora } no item de entrada força a etapa e o relógio.
const agora = ent.agora ? DateTime.fromISO(ent.agora, { zone: Z }) : DateTime.now().setZone(Z);
const hm = agora.hour * 100 + agora.minute;
let e = ent.etapa || '';
if (!e) {
  if (hm >= 2025 && hm <= 2040) e = 'noite';
  else if (hm >= 825 && hm <= 840) e = agora.weekday === 1 ? 'placar' : '';
  else if (agora.hour === 8) e = 'manha';
  else if (agora.hour === 16) e = 'vespera16';
  else if (agora.hour === 18) e = 'vespera18';
}
if (!e) return [];
if ((e === 'vespera16' || e === 'vespera18') && agora.weekday === 7) return [];
const hoje = agora.startOf('day');
let alvos = [];
if (e.startsWith('vespera')) {
  if (agora.weekday === 5) alvos = [hoje.plus({ days: 1 }), hoje.plus({ days: 2 })];
  else if (agora.weekday === 6) alvos = [hoje.plus({ days: 2 })];
  else alvos = [hoje.plus({ days: 1 })];
} else if (e === 'noite') alvos = [hoje];
else if (e === 'manha') alvos = [hoje.minus({ days: 1 })];
else if (e === 'placar') { for (let i = 7; i >= 1; i--) alvos.push(hoje.minus({ days: i })); }
return [{ json: { etapa: e, agora: agora.toISO(), alvos: alvos.map(d => d.toISODate()), desde: hoje.minus({ days: 10 }).toISODate() } }];
` } } });

const horarios = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Horários da grade', credentials: NOTION, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/2d21b7a7166240f5afaa4d697c3d1ae8/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { property: "Status do slot", select: { equals: "✅ Publicar" } }, page_size: 100 }) }}',
  options: PAGINAR } } });

const clientes = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Clientes ativos', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/3ddc91b406be49e98e630c298d9162d8/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { property: "Situação", select: { equals: "Ativo" } }, page_size: 100 }) }}',
  options: PAGINAR } } });

const marcacoes = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Marcações recentes', executeOnce: true, alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: MARCAS, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'dia', condition: 'gte', keyValue: '={{ $("Qual etapa").first().json.desde }}' }] }, returnAll: true } } });

const conferencias = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Conferências recentes', executeOnce: true, alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: CONF, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'dia', condition: 'gte', keyValue: '={{ $("Qual etapa").first().json.desde }}' }] }, returnAll: true } } });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Conferir e montar avisos', executeOnce: true, parameters: { jsCode: `const Z = 'America/Recife';
const E = $('Qual etapa').first().json;
const agora = DateTime.fromISO(E.agora, { zone: Z });
const sem = id => String(id || '').replace(/-/g, '');
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; if (v.date) return v.date.start; return v.url || ''; };
const DIAS = ['1 Seg', '2 Ter', '3 Qua', '4 Qui', '5 Sex', '6 Sáb', '7 Dom'];
const ISMAEL = '1410287139169763471', DANIEL = '1470387767337816128';
const POSTAGENS = '1567577411489501374', ESCRITORIO = '1560627456837427250';
const fmtD = iso => DateTime.fromISO(iso, { zone: Z }).setLocale('pt-BR').toFormat('ccc dd/MM');
const out = [];
const disc = (canal, texto, mencoes) => out.push({ json: { tipo: 'discord', canal, corpo: JSON.stringify({ content: texto.slice(0, 1990), allowed_mentions: mencoes ? { users: mencoes } : { parse: [] } }) } });

// Clientes ativos (sem TESTE e sem "🎥 Aguardando gravação").
const cli = {};
for (const it of $('Clientes ativos').all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {}, nome = txt(pr['Cliente']);
  if (/^TESTE/i.test(nome) || txt(pr['🎥 Aguardando gravação'])) continue;
  cli[sem(p.id)] = { nome, yt: txt(pr['YouTube']) };
}
// Horários × datas-alvo.
const slots = [];
for (const it of $('Horários da grade').all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {}, c = cli[sem((((pr['Cliente'] || {}).relation || [])[0] || {}).id)];
  if (!c) continue;
  const dia = txt(pr['Dia']);
  for (const d of E.alvos) {
    if (DIAS.indexOf(dia) + 1 !== DateTime.fromISO(d, { zone: Z }).weekday) continue;
    slots.push({ slot: sem(p.id), dia: d, chave: sem(p.id) + '|' + d, cliId: sem((((pr['Cliente'] || {}).relation || [])[0] || {}).id), cliente: c.nome, yt: c.yt,
      plat: txt(pr['Plataforma']), formato: txt(pr['Formato']), hora: txt(pr['Horário']), qtd: (pr['Quantidade'] || {}).number || 1 });
  }
}
const marca = {}; for (const it of $('Marcações recentes').all()) { const m = it.json || {}; if (m.chave) marca[m.chave] = m; }
const conf = {}; for (const it of $('Conferências recentes').all()) { const m = it.json || {}; if (m.chave) conf[m.chave] = m; }
const marcado = s => ['programado', 'postado'].includes((marca[s.chave] || {}).status);
const linha = s => '• **' + s.cliente + '** · ' + s.plat + ' ' + (s.formato || '').toLowerCase() + (s.qtd > 1 ? ' ×' + s.qtd : '') + ' · ' + fmtD(s.dia) + (s.hora ? ' ' + s.hora : '');
const gravarConf = (s, campos) => { const v = Object.assign({ chave: s.chave, slot: s.slot, dia: s.dia, cliente: s.cliente, formato: s.formato, plataforma: s.plat, vespera: '', resultado: '', link: '', por: '', visto: '' }, conf[s.chave] || {}, campos, { visto: agora.toFormat('dd/MM HH:mm') });
  out.push({ json: { tipo: 'conf', linha: { chave: v.chave, slot: v.slot, dia: v.dia, cliente: v.cliente, formato: v.formato, plataforma: v.plataforma, vespera: v.vespera, resultado: v.resultado, link: v.link, por: v.por, visto: v.visto } } }); };
const ordenar = a => a.sort((x, y) => x.dia.localeCompare(y.dia) || (x.hora || '99').localeCompare(y.hora || '99') || x.cliente.localeCompare(y.cliente));

// ---------- Véspera ----------
if (E.etapa === 'vespera16' || E.etapa === 'vespera18') {
  const falta = ordenar(slots.filter(s => !marcado(s)));
  if (E.etapa === 'vespera18') for (const s of slots) gravarConf(s, { vespera: marcado(s) ? 'sim' : 'nao' });
  if (falta.length) {
    const lista = falta.slice(0, 25).map(linha).join('\\n') + (falta.length > 25 ? '\\n… e mais ' + (falta.length - 25) : '');
    const quando = E.alvos.map(fmtD).join(' e ');
    if (E.etapa === 'vespera16') disc(POSTAGENS, '🗓️ <@' + ISMAEL + '> <@' + DANIEL + '> regra da véspera: o que vai ao ar ' + quando + ' precisa estar **agendado no YouTube até as 18h de hoje**, marcado como Programado na Grade com o link.\\nAinda faltam:\\n' + lista, [ISMAEL, DANIEL]);
    else {
      disc(POSTAGENS, '⚠️ <@' + ISMAEL + '> <@' + DANIEL + '> passou das 18h e estes horários de ' + quando + ' continuam sem agendamento:\\n' + lista + '\\n\\nAgendem agora e marquem na Grade. O que não der, avisem a diretoria.', [ISMAEL, DANIEL]);
      disc(ESCRITORIO, '🗓️ Véspera (' + quando + '): ' + falta.length + ' de ' + slots.length + ' horário(s) sem agendamento às 18h. Ismael e Daniel foram chamados.\\n' + lista);
    }
  }
  return out;
}

// ---------- Placar (segunda 8h30, semana anterior) ----------
if (E.etapa === 'placar') {
  const sem7 = new Set(E.alvos);
  const rows = Object.values(conf).filter(r => sem7.has(r.dia));
  const marcas = Object.values(marca).filter(m => sem7.has(m.dia) && ['programado', 'postado'].includes(m.status));
  const yt = rows.filter(r => ['no_ar', 'adiantado', 'atrasado', 'perdida', 'faltando'].includes(r.resultado) && r.plataforma === 'YouTube');
  const outras = rows.filter(r => ['marcado_sem_conferir', 'sem_marca'].includes(r.resultado));
  const semCanal = rows.filter(r => r.resultado === 'sem_canal_marcado');
  const tot = yt.length, noAr = yt.filter(r => ['no_ar', 'adiantado'].includes(r.resultado)).length;
  const atras = rows.filter(r => r.resultado === 'atrasado').length, perd = rows.filter(r => r.resultado === 'perdida');
  const vesp = rows.filter(r => r.vespera), vespSim = vesp.filter(r => r.vespera === 'sim').length;
  const pessoas = {};
  for (const m of marcas) { const p = m.por || '?'; const x = pessoas[p] = pessoas[p] || { n: 0, vesp: 0 }; x.n++; if ((conf[m.chave] || {}).vespera === 'sim') x.vesp++; }
  const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '-';
  const linhasP = Object.entries(pessoas).sort((a, b) => b[1].n - a[1].n).map(([p, x]) => '• ' + p + ': ' + x.n + ' marcação(ões), ' + x.vesp + ' agendadas na véspera');
  disc(ESCRITORIO, '📊 Placar da postagem (' + fmtD(E.alvos[0]) + ' a ' + fmtD(E.alvos[6]) + ')\\n' +
    'YouTube no ar no dia: ' + noAr + ' de ' + tot + ' (' + pct(noAr, tot) + ') · atrasadas: ' + atras + ' · perdidas: ' + perd.length + '\\n' +
    (outras.length ? 'TikTok/Instagram: ' + outras.filter(r => r.resultado === 'marcado_sem_conferir').length + ' de ' + outras.length + ' marcados (não dá para conferir sozinho)\\n' : '') +
    (semCanal.length ? 'YouTube sem canal na ficha (só marcação): ' + semCanal.length + '\\n' : '') +
    'Agendado até a véspera 18h: ' + vespSim + ' de ' + vesp.length + ' (' + pct(vespSim, vesp.length) + ')\\n' +
    (linhasP.length ? 'Por pessoa:\\n' + linhasP.join('\\n') + '\\n' : '') +
    (perd.length ? 'Perdidas:\\n' + perd.slice(0, 15).map(r => '• **' + r.cliente + '** · ' + r.plataforma + ' ' + (r.formato || '').toLowerCase() + ' · ' + fmtD(r.dia)).join('\\n') : ''));
  return out;
}

// ---------- Conferência no YouTube (noite e manhã) ----------
const get = async url => { try { return String(await this.helpers.httpRequest({ url, method: 'GET', headers: { 'Accept-Language': 'pt-BR' }, timeout: 20000 })); } catch (e) { return ''; } };
const canais = {}, feeds = {};
const canalDe = async s => {
  if (s.cliId in canais) return canais[s.cliId];
  let c = (s.yt.match(/channel\\/(UC[\\w-]{22})/) || [])[1] || '';
  if (!c && /youtube\\.com|youtu\\.be/.test(s.yt)) { const h = await get(s.yt); c = (h.match(/"externalId":"(UC[\\w-]{22})"/) || h.match(/channel_id=(UC[\\w-]{22})/) || [])[1] || ''; }
  return (canais[s.cliId] = c);
};
const videos = async (canal, pl) => {
  const k = pl + canal; if (feeds[k]) return feeds[k];
  const x = await get('https://www.youtube.com/feeds/videos.xml?playlist_id=' + pl + canal.slice(2));
  const v = [];
  for (const m of x.matchAll(/<entry>[\\s\\S]*?<yt:videoId>([^<]+)<\\/yt:videoId>[\\s\\S]*?<published>([^<]+)<\\/published>/g))
    v.push({ id: m[1], dia: DateTime.fromISO(m[2]).setZone(Z).toISODate(), usado: false });
  return (feeds[k] = { ok: !!x, v });
};
// Na noite só confere horários até 20h30; os mais tarde ficam para a manhã seguinte.
const alvo = E.etapa === 'noite' ? slots.filter(s => !s.hora || s.hora.replace('h', ':').padEnd(5, '0') <= '20:30') : slots;
const faltando = [], perdidas = [], atrasadas = [], auto = [], semMarca = [];
// Vídeos já ligados a outro horário (por link marcado ou conferência anterior) não contam de novo.
const idDe = l => (String(l || '').match(/(?:v=|youtu\\.be\\/|shorts\\/)([\\w-]{11})/) || [])[1];
const usados = {};
for (const r of Object.values(marca).concat(Object.values(conf))) { const id = idDe(r.link); if (id) (usados[id] = usados[id] || new Set()).add(r.chave); }
const livre = (v, s) => !usados[v.id] || usados[v.id].has(s.chave);
// Ordena para que horários com link marcado usem o próprio vídeo primeiro.
for (const s of ordenar(alvo)) {
  const m = marca[s.chave] || {}, ja = conf[s.chave] || {};
  if (E.etapa === 'manha' && ['no_ar', 'adiantado', 'atrasado'].includes(ja.resultado)) continue;
  if (s.plat !== 'YouTube') {
    // TikTok/Instagram não têm feed público: só dá para ver se alguém marcou.
    const r = marcado(s) ? 'marcado_sem_conferir' : 'sem_marca';
    gravarConf(s, { resultado: r, por: m.por || '', link: m.link || '' });
    if (r === 'sem_marca' && E.etapa === 'manha') semMarca.push(s);
    continue;
  }
  const canal = await canalDe(s);
  if (!canal) {
    const r = marcado(s) ? 'sem_canal_marcado' : (E.etapa === 'manha' ? 'perdida' : 'faltando');
    gravarConf(s, { resultado: r, por: m.por || '', link: m.link || '' });
    if (r === 'faltando') faltando.push(Object.assign({ semCanal: true }, s)); if (r === 'perdida') perdidas.push(Object.assign({ semCanal: true }, s));
    continue;
  }
  const f = await videos(canal, s.formato === 'Shorts' ? 'UUSH' : 'UULF');
  if (!f.ok) { gravarConf(s, { resultado: 'feed_fora', por: m.por || '' }); continue; }
  const anterior = DateTime.fromISO(s.dia, { zone: Z }).minus({ days: 1 }).toISODate();
  const idLink = idDe(m.link);
  const achados = [];
  const pega = cond => { for (const v of f.v) if (achados.length < s.qtd && !v.usado && livre(v, s) && cond(v)) { v.usado = true; achados.push(v); } };
  if (idLink) pega(v => v.id === idLink);
  pega(v => v.dia === s.dia);
  pega(v => v.dia === anterior);
  if (E.etapa === 'manha') pega(v => v.dia > s.dia);
  if (achados.length >= s.qtd) {
    const r = achados.some(v => v.dia > s.dia) ? 'atrasado' : achados.every(v => v.dia < s.dia) ? 'adiantado' : 'no_ar';
    const link = 'https://youtu.be/' + achados[0].id;
    gravarConf(s, { resultado: r, link, por: m.por || 'Conferência YouTube' });
    if (r === 'atrasado') atrasadas.push(s);
    if ((m.status || '') !== 'postado') {
      out.push({ json: { tipo: 'marca', marca: { chave: s.chave, slot: s.slot, dia: s.dia, status: 'postado', por: m.por || 'Conferência YouTube', quando: m.quando || agora.toFormat('dd/MM HH:mm'), link: m.link || link } } });
      auto.push(s);
    }
  } else {
    const r = E.etapa === 'manha' ? 'perdida' : 'faltando';
    gravarConf(s, { resultado: r, por: m.por || '', link: m.link || '' });
    (r === 'perdida' ? perdidas : faltando).push(s);
  }
}
const nota = s => s.semCanal ? ' _(sem canal na ficha, não deu para conferir)_' : (marcado(s) ? ' _(marcado ' + marca[s.chave].status + ' por ' + (marca[s.chave].por || '?') + ', mas não apareceu no canal)_' : '');
if (E.etapa === 'noite' && faltando.length) {
  const lista = faltando.slice(0, 25).map(s => linha(s) + nota(s)).join('\\n');
  disc(POSTAGENS, '🔴 <@' + ISMAEL + '> <@' + DANIEL + '> 20h30 e estes horários de hoje ainda não estão no ar:\\n' + lista + '\\n\\nSe é agendamento para mais tarde, tudo bem. Se não, postem agora.', [ISMAEL, DANIEL]);
  disc(ESCRITORIO, '🔴 Conferência 20h30: ' + faltando.length + ' horário(s) de hoje ainda fora do ar (equipe chamada).' + (auto.length ? ' ' + auto.length + ' marcado(s) como Postado pela conferência.' : '') + '\\n' + lista);
}
if (E.etapa === 'manha' && (perdidas.length || atrasadas.length)) {
  const d = fmtD(E.alvos[0]);
  disc(ESCRITORIO, '📉 Fechamento de ' + d + ':' + (perdidas.length ? '\\nPerdidas (não foram ao ar):\\n' + perdidas.slice(0, 20).map(s => linha(s) + nota(s)).join('\\n') : '') +
    (atrasadas.length ? '\\nForam ao ar atrasadas:\\n' + atrasadas.slice(0, 15).map(linha).join('\\n') : '') +
    (semMarca.length ? '\\nTikTok/Instagram sem marcação (não dá para conferir sozinho):\\n' + semMarca.slice(0, 10).map(linha).join('\\n') : ''));
}
return out;
` } } });

const porTipo = switchCase({ version: 3.2, config: { name: 'Por tipo', parameters: {
  mode: 'rules', rules: { values: ['discord', 'marca', 'conf'].map(t => ({ outputKey: t, renameOutput: true,
    conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, combinator: 'and',
      conditions: [{ leftValue: '={{ $json.tipo }}', rightValue: t, operator: { type: 'string', operation: 'equals' } }] } })) },
  options: {} } } });

const avisar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Avisar no Discord', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: '={{ "https://discord.com/api/v10/channels/" + $json.canal + "/messages" }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}', options: {} } } });

const gravarMarca = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Marcar Postado', parameters: {
  resource: 'row', operation: 'upsert', dataTableId: MARCAS, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'chave', condition: 'eq', keyValue: '={{ $json.marca.chave }}' }] },
  columns: { mappingMode: 'defineBelow', matchingColumns: [],
    value: Object.fromEntries(['chave', 'slot', 'dia', 'status', 'por', 'quando', 'link'].map(k => [k, '={{ $json.marca.' + k + ' }}'])),
    schema: ['chave', 'slot', 'dia', 'status', 'por', 'quando', 'link'].map(col) },
  options: {} } } });

const CC = ['chave', 'slot', 'dia', 'cliente', 'formato', 'plataforma', 'vespera', 'resultado', 'link', 'por', 'visto'];
const gravarConf = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Gravar conferência', parameters: {
  resource: 'row', operation: 'upsert', dataTableId: CONF, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'chave', condition: 'eq', keyValue: '={{ $json.linha.chave }}' }] },
  columns: { mappingMode: 'defineBelow', matchingColumns: [],
    value: Object.fromEntries(CC.map(k => [k, '={{ $json.linha.' + k + ' }}'])), schema: CC.map(col) },
  options: {} } } });

const nota = sticky('## Grade · véspera e conferência no YouTube (V1)\nRegra da véspera (Henrique 19/11/2026): o que vai ao ar amanhã fica agendado no YouTube até 18h de hoje (sexta cobre sáb + dom; sábado cobre segunda).\n16h e 18h (seg–sáb): avisa o que falta agendar (#postagens-do-dia; 18h também #avisos-escritório) e às 18h grava a foto da véspera.\n20h30: confere no feed público do YouTube (canal da ficha) os horários de hoje até 20h30; achou → marca Postado sozinho na Grade; não achou → aviso.\n8h: fecha o dia anterior (no_ar / adiantado / atrasado / perdida) e manda perdidas ao #avisos-escritório.\nSegunda 8h30: placar da semana. Tabela: "Grade · conferência YouTube". A marcação automática NÃO fecha o card do Entregas.', [], { color: 4 });

export default workflow('grade-conferencia-postagem', 'Grade | Véspera e conferência no YouTube (V1)')
  .add(relogio).to(etapa).to(horarios).to(clientes).to(marcacoes).to(conferencias).to(montar).to(porTipo
    .onCase(0, avisar)
    .onCase(1, gravarMarca)
    .onCase(2, gravarConf))
  .add(nota);
