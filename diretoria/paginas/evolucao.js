(function () {
// Aba Evolução do Painel Central: o Diário da diretoria (tabela do n8n), o mesmo da aba Evolução do painel da equipe.
var E = null, per = '7', proj = '', tipo = '';
var TIPO = { construido: ['hj', 'Construído'], resolvido: ['', 'Resolvido'], decidido: ['', 'Decidido'], dinheiro: ['', 'Dinheiro'], vendido: ['', 'Vendido'], entrega: ['', 'Entrega'], pendente: ['at', 'Pendente'] };
var COR = { construido: 'var(--or2)', resolvido: 'var(--ok)', decidido: '#7fb2ff', dinheiro: 'var(--ok)', vendido: 'var(--ok)', pendente: 'var(--warn)' };
function d0(s) { return new Date(String(s).slice(0, 10) + 'T12:00:00'); }
function dataLonga(s) {
  var x = d0(s), dias = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  return dias[x.getDay()] + ', ' + dm(String(s).slice(0, 10));
}
function rs(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function carregar() {
  var ss = sessao() || {};
  return fetch('https://n8n.grupoeuforia.tech/webhook/diretoria-central-evolucao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: ss.usuario, token: ss.token }) })
    .then(function (r) { return r.json(); }).catch(function () { return { ok: false, erro: 'Sem conexão. Tente de novo.' }; }).then(function (r) {
    if (r && r.erro === 'sessao') r.erro = 'Sua sessão acabou. Saia e entre de novo no Painel Central.';
    if (!r.ok) { $('evLista').innerHTML = '<p class="erro">' + esc(r.erro || 'Não consegui ler o diário agora.') + '</p>'; return; }
    r.itens.forEach(function (i) { i.tipo = String(i.tipo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(); });
    E = r; desenhar();
  });
}
function desenhar() {
  var hoje = E.hoje, desde = per ? maisDias(-(Number(per) - 1), hoje) : '';
  var L = E.itens.filter(function (i) { return (!desde || i.dia >= desde) && (!proj || i.projeto === proj) && (!tipo || i.tipo === tipo); });
  var dias = []; L.forEach(function (i) { if (dias.indexOf(i.dia) < 0) dias.push(i.dia); });
  var conta = function (t) { return L.filter(function (i) { return i.tipo === t; }).length; };
  var soma = function (t) { return L.filter(function (i) { return i.tipo === t && typeof i.valor === 'number'; }).reduce(function (a, i) { return a + i.valor; }, 0); };
  // Dinheiro que entrou: Entradas pagas do 💸 Lançamentos (não o que foi escrito no diário).
  var EN = (E.entradas || []).filter(function (e) { return e.dia && (!desde || e.dia >= desde) && e.dia <= hoje; });
  var caixa = EN.reduce(function (a, e) { return a + (e.valor || 0); }, 0);
  var feitos = L.filter(function (i) { return i.tipo !== 'pendente'; }).length;
  var h = '<div class="kpis">' +
    '<div class="kpi or"><small>Coisas feitas</small><b>' + feitos + '</b><span>em ' + dias.length + ' dia(s) com registro</span></div>' +
    '<div class="kpi"><small>Construídas</small><b>' + conta('construido') + '</b><span>fluxos, painéis, páginas</span></div>' +
    '<div class="kpi"><small>Resolvidas ou decididas</small><b>' + (conta('resolvido') + conta('decidido')) + '</b><span>problemas e decisões</span></div>' +
    '<div class="kpi pos"><small>Entrou no caixa</small><b>' + rs(caixa) + '</b><span>entradas pagas no Lançamentos (sem aporte e empréstimo)</span></div>' +
    '<div class="kpi pos"><small>Vendido ou renovado</small><b>' + rs(soma('vendido')) + '</b><span>registrado no diário</span></div>' +
    '<div class="kpi' + (conta('pendente') ? ' neg' : '') + '"><small>Pendentes</small><b>' + conta('pendente') + '</b><span>ficaram para depois</span></div></div>';
  // Semana a semana (começando na segunda), para ver a curva.
  var sem = {};
  L.forEach(function (i) { var x = d0(i.dia), w = (x.getDay() + 6) % 7; var k = maisDias(-w, i.dia.slice(0, 10)); sem[k] = sem[k] || { n: 0, r: 0 };
    if (i.tipo !== 'pendente') sem[k].n++; });
  EN.forEach(function (e) { var x = d0(e.dia), w = (x.getDay() + 6) % 7; var k = maisDias(-w, e.dia); sem[k] = sem[k] || { n: 0, r: 0 }; sem[k].r += e.valor || 0; });
  var ks = Object.keys(sem).sort(), max = Math.max.apply(null, [1].concat(ks.map(function (k) { return sem[k].n; })));
  if (ks.length > 1) {
    h += '<h2 class="sec">Semana a semana</h2><div class="card">' + ks.map(function (k) {
      return '<div class="lin"><div class="t" style="flex:none;width:150px">semana de ' + dm(k) + '</div><div style="flex:1;height:10px;background:var(--card2);border-radius:6px;overflow:hidden"><div style="height:100%;width:' + Math.round(sem[k].n / max * 100) + '%;background:var(--or)"></div></div>' +
        '<div class="v" style="min-width:150px">' + sem[k].n + ' feito(s)' + (sem[k].r ? ' · entrou ' + rs(sem[k].r) : '') + '</div></div>'; }).join('') + '</div>';
  }
  dias.forEach(function (d) {
    var itens = L.filter(function (i) { return i.dia === d; });
    h += '<h2 class="sec">' + esc(dataLonga(d)) + (d === hoje ? ' <span class="chip hj">hoje</span>' : '') + ' <span class="n">' + itens.filter(function (i) { return i.tipo !== 'pendente'; }).length + '</span></h2><div class="card">' +
      itens.map(function (i) { var t = TIPO[i.tipo] || ['', i.tipo];
        return '<div class="lin" style="align-items:flex-start"><span style="flex:none;width:8px;height:8px;border-radius:50%;margin-top:7px;background:' + (COR[i.tipo] || 'var(--mut)') + '"></span><div class="t"><b>' + esc(i.titulo) + '</b>' +
          (i.detalhe ? '<span style="display:block;color:var(--mut);font-size:13px;margin-top:3px;white-space:normal">' + esc(i.detalhe) + '</span>' : '') +
          '<span style="display:block;margin-top:5px"><span class="chip ' + t[0] + '">' + esc(t[1]) + '</span>' + (i.projeto ? '<span class="chip">' + esc(i.projeto) + '</span>' : '') + (i.area ? '<span class="chip">' + esc(i.area) + '</span>' : '') + (i.meta ? '<span class="chip">Meta: ' + esc(i.meta) + '</span>' : '') + '</span></div>' +
          (typeof i.valor === 'number' && (i.tipo === 'dinheiro' || i.tipo === 'vendido') ? '<div class="v ent">' + rs(i.valor) + '</div>' : '') + '</div>'; }).join('') + '</div>';
  });
  if (!dias.length) h += '<p class="vazio">Nenhum registro nesse período. A rotina das 21h41 lança o dia.</p>';
  $('evLista').innerHTML = h;
  var pj = $('evProj'), atuais = {}; E.itens.forEach(function (i) { if (i.projeto) atuais[i.projeto] = 1; });
  var ops = '<option value="">Todos os projetos</option>' + Object.keys(atuais).sort().map(function (p) { return '<option' + (p === proj ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('');
  if (pj.innerHTML !== ops) pj.innerHTML = ops;
}
window.iniciarEvo = function () {
  if (!sessao()) { $('evLista').innerHTML = '<p class="erro">Abra esta aba pelo Painel Central (lp.grupoeuforia.tech/diretoria).</p>'; return; }
  $('evPer').onchange = function () { per = this.value; if (E) desenhar(); };
  $('evProj').onchange = function () { proj = this.value; if (E) desenhar(); };
  $('evTipo').onchange = function () { tipo = this.value; if (E) desenhar(); };
  carregar();
  setInterval(function () { if (aba === 'evo' && !document.hidden) carregar(); }, 600000);
};
})();
