#!/usr/bin/env python3
"""Vídeo longo, etapa 4: gera os grafismos na paleta do cliente e monta o vídeo final.
Uso: python3 longos/montar.py PASTA_DO_PEDIDO [--sem-gfx] [--previa]
Lê plano.json, segmentos.json (de cortar.py) e broll/ (de brolls.py). Gera final.mp4.
"modelo": "nova-acropole" (cortes de palestra): legenda amarela o vídeo todo, marca d'água da NA (Instagram + logo)
cartões brancos de citação (aspas, foto redonda e nome do autor) e de frase-chave, e o encerramento da Acrópole Play
no fim; sem textos-chave, lowers, trilha nem tela final.
--sem-gfx reaproveita os grafismos já gerados; --previa renderiza só os primeiros 90 s, rápido, para conferir."""
import json, os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'pipeline'))
import gfx as G

pasta = sys.argv[1]
plano = json.load(open(os.path.join(pasta, 'plano.json')))
segs = json.load(open(os.path.join(pasta, 'segmentos.json')))
W = json.load(open(os.path.join(pasta, 'transcricao.json')))['words']
O = os.path.join(pasta, 'gfx'); G.configurar(O, plano.get('paleta'))
B = os.path.join(pasta, 'broll')
TOTAL = segs[-1]['saida'] + segs[-1]['dur']
KWD, END = 2.8, 8.0
NA = plano.get('modelo') == 'nova-acropole'
MODELOS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'modelos')
ENCERRAMENTO_NA = '1aGYR5P_zELGIDjghjC1JGL4be6h2F15S'  # ACROPOLEPLAY.mov: anúncio da Acrópole Play + cartão final da NA


def t_saida(idx):
    """Tempo no vídeo final em que a palavra idx começa (a palavra precisa estar num trecho mantido)."""
    t = W[idx]['start']
    for x in segs:
        if x['s'] - 0.05 <= t < x['e'] + 0.05:
            return x['saida'] + max(0.0, t - x['s'])
    raise SystemExit(f'palavra {idx} ("{W[idx]["word"]}") não está em nenhum trecho mantido')


def dur(f):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f],
                                capture_output=True, text=True).stdout)


def baixar_foto(ref, nome):
    """{"arquivo": caminho} ou {"file_ids": [...]} (partes salvas no Drive pelo fluxo de fotos do n8n)."""
    if isinstance(ref, str):
        ref = {'arquivo': ref}
    if ref.get('arquivo'):
        return ref['arquivo']
    arq = os.path.join(O, f'{nome}.img')
    if not os.path.exists(arq):
        import ponte
        with open(arq, 'wb') as f:
            for fid in ref['file_ids']:
                ponte.baixar(fid, arq + '.p'); f.write(open(arq + '.p', 'rb').read()); os.remove(arq + '.p')
    return arq


def cartoes_na():
    """Cartões do modelo NA: [(arquivo, início, duração, kw do gfx.citacao)]. As palavras do texto surgem
    acompanhando a fala de "inicio" a "fim" (índices de palavras da transcrição)."""
    out = []
    for k, c in enumerate(plano.get('cartoes', [])):
        tempos = [t_saida(i) for i in range(c['inicio'], c['fim'] + 1)
                  if any(x['s'] - 0.05 <= W[i]['start'] < x['e'] + 0.05 for x in segs)]
        t0 = tempos[0] - 0.35; fim = t_saida(c['fim']) + (W[c['fim']]['end'] - W[c['fim']]['start'])
        d = fim - t0 + c.get('folga', 1.6)
        txt = c['texto'].split()
        tw = [tempos[min(len(tempos) - 1, int(j * len(tempos) / len(txt)))] - t0 for j in range(len(txt))]
        foto = baixar_foto(c['foto'], f'autor{k}') if c.get('foto') else None
        out.append((f'{O}/c{k}.mp4', t0, d, dict(texto=c['texto'], tempos=tw, autor=c.get('autor'), foto=foto,
                                                  destaque=c.get('destaque'))))
    return out


tit = plano.get('titulo'); mapa = plano.get('mapa')
CNA = cartoes_na() if NA else []
if '--sem-gfx' not in sys.argv and NA:
    for k, (arq, t0, d, kw) in enumerate(CNA):
        G.citacao(f'c{k}', dur=d, **kw)
if '--sem-gfx' not in sys.argv and not NA:
    for k, kw in enumerate(plano.get('keywords', [])):
        G.keyword(f'kw{k}', kw['texto'], KWD)
    if tit:
        G.card('titulo', tit['linhas'], tit.get('dur', 5.0), sub=tit.get('sub'), big=True)
    for k, c in enumerate(plano.get('cartoes', [])):
        G.card(f'c{k}', c['linhas'], c.get('dur', 5.0), sub=c.get('sub'))
    if mapa:
        ts = [t_saida(c['palavra']) for c in mapa['cidades']]; t0 = ts[0] - 0.35
        G.route('mapa', [c['nome'] for c in mapa['cidades']], [x - t0 for x in ts], ts[-1] - t0 + 1.8, mapa.get('titulo', ''))
    G.endscreen('fim', END)
    G.lower('lw_inscreva', 'INSCREVA-SE NO CANAL', 4.0, 'play')
    G.lower('lw_like', 'DÊ LIKE  •  COMPARTILHE  •  COMENTE', 4.5, 'heart')
    if plano.get('nome'):
        G.lower('lw_nome', plano['nome'].upper(), 4.5)

EV = []  # (camada, arquivo, início no vídeo final, duração)
for br in plano.get('brolls', []):
    f = next((os.path.join(B, f"{br['id']}.{e}") for e in ('mp4', 'jpg') if os.path.exists(os.path.join(B, f"{br['id']}.{e}"))), None)
    if f:
        EV.append(('broll', f, t_saida(br['palavra']) - 0.1, br.get('dur', 3.0)))
    else:
        print('sem B-roll', br['id'])
if tit:
    EV.append(('full', f'{O}/titulo.mp4', t_saida(tit['palavra']) - 0.05, tit.get('dur', 5.0)))
for k, c in enumerate([] if NA else plano.get('cartoes', [])):
    EV.append(('full', f'{O}/c{k}.mp4', t_saida(c['palavra']) - 0.05, c.get('dur', 5.0)))
for arq, t0, d, kw in CNA:
    EV.append(('full', arq, t0, d))
if mapa:
    EV.append(('full', f'{O}/mapa.mp4', t_saida(mapa['cidades'][0]['palavra']) - 0.35, dur(f'{O}/mapa.mp4')))
for k, kw in enumerate(plano.get('keywords', [])):
    EV.append(('kw', f'{O}/kw{k}.mov', t_saida(kw['palavra']) - 0.1, KWD))
for lw in plano.get('lowers', []):
    nome = {'inscreva': 'lw_inscreva', 'like': 'lw_like', 'nome': 'lw_nome'}[lw['tipo']]
    EV.append(('lw', f'{O}/{nome}.mov', t_saida(lw['palavra']), 4.5 if lw['tipo'] != 'inscreva' else 4.0))

avisos = []
tela = sorted([e for e in EV if e[0] in ('broll', 'full')], key=lambda e: e[2])
for a, b in zip(tela, tela[1:]):
    if a[2] + a[3] > b[2]:
        avisos.append(f'tela cheia sobreposta: {os.path.basename(a[1])} e {os.path.basename(b[1])}')
baixo = sorted([e for e in EV if e[0] in ('kw', 'lw')], key=lambda e: e[2])
for a, b in zip(baixo, baixo[1:]):
    if a[2] + a[3] > b[2]:
        avisos.append(f'textos de baixo sobrepostos: {os.path.basename(a[1])} e {os.path.basename(b[1])}')
for m in avisos:
    print('AVISO', m)
if avisos and '--forcar' not in sys.argv:
    raise SystemExit('corrija o plano (mude a palavra ou a duração) e rode de novo, ou use --forcar')



def legendas_na(arq):
    """Legenda da NA: amarela e fixa (sem efeito palavra a palavra, pedido do Flau 24/10), com maiúsculas e a
    pontuação da fala (vírgula, ponto, reticências, ? e !), quebrada em frases curtas de uma linha. Some durante os
    cartões de tela cheia."""
    from montar_short import norm
    texto = json.load(open(os.path.join(pasta, 'transcricao.json'))).get('text', '')
    # casa as palavras do Whisper (sem pontuação) com o texto corrido; "colocá-las" vem como "colocá" + "las"
    tokens, j, P = texto.split(), 0, []
    k = 0
    while k < len(W):
        alvo, txt, usa = norm(W[k]['word']), W[k]['word'], 1
        for m in range(j, min(j + 4, len(tokens))):
            nt = norm(tokens[m])
            if nt == alvo:
                txt, j = tokens[m], m + 1; break
            if k + 1 < len(W) and nt == alvo + norm(W[k + 1]['word']):
                txt, j, usa = tokens[m], m + 1, 2; break
        P.append({'t': txt})
        if usa == 2:
            P.append({'t': ''}); k += 1
        k += 1
    cheio = [(t0, t0 + d) for k, f, t0, d in EV if k == 'full']
    def ts(t):
        t = max(0.0, t); return f'{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}'
    blocos, atual = [], []
    for w, p in zip(W, P):
        x = next((x for x in segs if x['s'] - 0.05 <= w['start'] < x['e'] + 0.05), None)
        txt = p['t'].strip()
        if not x or not txt:
            continue
        a = x['saida'] + max(0.0, w['start'] - x['s']); b = x['saida'] + min(x['dur'], max(0.05, w['end'] - x['s']))
        n = len(' '.join(q[2] for q in atual))
        if atual and (n + len(txt) > 40 or a - atual[-1][1] > 0.6 or atual[-1][2].endswith(('.', '?', '!', '…'))
                      or (n > 20 and atual[-1][2].endswith((',', ';', ':')))):
            blocos.append(atual); atual = []
        atual.append((a, b, txt))
    if atual:
        blocos.append(atual)
    linhas = []
    for k, bl in enumerate(blocos):
        fim = bl[-1][1] + 0.25
        if k + 1 < len(blocos):
            fim = min(fim, blocos[k + 1][0][0])
        if any(c0 - 0.1 < fim and bl[0][0] < c1 + 0.1 for c0, c1 in cheio):
            continue
        linhas.append(f"Dialogue: 0,{ts(bl[0][0])},{ts(fim)},NA,,0,0,0,,{' '.join(p for _, _, p in bl)}")
    open(arq, 'w').write('\n'.join([
        '[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 1920', 'PlayResY: 1080', 'WrapStyle: 2', '', '[V4+ Styles]',
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, '
        'Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, '
        'MarginR, MarginV, Encoding',
        'Style: NA,Inter Display,56,&H001FD2FF,&H001FD2FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,2,80,80,150,1',
        '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'] + linhas) + '\n')
    return len(blocos)


order = {'broll': 0, 'full': 1, 'kw': 2, 'lw': 3}; EV.sort(key=lambda e: (order[e[0]], e[2]))
previa = '--previa' in sys.argv
LIM = 90.0 if previa else TOTAL
if previa:
    EV = [e for e in EV if e[2] < LIM]
lista = os.path.join(pasta, 'lista.txt')
open(lista, 'w').write(''.join(f"file '{os.path.abspath(os.path.join(pasta, 'segs', f'{i:03d}.mkv'))}'\n" for i in range(len(segs))))
cmd = ['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lista]
for kind, f, t0, d in EV:
    img = f.endswith('.jpg')
    cmd += (['-loop', '1', '-framerate', '30'] if img else ['-stream_loop', '-1'] if kind == 'broll' else []) + ['-t', f'{d:.3f}', '-i', f]
if NA:
    fim_arq = os.path.join(pasta, 'encerramento.mov')
    if not os.path.exists(fim_arq):
        import ponte; ponte.baixar(plano.get('encerramento_file_id', ENCERRAMENTO_NA), fim_arq)
    END = dur(fim_arq)
    cmd += ['-i', fim_arq, '-loop', '1', '-framerate', '30', '-i', os.path.join(MODELOS, 'nova-acropole', 'marca.png')]
    ass = os.path.abspath(os.path.join(pasta, 'legendas.ass'))
    print(f'{legendas_na(ass)} legendas', flush=True)
else:
    cmd += ['-i', f'{O}/fim.mp4']
mus = os.path.join(pasta, 'musica.aac')
if not os.path.exists(mus) and plano.get('musica_file_id'):
    try:
        import ponte; ponte.baixar(plano['musica_file_id'], mus)
    except Exception as e:
        print('sem trilha:', e)
tem_mus = os.path.exists(mus)
if tem_mus:
    cmd += ['-stream_loop', '-1', '-i', mus]
fc = []; last = '[0:v]'
for k, (kind, f, t0, d) in enumerate(EV, 1):
    if kind == 'broll':
        pre = (f"scale=2112:1188:force_original_aspect_ratio=increase,crop=2112:1188,"
               f"crop=1920:1080:x='96*t/{d:.3f}':y='54*t/{d:.3f}',eq=contrast=1.04:saturation=1.05,"); fd = 0.18
    elif kind == 'full':
        pre = ''; fd = 0.15
    else:
        pre = ''; fd = 0
    fade = (f"fade=t=in:st=0:d={fd}:alpha=1,fade=t=out:st={d - fd:.3f}:d={fd}:alpha=1," if fd else '')
    fc.append(f"[{k}:v]{pre}fps=30,setsar=1,format=yuva420p,{fade}setpts=PTS-STARTPTS+{t0:.3f}/TB[g{k}]")
    y = {'kw': '660', 'lw': '840'}.get(kind, '0')
    fc.append(f"{last}[g{k}]overlay=x=0:y={y}:enable='between(t,{t0:.3f},{t0 + d:.3f})':eof_action=pass[v{k}]")
    last = f'[v{k}]'
n = len(EV) + 1
if NA:  # marca d'água por cima de tudo (B-roll também), legenda amarela, depois o encerramento da Acrópole Play
    fora = '*'.join(f'not(between(t,{t0:.3f},{t0 + d:.3f}))' for k, f, t0, d in EV if k == 'full') or '1'
    fc.append(f"{last}[{n + 1}:v]overlay=0:0:shortest=1:enable='{fora}',subtitles=filename='{ass}':fontsdir='{G.F}'[vna]")
    last = '[vna]'
    fc.append(f"[{n}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,"
              f"fps=30,format=yuv420p,setsar=1[endv]")
    fc.append(f"[{n}:a]aresample=48000,aformat=channel_layouts=stereo[enda]")
    n += 1  # a trilha (se houver) vem depois da marca
else:
    fc.append(f"[{n}:v]fps=30,format=yuv420p,setsar=1,fade=t=in:st=0:d=0.4[endv]")
    fc.append(f"anullsrc=r=48000:cl=stereo,atrim=0:{END}[enda]")
fc.append("[0:a]highpass=f=70,acompressor=threshold=-20dB:ratio=3:attack=10:release=150:makeup=2,"
          "aformat=channel_layouts=stereo:sample_rates=48000[aa]")
fc.append(f"{last}fps=30,format=yuv420p,setsar=1[vm]")
fc.append("[vm][aa][endv][enda]concat=n=2:v=1:a=1[vo][voz]")
L = TOTAL + END
if tem_mus:
    vol = plano.get('volume_trilha_db', -31)
    fc.append("[voz]asplit=2[voz1][voz2]")
    fc.append(f"[{n + 1}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:{L:.3f},volume={vol}dB,"
              f"afade=t=in:st=0:d=1.5,afade=t=out:st={L - 3:.3f}:d=3[mus]")
    fc.append("[mus][voz2]sidechaincompress=threshold=0.03:ratio=5:attack=40:release=450[musd]")
    fc.append("[voz1][musd]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[ao]")
else:
    fc.append("[voz]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[ao]")
fcf = os.path.join(pasta, 'filtro.txt'); open(fcf, 'w').write(';\n'.join(fc))
saida = os.path.join(pasta, 'previa.mp4' if previa else 'final.mp4')
cmd += ['-filter_complex_script', fcf, '-map', '[vo]', '-map', '[ao]'] + (['-t', str(LIM)] if previa else []) + [
    '-c:v', 'libx264', '-preset', 'veryfast' if previa else 'medium', '-crf', '20', '-maxrate', '6M', '-bufsize', '12M',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', saida]
print(f'renderizando {saida} ({len(EV)} elementos, {L / 60:.1f} min)...', flush=True)
subprocess.run(cmd, check=True)
print(f'OK: {saida} ({os.path.getsize(saida) / 1e6:.0f} MB)')
