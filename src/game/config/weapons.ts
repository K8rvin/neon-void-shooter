import type { RunStats } from '../types';

export type WeaponId = 'pulse' | 'scatter' | 'beam' | 'arc';

export interface WeaponDefinition {
  id: WeaponId;
  name: string;
  shortName: string;
  description: string;
  menuDescription: string;
  icon: string;
  color: number;
  life: number;
  apply: (stats: RunStats) => void;
}

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  pulse: {
    id: 'pulse', name: 'PULSE // ИМПУЛЬС', shortName: 'PULSE', description: 'Сбалансированный blaster', menuDescription: 'Точные очереди · средняя дальность · без особенностей', icon: '↟', color: 0x67ddff, life: 4,
    apply: () => undefined,
  },
  scatter: {
    id: 'scatter', name: 'SCATTER // РОССЫПЬ', shortName: 'SCATTER', description: 'Мощный залп вблизи', menuDescription: '6 снарядов в залпе · высокий урон · короткая дальность и медленный темп', icon: '⋔', color: 0xffc568, life: 0.52,
    apply: (stats) => {
      stats.damage *= 2.1;
      stats.fireRate *= 0.48;
      stats.projectileCount += 5;
      stats.spread = Math.max(stats.spread, 0.09);
      stats.projectileSpeed *= 0.85;
      stats.projectileSize *= 1.12;
    },
  },
  beam: {
    id: 'beam', name: 'BEAM // ЛУЧ', shortName: 'BEAM', description: 'Непрерывный луч с нагревом', menuDescription: 'Пробивает все цели на линии · нагрев усиливает урон · перегрев блокирует огонь', icon: '┃', color: 0x79ffff, life: 0,
    apply: () => undefined,
  },
  arc: {
    id: 'arc', name: 'ARC // РАЗРЯД', shortName: 'ARC', description: 'Цепи молний вместо урона', menuDescription: '+2 цепи молнии · сильнее разряды · −28% к прямому урону', icon: 'ϟ', color: 0xb88cff, life: 4,
    apply: (stats) => {
      stats.damage *= 0.72;
      stats.fireRate *= 1.15;
      stats.chain += 2;
      stats.chainDamage += 0.25;
      stats.projectileSpeed *= 1.05;
    },
  },
};

export const WEAPON_LIST = Object.values(WEAPONS);
