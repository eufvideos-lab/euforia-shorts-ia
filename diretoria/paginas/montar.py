# Junta base.css + comum.js + a página em um HTML só (o "Sites | Publicar LP" recebe um arquivo).
import sys
css = open('base.css').read(); comum = open('comum.js').read()
HEAD = '''<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>{titulo}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,500..900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>{css}</style></head><body><div class="in">
'''
PAGS = {
 'todo': ('Painel Central · To-do', '''<div class="topo">
<input id="novo" placeholder="Anote e aperte Enter (ex.: ligar para o contador)" style="flex:2;min-width:220px" autocomplete="off">
<input id="nData" type="date" title="Data limite (opcional)" style="width:150px;flex:none">
<select id="nPrio" title="Prioridade" style="width:130px;flex:none"><option value="">Prioridade</option><option>🔴 Urgente</option><option>🟠 Alta</option><option>🟡 Média</option><option>⚪ Baixa</option></select>
<select id="nSetor" title="Setor" style="width:120px;flex:none"><option value="">Setor</option><option>Clientes</option><option>Comercial</option><option>Financeiro</option><option>Equipe</option><option>Jurídico</option><option>Pessoal</option></select>
<button class="btn" id="bNovo">Anotar</button></div>
<div class="topo" style="margin-top:12px"><button class="ghost" data-f="meus" style="border-color:var(--or)">Meus</button><button class="ghost" data-f="equipe">De outros</button><button class="ghost" data-f="todos">Todos</button>
<span class="mut" style="font-size:13px">Hoje: <b id="cHoje">–</b> · Atrasadas: <b id="cAtr" style="color:var(--err)">–</b></span><span class="esp"></span>
<input id="busca" placeholder="Buscar" style="width:200px"><button class="ghost" id="bLanc">+ Lançamento</button></div>
<div id="lista"><p class="vazio">Carregando…</p></div><div id="rodape"></div>''', 'todo.js'),
 'financeiro': ('Painel Central · Financeiro', '''<div class="topo"><span class="mut" style="font-size:13px">Valores do 💸 Lançamentos e do saldo que você informa. Nada é inventado; o que falta aparece como "—".</span><span class="esp"></span>
<button class="ghost" id="bSaldo">Informar saldo do banco</button><button class="btn" id="bLanc">+ Lançamento</button></div>
<div id="conteudo" style="margin-top:14px"><p class="vazio">Carregando…</p></div><div id="rodape"></div>''', 'financeiro.js'),
}
TABS = """<style>.tabs{display:flex;gap:6px;margin-bottom:16px}.tab{background:transparent;border:1px solid var(--line);border-radius:9px;padding:7px 14px;font-weight:700;font-size:13.5px}.tab.on{border-color:var(--or);color:var(--or2)}</style>
<div class="tabs"><button class="tab" data-t="todo">To-do</button><button class="tab" data-t="fin">Financeiro</button><button class="tab" data-t="evo">Evolução</button></div>"""
corpoT = PAGS['todo'][1]
corpoE = '''<div class="topo"><span class="mut" style="font-size:13px">O que foi construído, resolvido e decidido em cada dia, em todos os projetos. A rotina das 21h41 lança o dia.</span><span class="esp"></span>
<select id="evPer" style="width:170px;flex:none"><option value="1">Hoje</option><option value="7" selected>Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="">Tudo</option></select>
<select id="evProj" style="width:190px;flex:none"><option value="">Todos os projetos</option></select>
<select id="evTipo" style="width:160px;flex:none"><option value="">Todos os tipos</option><option value="construido">Construído</option><option value="resolvido">Resolvido</option><option value="decidido">Decidido</option><option value="dinheiro">Dinheiro</option><option value="vendido">Vendido</option><option value="pendente">Pendente</option></select></div>
<div id="evLista" style="margin-top:14px"><p class="vazio">Carregando…</p></div>'''
corpoF = PAGS['financeiro'][1].replace('id="bLanc"', 'id="bLancF"').replace('id="rodape"', 'id="rodapeF"')
INIT = """
var aba = '', iniciadas = {};
function abrirAba(t) {
  aba = t;
  [].forEach.call(document.querySelectorAll('.tab'), function (b) { b.classList.toggle('on', b.getAttribute('data-t') === t); });
  $('sTodo').hidden = t !== 'todo'; $('sFin').hidden = t !== 'fin'; $('sEvo').hidden = t !== 'evo';
  try { localStorage.setItem('centralAba', t); } catch (e) {}
  if (!iniciadas[t]) { iniciadas[t] = 1; (t === 'todo' ? window.iniciarTodo : t === 'evo' ? window.iniciarEvo : window.iniciarFin)(); }
}
document.addEventListener('click', function (e) { var b = e.target.closest('.tab[data-t]'); if (b) abrirAba(b.getAttribute('data-t')); });
document.addEventListener('DOMContentLoaded', function () {
  var q = new URLSearchParams(location.search).get('aba'), u = '';
  try { u = localStorage.getItem('centralAba') || ''; } catch (e) {}
  // Dentro da casca, ela clica na aba certa; fora dela, abre a última usada.
  setTimeout(function () { if (aba) return; var x = q || u; abrirAba(x === 'fin' || x === 'evo' ? x : 'todo'); }, window.parent !== window ? 1500 : 0);
});
"""
html = HEAD.format(titulo='Painel Central · Minha mesa', css=css) + TABS + '<section id="sTodo" hidden>' + corpoT + '</section><section id="sFin" hidden>' + corpoF + '</section><section id="sEvo" hidden>' + corpoE + '</section>' + \
  '\n</div><script>\n' + comum + '\n' + open('todo.js').read() + '\n' + open('financeiro.js').read() + '\n' + open('evolucao.js').read() + INIT + '\n</script></body></html>\n'
open('../publicar/diretoria-central.html', 'w').write(html)
print(len(html))
