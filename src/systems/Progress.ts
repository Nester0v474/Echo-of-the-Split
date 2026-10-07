/** Campaign progress persisted via the platform store (Yandex or localStorage). */
import { persistGet, persistSet } from '../platform/persist';

export type Ending = 'metropolis' | 'free' | null;

interface ProgressData {
  completed: string[];
  ending: Ending;
}

const KEY = 'hex-tactics.progress.v1';
let cache: ProgressData | null = null;

export function hydrateProgress(): void {
  cache = null;
  load();
}

function load(): ProgressData {
  if (cache) {
    return cache;
  }
  const raw = persistGet(KEY);
  cache = { completed: [], ending: null };
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<ProgressData>;
      cache = {
        completed: Array.isArray(parsed.completed) ? parsed.completed : [],
        ending: parsed.ending ?? null,
      };
    } catch {
      /* keep defaults */
    }
  }
  return cache;
}

function save(): void {
  persistSet(KEY, JSON.stringify(load()));
}

export function getCompletedMissionIds(): readonly string[] {
  return load().completed.slice();
}

export function getCompletedMissions(): Set<string> {
  return new Set(load().completed);
}

export function markMissionCompleted(id: string): void {
  const p = load();
  if (!p.completed.includes(id)) {
    p.completed.push(id);
    save();
  }
}

export function getEnding(): Ending {
  return load().ending;
}

export function setEnding(ending: Ending): void {
  load().ending = ending;
  save();
}

export function resetProgress(): void {
  cache = { completed: [], ending: null };
  save();
}
