(function () {
// Aba Isa do Painel Central: sugestões da Isa para o privado do WhatsApp da Isabela. Nada sai sem o clique do Henrique.
var URL_ISA = 'https://n8n.grupoeuforia.tech/webhook/diretoria-central-isa';
var G = { serio: ['at', '🔴 Sério'], atencao: ['hj', '🟠 Atenção'], normal: ['', '⚪ Normal'] };
var CAT = { rescisao: 'rescisão', cancelamento: 'cancelamento', juridico: 'jurídico', reclamacao: 'reclamação', renegociacao: 'renegociação', cobranca: 'cobrança', pagamento: 'pagamento', nota_fiscal: 'nota fiscal', duvida: 'dúvida', outro: 'outro' };
var ST = { enviado: ['ent', 'Enviado'], recusado: ['sai', 'Recusado'], resolvido: ['', 'Resolvido'], arquivada: ['', 'Arquivada'], respondida_fora: ['', 'Respondida por outro caminho'], aprovado_espera: ['', 'Aprovado, sai às 7h'], refeita: ['', 'Refeita'] };
var R = null;
function chamar(acao, extra) {
  var ss = sessao() || {};
  return fetch(URL_ISA, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ usuario: ss.usuario, token: ss.token, acao: acao }, extra || {})) })
    .then(function (r) { return r.json(); }).catch(function () { return { ok: false, erro: 'Sem conexão. Tente de novo.' }; })
    .then(function (r) { if (r && r.erro === 'sessao') r.erro = 'Sua sessão acabou. Saia e entre de novo no Painel Central.'; return r || { ok: false, erro: 'Sem resposta.' }; });
}
function quando(iso) {
  if (!iso) return '';
  var d = new Date(iso), h = (Date.now() - d.getTime()) / 36e5;
  var dt = ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  return dt + ' (' + (h >= 48 ? Math.floor(h / 24) + ' dias' : h >= 1 ? Math.floor(h) + 'h' : Math.max(1, Math.round(h * 60)) + ' min') + ')';
}
function carregar() {
  $('isaLista').innerHTML = '<p class="vazio">Carregando…</p>';
  return chamar('ler').then(function (r) {
    if (!r.ok) { $('isaLista').innerHTML = '<p class="erro">' + esc(r.erro || 'Não consegui ler as sugestões agora.') + '</p>'; return; }
    R = r; desenhar();
  });
}
function cartao(s) {
  var g = G[s.gravidade] || G.normal, tem = String(s.texto || '').trim().length >= 2;
  var quem = s.quem === 'equipe' ? ' (equipe)' : s.quem === 'advogado' ? ' (advogado)' : '';
  return '<div class="card" style="margin-bottom:12px;padding:14px" data-id="' + s.id + '">' +
    '<div><span class="chip ' + g[0] + '">' + g[1] + '</span><span class="chip">' + esc(CAT[s.categoria] || s.categoria || '') + '</span><span class="chip">#' + s.id + '</span>' +
    ' <b>' + esc(s.contato) + '</b><span class="mut">' + esc(quem) + '</span></div>' +
    '<p class="mut" style="font-size:12.5px;margin-top:4px">Esperando desde ' + esc(quando(s.primeira_cliente)) + '</p>' +
    '<p style="margin-top:8px"><b>Resumo:</b> ' + esc(s.resumo) + '</p>' +
    '<p style="margin-top:4px"><b style="color:var(--or2)">Sugestão:</b> ' + esc(s.acao) + '</p>' +
    (s.tarefa ? '<p style="margin-top:6px;font-size:13.5px">📝 <b>Ao enviar, vira to-do no seu painel:</b> ' + esc(s.tarefa) + ' <span class="mut">(próximo dia útil)</span></p>' : '') +
    '<details style="margin-top:8px"><summary class="mut" style="cursor:pointer;font-size:13px">Ver as mensagens</summary>' +
    '<pre style="white-space:pre-wrap;font:inherit;font-size:13px;color:var(--mut);margin-top:6px">' + esc(s.mensagens) + '</pre>' +
    (s.contexto ? '<p class="mut" style="font-size:12px;margin-top:6px">Conversa anterior:</p><pre style="white-space:pre-wrap;font:inherit;font-size:12.5px;color:var(--mut)">' + esc(s.contexto) + '</pre>' : '') + '</details>' +
    '<label class="mut" style="display:block;font-size:12.5px;margin-top:10px">' + (tem ? 'Resposta (edite se quiser; a assinatura da Isabela entra sozinha)' : 'Sem rascunho: assunto da direção ou do Dr. Rinaldo. Escreva aqui se quiser que a Isabela responda.') + '</label>' +
    '<textarea id="isaT' + s.id + '" style="margin-top:4px;min-height:110px">' + esc(s.texto || '') + '</textarea>' +
    '<div class="topo" style="margin-top:10px"><button class="btn" data-isa-env="' + s.id + '">Enviar pela Isabela</button>' +
    '<button class="ghost" data-isa-rec="' + s.id + '">Recusar</button><button class="ghost" data-isa-ok="' + s.id + '">Já resolvi</button></div></div>';
}
function desenhar() {
  var A = R.abertas || [], D = R.recentes || [];
  var nS = A.filter(function (s) { return s.gravidade === 'serio'; }).length;
  var h = '<div class="kpis" style="margin-bottom:14px"><div class="kpi ' + (nS ? 'neg' : '') + '"><small>Sérios</small><b>' + nS + '</b><span>esperando você</span></div>' +
    '<div class="kpi or"><small>Abertas</small><b>' + A.length + '</b><span>sugestões da Isa</span></div>' +
    '<div class="kpi pos"><small>Decididas</small><b>' + D.length + '</b><span>últimos 3 dias</span></div></div>';
  h += A.length ? A.map(cartao).join('') : '<p class="vazio">Nada esperando você no privado da Isabela. 🎉</p>';
  if (D.length) {
    h += '<h3 style="margin:22px 0 6px;font-size:15px">Decididas nos últimos 3 dias</h3><div class="card">' + D.map(function (s) {
      var st = ST[s.status] || ['', s.status];
      return '<div class="lin"><div class="t"><b>' + esc(s.contato) + '</b> <span class="chip ' + st[0] + '">' + esc(st[1]) + '</span>' +
        '<span class="s">' + esc(s.resumo) + '</span>' + (s.texto_final ? '<span class="s">“' + esc(String(s.texto_final).slice(0, 160)) + '”</span>' : '') + '</div>' +
        '<div class="v mut" style="font-weight:500;font-size:12.5px">' + esc(quando(s.decidido_em).split(' (')[0]) + '</div></div>';
    }).join('') + '</div>';
  }
  $('isaLista').innerHTML = h;
}
function decidir(acao, id, extra, botao) {
  if (botao) botao.disabled = true;
  return chamar(acao, Object.assign({ id: id }, extra || {})).then(function (r) {
    if (botao) botao.disabled = false;
    if (!r.ok) { aviso(r.erro || 'Não deu certo.', true); return; }
    aviso(acao === 'enviar' ? 'Enviado pelo WhatsApp da Isabela. Se tinha tarefa, o to-do entra no painel em 1 minuto.' : acao === 'recusar' ? 'Recusada. Nada saiu.' : 'Marcada como resolvida.');
    carregar();
  });
}
document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-isa-env],[data-isa-rec],[data-isa-ok],#isaAtualizar'); if (!b) return;
  if (b.id === 'isaAtualizar') { carregar(); return; }
  var id = Number(b.getAttribute('data-isa-env') || b.getAttribute('data-isa-rec') || b.getAttribute('data-isa-ok'));
  var s = (R.abertas || []).filter(function (x) { return x.id === id; })[0] || {};
  if (b.hasAttribute('data-isa-env')) {
    var t = $('isaT' + id).value.trim();
    if (t.length < 2) { aviso('Escreva a resposta antes de enviar.', true); return; }
    if (!confirm('Enviar para ' + (s.contato || 'o contato') + ' pelo WhatsApp da Isabela?\n\n' + t + '\n\nIsabela, time administrativo, Grupo Euforia')) return;
    decidir('enviar', id, { texto: t }, b);
  } else if (b.hasAttribute('data-isa-rec')) {
    modal('Recusar a sugestão', [{ k: 'nota', rot: 'Por quê? (opcional, ajuda a Isa a aprender)', tipo: 'textarea' }], 'Recusar', function (v) {
      return chamar('recusar', { id: id, nota: v.nota }).then(function (r) { if (!r.ok) return r.erro || 'Não deu certo.'; aviso('Recusada. Nada saiu.'); carregar(); });
    });
  } else decidir('feito', id, {}, b);
});
window.iniciarIsa = function () { carregar(); };
})();
