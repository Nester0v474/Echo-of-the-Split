# Как устроена Hex Tactics — связь экрана и кода

Подробная карта: что видит игрок → какой файл → какой метод.  
Краткая шпаргалка по стеку и запуску — в `DOCUMENTATION.md`.

---

## 0. Карта за 30 секунд

```
index.html          →  контейнер #game-container
main.ts             →  new Phaser.Game(gameConfig)
gameConfig.ts       →  720×1280, сцены: Boot → Menu → Battle
BootScene           →  рисует атлас спрайтов
MenuScene           →  кнопка PLAY
BattleScene         →  всё, что видно в бою (гексы, корабли, VFX, тапы)
BattleSystem        →  правила боя (без Phaser)
HexGrid / Pathfinding → координаты и пути
units.ts            →  баланс кораблей
```

**Главный принцип:** логика (`BattleSystem`) не рисует, сцена (`BattleScene`) не решает правила. Связь — события (`EventEmitter`).

---

## 1. Старт приложения: от HTML до первой сцены

### 1.1. Что видно в браузере

Полный экран тёмного фона. Внутри — canvas Phaser, подогнанный под размер окна (`Scale.FIT`).

### 1.2. Цепочка кода

| Элемент / шаг | Файл | Что делает |
|---------------|------|------------|
| Страница | `index.html` | `<div id="game-container">` + `<script src="/src/main.ts">` |
| Точка входа | `src/main.ts` | `new Phaser.Game(gameConfig)` |
| Конфиг игры | `src/config/gameConfig.ts` | размер, родитель, список сцен |
| Константы | `src/config/constants.ts` | 720×1280, 9×11 гексов, `HEX_SIZE=40` |

```html
<!-- index.html -->
<div id="game-container"></div>
<script type="module" src="/src/main.ts"></script>
```

```ts
// src/main.ts
new Phaser.Game(gameConfig);
```

```ts
// gameConfig.ts — parent должен совпасть с id в HTML
parent: 'game-container',
width: GAME_WIDTH,   // 720
height: GAME_HEIGHT, // 1280
scene: [BootScene, MenuScene, BattleScene],
```

Порядок сцен: Phaser стартует с **первой** в массиве → `BootScene`.

---

## 2. BootScene — невидимый экран «подготовка»

**Что на экране:** почти ничего (мгновенный переход).

**Зачем:** один раз создать текстурный атлас `game_atlas`, чтобы все спрайты боя брали кадры из одной текстуры.

| Что | Где |
|-----|-----|
| Сцена | `src/scenes/BootScene.ts` |
| Рисование атласа | `src/assets/createGameAtlas.ts` → `createGameAtlas(this)` |
| Ключ текстуры | `ATLAS_KEY = 'game_atlas'` в `constants.ts` |

```ts
// BootScene.create()
createGameAtlas(this);
this.scene.start('MenuScene');
```

### Кадры атласа (имя кадра → что рисуется)

| Frame name | На экране |
|------------|-----------|
| `hex_idle` | обычный гекс |
| `hex_hover` | гекс под пальцем/мышью |
| `hex_move` | зелёная зона хода |
| `hex_attack` | красная зона атаки |
| `unit_scout` / `unit_fighter` / `unit_cruiser` / `unit_artillery` | корабли |
| `projectile` | снаряд |
| `explosion_0`…`3` | анимация взрыва |

Связь с балансом: в `units.ts` у каждого типа есть `spriteKey` (например `'unit_fighter'`), сцена ставит именно этот кадр.

---

## 3. MenuScene — экран «HEX TACTICS» + PLAY

| Элемент на экране | Код |
|-------------------|-----|
| Заголовок `HEX TACTICS` | `this.add.text(..., 'HEX TACTICS', ...)` |
| Кнопка `PLAY` | `.setInteractive()` + `pointerdown` → `this.scene.start('BattleScene')` |
| Центр экрана | `GAME_WIDTH/2`, `GAME_HEIGHT/2` |

Файл: `src/scenes/MenuScene.ts`.

---

## 4. BattleScene — весь бой на экране

Файл: `src/scenes/BattleScene.ts` (~458 строк). Это **единственный** слой, который рисует и слушает тапы.

### 4.1. Что создаётся при входе в бой (`create`)

```
create()
  ├─ new HexGrid(9, 11)           → логическая сетка
  ├─ new BattleSystem(grid)       → правила
  ├─ originX/Y                    → центрирование поля на 720×1280
  ├─ createHexSprites()           → 99 спрайтов гексов (один раз)
  ├─ createPools()                → пулы снарядов/взрывов
  ├─ bindBattleEvents()           → подписка на события логики
  ├─ spawnDemoBattle()            → расстановка 3 своих + 4 врагов
  ├─ pointermove / pointerdown    → ввод
  └─ текст END TURN               → конец хода игрока
```

### 4.2. Элементы UI ↔ код

| Что видишь | Переменная / метод | Файл |
|------------|--------------------|------|
| Сетка гексов | `hexSprites` Map, кадры `hex_*` | `BattleScene.createHexSprites` |
| Подсветка hover | `hoveredKey` → `hex_hover` | `onPointerMove` + `flushDirtyHexes` |
| Зелёные клетки хода | `moveKeys` → `hex_move` | обработчик `unit:selected` |
| Красные клетки атаки | `attackKeys` → `hex_attack` | тот же |
| Корабли | `unitSprites` Map | `upsertUnitSprite` |
| Свои корабли (белый tint) | `setTint(0xffffff)` | `upsertUnitSprite` |
| Враги (розовый tint) | `setTint(0xff8899)` | `upsertUnitSprite` |
| Кнопка END TURN | текст сверху | `create()` → `battle.endPlayerTurn()` |
| Снаряд | `projectilePool` | `spawnProjectile` |
| Взрыв | `explosionPool` | `spawnExplosion` |

### 4.3. Каждый кадр (`update`)

```ts
update(_time, delta) {
  flushDirtyHexes();      // обновить только «грязные» гексы
  updateProjectiles(delta);
  updateExplosions(delta);
  tickAiThrottled(delta); // ИИ не чаще раза в 200 мс
}
```

---

## 5. Управление: тап → логика → картинка

### 5.1. Тап по полю (`onPointerDown`)

```
pointerdown
  │
  ├─ фаза ≠ player? → игнор
  ├─ пиксель → axial (pixelToAxial) через worldToAxial
  │
  ├─ на клетке свой корабль?  → battle.selectUnit(id)
  ├─ выбран свой + тап по врагу? → battle.attack(...)
  └─ выбран свой + пустая клетка? → battle.moveUnit(...)
```

Код:

```ts
// BattleScene.onPointerDown
if (occupant?.team === 'player') {
  this.battle.selectUnit(occupant.id);
  return;
}
if (selectedId && occupant && occupant.team === 'enemy') {
  this.battle.attack(selectedId, occupant.id);
  return;
}
if (selectedId && !occupant) {
  this.battle.moveUnit(selectedId, axial.q, axial.r);
}
```

### 5.2. Что делает логика и чем отвечает

| Действие игрока | Метод BattleSystem | Событие(я) | Реакция сцены |
|-----------------|--------------------|------------|---------------|
| Тап по своему | `selectUnit` | `unit:selected` | зелёные/красные оверлеи |
| Тап по пустому гексу | `moveUnit` | `unit:moved` | сдвиг спрайта, обновление оверлеев |
| Тап по врагу | `attack` | `unit:attacked` (+ `unit:died`) | снаряд → взрыв; скрыть мёртвого |
| END TURN | `endPlayerTurn` | `turn:end` / `turn:start` enemy | очистка оверлеев, старт ИИ |
| (авто) ход врага | `tickAi` | move/attack как у игрока | те же обработчики |
| Победа/поражение | `checkBattleEnd` | `battle:ended` | (сейчас только событие; UI конца боя можно добавить) |

Схема:

```
Игрок (тап / END TURN)
        │
        ▼
   BattleScene          ──вызов──►   BattleSystem
        ▲                                  │
        │         events.emit(...)         │
        └──────── подписка ────────────────┘
```

Подписка: `bindBattleEvents()` в `BattleScene`.

---

## 6. BattleSystem — правила без картинок

Файл: `src/systems/BattleSystem.ts`.

### 6.1. Данные юнита

Тип `BattleUnit` (`src/entities/Unit.ts`) — только числа и флаги:

- позиция `q,r`
- `hp`, `damage`, `range`, `moveRange`
- `hasMoved`, `hasAttacked`, `alive`
- `team`: `'player' | 'enemy'`

Баланс берётся из `UNIT_TYPES` при `start(spawns)`:

```ts
const def = UNIT_TYPES[spawn.typeId];
// hp, damage, range, moveRange копируются в BattleUnit
```

### 6.2. Демо-расстановка (что на поле при PLAY)

`spawnDemoBattle()` в сцене:

| id | тип | команда | гекс (q,r) |
|----|-----|---------|------------|
| p1 | fighter | player | 1,9 |
| p2 | scout | player | 3,9 |
| p3 | artillery | player | 2,10 |
| e1 | fighter | enemy | 2,1 |
| e2 | cruiser | enemy | 4,1 |
| e3 | scout | enemy | 1,2 |
| e4 | fighter | enemy | 5,2 |

Чтобы поменять старт — править массив в `spawnDemoBattle`.  
Чтобы поменять статы — `src/config/units.ts`.

### 6.3. Один ход юнита

1. Можно **переместиться** один раз (`hasMoved`), путь через A* (`findPath`), длина ≤ `moveRange`.
2. Можно **атаковать** один раз (`hasAttacked`), если `hexDistance ≤ range`.
3. Порядок: ход и атака независимы (можно атаковать без хода и наоборот).

Доступные клетки хода: `getMoveTargets` → `getReachable` (BFS) в `Pathfinding.ts`.  
Цели атаки: `getAttackTargets` → живые враги в `range`.

### 6.4. Фазы

```
player ──endPlayerTurn──► enemy ──tickAi (по одному)──► player (новый turnNumber)
                              │
                              └── если все свои/враги мертвы → ended
```

ИИ (`aiAct`):

1. Если враг уже в range → атака.
2. Иначе — ход к клетке с лучшим score (предпочитает войти в range, потом ближе).
3. После хода — снова попытка атаки.

Throttle: сцена копит `delta` и зовёт `tickAi()` раз в `AI_THROTTLE_MS` (200 мс), чтобы не блокировать кадр.

---

## 7. Гексы: координаты ↔ пиксели

Файл: `src/systems/HexGrid.ts`.

| Задача | Функция |
|--------|---------|
| Гекс → экран | `axialToPixel(q, r, HEX_SIZE)` |
| Тап → гекс | `pixelToAxial` + `cubeRound` |
| Ключ в Map | `hexKey(q,r)` → `"q,r"` |
| Соседи | `getNeighbors` (6 направлений) |
| Дистанция | `hexDistance` |
| Карта 9×11 | `new HexGrid(cols, rows)` (odd-r → axial) |

Сцена добавляет смещение `originX/Y`, чтобы поле было по центру canvas:

```ts
worldX = originX + axialToPixel(...).x
```

Теория гексов: https://www.redblobgames.com/grids/hexagons/

---

## 8. Пути и досягаемость

Файл: `src/systems/Pathfinding.ts`.

| Функция | Алгоритм | Кто вызывает |
|---------|----------|--------------|
| `getReachable` | BFS | зелёные клетки, ИИ ищет ход |
| `findPath` | A* | фактический `moveUnit` / ход ИИ |

`isBlocked` = клетка занята живым юнитом (`BattleSystem.isOccupied`).

---

## 9. События (клей между логикой и рендером)

Файл: `src/systems/EventEmitter.ts` — свой pub/sub без Phaser.

Типы событий — интерфейс `BattleEvents` в `BattleSystem.ts`:

| Событие | Payload (суть) | Сцена делает |
|---------|----------------|--------------|
| `battle:started` | список юнитов | создать спрайты |
| `unit:selected` | id или null | оверлеи move/attack |
| `unit:moved` | from/to/path | сдвинуть спрайт |
| `unit:attacked` | attacker, target, damage | снаряд |
| `unit:died` | unitId | скрыть спрайт |
| `turn:start` / `turn:end` | team, номер | сброс оверлеев / AI timer |
| `battle:ended` | winner | (хук под экран победы) |
| `action:rejected` | reason | (сейчас без UI) |

`ev.on(...)` возвращает функцию отписки; в `shutdown()` все `unsubs` вызываются.

---

## 10. Оптимизации рендера (зачем сложный код гексов)

| Приём | Где | Зачем |
|-------|-----|-------|
| Dirty-гексы | `dirtyHexes` / `flushDirtyHexes` | не перерисовывать все 99 клеток на каждый hover |
| ObjectPool | `ObjectPool.ts` + пулы в сцене | не создавать Image на каждый выстрел |
| Один атлас | `createGameAtlas` | меньше смены текстур |
| AI throttle 200 мс | `tickAiThrottled` | ИИ не жрёт каждый кадр |

Подробные замеры — комментарий в начале `BattleScene.ts`.

---

## 11. Баланс кораблей

Файл: `src/config/units.ts`.

| id | HP | урон | range | move | спрайт |
|----|----|------|-------|------|--------|
| scout | 4 | 2 | 1 | 4 | `unit_scout` |
| fighter | 8 | 4 | 1 | 3 | `unit_fighter` |
| cruiser | 16 | 5 | 1 | 2 | `unit_cruiser` |
| artillery | 5 | 6 | 3 | 1 | `unit_artillery` |

Меняешь число здесь → при следующем `battle.start` юнит получит новые статы.  
Меняешь `spriteKey` → должен существовать кадр в атласе с тем же именем.

---

## 12. Типичный игровой цикл (сквозной пример)

1. Игрок нажимает **PLAY** → `MenuScene` → `BattleScene.create`.
2. `battle.start([...])` → событие `battle:started` → на экране 7 кораблей.
3. Тап по своему fighter → `selectUnit` → зелёные гексы вокруг (moveRange=3), красные на врагах в range.
4. Тап по зелёному гексу → `moveUnit` → A* → `unit:moved` → спрайт едет на новую клетку.
5. Тап по врагу в range → `attack` → `unit:attacked` → снаряд летит → взрыв; если HP≤0 → `unit:died`.
6. **END TURN** → фаза enemy → каждые 200 мс один враг ходит/стреляет теми же событиями.
7. Когда очередь ИИ пуста → снова фаза player, `turnNumber++`, флаги `hasMoved/hasAttacked` сброшены.

---

## 13. Как править «что видно» vs «как считается»

| Хочу изменить… | Куда идти |
|----------------|-----------|
| Размер экрана / портрет | `constants.ts` → `GAME_WIDTH/HEIGHT` |
| Число гексов | `HEX_COLS` / `HEX_ROWS` |
| Внешний вид гекса/корабля | `createGameAtlas.ts` (функции `draw*`) |
| Статы кораблей | `units.ts` |
| Стартовая расстановка | `BattleScene.spawnDemoBattle` |
| Правила хода/атаки/ИИ | `BattleSystem.ts` |
| Подсветку клеток | `HEX_FRAME` + `resolveHexVisual` в сцене |
| Скорость снаряда | `duration: 220` в `spawnProjectile` |
| Частоту ИИ | `AI_THROTTLE_MS` |
| Кнопку END TURN / меню | тексты в `BattleScene` / `MenuScene` |

**Правило:** если меняешь логику — сцена должна только слушать события (или уже слушает). Не дублируй правила в `onPointerDown`.

---

## 14. Запуск и остановка хоста

```bash
npm install
npm run dev          # http://localhost:5173
```

Остановить: в терминале `Ctrl+C`, либо закрыть процесс `node`/`vite` на порту 5173.

Прод-сборка для выкладки:

```bash
npm run build        # папка dist/
npm run preview      # локально посмотреть сборку
```

Тесты сетки: `npm test`.

---

## 15. Дерево исходников (только важное)

```
src/
  main.ts                 — старт Phaser
  config/
    constants.ts          — числа без Phaser
    gameConfig.ts         — конфиг Phaser
    units.ts              — баланс
  entities/
    Unit.ts               — типы BattleUnit / spawn
  assets/
    createGameAtlas.ts    — одна текстура на всё
  scenes/
    BootScene.ts          — атлас → меню
    MenuScene.ts          — PLAY
    BattleScene.ts        — рендер + ввод + VFX
  systems/
    HexGrid.ts            — координаты
    Pathfinding.ts        — A* / BFS
    BattleSystem.ts       — бой + ИИ
    EventEmitter.ts       — события
    ObjectPool.ts         — пул объектов
    HexGrid.test.ts       — тесты
```

---

*Если что-то на экране «не то» — сначала найди элемент в таблице §4.2 / §5.2, потом открой указанный метод.*
