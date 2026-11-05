import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

// Portal | Dados do cliente (V1) · com cache no Postgres (05/11/2026)
// Cada pedido da página olha primeiro o portal_cache (chave = id do acesso da pessoa).
// Se o cache tem menos de 5 minutos, devolve sem tocar no Notion. Senão lê o Notion, guarda e devolve.
// A página manda fresco=1 depois de aprovar, pedir ajuste ou pedir tema, para ver na hora.
// Mensagens do grupo continuam ao vivo (Postgres). Desmarcar "Ativo" corta o acesso em até 5 minutos.

const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const PG = { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } };
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };
const PAGINAR = { pagination: { paginationMode: 'updateAParameterInEachRequest', parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] }, paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.has_more }}', limitPagesFetched: true, maxRequests: 10 } };
const notionGet = (name, url) => node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name, credentials: NOTION, alwaysOutputData: true, onError: 'continueRegularOutput', parameters: {
  method: 'GET', url, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendHeaders: true, headerParameters: NOTION_HDR, options: {} } } });
const notionQuery = (name, db, body, paginar) => node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name, credentials: NOTION, executeOnce: true, alwaysOutputData: true, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/' + db + '/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendHeaders: true, headerParameters: NOTION_HDR,
  sendBody: true, specifyBody: 'json', jsonBody: body, options: paginar ? { pagination: PAGINAR } : {} } } });

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Pedir dados do portal', parameters: {
  httpMethod: 'GET', path: 'euforia-portal-dados', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } }, webhookId: 'e66afaaf-a824-4209-b1e2-9d513b8f303c' } });

const lerLink = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler cliente do link', parameters: { jsCode: `const q = ($input.first().json.query) || {};
const id = String(q.a || '').replace(/-/g, '').toLowerCase();
return [{ json: { id: /^[0-9a-f]{32}$/.test(id) ? id : '00000000000000000000000000000000', fresco: String(q.fresco || '') === '1' ? 'sim' : 'nao' } }];
` } } });

const lerCache = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Ler cache', credentials: PG, alwaysOutputData: true, onError: 'continueRegularOutput', parameters: {
  operation: 'executeQuery',
  query: "SELECT dados FROM portal_cache WHERE chave = $1 AND $2 <> 'sim' AND em > now() - interval '5 minutes';",
  options: { queryReplacement: '={{ [ $("Ler cliente do link").first().json.id, $("Ler cliente do link").first().json.fresco ] }}' } } } });

const temCache = ifElse({ version: 2.2, config: { name: 'Tem cache?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ !!$json.dados }}', operator: { type: 'boolean', operation: 'true', singleValue: true }, rightValue: '' }], combinator: 'and' } } } });

const acessoPessoa = notionGet('Acesso da pessoa', '=https://api.notion.com/v1/pages/{{ $("Ler cliente do link").first().json.id }}');

const conferir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Conferir acesso', parameters: { jsCode: `const a = $input.first().json || {};
const pr = a.properties || {};
const txt = v => { if (!v) return ''; const t = v.title || v.rich_text; if (t) return t.map(x => x.plain_text).join('').trim(); if (v.select) return v.select.name; return ''; };
const valido = a.object === 'page' && !a.archived && !a.in_trash && ((a.parent || {}).database_id || '') === 'a95cdc41-6645-47f5-8c0f-99a85e31fb4e' && (pr['Ativo'] || {}).checkbox === true;
const cliente = valido ? ((((pr['Cliente'] || {}).relation || [])[0] || {}).id || '').replace(/-/g, '') : '';
const papel = txt(pr['Papel']) || 'Equipe';
return [{ json: { id: /^[0-9a-f]{32}$/.test(cliente) ? cliente : '00000000000000000000000000000000', pessoa: valido ? txt(pr['Pessoa']).replace(/\\s*\\(.*?\\)\\s*$/, '') : '', papel, podeAprovar: ['Dono', 'Sócio'].includes(papel), fone8: String((pr['WhatsApp'] || {}).phone_number || '').replace(/[^0-9]/g, '').slice(-8) } }];
` } } });

const ficha = notionGet('Ficha do cliente', '=https://api.notion.com/v1/pages/{{ $("Conferir acesso").first().json.id }}');
const CLI = '$("Conferir acesso").first().json.id';
const entregas = notionQuery('Entregas do cliente', '74b3076a325749e3bac4ba6659215e48',
  '={{ JSON.stringify({ filter: { and: [ { property: "Cliente", relation: { contains: ' + CLI + ' } }, { property: "Status", select: { does_not_equal: "Cancelado" } } ] }, sorts: [{ timestamp: "last_edited_time", direction: "descending" }], page_size: 100 }) }}', true);
const roteiros = notionQuery('Roteiros do cliente', '076dd702dd1844bab3ca03a536d4a21e',
  '={{ JSON.stringify({ filter: { and: [ { property: "Cliente", relation: { contains: ' + CLI + ' } }, { property: "Tipo", select: { equals: "Roteiro" } } ] }, sorts: [{ property: "Nº", direction: "ascending" }], page_size: 100 }) }}', true);
const temas = notionQuery('Temas quentes do cliente', 'c963e3f9e0064f1ca7be64cdc55e868d',
  '={{ JSON.stringify({ filter: { and: [ { property: "Cliente", relation: { contains: ' + CLI + ' } }, { property: "Status", select: { does_not_equal: "Expirado" } }, { or: [ { property: "Semana", date: { on_or_after: $now.setZone("America/Recife").minus({ days: 21 }).toISODate() } }, { property: "Pedido em", date: { on_or_after: $now.setZone("America/Recife").minus({ days: 60 }).toISODate() } } ] } ] }, sorts: [{ property: "Semana", direction: "descending" }], page_size: 50 }) }}', false);
const promessas = notionQuery('Promessas do cliente', '824c669471e5424d8c846936a63c16d4',
  '={{ JSON.stringify({ filter: { and: [ { property: "Cliente", relation: { contains: ' + CLI + ' } }, { property: "Status", select: { does_not_equal: "Cancelado" } }, { property: "Quando", date: { on_or_after: $now.setZone("America/Recife").minus({ days: 60 }).toISODate() } } ] }, sorts: [{ property: "Quando", direction: "ascending" }], page_size: 100 }) }}', false);

// Junta só o que a montagem usa (id, última edição e propriedades), para o cache ficar leve.
const juntar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Juntar fontes', parameters: { jsCode: `const enxuto = p => ({ id: p.id, last_edited_time: p.last_edited_time, properties: p.properties || {} });
const lista = nome => { const out = []; for (const it of $(nome).all()) for (const p of (it.json.results || [])) out.push(enxuto(p)); return out; };
const f = $('Ficha do cliente').first().json || {};
const acesso = $('Conferir acesso').first().json;
const dados = {
  acesso,
  ficha: f.object === 'page' ? { id: f.id, object: f.object, properties: f.properties || {} } : {},
  entregas: lista('Entregas do cliente'), roteiros: lista('Roteiros do cliente'),
  temas: lista('Temas quentes do cliente'), promessas: lista('Promessas do cliente') };
// Só guarda quando o acesso é válido e a leitura do Notion veio inteira (erro do Notion não fica preso no cache).
const leuTudo = ['Entregas do cliente', 'Roteiros do cliente', 'Temas quentes do cliente', 'Promessas do cliente'].every(n => $(n).all().every(i => Array.isArray(i.json.results)));
const cachear = acesso.id !== '00000000000000000000000000000000' && f.object === 'page' && leuTudo;
return [{ json: { chave: $('Ler cliente do link').first().json.id, cachear: cachear ? 'sim' : 'nao', dados: JSON.stringify(dados) } }];
` } } });

const salvar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Salvar cache', credentials: PG, parameters: {
  operation: 'executeQuery',
  query: "WITH g AS (INSERT INTO portal_cache (chave, dados, em) SELECT $1, $3::jsonb, now() WHERE $2 = 'sim' ON CONFLICT (chave) DO UPDATE SET dados = EXCLUDED.dados, em = EXCLUDED.em RETURNING 1) SELECT $3::jsonb AS dados, (SELECT count(*) FROM g) AS guardou;",
  options: { queryReplacement: '={{ [ $json.chave, $json.cachear, $json.dados ] }}' } } } });

const fontes = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Fontes do portal', parameters: { jsCode: `let d = $input.first().json.dados;
if (typeof d === 'string') d = JSON.parse(d);
return [{ json: d || {} }];
` } } });

const mensagens = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Mensagens do grupo', credentials: PG, executeOnce: true, alwaysOutputData: true, onError: 'continueRegularOutput', parameters: {
  operation: 'executeQuery',
  query: "SELECT DISTINCT ON (m.msg_id) m.msg_id, m.autor_jid, m.autor_nome, m.from_me, m.origem, m.tipo, m.texto, m.enviado_em, (SELECT count(DISTINCT x.chat_id) FROM mensagens x WHERE x.autor_jid = m.autor_jid AND x.is_group AND x.enviado_em > now() - interval '60 days') AS grupos FROM mensagens m WHERE m.chat_id = $1 AND m.texto IS NOT NULL AND m.texto <> '' AND coalesce(m.tipo, '') <> 'reactionMessage' AND m.enviado_em > now() - interval '45 days' ORDER BY m.msg_id, m.from_me DESC, m.enviado_em DESC;",
  options: { queryReplacement: '={{ [ (((($("Fontes do portal").first().json.ficha || {}).properties || {})["Grupo WhatsApp (ID)"] || {}).rich_text || []).map(t => t.plain_text).join("").trim() || "nenhum" ] }}' } } } });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar dados do portal', parameters: { jsCode: `const Z = 'America/Recife';
const F = $('Fontes do portal').first().json;
const fonte = k => [{ json: { results: F[k] || [] } }];
const ficha = F.ficha || {};
const props = ficha.properties || {};
const txt = p => { if (!p) return ''; const a = p.title || p.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (p.select) return p.select ? p.select.name : ''; if (p.date) return p.date ? p.date.start : ''; if (p.url !== undefined) return p.url || ''; if (p.phone_number !== undefined) return p.phone_number || ''; return ''; };
const nome = txt(props['Cliente']);
const situacao = txt(props['Situação']);
if (!ficha.id || !nome || ficha.object !== 'page' || ['Encerrado'].includes(situacao)) return [{ json: { resposta: { ok: false, motivo: 'link' } } }];

const agora = DateTime.now().setZone(Z);
const hoje = agora.toISODate();
const COL = { 'A fazer': 'afazer', 'Fazendo': 'producao', 'Em revisão': 'producao', 'Aguardando cliente': 'aprovar', 'Ajustes': 'ajuste', 'Aprovado': 'aprovado', 'Agendado': 'aprovado', 'Feito': 'aprovado', 'Postado': 'publicado' };
const ESCONDER = ['Roteiro', 'Copy', 'Outro', 'Limpeza de canal'];
const TIPO = { 'Vídeo longo': 'Longo', 'Shorts': 'Short', 'Podcast': 'Podcast', 'Carrossel': 'Carrossel', 'Thumbnail': 'Thumb', 'Arte': 'Arte', 'Banner': 'Banner', 'ID visual': 'Identidade visual', 'Página': 'Página', 'Funil': 'Funil', 'Blog': 'Blog' };
const fmtData = iso => iso ? DateTime.fromISO(iso, { zone: Z }).setLocale('pt-BR').toFormat("ccc, dd/MM") : '';
const limparTitulo = t => { const partes = String(t).split('|').map(s => s.trim()).filter(Boolean); return partes.length > 1 ? partes.slice(1).join(' · ') : String(t).trim(); };

const cards = [];
for (const it of fonte('entregas')) for (const p of (it.json.results || [])) {
  const pr = p.properties || {};
  const status = txt(pr['Status']);
  const tipo = txt(pr['Tipo']);
  const origem = txt(pr['Origem']);
  let col = COL[status];
  if (!col || !TIPO[tipo] || ESCONDER.includes(tipo) || origem === 'Treino (fila reserva)') continue;
  const postarEm = txt(pr['Postar em']);
  const postadoEm = txt(pr['Postado em']);
  if (col === 'publicado' && (postadoEm || postarEm) && (postadoEm || postarEm) < agora.minus({ days: 45 }).toISODate()) continue;
  // Feito (05/11/2026): entregue e não vai ao ar (roteiro, página...). Aparece como entregue por 45 dias.
  const concluidoEm = txt(pr['Concluído em']);
  if (status === 'Feito' && concluidoEm && concluidoEm < agora.minus({ days: 45 }).toISODate()) continue;
  const linkArq = txt(pr['Link do arquivo']);
  // Um portal só (05/11/2026): só vai para aprovação peça com arquivo (link https) e conferida pela equipe.
  // Sem isso o cliente vê "Em revisão final". O campo Conferido só passa a valer quando existir no Entregas.
  const conferido = !pr['✔️ Conferido pela equipe'] || pr['✔️ Conferido pela equipe'].checkbox === true;
  if (col === 'aprovar' && (!/^https:[/][/]/.test(linkArq) || !conferido)) col = 'revisao';
  const linkPost = txt(pr['Link da postagem']);
  const qtd = (pr['Quantidade'] || {}).number || 1;
  let info = '';
  if (col === 'publicado') info = 'Publicado ' + (postadoEm ? fmtData(postadoEm) : (postarEm ? fmtData(postarEm) : ''));
  else if (status === 'Feito') info = 'Entregue' + (concluidoEm ? ' ' + fmtData(concluidoEm) : '');
  else if (col === 'aprovado') info = postarEm ? 'Vai ao ar ' + fmtData(postarEm) : 'Aprovado';
  else if (col === 'revisao') { col = 'producao'; info = 'Em revisão final'; }
  // Nunca mostrar atraso ao cliente: data que já passou some do card.
  else if (postarEm && postarEm >= hoje) info = 'Previsto para ir ao ar ' + fmtData(postarEm);
  cards.push({ id: p.id, t: limparTitulo(txt(pr['Entrega'])), tipo: TIPO[tipo] || tipo || 'Entrega', qtd, col, info,
    link: ['aprovar', 'ajuste', 'aprovado'].includes(col) ? linkArq : (col === 'publicado' ? (linkPost || '') : ''),
    postarEm, editado: p.last_edited_time });
}

const ROT = { '📤 Enviado ao cliente': 'gravar', '👍 Aprovado pelo cliente': 'gravar', '🎬 Gravado': 'gravado' };
const rots = [];
for (const it of fonte('roteiros')) for (const p of (it.json.results || [])) {
  const pr = p.properties || {};
  const st = ROT[txt(pr['Status'])];
  if (!st) continue;
  const n = (pr['Nº'] || {}).number;
  rots.push({ id: p.id, n: n == null ? null : n, t: txt(pr['Título']), status: st });
}

// Temas quentes (aba do portal). Pedido: 1 por mês. Pronto: o roteiro ligado já foi enviado ao cliente.
const QUENTE = { 'Em alta': 1, 'Muito em alta': 2, 'Bombando': 3 };
const rotSt = {}; for (const r of rots) rotSt[String(r.id).replace(/-/g, '')] = r.status;
const inicioMes = agora.startOf('month').toISODate();
const brutos = [];
for (const it of fonte('temas')) for (const p of (it.json.results || [])) brutos.push(p);
const semanas = brutos.filter(p => txt((p.properties || {})['Status']) === 'Sugerido').map(p => txt((p.properties || {})['Semana'])).filter(Boolean).sort();
const ultimaSemana = semanas[semanas.length - 1] || '';
let pediuMes = false;
const temasOut = [];
for (const p of brutos) {
  const pr = p.properties || {};
  const st = txt(pr['Status']);
  const semana = txt(pr['Semana']);
  const pedidoEm = txt(pr['Pedido em']);
  if (pedidoEm && pedidoEm >= inicioMes) pediuMes = true;
  const ligados = ((pr['Roteiro'] || {}).relation || []).map(r => r.id.replace(/-/g, ''));
  const pronto = st === 'Roteiro pronto' || ligados.some(id => rotSt[id]);
  const status = pronto ? 'pronto' : (st === 'Pedido pelo cliente' ? 'pedido' : (st === 'Sugerido' && semana === ultimaSemana ? 'livre' : ''));
  if (!status) continue;
  temasOut.push({ id: p.id.replace(/-/g, ''), t: txt(pr['Tema']).replace(/^TESTE\\s*·\\s*/, ''), porque: txt(pr['Por que está quente']), gancho: txt(pr['Como entra no conteúdo']),
    titulo: txt(pr['Título sugerido']), origem: txt(pr['Origem']) || 'Em alta', quente: QUENTE[txt(pr['Calor'])] || 1, status,
    novo: status === 'livre' && semana >= agora.minus({ days: 7 }).toISODate() });
}
temasOut.sort((a, b) => ({ livre: 0, pedido: 1, pronto: 2 }[a.status] - { livre: 0, pedido: 1, pronto: 2 }[b.status]) || b.quente - a.quente);

const acc = F.acesso || {};
const fone = acc.fone8 || (acc.papel === 'Dono' ? String(txt(props['WhatsApp do cliente'])).replace(/[^0-9]/g, '').slice(-8) : '');
const PREFIXO = '💬 Pelo portal';
const MIDIA = { imageMessage: '📷 Imagem', audioMessage: '🎤 Áudio', videoMessage: '🎬 Vídeo', documentMessage: '📄 Documento', documentWithCaptionMessage: '📄 Documento', stickerMessage: '🙂 Figurinha' };
const vistos = new Set();
const msgs = $('Mensagens do grupo').all().map(i => i.json).filter(m => m.msg_id && m.texto)
  .sort((a, b) => new Date(a.enviado_em) - new Date(b.enviado_em))
  .filter(m => { const k = String(m.texto).slice(0, 80) + '|' + Math.round(new Date(m.enviado_em) / 60000); if (vistos.has(k)) return false; vistos.add(k); return true; })
  .slice(-60)
  .map(m => {
    let t = MIDIA[m.tipo] || String(m.texto);
    const equipe = m.from_me || Number(m.grupos) >= 3 || /euforia|suporte/i.test(m.autor_nome || '');
    let eu = !equipe && !!fone && String(m.autor_jid || '').replace(/@.*/, '').replace(/[^0-9]/g, '').slice(-8) === fone;
    let autor = m.autor_nome || 'Cliente';
    if (String(m.texto).startsWith(PREFIXO)) { autor = String(m.texto).slice(PREFIXO.length, String(m.texto).indexOf(':')).replace(/^[,\\s]+/, '').trim(); eu = autor === acc.pessoa; t = String(m.texto).slice(String(m.texto).indexOf(':') + 1).trim(); }
    const doCliente = !equipe || String(m.texto).startsWith(PREFIXO);
    const quem = eu ? 'você' : (doCliente ? autor : ((m.from_me && m.origem === 'suporte') || /suporte/i.test(m.autor_nome || '') ? 'Érica · suporte' : (m.from_me ? 'Equipe Euforia' : (m.autor_nome || 'Equipe Euforia'))));
    return { eu, cli: doCliente, t: t.slice(0, 2000), quem, em: DateTime.fromJSDate(new Date(m.enviado_em)).setZone(Z).setLocale('pt-BR').toFormat("dd/MM HH:mm") };
  });

const aprovar = cards.filter(c => c.col === 'aprovar');
const proxPub = cards.filter(c => c.col === 'aprovado' && c.postarEm && c.postarEm >= hoje).sort((a, b) => a.postarEm.localeCompare(b.postarEm))[0] || null;
const proxGravar = rots.find(r => r.status === 'gravar') || null;
const feed = cards.slice().sort((a, b) => String(b.editado).localeCompare(String(a.editado))).slice(0, 5).map(c => ({
  em: DateTime.fromISO(c.editado).setZone(Z).setLocale('pt-BR').toFormat('dd/MM HH:mm'),
  t: c.t, col: c.col }));
// Cronograma (Fase 4): o cliente vê o que foi combinado e quando. Nada de nome da equipe nem observação interna.
const cronograma = [];
for (const it of fonte('promessas')) for (const p of (it.json.results || [])) {
  const pr = p.properties || {};
  const st = txt(pr['Status']), quando = txt(pr['Quando']), marco = txt(pr['Marco']);
  if (!marco || !quando || st === 'Cancelado') continue;
  const dia = quando.slice(0, 10);
  const depende = !!(pr['Depende do cliente'] || {}).checkbox;
  const estado = st === 'Cumprido' ? 'feito' : depende ? 'suavez' : dia >= hoje ? 'previsto' : 'finalizando';
  // Decisão da diretoria (04/11): promessa vencida sem estar feita some do portal até a equipe pôr uma data nova.
  if (estado === 'finalizando' || (estado === 'suavez' && dia < hoje)) continue;
  cronograma.push({ t: marco.replace(/^TESTE\\s*·\\s*/, ''), dia, quando: DateTime.fromISO(quando, { zone: Z }).setLocale('pt-BR').toFormat(quando.length > 10 ? "ccc, dd/MM 'às' HH'h'mm" : 'ccc, dd/MM'),
    mes: DateTime.fromISO(dia, { zone: Z }).setLocale('pt-BR').toFormat('LLLL'), estado, hoje: dia === hoje });
}
cronograma.sort((a, b) => a.dia.localeCompare(b.dia));
const feitosCr = cronograma.filter(c => c.estado === 'feito').length;
const proxMarco = cronograma.find(c => c.estado !== 'feito' && c.dia >= hoje) || null;
const alinh = txt(props['Próximo alinhamento']);
const resposta = { ok: true, nome, primeiro: (acc.pessoa || nome).split(' ')[0], pessoa: acc.pessoa, papel: acc.papel, podeAprovar: acc.podeAprovar, fase: txt(props['Fase']).replace(/^[0-9]+\\.\\s*/, ''),
  hoje: agora.setLocale('pt-BR').toFormat("cccc, dd 'de' LLLL"),
  proximaCall: alinh && alinh >= hoje ? DateTime.fromISO(alinh, { zone: Z }).setLocale('pt-BR').toFormat(alinh.length > 10 ? "cccc, dd/MM 'às' HH'h'mm" : 'cccc, dd/MM') : '',
  temGrupo: !!txt(props['Grupo WhatsApp (ID)']), temDrive: !!txt(props['Drive']),
  resumo: { aprovar: aprovar.length, proxPub: proxPub ? { t: proxPub.t, quando: fmtData(proxPub.postarEm) } : null, proxGravar },
  cards: cards.map(({ editado, ...c }) => c), roteiros: rots, mensagens: msgs, feed,
  temas: temasOut, temasSemana: ultimaSemana ? DateTime.fromISO(ultimaSemana, { zone: Z }).setLocale('pt-BR').toFormat('cccc, dd/MM') : '', temaDisponivel: !pediuMes,
  cronograma: cronograma.map(({ dia, ...c }) => c), cronoPct: cronograma.length ? Math.round(feitosCr / cronograma.length * 100) : null,
  proxMarco: proxMarco ? { t: proxMarco.t, quando: proxMarco.quando } : null };
return [{ json: { resposta } }];
` } } });

const devolver = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver dados', parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Portal do cliente · dados (V1)\nA página do portal pede aqui tudo o que mostra: entregas, roteiros enviados, temas quentes, cronograma e mensagens do grupo (45 dias). Só leitura.\n\n**Cache (05/11/2026):** guarda o que veio do Notion por 5 min no Postgres (portal_cache), por pessoa. Assim o Notion não é chamado a cada minuto por cliente. Mensagens do grupo sempre ao vivo. fresco=1 pula o cache (depois de aprovar/ajuste/tema).', [lerCache, temCache], { color: 4 });

export default workflow('sw2PvkT0D630c5XS', 'Portal | Dados do cliente (V1)')
  .add(pedir).to(lerLink).to(lerCache).to(temCache.onTrue(fontes).onFalse(acessoPessoa))
  .add(acessoPessoa).to(conferir).to(ficha).to(entregas).to(roteiros).to(temas).to(promessas).to(juntar).to(salvar).to(fontes)
  .add(fontes).to(mensagens).to(montar).to(devolver)
  .add(nota);
