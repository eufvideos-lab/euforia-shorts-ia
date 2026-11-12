import { workflow, node, trigger, sticky, expr } from '@n8n/workflow-sdk';

const relogio = trigger({
  type: 'n8n-nodes-base.scheduleTrigger', version: 1.3,
  config: { name: 'De hora em hora', parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 15 7-23 * * *' }] } } }
});

const fichas = node({
  type: 'n8n-nodes-base.executeWorkflow', version: 1.3,
  config: {
    name: 'Fichas dos clientes',
    parameters: {
      source: 'database',
      workflowId: { __rl: true, mode: 'id', value: 'MsQKViah1gK8oetH', cachedResultName: 'Cache | Consultar como Notion (V1)' },
      mode: 'once',
      options: { waitForSubWorkflow: true },
      workflowInputs: {
        mappingMode: 'defineBelow',
        value: { db: 'clientes', consulta: '{"filter":{"property":"Situação","select":{"does_not_equal":"Encerrado"}},"page_size":100}', forcar: '' },
        matchingColumns: [],
        schema: [
          { id: 'db', displayName: 'db', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'consulta', displayName: 'consulta', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'forcar', displayName: 'forcar', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }
        ]
      }
    },
    executeOnce: true
  }
});

const lerFeeds = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Ler feeds do YouTube',
    parameters: {
      jsCode: `// Para cada ficha com o campo YouTube preenchido: acha o ID do canal e lê os feeds públicos (longos e shorts).
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); return v.url || ''; };
const get = async url => { try { return String(await this.helpers.httpRequest({ url, method: 'GET', headers: { 'Accept-Language': 'pt-BR' }, timeout: 20000 })); } catch (e) { return ''; } };
const agora = DateTime.now().setZone('America/Recife').toISO();
const out = [];
for (const it of $input.all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {}, link = txt(pr['YouTube']); if (!/youtube\\.com|youtu\\.be/.test(link)) continue;
  let canal = (link.match(/channel\\/(UC[\\w-]{22})/) || [])[1];
  if (!canal) { const h = await get(link); canal = (h.match(/"externalId":"(UC[\\w-]{22})"/) || h.match(/channel_id=(UC[\\w-]{22})/) || [])[1]; }
  if (!canal) continue;
  for (const [tipo, pl] of [['longo', 'UULF'], ['short', 'UUSH']]) {
    const x = await get('https://www.youtube.com/feeds/videos.xml?playlist_id=' + pl + canal.slice(2));
    for (const m of x.matchAll(/<entry>[\\s\\S]*?<yt:videoId>([^<]+)<\\/yt:videoId>[\\s\\S]*?<title>([^<]*)<\\/title>[\\s\\S]*?<published>([^<]+)<\\/published>/g))
      out.push({ json: { video: m[1], cliente: p.id.replace(/-/g, ''), clienteNome: txt(pr['Cliente']), canal, tipo, titulo: m[2].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").slice(0, 200), publicado: m[3], visto: agora } });
  }
}
return out;`
    }
  }
});

const gravar = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: {
    name: 'Gravar postagens',
    parameters: {
      resource: 'row', operation: 'upsert',
      dataTableId: { __rl: true, mode: 'id', value: '8nxpjTLeALjXN6Mf', cachedResultName: 'YouTube · postagens dos clientes' },
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'video', condition: 'eq', keyValue: expr('{{ $json.video }}') }] },
      columns: {
        mappingMode: 'autoMapInputData', value: {}, matchingColumns: [],
        schema: [
          { id: 'video', displayName: 'video', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'cliente', displayName: 'cliente', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'clienteNome', displayName: 'clienteNome', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'canal', displayName: 'canal', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'tipo', displayName: 'tipo', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'titulo', displayName: 'titulo', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'publicado', displayName: 'publicado', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' },
          { id: 'visto', displayName: 'visto', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }
        ]
      }
    }
  }
});

const nota = sticky('## Clientes · postagens reais do YouTube (V1)\nDe hora em hora (7h às 23h UTC): lê o campo YouTube das fichas (cópia do Notion), acha o ID do canal e lê os feeds públicos de longos e shorts (15 últimos de cada). Grava na tabela "YouTube · postagens dos clientes" (1 linha por vídeo, sem repetir). As abas Clientes do painel contam o que está no ar a partir dela. Sem login e sem chave.', [relogio, fichas, lerFeeds, gravar], { color: 4 });

export default workflow('clientes-youtube-postagens', 'Clientes | Postagens reais do YouTube (V1)')
  .add(relogio).to(fichas).to(lerFeeds).to(gravar).add(nota);
