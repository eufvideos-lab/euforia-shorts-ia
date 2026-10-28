import json,re,os,sys
S='/tmp/claude-0/-home-user/194ec43d-7873-53e8-8ec7-e0b71b96d08c/scratchpad/'
P=S+'vendas2/project/'
BASE=sys.argv[1]  # asset base url, ending with /
blobs={f.split('.')[0]:f for f in os.listdir(S+'site/blobs')}
ICON={
'CheckCircle':'<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
'Activity':'<path d="M3 12h4l3-8 4 16 3-8h4"/>',
'Trust':'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5L15.5 10"/>',
'Star':'<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
'Lock':'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
'Chat':'<path d="M4 5h16v11H9l-5 4z"/>'}
def icon(m):
    name=m.group(1); style=m.group(2)
    return f'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="{style};flex:none">{ICON[name]}</svg>'
d=json.load(open(P+'deck.json'))
out=[]
for sid in d['order']:
    h=open(P+f'slides/{sid}.html').read()
    h=re.sub(r'<aside>.*?</aside>','',h,flags=re.S)
    h=re.sub(r'<x-icon name="(\w+)" style="([^"]*)"></x-icon>',icon,h)
    assert '<x-icon' not in h, sid
    h=re.sub(r'/_blob/([0-9a-f]{32})',lambda m: BASE+blobs[m.group(1)],h)
    h=h.replace('<section ','<section class="slide" ',1)
    out.append(h)
tpl=open(S+'site/shell.html').read()
html=tpl.replace('<!--SLIDES-->','\n'.join(out))
open(S+'site/apresentacao.html','w').write(html)
print(len(html), len(out))
