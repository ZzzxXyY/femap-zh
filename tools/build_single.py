"""把页面打包成单一 HTML（脚本、样式、底图全部内嵌），输出 dist/赛奥朵拉战备地图.html。
用法：python3 tools/build_single.py（先跑 build_data.py）"""
import base64, os, re
from pathlib import Path
os.chdir(Path(__file__).resolve().parent.parent)
r = lambda f: open(f, encoding='utf-8').read()
s = r('index.html')
img = 'data:image/webp;base64,' + base64.b64encode(open('img/worldmap.webp', 'rb').read()).decode()
app = r('app.js').replace("'img/worldmap.webp'", "WORLDMAP_SRC")
assert 'WORLDMAP_SRC' in app

def png(m):
    f = 'vendor/leaflet/' + m.group(1)
    return 'url(data:image/png;base64,' + base64.b64encode(open(f, 'rb').read()).decode() + ')' if os.path.exists(f) else 'none'

lcss = re.sub(r'url\((images/[\w-]+\.png)\)', png, r('vendor/leaflet/leaflet.css'))
for a, b in [
    ('<link rel="stylesheet" href="vendor/leaflet/leaflet.css">', '<style>\n' + lcss + '\n</style>'),
    ('<link rel="stylesheet" href="style.css">', '<style>\n' + r('style.css') + '\n</style>'),
    ('<script src="vendor/leaflet/leaflet.js"></script>', '<script>\n' + r('vendor/leaflet/leaflet.js') + '\n</script>'),
    ('<script src="data.js"></script>', '<script>\n' + r('data.js') + '\nvar WORLDMAP_SRC = "' + img + '";\n</script>'),
    ('<script src="app.js"></script>', '<script>\n' + app + '\n</script>'),
]:
    assert a in s, a
    s = s.replace(a, lambda _m=None, b=b: b) if False else s.replace(a, b)
os.makedirs('dist', exist_ok=True)
out = 'dist/赛奥朵拉战备地图.html'
open(out, 'w', encoding='utf-8').write(s)
print(out, len(s.encode()) // 1024, 'KB')
