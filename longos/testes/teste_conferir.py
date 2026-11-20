"""Teste da conferência da fala: python3 longos/testes/teste_conferir.py"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'pipeline'))
from conferir_fala import comparar


def seq(txt, t0=0.0, passo=0.35):
    return [{'w': w, 't': t0 + i * passo} for i, w in enumerate(txt.split())]


esp = seq('no segundo passo ela fala a palavra segundo inteira e segue o assunto até o fim da frase')
# emenda em ~0,7 s; o áudio cortado perdeu o começo de "segundo"
ouv = seq('no gundo passo ela fala a palavra segundo inteira e segue o assunto até o fim da frase')
p = comparar(esp, ouv, [0.6], [])
assert any(x['tipo'] == 'palavra cortada' for x in p), p
# tudo igual: nada
assert comparar(esp, esp, [0.6], []) == [], comparar(esp, esp, [0.6], [])
# frase repetida (a 1ª tomada ficou)
rep = seq('e uma briga imensa começa quando e uma briga imensa começa quando ninguém escuta')
p = comparar(seq('e uma briga imensa começa quando ninguém escuta'), rep, [], [])
assert any(x['tipo'] == 'frase repetida' for x in p), p
# repetição que o plano manda (ênfase) não conta
assert not any(x['tipo'] == 'frase repetida' for x in comparar(rep, rep, [], [])), 'ênfase de propósito'
# frame solto
assert comparar(esp, esp, [], [(8.0, 8.2)])[0]['tipo'] == 'frame solto'
print('OK: conferência acha palavra cortada, frase repetida e frame solto')
