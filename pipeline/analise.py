"""Análise do vídeo de origem: planos (cortes de cena), rosto do falante e B-rolls já existentes."""
import statistics, subprocess
import numpy as np


def sonda(video):
    import json
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                        'stream=width,height,r_frame_rate:format=duration', '-of', 'json', video],
                       capture_output=True, text=True)
    d = json.loads(r.stdout)
    s = d['streams'][0]
    n, m = s['r_frame_rate'].split('/')
    return int(s['width']), int(s['height']), float(n) / float(m), float(d['format']['duration'])


def analisar_planos(video, t0=0.0, t1=None, amostras_por_s=4):
    """Divide o vídeo em planos e acha o rosto em cada um.
    Devolve [{ini, fim, tipo: 'falante'|'broll', x_centro}] com tempos em segundos.
    'falante' = plano com o mesmo rosto que aparece na maior parte do vídeo (o cliente);
    'broll' = qualquer outro plano (imagem de apoio que a equipe já colocou)."""
    import cv2
    cap = cv2.VideoCapture(video)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    W, H = int(cap.get(3)), int(cap.get(4))
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    t1 = t1 or n / fps
    casc = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    passo = max(1, int(round(fps / amostras_por_s)))
    amostras, prev, cortes = [], None, [t0]
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(t0 * fps))
    f = int(t0 * fps)
    esc = 3 if W >= 1280 else 2
    while f < t1 * fps:
        ok = cap.grab()
        if not ok:
            break
        if (f - int(t0 * fps)) % passo == 0:
            ok, img = cap.retrieve()
            if not ok:
                break
            t = f / fps
            peq = cv2.resize(img, (W // esc, H // esc))
            hist = cv2.calcHist([cv2.cvtColor(peq, cv2.COLOR_BGR2HSV)], [0, 1], None, [16, 16], [0, 180, 0, 256])
            cv2.normalize(hist, hist)
            if prev is not None and cv2.compareHist(prev, hist, cv2.HISTCMP_CORREL) < 0.6:
                cortes.append(t)
            prev = hist
            cinza = cv2.cvtColor(peq, cv2.COLOR_BGR2GRAY)
            rostos = casc.detectMultiScale(cinza, 1.1, 6, minSize=(W // (25 * esc), W // (25 * esc)))
            if len(rostos):
                x, y, w, h = max(rostos, key=lambda r: r[2] * r[3])
                amostras.append((t, (x + w / 2) * esc, w * esc))
            else:
                amostras.append((t, None, None))
        f += 1
    cap.release()
    cortes.append(t1)
    # junta cortes muito próximos (transições)
    limpos = [cortes[0]]
    for c in cortes[1:]:
        if c - limpos[-1] >= 0.4 or c == cortes[-1]:
            limpos.append(c)
    # rosto "de referência" = mediana de todas as detecções (o falante aparece a maior parte do tempo)
    xs_all = [x for _, x, _ in amostras if x is not None]
    ws_all = [w for _, _, w in amostras if w is not None]
    ref_x = statistics.median(xs_all) if xs_all else W / 2
    ref_w = statistics.median(ws_all) if ws_all else W / 8
    planos = []
    for a, b in zip(limpos, limpos[1:]):
        am = [(x, w) for t, x, w in amostras if a <= t < b]
        com = [(x, w) for x, w in am if x is not None]
        tipo, cx, rw = 'broll', W / 2, 0
        if am and len(com) >= max(1, 0.4 * len(am)):
            mx = statistics.median([x for x, _ in com]); mw = statistics.median([w for _, w in com]); rw = mw
            if abs(mx - ref_x) < 0.15 * W and 0.6 * ref_w < mw < 1.6 * ref_w:
                tipo, cx = 'falante', mx
            else:
                cx = mx
        planos.append({'ini': round(a, 3), 'fim': round(b, 3), 'tipo': tipo, 'x_centro': round(cx, 1),
                       'rosto_w': round(rw / W, 3)})
    # planos curtíssimos herdam o tipo do vizinho
    for i, p in enumerate(planos):
        if p['fim'] - p['ini'] < 0.5 and i > 0:
            p['tipo'] = planos[i - 1]['tipo']; p['x_centro'] = planos[i - 1]['x_centro']
    return {'largura': W, 'altura': H, 'fps': fps, 'planos': planos}


def tem_trilha(audio_path):
    """True se o áudio tem música/fundo contínuo (piso de ruído alto)."""
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', audio_path, '-f', 's16le', '-ac', '1', '-ar', '16000', '-'],
                         capture_output=True).stdout
    x = np.frombuffer(raw, np.int16).astype(float)
    if len(x) < 16000:
        return False
    w = x[:len(x) // 1600 * 1600].reshape(-1, 1600)
    r = 20 * np.log10(np.sqrt((w ** 2).mean(1)) + 1e-9)
    return float(np.percentile(r, 5)) > 42


def recortar_vertical(video, saida, info, t0=0.0, t1=None):
    """Recorta 9:16 com o rosto do falante no centro (plano a plano). Vídeo já vertical: só redimensiona."""
    W, H = info['largura'], info['altura']
    if H >= W:
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', video, '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
                        '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '192k', saida], check=True)
        return
    cw = int(round(H * 9 / 16 / 2) * 2)
    planos = info['planos']
    def x0(p):
        return int(min(max(p['x_centro'] - cw / 2, 0), W - cw)) // 2 * 2
    expr = str(x0(planos[-1]))
    for p in reversed(planos[:-1]):
        expr = f"if(lt(t,{p['fim'] - t0:.3f}),{x0(p)},{expr})"
    args = ['ffmpeg', '-v', 'error', '-y', '-ss', str(t0), '-i', video]
    if t1:
        args += ['-t', str(t1 - t0)]
    args += ['-vf', f"crop={cw}:{H}:'{expr}':0,scale=1080:1920:flags=lanczos",
             '-c:v', 'libx264', '-crf', '19', '-preset', 'superfast', '-threads', '0', '-c:a', 'aac', '-b:a', '192k', saida]
    subprocess.run(args, check=True)


def clipe_encaixado(video, ini, fim, saida):
    """B-roll horizontal inteiro no meio da tela vertical, com o próprio vídeo desfocado atrás."""
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{ini:.3f}', '-i', video, '-t', f'{fim - ini:.3f}', '-filter_complex',
                    '[0:v]split[a][b];[a]scale=-2:1920,crop=1080:1920,boxblur=30:3,eq=brightness=-0.06[bg];[b]scale=1080:-2[fg];[bg][fg]overlay=0:(H-h)/2',
                    '-an', '-c:v', 'libx264', '-crf', '19', '-preset', 'veryfast', saida], check=True)


def clipe_vertical_cobrir(video, saida, dur=None):
    """Vídeo de banco (horizontal) cortado para preencher a tela vertical."""
    args = ['ffmpeg', '-v', 'error', '-y', '-i', video]
    if dur:
        args += ['-t', f'{dur:.3f}']
    args += ['-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30', '-an',
             '-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', saida]
    subprocess.run(args, check=True)


def clipe_broll_fonte(video, plano, ini, fim, saida, info):
    """B-roll que já está no vídeo: close (rosto grande) preenche a tela centrado no rosto;
    plano aberto (várias pessoas, paisagem) entra inteiro com fundo desfocado."""
    W, H = info['largura'], info['altura']
    if H >= W or plano.get('rosto_w', 0) >= 0.12:
        cw = int(round(H * 9 / 16 / 2) * 2)
        x0 = int(min(max(plano['x_centro'] - cw / 2, 0), W - cw)) // 2 * 2 if W > H else 0
        vf = f'crop={cw}:{H}:{x0}:0,scale=1080:1920' if W > H else 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{ini:.3f}', '-i', video, '-t', f'{fim - ini:.3f}', '-vf', vf,
                        '-an', '-c:v', 'libx264', '-crf', '19', '-preset', 'superfast', saida], check=True)
    else:
        clipe_encaixado(video, ini, fim, saida)
