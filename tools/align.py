"""对齐 Game8 日文地点 与 fire-emblem-fw.site 简中地点（赛奥朵拉篇）。
输出 data/align.json（供人工复核）。"""
import json, math, collections
from pathlib import Path
import numpy as np
ROOT = Path(__file__).resolve().parent.parent
g8 = [c for c in json.load(open(ROOT/'data/map416.json'))['coordinateArraySchema']['coordinates'] if c['area']=='セオドラ']
fw = [p for p in json.load(open(ROOT/'data/fwsite-map.json'))['pins'] if p['r']=='theodora']
ANCH = {'帝都ダグシオン':'帝都鞑古席翁','リベイラ村':'利贝拉村','フィーナの漁村':'菲那渔村','領都カッシート':'领都卡西托','コンロンの里':'昆仑之里'}
def g8xy(c): a,b = map(float,c['coordinate'].split(',')); return a,b
def fit(pairs):
    A = np.array([[p[0][0],p[0][1],1] for p in pairs]); B = np.array([p[1] for p in pairs])
    M,*_ = np.linalg.lstsq(A,B,rcond=None); return M
gby = {c['title']:c for c in g8}; fby = {p['n']:p for p in fw}
pairs = [((fby[z]['x'],fby[z]['y']), g8xy(gby[j])) for j,z in ANCH.items()]
M = fit(pairs)
def tr(p): return tuple(np.array([p['x'],p['y'],1])@M)
# 用最近邻互相匹配后再拟合一次
for it in range(3):
    pairs=[]
    for c in g8:
        gx=g8xy(c); best=min(fw,key=lambda p:math.dist(tr(p),gx))
        if math.dist(tr(best),gx)<1.5: pairs.append(((best['x'],best['y']),gx))
    M = fit(pairs)
    res=[math.dist(tuple(np.array([*a,1])@M),b) for a,b in pairs]; print('iter',it,len(pairs),'rms',np.sqrt(np.mean(np.square(res))))
TYPE = {'探索':{'蔬菜','鱼','矿石','道具'},'ダンジョン':{'迷宫'},'関所':{'关卡'},'準拠点':{'小据点','据点'},'饗宴':{'飨宴'},'駅':{'驿站'},'神殿':{'神殿'},'拠点':{'据点','小据点'}}
# 全局按距离贪心一对一
cand=[]
for c in g8:
    gx=g8xy(c)
    for p in fw:
        d=math.dist(tr(p),gx)
        if d<6: cand.append((d + (0 if p['t'] in TYPE[c['classification']] else 3), c['id'], p['id'], d))
cand.sort(); used_g=set(); used_f=set(); match={}
for s,gid,fid,d in cand:
    if gid in used_g or fid in used_f: continue
    used_g.add(gid); used_f.add(fid); match[gid]=(fid,d)
fid2=dict((p['id'],p) for p in fw)
out=[]
for c in g8:
    m=match.get(c['id']); p=fid2[m[0]] if m else None
    out.append({'g8id':c['id'],'ja':c['title'],'jtype':c['classification'],'fwid':p and p['id'],'zh':p and p['n'],'ztype':p and p['t'],'dist':m and round(m[1],2),
                'jitems':c['description'].split('：',1)[1].split(':') if c['description'].startswith('アイテム：') else [],'zitems':p['items'] if p else []})
un=[p for p in fw if p['id'] not in used_f]
json.dump({'M':M.tolist(),'spots':out,'fw_unmatched':[{'id':p['id'],'n':p['n'],'t':p['t'],'xy':[round(v,2) for v in tr(p)],'items':p['items']} for p in un]},open(ROOT/'data/align.json','w'),ensure_ascii=False,indent=1)
print('matched',len(match),'g8 unmatched',len(g8)-len(match),'fw unmatched',len(un))
print('dist hist',collections.Counter(min(int(m[1]),5) for m in match.values()))
print('type mismatch',sum(1 for o in out if o['fwid'] and o['ztype'] not in TYPE[o['jtype']]))
