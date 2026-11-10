export const ELITE_AFFIX = {
  regeneration: 1,
  formation: 2,
  teleport: 4,
  splitShot: 8,
} as const;

export const ELITE_AFFIX_LIST = [
  { flag: ELITE_AFFIX.regeneration, color: 0x72ffb0 },
  { flag: ELITE_AFFIX.formation, color: 0x79cfff },
  { flag: ELITE_AFFIX.teleport, color: 0xc9a1ff },
  { flag: ELITE_AFFIX.splitShot, color: 0xffbf69 },
] as const;
