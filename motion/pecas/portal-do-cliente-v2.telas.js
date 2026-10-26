const { chromium } = require('playwright');
const S = process.argv[2];
(async () => {
  const b = await chromium.launch();
  const shot = async (name, fn, { arq = 'dono', vp = { width: 1440, height: 900 }, scale = 2 } = {}) => {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: scale });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    const p = await ctx.newPage();
    await p.goto('file://' + S + '/portal/' + arq + '.html?demo=1');
    await p.waitForSelector('#app:not([hidden])');
    await p.addStyleTag({ content: '.proto{display:none!important}' });
    await p.waitForTimeout(800); if (fn) await fn(p); await p.waitForTimeout(700);
    await p.screenshot({ path: `${S}/telas2/${name}.png` }); await ctx.close();
  };
  const ent = async p => { await p.click('button[data-view=entregas]'); await p.waitForTimeout(400); };
  const abre = async p => { await ent(p); await p.click('#board >> text=Os 3 erros do café da manhã'); await p.waitForTimeout(500); };
  const grav = async p => { await p.click('button[data-view=gravacoes]'); await p.waitForTimeout(400); };
  const ler = async p => { await grav(p); await p.click('#roteiros >> text=Ler >> nth=0'); await p.waitForTimeout(900); };
  await shot('inicio');
  await shot('entregas', ent);
  await shot('aprovar', abre);
  await shot('ajuste', async p => { await abre(p); await p.click('#ask'); });
  await shot('ajuste-escrito', async p => { await abre(p); await p.click('#ask'); await p.fill('#adj-txt', 'Troca a música do começo por uma mais calma'); await p.fill('#adj input', '01:20').catch(() => {}); });
  await shot('ajuste-enviado', async p => { await abre(p); await p.click('#ask'); await p.fill('#adj-txt', 'Troca a música do começo por uma mais calma'); await p.click('#adj >> text=Enviar pedido de ajuste'); await p.waitForTimeout(1200); });
  await shot('aprovado', async p => { await abre(p); await p.click('#drawer >> text=Aprovar'); await p.waitForTimeout(1500); });
  await shot('gravacoes', grav);
  await shot('roteiro', ler);
  await shot('roteiro-copiado', async p => { await ler(p); await p.click('#rot-copiar'); await p.waitForTimeout(500); });
  const envio = async (p, pct, txt, toastTxt) => {
    await grav(p);
    await p.evaluate(([pct, txt, toastTxt]) => {
      document.querySelector('#file-name').textContent = 'gravacao-roteiro-08.mp4 · 2.4 GB';
      document.querySelector('#drop').classList.add('over');
      document.querySelector('#up-box').hidden = false;
      document.querySelector('#up-bar').style.width = pct + '%';
      document.querySelector('#up-txt').textContent = txt;
      if (toastTxt) { const t = document.querySelector('#toast'); t.textContent = toastTxt; t.hidden = false; }
    }, [pct, txt, toastTxt]);
  };
  await shot('envio-progresso', p => envio(p, 64, 'Enviando… 64%'));
  await shot('envio-recebido', p => envio(p, 100, 'Recebido! A equipe já foi avisada e a edição começa em seguida.', 'Gravação recebida. Obrigado!'));
  await shot('mensagens', p => p.click('button[data-view=mensagens]'));
  await shot('msg-escrita', async p => { await p.click('button[data-view=mensagens]'); await p.fill('#msg-in', 'Gravei o roteiro 08, já mando por aqui!'); });
  await shot('msg-enviada', async p => { await p.click('button[data-view=mensagens]'); await p.fill('#msg-in', 'Gravei o roteiro 08, já mando por aqui!'); await p.click('#msg-btn'); await p.waitForTimeout(900); });
  await shot('equipe-aprovar', abre, { arq: 'equipe' });
  const M = { vp: { width: 390, height: 844 }, scale: 3 };
  await shot('cel-inicio', null, M);
  await shot('cel-entregas', ent, M);
  await shot('cel-gravacoes', grav, M);
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
