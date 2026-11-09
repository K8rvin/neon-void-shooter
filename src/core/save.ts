import type { Difficulty, RunSummary } from '../game/types';
import { SHIP_LIST } from '../game/config/ships';
import type { ShipId } from '../game/config/ships';
import type { RunMode } from '../game/config/modes';
import { EVOLUTIONS } from '../game/config/upgrades';
import { augmentById, runMasteryXp } from '../game/config/mastery';
import type { ShipAugmentId, ShipMasteryRecord } from '../game/config/mastery';

export interface RunRecord {
  score: number;
  wave: number;
  kills: number;
  time: number;
  mode: RunMode;
  seed: number;
  threat: number;
}

export type QualitySetting = 'auto' | 'high' | 'medium' | 'low';

export interface GameSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  screenShake: boolean;
  damageNumbers: boolean;
  quality: QualitySetting;
  particles: number;
}

export interface SaveData {
  version: 3;
  cores: number;
  bestScore: number;
  bestWave: number;
  totalKills: number;
  runs: number;
  victories: number;
  meta: Record<string, number>;
  settings: GameSettings;
  lastDifficulty: Difficulty;
  unlockedShips: ShipId[];
  selectedShip: ShipId;
  discoveredEvolutions: string[];
  shipMastery: Partial<Record<ShipId, ShipMasteryRecord>>;
  selectedAugments: Partial<Record<ShipId, ShipAugmentId>>;
  tutorialComplete: boolean;
  modeRecords: Record<string, RunRecord>;
  achievements: string[];
  updatedAt: number;
}

const STORAGE_KEY = 'neon-void-save-v2';

export const defaultSettings: GameSettings = {
  masterVolume: 0.7,
  musicVolume: 0.35,
  sfxVolume: 0.65,
  screenShake: true,
  damageNumbers: true,
  quality: 'auto',
  particles: 1,
};

function finite(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function defaults(): SaveData {
  return {
    version: 3,
    cores: 0,
    bestScore: 0,
    bestWave: 0,
    totalKills: 0,
    runs: 0,
    victories: 0,
    meta: {},
    settings: { ...defaultSettings },
    lastDifficulty: 'veteran',
    unlockedShips: ['interceptor'],
    selectedShip: 'interceptor',
    discoveredEvolutions: [],
    shipMastery: {},
    selectedAugments: {},
    tutorialComplete: false,
    modeRecords: {},
    achievements: [],
    updatedAt: 0,
  };
}

export class SaveStore {
  readonly data: SaveData;
  onChange: (() => void) | undefined;

  constructor() {
    this.data = this.load();
  }

  save(): void {
    this.data.updatedAt = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // The game remains playable when storage is disabled.
    }
    this.onChange?.();
  }

  exportData(): string {
    return JSON.stringify(this.data);
  }

  purchase(id: string, cost: number): boolean {
    if (!Number.isSafeInteger(cost) || cost < 0 || this.data.cores < cost) return false;
    this.data.cores -= cost;
    this.data.meta[id] = (this.data.meta[id] ?? 0) + 1;
    this.save();
    return true;
  }

  unlockShip(id: ShipId, cost: number): boolean {
    if (this.data.unlockedShips.includes(id)) {
      this.data.selectedShip = id;
      this.save();
      return true;
    }
    if (!Number.isSafeInteger(cost) || cost < 0 || this.data.cores < cost) return false;
    this.data.cores -= cost;
    this.data.unlockedShips.push(id);
    this.data.selectedShip = id;
    this.save();
    return true;
  }

  selectShip(id: ShipId): boolean {
    if (!this.data.unlockedShips.includes(id)) return false;
    this.data.selectedShip = id;
    this.save();
    return true;
  }

  refreshShipUnlocks(): ShipId[] {
    const unlocked: ShipId[] = [];
    for (const ship of SHIP_LIST) {
      if (this.data.bestWave >= ship.unlockWave && !this.data.unlockedShips.includes(ship.id)) {
        this.data.unlockedShips.push(ship.id);
        unlocked.push(ship.id);
      }
    }
    if (unlocked.length > 0) this.save();
    return unlocked;
  }

  discoverEvolution(id: string): boolean {
    if (!EVOLUTIONS.some((definition) => definition.id === id) || this.data.discoveredEvolutions.includes(id)) return false;
    this.data.discoveredEvolutions.push(id);
    this.save();
    return true;
  }

  selectShipAugment(ship: ShipId, id: ShipAugmentId | null): boolean {
    if (id === null) {
      delete this.data.selectedAugments[ship];
      this.save();
      return true;
    }
    const definition = augmentById(id);
    if (!definition || definition.ship !== ship || (this.data.shipMastery[ship]?.xp ?? 0) < definition.unlockXp) return false;
    this.data.selectedAugments[ship] = id;
    this.save();
    return true;
  }

  completeTutorial(): void {
    if (this.data.tutorialComplete) return;
    this.data.tutorialComplete = true;
    this.save();
  }

  recordRun(summary: RunSummary): void {
    if (summary.training) return;
    this.data.cores += Math.floor(summary.cores);
    this.data.bestScore = Math.max(this.data.bestScore, Math.floor(summary.score));
    this.data.bestWave = Math.max(this.data.bestWave, Math.floor(summary.wave));
    this.data.totalKills += Math.floor(summary.kills);
    this.data.runs += 1;
    const mastery = this.data.shipMastery[summary.ship] ?? { xp: 0, kills: 0, bestWave: 0, bosses: 0 };
    mastery.xp += runMasteryXp(summary);
    mastery.kills += Math.floor(summary.kills);
    mastery.bestWave = Math.max(mastery.bestWave, Math.floor(summary.wave));
    mastery.bosses += Math.floor(summary.bossKills);
    this.data.shipMastery[summary.ship] = mastery;
    this.refreshShipUnlocks();
    const key = summary.mode === 'daily' ? `daily:${summary.seed}` : summary.mode;
    const previous = this.data.modeRecords[key];
    if (!previous || summary.score > previous.score) {
      this.data.modeRecords[key] = {
        score: Math.floor(summary.score), wave: summary.wave, kills: summary.kills, time: summary.time,
        mode: summary.mode, seed: summary.seed, threat: summary.threat,
      };
    }
    this.save();
  }

  unlockAchievement(id: string): boolean {
    if (this.data.achievements.includes(id)) return false;
    this.data.achievements.push(id);
    this.save();
    return true;
  }

  updateSettings(settings: Partial<GameSettings>): void {
    Object.assign(this.data.settings, settings);
    this.save();
  }

  resetProgress(): void {
    const settings = { ...this.data.settings };
    Object.assign(this.data, defaults(), { settings });
    this.save();
  }

  private load(): SaveData {
    const fallback = defaults();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const value = JSON.parse(raw) as Partial<SaveData>;
      const meta: Record<string, number> = {};
      if (value.meta && typeof value.meta === 'object') {
        for (const [id, level] of Object.entries(value.meta)) {
          if (/^[a-zA-Z]+$/.test(id)) meta[id] = Math.min(1_000_000, Math.floor(finite(level)));
        }
      }
      const modeRecords: Record<string, RunRecord> = {};
      const validModes: RunMode[] = ['standard', 'daily', 'rockets', 'oneHp', 'elite'];
      if (value.modeRecords && typeof value.modeRecords === 'object') {
        for (const [key, record] of Object.entries(value.modeRecords)) {
          if (!record || typeof record.score !== 'number' || !Number.isFinite(record.score)) continue;
          modeRecords[key] = {
            score: Math.floor(finite(record.score)), wave: Math.floor(finite(record.wave)), kills: Math.floor(finite(record.kills)),
            time: finite(record.time), mode: validModes.includes(record.mode) ? record.mode : 'standard',
            seed: Math.floor(finite(record.seed)), threat: Math.max(1, Math.floor(finite(record.threat, 1))),
          };
        }
      }
      const achievements = Array.isArray(value.achievements) ? value.achievements.filter((id): id is string => typeof id === 'string').slice(0, 100) : [];
      const validShips: ShipId[] = ['interceptor', 'bulwark', 'carrier', 'phantom'];
      const unlockedShips: ShipId[] = Array.isArray(value.unlockedShips) ? value.unlockedShips.filter((id): id is ShipId => validShips.includes(id)) : ['interceptor'];
      if (!unlockedShips.includes('interceptor')) unlockedShips.unshift('interceptor');
      const selectedShip = validShips.includes(value.selectedShip as ShipId) && unlockedShips.includes(value.selectedShip as ShipId) ? value.selectedShip as ShipId : 'interceptor';
      const discoveredEvolutions = Array.isArray(value.discoveredEvolutions)
        ? [...new Set(value.discoveredEvolutions.filter((id) => typeof id === 'string' && EVOLUTIONS.some((definition) => definition.id === id)))]
        : [];
      const shipMastery: SaveData['shipMastery'] = {};
      if (value.shipMastery && typeof value.shipMastery === 'object') {
        for (const [id, record] of Object.entries(value.shipMastery)) {
          if (!validShips.includes(id as ShipId) || !record || typeof record !== 'object') continue;
          shipMastery[id as ShipId] = {
            xp: Math.min(1_000_000_000, Math.floor(finite(record.xp))),
            kills: Math.min(1_000_000_000, Math.floor(finite(record.kills))),
            bestWave: Math.min(1_000_000, Math.floor(finite(record.bestWave))),
            bosses: Math.min(1_000_000, Math.floor(finite(record.bosses))),
          };
        }
      }
      const selectedAugments: SaveData['selectedAugments'] = {};
      if (value.selectedAugments && typeof value.selectedAugments === 'object') {
        for (const [ship, id] of Object.entries(value.selectedAugments)) {
          const definition = augmentById(id);
          if (!validShips.includes(ship as ShipId) || !definition || definition.ship !== ship) continue;
          if ((shipMastery[definition.ship]?.xp ?? 0) >= definition.unlockXp) selectedAugments[definition.ship] = definition.id;
        }
      }
      const settings = value.settings ?? defaultSettings;
      return {
        version: 3,
        cores: Math.floor(finite(value.cores)),
        bestScore: Math.floor(finite(value.bestScore)),
        bestWave: Math.floor(finite(value.bestWave)),
        totalKills: Math.floor(finite(value.totalKills)),
        runs: Math.floor(finite(value.runs)),
        victories: Math.floor(finite(value.victories)),
        meta,
        settings: {
          masterVolume: Math.min(1, finite(settings.masterVolume, defaultSettings.masterVolume)),
          musicVolume: Math.min(1, finite(settings.musicVolume, defaultSettings.musicVolume)),
          sfxVolume: Math.min(1, finite(settings.sfxVolume, defaultSettings.sfxVolume)),
          screenShake: typeof settings.screenShake === 'boolean' ? settings.screenShake : true,
          damageNumbers: typeof settings.damageNumbers === 'boolean' ? settings.damageNumbers : true,
          quality: ['auto', 'high', 'medium', 'low'].includes(settings.quality ?? '') ? settings.quality! : 'auto',
          particles: Math.min(1, finite(settings.particles, defaultSettings.particles)),
        },
        lastDifficulty: value.lastDifficulty === 'hardcore' ? 'hardcore' : 'veteran',
        unlockedShips,
        selectedShip,
        discoveredEvolutions,
        shipMastery,
        selectedAugments,
        tutorialComplete: value.tutorialComplete === true,
        modeRecords,
        achievements,
        updatedAt: finite(value.updatedAt),
      };
    } catch {
      return fallback;
    }
  }
}
