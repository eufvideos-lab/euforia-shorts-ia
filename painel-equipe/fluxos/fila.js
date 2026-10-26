import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };
const ACESSO = { __rl: true, mode: 'id', value: 'ilXDZWGAcOjoajx7', cachedResultName: 'Painel equipe · acesso' };

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Pedir fila do painel', parameters: {
  httpMethod: 'POST', path: 'euforia-painel-fila', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

const ler = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler pedido', parameters: { jsCode: `const b = ($input.first().json.body) || {};
const u = String(b.u || '').toLowerCase();
return [{ json: { u: /^[0-9a-f]{24}$/.test(u) ? u : 'x', pin: String(b.pin || '').replace(/[^0-9]/g, '').slice(0, 6) } }];
` } } });

const acesso = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Achar pessoa', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: ACESSO, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'token', condition: 'eq', keyValue: '={{ $json.u }}' }] }, limit: 1 } } });

const validar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validar acesso', parameters: { jsCode: `const p = $('Ler pedido').first().json;
const r = $input.first().json || {};
const ok = !!r.token && r.token === p.u && r.ativo === true && String(r.pin) === p.pin;
const hoje = DateTime.now().setZone('America/Recife');
const amanha = hoje.plus({ days: hoje.weekday === 5 ? 3 : 1 }).toISODate();
const naoFechado = ['Postado', 'Cancelado', 'Aprovado', 'Agendado'].map(s => ({ property: 'Status', select: { does_not_equal: s } }));
let filtro = null;
if (ok) {
  if (r.papel === 'teste') filtro = { and: [{ property: 'Entrega', title: { contains: 'TESTE PAINEL' } }, { property: 'Status', select: { does_not_equal: 'Postado' } }, { property: 'Status', select: { does_not_equal: 'Cancelado' } }] };
  else if (r.papel === 'revisor') filtro = { or: [
    { and: [{ property: 'Responsável', relation: { contains: r.ficha } }, ...naoFechado] },
    { property: 'Status', select: { equals: 'Em revisão' } },
    { property: 'Status', select: { equals: 'Aguardando cliente' } },
    { and: [{ property: 'Status', select: { equals: 'Aprovado' } }, { property: 'Postar em', date: { on_or_before: amanha } }] },
    { and: [{ property: 'Status', select: { equals: 'Agendado' } }, { property: 'Postar em', date: { on_or_before: amanha } }] }] };
  else if (r.papel === 'calls') filtro = { or: [
    { and: [{ property: 'Responsável', relation: { contains: r.ficha } }, ...naoFechado] },
    { property: 'Status', select: { equals: 'Aguardando cliente' } },
    { and: [{ property: 'Status', select: { equals: 'Aprovado' } }, { property: 'Postar em', date: { on_or_before: amanha } }] },
    { and: [{ property: 'Status', select: { equals: 'Agendado' } }, { property: 'Postar em', date: { on_or_before: amanha } }] }] };
  else filtro = { and: [{ property: 'Responsável', relation: { contains: r.ficha } }, ...naoFechado] };
}
return [{ json: { ok, nome: r.nome || '', ficha: r.ficha || '', papel: r.papel || '',
  consulta: JSON.stringify({ filter: filtro || { property: 'Entrega', title: { equals: '-' } }, sorts: [{ property: 'Postar em', direction: 'ascending' }], page_size: 100 }),
  resposta: { ok: false, motivo: 'acesso' } } }];
` } } });

const podeSeguir = ifElse({ version: 2.2, config: { name: 'Acesso válido?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const entregas = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Cards da pessoa', credentials: NOTION, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/74b3076a325749e3bac4ba6659215e48/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.consulta }}', options: {} } } });

const clientes = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Clientes ativos', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/3ddc91b406be49e98e630c298d9162d8/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { property: "Situação", select: { does_not_equal: "Encerrado" } }, sorts: [{ property: "Cliente", direction: "ascending" }], page_size: 100 }) }}', options: {} } } });

// Só sai daqui o que a produção precisa. Nada de contrato, valores, risco, clima ou financeiro.
const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar fila', parameters: { jsCode: `const Z = 'America/Recife';
const quem = $('Validar acesso').first().json;
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; if (v.date) return v.date.start; if (v.url !== undefined) return v.url || ''; if (v.formula) return String(v.formula.string || v.formula.number || ''); return ''; };
const EQUIPE = { '3ea98c0cdde08182a952f3d9a5b73575': 'Victor', '3ea98c0cdde08163bd16f0213b098cb5': 'Lorena', '3ea98c0cdde0817e87aee637a96d4fd1': 'Daniel', '3ea98c0cdde0812d9cb4c41ce70df4ae': 'Ismael', '3ea98c0cdde081299709cf901fac7275': 'Rômulo', '3ea98c0cdde0812bba06cba7e4261426': 'Escritório' };
const sem = id => String(id || '').replace(/-/g, '');
const cli = {};
for (const p of ($('Clientes ativos').first().json.results || [])) {
  const pr = p.properties || {};
  cli[sem(p.id)] = { id: sem(p.id), nome: txt(pr['Cliente']), faixa: txt(pr['Faixa']) || txt(pr['Faixa base']), atencao: !!(pr['🔴 Atenção redobrada'] || {}).checkbox,
    padroes: txt(pr['Padrões de edição']).slice(0, 1200), gosta: txt(pr['Direção criativa (gosta / não gosta)']).slice(0, 1200) };
}
const cards = [];
for (const p of ($('Cards da pessoa').first().json.results || [])) {
  const pr = p.properties || {};
  const titulo = txt(pr['Entrega']);
  const cid = sem(((pr['Cliente'] || {}).relation || [])[0] && pr['Cliente'].relation[0].id);
  const resp = ((pr['Responsável'] || {}).relation || []).map(r => sem(r.id));
  const partes = titulo.split('|').map(s => s.trim()).filter(Boolean);
  cards.push({ id: sem(p.id), cod: ((pr['Código'] || {}).unique_id || {}).number || null,
    titulo, nome: partes.length > 1 ? partes.slice(1).join(' · ') : titulo,
    cliente: cid, clienteNome: (cli[cid] || {}).nome || partes[0] || '',
    tipo: txt(pr['Tipo']), qtd: (pr['Quantidade'] || {}).number || 1, status: txt(pr['Status']),
    prazo: txt(pr['Prazo']), postar: txt(pr['Postar em']), prioridade: txt(pr['Prioridade']),
    link: txt(pr['Link do arquivo']), linkPost: txt(pr['Link da postagem']),
    obs: txt(pr['Obs']).split('\\n').slice(0, 4).join('\\n').slice(0, 600),
    resp: resp.map(r => EQUIPE[r] || 'Outro'), meu: quem.papel === 'teste' || resp.includes(quem.ficha),
    comecou: txt(pr['⏱️ Começou em']), revisao: txt(pr['⏱️ Foi para revisão em']), voltas: (pr['⏱️ Voltas de ajuste'] || {}).number || 0 });
}
const usados = new Set(cards.map(c => c.cliente));
const hoje = DateTime.now().setZone(Z);
return [{ json: { resposta: { ok: true, nome: quem.nome, papel: quem.papel, hoje: hoje.toISODate(),
  hojeTexto: hoje.setLocale('pt-BR').toFormat("cccc, dd 'de' LLLL"),
  cards, clientes: Object.values(cli).map(c => usados.has(c.id) ? c : { id: c.id, nome: c.nome, faixa: c.faixa, atencao: c.atencao }) } } }];
` } } });

const devolver = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver fila', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar acesso', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resposta) }}', options: {} } } });

const nota = sticky('## Painel da equipe · fila (V1)\nA página grupoeuforia.com.br/equipe?u=<token> pede aqui a fila da pessoa (token + PIN da tabela "Painel equipe · acesso").\nEditor: cards abertos em que ela é Responsável. Revisor (Ismael): os dele + tudo Em revisão, Aguardando cliente e o que vai ao ar até amanhã. Calls (Rômulo): os dele + Aguardando cliente e o que vai ao ar até amanhã. Teste: só cards com "TESTE PAINEL" no título.\nSó leitura. Cliente sai só com faixa, atenção, padrões de edição e gosta/não gosta.', [], { color: 4 });

export default workflow('painel-fila', 'Painel | Fila da equipe (V1)')
  .add(pedir).to(ler).to(acesso).to(validar)
  .to(podeSeguir.onTrue(entregas.to(clientes).to(montar).to(devolver)).onFalse(recusar))
  .add(nota);
