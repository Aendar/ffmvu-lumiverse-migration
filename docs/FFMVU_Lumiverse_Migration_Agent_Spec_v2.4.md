# FFMVU → Lumiverse / Spindle
## Полное техническое ТЗ и implementation guide для coding-агента

**Статус:** v2.4 — final self-contained projection/base hardening перед coding phase  
**Дата верификации Lumiverse:** 2026-09-04  
**Цель:** перенести текущий FF + MVU RP-стек из SillyTavern/TavernHelper в Lumiverse без функциональных потерь и одновременно убрать ST-специфичную инфраструктуру, которая больше не нужна.

**v2.4 correction scope:** v2.4 сохраняет архитектурную цель v2/v2.1/v2.2/v2.3 и закрывает последний self-contained-base gap: `fork`/snapshot-import state может быть уже post-consumption, тогда как exact next MODEL_STATE принадлежит pre-consumption projection source в parent/legacy storage. BaseSnapshot теперь умеет нести редкий immutable `ProjectionSeed`, поэтому child/import base не зависит от parent storage и сохраняет первый post-bootstrap MODEL_STATE byte-for-byte. Одновременно формализованы seed provenance, attempt source-kind, restart materialization, degraded Tier-1 import без exact prompt-view evidence и regression gates. Если более ранняя версия противоречит v2.4, v2.4 является источником истины.

**Правило epistemic status:** новый `[LUMI]` ставить только на подтверждённое docs/types/source поведение. Если correctness зависит от end-to-end host semantics, даже при наличии отдельных подтверждённых API surfaces, требование остаётся `[VERIFY]` до integration test. Архитектура обязана иметь безопасный fallback для незакрытого spike, а не превращать предположение в факт.

---

## 0. Контракт для агента

Это не обзор и не brainstorm. Использовать документ как технический контракт.

Агент обязан:

1. Сначала сохранить фактическое поведение текущего стека, затем менять платформенный слой.
2. Не переписывать платформонезависимую механику только ради «чистоты».
3. Для lifecycle/API Lumiverse сверяться с актуальными `lumiverse-spindle-types`, Developer Docs и при необходимости исходниками.
4. Не считать наличие аналога в Lumi само собой разумеющимся.
5. Все state-mutations проводить через один backend `StateService`.
6. Не использовать Lumiverse chat variables или message metadata как authoritative branch/swipe-local FFMVU state.
7. Не хранить полный `stat_data` в каждом сообщении.
8. Не применять model JSONPatch по partial stream.
9. Не делать silent rebase при конфликте GUI/generation.
10. Не выдавать неизвестное поведение Lumi за подтверждённое: пункты `[VERIFY]` сначала прототипировать.
11. Сначала добиться корректности Core/state/lifecycle, потом переносить GUI и preset polish.
12. Numeric Lumi `swipeId` не считать persistent identity; использовать internal `VariantId`.
13. Сохранённый assistant response без `AnchorRecord` считать unreconciled, а не no-op.
14. Replay каждого historical node проводить его записанным `reducerVersion`.
15. Authoritative persistence scope всегда включает `userId + chatId`.
16. Не полагаться на недокументированную atomicity `storage.move()`/single manifest overwrite; authoritative `spindle.userStorage` вообще не требует наличия `move()`/`stat()`.
17. Один assistant `VariantId` может иметь **несколько generation attempts**; это обязательно учитывать для `continue`/append semantics. Нельзя перезаписывать forensic evidence первого attempt последующим.
18. Active transcript head — derived result `HeadResolver`, а не authoritative field durable store manifest/revision. Swipe navigation не является state transaction.
19. Immutable store revisions обязаны иметь collision-safe identity и explicit predecessor/hash/transaction linkage; одинаковый numeric revision у competing siblings не должен приводить к overwrite одного пути.
20. Projection-consumption bookkeeping не может менять model parent между freeze projection и model commit. Ordering должен быть explicit и протестирован.
21. Missing frozen legacy source — hard parity gate для функций этого source; отсутствие файла нельзя компенсировать догадками по ТЗ.
22. Post-render evidence lock — semantic model contract, если отдельный deterministic backend validator не доказан. Не строить псевдо-validator по ключевым словам prose.
23. Historical reducer implementation владеет frozen defaults/constants/normalization semantics и не импортирует mutable latest-version defaults.
24. До production доказать backup/restore authoritative FFMVU storage. Если native Lumi data portability не переносит `userStorage`, extension обязан предоставить собственный FFMVU export/import.
25. Если reliable generation correlation для двух concurrent requests одного `StateScope` не доказан, разрешена максимум одна pending non-dryRun generation на scope; вторую cancel/queue.
26. Projection, которую реально получает конкретный model attempt, freeze-ится вместе с его base state; late interceptor не имеет права подменять её более новым scope cache.
27. Model patch authorization вычисляется только из frozen projection/authorization view этого attempt, а не из current projection на commit-time.
28. Если stopped generation сохраняет durable assistant variant, такой variant не считать `no_patch`: до explicit reconciliation он `transcript_dirty/stopped_uncommitted` и не может быть здоровым stateful parent.
29. Historical `projectionVersion` обязан иметь frozen implementation в `ProjectionRegistry`, аналогично `ReducerRegistry`; hash без воспроизводимой projection semantics недостаточен.
30. Immutable `ChatStoreRevision` является transaction commit point. Semantic node artifact, не referenced ни одной committed StoreRevision, остаётся uncommitted orphan и автоматически не resurrect-ится.
31. Для первой parity-версии projection-consumption сохраняется explicit system commit в gameplay DAG после model/no-patch result; перенос bookkeeping вне DAG — только отдельный post-parity ADR.
32. Первый production release по умолчанию user-scoped. Operator-scoped enablement — отдельный gate после доказанного user correlation.
33. Legacy migration имеет два явных уровня: Functional Continuity (trusted latest state -> legacy-import base) и Full Historical Reconstruction только при достаточном evidence.
34. Machine-envelope cleanup, меняющий canonical stored content, по умолчанию разрешает host chunk rebuild; `skipChunkRebuild` нельзя использовать, если это оставит retrieval неэквивалентным transcript.
35. Отсутствующий exact StatusMenu блокирует только StatusMenu-dependent parity work, а не Core/EventStore/GameStart implementation.
36. `MODEL_STATE` transport обязан иметь semantic sentinel fallback на случай одновременного fail-open Context Handler и late interceptor; unresolved sentinel никогда не трактуется моделью как валидный state.
37. `baseNodeId/baseStateHash` и projection-delivery provenance — разные domains. Обычно projection имеет `sourceKind="node"` и тот же source, что patch base, но projection-consumption допускает `base=C2`, `node projectionSource=P1`, а первый self-contained fork/import attempt — `sourceKind="base-seed"`.
38. Legacy-compatible projection consumption обязан строить **next projection до consumption**, затем закрепить её `ProjectionBinding` на system consumption commit; restart не имеет права перестроить её из уже consumed state и потерять one-shot audit indexes.
39. `ChatStoreRevision` — только physical transaction journal. Gameplay state никогда не replay-ится в порядке StoreRevision; semantic materialization идёт только по `StateCommit.parentNodeId` после `HeadResolver`.
40. Два committed StoreRevision siblings одного predecessor в v1 означают `store_revision_ambiguous` и freeze writes. Нельзя автоматически выбирать «победителя» по provenance/timestamp и молча исключать другую durable transaction.
41. Сохранённый assistant output без доказанного valid AttemptContext/state-delivery evidence не может быть синтезирован как `no_patch`; он unreconciled до regenerate/delete/repair.
42. `ignored` не является универсальной кнопкой «продолжить со старым state». Active RP prose со state contradiction может стать healthy только после удаления/исключения variant из canonical transcript либо explicit repair commit.
43. Потеря in-memory `GenerationStateContext` при extension reload не разрешает реконструировать attempt из current head/cache. Такой completion fail-closed не state-commit-ится; durable output становится unreconciled.
44. `generationType="impersonate"` не является assistant state transaction. MODEL_STATE можно дать read-only для continuity, но JSONPatch/state commit из impersonation output запрещены.
45. Continue append меняет current full message hash и не делает старый attempt edited. Historical attempt `storedMessageTextHash` относится к полному variant snapshot сразу после того attempt; mismatch старого A1 после lawful Continue A2 ожидаем. Anchor хранит fingerprint текущего полного variant.
46. Одна physical `ChatStoreRevision` transaction может подтверждать несколько ordered semantic nodes одного StateService operation (например model P1 + consumption C2). Нельзя создавать искусственный crash-window отдельной revision на каждый node, если nodes являются одной логической finalize-операцией.
47. Если projection для следующего turn меняется без изменения `FFMVUState` **или текущий head всё ещё имеет non-direct one-shot/base-seed binding**, lineage нормализуется только новым backend-owned `projection-refresh` system commit с `patch=[]` и direct self-binding; существующий node не мутируется.
48. Durable state transaction без durable transcript variant остаётся committed-but-unbound forensic history и не может стать active только потому, что физически записана позже.
49. `fork`/snapshot-only `legacy-import` BaseSnapshot, который уже включает последствия существующего transcript prefix, обязан иметь child-local `TranscriptBaseBoundary`; HeadResolver не replay-ит этот prefix второй раз.
50. Любое edit/delete/swipe-navigation внутри transcript prefix, уже поглощённого BaseSnapshot, invalidates boundary и fail-closed требует rebase/reimport; нельзя продолжать с прежним base как будто история не изменилась.
51. Self-contained `fork` BaseSnapshot обязан сохранить не только materialized `FFMVUState`, но и **exact projection, предназначенную для первого child generation**. Для этого каждый fork base содержит immutable embedded `ProjectionSeed`; child никогда не зависит от parent storage для первого MODEL_STATE, даже если parent projection была direct/self-rebuildable.
52. `ProjectionBinding.sourceKind="base-seed"` допустим только у BaseSnapshot, содержащего валидный matching `projectionSeed`. Обычный StateCommit всегда использует node-based binding; после первого successful attempt lineage возвращается к обычным node bindings/`projection-refresh`.
53. Tier-1 legacy import использует exact **legacy `ff_mvu_prompt_view` value/object** как embedded seed, если evidence доступен и согласован со snapshot metadata. Lumi `promptViewHash` считается заново над canonical Lumi serialization этого value; legacy ProjectionHash хранится только как provenance. Если доступен только trusted `stat_data`, importer может построить direct projection из imported state, но обязан пометить `projectionContinuity="reconstructed-from-state"` и **не заявлять exact first-turn projection parity**.

Легенда:

- **[STACK]** — подтверждено приложенными файлами.
- **[LUMI]** — подтверждено актуальной документацией/исходниками Lumiverse.
- **[DESIGN]** — целевое архитектурное решение.
- **[VERIFY]** — обязательный spike/integration test до production-кода.

### Актуальные файлы

Логические source roles, а не OS download suffix `(1)/(2)/(3)`, являются identity.

1. **Core:** `FF + MVU Core v1.5.8 · Verified GUI Commit`.
2. **GameStart:** `FF + MVU GameStart v1.4`.
3. **StatusMenu:** `regex-statusmenu_ff_+_mvu_v2_8_1_·_verified_atomic_wardrobe`.
4. **Preset:** `FF5.2_MAX_MVU_v0.4.7.3`.
5. **CharMaker:** `CharMaker-v5.1-alpha.md`.

Старые версии не использовать как источник истины без отдельной команды.

**[DESIGN] Phase 0 обязан создать `legacy-reference-manifest.json`:**

```ts
interface LegacyReferenceFile {
  logicalRole: "core" | "gamestart" | "statusmenu" | "preset" | "charmaker"
  internalVersion: string
  originalFilename: string
  sha256: string
  sizeBytes: number
}
```

Нельзя считать файловые суффиксы вроде `(2)` частью версии. Если необходимый source отсутствует в frozen fixture set — соответствующий parity claim считается непроверенным до добавления файла.

**Hard gate Phase 0 — dependency-scoped:** `legacy-reference-manifest.json` обязан перечислять все пять logical roles, но отсутствие одного role блокирует только work, которое зависит от его реализации. Любой parity claim требует фактически доступный exact source + совпавший hash своего source role. В частности, без exact StatusMenu source запрещено объявлять проверенными wardrobe/equipment mutation parity, lorebook GUI parity, portrait parity и full StatusMenu migration; Core/EventStore/GameStart work от этого source не зависит. Coding-agent не восстанавливает отсутствующую реализацию по описанию из этого ТЗ.

**v2.4 audit state:** в reviewed handoff exact StatusMenu source отсутствовал. Это блокирует только StatusMenu-dependent golden/parity work. Core, GameStart, EventStore, HeadResolver, generation lifecycle, projection и preset transport work могут идти как **Phase 1A**. Wardrobe/equipment/lorebook/portrait/full StatusMenu work становится **Phase 1B** и начинается только после добавления exact source + SHA-256 в `legacy-reference-manifest.json`.

### Проверенные Lumiverse surfaces

При составлении документа сверены: Spindle overview/manifest/permissions, Storage, Variables, Interceptors, Events, Generation, Message Content Processor, Chat Mutation, Chats, World Books, World Info Interceptor, Regex, LLM Tools, Frontend UI/Modal/Drawer, Prompt Blocks, Branching и текущий `src/services/generate.service.ts`.

---

### v2.4 delta summary

Ключевые изменения относительно v2.3:

- `BaseSnapshot` получил optional immutable `ProjectionSeed` для редких self-contained fork/import boundaries;
- `ProjectionBinding` стал explicit union: `sourceKind="node"` либо base-only `sourceKind="base-seed"`;
- fork bootstrap всегда копирует exact resolved parent next-projection в child seed перед отделением от parent storage;
- `TranscriptAttempt`/`GenerationStateContext` фиксируют projection source kind: node provenance либо base seed provenance;
- restart/materializer умеет восстановить exact seed projection без parent node и без запуска latest projection algorithm;
- successful first child/import attempt переводит lineage обратно на ordinary node binding; `no_patch` всегда делает direct-self `projection-refresh`, чтобы seed/non-direct provenance не оставался live;
- Tier-1 import различает `exact-seed` и `reconstructed-from-state`; отсутствие legacy prompt-view evidence больше не маскируется как exact parity;
- добавлены corruption/resource/parent-deletion tests для embedded seed и запрет seed-binding на StateCommit.

---

# 1. Главное архитектурное решение

## 1.1. Не переносить full snapshot per message

Сейчас Core фактически сохраняет в message variables:

```text
stat_data             = полный persistent state
ff_mvu_prompt_view    = полный filtered projection
ff_mvu_snapshot_meta  = hashes + branch/source metadata
```

на множестве сообщений/swipes.

Это было разумной recovery-конструкцией поверх ST/MVU/TavernHelper, но в Lumi даёт лишнее:

- многократное дублирование state;
- большие записи;
- сложные snapshot comparisons;
- плохой forensic UX;
- ненужную связь state database с chat row;
- риск загрязнения поиска/индексации;
- необходимость reconcile внешних full-state writers.

## 1.2. Цель: event sourcing + stable transcript anchors + checkpoints + materialized cache

**[DESIGN]**

```text
GameStart
└─ BaseSnapshot S0 (genesis)

assistant message / host swipe 0
└─ Variant VA
   └─ AnchorRecord A
      └─ Model Patch Commit P1

same assistant message / host swipe 1
└─ Variant VB
   └─ AnchorRecord B
      └─ Model Patch Commit P1b  (тот же base, другая ветка)

GUI wardrobe operation on VA lineage
└─ Patch Commit G2
   └─ Anchor VA tip = G2

...

через N commits
└─ Checkpoint SN (полный state acceleration artifact)
```

Authoritative state history = self-contained base + immutable state commits. Transcript binding = stable `VariantId` + `AnchorRecord`.

Полный state существует только как:

1. self-contained base snapshots (`genesis`, `fork`, `legacy-import`);
2. редкие checkpoints;
3. materialized runtime state в памяти;
4. восстановленный state `base/checkpoint + parent-chain patches`.

Формула:

```text
State(headNode) =
  nearestCheckpointAncestor(headNode)
  + ordered patches to headNode
```

или, если checkpoint отсутствует:

```text
State(headNode) = BaseSnapshot + ordered parent-chain patches
```

Swipes/branches образуют DAG, но host numeric swipe index не входит в authoritative identity: он только текущая coordinate для adapter-а.

---

# 2. Фактическая архитектура текущего ST-стека

```text
Character Card / Scenario / Lore
              │
              ▼
         FF+MVU Preset
              │
        MODEL_STATE sentinel
              │
              ▼
        FF + MVU Core
   ┌──────────┼───────────┐
   │          │           │
   ▼          ▼           ▼
 schema   projection   replay/recovery
   │          │           │
   └──────────┴───────────┘
              │
       late prompt inject
              │
              ▼
             LLM
              │
              ▼
 <gametxt> + optional JSONPatch
              │
              ▼
         Core commit
              │
       branch/swipe state
        ┌─────┴──────┐
        ▼            ▼
   StatusMenu     GameStart
```

Ключевой вывод: **Core — полноценный state subsystem**, а не parser JSONPatch.

Он владеет:

- schema/defaults;
- migrations/normalization;
- validation;
- branch/swipe snapshots;
- replay;
- recovery;
- projection;
- late state injection;
- GUI/external reconciliation;
- lifecycle coordination.

---

# 3. FF + MVU Core v1.5.8: что переносить

## 3.1. ST/TavernHelper bridge — удалить

**[STACK]** Core ищет API одновременно в script iframe и parent window:

- `window.parent`
- `SillyTavern`
- `tavern_events`
- `eventOn/eventRemoveListener`
- `getLastMessageId`
- `getCurrentChatId`
- `Mvu`
- TavernHelper variable APIs.

В Lumi это platform glue.

Удалить:

- `runtimeScopes`
- `runtimeFunction`
- parent discovery;
- ожидание globals;
- fallback variable API matrix;
- polling для синхронизации этих globals.

Заменить backend Spindle API + frontend `SpindleFrontendContext`.

## 3.2. Persistent state schema — сохранить

Корень:

```ts
interface FFMVUState {
  World_Calc: {
    Factions: Record<string, object>
    Locations: Record<string, object>
    Ruins: Record<string, object>
    Events: Record<string, object>
  }

  World: {
    Date: LabeledValue
    Time: LabeledValue
    Location: LabeledValue
    Weather: LabeledValue
  }

  Mainchar: MainCharacterState
  Familiar: Record<string, FamiliarState>

  Narrative: {
    Version: string
    Turn: number
    NextNpcId: number
    NPCs: Record<string, NPCState>
    Relationships: Record<string, RelationshipState>
    GM_Notes: { Active: Record<string, object>; Archive: Record<string, object> }
    Chekhov: {
      Active: Record<string, object>
      Archive: Record<string, object>
      AuditEvery: number
      LastAuditTurn: number
    }
    WorldSim: {
      Threads: Record<string, object>
      Pressures: Record<string, object>
      Archive: Record<string, object>
      LastShift: string
    }
    Scene: {
      Focus: string
      LastBeat: string
      OpenLoops: string[]
      PresentNPCs: string[]
      LocationKey: string
      RelevantWorldKeys: string[]
      Changed: boolean
    }
  }

  MVUStatMenu_DB_Ver: string
  GameStarted: boolean
}
```

`Mainchar` и `Familiar` содержат identity/stats, HP/MP/Stamina, combat-derived stats, Quests, Skills, Equipment, Inventory, Talents, Outfit, Buffs/Ailments и другие текущие поля.

### Labeled tuples

Множество полей имеет вид:

```json
"Strength": [12, "Strength"]
```

Model patch меняет value через:

```text
/Mainchar/Strength/0
```

Не ломать это во время платформенной миграции. Если когда-нибудь захотим убрать tuples — отдельная schema migration после стабилизации Lumi.

### Замеченная несовместимость default Charisma

`defaultState` исторически содержит low default Charisma, но GameStart v1.4 создаёт Charisma строго 80–100. Не «исправлять» молча: GameStarted=false state технический, а GameStart overwrites. Любое изменение default — отдельный versioned migration.

## 3.3. `normalizeState()` — переносить почти буквально

Функция делает:

- migration старых projection paths;
- merge defaults;
- Outfit normalization;
- cleanup clothing tombstones;
- Narrative turn/NextNpcId normalization;
- Scene array bounds;
- NPC ID/aliases/display name normalization;
- cleanup лишних agenda history;
- canonical actor aliases;
- Relationship normalization/clamping;
- archive resolved GM Notes;
- archive Chekhov;
- archive WorldSim;
- archive trimming;
- version stamp.

Особенно сохранить cleanup outfit tombstones: legacy merge-writers могли оставлять `{}`, и нормализатор не должен превращать tombstone обратно в synthetic garment.

## 3.4. Stable NPC IDs

Persistent registry:

```text
npc_0001
npc_0002
...
```

`Narrative.NextNpcId` обязан атомарно продвигаться при создании NPC.

Aliases `player/user/{{user}}/pc/mainchar/Mainchar.Name` canonicalize в `player`. NPC/Familiar aliases — в stable IDs.

Не связывать FFMVU NPC ID с Lumi character ID: это разные namespaces.

## 3.5. Relationships

Сохранить canonical endpoints `A/B` и axes:

- Bond `[-100,100]`
- Sparks `[0,100]`
- Grudge `[0,100]`

Исторические `History/Log` внутри relation удаляются, чтобы state не раздувался.

## 3.6. Archive compaction

Resolved GM/Chekhov/WorldSim records уходят в compact archive. Текущие limits примерно:

- GM Notes: 30;
- Chekhov: 50;
- WorldSim: 30.

Это domain/memory logic, не ST glue.

---

# 4. MODEL_STATE — filtered projection, не full DB

`buildPromptView()` — критически важная часть Core.

Модель получает:

- весь `World`;
- selected `World_Calc`;
- весь `Mainchar`;
- только active/present Familiar;
- hot + warm NPC;
- relevant Relationships;
- candidate GM Notes;
- candidate Chekhov;
- candidate WorldSim threads/pressures;
- `ProjectionMeta`.

**Cold record, отсутствующий в MODEL_STATE, продолжает существовать.**

## Hot/Warm logic

Hot:

- `Scene.PresentNPCs`;
- NPC `IsPresent === true`;
- NPC `Temperature === "hot"`.

Warm score учитывает:

- Priority;
- actor intersection;
- location;
- deadline/earliest turn;
- active/triggered status;
- unresolved next action/pressure;
- recent touch.

Сохранить selection algorithm как pure module.

## Audit indexes

При Chekhov audit due или `Scene.Changed` projection может включать compact indexes NPC/Familiar/Chekhov/GM Notes. Сохранить.

### Legacy truth: projection и consumed state намеренно расходятся

**[STACK]** Повторный аудит Core v1.5.8 выявляет важную parity semantics:

1. `buildPromptView(replay.state, {consumeAudit:true})` сначала строит `view` из **pre-consumption state**;
2. только после этого внутри returned `state` обновляет `Chekhov.LastAuditTurn` и сбрасывает `Scene.Changed=false`;
3. `ensureMessageState()` сохраняет одновременно `stat_data = prepared.state` и `ff_mvu_prompt_view = prepared.view`;
4. `cachedPromptView()` проверяет `StateHash` consumed state и `ProjectionHash` cached view **раздельно**, не требуя `view === buildPromptView(consumedState)`;
5. `commitExternalState(... consumeAudit:false)` наоборот сохраняет projection прямо от external/GUI state без consumption.

Следовательно legacy parity требует различать:

```text
semantic patch base       = state, к которому применяется следующий JSONPatch
projection source         = state, из которого построен MODEL_STATE
```

Обычно они совпадают. После audit/scene consumption они законно различаются.

В event-sourced системе `buildPromptView()` остаётся pure, а consumption становится explicit system commit. Но правильный parity-ordering такой:

```text
freeze current attempt base S0 + exact delivered projection V0
  -> successful model attempt
  -> result R1 = model commit P1(parent=S0) или S0 при no_patch
  -> build NEXT projection Vnext FROM R1, before consumption, using the attempt/current-lineage recorded projectionVersion (never ProjectionRegistry.latest implicitly)
  -> compute consumption patch FROM R1/Vnext

  -> if R1 is a NEW node created by this finalize operation:
       assign R1 a direct self-binding to Vnext before R1 artifact is hashed/written
       # this is required even when an optional C2 will follow in the same physical transaction

  -> if consumption patch non-empty:
       system commit C2(parent=R1, patch=consumptionPatch)
       C2 binding sourceKind="node", sourceNodeId=R1, sourceStateHash=StateHash(R1), promptViewHash(Vnext)
       active semantic head = C2

  -> else if R1 is NEW:
       active semantic head = R1

  -> else if R1 is an EXISTING immutable node and EITHER:
       a) its binding is not a direct self-binding, OR
       b) direct binding version/hash != Vnext:
       system commit C2(parent=R1, patch=[])  # projection-refresh
       parentStateHash == resultStateHash
       # because C2 state bytes == R1 state bytes, Vnext is reproducible from C2 itself
       C2 gets DIRECT SELF-BINDING: sourceNodeId=C2, sourceStateHash=StateHash(C2), promptViewHash(Vnext)
       active semantic head = C2

  -> else:
       existing direct self-binding already matches Vnext; no new semantic node; active semantic head = R1
```

Последний `projection-refresh` case обязателен для `no_patch` после уже consumed/base-seed projection **даже если новый `promptViewHash` случайно совпадает со старым**: non-direct provenance само по себе должно быть retired после успешной доставки. Нельзя «обновить binding на R1» in-place: semantic nodes immutable. Refresh node при unchanged state **self-bind-ится к самому себе**, потому что `State(C2) == State(R1)` и `Vnext` воспроизводится из нового node без backward one-shot provenance. Пустой internal system patch разрешён **только** как explicit metadata-lineage operation (`projection-refresh`/versioned projection maintenance), никогда как model-authored state update.

Для stopped/error generation consumption и next-projection binding не фиксируется.

Это одновременно решает две ошибки:

- consumption не меняет parent текущего model patch;
- model patch, который сам выставил новый `Scene.Changed=true`, не теряет соответствующие audit indexes: они попадают в `Vnext` **до** того, как C2 сбросит flag.

Запрещено после restart просто делать `buildPromptView(C2)`: это потеряет одноразовую projection, которую legacy Core сохранил бы в `ff_mvu_prompt_view`.

Перенос `LastAuditTurn/Scene.Changed` вне gameplay DAG допустим только post-parity отдельным ADR/schema migration.

---

## 4.1. Frozen projection и historical ProjectionRegistry

`promptViewHash` доказывает только bytes/value конкретной projection, но сам по себе не сохраняет алгоритм, который её построил. Поэтому projection versioning имеет такой же historical contract, как reducer versioning.

```ts
interface ProjectionImplementation {
  version: string
  build(state: FFMVUState): PromptView
}

interface ProjectionRegistry {
  get(version: string): ProjectionImplementation
}
```

Правила:

- каждый normal stateful `TranscriptAttempt` записывает `projectionSourceKind + projectionVersion + promptViewHash` отдельно от `baseNodeId/baseStateHash`;
- для `projectionSourceKind="node"` обязательны `projectionSourceNodeId + projectionSourceStateHash`; для `projectionSourceKind="base-seed"` обязателен `projectionSourceBaseId`, а node source fields отсутствуют;
- historical projection implementation immutable и не импортирует mutable latest selection constants;
- при forensic replay node-based projection materialize-ится из **projection source node**, затем перестраивается implementation-ом именно записанной версии и сверяется с `promptViewHash`;
- base-seed projection берётся из immutable `BaseSnapshot.projectionSeed`, проверяется по `projectionVersion/promptViewHash/nodeHash` и не требует parent storage или historical rebuild algorithm для получения exact bytes;
- изменение warm scoring, limits, audit indexes, World_Calc selection или другой observable projection semantics требует нового `projectionVersion`;
- full serialized projection не обязана храниться durable на каждом attempt, если historical implementation воспроизводима.

Отдельно от durable forensic data, **каждый pending generation attempt хранит exact frozen projection в runtime `GenerationStateContext`**. Эта projection является тем, что late interceptor обязан доставить модели даже если current semantic head/cache изменился после pre-assembly.

Model patch authorization также строится из этого frozen view. Нельзя на commit-time пересобирать current projection и тем самым разрешить модели менять cold entity, которой она не видела.

---


## 4.2. Durable ProjectionBinding на semantic node

Чтобы не заводить отдельную mutable projection database, каждый новый semantic base/commit, который может стать resolved head, содержит immutable binding к projection, предназначенной для следующего generation freeze:

```ts
interface NodeProjectionBinding {
  sourceKind: "node"
  sourceNodeId: string
  sourceStateHash: string
  projectionVersion: string
  promptViewHash: string
}

interface BaseSeedProjectionBinding {
  // Legal only on BaseSnapshot that contains matching projectionSeed.
  sourceKind: "base-seed"
  projectionVersion: string
  promptViewHash: string
}

type ProjectionBinding = NodeProjectionBinding | BaseSeedProjectionBinding

interface ProjectionSeed {
  projectionVersion: string
  promptViewHash: string
  projection: PromptView

  // Diagnostic provenance only; correctness never dereferences this source.
  sourceProvenance?: {
    sourceChatId?: string
    sourceNodeId?: string
    sourceStateHash?: string
    legacyProjectionHash?: string
  }
}
```

Обычный direct node:

```text
head = G3
ProjectionBinding.sourceKind = "node"
ProjectionBinding.sourceNodeId = G3
ProjectionBinding.sourceStateHash = StateHash(G3)
```

Post-projection bookkeeping node:

```text
P1 = model result / pre-consumption state
Vnext = buildPromptView(P1)
C2 = consumption(parent=P1)

C2.ProjectionBinding.sourceKind = "node"
C2.ProjectionBinding.sourceNodeId = P1
C2.ProjectionBinding.sourceStateHash = StateHash(P1)
C2.ProjectionBinding.promptViewHash = Hash(Vnext)
```

Self-contained fork/import base when exact next projection is not derivable from its own consumed state:

```text
parent head H = C2
parent binding -> exact Vnext from P1
child state = State(C2)
child BaseSnapshot B embeds projectionSeed = exact Vnext
B.ProjectionBinding = {
  sourceKind: "base-seed",
  projectionVersion,
  promptViewHash: Hash(Vnext)
}
```

То есть binding описывает не «какой state лежит в head», а **откуда получить exact MODEL_STATE, когда этот head является patch base**. Для ordinary nodes это semantic source node; для rare self-contained base — embedded seed.

Generation freeze:

```text
resolved semantic head H
binding = H.projectionBinding
assert binding exists for all native v2.4 nodes

if binding.sourceKind == "node":
  materialize(binding.sourceNodeId)
  assert stateHash == binding.sourceStateHash
  projection = ProjectionRegistry[binding.projectionVersion].build(sourceState)
  assert hash(projection) == binding.promptViewHash
  projectionSourceKind = "node"

else if binding.sourceKind == "base-seed":
  assert H is BaseSnapshot
  seed = H.projectionSeed
  assert seed exists
  assert seed.projectionVersion == binding.projectionVersion
  assert seed.promptViewHash == binding.promptViewHash
  assert hash(seed.projection) == binding.promptViewHash
  projection = clone(seed.projection)
  projectionSourceKind = "base-seed"

attempt.baseNodeId = H
attempt.projectionSourceKind = projectionSourceKind
attempt.projectionSourceNodeId/stateHash = node source only
attempt.projectionSourceBaseId = H.id for base-seed only
attempt.frozenProjection = projection
```

`sourceKind="base-seed"` запрещён на `StateCommit`: seed существует только внутри self-contained `BaseSnapshot`. После первого successful attempt следующий resulting node получает обычный node-based binding; если attempt был `no_patch` и base остался immutable, существующий `projection-refresh` создаёт empty-patch system commit с node-based binding.

Для imported/older nodes без binding допускается one-time migration/rebuild policy с explicit provenance; normal v2.4 runtime не должен молча подставлять latest projection algorithm.

Runtime cache хранит semantic state и exact projection отдельно, поэтому late interceptor остаётся O(1)-like. Durable binding нужен для restart/reload reconstruction и forensic proof, а не для disk replay внутри interceptor.

GUI/external mutation parity: GUI commit получает direct self-binding и строит projection от **своего result state без consumption**, используя `projectionVersion` текущей lineage (не latest implicit), естественно заменяя более старую bound projection так же, как legacy `commitExternalState(... consumeAudit:false)`. Новый projectionVersion появляется только через explicit `projection-upgrade`.

### Binding refresh without game-state change

`ProjectionBinding` immutable вместе с node/base artifact. Поэтому successful `no_patch` не всегда является physical no-op: если exact next projection `Vnext` отличается от direct binding уже существующего `R1` **или R1 binding вообще non-direct (`base-seed` / pre-consumption source)**, StateService создаёт `kind=system` commit с `patch=[]`, `parentStateHash === resultStateHash` и **direct self-binding** (`projection-refresh`). Такой node меняет **lineage/projection delivery metadata**, но не `FFMVUState` bytes. Backward binding на старый R1 здесь запрещён: он сохранил бы ложную one-shot semantics после того, как projection уже была refresh-нута.

Это не loophole для model empty patches: model protocol по-прежнему не создаёт UpdateVariable на no-op. Empty patch разрешён только backend-owned system operation с доказанной projection-maintenance причиной.
 Projection-only empty system commit сохраняет `stateSchemaVersion` и `reducerVersion` parent node (если отдельно не выполняется настоящая schema migration), чтобы «нулевой» patch не получил новый normalization semantics и случайно не изменил state hash.

### Projection version upgrade

Historical node binding никогда не переписывается на `ProjectionRegistry.latest` молча. Если новая extension version намеренно меняет observable projection semantics, live lineage переходит на неё через explicit backend-owned `projection-upgrade` system commit с `patch=[]`, unchanged state hash и новым direct binding.

Для parity-safe upgrade есть дополнительный guard: если current head binding **не является direct node self-binding** (`sourceKind != "node"` либо `sourceNodeId != head`), значит lineage хранит ещё не «отработанную» one-shot/pre-consumption projection. Upgrade **defer-ится**, чтобы не стереть audit indexes или base seed до их следующей доставки. Upgrade можно выполнить после successful attempt/refresh, когда lineage снова имеет direct node self-binding. Historical attempts/nodes продолжают воспроизводиться их recorded `projectionVersion`.

В первой migration release projection-quality changes вообще не совмещать с platform migration; этот protocol нужен для последующих version upgrades.


# 5. JSONPatch engine и model protocol

## 5.1. Output contract

Preset требует normal RP shape:

```xml
<combat_calculation>...</combat_calculation>   <!-- только если check -->
<gametxt>Russian narrative prose only</gametxt>
<combat_log>...</combat_log>                   <!-- только если check -->
<UpdateVariable>
  <UpdateAnalysis>State updated.</UpdateAnalysis>
  <JSONPatch>[...]</JSONPatch>
</UpdateVariable>                               <!-- только если state changed -->
```

Инварианты:

- exactly one `gametxt`;
- no model-authored HUD;
- no state recap/debug;
- no UpdateVariable on no-op;
- pure OOC bypasses RP skeleton;
- pure OOC state administration — minimal transaction.

## 5.2. Allowed model operations

Только:

```text
add
replace
remove
```

No model-side:

```text
copy
move
test
delta arithmetic
```

Внутренний patch engine может поддерживать больше для compatibility, но model policy остаётся узкой.

## 5.3. Post-render evidence lock

State не может обгонять prose.

Patch фиксирует только:

- explicit current facts;
- события, реально завершённые в `gametxt`;
- автоматические последствия реально завершённого canonical time interval.

Нельзя persist intended/planned/omitted/inferred event.

**Validation boundary:** backend детерминированно проверяет syntax/schema/path authorization/parent/hash/resource limits и другие формальные invariants. Соответствие значения patch реально завершённому prose — semantic contract модели, если отдельный semantic validator не спроектирован и не доказан. Coding-agent не должен имитировать evidence lock через brittle keyword matching по `<gametxt>`.

## 5.4. JSON Pointer safety

Сохранить запрет:

```text
__proto__
prototype
constructor
```

## 5.5. Tuple canonicalization

Если модель пишет scalar replace на путь labeled tuple, Core умеет безопасно переписать в `/0`, когда ошибка однозначна.

Сохранить patch-boundary repair.

## 5.6. `repairLabeledTuples`

В Lumi это должен быть compatibility/import/recovery helper. Ordinary backend mutation никогда не должна ломать labels.

---

# 6. Текущий replay/snapshot layer

## Snapshot metadata

Legacy Core stamps:

- Version
- Kind
- MessageId
- Branch
- SourceMessageId
- SourceBranch
- PatchHash
- StateHash
- ProjectionHash
- Turn
- GameStarted

Trusted kinds:

- committed-patch
- committed-no-patch
- gamestart
- external-edit.

## Branch token

Legacy:

```text
chatId:messageId:swipeId
```

Семантика правильная: один assistant message, разные swipes → разные resulting states.

В Lumi numeric coordinate заменить adapter-ом `messageId + currentSwipeIndex -> VariantId`; state lineage адресуется stable node IDs.

## `replayStateTo()`

Legacy algorithm:

1. trusted snapshot;
2. иначе GameStart base;
3. иначе default;
4. идти по integer message indices;
5. user messages не patch-ят;
6. active assistant swipe → последний `<JSONPatch>`;
7. apply;
8. normalize;
9. validate;
10. recover NPC identity if needed.

Это уже почти event sourcing. В Lumi history должна идти по explicit `parentNodeId`, а transcript variant — через stable `VariantId`, а не message index/swipe index.

---

# 7. External GUI reconciliation — почему его не переносить

Legacy StatusMenu/GameStart могли писать полный `stat_data`, поэтому Core вынужден ловить external variable update, repair tuples, compare replayed state, validate и решать — adopt edit или restore expected state.

В Lumi normal flow должен быть:

```text
GUI intent
  ↓
backend StateService
  ↓
minimal patch
  ↓
validate
  ↓
immutable commit
```

Frontend не отправляет full state для обычных действий.

Пример:

```ts
moveOutfit({
  owner: "Mainchar",
  itemKey,
  from: "Wardrobe",
  to: "Worn",
  expectedHeadNodeId
})
```

Backend сам формирует atomic patch.

---

# 8. GameStart v1.4: поведение, которое сохранить

**[STACK]** GameStart global, cardless, branch-local и group-chat-safe.

Поля:

World:
- Date
- Time
- Weather
- Location

Character:
- Name
- Age
- Gender
- Race
- Occupation
- Mental state
- Charisma
- Level
- EXP
- Core points

Stats:
- STR
- AGI
- CON
- INT
- WIS

Rules:
- каждый stat base 5;
- 50 distributable points сверх base;
- Charisma отдельная;
- Charisma 80–100;
- не расходует core pool.

Optional starting weapon request.

GameStart также рассчитывает HP/MP/Stamina и derived combat stats. Формулы сначала переносить буквально.

Перед save legacy code проверяет, что branch token не поменялся. В Lumi сохранить смысл через:

```text
expectedChatId
expectedResolvedHeadNodeId
expectedStateHash
```

Target:

```text
frontend modal
  -> createGenesis(payload)
  -> backend validation
  -> derive stats
  -> Genesis Snapshot
  -> materialized cache
```

Никакого iframe `postMessage`, `window.parent` и 750ms poll.


# 9. StatusMenu v2.8.1: полноценное приложение

Regex ищет:

```text
<StatusPlaceHolderImpl/>
```

и заменяет его большим HTML/CSS/JS документом.

Tabs:

- Overview
- Attributes
- Familiars
- Wardrobe
- Equipments
- Items
- Others
- FF State

Внутри найдены реальные business functions:

- `applyEquipStats`
- `reverseEquipAndReturnToInventory`
- `moveOutfitItem`
- `applyValueUpdate`
- `deleteListItem`
- `saveStatData`
- `fetchLorebookContent`
- `updateLorebookContent`
- portrait compression/edit
- recursive FF state renderer
- pagination/list bindings.

Поэтому переносить StatusMenu как Lumi regex нельзя.

## Wardrobe invariants

Owner-local:

```text
Mainchar.Outfit
Familiar.<id>.Outfit
```

Buckets:

```text
Worn
Wardrobe
```

Clothing fields:

- Name
- Type=`Clothing`
- Slot
- Layer
- Placement
- Color
- Material
- Appearance
- Condition
- Arrangement

Clothing очищается от combat stat fields.

При `Wardrobe -> Worn`:

- non-Extra item вытесняет конфликтующий `Slot + Layer`;
- conflict item атомарно возвращается в Wardrobe;
- target item атомарно идёт в Worn;
- item не может одновременно быть в Worn и Wardrobe;
- Familiar/Mainchar buckets никогда не смешиваются.

Эта логика должна жить в backend domain service, не в browser DOM.

## Equipment invariants

Текущий StatusMenu реально применяет/откатывает stat bonuses.

Перед переносом обязательно сделать golden tests по старым:

- `applyEquipStats`
- `reverseEquipAndReturnToInventory`
- canonical Equipment/Inventory paths.

Нельзя допустить double application bonus.

## GUI save semantics

Legacy `saveStatData()`:

1. фиксирует branch;
2. делает Core external commit;
3. читает обратно state;
4. проверяет metadata;
5. снова проверяет branch;
6. только затем success.

Цель в Lumi: optimistic concurrency + backend `CommitResult`; не повторное сохранение full state.

---

# 10. Preset FF5.2_MAX_MVU_v0.4.7.3

Preset отвечает за narrative/mechanics/model protocol, а не persistence.

Критичный block:

```xml
<MODEL_STATE>
__FFMVU_LIVE_STATE__
</MODEL_STATE>
```

Его сохранить как transport slot.

На момент аудита JSON содержит 86 prompt blocks. Активны, среди прочего:

- FF+MVU Core Contract
- Russian Language & Surface Pass
- Perceptual Focus
- Hybrid POV
- Freaky Adult Mode
- Anti-Echo
- Natural Scene Length
- NPC Voice & Interiority
- Cognitive Bounds
- NPC Drives + VAD
- Realistic NPCs
- Stable NPC Color Registry
- MVU Combat Narration
- Russian Phonetic SFX
- Icebreaker Test
- Universal NPC Genesis
- Lorebook/Persona/Card/Scenario/Examples/History structural markers
- Internal Agenda
- GM Notes
- Relationships
- WorldSim
- Chekhov
- NPC Thoughts
- Internal States Master
- Private Gates
- OOC + Player Agency
- MVU Model State
- Output Contract
- State Protocol
- JSONPatch Format
- Schema
- Delta Ledger
- progression/attributes/combat/encounters/skills/DC/economy/ranking/monster/equipment/outfit/familiar/healing/world modules
- Huge Penis physical engine
- Russian NPC Wrapper Grammar final surface.

### Migration rule

Не переписывать тексты этих модулей в одном PR с платформенной миграцией.

Сначала перенести:

- role;
- block ordering;
- marker;
- depth;
- injection position;
- generation trigger;
- enabled state/toggle group.

Потом отдельный prompt-quality pass.

---

# 11. CharMaker v5.1: граница ответственности

CharMaker уже правильно проектирует stack separation.

Card owns:

- identity/stable facts;
- subjective centers;
- independent wants;
- voice;
- physical material;
- capabilities/limits;
- texture;
- ongoing life;
- stable/plastic/open areas.

Session owns:

- starting relation to player;
- current premise/location/social role/stakes;
- session secrets.

Runtime/MVU/FF owns:

- mood/arousal/energy/pain;
- outfit/position;
- active goals/actions;
- relationship drift;
- memories/consequences;
- schedules/clocks/world state;
- plot threads;
- prose rules/POV/colors/sounds;
- rolls/tools.

**Не чинить runtime-потери добавлением directives в card.**

CharMaker почти platform-independent и в миграции должен меняться только там, где действительно отличается mapping card fields в Lumiverse.

---

# 12. Что Lumiverse/Spindle реально предоставляет

## 12.1. Extension architecture

**[LUMI]** Spindle имеет:

- backend runtime;
- frontend module;
- lifecycle events;
- scoped storage;
- frontend/backend messaging;
- prompt interceptors;
- macros;
- regex scripts;
- world book CRUD;
- world-info interceptor;
- LLM tools;
- safe DOM;
- drawer tabs/modals/panels.

Целевая система должна быть одним нативным Spindle extension, а не имитацией TavernHelper.

## 12.2. Chat variables — не наш state store

**[LUMI]** `spindle.variables.chat` специально сохраняются через regenerate/swipes/message edits.

Для обычного счётчика это удобно. Для FFMVU нарушение:

```text
swipe A => state A
swipe B => state B
```

Один chat var не может представлять оба.

Запрет: authoritative FFMVU state/head/inventory не хранить в Lumi chat variables.

## 12.3. Message metadata — тоже не per-swipe store

**[LUMI]** swipes делят parent message `extra`; на swipe add/update `extra` не patch-ится.

Следовательно `message.extra.ffmvu_state` не способен быть authoritative per-swipe state.

Там можно хранить только необязательный pointer/debug metadata.

## 12.4. Scoped storage — правильная база

**[LUMI]** `spindle.storage` даёт extension-scoped file storage. `spindle.userStorage` даёт per-user isolation и остаётся изолированным даже для `install_scope="operator"`; обычный `spindle.storage` в operator scope общий для пользователей.

FFMVU authoritative persistence обязан иметь explicit user scope:

```ts
interface StateScope {
  userId: string
  chatId: string
}
```

Default target:

- authoritative manifests/events/bases/checkpoints/anchor indexes → `spindle.userStorage`;
- rebuildable process-local cache → memory;
- extension-global, действительно не пользовательская config → `spindle.storage` только если она реально нужна.

Для user-scoped extension `userId` может выводиться runtime, но domain API всё равно хранит `StateScope`, чтобы не зашивать deployment assumption.

**[LUMI]** Обычный `spindle.storage` предоставляет `move()` и `stat()`, но authoritative `spindle.userStorage` документирует только `read/write/delete/list/exists/mkdir/getJson/setJson`; `move()`/`stat()` для него не заявлены. Ни один из storage API не документирует CAS/transactions/fsync/atomic replace contract. Поэтому FFMVU correctness не зависит ни от `move()`, ни от single-file replace semantics.

## 12.5. Late interceptor

**[LUMI]** `registerInterceptor()` работает после полной assembly и до provider.

Context содержит:

- chatId;
- connectionId;
- personaId;
- generationType;
- activatedWorldInfo.

Это точная native replacement для late MODEL_STATE injection.

Критично: timeout/error interceptor fail-open. Поэтому он должен быть O(1)-like, no-throw и брать уже готовую projection из cache.

## 12.6. Generation lifecycle

**[LUMI]** Generation events:

- `GENERATION_STARTED`
- `STREAM_TOKEN_RECEIVED`
- `GENERATION_ENDED`
- `GENERATION_STOPPED`

`GenerationStartedPayloadDTO` документирует `generationId`, `chatId`, model и optional `targetMessageId`; generation event payload не следует считать источником всех assembly-context полей.

**[LUMI]** Context Handler отдельно получает pre-assembly context:

- `chatId`;
- `generationType` (`normal/continue/regenerate/swipe/impersonate`);
- `dryRun`;
- `userId`;

и может fail-closed через `cancelGeneration: true`, если host advertises `spindle.contracts.preAssemblyGenerationContext >= 1`. Документация также прямо разрешает возвращать extension-specific custom fields. В audited current host source `SpindleContext` имеет `[key: string]: unknown` и описан как context, проходящий через handler chain и interceptor pipeline. Поэтому `ffmvuAttemptId`/эквивалентный extension field является подтверждённым transport surface для audited build; P0-Q всё равно обязан доказать его exact end-to-end поведение на реально установленной target version и при lifecycle races.

Следовательно generation coordination — это **correlation host generation lifecycle с нашим attempt**, а не предположение, что один event содержит всё необходимое. `generationId/targetMessageId` по-прежнему correlation-ятся отдельно через P0-F.

State commit только после successful final generation. Partial stream — никогда.

## 12.7. Swipes

**[LUMI]** `MESSAGE_SWIPED` различает:

- `added`;
- `updated`;
- `deleted`;
- `navigated`.

`SWIPE_EDITED` покрывает wholesale rewrite `swipes/swipe_id/swipe_dates`.

Критично: публичный `swipeId` — **текущий индекс массива**, не persistent UUID. Для `deleted` удалённого slot уже нет в `message.swipes`, а surviving slots могут изменить индексы.

Запрет: не использовать `messageId:swipeId` как долговременную identity EventStore.

Extension создаёт собственный immutable `variantId` и поддерживает adapter:

```text
(messageId, currentSwipeIndex) -> variantId
variantId -> AnchorRecord
```

Add создаёт новый `variantId`; update сохраняет identity; delete reindexes surviving bindings; navigate identity не меняет. Wholesale `SWIPE_EDITED` требует reconciliation; ambiguous reconciliation переводит state health в `swipe_identity_ambiguous`, а не угадывает.

## 12.8. Message IDs

Lumi IDs строковые. Старый `messageId - 1`/integer scanning запрещён.

Работать через ordered `getMessages(chatId)` + explicit state parent chain.

## 12.9. Branch

В Lumi:

- Swipe = alternative version одного message.
- Branch = новый chat с copied history до fork point.

Storage по старому `chatId` автоматически не «форкается». Нужен branch bootstrap.

## 12.10. Prompt Blocks

Lumi поддерживает:

- system/user/assistant/user_append/assistant_append;
- pre_history/post_history/in_history;
- depth;
- structural markers;
- generation triggers;
- radio/checkbox groups;
- prompt variables;
- Dry Run.

Это лучше старых separator/toggle blocks.

## 12.11. World Books

Есть native book/entry CRUD и activation pipeline.

Можно query activated entries и при необходимости использовать World Info Interceptor до activation.

## 12.12. Regex

Есть prompt/response/display targets.

Display transform не обязан менять stored canonical content — полезно для hiding machine tags.

## 12.13. Tools

Есть `spindle.registerTool()` + JSON Schema/function calling.

В текущем upload отдельного FFMVU custom tool backend не обнаружено. Не добавлять tool permission/logic «на всякий случай».

## 12.14. Direct sidecar generation caveat

`spindle.generate.raw/quiet/batch` — прямые provider helpers и не проходят обычную prompt assembly/context handler/interceptor chain.

Если FFMVU позже делает sidecar generation, MODEL_STATE надо передавать explicit.

## 12.15. Data portability authoritative storage

**[LUMI]** User guide описывает `.lvbak` как account archive и явно перечисляет `database/`, `files/`, optional `lancedb/` и `secrets/`. Extension `userStorage` в опубликованном составе архива отдельно не заявлен.

Из этого **нельзя** делать вывод, что `userStorage` точно исключён: это end-to-end behavior, которое надо проверить.

**[VERIFY/P0-M]** До production выполнить round-trip:

```text
create nontrivial FFMVU state/history in userStorage
-> export .lvbak
-> restore into fresh account/instance
-> verify bases/events/attempts/indexes/checkpoints and materialized hashes
```

Если round-trip не сохраняет authoritative FFMVU storage, extension обязан иметь собственный versioned `Export FFMVU Archive` / `Import FFMVU Archive`. UI и документация не должны создавать впечатление, что обычный Lumi backup защищает FFMVU history, пока это не доказано.

---

# 13. Целевая структура extension

```text
ffmvu/
├─ spindle.json
├─ package.json
├─ tsconfig.json
├─ src/
│  ├─ shared/
│  │  ├─ types.ts
│  │  ├─ state-scope.ts
│  │  ├─ state-schema.ts
│  │  ├─ state-defaults.ts
│  │  ├─ reducer-registry.ts
│  │  ├─ state-normalize.ts
│  │  ├─ state-validate.ts
│  │  ├─ json-pointer.ts
│  │  ├─ json-patch.ts
│  │  ├─ hashing.ts
│  │  ├─ projection.ts
│  │  └─ protocol.ts
│  ├─ backend/
│  │  ├─ index.ts
│  │  ├─ state-service.ts
│  │  ├─ event-store.ts
│  │  ├─ base-store.ts
│  │  ├─ anchor-store.ts
│  │  ├─ transcript-attempt-store.ts
│  │  ├─ variant-index.ts
│  │  ├─ store-revision.ts
│  │  ├─ materializer.ts
│  │  ├─ checkpoint-service.ts
│  │  ├─ head-resolver.ts
│  │  ├─ transcript-reconciler.ts
│  │  ├─ lifecycle.ts
│  │  ├─ generation-context.ts
│  │  ├─ model-commit.ts
│  │  ├─ interceptor.ts
│  │  ├─ context-guard.ts
│  │  ├─ branch-bootstrap.ts
│  │  ├─ transcript-integrity.ts
│  │  ├─ lorebook-adapter.ts
│  │  ├─ migration.ts
│  │  ├─ diagnostics.ts
│  │  └─ rpc.ts
│  └─ frontend/
│     ├─ index.ts
│     ├─ api.ts
│     ├─ game-start/
│     ├─ status-menu/
│     └─ history/
└─ tests/
   ├─ unit/
   ├─ fixtures/
   ├─ integration/
   ├─ fault-injection/
   └─ migration/
```

# 14. Event model

State history, generation evidence и transcript identity — связанные, но разные системы. v2.4 запрещает использовать mutable `AnchorRecord` как единственный forensic record generation lifecycle.

```text
Lumiverse transcript
  message + mutable swipe index
        │
        ▼
VariantIndex
  stable internal VariantId
        │
        ├──────────────► immutable TranscriptAttempt log
        │                 what each generation actually saw/produced
        ▼
AnchorRecord
  rebuildable current summary/index for the whole variant
        │
        ▼
State DAG
  BaseSnapshot + immutable StateCommit
```

## 14.1. Scope, stable variant identity и immutable generation attempts

```ts
interface StateScope {
  userId: string
  chatId: string
}

type VariantId = string // generated UUID; never derived from swipe index
type LineageAnchorId = "root" | VariantId

type AttemptStatus =
  | "committed"
  | "no_patch"
  | "failed_patch"
  | "ignored"
  | "stopped"
  | "unreconciled"

interface TranscriptAttempt {
  id: string
  scope: StateScope
  variantId: VariantId
  messageId: string

  generationId?: string
  generationType: string
  ordinal: number

  // Semantic patch parent frozen for THIS attempt.
  baseNodeId: string
  baseStateHash: string

  // Exact MODEL_STATE provenance. Usually node-based; fork/import first attempt may use base seed.
  projectionSourceKind: "node" | "base-seed"
  projectionSourceNodeId?: string       // required iff sourceKind="node"
  projectionSourceStateHash?: string    // required iff sourceKind="node"
  projectionSourceBaseId?: string       // required iff sourceKind="base-seed"
  projectionVersion: string
  promptProtocolVersion: string
  promptViewHash: string
  presetVersion?: string

  modelCommitId: string | null
  status: AttemptStatus

  // Distinct evidence domains; never overload one generic "text hash".
  rawGenerationHash?: string
  rawPatchPayloadHash?: string
  canonicalPatchHash?: string
  storedMessageTextHash: string

  createdAt: string
}

type AnchorStatus =
  | "committed"
  | "no_patch"
  | "failed_patch"
  | "ignored"
  | "stopped"
  | "unreconciled"

interface AnchorRecord {
  variantId: VariantId
  scope: StateScope
  messageId: string

  // Current host coordinate is advisory/mutable adapter data, not identity.
  observedSwipeIndex: number

  // Base of the first generation that created this variant.
  initialBaseNodeId: string
  initialBaseStateHash: string

  // Ordered immutable evidence. Continue MAY append another attempt to the same VariantId.
  attemptIds: string[]
  lastAttemptId?: string

  // Current stored host content fingerprint for reconciliation.
  storedMessageTextHash: string

  // Latest non-message descendant belonging to this transcript endpoint.
  // Rebuildable from attempt/commit provenance.
  tipNodeId: string
  status: AnchorStatus

  createdAt: string
  updatedAt: string
}
```

`TranscriptAttempt` различает события, которые `AnchorRecord` не должен стирать при update: initial generation, Continue segment, no-patch, failed patch, explicit ignore и recovery. Один `VariantId` может иметь несколько attempts; каждый attempt хранит собственные frozen `baseNodeId/baseStateHash` и отдельные `projectionSourceKind` + соответствующий node/base-seed provenance + `projectionVersion/promptViewHash`.

`AnchorRecord` — **rebuildable current summary/index**, а не immutable audit log. Он отвечает на вопрос «какое текущее состояние transcript endpoint и где его tip», а forensic chronology берётся из `TranscriptAttempt` + `StateCommit`.

`tipNodeId` нужен потому, что после assistant response могут существовать GUI/system commits без отдельного chat message.

До первого assistant variant существует synthetic root lineage anchor:

```ts
interface RootAnchorRecord {
  anchorId: "root"
  scope: StateScope
  baseNodeId: string
  tipNodeId: string
  updatedAt: string
}
```

Он хранит `genesis/fork/import -> GUI/system -> first assistant` lineage. GUI/system commit после появления assistant variant относится к active terminal VariantId; до него — к `"root"`.

## 14.2. Base snapshot

Genesis/fork/import — self-contained bases, а не гигантские patches от `{}`.

```ts
type BaseKind = "genesis" | "fork" | "legacy-import"

interface TranscriptBaseBoundary {
  // Child/current-chat-local transcript boundary already materialized into this base.
  // Messages through this ID are context-only for this state lineage and are NOT replayed again.
  throughMessageId: string

  // SHA-256 over a versioned canonical active transcript prefix through throughMessageId.
  // Include state-relevant identity/role + active stored content + active swipe selection evidence;
  // do not hash volatile display-only metadata wholesale.
  activePrefixHash: string
  fingerprintVersion: string
}

interface BaseSnapshot {
  id: string
  scope: StateScope
  kind: BaseKind
  eventFormatVersion: string
  stateSchemaVersion: string
  reducerVersion: string
  createdAt: string
  stateHash: string
  state: FFMVUState

  // Required for fork/snapshot-only legacy-import bases that already include an existing chat prefix.
  // Usually absent for a fresh genesis before any transcript history.
  transcriptBoundary?: TranscriptBaseBoundary

  // Rare self-contained exact projection seed. Required for every fork base;
  // optional for legacy-import only when exact legacy prompt-view evidence is available.
  projectionSeed?: ProjectionSeed

  // Genesis/reconstructed import normally use sourceKind="node" self-binding.
  // Fork/exact legacy import use sourceKind="base-seed" matching projectionSeed.
  projectionBinding: ProjectionBinding

  provenance?: {
    parentChatId?: string
    parentNodeId?: string
    forkMessageId?: string
    legacySource?: string
    projectionContinuity?: "exact-seed" | "reconstructed-from-state"
  }
}
```

Fork child после bootstrap materializes state **и first-next projection** только из собственного `BaseSnapshot`; существование parent storage больше не требуется. Для fork `projectionSeed` обязателен даже когда parent binding был direct: это редкое дублирование одной projection на branch boundary и простой self-contained invariant.

`TranscriptBaseBoundary` закрывает важный double-replay invariant. Если base state уже является состоянием **после** некоторого существующего transcript prefix (типичный `fork` или Tier-1 legacy import), этот prefix остаётся видимым модели как chat history, но state engine начинает semantic replay **только с первого сообщения после boundary**.

`activePrefixHash` — evidence того, что поглощённая в base история не изменилась. Numeric swipe index внутри fingerprint допустим только как frozen evidence coordinate, не как persistent VariantId. Если message/edit/delete/swipe navigation меняет prefix hash, health становится `base_boundary_dirty`/`diverged_history`; прежний BaseSnapshot нельзя продолжать использовать как доказанно соответствующий новой истории.

`projectionSeed` не является вторым state snapshot: он не содержит `FFMVUState`, не создаётся per-message и не развивается как mutable DB. Это один immutable next-projection artifact на редком base boundary. Его canonical bytes входят в `BaseSnapshot` artifact `nodeHash`; отдельный `promptViewHash` проверяет именно projection payload.

Base validation invariants:

```text
kind="genesis":
  projectionBinding.sourceKind == "node"
  projectionBinding.sourceNodeId == base.id
  projectionBinding.sourceStateHash == base.stateHash

kind="fork":
  transcriptBoundary required
  projectionSeed required
  projectionBinding.sourceKind == "base-seed"
  seed.version/hash == binding.version/hash
  provenance.projectionContinuity == "exact-seed"

kind="legacy-import":
  transcriptBoundary required for snapshot-only import over existing history
  exact prompt-view evidence -> base-seed + projectionSeed + projectionContinuity="exact-seed"
  no exact prompt-view evidence -> node self-binding + projectionContinuity="reconstructed-from-state"

all base-seed bindings:
  owning artifact must be BaseSnapshot
  canonicalHash(projectionSeed.projection) == promptViewHash
  projectionSeed passes PromptView validation + canonical JSON/resource limits

attempt with projectionSourceKind="base-seed":
  projectionSourceBaseId == baseNodeId
  that BaseSnapshot owns the matching seed
```

`StateCommit.projectionBinding.sourceKind="base-seed"` — schema/validation error. Seed не переносится дальше автоматически: normal finalize создаёт node-based binding на новом semantic node или `projection-refresh`.

## 14.3. Patch commit

```ts
type CommitKind =
  | "model"
  | "gui"
  | "system"
  | "edit-rebuild"
  | "migration"
  | "repair"

type CommitAnchor = {
  messageId?: string
  variantId?: VariantId
  generationId?: string
  attemptId?: string
  messageRole?: "assistant" | "user"
  lineageAnchorId?: LineageAnchorId
}

interface StateCommit {
  id: string
  scope: StateScope
  eventFormatVersion: string
  stateSchemaVersion: string
  reducerVersion: string
  createdAt: string

  parentNodeId: string
  kind: CommitKind
  anchor: CommitAnchor
  patch: JsonPatchOperation[] // may be [] only for explicit backend-owned system metadata lineage commits

  parentStateHash: string
  resultStateHash: string
  patchHash: string

  rawPatchPayloadHash?: string
  rawGenerationHash?: string
  storedMessageTextHash?: string
  presetVersion?: string

  // Projection to use if this node is resolved as semantic head.
  // Direct commits bind to self; post-consumption system commits bind to pre-consumption parent.
  projectionBinding: ProjectionBinding

  // Recovery/idempotency + physical journal provenance.
  transactionId: string
  previousStoreRevisionId: string | null
  previousStoreRevisionHash: string | null
  requestId?: string
  note?: string
}
```

Commit ID/transaction ID — collision-resistant UUID (предпочтительно UUIDv7 или UUIDv4). Timestamp никогда не identity/order.

`lineageAnchorId` у GUI/system commit указывает, к какому текущему transcript endpoint (`"root"` или VariantId) относилось изменение. Это позволяет rebuild `tipNodeId` и отличать non-message commits разных swipe lineages.

Если одна StateService finalize-operation создаёт несколько semantic commits (`P1 -> C2`), все они получают один `transactionId` и один и тот же captured `previousStoreRevisionId/previousStoreRevisionHash`. Их внутренний порядок доказывается **semantic `parentNodeId`**, а не искусственной цепочкой физических revisions.

## 14.4. Checkpoint

```ts
interface StateCheckpoint {
  nodeId: string
  scope: StateScope
  stateSchemaVersion: string
  reducerVersion: string
  createdAt: string
  stateHash: string
  state: FFMVUState
}
```

Checkpoint — acceleration artifact, не semantic event. Его можно пересоздать.

## 14.5. Immutable store revision — не active transcript head

Durable revision journal фиксирует **физически подтверждённые state transactions**, но не выбирает active swipe lineage. Active head всегда вычисляет `HeadResolver` из transcript + variants/anchors/attempts.

```ts
interface ChatStoreRevision {
  formatVersion: string
  scope: StateScope

  revisionId: string          // UUID; identity, not numeric filename alone
  revision: number            // monotonic convenience within predecessor chain
  previousRevisionId: string | null
  previousRevisionHash: string | null
  revisionHash: string

  transactionId: string
  committedNodes: Array<{
    nodeId: string            // BaseSnapshot or StateCommit made durable by this tx
    nodeHash: string
  }>                          // semantic order within this transaction; may contain P1 -> C2

  baseSnapshotId: string | null
  lastCheckpointNodeId?: string | null // advisory acceleration hint only

  branchProvenance?: {
    parentChatId: string
    parentNodeId: string
    forkMessageId?: string
  }

  createdAt: string
}
```

`baseSnapshotId`, а не `genesisCommitId`: child branch и legacy-import имеют собственный base, но не обязаны иметь semantic GameStart genesis.

**Invariant:** `ChatStoreRevision` не содержит authoritative `resolvedHeadNodeId`, active swipe или transcript health. Swipe navigation не пишет store revision. Если два writers создают competing successor одной revision, оба immutable files должны сосуществовать, но **v1 не выбирает ни один автоматически**: store становится `store_revision_ambiguous`, новые writes freeze до explicit repair/recovery. Ни provenance, ни timestamp не превращают одну уже durable transaction в невидимую «проигравшую».

`revisionHash = SHA-256(canonical(ChatStoreRevision без поля revisionHash))`. `previousRevisionHash` обязан byte-for-byte совпадать с `revisionHash` указанного `previousRevisionId`; genesis store revision имеет оба predecessor fields = `null`. Self-referential hashing запрещён.

`committedNodes[].nodeHash` — SHA-256 canonical bytes **целого referenced BaseSnapshot/StateCommit artifact**. Это physical artifact hash, не `stateHash/resultStateHash`. StoreJournal проверяет file identity/integrity через `nodeHash`; semantic Materializer отдельно проверяет `parentStateHash/resultStateHash`.

## 14.6. VariantIndex

Host swipe indices mutable. Хранить rebuildable mapping:

```ts
interface MessageVariantIndex {
  messageId: string
  bySwipeIndex: Record<number, VariantId>
  swipeFingerprints: Record<VariantId, {
    storedMessageTextHash: string
    swipeDate?: string
  }>
  updatedAt: string
}
```

Правила:

- `added`: allocate new `variantId`;
- `updated`: preserve variant identity, update fingerprints;
- `deleted`: remove deleted identity and shift index bindings after removed index;
- `navigated`: mapping unchanged;
- `SWIPE_EDITED`: reconcile against previous cached/indexed set; if more than one mapping is plausible, stop with `swipe_identity_ambiguous`.

# 15. Почему parent chain — истина

Нельзя брать «самый новый commit по timestamp».

```text
          P10
           │
     ┌─────┴─────┐
     │           │
 swipe0 P11A   P11B swipe1
     │
 GUI P12A
```

Если active variant = swipe1 lineage, P12A не является current state, даже если он новее по времени. Numeric `swipe_id` используется только чтобы найти stable VariantId.

Authoritative ordering = explicit `parentNodeId` + active stable transcript variants + их Anchor tip lineage.

---

# 16. Storage layout

Authoritative persistence — per-user `spindle.userStorage`.

```text
userscope/
└─ chats/
   └─ <chatId>/
      ├─ bases/
      │  └─ <baseSnapshotId>.json
      ├─ events/
      │  └─ <commitId>.json
      ├─ attempts/
      │  └─ <attemptId>.json          # immutable transcript generation evidence
      ├─ anchors/
      │  ├─ root.json
      │  └─ <variantId>.json          # rebuildable current index/summary
      ├─ variant-index/
      │  └─ <messageId>.json          # rebuildable host-coordinate adapter
      ├─ checkpoints/
      │  └─ <nodeId>.json
      ├─ manifests/
      │  ├─ 0000000001-<transactionId>.json
      │  ├─ 0000000002-<transactionId>.json
      │  └─ ...
      ├─ manifest-head.json           # optional advisory pointer only
      ├─ migration.json
      └─ cache.json                   # optional/rebuildable
```

### Почему immutable file per commit/base/store revision/attempt

Authoritative `userStorage` не предоставляет documented CAS/transaction/atomic-replace contract и не обязан иметь `move()`.

Поэтому correctness не зависит от единственного перезаписываемого `manifest.json`.

Immutable files дают:

- crash recovery;
- forensic audit;
- меньше blast radius;
- orphan detection;
- coexistence competing sibling revisions;
- отсутствие write contention со старыми records.

Numeric `revision` — порядок внутри predecessor chain, **не identity файла**. Filename обязан включать collision-resistant `transactionId/revisionId`, чтобы два competing `revision=42` не overwrote друг друга.

`manifest-head.json`, если используется, только ускоряет startup. Healthy writable store требует unique self-consistent physical `ChatStoreRevision` tip. **Active semantic state head отдельно вычисляется HeadResolver и может меняться при swipe navigation без новой store revision.**

# 17. Write-ahead commit algorithm

Все mutations проходят через один backend method:

```ts
async function commitPatch(input: CommitPatchInput): Promise<CommitResult>
```

Порядок state mutation:

```text
1. acquire mutex for StateScope
2. recover current durable ChatStoreRevision and capture its revisionId/revisionHash as the physical predecessor
3. resolve active semantic parent separately through HeadResolver (or use frozen expected parent from generation)
4. compare expected parent node / expected state hash; physical store revision is not supplied by the client and is always re-read under the mutex
5. clone parent state
6. canonicalize patch
7. enforce resource + path policy
8. apply patch
9. normalize using reducerVersion
10. schema/Zod validation
11. validateState()
12. compute canonical hashes
13. allocate one transactionId + required semantic node IDs + revisionId
14. construct the full ordered semantic node sequence for this StateService operation (usually one node; successful model turn may be `P1 -> C2`, where C2 is projection-consumption or projection-refresh)
15. write every immutable BaseSnapshot/StateCommit artifact in that sequence
16. maybe write checkpoint artifact
17. write **one** immutable next ChatStoreRevision linking previousRevisionId/hash + `committedNodes[]`
18. only now are all nodes listed by that revision considered physically committed
19. update rebuildable anchor/tip/index where required
20. update advisory manifest-head/cache
21. notify frontend
22. release mutex
```

For model generation `TranscriptAttempt` persistence is idempotent by `attemptId/generationId` and written **once**, only after its final immutable fields are known. In v1 normal successful flow semantic node files + StoreRevision are finalized first, then final Attempt/Anchor evidence is persisted when the verified host lifecycle exposes canonical stored-message evidence. No correctness rule depends on Attempt being written before StoreRevision, and a valid state revision never depends on mutable AnchorRecord. Recovery explicitly tolerates the state-first/message-missing and message-first/state-missing crash windows.

Crash cases:

### Semantic node file(s) written, store revision missing

`ChatStoreRevision` является physical transaction commit point. Поэтому BaseSnapshot/StateCommit artifact, который не referenced ни одной committed StoreRevision, **не является committed state mutation** независимо от того, насколько правдоподобны его parent/provenance fields.

Это особенно важно для successful model finalize: `P1` и optional `C2` сначала пишутся как semantic artifacts, а затем **одна** StoreRevision подтверждает весь ordered set. Crash между P1 и C2 file writes либо до revision не делает «пол-хода» durable.

Такой файл классифицируется как `uncommitted_orphan` и:

- не auto-adopt-ится при startup;
- не продвигает durable or semantic head;
- сохраняется для forensic/reconciliation window;
- может быть использован только как evidence для создания **новой нормальной transaction**, если `TranscriptReconciler` или idempotent GUI retry отдельно доказывает intent/base/variant.

Это intentionally упрощает crash semantics: node входит в durable state history только если его `nodeId/nodeHash` referenced валидной committed StoreRevision. Parent equality никогда не resurrect-ит orphan.

### Store revision written, advisory head missing

No semantic loss. Startup follows/validates the hash-linked immutable revision chain. Full directory scan is recovery fallback, not required normal-path behavior.

### Competing successor revisions

Если две **committed** immutable revisions имеют одинакового predecessor, обе являются durable transaction receipts. Однопредковый physical journal больше не имеет unique tip.

Для v1 правило намеренно простое:

- numeric revision, timestamp и provenance **не выбирают winner**;
- store health = `store_revision_ambiguous`;
- новые state writes блокируются;
- обе revisions и все referenced artifacts сохраняются;
- automatic semantic replay/merge из siblings запрещён;
- v1 runtime **не обязан уметь in-place repair** такого physical fork. Он обязан дать diagnostics/export и fail closed. Любой будущий offline/admin recovery protocol оформляется отдельным ADR; нельзя сейчас обещать неописанный «manual merge».

P0-P обязан либо доказать single-writer host guarantee, либо реализовать serialization так, чтобы siblings не возникали в supported production flow. То есть `store_revision_ambiguous` — disaster/recovery detector, а не штатный branching mechanism. Uncommitted orphan event без revision в эту ambiguity не входит.

### Anchor/index write missing

State event remains authoritative; `TranscriptReconciler` rebuilds anchor/index from transcript + event provenance when unambiguous. Otherwise health becomes recovery/identity error rather than guessing.

Никогда не перезаписывать старый event/base/attempt/store revision.

# 18. Hashing

Legacy FNV-like hash можно заменить SHA-256.

Canonical serialization contract должен быть формальным и versioned. **Preferred:** RFC 8785 / JSON Canonicalization Scheme (JCS) + SHA-256. Если JCS не используется, ADR обязан заморозить exact ECMAScript number/string serialization и exact key comparator; формулировка «sorted by code point / deterministic comparator» недостаточна для cross-version forensic hashes.

Минимальные invariants:

- UTF-8 canonical bytes;
- deterministic object-key order defined byte-for-byte;
- array order preserved;
- `undefined`, functions, symbols запрещены до hashing;
- non-finite numbers (`NaN`, `Infinity`) запрещены;
- `-0` canonicalized consistently;
- no implicit Unicode normalization unless introduced by explicit hash-version migration;
- only JSON-compatible primitives/objects/arrays.

Нужны:

```text
patchHash                  # canonical JsonPatchOperation[]
parentStateHash
resultStateHash
promptViewHash
rawPatchPayloadHash        # exact extracted machine payload bytes/text
rawGenerationHash          # exact final provider/lifecycle evidence when available
storedMessageTextHash      # canonical host-stored swipe/message content
revisionHash
```

Hash algorithm/canonical serialization version входят в `eventFormatVersion`; менять их молча нельзя.

Не использовать один generic `sourceTextHash` для разных text domains. `rawPatchPayloadHash`, `rawGenerationHash` и `storedMessageTextHash` имеют разные provenance и не взаимозаменяемы. `projectionVersion` хранится рядом с `promptViewHash` и resolve-ится через frozen `ProjectionRegistry`; иначе старый prompt evidence нельзя воспроизвести после изменения projection algorithm.

Для v1 `MODEL_STATE` transport должен сериализовать projection **тем же canonical serializer**, bytes которого хешируются в `promptViewHash`. Тогда `promptViewHash` означает exact injected JSON bytes/value, а не только абстрактно эквивалентный object с другим whitespace/key order. Если host/provider когда-либо требует иную transport serialization, добавить отдельный `serializedPromptViewHash`, а не менять смысл существующего hash.

# 19. Checkpoints

Начальный configurable policy:

```text
checkpoint if
  commitsSinceCheckpoint >= 25
  OR cumulativePatchBytes >= 128 KiB
  OR schema migration completed
  OR manual compact requested
```

Это не gameplay rule. Значения должны быть constants/settings и тюнятся после benchmarks.

Checkpoint только после validated commit.

---

# 20. Materialized cache

Interceptor не должен реплеить диск.

```ts
interface MaterializedHead {
  scope: StateScope
  nodeId: string
  state: FFMVUState
  stateHash: string
  projection: ModelStateView
  projectionHash: string
  storeRevision: number
  storeRevisionId: string
  storeRevisionHash: string
  health: StateHealthReport
}
```

Backend:

```ts
Map<string /* scopeKey(userId,chatId) */, MaterializedHead>
```

На restart:

1. recover/validate **physical StoreJournal** and require a unique healthy physical tip;
2. resolve active transcript + stable variants/attempts through `HeadResolver`;
3. obtain resolved semantic head node;
4. nearest checkpoint ancestor of that semantic node;
5. replay only its `StateCommit.parentNodeId` chain with correct reducer versions;
6. verify semantic parent/result hashes; normalize/validate;
7. resolve head `ProjectionBinding`;
8. if `sourceKind="node"`, materialize its source node and rebuild with recorded `ProjectionRegistry` version; if `sourceKind="base-seed"`, read the exact embedded seed from that BaseSnapshot without parent lookup;
9. verify source/state hash where applicable, projection version and `promptViewHash`; cache semantic state + exact projection separately.

`lastCheckpointNodeId` в store revision — advisory hint, но `findNearestCheckpoint(head)` всегда ancestry-aware. После перехода на старый swipe нельзя blindly использовать checkpoint другого descendant branch.

На swipe/edit/delete/chat switch `HeadResolver` меняет resolved head и materializes нужный lineage.

---

# 21. Swipes как state forks

Stable identity:

```text
state before assistant message = P20

host swipe index 0 -> variant VA -> P21A(parent=P20)
host swipe index 1 -> variant VB -> P21B(parent=P20)
```

Regenerate/new swipe **никогда** не parent-ится от P21A только потому, что P21A был active до reroll. Он parent-ится от frozen state-before-target-message.

GUI/system commits после assistant response продолжают именно выбранный lineage:

```text
VA model P21A
  └─ GUI G22A
      └─ system S23A
```

`AnchorRecord(VA).tipNodeId = S23A`.

## Generation context

Generation context формируется pre-assembly и затем correlation-ится с lifecycle generation ID.

```ts
interface GenerationStateContext {
  attemptId: string
  generationId?: string
  scope: StateScope
  generationType: string

  baseNodeId: string
  baseStateHash: string

  projectionSourceKind: "node" | "base-seed"
  projectionSourceNodeId?: string
  projectionSourceStateHash?: string
  projectionSourceBaseId?: string
  projectionVersion: string
  promptViewHash: string

  // Runtime-frozen evidence delivered to THIS attempt.
  // Not required to be persisted whole after finalization if ProjectionRegistry can reproduce it.
  frozenProjection: PromptView
  frozenAuthorization: ModelPatchAuthorizationView

  presetVersion?: string
  targetMessageId?: string
  targetVariantId?: VariantId
  startedAt: string
}
```

Normal generation base = current active `tipNodeId`.

Regenerate/swipe base = state **до assistant message**, которое reroll-ится.

Parent нельзя вычислять после generation из current HEAD: во время generation мог произойти GUI commit/navigation/edit.

То же правило действует для projection: после создания `GenerationStateContext` текущий cache может уйти на G1/S1, но этот attempt всё равно должен получить свой `frozenProjection`. Она разрешается из frozen projection binding: обычно это `projectionSourceKind="node"` и `projectionSourceNodeId == baseNodeId`; после legacy-compatible consumption node source может указывать на pre-consumption parent; первый attempt self-contained fork/import может использовать `projectionSourceKind="base-seed"`. Current cache никогда не заменяет attempt-frozen projection.

**[VERIFY/P0-F]** Публичный Context Handler даёт `generationType/userId`, а `GENERATION_STARTED` — `generationId/targetMessageId`. Реализация обязана доказать надёжный correlation этих surfaces на target Lumi build. Не придумывать отсутствующее поле.

**Safe fallback:** пока host correlation token/ordering не доказан для overlapping requests, на один `StateScope` допускается максимум одна pending non-dryRun generation. Вторая request должна быть cancel/queue, а не эвристически привязана к «последнему pending context». Отдельный P0-N тестует simultaneous requests.

# 22. GUI mutation во время generation

Сценарий:

```text
generation sees P30
GUI commits P31
model returns patch based on P30
```

Не применять patch поверх P31.

V1 policy:

```text
expected parent != current compatible parent
=> MODEL_COMMIT_CONFLICT
```

Пользователь получает warning и regenerates либо вручную review/rebase.

Будущий safe rebase возможен только для доказанно disjoint paths. Не делать auto-rebase в первой версии.

---

# 23. HeadResolver и active transcript

HeadResolver работает через stable `VariantId`, а не через raw swipe index.

Resolve:

1. получить ordered `getMessages(chatId)`;
2. загрузить current lineage BaseSnapshot + `RootAnchorRecord`; initial state head = `root.tipNodeId` (или baseNodeId, если root tip ещё не менялся);
3. если BaseSnapshot имеет `transcriptBoundary`, найти `throughMessageId` в **этом child/current chat**, пересчитать versioned `activePrefixHash` и byte-for-byte сравнить. Missing boundary message или hash mismatch -> `base_boundary_dirty`, stop fail-closed. Все сообщения через boundary включительно считаются уже materialized into base и **не replay-ятся**;
4. начать transcript state replay с первого сообщения **после** boundary (для fresh genesis без boundary — с начала);
5. восстановить/проверить `VariantIndex` для каждого replayable assistant message;
6. взять active host `swipe_id` и получить stable `variantId`;
7. прочитать `AnchorRecord(variantId)` и ordered immutable `TranscriptAttempt`s;
8. проверить `anchor.initialBaseNodeId === currentHeadBeforeMessage` для first attempt;
9. replay attempts по ordinal;
10. перед каждым attempt после первого сравнить current tip с `nextAttempt.baseNodeId`. Если они различаются, разрешён только доказанный descendant path из GUI/system commits **того же lineage**; advance по нему и затем проверить `StateHash(baseNodeId) === nextAttempt.baseStateHash`;
11. для status=`committed` проверить model commit parent/hash и advance; для `no_patch` state остаётся на attempt base; `ignored` допустим только если resolution evidence доказывает, что variant/segment исключён из canonical transcript либо contradiction закрыт explicit repair commit;
12. `failed_patch/unreconciled` на active unresolved attempt → stop unhealthy. Durable `stopped` attempt также unhealthy до explicit reconciliation и не превращается в `no_patch`; простое «ignore error» при остающемся active RP prose health не восстанавливает;
13. после последнего attempt advance до `anchor.tipNodeId`, проверяя только допустимые post-attempt non-message descendants этого lineage;
14. перейти к следующему transcript message.

Это решает оба gap-а:

```text
assistant A -> P10
GUI edit    -> G11
assistant B -> P12(parent=G11)
```

и Continue внутри одного VariantId:

```text
Variant VA
A1 -> P1
     -> GUI G2
          -> A2(base=G2) -> P3
               -> system S4
                    -> A3(base=S4) -> P5
```

Resolver не требует `A2.baseNodeId === P1`; он допускает только доказанный same-lineage descendant path `P1 -> G2`. Это предотвращает false divergence при законном `GUI -> Continue`.

### Invariant

У каждого active assistant variant есть explicit AnchorRecord и минимум один classified `TranscriptAttempt` даже если state не изменился. До первого assistant существует explicit root anchor, чтобы non-message state не зависел от наличия chat message.

Отсутствие AnchorRecord для уже сохранённого assistant response означает `unreconciled`, а не автоматический no-op.

# 24. Diverged history

Пример:

- msg10 swipe0 produced A;
- msg11 generated from A;
- user switches msg10 to swipe1 produced B;
- msg11 остаётся.

Commit msg11 parent=A, active head before него=B.

Нельзя silently apply.

```text
health.activeLineage = diverged_history
resolved head stops at B
```

UI:

- показывает причину;
- предлагает regenerate/branch/repair.

Если реальный Lumi автоматически truncate/branch-ит такую ситуацию, adapter можно упростить только после P0-D integration test.

---

# 25. Edit semantics

**Pre-base boundary rule first:** если edited message входит в `BaseSnapshot.transcriptBoundary` prefix, ordinary downstream edit-rebuild неприменим — последствия этого prefix уже materialized в base. Пересчитать `activePrefixHash`; mismatch -> `base_boundary_dirty` и explicit rebase/reimport. То же относится к user/assistant content и state-relevant speaker identity внутри prefix.

## Assistant patch изменился

Старый commit immutable.

1. materialize old parent;
2. parse edited patch;
3. validate;
4. create `edit-rebuild` commit;
5. rebind anchor;
6. descendants old commit stale/diverged.

## Assistant prose изменился, patch тот же

Mechanically state тот же, но evidence contract может быть нарушен.

Сравнивать отдельно:

```text
canonicalPatchHash / rawPatchPayloadHash
storedMessageTextHash
```

Если canonical patch unchanged, state можно оставить, но сравнивать current full content прежде всего с `AnchorRecord.storedMessageTextHash` и latest applicable attempt snapshot. **Не сравнивать current full message с A1 hash после lawful Continue A2** — это ожидаемое append evolution, не evidence corruption. Реальный unexplained mismatch помечает `evidenceDirty`/`transcript_dirty`. Raw patch payload hash может меняться только из-за serialization/whitespace и сам по себе не меняет semantic state.

## User message edit

User message обычно не state commit, но downstream generations были сделаны из другого input.

Не удалять events. Пометить descendants transcript dirty; не пытаться автоматически «пересимулировать» мир.

---

# 26. Delete semantics

Если deletion затрагивает message внутри `transcriptBoundary` prefix или сам boundary message, base evidence нарушен: `base_boundary_dirty`; не пересчитывать state простым удалением downstream events.

### Assistant message

- anchored commit перестаёт быть reachable active path;
- event остаётся audit record;
- descendants, зависящие от него, incompatible;
- head пересчитывается.

### User message

- прямой state event обычно отсутствует;
- downstream causal transcript dirty.

### Swipe delete / navigation

Если затронут assistant message **до или на transcriptBoundary**, любое изменение active swipe selection, content, add/delete/reindex, которое меняет canonical active-prefix fingerprint, invalidates base (`base_boundary_dirty`). Child-local VariantId mapping для такого inherited prefix не используется как substitute historical state lineage.

Для replayable post-boundary messages Host `swipeId` — индекс. При deletion:

1. определить удаляемый `variantId` **до** изменения local index;
2. удалить binding deleted index;
3. сдвинуть bindings всех surviving indices `> deleted` на `-1`;
4. AnchorRecord/index data удалённого variant сохранить для diagnostics; immutable attempts/commits сохранить для audit;
5. если удалён active swipe — resolve новый host `swipe_id` через уже reindexed mapping;
6. downstream compatibility пересчитать.

Никогда не rebind surviving content к deleted variant только потому, что numeric index совпал после shift.

---

# 27. Lumiverse Branch: P0

**[LUMI]** Branch создаёт новый chat с history до fork point. В публичном Events списке отдельного `BRANCH_CREATED` event не найден.

Нельзя предположить, что extension storage автоматически копируется.

## Preferred

**[VERIFY]** Проверить current ChatDTO/source:

- `parent_chat_id`?
- `branched_from`?
- fork message metadata?
- сохраняются ли message IDs при branch copy?

Если explicit provenance есть — использовать.

## Fallback bootstrap

При открытии unknown chat:

1. `getMessages`;
2. compute transcript prefix fingerprint **как heuristic candidate search**, не как proof;
3. найти candidate parent FFMVU chats;
4. доказать единственный fork mapping по доступным host provenance/message identity/ordered content;
5. определить **child-local** fork transcript boundary и exact active transcript path through it;
6. resolve parent semantic state node at that exact fork path (включая выбранный assistant swipe/доказанные non-message descendants согласно P0-A policy);
7. resolve **exact next projection of that parent head through its current ProjectionBinding** before child storage is detached; verify its `promptViewHash`;
8. вычислить child-local `TranscriptBaseBoundary { throughMessageId, activePrefixHash, fingerprintVersion }`;
9. создать новый self-contained `BaseSnapshot(kind="fork")` whose `state` = parent resolved state, `projectionSeed` = exact cloned parent next projection, `projectionBinding.sourceKind="base-seed"`, `provenance.projectionContinuity="exact-seed"`;
10. создать child `RootAnchorRecord` с `baseNodeId=tipNodeId=forkBase.id`;
11. сохранить provenance:

```ts
{
  parentChatId,
  parentNodeId,
  forkMessageId
}
```

Если несколько parent candidates одинаково правдоподобны, не выбирать «longest prefix winner» автоматически:

```text
health.activeLineage = branch_origin_ambiguous
```

и требовать explicit user/admin selection либо native provenance.

Новый child chat после bootstrap не зависит от parent storage. Удаление parent не ломает ни materialized child state, ни **первый next MODEL_STATE**. `projectionSeed.sourceProvenance` может ссылаться на parent IDs только диагностически; эти ссылки не dereference-ятся для correctness.

После bootstrap inherited prefix до `transcriptBoundary` является **base evidence**, а не replayable child event history. Навигация на другой pre-boundary swipe, edit/delete/reorder любого state-relevant prefix content или исчезновение boundary message меняет `activePrefixHash` и делает child `base_boundary_dirty`. V1 не пытается «подменить» fork base новым прошлым автоматически: нужен explicit rebase/re-branch/reimport workflow.

---

# 28. New chat и GameStart

Chat без valid BaseSnapshot/store revision:

```text
health.store = uninitialized
health.activeLineage = uninitialized
GameStarted = false
```

GameStart показывается по workflow/preset, без polling.

Triggers:

- frontend mount;
- `CHAT_SWITCHED`;
- `CHAT_CHANGED`;
- explicit GameStart command.

Если branch fork уже имеет `GameStarted=true`, GameStart повторно не показывать.

---

# 29. Restart recovery

Recovery состоит из трёх разделённых стадий: physical StoreJournal recovery, active-lineage/semantic materialization и Transcript reconciliation.

## A. StoreJournal recovery (physical durability only)

```text
1. discover/validate immutable `ChatStoreRevision` records
2. validate predecessorId/predecessorHash/revisionHash links
3. require exactly one healthy physical tip for writable v1 operation
4. if committed siblings share a predecessor -> store_revision_ambiguous, freeze writes
5. verify every revision-referenced BaseSnapshot/StateCommit artifact exists and matches its recorded hash
6. classify event files not referenced by any committed revision as uncommitted_orphan evidence
```

**Никогда не replay gameplay state в StoreRevision order.** Physical journal может последовательно фиксировать transactions разных semantic swipe branches, например `P1A(parent=S0)`, затем `P1B(parent=S0)`, затем `G2A(parent=P1A)`. Их physical durability order не является semantic patch chain.

## B. Active lineage + semantic Materializer

```text
1. HeadResolver derives active VariantId/attempt lineage from transcript
2. resolve exact semantic head node H
3. locate checkpoint that is an ancestor of H
4. follow only BaseSnapshot/StateCommit.parentNodeId ancestry to H
5. replay each node with its recorded reducerVersion
6. verify parentStateHash/resultStateHash
7. resolve `H.projectionBinding`
8. node binding -> materialize source state + historical ProjectionRegistry rebuild; base-seed binding -> verify/read owning BaseSnapshot.projectionSeed locally
9. verify exact projection version/hash, then normalize/validate/cache semantic state and projection separately
```

Hash mismatch:

```text
health.store = broken_hash
```

## C. TranscriptReconciler

После EventStore recovery обязательно сравнить persisted chat transcript с AnchorStore.

Критический crash window:

```text
assistant message saved
↓
backend/extension crashes
↓
GENERATION_ENDED state commit never persisted
```

Для каждого relevant assistant variant:

```text
if AnchorRecord + classified TranscriptAttempt evidence exists:
  verify stored/raw/patch fingerprints in their own domains
else:
  classify missing piece as unreconciled
  inspect canonical/raw evidence if still available
  recover only if base + variant identity + attempt segmentation + patch are unambiguous
```

Outcomes:

- recover committed patch;
- create explicit immutable `no_patch` TranscriptAttempt + rebuild AnchorRecord;
- create/mark immutable `failed_patch` attempt;
- mark `output_unreconciled` when evidence was stripped/lost or identity is ambiguous.

Нельзя считать «event отсутствует» доказательством no-op.

Diagnostics указывает nearest good ancestor, failing record и recovery reason.

# 30. Late MODEL_STATE interceptor

Preset sentinel сохранить:

```xml
<MODEL_STATE>
__FFMVU_LIVE_STATE__
</MODEL_STATE>
```

Transport slot должен быть безопасным даже если replacement вообще не состоялся:

```xml
<MODEL_STATE>
<FFMVU_STATE_TRANSPORT>
__FFMVU_LIVE_STATE__
</FFMVU_STATE_TRANSPORT>
If the transport token remains unresolved, authoritative FFMVU state was not delivered.
Do not advance the fictional scene and do not emit UpdateVariable.
Return only a concise OOC FFMVU state-delivery error.
</MODEL_STATE>
```

Backend:

```ts
spindle.registerInterceptor(async (messages, context) => {
  const attempt = resolveExactPendingAttemptFromVerifiedContext(context)

  const replacement =
    attempt && attempt.health.store === "ok" && attempt.health.activeLineage === "ok"
      ? serializeProjection(attempt.frozenProjection)
      : serializeStateTransportError(attempt)

  return replaceSentinel(messages, replacement)
}, PRIORITY)
```

Требования:

- exact replacement;
- primary lookup identity = exact `attemptId` propagated from pre-assembly context;
- до P0-Q proof допускается fallback lookup только если на `StateScope` существует **ровно один** pending non-dryRun attempt;
- late interceptor никогда не inject-ит `materializedCache.get(scope).projection` для уже начавшейся generation;
- cache/user lookup обязательно user-scoped; `chatId` alone не является cache key;
- если attempt/user scope нельзя доказать, inject error вместо current-state guess;
- warning если sentinel отсутствует;
- no disk replay;
- no migration;
- no worldbook reads;
- no throw;
- минимальная latency.

---

# 31. Fail-closed behavior

Interceptor timeout/error в Lumi fail-open, поэтому exception не является state guard.

**[LUMI]** Context Handler официально поддерживает `cancelGeneration: true` при доступном `preAssemblyGenerationContext` contract и permission `context_handler`.

Preferred guard:

1. Context Handler проверяет health/cache до assembly;
2. unhealthy state → `cancelGeneration: true`;
3. frontend получает понятный FFMVU diagnostic/toast.

Обязательный fallback-in-depth: late interceptor всё равно заменяет sentinel на explicit error contract, если generation каким-либо путём дошёл до assembly:

```xml
<MODEL_STATE_ERROR>
FFMVU state is unavailable or inconsistent.
Do not advance the RP and do not reconstruct state from prose.
Return only a concise OOC transport/state error.
</MODEL_STATE_ERROR>
```

Оба Lumi hook-а fail-open при timeout: Context Handler продолжает generation с previous context, interceptor пропускается и передаёт pre-interceptor messages. Поэтому backend cancellation/injection остаются primary guards, а unresolved-sentinel instruction выше является **semantic last-resort**, не transaction guarantee.

P0-R обязан протестировать одновременный timeout/error обоих hooks. В таком случае модель может получить unresolved sentinel, но не должна получить ложный валидный state и не должна создавать state commit.

# 32. Generation lifecycle

## Pre-assembly Context Handler

- получает `userId/chatId/generationType/dryRun`;
- на `dryRun=true` не создаёт state side effects;
- resolve correct frozen base;
- строит `frozenProjection` и `frozenAuthorization` именно из этого base;
- создаёт local `attemptId`/pending generation context и пытается передать `attemptId` дальше через extension-specific context;
- unhealthy state может cancel generation;
- не мутирует persistent game state.

## `GENERATION_STARTED`

- получает `generationId/chatId/targetMessageId?`;
- correlation-ит event с pending pre-assembly context по P0-F protocol;
- после correlation привязывает `generationId ->` уже frozen `GenerationStateContext`; projection/base повторно не пересчитываются.

Если correlation неоднозначен — fail closed, не выбирать «самый свежий pending» без доказательства.

## `STREAM_TOKEN_RECEIVED`

- UI/stream observation only;
- no state writes.

## `GENERATION_ENDED`

Перед stateful flow проверить generation type:

- `dryRun` — никаких FFMVU writes;
- `impersonate` — read-only FFMVU context only, JSONPatch/state commit запрещены; если host создаёт user draft/message, он не является assistant state transaction;
- normal/regenerate/swipe/continue — stateful flow ниже.

На successful stateful completion:

1. find **exact frozen** generation context / preallocated `attemptId`; если context потерян после reload, не reconstruct из current head/cache;
2. identify exact resulting message **and stable variantId**, не только current `swipe_id`;
3. obtain final raw/canonical output according to verified P0-B lifecycle;
4. extract last JSONPatch and compute distinct raw/canonical/stored hashes;
5. validate semantic parent against captured `baseNodeId/baseStateHash`;
6. policy/resource validate patch against `frozenAuthorization` built from delivered frozen projection;
7. apply/normalize/validate under captured reducer version;
8. result node `R1` = new `kind=model` commit or captured base for no-patch;
9. build **next projection Vnext from R1 before consumption using the attempt/current-lineage recorded `projectionVersion`**; never switch to `ProjectionRegistry.latest` implicitly;
10. before optional bookkeeping, if `R1` is a newly created model node, assign it direct self-binding to `Vnext`;
11. compute/finalize projection-consumption result from `R1/Vnext`:
    - non-empty -> create system `C2(parent=R1, patch=consumptionPatch)` with one-shot binding to R1/Vnext;
    - empty + R1 is newly created in this finalize -> keep R1 direct self-binding and create no bookkeeping node;
    - empty + R1 is existing immutable node whose binding is non-direct **or** whose direct version/hash differs from Vnext -> create system `C2(parent=R1, patch=[])` as `projection-refresh`, unchanged state hash, **direct self-binding to C2/Vnext**;
    - empty + existing direct self-binding already matches Vnext -> create no bookkeeping node;
12. write all newly created semantic node files for this finalize operation, then write **one ChatStoreRevision** whose `committedNodes[]` confirms them in semantic order (`[P1,C2]`, `[P1]`, `[C2]`, or none for pure no-op);
13. final semantic tip = C2 if a consumption/refresh node was created, otherwise R1;
14. build and write **final immutable `TranscriptAttempt`** whose own `promptViewHash` describes projection actually delivered to this attempt, not Vnext;
15. create/update rebuildable AnchorRecord/VariantIndex and set tip to final semantic tip;
16. clear generation context.

Crash rule:

- if the single finalize StoreRevision became durable but attempt/index write did not **and the assistant variant is durably stored**, `StateCommit.anchor.attemptId` + transcript evidence allow reconciliation;
- if StoreRevision/model nodes became durable but the resulting assistant message/variant never reached durable host storage, those nodes remain valid **physical committed forensic artifacts but semantic-unbound**. `HeadResolver` must not activate them because active state is transcript-derived. Do not synthesize a message/Anchor to make the commit reachable; diagnostics may report `committed_unbound`;
- if the assistant variant is durably stored but no corresponding valid Attempt/committed transaction can be proven, classify the variant unreconciled rather than assuming no-op;
- if semantic node files exist but their StoreRevision does not, they are uncommitted orphans and are not partially adopted.

Immutable `TranscriptAttempt` is never written early and then mutated to fill `modelCommitId`.

Valid no patch:

```text
TranscriptAttempt.status = no_patch
TranscriptAttempt.modelCommitId = null
AnchorRecord.status = no_patch
AnchorRecord.tipNodeId = resulting head // baseNodeId, or projection-consumption system descendant if one was created
```

`no_patch` itself не создаёт model state event, но successful turn может создать отдельный `projection-consumption` либо empty-patch `projection-refresh` system commit по parity rules. Поэтому `no_patch` не означает автоматически `committedNodeIds=[]`.

## `GENERATION_STOPPED`

Partial content никогда не state-commit-ится, даже если partial содержит закрытый JSONPatch.

Pending context/stream identity очищается idempotently.

P0-T обязан установить, создаёт ли target Lumi durable assistant message/swipe из stopped partial content.

- если durable variant **не существует**, persistent attempt не выдумывать;
- если durable variant существует **и exact frozen AttemptContext + identity/content доступны**, записать immutable `TranscriptAttempt.status="stopped"`, `AnchorRecord.status="stopped"` и пометить variant/active lineage `transcript_dirty` (`stopped_uncommitted` diagnostic reason);
- если durable assistant output существует, но valid AttemptContext/state-delivery evidence потеряны или никогда не были подтверждены, **не синтезировать stopped/no_patch attempt с выдуманными hashes**: variant = `unreconciled` до regenerate/delete/repair;
- такой variant не может автоматически продолжать stateful lineage: prose мог успеть объявить событие, которое state не commit-ил;
- восстановление только explicit: regenerate/delete variant/manual reconciliation или отдельная доказанная resolution policy;
- `stopped` никогда автоматически не canonicalize-ится в `no_patch`.

## 32.1. Explicit resolution policy: `ignored` не скрывает contradiction

`ignored` сохраняется в schema только как forensic status для **доказанно исключённого** generation evidence, а не как способ принять active prose без соответствующего state.

Healthy resolution допустима только если выполнено одно из двух:

```text
A. discard_variant
   -> variant/segment больше не входит в canonical active transcript
   -> immutable attempt остаётся для audit

B. repair_state
   -> explicit kind=repair commit приводит state в соответствие с принятым durable prose
   -> repair содержит provenance/resolution record
```

Нельзя:

```text
failed/stopped prose remains active
-> click "ignore"
-> continue from old state as healthy
```

Такой путь оставляет model history и MODEL_STATE противоречащими друг другу.

# 33. Malformed model patch

Cases:

- invalid JSON;
- root not array;
- unsupported op;
- invalid/missing path;
- unsafe pointer;
- resource limit exceeded;
- apply error;
- Zod/schema error;
- state validation error;
- parent mismatch;
- variant/generation correlation mismatch.

Поведение:

```text
prose/message may exist
state does NOT advance
immutable failed/unreconciled TranscriptAttempt persists when exact variant is known; AnchorRecord is rebuilt to current failure summary
health.activeLineage -> dirty_patch / schema_error / commit_conflict / output_unreconciled when the failed attempt is active
```

Нельзя молча продолжать со старым state: prose уже мог описать persistent consequence.

StatusMenu показывает:

- chat/message/variant/current swipe index;
- raw patch when available;
- error;
- base node;
- generation/transaction IDs;
- actions:
  - Regenerate
  - Edit response
  - Inspect patch
  - Explicitly ignore state change
  - Manual repair

До resolution следующий normal RP generation fail-closed.

# 34. Patch policy validator

Новый Core должен различать:

```text
JSONPatch syntactically valid
vs
model is authorized to write this path
```

Model generation сохраняет snapshot того projection, который он видел.

До commit проверять:

- path относится к generation-authorized entity/allowed persistent root;
- cold omitted entity не patch-ится как будто модель его видела;
- если current user input/lore/context явно обращается к уже существующей persistent entity, pre-assembly resolver **предпочтительно promotion-ит её в projection**; альтернативно entity должна попасть в explicit generation authorization set с доказанной identity;
- new NPC creation разрешена canonical path;
- new NPC + NextNpcId atomic;
- `ProjectionMeta` never writable;
- routing labels Hot/Warm/Candidates never pointer segments.

GUI/migration используют другой permission profile.

Это отдельный `PatchPolicyValidator`, не часть JSON parser.

---

# 35. Machine JSONPatch и поиск/Memory Cortex: P0

Даже после удаления full `stat_data` из message variables, если `<UpdateVariable><JSONPatch>` хранится в каждом assistant message, он может загрязнять:

- semantic retrieval;
- embeddings;
- prompt history;
- exports;
- user reading.

**[LUMI] Message Content Processor**:

- write-time processor может менять stored `content`;
- render processor меняет только display;
- render output не видят storage, prompt assembly, Memory Cortex, exports;
- swipe write origins поддерживают content transform;
- swipe `extra` всё равно shared.

## Идеальная цель

```text
raw LLM output
  ├─ machine envelopes -> FFMVU EventStore
  └─ player-facing prose -> canonical chat storage
```

Тогда state patches не индексируются как narrative memory.

## Но lifecycle order нельзя угадать

**[LUMI]** Message Content Processor документирован как pre-write hook для **user-initiated** writes. Нельзя считать, что host-generated assistant save проходит его, пока integration test это не доказал.

**P0-B prototype должен выяснить:**

1. `GENERATION_ENDED.content` raw или уже transformed?
2. DB save идёт до/после event?
3. response regex order?
4. host-generated assistant save проходит Message Content Processor?
5. когда строятся Memory Cortex chunks?
6. можно ли гарантированно commit patch до stripping machine envelope?
7. может ли extension-initiated cleanup `updateMessage()` породить `MESSAGE_EDITED`/`SWIPE_EDITED` и сам запустить edit-rebuild?
8. какой reentrancy/origin guard нужен для maintenance mutation?
9. возможен ли durable FFMVU StoreRevision до durable assistant save, и как host ведёт себя при crash между ними?
10. возможен ли durable assistant save до FFMVU finalize, и какой event/message evidence остаётся после crash?

### Preferred

Если raw final output можно получить до canonical storage:

- parse/commit patch;
- persist prose-only message;
- event log хранит raw patch;
- cleanup mutation помечается/suppresses self-generated edit handling по `(scope,messageId,expectedCleanHash)` или explicit maintenance mutation ID.

### Fallback

Если guarantee нет:

- временно хранить raw machine envelope в message;
- скрывать display-only;
- EventStore всё равно authoritative;
- отдельно решить Memory Cortex exclusion.

**Запрет:** не удалять JSONPatch response-regex'ом до того, как StateService гарантированно его получил.

---

# 36. Message display

Для скрытия technical tags можно использовать Lumi display regex/message tag interceptor.

Это visual layer.

State parser не должен зависеть от rendered HTML.

В legacy-imported messages display layer может скрывать:

- UpdateVariable
- UpdateAnalysis
- JSONPatch

Canonical state event уже живёт отдельно.

Если cleanup делает `spindle.chat.updateMessage(...content...)`, canonical content change по умолчанию должен позволить host rebuild `chat_chunks`, чтобы retrieval соответствовал transcript. `skipChunkRebuild: true` допустим только если P0-B/O доказывает, что suppressed rebuild не оставляет machine envelope или другую semantic divergence в Memory Cortex/retrieval.

---

# 37. Continue generation: P0-C

Проверить реальное поведение `generationType="continue"`:

- создаёт ли новый message;
- append-ит ли content active assistant;
- меняет ли active swipe;
- какие events firing;
- можно ли надёжно отделить appended segment/raw machine envelope;
- какой state/projection Continue реально получает перед provider call.

**Architecture requirement независимо от результата spike:** если Continue append-ит к тому же host message/swipe, `VariantId` сохраняется, но создаётся **новый immutable `TranscriptAttempt`** со своими `baseNodeId/baseStateHash`, `projectionSourceKind` + соответствующим node/base-seed provenance и `promptViewHash`. Старый attempt/model commit не перезаписывается. State chain выглядит:

```text
Variant VA
  attempt A1 saw S0 -> model P1 -> S1
  optional GUI/system descendants -> G2/S2
  attempt A2 continue freezes current lawful tip G2/S2 -> model P3
  Anchor(VA).attemptIds = [A1, A2]
  Anchor(VA).tipNodeId = P3 (или последующий GUI/system tip)
```

Если host создаёт отдельный message/variant — binding следует реальному host object и каждый variant всё равно получает собственный attempt.

Hash rule для append: `TranscriptAttempt.storedMessageTextHash` фиксирует **полный canonical stored variant сразу после завершения именно этого attempt**. После A2 current full message естественно уже не совпадает с A1 hash — это не edit/error. `AnchorRecord.storedMessageTextHash` всегда fingerprint текущего полного variant; edit detection сравнивает current content с Anchor/последним applicable attempt, а не требует совпадения со всеми historical attempts. `rawGenerationHash` остаётся evidence generated segment конкретного attempt. P0-C обязан доказать границу appended raw segment для patch extraction.

HeadResolver обязан поддерживать sequence `A1 -> GUI/system descendants -> A2` внутри одного VariantId. Между attempts base continuity доказывается descendant chain, а не равенством предыдущему modelCommitId.

Если P0-C показывает, что append segmentation/base correlation нельзя доказать, FFMVU v1 **отключает/блокирует Continue** для stateful chats вместо угадывания patch ancestry.

---

# 38. Idempotency

Model commit/anchor natural identity не строится на swipe index.

Preferred keys:

```text
Generation attempt: attemptId + generationId (when supplied)
Variant binding: variantId
Model transaction: attemptId + variantId + canonicalPatchHash
GUI transaction: requestId
```

Повторный lifecycle event не создаёт duplicate TranscriptAttempt/commit/Anchor update.

GUI mutation получает frontend `requestId`; backend хранит его в commit metadata и dedupe index/scan window.

# 39. Concurrency

Per-scope mutex:

```ts
Map<scopeKey(userId, chatId), AsyncMutex>
```

Но mutex не заменяет optimistic lock.

Каждая mutation имеет:

```text
expectedHeadNodeId
expectedStateHash
```

Mutex защищает физическую write sequence. Expected head защищает от stale UI/generation semantics.

Закрыть races:

1. GUI во время generation.
2. Swipe navigate во время modal.
3. Regenerate до завершения предыдущего state commit.
4. Edit во время materialization.
5. Chat switch во время GameStart save.
6. Restart после event, до manifest.
7. Два frontend clients.
8. Extension reload между generation end и commit.
9. Branch во время generation.
10. Saved assistant message before event/anchor persistence.
11. Swipe delete/reindex during generation finalization.
12. Maintenance cleanup edit firing lifecycle handlers.
13. Two simultaneous non-dryRun generation requests on one StateScope.
14. Projection-consumption transaction racing model finalization.
15. State transaction durable, but resulting assistant message save fails/crashes.
16. Assistant message durable, but state transaction/final Attempt persistence fails/crashes.

Current audited Lumiverse source уже содержит active generation coordination keyed by `userId:chatId`, но это host implementation detail, а не повод убирать P0-N. До integration proof case 13 всё равно защищается one-pending-generation-per-scope gate; отдельный собственный scheduler не строить, если host guarantee оказывается достаточной.

Strict conflict лучше silent last-write-wins.

---

# 40. State health

Health не должен быть одним chat-global флагом, иначе corrupt/ambiguous **неактивный** старый swipe способен необоснованно заблокировать здоровую active lineage.

```ts
type StateHealth =
  | "uninitialized"
  | "ok"
  | "dirty_patch"
  | "commit_conflict"
  | "diverged_history"
  | "transcript_dirty"
  | "output_unreconciled"
  | "swipe_identity_ambiguous"
  | "branch_origin_ambiguous"
  | "base_boundary_dirty"
  | "store_revision_ambiguous"
  | "broken_hash"
  | "schema_error"
  | "migration_required"
  | "storage_exhausted"

type StateHealthReport = {
  store: StateHealth
  activeLineage: StateHealth
  variants: Record<VariantId, StateHealth> // only non-ok entries need persist/cache
}
```

`MODEL_COMMIT_CONFLICT` — error code; unresolved active conflict = `activeLineage: "commit_conflict"`.

Durable stopped variant использует `activeLineage/variants: "transcript_dirty"` с diagnostic reason `stopped_uncommitted`; отдельный глобальный health enum для него не нужен.

Hard block normal generation when `store != ok` или `activeLineage != ok`. Problem на orphan/inactive variant хранится в `variants` и блокирует generation только если этот lineage становится active/reachable. `broken_hash` на shared reachable ancestry поднимается до `store`/active health.

StatusMenu показывает store + active lineage health всегда и variant-specific issues по запросу.

Explicit resolution создаёт immutable audit evidence. `ignored` возвращает lineage в `ok` только когда evidence доказывает `discard_variant`/исключение из canonical transcript; сохранение active contradictory prose требует `kind=repair` state commit. Простое overwrite health или «ignore and continue» запрещено.

# 41. GameStart target API

Frontend payload:

```ts
interface GameStartPayload {
  date: string
  time: string
  weather: string
  location: string

  name: string
  age: string
  gender: string
  race: string
  occupation: string
  mental: string

  charisma: number
  level: number
  exp: number
  core: number

  stats: {
    str: number
    agi: number
    con: number
    int: number
    wis: number
  }

  weaponRequest: string

  expectedScope: StateScope
  expectedHeadNodeId: string | null
  expectedTranscriptFingerprint: string
}
```

Backend `createGenesis()` authoritative:

- active/requesting user и chat соответствуют `expectedScope`;
- transcript fingerprint/head всё ещё те, для которых menu был открыт; physical store revision всегда перечитывается backend под mutex и не является frontend semantic lock;
- valid H:MM/HH:MM 24h clock;
- Charisma integer 80–100;
- each allocatable stat >= 5;
- **legacy parity pool:** `sum(stat - 5) <= 50`; legacy UI не требовал потратить все 50;
- level/exp/core bounds;
- current formulas for HP/MP/Stamina/combat stats;
- Scene.LocationKey;
- Scene.Changed=true;
- GameStarted=true;
- Starting_weapon_request/status;
- normalize;
- schema validate;
- validateState;
- write immutable `BaseSnapshot(kind="genesis")`;
- create `RootAnchorRecord { baseNodeId: base.id, tipNodeId: base.id }`;
- append initial hash-linked `ChatStoreRevision` for the genesis base;
- build projection/cache; active head is then derived as `root.tipNodeId`.

Frontend validation — только UX.

# 42. StatusMenu target UI

Начать с native drawer tab.

Плюсы:

- не живёт в chat message;
- не зависит от regex;
- event-driven refresh;
- нормальный lifecycle cleanup;
- естественный постоянный HUD/state inspector.

GameStart лучше делать через frontend `ctx.ui.showModal()` или отдельный frontend overlay, если modal layout недостаточен.

Frontend получает:

```ts
interface StatusViewDTO {
  headNodeId: string
  stateHash: string
  storeRevision: number
  storeRevisionId: string
  health: StateHealthReport
  state: FFMVUState
}
```

V1 может отправлять full state только **по RPC в UI**, потому что это не persistence. Позже можно сделать отдельный UI projection.

---

# 43. GUI mutation API

Обычный UI не отправляет full state.

Примеры intents:

```ts
type GuiIntent =
  | {
      type: "set_field"
      path: string
      value: unknown
      expectedHeadNodeId: string
      requestId: string
    }
  | {
      type: "move_outfit"
      owner: ActorRef
      itemKey: string
      from: "Worn" | "Wardrobe"
      to: "Worn" | "Wardrobe"
      expectedHeadNodeId: string
      requestId: string
    }
  | {
      type: "equip_item"
      owner: ActorRef
      itemKey: string
      expectedHeadNodeId: string
      requestId: string
    }
  | {
      type: "unequip_item"
      owner: ActorRef
      itemKey: string
      expectedHeadNodeId: string
      requestId: string
    }
  | {
      type: "delete_item"
      owner: ActorRef
      bucket: "Inventory" | "Equipment"
      itemKey: string
      expectedHeadNodeId: string
      requestId: string
    }
```

Backend:

1. recheck expected head under mutex;
2. convert intent -> minimal patch;
3. apply domain rules;
4. validate;
5. определить active `LineageAnchorId` (`"root"` до первого assistant, иначе terminal VariantId);
6. commit `kind=gui` с `lineageAnchorId`;
7. update corresponding root/variant `tipNodeId` как rebuildable index;
8. return new head/storeRevision/state hash.

Conflict:

- backend rejects;
- frontend refreshes;
- frontend не retries mutation автоматически.

---

# 44. Manual JSON repair

Нужна возможность чинить state руками, но отдельно от ordinary UX.

Workflow:

1. backend даёт current full state + head;
2. user edits JSON;
3. submit edited doc + expectedHead;
4. backend computes diff;
5. normalizes/validates;
6. rejects unsafe/invalid;
7. commits `kind=repair`.

Не заменять snapshot silently.

Legacy/admin endpoint `adoptLegacyFullState()` допустим только для import/recovery.

---

# 45. Starting weapon one-shot

Сохранить:

```text
Starting_weapon_request
Starting_weapon_status = none | pending | fulfilled
```

GameStart:

```text
request empty -> none
request non-empty -> pending
```

Позже model/mechanic создаёт один weapon и ставит `fulfilled`.

Swipes должны иметь independent outcomes: alternate swipe может fulfillment сделать иначе, но parent chain предотвращает double grant.

---

# 46. Outfit semantics

`Outfit.Initialized` persistent.

Не переинициализировать wardrobe при UI render или projection build.

Инициализация — explicit state event.

Stable item identity сохранять; normalizer не должен плодить duplicate keys/tombstones.

Backend `moveOutfit` обязан:

- owner isolation;
- conflict Slot+Layer resolution;
- atomic Worn/Wardrobe move;
- no duplicate/no missing item mid-commit.

---

# 47. Equipment semantics

До портирования выписать все bonus fields из legacy StatusMenu и сделать tests.

Инварианты:

- equip applies bonus exactly once;
- unequip exactly reverses;
- inventory/equipment transfer atomic;
- item cannot be both inventory and equipped unless schema специально это допускает;
- derived stats recalculated consistently;
- model/GUI не применяют equipment bonuses вторично поверх уже derived values.

---

# 48. Full State, Model Projection, UI View, Audit Diff — разные вещи

Не создавать один giant DTO ради всех целей.

```text
FFMVUState          full persistent DB
ModelStateView      filtered prompt projection
PromptView          implementation alias of ModelStateView used by projection/runtime contracts
StatusViewDTO       frontend/UI data
DiffView            human-readable event changes
```

Model projection экономит tokens.

UI может видеть cold records.

Audit знает exact patch.

---

# 49. Lorebook migration

Legacy StatusMenu использует concept «current character primary lorebook».

В Lumi character может иметь несколько `world_book_ids`, плюс persona/chat/global books.

Не выбирать «первую книгу».

Target binding:

```ts
interface LoreBinding {
  logicalKey: string
  bookId: string
  entryId: string
}
```

Либо stable extension metadata marker внутри entry.

GUI fetch/update по exact IDs.

## Dynamic activation

Если state реально должен управлять activation, использовать `registerWorldInfoInterceptor()`:

- disable;
- enable;
- force;
- per-turn content override.

Но стандартную keyword/vector/sticky activation не заменять без причины.

---

# 50. Regex migration

Разделить legacy regex по назначению.

## A. StatusMenu injection

Удалить после native UI.

## B. Display transforms

Перенести на Lumi display regex/tag layer.

Подходит для machine wrapper hiding.

## C. Response transforms

Осторожно: могут изменить canonical stored content. Не удалять JSONPatch, пока P0 output-extraction не доказал безопасный lifecycle.

## D. Prompt transforms

Переносить только если реально есть такие regex. Для каждого script сделать fixture comparison.

Lumiverse может импортировать ST-style regex, но импорт формата не гарантирует identical lifecycle.

---

# 51. Preset migration strategy

Не делать тупой JSON→JSON converter без semantic mapping.

## 51.1. Сначала полный Preset Surface Inventory

Исходный ST preset содержит не только prompt blocks. Phase 0 обязан перечислить **все top-level keys** исходного JSON и классифицировать каждый:

```text
source key
source value/hash
preserve as-is
map to Lumi equivalent
intentionally drop
not applicable
VERIFY
```

В inventory входят как минимум:

- sampling/provider parameters (`temperature`, `top_p`, max tokens/context и т.д.);
- stream/continue behavior;
- `impersonation_prompt`, `continue_nudge_prompt`, group nudges;
- system/assistant prefill controls;
- reasoning/tool/function settings;
- media/context flags;
- prompt blocks;
- `prompt_order`;
- любые preset-specific extension fields.

Нельзя объявлять preset parity после переноса только textual prompts.

## 51.2. Block mapping

Для каждого ST block построить:

```text
identifier/name
enabled
system_prompt
role
injection_position
injection_depth
injection_order
forbid_overrides
marker
generation trigger
group/category
content hash
```

И target Lumi block.

`prompt_order` и actual ST assembled order должны быть frozen отдельно: JSON array order сам по себе не всегда равен final injection order.

## Structural markers

Legacy markers:

- Lorebook Before
- Persona
- Char Description
- Char Personality
- Scenario
- Lorebook After
- Chat Examples
- Chat History

имеют Lumi-native equivalents, но semantic placement подтверждается Dry Run.

## Toggle separators

Legacy visual blocks вида:

```text
=Pick one POV=
=Pick one NSFW Toggle=
```

заменить category markers/radio/checkbox groups, если это не меняет model-visible output. Separator text модели не отправлять.

## Prompt Variables

Использовать для user-editable preset options, где это действительно улучшает UX.

## Macro audit

Lumi macro evaluation order отличается от ST. Любой macro с side effect проверять отдельно.

Persistent FFMVU state не зависит от `setchatvar` macro mutations.

# 52. Prompt parity через Dry Run

Lumiverse `generate.dryRun()` использовать как regression surface.

Golden scenarios:

```text
same card
same persona
same scenario
same worldbook state
same chat history
same preset toggles
```

Сравнивать ST reference и Lumi:

- block order;
- roles;
- placement/depth;
- card/persona/scenario markers;
- world info positions;
- examples/history;
- state block;
- output contract;
- final wrapper grammar placement.

Не требовать byte-identical assembly, если Lumi объединяет messages иначе, но semantic authority/order должны сохраниться.

---

# 53. World Info diagnostics

StatusMenu/Settings полезно показывать:

```text
Attached books:
- character
- persona
- chat
- global

FFMVU bindings:
logicalKey -> bookId / entryId

Currently activated:
entry IDs + source scope
```

Missing binding = warning, а не случайный fallback.

---

# 54. Tools

В текущем наборе отдельный FFMVU tool implementation не найден.

Поэтому:

- не запрашивать `tools` permission до появления tool;
- не превращать механики в tools без причины;
- будущий state-mutating tool вызывает тот же `StateService.commitPatch`;
- tool не пишет `spindle.variables` напрямую;
- tool participates in same locks/hashes/audit.

---

# 55. Portraits/images

Legacy StatusMenu умеет URL/base64/local/compression.

Не хранить большие base64 в FFMVU state.

Target:

```text
FFMVU state -> stable asset reference
asset bytes -> extension/native image storage
```

Если image является card portrait — использовать native character/media path.

Если runtime NPC portrait — extension asset ID.

Точный mapping после инвентаризации текущих image sources.

---

# 56. State history / audit UI

Event sourcing позволяет нормальный forensic view.

Пример:

```text
Commit 421
kind: model
message: msg_x
swipe: 2
parent: 420
stateHash: ...
patchHash: ...

~ /World/Time/0
  "18:31" -> "18:42"

+ /Narrative/NPCs/npc_0007
- /Mainchar/Inventory/Факел
```

Filters:

- model;
- GUI;
- genesis/GameStart;
- system;
- migration;
- repair;
- path;
- actor/entity ID.

Raw patch authoritative. Human diff вычисляется из parent state, не обязательно дублируется в event.

---

# 57. Search/indexing strategy

Narrative semantic search и state history не смешивать.

```text
Lumiverse/Memory Cortex:
  prose/dialogue/world narrative

FFMVU EventStore:
  structured state deltas
```

Для state queries достаточно точных indexes:

```text
commits where path starts /Narrative/NPCs/npc_0001
commits changing /World/Location/0
kind=model
kind=gui
```

Не использовать embeddings для state audit, пока path/entity search точнее.

Главная цель P0 output-extraction — убрать machine JSONPatch из narrative index, если lifecycle позволяет.

---

# 58. Schema migration

Каждый base/commit/checkpoint имеет:

```text
stateSchemaVersion
reducerVersion
```

`normalizeState()` является частью reducer semantics, а не вечным mutable helper.

```ts
interface ReducerRegistry {
  get(version: string): StateReducer
}
```

Старый event всегда replay-ится reducer version, которым был создан. Изменение archive trimming, alias normalization, tombstone logic, defaults или другой normalization semantics требует нового `reducerVersion`.

**Frozen reducer rule:** reducer `rN` владеет собственными defaults/constants/normalization helpers либо imports only versioned immutable modules. Historical reducer не импортирует `CURRENT_DEFAULT_STATE`, `CURRENT_VERSION` или другой mutable latest alias. Upgrade latest defaults не должен менять hash replay старого fixture.

Upgrade:

1. materialize latest valid state старым reducer chain;
2. deterministic schema migration;
3. validate;
4. создать explicit `migration` commit (или migration boundary snapshot, если ADR обоснует full snapshot);
5. checkpoint после migration;
6. update manifest/reducer version;
7. old events immutable и всё ещё replayable их reducer versions.

Не переписывать историю in-place. Не replay-ить старую историю новым `normalizeState()` и затем обвинять hashes в corruption.

Тот же historical freeze contract применяется к `ProjectionRegistry`: latest projection constants не могут менять воспроизведение старого `promptViewHash`. Переход live lineage на новый projectionVersion — explicit `projection-upgrade` system commit по §4.2, а не lazy replacement старого binding во время interceptor/finalize.

# 59. Legacy ST importer

Legacy migration имеет два официальных fidelity tier-а.

### Tier 1 — Functional Continuity (default)

Если доступен trusted latest/full state, но historical per-message evidence неполон:

```text
trusted legacy stat_data
  -> frozen legacy normalize/validate
  -> determine current-chat transcript boundary represented by that snapshot
  -> hash active transcript prefix through boundary
  -> if trusted exact ff_mvu_prompt_view exists: embed ProjectionSeed + sourceKind="base-seed"
  -> else: build direct projection from imported state + mark projectionContinuity="reconstructed-from-state"
  -> BaseSnapshot(kind="legacy-import", transcriptBoundary=...)
  -> RootAnchorRecord
  -> новые Lumi turns event-sourced only AFTER that boundary
```

Это полноценный supported migration mode: сохраняется текущая игровая реальность, но старый forensic DAG не выдумывается.
Snapshot-only importer обязан записать `TranscriptBaseBoundary`; иначе HeadResolver после import повторно пройдёт старые assistant messages и либо удвоит mutations, либо объявит их unreconciled.

Если exact legacy `ff_mvu_prompt_view` value доступен и его provenance/hash согласованы с trusted snapshot metadata, importer **должен** сохранить этот value как `projectionSeed`, потому что legacy view мог быть построен pre-consumption и не равняться `buildPromptView(imported stat_data)`. Новый `promptViewHash` вычисляется по canonical Lumi transport serialization; исходный legacy ProjectionHash сохраняется в `sourceProvenance.legacyProjectionHash`, а не переиспользуется как будто hash contracts идентичны. Seed получает **registered legacy-compatible `projectionVersion`**, потому что после первого attempt следующую projection всё равно надо уметь построить с теми же semantics; exact seed не является разрешением на implicit version jump. Если prompt-view bytes недоступны, migration остаётся supported Functional Continuity по state, но exact first-turn projection parity считается недоказанной; `provenance.projectionContinuity="reconstructed-from-state"` делает это видимым diagnostics/export. Это **не** делает импортированный state unhealthy и не требует искусственно повторять audit: деградация относится только к доказуемой идентичности первого post-import MODEL_STATE.

### Tier 2 — Full Historical Reconstruction

Разрешён только когда source предоставляет достаточные message/swipe vars, snapshot metadata, raw patch evidence и identity mapping для deterministic reconstruction. Любой недоказанный участок downgrade-ится до Tier 1 boundary, а не synthesizes history.


**[LUMI]** Lumiverse уже имеет one-time SillyTavern migration (`LUMIVERSE_ST_MIGRATE`) и target `5=everything`, включая chats. Поэтому FFMVU importer по умолчанию **не должен повторно импортировать host entities**.

Preferred architecture:

```text
Native Lumiverse ST migration
  ↓
normal Lumi characters/personas/worldbooks/chats/messages/swipes
  ↓
FFMVU augmentation importer
  ↓
legacy stat_data / JSONPatch evidence -> FFMVU BaseSnapshot + DAG
```

Phase 0/P0-K обязан установить mapping legacy ST identities -> imported Lumi identities, особенно для:

- chat;
- message;
- swipe;
- group chat;
- branch/history copies.

**Identity mapping недостаточен.** P0-O отдельно обязан установить **legacy evidence acquisition contract**: откуда после native migration FFMVU получает `stat_data`, `ff_mvu_snapshot_meta`, TavernHelper/MVU message variables и raw `<JSONPatch>` evidence. Extension-scoped `userStorage` не даёт произвольный доступ к старой ST директории, поэтому источник нельзя подразумевать.

Допустимы только доказанные modes:

```text
A. native migration сохраняет нужные legacy vars/metadata в известном Lumi namespace;
B. migration/import pipeline отдаёт explicit mapping/evidence sidecar;
C. пользователь предоставляет отдельный raw ST JSONL/export, который importer сопоставляет с Lumi identities.
```

Если ни один mode не доступен, разрешён только trusted latest snapshot -> `BaseSnapshot(kind="legacy-import", transcriptBoundary=...)`; historical DAG не реконструируется фиктивно. Importer обязан доказать, какой current-chat transcript prefix уже представлен этим snapshot, и закрепить его boundary fingerprint.

FFMVU augmentation importer использует доступные legacy данные без выдумывания.

Ideal:

1. inspect already-imported Lumi chat/messages/swipes;
2. read matching ST source/export metadata;
3. read per-message MVU vars, если source содержит;
4. find GameStart/trusted base;
5. extract assistant JSONPatch history;
6. reconstruct legacy lineage;
7. allocate internal VariantIds against Lumi swipe set;
8. build FFMVU commit DAG/AnchorRecords;
9. compare final materialized state with trusted legacy state;
10. checkpoint;
11. preserve legacy IDs/hashes in provenance.

Если export содержит только latest full snapshot без historical vars:

- определить child/current-chat transcript boundary, уже представленный snapshot-ом;
- использовать snapshot как `BaseSnapshot(kind="legacy-import", transcriptBoundary=...)`;
- если exact compatible `ff_mvu_prompt_view` value тоже есть — canonicalize его по Lumi contract и embed как `ProjectionSeed`; иначе создать direct node self-binding из imported state и пометить `projectionContinuity="reconstructed-from-state"`;
- создать `RootAnchorRecord` на imported base;
- не выдумывать старые commits;
- новые Lumi changes дальше event-sourced.

Если native migration не использовалась и FFMVU должен работать по raw ST export напрямую — это отдельный importer mode/ADR, не implicit fallback.

# 60. Source of truth hierarchy

Mutable facts:

```text
1. validated active FFMVU materialized state
2. current explicit player input + completed current gametxt
3. card/scenario/lore
```

Event history объясняет, как state дошёл до current.

Prose не заменяет DB.

Cold omission не означает deletion.

---

# 61. Что переносить почти без изменений

Pure/platform-independent:

- default state;
- schema;
- normalizeState;
- projection migration helpers;
- clothing/outfit normalization;
- tombstone cleanup;
- actor alias/canonical refs;
- relationship normalization;
- archive compaction;
- candidate scoring;
- `buildPromptView`;
- JSON pointer parser/safety;
- JSONPatch apply;
- tuple canonicalization;
- `validateState`;
- patch extraction;
- GameStart formulas;
- wardrobe domain rules;
- equipment math;
- preset textual modules;
- CharMaker design.

---

# 62. Что удалить/заменить

| ST dependency | Lumi target |
|---|---|
| `window.parent`/runtime bridge | backend/frontend Spindle split |
| `SillyTavern.chat` | `spindle.chat.getMessages(chatId)` |
| integer message IDs | string IDs + ordered arrays |
| message MVU variables | EventStore/Base/anchors in `spindle.userStorage` |
| `Mvu.getMvuData`/replace | удалить |
| TavernHelper variable writers | удалить |
| `VARIABLE_UPDATE_ENDED` | удалить normal reconciliation |
| `eventOn` | `spindle.on()` |
| `CHAT_COMPLETION_PROMPT_READY` | `registerInterceptor()` |
| `GENERATE_AFTER_DATA` | Lumi lifecycle/interceptor |
| timers/polling | native events |
| full snapshot every message | commits + checkpoints |
| StatusMenu regex HTML | drawer frontend |
| GameStart iframe | frontend modal |
| primary lore helper | World Books API |
| ST regex | Lumi Regex API |
| ST tool glue | native `registerTool` при наличии |
| ST prompt injection model | Prompt Blocks/groups/variables |

---

# 63. `StateService` facade

```ts
interface StateService {
  initializeChat(scope: StateScope): Promise<StateStatus>

  resolveActiveHead(scope: StateScope): Promise<MaterializedHead>

  getState(scope: StateScope): Promise<FFMVUState>
  getProjection(scope: StateScope): Promise<ModelStateView>

  createGenesis(
    payload: GameStartPayload
  ): Promise<CommitResult>

  commitModelPatch(input: ModelCommitInput): Promise<CommitResult>
  commitGuiIntent(input: GuiIntent): Promise<CommitResult>
  rebuildAfterEdit(input: EditRebuildInput): Promise<CommitResult>

  materialize(scope: StateScope, nodeId: string): Promise<FFMVUState>

  getHistory(
    scope: StateScope,
    options?: HistoryQuery
  ): Promise<StateCommit[]>

  reconcileTranscript(scope: StateScope): Promise<StateDiagnostics>
  diagnose(scope: StateScope): Promise<StateDiagnostics>
  createCheckpoint(scope: StateScope): Promise<StateCheckpoint>
}
```

Frontend не работает с EventStore напрямую.

```ts
interface CommitResult {
  stateChanged: boolean       // canonical FFMVUState bytes changed
  lineageChanged: boolean     // a new semantic node/head was created, even if state bytes are equal
  transactionId: string | null
  storeRevisionId: string | null
  committedNodeIds: string[]
  resultingHeadNodeId: string
  resultingStateHash: string

  projectionSourceKind: "node" | "base-seed"
  projectionSourceNodeId?: string
  projectionSourceStateHash?: string
  projectionSourceBaseId?: string
  projectionVersion: string
  promptViewHash: string
}
```

`committedNodeIds` может содержать несколько semantic nodes одной physical transaction (`[P1,C2]`). `stateChanged` означает изменение canonical `FFMVUState` bytes; projection-only system commit может иметь `stateChanged=false`, но `lineageChanged=true` и непустой `committedNodeIds`. Pure no-op без state **и** projection/bookkeeping mutation возвращает пустой array и `storeRevisionId=null`.

Model commit input:

```ts
interface ModelCommitInput {
  scope: StateScope
  attemptId: string
  generationId?: string
  generationType: string
  messageId: string
  variantId: VariantId

  expectedParentNodeId: string
  expectedParentStateHash: string

  projectionSourceKind: "node" | "base-seed"
  projectionSourceNodeId?: string
  projectionSourceStateHash?: string
  projectionSourceBaseId?: string
  projectionVersion: string
  promptViewHash: string

  rawOutput: string
  storedMessageText: string
  presetVersion?: string
}
```

StateService сам extracts/parses patch; caller не передаёт «уже доверенный» patch/state.

# 64. World time

Не путать game clock с:

- message timestamp;
- wall clock;
- generation duration.

`World.Time` меняется только game logic/GameStart/validated patch.

---

# 65. Group chats

State принадлежит user-scoped timeline/chat, а не конкретному target character.

Group speaker может меняться, но stable anchor остаётся:

```text
StateScope(userId,chatId) + messageId + VariantId
```

Не создавать отдельную DB на member character, если текущая система этого не делает.

Group-speaker/character attribution хранится как transcript provenance, не как state namespace.

# 66. Transport integrity

На generation сохранять:

```text
attemptId/generationId
StateScope
baseNodeId
baseStateHash
projectionVersion
promptProtocolVersion
promptViewHash
presetVersion when applicable
targetMessageId/targetVariantId when known
```

Returned model patch parent-ится к state, который модель **реально видела**, а не к state, который оказался current позже.

Current host `swipe_id` после generation не используется как единственное доказательство identity resulting variant.

# 67. No-op и multiple patches

Current parser использует последний `<JSONPatch>`.

Сохранить compatibility, но diagnostics warning при multiple blocks.

Valid no-op/no-patch:

- semantic `StateCommit` не создаётся;
- **AnchorRecord создаётся обязательно** со status=`no_patch`;
- это отличает намеренный no-op от missed lifecycle/recovery failure.

Если model patch заменяет value тем же value, можно canonicalize/collapse в no-op только детерминированно и с diagnostics; не менять semantics произвольно.

# 68. Security

- prototype pollution protection;
- backend schema validation всех RPC;
- generic `set_field` ограничить allowlist/path policy;
- frontend-provided hashes не доверять — recompute;
- no eval;
- worldbook content = data;
- safe DOM APIs;
- imported HTML не исполнять как code;
- event/base/attempt/store-revision files immutable;
- per-user authoritative storage isolation;
- reject non-JSON values before canonical hashing;
- resource limits for model-controlled patch input.

Initial hard limits должны быть constants/settings и покрываться tests:

```text
MAX_PATCH_BYTES
MAX_PATCH_OPERATIONS
MAX_POINTER_LENGTH
MAX_POINTER_DEPTH
MAX_SINGLE_VALUE_BYTES
MAX_RESULT_STATE_BYTES (diagnostic/guard, tuned by fixtures)
```

При limit violation state не меняется; AnchorRecord получает failed patch diagnostics.

# 69. Permissions

Начальный manifest просит только реально используемые gated capabilities.

Core lifecycle ориентировочно требует:

```json
{
  "permissions": [
    "generation",
    "context_handler",
    "interceptor",
    "chat_mutation",
    "chats"
  ]
}
```

Дополнительно по feature:

- `world_books` — только если StatusMenu/adapter реально CRUD-ит books/entries;
- `presets` — только если extension сам импортирует/создаёт/правит Lumi preset;
- `tools` — только при реальном custom tool;
- `memories` — только если FFMVU напрямую управляет Memory Cortex;
- `regex_scripts` — если extension CRUD-ит Regex API/scripts;
- `ui_panels` не нужен для обычного Drawer Tab.

**[LUMI]** storage, userStorage, events, drawer tabs и frontend/backend messaging относятся к free-tier capabilities. Generation-event subscription требует `generation`.

Permissions live-updatable: feature registration должна корректно переживать grant/revoke, а не предполагать restart.

# 70. Versioning

Развести версии:

```text
extensionVersion
eventFormatVersion
stateSchemaVersion
reducerVersion
projectionVersion
presetVersion
canonicalHashVersion
promptProtocolVersion
```

Не один `VERSION` на всё.

Пример:

```ts
const EXTENSION_VERSION = "2.0.0"
const EVENT_FORMAT_VERSION = "3"
const STATE_SCHEMA_VERSION = "1.5.8-lumi.1"
const REDUCER_VERSION = "1.5.8-lumi.r1"
const PROJECTION_VERSION = "2"
const CANONICAL_HASH_VERSION = "1"
const PROMPT_PROTOCOL_VERSION = "1"
```

v2.4 меняет **durable event/binding format**, поэтому `EVENT_FORMAT_VERSION` повышается. Сам `buildPromptView` selection algorithm этим hardening-pass не меняется, поэтому `PROJECTION_VERSION` **не повышать только из-за ProjectionSeed**; новый projectionVersion нужен лишь при реальном observable изменении projection semantics.

Legacy `MVUStatMenu_DB_Ver` можно сохранить для compatibility, а позже заменить отдельной migration.

`projectionVersion` + `promptProtocolVersion` записывать в `TranscriptAttempt`; `presetVersion` записывать, когда preset/config surface влияет на generation. Один `promptViewHash` без версии алгоритма недостаточен для forensic reproduction.

# 71. P0 spikes до production implementation

Эти места нельзя считать закрытыми архитектурным предположением. Некоторые API-факты уже подтверждены docs, но end-to-end semantics всё равно требуют integration tests.

## P0-A — Branch provenance

Проверить на установленном Lumi:

- ChatDTO после Branch;
- parent/fork metadata;
- сохраняются ли исходные message IDs;
- backend/frontend events;
- branch group chat;
- branch from assistant non-zero swipe;
- копируются ли все swipe variants и какой active swipe selection получает child;
- можно ли однозначно определить child-local `throughMessageId` + active prefix path для `TranscriptBaseBoundary`;
- child bootstrap способен получить parent resolved **next projection** до отделения storage и записать её как exact seed; после удаления parent child first generation получает тот же `promptViewHash`.

Deliverable:

```text
docs/spikes/branch-provenance.md
tests/integration/branch-provenance.test.ts
```

## P0-B — Output extraction / persistence / Memory Cortex order

Проверить:

- raw `GENERATION_ENDED.content`;
- saved `message.content`;
- response regex timing;
- Message Content Processor timing;
- host-generated assistant save проходит ли Message Content Processor;
- Memory Cortex chunk rebuild timing;
- export content;
- self-generated cleanup edit events/reentrancy;
- crash/order case A: assistant variant durable, FFMVU transaction absent/unfinished;
- crash/order case B: FFMVU StoreRevision durable, assistant variant save absent/failed.

Цель: извлечь JSONPatch и убрать machine envelope из narrative storage **только после доказанного durable state capture**. Case A обязан стать `unreconciled`, если transaction нельзя однозначно восстановить. Case B не откатывает physical journal, но committed semantic nodes остаются unreachable/unbound и не влияют на active state, пока transcript их не адресует.

`TranscriptAttempt.storedMessageTextHash` должен описывать **окончательный canonical host-stored content после response transforms/maintenance cleanup**, а не промежуточный raw envelope. Если `GENERATION_ENDED` fires раньше окончательного canonical save, immutable Attempt finalization откладывается до доказанного save/cleanup boundary либо schema хранит отдельные pre/post hashes. Нельзя записать pre-cleanup hash как будто это final stored evidence.

Deliverable:

```text
docs/spikes/output-extraction.md
tests/fault-injection/output-crash-window.test.ts
```

## P0-C — Continue generation

Проверить DB/swipe semantics, lifecycle events, variant identity и patch extraction при append. Отдельно доказать, что historical A1 full-message hash после lawful A2 append не классифицируется как edit; current Anchor/latest attempt hash остаётся authoritative fingerprint текущего variant.

## P0-D — Old swipe navigation with descendants

Проверить, что host делает с downstream history и когда FFMVU должен объявлять divergence.

## P0-E — Context guard capability

API capability закрыта docs: Context Handler поддерживает `cancelGeneration`, но timeout самого handler-а fail-open и generation продолжается с previous context. Integration test должен подтвердить contract/version availability, permission behavior и ordinary cancellation. Полный double-failure transport case закрывает P0-R.

## P0-F — Generation identity correlation

Доказать correlation:

```text
pre-assembly Context Handler
  userId + chatId + generationType
        ↕
GENERATION_STARTED
  generationId + targetMessageId
        ↕
resulting message + exact variant
```

Проверить actual `lumiverse-spindle-types` и current host source на дополнительные typed fields. Нельзя использовать undocumented field без contract/test.

Также доказать, как `userId` из pre-assembly/user context доходит до interceptor/event handlers. Для operator-scoped install любой state lookup без доказанного user scope запрещён.

Если unique correlation token отсутствует, доказать one-pending-generation-per-StateScope gate; matching по «самому свежему pending context» запрещён.

## P0-G — Swipe identity/reindex/wholesale rewrite

Tests:

- A/B/C -> delete B -> C сохраняет VariantId;
- delete active/non-active;
- update inactive swipe;
- navigate;
- wholesale SWIPE_EDITED reorder/replace;
- ambiguous duplicate text/fingerprint -> fail closed.

## P0-H — Non-message commit tip semantics

Доказать sequences:

```text
genesis -> GUI -> first assistant
assistant -> GUI -> assistant
assistant -> GUI -> swipe navigate
assistant -> system projection-consumption -> assistant
same Variant: A1 -> GUI -> Continue A2
same Variant: A1 -> system -> Continue A2
```

HeadResolver не теряет GUI/system commits и не создаёт false divergence, включая legal descendants между attempts.

## P0-I — Storage atomicity/crash protocol

Не предполагать atomic `move`. Fault injection:

- crash after first semantic node file of a multi-node finalize (`P1` written, `C2` not yet);
- crash after all semantic node files but before StoreRevision;
- crash after checkpoint;
- crash after immutable StoreRevision;
- crash before anchor update;
- corrupt advisory head;
- competing valid siblings.

Любые competing **committed** StoreRevision siblings = `store_revision_ambiguous` и freeze writes; v1 не выбирает continuation автоматически даже при «правдоподобной» provenance. Semantic node artifact без committed StoreRevision остаётся `uncommitted_orphan` и не auto-adopt-ится; reconciliation создаёт новую transaction при доказанном intent.

## P0-J — Saved-message-without-event recovery

Смоделировать kill/reload после DB save assistant message и до StateService commit. TranscriptReconciler должен recover/classify, а не принять no-op.

## P0-K — Native ST migration identity mapping

Проверить штатный Lumi ST migration и снять mapping legacy -> Lumi:

- chat IDs;
- message IDs;
- swipe ordering;
- groups;
- branches/history copies.

FFMVU importer после этого работает как augmentation, а не дублирующий host importer.

## P0-L — Operator-scope user correlation

Events вроде `MESSAGE_SWIPED` документируют `chatId`, но не обязаны нести `userId`. Доказать на target runtime, как operator-scoped backend получает requesting/owning user для:

- chat/swipe events;
- generation events;
- interceptor;
- frontend RPC;
- restart reconciliation.

До закрытия P0-L production support может быть ограничен user-scoped installation. Нельзя компенсировать неизвестный user scope global cache lookup-ом по одному `chatId`.

## P0-M — Data portability / authoritative userStorage

Round-trip `.lvbak` на fresh account/instance и проверить сохранность FFMVU `userStorage` byte/semantic content. Если native archive не переносит extension user storage, зафиксировать собственный FFMVU export/import format до production.

## P0-N — Concurrent generation correlation

Запустить две максимально одновременные non-dryRun generation на одном `StateScope` и доказать deterministic ContextHandler -> generationId -> resulting variant correlation. Current source имеет per-chat active-generation coordination keyed by `userId:chatId`; spike обязан проверить реальное поведение normal/regenerate/swipe/continue и abort handoff. Если host guarantee достаточна, не строить второй scheduler. Если identity всё равно недостаточна, production gate = максимум одна pending generation per scope.

## P0-O — Legacy FFMVU evidence acquisition

Помимо identity mapping P0-K проверить, где физически доступны legacy:

- `stat_data`;
- `ff_mvu_snapshot_meta` / projection metadata;
- TavernHelper/MVU per-message variables;
- raw assistant `<JSONPatch>`;
- trusted GameStart/full snapshots.

Deliverable обязан назвать конкретный supported acquisition mode A/B/C из §59. Если evidence отсутствует, importer делает snapshot-only import и честно отказывается от historical reconstruction.

## P0-P — Backend writer overlap / reload semantics

Проверить target runtime при extension reload/watchdog/operator scope: может ли существовать overlap двух backend executions, способных писать один `StateScope`. Независимо от результата immutable revision filenames остаются collision-safe; если overlap возможен, нужен cross-process serialization/lock protocol либо single-writer host guarantee, подтверждённый contract/test.

## P0-Q — Attempt context propagation / exact frozen projection

Доказать end-to-end:

```text
Context Handler creates attemptId + base(S0) + projectionSource(Q0) + frozenProjection(V0)
  -> prompt assembly preserves extension-specific context
  -> late interceptor resolves exact same attemptId
  -> model receives exactly V0
```

Critical race test:

```text
freeze S0/V0
-> GUI commits G1 and current cache becomes V1
-> interceptor runs
-> assert injected MODEL_STATE == V0, never V1
-> model finalization detects expected-parent conflict against G1
```

Docs + audited source уже подтверждают саму возможность extension-specific context field пройти из Context Handler в interceptor pipeline. P0-Q проверяет **target-build integration correctness**: что наш exact `attemptId` не теряется/перезаписывается при реальном assembly, cancellation, regenerate/continue и extension lifecycle.

Если exact token propagation на target build всё же не доказана, разрешён только unique pending attempt lookup under one-pending-per-scope gate; current cache projection lookup запрещён.

Отдельный parity/restart test:

```text
P1 sets Scene.Changed=true
-> build Vnext(P1) with audit indexes
-> C2 clears Scene.Changed and binds projectionSource=P1/Vnext
-> restart extension
-> active patch base == C2
-> injected MODEL_STATE hash == Vnext(P1), NOT buildPromptView(C2)
```

И следующий-turn regression:

```text
head C2 has one-shot binding to P1/Vnext
-> successful no_patch from C2
-> build Vafter from C2 (audit already consumed)
-> consumption patch empty
-> because C2 binding is non-direct one-shot, create C3(parent=C2, patch=[]) projection-refresh (required even if Hash(Vafter) happens to equal old hash)
-> StateHash(C3) == StateHash(C2)
-> C3 DIRECT SELF-BINDING source=C3/Vafter
-> restart
-> next MODEL_STATE == Vafter, one-shot indexes do NOT repeat; lineage is direct again
```

## P0-R — Double fail-open MODEL_STATE transport

Fault-inject одновременно:

- Context Handler timeout/error;
- late interceptor timeout/error.

Доказать, что unresolved sentinel/prompt fallback не трактуется как valid state и generation не создаёт FFMVU state commit. Отдельно проверить, **сохраняет ли host этот технический output как durable assistant variant**. Если да и exact valid AttemptContext/state-delivery evidence отсутствуют, variant обязан стать `unreconciled`, а не synthetic `no_patch`. Backend не может считать semantic prompt guard абсолютной transaction guarantee.

## P0-S — Continue with inter-attempt non-message descendants

Regression:

```text
A1 -> model P1
-> GUI G2
-> Continue A2(base=G2) -> model P3
-> system S4
-> Continue A3(base=S4) -> model P5
-> reload
```

HeadResolver должен вернуть P5 без false divergence и доказать каждый inter-attempt descendant path/hash.

## P0-T — Durable stopped-response semantics

Проверить stop на разных стадиях streaming и установить:

- сохраняется ли assistant message/swipe;
- final stored partial content;
- message/variant identity;
- events/order;
- поведение Continue/regenerate после stop.

Если partial durable, variant становится `stopped/transcript_dirty` до explicit reconciliation. Если durable variant отсутствует, persistent stopped attempt не создаётся.

## P0-U — In-flight extension reload / AttemptContext loss

Fault-inject extension backend reload в трёх окнах:

```text
A. after pre-assembly freeze, before late interceptor
B. after interceptor delivered frozen projection, while provider is generating
C. after provider completion, before FFMVU finalization
```

v1 safe rule: если exact in-memory AttemptContext потерян, новый process **не reconstruct-ит его из current head/cache**. Interceptor при отсутствии exact attempt отдаёт explicit transport error when possible; completion не state-commit-ится; durable assistant output становится unreconciled. Если target Lumi гарантированно abort-ит host generation при extension reload, spike может зафиксировать это как достаточный host guarantee. Persistent PendingAttempt optimization разрешён позже, но не требуется для correctness v1.

## P0-V — Impersonate is non-stateful

Проверить `generationType="impersonate"`, включая `impersonate_draft` и любые save-mode variants target build:

- MODEL_STATE может быть injected read-only;
- model JSONPatch из impersonation output игнорируется/reject-ится и никогда не state-commit-ится;
- draft mode не создаёт assistant VariantId/Anchor/Attempt;
- если host сохраняет impersonation как **user** message, это остаётся user transcript message без assistant state transaction;
- любое отличающееся host behavior отдельно адаптируется по фактической message role, а не по предположению.

# 72. Unit tests: pure Core

## State/default/normalize

- default state valid;
- old projection paths migrate;
- missing defaults merge;
- GameStarted normalized bool;
- Turn/NextNpcId normalized.

## Tuples

- correct `/0`;
- scalar shorthand canonicalized;
- label preserved;
- repair legacy full-state tuple.

## JSON Pointer/Patch

- add;
- replace;
- remove;
- arrays;
- missing path;
- root rules;
- unsafe prototype segments;
- malformed ops.

## NPC

- stable `npc_0001`;
- aliases;
- PresentNPCs canonical;
- NextNpcId atomic;
- invalid ID rejected.

## Relationships

- refs inferred/canonical;
- axes clamped;
- empty endpoint rejected.

## Archives

- resolved -> archive;
- trimming;
- compact summary.

## Outfit

- valid Slot/Layer;
- Extra Placement;
- combat fields removed;
- tombstone ignored/removed;
- duplicate/twin handling.

---

# 73. Projection tests

- PresentNPC is hot.
- `IsPresent` makes hot.
- warm scoring by Priority/actor/location/deadline/status/recent touch.
- cold NPC omitted but persistent source unchanged.
- only relevant Relationships projected.
- Familiar hot/cold split.
- World_Calc relevance.
- Chekhov audit due.
- Scene.Changed index expansion.
- ProjectionMeta read-only.
- buildPromptView pure after refactor.

---

# 74. GameStart tests

- valid `8:05` normalizes `08:05`;
- invalid 24h time rejected;
- Charisma 79/101 rejected;
- Charisma integer only;
- legacy point pool enforced as `sum(stat - 5) <= 50` (unused points allowed);
- base stats not below 5;
- formulas exactly match legacy;
- weapon empty -> `none`;
- weapon request -> `pending`;
- Scene LocationKey;
- GameStarted true;
- stale head/transcript fingerprint rejected; physical store revision drift alone is not a semantic conflict.

---

# 75. Wardrobe/equipment golden tests

Перед переписыванием JS business logic снять fixtures с current StatusMenu.

Wardrobe:

- Wardrobe -> Worn;
- same Slot+Layer displacement;
- Extra behavior;
- Worn -> Wardrobe;
- no duplicate;
- owner isolation;
- Familiar move;
- tombstone legacy input.

Equipment:

- equip once;
- derived stat result;
- unequip exact reverse;
- Inventory/Equipment atomic transfer;
- delete;
- no double bonus.

---

# 76. EventStore tests

1. Genesis BaseSnapshot materializes.
2. Fork BaseSnapshot is self-contained after parent storage deletion for both state and exact first-next projection seed.
3. Base-seed `promptViewHash`/artifact corruption is detected; `sourceKind="base-seed"` on StateCommit is rejected.
4. Base + one patch.
5. 100 patches.
6. Checkpoint result equals full replay.
7. Parent hash mismatch rejected.
8. Corrupt result hash detected.
9. Orphan event after simulated crash.
10. Missing/corrupt latest checkpoint falls back to ancestry-compatible checkpoint.
11. Two concurrent commits: stale one conflicts.
12. Schema/reducer migration.
13. Filesystem listing/timestamp order does not define history.
14. Duplicate transaction/request id does not duplicate event.
15. Corrupt/missing advisory manifest-head does not lose the unique valid hash-linked store revision tip.
16. Uncommitted orphan event is never auto-adopted; two committed sibling StoreRevisions are not resolved by parent equality alone.
17. Root anchor preserves GUI/system commits before first assistant.
18. Anchor/index can rebuild from commit provenance when unambiguous.
19. Missing AnchorRecord for saved assistant is `unreconciled`, not no-op.
20. Old event replay uses its original reducerVersion.
21. Canonical hash rejects non-finite/non-JSON values.
22. Resource-limit violation leaves state unchanged.
23. Two competing successor revisions with same numeric revision coexist; no overwrite; ambiguous lineage fails closed.
24. Revision predecessor/hash chain corruption detected.
25. Advisory manifest fast-path validation falls back to full scan only when needed.
26. Reducer r1 replay remains hash-identical after latest defaults/constants change.
27. Immutable TranscriptAttempt survives missing/rebuilt AnchorRecord.
28. Inactive corrupt variant issue does not poison unrelated healthy active lineage.
29. Simulated storage quota/write failure leaves prior durable state intact and reports `storage_exhausted`/I/O health.
# 77. Lifecycle integration tests

## Normal

- no patch -> immutable no_patch TranscriptAttempt + rebuilt AnchorRecord;
- valid patch;
- malformed patch;
- schema-invalid patch;
- saved message then extension crash before commit.

## Regenerate

- new variant has stable VariantId;
- new model commit shares pre-message base;
- original variant event untouched;
- generation correlation cannot bind to currently navigated wrong swipe.

## Swipe navigation

- state follows selected VariantId;
- navigation itself does not create state event.

## Swipe delete/reindex

- delete middle A/B/C preserves identity of surviving C;
- active path updates;
- deleted variant event retained audit;
- downstream compatibility recalculated.

## Swipe edit/wholesale rewrite

- changed patch -> edit-rebuild;
- unchanged patch/prose edit -> evidence/transcript dirty policy;
- ambiguous wholesale identity -> `swipe_identity_ambiguous`.

## Message edit/delete

- downstream lineage marked appropriately;
- extension maintenance cleanup does not self-trigger semantic edit rebuild.

## GUI/system commits

- assistant -> GUI -> assistant resolves without false divergence;
- strict GUI/model generation conflict;
- non-message tip survives restart/swipe navigation.

## Continue

- if same VariantId is appended, second generation creates a second immutable TranscriptAttempt;
- second attempt freezes/resulting parent independently of first;
- first attempt evidence/commit remains immutable;
- unsupported/ambiguous host append semantics block Continue rather than guessing.

## Projection consumption

- fork from post-consumption head copies the exact currently bound next projection into child BaseSnapshot seed;
- first child/import attempt may use `projectionSourceKind="base-seed"`; after successful finalize its resulting lineage uses ordinary node binding/refresh;
- audit/Scene consumption never creates self-inflicted parent conflict with the model generation that caused it;
- stopped/error generation does not consume persistent projection bookkeeping;
- frozen projection remains the exact one injected even if GUI/system commits advance current cache during generation;
- authorization remains based on frozen projection, not the new current view.

## Concurrent generation

- two same-scope requests correlate deterministically or second request is blocked/queued by gate;
- no "latest pending" heuristic.

## Stop/error

- no model state commit;
- if stopped partial is not durable, no persistent attempt is invented;
- if stopped partial is durable, variant is `stopped/transcript_dirty` and cannot become stateful parent without explicit reconciliation.

## Restart

- final head/state/projection identical;
- transcript reconciliation catches saved-message-without-event.

# 78. Acceptance matrix

Acceptance dependency-scoped:

- **Core user-scoped v1** обязан пройти все scenarios, кроме явно помеченных `[STATUSMENU]` и `[OPERATOR]`;
- **Full user-scoped stack** дополнительно обязан пройти `[STATUSMENU]`;
- `[OPERATOR]` обязателен только перед отдельным operator-scoped release после P0-L.

Сценарии:

1. New chat → GameStart.
2. First model JSONPatch.
3. Regenerate → second swipe.
4. Toggle swipes → different state.
5. Generate after each swipe.
6. Edit assistant JSONPatch.
7. Edit assistant prose only.
8. Edit old user message.
9. Delete assistant message.
10. Delete user message.
11. Delete non-active swipe.
12. Create Lumiverse Branch.
13. Switch parent/child chats.
14. Branch child BaseSnapshot boundary skips inherited prefix; inherited state patches are not replayed twice.
15. Navigate/edit/delete a pre-boundary inherited swipe/message -> `base_boundary_dirty`, not silent alternate state.
16. Restart backend.
17. Reopen branch after restart.
18. Malformed JSONPatch.
19. Invalid state after patch.
20. Explicit state repair flow.
21. GUI field edit.
22. [STATUSMENU] Wardrobe atomic move.
23. [STATUSMENU] Equip/unequip.
24. GUI mutation while generation runs.
25. Multiple attached World Books.
26. World Info activation.
27. Preset Dry Run.
28. Cold NPC survives long context.
29. Group chat.
30. GameStart branch guard.
31. Extension reload.
32. Long session with checkpoints.
33. Delete middle swipe and verify surviving VariantIds.
34. Assistant -> GUI -> assistant lineage.
35. Crash after assistant DB save before event commit.
36. Crash after event before store revision.
37. [OPERATOR] Operator-scoped install with two users has isolated state.
38. Reducer upgrade does not break historical hashes.
39. Native ST migration followed by FFMVU augmentation import.
40. Tier-1 legacy-import boundary skips already-materialized historical prefix; first new Lumi turn starts after boundary.
41. Extension cleanup of machine envelope does not trigger edit-rebuild.
42. Preset non-prompt parameters/continue behavior parity.
43. Ambiguous branch/swipe provenance fails closed.
44. GameStart/genesis -> GUI mutation -> restart -> first assistant sees GUI-updated state.
45. Continue on same assistant variant preserves A1 and appends A2 with correct parent, or is explicitly disabled if P0-C cannot prove segmentation.
46. Projection-consumption does not conflict with its own generation base.
47. Two simultaneous same-scope generations are deterministically correlated or safely serialized.
48. `.lvbak` fresh-account round-trip preserves authoritative FFMVU storage, or documented FFMVU-specific export/import round-trip does.
49. Native ST migration proves both identity mapping and legacy FFMVU evidence acquisition; snapshot-only fallback never invents history.
50. Competing same-revision store siblings coexist and recover fail-closed without overwrite.
51. Inactive ambiguous/corrupt swipe does not block healthy active lineage until selected/reachable.
52. Storage quota/write exhaustion does not partially advance durable state.
53. Latest reducer/default changes do not alter historical reducer fixture hashes.
54. Freeze S0/V0 -> GUI G1 -> interceptor still injects exact V0; model commit conflicts cleanly instead of silently seeing G1.
55. Patch authorization cannot expand because an entity became hot after attempt freeze.
56. Context Handler timeout + interceptor timeout leaves unresolved sentinel in safe semantic mode and creates no state commit.
57. Same Variant A1 -> GUI -> Continue A2 -> system -> Continue A3 resolves after restart without false divergence.
58. Durable stopped response, if host preserves one, blocks active stateful continuation until explicit reconciliation.
59. Historical projection implementation change does not alter old promptViewHash fixtures.
60. Semantic node file without StoreRevision is ignored as uncommitted after restart; proven transcript reconciliation creates a new transaction rather than adopting the orphan.
61. Model P1 + consumption C2 written before one StoreRevision are all-or-nothing durable: crash after P1 file or after C2 file but before revision commits neither.
62. StoreRevision `committedNodes=[P1,C2]` materializes semantically by parent chain and resolves tip C2.
63. Restart from C2 reconstructs MODEL_STATE from `C2.projectionBinding.sourceNodeId=P1` and matches pre-consumption Vnext hash.
64. Successful no_patch from existing C2 with a one-shot/non-direct binding creates empty-patch `projection-refresh` C3 with **direct self-binding regardless of accidental hash equality**; state hash is unchanged, restart does not repeat consumed audit indexes, and lineage is no longer one-shot.
65. Continue A1→A2 changes current full message hash; A1 historical `storedMessageTextHash` mismatch is expected and does not mark edit, while Anchor/latest A2 hash must match current content.
66. Attempt final stored hash is post-cleanup canonical content; pre-cleanup machine-envelope hash is never mislabeled as `storedMessageTextHash`.
67. Durable StoreRevision/model commit with no durable resulting assistant variant remains committed-but-unbound forensic history and never becomes active via HeadResolver.
68. Durable assistant variant without provable matching FFMVU finalize is unreconciled; it is never silently classified `no_patch`.
69. Startup lightweight manifest filename listing detects duplicate numeric revision siblings even when advisory `manifest-head.json` points to one apparently valid chain.
70. Canonical machine-envelope cleanup leaves chat_chunks/retrieval equivalent to canonical stored transcript.
71. Fork from parent post-consumption head embeds exact parent-bound projection; delete parent storage, restart child, and first child MODEL_STATE hash remains identical.
72. First successful child attempt from base-seed transitions to ordinary node binding; `no_patch` always creates a **direct-self-bound** projection-refresh to retire seed provenance, even when newly derived projection hash is identical.
73. Tier-1 import with trusted `ff_mvu_prompt_view` preserves it as exact seed; Tier-1 import without prompt-view bytes is explicitly `reconstructed-from-state` and never claims exact first-turn projection parity.
74. Corrupt/missing BaseSnapshot seed or mismatch between seed and base-seed binding fails closed before generation.
75. Base-seed first attempt and subsequent refresh keep the lineage's recorded `projectionVersion`; a newer registered version is used only after explicit `projection-upgrade`.
---

# 79. Performance guidelines

Не formal SLA, но design target:

- cache lookup O(1);
- interceptor без disk replay;
- ordinary GUI mutation — small event write;
- restart normal path делает lightweight `list(manifests/)` по filenames, чтобы обнаружить duplicate numeric revisions/extra physical tips, затем валидирует advisory head + его hash-linked chain; читать bodies всех revisions не требуется без anomaly;
- full revision-body scan reserved for recovery/diagnostics;
- restart semantic replay — десятки parent-chain events после checkpoint, не тысячи и не physical StoreRevision order;
- audit UI paginated;
- no periodic 750ms polling;
- no serialization full event history on each UI refresh.

---

# 80. Logging

Structured:

```text
[FFMVU][state.commit]
[FFMVU][state.conflict]
[FFMVU][state.recover]
[FFMVU][generation.start]
[FFMVU][generation.commit]
[FFMVU][generation.patch_error]
[FFMVU][head.resolve]
[FFMVU][head.diverged]
[FFMVU][branch.bootstrap]
[FFMVU][interceptor]
[FFMVU][migration]
```

Default log fields:

- userId/chatId;
- nodeId/commitId/parent;
- messageId/variantId/currentSwipeIndex;
- attemptId/generationId/transactionId/requestId;
- hashes;
- Narrative.Turn;
- changed paths;
- error.

Не dump-ить full state по умолчанию.

---

# 81. Debug export

Добавить diagnostics export:

```json
{
  "manifest": {},
  "commits": [],
  "checkpoints": [],
  "diagnostics": {}
}
```

Опционально include/redact chat prose.

Это станет предпочтительным bug-report format вместо десятков полных message snapshots.

---

# 82. Development phases

## Phase 0 — Freeze legacy reference + platform spikes

Сохранить:

- exact source files + SHA-256 manifest;
- representative full states;
- chats with swipes;
- malformed patches;
- outfit/equipment fixtures;
- full preset top-level inventory + prompt assembly snapshots;
- native ST migration identity + FFMVU evidence acquisition fixtures;
- data-portability round-trip fixture;
- concurrent-generation/reload fault fixtures.

Перед parity work проверить наличие всех пяти frozen source roles. Missing StatusMenu hard-blocks только StatusMenu-dependent golden claims/Phase 1B; Core migration не ждёт GUI source.

Закрыть architecture-critical P0-A..V по соответствующей зависимости. В частности P0-F/Q/R/S/T/U/V обязательны до production generation/HeadResolver glue; P0-L нужен только перед operator-scoped release.

## Phase 1A — Pure Core state engine + reducer/projection registries

Можно начинать без StatusMenu source:

```text
state defaults/schema
versioned normalize/reducers
validation
json pointer/patch
patch resource policy
canonical hashing
versioned projection + ProjectionRegistry
GameStart formulas
```

## Phase 1B — StatusMenu domain parity hard gate

Начинать только после exact StatusMenu source + manifest hash:

```text
outfit/wardrobe domain
applyEquipStats / reverseEquipAndReturnToInventory
equipment/inventory canonical paths
lorebook GUI business semantics
portrait mutation/compression semantics
```

## Phase 2 — EventStore/BaseStore/Materializer

- BaseSnapshot;
- commits;
- hash-linked immutable store revisions with collision-safe filenames;
- hashes;
- checkpoints;
- recovery;
- StateScope mutex;
- TranscriptAttemptStore + AnchorStore/VariantIndex primitives.

## Phase 3 — HeadResolver / transcript integrity

- stable VariantIds + multi-attempt variant semantics;
- swipe reindex/reconciliation;
- active path;
- non-message tips;
- divergence;
- edits/deletes;
- TranscriptReconciler.

## Phase 4 — Generation lifecycle

- pre-assembly context capture;
- exact attemptId propagation/correlation;
- attempt-frozen projection + separate projection-source provenance + authorization;
- normal/regenerate/swipe/continue;
- non-stateful impersonate policy;
- in-flight extension reload/context-loss fail-closed policy;
- immutable TranscriptAttempt + model commit + rebuildable AnchorRecord;
- inter-attempt GUI/system descendants;
- durable stopped-response policy;
- crash-window reconciliation.

## Phase 5 — Context guard + late interceptor

- pre-assembly cancellation where available;
- exact frozen MODEL_STATE late replacement;
- unresolved-sentinel semantic fallback;
- double-hook-failure tests;
- health fallback;
- cache only as state/materialization source before attempt freeze, never as replacement for an in-flight attempt projection.

## Phase 6 — GameStart frontend

- native modal;
- guarded genesis RPC.

## Phase 7 — StatusMenu read-only

State/projection/health/variant diagnostics.

## Phase 8 — StatusMenu mutations

- field edit;
- wardrobe;
- equipment;
- inventory;
- quests;
- repair.

## Phase 9 — Preset

- full surface inventory mapping;
- blocks;
- markers;
- groups;
- macros;
- sampling/continue/prefill settings;
- Dry Run parity.

## Phase 10 — Regex/World Books

- remove Status regex;
- display transforms;
- explicit lore bindings.

## Phase 11 — Legacy FFMVU augmentation importer

Работает поверх native Lumi ST import when used; raw-ST mode только отдельным ADR.

## Phase 12 — Long soak/fault injection

Не менять порядок без причины. Особенно не начинать с красивого GUI.

# 83. Первый PR coding-агента

Первый PR **не содержит Spindle lifecycle и GUI**.

Только:

```text
src/shared/state-schema.ts
src/shared/state-defaults.ts
src/shared/state-normalize.ts
src/shared/state-validate.ts
src/shared/json-pointer.ts
src/shared/json-patch.ts
src/shared/projection.ts
src/shared/projection-registry.ts
src/shared/reducer-registry.ts
src/shared/domain/*
tests/unit/*
```

Definition:

> Pure FFMVU Core v1.5.8 logic работает без SillyTavern, TavernHelper, MVU bundle и Lumiverse.

Второй PR:

```text
EventStore/BaseStore
Immutable Manifest Revisions
Materializer
CheckpointService
AnchorStore/VariantIndex
StateService
```

Третий:

```text
Lumi lifecycle
GenerationContext/Correlation
HeadResolver/TranscriptReconciler
ContextGuard
Interceptor
```

Только затем UI.

---

# 84. Coding rules

1. TypeScript strict.
2. External payloads валидировать.
3. Pure logic отделять от I/O.
4. `StateService` — единственная mutation boundary.
5. Events immutable.
6. No hidden full-state writes.
7. No `any` в core domain без причины.
8. Все subscriptions cleanup.
9. Lifecycle handlers idempotent.
10. Repeated `GENERATION_ENDED` не создаёт duplicate commit.
11. Timestamp не authoritative order.
12. Hashes backend recompute.
13. Cache никогда не становится ahead of persisted manifest.
14. UI всегда готов к conflict/reload.
15. Не использовать polling, пока native event существует.
16. Не делать automatic semantic repair без audit record.
17. Не объявлять omitted projection record отсутствующим.
18. Не смешивать Character Card state и runtime state.
19. Не менять gameplay formulas в transport migration PR.
20. Любое отклонение от этого документа описывать в ADR.
21. Raw host swipe index никогда не persistent identity.
22. Отсутствие AnchorRecord никогда не трактовать как доказанный no-op.
23. Replay старого event использует записанный reducerVersion.
24. Correctness не зависит от atomicity `storage.move()`.
25. Authoritative persistence всегда scoped by userId + chatId.
26. In-flight attempt никогда не читает current projection cache вместо своего frozenProjection.
27. Model authorization никогда не расширяется после attempt freeze.
28. Semantic node artifact без committed StoreRevision не является committed mutation и не auto-adopt-ится.
29. Durable stopped variant не становится no-patch автоматически.
30. Historical ProjectionRegistry столь же immutable, как ReducerRegistry.
31. Canonical content cleanup не оставляет stale retrieval chunks.
32. v1 production не требует operator scope; не усложнять user-scoped release ради будущего deployment.
33. Physical StoreRevision order никогда не используется как semantic StateCommit replay order.
34. Projection после consumption восстанавливается из immutable node `projectionBinding`, а не из consumed head вслепую.
35. Committed StoreRevision siblings никогда не auto-resolve-ятся в v1.
36. Потерянный AttemptContext никогда не reconstruct-ится из current cache.
37. Impersonate никогда не создаёт FFMVU state mutation.
38. `ignored` не делает active contradictory prose healthy без discard/repair evidence.

---

# 85. Что НЕ делать в v1

Не нужны:

- CRDT;
- distributed DB;
- generic event-sourcing framework dependency;
- auto-rebase сложных patches;
- полная redesign state schema;
- proprietary replacement JSONPatch DSL;
- перенос card personality в runtime;
- превращение всех mechanics в tools;
- custom prompt engine;
- прямой доступ в Lumi SQLite;
- polling repair loop;
- background silent state rewrites.

Минимум архитектуры, максимум проверяемости.

---

# 86. EventStore abstraction

Не привязывать domain к file storage.

```ts
interface EventStore {
  putBase(scope: StateScope, base: BaseSnapshot): Promise<void>
  getBase(scope: StateScope, baseId: string): Promise<BaseSnapshot | null>

  appendCommit(scope: StateScope, commit: StateCommit): Promise<void>
  getCommit(scope: StateScope, commitId: string): Promise<StateCommit | null>

  putRootAnchor(scope: StateScope, anchor: RootAnchorRecord): Promise<void>
  getRootAnchor(scope: StateScope): Promise<RootAnchorRecord | null>

  putAnchor(scope: StateScope, anchor: AnchorRecord): Promise<void>
  getAnchor(scope: StateScope, variantId: VariantId): Promise<AnchorRecord | null>

  readVariantIndex(scope: StateScope, messageId: string): Promise<MessageVariantIndex | null>
  writeVariantIndex(scope: StateScope, index: MessageVariantIndex): Promise<void>

  getCheckpoint(scope: StateScope, nodeId: string): Promise<StateCheckpoint | null>
  findNearestCheckpoint(scope: StateScope, headNodeId: string): Promise<StateCheckpoint | null>

  appendAttempt(scope: StateScope, attempt: TranscriptAttempt): Promise<void>
  getAttempt(scope: StateScope, attemptId: string): Promise<TranscriptAttempt | null>
  listAttemptsForVariant(scope: StateScope, variantId: VariantId): Promise<TranscriptAttempt[]>

  listStoreRevisions(scope: StateScope): Promise<ChatStoreRevision[]>
  appendStoreRevision(scope: StateScope, revision: ChatStoreRevision): Promise<void>

  listCommits(scope: StateScope): Promise<StateCommit[]>
}
```

Backend implementation использует `spindle.userStorage` для authoritative records.

Если Spindle когда-нибудь даст официальную transactional extension DB, backend можно заменить без изменения StateService/domain contracts.

Не лезть напрямую в host SQLite.

# 87. Human-readable diff

Authoritative event хранит raw patch.

Для UI:

```ts
interface DiffLine {
  op: "add" | "replace" | "remove"
  path: string
  before?: unknown
  after?: unknown
}
```

`before` вычислять из parent materialization.

Не обязательно дублировать before/after во всех events.

---

# 88. Data retention

Stale commits и uncommitted orphan artifacts не purge immediately.

Reachable/stale committed nodes нужны для:

- return to swipe;
- audit;
- branch bootstrap;
- repair;
- forensic history.

Uncommitted orphan event не является state history, но может временно храниться как crash/reconciliation evidence до retention deadline.

Позже можно manual compact policy:

- retain reachable;
- retain orphan N days;
- export before purge.

Correctness first.

Storage не считать бесконечным. На write/quota failure:

- prior durable revision/state остаётся authoritative;
- partial new object не делает transaction committed;
- checkpoint failure не corrupt-ит semantic event chain; policy может пропустить checkpoint, если event transaction безопасно завершается;
- state/diagnostics показывает `storage_exhausted` или конкретную I/O recovery condition;
- UI предлагает export/compact/purge только manual/explicit policy.

До автоматического GC нужен ADR с reachability rules для branches/swipes/attempts.

---

# 89. Conceptual invariant: message не владеет state

Неправильно:

```text
message/swipe index contains or identifies full world state
```

Правильно:

```text
host assistant swipe index
  maps to stable VariantId
        ↓
TranscriptAttempt(s)
  say which base/projection each generation actually saw and what it produced
        ↓
AnchorRecord
  rebuildable current endpoint/tip summary
        ↓
State DAG
  may continue through GUI/system commits
```

Message — transcript evidence. Numeric swipe index — текущая coordinate. VariantId — stable extension identity. TranscriptAttempt — immutable generation evidence. AnchorRecord — rebuildable current index. State database живёт отдельно.

# 90. User messages и state

Текущий protocol обычно фиксирует mutable consequences после narrator turn.

User message сам по себе не state commit.

Исключения:

- GameStart;
- explicit OOC state administration;
- GUI/manual repair.

Не парсить arbitrary user prose автоматически в state.

---

# 91. Extension manifest/runtime

Spindle backend сейчас работает в isolated runtime/Bun subprocess model. Не рассчитывать на доступ к browser globals.

Authoritative state API проектируется user-scoped независимо от installation scope. **FFMVU Lumi v1 production default = user-scoped installation.** Operator-scoped deployment не является required parity target и включается только после пройденного P0-L отдельным release/ADR.

Backend/frontend communication делать через официальные message/RPC surfaces.

Frontend mount обязан вернуть cleanup.

Если UI drawer tab достаточно, не просить `ui_panels`.

---

# 92. Source references для агента

Перед implementation сверяться с актуальными страницами:

```text
Lumiverse Developer Docs
  /backend-api/storage/
  Backend Process Lifecycle page from current docs navigation/types
  /backend-api/variables/
  /backend-api/interceptors/
  /backend-api/context-handlers/
  /backend-api/events/
  /backend-api/generation/
  /backend-api/message-content-processor/
  /backend-api/chat-mutation/
  /backend-api/chats/
  /backend-api/world-books/
  /backend-api/world-info-interceptor/
  /backend-api/regex-scripts/
  /backend-api/llm-tools/
  /backend-api/presets/
  /getting-started/manifest/
  /getting-started/permissions/

Lumiverse User Guides
  /guides/presets/prompt-blocks/
  /guides/chatting/branching/
  /guides/data-portability/exporting/
  /guides/data-portability/importing/

Deployment/native migration references
  docker-compose.yml / docker-compose.build.yml (SillyTavern migration flags)

Source
  github.com/prolix-oc/Lumiverse
  src/services/generate.service.ts
  src/spindle/*
```

Особенно актуальные TypeScript signatures брать из установленного `lumiverse-spindle-types`.

---

# 93. Definition of Done: Core

Core migration готова только если:

- authoritative full state отсутствует в chat variables/messages;
- host swipe index не является persistent state identity; stable VariantIds переживают delete/reindex;
- swipes имеют независимые states;
- no-patch responses имеют immutable TranscriptAttempt + explicit rebuildable AnchorRecord;
- Continue/multi-attempt semantics либо доказанно корректны, либо stateful Continue fail-closed disabled;
- GUI/system commits между messages не теряются;
- regenerate fork parent правильный;
- branch new chat получает правильный fork state и inherited transcript prefix через `TranscriptBaseBoundary` не replay-ится второй раз;
- pre-boundary edit/delete/swipe change invalidates base fail-closed;
- restart восстанавливает state;
- saved-message-without-event crash window обнаруживается/reconcile-ится;
- reducer upgrade не ломает hashes старой истории и historical reducer не зависит от latest defaults;
- per-user storage isolation доказана для user-scoped v1 deployment; operator scope не входит в Core DoD до P0-L;
- authoritative storage backup/restore path доказан;
- competing store revisions не overwrite друг друга; committed siblings детектируются как ambiguity и fail-closed без silent winner;
- physical StoreJournal validation отделена от semantic parent-chain materialization;
- event без committed StoreRevision не считается committed state;
- late MODEL_STATE соответствует exact frozen projection конкретного attempt, а не более новому current head/cache;
- historical ProjectionRegistry воспроизводит old promptViewHash fixtures для node sources; base-seed fixtures воспроизводятся exact embedded projection без parent storage, включая pre-consumption fork/import continuity;
- `R1` with `Scene.Changed=true` yields next bound projection with audit indexes before bookkeeping commit clears current flag;
- no-patch после one-shot binding создаёт projection-refresh только когда next binding действительно отличается, и consumed indexes не повторяются;
- durable committed model node без durable transcript variant остаётся unbound и не влияет на active HeadResolver result;
- double Context Handler + interceptor failure не превращает unresolved sentinel в state commit или synthetic healthy no_patch durable variant;
- in-flight extension reload/context loss не reconstruct-ит attempt из current head;
- impersonate path не создаёт state commit;
- malformed patch не corrupt-ит state;
- GUI conflict не теряет updates;
- durable stopped variant, если host его сохраняет, не становится implicit no-patch parent;
- cold records не теряются;
- diagnostics объясняет каждый commit и каждый generation attempt;
- inactive variant fault не блокирует unrelated healthy active lineage;
- state event history не требует полного snapshot на каждый turn.

---

# 94. Definition of Done: полный стек

Дополнительно:

- GameStart functional parity;
- exact StatusMenu frozen source присутствует в manifest и StatusMenu functional parity доказана;
- wardrobe/equipment golden parity доказана по exact source;
- lorebook CRUD/binding parity;
- regex/display parity;
- prompt block parity;
- preset Dry Run accepted;
- legacy import;
- all **applicable** acceptance scenarios passed: Core + `[STATUSMENU]` для full user-scoped stack; `[OPERATOR]` только для operator-scoped release;
- no undocumented ST dependency remains;
- no polling fallback unless отдельно обоснован и документирован.

---

# 95. Короткий architectural contract

Если агенту нужно держать в голове правила:

```text
1. Full state lives in FFMVU user-scoped storage, not chat messages/variables.
2. StateScope = userId + chatId.
3. History is BaseSnapshot + immutable JSONPatch commits with explicit parent.
4. Host swipe index is mutable coordinate, never persistent identity.
5. Every assistant variant gets stable internal VariantId; every generation gets immutable TranscriptAttempt; AnchorRecord is rebuildable current summary.
6. Valid no-patch/failed/ignored/Continue attempts remain explicit immutable evidence; missing evidence means unreconciled. `ignored` heals nothing unless discard/repair evidence makes transcript/state coherent.
7. GameStart creates self-contained genesis BaseSnapshot.
8. Lumi Branch creates self-contained fork BaseSnapshot.
9. Checkpoints accelerate recovery; they are not history truth.
10. GUI/system commits are first-class DAG nodes and extend `root` or Variant Anchor tip.
11. Swipes/regenerates fork from frozen pre-message state.
12. Model and GUI use one StateService.
13. GUI sends intents, not snapshots.
14. Generation freezes exact semantic base + separate projection source + projection + authorization view for its attempt before assembly.
15. Late interceptor injects that attempt-frozen projection; current cache cannot replace it mid-flight. Projection source may differ from patch base after legacy-compatible consumption.
16. Model patch commits only after successful final generation and is authorized only against the frozen view it saw.
17. Parent/identity mismatch is conflict, never silent rebase.
18. MODEL_STATE is filtered projection; cold omission is not deletion.
19. Context Handler cancels unhealthy generations when available; interceptor injects exact attempt state; unresolved sentinel is semantic last-resort when both hooks fail-open.
20. Storage recovery does not assume atomic move/CAS; authoritative userStorage does not require move/stat.
21. ChatStoreRevision is the physical transaction commit point; semantic node without committed revision is uncommitted orphan evidence.
22. StoreRevision order proves durability only and never semantic state order. Healthy v1 requires one physical tip; committed siblings fail closed. Active transcript/state head is derived separately from semantic parent chains.
23. TranscriptReconciler detects messages saved without state events.
24. Replay uses reducerVersion recorded by semantic nodes; prompt evidence uses historical ProjectionRegistry for node sources or immutable BaseSnapshot ProjectionSeed for base-seed sources, never assuming projection source equals patch base.
25. Continue may cross proven same-lineage GUI/system descendants between attempts; equality to previous model commit is not required.
26. Durable stopped prose is unreconciled/transcript-dirty until explicit resolution, never implicit no-patch.
27. Machine state envelopes should stay out of narrative semantic search; canonical cleanup keeps retrieval chunks aligned.
28. Character cards remain stable character material; runtime state stays runtime.
29. Native Lumi mechanisms replace ST glue only where semantics actually match.
30. Native Lumi ST migration precedes FFMVU augmentation import when used.
31. Legacy import defaults to Functional Continuity; Full Historical Reconstruction requires sufficient evidence.
32. Preset parity includes non-prompt settings, ordering, continue/prefill behavior.
33. Projection consumption builds next MODEL_STATE before clearing audit flags and stores immutable ProjectionBinding; restart preserves that exact view.
34. Lost AttemptContext, double-hook transport failure, stopped durable prose and ambiguous store siblings all fail closed rather than fabricate continuity.
35. Impersonate is read-only with respect to FFMVU state.
33. Unconfirmed host behavior gets a spike test before implementation.
34. Projection-consumption in parity-v1 is an explicit post-model/no-patch system commit and cannot mutate the frozen model parent first.
35. Concurrent same-scope generations are deterministically correlated or serialized; do not duplicate a sufficient host lock with a second scheduler.
36. Historical reducers/projections own frozen defaults/constants/selection semantics.
37. Backup/restore of authoritative FFMVU storage is part of correctness, not optional UX.
38. Health is scoped: store + active lineage + per-variant diagnostics.
39. FFMVU Lumi v1 production deployment is user-scoped; operator scope is a later P0-L-gated release capability.
```

# 96. Итоговая целевая схема

```text
                 Lumiverse Chat
                      │
        host message + swipe indices
                      │
                VariantIndex
                      │
                  VariantId
                 ┌────┴─────┐
                 ▼          ▼
          AttemptStore   AnchorStore
        immutable log   current index
                 └────┬─────┘
                      │
              ┌───────┴────────┐
              │                │
         Transcript         State lineage
              │                │
        HeadResolver      StateService
                               │
             ┌─────────────────┼──────────────────┐
             ▼                 ▼                  ▼
        BaseStore         EventStore          Materializer
     genesis/fork/import   immutable DAG       + Checkpoints
             │                 │                  │
             └─────────────────┴──────────────────┘
                               │
                         Materialized Head
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
              Context Guard       GenerationCoordinator
                    │                     │
              cancel unhealthy    freeze AttemptContext
                                          │
                               base + projection + auth
                                          │
                                   AttemptRegistry
                                          │
                                   Late Interceptor
                                          │
                               exact frozen MODEL_STATE

Frontend GameStart/StatusMenu
          │
          └──────── intents/RPC ────────> StateService
```

Сохраняются сильные стороны текущего стека:

- persistent causal world;
- filtered model state;
- atomic JSONPatch;
- stable NPC identity;
- branch/swipe-local continuity;
- replay/recovery;
- GUI-managed mechanics;
- prompt/output contract.

Добавляется то, чего не хватало v1:

- stable variant identity поверх mutable swipe indices;
- immutable per-generation attempt evidence + rebuildable no-patch/failure anchors;
- multi-attempt Continue-safe variant model;
- non-message GUI/system lineage tips;
- self-contained genesis/fork/import bases, including exact fork/import projection seed where required;
- saved-message crash reconciliation;
- versioned reducers + historical ProjectionRegistry;
- attempt-frozen projection transport/authorization;
- double-fail-open MODEL_STATE sentinel guard;
- durable stopped-response reconciliation;
- StoreRevision transaction commit point + non-adopting orphan policy;
- per-user storage scope;
- hash-linked collision-safe store revision protocol без предположения atomic replace;
- active transcript head отделён от durable store journal;
- full preset surface parity;
- native ST migration augmentation path с explicit evidence acquisition contract;
- data-portability verification/custom backup fallback;

Убирается ST-specific технический долг:

- full snapshot в каждом message;
- MVU/TavernHelper variable bridge;
- iframe parent discovery;
- branch-token integer assumptions;
- regex-injected application UI;
- polling reconciliation;
- full-state GUI writers.

---

# Appendix A. Function-level disposition matrix

## A.1. Core v1.5.8 — preserve as pure/domain logic

Эти функции/идеи переносить непосредственно или с минимальной TypeScript-чисткой:

```text
createDefaultState
mergeDefaults
migrateProjectionPaths
normalizeClothingItem
isClothingTombstone
normalizeOutfit
normalizeState
validateState

recordTurn
trimRecord
compactArchive
archiveResolved

inferRelationshipRefs
actorAliasMap
canonicalActorRef

priority
intersects
candidateScore
pickCandidates
compactNpcIndex
pickWorldCalc
buildPromptView

pointerParts
pointerParent
pointerGet
pointerAdd
pointerRemove
pointerReplace
applyJsonPatch

isLabeledTuple
canonicalizeTupleOperation
repairLabeledTuples

patchHash          -> заменить реализацию SHA-256/canonical hash
stableStringify    -> оставить идею, улучшить canonical serializer

message patch parser/extractJsonPatch
patchEffectsPresent
containsPatchValue
```

### `recoverMissingNpcIdentityFromHistory`

Сохранить только как legacy/recovery helper. В новой системе normal commit должен создавать NPC identity атомарно и validation не должен зависеть от scanning prose history.

## A.2. Core — заменить новой persistence architecture

Legacy:

```text
trustedSnapshot
findTrustedBase
findGameStartBase
previousSnapshot
selectSource
stampSnapshot
replayStateTo
ensureMessageState
ensureLatestState
commitExternalState
reconcileExternalWrite
cachedPromptView
getPromptSnapshot
```

не копировать буквально.

Их responsibilities переезжают:

```text
trustedSnapshot/findTrustedBase -> EventStore hash validation + BaseStore/checkpoints
replayStateTo                  -> Materializer(parent-chain)
ensureMessageState             -> УДАЛИТЬ concept per-message full snapshot
ensureLatestState              -> HeadResolver + MaterializedCache
commitExternalState            -> StateService.commitGuiIntent/createGenesis
reconcileExternalWrite         -> больше не нужен normal path
cachedPromptView               -> MaterializedHead.projection
getPromptSnapshot              -> StateService.getProjection / GenerationContext
stampSnapshot                  -> StateCommit hashes/metadata
```

## A.3. Core — platform adapter удалить

```text
runtimeFunction
getSillyTavern
getTavernEvents
getMvu
latestMessageId       (ST implementation)
currentChatId         (ST implementation)
branchToken           (legacy format)
messageAt             (ST implementation)
isUserMessage         (ST implementation)
messageText           (ST implementation)
readVariables
writeVariables
subscribe             (ST event wrapper)
scheduleLatest
enqueueEnsure         (legacy scheduler)
onVariableUpdateEnded
initialize            (ST-specific)
cleanup               (rewrite as Spindle cleanup)
```

## A.4. Prompt injection

Legacy:

```text
replaceLiveModelState
injectPromptMessages
injectPromptString
```

Сохранить replacement semantics, но transport заменить `registerInterceptor()`.

---

# Appendix B. GameStart function disposition

## Preserve business logic

```text
normalizeClock
applyStartPayload
```

Но `applyStartPayload` лучше разбить:

```text
validateGameStartPayload()
deriveGameStartStats()
buildGenesisState()
```

## Delete ST transport/UI glue

```text
runtimeFunction
getSillyTavern
getTavernEvents
currentUserName ST lookup
fallbackLatestMessageId
currentChatId ST lookup
fallbackBranchToken
messageContainsStartMarker ST scan
chatHasStartMarker
refresh polling
showOverlay iframe
removeOverlay
onMessage postMessage bridge
subscribe ST events
initialize ST
cleanup ST
```

Target frontend знает active chat через Lumi context/API; backend знает chatId из RPC/user context.

Marker `<GameStartMenu/>` можно оставить как compatibility trigger при импортированных preset/card, но native FFMVU UI не должен зависеть от сканирования первых/последних 32 сообщений.

---

# Appendix C. StatusMenu function disposition

## Перенести domain behavior в backend

```text
moveOutfitItem
applyEquipStats
reverseEquipAndReturnToInventory
deleteListItem                 -> специализированные intents
applyValueUpdate               -> setField intent + tuple policy
getCanonicalEquipmentPath
getCanonicalInventoryPath
getEquippedInSlot
uniqueOutfitKey
normalizedOutfitForDisplay     -> часть pure UI/domain helper
outfitOwners                   -> pure selector
outfitSortEntries              -> pure selector
```

## Перенести UI behavior в frontend

```text
selectTab
pagination helpers
renderFFSMState
filterFFSMState
ffsm*
renderFFOverviewV23
renderOutfitPanel
renderOutfitBucket
updateBindingsIn
showModal                      -> native frontend modal
portrait modal/render helpers
showImagePopup
```

## Переписать persistence transport

```text
saveStatData
```

удалить как full-state writer.

Заменить frontend RPC intents + backend StateService.

## Lorebook helpers

```text
fetchLorebookContent
updateLorebookContent
```

переписать на explicit native World Book bookId/entryId.

Никакого `getCurrentCharPrimaryLorebook`.

---

# Appendix D. Legacy lifecycle subscriptions

GameStart сейчас реагирует на широкий набор:

```text
CHAT_CHANGED
MESSAGE_SWIPED
MESSAGE_DELETED
MESSAGE_EDITED
MESSAGE_UPDATED
MESSAGE_RECEIVED
MESSAGE_SENT
GROUP_UPDATED
GROUP_MEMBER_DRAFTED
GROUP_WRAPPER_FINISHED
+ 750ms polling
```

Core также использует generation/message/variable events и late prompt hooks.

В Lumi minimum lifecycle должно быть event-driven:

```text
CHAT_SWITCHED
CHAT_CHANGED

MESSAGE_SENT
MESSAGE_EDITED
MESSAGE_DELETED
MESSAGE_SWIPED
SWIPE_EDITED

GENERATION_STARTED
GENERATION_ENDED
GENERATION_STOPPED
```

`STREAM_TOKEN_RECEIVED` state engine не нужен.

Не подписываться на event только потому, что он существовал в ST. Подписка должна иметь конкретный responsibility.

---

# Appendix E. Prompt migration notes

## E.1. Current structural cluster

Legacy blocks 30–37 — structural:

```text
Lorebook Before
Persona Description
Char Description
Char Personality
Scenario
Lorebook After
Chat Examples
Chat History
```

Mapping на Lumi native markers делать напрямую.

## E.2. Late/private state cluster

Legacy blocks 39–46 и 55–60 формируют state/control layer около history/output:

```text
Internal Agenda
GM Notes
Relationships
WorldSim
Chekhov
NPC Thoughts
Internal States Master
Private Gates
MODEL_STATE
Output Contract
State Protocol
JSONPatch Format
Schema
Delta Ledger
```

Нужно проверить actual assembled order в ST fixture и Lumi Dry Run. Нельзя ориентироваться только на JSON list index, потому что ST injection positions/depth могли давать итоговый порядок иначе.

## E.3. Final surface

`Russian NPC Wrapper Grammar · Final Surface` должен оставаться последним relevant formatting authority в том же semantic sense. Dry Run test должен подтверждать, что более поздний block не переопределяет его случайно.

---

# Appendix F. Known architectural risks ranked

## P0 — может сломать correctness

1. Stable swipe VariantId/reindex/delete/wholesale rewrite.
2. Non-message GUI/system commit tip resolution.
3. Saved assistant message without event/Anchor after crash.
4. Branch provenance/new-chat self-contained fork state.
5. Generation Context Handler ↔ generationId ↔ exact resulting variant correlation.
6. Raw model output extraction vs persisted message/Memory Cortex ordering.
7. Storage crash protocol without assumed atomic move/CAS.
8. Versioned reducer semantics vs historical hashes.
9. Per-user storage isolation; operator scope отдельно gated и не блокирует user-scoped v1.
10. GUI/model concurrent commits.
11. Fail-closed state guard.
12. Edit/delete downstream invalidation.
13. Continue-generation storage semantics.
14. Native ST migration -> FFMVU augmentation identity + evidence mapping.
15. Continue/multi-attempt same-variant semantics.
16. Active transcript head incorrectly persisted as durable store head.
17. Store revision collision/predecessor ambiguity.
18. Projection-consumption self-conflict.
19. Same-scope concurrent generation correlation.
20. Authoritative userStorage backup/restore.
21. Backend writer overlap/reload semantics.
22. Attempt-frozen projection accidentally replaced by newer cache projection.
23. Model authorization recomputed from current projection instead of frozen view.
24. Double fail-open Context Handler + interceptor leaves unsafe unresolved transport.
25. Continue after inter-attempt GUI/system descendants false-diverges.
26. Durable stopped prose becomes implicit no-patch state parent.
27. Projection algorithm changes break historical prompt evidence.
28. Uncommitted orphan event is resurrected without a StoreRevision.
29. Canonical cleanup leaves stale chat_chunks/retrieval machine envelope.
30. Patch base incorrectly assumed identical to projection source after audit consumption.
31. Restart rebuilds projection from consumed head and loses one-shot indexes.
32. Physical StoreRevision order is mistaken for semantic patch order across swipe branches.
33. Competing committed StoreRevision siblings are silently reduced to one winner.
34. Durable transport-error output without AttemptContext is mislabeled no_patch.
35. `ignored` hides active prose/state contradiction.
36. Extension reload loses AttemptContext and completion is rebound to current state.
37. Impersonate accidentally commits assistant-style JSONPatch.
38. Continue append is mistaken for edit because old attempt full-message snapshot hash is compared to current appended variant.

## P1 — может дать скрытую потерю функциональности

1. Full preset surface mapping beyond prompt blocks.
2. Prompt block order/depth differences.
3. Macro side-effect differences.
4. World Book «primary» assumption.
5. Equipment formula/double-bonus regression.
6. Wardrobe atomicity.
7. Group chat speaker lifecycle.
8. Starting weapon one-shot on regenerate.
9. Projection consumption side-effects.
10. Legacy import with incomplete metadata.
11. Machine-envelope cleanup reentrancy.
12. Health scope: inactive variant faults blocking healthy lineage.
13. Canonical hash contract/version drift.
14. Projection/preset version provenance.
15. Storage quota/exhaustion handling.

## P2 — UX/performance

1. Portrait storage.
2. Audit viewer pagination.
3. Checkpoint thresholds.
4. Category/toggle polish in preset.
5. Display wrapper migration.

# Appendix G. Suggested ADRs

Coding agent должен вести короткие Architecture Decision Records для спорных мест:

```text
ADR-001 Event-sourced state instead of per-message snapshots
ADR-002 Swipe commit DAG and explicit parent model
ADR-003 Storage file layout and crash recovery
ADR-004 Branch bootstrap semantics
ADR-005 Machine envelope extraction/storage
ADR-006 GUI intents + optimistic concurrency
ADR-007 Fail-closed MODEL_STATE transport
ADR-008 World Book explicit bindings
ADR-009 Projection side-effects removal
ADR-010 Stable VariantId and AnchorRecord model
ADR-011 BaseSnapshot genesis/fork/import semantics
ADR-012 Reducer versioning and historical replay
ADR-013 Per-user StateScope/storage isolation
ADR-014 Immutable store revision crash protocol
ADR-015 TranscriptReconciler saved-message recovery
ADR-016 Native ST migration augmentation importer
ADR-017 Immutable TranscriptAttempt log and Continue semantics
ADR-018 Active head vs durable store revision separation
ADR-019 Hash-linked collision-safe revision journal
ADR-020 Data portability / FFMVU archive fallback
ADR-021 Generation correlation serialization fallback
ADR-022 Legacy evidence acquisition contract
ADR-023 Health scoping and inactive variant quarantine
ADR-024 Attempt-frozen projection transport and authorization
ADR-025 ProjectionRegistry historical semantics
ADR-026 StoreRevision transaction commit point / orphan policy
ADR-027 Durable stopped-response reconciliation
ADR-028 Functional vs forensic legacy import tiers
ADR-029 Retrieval-safe machine-envelope cleanup
ADR-030 Patch base vs projection source + pre-consumption ProjectionBinding
ADR-031 Physical StoreJournal vs semantic State DAG recovery
ADR-032 Committed StoreRevision sibling fail-closed policy
ADR-033 Self-contained BaseSnapshot ProjectionSeed / first-turn projection continuity
ADR-033 In-flight AttemptContext loss and extension reload
ADR-034 Non-stateful impersonate contract
ADR-035 Transcript hash segmentation for Continue
```

Каждый ADR:

- context;
- decision;
- alternatives rejected;
- invariants;
- migration impact.

---

# Appendix H. Рекомендуемые source URLs

При разработке проверять актуальную версию, а не считать эти адреса frozen API:

- `https://docs.lumiverse.chat/`
- `https://docs.lumiverse.chat/backend-api/storage/`
- Backend Process Lifecycle page from current Developer Docs navigation/types (verify current URL before implementation)
- `https://docs.lumiverse.chat/backend-api/variables/`
- `https://docs.lumiverse.chat/backend-api/interceptors/`
- `https://docs.lumiverse.chat/backend-api/context-handlers/`
- `https://docs.lumiverse.chat/backend-api/events/`
- `https://docs.lumiverse.chat/backend-api/generation/`
- `https://docs.lumiverse.chat/backend-api/message-content-processor/`
- `https://docs.lumiverse.chat/backend-api/chat-mutation/`
- `https://docs.lumiverse.chat/backend-api/chats/`
- `https://docs.lumiverse.chat/backend-api/world-books/`
- `https://docs.lumiverse.chat/backend-api/world-info-interceptor/`
- `https://docs.lumiverse.chat/backend-api/llm-tools/`
- `https://docs.lumiverse.chat/backend-api/presets/`
- `https://docs.lumiverse.chat/getting-started/manifest/`
- `https://docs.lumiverse.chat/getting-started/permissions/`
- `https://lumiverse.chat/guides/presets/prompt-blocks/`
- `https://lumiverse.chat/guides/chatting/branching/`
- `https://lumiverse.chat/guides/data-portability/exporting/`
- `https://lumiverse.chat/guides/data-portability/importing/`
- `https://github.com/prolix-oc/Lumiverse`
- `https://github.com/prolix-oc/Lumiverse/blob/main/src/services/generate.service.ts`
- `https://github.com/prolix-oc/Lumiverse/blob/main/docker-compose.yml` (native SillyTavern migration flags)

---

# Appendix I. Последняя инструкция агенту

Если во время реализации обнаруживается, что Lumiverse уже имеет native mechanism, который **семантически** решает задачу лучше старого ST workaround, использовать native mechanism.

Но перед заменой ответить на три вопроса:

1. Сохраняет ли он branch/swipe-local behavior и stable variant identity?
2. Сохраняет ли replay/recovery/debuggability, включая crash windows?
3. Сохраняет ли output/prompt/state invariants и per-user isolation?
4. Сохраняет ли generation evidence/Continue ancestry без overwrite предыдущих attempts?
5. Переживает ли authoritative FFMVU storage штатный backup/restore либо существует собственный verified export/import?

Если хотя бы один ответ «нет» — нужен adapter, explicit feature gate или собственный слой.

Главный критерий не «код стал короче», а:

> после миграции активный chat/swipe всегда получает именно своё causal state; модель видит правильную filtered projection; любое изменение можно восстановить, проверить и объяснить.
