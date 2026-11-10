import {
  Application,
  Assets,
  Container,
  Graphics,
  Particle,
  ParticleContainer,
  Sprite,
  Spritesheet,
  Text,
  Texture,
  TilingSprite,
} from 'pixi.js';
import { clamp, TAU } from '../core/math';
import { assetUrl } from '../core/assets';
import type { GameSettings, QualitySetting } from '../core/save';
import { ENEMIES } from './config/enemies';
import { BOSS_LIST } from './config/bosses';
import { ELITE_AFFIX, ELITE_AFFIX_LIST } from './config/affixes';
import { SECTORS } from './config/sectors';
import type { SectorId } from './config/sectors';
import { SHIPS } from './config/ships';
import { MASTERY_TRAIL_XP } from './config/mastery';
import type { Bullet, EffectParticle, EffectTexture, Enemy, Pickup } from './types';
import type { Game } from './Game';

interface Star {
  particle: Particle;
  speed: number;
}

interface DamageLabel {
  text: Text;
  life: number;
  maxLife: number;
}

const PICKUP_TEXTURES = {
  xp: 'star_gold.png',
  core: 'things_gold.png',
  repair: 'pill_green.png',
  shield: 'powerupBlue_shield.png',
  bomb: 'powerupRed_star.png',
  overdrive: 'powerupYellow_bolt.png',
} as const;

const SECTOR_BACKGROUNDS = import.meta.glob('/public/assets/sectors/*-bg.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export class Renderer {
  readonly app = new Application();
  width = window.innerWidth;
  height = window.innerHeight;
  effectQuality = 1;
  private sheet!: Spritesheet;
  private combatSheet?: Spritesheet;
  private readonly missingTextureKeys = new Set<string>();
  private readonly world = new Container();
  private readonly enemyLayer = new Container();
  private readonly pickupLayer = new Container();
  private readonly playerLayer = new Container();
  private readonly droneLayer = new Container();
  private readonly bulletLayer = new ParticleContainer({
    dynamicProperties: { position: true, rotation: true, color: true, vertex: false, uvs: false },
  });
  private readonly effectLayers = new Map<EffectTexture, ParticleContainer>();
  private readonly effectTextures = new Map<EffectTexture, Texture>();
  private readonly telegraphs = new Graphics();
  private readonly healthBars = new Graphics();
  private readonly lightning = new Graphics();
  private readonly flashLayer = new Graphics();
  private background!: Sprite;
  private defaultBackground!: Texture;
  private sectorParallax?: TilingSprite;
  private sectorId: SectorId = 'void';
  private readonly sectorTextures = new Map<string, Texture>();
  private readonly pendingSectorTextures = new Set<string>();
  private sectorRequestId = 0;
  private sectorTransition = 0;
  private player!: Sprite;
  private playerGlow!: Sprite;
  private engineGlow!: Sprite;
  private shield!: Sprite;
  private starLayer!: ParticleContainer;
  private readonly stars: Star[] = [];
  private readonly droneViews: Sprite[] = [];
  private readonly damageLabels: DamageLabel[] = [];
  private flashAlpha = 0;
  private flashTint = 0xffffff;
  private qualitySetting: QualitySetting = 'auto';
  private performanceTimer = 0;
  private performanceFrames = 0;
  private visualTime = 0;
  private baseResolution = 1;
  private renderScale = 1;
  private flashScale = 1;

  async initialize(host: HTMLElement, quality: QualitySetting): Promise<void> {
    this.qualitySetting = quality;
    const resolution = quality === 'low' ? 1 : quality === 'medium' ? Math.min(devicePixelRatio, 1.25) : Math.min(devicePixelRatio, 1.65);
    this.baseResolution = resolution;
    await this.app.init({
      resizeTo: host,
      background: '#02030b',
      antialias: true,
      autoDensity: true,
      resolution,
      preference: 'webgl',
      powerPreference: 'high-performance',
    });
    host.appendChild(this.app.canvas);
    this.app.canvas.setAttribute('aria-label', 'Космический бой');
    this.sheet = await Assets.load<Spritesheet>(assetUrl('/assets/atlas.json'));
    this.combatSheet = await Assets.load<Spritesheet>(assetUrl('/assets/combat-atlas.json')).catch(() => undefined);
    this.createTextures();
    this.createScene();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    const resizeObserver = new ResizeObserver(() => {
      this.app.renderer.resize(host.clientWidth, host.clientHeight, this.app.renderer.resolution);
      this.resize();
    });
    resizeObserver.observe(host);
    this.setQuality(quality);
  }

  setQuality(setting: QualitySetting): void {
    this.qualitySetting = setting;
    this.effectQuality = setting === 'low' ? 0.3 : setting === 'medium' ? 0.65 : 1;
    this.renderScale = setting === 'low' ? 0.65 : setting === 'medium' ? 0.85 : 1;
    this.performanceTimer = 0;
    this.performanceFrames = 0;
    this.applyResolution();
  }

  updatePerformance(realDt: number): void {
    if (this.qualitySetting !== 'auto') return;
    this.performanceTimer += realDt;
    this.performanceFrames += 1;
    if (this.performanceTimer < 2) return;
    const fps = this.performanceFrames / this.performanceTimer;
    this.performanceTimer = 0;
    this.performanceFrames = 0;
    if (fps < 45) this.effectQuality = Math.max(0.3, this.effectQuality - 0.2);
    else if (fps < 56) this.effectQuality = Math.max(0.3, this.effectQuality - 0.1);
    else if (fps > 59) this.effectQuality = Math.min(1, this.effectQuality + 0.025);
    this.renderScale = 0.42 + this.effectQuality * 0.58;
    this.applyResolution();
  }

  private applyResolution(): void {
    if (!this.app.renderer) return;
    const resolution = Math.max(0.55, this.baseResolution * this.renderScale);
    if (Math.abs(this.app.renderer.resolution - resolution) > 0.04) this.app.renderer.resize(this.width, this.height, resolution);
  }

  private syncSector(game: Game, dt: number): void {
    if (game.sector !== this.sectorId) this.setSector(game.sector);
    const configuredBackground = SECTORS[this.sectorId].background;
    const background = configuredBackground ? SECTOR_BACKGROUNDS[`/public${configuredBackground}`] : undefined;
    if (this.sectorTransition > 0) {
      this.sectorTransition = Math.max(0, this.sectorTransition - dt * 0.9);
      this.background.alpha = background && this.sectorTextures.has(background) ? 0.62 + this.sectorTransition * 0.38 : 1;
    }
    if (this.sectorParallax) {
      this.sectorParallax.visible = this.effectQuality > 0.5 && Boolean(background && this.sectorTextures.has(background));
      if (this.sectorParallax.visible) {
        this.sectorParallax.tilePosition.x -= dt * 2;
        this.sectorParallax.tilePosition.y += dt * 9;
      }
    }
  }

  private setSector(id: SectorId): void {
    this.sectorId = id;
    this.sectorRequestId += 1;
    const url = SECTORS[id].background;
    this.sectorTransition = url ? 1 : 0;
    if (!url) {
      this.background.texture = this.defaultBackground;
      this.background.alpha = 1;
      if (this.sectorParallax) this.sectorParallax.visible = false;
      return;
    }
    const assetUrl = SECTOR_BACKGROUNDS[`/public${url}`];
    if (!assetUrl) {
      this.background.texture = this.defaultBackground;
      this.background.alpha = 1;
      this.sectorTransition = 0;
      if (this.sectorParallax) this.sectorParallax.visible = false;
      return;
    }
    this.background.alpha = 0.62;
    const cached = this.sectorTextures.get(assetUrl);
    if (cached) {
      this.background.texture = cached;
      if (this.sectorParallax) this.sectorParallax.texture = cached;
      return;
    }
    if (this.pendingSectorTextures.has(assetUrl)) return;
    this.pendingSectorTextures.add(assetUrl);
    const request = this.sectorRequestId;
    void Assets.load<Texture>(assetUrl).then((texture) => {
      this.sectorTextures.set(assetUrl, texture);
      this.pendingSectorTextures.delete(assetUrl);
      if (this.sectorRequestId !== request || this.sectorId !== id) return;
      this.background.texture = texture;
      if (this.sectorParallax) this.sectorParallax.texture = texture;
    }).catch(() => {
      this.pendingSectorTextures.delete(assetUrl);
      if (import.meta.env.DEV) console.info(`Sector background unavailable: ${assetUrl}`);
    });
  }

  sync(game: Game, dt: number, realDt: number): void {
    this.visualTime += dt;
    this.updateStars(dt, game.status === 'playing' ? 1 : 0.28);
    this.syncSector(game, dt);
    this.player.visible = game.status !== 'menu' && game.status !== 'hangar' && game.player.hp > 0;
    const ship = SHIPS[game.ship];
    const combatTexture = ship.combatTexture ? this.combatSheet?.textures[ship.combatTexture] : undefined;
    const playerTexture = combatTexture ?? this.texture(ship.texture);
    if (this.player.texture !== playerTexture) this.player.texture = playerTexture;
    const masteryTrail = (game.save.data.shipMastery[game.ship]?.xp ?? 0) >= MASTERY_TRAIL_XP;
    this.playerGlow.tint = masteryTrail ? 0xffd568 : 0x25cfff;
    this.engineGlow.tint = masteryTrail ? 0xffd568 : 0x4dffff;
    this.playerGlow.visible = this.player.visible;
    this.engineGlow.visible = this.player.visible;
    this.player.position.set(game.player.x, game.player.y);
    this.player.alpha = game.player.invulnerable > 0 ? 0.55 + Math.sin(this.visualTime * 30) * 0.3 : 1;
    this.player.rotation = clamp(game.player.vx / game.stats.moveSpeed, -1, 1) * 0.18;
    const baseScale = combatTexture ? (ship.combatSize ?? 86) / combatTexture.width : 0.83;
    this.player.scale.set(baseScale + Math.sin(this.visualTime * 3) * 0.008);
    this.playerGlow.position.set(game.player.x, game.player.y + 4);
    this.playerGlow.scale.set(1.2 + Math.sin(this.visualTime * 4) * 0.06);
    this.playerGlow.alpha = 0.14;
    this.engineGlow.position.set(game.player.x, game.player.y + 35);
    this.engineGlow.scale.set(0.55 + Math.sin(this.visualTime * 28) * 0.12, 0.8 + Math.sin(this.visualTime * 23) * 0.15);
    this.engineGlow.alpha = 0.75;
    this.shield.visible = this.player.visible && game.player.shield > 0;
    this.shield.position.set(game.player.x, game.player.y);
    this.shield.rotation += dt * 0.35;
    this.shield.alpha = 0.25 + 0.25 * clamp(game.player.shield / Math.max(1, game.stats.maxShield), 0, 1);
    this.shield.scale.set(0.7 + Math.sin(this.visualTime * 4) * 0.012);
    this.syncDrones(game);
    this.syncEnemies(game);
    this.syncBullets(game.bullets.items);
    this.syncPickups(game);
    this.syncEffects(game.particles.items);
    this.syncLines(game);

    const trauma = game.save.data.settings.screenShake ? game.trauma * game.trauma : 0;
    this.world.position.set((Math.random() - 0.5) * trauma * 22, (Math.random() - 0.5) * trauma * 18);
    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.6);
    this.flashLayer.clear();
    if (this.flashAlpha > 0.005) this.flashLayer.rect(0, 0, this.width, this.height).fill({ color: this.flashTint, alpha: this.flashAlpha });
    this.updateDamageLabels(dt);
    this.updatePerformance(realDt);
  }

  releaseBullet(bullet: Bullet): void {
    if (bullet.view && bullet.viewAdded) this.bulletLayer.removeParticle(bullet.view);
    bullet.viewAdded = false;
  }

  releaseEffect(effect: EffectParticle): void {
    if (effect.view && effect.viewAdded) this.effectLayers.get(effect.texture)?.removeParticle(effect.view);
    effect.viewAdded = false;
  }

  releaseEnemy(enemy: Enemy): void {
    if (enemy.view) enemy.view.visible = false;
  }

  releasePickup(pickup: Pickup): void {
    if (pickup.view) pickup.view.visible = false;
  }

  spawnDamage(x: number, y: number, value: number, crit: boolean): void {
    const label = this.damageLabels.find((item) => item.life <= 0) ?? this.damageLabels[0];
    if (!label) return;
    label.life = crit ? 0.85 : 0.58;
    label.maxLife = label.life;
    label.text.text = crit ? `${Math.round(value)}!` : `${Math.round(value)}`;
    label.text.style.fill = crit ? '#ffe66d' : '#d7f8ff';
    label.text.style.fontSize = crit ? 20 : 13;
    label.text.position.set(x + (Math.random() - 0.5) * 15, y - 8);
    label.text.alpha = 1;
    label.text.visible = true;
  }

  spawnMessage(x: number, y: number, message: string, color = '#6ffff6'): void {
    const label = this.damageLabels.find((item) => item.life <= 0) ?? this.damageLabels[0];
    if (!label) return;
    label.life = 1.1;
    label.maxLife = 1.1;
    label.text.text = message;
    label.text.style.fill = color;
    label.text.style.fontSize = 17;
    label.text.position.set(x, y);
    label.text.visible = true;
    label.text.alpha = 1;
  }

  setSettings(settings: GameSettings): void {
    this.flashScale = settings.reducedFlashes ? 0.25 : 1;
  }

  flash(amount: number, tint = 0xffffff): void {
    this.flashAlpha = Math.max(this.flashAlpha, amount * this.flashScale);
    this.flashTint = tint;
  }

  private createScene(): void {
    this.background = new Sprite(this.makeBackgroundTexture());
    this.defaultBackground = this.background.texture;
    this.app.stage.addChild(this.background);
    this.sectorParallax = new TilingSprite({ texture: this.defaultBackground, width: this.width, height: this.height });
    this.sectorParallax.tileScale.set(1.35);
    this.sectorParallax.alpha = 0.1;
    this.sectorParallax.visible = false;
    this.app.stage.addChild(this.sectorParallax);
    this.starLayer = new ParticleContainer({ dynamicProperties: { position: true, rotation: false, color: false, vertex: false, uvs: false } });
    this.app.stage.addChild(this.starLayer);
    this.app.stage.addChild(this.world);
    this.world.addChild(this.telegraphs);
    this.world.addChild(this.pickupLayer);
    this.world.addChild(this.enemyLayer);
    this.world.addChild(this.healthBars);
    this.bulletLayer.blendMode = 'add';
    this.world.addChild(this.bulletLayer);
    for (const texture of ['glow', 'spark', 'smoke', 'ring'] as const) {
      const layer = new ParticleContainer({
        texture: this.effectTextures.get(texture),
        dynamicProperties: { position: true, rotation: true, color: true, vertex: true, uvs: false },
      });
      layer.blendMode = texture === 'smoke' ? 'normal' : 'add';
      this.effectLayers.set(texture, layer);
      this.world.addChild(layer);
    }
    this.world.addChild(this.lightning);
    this.world.addChild(this.droneLayer);
    this.playerGlow = new Sprite(this.effectTextures.get('glow'));
    this.playerGlow.anchor.set(0.5);
    this.playerGlow.tint = 0x25cfff;
    this.playerGlow.blendMode = 'add';
    this.world.addChild(this.playerGlow);
    this.engineGlow = new Sprite(this.effectTextures.get('glow'));
    this.engineGlow.anchor.set(0.5);
    this.engineGlow.tint = 0x4dffff;
    this.engineGlow.blendMode = 'add';
    this.world.addChild(this.engineGlow);
    this.playerLayer.addChild(this.player = new Sprite(this.texture('playerShip1_blue.png')));
    this.player.anchor.set(0.5);
    this.world.addChild(this.playerLayer);
    this.shield = new Sprite(this.texture('shield2.png'));
    this.shield.anchor.set(0.5);
    this.shield.tint = 0x6fffff;
    this.shield.blendMode = 'add';
    this.world.addChild(this.shield);
    for (let index = 0; index < 64; index += 1) {
      const text = new Text({ text: '', style: { fontFamily: 'Kenney, Segoe UI, sans-serif', fontSize: 13, fontWeight: 'bold', fill: '#d7f8ff', stroke: { color: '#020510', width: 3 } } });
      text.anchor.set(0.5);
      text.visible = false;
      this.damageLabels.push({ text, life: 0, maxLife: 1 });
      this.world.addChild(text);
    }
    this.app.stage.addChild(this.flashLayer);
  }

  private syncDrones(game: Game): void {
    while (this.droneViews.length < game.dronePositions.length) {
      const view = new Sprite(this.texture('playerShip3_green.png'));
      view.anchor.set(0.5);
      view.scale.set(0.32);
      view.tint = 0x8dfff2;
      this.droneViews.push(view);
      this.droneLayer.addChild(view);
    }
    for (let index = 0; index < this.droneViews.length; index += 1) {
      const view = this.droneViews[index]!;
      const position = game.dronePositions[index];
      view.visible = Boolean(position) && this.player.visible;
      if (position) view.position.set(position.x, position.y);
    }
  }

  private syncEnemies(game: Game): void {
    for (const enemy of game.enemies.items) {
      const config = ENEMIES[enemy.kind];
      const boss = enemy.kind === 'boss' ? BOSS_LIST[enemy.bossVariant] ?? BOSS_LIST[0]! : undefined;
      const combatName = enemy.kind === 'meteor' ? `meteor-${enemy.id % 4 + 1}.png` : config.combatTexture;
      const hasCombatTexture = Boolean(combatName && this.combatSheet?.textures[combatName]);
      const regularTexture = hasCombatTexture ? combatName! : config.texture;
      const eliteTexture = enemy.elite && config.eliteTexture && this.combatSheet?.textures[config.eliteTexture] ? config.eliteTexture : undefined;
      const texture = boss ? this.texture(boss.texture, boss.fallbackTexture) : this.texture(eliteTexture ?? regularTexture, config.texture);
      let view = enemy.view;
      if (!view) {
        view = new Sprite(texture);
        view.anchor.set(0.5);
        enemy.view = view;
        this.enemyLayer.addChild(view);
      }
      if (!view.parent) this.enemyLayer.addChild(view);
      if (view.texture !== texture) view.texture = texture;
      view.visible = true;
      view.position.set(enemy.x, enemy.y);
      view.rotation = enemy.kind === 'meteor' ? enemy.age * 0.45 + enemy.phase : Math.PI + (enemy.kind === 'weaver' ? Math.sin(enemy.age * 5 + enemy.phase) * 0.25 : 0);
      const pulse = boss ? 1 + Math.sin(enemy.age * 2.5) * 0.025 : 1;
      const scale = boss ? boss.renderSize / texture.width * pulse : hasCombatTexture ? (config.combatSize ?? 80) / texture.width : config.scale;
      view.scale.set(scale * enemy.scale);
      const exposed = boss && (boss.mechanic === 'weakpoint' || boss.mechanic === 'omegaBeams') && enemy.vulnerability > 0;
      view.tint = enemy.flash > 0 ? 0xffffff : exposed ? 0x8fffff : boss ? boss.tint : enemy.elite && !eliteTexture ? 0xffd89a : config.tint;
      view.alpha = enemy.y < -20 ? 0.65 : 1;
    }
  }

  private syncBullets(bullets: Bullet[]): void {
    for (const bullet of bullets) {
      let view = bullet.view;
      if (!view) {
        view = new Particle({ texture: this.texture('laserBlue01.png'), anchorX: 0.5, anchorY: 0.5 });
        bullet.view = view;
      }
      if (!bullet.viewAdded) {
        view.texture = this.texture(this.bulletTexture(bullet));
        const scale = bullet.kind === 'missile' ? bullet.size * 0.82 : bullet.kind === 'orb' ? bullet.size * 0.62 : bullet.size * 0.72;
        view.scaleX = scale;
        view.scaleY = scale;
        this.bulletLayer.addParticle(view);
        bullet.viewAdded = true;
      }
      view.x = bullet.x;
      view.y = bullet.y;
      view.rotation = Math.atan2(bullet.vy, bullet.vx) + Math.PI * 0.5;
      view.tint = bullet.tint;
      view.alpha = clamp(bullet.life * 5, 0, 1);
    }
  }

  private syncPickups(game: Game): void {
    for (const pickup of game.pickups.items) {
      let view = pickup.view;
      if (!view) {
        view = new Sprite(this.texture(PICKUP_TEXTURES[pickup.kind]));
        view.anchor.set(0.5);
        pickup.view = view;
        this.pickupLayer.addChild(view);
      }
      view.texture = this.texture(PICKUP_TEXTURES[pickup.kind]);
      view.visible = true;
      view.position.set(pickup.x, pickup.y);
      view.rotation = pickup.kind === 'xp' || pickup.kind === 'core' ? pickup.age * 1.8 : Math.sin(pickup.age * 3) * 0.15;
      const scale = pickup.kind === 'xp' ? 0.68 : pickup.kind === 'core' ? 0.8 : 0.62;
      view.scale.set(scale * (1 + Math.sin(pickup.age * 5) * 0.08));
      view.tint = pickup.kind === 'xp' ? 0x6fffff : pickup.kind === 'core' ? 0xffd45e : 0xffffff;
      view.alpha = clamp((18 - pickup.age) * 2, 0, 1);
    }
  }

  private syncEffects(effects: EffectParticle[]): void {
    for (const effect of effects) {
      let view = effect.view;
      if (!view) {
        view = new Particle({ texture: this.effectTextures.get(effect.texture)!, anchorX: 0.5, anchorY: 0.5 });
        effect.view = view;
      }
      if (!effect.viewAdded) {
        view.texture = this.effectTextures.get(effect.texture)!;
        this.effectLayers.get(effect.texture)!.addParticle(view);
        effect.viewAdded = true;
      }
      const progress = 1 - effect.life / effect.maxLife;
      view.x = effect.x;
      view.y = effect.y;
      view.rotation = effect.rotation;
      const scale = effect.size * (1 + progress * effect.endScale) / Math.max(view.texture.width, view.texture.height);
      view.scaleX = scale;
      view.scaleY = scale;
      view.tint = effect.tint;
      view.alpha = effect.alpha * (1 - progress) * Math.min(1, effect.life * 12);
    }
  }

  private drawEliteAffixes(game: Game, enemy: Enemy): void {
    if (enemy.affixes === 0) return;
    if (enemy.teleportTelegraph > 0) {
      this.telegraphs.moveTo(enemy.x, enemy.y).lineTo(enemy.teleportTargetX, enemy.teleportTargetY).stroke({ color: 0xc9a1ff, width: 1.5, alpha: 0.2 });
      this.telegraphs.circle(enemy.teleportTargetX, enemy.teleportTargetY, enemy.radius + 7).stroke({ color: 0xc9a1ff, width: 2, alpha: 0.7 });
      this.telegraphs.circle(enemy.teleportTargetX, enemy.teleportTargetY, 8).stroke({ color: 0xe2c9ff, width: 1.5, alpha: 0.65 });
    }
    if (enemy.formationShield < 1) this.telegraphs.circle(enemy.x, enemy.y, enemy.radius + 4).stroke({ color: 0x79cfff, width: 1.5, alpha: 0.5 });
    if (game.enemies.items.length <= 140) {
      if (enemy.affixes & ELITE_AFFIX.formation) this.telegraphs.circle(enemy.x, enemy.y, 170).stroke({ color: 0x79cfff, width: 1, alpha: 0.055 });
      if ((enemy.affixes & ELITE_AFFIX.regeneration) && enemy.affixTimer < 0.3) this.telegraphs.circle(enemy.x, enemy.y, 145).stroke({ color: 0x72ffb0, width: 1.5, alpha: 0.07 });
    }
    if (enemy.y < 0) return;
    const count = ELITE_AFFIX_LIST.reduce((total, affix) => total + Number((enemy.affixes & affix.flag) !== 0), 0);
    let index = 0;
    for (const affix of ELITE_AFFIX_LIST) {
      if ((enemy.affixes & affix.flag) === 0) continue;
      const x = enemy.x + (index - (count - 1) * 0.5) * 13;
      const y = enemy.y - enemy.radius - 22;
      if (affix.flag === ELITE_AFFIX.regeneration) {
        this.healthBars.rect(x - 4, y - 1, 8, 2).fill({ color: affix.color, alpha: 0.9 });
        this.healthBars.rect(x - 1, y - 4, 2, 8).fill({ color: affix.color, alpha: 0.9 });
      } else if (affix.flag === ELITE_AFFIX.formation) {
        this.healthBars.circle(x, y, 5).stroke({ color: affix.color, width: 1.5, alpha: 0.9 });
      } else if (affix.flag === ELITE_AFFIX.teleport) {
        this.healthBars.poly([x, y - 5, x - 5, y, x, y + 5, x + 5, y], true).stroke({ color: affix.color, width: 1.5, alpha: 0.9 });
      } else {
        this.healthBars.moveTo(x - 5, y - 4).lineTo(x, y + 4).lineTo(x + 5, y - 4).stroke({ color: affix.color, width: 1.5, alpha: 0.9 });
      }
      index += 1;
    }
  }

  private syncLines(game: Game): void {
    this.telegraphs.clear();
    this.healthBars.clear();
    this.lightning.clear();
    if (game.weapon === 'beam' && game.status === 'playing' && (game.input.left || game.input.keys.has('Space')) && game.player.beamOverheated <= 0) {
      const heat = game.player.beamHeat / 100;
      const color = heat > 0.8 ? 0xff9c62 : 0x79ffff;
      this.telegraphs.moveTo(game.player.x, game.player.y - 30).lineTo(game.player.x, 0).stroke({ color, width: 20 + heat * 9, alpha: 0.12 });
      this.telegraphs.moveTo(game.player.x, game.player.y - 30).lineTo(game.player.x, 0).stroke({ color, width: 7 + heat * 3, alpha: 0.45 });
      this.telegraphs.moveTo(game.player.x, game.player.y - 30).lineTo(game.player.x, 0).stroke({ color: 0xe8ffff, width: 2, alpha: 0.9 });
    }
    const sector = SECTORS[game.sector];
    if (sector.gravity > 0) {
      const centerX = this.width * 0.5;
      const centerY = this.height * 0.35;
      this.telegraphs.circle(centerX, centerY, 34 + Math.sin(this.visualTime * 3) * 7).stroke({ color: sector.color, width: 3, alpha: 0.55 });
      this.telegraphs.circle(centerX, centerY, 90 + Math.sin(this.visualTime * 2) * 12).stroke({ color: sector.color, width: 1.5, alpha: 0.2 });
      this.telegraphs.circle(centerX, centerY, 160).stroke({ color: sector.color, width: 1, alpha: 0.08 });
    }
    if (game.gravityBomb) {
      const bomb = game.gravityBomb;
      this.telegraphs.circle(bomb.x, bomb.y, bomb.radius).fill({ color: 0xb879ff, alpha: 0.035 });
      this.telegraphs.circle(bomb.x, bomb.y, 35 + Math.sin(this.visualTime * 7) * 8).stroke({ color: 0xd6a5ff, width: 4, alpha: 0.7 });
      this.telegraphs.circle(bomb.x, bomb.y, bomb.radius * (0.7 + Math.sin(this.visualTime * 2) * 0.08)).stroke({ color: 0xb879ff, width: 2, alpha: 0.25 });
    }
    for (const pair of game.riftPairs) {
      this.telegraphs.moveTo(pair.ax, pair.ay).lineTo(pair.bx, pair.by).stroke({ color: 0xa274ff, width: 1, alpha: 0.12 });
      for (const [x, y, color] of [[pair.ax, pair.ay, 0xb879ff], [pair.bx, pair.by, 0x62f5ff]] as const) {
        const radius = 29 + Math.sin(pair.age * 4) * 3;
        this.telegraphs.circle(x, y, radius).fill({ color, alpha: 0.07 });
        this.telegraphs.circle(x, y, radius).stroke({ color, width: 3, alpha: 0.82 });
        this.telegraphs.circle(x, y, 18).stroke({ color, width: 1.5, alpha: 0.48 });
      }
    }
    for (const beam of game.omegaBeams) {
      const active = beam.telegraph <= 0;
      const alpha = active ? Math.max(0.45, Math.min(1, beam.life * 3)) : 0.6 + Math.sin(this.visualTime * 22) * 0.2;
      for (let spoke = 0; spoke < beam.spokes; spoke += 1) {
        const angle = beam.angle + spoke * TAU / beam.spokes;
        const endX = beam.x + Math.cos(angle) * beam.length;
        const endY = beam.y + Math.sin(angle) * beam.length;
        this.telegraphs.moveTo(beam.x, beam.y).lineTo(endX, endY).stroke({ color: active ? 0xffbd62 : 0xffe5a3, width: active ? 18 : 14, alpha: active ? 0.18 * alpha : 0.1 });
        this.telegraphs.moveTo(beam.x, beam.y).lineTo(endX, endY).stroke({ color: active ? 0xff9e50 : 0xffe5a3, width: active ? 6 : 2, alpha });
        if (active) this.telegraphs.moveTo(beam.x, beam.y).lineTo(endX, endY).stroke({ color: 0xffffe0, width: 2, alpha });
      }
    }
    for (const wall of game.laserWalls) {
      const gapLeft = wall.gapX - wall.gapWidth * 0.5;
      const gapRight = wall.gapX + wall.gapWidth * 0.5;
      if (wall.telegraph > 0) {
        const alpha = 0.35 + Math.sin(this.visualTime * 24) * 0.2;
        this.telegraphs.moveTo(0, wall.y).lineTo(gapLeft, wall.y).stroke({ color: 0xff477e, width: 3, alpha });
        this.telegraphs.moveTo(gapRight, wall.y).lineTo(this.width, wall.y).stroke({ color: 0xff477e, width: 3, alpha });
        this.telegraphs.rect(gapLeft, wall.y - 18, wall.gapWidth, 36).fill({ color: 0x65ffd7, alpha: 0.08 });
      } else {
        this.telegraphs.rect(0, wall.y - 13, gapLeft, 26).fill({ color: 0xff347d, alpha: 0.82 });
        this.telegraphs.rect(gapRight, wall.y - 13, this.width - gapRight, 26).fill({ color: 0xff347d, alpha: 0.82 });
        this.telegraphs.rect(gapLeft, wall.y - 16, wall.gapWidth, 32).fill({ color: 0x65ffd7, alpha: 0.12 });
      }
      this.telegraphs.moveTo(gapLeft, wall.y - 22).lineTo(gapLeft, wall.y + 22).stroke({ color: 0x65ffd7, width: 2, alpha: 0.8 });
      this.telegraphs.moveTo(gapRight, wall.y - 22).lineTo(gapRight, wall.y + 22).stroke({ color: 0x65ffd7, width: 2, alpha: 0.8 });
    }
    const zone = game.controlZone;
    if (zone?.active) {
      const color = zone.captured > 0 ? 0x65ffc2 : 0x62f5ff;
      this.telegraphs.circle(zone.x, zone.y, zone.radius).fill({ color, alpha: 0.055 });
      this.telegraphs.circle(zone.x, zone.y, zone.radius).stroke({ color, width: 2, alpha: 0.45 });
      this.telegraphs.arc(zone.x, zone.y, zone.radius - 6, -Math.PI * 0.5, -Math.PI * 0.5 + TAU * (zone.captured > 0 ? 1 : zone.progress / 2)).stroke({ color, width: 5, alpha: 0.9 });
    }
    let kamikazeWarnings = 0;
    for (const enemy of game.enemies.items) {
      this.drawEliteAffixes(game, enemy);
      if (enemy.kind === 'boss') {
        if (enemy.bossVariant === 0 || enemy.bossVariant === 5) this.telegraphs.circle(enemy.x, enemy.y, enemy.radius + 13).stroke({ color: enemy.vulnerability > 0 ? 0x65ffc2 : enemy.bossVariant === 5 ? 0xffd36a : 0xff5b9d, width: 3, alpha: 0.55 });
        if (enemy.bossVariant === 2) {
          const generator = game.enemies.items.find((item) => item.kind === 'generator');
          if (generator) {
          this.telegraphs.moveTo(enemy.x, enemy.y).lineTo(generator.x, generator.y).stroke({ color: 0x62f5ff, width: 4, alpha: 0.3 });
          this.telegraphs.circle(enemy.x, enemy.y, enemy.radius + 16).stroke({ color: 0x62f5ff, width: 4, alpha: 0.5 });
          this.telegraphs.circle(generator.x, generator.y, generator.radius + 11).stroke({ color: 0x62f5ff, width: 2, alpha: 0.7 });
          }
        }
        if (enemy.bossVariant === 3) this.telegraphs.circle(enemy.x, enemy.y + 120, 43 + Math.sin(this.visualTime * 4) * 6).stroke({ color: 0xb879ff, width: 3, alpha: 0.5 });
      }
      if (enemy.kind === 'kamikaze' && kamikazeWarnings < 6 && (enemy.y < 70 || (enemy.x - game.player.x) ** 2 + (enemy.y - game.player.y) ** 2 < 200 ** 2)) {
        kamikazeWarnings += 1;
        const warningX = clamp(enemy.x, 25, this.width - 25);
        const warningY = enemy.y < 70 ? 65 : enemy.y - enemy.radius - 18;
        this.telegraphs.circle(warningX, warningY, 13).stroke({ color: 0xff5d70, width: 2, alpha: 0.75 + Math.sin(this.visualTime * 18) * 0.2 });
        this.telegraphs.poly([warningX, warningY - 8, warningX - 7, warningY + 6, warningX + 7, warningY + 6], true).fill({ color: 0xff5d70, alpha: 0.85 });
        this.telegraphs.rect(warningX - 1, warningY - 4, 2, 6).fill({ color: 0xffffff, alpha: 0.9 });
      }
      if (enemy.telegraph > 0 && enemy.y > 0) {
        this.telegraphs.moveTo(enemy.x, enemy.y).lineTo(game.player.x, game.player.y).stroke({ color: 0xff436d, width: enemy.kind === 'boss' ? 3 : 1.5, alpha: 0.25 + Math.sin(this.visualTime * 25) * 0.12 });
        this.telegraphs.circle(enemy.x, enemy.y, enemy.radius + 8 + Math.sin(this.visualTime * 15) * 4).stroke({ color: 0xff5f86, width: 2, alpha: 0.7 });
      }
      if (enemy.kind === 'sentinel' && Math.sin(enemy.age * 2.2) > 0.1) {
        this.telegraphs.circle(enemy.x, enemy.y, enemy.radius + 9).stroke({ color: 0x63ffe0, width: 2, alpha: 0.42 });
      }
      if (enemy.hp < enemy.maxHp && enemy.y > 0 && enemy.kind !== 'boss' && (game.enemies.items.length <= 120 || enemy.elite)) {
        const width = enemy.radius * 1.5;
        const ratio = clamp(enemy.hp / enemy.maxHp, 0, 1);
        this.healthBars.rect(enemy.x - width / 2, enemy.y - enemy.radius - 11, width, 3).fill({ color: 0x10182d, alpha: 0.85 });
        this.healthBars.rect(enemy.x - width / 2, enemy.y - enemy.radius - 11, width * ratio, 3).fill({ color: enemy.elite ? 0xffcb57 : 0xff4e7d, alpha: 0.9 });
      }
    }
    if (game.player.invulnerable > 0 && game.player.hp > 0) {
      this.telegraphs.circle(game.player.x, game.player.y, game.player.radius + 12 + Math.sin(this.visualTime * 18) * 2).stroke({ color: 0x79ffff, width: 2, alpha: 0.65 });
    }
    for (const line of game.lightnings.items) {
      const alpha = clamp(line.life / line.maxLife, 0, 1);
      const segments = 7;
      let lastX = line.x1;
      let lastY = line.y1;
      for (let index = 1; index <= segments; index += 1) {
        const amount = index / segments;
        const x = line.x1 + (line.x2 - line.x1) * amount + (index === segments ? 0 : Math.sin(index * 17 + this.visualTime * 80) * 8);
        const y = line.y1 + (line.y2 - line.y1) * amount + (index === segments ? 0 : Math.cos(index * 13 + this.visualTime * 70) * 8);
        this.lightning.moveTo(lastX, lastY).lineTo(x, y).stroke({ color: line.tint, width: 5, alpha: alpha * 0.18 });
        this.lightning.moveTo(lastX, lastY).lineTo(x, y).stroke({ color: 0xdfffff, width: 1.4, alpha });
        lastX = x;
        lastY = y;
      }
    }
  }

  private updateDamageLabels(dt: number): void {
    for (const label of this.damageLabels) {
      if (label.life <= 0) continue;
      label.life -= dt;
      if (label.life <= 0) {
        label.text.visible = false;
        continue;
      }
      label.text.y -= dt * 38;
      label.text.alpha = clamp(label.life / label.maxLife * 1.8, 0, 1);
    }
  }

  private updateStars(dt: number, speedMultiplier: number): void {
    for (const star of this.stars) {
      star.particle.y += star.speed * dt * speedMultiplier;
      if (star.particle.y > this.height + 5) {
        star.particle.y = -5;
        star.particle.x = Math.random() * this.width;
      }
    }
  }

  private resize(): void {
    this.width = this.app.screen.width;
    this.height = this.app.screen.height;
    if (!this.background) return;
    this.background.width = this.width;
    this.background.height = this.height;
    if (this.sectorParallax) {
      this.sectorParallax.width = this.width;
      this.sectorParallax.height = this.height;
    }
    const desired = Math.min(320, Math.floor(this.width * this.height / 4800));
    while (this.stars.length < desired) {
      const particle = new Particle({
        texture: this.effectTextures.get('glow')!,
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        anchorX: 0.5,
        anchorY: 0.5,
      });
      const depth = Math.random();
      particle.scaleX = particle.scaleY = 0.025 + depth * 0.09;
      particle.tint = depth > 0.75 ? 0x8deaff : depth > 0.4 ? 0xb9c9ff : 0x686fae;
      particle.alpha = 0.35 + depth * 0.6;
      this.stars.push({ particle, speed: 14 + depth * 95 });
      this.starLayer.addParticle(particle);
    }
    while (this.stars.length > desired) {
      const star = this.stars.pop()!;
      this.starLayer.removeParticle(star.particle);
    }
  }

  private bulletTexture(bullet: Bullet): string {
    if (bullet.kind === 'missile') return 'laserGreen03.png';
    if (bullet.kind === 'orb') return 'laserRed08.png';
    if (bullet.kind === 'heavy') return 'laserRed03.png';
    if (bullet.kind === 'shard') return bullet.owner === 'enemy' ? 'laserRed16.png' : 'laserBlue16.png';
    return bullet.owner === 'drone' ? 'laserGreen01.png' : 'laserBlue01.png';
  }

  private texture(name: string, fallback?: string): Texture {
    const texture = this.combatSheet?.textures[name] ?? this.sheet.textures[name] ?? (fallback ? this.combatSheet?.textures[fallback] ?? this.sheet.textures[fallback] : undefined);
    if (!texture && import.meta.env.DEV && !this.missingTextureKeys.has(name)) {
      this.missingTextureKeys.add(name);
      console.warn(`Missing texture: ${name}`);
    }
    return texture ?? Texture.WHITE;
  }

  private createTextures(): void {
    this.effectTextures.set('glow', this.makeGlowTexture(false));
    this.effectTextures.set('smoke', this.makeGlowTexture(true));
    this.effectTextures.set('spark', this.makeSparkTexture());
    this.effectTextures.set('ring', this.makeRingTexture());
  }

  private makeGlowTexture(noisy: boolean): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d')!;
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(noisy ? 0.2 : 0.08, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(0.42, 'rgba(255,255,255,0.26)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    if (noisy) {
      context.globalCompositeOperation = 'destination-out';
      for (let index = 0; index < 45; index += 1) {
        context.fillStyle = `rgba(0,0,0,${Math.random() * 0.18})`;
        context.beginPath();
        context.arc(Math.random() * 128, Math.random() * 128, 3 + Math.random() * 13, 0, TAU);
        context.fill();
      }
    }
    return Texture.from(canvas);
  }

  private makeSparkTexture(): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 128;
    const context = canvas.getContext('2d')!;
    const gradient = context.createLinearGradient(0, 0, 0, 128);
    gradient.addColorStop(0, 'rgba(255,255,255,0)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,1)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.ellipse(16, 64, 5, 62, 0, 0, TAU);
    context.fill();
    return Texture.from(canvas);
  }

  private makeRingTexture(): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d')!;
    context.strokeStyle = '#ffffff';
    context.lineWidth = 4;
    context.shadowColor = '#ffffff';
    context.shadowBlur = 10;
    context.beginPath();
    context.arc(64, 64, 52, 0, TAU);
    context.stroke();
    return Texture.from(canvas);
  }

  private makeBackgroundTexture(): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1024;
    const context = canvas.getContext('2d')!;
    const base = context.createLinearGradient(0, 0, 1024, 1024);
    base.addColorStop(0, '#02030c');
    base.addColorStop(0.45, '#090722');
    base.addColorStop(1, '#020817');
    context.fillStyle = base;
    context.fillRect(0, 0, 1024, 1024);
    const clouds: Array<[number, number, number, string]> = [
      [220, 280, 400, 'rgba(71,31,161,0.25)'],
      [810, 180, 330, 'rgba(0,145,181,0.15)'],
      [700, 760, 430, 'rgba(153,25,132,0.14)'],
      [110, 900, 330, 'rgba(17,91,143,0.15)'],
    ];
    for (const [x, y, radius, color] of clouds) {
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, color);
      gradient.addColorStop(0.45, color.replace(/0\.\d+\)/, '0.07)'));
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      context.fillStyle = gradient;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    for (let index = 0; index < 450; index += 1) {
      const alpha = 0.12 + Math.random() * 0.5;
      context.fillStyle = `rgba(210,225,255,${alpha})`;
      const size = Math.random() < 0.04 ? 2 : 1;
      context.fillRect(Math.random() * 1024, Math.random() * 1024, size, size);
    }
    return Texture.from(canvas);
  }
}
