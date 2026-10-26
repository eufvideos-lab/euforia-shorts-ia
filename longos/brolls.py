#!/usr/bin/env python3
"""Vídeo longo, etapa 3: baixa os B-rolls do plano.json e monta a folha de conferência.
Uso: python3 longos/brolls.py PASTA_DO_PEDIDO [ids para refazer...]
Cada B-roll do plano: {"id": "b1", "fonte": "pixabay"|"foto", "busca": "...", "palavra": 123, "dur": 3,
                      "file_ids": ["..."]  (só para "foto": partes salvas no Drive pelo fluxo de fotos do n8n)
                      ou "arquivo": caminho local, "legenda": crédito no canto (modelo NA), "foco_x": 0 a 1}
- pixabay: vídeo genérico do banco (busca em inglês, 2 a 4 palavras). Só entra se as etiquetas batem com a busca.
- foto: foto específica (pessoa, lugar, faculdade) já salva no Drive. Foto pequena entra com moldura arredondada
  sobre fundo desfocado, sem esticar; foto grande cobre a tela.
Gera broll/<id>.mp4 ou broll/<id>.jpg e brolls.png (um quadro de cada, com a busca escrita)."""
import json, os, re, subprocess, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'pipeline'))
import ponte
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

pasta = sys.argv[1]
plano = json.load(open(os.path.join(pasta, 'plano.json')))
dest = os.path.join(pasta, 'broll'); os.makedirs(dest, exist_ok=True)
so = set(sys.argv[2:])
EVITAR = ('cartoon', 'animation', 'anime', 'illustration', 'drawing', 'christmas', 'snow', 'halloween', 'glove')
CW, CH = 2112, 1188  # 10% maior que 1080p para o movimento lento (Ken Burns)


def pixabay(br):
    palavras = [w for w in re.findall(r'[a-z]+', br['busca'].lower()) if w not in ('a', 'an', 'the', 'of', 'in', 'on', 'at', 'with', 'and', 'to')]
    def nota(h):
        tags = (h.get('tags') or '').lower()
        return sum(1 for w in palavras if re.search(r'\b' + w.rstrip('s'), tags))
    minimo = max(1, len(palavras) - 1) if len(palavras) >= 3 else max(1, len(palavras))
    hits = ponte.broll_buscar(br['busca'], 12)
    bons = [h for h in hits if h.get('url') and not any(t in (h.get('tags') or '').lower() for t in EVITAR) and nota(h) >= minimo]
    bons.sort(key=lambda h: (-nota(h), (h.get('duracao') or 0) < br.get('dur', 3) + 0.5, -(h.get('altura') or 0)))
    if not bons:
        return None, f'nada no banco combina com "{br["busca"]}"'
    h = bons[0]
    tmp = os.path.join(dest, f'_px_{h["id"]}.mp4')
    ponte.broll_baixar(h['url'], tmp)
    out = os.path.join(dest, f"{br['id']}.mp4")
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-t', f"{br.get('dur', 3) + 1:.1f}", '-an', '-vf',
                    'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30', '-c:v', 'libx264',
                    '-preset', 'veryfast', '-crf', '18', out], check=True)
    os.remove(tmp)
    return out, f'pixabay {h["id"]} ({h.get("tags")})'


def credito(im, texto):
    """Crédito curto da obra/foto no canto de cima (modelo NA): "Gustave Courbet · Os Quebradores de Pedras (1849)"."""
    if not texto:
        return im
    from PIL import ImageFont
    f = ImageFont.truetype(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fontes', 'InterDisplay-SemiBold.otf'), 30)
    sh = Image.new('L', im.size, 0); ImageDraw.Draw(sh).text((150, 120), texto, font=f, fill=230)
    im.paste((0, 0, 0), (0, 0), sh.filter(ImageFilter.GaussianBlur(5)))
    ImageDraw.Draw(im).text((148, 117), texto, font=f, fill=(255, 255, 255))
    return im


def foto(br):
    if br.get('arquivo'):
        im = Image.open(br['arquivo']).convert('RGB')
    else:
        tmp = os.path.join(dest, f"_{br['id']}.img")
        with open(tmp, 'wb') as f:
            for fid in br['file_ids']:
                parte = tmp + '.p'
                ponte.baixar(fid, parte)
                f.write(open(parte, 'rb').read()); os.remove(parte)
        im = Image.open(tmp).convert('RGB'); os.remove(tmp)
    out = os.path.join(dest, f"{br['id']}.jpg")
    s = max(CW / im.width, CH / im.height)
    if im.width >= 1800 and im.height >= 1000:
        fx = br.get('foco_x', 0.5); w2 = int(im.width * s) + 1; x = int(min(max(fx * w2 - CW / 2, 0), w2 - CW))
        credito(im.resize((w2, int(im.height * s) + 1), Image.LANCZOS).crop((x, 0, x + CW, CH)), br.get('legenda')).save(out, quality=93)
        return out, f'foto {im.width}x{im.height} (tela cheia)'
    bg = im.resize((int(im.width * s) + 1, int(im.height * s) + 1)).crop((0, 0, CW, CH)).filter(ImageFilter.GaussianBlur(40))
    bg = ImageEnhance.Brightness(bg).enhance(0.45)
    h = 980; fg = im.resize((int(im.width * h / im.height), h), Image.LANCZOS)
    if fg.width > CW - 160:
        w = CW - 160; fg = im.resize((w, int(im.height * w / im.width)), Image.LANCZOS); h = fg.height
    x = (CW - fg.width) // 2; y = (CH - h) // 2
    sh = Image.new('L', (CW, CH), 0); ImageDraw.Draw(sh).rounded_rectangle((x + 10, y + 24, x + fg.width + 10, y + h + 24), radius=28, fill=200)
    bg.paste((0, 0, 0), (0, 0), sh.filter(ImageFilter.GaussianBlur(30)))
    m = Image.new('L', fg.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, fg.width - 1, h - 1), radius=28, fill=255)
    bg.paste(fg, (x, y), m); credito(bg, br.get('legenda')).save(out, quality=93)
    return out, f'foto {im.width}x{im.height} (com moldura)'


rel = {}
for br in plano.get('brolls', []):
    if so and br['id'] not in so:
        continue
    for e in ('mp4', 'jpg'):
        if os.path.exists(os.path.join(dest, f"{br['id']}.{e}")):
            os.remove(os.path.join(dest, f"{br['id']}.{e}"))
    if plano.get('modelo') == 'nova-acropole' and br.get('fonte') != 'foto':
        rel[br['id']] = 'ignorado: o modelo Nova Acrópole só usa imagem real ("fonte": "foto")'; print(br['id'], rel[br['id']]); continue
    try:
        out, msg = foto(br) if br.get('fonte') == 'foto' else pixabay(br)
    except Exception as e:
        out, msg = None, f'falhou: {e}'
    rel[br['id']] = msg
    print(f"{br['id']}: {msg}", flush=True)

# folha de conferência
itens = []
for br in plano.get('brolls', []):
    for e in ('mp4', 'jpg'):
        f = os.path.join(dest, f"{br['id']}.{e}")
        if os.path.exists(f):
            itens.append((br, f))
if itens:
    th = []
    for br, f in itens:
        q = f + '.thumb.png'
        subprocess.run(['ffmpeg', '-v', 'error', '-y'] + (['-ss', '1'] if f.endswith('mp4') else []) + ['-i', f, '-frames:v', '1', '-vf', 'scale=480:270', q])
        if os.path.exists(q):
            im = Image.open(q).convert('RGB'); d = ImageDraw.Draw(im)
            d.rectangle((0, 238, 480, 270), fill=(0, 0, 0)); d.text((6, 246), f"{br['id']}: {br['busca']}"[:70], fill=(255, 255, 0))
            th.append(im); os.remove(q)
    cols = 4; rows = (len(th) + cols - 1) // cols
    folha = Image.new('RGB', (480 * cols, 270 * rows))
    for j, im in enumerate(th):
        folha.paste(im, ((j % cols) * 480, (j // cols) * 270))
    folha.save(os.path.join(pasta, 'brolls.png'))
print('OK: folha em brolls.png. Confira: o que não mostrar o que a pessoa fala sai do plano.')
