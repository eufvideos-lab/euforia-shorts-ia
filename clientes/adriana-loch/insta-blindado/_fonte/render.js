const {chromium}=require('playwright');const fs=require('fs');
const T=fs.readFileSync('post.html','utf8');
const posts=[
 {n:1,BG:'bg1.png',SEAM:'',KICK:'QUEM SOU',TITLE:'Mais de 20 anos <em>no palco.</em>',TEXT:'Hoje eu ensino você a estruturar ideias que inspiram e vendem.',NEXT:'arraste →'},
 {n:2,BG:'bg2.png',SEAM:'',KICK:'O MÉTODO',TITLE:'Business <em>Speaker</em>',TEXT:'Cinco frentes para sair do medo de falar e chegar a palestras que vendem.',NEXT:'arraste →'},
 {n:3,BG:'bg3.png',SEAM:'<div class="seam"></div>',KICK:'COMECE AGORA',TITLE:'Sua voz <em>tem poder.</em>',TEXT:'Assista ao canal e conheça o curso. O link está na bio.',NEXT:'arraste →'}];
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1080,height:1350}});
for(const d of posts){let h=T.replace('src="BG"',`src="${d.BG}"`);for(const k of ['SEAM','KICK','TITLE','TEXT','NEXT'])h=h.replace(k,d[k]);
fs.writeFileSync(`p${d.n}.html`,h);await pg.goto(`file:///tmp/claude-0/al/build/p${d.n}.html`);await pg.waitForTimeout(1500);await pg.screenshot({path:`post-fixado-${d.n}.png`});}
await b.close();})();
