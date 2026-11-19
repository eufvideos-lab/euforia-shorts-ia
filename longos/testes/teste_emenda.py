"""Teste do ponto de corte (pipeline/emenda.py): python3 longos/testes/teste_emenda.py
Áudio sintético: palavras = ruído; "ta|tuagem" tem um silêncio de 70 ms no meio (o "t"), como na fala real.
A transcrição erra o tempo em 0,2 s; o corte tem que cair na pausa de verdade, nunca dentro da palavra."""
import os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'pipeline'))
import emenda as EM

SR = 16000
rng = np.random.default_rng(1)
audio = rng.normal(0, 30, SR * 6).astype(np.float32)  # ruído de fundo


def fala(a, b):
    audio[int(a * SR):int(b * SR)] += rng.normal(0, 3000, int(b * SR) - int(a * SR))


# "uma"      1.00-1.40 | pausa 0.30 | "ta" 1.70-1.95, "t" 1.95-2.02 (silêncio curto), "tuagem" 2.02-2.50 | pausa 0.35 |
# "nova"     2.85-3.30
fala(1.00, 1.40); fala(1.70, 1.95); fala(2.02, 2.50); fala(2.85, 3.30)

# começo de "tatuagem": a transcrição diz 1.90 (atrasada). O corte antigo pegava o silêncio do "t" (1.95-2.02).
c = EM.inicio_real(audio, 1.90, 1.25)
assert 1.40 < c < 1.70, f'começo: corte em {c:.3f}, devia ficar na pausa 1.40-1.70'
# fim de "tatuagem": a transcrição diz 2.30 (adiantada). Não pode cortar antes de 2.50.
c = EM.fim_real(audio, 2.30, 2.90)
assert 2.50 <= c < 2.85, f'fim: corte em {c:.3f}, devia ficar na pausa 2.50-2.85'
# fim de "uma" com a transcrição certa
c = EM.fim_real(audio, 1.40, 1.80)
assert 1.40 <= c < 1.70, f'fim de "uma": {c:.3f}'
print('OK: emenda nunca cai dentro da palavra')
