"""Conferência do pacote semanal (25/11/2026): diz, item por item, o que já está na pasta do pacote e o que falta.

A pasta do pacote fica dentro da pasta do cliente no Drive: "PACOTE SEMANAL - <DIA> <dd-mm>" (ex.: PACOTE SEMANAL -
SEX 27-11). A rotina lista a pasta (Google Drive, search_files com parentId) e salva a listagem num JSON; este script
classifica pelo nome e escreve a conferência.

Uso:
  python3 pipeline/pacote.py conferir listagem.json [--shorts 3] [--carrosseis 1] [--sem-longo] \
      [--pendente "Cronograma IG: reels sem dia na grade"] [--saida "00 - CONFERÊNCIA.txt"]

listagem.json = lista de {"title": ..., "mimeType": ..., "id": ...} (o que o search_files devolve em "files";
subpastas (YOUTUBE, INSTAGRAM, carrossel) vêm com "filhos": [...], em qualquer nível ou como arquivos "06 - CARROSSEL ... .png").
Saída (stdout): {"completo": bool, "itens": [{item, ok, detalhe}], "faltam": [...]} e o .txt para subir na pasta.
"""
import argparse, json, re, sys, unicodedata
from datetime import datetime, timedelta, timezone


def norm(t):
    t = unicodedata.normalize('NFKD', t or '').encode('ascii', 'ignore').decode().upper()
    return re.sub(r'\s+', ' ', t)


def eh(f, *tipos):
    m = (f.get('mimeType') or '').lower()
    return any(m.startswith(t) for t in tipos)


def conferir(arqs, shorts=3, carrosseis=1, com_longo=True, pendentes=()):
    planos = []

    def achatar(lista, prefixo=''):
        for f in lista:
            g = {**f, 'title': prefixo + f['title']}
            planos.append(g)
            achatar(f.get('filhos') or [], g['title'] + ' / ')
    achatar(arqs)
    N = [(norm(f['title']), f) for f in planos]

    def achar(padrao, *tipos):
        return [f for n, f in N if re.search(padrao, n) and (not tipos or eh(f, *tipos))]

    itens = []

    def item(nome, achados, minimo=1, detalhe=''):
        ok = len(achados) >= minimo
        itens.append({'item': nome, 'ok': ok, 'tem': len(achados), 'precisa': minimo,
                      'detalhe': detalhe or ', '.join(f['title'] for f in achados[:4])})

    if com_longo:
        item('Vídeo longo', achar(r'^01 |LONGO', 'video/'))
        item('Thumb (imagem)', achar(r'THUMB', 'image/'))
        item('Título, descrição e SEO do longo', achar(r'TITULO E DESCRICAO|SEO', 'text/', 'application/vnd.google-apps.document'))
        item('Capa de story de divulgação', achar(r'STORY', 'image/'))
    if shorts:
        item(f'{shorts} shorts/reels', achar(r'SHORT|REELS', 'video/'), shorts)
        item(f'{shorts} capas de reels/shorts', achar(r'CAPA', 'image/'), shorts)
    if carrosseis:
        slides = achar(r'CARROSSEL|SLIDE', 'image/')
        item(f'Carrossel ({carrosseis})', slides, 5 * carrosseis, f'{len(slides)} slides')
    insta = [f for n, f in N if ('INSTAGRAM /' in n)]
    if insta:
        sujos = [f for f in insta if re.search(r'VISAO-GERAL|VISAO GERAL|COMPARACAO|\.JSON$', norm(f['title']))]
        itens.append({'item': 'Pasta INSTAGRAM só com o que o cliente posta', 'ok': not sujos, 'tem': 0 if sujos else 1,
                      'precisa': 1, 'detalhe': ', '.join(f['title'] for f in sujos[:4])})
    item('Textos do Instagram e cronograma', achar(r'TEXTOS INSTAGRAM|CRONOGRAMA', 'text/', 'application/vnd.google-apps.document'))
    for p in pendentes:
        itens.append({'item': p, 'ok': False, 'tem': 0, 'precisa': 1, 'detalhe': 'pendente'})
    faltam = [i['item'] for i in itens if not i['ok']]
    return {'completo': not faltam, 'itens': itens, 'faltam': faltam}


def texto(res, cliente='', titulo=''):
    agora = datetime.now(timezone(timedelta(hours=-3))).strftime('%d/%m %H:%M')
    linhas = [f'CONFERÊNCIA DO PACOTE · {cliente} · {titulo}'.strip(' ·'), f'Conferido pela máquina em {agora} (Recife)', '']
    for i in res['itens']:
        linhas.append(f"[{'OK' if i['ok'] else 'FALTA'}] {i['item']}" + (f" ({i['tem']}/{i['precisa']})" if i['precisa'] > 1 else '')
                      + (f" · {i['detalhe']}" if i['detalhe'] else ''))
    linhas += ['', 'PACOTE COMPLETO' if res['completo'] else 'PACOTE INCOMPLETO: falta ' + '; '.join(res['faltam'])]
    return '\n'.join(linhas) + '\n'


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('acao', choices=['conferir'])
    ap.add_argument('listagem')
    ap.add_argument('--shorts', type=int, default=3)
    ap.add_argument('--carrosseis', type=int, default=1)
    ap.add_argument('--sem-longo', action='store_true')
    ap.add_argument('--pendente', action='append', default=[])
    ap.add_argument('--cliente', default='')
    ap.add_argument('--titulo', default='')
    ap.add_argument('--saida')
    a = ap.parse_args()
    dados = json.load(open(a.listagem, encoding='utf-8'))
    arqs = dados.get('files', dados) if isinstance(dados, dict) else dados
    res = conferir(arqs, a.shorts, a.carrosseis, not a.sem_longo, a.pendente)
    if a.saida:
        open(a.saida, 'w', encoding='utf-8').write(texto(res, a.cliente, a.titulo))
    json.dump(res, sys.stdout, ensure_ascii=False, indent=1)
    print()
