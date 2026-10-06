# Shape Siege · 当前交接文档

更新日期：2026-10-07。唯一版本来源 VERSION，本地 0.13.0；已验证线上 0.12.1，发布基线 66bb070。本轮加入三个已批准角色，并修复手机暂停/属性/关卡/技能栏排版。

## 交付规则

遵循 AGENTS.md：检查 diff、必要验证、SemVer、CHANGELOG 与本交接、Conventional Commit。用户长期授权大更新验证后自动更新 Pages；本轮两个改动完成后一起发布，明确要求暂不发布时遵循最新指令。

## 实现与关键文件

原有三英雄保持功能与解锁条件，新增菱形、五边形、六边形初始可选。

- 菱形：100 生命/225 移速/15% 暴击。射线优先精英/首领，命中折射；镜面跃迁不穿墙，两秒普通怪镜像；大招 0.6 秒预警后宽射线。地形截断与渲染长度一致。
- 五边形：140 生命/200 移速/8% 冷却缩减/幸运 1。追踪符点、最多六阵，触发 0.45 秒后爆炸减速；可提前引爆，无阵布置一阵；大招固定减速区，三秒后五阵爆炸。
- 六边形：210 生命/165 移速/护甲 2/伤害加成 8%。扇形横扫、击退裂纹；蓄力 0.4 秒期间减伤 25%，随后重击；五秒过载提高横扫频率和范围，结束震地。实心六边形/锤标记区别于首领。
- 新逻辑集中 src/game/heroes.ts，skills/director/combat 通过入口接入；types/config 定义统一属性，storage 迁移初始角色，menu/shared/geometry 补齐六角色与图形，保留原设置与成绩。
- 原有随机地形、浮动摇杆、经验颗粒、亡灵爆炸怪、连续闯关和首次公告保留。旧版变化见 CHANGELOG；设计见 docs/superpowers/specs/2026-10-07-six-heroes-mobile-design.md。

## 验证

- npm test：121 项通过。tests/heroes.test.ts 覆盖迁移、射线/折射/地形、闪现镜像、延迟、法阵容量/单次伤害/减速/引爆、固定阵地、扇形/减伤/过载、暂停与清场。
- npm run build：类型检查与构建通过，既有 Phaser 大文件提示保留。
- 三新角色，各种子 20261006/73/991、随机选牌/真实生命/自动普通技能：9/9 脚本通关，251–276 秒，不代表真人胜率。输出在忽略的 .superpowers/balance-results.json。scripts/balance.replay.ts 支持 BALANCE_CHARACTERS 指定角色，默认覆盖六个。
- 线上与本地浏览器自动审批均超时，暂未取得本轮实际画面，不能声称视觉和手机布局已验收。

## 尚需完成

1. 手机布局：修复块布局、绝对定位、56px 按钮与小徽章的混用，验证竖屏、横屏、六槽与安全区。
2. 完成后推送并检查对应 Pages workflow 与实际线上版本，更新发布记录。
3. 真机 iOS Safari/Android Chrome、真人平衡、手机后期帧耗时仍待验证。

## 启动与发布

Node.js 24/npm 11，PowerShell：npm ci；npm run dev；npm test；npm run build。VERSION 改动后重启 dev；可用 npm exec vite preview -- --host 127.0.0.1 --port 4173 预览生产包，端口以输出为准。

Git main，仓库 https://github.com/somebodyvipvip-a11y/shape-siege，Pages https://somebodyvipvip-a11y.github.io/shape-siege/。推送触发 pages.yml 安装、测试、构建、部署，PAGES_ENABLED=true。最后已验证 0.12.1 工作流 37490988991，本轮尚未推送。

回放：设置 BALANCE_POLICY=casual 和可选 BALANCE_CHARACTERS=diamond,pentagon,hexagon，运行 npm exec vitest run -- --config scripts/balance.config.ts，结束清除环境变量。无账号/联机/局中保存，localStorage 为浏览器独立存档。
