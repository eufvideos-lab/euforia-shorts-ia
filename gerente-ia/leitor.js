import { workflow, node, trigger, expr, merge } from '@n8n/workflow-sdk';
const a_cada_2_minutos = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'A cada 2 minutos', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 2 }] } } }
});

const grupos_com_mensagem_nova = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.6,
  config: {
    name: 'Grupos com mensagem nova',
    parameters: {
      operation: 'executeQuery',
      query: `CREATE TABLE IF NOT EXISTS gerente_lote (chat_id TEXT PRIMARY KEY, ate TIMESTAMPTZ, atualizado_em TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS gerente_rascunhos (id SERIAL PRIMARY KEY, criado_em TIMESTAMPTZ DEFAULT now(), chat_id TEXT, cliente TEXT, cliente_id TEXT, classe TEXT, urgencia TEXT, ultima_cliente TIMESTAMPTZ, texto TEXT, card_id TEXT, card_url TEXT, card_corpo TEXT, discord_msg TEXT, status TEXT DEFAULT 'aguardando', texto_final TEXT, corrigida BOOLEAN, decidido_em TIMESTAMPTZ, enviado_em TIMESTAMPTZ, nota TEXT);
WITH team AS (
  SELECT DISTINCT m.autor_jid FROM mensagens m
  WHERE m.chat_id IN (SELECT chat_id FROM chats WHERE nome ILIKE '%pend%ncias%')
    AND NOT m.from_me AND m.autor_jid IS NOT NULL
  UNION SELECT '5581996928808@s.whatsapp.net'
  UNION SELECT '5581995667045@s.whatsapp.net'
),
internos AS (
  SELECT DISTINCT chat_id FROM chats
  WHERE nome ILIKE ANY (ARRAY['%pend%ncias%','%euforia | marketing%','%central de gest%','%sala de guerra%','%teste wo%','%aquecimento%'])
),
msgs AS (
  SELECT msg_id, min(chat_id) AS chat_id, min(enviado_em) AS enviado_em,
         (bool_or(from_me) OR bool_or(COALESCE(autor_nome,'') ILIKE '%euforia%') OR bool_or(autor_jid IN (SELECT autor_jid FROM team WHERE autor_jid IS NOT NULL)))
           AND NOT (min(chat_id) = '120363414189297847@g.us' AND COALESCE(max(texto),'') ILIKE '[cliente]%') AS da_equipe,
         max(autor_nome) AS autor_nome, max(tipo) AS tipo, max(texto) AS texto
  FROM mensagens
  WHERE chat_id LIKE '%@g.us' AND enviado_em > now() - interval '2 days'
  GROUP BY msg_id
),
novos AS (
  SELECT m.chat_id, count(*) AS qtd, min(m.enviado_em) AS primeira, max(m.enviado_em) AS ultima,
    string_agg(to_char(m.enviado_em AT TIME ZONE 'America/Recife','DD/MM HH24:MI') || ' ' || COALESCE(m.autor_nome,'Cliente') || ': ' || left(COALESCE(m.texto,'['||m.tipo||']'),600), E'\\n' ORDER BY m.enviado_em) AS textos
  FROM msgs m LEFT JOIN gerente_lote g ON g.chat_id = m.chat_id
  WHERE NOT m.da_equipe
    AND m.tipo NOT IN ('reactionMessage','stickerMessage','protocolMessage','pollUpdateMessage')
    AND m.enviado_em > COALESCE(g.ate, now() - interval '30 minutes')
  GROUP BY m.chat_id
)
SELECT n.chat_id, n.qtd, n.primeira, n.ultima, n.textos,
  COALESCE((SELECT c.nome FROM chats c WHERE c.chat_id = n.chat_id AND c.nome IS NOT NULL LIMIT 1), n.chat_id) AS grupo,
  (SELECT string_agg(to_char(x.enviado_em AT TIME ZONE 'America/Recife','DD/MM HH24:MI') || ' ' ||
      CASE WHEN x.da_equipe THEN 'Euforia' ELSE COALESCE(x.autor_nome,'Cliente') END || ': ' || left(COALESCE(x.texto,'['||x.tipo||']'),300), E'\\n' ORDER BY x.enviado_em)
     FROM (SELECT * FROM msgs y WHERE y.chat_id = n.chat_id AND y.enviado_em < n.primeira AND y.tipo NOT IN ('reactionMessage','protocolMessage') ORDER BY y.enviado_em DESC LIMIT 8) x) AS contexto,
  EXISTS (SELECT 1 FROM msgs z WHERE z.chat_id = n.chat_id AND z.da_equipe AND z.enviado_em > n.ultima) AS equipe_ja_respondeu
FROM novos n
WHERE n.chat_id NOT IN (SELECT chat_id FROM internos)
  AND EXISTS (SELECT 1 FROM chats c WHERE c.chat_id = n.chat_id AND c.origem LIKE 'suporte%')
  AND (SELECT max(y.enviado_em) FROM msgs y WHERE y.chat_id = n.chat_id) < now() - interval '3 minutes'
ORDER BY n.ultima
LIMIT 15;
`,
      options: {}
    },
    credentials: { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } },
    position: [224, 0],
    executeOnce: true
  }
});

const marcar_como_lido = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.6,
  config: {
    name: 'Marcar como lido',
    parameters: {
      operation: 'executeQuery',
      query: `INSERT INTO gerente_lote (chat_id, ate, atualizado_em)
SELECT x.chat_id, x.ate, now() FROM json_to_recordset($1::json) AS x(chat_id text, ate timestamptz)
ON CONFLICT (chat_id) DO UPDATE SET ate = GREATEST(gerente_lote.ate, EXCLUDED.ate), atualizado_em = now()
RETURNING chat_id;`,
      options: { queryReplacement: expr('{{ [ JSON.stringify($input.all().filter(i => i.json.chat_id).map(i => ({ chat_id: i.json.chat_id, ate: i.json.ultima }))) ] }}') }
    },
    credentials: { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } },
    position: [448, 0],
    executeOnce: true
  }
});

const clientes_com_grupo = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Clientes com grupo', parameters: { method: 'POST', url: 'https://api.notion.com/v1/databases/3ddc91b406be49e98e630c298d9162d8/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendHeaders: true, headerParameters: { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] }, sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ filter: { and: [{ property: "Situação", select: { does_not_equal: "Encerrado" } }, { property: "Grupo WhatsApp (ID)", rich_text: { is_not_empty: true } }] }, page_size: 100 }) }}'), options: { pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest', parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: expr('{{ $response.body.next_cursor }}') }] }, paginationCompleteWhen: 'other', completeExpression: expr('{{ !$response.body.has_more }}'), limitPagesFetched: true, maxRequests: 10 } } } }, credentials: { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } }, position: [448, 192], executeOnce: true }
});

const separar_e_travar = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Separar e travar',
    parameters: {
      jsCode: `const entrada = $('Grupos com mensagem nova').all();
const sem = s => String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; if (v.date) return v.date.start || ''; if (v.formula) return String(v.formula.string || ''); return ''; };
const hoje = DateTime.now().setZone('America/Recife').toISODate();
const cli = {};
for (const it of $('Clientes com grupo').all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {};
  const g = txt(pr['Grupo WhatsApp (ID)']).trim();
  if (!g) continue;
  cli[g] = { id: p.id, nome: txt(pr['Cliente']), faixa: txt(pr['Faixa']) || txt(pr['Faixa base']), atencao: !!(pr['🔴 Atenção redobrada'] || {}).checkbox, foco: txt(pr['⭐ Foco até']).slice(0, 10) >= hoje, ativo: txt(pr['Situação']) === 'Ativo' };
}
// Trava por palavra: estes assuntos nunca vão para a IA.
const TRAVAS = [
  ['dinheiro', /r\\$|\\bpix\\b|boleto|pagament|\\bpagar\\b|paguei|cobranc|\\bcobrar|fatura|nota fiscal|reembols|estorn|parcela|mensalidade|\\bvalor(es)?\\b|desconto|\\bmulta\\b|\\breais\\b|transferencia|comprovante/],
  ['contrato', /contrato|cancelar|cancelament|rescis|distrato|reembolso|quero sair|nao quero mais/],
  ['jurídico', /advogad|procon|reclame ?aqui|processar|processo judicial|na justica|juridic|notificacao extrajudicial|danos morais/]
];
const mascara = s => String(s || '')
  .replace(/r\\$\\s*[\\d.,]+(\\s*(mil|k))?/gi, '[valor]')
  .replace(/\\b\\d{1,3}(\\.\\d{3})+(,\\d{1,2})?\\b/g, '[valor]')
  .replace(/\\b\\d+([.,]\\d+)?\\s*(mil|k|reais)\\b/gi, '[valor]');
const out = [];
for (const it of entrada) {
  const r = it.json;
  if (!r.chat_id) continue;
  const c = cli[r.chat_id];
  if (!c || (/^TESTE/i.test(c.nome) && r.chat_id !== '120363414189297847@g.us')) continue;
  const base = sem(r.textos);
  let palavra = '';
  for (const [nome, re] of TRAVAS) if (re.test(base)) { palavra = nome; break; }
  out.push({ json: {
    chat_id: r.chat_id, grupo: r.grupo, cliente: c.nome, cliente_id: c.id, ativo: c.ativo, faixa: c.faixa, atencao: c.atencao, foco: c.foco,
    qtd: Number(r.qtd) || 1, ultima: r.ultima, equipe_ja_respondeu: r.equipe_ja_respondeu === true,
    textos: mascara(r.textos).slice(0, 3000), contexto: mascara(r.contexto).slice(0, 2500),
    trava: !!palavra, palavra, hoje
  } });
}
return out;
`
    },
    position: [672, 192]
  }
});

const vai_para_a_IA = node({
  type: 'n8n-nodes-base.if',
  version: 2.2,
  config: { name: 'Vai para a IA?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $json.trava }}'), rightValue: '', operator: { type: 'boolean', operation: 'false', singleValue: true } }], combinator: 'and' } }, position: [896, 192] }
});

const classificar_Claude = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Classificar (Claude)', parameters: { method: 'POST', url: 'https://api.anthropic.com/v1/messages', authentication: 'predefinedCredentialType', nodeCredentialType: 'anthropicApi', sendHeaders: true, headerParameters: { parameters: [{ name: 'anthropic-version', value: '2023-06-01' }] }, sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ model: \'claude-haiku-4-5\', max_tokens: 300, temperature: 0, system: "Voc\\u00ea \\u00e9 a Gerente IA de opera\\u00e7\\u00e3o do Grupo Euforia, empresa de m\\u00eddia que cria e cuida do ecossistema digital (YouTube e redes sociais) de especialistas. Voc\\u00ea l\\u00ea as mensagens novas de um cliente num grupo de WhatsApp e classifica. Responda S\\u00d3 com um JSON v\\u00e1lido, sem nenhum texto fora dele, neste formato:\\n{\\"classe\\": \\"pedido\\", \\"tipo_peca\\": \\"shorts\\", \\"resumo\\": \\"...\\", \\"prazo_citado\\": \\"\\", \\"irritado\\": false}\\n\\nclasse (uma s\\u00f3):\\n- pedido: pede conte\\u00fado novo (v\\u00eddeo longo, shorts, carrossel, thumb, post, p\\u00e1gina, roteiro).\\n- ajuste: pede mudan\\u00e7a em pe\\u00e7a j\\u00e1 feita, enviada ou postada (trocar thumb, cortar trecho, corrigir texto, legenda).\\n- status: pergunta prazo, andamento, quando sai, se recebemos algo, o que falta.\\n- material: manda arquivo, foto, v\\u00eddeo, link de pasta, depoimento, ou avisa que j\\u00e1 gravou ou mandou o material.\\n- serio: dinheiro, pagamento, cobran\\u00e7a, contrato, cancelamento, pausa, amea\\u00e7a, advogado, Procon, Reclame Aqui, processo, cliente irritado, decepcionado, reclamando forte ou pedindo para falar com respons\\u00e1vel.\\n- sem_acao: ok, obrigado, bom dia, emoji, elogio, aprova\\u00e7\\u00e3o simples ou conversa que n\\u00e3o pede nada.\\nSe houver mais de uma, escolha a mais importante. serio vence todas.\\ntipo_peca: longo, shorts, carrossel, thumb, outro ou nenhum.\\nresumo: at\\u00e9 15 palavras em portugu\\u00eas dizendo o que o cliente quer. Nunca escreva valores em dinheiro.\\nprazo_citado: data no formato AAAA-MM-DD se o cliente disse uma data ou dia para a entrega; sen\\u00e3o \\"\\".\\nirritado: true se o tom for de irrita\\u00e7\\u00e3o, cobran\\u00e7a dura ou reclama\\u00e7\\u00e3o.", messages: [{ role: \'user\', content: \'Hoje é \' + $json.hoje + \' (\' + DateTime.now().setZone(\'America/Recife\').setLocale(\'pt-BR\').toFormat(\'cccc\') + \'). Próximos dias: \' + Array.from({ length: 8 }, (_, k) => DateTime.now().setZone(\'America/Recife\').plus({ days: k }).setLocale(\'pt-BR\').toFormat(\'cccc dd/MM/yyyy\')).join(\', \') + \'.\\nCliente: \' + $json.cliente + \'\\nGrupo: \' + $json.grupo + \'\\n\\nConversa antes (contexto):\\n\' + ($json.contexto || \'(sem mensagens anteriores)\') + \'\\n\\nMensagens novas do cliente:\\n\' + $json.textos }] }) }}'), options: { batching: { batch: { batchSize: 1, batchInterval: 400 } }, timeout: 60000 } }, credentials: { anthropicApi: { id: 'NSAFLaAWGkUDHJLn', name: 'Anthropic account' } }, position: [1120, 192], onError: 'continueRegularOutput' }
});

const ler_classifica_o = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Ler classificação',
    parameters: {
      jsCode: `const CLASSES = ['pedido', 'ajuste', 'status', 'material', 'serio', 'sem_acao'];
return $input.all().map((it, i) => {
  const b = $('Separar e travar').itemMatching(i).json;
  let c = {};
  try { const t = ((it.json.content || [])[0] || {}).text || ''; c = JSON.parse((t.match(/\\{[\\s\\S]*\\}/) || ['{}'])[0]); } catch (e) { c = {}; }
  let classe = CLASSES.includes(c.classe) ? c.classe : 'indefinido';
  if (c.irritado === true) classe = 'serio';
  return { json: { ...b, classe, tipo_peca: String(c.tipo_peca || 'nenhum'), resumo: String(c.resumo || '').replace(/r\\$\\s*[\\d.,]+/gi, '[valor]').slice(0, 200), prazo_citado: /^\\d{4}-\\d{2}-\\d{2}$/.test(String(c.prazo_citado || '')) ? c.prazo_citado : '', irritado: c.irritado === true, motivo: c.irritado === true ? 'tom irritado' : (classe === 'serio' ? 'assunto sério (IA)' : '') } };
});
`
    },
    position: [1344, 192]
  }
});

const juntar = merge({
  version: 3.2,
  config: { name: 'Juntar', parameters: { mode: 'append' }, position: [1568, 192] }
});

const montar_evento_e_aviso = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Montar evento e aviso',
    parameters: {
      jsCode: `const NOMES = { pedido: 'Pedido de conteúdo', ajuste: 'Ajuste', status: 'Dúvida de prazo/status', material: 'Envio de material', serio: 'Assunto sério', sem_acao: 'Sem ação', indefinido: 'Não consegui classificar' };
const MAQ = ['longo', 'shorts', 'carrossel'];
const ddmm = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '';
const agora = DateTime.now().setZone('America/Recife');
const PILOTO = ['120363431906438683@g.us', '120363430027024594@g.us', '120363428715899752@g.us', '120363428941516450@g.us', '120363429011101742@g.us', '120363414189297847@g.us'];
// Teste em todos os grupos de clientes ATIVOS (Henrique, 05/11/2026): rascunho + card em todos, não só no piloto. Para parar, TODOS = false.
const TODOS = true;
const noTeste = x => PILOTO.includes(x.chat_id) || (TODOS && x.ativo === true);
const ACAO = ['pedido', 'ajuste', 'status', 'material'];
const out = [];
for (const it of $input.all()) {
  const x = it.json;
  if (x.trava) { x.classe = 'serio'; x.motivo = 'palavra: ' + x.palavra; x.resumo = x.resumo || ''; }
  const selo = (x.faixa ? x.faixa : '') + (x.foco ? ' ⭐' : '') + (x.atencao ? ' 🔴' : '');
  const trecho = String(x.textos || '').split('\\n').slice(-4).join('\\n').slice(-500).replace(/\\n/g, '\\n> ');
  let acao = '';
  if (x.classe === 'pedido') acao = 'criar card' + (x.tipo_peca && x.tipo_peca !== 'nenhum' ? ' de ' + x.tipo_peca : '') + ' no Entregas' + (x.prazo_citado ? ' com prazo ' + ddmm(x.prazo_citado) + ' (data do cliente)' : ' (cliente não deu data: prazo padrão)') + (MAQ.includes(x.tipo_peca) ? ' e mandar para a máquina se o material estiver no card' : ' para o Ismael distribuir');
  if (x.classe === 'ajuste') acao = 'achar o card da peça e abrir um card de ajuste ligado a ele';
  if (x.classe === 'status') acao = 'ler o card e a promessa do cliente e preparar a resposta de status para você aprovar';
  if (x.classe === 'material') acao = 'marcar "Cliente mandou o material" no card que esperava e preparar a confirmação de recebido';
  if (x.classe === 'serio') acao = 'parar e te avisar. Não respondo nada e não crio card';
  if (x.classe === 'indefinido') acao = 'nada (vou melhorar a leitura)';
  const rascunho = noTeste(x) && ACAO.includes(x.classe) && !x.equipe_ja_respondeu;
  let msg = '';
  if (rascunho) msg = '';
  else if (x.classe === 'serio') {
    msg = '🚨 **Assunto sério · ' + x.cliente + '**' + (selo ? ' (' + selo.trim() + ')' : '') + '\\nMotivo: ' + x.motivo + '\\n> ' + trecho + '\\n' + (x.resumo ? '📝 ' + x.resumo + '\\n' : '') + 'Não respondi nada. Fica com você.' + (x.equipe_ja_respondeu ? '\\n(A equipe já escreveu no grupo depois disso.)' : '');
  } else if (x.classe !== 'sem_acao') {
    msg = '🧪 **Modo leitura · ' + x.cliente + '**' + (selo ? ' (' + selo.trim() + ')' : '') + ' · ' + x.qtd + ' msg\\n> ' + trecho + '\\n**Classe:** ' + NOMES[x.classe] + (x.resumo ? ' · ' + x.resumo : '') + '\\n**Eu faria:** ' + acao + (x.equipe_ja_respondeu ? '\\n(A equipe já respondeu no grupo.)' : '');
  }
  out.push({ json: {
    rascunho, dados: rascunho ? x : null,
    discord: msg ? JSON.stringify({ content: msg.slice(0, 1990), allowed_mentions: { parse: [] } }) : '',
    evento: { quando: agora.toISO(), dia: agora.toISODate(), evento: x.classe === 'serio' ? 'escalado' : 'classificada', modo: noTeste(x) ? 'piloto' : 'leitura', chat_id: x.chat_id, cliente: x.cliente, classe: x.classe, qtd_msgs: x.qtd, trava_palavra: !!x.trava, ref: '', minutos: Math.max(0, Math.round(agora.diff(DateTime.fromJSDate(new Date(x.ultima)), 'minutes').minutes)) }
  } });
}
return out;
`
    },
    position: [1792, 192]
  }
});

const gravar_evento = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Gravar evento', parameters: { resource: 'row', operation: 'insert', dataTableId: { __rl: true, mode: 'id', value: 'BHqPtAKnMtZTS5Q0', cachedResultName: 'Gerente IA · eventos' }, columns: { mappingMode: 'defineBelow', value: { quando: expr('{{ $json.evento.quando }}'), dia: expr('{{ $json.evento.dia }}'), evento: expr('{{ $json.evento.evento }}'), modo: expr('{{ $json.evento.modo }}'), chat_id: expr('{{ $json.evento.chat_id }}'), cliente: expr('{{ $json.evento.cliente }}'), classe: expr('{{ $json.evento.classe }}'), qtd_msgs: expr('{{ $json.evento.qtd_msgs }}'), trava_palavra: expr('{{ $json.evento.trava_palavra }}'), ref: expr('{{ $json.evento.ref }}'), minutos: expr('{{ $json.evento.minutos }}') }, matchingColumns: [], schema: [{ id: 'quando', displayName: 'quando', type: 'dateTime', display: true }, { id: 'dia', displayName: 'dia', type: 'string', display: true }, { id: 'evento', displayName: 'evento', type: 'string', display: true }, { id: 'modo', displayName: 'modo', type: 'string', display: true }, { id: 'chat_id', displayName: 'chat_id', type: 'string', display: true }, { id: 'cliente', displayName: 'cliente', type: 'string', display: true }, { id: 'classe', displayName: 'classe', type: 'string', display: true }, { id: 'qtd_msgs', displayName: 'qtd_msgs', type: 'number', display: true }, { id: 'trava_palavra', displayName: 'trava_palavra', type: 'boolean', display: true }, { id: 'ref', displayName: 'ref', type: 'string', display: true }, { id: 'minutos', displayName: 'minutos', type: 'number', display: true }] }, options: {} }, position: [2016, 0] }
});

const tem_aviso = node({
  type: 'n8n-nodes-base.filter',
  version: 2.2,
  config: { name: 'Tem aviso?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $json.discord }}'), rightValue: '', operator: { type: 'string', operation: 'notEmpty', singleValue: true } }], combinator: 'and' } }, position: [2016, 192] }
});

const postar_no_aprova_es_gerente = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Postar no #aprovações-gerente', parameters: { method: 'POST', url: 'https://discord.com/api/v10/channels/1567643418270634136/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json', jsonBody: expr('{{ $json.discord }}'), options: { batching: { batch: { batchSize: 1, batchInterval: 1200 } } } }, credentials: { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } }, position: [2240, 192], onError: 'continueRegularOutput' }
});

const s_rascunhos = node({
  type: 'n8n-nodes-base.filter',
  version: 2.2,
  config: { name: 'Só rascunhos', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $json.rascunho }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } }, position: [2016, 384] }
});

const cards_abertos_do_cliente = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Cards abertos do cliente', parameters: { method: 'POST', url: 'https://api.notion.com/v1/databases/74b3076a325749e3bac4ba6659215e48/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendHeaders: true, headerParameters: { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] }, sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ filter: { and: [{ property: "Cliente", relation: { contains: $json.dados.cliente_id } }, { property: "Status", select: { does_not_equal: "Postado" } }, { property: "Status", select: { does_not_equal: "Cancelado" } }] }, sorts: [{ property: "Prazo", direction: "ascending" }], page_size: 25 }) }}'), options: { batching: { batch: { batchSize: 1, batchInterval: 400 } } } }, credentials: { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } }, position: [2240, 384], onError: 'continueRegularOutput' }
});

const ler_textos = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Ler textos', parameters: { resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'id', value: 'hBQ4lzOeYTTYAkyc', cachedResultName: 'Gerente IA · textos' }, returnAll: true }, position: [2464, 384], executeOnce: true }
});

const pedir_rascunho = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Pedir rascunho',
    parameters: {
      jsCode: `// Junta os cards abertos do cliente e monta o pedido de rascunho para o Claude.
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; if (v.date) return v.date.start || ''; if (v.unique_id) return (v.unique_id.prefix ? v.unique_id.prefix + '-' : '') + v.unique_id.number; return ''; };
const STATUS_CLIENTE = { 'A fazer': 'em produção', 'Fazendo': 'em produção', 'Ajustes': 'em ajuste', 'Em revisão': 'em revisão final', 'Aguardando cliente': 'esperando a aprovação do cliente', 'Aprovado': 'pronto', 'Agendado': 'agendado para postar' };
const ddmm = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '';
// O texto do prompt fica na tabela Gerente IA · textos (chave rascunho_system); vale a maior versão.
const linhasTexto = $('Ler textos').all().map(i => i.json).filter(r => r.chave === 'rascunho_system' && r.texto);
linhasTexto.sort((a, b) => (Number(b.versao) || 0) - (Number(a.versao) || 0));
const SYSTEM = (linhasTexto[0] || {}).texto;
if (!SYSTEM) throw new Error('Sem prompt rascunho_system na tabela Gerente IA · textos');
const base = $('Só rascunhos').all();
const CAL = Array.from({ length: 8 }, (_, k) => DateTime.now().setZone('America/Recife').plus({ days: k }).setLocale('pt-BR').toFormat('cccc dd/MM/yyyy')).join(', ');
return $('Cards abertos do cliente').all().map((it, i) => {
  const d = base[i].json.dados;
  const cards = (it.json.results || []).slice(0, 25).map(p => {
    const pr = p.properties || {};
    const st = txt(pr['Status']);
    return { codigo: txt(pr['Código']), titulo: txt(pr['Entrega']), tipo: txt(pr['Tipo']), status: st, status_cliente: STATUS_CLIENTE[st] || st, prazo: txt(pr['Prazo']).slice(0, 10), postar: txt(pr['Postar em']).slice(0, 10), url: p.url };
  });
  const lista = cards.length ? cards.map(c => '- ' + c.codigo + ' · ' + c.titulo + ' · ' + c.tipo + ' (' + c.status_cliente + ')' + (c.prazo ? ' · pronto até ' + ddmm(c.prazo) : '') + (c.postar ? ' · posta ' + ddmm(c.postar) : '')).join('\\n') : '(nenhum card aberto)';
  const user = 'Hoje é ' + d.hoje + ' (' + DateTime.now().setZone('America/Recife').setLocale('pt-BR').toFormat('cccc') + '). Próximos dias: ' + CAL + '.\\nCliente: ' + d.cliente + '\\nClasse já decidida: ' + d.classe + (d.tipo_peca && d.tipo_peca !== 'nenhum' ? ' (' + d.tipo_peca + ')' : '') + '\\nResumo: ' + (d.resumo || '') + (d.prazo_citado ? '\\nData citada pelo cliente: ' + d.prazo_citado : '') + '\\n\\nCards abertos do cliente:\\n' + lista + '\\n\\nConversa antes (contexto):\\n' + (d.contexto || '(sem mensagens anteriores)') + '\\n\\nMensagens novas do cliente:\\n' + d.textos;
  return { pairedItem: { item: 0 }, json: { dados: d, cards, corpo: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 700, temperature: 0.3, system: SYSTEM, messages: [{ role: 'user', content: user }] }) } };
});
`
    },
    position: [2688, 384]
  }
});

const redigir_Claude = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Redigir (Claude)', parameters: { method: 'POST', url: 'https://api.anthropic.com/v1/messages', authentication: 'predefinedCredentialType', nodeCredentialType: 'anthropicApi', sendHeaders: true, headerParameters: { parameters: [{ name: 'anthropic-version', value: '2023-06-01' }] }, sendBody: true, specifyBody: 'json', jsonBody: expr('{{ $json.corpo }}'), options: { batching: { batch: { batchSize: 1, batchInterval: 500 } }, timeout: 90000 } }, credentials: { anthropicApi: { id: 'NSAFLaAWGkUDHJLn', name: 'Anthropic account' } }, position: [2912, 384], onError: 'continueRegularOutput' }
});

const ler_rascunho = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Ler rascunho',
    parameters: {
      jsCode: `// Lê o rascunho do Claude, calcula o prazo (padrão 72h, urgente 24h, hiperurgente hoje e só com aprovação) e monta o card.
const TIPOS = ['Vídeo longo', 'Shorts', 'Carrossel', 'Thumbnail', 'Arte', 'Banner', 'Página', 'Roteiro', 'Copy', 'Blog', 'Outro'];
const ISMAEL = '3ea98c0c-dde0-812d-9cb4-c41ce70df4ae';
// Roteiro (Henrique 05/11): roteiro é sempre do Escritório (máquina de roteiros), nunca da equipe.
const ESCRITORIO = '3ea98c0c-dde0-812b-ba06-cba7e4261426';
const GERENTE = '40e98c0c-dde0-817e-b798-f6e045686b7c';
const ENTREGAS_DB = '74b3076a-3257-49e3-bac4-ba6659215e48';
const mascara = s => String(s || '').replace(/r\\$\\s*[\\d.,]+(\\s*(mil|k))?/gi, '[valor]').replace(/\\b\\d{1,3}(\\.\\d{3})+(,\\d{1,2})?\\b/g, '[valor]');
const agora = DateTime.now().setZone('America/Recife');
return $input.all().map((it, i) => {
  const base = $('Pedir rascunho').itemMatching(i).json;
  const d = base.dados;
  let r = {};
  try { const t = ((it.json.content || [])[0] || {}).text || ''; r = JSON.parse((t.match(/\\{[\\s\\S]*\\}/) || ['{}'])[0]); } catch (e) { r = {}; }
  const resposta = mascara(String(r.resposta || '').trim()).replace(/\\bcanal\\b/gi, 'ecossistema digital').slice(0, 900);
  let urg = ['padrao', 'urgente', 'hiperurgente'].includes(r.urgencia) ? r.urgencia : 'padrao';
  // Só vale urgente/hiperurgente se o cliente usou palavra de pressa (data citada sozinha não conta).
  const pressa = /urgent|hoje|amanh|agora|quanto antes|mais rapido|asap|correndo|emergen|ainda hoje/.test(String(d.textos || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase());
  if (!pressa) urg = 'padrao';
  // Prazo pela regra da diretoria; se o cliente citou data mais cedo, vale a data dele.
  let prazo = agora.plus({ hours: urg === 'urgente' ? 24 : 72 }).toISODate();
  if (urg === 'hiperurgente') prazo = agora.toISODate();
  if (d.prazo_citado && d.prazo_citado < prazo) {
    prazo = d.prazo_citado < agora.toISODate() ? agora.toISODate() : d.prazo_citado;
    if (prazo <= agora.plus({ hours: 12 }).toISODate() && urg !== 'hiperurgente') urg = prazo === agora.toISODate() ? 'hiperurgente' : 'urgente';
  }
  const precisaCard = r.criar_card === true && ['pedido', 'ajuste'].includes(d.classe);
  const c = r.card || {};
  const tipo = TIPOS.includes(c.tipo) ? c.tipo : 'Outro';
  const ligado = d.classe === 'ajuste' ? (base.cards || []).find(x => x.codigo && x.codigo === r.card_ligado) : null;
  const titulo = (d.cliente.toUpperCase() + ' | ' + (d.classe === 'ajuste' ? 'AJUSTE ' : '') + tipo.toUpperCase() + ' | ' + String(c.titulo || d.resumo || 'pedido do grupo').toUpperCase()).slice(0, 180);
  const resp_id = tipo === 'Roteiro' ? ESCRITORIO : ISMAEL;
  const resp_nome = resp_id === ESCRITORIO ? 'o Escritório' : 'o Ismael';
  const quando = DateTime.fromJSDate(new Date(d.ultima)).setZone('America/Recife').toFormat('dd/MM HH:mm');
  const obs = ('[Gerente IA ' + agora.toFormat('dd/MM HH:mm') + '] Pedido no grupo em ' + quando + ' (' + (urg === 'padrao' ? 'prazo padrão 72h' : urg) + ').\\n' + mascara(c.obs || d.resumo || '') + (ligado ? '\\nAjuste do card ' + ligado.codigo + ': ' + ligado.url : '')).slice(0, 1900);
  const props = {
    'Entrega': { title: [{ text: { content: titulo } }] },
    'Cliente': { relation: [{ id: d.cliente_id }] },
    'Tipo': { select: { name: tipo } },
    'Status': { select: { name: 'A fazer' } },
    'Prioridade': { select: { name: urg === 'padrao' ? 'Normal' : 'Urgente' } },
    'Prazo': { date: { start: prazo } },
    'Origem': { select: { name: 'Extra' } },
    'Responsável': { relation: [{ id: resp_id }] },
    '✍️ Criada por': { relation: [{ id: GERENTE }] },
    'Obs': { rich_text: [{ text: { content: obs } }] }
  };
  const q = Number(c.quantidade);
  if (q > 1 && q < 50) props['Quantidade'] = { number: q };
  const card_corpo = precisaCard ? JSON.stringify({ parent: { database_id: ENTREGAS_DB }, properties: props }) : '';
  // Fato que só a equipe sabe (acesso, bruto, entrega hoje): a mensagem espera o sim do Rômulo ou do Ismael (Henrique 05/11).
  const confirmar = mascara(String(r.confirmar || '').trim()).slice(0, 220);
  const confirmar_quem = confirmar ? (r.confirmar_quem === 'romulo' ? 'romulo' : 'ismael') : '';
  return { json: { dados: d, cards: base.cards, resposta, urgencia: urg, prazo, tipo, titulo, ok: !!resposta, confirmar, confirmar_quem, resp_nome,
    criar_agora: precisaCard && urg !== 'hiperurgente' && !!resposta, card_corpo, card_id: '', card_url: '', card_codigo: '' } };
});
`
    },
    position: [3136, 384]
  }
});

const criar_card_agora = node({
  type: 'n8n-nodes-base.if',
  version: 2.2,
  config: { name: 'Criar card agora?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $json.criar_agora }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } }, position: [3360, 384] }
});

const criar_card_no_Entregas = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Criar card no Entregas', parameters: { method: 'POST', url: 'https://api.notion.com/v1/pages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendHeaders: true, headerParameters: { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] }, sendBody: true, specifyBody: 'json', jsonBody: expr('{{ $json.card_corpo }}'), options: { batching: { batch: { batchSize: 1, batchInterval: 400 } } } }, credentials: { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } }, position: [3584, 320], onError: 'continueRegularOutput' }
});

const anexar_card = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Anexar card',
    parameters: {
      jsCode: `return $input.all().map((it, i) => {
  const b = $('Ler rascunho').itemMatching(i).json;
  const p = it.json || {};
  const u = ((p.properties || {})['Código'] || {}).unique_id;
  return { json: { ...b, card_id: p.id || '', card_url: p.url || '', card_codigo: u ? (u.prefix ? u.prefix + '-' : '') + u.number : '', card_erro: p.id ? '' : 'não consegui criar o card' } };
});
`
    },
    position: [3808, 320]
  }
});

const juntar_card = merge({
  version: 3.2,
  config: { name: 'Juntar card', parameters: { mode: 'append' }, position: [4032, 384] }
});

const montar_post = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Montar post',
    parameters: {
      jsCode: `// Monta a mensagem do rascunho no #aprovações-gerente.
const NOMES = { pedido: 'Pedido de conteúdo', ajuste: 'Ajuste', status: 'Dúvida de prazo/status', material: 'Envio de material' };
const ddmm = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '';
const URG = { padrao: 'padrão (72h)', urgente: '⚠️ urgente (24h)', hiperurgente: '⚡ HIPERURGENTE (hoje)' };
return $input.all().map(it => {
  const x = it.json; const d = x.dados;
  const selo = (d.faixa ? d.faixa : '') + (d.foco ? ' ⭐' : '') + (d.atencao ? ' 🔴' : '');
  const trecho = String(d.textos || '').split('\\n').slice(-4).join('\\n').slice(-450).replace(/\\n/g, '\\n> ');
  let linhaCard = '';
  if (x.card_url) linhaCard = '📋 Card criado: [' + (x.card_codigo || 'abrir') + '](<' + x.card_url + '>) · ' + x.tipo + ' · pronto até ' + ddmm(x.prazo) + ' · ' + URG[x.urgencia] + ' · com ' + (x.resp_nome || 'o Ismael');
  else if (x.card_corpo && x.urgencia === 'hiperurgente') linhaCard = '⚡ **Hiperurgente:** o card (' + x.tipo + ', pronto hoje) só nasce quando você enviar.';
  else if (x.card_corpo && x.card_erro) linhaCard = '⚠️ ' + x.card_erro + ' (crio de novo quando você enviar).';
  else if (d.classe === 'pedido' || d.classe === 'ajuste') linhaCard = '📋 Sem card novo (não achei peça concreta no pedido).';
  // Henrique 05/11: aprovação só pelo painel (Minha mesa › Aprovar). O Discord fica como aviso curto, sem o texto do rascunho.
  const QUEM = { romulo: 'Rômulo', ismael: 'Ismael' };
  const conf = x.confirmar ? '\\n⏳ Antes de sair, o ' + QUEM[x.confirmar_quem] + ' confirma no 1x1: ' + x.confirmar : '';
  const msg2 = '✍️ Resposta para aprovar: **' + d.cliente + '**' + (selo ? ' (' + selo.trim() + ')' : '') + ' · ' + (NOMES[d.classe] || d.classe) + (d.resumo ? ' · ' + d.resumo : '') + (x.ok ? '' : ' · ⚠️ sem rascunho') + '\\n' + (linhaCard ? linhaCard + '\\n' : '') + conf.replace(/^\\n/, '') + (conf ? '\\n' : '') + '👉 Aprove no painel: Minha mesa › Aprovar.';
  return { json: { ...x, discord: JSON.stringify({ content: msg2.slice(0, 1990), allowed_mentions: { parse: [] } }) } };
});
`
    },
    position: [4256, 384]
  }
});

const postar_rascunho = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Postar rascunho', parameters: { method: 'POST', url: 'https://discord.com/api/v10/channels/1567643418270634136/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json', jsonBody: expr('{{ $json.discord }}'), options: { batching: { batch: { batchSize: 1, batchInterval: 1200 } } } }, credentials: { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } }, position: [4480, 384], onError: 'continueRegularOutput' }
});

const preparar_registro = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Preparar registro',
    parameters: {
      jsCode: `// Junta o id da mensagem do Discord e prepara a linha do rascunho + as reações.
const linhas = []; const reacoes = []; const eventos = [];
const agora = DateTime.now().setZone('America/Recife');
$input.all().forEach((it, i) => {
  const x = $('Montar post').itemMatching(i).json; const d = x.dados;
  const m = it.json || {};
  if (!m.id) return;
  linhas.push({ chat_id: d.chat_id, cliente: d.cliente, cliente_id: d.cliente_id, classe: d.classe, urgencia: x.urgencia, ultima_cliente: d.ultima, texto: x.resposta, card_id: x.card_id || null, card_url: x.card_url || null, card_corpo: (!x.card_id && x.card_corpo) ? x.card_corpo : null, discord_msg: m.id, confirmar: x.confirmar || null, confirmar_quem: x.confirmar_quem || null });
  // Sem reações: o aviso no Discord não aprova nada (05/11).
  const base = { quando: agora.toISO(), dia: agora.toISODate(), modo: 'piloto', chat_id: d.chat_id, cliente: d.cliente, classe: d.classe, qtd_msgs: d.qtd, trava_palavra: false, minutos: Math.max(0, Math.round(agora.diff(DateTime.fromJSDate(new Date(d.ultima)), 'minutes').minutes)) };
  eventos.push({ ...base, evento: 'rascunho', ref: x.urgencia });
  if (x.card_id) eventos.push({ ...base, evento: 'demanda_criada', ref: x.card_codigo || x.card_id });
});
return [{ json: { linhas: JSON.stringify(linhas), eventos, reacoes } }];
`
    },
    position: [4704, 384]
  }
});

const guardar_rascunhos = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.6,
  config: {
    name: 'Guardar rascunhos',
    parameters: {
      operation: 'executeQuery',
      query: `ALTER TABLE gerente_rascunhos ADD COLUMN IF NOT EXISTS confirmar TEXT, ADD COLUMN IF NOT EXISTS confirmar_quem TEXT, ADD COLUMN IF NOT EXISTS confirmar_msg TEXT, ADD COLUMN IF NOT EXISTS confirmado TEXT, ADD COLUMN IF NOT EXISTS confirmar_em TIMESTAMPTZ;
INSERT INTO gerente_rascunhos (chat_id, cliente, cliente_id, classe, urgencia, ultima_cliente, texto, card_id, card_url, card_corpo, discord_msg, confirmar, confirmar_quem)
SELECT x.chat_id, x.cliente, x.cliente_id, x.classe, x.urgencia, x.ultima_cliente, x.texto, x.card_id, x.card_url, x.card_corpo, x.discord_msg, x.confirmar, x.confirmar_quem
FROM json_to_recordset($1::json) AS x(chat_id text, cliente text, cliente_id text, classe text, urgencia text, ultima_cliente timestamptz, texto text, card_id text, card_url text, card_corpo text, discord_msg text, confirmar text, confirmar_quem text)
RETURNING id;`,
      options: { queryReplacement: expr('{{ [ $json.linhas ] }}') }
    },
    credentials: { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } },
    position: [4928, 96],
    executeOnce: true
  }
});

const lista_de_rea_es = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Lista de reações', parameters: { jsCode: 'return $(\'Preparar registro\').first().json.reacoes;' }, position: [4928, 288] }
});

const p_r_e = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: { name: 'Pôr ✅ e ❌', parameters: { method: 'PUT', url: expr('https://discord.com/api/v10/channels/1567643418270634136/messages/{{ $json.msg }}/reactions/{{ $json.emoji }}/@me'), authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', options: { batching: { batch: { batchSize: 1, batchInterval: 700 } } } }, credentials: { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } }, position: [5152, 288], onError: 'continueRegularOutput' }
});

const eventos_do_piloto = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Eventos do piloto', parameters: { jsCode: 'return $(\'Preparar registro\').first().json.eventos.map(e => ({ json: { evento: e } }));' }, position: [4928, 480] }
});

const gravar_eventos_do_piloto = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Gravar eventos do piloto', parameters: { resource: 'row', operation: 'insert', dataTableId: { __rl: true, mode: 'id', value: 'BHqPtAKnMtZTS5Q0', cachedResultName: 'Gerente IA · eventos' }, columns: { mappingMode: 'defineBelow', value: { quando: expr('{{ $json.evento.quando }}'), dia: expr('{{ $json.evento.dia }}'), evento: expr('{{ $json.evento.evento }}'), modo: expr('{{ $json.evento.modo }}'), chat_id: expr('{{ $json.evento.chat_id }}'), cliente: expr('{{ $json.evento.cliente }}'), classe: expr('{{ $json.evento.classe }}'), qtd_msgs: expr('{{ $json.evento.qtd_msgs }}'), trava_palavra: expr('{{ $json.evento.trava_palavra }}'), ref: expr('{{ $json.evento.ref }}'), minutos: expr('{{ $json.evento.minutos }}') }, matchingColumns: [], schema: [{ id: 'quando', displayName: 'quando', type: 'dateTime', display: true }, { id: 'dia', displayName: 'dia', type: 'string', display: true }, { id: 'evento', displayName: 'evento', type: 'string', display: true }, { id: 'modo', displayName: 'modo', type: 'string', display: true }, { id: 'chat_id', displayName: 'chat_id', type: 'string', display: true }, { id: 'cliente', displayName: 'cliente', type: 'string', display: true }, { id: 'classe', displayName: 'classe', type: 'string', display: true }, { id: 'qtd_msgs', displayName: 'qtd_msgs', type: 'number', display: true }, { id: 'trava_palavra', displayName: 'trava_palavra', type: 'boolean', display: true }, { id: 'ref', displayName: 'ref', type: 'string', display: true }, { id: 'minutos', displayName: 'minutos', type: 'number', display: true }] }, options: {} }, position: [5152, 480] }
});

const wf = workflow('', 'Gerente IA | Ler e classificar (V2 · leitura + piloto)', { executionOrder: 'v1', availableInMCP: true });

export default wf
  .add(a_cada_2_minutos)
  .to(grupos_com_mensagem_nova
  .to([
    marcar_como_lido,
    clientes_com_grupo
    .to(separar_e_travar)
    .to(vai_para_a_IA.onTrue(classificar_Claude
      .to(ler_classifica_o)))]))
  .add(ler_classifica_o.to(juntar.input(0)))
  .add(vai_para_a_IA.output(1).to(juntar.input(1)))
  .add(anexar_card.to(juntar_card.input(0)))
  .add(criar_card_agora.output(1).to(juntar_card.input(1)))
  .add(juntar)
  .to(montar_evento_e_aviso
  .to([
    gravar_evento,
    tem_aviso
    .to(postar_no_aprova_es_gerente),
    s_rascunhos
    .to(cards_abertos_do_cliente)
    .to(ler_textos)
    .to(pedir_rascunho)
    .to(redigir_Claude)
    .to(ler_rascunho)
    .to(criar_card_agora.onTrue(criar_card_no_Entregas
      .to(anexar_card)))]))
  .add(juntar_card)
  .to(montar_post
  .to(postar_rascunho)
  .to(preparar_registro
  .to([
    guardar_rascunhos,
    lista_de_rea_es
    .to(p_r_e),
    eventos_do_piloto
    .to(gravar_eventos_do_piloto)])))