import type { RunStats, RunSummary } from '../types';
import type { ShipId } from './ships';

export type ShipAugmentId = 'overclock' | 'dashNova' | 'siege' | 'shieldPulse' | 'droneProtocol' | 'repairSwarm' | 'phaseEcho' | 'voidPurge';

export interface ShipMasteryRecord {
  xp: number;
  kills: number;
  bestWave: number;
  bosses: number;
}

export interface ShipAugmentDefinition {
  id: ShipAugmentId;
  ship: ShipId;
  name: string;
  description: string;
  unlockXp: number;
  apply: (stats: RunStats) => void;
}

export const SHIP_AUGMENTS: Record<ShipId, readonly ShipAugmentDefinition[]> = {
  interceptor: [
    { id: 'overclock', ship: 'interceptor', name: 'ФОРСАЖ', unlockXp: 250, description: 'Темп +12%, корпус −8%. DASH: +25% крита на 3 с.', apply: (stats) => { stats.fireRate *= 1.12; stats.maxHp *= 0.92; } },
    { id: 'dashNova', ship: 'interceptor', name: 'РАЗРЫВНОЙ РЫВОК', unlockXp: 750, description: 'Корпус −8%. DASH вызывает волну 5× урона в радиусе 180.', apply: (stats) => { stats.maxHp *= 0.92; } },
  ],
  bulwark: [
    { id: 'siege', ship: 'bulwark', name: 'ОСАДНЫЙ РЕЖИМ', unlockXp: 250, description: 'Ракеты +25%, темп −10%. Способность вызывает залп 65% урона ракеты в радиусе 160.', apply: (stats) => { stats.missileDamage *= 1.25; stats.fireRate *= 0.9; } },
    { id: 'shieldPulse', ship: 'bulwark', name: 'ИМПУЛЬС ЩИТА', unlockXp: 750, description: 'Щит +30, скорость WASD −5%. Способность восстанавливает 25 щита.', apply: (stats) => { stats.maxShield += 30; stats.moveSpeed *= 0.95; } },
  ],
  carrier: [
    { id: 'droneProtocol', ship: 'carrier', name: 'ПРОТОКОЛ РОЯ', unlockXp: 250, description: '+1 дрон, основной урон −12%. Способность усиливает дронов ×1,5 на 5 с.', apply: (stats) => { stats.drones += 1; stats.damage *= 0.88; } },
    { id: 'repairSwarm', ship: 'carrier', name: 'РЕМОНТНЫЙ РОЙ', unlockXp: 750, description: 'Урон дронов −15%. Способность восстанавливает 18 корпуса.', apply: (stats) => { stats.droneDamage *= 0.85; } },
  ],
  phantom: [
    { id: 'phaseEcho', ship: 'phantom', name: 'ФАЗОВОЕ ЭХО', unlockXp: 250, description: 'Корпус −12%. Q сбрасывает DASH, E сокращает перезарядку Q до 80%.', apply: (stats) => { stats.maxHp *= 0.88; } },
    { id: 'voidPurge', ship: 'phantom', name: 'ОЧИЩЕНИЕ ПУСТОТЫ', unlockXp: 750, description: 'Крит +8%, корпус −10%. PURGE дополнительно вызывает волну 7× урона в радиусе 240.', apply: (stats) => { stats.critChance += 0.08; stats.maxHp *= 0.9; } },
  ],
};

export const MASTERY_LEVELS = [0, 100, 250, 750, 1500, 2500] as const;
export const MASTERY_TRAIL_XP = 1500;
export const MASTERY_EMBLEM_XP = 2500;

export const MASTERY_OBJECTIVES = [
  { id: 'wave5', name: 'Достичь волны 5', metric: 'bestWave', target: 5 },
  { id: 'kills150', name: 'Уничтожить 150 противников', metric: 'kills', target: 150 },
  { id: 'boss1', name: 'Победить босса', metric: 'bosses', target: 1 },
] as const;

export function augmentById(id: string | undefined): ShipAugmentDefinition | undefined {
  for (const definition of Object.values(SHIP_AUGMENTS).flat()) {
    if (definition.id === id) return definition;
  }
  return undefined;
}

export function masteryLevel(xp: number): number {
  let level = 0;
  for (let index = 1; index < MASTERY_LEVELS.length; index += 1) {
    if (xp >= MASTERY_LEVELS[index]!) level = index;
  }
  return level;
}

export function masteryProgress(xp: number) {
  const level = masteryLevel(xp);
  const current = MASTERY_LEVELS[level]!;
  const next = MASTERY_LEVELS[level + 1];
  return { level, current, next, remaining: next === undefined ? 0 : Math.max(0, next - xp) };
}

export function runMasteryXp(summary: Pick<RunSummary, 'kills' | 'wave' | 'evolutions'>): number {
  return Math.floor(summary.kills + Math.max(0, summary.wave - 1) * 25 + summary.evolutions * 100);
}

export function masteryObjectiveProgress(record: Partial<ShipMasteryRecord> | undefined) {
  return MASTERY_OBJECTIVES.map((objective) => {
    const progress = Math.min(objective.target, record?.[objective.metric] ?? 0);
    return { ...objective, progress, complete: progress >= objective.target };
  });
}
