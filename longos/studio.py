"""Projeto do vídeo longo para o Euforia Studio (16/11/2026).
Chamado pelo montar.py com --studio SAIDA: em vez de renderizar, grava o que a máquina montou numa pasta que o Studio
abre (prévia ao vivo, ajustes e render no PC de quem edita, com o mesmo acabamento do montar.py).

SAIDA/
  projeto-1.json        tipo "longo": trechos, elementos (B-roll, cartões, textos, lowers), tela final e trilha
  midia/base.mp4        a fala já cortada e enquadrada (concat dos segs), 1080p: é o que o render usa
  midia/base-previa.mp4 a mesma em 540p, leve, para a prévia
  midia/gfx/            grafismos (textos e lowers viram .webm com transparência, que o navegador toca)
  midia/broll/          B-rolls do plano
  midia/musica.aac      trilha
Os tempos dos elementos são do vídeo final; os trechos são do base.mp4 (o Studio tira trechos sem refazer a máquina)."""
import json, os, shutil, subprocess

ROTULO = {'kw': 'texto', 'lw': 'lower', 'broll': 'broll', 'full': 'tela'}


def _ff(*args):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], check=True)


def _tam(arq):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
                          '-of', 'csv=p=0', arq], capture_output=True, text=True).stdout.strip().split(',')
    return int(out[0]), int(out[1])


def exportar(pasta, saida, *, plano, segs, W, EV, TOTAL, END, gfx_dir, musica, cliente=None, titulo=None):
    midia = os.path.join(saida, 'midia')
    for d in ('gfx', 'broll'):
        os.makedirs(os.path.join(midia, d), exist_ok=True)

    # fala cortada: concat dos segmentos (vídeo copiado, áudio em AAC de alta qualidade)
    lista = os.path.join(pasta, 'lista.txt')
    open(lista, 'w').write(''.join(f"file '{os.path.abspath(os.path.join(pasta, 'segs', f'{i:03d}.mkv'))}'\n" for i in range(len(segs))))
    base = os.path.join(midia, 'base.mp4')
    print('studio: juntando a fala cortada...', flush=True)
    _ff('-f', 'concat', '-safe', '0', '-i', lista, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', base)
    # prévia leve, com quadro-chave a cada 0,5 s para pular rápido na linha do tempo
    _ff('-i', base, '-vf', 'scale=960:540', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27', '-g', '15',
        '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', os.path.join(midia, 'base-previa.mp4'))

    copiados = {}

    def copiar(arq, sub):
        """Copia o arquivo para a mídia do projeto; .mov com transparência vira .webm (VP9 com alfa)."""
        if arq in copiados:
            return copiados[arq]
        nome = os.path.basename(arq)
        if arq.endswith('.mov'):
            nome = nome[:-4] + '.webm'
            _ff('-i', arq, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '30', '-auto-alt-ref', '0',
                '-row-mt', '1', '-an', os.path.join(midia, sub, nome))
        else:
            shutil.copy(arq, os.path.join(midia, sub, nome))
        copiados[arq] = f'{sub}/{nome}'
        return copiados[arq]

    # rótulos legíveis: o texto do grafismo, a busca do B-roll
    kws, cards = plano.get('keywords', []), plano.get('cartoes', [])
    brs = {b['id']: b for b in plano.get('brolls', [])}

    def rotulo(kind, f):
        n = os.path.splitext(os.path.basename(f))[0]
        if kind == 'broll':
            b = brs.get(n, {})
            return b.get('busca') or b.get('legenda') or n
        if n.startswith('kw') and n[2:].isdigit() and int(n[2:]) < len(kws):
            return kws[int(n[2:])]['texto'].replace('*', '').replace('|', ' ')
        if n.startswith('c') and n[1:].isdigit() and int(n[1:]) < len(cards):
            c = cards[int(n[1:])]
            return ' '.join(c.get('linhas') or [c.get('texto', '')]).replace('*', '')
        if n == 'titulo' and plano.get('titulo'):
            t = plano['titulo']
            return ' '.join(filter(None, [t.get('sub')] + t.get('linhas', []))).replace('*', '')
        return {'mapa': 'Mapa', 'lw_inscreva': 'Inscreva-se', 'lw_like': 'Like · compartilhe · comente',
                'lw_nome': (plano.get('nome') or 'Nome')}.get(n, n)

    elementos = []
    for k, (kind, f, t0, d) in enumerate(sorted(EV, key=lambda e: e[2])):
        rel = copiar(f, 'broll' if kind == 'broll' else 'gfx')
        w, h = _tam(f) if not f.endswith('.jpg') else (1920, 1080)
        elementos.append({'camada': kind, 'arquivo': rel, 'inicio': round(t0, 3), 'dur': round(d, 3),
                          'rotulo': rotulo(kind, f), 'w': w, 'h': h,
                          'y': {'kw': 660, 'lw': 840}.get(kind, 0)})
    fim = copiar(os.path.join(gfx_dir, 'fim.mp4'), 'gfx') if os.path.exists(os.path.join(gfx_dir, 'fim.mp4')) else None
    mus = None
    if musica and os.path.exists(musica):
        shutil.copy(musica, os.path.join(midia, 'musica.aac'))
        mus = {'arquivo': 'musica.aac', 'volume_db': plano.get('volume_trilha_db', -31)}

    # palavras no tempo do base.mp4 (para a linha do tempo mostrar o que se fala em cada trecho)
    palavras = []
    for w in W:
        x = next((x for x in segs if x['s'] - 0.05 <= w['start'] < x['e'] + 0.05), None)
        if x and w.get('word'):
            palavras.append({'w': w['word'], 't': round(x['saida'] + max(0.0, w['start'] - x['s']), 2)})

    nome_pedido = os.path.basename(os.path.normpath(pasta))
    proj = {
        'versao': 1, 'tipo': 'longo', 'id': f'longo-{nome_pedido}',
        'cliente': cliente or plano.get('cliente') or '', 'titulo': titulo or plano.get('titulo_video') or nome_pedido,
        'composicao': 'Longo', 'base': 'midia',
        'maquina': {'por_que': plano.get('por_que')},
        'registro': [f'[cortes] {len(segs)} trechos da fala, {TOTAL / 60:.1f} min',
                     f"[grafismos] {sum(1 for e in elementos if e['camada'] == 'kw')} textos-chave, "
                     f"{sum(1 for e in elementos if e['camada'] == 'full')} telas cheias, "
                     f"{sum(1 for e in elementos if e['camada'] == 'lw')} lowers",
                     f"[b-roll] {sum(1 for e in elementos if e['camada'] == 'broll')} B-rolls"],
        'longo': {
            'fps': 30, 'largura': 1920, 'altura': 1080,
            'video': 'base.mp4', 'previa': 'base-previa.mp4',
            'trechos': [{'ini': round(x['saida'], 3), 'fim': round(x['saida'] + x['dur'], 3)} for x in segs],
            'elementos': elementos,
            'fim': {'arquivo': fim, 'dur': END} if fim else None,
            'musica': mus,
            'palavras': palavras,
            'paleta': plano.get('paleta') or {},  # cores do cliente: os textos novos do Studio saem nelas
        },
        'biblioteca': [{'src': e['arquivo'], 'descricao': e['rotulo']} for e in elementos if e['camada'] == 'broll'],
    }
    json.dump(proj, open(os.path.join(saida, 'projeto-1.json'), 'w'), ensure_ascii=False, indent=1)
    print(f"studio: projeto em {saida} ({len(elementos)} elementos, {TOTAL / 60:.1f} min)")
