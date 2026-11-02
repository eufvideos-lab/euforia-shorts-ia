import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const ACESSO = { __rl: true, mode: 'id', value: 'ilXDZWGAcOjoajx7', cachedResultName: 'Painel equipe · acesso' };
const PAGINAR = { pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest',
  parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] },
  paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.has_more }}', limitPagesFetched: true, maxRequests: 30 } } };

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Pedir formulários', parameters: {
  httpMethod: 'POST', path: 'euforia-painel-formularios', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

const ler = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler pedido', parameters: { jsCode: `const b = ($input.first().json.body) || {};
const u = String(b.u || '').toLowerCase();
return [{ json: { u: /^[0-9a-f]{24}$/.test(u) ? u : 'x', pin: String(b.pin || '').replace(/[^0-9]/g, '').slice(0, 6) } }];
` } } });

const acesso = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Achar pessoa', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: ACESSO, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'token', condition: 'eq', keyValue: '={{ $json.u }}' }] }, limit: 1 } } });

// Só Ismael, Rômulo e diretoria (e o usuário de teste) veem os formulários.
const validar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validar acesso', parameters: { jsCode: `const p = $('Ler pedido').first().json;
const r = $input.first().json || {};
const ok = !!r.token && r.token === p.u && r.ativo === true && String(r.pin) === p.pin && ['revisor', 'calls', 'diretor', 'teste'].includes(r.papel);
return [{ json: { ok, resposta: { ok: false, motivo: 'acesso' } } }];
` } } });

const podeSeguir = ifElse({ version: 2.2, config: { name: 'Acesso válido?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const respostas = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Respostas do formulário', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/539b3b0902804a5e93fd56f26d7d8791/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ sorts: [{ timestamp: "created_time", direction: "descending" }], page_size: 100 }) }}',
  options: PAGINAR } } });

const fichas = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Fichas dos clientes', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/3ddc91b406be49e98e630c298d9162d8/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ page_size: 100 }) }}',
  options: PAGINAR } } });

// Cada resposta vira perguntas e respostas legíveis, com os links e arquivos à parte.
// Os links dos arquivos do Notion valem por 1 hora: o painel pede de novo ao abrir a aba.
// Respostas de teste (nome com "teste") ficam de fora, menos para o usuário de teste.
const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar formulários', parameters: { jsCode: `const Z = 'America/Recife';
const sem = id => String(id || '').replace(/-/g, '');
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; if (v.multi_select) return v.multi_select.map(x => x.name).join(', '); if (v.url !== undefined) return v.url || ''; if (v.phone_number !== undefined) return v.phone_number || ''; return ''; };
const papel = ($('Achar pessoa').first().json || {}).papel;
const cli = {};
for (const it of $('Fichas dos clientes').all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {};
  cli[sem(p.id)] = { nome: txt(pr['Cliente']), drive: /^https:/.test((pr['Drive'] || {}).url || '') ? pr['Drive'].url : '', faixa: txt(pr['Faixa']) || txt(pr['Faixa base']) };
}
const RX_URL = /https?:\\/\\/[^\\s<>"')]+/g;
const linkBom = s => { s = String(s || '').trim(); if (!s) return ''; if (!/^https?:\\/\\//i.test(s)) s = 'https://' + s.replace(/^\\/+/, ''); return /^https?:\\/\\/[^\\s]+\\.[^\\s]+/i.test(s) ? s : ''; };
const PERGUNTAS = [
  ['Canal', ['Você já tem canal no YouTube?', 'Já tem uma ideia de nome para o canal?', 'O que você não quer no seu canal', '3 canais ou perfis que você admira e por quê']],
  ['Marca', ['Cores que você usa ou gostaria de usar', 'Seus produtos ou serviços atuais', 'Depoimentos ou resultados de clientes', 'Já tem domínio e hospedagem para a página?']],
  ['Gravação', ['Equipamento que você tem hoje', 'Onde vai gravar', 'Já gravou vídeos antes? Como se sente gravando?']],
  ['Reuniões', ['Melhores dias e horários para reuniões', 'Dúvidas ou pedidos para a primeira reunião']],
  ['Arquivos', ['Como prefere enviar fotos e arquivos?']]
];
const ARQ = [['Fotos', 'Suas fotos (5 a 10)'], ['Logo e marca', 'Logo e materiais da marca'], ['Depoimentos', 'Arquivos de depoimentos']];
const hoje = DateTime.now().setZone(Z);
const lista = [];
for (const it of $('Respostas do formulário').all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {};
  const nome = txt(pr['Seu nome completo']) || 'Sem nome';
  if (/teste/i.test(nome) !== (papel === 'teste')) continue;
  const cid = sem((((pr['Cliente'] || {}).relation || [])[0] || {}).id);
  const c = cli[cid] || null;
  const links = [];
  const yt = linkBom(txt(pr['Link do seu YouTube atual'])); if (yt) links.push({ rot: 'YouTube atual', url: yt });
  const ig = linkBom(txt(pr['Link do seu Instagram'])); if (ig) links.push({ rot: 'Instagram', url: ig });
  const lt = txt(pr['Links das suas fotos e arquivos']);
  (lt.match(RX_URL) || []).forEach((u, i, a) => links.push({ rot: a.length > 1 ? 'Fotos e arquivos ' + (i + 1) : 'Fotos e arquivos', url: u.replace(/[.,;]+$/, '') }));
  const arquivos = [];
  for (const [grupo, k] of ARQ) for (const f of ((pr[k] || {}).files || [])) {
    const url = (f.file || {}).url || (f.external || {}).url || '';
    if (url) arquivos.push({ grupo, nome: f.name || grupo, url, img: /\\.(jpe?g|png|webp|gif|heic)(\\?|$)/i.test(f.name || url) });
  }
  const blocos = PERGUNTAS.map(([titulo, ks]) => ({ titulo, itens: ks.map(k => ({ p: k, r: txt(pr[k]) })).filter(x => x.r) })).filter(b => b.itens.length);
  // Links que o cliente escreveu no meio do texto (fora do campo de links) também viram botão.
  const ltOutro = lt.replace(RX_URL, '').trim();
  if (ltOutro) blocos.push({ titulo: 'Recado sobre os arquivos', itens: [{ p: 'Links das suas fotos e arquivos', r: lt }] });
  const quando = DateTime.fromISO(p.created_time, { zone: Z });
  lista.push({ id: sem(p.id), nome, recebida: quando.toFormat('dd/MM/yyyy HH:mm'), dia: quando.toISODate(), dias: Math.floor(hoje.diff(quando, 'days').days),
    status: txt(pr['Status interno']), whatsapp: txt(pr['WhatsApp com DDD']), canal: txt(pr['Você já tem canal no YouTube?']), envio: txt(pr['Como prefere enviar fotos e arquivos?']),
    cliente: c ? { id: cid, nome: c.nome, faixa: c.faixa, drive: c.drive } : null, links, arquivos, blocos });
}
return [{ json: { resposta: { ok: true, hoje: hoje.toISODate(), formularios: lista } } }];
` } } });

const devolver = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver formulários', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar acesso', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Painel da equipe · formulários (V1)\nAba "Formulários" do Ismael, do Rômulo e da diretoria: respostas do formulário de onboarding (banco 📝 Onboarding · Respostas), com o cliente ligado, os links (YouTube, Instagram, fotos) e os arquivos enviados.\nSó leitura. O formulário não pergunta valores nem contrato.', [], { color: 4 });

export default workflow('painel-formularios', 'Painel | Formulários dos clientes (V1)')
  .add(pedir).to(ler).to(acesso).to(validar)
  .to(podeSeguir.onTrue(respostas.to(fichas).to(montar).to(devolver)).onFalse(recusar))
  .add(nota);
