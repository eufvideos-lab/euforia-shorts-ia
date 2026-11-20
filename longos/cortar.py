#!/usr/bin/env python3
"""Vídeo longo, etapa 2: corta o bruto seguindo os trechos do plano.json.
Uso: python3 longos/cortar.py PASTA_DO_PEDIDO [indices dos segmentos para refazer...]
- Cada trecho [palavra_inicial, palavra_final] vira um ou mais segmentos de ~8 s.
- O corte cai numa pausa de verdade, achada pelo som (pipeline/emenda.py), nunca no tempo da transcrição: não come
  começo nem final de palavra (19/11/2026). Pedaço de menos de 0,5 s para a máquina (frame solto).
- Zoom alternado (plano aberto / fechado) a cada segmento, para esconder as emendas.
- HDR do iPhone é convertido para SDR; tudo sai em 1920x1080, 30 fps.
Gera segs/NNN.mkv e segmentos.json (com o tempo de cada segmento no vídeo final)."""
import json, os, subprocess, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'pipeline'))
import emenda as EM
from concurrent.futures import ThreadPoolExecutor

pasta = sys.argv[1]
plano = json.load(open(os.path.join(pasta, 'plano.json')))
info = json.load(open(os.path.join(pasta, 'info.json')))
W = json.load(open(os.path.join(pasta, 'transcricao.json')))['words']
bruto = info['arquivo']
# Comando de gravação ("corta", "de novo", "errei") nunca vai para o vídeo (07/11/2026). texto.json vem do preparar.py.
_tx = os.path.join(pasta, 'texto.json')
if os.path.exists(_tx) and '--forcar' not in sys.argv:
    ignorar = set(plano.get('ignorar_comandos', []))
    ruins = [c for c in json.load(open(_tx)).get('comandos', []) if not c.get('duvida') and c['ini'] not in ignorar
             and any(a <= c['ini'] <= b for a, b in plano['trechos'])]
    if ruins:
        raise SystemExit('o plano mantém comando de gravação: ' + '; '.join(
            f'palavra {c["ini"]} "{c["texto"]}" ({c["t"]:.1f}s)' for c in ruins) +
            '. Tire o pedaço errado e o comando do trecho (veja relatorio.md); se for fala de verdade, ponha o índice em '
            '"ignorar_comandos" no plano.')
sys.argv = [a for a in sys.argv if a != '--forcar']
SR = 16000
audio = EM.carregar(bruto, SR)


def fim(j):
    """Fim de verdade da palavra j (pelo som, não pela transcrição): o corte nunca come o final."""
    lim = W[j + 1]['start'] + 0.15 if j + 1 < len(W) else W[j]['end'] + 0.6
    return EM.fim_real(audio, W[j]['end'], min(lim, W[j]['end'] + 0.6), SR)


def ini(j):
    """Começo de verdade da palavra j (pelo som)."""
    lim = W[j - 1]['end'] - 0.15 if j > 0 else W[j]['start'] - 0.5
    return EM.inicio_real(audio, W[j]['start'], max(lim, W[j]['start'] - 0.5, 0.0), SR)


NA = plano.get('modelo') == 'nova-acropole'  # cortes de palestra: imagem antiga, zoom mais leve e sem vinheta
# Podcast (Betânia/BM Cast, Além do CNPJ, 20/11/2026): o bruto já vem com as câmeras trocadas (vMix/multicâmera) e tem
# duas ou mais pessoas na tela. Sem zoom alternado e sem enquadramento pelo rosto (ele pegaria a pessoa errada),
# a não ser que o plano peça ("zoom" ou "enquadramento": "auto").
PODCAST = plano.get('modelo') == 'podcast'
ZOOM = float(plano.get('zoom', 1.15 if NA else 1.0 if PODCAST else 1.22))
CX, CY = plano.get('centro_zoom', [0.5, 0.4])
# Pessoa gravada fora do centro: "centralizar": true faz o plano aberto também cortar em volta dela.
ABERTO = float(plano.get('zoom_aberto', 1.0))
if plano.get('centralizar') and 'zoom_aberto' not in plano:
    ABERTO = min(1.6, max(1.0, 1 / (2 * max(0.05, min(CX, 1 - CX)))))
# Enquadramento automático (Henrique, 07/11/2026): sempre centralizado e perto o bastante, pelo rosto achado no
# bruto (enquadrar.py, roda no preparar). "enquadramento": "manual" no plano mantém centro_zoom/zoom_aberto do plano.
_enq = os.path.join(pasta, 'enquadramento.json')
if not NA and plano.get('enquadramento') != 'manual' and (not PODCAST or plano.get('enquadramento') == 'auto'):
    if not os.path.exists(_enq):
        subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'enquadrar.py'), pasta])
    if os.path.exists(_enq):
        E = json.load(open(_enq))
        CX, CY = E['centro_zoom']
        ABERTO = float(E['zoom_aberto'])
        ZOOM = min(max(ZOOM, ABERTO * 1.15), E.get('teto_zoom', 1.8) * 1.15)
        print(f'enquadramento automático: centro {E["centro_zoom"]}, aberto {ABERTO:.2f}x, fechado {ZOOM:.2f}x', flush=True)
if ABERTO > 1:
    ZOOM = min(max(ZOOM, ABERTO * 1.15), max(ABERTO * 1.15, 1.8))
    print(f'centralizando: plano aberto {ABERTO:.2f}x, fechado {ZOOM:.2f}x', flush=True)
if plano.get('zoom_alternado') is False:  # o plano pede câmera parada (sem o zoom que alterna a cada emenda)
    ZOOM = ABERTO
# Gancho (os primeiros "gancho" trechos do plano, padrão 1): deixa a pessoa respirar, sem corte seco.
GANCHO = int(plano.get('gancho', 1))
trechos = []  # trechos seguidos no bruto viram um só (sem emenda)
for k, (i0, i1) in enumerate(plano['trechos']):
    if trechos and trechos[-1][1] + 1 == i0:
        trechos[-1][1] = i1
    else:
        trechos.append([i0, i1, k < GANCHO])
PAUSA = float(plano.get('pausa_max', 1.0))
segs = []
for i0, i1, gancho in trechos:
    s, e = W[i0]['start'], W[i1]['end']
    ant = W[i0 - 1]['end'] if i0 > 0 else 0.0
    prox = W[i1 + 1]['start'] if i1 + 1 < len(W) else info['duracao']
    s_r, e_r = (ini(i0) if i0 > 0 else max(0.0, s - 0.3)), fim(i1)
    if gancho:  # respiro natural: até ~0,35 s antes e ~0,5 s depois, sem invadir a palavra vizinha
        s2 = max(0.0, min(s_r, s - 0.35) if i0 == 0 else max(min(s_r, s - 0.35), (ant + s_r) / 2))
        e2 = min(info['duracao'], max(e_r, min(e + 0.5, (e_r + prox) / 2)))
    else:
        s2, e2 = s_r, min(info['duracao'], e_r)
    ws = list(range(i0, i1 + 1))
    # pausa longa no meio do trecho (ela mexendo no teleprompter/câmera): tira o silêncio, fica só um respiro.
    # As bordas vêm do som (fim()/ini()), não da transcrição: era aqui que o fim da palavra era comido (18/11).
    blocos, b_ini = [], s2
    for a, b in zip(ws, ws[1:]):
        if W[b]['start'] - W[a]['end'] > PAUSA:
            f_a, i_b = fim(a), ini(b)
            if i_b - f_a > PAUSA:
                blocos.append((b_ini, f_a)); b_ini = i_b
    blocos.append((b_ini, e2))
    for bi, (a0, b0) in enumerate(blocos):
        cortes, ult = [a0], a0
        for a, b in zip(ws, ws[1:]):
            t = (W[a]['end'] + W[b]['start']) / 2
            if a0 < t < b0 and t - ult > 7.5 and b0 - t > 4:
                # emenda interna (só troca o zoom, o áudio é contínuo): mesmo assim no silêncio entre as palavras
                t = EM.ponto(audio, W[a]['end'] - 0.05, W[b]['start'] + 0.05, 'fim', SR)
                if a0 < t < b0:
                    cortes.append(t); ult = t
        cortes.append(b0)
        for n, (a, b) in enumerate(zip(cortes[:-1], cortes[1:])):
            segs.append({'s': round(a, 3), 'e': round(b, 3), 'join': n > 0, 'gancho': bool(gancho)})
# Frame solto (Lorena, NA 0:08): pedaço de menos de 0,5 s entre cortes. Emenda contínua junta no vizinho;
# pedaço solto de verdade para a máquina (o plano tem um trecho curto demais).
limpos = []
for x in segs:
    if x['e'] - x['s'] < 0.5 and x['join'] and limpos:
        limpos[-1]['e'] = x['e']; continue
    limpos.append(x)
segs = limpos
soltos = [x for x in segs if x['e'] - x['s'] < 0.5]
if soltos and '--forcar-curto' not in sys.argv:
    raise SystemExit('pedaço solto de menos de 0,5 s (vira frame solto no vídeo): ' + ', '.join(
        f"{x['s']:.2f}-{x['e']:.2f}s do bruto" for x in soltos) + '. Junte com o trecho vizinho ou tire do plano.')
sys.argv = [a for a in sys.argv if a != '--forcar-curto']
for n, x in enumerate(segs):
    x['zoom'] = ZOOM if n % 2 and ZOOM > ABERTO else ABERTO

# Redução de ruído (ar-condicionado, rua) fica no plano (19/11/2026): antes era feita à mão numa rodada e sumia no
# Ajustar seguinte. "reduzir_ruido": true (normal) ou "forte".
_RR = plano.get('reduzir_ruido')
RUIDO = ('highpass=f=70,lowpass=f=13000,afftdn=nf=-28:tn=1,anlmdn=s=4,' if _RR is True or _RR == 'normal' else
         'highpass=f=80,lowpass=f=12000,afftdn=nf=-22:tn=1,anlmdn=s=7,agate=threshold=0.02:ratio=2:release=150,' if _RR == 'forte' else '')
TM = ("zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,"
      "zscale=t=bt709:m=bt709:r=tv,format=yuv420p,") if info['hdr'] else ''
GRADE = plano.get('cor', "eq=contrast=1.03:saturation=1.03" if NA else "eq=contrast=1.05:saturation=1.05,vignette=PI/6")
os.makedirs(os.path.join(pasta, 'segs'), exist_ok=True)


# Enquadramento trecho a trecho (20/11/2026, revisão: "do nada no 15:42 a pessoa saiu do centro"). O centro geral vem
# da mediana do vídeo todo; se a pessoa se mexeu (mudou de cadeira, câmera esbarrada), aquele trecho ficava torto.
# Aqui cada trecho com zoom confere o rosto em 3 quadros e, se ele cai fora do miolo do recorte, recentra só esse trecho.
def centro_do_trecho(x):
    if NA or plano.get('enquadramento') == 'manual':
        return CX, CY
    try:
        import enquadrar as EQ
        pts = []
        for _, img in EQ.quadros(bruto, info['duracao'], n=3, de=x['s'], ate=x['e']):
            rs = EQ.rostos(img)
            if rs:
                fx, fy, fw, fh = max(rs, key=lambda r: r[2] * r[3]); Hh, Ww = img.shape[:2]
                pts.append(((fx + fw / 2) / Ww, (fy + fh / 2) / Hh))
        if len(pts) < 2:
            return CX, CY
        rx = sorted(p[0] for p in pts)[len(pts) // 2]; ry = sorted(p[1] for p in pts)[len(pts) // 2]
        meia_l = 0.5 / x['zoom']
        # rosto a mais de 40% da meia-largura do recorte para o lado: recentra (mesma altura de olhos do geral)
        if abs(rx - CX) > 0.4 * meia_l or abs(ry - (CY - (0.5 - 0.36) / x['zoom'])) > 0.5 * meia_l:
            ncy = ry + (0.5 - 0.36) / x['zoom']
            print(f"trecho {x['s']:.1f}-{x['e']:.1f}s: pessoa fora do centro (rosto em x={rx:.2f}); recentrado", flush=True)
            return rx, min(0.95, max(0.05, ncy))
    except Exception as e:
        print('enquadramento do trecho não conferido:', e, flush=True)
    return CX, CY


def render(n):
    x = segs[n]; dur = x['e'] - x['s']
    vf = TM + "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,"
    if x['zoom'] > 1:
        cw = int(1920 / x['zoom']) // 2 * 2; ch = int(1080 / x['zoom']) // 2 * 2
        CXt, CYt = centro_do_trecho(x)
        cx = min(max(int(CXt * 1920 - cw / 2), 0), 1920 - cw); cy = min(max(int(CYt * 1080 - ch / 2), 0), 1080 - ch)
        vf += f"crop={cw}:{ch}:{cx}:{cy},scale=1920:1080:flags=lanczos,"
    vf += GRADE + ',fps=30,format=yuv420p'
    prox = segs[n + 1]['join'] if n + 1 < len(segs) else False
    af = []
    if not x['join']:
        af.append('afade=t=in:st=0:d=0.02')
    if not prox:
        af.append(f'afade=t=out:st={dur - 0.04:.3f}:d=0.04')
    cmd = ['ffmpeg', '-v', 'error', '-y', '-ss', f"{x['s']:.3f}", '-i', bruto, '-t', f'{dur:.3f}', '-vf', vf,
           '-af', RUIDO + (','.join(af) or 'anull') + ',aresample=48000,aformat=channel_layouts=stereo',
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
