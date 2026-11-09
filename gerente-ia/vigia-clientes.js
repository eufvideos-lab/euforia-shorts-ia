import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

// Clientes | Vigia de entrega e contrato (V1), 09/11/2026. Origem: caso Lucilene Rodrigues (contrato venceu sem entrega).
// Seg–sáb 8:40 (Recife). Lê clientes ativos + cards Postados (longo, podcast, shorts, carrossel).
// 1) Dias sem postagem (cliente com vídeo no contrato e fase Produção/Renovação): 7+ dias guardião; 14+ diretoria.
// 2) Contrato com saldo: faltam 30 dias ou menos → guardião + diretoria; vencido com saldo → diretoria todo dia.
// Datas e quantidades: campos 📄 da ficha. Regras na "Divisão da equipe 2.0" (Notion). Nada vai a cliente. Sem valores.
const NOTION = { httpHeaderAuth: { id: 'VYOze6gUMvjy3QXF', name: 'Notion Euforia' } };
const DISCORD = { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } };
const HDR = { authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendHeaders: true, headerParameters: { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] } };
const PAG10 = { pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest', parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] }, paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.has_more }}', limitPagesFetched: true, maxRequests: 10 } } };
const PAG40 = { pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest', parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: '={{ $response.body.next_cursor }}' }] }, paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.has_more }}', limitPagesFetched: true, maxRequests: 40 } } };

const relogio = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'Seg–sáb 8:40', parameters: { rule: { interval: [{ field: 'cronExpression', expression: '40 8 * * 1-6' }] } } } });
const clientes = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Clientes ativos', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/3ddc91b406be49e98e630c298d9162d8/query', ...HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { property: "Situação", select: { equals: "Ativo" } }, page_size: 100 }) }}', options: PAG10 } } });
const postados = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Cards postados', credentials: NOTION, executeOnce: true, parameters: {
  method: 'POST', url: 'https://api.notion.com/v1/databases/74b3076a325749e3bac4ba6659215e48/query', ...HDR, sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ filter: { and: [{ property: "Status", select: { equals: "Postado" } }, { or: ["Vídeo longo", "Podcast", "Shorts", "Carrossel"].map(t => ({ property: "Tipo", select: { equals: t } })) }] }, page_size: 100 }) }}',
  options: PAG40 } } });

const analisar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Analisar', parameters: { jsCode: `const NL = String.fromCharCode(10);
const Z = 'America/Recife';
const agora = DateTime.now().setZone(Z), hoje = agora.toISODate();
const sem = id => String(id || '').replace(/-/g, '');
const txt = v => { if (!v) return ''; const a = v.title || v.rich_text; if (a) return a.map(t => t.plain_text).join('').trim(); if (v.select) return v.select.name; if (v.date) return v.date.start || ''; if (v.formula) return String(v.formula.string || v.formula.number || ''); return ''; };
const num = v => (v && typeof v.number === 'number') ? v.number : null;
const rel = v => ((v || {}).relation || []).map(r => sem(r.id));
const dias = (a, b) => Math.round(DateTime.fromISO(b, { zone: Z }).diff(DateTime.fromISO(a, { zone: Z }), 'days').days);
const ddmm = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(2, 4) : '?';
// Pessoas (Equipe → Discord e 1x1). Guardião padrão: Rômulo (foco ⭐ ou faixa A), Lorena (B/C). Igual ao vigia de promessas.
const P = {
  '3ea98c0cdde081299709cf901fac7275': { nome: 'Rômulo', user: '1490768736876237082', canal: '1556650881921978511' },
  '3ea98c0cdde0812d9cb4c41ce70df4ae': { nome: 'Ismael', user: '1410287139169763471', canal: '1556650886678454403' },
  '3ea98c0cdde08182a952f3d9a5b73575': { nome: 'Victor', user: '1142062975071551528', canal: '1556650891732459620' },
  '3ea98c0cdde08163bd16f0213b098cb5': { nome: 'Lorena', user: '827882215185973279', canal: '1556650896962879518' },
  '3ea98c0cdde0817e87aee637a96d4fd1': { nome: 'Daniel', user: '1470387767337816128', canal: '1556650902448771104' }
};
const ROMULO = '3ea98c0cdde081299709cf901fac7275', LORENA = '3ea98c0cdde08163bd16f0213b098cb5';
// A Esteira (Entregas) só tem histórico desde 09/2026: antes disso não dá para contar entregas.
const ESTEIRA = '2026-09-01';
const pl = (n, a, b) => n + ' ' + (n === 1 ? a : b);
// Postados por cliente e tipo (Quantidade vazia = 1). Data = Postado em, senão Postar em.
const ent = {};
for (const it of $('Cards postados').all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {}; const tipo = txt(pr['Tipo']);
  if (/^TESTE/i.test(txt(pr['Entrega']))) continue;
  const q = num(pr['Quantidade']) || 1;
  const d = (txt(pr['Postado em']) || txt(pr['Postar em']) || String(p.created_time || '')).slice(0, 10);
  const k = tipo === 'Shorts' ? 'S' : tipo === 'Carrossel' ? 'C' : 'L';
  for (const c of rel(pr['Cliente'])) { (ent[c] = ent[c] || []).push({ k, q, d }); }
}
const out = [];
for (const it of $('Clientes ativos').all()) for (const p of (it.json.results || [])) {
  const pr = p.properties || {}, id = sem(p.id), nome = txt(pr['Cliente']);
  if (!nome || /^TESTE/i.test(nome)) continue;
  const fase = txt(pr['Fase']), faixa = (txt(pr['Faixa']) || txt(pr['Faixa base'])).replace(/[^ABC]/g, '').slice(0, 1);
  const foco = txt(pr['⭐ Foco até']).slice(0, 10) >= hoje;
  const g = rel(pr['🛡️ Guardião']); const guard = g.length ? g : [foco || faixa === 'A' ? ROMULO : LORENA];
  const ini = txt(pr['📄 Contrato início']).slice(0, 10), fim = txt(pr['📄 Contrato fim']).slice(0, 10);
  const cL = num(pr['📄 Contratado longos']), cS = num(pr['📄 Contratado shorts']), cC = num(pr['📄 Contratado carrosséis']);
  const lista = ent[id] || [];
  const desde = lista.filter(x => !ini || x.d >= ini);
  const feito = { L: 0, S: 0, C: 0 }; desde.forEach(x => { feito[x.k] += x.q; });
  const ultima = lista.map(x => x.d).filter(d => d <= hoje).sort().pop() || '';
  const temVideo = (cL || 0) > 0 || lista.length > 0 || (num(pr['Longos por semana']) || 0) > 0;
  const aguardando = !!txt(pr['🎥 Aguardando gravação']);
  const r = { id, nome, url: p.url, fase, guard, aguardando, ultima, problemas: [] };
  // 1) dias sem postagem
  if (temVideo && /^(3|4)\\./.test(fase)) {
    const base = [ultima, ini, ESTEIRA].filter(Boolean).sort().pop();
    const d = dias(base, hoje);
    if (d !== null && d >= 7) r.problemas.push({ tipo: 'sem_entrega', dias: d, nivel: d >= 14 ? 'diretoria' : 'guardiao',
      txt: (ultima ? 'sem postagem há ' + pl(d, 'dia', 'dias') + ' (última ' + ddmm(ultima) + ')' : 'nada postado ' + (base === ESTEIRA ? 'desde ' + ddmm(ESTEIRA) + ' (início da Esteira)' : 'desde o início do contrato (' + ddmm(ini) + ')')) + (aguardando ? ' · aguardando gravação do cliente' : '') });
  }
  // 2) contrato com saldo
  if (fim && (cL || cS || cC) && !/^5\\./.test(fase)) {
    const falta = { L: Math.max(0, (cL || 0) - feito.L), S: Math.max(0, (cS || 0) - feito.S), C: Math.max(0, (cC || 0) - feito.C) };
    const total = falta.L + falta.S + falta.C;
    const resto = dias(hoje, fim);
    const saldo = [falta.L ? pl(falta.L, 'longo', 'longos') : '', falta.S ? falta.S + ' shorts' : '', falta.C ? pl(falta.C, 'carrossel', 'carrosséis') : ''].filter(Boolean).join(', ');
    const conferir = ini && ini < ESTEIRA ? ' (⚠ contrato de ' + ddmm(ini) + ': confira o entregue antes da Esteira)' : '';
        if (total > 0 && resto < 0) r.problemas.push({ tipo: 'vencido', nivel: 'diretoria', dias: -resto, txt: 'contrato venceu ' + ddmm(fim) + ', falta ' + saldo + conferir });
    else if (total > 0 && resto <= 30) { const sem_ = Math.max(1, Math.ceil(resto / 7));
      r.problemas.push({ tipo: 'acabando', nivel: 'diretoria', dias: resto, txt: 'contrato acaba ' + ddmm(fim) + ' (' + pl(resto, 'dia', 'dias') + '), falta ' + saldo + (falta.L ? ', ~' + Math.ceil(falta.L / sem_) + ' longo(s)/semana' : '') + conferir }); }
  }
  if (r.problemas.length) out.push(r);
}
// Mensagens: diretoria (#aprovações-gerente) e 1x1 de cada guardião. Partes de até 1900 caracteres.
const ORD = { vencido: 0, acabando: 1, sem_entrega: 2 };
const nomeG = r => r.guard.map(g => (P[g] || {}).nome || '?').join(', ');
const fatiar = (cab, linhas, fim) => { const ps = []; let a = cab; for (const l of linhas.concat(fim ? [fim] : [])) { if ((a + l).length > 1900) { ps.push(a); a = ''; } a += l; } ps.push(a); return ps.filter(t => t.trim()); };
const blocos = [
  ['🚨 Contrato vencido com saldo', x => x.tipo === 'vencido'],
  ['⏳ Contrato acaba em até 30 dias com saldo', x => x.tipo === 'acabando'],
  ['📭 Sem postagem há 14 dias ou mais', x => x.tipo === 'sem_entrega' && x.nivel === 'diretoria'],
  ['🟡 Sem postagem há 7 a 13 dias', x => x.tipo === 'sem_entrega' && x.nivel === 'guardiao']
];
const linhasD = [];
for (const [titulo, f] of blocos) {
  const itens = []; out.forEach(r => r.problemas.filter(f).forEach(pb => itens.push('• **' + r.nome + '** · ' + pb.txt + ' · ' + nomeG(r) + NL)));
  if (!itens.length) continue;
  itens[0] = NL + '**' + titulo + ' (' + itens.length + ')**' + NL + itens[0];
  itens.forEach(l => linhasD.push(l));
}
if (!out.length) linhasD.push(NL + 'Nenhum cliente parado nem contrato com saldo vencendo. 👏');
const cabD = '🧭 **Vigia de clientes · ' + agora.setLocale('pt-BR').toFormat('cccc dd/MM') + '**' + NL + 'Contratos pelos campos 📄 da ficha. Prorrogou ou congelou? Atualize o 📄 Contrato fim.' + NL;
const msgs = fatiar(cabD, linhasD).map(t => ({ canal: '1567643418270634136', corpo: JSON.stringify({ content: t, allowed_mentions: { parse: [] } }) }));
// Guardião: só os clientes dele, um cliente por linha com todos os problemas.
const porG = {};
out.forEach(r => r.guard.forEach(g => { if (P[g]) (porG[g] = porG[g] || []).push(r); }));
for (const g of Object.keys(porG)) {
  const p = P[g];
  const linhas = porG[g].sort((a, b) => Math.min(...a.problemas.map(x => ORD[x.tipo])) - Math.min(...b.problemas.map(x => ORD[x.tipo])))
    .map(r => '• **' + r.nome + '** · ' + r.problemas.map(pb => pb.txt).join(' · ') + NL);
  const fim = NL + 'Você é o guardião. Sem postagem: descubra hoje onde travou (bruto, edição, aprovação, cliente sem gravar) e resolva ou registre a promessa nova. Contrato com saldo: a diretoria já sabe; monte o plano de entrega com o Ismael.';
  fatiar('🧭 <@' + p.user + '> **Seus clientes que precisam de ação hoje (' + linhas.length + ')**' + NL, linhas, fim)
    .forEach(t => msgs.push({ canal: p.canal, corpo: JSON.stringify({ content: t, allowed_mentions: { users: [p.user] } }) }));
}
return msgs.map(m => ({ json: m }));
` } } });

const enviar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Mandar no Discord', credentials: DISCORD, onError: 'continueRegularOutput', parameters: {
  method: 'POST', url: '=https://discord.com/api/v10/channels/{{ $json.canal }}/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.corpo }}', options: { batching: { batch: { batchSize: 1, batchInterval: 1200 } } } } } });

const nota = sticky('## Clientes · Vigia de entrega e contrato (V1)\nSeg–sáb 8:40. Cliente ativo em Produção/Renovação sem postagem há 7+ dias: 1x1 do guardião; 14+: diretoria (#aprovações-gerente). Contrato (campos 📄 da ficha) com saldo e 30 dias ou menos: guardião + diretoria; vencido com saldo: diretoria todo dia. Histórico conta desde 01/09/26 (início da Esteira). Regras: Notion "Divisão da equipe 2.0".', [], { color: 4 });

export default workflow('clientes-vigia', 'Clientes | Vigia de entrega e contrato (V1)')
  .add(relogio).to(clientes).to(postados).to(analisar).to(enviar)
  .add(nota);
