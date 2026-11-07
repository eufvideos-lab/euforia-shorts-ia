#!/usr/bin/env python3
"""Vídeo longo, etapa 1: baixa o bruto do Drive, transcreve e prepara o texto para o Claude montar o plano.
Uso: python3 longos/preparar.py PASTA_DO_PEDIDO FILE_ID_DO_DRIVE [--roteiro roteiro.txt] [--cliente cliente.json]
Gera na pasta: bruto.<ext>, info.json, audio.mp3, transcricao.json e palavras.txt
(uma frase por linha, cada palavra como indice:palavra[tempo]; é o índice que vai no plano.json).
Texto certo e "corta" (07/11/2026, ver longos/texto.py): o vocabulário do roteiro e do glossário do cliente vai para o
Whisper; a transcrição sai corrigida pelo roteiro e pelo glossário (a original fica em transcricao_whisper.json);
os comandos de corte aparecem marcados com ⛔ no palavras.txt; texto.json traz os trechos sugeridos pelo roteiro e
relatorio.md, o que saiu e o que foi corrigido. Sem --roteiro/--cliente usa roteiro.txt e cliente.json da pasta."""
import json, os, subprocess, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'pipeline'))
import ponte
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import texto as T

args = sys.argv[1:]
def opcao(nome):
    if nome in args:
        k = args.index(nome); v = args[k + 1]; del args[k:k + 2]; return v
roteiro, cliente = opcao('--roteiro'), opcao('--cliente')
pasta, file_id = args[0], args[1]
roteiro = roteiro or os.path.join(pasta, 'roteiro.txt')
cliente = cliente or os.path.join(pasta, 'cliente.json')
rot_txt = open(roteiro).read() if os.path.exists(roteiro) else None
cli = json.load(open(cliente)) if os.path.exists(cliente) else {}
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
if not os.path.exists(tr_path) and not os.path.exists(os.path.join(pasta, 'transcricao_whisper.json')):
    prompt = T.prompt_whisper(rot_txt, cli)
    print('transcrevendo...' + (f' (vocabulário: {prompt[:80]}...)' if rot_txt or cli else ''), flush=True)
    json.dump(ponte.transcrever(audio, prompt=prompt), open(tr_path, 'w'), ensure_ascii=False)
rel = T.rodar(pasta, roteiro, cliente)
W = json.load(open(tr_path))['words']
cmd = {k for c in rel['comandos'] if not c.get('duvida') for k in range(c['ini'], c['fim'] + 1)}
duv = {k for c in rel['comandos'] if c.get('duvida') for k in range(c['ini'], c['fim'] + 1)}

linhas, atual = [], []
for i, w in enumerate(W):
    if not w['word']:  # palavra juntada na anterior pela correção ("alto liderança" → "autoliderança")
        continue
    marca = '⛔' if i in cmd else ('⚠' if i in duv else '')
    atual.append(f"{marca}{i}:{w['word']}[{w['start']:.1f}]")
    prox = W[i + 1]['start'] if i + 1 < len(W) else None
    if w['word'].endswith(('.', '?', '!')) or (prox is not None and prox - w['end'] > 0.7) or len(atual) >= 25:
        linhas.append(' '.join(atual)); atual = []
if atual:
    linhas.append(' '.join(atual))
with open(os.path.join(pasta, 'palavras.txt'), 'w') as f:
    f.write(f"BRUTO: {info['largura']}x{info['altura']}, {info['duracao']:.0f}s. Uma linha por frase/respiro.\n")
    f.write("⛔ = comando de gravação (corta, de novo, errei...): nunca entra num trecho; ⚠ = talvez seja comando.\n")
    if rel['frases']:
        ok = sum(1 for x in rel['frases'] if x['status'] != 'nao_achada')
        f.write(f"ROTEIRO: {ok} de {len(rel['frases'])} frases achadas (última tomada boa de cada uma).\n")
        f.write(f"TRECHOS SUGERIDOS PELO ROTEIRO: {json.dumps(rel['trechos_sugeridos'])}\n")
    if rel.get('regravacoes_provaveis'):
        f.write("REGRAVAÇÕES PROVÁVEIS (a 1ª passada sai): " + ', '.join(f"{r['ini']}-{r['fim']}" for r in rel['regravacoes_provaveis']) + "\n")
    f.write("\n")
    f.write('\n'.join(linhas) + '\n')
subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'enquadrar.py'), pasta])
print(f'OK: {len(W)} palavras, {len(linhas)} linhas em palavras.txt; {len(rel["comandos"])} comandos de corte, '
      f'{len(rel["correcoes"])} palavras corrigidas (ver relatorio.md)')
