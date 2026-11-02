import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

// Diretoria | Painel Central (marketing): aba "Marketing" da Minha mesa. Só leitura: Instagram @euforiagrupo e conta de anúncios da Meta.
// Guarda uma foto por dia (seguidores e gasto) no Postgres para mostrar o crescimento. Só o login do Henrique.
const ORIGENS = 'https://lp.grupoeuforia.tech,https://grupoeuforia.com.br,https://www.grupoeuforia.com.br';
const PESSOAS = { __rl: true, mode: 'id', value: 'bcimSpwlGuGZ2940', cachedResultName: 'Painel · pessoas' };
const PG = { postgres: { id: '2QBGXkxxr41tWTQw', name: 'Postgres account' } };

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Pedido da aba Marketing', parameters: {
  httpMethod: 'POST', path: 'diretoria-central-marketing', responseMode: 'responseNode', options: { allowedOrigins: ORIGENS } } } });

const todoDia = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Todo dia 23h50', parameters: {
  rule: { interval: [{ field: 'cronExpression', expression: '50 23 * * *' }] } } } });

const pessoas = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Pessoas', executeOnce: true, alwaysOutputData: true, parameters: {
  resource: 'row', operation: 'get', dataTableId: PESSOAS, matchType: 'allConditions',
  filters: { conditions: [{ keyName: 'usuario', condition: 'eq', keyValue: 'henrique' }] }, limit: 1 } } });

const conferir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Conferir sessão', parameters: { jsCode: `const b = $('Pedido da aba Marketing').first().json.body || {};
const p = $('Pessoas').first().json || {};
const agora = DateTime.now().setZone('America/Recife');
const teste = ['manual', 'test'].includes($execution.mode);
const ok = teste || (p.usuario === 'henrique' && p.ativo !== false && p.papel === 'diretor' && String(b.usuario || '').toLowerCase() === 'henrique'
  && !!p.sessao && String(b.token || '') === p.sessao && !!p.sessao_expira && DateTime.fromISO(p.sessao_expira) > agora);
return [{ json: { ok } }];
` } } });

const pode = ifElse({ version: 2.2, config: { name: 'Sessão válida?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.ok }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const perfil = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Instagram perfil', executeOnce: true, alwaysOutputData: true, credentials: { httpQueryAuth: { id: 'UAz9HxehHsCLEaes', name: 'Instagram Euforia' } }, parameters: {
  method: 'GET', url: 'https://graph.instagram.com/v23.0/17841468476817613?fields=username,followers_count,follows_count,media_count', authentication: 'genericCredentialType', genericAuthType: 'httpQueryAuth', options: { response: { response: { neverError: true } } } } } });
const sem = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Instagram 7 dias', executeOnce: true, alwaysOutputData: true, credentials: { httpQueryAuth: { id: 'UAz9HxehHsCLEaes', name: 'Instagram Euforia' } }, parameters: {
  method: 'GET', url: '={{ "https://graph.instagram.com/v23.0/17841468476817613/insights?metric=reach,views,profile_views,accounts_engaged,total_interactions,website_clicks&period=day&metric_type=total_value&since=" + (Math.floor(Date.now() / 1000) - 7 * 86400) + "&until=" + (Math.floor(Date.now() / 1000) - 0 * 86400) }}', authentication: 'genericCredentialType', genericAuthType: 'httpQueryAuth', options: { response: { response: { neverError: true } } } } } });
const ant = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Instagram 7 dias antes', executeOnce: true, alwaysOutputData: true, credentials: { httpQueryAuth: { id: 'UAz9HxehHsCLEaes', name: 'Instagram Euforia' } }, parameters: {
  method: 'GET', url: '={{ "https://graph.instagram.com/v23.0/17841468476817613/insights?metric=reach,views,profile_views,accounts_engaged,total_interactions,website_clicks&period=day&metric_type=total_value&since=" + (Math.floor(Date.now() / 1000) - 14 * 86400) + "&until=" + (Math.floor(Date.now() / 1000) - 7 * 86400) }}', authentication: 'genericCredentialType', genericAuthType: 'httpQueryAuth', options: { response: { response: { neverError: true } } } } } });
const mes = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Instagram 28 dias', executeOnce: true, alwaysOutputData: true, credentials: { httpQueryAuth: { id: 'UAz9HxehHsCLEaes', name: 'Instagram Euforia' } }, parameters: {
  method: 'GET', url: '={{ "https://graph.instagram.com/v23.0/17841468476817613/insights?metric=reach,views,profile_views,accounts_engaged,total_interactions,website_clicks&period=day&metric_type=total_value&since=" + (Math.floor(Date.now() / 1000) - 28 * 86400) + "&until=" + (Math.floor(Date.now() / 1000) - 0 * 86400) }}', authentication: 'genericCredentialType', genericAuthType: 'httpQueryAuth', options: { response: { response: { neverError: true } } } } } });
const novos = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Instagram novos por dia', executeOnce: true, alwaysOutputData: true, credentials: { httpQueryAuth: { id: 'UAz9HxehHsCLEaes', name: 'Instagram Euforia' } }, parameters: {
  method: 'GET', url: '={{ "https://graph.instagram.com/v23.0/17841468476817613/insights?metric=follower_count&period=day&since=" + (Math.floor(Date.now() / 1000) - 29 * 86400) + "&until=" + Math.floor(Date.now() / 1000) }}', authentication: 'genericCredentialType', genericAuthType: 'httpQueryAuth', options: { response: { response: { neverError: true } } } } } });
const posts = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Instagram posts', executeOnce: true, alwaysOutputData: true, credentials: { httpQueryAuth: { id: 'UAz9HxehHsCLEaes', name: 'Instagram Euforia' } }, parameters: {
  method: 'GET', url: 'https://graph.instagram.com/v23.0/17841468476817613/media?fields=caption,media_type,permalink,timestamp,like_count,comments_count&limit=9', authentication: 'genericCredentialType', genericAuthType: 'httpQueryAuth', options: { response: { response: { neverError: true } } } } } });
const ads7 = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Anúncios 7 dias', executeOnce: true, alwaysOutputData: true, credentials: { httpHeaderAuth: { id: 'KrcLPLRoUtJXpis4', name: 'Meta Ads' } }, parameters: {
  method: 'GET', url: 'https://graph.facebook.com/v23.0/act_2954136178260460/insights?level=campaign&date_preset=last_7d&limit=50&fields=campaign_name,campaign_id,spend,impressions,reach,clicks,ctr,actions', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', options: { response: { response: { neverError: true } } } } } });
const ads30c = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Anúncios 30 dias por campanha', executeOnce: true, alwaysOutputData: true, credentials: { httpHeaderAuth: { id: 'KrcLPLRoUtJXpis4', name: 'Meta Ads' } }, parameters: {
  method: 'GET', url: 'https://graph.facebook.com/v23.0/act_2954136178260460/insights?level=campaign&date_preset=last_30d&limit=50&fields=campaign_name,campaign_id,spend,impressions,reach,clicks,ctr,actions', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', options: { response: { response: { neverError: true } } } } } });
const ads30 = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Anúncios 30 dias', executeOnce: true, alwaysOutputData: true, credentials: { httpHeaderAuth: { id: 'KrcLPLRoUtJXpis4', name: 'Meta Ads' } }, parameters: {
  method: 'GET', url: 'https://graph.facebook.com/v23.0/act_2954136178260460/insights?date_preset=last_30d&fields=spend,impressions,reach,clicks,ctr,actions', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', options: { response: { response: { neverError: true } } } } } });
const adsHoje = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Anúncios hoje', executeOnce: true, alwaysOutputData: true, credentials: { httpHeaderAuth: { id: 'KrcLPLRoUtJXpis4', name: 'Meta Ads' } }, parameters: {
  method: 'GET', url: 'https://graph.facebook.com/v23.0/act_2954136178260460/insights?date_preset=today&fields=spend,impressions,clicks,actions', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', options: { response: { response: { neverError: true } } } } } });
const ativas = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Campanhas ativas', executeOnce: true, alwaysOutputData: true, credentials: { httpHeaderAuth: { id: 'KrcLPLRoUtJXpis4', name: 'Meta Ads' } }, parameters: {
  method: 'GET', url: 'https://graph.facebook.com/v23.0/act_2954136178260460/campaigns?effective_status=%5B%22ACTIVE%22%5D&fields=name,daily_budget,lifetime_budget,start_time&limit=50', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', options: { response: { response: { neverError: true } } } } } });

const foto = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Guardar foto do dia', credentials: PG, executeOnce: true, alwaysOutputData: true, parameters: {
  operation: 'executeQuery',
  query: `CREATE TABLE IF NOT EXISTS marketing_diario (dia date PRIMARY KEY, ig_seguidores int, ig_posts int, atualizado timestamptz DEFAULT now());
INSERT INTO marketing_diario (dia, ig_seguidores, ig_posts) SELECT (now() AT TIME ZONE 'America/Recife')::date, $1::int, $2::int WHERE $1::int > 0
ON CONFLICT (dia) DO UPDATE SET ig_seguidores = EXCLUDED.ig_seguidores, ig_posts = EXCLUDED.ig_posts, atualizado = now();`,
  options: { queryReplacement: "={{ [ Number($('Instagram perfil').first().json.followers_count) || 0, Number($('Instagram perfil').first().json.media_count) || 0 ] }}" } } } });

const historico = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Ler histórico', credentials: PG, executeOnce: true, alwaysOutputData: true, parameters: {
  operation: 'executeQuery',
  query: `SELECT to_char(dia, 'YYYY-MM-DD') AS dia, ig_seguidores FROM marketing_diario ORDER BY dia DESC LIMIT 120;` } } });

const blog = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Ler blog', credentials: PG, executeOnce: true, alwaysOutputData: true, parameters: {
  operation: 'executeQuery',
  query: `WITH b AS (SELECT * FROM blog_visitas WHERE quando > now() - interval '30 days'),
s AS (SELECT * FROM b WHERE quando > now() - interval '7 days')
SELECT (SELECT count(*) FROM s) AS v7, (SELECT count(DISTINCT nullif(visitante, '')) FROM s) AS u7,
  (SELECT count(*) FROM blog_visitas WHERE quando > now() - interval '14 days' AND quando <= now() - interval '7 days') AS a7,
  (SELECT count(*) FROM b) AS v30, (SELECT count(DISTINCT nullif(visitante, '')) FROM b) AS u30,
  (SELECT coalesce(json_agg(x ORDER BY x.n DESC), '[]') FROM (SELECT fonte, count(*) AS n FROM s GROUP BY 1) x) AS f7,
  (SELECT coalesce(json_agg(x ORDER BY x.n DESC), '[]') FROM (SELECT fonte, count(*) AS n FROM b GROUP BY 1) x) AS f30,
  (SELECT coalesce(json_agg(x ORDER BY x.n DESC), '[]') FROM (SELECT caminho, count(*) AS n FROM s GROUP BY 1 ORDER BY 2 DESC LIMIT 10) x) AS p7,
  (SELECT coalesce(json_agg(x ORDER BY x.n DESC), '[]') FROM (SELECT caminho, count(*) AS n FROM b GROUP BY 1 ORDER BY 2 DESC LIMIT 10) x) AS p30,
  (SELECT to_char(min(quando) AT TIME ZONE 'America/Recife', 'YYYY-MM-DD') FROM blog_visitas) AS desde;` } } });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar marketing', parameters: { jsCode: `const j = n => { try { return $(n).first().json || {}; } catch (e) { return {}; } };
const erroDe = r => r && r.error ? String(r.error.message || 'erro').slice(0, 160) : '';
const tot = r => { const o = {}; ((r && r.data) || []).forEach(m => { o[m.name] = m.total_value ? Number(m.total_value.value) || 0 : 0; }); return o; };
const num = v => (v === undefined || v === null || v === '') ? 0 : Number(v) || 0;
const LEAD = ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'onsite_web_lead'];
const CONV = ['onsite_conversion.messaging_conversation_started_7d'];
const conta = (acts, tipos) => { let m = 0; (acts || []).forEach(a => { if (tipos.includes(a.action_type)) m = Math.max(m, num(a.value)); }); return m; };
const resumo = x => { const leads = conta(x.actions, LEAD), conversas = conta(x.actions, CONV), gasto = num(x.spend);
  return { gasto, impressoes: num(x.impressions), alcance: num(x.reach), cliques: num(x.clicks), ctr: num(x.ctr), leads, conversas, visitas: conta(x.actions, ['landing_page_view']), eventos: conta(x.actions, ['offsite_conversion.fb_pixel_custom']), cpl: leads ? Math.round(gasto / leads * 100) / 100 : null }; };

const p = j('Instagram perfil');
const ig = { erro: erroDe(p) || erroDe(j('Instagram 7 dias')), usuario: p.username || 'euforiagrupo', seguidores: num(p.followers_count), posts_total: num(p.media_count),
  s7: tot(j('Instagram 7 dias')), a7: tot(j('Instagram 7 dias antes')), s28: tot(j('Instagram 28 dias')), novos: [], posts: [] };
const nv = (j('Instagram novos por dia').data || [])[0];
if (nv && nv.values) ig.novos = nv.values.map(v => ({ dia: String(v.end_time || '').slice(0, 10), n: num(v.value) }));
ig.posts = (j('Instagram posts').data || []).map(m => ({ tipo: m.media_type, link: m.permalink, quando: String(m.timestamp || '').slice(0, 10),
  curtidas: num(m.like_count), comentarios: num(m.comments_count), texto: String(m.caption || '').replace(/\\s+/g, ' ').slice(0, 140) }));

const a7 = j('Anúncios 7 dias'), a30 = j('Anúncios 30 dias'), ah = j('Anúncios hoje'), at = j('Campanhas ativas');
const campanhas = (a7.data || []).map(c => Object.assign({ nome: c.campaign_name, id: c.campaign_id }, resumo(c))).sort((x, y) => y.gasto - x.gasto);
const campanhas30 = (j('Anúncios 30 dias por campanha').data || []).map(c => Object.assign({ nome: c.campaign_name, id: c.campaign_id }, resumo(c))).sort((x, y) => y.gasto - x.gasto);
const ativasL = (at.data || []).map(c => ({ nome: c.name, id: c.id, diario: c.daily_budget ? num(c.daily_budget) / 100 : null, inicio: String(c.start_time || '').slice(0, 10) }));
const soma = campanhas.reduce((t, c) => { ['gasto', 'impressoes', 'alcance', 'cliques', 'leads', 'conversas', 'visitas', 'eventos'].forEach(k => { t[k] = (t[k] || 0) + c[k]; }); return t; }, { gasto: 0, impressoes: 0, alcance: 0, cliques: 0, leads: 0, conversas: 0, visitas: 0, eventos: 0 });
soma.cpl = soma.leads ? Math.round(soma.gasto / soma.leads * 100) / 100 : null;
soma.ctr = soma.impressoes ? Math.round(soma.cliques / soma.impressoes * 10000) / 100 : 0;
const ads = { erro: erroDe(a7) || erroDe(a30), conta: 'Grupo Euforia · Anúncios', d7: soma, d30: resumo((a30.data || [])[0] || {}), hoje: resumo((ah.data || [])[0] || {}),
  campanhas, campanhas30, ativas: ativasL };

const bl = j('Ler blog');
const blog = { conectado: true, desde: bl.desde || '', v7: num(bl.v7), u7: num(bl.u7), a7: num(bl.a7), v30: num(bl.v30), u30: num(bl.u30),
  f7: bl.f7 || [], f30: bl.f30 || [], p7: bl.p7 || [], p30: bl.p30 || [] };
const historico = $('Ler histórico').all().map(i => i.json).filter(x => x && x.dia).map(x => ({ dia: x.dia, seg: num(x.ig_seguidores) })).reverse();
const hoje = DateTime.now().setZone('America/Recife');
return [{ json: { resp: { ok: true, hoje: hoje.toISODate(), hora: hoje.toFormat('HH:mm'), ig, ads, historico,
  blog, youtube: { conectado: false } } } }];
` } } });

const devolver = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Devolver marketing', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify($json.resp) }}', options: {} } } });

const negar = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Recusar', parameters: {
  respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: false, erro: "sessao" }) }}', options: {} } } });

const perfilNoite = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Instagram perfil (noite)', executeOnce: true, alwaysOutputData: true, credentials: { httpQueryAuth: { id: 'UAz9HxehHsCLEaes', name: 'Instagram Euforia' } }, parameters: {
  method: 'GET', url: 'https://graph.instagram.com/v23.0/17841468476817613?fields=username,followers_count,media_count', authentication: 'genericCredentialType', genericAuthType: 'httpQueryAuth', options: { response: { response: { neverError: true } } } } } });
const fotoNoite = node({ type: 'n8n-nodes-base.postgres', version: 2.6, config: { name: 'Guardar foto da noite', credentials: PG, executeOnce: true, parameters: {
  operation: 'executeQuery',
  query: `CREATE TABLE IF NOT EXISTS marketing_diario (dia date PRIMARY KEY, ig_seguidores int, ig_posts int, atualizado timestamptz DEFAULT now());
INSERT INTO marketing_diario (dia, ig_seguidores, ig_posts) SELECT (now() AT TIME ZONE 'America/Recife')::date, $1::int, $2::int WHERE $1::int > 0
ON CONFLICT (dia) DO UPDATE SET ig_seguidores = EXCLUDED.ig_seguidores, ig_posts = EXCLUDED.ig_posts, atualizado = now();`,
  options: { queryReplacement: '={{ [ Number($json.followers_count) || 0, Number($json.media_count) || 0 ] }}' } } } });

const nota = sticky('## Aba Marketing (Painel Central)\nSó leitura do Instagram @euforiagrupo (credencial Instagram Euforia) e da conta de anúncios Meta (credencial Meta Ads). Foto diária de seguidores em marketing_diario (Postgres), também às 23h50. Blog e YouTube ainda sem fonte. Execução manual = teste sem sessão.', [], { color: 4 });

export default workflow('diretoria-central-marketing', 'Diretoria | Painel Central (marketing)')
  .add(pedir).to(pessoas).to(conferir).to(pode
    .onTrue(perfil.to(sem).to(ant).to(mes).to(novos).to(posts).to(ads7).to(ads30c).to(ads30).to(adsHoje).to(ativas).to(foto).to(historico).to(blog).to(montar).to(devolver))
    .onFalse(negar))
  .add(todoDia).to(perfilNoite).to(fotoNoite)
  .add(nota);
