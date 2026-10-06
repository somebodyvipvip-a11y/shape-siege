declare const __APP_VERSION__: string;
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<main><h1>方块大战</h1><p>几何竞技场 · 单人生存</p><p>战斗核心已就绪。WASD / 方向键移动，空格普通技能，Q 大招。</p><small>版本 ${__APP_VERSION__}</small></main>`;
document.body.style.cssText = 'margin:0;background:#0B1020;color:#F2F5FA;font-family:system-ui;display:grid;place-items:center;min-height:100vh';
