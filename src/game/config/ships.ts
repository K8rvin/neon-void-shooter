import type { AbilityId } from './abilities';
import type { WeaponId } from './weapons';
import type { RunStats } from '../types';

export type ShipId = 'interceptor' | 'bulwark' | 'carrier' | 'phantom';

export interface ShipDefinition {
  id: ShipId;
  name: string;
  code: string;
  description: string;
  unlockCost: number;
  unlockWave: number;
  defaultWeapon: WeaponId;
  defaultAbility: AbilityId;
  secondaryAbility?: AbilityId;
  radius: number;
  texture: string;
  combatTexture?: string;
  combatSize?: number;
  image: string;
  apply: (stats: RunStats) => void;
}

export const SHIPS: Record<ShipId, ShipDefinition> = {
  interceptor: {
    id: 'interceptor', name: 'INTERCEPTOR', code: 'NV–01', description: 'Лёгкий корпус и высокая критическая масса. +18% WASD, +8% крита, −15% корпуса.', unlockCost: 0, unlockWave: 0,
    defaultWeapon: 'pulse', defaultAbility: 'dash', radius: 19, texture: 'playerShip1_blue.png', combatTexture: 'player-interceptor.png', combatSize: 86, image: '/assets/ships/interceptor.png',
    apply: (stats) => { stats.maxHp *= 0.85; stats.moveSpeed *= 1.18; stats.critChance += 0.08; },
  },
  bulwark: {
    id: 'bulwark', name: 'BULWARK', code: 'NV–07', description: 'Тяжёлый защитник. +50% корпуса, +70 щита, +3 брони. Ракеты на 35% медленнее.', unlockCost: 150, unlockWave: 3,
    defaultWeapon: 'scatter', defaultAbility: 'slow', radius: 22, texture: 'playerShip1_green.png', combatTexture: 'player-bulwark.png', combatSize: 98, image: '/assets/ships/bulwark.png',
    apply: (stats) => { stats.maxHp *= 1.5; stats.maxShield += 70; stats.armor += 3; stats.missileCooldown *= 1.35; stats.moveSpeed *= 0.88; },
  },
  carrier: {
    id: 'carrier', name: 'CARRIER', code: 'NV–12', description: 'Носитель боевого роя. +2 дрона и +25% их урона. Основное оружие на 20% слабее.', unlockCost: 240, unlockWave: 5,
    defaultWeapon: 'arc', defaultAbility: 'drones', radius: 20, texture: 'playerShip2_orange.png', combatTexture: 'player-carrier.png', combatSize: 92, image: '/assets/ships/carrier.png',
    apply: (stats) => { stats.maxHp *= 0.95; stats.drones += 2; stats.droneDamage *= 1.25; stats.damage *= 0.8; },
  },
  phantom: {
    id: 'phantom', name: 'PHANTOM', code: 'NV–X', description: 'Экспериментальный фазовый корабль. −35% корпуса, +12% крита. Дополнительный DASH на клавише E.', unlockCost: 360, unlockWave: 10,
    defaultWeapon: 'beam', defaultAbility: 'purge', secondaryAbility: 'dash', radius: 17, texture: 'playerShip3_red.png', combatTexture: 'player-phantom.png', combatSize: 82, image: '/assets/ships/phantom.png',
    apply: (stats) => { stats.maxHp *= 0.65; stats.critChance += 0.12; stats.invulnerability += 0.35; },
  },
};

export const SHIP_LIST = Object.values(SHIPS);
