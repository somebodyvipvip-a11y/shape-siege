import { GameApp } from './app';
import './ui/styles.css';

declare const __APP_VERSION__: string;
new GameApp(document.querySelector<HTMLDivElement>('#app')!, __APP_VERSION__);
