import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const DISCORD = { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } };
const NOTION_HDR = { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] };

const relogio = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'A cada 15 minutos', parameters: {
  rule: { interval: [{ field: 'cronExpression', expression: '7,22,37,52 * * * *' }] } } } });

// Cliente novo (criado pela máquina de setup desde 26/10) que ainda não tem ninguém em 🔑 Acessos do portal.
const novos = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Clientes novos sem acesso', credentials: NOTION, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/3ddc91b406be49e98e630c298d9162d8/query', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json',
  jsonBody: JSON.stringify({ filter: { and: [
    { timestamp: 'created_time', created_time: { on_or_after: '2026-10-26' } },
    { property: 'Acessos do portal', relation: { is_empty: true } },
    { property: 'Cliente', title: { does_not_contain: 'TESTE' } }] }, page_size: 20 }), options: {} } } });

const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar acesso do dono', parameters: { jsCode: `const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; return a ? a.map(t => t.plain_text).join('').trim() : ''; };
const out = [];
for (const pg of ($input.first().json.results || [])) {
  const pr = pg.properties || {};
  const nome = txt(pr['Cliente']);
  if (!nome || txt(pr['Situação']) === 'Encerrado') continue;
  const fone = (pr['WhatsApp do cliente'] || {}).phone_number || '';
  const props = {
    'Pessoa': { title: [{ type: 'text', text: { content: nome } }] },
    'Cliente': { relation: [{ id: pg.id }] },
    'Papel': { select: { name: 'Dono' } },
    'Ativo': { checkbox: true } };
  if (fone) props['WhatsApp'] = { phone_number: fone };
  out.push({ json: { nome, body: JSON.stringify({ parent: { database_id: 'a95cdc41-6645-47f5-8c0f-99a85e31fb4e' }, properties: props }) } });
}
return out;
` } } });

const criar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Criar acesso no portal', credentials: NOTION, onError: 'continueRegularOutput', alwaysOutputData: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/pages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: NOTION_HDR, sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.body }}', options: {} } } });

// O link fica só no Notion (é a chave de acesso do cliente); o aviso não leva o link.
const aviso = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar aviso', parameters: { mode: 'runOnceForEachItem', jsCode: `const nome = $('Montar acesso do dono').item.json.nome;
const ok = !!$json.id;
const msg = ok
  ? '🔑 Acesso do portal do dono criado para **' + nome + '**. O link está na ficha do cliente, em Acessos do portal.'
  : '⚠️ Não consegui criar o acesso do portal de **' + nome + '**. Criem a linha à mão em 🔑 Acessos do portal.';
return { json: { discord: JSON.stringify({ content: msg + '\\n— Érica, time de suporte, Grupo Euforia' }) } };
` } } });

const avisar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Avisar no #dia-a-dia', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: 'https://discord.com/api/v10/channels/1556642691410956339/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.discord }}', options: {} } } });

const nota = sticky('## Portal · acesso do dono para cliente novo (V1)\nA cada 15 min: cliente criado desde 26/10 (sem "TESTE" no nome) que ainda não tem ninguém em 🔑 Acessos do portal ganha uma linha Dono, Ativo, com o WhatsApp da ficha. Avisa no #dia-a-dia sem o link. Não manda nada ao cliente: o link sai quando a equipe fizer a call de alinhamento.', [], { color: 4 });

export default workflow('portal-acesso-dono', 'Portal | Acesso do dono para cliente novo (V1)')
  .add(relogio).to(novos).to(montar).to(criar).to(aviso).to(avisar)
  .add(nota);
