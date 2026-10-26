# Monta motion/pecas/portal-do-cliente-v2.json a partir dos tempos de cada palavra da narração (ElevenLabs).
# Uso: python3 portal-do-cliente-v2.gera.py palavras.json saida.json   (palavras = [[texto, inicio, fim], ...])
import json, sys
W = json.load(open(sys.argv[1]))
norm = lambda s: s.strip('.,?!:').lower()

def pal(frase, de, inicio, destaque=(), quebra=()):
    # palavras da narração a partir do tempo `de`, com `em` relativo ao início da cena
    alvo = frase.split()
    i = next(k for k, w in enumerate(W) if w[1] >= de - 0.15 and norm(w[0]) == norm(alvo[0]))
    out = []
    for j, a in enumerate(alvo):
        w = W[i + j]; assert norm(w[0]) == norm(a), (w, a)
        p = {"t": a, "em": round(w[1] - inicio, 2)}
        if a.strip('.,?!:') in destaque: p["destaque"] = True
        if a.strip('.,?!:') in quebra: p["quebra"] = True
        out.append(p)
    return out

def man(frase, em, passo=0.14, destaque=(), quebra=()):
    # texto que não é falado: entra palavra por palavra a partir de `em`
    out = []
    for j, a in enumerate(frase.split()):
        p = {"t": a, "em": round(em + j * passo, 2)}
        if a.strip('.,?!:') in destaque: p["destaque"] = True
        if a.strip('.,?!:') in quebra: p["quebra"] = True
        out.append(p)
    return out

P = 'portal2/'
cenas = []
def tela(nome, em=0): return {"src": P + nome + '.png', "em": round(em, 2)}
def rel(lista, i0):
    for x in lista:
        for f in ('em', 'ate'):
            if f in x: x[f] = round(x[f] - i0, 2)
    return lista
def nav(i0, fim, telas, **k):
    for key in ('camera', 'cursor', 'destaques'):
        if key in k: k[key] = rel(k[key], i0)
    cenas.append(dict(tipo='navegador', inicio=i0, fim=fim, telas=[tela(n, e - i0 if e else 0) for n, e in telas], **k))
def cx(em, ate, x, y, w, h): return {"em": em, "ate": ate, "x": x, "y": y, "w": w, "h": h}
def cam(em, x, y, z): return {"em": em, "x": x, "y": y, "zoom": z}
def cur(em, x, y, clique=True): return {"em": em, "x": x, "y": y, "clique": clique}

# caixas (frações da tela 1440x900)
NAV = {'inicio': (0.011, 0.107), 'entregas': (0.011, 0.157), 'gravacoes': (0.011, 0.206), 'mensagens': (0.011, 0.255)}
def navx(n, em, ate): x, y = NAV[n]; return cx(em, ate, x, y, 0.138, 0.047)
def navc(n, em): x, y = NAV[n]; return cur(em, x + 0.05, y + 0.024)
TILE = [(0.189, 0.124), (0.454, 0.124), (0.719, 0.124)]
def tile(i, em, ate): return cx(em, ate, TILE[i][0], TILE[i][1], 0.254, 0.235)
def col(i, em, ate): return cx(em, ate, 0.189 + 0.161 * i, 0.175, 0.153, 0.356)

# 1 abertura
cenas.append(dict(tipo='pergunta', inicio=0, fim=7.2, palavras=pal('Já imaginou acompanhar tudo do seu canal num lugar só, sem precisar procurar nada no WhatsApp?', 0, 0, destaque={'lugar', 'só'}, quebra={'num', 'sem'})))
# 2 o portal
nav(7.2, 19.0, [('inicio', 0)], rotulo='Portal do Cliente', endereco='grupoeuforia.com.br/portal',
    camera=[cam(8.0, 0.5, 0.4, 1.06)],
    destaques=[navx('entregas', 11.5, 12.9), tile(0, 13.0, 14.8), tile(1, 14.9, 16.8), navx('gravacoes', 16.9, 18.8)])
# 3 link próprio
nav(19.0, 27.6, [('inicio', 0)], rotulo='Link próprio', endereco='grupoeuforia.com.br/portal',
    texto=man('Um link só seu.', 21.5 - 19.0, 0.2, destaque={'seu'}) + man('Sem senha. Sem instalar nada.', 24.8 - 19.0, 0.25, quebra={'Sem'}),
    camera=[cam(20.5, 0.2, 0.8, 1.3)], destaques=[cx(21.6, 27.3, 0.011, 0.93, 0.138, 0.043)])
# 4 quatro abas
cenas.append(dict(tipo='abas', inicio=27.6, fim=33.6, titulo=pal('O portal tem quatro abas:', 27.7, 27.6, destaque={'quatro'}), abas=[
    {"t": 'Início', "desc": 'O que está esperando por você', "em": round(29.8 - 27.6, 2), "icone": 'casa'},
    {"t": 'Entregas', "desc": 'Cada peça, do a fazer ao publicado', "em": round(30.6 - 27.6, 2), "icone": 'quadro'},
    {"t": 'Gravações', "desc": 'Roteiros e envio do vídeo', "em": round(31.5 - 27.6, 2), "icone": 'camera'},
    {"t": 'Mensagens', "desc": 'Conversa direta com a equipe', "em": round(32.6 - 27.6, 2), "icone": 'balao'}]))
# 5 início
nav(33.6, 49.8, [('inicio', 0)], rotulo='Início',
    camera=[cam(34.4, 0.58, 0.26, 1.55), cam(43.4, 0.6, 0.56, 1.55)],
    cursor=[navc('inicio', 34.0)],
    destaques=[tile(0, 36.2, 38.9), tile(1, 39.6, 41.8), tile(2, 42.0, 43.4), cx(45.1, 46.6, 0.189, 0.43, 0.435, 0.235), cx(46.8, 49.6, 0.665, 0.563, 0.293, 0.073)])
# 6 entregas
nav(49.8, 69.0, [('entregas', 0)], rotulo='Entregas',
    camera=[cam(50.4, 0.55, 0.33, 1.15), cam(60.0, 0.45, 0.3, 1.6), cam(64.6, 0.55, 0.33, 1.15)],
    cursor=[navc('entregas', 50.1)],
    destaques=[col(0, 53.2, 54.0), col(1, 54.1, 55.1), col(2, 55.2, 56.4), col(3, 56.5, 57.6), col(4, 57.7, 58.9),
               cx(60.4, 61.1, 0.36, 0.238, 0.13, 0.08), cx(61.2, 61.8, 0.2, 0.238, 0.13, 0.07), cx(61.9, 63.8, 0.528, 0.37, 0.12, 0.08),
               cx(64.9, 68.6, 0.189, 0.175, 0.79, 0.356)])
# 7 aprovar
nav(69.0, 84.5, [('entregas', 0), ('aprovar', 77.55), ('aprovado', 81.65)], rotulo='Aprovar',
    camera=[cam(69.4, 0.59, 0.3, 1.7), cam(73.7, 0.12, 0.2, 2.2), cam(76.0, 0.59, 0.3, 1.7), cam(77.7, 0.8, 0.3, 1.6), cam(81.8, 0.6, 0.45, 1.15)],
    cursor=[cur(77.3, 0.58, 0.26), cur(81.4, 0.686, 0.348)],
    destaques=[col(2, 72.2, 73.6), navx('entregas', 73.8, 75.8), cx(77.9, 79.3, 0.656, 0.188, 0.082, 0.047), col(4, 82.4, 84.3), cx(82.4, 84.3, 0.39, 0.925, 0.22, 0.045)])
# 8 ajuste
nav(84.5, 97.7, [('aprovar', 0), ('ajuste', 87.0), ('ajuste-escrito', 89.0), ('ajuste-enviado', 93.4)], rotulo='Pedir ajuste',
    camera=[cam(84.5, 0.8, 0.35, 1.55), cam(87.5, 0.8, 0.5, 1.55), cam(93.5, 0.6, 0.4, 1.15)],
    cursor=[cur(86.8, 0.764, 0.348), cur(88.0, 0.8, 0.47), cur(90.9, 0.82, 0.592), cur(93.2, 0.72, 0.652)],
    destaques=[cx(88.6, 90.6, 0.656, 0.423, 0.328, 0.107), cx(90.9, 92.6, 0.656, 0.57, 0.328, 0.05), col(3, 94.4, 97.4)])
# 9 frase
cenas.append(dict(tipo='pergunta', inicio=97.7, fim=101.2, simbolo='', palavras=pal('Nada vai ao ar sem o seu OK.', 97.9, 97.7, destaque={'OK'}, quebra={'sem'})))
# 10 gravações e roteiro
nav(101.2, 107.0, [('gravacoes', 0), ('roteiro', 104.7)], rotulo='Gravações',
    camera=[cam(101.8, 0.41, 0.26, 1.7), cam(104.9, 0.8, 0.3, 1.5)],
    cursor=[navc('gravacoes', 101.5), cur(104.5, 0.606, 0.222)],
    destaques=[cx(102.9, 104.3, 0.203, 0.186, 0.421, 0.149), cx(105.6, 106.9, 0.656, 0.269, 0.328, 0.23)])
# 11 teleprompter, .txt e PDF
nav(107.0, 124.9, [('roteiro', 0), ('roteiro-copiado', 110.3)], rotulo='Teleprompter',
    camera=[cam(107.0, 0.8, 0.3, 1.5), cam(108.0, 0.78, 0.2, 1.9), cam(112.4, 0.65, 0.55, 1.2), cam(119.3, 0.8, 0.2, 1.9)],
    cursor=[cur(110.0, 0.748, 0.166)],
    destaques=[cx(109.3, 110.6, 0.656, 0.143, 0.184, 0.047), cx(112.6, 116.6, 0.656, 0.269, 0.328, 0.23), cx(116.8, 118.9, 0.34, 0.925, 0.32, 0.045),
               cx(120.3, 122.0, 0.847, 0.143, 0.072, 0.047), cx(122.6, 124.6, 0.656, 0.202, 0.094, 0.047)])
# 12 antes de gravar
nav(124.9, 136.6, [('gravacoes', 0)], rotulo='Antes de gravar',
    camera=[cam(125.2, 0.81, 0.64, 2.0)],
    destaques=[cx(127.5, 130.4, 0.665, 0.601, 0.293, 0.031), cx(130.8, 131.9, 0.665, 0.632, 0.293, 0.031), cx(132.0, 136.3, 0.665, 0.663, 0.293, 0.031)])
# 13 envio
nav(136.6, 162.0, [('gravacoes', 0), ('envio-escolhido', 142.4), ('envio-progresso', 146.3), ('envio-recebido', 156.6)], rotulo='Enviar gravação',
    camera=[cam(137.0, 0.81, 0.33, 1.6)],
    cursor=[cur(142.2, 0.81, 0.26), cur(143.6, 0.81, 0.379), cur(146.1, 0.81, 0.44)],
    destaques=[cx(141.6, 142.9, 0.665, 0.186, 0.293, 0.148), cx(143.2, 145.0, 0.665, 0.356, 0.293, 0.046), cx(147.5, 151.8, 0.665, 0.417, 0.293, 0.031),
               cx(152.6, 155.9, 0.665, 0.463, 0.293, 0.047), cx(157.2, 161.8, 0.665, 0.417, 0.293, 0.035)])
# 14 do envio ao ar
cenas.append(dict(tipo='abas', inicio=162.0, fim=172.9, titulo=man('Do envio até o ar', 0.15, 0.16, destaque={'ar'}), abas=[
    {"t": 'Edição', "desc": 'A edição começa assim que o vídeo chega', "em": 0.6, "icone": 'computador'},
    {"t": 'Aprovação', "desc": 'O vídeo aparece em Entregas para você', "em": round(164.0 - 162.0, 2), "icone": 'check'},
    {"t": 'Shorts', "desc": 'Os cortes do mesmo conteúdo', "em": round(168.5 - 162.0, 2), "icone": 'celular'},
    {"t": 'Carrossel', "desc": 'Também chega por aqui', "em": round(169.3 - 162.0, 2), "icone": 'quadro'}]))
# 15 mensagens
nav(172.9, 183.2, [('mensagens', 0), ('msg-escrita', 179.2), ('msg-enviada', 180.0)], rotulo='Mensagens',
    camera=[cam(173.6, 0.55, 0.26, 1.4)],
    cursor=[navc('mensagens', 173.2), cur(179.0, 0.45, 0.343), cur(179.8, 0.93, 0.343)],
    destaques=[cx(175.7, 178.6, 0.203, 0.147, 0.754, 0.157), cx(181.1, 183.0, 0.21, 0.155, 0.43, 0.06)])
# 16 cada pessoa, um link
nav(183.2, 193.8, [('inicio', 0)], rotulo='Quem acessa',
    texto=pal('Cada pessoa tem o próprio link,', 185.9, 183.2, destaque={'link'}, quebra={'o'}),
    camera=[cam(186.3, 0.2, 0.8, 1.6)], destaques=[cx(188.4, 193.5, 0.011, 0.93, 0.138, 0.043)])
# 17 quem faz o quê
cenas.append(dict(tipo='abas', inicio=193.8, fim=199.8, titulo=man('Quem faz o quê', 0.15, 0.16, destaque={'quê'}), abas=[
    {"t": 'Você e seu sócio', "desc": 'Aprovam e pedem ajuste', "em": round(194.0 - 193.8, 2), "icone": 'coroa'},
    {"t": 'Sua equipe', "desc": 'Acompanha, manda mensagem e envia gravações', "em": round(197.8 - 193.8, 2), "icone": 'grupo'}]))
# 18 equipe não aprova
nav(199.8, 203.4, [('equipe-aprovar', 0)], rotulo='Equipe', camera=[cam(199.8, 0.8, 0.3, 1.6)],
    destaques=[cx(202.2, 203.3, 0.656, 0.255, 0.328, 0.073)])
# 19 pedir no grupo
cenas.append(dict(tipo='pergunta', inicio=203.4, fim=208.5, simbolo='', palavras=pal('Para incluir alguém, ou se perder o seu link, é só pedir no grupo.', 203.5, 203.4, destaque={'grupo'}, quebra={'é'})))
# 20 celular
nav(208.5, 218.4, [('cel-inicio', 0), ('cel-entregas', 212.6), ('cel-gravacoes', 215.2)], dispositivo='celular', rotulo='De onde estiver',
    texto=pal('Funciona no celular e no computador.', 208.6, 208.5, destaque={'celular', 'computador'}, quebra={'e'}),
    cursor=[cur(212.4, 0.36, 0.107), cur(215.0, 0.66, 0.107)])
# 21 fecho
cenas.append(dict(tipo='logo', inicio=218.4, fim=224.3, logo=P + 'logo-euforia-hd.png', botao='BOAS-VINDAS!', botaoEm=round(222.0 - 218.4, 2)))

peca = {"fps": 30, "largura": 1920, "altura": 1080, "duracao": 224.3, "audio": P + 'narracao.mp3',
  "marca": {"primaria": "#FF5A00", "secundaria": "#FF8A3D", "escura": "#141414", "fundo": "#FFFFFF", "texto": "#5E5A54",
            "fonteTitulo": "Barlow Condensed", "fonteCorpo": "Inter", "fonteDestaque": "Barlow Condensed"},
  "cenas": cenas}
json.dump(peca, open(sys.argv[2], 'w'), ensure_ascii=False, indent=1)
print('ok', len(cenas))
