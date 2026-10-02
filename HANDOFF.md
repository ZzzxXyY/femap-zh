# 交接说明（简中战备地图）

- 页面框架已完成：index.html / app.js / style.css，`python3 tools/build_data.py` 由 data/map416.json（Game8 日文）+ data/names-zh.json（简中对照）生成 data.js。
- 游戏简中名：火焰纹章 万缕千丝（日：万紫千紅），赛奥朵拉篇。
- 待做：下载 https://fire-emblem-fw.site/data/map.json（简中游戏内原文；pins 字段 id/r/t/n/x/y/d/items，r="theodora" 共 285 个，底图 3328x2560，瓦片 img/map/zh6/{z}/{x}_{y}.webp），
  用坐标仿射拟合 + 采集物组合与 Game8 的 293 个地点逐点对齐，填 data/names-zh.json 的 places/items（含 cat：蔬菜/鱼/矿石/道具）与 types，每条记录来源。对不上的保持空，页面会显示日文并标注。
- 类型对照（fwsite types）：据点/小据点/迷宫/驿站/神殿/关卡/飨宴。
- 已核实：「战备增强委托」（游民星空 2213143），波拿帕尔特，帝都鞑古席翁。

## 2026-10-02 第二个线程补充
- 该线程的云端会话仍对 fire-emblem-fw.site / game8.jp / 7rm7h6jztv-cmd.github.io 返回 403（运行中的会话不套用新网络设置），需全新会话。
- 参考页源码可 `git clone https://github.com/7rm7h6jztv-cmd/FEMap`（GitHub 可达）；其数据就是 Game8 日文 map416.json，与本目录一致，无需重做框架。
- WebFetch 能读 fwsite map.json，但内容被截断（只到 id≈6042：据点/小据点/迷宫/驿站/神殿/关卡），采集点部分缺失，不可用作数据源；必须用 curl 整份下载。
- 不要用 web.archive.org 等镜像绕过网络策略（会被权限系统拒绝）。
- names-zh.json 仍为空，页面尚未改动。

## 2026-10-02 03:14 第三个线程
- 全新会话复测：fire-emblem-fw.site / game8.jp / 7rm7h6jztv-cmd.github.io 仍 403（代理 policy denial）。Eden 改的「允许所有域名」不是本项目云端环境的 Network access。已请 Eden 到 Project settings → environment 修改。
- 页面已含点击节点弹出可采集素材清单（按类别分组），只差简中译名数据。
- 03:16 项目设置里没有 Network access（默认环境）。已请 Eden 手动下载 fwsite map.json 上传到线程。

## 2026-10-02 03:35 完成（第三个线程）
- Eden 上传 fwsite map.json -> data/fwsite-map.json。流程：tools/align.py（仿射拟合 rms≈0.26）→ tools/items_map.py（共现推导素材对照）→ tools/build_data.py（人工修正表 SPOT_FIX 等，输出 data/names-zh.json + data.js）。
- 结果：292 个 Game8 地点有 291 个配上简中名（13 个取自凯伊/蕾达/迪托利希篇同位置地点）；仅「？？？」神殿无对应。另加入 fwsite 有而 Game8 没有的 7 个地点。素材 138 种，仅 オリハルコン/ネメアード/ハートボニート 无简中名（fwsite 没有）。
- 已发布 Artifact：https://claude.ai/artifact/Gx7GCHK61xvLCR2UkFt9mE （发布副本在会话 scratchpad，重建时用本目录文件去掉 html/head/body 外壳即可）。底图仍为 Game8 日文底图（fwsite 简中瓦片下载不到）。
- 03:50 新增「素材查找」分组多选下拉；单文件离线版：python3 tools/build_single.py -> dist/赛奥朵拉战备地图.html（约 1MB，全部内嵌）。
