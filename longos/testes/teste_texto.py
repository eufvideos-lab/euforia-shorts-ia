#!/usr/bin/env python3
"""Teste rápido de longos/texto.py (sem vídeo): python3 longos/testes/teste_texto.py"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import texto as T


def fala(txt):
    W, t = [], 0.0
    for tok in txt.split():
        if tok.startswith('<'):
            t += float(tok[1:-1]); continue
        W.append({'word': tok, 'start': round(t, 2), 'end': round(t + 0.3, 2)}); t += 0.4
    return W


ROT = """GANCHO: A autoliderança começa antes de você liderar alguém.
Hoje eu vou te mostrar três hábitos simples que mudam a sua rotina.
O primeiro hábito é acordar no mesmo horário todos os dias.
O segundo é anotar as três tarefas mais importantes do dia.
[CORTE SHORT 1] E o terceiro é dizer não para o que corta sua energia."""
BRUTO = ("a liderança começa antes de você liderar alguém <1> "
         "hoje eu vou te mostrar três hábitos simples que mudam a sua rotina <1> "
         "o primeiro hábito é acordar no mesmo horário todos os <0.2> corta <1.5> "      # para no meio
         "o primeiro hábito é acordar no mesmo horário todos os dias <1> "
         "o segundo é anotar as três tarefas mais importantes do dia <1> "
         "e o terceiro é dizer não pro que <0.3> errei <0.2> de novo <1> "               # volta duas frases
         "o segundo é anotar as três tarefas mais importantes do dia <1> "
         "e o terceiro é dizer não para o que corta sua energia <2> acabou")

W = fala(BRUTO)
rel = T.processar(W, ROT, {})
final = ' '.join(W[i]['word'] for a, b in rel['trechos_sugeridos'] for i in range(a, b + 1) if W[i]['word'])
esperado = ('A autoliderança começa antes de você liderar alguém Hoje eu vou te mostrar três hábitos simples que mudam a '
            'sua rotina O primeiro hábito é acordar no mesmo horário todos os dias O segundo é anotar as três tarefas '
            'mais importantes do dia E o terceiro é dizer não para o que corta sua energia')
assert final == esperado, final
assert [c['texto'] for c in rel['comandos']] == ['corta', 'errei', 'de novo'], rel['comandos']  # "corta sua energia" é roteiro

W = fala('eu falo de alto liderança e auto-liderança e autolideranca')
T.aplicar_correcoes(W, {'alto liderança': 'autoliderança'}, [])
assert [w['word'] for w in W if w['word']] == ['eu', 'falo', 'de', 'autoliderança', 'e', 'autoliderança', 'e', 'autoliderança']
assert T.corrigir_frase('*ALTO LIDERANÇA* é tudo', {'alto liderança': 'autoliderança'}) == '*AUTOLIDERANÇA* é tudo'

W = fala(BRUTO)
rel = T.processar(W, None, {})
assert rel['regravacoes_provaveis'] and rel['regravacoes_provaveis'][0]['ini'] == 21
print('ok')
