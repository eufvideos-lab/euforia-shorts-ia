# Grafismos animados do formato Padrão: paleta do cliente, textos-chave grandes em caps com sombra e pop suave,
# cartões de tela cheia, mapa de cidades, lowers minimalistas centralizados e tela final.
import numpy as np, subprocess, math, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
OUT='gfx'
FPS=30; W,H=1920,1080
F=os.path.join(os.path.dirname(os.path.abspath(__file__)),'fontes')+'/'
def font(w,s): return ImageFont.truetype(F+{'b':'InterDisplay-Bold.otf','eb':'InterDisplay-ExtraBold.otf','blk':'InterDisplay-Black.otf','sb':'InterDisplay-SemiBold.otf'}[w],s)
# paleta do cliente (padrão = Grupo Euforia: preto, branco, laranja e degradê branco→pêssego→laranja)
# caixa = fundo dos lowers; brilho = luz do fundo dos cartões e da tela final; degrade = destaque em degradê (Euforia)
# ou em cor sólida (cliente sem degradê na marca).
P={'bg':(5,5,5),'acc':(255,101,24),'acc2':(254,176,137),'txt':(255,255,255),'caixa':None,'brilho':None,'degrade':True}
def hexrgb(h): h=h.lstrip('#'); return tuple(int(h[i:i+2],16) for i in (0,2,4))
def configurar(out,paleta=None):
    """paleta: {'fundo':'#050505','destaque':'#FF6518','destaque2':'#FEB089','texto':'#FFFFFF',
    'caixa':'#FF6518','brilho':'#FF6518','degrade':True}"""
    global OUT
    OUT=out; os.makedirs(OUT,exist_ok=True)
    paleta=paleta or {}
    for k,c in (('fundo','bg'),('destaque','acc'),('destaque2','acc2'),('texto','txt'),('caixa','caixa'),('brilho','brilho')):
        if paleta.get(k): P[c]=hexrgb(paleta[k])
    if 'degrade' in paleta: P['degrade']=paleta['degrade'] not in (False,'nao','não','0',0)
    P['caixa']=P['caixa'] or P['acc']; P['brilho']=P['brilho'] or P['acc']
def ease_out(x): x=min(max(x,0),1); return 1-(1-x)**3
def ease_back(x): x=min(max(x,0),1); c1=1.7; c3=c1+1; return 1+c3*(x-1)**3+c1*(x-1)**2
def ease_in(x): x=min(max(x,0),1); return x**3
def grad(w,h,warm=False):
    if not P['degrade']: return Image.new('RGB',(max(w,1),h),P['acc'])
    x=np.linspace(0.5 if warm else 0,1,max(w,1))[None,:,None]
    a=np.array(P['txt'])[None,None,:]; b=np.array(P['acc2'])[None,None,:]; c=np.array(P['acc'])[None,None,:]
    g=np.where(x<0.5,a+(b-a)*(x/0.5),b+(c-b)*((x-0.5)/0.5)); return Image.fromarray(np.repeat(g,h,0).astype(np.uint8))
yy,xx=np.mgrid[0:H,0:W]
rng=np.random.default_rng(1); GRAIN=[(rng.standard_normal((H//2,W//2))*5).astype(np.int16) for _ in range(4)]
def bg(t):
    cx=W*(0.5+0.18*math.sin(t*0.5)); cy=H*(0.55+0.1*math.cos(t*0.4))
    d=np.sqrt((xx-cx)**2+(yy-cy)**2)/(W*0.85); glow=np.clip(1-d,0,1)**2.2*0.38
    base=np.zeros((H,W,3),np.float32)+np.array(P['bg'],np.float32)+glow[...,None]*np.array(P['brilho'],np.float32)
    g=np.repeat(np.repeat(GRAIN[int(t*FPS)%4],2,0),2,1)[...,None]
    return np.clip(base+g,0,255).astype(np.uint8)
class Writer:
    def __init__(s,path,w,h,alpha):
        s.alpha=alpha
        args=['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgba' if alpha else 'rgb24','-s',f'{w}x{h}','-r',str(FPS),'-i','-']
        args+=(['-c:v','qtrle'] if alpha else ['-c:v','libx264','-preset','fast','-crf','16','-pix_fmt','yuv420p'])+[path]
        s.p=subprocess.Popen(args,stdin=subprocess.PIPE)
    def put(s,im): s.p.stdin.write(np.asarray(im.convert('RGBA' if s.alpha else 'RGB')).tobytes())
    def close(s): s.p.stdin.close(); s.p.wait()
def parse(text):
    # *palavra* = destaque na cor do cliente
    out=[]; hl=False
    for i,part in enumerate(text.split('*')):
        if part: out.append((part,i%2==1))
    return out
def text_layer(line,f,pad=40,hl_only=True):
    line=line.replace(' ','  ') if f.size>=80 else line
    # linha com trechos destacados -> RGBA com sombra suave
    segs=parse(line); tw=int(sum(f.getlength(t) for t,_ in segs)); bb=f.getbbox('ÁgQ')
    th=bb[3]+10; w=tw+2*pad; h=th+2*pad
    mask=Image.new('L',(w,h),0); d=ImageDraw.Draw(mask); x=pad; fills=[]
    for t,hl in segs:
        m=Image.new('L',(w,h),0); ImageDraw.Draw(m).text((x,pad),t,font=f,fill=255)
        fills.append((m,hl,x,f.getlength(t))); d.text((x,pad),t,font=f,fill=255); x+=f.getlength(t)
    im=Image.new('RGBA',(w,h),(0,0,0,0))
    sh=mask.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(16)).point(lambda v:min(255,int(v*1.3)))
    im.paste((0,0,0,255),(4,8),sh)
    hard=mask.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(2)).point(lambda v:int(v*0.75)); im.paste((0,0,0,255),(2,4),hard)
    for m,hl,x0,lw in fills:
        im.paste(grad(int(lw)+1,h,hl_only) if hl else Image.new('RGB',(int(lw)+1,h),P['txt']),(int(x0),0),m.crop((int(x0),0,int(x0)+int(lw)+1,h)))
    return im
def keyword(name,text,dur):
    # texto-chave: caps grande, sombra, surge com pop e sai encolhendo
    f=font('blk',92); lines=[l.upper() for l in text.split('|')]
    layers=[text_layer(l,f) for l in lines]
    BH=420; wr=Writer(f'{OUT}/{name}.mov',W,BH,True); n=int(round(dur*FPS))
    for k in range(n):
        t=k/FPS; fr=Image.new('RGBA',(W,BH),(0,0,0,0))
        for i,L in enumerate(layers):
            p=(t-0.07*i)/0.38; a_in=ease_out(p/0.6); sc=0.55+0.45*ease_back(p) if p<1 else 1.0
            q=(t-(dur-0.28))/0.28; a=a_in*(1-ease_in(q)); sc*=1-0.12*ease_in(q)
            if a<=0.01: continue
            lw,lh=L.size; im=L.resize((max(1,int(lw*sc)),max(1,int(lh*sc))),Image.BICUBIC)
            if a<1: im.putalpha(im.getchannel('A').point(lambda v:int(v*a)))
            cy=BH-60-(len(layers)-i-0.5)*112+(1-ease_out(p))*30
            fr.alpha_composite(im,(int(W/2-im.width/2),int(cy-im.height/2)))
        wr.put(fr)
    wr.close(); return BH
def card(name,lines,dur,sub=None,big=False):
    # tela cheia na cor do cliente: fundo entra rápido, linhas surgem com pop
    f=font('blk',150 if big else 104); fs=font('sb',46)
    layers=[text_layer(l if big else l,f) for l in lines]
    lh=int((150 if big else 104)*1.18); n=int(round(dur*FPS)); wr=Writer(f'{OUT}/{name}.mp4',W,H,False)
    tot=lh*len(layers)+(70 if sub else 0); y0=H/2-tot/2
    for k in range(n):
        t=k/FPS; fr=Image.fromarray(bg(t)).convert('RGBA')
        if sub:
            a=ease_out(t/0.35); s=text_layer(sub,fs,20); s.putalpha(s.getchannel('A').point(lambda v:int(v*a)))
            fr.alpha_composite(s,(int(W/2-s.width/2),int(y0-40-(1-a)*20)))
        for i,L in enumerate(layers):
            p=(t-0.12-0.12*i)/0.42
            if p<=0: continue
            a=ease_out(p/0.6); sc=0.7+0.3*ease_back(p) if p<1 else 1.0
            lw,lh2=L.size; im=L.resize((max(1,int(lw*sc)),max(1,int(lh2*sc))),Image.BICUBIC)
            if a<1: im.putalpha(im.getchannel('A').point(lambda v:int(v*a)))
            cy=y0+(70 if sub else 0)+lh*(i+0.5)
            fr.alpha_composite(im,(int(W/2-im.width/2),int(cy-im.height/2)))
        # barra de destaque cresce embaixo
        bw=ease_out((t-0.35)/0.5)*170
        if bw>1:
            d=ImageDraw.Draw(fr); yb=y0+(70 if sub else 0)+lh*len(layers)+26
            d.rounded_rectangle((W/2-bw,yb,W/2+bw,yb+9),radius=4,fill=P['acc'])
        wr.put(fr)
    wr.close()
def route(name,cities,times,dur,title):
    # imagem única com todas as cidades; um anel na cor de destaque vai circulando a cidade falada
    f=font('blk',64); ft=font('blk',58); n=int(round(dur*FPS)); wr=Writer(f'{OUT}/{name}.mp4',W,H,False)
    xs=[250+i*(1420/(len(cities)-1)) for i in range(len(cities))]; ys=[660 if i%2==0 else 540 for i in range(len(cities))]
    pts=list(zip(xs,ys))
    base=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(base)
    for i in range(len(pts)-1):
        (x1,y1),(x2,y2)=pts[i],pts[i+1]
        for s in np.arange(0,1,0.04): d.ellipse((x1+(x2-x1)*s-3,y1+(y2-y1)*s-3,x1+(x2-x1)*s+3,y1+(y2-y1)*s+3),fill=(255,255,255,110))
    labels=[text_layer(c.upper(),f,24) for c in cities]; tl=text_layer(title,ft,20)
    for k in range(n):
        t=k/FPS; fr=Image.fromarray(bg(t)).convert('RGBA'); a=ease_out(t/0.3)
        lay=base.copy(); dd=ImageDraw.Draw(lay)
        cur=max([i for i,tc in enumerate(times) if tc<=t+0.001] or [-1])
        # trilha na cor de destaque até a cidade atual
        for i in range(max(cur,0)):
            (x1,y1),(x2,y2)=pts[i],pts[i+1]; pr=1.0 if i<cur-1 else ease_out((t-times[cur])/0.35)
            dd.line((x1,y1,x1+(x2-x1)*pr,y1+(y2-y1)*pr),fill=P['acc'],width=7)
        for i,(x,y) in enumerate(pts):
            on=i<=cur; r=14
            dd.ellipse((x-r,y-r,x+r,y+r),fill=P['acc'] if on else (255,255,255,230))
            L=labels[i]; ly=y+34 if i%2==0 else y-34-L.height+40
            lay.alpha_composite(L,(int(x-L.width/2),int(ly-20 if i%2==0 else ly-40)))
        if cur>=0:
            p=ease_back((t-times[cur])/0.4); x,y=pts[cur]; L=labels[cur]
            ly=(y+34-20) if cur%2==0 else (y-34-L.height)
            cx,cy=x,ly+L.height/2; rx=(L.width/2+10)*p; ry=(L.height/2+6)*p
            if rx>2: dd.ellipse((cx-rx,cy-ry,cx+rx,cy+ry),outline=P['acc'],width=8)
        lay.alpha_composite(tl,(int(W/2-tl.width/2),170))
        if a<1: lay.putalpha(lay.getchannel('A').point(lambda v:int(v*a)))
        fr.alpha_composite(lay); wr.put(fr)
    wr.close()
def endscreen(name,dur):
    n=int(round(dur*FPS)); wr=Writer(f'{OUT}/{name}.mp4',W,H,False)
    t1=text_layer('ASSISTA TAMBÉM:',font('blk',60),20); t2=text_layer('INSCREVA-SE JÁ',font('blk',54),20); t3=text_layer('NO *CANAL!*',font('blk',54),20)
    for k in range(n):
        t=k/FPS; fr=Image.fromarray(bg(t)).convert('RGBA'); a=ease_out(t/0.5)
        lay=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(lay)
        lay.alpha_composite(t1,(180,200))
        d.rounded_rectangle((200,320,1000,770),18,outline=P['acc'],width=5)
        d.ellipse((1260,300,1640,680),outline=P['txt'],width=6)
        lay.alpha_composite(t2,(int(1450-t2.width/2),700)); lay.alpha_composite(t3,(int(1450-t3.width/2),766))
        lay.putalpha(lay.getchannel('A').point(lambda v:int(v*a))); fr.alpha_composite(lay); wr.put(fr)
    wr.close()
def lower(name,text,dur,icon=None):
    # lower minimalista centralizado: retângulo na cor (ou degradê) da marca abre do centro, texto branco sobe; sai ao contrário
    f=font('blk',40); n=int(round(dur*FPS)); BW,BH=W,240
    tw=int(f.getlength(text)); pad=34; ic=56 if icon else 0
    bw=tw+2*pad+ic; bh=74; x0=(W-bw)//2; y0=BH-60-bh
    g=np.linspace(0,1,bw)[None,:,None]
    a=np.array(P['caixa'],np.float32); b2=np.array(P['acc2'],np.float32)*0.55+a*0.45 if P['degrade'] else a
    box=Image.fromarray(np.repeat(a+(b2-a)*g,bh,0).astype(np.uint8)).convert('RGBA')
    m=Image.new('L',(bw,bh),0); ImageDraw.Draw(m).rounded_rectangle((0,0,bw-1,bh-1),radius=16,fill=255); box.putalpha(m)
    txt=Image.new('RGBA',(bw,bh),(0,0,0,0)); d=ImageDraw.Draw(txt)
    if icon=='play':
        cx,cy=pad+16,bh/2; d.rounded_rectangle((cx-18,cy-13,cx+18,cy+13),radius=6,fill=P['txt']); d.polygon([(cx-5,cy-7),(cx-5,cy+7),(cx+8,cy)],fill=P['caixa'])
    if icon=='heart':
        cx,cy=pad+16,bh/2+1; d.ellipse((cx-15,cy-12,cx+1,cy+3),fill=P['txt']); d.ellipse((cx-1,cy-12,cx+15,cy+3),fill=P['txt']); d.polygon([(cx-15,cy-3),(cx+15,cy-3),(cx,cy+14)],fill=P['txt'])
    d.text((pad+ic,bh/2),text,font=f,fill=P['txt'],anchor='lm')
    sh=Image.new('RGBA',(bw+60,bh+60),(0,0,0,0)); sm=Image.new('L',(bw+60,bh+60),0); ImageDraw.Draw(sm).rounded_rectangle((30,36,30+bw,36+bh),radius=16,fill=150); sh.putalpha(sm.filter(ImageFilter.GaussianBlur(14)))
    wr=Writer(f'{OUT}/{name}.mov',BW,BH,True)
    for k in range(n):
        t=k/FPS; fr=Image.new('RGBA',(BW,BH),(0,0,0,0))
        pin=ease_out(t/0.45); pout=ease_in((t-(dur-0.4))/0.4); p=pin*(1-pout)
        cw=int(bw*p)
        if cw>2:
            s2=sh.copy(); s2.putalpha(s2.getchannel('A').point(lambda v:int(v*p))); fr.alpha_composite(s2,(x0-30,y0-30))
            l=(bw-cw)//2; fr.alpha_composite(box.crop((l,0,l+cw,bh)),(x0+l,y0))
            ta=ease_out((t-0.2)/0.35)*(1-pout)
            if ta>0.01:
                tt=txt.crop((l,0,l+cw,bh)); tt.putalpha(tt.getchannel('A').point(lambda v:int(v*ta)))
                fr.alpha_composite(tt,(x0+l,y0+int((1-ease_out((t-0.2)/0.35))*14)))
        wr.put(fr)
    wr.close()
# ---- Modelo Nova Acrópole: cartão de citação (aspas, foto redonda do autor, nome) e frase-chave, no manual da NA ----
NA_FUNDO=(255,255,255); NA_TEXTO=(31,41,55); NA_VERDE=(7,99,88); NA_VERDE2=(42,151,139)
def serif(w,s): return ImageFont.truetype(F+{'i':'LiberationSerif-Italic.ttf','b':'LiberationSerif-Bold.ttf'}[w],s)
def _quebrar(palavras,f,larg):
    linhas=[[]]
    for i,w in enumerate(palavras):
        teste=' '.join(palavras[j] for j in linhas[-1]+[i])
        if linhas[-1] and f.getlength(teste)>larg: linhas.append([])
        linhas[-1].append(i)
    return linhas
def _foto_redonda(arq,d):
    im=Image.open(arq).convert('RGB'); s=min(im.size)
    # recorte quadrado puxado para cima (rosto costuma estar no terço de cima)
    x=(im.width-s)//2; y=max(0,min(im.height-s,int(im.height*0.12) if im.height>im.width else 0))
    im=im.crop((x,y,x+s,y+s)).resize((d,d),Image.LANCZOS)
    m=Image.new('L',(d,d),0); ImageDraw.Draw(m).ellipse((0,0,d-1,d-1),fill=255)
    out=Image.new('RGBA',(d+24,d+24),(0,0,0,0)); ImageDraw.Draw(out).ellipse((0,0,d+23,d+23),fill=NA_VERDE)
    out.paste(im,(12,12),m); return out
def _logo_na(larg):
    """Logo da NA (tirado da marca d'água) em verde, para o topo dos cartões."""
    m=Image.open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'modelos','nova-acropole','marca.png'))
    a=m.getchannel('A').crop((1601,867,1850,1018)); a=a.point(lambda v:min(255,int(v*1.6)))
    lg=Image.new('RGBA',a.size,NA_VERDE+(255,)); lg.putalpha(a)
    return lg.resize((larg,int(a.height*larg/a.width)),Image.LANCZOS)
def _fundo_na():
    """Branco com um brilho verde bem suave embaixo, como papel."""
    g=np.clip((yy/H-0.35)/0.65,0,1)[...,None]**1.6
    base=np.array(NA_FUNDO,np.float32)*(1-0.10*g)+np.array((225,240,236),np.float32)*0.10*g
    return Image.fromarray(base.astype(np.uint8)).convert('RGBA')
def citacao(name,texto,dur,tempos,autor=None,foto=None,destaque=None):
    """Cartão de tela cheia no manual da NA: as palavras surgem acompanhando a fala (tempos = início de cada palavra,
    em s a partir do começo do cartão). Com autor: aspas verdes, texto em serifa itálica e '— NOME'; com foto: foto
    redonda do autor à esquerda. Sem autor: frase-chave centralizada em Inter, com a palavra `destaque` em verde
    e sublinhada."""
    pal=texto.split(); n=int(round(dur*FPS)); wr=Writer(f'{OUT}/{name}.mp4',W,H,False)
    cit=bool(autor); fp=_foto_redonda(foto,480) if foto else None
    tam=(84 if len(pal)<=10 else 72 if len(pal)<=20 else 60) if cit else (92 if len(pal)<=12 else 78 if len(pal)<=20 else 64)
    f=serif('i',tam) if cit else font('eb',tam); lh=int(tam*1.3)
    if fp: x0=820; larg=W-x0-170
    elif cit: x0=330; larg=W-2*x0
    else: x0=None; larg=W-360
    linhas=_quebrar(pal,f,larg)
    if len(linhas)>1:  # linhas equilibradas (sem palavra sozinha na última)
        alvo=f.getlength(texto)/len(linhas)*1.06
        while len(_quebrar(pal,f,alvo))>len(linhas): alvo+=20
        linhas=_quebrar(pal,f,min(alvo,larg))
    alt=len(linhas)*lh+(100 if cit else 0)
    y0=H/2-alt/2+(30 if cit else 20)
    hl=(destaque or '').lower().strip('.,!?;:')
    fundo=_fundo_na(); logo=_logo_na(170); ln=lambda idx:f.getlength(' '.join(pal[i] for i in idx))
    nome=None
    if cit:
        fn=font('b',40); txt='— '+autor.upper(); nome=Image.new('RGBA',(int(fn.getlength(txt))+8,64),(0,0,0,0))
        ImageDraw.Draw(nome).text((0,0),txt,font=fn,fill=NA_VERDE)
    aspas=serif('b',360)
    for k in range(n):
        t=k/FPS; fr=fundo.copy(); d=ImageDraw.Draw(fr)
        d.rectangle((0,0,int(18*ease_out(t/0.4)),H),fill=NA_VERDE)
        a=ease_out(t/0.5); lg=logo.copy(); lg.putalpha(lg.getchannel('A').point(lambda v:int(v*a)))
        fr.alpha_composite(lg,(int(W/2-lg.width/2),70))
        if fp:
            a=ease_out((t-0.1)/0.4); sc=0.9+0.1*a
            im=fp.resize((int(fp.width*sc),int(fp.height*sc)),Image.LANCZOS)
            if a<1: im.putalpha(im.getchannel('A').point(lambda v:int(v*a)))
            fr.alpha_composite(im,(int(470-im.width/2),int(H/2+20-im.height/2)))
        if cit:
            a=ease_out((t-0.15)/0.3)
            if a>0.01:
                q=Image.new('RGBA',(300,360),(0,0,0,0)); ImageDraw.Draw(q).text((0,0),'“',font=aspas,fill=NA_VERDE2+(int(255*a),))
                fr.alpha_composite(q,(x0-40,int(y0-250)))
        for li,idx in enumerate(linhas):
            x=x0 if cit else W/2-ln(idx)/2; y=y0+li*lh
            for i in idx:
                w=pal[i]
                if t>=tempos[i]-0.05:
                    pa=ease_out((t-tempos[i]+0.05)/0.18); eh=hl and w.lower().strip('.,!?;:')==hl
                    d.text((x,y+(1-pa)*12),w,font=f,fill=(NA_VERDE if eh else NA_TEXTO)+(int(255*pa),))
                    if eh and not cit:
                        u=ease_out((t-tempos[i]-0.1)/0.35); wl=f.getlength(w.strip('.,!?;:'))
                        if u>0: d.rounded_rectangle((x,y+tam*1.12,x+wl*u,y+tam*1.12+10),radius=5,fill=NA_VERDE2)
                x+=f.getlength(w+' ')
        if nome and t>=tempos[-1]:
            a=ease_out((t-tempos[-1])/0.3); nm=nome.copy(); nm.putalpha(nm.getchannel('A').point(lambda v:int(v*a)))
            fr.alpha_composite(nm,(x0 if cit else int(W/2-nm.width/2),int(y0+len(linhas)*lh+44)))
        wr.put(fr)
    wr.close()
