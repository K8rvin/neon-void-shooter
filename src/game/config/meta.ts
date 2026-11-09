import type { RunStats } from '../types';

export interface MetaDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  baseCost: number;
  apply: (stats: RunStats, level: number) => void;
}

export function metaGain(level: number, step: number): number {
  return level > 0 ? step * Math.pow(level, 0.82) : 0;
}

export function metaCost(definition: MetaDefinition, level: number): number {
  return Math.floor(definition.baseCost * Math.pow(1.31, level) + level * 4);
}

export function createBaseStats(meta: Record<string, number>): RunStats {
  const stats: RunStats = {
    maxHp: 100,
    damage: 16,
    fireRate: 5.6,
    projectileCount: 1,
    spread: 0.12,
    pierce: 0,
    projectileSpeed: 880,
    projectileSize: 1,
    critChance: 0.05,
    critMultiplier: 2,
    ricochet: 0,
    chain: 0,
    chainDamage: 0.45,
    shrapnel: 0,
    maxShield: 0,
    shieldRegen: 0,
    regen: 0,
    armor: 0,
    moveSpeed: 620,
    magnet: 120,
    xpGain: 1,
    coreGain: 1,
    luck: 0,
    lifeSteal: 0,
    drones: 0,
    droneDamage: 0.65,
    droneFireRate: 2.4,
    missileCount: 2,
    missileDamage: 95,
    missileCooldown: 3.6,
    blastRadius: 105,
    missileCluster: 0,
    burn: 0,
    cryo: 0,
    execute: 0,
    retaliation: 0,
    invulnerability: 0.65,
    comboDuration: 3.2,
    enemyBulletSlow: 1,
    revives: 0,
    ionLance: 0,
    stormProtocol: 0,
    aegis: 0,
    phantomDrones: 0,
    novaArray: 0,
    rocketSwarm: 0,
  };
  for (const definition of META_UPGRADES) {
    const level = meta[definition.id] ?? 0;
    if (level > 0) definition.apply(stats, level);
  }
  stats.critChance = Math.min(0.75, stats.critChance);
  return stats;
}

export const META_UPGRADES: MetaDefinition[] = [
  { id: 'hull', name: 'Титановый корпус', description: '+12 к максимуму корпуса за уровень', icon: '⬡', baseCost: 18, apply: (s, l) => { s.maxHp += metaGain(l, 12); } },
  { id: 'reactor', name: 'Реактор Аннигиляции', description: '+4% к урону основного оружия', icon: '✦', baseCost: 22, apply: (s, l) => { s.damage *= 1 + metaGain(l, 0.04); } },
  { id: 'cycler', name: 'Квантовый цикл', description: '+3% к скорострельности', icon: '≋', baseCost: 24, apply: (s, l) => { s.fireRate *= 1 + metaGain(l, 0.03); } },
  { id: 'aegisCore', name: 'Ядро Эгиды', description: '+10 к щиту и +0,5 к восстановлению', icon: '◉', baseCost: 28, apply: (s, l) => { s.maxShield += metaGain(l, 10); s.shieldRegen += metaGain(l, 0.5); } },
  { id: 'plating', name: 'Нанопластины', description: '+0,6 к постоянной броне', icon: '▰', baseCost: 30, apply: (s, l) => { s.armor += metaGain(l, 0.6); } },
  { id: 'thrusters', name: 'Векторные двигатели', description: '+2,5% к скорости перемещения WASD', icon: '»', baseCost: 16, apply: (s, l) => { s.moveSpeed *= 1 + metaGain(l, 0.025); } },
  { id: 'tractor', name: 'Гравитационный захват', description: '+8% к радиусу сбора', icon: '◎', baseCost: 14, apply: (s, l) => { s.magnet *= 1 + metaGain(l, 0.08); } },
  { id: 'database', name: 'Боевая нейросеть', description: '+4% к получаемому опыту', icon: '⌬', baseCost: 20, apply: (s, l) => { s.xpGain *= 1 + metaGain(l, 0.04); } },
  { id: 'targeting', name: 'Предиктивный прицел', description: '+0,8% к шансу критического урона', icon: '⌖', baseCost: 26, apply: (s, l) => { s.critChance += metaGain(l, 0.008); } },
  { id: 'warhead', name: 'Термоядерные боеголовки', description: '+5% к урону ракет и взрывов', icon: '▲', baseCost: 25, apply: (s, l) => { s.missileDamage *= 1 + metaGain(l, 0.05); } },
  { id: 'fortune', name: 'Анализатор аномалий', description: '+2 к удаче и +3% к ядрам', icon: '◇', baseCost: 32, apply: (s, l) => { s.luck += metaGain(l, 2); s.coreGain *= 1 + metaGain(l, 0.03); } },
  { id: 'nanites', name: 'Ремонтные наниты', description: '+0,15 к восстановлению корпуса/с', icon: '✚', baseCost: 35, apply: (s, l) => { s.regen += metaGain(l, 0.15); } },
];
