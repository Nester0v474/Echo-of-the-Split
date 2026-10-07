export type Handler<T> = (payload: T) => void;

/**
 * Minimal typed pub/sub — no Phaser / Node dependency.
 */
export class EventEmitter<EventMap extends object> {
  private readonly listeners = new Map<
    keyof EventMap,
    Set<(payload: EventMap[keyof EventMap]) => void>
  >();

  on<K extends keyof EventMap>(
    event: K,
    handler: Handler<EventMap[K]>,
  ): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as (payload: EventMap[keyof EventMap]) => void);
    return () => this.off(event, handler);
  }

  off<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): void {
    this.listeners
      .get(event)
      ?.delete(handler as (payload: EventMap[keyof EventMap]) => void);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) {
      return;
    }
    for (const handler of [...set]) {
      (handler as Handler<EventMap[K]>)(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
