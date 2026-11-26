
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

document.querySelectorAll('[data-jornada]').forEach(J=>{
 const T=[...J.querySelectorAll('.tl2')],P=[...J.querySelectorAll('.ps')];
 function at(n){T.forEach((t,k)=>t.classList.toggle('on',k===n));P.forEach((p,k)=>p.classList.toggle('on',k===n))}
 P.forEach((p,k)=>p.addEventListener('click',e=>{e.stopPropagation();at(k)}));
 J.querySelectorAll('[data-ir]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();at(+b.dataset.ir)}));
 at(0);
});
