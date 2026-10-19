#!/usr/bin/env python3
"""Baixa do Drive as partes de uma foto salva pelo fluxo de fotos do n8n e junta num .jpg.
Uso: python3 carrossel/juntar_foto.py pedidos/<id>/assets/fotos/<nome>.jpg <id_parte1> [<id_parte2> ...]
Foto pequena (menos de 1000 px no lado maior) é recusada: no carrossel ela ficaria borrada."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'pipeline'))
import ponte
from PIL import Image

saida, ids = sys.argv[1], sys.argv[2:]
os.makedirs(os.path.dirname(os.path.abspath(saida)), exist_ok=True)
tmp = saida + '.tmp'
with open(tmp, 'wb') as f:
    for fid in ids:
        parte = tmp + '.p'
        ponte.baixar(fid, parte)
        f.write(open(parte, 'rb').read()); os.remove(parte)
im = Image.open(tmp).convert('RGB'); os.remove(tmp)
if max(im.size) < 1000:
    sys.exit(f'foto pequena demais ({im.width}x{im.height}); escolha outra')
im.save(saida, quality=93)
print(f'{saida} {im.width}x{im.height}')
