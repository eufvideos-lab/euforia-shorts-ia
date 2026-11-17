#!/usr/bin/env python3
"""Sobe o projeto do Euforia Studio (short ou longo) para uma pasta do Drive (16/11/2026).
Uso: python3 pipeline/studio_drive.py PASTA_DO_PROJETO FOLDER_ID [--revisar "motivo"]
PASTA_DO_PROJETO = saída de pipeline/projeto_editor.py (shorts) ou de longos/montar.py --studio (longos).
FOLDER_ID = pasta criada pela rotina (Google Drive) dentro de EDITOR (1Je4ZPgF6m3ocRinFlMNewtyljHD7unLX),
com o nome "<Cliente> - <pedido>".
Como a ponte não cria subpastas, tudo vai numa pasta só: "midia/gfx/kw0.webm" vira "gfx__kw0.webm" e o projeto é
reescrito para apontar para os nomes novos (base "."). O Studio abre igual.
--revisar: marca o projeto como revisão obrigatória da Lorena (cliente 🔴, confiança baixa, cliente novo) e o
Studio mostra o selo "Revisão obrigatória" com o motivo."""
import argparse, glob, json, os, sys, tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ponte

ap = argparse.ArgumentParser()
ap.add_argument('pasta'); ap.add_argument('folder_id')
ap.add_argument('--revisar', default=None, help='motivo da revisão obrigatória')
a = ap.parse_args()

MIME = {'.json': 'application/json', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
        '.aac': 'audio/aac', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.png': 'image/png',
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
        '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2'}

projetos = sorted(glob.glob(os.path.join(a.pasta, 'projeto-*.json')))
if not projetos:
    raise SystemExit('nenhum projeto-N.json na pasta')

arquivos = {}  # caminho relativo à base do projeto → (arquivo local, nome plano)
for pj in projetos:
    p = json.load(open(pj))
    base = os.path.join(a.pasta, p.get('base') or 'midia')
    for raiz, _, fs in os.walk(base):
        for f in fs:
            local = os.path.join(raiz, f)
            rel = os.path.relpath(local, base).replace(os.sep, '/')
            arquivos[rel] = (local, rel.replace('/', '__'))


def plano(x):
    """Troca cada texto que é um caminho de mídia pelo nome plano."""
    if isinstance(x, dict):
        return {k: plano(v) for k, v in x.items()}
    if isinstance(x, list):
        return [plano(v) for v in x]
    if isinstance(x, str) and x in arquivos:
        return arquivos[x][1]
    return x


subidos = 0
for rel, (local, nome) in sorted(arquivos.items()):
    ponte.subir_grande(local, a.folder_id, nome, MIME.get(os.path.splitext(nome)[1].lower(), 'application/octet-stream'))
    subidos += 1
    print(f'  {nome} ({os.path.getsize(local) / 1e6:.1f} MB)', flush=True)

tmp = tempfile.mkdtemp()
for pj in projetos:
    p = plano(json.load(open(pj)))
    p['base'] = '.'
    if a.revisar:
        p['revisao'] = {'obrigatoria': True, 'motivo': a.revisar, 'quem': 'Lorena'}
    out = os.path.join(tmp, os.path.basename(pj))
    json.dump(p, open(out, 'w'), ensure_ascii=False, indent=1)
    ponte.subir_grande(out, a.folder_id, os.path.basename(pj), 'application/json')  # por último: o Studio só lista com o projeto
print(f'OK: {len(projetos)} projeto(s) e {subidos} arquivos na pasta {a.folder_id}'
      + (f' · revisão obrigatória: {a.revisar}' if a.revisar else ''))
