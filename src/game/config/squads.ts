import { ELITE_AFFIX } from './affixes';
import type { EnemyKind } from '../types';

export interface SquadMember {
  kind: EnemyKind;
  dx: number;
  dy: number;
  elite?: boolean;
  affixes?: number;
}

export interface SquadDefinition {
  id: 'pack' | 'bulwark' | 'pincer';
  name: string;
  hint: string;
  leaderKind: EnemyKind;
  leaderAffixes: number;
  members: readonly SquadMember[];
}

export const SQUAD_LIST: readonly SquadDefinition[] = [
  {
    id: 'pack', name: 'РОЙ', hint: 'Носитель поддерживает строй регенерацией',
    leaderKind: 'carrier', leaderAffixes: ELITE_AFFIX.regeneration,
    members: [
      { kind: 'scout', dx: -130, dy: 30, affixes: ELITE_AFFIX.formation },
      { kind: 'scout', dx: -65, dy: 0, affixes: ELITE_AFFIX.formation },
      { kind: 'scout', dx: 65, dy: 0, affixes: ELITE_AFFIX.formation },
      { kind: 'scout', dx: 130, dy: 30, affixes: ELITE_AFFIX.formation },
    ],
  },
  {
    id: 'bulwark', name: 'БАСТИОН', hint: 'Танк держит щит, снайперы бьют с флангов',
    leaderKind: 'tank', leaderAffixes: ELITE_AFFIX.formation,
    members: [
      { kind: 'sniper', dx: -190, dy: -50, elite: true, affixes: ELITE_AFFIX.splitShot },
      { kind: 'sniper', dx: 190, dy: -50, elite: true, affixes: ELITE_AFFIX.splitShot },
      { kind: 'scout', dx: -80, dy: 70 },
      { kind: 'scout', dx: 80, dy: 70 },
    ],
  },
  {
    id: 'pincer', name: 'КЛЕЩИ', hint: 'Камикадзе давит в центр, перехватчики охватывают фланги',
    leaderKind: 'kamikaze', leaderAffixes: ELITE_AFFIX.teleport,
    members: [
      { kind: 'weaver', dx: -230, dy: -90, elite: true, affixes: ELITE_AFFIX.splitShot },
      { kind: 'weaver', dx: 230, dy: -90, elite: true, affixes: ELITE_AFFIX.splitShot },
      { kind: 'scout', dx: -120, dy: 70 },
      { kind: 'scout', dx: 120, dy: 70 },
    ],
  },
];
