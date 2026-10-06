# 战斗核心实现报告

状态：DONE_WITH_CONCERNS（核心必需逻辑已实现；平衡与设备验收尚未完成）。

实现提交：`ba12398cca9cb1253b43bf341fbb0c92a9c7b6f5`（`feat: 实现完整几何生存战斗核心`）。
版本：`0.1.0 → 0.2.0`，产品版本唯一来源为根目录 `VERSION`；`package.json` 为 private 且无产品 version。

## 实现清单

- 固定 60 Hz 模拟，单次 update 最多追赶 5 步，种子随机与独立升级随机流。
- 三角色基础攻击、普通技能与大招；普通技能手动/自动模式，三角形自动冲刺校验完整合法路径。
- 正方形四向弹、护盾与减伤领域；圆形轨道球、扩张与引力爆炸；三角形穿透刃、碰撞冲刺与五轮径向大招。
- 六通用技能与按等级的数量、范围、冷却或传导距离提升；每技能最多一次行为强化。
- 火/冰/雷注入及热冲击、电燃、冰链三种融合，副伤害明确禁止再次触发元素，燃烧仅保留更强伤害并刷新。
- 经验跨多级、逐次三选一、新技能槽限制、8 级上限、条件元素/行为/融合选择、每局两次重抽、生命/速度/拾取/冷却/伤害属性。
- 五普通怪、两阶段精英、首领扇形弹幕/锁向冲锋/延迟爆破；低血量缩短休息但保持预警时长；首领每 20 秒最多召唤 10 只追击怪，召唤同时存活最多 30。
- 2:00/5:00 地图事件、3:00/6:00 阶段精英、9:00 首领、11:30 倒计时提示、12:00 失败。
- 事件精英 90 秒限时、停留充能累计 20 秒且离开不倒扣；奖励免费选择，不改变等级与经验门槛。
- 空间网格、可复用格子/查询容器与原地压缩数组；250 普通敌人、400 玩家弹丸、150 敌方弹丸、300 特效与 300 掉落预算；经验同一区域合并。
- 3200×3200 地图、畅通出生区与宽通道、圆体/矩形障碍碰撞、快速移动分段防穿墙、局部绕障与分离。
- 在扩张了 120＋敌人半径的真实有效视野矩形外刷怪；边缘改选合法方向。
- 同次攻击命中记录、轨道球每颗对同目标 0.5 秒间隔、回旋刃出回程各一次；接触伤害保护与冲锋独立命中记录。
- 实际扣血伤害统计、玩家死亡优先首领死亡优先超时；首领死亡当步清除残余危险并冻结结果。
- 锁定 Phaser 3.90.0、Vite 8.3.3、TypeScript 7.0.2、Vitest 5.0.3；最小首页显示说明和构建注入版本。

## 界面接口契约

入口：`src/game/world.ts` 的 `GameWorld`，浏览器无关，不访问 DOM、Phaser 或 localStorage。

```ts
new GameWorld(characterId: 'square' | 'circle' | 'triangle' = 'circle', seed = 1)
world.update(dtSeconds, { x, y, skill, ultimate })
world.chooseUpgrade(choiceId): boolean
world.reroll(): boolean
world.setPaused(paused): void
world.setAutoSkill(enabled): void
world.setViewport(effectiveWorldWidth, effectiveWorldHeight): void
world.state
```

- 输入 x/y 限制到 -1…1，斜向归一化，保留摇杆小幅输入；skill/ultimate 按上升沿消费，长按不会重复施放。静止三角形沿最后有效方向冲刺，首次默认为向上；同次冲刺方向冻结。
- `state` 是共享模拟对象，界面遵循只读约定；所有操作通过公开命令。调试方法与可变状态仅供测试使用，不在产品展示作弊按钮。
- 升级时 `pendingUpgrades > 0`，状态时钟冻结；`choices` 包含 id/name/description/kind/skillId?/element?/currentLevel?。每次选择后如仍有待选立即产生下一组三选一。
- `state.player` 包含生命/护盾/能量、技能冷却、主动/大招持续时间、移动方向与 skills；`SkillState` 含 id/level/cooldown/elements/enhanced。
- 基础技能 ID：base-square、base-circle、base-triangle。通用技能 ID：homing、lightning、boomerang、mine、shockwave、meteor。
- `state.enemies` 含 id/kind/hp/maxHp/radius/state/timer/target/attackDirection/bossPattern。`warning` 状态可画沿冻结方向的预警，timer 为剩余秒数；bossPattern=0 扇形、1 冲锋、2 爆破。
- `state.effects` 含 owner（player/enemy）、kind、x/y/radius、delay/life/triggered；kind=warning 的敌方效果使用危险样式，己方落星使用细实线。战斗判定由模拟负责。
- `state.event` 含 elite/charge、位置、remaining、progress、enemyId；charge 的完成阈值为 CONFIG.chargeRequired（20 秒）。可用位置绘制屏外方向。
- `state.result`：null / victory / death / timeout；其余状态含 time/kills/level/xp/xpRequired/rerolls/phase/paused/warning/bossSpawned/bossDefeated/damageBySkill。
- `eliteKills` 只计阶段精英，排除 eventEnemy，可用于三角形解锁。首领从 enemies 中 kind=boss 读取血量。
- 渲染可直接使用 CONFIG/CHARACTERS/SKILLS/ENEMIES 的尺寸与数值；轨道球按模拟 time、轨道半径与技能等级绘制。此任务的最小 main 未将模拟绑定到首页，完整输入/渲染/保存属于后续界面任务。

## 验证证据

环境：Windows PowerShell，Node 24.19.0，npm 11.17.0。

最终运行：

```text
npm run typecheck
tsc --noEmit：退出 0

npm test
Test Files 1 passed (1)
Tests 26 passed (26)
Duration 6.44s

npm run build
tsc --noEmit：退出 0
vite v8.3.3：built in 57ms
dist/index.html 0.28 kB，dist/assets/index-hyZ7MTWs.js 1.05 kB

git diff --check
退出 0
git diff --cached --check
退出 0
```

测试文件 `tests/core.test.ts` 覆盖跨级经验、满槽/满级候选、额外构筑选项、重抽、暂停与独立随机、事件奖励、斜向移动、冲刺障碍/锁向、长按与追赶上限、攻击命中记录、接触保护、直线冲锋、敌人绕障、自动冲刺条件、元素副伤害/燃烧/首领冰减速/三融合、六技能真实伤害、三角色技能与大招、真实视野刷怪/实体上限、事件累计/超时/精英统计、胜负优先级及 565 秒持续种子模拟。

持续模拟用 seed=991、固定 1/60 秒，测试夹具提高生命以观察完整阶段。覆盖五普通怪、两种精英、两事件、首领及召唤；没有把此测试当作正常数值可通关的试玩证明。

自审修正：斜方向刷怪净距改为扩张视野矩形；敌人冲锋和玩家冲刺冻结方向；事件精英不计阶段精英；特效预算不在遍历中 splice 容器，避免跳过攻击；伤害统计只计实际扣血。

## 已知限制与疑虑

- 必需战斗逻辑无已知遗漏。首页为本任务要求的启动页；完整界面、Phaser 几何渲染、触控、音效与本地存档按任务划分由下一阶段完成。
- 敌人采用固定墙侧的局部转向与邻居分离，已验证可绕开挡路矩形；密集怪群拥堵仍需真实试玩，未实现全局寻路。
- 各实体预算限制新增发射，不删除仍可伤害的活动对象；装饰与己方效果为敌方危险预警留出预算。
- 数值尚未通过三角色正常生命完整通关试玩；手机、浏览器兼容、渲染性能与真机帧耗时未在本任务测量，不宣称达标。
- Git 在普通权限下对全局 ignore 文件有 Permission denied 提示，未影响项目 diff 检查；写 .git 使用经批准的升级权限完成。
