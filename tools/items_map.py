"""从已对齐的地点对推导采集物 日文→简中 对照：按共现 Jaccard 贪心一对一匹配。
输出 data/items_derived.json（每条带共现次数，供复核）。"""
import json, collections
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
a = json.load(open(ROOT/'data/align.json'))
BAD = {'死紫の花園'}
pairs = [(set(o['jitems']), set(o['zitems'])) for o in a['spots'] if o['fwid'] and o['ja'] not in BAD and (o['jitems'] or o['zitems'])]
pairs.append(({'リナリア','ハクサン'},{'姬金鱼草','哈库桑'}))  # 竜呼びの岬 ↔ 龙哮海岬
cj=collections.Counter(); cz=collections.Counter(); co=collections.Counter()
for js,zs in pairs:
    cj.update(js); cz.update(zs); co.update((j,z) for j in js for z in zs)
sc=sorted(((c/(cj[j]+cz[z]-c), c, j, z) for (j,z),c in co.items()), reverse=True)
m={}; usedz=set()
for jac,c,j,z in sc:
    if j in m or z in usedz: continue
    m[j]={'zh':z,'cooc':c,'ja_n':cj[j],'zh_n':cz[z],'jaccard':round(jac,2)}; usedz.add(z)
json.dump(m,open(ROOT/'data/items_derived.json','w'),ensure_ascii=False,indent=1)
print('unmapped ja:',sorted(set(cj)-m.keys())); print('unused zh:',sorted(set(cz)-usedz))
for j,v in sorted(m.items(), key=lambda x:x[1]['jaccard']):
    if v['jaccard']<1: print(j,v)
