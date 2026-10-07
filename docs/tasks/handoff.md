# Shape Siege · 当前交接文档

更新日期：2026-10-07。唯一版本来源 VERSION，当前本地 0.15.0；上一线上已验证版本为 0.14.0。当前工作：用户批准适度战斗特效，强调不影响视觉和体验。

## 当前修改与关键文件

- src/game/feedback.ts、types.ts：独立装饰队列总上限 64，伤害标签 24，为死亡预留 8 槽；短时间命中合并，不延长标签寿命，不消耗实体编号与战斗随机流。
- combat.ts：依据实际扣血显示数字/暴击、受击节流、一次死亡碎片；亡灵爆炸怪不碎裂，原有伤害与掉落保持。
- world.ts、skills.ts：节流发射亮线、连锁闪电连接，模拟时间推进反馈；暂停/升级/礼包冻结，复活、结算、换关清理。
- render/geometry.ts：弹体短尾、受击亮边和两条碎光、射线淡出、横扫弧、冲击扩散；普通死亡 3 条碎片、精英 5 条。屏内最多 10 标签/18 装饰，低画质 4/6，数字避让；减少动态效果关闭新闪烁、上浮、飞散、拖尾。危险图层最上层，无新增震屏。
- tests/feedback.test.ts：实际伤害、暴击、合并寿命、死亡一次、亡灵、容量与预警、暂停/过期/换关/失败、减少动态效果。
- 设计：docs/superpowers/specs/2026-10-07-combat-feedback-design.md。用户在会话中已批准设计并要求视觉克制。

## 本轮验证

- 已验证：npm test 134 项通过；npm run build 包含类型检查与生产构建通过。沿用既有 Phaser 大文件提示，无新依赖。
- 已验证：Chrome 本地诊断对比默认/低画质/减少动态效果，实际战斗结算生成的反馈与红色预警清晰，三幅画布均正常。诊断页 .superpowers/combat-preview.html、截图 .superpowers/screenshots/combat-feedback-v0.15.0.png 是忽略产物，不代表正式对局或真人测试。
- 诊断页初次 Phaser 导入方式错误已修正；后续无新增 Console error。正式 v0.15.0 生产预览棱镜对局初始化、技能栏及实际自动攻击正常，00:02 达到 2 击杀，无正式对局 Console error。预览期间重建曾使旧页引用的动态包失效，刷新最终构建后恢复，不属于产品代码故障。
- 尚未验证：iOS Safari / Android Chrome 真机兼容、手机后期高压帧耗时、真人平衡；不能声称手机性能达标。

## 保留玩法与历史已验证状态

- 六英雄、随机多边形地图、连续闯关、经验多颗掉落、亡灵爆炸怪、下半屏全宽浮动摇杆、存档迁移与版本公告保持。织阵移动连线/闭环收束/固定五芒阵沿用 0.14.0。
- 上一版本 0.14.0 功能提交 2a10d8e，Actions 37556175299 测试/构建/部署成功，线上公告和织阵技能栏验证通过。这是历史发布证据，不是本轮测试。
- 过去脚本回放结果不代表真人胜率；过去手机浏览器布局诊断不代表真机性能验收。

## Git / 发布状态与下一步

Git main；仓库 https://github.com/somebodyvipvip-a11y/shape-siege；Pages https://somebodyvipvip-a11y.github.io/shape-siege/。
本轮 0.15.0 待提交/发布确认，遵循用户长期授权：新增主要功能完成验证后推送并更新 Pages，无需再次询问。纯发布状态补记不升级版本。
下一步：检查最终 diff → 提交 → 推送 → 确认对应 Actions 的 build/deploy 成功与线上 v0.15.0 → 补记发布状态。

## 启动与后续维护

Windows PowerShell：npm ci；npm run dev；npm test；npm run build。VERSION 改动后重启开发服务器；生产预览 npm exec vite preview -- --host 127.0.0.1 --port 4173。
每次独立修改按 AGENTS.md 更新 VERSION、根 CHANGELOG 和本交接，验证后创建 Conventional Commit。main 推送触发 pages.yml，PAGES_ENABLED=true。无账号、联机或局中保存；localStorage 为浏览器独立存档。
