export type SectorId = 'void' | 'asteroids' | 'swarm' | 'elite' | 'anomaly';

export interface SectorDefinition {
  id: SectorId;
  name: string;
  subtitle: string;
  description: string;
  icon: string;
  color: number;
  budgetMultiplier: number;
  formationMultiplier: number;
  spawnIntervalMultiplier: number;
  enemyHpMultiplier: number;
  enemyDamageMultiplier: number;
  xpMultiplier: number;
  coreMultiplier: number;
  coreChanceBonus: number;
  eliteChanceBonus: number;
  luckBonus: number;
  playerDamageMultiplier: number;
  gravity: number;
  background?: string;
  cardImage?: string;
}

export const SECTORS: Record<SectorId, SectorDefinition> = {
  void: {
    id: 'void', name: 'ОТКРЫТЫЙ КОСМОС', subtitle: 'Стандартные параметры сектора', description: 'Без дополнительных модификаторов.', icon: '·', color: 0x62f5ff,
    budgetMultiplier: 1, formationMultiplier: 1, spawnIntervalMultiplier: 1, enemyHpMultiplier: 1, enemyDamageMultiplier: 1,
    xpMultiplier: 1, coreMultiplier: 1, coreChanceBonus: 0, eliteChanceBonus: 0, luckBonus: 0, playerDamageMultiplier: 1, gravity: 0,
  },
  asteroids: {
    id: 'asteroids', name: 'АСТЕРОИДНЫЙ ПОЯС', subtitle: 'Риск: разрушаемые препятствия', description: 'На арене появляются астероиды. +50% к ядрам и выше шанс их находки.', icon: '⬢', color: 0xffc873,
    budgetMultiplier: 1, formationMultiplier: 1, spawnIntervalMultiplier: 1, enemyHpMultiplier: 1, enemyDamageMultiplier: 1,
    xpMultiplier: 1, coreMultiplier: 1.5, coreChanceBonus: 0.04, eliteChanceBonus: 0, luckBonus: 0, playerDamageMultiplier: 1, gravity: 0,
    background: '/assets/sectors/asteroids-bg.webp', cardImage: '/assets/sectors/asteroids-card.png',
  },
  swarm: {
    id: 'swarm', name: 'РОЙ', subtitle: 'Риск: огромные формации', description: 'На 65% больше противников, они быстрее появляются, но имеют −25% HP. +40% к опыту.', icon: '⋔', color: 0x72ffb0,
    budgetMultiplier: 1.65, formationMultiplier: 1.65, spawnIntervalMultiplier: 0.7, enemyHpMultiplier: 0.75, enemyDamageMultiplier: 0.9,
    xpMultiplier: 1.4, coreMultiplier: 1, coreChanceBonus: 0, eliteChanceBonus: 0, luckBonus: 0, playerDamageMultiplier: 1, gravity: 0,
    background: '/assets/sectors/swarm-bg.webp', cardImage: '/assets/sectors/swarm-card.png',
  },
  elite: {
    id: 'elite', name: 'ЭЛИТНЫЙ СЕКТОР', subtitle: 'Риск: усиленные противники', description: 'Значительно больше элиты. +25% HP и +15% урона врагов. +25 к удаче карт.', icon: '◆', color: 0xff7cae,
    budgetMultiplier: 1, formationMultiplier: 1, spawnIntervalMultiplier: 0.9, enemyHpMultiplier: 1.25, enemyDamageMultiplier: 1.15,
    xpMultiplier: 1.15, coreMultiplier: 1.25, coreChanceBonus: 0.02, eliteChanceBonus: 0.28, luckBonus: 25, playerDamageMultiplier: 1, gravity: 0,
    background: '/assets/sectors/elite-bg.webp', cardImage: '/assets/sectors/elite-card.png',
  },
  anomaly: {
    id: 'anomaly', name: 'ГРАВИТАЦИОННАЯ АНОМАЛИЯ', subtitle: 'Правила физики нарушены', description: 'Снаряды притягиваются к центру аномалии и искривляют траектории. +35% к вашему урону.', icon: '◎', color: 0xb879ff,
    budgetMultiplier: 1, formationMultiplier: 1, spawnIntervalMultiplier: 1, enemyHpMultiplier: 1, enemyDamageMultiplier: 1,
    xpMultiplier: 1.1, coreMultiplier: 1.1, coreChanceBonus: 0, eliteChanceBonus: 0, luckBonus: 5, playerDamageMultiplier: 1.35, gravity: 280,
    background: '/assets/sectors/anomaly-bg.webp', cardImage: '/assets/sectors/anomaly-card.png',
  },
};

export const ROUTE_SECTORS: SectorId[] = ['asteroids', 'swarm', 'elite', 'anomaly'];
