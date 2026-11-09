import { AudioManager } from '../core/audio';
import { Input } from '../core/input';
import { clamp, distanceSquared, lerp, normalizeAngle, TAU } from '../core/math';
import { EntityPool } from '../core/pool';
import { Random } from '../core/random';
import { SaveStore } from '../core/save';
import { SpatialHash } from '../core/spatial-hash';
import { getBuildAnalytics, previewUpgrade } from './analysis';
import type { BuildAnalytics } from './analysis';
import { ENEMIES, UNLOCK_WAVES } from './config/enemies';
import { BOSS_LIST } from './config/bosses';
import { augmentById, runMasteryXp } from './config/mastery';
import type { ShipAugmentId } from './config/mastery';
import { createBaseStats, META_UPGRADES, metaCost } from './config/meta';
import { FALLBACK_UPGRADES, UPGRADE_MAP, UPGRADES } from './config/upgrades';
import { ROUTE_SECTORS, SECTORS } from './config/sectors';
import type { SectorDefinition, SectorId } from './config/sectors';
import { WEAPONS } from './config/weapons';
import type { WeaponId } from './config/weapons';
import { ABILITIES } from './config/abilities';
import type { AbilityId } from './config/abilities';
import { SHIPS } from './config/ships';
import type { ShipId } from './config/ships';
import { ACHIEVEMENTS, dailySeed, RUN_MODES } from './config/modes';
import type { RunMode } from './config/modes';
import type { YandexPlatform } from '../platform/yandex';
import { Renderer } from './Renderer';
import type {
  Bullet,
  BulletKind,
  BulletOwner,
  DamageSource,
  Difficulty,
  EffectParticle,
  EffectTexture,
  Enemy,
  EnemyKind,
  GameStatus,
  ControlZone,
  LaserWall,
  OmegaBeam,
  RiftPortalPair,
  HudSnapshot,
  Lightning,
  Pickup,
  PickupKind,
  Player,
  RunStats,
  RunSummary,
  Rarity,
  UpgradeDefinition,
} from './types';

export interface GameView {
  showMenu: () => void;
  showHangar: () => void;
  showLoadout: () => void;
  showPlaying: () => void;
  showPause: () => void;
  showLevelUp: (choices: UpgradeDefinition[]) => void;
  showRouteChoice: (choices: SectorDefinition[]) => void;
  showGameOver: (summary: RunSummary) => void;
  updateHUD: (snapshot: HudSnapshot) => void;
  updateHangar: () => void;
  announce: (title: string, subtitle?: string) => void;
  setMuted: (muted: boolean) => void;
}

const FIXED_STEP = 1 / 60;
const ENEMY_CAPACITY = 520;
const BULLET_CAPACITY = 4600;
const PARTICLE_CAPACITY = 2600;
const PICKUP_CAPACITY = 320;

export class Game {
  status: GameStatus = 'menu';
  stats: RunStats = createBaseStats({});
  player: Player = this.createPlayer();
  readonly enemies = new EntityPool<Enemy>(() => this.createEnemy());
  readonly bullets = new EntityPool<Bullet>(() => this.createBullet());
  readonly pickups = new EntityPool<Pickup>(() => this.createPickup());
  readonly particles = new EntityPool<EffectParticle>(() => this.createEffect());
  readonly lightnings = new EntityPool<Lightning>(() => ({ active: false, x1: 0, y1: 0, x2: 0, y2: 0, life: 0, maxLife: 0, tint: 0xffffff }));
  readonly dronePositions: Array<{ x: number; y: number }> = [];
  readonly laserWalls: LaserWall[] = [];
  readonly riftPairs: RiftPortalPair[] = [];
  readonly omegaBeams: OmegaBeam[] = [];
  controlZone?: ControlZone;
  readonly rng = new Random();
  trauma = 0;
  fps = 60;
  wave = 1;
  kills = 0;
  score = 0;
  cores = 0;
  runTime = 0;
  overdrive = 0;
  difficulty: Difficulty = 'veteran';
  weapon: WeaponId = 'pulse';
  ship: ShipId = 'interceptor';
  mode: RunMode = 'standard';
  runSeed = 0;
  threat = 1;
  damageTaken = 0;
  training = false;
  trainingTime = 0;
  selectedAugment?: ShipAugmentId;
  bossKills = 0;
  deathCause?: string;
  secondaryAbility?: AbilityId;
  secondaryCooldown = 0;
  ability: AbilityId = 'dash';
  abilityCooldown = 0;
  abilityTime = 0;
  gravityBomb?: { x: number; y: number; life: number; radius: number };
  bossName = '';
  sector: SectorId = 'void';
  currentChoices: UpgradeDefinition[] = [];
  currentRoutes: SectorDefinition[] = [];
  rerolls = 1;
  banishes = 1;
  view?: GameView;
  platform?: YandexPlatform;
  private platformPause = false;

  private readonly hash = new SpatialHash(96);
  private readonly nearby: Enemy[] = [];
  private readonly ranks = new Map<string, number>();
  private readonly banished = new Set<string>();
  private readonly droneCooldowns: number[] = [];
  private nextId = 1;
  private accumulator = 0;
  private hudTimer = 0;
  private spawnTimer = 0;
  private waveRemaining = 0;
  private intermission = 0;
  private bossActive = false;
  private bossAddsTimer = 0;
  private routeChosen = true;
  private asteroidTimer = 2.5;
  private comboCount = 0;
  private comboTimer = 0;
  private runRecorded = false;
  private elapsed = 0;
  private hitSoundTimer = 0;
  private lastFrameTimestamp = 0;
  private trainingDamage = 0;
  private readonly damageBySource: Partial<Record<DamageSource, number>> = {};
  private readonly cardHistory: RunSummary['cardHistory'] = [];
  private augmentCritTime = 0;
  private augmentDroneTime = 0;
  private tutorialStep = -1;
  private tutorialStartX = 0;
  private tutorialStartY = 0;

  constructor(
    readonly renderer: Renderer,
    readonly input: Input,
    readonly audio: AudioManager,
    readonly save: SaveStore,
  ) {
    this.enemies.preallocate(ENEMY_CAPACITY);
    this.bullets.preallocate(BULLET_CAPACITY);
    this.pickups.preallocate(PICKUP_CAPACITY);
    this.particles.preallocate(PARTICLE_CAPACITY);
    this.lightnings.preallocate(160);
    this.difficulty = save.data.lastDifficulty;
    this.input.onAction = (action) => {
      if (action === 'pause') this.togglePause();
      else if (action === 'mute') this.view?.setMuted(this.audio.toggleMute());
      else if (action === 'debug') document.body.classList.toggle('show-debug');
      else if (action === 'stress') this.startStressScenario();
      else if (action === 'ability') this.activateAbility();
      else if (action === 'secondaryAbility') this.activateSecondaryAbility();
    };
    this.input.onBlur = () => {
      if (this.status === 'playing') this.togglePause();
    };
  }

  start(): void {
    this.renderer.app.ticker.add((ticker) => this.frame(ticker.deltaMS / 1000));
  }

  attachView(view: GameView): void {
    this.view = view;
    this.view.showMenu();
  }

  openLoadout(): void {
    if (this.status !== 'menu' && this.status !== 'hangar' && this.status !== 'gameover') return;
    this.status = 'loadout';
    this.input.releaseWeapons();
    this.view?.showLoadout();
  }

  startRun(difficulty: Difficulty, weapon: WeaponId = 'pulse', ability: AbilityId = 'dash', ship: ShipId = 'interceptor', mode: RunMode = 'standard', training = false): void {
    void this.audio.unlock();
    this.audio.play('click');
    this.clearWorld();
    this.training = training;
    this.difficulty = difficulty;
    this.weapon = weapon;
    this.ability = ability;
    this.ship = this.save.data.unlockedShips.includes(ship) ? ship : 'interceptor';
    this.selectedAugment = this.save.data.selectedAugments[this.ship];
    this.mode = mode;
    this.runSeed = mode === 'daily' ? dailySeed() : Date.now();
    this.rng.reseed(this.runSeed);
    this.threat = 1;
    this.damageTaken = 0;
    this.bossKills = 0;
    this.deathCause = undefined;
    this.trainingDamage = 0;
    this.trainingTime = training ? 45 : 0;
    this.augmentCritTime = 0;
    this.augmentDroneTime = 0;
    for (const source of Object.keys(this.damageBySource) as DamageSource[]) delete this.damageBySource[source];
    this.cardHistory.length = 0;
    this.secondaryAbility = SHIPS[this.ship].secondaryAbility;
    this.secondaryCooldown = 0;
    this.abilityCooldown = 0;
    this.abilityTime = 0;
    this.gravityBomb = undefined;
    this.save.data.lastDifficulty = difficulty;
    this.save.save();
    this.stats = createBaseStats(this.save.data.meta);
    SHIPS[this.ship].apply(this.stats);
    WEAPONS[this.weapon].apply(this.stats);
    augmentById(this.selectedAugment)?.apply(this.stats);
    if (this.mode === 'rockets') {
      this.stats.missileCount += 2;
      this.stats.missileCooldown *= 0.65;
    } else if (this.mode === 'oneHp') {
      this.stats.maxHp = 1;
      this.stats.maxShield = 0;
      this.stats.armor = 0;
    }
    this.player = this.createPlayer();
    this.player.radius = SHIPS[this.ship].radius;
    this.player.hp = this.stats.maxHp;
    this.player.shield = this.stats.maxShield;
    this.player.revives = this.stats.revives;
    this.player.x = this.renderer.width * 0.5;
    this.player.y = this.renderer.height * 0.82;
    this.input.x = this.player.x;
    this.input.y = this.player.y;
    this.tutorialStep = !training && !this.save.data.tutorialComplete ? 0 : -1;
    this.tutorialStartX = this.player.x;
    this.tutorialStartY = this.player.y;
    this.ranks.clear();
    this.banished.clear();
    this.droneCooldowns.length = 0;
    this.dronePositions.length = 0;
    this.wave = 1;
    this.sector = 'void';
    this.routeChosen = true;
    this.currentRoutes = [];
    this.asteroidTimer = 2.5;
    this.kills = 0;
    this.score = 0;
    this.cores = 0;
    this.runTime = 0;
    this.overdrive = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.rerolls = 1 + Math.floor((this.save.data.meta.fortune ?? 0) / 5);
    this.banishes = 1;
    this.runRecorded = false;
    this.accumulator = 0;
    this.status = 'playing';
    if (training) this.setupTraining();
    else this.beginWave();
    this.view?.showPlaying();
  }

  togglePause(): void {
    if (this.status === 'playing') {
      this.status = 'paused';
      this.input.releaseWeapons();
      this.view?.showPause();
    } else if (this.status === 'paused') {
      this.resume();
    }
  }

  resume(unlockAudio = true): void {
    if (this.status !== 'paused' || this.platformPause) return;
    if (unlockAudio) void this.audio.unlock();
    this.audio.play('click');
    this.status = 'playing';
    this.accumulator = 0;
    this.view?.showPlaying();
  }

  setPlatformPause(paused: boolean): void {
    const shouldResume = !paused && this.platformPause;
    this.platformPause = paused;
    if (paused && this.status === 'playing') this.togglePause();
    else if (shouldResume && this.status === 'paused') {
      this.platformPause = false;
      this.resume(false);
    }
    this.audio.setPaused(this.platformPause || this.status === 'paused' || this.status === 'levelup' || this.status === 'route' || this.status === 'gameover');
  }

  openHangar(): void {
    if (this.status === 'playing' || this.status === 'levelup' || this.status === 'route' || this.status === 'paused') this.recordRun();
    this.clearWorld();
    this.status = 'hangar';
    this.input.releaseWeapons();
    this.audio.play('click');
    this.view?.showHangar();
  }

  returnToMenu(): void {
    if (this.status === 'playing' || this.status === 'levelup' || this.status === 'route' || this.status === 'paused') this.recordRun();
    this.clearWorld();
    this.status = 'menu';
    this.input.releaseWeapons();
    this.audio.play('click');
    this.view?.showMenu();
  }

  purchaseShip(id: ShipId): void {
    const definition = SHIPS[id];
    if (this.save.unlockShip(id, definition.unlockCost)) {
      this.audio.play('levelup');
      this.view?.updateHangar();
    } else this.audio.play('hurt', 0.25);
  }

  selectShip(id: ShipId): void {
    if (this.save.selectShip(id)) {
      this.audio.play('click');
      this.view?.updateHangar();
    }
  }

  purchaseMeta(id: string): void {
    const definition = META_UPGRADES.find((item) => item.id === id);
    if (!definition) return;
    const level = this.save.data.meta[id] ?? 0;
    if (this.save.purchase(id, metaCost(definition, level))) {
      this.audio.play('levelup', 0.65);
      this.view?.updateHangar();
    } else {
      this.audio.play('hurt', 0.25);
    }
  }

  selectUpgrade(id: string): void {
    if (this.status !== 'levelup' || !this.currentChoices.some((choice) => choice.id === id)) return;
    const definition = UPGRADE_MAP.get(id);
    if (!definition) return;
    definition.apply(this.stats, this.player);
    const rank = (this.ranks.get(id) ?? 0) + 1;
    this.ranks.set(id, rank);
    this.cardHistory.push({ id, rank, wave: this.wave, time: this.runTime });
    if (definition.requires && !this.training) this.save.discoverEvolution(id);
    this.player.hp = Math.min(this.player.hp, this.stats.maxHp);
    this.player.shield = Math.min(this.player.shield, this.stats.maxShield);
    this.player.invulnerable = Math.max(this.player.invulnerable, 1.5);
    this.audio.play('levelup');
    this.renderer.flash(0.13, 0x65eeff);
    if (this.player.xp >= this.player.xpNext) {
      this.player.xp -= this.player.xpNext;
      this.player.level += 1;
      this.player.xpNext = this.nextXpThreshold();
    } else {
      this.status = 'playing';
      this.view?.showPlaying();
      return;
    }
    this.rollChoices();
    this.view?.showLevelUp(this.currentChoices);
  }

  rerollUpgrades(): void {
    if (this.status !== 'levelup' || this.rerolls <= 0) return;
    this.rerolls -= 1;
    this.audio.play('click');
    this.rollChoices();
    this.view?.showLevelUp(this.currentChoices);
  }

  banishUpgrade(id: string): void {
    if (this.status !== 'levelup' || this.banishes <= 0 || !this.currentChoices.some((choice) => choice.id === id)) return;
    this.banishes -= 1;
    this.banished.add(id);
    this.audio.play('click');
    this.rollChoices();
    this.view?.showLevelUp(this.currentChoices);
  }

  getUpgradeRank(id: string): number {
    return this.ranks.get(id) ?? 0;
  }

  getBuild(): Array<{ definition: UpgradeDefinition; rank: number }> {
    const build: Array<{ definition: UpgradeDefinition; rank: number }> = [];
    for (const [id, rank] of this.ranks) {
      const definition = UPGRADE_MAP.get(id);
      if (definition) build.push({ definition, rank });
    }
    return build.sort((a, b) => b.rank - a.rank);
  }

  getAnalytics(): BuildAnalytics {
    return getBuildAnalytics(this.stats, this.weapon, this.player.beamHeat, this.sectorDefinition.playerDamageMultiplier);
  }

  getUpgradePreview(id: string): { changes: string[]; synergy: string } {
    const definition = UPGRADE_MAP.get(id);
    if (!definition) return { changes: [], synergy: '' };
    let synergy = '';
    if (definition.requires) synergy = 'ГОТОВА К ЭВОЛЮЦИИ';
    else {
      for (const evolution of UPGRADES) {
        const required = evolution.requires?.[id];
        if (!required) continue;
        const rank = this.getUpgradeRank(id);
        synergy = rank + 1 >= required ? `ПУТЬ К ЭВОЛЮЦИИ: ${evolution.name.replace('ЭВОЛЮЦИЯ: ', '')}` : `До эволюции: ранг ${rank + 1}/${required}`;
        break;
      }
    }
    return {
      changes: previewUpgrade(definition, this.stats, this.player, this.weapon, this.player.beamHeat, this.sectorDefinition.playerDamageMultiplier),
      synergy,
    };
  }

  activateSecondaryAbility(): void {
    if (this.secondaryAbility) this.activateAbility(this.secondaryAbility);
  }

  activateAbility(id: AbilityId = this.ability): void {
    if (this.status !== 'playing' || (id === this.ability ? this.abilityCooldown > 0 : this.secondaryCooldown > 0)) return;
    const definition = ABILITIES[id];
    if (id === this.ability) this.abilityCooldown = definition.cooldown;
    else this.secondaryCooldown = definition.cooldown;
    this.abilityTime = definition.duration;
    this.audio.play('shield');
    if (id === 'dash') {
      const speed = Math.hypot(this.player.vx, this.player.vy);
      const directionX = speed > 20 ? this.player.vx / speed : 0;
      const directionY = speed > 20 ? this.player.vy / speed : -1;
      const startX = this.player.x;
      const startY = this.player.y;
      this.input.x = clamp(this.input.x + directionX * 180, 28, this.renderer.width - 28);
      this.input.y = clamp(this.input.y + directionY * 180, 72, this.renderer.height - 32);
      this.player.x = this.input.x;
      this.player.y = this.input.y;
      this.player.invulnerable = Math.max(this.player.invulnerable, 1.1);
      this.spawnExplosion(startX, startY, definition.color, 0.8);
      this.nova(this.player.x, this.player.y, this.stats.damage * 2.5, 105);
    } else if (id === 'slow') {
      this.spawnParticle(this.player.x, this.player.y, 'ring', definition.color, 420, 0.75, 0, 0, 1.2);
      this.renderer.spawnMessage(this.player.x, this.player.y - 48, 'СТАСИС-ПОЛЕ', '#a9b8ff');
    } else if (id === 'gravity') {
      this.gravityBomb = { x: this.player.x, y: clamp(this.player.y - 260, 120, this.renderer.height * 0.48), life: 4, radius: 250 };
      this.spawnParticle(this.gravityBomb.x, this.gravityBomb.y, 'ring', definition.color, 240, 0.7, 0, 0, 1.4);
    } else if (id === 'drones') {
      this.spawnParticle(this.player.x, this.player.y, 'ring', definition.color, 260, 0.6, 0, 0, 1.5);
      this.renderer.spawnMessage(this.player.x, this.player.y - 48, 'РОЙ ПЕРЕГРУЗКИ', '#72ffb0');
    } else {
      const count = this.bullets.items.filter((bullet) => bullet.owner === 'enemy').length;
      for (let index = this.bullets.items.length - 1; index >= 0; index -= 1) {
        if (this.bullets.items[index]!.owner === 'enemy') this.releaseBulletAt(index);
      }
      this.spawnParticle(this.player.x, this.player.y, 'ring', definition.color, 700, 0.8, 0, 0, 1.2);
      this.gainXP(Math.min(80, count) * 0.35 * this.stats.xpGain);
    }
    this.applyMasteryAbility(id !== this.ability);
  }

  private applyMasteryAbility(secondary: boolean): void {
    if (!this.selectedAugment) return;
    const ability = secondary ? this.secondaryAbility : this.ability;
    if (this.selectedAugment === 'overclock' && ability === 'dash') this.augmentCritTime = 3;
    else if (this.selectedAugment === 'dashNova' && ability === 'dash') this.nova(this.player.x, this.player.y, this.stats.damage * 5, 180);
    else if (this.selectedAugment === 'siege') this.nova(this.player.x, this.player.y, this.stats.missileDamage * 0.65, 160);
    else if (this.selectedAugment === 'shieldPulse') this.player.shield = Math.min(this.stats.maxShield, this.player.shield + 25);
    else if (this.selectedAugment === 'droneProtocol') this.augmentDroneTime = 5;
    else if (this.selectedAugment === 'repairSwarm') this.player.hp = Math.min(this.stats.maxHp, this.player.hp + 18);
    else if (this.selectedAugment === 'phaseEcho') {
      if (secondary) this.abilityCooldown *= 0.8;
      else this.secondaryCooldown = 0;
    } else if (this.selectedAugment === 'voidPurge' && ability === 'purge') this.nova(this.player.x, this.player.y, this.stats.damage * 7, 240);
  }

  private updateGravityBomb(dt: number): void {
    const bomb = this.gravityBomb;
    if (!bomb) return;
    bomb.life -= dt;
    for (const enemy of this.enemies.items) {
      const dx = bomb.x - enemy.x;
      const dy = bomb.y - enemy.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 35 && distance < bomb.radius) {
        enemy.x += dx / distance * 95 * dt;
        enemy.y += dy / distance * 95 * dt;
        enemy.slow = Math.min(enemy.slow, 0.65);
      }
    }
    if (bomb.life <= 0) {
      this.nova(bomb.x, bomb.y, this.stats.damage * 12, bomb.radius);
      this.gravityBomb = undefined;
    }
  }

  private get effectIntensity(): number {
    return this.renderer.effectQuality * this.save.data.settings.particles;
  }

  get sectorDefinition(): SectorDefinition {
    return SECTORS[this.sector];
  }

  selectRoute(id: SectorId): void {
    if (this.status !== 'route' || !this.currentRoutes.some((route) => route.id === id)) return;
    this.sector = id;
    this.routeChosen = true;
    this.intermission = 2.2;
    this.status = 'playing';
    this.audio.play('levelup');
    this.view?.showPlaying();
    this.view?.announce(this.sectorDefinition.name, 'Маршрут зафиксирован · следующие пять волн изменены');
  }

  private offerRouteChoice(): void {
    const pool = ROUTE_SECTORS.filter((id) => id !== this.sector);
    const choices: SectorDefinition[] = [];
    while (choices.length < 3 && pool.length > 0) choices.push(SECTORS[pool.splice(this.rng.int(0, pool.length - 1), 1)[0]!]);
    this.currentRoutes = choices;
    this.status = 'route';
    this.input.releaseWeapons();
    this.view?.showRouteChoice(choices);
  }

  private frame(rawDt: number): void {
    const timestamp = performance.now();
    const measuredDt = this.lastFrameTimestamp > 0 ? (timestamp - this.lastFrameTimestamp) / 1000 : rawDt;
    this.lastFrameTimestamp = timestamp;
    const dt = Math.min(0.05, Math.max(0.001, measuredDt));
    this.fps = lerp(this.fps, 1 / Math.max(0.001, measuredDt), 0.08);
    if (this.status === 'playing') {
      this.accumulator = Math.min(this.accumulator + dt, FIXED_STEP * 4);
      let steps = 0;
      while (this.accumulator >= FIXED_STEP && steps < 3 && this.status === 'playing') {
        this.update(FIXED_STEP);
        this.accumulator -= FIXED_STEP;
        steps += 1;
      }
      this.hudTimer -= dt;
      if (this.hudTimer <= 0) {
        this.hudTimer = 0.08;
        this.view?.updateHUD(this.hudSnapshot());
      }
    } else if (this.status === 'gameover') {
      this.trauma = Math.max(0, this.trauma - dt * 1.8);
      this.updateEffects(dt);
    }
    this.renderer.sync(this, dt, measuredDt);
    this.audio.setPaused(this.platformPause || this.status === 'paused' || this.status === 'levelup' || this.status === 'route' || this.status === 'gameover');
    const intensity = this.status === 'playing' ? clamp((this.threat - 1) * 0.16 + this.wave / 40 + this.enemies.items.length / 250 + this.bullets.items.length / 2600 + (1 - this.player.hp / this.stats.maxHp) * 0.12, 0.08, 1) : 0.08;
    this.audio.update(intensity, this.bossActive && this.status === 'playing');
  }

  private update(dt: number): void {
    this.elapsed += dt;
    this.runTime += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    this.overdrive = Math.max(0, this.overdrive - dt);
    this.abilityCooldown = Math.max(0, this.abilityCooldown - dt);
    this.secondaryCooldown = Math.max(0, this.secondaryCooldown - dt);
    this.abilityTime = Math.max(0, this.abilityTime - dt);
    this.hitSoundTimer = Math.max(0, this.hitSoundTimer - dt);
    this.augmentCritTime = Math.max(0, this.augmentCritTime - dt);
    this.augmentDroneTime = Math.max(0, this.augmentDroneTime - dt);
    if (this.comboTimer > 0) this.comboTimer -= dt;
    else this.comboCount = Math.max(0, this.comboCount - dt * 12);
    this.updatePlayer(dt);
    this.updateTutorial();
    this.updateDrones(dt);
    this.updateEnemies(dt);
    this.updateArena(dt);
    this.updateGravityBomb(dt);
    this.hash.clear();
    for (const enemy of this.enemies.items) if (enemy.active) this.hash.insert(enemy);
    this.updateBullets(dt);
    this.updatePickups(dt);
    this.updateEffects(dt);
    this.updateWaves(dt);
    if (this.player.hp > 0) {
      this.player.hp = Math.min(this.stats.maxHp, this.player.hp + this.stats.regen * dt);
      this.player.shieldDelay = Math.max(0, this.player.shieldDelay - dt);
      if (this.player.shieldDelay <= 0) this.player.shield = Math.min(this.stats.maxShield, this.player.shield + this.stats.shieldRegen * dt);
    }
  }

  private updatePlayer(dt: number): void {
    const player = this.player;
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    player.fireCooldown -= dt;
    player.missileCooldown -= dt;
    const keyboardSpeed = this.stats.moveSpeed * dt;
    if (this.input.keys.has('KeyA') || this.input.keys.has('ArrowLeft')) this.input.x -= keyboardSpeed;
    if (this.input.keys.has('KeyD') || this.input.keys.has('ArrowRight')) this.input.x += keyboardSpeed;
    if (this.input.keys.has('KeyW') || this.input.keys.has('ArrowUp')) this.input.y -= keyboardSpeed;
    if (this.input.keys.has('KeyS') || this.input.keys.has('ArrowDown')) this.input.y += keyboardSpeed;
    this.input.x = clamp(this.input.x, 28, this.renderer.width - 28);
    this.input.y = clamp(this.input.y, 72, this.renderer.height - 32);
    player.vx = (this.input.x - player.x) / dt;
    player.vy = (this.input.y - player.y) / dt;
    player.x = this.input.x;
    player.y = this.input.y;
    const primaryFiring = this.input.left || this.input.keys.has('Space');
    if (this.mode === 'rockets') {
      if (primaryFiring && player.missileCooldown <= 0) this.fireMissiles();
    } else if (this.weapon === 'beam') this.updateBeam(primaryFiring, dt);
    else if (primaryFiring && player.fireCooldown <= 0) this.firePrimary();
    if ((this.input.right || this.input.keys.has('ShiftLeft') || this.input.keys.has('KeyR')) && player.missileCooldown <= 0) this.fireMissiles();
  }

  private currentCritChance(): number {
    return Math.min(0.95, this.stats.critChance + (this.augmentCritTime > 0 ? 0.25 : 0));
  }

  private updateBeam(firing: boolean, dt: number): void {
    const player = this.player;
    player.beamOverheated = Math.max(0, player.beamOverheated - dt);
    if (firing && player.beamOverheated <= 0) {
      player.beamHeat = Math.min(100, player.beamHeat + 30 * dt);
      if (player.beamHeat >= 100) {
        player.beamOverheated = 2;
        this.audio.play('shieldDown');
        this.renderer.spawnMessage(player.x, player.y - 45, 'ПЕРЕГРЕВ', '#ff7b9f');
      } else if (player.fireCooldown <= 0) this.fireBeam();
    } else {
      player.beamHeat = Math.max(0, player.beamHeat - (player.beamOverheated > 0 ? 45 : 26) * dt);
    }
  }

  private fireBeam(): void {
    const player = this.player;
    this.player.fireCooldown = Math.max(0.035, 1 / (this.stats.fireRate * 1.8 * (this.overdrive > 0 ? 1.5 : 1)));
    const width = 9 + this.stats.projectileSize * 4;
    const damageScale = 0.28 * (1 + player.beamHeat / 200) * (this.overdrive > 0 ? 1.25 : 1);
    for (let index = this.enemies.items.length - 1; index >= 0; index -= 1) {
      const enemy = this.enemies.items[index]!;
      if (enemy.y >= player.y || Math.abs(enemy.x - player.x) > enemy.radius + width) continue;
      const crit = this.rng.chance(this.currentCritChance());
      if (this.stats.burn > 0) {
        enemy.burnTime = 3;
        enemy.burnDps = Math.max(enemy.burnDps, this.stats.damage * damageScale * this.stats.burn);
      }
      if (this.stats.cryo > 0) enemy.slow = Math.min(enemy.slow, Math.max(0.25, 1 - this.stats.cryo));
      this.damageEnemy(enemy, this.stats.damage * damageScale * (crit ? this.stats.critMultiplier : 1), crit);
      if (this.stats.chain > 0 && this.rng.chance(0.12)) this.chainLightning(enemy.x, enemy.y, this.stats.damage * damageScale * this.stats.chainDamage, this.stats.chain, enemy.id);
    }
    this.spawnMuzzle(player.x, player.y - 34, 0x79ffff);
    this.audio.play(this.weapon, 0.35);
  }

  private firePrimary(): void {
    const rate = this.stats.fireRate * (this.overdrive > 0 ? 1.75 : 1);
    this.player.fireCooldown = Math.max(0.018, 1 / rate);
    const count = Math.floor(this.stats.projectileCount);
    const center = (count - 1) * 0.5;
    for (let index = 0; index < count; index += 1) {
      const offset = (index - center) * this.stats.spread;
      const angle = -Math.PI * 0.5 + offset;
      const crit = this.rng.chance(this.currentCritChance());
      const damage = this.stats.damage * (crit ? this.stats.critMultiplier : 1) * (this.overdrive > 0 ? 1.25 : 1);
      const bullet = this.spawnBullet('player', this.stats.ionLance ? 'heavy' : 'bolt', this.player.x + (index - center) * 8, this.player.y - 30, Math.cos(angle) * this.stats.projectileSpeed, Math.sin(angle) * this.stats.projectileSpeed, damage);
      if (!bullet) continue;
      bullet.pierce = this.stats.pierce;
      bullet.ricochet = this.stats.ricochet;
      bullet.chain = this.stats.chain;
      bullet.crit = crit;
      bullet.size = this.stats.projectileSize;
      bullet.life = WEAPONS[this.weapon].life;
      bullet.tint = crit ? 0xffe879 : this.stats.ionLance ? 0x8fffff : this.overdrive > 0 ? 0xffbc57 : WEAPONS[this.weapon].color;
      bullet.radius = 6 * this.stats.projectileSize;
    }
    this.audio.play(this.weapon, 0.65);
    this.spawnMuzzle(this.player.x, this.player.y - 34, WEAPONS[this.weapon].color);
  }

  private fireMissiles(): void {
    this.player.missileCooldown = Math.max(0.35, this.stats.missileCooldown);
    for (let index = 0; index < Math.floor(this.stats.missileCount); index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const bullet = this.spawnBullet('player', 'missile', this.player.x + side * 22, this.player.y + 4, side * (120 + index * 10), -390 - index * 12, this.stats.missileDamage);
      if (!bullet) continue;
      bullet.radius = 11;
      bullet.blast = this.stats.blastRadius;
      bullet.cluster = this.stats.missileCluster;
      bullet.turnRate = 5.5 + this.stats.rocketSwarm * 1.5;
      bullet.targetId = this.findNearestEnemy(bullet.x, bullet.y, Number.POSITIVE_INFINITY)?.id ?? 0;
      bullet.life = 7;
      bullet.size = 1.15;
      bullet.tint = 0x82ffbf;
    }
    this.audio.play('missile');
    this.trauma = Math.max(this.trauma, 0.14);
  }

  private updateDrones(dt: number): void {
    const boosted = this.ability === 'drones' && this.abilityTime > 0;
    const count = Math.floor(this.stats.drones) + (boosted && this.stats.drones === 0 ? 2 : 0);
    while (this.dronePositions.length < count) this.dronePositions.push({ x: this.player.x, y: this.player.y });
    this.dronePositions.length = count;
    this.droneCooldowns.length = count;
    for (let index = 0; index < count; index += 1) {
      const angle = this.elapsed * (1.25 + this.stats.phantomDrones * 0.4) + index * TAU / Math.max(1, count);
      const position = this.dronePositions[index]!;
      position.x = this.player.x + Math.cos(angle) * (58 + count * 2);
      position.y = this.player.y + 8 + Math.sin(angle) * 30;
      this.droneCooldowns[index] = (this.droneCooldowns[index] ?? 0) - dt;
      if (this.droneCooldowns[index]! > 0) continue;
      const target = this.findNearestEnemy(position.x, position.y, 850);
      if (!target) continue;
      this.droneCooldowns[index] = 1 / (this.stats.droneFireRate * (boosted ? 3 : 1));
      const angleToTarget = Math.atan2(target.y - position.y, target.x - position.x);
      const crit = this.rng.chance(this.currentCritChance());
      const bullet = this.spawnBullet('drone', 'bolt', position.x, position.y - 10, Math.cos(angleToTarget) * 850, Math.sin(angleToTarget) * 850, this.stats.damage * this.stats.droneDamage * (boosted ? 2 : 1) * (this.augmentDroneTime > 0 ? 1.5 : 1) * (crit ? this.stats.critMultiplier : 1));
      if (bullet) {
        bullet.pierce = Math.floor(this.stats.pierce / 2);
        bullet.chain = this.stats.chain;
        bullet.crit = crit;
        bullet.size = 0.65;
        bullet.radius = 5;
        bullet.tint = 0x76ffcb;
      }
    }
  }

  private updateEnemies(dt: number): void {
    for (let index = this.enemies.items.length - 1; index >= 0; index -= 1) {
      const enemy = this.enemies.items[index]!;
      enemy.age += dt;
      enemy.flash = Math.max(0, enemy.flash - dt);
      enemy.slow = lerp(enemy.slow, 1, dt * 0.35);
      if (enemy.burnTime > 0) {
        enemy.burnTime -= dt;
        enemy.burnTick -= dt;
        const burnDamage = enemy.burnDps * dt;
        this.trackDamage('burn', enemy.trainingTarget ? burnDamage : Math.min(enemy.hp, burnDamage));
        if (!enemy.trainingTarget) enemy.hp -= burnDamage;
        if (enemy.burnTick <= 0) {
          enemy.burnTick = 0.22;
          this.spawnParticle(enemy.x + this.rng.range(-15, 15), enemy.y, 'glow', 0xff6f38, 30, 0.35, 0, -45);
        }
        if (enemy.hp <= 0 && !enemy.trainingTarget) {
          this.killEnemy(enemy);
          continue;
        }
      }
      if (enemy.trainingTarget) continue;
      if (enemy.kind === 'boss') this.updateBoss(enemy, dt);
      else this.updateRegularEnemy(enemy, dt);
      if (!enemy.active || this.player.hp <= 0) continue;
      if (enemy.y > this.renderer.height + 100 || enemy.x < -180 || enemy.x > this.renderer.width + 180) {
        this.renderer.releaseEnemy(enemy);
        this.enemies.releaseAt(index);
        continue;
      }
      const collisionRadius = enemy.radius + this.player.radius;
      if (enemy.kind === 'kamikaze' && distanceSquared(enemy.x, enemy.y, this.player.x, this.player.y) < 220 * 220) this.audio.play('kamikaze', 0.6);
      if (enemy.y > 0 && distanceSquared(enemy.x, enemy.y, this.player.x, this.player.y) < collisionRadius * collisionRadius) {
        this.damagePlayer(enemy.damage, `Столкновение: ${enemy.kind === 'boss' ? this.bossName : ENEMIES[enemy.kind].name}`);
        if (enemy.kind === 'kamikaze') this.killEnemy(enemy, false);
        else {
          this.trackDamage('collision', Math.min(enemy.hp, enemy.maxHp * 0.3));
          enemy.hp -= enemy.maxHp * 0.3;
          enemy.vy = -enemy.speed;
          if (enemy.hp <= 0) this.killEnemy(enemy);
        }
      }
    }
  }

  private updateRegularEnemy(enemy: Enemy, dt: number): void {
    const speed = enemy.speed * enemy.slow;
    switch (enemy.kind) {
      case 'scout':
        if (enemy.y < enemy.targetY) enemy.y += speed * dt;
        else {
          enemy.x += Math.sin(enemy.age * 2 + enemy.phase) * speed * 0.65 * dt;
          enemy.y += speed * 0.12 * dt;
        }
        break;
      case 'weaver':
        enemy.y += speed * dt;
        enemy.x += Math.sin(enemy.age * 4.5 + enemy.phase) * speed * 1.3 * dt;
        break;
      case 'tank':
      case 'carrier':
      case 'sentinel':
        if (enemy.y < enemy.targetY) enemy.y += speed * dt;
        else enemy.x += Math.sin(enemy.age * 0.9 + enemy.phase) * speed * 0.45 * dt;
        break;
      case 'sniper':
        if (enemy.y < enemy.targetY) enemy.y += speed * dt;
        else enemy.x = lerp(enemy.x, this.player.x, dt * 0.22);
        break;
      case 'kamikaze': {
        const desired = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
        const current = Math.atan2(enemy.vy, enemy.vx);
        const angle = current + normalizeAngle(desired - current) * dt * (enemy.y < 80 ? 0.6 : 2.6);
        const boost = enemy.y < 80 ? 0.65 : 1 + Math.min(1.2, enemy.age * 0.15);
        enemy.vx = Math.cos(angle) * speed * boost;
        enemy.vy = Math.sin(angle) * speed * boost;
        enemy.x += enemy.vx * dt;
        enemy.y += enemy.vy * dt;
        if (this.rng.chance(0.25 * this.effectIntensity)) this.spawnParticle(enemy.x, enemy.y - 18, 'glow', 0xff6138, 28, 0.28, 0, -35);
        break;
      }
      case 'splitter':
        enemy.y += speed * dt;
        enemy.x += Math.sin(enemy.age * 2.5 + enemy.phase) * speed * 0.75 * dt;
        break;
      case 'meteor':
        enemy.y += speed * dt;
        enemy.x += Math.sin(enemy.age * 0.8 + enemy.phase) * speed * 0.25 * dt;
        break;
      case 'turret':
      case 'generator':
        break;
      case 'boss':
        break;
    }
    enemy.x = clamp(enemy.x, -100, this.renderer.width + 100);
    enemy.fireTimer -= dt * enemy.slow;
    enemy.telegraph = enemy.kind === 'sniper' && enemy.fireTimer < 0.72 && enemy.fireTimer > 0 ? enemy.fireTimer : 0;
    if (enemy.fireTimer <= 0 && enemy.y > 15 && enemy.y < this.renderer.height * 0.78 && enemy.kind !== 'kamikaze' && enemy.kind !== 'meteor' && enemy.kind !== 'generator') {
      this.enemyFire(enemy);
      enemy.fireTimer = ENEMIES[enemy.kind].fireRate * this.rng.range(0.85, 1.15) * (this.difficulty === 'hardcore' ? 0.82 : 1);
    }
  }

  private bossDefinition(enemy: Enemy) {
    return BOSS_LIST[enemy.bossVariant] ?? BOSS_LIST[0]!;
  }

  private updateBoss(enemy: Enemy, dt: number): void {
    const definition = this.bossDefinition(enemy);
    if (enemy.targetY === 0) {
      enemy.y += enemy.speed * 3 * dt;
      enemy.attackTimer = 1;
      if (enemy.y >= 135) enemy.targetY = 135;
      return;
    }
    enemy.x = this.renderer.width * 0.5 + Math.sin(enemy.age * (0.45 + enemy.bossPhase * 0.1)) * this.renderer.width * 0.31;
    enemy.y = 135 + Math.sin(enemy.age * 1.2) * 18;
    const ratio = enemy.hp / enemy.maxHp;
    const nextPhase = ratio < definition.phases[2].hpThreshold ? 2 : ratio < definition.phases[1].hpThreshold ? 1 : 0;
    if (nextPhase !== enemy.bossPhase) {
      enemy.bossPhase = nextPhase;
      enemy.attackTimer = 1.4;
      this.spawnExplosion(enemy.x, enemy.y, definition.tint, 2.2);
      this.view?.announce(`ФАЗА ${nextPhase + 1}`, definition.hint);
      this.audio.play('bossPhase');
    }
    enemy.vulnerability = Math.max(0, enemy.vulnerability - dt);
    enemy.attackTimer -= dt * enemy.slow;
    enemy.telegraph = enemy.attackTimer > 0 && enemy.attackTimer < 0.65 ? enemy.attackTimer : 0;
    if (enemy.attackTimer <= 0) {
      this.bossAttack(enemy);
      enemy.attackTimer = definition.phases[enemy.bossPhase]!.attackInterval * (this.difficulty === 'hardcore' ? 0.82 : 1);
    }
  }

  private bossAttack(enemy: Enemy): void {
    const definition = this.bossDefinition(enemy);
    const pattern = definition.patterns[(Math.floor(enemy.age / 4) + enemy.bossPhase + Math.floor(this.wave / 5)) % definition.patterns.length];
    const bulletSpeed = 205 + this.wave * 2.2 + enemy.bossPhase * 25;
    if (pattern === 'ring') {
      const count = 16 + enemy.bossPhase * 6 + Math.floor(this.wave / 10);
      const offset = enemy.age * 0.8;
      for (let index = 0; index < count; index += 1) {
        const angle = offset + index * TAU / count;
        this.spawnEnemyBullet(enemy, angle, bulletSpeed, 'orb');
      }
    } else if (pattern === 'fan') {
      const aimed = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
      const count = 7 + enemy.bossPhase * 2;
      for (let index = 0; index < count; index += 1) {
        this.spawnEnemyBullet(enemy, aimed + (index - (count - 1) / 2) * 0.13, bulletSpeed * 1.2, index === Math.floor(count / 2) ? 'heavy' : 'bolt');
      }
      if (enemy.bossPhase > 0) {
        this.spawnEnemy('kamikaze', enemy.x - 65, enemy.y + 30, false, true);
        this.spawnEnemy('kamikaze', enemy.x + 65, enemy.y + 30, false, true);
      }
    } else {
      for (let arm = 0; arm < 4; arm += 1) {
        const angle = enemy.age * 1.7 + arm * Math.PI * 0.5;
        for (let step = 0; step < 3 + enemy.bossPhase; step += 1) this.spawnEnemyBullet(enemy, angle + step * 0.13, bulletSpeed * (0.8 + step * 0.12), 'orb');
      }
      if (this.enemies.items.length < 100) this.spawnEnemy(this.wave >= 10 ? 'sentinel' : 'scout', enemy.x, enemy.y + 45, false, true);
    }
    if (definition.mechanic === 'laserWalls' && pattern !== 'fan') this.spawnLaserWall(enemy);
    if (definition.mechanic === 'gravityControl' && pattern === 'spiral') this.spawnEnemy('meteor', this.rng.range(60, this.renderer.width - 60), -70, false, true);
    if (definition.mechanic === 'weakpoint') enemy.vulnerability = 2.4;
    if (definition.mechanic === 'riftPortals') this.syncRiftPairs(enemy.bossPhase);
    if (definition.mechanic === 'omegaBeams') this.spawnOmegaBeam(enemy);
    this.trauma = Math.max(this.trauma, 0.18);
    this.audio.play('missile', 0.7);
  }

  private syncRiftPairs(phase: number): void {
    const count = phase > 0 ? 2 : 1;
    while (this.riftPairs.length < count) {
      const reversed = this.riftPairs.length % 2 === 1;
      this.riftPairs.push({
        id: this.riftPairs.length + 1,
        ax: this.renderer.width * (reversed ? 0.86 : 0.14), ay: this.renderer.height * 0.34,
        bx: this.renderer.width * (reversed ? 0.14 : 0.86), by: this.renderer.height * 0.67,
        age: 0,
      });
    }
  }

  private spawnOmegaBeam(enemy: Enemy): void {
    if (this.omegaBeams.length >= 2) this.omegaBeams.shift();
    enemy.vulnerability = 0;
    this.omegaBeams.push({
      x: enemy.x, y: enemy.y,
      angle: Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x),
      telegraph: 1.05,
      life: 2.1 + enemy.bossPhase * 0.25,
      rotationSpeed: (this.rng.chance(0.5) ? -1 : 1) * (0.32 + enemy.bossPhase * 0.09),
      damage: enemy.damage * 0.8,
      length: Math.hypot(this.renderer.width, this.renderer.height),
      spokes: 2 + enemy.bossPhase * 2,
    });
  }

  private updateBossHazards(dt: number): void {
    for (const pair of this.riftPairs) pair.age += dt;
    for (let index = this.omegaBeams.length - 1; index >= 0; index -= 1) {
      const beam = this.omegaBeams[index]!;
      if (beam.telegraph > 0) {
        beam.telegraph -= dt;
        continue;
      }
      beam.life -= dt;
      beam.angle += beam.rotationSpeed * dt;
      if (beam.life <= 0) {
        this.omegaBeams.splice(index, 1);
        const boss = this.enemies.items.find((enemy) => enemy.kind === 'boss' && this.bossDefinition(enemy).mechanic === 'omegaBeams');
        if (boss) boss.vulnerability = 1.8;
        continue;
      }
      for (let spoke = 0; spoke < beam.spokes; spoke += 1) {
        const angle = beam.angle + spoke * TAU / beam.spokes;
        const directionX = Math.cos(angle);
        const directionY = Math.sin(angle);
        const offsetX = this.player.x - beam.x;
        const offsetY = this.player.y - beam.y;
        const along = offsetX * directionX + offsetY * directionY;
        const distance = Math.abs(offsetX * directionY - offsetY * directionX);
        if (along >= 0 && along <= beam.length && distance < this.player.radius + 7) {
          this.damagePlayer(beam.damage, 'Луч ОМЕГА-ПРАЙМ');
          break;
        }
      }
    }
  }

  private clearBossHazards(): void {
    this.laserWalls.length = 0;
    this.riftPairs.length = 0;
    this.omegaBeams.length = 0;
    this.controlZone = undefined;
  }

  private spawnLaserWall(enemy: Enemy): void {
    if (this.laserWalls.length >= 4) this.laserWalls.shift();
    this.laserWalls.push({
      active: true,
      y: this.rng.range(this.renderer.height * 0.3, this.renderer.height * 0.74),
      gapX: this.rng.range(140, this.renderer.width - 140),
      gapWidth: clamp(195 - this.wave * 1.5, 115, 195),
      telegraph: 1.15,
      life: 0.55,
      damage: enemy.damage * 1.2,
    });
  }

  private updateArena(dt: number): void {
    this.updateBossHazards(dt);
    for (let index = this.laserWalls.length - 1; index >= 0; index -= 1) {
      const wall = this.laserWalls[index]!;
      if (wall.telegraph > 0) wall.telegraph -= dt;
      else {
        wall.life -= dt;
        const outsideGap = this.player.x < wall.gapX - wall.gapWidth * 0.5 || this.player.x > wall.gapX + wall.gapWidth * 0.5;
        if (outsideGap && Math.abs(this.player.y - wall.y) < 17) this.damagePlayer(wall.damage, 'Лазерная стена Левиафана');
        if (wall.life <= 0) {
          wall.active = false;
          this.laserWalls.splice(index, 1);
        }
      }
    }
    const zone = this.controlZone;
    if (!zone?.active) return;
    zone.captured = Math.max(0, zone.captured - dt);
    zone.moveTimer -= dt;
    if (zone.moveTimer <= 0) {
      zone.x = this.rng.range(zone.radius + 35, this.renderer.width - zone.radius - 35);
      zone.y = this.rng.range(this.renderer.height * 0.38, this.renderer.height * 0.78);
      zone.progress = 0;
      zone.moveTimer = 7;
    }
    if (zone.captured > 0) return;
    const inside = distanceSquared(this.player.x, this.player.y, zone.x, zone.y) < zone.radius * zone.radius;
    zone.progress = clamp(zone.progress + (inside ? dt : -dt * 0.55), 0, 2);
    if (zone.progress >= 2) {
      zone.captured = 5;
      zone.progress = 0;
      this.audio.play('shield');
      this.renderer.spawnMessage(zone.x, zone.y - 30, 'ЗОНА СИНХРОНИЗИРОВАНА');
      this.nova(zone.x, zone.y, this.stats.damage * 6, zone.radius * 1.5);
    }
  }

  private enemyFire(enemy: Enemy): void {
    const angle = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
    const speed = 265 + this.wave * 2.5;
    switch (enemy.kind) {
      case 'tank':
        for (let index = -2; index <= 2; index += 1) this.spawnEnemyBullet(enemy, angle + index * 0.18, speed * 0.85, 'orb');
        break;
      case 'sniper':
        this.spawnEnemyBullet(enemy, angle, speed * 2.15, 'heavy');
        this.trauma = Math.max(this.trauma, 0.08);
        break;
      case 'sentinel': {
        const count = enemy.elite ? 12 : 8;
        for (let index = 0; index < count; index += 1) this.spawnEnemyBullet(enemy, enemy.age + index * TAU / count, speed * 0.8, 'orb');
        break;
      }
      case 'carrier':
        this.spawnEnemy('scout', enemy.x - 30, enemy.y + 25, false, true);
        this.spawnEnemy(this.wave > 12 ? 'weaver' : 'scout', enemy.x + 30, enemy.y + 25, false, true);
        this.spawnEnemyBullet(enemy, angle, speed, 'bolt');
        break;
      case 'splitter':
        this.spawnEnemyBullet(enemy, angle - 0.18, speed, 'bolt');
        this.spawnEnemyBullet(enemy, angle + 0.18, speed, 'bolt');
        break;
      default:
        this.spawnEnemyBullet(enemy, angle, speed, 'bolt');
        break;
    }
  }

  private spawnEnemyBullet(enemy: Enemy, angle: number, speed: number, kind: BulletKind): void {
    const adjustedSpeed = speed * this.stats.enemyBulletSlow;
    const bullet = this.spawnBullet('enemy', kind, enemy.x, enemy.y + enemy.radius * 0.35, Math.cos(angle) * adjustedSpeed, Math.sin(angle) * adjustedSpeed, enemy.damage);
    if (!bullet) return;
    bullet.sourceEnemy = enemy.kind;
    bullet.radius = kind === 'heavy' ? 12 : kind === 'orb' ? 8 : 7;
    bullet.size = kind === 'heavy' ? 1.4 : 1;
    bullet.tint = kind === 'heavy' ? 0xffdf68 : enemy.kind === 'boss' ? 0xff4fba : enemy.elite ? 0xffbf47 : 0xff526e;
    bullet.life = 12;
  }

  private teleportRiftBullet(bullet: Bullet): void {
    if (bullet.owner !== 'enemy' || bullet.portalCooldown > 0) return;
    const speed = Math.hypot(bullet.vx, bullet.vy) || 1;
    for (const pair of this.riftPairs) {
      const insideA = distanceSquared(bullet.x, bullet.y, pair.ax, pair.ay) < 32 * 32;
      const insideB = !insideA && distanceSquared(bullet.x, bullet.y, pair.bx, pair.by) < 32 * 32;
      if (!insideA && !insideB) continue;
      const targetX = insideA ? pair.bx : pair.ax;
      const targetY = insideA ? pair.by : pair.ay;
      if (distanceSquared(targetX, targetY, this.player.x, this.player.y) < 120 * 120) return;
      const exitDistance = 34 + bullet.radius;
      bullet.x = targetX + bullet.vx / speed * exitDistance;
      bullet.y = targetY + bullet.vy / speed * exitDistance;
      bullet.portalCooldown = 0.85;
      return;
    }
  }

  private updateBullets(dt: number): void {
    const gravityBoss = this.enemies.items.find((enemy) => enemy.kind === 'boss' && enemy.bossVariant === 3);
    for (let index = this.bullets.items.length - 1; index >= 0; index -= 1) {
      const bullet = this.bullets.items[index]!;
      bullet.life -= dt;
      bullet.portalCooldown = Math.max(0, bullet.portalCooldown - dt);
      if (bullet.life <= 0) {
        this.releaseBulletAt(index);
        continue;
      }
      if (bullet.kind === 'missile') this.updateMissile(bullet, dt);
      if (this.sectorDefinition.gravity > 0 || gravityBoss) {
        const wellX = gravityBoss?.x ?? this.renderer.width * 0.5;
        const wellY = gravityBoss ? gravityBoss.y + 120 : this.renderer.height * 0.35;
        const dx = wellX - bullet.x;
        const dy = wellY - bullet.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 45 && distance < 1100) {
          const force = (this.sectorDefinition.gravity + (gravityBoss ? 180 : 0)) / Math.max(1, distance / 180);
          bullet.vx += dx / distance * force * dt;
          bullet.vy += dy / distance * force * dt;
        }
      }
      const movementDt = bullet.owner === 'enemy' && this.ability === 'slow' && this.abilityTime > 0 ? dt * 0.45 : dt;
      this.teleportRiftBullet(bullet);
      bullet.x += bullet.vx * movementDt;
      bullet.y += bullet.vy * movementDt;
      if (bullet.x < -100 || bullet.x > this.renderer.width + 100 || bullet.y < -130 || bullet.y > this.renderer.height + 110) {
        this.releaseBulletAt(index);
        continue;
      }
      if (bullet.owner === 'enemy') {
        const radius = bullet.radius + this.player.radius;
        if (this.player.hp > 0 && distanceSquared(bullet.x, bullet.y, this.player.x, this.player.y) < radius * radius) {
          const source = bullet.sourceEnemy === 'boss' ? this.bossName : bullet.sourceEnemy ? ENEMIES[bullet.sourceEnemy].name : 'Вражеский снаряд';
          this.damagePlayer(bullet.damage, `Снаряд: ${source}`);
          if (bullet.active && this.bullets.items[index] === bullet) this.releaseBulletAt(index);
        }
        continue;
      }
      this.hash.query(bullet.x, bullet.y, bullet.radius + 96, this.nearby);
      let released = false;
      for (const enemy of this.nearby) {
        if (!enemy.active || bullet.hit.has(enemy.id) || enemy.y < -enemy.radius) continue;
        const radius = bullet.radius + enemy.radius;
        if (distanceSquared(bullet.x, bullet.y, enemy.x, enemy.y) > radius * radius) continue;
        bullet.hit.add(enemy.id);
        if (this.stats.burn > 0) {
          enemy.burnTime = 3;
          enemy.burnDps = Math.max(enemy.burnDps, bullet.damage * this.stats.burn);
        }
        if (this.stats.cryo > 0) enemy.slow = Math.min(enemy.slow, Math.max(0.25, 1 - this.stats.cryo));
        if (bullet.blast > 0) {
          this.explodeMissile(bullet);
          if (bullet.active && this.bullets.items[index] === bullet) this.releaseBulletAt(index);
          released = true;
          break;
        }
        this.damageEnemy(enemy, bullet.damage, bullet.crit, bullet.damageSource);
        if (bullet.chain > 0) this.chainLightning(enemy.x, enemy.y, bullet.damage * this.stats.chainDamage, bullet.chain * (bullet.crit && this.stats.stormProtocol ? 2 : 1), enemy.id);
        if (bullet.ricochet > 0) {
          const target = this.findNearestEnemy(enemy.x, enemy.y, 380, bullet.hit);
          if (target) {
            const angle = Math.atan2(target.y - bullet.y, target.x - bullet.x);
            const speed = Math.hypot(bullet.vx, bullet.vy);
            bullet.vx = Math.cos(angle) * speed;
            bullet.vy = Math.sin(angle) * speed;
            bullet.ricochet -= 1;
            bullet.damage *= 0.82;
            bullet.x += bullet.vx * dt * 2;
            bullet.y += bullet.vy * dt * 2;
            continue;
          }
        }
        if (bullet.pierce > 0) {
          bullet.pierce -= 1;
          bullet.damage *= 0.9;
        } else {
          this.releaseBulletAt(index);
          released = true;
          break;
        }
      }
      if (released) continue;
    }
  }

  private updateMissile(bullet: Bullet, dt: number): void {
    let target = this.enemies.items.find((enemy) => enemy.active && enemy.id === bullet.targetId);
    if (!target) {
      target = this.findNearestEnemy(bullet.x, bullet.y, Number.POSITIVE_INFINITY);
      bullet.targetId = target?.id ?? 0;
    }
    if (target) {
      const speed = Math.min(780, Math.hypot(bullet.vx, bullet.vy) + 360 * dt);
      const desired = Math.atan2(target.y - bullet.y, target.x - bullet.x);
      const current = Math.atan2(bullet.vy, bullet.vx);
      const angle = current + clamp(normalizeAngle(desired - current), -bullet.turnRate * dt, bullet.turnRate * dt);
      bullet.vx = Math.cos(angle) * speed;
      bullet.vy = Math.sin(angle) * speed;
    }
    if (this.rng.chance(0.7 * this.effectIntensity)) this.spawnParticle(bullet.x, bullet.y, 'glow', 0x54ffc4, 25, 0.25, -bullet.vx * 0.08, -bullet.vy * 0.08);
  }

  private explodeMissile(bullet: Bullet): void {
    const radius = bullet.blast;
    this.spawnExplosion(bullet.x, bullet.y, 0x5dffca, radius / 85);
    this.audio.play('explosion', 0.8);
    this.trauma = Math.max(this.trauma, 0.25);
    for (let index = this.enemies.items.length - 1; index >= 0; index -= 1) {
      const enemy = this.enemies.items[index]!;
      const distance = Math.sqrt(distanceSquared(bullet.x, bullet.y, enemy.x, enemy.y));
      if (distance < radius + enemy.radius) {
        const falloff = 1 - clamp(distance / (radius + enemy.radius), 0, 0.65);
        if (this.stats.burn > 0) {
          enemy.burnTime = 3;
          enemy.burnDps = Math.max(enemy.burnDps, bullet.damage * this.stats.burn);
        }
        this.damageEnemy(enemy, bullet.damage * falloff, bullet.crit, bullet.damageSource);
      }
    }
    for (let index = 0; index < bullet.cluster; index += 1) {
      const angle = index * TAU / bullet.cluster + this.rng.range(-0.2, 0.2);
      const shard = this.spawnBullet('player', 'shard', bullet.x, bullet.y, Math.cos(angle) * 430, Math.sin(angle) * 430, bullet.damage * 0.3);
      if (shard) {
        shard.radius = 6;
        shard.life = 0.85;
        shard.blast = this.stats.blastRadius * 0.35;
        shard.tint = 0xa2ff8a;
      }
    }
  }

  private trackDamage(source: DamageSource, amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.damageBySource[source] = (this.damageBySource[source] ?? 0) + amount;
    if (this.training) this.trainingDamage += amount;
  }

  private damageEnemy(enemy: Enemy, amount: number, crit: boolean, source: DamageSource = 'primary'): void {
    if (!enemy.active) return;
    let damage = amount * this.sectorDefinition.playerDamageMultiplier;
    if (enemy.kind === 'boss') {
      if (enemy.bossVariant === 0) damage *= enemy.vulnerability > 0 ? 1.5 : 0.4;
      else if (enemy.bossVariant === 2 && this.enemies.items.some((item) => item.kind === 'generator')) damage *= 0.15;
      else if (enemy.bossVariant === 3) damage *= this.controlZone?.captured ? 1.75 : 0.65;
      else if (this.bossDefinition(enemy).mechanic === 'omegaBeams') damage *= enemy.vulnerability > 0 ? 1.5 : 0.9;
    }
    if (enemy.kind === 'sentinel' && Math.sin(enemy.age * 2.2) > 0.1) damage *= 0.55;
    if (this.stats.execute > 0 && enemy.hp / enemy.maxHp <= this.stats.execute) damage *= 2;
    const dealt = enemy.trainingTarget ? damage : Math.min(enemy.hp, damage);
    if (enemy.trainingTarget) enemy.hp = enemy.maxHp;
    else enemy.hp -= damage;
    this.trackDamage(source, dealt);
    enemy.flash = 0.075;
    if (this.stats.lifeSteal > 0) this.player.hp = Math.min(this.stats.maxHp, this.player.hp + dealt * this.stats.lifeSteal);
    const denseCombat = this.enemies.items.length > 120 || this.bullets.items.length > 1200;
    if (this.save.data.settings.damageNumbers && (!denseCombat || crit) && (crit || damage >= 10 || this.effectIntensity > 0.55)) this.renderer.spawnDamage(enemy.x, enemy.y - enemy.radius * 0.5, damage, crit);
    if (this.hitSoundTimer <= 0) {
      this.audio.play('hit', 0.35);
      this.hitSoundTimer = 0.055;
    }
    if (crit) this.spawnParticle(enemy.x, enemy.y, 'ring', 0xffe575, 55, 0.24, 0, 0);
    if (enemy.hp <= 0 && !enemy.trainingTarget) this.killEnemy(enemy);
  }

  private chainLightning(x: number, y: number, damage: number, count: number, excludedId: number): void {
    const hit = new Set<number>([excludedId]);
    let fromX = x;
    let fromY = y;
    for (let index = 0; index < count; index += 1) {
      const target = this.findNearestEnemy(fromX, fromY, 320, hit);
      if (!target) break;
      hit.add(target.id);
      this.spawnLightning(fromX, fromY, target.x, target.y, 0x77eeff);
      this.damageEnemy(target, damage * Math.pow(0.86, index), false, 'chain');
      fromX = target.x;
      fromY = target.y;
    }
  }

  private damagePlayer(amount: number, source = 'Вражеская атака'): void {
    const player = this.player;
    if (this.training || player.invulnerable > 0 || player.hp <= 0 || this.status !== 'playing') return;
    this.damageTaken += amount;
    let damage = Math.max(1, amount - this.stats.armor);
    const hadShield = player.shield > 0;
    if (player.shield > 0) {
      const absorbed = Math.min(player.shield, damage);
      player.shield -= absorbed;
      damage -= absorbed;
    }
    if (damage > 0) player.hp -= damage;
    player.invulnerable = this.stats.invulnerability;
    player.shieldDelay = 4;
    this.trauma = Math.max(this.trauma, 0.65);
    this.renderer.flash(0.18, hadShield && damage <= 0 ? 0x55dfff : 0xff356d);
    this.spawnExplosion(player.x, player.y, hadShield && damage <= 0 ? 0x55dfff : 0xff596d, 0.65);
    this.audio.play(hadShield && player.shield <= 0 ? 'shieldDown' : hadShield ? 'shieldHit' : 'hullHit');
    if (hadShield && player.shield <= 0 && this.stats.aegis) this.nova(player.x, player.y, this.stats.damage * 9, 240);
    if (this.stats.retaliation > 0) this.nova(player.x, player.y, this.stats.damage * 3.5 * this.stats.retaliation, 150 + this.stats.retaliation * 30);
    if (player.hp <= 0) {
      if (player.revives > 0) {
        player.revives -= 1;
        player.hp = this.stats.maxHp * 0.5;
        player.shield = this.stats.maxShield;
        player.invulnerable = 2.5;
        this.nova(player.x, player.y, this.stats.damage * 20, 400);
        this.view?.announce('ЧЁРНЫЙ ЯЩИК АКТИВИРОВАН', 'Корабль восстановлен');
        this.audio.play('shield');
      } else {
        player.hp = 0;
        this.deathCause = source;
        this.finishRun();
      }
    }
  }

  private nova(x: number, y: number, damage: number, radius: number): void {
    this.spawnParticle(x, y, 'ring', 0x74f7ff, radius * 2, 0.65, 0, 0, 0.4);
    this.spawnExplosion(x, y, 0x68eaff, radius / 90);
    this.renderer.flash(0.18, 0x6eeeff);
    this.audio.play('nova');
    for (let index = this.enemies.items.length - 1; index >= 0; index -= 1) {
      const enemy = this.enemies.items[index]!;
      if (distanceSquared(x, y, enemy.x, enemy.y) < (radius + enemy.radius) ** 2) this.damageEnemy(enemy, damage, false, 'ability');
    }
    for (let index = this.bullets.items.length - 1; index >= 0; index -= 1) {
      const bullet = this.bullets.items[index]!;
      if (bullet.owner === 'enemy' && distanceSquared(x, y, bullet.x, bullet.y) < radius * radius) this.releaseBulletAt(index);
    }
  }

  private killEnemy(enemy: Enemy, rewards = true): void {
    if (!enemy.active) return;
    const { x, y, kind, elite } = enemy;
    const index = this.enemies.items.indexOf(enemy);
    if (index < 0) return;
    this.renderer.releaseEnemy(enemy);
    this.enemies.releaseAt(index);
    this.spawnExplosion(x, y, kind === 'boss' ? 0xff4fc7 : elite ? 0xffc95e : 0xff6b69, kind === 'boss' ? 3.2 : elite ? 1.4 : 0.8);
    if (!rewards) return;
    this.kills += 1;
    this.comboCount += 1;
    this.comboTimer = this.stats.comboDuration;
    this.score += enemy.score * this.comboMultiplier() * (this.difficulty === 'hardcore' ? 1.75 : 1) * RUN_MODES[this.mode].scoreMultiplier;
    this.audio.play('explosion', kind === 'boss' ? 1 : 0.5);
    const shrapnelCount = Math.floor(this.stats.shrapnel);
    for (let shardIndex = 0; shardIndex < shrapnelCount; shardIndex += 1) {
      const angle = shardIndex * TAU / shrapnelCount + this.rng.range(-0.12, 0.12);
      const shard = this.spawnBullet('player', 'shard', x, y, Math.cos(angle) * 460, Math.sin(angle) * 460, this.stats.damage * 0.45);
      if (shard) {
        shard.life = 0.75;
        shard.tint = 0xc693ff;
      }
    }
    if (kind === 'boss') {
      this.bossActive = false;
      this.bossKills += 1;
      this.clearBossHazards();
      this.waveRemaining = 0;
      this.trauma = 1;
      this.renderer.flash(0.5, 0xffb8ef);
      this.view?.announce('БОСС УНИЧТОЖЕН', `Сектор ${this.wave} очищен`);
      const totalCores = Math.floor((24 + this.wave * 2) * (this.difficulty === 'hardcore' ? 1.5 : 1));
      for (let drop = 0; drop < 8; drop += 1) this.spawnPickup('core', x + this.rng.range(-70, 70), y + this.rng.range(-30, 40), totalCores / 8);
      this.spawnPickup('bomb', x, y, 1);
      this.gainXP(enemy.xp * this.stats.xpGain);
    } else {
      const gems = elite ? 3 : kind === 'tank' || kind === 'carrier' ? 2 : 1;
      for (let gem = 0; gem < gems; gem += 1) this.spawnPickup('xp', x + this.rng.range(-14, 14), y + this.rng.range(-8, 8), enemy.xp / gems);
      const coreChance = 0.045 + Math.min(0.12, this.stats.luck * 0.0015) + this.sectorDefinition.coreChanceBonus;
      if (elite || this.rng.chance(coreChance)) this.spawnPickup('core', x, y, elite ? this.rng.int(2, 5) : 1);
      if (this.rng.chance(this.player.hp < this.stats.maxHp * 0.5 ? 0.035 : 0.009)) this.spawnPickup('repair', x, y, 0.25);
      else if (this.rng.chance(0.009)) this.spawnPickup('shield', x, y, 0.5);
      else if (this.rng.chance(0.006)) this.spawnPickup('bomb', x, y, 1);
      else if (this.rng.chance(0.012)) this.spawnPickup('overdrive', x, y, 8);
      if (kind === 'splitter') {
        this.spawnEnemy('scout', x - 22, y, false, true);
        this.spawnEnemy('scout', x + 22, y, false, true);
      }
    }
  }

  private updatePickups(dt: number): void {
    for (let index = this.pickups.items.length - 1; index >= 0; index -= 1) {
      const pickup = this.pickups.items[index]!;
      pickup.age += dt;
      if (pickup.age > 20) {
        this.renderer.releasePickup(pickup);
        this.pickups.releaseAt(index);
        continue;
      }
      const dx = this.player.x - pickup.x;
      const dy = this.player.y - pickup.y;
      const distance = Math.hypot(dx, dy);
      if (distance < this.stats.magnet || pickup.age > 15) {
        const speed = 260 + Math.max(0, this.stats.magnet - distance) * 5;
        pickup.vx = lerp(pickup.vx, dx / Math.max(1, distance) * speed, dt * 7);
        pickup.vy = lerp(pickup.vy, dy / Math.max(1, distance) * speed, dt * 7);
      } else {
        pickup.vx *= Math.pow(0.25, dt);
        pickup.vy = lerp(pickup.vy, 45, dt * 2);
      }
      pickup.x += pickup.vx * dt;
      pickup.y += pickup.vy * dt;
      if (distance < this.player.radius + pickup.radius + 8) {
        this.collectPickup(pickup);
        this.renderer.releasePickup(pickup);
        this.pickups.releaseAt(index);
      }
    }
  }

  private collectPickup(pickup: Pickup): void {
    switch (pickup.kind) {
      case 'xp':
        this.gainXP(pickup.value * this.stats.xpGain);
        break;
      case 'core':
        this.cores += Math.max(1, Math.round(pickup.value * this.stats.coreGain * this.sectorDefinition.coreMultiplier));
        break;
      case 'repair':
        this.player.hp = Math.min(this.stats.maxHp, this.player.hp + this.stats.maxHp * pickup.value);
        this.renderer.spawnMessage(this.player.x, this.player.y - 45, 'КОРПУС ВОССТАНОВЛЕН', '#7dffb2');
        break;
      case 'shield':
        this.stats.maxShield = Math.max(40, this.stats.maxShield);
        this.player.shield = Math.min(this.stats.maxShield, this.player.shield + Math.max(40, this.stats.maxShield * pickup.value));
        this.renderer.spawnMessage(this.player.x, this.player.y - 45, 'ЩИТ ЗАРЯЖЕН');
        break;
      case 'bomb':
        this.nova(this.player.x, this.player.y, this.stats.damage * 18, Math.max(this.renderer.width, this.renderer.height));
        break;
      case 'overdrive':
        this.overdrive = Math.max(this.overdrive, pickup.value);
        this.renderer.spawnMessage(this.player.x, this.player.y - 45, 'ПЕРЕГРУЗКА', '#ffe271');
        break;
    }
    this.audio.play(pickup.kind === 'shield' ? 'shield' : 'pickup', 0.65);
  }

  private gainXP(amount: number): void {
    if (this.status !== 'playing') return;
    this.player.xp += amount;
    if (this.player.xp >= this.player.xpNext) {
      this.player.xp -= this.player.xpNext;
      this.player.level += 1;
      this.player.xpNext = this.nextXpThreshold();
      this.status = 'levelup';
      this.input.releaseWeapons();
      this.rollChoices();
      this.view?.showLevelUp(this.currentChoices);
      this.audio.play('levelup');
    }
  }

  private nextXpThreshold(): number {
    return Math.floor(12 + Math.pow(this.player.level, 1.38) * 7);
  }

  private rollChoices(): void {
    const eligible = UPGRADES.filter((definition) => {
      if (this.banished.has(definition.id) || this.getUpgradeRank(definition.id) >= definition.max) return false;
      if (definition.conflicts?.some((id) => this.getUpgradeRank(id) > 0)) return false;
      return Object.entries(definition.requires ?? {}).every(([id, rank]) => this.getUpgradeRank(id) >= rank);
    });
    const choices: UpgradeDefinition[] = [];
    while (choices.length < 3 && eligible.length > 0) {
      const rarity = this.rollRarity();
      let candidates = eligible.filter((definition) => definition.rarity === rarity && !choices.includes(definition));
      if (candidates.length === 0) candidates = eligible.filter((definition) => !choices.includes(definition));
      if (candidates.length === 0) break;
      choices.push(this.rng.pick(candidates));
    }
    const fallbacks = FALLBACK_UPGRADES.filter((definition) => !this.banished.has(definition.id));
    while (choices.length < 3) choices.push(this.rng.pick(fallbacks.length > 0 ? fallbacks : FALLBACK_UPGRADES));
    this.currentChoices = choices;
  }

  private rollRarity(): Rarity {
    const waveBonus = Math.min(18, this.wave * 0.25);
    const luck = this.stats.luck + this.sectorDefinition.luckBonus;
    const weights: Record<Rarity, number> = {
      common: Math.max(24, 65 - waveBonus - luck * 0.35),
      rare: 27 + waveBonus * 0.35 + luck * 0.15,
      epic: 6.5 + waveBonus * 0.45 + luck * 0.16,
      legendary: 1.5 + waveBonus * 0.2 + luck * 0.04,
    };
    let roll = this.rng.next() * Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    for (const rarity of ['common', 'rare', 'epic', 'legendary'] as const) {
      roll -= weights[rarity];
      if (roll <= 0) return rarity;
    }
    return 'common';
  }

  private setupTraining(): void {
    this.waveRemaining = 0;
    this.bossActive = false;
    this.intermission = 0;
    this.spawnTimer = Number.POSITIVE_INFINITY;
    this.bossName = '';
    const kinds: EnemyKind[] = ['scout', 'weaver', 'tank', 'sniper', 'kamikaze', 'splitter', 'carrier', 'sentinel'];
    const columns = this.renderer.width < 640 ? 2 : 4;
    for (let index = 0; index < kinds.length; index += 1) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const enemy = this.spawnEnemy(kinds[index]!, (column + 1) * this.renderer.width / (columns + 1), (this.renderer.width < 640 ? 255 : 210) + row * 125);
      if (!enemy) continue;
      enemy.trainingTarget = true;
      enemy.targetY = enemy.y;
      enemy.speed = 0;
      enemy.fireTimer = Number.POSITIVE_INFINITY;
      enemy.maxHp = 1_000_000_000;
      enemy.hp = enemy.maxHp;
      enemy.elite = index === kinds.length - 1;
    }
    this.view?.announce('ПОЛИГОН', '45 секунд · мишени неуязвимы · награды отключены');
  }

  skipTutorial(): void {
    this.tutorialStep = -1;
    this.save.completeTutorial();
  }

  private updateTutorial(): void {
    if (this.tutorialStep < 0 || this.training) return;
    if (this.tutorialStep === 0 && distanceSquared(this.player.x, this.player.y, this.tutorialStartX, this.tutorialStartY) >= 50 * 50) this.tutorialStep = 1;
    else if (this.tutorialStep === 1 && (this.bullets.items.some((bullet) => bullet.owner === 'player') || (this.weapon === 'beam' && this.input.left))) this.tutorialStep = 2;
    else if (this.tutorialStep === 2 && this.player.missileCooldown > 0) this.tutorialStep = 3;
    else if (this.tutorialStep === 3 && (this.abilityCooldown > 0 || this.secondaryCooldown > 0)) this.skipTutorial();
  }

  private get tutorialText(): string {
    if (this.tutorialStep === 0) return 'Двигайте мышь — корабль следует за курсором';
    if (this.tutorialStep === 1) return 'Удерживайте ЛКМ для основной атаки';
    if (this.tutorialStep === 2) return 'Нажмите ПКМ для залпа самонаводящихся ракет';
    if (this.tutorialStep === 3) return this.secondaryAbility ? 'Используйте способности Q и E' : 'Используйте способность Q';
    return '';
  }

  private updateWaves(dt: number): void {
    if (this.training) {
      this.trainingTime -= dt;
      if (this.trainingTime <= 0) this.finishRun();
      return;
    }
    if (this.intermission > 0) {
      this.intermission -= dt;
      if (this.intermission <= 0) {
        this.wave += 1;
        this.beginWave();
      }
      return;
    }
    if (this.sector === 'asteroids' && !this.bossActive && this.waveRemaining > 0) {
      this.asteroidTimer -= dt;
      if (this.asteroidTimer <= 0 && this.enemies.items.length < 420) {
        this.spawnEnemy('meteor', this.rng.range(55, this.renderer.width - 55), -70);
        this.asteroidTimer = 3.2;
      }
    }
    if (this.bossActive) {
      this.bossAddsTimer -= dt;
      if (this.bossAddsTimer <= 0 && this.enemies.items.length < 35 + this.wave) {
        this.spawnEnemy(this.wave >= 6 ? 'weaver' : 'scout', this.rng.range(50, this.renderer.width - 50), -60);
        this.bossAddsTimer = Math.max(1.8, 4.5 - this.wave * 0.04);
      }
    } else if (this.waveRemaining > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.enemies.items.length < Math.min(430, 90 + this.wave * 9)) {
        this.spawnFormation();
        this.spawnTimer = Math.max(0.24, 1.2 - this.wave * 0.017) * (this.difficulty === 'hardcore' ? 0.8 : 1) * this.sectorDefinition.spawnIntervalMultiplier * Math.max(0.65, 1 - (this.threat - 1) * 0.03);
      }
    }
    if (!this.bossActive && this.waveRemaining <= 0 && this.enemies.items.length === 0) {
      const bonus = 2 + Math.floor(this.wave / 2);
      this.cores += bonus;
      this.score += this.wave * 500;
      if (this.wave % 5 === 0 && !this.routeChosen) {
        this.offerRouteChoice();
        return;
      }
      this.intermission = 2.2;
      this.view?.announce('ВОЛНА ЗАЧИЩЕНА', `+${bonus} ядер · следующий сектор приближается`);
    }
  }

  private beginWave(): void {
    this.spawnTimer = 0.4;
    this.intermission = 0;
    this.asteroidTimer = 2.5;
    this.clearBossHazards();
    this.threat = 1 + Math.floor((this.wave - 1) / 10);
    if (this.wave % 5 === 0) {
      this.bossActive = true;
      this.routeChosen = false;
      this.waveRemaining = 0;
      this.bossAddsTimer = 4;
      const bossIndex = Math.floor(this.wave / 5) - 1;
      const definition = BOSS_LIST[bossIndex % BOSS_LIST.length]!;
      this.bossName = definition.name;
      const boss = this.spawnEnemy('boss', this.renderer.width * 0.5, -120);
      if (boss) boss.bossVariant = bossIndex % BOSS_LIST.length;
      for (const module of definition.modules ?? []) this.spawnEnemy(module.kind, this.renderer.width * module.x, module.y, false, true);
      if (definition.mechanic === 'gravityControl') {
        this.controlZone = { active: true, x: this.renderer.width * 0.5, y: this.renderer.height * 0.58, radius: 95, progress: 0, captured: 0, moveTimer: 6 };
      }
      if (definition.mechanic === 'riftPortals') this.syncRiftPairs(0);
      this.view?.announce(`ВОЛНА ${this.wave} · ${this.bossName}`, definition.hint);
      this.audio.play('boss');
    } else {
      this.bossActive = false;
      this.waveRemaining = Math.floor((8 + this.wave * 3 + (this.difficulty === 'hardcore' ? 4 : 0)) * this.sectorDefinition.budgetMultiplier);
      this.view?.announce(`ВОЛНА ${this.wave}`, this.wave === 1 ? 'ЛКМ — blaster · ПКМ — ракеты' : this.sectorDefinition.name);
    }
  }

  private spawnFormation(): void {
    const unlocked = (Object.keys(UNLOCK_WAVES) as Array<keyof typeof UNLOCK_WAVES>).filter((kind) => UNLOCK_WAVES[kind] <= this.wave);
    const available = this.sector === 'swarm' ? unlocked.filter((kind) => kind === 'scout' || kind === 'weaver') : unlocked;
    let kind = this.rng.pick(available);
    if (this.rng.chance(0.55)) kind = available[this.rng.int(0, Math.min(available.length - 1, 2 + Math.floor(this.wave / 4)))]!;
    const baseSize = Math.min(this.waveRemaining, this.rng.int(1, Math.min(6, 2 + Math.floor(this.wave / 3))));
    const size = Math.min(this.waveRemaining, Math.ceil(baseSize * this.sectorDefinition.formationMultiplier), 10);
    const center = this.rng.range(80, Math.max(81, this.renderer.width - 80));
    const spacing = kind === 'tank' || kind === 'carrier' ? 100 : 68;
    for (let index = 0; index < size; index += 1) {
      const offset = (index - (size - 1) / 2) * spacing;
      const eliteChance = this.wave < 4 ? 0 : Math.min(0.55, 0.025 + this.wave * 0.003 + this.stats.luck * 0.0005 + this.sectorDefinition.eliteChanceBonus);
      this.spawnEnemy(kind, clamp(center + offset, 45, this.renderer.width - 45), -60 - Math.abs(offset) * 0.45 - index * 12, this.rng.chance(eliteChance));
    }
    this.waveRemaining -= size;
  }

  private spawnEnemy(kind: EnemyKind, x: number, y: number, elite = false, summoned = false): Enemy | undefined {
    const enemy = this.enemies.acquire();
    if (!enemy) return undefined;
    if (this.mode === 'elite' && kind !== 'boss') elite = true;
    const config = ENEMIES[kind];
    const waveScale = Math.max(0, this.wave - 1);
    const hpScale = kind === 'boss' ? 1 + this.wave * 0.27 + Math.pow(this.wave / 5, 1.5) * 0.5 : 1 + waveScale * 0.15 + Math.pow(waveScale, 1.28) * 0.035;
    const difficultyHp = this.difficulty === 'hardcore' ? 1.35 : 1;
    enemy.id = this.nextId++;
    enemy.kind = kind;
    enemy.x = x;
    enemy.y = y;
    enemy.vx = 0;
    enemy.vy = config.speed;
    const sizeVariation = kind === 'meteor' ? this.rng.range(0.8, 1.3) : 1;
    enemy.radius = config.radius * sizeVariation * (elite ? 1.16 : 1);
    enemy.maxHp = config.hp * hpScale * difficultyHp * this.sectorDefinition.enemyHpMultiplier * (1 + (this.threat - 1) * 0.15) * (elite ? 2.8 : 1);
    enemy.hp = enemy.maxHp;
    enemy.speed = config.speed * Math.min(1.8, 1 + waveScale * 0.012) * (this.difficulty === 'hardcore' ? 1.14 : 1);
    enemy.damage = config.damage * (1 + waveScale * 0.05) * (this.difficulty === 'hardcore' ? 1.3 : 1) * (elite ? 1.3 : 1) * this.sectorDefinition.enemyDamageMultiplier * (1 + (this.threat - 1) * 0.08);
    enemy.xp = config.xp * (elite ? 3 : 1) * this.sectorDefinition.xpMultiplier;
    enemy.score = config.score * (elite ? 4 : 1);
    enemy.fireTimer = this.rng.range(0.65, config.fireRate);
    enemy.age = 0;
    enemy.phase = this.rng.range(0, TAU);
    enemy.targetY = kind === 'boss' ? 0 : this.rng.range(110, Math.max(120, this.renderer.height * 0.38));
    enemy.elite = elite;
    enemy.scale = sizeVariation * (elite ? 1.18 : 1);
    enemy.flash = 0;
    enemy.slow = 1;
    enemy.burnTime = 0;
    enemy.burnDps = 0;
    enemy.burnTick = 0;
    enemy.bossPhase = 0;
    enemy.attackTimer = 2;
    enemy.telegraph = 0;
    enemy.summoned = summoned;
    enemy.trainingTarget = false;
    enemy.bossVariant = 0;
    enemy.vulnerability = 0;
    return enemy;
  }

  private spawnBullet(owner: BulletOwner, kind: BulletKind, x: number, y: number, vx: number, vy: number, damage: number): Bullet | undefined {
    const bullet = this.bullets.acquire();
    if (!bullet) return undefined;
    bullet.id = this.nextId++;
    bullet.owner = owner;
    bullet.kind = kind;
    bullet.damageSource = owner === 'drone' ? 'drone' : kind === 'missile' ? 'missile' : kind === 'shard' ? 'shrapnel' : 'primary';
    bullet.sourceEnemy = undefined;
    bullet.portalCooldown = 0;
    bullet.x = x;
    bullet.y = y;
    bullet.vx = vx;
    bullet.vy = vy;
    bullet.radius = 6;
    bullet.damage = damage;
    bullet.life = 4;
    bullet.pierce = 0;
    bullet.ricochet = 0;
    bullet.chain = 0;
    bullet.blast = 0;
    bullet.cluster = 0;
    bullet.crit = false;
    bullet.targetId = 0;
    bullet.turnRate = 0;
    bullet.size = 1;
    bullet.tint = 0xffffff;
    bullet.hit.clear();
    return bullet;
  }

  private releaseBulletAt(index: number): void {
    const bullet = this.bullets.items[index]!;
    this.renderer.releaseBullet(bullet);
    this.bullets.releaseAt(index);
  }

  private spawnPickup(kind: PickupKind, x: number, y: number, value: number): void {
    if (kind === 'xp' && this.pickups.items.length >= PICKUP_CAPACITY - 5) {
      this.gainXP(value * this.stats.xpGain);
      return;
    }
    const pickup = this.pickups.acquire();
    if (!pickup) {
      if (kind === 'core') this.cores += Math.max(1, Math.round(value * this.stats.coreGain * this.sectorDefinition.coreMultiplier));
      return;
    }
    pickup.id = this.nextId++;
    pickup.kind = kind;
    pickup.x = x;
    pickup.y = y;
    pickup.vx = this.rng.range(-65, 65);
    pickup.vy = this.rng.range(-70, 25);
    pickup.radius = kind === 'xp' ? 10 : 15;
    pickup.value = value;
    pickup.age = 0;
  }

  private spawnExplosion(x: number, y: number, tint: number, scale: number): void {
    const quality = this.effectIntensity;
    this.spawnParticle(x, y, 'glow', tint, 100 * scale, 0.45, 0, 0, 1.8);
    this.spawnParticle(x, y, 'smoke', 0x33364f, 85 * scale, 0.8, 0, -15, 1.6);
    this.spawnParticle(x, y, 'ring', tint, 80 * scale, 0.42, 0, 0, 2.4);
    const count = Math.floor(15 * scale * quality);
    for (let index = 0; index < count; index += 1) {
      const angle = this.rng.range(0, TAU);
      const speed = this.rng.range(70, 310) * Math.sqrt(scale);
      this.spawnParticle(x, y, index % 3 === 0 ? 'glow' : 'spark', index % 4 === 0 ? 0xffe39a : tint, this.rng.range(18, 45) * scale, this.rng.range(0.25, 0.7), Math.cos(angle) * speed, Math.sin(angle) * speed, 0.2);
    }
  }

  private spawnMuzzle(x: number, y: number, tint: number): void {
    if (!this.rng.chance(this.effectIntensity)) return;
    this.spawnParticle(x, y, 'glow', tint, 30, 0.12, 0, -30, 0.5);
  }

  private spawnParticle(x: number, y: number, texture: EffectTexture, tint: number, size: number, life: number, vx: number, vy: number, endScale = 0.5): void {
    const particle = this.particles.acquire();
    if (!particle) return;
    particle.x = x;
    particle.y = y;
    particle.vx = vx;
    particle.vy = vy;
    particle.life = life;
    particle.maxLife = life;
    particle.size = size;
    particle.endScale = endScale;
    particle.alpha = 1;
    particle.tint = tint;
    particle.drag = 2.5;
    particle.rotation = texture === 'spark' ? Math.atan2(vy, vx) + Math.PI * 0.5 : this.rng.range(0, TAU);
    particle.spin = this.rng.range(-3, 3);
    particle.texture = texture;
  }

  private updateEffects(dt: number): void {
    for (let index = this.particles.items.length - 1; index >= 0; index -= 1) {
      const particle = this.particles.items[index]!;
      particle.life -= dt;
      if (particle.life <= 0) {
        this.renderer.releaseEffect(particle);
        this.particles.releaseAt(index);
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      const drag = Math.exp(-particle.drag * dt);
      particle.vx *= drag;
      particle.vy *= drag;
      particle.rotation += particle.spin * dt;
    }
    for (let index = this.lightnings.items.length - 1; index >= 0; index -= 1) {
      const line = this.lightnings.items[index]!;
      line.life -= dt;
      if (line.life <= 0) this.lightnings.releaseAt(index);
    }
  }

  private spawnLightning(x1: number, y1: number, x2: number, y2: number, tint: number): void {
    const line = this.lightnings.acquire();
    if (!line) return;
    line.x1 = x1;
    line.y1 = y1;
    line.x2 = x2;
    line.y2 = y2;
    line.life = 0.16;
    line.maxLife = 0.16;
    line.tint = tint;
  }

  private findNearestEnemy(x: number, y: number, maxDistance: number, excluded?: Set<number>): Enemy | undefined {
    let nearest: Enemy | undefined;
    let nearestDistance = maxDistance * maxDistance;
    for (const enemy of this.enemies.items) {
      if (!enemy.active || enemy.y < -40 || excluded?.has(enemy.id)) continue;
      const distance = distanceSquared(x, y, enemy.x, enemy.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = enemy;
      }
    }
    return nearest;
  }

  private comboMultiplier(): number {
    return 1 + Math.min(4, this.comboCount * 0.06);
  }

  private hudSnapshot(): HudSnapshot {
    const boss = this.enemies.items.find((enemy) => enemy.kind === 'boss');
    return {
      hp: this.player.hp,
      maxHp: this.stats.maxHp,
      shield: this.player.shield,
      maxShield: this.stats.maxShield,
      xp: this.player.xp,
      xpNext: this.player.xpNext,
      level: this.player.level,
      score: this.score,
      wave: this.wave,
      combo: this.comboMultiplier(),
      cores: this.cores,
      missileCooldown: Math.max(0, this.player.missileCooldown),
      missileCooldownMax: Math.max(0.35, this.stats.missileCooldown),
      bossHp: boss?.hp ?? 0,
      bossMaxHp: boss?.maxHp ?? 0,
      bossName: boss ? `${this.bossName}${(boss.bossVariant === 0 || boss.bossVariant === 5) && boss.vulnerability > 0 ? ' · ЯДРО ОТКРЫТО' : ''}${boss.bossVariant === 2 && this.enemies.items.some((enemy) => enemy.kind === 'generator') ? ' · ЩИТ' : ''}` : '',
      enemies: this.enemies.items.length,
      bullets: this.bullets.items.length,
      particles: this.particles.items.length,
      fps: this.fps,
      quality: this.effectIntensity,
      rerolls: this.rerolls,
      banishes: this.banishes,
      overdrive: this.overdrive,
      sectorName: this.sectorDefinition.name,
      sectorIcon: this.sectorDefinition.icon,
      weaponName: WEAPONS[this.weapon].shortName,
      weaponHeat: this.player.beamHeat / 100,
      weaponOverheated: this.player.beamOverheated > 0,
      abilityName: ABILITIES[this.ability].shortName,
      abilityCooldown: Math.max(0, this.abilityCooldown),
      abilityCooldownMax: ABILITIES[this.ability].cooldown,
      abilityActive: this.abilityTime > 0 || Boolean(this.gravityBomb),
      secondaryName: this.secondaryAbility ? ABILITIES[this.secondaryAbility].shortName : '',
      secondaryCooldown: Math.max(0, this.secondaryCooldown),
      modeName: this.training ? 'ПОЛИГОН' : RUN_MODES[this.mode].name,
      threat: this.threat,
      seed: this.runSeed,
      training: this.training,
      trainingDps: this.training ? this.trainingDamage / Math.max(0.01, this.runTime) : undefined,
      trainingPrimaryDps: this.training ? (this.damageBySource.primary ?? 0) / Math.max(0.01, this.runTime) : undefined,
      trainingMissileDps: this.training ? ((this.damageBySource.missile ?? 0) + (this.damageBySource.shrapnel ?? 0)) / Math.max(0.01, this.runTime) : undefined,
      trainingTime: Math.max(0, this.trainingTime),
      tutorialText: this.tutorialText,
    };
  }

  private finishRun(): void {
    if (this.runRecorded) return;
    this.spawnExplosion(this.player.x, this.player.y, 0x67dfff, 3);
    this.trauma = 1;
    this.renderer.flash(0.55, 0xff427c);
    this.audio.play(this.training ? 'levelup' : 'lose');
    this.audio.setPaused(true);
    this.status = 'gameover';
    this.input.releaseWeapons();
    this.recordRun();
    this.view?.showGameOver(this.summary());
  }

  private recordRun(): void {
    if (this.runRecorded) return;
    this.runRecorded = true;
    if (this.training) return;
    const summary = this.summary();
    this.save.recordRun(summary);
    const newShips = this.save.refreshShipUnlocks();
    if (newShips.length > 0) this.view?.announce('НОВЫЙ КОРАБЛЬ ОТКРЫТ', SHIPS[newShips[0]!].name);
    void this.platform?.recordRun(summary);
    this.processAchievements(summary);
  }

  private processAchievements(summary: RunSummary): void {
    const unlocked: string[] = [];
    if (summary.wave >= 10) unlocked.push('wave10');
    if (summary.wave >= 25) unlocked.push('wave25');
    if (summary.wave >= 5 && summary.damageTaken === 0) unlocked.push('noHit');
    if (summary.evolutions > 0) unlocked.push('evolution');
    if (summary.kills >= 1000) unlocked.push('kills1000');
    if (summary.mode !== 'standard' && summary.wave >= 10) unlocked.push('challenge');
    for (const id of unlocked) {
      if (this.save.unlockAchievement(id)) this.view?.announce('ДОСТИЖЕНИЕ ОТКРЫТО', ACHIEVEMENTS.find((achievement) => achievement.id === id)?.name);
    }
  }

  private summary(): RunSummary {
    const evolutions = this.getBuild().filter(({ definition }) => definition.requires).length;
    return {
      score: Math.floor(this.score),
      wave: this.wave,
      kills: this.kills,
      level: this.player.level,
      cores: Math.floor(this.cores),
      time: this.runTime,
      difficulty: this.difficulty,
      mode: this.mode,
      seed: this.runSeed,
      threat: this.threat,
      damageTaken: this.damageTaken,
      evolutions,
      training: this.training,
      ship: this.ship,
      weapon: this.weapon,
      ability: this.ability,
      masteryXp: this.training ? 0 : runMasteryXp({ kills: this.kills, wave: this.wave, evolutions }),
      bossKills: this.bossKills,
      damageBySource: { ...this.damageBySource },
      deathCause: this.deathCause,
      cardHistory: this.cardHistory.map((entry) => ({ ...entry })),
    };
  }

  private clearWorld(): void {
    for (let index = this.bullets.items.length - 1; index >= 0; index -= 1) this.releaseBulletAt(index);
    for (let index = this.enemies.items.length - 1; index >= 0; index -= 1) {
      this.renderer.releaseEnemy(this.enemies.items[index]!);
      this.enemies.releaseAt(index);
    }
    for (let index = this.pickups.items.length - 1; index >= 0; index -= 1) {
      this.renderer.releasePickup(this.pickups.items[index]!);
      this.pickups.releaseAt(index);
    }
    for (let index = this.particles.items.length - 1; index >= 0; index -= 1) {
      this.renderer.releaseEffect(this.particles.items[index]!);
      this.particles.releaseAt(index);
    }
    this.lightnings.clear();
    this.dronePositions.length = 0;
    this.clearBossHazards();
    this.gravityBomb = undefined;
    this.abilityTime = 0;
    this.trauma = 0;
    this.bossActive = false;
    this.waveRemaining = 0;
    this.intermission = 0;
  }

  private startStressScenario(): void {
    if (!import.meta.env.DEV || this.status !== 'playing') return;
    this.wave = 30;
    this.stats.damage *= 7;
    this.stats.fireRate *= 2;
    this.stats.projectileCount = 14;
    this.stats.missileCount = 12;
    this.stats.missileCooldown = 0.8;
    this.stats.drones = 6;
    this.stats.xpGain = 0;
    this.player.xpNext = Number.MAX_SAFE_INTEGER;
    this.stats.maxHp = 100000;
    this.player.hp = 100000;
    this.waveRemaining = 0;
    this.bossActive = true;
    const kinds: EnemyKind[] = ['scout', 'weaver', 'tank', 'sniper', 'kamikaze', 'splitter', 'carrier', 'sentinel'];
    for (let index = 0; index < 280; index += 1) {
      const enemy = this.spawnEnemy(this.rng.pick(kinds), this.rng.range(35, this.renderer.width - 35), this.rng.range(-100, this.renderer.height * 0.68), index % 17 === 0, true);
      if (enemy) {
        enemy.fireTimer = this.rng.range(0.1, 2);
        enemy.maxHp = 1_000_000_000;
        enemy.hp = enemy.maxHp;
        enemy.speed = 0;
      }
    }
    for (let index = 0; index < 1300; index += 1) {
      const angle = this.rng.range(0.15, Math.PI - 0.15);
      const bullet = this.spawnBullet('enemy', index % 3 === 0 ? 'orb' : 'bolt', this.rng.range(0, this.renderer.width), this.rng.range(0, this.renderer.height * 0.75), Math.cos(angle) * 60, Math.sin(angle) * 60, 0);
      if (bullet) bullet.life = 30;
    }
    this.view?.announce('STRESS: ENDGAME', '280 врагов · 1300 снарядов · усиленное вооружение');
  }

  debugLevelUp(): void {
    if (import.meta.env.DEV && this.status === 'playing') this.gainXP(this.player.xpNext);
  }

  debugGameOver(): void {
    if (!import.meta.env.DEV || this.status !== 'playing') return;
    this.player.invulnerable = 0;
    this.player.revives = 0;
    this.stats.armor = 0;
    this.player.shield = 0;
    this.damagePlayer(this.player.hp + 1);
  }

  private createPlayer(): Player {
    return {
      x: this.renderer?.width * 0.5 || window.innerWidth * 0.5,
      y: this.renderer?.height * 0.82 || window.innerHeight * 0.82,
      vx: 0, vy: 0, radius: 20, hp: 100, shield: 0, fireCooldown: 0, missileCooldown: 0,
      invulnerable: 0, shieldDelay: 0, level: 1, xp: 0, xpNext: 20, revives: 0, beamHeat: 0, beamOverheated: 0,
    };
  }

  private createEnemy(): Enemy {
    return {
      active: false, id: 0, kind: 'scout', x: 0, y: 0, vx: 0, vy: 0, radius: 20, hp: 1, maxHp: 1,
      speed: 0, damage: 0, xp: 0, score: 0, fireTimer: 0, age: 0, phase: 0, targetY: 0,
      elite: false, scale: 1, flash: 0, slow: 1, burnTime: 0, burnDps: 0, burnTick: 0,
      bossPhase: 0, attackTimer: 0, telegraph: 0, summoned: false, trainingTarget: false, bossVariant: 0, vulnerability: 0,
    };
  }

  private createBullet(): Bullet {
    return {
      active: false, id: 0, owner: 'player', kind: 'bolt', x: 0, y: 0, vx: 0, vy: 0, portalCooldown: 0,
      damageSource: 'primary', sourceEnemy: undefined,
      radius: 5, damage: 0, life: 0, pierce: 0, ricochet: 0, chain: 0, blast: 0, cluster: 0,
      crit: false, targetId: 0, turnRate: 0, size: 1, tint: 0xffffff, hit: new Set<number>(), viewAdded: false,
    };
  }

  private createPickup(): Pickup {
    return { active: false, id: 0, kind: 'xp', x: 0, y: 0, vx: 0, vy: 0, radius: 10, value: 0, age: 0 };
  }

  private createEffect(): EffectParticle {
    return {
      active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 1, endScale: 0,
      alpha: 1, tint: 0xffffff, drag: 0, rotation: 0, spin: 0, texture: 'glow', viewAdded: false,
    };
  }
}
