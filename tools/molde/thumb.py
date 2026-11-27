"""Thumb 1280x720 no padrão 'pílula com nome + título 2 linhas + barra + apoio + foto recortada à direita'.
Uso: python3 thumb.py spec.json saida.png   (spec: ver chaves abaixo)"""
import json, sys, base64, os
from playwright.sync_api import sync_playwright
sp = json.load(open(sys.argv[1])); out = sys.argv[2]
def b64(p): return 'data:image/png;base64,' + base64.b64encode(open(p,'rb').read()).decode()
c = sp['cores']  # fundo, forma, t1, t2, apoio, destaque, linhas
foto = b64(sp['foto'])
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rosto import rosto
if sp.get('rosto_w'):
    r = rosto(sp['foto']); k = sp['rosto_w'] / r['w']
    sp['foto_h'] = int(r['H'] * k); sp['foto_x'] = int(sp.get('rosto_cx', 975) - r['cx'] * k); sp['foto_y'] = int(sp.get('rosto_cy', 250) - r['cy'] * k); sp.pop('foto_centro_x', None)
fx = sp.get('foto_x', 640); fy = sp.get('foto_y', 30); fh = sp.get('foto_h', 760)
html = f"""<html><head><link href="https://fonts.googleapis.com/css2?family={sp.get('fonte','Poppins').replace(' ','+')}:wght@400;500;600;700;800;900&display=block" rel="stylesheet">
<style>*{{margin:0;padding:0;box-sizing:border-box}} body{{width:1280px;height:720px;overflow:hidden;background:{c['fundo']};font-family:'{sp.get('fonte','Poppins')}',sans-serif;position:relative}}
.forma{{position:absolute;left:{sp.get('forma_x',760)}px;top:-80px;width:900px;height:900px;border-radius:50%;background:{c['forma']};border:{sp.get('forma_borda','0')};box-shadow:{sp.get('forma_sombra','none')}}}
.circ{{position:absolute;border:2px solid {c['linhas']};border-radius:50%}}
.dots{{position:absolute;width:110px;height:70px;background-image:radial-gradient({c['linhas']} 2.6px,transparent 3px);background-size:18px 18px}}
.foto{{position:absolute;left:{fx}px;top:{fy}px;height:{fh}px;filter:drop-shadow(0 0 40px {c.get('brilho','rgba(0,0,0,0)')})}}
.txt{{position:absolute;left:{sp.get('txt_x',68)}px;top:{sp.get('txt_top',190)}px;width:{sp.get('txt_w',560)}px}}
.pill{{display:inline-block;border:2.5px solid {c['t1']};border-radius:40px;padding:6px 22px;font-weight:700;font-size:23px;color:{c['t1']};letter-spacing:.5px;margin-bottom:34px}}
.l1{{font-weight:800;font-size:{sp.get('s1',64)}px;line-height:1.02;color:{c['t1']};letter-spacing:-.5px}}
.l2{{font-weight:800;font-size:{sp.get('s2',72)}px;line-height:1.02;color:{c['t2']};letter-spacing:-.5px}}
.bar{{width:92px;height:7px;background:{c['destaque']};margin:34px 0 28px}}
.apoio{{font-weight:500;font-size:25px;line-height:1.25;color:{c['apoio']};text-transform:uppercase;width:{sp.get('apoio_w',520)}px}}
.apoio b{{color:{c['destaque2']};font-weight:600}}
</style></head><body>
<div class="forma"></div>
<div class="circ" style="left:{sp.get('circ1_x',-90)}px;top:{sp.get('circ1_y',-150)}px;width:300px;height:300px"></div>
<div class="circ" style="left:{sp.get('circ2_x',1000)}px;top:-160px;width:330px;height:330px"></div>
<div class="dots" style="left:{sp.get('dots1',[560,42])[0]}px;top:{sp.get('dots1',[560,42])[1]}px"></div><div class="dots" style="left:{sp.get('dots2',[82,600])[0]}px;top:{sp.get('dots2',[82,600])[1]}px"></div>
<img class="foto" src="{foto}">
<div class="txt">{"" if sp.get("sem_pill") else "<div class=\"pill\">"+sp["nome"]+"</div>"}<div class="l1">{sp['l1']}</div><div class="l2">{sp['l2']}</div><div class="bar"></div><div class="apoio">{sp.get('apoio','')}</div></div>
</body></html>"""
def _abrir(p):
    try: return p.chromium.launch()
    except Exception: return p.chromium.launch(executable_path=os.environ.get('CHROME', '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'))
with sync_playwright() as p:
    b = _abrir(p); pg = b.new_page(viewport={'width':1280,'height':720})
    pg.set_content(html); pg.wait_for_timeout(1200); pg.evaluate("document.fonts.ready")
    # foto centrada pelo eixo do rosto: recortes.py já centraliza o rosto na horizontal
    if sp.get('foto_centro_x'):
        pg.evaluate(f"(()=>{{const i=document.querySelector('.foto'); i.style.left=({sp['foto_centro_x']}-i.getBoundingClientRect().width/2)+'px'}})()")
    pg.screenshot(path=out); b.close()
print(out)
