import { workflow, node, trigger, switchCase, ifElse, sticky } from '@n8n/workflow-sdk';

// Diretoria | Painel Central (Isa): aba "Isa" da Minha mesa. Lista as sugestões da Isa (privado do WhatsApp administrativo)
// e só envia ao contato quando o Henrique clica em Enviar. Só a sessão do Henrique.
const PG = { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } };
const EVO = { httpHeaderAuth: { id: 'MqNLRX9duuYKJSR2', name: 'Evolution API' } };
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const PESSOAS = { __rl: true, mode: 'id', value: 'bcimSpwlGuGZ2940', cachedResultName: 'Painel · pessoas' };

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Pedido da aba Isa', parameters: {
  httpMethod: 'POST', path: 'diretoria-central-isa', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

const pessoas = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Pessoas', executeOnce: true, alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: PESSOAS, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'usuario', condition: 'eq', keyValue: 'henrique' }] }, limit: 1 } } });

const conferir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Conferir pedido', parameters: { jsCode: `const b = $('Pedido da aba Isa').first().json.body || {};
const p = $('Pessoas').first().json || {};
const agora = DateTime.now().setZone('America/Recife');
const teste = ['manual', 'test'].includes($execution.mode);
const ok = teste || (p.usuario === 'henrique' && p.ativo !== false && p.papel === 'diretor' && String(b.usuario || '').toLowerCase() === 'henrique'
  && !!p.sessao && String(b.token || '') === p.sessao && !!p.sessao_expira && DateTime.fromISO(p.sessao_expira) > agora);
const nega = m => [{ json: { rota: 'negado', resp: { ok: false, erro: m } } }];
if (!ok) return nega('sessao');
const acao = String(b.acao || 'ler');
if (acao === 'ler') return [{ json: { rota: 'ler' } }];
const id = Number(b.id);
if (!(id > 0)) return nega('Sugestão inválida.');
if (acao === 'enviar') {
  const texto = String(b.texto || '').replace(/\\r/g, '').trim();
  if (texto.length < 2) return nega('Escreva a resposta antes de enviar.');
  if (texto.length > 3000) return nega('Texto longo demais para o WhatsApp.');
  if (/henrique|\\bflau\\b/i.test(texto)) return nega('O texto cita o seu nome. Troque por "a direção" antes de enviar.');
  return [{ json: { rota: 'enviar', id, texto } }];
}
if (acao === 'recusar' || acao === 'feito') return [{ json: { rota: 'atualizar', id, status: acao === 'recusar' ? 'recusado' : 'resolvido', nota: String(b.nota || '').trim().slice(0, 300) } }];
return nega('Pedido inválido.');` } } });

const rota = switchCase({ version: 3.2, config: { name: 'Rota', parameters: { rules: { values: [
  { outputKey: 'ler', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: '={{ $json.rota }}', rightValue: 'ler', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } }, { outputKey: 'enviar', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: '={{ $json.rota }}', rightValue: 'enviar', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } },
  { outputKey: 'atualizar', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: '={{ $json.rota }}', rightValue: 'atualizar', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } }, { outputKey: 'negado', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: '={{ $json.rota }}', rightValue: 'negado', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } }] }, options: {} } } });

const lerTudo = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Ler sugestões', credentials: PG, parameters: {
  operation: 'executeQuery',
  query: `SELECT COALESCE((SELECT jsonb_agg(to_jsonb(s) - 'chat_id' ORDER BY CASE s.gravidade WHEN 'serio' THEN 0 WHEN 'atencao' THEN 1 ELSE 2 END, s.primeira_cliente)
    FROM isa_sugestoes s WHERE s.status = 'aguardando'), '[]'::jsonb) AS abertas,
  COALESCE((SELECT jsonb_agg(to_jsonb(s) - 'chat_id' - 'contexto' ORDER BY s.decidido_em DESC) FROM (SELECT * FROM isa_sugestoes
    WHERE status NOT IN ('aguardando', 'substituida') AND decidido_em > now() - interval '3 days' ORDER BY decidido_em DESC LIMIT 40) s), '[]'::jsonb) AS recentes,
  to_char(now() AT TIME ZONE 'America/Recife', 'YYYY-MM-DD"T"HH24:MI') AS agora;`, options: {} } } });

const devolver = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver sugestões', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: true, abertas: $json.abertas || [], recentes: $json.recentes || [], agora: $json.agora }) }}', options: {} } } });

const carregar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Carregar sugestão', credentials: PG, alwaysOutputData: true, parameters: {
  operation: 'executeQuery',
  query: `SELECT s.id, s.chat_id, s.status, s.contato,
  EXISTS (SELECT 1 FROM mensagens m WHERE m.chat_id = s.chat_id AND m.origem = 'isabela' AND m.from_me AND m.enviado_em > s.ultima_cliente) AS ja_respondida
FROM isa_sugestoes s WHERE s.id = $1::int;`,
  options: { queryReplacement: '={{ [ $json.id ] }}' } } } });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar envio', parameters: { jsCode: `const NL = String.fromCharCode(10);
const p = $('Conferir pedido').first().json;
const s = $input.first().json || {};
const erro = m => [{ json: { pode: false, resp: { ok: false, erro: m } } }];
if (!s.id) return erro('Sugestão não encontrada.');
if (s.status !== 'aguardando') return erro('Essa sugestão já foi decidida (' + s.status + ').');
if (s.ja_respondida) return erro('A Isabela já respondeu essa conversa por outro caminho. Nada foi enviado.');
let texto = p.texto;
if (!/isabela, time administrativo, grupo euforia/i.test(texto)) texto = texto + NL + NL + '*Isabela, time administrativo, Grupo Euforia*';
return [{ json: { pode: true, id: s.id, texto, corpo: JSON.stringify({ number: s.chat_id, text: texto }) } }];` } } });

const pode = ifElse({ version: 2.2, config: { name: 'Pode enviar?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.pode }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } } });

const mandar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Mandar pela Isabela', credentials: EVO, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'POST', url: 'https://api.grupoeuforia.tech/message/sendText/isabela', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}', options: { response: { response: { neverError: true, fullResponse: true } } } } } });

const registrar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Registrar envio', credentials: PG, parameters: {
  operation: 'executeQuery',
  query: `UPDATE isa_sugestoes SET status = CASE WHEN $2 = 'ok' THEN 'enviado' ELSE status END, texto_final = $3,
  enviado_em = CASE WHEN $2 = 'ok' THEN now() ELSE enviado_em END, decidido_em = CASE WHEN $2 = 'ok' THEN now() ELSE decidido_em END,
  nota = CASE WHEN $2 = 'ok' THEN nota ELSE 'erro no envio ' || to_char(now() AT TIME ZONE 'America/Recife', 'DD/MM HH24:MI') END
WHERE id = $1::int RETURNING id, status;`,
  options: { queryReplacement: "={{ [ $('Montar envio').first().json.id, ($json.statusCode >= 200 && $json.statusCode < 300) ? 'ok' : 'erro', $('Montar envio').first().json.texto ] }}" } } } });

const okEnvio = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar envio', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.status === "enviado" ? { ok: true } : { ok: false, erro: "O WhatsApp da Isabela não aceitou (número desconectado?). Nada saiu; tente de novo." }) }}', options: {} } } });

const naoPode = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar envio', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resp) }}', options: {} } } });

const atualizar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Atualizar status', credentials: PG, alwaysOutputData: true, parameters: {
  operation: 'executeQuery',
  query: `UPDATE isa_sugestoes SET status = $2, decidido_em = now(), nota = NULLIF($3, '') WHERE id = $1::int AND status = 'aguardando' RETURNING id;`,
  options: { queryReplacement: '={{ [ $json.id, $json.status, $json.nota ] }}' } } } });

const okAtualizar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Confirmar status', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.id ? { ok: true } : { ok: false, erro: "Essa sugestão já foi decidida." }) }}', options: {} } } });

const recusar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resp) }}', options: {} } } });

const nota = sticky('## Aba Isa (Painel Central)\nLista as sugestões da Isa (tabela isa_sugestoes, criada pelo "Isa | Ler e sugerir"). Enviar = manda pelo WhatsApp da Isabela com a assinatura "Isabela, time administrativo, Grupo Euforia", só com o clique do Henrique. Bloqueia texto com o nome dele e conversa já respondida por outro caminho. Recusar / Já resolvi só fecham a sugestão. Execução manual = teste sem sessão.', [], { color: 4 });

export default workflow('diretoria-central-isa', 'Diretoria | Painel Central (Isa)')
  .add(pedir).to(pessoas).to(conferir)
  .to(rota
    .onCase(0, lerTudo.to(devolver))
    .onCase(1, carregar.to(montar).to(pode.onTrue(mandar.to(registrar).to(okEnvio)).onFalse(naoPode)))
    .onCase(2, atualizar.to(okAtualizar))
    .onCase(3, recusar))
  .add(nota);
