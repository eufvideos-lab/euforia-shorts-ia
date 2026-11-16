#!/usr/bin/env python3
"""Editor Euforia, etapa 1: transforma o que a máquina de shorts montou num projeto que abre no editor.
Uso: python3 pipeline/projeto_editor.py PASTA_DO_PEDIDO SAIDA [--cliente "Nome"] [--composicao ShortViral|ShortInstitucional]
Lê PASTA/props_N.json (de produzir.py), plano.json e resultado.json (registro da máquina).
Gera em SAIDA/: projeto-N.json (um por short) e midia/ com o vídeo vertical, B-rolls, logo e trilha que o short usa,
mais os outros B-rolls baixados para o pedido (biblioteca, para a pessoa trocar).
Abrir: servir SAIDA junto com remotion/editor/dist e abrir index.html?projeto=projeto-1.json"""
import argparse, glob, json, os, re, shutil

ap = argparse.ArgumentParser()
ap.add_argument('pasta'); ap.add_argument('saida')
ap.add_argument('--cliente', default=None)
ap.add_argument('--composicao', default=None, choices=['ShortViral', 'ShortInstitucional'])
a = ap.parse_args()

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(RAIZ, 'remotion', 'public')
pasta = os.path.abspath(a.pasta)
pid = re.sub(r'[^a-z0-9]+', '-', os.path.basename(pasta).lower()).strip('-')
plano = json.load(open(os.path.join(pasta, 'plano.json')))
res_arq = os.path.join(pasta, 'resultado.json')
log = json.load(open(res_arq)).get('log', []) if os.path.exists(res_arq) else []
if not log and os.path.exists(os.path.join(pasta, 'run.log')):  # ainda renderizando: usa o registro do terminal
    log = [l.rstrip() for l in open(os.path.join(pasta, 'run.log')) if l.startswith('[')]
midia = os.path.join(a.saida, 'midia')
os.makedirs(midia, exist_ok=True)


def copiar(rel):
    """Copia um arquivo de remotion/public para SAIDA/midia mantendo o caminho (é o que o staticFile pede)."""
    if not rel:
        return
    src, dst = os.path.join(PUBLIC, rel), os.path.join(midia, rel)
    if os.path.exists(src) and not os.path.exists(dst):
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)


# descrição dos B-rolls do banco, tirada do registro ("usando pixabay 74507 (industry, factory, ...)")
desc = {}
for l in log:
    m = re.search(r'pixabay (\d+) \(([^)]*)', l)
    if m:
        desc[m.group(1)] = ', '.join(m.group(2).split(', ')[:3])

biblioteca = []
for arq in sorted(glob.glob(os.path.join(PUBLIC, pid, 'px_*.mp4'))):
    rel = f'{pid}/{os.path.basename(arq)}'
    num = re.search(r'px_(\d+)', arq).group(1)
    biblioteca.append({'src': rel, 'descricao': desc.get(num, f'banco {num}')})
    copiar(rel)

feitos = []
for arq in sorted(glob.glob(os.path.join(pasta, 'props_*.json'))):
    n = int(re.search(r'props_(\d+)', arq).group(1))
    props = json.load(open(arq))
    sh = plano['shorts'][n] if n < len(plano.get('shorts', [])) else {}
    for rel in [props.get('video'), props.get('logo'), (props.get('musica') or {}).get('src')] + \
               [b['src'] for b in props.get('brolls', [])] + [c.get('foto') for c in props.get('cartoes', []) or []]:
        copiar(rel)
    comp = a.composicao or ('ShortViral' if props['estilo'].get('corDestaque', '').upper() == '#FAC800' else 'ShortInstitucional')
    registro = [l.strip() for l in log if l.strip() and 'short ' not in l or f'short {n + 1}' in l]
    registro = [re.sub(r'^\[\s*(\d+)s\]', r'[\1 s]', l) for l in registro]
    registro = [re.sub(r'\((([^,()]+, ){3})[^)]*\)', lambda m: '(' + m.group(1).rstrip(', ') + ')', l) for l in registro]  # etiquetas: só 3
    registro = [re.sub(r'/\S+/([^/\s]+)', r'\1', l) for l in registro]  # sem caminho da máquina
    projeto = {
        'versao': 1,
        'id': f'{pid}-short-{n + 1}',
        'cliente': a.cliente or pid,
        'titulo': sh.get('titulo') or f'Short {n + 1}',
        'composicao': comp,
        'base': 'midia',
        'props': props,
        'registro': registro,
        'maquina': {k: sh.get(k) for k in ('por_que', 'nota_confianca', 'gancho') if sh.get(k) is not None},
        'biblioteca': biblioteca,
    }
    saida = os.path.join(a.saida, f'projeto-{n + 1}.json')
    json.dump(projeto, open(saida, 'w'), ensure_ascii=False, indent=1)
    feitos.append(saida)

print('\n'.join(feitos) if feitos else 'nenhum props_N.json na pasta (rode produzir.py antes)')
