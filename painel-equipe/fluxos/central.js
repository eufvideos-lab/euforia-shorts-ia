import { workflow, node, trigger, ifElse, switchCase, sticky } from '@n8n/workflow-sdk';

// Central de Demandas (V1): uma lista única de tudo que precisa ser feito, em ordem de prioridade,
// com a capacidade das máquinas e da equipe agora, e um clique para mandar cada demanda para a máquina ou para uma pessoa.
const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const DISCORD = { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } };
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };
const ACESSO = { __rl: true, mode: 'id', value: 'ilXDZWGAcOjoajx7', cachedResultName: 'Painel equipe · acesso' };
const PAGINAR = { pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest',
  parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] },
  paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.has_more }}', limitPagesFetched: true, maxRequests: 20 } } };

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Pedido da Central', parameters: {
  httpMethod: 'POST', path: 'euforia-painel-central', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

// Tudo que chega da página é conferido aqui.
const ler = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler pedido', parameters: { jsCode: `const b = ($input.first().json.body) || {};
const u = String(b.u || '').toLowerCase();
const hex = v => { const s = String(v || '').replace(/-/g, '').toLowerCase(); return /^[0-9a-f]{32}$/.test(s) ? s : ''; };
const link = String(b.link || '').trim().slice(0, 500);
const DESTINOS = ['maquina', 'victor', 'lorena', 'daniel', 'ismael', 'romulo', 'eu'];
const pv = b.prevista || {};
const prevista = hex(pv.cliente) && ['longo', 'shorts', 'carrossel'].includes(pv.tipo) && /^\\d{4}-\\d{2}-\\d{2}$/.test(String(pv.postar || ''))
  ? { cliente: hex(pv.cliente), tipo: pv.tipo, postar: String(pv.postar), qtd: Math.max(1, Math.min(12, parseInt(pv.qtd, 10) || 1)) } : null;
return [{ json: { u: /^[0-9a-f]{24}$/.test(u) ? u : 'x', pin: String(b.pin || '').replace(/[^0-9]/g, '').slice(0, 6),
  acao: ['ver', 'mandar'].includes(b.acao) ? b.acao : '', card: hex(b.card) || '00000000000000000000000000000000', prevista,
  destino: DESTINOS.includes(b.destino) ? b.destino : '', link: /^https:\\/\\/[^\\s]+$/.test(link) ? link : '',
  nota: String(b.nota || '').trim().slice(0, 600) } }];
` } } });

const acesso = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Achar pessoa', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: ACESSO, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'token', condition: 'eq', keyValue: '={{ $json.u }}' }] }, limit: 1 } } });

// Só quem distribui trabalho entra: Ismael (revisor), Rômulo (calls), diretoria e o usuário de teste.
const validar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validar acesso', parameters: { jsCode: `const p = $('Ler pedido').first().json;
const r = $input.first().json || {};
const ok = !!r.token && r.token === p.u && r.ativo === true && String(r.pin) === p.pin && ['revisor', 'calls', 'diretor', 'teste'].includes(r.papel);
let motivo = ok ? '' : 'acesso';
if (ok && !p.acao) motivo = 'acao';
if (ok && p.acao === 'mandar' && !p.destino) motivo = 'destino';
const hoje = DateTime.now().setZone('America/Recife');
const seg = hoje.minus({ days: hoje.weekday - 1 }).toISODate();
return [{ json: { ok: !motivo, acao: motivo ? 'recusar' : p.acao, nome: r.nome || '', papel: r.papel || '', ficha: String(r.ficha || '').replace(/-/g, ''),
  semana: seg, seteDias: hoje.minus({ days: 7 }).toISODate(), resposta: { ok: false, motivo } } }];
` } } });

const caminho = switchCase({ version: 3.2, config: { name: 'O que fazer', parameters: { rules: { values: [
    { outputKey: 'ver', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ $json.acao }}', rightValue: 'ver', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
    { outputKey: 'mandar', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ $json.acao }}', rightValue: 'mandar', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
    { outputKey: 'recusar', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ $json.acao }}', rightValue: 'recusar', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } }
  ] }, options: {} } } });

// ---------- Ver: demandas abertas, cards desta semana, clientes e as filas das máquinas ----------
const entregas = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Cards abertos e da semana', credentials: NOTION, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/74b3076a325749e3bac4ba6659215e48/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { and: [{ property: "Status", select: { does_not_equal: "Cancelado" } }, { or: [{ property: "Status", select: { equals: "A fazer" } }, { property: "Status", select: { equals: "Fazendo" } }, { property: "Status", select: { equals: "Ajustes" } }, { property: "Postar em", date: { on_or_after: $json.semana } }] }] }, sorts: [{ property: "Prazo", direction: "ascending" }], page_size: 100 }) }}',
  options: PAGINAR } } });

const clientes = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Clientes ativos', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/3ddc91b406be49e98e630c298d9162d8/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { property: "Situação", select: { does_not_equal: "Encerrado" } }, sorts: [{ property: "Cliente", direction: "ascending" }], page_size: 100 }) }}',
  options: PAGINAR } } });

// Quadros das máquinas: o que está na fila, fazendo, com erro e o que ficou pronto nos últimos 7 dias.
const qLongos = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Quadro de Longos', credentials: NOTION, executeOnce: true, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/3fea57fbb3ca4a7d9d16921d2f0b00cf/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { or: [{ property: "Status", select: { equals: "Editar" } }, { property: "Status", select: { equals: "Ajustar" } }, { property: "Status", select: { equals: "Em edição" } }, { property: "Status", select: { equals: "Erro" } }, { property: "Entregue em", date: { on_or_after: $("Validar acesso").first().json.seteDias } }] }, page_size: 100 }) }}',
  options: PAGINAR } } });
const qShorts = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Quadro de Shorts', credentials: NOTION, executeOnce: true, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/8205f7673c224763b28891e768cb3916/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { or: [{ property: "Status", select: { equals: "Editar" } }, { property: "Status", select: { equals: "Ajustar" } }, { property: "Status", select: { equals: "Em edição" } }, { property: "Status", select: { equals: "Erro" } }, { property: "Entregue em", date: { on_or_after: $("Validar acesso").first().json.seteDias } }] }, page_size: 100 }) }}',
  options: PAGINAR } } });
const qCarrosseis = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Quadro de Carrosséis', credentials: NOTION, executeOnce: true, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/4cc9fd21563940afb1512e1d4f9a2bfb/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { or: [{ property: "Status", select: { equals: "Criar" } }, { property: "Status", select: { equals: "Ajustar" } }, { property: "Status", select: { equals: "Em produção" } }, { property: "Status", select: { equals: "Erro" } }, { property: "Entregue em", date: { on_or_after: $("Validar acesso").first().json.seteDias } }] }, page_size: 100 }) }}',
  options: PAGINAR } } });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar central', parameters: { jsCode: `const Z = 'America/Recife';
const quem = $('Validar acesso').first().json;
const dir = quem.papel === 'diretor', teste = quem.papel === 'teste';
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; if (v.date) return v.date.start; if (v.url !== undefined) return v.url || ''; if (v.formula) return String(v.formula.string || v.formula.number || ''); return ''; };
const num = v => (v && typeof v.number === 'number') ? v.number : null;
const sem = id => String(id || '').replace(/-/g, '');
const agora = DateTime.now().setZone(Z), hoje = agora.startOf('day'), HOJE = hoje.toISODate();
const dias = s => s ? Math.round(DateTime.fromISO(String(s).slice(0, 10), { zone: Z }).diff(hoje, 'days').days) : null;
const PESSOAS = { '3ea98c0cdde08182a952f3d9a5b73575': ['victor', 'Victor', 'Edição'], '3ea98c0cdde08163bd16f0213b098cb5': ['lorena', 'Lorena', 'Edição'],
  '3ea98c0cdde0817e87aee637a96d4fd1': ['daniel', 'Daniel', 'Edição e canal'], '3ea98c0cdde0812d9cb4c41ce70df4ae': ['ismael', 'Ismael', 'Revisão e postagem'],
  '3ea98c0cdde081299709cf901fac7275': ['romulo', 'Rômulo', 'Calls e canal'] };
const ESC = '3ea98c0cdde0812bba06cba7e4261426';
const ABERTO = ['A fazer', 'Fazendo', 'Ajustes'];

// Horários das rotinas (Brasília = Recife), seg a sex. porRodada = quantos pedidos cada rodada pega.
const MAQ = {
  longos: { nome: 'Máquina de Longos', faz: 'vídeo longo', porRodada: 1, min: 37, horas: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17] },
  shorts: { nome: 'Máquina de Shorts', faz: 'pedido de shorts', porRodada: 3, min: 7, horas: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17] },
  carrosseis: { nome: 'Máquina de Carrosséis', faz: 'pedido de carrossel', porRodada: 2, min: 47, horas: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17] },
  escritorio: { nome: 'Máquina do Escritório', faz: 'card (thumb, arte, página, roteiro, apresentação...)', porRodada: 3, min: 15, horas: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] } };
// Próximas rodadas a partir de agora (até 15 dias úteis à frente).
const rodadas = m => { const out = []; for (let d = 0; d < 21 && out.length < 400; d++) { const dt = hoje.plus({ days: d }); if (dt.weekday > 5) continue;
  for (const h of m.horas) { const t = dt.set({ hour: h, minute: m.min }); if (t > agora) out.push(t); } } return out; };
const quando = t => { const k = Math.round(t.startOf('day').diff(hoje, 'days').days); const h = t.toFormat("HH'h'mm");
  return k === 0 ? 'hoje ~' + h : k === 1 ? 'amanhã ~' + h : t.setLocale('pt-BR').toFormat('ccc dd/MM').replace('.', '') + ' ~' + h; };
for (const k of Object.keys(MAQ)) { const m = MAQ[k]; m.prox = rodadas(m);
  m.rodadasHoje = m.prox.filter(t => t.hasSame(agora, 'day')).length; m.cabeHoje = m.rodadasHoje * m.porRodada; }
// Quando fica pronto um pedido novo que entra atrás de "fila" pedidos.
const eta = (m, fila) => { const t = m.prox[Math.floor(fila / m.porRodada)]; return t || null; };

const cli = {};
for (const it of $('Clientes ativos').all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {};
  const resumo = txt(pr['Resumo do contrato']);
  const mm = resumo.match(/(\\d{1,2})\\s*meses/i), dm = resumo.match(/contrato de (\\d{2})\\/(\\d{2})\\/(\\d{4})/i);
  const ini = dm ? dm[3] + '-' + dm[2] + '-' + dm[1] : txt(pr['Entrada (onboarding)']).slice(0, 10);
  const fim = ini && mm ? DateTime.fromISO(ini, { zone: Z }).plus({ months: Number(mm[1]) }) : null;
  cli[sem(p.id)] = { id: sem(p.id), nome: txt(pr['Cliente']), faixa: (txt(pr['Faixa']) || txt(pr['Faixa base'])).replace(/[^ABC]/g, '').slice(0, 1),
    situacao: txt(pr['Situação']), atencao: !!(pr['🔴 Atenção redobrada'] || {}).checkbox, clima: txt(pr['Clima']), recuperacao: txt(pr['Recuperação']),
    fimDias: fim ? Math.round(fim.diff(hoje, 'days').days) : null,
    ritmo: { longo: num(pr['Longos por semana']) || 0, shorts: num(pr['Shorts por semana']) || 0, carrossel: num(pr['Carrosséis por semana']) || 0 },
    diasYT: ((pr['Dias YouTube'] || {}).multi_select || []).map(x => x.name) };
}

// ---------- Filas das máquinas ----------
const lerQuadro = nome => { const out = { fila: 0, fazendo: 0, erro: 0, feitos7: 0, ok: true, itens: [] };
  let pages = []; try { for (const it of $(nome).all()) { if (it.json.error || it.json.object === 'error') out.ok = false; pages = pages.concat(it.json.results || []); } } catch (e) { out.ok = false; }
  for (const p of pages) { const pr = p.properties || {}, s = txt(pr['Status']); const cid = sem((((pr['Cliente'] || {}).relation || [])[0] || {}).id);
    if (['Editar', 'Criar', 'Ajustar'].includes(s)) { out.fila++; out.itens.push({ cliente: (cli[cid] || {}).nome || txt(pr['Pedido']).split('|')[0].trim(), status: s }); }
    else if (['Em edição', 'Em produção'].includes(s)) out.fazendo++;
    else if (s === 'Erro') out.erro++;
    if (txt(pr['Entregue em'])) out.feitos7++; }
  out.itens = out.itens.slice(0, 12); return out; };
const Q = { longos: lerQuadro('Quadro de Longos'), shorts: lerQuadro('Quadro de Shorts'), carrosseis: lerQuadro('Quadro de Carrosséis'),
  escritorio: { fila: 0, fazendo: 0, erro: 0, feitos7: null, ok: true, itens: [] } };

// ---------- Cards ----------
const todos = [];
for (const it of $('Cards abertos e da semana').all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {}, titulo = txt(pr['Entrega']);
  const ehTeste = /TESTE (PAINEL|PORTAL)/i.test(titulo);
  if (teste ? !/TESTE PAINEL/.test(titulo) : ehTeste) continue;
  const cid = sem((((pr['Cliente'] || {}).relation || [])[0] || {}).id);
  const partes = titulo.split('|').map(s => s.trim()).filter(Boolean);
  todos.push({ id: sem(p.id), cod: ((pr['Código'] || {}).unique_id || {}).number || null, url: dir ? p.url : '', titulo,
    nome: partes.length > 1 ? partes.slice(1).join(' · ') : titulo, cliente: cid, clienteNome: (cli[cid] || {}).nome || partes[0] || '',
    tipo: txt(pr['Tipo']), qtd: num(pr['Quantidade']) || 1, status: txt(pr['Status']), prazo: txt(pr['Prazo']).slice(0, 10), postar: txt(pr['Postar em']).slice(0, 10),
    prioridade: txt(pr['Prioridade']), origem: txt(pr['Origem']), escritorio: txt(pr['🏢 Escritório IA']), link: txt(pr['Link do arquivo']),
    resp: ((pr['Responsável'] || {}).relation || []).map(r => sem(r.id)), obs1: txt(pr['Obs']).split('\\n')[0].slice(0, 200) });
}
const abertos = todos.filter(c => ABERTO.includes(c.status));
for (const c of abertos) if (c.resp.includes(ESC)) { if (c.escritorio === 'Fazendo (IA)') Q.escritorio.fazendo++; else if (!c.escritorio || c.escritorio === 'Na fila') Q.escritorio.fila++; }

// Onde a demanda está agora.
const onde = c => {
  if (c.resp.includes(ESC)) {
    if (c.escritorio === 'Foi para outra máquina') return ['maquina', 'No quadro de uma máquina'];
    if (c.escritorio === 'À mão (Flau)') return ['flau', 'Com a diretoria (à mão)'];
    if (['Precisa da Direção', 'Falta informação', 'Falta do cliente'].includes(c.escritorio)) return ['travado', 'Máquina parou: ' + c.escritorio.toLowerCase()];
    return ['maquina', c.escritorio === 'Fazendo (IA)' ? 'Máquina do Escritório fazendo' : 'Na fila da Máquina do Escritório']; }
  const ps = c.resp.filter(r => PESSOAS[r]).map(r => PESSOAS[r][1]);
  return ps.length ? ['pessoa', 'Com ' + ps.join(' e ')] : ['ninguem', 'Sem ninguém'];
};

// Carga da equipe: o que cada um tem aberto.
const carga = {};
for (const id of Object.keys(PESSOAS)) carga[id] = { id: PESSOAS[id][0], nome: PESSOAS[id][1], papel: PESSOAS[id][2], abertos: 0, atrasados: 0, hoje: 0, fazendo: 0 };
for (const c of abertos) for (const r of c.resp) if (carga[r]) { const k = dias(c.prazo); carga[r].abertos++; if (c.status === 'Fazendo') carga[r].fazendo++; if (k !== null && k < 0) carga[r].atrasados++; if (k === 0) carga[r].hoje++; }
const EDIT = ['3ea98c0cdde08182a952f3d9a5b73575', '3ea98c0cdde08163bd16f0213b098cb5', '3ea98c0cdde0817e87aee637a96d4fd1'];
const maisLivre = ids => ids.map(i => carga[i]).sort((a, b) => (a.abertos + a.atrasados * 2) - (b.abertos + b.atrasados * 2))[0];

// Prioridade: prazo, dia de ir ao ar, cliente triste (🔴, clima, SOS), faixa, urgência e fim de contrato.
const MAQ_DO_TIPO = { 'Vídeo longo': 'longos', 'Shorts': 'shorts', 'Carrossel': 'carrosseis' };
['Thumbnail', 'Arte', 'Banner', 'ID visual', 'Página', 'Funil', 'Blog', 'Roteiro', 'Copy', 'Apresentação', 'Relatório', 'Estratégia', 'Insta-Blindado'].forEach(t => MAQ_DO_TIPO[t] = 'escritorio');
const fila = { longos: Q.longos.fila, shorts: Q.shorts.fila, carrosseis: Q.carrosseis.fila, escritorio: Q.escritorio.fila };
function pontuar(c, k) {
  const m = [], pz = dias(c.prazo), ar = dias(c.postar); let s = 0;
  if (pz !== null && pz < 0) { s += 40 + Math.min(30, -pz * 2); m.push(-pz === 1 ? 'Atrasado 1 dia' : 'Atrasado ' + (-pz) + ' dias'); }
  else if (pz === 0) { s += 35; m.push('Prazo hoje'); } else if (pz === 1) { s += 25; m.push('Prazo amanhã'); } else if (pz !== null && pz <= 6) s += 12 - pz;
  if (ar !== null && ar >= 0 && ar <= 3) { s += 25 - ar * 5; m.push(ar === 0 ? 'Vai ao ar hoje' : ar === 1 ? 'Vai ao ar amanhã' : 'Vai ao ar em ' + ar + ' dias'); }
  if (k.atencao) { s += 30; m.push('🔴 Atenção redobrada'); }
  if (k.recuperacao === '🚨 SOS') { s += 30; m.push('🚨 Cliente em SOS'); }
  if (['Sensível', 'Em rescisão'].includes(k.clima)) { s += k.clima === 'Em rescisão' ? 35 : 25; m.push(dir ? '😟 Clima: ' + k.clima : '😟 Cliente sensível'); }
  if (k.faixa === 'A') { s += 20; m.push('Faixa A'); } else if (k.faixa === 'B') s += 10;
  if (c.prioridade === 'Urgente') { s += 25; m.push('Urgente'); }
  if (c.origem === 'Recuperação') { s += 10; m.push('Recuperação'); }
  if (c.origem === 'Treino (fila reserva)') s -= 40;
  if (k.fimDias !== null && k.fimDias >= 0 && k.fimDias <= 30) { s += 15; m.push(dir ? 'Contrato acaba em ' + k.fimDias + ' dias' : 'Fim de contrato perto'); }
  return { score: Math.max(0, Math.round(s)), motivos: m };
}
// Sugestão: máquina quando ela entrega antes do prazo; senão a pessoa com menos carga.
function sugerir(c, ondeK) {
  const mq = MAQ_DO_TIPO[c.tipo];
  if (mq) { const m = MAQ[mq], t = eta(m, fila[mq]);
    const cabe = t && (!c.prazo || dias(c.prazo) < 0 || t.startOf('day') <= DateTime.fromISO(c.prazo, { zone: Z }));
    if (cabe || mq === 'escritorio' || mq === 'carrosseis') return { destino: 'maquina', maquina: mq, texto: m.nome + (t ? ' · começa ' + quando(t) : ''), precisaLink: ['longos', 'shorts'].includes(mq) && !/^https:/.test(c.link) };
    const p = maisLivre(EDIT); return { destino: p.id, texto: p.nome + ' · ' + m.nome + ' só entrega ' + (t ? quando(t) : 'depois do prazo') }; }
  if (c.tipo === 'Limpeza de canal') return { destino: 'daniel', texto: 'Daniel (limpeza e SEO de canal)' };
  if (c.tipo === 'Podcast') { const p = maisLivre(EDIT); return { destino: p.id, texto: p.nome + ' (menos carga agora)' }; }
  return ondeK === 'ninguem' ? { destino: '', texto: 'Escolha quem faz' } : null;
}
const demandas = abertos.map(c => { const k = cli[c.cliente] || {}; const o = onde(c), pt = pontuar(c, k), pz = dias(c.prazo);
  return { id: c.id, cod: c.cod, url: c.url, cliente: c.cliente, clienteNome: c.clienteNome, nome: c.nome, tipo: c.tipo, qtd: c.qtd, status: c.status,
    prazo: c.prazo, postar: c.postar, link: /^https:/.test(c.link) ? c.link : '', obs1: c.obs1, faixa: k.faixa || '', atencao: !!k.atencao,
    onde: o[0], ondeTexto: o[1], resp: c.resp.filter(r => PESSOAS[r]).map(r => PESSOAS[r][0]), score: pt.score, motivos: pt.motivos,
    velho: pz !== null && pz < -15, sugestao: ['maquina', 'flau'].includes(o[0]) ? null : sugerir(c, o[0]) }; })
  .sort((a, b) => b.score - a.score || String(a.prazo || '9').localeCompare(String(b.prazo || '9')));

// ---------- Previstas: o ritmo da ficha (longos, shorts e carrosséis por semana) contra os cards que já existem na semana ----------
const ini = agora.weekday <= 4 ? hoje.minus({ days: agora.weekday - 1 }) : hoje.plus({ days: 8 - agora.weekday });
const fimS = ini.plus({ days: 6 });
const DIA = { seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6, 'sáb': 6, dom: 7 };
const diaN = s => { const t = String(s).toLowerCase().replace(/[^a-záéíóúâêôãõç]/g, '').slice(0, 3); return DIA[t] || null; };
const TIPO_P = { longo: 'Vídeo longo', shorts: 'Shorts', carrossel: 'Carrossel' };
const previstas = []; let semRitmo = 0;
for (const k of Object.values(cli)) {
  if (/TESTE/i.test(k.nome) || /paus|stand|encerr|cancel|inativ/i.test(k.situacao)) continue;
  if (!k.ritmo.longo && !k.ritmo.shorts && !k.ritmo.carrossel) { semRitmo++; continue; }
  const daSemana = todos.filter(c => c.cliente === k.id && c.postar && c.postar >= ini.toISODate() && c.postar <= fimS.toISODate());
  for (const tp of ['longo', 'shorts', 'carrossel']) {
    const quer = k.ritmo[tp]; if (!quer) continue;
    const ja = daSemana.filter(c => c.tipo === TIPO_P[tp]), tem = ja.reduce((a, c) => a + (c.qtd || 1), 0);
    let falta = quer - tem; if (falta <= 0) continue;
    const usados = new Set(ja.map(c => c.postar));
    const preferidos = (tp === 'longo' ? k.diasYT.map(diaN).filter(Boolean) : []).concat(tp === 'carrossel' ? [3] : [1, 3, 5]);
    const datas = []; for (const d of [...new Set(preferidos)].concat([1, 2, 3, 4, 5])) { const dt = ini.plus({ days: d - 1 }); const s = dt.toISODate();
      if (dt < hoje.plus({ days: 1 }) || usados.has(s) || datas.includes(s)) continue; datas.push(s); }
    const mk = (postar, qtd) => { const fake = { tipo: TIPO_P[tp], prazo: '', postar, prioridade: '', origem: 'Pacote semanal', link: '' };
      const pt = pontuar(fake, k); return { chave: k.id + '|' + tp + '|' + postar, cliente: k.id, clienteNome: k.nome, tipo: tp, tipoNome: TIPO_P[tp], postar, qtd,
        faixa: k.faixa, atencao: k.atencao, score: pt.score, motivos: pt.motivos, sugestao: sugerir(fake, 'ninguem') }; };
    if (tp === 'shorts') { if (datas[0]) previstas.push(mk(datas[0], falta)); }
    else for (const d of datas.slice(0, falta)) previstas.push(mk(d, 1));
  }
}
previstas.sort((a, b) => b.score - a.score || a.postar.localeCompare(b.postar));

const maquinas = Object.keys(MAQ).map(k => { const m = MAQ[k], q = Q[k], t = eta(m, q.fila);
  const estado = !q.ok ? 'sem-leitura' : q.erro ? 'erro' : !m.rodadasHoje ? 'parada' : q.fila > m.cabeHoje ? 'cheia' : q.fila > m.cabeHoje / 2 ? 'apertada' : 'livre';
  return { id: k, nome: m.nome, faz: m.faz, fila: q.fila, fazendo: q.fazendo, erro: q.erro, feitos7: q.feitos7, porRodada: m.porRodada, rodadasHoje: m.rodadasHoje,
    cabeHoje: m.cabeHoje, proxima: m.prox[0] ? quando(m.prox[0]) : '', novoEntra: t ? quando(t) : '', estado, itens: q.itens }; });

return [{ json: { resposta: { ok: true, nome: quem.nome, papel: quem.papel, hoje: HOJE, agora: agora.toFormat('HH:mm'),
  hojeTexto: agora.setLocale('pt-BR').toFormat("cccc, dd 'de' LLLL"), semana: { de: ini.toISODate(), ate: fimS.toISODate() },
  maquinas, pessoas: Object.values(carga), demandas, previstas, semRitmo } } }];
` } } });

const devolverVer = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver central', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

// ---------- Mandar: para a máquina, para uma pessoa ou "eu faço" ----------
const cardAtual = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Card atual', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://api.notion.com/v1/pages/{{ $("Ler pedido").first().json.card }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, options: {} } } });

const ficha = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Ficha do cliente', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '={{ "https://api.notion.com/v1/pages/" + (($("Ler pedido").first().json.prevista || {}).cliente || ((((($("Card atual").first().json.properties || {})["Cliente"] || {}).relation || [])[0] || {}).id || "00000000000000000000000000000000")) }}',
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendHeaders: true, headerParameters: NOTION_HDR, options: {} } } });

const checar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Checar envio', parameters: { jsCode: `const Z = 'America/Recife';
const p = $('Ler pedido').first().json, v = $('Validar acesso').first().json;
const card = $('Card atual').first().json || {}, fc = $('Ficha do cliente').first().json || {};
const txt = x => { if (!x) return ''; const a = x.title || x.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (x.select) return x.select.name; if (x.date) return x.date.start; if (x.url !== undefined) return x.url || ''; return ''; };
const sem = id => String(id || '').replace(/-/g, '');
const agora = DateTime.now().setZone(Z);
const PESSOA = { victor: ['3ea98c0cdde08182a952f3d9a5b73575', 'Victor', '1142062975071551528'], lorena: ['3ea98c0cdde08163bd16f0213b098cb5', 'Lorena', '827882215185973279'],
  daniel: ['3ea98c0cdde0817e87aee637a96d4fd1', 'Daniel', '1470387767337816128'], ismael: ['3ea98c0cdde0812d9cb4c41ce70df4ae', 'Ismael', '1410287139169763471'],
  romulo: ['3ea98c0cdde081299709cf901fac7275', 'Rômulo', '1490768736876237082'] };
const ESC = '3ea98c0cdde0812bba06cba7e4261426';
const nomeCli = txt((fc.properties || {})['Cliente']);
const cliOk = !!nomeCli && sem((fc.parent || {}).database_id) === '3ddc91b406be49e98e630c298d9162d8';
const teste = v.papel === 'teste';
let erro = '', tipo = '', titulo = '', link = p.link, status = '', resp = [];
const TIPO_P = { longo: 'Vídeo longo', shorts: 'Shorts', carrossel: 'Carrossel' };
if (p.prevista) {
  tipo = TIPO_P[p.prevista.tipo];
  if (teste) erro = 'teste';
  else if (!cliOk) erro = 'cliente';
  else if (p.prevista.postar < agora.toISODate()) erro = 'data';
  const dt = DateTime.fromISO(p.prevista.postar, { zone: Z });
  titulo = nomeCli.toUpperCase() + ' | ' + ({ longo: 'VÍDEO PADRÃO', shorts: 'SHORTS', carrossel: 'CARROSSEL' })[p.prevista.tipo] + ' | ' + dt.setLocale('pt-BR').toFormat('ccc dd/MM').replace('.', '').toUpperCase();
} else {
  const cp = card.properties || {};
  titulo = txt(cp['Entrega']); tipo = txt(cp['Tipo']); status = txt(cp['Status']);
  resp = ((cp['Responsável'] || {}).relation || []).map(r => sem(r.id));
  if (!link && /^https:/.test(txt(cp['Link do arquivo']))) link = txt(cp['Link do arquivo']);
  if (!card.id || sem((card.parent || {}).database_id) !== '74b3076a325749e3bac4ba6659215e48') erro = 'card';
  else if (!['A fazer', 'Fazendo', 'Ajustes'].includes(status)) erro = 'etapa';
  else if (teste && !/TESTE PAINEL/.test(titulo)) erro = 'teste';
  else if (!teste && /TESTE (PAINEL|PORTAL)/.test(titulo)) erro = 'teste';
}
// Para onde vai.
const MAQ = { 'Vídeo longo': 'longos', 'Shorts': 'shorts', 'Carrossel': 'carrosseis' };
['Thumbnail', 'Arte', 'Banner', 'ID visual', 'Página', 'Funil', 'Blog', 'Roteiro', 'Copy', 'Apresentação', 'Relatório', 'Estratégia', 'Insta-Blindado', 'Outro'].forEach(t => MAQ[t] = 'escritorio');
let alvo = null;
if (!erro) {
  if (p.destino === 'maquina') {
    const mq = MAQ[tipo];
    if (!mq) erro = 'semmaquina';
    else if (['longos', 'shorts'].includes(mq) && !link) erro = 'link';
    else alvo = { tipo: 'maquina', maquina: mq, nome: { longos: 'Máquina de Longos', shorts: 'Máquina de Shorts', carrosseis: 'Máquina de Carrosséis', escritorio: 'Máquina do Escritório' }[mq] };
  } else if (p.destino === 'eu') {
    alvo = v.papel === 'diretor' ? { tipo: 'flau', nome: 'a diretoria (à mão)' } : { tipo: 'pessoa', id: v.ficha, nome: v.nome, discord: '' };
    if (alvo.tipo === 'pessoa' && !/^[0-9a-f]{32}$/.test(alvo.id)) erro = 'acesso';
  } else { const q = PESSOA[p.destino]; alvo = { tipo: 'pessoa', id: q[0], nome: q[1], discord: q[2] }; }
  if (!erro && alvo.tipo === 'pessoa' && resp.length === 1 && resp[0] === alvo.id) erro = 'pessoa';
}
const hora = agora.toFormat('dd/MM HH:mm');
const linha = '[Central ' + hora + '] ' + v.nome + (p.destino === 'eu' && alvo && alvo.tipo === 'pessoa' ? ' ficou com a demanda' : ' mandou para ' + (alvo ? alvo.nome : '')) + (p.nota ? ': ' + p.nota : '');
// Quadro da máquina (longos, shorts, carrosséis): o mesmo pedido que o "Pedir ao escritório" cria.
let quadro = null;
if (!erro && alvo.tipo === 'maquina' && alvo.maquina !== 'escritorio' && !teste) {
  const cid = p.prevista ? p.prevista.cliente : sem(((((card.properties || {})['Cliente'] || {}).relation || [])[0] || {}).id);
  const NA = /ACR[ÓO]POLE/i.test(nomeCli);
  const t = s => [{ type: 'text', text: { content: String(s).slice(0, 1990) } }];
  const base = { 'Cliente': { relation: [{ id: cid }] } };
  if (alvo.maquina === 'longos') quadro = { db: '3fea57fbb3ca4a7d9d16921d2f0b00cf', props: Object.assign(base, { 'Pedido': { title: t(nomeCli.toUpperCase() + ' | VÍDEO LONGO (central)') },
    'Status': { select: { name: 'Editar' } }, 'Modelo': { select: { name: NA ? 'Nova Acrópole' : 'Padrão' } }, 'Vídeo bruto (link do Drive)': { url: link } }) };
  if (alvo.maquina === 'shorts') quadro = { db: '8205f7673c224763b28891e768cb3916', props: Object.assign(base, { 'Pedido': { title: t(nomeCli.toUpperCase() + ' | SHORTS (central)') },
    'Status': { select: { name: 'Editar' } }, 'Quantidade': { select: { name: ((p.prevista && p.prevista.qtd) || ((card.properties || {})['Quantidade'] || {}).number || 3) === 1 ? '1 short' : '3 shorts' } },
    ...(NA ? { 'Estilo': { select: { name: 'Nova Acrópole' } } } : {}), 'Vídeo editado (link do Drive)': { url: link } }) };
  if (alvo.maquina === 'carrosseis') { const q = (p.prevista && p.prevista.qtd) || ((card.properties || {})['Quantidade'] || {}).number || 1;
    quadro = { db: '4cc9fd21563940afb1512e1d4f9a2bfb', props: Object.assign(base, { 'Pedido': { title: t(nomeCli.toUpperCase() + ' | CARROSSEL (central)') },
    'Status': { select: { name: 'Criar' } }, 'Pacote': { select: { name: q >= 12 ? '12 carrosséis' : q >= 6 ? '6 carrosséis' : q >= 3 ? '3 carrosséis' : '1 carrossel' } } }) }; }
  quadro.obs = (p.nota ? p.nota + '\\n' : '') + (link ? 'Link: ' + link + '\\n' : '') + 'Mandado por ' + v.nome + ' pela Central de Demandas. Card no Entregas: ';
}
// Card novo da prevista: Prazo = D-3 de ir ao ar (fim de semana vale a sexta antes), nunca antes de hoje.
let criar = null;
if (!erro && p.prevista) {
  let pz = DateTime.fromISO(p.prevista.postar, { zone: Z }).minus({ days: 3 });
  if (pz.weekday === 6) pz = pz.minus({ days: 1 }); if (pz.weekday === 7) pz = pz.minus({ days: 2 });
  if (pz < agora.startOf('day')) { pz = agora.startOf('day'); if (pz.weekday > 5) pz = pz.plus({ days: 8 - pz.weekday }); }
  criar = JSON.stringify({ parent: { database_id: '74b3076a325749e3bac4ba6659215e48' }, properties: {
    'Entrega': { title: [{ type: 'text', text: { content: titulo } }] }, 'Cliente': { relation: [{ id: p.prevista.cliente }] }, 'Tipo': { select: { name: tipo } },
    'Status': { select: { name: 'A fazer' } }, 'Origem': { select: { name: 'Pacote semanal' } }, 'Postar em': { date: { start: p.prevista.postar } },
    'Prazo': { date: { start: pz.toISODate() } }, 'Quantidade': { number: p.prevista.qtd },
    'Obs': { rich_text: [{ type: 'text', text: { content: '[Central ' + hora + '] Card criado pela Central de Demandas (previsto pelo ritmo da ficha).' } }] } } });
}
return [{ json: { ok: !erro, resposta: { ok: false, motivo: erro }, prevista: !!p.prevista, criar, titulo, tipo, link, alvo, linha, quadro, teste,
  quadroDb: quadro ? quadro.db : '', quadroProps: quadro ? JSON.stringify(quadro.props) : '' } }];
` } } });

const podeMandar = ifElse({ version: 2.2, config: { name: 'Envio válido?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });
const ehPrevista = ifElse({ version: 2.2, config: { name: 'É prevista?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $("Checar envio").first().json.prevista }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const criarCard = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Criar card da prevista', credentials: NOTION, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/pages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $("Checar envio").first().json.criar }}', options: {} } } });

// Junta o card (o que já existia ou o que acabou de nascer) e decide se cria pedido no quadro da máquina.
const juntar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Juntar card', parameters: { jsCode: `const c = $('Checar envio').first().json;
let pg = null;
if (c.prevista) { try { pg = $('Criar card da prevista').first().json; } catch (e) {} } else pg = $('Card atual').first().json;
return [{ json: { id: String((pg || {}).id || '').replace(/-/g, ''), url: (pg || {}).url || '', obsAntiga: (((pg || {}).properties || {})['Obs'] || {}).rich_text || [], vaiQuadro: !!c.quadroDb } }];
` } } });

const vaiQuadro = ifElse({ version: 2.2, config: { name: 'Vai para o quadro da máquina?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.vaiQuadro }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const criarQuadro = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Criar pedido no quadro', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/pages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ parent: { database_id: $("Checar envio").first().json.quadroDb }, properties: Object.assign(JSON.parse($("Checar envio").first().json.quadroProps), { "Observações para a máquina": { rich_text: [{ type: "text", text: { content: ($("Checar envio").first().json.quadro.obs + $("Juntar card").first().json.url).slice(0, 1990) } }] } }) }) }}',
  options: {} } } });

// Monta a mudança do card: Responsável, campo da máquina, link e a linha [Central] no topo da Obs.
const fechar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Fechar envio', parameters: { jsCode: `const c = $('Checar envio').first().json, j = $('Juntar card').first().json;
let q = null; if (j.vaiQuadro) { try { q = $('Criar pedido no quadro').first().json; } catch (e) {} }
const ESC = '3ea98c0cdde0812bba06cba7e4261426';
let linha = c.linha;
const props = {};
if (c.alvo.tipo === 'pessoa') { props['Responsável'] = { relation: [{ id: c.alvo.id }] }; props['🏢 Escritório IA'] = { select: null }; }
if (c.alvo.tipo === 'flau') { props['Responsável'] = { relation: [{ id: ESC }] }; props['🏢 Escritório IA'] = { select: { name: 'À mão (Flau)' } }; }
if (c.alvo.tipo === 'maquina') {
  props['Responsável'] = { relation: [{ id: ESC }] };
  if (c.alvo.maquina === 'escritorio' || c.teste) props['🏢 Escritório IA'] = { select: { name: 'Na fila' } };
  else if (q && q.id) { props['🏢 Escritório IA'] = { select: { name: 'Foi para outra máquina' } }; linha += '\\n[Central] Pedido criado no quadro da ' + c.alvo.nome + ': ' + q.url; }
  else { props['🏢 Escritório IA'] = { select: { name: 'Na fila' } }; linha += '\\n[Central] Não consegui criar o pedido no quadro da ' + c.alvo.nome + '. A Máquina do Escritório precisa repassar.'; }
}
if (c.teste) delete props['Responsável'];
if (c.link) props['Link do arquivo'] = { url: c.link };
const antiga = (j.obsAntiga || []).map(t => t.plain_text || '').join('');
const tudo = (linha + (antiga ? '\\n' + antiga : '')).slice(0, 1990 * 8);
props['Obs'] = { rich_text: (tudo.match(/[\\s\\S]{1,1990}/g) || ['']).map(x => ({ type: 'text', text: { content: x } })) };
const avisar = !c.teste && c.alvo.tipo === 'pessoa' && !!c.alvo.discord;
const msg = '📌 **' + c.titulo + '** passou para <@' + c.alvo.discord + '> pela Central de Demandas (por ' + $('Validar acesso').first().json.nome + '). Já está na fila do painel.' + ($('Ler pedido').first().json.nota ? '\\n> ' + $('Ler pedido').first().json.nota : '') + '\\n— Érica, time de suporte, Grupo Euforia';
const ondeFoi = c.alvo.tipo === 'maquina' ? (q && q.id ? c.alvo.nome : c.alvo.maquina === 'escritorio' || c.teste ? c.alvo.nome : 'Máquina do Escritório (vai repassar)') : c.alvo.nome;
return [{ json: { id: j.id, body: JSON.stringify({ properties: props }), avisar,
  discord: JSON.stringify({ content: msg.slice(0, 1990), allowed_mentions: { users: avisar ? [c.alvo.discord] : [] } }),
  resposta: { ok: true, para: ondeFoi, card: j.id, criado: c.prevista } } }];
` } } });

const atualizar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Atualizar card', credentials: NOTION, parameters: {
  method: 'PATCH', url: '=https://api.notion.com/v1/pages/{{ $("Fechar envio").first().json.id }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $("Fechar envio").first().json.body }}', options: {} } } });

const precisaAviso = ifElse({ version: 2.2, config: { name: 'Precisa de aviso?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $("Fechar envio").first().json.avisar }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const avisar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Avisar no #dia-a-dia', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://discord.com/api/v10/channels/1556642691410956339/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $("Fechar envio").first().json.discord }}', options: {} } } });

const confirmar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($("Fechar envio").first().json.resposta) }}', options: {} } } });
const confirmarSemAviso = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar sem aviso', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($("Fechar envio").first().json.resposta) }}', options: {} } } });

const recusarEnvio = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar envio', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });
const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Painel · Central de Demandas (V1)\nAba "Central" do Ismael, do Rômulo e da diretoria (e do usuário de teste, só leitura de dados reais e envio só em cards TESTE PAINEL).\nver: cards abertos (A fazer, Fazendo, Ajustes) com nota de prioridade (prazo, dia de ir ao ar, 🔴, clima, SOS, faixa A/B/C, urgente, recuperação, fim de contrato), onde cada um está, sugestão de destino; previstas = ritmo da ficha (longos, shorts e carrosséis por semana) menos os cards que já existem na semana; filas dos quadros de Longos, Shorts e Carrosséis e da Máquina do Escritório, com quanto cabe hoje pelos horários das rotinas e quando fica pronto um pedido novo; carga de cada pessoa.\nmandar: card (ou prevista, que vira card novo) vai para a máquina (longo e shorts pedem link; cria o pedido no quadro como o "Pedir ao escritório"), para Victor, Lorena, Daniel, Ismael, Rômulo (aviso no #dia-a-dia marcando a pessoa) ou "eu faço" (diretoria = À mão (Flau); Ismael/Rômulo = fica com quem mandou). Linha [Central] no topo da Obs.\nEquipe nunca recebe valores. Contrato e clima aparecem com nome só para a diretoria.', [], { color: 4 });

export default workflow('painel-central', 'Painel | Central de Demandas (V1)')
  .add(pedir).to(ler).to(acesso).to(validar).to(caminho
    .onCase(0, entregas.to(clientes).to(qLongos).to(qShorts).to(qCarrosseis).to(montar).to(devolverVer))
    .onCase(1, cardAtual.to(ficha).to(checar).to(podeMandar
      .onTrue(ehPrevista.onTrue(criarCard.to(juntar)).onFalse(juntar))
      .onFalse(recusarEnvio)))
    .onCase(2, recusar))
  .add(juntar).to(vaiQuadro.onTrue(criarQuadro.to(fechar)).onFalse(fechar))
  .add(fechar).to(atualizar).to(precisaAviso.onTrue(avisar.to(confirmar)).onFalse(confirmarSemAviso))
  .add(nota);
