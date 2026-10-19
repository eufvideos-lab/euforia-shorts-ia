#!/usr/bin/env python3
"""Ajuda a ler a identidade visual do cliente.
  python3 carrossel/analisar.py cores <imagem> [<imagem> ...]   -> cores principais de cada imagem (hex e %)
  python3 carrossel/analisar.py folha <saida.jpg> <imagem> ...  -> folha com as imagens lado a lado para olhar
  python3 carrossel/analisar.py logo <logo.png> <cor> <saida.png> -> logo de uma cor só (para fundo claro/escuro)
"""
import sys
from PIL import Image


def cores(caminho, n=6):
    im = Image.open(caminho).convert('RGBA'); im.thumbnail((300, 300))
    dados = im.get_flattened_data() if hasattr(im, 'get_flattened_data') else im.getdata()
    px = [p[:3] for p in dados if p[3] > 200]
    if not px: return []
    base = Image.new('RGB', (len(px), 1)); base.putdata(px)
    q = base.quantize(colors=n, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()[:n * 3]; cont = sorted(q.getcolors(), reverse=True)
    tot = sum(c for c, _ in cont)
    return [('#%02X%02X%02X' % tuple(pal[i * 3:i * 3 + 3]), round(100 * c / tot)) for c, i in cont]


def folha(saida, imgs):
    ims = [Image.open(p).convert('RGBA') for p in imgs]
    for im in ims: im.thumbnail((500, 500))
    f = Image.new('RGBA', (sum(i.width for i in ims) + 20 * (len(ims) + 1), max(i.height for i in ims) + 40), (128, 128, 128, 255))
    x = 20
    for im in ims: f.alpha_composite(im, (x, 20)); x += im.width + 20
    f.convert('RGB').save(saida, quality=88)


def logo(entrada, cor, saida):
    im = Image.open(entrada).convert('RGBA'); cor = cor.lstrip('#')
    c = tuple(int(cor[i:i + 2], 16) for i in (0, 2, 4))
    sol = Image.new('RGBA', im.size, c + (255,)); sol.putalpha(im.getchannel('A')); sol.save(saida)


if __name__ == '__main__':
    acao = sys.argv[1]
    if acao == 'cores':
        for p in sys.argv[2:]: print(p, ' '.join(f'{h} {pc}%' for h, pc in cores(p)))
    elif acao == 'folha': folha(sys.argv[2], sys.argv[3:])
    elif acao == 'logo': logo(*sys.argv[2:5])
