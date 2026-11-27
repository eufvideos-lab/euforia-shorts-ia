import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

// Trava 🔴 (Henrique 27/11, caso Maíra Trajano): card de cliente com "🔴 Atenção redobrada" parado mais de 24h em "A fazer"
// no banco Entregas vira alerta na diretoria (#avisos-flau). Lê a cópia notion_cache; não muda nada no Notion nem fala com cliente.
const PG = { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } };
const DISCORD = { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } };

const hora = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'De hora em hora (seg–sáb)', position: [0, 0],
  parameters: { rule: { interval: [{ field: 'cronExpression', expression: '15 8-19 * * 1-6' }] } } } });

const ler = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Cards 🔴 em A fazer (cópia)', position: [224, 0], credentials: PG, executeOnce: true, alwaysOutputData: true,
  parameters: { operation: 'executeQuery', options: {}, query: `CREATE TABLE IF NOT EXISTS trava_vermelho (card_id TEXT PRIMARY KEY, desde TIMESTAMPTZ NOT NULL, avisado_em TIMESTAMPTZ, vezes INT NOT NULL DEFAULT 0);
SELECT s.idade, q.* FROM (SELECT extract(epoch FROM now() - min(ultima_sync))::int AS idade FROM notion_cache_estado WHERE db IN ('entregas', 'clientes')) s
LEFT JOIN (SELECT e.id, e.props, e.editado, c.id AS cliente_id,
  (SELECT coalesce(string_agg(x->>'plain_text', ''), '') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.props->'Cliente'->'title') = 'array' THEN c.props->'Cliente'->'title' ELSE '[]'::jsonb END) x) AS cliente
FROM notion_cache e
JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(e.props->'Cliente'->'relation') = 'array' THEN e.props->'Cliente'->'relation' ELSE '[]'::jsonb END) r ON true
JOIN notion_cache c ON c.db = 'clientes' AND c.id = replace(r->>'id', '-', '') AND NOT c.arquivado AND coalesce((c.props->'🔴 Atenção redobrada'->>'checkbox')::boolean, false)
WHERE e.db = 'entregas' AND NOT e.arquivado AND coalesce(e.props->'Status'->'select'->>'name', e.props->'Status'->'status'->>'name', '') = 'A fazer') q ON true;` } } });

const juntar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Juntar cards', position: [448, 0], parameters: { jsCode: `// Cópia com mais de 15 min = não confia (não apaga o histórico de "desde" nem avisa).
const linhas = $input.all().map(i => i.json).filter(j => j && j.id);
const idade = Number(($input.first().json || {}).idade == null ? 99999 : $input.first().json.idade);
const vistos = {};
for (const l of linhas) vistos[l.id] = { id: l.id, editado: l.editado };
return [{ json: { idade, confiavel: idade <= 900, cards: JSON.stringify(Object.values(vistos)) } }];
` } } });

const marcar = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Desde quando em A fazer', position: [672, 0], credentials: PG, executeOnce: true, alwaysOutputData: true,
  parameters: { operation: 'executeQuery', options: { queryReplacement: '={{ [ $json.confiavel ? $json.cards : "null" ] }}' },
    // "desde" = primeira vez que a trava viu o card em A fazer. Na 1ª vez usa a última edição do card (nunca exagera o tempo parado).
    // Card que saiu de A fazer sai da tabela; se voltar, conta de novo. Cópia velha ("null") não mexe em nada.
    query: `DELETE FROM trava_vermelho t WHERE $1 <> 'null' AND NOT EXISTS (SELECT 1 FROM json_array_elements(CASE WHEN $1 = 'null' THEN '[]' ELSE $1 END::json) x WHERE x->>'id' = t.card_id);
INSERT INTO trava_vermelho (card_id, desde) SELECT x->>'id', least(now(), coalesce((x->>'editado')::timestamptz, now())) FROM json_array_elements(CASE WHEN $1 = 'null' THEN '[]' ELSE $1 END::json) x ON CONFLICT (card_id) DO NOTHING;
SELECT card_id, desde, avisado_em, vezes FROM trava_vermelho;` } } });

const decidir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Decidir alerta', position: [896, 0], parameters: { jsCode: `// TESTE = true: monta a mensagem mas não manda nem marca como avisado. Ligar só com o OK do Henrique.
const TESTE = true;
const HORAS = 24;            // parado mais que isso em A fazer = alerta
const FOLGA_DIAS = 2;        // card planejado para longe (prazo depois de hoje + 2 dias) não é "parado": é fila futura
const HORA_RESUMO = 8;       // card já avisado e ainda parado volta só no resumo das 8h15 (1 vez por dia); nas outras horas, só card novo
const NL = String.fromCharCode(10);
const agora = DateTime.now().setZone('America/Recife');
const hoje = agora.toISODate(), limite = agora.plus({ days: FOLGA_DIAS }).toISODate();
const noHorario = agora.weekday <= 6 && agora.hour >= 8 && agora.hour < 20;
const j = $('Juntar cards').first().json;
if (!j.confiavel) return [{ json: { teste: TESTE, enviar: false, motivo: 'cópia do Notion atrasada (' + j.idade + 's)', preview: '' } }];
const NOMES = { '3ea98c0cdde081299709cf901fac7275': 'Rômulo', '3ea98c0cdde0812d9cb4c41ce70df4ae': 'Ismael', '3ea98c0cdde08163bd16f0213b098cb5': 'Lorena',
  '3ea98c0cdde0817e87aee637a96d4fd1': 'Daniel', '3ea98c0cdde0812bba06cba7e4261426': 'Escritório' };
const sem = s => String(s || '').replace(/-/g, '');
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; if (v.date) return v.date.start || ''; if (v.unique_id) return (v.unique_id.prefix ? v.unique_id.prefix + '-' : '') + v.unique_id.number; return ''; };
const tab = {};
for (const it of $('Desde quando em A fazer').all()) if (it.json && it.json.card_id) tab[it.json.card_id] = it.json;
const dur = h => h >= 48 ? Math.floor(h / 24) + ' dias' : h >= 24 ? '1 dia' : Math.floor(h) + 'h';
const vistos = new Set(), lista = [];
for (const it of $('Cards 🔴 em A fazer (cópia)').all()) {
  const l = it.json; if (!l || !l.id || vistos.has(l.id)) continue; vistos.add(l.id);
  const pr = l.props || {};
  const titulo = txt(pr['Entrega']);
  if (/^TESTE/i.test(titulo) || /^TESTE/i.test(l.cliente || '')) continue;
  const prazo = txt(pr['Prazo']).slice(0, 10);
  if (prazo && prazo > limite) continue;
  const t = tab[l.id]; if (!t) continue;
  const horas = agora.diff(DateTime.fromJSDate(new Date(t.desde)), 'hours').hours;
  if (horas < HORAS) continue;
  if (t.avisado_em && (agora.hour !== HORA_RESUMO || agora.diff(DateTime.fromJSDate(new Date(t.avisado_em)), 'hours').hours < 20)) continue;
  const resp = ((pr['Responsável'] || {}).relation || []).map(x => NOMES[sem(x.id)] || 'outro').join(' + ') || 'sem responsável';
  lista.push({ id: l.id, cliente: l.cliente || 'cliente', horas, codigo: txt(pr['Código']), titulo, resp, prazo, vencido: !!prazo && prazo < hoje });
}
if (!lista.length) return [{ json: { teste: TESTE, enviar: false, motivo: 'nada parado', preview: '' } }];
// Uma linha por cliente (mais parado primeiro), com os 3 cards mais antigos.
const porCli = {};
for (const x of lista) (porCli[x.cliente] = porCli[x.cliente] || []).push(x);
const grupos = Object.entries(porCli).map(([cli, cs]) => ({ cli, cs: cs.sort((a, b) => b.horas - a.horas) })).sort((a, b) => b.cs[0].horas - a.cs[0].horas);
const linhaCard = x => '   - ' + (x.codigo || 'card') + ' ' + x.titulo.replace(/^[^|]*\\|\\s*/, '').slice(0, 55) + ' · há ' + dur(x.horas) + ' · ' + x.resp +
  (x.prazo ? ' · prazo ' + DateTime.fromISO(x.prazo).toFormat('dd/MM') + (x.vencido ? ' ⚠️' : '') : '') + ' <https://www.notion.so/' + x.id + '>';
// Muitos clientes: uma linha só por cliente (detalhe no painel).
const compacto = grupos.length > 5;
const blocos = compacto ? grupos.map(g => '• **' + g.cli + '**: ' + g.cs.length + (g.cs.filter(x => x.vencido).length ? ' (' + g.cs.filter(x => x.vencido).length + ' vencidos)' : '') + ', mais antigo há ' + dur(g.cs[0].horas)) : grupos.map(g => '• **' + g.cli + '**: ' + g.cs.length + ' card' + (g.cs.length > 1 ? 's' : '') + ' parado' + (g.cs.length > 1 ? 's' : '') +
  (g.cs.filter(x => x.vencido).length ? ' (' + g.cs.filter(x => x.vencido).length + ' com prazo vencido)' : '') + NL + g.cs.slice(0, 3).map(linhaCard).join(NL) + (g.cs.length > 3 ? NL + '   - e mais ' + (g.cs.length - 3) : ''));
let content = '🔴 **' + (agora.hour === HORA_RESUMO ? 'Resumo do dia: c' : 'C') + 'liente em atenção com card parado em "A fazer" há mais de 24h** (' + lista.length + ' card' + (lista.length > 1 ? 's' : '') + ', ' + grupos.length + ' cliente' + (grupos.length > 1 ? 's' : '') + ')' + NL;
const fim = NL + 'Ninguém pegou ainda. Defina quem faz e quando, ou mude o prazo/etapa do card.';
let cabem = 0;
for (const b of blocos) { if ((content + b + NL + fim).length > 1850) break; content += b + NL; cabem++; }
if (cabem < blocos.length) content += '• e mais ' + (blocos.length - cabem) + ' cliente(s) no painel' + NL;
content = (content + fim).slice(0, 1990);
return [{ json: { teste: TESTE, enviar: !TESTE && noHorario, motivo: TESTE ? 'modo teste' : (noHorario ? '' : 'fora do horário'), preview: content, total: lista.length,
  resumo: grupos.map(g => g.cli + ': ' + g.cs.length).join(' | '), ids: JSON.stringify(lista.map(x => x.id)),
  corpo: JSON.stringify({ content, allowed_mentions: { parse: [] } }) } }];
` } } });

const filtrar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Só se for mandar', position: [1120, 0], parameters: { jsCode: 'return $input.all().filter(i => i.json.enviar);' } } });

const mandar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Alertar no #avisos-flau', position: [1344, 0], credentials: DISCORD, onError: 'continueRegularOutput',
  parameters: { method: 'POST', url: 'https://discord.com/api/v10/channels/1554860447910330439/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
    sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}', options: {} } } });

const avisado = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Marcar avisado', position: [1568, 0], credentials: PG, executeOnce: true,
  parameters: { operation: 'executeQuery', options: { queryReplacement: '={{ [ $("Decidir alerta").first().json.ids ] }}' },
    query: 'UPDATE trava_vermelho SET avisado_em = now(), vezes = vezes + 1 WHERE card_id IN (SELECT json_array_elements_text($1::json));' } } });

const nota = sticky('## Gerente IA · Trava 🔴 card parado (V1, 27/11, caso Maíra)\nDe hora em hora (8:15–19:15, seg–sáb, hora de Recife) lê a cópia notion_cache.\nCard do Entregas em **A fazer** de cliente com **🔴 Atenção redobrada** há mais de **24h** (e prazo até hoje + 2 dias, ou sem prazo) → alerta no **#avisos-flau** (um aviso só por rodada, lista todos). Card novo avisa na hora; o que continuar parado volta no resumo das 8h15.\n"Desde" = primeira vez que a trava viu o card em A fazer (tabela trava_vermelho; na 1ª vez, a última edição do card). Saiu de A fazer, zera.\nNão mexe no Notion nem fala com cliente. TESTE = true no nó Decidir alerta só monta a mensagem.', [], { position: [0, 220], width: 900, height: 220, color: 3 });

export default workflow('gerente-trava-vermelho', 'Gerente IA | Trava 🔴 card parado em A fazer (V1)', { executionOrder: 'v1', availableInMCP: true, timezone: 'America/Recife' })
  .add(hora).to(ler).to(juntar).to(marcar).to(decidir).to(filtrar).to(mandar).to(avisado)
  .add(nota);
