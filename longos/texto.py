#!/usr/bin/env python3
"""Texto certo e comandos de gravação na máquina de longos (07/11/2026).

Resolve dois problemas que a equipe via no vídeo:
1. Palavra errada na tela/legenda ("autoliderança" virava "liderança"): o Whisper escreve a palavra comum mais
   parecida. Aqui a transcrição é corrigida pelo roteiro (quando há) e pelo glossário do cliente, e o resto da máquina
   (palavras.txt, legenda, textos-chave) já lê a palavra certa.
2. "Corta" que não corta: a pessoa erra, diz "corta" (ou "de novo", "errei") e regrava, às vezes voltando várias
   frases. Aqui cada comando é achado, invalida a tomada que estava em andamento, e as frases do roteiro são
   escolhidas de trás para frente (a regravação sempre ganha da passada errada).

Uso pelo preparar.py; também roda sozinho para conferir uma pasta já transcrita:
    python3 longos/texto.py PASTA [--roteiro roteiro.txt] [--cliente cliente.json]

cliente.json (copiado da ficha do cliente; todas as chaves são opcionais):
    {"vocabulario": ["autoliderança"],
     "correcoes": {"alto liderança": "autoliderança", "auto liderança": "autoliderança"},
     "palavras_corte": ["corta", "corte", "de novo", "errei", "vou repetir", "deixa eu repetir", "pera"]}
"""
import difflib, json, os, re, sys, unicodedata

CORTE_PADRAO = ['corta', 'corte', 'de novo', 'errei', 'vou repetir', 'deixa eu repetir', 'deixa eu voltar', 'vou voltar', 'pera', 'vou de novo',
                'vamos de novo', 'gravando de novo']
LIMITE = 0.75      # semelhança mínima para uma tomada contar como a frase do roteiro
FOLGA = 3          # palavras a mais ou a menos que a janela de uma frase aceita
GAP_CORTE = 2.0    # tomada que terminou até 2 s antes do "corta" (ou o atravessa) é a que estava em andamento
CURTAS = {'a', 'o', 'e', 'é', 'de', 'da', 'do', 'que', 'um', 'uma', 'em', 'no', 'na', 'pra', 'para', 'com', 'se',
          'os', 'as', 'eu', 'ele', 'ela', 'mas', 'não', 'por', 'isso', 'aí', 'né', 'então', 'tipo', 'assim'}


def norm(s):
    s = unicodedata.normalize('NFD', (s or '').lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]', '', s)


def limpar(p):
    """Palavra do roteiro sem a pontuação das pontas (mantém acento, maiúscula e hífen do meio)."""
    return re.sub(r'^[^\wÀ-ÿ]+|[^\wÀ-ÿ]+$', '', p)


# ---------------------------------------------------------------- roteiro
def frases_roteiro(texto):
    """Quebra o roteiro em frases (lista de palavras como estão escritas). Tira marcações de edição: [CORTE SHORT 1],
    {nota}, títulos markdown e rótulos de linha ("GANCHO:", "Bloco 2 -")."""
    texto = re.sub(r'\[[^\]]*\]|\{[^}]*\}', ' ', texto or '')
    linhas = []
    for ln in texto.splitlines():
        ln = ln.strip()
        if not ln or ln.startswith(('#', '---')):
            continue
        ln = re.sub(r'^\s*(?:[-*•]|\d+[.)])\s+', '', ln)
        ln = re.sub(r'^[A-ZÀ-Ú0-9 ]{2,30}\s*[:\-–]\s+', '', ln)          # "GANCHO: ...", "BLOCO 2 - ..."
        ln = re.sub(r'^(?:\w+\s){0,2}\w+:\s+(?=[A-ZÀ-Ú"“])', '', ln)      # "Fala 1: Hoje ..."
        linhas.append(ln)
    corrido = ' '.join(linhas)
    out = []
    for f in re.split(r'(?<=[.!?…;])\s+', corrido):
        ws = [limpar(p) for p in f.split()]
        ws = [w for w in ws if norm(w)]
        if ws:
            out.append(ws)
    return out


def vocabulario(roteiro_txt, cliente):
    """Palavras para o Whisper reconhecer (glossário do cliente + palavras raras do roteiro + comandos de corte)."""
    vistos, out = set(), []
    def por(w):
        n = norm(w)
        if n and n not in vistos:
            vistos.add(n); out.append(w)
    for w in cliente.get('vocabulario') or []:
        por(w)
    for v in (cliente.get('correcoes') or {}).values():
        por(v)
    raras = []
    for f in frases_roteiro(roteiro_txt or ''):
        for k, w in enumerate(f):
            n = norm(w)
            if len(n) >= 9 or '-' in w or (k > 0 and w[:1].isupper() and len(n) >= 4):
                raras.append(w)
    for w in sorted(set(raras), key=lambda w: (-len(norm(w)), w)):
        por(w)
    return out


def prompt_whisper(roteiro_txt, cliente, limite=600):
    """Texto curto para o campo prompt/hotwords do Whisper (whisper-1 aceita ~224 tokens: corta em ~600 letras)."""
    cmds = cliente.get('palavras_corte') or CORTE_PADRAO
    base = 'Corta. De novo. Errei. '
    voc = vocabulario(roteiro_txt, cliente)
    txt = base
    for w in voc:
        if len(txt) + len(w) + 2 > limite:
            break
        txt += w + ', '
    if not voc and not roteiro_txt:
        return base.strip() if cmds else ''
    return txt.rstrip(', ') + '.'


# ---------------------------------------------------------------- glossário
def aplicar_correcoes(W, correcoes, log):
    """"alto liderança" → "autoliderança": a 1ª palavra recebe o texto certo e o fim da última; as outras ficam
    vazias (o índice das palavras não muda, o plano continua valendo)."""
    if not correcoes:
        return
    regras = sorted(((k.split(), v) for k, v in correcoes.items()), key=lambda r: -len(r[0]))
    n = [norm(w['word']) for w in W]
    for errado, certo in regras:
        alvo = [norm(x) for x in errado]
        juntos = norm(''.join(errado))
        L = len(alvo)
        for i in range(len(W)):
            if W[i].get('junto'):
                continue
            if n[i:i + L] == alvo:
                L2 = L
            elif n[i] in (juntos, norm(certo)):  # o Whisper juntou, ou escreveu sem acento / com hífen
                L2 = 1
            else:
                continue
            if L2 == 1 and W[i]['word'] == certo:
                continue
            antes = ' '.join(w['word'] for w in W[i:i + L2])
            W[i].setdefault('orig', W[i]['word'])
            W[i]['word'] = certo
            W[i]['end'] = W[i + L2 - 1]['end']
            for j in range(i + 1, i + L2):
                W[j].setdefault('orig', W[j]['word'])
                W[j]['word'] = ''; W[j]['junto'] = True
                n[j] = ''
            n[i] = norm(certo)
            log.append({'palavra': i, 'tempo': round(W[i]['start'], 1), 'antes': antes, 'depois': certo, 'por': 'glossário'})


# ---------------------------------------------------------------- comandos de corte
def achar_comandos(W, cmds):
    """Toda ocorrência de um comando de corte na transcrição: [{'ini','fim','texto','t'}]."""
    n = [norm(w['word']) for w in W]
    seqs = sorted({tuple(norm(x) for x in c.split()) for c in cmds}, key=len, reverse=True)
    out, usado = [], set()
    for i in range(len(W)):
        if i in usado or not n[i]:
            continue
        for s in seqs:
            if tuple(n[i:i + len(s)]) == s:
                out.append({'ini': i, 'fim': i + len(s) - 1, 'texto': ' '.join(w['word'] for w in W[i:i + len(s)]),
                            't': round(W[i]['start'], 2)})
                usado.update(range(i, i + len(s)))
                break
    return out


def parece_regravacao(W, c, viz=15):
    """Sem roteiro: o comando é de gravação se tem pausa em volta ou se a fala logo depois repete a de antes."""
    i, f = c['ini'], c['fim']
    pausa_antes = i > 0 and W[i]['start'] - W[i - 1]['end'] >= 0.4
    pausa_depois = f + 1 < len(W) and W[f + 1]['start'] - W[f]['end'] >= 0.4
    antes = [norm(w['word']) for w in W[max(0, i - viz):i]]
    depois = [norm(w['word']) for w in W[f + 1:f + 1 + viz]]
    bi = lambda xs: {(a, b) for a, b in zip(xs, xs[1:]) if a and b and not (a in CURTAS and b in CURTAS)}
    repete = len(bi(antes) & bi(depois)) >= 2
    return repete or (pausa_antes and pausa_depois), repete


# ---------------------------------------------------------------- alinhamento
def candidatas(Wn, R, inicio_min=0):
    """Tomadas possíveis de uma frase do roteiro (R = palavras normalizadas): [(ini, fim, semelhança)]."""
    n = len(R)
    if n == 0:
        return []
    ancoras = set(R[:3]) - {''}
    if n >= 3:
        ancoras -= CURTAS
        if not ancoras:
            ancoras = set(R[:3])
    achadas = []
    for s in range(inicio_min, len(Wn)):
        if Wn[s] not in ancoras:
            continue
        pos = R.index(Wn[s])
        s0 = max(0, s - pos)          # a âncora pode ser a 2ª ou 3ª palavra da frase
        melhor = None
        for L in range(max(1, n - FOLGA), n + FOLGA + 1):
            jan = [w for w in Wn[s0:s0 + L]]
            if len(jan) < L:
                break
            r = difflib.SequenceMatcher(None, R, jan, autojunk=False).ratio()
            if melhor is None or r > melhor[2] + 1e-9:
                melhor = (s0, s0 + L - 1, r)
        if melhor and melhor[2] >= LIMITE:
            achadas.append(melhor)
    # uma tomada por região: entre janelas que se cruzam, fica a mais parecida
    achadas.sort(key=lambda c: -c[2])
    finais = []
    for c in achadas:
        if all(c[1] < d[0] or c[0] > d[1] for d in finais):
            finais.append(c)
    return sorted(finais)


def corrigir_pelo_roteiro(W, Rorig, ini, fim, semelhanca, log, fi):
    """Copia a grafia do roteiro para as palavras da tomada escolhida."""
    R = [norm(w) for w in Rorig]
    idx = [k for k in range(ini, fim + 1) if not W[k].get('junto')]
    Wn = [norm(W[k]['word']) for k in idx]
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, R, Wn, autojunk=False).get_opcodes():
        if op == 'equal':
            for a, b in zip(range(i1, i2), range(j1, j2)):
                k = idx[b]
                if W[k]['word'] != Rorig[a]:
                    W[k].setdefault('orig', W[k]['word']); W[k]['word'] = Rorig[a]
        elif op == 'replace':
            certo = ' '.join(Rorig[i1:i2]); ouvido = ' '.join(W[idx[b]]['word'] for b in range(j1, j2))
            # só troca quando é a mesma palavra mal ouvida ("liderança"/"autoliderança"); se ela falou outra coisa,
            # fica o que ela falou (é o que o público ouve)
            parecido = difflib.SequenceMatcher(None, norm(certo), norm(ouvido)).ratio()
            if parecido < 0.6 and not (semelhanca >= 0.9 and (i2 - i1) == (j2 - j1)):
                continue
            ks = [idx[b] for b in range(j1, j2)]
            palavras = Rorig[i1:i2]
            # reparte as palavras do roteiro entre as posições ouvidas (o índice das palavras não muda)
            grupos = [[] for _ in ks]
            for m, p in enumerate(palavras):
                grupos[min(len(ks) - 1, m * len(ks) // len(palavras))].append(p)
            ultimo = max((g for g in range(len(ks)) if grupos[g]), default=0)
            for g, k in enumerate(ks):
                W[k].setdefault('orig', W[k]['word'])
                if grupos[g]:
                    W[k]['word'] = ' '.join(grupos[g])
                else:
                    W[k]['word'] = ''; W[k]['junto'] = True
            if ultimo < len(ks) - 1:
                W[ks[ultimo]]['end'] = W[ks[-1]]['end']
            log.append({'palavra': ks[0], 'tempo': round(W[ks[0]]['start'], 1), 'antes': ouvido, 'depois': certo,
                        'por': f'roteiro (frase {fi + 1})'})
        # delete/insert: a pessoa falou a menos ou a mais; fica o que ela falou


def processar(W, roteiro_txt=None, cliente=None):
    """Corrige W no lugar e devolve o relatório (frases, comandos, regravações, trechos sugeridos, correções)."""
    cliente = cliente or {}
    log = []
    aplicar_correcoes(W, cliente.get('correcoes'), log)
    Wn = [norm(w['word']) for w in W]
    cmds = achar_comandos(W, cliente.get('palavras_corte') or CORTE_PADRAO)
    frases = frases_roteiro(roteiro_txt) if roteiro_txt else []
    Rn = [[norm(w) for w in f] for f in frases]
    cand = [candidatas(Wn, R) for R in Rn]

    # comando que é texto do roteiro ("isso corta sua energia") não é comando
    validos = []
    for c in cmds:
        seq = [norm(W[k]['word']) for k in range(c['ini'], c['fim'] + 1)]
        do_roteiro = any(any(a <= c['ini'] and c['fim'] <= b for a, b, _ in cand[fi])
                         and any(Rn[fi][j:j + len(seq)] == seq for j in range(len(Rn[fi])))
                         for fi in range(len(frases)))
        if do_roteiro:
            continue
        real, repete = parece_regravacao(W, c)
        if frases or real:
            c['regravacao'] = repete
            validos.append(c)
        else:
            c['duvida'] = True
            validos.append(c)
    fortes = [c for c in validos if not c.get('duvida')]

    def invalida(a, b):
        ta, tb = W[a]['start'], W[b]['end']
        return any(ta < W[c['ini']]['start'] and tb > W[c['ini']]['start'] - GAP_CORTE for c in fortes)

    escolhidas, descartadas = {}, []
    limite = float('inf')
    for fi in range(len(frases) - 1, -1, -1):
        ok = [c for c in cand[fi] if W[c[1]]['end'] <= limite + 0.05 and not invalida(c[0], c[1])]
        if not ok:
            continue
        c = max(ok, key=lambda c: c[0])           # a última tomada válida
        escolhidas[fi] = c
        limite = W[c[0]]['start']
    for fi, cs in enumerate(cand):
        for c in cs:
            if escolhidas.get(fi) != c:
                motivo = 'comando de corte' if invalida(c[0], c[1]) else 'regravada depois'
                descartadas.append({'frase': fi + 1, 'ini': c[0], 'fim': c[1], 't': round(W[c[0]]['start'], 1),
                                    'motivo': motivo})
    for fi in sorted(escolhidas):
        a, b, r = escolhidas[fi]
        corrigir_pelo_roteiro(W, frases[fi], a, b, r, log, fi)
    # glossário de novo no fim: o roteiro também pode ter escrito diferente do jeito do cliente
    aplicar_correcoes(W, cliente.get('correcoes'), log)

    trechos = []
    for fi in sorted(escolhidas):
        a, b, _ = escolhidas[fi]
        if trechos and trechos[-1][1] + 1 >= a:
            trechos[-1][1] = max(trechos[-1][1], b)
        else:
            trechos.append([a, b])
    # o que fica de fora entre as frases escolhidas (é ali que caem os erros e os comandos)
    fora, ant = [], -1
    for a, b in trechos + ([[len(W), len(W)]] if trechos else []):
        if a - ant > 1:
            fora.append([ant + 1, a - 1])
        ant = b
    # o que cada comando derrubou: com roteiro, o pedaço de fora onde ele caiu; sem roteiro, as tomadas invalidadas
    for c in validos:
        tc = W[c['ini']]['start']
        c['saiu'] = [d for d in descartadas if d['motivo'] == 'comando de corte' and
                     W[d['ini']]['start'] < tc and W[d['fim']]['end'] > tc - GAP_CORTE]
        c['fora'] = next(([a, b] for a, b in fora if a <= c['ini'] <= b), None)
    rel = {
        'frases': [{'n': fi + 1, 'texto': ' '.join(f),
                    'status': ('ok' if escolhidas[fi][2] >= 0.9 else 'parafrase') if fi in escolhidas else 'nao_achada',
                    'ini': escolhidas[fi][0] if fi in escolhidas else None,
                    'fim': escolhidas[fi][1] if fi in escolhidas else None,
                    'semelhanca': round(escolhidas[fi][2], 2) if fi in escolhidas else None,
                    'tomadas': len(cand[fi])} for fi, f in enumerate(frases)],
        'comandos': validos,
        'descartadas': descartadas,
        'trechos_sugeridos': trechos,
        'fora': fora if frases else [],
        'correcoes': log,
    }
    if not frases:
        rel['regravacoes_provaveis'] = repeticoes(W)
    return rel


def repeticoes(W, minimo=4, janela_s=35, pausa=0.5):
    """Sem roteiro: a pessoa para, respira e repete o mesmo começo de frase logo depois (regravação mesmo sem o
    "corta" escrito). Pede: 4+ palavras iguais (2 delas não triviais), repetidas em até 35 s, com pausa antes da
    repetição. Devolve a 1ª passada, que é a que deve sair. É sugestão para o plano; o cortar.py não bloqueia."""
    n = [norm(w['word']) for w in W]
    out, i = [], 0
    while i < len(W) - minimo:
        chave = n[i:i + minimo]
        if sum(1 for x in chave if x and x not in CURTAS) < 2:
            i += 1; continue
        achou = None
        j = i + minimo
        while j < len(W) - minimo + 1 and W[j]['start'] - W[i]['start'] <= janela_s:
            if n[j:j + minimo] == chave and W[j]['start'] - W[j - 1]['end'] >= pausa:
                achou = j; break
            j += 1
        if achou is not None:
            out.append({'ini': i, 'fim': achou - 1, 't': round(W[i]['start'], 1), 'refeita_em': round(W[achou]['start'], 1),
                        'texto': ' '.join(w['word'] for w in W[i:achou] if w['word'])})
            i = achou
        else:
            i += 1
    return out


def fmt(t):
    return f'{int(t // 60)}:{t % 60:04.1f}'


def relatorio_md(rel, W):
    L = ['# Relatório do texto e dos cortes de gravação', '']
    fr = rel['frases']
    if fr:
        ok = sum(1 for f in fr if f['status'] == 'ok'); pa = sum(1 for f in fr if f['status'] == 'parafrase')
        na = [f for f in fr if f['status'] == 'nao_achada']
        L += [f'Roteiro: {len(fr)} frases, {ok} ok, {pa} paráfrases, {len(na)} não achadas.', '']
        if na:
            L += ['## Frases do roteiro não achadas na gravação', '']
            L += [f'- {f["n"]}. {f["texto"]}' for f in na] + ['']
    L += ['## Comandos de corte', '']
    if not rel['comandos']:
        L += ['Nenhum comando de corte achado.', '']
    vistos = set()
    for c in rel['comandos']:
        quando = fmt(c['t'])
        if c.get('duvida'):
            L.append(f'- {quando} no bruto: "{c["texto"]}" (dúvida: pode ser fala normal; conferir)')
            continue
        if c.get('fora'):
            a, b = c['fora']
            if tuple(c['fora']) in vistos:
                continue
            vistos.add(tuple(c['fora']))
            junto = [x['texto'] for x in rel['comandos'] if x.get('fora') == c['fora']]
            trecho = ' '.join(w['word'] for w in W[a:b + 1] if w['word'])
            if len(trecho) > 160:
                trecho = trecho[:75] + ' … ' + trecho[-75:]
            L.append(f'- {quando} no bruto: "{" / ".join(junto)}". Saiu {fmt(W[a]["start"])}–{fmt(W[b]["end"])} '
                     f'(palavras {a}–{b}): "{trecho}"')
            continue
        saiu = '; '.join(f'frase {d["frase"]} em {fmt(d["t"])} (palavras {d["ini"]}–{d["fim"]})' for d in c['saiu'])
        dentro = ' Atenção: caiu dentro de uma frase escolhida, conferir.' if rel['frases'] else ''
        L.append(f'- {quando} no bruto: "{c["texto"]}" (palavra {c["ini"]}). Saiu: {saiu or "o próprio comando"}.{dentro}')
    L.append('')
    if rel.get('regravacoes_provaveis'):
        L += ['## Regravações prováveis (fala repetida logo depois; a 1ª passada deve sair)', '']
        L += [f'- {fmt(r["t"])} (palavras {r["ini"]}–{r["fim"]}), refeita em {fmt(r["refeita_em"])}: "{r["texto"][:160]}"'
              for r in rel['regravacoes_provaveis']] + ['']
    outras = [d for d in rel['descartadas'] if d['motivo'] == 'regravada depois']
    if outras:
        L += ['## Tomadas repetidas que ficaram de fora (a última ganhou)', '']
        L += [f'- frase {d["frase"]}: tomada em {fmt(d["t"])} (palavras {d["ini"]}–{d["fim"]})' for d in outras] + ['']
    L += ['## Palavras corrigidas', '']
    if not rel['correcoes']:
        L += ['Nenhuma.', '']
    L += [f'- {fmt(c["tempo"])}: "{c["antes"]}" → "{c["depois"]}" ({c["por"]})' for c in rel['correcoes']]
    return '\n'.join(L) + '\n'


def rodar(pasta, roteiro=None, cliente=None):
    """Lê a transcrição original do Whisper (guardada em transcricao_whisper.json), corrige e grava
    transcricao.json (com o texto certo), texto.json e relatorio.md. Pode rodar quantas vezes quiser."""
    tr = os.path.join(pasta, 'transcricao.json'); orig = os.path.join(pasta, 'transcricao_whisper.json')
    if not os.path.exists(orig):
        os.replace(tr, orig)
    dados = json.load(open(orig))
    W = dados['words']
    rot = open(roteiro).read() if roteiro and os.path.exists(roteiro) else None
    cli = json.load(open(cliente)) if cliente and os.path.exists(cliente) else {}
    rel = processar(W, rot, cli)
    json.dump({**dados, 'words': W}, open(tr, 'w'), ensure_ascii=False)
    json.dump(rel, open(os.path.join(pasta, 'texto.json'), 'w'), ensure_ascii=False, indent=1)
    open(os.path.join(pasta, 'relatorio.md'), 'w').write(relatorio_md(rel, W))
    return rel


def limpar_trechos(trechos, rel, W, max_regravacao=25):
    """Tira dos trechos do plano o que nunca deve ir ao ar: cada comando de gravação (com o pedaço interrompido logo
    antes dele e o complemento "do começo"/"daqui" logo depois) e a 1ª passada das regravações curtas (até 25
    palavras; as maiores ficam só no relatório, para o plano decidir). Devolve (trechos_novos, removidos)."""
    tirar = {}
    for c in rel.get('comandos', []):
        if c.get('duvida'):
            continue
        a = c['ini']
        while a > 0 and W[a]['start'] - W[a - 1]['end'] < 0.5 and c['ini'] - a < 25:
            a -= 1
        b = c['fim']
        while b + 1 < len(W) and b - c['fim'] < 3 and W[b + 1]['start'] - W[b]['end'] < 0.8 and \
                norm(W[b + 1]['word']) in ('do', 'começo', 'comeco', 'daqui', 'de', 'novo', 'ai', 'aí', 'entao', 'então'):
            b += 1
        for k in range(a, b + 1):
            tirar[k] = f'comando "{c["texto"]}" ({fmt(c["t"])})'
    cmds = [c for c in rel.get('comandos', []) if not c.get('duvida')]
    for r in rel.get('regravacoes_provaveis', []):
        # com um "corta"/"de novo" dentro ou no fim da 1ª passada, ela sai inteira, de qualquer tamanho
        com_comando = any(r['ini'] < c['ini'] <= r['fim'] + 2 for c in cmds)
        if com_comando or r['fim'] - r['ini'] + 1 <= max_regravacao:
            for k in range(r['ini'], r['fim'] + 1):
                tirar.setdefault(k, f'1ª passada regravada em {fmt(r["refeita_em"])}')
    novos, removidos = [], []
    for a, b in trechos:
        atual = None
        for k in range(a, b + 1):
            if k in tirar:
                if atual:
                    novos.append(atual); atual = None
                if not removidos or removidos[-1]['fim'] != k - 1 or removidos[-1]['motivo'] != tirar[k]:
                    removidos.append({'ini': k, 'fim': k, 'motivo': tirar[k]})
                else:
                    removidos[-1]['fim'] = k
            elif atual:
                atual[1] = k
            else:
                atual = [k, k]
        if atual:
            novos.append(atual)
    novos = [t for t in novos if t[1] - t[0] >= 1 or W[t[0]]['end'] - W[t[0]]['start'] > 0.4]
    for r in removidos:
        r['texto'] = ' '.join(w['word'] for w in W[r['ini']:r['fim'] + 1] if w['word'])
        r['t'] = round(W[r['ini']]['start'], 1)
    return novos, removidos


def corrigir_frase(texto, correcoes):
    """Aplica o glossário num texto do plano (texto-chave, cartão), mantendo *destaque* e | de quebra."""
    for errado, certo in sorted((correcoes or {}).items(), key=lambda r: -len(r[0])):
        pad = r'(?<![\wÀ-ÿ])' + r'[\s\-]*'.join(re.escape(p) for p in errado.split()) + r'(?![\wÀ-ÿ])'
        def troca(m, certo=certo):
            s = m.group(0)
            return certo.upper() if s.isupper() else (certo[:1].upper() + certo[1:] if s[:1].isupper() else certo)
        texto = re.sub(pad, troca, texto, flags=re.IGNORECASE)
    return texto


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('pasta'); ap.add_argument('--roteiro'); ap.add_argument('--cliente')
    ap.add_argument('--limpar-plano', action='store_true', help='tira do plano.json os comandos e as 1ªs passadas')
    a = ap.parse_args()
    rot = a.roteiro or (os.path.join(a.pasta, 'roteiro.txt') if os.path.exists(os.path.join(a.pasta, 'roteiro.txt')) else None)
    cli = a.cliente or (os.path.join(a.pasta, 'cliente.json') if os.path.exists(os.path.join(a.pasta, 'cliente.json')) else None)
    r = rodar(a.pasta, rot, cli)
    if a.limpar_plano:
        pp = os.path.join(a.pasta, 'plano.json')
        plano = json.load(open(pp))
        W = json.load(open(os.path.join(a.pasta, 'transcricao.json')))['words']
        novos, rem = limpar_trechos(plano['trechos'], r, W)
        if rem:
            json.dump(plano, open(os.path.join(a.pasta, 'plano_antes_limpeza.json'), 'w'), ensure_ascii=False, indent=1)
            g = int(plano.get('gancho', 1))
            # o gancho continua sendo o(s) primeiro(s) trecho(s) que sobraram do gancho original
            ganchos = [t for t in novos if any(x[0] <= t[0] <= x[1] for x in plano['trechos'][:g])]
            plano['trechos'] = novos
            plano['gancho'] = min(len(ganchos), len(novos)) if g else 0
            json.dump(plano, open(pp, 'w'), ensure_ascii=False, indent=1)
        print(f'plano limpo: {len(rem)} pedaços tirados')
        for x in rem:
            print(f'  - {fmt(x["t"])} palavras {x["ini"]}–{x["fim"]} ({x["motivo"]}): "{x["texto"][:90]}"')
    print(f"{len(r['frases'])} frases do roteiro, {len(r['comandos'])} comandos de corte, {len(r['correcoes'])} correções; "
          f"relatório em {os.path.join(a.pasta, 'relatorio.md')}")
