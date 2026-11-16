import { workflow, node, trigger, ifElse } from '@n8n/workflow-sdk';

// Painel | Título e descrição (V1) · 16/11/2026
// 1) A máquina (pipeline/publicacao.py) grava o pacote de cada vídeo: POST shorts-ia-publicacao (senha da ponte no x-token).
// 2) O painel (aba Grade, gaveta do horário) lista os pacotes do cliente: POST euforia-painel-publicacao {u, pin, cliente}.
const TOKEN_PONTE = '<SENHA DA PONTE: a mesma do fluxo Shorts IA | Transcrever áudio>'; // nunca no repositório
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const ACESSO = { __rl: true, mode: 'id', value: 'ilXDZWGAcOjoajx7', cachedResultName: 'Painel equipe · acesso' };
const PACOTES = { __rl: true, mode: 'id', value: 'OR12YYdijdU644yQ', cachedResultName: 'Publicação · títulos e descrições' };
/* ---------------- 1) máquina grava ---------------- */
const receber = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Máquina grava', parameters: {
  httpMethod: 'POST', path: 'shorts-ia-publicacao', responseMode: 'responseNode', options: {} } } });
const senha = ifElse({ version: 2.2, config: { name: 'Senha confere?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: "={{ $json.headers['x-token'] }}", rightValue: TOKEN_PONTE, operator: { type: 'string', operation: 'equals' } }],
  combinator: 'and' } } } });
const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar linhas', parameters: { jsCode: `const b = $input.first().json.body || {};
const id = v => { const s = String(v || '').replace(/-/g, '').toLowerCase(); return /^[0-9a-f]{32}$/.test(s) ? s : ''; };
const t = (v, n) => String(v || '').slice(0, n);
const cli = id(b.cliente_id);
if (!cli || !Array.isArray(b.videos) || !b.videos.length) throw new Error('faltou cliente_id ou videos');
const agora = DateTime.now().setZone('America/Recife').toISO();
return b.videos.slice(0, 12).map(v => ({ json: {
  cliente_id: cli, cliente: t(b.cliente, 120), tipo: v.tipo === 'longo' ? 'longo' : 'short', nome: t(v.nome, 120),
  titulo: t(v.titulo, 120), outros_titulos: JSON.stringify((v.outros_titulos || []).slice(0, 4).map(x => t(x, 120))),
  descricao: t(v.descricao, 5200), tags: t((v.tags || []).join(', '), 600), comentario: t(v.comentario, 400), thumb: t(v.thumb, 120),
  link: /^https:\\/\\//.test(String(v.drive || '')) ? t(v.drive, 300) : '', pedido: t(b.pedido, 300), criado: agora } }));
` } } });
const gravar = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Gravar pacotes', parameters: {
  resource: 'row', operation: 'insert', dataTableId: PACOTES, columns: { mappingMode: 'autoMapInputData', value: null }, options: {} } } });
const ok = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Gravado', parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: true, gravados: $input.all().length }) }}', options: {} } } });
const negar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Negar', parameters: { respondWith: 'json', responseBody: '{"erro":"nao autorizado"}', options: { responseCode: 403 } } } });

/* ---------------- 2) painel lista ---------------- */
const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Painel pede', parameters: {
  httpMethod: 'POST', path: 'euforia-painel-publicacao', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });
const ler = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler pedido', parameters: { jsCode: `const b = $input.first().json.body || {};
const u = String(b.u || '').toLowerCase();
const c = String(b.cliente || '').replace(/-/g, '').toLowerCase();
return [{ json: { u: /^[0-9a-f]{24}$/.test(u) ? u : 'x', pin: String(b.pin || '').replace(/[^0-9]/g, '').slice(0, 6), cliente: /^[0-9a-f]{32}$/.test(c) ? c : 'x' } }];
` } } });
const acesso = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Achar pessoa', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: ACESSO, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'token', condition: 'eq', keyValue: '={{ $json.u }}' }] }, limit: 1 } } });
const validar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validar', parameters: { jsCode: `const p = $('Ler pedido').first().json;
const r = $input.first().json || {};
const ok = !!r.token && r.token === p.u && r.ativo === true && String(r.pin) === p.pin && p.cliente !== 'x';
return [{ json: { ok, cliente: p.cliente } }];
` } } });
const valido = ifElse({ version: 2.2, config: { name: 'Pode ver?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });
const buscar = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Pacotes do cliente', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: PACOTES, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'cliente_id', condition: 'eq', keyValue: '={{ $json.cliente }}' }] },
  limit: 30, orderBy: true, orderByColumn: 'createdAt', orderByDirection: 'DESC' } } });
const resumir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar resposta', parameters: { jsCode: `const limite = DateTime.now().minus({ days: 45 });
const lista = $input.all().map(i => i.json).filter(x => x.titulo && (!x.criado || DateTime.fromISO(x.criado) > limite)).map(x => {
  let outros = []; try { outros = JSON.parse(x.outros_titulos || '[]'); } catch (e) {}
  return { tipo: x.tipo, nome: x.nome, titulo: x.titulo, outros, descricao: x.descricao, tags: x.tags, comentario: x.comentario, thumb: x.thumb, link: x.link, criado: x.criado };
});
return [{ json: { ok: true, pacotes: lista } }];
` } } });
const devolver = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver', parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: {} } } });
const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar', parameters: { respondWith: 'json', responseBody: '{"ok":false,"motivo":"acesso"}', options: {} } } });

export default workflow('painel-publicacao', 'Painel | Título e descrição (V1)')
  .add(receber).to(senha.onTrue(montar.to(gravar.to(ok))).onFalse(negar))
  .add(pedir).to(ler).to(acesso).to(validar).to(valido.onTrue(buscar.to(resumir.to(devolver))).onFalse(recusar));
