import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };
// 23/11/2026 (caso Valicir, SÁB 21/11 com 2 cards): as buscas liam só a 1ª página (100). Com mais de 100 cards futuros,
// o fluxo não via os que já existiam e criava de novo. Agora pagina tudo e também confere cliente + data + tipo (card renomeado não volta).
const PAGINAR = { pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest',
  parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] },
  paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.has_more }}', limitPagesFetched: true, maxRequests: 20 } } };

const todoDia = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'Todo dia 6h (Recife)', parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 0 9 * * *' }] } } } });
const rodarAgora = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Rodar agora', parameters: {} } });

const slots = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Buscar slots a publicar', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/2d21b7a7166240f5afaa4d697c3d1ae8/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify({ page_size: 100, filter: { property: "Status do slot", select: { equals: "✅ Publicar" } } }) }}', options: PAGINAR } } });
const clientes = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Buscar clientes', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/3ddc91b406be49e98e630c298d9162d8/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify({ page_size: 100, filter: { property: "Grade de postagem", relation: { is_not_empty: true } } }) }}', options: PAGINAR } } });
const existentes = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Buscar cards já criados', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/74b3076a325749e3bac4ba6659215e48/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify({ page_size: 100, filter: { property: "Postar em", date: { on_or_after: $now.setZone("America/Recife").toISODate() } } }) }}', options: PAGINAR } } });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar cards da semana', parameters: { jsCode: `const ENTREGAS = '74b3076a325749e3bac4ba6659215e48';
const ISMAEL = '3ea98c0c-dde0-812d-9cb4-c41ce70df4ae';
const DIAS = ['7 Dom','1 Seg','2 Ter','3 Qua','4 Qui','5 Sex','6 Sáb'];
const SIGLA = ['DOM','SEG','TER','QUA','QUI','SEX','SÁB'];
const TIPO = { 'Vídeo padrão':'Vídeo longo', 'Corte horizontal':'Vídeo longo', 'Podcast':'Podcast', 'Shorts':'Shorts', 'Reels':'Shorts', 'Carrossel':'Carrossel', 'Blog':'Blog' };
const txt = p => p ? ((p.title || p.rich_text || []).map(t => t.plain_text).join('')) : '';
const sel = p => (p && p.select) ? p.select.name : '';
const rel = p => (p && p.relation) ? p.relation.map(r => r.id) : [];
const sem = v => String(v || '').replace(/-/g, '');
const todas = n => $(n).all().flatMap(i => i.json.results || []);

const slotPages = todas('Buscar slots a publicar');
const cliPages = todas('Buscar clientes');
const exPages = todas('Buscar cards já criados');

const cli = {};
for (const c of cliPages) cli[c.id] = { nome: txt(c.properties['Cliente']), editor: rel(c.properties['Editor']) };
const jaTem = new Set(exPages.map(p => txt(p.properties['Entrega']).trim().toUpperCase()));
// Quantos cards já existem por cliente + data + tipo (qualquer status, inclusive Cancelado: card cancelado não volta).
const chave = (c, d, t) => sem(c) + '|' + d + '|' + t;
const existe = {};
for (const p of exPages) { const P = p.properties || {}; const k = chave(rel(P['Cliente'])[0], ((P['Postar em'] || {}).date || {}).start ? P['Postar em'].date.start.slice(0, 10) : '', sel(P['Tipo'])); existe[k] = (existe[k] || 0) + 1; }
const usado = {};

const agora = new Date(Date.now() - 3 * 3600 * 1000);
const hoje = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()));
const iso = d => d.toISOString().slice(0, 10);
const ddmm = d => iso(d).slice(8, 10) + '/' + iso(d).slice(5, 7);
const addDias = (d, n) => new Date(d.getTime() + n * 86400000);
const INICIO = new Date(Date.UTC(2026, 9, 12));
const FOLGA = 1;

const cards = [];
for (let n = 1; n <= 8; n++) {
  const dia = addDias(hoje, n);
  if (dia < INICIO) continue;
  const wd = dia.getUTCDay();
  for (const s of slotPages) {
    const P = s.properties;
    if (sel(P['Dia']) !== DIAS[wd]) continue;
    const formato = sel(P['Formato']) || 'Outro';
    const tipo = TIPO[formato] || 'Outro';
    const clienteId = rel(P['Cliente'])[0];
    const c = cli[clienteId] || { nome: txt(P['Slot']).split('|')[0].trim(), editor: [] };
    const nomeSlot = txt(P['Slot']).split('|')[0].trim() || c.nome;
    const titulo = (nomeSlot + ' | ' + formato + ' | ' + SIGLA[wd] + ' ' + ddmm(dia)).toUpperCase();
    const k = chave(clienteId, iso(dia), tipo);
    usado[k] = (usado[k] || 0) + 1;
    if (jaTem.has(titulo) || usado[k] <= (existe[k] || 0)) continue;
    jaTem.add(titulo);
    let prazo = addDias(dia, -FOLGA);
    if (prazo.getUTCDay() === 6) prazo = addDias(prazo, -1);
    if (prazo.getUTCDay() === 0) prazo = addDias(prazo, -2);
    if (prazo < hoje) prazo = hoje;
    let resp = c.editor;
    if (tipo === 'Carrossel') resp = [ISMAEL];
    const horario = txt(P['Horário']);
    const plataforma = sel(P['Plataforma']);
    let obs = 'Gerado da Grade de Postagem. Vai ao ar ' + SIGLA[wd] + ' ' + ddmm(dia) + (horario ? ' às ' + horario : '') + (plataforma ? ' no ' + plataforma : '') + '.';
    if (!resp.length) obs += ' Sem editor definido no cadastro do cliente: Ismael distribui.';
    const props = {
      'Entrega': { title: [{ text: { content: titulo } }] },
      'Tipo': { select: { name: tipo } },
      'Status': { select: { name: 'A fazer' } },
      'Origem': { select: { name: 'Pacote semanal' } },
      'Prioridade': { select: { name: 'Normal' } },
      'Postar em': { date: { start: iso(dia) } },
      'Prazo': { date: { start: iso(prazo) } },
      'Obs': { rich_text: [{ text: { content: obs } }] }
    };
    if (clienteId) props['Cliente'] = { relation: [{ id: clienteId }] };
    if (resp.length) props['Responsável'] = { relation: resp.map(id => ({ id })) };
    const qtd = P['Quantidade'] && P['Quantidade'].number;
    if (qtd) props['Quantidade'] = { number: qtd };
    cards.push({ json: { titulo, semEditor: !resp.length, body: JSON.stringify({ parent: { database_id: ENTREGAS }, properties: props }) } });
  }
}
return cards;
` } } });

const criar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Criar cards em Entregas', credentials: NOTION, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/pages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.body }}',
  options: { batching: { batch: { batchSize: 1, batchInterval: 400 } }, response: { response: { fullResponse: true, neverError: true } } } } } });

const resumo = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Resumo', parameters: { jsCode: `const entrada = $('Montar cards da semana').all();
const res = $input.all();
const linhas = res.map((r, i) => ({ card: entrada[i] ? entrada[i].json.titulo : '', status: r.json.statusCode, semEditor: entrada[i] ? entrada[i].json.semEditor : false, erro: r.json.statusCode >= 300 ? JSON.stringify(r.json.body).slice(0, 300) : '' }));
const ok = linhas.filter(l => l.status < 300);
return [{ json: { criados: ok.length, falhas: linhas.filter(l => l.status >= 300), semEditor: ok.filter(l => l.semEditor).map(l => l.card), cards: ok.map(l => l.card) } }];
` } } });

const nota = sticky('## Grade · cards de edição (próximos 8 dias)\nTodo dia 6h cria em Entregas um card por horário "✅ Publicar" da Grade, com editor do cliente e prazo 1 dia antes.\n23/11/2026: buscas paginadas (antes só 100) e anti-duplicado por cliente + data + tipo além do título.', [], { color: 4 });

export default workflow('grade-cards-edicao', 'Grade | Gerar cards de edição (próximos 8 dias)')
  .add(todoDia).to(slots).to(clientes).to(existentes).to(montar).to(criar).to(resumo)
  .add(rodarAgora).to(slots)
  .add(nota);
