# Grafismos animados do formato Padrão: paleta do cliente, textos-chave grandes em caps com sombra e pop suave,
# cartões de tela cheia, mapa de cidades, lowers minimalistas centralizados e tela final.
import numpy as np, subprocess, math, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
OUT='gfx'
FPS=30; W,H=1920,1080
F=os.path.join(os.path.dirname(os.path.abspath(__file__)),'fontes')+'/'
def font(w,s): return ImageFont.truetype(F+{'b':'InterDisplay-Bold.otf','eb':'InterDisplay-ExtraBold.otf','blk':'InterDisplay-Black.otf','sb':'InterDisplay-SemiBold.otf'}[w],s)
# paleta do cliente (padrão = Grupo Euforia: preto, branco, laranja e degradê branco→pêssego→laranja)
P={'bg':(5,5,5),'acc':(255,101,24),'acc2':(254,176,137),'txt':(255,255,255)}
def hexrgb(h): h=h.lstrip('#'); return tuple(int(h[i:i+2],16) for i in (0,2,4))
def configurar(out,paleta=None):
    """paleta: {'fundo':'#050505','destaque':'#FF6518','destaque2':'#FEB089','texto':'#FFFFFF'}"""
    global OUT
    OUT=out; os.makedirs(OUT,exist_ok=True)
    for k,c in (('fundo','bg'),('destaque','acc'),('destaque2','acc2'),('texto','txt')):
        if paleta and paleta.get(k): P[c]=hexrgb(paleta[k])
def ease_out(x): x=min(max(x,0),1); return 1-(1-x)**3
def ease_back(x): x=min(max(x,0),1); c1=1.7; c3=c1+1; return 1+c3*(x-1)**3+c1*(x-1)**2
def ease_in(x): x=min(max(x,0),1); return x**3
def grad(w,h,warm=False):
    x=np.linspace(0.5 if warm else 0,1,max(w,1))[None,:,None]
    a=np.array(P['txt'])[None,None,:]; b=np.array(P['acc2'])[None,None,:]; c=np.array(P['acc'])[None,None,:]
    g=np.where(x<0.5,a+(b-a)*(x/0.5),b+(c-b)*((x-0.5)/0.5)); return Image.fromarray(np.repeat(g,h,0).astype(np.uint8))
yy,xx=np.mgrid[0:H,0:W]
rng=np.random.default_rng(1); GRAIN=[(rng.standard_normal((H//2,W//2))*5).astype(np.int16) for _ in range(4)]
def bg(t):
    cx=W*(0.5+0.18*math.sin(t*0.5)); cy=H*(0.55+0.1*math.cos(t*0.4))
    d=np.sqrt((xx-cx)**2+(yy-cy)**2)/(W*0.85); glow=np.clip(1-d,0,1)**2.2*0.38
    base=np.zeros((H,W,3),np.float32)+np.array(P['bg'],np.float32)+glow[...,None]*np.array(P['acc'],np.float32)
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
    # imagem única com todas as cidades; um anel laranja vai circulando a cidade falada
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
        # trilha laranja até a cidade atual
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
    # lower minimalista centralizado: retângulo em degradê da marca abre do centro, texto branco sobe; sai ao contrário
    f=font('blk',40); n=int(round(dur*FPS)); BW,BH=W,240
    tw=int(f.getlength(text)); pad=34; ic=56 if icon else 0
    bw=tw+2*pad+ic; bh=74; x0=(W-bw)//2; y0=BH-60-bh
    g=np.linspace(0,1,bw)[None,:,None]
    a=np.array(P['acc'],np.float32); b2=np.array(P['acc2'],np.float32)*0.55+a*0.45
    box=Image.fromarray(np.repeat(a+(b2-a)*g,bh,0).astype(np.uint8)).convert('RGBA')
    m=Image.new('L',(bw,bh),0); ImageDraw.Draw(m).rounded_rectangle((0,0,bw-1,bh-1),radius=16,fill=255); box.putalpha(m)
    txt=Image.new('RGBA',(bw,bh),(0,0,0,0)); d=ImageDraw.Draw(txt)
    if icon=='play':
        cx,cy=pad+16,bh/2; d.rounded_rectangle((cx-18,cy-13,cx+18,cy+13),radius=6,fill=P['txt']); d.polygon([(cx-5,cy-7),(cx-5,cy+7),(cx+8,cy)],fill=P['acc'])
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
