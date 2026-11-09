import { SaveStore } from '../core/save';
import type { RunSummary } from '../game/types';
import { dailySeed, type RunMode } from '../game/config/modes';

const CLOUD_KEY = 'neon-void-save-v2';

export interface OnlineRecord {
  rank: number;
  name: string;
  score: number;
}

interface YandexPlayer {
  saveData: (data: Record<string, unknown>) => Promise<void>;
  loadData: (keys: string[]) => Promise<Record<string, string>>;
}

interface YandexSDK {
  on?: (event: 'game_api_pause' | 'game_api_resume', listener: () => void) => void;
  getPlayer: (options: { scopes: boolean }) => Promise<YandexPlayer>;
  leaderboards: {
    setLeaderboardScore: (name: string, score: number) => Promise<void>;
    getLeaderboardEntries: (name: string, options: { quantityTop: number; quantityAround: number }) => Promise<{
      entries: Array<{ rank: number; score: number; player: { publicName: string } }>;
    }>;
  };
  screen?: {
    fullscreen?: {
      enter: () => Promise<void>;
      exit: () => Promise<void>;
    };
  };
}

declare global {
  interface Window {
    YaGames?: {
      init: () => Promise<YandexSDK>;
    };
  }
}

export class YandexPlatform {
  onDataChanged: (() => void) | undefined;
  onOnlineRecords: ((records: OnlineRecord[]) => void) | undefined;
  onPause: (() => void) | undefined;
  onResume: (() => void) | undefined;
  private sdk?: YandexSDK;
  private player?: YandexPlayer;
  private uploadTimer = 0;
  private initialized = false;

  constructor(private readonly save: SaveStore) {}

  get available(): boolean {
    return Boolean(this.sdk && this.player);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    const yandexHost = /(^|\.)yandex\.(ru|com|net|kz|by|uz)$/.test(window.location.hostname);
    if (!window.YaGames && !yandexHost && !new URLSearchParams(window.location.search).has('yandex')) return;
    try {
      await loadYandexScript();
      this.sdk = await window.YaGames!.init();
      this.sdk.on?.('game_api_pause', () => this.onPause?.());
      this.sdk.on?.('game_api_resume', () => this.onResume?.());
      this.player = await this.sdk.getPlayer({ scopes: false });
      await this.synchronize();
    } catch {
      this.sdk = undefined;
      this.player = undefined;
    }
  }

  scheduleUpload(): void {
    if (!this.player) return;
    window.clearTimeout(this.uploadTimer);
    this.uploadTimer = window.setTimeout(() => void this.upload(), 500);
  }

  async upload(): Promise<void> {
    if (!this.player) return;
    try {
      await this.player.saveData({ [CLOUD_KEY]: this.save.exportData() });
    } catch {
      // The next local save retries cloud synchronization.
    }
  }

  async recordRun(summary: RunSummary): Promise<void> {
    if (summary.training || !this.sdk) return;
    const leaderboard = summary.mode === 'daily' ? `neon_void_daily_${summary.seed}` : `neon_void_${summary.mode}`;
    await Promise.allSettled([
      this.sdk.leaderboards.setLeaderboardScore('neon_void_best', Math.floor(summary.score)),
      this.sdk.leaderboards.setLeaderboardScore(leaderboard, Math.floor(summary.score)),
    ]);
    await this.upload();
  }

  async showLeaderboard(mode: RunMode): Promise<void> {
    if (!this.sdk) {
      this.onOnlineRecords?.([]);
      return;
    }
    try {
      const response = await this.sdk.leaderboards.getLeaderboardEntries(this.leaderboardName(mode), { quantityTop: 8, quantityAround: 0 });
      this.onOnlineRecords?.(response.entries.map((entry) => ({ rank: entry.rank, name: entry.player.publicName || 'Игрок', score: entry.score })));
    } catch {
      this.onOnlineRecords?.([]);
    }
  }

  async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (this.sdk?.screen?.fullscreen) {
        await this.sdk.screen.fullscreen.enter();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Fullscreen can be denied by the embedding page without affecting gameplay.
    }
  }

  private async synchronize(): Promise<void> {
    if (!this.player) return;
    try {
      const response = await this.player.loadData([CLOUD_KEY]);
      const remote = response[CLOUD_KEY];
      if (remote) {
        const parsed = JSON.parse(remote) as { updatedAt?: number };
        if (typeof parsed.updatedAt === 'number' && parsed.updatedAt > this.save.data.updatedAt) {
          localStorage.setItem(CLOUD_KEY, remote);
          Object.assign(this.save.data, new SaveStore().data);
          this.onDataChanged?.();
          return;
        }
      }
    } catch {
      // Invalid or unavailable cloud data falls back to the valid local save.
    }
    await this.upload();
  }

  private leaderboardName(mode: RunMode): string {
    return mode === 'daily' ? `neon_void_daily_${dailySeed()}` : mode === 'standard' ? 'neon_void_best' : `neon_void_${mode}`;
  }
}

async function loadYandexScript(): Promise<void> {
  if (window.YaGames) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = window.setTimeout(() => {
      script.remove();
      reject(new Error('Yandex SDK timeout'));
    }, 5000);
    script.src = 'https://yandex.ru/games/sdk/v2';
    script.async = true;
    script.onload = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      script.remove();
      reject(new Error('Yandex SDK unavailable'));
    };
    document.head.appendChild(script);
  });
}
