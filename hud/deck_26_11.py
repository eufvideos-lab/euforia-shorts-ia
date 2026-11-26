#!/usr/bin/env python3
"""Deck do alinhamento do Anselmo Hudson de 26/11/2026.
Uso: python3 hud/deck_26_11.py anuncios.json imgs_dir saida.html [verba_dia]
anuncios.json: [{"n":1,"titulo":"...","drive":"<file_id>","thumb":"caminho.jpg","dur":19}]
imgs_dir: capa.jpg, biblioteca.jpg, palco.jpg (fotos aprovadas do deck de 16/11)."""
import base64, json, os, sys, html

AQUI = os.path.dirname(os.path.abspath(__file__))
anuncios = json.load(open(sys.argv[1])); imgs = sys.argv[2]; saida = sys.argv[3]
verba = int(sys.argv[4]) if len(sys.argv) > 4 else 30


def uri(p, mime='image/jpeg'):
    return f'data:{mime};base64,' + base64.b64encode(open(p, 'rb').read()).decode()


CAPA, BIB, PALCO = (uri(os.path.join(imgs, f)) for f in ('capa.jpg', 'biblioteca.jpg', 'palco.jpg'))
css = open(os.path.join(AQUI, 'deck-base.css')).read()
js = open(os.path.join(AQUI, 'deck-base.js')).read()
e = html.escape

css += """
.chk{display:flex;flex-direction:column;gap:20px}
.chk .it{align-items:center}
.etapas{display:grid;grid-template-columns:repeat(3,1fr);gap:30px}
.et{background:#fff;border-radius:28px;padding:40px 40px 34px;display:flex;flex-direction:column;gap:14px;border-top:14px solid var(--cor)}
.et.vazia{background:transparent;border:4px dashed rgba(41,26,115,.35);border-top-width:14px}
.et h3{font-size:48px}
.et ol{list-style:none;display:flex;flex-direction:column;gap:8px;font-size:30px;line-height:1.25}
.et ol li b{color:var(--cor2);font-family:var(--fh);margin-right:10px}
.et .n{font-family:var(--fh);font-size:30px;font-weight:900;letter-spacing:3px;text-transform:uppercase;color:var(--cor2)}
.ads{display:grid;grid-template-columns:repeat(9,1fr);gap:18px}
.ad{cursor:pointer;display:flex;flex-direction:column;gap:12px}
.ad .im{aspect-ratio:9/16;border-radius:18px;background-size:cover;background-position:center;position:relative;box-shadow:0 18px 36px rgba(0,0,0,.35);transition:transform .2s}
.ad:hover .im{transform:translateY(-8px)}
.ad .im:after{content:"▶";position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:70px;height:70px;border-radius:50%;background:rgba(76,80,236,.92);color:#fff;font-size:30px;display:flex;align-items:center;justify-content:center;padding-left:6px}
.ad p{font-family:var(--fh);font-weight:900;font-size:21px;line-height:1.15;text-transform:uppercase}
.ad small{font-size:20px;opacity:.6}
#modal{position:fixed;inset:0;background:rgba(10,6,40,.88);display:none;align-items:center;justify-content:center;z-index:20}
#modal.on{display:flex}
#modal .cx{width:min(46vh,92vw);aspect-ratio:9/16;border-radius:22px;overflow:hidden;background:#000;position:relative}
#modal iframe{width:100%;height:100%;border:0}
#modal button{position:absolute;top:18px;right:22px;background:#fff;color:#291A73;border:0;border-radius:50%;width:54px;height:54px;font-size:30px;font-weight:900;cursor:pointer}
.funil{display:flex;align-items:stretch;gap:18px}
.fn{flex:1;background:var(--card);border-radius:26px;padding:38px 32px;display:flex;flex-direction:column;gap:14px;position:relative}
.fn:not(:last-child):after{content:"→";position:absolute;right:-22px;top:50%;transform:translateY(-50%);font-size:44px;font-weight:900;color:var(--cor);z-index:2}
.fn b{font-family:var(--fh);font-size:30px;color:var(--cor);letter-spacing:2px;text-transform:uppercase}
.fn h3{font-size:42px}.fn p{font-size:30px;opacity:.8;line-height:1.3}
.sim{display:grid;grid-template-columns:1fr 1fr;gap:70px;align-items:start}
.ctl{display:flex;flex-direction:column;gap:34px}
.ctl label{display:flex;flex-direction:column;gap:12px;font-size:32px;font-weight:600}
.ctl label span{display:flex;justify-content:space-between}
.ctl label span b{font-family:var(--fh);font-size:40px;color:var(--cor2)}
.ctl input[type=range]{width:100%;height:40px;accent-color:#4C50EC}
.dias{display:flex;gap:14px}
.dias button{flex:1;font-family:var(--fh);font-weight:900;font-size:32px;padding:16px;border-radius:16px;border:3px solid #4C50EC;background:#fff;color:#291A73;cursor:pointer}
.dias button.on{background:#4C50EC;color:#fff}
.res{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.rs{background:#fff;border-radius:24px;padding:34px 34px;display:flex;flex-direction:column;gap:8px;border-left:14px solid var(--cor)}
.rs.dest{background:var(--cor);color:#fff;border-left-color:#291A73}
.rs small{font-size:26px;font-weight:700;letter-spacing:2px;text-transform:uppercase;opacity:.7}
.rs b{font-family:var(--fh);font-size:70px;font-weight:900;line-height:1;letter-spacing:-2px}
.nota{font-size:26px;opacity:.6}
.lado{display:grid;grid-template-columns:1fr 560px;gap:70px;align-items:center}
.foto{height:760px;border-radius:30px;background-size:cover;background-position:center 20%;box-shadow:0 30px 60px rgba(0,0,0,.35)}
"""

S = []
marca = '<div class="marca">Anselmo Hudson × Grupo Euforia</div>'

# 1 capa
S.append(f'''<section class="s capa"><div class="tx"><p class="k">Mapa da Dignidade × Grupo Euforia</p><h1>Do anúncio<br>à <em>assinatura.</em></h1><div class="barra"></div><p class="data">Alinhamento · 26 de novembro de 2026</p></div><div class="ft" style="background-image:url({CAPA})"></div></section>''')

# 2 pauta
S.append(f'''<section class="s claro"><div class="cab"><p class="k">Os pontos que você trouxe no grupo</p><h2>Hoje respondemos <em>cada um</em>.</h2></div><div class="ag"><div><span>01</span><h3>Os slides das aulas</h3></div><div><span>02</span><h3>O Diagnóstico Inicial</h3></div><div><span>03</span><h3>O material da pasta Venda</h3></div><div><span>04</span><h3>Tráfego pago e investimento</h3></div></div>{marca}</section>''')

# 3 o que já está pronto
itens = [('A página com os 3 planos', '"Quero começar" agora leva aos planos, como você pediu.'),
         ('Os 3 vídeos do produto', 'Gravados em Nazaré, editados e já na página.'),
         ('Os slides das aulas', 'Recebidos e organizados por etapa.'),
         ('9 anúncios prontos', 'Feitos com os vídeos da pasta Venda.')]
lst = ''.join(f'<div class="it"><span class="ok">✓</span><div><h3>{e(a)}</h3><p>{e(b)}</p></div></div>' for a, b in itens)
S.append(f'''<section class="s"><div class="lado"><div class="chk"><p class="k">Desde a nossa última conversa</p><h2 style="font-size:76px">O que já está <em>pronto</em>.</h2><div class="lst">{lst}</div></div><div class="foto" style="background-image:url({BIB})"></div></div>{marca}</section>''')

# 4 slides das aulas
despertar = ['Precariedade: o que é e como sair dela', 'Teste da Precariedade', 'Resultado do teste: níveis', 'Entendendo a precariedade', 'Comunicação corporativa', 'Conexões profissionais', 'Mapa de habilidades']
desenvolver = ['O que aprendemos', 'Você é o negociador', 'Perfis de negociação', 'O seu perfil de negociação', 'Superando objeções']
ol = lambda xs, a: ''.join(f'<li><b>{a + i:02d}</b>{e(x)}</li>' for i, x in enumerate(xs))
S.append(f'''<section class="s claro"><div class="cab"><p class="k">01 · Os slides das aulas</p><h2>12 aulas recebidas. <em>Falta o Prosperar.</em></h2></div><div class="etapas"><div class="et"><p class="n">Etapa 1</p><h3>Despertar</h3><ol>{ol(despertar, 1)}</ol></div><div class="et"><p class="n">Etapa 2</p><h3>Desenvolver</h3><ol>{ol(desenvolver, 8)}</ol></div><div class="et vazia"><p class="n">Etapa 3</p><h3>Prosperar</h3><p class="t" style="font-size:32px">A pasta "3 - Prosperar" ainda está vazia. Assim que os slides chegarem, entram na plataforma e nos carrosséis.</p></div></div>{marca}</section>''')

# 5 onde os slides entram
S.append(f'''<section class="s"><div class="cab"><p class="k">01 · Onde os slides entram</p><h2>Um material, <em>três usos</em>.</h2></div><div class="c3"><div class="cd"><span class="nn">1</span><h3>Na plataforma</h3><p>Cada aula com o seu material de apoio.</p></div><div class="cd"><span class="nn">2</span><h3>Nas aulas editadas</h3><p>Câmera alternando com o slide, o formato que você aprovou.</p></div><div class="cd dest"><span class="nn" style="background:#fff;color:#291A73">3</span><h3>Nos carrosséis</h3><p>A base visual dos carrosséis do Instagram.</p></div></div>{marca}</section>''')

# 6 diagnóstico
S.append(f'''<section class="s claro"><div class="cab"><p class="k">02 · O Diagnóstico Inicial</p><h2>O diagnóstico passa a ficar <em>na nossa estrutura</em>.</h2></div><div class="c3"><div class="cd"><span class="nn">1</span><h3>A pessoa responde</h3><p>As perguntas do Teste da Precariedade, direto do celular.</p></div><div class="cd"><span class="nn">2</span><h3>Recebe o relatório</h3><p>O Relatório de Dignidade, com o objetivo e o plano de ação.</p></div><div class="cd dest"><span class="nn" style="background:#fff;color:#291A73">3</span><h3>Cai no plano certo</h3><p>O relatório indica o plano e leva para a página.</p></div></div><p class="t">Sem depender de uma conta de terceiros. Para montar, precisamos de você: as instruções do diagnóstico atual e as perguntas do teste.</p>{marca}</section>''')

# 7 anúncios
cards = ''.join(f'''<div class="ad" data-v="{a['drive']}"><div class="im" style="background-image:url({uri(a['thumb'])})"></div><p>{e(a['titulo'].upper())}</p><small>{int(round(a['dur']))} s</small></div>''' for a in anuncios)
S.append(f'''<section class="s nofwd"><div class="cab"><p class="k">03 · O material da pasta Venda</p><h2>9 vídeos viraram <em>9 anúncios</em>.</h2></div><div class="ads nofwd">{cards}</div><p class="t" style="font-size:32px">Toque em um anúncio para assistir. Todos terminam com o convite: comece pelo plano de R$ 30.</p>{marca}</section>''')

# 8 estratégia
S.append(f'''<section class="s"><div class="cab"><p class="k">04 · A estratégia de tráfego</p><h2>Começar barato, <em>subir com a confiança</em>.</h2></div><div class="funil"><div class="fn"><b>1</b><h3>Anúncio</h3><p>Os 9 vídeos no Instagram e no Facebook, para jovens adultos.</p></div><div class="fn"><b>2</b><h3>Página</h3><p>Os 3 vídeos do produto e os planos lado a lado.</p></div><div class="fn"><b>3</b><h3>R$ 30</h3><p>A degustação é a porta de entrada: decisão fácil.</p></div><div class="fn"><b>4</b><h3>Emergencial e Completo</h3><p>Quem gostou sobe de plano dentro da plataforma.</p></div></div><p class="t">Os anúncios ficam com a gente: subimos, acompanhamos todo dia e trazemos os números para você.</p>{marca}</section>''')

# 9 fases
S.append(f'''<section class="s claro"><div class="cab"><p class="k">04 · Como o investimento cresce</p><h2>Cada real <em>prova o próximo</em>.</h2></div><div class="tl" style="--n:3"><div class="pt"><i></i><b>Semana 1</b><h3>Teste</h3><p>Os 9 anúncios rodando com verba pequena e igual.</p></div><div class="pt"><i></i><b>Semana 2</b><h3>Corte</h3><p>Ficam os 3 que vendem mais barato. O resto sai.</p></div><div class="pt"><i></i><b>Semana 3 em diante</b><h3>Escala</h3><p>Mais verba nos vencedores e anúncio para quem visitou a página.</p></div></div><p class="t">Nossa equipe faz o corte e a escala. A verba só aumenta quando o número da semana anterior mostrar que vale.</p>{marca}</section>''')

# 10 simulador
S.append(f'''<section class="s claro nofwd" data-sim><div class="cab"><p class="k">04 · Simule o investimento</p><h2>Mexa e veja <em>o que acontece</em>.</h2></div><div class="sim nofwd"><div class="ctl"><label><span>Verba por dia <b id="vv">R$ {verba}</b></span><input type="range" id="verba" min="10" max="200" step="5" value="{verba}"></label><div><p style="font-size:32px;font-weight:600;margin-bottom:12px">Dias de campanha</p><div class="dias"><button data-d="7" class="on">7</button><button data-d="14">14</button><button data-d="30">30</button></div></div><label><span>Custo por clique (premissa) <b id="cv">R$ 1,00</b></span><input type="range" id="cpc" min="0.3" max="3" step="0.1" value="1"></label><label><span>De cada 100 visitas, compram <b id="tv">1</b></span><input type="range" id="taxa" min="0.5" max="5" step="0.5" value="1"></label></div><div class="res"><div class="rs"><small>Investimento</small><b id="r1">-</b></div><div class="rs"><small>Visitas na página</small><b id="r2">-</b></div><div class="rs"><small>Assinaturas de R$ 30</small><b id="r3">-</b></div><div class="rs dest"><small>Custo por assinatura</small><b id="r4">-</b></div><p class="nota" style="grid-column:1/3">Simulação para planejar, considerando só o plano de R$ 30. O custo por clique e a taxa de compra reais saem da semana 1 de teste.</p></div></div>{marca}</section>''')

# 11 checkout
S.append(f'''<section class="s"><div class="lado"><div class="cab"><p class="k">Checkout na Hubla</p><h2 style="font-size:76px">Cada plano com <em>o seu link</em>.</h2><p class="sub" style="font-size:40px">Você apontou: no Emergencial, a Hubla mostra o valor mensal e confunde quem compra.</p><p class="sub" style="font-size:40px">A equipe está montando uma oferta separada para cada plano (30 dias, trimestral e anual). Cada botão da página leva direto para a sua.</p></div><div class="foto" style="background-image:url({PALCO})"></div></div>{marca}</section>''')

# 12 cronograma
S.append(f'''<section class="s claro"><div class="cab"><p class="k">Até as festas</p><h2>O <em>bloco na rua</em>.</h2></div><div class="tl"><div class="pt"><i></i><b>Esta semana</b><h3>Aprovar</h3><p>Os 9 anúncios, a estratégia e a verba de teste.</p></div><div class="pt"><i></i><b>Semana 2</b><h3>Anúncios no ar</h3><p>Checkout ajustado e semana de teste rodando.</p></div><div class="pt"><i></i><b>Semana 3</b><h3>Escala</h3><p>Verba nos vencedores e o diagnóstico na página.</p></div><div class="pt"><i></i><b>Toda semana</b><h3>Reunião de 30 min</h3><p>Números da semana e próximos passos.</p></div></div><p class="t">As datas de cada semana fecham hoje com você e vão para o grupo.</p>{marca}</section>''')

# 13 próximos passos
S.append(f'''<section class="s"><div class="cab"><p class="k">Próximos passos</p><h2>Saindo daqui</h2></div><div class="c3"><div class="cd dest"><p class="r">Hoje</p><h3>Aprovar</h3><p>Os 9 anúncios e a verba do teste.</p></div><div class="cd"><p class="r">Com você</p><h3>Enviar</h3><p>Os slides do Prosperar e as instruções do diagnóstico.</p></div><div class="cd"><p class="r">Com a equipe</p><h3>Ligar</h3><p>Checkout por plano e os anúncios no ar, gerenciados por nós, com aviso no grupo.</p></div></div>{marca}</section>''')

# 14 feedback
S.append('''<section class="s cor centro"><p class="k">Sua opinião</p><h2 class="g">O que você está achando do Grupo Euforia até agora?</h2><p class="sub">Queremos ouvir com sinceridade.</p></section>''')

# 15 obrigado
S.append(f'''<section class="s capa"><div class="tx"><p class="k">Grupo Euforia</p><h1>Obrigado,<br><em>Hudson!</em></h1><div class="barra"></div><p class="sub">O resumo e as datas de hoje vão para o grupo.</p></div><div class="ft" style="background-image:url({CAPA})"></div></section>''')

js += r"""
const M=document.getElementById('modal'),F=M.querySelector('iframe');
document.querySelectorAll('.ad').forEach(a=>a.addEventListener('click',ev=>{ev.stopPropagation();F.src='https://drive.google.com/file/d/'+a.dataset.v+'/preview';M.classList.add('on')}));
M.querySelector('button').onclick=ev=>{ev.stopPropagation();M.classList.remove('on');F.src=''};
M.addEventListener('click',ev=>{if(ev.target===M){M.classList.remove('on');F.src=''}});
(function(){const q=id=>document.getElementById(id);let dias=7;
const brl=v=>'R$ '+v.toLocaleString('pt-BR',{minimumFractionDigits:v<100?2:0,maximumFractionDigits:v<100?2:0});
function calc(){const v=+q('verba').value,c=+q('cpc').value,t=+q('taxa').value;
q('vv').textContent='R$ '+v;q('cv').textContent='R$ '+c.toFixed(2).replace('.',',');q('tv').textContent=String(t).replace('.',',');
const inv=v*dias,vis=Math.round(inv/c),ass=Math.floor(vis*t/100);
q('r1').textContent=brl(inv);q('r2').textContent=vis.toLocaleString('pt-BR');q('r3').textContent=ass.toLocaleString('pt-BR');q('r4').textContent=ass?brl(inv/ass):'-'}
['verba','cpc','taxa'].forEach(id=>{q(id).addEventListener('input',calc);q(id).addEventListener('click',e=>e.stopPropagation())});
document.querySelectorAll('.dias button').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();dias=+b.dataset.d;document.querySelectorAll('.dias button').forEach(x=>x.classList.toggle('on',x===b));calc()}));
calc()})();
"""

page = f'''<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>Anselmo Hudson · Alinhamento · 26/11</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lato:wght@700;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>{css}</style></head>
<body><div id="palco">{''.join(S)}</div><div id="bar"></div>
<div id="nav"><button id="prev" aria-label="Anterior">‹</button><button id="next" aria-label="Próximo">›</button><button id="fs" aria-label="Tela cheia">⛶</button></div>
<div id="modal"><div class="cx"><iframe allow="autoplay; fullscreen" allowfullscreen></iframe><button aria-label="Fechar">×</button></div></div>
<script>{js}</script></body></html>'''
open(saida, 'w').write(page)
print(saida, len(page) // 1024, 'KB,', len(S), 'slides')
