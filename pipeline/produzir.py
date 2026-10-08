#!/usr/bin/env python3
"""Etapa 2 do pedido: monta, renderiza e sobe os shorts.
Uso:
  python3 produzir.py PASTA_DO_PEDIDO --modelo institucional|viral --cliente "Ana Mangia" \
      --pasta-drive FOLDER_ID [--cor #D45C78 --cor-fundo #FDFBF7 --cor-texto #186C64] [--logo logo.png] [--musica auto|nao]
Lê PASTA/plano.json (feito pelo Claude com prompts/escolher_trechos.md) e os arquivos da etapa 1.
Escreve PASTA/resultado.json com os links do Drive."""
import argparse, json, os, re, shutil, subprocess, sys, time
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import ponte, analise

RAIZ = os.path.dirname(AQUI)
REMOTION = os.path.join(RAIZ, 'remotion')
MUSICA_PADRAO = '1gwHG_OijcK-BbghdCOWYgjzLZFyqduhf'  # corporate-soft-background-music (Pixabay, uso livre)
EVITAR = ('cartoon', 'animation', 'animated', 'illustration', 'drawing', '3d', 'render', 'logo', 'text', 'ai generated', 'ai-generated', 'generated')

ap = argparse.ArgumentParser()
ap.add_argument('pasta'); ap.add_argument('--modelo', required=True, choices=['institucional', 'viral'])
ap.add_argument('--cliente', required=True); ap.add_argument('--pasta-drive', required=True)
ap.add_argument('--cor', default=None); ap.add_argument('--cor-fundo', default='#FDFBF7'); ap.add_argument('--cor-texto', default='#186C64')
ap.add_argument('--logo', default=None); ap.add_argument('--musica', default='auto')
ap.add_argument('--so-render', action='store_true', help='não sobe no Drive (teste)')
ap.add_argument('--shorts', default=None, help='refazer só estes shorts, ex.: 2 ou 1,3')
a = ap.parse_args()

pasta = os.path.abspath(a.pasta)
pid = re.sub(r'[^a-z0-9]+', '-', os.path.basename(pasta).lower()).strip('-')
pub = os.path.join(REMOTION, 'public', pid)
os.makedirs(pub, exist_ok=True)
fonte = os.path.join(pasta, 'fonte.mp4')
info = json.load(open(os.path.join(pasta, 'planos.json')))
plano = json.load(open(os.path.join(pasta, 'plano.json')))
cor = a.cor or ('#FAC800' if a.modelo == 'viral' else '#D45C78')
t0 = time.time()
log = []

def passo(msg):
    log.append(f'[{time.time() - t0:5.0f}s] {msg}'); print(log[-1], flush=True)

# 1) trilha vertical com o rosto no centro
vertical = os.path.join(pub, 'vertical.mp4')
if not os.path.exists(vertical):
    passo('recortando vertical com rosto centralizado')
    # só até onde os shorts usam (o começo fica, para não deslocar os tempos)
    import sys as _s; _s.path.insert(0, AQUI)
    from montar_short import alinhar_pontuacao
    _tr = json.load(open(os.path.join(pasta, 'transcricao.json')))
    _pal = alinhar_pontuacao(_tr['text'], _tr['words'])
    _fim = max(_pal[min(len(_pal) - 1, sh['fim_i'] + 1)]['e'] for sh in plano['shorts']) + 3
    analise.recortar_vertical(fonte, vertical, info, t1=min(info.get('duracao', _fim), _fim))

# 2) B-rolls: os que já existem no vídeo (#k) e os do banco (Pixabay)
brolls_fonte = [p for p in info['planos'] if p['tipo'] == 'broll' and p['fim'] - p['ini'] >= 0.8]
mapa = {}
mapa_antigo = os.path.join(pasta, 'brolls_map.json')
if a.shorts and os.path.exists(mapa_antigo):
    mapa.update(json.load(open(mapa_antigo)))
for n_sh, sh in enumerate(plano['shorts']):
    if a.shorts and str(n_sh + 1) not in a.shorts.split(','):
        continue
    for br in sh.get('brolls', []):
        chave = br['busca']
        if chave in mapa and not (a.shorts and not chave.startswith('#')):
            continue
        if chave.startswith('#'):
            k = int(chave[1:]); p = brolls_fonte[k]
            out = os.path.join(pub, f'fonte_{k}.mp4')
            analise.clipe_broll_fonte(fonte, p, p['ini'], p['fim'], out, info)
            mapa[chave] = f'{pid}/fonte_{k}.mp4'
            continue
        passo(f'buscando B-roll: {chave}')
        try:
            hits = ponte.broll_buscar(chave, 10)
        except Exception as e:
            passo(f'  falhou a busca: {e}'); mapa.pop(chave, None); continue
        # só entra vídeo cujas etiquetas batem com o pedido (melhor sem B-roll do que B-roll sem relação)
        palavras = [w for w in re.findall(r'[a-z]+', chave.lower()) if w not in ('a', 'an', 'the', 'of', 'in', 'on', 'at', 'with', 'and', 'to', 'home')]
        def nota(h):
            tags = (h.get('tags') or '').lower()
            return sum(1 for w in palavras if re.search(r'\b' + w.rstrip('s'), tags))
        minimo = max(1, (len(palavras) + 1) // 2)
        bons = [h for h in hits if h.get('url') and not any(t in (h.get('tags') or '').lower() for t in EVITAR) and nota(h) >= minimo]
        bons.sort(key=lambda h: (-nota(h), h.get('duracao', 0) < br.get('duracao', 2) + 0.5, -(h.get('altura') or 0)))
        if not bons:
            passo(f'  nada no banco combina com "{chave}" (sem B-roll aqui)'); mapa.pop(chave, None); continue
        h = bons[0]
        bruto = os.path.join(pasta, f'px_{h["id"]}.mp4')
        ponte.broll_baixar(h['url'], bruto)
        out = os.path.join(pub, f'px_{h["id"]}.mp4')
        analise.clipe_vertical_cobrir(bruto, out, dur=min(h.get('duracao', 8), br.get('duracao', 3) + 1))
        mapa[chave] = f'{pid}/px_{h["id"]}.mp4'
        passo(f'  usando pixabay {h["id"]} ({h.get("tags")})')
json.dump(mapa, open(os.path.join(pasta, 'brolls_map.json'), 'w'))

# 3) música, se o vídeo de origem não tiver trilha
musica = None
if a.musica == 'auto' and not info.get('tem_trilha'):
    mp = os.path.join(pub, 'musica.mp3')
    if not os.path.exists(mp):
        passo('baixando trilha de fundo')
        ponte.baixar(MUSICA_PADRAO, mp)
    musica = {'src': f'{pid}/musica.mp3', 'volume': 0.07}

logo = None
if a.logo:
    shutil.copy(a.logo, os.path.join(pub, 'logo' + os.path.splitext(a.logo)[1]))
    logo = f'{pid}/logo' + os.path.splitext(a.logo)[1]

# 4) cada short: montar, cobrir os B-rolls que já existem no trecho, renderizar, subir
saida_dir = os.path.join(pasta, 'saida'); os.makedirs(saida_dir, exist_ok=True)
resultado = {'shorts': [], 'log': log}
comp = 'ShortInstitucional' if a.modelo == 'institucional' else 'ShortViral'
env = dict(os.environ)
if not env.get('CHROME'):
    import glob
    c = glob.glob('/opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell')
    if c:
        env['CHROME'] = c[0]
so = {int(x) - 1 for x in a.shorts.split(',')} if a.shorts else None
for n, sh in enumerate(plano['shorts']):
    if so is not None and n not in so:
        continue
    props = os.path.join(pasta, f'props_{n}.json')
    cmd = [sys.executable, os.path.join(AQUI, 'montar_short.py'), os.path.join(pasta, 'transcricao.json'),
           os.path.join(pasta, 'plano.json'), str(n), props, '--modelo', a.modelo, '--video', f'{pid}/vertical.mp4',
           '--video-arquivo', fonte, '--brolls', os.path.join(pasta, 'brolls_map.json'), '--cor', cor]
    if a.modelo == 'institucional':
        cmd += ['--cor-fundo', a.cor_fundo, '--cor-texto', a.cor_texto]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        passo(f'short {n + 1}: plano rejeitado: {r.stdout} {r.stderr}')
        resultado['shorts'].append({'n': n + 1, 'titulo': sh.get('titulo'), 'erro': (r.stdout + r.stderr)[-400:]})
        continue
    P = json.load(open(props))
    # B-rolls que a equipe já colocou no vídeo e caem dentro do trecho: entram inteiros (encaixados)
    ocupado = [(b['start'], b['end']) for b in P['brolls']]
    extra = 0
    for s in P['segments']:
        for k, p in enumerate(brolls_fonte):
            ini, fim = max(s['srcStart'], p['ini']), min(s['srcEnd'], p['fim'])
            if fim - ini < 0.6:
                continue
            o0 = s['outStart'] + ini - s['srcStart']; o1 = s['outStart'] + fim - s['srcStart']
            if any(not (o1 <= x0 or o0 >= x1) for x0, x1 in ocupado):
                continue
            out = os.path.join(pub, f'enc_{n}_{extra}.mp4')
            analise.clipe_broll_fonte(fonte, p, ini, fim, out, info)
            P['brolls'].append({'start': round(o0, 3), 'end': round(o1, 3), 'src': f'{pid}/enc_{n}_{extra}.mp4', 'mode': 'cheio'})
            extra += 1
    if P['brolls'] and P['brolls'][0]['start'] < 0.25:
        P['brolls'][0]['start'] = 0.0
    P['brolls'].sort(key=lambda b: b['start'])
    P['musica'] = musica; P['logo'] = logo
    json.dump(P, open(props, 'w'), ensure_ascii=False)
    titulo = re.sub(r'[\\/:*?"<>|]+', '', sh.get('titulo', f'short {n + 1}'))[:60].strip()
    nome = f"{a.cliente.upper()} - SHORT {n + 1} - {titulo}.mp4"
    destino = os.path.join(saida_dir, nome)
    passo(f'renderizando short {n + 1} ({P["duration"]:.0f}s, {len(P["brolls"])} B-rolls, {len(P.get("cartoes") or [])} cartões)')
    r = subprocess.run(['node', 'render.mjs', props, destino, comp], cwd=REMOTION, env=env, capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(destino):
        passo(f'short {n + 1}: render falhou: {r.stderr[-400:]}')
        resultado['shorts'].append({'n': n + 1, 'titulo': sh.get('titulo'), 'erro': r.stderr[-400:]})
        continue
    item = {'n': n + 1, 'titulo': sh.get('titulo'), 'arquivo': destino, 'duracao': P['duration']}
    if not a.so_render:
        up = ponte.subir(destino, a.pasta_drive, nome)
        item['link'] = up.get('link'); item['id'] = up.get('id')
        passo(f'short {n + 1} no Drive: {item["link"]}')
    resultado['shorts'].append(item)

resultado['minutos'] = round((time.time() - t0) / 60, 1)
json.dump(resultado, open(os.path.join(pasta, 'resultado.json'), 'w'), ensure_ascii=False, indent=1)
print(json.dumps(resultado, ensure_ascii=False, indent=1))
