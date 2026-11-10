import type { Particle, Sprite } from 'pixi.js';
import type { RunMode } from './config/modes';
import type { WeaponId } from './config/weapons';
import type { AbilityId } from './config/abilities';
import type { ShipId } from './config/ships';

export type GameStatus = 'menu' | 'loadout' | 'playing' | 'levelup' | 'route' | 'paused' | 'gameover' | 'hangar';
export type Difficulty = 'veteran' | 'hardcore';
export type EnemyKind = 'scout' | 'weaver' | 'tank' | 'sniper' | 'kamikaze' | 'splitter' | 'carrier' | 'sentinel' | 'meteor' | 'turret' | 'generator' | 'boss';
export type BulletOwner = 'player' | 'enemy' | 'drone';
export type DamageSource = 'primary' | 'missile' | 'drone' | 'chain' | 'burn' | 'ability' | 'collision' | 'shrapnel';
export type BulletKind = 'bolt' | 'orb' | 'missile' | 'shard' | 'heavy';
export type PickupKind = 'xp' | 'core' | 'repair' | 'shield' | 'bomb' | 'overdrive';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type EffectTexture = 'glow' | 'spark' | 'smoke' | 'ring';

export interface RunStats {
  maxHp: number;
  damage: number;
  fireRate: number;
  projectileCount: number;
  spread: number;
  pierce: number;
  projectileSpeed: number;
  projectileSize: number;
  critChance: number;
  critMultiplier: number;
  ricochet: number;
  chain: number;
  chainDamage: number;
  shrapnel: number;
  maxShield: number;
  shieldRegen: number;
  regen: number;
  armor: number;
  moveSpeed: number;
  magnet: number;
  xpGain: number;
  coreGain: number;
  luck: number;
  lifeSteal: number;
  drones: number;
  droneDamage: number;
  droneFireRate: number;
  missileCount: number;
  missileDamage: number;
  missileCooldown: number;
  blastRadius: number;
  missileCluster: number;
  burn: number;
  cryo: number;
  execute: number;
  retaliation: number;
  invulnerability: number;
  comboDuration: number;
  enemyBulletSlow: number;
  revives: number;
  ionLance: number;
  stormProtocol: number;
  aegis: number;
  phantomDrones: number;
  novaArray: number;
  rocketSwarm: number;
}

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  shield: number;
  fireCooldown: number;
  missileCooldown: number;
  invulnerable: number;
  shieldDelay: number;
  level: number;
  xp: number;
  xpNext: number;
  revives: number;
  beamHeat: number;
  beamOverheated: number;
}

export interface Enemy {
  active: boolean;
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  xp: number;
  score: number;
  fireTimer: number;
  age: number;
  phase: number;
  targetY: number;
  elite: boolean;
  scale: number;
  flash: number;
  slow: number;
  burnTime: number;
  burnDps: number;
  burnTick: number;
  bossPhase: number;
  attackTimer: number;
  telegraph: number;
  summoned: boolean;
  trainingTarget: boolean;
  bossVariant: number;
  vulnerability: number;
  affixes: number;
  affixTimer: number;
  teleportTimer: number;
  teleportTelegraph: number;
  teleportTargetX: number;
  teleportTargetY: number;
  formationShield: number;
  squadId: number;
  squadRole?: 'leader' | 'support';
  view?: Sprite;
}

export interface LaserWall {
  active: boolean;
  y: number;
  gapX: number;
  gapWidth: number;
  telegraph: number;
  life: number;
  damage: number;
}

export interface ControlZone {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  progress: number;
  captured: number;
  moveTimer: number;
}

export interface SafeZone {
  x: number;
  y: number;
  radius: number;
  charge: number;
  rewarded: boolean;
}

export interface MovingCover {
  x: number;
  y: number;
  radius: number;
  vx: number;
  view?: Sprite;
}

export interface RiftPortalPair {
  id: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  age: number;
}

export interface OmegaBeam {
  x: number;
  y: number;
  angle: number;
  telegraph: number;
  life: number;
  rotationSpeed: number;
  damage: number;
  length: number;
  spokes: number;
}

export interface Bullet {
  active: boolean;
  id: number;
  owner: BulletOwner;
  damageSource: DamageSource;
  sourceEnemy?: EnemyKind;
  portalCooldown: number;
  kind: BulletKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  life: number;
  pierce: number;
  ricochet: number;
  chain: number;
  blast: number;
  cluster: number;
  crit: boolean;
  targetId: number;
  turnRate: number;
  size: number;
  tint: number;
  hit: Set<number>;
  view?: Particle;
  viewAdded: boolean;
}

export interface Pickup {
  active: boolean;
  id: number;
  kind: PickupKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  value: number;
  age: number;
  view?: Sprite;
}

export interface EffectParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  endScale: number;
  alpha: number;
  tint: number;
  drag: number;
  rotation: number;
  spin: number;
  texture: EffectTexture;
  view?: Particle;
  viewAdded: boolean;
}

export interface Lightning {
  active: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  maxLife: number;
  tint: number;
}

export interface UpgradeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: Rarity;
  max: number;
  requires?: Record<string, number>;
  conflicts?: string[];
  apply: (stats: RunStats, player: Player) => void;
}

export interface RunSummary {
  score: number;
  wave: number;
  kills: number;
  level: number;
  cores: number;
  time: number;
  difficulty: Difficulty;
  mode: RunMode;
  seed: number;
  threat: number;
  damageTaken: number;
  evolutions: number;
  training: boolean;
  victory: boolean;
  ship: ShipId;
  weapon: WeaponId;
  ability: AbilityId;
  masteryXp: number;
  bossKills: number;
  damageBySource: Partial<Record<DamageSource, number>>;
  deathCause?: string;
  cardHistory: Array<{ id: string; rank: number; wave: number; time: number }>;
}

export interface HudSnapshot {
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  xp: number;
  xpNext: number;
  level: number;
  score: number;
  wave: number;
  combo: number;
  cores: number;
  missileCooldown: number;
  missileCooldownMax: number;
  bossHp: number;
  bossMaxHp: number;
  bossName: string;
  enemies: number;
  bullets: number;
  particles: number;
  fps: number;
  quality: number;
  rerolls: number;
  banishes: number;
  overdrive: number;
  sectorName: string;
  sectorIcon: string;
  weaponName: string;
  weaponHeat: number;
  weaponOverheated: boolean;
  abilityName: string;
  abilityCooldown: number;
  abilityCooldownMax: number;
  abilityActive: boolean;
  secondaryName: string;
  secondaryCooldown: number;
  specialWave?: string;
  modeTime: number;
  modeName: string;
  threat: number;
  seed: number;
  training?: boolean;
  trainingDps?: number;
  trainingPrimaryDps?: number;
  trainingMissileDps?: number;
  trainingTime?: number;
  tutorialText?: string;
}
