import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

// Blog | Colocar contador nas páginas: de hora em hora, abre as páginas do blog no servidor (/files/lps/blog*.html)
// e coloca o contador de visitas nas que ainda não têm. Não mexe em mais nada da página. Pode rodar quantas vezes quiser.
const ler = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'De hora em hora', parameters: {
  rule: { interval: [{ field: 'cronExpression', expression: '7 * * * *' }] } } } });

const manual = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Rodar agora' } });

const arquivos = node({ type: 'n8n-nodes-base.readWriteFile', version: 1.1, config: { name: 'Ler páginas do blog', alwaysOutputData: true, parameters: {
  operation: 'read', fileSelector: '/files/lps/blog*.html', options: {} } } });

const colocar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Colocar contador', parameters: { jsCode: `const MARCA = 'euforia-contador-blog';
const TAG = '<script id="' + MARCA + '">(function(){var v="";try{v=localStorage.getItem("euf_v");if(!v){v=Math.random().toString(36).slice(2,12);localStorage.setItem("euf_v",v)}}catch(e){}' +
  'new Image().src="https://n8n.grupoeuforia.tech/webhook/blog-visita?p="+encodeURIComponent(location.pathname)+"&r="+encodeURIComponent(document.referrer)+"&v="+v})();</script>';
const out = [];
const itens = $input.all();
for (let i = 0; i < itens.length; i++) {
  const it = itens[i];
  if (!it.binary || !it.binary.data) continue;
  const nome = it.binary.data.fileName || '';
  const dir = it.binary.data.directory || '/files/lps';
  const buf = await this.helpers.getBinaryDataBuffer(i, 'data');
  let html = buf.toString('utf8');
  if (html.indexOf(MARCA) >= 0 || !/<\\/body>/i.test(html)) continue;
  html = html.replace(/<\\/body>/i, TAG + '</body>');
  out.push({ json: { arquivo: dir.replace(/\\/$/, '') + '/' + nome, nome }, binary: { data: await this.helpers.prepareBinaryData(Buffer.from(html, 'utf8'), nome, 'text/html') } });
}
return out.length ? out : [{ json: { nada: true } }];
` } } });

const tem = ifElse({ version: 2.2, config: { name: 'Tem página nova?', parameters: { conditions: {
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ leftValue: '={{ !!$json.arquivo }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and' } } } });

const gravar = node({ type: 'n8n-nodes-base.readWriteFile', version: 1.1, config: { name: 'Gravar página', parameters: {
  operation: 'write', fileName: '={{ $json.arquivo }}', dataPropertyName: 'data', options: {} } } });

const nota = sticky('## Blog | Colocar contador nas páginas\nDe hora em hora coloca o script do "Blog | Contador de visitas" nas páginas /files/lps/blog*.html que ainda não têm (marca euforia-contador-blog). Só acrescenta o script antes do </body>.', [], { color: 4 });

export default workflow('blog-colocar-contador', 'Blog | Colocar contador nas páginas')
  .add(ler).to(arquivos).to(colocar).to(tem.onTrue(gravar))
  .add(manual).to(arquivos)
  .add(nota);
