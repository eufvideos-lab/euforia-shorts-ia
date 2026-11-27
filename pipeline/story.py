"""Capa de story de divulgação do vídeo novo (1080x1920), peça fixa do pacote semanal (25/11/2026).

É a arte que o cliente posta no story do Instagram no dia do vídeo: "VÍDEO NOVO NO CANAL", a thumb, o título
e "Assista agora", com espaço para o adesivo de link. Sai na identidade do cliente (campo "Identidade carrossel (IA)").

Uso:
  python3 pipeline/story.py <pasta-saida> --identidade '<json da ficha>' --titulo "<título do vídeo>" \
      (--thumb thumb.png | --video video.mp4 --texto-thumb "NÃO É SÓ CANSAÇO") \
      [--logo logo-negativo.png] [--fontes pasta/com/ttf] [--arroba @canal] [--nome "Cliente"]

Gera <pasta>/story.png (e story.html para conferência). Com --video, escolhe sozinho um quadro com o rosto grande e
nítido (sem tarja embaixo) e monta uma mini-thumb com o texto da thumb. Com --thumb, usa a thumb pronta.
"""
import argparse, base64, glob, html, json, os, re, subprocess, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(AQUI, '..', 'carrossel'))


def ler_identidade(valor):
    if os.path.exists(valor):
        valor = open(valor, encoding='utf-8').read()
    valor = valor.replace('\\{', '{').replace('\\}', '}').replace('\\_', '_')
    return json.loads(valor)


def data_uri(caminho):
    ext = os.path.splitext(caminho)[1].lower().lstrip('.') or 'png'
    mime = {'jpg': 'jpeg', 'jpeg': 'jpeg', 'png': 'png', 'webp': 'webp', 'svg': 'svg+xml'}.get(ext, 'png')
    return f'data:image/{mime};base64,' + base64.b64encode(open(caminho, 'rb').read()).decode()


def escolher_quadro(video, destino, inicio=0.15, fim=0.85, passos=24):
    """Quadro com o maior rosto nítido, olhando para a câmera, longe de B-roll e tarja (não olha a faixa de baixo)."""
    import cv2
    cap = cv2.VideoCapture(video)
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
    casc = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    olhos = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_eye.xml')
    melhor, nota_m = None, -1
    for i in range(passos):
        pos = int(n * (inicio + (fim - inicio) * i / max(1, passos - 1)))
        cap.set(cv2.CAP_PROP_POS_FRAMES, pos)
        ok, q = cap.read()
        if not ok:
            continue
        cinza = cv2.cvtColor(q, cv2.COLOR_BGR2GRAY)
        h, w = cinza.shape
        rostos = casc.detectMultiScale(cinza, 1.1, 6, minSize=(w // 12, w // 12))
        if len(rostos) != 1:
            continue
        x, y, fw, fh = rostos[0]
        if y + fh > h * 0.8:
            continue
        rosto = cinza[y:y + fh, x:x + fw]
        nitidez = cv2.Laplacian(rosto, cv2.CV_64F).var()
        n_olhos = len(olhos.detectMultiScale(rosto[: fh // 2 + fh // 6], 1.1, 6))
        nota = fw * (1 + min(nitidez, 400) / 400) * (1.3 if n_olhos >= 2 else 1)
        if nota > nota_m:
            melhor, nota_m = (q, x + fw / 2, y + fh / 2), nota
    cap.release()
    if melhor is None:
        raise SystemExit('ERRO: não achei quadro com um rosto só; passe --thumb com a thumb pronta')
    q, cx, cy = melhor
    h, w = q.shape[:2]
    # Recorte 16:9 com zoom, rosto num terço e o texto da thumb no outro lado
    cw, ch = int(w / 1.15), int(w / 1.15 * 9 / 16)
    lado = 0.30 if cx < w / 2 else 0.70
    x0 = int(min(max(0, cx - lado * cw), w - cw))
    y0 = int(min(max(0, cy - 0.45 * ch), h - ch))
    q = cv2.resize(q[y0:y0 + ch, x0:x0 + cw], (1280, 720), interpolation=cv2.INTER_CUBIC)
    cv2.imwrite(destino, q, [cv2.IMWRITE_JPEG_QUALITY, 92])
    return destino, (cx - x0) / cw


def fontes(idt, pasta_ttf, saida):
    fams = [idt.get('fontes', {}).get('titulo') or 'Inter', idt.get('fontes', {}).get('texto') or 'Inter']
    css, link = [], ''
    if pasta_ttf and os.path.isdir(pasta_ttf):
        for f in sorted(glob.glob(os.path.join(pasta_ttf, '*.ttf'))):
            m = re.match(r'(.+?)-(\d+)(i?)\.ttf$', os.path.basename(f))
            if m:
                css.append(f"@font-face{{font-family:'{m.group(1)}';font-weight:{m.group(2)};font-style:"
                           f"{'italic' if m.group(3) else 'normal'};src:url('{data_uri_font(f)}')}}")
        if css:
            return '\n'.join(css), ''
    try:
        from gerar import fontes_css
        return fontes_css(list(dict.fromkeys(fams)), os.path.join(saida, '_fontes'))
    except Exception:
        q = '&'.join('family=' + f.replace(' ', '+') + ':ital,wght@0,300..800;1,300..700' for f in dict.fromkeys(fams))
        return '', f'<link rel="stylesheet" href="https://fonts.googleapis.com/css2?{q}&display=block">'


def data_uri_font(f):
    return 'data:font/ttf;base64,' + base64.b64encode(open(f, 'rb').read()).decode()


def montar(a):
    a.saida = os.path.abspath(a.saida)
    os.makedirs(a.saida, exist_ok=True)
    idt = ler_identidade(a.identidade)
    c = idt.get('cores', {})
    escuro = c.get('escuro', '#111111')
    claro = c.get('texto_escuro') or c.get('claro', '#F5F5F5')
    destaque = c.get('destaque_no_escuro') or c.get('destaque', '#FF6518')
    ft = idt.get('fontes', {})
    f_tit, f_txt = ft.get('titulo') or 'Inter', ft.get('texto') or 'Inter'
    peso = int(ft.get('peso_titulo') or 600)
    css_f, link_f = fontes(idt, a.fontes, a.saida)

    foco = 0.5
    if a.thumb:
        img = a.thumb
        texto_thumb = ''
    else:
        img, foco = escolher_quadro(a.video, os.path.join(a.saida, 'quadro.jpg'))
        texto_thumb = (a.texto_thumb or '').upper()

    titulo = a.titulo.strip().upper()  # regra do Henrique: título de vídeo sempre em CAIXA ALTA
    if ':' in titulo:
        p1, p2 = titulo.split(':', 1)
        tit_html = f'{html.escape(p1.strip())}: <em>{html.escape(p2.strip())}</em>'
    else:
        tit_html = html.escape(titulo)
    tam = 84 if len(titulo) <= 40 else 74 if len(titulo) <= 60 else 64

    logo_html = f'<img class="logo" src="{data_uri(a.logo)}">' if a.logo else (
        f'<div class="nome">{html.escape(a.nome)}</div>' if a.nome else '')
    # Mini-thumb: rosto à direita, texto da thumb à esquerda (modelo das thumbs da Euforia)
    lado = 'right' if foco >= 0.5 else 'left'
    over = ''
    if texto_thumb:
        palavras = texto_thumb.split()
        meio = max(1, len(palavras) - (2 if len(palavras) > 3 else 1))
        over = (f'<div class="tt {"tt-esq" if lado == "right" else "tt-dir"}">{html.escape(" ".join(palavras[:meio]))}'
                f'<br><em>{html.escape(" ".join(palavras[meio:]))}</em></div>')
    pos_x = 'center'
    arroba = f'<div class="arroba">{html.escape(a.arroba)}</div>' if a.arroba else ''

    doc = f"""<!doctype html><html><head><meta charset="utf-8">{link_f}<style>
{css_f}
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:1080px;height:1920px;overflow:hidden}}
body{{background:{escuro};color:{claro};font-family:'{f_txt}',sans-serif;-webkit-font-smoothing:antialiased;position:relative}}
.brilho{{position:absolute;inset:0;background:
  radial-gradient(900px 700px at 85% 32%, color-mix(in srgb,{destaque} 26%,transparent), transparent 70%),
  radial-gradient(800px 600px at 10% 90%, color-mix(in srgb,{destaque} 14%,transparent), transparent 70%)}}
.onda{{position:absolute;left:0;right:0;bottom:0;height:300px;opacity:.5}}
.cx{{position:absolute;left:70px;right:70px;top:270px;display:flex;flex-direction:column;align-items:center;text-align:center}}
.logo{{height:96px;max-width:560px;object-fit:contain}}
.nome{{font-family:'{f_tit}';font-size:44px;font-weight:{peso};letter-spacing:.02em}}
.selo{{margin-top:64px;background:{destaque};color:{escuro};font-weight:800;font-size:34px;letter-spacing:.14em;
  padding:16px 34px;border-radius:999px}}
h1{{margin-top:44px;font-family:'{f_tit}';font-weight:{peso};font-size:{tam}px;line-height:1.08;letter-spacing:-.005em;
  text-wrap:balance;font-variant-numeric:lining-nums}}
h1 em{{font-style:normal;color:{destaque}}}
.thumb{{margin-top:58px;width:940px;height:529px;border-radius:30px;overflow:hidden;position:relative;
  box-shadow:0 30px 80px rgba(0,0,0,.45),0 0 0 4px color-mix(in srgb,{claro} 14%,transparent);
  background:#000 url('{data_uri(img)}') {pos_x} 30%/cover no-repeat}}
.thumb .grad{{position:absolute;inset:0;background:linear-gradient({'90deg' if lado == 'right' else '270deg'},
  color-mix(in srgb,{escuro} 92%,transparent) 0%, color-mix(in srgb,{escuro} 55%,transparent) 42%, transparent 68%)}}
.tt{{position:absolute;top:50%;transform:translateY(-50%);width:52%;font-family:'{f_tit}';font-weight:{max(peso, 600)};
  font-size:60px;line-height:1.02;color:{claro};text-align:left;text-shadow:0 2px 18px rgba(0,0,0,.35)}}
.tt-esq{{left:44px}} .tt-dir{{right:44px;text-align:right}}
.tt em{{font-style:normal;color:{destaque}}}
.play{{position:absolute;right:28px;bottom:26px;width:96px;height:68px;border-radius:18px;background:#FF0033;
  display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(0,0,0,.4)}}
.play:after{{content:'';border-left:30px solid #fff;border-top:18px solid transparent;border-bottom:18px solid transparent;margin-left:6px}}
.cta{{margin-top:64px;font-weight:800;font-size:46px;letter-spacing:.06em}}
.cta em{{font-style:normal;color:{destaque}}}
.seta{{margin-top:22px;font-size:40px;color:{destaque};line-height:1}}
.arroba{{margin-top:14px;font-size:34px;font-weight:600;opacity:.85}}
</style></head><body>
<div class="brilho"></div>
<svg class="onda" viewBox="0 0 1080 300" preserveAspectRatio="none"><path d="M0,170 C220,90 380,250 560,170 C740,90 880,210 1080,140 L1080,300 L0,300 Z" fill="{destaque}" opacity=".22"/><path d="M0,220 C200,160 420,290 620,215 C800,150 930,250 1080,200 L1080,300 L0,300 Z" fill="{destaque}" opacity=".35"/></svg>
<div class="cx">
  {logo_html}
  <div class="selo">VÍDEO NOVO NO CANAL</div>
  <h1>{tit_html}</h1>
  <div class="thumb"><div class="grad" style="{'' if texto_thumb else 'display:none'}"></div>{over}<div class="play"></div></div>
  <div class="cta">ASSISTA AGORA <em>NO YOUTUBE</em></div>
  <div class="seta">▼</div>
  {arroba}
</div>
</body></html>"""
    caminho_html = os.path.join(a.saida, 'story.html')
    open(caminho_html, 'w', encoding='utf-8').write(doc)
    png = os.path.join(a.saida, 'story.png')
    renderizar(caminho_html, png)
    print(json.dumps({'ok': True, 'story': png, 'quadro': None if a.thumb else img}, ensure_ascii=False))


def renderizar(caminho_html, png, w=1080, h=1920):
    js = f"""
let pw; try {{ pw = require('playwright'); }} catch (e) {{ pw = require('{os.path.join(AQUI, '..', 'carrossel', 'node_modules', 'playwright-core')}'); }}
(async () => {{
  const fs = require('fs');
  const opts = {{}};
  if (process.env.CHROME) opts.executablePath = process.env.CHROME;
  const b = await pw.chromium.launch(opts);
  const p = await b.newPage({{ viewport: {{ width: {w}, height: {h} }}, deviceScaleFactor: 1 }});
  await p.goto('file://{caminho_html}', {{ waitUntil: 'networkidle' }});
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(200);
  await p.screenshot({{ path: '{png}', clip: {{ x: 0, y: 0, width: {w}, height: {h} }} }});
  await b.close();
}})().catch(e => {{ console.error(e); process.exit(1); }});
"""
    r = subprocess.run(['node', '-e', js], capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit('ERRO no render: ' + r.stderr[-500:])


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('saida')
    ap.add_argument('--identidade', required=True)
    ap.add_argument('--titulo', required=True)
    ap.add_argument('--thumb')
    ap.add_argument('--video')
    ap.add_argument('--texto-thumb', dest='texto_thumb')
    ap.add_argument('--logo')
    ap.add_argument('--fontes')
    ap.add_argument('--arroba')
    ap.add_argument('--nome')
    a = ap.parse_args()
    if not a.thumb and not a.video:
        ap.error('passe --thumb ou --video')
    montar(a)
