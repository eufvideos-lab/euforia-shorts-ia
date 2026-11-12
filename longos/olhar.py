#!/usr/bin/env python3
"""Vídeo longo, etapa 2b (05/11/2026): acha os trechos em que a pessoa NÃO olha para a câmera (lendo teleprompter,
olhando para baixo ou para o lado). Regra do Flau: rosto só aparece quando a pessoa olha para a câmera; o resto
fica coberto por B-roll, foto ou cartão. montar.py para se algum trecho desses ficar descoberto.
Uso: python3 longos/olhar.py PASTA_DO_PEDIDO   (depois de cortar.py; lê segmentos.json e o bruto)
Gera olhar.json: {"trechos": [{"ini": s, "fim": s, "palavra": i, "ate_palavra": j, "texto": "..."}], ...}
(tempos no vídeo FINAL; "palavra" é o índice para pôr o B-roll e "dur" quanto ele precisa durar).
Precisa de mediapipe e libegl1 (instalar.sh instala)."""
import json, os, subprocess, sys
import numpy as np

pasta = sys.argv[1]
info = json.load(open(os.path.join(pasta, 'info.json')))
segs = json.load(open(os.path.join(pasta, 'segmentos.json')))
W = json.load(open(os.path.join(pasta, 'transcricao.json')))['words']
plano = json.load(open(os.path.join(pasta, 'plano.json')))
MODELO = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'modelos', 'olhar', 'face_landmarker.task')
FPS = 4  # quadros analisados por segundo
# calibrado no bruto da Regina (05/11): olhando para a câmera dá baixo < 0,3 e cabeça reta ou para cima; lendo o
# teleprompter dá baixo > 0,5 com a cabeça inclinada para baixo (pitch negativo).
LIMITE = float(plano.get('olhar_limite', 0.6))
MIN_DUR, JUNTA = 0.8, 0.7  # trecho menor que isso não conta; buracos menores que JUNTA viram um trecho só

from mediapipe.tasks.python import vision, BaseOptions
import mediapipe as mp
det = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=MODELO), output_face_blendshapes=True,
    output_facial_transformation_matrixes=True, num_faces=1, running_mode=vision.RunningMode.IMAGE))

LW, LH = 640, 360


def quadros(s, e):
    cmd = ['ffmpeg', '-v', 'error', '-ss', f'{s:.3f}', '-i', info['arquivo'], '-t', f'{e - s:.3f}',
           '-vf', f'fps={FPS},scale={LW}:{LH}:force_original_aspect_ratio=increase,crop={LW}:{LH}', '-f', 'rawvideo',
           '-pix_fmt', 'rgb24', '-']
    raw = subprocess.run(cmd, capture_output=True).stdout
    n = len(raw) // (LW * LH * 3)
    return np.frombuffer(raw[:n * LW * LH * 3], np.uint8).reshape(n, LH, LW, 3)


def medir(img):
    """(baixo, lado, pitch): olhar para baixo (0 a 1), para o lado (0 a 1) e inclinação da cabeça (graus, negativo = cabeça para baixo)."""
    r = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(img)))
    if not r.face_blendshapes:
        return None
    b = {c.category_name: c.score for c in r.face_blendshapes[0]}
    baixo = (b.get('eyeLookDownLeft', 0) + b.get('eyeLookDownRight', 0)) / 2
    lado = max((b.get('eyeLookOutLeft', 0) + b.get('eyeLookInRight', 0)) / 2, (b.get('eyeLookInLeft', 0) + b.get('eyeLookOutRight', 0)) / 2)
    m = np.array(r.facial_transformation_matrixes[0])
    pitch = float(np.degrees(np.arctan2(-m[1, 2], m[2, 2])))  # negativo = cabeça para baixo
    return baixo, lado, pitch


amostras = []  # (tempo no final, baixo, lado, pitch) ou None
for x in segs:
    fr = quadros(x['s'], x['e'])
    for k, img in enumerate(fr):
        t = x['saida'] + k / FPS
        if t > x['saida'] + x['dur']:
            break
        amostras.append((t, medir(img)))
det.close()

com = [a for t, a in amostras if a]
if not com:
    raise SystemExit('nenhum rosto achado: confira o bruto')
base_pitch = float(np.median([a[2] for a in com]))
fora = []
for t, a in amostras:
    fora.append(bool(a) and (a[0] >= LIMITE or (a[0] >= LIMITE - 0.12 and a[2] < -4) or a[1] > 0.6))

# junta os quadros "fora" em trechos no tempo final
trechos, ini = [], None
for (t, _), f in zip(amostras, fora):
    if f and ini is None:
        ini = t
    if not f and ini is not None:
        trechos.append([ini, t]); ini = None
if ini is not None:
    trechos.append([ini, amostras[-1][0] + 1 / FPS])
junt = []
for a, b in trechos:
    if junt and a - junt[-1][1] < JUNTA:
        junt[-1][1] = b
    else:
        junt.append([a, b])
junt = [[round(a - 0.15, 2), round(b + 0.15, 2)] for a, b in junt if b - a >= MIN_DUR]


def palavra_em(t):
    """Índice da palavra falada no tempo t do vídeo final (a primeira que começa a partir de t)."""
    for x in segs:
        if x['saida'] <= t < x['saida'] + x['dur']:
            tb = x['s'] + (t - x['saida'])
            for i, w in enumerate(W):
                if w['start'] >= tb - 0.05:
                    return i
    return None


out = []
for a, b in junt:
    i, j = palavra_em(a), palavra_em(max(a, b - 0.3))
    out.append({'ini': a, 'fim': b, 'dur': round(b - a, 2), 'palavra': i, 'ate_palavra': j,
                'texto': ' '.join(w['word'] for w in W[i:(j or i) + 1])[:160] if i is not None else ''})
tot = sum(x['dur'] for x in out)
final = segs[-1]['saida'] + segs[-1]['dur']
json.dump({'limite': LIMITE, 'fps': FPS, 'trechos': out, 'segundos_fora': round(tot, 1), 'duracao': round(final, 1),
           'amostras': [[round(t, 2)] + ([round(v, 3) for v in a] if a else []) for t, a in amostras]},
          open(os.path.join(pasta, 'olhar.json'), 'w'))
print(f'OK: {len(out)} trechos sem olhar para a câmera ({tot:.0f}s de {final:.0f}s). Cada um precisa de B-roll, foto ou cartão:')
for x in out:
    print(f"  {x['ini']:7.1f}s +{x['dur']:.1f}s  palavra {x['palavra']}: {x['texto'][:70]}")
