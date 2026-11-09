import { formatNumber, formatTime } from '../core/math';
import { assetUrl } from '../core/assets';
import type { QualitySetting } from '../core/save';
import { createBaseStats, META_UPGRADES, metaCost } from '../game/config/meta';
import { getBuildAnalytics } from '../game/analysis';
import { EVOLUTIONS, RARITY_LABELS, UPGRADE_MAP } from '../game/config/upgrades';
import { SHIP_AUGMENTS, augmentById, masteryObjectiveProgress, masteryProgress } from '../game/config/mastery';
import type { ShipAugmentId } from '../game/config/mastery';
import type { SectorDefinition, SectorId } from '../game/config/sectors';
import { WEAPONS, WEAPON_LIST } from '../game/config/weapons';
import type { WeaponId } from '../game/config/weapons';
import { ABILITIES, ABILITY_LIST } from '../game/config/abilities';
import type { AbilityId } from '../game/config/abilities';
import { SHIPS, SHIP_LIST } from '../game/config/ships';
import type { ShipId } from '../game/config/ships';
import { ACHIEVEMENTS, RUN_MODES, RUN_MODE_LIST } from '../game/config/modes';
import type { RunMode } from '../game/config/modes';
import type { OnlineRecord } from '../platform/yandex';
import type { Game, GameView } from '../game/Game';
import type { DamageSource, Difficulty, HudSnapshot, RunSummary, UpgradeDefinition } from '../game/types';
import { icon } from './icons';

const DAMAGE_SOURCE_LABELS: Record<DamageSource, string> = {
  primary: 'Основной огонь', missile: 'Ракеты', drone: 'Дроны', chain: 'Цепные разряды',
  burn: 'Горение', ability: 'Способности', collision: 'Столкновения', shrapnel: 'Осколки',
};

const SYNERGY_SOURCES: Record<string, DamageSource[]> = {
  ionLance: ['primary'], novaArray: ['primary'], stormProtocol: ['chain'],
  aegis: ['ability'], phantomDrones: ['drone'], rocketSwarm: ['missile', 'shrapnel'],
};

const SECTOR_CARD_IMAGES = import.meta.glob('/public/assets/sectors/*-card.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export class UI implements GameView {
  private readonly root: HTMLElement;
  private difficulty: Difficulty;
  private selectedWeapon: WeaponId = 'pulse';
  private selectedAbility: AbilityId = 'dash';
  private selectedMode: RunMode = 'standard';
  onChallengesOpen: ((mode: RunMode) => void) | undefined;
  onFullscreen: (() => void) | undefined;
  private announceTimer = 0;
  private upgradeLockTimer = 0;
  private upgradeLockUntil = 0;
  private upgradeLocked = false;
  private lastChoices: UpgradeDefinition[] = [];
  private lastRoutes: SectorDefinition[] = [];

  constructor(private readonly game: Game) {
    this.root = document.querySelector<HTMLElement>('#ui')!;
    this.difficulty = game.save.data.lastDifficulty;
    this.root.innerHTML = this.template();
    this.root.addEventListener('click', (event) => this.handleClick(event));
    this.root.addEventListener('input', (event) => this.handleSetting(event));
    window.addEventListener('pointermove', (event) => {
      const cursor = this.element('crosshair');
      cursor.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;
    });
    window.addEventListener('keydown', (event) => this.handleKey(event));
    this.updateSettings();
  }

  showMenu(): void {
    this.setScreen('menu');
    this.hideOverlays();
    window.clearTimeout(this.announceTimer);
    this.element('announcement').classList.remove('visible');
    this.element('hud').classList.remove('active');
    this.element('menu-cores').textContent = formatNumber(this.game.save.data.cores);
    this.element('menu-best').textContent = formatNumber(this.game.save.data.bestScore);
    this.element('menu-wave').textContent = `${this.game.save.data.bestWave}`;
    this.element('menu-runs').textContent = `${this.game.save.data.runs}`;
    this.updateDifficulty();
    this.updateWeaponSelection();
    this.updateAbilitySelection();
  }

  showHangar(): void {
    this.setScreen('hangar');
    this.hideOverlays();
    this.element('hud').classList.remove('active');
    this.updateHangar();
  }

  showLoadout(): void {
    this.setScreen('loadout');
    this.hideOverlays();
    this.element('hud').classList.remove('active');
    this.updateLoadout();
  }

  private updateLoadout(): void {
    const save = this.game.save.data;
    const ship = SHIPS[save.selectedShip];
    const stats = createBaseStats(save.meta);
    ship.apply(stats);
    WEAPONS[this.selectedWeapon].apply(stats);
    augmentById(save.selectedAugments[ship.id])?.apply(stats);
    const analytics = getBuildAnalytics(stats, this.selectedWeapon, 0, 1);
    const mastery = masteryProgress(save.shipMastery[ship.id]?.xp ?? 0);
    (this.element('loadout-ship-image') as HTMLImageElement).src = assetUrl(ship.image);
    this.element('loadout-ship-frame').className = `loadout-ship-image mastery-${mastery.level}`;
    this.element('loadout-ship-name').textContent = `${ship.code} // ${ship.name}`;
    this.element('loadout-ship-description').textContent = ship.description;
    this.element('loadout-stats').innerHTML = [
      ['КОРПУС', `${Math.round(stats.maxHp)}`],
      ['ЩИТ', `${Math.round(stats.maxShield)}`],
      ['ОСНОВНОЙ DPS', formatNumber(analytics.primaryDps)],
      ['РАКЕТЫ / С', formatNumber(analytics.missileDps)],
      ['КРИТ', `${Math.round(stats.critChance * 100)}%`],
      ['ДРОНЫ', `${stats.drones}`],
      ['СКОРОСТЬ WASD', `${Math.round(stats.moveSpeed)}`],
      ['СПОСОБНОСТЬ', ABILITIES[this.selectedAbility].shortName],
    ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('');
    this.element('loadout-ship-grid').innerHTML = SHIP_LIST.map((definition) => {
      const unlocked = save.unlockedShips.includes(definition.id);
      const selected = save.selectedShip === definition.id;
      const disabled = !unlocked && save.cores < definition.unlockCost;
      const level = masteryProgress(save.shipMastery[definition.id]?.xp ?? 0).level;
      return `<button class="loadout-ship-card${selected ? ' selected' : ''}" data-ship="${definition.id}" ${disabled ? 'disabled' : ''}><img class="ship-card-thumb" src="${assetUrl(definition.image)}" alt="" loading="lazy"><strong>${definition.name}</strong><span>${selected ? 'ВЫБРАН' : unlocked ? 'ВЫБРАТЬ' : `${definition.unlockWave} ВОЛНА / ◆ ${definition.unlockCost}`}</span><small>MK ${level}</small></button>`;
    }).join('');
    this.element('loadout-mastery').innerHTML = `
      <div class="mastery-heading"><span>МАСТЕРСТВО ${mastery.level} · ${save.shipMastery[ship.id]?.xp ?? 0} XP</span><b>${mastery.next === undefined ? 'МАКСИМУМ' : `${mastery.remaining} XP ДО УРОВНЯ ${mastery.level + 1}`}</b></div>
      <div class="mastery-track"><i style="width:${mastery.next === undefined ? 100 : Math.min(100, ((save.shipMastery[ship.id]?.xp ?? 0) - mastery.current) / (mastery.next - mastery.current) * 100)}%"></i></div>
      <div class="augment-options"><button class="augment-option${save.selectedAugments[ship.id] ? '' : ' selected'}" data-augment=""><strong>СТАНДАРТ</strong><span>Без модификатора мастерства</span></button>${SHIP_AUGMENTS[ship.id].map((augment) => {
        const unlocked = (save.shipMastery[ship.id]?.xp ?? 0) >= augment.unlockXp;
        return `<button class="augment-option${save.selectedAugments[ship.id] === augment.id ? ' selected' : ''}" data-augment="${augment.id}" ${unlocked ? '' : 'disabled'}><strong>${unlocked ? augment.name : `ОТКРОЕТСЯ НА ${augment.unlockXp} XP`}</strong><span>${augment.description}</span></button>`;
      }).join('')}</div>`;
    this.element('loadout-weapon-description').textContent = WEAPONS[this.selectedWeapon].menuDescription;
    this.element('loadout-ability-description').textContent = ABILITIES[this.selectedAbility].description;
    this.element('loadout-mode-description').textContent = RUN_MODES[this.selectedMode].description;
    this.element('loadout-cores').textContent = formatNumber(save.cores);
  }

  showPlaying(): void {
    this.setScreen('');
    this.hideOverlays();
    this.element('hud').classList.add('active');
  }

  showPause(): void {
    this.element('pause-overlay').classList.add('active');
    document.body.dataset.state = 'paused';
    this.updateSettings();
    this.updateBuildPanel();
  }

  showLevelUp(choices: UpgradeDefinition[]): void {
    const needsLock = !this.element('levelup-overlay').classList.contains('active');
    this.lastChoices = choices;
    document.body.dataset.state = 'levelup';
    this.element('level-number').textContent = `${this.game.player.level}`;
    const container = this.element('upgrade-cards');
    container.innerHTML = choices.map((choice, index) => {
      const rank = this.game.getUpgradeRank(choice.id);
      const nextRank = rank + 1;
      const rankLabel = Number.isFinite(choice.max) ? `РАНГ ${nextRank} / ${choice.max}` : `РАНГ ${nextRank} · ∞`;
      const preview = this.game.getUpgradePreview(choice.id);
      const evolutionClass = preview.synergy ? ' evolution-path' : '';
      return `<article class="upgrade-card rarity-${choice.rarity}${evolutionClass}" style="--card-index:${index}">
        <div class="card-rarity"><span>${RARITY_LABELS[choice.rarity]}</span><span>${rankLabel}</span></div>
        <button class="upgrade-select" data-upgrade="${choice.id}" aria-label="Выбрать ${choice.name}">
          <span class="upgrade-icon">${icon(choice.id, choice.icon)}</span>
          <span class="upgrade-name">${choice.name}</span>
          <span class="upgrade-description">${choice.description}</span>
          <span class="upgrade-preview">${preview.changes.join('<br>')}</span>
          ${preview.synergy ? `<span class="upgrade-synergy">${preview.synergy}</span>` : ''}
          <span class="upgrade-pick"><span>ВЫБРАТЬ</span><kbd>${index + 1}</kbd></span>
        </button>
        <button class="banish-button" data-banish="${choice.id}" title="Исключить карту из забега">ИСКЛЮЧИТЬ</button>
      </article>`;
    }).join('');
    this.element('reroll-count').textContent = `${this.game.rerolls}`;
    this.element('banish-count').textContent = `${this.game.banishes}`;
    this.element('levelup-overlay').classList.add('active');
    if (needsLock) this.startUpgradeLock();
    this.updateUpgradeLock();
  }

  showRouteChoice(choices: SectorDefinition[]): void {
    this.hideOverlays();
    this.lastRoutes = choices;
    document.body.dataset.state = 'route';
    this.element('route-cards').innerHTML = choices.map((route, index) => {
      const color = `#${route.color.toString(16).padStart(6, '0')}`;
      return `<article class="upgrade-card route-card" style="--rarity:${color};--card-index:${index}">
        <div class="card-rarity"><span>МАРШРУТ · 5 ВОЛН</span><span>0${index + 1}</span></div>
        <button class="upgrade-select route-select" data-route="${route.id}">
          ${route.cardImage && SECTOR_CARD_IMAGES[`/public${route.cardImage}`] ? `<img class="route-card-image" src="${SECTOR_CARD_IMAGES[`/public${route.cardImage}`]}" alt="" loading="lazy">` : ''}
          <span class="upgrade-icon">${route.icon}</span>
          <span class="upgrade-name">${route.name}</span>
          <span class="route-subtitle">${route.subtitle}</span>
          <span class="upgrade-description">${route.description}</span>
          <span class="upgrade-pick"><span>ВЫБРАТЬ МАРШРУТ</span><kbd>${index + 1}</kbd></span>
        </button>
      </article>`;
    }).join('');
    this.element('route-overlay').classList.add('active');
  }

  showGameOver(summary: RunSummary): void {
    this.hideOverlays();
    this.element('hud').classList.remove('active');
    this.setScreen('gameover');
    const ship = SHIPS[summary.ship];
    const mastery = masteryProgress(this.game.save.data.shipMastery[summary.ship]?.xp ?? 0);
    this.element('result-eyebrow').textContent = `${ship.code} // ${summary.training ? 'ПОЛИГОН' : summary.deathCause ? 'СИГНАЛ ПОТЕРЯН' : 'ЖУРНАЛ ЗАБЕГА'}`;
    this.element('result-title').innerHTML = summary.training ? 'ПОЛИГОН<br><span>ЗАВЕРШЁН</span>' : summary.deathCause ? 'КОРАБЛЬ<br><span>УНИЧТОЖЕН</span>' : 'ЗАБЕГ<br><span>ЗАВЕРШЁН</span>';
    (this.element('result-ship-image') as HTMLImageElement).src = assetUrl(ship.image);
    this.element('result-ship-frame').className = `result-ship mastery-${mastery.level}`;
    this.element('result-ship-name').textContent = `${ship.code} // ${ship.name}`;
    this.element('result-loadout').textContent = `${WEAPONS[summary.weapon].shortName} · ${ABILITIES[summary.ability].shortName}${augmentById(this.game.save.data.selectedAugments[summary.ship]) ? ` · ${augmentById(this.game.save.data.selectedAugments[summary.ship])!.name}` : ''}`;
    this.element('result-score').textContent = formatNumber(summary.score);
    this.element('result-wave').textContent = `${summary.wave}`;
    this.element('result-kills').textContent = formatNumber(summary.kills);
    this.element('result-time').textContent = formatTime(summary.time);
    this.element('result-cores').textContent = summary.training ? 'БЕЗ НАГРАД' : `+${formatNumber(summary.cores)}`;
    this.element('result-cores-label').textContent = summary.training ? 'СИМУЛЯЦИЯ' : 'ЯДРА СОХРАНЕНЫ';
    this.element('result-level').textContent = `${summary.level}`;
    this.element('result-difficulty').textContent = `${RUN_MODES[summary.mode].name}${summary.mode === 'daily' ? ` · SEED ${summary.seed}` : ''} · ${summary.difficulty === 'hardcore' ? 'ХАРДКОР' : 'ВЕТЕРАН'}`;
    const build = this.game.getBuild();
    this.element('result-build').innerHTML = build.length > 0
      ? build.slice(0, 10).map(({ definition, rank }) => `<span title="${definition.description}">${icon(definition.id, definition.icon)} ${definition.name}<b>${rank}</b></span>`).join('')
      : '<span class="muted">Улучшения не получены</span>';
    const sources = (Object.entries(summary.damageBySource) as Array<[DamageSource, number]>).filter(([, damage]) => damage > 0).sort(([, a], [, b]) => b - a);
    const totalDamage = sources.reduce((total, [, damage]) => total + damage, 0);
    this.element('result-damage').innerHTML = sources.length > 0
      ? sources.map(([source, damage]) => `<div class="result-damage-row"><span>${DAMAGE_SOURCE_LABELS[source]}</span><strong>${formatNumber(damage)}</strong><b>${totalDamage > 0 ? Math.round(damage / totalDamage * 100) : 0}%</b></div>`).join('')
      : '<span class="muted">Урон не зарегистрирован</span>';
    const evolutions = build.filter(({ definition }) => definition.requires).map(({ definition }) => ({
      definition,
      damage: (SYNERGY_SOURCES[definition.id] ?? ['primary']).reduce((total, source) => total + (summary.damageBySource[source] ?? 0), 0),
    })).sort((a, b) => b.damage - a.damage);
    const best = evolutions[0];
    this.element('result-synergy').textContent = best && best.damage > 0
      ? `${best.definition.name.replace('ЭВОЛЮЦИЯ: ', '')} · ${formatNumber(best.damage)} связанного урона (${Math.round(best.damage / Math.max(1, totalDamage) * 100)}%)`
      : 'Активные эволюции не найдены';
    this.element('result-death').textContent = summary.training ? 'Мишени неуязвимы. Все рекорды и награды отключены.' : summary.deathCause ? `Причина гибели: ${summary.deathCause}` : 'Забег завершён без гибели корабля.';
    this.element('result-mastery').textContent = summary.training ? 'Мастерство не начисляется' : `+${summary.masteryXp} XP мастерства · MK ${mastery.level}${mastery.next === undefined ? '' : ` · до следующего уровня ${mastery.remaining} XP`}`;
    this.element('result-history').innerHTML = summary.cardHistory.length > 0
      ? summary.cardHistory.map((entry, index) => {
        const definition = UPGRADE_MAP.get(entry.id);
        return `<div class="result-history-item"><span class="result-history-index">${String(index + 1).padStart(2, '0')}</span><span class="result-history-icon">${icon(entry.id, definition?.icon)}</span><div><strong>${definition?.name ?? entry.id}</strong><span>ВОЛНА ${entry.wave} · ${formatTime(entry.time)}</span></div><b>РАНГ ${entry.rank}</b></div>`;
      }).join('')
      : '<span class="muted">Карты не выбирались</span>';
  }

  private showCodex(): void {
    const discovered = this.game.save.data.discoveredEvolutions;
    this.element('codex-count').textContent = `${discovered.length} / ${EVOLUTIONS.length}`;
    this.element('codex-grid').innerHTML = EVOLUTIONS.map((definition) => {
      const unlocked = discovered.includes(definition.id);
      const requirements = Object.entries(definition.requires ?? {}).map(([id, rank]) => `${UPGRADE_MAP.get(id)?.name ?? id} · ранг ${rank}`).join('<br>');
      return `<article class="codex-card${unlocked ? ' unlocked' : ' locked'}"><div class="codex-icon">${icon(definition.id, definition.icon)}</div><h3>${unlocked ? definition.name : 'НЕИЗВЕСТНАЯ ЭВОЛЮЦИЯ'}</h3><p>${unlocked ? definition.description : 'Соберите требуемые ранги в одном забеге, чтобы раскрыть эффект.'}</p><div class="codex-requirements">${requirements}</div><span>${unlocked ? 'ОТКРЫТО' : 'ТРЕБУЕТСЯ НАЙТИ'}</span></article>`;
    }).join('');
    this.element('codex-modal').classList.add('active');
  }

  updateHUD(snapshot: HudSnapshot): void {
    this.bar('hull-fill', snapshot.hp / snapshot.maxHp);
    this.bar('shield-fill', snapshot.maxShield > 0 ? snapshot.shield / snapshot.maxShield : 0);
    this.bar('xp-fill', snapshot.xp / snapshot.xpNext);
    this.element('hull-text').textContent = `${Math.ceil(snapshot.hp)} / ${Math.ceil(snapshot.maxHp)}`;
    this.element('shield-text').textContent = snapshot.maxShield > 0 ? `${Math.ceil(snapshot.shield)} / ${Math.ceil(snapshot.maxShield)}` : 'НЕТ ЩИТА';
    this.element('hud-level').textContent = `${snapshot.level}`;
    this.element('hud-xp').textContent = `${Math.floor(snapshot.xp)} / ${snapshot.xpNext}`;
    this.element('hud-wave').textContent = snapshot.training ? `ПОЛИГОН · ${Math.ceil(snapshot.trainingTime ?? 0)} С` : `ВОЛНА ${snapshot.wave} · УГРОЗА ${snapshot.threat}`;
    this.element('hud-sector').textContent = `${snapshot.sectorIcon} ${snapshot.sectorName} · ${snapshot.modeName}`;
    this.element('hud-score').textContent = formatNumber(snapshot.score);
    this.element('hud-cores').textContent = formatNumber(snapshot.cores);
    this.element('hud-combo').textContent = `×${snapshot.combo.toFixed(1)}`;
    this.element('hud-combo').classList.toggle('hot', snapshot.combo >= 2);
    this.element('primary-weapon-name').textContent = snapshot.weaponName;
    this.element('weapon-heat').classList.toggle('visible', snapshot.weaponName === 'BEAM');
    this.element('weapon-heat').classList.toggle('overheated', snapshot.weaponOverheated);
    this.bar('weapon-heat-fill', snapshot.weaponHeat);
    this.element('primary-weapon-subtitle').textContent = snapshot.weaponName === 'BEAM' ? snapshot.weaponOverheated ? 'ПЕРЕГРЕВ' : `НАГРЕВ ${Math.round(snapshot.weaponHeat * 100)}%` : 'ОСНОВНОЕ ОРУЖИЕ';
    const cooldownRatio = snapshot.missileCooldownMax > 0 ? snapshot.missileCooldown / snapshot.missileCooldownMax : 0;
    this.element('missile-cooldown').style.height = `${cooldownRatio * 100}%`;
    this.element('missile-status').textContent = snapshot.missileCooldown <= 0 ? 'ГОТОВО' : `${snapshot.missileCooldown.toFixed(1)}с`;
    this.element('missile-status').classList.toggle('ready', snapshot.missileCooldown <= 0);
    this.element('ability-name').textContent = snapshot.abilityName;
    this.element('ability-cooldown').style.height = `${snapshot.abilityCooldown / snapshot.abilityCooldownMax * 100}%`;
    const secondaryStatus = snapshot.secondaryName ? ` · E ${snapshot.secondaryCooldown <= 0 ? 'ГОТОВО' : `${snapshot.secondaryCooldown.toFixed(1)}с`}` : '';
    this.element('ability-status').textContent = `${snapshot.abilityActive ? 'АКТИВНО' : snapshot.abilityCooldown <= 0 ? 'Q · ГОТОВО' : `${snapshot.abilityCooldown.toFixed(1)}с`}${secondaryStatus}`;
    this.element('ability-status').classList.toggle('ready', snapshot.abilityCooldown <= 0 || snapshot.abilityActive);
    this.element('overdrive').classList.toggle('visible', snapshot.overdrive > 0);
    this.element('overdrive-time').textContent = snapshot.overdrive.toFixed(1);
    const bossVisible = snapshot.bossMaxHp > 0;
    this.element('boss-bar').classList.toggle('visible', bossVisible);
    if (bossVisible) {
      this.bar('boss-fill', snapshot.bossHp / snapshot.bossMaxHp);
      this.element('boss-name').textContent = snapshot.bossName;
      this.element('boss-hp').textContent = `${Math.ceil(snapshot.bossHp / snapshot.bossMaxHp * 100)}%`;
    }
    this.element('debug-stats').textContent = `${snapshot.fps.toFixed(0)} FPS · ${snapshot.enemies} врагов · ${snapshot.bullets} снарядов · ${snapshot.particles} частиц · FX ${(snapshot.quality * 100).toFixed(0)}%`;
    this.element('training-hud').classList.toggle('active', snapshot.training === true);
    this.element('training-time').textContent = `${Math.ceil(snapshot.trainingTime ?? 0)} С`;
    this.element('training-dps').textContent = formatNumber(snapshot.trainingDps ?? 0);
    this.element('training-primary-dps').textContent = formatNumber(snapshot.trainingPrimaryDps ?? 0);
    this.element('training-missile-dps').textContent = formatNumber(snapshot.trainingMissileDps ?? 0);
    this.element('tutorial-hint').classList.toggle('active', Boolean(snapshot.tutorialText));
    this.element('tutorial-text').textContent = snapshot.tutorialText ?? '';
  }

  updateHangar(): void {
    const save = this.game.save.data;
    const ship = SHIPS[save.selectedShip];
    const mastery = masteryProgress(save.shipMastery[ship.id]?.xp ?? 0);
    this.element('hangar-cores').textContent = formatNumber(save.cores);
    (this.element('selected-ship-image') as HTMLImageElement).src = assetUrl(ship.image);
    this.element('selected-ship-frame').className = `hangar-ship-image mastery-${mastery.level}`;
    this.element('selected-ship-name').textContent = `${ship.code} // ${ship.name}`;
    this.element('selected-ship-description').textContent = ship.description;
    const stats = createBaseStats(save.meta);
    ship.apply(stats);
    WEAPONS[this.selectedWeapon].apply(stats);
    augmentById(save.selectedAugments[ship.id])?.apply(stats);
    this.element('ship-grid').innerHTML = SHIP_LIST.map((definition) => {
      const unlocked = save.unlockedShips.includes(definition.id);
      const selected = save.selectedShip === definition.id;
      const disabled = !unlocked && save.cores < definition.unlockCost;
      const level = masteryProgress(save.shipMastery[definition.id]?.xp ?? 0).level;
      return `<button class="ship-card${selected ? ' selected' : ''}" data-ship="${definition.id}" ${disabled ? 'disabled' : ''}><img class="ship-card-thumb" src="${assetUrl(definition.image)}" alt="" loading="lazy"><strong>${definition.name}</strong><span>${selected ? 'ВЫБРАН' : unlocked ? 'ВЫБРАТЬ' : `${definition.unlockWave} ВОЛНА / ◆ ${definition.unlockCost}`}</span><small>MK ${level}</small></button>`;
    }).join('');
    this.element('hangar-stats').innerHTML = [
      ['КОРПУС', Math.round(stats.maxHp).toString()],
      ['УРОН', stats.damage.toFixed(1)],
      ['ТЕМП / С', stats.fireRate.toFixed(1)],
      ['ЩИТ', Math.round(stats.maxShield).toString()],
      ['РАКЕТЫ', Math.round(stats.missileDamage).toString()],
      ['УДАЧА', stats.luck.toFixed(0)],
    ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('');
    const selectedAugment = augmentById(save.selectedAugments[ship.id]);
    this.element('hangar-mastery').innerHTML = `
      <div class="mastery-heading"><span>МАСТЕРСТВО ${mastery.level} · ${save.shipMastery[ship.id]?.xp ?? 0} XP</span><b>${selectedAugment?.name ?? 'СТАНДАРТ'}</b></div>
      <div class="mastery-track"><i style="width:${mastery.next === undefined ? 100 : Math.min(100, ((save.shipMastery[ship.id]?.xp ?? 0) - mastery.current) / (mastery.next - mastery.current) * 100)}%"></i></div>
      <div class="mastery-tasks">${masteryObjectiveProgress(save.shipMastery[ship.id]).map((task) => `<div class="mastery-task${task.complete ? ' done' : ''}"><span>${task.name}</span><b>${task.complete ? 'ВЫПОЛНЕНО' : `${task.progress}/${task.target}`}</b></div>`).join('')}</div>`;
    this.element('meta-grid').innerHTML = META_UPGRADES.map((definition) => {
      const level = save.meta[definition.id] ?? 0;
      const cost = metaCost(definition, level);
      const affordable = save.cores >= cost;
      return `<article class="meta-card">
        <div class="meta-icon">${icon(definition.id, definition.icon)}</div>
        <div class="meta-info"><h3>${definition.name}</h3><p>${definition.description}</p><span>УРОВЕНЬ ${level} <b>∞</b></span></div>
        <button class="meta-buy" data-meta="${definition.id}" ${affordable ? '' : 'disabled'}><span>УЛУЧШИТЬ</span><strong>◆ ${formatNumber(cost)}</strong></button>
      </article>`;
    }).join('');
  }

  private updateBuildPanel(): void {
    const analytics = this.game.getAnalytics();
    this.element('pause-primary-dps').textContent = formatNumber(analytics.primaryDps);
    this.element('pause-missile-dps').textContent = `${formatNumber(analytics.missileDps)} · ${analytics.missileCount} рак.`;
    this.element('pause-crit').textContent = `${Math.round(analytics.critChance * 100)}% · ×${analytics.critMultiplier.toFixed(1)}`;
    this.element('pause-links').textContent = `${analytics.pierce} · ${analytics.chain}`;
    this.element('pause-drones').textContent = `${analytics.drones}`;
    this.element('pause-defense').textContent = `${Math.round(analytics.maxHp)} · ${Math.round(analytics.maxShield)} · ${analytics.armor.toFixed(1)}`;
    const build = this.game.getBuild();
    this.element('pause-build-list').innerHTML = build.length > 0
      ? build.map(({ definition, rank }) => `<span title="${definition.description}">${icon(definition.id, definition.icon)} ${definition.name}<b>${rank}</b></span>`).join('')
      : '<span class="muted">Улучшения пока не выбраны</span>';
  }

  announce(title: string, subtitle = ''): void {
    window.clearTimeout(this.announceTimer);
    const element = this.element('announcement');
    element.querySelector('strong')!.textContent = title;
    element.querySelector('span')!.textContent = subtitle;
    element.classList.remove('visible');
    void element.offsetWidth;
    element.classList.add('visible');
    this.announceTimer = window.setTimeout(() => element.classList.remove('visible'), 2600);
  }

  setMuted(muted: boolean): void {
    document.body.classList.toggle('muted', muted);
    for (const button of this.root.querySelectorAll('[data-action="mute"]')) button.setAttribute('aria-label', muted ? 'Включить звук' : 'Выключить звук');
  }

  private startUpgradeLock(): void {
    window.clearInterval(this.upgradeLockTimer);
    this.upgradeLocked = true;
    this.upgradeLockUntil = performance.now() + 2000;
    this.upgradeLockTimer = window.setInterval(() => this.updateUpgradeLock(), 50);
  }

  private updateUpgradeLock(): void {
    const remaining = Math.max(0, (this.upgradeLockUntil - performance.now()) / 1000);
    if (remaining <= 0) {
      this.upgradeLocked = false;
      window.clearInterval(this.upgradeLockTimer);
      this.upgradeLockTimer = 0;
    }
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('.upgrade-select')) button.disabled = this.upgradeLocked;
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('.banish-button')) button.disabled = this.upgradeLocked || this.game.banishes <= 0;
    (this.element('reroll-button') as HTMLButtonElement).disabled = this.upgradeLocked || this.game.rerolls <= 0;
    const lock = this.element('upgrade-lock');
    lock.textContent = this.upgradeLocked ? `ЗАЩИТА ОТ СЛУЧАЙНОГО КЛИКА · ${remaining.toFixed(1)} С` : 'ВЫБОР ДОСТУПЕН';
    lock.classList.toggle('unlocked', !this.upgradeLocked);
  }

  private setScreen(name: string): void {
    for (const screen of this.root.querySelectorAll<HTMLElement>('.screen')) screen.classList.toggle('active', screen.dataset.screen === name);
    document.body.dataset.state = name || 'playing';
  }

  private hideOverlays(): void {
    window.clearInterval(this.upgradeLockTimer);
    this.upgradeLockTimer = 0;
    this.upgradeLocked = false;
    for (const overlay of this.root.querySelectorAll<HTMLElement>('.overlay')) overlay.classList.remove('active');
    this.element('settings-modal').classList.remove('active');
  }

  private handleClick(event: Event): void {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!target || target.disabled) return;
    void this.game.audio.unlock();
    const action = target.dataset.action;
    if (target.dataset.upgrade) this.game.selectUpgrade(target.dataset.upgrade);
    else if (target.dataset.banish) this.game.banishUpgrade(target.dataset.banish);
    else if (target.dataset.route) this.game.selectRoute(target.dataset.route as SectorId);
    else if (target.dataset.meta) this.game.purchaseMeta(target.dataset.meta);
    else if (target.dataset.ship) {
      const id = target.dataset.ship as ShipId;
      if (this.game.save.data.unlockedShips.includes(id)) this.game.selectShip(id);
      else this.game.purchaseShip(id);
      this.selectedWeapon = SHIPS[id].defaultWeapon;
      this.selectedAbility = SHIPS[id].defaultAbility;
      this.updateWeaponSelection();
      this.updateAbilitySelection();
      if (this.game.status === 'loadout') this.updateLoadout();
    } else if (target.dataset.augment !== undefined) {
      const id = target.dataset.augment as ShipAugmentId | '';
      if (this.game.save.selectShipAugment(this.game.save.data.selectedShip, id === '' ? null : id)) {
        this.game.audio.play('click');
        this.updateLoadout();
      }
    } else if (target.dataset.weapon) {
      this.selectedWeapon = target.dataset.weapon as WeaponId;
      this.game.audio.play('click');
      this.updateWeaponSelection();
      if (this.game.status === 'loadout') this.updateLoadout();
    } else if (target.dataset.ability) {
      this.selectedAbility = target.dataset.ability as AbilityId;
      this.game.audio.play('click');
      this.updateAbilitySelection();
      if (this.game.status === 'loadout') this.updateLoadout();
    } else if (target.dataset.mode) {
      this.selectedMode = target.dataset.mode as RunMode;
      this.game.audio.play('click');
      this.updateChallenges();
      if (this.game.status === 'loadout') this.updateLoadout();
      this.onChallengesOpen?.(this.selectedMode);
    } else if (target.dataset.difficulty) {
      this.difficulty = target.dataset.difficulty as Difficulty;
      this.game.audio.play('click');
      this.updateDifficulty();
      if (this.game.status === 'loadout') this.updateLoadout();
    } else if (action) {
      switch (action) {
        case 'start': this.game.openLoadout(); break;
        case 'restart': this.game.openLoadout(); break;
        case 'start-run': this.game.startRun(this.difficulty, this.selectedWeapon, this.selectedAbility, this.game.save.data.selectedShip, this.selectedMode); break;
        case 'start-training': this.game.startRun(this.difficulty, this.selectedWeapon, this.selectedAbility, this.game.save.data.selectedShip, this.selectedMode, true); break;
        case 'codex': this.showCodex(); break;
        case 'close-codex': this.element('codex-modal').classList.remove('active'); break;
        case 'skip-tutorial': this.game.skipTutorial(); break;
        case 'hangar': this.game.openHangar(); break;
        case 'menu': this.game.returnToMenu(); break;
        case 'resume': this.game.resume(); break;
        case 'pause': this.game.togglePause(); break;
        case 'reroll': this.game.rerollUpgrades(); break;
        case 'settings': this.element('settings-modal').classList.add('active'); this.updateSettings(); break;
        case 'close-settings': this.element('settings-modal').classList.remove('active'); break;
        case 'challenges': this.updateChallenges(); this.element('challenges-modal').classList.add('active'); this.onChallengesOpen?.(this.selectedMode); break;
        case 'close-challenges': this.element('challenges-modal').classList.remove('active'); break;
        case 'fullscreen': this.onFullscreen?.(); break;
        case 'mute': this.setMuted(this.game.audio.toggleMute()); break;
        case 'reset': this.resetProgress(); break;
      }
    }
  }

  private handleSetting(event: Event): void {
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    if (!input.dataset.setting) return;
    const key = input.dataset.setting;
    const value = input.type === 'checkbox' ? input.checked : input.type === 'range' ? Number(input.value) : input.value;
    this.game.save.updateSettings({ [key]: value });
    this.game.audio.setSettings(this.game.save.data.settings);
    if (key === 'quality') this.game.renderer.setQuality(value as QualitySetting);
  }

  private updateSettings(): void {
    const settings = this.game.save.data.settings;
    for (const input of this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-setting]')) {
      const key = input.dataset.setting as keyof typeof settings;
      const value = settings[key];
      if (input.type === 'checkbox') (input as HTMLInputElement).checked = Boolean(value);
      else input.value = String(value);
    }
  }

  private updateDifficulty(): void {
    for (const button of this.root.querySelectorAll<HTMLElement>('[data-difficulty]')) button.classList.toggle('selected', button.dataset.difficulty === this.difficulty);
    this.element('difficulty-description').textContent = this.difficulty === 'hardcore'
      ? '+35% прочности врагов · +30% урона · очки ×1,75 · +50% ядер с боссов'
      : 'Сбалансированный режим · полная смерть · все ядры сохраняются';
  }

  private updateWeaponSelection(): void {
    for (const button of this.root.querySelectorAll<HTMLElement>('[data-weapon]')) button.classList.toggle('selected', button.dataset.weapon === this.selectedWeapon);
  }

  private updateAbilitySelection(): void {
    for (const button of this.root.querySelectorAll<HTMLElement>('[data-ability]')) button.classList.toggle('selected', button.dataset.ability === this.selectedAbility);
  }

  private updateChallenges(): void {
    for (const button of this.root.querySelectorAll<HTMLElement>('[data-mode]')) button.classList.toggle('selected', button.dataset.mode === this.selectedMode);
    this.element('mode-grid').innerHTML = RUN_MODE_LIST.map((mode) => `<button class="mode-card${mode.id === this.selectedMode ? ' selected' : ''}" data-mode="${mode.id}"><strong>${mode.name}</strong><span>${mode.description}</span><b>ОЧКИ ×${mode.scoreMultiplier}</b></button>`).join('');
    const records = Object.entries(this.game.save.data.modeRecords).sort(([, a], [, b]) => b.score - a.score).slice(0, 6);
    this.element('records-list').innerHTML = records.length > 0
      ? records.map(([key, record]) => `<div><span>${key.startsWith('daily:') ? `DAILY ${record.seed}` : RUN_MODES[record.mode].name}</span><strong>${formatNumber(record.score)}</strong><b>ВОЛНА ${record.wave}</b></div>`).join('')
      : '<p class="muted">Первый рекорд ещё впереди.</p>';
    this.element('achievements-list').innerHTML = ACHIEVEMENTS.map((achievement) => {
      const unlocked = this.game.save.data.achievements.includes(achievement.id);
      return `<div class="achievement${unlocked ? ' unlocked' : ''}"><span>${unlocked ? '◆' : '◇'}</span><div><strong>${achievement.name}</strong><small>${achievement.description}</small></div></div>`;
    }).join('');
  }

  showOnlineRecords(records: OnlineRecord[]): void {
    this.element('platform-records').innerHTML = records.length > 0
      ? `<h4>СЕТЕВОЙ ТОП</h4>${records.map((record) => `<div><span>#${record.rank} ${this.escapeHtml(record.name)}</span><strong>${formatNumber(record.score)}</strong></div>`).join('')}`
      : '';
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
  }

  private resetProgress(): void {
    if (!window.confirm('Стереть все ядра, рекорды и постоянные улучшения? Настройки сохранятся.')) return;
    this.game.save.resetProgress();
    this.updateHangar();
    this.showMenu();
  }

  private handleKey(event: KeyboardEvent): void {
    const index = ['Digit1', 'Digit2', 'Digit3'].indexOf(event.code);
    if (this.game.status === 'route') {
      const route = this.lastRoutes[index];
      if (route) this.game.selectRoute(route.id);
      return;
    }
    if (this.game.status !== 'levelup' || this.upgradeLocked) return;
    if (index >= 0) {
      const choice = this.lastChoices[index];
      if (choice) this.game.selectUpgrade(choice.id);
    }
  }

  private bar(id: string, ratio: number): void {
    this.element(id).style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  }

  private element(id: string): HTMLElement {
    return this.root.querySelector<HTMLElement>(`#${id}`)!;
  }

  private template(): string {
    return `
      <div id="crosshair" aria-hidden="true"><i></i><b></b></div>
      <section class="screen menu-screen active" data-screen="menu">
        <header class="menu-nav"><div class="mini-logo"><span>NV</span> NEON VOID</div><div class="nav-actions"><span class="currency">◆ <b id="menu-cores">0</b></span><button class="icon-button" data-action="codex" aria-label="Кодекс эволюций">⌬</button><button class="icon-button" data-action="challenges" aria-label="Испытания и рекорды">⌖</button><button class="icon-button" data-action="mute" aria-label="Выключить звук">◖</button><button class="icon-button" data-action="settings" aria-label="Настройки">⚙</button></div></header>
        <div class="menu-content">
          <div class="hero-copy">
            <div class="eyebrow"><i></i> ROGUELITE // DEEP SPACE</div>
            <h1>NEON<br><span>VOID</span></h1>
            <p class="hero-subtitle">Пустота бесконечна.<br>Твоя сборка — тоже.</p>
            <div class="difficulty-select"><button data-difficulty="veteran">ВЕТЕРАН</button><button data-difficulty="hardcore">ХАРДКОР</button></div>
            <p id="difficulty-description" class="difficulty-description"></p>
            <div class="hero-actions"><button class="primary-button" data-action="start"><span>НАЧАТЬ ЗАБЕГ</span><b>↗</b></button><button class="secondary-button" data-action="hangar">АНГАР <span>→</span></button></div>
            <div class="menu-records"><div><span>ЛУЧШИЙ СЧЁТ</span><strong id="menu-best">0</strong></div><div><span>МАКС. ВОЛНА</span><strong id="menu-wave">0</strong></div><div><span>ЗАБЕГОВ</span><strong id="menu-runs">0</strong></div></div>
          </div>
          <div class="hero-visual" aria-hidden="true"><div class="orbit orbit-a"></div><div class="orbit orbit-b"></div><div class="ship-halo"></div><img src="${assetUrl('/assets/ships/interceptor.png')}" alt=""><span class="ship-label">NV–01 // ИСТРЕБИТЕЛЬ</span><div class="vertical-label">DEEP SPACE COMBAT SYSTEM</div></div>
        </div>
        <footer class="menu-footer"><span>40+ УЛУЧШЕНИЙ</span><i></i><span>БЕСКОНЕЧНАЯ ПРОКАЧКА</span><i></i><span>WEBGL 2.0</span><div class="control-hint"><b>ЛКМ</b> BLASTER <b>ПКМ</b> РАКЕТЫ <b>МЫШЬ</b> ДВИЖЕНИЕ</div></footer>
      </section>

      <section class="screen hangar-screen" data-screen="hangar">
        <header class="panel-nav"><button class="back-button" data-action="menu">← НАЗАД</button><div><span>ПОСТОЯННАЯ МОДЕРНИЗАЦИЯ</span><h2>АНГАР</h2></div><span class="currency large">◆ <b id="hangar-cores">0</b></span></header>
        <div class="hangar-layout"><aside class="hangar-ship"><div id="selected-ship-frame" class="hangar-ship-image"><img id="selected-ship-image" src="${assetUrl('/assets/ships/interceptor.png')}" alt="Выбранный корабль"></div><h3 id="selected-ship-name">NV–01 // INTERCEPTOR</h3><p id="selected-ship-description"></p><div id="ship-grid" class="ship-grid"></div><div id="hangar-stats" class="hangar-stats"></div><div id="hangar-mastery" class="hangar-mastery"></div><button class="primary-button compact" data-action="start">В БОЙ <b>↗</b></button></aside><main class="meta-main"><div class="section-heading"><div><span>КОРАБЕЛЬНЫЕ СИСТЕМЫ</span><h3>Модули корабля</h3></div><span>12 МОДУЛЕЙ · ∞ УРОВНЕЙ</span></div><div id="meta-grid" class="meta-grid"></div></main></div>
      </section>

      <section class="screen loadout-screen" data-screen="loadout">
        <header class="panel-nav"><button class="back-button" data-action="menu">← НАЗАД</button><div><span>ПОДГОТОВКА К МИССИИ</span><h2>КОМПЛЕКТАЦИЯ</h2></div><span class="currency large">◆ <b id="loadout-cores">0</b></span></header>
        <div class="loadout-layout">
          <aside class="loadout-visual"><div id="loadout-ship-frame" class="loadout-ship-image"><img id="loadout-ship-image" src="${assetUrl('/assets/ships/interceptor.png')}" alt="Выбранный корабль"></div><h2 id="loadout-ship-name">NV–01 // INTERCEPTOR</h2><p id="loadout-ship-description"></p><div id="loadout-stats" class="loadout-stats"></div></aside>
          <main class="loadout-options">
            <section class="loadout-section"><h3>КОРАБЛЬ</h3><div id="loadout-ship-grid" class="loadout-ship-grid"></div></section>
            <section class="loadout-section"><h3>ОСНОВНОЕ ОРУЖИЕ</h3><div class="loadout-choice-row">${WEAPON_LIST.map((weapon) => `<button data-weapon="${weapon.id}"><i>${icon(weapon.id, weapon.icon)}</i>${weapon.shortName}</button>`).join('')}</div><p id="loadout-weapon-description"></p></section>
            <section class="loadout-section"><h3>АКТИВНАЯ СПОСОБНОСТЬ</h3><div class="loadout-choice-row">${ABILITY_LIST.map((ability) => `<button data-ability="${ability.id}"><i>${icon(ability.id, ability.icon)}</i>${ability.shortName}</button>`).join('')}</div><p id="loadout-ability-description"></p></section>
            <section class="loadout-section"><h3>МОДУЛЬ МАСТЕРСТВА</h3><div id="loadout-mastery" class="loadout-mastery"></div></section>
            <div class="loadout-small-options"><section class="loadout-section"><h3>СЛОЖНОСТЬ</h3><div class="loadout-choice-row compact"><button data-difficulty="veteran">ВЕТЕРАН</button><button data-difficulty="hardcore">ХАРДКОР</button></div></section><section class="loadout-section"><h3>РЕЖИМ</h3><div class="loadout-choice-row compact">${RUN_MODE_LIST.map((mode) => `<button data-mode="${mode.id}">${mode.name}</button>`).join('')}</div><p id="loadout-mode-description"></p></section></div>
            <div class="loadout-actions"><button class="primary-button loadout-start" data-action="start-run"><span>НАЧАТЬ МИССИЮ</span><b>↗</b></button><button class="secondary-button training-button" data-action="start-training"><span>ПОЛИГОН · 45 С</span><small>БЕЗ НАГРАД</small></button></div>
          </main>
        </div>
      </section>

      <div id="hud" class="hud">
        <div class="hud-left"><div class="pilot-tag"><span>NV–01</span><b>LVL <i id="hud-level">1</i></b></div><div class="stat-bar hull"><label>КОРПУС <span id="hull-text"></span></label><div><i id="hull-fill"></i></div></div><div class="stat-bar shield"><label>ЩИТ <span id="shield-text"></span></label><div><i id="shield-fill"></i></div></div></div>
        <div class="hud-center"><span id="hud-wave">ВОЛНА 1</span><small id="hud-sector">ОТКРЫТЫЙ КОСМОС</small><div id="boss-bar" class="boss-bar"><label><span id="boss-name"></span><b id="boss-hp"></b></label><div><i id="boss-fill"></i></div></div></div>
        <div class="hud-right"><div><span>СЧЁТ</span><strong id="hud-score">0</strong></div><span class="currency">◆ <b id="hud-cores">0</b></span><button class="icon-button pause-button" data-action="pause" aria-label="Пауза">Ⅱ</button></div>
        <div class="hud-bottom-left"><div class="xp-label"><span>СИНХРОНИЗАЦИЯ</span><b id="hud-xp"></b></div><div class="xp-track"><i id="xp-fill"></i></div></div>
        <div class="weapon-dock"><div class="weapon-slot"><kbd>ЛКМ</kbd><div><strong id="primary-weapon-name">PULSE</strong><span id="primary-weapon-subtitle">ОСНОВНОЕ ОРУЖИЕ</span></div><span id="weapon-heat" class="weapon-heat"><i id="weapon-heat-fill"></i></span><i class="weapon-ready"></i></div><div class="weapon-slot missile"><div class="cooldown-shade" id="missile-cooldown"></div><kbd>ПКМ</kbd><div><strong>РАКЕТЫ</strong><span id="missile-status">ГОТОВО</span></div><b>▲</b></div><div class="weapon-slot ability-weapon"><div class="cooldown-shade" id="ability-cooldown"></div><kbd>Q</kbd><div><strong id="ability-name">DASH</strong><span id="ability-status">Q · ГОТОВО</span></div><b>✦</b></div></div>
        <div class="hud-combo"><span>СЕРИЯ</span><strong id="hud-combo">×1.0</strong></div>
        <div id="overdrive" class="overdrive">ПЕРЕГРУЗКА <b id="overdrive-time"></b></div>
        <div id="debug-stats" class="debug-stats"></div>
        <div id="training-hud" class="training-hud"><span>ПОЛИГОН · <b id="training-time">45 С</b></span><strong id="training-dps">0</strong><small>FACT DPS</small><div><span>ОСНОВНОЙ <b id="training-primary-dps">0</b></span><span>РАКЕТЫ <b id="training-missile-dps">0</b></span></div></div>
        <div id="tutorial-hint" class="tutorial-hint"><span id="tutorial-text"></span><button data-action="skip-tutorial" aria-label="Пропустить обучение">×</button></div>
      </div>

      <div id="announcement" class="announcement"><strong></strong><span></span></div>

      <div id="levelup-overlay" class="overlay levelup-overlay"><div class="levelup-heading"><span>НЕЙРОСЕТЬ СИНХРОНИЗИРОВАНА</span><h2>ВЫБЕРИ УЛУЧШЕНИЕ <b>/ <i id="level-number">2</i></b></h2><p>Бой приостановлен. Сборка сгорает после потери корабля.</p></div><div id="upgrade-cards" class="upgrade-cards"></div><div class="levelup-tools"><button id="reroll-button" class="secondary-button" data-action="reroll">↻ ОБНОВИТЬ <span id="reroll-count">1</span></button><span id="upgrade-lock" class="upgrade-lock">ЗАЩИТА ОТ СЛУЧАЙНОГО КЛИКА · 2.0 С</span><span>Исключений доступно: <b id="banish-count">1</b></span></div></div>

      <div id="route-overlay" class="overlay levelup-overlay route-overlay"><div class="levelup-heading"><span>СЕКТОР ЗАЧИЩЕН · НАВИГАЦИЯ</span><h2>ВЫБЕРИ МАРШРУТ</h2><p>Выбранный модификатор действует следующие пять волн. Награда соответствует риску.</p></div><div id="route-cards" class="upgrade-cards"></div><div class="route-hint">Клавиши 1–3 также выбирают маршрут</div></div>

      <div id="pause-overlay" class="overlay pause-overlay"><div class="dialog pause-dialog"><span class="dialog-eyebrow">СИМУЛЯЦИЯ ПРИОСТАНОВЛЕНА</span><h2>ПАУЗА</h2><div class="pause-analytics"><div><span>ОСНОВНОЙ DPS</span><b id="pause-primary-dps">0</b></div><div><span>РАКЕТЫ / С</span><b id="pause-missile-dps">0</b></div><div><span>КРИТ / МНОЖИТЕЛЬ</span><b id="pause-crit">0</b></div><div><span>ПРОБИТИЕ / ЦЕПИ</span><b id="pause-links">0</b></div><div><span>ДРОНЫ</span><b id="pause-drones">0</b></div><div><span>КОРПУС / ЩИТ / БРОНЯ</span><b id="pause-defense">0</b></div></div><div class="pause-build-caption">СБОРКА ЗАБЕГА</div><div id="pause-build-list" class="pause-build-list"></div><button class="primary-button" data-action="resume">ПРОДОЛЖИТЬ <b>→</b></button><button class="secondary-button" data-action="settings">НАСТРОЙКИ</button><button class="secondary-button danger" data-action="menu">ЗАВЕРШИТЬ ЗАБЕГ</button><p>ESC / P — продолжить · M — звук</p></div></div>

      <section class="screen gameover-screen" data-screen="gameover"><div class="gameover-panel">
        <span id="result-eyebrow" class="dialog-eyebrow">NV–01 // ЖУРНАЛ ЗАБЕГА</span>
        <div class="result-top"><div><h2 id="result-title">ЗАБЕГ<br><span>ЗАВЕРШЁН</span></h2><div class="result-score"><span>ИТОГОВЫЙ СЧЁТ</span><strong id="result-score">0</strong><b id="result-difficulty"></b></div></div><div id="result-ship-frame" class="result-ship"><img id="result-ship-image" src="${assetUrl('/assets/ships/interceptor.png')}" alt="Корабль забега"><strong id="result-ship-name"></strong><span id="result-loadout"></span></div></div>
        <div class="result-grid"><div><span>ВОЛНА</span><b id="result-wave"></b></div><div><span>УНИЧТОЖЕНО</span><b id="result-kills"></b></div><div><span>ВРЕМЯ</span><b id="result-time"></b></div><div><span>УРОВЕНЬ</span><b id="result-level"></b></div></div>
        <div class="cores-earned"><span id="result-cores-label">ЯДРА СОХРАНЕНЫ</span><strong id="result-cores">+0</strong></div>
        <div class="result-analysis"><section class="result-panel"><h3>УРОН ПО ИСТОЧНИКАМ</h3><div id="result-damage"></div><div id="result-synergy" class="result-synergy"></div></section><section class="result-panel"><h3>ИТОГ ЗАБЕГА</h3><div id="result-death" class="result-death"></div><div id="result-mastery" class="result-mastery"></div></section></div>
        <div class="result-build"><span>СБОРКА ЗАБЕГА</span><div id="result-build"></div></div>
        <section class="result-panel result-history-panel"><h3>ХРОНОЛОГИЯ УЛУЧШЕНИЙ</h3><div id="result-history" class="result-history"></div></section>
        <div class="gameover-actions"><button class="primary-button" data-action="restart">ЕЩЁ ОДИН ЗАБЕГ <b>↗</b></button><button class="secondary-button" data-action="hangar">В АНГАР</button><button class="text-button" data-action="menu">ГЛАВНОЕ МЕНЮ</button></div>
      </div></section>

      <div id="challenges-modal" class="overlay settings-modal"><div class="dialog settings-dialog challenges-dialog"><div class="settings-heading"><div><span class="dialog-eyebrow">РЕЖИМЫ // РЕКОРДЫ // ДОСТИЖЕНИЯ</span><h2>ИСПЫТАНИЯ</h2></div><button class="icon-button" data-action="close-challenges" aria-label="Закрыть">×</button></div><div id="mode-grid" class="mode-grid"></div><div class="challenge-columns"><section><h3>ЛОКАЛЬНЫЕ РЕКОРДЫ</h3><div id="records-list" class="records-list"></div><div id="platform-records" class="online-records"></div></section><section><h3>ДОСТИЖЕНИЯ</h3><div id="achievements-list" class="achievements-list"></div></section></div></div></div>

      <div id="codex-modal" class="overlay settings-modal"><div class="dialog settings-dialog challenges-dialog codex-dialog"><div class="settings-heading"><div><span class="dialog-eyebrow">АРХИВ СИНЕРГИЙ · <b id="codex-count">0 / 6</b></span><h2>КОДЕКС ЭВОЛЮЦИЙ</h2></div><button class="icon-button" data-action="close-codex" aria-label="Закрыть кодекс">×</button></div><div id="codex-grid" class="codex-grid"></div></div></div>

      <div id="settings-modal" class="overlay settings-modal"><div class="dialog settings-dialog"><div class="settings-heading"><div><span class="dialog-eyebrow">СИСТЕМНАЯ КОНФИГУРАЦИЯ</span><h2>НАСТРОЙКИ</h2></div><button class="icon-button" data-action="close-settings" aria-label="Закрыть">×</button></div><label class="range-setting"><span>ОБЩАЯ ГРОМКОСТЬ</span><input type="range" min="0" max="1" step="0.05" data-setting="masterVolume"></label><label class="range-setting"><span>МУЗЫКА</span><input type="range" min="0" max="1" step="0.05" data-setting="musicVolume"></label><label class="range-setting"><span>ЭФФЕКТЫ</span><input type="range" min="0" max="1" step="0.05" data-setting="sfxVolume"></label><label class="range-setting"><span>ИНТЕНСИВНОСТЬ ЧАСТИЦ</span><input type="range" min="0" max="1" step="0.05" data-setting="particles"></label><label class="select-setting"><span>КАЧЕСТВО ЭФФЕКТОВ</span><select data-setting="quality"><option value="auto">Авто (рекомендуется)</option><option value="high">Высокое</option><option value="medium">Среднее</option><option value="low">Низкое</option></select></label><label class="toggle-setting"><span>ТРЯСКА КАМЕРЫ<small>Отзывчивость взрывов и попаданий</small></span><input type="checkbox" data-setting="screenShake"><i></i></label><label class="toggle-setting"><span>ЧИСЛА УРОНА<small>Можно отключить для чистоты экрана</small></span><input type="checkbox" data-setting="damageNumbers"><i></i></label><div class="controls-help"><span>УПРАВЛЕНИЕ</span><p><b>Мышь / WASD</b> движение · <b>ЛКМ / Space</b> blaster</p><p><b>ПКМ / Shift / R</b> ракеты · <b>Esc / P</b> пауза · <b>F3</b> FPS</p></div><button class="secondary-button fullscreen-button" data-action="fullscreen">ПОЛНЫЙ ЭКРАН</button><button class="text-button reset-button" data-action="reset">Сбросить прогресс</button><a class="credits" href="https://kenney.nl/assets/space-shooter-redux" target="_blank" rel="noreferrer">Графика и сэмплы: Kenney · CC0</a></div></div>
    `;
  }
}
