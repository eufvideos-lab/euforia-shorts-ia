(function () {
// Aba Equipe do Painel Central: pontos positivos e negativos de cada pessoa, para o Henrique decidir. Confidencial.
var URL_EQ = 'https://n8n.grupoeuforia.tech/webhook/diretoria-central-equipe';
var EQUIPE = ['Rômulo', 'Ismael', 'Daniel', 'Victor', 'Lorena', 'Diogo', 'Jhonatas', 'Jailton'];
var TIPO = { positivo: ['ent', '+ Positivo'], negativo: ['sai', '− Negativo'], observacao: ['', 'Observação'] };
var PESO = { 1: 'leve', 2: 'médio', 3: 'grave' };
var Q = null, quem = '', per = '30';
function chamar(acao, extra) {
  var ss = sessao() || {};
  return fetch(URL_EQ, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ usuario: ss.usuario, token: ss.token, acao: acao }, extra || {})) })
    .then(function (r) { return r.json(); }).catch(function () { return { ok: false, erro: 'Sem conexão. Tente de novo.' }; })
    .then(function (r) { if (r && r.erro === 'sessao') r.erro = 'Sua sessão acabou. Saia e entre de novo no Painel Central.'; return r || { ok: false, erro: 'Sem resposta.' }; });
}
function carregar() {
  return chamar('ler').then(function (r) {
    if (!r.ok) { $('eqLista').innerHTML = '<p class="erro">' + esc(r.erro || 'Não consegui ler a análise agora.') + '</p>'; return; }
    Q = r; desenhar();
  });
}
function saldo(L) {
  var p = 0, n = 0; L.forEach(function (i) { if (i.tipo === 'positivo') p += i.peso; if (i.tipo === 'negativo') n += i.peso; });
  return { p: p, n: n, s: p - n };
}
function linha(i) {
  var t = TIPO[i.tipo] || TIPO.observacao;
  return '<div class="lin" style="align-items:flex-start"><div class="t"><b class="' + t[0] + '">' + esc(t[1]) + '</b> <b>' + esc(i.titulo) + '</b>' +
    '<span style="display:block;margin-top:4px"><span class="chip">' + esc(dm(i.dia)) + '</span><span class="chip">' + esc(i.pessoa) + '</span>' +
    (i.tipo !== 'observacao' ? '<span class="chip' + (i.peso === 3 ? ' at' : '') + '">' + esc(PESO[i.peso] || '') + '</span>' : '') +
    (i.cliente ? '<span class="chip">' + esc(i.cliente) + '</span>' : '') + '</span>' +
    (i.detalhe ? '<span style="display:block;color:var(--mut);font-size:13px;margin-top:5px;white-space:pre-wrap">' + esc(i.detalhe) + '</span>' : '') +
    (i.decisao ? '<span style="display:block;font-size:13px;margin-top:5px"><b style="color:var(--or2)">Decisão:</b> ' + esc(i.decisao) + '</span>' : '') +
    (i.fonte ? '<span style="display:block;color:var(--mut);font-size:11.5px;margin-top:4px">Fonte: ' + esc(i.fonte) + '</span>' : '') +
    '</div><div style="flex:none;display:flex;flex-direction:column;gap:6px"><button class="ghost" data-dec="' + i.id + '">Decisão</button><button class="ghost" data-del="' + i.id + '">Apagar</button></div></div>';
}
function desenhar() {
  var desde = per ? maisDias(-(Number(per) - 1), Q.hoje) : '';
  var L = Q.itens.filter(function (i) { return (!desde || i.dia >= desde) && (!quem || i.pessoa === quem); });
  var h = '';
  if (!quem) {
    // Um cartão por pessoa: placar do período e o último ponto de cada lado.
    var nomes = EQUIPE.filter(function (p) { return L.some(function (i) { return i.pessoa === p; }); });
    h += '<div class="kpis">' + nomes.map(function (p) {
      var M = L.filter(function (i) { return i.pessoa === p; }), s = saldo(M);
      var ultNeg = M.filter(function (i) { return i.tipo === 'negativo'; })[0], ultPos = M.filter(function (i) { return i.tipo === 'positivo'; })[0];
      return '<div class="kpi ' + (s.s < 0 ? 'neg' : s.s > 0 ? 'pos' : '') + '" style="cursor:pointer" data-quem="' + esc(p) + '"><small>' + esc(p) + '</small><b>' + (s.s > 0 ? '+' : '') + s.s + '</b>' +
        '<span><em class="ent" style="font-style:normal">+' + s.p + '</em> · <em class="sai" style="font-style:normal">−' + s.n + '</em> · ' + M.length + ' registro(s)</span>' +
        (ultNeg ? '<span class="sai" style="white-space:normal">− ' + esc(ultNeg.titulo) + '</span>' : '') +
        (ultPos ? '<span class="ent" style="white-space:normal">+ ' + esc(ultPos.titulo) + '</span>' : '') + '</div>';
    }).join('') + '</div>';
    if (!nomes.length) h += '<p class="vazio">Nada registrado nesse período. Use "+ Registrar" quando algo acontecer.</p>';
    h += '<p class="mut" style="font-size:12.5px;margin-top:8px">Placar = pontos positivos menos negativos (leve 1, médio 2, grave 3). Clique numa pessoa para ver tudo dela.</p>';
  } else {
    var s = saldo(L);
    h += '<div class="kpis"><div class="kpi ' + (s.s < 0 ? 'neg' : s.s > 0 ? 'pos' : '') + '"><small>' + esc(quem) + ' · placar</small><b>' + (s.s > 0 ? '+' : '') + s.s + '</b><span>no período</span></div>' +
      '<div class="kpi pos"><small>Positivos</small><b>' + L.filter(function (i) { return i.tipo === 'positivo'; }).length + '</b><span>peso ' + s.p + '</span></div>' +
      '<div class="kpi neg"><small>Negativos</small><b>' + L.filter(function (i) { return i.tipo === 'negativo'; }).length + '</b><span>peso ' + s.n + '</span></div>' +
      '<div class="kpi"><small>Graves</small><b>' + L.filter(function (i) { return i.tipo === 'negativo' && i.peso === 3; }).length + '</b><span>afetaram cliente</span></div></div>';
  }
  var grupos = [['negativo', 'Pontos negativos'], ['positivo', 'Pontos positivos'], ['observacao', 'Observações']];
  grupos.forEach(function (g) {
    var X = L.filter(function (i) { return i.tipo === g[0]; });
    if (!X.length) return;
    h += '<h2 class="sec">' + g[1] + ' <span class="n">' + X.length + '</span></h2><div class="card">' + X.map(linha).join('') + '</div>';
  });
  $('eqLista').innerHTML = h;
}
function registrar() {
  modal('Registrar ponto da equipe', [
    { k: 'pessoa', rot: 'Pessoa', tipo: 'select', ops: [['', 'Escolha…']].concat(EQUIPE.map(function (p) { return [p, p]; })), v: quem, meia: 1 },
    { k: 'tipo', rot: 'Tipo', tipo: 'select', ops: [['negativo', '− Negativo'], ['positivo', '+ Positivo'], ['observacao', 'Observação']], v: 'negativo', meia: 1 },
    { k: 'peso', rot: 'Peso', tipo: 'select', ops: [['1', 'Leve'], ['2', 'Médio'], ['3', 'Grave (afetou cliente)']], v: '1', meia: 1 },
    { k: 'dia', rot: 'Dia', tipo: 'date', v: hojeISO(), meia: 1 },
    { k: 'titulo', rot: 'O que aconteceu (curto)', v: '' },
    { k: 'cliente', rot: 'Cliente (opcional)', v: '' },
    { k: 'detalhe', rot: 'Detalhe (opcional)', tipo: 'textarea', v: '' }
  ], 'Registrar', function (v) {
    return chamar('criar', { campos: v }).then(function (r) { if (!r.ok) return r.erro || 'Não deu certo.'; aviso('Registrado.'); carregar(); });
  }, 'Só você vê. Nada daqui vai para a equipe.');
}
window.iniciarEqp = function () {
  if (!sessao()) { $('eqLista').innerHTML = '<p class="erro">Abra esta aba pelo Painel Central (lp.grupoeuforia.tech/diretoria).</p>'; return; }
  $('eqQuem').innerHTML = '<option value="">Todas as pessoas</option>' + EQUIPE.map(function (p) { return '<option>' + esc(p) + '</option>'; }).join('');
  $('eqQuem').onchange = function () { quem = this.value; if (Q) desenhar(); };
  $('eqPer').onchange = function () { per = this.value; if (Q) desenhar(); };
  $('eqNovo').onclick = registrar;
  $('eqLista').addEventListener('click', function (e) {
    var c = e.target.closest('[data-quem]'); if (c) { quem = c.getAttribute('data-quem'); $('eqQuem').value = quem; desenhar(); return; }
    var d = e.target.closest('[data-dec]');
    if (d) { var id = Number(d.getAttribute('data-dec')), it = Q.itens.filter(function (i) { return i.id === id; })[0] || {};
      modal('Decisão sobre: ' + (it.titulo || ''), [{ k: 'decisao', rot: 'O que você decidiu', tipo: 'textarea', v: it.decisao || '' }], 'Salvar', function (v) {
        return chamar('decidir', { id: id, campos: v }).then(function (r) { if (!r.ok) return r.erro || 'Não deu certo.'; aviso('Decisão salva.'); carregar(); }); });
      return; }
    var x = e.target.closest('[data-del]');
    if (x && confirm('Apagar este registro?')) chamar('apagar', { id: Number(x.getAttribute('data-del')) }).then(function (r) { if (!r.ok) aviso(r.erro || 'Não deu certo.', 1); else { aviso('Apagado.'); carregar(); } });
  });
  carregar();
};
})();
