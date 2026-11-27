"""Recorte sem cortar bordas: rembg birefnet-portrait na foto inteira (reduzida a 2400px), crop no bbox do alfa.
Uso: python3 cut.py foto.jpg saida.png"""
import sys
from PIL import Image, ImageOps
from rembg import remove, new_session
im = ImageOps.exif_transpose(Image.open(sys.argv[1])).convert('RGB')
im.thumbnail((2400, 2400))
out = remove(im, session=new_session('birefnet-portrait'))
out = out.crop(out.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())
out.save(sys.argv[2]); print(sys.argv[2], out.size)
