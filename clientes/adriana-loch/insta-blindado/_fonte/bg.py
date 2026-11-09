from PIL import Image, ImageFilter, ImageEnhance
import numpy as np
FR='/tmp/claude-0/al/fr/'; SRC='/tmp/claude-0/al/src/'
W,H=1080,1350; BG=(0x13,0x19,0x36)
def fit(im,box,size):
    return im.crop(box).resize(size,Image.LANCZOS)
def fade(im,start=0.50,end=0.80,top=0.0):
    a=np.array(im).astype(float); h=a.shape[0]
    y=np.linspace(0,1,h)[:,None,None]
    t=np.clip((y-start)/(end-start),0,1)
    t=np.maximum(t, np.clip((top-y)/max(top,1e-6),0,1)*0.6) if top>0 else t
    out=a*(1-t)+np.array(BG)*t
    return Image.fromarray(out.astype('uint8'))
# Post 1: capa 01 (foto real de palco)
c=Image.open(SRC+'capa01.png').convert('RGB')
p1=fit(c,(1000,0,1864,1080),(W,H)); p1=fade(p1,0.52,0.80); p1.save('bg1.png')
# Post 2: estudio Business Speaker (bruto video 01)
b=Image.open(FR+'b_180.jpg').convert('RGB')
cx=1040; p2=fit(b,(cx-432,0,cx+432,1080),(W,H)); p2=fade(p2,0.55,0.82); p2.save('bg2.png')
# Post 3: Wagner + Adriana lado a lado (trailer)
wg=Image.open(FR+'t_16.jpg').convert('RGB'); ad=Image.open(FR+'t_6.jpg').convert('RGB')
L=fit(wg,(1180-336,0,1180+336,940),(540,int(940*540/672)))
R=fit(ad,(920-336,0,920+336,940),(540,int(940*540/672)))
canvas=Image.new('RGB',(W,H),BG)
canvas.paste(L,(0,0)); canvas.paste(R,(540,0))
canvas=fade(canvas,0.50,0.75); canvas.save('bg3.png')
print(L.size)
