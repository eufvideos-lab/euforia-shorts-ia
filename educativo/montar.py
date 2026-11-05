"""Monta uma peça do modelo Educativo: junta as falas (mp3 + tempos por palavra) com as pausas,
gera narracao.mp3 e o props.json da composição Educativo do Remotion.
Uso: python3 educativo/montar.py educativo/pecas/<peca>.json   (rodar na raiz do repo)
As falas ficam em remotion/public/<pasta>/sN.mp3 e sN.json (palavras com s/e em segundos)."""
import json, subprocess, sys, unicodedata, os

def norm(w):
    w = unicodedata.normalize('NFD', w.lower())
    return ''.join(c for c in w if c.isalnum())

peca = json.load(open(sys.argv[1]))
pub = os.path.join('remotion', 'public')
pasta = os.path.join(pub, peca['pasta'])
fps = 30
t = 0.0
ancoras = {'inicio': 0.0}
falas, palavras, entradas = {}, [], []
for item in peca['audio']:
    if item[0] == 'pausa':
        if len(item) > 2:
            ancoras[item[2]] = t
            ancoras[item[2] + ':fim'] = t + item[1]
        t += item[1]
        continue
    nome = item[0]
    ws = json.load(open(os.path.join(pasta, nome + '.json')))
    dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', os.path.join(pasta, nome + '.mp3')]).decode())
    falas[nome] = (t, ws)
    ancoras[nome + ':inicio'] = t
    ancoras[nome + ':fim'] = t + ws[-1]['e']
    entradas.append((nome, t))
    for i, w in enumerate(ws):
        txt = w['t']
        for de, para in peca.get('trocas', {}).items():  # pronúncia na fala, grafia certa na legenda
            txt = txt.replace(de, para)
        palavras.append({'t': txt, 's': round(t + w['s'], 3), 'e': round(t + w['e'], 3), 'f': nome, 'fimFrase': i == len(ws) - 1})
    t += dur
total = t
ancoras['final'] = total

def a(ref):
    menos = 0.0
    if ref.endswith(':fim') and ref[:-4] in falas:
        menos = 1.2  # check aparece nas últimas palavras da fala
    if ref in ancoras:
        return round(ancoras[ref] - menos, 3)
    nome, alvo = ref.split(':', 1)
    ini, ws = falas[nome]
    for w in ws:
        if norm(w['t']).startswith(norm(alvo)):
            return round(ini + w['s'], 3)
    raise SystemExit(f'âncora não achada: {ref}')

def resolver(o):
    if isinstance(o, dict):
        r = {}
        for k, v in o.items():
            if k in ('de', 'ate', 'em', 'contagem') and isinstance(v, str):
                r[k] = a(v)
                if k == 'contagem':
                    r['revela'] = a(v + ':fim')
            else:
                r[k] = resolver(v)
        return r
    if isinstance(o, list):
        return [resolver(x) for x in o]
    return o

# narração única
saida = os.path.join(pasta, 'narracao.mp3')
args = ['ffmpeg', '-y', '-v', 'error']
filtros = []
for i, (nome, ini) in enumerate(entradas):
    args += ['-i', os.path.join(pasta, nome + '.mp3')]
    ms = int(ini * 1000)
    filtros.append(f'[{i}]adelay={ms}|{ms}[a{i}]')
mix = ''.join(f'[a{i}]' for i in range(len(entradas)))
filtros.append(f'{mix}amix=inputs={len(entradas)}:normalize=0,apad,atrim=0:{total:.3f}[out]')
subprocess.check_call(args + ['-filter_complex', ';'.join(filtros), '-map', '[out]', '-ar', '44100', '-b:a', '192k', saida])

props = {
    'fps': fps, 'largura': 1920, 'altura': 1080, 'duracao': round(total, 3),
    'selo': peca['selo'], 'audio': peca['pasta'] + '/narracao.mp3',
    'trilha': peca.get('trilha'),
    'capitulos': resolver(peca['capitulos']),
    'cenas': resolver(peca['cenas']),
    'checks': resolver(peca.get('checks', [])),
    'legendas': palavras,
}
destino = os.path.join(pasta, 'props.json')
json.dump(props, open(destino, 'w'), ensure_ascii=False)
print(destino, f'{total:.1f}s')
