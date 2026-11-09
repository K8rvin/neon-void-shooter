export type AbilityId = 'dash' | 'slow' | 'gravity' | 'drones' | 'purge';

export interface AbilityDefinition {
  id: AbilityId;
  name: string;
  shortName: string;
  description: string;
  icon: string;
  cooldown: number;
  duration: number;
  color: number;
}

export const ABILITIES: Record<AbilityId, AbilityDefinition> = {
  dash: { id: 'dash', name: 'ФАЗОВЫЙ РЫВОК', shortName: 'DASH', description: 'Рывок на 180 px и 1,1 с неуязвимости. Наносит урон рядом с точкой выхода.', icon: '»', cooldown: 5, duration: 1.1, color: 0x62f5ff },
  slow: { id: 'slow', name: 'СТАСИС-ПОЛЕ', shortName: 'STASIS', description: 'Вражеские снаряды движутся на 55% медленнее в течение 5 секунд.', icon: '◷', cooldown: 14, duration: 5, color: 0x91a7ff },
  gravity: { id: 'gravity', name: 'ГРАВИТАЦИОННАЯ БОМБА', shortName: 'GRAVITY', description: 'На 4 секунды создаёт колодец, стягивающий врагов, затем вызывает нову.', icon: '◎', cooldown: 12, duration: 4, color: 0xb879ff },
  drones: { id: 'drones', name: 'РОЙ ПЕРЕГРУЗКИ', shortName: 'DRONES', description: 'Дроны стреляют втрое чаще и наносят ×2 урона 6 секунд. Без дронов создаёт два временных.', icon: '◈', cooldown: 15, duration: 6, color: 0x72ffb0 },
  purge: { id: 'purge', name: 'ЧИСТКА ПРОСТРАНСТВА', shortName: 'PURGE', description: 'Удаляет все вражеские снаряды и превращает до 80 из них в опыт.', icon: '⊛', cooldown: 10, duration: 0, color: 0xffd568 },
};

export const ABILITY_LIST = Object.values(ABILITIES);
