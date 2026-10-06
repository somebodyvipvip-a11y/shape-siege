# 玩法改造方案：5 分钟单局 · 连续闯关 · 属性体系扩充

> 版本：`0.6.0 → 0.7.0`（唯一版本来源仍为根目录 `VERSION`）
> 本文既是实施方案，也是验收清单。若与实现冲突，以本文为准并同步修改。

## 一、背景与目标

当前一局是 12 分钟单关：击败首领即通关结束，血量归零即死亡结算。玩家缺少
「关卡推进」「容错」「属性成长层次」，刷怪节奏与掉落也过于单一。

本次改造目标：

1. 单局压缩为 **5 分钟一关**，按**时间节点**刷新怪物。
2. **连续闯关**：通关后不结束，进入更难的一关；每关结束发放**三选一大礼包**。
3. 引入 **命数与复活**，降低一次性失误的惩罚。
4. 扩充**掉落**（补血 / 生命上限）并做机制平衡。
5. 建立**属性体系**：幸运、暴击、闪避、护甲，并配套**卡牌稀有度 + 专属高级卡**。
6. HUD 精简、完整属性面板可通过 **Tab（电脑）/ 按钮（手机）** 查看。

## 二、单关时间轴（每关 5:00 = 300 秒）

| 时间 | 节点 | 刷怪阶段 |
| --- | --- | --- |
| 0:00 | 开局 | 初始围攻 · batch 1 · `chaser` |
| 0:30 | 追击者加入 | 初始围攻 · batch 1 · `chaser×2 + runner` |
| 1:00 | 重甲来袭 | 重甲来袭 · batch 2 · `chaser + runner + tank` |
| 1:30 | **地图事件①：精英试炼** | 精英围攻 · batch 2 · 全类型混合 |
| 2:00 | **阶段精英①：`elite-tank`** | 精英围攻 · batch 2 |
| 2:30 | 高压混战 | 高压混战 · batch 3 · 周期性减员 |
| 3:00 | **地图事件②：能量节点** | 高压混战 · batch 3 |
| 3:30 | **阶段精英②：`elite-charger`** | 高压混战 · batch 3 |
| 4:00 | **最终首领「六边核心」出现** | 六边核心 · 停止常规刷怪，改为首领召唤 |
| 4:00–5:00 | **通关窗口** | 击败首领 → 本关通过 |
| 5:00 | 时限到 | 首领未死 → 本关失败，本局结束 |
| 4:30 | 预警 | 提示「剩余 30 秒：击败六边核心」 |

对应配置（`src/game/config.ts`）：

```ts
export const STAGE_TIMES = { runners: 30, armor: 60, firstEvent: 90, firstElite: 120,
  pressure: 150, secondEvent: 180, secondElite: 210, boss: 240 } as const;
// CONFIG.timeout = 300, CONFIG.bossAt = STAGE_TIMES.boss (240)
// DIRECTOR.eliteTimes = [120, 210]；DIRECTOR.eventTimes = [90, 180]
```

`STAGES` 的 `at` 取 `0 / runners / armor / firstElite / pressure / boss`。
阶段名、batch、敌人池沿用现有结构，仅调整时间与组合。

## 三、连续闯关与难度缩放

- 新增 `GameState.stage: number`（本局当前关，从 1 开始）。
- **通关**：4:00 首领出现，5:00 前击败首领 → 本关通过。
- **失败**：5:00 到时首领未死 → `result = 'timeout'`，本局结束（UI 文案「未能击破核心」）。
- 通关后流程：清场（敌人 / 弹幕 / 特效 / 地图事件）→ 玩家移到地图中心 + 1.5 秒无敌
  → 弹出**大礼包**三选一 → 选择后进入下一关。
- 下一关重置：`time = 0`、`bossSpawned/bossDefeated = false`、`warning = null`、
  Director 时间轴锚点（`eliteTimes/eventTimes` 已触发集合、`spawnTimer`）全部重置。
- **保留**：等级、经验、技能、元素、各项属性加成、当前命数。

难度缩放（第 `n` 关，`n ≥ 1`；新增 `src/game/scaling.ts` 统一导出倍率）：

| 项目 | 倍率 |
| --- | --- |
| 敌人生命 | `1 + 0.35·(n-1)` |
| 敌人伤害 | `1 + 0.15·(n-1)` |
| 敌人速度 | `min(1.4, 1 + 0.04·(n-1))` |
| 精英 / 首领生命 | `1 + 0.50·(n-1)` |
| 掉落经验 | `1 + 0.15·(n-1)` |
| 刷怪间隔 | `max(0.55, 1 - 0.06·(n-1))` |

倍率在 `GameWorld.spawnEnemy`（生命/伤害/速度）与 `collectDeaths`（经验）中应用；
`n = 1` 时全部为 `1`，保证现有测试与手感不变。

## 四、命数与复活

新增配置与状态：

```ts
CONFIG.lives = 3; CONFIG.livesCap = 5; CONFIG.reviveDelay = 3;
CONFIG.reviveInvulnerable = 2.5; CONFIG.reviveClearRadius = 150;
GameState.lives: number        // 初始 CONFIG.lives
GameState.reviveTimer: number  // 0 = 存活；> 0 = 复活倒计时中
```

规则：

- 玩家 `hp ≤ 0` 时：
  - `lives > 1`：扣 1 条命，`reviveTimer = 3`，进入复活等待。
  - `lives === 1`：`result = 'death'`，本局结束。
- **复活等待期间**：世界继续推进（敌人、弹幕、特效照常更新），玩家不移动、
  不施法、不参与受伤判定（`damagePlayer` 已有 `hp <= 0` 早退，天然安全）。
- **复活瞬间**：`hp = maxHp`、`invulnerable = 2.5`、清除 `reviveClearRadius`
  内敌人（不给经验与掉落，避免复活即秒死）。
- HUD 常驻显示剩余命数（心形 × N），复活期间显示 3-2-1 倒计时横幅。
- 命数可通过大礼包「生命 +1」补充，上限 `livesCap = 5`。

判定集中在 `src/game/combat.ts` 的 `resolveResult()`，复活倒计时递减放在
`GameWorld.step()`。`step()` 中在玩家死亡期间跳过移动与技能释放两段。

## 五、掉落：补血 / 生命上限（机制平衡）

现状：仅 `heal`，2.5% 概率、固定 +15。改为：

| 掉落 | 触发条件 | 概率 | 数值 |
| --- | --- | --- | --- |
| **补血** `heal` | 仅当 `hp < maxHp` | `0.04 + 0.04·(1 - hp/maxHp)`（4%~8%） | `max(10, 12% maxHp)` |
| **生命上限** `maxhp` | 始终 | `0.009 + 0.0015·luck` | `+(6 + stage)` 最大生命与当前生命 |

幸运乘子：两者概率均再乘 `(1 + 0.08·luck)`。

**平衡原则**（写入代码注释与 CHANGELOG）：

- 补血 = **续航**：靠数量与「受伤越重掉率越高」的软保底，不提供永久强度；满血不产出，避免浪费。
- 生命上限 = **构筑**：永久收益，因此概率低一个数量级、单次收益小、受幸运加成。
- 目标产出：约每 100 次击杀 → 5~8 次补血、1~2 次生命上限。

实现：`Pickup.kind` 增加 `'maxhp'`（`src/game/types.ts`）；结算在
`GameWorld.updatePickups()`；渲染在 `src/render/geometry.ts` 掉落循环增加第三种
外观（金色偏心菱形，区别于补血的十字圆点）。

## 六、属性体系

四个新属性全部**初始为 0**，因此默认状态下现有战斗与测试的数值完全不变，
只能通过升级卡 / 大礼包 / 掉落获取。

| 属性 | 字段 | 范围 | 获取 |
| --- | --- | --- | --- |
| 幸运 | `Player.luck` | 0 ~ 10 | 大礼包、稀有卡、精英/首领掉落 |
| 暴击率 | `Player.critChance` | 0 ~ 0.6 | 升级卡 `stat:crit` +8% |
| 暴击倍率 | `Player.critMultiplier` | 1.5 ~ 2.5 | 升级卡 `stat:critDamage` +0.1 |
| 闪避 | `Player.dodge` | 0 ~ 0.4 | 升级卡 `stat:dodge` +5% |
| 护甲 | `Player.armor` | 0 ~ 20 | 升级卡 `stat:armor` +2 |
| 生命汲取 | `Player.lifesteal` | 0 ~ 0.05 | 稀有卡「生命汲取」 |

### 伤害结算顺序

**玩家 → 敌人**（`damageEnemy`）：暴击掷骰后 `amount *= critMultiplier`，
作用于**全部玩家伤害**（直接命中、燃烧、链伤、热冲击），按用户确认。
掷骰使用模拟流 `world.random()`，保持种子确定性。

**敌人 → 玩家**（`damagePlayer`）：

```
1. 闪避：仅接触伤害        amount *= (1 - dodge)
2. 护甲：全来源固定值减免   amount  = max(1, amount - armor)
3. 护盾吸收                shield → hp
4. 生命
```

三层防御职责不重叠：闪避（接触百分比）→ 护甲（全来源固定值）→ 护盾（吸收池）。

## 七、幸运值作用

1. **高级卡出现概率**：稀有卡抽取权重 `×(1 + 0.25·luck)`。
2. **掉落概率与品质**：掉落概率 `×(1 + 0.08·luck)`，数值在区间内取上界。
3. **额外重抽次数**：`重抽上限 = CONFIG.maxRerolls + floor(luck/2)`；
   幸运提升时把 `state.rerolls` 补足到新上限的差额。

## 八、卡牌稀有度与专属高级卡

- `UpgradeChoice` 增加 `rarity?: 'common' | 'rare'`。
- 现有「元素注入 / 行为强化 / 元素融合」标记为 `rare`，其余为 `common`。
- 新增**专属高级卡**（`luck ≥ 1` 才进入候选池，权重随幸运提升）：

| 卡 | 效果 |
| --- | --- |
| 技能跃升 | 随机一个已拥有技能 +2 级（不超过 `skillMaxLevel`） |
| 额外槽位 | 技能槽 +1（本局上限 6） |
| 生命汲取 | 每次击杀回复 `0.6% maxHp`（新字段 `Player.lifesteal`） |
| 幸运护符 | 幸运 +1 |

- `Progression.roll()` 从「均匀抽取」改为**加权抽取**（仍用升级流随机
  `choicesRandom`，保持与战斗随机独立），继续保证 3 张不重复，不足时用
  `stat:damage` 兜底。
- UI：`upgradeHTML` 给稀有卡加 `.upgrade-card.rare`（金色描边）+「稀有」角标。

## 九、大礼包（每关通关三选一）

独立奖池，每次抽 3 张不重复，幸运提高稀有条目权重：

`满血 + 生命上限 +20` / `生命 +1（上限 5）` / `幸运 +1` / `伤害 +12%` /
`冷却缩减 +8%` / `拾取范围 +50` / `移动速度 +8%` / `闪避 +5%` /
`护甲 +3` / `暴击率 +8%` / `随机技能 +1 级` / `重抽 +1`

## 十、属性面板（Tab / 手机按钮）

- HUD 常驻**精简 5 项**：生命、暴击率、闪避、护甲、幸运。
- **完整 9 项**（含移动速度、伤害加成、冷却缩减、拾取范围）：暂停面板、三选一面板。
- 新增完整属性面板：**电脑端 `Tab` 开关**、**手机端 HUD 增加「属性」按钮**。
- 需要改动 `src/input.ts`（Tab 键）、`src/app.ts`（新增 `Panel = 'stats'`）、
  `src/ui/overlays.ts`（`statsHTML`）、`src/ui/hud.ts`（按钮）、`src/ui/styles.css`。

## 十一、存档与结算

- `SaveData.best` 增加 `bestStage`，`stats` 增加 `bestStage`；用现有 `number()`
  安全回退，`schemaVersion` 保持 `1`（纯新增字段，向后兼容）。
- `SaveStore.finish()` 记录本局最高关卡。
- `resultHTML` 增加「到达关卡 N」与命数统计；`loadingHTML` 不变。

## 十二、测试计划

**需要更新的既有断言**（`tests/core.test.ts`）：

- L332-357：阶段边界 / `eliteTimes` / `eventTimes` / `bossAt` 全部改为新时间轴。
- L398-411、L412-420：`time = 720` → `300`；玩家死亡需先走命数逻辑。
- L421-440：种子长跑循环帧数按新时限调整。

**新增回归测试**：

1. 命数：首次死亡扣命并 3 秒后满血复活，`lives` 耗尽才判 `death`。
2. 复活期间玩家不移动、不受伤，世界照常推进。
3. 通关：击败首领进入下一关，`stage` 自增，保留等级与技能。
4. 难度缩放：第 2 关敌人生命 / 伤害高于第 1 关，`n = 1` 时倍率为 1。
5. 暴击：`critChance = 1` 时伤害 = 基础 × `critMultiplier`。
6. 防御结算顺序：闪避只减接触伤害、护甲全来源且有 1 点下限。
7. 掉落：补血满血不产出；概率落在设计区间内。
8. 幸运：稀有卡权重随幸运上升；重抽上限 = `maxRerolls + floor(luck/2)`。
9. 随机独立性：升级选项仍不受战斗随机影响（扩展既有断言）。

## 十三、实施阶段（每阶段独立验证 + 单一目的 commit）

1. **时间轴 + 连续闯关 + 大礼包骨架**（config / director / scaling / world / app / overlays / hud）
2. **命数与复活**（types / combat / world / hud）
3. **暴击 + 闪避 + 护甲**（types / config / combat / progression / shared）
4. **掉落平衡：补血 / 生命上限**（types / combat / world / geometry）
5. **幸运值 + 卡牌稀有度 + 专属高级卡 + 大礼包扩充**（progression / overlays / styles）
6. **完整属性面板（Tab / 手机按钮）+ 存档与结算收尾**
7. **`VERSION` → 0.7.0、`CHANGELOG.md`、汇总 commit**

每个阶段结束：`npm run typecheck && npm test && npm run build`，检查 diff，
更新 `VERSION`（按 SemVer）、补 `CHANGELOG`，Conventional Commit。

## 十四、端到端验证

- 静态检查：`npm run typecheck`、`npm test`（现有 70 项 + 新增回归全部通过）、`npm run build`。
- 浏览器实测（dev server `http://localhost:5173/`）：
  - 完整跑一局：核对 0:30 / 1:00 / 1:30 / 2:00 / 2:30 / 3:00 / 3:30 / 4:00 节点。
  - 4:00 首领出现，5:00 未击败 → 本局结束、显示「未能击破核心」。
  - 击败首领 → 大礼包三选一 → 进入第 2 关且敌人明显更强（关卡徽标显示）。
  - 故意送死：命数 3 → 2 → 1，每次 3 秒后复活；命数耗尽 → 结算。
  - 掉落观察：满血不掉补血；低血时补血明显增多；生命上限掉落稀有。
  - `Tab` 打开完整属性面板（电脑）；手机宽度下 HUD「属性」按钮可用。
- 移动端：旋转屏幕后布局正常，属性面板与按钮不重叠。

## 十五、风险与注意事项

- **种子确定性**：暴击掷骰必须走模拟流 `world.random()`；升级抽取必须继续走
  `choicesRandom`，两条流不可混用（现有测试 `升级选项随机与战斗随机独立` 保护此约束）。
- **性能**：新增掉落种类不增加每帧分配；属性面板复用现有 DOM 覆盖层按需渲染。
- **平衡**：所有新属性初始为 0，先保证不破坏现有手感，再通过卡池/礼包逐步投放。
- **不做**：不改地图尺寸与障碍、不引入多人、不改渲染管线。
