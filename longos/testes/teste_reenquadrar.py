"""Teste do "reenquadrar" do plano (longos/cortar.py): python3 longos/testes/teste_reenquadrar.py
Bruto sintético de 24 s (palavras = ruído). A transcrição dá o fim de "conteudismo" 0,6 s antes do fim real (como no
ajuste da Nova Acrópole de 20/11/2026) e o "de" do reenquadrar cai bem no fim errado. A divisão da imagem tem que cair
no silêncio depois do fim real, e os segmentos do pedaço saem com o centro e o zoom pedidos."""
import json, os, subprocess, sys, tempfile
import numpy as np

AQUI = os.path.dirname(os.path.abspath(__file__))
SR, DUR = 16000, 24.0
rng = np.random.default_rng(3)
audio = rng.normal(0, 30, int(SR * DUR))
palavras = []  # (texto, início real, fim real); pausa de 0,35 s entre palavras
t = 0.5
for k in range(40):
    d = 1.6 if k == 20 else 0.35
    palavras.append((f'p{k}', t, t + d)); t += d + 0.35
    if t > DUR - 1:
        break
for _, a, b in palavras:
    audio[int(a * SR):int(b * SR)] += rng.normal(0, 3000, int(b * SR) - int(a * SR))
W = [{'word': w, 'start': round(a, 3), 'end': round(b, 3)} for w, a, b in palavras]
W[20]['word'] = 'conteudismo'; W[20]['end'] = round(palavras[20][2] - 0.6, 3)  # transcrição adiantada
fim_real = palavras[20][2]

d = tempfile.mkdtemp()
wav = os.path.join(d, 'a.wav')
import wave
with wave.open(wav, 'wb') as f:
    f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR)
    f.writeframes(np.clip(audio, -32000, 32000).astype(np.int16).tobytes())
bruto = os.path.join(d, 'bruto.mp4')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', f'color=gray:s=640x360:r=30:d={DUR}', '-i', wav,
                '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', bruto], check=True)
json.dump({'arquivo': bruto, 'duracao': DUR, 'hdr': False}, open(os.path.join(d, 'info.json'), 'w'))
json.dump({'words': W, 'text': ' '.join(x['word'] for x in W)}, open(os.path.join(d, 'transcricao.json'), 'w'))
de = W[20]['end'] + 0.02  # onde o remendo antigo dividia: no fim que a transcrição dava
ate = W[30]['end'] + 0.1
json.dump({'modelo': 'nova-acropole', 'trechos': [[0, len(W) - 1]], 'gancho': 0,
           'reenquadrar': [{'de': de, 'ate': ate, 'centro': [0.28, 0.39], 'zoom': 1.5}]},
          open(os.path.join(d, 'plano.json'), 'w'))
r = subprocess.run([sys.executable, os.path.join(AQUI, '..', 'cortar.py'), d], capture_output=True, text=True)
assert r.returncode == 0, r.stdout + r.stderr
segs = json.load(open(os.path.join(d, 'segmentos.json')))
pedaco = [x for x in segs if x.get('centro')]
assert pedaco, 'nenhum segmento reenquadrado'
assert pedaco[0]['centro'] == [0.28, 0.39] and pedaco[0]['zoom'] == 1.5, pedaco[0]
assert all(x['zoom'] in (1.5, 1.65) for x in pedaco), [x['zoom'] for x in pedaco]
for x in segs:  # nenhuma divisão dentro de palavra (pelo som)
    for corte in (x['s'], x['e']):
        dentro = [w for w, a, b in palavras if a + 0.02 < corte < b - 0.02]
        assert not dentro, f'corte em {corte:.3f}s dentro de {dentro}'
ini = pedaco[0]['s']
assert fim_real <= ini < palavras[21][1], f'divisão em {ini:.3f}s; "conteudismo" acaba em {fim_real:.3f}s'
assert pedaco[0]['join'], 'o áudio tem que passar direto (join) na divisão do reenquadrar'
print(f'OK: reenquadrar divide em {ini:.2f}s (fim real {fim_real:.2f}s), {len(pedaco)} segmentos com centro e zoom')
