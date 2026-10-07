# Документация проекта Hex Tactics

Что сделано, зачем каждый файл, как оптимизировали рендер, какой стек нужен и как всё собрать.

---

## 1. Кратко: что это за проект

Браузерная пошаговая космическая тактика на **гексах** (портрет **720×1280**) под площадки вроде Яндекс Игр.

**Стек:** Phaser 3 + TypeScript + Vite.  
**Логика боя** отделена от отрисовки: `BattleSystem` шлёт события, `BattleScene` только рисует и принимает ввод.

**Сделано по шагам:**

1. Скелет Vite + Phaser (сцены Boot → Menu → Battle).
2. Модуль гексов (axial, pointy-top, Map `"q,r"`).
3. Дата-файл кораблей (`units.ts`).
4. Пошаговый бой + A* + ИИ + EventEmitter.
5. Оптимизация рендера: dirty-гексы, пулы VFX, throttle ИИ 200 мс, один текстурный атлас.

---

## 2. Что нужно скачать и установить

### 2.1. Node.js (обязательно)

| | |
|---|---|
| **Зачем** | Запускает npm, Vite, TypeScript, Vitest |
| **Где скачать** | https://nodejs.org/ |
| **Что брать** | LTS (рекомендуется 20.x или 22.x) |
| **Проверка** | `node -v` и `npm -v` в терминале |

После установки Node.js появляется **npm** (менеджер пакетов) — отдельно его ставить не нужно.

### 2.2. Зависимости проекта (через npm)

Из папки проекта:

```bash
npm install
```

Это скачает всё из `package.json`:

| Пакет | Тип | Роль | Страница |
|-------|-----|------|----------|
| **phaser** | dependency | Игровой движок (canvas, сцены, ввод, спрайты) | https://phaser.io/ / https://www.npmjs.com/package/phaser |
| **typescript** | devDependency | Компиляция / проверка типов TS | https://www.typescriptlang.org/ / https://www.npmjs.com/package/typescript |
| **vite** | devDependency | Dev-сервер + сборка бандла | https://vitejs.dev/ / https://www.npmjs.com/package/vite |
| **vitest** | devDependency | Юнит-тесты | https://vitest.dev/ / https://www.npmjs.com/package/vitest |

Других библиотек в проекте нет (без React, без Pixi отдельно, без Webpack).

### 2.3. Редактор (по желанию)

| Инструмент | Зачем | Где |
|------------|-------|-----|
| **Cursor** / **VS Code** | Правка кода, терминал | https://cursor.com/ / https://code.visualstudio.com/ |
| Расширение для TS | Подсветка, ошибки | встроено в VS Code / Cursor |

### 2.4. Браузер для проверки

Chrome / Edge / Firefox — обычный современный браузер. Отдельно «движок» ставить не нужно: Phaser работает в браузере.

---

## 3. Как устроен стек и через что он собирается

```
TypeScript (.ts)
      │
      ▼
  Vite (esbuild)  ───  dev: мгновенный HMR в браузере
      │
      ▼
  один JS-бандл (+ index.html) в папке dist/
      │
      ▼
  Браузер загружает Phaser и игру
```

### Роли инструментов

1. **TypeScript** — пишет код с типами; при `npm run build` сначала `tsc --noEmit` (только проверка, файлы `.js` сам tsc не пишет).
2. **Vite** — в dev поднимает сервер на порту **5173**; в prod сжимает код (**esbuild minify**), target **ES2020**, **один бандл** (`inlineDynamicImports: true`).
3. **Phaser 3** — runtime в браузере: сцены, canvas, Scale.FIT, атлас, ввод.
4. **Vitest** — гоняет тесты HexGrid без Phaser-сцены (константы отделены от Phaser-конфига).

### Команды

| Команда | Что делает |
|---------|------------|
| `npm install` | Скачать зависимости в `node_modules/` |
| `npm run dev` | Dev-сервер Vite → http://localhost:5173 |
| `npm run build` | `tsc --noEmit` + Vite → папка `dist/` |
| `npm run preview` | Локально открыть прод-сборку |
| `npm test` | Vitest (файлы `*.test.ts`) |

### Конфиг сборки

- `vite.config.ts` — `target: 'es2020'`, minify, один chunk.
- `tsconfig.json` — `strict`, `moduleResolution: bundler`, `noEmit`.
- `index.html` — точка входа, подключает `/src/main.ts`.

Прод-артефакт для выкладки (в т.ч. на Яндекс Игры): содержимое **`dist/`** (html + один большой js с Phaser).

---

## 4. Структура проекта и каждый файл

Ориентировочное число строк — на момент написания документа.

### Корень

| Файл | Строк | Особенность |
|------|------:|-------------|
| `package.json` | ~20 | Имя проекта, скрипты, список зависимостей |
| `package-lock.json` | много | Точные версии пакетов (не править руками) |
| `tsconfig.json` | ~16 | Настройки TypeScript |
| `vite.config.ts` | ~26 | Сборка + конфиг Vitest |
| `index.html` | ~35 | Canvas-контейнер `#game-container`, fullscreen CSS |
| `.gitignore` | ~4 | `node_modules`, `dist` |
| `yandex-games-brief.md` | ~49 | Продуктовый бриф (камера, мобилка, стек) |

### `src/main.ts` (~4 строки)

Создаёт `new Phaser.Game(gameConfig)`. Точка входа Vite.

### `src/config/`

| Файл | Строк | Особенность |
|------|------:|-------------|
| `constants.ts` | ~14 | Чистые константы: `GAME_WIDTH/HEIGHT`, `HEX_SIZE`, `HEX_COLS/ROWS`, `ATLAS_KEY`, `AI_THROTTLE_MS`. **Без Phaser** — чтобы тесты не тянули движок |
| `gameConfig.ts` | ~26 | Phaser `GameConfig`: 720×1280, `Scale.FIT`, список сцен. Реэкспорт констант |
| `units.ts` | ~59 | Баланс кораблей: Scout / Fighter / Cruiser / Artillery — только данные, без логики |

### `src/entities/`

| Файл | Строк | Особенность |
|------|------:|-------------|
| `Unit.ts` | ~28 | Типы `BattleUnit`, `UnitSpawn`, `Team` — runtime-данные юнита |

### `src/assets/`

| Файл | Строк | Особенность |
|------|------:|-------------|
| `createGameAtlas.ts` | ~156 | В рантайме рисует **один** canvas-атлас (`game_atlas`): гексы, корабли, снаряд, кадры взрыва. Все спрайты боя берут кадры только отсюда |

### `src/scenes/`

| Файл | Строк | Особенность |
|------|------:|-------------|
| `BootScene.ts` | ~13 | Строит атлас → стартует Menu |
| `MenuScene.ts` | ~34 | Заголовок + кнопка PLAY → Battle |
| `BattleScene.ts` | ~458 | Рендер, ввод, подписка на события боя, dirty-гексы, пулы VFX, throttle ИИ. **Самый тяжёлый файл рендера** |

### `src/systems/`

| Файл | Строк | Особенность |
|------|------:|-------------|
| `HexGrid.ts` | ~157 | Axial + pointy-top: `axialToPixel`, `pixelToAxial`, соседи, дистанция, range; сетка в `Map<"q,r">` |
| `HexGrid.test.ts` | ~92 | Тесты координат и `hexDistance` |
| `Pathfinding.ts` | ~127 | A* и BFS reachable по гексам |
| `EventEmitter.ts` | ~44 | Типизированный pub/sub без Phaser/Node |
| `BattleSystem.ts` | ~487 | Пошаговый бой, ход/атака, ИИ по очереди (`tickAi`), события |
| `ObjectPool.ts` | ~30 | Пул объектов acquire/release |

---

## 5. Как работает геймплей (логика vs рендер)

```
Игрок тапает гекс
      │
      ▼
BattleScene ──вызовы──► BattleSystem (move / attack / endPlayerTurn)
      ▲                        │
      │                   events.emit(...)
      └──── подписка ──────────┘
           (unit:moved, unit:attacked, …)
```

**Ход юнита:** перемещение в пределах `moveRange` (A*) + одна атака в пределах `range`.  
**Фазы:** игрок → `endPlayerTurn()` → ИИ (`tickAi` раз в 200 мс) → снова игрок.  
**Управление в бою:** свой корабль → зелёные гексы хода / красные атаки; **END TURN** сверху.

---

## 6. Оптимизации рендера (что меняли и зачем)

Файл с замерами и реализацией: **`src/scenes/BattleScene.ts`** (комментарий в начале файла).

### 6.1. Dirty-гексы вместо полной перерисовки

| | До | После |
|---|----|--------|
| Подход | `Graphics.clear()` + цикл по всем ~99 гексам на каждый hover | Спрайты создаются **один раз**; в `update` обновляются только ключи из `dirtyHexes` |
| Стоимость (ориентир) | ~0.85–1.20 мс на pointermove | ~0.05–0.15 мс на 1–3 спрайта |
| Где код | раньше `drawGrid()` целиком | `markHexDirty` / `flushDirtyHexes` / `resolveHexVisual` |

### 6.2. Пул снарядов и взрывов

| | До (типичный антипаттерн) | После |
|---|----|--------|
| Подход | `add.image` на каждый выстрел → GC | `ObjectPool` (`src/systems/ObjectPool.ts`): заранее N картинок, `acquire` / `release` |
| Стоимость | спайки ~0.3–0.8 мс + GC | ~0.02–0.05 мс в steady-state |
| Где код | — | `createPools`, `spawnProjectile`, `spawnExplosion`, `updateProjectiles/Explosions` |

### 6.3. ИИ не каждый кадр

| | До | После |
|---|----|--------|
| Подход | `runAiTurn()` сразу по всем врагам в `endPlayerTurn` (блок кадра) | `tickAi()` — **один** враг за вызов; сцена копит `delta` и зовёт ИИ раз в **`AI_THROTTLE_MS = 200`** |
| Стоимость | ~2.5–6 мс одним куском | ~0.4–1.5 мс / тик, остальные кадры 0 мс на ИИ |
| Где код | `BattleSystem.endPlayerTurn` + `tickAi` | `BattleScene.tickAiThrottled` |

### 6.4. Один текстурный атлас

| | Зачем |
|---|--------|
| `createGameAtlas.ts` | Все кадры (`hex_*`, `unit_*`, `projectile`, `explosion_*`) в одной текстуре `game_atlas` |
| Выигрыш | Меньше switch texture / draw calls; один источник для спрайтов |
| Загрузка | В `BootScene.create()` до меню |

### Сводка замеров (из комментария в BattleScene)

```
BEFORE: full hex redraw ~0.85–1.20 ms; AI sync ~2.5–6.0 ms; VFX alloc spikes ~0.3–0.8 ms
AFTER:  dirty hexes ~0.05–0.15 ms; AI tick @200ms ~0.4–1.5 ms; pooled VFX ~0.02–0.05 ms
```

Условия: Chrome, Win, логическое 720×1280, сетка 9×11, несколько врагов на поле.

---

## 7. Пошаговый запуск с нуля

1. Установить **Node.js LTS**: https://nodejs.org/
2. Открыть папку проекта в терминале.
3. Выполнить:
   ```bash
   npm install
   npm run dev
   ```
4. В браузере открыть адрес, который покажет Vite (обычно http://localhost:5173).
5. PLAY → бой; для проверки продакшена:
   ```bash
   npm run build
   npm run preview
   ```
6. Тесты сетки:
   ```bash
   npm test
   ```

Выкладка на хостинг / Яндекс Игры: загрузить содержимое папки **`dist/`** после `npm run build`.

---

## 8. Где что скачать (шпаргалка ссылок)

| Инструмент | Ссылка |
|------------|--------|
| Node.js | https://nodejs.org/ |
| npm (идёт с Node) | https://docs.npmjs.com/ |
| Phaser 3 | https://phaser.io/ / npm: `phaser` |
| TypeScript | https://www.typescriptlang.org/ / npm: `typescript` |
| Vite | https://vitejs.dev/ / npm: `vite` |
| Vitest | https://vitest.dev/ / npm: `vitest` |
| Документация гексов (теория axial) | https://www.redblobgames.com/grids/hexagons/ |

---

## 9. Важные архитектурные решения

1. **Константы отдельно от Phaser-конфига** — тесты HexGrid не поднимают `window`/Phaser.
2. **Бой без Phaser** — можно менять баланс и ИИ, не трогая сцены.
3. **События** — рендер реактивный: движение/атака/смерть приходят событиями, сцена не «опрашивает» логику каждый кадр (кроме throttle ИИ и анимаций VFX).
4. **Портрет 720×1280 + Scale.FIT** — заточка под телефоны и Яндекс Игры.
5. **Один бандл ES2020** — проще деплой на HTML5-площадки.

---

*Документ описывает состояние репозитория на момент создания файла. Число строк может чуть отличаться после правок.*
