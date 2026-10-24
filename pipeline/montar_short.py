#!/usr/bin/env python3
"""
Máquina de shorts do Grupo Euforia: transforma transcrição + plano de cortes em props do Remotion.

Uso:
  python3 montar_short.py transcricao.json plano.json N saida_props.json --modelo viral \
      --video fala.mp4 --logo logo.png --brolls brolls.json

- transcricao.json: saída do fluxo n8n "Shorts IA | Transcrever" ({text, words:[{word,start,end}]})
- plano.json: saída do Claude seguindo prompts/escolher_trechos.md
- N: índice do short dentro do plano
- brolls.json (opcional): {"busca do broll": "arquivo.mp4"} com os clipes já baixados
"""
import argparse, json, re, subprocess, sys, unicodedata

PONTO_FINAL = ('.', '?', '!')
FRACAS = {'a','o','as','os','e','de','do','da','dos','das','em','no','na','nos','nas','um','uma','que','para','pra','com','por','se','ao','mas','sem','sua','seu','tua','teu','meu','minha'}

CONFIG = {
    'viral': {
        'pausa_max': 0.35,      # pausas maiores que isso viram corte seco
        'folga_ini': 0.06,
        'folga_fim': 0.14,
        'palavras_por_bloco': 3,
        'chars_por_bloco': 18,
        'bloco_max_s': 1.3,
        'gancho_s': 2.2,
        'troca_enquadramento_s': 3.0,
        'escalas': [1.0, 1.22],
        'dur_min': 20, 'dur_max': 55,
    },
    'institucional': {
        'pausa_max': 0.8,
        'folga_ini': 0.1,
        'folga_fim': 0.25,
        'palavras_por_bloco': 6,
        'chars_por_bloco': 28,
        'bloco_max_s': 2.8,
        'gancho_s': 0,
        'troca_enquadramento_s': 0,
        'escalas': [1.0],
        'dur_min': 25, 'dur_max': 65,
    },
}
# Nova Acrópole: o Institucional com legenda amarela, B-roll só real (fotos de obras, estátuas, livros) e citações com autor
CONFIG['nova-acropole'] = dict(CONFIG['institucional'])
AMARELO_NA = '#FFD21F'


def norm(s):
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]', '', s)


def alinhar_pontuacao(texto, palavras):
    """Whisper devolve as palavras sem pontuação; o texto corrido tem. Casa os dois em sequência."""
    tokens = texto.split()
    out, j = [], 0
    for w in palavras:
        alvo = norm(w['word'])
        txt = w['word']
        for k in range(j, min(j + 4, len(tokens))):
            if norm(tokens[k]) == alvo:
                txt, j = tokens[k], k + 1
                break
        out.append({'t': txt, 's': float(w['start']), 'e': float(w['end'])})
    return out


def carregar_audio(video):
    """Áudio mono 16 kHz em numpy (para achar os pontos de silêncio)."""
    import numpy as np
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', video, '-f', 's16le', '-ac', '1', '-ar', '16000', '-'],
                         capture_output=True).stdout
    return np.frombuffer(raw, np.int16).astype(float)


def _energia(audio, a, b, sr=16000, win=0.03, hop=0.01):
    import numpy as np
    i0, i1 = max(0, int(a * sr)), min(len(audio), int(b * sr))
    w, h = int(win * sr), int(hop * sr)
    ts, es = [], []
    for i in range(i0, max(i0 + 1, i1 - w), h):
        ts.append((i + w / 2) / sr)
        es.append(20 * np.log10(np.sqrt((audio[i:i + w] ** 2).mean()) + 1e-9))
    return ts, es


def ponto_silencio(audio, a, b, sentido='fim', sr=16000):
    """Acha o silêncio de verdade entre duas palavras.
    A transcrição erra o tempo das palavras em até 0,3 s; aqui o corte vai para a PRIMEIRA pausa
    depois da última palavra (sentido='fim') ou para a ÚLTIMA pausa antes da primeira palavra
    (sentido='inicio'). Pausa = pelo menos 50 ms abaixo do ruído de fundo + 6 dB (funciona com trilha)."""
    import numpy as np
    if audio is None or b - a < 0.05:
        return (a + b) / 2
    _, ref = _energia(audio, a - 2, b + 2, sr)
    limite = float(np.percentile(ref, 10)) + 6 if ref else -1e9
    ts, es = _energia(audio, a, b, sr)
    corridas, ini = [], None
    for k, e in enumerate(es + [1e9]):
        if e < limite and ini is None:
            ini = k
        elif e >= limite and ini is not None:
            if ts[k - 1] - ts[ini] >= 0.04:
                corridas.append((ts[ini], ts[k - 1]))
            ini = None
    if not corridas:
        k = int(np.argmin(es)); return ts[k]
    c = corridas[0] if sentido == 'fim' else corridas[-1]
    return (c[0] + c[1]) / 2


def validar(pal, ini, fim):
    erros = []
    if ini > 0 and not pal[ini - 1]['t'].endswith(PONTO_FINAL) and pal[ini]['s'] - pal[ini - 1]['e'] < 0.6:
        erros.append(f'começa no meio da frase (antes: "{pal[ini-1]["t"]}")')
    if not pal[fim]['t'].endswith(PONTO_FINAL):
        erros.append(f'termina no meio da frase ("{pal[fim]["t"]}")')
    if pal[ini]['t'].lower().strip(',') in ('e', 'então', 'mas', 'aí'):
        erros.append(f'começa com "{pal[ini]["t"]}"')
    return erros


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('transcricao'); ap.add_argument('plano'); ap.add_argument('n', type=int); ap.add_argument('saida')
    ap.add_argument('--modelo', default='viral'); ap.add_argument('--video', required=True)
    ap.add_argument('--logo'); ap.add_argument('--brolls'); ap.add_argument('--fps', type=int, default=30)
    ap.add_argument('--cor', default='#FAC800', help='viral: amarelo; institucional: cor de destaque do cliente')
    ap.add_argument('--cor-fundo', default='#D0CABE', help='institucional: fundo dos cartões')
    ap.add_argument('--cor-texto', default='#102838', help='institucional: texto dos cartões')
    ap.add_argument('--forcar', action='store_true')
    ap.add_argument('--video-arquivo', help='caminho real do vídeo, se --video for só o nome em public/')
    ap.add_argument('--sem-audio', action='store_true', help='não procurar silêncio (corte pelos tempos da transcrição)')
    ap.add_argument('--final', type=float, default=None, help='segundos segurando o último quadro no fim (padrão: 0,8 institucional, 0,4 viral)')
    a = ap.parse_args()
    cfg = CONFIG[a.modelo]

    tr = json.load(open(a.transcricao)); plano = json.load(open(a.plano))
    sh = plano['shorts'][a.n]
    pal = alinhar_pontuacao(tr['text'], tr['words'])
    for c in plano.get('correcoes', []):
        p = pal[c['i']]
        pont = re.search(r'[.,?!;:]+$', p['t'])
        p['t'] = c['para'] + (pont.group(0) if pont and not c['para'].endswith(pont.group(0)) else '')

    ini, fim = sh['inicio_i'], sh['fim_i']
    erros = validar(pal, ini, fim)
    if erros and not a.forcar:
        sys.exit('PLANO REJEITADO: ' + '; '.join(erros))

    remover = set()
    for r0, r1 in sh.get('remover', []):
        remover.update(range(r0, r1 + 1))
    idx = [i for i in range(ini, fim + 1) if i not in remover]
    if sh.get('gancho_movido'):
        g0, g1 = sh['gancho_movido']
        idx = list(range(g0, g1 + 1)) + [i for i in idx if not g0 <= i <= g1]

    # 1) Trechos mantidos (cortes secos nas pausas e nas remoções)
    segs, atual = [], [idx[0]]
    for a_i, b_i in zip(idx, idx[1:]):
        if b_i != a_i + 1 or pal[b_i]['s'] - pal[a_i]['e'] > cfg['pausa_max']:
            segs.append(atual); atual = []
        atual.append(b_i)
    segs.append(atual)

    audio = None if a.sem_audio else carregar_audio(a.video_arquivo or a.video)
    segments, mapa, t_out = [], {}, 0.0
    for g in segs:
        p0, p1 = g[0], g[-1]
        # início: no silêncio entre a palavra anterior e a primeira (nunca pega o fim da anterior)
        if p0 > 0:
            s0 = ponto_silencio(audio, max(pal[p0 - 1]['s'] + 0.1, pal[p0]['s'] - 0.6), pal[p0]['s'] + 0.05, 'inicio')
        else:
            s0 = max(0.0, pal[p0]['s'] - cfg['folga_ini'])
        # fim: no silêncio entre a última palavra e a seguinte (nunca pega sílaba da próxima)
        if p1 + 1 < len(pal):
            # começa a procurar perto do fim previsto da palavra (antes disso, a pausa pode ser
            # o fechamento de um "p"/"t" dentro da própria palavra)
            s1 = ponto_silencio(audio, max(pal[p1]['s'], pal[p1]['e'] - 0.05),
                                min(pal[p1 + 1]['e'], pal[p1]['e'] + 0.7), 'fim')
        else:
            s1 = pal[p1]['e'] + cfg['folga_fim']
        # arredonda para frames para não acumular deriva
        s0 = round(s0 * a.fps) / a.fps; s1 = round(s1 * a.fps) / a.fps
        segments.append({'srcStart': s0, 'srcEnd': s1, 'outStart': round(t_out, 4)})
        for i in g:
            mapa[i] = t_out + (pal[i]['s'] - s0)
        t_out += s1 - s0
    fala_fim = round(t_out, 3)
    final = a.final if a.final is not None else (0.4 if a.modelo == 'viral' else 0.8)
    duracao = round(fala_fim + final, 3)
    if not cfg['dur_min'] <= duracao <= cfg['dur_max']:
        print(f'AVISO: duração {duracao}s fora da faixa {cfg["dur_min"]}-{cfg["dur_max"]}s', file=sys.stderr)

    # 2) Legendas em blocos curtos; o primeiro trecho (gancho) em estilo grande
    destaques = set(sh.get('destaques', []))
    ordem = sorted(idx, key=lambda i: mapa[i])
    blocos, b = [], []
    for k, i in enumerate(ordem):
        b.append(i)
        prox = ordem[k + 1] if k + 1 < len(ordem) else None
        txt = ' '.join(pal[x]['t'] for x in b)
        fecha = (
            prox is None
            or pal[i]['t'].endswith(PONTO_FINAL + (',', ';', ':'))
            or len(b) >= cfg['palavras_por_bloco']
            or len(txt) + len(pal[prox]['t']) > cfg['chars_por_bloco']
            or mapa[prox] - mapa[b[0]] > cfg['bloco_max_s']
        )
        if fecha:
            pont = pal[i]['t'].endswith(PONTO_FINAL + (',', ';', ':'))
            if prox is not None and not pont and len(b) > 1 and norm(pal[i]['t']) in FRACAS:
                b.pop(); blocos.append(b); b = [i]   # não termina bloco em palavra fraca ("do", "e", "que"...)
            else:
                blocos.append(b); b = []

    captions = []
    for k, bl in enumerate(blocos):
        st = mapa[bl[0]]
        nxt = mapa[blocos[k + 1][0]] if k + 1 < len(blocos) else duracao
        en = min(nxt, mapa[bl[-1]] + 1.2)
        hook = cfg['gancho_s'] > 0 and st < cfg['gancho_s'] and k < 2
        captions.append({
            'start': round(st, 3), 'end': round(en, 3), 'hook': hook,
            'words': [{'text': pal[i]['t'], 'start': round(mapa[i], 3), 'hl': i in destaques} for i in bl],
        })
    # gancho: junta os blocos iniciais num só, para empilhar as palavras
    hooks = [c for c in captions if c['hook']]
    if len(hooks) > 1:
        junto = {'start': hooks[0]['start'], 'end': hooks[-1]['end'], 'hook': True,
                 'words': [w for c in hooks for w in c['words']]}
        captions = [junto] + [c for c in captions if not c['hook']]

    # 3) Enquadramento: alterna aberto/close a cada corte e a cada X segundos
    framing, esc = [], 0
    cortes = [s['outStart'] for s in segments] + [duracao]
    for c0, c1 in zip(cortes, cortes[1:]):
        passo = cfg['troca_enquadramento_s'] or (c1 - c0)
        t = c0
        while t < c1 - 0.01:
            t2 = min(c1, t + passo)
            if c1 - t2 < 1.0:
                t2 = c1
            framing.append({'start': round(t, 3), 'end': round(t2, 3),
                            'scale': cfg['escalas'][esc % len(cfg['escalas'])], 'originY': 0.32})
            esc += 1; t = t2

    # 4) B-rolls
    arquivos = json.load(open(a.brolls)) if a.brolls else {}
    brolls = []
    for br in sh.get('brolls', []):
        if br['i'] not in mapa or br['busca'] not in arquivos:
            continue
        st = mapa[br['i']]
        brolls.append({'start': round(st, 3), 'end': round(min(duracao, st + br['duracao']), 3),
                       'src': arquivos[br['busca']], 'mode': br['modo'], 'legenda': br.get('legenda')})

    # 5) Cartões de texto (institucional): o texto aparece acompanhando a fala
    cartoes = []
    for ct in sh.get('cartoes', []):
        falados = [i for i in ordem if ct['inicio_i'] <= i <= ct['fim_i']]
        if not falados:
            continue
        tempos = [mapa[i] for i in falados]
        txt = ct['texto'].split()
        pal_c = []
        for k, w in enumerate(txt):
            j = min(len(tempos) - 1, int(k * len(tempos) / len(txt)))
            pal_c.append({'text': w, 'start': round(tempos[j], 3)})
        st = max(0.0, tempos[0] - 0.2)
        en = min(duracao, mapa[falados[-1]] + (pal[falados[-1]]['e'] - pal[falados[-1]]['s']) + 0.9)
        if falados[-1] == ordem[-1]:
            en = duracao   # cartão que fecha o short fica até o fim
        cartoes.append({'start': round(st, 3), 'end': round(en, 3), 'palavras': pal_c,
                        'circular': ct.get('circular'), 'referencia': ct.get('referencia'), 'autor': ct.get('autor')})

    estilo = {'corDestaque': a.cor, 'fonte': 'Montserrat' if a.modelo == 'viral' else 'Poppins'}
    if a.modelo != 'viral':
        estilo['corFundoCartao'] = a.cor_fundo
        estilo['corTextoCartao'] = a.cor_texto
    if a.modelo == 'nova-acropole':
        estilo['corLegenda'] = AMARELO_NA
    props = {
        'fps': a.fps, 'duration': duracao, 'video': a.video, 'segments': segments,
        'framing': framing, 'captions': captions, 'brolls': brolls, 'cartoes': cartoes,
        'logo': a.logo, 'estilo': estilo, 'falaFim': fala_fim,
    }
    json.dump(props, open(a.saida, 'w'), ensure_ascii=False, indent=1)
    print(f'OK: {duracao}s, {len(segments)} cortes, {len(captions)} legendas, {len(brolls)} b-rolls')


if __name__ == '__main__':
    main()
