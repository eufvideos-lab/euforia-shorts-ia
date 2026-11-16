#!/usr/bin/env python3
"""Editor Euforia, etapa 2: renderiza o que a pessoa exportou do editor e guarda os ajustes.
Uso: python3 pipeline/renderizar_editado.py EXPORTADO.json PASTA_DO_PEDIDO SAIDA.mp4
- EXPORTADO.json: arquivo do botão "Aprovar como está" ou "Exportar com ajustes" do editor.
- Os arquivos de mídia já estão em remotion/public (são os mesmos que a máquina usou).
- Os ajustes vão para PASTA/ajustes.jsonl (um por linha): é o material para a máquina aprender
  (próximo passo: gravar também na tabela do n8n e usar nos prompts de escolha de trechos)."""
import json, os, subprocess, sys

exp_arq, pasta, saida = sys.argv[1], os.path.abspath(sys.argv[2]), os.path.abspath(sys.argv[3])
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTION = os.path.join(RAIZ, 'remotion')
exp = json.load(open(exp_arq))

props_arq = os.path.join(pasta, f"props_editado_{exp['projeto']}.json")
json.dump(exp['props'], open(props_arq, 'w'), ensure_ascii=False)

with open(os.path.join(pasta, 'ajustes.jsonl'), 'a') as f:
    f.write(json.dumps({k: exp.get(k) for k in ('projeto', 'cliente', 'titulo', 'modo', 'editado_por', 'editado_em', 'ajustes')},
                       ensure_ascii=False) + '\n')
print(f"{exp['modo']}: {len(exp.get('ajustes') or [])} ajustes de {exp.get('editado_por')}")
for a in exp.get('ajustes') or []:
    print('  -', a['texto'])

env = dict(os.environ)
if not env.get('CHROME'):
    import glob
    achados = glob.glob('/opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell') + \
        glob.glob('/opt/pw-browsers/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell')  # igual ao produzir.py
    if achados:
        env['CHROME'] = achados[0]
r = subprocess.run(['node', 'render.mjs', props_arq, saida, exp.get('composicao') or 'ShortViral'], cwd=REMOTION, env=env)
sys.exit(r.returncode)
