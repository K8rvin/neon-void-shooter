import type { Enemy } from '../game/types';

export class SpatialHash {
  private readonly buckets = new Map<number, Enemy[]>();

  constructor(private readonly cellSize = 96) {}

  clear(): void {
    for (const bucket of this.buckets.values()) bucket.length = 0;
  }

  insert(enemy: Enemy): void {
    const cellX = Math.floor(enemy.x / this.cellSize);
    const cellY = Math.floor(enemy.y / this.cellSize);
    const minX = Math.floor((enemy.x - enemy.radius) / this.cellSize);
    const maxX = Math.floor((enemy.x + enemy.radius) / this.cellSize);
    const minY = Math.floor((enemy.y - enemy.radius) / this.cellSize);
    const maxY = Math.floor((enemy.y + enemy.radius) / this.cellSize);
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        const key = this.key(x, y);
        let bucket = this.buckets.get(key);
        if (!bucket) {
          bucket = [];
          this.buckets.set(key, bucket);
        }
        if (cellX === x && cellY === y) bucket.push(enemy);
      }
    }
  }

  query(x: number, y: number, radius: number, output: Enemy[]): Enemy[] {
    output.length = 0;
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minY = Math.floor((y - radius) / this.cellSize);
    const maxY = Math.floor((y + radius) / this.cellSize);
    for (let cellX = minX; cellX <= maxX; cellX += 1) {
      for (let cellY = minY; cellY <= maxY; cellY += 1) {
        const bucket = this.buckets.get(this.key(cellX, cellY));
        if (bucket) {
          for (let index = 0; index < bucket.length; index += 1) output.push(bucket[index]!);
        }
      }
    }
    return output;
  }

  private key(x: number, y: number): number {
    return (x + 128) * 2048 + y + 128;
  }
}
