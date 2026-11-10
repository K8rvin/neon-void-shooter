export const SPECIAL_WAVE_IDS = ['sanctuary', 'movingCover', 'crossfire'] as const;
export type SpecialWaveId = typeof SPECIAL_WAVE_IDS[number];

export const SPECIAL_WAVE_INFO: Record<SpecialWaveId, { name: string; hint: string }> = {
  sanctuary: { name: 'ЗОНА СТАБИЛЬНОСТИ', hint: 'Удерживайте область 5 секунд · входящий урон −35%' },
  movingCover: { name: 'ДВИЖУЩИЕСЯ УКРЫТИЯ', hint: 'Астероиды уничтожают вражеские снаряды, но не ваши' },
  crossfire: { name: 'ПЕРЕКРЁСТНЫЙ ОГОНЬ', hint: 'Больше связок · ваш урон +25% · награда +50%' },
};
