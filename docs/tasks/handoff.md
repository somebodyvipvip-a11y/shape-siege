# Shape Siege · 当前交接文档

更新日期：2026-10-07。唯一版本来源 VERSION，本地与已验证线上均为 0.13.1，功能发布提交 2656416（英雄提交 69323c5）。本轮加入三个已批准角色，并修复手机暂停/属性/关卡/技能栏排版。

## 交付规则

遵循 AGENTS.md：检查 diff、必要验证、SemVer、CHANGELOG 与本交接、Conventional Commit。用户长期授权大更新验证后自动更新 Pages；本轮两个独立改动已一起发布，明确要求暂不发布时遵循最新指令。

## 实现与关键文件

原有三英雄保持功能与解锁条件，新增菱形、五边形、六边形初始可选。

- 菱形：100 生命/225 移速/15% 暴击。射线优先精英/首领，命中折射；镜面跃迁不穿墙，两秒普通怪镜像；大招 0.6 秒预警后宽射线。地形截断与渲染长度一致。
- 五边形：140 生命/200 移速/8% 冷却缩减/幸运 1。追踪符点、最多六阵，触发 0.45 秒后爆炸减速；可提前引爆，无阵布置一阵；大招固定减速区，三秒后五阵爆炸。
- 六边形：210 生命/165 移速/护甲 2/伤害加成 8%。扇形横扫、击退裂纹；蓄力 0.4 秒期间减伤 25%，随后重击；五秒过载提高横扫频率和范围，结束震地。实心六边形/锤标记区别于首领。
- 新逻辑集中 src/game/heroes.ts，skills/director/combat 通过入口接入；types/config 定义统一属性，storage 迁移初始角色，menu/shared/geometry 补齐六角色与图形，保留原设置与成绩。
- 原有随机地形、浮动摇杆、经验颗粒、亡灵爆炸怪、连续闯关和首次公告保留。旧版变化见 CHANGELOG；设计见 docs/superpowers/specs/2026-10-07-six-heroes-mobile-design.md。

## 验证

- npm test：122 项通过，包含技能容量奖励空槽刷新回归（修复前失败，修复后通过）。tests/heroes.test.ts 覆盖迁移、射线/折射/地形、闪现镜像、延迟、法阵容量/单次伤害/减速/引爆、固定阵地、扇形/减伤/过载、暂停与清场。
- npm run build：类型检查与构建通过，既有 Phaser 大文件提示保留。
- 三新角色，各种子 20261006/73/991、随机选牌/真实生命/自动普通技能：9/9 脚本通关，251–276 秒，不代表真人胜率。输出在忽略的 .superpowers/balance-results.json。scripts/balance.replay.ts 支持 BALANCE_CHARACTERS 指定角色，默认覆盖六个。
- 初次浏览器自动审批超时后，本地验收恢复。Chrome 生产预览验证新角色选择、暂停、属性菜单；320×568/360×800 竖屏，800×400/521×320 横屏布局与 DOM 尺寸检查。诊断场景检查六槽、元素、99 关、99999 击杀、首领/预警/事件同时存在，无越界重叠。真实手机安全区与兼容性能尚未验收。

## 尚需完成

1. 手机布局已修复：44px 状态/按钮、等宽技能槽、横屏适配、提示区域与复活倒计时分离；全量属性通过按钮查看。英雄提交 69323c5，手机修复作为独立补丁提交。
2. 发布已完成：工作流 37498955633 的测试、构建、部署成功；线上公告 v0.13.1、六新英雄入口及 360×800 六边形对局验证，暂停/属性按钮 44×44。截图 .superpowers/screenshots/pages-v0.13.1-mobile.png（本地忽略产物）。
3. 真机 iOS Safari/Android Chrome、真人平衡、手机后期帧耗时仍待验证。

## 启动与发布

Node.js 24/npm 11，PowerShell：npm ci；npm run dev；npm test；npm run build。VERSION 改动后重启 dev；可用 npm exec vite preview -- --host 127.0.0.1 --port 4173 预览生产包，端口以输出为准。

Git main，仓库 https://github.com/somebodyvipvip-a11y/shape-siege，Pages https://somebodyvipvip-a11y.github.io/shape-siege/。推送触发 pages.yml 安装、测试、构建、部署，PAGES_ENABLED=true。本轮已验证 0.13.1 工作流 37498955633，功能提交 2656416。后续仅发布记录提交不会改动 VERSION。

回放：设置 BALANCE_POLICY=casual 和可选 BALANCE_CHARACTERS=diamond,pentagon,hexagon，运行 npm exec vitest run -- --config scripts/balance.config.ts，结束清除环境变量。无账号/联机/局中保存，localStorage 为浏览器独立存档。
