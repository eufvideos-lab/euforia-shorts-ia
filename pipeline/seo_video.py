#!/usr/bin/env python3
"""Título, descrição e SEO para qualquer vídeo da grade (20/11/2026), inclusive o editado à mão.
Uso: python3 pipeline/seo_video.py PASTA FILE_ID_DO_VIDEO_PRONTO
Baixa o vídeo PRONTO do Drive, tira o áudio, transcreve e grava na PASTA:
  transcricao.json, palavras.txt (indice:palavra[tempo]) e video_final (marca que a transcrição é do vídeo final,
  então os capítulos saem no minuto certo sem segmentos.json). Depois o Claude escreve publicacao.json
  (prompts/publicacao.md) e roda pipeline/publicacao.py PASTA ... como sempre."""
import json, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ponte

if len(sys.argv) < 3:
    raise SystemExit(__doc__)
pasta, fid = sys.argv[1], sys.argv[2]
os.makedirs(pasta, exist_ok=True)
video = os.path.join(pasta, 'video.mp4')
if not os.path.exists(video) or os.path.getsize(video) < 1000:
    print('baixando o vídeo pronto...', flush=True)
    ponte.baixar(fid, video)
dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video],
                           capture_output=True, text=True).stdout or 0)
audio = os.path.join(pasta, 'audio.mp3')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', video, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame',
                '-b:a', '32k', audio], check=True)
print(f'transcrevendo {dur / 60:.1f} min...', flush=True)
tr = ponte.transcrever(audio)
W = tr['words']
json.dump(tr, open(os.path.join(pasta, 'transcricao.json'), 'w'), ensure_ascii=False)
linhas, atual = [], []
for i, w in enumerate(W):
    atual.append(f"{i}:{w['word'].strip()}[{int(w['start']) // 60}:{int(w['start']) % 60:02d}]" if not atual else
                 f"{i}:{w['word'].strip()}")
    fim_frase = w['word'].strip().endswith(('.', '?', '!'))
    pausa = i + 1 < len(W) and W[i + 1]['start'] - w['end'] > 0.8
    if fim_frase or pausa or len(atual) >= 30:
        linhas.append(' '.join(atual)); atual = []
if atual:
    linhas.append(' '.join(atual))
open(os.path.join(pasta, 'palavras.txt'), 'w').write(
    f'VÍDEO PRONTO: {dur:.0f}s ({"short" if dur <= 180 else "longo"}). Uma linha por frase; o 1º item traz o minuto.\n'
    + '\n'.join(linhas) + '\n')
open(os.path.join(pasta, 'video_final'), 'w').write(fid + '\n')
os.remove(video)  # só a transcrição importa daqui para frente
print(f'OK: {len(W)} palavras, {dur:.0f}s. Agora escreva {os.path.join(pasta, "publicacao.json")}')
