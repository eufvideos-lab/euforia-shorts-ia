"""Capa de short 1080x1920: círculo atrás do rosto, foto recortada com rosto centralizado, título em 2-3 linhas embaixo.
Uso: python3 capa.py spec.json saida.png
spec: nome, linhas [[texto, cor_chave]], foto, rosto_w (largura caixa rosto, padrão 360), rosto_cy (padrão 700), cores{fundo, forma, anel, t1, t2, linhas}, tam (px)"""
import json, sys, base64, os
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rosto import rosto
sp = json.load(open(sys.argv[1])); out = sys.argv[2]; c = sp['cores']
def b64(p): return 'data:image/png;base64,' + base64.b64encode(open(p, 'rb').read()).decode()
r = rosto(sp['foto']); k = sp.get('rosto_w', 360) / r['w']
fh = int(r['H'] * k); fx = int(540 - r['cx'] * k); fy = int(sp.get('rosto_cy', 700) - r['cy'] * k)
fim = fy + fh  # base da foto
fw = int(r['W'] * k); cy0 = sp.get('rosto_cy', 700) + 60
rx = max(200, min(540 - fx, fx + fw - 540) - 10); ry = max(300, fim - cy0 - 10)
txt_top = sp.get('txt_top', max(1180, fim - 120))
ry = min(ry, txt_top - 10 - cy0)
linhas = ''.join(f'<div style="color:{c[cor]}">{t}</div>' for t, cor in sp['linhas'])
html = f"""<html><head><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;700;800&display=block" rel="stylesheet">
<style>*{{margin:0;padding:0;box-sizing:border-box}} body{{width:1080px;height:1920px;overflow:hidden;background:{c['fundo']};font-family:'Poppins',sans-serif;position:relative}}
.forma{{position:absolute;left:{540-470}px;top:{sp.get('rosto_cy',700)-500}px;width:940px;height:940px;border-radius:50%;background:{c['forma']};box-shadow:0 0 0 26px {c['anel']}}}
.circ{{position:absolute;border:3px solid {c['linhas']};border-radius:50%}}
.dots{{position:absolute;width:150px;height:96px;background-image:radial-gradient({c['linhas']} 3.4px,transparent 4px);background-size:24px 24px}}
.fotow{{position:absolute;left:0;top:0;width:1080px;height:{fim}px;overflow:hidden;-webkit-mask-image:radial-gradient(ellipse {rx}px {ry}px at 540px {cy0}px,#000 72%,transparent 100%)}}
.foto{{position:absolute;left:{fx}px;top:{fy}px;height:{fh}px;filter:drop-shadow(0 0 50px {c.get('brilho','rgba(0,0,0,0)')})}}
.txt{{position:absolute;left:70px;width:940px;top:{txt_top}px;text-align:center}}
.pill{{display:inline-block;border:3px solid {c['t1']};border-radius:50px;padding:8px 30px;font-weight:700;font-size:32px;color:{c['t1']};margin-bottom:30px;background:{c['fundo']}}}
.t{{font-weight:800;font-size:{sp.get('tam',88)}px;line-height:1.04;letter-spacing:-.5px;text-transform:uppercase}}
.bar{{width:120px;height:9px;background:{c['anel']};margin:36px auto 0}}
</style></head><body>
<div class="circ" style="left:-140px;top:-120px;width:360px;height:360px"></div>
<div class="circ" style="left:880px;top:1680px;width:380px;height:380px"></div>
<div class="dots" style="left:880px;top:90px"></div><div class="dots" style="left:60px;top:1740px"></div>
<div class="forma"></div>
<div class="fotow"><img class="foto" src="{b64(sp['foto'])}"></div>
<div class="txt"><div class="pill">{sp['nome']}</div><div class="t">{linhas}</div><div class="bar"></div></div>
</body></html>"""
def _abrir(p):
    try: return p.chromium.launch()
    except Exception: return p.chromium.launch(executable_path=os.environ.get('CHROME', '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'))
with sync_playwright() as p:
    b = _abrir(p); pg = b.new_page(viewport={'width': 1080, 'height': 1920})
    pg.set_content(html); pg.wait_for_timeout(1200); pg.evaluate("document.fonts.ready")
    h = pg.evaluate("document.querySelector('.txt').getBoundingClientRect().bottom")
    pg.screenshot(path=out); b.close()
print(out, 'texto_ate_y=', int(h), 'foto_fim=', fim)
