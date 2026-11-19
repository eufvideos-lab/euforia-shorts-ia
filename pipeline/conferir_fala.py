#!/usr/bin/env python3
"""Conferência da fala antes de entregar (19/11/2026): a máquina ouve o próprio corte, como a Lorena faria.

Transcreve de novo o áudio JÁ CORTADO e compara com o que o plano manda falar. Barra a entrega quando acha:
- palavra comida numa emenda (some do áudio ou sobra pedaço: "gundo", "ultrapassar");
- frase repetida (a 1ª tomada ficou: "E uma briga imensa começa... E uma briga imensa começa...");
- pedaço de menos de 0,5 s entre cortes (frame solto).
Cada um desses foi um pedido de ajuste da Lorena entre 06 e 19/11.

Uso:
  Longo:  python3 pipeline/conferir_fala.py longo pedidos/<id>             (depois do longos/cortar.py)
  Short:  python3 pipeline/conferir_fala.py short pedidos/<id> props_0.json [video_fala]
Saída: conferencia.json e conferencia.md na pasta; código 0 = ok, 2 = achou problema (corrija e rode de novo).
--sem-transcrever usa conferencia_transcricao.json já salvo (para testar sem gastar).
"""
import difflib, json, os, re, subprocess, sys, unicodedata

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)

CURTAS = {'a', 'o', 'e', 'de', 'do', 'da', 'que', 'um', 'uma', 'é', 'eu', 'se', 'em', 'no', 'na', 'os', 'as', 'pra',
          'para', 'com', 'não', 'nao', 'ele', 'ela', 'tá', 'ta', 'né', 'ne', 'aí', 'ai', 'só', 'so', 'mas', 'por'}


def norm(s):
    s = unicodedata.normalize('NFD', (s or '').lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', '', s)


def transcrever(audio):
    import ponte
    return ponte.transcrever(audio)['words']


def comparar(esperado, ouvido, emendas, curtos, janela=1.6):
    """esperado/ouvido: [{'w': texto, 't': segundos no vídeo cortado}]. emendas: tempos (s) dos cortes no vídeo.
    Devolve a lista de problemas (cada um com tipo, tempo e texto)."""
    probs = []
    E = [(norm(x['w']), x) for x in esperado if norm(x['w'])]
    O = [(norm(x['w']), x) for x in ouvido if norm(x['w'])]
    for T in emendas:
        e = [(n, x) for n, x in E if abs(x['t'] - T) <= janela]
        o = [(n, x) for n, x in O if abs(x['t'] - T) <= janela + 0.6]
        if len(e) < 2 or not o:
            continue
        sm = difflib.SequenceMatcher(a=[n for n, _ in e], b=[n for n, _ in o], autojunk=False)
        for op, a0, a1, b0, b1 in sm.get_opcodes():
            if op == 'equal':
                continue
            falt = [x for n, x in e[a0:a1] if abs(x['t'] - T) <= 0.8 and len(n) >= 3]
            if not falt:
                continue
            ouv = ' '.join(x['w'] for _, x in o[b0:b1])
            # pedaço de palavra ("gundo" no lugar de "segundo") ou palavra que sumiu bem na emenda
            pedaco = any(len(nb) >= 2 and nb != na and (na.endswith(nb) or na.startswith(nb))
                         for na, _ in e[a0:a1] for nb, _ in o[b0:b1])
            if op == 'delete' or pedaco:
                probs.append({'tipo': 'palavra cortada', 't': round(T, 2),
                              'texto': f"esperado \"{' '.join(x['w'] for x in falt)}\", ouvido \"{ouv or '(nada)'}\""})
    # frase repetida: 4 palavras seguidas iguais (2 não triviais) duas vezes em até 20 s
    n = [nn for nn, _ in O]
    k = 0
    while k < len(n) - 4:
        chave = n[k:k + 4]
        if sum(1 for x in chave if x not in CURTAS) >= 2:
            for j in range(k + 4, len(n) - 3):
                if O[j][1]['t'] - O[k][1]['t'] > 20:
                    break
                if n[j:j + 4] == chave:
                    # só conta se o plano não manda repetir (ênfase de propósito aparece também no esperado)
                    no_plano = sum(1 for i in range(len(E) - 3) if [x for x, _ in E[i:i + 4]] == chave)
                    if no_plano < 2:
                        probs.append({'tipo': 'frase repetida', 't': round(O[k][1]['t'], 2),
                                      'texto': ' '.join(x['w'] for _, x in O[k:j + 4])[:160]})
                        k = j
                    break
        k += 1
    for a, b in curtos:
        probs.append({'tipo': 'frame solto', 't': round(a, 2), 'texto': f'pedaço de {b - a:.2f} s entre cortes'})
    return probs


def fmt(t):
    return f'{int(t // 60)}:{t % 60:04.1f}'


def longo(pasta):
    segs = json.load(open(os.path.join(pasta, 'segmentos.json')))
    W = json.load(open(os.path.join(pasta, 'transcricao.json')))['words']
    esperado = []
    for x in segs:
        for w in W:
            if w.get('word') and w['start'] >= x['s'] - 0.02 and w['end'] <= x['e'] + 0.15:
                esperado.append({'w': w['word'], 't': x['saida'] + max(0.0, w['start'] - x['s'])})
    emendas = [x['saida'] for x in segs[1:] if not x['join']]
    curtos = [(x['saida'], x['saida'] + x['dur']) for x in segs if x['dur'] < 0.5]
    audio = os.path.join(pasta, 'conferencia.mp3')
    lista = os.path.join(pasta, 'conferencia_lista.txt')
    with open(lista, 'w') as f:
        for k in range(len(segs)):
            f.write(f"file '{os.path.abspath(os.path.join(pasta, 'segs', f'{k:03d}.mkv'))}'\n")
    return esperado, emendas, curtos, audio, ['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lista,
                                               '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', audio]


def short(pasta, props_arq, video=None):
    P = json.load(open(props_arq if os.path.isabs(props_arq) else os.path.join(pasta, props_arq)))
    W = json.load(open(os.path.join(pasta, 'transcricao.json')))['words']
    segs = P['segments']
    esperado = []
    for s in segs:
        for w in W:
            if w.get('word') and w['start'] >= s['srcStart'] - 0.02 and w['end'] <= s['srcEnd'] + 0.15:
                esperado.append({'w': w['word'], 't': s['outStart'] + max(0.0, w['start'] - s['srcStart'])})
    emendas = [s['outStart'] for s in segs[1:]]
    curtos = [(s['outStart'], s['outStart'] + s['srcEnd'] - s['srcStart']) for s in segs if s['srcEnd'] - s['srcStart'] < 0.5]
    video = video or os.path.join(pasta, 'fonte.mp4')
    if not os.path.exists(video):
        raise SystemExit('informe o vídeo da fala (o fonte.mp4 do pedido)')
    audio = os.path.join(pasta, f"conferencia_{os.path.splitext(os.path.basename(props_arq))[0]}.mp3")
    # monta só a fala, na ordem dos cortes, sem música nem efeitos
    partes = ''.join(f"[0:a]atrim={s['srcStart']:.3f}:{s['srcEnd']:.3f},asetpts=PTS-STARTPTS[a{k}];" for k, s in enumerate(segs))
    filtro = partes + ''.join(f'[a{k}]' for k in range(len(segs))) + f'concat=n={len(segs)}:v=0:a=1[s]'
    return esperado, emendas, curtos, audio, ['ffmpeg', '-v', 'error', '-y', '-i', video, '-filter_complex', filtro,
                                               '-map', '[s]', '-ac', '1', '-ar', '16000', '-b:a', '48k', audio]


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    sem = '--sem-transcrever' in sys.argv
    modo, pasta = args[0], args[1]
    if modo == 'longo':
        esperado, emendas, curtos, audio, cmd = longo(pasta)
        base = 'conferencia'
    else:
        esperado, emendas, curtos, audio, cmd = short(pasta, args[2], args[3] if len(args) > 3 else None)
        base = 'conferencia_' + os.path.splitext(os.path.basename(args[2]))[0]
    cache = os.path.join(pasta, base + '_transcricao.json')
    if sem and os.path.exists(cache):
        ouvido_w = json.load(open(cache))
    else:
        subprocess.run(cmd, check=True)
        ouvido_w = transcrever(audio)
        json.dump(ouvido_w, open(cache, 'w'), ensure_ascii=False)
    ouvido = [{'w': w['word'], 't': w['start']} for w in ouvido_w]
    probs = comparar(esperado, ouvido, emendas, curtos)
    json.dump({'problemas': probs, 'emendas': len(emendas)}, open(os.path.join(pasta, base + '.json'), 'w'),
              ensure_ascii=False, indent=1)
    linhas = [f'# Conferência da fala ({len(emendas)} emendas ouvidas)', '']
    linhas += [f"- {fmt(p['t'])} · {p['tipo']}: {p['texto']}" for p in probs] or ['Nenhum problema: nenhuma palavra comida, '
                                                                                  'nenhuma frase repetida, nenhum frame solto.']
    open(os.path.join(pasta, base + '.md'), 'w').write('\n'.join(linhas) + '\n')
    print('\n'.join(linhas))
    sys.exit(2 if probs else 0)


if __name__ == '__main__':
    main()
