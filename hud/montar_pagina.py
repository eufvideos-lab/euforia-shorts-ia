import base64, os, subprocess, sys
T = open('pagina-template.html').read()
foto = base64.b64encode(open('/tmp/claude-0/hudson.webp','rb').read()).decode()
T = T.replace('{{FOTO}}', foto)
blocos = []
for n in (1, 2, 3):
    src = f'saida/v{n}.mp4'
    web, poster = f'web{n}.mp4', f'poster{n}.jpg'
    if not os.path.exists(web) or os.path.getmtime(web) < os.path.getmtime(src):
        subprocess.run(['ffmpeg','-v','error','-y','-i',src,'-vf','scale=432:768','-c:v','libx264','-preset','slow','-crf','31','-profile:v','main','-pix_fmt','yuv420p','-c:a','aac','-b:a','64k','-movflags','+faststart',web], check=True)
        subprocess.run(['ffmpeg','-v','error','-y','-ss','0.5','-i',src,'-frames:v','1','-vf','scale=540:960','-q:v','5',poster], check=True)
    p64 = base64.b64encode(open(poster,'rb').read()).decode()
    v64 = base64.b64encode(open(web,'rb').read()).decode()
    T = T.replace('{{V%d}}' % n, f'<video id="v{n}" controls playsinline preload="none" poster="data:image/jpeg;base64,{p64}"></video><button class="play" data-v="{n}" aria-label="Assistir">▶</button>')
    blocos.append(f'<script type="text/plain" id="d{n}">{v64}</script>')
links = {'LINK_DEGUSTACAO': os.environ.get('L1', '#planos'), 'LINK_EMERGENCIAL': os.environ.get('L2', '#planos'), 'LINK_COMPLETO': os.environ.get('L3', '#planos')}
for k, v in links.items():
    T = T.replace('{{%s}}' % k, v)
js = '''<script>
document.querySelectorAll('.play').forEach(function(b){b.addEventListener('click',function(){
 var n=b.dataset.v,v=document.getElementById('v'+n);
 if(!v.src){var s=atob(document.getElementById('d'+n).textContent.trim()),a=new Uint8Array(s.length);for(var i=0;i<s.length;i++)a[i]=s.charCodeAt(i);
 v.src=URL.createObjectURL(new Blob([a],{type:'video/mp4'}));}
 b.style.display='none';v.play();});});
</script>'''
css = '<style>.play{position:absolute;inset:0;margin:auto;width:84px;height:84px;border-radius:50%;border:0;background:#4C50EC;color:#fff;font-size:34px;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.4);padding-left:6px}</style>'
T = T.replace('</head>', css + '</head>').replace('</body>', '\n'.join(blocos) + js + '</body>')
out = sys.argv[1]
open(out, 'w').write(T)
print(out, round(len(T)/1e6, 1), 'MB')
