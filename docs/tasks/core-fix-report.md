# 核心审查修复报告

状态：DONE（两项阻塞问题及阶段配置清理完成）。

修复提交：`6549fd3934770f983d7839ef8ecb8546d245ca23`，`fix: 修复敌人绕障与首领接触保护`。
基线：`1aa4d17`；分支：`feat/geometric-survival`。
版本：`0.2.0 → 0.2.1`；唯一来源仍为根目录 `VERSION`，已更新 `CHANGELOG.md`。
本报告在修复提交后写入，由控制器统一归档；未改动或暂存 `ui-brief.md`、`progress.md`。

## 改法与根因

- 原 steering 的固定侧偏转仅检查局部前视点，没有全局路径进展。原始默认地图、玩家 `(842.9008634,131.5168725)`、追击怪 `(2894.1033717,834.6706369)`、avoidSide=1，60 秒回归失败，距离平方为 `3412800.1889323103`（距玩家约 1847）。
- 新增 `src/game/navigation.ts`，对静态矩形障碍按敌人半径生成带 2 单位余量的安全角点可视图，每种半径共享静态边和目标最短路径；默认地图每图最多 64 个角点。目标移动时最多每 0.25 秒更新共享路径。直视目标直接追击，局部分离仍在 `director.ts`，最终运动仍经过现有 `moveBody` 防穿墙。
- 完整扫掠圆体检查包含矩形内部、圆角及地图边界；大体型无法站在玩家贴墙位置时使用附近合法目标。单步接近航点时限制位移，防止越过安全角点后卡住。导航无随机翻向，不改变随机流或固定 60 Hz 战斗步骤，也不改 `GameWorld` / `WorldAccess` / UI 状态契约。
- 原接触分类把任何 boss attack 都当成冲锋，导致扇形、爆破身体接触绕过 `invulnerable`。现在只有 `bossPattern===1` 使用独立命中记录，其余身体接触调用 `damagePlayer(damage, true)`，遵守 0.5 秒保护。
- `config.ts` 增加统一 `STAGE_TIMES` / `STAGES` / `stageAt`，阶段名称、批次、刷怪组合、缓和期以及事件、精英、首领时刻从同一配置来源读取。保留 35/120/180/300/360/540 秒边界、原组合权重和规则；现有 `CONFIG.bossAt`、`DIRECTOR.eliteTimes/eventTimes` 导出保持兼容。

## 验证命令与结果

环境：Windows PowerShell，使用项目已锁定依赖。

```text
npm test -- --run tests/core.test.ts -t '默认地图的长距离|首领扇形和爆破'
修复前：2 failed，确认为上述两个原始问题。

npm test -- --run tests/core.test.ts -t '默认地图的长距离|首领扇形和爆破|绕过挡路|普通和首领冲锋'
修复后：4 passed，24 skipped。

npm run typecheck
退出 0。

npm test
最终：Test Files 1 passed；Tests 31 passed；Duration 11.42s。

npm run build
tsc --noEmit 退出 0；vite 8.3.3 built in 111ms。
dist/index.html 0.28 kB；dist/assets/index-BlIskeC9.js 1.05 kB。

git diff --check
退出 0。

git diff --cached --check
退出 0。
```

新增回归覆盖完整默认地图原始坐标的最终接近（小于 80 单位，两种 avoidSide 结果一致）、11/23/38/60 半径在移动目标与贴墙目标下逐步保持合法并最终进入接触距离、薄墙/矩形角扫掠判定、首领扇形和爆破接触保护与不消费冲锋命中记录、阶段边界和原批次/组合。强化既有普通/首领冲锋测试，验证即使已有接触保护也只命中一次；完整持续种子模拟继续通过。

## 遗留问题与范围

- 此修复范围无已知阻塞。导航针对当前静态矩形岛屿地图；以后若增加动态障碍或不同地图拓扑，应重新验证缓存失效与连通性。
- 密集敌群的局部拥堵、真实设备帧耗时和正常生命完整通关平衡仍需后续试玩；本次完整模拟通过不代表这些验收已完成。
- 未启动第二个开发服务，也未改动渲染/UI。
- Git 写入按已授权流程使用升级权限完成；普通权限读取 Git 时仍提示全局 ignore 文件权限警告，未影响检查和提交。
