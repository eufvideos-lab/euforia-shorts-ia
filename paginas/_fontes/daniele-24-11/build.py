import base64, os, re
D = os.path.dirname(os.path.abspath(__file__))
def b(n):
    ext = 'png' if n.endswith('.png') else 'jpeg'
    return 'data:image/%s;base64,' % ext + base64.b64encode(open(D + '/web/' + n, 'rb').read()).decode()
I = {n.rsplit('.', 1)[0]: b(n) for n in os.listdir(D + '/web')}
FUNIL = 'https://grupoeuforia.com.br/funil-daniele-malafronte-20261112-gso4b0sf'
PAGINA = 'https://grupoeuforia.com.br/pagina-daniele-malafronte-previa-20261109-k7wq3m'
MARCA = '<div class="marca">Inteligência Humana × Grupo Euforia</div>'

css = open(D + '/base.css').read()
css = css.replace(':root{--fundo:#0A1A3A;--txt:#EEF3FF;--claro:#EEF3FB;--escuro:#0A1A3A;--cor:#2F7BFF;--cor2:#1F5FD6;--sobrecor:#fff;--card:#13284F;--fh:Montserrat,Arial,sans-serif;--fb:Inter,Arial,sans-serif}',
                  ':root{--fundo:#111945;--txt:#F4F5FA;--claro:#F4F5FA;--escuro:#111945;--cor:#FF7700;--cor2:#E86A00;--sobrecor:#fff;--card:#1D2766;--fh:Nunito,Arial,sans-serif;--fb:"Nunito Sans",Arial,sans-serif}')
css = css.replace('rgba(47,123,255', 'rgba(255,119,0').replace('#1A3770', '#28348A').replace('#0A1A3A', '#111945').replace('#1F4FB0', '#2A3590').replace('rgba(10,26,58', 'rgba(17,25,69').replace('rgba(4,10,28', 'rgba(8,12,36').replace('font-family:Montserrat,Arial', 'font-family:Nunito,Arial').replace('font-family:Inter,Arial,sans-serif', 'font-family:"Nunito Sans",Arial,sans-serif')
assert '--fundo:#111945' in css
js = open(D + '/base.js').read()
js = re.sub(r"document\.querySelectorAll\('\[data-sh\]'\).*?\n\}\);\n", '', js, flags=re.S)
js = re.sub(r"document\.querySelectorAll\('\[data-aud\]'\).*?\n\}\);\n?", '', js, flags=re.S)
assert 'data-sh' not in js and 'data-aud' not in js
# ajustar o formato (horizontal) ao quadro da Daniele
js = js.replace("sh:{w:H*9/16,x:560,", "sh:{w:H*9/16,x:400,").replace("fd:{w:H*4/5,x:520,", "fd:{w:H*4/5,x:330,")
js = js.replace("'<b>O vídeo completo no YouTube.</b> A tela inteira é aproveitada, do jeito que o podcast foi gravado.'", "'<b>O vídeo completo no YouTube.</b> A tela inteira é aproveitada: você, a mesa e o fundo.'")
js = js.replace("A edição recorta em quem está falando. Arraste o quadro e veja.", "A edição recorta em você. Arraste o quadro e veja.")
js = js.replace("'<b>Gravado em pé, o vídeo serve só para o short.</b> No YouTube ele aparece com tarjas pretas e ocupa só um terço da tela. Não dá para tirar dele o vídeo longo.'", "'<b>Gravado em pé, o vídeo serve só para o short.</b> No YouTube aparece com tarjas pretas e ocupa um terço da tela. Não dá para tirar dele o vídeo longo.'")

css += r'''
.fn .trilha{gap:8px}.fn .trilha button{padding:10px 20px}.fn .trilha h3{font-size:31px}.fn .trilha p{font-size:22px}.fn .trilha .nn{width:50px;height:50px;font-size:26px}
h1{font-weight:900}h2{font-weight:900}
.fyt .tit,.ytc .gr2 p,.plr .lst2 div,.pz2{text-transform:uppercase}
.chips{display:flex;gap:14px;flex-wrap:wrap}.chips button{background:transparent;border:3px solid var(--escuro);color:var(--escuro);border-radius:999px;padding:12px 26px;font:800 28px var(--fh);cursor:pointer}.chips button.on{background:var(--escuro);color:#fff}
.capa .ft{width:760px}
/* ecossistema */
.eco{display:flex;gap:70px;align-items:center;height:100%}
.eco .lado{width:640px;flex:none;display:flex;flex-direction:column;gap:26px}
.eco h2{font-size:66px}
.roda{position:relative;width:860px;height:860px;flex:none}
.roda svg{position:absolute;inset:0}
.rec{position:absolute;left:50%;top:50%;width:230px;height:230px;margin:-115px 0 0 -115px;border-radius:50%;background:#fff;color:var(--escuro);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font:900 50px var(--fh);box-shadow:0 0 0 18px rgba(255,119,0,.18),0 30px 60px rgba(0,0,0,.4)}
.rec i{width:34px;height:34px;border-radius:50%;background:#E5322D;animation:rp 1.2s infinite}
.rec small{font:700 22px var(--fb);opacity:.6}
@keyframes rp{50%{opacity:.25}}
.no{position:absolute;width:200px;height:200px;margin:-100px 0 0 -100px;border-radius:50%;border:4px solid rgba(255,255,255,.18);background:var(--card);color:var(--txt);cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;font:800 28px var(--fh);transition:.3s}
.no span{font-size:52px;line-height:1}
.no.on{background:var(--cor);border-color:#fff;transform:scale(1.1);box-shadow:0 20px 50px rgba(255,119,0,.4)}
.ecoprev{height:300px;display:flex;align-items:center;gap:26px}
.ecoprev img{max-height:300px;max-width:520px;border-radius:16px;box-shadow:0 20px 40px rgba(0,0,0,.4)}
.lema{font:800 34px var(--fh);border-left:10px solid var(--cor);padding-left:24px}
/* conta */
.conta{display:flex;flex-direction:column;gap:50px}
.conta input[type=range]{width:100%;accent-color:#FF7700;height:40px;cursor:pointer}
.meses2{display:flex;justify-content:space-between;font:800 30px var(--fh);opacity:.6;margin-top:-30px}
.cnt{display:grid;grid-template-columns:repeat(4,1fr);gap:30px}
.cnt div{background:#fff;border-radius:28px;padding:40px;border-bottom:14px solid var(--cor);box-shadow:0 10px 30px rgba(17,25,69,.06)}
.cnt b{display:block;font:900 150px var(--fh);color:var(--cor2);line-height:.9;letter-spacing:-4px}
.cnt h3{font-size:40px;margin-top:14px}
.mesinfo{font:800 46px var(--fh)}
.mesinfo em{font-style:normal}
/* público */
.pubw{display:flex;gap:60px;height:100%;align-items:center}
.pubw .lado{width:640px;flex:none;display:flex;flex-direction:column;gap:22px}
.pubcard{flex:1;background:#fff;border-radius:30px;padding:56px;display:flex;flex-direction:column;gap:26px;box-shadow:0 10px 30px rgba(17,25,69,.08);min-height:640px}
.pubcard .r{font:800 28px var(--fh);letter-spacing:3px;text-transform:uppercase;color:var(--cor2)}
.pubcard h3{font-size:56px}
.pubcard .q{font-size:38px;line-height:1.35;opacity:.85}
.pz2{display:flex;gap:20px;align-items:center;font-size:34px;font-weight:700;padding:18px 24px;border-radius:18px;background:var(--claro)}
.pz2 span{font:900 34px var(--fh);color:var(--cor2)}
/* playlists */
.plw{display:flex;gap:60px;height:100%;align-items:center}
.plw .lado{width:600px;flex:none;display:flex;flex-direction:column;gap:22px}
.plr{flex:1;display:flex;flex-direction:column;gap:22px}
.plr img{width:100%;border-radius:20px;box-shadow:0 24px 50px rgba(0,0,0,.45)}
.plr .lst2{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.plr .lst2 div{background:var(--card);border-radius:18px;padding:20px 22px;font-size:28px;font-weight:700;line-height:1.25}
.plr .lst2 span{display:block;font:900 30px var(--fh);color:var(--cor);margin-bottom:6px}
/* tv */
.tvw{display:flex;flex-direction:column;gap:18px;align-items:center;margin-top:-40px}
.tv2{position:relative;width:1120px;height:630px;border-radius:24px;overflow:hidden;background:#000 center/cover;box-shadow:0 30px 70px rgba(0,0,0,.5)}
.tv2 .ly{position:absolute;opacity:0;transition:.5s;pointer-events:none}
.tv2 .ly.on{opacity:1}
.tv2 .leg2{left:0;right:0;bottom:80px;text-align:center;font:900 64px var(--fh);color:#fff;text-shadow:0 4px 18px rgba(0,0,0,.8);line-height:1.1}
.tv2 .leg2 em{color:#FF7700;font-style:normal}
.tv2 .lt{left:50px;bottom:60px;background:#111945;border-left:12px solid #FF7700;padding:18px 30px;border-radius:10px}
.tv2 .lt b{display:block;font:900 40px var(--fh);color:#fff}.tv2 .lt span{font:700 26px var(--fb);color:#E9EBF3}
.tv2 .ex{right:50px;top:60px;width:470px;background:rgba(17,25,69,.92);border-radius:20px;padding:30px;display:flex;flex-direction:column;gap:14px}
.tv2 .ex p{font:800 30px var(--fh);color:#fff}.tv2 .ex p span{color:#FF7700}
.tv2 .cut{top:0;bottom:0;left:390px;width:354px;border:7px solid #FF7700;border-radius:12px;box-shadow:0 0 0 2000px rgba(8,12,36,.6)}
.tv2 .cut span{position:absolute;top:16px;left:50%;transform:translateX(-50%);background:#FF7700;color:#fff;font:900 26px var(--fh);padding:6px 18px;border-radius:999px;white-space:nowrap}
.tv2 .cta2{left:50%;bottom:70px;transform:translateX(-50%);background:#fff;color:#111945;border-radius:22px;padding:24px 36px;display:flex;gap:22px;align-items:center;box-shadow:0 20px 40px rgba(0,0,0,.4)}
.tv2 .cta2 b{font:900 36px var(--fh)}.tv2 .cta2 span{background:#FF7700;color:#fff;border-radius:999px;padding:10px 22px;font:800 26px var(--fh)}
.tl2{display:flex;width:1120px;height:60px;border-radius:14px;overflow:hidden;position:relative}
.tl2 button{border:0;color:#fff;font:800 24px var(--fh);cursor:pointer;opacity:.55;transition:.3s}
.tl2 button.on{opacity:1}
.tl2 .ph2{position:absolute;top:-8px;bottom:-8px;width:6px;background:#fff;box-shadow:0 0 14px #fff;transition:left .5s;pointer-events:none}
.tvinfo{font-size:32px;min-height:46px;text-align:center}
.tvinfo b{color:var(--cor)}
.play2{background:var(--cor);color:#fff;border:0;border-radius:999px;padding:14px 30px;font:800 26px var(--fh);cursor:pointer}
/* paleta */
.palw{display:flex;gap:56px;height:100%;align-items:center}
.palw .lado{width:600px;flex:none;display:flex;flex-direction:column;gap:22px}
.palw .ops button small{display:block;font-size:22px;opacity:.7;font-weight:600}
.selo2{margin-left:auto;background:var(--cor);color:#fff;border-radius:999px;font:800 18px var(--fh);padding:6px 12px;white-space:nowrap}
.mock{flex:1;display:grid;grid-template-columns:1.55fr 1fr;grid-template-rows:auto auto;gap:22px;align-items:start}
.mock .ban{grid-column:1/3}
.mock .fade{position:relative}
.mock .fade img{width:100%;display:block;border-radius:18px;box-shadow:0 20px 40px rgba(0,0,0,.4);transition:opacity .6s}
.mock .fade img+img{position:absolute;left:0;top:0;opacity:0}
.mock.insta .fade img+img{opacity:1}
.mock.insta .fade img:first-child{opacity:0}
.sw{display:flex;gap:10px;margin-top:4px}
.sw i{width:56px;height:56px;border-radius:14px;border:3px solid rgba(255,255,255,.4)}
/* canal yt */
.ytc{width:1500px;background:#0f0f0f;border-radius:26px;overflow:hidden;box-shadow:0 30px 70px rgba(0,0,0,.5);align-self:center}
.ytc .bn{height:220px;background-size:cover;background-position:center}
.ytc .hd{display:flex;gap:30px;align-items:center;padding:20px 44px}
.ytc .hd img{width:130px;height:130px;border-radius:50%}
.ytc .hd b{font:900 46px var(--fh);color:#fff;display:block}
.ytc .hd span{font-size:24px;color:#aaa}
.ytc .hd .ins{margin-left:auto;background:#fff;color:#000;border-radius:999px;padding:14px 28px;font:700 24px var(--fb)}
.ytc .gr2{display:grid;grid-template-columns:repeat(4,1fr);gap:22px;padding:0 44px 40px}
.ytc .gr2 img{width:100%;border-radius:12px;display:block}
.ytc .gr2 p{color:#fff;font:800 21px var(--fb);margin-top:10px;line-height:1.25}
.ytc .gr2 small{color:#aaa;font-size:18px}
/* carrossel celular */
.carw{display:flex;gap:90px;align-items:center;height:100%}
.carw .lado{flex:1;display:flex;flex-direction:column;gap:26px}
.igc{width:460px;flex:none;background:#fff;color:#111;border-radius:50px;padding:16px;box-shadow:0 40px 80px rgba(0,0,0,.5)}
.igc .in{border-radius:36px;overflow:hidden;background:#fff}
.igc .top3{display:flex;align-items:center;gap:10px;padding:12px 14px;font:700 16px var(--fb)}
.igc .top3 img{width:34px;height:34px;border-radius:50%}
.igc .vp{position:relative;width:428px;height:535px;overflow:hidden;cursor:grab}
.igc .tr2{display:flex;height:100%;transition:transform .45s cubic-bezier(.4,0,.2,1)}
.igc .tr2 img{width:428px;height:535px;flex:none;object-fit:cover}
.igc .cnt2{position:absolute;right:12px;top:12px;background:rgba(0,0,0,.6);color:#fff;font:600 14px var(--fb);padding:4px 10px;border-radius:999px}
.igc .dots{display:flex;justify-content:center;gap:6px;padding:12px}
.igc .dots i{width:8px;height:8px;border-radius:50%;background:#ccc}
.igc .dots i.on{background:#0095f6}
.igc .cap{padding:0 16px 18px;font-size:15px;line-height:1.4}
.navc{display:flex;gap:16px}
.navc button{background:var(--card);color:#fff;border:0;border-radius:16px;padding:16px 28px;font:800 28px var(--fh);cursor:pointer}
/* oculos */
.ocw{display:flex;gap:50px;height:100%;align-items:center}
.ocw .lado{width:600px;flex:none;display:flex;flex-direction:column;gap:20px}
.ocv{flex:1;display:flex;flex-direction:column;gap:24px;align-items:center}
.ocv svg{background:#fff;border-radius:26px;box-shadow:0 10px 30px rgba(17,25,69,.08)}
.ocv .cam2{display:flex;gap:24px;align-items:center;font:800 28px var(--fh)}
.ocv .cam2 svg{background:#E9EBF3}
.alerta{padding:10px 22px;border-radius:999px;font:900 26px var(--fh);color:#fff;background:#2E9E5B;transition:.3s}
.alerta.x{background:#D64545}
/* enquadramento */
.enqw{display:flex;gap:56px;height:100%;align-items:center}
.enqw .lado{width:560px;flex:none;display:flex;flex-direction:column;gap:20px}
.enq{position:relative;width:1060px;height:596px;border-radius:22px;overflow:hidden;background:radial-gradient(ellipse at 50% 40%,#757b7f,#4f5458);box-shadow:0 30px 70px rgba(0,0,0,.45);flex:none}
.enq .im{position:absolute;inset:0;background-repeat:no-repeat;transition:all .7s cubic-bezier(.4,0,.2,1)}
.enq .g{position:absolute;inset:0;pointer-events:none}
.enq .g i{position:absolute;background:rgba(255,255,255,.75)}
.enq .olho{position:absolute;left:0;right:0;top:33.3%;border-top:4px dashed #FF7700;transition:opacity .4s}
.enq .olho span{position:absolute;right:14px;top:-44px;background:#FF7700;color:#fff;font:800 20px var(--fh);padding:4px 12px;border-radius:999px}
.enq .rec2{position:absolute;left:20px;top:18px;color:#fff;font:800 22px var(--fh);display:flex;gap:8px;align-items:center;text-shadow:0 2px 6px rgba(0,0,0,.6)}
.enq .rec2 i{width:16px;height:16px;border-radius:50%;background:#E5322D;animation:rp 1.2s infinite}
/* hotspots */
.hotw{display:flex;gap:56px;height:100%;align-items:center}
.hotw .lado{width:600px;flex:none;display:flex;flex-direction:column;gap:22px}
.hot{position:relative;height:880px;width:587px;border-radius:26px;overflow:hidden;flex:none;box-shadow:0 30px 60px rgba(0,0,0,.4);background:center/cover}
.hp{position:absolute;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;border:5px solid #fff;background:var(--cor);color:#fff;font:900 28px var(--fh);cursor:pointer;box-shadow:0 0 0 0 rgba(255,119,0,.7);animation:hpp 1.8s infinite}
.hp.x{background:#D64545}
.hp.on{transform:scale(1.2);animation:none}
@keyframes hpp{50%{box-shadow:0 0 0 16px rgba(255,119,0,0)}}
.hotinfo{background:var(--card);border-radius:24px;padding:30px 34px;font-size:32px;line-height:1.38;min-height:230px}
.hotinfo b{display:block;font:900 38px var(--fh);color:var(--cor);margin-bottom:8px}
/* checklist */
.chk{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.chk button{display:flex;gap:22px;align-items:center;text-align:left;background:#fff;color:var(--escuro);border:3px solid transparent;border-radius:20px;padding:22px 26px;font:700 32px var(--fb);cursor:pointer;box-shadow:0 6px 18px rgba(17,25,69,.06)}
.chk button i{flex:none;width:52px;height:52px;border-radius:14px;border:4px solid #C9CDE0;display:flex;align-items:center;justify-content:center;font-style:normal;font:900 30px var(--fh);color:#fff;transition:.25s}
.chk button.on{border-color:var(--cor)}
.chk button.on i{background:var(--cor);border-color:var(--cor)}
.barra2{height:22px;border-radius:22px;background:#DDE0EE;overflow:hidden}
.barra2 i{display:block;height:100%;width:0;background:var(--cor);transition:width .4s}
.pronta{font:900 40px var(--fh);color:var(--cor2);min-height:50px}
/* feedback */
.notas{display:flex;gap:14px}
.notas button{width:110px;height:110px;border-radius:24px;border:0;background:rgba(255,255,255,.22);color:#fff;font:900 46px var(--fh);cursor:pointer;transition:.2s}
.notas button.on{background:var(--escuro);transform:scale(1.08)}
.links2{display:flex;gap:18px;flex-wrap:wrap}
.links2 a{background:var(--cor);color:#fff;text-decoration:none;border-radius:999px;padding:16px 30px;font:800 26px var(--fh)}
.links2 a.sec{background:var(--card)}
/* pagina no funil */
.fpg{background:#111945;color:#fff;padding:0 0 16px;overflow:hidden}
.fpg .hdp{padding:10px 18px;font:900 17px Nunito,Arial}.fpg .hdp span{color:#FF7700}
.fpg h4{font:900 26px Nunito,Arial;line-height:1.15;padding:6px 18px 4px}.fpg h4 em{color:#FF7700;font-style:normal}
.fpg .sub3{font-size:14px;opacity:.8;padding:0 18px 10px}
.fpg .qq{margin:6px 14px;background:rgba(255,255,255,.08);border-radius:12px;padding:10px 12px;font-size:14px;line-height:1.35}
.fpg .esc{display:flex;gap:6px;margin-top:8px}
.fpg .esc span{flex:1;text-align:center;border-radius:8px;background:rgba(255,255,255,.14);padding:6px 0;font-weight:800;cursor:pointer}
.fpg .esc span.on{background:#FF7700}
.fpg .res{margin:10px 14px 0;background:#fff;color:#111945;border-radius:14px;padding:12px 14px;font-size:14px;line-height:1.4;opacity:.35;transition:.4s}
.fpg .res.vis{opacity:1}
.fpg .res b{font:900 18px Nunito,Arial;display:block}
.fpg .res .zap{display:block;margin-top:10px;background:#25D366;color:#fff;text-align:center;border-radius:10px;padding:10px;font-weight:800;cursor:pointer}
'''

SL = []
def s(cls, body, marca=True):
    SL.append('<section class="s %s">%s%s</section>' % (cls, body, MARCA if marca else ''))

# 1 capa
s('capa', '<div class="tx"><img src="%s" style="width:130px"><p class="k">Inteligência Humana × Grupo Euforia</p><h1>Daniele,<br>hora de<br><em>dar o play.</em></h1><div class="barra"></div><p class="data">Reunião de Audiovisual + Estratégia · 24 de novembro de 2026</p></div><div class="ft" style="background-image:url(%s);background-position:center 20%%"></div>' % (I['simbolo-claro'], I['f-blazer']), False)
# 2 hoje
s('', '<div class="cab"><p class="k">Hoje</p><h2>O que vamos fazer</h2></div><div class="ag"><div><span>01</span><h3>A estratégia do canal, do vídeo à proposta</h3></div><div><span>02</span><h3>A identidade: decidir as cores</h3></div><div><span>03</span><h3>Consultoria audiovisual: gravar bem em casa</h3></div><div><span>04</span><h3>Marcar a primeira gravação</h3></div></div>')
# 3 decisões
s('claro', '<div class="cab"><p class="k">Onboarding · 17 de novembro</p><h2>O que você já <em>decidiu</em></h2></div><div class="duo" style="grid-template-columns:1fr 1fr;gap:30px"><div class="lst">'
  '<div class="it"><span class="ok">✓</span><div><h3>Consultoria para empresas</h3><p>É a porta de entrada da página de vendas.</p></div></div>'
  '<div class="it"><span class="ok">✓</span><div><h3>Capas no modelo A</h3><p>O de autoridade, alinhado ao seu Instagram.</p></div></div></div><div class="lst">'
  '<div class="it"><span class="ok">✓</span><div><h3>1 vídeo, 4 peças</h3><p>Roteiro de 4 a 7 minutos que vira 3 shorts e 1 carrossel.</p></div></div>'
  '<div class="it"><span class="ok">✓</span><div><h3>12 pautas aprovadas</h3><p>Em 4 playlists. Os roteiros já estão sendo escritos.</p></div></div></div></div>')
# 4 divisor
s('cor centro', '<p class="k">01</p><h2 class="g">A estratégia</h2><p class="sub" style="opacity:1">Como um vídeo gravado na sua casa vira uma conversa com uma empresa.</p>')
# 5 ecossistema
NOS = [('🎬', 'Vídeos', 'thumb-01', '<b>A base de tudo.</b> Vídeos de 4 a 7 minutos em que a empresa conhece o seu jeito de pensar. Ficam no ar por anos e são encontrados na busca.'),
       ('⚡', 'Shorts', 'short', '<b>A vitrine.</b> Os trechos mais fortes viram vídeos curtos no YouTube e atraem quem ainda não conhece você.'),
       ('📱', 'Reels', 'short', '<b>Os mesmos cortes no Instagram e no TikTok.</b> Só você falando de liderança. Nada de dancinha.'),
       ('🗂️', 'Carrosséis', 'car-01', '<b>Para quem prefere ler.</b> Cada vídeo vira um carrossel no seu Instagram, com a sua marca.'),
       ('🖼️', 'Capas', 'thumb-04', '<b>A capa decide o clique.</b> Modelo A, de autoridade, o que você escolheu.'),
       ('🧭', 'Página', 'pagina-cel', '<b>Onde tudo chega.</b> O autodiagnóstico “chefe ou líder?” e a empresa vai para o seu WhatsApp já sabendo o problema.')]
import math
nos = ''; linhas = ''
for k, (ic, nm, im, tx) in enumerate(NOS):
    a = -math.pi / 2 + k * 2 * math.pi / len(NOS); x = 430 + 330 * math.cos(a); y = 430 + 330 * math.sin(a)
    nos += '<button class="no" style="left:%dpx;top:%dpx" data-i="%d"><span>%s</span>%s</button>' % (x, y, k, ic, nm)
    linhas += '<line x1="430" y1="430" x2="%d" y2="%d" stroke="#FF7700" stroke-opacity=".45" stroke-width="5" stroke-dasharray="10 12"/>' % (x, y)
shortmock = '<div style="width:169px;height:300px;border-radius:16px;background:url(%s) center 20%%/cover;position:relative;box-shadow:0 20px 40px rgba(0,0,0,.4);flex:none"><div style="position:absolute;left:10px;right:10px;bottom:24px;font:900 18px Nunito;color:#fff;text-align:center;text-shadow:0 2px 8px #000">Você cobra tarefa ou <span style=color:#FF7700>desenvolve pessoas</span>?</div></div>' % I['f-blazer']
prevs = ''
for k, (ic, nm, im, tx) in enumerate(NOS):
    pv = shortmock if im == 'short' else '<img src="%s">' % I[im]
    prevs += '<div class="ecoprev" data-p="%d" style="display:none">%s</div>' % (k, pv)
s('', '<div class="eco nofwd" data-eco><div class="lado"><p class="k">O ecossistema</p><h2>Você grava <em>uma vez</em>. O canal trabalha o mês inteiro.</h2><p class="info"></p>%s<p class="lema">O objetivo não é viralizar. É ser encontrada por quem decide.</p></div><div class="roda"><svg viewBox="0 0 860 860">%s<circle cx="430" cy="430" r="330" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="3"/></svg><div class="rec"><i></i>REC<small>você grava</small></div>%s</div></div>' % (prevs, linhas, nos))
# 6 conta
s('claro', '<div class="cab"><p class="k">Arraste os meses</p><h2>Em 12 meses, o que sai das suas gravações</h2></div><div class="conta nofwd" data-conta><p class="mesinfo"></p><input type="range" min="1" max="12" value="12"><div class="meses2">' + ''.join('<span>%d</span>' % m for m in range(1, 13)) + '</div><div class="cnt"><div><b data-c="l">0</b><h3>vídeos longos</h3></div><div><b data-c="s">0</b><h3>shorts</h3></div><div><b data-c="c">0</b><h3>carrosséis</h3></div><div><b data-c="t">0</b><h3>capas próprias</h3></div></div></div>')
# 7 público
PUB = [('RH', 'Quem faz o primeiro contato', 'Procura um programa que resolva conflitos, rotatividade e gestores despreparados.', [(8, 'Por que as pessoas boas pedem para sair'), (9, 'Conflito na equipe: quando entrar'), (12, 'A geração Z não é o problema')]),
       ('Dono, CEO, diretor', 'Quem decide a contratação', 'Quer uma equipe que entregue sem depender dele o tempo todo.', [(1, '5 sinais de que você é chefe, não líder'), (2, 'Por que bons técnicos viram maus gestores'), (10, 'O líder que apaga incêndio o dia todo')]),
       ('Gestores e líderes', 'Quem vive o problema todo dia', 'Busca como dar feedback, conduzir conversas difíceis e liderar quem era colega.', [(4, 'Feedback sem desmotivar a equipe'), (6, 'Conversas difíceis'), (7, 'Liderar quem era seu colega')])]
bts = ''.join('<button data-i="%d"><span class="st">%d</span>%s</button>' % (k, k + 1, p[0]) for k, p in enumerate(PUB))
cards = ''.join('<div class="pubcard" data-p="%d" style="display:none"><p class="r">%s</p><h3>%s</h3><p class="q">%s</p><p class="r" style="margin-top:10px">Pautas que falam com ele</p>%s</div>' % (k, p[1], p[0], p[2], ''.join('<div class="pz2"><span>%02d</span>%s</div>' % x for x in p[3])) for k, p in enumerate(PUB))
s('claro', '<div class="pubw nofwd" data-tab><div class="lado"><p class="k">Para quem você fala</p><h2 style="font-size:66px">O RH chama. <em>Quem decide</em> é o dono.</h2><p class="t" style="font-size:30px">Foi o que você nos contou. Por isso as pautas falam com os três. Toque em cada um.</p><div class="ops">%s</div></div>%s</div>' % (bts, cards))
# 8 funil
fn = ('<div class="fn nofwd" data-funil style="gap:70px"><div class="lado" style="gap:16px"><p class="k">O caminho do cliente</p><h2 style="font-size:58px">Do short à <em>proposta</em>.</h2><p class="t" style="font-size:30px">Toque em cada passo. Tudo orgânico, sem anúncio.</p><div class="trilha">'
      + ''.join('<button><span class="nn">%d</span><div><h3>%s</h3><p>%s</p></div></button>' % (k + 1, h, p) for k, (h, p) in enumerate([('O short atrai', 'O gestor para no dedo e vai ao vídeo'), ('O vídeo convence', 'Ele reconhece você como especialista'), ('O autodiagnóstico', '“Chefe ou líder?” na sua página'), ('O WhatsApp', 'Chega sabendo o problema'), ('A conversa de diagnóstico', 'Você entende a empresa'), ('A proposta', 'Consultoria para empresas')]))
      + '</div><div class="links2"><a href="%s" target="_blank">Abrir a página</a><a class="sec" href="%s" target="_blank">Simulação completa</a></div></div><div class="fcel"><div class="ftela">' % (PAGINA, FUNIL)
      + '<div class="fc fsh"><div class="fbar"><span>9:41</span><span>●●● ▮</span></div><div class="vid" style="background-image:url(%s);background-position:center 20%%"><div class="ac"><div>❤<small>curtir</small></div><div>💬<small>coment.</small></div><div>↗<small>compart.</small></div></div><div class="leg"><b>Daniele Malafronte · IH!</b>Você cobra tarefa… ou desenvolve pessoas?<br><span class="tag fpulsa" data-ir="1">▶ Assistir ao vídeo completo</span></div></div></div>' % I['f-blazer']
      + '<div class="fc fyt"><div class="fbar"><span>9:41</span><span>●●● ▮</span></div><div class="top"><b>▶</b> YouTube</div><img class="v" src="%s"><p class="tit">5 sinais de que você é chefe, não líder</p><p class="meta">Inteligência Humana · Daniele Malafronte</p><div class="canal"><i><img src="%s"></i>Inteligência Humana<span class="insc">Inscrever-se</span></div><div class="caixa">📌 <b>Comentário fixado</b><br>A sua empresa tem chefes ou líderes? Faça o autodiagnóstico: <span class="lk fpulsa" data-ir="2">fazer o teste</span></div><div class="caixa">O mesmo link vai na primeira linha da descrição de cada vídeo.</div></div>' % (I['thumb-01'], I['simbolo-claro'])
      + '<div class="fc fpg"><div class="fbar"><span>9:41</span><span>●●● ▮</span></div><div class="hdp">Inteligência <span>Humana</span></div><h4>Sua empresa tem <em>chefes</em> ou <em>líderes</em>?</h4><p class="sub3">Responda de 1 a 5. Toque nos números.</p>'
      + ''.join('<div class="qq">%s<div class="esc">%s</div></div>' % (q, ''.join('<span>%d</span>' % n for n in range(1, 6))) for q in ['Os gestores explicam o porquê das decisões?', 'A equipe resolve problemas sem o chefe?', 'O feedback acontece fora da hora do erro?'])
      + '<div class="res"><b>Liderança em construção</b>Os seus gestores cobram, mas ainda não desenvolvem pessoas. Dá para mudar.<span class="zap fpulsa" data-ir="3">Falar com a Daniele no WhatsApp</span></div></div>'
      + '<div class="fc fwa"><div class="fbar" style="background:#075e54;color:#fff"><span>9:41</span><span>●●● ▮</span></div><div class="cab"><i><img src="%s"></i><div><b>Daniele Malafronte</b><span>IH! Gestão de Pessoas</span></div></div><div class="msgs"><div class="fbal eu">Olá, Daniele! Fiz o autodiagnóstico na sua página e deu “liderança em construção”. Quero entender a consultoria.<small>mensagem pronta da página</small></div><div class="fbal ela">Que bom que chegou! Me conta: quantos gestores vocês têm e o que mais pesa na equipe hoje?<small>Daniele</small></div><div class="fbal eu">Somos 8 gestores. A rotatividade e os conflitos estão altos.<small>gerente de RH</small></div><div class="fbal ela">Vamos marcar uma conversa de diagnóstico com a diretoria. Qual o melhor dia?<small>Daniele</small></div></div></div>' % I['simbolo-claro']
      + '<div class="fc fmeet"><div class="fbar"><span>9:41</span><span>●●● ▮</span></div><div class="gr"><div style="background-image:url(%s)"><span>Daniele · IH!</span></div><div class="cli">CEO<span>Diretor da empresa</span></div><div class="cli" style="background:#3c4043">RH<span>Gerente de RH</span></div><div class="cli" style="background:#4a4d52">G<span>Gestora</span></div></div><div class="pauta"><b>Conversa de diagnóstico</b><br>Onde a liderança trava, quem decide e o que a empresa espera do programa.</div></div>' % I['f-blazer']
      + '<div class="fc ffim"><div class="ic">🤝</div><h4>Proposta de consultoria</h4><p>A empresa chegou pelo conteúdo, já confiando em quem entende de gente.</p><div class="op"><div>🧭 Diagnóstico da liderança</div><div>🎓 Desenvolvimento de líderes</div><div>🎤 Palestras e workshops dentro do programa</div></div></div>'
      + '</div></div></div>')
s('', fn)
# 9 playlists
PL = [('Chefe x líder', 'thumb-01', ['5 sinais de que você é chefe, não líder', 'Por que bons técnicos viram maus gestores', 'Liderar não é mandar']),
      ('Comunicação e feedback', 'thumb-04', ['Feedback sem desmotivar a equipe', 'A reunião que a sua equipe odeia', 'Conversas difíceis']),
      ('Gestão no dia a dia', 'thumb-07', ['Liderar quem era seu colega', 'Por que as pessoas boas pedem para sair', 'Conflito na equipe: quando entrar']),
      ('O líder por dentro', 'thumb-10', ['O líder que apaga incêndio o dia todo', 'Inteligência emocional sob pressão', 'A geração Z não é o problema'])]
bts = ''.join('<button data-i="%d"><span class="st">%d</span>%s</button>' % (k, k + 1, p[0]) for k, p in enumerate(PL))
cards = ''.join('<div class="plr" data-p="%d" style="display:none"><img src="%s"><div class="lst2">%s</div></div>' % (k, I[p[1]], ''.join('<div><span>%02d</span>%s</div>' % (k * 3 + j + 1, t) for j, t in enumerate(p[2]))) for k, p in enumerate(PL))
s('', '<div class="plw nofwd" data-tab><div class="lado"><p class="k">12 pautas · 4 playlists</p><h2 style="font-size:66px">Aprovadas. Agora, <em>as capas</em>.</h2><p class="t" style="font-size:30px">Toque em cada playlist: a capa já está no modelo A, com as suas fotos.</p><div class="ops">%s</div></div>%s</div>' % (bts, cards))
# 10 simulação vídeo
s('', '<div class="tvw nofwd" data-tv><div class="cab" style="align-self:flex-start;gap:10px"><p class="k">Simulação de um vídeo</p><h2 style="font-size:58px">Do play ao fim, <em>onde fica cada coisa</em></h2></div>'
  '<div class="tv2" style="background-image:url(%s)"><div class="ly leg2">Você cobra tarefa…<br>ou <em>desenvolve pessoas</em>?</div><div class="ly lt"><b>Daniele Malafronte</b><span>IH! · Desenvolvimento de lideranças</span></div><div class="ly ex"><p><span>1.</span> Dá ordens sem explicar</p><p><span>2.</span> Cobra o erro, não ensina</p><p><span>3.</span> Tudo depende dele</p></div><div class="ly cut"><span>✂ vira short</span></div><div class="ly cta2"><b>Sua empresa tem chefes ou líderes?</b><span>link na descrição</span></div></div>'
  '<div class="tl2"><button style="width:10%%;background:#FF7700">Gancho</button><button style="width:10%%;background:#E86A00">Você</button><button style="width:30%%;background:#2A3590">Exemplos na tela</button><button style="width:30%%;background:#3B47A8">✂ Shorts</button><button style="width:20%%;background:#FF7700">Chamada</button><i class="ph2"></i></div>'
  '<div style="display:flex;gap:30px;align-items:center"><button class="play2">▶ Ver em sequência</button><p class="tvinfo"></p></div></div>' % I['f-mesa-h'])
# 11 divisor 02
s('cor centro', '<p class="k">02</p><h2 class="g">A identidade</h2><p class="sub" style="opacity:1">Falta uma decisão sua: as cores do canal.</p>')
# 12 paleta
s('', '<div class="palw nofwd" data-pal><div class="lado"><p class="k">Para decidir hoje</p><h2 style="font-size:64px">Qual cara o seu canal vai ter?</h2><div class="ops"><button data-v="ih"><span class="st">A</span><div>IH! corporativa<small>marinho e laranja</small></div><span class="selo2">nossa sugestão</span></button><button data-v="insta"><span class="st">B</span><div>Do seu Instagram<small>laranja e bege</small></div></button></div>'
  '<div class="sw" data-sw="ih"><i style="background:#111945"></i><i style="background:#FF7700"></i><i style="background:#E9EBF3"></i><i style="background:#fff"></i></div><div class="sw" data-sw="insta" style="display:none"><i style="background:#F3E9DD"></i><i style="background:#FF7700"></i><i style="background:#3B2A20"></i><i style="background:#FFF8F0"></i></div><p class="info"></p></div>'
  '<div class="mock"><div class="fade ban"><img src="%s"><img src="%s"></div><div class="fade"><img src="%s"><img src="%s"></div><div class="fade"><img src="%s"><img src="%s"></div></div></div>'
  % (I['paleta-ih-banner'], I['paleta-insta-banner'], I['thumb-01'], I['paleta-insta-thumb'], I['car-01'], I['paleta-insta-carrossel']))
# 13 canal
VID = [('thumb-01', '5 sinais de que você é chefe, não líder'), ('thumb-04', 'Feedback sem desmotivar a equipe'), ('thumb-07', 'Liderar quem era seu colega'), ('thumb-10', 'O líder que apaga incêndio o dia todo')]
s('', '<div class="cab" style="gap:12px"><p class="k">Como o seu canal vai ficar</p><h2 style="font-size:60px">A primeira semana de cada playlist, <em>já na vitrine</em></h2></div><div class="ytc"><div class="bn" style="background-image:url(%s)"></div><div class="hd"><img src="%s"><div><b>Inteligência Humana</b><span>Daniele Malafronte · Desenvolvimento de lideranças</span></div><span class="ins">Inscrever-se</span></div><div class="gr2">%s</div></div>'
  % (I['paleta-ih-banner'], I['perfil'], ''.join('<div><img src="%s"><p>%s</p><small>Inteligência Humana</small></div>' % (I[a], t) for a, t in VID)))
# 14 carrossel
cars = ''.join('<img src="%s" draggable="false">' % I['car-%02d' % k] for k in range(1, 8))
s('claro', '<div class="carw nofwd" data-car><div class="lado"><p class="k">Carrossel completo · pauta 01</p><h2 style="font-size:70px">O vídeo vira <em>carrossel</em>, slide a slide.</h2><p class="t" style="font-size:34px">Capa com a sua foto, cinco sinais com o texto do roteiro e o convite para o autodiagnóstico no fim.</p><div class="navc"><button data-d="-1">‹ Anterior</button><button data-d="1">Próximo ›</button></div></div>'
  '<div class="igc"><div class="in"><div class="top3"><img src="%s">danielemalafronte_</div><div class="vp"><div class="tr2">%s</div><span class="cnt2">1/7</span></div><div class="dots">%s</div><div class="cap"><b>danielemalafronte_</b> Chefe cobra. Líder desenvolve. Qual dos cinco você já viu na sua empresa? 👇</div></div></div></div>'
  % (I['perfil'], cars, '<i></i>' * 7))
# 15 divisor 03
s('cor centro', '<p class="k">03</p><h2 class="g">Consultoria audiovisual</h2><p class="sub" style="opacity:1">Gravar bem em casa, com o que você já tem.</p>')
# 16 formato
s('', '<div class="ix nofwd" data-hz><div class="lado"><p class="k">Consultoria audiovisual · Formato</p><h2>Por que gravamos <em>deitado</em>?</h2><p class="t" style="font-size:30px">Toque em cada formato. É um quadro das suas fotos.</p><div class="ops"><button data-m="yt"><span class="st">✓</span>YouTube · 16:9</button><button data-m="sh"><span class="st">✓</span>Shorts e Reels · 9:16</button><button data-m="fd"><span class="st">✓</span>Feed do Instagram · 4:5</button><button data-m="pe"><span class="st x">✕</span>E se gravar em pé?</button></div><p class="info"></p></div><div class="quadro" style="background-image:url(%s)"><div class="crop"><span></span></div><div class="empe"><img src="%s"></div><div class="dica">↔ arraste o quadro</div></div></div>' % (I['f-mesa-h'], I['f-mesa']))
# 17 luz
s('', '<div class="ix nofwd" data-luz style="gap:44px"><div class="lado" style="width:560px"><p class="k">Consultoria audiovisual · Luz</p><h2 style="font-size:64px">Onde fica a <em>janela</em>?</h2><div class="ops"><button data-l="frente"><span class="st">✓</span>Janela na frente</button><button data-l="lado"><span class="st">✓</span>Janela na diagonal</button><button data-l="atras"><span class="st x">✕</span>Janela atrás de você</button><button data-l="teto"><span class="st x">✕</span>Só a luz do teto</button><button data-l="led"><span class="st">✓</span>À noite: LED atrás da câmera</button></div><p class="info"></p></div><div class="luzw"><div class="planta"><svg viewBox="0 0 440 560" width="440" height="560"><text x="220" y="40" text-anchor="middle" fill="currentColor" opacity=".5" font-family="Nunito Sans" font-weight="700" font-size="20" letter-spacing="3">VISTA DE CIMA</text><rect x="40" y="70" width="360" height="450" rx="10" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-width="4"/><g class="jan" style="transition:transform .6s"><rect x="-70" y="-9" width="140" height="18" rx="4" fill="#7fc4ff"/><g class="raios" stroke="#FFD25A" stroke-width="4" stroke-linecap="round" opacity=".9"><line x1="-40" y1="20" x2="-55" y2="80"/><line x1="0" y1="20" x2="0" y2="90"/><line x1="40" y1="20" x2="55" y2="80"/></g></g><g transform="translate(220 200)"><circle r="44" fill="#F2B38C"/><rect x="-70" y="30" width="140" height="56" rx="28" fill="#FF7700"/><text y="125" text-anchor="middle" fill="currentColor" font-family="Nunito Sans" font-weight="700" font-size="22">você</text></g><g transform="translate(220 430)"><rect x="-40" y="-26" width="80" height="52" rx="10" fill="currentColor" opacity=".85"/><circle r="15" fill="#FF7700"/><text y="58" text-anchor="middle" fill="currentColor" font-family="Nunito Sans" font-weight="700" font-size="22">câmera</text></g><g class="led" style="transition:opacity .4s" opacity="0"><circle cx="220" cy="490" r="22" fill="#FFD25A"/><text x="290" y="497" fill="currentColor" font-family="Nunito Sans" font-weight="700" font-size="20">LED</text></g><g class="lamp" style="transition:opacity .4s" opacity="0"><circle cx="220" cy="200" r="70" fill="none" stroke="#FFD25A" stroke-width="4" stroke-dasharray="8 8"/><text x="300" y="130" fill="currentColor" font-family="Nunito Sans" font-weight="700" font-size="20">teto</text></g></svg></div><div class="foto"><img src="%s"><div class="ov"></div><span class="tag2">simulação</span></div></div></div>' % I['f-blazer'])
# 18 óculos
s('claro', '<div class="ocw nofwd" data-oc><div class="lado"><p class="k">Consultoria audiovisual · Óculos</p><h2 style="font-size:62px">Adeus, <em>reflexo</em> na lente.</h2><p class="t" style="font-size:28px">A luz bate na lente e volta como num espelho. Se voltar para a câmera, aparece o reflexo. Toque nas opções.</p><div class="ops"><button data-o="frente"><span class="st x">✕</span>Janela bem de frente</button><button data-o="diag"><span class="st">✓</span>Janela na diagonal</button><button data-o="alta"><span class="st">✓</span>Luz um pouco mais alta</button><button data-o="incl"><span class="st">✓</span>Lente levemente inclinada</button></div><p class="info"></p></div>'
  '<div class="ocv"><svg viewBox="0 0 900 560" width="900" height="560"><text class="vista" x="450" y="44" text-anchor="middle" fill="#111945" opacity=".5" font-family="Nunito Sans" font-weight="700" font-size="22" letter-spacing="3">VISTA DE CIMA</text>'
  '<g transform="translate(120 300)"><rect x="-46" y="-34" width="92" height="68" rx="12" fill="#111945"/><circle r="20" fill="#FF7700"/><text y="70" text-anchor="middle" fill="#111945" font-family="Nunito Sans" font-weight="800" font-size="24">câmera</text></g>'
  '<g transform="translate(700 300)"><circle cx="70" r="70" fill="#F2B38C"/><text x="70" y="110" text-anchor="middle" fill="#111945" font-family="Nunito Sans" font-weight="800" font-size="24">você</text></g>'
  '<g class="lente" style="transition:transform .6s"><line x1="0" y1="-60" x2="0" y2="60" stroke="#7fc4ff" stroke-width="12" stroke-linecap="round"/></g>'
  '<g class="fonte" style="transition:transform .6s"><circle r="34" fill="#FFD25A"/><text y="-46" text-anchor="middle" fill="#111945" font-family="Nunito Sans" font-weight="800" font-size="24" class="ftx">janela</text></g>'
  '<line class="r1" stroke="#FFB800" stroke-width="7" stroke-linecap="round"/><line class="r2" stroke-width="7" stroke-linecap="round" stroke-dasharray="14 10"/></svg>'
  '<div class="cam2"><span>Como a câmera vê:</span><svg viewBox="0 0 300 120" width="300" height="120"><rect width="300" height="120" fill="#F2B38C"/><g fill="#9fb3d1" fill-opacity=".35" stroke="#111945" stroke-width="8"><rect x="30" y="25" width="100" height="70" rx="22"/><rect x="170" y="25" width="100" height="70" rx="22"/><path d="M130 55 Q150 40 170 55" fill="none"/></g><g class="brilho" style="transition:opacity .4s"><ellipse cx="80" cy="55" rx="40" ry="24" fill="#fff"/><ellipse cx="220" cy="55" rx="40" ry="24" fill="#fff"/><rect x="62" y="35" width="10" height="40" fill="#fff" transform="rotate(25 80 55)"/></g></svg><span class="alerta">sem reflexo</span></div></div></div>')
# 19 enquadramento
s('', '<div class="enqw nofwd" data-enq><div class="lado"><p class="k">Consultoria audiovisual · Câmera</p><h2 style="font-size:62px">Olhos no <em>terço de cima</em>.</h2><div class="ops"><button data-e="ok"><span class="st">✓</span>Do peito para cima</button><button data-e="baixa"><span class="st x">✕</span>Câmera do notebook, de baixo</button><button data-e="longe"><span class="st x">✕</span>Longe demais</button><button data-e="perto"><span class="st x">✕</span>Cortando a cabeça</button></div><p class="info"></p></div>'
  '<div class="enq"><div class="im" style="background-image:url(%s)"></div><div class="g"><i style="left:33.3%%;top:0;bottom:0;width:2px"></i><i style="left:66.6%%;top:0;bottom:0;width:2px"></i><i style="top:33.3%%;left:0;right:0;height:2px"></i><i style="top:66.6%%;left:0;right:0;height:2px"></i></div><div class="olho"><span>linha dos olhos</span></div><div class="rec2"><i></i>REC 16:9</div></div></div>' % I['f-blazer'])
# 20 lapela
s('claro', '<div class="ix nofwd" data-lap style="gap:50px"><div class="lado" style="width:720px"><p class="k">Consultoria audiovisual · Áudio</p><h2 style="font-size:62px">O público perdoa imagem simples. <em>Som ruim, não.</em></h2><div class="porque"><b>Por que a lapela?</b>Ela fica sempre à mesma distância da boca, mesmo quando você vira o rosto. Pega a sua voz e deixa a sala de fora. O microfone do celular fica longe e grava o eco.</div><p class="info" style="font-size:30px"></p></div><div style="display:flex;flex-direction:column;gap:18px;align-items:center"><div class="corpo"><svg viewBox="0 0 520 620" width="520" height="620"><text x="260" y="44" text-anchor="middle" fill="#111945" opacity=".5" font-family="Nunito Sans" font-weight="700" font-size="20" letter-spacing="3">ONDE PRENDER A LAPELA</text><ellipse cx="260" cy="190" rx="78" ry="96" fill="#E9C2A6"/><rect x="226" y="270" width="68" height="60" fill="#E9C2A6"/><path d="M60 620 C60 420 120 330 226 318 L260 360 L294 318 C400 330 460 420 460 620 Z" fill="#FF7700"/><path d="M226 318 L260 360 L294 318" fill="none" stroke="#fff" stroke-width="6"/><path d="M262 365 C262 430 300 470 330 520 C350 560 340 600 345 620" fill="none" stroke="#111" stroke-width="4" stroke-dasharray="10 8" class="fio" opacity="0"/><g class="regua" opacity="0"><line x1="300" y1="235" x2="300" y2="400" stroke="#111945" stroke-width="5" stroke-dasharray="4 8"/><text x="312" y="320" fill="#111945" font-family="Nunito Sans" font-weight="800" font-size="24">1 palmo</text></g></svg><button class="pin ok" style="left:260px;top:400px" data-p="0">✓</button><button class="pin x" style="left:262px;top:292px" data-p="1">✕</button><button class="pin x" style="left:260px;top:560px" data-p="2">✕</button></div></div></div>')
# 21 cenário
HS = [(82, 22, 'ok', 'Fundo com textura', 'A parede verde dá profundidade e personalidade. Fundo liso e branco deixa o vídeo com cara de reunião online.'),
      (30, 4, 'ok', 'Luz decorativa no fundo', 'As luzinhas acesas atrás dão calor à cena. Elas enfeitam, mas não iluminam o rosto: essa é a função da janela.'),
      (30, 70, 'ok', 'A sua marca na cena', 'A caneca da IH! aparece sem você precisar falar. Pequenos detalhes reforçam a marca em todo vídeo.'),
      (12, 50, 'x', 'Não grave pelo notebook', 'A câmera do notebook fica baixa e a imagem é fraca. Use o celular na horizontal, na altura dos olhos.'),
      (76, 46, 'ok', 'Um metro longe da parede', 'Afastar-se do fundo cria profundidade e tira a sua sombra da parede.')]
hp = ''.join('<button class="hp%s" style="left:%d%%;top:%d%%" data-i="%d">%s</button>' % ('' if c == 'ok' else ' x', x, y, k, '✓' if c == 'ok' else '✕') for k, (x, y, c, h, t) in enumerate(HS))
hinf = ''.join('<div class="hotinfo" data-p="%d" style="display:none"><b>%s</b>%s</div>' % (k, h, t) for k, (x, y, c, h, t) in enumerate(HS))
s('', '<div class="hotw nofwd" data-hot><div class="lado"><p class="k">Consultoria audiovisual · Cenário</p><h2 style="font-size:64px">O cenário das suas fotos já é <em>meio caminho</em>.</h2><p class="t" style="font-size:28px">Toque nos pontos da foto.</p>%s<p class="t" style="font-size:26px">Mande no grupo fotos do lugar onde vai gravar: a equipe confere com você.</p></div><div class="hot" style="background-image:url(%s)">%s</div></div>' % (hinf, I['f-mesa'], hp))
# 22 checklist
CK = ['Celular na horizontal, na altura dos olhos', 'Lente da câmera limpa', 'Janela na frente ou na diagonal, nunca atrás', 'Lapela no peito, a um palmo da boca', 'Celular em modo avião', 'Olhar para a lente, não para a tela', 'Roteiro aberto: um bloco por vez', 'Errou? Respire e repita a frase inteira']
s('claro', '<div class="cab" style="gap:12px"><p class="k">Antes de apertar o REC</p><h2 style="font-size:66px">O checklist da gravação</h2></div><div class="nofwd" data-chk style="display:flex;flex-direction:column;gap:26px"><div class="chk">%s</div><div class="barra2"><i></i></div><p class="pronta"></p></div>' % ''.join('<button><i>✓</i>%s</button>' % c for c in CK))
# 23 fluxo gravação
s('', '<div class="cab"><p class="k">Depois da gravação</p><h2>Você grava. <em>O resto é com a gente.</em></h2></div><div class="tl" style="--n:5"><div class="pt"><i></i><b>Equipe</b><h3>Roteiros no portal</h3><p>Os 12 roteiros, prontos para ler.</p></div><div class="pt"><i></i><b>Você</b><h3>Grava em casa</h3><p>Dica: vários roteiros na mesma sessão.</p></div><div class="pt"><i></i><b>Você</b><h3>Envia o arquivo</h3><p>Pelo portal, direto do celular.</p></div><div class="pt"><i></i><b>Equipe</b><h3>Edita tudo</h3><p>Vídeo, 3 shorts, carrossel e capa.</p></div><div class="pt"><i></i><b>Você</b><h3>Aprova</h3><p>Nada vai ao ar sem o seu OK.</p></div></div>')
# 24 decidir hoje
s('claro', '<div class="cab"><p class="k">Saindo daqui</p><h2>Para fechar <em>hoje</em></h2></div><div class="lst" style="gap:20px">'
  + ''.join('<div class="it"><span class="ok">%d</span><div><h3>%s</h3></div></div>' % (k + 1, t) for k, t in enumerate(['As cores do canal: IH! corporativa ou do Instagram?', 'A data da sua primeira gravação', 'Fotos do lugar onde vai gravar, no grupo', 'Depoimentos ou resultados de clientes, com permissão']))
  + '</div>')
# 25 feedback
s('cor centro', '<p class="k">Sua opinião</p><h2 style="font-size:84px">O que você está achando do Grupo Euforia até agora?</h2><div class="chips nofwd" data-notas>%s</div><p class="t" style="opacity:1;font-size:32px">De 0 a 10, quanto você indicaria a gente?</p><div class="notas nofwd" data-notas>%s</div>' % (''.join('<button>%s</button>' % c for c in ['Estou animada', 'Ficou claro', 'Gostei das capas', 'Gostei da estratégia', 'Quero ajustar algo']), ''.join('<button>%d</button>' % n for n in range(0, 11))))
# 26 obrigado
s('capa', '<div class="tx"><img src="%s" style="width:130px"><p class="k">Inteligência Humana × Grupo Euforia</p><h1>Obrigado,<br><em>Daniele.</em></h1><div class="barra"></div><p class="data">Próximo passo: a sua primeira gravação.</p></div><div class="ft" style="background-image:url(%s);background-position:center 18%%"></div>' % (I['simbolo-claro'], I['f-vestido']), False)

js += r'''
/* Daniele 24/11 */
function ativo(R){return R.closest('.s').classList.contains('on')}
document.querySelectorAll('[data-eco]').forEach(R=>{
 const N=[...R.querySelectorAll('.no')],P=[...R.querySelectorAll('.ecoprev')],I=R.querySelector('.info');
 const T=__NOS__;
 function at(k){N.forEach((n,j)=>n.classList.toggle('on',j===k));P.forEach((p,j)=>p.style.display=j===k?'flex':'none');I.innerHTML=T[k]}
 N.forEach((n,k)=>n.addEventListener('click',e=>{e.stopPropagation();at(k)}));at(0);
});
document.querySelectorAll('[data-conta]').forEach(R=>{
 const r=R.querySelector('input'),M=R.querySelector('.mesinfo'),C={};R.querySelectorAll('[data-c]').forEach(b=>C[b.dataset.c]=b);
 let an=null;
 function up(){const m=+r.value,p=Math.max(0,m-1);C.l.textContent=p*4;C.s.textContent=p*12;C.c.textContent=p*4;C.t.textContent=p*4;
  M.innerHTML=m===1?'Mês 1: <em>setup</em>. Identidade, 12 roteiros e relançamento do canal.':'Até o mês '+m+': <em>'+(p*4+p*12+p*4)+' peças</em> no ar, todas aprovadas por você.'}
 r.addEventListener('input',up);r.addEventListener('pointerdown',e=>e.stopPropagation());r.addEventListener('click',e=>e.stopPropagation());
 new MutationObserver(()=>{if(ativo(R)){clearInterval(an);r.value=1;up();an=setInterval(()=>{if(+r.value>=12)return clearInterval(an);r.value=+r.value+1;up()},260)}}).observe(R.closest('.s'),{attributes:true,attributeFilter:['class']});
 up();
});
document.querySelectorAll('[data-tab]').forEach(R=>{
 const B=[...R.querySelectorAll('.ops button')],P=[...R.querySelectorAll('[data-p]')];
 function at(k){B.forEach((b,j)=>b.classList.toggle('on',j===k));P.forEach((p,j)=>p.style.display=j===k?'flex':'none')}
 B.forEach((b,k)=>b.addEventListener('click',e=>{e.stopPropagation();at(k)}));at(0);
});
document.querySelectorAll('.fpg').forEach(F=>{
 const Q=[...F.querySelectorAll('.esc')],Rs=F.querySelector('.res');
 Q.forEach(q=>q.querySelectorAll('span').forEach(sp=>sp.addEventListener('click',e=>{e.stopPropagation();q.querySelectorAll('span').forEach(x=>x.classList.toggle('on',x===sp));if(Q.every(x=>x.querySelector('.on')))Rs.classList.add('vis')})));
});
document.querySelectorAll('[data-tv]').forEach(R=>{
 const L=[...R.querySelectorAll('.ly')],B=[...R.querySelectorAll('.tl2 button')],Ph=R.querySelector('.ph2'),I=R.querySelector('.tvinfo'),Pl=R.querySelector('.play2');
 const T=['<b>0:00 · Gancho.</b> Uma pergunta forte nos primeiros segundos segura quem chegou.','<b>0:20 · Você.</b> Nome e especialidade logo na entrada: a empresa sabe quem está falando.','<b>1:00 · Exemplos na tela.</b> Enquanto você fala, os pontos aparecem escritos.','<b>3:00 · Os cortes.</b> Cada trecho marcado vira um short de até 1 minuto.','<b>6:00 · Chamada.</b> O convite para o autodiagnóstico, no meio e no fim.'];
 const X=[0,10,20,50,80];let tm=null;
 function at(k){L.forEach((l,j)=>l.classList.toggle('on',j===k));B.forEach((b,j)=>b.classList.toggle('on',j===k));Ph.style.left=X[k]+'%%';I.innerHTML=T[k]}
 B.forEach((b,k)=>b.addEventListener('click',e=>{e.stopPropagation();clearInterval(tm);at(k)}));
 Pl.addEventListener('click',e=>{e.stopPropagation();clearInterval(tm);let k=0;at(0);tm=setInterval(()=>{k++;if(k>4)return clearInterval(tm);at(k)},2600)});
 at(0);
});
document.querySelectorAll('[data-pal]').forEach(R=>{
 const B=[...R.querySelectorAll('.ops button')],M=R.querySelector('.mock'),I=R.querySelector('.info'),S=[...R.querySelectorAll('[data-sw]')];
 const T={ih:'<b>Mais autoridade com empresas.</b> São as cores da IH!, as mesmas que a empresa vai ver na proposta. Quem decide a contratação reconhece a marca do vídeo ao contrato.',insta:'<b>Mais humanizada e próxima.</b> Conversa com quem já segue você no Instagram. Combina com o produto para pessoa física, na fase 2.'};
 function at(v){B.forEach(b=>b.classList.toggle('on',b.dataset.v===v));M.classList.toggle('insta',v==='insta');I.innerHTML=T[v];S.forEach(x=>x.style.display=x.dataset.sw===v?'flex':'none')}
 B.forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();at(b.dataset.v)}));at('ih');
});
document.querySelectorAll('[data-car]').forEach(R=>{
 const Tr=R.querySelector('.tr2'),D=[...R.querySelectorAll('.dots i')],C=R.querySelector('.cnt2'),V=R.querySelector('.vp');let k=0;const n=D.length;
 function at(j){k=Math.max(0,Math.min(n-1,j));Tr.style.transform='translateX('+(-428*k)+'px)';D.forEach((d,i)=>d.classList.toggle('on',i===k));C.textContent=(k+1)+'/'+n}
 R.querySelectorAll('.navc button').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();at(k+ +b.dataset.d)}));
 V.addEventListener('click',e=>{e.stopPropagation();const r=V.getBoundingClientRect();at(k+(e.clientX>r.left+r.width/2?1:-1))});
 R.addEventListener('touchstart',e=>e.stopPropagation(),{passive:true});R.addEventListener('touchend',e=>e.stopPropagation());
 at(0);
});
document.querySelectorAll('[data-oc]').forEach(R=>{
 const B=[...R.querySelectorAll('.ops button')],I=R.querySelector('.info'),Le=R.querySelector('.lente'),Fo=R.querySelector('.fonte'),Ft=R.querySelector('.ftx'),R1=R.querySelector('.r1'),R2=R.querySelector('.r2'),Br=R.querySelector('.brilho'),Al=R.querySelector('.alerta'),Vi=R.querySelector('.vista');
 const L=[640,300],Cm=[120,300];
 const M={frente:{p:[190,288],t:0,v:'VISTA DE CIMA',f:'janela',i:'<b>A janela bem na frente, atrás da câmera,</b> reflete direto na lente. É o reflexo que você já notou nos seus vídeos.'},
  diag:{p:[300,70],t:0,v:'VISTA DE CIMA',f:'janela',i:'<b>Com a janela na diagonal,</b> a luz continua no rosto, mas o reflexo vai para o lado, longe da câmera.'},
  alta:{p:[185,70],t:0,v:'VISTA DE LADO',f:'luz',i:'<b>Luz um pouco mais alta</b> que a cabeça: o reflexo desce e passa por baixo da câmera.'},
  incl:{p:[190,288],t:14,v:'VISTA DE LADO',f:'janela',i:'<b>Levante um pouco as hastes atrás das orelhas.</b> A lente inclina para baixo e, com poucos graus, o reflexo sai da direção da câmera.'}};
 function at(k){const o=M[k];B.forEach(b=>b.classList.toggle('on',b.dataset.o===k));I.innerHTML=o.i;Vi.textContent=o.v;Ft.textContent=o.f;
  Le.setAttribute('transform','translate('+L[0]+' '+L[1]+') rotate('+(-o.t)+')');Fo.setAttribute('transform','translate('+o.p[0]+' '+o.p[1]+')');
  const a=o.t*Math.PI/180,n=[-Math.cos(a),-Math.sin(a)];let d=[L[0]-o.p[0],L[1]-o.p[1]];const m=Math.hypot(d[0],d[1]);d=[d[0]/m,d[1]/m];
  const dn=d[0]*n[0]+d[1]*n[1],r=[d[0]-2*dn*n[0],d[1]-2*dn*n[1]];
  const tt=(Cm[0]-L[0])/r[0],y=L[1]+r[1]*tt,hit=Math.abs(y-Cm[1])<45;
  const e=[L[0]+r[0]*560,L[1]+r[1]*560];
  [['x1',o.p[0]],['y1',o.p[1]],['x2',L[0]],['y2',L[1]]].forEach(([q,v])=>R1.setAttribute(q,v));
  [['x1',L[0]],['y1',L[1]],['x2',e[0]],['y2',e[1]]].forEach(([q,v])=>R2.setAttribute(q,v));
  R2.setAttribute('stroke',hit?'#D64545':'#2E9E5B');Br.style.opacity=hit?.95:0;Al.classList.toggle('x',hit);Al.textContent=hit?'reflexo na lente':'sem reflexo'}
 B.forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();at(b.dataset.o)}));at('frente');
});
document.querySelectorAll('[data-enq]').forEach(R=>{
 const B=[...R.querySelectorAll('.ops button')],Im=R.querySelector('.im'),I=R.querySelector('.info'),O=R.querySelector('.olho');
 const M={ok:{s:'55% auto',p:'50% 10%',t:'none',i:'<b>Do peito para cima, olhos na linha de cima.</b> Sobra um pouco de espaço acima da cabeça. É o enquadramento de quem fala com autoridade.'},
  baixa:{s:'55% auto',p:'50% 22%',t:'perspective(900px) rotateX(-14deg) scale(1.18) translateY(40px)',i:'<b>De baixo para cima</b> a câmera mostra queixo e teto, e o olhar fica por cima de quem assiste. Coloque o celular na altura dos olhos.'},
  longe:{s:'28% auto',p:'50% 78%',t:'none',i:'<b>Longe demais</b> você fica pequena e a sala aparece mais que você. No celular, quase não dá para ver a sua expressão.'},
  perto:{s:'175% auto',p:'52% 13%',t:'none',i:'<b>Colado demais</b> corta a cabeça e sufoca a imagem. Afaste o celular até aparecerem os ombros e um pouco do peito.'}};
 function at(k){const o=M[k];B.forEach(b=>b.classList.toggle('on',b.dataset.e===k));Im.style.backgroundSize=o.s;Im.style.backgroundPosition=o.p;Im.style.transform=o.t;I.innerHTML=o.i;O.style.opacity=k==='ok'?1:.35}
 B.forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();at(b.dataset.e)}));at('ok');
});
document.querySelectorAll('[data-lap]').forEach(R=>{
 const Pn=[...R.querySelectorAll('.pin')],I=R.querySelector('.info'),fio=R.querySelector('.fio'),rg=R.querySelector('.regua');
 const T=['<b>✓ No peito, a um palmo da boca.</b> Centralizado, preso na roupa, com o fio passando por dentro da blusa.','<b>✕ Na gola, colado no pescoço.</b> A voz sai abafada e o microfone roça na pele, no colar e no cabelo.','<b>✕ Na barriga ou no bolso.</b> Longe da boca, a voz fica fraca e o som da sala entra junto.'];
 function pin(k){Pn.forEach((p,j)=>p.classList.toggle('on',j===k));I.innerHTML=T[k];fio.setAttribute('opacity',k===0?.9:0);rg.setAttribute('opacity',k===0?1:0)}
 Pn.forEach((p,k)=>p.addEventListener('click',e=>{e.stopPropagation();pin(k)}));pin(0);
});
document.querySelectorAll('[data-hot]').forEach(R=>{
 const H=[...R.querySelectorAll('.hp')],P=[...R.querySelectorAll('.hotinfo')];
 function at(k){H.forEach((h,j)=>h.classList.toggle('on',j===k));P.forEach((p,j)=>p.style.display=j===k?'block':'none')}
 H.forEach((h,k)=>h.addEventListener('click',e=>{e.stopPropagation();at(k)}));at(0);
});
document.querySelectorAll('[data-chk]').forEach(R=>{
 const B=[...R.querySelectorAll('.chk button')],Br=R.querySelector('.barra2 i'),P=R.querySelector('.pronta');
 function up(){const n=B.filter(b=>b.classList.contains('on')).length;Br.style.width=(n/B.length*100)+'%%';P.textContent=n===B.length?'Pronta para gravar! 🎬':n+' de '+B.length}
 B.forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();b.classList.toggle('on');up()}));up();
});
document.querySelectorAll('[data-notas]').forEach(R=>{
 const B=[...R.querySelectorAll('button')],multi=R.classList.contains('chips');B.forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();if(multi)b.classList.toggle('on');else B.forEach(x=>x.classList.toggle('on',x===b))}));
});
'''.replace('%%','%').replace('__NOS__','[' + ','.join(repr(n[3]) for n in NOS) + ']')

html = '''<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>Daniele Malafronte · Audiovisual + Estratégia · 24/11</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800;900&family=Nunito+Sans:opsz,wght@6..12,400;6..12,600;6..12,700;6..12,800&display=swap" rel="stylesheet">
<style>''' + css + '''</style></head>
<body><div id="palco">''' + ''.join(SL) + '''</div><div id="bar"></div>
<div id="nav"><button id="prev" aria-label="Anterior">‹</button><button id="next" aria-label="Próximo">›</button><button id="fs" aria-label="Tela cheia">⛶</button></div>
<script>''' + js + '''</script></body></html>'''
open(D + '/deck.html', 'w').write(html)
print(len(html) // 1024, 'KB', len(SL), 'slides')

