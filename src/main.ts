import './style.css';
import './ui/loadout.css';
import './ui/features.css';
import { AudioManager } from './core/audio';
import { Input } from './core/input';
import { SaveStore } from './core/save';
import type { Game } from './game/Game';
import { Renderer } from './game/Renderer';
import { UI } from './ui/UI';
import { YandexPlatform } from './platform/yandex';

declare global {
  interface Window {
    __NEON_VOID__?: {
      game: Game;
      platform: YandexPlatform;
      levelUp: () => void;
      gameOver: () => void;
    };
  }
}

async function bootstrap(): Promise<void> {
  const host = document.querySelector<HTMLElement>('#game-canvas')!;
  const save = new SaveStore();
  save.refreshShipUnlocks();
  const renderer = new Renderer();
  try {
    await renderer.initialize(host, save.data.settings.quality);
  } catch (error) {
    const boot = document.querySelector<HTMLElement>('#boot-screen')!;
    boot.innerHTML = `<div class="boot-title">НЕ УДАЛОСЬ ЗАПУСТИТЬ WEBGL</div><p class="boot-error">Включите аппаратное ускорение или откройте игру в современном браузере.</p><button class="secondary-button" onclick="location.reload()">ПОВТОРИТЬ</button>`;
    console.error(error);
    return;
  }
  renderer.setSettings(save.data.settings);
  const input = new Input(host, save.data.settings);
  const audio = new AudioManager(save.data.settings);
  const { Game } = await import('./game/Game');
  const game = new Game(renderer, input, audio, save);
  const ui = new UI(game);
  const platform = new YandexPlatform(save);
  game.platform = platform;
  platform.onDataChanged = () => {
    save.refreshShipUnlocks();
    if (game.status === 'hangar') ui.updateHangar();
    else if (game.status === 'loadout') ui.showLoadout();
    else if (game.status === 'menu') ui.showMenu();
  };
  platform.onOnlineRecords = (records) => ui.showOnlineRecords(records);
  platform.onPause = () => game.setPlatformPause(true);
  platform.onResume = () => game.setPlatformPause(false);
  ui.onChallengesOpen = (mode) => void platform.showLeaderboard(mode);
  ui.onFullscreen = () => void platform.toggleFullscreen();
  save.onChange = () => {
    input.setSettings(save.data.settings);
    renderer.setSettings(save.data.settings);
    platform.scheduleUpload();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.status === 'playing') game.togglePause();
  });
  void platform.initialize();
  game.attachView(ui);
  game.start();
  if (import.meta.env.DEV) window.__NEON_VOID__ = { game, platform, levelUp: () => game.debugLevelUp(), gameOver: () => game.debugGameOver() };
  document.querySelector('#boot-screen')?.classList.add('loaded');
  window.setTimeout(() => document.querySelector('#boot-screen')?.remove(), 700);
}

void bootstrap();
