# Monta motion/pecas/painel-equipe-v2.json a partir dos tempos de cada palavra da narração
# (remotion/public/painel2/palavras.json) e das posições dos elementos nas telas (rects.json).
import json, re, sys
P = 'remotion/public/painel2/'
W = json.load(open(P + 'palavras.json'))
R = json.load(open(P + 'rects.json'))
norm = lambda s: re.sub(r'[^\wÀ-ú]', '', s.lower())
NW = [norm(w['t']) for w in W]
cursor_busca = 0

def em(frase, depois=None):
    """Início da frase (procura a partir da última frase achada)."""
    global cursor_busca
    alvo = [norm(x) for x in frase.split()]
    ini = cursor_busca if depois is None else depois
    for i in range(ini, len(NW)):
        if NW[i:i + len(alvo)] == alvo:
            return i
    sys.exit('não achei: ' + frase)

def t(frase):
    global cursor_busca
    i = em(frase); cursor_busca = i
    return W[i]['s']

def palavra(texto, ini, base, destaque=False, quebra=False, procura=None):
    """Palavra que aparece quando a narração diz `procura` (ou o próprio texto)."""
    i = em(procura or texto, ini)
    d = {'t': texto, 'em': round(max(0, W[i]['s'] - base), 2)}
    if destaque: d['destaque'] = True
    if quebra: d['quebra'] = True
    return d

def rel(frase, base):
    # procura a frase a partir da primeira palavra do trecho que começa em `base`
    i0 = next(i for i, w in enumerate(W) if w['s'] >= base - 0.01)
    return round(W[em(frase, i0)]['s'] - base, 2)

def rect(tela, chave, folga=0.006):
    r = R[tela][chave]
    return {'x': round(r['x'] - folga, 3), 'y': round(r['y'] - folga, 3), 'w': round(r['w'] + 2 * folga, 3), 'h': round(r['h'] + 2 * folga, 3)}

def centro(tela, chave):
    r = R[tela][chave]
    return round(r['x'] + r['w'] / 2, 3), round(r['y'] + r['h'] / 2, 3)

def dest(tela, chave, de, ate, folga=0.006):
    d = rect(tela, chave, folga); d.update({'em': de, 'ate': ate}); return d

def cam(tela, chave, quando, zoom):
    x, y = centro(tela, chave); return {'em': quando, 'x': x, 'y': y, 'zoom': zoom}

def clique(tela, chave, quando, clicar=True):
    x, y = centro(tela, chave); d = {'em': quando, 'x': x, 'y': y}
    if clicar: d['clique'] = True
    return d

# Marcos da narração (em segundos do áudio todo)
M = {}
for k, f in [('abre', 'Pessoal, o Painel'), ('pin', 'Cada um tem um link'), ('menu', 'O menu muda'), ('ordem', 'Na Minha fila, os cards'),
             ('ouro', 'Por isso, a regra'), ('faixa', 'A faixa do lado'), ('card', 'Abriu o card?'), ('entrega', 'Terminou? Arraste'),
             ('revisao', 'Na aba Revisão'), ('ajuste', 'Se voltar com ajuste'), ('ciclo', 'Aprovado pelo Ismael'), ('postar', 'Quem posta marca'),
             ('demandas', 'Tem demanda sem dono?'), ('naoemeu', 'E se um card'), ('passar', 'O Ismael e o Rômulo também'),
             ('grade', 'A Grade de postagem'), ('pedir', 'Precisa de uma thumb'), ('anexos', 'Dá para anexar'), ('falta', 'Se faltar informação'),
             ('responder', 'Na aba Responder'), ('escrever', 'Dá para responder ali'), ('celular', 'E tudo funciona'),
             ('notion', 'Cada clique de vocês'), ('semcampo', 'Sem campo esquecido'), ('logo', 'Painel da Equipe. Menos')]:
    M[k] = t(f)
FIM_AUDIO = W[-1]['e']
ordem = list(M)
def fim(k):
    i = ordem.index(k)
    return M[ordem[i + 1]] - 0.15 if i + 1 < len(ordem) else FIM_AUDIO + 2.2
def ini(k):
    return 0 if k == 'abre' else M[k] - 0.15
idx = lambda k: em(k == 'abre' and 'Pessoal' or {'abre':'Pessoal'}.get(k, ''), 0) if False else None

def I(k):  # índice da primeira palavra do trecho
    return next(i for i, w in enumerate(W) if abs(w['s'] - M[k]) < 1e-6)

NAV = {'endereco': 'painel da equipe'}
cenas = []
def nav(k, rotulo, telas, **kw):
    base = ini(k)
    c = {'tipo': 'navegador', 'inicio': round(base, 2), 'fim': round(fim(k), 2), **NAV, 'rotulo': rotulo,
         'telas': [{'src': 'painel2/' + s + '.png', 'em': q} for s, q in telas]}
    c.update(kw); cenas.append(c); return base

# 1. Abertura
b = ini('abre'); i0 = I('abre')
cenas.append({'tipo': 'pergunta', 'inicio': 0, 'fim': round(fim('abre'), 2), 'palavras': [
    palavra('Tudo', i0, b, procura='tudo'), palavra('o', i0, b, procura='o que'), palavra('que', i0, b, procura='que ele'),
    palavra('o', i0, b, procura='ele faz'), palavra('painel', i0, b, procura='ele faz', destaque=True), palavra('faz', i0, b, quebra=True, procura='faz'),
    palavra('do', i0, b, procura='do começo'), palavra('começo', i0, b, procura='começo'), palavra('ao', i0, b, procura='ao fim'), palavra('fim.', i0, b, destaque=True, procura='fim')]})

# 2. PIN
k = 'pin'; b = ini(k); i0 = I(k)
nav(k, 'PRIMEIRO ACESSO', [('pin', 0)],
    texto=[palavra('Link', i0, b, procura='link'), palavra('pessoal', i0, b), palavra('+', i0, b, quebra=True, procura='PIN'), palavra('PIN', i0, b, destaque=True),
           palavra('de', i0, b, quebra=True, procura='de quatro'), palavra('4', i0, b, procura='quatro'), palavra('números', i0, b)],
    camera=[cam('pin', 'pin', rel('digita', b), 1.7)],
    cursor=[clique('pin', 'pin', rel('digita', b)), clique('pin', 'entrar', rel('e o aparelho', b))],
    destaques=[dest('pin', 'pin', rel('digita', b), rel('e o aparelho', b))])

# 3. Quem vê o quê
k = 'menu'; b = ini(k); i0 = I(k)
cenas.append({'tipo': 'abas', 'inicio': round(b, 2), 'fim': round(fim(k), 2),
    'titulo': [palavra('Cada', i0, b, procura='O menu'), palavra('um', i0, b, procura='menu'), palavra('vê', i0, b, procura='muda'), palavra('o', i0, b, procura='conforme'),
               palavra('que', i0, b, procura='a sua'), palavra('é', i0, b, procura='sua'), palavra('seu', i0, b, destaque=True, procura='função')],
    'abas': [{'t': 'Edição', 'desc': 'Minha fila, Fila de demandas e Grade de postagem', 'em': rel('Quem edita', b), 'icone': 'camera'},
             {'t': 'Ismael', 'desc': '+ Revisão, Postar, Responder e Pedir ao escritório', 'em': rel('O Ismael ainda', b), 'icone': 'check'},
             {'t': 'Rômulo', 'desc': '+ Postar, Responder e Pedir ao escritório', 'em': rel('O Rômulo tem', b), 'icone': 'balao'},
             {'t': 'Diretoria', 'desc': 'A visão geral de tudo', 'em': rel('E a diretoria', b), 'icone': 'coroa'}]})

# 4. Ordem da fila
k = 'ordem'; b = ini(k); i0 = I(k)
cenas.append({'tipo': 'lista', 'inicio': round(b, 2), 'fim': round(fim(k), 2), 'estilo': 'numeros',
    'titulo': [palavra('Sua', i0, b, procura='Na'), palavra('fila', i0, b, procura='Minha'), palavra('já', i0, b), palavra('vem', i0, b, procura='vêm'),
               palavra('na', i0, b, procura='na ordem'), palavra('ordem', i0, b), palavra('certa', i0, b, destaque=True)],
    'itens': [{'t': 'Ajustes pedidos', 'sub': 'o cliente já está esperando', 'em': rel('primeiro os ajustes', b)},
              {'t': 'O que vai ao ar antes', 'em': rel('depois o que vai', b)},
              {'t': 'Faixa do cliente: A, B, C', 'em': rel('depois a faixa', b)},
              {'t': 'O prazo mais perto', 'em': rel('por último', b)}]})

# 5. Regra de ouro
k = 'ouro'; b = ini(k); i0 = I(k)
cenas.append({'tipo': 'pergunta', 'inicio': round(b, 2), 'fim': round(fim(k), 2), 'palavras': [
    palavra('Regra', i0, b), palavra('de', i0, b, procura='de ouro'), palavra('ouro:', i0, b, destaque=True, procura='ouro'),
    palavra('comece', i0, b, quebra=True), palavra('sempre', i0, b), palavra('pelo', i0, b), palavra('primeiro', i0, b), palavra('card.', i0, b, destaque=True, procura='card')]})

# 6. Faixas
k = 'faixa'; b = ini(k); i0 = I(k)
cenas.append({'tipo': 'lista', 'inicio': round(b, 2), 'fim': round(fim(k), 2), 'estilo': 'faixas',
    'titulo': [palavra('A', i0, b), palavra('faixa', i0, b), palavra('do', i0, b), palavra('lado', i0, b), palavra('mostra', i0, b), palavra('a', i0, b, procura='a urgência'), palavra('urgência.', i0, b, destaque=True, procura='urgência')],
    'itens': [{'t': 'Atrasado', 'sub': 'faixa vermelha', 'em': rel('Vermelho', b), 'cor': '#B42318'},
              {'t': 'Prazo é hoje', 'sub': 'faixa laranja', 'em': rel('Laranja', b), 'cor': '#FF5A00'},
              {'t': 'Ajuste pedido', 'sub': 'faixa mostarda', 'em': rel('Mostarda', b), 'cor': '#9A6200'}]})

# 7. Abrir o card e Comecei
k = 'card'; b = ini(k)
nav(k, 'MINHA FILA', [('fila-editor', 0), ('drawer-comecar', 0.9)],
    camera=[cam('drawer-comecar', 'dl', rel('Leia como', b), 1.7), cam('drawer-comecar', 'comecei', rel('Aí é só', b), 1.7)],
    cursor=[{'em': 0.5, 'x': 0.3, 'y': 0.5, 'clique': True}, clique('drawer-comecar', 'comecei', rel('Comecei', b))],
    destaques=[dest('drawer-comecar', 'dl', rel('Leia como', b), rel('Aí é só', b)), dest('drawer-comecar', 'comecei', rel('Comecei', b) - 0.3, fim(k) - b)])

# 8. Entregar
k = 'entrega'; b = ini(k)
nav(k, 'ENTREGAR', [('drawer-fazendo', 0)],
    camera=[cam('drawer-fazendo', 'drop', rel('Arraste', b), 1.7), cam('drawer-fazendo', 'mandar', rel('Aperte', b), 1.6)],
    cursor=[clique('drawer-fazendo', 'drop', rel('Arraste', b) + 0.4), clique('drawer-fazendo', 'mandar', rel('Mandar para revisão', b))],
    destaques=[dest('drawer-fazendo', 'drop', rel('Arraste', b), rel('Aperte', b)), dest('drawer-fazendo', 'mandar', rel('Aperte', b), fim(k) - b)])

# 9. Revisão
k = 'revisao'; b = ini(k)
nav(k, 'REVISÃO · ISMAEL', [('revisao', 0), ('drawer-revisao', rel('abre o arquivo', b))],
    camera=[cam('drawer-revisao', 'aprovar', rel('e aprova', b), 1.6), cam('drawer-revisao', 'ajuste', rel('ou pede ajuste', b), 1.6)],
    cursor=[{'em': rel('abre o arquivo', b) - 0.4, 'x': 0.3, 'y': 0.35, 'clique': True}, clique('drawer-revisao', 'aprovar', rel('e aprova', b))],
    destaques=[dest('drawer-revisao', 'aprovar', rel('e aprova', b), rel('ou pede', b)), dest('drawer-revisao', 'ajuste', rel('ou pede', b), fim(k) - b)])

# 10. Ajustes na fila
k = 'ajuste'; b = ini(k)
nav(k, 'AJUSTES', [('fila-editor', 0)],
    camera=[cam('fila-editor', 'primeiro', 0.6, 1.6)],
    destaques=[dest('fila-editor', 'primeiro', 0.7, rel('com o motivo', b)), dest('fila-editor', 'ajuste', rel('com o motivo', b), fim(k) - b)],
    cursor=[{'em': rel('Manda de novo', b), 'x': 0.91, 'y': round(centro('fila-editor', 'primeiro')[1], 3), 'clique': True}])

# 11. Caminho da entrega
k = 'ciclo'; b = ini(k); i0 = I(k)
cenas.append({'tipo': 'ciclo', 'inicio': round(b, 2), 'fim': round(fim(k), 2), 'card': 'Vídeo longo · Cliente',
    'titulo': [{'t': 'O', 'em': 0.1}, {'t': 'caminho', 'em': 0.25}, {'t': 'de', 'em': 0.5}, {'t': 'toda', 'em': 0.6}, {'t': 'entrega', 'em': 0.8, 'destaque': True}],
    'etapas': [{'t': 'Fazendo', 'quem': 'você', 'em': 0}, {'t': 'Em revisão', 'quem': 'Ismael', 'em': 0.15}, {'t': 'Aguardando cliente', 'em': rel('vai para o cliente', b)},
               {'t': 'Aprovado', 'quem': 'cliente', 'em': rel('Quando o cliente', b)}, {'t': 'Agendado', 'em': rel('aba Postar', b)}, {'t': 'Postado', 'quem': 'com o link', 'em': rel('aba Postar', b) + 0.8}],
    'saiEm': round(fim(k) - b - 0.6, 2), 'saiTexto': 'Vai para Postar'})

# 12. Postar
k = 'postar'; b = ini(k)
nav(k, 'POSTAR · ISMAEL E RÔMULO', [('postar', 0), ('drawer-postar', 0.8)],
    camera=[cam('drawer-postar', 'link', rel('com o link', b), 1.7)],
    cursor=[{'em': 0.4, 'x': 0.3, 'y': 0.3, 'clique': True}, clique('drawer-postar', 'botoes', rel('Postei', b))],
    destaques=[dest('drawer-postar', 'botoes', rel('Agendei', b), rel('com o link', b)), dest('drawer-postar', 'link', rel('com o link', b), fim(k) - b)])

# 13. Fila de demandas
k = 'demandas'; b = ini(k)
nav(k, 'FILA DE DEMANDAS', [('demandas', 0)],
    camera=[cam('demandas', 'lista', rel('Escolha uma', b), 1.4), cam('demandas', 'limite', rel('Cada pessoa', b), 1.7)],
    cursor=[clique('demandas', 'pegar', rel('Pegar', b))],
    destaques=[dest('demandas', 'lista', 0.5, rel('Escolha uma', b)), dest('demandas', 'pegar', rel('Escolha uma', b), rel('Cada pessoa', b)), dest('demandas', 'limite', rel('Cada pessoa', b), fim(k) - b)])

# 14. Não é comigo / já foi feito
k = 'naoemeu'; b = ini(k)
nav(k, 'NÃO É COMIGO OU JÁ FOI FEITO', [('drawer-naoemeu', 0)],
    camera=[cam('drawer-naoemeu', 'bloco', 0.6, 1.25)],
    cursor=[clique('drawer-naoemeu', 'confirmar', rel('e o Ismael', b))],
    destaques=[dest('drawer-naoemeu', 'bloco', rel('Abra o card', b), fim(k) - b)])

# 15. Passar para
k = 'passar'; b = ini(k)
nav(k, 'PASSAR PARA · ISMAEL E RÔMULO', [('drawer-passar', 0)],
    camera=[cam('drawer-passar', 'bloco', 0.6, 1.5)],
    cursor=[clique('drawer-passar', 'botao', rel('Quem recebe', b))],
    destaques=[dest('drawer-passar', 'bloco', 0.8, fim(k) - b)])

# 16. Grade
k = 'grade'; b = ini(k)
nav(k, 'GRADE DE POSTAGEM', [('grade', 0)],
    camera=[cam('grade', 'semana', rel('mostra o dia', b), 1.3), cam('grade', 'filtros', rel('Dá para filtrar', b), 1.6)],
    destaques=[dest('grade', 'semana', rel('mostra o dia', b), rel('Dá para filtrar', b)), dest('grade', 'filtros', rel('Dá para filtrar', b), fim(k) - b)])

# 17. Pedir ao escritório
k = 'pedir'; b = ini(k); i0 = I(k)
nav(k, 'PEDIR AO ESCRITÓRIO', [('pedir', 0)],
    camera=[cam('pedir', 'form', rel('Escolha o cliente', b), 1.25)],
    cursor=[{'em': rel('Escolha o cliente', b), 'x': 0.3, 'y': 0.23, 'clique': True}, {'em': rel('e o que precisa', b), 'x': 0.25, 'y': 0.32, 'clique': True}],
    destaques=[dest('pedir', 'form', rel('Escolha o cliente', b), fim(k) - b)])

# 18. Anexos
k = 'anexos'; b = ini(k)
nav(k, 'ANEXOS', [('pedir-anexos', 0)],
    camera=[cam('pedir-anexos', 'anexos', 0.5, 1.35), cam('pedir-anexos', 'nota', rel('A identidade', b), 1.7)],
    destaques=[dest('pedir-anexos', 'anexos', 0.5, rel('A identidade', b)), {'em': rel('A identidade', b), 'ate': fim(k) - b, 'x': 0.205, 'y': 0.77, 'w': 0.412, 'h': 0.08}])

# 19. Falta informação e Completar pedido
k = 'falta'; b = ini(k)
nav(k, 'FALTA INFORMAÇÃO', [('fila-revisor', 0), ('drawer-completar', rel('apertar', b) + 0.4)],
    camera=[cam('fila-revisor', 'falta', 0.5, 1.5), cam('drawer-completar', 'ctx', rel('acrescentar', b), 1.6)],
    cursor=[clique('fila-revisor', 'completar', rel('apertar', b)), clique('drawer-completar', 'botao', rel('e ele volta', b))],
    destaques=[dest('fila-revisor', 'falta', 0.6, rel('apertar', b)), dest('drawer-completar', 'falta', rel('apertar', b) + 0.5, rel('acrescentar', b)),
               dest('drawer-completar', 'ctx', rel('acrescentar', b), fim(k) - b)])

# 20. Responder: conectar
k = 'responder'; b = ini(k)
nav(k, 'RESPONDER · ISMAEL E RÔMULO', [('responder', 0), ('responder-qr', rel('uma vez', b)), ('responder', rel('e veem', b))],
    camera=[cam('responder', 'caixa', 0.8, 1.5), cam('responder-qr', 'qr', rel('pelo QR', b), 1.3), cam('responder', 'lista', rel('e veem', b), 1.2)],
    cursor=[{'em': rel('uma vez', b) - 0.5, 'x': 0.9, 'y': round(centro('responder', 'caixa')[1], 3), 'clique': True}],
    destaques=[dest('responder', 'lista', rel('e veem', b), fim(k) - b)])

# 21. Responder: nome em negrito
k = 'escrever'; b = ini(k); i0 = I(k)
nav(k, 'RESPOSTA NO GRUPO', [('responder-escrever', 0)],
    texto=[palavra('Ismael:', i0, b, destaque=True, procura='com o seu nome'), palavra('Oi,', i0, b, quebra=True, procura='em negrito'), palavra('Paula!', i0, b, procura='na frente')],
    camera=[cam('responder-escrever', 'resp', 0.5, 1.6), cam('responder-escrever', 'direcao', rel('Assunto de dinheiro', b), 1.6)],
    cursor=[clique('responder-escrever', 'resp', rel('a mensagem vai', b))],
    destaques=[dest('responder-escrever', 'resp', 0.5, rel('Assunto', b)), dest('responder-escrever', 'direcao', rel('Assunto', b), fim(k) - b)])

# 22. Celular
k = 'celular'; b = ini(k); i0 = I(k)
cenas.append({'tipo': 'navegador', 'inicio': round(b, 2), 'fim': round(fim(k), 2), 'dispositivo': 'celular', 'proporcao': 844 / 390,
    'telas': [{'src': 'painel2/mobile-fila.png', 'em': 0}],
    'texto': [palavra('Igualzinho', i0, b), palavra('no', i0, b, quebra=True, procura='no celular'), palavra('celular', i0, b, destaque=True)],
    'cursor': [{'em': 1.6, 'x': 0.5, 'y': 0.45, 'clique': True}]})

# 23-24. Notion
k = 'notion'; b = ini(k); i0 = I(k)
cenas.append({'tipo': 'pergunta', 'inicio': round(b, 2), 'fim': round(fim(k), 2), 'palavras': [
    palavra('Cada', i0, b), palavra('clique', i0, b), palavra('de', i0, b), palavra('vocês', i0, b), palavra('já', i0, b),
    palavra('atualiza', i0, b, quebra=True), palavra('o', i0, b, procura='o Notion'), palavra('Notion.', i0, b, destaque=True, procura='Notion')]})
k = 'semcampo'; b = ini(k); i0 = I(k)
cenas.append({'tipo': 'pergunta', 'inicio': round(b, 2), 'fim': round(fim(k), 2), 'simbolo': '', 'palavras': [
    palavra('Sem', i0, b), palavra('campo', i0, b), palavra('esquecido.', i0, b, procura='esquecido'),
    palavra('Sem', i0, b, quebra=True, procura='Sem status'), palavra('status', i0, b), palavra('errado.', i0, b, destaque=True, procura='errado')]})

# 25. Logo
k = 'logo'; b = ini(k)
cenas.append({'tipo': 'logo', 'inicio': round(b, 2), 'fim': round(fim(k), 2), 'logo': 'painel2/logo-3x.png', 'botao': 'PAINEL DA EQUIPE', 'botaoEm': 0.9})

base = json.load(open('motion/pecas/painel-equipe.json'))
peca = {'fps': 30, 'largura': 1920, 'altura': 1080, 'duracao': round(cenas[-1]['fim'], 2), 'audio': 'painel2/narracao.mp3', 'marca': base['marca'], 'cenas': cenas}
json.dump(peca, open('motion/pecas/painel-equipe-v2.json', 'w'), ensure_ascii=False, indent=1)
print('cenas', len(cenas), 'duração', peca['duracao'])
for c in cenas: print(c['tipo'], c['inicio'], c['fim'], c.get('rotulo', ''))
