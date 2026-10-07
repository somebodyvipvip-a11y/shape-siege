# Shape Siege · 当前交接文档

更新日期：2026-10-07。唯一版本来源 VERSION，本地 0.14.0；线上发布基线 0.13.2（06cde7b，工作流 37502097136）。本轮按用户批准方案重做织阵，使其与地雷区分。

## 交付规则

遵循 AGENTS.md：检查 diff、必要验证、SemVer、CHANGELOG 与本交接、Conventional Commit。用户长期授权大更新验证后自动更新 Pages；本轮织阵重做验证后发布，明确要求暂不发布时遵循最新指令。

## 本轮织阵重做

- 共用几何 src/game/weave.ts：顺序相邻连线、墙壁/360 距离断线、面积/自交检查闭环、线与多边形命中；复用 spatial 的点线距离/多边形/交叉判定。
- heroes/config/types/skills 接入移动布点（70 间距、6/8 容量、8 秒存活）、穿线每敌 0.65 秒一次 32 伤害及 0.6 秒减速、阵线收束（120，闭环包含内部）、五芒阵（固定五边形、0.5 秒 24、3 秒单次 150）。普通技能冷却仍 8 秒，自动收束避免过早消耗未形成阵线。
- render/geometry 画实际有效连线、闭环浅填充、节点、五芒线与收束动画；UI 和 README 改名及玩法说明；地雷和其他英雄保留。批准设计 docs/superpowers/specs/2026-10-07-weave-redesign.md。
- npm test 125 项、类型检查/生产构建通过。英雄测试扩展站立/容量替换/强化立即生效/过期、单敌多线/减速/墙壁、开放链/闭环/自交、收束一次伤害/消耗、大招持续/固定/五边形边界/首领减速/最终一次爆发。
- 织阵 casual 回放种子 20261006/73/991：3/3 通关，267/253/252 秒，均剩 3 命。属于脚本策略证据，不能视作真人胜率或性能达标。
- Chrome 390×844 本地诊断页面展示完整闭环与五芒阵；收束阵内生命 3000→2880、阵外保持 3000，首次五芒脉冲到 2856，未发现 Console error；正式生产预览中织阵的新技能栏和按钮也验证通过。诊断在 .superpowers/weave-preview.html（忽略产物），不属于正式产品对局。

## 保留的六英雄与关键文件

原有三英雄保持功能与解锁条件，新增菱形、五边形、六边形初始可选。

- 菱形：100 生命/225 移速/15% 暴击。射线优先精英/首领，命中折射；镜面跃迁不穿墙，两秒普通怪镜像；大招 0.6 秒预警后宽射线。地形截断与渲染长度一致。
- 五边形：140 生命/200 移速/8% 冷却缩减/幸运 1。追踪符点与符点连阵、阵线收束、固定五芒阵；详见本轮规则。
- 六边形：210 生命/165 移速/护甲 2/伤害加成 8%。扇形横扫、击退裂纹；蓄力 0.4 秒期间减伤 25%，随后重击；五秒过载提高横扫频率和范围，结束震地。实心六边形/锤标记区别于首领。
- 新逻辑集中 src/game/heroes.ts，skills/director/combat 通过入口接入；types/config 定义统一属性，storage 迁移初始角色，menu/shared/geometry 补齐六角色与图形，保留原设置与成绩。
- 原有随机地形、浮动摇杆、经验颗粒、亡灵爆炸怪、连续闯关和首次公告保留。旧版变化见 CHANGELOG；设计见 docs/superpowers/specs/2026-10-07-six-heroes-mobile-design.md。

## 验证

- npm test：125 项通过，包含技能容量奖励空槽刷新回归（修复前失败，修复后通过）。tests/heroes.test.ts 覆盖迁移、射线/折射/地形、闪现镜像、延迟、法阵容量/单次伤害/减速/引爆、固定阵地、扇形/减伤/过载、暂停与清场。
- npm run build：类型检查与构建通过，既有 Phaser 大文件提示保留。
- 三新角色，各种子 20261006/73/991、随机选牌/真实生命/自动普通技能：9/9 脚本通关，251–276 秒，不代表真人胜率。输出在忽略的 .superpowers/balance-results.json。scripts/balance.replay.ts 支持 BALANCE_CHARACTERS 指定角色，默认覆盖六个。
- 初次浏览器自动审批超时后，本地验收恢复。Chrome 生产预览验证新角色选择、暂停、属性菜单；320×568/360×800 竖屏，800×400/521×320 横屏布局与 DOM 尺寸检查。诊断场景检查六槽、元素、99 关、99999 击杀、首领/预警/事件同时存在，无越界重叠。真实手机安全区与兼容性能尚未验收。

## 发布与尚需验证

1. 手机布局已修复：44px 状态/按钮、等宽技能槽、横屏适配、提示区域与复活倒计时分离；全量属性通过按钮查看。历史英雄提交 69323c5，手机排版 2656416，下半屏全宽操控 d20ca85 已保留。
2. 上轮 0.13.1 发布已完成：工作流 37498955633 的测试、构建、部署成功；线上公告 v0.13.1、六英雄入口及 360×800 六边形对局验证，暂停/属性按钮 44×44。截图 .superpowers/screenshots/pages-v0.13.1-mobile.png（本地忽略产物）。
3. 真机 iOS Safari/Android Chrome、真人平衡、手机后期帧耗时仍待验证。

## 启动与发布

Node.js 24/npm 11，PowerShell：npm ci；npm run dev；npm test；npm run build。VERSION 改动后重启 dev；可用 npm exec vite preview -- --host 127.0.0.1 --port 4173 预览生产包，端口以输出为准。

Git main，仓库 https://github.com/somebodyvipvip-a11y/shape-siege，Pages https://somebodyvipvip-a11y.github.io/shape-siege/。推送触发 pages.yml 安装、测试、构建、部署，PAGES_ENABLED=true。0.13.1 最终工作流 37499364169 成功；0.13.2 最终提交 06cde7b 与工作流 37502097136 成功；本轮 0.14.0 待提交发布。后续仅发布记录补记不改动 VERSION。

回放：设置 BALANCE_POLICY=casual 和可选 BALANCE_CHARACTERS=diamond,pentagon,hexagon，运行 npm exec vitest run -- --config scripts/balance.config.ts，结束清除环境变量。无账号/联机/局中保存，localStorage 为浏览器独立存档。
