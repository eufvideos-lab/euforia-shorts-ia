#!/usr/bin/env python3
"""Conta ao Euforia Studio em que passo está a pós-produção de um corte (17/11/2026).
Uso: python3 pipeline/studio_status.py ID_DO_STUDIO PASSO ["texto"] [--pasta "<Cliente> - <id-curto>"] [--erro]
Sobe "<ID>-<PASSO>.json" na pasta ENTRADA DO STUDIO/_status do Drive. O Studio de quem mandou o corte lê essa pasta
(pelo Drive para computador) e mostra o andamento; no passo 9 com --pasta, mostra "Abrir com a pós-produção".
Passos: 1 recebido · 2 transcrevendo · 3 escolhendo textos · 4 buscando B-roll · 5 montando o projeto · 9 pronto.
Nunca trava a máquina: se falhar, só avisa."""
import argparse, json, os, sys, tempfile, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ponte

STATUS = '1BWO8xFCxnuaz4aMj8whEuxWJYEJsgtng'  # ENTRADA DO STUDIO/_status
TEXTOS = {1: 'Recebido, começando', 2: 'Transcrevendo a fala', 3: 'Escolhendo textos, lowers e cartões',
          4: 'Buscando B-roll e trilha', 5: 'Montando o projeto', 9: 'Pronto'}

ap = argparse.ArgumentParser()
ap.add_argument('id'); ap.add_argument('passo', type=int); ap.add_argument('texto', nargs='?')
ap.add_argument('--pasta'); ap.add_argument('--erro', action='store_true')
a = ap.parse_args()

dado = {'id': a.id, 'passo': a.passo, 'texto': a.texto or TEXTOS.get(a.passo, ''), 'em': time.strftime('%Y-%m-%dT%H:%M:%S')}
if a.pasta: dado['pasta'] = a.pasta
if a.erro: dado['erro'] = True
tmp = os.path.join(tempfile.mkdtemp(), 'status.json')
with open(tmp, 'w', encoding='utf-8') as f:
    json.dump(dado, f, ensure_ascii=False)
try:
    ponte.subir(tmp, STATUS, f'{a.id}-{a.passo}.json')
    print('status', a.passo, dado['texto'])
except Exception as e:  # o aviso ao Studio nunca para a entrega
    print('não deu para avisar o Studio:', e)
