#!/usr/bin/env python3
"""Recorta um vídeo horizontal para vertical 9:16 com o rosto centralizado.
Uso: python3 centralizar_rosto.py entrada.mp4 saida.mp4 [inicio] [fim]
Detecta o rosto (OpenCV) 4x por segundo, separa por planos (corte de cena) e usa a posição
mediana do rosto em cada plano. Plano sem rosto (B-roll) fica centralizado."""
import cv2, sys, subprocess, json, statistics
src, out = sys.argv[1], sys.argv[2]
t0 = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0
t1 = float(sys.argv[4]) if len(sys.argv) > 4 else None
cap = cv2.VideoCapture(src)
fps = cap.get(cv2.CAP_PROP_FPS); W = int(cap.get(3)); H = int(cap.get(4))
n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)); t1 = t1 or n / fps
cw = int(round(H * 9 / 16 / 2) * 2)
casc = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
amostras, prev, cortes = [], None, [t0]
passo = max(1, int(fps / 4))
cap.set(cv2.CAP_PROP_POS_FRAMES, int(t0 * fps)); f = int(t0 * fps)
while f < t1 * fps:
    ok, img = cap.read()
    if not ok: break
    if (f - int(t0 * fps)) % passo == 0:
        t = f / fps
        peq = cv2.resize(img, (W // 3, H // 3)); cinza = cv2.cvtColor(peq, cv2.COLOR_BGR2GRAY)
        hist = cv2.calcHist([cv2.cvtColor(peq, cv2.COLOR_BGR2HSV)], [0, 1], None, [16, 16], [0, 180, 0, 256])
        cv2.normalize(hist, hist)
        if prev is not None and cv2.compareHist(prev, hist, cv2.HISTCMP_CORREL) < 0.6:
            cortes.append(t)
        prev = hist
        rostos = casc.detectMultiScale(cinza, 1.1, 6, minSize=(W // 30, W // 30))
        if len(rostos):
            x, y, w, h = max(rostos, key=lambda r: r[2] * r[3])
            amostras.append((t, (x + w / 2) * 3))
        else:
            amostras.append((t, None))
    f += 1
cortes.append(t1)
planos = []
for a, b in zip(cortes, cortes[1:]):
    xs = [x for t, x in amostras if a <= t < b and x is not None]
    so = [1 for t, x in amostras if a <= t < b]
    cx = statistics.median(xs) if len(xs) >= max(2, len(so) * 0.4) else W / 2
    x0 = int(min(max(cx - cw / 2, 0), W - cw)) // 2 * 2
    planos.append((round(a, 3), round(b, 3), x0, len(xs) > 0))
print(json.dumps(planos))
expr = str(planos[-1][2])
for a, b, x0, _ in reversed(planos[:-1]):
    expr = f"if(lt(t,{b - t0:.3f}),{x0},{expr})"
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(t0), '-i', src, '-t', str(t1 - t0),
                '-vf', f"crop={cw}:{H}:'{expr}':0,scale=1080:1920:flags=lanczos",
                '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '192k', out], check=True)
