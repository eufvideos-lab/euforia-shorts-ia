import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

// Revisora IA | Revisar a Gerente (05/11/2026). Pedido do Henrique: uma camada extra que revisa o que a Gerente IA pede, antes da aprovação dele.
// Escopo inicial (Henrique, 05/11): só clientes sensíveis, começando por Nova Acrópole e Regina Gyraser. Para abrir para outro cliente, grave
// versão nova da linha "revisora_escopo" na tabela "Gerente IA · textos".
// A cada 2 min: rascunhos novos da Gerente desses clientes → Claude confere contra o checklist → grava selo (revisora_status/revisora_nota) em
// gerente_rascunhos (a aba Aprovar mostra), responde embaixo do rascunho no #aprovações-gerente e registra os achados na tabela
// "Revisora IA · achados" (alimenta o relatório diário). NÃO bloqueia nem muda o rascunho: só avisa. Nada vai ao cliente aqui.
const PG = { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } };
const DISCORD = { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } };
const ANTHROPIC = { anthropicApi: { id: 'NSAFLaAWGkUDHJLn', name: 'Anthropic account' } };
const ACHADOS = { __rl: true, mode: 'id', value: 'lONwXTR1U5LojxmL', cachedResultName: 'Revisora IA · achados' };

const SYSTEM = `Você é a Revisora IA do Grupo Euforia, empresa de mídia (nunca "agência") que cria e cuida do ecossistema digital (YouTube e redes) de especialistas.
A Gerente IA leu mensagens de um cliente no WhatsApp, classificou, às vezes criou um card de tarefa e escreveu um rascunho de resposta que a diretoria vai aprovar.
Seu trabalho: conferir se a Gerente acertou, ANTES da aprovação. Seja rigorosa, mas só aponte problema real (não invente).

Checklist:
1. Classe certa (pedido, ajuste, status, material, serio, sem_acao) para o que o cliente disse. Assunto de dinheiro, contrato, cancelamento ou jurídico tem que ser "serio".
2. Prazo do card pela regra: padrão 72h; urgente 24h só se o cliente pediu pressa; hiperurgente nunca vira card sem a diretoria.
3. Card completo: cliente, o que foi pedido (claro para quem vai fazer), prazo, link do material quando o cliente mandou.
4. Rascunho responde de fato o que o cliente perguntou ou pediu.
5. Regras de texto: nunca citar o nome do Henrique/Flau; nunca admitir atraso, falha ou erro da equipe (mudança vira melhoria "ideal para ambos"); dizer "ecossistema digital" e não "canal" quando falar do conjunto; assinatura "Érica, time de suporte, Grupo Euforia"; sem oferecer ligação ou call de alinhamento.
6. Nenhuma data, valor, quantidade ou promessa que não esteja nos dados (mensagens do cliente, card, cards abertos). Data com dia da semana tem que bater com o calendário dado.
7. Português correto (ortografia, concordância) e tom cordial, curto, pró-empresa. Prometer entrega em domingo é erro.

Responda SÓ com um JSON válido, sem texto fora dele:
{"resultado": "ok" ou "atencao", "nota": "uma frase curta para a diretoria (se ok: 'Conferido.')", "achados": [{"regra": "classe|prazo|card|resposta|texto|promessa|portugues", "detalhe": "o que está errado e como corrigir, curto", "gravidade": "alta|media|baixa"}]}`;

const cada2 = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada 2 minutos', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 2 }] } } } });

const TEXTOS = { __rl: true, mode: 'id', value: 'hBQ4lzOeYTTYAkyc', cachedResultName: 'Gerente IA · textos' };
const lerEscopo = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Ler escopo', executeOnce: true, alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: TEXTOS, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'chave', condition: 'eq', keyValue: 'revisora_escopo' }] }, returnAll: true } } });

// Clientes que a Revisora confere: linha "revisora_escopo" da tabela "Gerente IA · textos" (vale a maior versao), pedaços do nome separados por vírgula.
// Para abrir para outro cliente, grave uma versão nova com o nome a mais. Sem linha: Nova Acrópole e Regina.
const escopo = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Escopo', parameters: { jsCode: `const L = $input.all().map(i => i.json).filter(r => r && r.texto).sort((a, b) => (b.versao || 0) - (a.versao || 0));
const lista = (L.length ? String(L[0].texto) : '%acr%pole%,%regina%').split(',').map(s => s.trim().replace(/["{}]/g, '')).filter(Boolean);
return [{ json: { escopo: '{' + lista.map(s => '"' + (s.includes('%') ? s : '%' + s + '%') + '"').join(',') + '}' } }];` } } });

const pendentes = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Rascunhos para revisar', credentials: PG, alwaysOutputData: true, parameters: { operation: 'executeQuery',
  query: `ALTER TABLE gerente_rascunhos ADD COLUMN IF NOT EXISTS revisora_status TEXT, ADD COLUMN IF NOT EXISTS revisora_nota TEXT, ADD COLUMN IF NOT EXISTS revisora_em TIMESTAMPTZ;
SELECT r.id, r.cliente, r.classe, r.urgencia, r.texto, r.card_url, left(COALESCE(r.card_corpo, ''), 2500) AS card, r.discord_msg, r.chat_id,
  to_char(now() AT TIME ZONE 'America/Recife', 'YYYY-MM-DD') AS hoje,
  (SELECT string_agg(to_char(q.enviado_em AT TIME ZONE 'America/Recife', 'DD/MM HH24:MI') || ' ' || COALESCE(q.autor_nome, 'Cliente') || ': ' || left(COALESCE(q.texto, '[' || q.tipo || ']'), 400), E'\\n' ORDER BY q.enviado_em)
     FROM (SELECT DISTINCT ON (m.msg_id) m.* FROM mensagens m WHERE m.chat_id = r.chat_id AND m.enviado_em <= r.ultima_cliente AND m.enviado_em > r.ultima_cliente - interval '6 hours'
           AND NOT m.from_me AND m.tipo NOT IN ('reactionMessage', 'protocolMessage') ORDER BY m.msg_id, m.enviado_em) q) AS cliente_disse
FROM gerente_rascunhos r
WHERE r.revisora_status IS NULL AND r.criado_em > now() - interval '1 day' AND r.cliente ILIKE ANY($1::text[])
ORDER BY r.id LIMIT 5;`, options: { queryReplacement: '={{ [ $json.escopo ] }}' } } } });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar revisão', parameters: { jsCode: `const SYSTEM = ${JSON.stringify(SYSTEM)};
const hoje = DateTime.now().setZone('America/Recife');
const CAL = Array.from({ length: 8 }, (_, k) => hoje.plus({ days: k }).setLocale('pt-BR').toFormat('cccc dd/MM/yyyy')).join(', ');
return $input.all().filter(i => i.json.id).map(i => {
  const r = i.json;
  const user = 'Hoje: ' + hoje.setLocale('pt-BR').toFormat('cccc dd/MM/yyyy HH:mm') + '. Próximos dias: ' + CAL + '.\\nCliente: ' + r.cliente +
    '\\nClasse dada pela Gerente: ' + (r.classe || '') + ' · urgência: ' + (r.urgencia || 'padrão') +
    '\\n\\nO que o cliente disse:\\n' + (r.cliente_disse || '(sem texto)') +
    '\\n\\nCard criado pela Gerente (JSON do Notion, pode estar vazio):\\n' + (r.card || '(sem card)') +
    '\\n\\nRascunho de resposta da Gerente:\\n' + (r.texto || '(sem rascunho)');
  return { json: { ...r, corpo: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 700, temperature: 0, system: SYSTEM, messages: [{ role: 'user', content: user }] }) } };
});` } } });

const revisar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Revisar (Claude)', credentials: ANTHROPIC, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://api.anthropic.com/v1/messages', authentication: 'predefinedCredentialType', nodeCredentialType: 'anthropicApi',
  sendHeaders: true, headerParameters: { parameters: [{ name: 'anthropic-version', value: '2023-06-01' }] },
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}', options: { timeout: 90000, batching: { batch: { batchSize: 1, batchInterval: 500 } } } } } });

const resultado = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Resultado', parameters: { jsCode: `const agora = DateTime.now().setZone('America/Recife');
const G = { alta: '🔴', media: '🟠', baixa: '🟡' };
return $input.all().map((it, i) => {
  const r = $('Montar revisão').itemMatching(i).json;
  let v = null;
  try { const t = (it.json.content || []).map(c => c.text || '').join(''); v = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); } catch (e) {}
  const falhou = !v || !['ok', 'atencao'].includes(v.resultado);
  const achados = falhou ? [] : (Array.isArray(v.achados) ? v.achados : []).slice(0, 6).map(a => ({ regra: String(a.regra || 'outro').slice(0, 30), detalhe: String(a.detalhe || '').slice(0, 300), gravidade: ['alta', 'media', 'baixa'].includes(a.gravidade) ? a.gravidade : 'media' }));
  const status = falhou ? 'erro' : (v.resultado === 'atencao' && achados.length ? 'atencao' : 'ok');
  const nota = falhou ? 'Não consegui revisar este rascunho.' : status === 'ok' ? 'Conferido, nada a apontar.' : achados.map(a => G[a.gravidade] + ' ' + a.detalhe).join(' · ');
  const discord = r.discord_msg && status !== 'erro' ? JSON.stringify({ content: (status === 'ok' ? '🔎 Revisora: conferido ✅' : '🔎 **Revisora: atenção**\\n' + achados.map(a => '- ' + G[a.gravidade] + ' ' + a.detalhe).join('\\n')).slice(0, 1900),
    message_reference: { message_id: r.discord_msg, fail_if_not_exists: false }, allowed_mentions: { parse: [] } }) : '';
  const base = { quando: agora.toISO(), dia: agora.toISODate(), origem: 'gerente', maquina: 'Gerente IA', cliente: r.cliente, peca: 'rascunho ' + (r.classe || ''), ref: 'rascunho:' + r.id };
  const linhas = status === 'atencao' ? achados.map(a => ({ ...base, resultado: 'atencao', regra: a.regra, detalhe: a.detalhe, gravidade: a.gravidade }))
    : [{ ...base, resultado: status, regra: '', detalhe: status === 'erro' ? 'falha ao revisar' : '', gravidade: '' }];
  return { json: { id: r.id, status, nota: nota.slice(0, 1200), discord, linhas } };
});` } } });

const gravar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Gravar selo', credentials: PG, executeOnce: true, alwaysOutputData: true, parameters: { operation: 'executeQuery',
  query: `UPDATE gerente_rascunhos r SET revisora_status = x.status, revisora_nota = x.nota, revisora_em = now()
FROM json_to_recordset($1::json) AS x(id int, status text, nota text) WHERE r.id = x.id RETURNING r.id;`,
  options: { queryReplacement: "={{ [ JSON.stringify($('Resultado').all().map(i => ({ id: i.json.id, status: i.json.status, nota: i.json.nota }))) ] }}" } } } });

const avisos = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Avisos', parameters: { jsCode: "return $('Resultado').all().filter(i => i.json.discord).map(i => ({ json: { discord: i.json.discord } }));" } } });

const avisar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Responder no #aprovações-gerente', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://discord.com/api/v10/channels/1567643418270634136/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.discord }}', options: { batching: { batch: { batchSize: 1, batchInterval: 1200 } } } } } });

const linhas = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Linhas dos achados', parameters: { jsCode: "return $('Resultado').all().flatMap(i => i.json.linhas).map(l => ({ json: l }));" } } });

const gravarAch = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Gravar achados', parameters: { resource: 'row', operation: 'insert', dataTableId: ACHADOS,
  columns: { mappingMode: 'defineBelow', value: { quando: '={{ $json.quando }}', dia: '={{ $json.dia }}', origem: '={{ $json.origem }}', maquina: '={{ $json.maquina }}', cliente: '={{ $json.cliente }}', peca: '={{ $json.peca }}', ref: '={{ $json.ref }}', resultado: '={{ $json.resultado }}', regra: '={{ $json.regra }}', detalhe: '={{ $json.detalhe }}', gravidade: '={{ $json.gravidade }}' }, matchingColumns: [],
    schema: [ { id: 'quando', displayName: 'quando', type: 'dateTime', display: true }, { id: 'dia', displayName: 'dia', type: 'string', display: true }, { id: 'origem', displayName: 'origem', type: 'string', display: true }, { id: 'maquina', displayName: 'maquina', type: 'string', display: true }, { id: 'cliente', displayName: 'cliente', type: 'string', display: true }, { id: 'peca', displayName: 'peca', type: 'string', display: true }, { id: 'ref', displayName: 'ref', type: 'string', display: true }, { id: 'resultado', displayName: 'resultado', type: 'string', display: true }, { id: 'regra', displayName: 'regra', type: 'string', display: true }, { id: 'detalhe', displayName: 'detalhe', type: 'string', display: true }, { id: 'gravidade', displayName: 'gravidade', type: 'string', display: true } ] },
  options: {} } } });

const nota = sticky('## Revisora IA · revisar a Gerente (V1)\nA cada 2 min: rascunhos novos da Gerente IA dos clientes do ESCOPO (linha revisora_escopo da tabela Gerente IA · textos; hoje Nova Acrópole e Regina) → Claude confere classe, prazo, card, resposta, regras de texto, promessas e português → selo em gerente_rascunhos (revisora_status/nota), resposta embaixo do rascunho no #aprovações-gerente e achados na tabela "Revisora IA · achados". Não bloqueia nada e não fala com cliente.', [], { color: 4 });

export default workflow('revisora-gerente', 'Revisora IA | Revisar a Gerente (V1)')
  .add(cada2).to(lerEscopo).to(escopo).to(pendentes).to(montar).to(revisar).to(resultado).to(gravar).to(linhas).to(gravarAch).to(avisos).to(avisar)
  .add(nota);
