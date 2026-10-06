# 任务 1：工程与可测试战斗核心

本任务是已批准开发步骤 1—4 的逻辑实现；界面与 Phaser 渲染由后续任务接入。工作目录 C:/Users/KEy/Desktop/方块大战，分支 feat/geometric-survival，基线 739143d。

## 必读需求

完整数值和规则见 docs/superpowers/specs/2026-10-06-block-battle-design.md 的第 5—8、10、12 节。必须读取这些节；不能将文档中的具体玩法简化为仅一种技能或无首领演示。

## 交付

- 工程：package.json（private，不另设产品 version）、锁文件、tsconfig、vite 配置、index.html、.gitignore；Phaser 3.90.0，Vite 8.3.3，TypeScript 7.0.2。Vitest 版本按 npm 实际稳定信息锁定。Node 已为 24.19.0。
- scripts 必须有 dev（--host 0.0.0.0）、build、typecheck、test。产品版本仅从 VERSION 读取注入 __APP_VERSION__。
- 使用浏览器无关 TypeScript 实现游戏模拟，放 src/game/：types.ts、config.ts、world.ts、combat.ts、skills.ts、progression.ts、director.ts、spatial.ts（可按职责增加小文件）。避免一个巨型文件。
- 起始提供最小 src/main.ts 显示首页说明和版本，后续界面任务会替换。
- 实现三角色、基础攻击、普通技能、大招、六通用技能、五敌人、精英/首领、时间阶段、两事件、经验/三选一/重抽/行为强化/元素融合、运动/障碍/命中/胜负，规则使用配置。
- 模拟应接收 seeded random 和固定 dt；暂停不改变模拟；渲染只读状态。用空间网格查近邻，复用对象池或可复用容器，限制实体、装饰和经验数量。

## 界面接口

尽快写 src/game/types.ts 与 src/game/world.ts 的导出接口，并发消息告知控制器契约已经确定。推荐导出 GameWorld 类，constructor(characterId, seed?)；update(dt, input)；chooseUpgrade(optionId)；reroll()；状态包括 player、enemies、projectiles、pickups、effects、obstacles、time、kills、level、pendingUpgrades、choices、result、event、damageBySkill。具体命名允许调整但必须在报告说明。

输入统一为 {x:number,y:number,skill:boolean,ultimate:boolean}，移动归一化；技能指令是单次事件，不能长按每帧重复触发。状态可支持只供测试使用的调试入口，但产品不暴露作弊按钮。

伤害结果有明确归属、元素副伤害不递归、同次攻击不重复命中、玩家归零优先于首领死亡优先于超时；首领死亡立刻清除危险。事件奖励不增加等级或经验门槛。

## 验证

为实际规则写必要 Vitest 测试：跨多级经验、槽满候选过滤/满级/重抽、元素不递归、同次攻击命中记录、暂停/时钟、斜向速度、冲刺撞障碍、首领死亡/玩家死亡/超时优先级。至少进行 seed 模拟覆盖早期/精英/首领阶段。不要测试仅断言代码常量的空泛测试。

运行 typecheck、test、build，检查 diff。将 VERSION 从 0.1.0 升至 0.2.0，更新 CHANGELOG 并 commit（Conventional Commit）。Git 作者已经配置。Git 操作如遇权限问题使用 require_escalated，npm 网络也可能需要升级权限；保持锁文件。

将结果写 docs/tasks/core-report.md：实现清单、接口契约、测试命令与输出、已知限制/具体遗漏、提交 SHA。最后仅回复状态、提交、测试和报告路径。缺失任何必需逻辑明确报告，不静默略过。
