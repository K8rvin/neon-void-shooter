export type BossId = 'archon' | 'leviathan' | 'warden' | 'cardinal' | 'rift' | 'omega';
export type BossMechanic = 'weakpoint' | 'laserWalls' | 'shieldGenerator' | 'gravityControl' | 'riftPortals' | 'omegaBeams';
export type BossPattern = 'ring' | 'fan' | 'spiral';

export interface BossPhase {
  hpThreshold: number;
  attackInterval: number;
}

export interface BossDefinition {
  id: BossId;
  name: string;
  mechanic: BossMechanic;
  hint: string;
  texture: string;
  fallbackTexture: string;
  tint: number;
  renderSize: number;
  patterns: readonly [BossPattern, BossPattern, BossPattern];
  phases: readonly [BossPhase, BossPhase, BossPhase];
  modules?: ReadonlyArray<{ kind: 'generator' | 'turret'; x: number; y: number }>;
}

function phases(interval: number): readonly [BossPhase, BossPhase, BossPhase] {
  return [
    { hpThreshold: 1, attackInterval: interval },
    { hpThreshold: 0.67, attackInterval: Math.max(0.72, interval - 0.28) },
    { hpThreshold: 0.33, attackInterval: Math.max(0.72, interval - 0.56) },
  ];
}

export const BOSS_LIST: readonly BossDefinition[] = [
  {
    id: 'archon', name: 'АРХОНТ', mechanic: 'weakpoint', hint: 'После атаки открывается слабая точка',
    texture: 'boss-archon.png', fallbackTexture: 'enemyBlack1.png', tint: 0xff91d8, renderSize: 224,
    patterns: ['ring', 'fan', 'spiral'], phases: phases(1.75),
  },
  {
    id: 'leviathan', name: 'ПУСТОТНЫЙ ЛЕВИАФАН', mechanic: 'laserWalls', hint: 'Ищите проход между лазерными стенами',
    texture: 'boss-leviathan.png', fallbackTexture: 'enemyBlack2.png', tint: 0xff789c, renderSize: 240,
    patterns: ['ring', 'fan', 'spiral'], phases: phases(2.8),
  },
  {
    id: 'warden', name: 'МАТРИЦА СТРАЖА', mechanic: 'shieldGenerator', hint: 'Уничтожьте генератор щита и турели',
    texture: 'boss-warden.png', fallbackTexture: 'ufoBlue.png', tint: 0x9eeaff, renderSize: 224,
    patterns: ['ring', 'fan', 'spiral'], phases: phases(2.2),
    modules: [{ kind: 'generator', x: 0.5, y: 205 }, { kind: 'turret', x: 0.24, y: 185 }, { kind: 'turret', x: 0.76, y: 185 }],
  },
  {
    id: 'cardinal', name: 'КРАСНЫЙ КАРДИНАЛ', mechanic: 'gravityControl', hint: 'Удерживайте зону контроля',
    texture: 'boss-cardinal.png', fallbackTexture: 'enemyBlack4.png', tint: 0xff866d, renderSize: 242,
    patterns: ['ring', 'fan', 'spiral'], phases: phases(1.75),
  },
  {
    id: 'rift', name: 'РАЗЛОМ', mechanic: 'riftPortals', hint: 'Порталы переносят вражеские снаряды · держите дистанцию у выходов',
    texture: 'boss-rift.png', fallbackTexture: 'enemyBlack5.png', tint: 0xc9a1ff, renderSize: 238,
    patterns: ['spiral', 'fan', 'ring'], phases: phases(2.1),
  },
  {
    id: 'omega', name: 'ОМЕГА-ПРАЙМ', mechanic: 'omegaBeams', hint: 'Уклоняйтесь от вращающихся лучей · после залпа открывается ядро',
    texture: 'boss-omega.png', fallbackTexture: 'enemyBlack3.png', tint: 0xffe4a1, renderSize: 246,
    patterns: ['fan', 'ring', 'spiral'], phases: phases(2.6),
  },
];
