import {
  HexGrid,
  getNeighbors,
  hexDistance,
  hexKey,
  type Axial,
} from './HexGrid';

/**
 * A* on axial hex grid. Returns path from start to goal inclusive, or null.
 * Intermediate blocked cells are skipped; the goal must not be blocked
 * (unless start === goal).
 */
export function findPath(
  grid: HexGrid,
  start: Axial,
  goal: Axial,
  isBlocked: (q: number, r: number) => boolean,
  maxCost: number = Infinity,
): Axial[] | null {
  const startKey = hexKey(start.q, start.r);
  const goalKey = hexKey(goal.q, goal.r);

  if (!grid.has(start.q, start.r) || !grid.has(goal.q, goal.r)) {
    return null;
  }
  if (startKey !== goalKey && isBlocked(goal.q, goal.r)) {
    return null;
  }
  if (startKey === goalKey) {
    return [{ q: start.q, r: start.r }];
  }

  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[startKey, 0]]);
  const open = new Map<string, number>([[startKey, hexDistance(start, goal)]]);

  while (open.size > 0) {
    let currentKey = '';
    let bestF = Infinity;
    for (const [key, f] of open) {
      if (f < bestF) {
        bestF = f;
        currentKey = key;
      }
    }

    if (currentKey === goalKey) {
      return rebuildPath(cameFrom, currentKey);
    }

    open.delete(currentKey);
    const [cq, cr] = currentKey.split(',').map(Number);
    const currentG = gScore.get(currentKey)!;

    for (const n of getNeighbors(cq, cr)) {
      const nKey = hexKey(n.q, n.r);
      if (!grid.has(n.q, n.r)) {
        continue;
      }
      if (nKey !== goalKey && isBlocked(n.q, n.r)) {
        continue;
      }

      const tentativeG = currentG + 1;
      if (tentativeG > maxCost) {
        continue;
      }

      const prevG = gScore.get(nKey);
      if (prevG !== undefined && tentativeG >= prevG) {
        continue;
      }

      cameFrom.set(nKey, currentKey);
      gScore.set(nKey, tentativeG);
      open.set(nKey, tentativeG + hexDistance(n, goal));
    }
  }

  return null;
}

function rebuildPath(cameFrom: Map<string, string>, goalKey: string): Axial[] {
  const path: Axial[] = [];
  let key: string | undefined = goalKey;
  while (key) {
    const [q, r] = key.split(',').map(Number);
    path.push({ q, r });
    key = cameFrom.get(key);
  }
  path.reverse();
  return path;
}

/** BFS: reachable empty cells within `maxCost` steps (excluding start). */
export function getReachable(
  grid: HexGrid,
  start: Axial,
  maxCost: number,
  isBlocked: (q: number, r: number) => boolean,
): Axial[] {
  const result: Axial[] = [];
  const visited = new Map<string, number>();
  const queue: Axial[] = [{ q: start.q, r: start.r }];
  visited.set(hexKey(start.q, start.r), 0);

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const cost = visited.get(hexKey(cur.q, cur.r))!;
    if (cost >= maxCost) {
      continue;
    }

    for (const n of getNeighbors(cur.q, cur.r)) {
      const key = hexKey(n.q, n.r);
      if (!grid.has(n.q, n.r) || visited.has(key) || isBlocked(n.q, n.r)) {
        continue;
      }
      visited.set(key, cost + 1);
      result.push({ q: n.q, r: n.r });
      queue.push(n);
    }
  }

  return result;
}
