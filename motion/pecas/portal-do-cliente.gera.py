import json, sys
W = json.load(open(sys.argv[1]))
def pal(frase, de, inicio, destaque=(), quebra=()):
    # acha as palavras da frase a partir do tempo `de` e devolve com `em` relativo ao início da cena
    alvo = frase.split(); out = []
    i = next(k for k, w in enumerate(W) if w[1] >= de - 0.05 and w[0].strip('.,?!:').lower() == alvo[0].strip('.,?!:').lower())
    for j, a in enumerate(alvo):
        w = W[i + j]; assert w[0].strip('.,?!:').lower() == a.strip('.,?!:').lower(), (w, a)
        p = {"t": a, "em": round(w[1] - inicio, 2)}
        if a.strip('.,?!:') in destaque: p["destaque"] = True
        if a.strip('.,?!:') in quebra: p["quebra"] = True
        out.append(p)
    return out
P = 'portal/'
cenas = []
def c(**k): cenas.append(k)
c(tipo='pergunta', inicio=0, fim=4.2, palavras=pal('Já imaginou acompanhar tudo do seu canal num lugar só?', 0, 0, destaque={'lugar', 'só'}, quebra={'num'}))
c(tipo='navegador', inicio=4.2, fim=8.3, rotulo='Portal do Cliente', telas=[{"src": P+'inicio.png', "em": 0}], camera=[{"em": 1.2, "x": 0.5, "y": 0.4, "zoom": 1.08}])
c(tipo='abas', inicio=8.3, fim=13.9, titulo=pal('São quatro abas:', 8.4, 8.3, destaque={'quatro'}), abas=[
  {"t": 'Início', "desc": 'O que está esperando por você', "em": round(9.86-8.3, 2), "icone": 'casa'},
  {"t": 'Entregas', "desc": 'Cada peça, do a fazer ao publicado', "em": round(10.63-8.3, 2), "icone": 'quadro'},
  {"t": 'Gravações', "desc": 'Roteiros e envio do vídeo', "em": round(11.70-8.3, 2), "icone": 'camera'},
  {"t": 'Mensagens', "desc": 'Conversa direta com a equipe', "em": round(13.02-8.3, 2), "icone": 'balao'}])
i0 = 13.9
c(tipo='navegador', inicio=i0, fim=21.6, rotulo='Início', telas=[{"src": P+'inicio.png', "em": 0}],
  camera=[{"em": 0.5, "x": 0.58, "y": 0.26, "zoom": 1.55}],
  cursor=[{"em": 0.4, "x": 0.07, "y": 0.13, "clique": True}],
  destaques=[{"em": 15.99-i0, "ate": 17.4-i0, "x": 0.189, "y": 0.124, "w": 0.254, "h": 0.235},
             {"em": 17.64-i0, "ate": 19.7-i0, "x": 0.454, "y": 0.124, "w": 0.254, "h": 0.235},
             {"em": 19.98-i0, "ate": 30, "x": 0.719, "y": 0.124, "w": 0.254, "h": 0.235}])
i0 = 21.6
c(tipo='navegador', inicio=i0, fim=34.9, rotulo='Entregas',
  telas=[{"src": P+'entregas.png', "em": 0}, {"src": P+'aprovar.png', "em": 32.45-i0}, {"src": P+'aprovado.png', "em": 34.25-i0}],
  camera=[{"em": 0.3, "x": 0.58, "y": 0.33, "zoom": 1.2}, {"em": 27.9-i0, "x": 0.59, "y": 0.3, "zoom": 1.75}, {"em": 32.5-i0, "x": 0.8, "y": 0.33, "zoom": 1.55}, {"em": 34.3-i0, "x": 0.6, "y": 0.3, "zoom": 1.25}],
  cursor=[{"em": 0.5, "x": 0.07, "y": 0.18, "clique": True}, {"em": 32.36-i0, "x": 0.58, "y": 0.26, "clique": True}, {"em": 34.12-i0, "x": 0.686, "y": 0.348, "clique": True}],
  destaques=[{"em": 30.38-i0, "ate": 32.2-i0, "x": 0.511, "y": 0.175, "w": 0.153, "h": 0.356}])
i0 = 34.9
c(tipo='navegador', inicio=i0, fim=44.7, rotulo='Pedir ajuste',
  telas=[{"src": P+'aprovar.png', "em": 0}, {"src": P+'ajuste.png', "em": 37.2-i0}, {"src": P+'ajuste-escrito.png', "em": 38.9-i0}],
  camera=[{"em": 0, "x": 0.8, "y": 0.33, "zoom": 1.55}, {"em": 37.6-i0, "x": 0.8, "y": 0.5, "zoom": 1.55}],
  cursor=[{"em": 37.13-i0, "x": 0.764, "y": 0.348, "clique": True}, {"em": 38.5-i0, "x": 0.8, "y": 0.47, "clique": True}, {"em": 41.63-i0, "x": 0.82, "y": 0.592, "clique": True}, {"em": 43.0-i0, "x": 0.72, "y": 0.652, "clique": True}],
  destaques=[{"em": 38.9-i0, "ate": 41.2-i0, "x": 0.656, "y": 0.423, "w": 0.328, "h": 0.107}])
c(tipo='pergunta', inicio=44.7, fim=47.95, simbolo='', palavras=pal('Nada vai ao ar sem o seu OK.', 44.7, 44.7, destaque={'OK'}, quebra={'sem'}))
i0 = 47.95
c(tipo='navegador', inicio=i0, fim=61.1, rotulo='Gravações', telas=[{"src": P+'gravacoes.png', "em": 0}],
  camera=[{"em": 49.3-i0, "x": 0.41, "y": 0.27, "zoom": 1.6}, {"em": 51.2-i0, "x": 0.81, "y": 0.33, "zoom": 1.6}],
  cursor=[{"em": 0.5, "x": 0.07, "y": 0.23, "clique": True}, {"em": 50.3-i0, "x": 0.6, "y": 0.235, "clique": True}, {"em": 52.4-i0, "x": 0.81, "y": 0.26, "clique": True}, {"em": 60.2-i0, "x": 0.81, "y": 0.463, "clique": True}],
  destaques=[{"em": 49.47-i0, "ate": 51.0-i0, "x": 0.203, "y": 0.186, "w": 0.421, "h": 0.149},
             {"em": 55.58-i0, "ate": 59.5-i0, "x": 0.665, "y": 0.186, "w": 0.293, "h": 0.148}])
i0 = 61.1
c(tipo='navegador', inicio=i0, fim=71.5, rotulo='Mensagens', telas=[{"src": P+'mensagens.png', "em": 0}, {"src": P+'msg-escrita.png', "em": 67.6-i0}],
  camera=[{"em": 0.5, "x": 0.55, "y": 0.26, "zoom": 1.4}],
  cursor=[{"em": 0.5, "x": 0.07, "y": 0.28, "clique": True}, {"em": 67.12-i0, "x": 0.45, "y": 0.343, "clique": True}, {"em": 68.4-i0, "x": 0.93, "y": 0.343, "clique": True}],
  destaques=[{"em": 63.7-i0, "ate": 66.6-i0, "x": 0.203, "y": 0.147, "w": 0.754, "h": 0.157},
             {"em": 69.25-i0, "ate": 30, "x": 0.21, "y": 0.155, "w": 0.43, "h": 0.06}])
i0 = 71.5
c(tipo='abas', inicio=i0, fim=81.95, titulo=pal('Cada pessoa tem o próprio link.', 71.5, i0, destaque={'link'}), abas=[
  {"t": 'Você e seu sócio', "desc": 'Aprovam e pedem ajuste', "em": round(74.19-i0, 2), "icone": 'coroa'},
  {"t": 'Sua equipe', "desc": 'Acompanha, manda mensagem e envia gravações', "em": round(77.33-i0, 2), "icone": 'grupo'}])
i0 = 81.95
c(tipo='navegador', inicio=i0, fim=88.95, dispositivo='celular', rotulo='De onde estiver',
  texto=pal('Funciona no celular e no computador.', 82.0, i0, destaque={'celular', 'computador'}, quebra={'e'}),
  telas=[{"src": P+'cel-inicio.png', "em": 0}, {"src": P+'cel-entregas.png', "em": 85.75-i0}],
  cursor=[{"em": 85.6-i0, "x": 0.36, "y": 0.107, "clique": True}])
c(tipo='logo', inicio=88.95, fim=95.6, logo=P+'logo-euforia-hd.png', botao='BOAS-VINDAS!', botaoEm=round(92.46-88.95, 2))
for k in cenas:
    for key in ('camera', 'cursor', 'destaques'):
        for x in k.get(key, []):
            for f in ('em', 'ate'):
                if f in x: x[f] = round(x[f], 2)
peca = {"fps": 30, "largura": 1920, "altura": 1080, "duracao": 95.6, "audio": P+'narracao.mp3',
  "marca": {"primaria": "#FF5A00", "secundaria": "#FF8A3D", "escura": "#141414", "fundo": "#FFFFFF", "texto": "#5E5A54",
            "fonteTitulo": "Barlow Condensed", "fonteCorpo": "Inter", "fonteDestaque": "Barlow Condensed"},
  "cenas": cenas}
json.dump(peca, open(sys.argv[2], 'w'), ensure_ascii=False, indent=1)
print('ok', len(cenas))
