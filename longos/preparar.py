#!/usr/bin/env python3
"""Vídeo longo, etapa 1: baixa o bruto do Drive, transcreve e prepara o texto para o Claude montar o plano.
Uso: python3 longos/preparar.py PASTA_DO_PEDIDO FILE_ID_DO_DRIVE
Gera na pasta: bruto.<ext>, info.json, audio.mp3, transcricao.json e palavras.txt
(uma frase por linha, cada palavra como indice:palavra[tempo]; é o índice que vai no plano.json)."""
import json, os, subprocess, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'pipeline'))
import ponte

pasta, file_id = sys.argv[1], sys.argv[2]
os.makedirs(pasta, exist_ok=True)
ja = [f for f in os.listdir(pasta) if f.startswith('bruto.') and os.path.getsize(os.path.join(pasta, f)) > 1000]
meta = {'nome': ja[0]} if ja else ponte.info(file_id)
ext = os.path.splitext(meta.get('nome') or 'bruto.mp4')[1].lower() or '.mp4'
bruto = os.path.join(pasta, 'bruto' + ext)
if not ja:
    print(f"baixando {meta.get('nome')} ({int(meta.get('tamanho') or 0) / 1e6:.0f} MB)...", flush=True)
    ponte.baixar(file_id, bruto)

p = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                               'stream=width,height,r_frame_rate,color_transfer:format=duration', '-of', 'json', bruto],
                              capture_output=True, text=True).stdout)
st = p['streams'][0]
num, den = st['r_frame_rate'].split('/')
info = {'arquivo': bruto, 'largura': st['width'], 'altura': st['height'], 'fps': float(num) / float(den),
        'duracao': float(p['format']['duration']),
        'hdr': st.get('color_transfer') in ('arib-std-b67', 'smpte2084'), 'nome_drive': meta.get('nome')}
json.dump(info, open(os.path.join(pasta, 'info.json'), 'w'), ensure_ascii=False, indent=1)
print(f"vídeo: {info['largura']}x{info['altura']} {info['fps']:.0f} fps, {info['duracao']:.0f}s, HDR={info['hdr']}", flush=True)

audio = os.path.join(pasta, 'audio.mp3')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', bruto, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k', audio], check=True)
tr_path = os.path.join(pasta, 'transcricao.json')
if not os.path.exists(tr_path):
    print('transcrevendo...', flush=True)
    json.dump(ponte.transcrever(audio), open(tr_path, 'w'), ensure_ascii=False)
W = json.load(open(tr_path))['words']

linhas, atual = [], []
for i, w in enumerate(W):
    atual.append(f"{i}:{w['word']}[{w['start']:.1f}]")
    prox = W[i + 1]['start'] if i + 1 < len(W) else None
    if w['word'].endswith(('.', '?', '!')) or (prox is not None and prox - w['end'] > 0.7) or len(atual) >= 25:
        linhas.append(' '.join(atual)); atual = []
if atual:
    linhas.append(' '.join(atual))
with open(os.path.join(pasta, 'palavras.txt'), 'w') as f:
    f.write(f"BRUTO: {info['largura']}x{info['altura']}, {info['duracao']:.0f}s. Uma linha por frase/respiro.\n\n")
    f.write('\n'.join(linhas) + '\n')
print(f'OK: {len(W)} palavras, {len(linhas)} linhas em palavras.txt')
