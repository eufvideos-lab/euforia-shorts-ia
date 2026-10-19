#!/usr/bin/env python3
"""Máquina de Carrosséis: transforma identidade.json + carrosseis.json em slides 1080x1350 (PNG e JPG).
Uso: python3 carrossel/gerar.py pedidos/<id> [--so 2] [--sem-render]
Na pasta do pedido:
  identidade.json   cores, fontes, logo, fotos e nome do cliente (ver carrossel/LEIAME do LEIAME.md)
  carrosseis.json   lista de carrosséis com os slides (ver carrossel/prompts/roteiro_carrossel.md)
  assets/           logo e fotos (caminhos relativos à pasta do pedido)
Sai em <pasta>/saida/<nn-slug>/slide-01.png ... + legenda.txt, e <pasta>/saida/visao-geral-<nn>.jpg.
Texto que não cabe é reduzido sozinho; se ainda estourar, o slide aparece em ALERTAS no fim."""
import html, json, os, re, subprocess, sys, glob, shutil, zipfile
from PIL import Image, ImageDraw, ImageFont

AQUI = os.path.dirname(os.path.abspath(__file__))
W, H = 1080, 1350


# ---------- cores ----------
def rgb(h):
    h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def hexc(c): return '#%02X%02X%02X' % tuple(max(0, min(255, int(round(v)))) for v in c)


def lum(c):
    def ch(v):
        v /= 255; return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(v) for v in rgb(c)); return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contraste(a, b):
    la, lb = lum(a), lum(b); return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def ajustar(cor, fundo, minimo=3.0):
    """Escurece ou clareia a cor de destaque até ler bem sobre o fundo."""
    c = rgb(cor); alvo = (0, 0, 0) if lum(fundo) > 0.4 else (255, 255, 255)
    for i in range(21):
        k = i / 20; x = hexc(tuple(c[j] + (alvo[j] - c[j]) * k for j in range(3)))
        if contraste(x, fundo) >= minimo: return x
    return hexc(alvo)


# ---------- texto ----------
def marcar(t):
    """*destaque* = cor do cliente, ==grifo== = sublinhado grosso, **negrito**, quebra de linha = \n."""
    t = html.escape(t or '')
    t = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', t)
    t = re.sub(r'==(.+?)==', r'<mark>\1</mark>', t)
    t = re.sub(r'\*(.+?)\*', r'<em>\1</em>', t)
    return t.replace('\n', '<br>')


def slug(t):
    import unicodedata
    t = unicodedata.normalize('NFKD', t).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', t).strip('-')[:40] or 'carrossel'


# ---------- fotos ----------
def foco_rosto(caminho):
    """Centro do rosto na foto (frações 0 a 1). O render enquadra a foto com o rosto centralizado na largura."""
    try:
        import cv2
        img = cv2.imread(caminho); h, w = img.shape[:2]
        esc = 800 / max(h, w); peq = cv2.resize(img, (int(w * esc), int(h * esc)))
        casc = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        r = casc.detectMultiScale(cv2.cvtColor(peq, cv2.COLOR_BGR2GRAY), 1.1, 6, minSize=(40, 40))
        if len(r):
            x, y, fw, fh = max(r, key=lambda q: q[2] * q[3])
            cx = (x + fw / 2) / peq.shape[1]; cy = (y + fh / 2) / peq.shape[0]
            return round(cx, 3), round(cy, 3)
    except Exception:
        pass
    return 0.5, 0.3


# ---------- fontes ----------
def fontes_css(familias, pasta_fontes):
    """Baixa as fontes do Google pelo npm (@fontsource) e devolve o @font-face. Cai no link do Google se falhar."""
    css, faltam = [], []
    for fam in familias:
        nome = re.sub(r'[^a-z0-9]+', '-', fam.lower()).strip('-')
        dirf = os.path.join(pasta_fontes, 'node_modules', '@fontsource', nome, 'files')
        if not os.path.isdir(dirf):
            subprocess.run(['npm', 'i', '--no-audit', '--no-fund', '--loglevel=error', '--prefix', pasta_fontes,
                            f'@fontsource/{nome}'], capture_output=True)
        arqs = sorted(glob.glob(os.path.join(dirf, f'{nome}-latin-*-*.woff2')))
        if not arqs:
            faltam.append(fam); continue
        for a in arqs:
            m = re.search(r'-latin-(\d+)-(normal|italic)\.woff2$', a)
            if not m: continue
            for sub in ('latin', 'latin-ext'):
                b = a.replace('-latin-', f'-{sub}-')
                if os.path.exists(b):
                    css.append(f"@font-face{{font-family:'{fam}';font-weight:{m.group(1)};font-style:{m.group(2)};"
                               f"src:url('file://{b}') format('woff2')}}")
    link = ''
    if faltam:
        q = '&'.join('family=' + f.replace(' ', '+') + ':ital,wght@0,400..800;1,400..700' for f in faltam)
        link = f'<link rel="stylesheet" href="https://fonts.googleapis.com/css2?{q}&display=block">'
    return '\n'.join(css), link


# ---------- modelo ----------
CSS = r"""
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1350px;overflow:hidden}
body{font-family:var(--ft-texto),sans-serif;-webkit-font-smoothing:antialiased}
.slide{--k:1;width:1080px;height:1350px;position:relative;overflow:hidden;display:flex;flex-direction:column;
  padding:76px 84px 64px;background:var(--bg);color:var(--tx)}
.claro{--bg:var(--c-claro);--tx:var(--c-tx-claro);--tx2:var(--c-tx2-claro);--d:var(--c-d-claro);--linha:var(--c-linha-claro)}
.escuro{--bg:var(--c-escuro);--tx:var(--c-tx-escuro);--tx2:var(--c-tx2-escuro);--d:var(--c-d-escuro);--linha:var(--c-linha-escuro)}
.destaque{--bg:var(--c-destaque);--tx:var(--c-tx-destaque);--tx2:var(--c-tx-destaque);--d:var(--c-tx-destaque);--linha:var(--c-tx-destaque)}
.topo,.rodape{display:flex;justify-content:space-between;align-items:center;font-size:22px;letter-spacing:.16em;
  text-transform:uppercase;font-weight:600;color:var(--tx2);position:relative;z-index:3}
.topo .rot{color:var(--d)}
.rodape{text-transform:none;letter-spacing:.02em;font-weight:500;font-size:22px}
.rodape img{height:64px;width:auto;display:block}
.rodape .assin{font-family:var(--ft-titulo);font-weight:700;font-size:26px;color:var(--tx);letter-spacing:0}
.corpo{flex:1;display:flex;flex-direction:column;justify-content:center;min-height:0;position:relative;z-index:2;padding:24px 0}
h1,h2,.num,.gig,blockquote,.itens .n{font-variant-numeric:lining-nums}
h1,h2,.num,.gig,blockquote{font-family:var(--ft-titulo);font-weight:var(--peso-titulo);line-height:1.08;letter-spacing:var(--esp-titulo);text-wrap:balance}
h1{font-size:calc(var(--k)*98px)}
h2{font-size:calc(var(--k)*80px)}
p{font-size:calc(var(--k)*39px);line-height:1.4;color:var(--tx2);text-wrap:pretty}
p+p{margin-top:calc(var(--k)*22px)}
em{font-style:normal;color:var(--d)}
b{font-weight:700;color:var(--tx)}
mark{background:none;color:inherit;font-weight:700;box-shadow:inset 0 -0.32em 0 color-mix(in srgb,var(--c-destaque) 70%,transparent)}
.escuro mark{box-shadow:inset 0 -0.32em 0 color-mix(in srgb,var(--c-destaque) 55%,transparent)}
.barra{width:88px;height:8px;background:var(--d);border-radius:4px;margin-bottom:40px}
.sub{margin-top:calc(var(--k)*30px);font-size:calc(var(--k)*36px)}
.circ{position:absolute;border:3px solid var(--d);border-radius:50%;opacity:.35;z-index:1}
.num{font-size:calc(var(--k)*230px);line-height:.9;color:var(--d);margin-bottom:calc(var(--k)*28px)}
.passo h2{margin-bottom:calc(var(--k)*30px)}
.texto h2{margin-bottom:calc(var(--k)*34px)}
.itens{list-style:none;margin-top:calc(var(--k)*40px);display:flex;flex-direction:column;gap:calc(var(--k)*40px)}
.itens li{display:flex;gap:28px;align-items:flex-start}
.itens .n{flex:0 0 auto;width:calc(var(--k)*72px);height:calc(var(--k)*72px);border-radius:50%;background:var(--d);color:var(--bg);
  font-family:var(--ft-titulo);font-weight:700;font-size:calc(var(--k)*36px);display:flex;align-items:center;justify-content:center}
.itens .it b{display:block;font-size:calc(var(--k)*44px);line-height:1.2;margin-bottom:6px}
.itens .it span{display:block;font-size:calc(var(--k)*34px);line-height:1.38;color:var(--tx2)}
blockquote{font-size:calc(var(--k)*68px);font-style:var(--italico-citacao);border-left:10px solid var(--d);padding-left:44px}
.autor{margin-top:34px;padding-left:54px;font-size:calc(var(--k)*28px);letter-spacing:.08em;text-transform:uppercase;color:var(--tx2)}
.gig{font-size:calc(var(--k)*112px);text-align:left}
.gig+p{margin-top:calc(var(--k)*40px)}
.duas{display:flex;flex-direction:column;gap:calc(var(--k)*28px);margin-top:calc(var(--k)*40px)}
.caixa{border-radius:28px;padding:calc(var(--k)*36px) 40px;border:3px solid var(--linha)}
.caixa .et{font-size:calc(var(--k)*24px);letter-spacing:.18em;text-transform:uppercase;font-weight:700;margin-bottom:12px;color:var(--tx2)}
.caixa.v{border-color:var(--d)} .caixa.v .et{color:var(--d)}
.caixa .tx{font-size:calc(var(--k)*40px);line-height:1.38;color:var(--tx)}
.caixa.f .tx{color:var(--tx2)}
.botao{display:inline-flex;flex-direction:column;align-self:flex-start;background:var(--c-destaque);color:var(--c-tx-destaque);
  border-radius:var(--raio-botao);padding:calc(var(--k)*32px) 48px;margin-top:calc(var(--k)*48px);font-size:calc(var(--k)*42px);font-weight:700;line-height:1.2}
.botao small{font-size:calc(var(--k)*24px);font-weight:500;opacity:.85;margin-top:6px}
.cta p{margin-top:calc(var(--k)*36px)}
/* foto */
.foto{position:absolute;inset:0;z-index:0}
.foto img{width:100%;height:100%;object-fit:cover}
.capa-foto{padding:0}
.capa-foto .foto{bottom:auto;height:var(--alt-foto,57%)}
.capa-foto .bloco{position:absolute;left:0;right:0;bottom:0;top:var(--alt-foto,57%);background:var(--bg);padding:48px 84px 60px;display:flex;flex-direction:column;z-index:2}
.capa-foto .bloco .corpo{justify-content:flex-start;padding:0}
.capa-foto h1{font-size:calc(var(--k)*82px)}
.capa-foto .rot{font-size:22px;letter-spacing:.16em;text-transform:uppercase;font-weight:700;color:var(--d);margin-bottom:22px}
.capa-foto .rodape{margin-top:auto}
.lado-foto{padding-right:calc(64px + 44%)}
.lado-foto .foto{left:auto;width:44%}
.selo-foto{position:absolute;right:56px;top:56px;width:150px;height:150px;border-radius:50%;overflow:hidden;border:5px solid var(--d);z-index:3}
.selo-foto img{width:100%;height:100%;object-fit:cover}
"""

JS = r"""
() => {
  // enquadra cada foto: rosto no meio da largura e a ~38% da altura, sem sobrar borda
  for (const im of document.querySelectorAll('img[data-fx]')) {
    const cw = im.clientWidth, ch = im.clientHeight, iw = im.naturalWidth, ih = im.naturalHeight;
    const e = Math.max(cw / iw, ch / ih), dw = iw * e, dh = ih * e;
    const ox = Math.min(0, Math.max(cw - dw, cw / 2 - im.dataset.fx * dw));
    const oy = Math.min(0, Math.max(ch - dh, ch * 0.38 - im.dataset.fy * dh));
    im.style.objectPosition = `${ox}px ${oy}px`;
  }
  const s = document.querySelector('.slide'); const c = s.querySelector('.corpo');
  let k = 1; const estoura = () => c.scrollHeight > c.clientHeight + 2 || c.scrollWidth > c.clientWidth + 2;
  while (estoura() && k > 0.62) { k -= 0.03; s.style.setProperty('--k', k.toFixed(2)); }
  return {k: +k.toFixed(2), estoura: estoura()};
}
"""


def montar_slide(sl, i, n, car, idt, base):
    tipo = sl.get('tipo', 'texto'); tema = sl.get('tema') or {'capa': 'escuro', 'frase': 'escuro', 'citacao': 'escuro', 'cta': 'claro'}.get(tipo, 'claro')
    rot = marcar(sl.get('rotulo') or car.get('rotulo') or '')
    cont = f'{i:02d} / {n:02d}'
    logo = idt.get('logo_escuro' if tema in ('escuro', 'destaque') else 'logo') or idt.get('logo')
    assin = idt.get('assinatura') or idt.get('nome', '')
    esq = f'<img src="file://{os.path.join(base, logo)}">' if logo and idt.get('logo_no_rodape', True) else f'<span class="assin">{html.escape(assin)}</span>'
    dir_ = html.escape(sl.get('rodape') or ('arraste →' if i < n else (idt.get('arroba') or '')))
    topo = f'<div class="topo"><span class="rot">{rot}</span><span>{cont}</span></div>'
    rodape = f'<div class="rodape">{esq}<span>{dir_}</span></div>'
    foto = sl.get('foto')
    fimg = ''
    if foto:
        fp = os.path.join(base, foto); x, y = foco_rosto(fp)
        fimg = f'<div class="foto"><img src="file://{fp}" data-fx="{x}" data-fy="{y}"></div>'
    t = lambda k: marcar(sl.get(k, ''))
    paras = ''.join(f'<p>{marcar(p)}</p>' for p in (sl.get('texto') if isinstance(sl.get('texto'), list) else [sl.get('texto')] if sl.get('texto') else []))
    extra_cls = ''
    if tipo == 'capa' and foto:
        alt = sl.get('altura_foto', 57)
        sub = f'<p class="sub">{t("subtitulo")}</p>' if sl.get('subtitulo') else ''
        return (f'<div class="slide capa-foto {tema}" style="--alt-foto:{alt}%">{fimg}<div class="bloco">'
                f'<div class="corpo">{"<div class=rot>" + rot + "</div>" if rot else ""}<h1>{t("titulo")}</h1>{sub}</div>'
                f'{rodape.replace("<span>" + dir_, "<span>" + cont + " · " + dir_)}</div></div>')
    if tipo == 'capa':
        sub = f'<p class="sub">{t("subtitulo")}</p>' if sl.get('subtitulo') else ''
        corpo = f'<div class="barra"></div><h1>{t("titulo")}</h1>{sub}'
        deco = '<div class="circ" style="width:520px;height:520px;right:-200px;top:-210px"></div>'
        return f'<div class="slide capa {tema}">{deco}{topo}<div class="corpo">{corpo}</div>{rodape}</div>'
    if tipo == 'passo':
        corpo = f'<div class="num">{html.escape(str(sl.get("numero", "")))}</div><h2>{t("titulo")}</h2>{paras}'
    elif tipo == 'lista':
        lis = ''
        for j, it in enumerate(sl.get('itens', []), 1):
            tit, desc = (it if isinstance(it, list) else [it, ''])[:2] if not isinstance(it, dict) else (it.get('titulo', ''), it.get('texto', ''))
            lis += f'<li><div class="n">{j}</div><div class="it"><b>{marcar(tit)}</b>{"<span>" + marcar(desc) + "</span>" if desc else ""}</div></li>'
        corpo = f'<h2>{t("titulo")}</h2><ul class="itens">{lis}</ul>'
    elif tipo == 'citacao':
        aut = f'<div class="autor">{t("autor")}</div>' if sl.get('autor') else ''
        corpo = f'<blockquote>{t("titulo")}</blockquote>{aut}'
    elif tipo == 'frase':
        corpo = f'<div class="gig">{t("titulo")}</div>{paras}'
    elif tipo == 'comparacao':
        a, b = sl.get('errado', {}), sl.get('certo', {})
        par = sl.get('modo') == 'par'  # par = dois lados do mesmo peso (ex.: dois erros); padrão = errado x certo
        ra = a.get('rotulo') or ('' if par else 'Mito'); rb = b.get('rotulo') or ('' if par else 'Verdade')
        corpo = (f'<h2>{t("titulo")}</h2><div class="duas">'
                 f'<div class="caixa {"v" if par else "f"}"><div class="et">{"" if par else "✕ "}{marcar(ra)}</div><div class="tx">{marcar(a.get("texto", ""))}</div></div>'
                 f'<div class="caixa v"><div class="et">{"" if par else "✓ "}{marcar(rb)}</div><div class="tx">{marcar(b.get("texto", ""))}</div></div></div>')
    elif tipo == 'cta':
        bt = sl.get('botao') or {}
        botao = f'<div class="botao">{marcar(bt.get("texto", ""))}{"<small>" + marcar(bt.get("detalhe")) + "</small>" if bt.get("detalhe") else ""}</div>' if bt else ''
        corpo = f'<h2>{t("titulo")}</h2>{botao}{paras}'
        tipo = 'cta'
    else:
        corpo = f'<h2>{t("titulo")}</h2>{paras}'
    if foto and sl.get('foto_estilo', 'lado') == 'lado':
        extra_cls = ' lado-foto'
    elif foto:
        fimg = f'<div class="selo-foto"><img src="file://{os.path.join(base, foto)}" data-fx="{x}" data-fy="{y}"></div>'
    return f'<div class="slide {tipo} {tema}{extra_cls}">{fimg}{topo}<div class="corpo">{corpo}</div>{rodape}</div>'


def vars_css(idt):
    c = idt['cores']
    claro, escuro, dest = c['claro'], c['escuro'], c['destaque']
    tx_claro = c.get('texto_claro', '#1F2937'); tx_escuro = c.get('texto_escuro', '#FFFFFF')
    mix = lambda a, b, k: hexc(tuple(rgb(a)[j] * (1 - k) + rgb(b)[j] * k for j in range(3)))
    v = {
        'c-claro': claro, 'c-escuro': escuro, 'c-destaque': dest,
        'c-tx-claro': tx_claro, 'c-tx-escuro': tx_escuro,
        'c-tx2-claro': mix(tx_claro, claro, 0.22), 'c-tx2-escuro': mix(tx_escuro, escuro, 0.18),
        'c-d-claro': ajustar(c.get('destaque_no_claro', dest), claro), 'c-d-escuro': ajustar(dest, escuro),
        'c-tx-destaque': c.get('texto_no_destaque') or ('#111111' if lum(dest) > 0.35 else '#FFFFFF'),
        'c-linha-claro': mix(tx_claro, claro, 0.8), 'c-linha-escuro': mix(tx_escuro, escuro, 0.75),
        'ft-titulo': f"'{idt['fontes']['titulo']}'", 'ft-texto': f"'{idt['fontes']['texto']}'",
        'peso-titulo': str(idt['fontes'].get('peso_titulo', 700)), 'esp-titulo': idt['fontes'].get('espaco_titulo', '-0.01em'),
        'italico-citacao': 'italic' if idt['fontes'].get('citacao_italico', True) else 'normal',
        'raio-botao': idt.get('raio_botao', '999px'),
    }
    return ':root{' + ';'.join(f'--{k}:{x}' for k, x in v.items()) + '}'


def visao_geral(pngs, destino, titulo):
    th_w, th_h, gap = 324, 405, 16
    cols = min(len(pngs), 5); linhas = (len(pngs) + cols - 1) // cols
    folha = Image.new('RGB', (cols * (th_w + gap) + gap, linhas * (th_h + gap) + gap + 60), (235, 235, 235))
    d = ImageDraw.Draw(folha)
    try:
        f = ImageFont.truetype(os.path.join(AQUI, '..', 'longos', 'fontes', 'InterDisplay-SemiBold.otf'), 28)
    except Exception:
        f = None
    d.text((gap, 16), titulo, fill=(30, 30, 30), font=f)
    for k, p in enumerate(pngs):
        im = Image.open(p).convert('RGB').resize((th_w, th_h), Image.LANCZOS)
        folha.paste(im, (gap + (k % cols) * (th_w + gap), 60 + gap + (k // cols) * (th_h + gap)))
    folha.save(destino, quality=88)


def main():
    pasta = os.path.abspath(sys.argv[1])
    so = None
    if '--so' in sys.argv: so = int(sys.argv[sys.argv.index('--so') + 1])
    idt = json.load(open(os.path.join(pasta, 'identidade.json')))
    if idt.get('logo_cor_no_claro') and idt.get('logo_escuro') and not idt.get('logo'):
        # logo de uma cor só que some no fundo claro: gera a versão recolorida
        sys.path.insert(0, AQUI); import analisar
        idt['logo'] = 'assets/logo-no-claro.png'
        analisar.logo(os.path.join(pasta, idt['logo_escuro']), idt['logo_cor_no_claro'], os.path.join(pasta, idt['logo']))
    pedido = json.load(open(os.path.join(pasta, 'carrosseis.json')))
    pasta_fontes = os.path.join(AQUI, '.fontes'); os.makedirs(pasta_fontes, exist_ok=True)
    fcss, flink = fontes_css(sorted({idt['fontes']['titulo'], idt['fontes']['texto']}), pasta_fontes)
    saida = os.path.join(pasta, 'saida'); os.makedirs(saida, exist_ok=True)
    trabalhos, grupos = [], []
    for ci, car in enumerate(pedido['carrosseis'], 1):
        if so and ci != so: continue
        nome = f'{ci:02d}-{slug(car.get("titulo", ""))}'
        dcar = os.path.join(saida, nome)
        if os.path.isdir(dcar): shutil.rmtree(dcar)
        os.makedirs(os.path.join(dcar, '_html'))
        slides = car['slides']; pngs = []
        for i, sl in enumerate(slides, 1):
            corpo = montar_slide(sl, i, len(slides), car, idt, pasta)
            doc = (f'<!doctype html><html><head><meta charset="utf-8">{flink}<style>{fcss}\n{vars_css(idt)}\n{CSS}'
                   f'\n{idt.get("css_extra", "")}</style></head><body>{corpo}</body></html>')
            h = os.path.join(dcar, '_html', f'slide-{i:02d}.html'); open(h, 'w').write(doc)
            png = os.path.join(dcar, f'slide-{i:02d}.png'); pngs.append(png)
            trabalhos.append({'html': h, 'png': png, 'jpg': png[:-4] + '.jpg'})
        open(os.path.join(dcar, 'legenda.txt'), 'w').write((car.get('legenda') or '').strip() + '\n')
        grupos.append((ci, nome, car, pngs))
    if '--sem-render' in sys.argv:
        print('HTML pronto em', saida); return
    jobs = os.path.join(saida, '_jobs.json'); json.dump({'jobs': trabalhos, 'fit': JS}, open(jobs, 'w'))
    r = subprocess.run(['node', os.path.join(AQUI, 'render.mjs'), jobs], capture_output=True, text=True)
    print(r.stdout[-3000:], r.stderr[-3000:])
    if r.returncode != 0: sys.exit('render falhou')
    res = json.load(open(jobs + '.res'))
    alertas = [f"{os.path.relpath(x['png'], saida)} (texto não coube)" for x in res if x.get('estoura')]
    for ci, nome, car, pngs in grupos:
        dcar = os.path.join(saida, nome)
        for p in pngs:  # JPG para o Instagram
            Image.open(p).convert('RGB').save(p[:-4] + '.jpg', quality=92)
        visao_geral(pngs, os.path.join(saida, f'visao-geral-{ci:02d}.jpg'), f'{ci:02d} · {car.get("titulo", "")}')
        shutil.rmtree(os.path.join(dcar, '_html'), ignore_errors=True)
    # pacote único para subir/baixar
    zp = os.path.join(saida, 'carrosseis.zip')
    with zipfile.ZipFile(zp, 'w', zipfile.ZIP_DEFLATED) as z:
        for ci, nome, car, pngs in grupos:
            for f in sorted(os.listdir(os.path.join(saida, nome))):
                if f.endswith(('.png', '.txt')): z.write(os.path.join(saida, nome, f), f'{nome}/{f}')
    os.remove(jobs); os.remove(jobs + '.res')
    print(f'OK: {len(grupos)} carrossel(is), {len(trabalhos)} slides em {saida}')
    reduz = [f"{os.path.relpath(x['png'], saida)} ({x['k']})" for x in res if x.get('k', 1) < 0.85 and not x.get('estoura')]
    if reduz: print('Texto reduzido para caber (conferir):', ', '.join(reduz))
    if alertas: print('ALERTAS:', ', '.join(alertas))


if __name__ == '__main__':
    main()
