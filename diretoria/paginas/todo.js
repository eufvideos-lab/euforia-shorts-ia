(function () {
// Aba To-do do Painel Central: ✅ Minhas Pendências do Notion, lido da cópia rápida.
var D = null, filtro = 'meus', busca = '', abertos = {}, verAntigas = false;
var PRIOS = ['🔴 Urgente', '🟠 Alta', '🟡 Média', '⚪ Baixa'];
var SETORES = ['Clientes', 'Comercial', 'Financeiro', 'Equipe', 'Jurídico', 'Pessoal'];
var MAQS = [['carrossel', 'Carrossel'], ['shorts', 'Shorts'], ['longo', 'Vídeo longo'], ['thumb', 'Thumbnail (escreva "Tema da thumb: …")'], ['arte', 'Arte'],
  ['idv', 'ID visual'], ['pautas', 'Pautas e roteiros'], ['copy', 'Copy'], ['pagina', 'Página'], ['funil', 'Funil'], ['insta', 'Insta-Blindado'],
  ['relatorio', 'Relatório'], ['situacao', 'Situação completa'], ['cronograma', 'Cronograma'], ['estrategia', 'Estratégia'], ['recuperacao', 'Estratégia de recuperação'],
  ['alinhamento', 'Apresentação de alinhamento'], ['call', 'Apresentação de call'], ['setup', 'Setup'], ['outro', 'Outro (mín. 40 letras)']];

function carregar() {
  return api('todo').then(function (r) {
    if (!r.ok) { $('lista').innerHTML = '<p class="erro">' + esc(r.erro || 'Não carregou.') + '</p>'; return; }
    D = r; desenhar();
  });
}
function meu(i) { return !i.re || i.re === 'Flau'; }
function grupoDe(i, hoje) {
  if (i.st === 'Feito') return 'feito';
  if (i.st === 'Aguardando terceiros') return 'aguardando';
  if (!i.d) return 'semdata';
  if (i.d < hoje) return 'atrasadas';
  if (i.d === hoje) return 'hoje';
  if (i.d <= maisDias(7, hoje)) return 'semana';
  return 'depois';
}
var GRUPOS = [['atrasadas', 'Atrasadas'], ['hoje', 'Hoje'], ['semana', 'Próximos 7 dias'], ['semdata', 'Sem data'], ['depois', 'Mais pra frente'],
  ['aguardando', 'Aguardando alguém'], ['feito', 'Feitas (últimos 3 dias)']];
var ORD_P = { '🔴 Urgente': 0, '🟠 Alta': 1, '🟡 Média': 2, '⚪ Baixa': 3, '': 4 };
function desenhar() {
  var hoje = D.hoje, q = busca.toLowerCase();
  var todos = D.itens.filter(function (i) {
    if (filtro === 'meus' && !meu(i)) return false;
    if (filtro === 'equipe' && meu(i)) return false;
    if (q && (i.t + ' ' + i.cp + ' ' + i.cx + ' ' + i.se).toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
  var itens = todos.filter(function (i) { return !i.antiga; }), antigas = todos.filter(function (i) { return i.antiga; });
  var por = {}; itens.forEach(function (i) { var g = grupoDe(i, hoje); (por[g] = por[g] || []).push(i); });
  $('cHoje').textContent = (por.hoje || []).length; $('cAtr').textContent = (por.atrasadas || []).length;
  var html = '';
  GRUPOS.forEach(function (g) {
    var l = por[g[0]] || []; if (!l.length) return;
    l.sort(function (a, b) {
      if (g[0] === 'feito') return String(b.e || '').localeCompare(String(a.e || ''));
      return (ORD_P[a.pr] - ORD_P[b.pr]) || String(a.d || '9').localeCompare(String(b.d || '9'));
    });
    var max = abertos[g[0]] ? l.length : (g[0] === 'atrasadas' ? 25 : 60);
    html += '<h2 class="sec">' + g[1] + ' <span class="n">' + l.length + '</span>' + (g[0] === 'atrasadas' ? '<small>As mais urgentes primeiro. Dica: reagende ou marque como feito o que já passou.</small>' : '') + '</h2><div class="card">';
    html += l.slice(0, max).map(function (i) { return linha(i, hoje); }).join('');
    if (l.length > max) html += '<div class="lin"><button class="ghost" data-mais="' + g[0] + '">Ver mais ' + (l.length - max) + '</button></div>';
    html += '</div>';
  });
  if (!html) html = '<p class="vazio">Lista limpa. Anote acima o que for surgindo.</p>';
  if (antigas.length || D.corte) {
    html += '<h2 class="sec" style="margin-top:28px"><button class="ghost" id="bAntigas">' + (verAntigas ? '▾' : '▸') + ' Antigas (anteriores a ' + (D.corte ? dm(String(D.corte).slice(0, 10)) : 'hoje') + ') <span class="n">' + antigas.length + '</span></button>' +
      '<small>Ficam guardadas aqui e no Notion. Abra quando quiser revisar uma por uma.</small></h2>';
    if (verAntigas) {
      antigas.sort(function (a, b) { return (ORD_P[a.pr] - ORD_P[b.pr]) || String(b.d || '').localeCompare(String(a.d || '')); });
      var maxA = abertos.antigas ? antigas.length : 40;
      html += '<div class="card" style="opacity:.85">' + antigas.slice(0, maxA).map(function (i) { return linha(i, hoje); }).join('') +
        (antigas.length > maxA ? '<div class="lin"><button class="ghost" data-mais="antigas">Ver mais ' + (antigas.length - maxA) + '</button></div>' : '') + '</div>';
    }
  }
  html += '<p class="hint" style="margin-top:18px"><button class="ghost" id="bZerar">Mandar a lista de agora para Antigas</button></p>';
  $('lista').innerHTML = html;
  $('rodape').innerHTML = rodapeEstado(D.estado);
}
function linha(i, hoje) {
  var chips = '';
  if (i.d) chips += '<span class="chip' + (i.d < hoje && i.st !== 'Feito' ? ' at' : i.d === hoje ? ' hj' : '') + '">' + dm(i.d) + '</span>';
  if (i.pr) chips += '<span class="chip">' + esc(i.pr) + '</span>';
  if (i.se) chips += '<span class="chip">' + esc(i.se) + '</span>';
  if (i.re && i.re !== 'Flau') chips += '<span class="chip">' + esc(i.re) + '</span>';
  if (i.cp) chips += '<span class="chip">' + esc(i.cp) + '</span>';
  var feito = i.st === 'Feito';
  return '<div class="lin" data-id="' + i.id + '"><input type="checkbox" class="ck" title="Feito"' + (feito ? ' checked' : '') + ' style="width:18px;height:18px;flex:none;accent-color:#FF6518">' +
    '<div class="t"' + (feito ? ' style="opacity:.5;text-decoration:line-through"' : '') + '>' + esc(i.t || '(sem título)') + '<span class="s">' + chips + (i.cx ? ' ' + esc(i.cx.length > 280 ? i.cx.slice(0, 280) + '…' : i.cx) : '') + '</span></div>' +
    '<div class="acts"><button class="mini" data-a="hoje">Hoje</button><button class="mini" data-a="amanha">Amanhã</button><button class="mini" data-a="data">Data</button>' +
    '<button class="mini" data-a="passar">Passar</button><button class="mini" data-a="msg">Mensagem</button><button class="mini" data-a="maquina">Máquina</button><button class="mini" data-a="lanc">R$</button>' +
    '<button class="mini" data-a="mais">⋯</button></div></div>';
}
function achar(id) { return D.itens.filter(function (x) { return x.id === id; })[0]; }
function mudar(i, campos, msg) {
  var antes = JSON.stringify(i);
  if (campos.status) i.st = campos.status; if ('data' in campos) i.d = campos.data; if ('prio' in campos) i.pr = campos.prio;
  if ('setor' in campos) i.se = campos.setor; if (campos.texto) i.t = campos.texto; if ('contexto' in campos) i.cx = campos.contexto;
  i.e = new Date().toISOString(); desenhar();
  return api('todo_mudar', { id: i.id, campos: campos }).then(function (r) {
    if (!r.ok) { Object.assign(i, JSON.parse(antes)); desenhar(); aviso(r.erro || 'Não salvou.', true); return false; }
    if (msg) aviso(msg); return true;
  });
}
function criar() {
  var t = $('novo').value.trim(); if (t.length < 2) return;
  var campos = { texto: t };
  if ($('nData').value) campos.data = $('nData').value;
  if ($('nPrio').value) campos.prio = $('nPrio').value;
  if ($('nSetor').value) campos.setor = $('nSetor').value;
  $('novo').value = ''; $('novo').focus();
  var tmp = { id: 'tmp' + Date.now(), t: t, st: 'A fazer', pr: campos.prio || '', se: campos.setor || '', re: 'Flau', d: campos.data || '', cx: '', cp: '', e: new Date().toISOString() };
  D.itens.unshift(tmp); desenhar();
  api('todo_criar', { campos: campos }).then(function (r) {
    if (!r.ok) { D.itens = D.itens.filter(function (x) { return x !== tmp; }); desenhar(); $('novo').value = t; aviso(r.erro || 'Não salvou.', true); return; }
    tmp.id = r.id; tmp.url = r.url; desenhar(); aviso('Anotado no ✅ Minhas Pendências.');
  });
}
function passar(i) {
  modal('Passar para alguém', [
    { k: 'para', rot: 'Para quem', tipo: 'select', ops: [['Rômulo', 'Rômulo'], ['Ismael', 'Ismael'], ['Rômulo + Ismael', 'Rômulo + Ismael'], ['Diogo', 'Diogo'], ['Advogado', 'Advogado']], meia: 1 },
    { k: 'prazo', rot: 'Prazo', tipo: 'date', v: i.d && i.d >= D.hoje ? i.d : maisDias(1, D.hoje), meia: 1 },
    { k: 'tipo', rot: 'Tipo', tipo: 'select', ops: [['Processo interno', 'Processo interno'], ['Entrega', 'Entrega'], ['Resposta ao cliente', 'Resposta ao cliente'], ['Agenda', 'Agenda'], ['Rescisão / Jurídico', 'Rescisão / Jurídico']], meia: 1 },
    { k: 'prio', rot: 'Prioridade', tipo: 'select', ops: [['Média', 'Média'], ['Alta', 'Alta'], ['Urgente', 'Urgente'], ['Baixa', 'Baixa']], v: /Urgente/.test(i.pr) ? 'Urgente' : /Alta/.test(i.pr) ? 'Alta' : 'Média', meia: 1 },
    { k: 'texto', rot: 'Tarefa', v: i.t },
    { k: 'cliente', rot: 'Cliente (opcional)', v: i.cp },
    { k: 'contexto', rot: 'Contexto', tipo: 'textarea', v: i.cx }
  ], 'Criar card', function (v) {
    return api('todo_passar', { campos: v }).then(function (r) {
      if (!r.ok) return r.erro || 'Não deu certo.';
      mudar(i, { status: 'Aguardando terceiros', link: r.url, contexto: (i.cx ? i.cx + '\n' : '') + 'Passado para ' + v.para + ' em ' + dm(D.hoje) + ' (Pendências de Clientes).' });
      i.link = r.url;
      setTimeout(function () { avisarDiscord(v); }, 50);
    });
  }, 'Cria o card no quadro Pendências de Clientes, com responsável, prazo e contexto. O item daqui fica em "Aguardando alguém".');
}
function avisarDiscord(v) {
  var txt = '📌 ' + v.para + ': nova tarefa da direção' + (v.prazo ? ' (prazo ' + dm(v.prazo) + ')' : '') + '\n' + v.texto + (v.cliente ? '\nCliente: ' + v.cliente : '') + '\nEstá no quadro Pendências de Clientes.';
  modal('Avisar no #dia-a-dia?', [{ k: 'texto', rot: 'Mensagem no Discord', tipo: 'textarea', v: txt }], 'Enviar no Discord', function (x) {
    return api('avisar', { campos: x }).then(function (r) { if (!r.ok) return r.erro || 'O Discord não aceitou.'; aviso('Aviso enviado no #dia-a-dia.'); });
  }, 'Card criado. O aviso só sai se você clicar em Enviar. Pode editar o texto.');
}
function maquina(i) {
  modal('Mandar para a máquina', [
    { k: 'cliente', rot: 'Cliente', tipo: 'select', ops: [['', 'Escolha…']].concat(D.clientes.map(function (c) { return [c.id, c.nome]; })) },
    { k: 'tipo', rot: 'O que fazer', tipo: 'select', ops: [['', 'Escolha…']].concat(MAQS), meia: 1 },
    { k: 'prazo', rot: 'Prazo', tipo: 'date', v: i.d && i.d >= D.hoje ? i.d : maisDias(2, D.hoje), meia: 1 },
    { k: 'modo', rot: 'Como', tipo: 'select', ops: [['auto', 'Automático (máquina faz)'], ['mao', 'À mão (escritório)']] },
    { k: 'texto', rot: 'Pedido', tipo: 'textarea', v: i.t + (i.cx ? '\n' + i.cx : '') },
    { k: 'link', rot: 'Link (opcional)', v: i.link || '' }
  ], 'Mandar', function (v) {
    return api('maquina', { campos: v }).then(function (r) {
      if (!r.ok) return 'Não foi: ' + ({ acesso: 'acesso de diretor', tipo: 'tipo', cliente: 'cliente inválido ou encerrado', prazo: 'prazo no passado', texto: 'pedido curto demais', tema: 'falta "Tema da thumb: …"' }[r.erro] || r.erro);
      mudar(i, { status: 'Aguardando terceiros', contexto: (i.cx ? i.cx + '\n' : '') + 'Mandado para ' + (r.quem || 'a máquina') + ' em ' + dm(D.hoje) + ': ' + (r.titulo || '') });
      aviso('Pedido criado no Entregas: ' + (r.quem || 'máquina') + '.');
    });
  }, 'Mesmo caminho do "Pedido ao escritório" do painel da equipe: cria o card no Entregas e, quando é automático, o pedido no quadro da máquina.');
}
function fone(chat) {
  var c = String(chat || '');
  if (/@g\.us$/.test(c)) return 'grupo de WhatsApp';
  var n = c.replace(/@.*/, '');
  if (/^55\d{10,11}$/.test(n)) return '+55 ' + n.slice(2, 4) + ' ' + n.slice(4, n.length - 4) + '-' + n.slice(-4);
  return '+' + n;
}
var INSTS = [['isabela', 'Isabela (cobrança e financeiro)'], ['suporte', 'Suporte (Érica)']];
function nomeInst(k) { return k === 'suporte' ? 'número do suporte (Érica)' : 'número da Isabela'; }
function mensagem(i) {
  modal('Mandar mensagem', [
    { k: 'quem', rot: 'Para quem (nome do contato ou grupo, ou número com DDD)', v: i.cp || '' },
    { k: 'texto', rot: 'Mensagem', tipo: 'textarea', v: '' }
  ], 'Revisar', function (v) {
    if (v.texto.length < 2) return 'Escreva a mensagem.';
    var dig = v.quem.replace(/\D/g, '');
    if (dig.length >= 10 && dig.length <= 13 && !/[a-zA-Z]/.test(v.quem)) {
      setTimeout(function () { confirmar(i, { chat: (dig.length <= 11 ? '55' : '') + dig, nome: '', inst: 'isabela' }, v.texto); }, 30);
      return '';
    }
    return api('msg_buscar', { campos: { q: v.quem } }).then(function (r) {
      if (!r.ok) return r.erro || 'Não achei.';
      if (!r.lista.length) return 'Não achei esse contato nas conversas da Isabela e do suporte. Tente outro nome ou digite o número.';
      setTimeout(function () {
        if (r.lista.length === 1) { confirmar(i, r.lista[0], v.texto); return; }
        modal('Qual destes?', [{ k: 'c', rot: 'Contato', tipo: 'select', ops: r.lista.map(function (x, n) {
          return [n, (x.nome || 'sem nome') + ' · ' + fone(x.chat) + ' · ' + (x.inst === 'suporte' ? 'suporte' : 'Isabela') + (x.ultima ? ' · última conversa ' + dm(x.ultima) : '')]; }) }],
        'Continuar', function (y) { setTimeout(function () { confirmar(i, r.lista[Number(y.c)], v.texto); }, 30); return ''; });
      }, 30);
      return '';
    });
  }, 'Nada sai daqui ainda: na próxima tela você confere destinatário, número e texto antes de enviar. Para cliente, assine como Isabela ou Érica, nunca no seu nome.');
}
function confirmar(i, ct, texto) {
  modal('Conferir e enviar', [
    { k: 'inst', rot: 'Sai pelo número', tipo: 'select', ops: INSTS, v: ct.inst === 'suporte' ? 'suporte' : 'isabela' },
    { k: 'texto', rot: 'Mensagem', tipo: 'textarea', v: texto }
  ], 'Enviar agora', function (v) {
    return api('msg_enviar', { campos: { inst: v.inst, para: ct.chat, texto: v.texto } }).then(function (r) {
      if (!r.ok) return r.erro || 'Não enviou.';
      var quem = (ct.nome || fone(ct.chat));
      aviso('Mensagem enviada para ' + quem + '.');
      mudar(i, { status: 'Aguardando terceiros', contexto: (i.cx ? i.cx + '\n' : '') + 'Mensagem enviada para ' + quem + ' em ' + dm(D.hoje) + ' pelo ' + nomeInst(v.inst) + '.' });
    });
  }, '<b>Para:</b> ' + esc(ct.nome || 'número digitado') + ' · <b>' + esc(fone(ct.chat)) + '</b>. Só sai quando você clicar em Enviar agora.');
}
function mais(i) {
  modal('Editar pendência', [
    { k: 'texto', rot: 'Pendência', v: i.t },
    { k: 'data', rot: 'Data limite', tipo: 'date', v: i.d, meia: 1 },
    { k: 'prio', rot: 'Prioridade', tipo: 'select', ops: [['', '—']].concat(PRIOS.map(function (p) { return [p, p]; })), v: i.pr, meia: 1 },
    { k: 'setor', rot: 'Setor', tipo: 'select', ops: [['', '—']].concat(SETORES.map(function (p) { return [p, p]; })), v: i.se, meia: 1 },
    { k: 'status', rot: 'Status', tipo: 'select', ops: [['A fazer', 'A fazer'], ['Em andamento', 'Em andamento'], ['Aguardando terceiros', 'Aguardando alguém'], ['Feito', 'Feito']], v: i.st, meia: 1 },
    { k: 'contexto', rot: 'Contexto', tipo: 'textarea', v: i.cx }
  ], 'Salvar', function (v) {
    return mudar(i, v, 'Salvo no Notion.').then(function (ok) { return ok ? '' : 'Não salvou.'; });
  }, '<a href="https://www.notion.so/' + i.id + '" target="_blank" rel="noopener">Abrir no Notion</a>' + (i.link ? ' · <a href="' + esc(i.link) + '" target="_blank" rel="noopener">Link do item</a>' : ''));
}
window.iniciarTodo = function () {
  if (!sessao()) { $('lista').innerHTML = '<p class="erro">Abra esta aba pelo Painel Central (lp.grupoeuforia.tech/diretoria).</p>'; return; }
  $('novo').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); criar(); } });
  $('bNovo').onclick = criar;
  $('busca').addEventListener('input', function () { busca = this.value; desenhar(); });
  [].forEach.call(document.querySelectorAll('[data-f]'), function (b) {
    b.onclick = function () { filtro = b.getAttribute('data-f'); [].forEach.call(document.querySelectorAll('[data-f]'), function (x) { x.style.borderColor = x === b ? 'var(--or)' : ''; }); desenhar(); };
  });
  $('bLanc').onclick = function () { novoLancamento(); };
  $('lista').addEventListener('click', function (e) {
    var m = e.target.closest('[data-mais]'); if (m) { abertos[m.getAttribute('data-mais')] = 1; desenhar(); return; }
    if (e.target.closest('#bAntigas')) { verAntigas = !verAntigas; desenhar(); return; }
    if (e.target.closest('#bZerar')) { modal('Mandar a lista para Antigas?', [], 'Mandar', function () {
      return api('todo_zerar').then(function (r) { if (!r.ok) return r.erro || 'Não deu certo.'; aviso('Lista limpa. O que está nela foi para Antigas.'); verAntigas = false; carregar(); }); },
      'Tudo que está na lista agora vai para a seção Antigas (nada é apagado do Notion). O que você anotar depois aparece normal.'); return; }
    var l = e.target.closest('.lin[data-id]'); if (!l) return; var i = achar(l.getAttribute('data-id')); if (!i || /^tmp/.test(i.id)) return;
    if (e.target.classList.contains('ck')) { mudar(i, { status: e.target.checked ? 'Feito' : 'A fazer' }, e.target.checked ? 'Feito ✓' : 'Reaberta.'); return; }
    var b = e.target.closest('[data-a]'); if (!b) return; var a = b.getAttribute('data-a');
    if (a === 'hoje') mudar(i, { data: D.hoje }, 'Para hoje.');
    else if (a === 'amanha') mudar(i, { data: maisDias(1, D.hoje) }, 'Para amanhã.');
    else if (a === 'data') modal('Mudar a data', [{ k: 'data', rot: 'Data limite', tipo: 'date', v: i.d || D.hoje }], 'Salvar', function (v) { return mudar(i, { data: v.data }, 'Data mudada.').then(function (ok) { return ok ? '' : 'Não salvou.'; }); });
    else if (a === 'passar') passar(i);
    else if (a === 'msg') mensagem(i);
    else if (a === 'maquina') maquina(i);
    else if (a === 'lanc') novoLancamento({ desc: i.t, venc: i.d || D.hoje, obs: 'Veio do To-do.' });
    else if (a === 'mais') mais(i);
  });
  carregar();
  setInterval(function () { if (aba === 'todo' && !document.hidden && !document.querySelector('.modal')) carregar(); }, 120000);
  window.addEventListener('focus', function () { if (aba === 'todo' && D && !document.querySelector('.modal')) carregar(); });
};
})();
