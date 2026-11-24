import os
D=os.path.dirname(os.path.abspath(__file__))
PAL={
 'ih':dict(bg='radial-gradient(ellipse at 70% 40%,#1E2A72 0%,#111945 45%,#0A0F2E 100%)',fg='#FFFFFF',ac='#FF7700',ac2='#FF6600',sub='#E9EBF3',card='#E9EBF3',cardfg='#111945',cardtx='#2A3366',prog='#CBD0E3',sym='simbolo-claro.png',symc='simbolo.png',pilltx='#fff'),
 'insta':dict(bg='#F3E9DD',fg='#3B2A20',ac='#FF7700',ac2='#E86A00',sub='#6B5546',card='#FFF8F0',cardfg='#3B2A20',cardtx='#5C4637',prog='#E6D5C3',sym='simbolo.png',symc='simbolo.png',pilltx='#fff'),
}
HEAD='''<html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800;900&family=Nunito+Sans:opsz,wght@6..12,400;6..12,600;6..12,700&display=block" rel="stylesheet"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{position:relative;overflow:hidden;background:%(bg)s;color:%(fg)s;font-family:'Nunito Sans',sans-serif;-webkit-font-smoothing:antialiased}
.lar{color:%(ac)s}.pill{display:inline-block;background:%(ac)s;color:%(pilltx)s;font-family:Nunito;font-weight:900;border-radius:999px}
h1,h2{font-family:Nunito;font-weight:900}
%%s</style></head><body>%%s</body></html>'''
def page(p,css,body):
    h=HEAD
    for k,v in PAL[p].items(): h=h.replace('%('+k+')s',v)
    return h.replace('%%s','@@',1).replace('%%s','##',1).replace('@@',css).replace('##',body)
OUT={}
FACE={'f-blazer.jpg':('rec-f-blazer.png',522,275,0.85),'f-vestido.jpg':('rec-f-vestido.png',357,288,0.9),'f-mesa.jpg':('rec-f-mesa.png',659,412,0.98),'f-laranja.jpg':('rec-f-laranja.png',508,316,1.05)}
def recorte(foto,cx,topo,W,extra=1.0):
    f,fx,ft,sc=FACE[foto];sc*=extra
    w=1100*sc;l=cx-fx*sc;t=topo-ft*sc
    return '<img class="rc" src="%s" style="position:absolute;left:%dpx;top:%dpx;width:%dpx">'%(f,l,t,w)
def thumb(p,nome,foto,pos,tag,titulo,zoom='cover'):
    c=PAL[p]
    css=r"""body{width:1280px;height:720px}
.glow{position:absolute;left:640px;top:-120px;width:760px;height:760px;border-radius:50%%;background:radial-gradient(circle,%s 0,rgba(255,119,0,.35) 38%%,rgba(255,119,0,0) 68%%)}
.sym{position:absolute;right:-120px;bottom:-160px;width:620px;opacity:.10}
.rc{filter:drop-shadow(0 0 2px rgba(255,255,255,.9)) drop-shadow(0 20px 40px rgba(0,0,0,.45))}
.txt{position:absolute;left:58px;top:0;height:720px;width:640px;display:flex;flex-direction:column;justify-content:center;z-index:3}
.tag{align-self:flex-start;font-size:28px;padding:10px 26px;letter-spacing:1px}
h1{font-size:104px;line-height:.96;margin-top:22px;text-transform:uppercase;text-shadow:0 6px 24px rgba(0,0,0,.35)}
h1 .bx{display:inline-block;background:%s;color:#fff;padding:0 16px;border-radius:12px;margin:6px 0;text-shadow:none}
.barra{position:absolute;left:0;bottom:0;width:1280px;height:14px;background:%s}
.logo{position:absolute;left:58px;bottom:44px;height:56px;z-index:3}"""%('rgba(255,140,40,.75)',c['ac'],c['ac'])
    titulo=titulo.replace('<span class="lar">','<span class="bx">')
    OUT[nome]=(page(p,css,'<div class="glow"></div><img class="sym" src="%s">%s<div class="txt"><div class="pill tag">%s</div><h1>%s</h1></div><img class="logo" src="%s"><div class="barra"></div>'%(c['sym'],recorte(foto,960,46,1280),tag,titulo,c['sym'])),1280,720)
def banner(p,nome):
    c=PAL[p]
    css=r"""body{width:2560px;height:1440px}
.sym{position:absolute;left:-260px;top:140px;width:1100px;opacity:.12}
.sym2{position:absolute;right:-200px;top:-180px;width:900px;opacity:.08}
.glow{position:absolute;left:1560px;top:330px;width:760px;height:760px;border-radius:50%%;background:radial-gradient(circle,rgba(255,140,40,.8) 0,rgba(255,119,0,.3) 40%%,rgba(255,119,0,0) 68%%)}
.rc{filter:drop-shadow(0 0 2px rgba(255,255,255,.9)) drop-shadow(0 20px 40px rgba(0,0,0,.45))}
.left{position:absolute;left:527px;top:508px;height:423px;width:1100px;display:flex;flex-direction:column;justify-content:center;z-index:3}
.k{font-size:26px;white-space:nowrap;letter-spacing:.22em;font-weight:800;color:%s}
.name{font-family:Nunito;font-weight:900;white-space:nowrap;font-size:98px;line-height:.95;margin-top:16px;text-transform:uppercase}
.q{font-size:36px;margin-top:24px;font-weight:700;color:%s}.q b{color:%s;font-weight:900}
.bar{width:180px;height:10px;border-radius:8px;background:%s;margin-top:26px}
.faixa{position:absolute;left:0;right:0;top:931px;height:509px;background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.0))}"""%(c['sub'],c['sub'],c['ac'],c['ac'])
    OUT[nome]=(page(p,css,'<img class="sym" src="%s"><img class="sym2" src="%s"><div class="glow"></div>%s<div class="left"><div class="k">DANIELE MALAFRONTE · DESENVOLVIMENTO DE LIDERANÇA</div><div class="name">Inteligência <span class="lar">Humana</span></div><div class="q">Liderar é cuidar de <b>gente</b>, não só de resultado.</div><div class="bar"></div></div>'%(c['sym'],c['sym'],'<div style="position:absolute;left:0;top:0;width:2560px;height:931px;overflow:hidden;-webkit-mask-image:linear-gradient(180deg,#000 92%,transparent 100%)">'+recorte('f-laranja.jpg',1930,500,2560,1.25)+'</div>')),2560,1440)
def carcapa(p,nome,foto,pos,tag,titulo):
    css='''body{width:1080px;height:1350px}
.ph{position:absolute;left:0;right:0;top:0;height:880px;background:url(%s) %s/cover;-webkit-mask-image:linear-gradient(180deg,#000 60%%,transparent 100%%)}
.txt{position:absolute;left:72px;right:72px;bottom:150px}.tag{font-size:28px;padding:10px 28px}
h1{font-size:100px;line-height:1.02;margin-top:26px}
.f{position:absolute;left:72px;right:72px;bottom:60px;display:flex;justify-content:space-between;font-size:28px;font-weight:700;color:%s}.f b{color:%s}'''%(foto,pos,PAL[p]['sub'],PAL[p]['ac'])
    OUT[nome]=(page(p,css,'<div class="ph"></div><div class="txt"><div class="pill tag">%s</div><h1>%s</h1></div><div class="f"><span>@danielemalafronte_</span><b>arraste →</b></div>'%(tag,titulo)),1080,1350)
def carint(p,nome,n,tot,h,tx):
    c=PAL[p]
    css='''body{width:1080px;height:1350px;background:%s;color:%s}
.top{position:absolute;left:80px;right:80px;top:80px;display:flex;align-items:center;justify-content:space-between}
.n{font-family:Nunito;font-weight:900;font-size:180px;line-height:.8;color:%s}.sym{height:110px}
h2{position:absolute;left:80px;right:80px;top:330px;font-size:78px;line-height:1.05}
p{position:absolute;left:80px;right:80px;top:640px;font-size:44px;line-height:1.45;color:%s}p b{color:%s}
.prog{position:absolute;left:80px;right:80px;bottom:150px;height:10px;border-radius:10px;background:%s}.prog i{display:block;width:%d%%;height:100%%;border-radius:10px;background:%s}
.f{position:absolute;left:80px;right:80px;bottom:70px;display:flex;justify-content:space-between;font-size:26px;font-weight:700}'''%(c['card'],c['cardfg'],c['ac'],c['cardtx'],c['cardfg'],c['prog'],int(n/tot*100),c['ac'])
    OUT[nome]=(page(p,css,'<div class="top"><div class="n">%02d</div><img class="sym" src="%s"></div><h2>%s</h2><p>%s</p><div class="prog"><i></i></div><div class="f"><span>Daniele Malafronte · Inteligência Humana</span><span>%d/%d</span></div>'%(n,c['symc'],h,tx,n+1,tot+2)),1080,1350)
def carcta(p,nome,tot):
    css='''body{width:1080px;height:1350px;display:flex;flex-direction:column;justify-content:center;padding:0 90px;gap:40px}
.sym{width:200px}h2{font-size:96px;line-height:1.02}p{font-size:44px;line-height:1.4;color:%s}
.bt{align-self:flex-start;font-size:40px;padding:22px 44px}.f{position:absolute;left:90px;right:90px;bottom:70px;display:flex;justify-content:space-between;font-size:26px;font-weight:700;color:%s}'''%(PAL[p]['sub'],PAL[p]['sub'])
    OUT[nome]=(page(p,css,'<img class="sym" src="%s"><h2>A sua empresa tem <span class="lar">chefes</span> ou <span class="lar">líderes</span>?</h2><p>Faça o autodiagnóstico de liderança e descubra em poucos minutos.</p><div class="pill bt">Link no perfil</div><div class="f"><span>@danielemalafronte_</span><span>%d/%d</span></div>'%(PAL[p]['sym'],tot,tot)),1080,1350)

# 4 thumbs modelo A (paleta IH!)
T=[('thumb-01','f-blazer.jpg','50% 22%','LIDERANÇA','Você é <span class="lar">chefe</span> ou líder?'),
   ('thumb-04','f-vestido.jpg','45% 18%','COMUNICAÇÃO','Feedback <span class="lar">sem</span> desmotivar'),
   ('thumb-07','f-mesa.jpg','50% 14%','GESTÃO','Era colega. <span class="lar">Virou chefe.</span>'),
   ('thumb-10','f-laranja.jpg','50% 16%','O LÍDER POR DENTRO','O líder <span class="lar">bombeiro</span>')]
for n,f,pos,tag,t in T:
    thumb('ih',n,f,pos,tag,t)
thumb('insta','paleta-insta-thumb','f-blazer.jpg','50% 22%','LIDERANÇA','Você é <span class="lar">chefe</span> ou líder?')
banner('ih','paleta-ih-banner');banner('insta','paleta-insta-banner')
carcapa('insta','paleta-insta-carrossel','f-mesa.jpg','50% 18%','LIDERANÇA','5 sinais de que você é <span class="lar">chefe</span>, não líder')
# carrossel completo (IH!)
CI=[('Você dá ordens, mas não explica o porquê','Quando a equipe só executa, ela para de pensar. <b>Líder compartilha o contexto</b> para que as pessoas decidam bem sem depender dele o tempo todo.'),
 ('Você cobra o erro, mas não ensina o caminho','Chefe procura o culpado. <b>Líder pergunta o que faltou</b> e ajuda a equipe a não repetir.'),
 ('Tudo para quando você sai de férias','Se só você resolve, a equipe não cresceu. <b>Líder forma gente capaz de decidir</b> na ausência dele.'),
 ('Você só aparece quando algo dá errado','Feedback não é só correção. <b>Reconhecer o que deu certo</b> mostra o caminho que você quer ver repetido.'),
 ('Você manda, mas não escuta','Quem está na ponta vê o que você não vê. <b>Líder pergunta antes de decidir.</b>')]
carcapa('ih','car-01','f-mesa.jpg','50% 18%','LIDERANÇA','5 sinais de que você é <span class="lar">chefe</span>, não líder')
for k,(h,tx) in enumerate(CI): carint('ih','car-%02d'%(k+2),k+1,len(CI),h,tx)
carcta('ih','car-07',7)
import json
for n,(h,w,hh) in OUT.items(): open(os.path.join(D,n+'.html'),'w').write(h)
json.dump({n:[w,hh] for n,(h,w,hh) in OUT.items()},open(os.path.join(D,'lista.json'),'w'))
