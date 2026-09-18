# Issue #24: аудит `vscode-herdr-switcher` и новых версий Herdr

**Дата исследования:** 2026-09-18  
**Исходная задача:** [St0necrusher/vscode-herdr-extension#24](https://github.com/St0necrusher/vscode-herdr-extension/issues/24)  
**Предыдущий baseline:** [`issue-11-bootstrap-gate.md`](./issue-11-bootstrap-gate.md)

## Краткий вывод

`vscode-herdr-switcher` использует практичную модель: события служат сигналом повторно получить полный snapshot. Исследование подтвердило, что Herdr до `v0.9.1` не даёт формального cursor/overflow/incarnation контракта, но владелец решил, что этот редкий недетектируемый случай не должен блокировать #11.

Принятое решение для #11: подписаться до первого snapshot, трактовать подходящие события только как invalidation signal, объединять близкие invalidations и последовательно заменять всю локальную projection новым snapshot. Event payload queue и incremental reducer не входят в первую реализацию. Они остаются возможной оптимизацией только после измеренного performance-проблемы. Аналогично первая реализация полностью публикует новый snapshot без вычисления diff; diff добавляется позднее только при подтверждённой необходимости.

После Herdr `v0.9.0` проверены все теги-потомки, включая стабильный `v0.9.1`. Ни один из них не добавил cursor/atomic boundary, gap detection, server-incarnation identity, глобальную agent-status подписку для будущих Panes или новую connection topology. Это зафиксированное ограничение, а не blocker для выбранного product contract.

## В чём именно проблема

Клиенту нужно получить начальное состояние Herdr и затем поддерживать его актуальным по событиям. Наивная последовательность выглядит так:

1. подключиться к событиям;
2. получить snapshot;
3. применить накопившиеся события поверх snapshot;
4. дальше обновлять модель только событиями.

Для гарантированной корректности клиент должен уметь доказать, что snapshot и события образуют одну непрерывную историю. В текущем протоколе такого доказательства нет:

- обычный request и subscription используют разные физические соединения;
- event hub хранит лишь 512 событий и молча удаляет старые;
- wire events не содержат cursor/sequence, а overflow не сигнализируется;
- разные соединения нельзя связать с одной инкарнацией сервера;
- `pane.agent_status_changed` требует конкретный `pane_id`, поэтому одна заранее открытая подписка не покрывает будущие panes.

### Почему это продуктовая проблема

Без этих гарантий extension может считать локальную модель актуальной, хотя она уже разошлась с Herdr. Возможные проявления:

- созданный или закрытый pane остаётся отсутствующим либо «призрачным» в UI;
- Agent продолжает отображаться как `working`, хотя уже `blocked` или `done`;
- статус нового pane не отслеживается до перестройки subscription;
- после быстрого server replacement snapshot может относиться к новому процессу, а stream — к старому;
- после потери более 512 событий клиент не получает ни ошибки, ни сигнала resnapshot.

Идемпотентность reducer-а здесь не помогает: она защищает от повторной доставки, но не восстанавливает событие, которое вообще не пришло.

## Аудит `vscode-herdr-switcher`

### Проверенный срез

- Repository: [`statiolake/vscode-herdr-switcher`](https://github.com/statiolake/vscode-herdr-switcher)
- Commit: [`622c9632f4c63d50cc2d6509681ff6bf66108de6`](https://github.com/statiolake/vscode-herdr-switcher/tree/622c9632f4c63d50cc2d6509681ff6bf66108de6)
- Release commit message: `Release 0.2.1`

### Реальная модель синхронизации

`HerdrClient.snapshot()` запускает отдельный `herdr api snapshot`. Event subscriber открывает Unix socket и отправляет один `events.subscribe`. Полученное событие не применяется как полноценная запись журнала: controller коалесцирует события и инициирует новый snapshot refresh. Даже при работающем stream остаётся периодический refresh с минимальным интервалом 5 секунд; при недоступном stream используется fallback polling.

Источники: [`herdrClient.ts` L10–22, L39–56](https://github.com/statiolake/vscode-herdr-switcher/blob/622c9632f4c63d50cc2d6509681ff6bf66108de6/src/herdrClient.ts#L10-L56), [`herdrEvents.ts` L117–190](https://github.com/statiolake/vscode-herdr-switcher/blob/622c9632f4c63d50cc2d6509681ff6bf66108de6/src/herdrEvents.ts#L117-L190), [`extension.ts` L1252–1286](https://github.com/statiolake/vscode-herdr-switcher/blob/622c9632f4c63d50cc2d6509681ff6bf66108de6/src/extension.ts#L1252-L1286).

| Blocker #24 | Поведение switcher | Вердикт |
|---|---|---|
| Один request на connection | Stream socket содержит только один `events.subscribe`; изменение подписок выполняется через disconnect и новое соединение. [`herdrEvents.ts` L58–94](https://github.com/statiolake/vscode-herdr-switcher/blob/622c9632f4c63d50cc2d6509681ff6bf66108de6/src/herdrEvents.ts#L58-L94) | Корректно обходит topology, но не меняет контракт. |
| Overflow 512 / нет cursor | Event record не содержит sequence/cursor/overflow; обработчик просто вызывает callback. Периодический snapshot позднее исправляет state. [`herdrEvents.ts` L5–10, L158–181](https://github.com/statiolake/vscode-herdr-switcher/blob/622c9632f4c63d50cc2d6509681ff6bf66108de6/src/herdrEvents.ts#L5-L10) | Потеря не обнаруживается; достигается только eventual recovery. |
| Нет server-incarnation identity | Status и snapshot содержат version/protocol/session, но не incarnation ID. Restart замечается косвенно по close/error. [`herdrClient.ts` L10–22](https://github.com/statiolake/vscode-herdr-switcher/blob/622c9632f4c63d50cc2d6509681ff6bf66108de6/src/herdrClient.ts#L10-L22), [`types.ts` L73–84](https://github.com/statiolake/vscode-herdr-switcher/blob/622c9632f4c63d50cc2d6509681ff6bf66108de6/src/types.ts#L73-L84), [`herdrEvents.ts` L200–237](https://github.com/statiolake/vscode-herdr-switcher/blob/622c9632f4c63d50cc2d6509681ff6bf66108de6/src/herdrEvents.ts#L200-L237) | Нет fencing или доказательства общей инкарнации. |
| Future-pane agent status | Подписки строятся для текущих pane IDs. После snapshot с изменённым набором IDs stream пересоздаётся; `pane.created` и `pane.agent_detected` помогают инициировать refresh. [`extension.ts` L248–261, L1227–1246](https://github.com/statiolake/vscode-herdr-switcher/blob/622c9632f4c63d50cc2d6509681ff6bf66108de6/src/extension.ts#L248-L261), [`herdrEvents.test.ts` L4–17](https://github.com/statiolake/vscode-herdr-switcher/blob/622c9632f4c63d50cc2d6509681ff6bf66108de6/src/herdrEvents.test.ts#L4-L17) | Практическое eventual coverage, но есть неатомарное окно до resubscribe. |

### Что из этого можно переиспользовать

Можно переиспользовать идею **events-as-invalidation**:

- snapshot является источником текущего состояния;
- event stream ускоряет refresh, но не считается бездырочным журналом;
- периодический snapshot обеспечивает bounded eventual convergence;
- изменение множества panes пересобирает pane-specific subscriptions.

Но это требует явного изменения product contract #11: вместо «локальная projection всегда authoritative после bootstrap» получится «UI может быть устаревшим до следующего refresh». Сам факт, что другой extension так работает, не делает race документированной гарантией Herdr.

## Проверка tagged-релизов Herdr после `v0.9.0`

### Проверенные версии

| Tag | Commit | Результат |
|---|---|---|
| `preview-2026-09-08-62431dbd033b` | `62431dbd033bf1be2fe87fbc526df28084214e49` | Проверяемые protocol seams без изменений |
| `preview-2026-09-16-3f78f172d9f9` | `3f78f172d9f9fe1a9422334c5ae03cd5ac685ebd` | Без изменений |
| `preview-2026-09-16-2c29fb29e302` | `2c29fb29e30220bc48d783af90ba8f53b81fd96c` | Без изменений |
| `v0.9.1` | `065ef9d6a531c49fb8bee7e818ef837065b21ee9` | Без изменений; в server dispatch добавлен только не относящийся к gate метод `pane.link.resolve` |

Ключевые файлы event hub, subscriptions и protocol schema имеют одинаковые blob OID от `v0.9.0` до `v0.9.1`.

### Состояние контракта в `v0.9.1`

1. **Нет публичного cursor или atomic boundary.** `SessionSnapshot`, event envelopes и пустой `SubscriptionStarted` не содержат cursor/sequence. Внутренний `event_start_sequence` существует, но не связывает публично отдельный snapshot с stream: [`session.rs` L8–23](https://github.com/herdrdev/herdr/blob/065ef9d6a531c49fb8bee7e818ef837065b21ee9/src/api/schema/session.rs#L8-L23), [`events.rs` L361–389](https://github.com/herdrdev/herdr/blob/065ef9d6a531c49fb8bee7e818ef837065b21ee9/src/api/schema/events.rs#L361-L389), [`response.rs` L211–217](https://github.com/herdrdev/herdr/blob/065ef9d6a531c49fb8bee7e818ef837065b21ee9/src/api/schema/response.rs#L211-L217), [`server.rs` L701–739](https://github.com/herdrdev/herdr/blob/065ef9d6a531c49fb8bee7e818ef837065b21ee9/src/api/server.rs#L701-L739).

2. **Overflow остаётся тихим.** Hub хранит максимум 512 событий и удаляет старые; `events_after` не сообщает oldest sequence или gap: [`event_hub.rs` L12–45](https://github.com/herdrdev/herdr/blob/065ef9d6a531c49fb8bee7e818ef837065b21ee9/src/api/event_hub.rs#L12-L45), [`subscriptions.rs` L282–291](https://github.com/herdrdev/herdr/blob/065ef9d6a531c49fb8bee7e818ef837065b21ee9/src/api/subscriptions.rs#L282-L291).

3. **Нет server-incarnation identity.** `Pong` и `ServerCapabilities` её не содержат. Внутренняя `SocketFileIdentity` клиенту не выдаётся: [`response.rs` L42–53](https://github.com/herdrdev/herdr/blob/065ef9d6a531c49fb8bee7e818ef837065b21ee9/src/api/schema/response.rs#L42-L53), [`server.rs` L34–56](https://github.com/herdrdev/herdr/blob/065ef9d6a531c49fb8bee7e818ef837065b21ee9/src/api/server.rs#L34-L56).

4. **Нет global future-pane status stream.** `pane.agent_status_changed` требует конкретный `pane_id`; runtime фильтрует события по нему: [`events.rs` L63–84](https://github.com/herdrdev/herdr/blob/065ef9d6a531c49fb8bee7e818ef837065b21ee9/src/api/schema/events.rs#L63-L84), [`subscriptions.rs` L339–390](https://github.com/herdrdev/herdr/blob/065ef9d6a531c49fb8bee7e818ef837065b21ee9/src/api/subscriptions.rs#L339-L390).

5. **Connection topology не изменилась.** Каждый обычный request открывает отдельное соединение и читает один response; server читает один initial request, после чего subscription connection переходит в stream loop: [`client.rs` L50–99](https://github.com/herdrdev/herdr/blob/065ef9d6a531c49fb8bee7e818ef837065b21ee9/src/api/client.rs#L50-L99), [`server.rs` L168–237](https://github.com/herdrdev/herdr/blob/065ef9d6a531c49fb8bee7e818ef837065b21ee9/src/api/server.rs#L168-L237), [`server.rs` L734–763](https://github.com/herdrdev/herdr/blob/065ef9d6a531c49fb8bee7e818ef837065b21ee9/src/api/server.rs#L734-L763).

## Ограниченный локальный performance probe

На установленном Herdr был измерен read-only вызов `herdr api snapshot` без вывода содержимого snapshot. Текущая пустая Herdr Session вернула 7 250 байт; один вызов занял меньше разрешения `time` в 10 мс, а 20 последовательных вызовов заняли 0,12 секунды (около 6 мс на CLI-вызов). Максимальный RSS отдельного CLI-процесса составил около 4,9 МБ.

Этот probe не является upper bound: Session не содержала Spaces, Herdr Tabs, Panes, layouts или Agents. Он только показывает, что базовый snapshot мал и быстр на проверенной машине. Snapshot не содержит terminal output/scrollback, поэтому нагрузка растёт с числом структурных records, а не с объёмом вывода терминалов. Реализация должна измеряться на наполненной Session до добавления diff или event queue.

## Решение для issue #24

Владелец принял следующий contract для #11:

1. Snapshot — единственный источник полной локальной projection активной Herdr Session.
2. Subscription открывается и подтверждается до первого snapshot.
3. Подходящий event не применяется как patch. Он только помечает projection как dirty.
4. Один последовательный reconciliation loop загружает полный snapshot. Если event пришёл во время запроса, loop делает ещё один проход после завершения текущего.
5. Близкие events объединяются debounce; одновременно выполняется не больше одного snapshot request.
6. Первая реализация заменяет projection целиком и полностью обновляет зависимые Views. Она не вычисляет diff.
7. Высокочастотные terminal-output/scroll events не входят в эту subscription. Терминальный поток использует отдельный attach/control path к конкретному Pane.
8. Event payload queue, incremental reducer и snapshot diff не добавляются заранее. К ним можно вернуться, если измерения покажут существенную нагрузку, лишние обновления или плохой UX.
9. Тихий overflow внутреннего 512-event hub остаётся принятым маловероятным риском. Он должен быть явно известен, но не блокирует #11.

Это решение очищает research gate #24 для выбранного product contract. Оно не утверждает, что Herdr предоставляет универсальную loss-free event guarantee.

## Граница уверенности и недостающие доказательства

- Проверка новых версий охватывает tagged descendants `v0.9.0` на момент исследования, а не незатегированный HEAD.
- Сборка и live probe не запускались. Они не смогли бы доказать универсальную loss freedom, но могли бы проверить конкретные runtime interleavings.
- Отсутствие `cursor`, `overflow` и `sequence` в switcher установлено targeted search и проверкой relevant types/handlers; это не формальное доказательство отсутствия любой косвенной эвристики во всём history.
- `vscode-herdr-switcher` демонстрирует implementation policy, а не серверную гарантию.

## Primary-source inventory

- [`statiolake/vscode-herdr-switcher` at `622c963`](https://github.com/statiolake/vscode-herdr-switcher/tree/622c9632f4c63d50cc2d6509681ff6bf66108de6) — comparable client implementation.
- [`herdrdev/herdr` `v0.9.1` at `065ef9d`](https://github.com/herdrdev/herdr/tree/065ef9d6a531c49fb8bee7e818ef837065b21ee9) — latest inspected stable tagged source.
- [`herdrdev/herdr` `v0.9.0` at `b99002a`](https://github.com/herdrdev/herdr/tree/b99002ac99b09e00b4ca692436cb15a6b0d676f1) — established baseline.
- [`docs/research/issue-11-bootstrap-gate.md`](./issue-11-bootstrap-gate.md) — prior version-specific audit and gate definition.
