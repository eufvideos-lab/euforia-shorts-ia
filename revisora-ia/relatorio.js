import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

// Revisora IA | Relatório diário e painel (05/11/2026). Pedido do Henrique: relatório diário de melhorias para as máquinas e para a Gerente,
// no Painel Central › Minha mesa ("Revisora IA", abaixo do "Gerente IA").
// 1) Seg a sáb às 18h30 (Recife): lê os achados do dia (tabela "Revisora IA · achados", só clientes do escopo), Claude escreve o resumo e
//    as mudanças sugeridas (texto pronto da regra), grava em "Revisora IA · relatórios" e avisa curto no #aprovações-gerente.
//    Nada muda sozinho: o Henrique escolhe o que aplicar.
// 2) Webhook euforia-painel-revisora (só papel diretor, token + PIN da tabela de acesso): devolve os últimos relatórios e os achados de hoje
//    para a aba "Revisora IA" do painel.
const DISCORD = { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } };
const ANTHROPIC = { anthropicApi: { id: 'NSAFLaAWGkUDHJLn', name: 'Anthropic account' } };
const ACHADOS = { __rl: true, mode: 'id', value: 'lONwXTR1U5LojxmL', cachedResultName: 'Revisora IA · achados' };
const RELATORIOS = { __rl: true, mode: 'id', value: 'GD0qGuZvSTAtHJWZ', cachedResultName: 'Revisora IA · relatórios' };
const TEXTOS = { __rl: true, mode: 'id', value: 'hBQ4lzOeYTTYAkyc', cachedResultName: 'Gerente IA · textos' };
const ACESSO = { __rl: true, mode: 'id', value: 'ilXDZWGAcOjoajx7', cachedResultName: 'Painel equipe · acesso' };
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';

const SYSTEM = `Você é a Revisora IA do Grupo Euforia (empresa de mídia, nunca "agência"). Recebe os achados do dia: o que você conferiu nas peças das máquinas
(Shorts IA, Longos IA, Carrosséis IA, Escritório), da equipe e nos rascunhos da Gerente IA (que lê os grupos de WhatsApp e escreve respostas).
Escreva o relatório diário para a diretoria, curto, em português do Brasil, sem citar valores nem financeiro.
Para cada problema que se repetiu ou foi grave, proponha UMA mudança concreta para quem errou (a máquina ou a Gerente), já com o texto pronto da regra
para colar no roteiro da máquina ou no prompt da Gerente. Não proponha nada para um problema que apareceu uma vez e foi leve.
Responda SÓ com JSON válido:
{"resumo": "2 a 3 frases: como foi o dia", "sugestoes": [{"para": "Gerente IA|Shorts IA|Longos IA|Carrosséis IA|Escritório|Equipe", "problema": "curto", "mudanca": "o que mudar, curto", "regra": "texto pronto da regra (1 a 3 frases)", "prioridade": "alta|media|baixa"}]}`;

// ---------- 1) relatório das 18h30 ----------
const cadaHora = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'De hora em hora (:30)', parameters: { rule: { interval: [{ field: 'cronExpression', expression: '30 * * * *' }] } } } });

const ehHora = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'É 18h30 de seg a sáb?', parameters: { jsCode: `const h = DateTime.now().setZone('America/Recife');
const forcar = $execution.mode !== 'production'; // rodar à mão gera o relatório na hora (teste)
if (!forcar && (h.hour !== 18 || h.weekday === 7)) return [];
return [{ json: { dia: h.toISODate() } }];` } } });

const lerEscopo = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Ler escopo', executeOnce: true, alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: TEXTOS, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'chave', condition: 'eq', keyValue: 'revisora_escopo' }] }, returnAll: true } } });

const lerAchados = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Achados do dia', executeOnce: true, alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: ACHADOS, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'dia', condition: 'eq', keyValue: "={{ $('É 18h30 de seg a sáb?').first().json.dia }}" }] }, returnAll: true } } });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar relatório', parameters: { jsCode: `const SYSTEM = ${JSON.stringify(SYSTEM)};
const dia = $('É 18h30 de seg a sáb?').first().json.dia;
const E = $('Ler escopo').all().map(i => i.json).filter(r => r && r.texto).sort((a, b) => (b.versao || 0) - (a.versao || 0));
const pats = (E.length ? String(E[0].texto) : '%acr%pole%,%regina%').split(',').map(s => s.trim()).filter(Boolean)
  .map(s => new RegExp('^' + s.replace(/[.*+?^$()|[\\]\\\\{}]/g, '').split('%').map(p => p.replace(/_/g, '.')).join('.*') + '$', 'i'));
const noEscopo = c => pats.some(re => re.test(String(c || '')));
const L = $input.all().map(i => i.json).filter(r => r && r.ref && noEscopo(r.cliente));
if (!L.length) return [];
const pecas = {};
for (const r of L) { const k = r.ref; pecas[k] = pecas[k] || { maquina: r.maquina || 'Outro', ok: true }; if (r.resultado !== 'ok') pecas[k].ok = false; }
const porMaq = {};
for (const p of Object.values(pecas)) { const m = porMaq[p.maquina] = porMaq[p.maquina] || { pecas: 0, ok: 0 }; m.pecas++; if (p.ok) m.ok++; }
const regras = {};
for (const r of L.filter(r => r.resultado === 'atencao')) { const k = (r.maquina || '') + ' · ' + (r.regra || 'outro'); regras[k] = (regras[k] || 0) + 1; }
const top = Object.entries(regras).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => ({ onde: k, vezes: n }));
const numeros = { dia, pecas: Object.keys(pecas).length, ok: Object.values(pecas).filter(p => p.ok).length,
  maquinas: Object.entries(porMaq).map(([m, v]) => ({ maquina: m, pecas: v.pecas, ok: v.ok, pct: Math.round(100 * v.ok / v.pecas) })), top };
const lista = L.filter(r => r.resultado === 'atencao').slice(0, 60).map(r => '- [' + r.maquina + '] ' + r.cliente + ' · ' + r.peca + ' · ' + r.regra + ' (' + r.gravidade + '): ' + r.detalhe).join('\\n');
const user = 'Dia ' + dia + '. Números: ' + JSON.stringify(numeros) + '\\n\\nAchados:\\n' + (lista || '(nenhum problema: tudo conferido ok)');
return [{ json: { dia, numeros, corpo: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 1500, temperature: 0.2, system: SYSTEM, messages: [{ role: 'user', content: user }] }) } }];` } } });

const escrever = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Escrever (Claude)', credentials: ANTHROPIC, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://api.anthropic.com/v1/messages', authentication: 'predefinedCredentialType', nodeCredentialType: 'anthropicApi',
  sendHeaders: true, headerParameters: { parameters: [{ name: 'anthropic-version', value: '2023-06-01' }] },
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}', options: { timeout: 120000 } } } });

const ler = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler relatório', parameters: { jsCode: `const m = $('Montar relatório').first().json;
let v = null;
try { const t = ($input.first().json.content || []).map(c => c.text || '').join(''); v = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); } catch (e) {}
const sug = v && Array.isArray(v.sugestoes) ? v.sugestoes.slice(0, 8).map((s, i) => ({ n: i + 1, para: String(s.para || ''), problema: String(s.problema || ''), mudanca: String(s.mudanca || ''), regra: String(s.regra || ''), prioridade: String(s.prioridade || 'media') })) : [];
const resumo = v && v.resumo ? String(v.resumo) : 'Não consegui escrever o resumo hoje; os números estão abaixo.';
const n = m.numeros;
const discord = JSON.stringify({ content: '📋 **Relatório da Revisora IA (' + m.dia.split('-').reverse().slice(0, 2).join('/') + ')**: ' + n.pecas + ' conferidas, ' + n.ok + ' sem nada a apontar, ' + sug.length + ' sugest' + (sug.length === 1 ? 'ão' : 'ões') + '. Está no painel, em Minha mesa › Revisora IA.', allowed_mentions: { parse: [] } });
return [{ json: { dia: m.dia, criado: DateTime.now().toISO(), resumo, numeros: JSON.stringify(n), sugestoes: JSON.stringify(sug), aplicar: '', discord } }];` } } });

const salvar = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Salvar relatório', parameters: { resource: 'row', operation: 'insert', dataTableId: RELATORIOS,
  columns: { mappingMode: 'defineBelow', value: { dia: '={{ $json.dia }}', criado: '={{ $json.criado }}', resumo: '={{ $json.resumo }}', numeros: '={{ $json.numeros }}', sugestoes: '={{ $json.sugestoes }}', aplicar: '' }, matchingColumns: [],
    schema: [ { id: 'dia', displayName: 'dia', type: 'string', display: true }, { id: 'criado', displayName: 'criado', type: 'dateTime', display: true }, { id: 'resumo', displayName: 'resumo', type: 'string', display: true }, { id: 'numeros', displayName: 'numeros', type: 'string', display: true }, { id: 'sugestoes', displayName: 'sugestoes', type: 'string', display: true }, { id: 'aplicar', displayName: 'aplicar', type: 'string', display: true } ] },
  options: {} } } });

const avisar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Avisar no #aprovações-gerente', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://discord.com/api/v10/channels/1567643418270634136/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: "={{ $('Ler relatório').first().json.discord }}", options: {} } } });

// ---------- 2) aba do painel ----------
const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Pedido da aba Revisora', parameters: {
  httpMethod: 'POST', path: 'euforia-painel-revisora', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

const lerPedido = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler pedido', parameters: { jsCode: `const b = ($input.first().json.body) || {};
const u = String(b.u || '').toLowerCase();
return [{ json: { u: /^[0-9a-f]{24}$/.test(u) ? u : 'x', pin: String(b.pin || '').replace(/[^0-9]/g, '').slice(0, 6), hoje: DateTime.now().setZone('America/Recife').toISODate() } }];` } } });

const acesso = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Achar pessoa', alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: ACESSO, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'token', condition: 'eq', keyValue: '={{ $json.u }}' }] }, limit: 1 } } });

const relat = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Relatórios', executeOnce: true, alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: RELATORIOS, returnAll: true } } });

const hojeAch = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Achados de hoje', executeOnce: true, alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: ACHADOS, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'dia', condition: 'eq', keyValue: "={{ $('Ler pedido').first().json.hoje }}" }] }, returnAll: true } } });

const escopoP = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Escopo (painel)', executeOnce: true, alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: TEXTOS, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'chave', condition: 'eq', keyValue: 'revisora_escopo' }] }, returnAll: true } } });

const montarResp = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar resposta', parameters: { jsCode: `const p = $('Ler pedido').first().json;
const a = $('Achar pessoa').first().json || {};
const ok = !!a.token && a.token === p.u && a.ativo === true && String(a.pin) === p.pin && a.papel === 'diretor';
if (!ok) return [{ json: { r: { ok: false, motivo: a.token ? 'permissao' : 'acesso' } } }];
const E = $('Escopo (painel)').all().map(i => i.json).filter(r => r && r.texto).sort((x, y) => (y.versao || 0) - (x.versao || 0));
const escopoTxt = E.length ? String(E[0].texto) : '%acr%pole%,%regina%';
const pats = escopoTxt.split(',').map(s => s.trim()).filter(Boolean).map(s => new RegExp('^' + s.replace(/[.*+?^$()|[\\]\\\\{}]/g, '').split('%').join('.*') + '$', 'i'));
const noEscopo = c => pats.some(re => re.test(String(c || '')));
const parse = s => { try { return JSON.parse(s || 'null'); } catch (e) { return null; } };
const relatorios = $('Relatórios').all().map(i => i.json).filter(r => r && r.dia).sort((x, y) => String(y.criado || '').localeCompare(String(x.criado || ''))).slice(0, 14)
  .map(r => ({ dia: r.dia, resumo: r.resumo || '', numeros: parse(r.numeros) || {}, sugestoes: parse(r.sugestoes) || [], aplicar: r.aplicar || '' }));
const hoje = $('Achados de hoje').all().map(i => i.json).filter(r => r && r.ref && noEscopo(r.cliente))
  .sort((x, y) => String(y.quando || '').localeCompare(String(x.quando || ''))).slice(0, 80)
  .map(r => ({ quando: String(r.quando || '').slice(11, 16), maquina: r.maquina, cliente: r.cliente, peca: r.peca, ref: r.ref, resultado: r.resultado, regra: r.regra, detalhe: r.detalhe, gravidade: r.gravidade }));
const clientes = escopoTxt.split(',').map(s => s.replace(/%/g, ' ').trim()).filter(Boolean);
return [{ json: { r: { ok: true, agora: DateTime.now().setZone('America/Recife').toFormat('HH:mm'), escopo: clientes, relatorios, hoje } } }];` } } });

const responder = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Responder', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.r) }}', options: {} } } });

const nota = sticky('## Revisora IA · relatório diário e painel (V1)\n1) Seg a sáb 18h30 (Recife): achados do dia (só clientes do escopo, linha revisora_escopo da tabela Gerente IA · textos) → Claude escreve resumo + mudanças sugeridas com texto pronto → tabela "Revisora IA · relatórios" + aviso curto no #aprovações-gerente. Nada é aplicado sozinho.\n2) Webhook euforia-painel-revisora (só diretor): últimos 14 relatórios + achados de hoje para a aba Revisora IA do painel.', [], { color: 4 });

export default workflow('revisora-relatorio', 'Revisora IA | Relatório diário e painel (V1)')
  .add(cadaHora).to(ehHora).to(lerEscopo).to(lerAchados).to(montar).to(escrever).to(ler).to(salvar).to(avisar)
  .add(pedir).to(lerPedido).to(acesso).to(relat).to(hojeAch).to(escopoP).to(montarResp).to(responder)
  .add(nota);
