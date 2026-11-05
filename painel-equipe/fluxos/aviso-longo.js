import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

// Quando a equipe marca Programado/Postado num horário de VÍDEO LONGO (YouTube: Vídeo padrão, Podcast ou Corte horizontal) na Grade do painel,
// a Érica avisa o grupo do cliente. Uma vez por vídeo (horário + data). Espera 10 min (dá tempo de desmarcar engano). Silêncio 22h–7h.
// MODO: 'primeiro' = avisa no 1º botão marcado (Programado → "agendado"; direto Postado → "no ar"); 'agendado'; 'postado'; 'ambos'.
// (MODO e CLIENTES ficam dentro dos nós de código)
// Começa só com a BM Vagas (Betânia Machado), pedido do Henrique 05/11. Lista vazia = todos os clientes.
const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };
const MARCAS = { __rl: true, mode: 'id', value: 'eyJ8FrBneYnl3Htu', cachedResultName: 'Painel · grade marcações' };
const AVISOS = { __rl: true, mode: 'id', value: 'v2wTf3MIyNe019si', cachedResultName: 'Grade · avisos ao cliente' };

const relogio = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'A cada 5 minutos', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } } } });

const marcas = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Marcações recentes', executeOnce: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: MARCAS, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'dia', condition: 'gte', keyValue: "={{ $now.setZone('America/Recife').minus({ days: 1 }).toISODate() }}" }] }, returnAll: true } } });

const avisados = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Avisos já mandados', executeOnce: true, alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: AVISOS, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'dia', condition: 'gte', keyValue: "={{ $now.setZone('America/Recife').minus({ days: 3 }).toISODate() }}" }] }, returnAll: true } } });

const candidatos = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Candidatos', parameters: { jsCode: `const Z = 'America/Recife';
const MODO = 'primeiro'; // ver topo do arquivo
const DESDE = DateTime.fromISO('2026-11-05T23:59', { zone: 'America/Recife' }); // só marcações feitas depois de ligar (atualizar ao publicar)
const agora = DateTime.now().setZone(Z);
if (agora.hour >= 22 || agora.hour < 7) return [];
const feitos = {};
for (const it of $('Avisos já mandados').all()) { const a = it.json || {}; if (a.chave && a.ok) (feitos[a.chave] = feitos[a.chave] || []).push(a.tipo); }
const out = [];
for (const it of $('Marcações recentes').all()) {
  const m = it.json || {};
  if (!m.chave || !m.slot || !['programado', 'postado'].includes(m.status)) continue;
  // "quando" = dd/MM HH:mm (Recife). Só marcações das últimas 24h e com mais de 10 min (tempo de desmarcar engano).
  let q = DateTime.fromFormat(String(m.quando || '') + ' ' + agora.year, 'dd/MM HH:mm yyyy', { zone: Z });
  if (q.isValid && q > agora.plus({ days: 1 })) q = q.minus({ years: 1 });
  const min = q.isValid ? agora.diff(q, 'minutes').minutes : -1;
  if (min < 10 || min > 24 * 60 || q < DESDE) continue;
  const tipo = m.status === 'programado' ? 'agendado' : 'postado';
  const ja = feitos[m.chave] || [];
  if (MODO === 'primeiro' && ja.length) continue;
  if (MODO === 'agendado' && (tipo !== 'agendado' || ja.length)) continue;
  if (MODO === 'postado' && (tipo !== 'postado' || ja.length)) continue;
  if (MODO === 'ambos' && ja.includes(tipo)) continue;
  out.push({ json: { chave: m.chave, slot: m.slot, dia: m.dia, tipo } });
}
return out;
` } } });

const horario = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Horário da grade', credentials: NOTION, onError: 'continueRegularOutput', parameters: {
  method: 'GET', url: '=https://api.notion.com/v1/pages/{{ $json.slot }}', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, options: { batching: { batch: { batchSize: 1, batchInterval: 400 } } } } } });

const cliente = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Ficha do cliente', credentials: NOTION, onError: 'continueRegularOutput', parameters: {
  method: 'GET', url: "=https://api.notion.com/v1/pages/{{ ((($json.properties || {})['Cliente'] || {}).relation || [])[0]?.id || '00000000000000000000000000000000' }}",
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendHeaders: true, headerParameters: NOTION_HDR, options: { batching: { batch: { batchSize: 1, batchInterval: 400 } } } } } });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar aviso', parameters: { jsCode: `const Z = 'America/Recife';
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; return ''; };
const sem = v => String(v || '').replace(/-/g, '');
const hoje = DateTime.now().setZone(Z).startOf('day');
const CLIENTES = ['3ea98c0cdde081a6b070c0c5d748a41c']; // BM Vagas; vazio = todos
const ASS = '\\n\\n*Érica, time de suporte, Grupo Euforia*';
return $input.all().map((it, i) => {
  const c = $('Candidatos').itemMatching(i).json;
  const h = $('Horário da grade').itemMatching(i).json || {};
  const cli = it.json || {};
  const hp = h.properties || {}, cp = cli.properties || {};
  const formato = txt(hp['Formato']), plataforma = txt(hp['Plataforma']);
  const grupo = txt(cp['Grupo WhatsApp (ID)']);
  const nome = txt(cp['Cliente']);
  let motivo = '';
  if (sem((h.parent || {}).database_id) !== '2d21b7a7166240f5afaa4d697c3d1ae8') motivo = 'horario';
  else if (CLIENTES.length && !CLIENTES.includes(sem(cli.id))) motivo = 'fora_do_teste';
  else if (plataforma !== 'YouTube' || !['Vídeo padrão', 'Podcast', 'Corte horizontal'].includes(formato)) motivo = 'nao_longo';
  else if (!/@g\\.us$/.test(grupo)) motivo = 'sem_grupo';
  else if (txt(cp['Situação']) === 'Encerrado') motivo = 'encerrado';
  const oque = formato === 'Podcast' ? 'O episódio novo do podcast' : formato === 'Corte horizontal' ? 'O corte novo do podcast' : 'O vídeo novo do canal';
  const d = DateTime.fromISO(c.dia, { zone: Z }).setLocale('pt-BR');
  const dif = Math.round(d.startOf('day').diff(hoje, 'days').days);
  const hr = (m => m ? Number(m[1]) + 'h' + (m[2] === '00' ? '' : m[2]) : '')(txt(hp['Horário']).match(/^(\\d{1,2}):(\\d{2})/));
  let tipo = c.tipo;
  if (tipo === 'agendado' && dif < 0) tipo = 'postado';
  let texto;
  if (tipo === 'agendado') {
    const quando = dif === 0 ? 'hoje' : dif === 1 ? 'amanhã (' + d.toFormat('dd/MM') + ')' : d.toFormat('cccc') + ' (' + d.toFormat('dd/MM') + ')';
    texto = 'Oi, pessoal! 🎬\\n\\n' + oque + ' já está agendado no YouTube para ' + quando + (hr ? ' às ' + hr : '') + '.\\n\\nJá dá para avisar a sua audiência nos stories para dar aquele impulso inicial.' + ASS;
  } else {
    texto = 'Oi, pessoal! 🎬\\n\\n' + oque + ' já está no ar no YouTube.\\n\\nVale compartilhar nos stories para dar aquele impulso inicial.' + ASS;
  }
  return { json: { ...c, tipo, cliente: nome, grupo, texto, mandar: !motivo, motivo } };
});
` } } });

const vaiMandar = node({ type: 'n8n-nodes-base.filter', version: 2.2, config: { name: 'É vídeo longo com grupo?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.mandar }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } } });

const enviar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Mandar no grupo (Érica)', onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://api.grupoeuforia.tech/message/sendText/suporte', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify({ number: $json.grupo, text: $json.texto }) }}',
  options: { batching: { batch: { batchSize: 1, batchInterval: 3000 } }, response: { response: { fullResponse: true, neverError: true } } } },
  credentials: { httpHeaderAuth: { id: 'MqNLRX9duuYKJSR2', name: 'Evolution API' } } } });

const resultado = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Resultado', parameters: { jsCode: `const agora = DateTime.now().setZone('America/Recife').toFormat('yyyy-MM-dd HH:mm');
return $input.all().map((it, i) => { const b = $('É vídeo longo com grupo?').itemMatching(i).json; const s = it.json.statusCode;
  return { json: { ...b, ok: s >= 200 && s < 300, quando: agora } }; });
` } } });

const gravar = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Gravar aviso', parameters: {
  resource: 'row', operation: 'insert', dataTableId: AVISOS,
  columns: { mappingMode: 'defineBelow', value: { chave: '={{ $json.chave }}', slot: '={{ $json.slot }}', dia: '={{ $json.dia }}', tipo: '={{ $json.tipo }}', cliente: '={{ $json.cliente }}', grupo: '={{ $json.grupo }}', texto: '={{ $json.texto }}', quando: '={{ $json.quando }}', ok: '={{ $json.ok }}' }, matchingColumns: [], schema: [
    { id: 'chave', displayName: 'chave', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'slot', displayName: 'slot', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'dia', displayName: 'dia', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'tipo', displayName: 'tipo', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'cliente', displayName: 'cliente', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'grupo', displayName: 'grupo', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'texto', displayName: 'texto', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'quando', displayName: 'quando', type: 'string', display: true, required: false, defaultMatch: false },
    { id: 'ok', displayName: 'ok', type: 'boolean', display: true, required: false, defaultMatch: false }] },
  options: {} } } });

const nota = sticky('## Grade · aviso de vídeo longo ao cliente\nA cada 5 min lê as marcações Programado/Postado da Grade do painel. Se o horário é YouTube Vídeo padrão, Podcast ou Corte horizontal, a Érica (número suporte) avisa no grupo do cliente que o vídeo foi agendado (ou está no ar). Um aviso por vídeo; espera 10 min para dar tempo de desmarcar engano; nada entre 22h e 7h. Registro na tabela Grade · avisos ao cliente (envio que falhou tenta de novo na rodada seguinte).', [], { color: 4 });

export default workflow('grade-aviso-longo', 'Grade | Avisar cliente de vídeo longo (V1)')
  .add(relogio).to(marcas).to(avisados).to(candidatos).to(horario).to(cliente).to(montar).to(vaiMandar).to(enviar).to(resultado).to(gravar)
  .add(nota);
