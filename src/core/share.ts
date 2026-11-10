import type { Game } from '../game/Game';
import type { AbilityId } from '../game/config/abilities';
import type { ShipAugmentId } from '../game/config/mastery';
import type { ShipId } from '../game/config/ships';
import type { WeaponId } from '../game/config/weapons';
import { ABILITIES } from '../game/config/abilities';
import { augmentById } from '../game/config/mastery';
import { SHIPS } from '../game/config/ships';
import { UPGRADE_MAP } from '../game/config/upgrades';
import { WEAPONS } from '../game/config/weapons';

export interface SharedBuild {
  v: 1;
  ship: ShipId;
  weapon: WeaponId;
  ability: AbilityId;
  augment: ShipAugmentId | null;
  cards: Array<readonly [string, number]>;
}

export function getShareBuild(game: Game): string {
  const build: SharedBuild = {
    v: 1,
    ship: game.ship,
    weapon: game.weapon,
    ability: game.ability,
    augment: game.save.data.selectedAugments[game.ship] ?? null,
    cards: game.getBuild().map(({ definition, rank }) => [definition.id, rank]),
  };
  return btoa(JSON.stringify(build)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodeBuild(input: string): SharedBuild {
  try {
    const code = input.trim();
    if (code.length === 0 || code.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(code)) throw new Error('invalid');
    const normalized = code.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
    const data: unknown = JSON.parse(decoded);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid');
    const build = data as Record<string, unknown>;
    if (build.v !== 1 || Object.keys(build).some(key => !['v', 'ship', 'weapon', 'ability', 'augment', 'cards'].includes(key))) throw new Error('invalid');
    if (typeof build.ship !== 'string' || !Object.prototype.hasOwnProperty.call(SHIPS, build.ship)) throw new Error('invalid');
    if (typeof build.weapon !== 'string' || !Object.prototype.hasOwnProperty.call(WEAPONS, build.weapon)) throw new Error('invalid');
    if (typeof build.ability !== 'string' || !Object.prototype.hasOwnProperty.call(ABILITIES, build.ability)) throw new Error('invalid');
    let augment: ShipAugmentId | null = null;
    if (build.augment !== null && build.augment !== undefined) {
      if (typeof build.augment !== 'string') throw new Error('invalid');
      const definition = augmentById(build.augment as ShipAugmentId);
      if (!definition || definition.ship !== build.ship) throw new Error('invalid');
      augment = definition.id;
    }
    if (!Array.isArray(build.cards) || build.cards.length > UPGRADE_MAP.size) throw new Error('invalid');
    const ranks = new Map<string, number>();
    for (const card of build.cards) {
      if (!Array.isArray(card) || card.length !== 2 || typeof card[0] !== 'string' || !Number.isInteger(card[1])) throw new Error('invalid');
      const [id, rank] = card as [string, number];
      const definition = UPGRADE_MAP.get(id);
      if (!definition || rank < 1 || (Number.isFinite(definition.max) ? rank > definition.max : rank > 100) || ranks.has(id)) throw new Error('invalid');
      ranks.set(id, rank);
    }
    for (const id of ranks.keys()) {
      const definition = UPGRADE_MAP.get(id)!;
      if (definition.conflicts?.some(conflict => ranks.has(conflict))) throw new Error('invalid');
      for (const [required, requiredRank] of Object.entries(definition.requires ?? {})) {
        if ((ranks.get(required) ?? 0) < requiredRank) throw new Error('invalid');
      }
    }
    return { v: 1, ship: build.ship as ShipId, weapon: build.weapon as WeaponId, ability: build.ability as AbilityId, augment, cards: [...ranks.entries()] };
  } catch {
    throw new Error('Некорректный код сборки');
  }
}
