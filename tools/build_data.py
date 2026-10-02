"""生成 ../data.js：Game8 日文地图数据 × fire-emblem-fw.site 简中游戏内数据。

用法：
  python3 tools/align.py        # 坐标仿射拟合 + 逐点对齐 -> data/align.json
  python3 tools/items_map.py    # 由对齐结果推导素材 日→中 对照 -> data/items_derived.json
  python3 tools/build_data.py   # 合并人工修正，输出 data/names-zh.json 与 data.js

数据来源：
  地点・坐标・采集物（日文）: Game8 地图工具 416 (https://game8.jp/fe-banshisenko/816496) -> data/map416.json
  简中地名・素材（游戏内原文）: https://fire-emblem-fw.site/data/map.json -> data/fwsite-map.json（赛奥朵拉篇）
  战备增强任务（日文）: Game8 (https://game8.jp/fe-banshisenko/817097)，抄录于下方 MISSIONS
  不自行翻译：两边都对不上的条目保留日文，页面标注「日」。
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / "data"
AREA = "セオドラ"
COORD_SPACE = 256  # Game8 坐标为 256 单位，底图 3000px 见方

MISSIONS = {
    5: [("ヒシバナ", 5, 100), ("ホワイトトラウト", 20, 300)],
    6: [("玉鋼", 20, 320), ("メララ", 10, 320)],
    7: [("サンノミ", 30, 320), ("カーネボニート", 30, 320)],
    8: [("ハードフィッシュ", 10, 320), ("ラドンローチ", 35, 320)],
    9: [("ロカ", 35, 320), ("コーシャルーガー", 10, 350)],
    10: [("サバクキビ", 35, 350), ("毒石", 35, 350)],
    11: [("リルフィッシュ", 35, 350), ("海星石", 35, 350)],
}

# 人工复核后的地点修正：Game8 id -> fwsite pin id（None = 不对应任何简中地点）
SPOT_FIX = {
    "2182749": "10110",  # 竜の目の塔 ↔ 龙眼之塔（采集物一致；自动对齐误配到同坐标的无底沙穴）
    "2182753": "10095",  # 底無しの砂穴 ↔ 无底沙穴（同坐标，采集物「謎の箱/神秘箱」一致）
    "2183639": None,     # 死紫の花園：附近的「特洛伊亚祠」不是同一地点
}
SPOT_DROP = {"2189783"}  # Game8 重复的「竜の目の塔」（无采集物）
# 简中地名取自 fwsite 其他篇章的同名地点
SPOT_NAME_EXTRA = {"2183639": ("死紫花园", "fwsite pin 7015（凯伊篇同一地点）")}
NO_OTHER_ROUTE = {"死紫の花園", "？？？"}  # ？？？ 是神殿，最近的他篇地点是山口，不对应
# 坐标偏差较大、靠名称含义与采集物确认的对应
SPOT_PAIR_EXTRA = {"竜呼びの岬": "8117"}  # 龙哮海岬：采集物 姬金鱼草/哈库桑 ↔ リナリア/ハクサン 一致
# Game8 素材名笔误
ITEM_ALIAS = {"ユメナイ": "ユナメイ", "海星石太陽石": ["海星石", "太陽石"]}
ITEM_MANUAL = {
    "ユナメイ": ("尤那魅", "达玛先海岬、流浪者古庭两地均对应"),
    "アダマント": ("精金", "石ころの山 ↔ 碎石山（蕾达篇）采集物对应"),
    "ラーラン": ("拉朗", "叫びの海 ↔ 呼啸之海（迪托利希篇）采集物对应"),
}
# 赛奥朵拉篇 fwsite 没有、但其他篇章同一位置有的地点（距离 < 3.5 且采集物一致，已人工复核）
OTHER_ROUTE_MAX = 3.5


def main():
    g8 = [c for c in json.load(open(D / "map416.json", encoding="utf-8"))["coordinateArraySchema"]["coordinates"]
          if c["area"] == AREA]
    fw_all = json.load(open(D / "fwsite-map.json", encoding="utf-8"))
    fw = {p["id"]: p for p in fw_all["pins"] if p["r"] == "theodora"}
    align = json.load(open(D / "align.json", encoding="utf-8"))
    M = align["M"]
    derived = json.load(open(D / "items_derived.json", encoding="utf-8"))

    # 日→中 素材对照
    ja2zh = {j: v["zh"] for j, v in derived.items()}
    for j, (z, _) in ITEM_MANUAL.items():
        ja2zh[j] = z
    zh2ja = {}
    for j, z in ja2zh.items():
        zh2ja.setdefault(z, j)

    def norm_ja(items):
        out = []
        for i in items:
            i = i.strip()
            a = ITEM_ALIAS.get(i, i)
            out += a if isinstance(a, list) else [a]
        return [i for i in out if i]

    def key_of(ja):
        return ja2zh.get(ja, ja)

    # 素材类别：按该素材在 fwsite 哪类采集点出现最多
    from collections import Counter
    catc = {}
    for p in fw_all["pins"]:
        t = p["t"] if p["t"] in ("蔬菜", "鱼", "矿石", "道具") else ("矿石" if p["t"] == "迷宫" else None)
        if not t:
            continue
        for i in p["items"]:
            catc.setdefault(i, Counter())[t] += 2 if p["t"] != "迷宫" else 1

    g2f = {o["g8id"]: o["fwid"] for o in align["spots"]}
    g2f.update(SPOT_FIX)
    fw_any = {}
    for p in fw_all["pins"]:
        fw_any.setdefault(p["id"] + "@" + p["r"], p)
    import math
    tr = lambda p: (p["x"] * M[0][0] + p["y"] * M[1][0] + M[2][0], p["x"] * M[0][1] + p["y"] * M[1][1] + M[2][1])
    other = {}
    for c in g8:
        if g2f.get(c["id"]) or c["id"] in SPOT_FIX and c["id"] not in SPOT_NAME_EXTRA or c["title"] in SPOT_PAIR_EXTRA:
            continue
        gx = tuple(map(float, c["coordinate"].split(",")))
        best = min((p for p in fw_all["pins"] if p["r"] != "theodora"), key=lambda p: math.dist(tr(p), gx))
        if math.dist(tr(best), gx) < OTHER_ROUTE_MAX and c["title"] not in NO_OTHER_ROUTE:
            other[c["id"]] = best
    for c in g8:
        if c["title"] in SPOT_PAIR_EXTRA:
            g2f[c["id"]] = SPOT_PAIR_EXTRA[c["title"]]
    used = {v for v in g2f.values() if v}

    spots, place_log = [], {}
    for c in g8:
        if c["id"] in SPOT_DROP:
            continue
        desc = c["description"] or ""
        jitems = norm_ja(desc.split("：", 1)[1].split(":")) if desc.startswith("アイテム：") else []
        p = fw.get(g2f.get(c["id"]) or "") or other.get(c["id"])
        lat, lng = (float(v) for v in c["coordinate"].split(","))
        if p:
            items = [] if p["t"] == "驿站" else list(p["items"])
            for j in jitems:  # 补上 Game8 有而 fwsite 没列出的
                if key_of(j) not in items:
                    items.append(key_of(j))
            note = "\n".join(x for x in p.get("d", []) if not x.startswith("·") and x not in ("【探索素材】", "【矿石情报】", "【可达驿站】"))
            zh, typ, src = p["n"], p["t"], f"fwsite pin {p['id']}" + ("" if p["r"] == "theodora" else f"（{fw_all['maps'][p['r']]['name']}同一地点）")
        else:
            items = [key_of(j) for j in jitems]
            zh, src = SPOT_NAME_EXTRA.get(c["id"], ("", ""))
            typ = None
            note = ""
        spots.append({"id": c["id"], "ja": c["title"], "zh": zh, "type": typ, "g8type": c["classification"],
                      "note": note, "items": items,
                      "pos": [round(lat / COORD_SPACE, 5), round(lng / COORD_SPACE, 5)]})
        place_log[c["title"]] = {"zh": zh, "source": src} if zh else {"zh": "", "source": "fwsite 无对应地点"}

    # fwsite 有、Game8 没有的地点（坐标经仿射变换落到 Game8 底图）
    for fid, p in fw.items():
        if fid in used or p["t"] in ("马", "飞鸵", "天马", "飞龙"):
            continue
        lat = p["x"] * M[0][0] + p["y"] * M[1][0] + M[2][0]
        lng = p["x"] * M[0][1] + p["y"] * M[1][1] + M[2][1]
        spots.append({"id": "fw" + fid, "ja": "", "zh": p["n"], "type": p["t"], "g8type": "",
                      "note": "\n".join(x for x in p.get("d", []) if not x.startswith("·") and x not in ("【探索素材】", "【矿石情报】", "【可达驿站】")),
                      "items": [] if p["t"] == "驿站" else list(p["items"]), "pos": [round(lat / COORD_SPACE, 5), round(lng / COORD_SPACE, 5)],
                      "fwOnly": True})

    # 素材表
    items = {}
    for s in spots:
        for k in s["items"]:
            if k in items:
                continue
            is_zh = k in zh2ja or k not in ja2zh and any(k in p["items"] for p in fw.values())
            zh = k if is_zh else ""
            ja = zh2ja.get(k, "") if is_zh else k
            cat = catc[k].most_common(1)[0][0] if k in catc else ""
            items[k] = {"zh": zh, "ja": ja, "cat": cat}

    # fwsite 没有类别的素材（Game8 独有）：按出现地点的类型多数决
    GT = {"蔬菜": "蔬菜", "鱼": "鱼", "矿石": "矿石", "道具": "道具", "迷宫": "矿石"}
    for k, v in items.items():
        if not v["cat"]:
            c = Counter(GT.get(s["type"]) for s in spots if k in s["items"] and GT.get(s["type"]))
            v["cat"] = c.most_common(1)[0][0] if c else ""
    # Game8-only 地点的类型：按 Game8 分类，探索类按素材类别多数决
    G8TYPE = {"ダンジョン": "迷宫", "関所": "关卡", "準拠点": "小据点", "饗宴": "飨宴", "駅": "驿站", "神殿": "神殿", "拠点": "据点"}
    for s in spots:
        if s["type"]:
            continue
        if s["g8type"] == "探索":
            cats = Counter(items[k]["cat"] for k in s["items"] if items[k]["cat"])
            s["type"] = cats.most_common(1)[0][0] if cats else "道具"
        else:
            s["type"] = G8TYPE[s["g8type"]]

    missions = []
    for ch, lst in MISSIONS.items():
        for ja, qty, fame in lst:
            k = key_of(ja)
            n = sum(1 for s in spots if k in s["items"])
            if not n:
                print(f"WARNING: no spot yields {ja}", file=sys.stderr)
            missions.append({"chapter": ch, "item": k, "qty": qty, "fame": fame})

    types = {t: t for t in sorted({s["type"] for s in spots})}
    for s in spots:
        del s["g8type"]
    data = {"missions": missions, "items": items, "types": types, "spots": spots}
    (ROOT / "data.js").write_text(
        "// 由 tools/build_data.py 生成，请勿手动修改。\nwindow.FE_DATA = "
        + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")

    item_log = {j: {"zh": z, "source": "地点对齐后共现推导" if j in derived else ITEM_MANUAL[j][1],
                    **({k: derived[j][k] for k in ("cooc", "ja_n", "jaccard")} if j in derived else {})}
                for j, z in sorted(ja2zh.items())}
    json.dump({"places": place_log, "items": item_log}, open(D / "names-zh.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    g8n = [s for s in spots if not s.get("fwOnly")]
    print(f"spots: {len(g8n)} Game8（{sum(1 for s in g8n if s['zh'])} 有简中名）+ {len(spots) - len(g8n)} 仅 fwsite")
    unk = sorted(k for k, v in items.items() if not v["zh"])
    print(f"items: {len(items)}（{len(unk)} 无简中名：{unk}）")
    print("unnamed spots:", [s["ja"] for s in g8n if not s["zh"]])
    print("fw-only:", [(s["zh"], s["type"]) for s in spots if s.get("fwOnly")])


if __name__ == "__main__":
    main()
