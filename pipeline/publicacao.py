#!/usr/bin/env python3
"""Pacote de publicação (título, descrição, tags, capítulos) de cada vídeo do pedido (16/11/2026).
Uso: python3 pipeline/publicacao.py PASTA_DO_PEDIDO --cliente "Nome" [--pasta-drive ID] [--studio DIR]
       [--cliente-id ID_DA_FICHA --pedido URL]
Lê PASTA/publicacao.json (escrito pelo Claude com prompts/publicacao.md), confere as regras do YouTube, converte os
capítulos (índice de palavra) para minuto:segundo do vídeo final (com segmentos.json da máquina de longos) e grava:
  PASTA/publicacao/<nome> - título e descrição.txt   (um por vídeo: o que a equipe copia e cola no YouTube)
  PASTA/publicacao-final.json                        (tudo montado; vai no log e no Notion)
--pasta-drive: sobe os .txt para a pasta de entrega (ao lado dos vídeos).
--cliente-id: id da ficha do cliente no Notion; manda o pacote para o Painel da Equipe (gaveta do horário na Grade),
  pelo fluxo n8n "Painel | Título e descrição (V1)" (shorts-ia-publicacao).
--studio DIR: põe o pacote em DIR/projeto-N.json ("publicacao"), antes do studio_drive.py; o Studio mostra a aba.
Para (código 1) com a lista do que corrigir se algo quebra regra do YouTube; avisos não param."""
import argparse, json, os, re, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)

LIM_TIT = {'longo': 70, 'short': 60}


def limpa(s):
    # o YouTube recusa < e > em título e descrição
    return re.sub(r'[<>]', '', (s or '').strip())


def mmss(t):
    t = int(round(t))
    h, m, s = t // 3600, t % 3600 // 60, t % 60
    return f'{h}:{m:02d}:{s:02d}' if h else f'{m}:{s:02d}'


def hashtag(h):
    h = re.sub(r'[^\w]', '', h.strip().lstrip('#'), flags=re.UNICODE)
    return '#' + h if h else ''


def tempo_final(pasta):
    """Função palavra → segundo no vídeo final (máquina de longos), ou None se não houver segmentos.json."""
    seg_arq, tr_arq = os.path.join(pasta, 'segmentos.json'), os.path.join(pasta, 'transcricao.json')
    if not (os.path.exists(seg_arq) and os.path.exists(tr_arq)):
        return None
    segs = json.load(open(seg_arq)); W = json.load(open(tr_arq))['words']
    # vinheta do cliente (montar.py grava montagem.json): o que vem depois dela anda a duração da vinheta
    mt = os.path.join(pasta, 'montagem.json')
    mt = json.load(open(mt)) if os.path.exists(mt) else {}
    vin_t, vin_d = mt.get('vinheta_em', 0.0), mt.get('vinheta_dur', 0.0)

    def desloca(x):
        return None if x is None else (x + vin_d if vin_d and x >= vin_t else x)

    def t(idx):
        w = W[idx]['start']
        for x in segs:
            if x['s'] - 0.05 <= w < x['e'] + 0.05:
                return desloca(x['saida'] + max(0.0, w - x['s']))
        prox = [x for x in segs if x['s'] > w]  # palavra cortada: o capítulo começa no próximo trecho mantido
        return desloca(prox[0]['saida']) if prox else None
    return t


def montar(item, tipo, t_final, erros, avisos, nome):
    p = dict(item)
    tit = [limpa(x) for x in p.get('titulos') or [] if limpa(x)]
    if not tit:
        erros.append(f'{nome}: sem títulos')
    for x in tit:
        if len(x) > 100:
            erros.append(f'{nome}: título com {len(x)} caracteres (limite do YouTube é 100): {x}')
        elif len(x) > LIM_TIT[tipo]:
            avisos.append(f'{nome}: título com {len(x)} caracteres (ideal até {LIM_TIT[tipo]}): {x}')
    p['titulos'] = tit

    caps = []
    if tipo == 'longo' and p.get('capitulos'):
        if t_final is None:
            avisos.append(f'{nome}: capítulos sem segmentos.json (longo editado à mão): viraram tópicos sem minuto')
            p['topicos'] = (p.get('topicos') or []) + [c['titulo'] for c in p['capitulos']]
        else:
            for c in sorted(p['capitulos'], key=lambda c: c['palavra']):
                t = t_final(c['palavra'])
                if t is None:
                    avisos.append(f'{nome}: capítulo "{c["titulo"]}" depois do fim do vídeo: saiu')
                    continue
                if caps and t - caps[-1][0] < 10:
                    avisos.append(f'{nome}: capítulo "{c["titulo"]}" a menos de 10 s do anterior: saiu')
                    continue
                caps.append((t, limpa(c['titulo'])))
            if caps:
                caps[0] = (0.0, caps[0][1])  # o YouTube só liga capítulos se o 1º for 0:00
            if len(caps) < 3:
                avisos.append(f'{nome}: menos de 3 capítulos válidos: o YouTube não mostra; viraram tópicos')
                p['topicos'] = (p.get('topicos') or []) + [c for _, c in caps]
                caps = []
    p['capitulos_texto'] = [f'{mmss(t)} {c}' for t, c in caps]

    tags = []
    for x in p.get('tags') or []:
        x = limpa(x).replace(',', ' ')
        if x and x.lower() not in [y.lower() for y in tags]:
            tags.append(x)
    while tags and len(', '.join(tags)) > 450:
        avisos.append(f'{nome}: tag "{tags[-1]}" saiu (tags passavam de 450 caracteres)')
        tags.pop()
    if not 5 <= len(tags) <= 25:
        avisos.append(f'{nome}: {len(tags)} tags (ideal 10 a 20)')
    p['tags'] = tags

    hs = [h for h in (hashtag(x) for x in p.get('hashtags') or []) if h]
    if tipo == 'longo':
        hs = [h for h in hs if h.lower() != '#shorts']
    if len(hs) != 3:
        avisos.append(f'{nome}: {len(hs)} hashtags (o ideal são 3)')
    p['hashtags'] = hs[:15]

    partes = [limpa(p.get('descricao'))]
    if p.get('topicos'):
        partes.append('Neste vídeo você vai ver:\n' + '\n'.join(f'• {limpa(x)}' for x in p['topicos']))
    if p['capitulos_texto']:
        partes.append('Capítulos:\n' + '\n'.join(p['capitulos_texto']))
    for k in ('cta', 'rodape'):
        if limpa(p.get(k)):
            partes.append(limpa(p[k]))
    if hs:
        partes.append(' '.join(hs))
    desc = '\n\n'.join(x for x in partes if x)
    if len(desc) > 5000:
        erros.append(f'{nome}: descrição com {len(desc)} caracteres (limite do YouTube é 5000)')
    if tipo == 'short' and len(desc) > 400:
        avisos.append(f'{nome}: descrição de short com {len(desc)} caracteres (ideal até 300)')
    p['descricao_final'] = desc
    return p


def texto(p, tipo, cliente):
    L = [f'{cliente} · {"VÍDEO LONGO" if tipo == "longo" else "SHORT"} · {p["_nome"]}', '',
         'TÍTULO (recomendado)', p['titulos'][0] if p['titulos'] else '']
    if len(p['titulos']) > 1:
        L += ['', 'Outras opções:'] + [f'- {x}' for x in p['titulos'][1:]]
    L += ['', 'DESCRIÇÃO (copiar tudo entre as linhas)', '-' * 40, p['descricao_final'], '-' * 40, '',
          'TAGS (colar no campo "Tags" do YouTube)', ', '.join(p['tags'])]
    if p.get('palavras_chave'):
        L += ['', 'PALAVRAS-CHAVE: ' + ', '.join(p['palavras_chave'])]
    if p.get('comentario_fixado'):
        L += ['', 'COMENTÁRIO PARA FIXAR: ' + limpa(p['comentario_fixado'])]
    if p.get('texto_thumb'):
        L += ['', 'TEXTO DA THUMB: ' + limpa(p['texto_thumb'])]
    L += ['', 'Sugestão da máquina: confira antes de publicar.']
    return '\n'.join(L) + '\n'


def para_studio(p):
    return {k: p.get(k) for k in ('titulos', 'descricao_final', 'tags', 'hashtags', 'palavras_chave',
                                  'comentario_fixado', 'texto_thumb', 'capitulos_texto') if p.get(k)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pasta'); ap.add_argument('--cliente', required=True)
    ap.add_argument('--pasta-drive', default=None); ap.add_argument('--studio', default=None)
    ap.add_argument('--cliente-id', default=None); ap.add_argument('--pedido', default='')
    a = ap.parse_args()
    pasta = os.path.abspath(a.pasta)
    pub = json.load(open(os.path.join(pasta, 'publicacao.json')))
    t_final = tempo_final(pasta)
    erros, avisos, feitos = [], [], []

    if pub.get('longo'):
        nome = pub['longo'].get('nome') or 'Vídeo longo'
        p = montar(pub['longo'], 'longo', t_final, erros, avisos, nome)
        p['_nome'], p['_tipo'] = nome, 'longo'
        feitos.append(p)
    for n, sh in enumerate(pub.get('shorts') or []):
        nome = f'SHORT {n + 1}'
        p = montar(sh, 'short', None, erros, avisos, nome)
        p['_nome'], p['_tipo'], p['_n'] = nome, 'short', n + 1
        feitos.append(p)

    for x in avisos:
        print('aviso:', x)
    if erros:
        print('\n'.join('ERRO: ' + x for x in erros))
        raise SystemExit(1)

    saida = os.path.join(pasta, 'publicacao')
    os.makedirs(saida, exist_ok=True)
    cli = a.cliente.upper()
    arquivos = []
    for p in feitos:
        rot = 'LONGO' if p['_tipo'] == 'longo' else p['_nome']
        tit = re.sub(r'[\\/:*?"<>|]+', '', p['titulos'][0]).strip()
        if len(tit) > 50:
            tit = tit[:50].rsplit(' ', 1)[0]
        nome = f'{cli} - {rot} - {tit} - título e descrição.txt'
        arq = os.path.join(saida, nome)
        open(arq, 'w', encoding='utf-8').write(texto(p, p['_tipo'], a.cliente))
        p['_arquivo'] = arq
        arquivos.append(arq)
        print(f'ok: {nome}')

    if a.studio:
        import glob
        for pj in sorted(glob.glob(os.path.join(a.studio, 'projeto-*.json'))):
            proj = json.load(open(pj))
            if proj.get('tipo') == 'longo':
                alvo = next((p for p in feitos if p['_tipo'] == 'longo'), None)
            else:
                n = int(re.search(r'projeto-(\d+)', pj).group(1))
                alvo = next((p for p in feitos if p.get('_n') == n), None)
            if alvo:
                proj['publicacao'] = para_studio(alvo)
                json.dump(proj, open(pj, 'w'), ensure_ascii=False, indent=1)
                print(f'studio: {os.path.basename(pj)} com título e descrição')

    if a.pasta_drive:
        import ponte
        for p in feitos:
            up = ponte.subir_grande(p['_arquivo'], a.pasta_drive, os.path.basename(p['_arquivo']), 'text/plain')
            p['_link'] = f"https://drive.google.com/file/d/{up['id']}/view" if (up or {}).get('id') else None
            print(f'drive: {os.path.basename(p["_arquivo"])}')

    final = [{'nome': p['_nome'], 'tipo': p['_tipo'], 'titulo': p['titulos'][0], 'outros_titulos': p['titulos'][1:],
              'descricao': p['descricao_final'], 'tags': p['tags'], 'arquivo': os.path.basename(p['_arquivo']),
              'drive': p.get('_link')} for p in feitos]
    if a.cliente_id:
        import ponte, subprocess
        corpo = {'cliente_id': a.cliente_id, 'cliente': a.cliente, 'pedido': a.pedido,
                 'videos': [dict(v, comentario=p.get('comentario_fixado') or '', thumb=p.get('texto_thumb') or '')
                            for v, p in zip(final, feitos)]}
        tmp = os.path.join(pasta, 'publicacao-painel.json')
        json.dump(corpo, open(tmp, 'w'), ensure_ascii=False)
        try:
            r = ponte._curl(['-X', 'POST', '-H', 'Content-Type: application/json', '--data-binary', f'@{tmp}',
                             f'{ponte.BASE}/shorts-ia-publicacao'], timeout=120)
            print('painel:', r.strip()[:200])
        except Exception as e:  # o painel é conveniência: não trava a entrega
            print('aviso: não foi para o painel:', str(e)[:300])
    json.dump({'videos': final, 'avisos': avisos}, open(os.path.join(pasta, 'publicacao-final.json'), 'w'),
              ensure_ascii=False, indent=1)
    print(f'OK: {len(final)} pacote(s) de publicação' + (f', {len(avisos)} aviso(s)' if avisos else ''))


if __name__ == '__main__':
    main()
