// Comum às abas do Painel Central (To-do e Financeiro). A sessão vem da casca (/diretoria), no sessionStorage.
var API = 'https://n8n.grupoeuforia.tech/webhook/diretoria-central';
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function sessao() { try { return JSON.parse(sessionStorage.getItem('painelCasca_central') || 'null'); } catch (e) { return null; } }
function api(acao, extra) {
  var s = sessao() || {};
  var corpo = Object.assign({ usuario: s.usuario, token: s.token, acao: acao }, extra || {});
  return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
    .then(function (r) { return r.json(); })
    .catch(function () { return { ok: false, erro: 'Sem conexão. Tente de novo.' }; })
    .then(function (r) {
      if (r && r.ok === false && r.erro === 'sessao') { r.erro = 'Sua sessão acabou. Saia e entre de novo no Painel Central.'; }
      return r || { ok: false, erro: 'Sem resposta.' };
    });
}
function brl(v) { if (v == null || isNaN(v)) return '—'; return (v < 0 ? '− ' : '') + 'R$ ' + Math.abs(Number(v)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function dm(d) { return d ? d.slice(8, 10) + '/' + d.slice(5, 7) : ''; }
function hojeISO() { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
function maisDias(n, base) { var d = base ? new Date(base + 'T12:00:00') : new Date(); d.setDate(d.getDate() + n); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
var _t;
function aviso(txt, erro) {
  var el = $('toast'); if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.className = 'toast' + (erro ? ' err' : ''); el.textContent = txt; el.hidden = false;
  clearTimeout(_t); _t = setTimeout(function () { el.hidden = true; }, erro ? 6000 : 3000);
}
// Modal simples: campos [{k, rot, tipo:'text|date|select|textarea|number', ops:[[valor, rótulo]], v, meia}]
function modal(titulo, campos, botao, enviar, nota) {
  var m = document.createElement('div'); m.className = 'modal';
  var html = '<div class="box"><h3>' + esc(titulo) + '</h3>' + (nota ? '<p class="hint">' + nota + '</p>' : '');
  var linha = [];
  function campo(c) {
    var id = 'm_' + c.k, v = c.v == null ? '' : c.v, h = '<div><label for="' + id + '">' + esc(c.rot) + '</label>';
    if (c.tipo === 'select') h += '<select id="' + id + '">' + c.ops.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
    else if (c.tipo === 'textarea') h += '<textarea id="' + id + '">' + esc(v) + '</textarea>';
    else h += '<input id="' + id + '" type="' + (c.tipo || 'text') + '" value="' + esc(v) + '"' + (c.tipo === 'number' ? ' step="0.01" inputmode="decimal"' : '') + '>';
    return h + '</div>';
  }
  campos.forEach(function (c) {
    if (c.meia) { linha.push(campo(c)); if (linha.length === 2) { html += '<div class="row">' + linha.join('') + '</div>'; linha = []; } }
    else { if (linha.length) { html += '<div class="row">' + linha.join('') + '</div>'; linha = []; } html += campo(c); }
  });
  if (linha.length) html += '<div class="row">' + linha.join('') + '</div>';
  html += '<p class="msg" id="m_msg"></p><div class="pe"><button class="ghost" type="button" id="m_x">Cancelar</button><button class="btn" type="button" id="m_ok">' + esc(botao) + '</button></div></div>';
  m.innerHTML = html; document.body.appendChild(m);
  var primeiro = m.querySelector('input,textarea,select'); if (primeiro) primeiro.focus();
  function fechar() { m.remove(); }
  m.addEventListener('click', function (e) { if (e.target === m) fechar(); });
  $('m_x').onclick = fechar;
  $('m_ok').onclick = function () {
    var val = {}; campos.forEach(function (c) { val[c.k] = $('m_' + c.k).value.trim(); });
    $('m_ok').disabled = true; $('m_msg').textContent = '';
    Promise.resolve(enviar(val)).then(function (erro) {
      if (erro) { $('m_ok').disabled = false; $('m_msg').textContent = erro; } else fechar();
    });
  };
  return m;
}
function rodapeEstado(estado) {
  var nomes = { entregas: 'Entregas', clientes: 'Clientes', lancamentos: 'Lançamentos', pendencias: 'Pendências' };
  return '<p class="estado">Cópia rápida do Notion: ' + (estado || []).map(function (e) {
    return esc(nomes[e.db] || e.db) + ' ' + esc(e.sync || '—') + (e.erro ? ' <b>(erro)</b>' : e.velho ? ' <b>(atrasada)</b>' : '');
  }).join(' · ') + '. O Notion continua sendo o oficial.</p>';
}
var CATS = ['Nova venda', 'Renovação', 'Mensalidade / recebimento', 'Avulso / upsell', 'Sinal', 'Aporte', 'Empréstimo recebido', 'Outras entradas',
  'Equipe', 'Comissões e bônus', 'Ferramentas', 'Escritório', 'Tráfego', 'Equipamentos', 'Treinamentos', 'Reembolso', 'Dívida', 'Impostos e contador',
  'Fatura de cartão', 'Reserva para meta', 'Casa e família', 'Pró-labore', 'Retirada', 'Outras saídas'];
function novoLancamento(pre, depois) {
  pre = pre || {};
  modal('Novo lançamento', [
    { k: 'desc', rot: 'Descrição', v: pre.desc || '' },
    { k: 'tipo', rot: 'Tipo', tipo: 'select', ops: [['Saída', 'Saída (pagar)'], ['Entrada', 'Entrada (receber)']], v: pre.tipo || 'Saída', meia: 1 },
    { k: 'valor', rot: 'Valor (R$)', tipo: 'number', v: pre.valor || '', meia: 1 },
    { k: 'cat', rot: 'Categoria', tipo: 'select', ops: [['', 'Escolha…']].concat(CATS.map(function (c) { return [c, c]; })), v: pre.cat || '', meia: 1 },
    { k: 'esc', rot: 'Empresa ou pessoal', tipo: 'select', ops: [['Empresa', 'Empresa'], ['Pessoal', 'Pessoal']], v: pre.esc || 'Empresa', meia: 1 },
    { k: 'status', rot: 'Situação', tipo: 'select', ops: [['Previsto', 'Previsto'], ['Pago', 'Já pago'], ['Possível venda', 'Possível venda (a confirmar)']], v: 'Previsto', meia: 1 },
    { k: 'venc', rot: 'Vencimento', tipo: 'date', v: pre.venc || hojeISO(), meia: 1 },
    { k: 'obs', rot: 'Observação (opcional)', v: pre.obs || '' }
  ], 'Lançar no Notion', function (v) {
    return api('fin_lancar', { campos: v }).then(function (r) {
      if (!r.ok) return r.erro || 'Não deu certo.';
      aviso('Lançado no 💸 Lançamentos.'); if (depois) depois(r);
    });
  }, 'Vai direto para o 💸 Lançamentos do Notion (Origem: Manual).');
}
