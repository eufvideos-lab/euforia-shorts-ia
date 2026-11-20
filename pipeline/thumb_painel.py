#!/usr/bin/env python3
"""Põe o link da thumb/capas editáveis no Canva no pacote do Painel da Equipe (gaveta do horário na Grade).

Uso: python3 pipeline/thumb_painel.py <link do pedido no Notion> <link do Canva>
Fluxo n8n "Painel | Título e descrição (V1)" (shorts-ia-publicacao, acao 'thumb'). Falha não trava nada.
"""
import json, os, sys, tempfile
sys.path.insert(0, os.path.dirname(__file__))
import ponte

pedido, link = sys.argv[1], sys.argv[2]
tmp = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False)
json.dump({'acao': 'thumb', 'pedido': pedido, 'thumb_canva': link}, tmp); tmp.close()
try:
    print(ponte._curl(['-X', 'POST', '-H', 'Content-Type: application/json', '--data-binary', f'@{tmp.name}',
                       f'{ponte.BASE}/shorts-ia-publicacao'], timeout=60).strip()[:200])
except Exception as e:
    print('aviso: não foi para o painel:', str(e)[:200])
