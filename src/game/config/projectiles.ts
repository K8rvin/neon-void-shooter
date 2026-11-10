import type { BulletKind, BulletOwner, RunStats } from '../types';

export type EvolutionSkin = 'ionLance' | 'novaArray' | 'stormProtocol' | 'aegis' | 'phantomDrones' | 'rocketSwarm';

export function evolutionSkin(stats: RunStats, owner: BulletOwner, kind: BulletKind): EvolutionSkin | undefined {
  if (owner === 'enemy') return undefined;
  if (kind === 'missile' && stats.rocketSwarm > 0) return 'rocketSwarm';
  if (owner === 'drone' && stats.phantomDrones > 0) return 'phantomDrones';
  if (stats.ionLance > 0) return 'ionLance';
  if (stats.stormProtocol > 0) return 'stormProtocol';
  if (stats.novaArray > 0) return 'novaArray';
  if (stats.aegis > 0) return 'aegis';
  if (stats.phantomDrones > 0) return 'phantomDrones';
  return undefined;
}
