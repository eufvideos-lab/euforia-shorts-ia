#!/usr/bin/env python3
"""Vídeo longo, etapa 2: corta o bruto seguindo os trechos do plano.json.
Uso: python3 longos/cortar.py PASTA_DO_PEDIDO [indices dos segmentos para refazer...]
- Cada trecho [palavra_inicial, palavra_final] vira um ou mais segmentos de ~8 s.
- O corte cai no ponto mais silencioso perto da palavra (nunca come final de palavra; melhor sobrar um pouco).
- Zoom alternado (plano aberto / fechado) a cada segmento, para esconder as emendas.
- HDR do iPhone é convertido para SDR; tudo sai em 1920x1080, 30 fps.
Gera segs/NNN.mkv e segmentos.json (com o tempo de cada segmento no vídeo final)."""
import json, os, subprocess, sys
import numpy as np
from concurrent.futures import ThreadPoolExecutor

pasta = sys.argv[1]
plano = json.load(open(os.path.join(pasta, 'plano.json')))
info = json.load(open(os.path.join(pasta, 'info.json')))
W = json.load(open(os.path.join(pasta, 'transcricao.json')))['words']
bruto = info['arquivo']
SR = 8000
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', bruto, '-vn', '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'],
                     capture_output=True).stdout
audio = np.frombuffer(raw, np.int16).astype(np.float32)
janela = int(0.02 * SR)
env = np.sqrt(np.convolve(audio ** 2, np.ones(janela) / janela, 'same'))


def silencio(a, b):
    """Instante mais silencioso entre a e b (s)."""
    a = max(0, int(a * SR)); b = max(a + 1, min(len(env), int(b * SR)))
    return (a + int(np.argmin(env[a:b]))) / SR


NA = plano.get('modelo') == 'nova-acropole'  # cortes de palestra: imagem antiga, zoom mais leve e sem vinheta
ZOOM = float(plano.get('zoom', 1.15 if NA else 1.22))
CX, CY = plano.get('centro_zoom', [0.5, 0.4])
# Pessoa gravada fora do centro: "centralizar": true faz o plano aberto também cortar em volta dela.
ABERTO = float(plano.get('zoom_aberto', 1.0))
if plano.get('centralizar') and 'zoom_aberto' not in plano:
    ABERTO = min(1.6, max(1.0, 1 / (2 * max(0.05, min(CX, 1 - CX)))))
if ABERTO > 1:
    ZOOM = min(max(ZOOM, ABERTO * 1.15), max(ABERTO, 1.8))
    print(f'centralizando: plano aberto {ABERTO:.2f}x, fechado {ZOOM:.2f}x', flush=True)
# Gancho (os primeiros "gancho" trechos do plano, padrão 1): deixa a pessoa respirar, sem corte seco.
GANCHO = int(plano.get('gancho', 1))
trechos = []  # trechos seguidos no bruto viram um só (sem emenda)
for k, (i0, i1) in enumerate(plano['trechos']):
    if trechos and trechos[-1][1] + 1 == i0:
        trechos[-1][1] = i1
    else:
        trechos.append([i0, i1, k < GANCHO])
segs = []
for i0, i1, gancho in trechos:
    s, e = W[i0]['start'], W[i1]['end']
    ant = W[i0 - 1]['end'] if i0 > 0 else 0.0
    prox = W[i1 + 1]['start'] if i1 + 1 < len(W) else info['duracao']
    if gancho:  # respiro natural: até ~0,35 s antes e ~0,5 s depois, sem invadir a palavra vizinha
        s2 = max(0.0, s - 0.35, (ant + s) / 2 if i0 > 0 else 0.0)
        e2 = min(info['duracao'], e + 0.5, (e + prox) / 2)
    else:
        s2 = silencio(max(ant, s - 0.25), s - 0.02)
        e2 = silencio(e + 0.03, min(prox, e + 0.30))
    ws = W[i0:i1 + 1]
    cortes, ult = [s2], s2
    for j in range(len(ws) - 1):
        t = (ws[j]['end'] + ws[j + 1]['start']) / 2
        if t - ult > 7.5 and e2 - t > 4:
            cortes.append(t); ult = t
    cortes.append(e2)
    for n, (a, b) in enumerate(zip(cortes[:-1], cortes[1:])):
        segs.append({'s': round(a, 3), 'e': round(b, 3), 'join': n > 0})
for n, x in enumerate(segs):
    x['zoom'] = ZOOM if n % 2 else ABERTO

TM = ("zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,"
      "zscale=t=bt709:m=bt709:r=tv,format=yuv420p,") if info['hdr'] else ''
GRADE = plano.get('cor', "eq=contrast=1.03:saturation=1.03" if NA else "eq=contrast=1.05:saturation=1.05,vignette=PI/6")
os.makedirs(os.path.join(pasta, 'segs'), exist_ok=True)


def render(n):
    x = segs[n]; dur = x['e'] - x['s']
    vf = TM + "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,"
    if x['zoom'] > 1:
        cw = int(1920 / x['zoom']) // 2 * 2; ch = int(1080 / x['zoom']) // 2 * 2
        cx = min(max(int(CX * 1920 - cw / 2), 0), 1920 - cw); cy = min(max(int(CY * 1080 - ch / 2), 0), 1080 - ch)
        vf += f"crop={cw}:{ch}:{cx}:{cy},scale=1920:1080:flags=lanczos,"
    vf += GRADE + ',fps=30,format=yuv420p'
    prox = segs[n + 1]['join'] if n + 1 < len(segs) else False
    af = []
    if not x['join']:
        af.append('afade=t=in:st=0:d=0.02')
    if not prox:
        af.append(f'afade=t=out:st={dur - 0.04:.3f}:d=0.04')
    cmd = ['ffmpeg', '-v', 'error', '-y', '-ss', f"{x['s']:.3f}", '-i', bruto, '-t', f'{dur:.3f}', '-vf', vf,
           '-af', (','.join(af) or 'anull') + ',aresample=48000,aformat=channel_layouts=stereo',
           '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'pcm_s16le', os.path.join(pasta, 'segs', f'{n:03d}.mkv')]
    r = subprocess.run(cmd, capture_output=True, text=True)
    return None if r.returncode == 0 else f'segmento {n}: {r.stderr[-300:]}'


so = [int(a) for a in sys.argv[2:]] or range(len(segs))
with ThreadPoolExecutor(max(1, (os.cpu_count() or 2) // 2)) as ex:
    erros = [m for m in ex.map(render, so) if m]
if erros:
    raise SystemExit('\n'.join(erros))
t = 0.0
for n, x in enumerate(segs):
    d = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0',
                              os.path.join(pasta, 'segs', f'{n:03d}.mkv')], capture_output=True, text=True).stdout)
    x['saida'] = round(t, 3); x['dur'] = round(d, 3); t += d
json.dump(segs, open(os.path.join(pasta, 'segmentos.json'), 'w'), indent=0)
print(f'OK: {len(segs)} segmentos, vídeo cortado com {t / 60:.1f} min')
