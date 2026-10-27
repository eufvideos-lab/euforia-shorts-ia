#!/usr/bin/env python3
"""Apresentação de call: transforma um JSON de conteúdo em slides HTML num arquivo único, sempre no mesmo padrão.

Uso: python3 escritorio/apresentacao/gerar.py conteudo.json saida.html [--prints pasta]

A máquina só escreve o conteúdo (formato em escritorio/apresentacao/LEIAME.md e exemplo-rodrigo.json).
O visual é fixo: tela 1920x1080 que se ajusta à janela, fontes grandes, um assunto por slide, cores do cliente.
--prints salva um PNG de cada slide (para conferir e mandar de prévia).
"""
import base64, html, io, json, os, re, sys

LIMITES = {'titulo': 70, 'card': 170, 'item': 60, 'sub': 140}


def esc(t):
    return html.escape(str(t or ''))


def imagem(caminho, base):
    """Embute a imagem como data URI (reduzida a 1600 px; JPEG, ou PNG se tiver fundo transparente) para o HTML seguir pequeno."""
    p = caminho if os.path.isabs(caminho) else os.path.join(base, caminho)
    try:
        from PIL import Image
        im = Image.open(p)
        im.thumbnail((1600, 1600))
        buf = io.BytesIO()
        if im.mode in ('RGBA', 'LA', 'P') and 'A' in im.convert('RGBA').getbands():
            im.convert('RGBA').save(buf, 'PNG', optimize=True)  # recorte sem fundo continua transparente
            tipo = 'png'
        else:
            im.convert('RGB').save(buf, 'JPEG', quality=82)
            tipo = 'jpeg'
        dados = buf.getvalue()
    except ImportError:
        dados, tipo = open(p, 'rb').read(), 'png' if p.lower().endswith('.png') else 'jpeg'
    return f'data:image/{tipo};base64,' + base64.b64encode(dados).decode()


def checar(d):
    """Placeholder à mostra e texto comprido demais travam a geração: isso é o que deixava o slide feio."""
    erros = []

    def ver(texto, onde, limite):
        if texto is None:
            return
        t = str(texto)
        if re.search(r'\[|a confirmar|xx/|\?\?', t, re.I):
            erros.append(f'{onde}: placeholder à mostra ("{t[:50]}"). Tire do slide e ponha nas notas.')
        if limite and len(t) > limite:
            erros.append(f'{onde}: {len(t)} caracteres (máx. {limite}). Corte ou divida o slide.')

    for i, s in enumerate(d['slides'], 1):
        tipo = s.get('tipo')
        ver(s.get('titulo'), f'slide {i} título', LIMITES['titulo'])
        ver(s.get('kicker'), f'slide {i} kicker', 60)
        ver(s.get('sub'), f'slide {i} sub', LIMITES['sub'])
        ver(s.get('rodape'), f'slide {i} rodapé', LIMITES['sub'])
        for c in s.get('cards', []):
            ver(c.get('rotulo'), f'slide {i} card', 30)
            ver(c.get('titulo'), f'slide {i} card', 40)
            ver(c.get('texto'), f'slide {i} card', LIMITES['card'])
        for it in s.get('itens', []):
            ver(it if isinstance(it, str) else it.get('titulo'), f'slide {i} item', LIMITES['item'])
        if tipo in ('cards', 'etapas') and len(s.get('cards', [])) > 3:
            erros.append(f'slide {i}: no máximo 3 cards.')
        if tipo in ('lista', 'agenda') and len(s.get('itens', [])) > 5:
            erros.append(f'slide {i}: no máximo 5 itens.')
    tipos = [s.get('tipo') for s in d['slides']]
    if 'feedback' not in tipos:
        erros.append('falta o slide de feedback (tipo "feedback").')
    if tipos[-1:] != ['obrigado']:
        erros.append('o último slide tem que ser o agradecimento (tipo "obrigado").')
    if len(d['slides']) > 18:
        erros.append('mais de 18 slides: corte.')
    return erros


def cabeca(s, cores):
    k = f'<p class="kicker">{esc(s.get("kicker"))}</p>' if s.get('kicker') else ''
    return f'<div class="cab">{k}<h2>{esc(s.get("titulo"))}</h2></div>'


def slide(s, d, n, base):
    c = d['cores']
    tipo = s['tipo']
    nota = esc(s.get('notas', ''))
    rod = f'<p class="rodape">{esc(s["rodape"])}</p>' if s.get('rodape') else ''
    if tipo == 'capa':
        dest = f'<br><span class="ouro">{esc(s["titulo_destaque"])}</span>' if s.get('titulo_destaque') else ''
        foto = ''
        if s.get('foto'):
            foto = f'<img class="capa-foto" src="{imagem(s["foto"], base)}" alt="">'
        corpo = (f'<div class="aro a1"></div><div class="aro a2"></div>{foto}'
                 f'<p class="kicker clara">{esc(s.get("kicker"))}</p>'
                 f'<div class="meio"><h1>{esc(s["titulo"])}{dest}</h1><p class="sub">{esc(s.get("sub"))}</p></div>'
                 f'<p class="data">{esc(d.get("data"))}</p>')
        return 'escuro grad capa', corpo, nota
    if tipo == 'divisor':
        cit = f'<p class="cit">“{esc(s["citacao"])}”</p>' if s.get('citacao') else ''
        fon = f'<p class="fonte">{esc(s["fonte"])}</p>' if s.get('fonte') else ''
        sub = f'<p class="sub">{esc(s["sub"])}</p>' if s.get('sub') else ''
        corpo = (f'<div class="aro a3"></div><p class="num">{esc(s.get("numero"))}</p>'
                 f'<h2 class="grande">{esc(s["titulo"])}</h2>{sub}{cit}{fon}')
        return 'escuro centro', corpo, nota
    if tipo == 'agenda':
        cs = ''.join(f'<div class="ag" style="border-top-color:{d["_tons"][j % len(d["_tons"])]}">'
                     f'<p class="agn">{j + 1:02d}</p><h3>{esc(it if isinstance(it, str) else it["titulo"])}</h3></div>'
                     for j, it in enumerate(s['itens']))
        return 'claro', cabeca(s, c) + f'<div class="linha n{len(s["itens"])}">{cs}</div>' + rod, nota
    if tipo in ('cards', 'etapas'):
        cs = ''
        for j, card in enumerate(s['cards']):
            fundo = d['_fundos'][j % len(d['_fundos'])]
            cor_r = d['_rotulos'][j % len(d['_rotulos'])]
            t = f'<h3>{esc(card["titulo"])}</h3>' if card.get('titulo') else ''
            cs += (f'<div class="card" style="background:{fundo}"><p class="rot" style="color:{cor_r}">'
                   f'{esc(card.get("rotulo"))}</p>{t}<p class="txt">{esc(card.get("texto"))}</p></div>')
        return 'claro', cabeca(s, c) + f'<div class="linha n{len(s["cards"])}">{cs}</div>' + rod, nota
    if tipo == 'lista':
        its = ''.join(f'<div class="it"><span class="bola">{j + 1}</span><p>{esc(it)}</p></div>'
                      for j, it in enumerate(s['itens']))
        return 'claro', cabeca(s, c) + f'<div class="lista">{its}</div>' + rod, nota
    if tipo == 'frase':
        corpo = (f'<div class="aro a3"></div><p class="kicker clara">{esc(s.get("kicker"))}</p>'
                 f'<h2 class="grande">{esc(s["titulo"])}</h2><p class="sub">{esc(s.get("sub"))}</p>')
        return 'escuro centro', corpo, nota
    if tipo == 'imagens':
        ims = ''.join(f'<img src="{imagem(p, base)}" alt="">' for p in s['imagens'])
        return 'claro', cabeca(s, c) + f'<div class="galeria g{len(s["imagens"])}">{ims}</div>' + rod, nota
    if tipo == 'feedback':
        corpo = ('<div class="aro a1"></div><p class="kicker clara">Sua opinião</p>'
                 '<h2 class="grande">O que vocês estão achando do <span class="ouro">Grupo Euforia</span> até agora?</h2>'
                 f'<p class="sub">{esc(s.get("sub") or "Queremos ouvir com sinceridade.")}</p>')
        return 'escuro grad centro', corpo, nota or 'Pausa. Deixar o cliente falar e anotar o feedback no card.'
    if tipo == 'obrigado':
        corpo = (f'<div class="aro a1"></div><h2 class="grande">{esc(s.get("titulo") or "Obrigado!")}</h2>'
                 f'<p class="sub">{esc(s.get("sub"))}</p><p class="kicker clara">Grupo Euforia</p>')
        return 'escuro grad centro', corpo, nota
    raise SystemExit(f'tipo de slide desconhecido: {tipo}')


CSS = """
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:#0e0d14;overflow:hidden}
body{font-family:'Inter',Arial,sans-serif}
#palco{position:absolute;left:50%;top:50%;width:1920px;height:1080px;transform-origin:center}
.s{position:absolute;inset:0;display:none;flex-direction:column;gap:56px;padding:128px;overflow:hidden}
.s.on{display:flex}
.claro{background:var(--claro);color:var(--texto)}
.escuro{background:var(--escuro);color:var(--claro)}
.grad{background:linear-gradient(125deg,var(--escuro) 0%,var(--medio) 60%,var(--forte) 100%)}
.centro{justify-content:center;gap:36px}
.capa{justify-content:space-between}
h1,h2,.num{font-family:var(--serif);font-weight:600}
h1{font-size:136px;line-height:1.02;letter-spacing:-2px;max-width:1000px}
h2{font-size:72px;line-height:1.1;max-width:1600px}
h2.grande{font-size:104px;line-height:1.05;max-width:1450px}
h3{font-size:38px;font-weight:700;line-height:1.2}
.kicker{font-size:28px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:var(--forte)}
.kicker.clara{color:var(--acento2)}
.cab{display:flex;flex-direction:column;gap:16px}
.sub{font-size:40px;line-height:1.4;color:var(--suave-txt);max-width:1250px}
.claro .sub{color:var(--texto-2)}
.data{font-size:28px;color:var(--suave-txt)}
.ouro{color:var(--destaque)}
.num{font-size:170px;line-height:1;color:var(--destaque)}
.cit{font-size:38px;line-height:1.4;color:var(--suave-txt);max-width:1250px;font-style:italic}
.fonte{font-size:26px;color:var(--acento2)}
.aro{position:absolute;border-radius:50%;border:2px solid var(--acento);opacity:.22;pointer-events:none}
.a1{left:1180px;top:-260px;width:1100px;height:1100px}
.a2{left:1380px;top:-60px;width:700px;height:700px;border-color:var(--destaque);opacity:.3}
.a3{left:1300px;top:120px;width:840px;height:840px;border-color:var(--destaque);opacity:.25}
.capa-foto{position:absolute;right:60px;bottom:0;height:920px;max-width:820px;object-fit:contain;object-position:bottom}
.capa .sub{max-width:900px}
.capa .meio{display:flex;flex-direction:column;gap:32px;position:relative}
.linha{display:grid;gap:32px;flex:1;align-content:center}
.n1{grid-template-columns:1fr}.n2{grid-template-columns:repeat(2,1fr)}.n3{grid-template-columns:repeat(3,1fr)}
.n4{grid-template-columns:repeat(4,1fr)}.n5{grid-template-columns:repeat(5,1fr)}
.card{display:flex;flex-direction:column;gap:24px;padding:56px 52px;border-radius:28px;color:var(--claro);min-height:420px}
.rot{font-size:26px;font-weight:700;letter-spacing:3px;text-transform:uppercase}
.card .txt{font-size:38px;line-height:1.4;color:var(--suave-txt)}
.card h3{font-size:44px}
.ag{display:flex;flex-direction:column;gap:24px;padding:48px 40px;background:var(--cartao);border-radius:24px;border-top:10px solid;min-height:380px}
.ag h3{font-size:44px}
.agn{font-family:var(--serif);font-size:96px;font-weight:600;color:var(--forte);line-height:1}
.lista{display:flex;flex-direction:column;gap:28px;flex:1;justify-content:center}
.it{display:flex;gap:36px;align-items:center;padding:36px 48px;background:var(--cartao);border-radius:24px}
.it p{font-size:48px;font-weight:600;line-height:1.25}
.bola{flex:none;width:76px;height:76px;border-radius:50%;background:var(--forte);color:var(--claro);display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:700}
.rodape{font-size:36px;color:var(--texto-2)}
.galeria{display:grid;gap:24px;flex:1;min-height:0}
.galeria img{width:100%;height:100%;object-fit:contain;border-radius:16px;min-height:0}
.g1{grid-template-columns:1fr}.g2{grid-template-columns:repeat(2,1fr)}.g3{grid-template-columns:repeat(3,1fr)}
.g4{grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(2,1fr)}
#pag{position:fixed;right:24px;bottom:16px;font:600 14px Inter,Arial;color:#9a97ab}
#notas{display:none;position:fixed;left:0;right:0;bottom:0;max-height:40vh;overflow:auto;background:#fffdf8;color:#1d1b26;
 padding:18px 28px;font:18px/1.5 Inter,Arial;border-top:4px solid var(--destaque)}
#notas.on{display:block}
"""

JS = """
var ss=document.querySelectorAll('.s'),i=0,nt=document.getElementById('notas'),pg=document.getElementById('pag'),pl=document.getElementById('palco');
function ajusta(){var k=Math.min(innerWidth/1920,innerHeight/1080);pl.style.transform='translate(-50%,-50%) scale('+k+')'}
function vai(d){i=Math.max(0,Math.min(ss.length-1,i+d));ss.forEach(function(e,j){e.classList.toggle('on',j==i)});
 nt.textContent=ss[i].dataset.notas||'(sem notas)';pg.textContent=(i+1)+' / '+ss.length;history.replaceState(null,'','#'+(i+1))}
addEventListener('resize',ajusta);
addEventListener('keydown',function(e){if(['ArrowRight','PageDown',' '].indexOf(e.key)>=0)vai(1);
 if(['ArrowLeft','PageUp'].indexOf(e.key)>=0)vai(-1);if(e.key=='n'||e.key=='N')nt.classList.toggle('on');
 if(e.key=='f'||e.key=='F'){document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()}});
pl.addEventListener('click',function(e){vai(e.clientX<innerWidth/4?-1:1)});
ajusta();i=Math.max(0,(parseInt(location.hash.slice(1))||1)-1);vai(0);
"""


def montar(d, base):
    c = d['cores']
    c.setdefault('medio', c['escuro'])
    c.setdefault('forte', c['medio'])
    c.setdefault('acento', c['destaque'])
    c.setdefault('acento2', c['acento'])
    c.setdefault('claro', '#FFFCFA')
    c.setdefault('texto', c['escuro'])
    c.setdefault('cartao', '#F3EFF8')
    d['_tons'] = [c['forte'], c['destaque'], c['acento'], c['acento2']]
    d['_fundos'] = [c['escuro'], c['medio'], c['forte']]
    d['_rotulos'] = [c['destaque'], c['acento'], c['acento2']]  # legíveis nos cards escuros
    serif = d.get('fonte_titulo', 'Fraunces')
    texto = d.get('fonte_texto', 'Inter')
    fam = lambda f: f.replace(' ', '+')
    fontes = (f'https://fonts.googleapis.com/css2?family={fam(serif)}:wght@400;600;700'
              f'&family={fam(texto)}:wght@400;600;700&display=swap')
    vars_ = (f':root{{--escuro:{c["escuro"]};--medio:{c["medio"]};--forte:{c["forte"]};--destaque:{c["destaque"]};'
             f'--acento:{c["acento"]};--acento2:{c["acento2"]};--claro:{c["claro"]};--texto:{c["texto"]};'
             f'--cartao:{c["cartao"]};--suave-txt:{c.get("suave_txt", "#E6E2F0")};--texto-2:{c.get("texto_2", "#4A4560")};'
             f"--serif:'{serif}',Georgia,serif}}body{{font-family:'{texto}',Arial,sans-serif}}")
    secoes = ''
    for n, s in enumerate(d['slides'], 1):
        classe, corpo, nota = slide(s, d, n, base)
        secoes += f'<section class="s {classe}" data-notas="{nota}">{corpo}</section>\n'
    return (f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
            f'<meta name="robots" content="noindex, nofollow">'
            f'<meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{esc(d["titulo"])}</title><link rel="preconnect" href="https://fonts.gstatic.com">'
            f'<link href="{fontes}" rel="stylesheet"><style>{CSS}{vars_}</style></head><body>'
            f'<div id="palco">{secoes}</div><div id="pag"></div><div id="notas"></div><script>{JS}</script></body></html>')


def prints(saida, pasta, n):
    import subprocess
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'prints.mjs')
    amb = dict(os.environ)
    raiz = subprocess.run(['npm', 'root', '-g'], capture_output=True, text=True).stdout.strip()
    amb['NODE_PATH'] = os.pathsep.join(x for x in (amb.get('NODE_PATH'), raiz) if x)
    subprocess.run(['node', script, saida, pasta, str(n)], check=True, env=amb)


if __name__ == '__main__':
    entrada, saida = sys.argv[1], sys.argv[2]
    d = json.load(open(entrada))
    erros = checar(d)
    if erros:
        print('NÃO GERADO. Corrija o conteúdo:\n- ' + '\n- '.join(erros))
        sys.exit(1)
    pagina = montar(d, os.path.dirname(os.path.abspath(entrada)))
    open(saida, 'w').write(pagina)
    print(f'ok: {saida} ({len(pagina) // 1024} KB, {len(d["slides"])} slides)')
    if '--prints' in sys.argv:
        prints(saida, sys.argv[sys.argv.index('--prints') + 1], len(d['slides']))
