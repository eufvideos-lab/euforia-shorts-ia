"""Deck da Reunião de Audiovisual + Estratégia da Meryele Queiroz (26/11/2026).
Base: interativos da Sentra (19/11) e da Daniele (24/11). CSS/JS extras vêm de ref_daniele_build.py.
Uso: python3 build.py <pasta web com as imagens> <saida.html>"""
import base64, os, re, sys, math
D = os.path.dirname(os.path.abspath(__file__))
WEB = sys.argv[1]; SAIDA = sys.argv[2]
def b(n):
    ext = {'png': 'png', 'jpg': 'jpeg', 'webp': 'webp'}[n.rsplit('.', 1)[1]]
    return 'data:image/%s;base64,' % ext + base64.b64encode(open(os.path.join(WEB, n), 'rb').read()).decode()
I = {n.rsplit('.', 1)[0]: b(n) for n in os.listdir(WEB)}
PAGINA = 'https://grupoeuforia.com.br/' + os.environ.get('SLUG_PAGINA', 'pagina-meryele-queiroz')
MARCA = '<div class="marca">Meryele Queiroz × Grupo Euforia</div>'
REF = open(D + '/ref_daniele_build.py').read()
extra_css = re.search(r"css \+= r'''(.*?)\n'''", REF, re.S).group(1)
extra_js = re.search(r"js \+= r'''(.*?)\n'''\.replace", REF, re.S).group(1)

# ---------- CSS na marca da Meryele ----------
css = open(D + '/base.css').read()
ROOT = ':root{--fundo:#0A1A3A;--txt:#EEF3FF;--claro:#EEF3FB;--escuro:#0A1A3A;--cor:#2F7BFF;--cor2:#1F5FD6;--sobrecor:#fff;--card:#13284F;--fh:Montserrat,Arial,sans-serif;--fb:Inter,Arial,sans-serif}'
assert ROOT in css
css = css.replace(ROOT, '.claro em{color:var(--cor2)!important}:root{--fundo:#103647;--txt:#F6F1E7;--claro:#F6F1E7;--escuro:#103647;--cor:#D0B47C;--cor2:#9C7D43;--sobrecor:#0A2532;--card:#1A4A5E;--fh:"PT Serif",Georgia,serif;--fb:Inter,Arial,sans-serif}')
def pinta(t):
    return (t.replace('rgba(47,123,255', 'rgba(208,180,124').replace('#1A3770', '#1F5C74').replace('#0A1A3A', '#103647').replace('#1F4FB0', '#1F5C74')
             .replace('rgba(10,26,58', 'rgba(16,54,71').replace('rgba(4,10,28', 'rgba(6,22,30').replace('font-family:Montserrat,Arial', 'font-family:"PT Serif",Georgia')
             .replace('#FF7700', '#D0B47C').replace('#ff7700', '#D0B47C').replace('#E86A00', '#B8995C').replace('rgba(255,119,0', 'rgba(208,180,124').replace('rgba(255,140,40', 'rgba(208,180,124')
             .replace('#111945', '#103647').replace('rgba(17,25,69', 'rgba(16,54,71').replace('rgba(8,12,36', 'rgba(6,22,30').replace('#28348A', '#1F5C74').replace('#2A3590', '#1F5C74').replace('#3B47A8', '#2C6E86')
             .replace('#1D2766', '#1A4A5E').replace('#E9EBF3', '#E5DECC').replace('#DDE0EE', '#E5DECC').replace('#C9CDE0', '#CFC6AF')
             .replace('font:900', 'font:700').replace('font:800', 'font:700').replace('Nunito Sans', 'Inter').replace('Nunito,Arial', '"PT Serif",Georgia').replace('Nunito', '"PT Serif"'))
css = pinta(css) + pinta(extra_css)
css += r'''
h1,h2{font-weight:700;letter-spacing:-1px}h2.g{letter-spacing:-1.5px}
.k{font-family:Inter,Arial,sans-serif;font-weight:800}
.s em{font-style:italic}
.pg,.marca,.cd .r,.pt b,.chips button,.notas button,.tag,.selo2,.no,.rec,.navc button,.play2,.tl2 button,.links2 a,.alerta,.pronta,.mesinfo,.meses2,.pz2 span,.plr .lst2 span,.pubcard .r,.hotinfo b,.tvinfo b{font-family:Inter,Arial,sans-serif!important}
.no,.rec,.chips button,.notas button,.navc button,.play2,.links2 a,.tl2 button{font-weight:800!important}
.cor .chips button{border-color:#0A2532;color:#0A2532}.cor .chips button.on{background:#0A2532;color:#F6F1E7}
.notas button{color:#0A2532;background:rgba(255,255,255,.35)}.notas button.on{background:#0A2532;color:#F6F1E7}
.cnt div{border-bottom-color:#D0B47C}.cnt b{color:#103647;font-family:"PT Serif",serif}
.fyt .tit{text-transform:uppercase}
.ag div{border-bottom-color:#D0B47C}
/* Mery Compartilha vira vídeo */
.mcw{display:flex;gap:56px;align-items:center;height:100%}
.mcw .lado{width:560px;flex:none;display:flex;flex-direction:column;gap:22px}
.mct{position:relative;width:1050px;height:590px;border-radius:24px;overflow:hidden;background:#0A2532;box-shadow:0 30px 70px rgba(0,0,0,.5);flex:none}
.mct .lyr{position:absolute;inset:0;opacity:0;transition:opacity .7s}
.mct .lyr.on{opacity:1}
.mct .bg{background-size:cover;background-position:center 25%;filter:saturate(.9)}
.mct .bg:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(10,37,50,.85) 0,rgba(10,37,50,.35) 60%,rgba(10,37,50,.15))}
.mct .wave{display:flex;gap:7px;align-items:center;position:absolute;left:70px;right:70px;top:50%;height:120px;transform:translateY(-50%);opacity:1;transition:all .7s}
.mct.img .wave{top:auto;bottom:70px;transform:none;height:70px;left:70px;right:auto;width:420px}
.mct .wave i{flex:1;border-radius:8px;background:#C1DDCF;animation:ond 1.1s ease-in-out infinite}
@keyframes ond{50%{transform:scaleY(.3)}}
.mct .wv{position:absolute;left:70px;top:60px;font:700 24px Inter;letter-spacing:4px;color:#C1DDCF;transition:opacity .5s}
.mct .leg{position:absolute;left:70px;top:150px;width:620px;font:700 60px "PT Serif";color:#fff;line-height:1.12;text-transform:uppercase}
.mct .leg em{color:#D0B47C;font-style:normal}
.mct .mk{position:absolute;right:40px;top:36px;height:56px}
.mct .cta3{position:absolute;right:40px;bottom:40px;background:#D0B47C;color:#0A2532;border-radius:20px;padding:20px 28px;font:800 26px Inter;display:flex;gap:16px;align-items:center}
.mct .cta3 i{font-style:normal;font-size:34px}
/* anatomia da thumb */
.anw{display:flex;gap:56px;align-items:center;height:100%}
.anw .lado{width:560px;flex:none;display:flex;flex-direction:column;gap:22px}
.anv{position:relative;width:1040px;flex:none}
.anv img{width:1040px;border-radius:20px;display:block;box-shadow:0 30px 70px rgba(0,0,0,.45);transition:opacity .5s}
.anv img.r{position:absolute;left:0;top:0;opacity:0}
.anv.ruim img.r{opacity:1}.anv.ruim .hp{display:none}
.anv .hp{animation:hpg 1.8s infinite}
@keyframes hpg{50%{box-shadow:0 0 0 16px rgba(208,180,124,0)}}
.sel2{display:flex;gap:14px}
.sel2 button{flex:1;border:3px solid #D0B47C;background:transparent;color:#F6F1E7;border-radius:999px;padding:14px 20px;font:800 26px Inter;cursor:pointer}
.sel2 button.on{background:#D0B47C;color:#0A2532}
.mini{display:flex;gap:16px;margin-top:6px}.mini img{width:168px;border-radius:10px}
/* página */
.pgw{display:flex;gap:60px;align-items:center;height:100%}
.pgw .lado{width:620px;flex:none;display:flex;flex-direction:column;gap:24px}
.pgv{position:relative;flex:1;height:820px}
.pgv .dk{position:absolute;left:0;top:30px;width:930px;border-radius:18px;overflow:hidden;box-shadow:0 30px 70px rgba(0,0,0,.45);background:#fff}
.pgv .dk .br{height:42px;background:#E5DECC;display:flex;gap:8px;align-items:center;padding:0 16px}.pgv .dk .br i{width:13px;height:13px;border-radius:50%;background:#bfb59e}
.pgv .dk .br span{margin-left:16px;font:600 16px Inter;color:#55666E;background:#fff;border-radius:8px;padding:4px 14px}
.pgv .dk .sc{height:560px;overflow:hidden}.pgv .dk .sc img{width:100%;display:block;animation:rola 16s ease-in-out infinite alternate}
@keyframes rola{0%,10%{transform:translateY(0)}100%{transform:translateY(calc(-100% + 560px))}}
.pgv .ph{position:absolute;right:0;bottom:0;width:300px;height:620px;border-radius:40px;border:12px solid #0A2532;overflow:hidden;background:#fff;box-shadow:0 30px 70px rgba(0,0,0,.5)}
.pgv .ph img{width:100%;display:block;animation:rola2 14s ease-in-out infinite alternate}
@keyframes rola2{0%,10%{transform:translateY(0)}100%{transform:translateY(calc(-100% + 596px))}}
.dpt{background:var(--card);border-radius:22px;padding:24px 28px;font:400 27px/1.45 "PT Serif";color:#E6EEF2}
.dpt b{display:block;font:700 20px Inter;color:#D0B47C;margin-top:10px;letter-spacing:1px}
/* roupa */
.rpw{display:flex;gap:56px;height:100%;align-items:center}
.rpw .lado{width:600px;flex:none;display:flex;flex-direction:column;gap:22px}
.rpc{flex:1;display:flex;gap:40px;align-items:center}
.rpc img{height:760px;border-radius:26px;box-shadow:0 30px 60px rgba(0,0,0,.35)}
.rpc .tx3{font-size:36px;line-height:1.4;display:flex;flex-direction:column;gap:16px}
.rpc .tx3 b{font:700 48px "PT Serif";color:var(--cor2)}
.listra{width:520px;height:760px;border-radius:26px;background:repeating-linear-gradient(90deg,#103647 0 3px,#fff 3px 6px);box-shadow:0 30px 60px rgba(0,0,0,.35);animation:tre .12s infinite}
@keyframes tre{50%{background-position:1px 0}}
'''

js = open(D + '/base.js').read()
js = re.sub(r"document\.querySelectorAll\('\[data-sh\]'\).*?\n\}\);\n", '', js, flags=re.S)
js = re.sub(r"document\.querySelectorAll\('\[data-aud\]'\).*?\n\}\);\n?", '', js, flags=re.S)
assert 'data-sh' not in js and 'data-aud' not in js
js = js.replace("sh:{w:H*9/16,x:560,", "sh:{w:H*9/16,x:400,").replace("fd:{w:H*4/5,x:520,", "fd:{w:H*4/5,x:330,")
js = js.replace("'<b>O vídeo completo no YouTube.</b> A tela inteira é aproveitada, do jeito que o podcast foi gravado.'", "'<b>O vídeo completo no YouTube.</b> A tela inteira é aproveitada: você, a poltrona e o consultório.'")
js = js.replace("A edição recorta em quem está falando. Arraste o quadro e veja.", "A edição recorta em você. Arraste o quadro e veja.")
js = js.replace("'<b>Gravado em pé, o vídeo serve só para o short.</b> No YouTube ele aparece com tarjas pretas e ocupa só um terço da tela. Não dá para tirar dele o vídeo longo.'", "'<b>Gravado em pé, o vídeo serve só para o short.</b> No YouTube aparece com tarjas pretas e ocupa um terço da tela. Não dá para tirar dele o vídeo longo.'")

SL = []
def s(cls, body, marca=True):
    SL.append('<section class="s %s">%s%s</section>' % (cls, body, MARCA if marca else ''))

# 1 capa
s('capa', '<div class="tx"><img src="%s" style="width:470px"><p class="k">Reunião de Audiovisual + Estratégia</p><h1>Meryele,<br>o consultório<br><em>vira estúdio.</em></h1><div class="barra"></div><p class="data">26 de novembro de 2026</p></div><div class="ft" style="background-image:url(%s);background-position:center 12%%"></div>' % (I['logo-claro'], I['f-capa']), False)
# 2 hoje
s('', '<div class="cab"><p class="k">Hoje</p><h2>O que vamos fazer</h2></div><div class="ag"><div><span>01</span><h3>A estratégia: do vídeo até a sua agenda</h3></div><div><span>02</span><h3>Como o seu canal vai ficar</h3></div><div><span>03</span><h3>Consultoria audiovisual: gravar no consultório</h3></div><div><span>04</span><h3>Aprovar as pautas e marcar a gravação</h3></div></div>')
# 3 o que já chegou
s('claro', '<div class="cab"><p class="k">Desde o onboarding</p><h2>O que você já <em>nos entregou</em></h2></div><div class="duo" style="grid-template-columns:1fr 1fr;gap:30px"><div class="lst">'
  '<div class="it"><span class="ok">✓</span><div><h3>O canal certo</h3><p>@MeryeleQueirozTerapeuta, o original, que já tem as suas aulas.</p></div></div>'
  '<div class="it"><span class="ok">✓</span><div><h3>Os seus serviços</h3><p>Atendimentos, cursos, combos e palestras: viraram a página e o funil.</p></div></div></div><div class="lst">'
  '<div class="it"><span class="ok">✓</span><div><h3>Depoimentos de verdade</h3><p>4 depoimentos escritos e 6 vídeos do Empresário Sistêmico.</p></div></div>'
  '<div class="it"><span class="ok">✓</span><div><h3>O Mery Compartilha</h3><p>Cerca de 240 pessoas ouvindo a sua voz toda semana.</p></div></div></div></div>')
# 4 divisor
s('cor centro', '<p class="k">01</p><h2 class="g">A estratégia</h2><p class="sub" style="opacity:1">Como um vídeo gravado no seu consultório vira uma sessão na sua agenda.</p>')
# 5 ecossistema
NOS = [('🎬', 'Vídeos', 'thumb-2', '<b>A base de tudo.</b> Vídeos de 5 a 7 minutos em que a pessoa conhece o seu jeito de olhar. Ficam no ar por anos e são encontrados na busca.'),
       ('⚡', 'Shorts', 'short', '<b>A vitrine.</b> Os trechos mais fortes viram vídeos curtos e chegam a quem ainda não conhece você.'),
       ('📱', 'Reels', 'short', '<b>Os mesmos cortes no Instagram e no TikTok.</b> Você falando do que vê todo dia no consultório.'),
       ('🗂️', 'Carrosséis', 'car-01', '<b>Para quem prefere ler.</b> Cada vídeo vira um carrossel no seu Instagram, com a sua marca.'),
       ('🎧', 'Mery Compartilha', 'mery', '<b>A sua voz que já existe.</b> Os áudios da semana viram vídeos com imagem e legenda, e cada um convida para o grupo.'),
       ('🧭', 'Página', 'pagina-cel', '<b>Onde tudo chega.</b> A pessoa escolhe o atendimento e cai no WhatsApp com a mensagem pronta.')]
nos = ''; linhas = ''
for k, (ic, nm, im, tx) in enumerate(NOS):
    a = -math.pi / 2 + k * 2 * math.pi / len(NOS); x = 430 + 330 * math.cos(a); y = 430 + 330 * math.sin(a)
    nos += '<button class="no" style="left:%dpx;top:%dpx" data-i="%d"><span>%s</span>%s</button>' % (x, y, k, ic, nm.replace(' ', '<br>') if len(nm) > 12 else nm)
    linhas += '<line x1="430" y1="430" x2="%d" y2="%d" stroke="#D0B47C" stroke-opacity=".45" stroke-width="5" stroke-dasharray="10 12"/>' % (x, y)
merymock = '<div style="width:420px;height:236px;border-radius:16px;background:#0A2532;position:relative;box-shadow:0 20px 40px rgba(0,0,0,.4);overflow:hidden"><div style="position:absolute;inset:0;background:url(%s) center 25%%/cover;opacity:.45"></div><div style="position:absolute;left:24px;top:24px;font:700 15px Inter;letter-spacing:3px;color:#C1DDCF">MERY COMPARTILHA</div><div style="position:absolute;left:24px;top:56px;width:280px;font:700 30px \'PT Serif\';color:#fff;line-height:1.1">QUEM CUIDA <span style=color:#D0B47C>DE VOCÊ?</span></div></div>' % I['f-cabelo']
prevs = ''
for k, (ic, nm, im, tx) in enumerate(NOS):
    pv = merymock if im == 'mery' else '<img src="%s">' % I[im]
    prevs += '<div class="ecoprev" data-p="%d" style="display:none">%s</div>' % (k, pv)
s('', '<div class="eco nofwd" data-eco><div class="lado"><p class="k">O ecossistema</p><h2>Você grava <em>uma vez</em>. O canal trabalha a semana inteira.</h2><p class="info"></p>%s<p class="lema">Sem anúncio pago. Quem chega já confia em você.</p></div><div class="roda"><svg viewBox="0 0 860 860">%s<circle cx="430" cy="430" r="330" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="3"/></svg><div class="rec"><i></i>REC<small>você grava</small></div>%s</div></div>' % (prevs, linhas, nos))
# 6 conta (6 vídeos do contrato)
s('claro', '<div class="cab"><p class="k">Arraste: vídeos gravados</p><h2>Cada gravação vira <em>seis peças</em></h2></div><div class="conta nofwd" data-conta><p class="mesinfo"></p><input type="range" min="1" max="6" value="6"><div class="meses2">' + ''.join('<span>%d</span>' % m for m in range(1, 7)) + '</div><div class="cnt"><div><b data-c="l">0</b><h3>vídeos longos</h3></div><div><b data-c="s">0</b><h3>shorts</h3></div><div><b data-c="c">0</b><h3>carrosséis</h3></div><div><b data-c="t">0</b><h3>capas próprias</h3></div></div></div>')
# 7 público
PUB = [('Mulheres', 'Quem cuida de todo mundo', 'Ser forte o tempo todo, a história da mãe se repetindo, o cansaço de cuidar sem ser cuidada.', 'Porta: terapia individual, online ou presencial', [('01', 'Você cuida de todo mundo. E de você?'), ('05', 'Mulher forte o tempo todo: até quando?'), ('09', 'Quem é você sem os seus papéis?')]),
       ('Casais', 'Quem quer entender o outro', 'As mesmas brigas, só mudam os personagens. O que cada um traz da própria família para dentro de casa.', 'Porta: terapia de casal, em 5 sessões', [('07', 'O que cada um leva da família para o casamento'), ('02', 'Por que eu repito a história da minha mãe?'), ('11', 'Ansiedade e controle: de onde vem?')]),
       ('Empresários', 'Quem leva a casa para a empresa', 'Família no negócio, dinheiro que entra e escapa, crescimento travado. Do CPF ao CNPJ, com os seus 25 anos de empresa.', 'Porta: curso Empresário Sistêmico e atendimento empresarial', [('→', 'CPF não é CNPJ: a mistura que trava o negócio'), ('→', 'Família na empresa: quem manda em quem?'), ('→', 'Os três bloqueios invisíveis do seu negócio')])]
bts = ''.join('<button data-i="%d"><span class="st">%d</span>%s</button>' % (k, k + 1, p[0]) for k, p in enumerate(PUB))
cards = ''.join('<div class="pubcard" data-p="%d" style="display:none"><p class="r">%s</p><h3>%s</h3><p class="q">%s</p><p class="r" style="margin-top:6px">%s</p>%s%s</div>' % (k, p[1], p[0], p[2], p[3], ''.join('<div class="pz2"><span>%s</span>%s</div>' % x for x in p[4]), '<p style="font-size:24px;opacity:.6">Próximo lote de pautas, a partir do que você aprovar hoje.</p>' if k == 2 else '') for k, p in enumerate(PUB))
s('claro', '<div class="pubw nofwd" data-tab><div class="lado"><p class="k">Para quem você fala</p><h2 style="font-size:66px">Três públicos. <em>Uma porta</em> para cada um.</h2><p class="t" style="font-size:30px">Veio da descrição dos seus serviços. Toque em cada um.</p><div class="ops">%s</div></div>%s</div>' % (bts, cards))
# 8 funil no celular
fn = ('<div class="fn nofwd" data-funil style="gap:70px"><div class="lado" style="gap:16px"><p class="k">O caminho do cliente</p><h2 style="font-size:58px">Do short à <em>sessão</em>.</h2><p class="t" style="font-size:30px">Toque em cada passo. Tudo orgânico, sem anúncio.</p><div class="trilha">'
      + ''.join('<button><span class="nn">%d</span><div><h3>%s</h3><p>%s</p></div></button>' % (k + 1, h, p) for k, (h, p) in enumerate([('O short atrai', 'Ela se reconhece em 40 segundos'), ('O vídeo aprofunda', 'Entende de onde vem o que dói'), ('O Mery Compartilha', 'Passa a ouvir você toda semana'), ('A página', 'Faz o teste e escolhe o atendimento'), ('O WhatsApp', 'Chega com a mensagem pronta'), ('A sessão', 'Online ou presencial')]))
      + '</div><div class="links2"><a href="%s" target="_blank">Abrir a página</a></div></div><div class="fcel"><div class="ftela">' % PAGINA
      + '<div class="fc fsh"><div class="fbar"><span>9:41</span><span>●●● ▮</span></div><div class="vid" style="background-image:url(%s);background-position:center 18%%"><div class="ac"><div>❤<small>curtir</small></div><div>💬<small>coment.</small></div><div>↗<small>compart.</small></div></div><div class="leg"><b>Meryele Queiroz · Terapia Sistêmica</b>Mulher forte o tempo todo: até quando?<br><span class="tag fpulsa" data-ir="1">▶ Assistir ao vídeo completo</span></div></div></div>' % I['f-capa']
      + '<div class="fc fyt"><div class="fbar"><span>9:41</span><span>●●● ▮</span></div><div class="top"><b>▶</b> YouTube</div><img class="v" src="%s"><p class="tit">Você cuida de todo mundo. E de você?</p><p class="meta">Meryele Queiroz · Terapia Sistêmica</p><div class="canal"><i><img src="%s"></i>Meryele Queiroz<span class="insc">Inscrever-se</span></div><div class="caixa">📌 <b>Comentário fixado</b><br>Toda semana eu mando um áudio curto no Mery Compartilha: <span class="lk fpulsa" data-ir="2">entrar no grupo</span></div><div class="caixa">O mesmo link vai na primeira linha da descrição de cada vídeo.</div></div>' % (I['thumb-2'], I['perfil'])
      + '<div class="fc fwa"><div class="fbar" style="background:#075e54;color:#fff"><span>9:41</span><span>●●● ▮</span></div><div class="cab"><i><img src="%s"></i><div><b>Mery Compartilha</b><span>cerca de 240 participantes</span></div></div><div class="msgs"><div class="fbal ela">🎧 ▶ ━━━━━━━━━━ 4:12<small>áudio da semana · Meryele</small></div><div class="fbal ela">O tema de hoje veio de uma de vocês: por que é tão difícil dizer não para a própria mãe? 💛<small>Meryele</small></div><div class="fbal eu">Mery, esse áudio foi pra mim. Como faço para marcar uma sessão?<small>participante</small></div><div class="fbal ela">Que bom que tocou você. O link para agendar está na descrição do grupo 🙏<small>Meryele</small></div></div></div>' % I['perfil']
      + '<div class="fc fpg"><div class="fbar"><span>9:41</span><span>●●● ▮</span></div><div class="hdp">Meryele <span>Queiroz</span></div><h4>Você repete a <em>história da sua família</em>?</h4><p class="sub3">Responda de 1 a 5. Toque nos números.</p>'
      + ''.join('<div class="qq">%s<div class="esc">%s</div></div>' % (q, ''.join('<span>%d</span>' % n for n in range(1, 6))) for q in ['As mesmas brigas aparecem em relações diferentes?', 'Você se sente culpada quando pensa em si?', 'Você se pega agindo como a sua mãe ou o seu pai?'])
      + '<div class="res"><b>Tem história pedindo para ser olhada</b>Muita coisa que pesa hoje começou antes de você. Dá para olhar com cuidado.<span class="zap fpulsa" data-ir="4">Agendar pelo WhatsApp</span></div></div>'
      + '<div class="fc fwa"><div class="fbar" style="background:#075e54;color:#fff"><span>9:41</span><span>●●● ▮</span></div><div class="cab"><i><img src="%s"></i><div><b>Meryele Queiroz</b><span>Terapia Sistêmica</span></div></div><div class="msgs"><div class="fbal eu">Oi! Vim pela página da Meryele e quero agendar uma sessão individual.<small>mensagem pronta da página</small></div><div class="fbal ela">Que bom ter você aqui! Me conta um pouco do que te trouxe até a Meryele?<small>equipe da Meryele</small></div><div class="fbal eu">Assisti o vídeo sobre ser forte o tempo todo e me vi ali.<small>paciente</small></div><div class="fbal ela">Prefere online ou presencial em Patos de Minas? Tenho horários nesta semana.<small>equipe da Meryele</small></div></div></div>' % I['perfil']
      + '<div class="fc ffim"><div class="ic">🌿</div><h4>Primeira sessão</h4><p>Ela chegou pelo conteúdo, já confiando em quem entende de família.</p><div class="op"><div>🪑 Terapia individual</div><div>💞 Terapia de casal</div><div>💼 Atendimento empresarial</div><div>🎓 Cursos e combos</div></div></div>'
      + '</div></div></div>')
s('', fn)
# 9 Mery Compartilha vira vídeo
onda = ''.join('<i style="height:%d%%;animation-delay:%.2fs"></i>' % (h, k * .07) for k, h in enumerate([30, 55, 80, 45, 70, 95, 50, 35, 75, 60, 90, 40, 65, 30, 85, 55, 70, 45, 95, 60, 40, 75, 50, 85, 35, 65, 45, 80, 55, 30]))
s('', '<div class="mcw nofwd" data-mc><div class="lado"><p class="k">A sua voz que já existe</p><h2 style="font-size:64px">O Mery Compartilha <em>vira vídeo</em>.</h2><p class="t" style="font-size:30px">Você já grava os áudios da semana. A edição veste cada um. Toque nas camadas.</p><div class="ops"><button data-c="0"><span class="st">1</span>O seu áudio</button><button data-c="1"><span class="st">2</span>+ Imagens</button><button data-c="2"><span class="st">3</span>+ Legenda</button><button data-c="3"><span class="st">4</span>+ Marca e convite</button></div><button class="play2" style="align-self:flex-start">▶ Ver em sequência</button></div>'
  '<div class="mct"><div class="lyr bg" style="background-image:url(%s)"></div><div class="wv">🎧 MERY COMPARTILHA · ÁUDIO DA SEMANA</div><div class="wave">%s</div><div class="lyr leg">Quem cuida de todo mundo também <em>precisa de cuidado.</em></div><img class="lyr mk" src="%s"><div class="lyr cta3"><i>💬</i>Entre no Mery Compartilha · link na descrição</div></div></div>' % (I['f-cabelo'], onda, I['logo-claro']))
# 10 divisor 02
s('cor centro', '<p class="k">02</p><h2 class="g">Como o seu canal vai ficar</h2><p class="sub" style="opacity:1">Capas, banner e carrossel com as suas fotos de ensaio.</p>')
# 11 playlists
PL = [('Comece por aqui', 'thumb-1', [('00', 'Quem é Meryele Queiroz'), ('04', 'O que é terapia sistêmica (e o que não é)'), ('08', 'Constelação familiar: como funciona de verdade')]),
      ('De volta pra mim', 'thumb-2', [('01', 'Você cuida de todo mundo. E de você?'), ('05', 'Mulher forte o tempo todo: até quando?'), ('09', 'Quem é você sem os seus papéis?')]),
      ('Família e padrões', 'thumb-3', [('02', 'Por que eu repito a história da minha mãe?'), ('06', '5 sinais de que você repete a sua família'), ('10', 'Onde eu aprendi a ser assim?')]),
      ('Emoções e relações', 'thumb-4', [('03', 'Fome de comida ou fome de colo?'), ('07', 'O que cada um leva da família para o casamento'), ('11', 'Ansiedade e controle: de onde vem?')])]
bts = ''.join('<button data-i="%d"><span class="st">%d</span>%s</button>' % (k, k + 1, p[0]) for k, p in enumerate(PL))
cards = ''.join('<div class="plr" data-p="%d" style="display:none"><img src="%s"><div class="lst2">%s</div></div>' % (k, I[p[1]], ''.join('<div><span>%s</span>%s</div>' % x for x in p[2])) for k, p in enumerate(PL))
s('', '<div class="plw nofwd" data-tab><div class="lado"><p class="k">12 pautas · 4 playlists</p><h2 style="font-size:66px">Para aprovar hoje, <em>já com capa</em>.</h2><p class="t" style="font-size:30px">Toque em cada playlist. Cada capa usa uma foto diferente do seu ensaio.</p><div class="ops">%s</div></div>%s</div>' % (bts, cards))
# 12 anatomia da thumb
AN = [(78, 30, 'Rosto grande e centralizado', 'A sua expressão é o que faz parar. Foto de ensaio, recortada, com brilho atrás na cor da marca.'),
      (49, 73, 'Uma palavra em destaque', 'A caixa dourada leva o olho direto para o que importa: “E DE VOCÊ?”.'),
      (49, 37, 'Poucas palavras, em caixa alta', 'Lida em menos de um segundo, até na tela do celular.'),
      (35, 24, 'O tema no selo', 'O nome da playlist diz onde a pessoa está entrando.'),
      (21, 91, 'A sua marca, sempre', 'Logo e cores iguais em todas as capas: o canal vira uma vitrine só.')]
hp = ''.join('<button class="hp" style="left:%d%%;top:%d%%" data-i="%d">%d</button>' % (x, y, k, k + 1) for k, (x, y, h, t) in enumerate(AN))
hinf = ''.join('<div class="hotinfo" data-p="%d" style="display:none"><b>%s</b>%s</div>' % (k, h, t) for k, (x, y, h, t) in enumerate(AN))
s('', '<div class="anw nofwd" data-anat><div class="lado"><p class="k">Modelo de capa</p><h2 style="font-size:62px">A capa decide <em>o clique</em>.</h2><div class="sel2"><button data-v="ruim">Sem método</button><button data-v="bom" class="on">Com método</button></div>%s<p class="t" style="font-size:26px">Toque nos números da capa.</p></div><div class="anv"><img src="%s"><img class="r" src="%s">%s</div></div>' % (hinf, I['thumb-2'], I['thumb-ruim'], hp))
# 13 canal
VID = [('thumb-1', 'O que é constelação familiar?'), ('thumb-2', 'Você cuida de todo mundo. E de você?'), ('thumb-3', 'Por que eu repito a história da minha mãe?'), ('thumb-4', 'O que cada um leva da família para o casamento')]
s('', '<div class="cab" style="gap:12px"><p class="k">Como o seu canal vai ficar</p><h2 style="font-size:60px">A primeira semana de cada playlist, <em>já na vitrine</em></h2></div><div class="ytc"><div class="bn" style="background-image:url(%s)"></div><div class="hd"><img src="%s"><div><b>Meryele Queiroz · Terapia Sistêmica</b><span>@MeryeleQueirozTerapeuta</span></div><span class="ins">Inscrever-se</span></div><div class="gr2">%s</div></div>'
  % (I['banner'], I['perfil'], ''.join('<div><img src="%s"><p>%s</p><small>Meryele Queiroz</small></div>' % (I[a], t) for a, t in VID)))
# 14 carrossel
cars = ''.join('<img src="%s" draggable="false">' % I['car-%02d' % k] for k in range(1, 8))
s('claro', '<div class="carw nofwd" data-car><div class="lado"><p class="k">Modelo de carrossel · pauta 06</p><h2 style="font-size:70px">O vídeo vira <em>carrossel</em>, slide a slide.</h2><p class="t" style="font-size:34px">Capa com a sua foto, cinco sinais com o texto do roteiro e o convite para o Mery Compartilha no fim.</p><div class="navc"><button data-d="-1">‹ Anterior</button><button data-d="1">Próximo ›</button></div></div>'
  '<div class="igc"><div class="in"><div class="top3"><img src="%s">Meryele Queiroz</div><div class="vp"><div class="tr2">%s</div><span class="cnt2">1/7</span></div><div class="dots">%s</div><div class="cap"><b>Meryele Queiroz</b> Você se reconheceu em qual dos cinco? Me conta aqui embaixo 👇</div></div></div></div>'
  % (I['perfil'], cars, '<i></i>' * 7))
# 15 simulação de vídeo
s('', '<div class="tvw nofwd" data-tv><div class="cab" style="align-self:flex-start;gap:10px"><p class="k">Simulação de um vídeo</p><h2 style="font-size:58px">Do play ao fim, <em>onde fica cada coisa</em></h2></div>'
  '<div class="tv2" style="background-image:url(%s)"><div class="ly leg2">Você cuida de todo mundo…<br>e <em>de você</em>?</div><div class="ly lt"><b>Meryele Queiroz</b><span>Terapeuta sistêmica · Patos de Minas (MG)</span></div><div class="ly ex"><p><span>1.</span> Diz sim para tudo</p><p><span>2.</span> Sente culpa ao descansar</p><p><span>3.</span> Não sabe pedir ajuda</p></div><div class="ly cut"><span>✂ vira short</span></div><div class="ly cta2"><b>Mery Compartilha: um áudio por semana</b><span>link na descrição</span></div></div>'
  '<div class="tl2"><button style="width:10%%;background:#D0B47C;color:#0A2532">Gancho</button><button style="width:10%%;background:#B8995C">Você</button><button style="width:30%%;background:#1F5C74">Exemplos na tela</button><button style="width:30%%;background:#2C6E86">✂ Shorts</button><button style="width:20%%;background:#D0B47C;color:#0A2532">Chamada</button><i class="ph2"></i></div>'
  '<div style="display:flex;gap:30px;align-items:center"><button class="play2">▶ Ver em sequência</button><p class="tvinfo"></p></div></div>' % I['f-h'])
# 16 página
s('', '<div class="pgw"><div class="lado"><p class="k">Página de vendas</p><h2 style="font-size:64px">Onde quem assistiu <em>vira paciente</em>.</h2><p class="t" style="font-size:30px">Na sua marca, com as suas fotos, os seus atendimentos e cursos, e os depoimentos que você mandou.</p><div class="dpt">“Existe uma Laressa antes e uma depois do seu trabalho.”<b>DEPOIMENTO REAL · NA PÁGINA</b></div><div class="links2"><a href="%s" target="_blank">Abrir a página</a></div></div><div class="pgv"><div class="dk"><div class="br"><i></i><i></i><i></i><span>grupoeuforia.com.br</span></div><div class="sc"><img src="%s"></div></div><div class="ph"><img src="%s"></div></div></div>' % (PAGINA, I['pagina-desk'], I['pagina-cel']))
# 17 divisor 03
s('cor centro', '<p class="k">03</p><h2 class="g">Consultoria audiovisual</h2><p class="sub" style="opacity:1">O seu consultório vira estúdio, com o que você já tem: câmera, lapela, luz e tripé.</p>')
# 18 formato
s('', '<div class="ix nofwd" data-hz><div class="lado"><p class="k">Consultoria audiovisual · Formato</p><h2>Por que gravamos <em>deitado</em>?</h2><p class="t" style="font-size:30px">Toque em cada formato.</p><div class="ops"><button data-m="yt"><span class="st">✓</span>YouTube · 16:9</button><button data-m="sh"><span class="st">✓</span>Shorts e Reels · 9:16</button><button data-m="fd"><span class="st">✓</span>Feed do Instagram · 4:5</button><button data-m="pe"><span class="st x">✕</span>E se gravar em pé?</button></div><p class="info"></p></div><div class="quadro" style="background-image:url(%s)"><div class="crop"><span></span></div><div class="empe"><img src="%s"></div><div class="dica">↔ arraste o quadro</div></div></div>' % (I['f-h'], I['f-v']))
# 19 luz
LUZ = open(D + '/ref_daniele_build.py').read()
luz = re.search(r"# 17 luz\ns\('', '(.*?)' % I\['f-blazer'\]\)", LUZ, re.S).group(1)
luz = pinta(luz).replace('você</text>', 'você</text>')
s('', luz % I['f-close'])
# 20 enquadramento
s('', '<div class="enqw nofwd" data-enq><div class="lado"><p class="k">Consultoria audiovisual · Câmera</p><h2 style="font-size:62px">Olhos no <em>terço de cima</em>.</h2><div class="ops"><button data-e="ok"><span class="st">✓</span>Do peito para cima</button><button data-e="baixa"><span class="st x">✕</span>Câmera de baixo</button><button data-e="longe"><span class="st x">✕</span>Longe demais</button><button data-e="perto"><span class="st x">✕</span>Cortando a cabeça</button></div><p class="info"></p></div>'
  '<div class="enq"><div class="im" style="background-image:url(%s)"></div><div class="g"><i style="left:33.3%%;top:0;bottom:0;width:2px"></i><i style="left:66.6%%;top:0;bottom:0;width:2px"></i><i style="top:33.3%%;left:0;right:0;height:2px"></i><i style="top:66.6%%;left:0;right:0;height:2px"></i></div><div class="olho"><span>linha dos olhos</span></div><div class="rec2"><i></i>REC 16:9</div></div></div>' % I['f-enq'])
# 21 lapela
lap = re.search(r"# 20 lapela\ns\('claro', '(.*?)'\)\n# 21", LUZ, re.S).group(1)
s('claro', pinta(lap).replace('fill="#D0B47C"/><path d="M226 318', 'fill="#103647"/><path d="M226 318'))
# 22 roupa
RP = [('Tons claros e sólidos', 'f-close', '✓', '<b>Funciona muito bem.</b>Azul claro e branco iluminam o rosto e combinam com as cores da sua marca.'),
      ('Cor forte, sem estampa', 'f-verm2', '✓', '<b>Chama atenção na medida.</b>O vermelho fica lindo na capa. Ótimo para vídeos de tema forte.'),
      ('Preto', 'f-preto', '!', '<b>Elegante, com um cuidado.</b>Em fundo escuro, o preto some. Use com parede clara atrás.'),
      ('Listras finas e estampa miúda', None, '✕', '<b>Evite.</b>Na câmera, listras finas “tremem” e cansam o olho de quem assiste.')]
bts = ''.join('<button data-i="%d"><span class="st%s">%s</span>%s</button>' % (k, ' x' if c == '✕' else '', c, t) for k, (t, f, c, x) in enumerate(RP))
pn = ''.join('<div class="rpc" data-p="%d" style="display:none">%s<div class="tx3">%s</div></div>' % (k, ('<img src="%s">' % I[f]) if f else '<div class="listra"></div>', x) for k, (t, f, c, x) in enumerate(RP))
s('claro', '<div class="rpw nofwd" data-tab><div class="lado"><p class="k">Consultoria audiovisual · Roupa</p><h2 style="font-size:62px">O que vestir <em>na gravação</em>.</h2><p class="t" style="font-size:28px">Exemplos do seu próprio ensaio. Toque em cada um.</p><div class="ops">%s</div></div>%s</div>' % (bts, pn))
# 23 cenário
HS = [(55, 70, 'ok', 'Poltrona clara', 'Uma poltrona confortável e clara combina com a sua marca e deixa você à vontade para falar por minutos.'),
      (80, 30, 'ok', 'Parede com textura', 'Dá profundidade e calor. Fundo branco e liso deixa o vídeo com cara de reunião online.'),
      (86, 76, 'x', 'Objeto listrado no quadro', 'O vaso listrado puxa o olho e “treme” na câmera. Tire do enquadramento ou troque por uma planta.'),
      (22, 50, 'ok', 'Um metro longe da parede', 'Afastar a poltrona da parede cria profundidade e tira a sua sombra do fundo.'),
      (50, 10, 'ok', 'Luz de frente', 'A janela ou o LED na frente, atrás da câmera. Nunca a janela atrás de você.')]
hp = ''.join('<button class="hp%s" style="left:%d%%;top:%d%%" data-i="%d">%s</button>' % ('' if c == 'ok' else ' x', x, y, k, '✓' if c == 'ok' else '✕') for k, (x, y, c, h, t) in enumerate(HS))
hinf = ''.join('<div class="hotinfo" data-p="%d" style="display:none"><b>%s</b>%s</div>' % (k, h, t) for k, (x, y, c, h, t) in enumerate(HS))
s('', '<div class="hotw nofwd" data-hot><div class="lado"><p class="k">Consultoria audiovisual · Cenário</p><h2 style="font-size:64px">O canto certo <em>do consultório</em>.</h2><p class="t" style="font-size:28px">Toque nos pontos da foto do seu ensaio.</p>%s<p class="t" style="font-size:26px">Mande no grupo uma foto do canto onde vai gravar: a equipe confere com você.</p></div><div class="hot" style="background-image:url(%s)">%s</div></div>' % (hinf, I['f-poltrona'], hp))
# 24 checklist
CK = ['Celular na horizontal, na altura dos olhos', 'Lente da câmera limpa', 'Janela na frente ou na diagonal, nunca atrás', 'Lapela no peito, a um palmo da boca', 'Celular em modo avião', 'Olhar para a lente, não para a tela', 'Roteiro aberto: um bloco por vez', 'Errou? Respire e repita a frase inteira']
s('claro', '<div class="cab" style="gap:12px"><p class="k">Antes de apertar o REC</p><h2 style="font-size:66px">O checklist da gravação</h2></div><div class="nofwd" data-chk style="display:flex;flex-direction:column;gap:26px"><div class="chk">%s</div><div class="barra2"><i></i></div><p class="pronta"></p></div>' % ''.join('<button><i>✓</i>%s</button>' % c for c in CK))
# 25 fluxo
s('', '<div class="cab"><p class="k">Depois da gravação</p><h2>Você grava. <em>O resto é com a gente.</em></h2></div><div class="tl" style="--n:5"><div class="pt"><i></i><b>Equipe</b><h3>Roteiros no portal</h3><p>Prontos para ler, um por vídeo.</p></div><div class="pt"><i></i><b>Você</b><h3>Grava no consultório</h3><p>Dica: vários roteiros na mesma tarde.</p></div><div class="pt"><i></i><b>Você</b><h3>Envia o arquivo</h3><p>Pelo portal, direto do celular.</p></div><div class="pt"><i></i><b>Equipe</b><h3>Edita tudo</h3><p>Vídeo, 3 shorts, carrossel e capa.</p></div><div class="pt"><i></i><b>Você</b><h3>Aprova</h3><p>Nada vai ao ar sem o seu OK.</p></div></div>')
# 26 fechar hoje
s('claro', '<div class="cab"><p class="k">Saindo daqui</p><h2>Para fechar <em>hoje</em></h2></div><div class="duo" style="grid-template-columns:1fr 1fr;gap:24px"><div class="lst" style="gap:20px">'
  + ''.join('<div class="it"><span class="ok">%d</span><div><h3>%s</h3></div></div>' % (k + 1, t) for k, t in enumerate(['As 12 pautas e o modelo de capa', 'A data da primeira gravação', 'O link do Mery Compartilha e os 3 áudios de que você mais gosta']))
  + '</div><div class="lst" style="gap:20px">'
  + ''.join('<div class="it"><span class="ok">%d</span><div><h3>%s</h3></div></div>' % (k + 4, t) for k, t in enumerate(['O WhatsApp que recebe os agendamentos da página', 'Uma foto do canto do consultório onde vai gravar', 'Acesso de Editor no canal @MeryeleQueirozTerapeuta']))
  + '</div></div>')
# 27 feedback
s('cor centro', '<p class="k">Sua opinião</p><h2 style="font-size:84px">O que você está achando do Grupo Euforia até agora?</h2><div class="chips nofwd" data-notas>%s</div><p class="t" style="opacity:1;font-size:32px">De 0 a 10, quanto você indicaria a gente?</p><div class="notas nofwd" data-notas>%s</div>' % (''.join('<button>%s</button>' % c for c in ['Estou animada', 'Ficou claro', 'Amei as capas', 'Gostei da estratégia', 'Quero ajustar algo']), ''.join('<button>%d</button>' % n for n in range(0, 11))))
# 28 obrigado
s('capa', '<div class="tx"><img src="%s" style="width:470px"><p class="k">Meryele Queiroz × Grupo Euforia</p><h1>Obrigado,<br><em>Meryele.</em></h1><div class="barra"></div><p class="data">Próximo passo: a sua primeira gravação.</p></div><div class="ft" style="background-image:url(%s);background-position:center 14%%"></div>' % (I['logo-claro'], I['f-fim']), False)

extra_js = re.sub(r"document\.querySelectorAll\('\[data-pal\]'\).*?\n\}\);\n", '', extra_js, flags=re.S).replace('/* Daniele 24/11 */', '')
js += pinta(extra_js).replace('%%', '%').replace('__NOS__', '[' + ','.join(repr(n[3]) for n in NOS) + ']')
# textos da conta (6 vídeos do contrato) e do vídeo simulado
js = js.replace("C.l.textContent=p*4;C.s.textContent=p*12;C.c.textContent=p*4;C.t.textContent=p*4;", "C.l.textContent=m;C.s.textContent=m*3;C.c.textContent=m;C.t.textContent=m;")
js = js.replace("M.innerHTML=m===1?'Mês 1: <em>setup</em>. Identidade, 12 roteiros e relançamento do canal.':'Até o mês '+m+': <em>'+(p*4+p*12+p*4)+' peças</em> no ar, todas aprovadas por você.'}",
                "M.innerHTML=(m===1?'1 vídeo gravado':m+' vídeos gravados')+': <em>'+(m*6)+' peças</em> no ar, todas aprovadas por você.'+(m===6?' É o que está no seu contrato até fevereiro.':'')}")
js = js.replace("if(+r.value>=12)return clearInterval(an)", "if(+r.value>=6)return clearInterval(an)").replace("},260)}}", "},450)}}")
js = js.replace("'<b>0:20 · Você.</b> Nome e especialidade logo na entrada: a empresa sabe quem está falando.'", "'<b>0:20 · Você.</b> Nome e especialidade logo na entrada: quem assiste sabe com quem está falando.'")
js = js.replace("'<b>6:00 · Chamada.</b> O convite para o autodiagnóstico, no meio e no fim.'", "'<b>Fim · Chamada.</b> O convite para o Mery Compartilha, no meio e no fim do vídeo.'")
js = js.replace("'<b>3:00 · Os cortes.</b> Cada trecho marcado vira um short de até 1 minuto.'", "'<b>Os cortes.</b> Cada trecho marcado vira um short de até 1 minuto.'")
js = js.replace("'<b>1:00 · Exemplos na tela.</b> Enquanto você fala, os pontos aparecem escritos.'", "'<b>Exemplos na tela.</b> Enquanto você fala, os pontos aparecem escritos.'")
assert 'empresa sabe' not in js and 'autodiagnóstico' not in js and 'p*12' not in js, 'troca de texto falhou'
js += r'''
document.querySelectorAll('[data-mc]').forEach(R=>{
 const B=[...R.querySelectorAll('.ops button')],T=R.querySelector('.mct'),bg=T.querySelector('.bg'),lg=T.querySelector('.leg'),mk=T.querySelector('.mk'),ct=T.querySelector('.cta3'),wv=T.querySelector('.wv'),P=R.querySelector('.play2');let tm=null;
 function at(k){B.forEach((b,j)=>b.classList.toggle('on',j===k));bg.classList.toggle('on',k>=1);T.classList.toggle('img',k>=1);wv.style.opacity=k>=1?0:1;lg.classList.toggle('on',k>=2);mk.classList.toggle('on',k>=3);ct.classList.toggle('on',k>=3)}
 B.forEach((b,k)=>b.addEventListener('click',e=>{e.stopPropagation();clearInterval(tm);at(k)}));
 P.addEventListener('click',e=>{e.stopPropagation();clearInterval(tm);let k=0;at(0);tm=setInterval(()=>{k++;if(k>3)return clearInterval(tm);at(k)},1800)});
 at(0);
});
document.querySelectorAll('[data-anat]').forEach(R=>{
 const V=R.querySelector('.anv'),S=[...R.querySelectorAll('.sel2 button')],H=[...R.querySelectorAll('.hp')],P=[...R.querySelectorAll('.hotinfo')];
 function at(k){H.forEach((h,j)=>h.classList.toggle('on',j===k));P.forEach((p,j)=>p.style.display=j===k?'block':'none')}
 function modo(v){S.forEach(b=>b.classList.toggle('on',b.dataset.v===v));V.classList.toggle('ruim',v==='ruim');if(v==='ruim'){P.forEach(p=>p.style.display='none')}else at(0)}
 S.forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();modo(b.dataset.v)}));
 H.forEach((h,k)=>h.addEventListener('click',e=>{e.stopPropagation();at(k)}));
 modo('bom');
});
'''

html = '''<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>Meryele Queiroz · Audiovisual + Estratégia · 26/11</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=PT+Serif:ital,wght@0,400;0,700;1,400;1,700&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>''' + css + '''</style></head>
<body><div id="palco">''' + ''.join(SL) + '''</div><div id="bar"></div>
<div id="nav"><button id="prev" aria-label="Anterior">‹</button><button id="next" aria-label="Próximo">›</button><button id="fs" aria-label="Tela cheia">⛶</button></div>
<script>''' + js + '''</script></body></html>'''
for proib in ['LinkedIn', 'Call 1', 'Call 2', 'Henrique', 'Flau', 'IH!', 'Daniele', 'liderança em construção']:
    assert proib not in html, proib
open(SAIDA, 'w').write(html)
print(len(html) // 1024, 'KB', len(SL), 'slides')
