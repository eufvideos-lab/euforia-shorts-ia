(function () {
// Aba Financeiro do Painel Central: 💸 Lançamentos do Notion (cópia rápida) + saldo real informado pelo Henrique.
var F = null, abertoDia = {};
function carregar() {
  return api('fin').then(function (r) {
    if (!r.ok) { $('conteudo').innerHTML = '<p class="erro">' + esc(r.erro || 'Não carregou.') + '</p>'; return; }
    F = r; desenhar();
  });
}
function kpi(t, v, s, cls) { return '<div class="kpi ' + (cls || '') + '"><small>' + esc(t) + '</small><b>' + v + '</b>' + (s ? '<span>' + s + '</span>' : '') + '</div>'; }
function soma(l) { return l.reduce(function (t, x) { return t + (x.v || 0); }, 0); }
function item(x, acoes) {
  var sinal = x.tipo === 'Entrada' ? 'ent' : 'sai';
  var sub = [x.venc ? 'vence ' + dm(x.venc) : 'sem data', x.cat, x.esc === 'Pessoal' ? 'Pessoal' : '', x.parc].filter(Boolean).join(' · ');
  return '<div class="lin" data-id="' + x.id + '"><div class="t">' + esc(x.d || '(sem descrição)') + '<span class="s" title="' + esc(x.obs) + '">' + esc(sub) + (x.obs ? ' · ' + esc(x.obs) : '') + '</span></div>' +
    '<div class="v ' + sinal + '">' + (x.tipo === 'Saída' ? '− ' : '+ ') + brl(x.v) + '</div>' +
    (acoes === false ? '' : '<div class="acts"><button class="mini ok" data-a="pago">' + (x.tipo === 'Entrada' ? 'Recebido' : 'Pago') + '</button><button class="mini" data-a="adiar">Adiar</button><button class="mini" data-a="valor">Valor</button><button class="mini err" data-a="cancelar">Não vai</button></div>') + '</div>';
}
function bloco(titulo, lista, nota, acoes) {
  if (!lista || !lista.length) return '';
  var e = lista.filter(function (x) { return x.tipo === 'Entrada'; }), s = lista.filter(function (x) { return x.tipo === 'Saída'; });
  var tot = (e.length ? '<span class="ent">+ ' + brl(soma(e)) + '</span> ' : '') + (s.length ? '<span class="sai">− ' + brl(soma(s)) + '</span>' : '');
  return '<h2 class="sec">' + titulo + ' <span class="n">' + lista.length + '</span><small>' + tot + (nota ? ' · ' + nota : '') + '</small></h2><div class="card">' + lista.map(function (x) { return item(x, acoes); }).join('') + '</div>';
}
function desenhar() {
  var h = '', b = F.base;
  var atrE = F.atrasados.filter(function (x) { return x.tipo === 'Entrada'; }), atrS = F.atrasados.filter(function (x) { return x.tipo === 'Saída'; });
  h += '<div class="kpis">';
  h += kpi('Saldo agora', F.saldoAgora == null ? '—' : brl(F.saldoAgora),
    b ? 'Banco em ' + dm(b.dia) + ': ' + brl(b.valor) + (F.depois.length ? ' + ' + F.depois.length + ' pago(s) depois' : '') : 'Informe o saldo do banco', F.saldoAgora < 0 ? 'neg' : 'or');
  h += kpi('Fim dos 7 dias', F.fimSemana == null ? '—' : brl(F.fimSemana), 'Se tudo previsto acontecer no dia', F.fimSemana < 0 ? 'neg' : 'pos');
  h += kpi('Atrasado a receber', brl(soma(atrE)), atrE.length + ' lançamento(s), fora da projeção', atrE.length ? 'or' : '');
  h += kpi('Atrasado a pagar', brl(soma(atrS)), atrS.length + ' lançamento(s), fora da projeção', atrS.length ? 'neg' : '');
  h += kpi('Folha (40 dias)', brl(soma(F.folha)), F.folha.length + ' pagamento(s) da equipe');
  h += '</div>';
  // Semana dia a dia
  h += '<h2 class="sec">Próximos 7 dias <small>Saldo projetado = saldo agora + entradas − saídas previstas de cada dia. Toque no dia para ver.</small></h2><div class="card">';
  F.semana.forEach(function (d) {
    var neg = d.saldo != null && d.saldo < 0;
    h += '<div class="lin" data-dia="' + d.d + '" style="cursor:pointer"><div class="t"><b>' + esc(d.rot) + '</b>' + (d.d === F.hoje ? ' <span class="chip hj">hoje</span>' : '') +
      '<span class="s">' + (d.itens.length ? d.itens.length + ' lançamento(s)' : 'nada previsto') + '</span></div>' +
      '<div class="v ent">' + (d.ent ? '+ ' + brl(d.ent) : '') + '</div><div class="v sai" style="min-width:110px">' + (d.sai ? '− ' + brl(d.sai) : '') + '</div>' +
      '<div class="v" style="min-width:120px;color:' + (neg ? 'var(--err)' : 'var(--txt)') + '">' + (d.saldo == null ? '—' : brl(d.saldo)) + '</div></div>';
    if (abertoDia[d.d] && d.itens.length) h += '<div style="padding:0 0 6px 14px">' + d.itens.map(function (x) { return item(x); }).join('') + '</div>';
  });
  h += '</div>';
  h += bloco('Atrasados', F.atrasados, 'resolva: recebido/pago, adiar ou "não vai"');
  h += bloco('Folha e comissões', F.folha, 'vale dia 20 (40%) + saldo no 5º dia útil; conferir NF 48h antes');
  h += bloco('A receber (30 dias)', F.aReceber);
  h += bloco('A pagar (30 dias)', F.aPagar, 'contas, dívidas e acordos');
  h += bloco('A confirmar (possível venda)', F.possiveis, 'fora do saldo até virar Previsto');
  if (F.semData.length) h += bloco('Previstos sem data', F.semData);
  // Mês
  var m = F.mes;
  h += '<h2 class="sec">' + esc(m.nome) + ' até agora <small>só o que já está como pago</small></h2><div class="kpis">' +
    kpi('Entradas pagas', brl(m.entradas), 'Empresa ' + brl(m.entEmp) + ' · Pessoal ' + brl(m.entPes), 'pos') +
    kpi('Saídas pagas', brl(m.saidas), 'Empresa ' + brl(m.saiEmp) + ' · Pessoal ' + brl(m.saiPes), 'neg') +
    kpi('Resultado do mês', brl(m.entradas - m.saidas), '', m.entradas - m.saidas < 0 ? 'neg' : 'pos') + '</div>';
  if (m.cats.length) h += '<div class="card" style="margin-top:10px">' + m.cats.map(function (c) { return '<div class="lin"><div class="t">' + esc(c.cat) + '</div><div class="v sai">' + brl(c.v) + '</div></div>'; }).join('') + '</div>';
  // Imposto
  h += '<h2 class="sec">Imposto estimado</h2><div class="card"><div class="lin"><div class="t">' +
    (F.imposto ? 'Com ' + String(F.imposto.pct).replace('.', ',') + '%: ' + brl(F.imposto.sobrePago) + ' sobre as vendas já recebidas no mês (' + brl(F.imposto.vendasPagas) + ') e ' + brl(F.imposto.sobrePrevisto) + ' sobre as previstas (' + brl(F.imposto.vendasPrev) + ').'
      : 'Desligado. Só liga depois que o contador confirmar o percentual do Simples do CNPJ novo.') +
    '</div><div class="acts"><button class="mini" id="bImp">' + (F.imposto ? 'Mudar %' : 'Informar %') + '</button></div></div></div>';
  if (F.semValor) h += '<p class="hint">' + F.semValor + ' lançamento(s) previsto/pago sem valor no Notion ficaram de fora das contas.</p>';
  $('conteudo').innerHTML = h;
  $('rodapeF').innerHTML = rodapeEstado(F.estado);
  $('bImp').onclick = imposto;
}
function achar(id) {
  var todos = [].concat(F.atrasados, F.aReceber, F.aPagar, F.folha, F.possiveis, F.semData);
  F.semana.forEach(function (d) { todos = todos.concat(d.itens); });
  return todos.filter(function (x) { return x.id === id; })[0];
}
function mudar(x, campos, msg) {
  return api('fin_mudar', { id: x.id, campos: campos }).then(function (r) {
    if (!r.ok) { aviso(r.erro || 'Não salvou.', true); return r.erro || 'Não salvou.'; }
    aviso(msg || 'Salvo no Notion.'); carregar(); return '';
  });
}
function saldo() {
  modal('Informar saldo do banco', [
    { k: 'valor', rot: 'Saldo somado das contas (R$)', tipo: 'number', meia: 1 },
    { k: 'dia', rot: 'De que dia', tipo: 'date', v: hojeISO(), meia: 1 },
    { k: 'contas', rot: 'Quais contas (ex.: Itaú 1.200 + InfinitePay 300)' },
    { k: 'obs', rot: 'Observação (opcional)' }
  ], 'Gravar saldo', function (v) {
    return api('fin_saldo', { campos: v }).then(function (r) { if (!r.ok) return r.erro || 'Não gravou.'; aviso('Saldo gravado.'); carregar(); });
  }, 'Use o valor real que aparece no app do banco. Daqui pra frente o "Saldo agora" soma o que for marcado como pago depois desse dia.');
}
function imposto() {
  modal('Percentual do imposto', [{ k: 'imposto_pct', rot: 'Percentual (%) — deixe vazio para desligar', tipo: 'number', v: F.config.imposto_pct || '' }], 'Salvar', function (v) {
    return api('fin_config', { campos: v }).then(function (r) { if (!r.ok) return r.erro || 'Não gravou.'; aviso('Salvo.'); carregar(); });
  }, 'Só preencha com o percentual que o contador confirmar. Sem número inventado.');
}
window.iniciarFin = function () {
  if (!sessao()) { $('conteudo').innerHTML = '<p class="erro">Abra esta aba pelo Painel Central (lp.grupoeuforia.tech/diretoria).</p>'; return; }
  $('bSaldo').onclick = saldo;
  $('bLancF').onclick = function () { novoLancamento({}, carregar); };
  $('conteudo').addEventListener('click', function (e) {
    var dia = e.target.closest('[data-dia]'); if (dia && !e.target.closest('[data-a]')) { var d = dia.getAttribute('data-dia'); abertoDia[d] = !abertoDia[d]; desenhar(); return; }
    var b = e.target.closest('[data-a]'); if (!b) return; var l = b.closest('[data-id]'); var x = l && achar(l.getAttribute('data-id')); if (!x) return;
    var a = b.getAttribute('data-a');
    if (a === 'pago') modal(x.tipo === 'Entrada' ? 'Marcar como recebido' : 'Marcar como pago', [{ k: 'pago', rot: 'Em que dia', tipo: 'date', v: hojeISO() }], 'Confirmar', function (v) {
      return mudar(x, { status: 'Pago', pago: v.pago }, 'Marcado como pago.'); }, esc(x.d) + ' · ' + brl(x.v));
    else if (a === 'adiar') modal('Adiar', [{ k: 'venc', rot: 'Novo vencimento', tipo: 'date', v: maisDias(7, x.venc && x.venc > hojeISO() ? x.venc : hojeISO()) }], 'Salvar', function (v) {
      return mudar(x, { venc: v.venc }, 'Vencimento mudado.'); }, esc(x.d) + ' · ' + brl(x.v));
    else if (a === 'valor') modal('Corrigir valor', [{ k: 'valor', rot: 'Valor (R$)', tipo: 'number', v: x.v }], 'Salvar', function (v) {
      return mudar(x, { valor: v.valor }, 'Valor corrigido.'); }, esc(x.d));
    else if (a === 'cancelar') modal('Não vai acontecer?', [{ k: 'status', rot: 'Marcar como', tipo: 'select', ops: [['Não realizado', 'Não realizado'], ['Cancelado', 'Cancelado']] }], 'Confirmar', function (v) {
      return mudar(x, { status: v.status }, 'Tirado da previsão.'); }, esc(x.d) + ' · ' + brl(x.v) + '. Sai da previsão, mas continua no Notion.');
  });
  carregar();
  setInterval(function () { if (aba === 'fin' && !document.hidden && !document.querySelector('.modal')) carregar(); }, 120000);
};
})();
