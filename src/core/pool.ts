export interface PoolEntity {
  active: boolean;
}

export class EntityPool<T extends PoolEntity> {
  readonly items: T[] = [];
  private readonly free: T[] = [];

  constructor(private readonly factory: () => T) {}

  acquire(): T | undefined {
    const entity = this.free.pop();
    if (entity) {
      entity.active = true;
      this.items.push(entity);
      return entity;
    }
    return undefined;
  }

  preallocate(count: number): void {
    for (let index = 0; index < count; index += 1) {
      const entity = this.factory();
      entity.active = false;
      this.free.push(entity);
    }
  }

  releaseAt(index: number): T {
    const entity = this.items[index]!;
    entity.active = false;
    const last = this.items.pop()!;
    if (index < this.items.length) this.items[index] = last;
    this.free.push(entity);
    return entity;
  }

  clear(): void {
    for (let index = this.items.length - 1; index >= 0; index -= 1) {
      this.releaseAt(index);
    }
  }
}
