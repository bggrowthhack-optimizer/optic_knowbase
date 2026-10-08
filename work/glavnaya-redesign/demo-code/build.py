import json,base64
D="/tmp/claude-0/-home-user-optic-knowbase/305574ce-e6be-5e33-84fe-13d1578ffffb/scratchpad/glavnaya-artifact/"
old=open(D+'glavnaya-exact.html').read()
js=old[old.rindex('<script>')+8:old.rindex('</script>')]
d=json.load(open(D+'capture.json'))
page=d['page'].replace(d['summaryClosed'],'<div id="summarySlot">'+d['summaryClosed']+'</div>',1)
b64=base64.b64encode(open(D+'logo.png','rb').read()).decode()
page=page.replace('src="/logo.png"','src="data:image/png;base64,'+b64+'"')
data={'summaryClosed':d['summaryClosed'],'summaryOpen':d['summaryOpen'],'analysis':d['analysis'],'overlay':d['overlay'],'settings':d['settings'],'filters':json.loads(d['filters']) if d['filters'] else None,'bodyClass':d['bodyClass'],'htmlClass':d['htmlClass'],'kpi':d.get('kpi',{}),'breakdown':{k:v for k,v in d.get('breakdown',{}).items() if k in d.get('kpi',{})}}
html='<title>Главная Optimizer</title>\n<style>'+d['css']+'\nhtml,body{background:var(--background)}</style>\n'+page+'\n<script type="application/json" id="cap">'+json.dumps(data,ensure_ascii=False).replace('</','<\\/')+'</script>\n<script>'+js+'</script>\n'
open(D+'glavnaya-exact.html','w').write(html); open(D+'glavnaya.html','w').write(html)
print(len(html)/1e6)
