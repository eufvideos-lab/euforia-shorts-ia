"""Gera o PDF da "Situação completa do cliente" ou do "Cronograma do cliente".

Uso:  python3 escritorio/diagnostico/gerar.py dados.json saida.pdf
O JSON segue o formato descrito em DIAGNOSTICO.md (exemplos em exemplo/). A máquina só preenche os dados;
o visual é sempre este, para todo cliente sair igual.
"""
import html
import json
import os
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))

STATUS = {
    "ok": ("Feito", "ok"),
    "andamento": ("Em andamento", "and"),
    "atencao": ("Atenção", "ate"),
    "atrasado": ("Atrasado", "atr"),
    "cliente": ("Aguardando cliente", "cli"),
    "nao_iniciado": ("Não começou", "nao"),
    "decidir": ("Direção decide", "dir"),
}
SEMAFORO = {"verde": ("No trilho", "ok"), "amarelo": ("Precisa de ação", "ate"), "vermelho": ("Em risco", "atr")}
PRIORIDADE = {"alta": ("Alta", "atr"), "media": ("Média", "ate"), "baixa": ("Baixa", "nao")}


def e(t):
    return html.escape(str(t if t is not None else ""))


def pill(chave, tabela=STATUS):
    rot, cls = tabela.get(chave, (chave, "nao"))
    return f'<span class="pill {cls}">{e(rot)}</span>'


def lista(itens):
    return "<ul>" + "".join(f"<li>{e(i)}</li>" for i in itens) + "</ul>" if itens else ""


def tabela(cab, linhas, larguras=None, cls=""):
    col = "".join(f'<col style="width:{w}">' for w in larguras) if larguras else ""
    th = "".join(f"<th>{e(c)}</th>" for c in cab)
    tr = "".join(
        f'<tr><td colspan="{len(cab)}">{l}</td></tr>' if isinstance(l, str)
        else "<tr>" + "".join(f"<td>{c}</td>" for c in l) + "</tr>"
        for l in linhas)
    return f'<table class="{cls}"><colgroup>{col}</colgroup><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table>'


def secao(num, titulo, corpo, sub=""):
    s = f'<p class="sub">{e(sub)}</p>' if sub else ""
    return f'<section><div class="cab"><h2><span class="n">{num}</span>{e(titulo)}</h2>{s}</div>{corpo}</section>'


def capa(d, titulo_doc):
    kpis = "".join(
        f'<div class="kpi"><div class="v">{e(k["valor"])}</div><div class="r">{e(k["rotulo"])}</div></div>'
        for k in d.get("numeros", [])
    )
    sem = d.get("semaforo")
    sem_html = ""
    if sem:
        rot, cls = SEMAFORO[sem]
        sem_html = f'<div class="sem {cls}"><b>{e(rot)}</b><span>{e(d.get("frase", ""))}</span></div>'
    return f"""
<header class="capa">
  <div class="topo"><span class="marca">GRUPO EUFORIA · ESCRITÓRIO</span><span>Uso interno · não enviar ao cliente</span></div>
  <div class="tipo">{e(titulo_doc)}</div>
  <h1>{e(d["cliente"])}</h1>
  <div class="meta">{e(d.get("plano", ""))}<br>Gerado em {e(d["gerado_em"])} · pedido por {e(d.get("pedido_por", "—"))}</div>
  {sem_html}
  <div class="kpis">{kpis}</div>
</header>"""


def fontes(d):
    linhas = [[e(f["fonte"]), e(f["o_que"])] for f in d.get("fontes", [])]
    return tabela(["Fonte", "O que foi lido"], linhas, ["30%", "70%"], "leve")


# ---------------------------------------------------------------- Situação completa
def situacao(d):
    partes = [capa(d, "Situação completa do cliente")]
    n = 1
    if d.get("leitura"):
        partes.append(secao(n, "Leitura do escritório", "".join(f"<p>{e(p)}</p>" for p in d["leitura"])))
        n += 1
    if d.get("alertas"):
        corpo = "".join(
            f'<div class="alerta {a.get("nivel","ate")}"><b>{e(a["titulo"])}</b><span>{e(a["texto"])}</span></div>'
            for a in d["alertas"]
        )
        partes.append(secao(n, "O que pede atenção agora", corpo))
        n += 1
    if d.get("contrato"):
        linhas = [
            [f'<b>{e(c["item"])}</b>', e(c["contratado"]), e(c["feito"]), pill(c["status"]), e(c.get("obs", ""))]
            for c in d["contrato"]
        ]
        partes.append(secao(n, "Contrato x entregue", tabela(
            ["Item", "Contratado", "Feito até agora", "Situação", "Observação"], linhas,
            ["19%", "15%", "17%", "14%", "35%"]), d.get("contrato_sub", "")))
        n += 1
    if d.get("promessas"):
        linhas = [
            [e(p["quando"]), e(p["onde"]), f'<b>{e(p["quem"])}</b>', e(p["o_que"]), pill(p["status"])]
            for p in d["promessas"]
        ]
        partes.append(secao(n, "O que foi combinado nas calls e no grupo", tabela(
            ["Quando", "Onde", "Quem", "O que ficou combinado", "Situação"], linhas,
            ["10%", "14%", "11%", "51%", "14%"])))
        n += 1
    if d.get("cliente_deve"):
        linhas = [[f'<b>{e(c["item"])}</b>', e(c["pedido_em"]), e(c.get("obs", "")), pill(c["status"])] for c in d["cliente_deve"]]
        partes.append(secao(n, "O que falta do cliente", tabela(
            ["Item", "Pedido em", "Observação", "Situação"], linhas, ["28%", "16%", "42%", "14%"])))
        n += 1
    if d.get("divergencias"):
        linhas = [[f'<b>{e(x["tema"])}</b>', e(x["venda"]), e(x["contrato"]), e(x["fazer"])] for x in d["divergencias"]]
        partes.append(secao(n, "Diferenças entre venda, contrato e calls", tabela(
            ["Tema", "O que foi dito", "O que diz o contrato", "Como seguir"], linhas, ["16%", "28%", "24%", "32%"])))
        n += 1
    if d.get("casa"):
        linhas = [[e(c["onde"]), e(c["problema"]), e(c["fazer"])] for c in d["casa"]]
        partes.append(secao(n, "Notion e Drive desatualizados", tabela(
            ["Onde", "O que está errado", "Correção"], linhas, ["20%", "42%", "38%"])))
        n += 1
    if d.get("demandas"):
        grupos = {}
        for x in d["demandas"]:
            grupos.setdefault(x["quem"], []).append(x)
        corpo = ""
        for quem, itens in grupos.items():
            linhas = [
                [f'<b>{e(x["n"])}</b>', f'<b>{e(x["o_que"])}</b><div class="como">{e(x.get("como", ""))}</div>',
                 e(x["prazo"]), pill(x["prioridade"], PRIORIDADE)]
                for x in itens
            ]
            corpo += f'<h3>{e(quem)}</h3>' + tabela(["#", "Demanda e como fazer", "Prazo", "Prioridade"], linhas,
                                                    ["5%", "65%", "16%", "14%"], "dem")
        partes.append(secao(n, "Demandas: o que fazer, quem faz e quando", corpo, d.get("demandas_sub", "")))
        n += 1
    if d.get("semana"):
        linhas = [[f'<b>{e(s["dia"])}</b>', e(s["o_que"]), e(s["quem"])] for s in d["semana"]]
        partes.append(secao(n, "Próximos 7 dias, dia a dia", tabela(["Dia", "O que acontece", "Quem"], linhas,
                                                                    ["18%", "62%", "20%"])))
        n += 1
    if d.get("riscos"):
        linhas = [[f'<b>{e(r["risco"])}</b>', e(r["sinal"]), e(r["evitar"])] for r in d["riscos"]]
        partes.append(secao(n, "Riscos e como evitar", tabela(["Risco", "Sinal que já aparece", "Como evitar"], linhas,
                                                              ["24%", "36%", "40%"])))
        n += 1
    partes.append(secao(n, "De onde saiu cada informação", fontes(d), d.get("fontes_sub", "")))
    return partes


# ---------------------------------------------------------------- Cronograma
def cronograma(d):
    partes = [capa(d, "Cronograma do cliente")]
    n = 1
    if d.get("premissas"):
        partes.append(secao(n, "Como este cronograma foi montado", lista(d["premissas"])))
        n += 1
    if d.get("contagem"):
        linhas = [
            [f'<b>{e(c["item"])}</b>', e(c["contratado"]), e(c["feito"]), e(c["planejado"]), e(c["sobra"]),
             pill(c["status"])]
            for c in d["contagem"]
        ]
        partes.append(secao(n, "A conta fecha?", tabela(
            ["Item", "Contratado", "Feito", "Neste cronograma", "Folga", "Situação"], linhas,
            ["24%", "13%", "11%", "18%", "18%", "16%"]), d.get("contagem_sub", "")))
        n += 1
    if d.get("marcos"):
        linhas = [[f'<b>{e(m["data"])}</b>', e(m["o_que"]), e(m["quem"]), pill(m.get("status", "nao_iniciado"))]
                  for m in d["marcos"]]
        partes.append(secao(n, "Marcos do projeto", tabela(["Data", "Marco", "Quem", "Situação"], linhas,
                                                           ["14%", "54%", "18%", "14%"])))
        n += 1
    if d.get("rotina"):
        linhas = [[f'<b>{e(r["quando"])}</b>', e(r["o_que"]), e(r["quem"])] for r in d["rotina"]]
        partes.append(secao(n, "Rotina de cada semana", tabela(["Quando", "O que", "Quem"], linhas, ["20%", "60%", "20%"]),
                            d.get("rotina_sub", "")))
        n += 1
    if d.get("semanas"):
        linhas = []
        mes = None
        for s in d["semanas"]:
            if s.get("mes") and s["mes"] != mes:
                mes = s["mes"]
                linhas.append(f'<span class="mes">{e(mes)}</span>')
            linhas.append([f'<b>{e(s["semana"])}</b>', e(s.get("gravar", "")), e(s.get("longo", "")),
                           e(s.get("shorts", "")), e(s.get("carrossel", "")), e(s.get("obs", ""))])
        partes.append(secao(n, "Semana a semana", tabela(
            ["Semana", "Gravar (cliente)", "Vídeo longo", "Shorts", "Carrossel", "Observação"], linhas,
            ["13%", "13%", "26%", "13%", "9%", "26%"], "semanas"), d.get("semanas_sub", "")))
        n += 1
    if d.get("alertas"):
        corpo = "".join(
            f'<div class="alerta {a.get("nivel","ate")}"><b>{e(a["titulo"])}</b><span>{e(a["texto"])}</span></div>'
            for a in d["alertas"]
        )
        partes.append(secao(n, "Cuidados com este cronograma", corpo))
        n += 1
    partes.append(secao(n, "De onde saiu cada informação", fontes(d)))
    return partes


CSS = open(os.path.join(AQUI, "estilo.css"), encoding="utf-8").read()


def main(entrada, saida):
    d = json.load(open(entrada, encoding="utf-8"))
    partes = situacao(d) if d["tipo"] == "situacao" else cronograma(d)
    rodape = f'{d["cliente"]} · {"Situação completa" if d["tipo"] == "situacao" else "Cronograma"} · gerado em {d["gerado_em"]} · uso interno'
    doc = f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>{CSS}</style></head><body data-rodape="{e(rodape)}">{''.join(partes)}</body></html>"""
    html_path = os.path.splitext(saida)[0] + ".html"
    open(html_path, "w", encoding="utf-8").write(doc)
    subprocess.run(["node", os.path.join(AQUI, "pdf.mjs"), html_path, saida], check=True)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
