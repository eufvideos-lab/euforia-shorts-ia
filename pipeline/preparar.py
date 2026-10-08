#!/usr/bin/env python3
"""Etapa 1 do pedido: baixa o vídeo, transcreve e analisa os planos.
Uso: python3 preparar.py PASTA_DO_PEDIDO FILE_ID_DO_DRIVE
Gera na pasta: fonte.mp4, audio.mp3, transcricao.json, planos.json, palavras.txt e brolls_fonte.png
(folha de contato dos B-rolls que já existem no vídeo, para o Claude ver o que cada um mostra)."""
import json, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ponte, analise
from montar_short import alinhar_pontuacao

pasta, file_id = sys.argv[1], sys.argv[2]
os.makedirs(pasta, exist_ok=True)
fonte = os.path.join(pasta, 'fonte.mp4')
if not os.path.exists(fonte) or os.path.getsize(fonte) < 1000:
    print('baixando vídeo...', flush=True)
    ponte.baixar(file_id, fonte)
W, H, fps, dur = analise.sonda(fonte)
print(f'vídeo: {W}x{H}, {dur:.0f}s', flush=True)

audio = os.path.join(pasta, 'audio.mp3')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', fonte, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k', audio], check=True)
tr_path = os.path.join(pasta, 'transcricao.json')
if not os.path.exists(tr_path):
    print('transcrevendo...', flush=True)
    json.dump(ponte.transcrever(audio), open(tr_path, 'w'), ensure_ascii=False)
tr = json.load(open(tr_path))
pal = alinhar_pontuacao(tr['text'], tr['words'])

print('analisando planos e rosto...', flush=True)
info = analise.analisar_planos(fonte)
info['tem_trilha'] = analise.tem_trilha(audio)
info['duracao'] = dur
json.dump(info, open(os.path.join(pasta, 'planos.json'), 'w'), ensure_ascii=False, indent=1)

# texto para o Claude: palavras com índice e tempo, uma frase por linha
linhas, atual = [], []
for i, w in enumerate(pal):
    atual.append(f"{i}:{w['t']}[{w['s']:.1f}]")
    if w['t'].endswith(('.', '?', '!')):
        linhas.append(' '.join(atual)); atual = []
if atual:
    linhas.append(' '.join(atual))
brolls = [p for p in info['planos'] if p['tipo'] == 'broll' and p['fim'] - p['ini'] >= 0.8]
with open(os.path.join(pasta, 'palavras.txt'), 'w') as f:
    f.write(f"VÍDEO: {W}x{H}, {dur:.0f}s, trilha de fundo: {'sim' if info['tem_trilha'] else 'não'}\n")
    f.write(f"B-ROLLS JÁ NO VÍDEO (tempo de origem, s): " + '; '.join(f"#{k} {p['ini']:.1f}-{p['fim']:.1f}" for k, p in enumerate(brolls)) + '\n\n')
    f.write('\n'.join(linhas) + '\n')

# folha de contato dos B-rolls existentes
if brolls:
    from PIL import Image, ImageDraw
    thumbs = []
    for k, p in enumerate(brolls[:24]):
        t = (p['ini'] + p['fim']) / 2
        out = os.path.join(pasta, f'_b{k}.png')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{t:.2f}', '-i', fonte, '-frames:v', '1', '-vf', 'scale=320:-2', out])
        if os.path.exists(out):
            thumbs.append((k, p, out))
    if thumbs:
        w0, h0 = Image.open(thumbs[0][2]).size
        cols = 4; rows = (len(thumbs) + cols - 1) // cols
        im = Image.new('RGB', (w0 * cols, h0 * rows)); d = ImageDraw.Draw(im)
        for j, (k, p, out) in enumerate(thumbs):
            x, y = (j % cols) * w0, (j // cols) * h0
            im.paste(Image.open(out), (x, y)); d.rectangle([x, y, x + 150, y + 18], fill=(0, 0, 0))
            d.text((x + 4, y + 3), f"#{k} {p['ini']:.1f}-{p['fim']:.1f}s", fill=(255, 255, 0))
            os.remove(out)
        im.save(os.path.join(pasta, 'brolls_fonte.png'))

print(f'OK: {len(pal)} palavras, {len(info["planos"])} planos, {len(brolls)} B-rolls já no vídeo, trilha={info["tem_trilha"]}')
