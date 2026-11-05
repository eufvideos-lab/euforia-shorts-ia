import { workflow, node, trigger, switchCase, sticky } from '@n8n/workflow-sdk';

// Diretoria | Painel Central (equipe): aba "Equipe" da Minha mesa. Pontos positivos e negativos de cada pessoa, para decidir.
// Só o login do Henrique. Nada daqui aparece para a equipe.
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const PESSOAS = { __rl: true, mode: 'id', value: 'bcimSpwlGuGZ2940', cachedResultName: 'Painel · pessoas' };
const ANALISE = { __rl: true, mode: 'id', value: 'oVHcbAOfIG8CyFTL', cachedResultName: 'Diretoria · Análise da equipe' };

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Pedido da aba Equipe', parameters: {
  httpMethod: 'POST', path: 'diretoria-central-equipe', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

const pessoas = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Pessoas', executeOnce: true, alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: PESSOAS, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'usuario', condition: 'eq', keyValue: 'henrique' }] }, limit: 1 } } });

const conferir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Conferir pedido', parameters: { jsCode: `const b = $('Pedido da aba Equipe').first().json.body || {};
const p = $('Pessoas').first().json || {};
const agora = DateTime.now().setZone('America/Recife');
const teste = ['manual', 'test'].includes($execution.mode);
const ok = teste || (p.usuario === 'henrique' && p.ativo !== false && p.papel === 'diretor' && String(b.usuario || '').toLowerCase() === 'henrique'
  && !!p.sessao && String(b.token || '') === p.sessao && !!p.sessao_expira && DateTime.fromISO(p.sessao_expira) > agora);
const nega = m => [{ json: { rota: 'negado', resp: { ok: false, erro: m } } }];
if (!ok) return nega('sessao');
const EQUIPE = ['Rômulo', 'Ismael', 'Daniel', 'Victor', 'Lorena', 'Diogo', 'Jhonatas', 'Jailton'];
const TIPOS = ['positivo', 'negativo', 'observacao'];
const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n || 300);
const c = b.campos || {};
const acao = String(b.acao || 'ler');
if (acao === 'ler') return [{ json: { rota: 'ler' } }];
if (acao === 'criar') {
  if (!EQUIPE.includes(c.pessoa)) return nega('Escolha a pessoa.');
  if (!TIPOS.includes(c.tipo)) return nega('Escolha se é ponto positivo, negativo ou observação.');
  if (s(c.titulo).length < 3) return nega('Escreva o que aconteceu.');
  const dia = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(c.dia || '')) ? c.dia : agora.toISODate();
  const peso = [1, 2, 3].includes(Number(c.peso)) ? Number(c.peso) : 1;
  return [{ json: { rota: 'criar', linha: { dia, pessoa: c.pessoa, tipo: c.tipo, peso, cliente: s(c.cliente, 120), titulo: s(c.titulo, 200),
    detalhe: s(c.detalhe, 2000), decisao: s(c.decisao, 500), fonte: s(c.fonte, 300) || 'Painel Central ' + agora.toFormat('dd/MM HH:mm') } } }];
}
const id = Number(b.id);
if (!(id > 0)) return nega('Registro inválido.');
if (acao === 'decidir') return [{ json: { rota: 'decidir', id, decisao: s(c.decisao, 500) } }];
if (acao === 'apagar') return [{ json: { rota: 'apagar', id } }];
return nega('Pedido inválido.');
` } } });

const rota = switchCase({ version: 3.2, config: { name: 'Rota', parameters: { rules: { values: [
  { outputKey: 'ler', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
    conditions: [{ leftValue: '={{ $json.rota }}', rightValue: 'ler', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
  { outputKey: 'criar', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
    conditions: [{ leftValue: '={{ $json.rota }}', rightValue: 'criar', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
  { outputKey: 'decidir', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
    conditions: [{ leftValue: '={{ $json.rota }}', rightValue: 'decidir', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
  { outputKey: 'apagar', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
    conditions: [{ leftValue: '={{ $json.rota }}', rightValue: 'apagar', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
  { outputKey: 'negado', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
    conditions: [{ leftValue: '={{ $json.rota }}', rightValue: 'negado', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } }] }, options: {} } } });

const ler = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Ler análise', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: ANALISE, returnAll: true } } });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar análise', parameters: { jsCode: `const hoje = DateTime.now().setZone('America/Recife').toISODate();
const itens = $input.all().map(i => i.json).filter(r => r && r.id && r.pessoa).map(r => ({ id: r.id, dia: String(r.dia || '').slice(0, 10),
  pessoa: r.pessoa, tipo: r.tipo || 'observacao', peso: Number(r.peso) || 1, cliente: r.cliente || '', titulo: r.titulo || '', detalhe: r.detalhe || '',
  decisao: r.decisao || '', fonte: r.fonte || '' })).sort((a, b) => b.dia.localeCompare(a.dia) || b.id - a.id);
return [{ json: { resp: { ok: true, hoje, itens } } }];
` } } });

const devolver = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver análise', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resp) }}', options: {} } } });

const criar = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Gravar registro', parameters: {
  resource: 'row', operation: 'insert', dataTableId: ANALISE, columns: { mappingMode: 'defineBelow', value: {
    dia: '={{ $json.linha.dia }}', pessoa: '={{ $json.linha.pessoa }}', tipo: '={{ $json.linha.tipo }}', peso: '={{ $json.linha.peso }}',
    cliente: '={{ $json.linha.cliente }}', titulo: '={{ $json.linha.titulo }}', detalhe: '={{ $json.linha.detalhe }}',
    decisao: '={{ $json.linha.decisao }}', fonte: '={{ $json.linha.fonte }}' }, matchingColumns: [], schema: [] }, options: {} } } });

const decidir = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Gravar decisão', parameters: {
  resource: 'row', operation: 'update', dataTableId: ANALISE, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: '={{ $json.id }}' }] },
  columns: { mappingMode: 'defineBelow', value: { decisao: '={{ $json.decisao }}' }, matchingColumns: [], schema: [] }, options: {} } } });

const apagar = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Apagar registro', parameters: {
  resource: 'row', operation: 'deleteRows', dataTableId: ANALISE, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: '={{ $json.id }}' }] }, options: {} } } });

const okCriar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar registro', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: true }) }}', options: {} } } });
const okDecidir = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar decisão', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: true }) }}', options: {} } } });
const okApagar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar apagar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: true }) }}', options: {} } } });
const negar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resp) }}', options: {} } } });

const nota = sticky('## Aba Equipe (Painel Central)\nPontos positivos, negativos e observações de cada pessoa da equipe, na tabela "Diretoria · Análise da equipe" (oVHcbAOfIG8CyFTL). Só o login do Henrique. Confidencial: nada daqui vai para a equipe. Execução manual = teste sem sessão.', [], { color: 4 });

export default workflow('diretoria-central-equipe', 'Diretoria | Painel Central (equipe)')
  .add(pedir).to(pessoas).to(conferir)
  .to(rota
    .onCase(0, ler.to(montar).to(devolver))
    .onCase(1, criar.to(okCriar))
    .onCase(2, decidir.to(okDecidir))
    .onCase(3, apagar.to(okApagar))
    .onCase(4, negar))
  .add(nota);
