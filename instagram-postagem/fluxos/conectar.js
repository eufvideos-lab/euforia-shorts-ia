import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';

const CONTAS = { __rl: true, mode: 'id', value: 'OOJsLQJwkBAvvLLk', cachedResultName: 'Instagram | Contas dos clientes' };
const IA_STATUS = 'https://discord.com/api/v10/channels/1559987978774777998/messages';

// ---------- 1) Link que o cliente abre: manda para o "Entrar com Instagram" ----------
const pedidoLink = trigger({
  type: 'n8n-nodes-base.webhook', version: 2.1,
  config: { name: 'Cliente abriu o link', parameters: { httpMethod: 'GET', path: 'insta-conectar', responseMode: 'responseNode', options: {} } }
});

const montarLink = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Montar link do Instagram',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `// ID do app do Instagram (Meta > app > Instagram > Configuração da API com login do Instagram > "ID do app do Instagram").
// Não é segredo. O segredo do app fica só na credencial "Instagram App (Euforia)".
const APP_ID = '2207780193130954';
const REDIRECT = 'https://n8n.grupoeuforia.tech/webhook/insta-retorno';
const q = $input.first().json.query || {};
const cliente = String(q.c || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);
if (!cliente || APP_ID.startsWith('COLOCAR')) {
  return [{ json: { ok: false, url: 'https://grupoeuforia.com.br' } }];
}
const scope = ['instagram_business_basic', 'instagram_business_content_publish'].join(',');
const url = 'https://www.instagram.com/oauth/authorize?force_reauth=true&client_id=' + APP_ID +
  '&redirect_uri=' + encodeURIComponent(REDIRECT) + '&response_type=code&scope=' + encodeURIComponent(scope) +
  '&state=' + encodeURIComponent(cliente);
return [{ json: { ok: true, url } }];`
    }
  }
});

const irParaInstagram = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Ir para o Instagram', parameters: { respondWith: 'redirect', redirectURL: expr('{{ $json.url }}'), options: {} } }
});

// ---------- 2) Instagram devolve o cliente com o código ----------
const retorno = trigger({
  type: 'n8n-nodes-base.webhook', version: 2.1,
  config: { name: 'Instagram devolveu o cliente', parameters: { httpMethod: 'GET', path: 'insta-retorno', responseMode: 'responseNode', options: {} } }
});

const trocarCodigo = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.4,
  config: {
    name: 'Trocar código por token',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://api.instagram.com/oauth/access_token',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpCustomAuth',
      // A Instagram só aceita formulário; a credencial Custom Auth junta client_id e client_secret no corpo.
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/x-www-form-urlencoded' }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ grant_type: "authorization_code", redirect_uri: "https://n8n.grupoeuforia.tech/webhook/insta-retorno", code: String($json.query.code || "").replace(/#_$/, "") }) }}'),
      options: {}
    },
    credentials: { httpCustomAuth: { id: 'GW1RoyiES2fXvjdm', name: 'Instagram App (Euforia)' } }
  }
});

const tokenLongo = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.4,
  config: {
    name: 'Token de 60 dias',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: 'https://graph.instagram.com/access_token',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpCustomAuth',
      sendQuery: true,
      queryParameters: { parameters: [
        { name: 'grant_type', value: 'ig_exchange_token' },
        { name: 'access_token', value: expr('{{ $json.access_token }}') }
      ] },
      options: {}
    },
    credentials: { httpCustomAuth: { id: 'GW1RoyiES2fXvjdm', name: 'Instagram App (Euforia)' } }
  }
});

const quemE = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.4,
  config: {
    name: 'Qual é a conta',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: 'https://graph.instagram.com/v23.0/me',
      sendQuery: true,
      queryParameters: { parameters: [
        { name: 'fields', value: 'user_id,username,account_type' },
        { name: 'access_token', value: expr('{{ $json.access_token }}') }
      ] },
      options: {}
    }
  }
});

const resultado = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Conferir resultado',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `const q = $('Instagram devolveu o cliente').first().json.query || {};
const cliente = String(q.state || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
const longo = $('Token de 60 dias').first().json || {};
const conta = $input.first().json || {};
const ok = !!(cliente && longo.access_token && conta.username);
let motivo = '';
if (!ok) motivo = q.error_description || q.error || (conta.error && (conta.error.message || conta.error)) || 'sem token';
return [{ json: {
  ok, cliente, motivo: String(motivo).replace(/access_token=[^&\\s]+/g, 'access_token=***').slice(0, 300),
  ig_user_id: String(conta.user_id || conta.id || ''), username: conta.username || '', account_type: conta.account_type || '',
  token: longo.access_token || '', agora: new Date().toISOString()
} }];`
    }
  }
});

const deuCerto = ifElse({
  version: 2.2,
  config: {
    name: 'Conectou?',
    parameters: { conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
      conditions: [{ leftValue: expr('{{ $json.ok }}'), operator: { type: 'boolean', operation: 'true', singleValue: true }, rightValue: '' }],
      combinator: 'and'
    } }
  }
});

const salvarConta = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: {
    name: 'Salvar conta do cliente',
    parameters: {
      resource: 'row', operation: 'upsert', dataTableId: CONTAS, matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'cliente', condition: 'eq', keyValue: expr('{{ $json.cliente }}') }] },
      columns: { mappingMode: 'defineBelow', value: {
        cliente: expr('{{ $json.cliente }}'), ig_user_id: expr('{{ $json.ig_user_id }}'), username: expr('{{ $json.username }}'),
        token: expr('{{ $json.token }}'), conectado_em: expr('{{ $json.agora }}'), renovado_em: expr('{{ $json.agora }}'),
        status: 'ativa', obs: expr('{{ "tipo de conta: " + $json.account_type }}')
      }, matchingColumns: [], schema: [] },
      options: {}
    }
  }
});

const paginaOk = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: {
    name: 'Página: conectado',
    parameters: {
      respondWith: 'text',
      responseBody: expr(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Instagram conectado</title><link href="https://fonts.googleapis.com/css2?family=Archivo:wght@700;800&family=Inter:wght@400;600&display=swap" rel="stylesheet"></head><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#050505;color:#F2EFEA;font-family:Inter,sans-serif;padding:24px;box-sizing:border-box"><div style="max-width:440px;text-align:center"><div style="font-size:64px;color:#FF6518">✓</div><h1 style="font-family:Archivo,sans-serif;font-weight:800;font-size:30px;margin:8px 0 12px">Pronto! Instagram conectado.</h1><p style="font-size:17px;line-height:1.5;opacity:.85">A conta <b>@{{ $('Conferir resultado').item.json.username }}</b> já está ligada ao Grupo Euforia. A partir de agora a gente programa as postagens aprovadas para você.</p><p style="font-size:15px;opacity:.6;margin-top:24px">Pode fechar esta página.</p></div></body></html>`),
      options: { responseHeaders: { entries: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }] } }
    }
  }
});

const avisoOk = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.4,
  config: {
    name: 'Avisar no #ia-status (conectou)',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST', url: IA_STATUS,
      authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
      sendBody: true, specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ content: "✅ Instagram conectado: @" + $(\'Conferir resultado\').item.json.username + " (cliente " + $(\'Conferir resultado\').item.json.cliente + "). Já pode entrar na fila de postagem." }) }}'),
      options: {}
    },
    credentials: { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } }
  }
});

const paginaErro = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: {
    name: 'Página: não conectou',
    parameters: {
      respondWith: 'text',
      responseBody: `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Não deu certo</title></head><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#050505;color:#F2EFEA;font-family:Inter,Arial,sans-serif;padding:24px;box-sizing:border-box"><div style="max-width:440px;text-align:center"><h1 style="font-size:28px;margin:0 0 12px">Quase lá</h1><p style="font-size:17px;line-height:1.5;opacity:.85">A conexão não foi concluída. Confira se o Instagram é uma conta profissional (Comercial ou Criador de conteúdo) e se você clicou em <b>Permitir</b>. Depois é só abrir o link de novo.</p><p style="font-size:15px;opacity:.6;margin-top:24px">Se continuar, avise a nossa equipe no grupo.</p></div></body></html>`,
      options: { responseCode: 200, responseHeaders: { entries: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }] } }
    }
  }
});

const avisoErro = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.4,
  config: {
    name: 'Avisar no #ia-status (falhou)',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST', url: IA_STATUS,
      authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
      sendBody: true, specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ content: "⚠️ Instagram não conectou (cliente " + ($(\'Conferir resultado\').item.json.cliente || "?") + "): " + $(\'Conferir resultado\').item.json.motivo }) }}'),
      options: {}
    },
    credentials: { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } }
  }
});

// ---------- 3) Renovar os tokens antes de vencer (60 dias) ----------
const todoDia = trigger({
  type: 'n8n-nodes-base.scheduleTrigger', version: 1.3,
  config: { name: 'Todo dia 5h', parameters: { rule: { interval: [{ field: 'days', triggerAtHour: 5 }] } } }
});

const contasAtivas = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: {
    name: 'Contas ativas',
    parameters: {
      resource: 'row', operation: 'get', dataTableId: CONTAS, matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'status', condition: 'eq', keyValue: 'ativa' }] },
      returnAll: true
    }
  }
});

const vencendo = node({
  type: 'n8n-nodes-base.filter', version: 2.2,
  config: {
    name: 'Renovada há mais de 20 dias',
    parameters: { conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
      conditions: [{ leftValue: expr('{{ DateTime.fromISO(String($json.renovado_em)) < $now.minus({ days: 20 }) }}'), operator: { type: 'boolean', operation: 'true', singleValue: true }, rightValue: '' }],
      combinator: 'and'
    } }
  }
});

const renovar = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.4,
  config: {
    name: 'Renovar token',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET', url: 'https://graph.instagram.com/refresh_access_token',
      sendQuery: true,
      queryParameters: { parameters: [
        { name: 'grant_type', value: 'ig_refresh_token' },
        { name: 'access_token', value: expr('{{ $json.token }}') }
      ] },
      options: { batching: { batch: { batchSize: 1, batchInterval: 1000 } } }
    }
  }
});

const renovou = ifElse({
  version: 2.2,
  config: {
    name: 'Renovou?',
    parameters: { conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
      conditions: [{ leftValue: expr('{{ $json.access_token }}'), operator: { type: 'string', operation: 'notEmpty', singleValue: true }, rightValue: '' }],
      combinator: 'and'
    } }
  }
});

const gravarToken = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: {
    name: 'Gravar token novo',
    parameters: {
      resource: 'row', operation: 'update', dataTableId: CONTAS, matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr("{{ $('Renovada há mais de 20 dias').item.json.id }}") }] },
      columns: { mappingMode: 'defineBelow', value: { token: expr('{{ $json.access_token }}'), renovado_em: expr('{{ $now.toISO() }}') }, matchingColumns: [], schema: [] },
      options: {}
    }
  }
});

const marcarReconectar = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: {
    name: 'Marcar: precisa reconectar',
    parameters: {
      resource: 'row', operation: 'update', dataTableId: CONTAS, matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr("{{ $('Renovada há mais de 20 dias').item.json.id }}") }] },
      columns: { mappingMode: 'defineBelow', value: { status: 'reconectar', obs: expr('{{ "renovação falhou em " + $now.toFormat("dd/MM") }}') }, matchingColumns: [], schema: [] },
      options: {}
    }
  }
});

const avisoReconectar = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.4,
  config: {
    name: 'Avisar no #ia-status (reconectar)',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST', url: IA_STATUS,
      authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
      sendBody: true, specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ content: "🔴 Instagram de @" + $(\'Renovada há mais de 20 dias\').item.json.username + " (cliente " + $(\'Renovada há mais de 20 dias\').item.json.cliente + ") desconectou. Mandar o link de conectar de novo." }) }}'),
      options: {}
    },
    credentials: { httpHeaderAuth: { id: 'PY2ZcN5kAVFaS1io', name: 'Discord Bot' } }
  }
});

export default workflow('insta-conectar', 'Instagram | Conectar conta do cliente (V1)')
  .add(pedidoLink).to(montarLink).to(irParaInstagram)
  .add(retorno).to(trocarCodigo).to(tokenLongo).to(quemE).to(resultado)
  .to(deuCerto
    .onTrue(salvarConta.to(paginaOk).to(avisoOk))
    .onFalse(paginaErro.to(avisoErro)))
  .add(todoDia).to(contasAtivas).to(vencendo).to(renovar)
  .to(renovou
    .onTrue(gravarToken)
    .onFalse(marcarReconectar.to(avisoReconectar)));
