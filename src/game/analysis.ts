import type { WeaponId } from './config/weapons';
import type { Player, RunStats, UpgradeDefinition } from './types';

export interface BuildAnalytics {
  primaryDps: number;
  missileDps: number;
  critChance: number;
  critMultiplier: number;
  projectileCount: number;
  pierce: number;
  chain: number;
  drones: number;
  armor: number;
  maxHp: number;
  maxShield: number;
  missileCount: number;
  missileCooldown: number;
}

export function calculatePrimaryDps(stats: RunStats, weapon: WeaponId, heat = 0, sectorDamage = 1): number {
  const critFactor = 1 + Math.min(0.95, stats.critChance) * (stats.critMultiplier - 1);
  if (weapon === 'beam') return stats.damage * stats.fireRate * 1.8 * 0.28 * (1 + heat / 200) * critFactor * sectorDamage;
  return stats.damage * stats.fireRate * stats.projectileCount * critFactor * sectorDamage;
}

export function calculateMissileDps(stats: RunStats, sectorDamage = 1): number {
  return stats.missileDamage * stats.missileCount / Math.max(0.35, stats.missileCooldown) * sectorDamage;
}

export function getBuildAnalytics(stats: RunStats, weapon: WeaponId, heat: number, sectorDamage: number): BuildAnalytics {
  return {
    primaryDps: calculatePrimaryDps(stats, weapon, heat, sectorDamage),
    missileDps: calculateMissileDps(stats, sectorDamage),
    critChance: stats.critChance,
    critMultiplier: stats.critMultiplier,
    projectileCount: stats.projectileCount,
    pierce: stats.pierce,
    chain: stats.chain,
    drones: stats.drones,
    armor: stats.armor,
    maxHp: stats.maxHp,
    maxShield: stats.maxShield,
    missileCount: stats.missileCount,
    missileCooldown: stats.missileCooldown,
  };
}

export function previewUpgrade(definition: UpgradeDefinition, stats: RunStats, player: Player, weapon: WeaponId, heat: number, sectorDamage: number): string[] {
  const nextStats = { ...stats };
  const nextPlayer = { ...player };
  definition.apply(nextStats, nextPlayer);
  const changes: string[] = [];
  const primaryBefore = calculatePrimaryDps(stats, weapon, heat, sectorDamage);
  const primaryAfter = calculatePrimaryDps(nextStats, weapon, heat, sectorDamage);
  const missilesBefore = calculateMissileDps(stats, sectorDamage);
  const missilesAfter = calculateMissileDps(nextStats, sectorDamage);
  if (Math.abs(primaryAfter - primaryBefore) > 0.05) changes.push(`DPS ${format(primaryBefore)} → ${format(primaryAfter)}`);
  if (Math.abs(missilesAfter - missilesBefore) > 0.05) changes.push(`Ракеты/с ${format(missilesBefore)} → ${format(missilesAfter)}`);

  const labels: Partial<Record<keyof RunStats, { label: string; format: (value: number) => string }>> = {
    maxHp: { label: 'Корпус', format: (value) => format(value) },
    maxShield: { label: 'Щит', format: (value) => format(value) },
    armor: { label: 'Броня', format: (value) => format(value) },
    regen: { label: 'Ремонт/с', format: (value) => format(value) },
    projectileCount: { label: 'Снаряды', format: (value) => `${Math.round(value)}` },
    pierce: { label: 'Пробитие', format: (value) => `${Math.round(value)}` },
    critChance: { label: 'Крит. шанс', format: (value) => `${Math.round(value * 100)}%` },
    critMultiplier: { label: 'Крит. множитель', format: (value) => `×${format(value)}` },
    chain: { label: 'Цепи', format: (value) => `${Math.round(value)}` },
    ricochet: { label: 'Рикошеты', format: (value) => `${Math.round(value)}` },
    drones: { label: 'Дроны', format: (value) => `${Math.round(value)}` },
    missileCount: { label: 'Ракеты', format: (value) => `${Math.round(value)}` },
    missileCooldown: { label: 'Перезарядка', format: (value) => `${format(value)}с` },
    blastRadius: { label: 'Радиус взрыва', format: (value) => format(value) },
    shrapnel: { label: 'Осколки', format: (value) => `${Math.round(value)}` },
    moveSpeed: { label: 'Скорость WASD', format: (value) => format(value) },
    lifeSteal: { label: 'Вампиризм', format: (value) => `${format(value * 100)}%` },
    enemyBulletSlow: { label: 'Скорость пуль', format: (value) => `${Math.round(value * 100)}%` },
    revives: { label: 'Воскрешения', format: (value) => `${Math.round(value)}` },
  };
  for (const [key, rule] of Object.entries(labels) as Array<[keyof RunStats, { label: string; format: (value: number) => string }]>) {
    const before = stats[key];
    const after = nextStats[key];
    if (Math.abs(after - before) > 0.0001) changes.push(`${rule.label} ${rule.format(before)} → ${rule.format(after)}`);
  }
  if (changes.length === 0) changes.push('Особый боевой эффект');
  return changes.slice(0, 4);
}

function format(value: number): string {
  if (Math.abs(value) >= 100) return Math.round(value).toString();
  if (Math.abs(value) >= 10) return value.toFixed(1).replace('.0', '');
  return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
