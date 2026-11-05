# Portal · acesso com PIN (05/11/2026)

- Link de cada pessoa: `grupoeuforia.com.br/portal?p=<Código>` (coluna Código do 🔑 Acessos do portal).
  O código sozinho não abre nada: no 1º acesso a pessoa cria um PIN de 4 a 6 números; depois entra com ele.
  O aparelho fica lembrado por 30 dias (botão Sair apaga).
- 5 PINs errados travam o link por 15 minutos.
- Esqueceu o PIN: marcar **Zerar PIN** na linha da pessoa. Em até 15 min ela cria um novo.
- Desmarcar **Ativo** corta o acesso em até 5 minutos (tempo do cache).
- Links antigos `?a=` param de abrir e mostram "Este link mudou".

Fluxos no n8n:
- `Portal | Entrar com PIN (V1)` (KxzkWgxa1d3KfI6k): webhook euforia-portal-entrar, chama a função `portal_entrar` no Postgres.
- `Portal | Códigos de acesso e PIN (V1)` (7iuh7bJQi98pbzof): a cada 15 min dá Código a quem não tem e zera PIN marcado.
- `Portal | Dados do cliente (V1)` (sw2PvkT0D630c5XS): agora com cache de 5 min no Postgres (`portal_cache`). Código em `dados.js`.

Postgres (credencial "Postgres account"): tabelas `portal_cache`, `portal_pin` (PIN guardado só como hash com sal) e função `portal_entrar`.
