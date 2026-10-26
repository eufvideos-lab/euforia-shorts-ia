import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const PG = { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } };
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Pedir dados do portal', parameters: {
  httpMethod: 'GET', path: 'euforia-portal-dados', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

const lerLink = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler cliente do link', parameters: { jsCode: `const q = ($input.first().json.query) || {};
const id = String(q.a || '').replace(/-/g, '').toLowerCase();
return [{ json: { id: /^[0-9a-f]{32}$/.test(id) ? id : '00000000000000000000000000000000' } }];
` } } });


// Cada pessoa do cliente tem o seu link (?a=<id da linha no 🔑 Acessos do portal>). Desmarcar "Ativo" corta o acesso.
const acessoNode = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Acesso da pessoa', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://api.notion.com/v1/pages/{{ $("Ler cliente do link").first().json.id }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, options: {} } } });

const conferir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Conferir acesso', parameters: { jsCode: `const a = $input.first().json || {};
const pr = a.properties || {};
const txt = v => { if (!v) return ''; const t = v.title || v.rich_text; if (t) return t.map(x => x.plain_text).join('').trim(); if (v.select) return v.select.name; return ''; };
const valido = a.object === 'page' && !a.archived && !a.in_trash && ((a.parent || {}).database_id || '') === 'a95cdc41-6645-47f5-8c0f-99a85e31fb4e' && (pr['Ativo'] || {}).checkbox === true;
const cliente = valido ? ((((pr['Cliente'] || {}).relation || [])[0] || {}).id || '').replace(/-/g, '') : '';
const papel = txt(pr['Papel']) || 'Equipe';
return [{ json: { id: /^[0-9a-f]{32}$/.test(cliente) ? cliente : '00000000000000000000000000000000', pessoa: valido ? txt(pr['Pessoa']).replace(/\\s*\\(.*?\\)\\s*$/, '') : '', papel, podeAprovar: ['Dono', 'Sócio'].includes(papel), fone8: String((pr['WhatsApp'] || {}).phone_number || '').replace(/[^0-9]/g, '').slice(-8) } }];
` } } });

const ficha = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Ficha do cliente', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'GET', url: '=https://api.notion.com/v1/pages/{{ $("Conferir acesso").first().json.id }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, options: {} } } });

const entregas = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Entregas do cliente', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/74b3076a325749e3bac4ba6659215e48/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { and: [ { property: "Cliente", relation: { contains: $("Conferir acesso").first().json.id } }, { property: "Status", select: { does_not_equal: "Cancelado" } } ] }, sorts: [{ timestamp: "last_edited_time", direction: "descending" }], page_size: 100 }) }}', options: {} } } });

const roteiros = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Roteiros do cliente', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/076dd702dd1844bab3ca03a536d4a21e/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { and: [ { property: "Cliente", relation: { contains: $("Conferir acesso").first().json.id } }, { property: "Tipo", select: { equals: "Roteiro" } } ] }, sorts: [{ property: "Nº", direction: "ascending" }], page_size: 100 }) }}', options: {} } } });

const mensagens = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Mensagens do grupo', credentials: PG, onError: 'continueRegularOutput', alwaysOutputData: true, executeOnce: true, parameters: {
  operation: 'executeQuery',
  query: "SELECT DISTINCT ON (m.msg_id) m.msg_id, m.autor_jid, m.autor_nome, m.from_me, m.origem, m.tipo, m.texto, m.enviado_em, (SELECT count(DISTINCT x.chat_id) FROM mensagens x WHERE x.autor_jid = m.autor_jid AND x.is_group AND x.enviado_em > now() - interval '60 days') AS grupos FROM mensagens m WHERE m.chat_id = $1 AND m.texto IS NOT NULL AND m.texto <> '' AND coalesce(m.tipo, '') <> 'reactionMessage' AND m.enviado_em > now() - interval '45 days' ORDER BY m.msg_id, m.from_me DESC, m.enviado_em DESC;",
  options: { queryReplacement: '={{ [ ((($("Ficha do cliente").first().json.properties || {})["Grupo WhatsApp (ID)"] || {}).rich_text || []).map(t => t.plain_text).join("").trim() || "nenhum" ] }}' } } } });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar dados do portal', parameters: { jsCode: `const Z = 'America/Recife';
const ficha = $('Ficha do cliente').first().json;
const props = ficha.properties || {};
const txt = p => { if (!p) return ''; const a = p.title || p.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (p.select) return p.select ? p.select.name : ''; if (p.date) return p.date ? p.date.start : ''; if (p.url !== undefined) return p.url || ''; if (p.phone_number !== undefined) return p.phone_number || ''; return ''; };
const nome = txt(props['Cliente']);
const situacao = txt(props['Situação']);
if (!ficha.id || !nome || ficha.object !== 'page' || ['Encerrado'].includes(situacao)) return [{ json: { resposta: { ok: false, motivo: 'link' } } }];

const agora = DateTime.now().setZone(Z);
const hoje = agora.toISODate();
const COL = { 'A fazer': 'afazer', 'Fazendo': 'producao', 'Em revisão': 'producao', 'Aguardando cliente': 'aprovar', 'Ajustes': 'ajuste', 'Aprovado': 'aprovado', 'Agendado': 'aprovado', 'Postado': 'publicado' };
const ESCONDER = ['Roteiro', 'Copy', 'Outro', 'Limpeza de canal'];
const TIPO = { 'Vídeo longo': 'Longo', 'Shorts': 'Short', 'Podcast': 'Podcast', 'Carrossel': 'Carrossel', 'Thumbnail': 'Thumb', 'Arte': 'Arte', 'Banner': 'Banner', 'ID visual': 'Identidade visual', 'Página': 'Página', 'Funil': 'Funil', 'Blog': 'Blog' };
const fmtData = iso => iso ? DateTime.fromISO(iso, { zone: Z }).setLocale('pt-BR').toFormat("ccc, dd/MM") : '';
const limparTitulo = t => { const partes = String(t).split('|').map(s => s.trim()).filter(Boolean); return partes.length > 1 ? partes.slice(1).join(' · ') : String(t).trim(); };

const cards = [];
for (const p of ($('Entregas do cliente').first().json.results || [])) {
  const pr = p.properties || {};
  const status = txt(pr['Status']);
  const tipo = txt(pr['Tipo']);
  const origem = txt(pr['Origem']);
  const col = COL[status];
  if (!col || !TIPO[tipo] || ESCONDER.includes(tipo) || origem === 'Treino (fila reserva)') continue;
  const postarEm = txt(pr['Postar em']);
  const postadoEm = txt(pr['Postado em']);
  if (col === 'publicado' && (postadoEm || postarEm) && (postadoEm || postarEm) < agora.minus({ days: 45 }).toISODate()) continue;
  const linkArq = txt(pr['Link do arquivo']);
  const linkPost = txt(pr['Link da postagem']);
  const qtd = (pr['Quantidade'] || {}).number || 1;
  let info = '';
  if (col === 'publicado') info = 'Publicado ' + (postadoEm ? fmtData(postadoEm) : (postarEm ? fmtData(postarEm) : ''));
  else if (col === 'aprovado') info = postarEm ? 'Vai ao ar ' + fmtData(postarEm) : 'Aprovado';
  else if (postarEm) info = 'Previsto para ir ao ar ' + fmtData(postarEm);
  cards.push({ id: p.id, t: limparTitulo(txt(pr['Entrega'])), tipo: TIPO[tipo] || tipo || 'Entrega', qtd, col, info,
    link: ['aprovar', 'ajuste', 'aprovado'].includes(col) ? linkArq : (col === 'publicado' ? (linkPost || '') : ''),
    postarEm, editado: p.last_edited_time });
}

const ROT = { '📤 Enviado ao cliente': 'gravar', '👍 Aprovado pelo cliente': 'gravar', '🎬 Gravado': 'gravado' };
const rots = [];
for (const p of ($('Roteiros do cliente').first().json.results || [])) {
  const pr = p.properties || {};
  const st = ROT[txt(pr['Status'])];
  if (!st) continue;
  const n = (pr['Nº'] || {}).number;
  rots.push({ id: p.id, n: n == null ? null : n, t: txt(pr['Título']), status: st });
}

const acc = $('Conferir acesso').first().json;
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
const alinh = txt(props['Próximo alinhamento']);
const resposta = { ok: true, nome, primeiro: (acc.pessoa || nome).split(' ')[0], pessoa: acc.pessoa, papel: acc.papel, podeAprovar: acc.podeAprovar, fase: txt(props['Fase']).replace(/^[0-9]+\\.\\s*/, ''),
  hoje: agora.setLocale('pt-BR').toFormat("cccc, dd 'de' LLLL"),
  proximaCall: alinh && alinh >= hoje ? DateTime.fromISO(alinh, { zone: Z }).setLocale('pt-BR').toFormat(alinh.length > 10 ? "cccc, dd/MM 'às' HH'h'mm" : 'cccc, dd/MM') : '',
  temGrupo: !!txt(props['Grupo WhatsApp (ID)']), temDrive: !!txt(props['Drive']),
  resumo: { aprovar: aprovar.length, proxPub: proxPub ? { t: proxPub.t, quando: fmtData(proxPub.postarEm) } : null, proxGravar },
  cards: cards.map(({ editado, ...c }) => c), roteiros: rots, mensagens: msgs, feed };
return [{ json: { resposta } }];
` } } });

const devolver = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver dados', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Portal do cliente · dados (V1)\nA página do portal (grupoeuforia.com.br/portal?a=<id da pessoa no 🔑 Acessos do portal>) pede aqui tudo o que mostra: entregas do Entregas (sem Obs, sem Roteiro/Copy/Outro/Limpeza, sem fila reserva), roteiros do 🎬 enviados ao cliente e as mensagens do grupo do WhatsApp (últimos 45 dias). Só leitura. Nada de número do canal: relatórios só em percentual (V2).', [], { color: 4 });

export default workflow('portal-dados', 'Portal | Dados do cliente (V1)')
  .add(pedir).to(lerLink).to(acessoNode).to(conferir).to(ficha).to(entregas).to(roteiros).to(mensagens).to(montar).to(devolver)
  .add(nota);
