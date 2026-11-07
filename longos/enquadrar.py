#!/usr/bin/env python3
"""Enquadramento automático do cliente na máquina de longos (Henrique, 07/11/2026: "sempre enquadrar o cliente";
o erro mais comum era a pessoa muito distante ou fora do centro).

Acha o rosto em ~40 quadros do bruto (OpenCV, rosto de frente e de perfil), pega a posição e o tamanho típicos e
calcula o recorte: rosto no meio na horizontal, olhos perto de 1/3 da altura e rosto com ~24% da altura da tela no
plano aberto (o fechado aproxima mais 1,22x). O zoom respeita a resolução do bruto (720p até 1,3x; 1080p até 1,45x; 4K até 2,2x),
para não perder nitidez.

Uso: python3 longos/enquadrar.py PASTA [--de S --ate S]
Gera enquadramento.json ({"centro_zoom": [x, y], "zoom_aberto": z, "rosto": {...}}) e enquadramento.png
(quadro com o recorte aberto e o fechado desenhados) para conferir. O cortar.py usa sozinho."""
import json, os, subprocess, sys
import numpy as np

ALVO_ROSTO = 0.24   # altura do rosto / altura da tela no plano aberto
OLHOS_Y = 0.36      # onde fica o centro do rosto na altura da tela


def quadros(arq, dur, n=40, de=0.0, ate=None):
    import cv2
    ate = ate or dur
    out = []
    for k in range(n):
        t = de + (ate - de) * (k + 0.5) / n
        r = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{t:.2f}', '-i', arq, '-frames:v', '1',
                            '-vf', 'scale=960:-2', '-f', 'image2pipe', '-vcodec', 'png', '-'], capture_output=True)
        if r.stdout:
            img = cv2.imdecode(np.frombuffer(r.stdout, np.uint8), cv2.IMREAD_COLOR)
            if img is not None:
                out.append((t, img))
    return out


def rostos(img):
    import cv2
    cinza = cv2.equalizeHist(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
    h = img.shape[0]
    achados = []
    for nome in ('haarcascade_frontalface_default.xml', 'haarcascade_profileface.xml'):
        cl = cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades, nome))
        for flip in ((False, True) if 'profile' in nome else (False,)):
            g = cv2.flip(cinza, 1) if flip else cinza
            for x, y, w, hh in cl.detectMultiScale(g, 1.1, 6, minSize=(int(h * 0.06), int(h * 0.06))):
                if flip:
                    x = g.shape[1] - x - w
                achados.append((x, y, w, hh))
        if achados:
            break
    return achados


def calcular(pasta, de=0.0, ate=None):
    info = json.load(open(os.path.join(pasta, 'info.json')))
    Q = quadros(info['arquivo'], info['duracao'], de=de, ate=ate)
    pts = []
    for t, img in Q:
        rs = rostos(img)
        if not rs:
            continue
        x, y, w, h = max(rs, key=lambda r: r[2] * r[3])   # o maior rosto é o do cliente
        H, Wd = img.shape[:2]
        pts.append(((x + w / 2) / Wd, (y + h / 2) / H, h / H))
    if len(pts) < max(3, len(Q) // 5):
        return None   # rosto não achado em quadros suficientes: fica o do plano
    a = np.array(pts)
    cx, cy, fh = (float(np.median(a[:, i])) for i in range(3))
    # o bruto vira 1920x1080 primeiro (crop pelo lado que sobra); o rosto é medido nesse quadro
    lado = min(info['largura'] / 1920, info['altura'] / 1080)
    teto = 2.2 if lado >= 1.9 else (1.7 if lado >= 1.3 else (1.45 if lado >= 0.95 else 1.3))
    z_tam = ALVO_ROSTO / max(fh, 0.02)
    z_centro = 1 / (2 * max(0.05, min(cx, 1 - cx)))           # o mínimo para o rosto caber no meio
    z = float(min(teto, max(1.0, z_tam, z_centro)))
    # centro do recorte: rosto no meio na horizontal e um pouco acima do meio na vertical
    cyc = cy + (0.5 - OLHOS_Y) / z
    return {'centro_zoom': [round(cx, 3), round(min(0.95, max(0.05, cyc)), 3)], 'zoom_aberto': round(z, 3),
            'rosto': {'x': round(cx, 3), 'y': round(cy, 3), 'altura': round(fh, 3), 'quadros': len(pts), 'de': len(Q)},
            'teto_zoom': teto, 'distante': fh * z < ALVO_ROSTO * 0.8}


def desenhar(pasta, r, zoom_fechado=1.22):
    import cv2
    info = json.load(open(os.path.join(pasta, 'info.json')))
    Q = quadros(info['arquivo'], info['duracao'], n=1)
    if not Q:
        return
    img = cv2.resize(Q[0][1], (960, 540))
    for z, cor in ((r['zoom_aberto'], (0, 200, 0)), (max(r['zoom_aberto'] * 1.15, zoom_fechado), (0, 120, 255))):
        cw, ch = 960 / z, 540 / z
        x0 = min(max(r['centro_zoom'][0] * 960 - cw / 2, 0), 960 - cw)
        y0 = min(max(r['centro_zoom'][1] * 540 - ch / 2, 0), 540 - ch)
        cv2.rectangle(img, (int(x0), int(y0)), (int(x0 + cw), int(y0 + ch)), cor, 3)
    cv2.imwrite(os.path.join(pasta, 'enquadramento.png'), img)


if __name__ == '__main__':
    pasta = sys.argv[1]
    a = sys.argv[2:]
    de = float(a[a.index('--de') + 1]) if '--de' in a else 0.0
    ate = float(a[a.index('--ate') + 1]) if '--ate' in a else None
    r = calcular(pasta, de, ate)
    if not r:
        print('rosto não achado: o enquadramento fica o do plano (centro_zoom)')
        sys.exit(0)
    json.dump(r, open(os.path.join(pasta, 'enquadramento.json'), 'w'), indent=1)
    desenhar(pasta, r)
    print(f"enquadramento: rosto em x={r['rosto']['x']}, altura {r['rosto']['altura']:.0%} da tela "
          f"({r['rosto']['quadros']}/{r['rosto']['de']} quadros) → zoom aberto {r['zoom_aberto']}x, centro {r['centro_zoom']}"
          + (' (AVISO: mesmo no zoom máximo ela fica distante; bruto com pouca resolução)' if r['distante'] else ''))
