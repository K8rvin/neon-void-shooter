export type RunMode = 'standard' | 'daily' | 'rockets' | 'oneHp' | 'elite';

export interface RunModeDefinition {
  id: RunMode;
  name: string;
  description: string;
  scoreMultiplier: number;
}

export const RUN_MODES: Record<RunMode, RunModeDefinition> = {
  standard: { id: 'standard', name: 'СВОБОДНЫЙ ЗАБЕГ', description: 'Обычные правила, выбранный корабль и маршруты.', scoreMultiplier: 1 },
  daily: { id: 'daily', name: 'ЕЖЕДНЕВНЫЙ СИГНАЛ', description: 'Одинаковый seed для всех игроков в текущем UTC-дне. Отдельный рекорд каждый день.', scoreMultiplier: 1.25 },
  rockets: { id: 'rockets', name: 'ТОЛЬКО РАКЕТЫ', description: 'Основное оружие отключено. Обе кнопки запускают ракеты. +2 ракеты и −35% перезарядки.', scoreMultiplier: 1.5 },
  oneHp: { id: 'oneHp', name: 'ОДИН HP', description: 'Корпус и щит равны нулю/единице. Любое незаблокированное попадание смертельно. Очки ×3.', scoreMultiplier: 3 },
  elite: { id: 'elite', name: 'СПЛОШНАЯ ЭЛИТА', description: 'Все обычные противники элитные. Очки ×2.', scoreMultiplier: 2 },
};

export const RUN_MODE_LIST = Object.values(RUN_MODES);

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { id: 'wave10', name: 'Десять секторов', description: 'Достичь 10-й волны.' },
  { id: 'wave25', name: 'За гранью', description: 'Достичь 25-й волны.' },
  { id: 'noHit', name: 'Неприкосновенность', description: 'Завершить забег на 5+ волне без единого попадания.' },
  { id: 'evolution', name: 'Абсолютная форма', description: 'Собрать хотя бы одну эволюцию оружия.' },
  { id: 'kills1000', name: 'Тысяча сигналов', description: 'Уничтожить 1000 врагов за один забег.' },
  { id: 'challenge', name: 'Испытание принято', description: 'Достичь 10-й волны в любом испытании.' },
];

export function dailySeed(date = new Date()): number {
  return Number(`${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`);
}
