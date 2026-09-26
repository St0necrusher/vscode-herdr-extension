# Issue #16 — аудит сложности и план упрощения Pane terminal surface

Статус: принят как план рефакторинга 2026-09-26. Решения D1–D6 и D-A1–D-A3 приняты (§6). Альтернативные подходы рассмотрены и отклонены в [`alternatives-discussion.md`](alternatives-discussion.md); оттуда же пришли отмена исходного D2 (Selection и FocusTracker остаются) и новый слайс S7 (колесо и правый клик).

Сравнивалось:

- текущий код `src/infrastructure/pane-editors/` (до рефакторинга, вместе с композицией);
- дизайн-док [`architecture.md`](architecture.md) и журнал [`progress.md`](progress.md);
- прототип `655c1a9:prototype/direct-attach-handoff/` (`extension.js`, `README.md`, `EVIDENCE.md`) как доказательство того, что реально работает;
- канон [`code-architecture.md`](../../architecture/code-architecture.md).

Тикет #16 устарел и не считается источником истины. Требование признаётся настоящим, если оно подтверждено прототипом или `EVIDENCE.md`, либо является неизбежным следствием API VS Code/Herdr/node-pty. Всё остальное в дизайн-доке — решение, которое нужно обосновать заново.

---

## 1. Резюме

Поведение, которое нужно продукту, небольшое и доказано прототипом: один VS Code терминал на Pane; read-only observer, когда редактор видим, но окно не в фокусе; `herdr terminal attach --takeover` под `node-pty`, когда видим и в фокусе; ничего, когда вкладка скрыта; без «перетягивания» после чужого takeover.

Текущая реализация выражает это через:

- `VsCodePaneTerminalSurface` — 714 строк, 27 полей, из них 6 явных boolean и ещё 9 полей-флагов через `undefined`, 2 промиса в полях;
- три независимых подписчика на `pane.moved` (Selection, Manager, Surface) и ручную перепривязку фокуса;
- обратную петлю `openPane` → `Selection.select` → Manager реагирует на `selected` → создание, при которой Selection одновременно «желаемое» состояние и отражение вкладок;
- политику предупреждений с двумя типами «контекста» и проверками, которые по построению всегда истинны.

Главные причины сложности:

1. **Решение и побочные эффекты перемешаны.** `reconcileClients` (`PaneTerminalSurface.ts:297-337`) одновременно вычисляет режим, мутирует флаги (`:316`, `:324-325`, `:334`) и запускает/останавливает процессы, с ранними `return` при разных комбинациях.
2. **Асинхронность размазана по Surface.** `stoppingAttach`, `attachStartWait`, `resumeAfterStoppingAttach`, проверки `this.stoppingAttach === stopping`, callbacks completion возвращаются в reconcile с другим набором флагов.
3. **Защита от невозможного.** Откаты в конструкторах, проверки `disposed` там, куда после dispose попасть нельзя, двойные `catch`, тавтологические проверки актуальности.
4. **Размытое направление потока.** Selection одновременно управляет созданием терминалов и отражает состояние вкладок; `pane.moved` независимо обрабатывают три владельца, и корректность зависит от порядка их подписки.

Цель: Surface = адаптер Pseudoterminal + 4 факта + одно состояние клиента в виде union + одна синхронная функция `converge()` + одна чистая функция `desiredClient()`. Процессы — без изменений по смыслу. Manager — единственный владелец вкладок и перемещений; он записывает Selection, а Selection × фокус окна (FocusTracker) остаётся единым сигналом видимости для Surface, будущего popup #26 и подсветки в сайдбаре.

---

## 2. Инвентаризация текущего состояния

### 2.1. Поля `VsCodePaneTerminalSurface` (`PaneTerminalSurface.ts:57-83`)

| Поле | Тип по сути | Кто владеет смыслом | Судьба в целевом дизайне |
|---|---|---|---|
| `writeEmitter`, `nameEmitter`, `terminal` | host-ресурсы | Surface | остаются |
| `projectionSubscription` | подписка | Surface | остаётся |
| `moveSubscription` | подписка | Surface | **удаляется**: move приходит от Manager |
| `focusSubscription` (mutable) | подписка + перепривязка | Surface | остаётся; перепривязка только внутри `move()`, который вызывает Manager |
| `selection` (mutable) | identity | Surface | остаётся как `paneId`/identity |
| `projection` | факт | Sessions | остаётся |
| `focus` | факт | FocusTracker | заменяется на `visibility: "hidden" \| "blurred" \| "focused"` (отображение `FocusChangeEvent.reason`) |
| `dimensions` | факт | VS Code | объединяется с `opened` в `host` union |
| `lastPane`, `pendingMovedPaneId` | ожидание snapshot после move | Surface | заменяются одним `movedPane` (см. §3, R5) |
| `observer`, `observerResizeTimer`, `observerFailed` | состояние observer | Surface | → варианты `ClientState` |
| `attach` | состояние attach | Surface | → вариант `ClientState` |
| `stoppingAttach` | промис | Surface | остаётся **единственным** промис-полем |
| `attachStartWait` | промис | Surface | **удаляется** |
| `attachIntent` (boolean) | политика | Surface | → `AttachIntent = "wanted" \| "displaced" \| "failed"` |
| `failedAttachFor` | контекст ошибки с размерами | Surface | **удаляется** (поглощается `AttachIntent = "failed"`) |
| `warnedAttachFailurePeriod` | контекст предупреждения | Surface | **удаляется** (поглощается `AttachIntent = "failed"`) |
| `visiblePlaceholder` | кэш экрана | Surface | остаётся (что сейчас нарисовано) |
| `publishedName` | кэш имени | Surface | можно удалить (повторный `fire` безвреден) или оставить — мелочь |
| `opened` | lifecycle | VS Code | → `host` union |
| `paneNameVisible` | lifecycle корреляции вкладки | Manager | остаётся (настоящее требование) |
| `closedByHost` | lifecycle | VS Code | **удаляется** |
| `disposed` | lifecycle | Surface | остаётся, но проверяется в 2-3 местах, а не в 12 |

### 2.2. Методы, существующие только из-за перемешанной ответственности

- `reconcileAfterObserverRetryOpportunity` (`:290`) — сброс `observerFailed` + reconcile + render на каждое событие.
- `ensureObserver` / `ensureAttach` / `startAttach` / `startObserver` — по две копии замыкания-sink с проверкой идентичности ресурса (`:406-413`, `:532-539`).
- `waitForStoppingAttach` + `resumeAfterStoppingAttach` (`:465-479`) — два уровня промисов ради «запустить reconcile после остановки».
- `isCurrentAttachEligibility` + `warnForCurrentLocalAttachFailure` + `updateAttachWarningPeriod` + `resetAttachWarningPeriod` + 4 свободные функции контекстов (`:481-528`, `:672-700`).
- `handleObserverCompletion` и `handleObserverFailure` (`:563-586`) — почти идентичны.
- `currentFocusedPaneRequest` (`:350`) дублирует сборку запроса из `reconcileClients` (`:304-309`).

### 2.3. Мёртвая или тавтологическая логика (доказательства)

1. **`isCurrentAttachEligibility` всегда `true` там, где вызывается.** `startAttach` вызывается только из `ensureAttach` ← `reconcileClients`, который собирает `request` из текущих `this.selection`, `this.dimensions`, `currentConnectedPane()` и проверил `focus === "window-focused" && attachIntent`. `paneClients.createAttach` бросает синхронно (spawn). Между сборкой запроса и `catch` состояние не меняется, значит все шесть условий `:504-510` истинны. `warnForCurrentLocalAttachFailure` пересчитывает то же самое ещё раз (`:521`).
2. **`resource !== undefined` в sink и completion** (`:408`, `:411`, `:534`, `:537`, `:547`, `:550`). Данные `node-pty.onData` и `child.stdout` приходят асинхронно, после присваивания `resource`.
3. **`closedByHost`.** Вызов `terminal.dispose()` после закрытия вкладки пользователем безопасен. Перед удалением проверить вручную в Extension Development Host.
4. **Проверки `disposed`** в `reveal`, `showPaneName`, `append`, `replace`, `updateDimensions`, projection/focus handlers. После `dispose()` все подписки сняты, эмиттеры уничтожены, клиенты остановлены и отключены от sink. Нужны только: идемпотентность `dispose()` и гейт в асинхронных продолжениях (completion, окончание остановки attach, таймер ресайза).
5. **Двойной перехват ошибок остановки.** `HerdrPaneAttach.stop()` уже ловит и логирует (`HerdrPaneAttach.ts:85-90`), Surface ловит и логирует ещё раз (`PaneTerminalSurface.ts:453-458`). Аналогично observer (`HerdrPaneObserver.ts:160` и `PaneTerminalSurface.ts:604-609`). Кроме того, `stopPty` не может бросить: `sendSignal` сам всё ловит.
6. **`Promise.resolve().then(() => this.stopPty())`** (`HerdrPaneAttach.ts:85`, `HerdrPaneObserver.ts:158`) — обёртка против синхронного throw, которого нет.
7. **Откаты в конструкторах** (`PaneTerminalSurface.ts:98-106`, `:126-156`, `PaneTerminalSurfaceManager.ts:26-33`, `PaneEditorFocusTracker.ts:33-47`). Добавлены в незакоммиченной композиции по замечанию ревью. Прямо противоречат `code-architecture.md` → Lifecycle: «Add partial-acquisition cleanup only for a concrete realistic failure path… not hypothetical constructor throws». Откат в `HerdrExtension` существовал до #16 — вне рамок этого аудита.

---

## 3. Аудит требований дизайн-дока

### 3.1. Оставить: подтверждено прототипом или внешним API

| # | Требование | Источник |
|---|---|---|
| K1 | Observer (`terminal session observe`, NDJSON) и attach (`terminal attach <id> --takeover`) переключаются в одном Pseudoterminal | прототип, `EVIDENCE.md` |
| K2 | Attach под `node-pty@1.2.0-beta.13`, `HERDR_CONFIG_PATH` со статическим `mouse_capture = false` | `EVIDENCE.md`, `architecture.md:298` |
| K3 | Blur окна отпускает attach, refocus забирает обратно (handoff с Ghostty) | `EVIDENCE.md` |
| K4 | Каждая вкладка, которая `activeTab` в своей группе, независимо может держать attach; `group.isActive` не фильтр | dirty-проба прототипа (`research.md`) |
| K5 | Скрытая вкладка не держит ни одного клиента | решение пользователя (`progress.md`) |
| K6 | После неожиданного выхода attach управление не отбирается автоматически; повторный захват по локальному вводу или новому переходу фокуса | `EVIDENCE.md`, #26-совместимость |
| K7 | Остановка: SIGTERM → ожидание → SIGKILL → ожидание, без протокольного ACK | прототип |
| K8 | Два attach одного Surface одновременно не существуют (нельзя запускать новый, пока старый не завершился) | следствие `--takeover` |
| K9 | Observer не умеет ресайз, пересоздаётся с debounce 120 мс; attach ресайзится сразу | прототип |
| K10 | Вход локального ввода в attach пишется сразу после синхронного spawn, без буфера и first-output gate | решение пользователя, #27 |
| K11 | Сопоставление вкладки по временному имени `${sessionId}:${paneId}`, затем по идентичности `vscode.Tab`; после привязки показывается человеческое имя | ограничение API VS Code |
| K12 | Surface работает только для Pane активной подключённой Session; иначе заглушка | следствие текущей модели Sessions (одна активная проекция) |
| K13 | `pane.moved` меняет public Pane ID, сохраняя `terminal_id`; живой клиент не перезапускается | исходники Herdr 0.9.0 |
| K14 | Закрытие вкладки освобождает только ресурсы расширения | прототип |

### 3.2. Упростить или удалить

#### R1. Политика предупреждения об ошибке attach — удалить контексты

Дизайн (`architecture.md:284`): одно предупреждение «в течение непрерывного периода», только если совпадают Surface, identity, target, visibility, focus, active Session и intent на момент, когда ошибка известна.

Проблема: ошибка создания attach известна синхронно, значит условие всегда выполнено (§2.3 п.1). Реальная задача одна — не спамить popup'ом на каждое нажатие клавиши.

Предложение: `AttachIntent = "wanted" | "displaced" | "failed"`.

- ввод при `displaced` → `wanted` (повторный захват, K6);
- ввод при `failed` → ничего не делает (нет повторной попытки, нет спама);
- переход видимости в `focused` из любого другого состояния → `wanted`;
- ошибка создания attach → `failed`; если попытку вызвал ввод — одно `showWarningMessage`.

Результат: не больше одного предупреждения за период фокуса, без контекстов и без флага «уже предупреждали». Удаляется ~70 строк.

#### R2. `failedAttachFor` с размерами — удалить

Этого нет даже в дизайн-доке: придумано в коде (`:76`, `:312-326`). Ключ включает размеры, то есть ресайз окна после ошибки вызывает повторный spawn — побочный эффект, который никто не заказывал. Поглощается `AttachIntent = "failed"` (R1).

#### R3. Модель остановки — оставить параллельность, но выразить одним полем

В прошлом ответе в чате я предлагал вернуть полностью последовательную очередь прототипа. **Это было неверно**, уточняю:

- В прототипе ввод в режиме observer ждёт остановки observer (до 750 мс) и поэтому нуждается во входном буфере (`pendingInput`). Продакшен от буфера сознательно отказался (K10). Полная очередь вернула бы либо буфер, либо потерю первых символов.
- Observer read-only. Перекрытие «останавливающийся observer + новый attach» или «останавливающийся attach + новый observer» безвредно.
- Единственное настоящее ограничение — K8: attach → attach. Это часто случается при быстром blur → focus.

Предложение: `converge()` синхронна. Остановка любого клиента — «выстрелил и забыл», **кроме** attach: его промис остановки кладётся в единственное поле `stoppingAttach`. Если нужен attach, а `stoppingAttach` задан, `converge()` просто выходит; по завершении остановки поле очищается и `converge()` вызывается снова. Желаемый режим каждый раз вычисляется заново из текущих фактов, поэтому «перепроверка после await» (`architecture.md:278`) не нужна как отдельное правило — её нет, потому что нет await.

Удаляются `attachStartWait`, `waitForStoppingAttach`, `resumeAfterStoppingAttach`.

#### R4. Selection и FocusTracker — оставить как сигнал, развернуть направление потока

> Исходная рекомендация удалить оба класса отменена решением D-A2 ([`alternatives-discussion.md`](alternatives-discussion.md)). Popup #26 — обязательная часть основного сценария (пользователь ушёл на телефон, окно VS Code осталось в фокусе, сигнал есть только у сервера Herdr). Ему и подсветке выбранных Pane в сайдбаре нужен единый сигнал «какие Pane-редакторы видимы и в фокусе». Это реальные потребители, поэтому сигнал остаётся.

Проблема не в существовании классов, а в направлении потока. Сейчас:

```text
openPane ──► Selection.select ──► Manager.handleSelected ──► создание Surface
Manager.reconcileTabBindings ──► Selection.select/deselect ──► FocusTracker ──► Surface
Herdr pane.moved ──► Selection   (свой ключ, затем FocusTracker через событие moved)
                 ──► Manager     (ключ реестра)
                 ──► Surface     (identity + ручная перепривязка подписки на фокус)
```

Selection одновременно управляет созданием (желаемое состояние) и отражает вкладки (фактическое состояние). Три независимых обработчика `pane.moved` корректны только при определённом порядке подписки: Surface должен перепривязаться после того, как FocusTracker уже обновил membership. Порядок задаётся порядком конструирования в `HerdrExtension` и нигде не проверяется.

Предложение:

- **Selection — отражение фактического состояния, которое пишет только Manager.** Семантика: «множество Pane-редакторов, которые сейчас `activeTab` своей группы». Manager вызывает `select`/`deselect` из `reconcileTabBindings`. `openPane` создаёт или показывает вкладку напрямую, без петли через `selected`; Manager не подписан на события Selection.
- **Selection теряет зависимость от Herdr-событий.** Вместо собственной подписки на `pane.moved` у Selection появляется метод `move(previous, current)`: запрет на публичный `move` (`architecture.md:111`) был введён, чтобы Selection слушала Herdr сама, и больше не нужен. Selection становится чистой моделью без внешних зависимостей.
- **`pane.moved` слушает только Manager** и обрабатывает перемещение в явном порядке: ключ реестра → `selection.move(...)` (FocusTracker обновляет membership через событие `moved`) → `surface.move(currentPane)`. Surface перепривязывает подписку на FocusTracker внутри `move()`, когда membership уже обновлён. Порядок задан кодом одного метода, а не порядком подписки.
- **FocusTracker без изменений по смыслу**: Selection × фокус окна, немедленный текущий снимок, дедупликация. Это единый сигнал для Surface и будущих потребителей.
- **Surface отображает `FocusChangeEvent.reason` в `visibility`** (`editor-hidden` → `hidden`, `window-blurred` → `blurred`, `window-focused` → `focused`). Флаг «первый синхронный снимок» (`PaneTerminalSurface.ts:210-214`) не нужен: `intent = "wanted"` ставится только при **переходе** `visibility` в `focused` из другого значения. Немедленный снимок после перепривязки совпадает с текущим значением, значит перехода нет.

Ограничение «FocusTracker создаётся сразу после Selection» (`architecture.md:241`) сохраняется: одна строка композиции, приемлемо.

Когда появится подсветка в сайдбаре (Navigation) или сервис popup #26, для них вводится узкая capability в `src/capabilities/` над Selection или FocusTracker. Сейчас наружу ничего сверх композиции не экспортируется.

Поведенческое отличие: сейчас `select` публикуется до создания терминала, поэтому новый Surface сразу «в фокусе». После изменения Selection отражает вкладку только после её привязки (следующий `onDidChangeTabs`, обычно в том же тике UI), до этого Surface получает `hidden`. Клиент всё равно не стартует до `Pseudoterminal.open` с размерами. Проверить вручную (B3).

#### R5. Перемещение Pane — один владелец, одно поле

Сейчас `pane.moved` независимо слушают Selection, Manager и Surface; Manager запрещено что-либо сообщать Surface (`architecture.md:152-154`). Это ограничение было введено ради «независимости» и само породило перепривязку фокуса и зависимость от порядка подписки.

Предложение:

- `pane.moved` слушает только Manager (порядок обработки — в R4).
- Surface хранит `movedPane: HerdrPane | undefined`: устанавливается в `move()`, сбрасывается при **следующем** обновлении projection. Пока он задан, `paneTarget()` использует его, если в текущем snapshot нового ID ещё нет.
- Удаляются `lastPane`, `pendingMovedPaneId` и логика `previousPaneWasRemoved` (`:251-256`).

Обоснование: `architecture.md:292` сам говорит, что следующая connected projection — «обычное авторитетное обновление, а не move gate». Sessions после события инвалидирует и перезапрашивает snapshot, так что следующий snapshot уже содержит новый ID. Риск: если в полёте был snapshot, запрошенный до перемещения, произойдёт кратковременная заглушка и перезапуск клиента. Это редкий случай для редкой операции (cross-Space move). Решение D3.

#### R6. Observer failure — состояние, а не флаг

`observerFailed` сейчас сбрасывается почти на любое событие (`:292`, `:345`, `:593`), а на него смотрят `ensureObserver` и `renderProjection`.

Предложение: вариант `ObserverFailedClient` в `ClientState`. Правило: любой **внешний** факт (видимость, размеры, projection, move, ввод) переводит `observer-failed` в `idle` перед `converge()`; внутренние продолжения (completion, таймер, остановка attach) — нет. Так сохраняется «повтор при следующем релевантном переходе, без бесконечного цикла» (`architecture.md:284`) без отдельного флага.

#### R7. Семантика completion процессов — унифицировать

Сейчас observer отклоняет `completion` при ошибке и разрешает при остановке; attach всегда разрешает. Surface обрабатывает оба варианта раздельно.

Surface отбрасывает completion любого клиента, который уже не текущий. Значит, для текущего клиента любое завершение — «неожиданное». Причину процессы уже логируют сами (`HerdrPaneObserver.fail`, логи attach). Предложение: `completion: Promise<void>` всегда разрешается у обоих; Surface получает один обработчик на тип клиента. `rejectCompletion` и поле `failure` в observer становятся не нужны (лог уже есть в `fail()`).

#### R8. Эскалация остановки — общая функция

`HerdrPaneAttach.stopPty/waitForExit` и `HerdrPaneObserver.stopChild/waitForClose` реализуют одно и то же с разными API процесса. Предложение: локальная функция в `pane-editors/`:

```ts
async function stopWithEscalation(options: {
  exited: Promise<void>;
  signal(signal: "SIGTERM" | "SIGKILL"): void;
  termWaitMs: number;
  killWaitMs: number;
}): Promise<boolean>; // false — выход не подтверждён
```

на основе `settlesWithin(promise, ms)` из прототипа (`extension.js:50-62`). Тайминги (500/250, 1000/350) сохраняются.

#### R9. Откаты в конструкторах — удалить

См. §2.3 п.7. Включая откат в конструкторе `PaneEditorFocusTracker`.

#### R10. Заглушки — оставить, но вынести

Четыре текста (`architecture.md:300-309`) — продуктовый копирайт, не источник сложности. Оставить как есть, но перенести `projectionPlaceholder`, `observerFailurePlaceholder`, `paneName`, `nonEmpty` в чистый модуль вместе с `paneTarget()`. Сокращение текстов — отдельное продуктовое решение, не блокирует.

#### R11. Мёртвый путь #14

`src/features/terminal-surfaces/`, `src/infrastructure/herdr/cli/HerdrCliTerminalObserverFactory.ts`, `src/capabilities/terminalSurfaces/terminalObserver.ts` и тесты `test/extension/terminal-surfaces.test.ts`, `test/integration/terminal-surfaces/` больше не подключены к продакшену (`architecture.md:47`). Тикет #16 требует «leave no old controller path reachable». Держать мёртвый код «ради неизменных тестов» — это тесты мёртвого кода. Решение D4.

#### R12. Колесо мыши и правый клик — новая функциональность

Найдено в [`alternatives-discussion.md`](alternatives-discussion.md) (факты, эксперимент и отклонённые варианты — там). Кратко:

- **Колесо в программах без mouse reporting (bash, прочие shell-программы).** Attach-клиент включает alternate screen; xterm.js в alternate screen без mouse reporting безусловно превращает колесо в голые стрелки, поэтому колесо листает историю ввода. Исправление: расширение перехватывает настоящие ↑/↓ собственной командой (keybinding с context key, истинным только для Pane-редактора) и пишет их в attach напрямую с учётом DECCKM (`\eOA`/`\e[A`). Тогда любая голая стрелка в `handleInput` — это шаг колеса, и Surface заменяет её на SGR wheel (`\e[<64;col;rowM` / `\e[<65;col;rowM`). Attach сам разбирает SGR wheel (`attach_scroll_action`), и сервер листает scrollback Herdr или передаёт событие программе. Pi, Claude Code и Codex 0.157.1 сами запрашивают мышь, для них ничего не меняется.
- **Правый клик — не исправляется.** Спайк показал, что фильтр правой кнопки не помогает: выделение ломается и в обычном терминале VS Code с Pi или Claude Code без Herdr (контекстное меню забирает отпускание). Это поведение VS Code/xterm.js; оно проходит после blur→refocus.
- `mouse_capture = true` не включать.

**Механизм проверен спайком** ([`s7-arrow-spike-findings.md`](s7-arrow-spike-findings.md), ветка `spike/s7-arrows`). Собственная команда расширения не срабатывает: в сфокусированном терминале xterm.js пропускает клавишу в keybinding-сервис только для команд из списка `commandsToSkipShell`. Работает встроенная `workbench.action.terminal.sendSequence`: keybinding на ↑/↓ отправляет маркер `\e]herdr;arrow-up\a` / `\e]herdr;arrow-down\a`, и Surface в `handleInput` превращает его в настоящую стрелку с учётом DECCKM. When-условие: `terminalFocus && herdr.activeTerminalIsPane && !terminalFindFocused`. Не проверено: Option+click (`altClickMovesCursor`).

Размещение: своей команды нет. Keybinding объявляется в `package.json`, context key `herdr.activeTerminalIsPane` обновляет Manager (он знает терминалы всех Surface), трансляцию ввода и DECCKM ведёт Surface.

---

## 4. Целевой дизайн

### 4.1. Файлы и ответственность

```text
src/infrastructure/pane-editors/
  PaneEditorSelectionModel.ts     фактические activeTab Pane-редакторы; пишет только Manager;
                                  select / deselect / move / subscribe; без Herdr-зависимостей
  PaneEditorFocusTracker.ts       Selection × фокус окна; единый сигнал видимости (без изменений по смыслу)
  PaneTerminalSurfaceManager.ts   вкладки VS Code, реестр, move, создание/показ; пишет Selection;
                                  реализует PaneTerminalOpening; вызывает surface.move(pane)
  PaneTerminalSurface.ts          адаптер Pseudoterminal + факты + ClientState + converge()
  paneClientPolicy.ts             чистая desiredClient(); типы DesiredClient, AttachIntent, PaneEditorVisibility
  paneTarget.ts                   чистые paneTarget(), paneName(), тексты заглушек
  HerdrPaneObserver.ts            один observer-процесс (completion всегда resolve)
  HerdrPaneAttach.ts              один attach-процесс (completion всегда resolve)
  stopWithEscalation.ts           общая эскалация SIGTERM → SIGKILL
  HerdrPaneClientFactory.ts       без изменений
  PaneOutputSink.ts               без изменений
  index.ts                        экспорт только того, что нужно HerdrExtension
```

Колесо (R12) добавляется в S7.

Имена файлов — предложение; окончательные выбираются по конвенциям репозитория (в `pane-editors/` сейчас только PascalCase-файлы классов; для модулей функций выбрать имя по ответственности).

### 4.2. Типы

```ts
// paneClientPolicy.ts
export type PaneEditorVisibility = "hidden" | "blurred" | "focused";
export type AttachIntent = "wanted" | "displaced" | "failed";

export type PaneClientRequest = Readonly<{ sessionId: string; terminalId: string; columns: number; rows: number }>;

type NoClient = Readonly<{ kind: "none" }>;
type ObserveClient = Readonly<{ kind: "observe"; request: PaneClientRequest }>;
type AttachClient = Readonly<{ kind: "attach"; request: PaneClientRequest }>;
export type DesiredClient = NoClient | ObserveClient | AttachClient;

export function desiredClient(facts: Readonly<{
  target: PaneTarget;
  visibility: PaneEditorVisibility;
  dimensions: Readonly<{ columns: number; rows: number }> | undefined;
  intent: AttachIntent;
}>): DesiredClient {
  if (facts.target.kind !== "live" || facts.visibility === "hidden" || facts.dimensions === undefined) {
    return { kind: "none" };
  }
  const request = {
    sessionId: facts.target.sessionId,
    terminalId: facts.target.pane.terminalId,
    columns: facts.dimensions.columns,
    rows: facts.dimensions.rows,
  };
  if (facts.visibility === "focused" && facts.intent === "wanted") return { kind: "attach", request };
  return { kind: "observe", request };
}
```

```ts
// paneTarget.ts
type LivePaneTarget = Readonly<{ kind: "live"; sessionId: string; pane: HerdrPane }>;
type SuspendedPaneTarget = Readonly<{ kind: "suspended"; placeholder: string }>;
export type PaneTarget = LivePaneTarget | SuspendedPaneTarget;

export function paneTarget(
  projection: ActiveSessionProjectionState,
  identity: Readonly<{ sessionId: string; paneId: string }>,
  movedPane: HerdrPane | undefined,
): PaneTarget;
```

```ts
// PaneTerminalSurface.ts (приватные типы)
type IdleClient = Readonly<{ kind: "idle" }>;
type ObservingClient = { kind: "observing"; observer: PaneObserver; request: PaneClientRequest; resizeTimer: Timeout | undefined };
type ObserverFailedClient = Readonly<{ kind: "observer-failed" }>;
type AttachedClient = { kind: "attached"; attach: PaneAttach; request: PaneClientRequest };
type PaneClientState = IdleClient | ObservingClient | ObserverFailedClient | AttachedClient;

type ClosedHost = Readonly<{ kind: "closed" }>;
type OpenHost = Readonly<{ kind: "open"; dimensions: vscode.TerminalDimensions | undefined }>;
type PseudoterminalHost = ClosedHost | OpenHost;
```

### 4.3. Поля Surface после изменений

```text
host-ресурсы:  terminal, writeEmitter, nameEmitter, projectionSubscription, focusSubscription
факты:         identity {sessionId, paneId}, projection, movedPane, visibility, host, intent
состояние:     client: PaneClientState, stoppingAttach: Promise<void> | undefined
презентация:   visiblePlaceholder, paneNameVisible (+ publishedName по желанию)
lifecycle:     disposed
```

### 4.4. Поток управления

Правило: **обработчик события только обновляет факт и вызывает `converge()`**. Никакой логики выбора режима в обработчиках.

| Событие | Источник | Действие |
|---|---|---|
| focus event | FocusTracker | `v = visibilityOf(event.reason)`; если `v === visibility` → ничего; если `v === "focused"` → `intent = "wanted"`; `visibility = v`; сбросить `observer-failed`; `converge()` |
| `move(pane)` | Manager | `identity.paneId = pane.id`; `movedPane = pane`; перепривязать `focusSubscription` к новой identity (снимок совпадёт — перехода нет); опубликовать имя; `converge()` |
| projection changed | Sessions | `projection = p`; `movedPane = undefined`; сбросить `observer-failed`; опубликовать имя; `converge()` |
| `open(dimensions)` | VS Code | `host = open(dimensions)`; опубликовать имя; `converge()` |
| `setDimensions(d)` | VS Code | сохранить; если `attached` → `attach.resize` сразу; если `observing` → перезапустить таймер 120 мс; иначе сбросить `observer-failed` и `converge()` |
| таймер ресайза | внутр. | остановить observer, `client = idle`, `converge()` |
| `handleInput(data)` | VS Code | см. §4.6 |
| completion текущего attach | внутр. | `client = idle`; `intent = "displaced"`; `converge()` |
| completion текущего observer | внутр. | `client = observer-failed`; `converge()` (перерисует заглушку) |
| остановка attach завершилась | внутр. | `stoppingAttach = undefined`; `converge()` |
| `dispose()` | Manager | см. §4.7 |

Completion/таймер проверяют, что ресурс всё ещё текущий (`client.kind === "attached" && client.attach === attach`), и что Surface не `disposed`. Это единственное место проверки устаревания.

### 4.5. `converge()`

```ts
private converge(): void {
  if (this.disposed) return;
  const desired = desiredClient({ target: this.target(), visibility: this.visibility, dimensions: this.dimensions(), intent: this.intent });

  if (!this.satisfies(desired)) {
    this.releaseClient();                                   // синхронно: client = idle
    if (desired.kind === "observe") this.startObserver(desired.request);
    if (desired.kind === "attach" && this.stoppingAttach === undefined) this.startAttach(desired.request);
    // attach при stoppingAttach: ждём, converge() вызовется по завершении остановки
  }
  this.render();
}
```

`satisfies(desired)`:

- `none` ← `idle`;
- `observe` ← `observing` с тем же `sessionId`+`terminalId` (размеры меняет таймер) или `observer-failed`;
- `attach` ← `attached` с тем же `sessionId`+`terminalId`; если размеры отличаются — `attach.resize` и обновить `request`.

`releaseClient()`:

- `observing` → очистить таймер, `void observer.stop()`;
- `attached` → `stoppingAttach = attach.stop().then(() => { this.stoppingAttach = undefined; this.converge(); })`;
- затем `client = idle`.

`startAttach(request)`: `try { client = attached(create) } catch { log; intent = "failed"; client = idle; this.converge() }` — повторный `converge()` выберет observer. Предупреждение показывает не он, а `handleInput` (§4.6).

`render()`: заглушка = `target.placeholder`, если target `suspended`; иначе observer-failure-текст, если `client.kind === "observer-failed"` и `visibility !== "hidden"`; иначе ничего. Сравнение с `visiblePlaceholder`, как сейчас (`:267-288`).

### 4.6. Ввод

```ts
private handleInput(data: string): void {
  if (this.client.kind === "attached") { this.client.attach.sendInput(data); return; }
  if (this.visibility !== "focused" || this.intent === "failed") return;
  this.intent = "wanted";
  this.converge();
  if (this.client.kind === "attached") this.client.attach.sendInput(data);
  else if (this.intent === "failed") void vscode.window.showWarningMessage("Could not attach to this Herdr Pane. See the Herdr output for details.");
}
```

Если attach ждёт `stoppingAttach`, ввод теряется — как и сейчас (`ensureAttach` при `attachStartWait` выходит без записи). Гарантии первого ввода — #27.

### 4.7. Dispose

```ts
dispose(): void {
  if (this.disposed) return;
  this.disposed = true;
  this.releaseClient();          // stoppingAttach.then(converge) упрётся в disposed
  this.projectionSubscription.dispose();
  this.focusSubscription.dispose();
  this.terminal.dispose();
  this.writeEmitter.dispose();
  this.nameEmitter.dispose();
}
```

### 4.8. Manager

```text
constructor: подписки на onDidChangeTabs и sessionEvents "pane.moved"; на события Selection не подписан
openPane(request):
  existing → если не activeTab — reveal(); reconcile()
  иначе   → create в activeTabGroup.viewColumn, reveal(); reconcile()
onDidChangeTabs(event):
  закрытые привязанные вкладки → удалить из реестра, selection.deselect, dispose Surface; reconcile()
pane.moved (единственный подписчик в pane-editors/):
  переключить ключ реестра → selection.move(previous, current) → surface.move(currentPane)
reconcile():
  непривязанным найти вкладку по временному имени; при первой привязке showPaneName()
  привязанные, чья вкладка исчезла, → tab = undefined
  для каждого Surface: bound && activeTab в какой-то группе ? selection.select : selection.deselect
```

Фокус окна Manager не отслеживает: это делает FocusTracker. Selection идемпотентна, повторные `select`/`deselect` ничего не публикуют.

---

## 5. Изменения наблюдаемого поведения

| # | Было | Станет | Оценка |
|---|---|---|---|
| B1 | После ошибки spawn attach ресайз окна вызывает повторную попытку | Повтор только после нового перехода фокуса | Лучше: нет скрытых попыток |
| B2 | После ошибки spawn attach каждый ввод повторяет попытку (предупреждение подавляется контекстом) | Ввод не повторяет попытку до нового перехода фокуса | Эквивалентно для пользователя, проще |
| B3 | Новый Surface «в фокусе» ещё до привязки вкладки (Selection = желаемое) | `hidden` до привязки вкладки (Selection = фактическое) | Клиент и так ждёт `open` с размерами; проверить вручную |
| B4 | После move, при устаревшем snapshot в полёте, клиент продолжает работать | Возможна краткая заглушка и перезапуск клиента | Редкий случай; решение D3 |
| B5 | `terminal.dispose()` не вызывается, если VS Code сам закрыл вкладку | Вызывается всегда | Проверить, что без ошибок |
| B6 | Колесо в bash листает историю ввода | Колесо листает scrollback Herdr | Новая функциональность (S7) |
| B7 | ↑/↓ в Pane-терминале уходят в xterm.js напрямую | ↑/↓ идут через `sendSequence` с маркером; в других терминалах и редакторах без изменений | Проверено спайком |

Остальное поведение (таблица режимов, тайминги, no-fight-back, мгновенный ресайз attach, debounce observer, заглушки, имя вкладки) не меняется.

---

## 6. Принятые решения

- **D1.** Принято: модель R3 (синхронный `converge()` + одно `stoppingAttach`), а не полная очередь прототипа.
- **D2.** Отменено решением D-A2: Selection и FocusTracker остаются; направление потока меняется по R4.
- **D3.** Принято: `movedPane` до следующей projection, B4 допустим (R5).
- **D4.** Принято: мёртвый путь #14 удаляется вместе с его тестами (S8).
- **D5.** Выполнено: композиция закоммичена как база.
- **D6.** Принято: `architecture.md` получает раздел «Supersedes» сразу (S0), финальная правка — в S8.
- **D-A1.** Текущий подход (Pseudoterminal + `node-pty` attach + observer) сохраняется; альтернативы отклонены.
- **D-A2.** Popup #26 — обязательная часть основного сценария; Selection и FocusTracker — единый сигнал выбора и фокуса.
- **D-A3.** Изменений в Herdr не будет.

---

## 7. План реализации по слайсам

Общие правила для исполнителя:

- Автотесты не писать (отдельно согласуемая фаза #16). Существующие тесты не менять, кроме S8.
- Каждый слайс завершается `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`. Тесты (`npm test`) запускаются для контроля, что ничего вне слайса не сломано.
- Не расширять объём слайса. Нашёл проблему вне слайса — записать в отчёт, не чинить.
- Не добавлять защит от невозможного: откатов в конструкторах, проверок `disposed` в синхронных путях после dispose, повторных `catch`.
- Отчёт: изменённые файлы, что удалено, результат проверок, отклонения от этого документа и почему.

### S0. Документ — выполнено

В начало `architecture.md` добавлен раздел «Superseded by the simplification plan» со ссылками на этот аудит и [`alternatives-discussion.md`](alternatives-discussion.md).

### S1. Чистка без изменения поведения

Файлы: `PaneTerminalSurface.ts`, `PaneTerminalSurfaceManager.ts`, `PaneEditorFocusTracker.ts`, `HerdrPaneAttach.ts`, `HerdrPaneObserver.ts`.

- Удалить откаты в конструкторах (§2.3 п.7), кроме `HerdrExtension`.
- Удалить `closedByHost` (B5).
- Удалить проверки `disposed` в синхронных путях (§2.3 п.4); оставить в `dispose()` и асинхронных продолжениях.
- Удалить `resource !== undefined` в sink/completion (§2.3 п.2).
- Удалить повторные `catch` вокруг `stop()` в Surface (§2.3 п.5).
- Удалить `Promise.resolve().then(...)` в `stop()` процессов (§2.3 п.6).
- Слить `handleObserverCompletion`/`handleObserverFailure`.

Проверка ревьюера: диф только удаляет или сливает; таблица режимов и тайминги не тронуты.

### S2. Процессы: общая эскалация и единая completion

Файлы: `HerdrPaneAttach.ts`, `HerdrPaneObserver.ts`, новый модуль эскалации, `PaneTerminalSurface.ts` (только обработчики completion).

- Вынести `stopWithEscalation` + `settlesWithin` (R8). Тайминги прежние.
- `completion` observer всегда resolve (R7); убрать `rejectCompletion` и `failure`, лог причины остаётся в `fail()`.
- В Surface — один обработчик completion на тип клиента.

Проверка ревьюера: SIGTERM/SIGKILL отправляются в том же порядке с теми же задержками; `stop()` идемпотентен и возвращает один промис; вывод отключается синхронно при `stop()`.

### S3. Направление потока: Manager пишет Selection и владеет move

Файлы: `PaneTerminalSurfaceManager.ts`, `PaneEditorSelectionModel.ts`, `PaneTerminalSurface.ts` (только move и обработчик фокуса), `HerdrExtension.ts`.

- Selection: убрать зависимость от `HerdrSessionEventSource` и подписку на `pane.moved`; добавить `move(previous, current)` с прежней семантикой (если previous выбран — заменить и опубликовать `moved`, иначе ничего).
- Manager: не подписываться на `selected`; `openPane` создаёт или показывает вкладку напрямую; `reconcileTabBindings` пишет `select`/`deselect` по фактическому `activeTab`; при закрытии вкладки — `deselect`. На `pane.moved`: ключ реестра → `selection.move` → `surface.move(currentPane)`.
- Surface: убрать `moveSubscription` и `handlePaneMoved`; добавить публичный `move(pane)`, который меняет identity, запоминает Pane, публикует имя и перепривязывает подписку на FocusTracker. Флаг «первого снимка» заменить правилом «intent = true только при переходе в `window-focused` из другого reason».
- Интерфейс `PaneTerminalSurface` расширить `move`; фабрика — без `sessionEvents`.
- `HerdrExtension`: Selection создаётся без Session-событий; порядок «FocusTracker сразу после Selection» сохраняется.

Проверка ревьюера: `pane.moved` в `pane-editors/` слушает только Manager, и порядок «реестр → Selection → Surface» задан одним методом; Manager не подписан на события Selection; Selection не импортирует `@capabilities/sessions`; при move без смены `terminal_id` клиент не перезапускается и intent не сбрасывается; таблица режимов не изменилась; B3 зафиксировано.

### S4. Политика attach: `AttachIntent` вместо флагов и контекстов

Файл: `PaneTerminalSurface.ts`.

- `attachIntent: boolean` → `AttachIntent` (R1).
- Удалить `failedAttachFor`, `warnedAttachFailurePeriod`, `AttachRequestContext`, `AttachWarningPeriodContext`, `isCurrentAttachEligibility`, `warnForCurrentLocalAttachFailure`, `updateAttachWarningPeriod`, `resetAttachWarningPeriod` и четыре свободные функции.
- Удалить `ClientReconciliation`; ввод по §4.6.

Проверка ревьюера: ошибка spawn при вводе → одно предупреждение; последующий ввод до перехода фокуса не вызывает spawn; неожиданный выход attach → `displaced`, ввод восстанавливает; переход в focused → `wanted`.

### S5. `ClientState` + `desiredClient` + `converge`

Файлы: `PaneTerminalSurface.ts`, новый модуль политики.

- Ввести `PaneClientState` и `PseudoterminalHost` (§4.2); удалить `observer`, `attach`, `observerFailed`, `observerResizeTimer`, `attachStartWait`, `opened`, `dimensions` как отдельные поля.
- `desiredClient()` — чистая функция без `vscode`.
- `converge()`, `satisfies()`, `releaseClient()` по §4.5; `stoppingAttach` — единственный промис.
- Удалить `reconcileClients`, `reconcileAfterObserverRetryOpportunity`, `ensureObserver`, `ensureAttach`, `waitForStoppingAttach`, `resumeAfterStoppingAttach`, `currentFocusedPaneRequest`.

Проверка ревьюера: каждое событие из §4.4 делает только «обновить факт → converge()»; в Surface нет `await`; нет полей-промисов кроме `stoppingAttach`; два attach не могут существовать одновременно (разобрать путь blur → focus при медленной остановке); observer-failed не вызывает цикл перезапусков.

### S6. `paneTarget` и упрощение move

Файлы: `PaneTerminalSurface.ts`, новый модуль target/презентации.

- Вынести `paneName`, `nonEmpty`, тексты заглушек, `paneTarget()` в чистый модуль без `vscode`.
- `lastPane` + `pendingMovedPaneId` → `movedPane` (R5, по D3).

Проверка ревьюера: move не перезапускает клиент при неизменном `terminal_id`; следующая projection очищает `movedPane`; имя вкладки сохраняется, когда активна другая Session.

### S7. Колесо мыши (R12)

Перенос спайка (ветка `spike/s7-arrows`) без отладочного логирования и без фильтра правой кнопки. Файлы: `package.json` (contributes.keybindings), `PaneTerminalSurface.ts`, `PaneTerminalSurfaceManager.ts`.

- Два keybinding на ↑/↓ → `workbench.action.terminal.sendSequence` с маркерами, when-условие из R12.
- Surface: весь чанк, равный маркеру, → `\e[A`/`\e[B` или `\eOA`/`\eOB` при DECCKM; чанк только из голых стрелок → SGR wheel `\e[<64;1;1M` / `\e[<65;1;1M`. DECCKM отслеживается в выводе attach (`\e[?1h` / `\e[?1l`) в пределах чанка.
- Surface отдаёт свой `vscode.Terminal` в интерфейсе; Manager ставит `herdr.activeTerminalIsPane` через `setContext` при конструировании, на `onDidChangeActiveTerminal` и после изменения вкладок.

Проверка ревьюера: нет своей команды и `registerCommand`; маркер сравнивается только с целым чанком; нет фильтра правой кнопки и логирования ввода. Ручная проверка — уже выполнена в спайке; на финальной проверке повторить bash + колесо, ↑/↓, обычный терминал, редактор, поиск в терминале.

### S8. Мёртвый путь #14 и документы

- По D4: удалить `src/features/terminal-surfaces/`, `HerdrCliTerminalObserverFactory.ts`, `capabilities/terminalSurfaces/terminalObserver.ts`, их экспорты и тесты `test/extension/terminal-surfaces.test.ts`, `test/integration/terminal-surfaces/`, связанные fixtures, если они больше никем не используются.
- Переписать соответствующие разделы `architecture.md` под итоговый дизайн, обновить `progress.md`, при необходимости — «Current responsibility map» в `code-architecture.md`.

### Ручная проверка после S5–S6 (человек)

В Extension Development Host на одноразовом Pane: focus → attach; blur → observer; скрытая вкладка → ничего; быстрый blur/focus несколько раз подряд (K8); две группы редакторов; takeover из Ghostty → observer без перетягивания, ввод в VS Code забирает обратно; ресайз в обоих режимах; закрытие вкладки → Pane жив; смена активной Session → заглушка и возврат.

---

## 8. Ожидаемый результат

| | Сейчас | После |
|---|---|---|
| `PaneTerminalSurface.ts` | 714 строк, 27 полей | ~250–300 строк, ~14 полей, 2 boolean (`disposed`, `paneNameVisible`) |
| Промисы в полях Surface | 2 | 1 |
| `await` в Surface | 1 (скрытый в цепочке) | 0 |
| Подписчики `pane.moved` в `pane-editors/` | 3 (корректность зависит от порядка подписки) | 1 (порядок задан кодом) |
| Selection | желаемое и фактическое одновременно, слушает Herdr | только фактическое, пишет Manager |
| Место, где записана таблица режимов | размазана по `reconcileClients` | одна чистая функция |

Цифры — оценка, не обязательство; критерий готовности качественный: **любой метод Surface читается без знания значений остальных полей**.
