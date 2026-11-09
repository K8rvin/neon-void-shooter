import type { Rarity, RunStats, UpgradeDefinition } from '../types';

function upgrade(
  id: string,
  name: string,
  description: string,
  icon: string,
  rarity: Rarity,
  max: number,
  apply: (stats: RunStats, player: Parameters<UpgradeDefinition['apply']>[1]) => void,
  requires?: Record<string, number>,
  conflicts?: string[],
): UpgradeDefinition {
  return { id, name, description, icon, rarity, max, apply, requires, conflicts };
}

export const UPGRADES: UpgradeDefinition[] = [
  upgrade('damage', 'Фокусировка луча', '+25% к урону blaster', '✦', 'common', 8, (s) => { s.damage *= 1.25; }),
  upgrade('rapid', 'Быстрый цикл', '+18% к скорострельности', '≋', 'common', 8, (s) => { s.fireRate *= 1.18; }),
  upgrade('multishot', 'Разделённый поток', '+1 снаряд в залпе', '⋔', 'rare', 4, (s) => { s.projectileCount += 1; s.spread += 0.012; }),
  upgrade('pierce', 'Фазовый пробой', '+1 пробитие и +10% к урону', '↟', 'rare', 4, (s) => { s.pierce += 1; s.damage *= 1.1; }),
  upgrade('velocity', 'Ускорительные катушки', '+22% к скорости и +8% к размеру снаряда', '⇈', 'common', 4, (s) => { s.projectileSpeed *= 1.22; s.projectileSize *= 1.08; }),
  upgrade('critical', 'Уязвимые точки', '+8% к шансу критического удара', '⌖', 'common', 5, (s) => { s.critChance = Math.min(0.9, s.critChance + 0.08); }),
  upgrade('criticalDamage', 'Разрушительный резонанс', '+60% к множителю критического удара', '✧', 'rare', 4, (s) => { s.critMultiplier += 0.6; }),
  upgrade('ricochet', 'Зеркальный протокол', 'Снаряд рикошетит в новую цель ещё 1 раз', '⌁', 'epic', 3, (s) => { s.ricochet += 1; }),
  upgrade('chain', 'Дуговой разряд', 'Попадание создаёт +1 цепь молнии', 'ϟ', 'epic', 3, (s) => { s.chain += 1; s.chainDamage += 0.08; }),
  upgrade('shrapnel', 'Осколочный импульс', 'Уничтоженный враг выпускает +3 осколка', '✣', 'rare', 4, (s) => { s.shrapnel += 3; }),
  upgrade('heavy', 'Тяжёлые заряды', '+45% к урону, −6% к скорострельности', '◆', 'rare', 4, (s) => { s.damage *= 1.45; s.fireRate *= 0.94; }),
  upgrade('overclock', 'Красная линия', '+35% к темпу, −6% к урону', '≫', 'rare', 4, (s) => { s.fireRate *= 1.35; s.damage *= 0.94; }),
  upgrade('execute', 'Протокол добивания', '+8% к порогу двойного урона по ослабленным', '⌄', 'epic', 4, (s) => { s.execute += 0.08; }),
  upgrade('hull', 'Ремонтный каркас', '+25 к максимуму корпуса и столько же лечения', '⬡', 'common', 6, (s, p) => { s.maxHp += 25; p.hp = Math.min(s.maxHp, p.hp + 25); }),
  upgrade('armor', 'Керамическая броня', '+2 к броне, уменьшающей каждый удар', '▰', 'common', 6, (s) => { s.armor += 2; }),
  upgrade('regen', 'Нанитный рой', '+0,8 к восстановлению корпуса/с', '✚', 'rare', 5, (s) => { s.regen += 0.8; }),
  upgrade('shield', 'Дефлекторный щит', '+35 к щиту и +1 к его восстановлению', '◉', 'rare', 4, (s, p) => { s.maxShield += 35; s.shieldRegen += 1; p.shield += 35; }),
  upgrade('shieldRegen', 'Потоковый стабилизатор', '+3 к восстановлению щита/с', '◎', 'common', 5, (s) => { s.shieldRegen += 3; }),
  upgrade('mobility', 'Векторная тяга', '+12% к скорости перемещения WASD', '»', 'common', 4, (s) => { s.moveSpeed *= 1.12; }),
  upgrade('magnet', 'Тракторный луч', '+45% к радиусу притяжения предметов', '◌', 'common', 5, (s) => { s.magnet *= 1.45; }),
  upgrade('xp', 'Нейроархив', '+20% к получаемому опыту', '⌬', 'common', 5, (s) => { s.xpGain *= 1.2; }),
  upgrade('luck', 'Аномальная удача', '+8 к удаче: выше шанс редких карт', '◇', 'rare', 5, (s) => { s.luck += 8; }),
  upgrade('scavenger', 'Сборщик пустоты', '+25% к ядрам и +3 к удаче', '⬙', 'rare', 5, (s) => { s.coreGain *= 1.25; s.luck += 3; }),
  upgrade('lifeSteal', 'Энергетический вампиризм', '0,75% нанесённого урона лечит корпус', '⊕', 'epic', 4, (s) => { s.lifeSteal += 0.0075; }),
  upgrade('drones', 'Боевой спутник', '+1 автономный огневой дрон', '◈', 'epic', 3, (s) => { s.drones += 1; }),
  upgrade('droneDamage', 'Синхронизация дронов', '+35% к урону и +12% к темпу дронов', '⌘', 'rare', 5, (s) => { s.droneDamage *= 1.35; s.droneFireRate *= 1.12; }),
  upgrade('missiles', 'Ракетный блок', '+1 самонаводящаяся ракета в залпе', '▲', 'rare', 3, (s) => { s.missileCount += 1; }),
  upgrade('warheads', 'Антивещественный заряд', '+40% к урону ракет', '△', 'common', 5, (s) => { s.missileDamage *= 1.4; }),
  upgrade('reload', 'Автоподзарядник', '−16% к перезарядке ракет', '↻', 'common', 5, (s) => { s.missileCooldown *= 0.84; }),
  upgrade('blast', 'Взрывная волна', '+28% к радиусу взрыва', '◯', 'rare', 4, (s) => { s.blastRadius *= 1.28; }),
  upgrade('cluster', 'Кассетный боеприпас', '+2 осколка после взрыва ракеты', '✣', 'epic', 3, (s) => { s.missileCluster += 2; }),
  upgrade('burn', 'Плазменный след', 'Попадания поджигают: +35% урона/с на 3 с', '♨', 'rare', 4, (s) => { s.burn += 0.35; }),
  upgrade('cryo', 'Криогенный контур', 'Попадания замедляют врагов ещё на 15%', '❄', 'rare', 3, (s) => { s.cryo += 0.15; }),
  upgrade('retaliation', 'Нова при пробое', 'Получение урона создаёт разрушительную нову', '⊛', 'epic', 3, (s) => { s.retaliation += 1; }),
  upgrade('invulnerability', 'Аварийный фазовый сдвиг', '+0,18 с неуязвимости после попадания', '◍', 'rare', 4, (s) => { s.invulnerability += 0.18; }),
  upgrade('combo', 'Охотничий азарт', '+1,2 с до потери серии убийств', '∞', 'common', 4, (s) => { s.comboDuration += 1.2; }),
  upgrade('bulletTime', 'Тактический прогноз', 'Вражеские снаряды на 10% медленнее', '◷', 'epic', 4, (s) => { s.enemyBulletSlow *= 0.9; }),
  upgrade('revive', 'Чёрный ящик', 'Один раз воскрешает с 50% корпуса и новой', '↟', 'legendary', 1, (s, p) => { s.revives += 1; p.revives += 1; }),

  upgrade('ionLance', 'ЭВОЛЮЦИЯ: Ионное копьё', 'Крупные снаряды пробивают +3 цели и наносят +75% урона', '↟', 'legendary', 1, (s) => { s.ionLance = 1; s.damage *= 1.75; s.pierce += 3; s.projectileSize *= 1.45; }, { damage: 3, pierce: 3 }),
  upgrade('novaArray', 'ЭВОЛЮЦИЯ: Решётка Нова', 'Дополнительные 2 потока покрывают сектор; темп огня +25%', '⋔', 'legendary', 1, (s) => { s.novaArray = 1; s.projectileCount += 2; s.fireRate *= 1.25; }, { multishot: 3, rapid: 3 }),
  upgrade('stormProtocol', 'ЭВОЛЮЦИЯ: Грозовой разум', 'Криты создают двойной разряд; молния получает +2 цепи', 'ϟ', 'legendary', 1, (s) => { s.stormProtocol = 1; s.chain += 2; s.critChance += 0.1; }, { chain: 2, critical: 3 }),
  upgrade('aegis', 'ЭВОЛЮЦИЯ: Эгида Прайм', '+50 щита; его разрушение испускает защитную нову', '◉', 'legendary', 1, (s, p) => { s.aegis = 1; s.maxShield += 50; p.shield += 50; }, { shield: 2, shieldRegen: 2 }),
  upgrade('phantomDrones', 'ЭВОЛЮЦИЯ: Фантомный рой', 'Призывает +2 автономных дрона и ускоряет их огонь на 50%', '◈', 'legendary', 1, (s) => { s.phantomDrones = 1; s.drones += 2; s.droneFireRate *= 1.5; }, { drones: 2, droneDamage: 2 }),
  upgrade('rocketSwarm', 'ЭВОЛЮЦИЯ: Рой ракет', '+2 ракеты; взрывы выпускают +2 осколка и на 30% шире', '▲', 'legendary', 1, (s) => { s.rocketSwarm = 1; s.missileCount += 2; s.missileCluster += 2; s.blastRadius *= 1.3; }, { missiles: 2, warheads: 2 }),
];

export const FALLBACK_UPGRADES: UpgradeDefinition[] = [
  upgrade('surgeDamage', 'Бесконечная перегрузка', '+8% ко всему урону blaster', '✦', 'common', Number.POSITIVE_INFINITY, (s) => { s.damage *= 1.08; }),
  upgrade('surgeHull', 'Бесконечный каркас', '+8 к корпусу и полное лечение на 8', '⬡', 'common', Number.POSITIVE_INFINITY, (s, p) => { s.maxHp += 8; p.hp = Math.min(s.maxHp, p.hp + 8); }),
  upgrade('surgeRockets', 'Бесконечный арсенал', '+10% к урону ракет', '▲', 'common', Number.POSITIVE_INFINITY, (s) => { s.missileDamage *= 1.1; }),
  upgrade('surgeCycle', 'Бесконечный цикл', '+5% к скорострельности', '≋', 'common', Number.POSITIVE_INFINITY, (s) => { s.fireRate *= 1.05; }),
];

export const EVOLUTIONS = UPGRADES.filter((item) => item.requires);

export const UPGRADE_MAP = new Map([...UPGRADES, ...FALLBACK_UPGRADES].map((item) => [item.id, item]));

export const RARITY_LABELS: Record<Rarity, string> = {
  common: 'СТАНДАРТ',
  rare: 'РЕДКИЙ',
  epic: 'ЭПИЧЕСКИЙ',
  legendary: 'ЛЕГЕНДАРНЫЙ',
};
