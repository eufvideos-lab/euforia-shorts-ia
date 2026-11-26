
const S=[...document.querySelectorAll('.s')];let i=0;
const P=document.getElementById('palco'),B=document.getElementById('bar');
function fit(){const k=Math.min(innerWidth/1920,innerHeight/1080);P.style.transform=`translate(-50%,-50%) scale(${k})`}
function go(n){i=Math.max(0,Math.min(S.length-1,n));S.forEach((s,j)=>s.classList.toggle('on',j===i));B.style.width=((i+1)/S.length*100)+'%';history.replaceState(null,'','#'+(i+1))}
addEventListener('resize',fit);
addEventListener('keydown',e=>{if(['ArrowRight','PageDown',' ','Enter'].includes(e.key)){e.preventDefault();go(i+1)}else if(['ArrowLeft','PageUp','Backspace'].includes(e.key)){e.preventDefault();go(i-1)}else if(e.key==='Home')go(0);else if(e.key==='End')go(S.length-1);else if(e.key==='f'||e.key==='F'){document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()}});
let x0=null;addEventListener('touchstart',e=>x0=e.touches[0].clientX,{passive:true});
addEventListener('touchend',e=>{if(x0===null)return;const d=e.changedTouches[0].clientX-x0;if(Math.abs(d)>50)go(i+(d<0?1:-1));x0=null});
P.addEventListener('click',e=>{if(e.target.closest('button,a,.nofwd'))return;go(i+(e.clientX>innerWidth/3?1:-1))});
document.getElementById('prev').onclick=()=>go(i-1);document.getElementById('next').onclick=()=>go(i+1);
document.getElementById('fs').onclick=()=>{document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()};
S.forEach((s,j)=>{if(j>0&&j<S.length-1){const p=document.createElement('div');p.className='pg';p.textContent=String(j+1).padStart(2,'0');s.appendChild(p)}});
fit();go(Math.max(0,(parseInt(location.hash.slice(1))||1)-1));

document.querySelectorAll('[data-funil]').forEach(F=>{
 const C=[...F.querySelectorAll('.fc')],B=[...F.querySelectorAll('.trilha button')];let tm=[];
 function at(n){C.forEach((c,k)=>c.classList.toggle('on',k===n));B.forEach((b,k)=>b.classList.toggle('on',k===n));
  tm.forEach(clearTimeout);tm=[];const bs=[...C[n].querySelectorAll('.fbal')];F.querySelectorAll('.fbal').forEach(b=>b.classList.remove('vis'));
  bs.forEach((b,j)=>tm.push(setTimeout(()=>b.classList.add('vis'),350+j*1100)));}
 B.forEach((b,k)=>b.addEventListener('click',e=>{e.stopPropagation();at(k)}));
 F.querySelectorAll('[data-ir]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();at(+b.dataset.ir)}));
 at(0);
});

/* interativos 19/11 */
document.querySelectorAll('[data-hz]').forEach(R=>{
 const Q=R.querySelector('.quadro'),C=Q.querySelector('.crop'),L=C.querySelector('span'),I=R.querySelector('.info'),D=Q.querySelector('.dica'),B=[...R.querySelectorAll('.ops button')];
 const W=1080,H=608;
 const M={yt:{w:W,x:0,t:'16:9 · vídeo longo',i:'<b>O vídeo completo no YouTube.</b> A tela inteira é aproveitada, do jeito que o podcast foi gravado.'},
  sh:{w:H*9/16,x:560,t:'9:16 · Short e Reels',i:'<b>Do mesmo arquivo sai o vertical.</b> A edição recorta em quem está falando. Arraste o quadro e veja.'},
  fd:{w:H*4/5,x:520,t:'4:5 · Feed e carrossel',i:'<b>Também vira post e carrossel.</b> Um quadro do vídeo vira capa, frase e carrossel no Instagram.'},
  pe:{i:'<b>Gravado em pé, o vídeo serve só para o short.</b> No YouTube ele aparece com tarjas pretas e ocupa só um terço da tela. Não dá para tirar dele o vídeo longo.'}};
 let m='yt',x=0;
 function set(k){m=k;B.forEach(b=>b.classList.toggle('on',b.dataset.m===k));const o=M[k];I.innerHTML=o.i;Q.classList.toggle('pe',k==='pe');
  if(k!=='pe'){x=o.x;C.style.width=o.w+'px';C.style.left=Math.min(x,W-o.w)+'px';L.textContent=o.t}D.style.opacity=(k==='sh'||k==='fd')?1:0}
 B.forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();set(b.dataset.m)}));
 let dx=null,x0=0;
 C.addEventListener('pointerdown',e=>{if(m==='yt'||m==='pe')return;e.stopPropagation();dx=e.clientX;x0=C.offsetLeft;C.classList.add('arr');C.setPointerCapture(e.pointerId)});
 C.addEventListener('pointermove',e=>{if(dx===null)return;const k=Q.getBoundingClientRect().width/W;let nx=x0+(e.clientX-dx)/k;nx=Math.max(0,Math.min(W-C.offsetWidth,nx));C.style.left=nx+'px'});
 C.addEventListener('pointerup',e=>{dx=null;C.classList.remove('arr')});
 R.addEventListener('touchstart',e=>e.stopPropagation(),{passive:true});R.addEventListener('touchend',e=>e.stopPropagation());
 set('yt');
 let auto=0;B.forEach(b=>b.addEventListener('click',()=>auto=1));
 new MutationObserver(()=>{if(R.closest('.s').classList.contains('on')&&!auto){set('yt');setTimeout(()=>{if(!auto)set('sh')},1600)}}).observe(R.closest('.s'),{attributes:true,attributeFilter:['class']});
});
document.querySelectorAll('[data-sh]').forEach(R=>{
 const V=R.querySelector('video'),Q=R.querySelector('.quadro'),C=Q.querySelector('.crop'),T=R.querySelector('.tlp i'),Mk=R.querySelector('.tlp .m'),B=[...R.querySelectorAll('.ops button')];
 const D=[{v:'data:video/mp4;base64,XXX',p:'data:image/jpeg;base64,XXX',a:0,b:33,m:17,x:380},{v:'data:video/mp4;base64,XXX',p:'data:image/jpeg;base64,XXX',a:33,b:68,m:44,x:360},{v:'data:video/mp4;base64,XXX',p:'data:image/jpeg;base64,XXX',a:68,b:100,m:79,x:380}];
 function at(k){const d=D[k];B.forEach((b,j)=>b.classList.toggle('on',j===k));Q.style.backgroundImage=`url(${d.p})`;T.style.left=d.a+'%';T.style.width=(d.b-d.a)+'%';Mk.style.left=d.m+'%';C.style.left=d.x+'px';V.src=d.v;V.play().catch(()=>{})}
 B.forEach((b,k)=>b.addEventListener('click',e=>{e.stopPropagation();at(k)}));
 at(0);
 new MutationObserver(()=>{if(R.closest('.s').classList.contains('on'))V.play().catch(()=>{});else V.pause()}).observe(R.closest('.s'),{attributes:true,attributeFilter:['class']});
});
document.querySelectorAll('[data-luz]').forEach(R=>{
 const B=[...R.querySelectorAll('.ops button')],I=R.querySelector('.info'),J=R.querySelector('.jan'),Rs=R.querySelector('.raios'),Im=R.querySelector('.foto img'),O=R.querySelector('.foto .ov'),Le=R.querySelector('.led'),La=R.querySelector('.lamp');
 const M={frente:{j:'translate(220px,520px)',r:'rotate(180deg)',f:'brightness(1.08) contrast(1.04)',o:'none',i:'<b>A melhor luz que existe, e é de graça.</b> A janela atrás da câmera ilumina o rosto por igual.'},
  lado:{j:'translate(40px,230px) rotate(-90deg)',r:'',f:'brightness(1.02)',o:'linear-gradient(90deg,rgba(0,0,0,0) 35%,rgba(0,0,0,.45) 100%)',i:'<b>Também funciona.</b> A luz de lado dá profundidade ao rosto. Só não deixe a janela atrás.'},
  atras:{j:'translate(220px,70px)',r:'',f:'brightness(.32) contrast(.85) saturate(.7)',o:'radial-gradient(ellipse 60% 55% at 50% 52%,rgba(255,255,255,0) 40%,rgba(255,255,255,.92) 100%)',i:'<b>O rosto fica escuro e o fundo estoura.</b> A câmera não corrige isso, e a edição também não.'},
  teto:{j:'translate(-300px,-300px)',r:'',f:'brightness(.85) contrast(1.1)',o:'linear-gradient(180deg,rgba(255,255,255,.18) 0,rgba(0,0,0,0) 30%,rgba(0,0,0,.55) 100%)',i:'<b>Luz só de cima marca olheiras</b> e deixa sombra embaixo do queixo. Acenda também uma luz na frente.'},
  led:{j:'translate(-300px,-300px)',r:'',f:'brightness(1.1) contrast(1.05) saturate(1.05)',o:'none',i:'<b>À noite, um painel de LED ou ring light</b> atrás da câmera, um pouco acima dos olhos, faz o papel da janela.'}};
 function set(k){const o=M[k];B.forEach(b=>b.classList.toggle('on',b.dataset.l===k));I.innerHTML=o.i;J.style.transform=o.j;Rs.style.transform=o.r;Im.style.filter=o.f;O.style.background=o.o;O.style.opacity=o.o==='none'?0:1;Le.setAttribute('opacity',k==='led'?1:0);La.setAttribute('opacity',k==='teto'?1:0)}
 B.forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();set(b.dataset.l)}));
 set('frente');
});
document.querySelectorAll('[data-aud]').forEach(R=>{
 const A=[...R.querySelectorAll('audio')],Bt=[...R.querySelectorAll('.ouvir button')],cv=R.querySelector('.onda'),g=cv.getContext('2d'),I=R.querySelector('.info'),Pn=[...R.querySelectorAll('.pin')],fio=R.querySelector('.fio'),rg=R.querySelector('.regua');
 let ctx,an,buf,cur=-1;
 function setup(){if(ctx)return;ctx=new (window.AudioContext||window.webkitAudioContext)();an=ctx.createAnalyser();an.fftSize=1024;buf=new Uint8Array(an.fftSize);A.forEach(a=>{const s=ctx.createMediaElementSource(a);s.connect(an)});an.connect(ctx.destination)}
 function draw(){g.fillStyle='#0A1A3A';g.fillRect(0,0,cv.width,cv.height);g.strokeStyle=cur===1?'#FF8A65':'#2F7BFF';g.lineWidth=5;g.beginPath();
  if(an&&cur>=0&&!A[cur].paused){an.getByteTimeDomainData(buf);for(let k=0;k<buf.length;k++){const x=k/buf.length*cv.width,y=(buf[k]/255)*cv.height;k?g.lineTo(x,y):g.moveTo(x,y)}}else{g.moveTo(0,cv.height/2);g.lineTo(cv.width,cv.height/2)}
  g.stroke();requestAnimationFrame(draw)}
 draw();
 Bt.forEach((b,k)=>b.addEventListener('click',e=>{e.stopPropagation();setup();ctx.resume();A.forEach((a,j)=>{if(j!==k){a.pause();a.currentTime=0}});
  if(cur===k&&!A[k].paused){A[k].pause();cur=-1}else{A[k].currentTime=0;A[k].play();cur=k}Bt.forEach((x,j)=>x.classList.toggle('on',j===cur))}));
 A.forEach(a=>a.addEventListener('ended',()=>{cur=-1;Bt.forEach(x=>x.classList.remove('on'))}));
 const T=['<b>✓ No peito, a um palmo da boca.</b> Centralizado, preso na roupa, com o fio passando por dentro da camisa.','<b>✕ Na gola, colado no pescoço.</b> A voz sai abafada e o microfone roça na pele, no colar e na barba.','<b>✕ Na barriga ou no bolso.</b> Longe da boca, a voz fica fraca e o som da sala entra junto.'];
 function pin(k){Pn.forEach((p,j)=>p.classList.toggle('on',j===k));I.innerHTML=T[k];fio.setAttribute('opacity',k===0?.9:0);rg.setAttribute('opacity',k===0?1:0)}
 Pn.forEach((p,k)=>p.addEventListener('click',e=>{e.stopPropagation();pin(k)}));
 pin(0);
 new MutationObserver(()=>{if(!R.closest('.s').classList.contains('on')){A.forEach(a=>a.pause());cur=-1;Bt.forEach(x=>x.classList.remove('on'))}}).observe(R.closest('.s'),{attributes:true,attributeFilter:['class']});
});
