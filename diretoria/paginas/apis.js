(function () {
// Aba "Saldo APIs" do Painel Central: saldo e crédito das APIs pagas, lido a cada 3 h pelo fluxo "Financeiro | Saldo das APIs".
var URL_API = 'https://n8n.grupoeuforia.tech/webhook/diretoria-central-apis';
var ST = { vazio: ['err', 'Sem saldo', 0], erro: ['err', 'Atenção', 1], baixo: ['or', 'Saldo baixo', 2], ok: ['pos', 'OK', 3], info: ['', 'Informativo', 4] };
var A = null;
function chamar(acao) {
  var ss = sessao() || {};
  return fetch(URL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: ss.usuario, token: ss.token, acao: acao }) })
    .then(function (r) { return r.json(); }).catch(function () { return { ok: false, erro: 'Sem conexão. Tente de novo.' }; })
    .then(function (r) { if (r && r.erro === 'sessao') r.erro = 'Sua sessão acabou. Saia e entre de novo no Painel Central.'; return r || { ok: false, erro: 'Sem resposta.' }; });
}
function quando(iso) {
  if (!iso) return '';
  var d = new Date(iso); if (isNaN(d)) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function desenhar() {
  var L = (A.itens || []).slice().sort(function (a, b) { return (ST[a.status] || ST.info)[2] - (ST[b.status] || ST.info)[2] || (a.ordem || 99) - (b.ordem || 99); });
  var ruins = L.filter(function (i) { return i.status === 'vazio' || i.status === 'erro'; }).length;
  var baixos = L.filter(function (i) { return i.status === 'baixo'; }).length;
  var oks = L.filter(function (i) { return i.status === 'ok'; }).length;
  $('apiHora').textContent = A.verificado_em ? 'Última leitura: ' + quando(A.verificado_em) + '.' : '';
  var h = '<div class="kpis"><div class="kpi' + (ruins ? ' neg' : '') + '"><small>Sem saldo ou com problema</small><b>' + ruins + '</b><span>precisam de ação</span></div>' +
    '<div class="kpi' + (baixos ? ' or' : '') + '"><small>Saldo baixo</small><b>' + baixos + '</b><span>recarregar em breve</span></div>' +
    '<div class="kpi pos"><small>Funcionando</small><b>' + oks + '</b><span>de ' + L.length + ' serviços</span></div></div>';
  h += '<h2 class="sec">Serviços <small>atualiza sozinho a cada 3 horas; aviso no #alertas-diretoria quando algum piora</small></h2>';
  if (!L.length) h += '<p class="vazio">Ainda sem leitura. Clique em "Atualizar agora".</p>';
  L.forEach(function (i) {
    var s = ST[i.status] || ST.info;
    h += '<div class="kpi" style="margin-bottom:10px;display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap' + (i.status === 'vazio' || i.status === 'erro' ? ';border-color:var(--err)' : i.status === 'baixo' ? ';border-color:var(--or)' : '') + '">' +
      '<div style="flex:1;min-width:220px"><small>' + esc(i.nome) + ' · ' + esc(i.uso || '') + '</small>' +
      '<b class="' + s[0] + '" style="font:800 22px/1.2 Archivo,sans-serif;margin-top:4px;color:' + (s[0] === 'err' ? 'var(--err)' : s[0] === 'or' ? 'var(--or2)' : s[0] === 'pos' ? 'var(--ok)' : 'var(--txt)') + '">' + esc(i.saldo) + '</b>' +
      (i.detalhe ? '<span style="white-space:normal">' + esc(i.detalhe) + '</span>' : '') + '</div>' +
      '<div style="flex:none;display:flex;flex-direction:column;gap:6px;align-items:flex-end"><span class="chip"' + (s[0] === 'err' ? ' style="color:var(--err)"' : s[0] === 'or' ? ' style="color:var(--or2)"' : '') + '>' + esc(s[1]) + '</span>' +
      (i.recarga ? '<a class="ghost" href="' + esc(i.recarga) + '" target="_blank" rel="noopener" style="text-decoration:none">Abrir conta / recarregar</a>' : '') + '</div></div>';
  });
  h += '<p class="hint" style="margin-top:14px">Anthropic e OpenAI não mostram o saldo pela API: o painel faz um teste mínimo e diz se ainda responde. Ficam de fora porque não têm crédito pré-pago: Evolution/WhatsApp (servidor próprio), Notion (assinatura) e Google (Drive, Agenda, Sheets).</p>';
  $('apiLista').innerHTML = h;
}
function carregar(acao) {
  if (acao === 'atualizar') { $('apiAtual').disabled = true; $('apiAtual').textContent = 'Lendo as contas…'; }
  return chamar(acao || 'ler').then(function (r) {
    $('apiAtual').disabled = false; $('apiAtual').textContent = 'Atualizar agora';
    if (!r.ok) { if (A) aviso(r.erro || 'Não consegui atualizar agora.', true); else $('apiLista').innerHTML = '<p class="erro">' + esc(r.erro || 'Não consegui ler os saldos agora.') + '</p>'; return; }
    A = r; desenhar(); if (acao === 'atualizar') aviso('Saldos lidos agora.');
  });
}
window.iniciarApi = function () {
  $('apiAtual').addEventListener('click', function () { carregar('atualizar'); });
  carregar('ler');
};
})();
