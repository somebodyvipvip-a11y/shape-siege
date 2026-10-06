# Shape Siege（方块大战）

Shape Siege 意为“几何围攻”，是一款原创几何风格的单人浏览器生存游戏，支持电脑和手机。移动拾取经验，自动攻击怪潮，选择技能与元素构筑，突破重重包围。

私有 GitHub 仓库：[somebodyvipvip-a11y/shape-siege](https://github.com/somebodyvipvip-a11y/shape-siege)。

## 环境与 Windows 启动

推荐 Node.js 24 LTS 与 npm 11；最低 Node.js 22.12。依赖版本已锁定，首次启动在 PowerShell 执行：

```powershell
cd "C:\Users\KEy\Desktop\方块大战"
npm ci
npm run dev
```

打开终端显示的地址，默认是 http://localhost:5173/。如果端口被占用，Vite 会选择下一个端口，以终端实际地址为准。

手机与电脑连接同一局域网后，在电脑执行 `ipconfig`，找到当前 Wi-Fi/以太网的 IPv4 地址，例如 `192.168.1.20`，再在手机浏览器访问 `http://192.168.1.20:5173/`（使用实际开发端口）。开发服务器默认监听 `0.0.0.0`；若网络不通，检查路由器的设备隔离与 Windows 防火墙提示，自行允许可信的专用网络访问。项目不会自动修改防火墙。手机与电脑各自运行独立单人对局，无联机功能。

## 操作

| 操作 | 电脑 | 手机 |
| --- | --- | --- |
| 移动 | WASD / 方向键 | 左下摇杆 |
| 普通技能 | 空格 | 右下普通技能按钮 |
| 大招 | Q | 右下大招按钮 |
| 暂停/继续 | Esc / 右上暂停 | 右上暂停 / 继续按钮 |

基础攻击与通用技能自动释放；普通技能可在设置中开启自动释放，大招始终手动。浅蓝菱形是经验，绿色带十字圆形是治疗。敌方危险范围使用红色虚线与警示，己方范围使用细实线。

升级时战斗冻结，选择三张卡片之一，可使用每局两次重抽。2:00、5:00 出现可选地图事件；3:00、6:00 出现阶段精英；9:00 首领出现；12:00 尚未击破首领则失败。失焦、切换后台后立即暂停，返回后点击继续。旋转手机保留当前对局并清理旧输入。

默认圆形·星环可用；完成任意一局解锁正方形·堡垒；首次击杀阶段精英解锁三角形·锋刃。返回首页放弃正在进行的对局，不计入完成成绩。

## 构建、预览和验证

```powershell
npm run typecheck
npm test
npm run build
npm exec vite preview -- --host 0.0.0.0
```

`dist/` 为纯静态生产构建，可放入普通 HTTP 静态服务器。预览默认使用 http://localhost:4173/，以终端显示为准；不要直接双击 `dist/index.html`。无需后端、账号或外部素材服务。VERSION 是产品版本的唯一来源，在 Vite 配置加载时注入；修改 VERSION 后需重启开发服务器。

## 保存、设置与限制

- 此浏览器的 localStorage 保存设置、角色解锁、最好成绩及累计统计，不保存正在进行的对局。清理浏览器数据、换设备或访问不同来源地址会得到独立存档。
- 损坏、缺失、未知 schema 或不可用的存储会恢复安全值并提示，写入失败不阻止当前页面游玩；关闭页面后，未成功保存的数据可能丢失。
- 提供普通技能自动释放、音乐和音效独立音量、默认/低画质、减少动态效果及关闭震屏。声音由 WebAudio 合成，用户交互后启用，暂停与后台停止播放。
- 核心模拟固定 60Hz，最多追赶 5 步；等面积视野，极端比例留边，像素比限制在 1.5（低画质 1）。低画质仅减少装饰，不改变危险与战斗判定。
- 数值仍需持续正常试玩评估。未完成 iOS Safari、Android Chrome 真机兼容验收与后期高压场景帧耗时测量；不能据此宣称达到手机性能目标。
- 不支持账号同步、联机、排行榜或局中存档。

## GitHub Pages

`.github/workflows/pages.yml` 在推送到 `main` 时安装锁定依赖、运行测试并构建 `/shape-siege/` 子路径下的生产文件。发布只上传 `dist`，无需提交构建产物。本地开发仍使用 `/`。

当前发布状态：尚未上线。GitHub 返回 HTTP 422：当前账号套餐不支持此私有仓库的 Pages。仓库保持私有。

账号具备私有仓库 Pages 权限后，在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**，再添加仓库 Actions 变量 `PAGES_ENABLED=true`。最后在 **Actions → Publish GitHub Pages → Run workflow** 手动运行一次；此后的 `main` 推送会自动发布。未启用该变量时，工作流只构建并保存产物，不尝试发布。

预期地址为 `https://somebodyvipvip-a11y.github.io/shape-siege/`，以成功部署后的 Actions 输出为准。私有源代码仓库的 Pages 网站仍可能公开访问，详见 [GitHub Pages 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。
