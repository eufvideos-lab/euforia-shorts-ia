"""Cortes de um episódio (modelo Podcast, 20/11/2026).

Uso: python3 longos/derivar.py pedidos/<id-curto> <nome-do-corte>

O episódio é preparado e transcrito uma vez só (preparar.py). Cada corte (8 a 15 min com um tema fechado) ganha uma
subpasta pedidos/<id-curto>/cortes/<nome> que aponta para o mesmo bruto, a mesma transcrição e o mesmo texto; ali
você escreve o plano.json do corte e roda cortar.py, conferir_fala.py, brolls.py (se houver) e montar.py na subpasta,
como num pedido comum. Nada é baixado ou transcrito de novo.
"""
import os, sys

COMPARTILHADOS = ('info.json', 'transcricao.json', 'transcricao_whisper.json', 'texto.json', 'palavras.txt',
                  'cliente.json', 'roteiro.txt', 'enquadramento.json', 'enquadramento.png', 'audio.mp3', 'relatorio.md')

if len(sys.argv) < 3:
    raise SystemExit(__doc__)
pasta, nome = os.path.abspath(sys.argv[1]), sys.argv[2].strip().replace('/', '-')
if not os.path.exists(os.path.join(pasta, 'transcricao.json')):
    raise SystemExit(f'{pasta} ainda não foi preparada: rode longos/preparar.py antes')
sub = os.path.join(pasta, 'cortes', nome)
os.makedirs(sub, exist_ok=True)
ligados = []
for f in sorted(os.listdir(pasta)):
    if f in COMPARTILHADOS or f.startswith('bruto.'):
        alvo, link = os.path.join(pasta, f), os.path.join(sub, f)
        if not os.path.lexists(link):
            os.symlink(alvo, link)
        ligados.append(f)
print(f'corte "{nome}" em {sub}')
print('ligados ao episódio:', ', '.join(ligados))
print('agora: escreva', os.path.join(sub, 'plano.json'), '(modelo podcast, só os trechos do tema do corte)')
