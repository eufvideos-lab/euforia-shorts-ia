#!/usr/bin/env python3
"""Modo "vídeo pronto do cliente" (17/11/2026, caso Mauro Longo / HeyGen).
Para quando o cliente manda o vídeo JÁ EDITADO, com legenda e telas próprias (avatar HeyGen, Radar Tributário etc.).
Aqui a máquina NÃO põe legenda, cartão nem B-roll: só deixa no formato de short, faz a capa e sobe.

  Vertical (9:16) -> short inteiro: baixa para 1080x1920, sem cortar nada (até 3 min, limite do YouTube Shorts).
  Horizontal (16:9) -> cortes com moldura: o trecho entra inteiro (legenda e cartões do cliente visíveis) no meio da
                       tela vertical, sobre o fundo da marca, com o título do short em cima.

Uso:
  1) python3 pipeline/short_pronto.py PASTA FILE_ID --so-preparar
     baixa, transcreve e escreve PASTA/palavras.txt (palavras com índice e tempo, como no fluxo normal).
  2) python3 pipeline/short_pronto.py PASTA FILE_ID --cliente "Mauro Longo" --pasta-drive ID \
        --titulo "IVA Dual: 5 impostos viram 2" [--titulo ... (um por short)] \
        [--palavras 12-180 --palavras 230-390 ...]   (só horizontal: índices de palavras.txt, início e fim de cada short)
        [--cor-fundo #10223F --cor-destaque #C9A44B --cor-texto #F5F3EE --fonte-titulo "Playfair Display" --fonte-texto Figtree]
        [--selo "RADAR TRIBUTÁRIO"] [--quadro-capa 12.5] [--so-render]
Grava PASTA/saida/short_N.mp4, PASTA/saida/capa_N.jpg, PASTA/saida/conferencia_N.png (6 quadros para olhar)
e PASTA/resultado.json com os links do Drive."""
import argparse, json, os, re, subprocess, sys, time
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import ponte
from montar_short import alinhar_pontuacao

FONTES = os.path.join(AQUI, 'fontes')
W, H = 1080, 1920
DUR_MAX_SHORTS = 180  # o YouTube aceita Shorts de até 3 min (desde 15/10/2024)


def sonda(video):
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                        'stream=width,height,r_frame_rate:stream_side_data=rotation:format=duration', '-of', 'json', video],
                       capture_output=True, text=True)
    d = json.loads(r.stdout)
    s = d['streams'][0]
    w, h = int(s['width']), int(s['height'])
    rot = next((abs(int(x.get('rotation', 0))) for x in s.get('side_data_list', []) if 'rotation' in x), 0)
    if rot in (90, 270):
        w, h = h, w
    n, m = s['r_frame_rate'].split('/')
    return w, h, float(n) / float(m), float(d['format']['duration'])


def fonte(nome, peso=700, tam=60):
    from PIL import ImageFont
    slug = re.sub(r'[^a-z0-9]+', '-', (nome or '').lower()).strip('-')
    for cand in (f'{slug}-{peso}.woff2', f'{slug}-700.woff2', f'{slug}-400.woff2'):
        p = os.path.join(FONTES, cand)
        if os.path.exists(p):
            return ImageFont.truetype(p, tam)
    if nome:
        print(f'aviso: fonte "{nome}" não está em pipeline/fontes; usando DejaVu', file=sys.stderr)
    base = '/usr/share/fonts/truetype/dejavu/DejaVuSans' + ('-Bold' if peso >= 600 else '') + '.ttf'
    return ImageFont.truetype(base, tam) if os.path.exists(base) else ImageFont.load_default()


def quebrar(draw, texto, f, largura):
    linhas, atual = [], ''
    for p in texto.split():
        t = (atual + ' ' + p).strip()
        if draw.textlength(t, font=f) <= largura or not atual:
            atual = t
        else:
            linhas.append(atual); atual = p
    if atual:
        linhas.append(atual)
    return linhas


def bloco_titulo(draw, texto, nome_fonte, cor, largura, tam_max=104, tam_min=58, max_linhas=4):
    """Acha o maior tamanho em que o título cabe em max_linhas."""
    for tam in range(tam_max, tam_min - 1, -4):
        f = fonte(nome_fonte, 700, tam)
        ls = quebrar(draw, texto, f, largura)
        if len(ls) <= max_linhas:
            return f, ls, tam
    return f, ls, tam


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def melhor_quadro(video, ini, dur, forcado=None):
    """Quadro da capa e o rosto nele (x, y, altura em fração da tela). Entre 24 quadros (15% a 90% do vídeo), fica o
    de maior rosto com menos tela/cartão por cima do corpo (vídeo HeyGen: o avatar divide a tela com cartões claros)."""
    try:
        import cv2, numpy as np
    except ImportError:
        return (forcado if forcado is not None else dur * 0.3), None
    casc = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    vw, vh = sonda(video)[:2]
    lw = round(960 * vw / vh / 2) * 2  # quadro na proporção do vídeo, 960 de altura
    tempos = [forcado] if forcado is not None else [ini + dur * (0.15 + 0.75 * k / 23) for k in range(24)]
    melhor, escolha = -1e9, (tempos[0], None)
    for t in tempos:
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{t:.2f}', '-i', video, '-frames:v', '1', '-vf', f'scale={lw}:960',
                              '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True).stdout
        if len(raw) < lw * 960 * 3:
            continue
        im = np.frombuffer(raw[:lw * 960 * 3], np.uint8).reshape(960, lw, 3)
        g = cv2.cvtColor(im, cv2.COLOR_RGB2GRAY)
        rs = casc.detectMultiScale(g, 1.1, 6, minSize=(36, 36))
        if not len(rs):
            continue
        x, y, w, h = max(rs, key=lambda r: r[2] * r[3])
        # corpo: do queixo até 3 rostos abaixo, 3 rostos de largura; cartão/tela clara ali = quadro pior
        x0, x1 = max(0, x - w), min(lw, x + 2 * w); y0, y1 = min(959, y + h), min(960, y + 4 * h)
        corpo = im[y0:y1, x0:x1].astype(int)
        claro = ((corpo.min(axis=2) > 175)).mean() if corpo.size else 1
        nota = h - 120 * claro
        if nota > melhor:
            melhor, escolha = nota, (t, {'x': (x + w / 2) / lw, 'y': (y + h / 2) / 960, 'h': h / 960})
    return escolha


def capa(video, ini, dur, titulo, a, out):
    """Capa 1080x1920 tirada do vídeo do cliente (sem moldura): janela 9:16 em volta do rosto, zoom se o rosto for
    pequeno, degradê na cor de fundo da marca e título grande. --quadro-capa é o segundo dentro do short."""
    from PIL import Image, ImageDraw
    forcado = ini + a.quadro_capa if a.quadro_capa is not None else None
    t, rosto = melhor_quadro(video, ini, dur, forcado)
    tmp = out + '.png'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{t:.2f}', '-i', video, '-frames:v', '1',
                    '-vf', f'scale=-2:{H}:flags=lanczos', tmp], check=True)
    im = Image.open(tmp).convert('RGB'); os.remove(tmp)
    if im.width > W:  # vídeo horizontal: janela vertical centrada no rosto (ou no meio)
        fx = rosto['x'] if rosto else 0.5
        largura = im.width
        x0 = min(max(round(fx * largura - W / 2), 0), largura - W)
        im = im.crop((x0, 0, x0 + W, H))
        if rosto:
            rosto = dict(rosto, x=(fx * largura - x0) / W)
    if im.size != (W, H):
        im = im.resize((W, H), Image.LANCZOS)
    if rosto and rosto['h'] < 0.13:
        # rosto pequeno (avatar de corpo inteiro): aproxima até o rosto ocupar ~13% da altura, rosto a 33% do topo
        z = min(2.6, 0.13 / rosto['h'])
        cw, ch = W / z, H / z
        cx = min(max(rosto['x'] * W - cw / 2, 0), W - cw)
        cy = min(max(rosto['y'] * H - ch * 0.33, 0), H - ch)
        im = im.crop((round(cx), round(cy), round(cx + cw), round(cy + ch))).resize((W, H), Image.LANCZOS)
    fundo = hex_rgb(a.cor_fundo)
    # degradê de baixo para cima: o título fica legível sobre qualquer quadro (e cobre legenda/cartões do vídeo)
    grad = Image.new('L', (1, H))
    for y in range(H):
        x = (y - H * 0.42) / (H * 0.22)
        grad.putpixel((0, y), int(255 * min(1, max(0, x)) ** 1.1))
    im.paste(Image.new('RGB', (W, H), fundo), (0, 0), grad.resize((W, H)))
    d = ImageDraw.Draw(im)
    margem = 84
    f, ls, tam = bloco_titulo(d, titulo, a.fonte_titulo, a.cor_texto, W - 2 * margem)
    alt_linha = int(tam * 1.12)
    # título no terço de baixo, acima da faixa que o app do YouTube cobre (nome do canal, descrição)
    y = int(H * 0.80) - alt_linha * len(ls)
    if a.selo:
        fs = fonte(a.fonte_texto, 700, 34)
        d.text((margem, y - 92), a.selo.upper(), font=fs, fill=hex_rgb(a.cor_destaque))
    d.rectangle((margem, y - 34, margem + 120, y - 26), fill=hex_rgb(a.cor_destaque))
    for i, l in enumerate(ls):
        d.text((margem, y + i * alt_linha), l, font=f, fill=hex_rgb(a.cor_texto))
    im.save(out, quality=92)
    return t


def fundo_moldura(titulo, a, out, y_video, h_video):
    """Fundo da versão com moldura: cor da marca, selo e título em cima, faixa de destaque."""
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (W, H), hex_rgb(a.cor_fundo))
    d = ImageDraw.Draw(im)
    margem = 72
    f, ls, tam = bloco_titulo(d, titulo, a.fonte_titulo, a.cor_texto, W - 2 * margem, tam_max=84, tam_min=52, max_linhas=4)
    alt_linha = int(tam * 1.14)
    y = y_video - 70 - alt_linha * len(ls)
    if a.selo:
        fs = fonte(a.fonte_texto, 700, 32)
        d.text((margem, y - 84), a.selo.upper(), font=fs, fill=hex_rgb(a.cor_destaque))
    d.rectangle((margem, y - 30, margem + 110, y - 23), fill=hex_rgb(a.cor_destaque))
    for i, l in enumerate(ls):
        d.text((margem, y + i * alt_linha), l, font=f, fill=hex_rgb(a.cor_texto))
    d.rectangle((0, y_video + h_video, W, y_video + h_video + 8), fill=hex_rgb(a.cor_destaque))
    im.save(out)


def conferencia(video, dur, out):
    from PIL import Image
    ims = []
    for k in range(6):
        t = dur * (0.05 + 0.9 * k / 5)
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{t:.2f}', '-i', video, '-frames:v', '1', '-vf', 'scale=270:480',
                              '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True).stdout
        if len(raw) >= 270 * 480 * 3:
            ims.append(Image.frombytes('RGB', (270, 480), raw[:270 * 480 * 3]))
    folha = Image.new('RGB', (270 * max(1, len(ims)), 480))
    for i, im in enumerate(ims):
        folha.paste(im, (i * 270, 0))
    folha.save(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pasta'); ap.add_argument('file_id')
    ap.add_argument('--so-preparar', action='store_true')
    ap.add_argument('--cliente', default=''); ap.add_argument('--pasta-drive', default=None)
    ap.add_argument('--titulo', action='append', default=[], help='título da capa (um por short, na ordem)')
    ap.add_argument('--palavras', action='append', default=[], help='horizontal: I-F (índices de palavras.txt) de cada short')
    ap.add_argument('--cor-fundo', default='#10223F'); ap.add_argument('--cor-destaque', default='#C9A44B')
    ap.add_argument('--cor-texto', default='#F5F3EE')
    ap.add_argument('--fonte-titulo', default='Playfair Display'); ap.add_argument('--fonte-texto', default='Figtree')
    ap.add_argument('--selo', default=''); ap.add_argument('--quadro-capa', type=float, default=None)
    ap.add_argument('--so-render', action='store_true', help='não sobe no Drive (teste)')
    a = ap.parse_args()
    t0 = time.time()
    pasta = os.path.abspath(a.pasta); os.makedirs(pasta, exist_ok=True)
    src = os.path.join(pasta, 'fonte.mp4')
    if not os.path.exists(src) or os.path.getsize(src) < 1000:
        print('baixando vídeo...', flush=True)
        ponte.baixar(a.file_id, src)
    w, h, fps, dur = sonda(src)
    vertical = h > w
    print(f'vídeo: {w}x{h}, {dur:.0f}s, {"vertical" if vertical else "horizontal"}', flush=True)

    tr_path = os.path.join(pasta, 'transcricao.json')
    if not os.path.exists(tr_path):
        audio = os.path.join(pasta, 'audio.mp3')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k', audio], check=True)
        print('transcrevendo...', flush=True)
        json.dump(ponte.transcrever(audio), open(tr_path, 'w'), ensure_ascii=False)
    pal = alinhar_pontuacao(json.load(open(tr_path))['text'], json.load(open(tr_path))['words'])
    linhas, atual = [], []
    for i, p in enumerate(pal):
        atual.append(f"{i}:{p['t']}[{p['s']:.1f}]")
        if p['t'].endswith(('.', '?', '!')):
            linhas.append(' '.join(atual)); atual = []
    if atual:
        linhas.append(' '.join(atual))
    with open(os.path.join(pasta, 'palavras.txt'), 'w') as f:
        f.write(f'VÍDEO PRONTO DO CLIENTE: {w}x{h}, {dur:.0f}s, {"vertical (short inteiro)" if vertical else "horizontal (cortes com moldura)"}\n\n')
        f.write('\n'.join(linhas) + '\n')
    if a.so_preparar:
        print('ok: palavras.txt pronto')
        return

    # quais trechos viram short
    if vertical:
        if abs(w / h - 9 / 16) > 0.03:
            raise SystemExit(f'ERRO: vertical fora de 9:16 ({w}x{h}); confira o arquivo antes de seguir')
        if a.palavras:
            trechos = [tuple(int(x) for x in p.split('-')) for p in a.palavras]
        else:
            if dur > DUR_MAX_SHORTS:
                raise SystemExit(f'ERRO: {dur:.0f}s passa de 3 min (limite do YouTube Shorts); precisa de corte (--palavras)')
            trechos = [None]
    else:
        if not a.palavras:
            raise SystemExit('ERRO: vídeo horizontal: diga os trechos com --palavras I-F (um por short)')
        trechos = [tuple(int(x) for x in p.split('-')) for p in a.palavras]
    if len(a.titulo) != len(trechos):
        raise SystemExit(f'ERRO: {len(trechos)} short(s) e {len(a.titulo)} título(s); passe um --titulo por short')

    saida = os.path.join(pasta, 'saida'); os.makedirs(saida, exist_ok=True)
    resultado = {'modo': 'pronto-vertical' if vertical else 'pronto-moldura', 'shorts': []}
    for n, (tr, titulo) in enumerate(zip(trechos, a.titulo), 1):
        if tr is None:
            ini, fim = 0.0, dur
        else:
            i, j = tr
            if not (0 <= i <= j < len(pal)):
                raise SystemExit(f'ERRO: short {n}: palavras {i}-{j} fora do texto (0-{len(pal) - 1})')
            ini = max(0.0, pal[i]['s'] - 0.12)
            fim = min(dur, pal[j]['e'] + 0.35)
            if j + 1 < len(pal):  # não deixa a folga entrar na palavra seguinte
                fim = min(fim, max(pal[j]['e'] + 0.05, pal[j + 1]['s'] - 0.03))
            if not 15 <= fim - ini <= DUR_MAX_SHORTS:
                raise SystemExit(f'ERRO: short {n} com {fim - ini:.0f}s (precisa de 15 s a 3 min)')
            if not pal[j]['t'].endswith(('.', '?', '!')):
                print(f'aviso: short {n} termina sem ponto final ("{pal[j]["t"]}"): confira se não corta frase', file=sys.stderr)
        out = os.path.join(saida, f'short_{n}.mp4')
        corte = ['-ss', f'{ini:.3f}', '-to', f'{fim:.3f}'] if tr is not None else []
        enc = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', f'{min(fps, 60):.3f}',
               '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart']
        if vertical:
            vf = f'scale={W}:{H}:flags=lanczos,setsar=1'
            cmd = ['ffmpeg', '-v', 'error', '-y'] + corte + ['-i', src, '-vf', vf] + enc + [out]
        else:
            h_video = round(W * h / w / 2) * 2
            y_video = round((H - h_video) * 0.56 / 2) * 2
            fundo = os.path.join(saida, f'fundo_{n}.png')
            fundo_moldura(titulo, a, fundo, y_video, h_video)
            fc = f'[1:v]scale={W}:{h_video}:flags=lanczos,setsar=1[v];[0:v][v]overlay=0:{y_video}:shortest=1,format=yuv420p[o]'
            cmd = (['ffmpeg', '-v', 'error', '-y', '-loop', '1', '-i', fundo] + corte + ['-i', src,
                   '-filter_complex', fc, '-map', '[o]', '-map', '1:a?'] + enc + ['-shortest', out])
        print(f'short {n}: {fim - ini:.0f}s ({ini:.1f}-{fim:.1f})', flush=True)
        subprocess.run(cmd, check=True)
        d_out = sonda(out)[3]
        c = os.path.join(saida, f'capa_{n}.jpg')
        t_capa = capa(src, ini, fim - ini, titulo, a, c) - ini  # capa do vídeo do cliente, não da moldura
        conferencia(out, d_out, os.path.join(saida, f'conferencia_{n}.png'))
        item = {'n': n, 'titulo': titulo, 'duracao': round(d_out, 1), 'ini': round(ini, 2), 'fim': round(fim, 2),
                'quadro_capa': round(t_capa, 1), 'arquivo': out, 'capa': c}
        if a.pasta_drive and not a.so_render:
            cli = (a.cliente or 'CLIENTE').upper()
            nome = re.sub(r'[\\/:*?"<>|]+', '', f'{cli} - SHORT {n} - {titulo}').strip()
            up = ponte.subir_grande(out, a.pasta_drive, nome + '.mp4')
            item['link'] = f"https://drive.google.com/file/d/{up['id']}/view"
            upc = ponte.subir_grande(c, a.pasta_drive, nome + ' - capa.jpg', 'image/jpeg')
            item['link_capa'] = f"https://drive.google.com/file/d/{upc['id']}/view"
            print(f'drive: {nome}', flush=True)
        resultado['shorts'].append(item)
    resultado['tempo_min'] = round((time.time() - t0) / 60, 1)
    json.dump(resultado, open(os.path.join(pasta, 'resultado.json'), 'w'), ensure_ascii=False, indent=1)
    print(f'OK: {len(resultado["shorts"])} short(s) em {resultado["tempo_min"]} min')


if __name__ == '__main__':
    main()
