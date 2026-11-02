(function () {
// Aba Marketing do Painel Central: Instagram @euforiagrupo e anúncios da Meta (só leitura). Blog e YouTube entram quando tiverem fonte.
var M = null, per = '7';
function n0(v) { return Number(v || 0).toLocaleString('pt-BR'); }
function rs(v) { return v === null || v === undefined ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function varia(a, b) {
  if (!b) return '';
  var p = Math.round((a - b) / b * 100);
  return ' <em style="font-style:normal;color:' + (p >= 0 ? 'var(--ok)' : 'var(--err)') + '">' + (p >= 0 ? '▲ ' : '▼ ') + Math.abs(p) + '%</em>';
}
function kpi(t, v, s, cls) { return '<div class="kpi' + (cls ? ' ' + cls : '') + '"><small>' + t + '</small><b>' + v + '</b><span>' + (s || '') + '</span></div>'; }
function carregar() {
  var ss = sessao() || {};
  $('mkCarga').textContent = 'Atualizando…';
  return fetch('https://n8n.grupoeuforia.tech/webhook/diretoria-central-marketing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: ss.usuario, token: ss.token }) })
    .then(function (r) { return r.json(); }).catch(function () { return { ok: false, erro: 'Sem conexão. Tente de novo.' }; }).then(function (r) {
      $('mkCarga').textContent = '';
      if (r && r.erro === 'sessao') r.erro = 'Sua sessão acabou. Saia e entre de novo no Painel Central.';
      if (!r.ok) { $('mkLista').innerHTML = '<p class="erro">' + esc(r.erro || 'Não consegui ler os dados agora.') + '</p>'; return; }
      M = r; desenhar();
    });
}
function desenhar() {
  var ig = M.ig, ad = M.ads, s = per === '7' ? ig.s7 : ig.s28, a = per === '7' ? ig.a7 : null;
  var nov = ig.novos || [], dias = per === '7' ? 7 : 28, recentes = nov.slice(-dias), ganhos = recentes.reduce(function (t, x) { return t + x.n; }, 0);
  var h = '';
  // Instagram
  h += '<h2 class="sec">Instagram @' + esc(ig.usuario) + ' <small>' + (per === '7' ? 'Últimos 7 dias, comparado com os 7 anteriores.' : 'Últimos 28 dias.') + '</small></h2>';
  if (ig.erro) h += '<p class="erro">Instagram não respondeu: ' + esc(ig.erro) + '</p>';
  h += '<div class="kpis">' +
    kpi('Seguidores', n0(ig.seguidores), (nov.length ? (ganhos >= 0 ? '+' : '') + n0(ganhos) + ' novos no período' : 'contagem de hoje'), 'or') +
    kpi('Contas alcançadas', n0(s.reach) + (a ? varia(s.reach, a.reach) : ''), 'pessoas diferentes que viram') +
    kpi('Visualizações', n0(s.views) + (a ? varia(s.views, a.views) : ''), 'vezes que o conteúdo apareceu') +
    kpi('Visitas ao perfil', n0(s.profile_views) + (a ? varia(s.profile_views, a.profile_views) : ''), '') +
    kpi('Interações', n0(s.total_interactions) + (a ? varia(s.total_interactions, a.total_interactions) : ''), n0(s.accounts_engaged) + ' contas interagiram') +
    kpi('Cliques no link', n0(s.website_clicks) + (a ? varia(s.website_clicks, a.website_clicks) : ''), 'link da bio') + '</div>';
  if (nov.length) {
    var mx = Math.max.apply(null, [1].concat(recentes.map(function (x) { return Math.abs(x.n); })));
    h += '<div class="card" style="margin-top:12px"><div class="mut" style="font-size:12.5px;margin-bottom:8px">Novos seguidores por dia</div><div style="display:flex;align-items:flex-end;gap:3px;height:80px">' +
      recentes.map(function (x) { var hh = Math.max(2, Math.round(Math.abs(x.n) / mx * 76));
        return '<div title="' + dm(x.dia) + ': ' + x.n + '" style="flex:1;height:' + hh + 'px;background:' + (x.n >= 0 ? 'var(--or)' : 'var(--err)') + ';border-radius:3px 3px 0 0"></div>'; }).join('') +
      '</div><div style="display:flex;justify-content:space-between;font-size:11px;color:var(--mut);margin-top:4px"><span>' + dm(recentes[0].dia) + '</span><span>' + dm(recentes[recentes.length - 1].dia) + '</span></div></div>';
  }
  if (ig.posts && ig.posts.length) {
    h += '<h2 class="sec">Últimos posts</h2><div class="card">' + ig.posts.map(function (p) {
      return '<div class="lin"><div class="t"><a href="' + esc(p.link) + '" target="_blank" rel="noopener">' + esc(p.texto || '(sem legenda)') + '</a><span class="s">' + dm(p.quando) + ' · ' + esc(String(p.tipo || '').replace('CAROUSEL_ALBUM', 'Carrossel').replace('VIDEO', 'Reel').replace('IMAGE', 'Foto')) + '</span></div>' +
        '<div class="v">♥ ' + n0(p.curtidas) + ' · 💬 ' + n0(p.comentarios) + '</div></div>'; }).join('') + '</div>';
  }
  // Anúncios
  var d = per === '7' ? ad.d7 : ad.d30;
  h += '<h2 class="sec">Anúncios Meta <small>' + esc(ad.conta) + ' · ' + (per === '7' ? 'últimos 7 dias' : 'últimos 30 dias') + '</small></h2>';
  if (ad.erro) h += '<p class="erro">Meta não respondeu: ' + esc(ad.erro) + '</p>';
  h += '<div class="kpis">' +
    kpi('Gasto', rs(d.gasto), 'hoje: ' + rs(ad.hoje.gasto), 'or') +
    kpi('Leads', n0(d.leads), 'hoje: ' + n0(ad.hoje.leads)) +
    kpi('Custo por lead', rs(d.cpl), '') +
    kpi('Visitas à página', n0(d.visitas), n0(d.eventos) + ' eventos do site · ' + n0(d.conversas) + ' conversas') +
    kpi('Cliques', n0(d.cliques), 'CTR ' + Number(d.ctr || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%') +
    kpi('Pessoas alcançadas', n0(d.alcance), n0(d.impressoes) + ' impressões') + '</div>';
  h += '<div class="card" style="margin-top:12px">';
  if (ad.ativas.length) h += '<div class="mut" style="font-size:12.5px;margin-bottom:6px">Ativas agora: ' + ad.ativas.map(function (c) { return esc(c.nome) + (c.diario ? ' (' + rs(c.diario) + '/dia)' : ''); }).join(' · ') + '</div>';
  else h += '<div class="mut" style="font-size:12.5px;margin-bottom:6px">Nenhuma campanha ativa agora. Quando você subir uma, ela aparece aqui sozinha.</div>';
  var cs = per === '7' ? ad.campanhas : (ad.campanhas30 || []);
  h += cs.length ? cs.map(function (c) {
    return '<div class="lin"><div class="t"><b>' + esc(c.nome) + '</b><span class="s">' + n0(c.cliques) + ' cliques · ' + n0(c.alcance) + ' pessoas · ' + n0(c.leads) + ' leads · ' + n0(c.conversas) + ' conversas</span></div>' +
      '<div class="v">' + rs(c.gasto) + '<span style="display:block;font-size:12px;color:var(--mut);font-weight:500">CPL ' + rs(c.cpl) + '</span></div></div>'; }).join('')
    : '<p class="vazio" style="margin:6px 0">' + (per === '7' ? 'Nenhuma campanha gastou nos últimos 7 dias. Troque para 28-30 dias para ver o mês.' : 'Nenhuma campanha gastou nos últimos 30 dias.') + '</p>';
  h += '</div>';
  // Blog (contador próprio)
  var bl = M.blog || {};
  h += '<h2 class="sec">Blog <small>Contador próprio' + (bl.desde ? ', ligado em ' + dm(bl.desde) : '') + '. Robôs não contam.</small></h2>';
  if (!bl.conectado) h += '<p class="vazio">Contador ainda não ligado.</p>';
  else {
    var b7 = per === '7', fs = (b7 ? bl.f7 : bl.f30) || [], ps = (b7 ? bl.p7 : bl.p30) || [], tv = b7 ? bl.v7 : bl.v30;
    var busca = fs.filter(function (x) { return x.fonte === 'Google' || x.fonte === 'Outras buscas'; }).reduce(function (t, x) { return t + Number(x.n); }, 0);
    h += '<div class="kpis">' +
      kpi('Visitas', n0(tv) + (b7 ? varia(bl.v7, bl.a7) : ''), (b7 ? 'últimos 7 dias' : 'últimos 30 dias'), 'or') +
      kpi('Pessoas', n0(b7 ? bl.u7 : bl.u30), 'navegadores diferentes') +
      kpi('Vindas do Google', n0(busca), tv ? Math.round(busca / tv * 100) + '% das visitas (orgânico)' : 'orgânico') +
      kpi('Posts lidos', n0(ps.length), 'páginas com visita') + '</div>';
    if (fs.length || ps.length) {
      h += '<div class="card" style="margin-top:12px;display:flex;gap:28px;flex-wrap:wrap"><div style="flex:1;min-width:240px"><div class="mut" style="font-size:12.5px;margin-bottom:6px">De onde vieram</div>' +
        fs.map(function (x) { return '<div class="lin"><div class="t">' + esc(x.fonte) + '</div><div class="v">' + n0(x.n) + '</div></div>'; }).join('') + '</div>' +
        '<div style="flex:2;min-width:280px"><div class="mut" style="font-size:12.5px;margin-bottom:6px">Mais lidos</div>' +
        ps.map(function (x) { var nome = String(x.caminho).replace(/^\/|\.html$/g, '').replace(/^blog-?/, '').replace(/-/g, ' ') || 'Página inicial do blog';
          return '<div class="lin"><div class="t">' + esc(nome.charAt(0).toUpperCase() + nome.slice(1)) + '</div><div class="v">' + n0(x.n) + '</div></div>'; }).join('') + '</div></div>';
    } else h += '<p class="vazio" style="margin-top:8px">Nenhuma visita contada ainda. As primeiras aparecem aqui assim que alguém abrir o blog.</p>';
  }
  // YouTube
  h += '<h2 class="sec">YouTube</h2><div class="kpis"><div class="kpi"><small>YouTube</small><b style="font-size:17px">Ainda não conectado</b><span>Falta conectar a conta do canal no n8n. Depois disso entram inscritos, visualizações e vídeos.</span></div>' +
    '<div class="kpi"><small>Google (Search Console)</small><b style="font-size:17px">Ainda não conectado</b><span>Depois de conectado mostra em quantas buscas o blog apareceu e quantos cliques teve.</span></div></div>';
  $('mkLista').innerHTML = h;
  $('mkHora').textContent = 'Dados de ' + dm(M.hoje) + ' às ' + M.hora;
}
window.iniciarMkt = function () {
  if (!sessao()) { $('mkLista').innerHTML = '<p class="erro">Abra esta aba pelo Painel Central (lp.grupoeuforia.tech/diretoria).</p>'; return; }
  $('mkPer').onchange = function () { per = this.value; if (M) desenhar(); };
  $('mkAtual').onclick = function () { carregar(); };
  carregar();
  setInterval(function () { if (aba === 'mkt' && !document.hidden) carregar(); }, 900000);
};
})();
