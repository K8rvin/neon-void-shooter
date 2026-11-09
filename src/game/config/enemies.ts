import type { EnemyKind } from '../types';

export interface EnemyConfig {
  hp: number;
  speed: number;
  radius: number;
  damage: number;
  xp: number;
  score: number;
  fireRate: number;
  scale: number;
  texture: string;
  combatTexture?: string;
  eliteTexture?: string;
  combatSize?: number;
  tint: number;
  name: string;
}

export const ENEMIES: Record<EnemyKind, EnemyConfig> = {
  scout: { hp: 26, speed: 105, radius: 27, damage: 12, xp: 2, score: 100, fireRate: 2.8, scale: 0.72, texture: 'enemyRed1.png', combatTexture: 'enemy-scout.png', eliteTexture: 'elite-scout.png', combatSize: 66, tint: 0xffffff, name: 'Разведчик' },
  weaver: { hp: 42, speed: 120, radius: 29, damage: 14, xp: 3, score: 160, fireRate: 2.35, scale: 0.76, texture: 'enemyBlue2.png', combatTexture: 'enemy-weaver.png', eliteTexture: 'elite-weaver.png', combatSize: 70, tint: 0xffffff, name: 'Перехватчик' },
  tank: { hp: 190, speed: 48, radius: 39, damage: 24, xp: 8, score: 480, fireRate: 3.1, scale: 1.02, texture: 'enemyBlack4.png', combatTexture: 'enemy-tank.png', eliteTexture: 'elite-tank.png', combatSize: 94, tint: 0xffc58a, name: 'Разрушитель' },
  sniper: { hp: 78, speed: 66, radius: 31, damage: 20, xp: 6, score: 360, fireRate: 3.6, scale: 0.82, texture: 'enemyGreen3.png', combatTexture: 'enemy-sniper.png', eliteTexture: 'elite-sniper.png', combatSize: 75, tint: 0xa4ffcf, name: 'Стрелок' },
  kamikaze: { hp: 48, speed: 190, radius: 26, damage: 30, xp: 4, score: 240, fireRate: 99, scale: 0.7, texture: 'enemyRed5.png', combatTexture: 'enemy-kamikaze.png', eliteTexture: 'elite-kamikaze.png', combatSize: 62, tint: 0xff9a62, name: 'Камикадзе' },
  splitter: { hp: 105, speed: 78, radius: 34, damage: 17, xp: 7, score: 410, fireRate: 2.7, scale: 0.88, texture: 'enemyBlue4.png', combatTexture: 'enemy-splitter.png', eliteTexture: 'elite-splitter.png', combatSize: 82, tint: 0xd0a4ff, name: 'Разделитель' },
  carrier: { hp: 250, speed: 52, radius: 43, damage: 20, xp: 12, score: 720, fireRate: 4.2, scale: 1.08, texture: 'enemyBlack5.png', combatTexture: 'enemy-carrier.png', eliteTexture: 'elite-carrier.png', combatSize: 104, tint: 0xffa1e4, name: 'Носитель' },
  sentinel: { hp: 155, speed: 60, radius: 36, damage: 18, xp: 10, score: 620, fireRate: 2.25, scale: 0.96, texture: 'enemyGreen5.png', combatTexture: 'enemy-sentinel.png', eliteTexture: 'elite-sentinel.png', combatSize: 86, tint: 0x9fffee, name: 'Страж' },
  meteor: { hp: 170, speed: 72, radius: 40, damage: 26, xp: 1, score: 90, fireRate: 999, scale: 0.85, texture: 'meteorGrey_big1.png', combatTexture: 'meteor-1.png', combatSize: 105, tint: 0xb9d5ff, name: 'Астероид' },
  turret: { hp: 170, speed: 0, radius: 25, damage: 18, xp: 8, score: 500, fireRate: 1.9, scale: 0.85, texture: 'gun08.png', tint: 0xffb176, name: 'Турель' },
  generator: { hp: 360, speed: 0, radius: 31, damage: 10, xp: 12, score: 800, fireRate: 999, scale: 0.72, texture: 'ufoBlue.png', tint: 0x79f7ff, name: 'Генератор щита' },
  boss: { hp: 2900, speed: 48, radius: 88, damage: 35, xp: 100, score: 15000, fireRate: 1.6, scale: 2.3, texture: 'enemyBlack3.png', tint: 0xff91d8, name: 'Пожиратель миров' },
};

export const UNLOCK_WAVES: Record<Exclude<EnemyKind, 'boss' | 'meteor' | 'turret' | 'generator'>, number> = {
  scout: 1,
  weaver: 2,
  tank: 3,
  sniper: 4,
  kamikaze: 6,
  splitter: 7,
  carrier: 8,
  sentinel: 9,
};
