import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

// Gerente IA | Capturar promessas dos grupos (V1), 09/11/2026. Origem: caso Lucilene (promessas no grupo que nunca viraram card).
// A cada 10 min (seg–sáb, 8h–21h): lê o que a EQUIPE escreveu nos grupos de cliente (Postgres, mesma regra de "da equipe" do leitor),
// a IA separa compromissos ("o vídeo 4 sai sexta", "mando o relatório amanhã") e cada um vira linha no 🗓️ Promessas (Prometido).
// O gerador do fluxo "Painel | Promessas: gerador e vigia (V1)" cria o card; o vigia cobra antes de atrasar. Este fluxo não cria card.
// Já existe card aberto daquela entrega? A promessa liga nele (não duplica). Sem data na mensagem: prazo padrão de 3 dias, marcado na Origem.
// Dono pela "Divisão da equipe 2.0": produção/página/links → Ismael; organização/call/acesso/relatório → Rômulo; roteiro → Escritório.
// Dinheiro, contrato e jurídico não vão para a IA. Nada vai ao cliente.
const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const DISCORD = { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } };
const PG = { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } };
const ANTHROPIC = { anthropicApi: { id: 'NSAFLaAWGkUDHJLn', name: 'Anthropic account' } };
const HDR = { authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendHeaders: true, headerParameters: { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] } };
const PAG10 = { pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest', parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] }, paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.has_more }}', limitPagesFetched: true, maxRequests: 10 } } };

const relogio = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada 10 min (8h–21h)', parameters: { rule: { interval: [{ field: 'cronExpression', expression: '*/10 8-21 * * 1-6' }] } } } });

const ler = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Mensagens novas da equipe', credentials: PG, parameters: { operation: 'executeQuery', options: {},
  query: `CREATE TABLE IF NOT EXISTS gerente_promessas_lote (chat_id TEXT PRIMARY KEY, ate TIMESTAMPTZ, atualizado_em TIMESTAMPTZ DEFAULT now());
WITH team AS (
  SELECT DISTINCT m.autor_jid FROM mensagens m
  WHERE m.chat_id IN (SELECT chat_id FROM chats WHERE nome ILIKE '%pend%ncias%') AND NOT m.from_me AND m.autor_jid IS NOT NULL
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
  WHERE chat_id LIKE '%@g.us' AND enviado_em > now() - interval '3 days'
  GROUP BY msg_id
),
novas AS (
  SELECT m.chat_id, max(m.enviado_em) AS ate,
    string_agg(to_char(m.enviado_em AT TIME ZONE 'America/Recife','DD/MM HH24:MI') || ' Euforia: ' || left(m.texto, 800), E'\\n' ORDER BY m.enviado_em) AS textos,
    min(m.enviado_em) AS primeira
  FROM msgs m LEFT JOIN gerente_promessas_lote g ON g.chat_id = m.chat_id
  WHERE m.da_equipe AND COALESCE(m.texto,'') <> ''
    AND m.tipo NOT IN ('reactionMessage','stickerMessage','protocolMessage','pollUpdateMessage')
    AND m.enviado_em > COALESCE(g.ate, now() - interval '30 minutes')
    AND m.enviado_em < now() - interval '2 minutes'
  GROUP BY m.chat_id
)
SELECT n.chat_id, n.ate, n.textos,
  COALESCE((SELECT c.nome FROM chats c WHERE c.chat_id = n.chat_id AND c.nome IS NOT NULL LIMIT 1), n.chat_id) AS grupo,
  (SELECT string_agg(to_char(x.enviado_em AT TIME ZONE 'America/Recife','DD/MM HH24:MI') || ' ' ||
      CASE WHEN x.da_equipe THEN 'Euforia' ELSE COALESCE(x.autor_nome,'Cliente') END || ': ' || left(COALESCE(x.texto,'['||x.tipo||']'),300), E'\\n' ORDER BY x.enviado_em)
     FROM (SELECT * FROM msgs y WHERE y.chat_id = n.chat_id AND y.enviado_em < n.primeira AND y.tipo NOT IN ('reactionMessage','protocolMessage') ORDER BY y.enviado_em DESC LIMIT 6) x) AS contexto
FROM novas n
WHERE n.chat_id NOT IN (SELECT chat_id FROM internos)
  AND EXISTS (SELECT 1 FROM chats c WHERE c.chat_id = n.chat_id AND c.origem LIKE 'suporte%')
ORDER BY n.ate
LIMIT 20;` } } });

// Marca já o ponto lido de cada grupo (mesmo os que não tiverem promessa), para nunca ler duas vezes.
const marcar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Marcar lido', credentials: PG, executeOnce: true, alwaysOutputData: true, parameters: { operation: 'executeQuery',
  query: `INSERT INTO gerente_promessas_lote (chat_id, ate, atualizado_em)
SELECT x.chat_id, x.ate, now() FROM json_to_recordset($1::json) AS x(chat_id text, ate timestamptz)
ON CONFLICT (chat_id) DO UPDATE SET ate = GREATEST(gerente_promessas_lote.ate, EXCLUDED.ate), atualizado_em = now()`,
  options: { queryReplacement: '={{ [ JSON.stringify($(\'Mensagens novas da equipe\').all().filter(i => i.json.chat_id).map(i => ({ chat_id: i.json.chat_id, ate: i.json.ate }))) ] }}' } } } });

const clientes = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Clientes com grupo', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/3ddc91b406be49e98e630c298d9162d8/query', ...HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { and: [{ property: "Situação", select: { does_not_equal: "Encerrado" } }, { property: "Grupo WhatsApp (ID)", rich_text: { is_not_empty: true } }] }, page_size: 100 }) }}', options: PAG10 } } });
const abertos = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Cards abertos', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/74b3076a325749e3bac4ba6659215e48/query', ...HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { and: [{ property: "Status", select: { does_not_equal: "Postado" } }, { property: "Status", select: { does_not_equal: "Feito" } }] }, sorts: [{ timestamp: "created_time", direction: "descending" }], page_size: 100 }) }}', options: PAG10 } } });
const promessas = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Promessas em aberto', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/824c669471e5424d8c846936a63c16d4/query', ...HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { or: ["Prometido", "Com card", "Em risco", "Atrasado"].map(s => ({ property: "Status", select: { equals: s } })) }, page_size: 100 }) }}', options: PAG10 } } });

// Instrução da IA (fica dentro do nó Separar, que monta o pedido inteiro).
const SYSTEM = "Você lê mensagens que a equipe do Grupo Euforia (empresa de mídia: YouTube, Instagram, vídeos, shorts, carrosséis, páginas) escreveu no grupo de WhatsApp de um cliente. Sua tarefa: achar só os COMPROMISSOS que a equipe assumiu com o cliente, ou seja, algo que a equipe disse que VAI entregar ou fazer. NÃO conte: pedido ao cliente (\"nos mande o bruto\"), resposta genérica (\"estamos vendo\", \"vamos verificar\", \"já já te respondo\"), algo já feito (\"segue o vídeo\", \"postado\"), saudação, agradecimento, aviso de reunião já marcada pelo cliente. Responda SÓ com JSON, sem texto fora dele, no formato: {\"promessas\":[{\"marco\":\"curto, como o cliente leria, ex.: Vídeo 4 no ar, Relatório de outubro, Ajuste na thumb do vídeo 2\", \"tipo\":\"um de: Vídeo longo, Shorts, Carrossel, Thumbnail, Página, Arte, Organização (Drive/canal), Descrições e links, Roteiro, Call, Acesso/Setup, Relatório, Outro\", \"quando\":\"AAAA-MM-DD ou null se a equipe não disse quando\", \"hora\":\"HH:MM ou null\", \"depende_cliente\": true só se a entrega espera o cliente mandar, gravar ou aprovar antes, senão false, \"card\":\"id do card aberto que é essa mesma entrega, ou null\", \"trecho\":\"a frase exata da equipe\"}]}. Datas relativas: calcule pela data da mensagem (hoje, amanhã, sexta = a próxima sexta, fim do dia = a mesma data, essa semana = sexta desta semana, semana que vem = segunda da próxima). Uma entrega por item; várias peças iguais com a mesma data podem ser um item só (ex.: 3 shorts do vídeo 4). Nada encontrado: {\"promessas\":[]}.";

const separar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Separar', parameters: { jsCode: 'const SYSTEM = ' + JSON.stringify(SYSTEM) + ';\n' + `const Z = 'America/Recife';
const agora = DateTime.now().setZone(Z);
const sem = id => String(id || '').replace(/-/g, '');
const norm = s => String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; if (v.date) return v.date.start || ''; if (v.formula) return String(v.formula.string || ''); return ''; };
const rel = v => ((v || {}).relation || []).map(r => sem(r.id));
const cli = {};
for (const it of $('Clientes com grupo').all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {}; const g = txt(pr['Grupo WhatsApp (ID)']).trim();
  if (g) cli[g] = { id: sem(p.id), nome: txt(pr['Cliente']) };
}
const cards = {};
for (const it of $('Cards abertos').all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {};
  for (const c of rel(pr['Cliente'])) (cards[c] = cards[c] || []).push(sem(p.id) + ' | ' + txt(pr['Entrega']).slice(0, 90) + ' | ' + txt(pr['Status']) + ' | prazo ' + (txt(pr['Prazo']) || '-').slice(0, 10));
}
// Só vai para a IA quem tem cara de compromisso. Dinheiro, contrato e jurídico ficam de fora.
const PISTA = /\\b(hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo|semana|dia \\d|\\d{1,2}\\/\\d{1,2}|ate (o|a|as|amanha|hoje|sexta)|prazo|vou|vamos|iremos|enviaremos|mandaremos|entregaremos|postaremos|subiremos|faremos|fica pronto|ficara pronto|ficam prontos|sai (hoje|amanha|ate|na|no)|logo mais|daqui a|previsao|programad|agendad)/;
const TRAVA = /r\\$|\\bpix\\b|boleto|pagament|cobranc|fatura|nota fiscal|reembols|parcela|mensalidade|contrato|cancelament|rescis|distrato|advogad|procon|reclame ?aqui|processo judicial|juridic/;
const BOT = /ja estamos vendo isso para voce/;
const out = [];
for (const it of $('Mensagens novas da equipe').all()) {
  const r = it.json; if (!r.chat_id) continue;
  const c = cli[r.chat_id]; if (!c) continue;
  const linhas = String(r.textos || '').split(String.fromCharCode(10)).filter(l => { const n = norm(l); return PISTA.test(n) && !TRAVA.test(n) && !BOT.test(n); });
  if (!linhas.length) continue;
  const lista = (cards[c.id] || []).slice(0, 25);
  const user = 'Agora: ' + agora.setLocale('pt-BR').toFormat("cccc dd/MM/yyyy HH:mm") + ' (Recife).' + String.fromCharCode(10) +
    'Cliente: ' + c.nome + String.fromCharCode(10) + String.fromCharCode(10) +
    'Cards abertos deste cliente (id | título | status | prazo):' + String.fromCharCode(10) + (lista.join(String.fromCharCode(10)) || '(nenhum)') + String.fromCharCode(10) + String.fromCharCode(10) +
    'Conversa antes (contexto):' + String.fromCharCode(10) + String(r.contexto || '(nada)').slice(0, 2000) + String.fromCharCode(10) + String.fromCharCode(10) +
    'Mensagens NOVAS da equipe (procure compromissos só aqui):' + String.fromCharCode(10) + linhas.join(String.fromCharCode(10)).slice(0, 3000);
  const req = JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 900, temperature: 0, system: SYSTEM, messages: [{ role: 'user', content: user }] });
  out.push({ json: { chat_id: r.chat_id, grupo: r.grupo, cliente: c.nome, cliente_id: c.id, cards: lista.map(l => l.split(' | ')[0]), linhas, req } });
}
return out;
` } } });

const ia = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Achar promessas (Claude)', credentials: ANTHROPIC, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://api.anthropic.com/v1/messages', authentication: 'predefinedCredentialType', nodeCredentialType: 'anthropicApi',
  sendHeaders: true, headerParameters: { parameters: [{ name: 'anthropic-version', value: '2023-06-01' }] }, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ $json.req }}',
  options: { batching: { batch: { batchSize: 1, batchInterval: 500 } } } } } });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar promessas', parameters: { jsCode: `const Z = 'America/Recife';
const agora = DateTime.now().setZone(Z), hoje = agora.toISODate();
const sem = id => String(id || '').replace(/-/g, '');
const norm = s => String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; if (v.date) return v.date.start || ''; return ''; };
const rel = v => ((v || {}).relation || []).map(r => sem(r.id));
// Dono pela Divisão da equipe 2.0.
const ROMULO = '3ea98c0cdde081299709cf901fac7275', ISMAEL = '3ea98c0cdde0812d9cb4c41ce70df4ae', ESCRITORIO = '3ea98c0cdde0812bba06cba7e4261426';
const DONO = { 'Vídeo longo': ISMAEL, 'Shorts': ISMAEL, 'Carrossel': ISMAEL, 'Thumbnail': ISMAEL, 'Arte': ISMAEL, 'Página': ISMAEL, 'Descrições e links': ISMAEL,
  'Organização (Drive/canal)': ROMULO, 'Call': ROMULO, 'Acesso/Setup': ROMULO, 'Relatório': ROMULO, 'Outro': ROMULO, 'Roteiro': ESCRITORIO };
const TIPO_OK = ['Vídeo longo', 'Shorts', 'Carrossel', 'Thumbnail', 'Página', 'Arte', 'Organização (Drive/canal)', 'Descrições e links', 'Aprovação do cliente', 'Outro'];
// Promessas já abertas: não repetir o mesmo card nem o mesmo marco na mesma data.
const ja = new Set();
for (const it of $('Promessas em aberto').all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {}; const c = rel(pr['Cliente'])[0] || '';
  rel(pr['Card']).forEach(k => ja.add('card:' + k));
  ja.add('m:' + c + ':' + norm(txt(pr['Marco'])) + ':' + txt(pr['Quando']).slice(0, 10));
}
// Responsável do card, quando a promessa liga num card que já existe.
const respCard = {};
for (const it of $('Cards abertos').all()) for (const p of (it.json.results || [])) respCard[sem(p.id)] = rel((p.properties || {})['Responsável']);
const util = (d, n) => { let x = d; let k = 0; while (k < n) { x = x.plus({ days: 1 }); if (x.weekday < 6) k++; } return x; };
const base = $('Separar').all();
const out = [];
$input.all().forEach((it, i) => {
  const b = (base[i] || {}).json; if (!b) return;
  const t = ((it.json.content || [])[0] || {}).text || '';
  let lista = [];
  try { lista = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)).promessas || []; } catch (e) { return; }
  for (const p of lista.slice(0, 6)) {
    const marco = String(p.marco || '').trim().slice(0, 120); if (!marco) continue;
    const tipoIA = String(p.tipo || 'Outro');
    let quando = /^\\d{4}-\\d{2}-\\d{2}$/.test(String(p.quando || '')) ? p.quando : '';
    let padrao = false;
    if (!quando) { quando = util(agora, 3).toISODate(); padrao = true; }
    if (quando < hoje) continue;
    const hora = /^\\d{2}:\\d{2}$/.test(String(p.hora || '')) ? p.hora : '';
    const card = b.cards.includes(sem(p.card)) ? sem(p.card) : '';
    if (card && ja.has('card:' + card)) continue;
    const chave = 'm:' + b.cliente_id + ':' + norm(marco) + ':' + quando;
    if (ja.has(chave)) continue; ja.add(chave); if (card) ja.add('card:' + card);
    const depende = p.depende_cliente === true;
    const tipo = TIPO_OK.includes(tipoIA) ? tipoIA : (depende && tipoIA === 'Outro' ? 'Aprovação do cliente' : 'Outro');
    const resp = card && (respCard[card] || []).length ? respCard[card] : [DONO[tipoIA] || ROMULO];
    const origem = 'Grupo WhatsApp, ' + agora.toFormat('dd/MM HH:mm') + ' (captura automática): "' + String(p.trecho || '').slice(0, 300) + '"' +
      (padrao ? ' · sem data na mensagem: prazo padrão de 3 dias úteis, confirme com o cliente' : '') + (tipoIA !== tipo ? ' · tipo: ' + tipoIA : '');
    const props = {
      'Marco': { title: [{ text: { content: marco } }] },
      'Quando': { date: { start: hora ? quando + 'T' + hora + ':00.000-03:00' : quando } },
      'Status': { select: { name: card ? 'Com card' : 'Prometido' } },
      'Tipo': { select: { name: tipo } },
      'Cliente': { relation: [{ id: b.cliente_id }] },
      'Responsável': { relation: resp.map(id => ({ id })) },
      'Origem': { rich_text: [{ text: { content: origem.slice(0, 1900) } }] },
      'Depende do cliente': { checkbox: depende }
    };
    if (card) props['Card'] = { relation: [{ id: card }] };
    out.push({ json: { corpo: JSON.stringify({ parent: { database_id: '824c669471e5424d8c846936a63c16d4' }, properties: props }),
      cliente: b.cliente, marco, quando, hora, padrao, card, tipo: tipoIA, resp, depende, trecho: String(p.trecho || '').slice(0, 200) } });
  }
});
return out;
` } } });

const criar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Criar no 🗓️ Promessas', credentials: NOTION, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/pages', ...HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}',
  options: { batching: { batch: { batchSize: 1, batchInterval: 400 } } } } } });

// Aviso no 1x1 do dono: o que foi registrado em nome dele. Sem nada para o cliente.
const avisos = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Avisos', parameters: { jsCode: `const NL = String.fromCharCode(10);
const P = {
  '3ea98c0cdde081299709cf901fac7275': { user: '1490768736876237082', canal: '1556650881921978511' },
  '3ea98c0cdde0812d9cb4c41ce70df4ae': { user: '1410287139169763471', canal: '1556650886678454403' },
  '3ea98c0cdde08182a952f3d9a5b73575': { user: '1142062975071551528', canal: '1556650891732459620' },
  '3ea98c0cdde08163bd16f0213b098cb5': { user: '827882215185973279', canal: '1556650896962879518' },
  '3ea98c0cdde0817e87aee637a96d4fd1': { user: '1470387767337816128', canal: '1556650902448771104' }
};
const base = $('Montar promessas').all();
const por = {};
$input.all().forEach((it, i) => {
  if (!it.json.id) return; // não criou
  const b = (base[i] || {}).json; if (!b) return;
  const dia = b.quando.slice(8, 10) + '/' + b.quando.slice(5, 7) + (b.hora ? ' ' + b.hora : '');
  const l = '• **' + b.cliente + '** · ' + b.marco + ' · ' + dia + (b.padrao ? ' (sem data na mensagem, prazo padrão)' : '') + (b.card ? ' · ligada no card que já existia' : ' · o card nasce na próxima hora') + (b.depende ? ' · depende do cliente' : '') + NL + '  > ' + b.trecho.replace(/\\s+/g, ' ') + NL;
  for (const r of b.resp) if (P[r]) (por[r] = por[r] || []).push(l);
});
const out = [];
for (const r of Object.keys(por)) {
  let t = '🗓️ <@' + P[r].user + '> **Promessa feita no grupo, registrada no seu nome**' + NL;
  for (const l of por[r]) { if ((t + l).length > 1850) { out.push({ canal: P[r].canal, corpo: JSON.stringify({ content: t, allowed_mentions: { users: [P[r].user] } }) }); t = ''; } t += l; }
  t += NL + 'Errado (não foi promessa, dono ou data errada)? Corrija ou cancele a linha no 🗓️ Promessas.';
  out.push({ canal: P[r].canal, corpo: JSON.stringify({ content: t, allowed_mentions: { users: [P[r].user] } }) });
}
return out.map(m => ({ json: m }));
` } } });

const enviar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Mandar no Discord', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: '=https://discord.com/api/v10/channels/{{ $json.canal }}/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}', options: { batching: { batch: { batchSize: 1, batchInterval: 1200 } } } } } });

const nota = sticky('## Gerente IA · Capturar promessas dos grupos (V1)\nA cada 10 min, seg–sáb 8h–21h. Lê o que a equipe escreveu nos grupos de cliente desde a última leitura (tabela gerente_promessas_lote), a IA separa compromissos e cada um vira linha "Prometido" no 🗓️ Promessas (ou "Com card" se já havia card). O card nasce no gerador do fluxo de Promessas. Dono pela Divisão da equipe 2.0. Avisa o dono no 1x1. Não manda nada ao cliente.', [], { color: 5 });

export default workflow('gerente-capturar-promessas', 'Gerente IA | Capturar promessas dos grupos (V1)')
  .add(relogio).to(ler).to(marcar).to(clientes).to(abertos).to(promessas).to(separar).to(ia).to(montar).to(criar).to(avisos).to(enviar)
  .add(nota);
