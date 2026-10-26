import { workflow, node, trigger, ifElse } from '@n8n/workflow-sdk';

// Narração das peças de motion: texto -> voz da ElevenLabs com o tempo de cada letra (para cronometrar as cenas).
const XI = { httpHeaderAuth: { id: 'w0Bqx0YzDLRavryt', name: 'ElevenLabs API' } };

const pedir = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Pedido de voz', parameters: {
  httpMethod: 'POST', path: 'euforia-motion-voz', responseMode: 'lastNode' } } });

const ler = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Ler pedido', parameters: { jsCode: `const b = ($input.first().json.body) || {};
return [{ json: { acao: b.acao === 'falar' ? 'falar' : 'vozes', texto: String(b.texto || ''), voz: String(b.voz || ''),
  modelo: String(b.modelo || 'eleven_multilingual_v2'), estabilidade: Number(b.estabilidade ?? 0.45), similaridade: Number(b.similaridade ?? 0.8), estilo: Number(b.estilo ?? 0.25) } }];
` } } });

const eFalar = ifElse({ version: 2.2, config: { name: 'Falar?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ $json.acao }}', rightValue: 'falar', operator: { type: 'string', operation: 'equals' } }],
  combinator: 'and' } } } });

const falar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Gerar voz', credentials: XI, parameters: {
  method: 'POST', url: '=https://api.elevenlabs.io/v1/text-to-speech/{{ $json.voz }}/with-timestamps?output_format=mp3_44100_128',
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify({ text: $json.texto, model_id: $json.modelo, voice_settings: { stability: $json.estabilidade, similarity_boost: $json.similaridade, style: $json.estilo, use_speaker_boost: true } }) }}',
  options: { timeout: 300000 } } } });

const vozes = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4, config: { name: 'Listar vozes', credentials: XI, parameters: {
  method: 'GET', url: 'https://api.elevenlabs.io/v2/voices?page_size=100',
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', options: {} } } });

const resumir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Resumir vozes', parameters: { jsCode: `const v = ($input.first().json.voices) || [];
const out = [];
for (const x of v) out.push({ id: x.voice_id, nome: x.name, cat: x.category, l: x.labels || {} });
return [{ json: { vozes: out } }];
` } } });

export default workflow('motion-voz', 'Motion | Voz da narração (ElevenLabs)')
  .add(pedir).to(ler).to(eFalar
    .onTrue(falar)
    .onFalse(vozes.to(resumir)));
