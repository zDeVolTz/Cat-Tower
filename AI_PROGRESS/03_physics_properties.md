# Cat Tower — AI Progress Report

## Этап 3 — PhysicsProperties

### 1. Какие файлы изменены
- `src/game/physics/Block.js`
- `src/game/physics/CenterOfMassSolver.js`
- `src/game/physics/CatModifierSystem.js`
- `src/game/physics/PhysicsWorld.js`

### 2. Где теперь находятся PhysicsProperties
Внутри класса `Block` в поле `this.physics`.

### 3. Какие свойства реально добавлены
В объект `this.physics` добавлены:
- `mass` (реальная масса блока, зависящая от ширины и типа кота)
- `friction` (трение для Jenga-физики)
- `restitution` (упругость, добавлено как задел)
- `stability` (стабильность, добавлено как задел, установлено в 1.0)

### 4. Откуда раньше бралось каждое свойство
- **mass:** Было отдельным полем `this.mass` в самом корне `Block`.
- **friction:** Не хранилось в `Block`. Каждый кадр читалось напрямую из `BLOCK_TYPES[b.typeId]` в момент проверки teetering.
- **restitution / stability:** Не существовало как свойство блока, не использовалось.

### 5. Как сохранено старое поведение
- Для CoM и модификаторов (`CenterOfMassSolver`, `CatModifierSystem`) обращения к `b.mass` аккуратно заменены на чтение из `b.physics.mass` (с фоллбэком на старое значение специально для захардкоженных моков в старых тестах).
- Трение (`friction`) в `PhysicsWorld.step()` при вызове `stepTeeteringBlock` теперь читается из `b.physics.friction`, а не просто из типа. Это позволит в будущем менять трение конкретному блоку в рантайме.

### 6. Какие места PhysicsWorld/PhysicsEngine переведены на новый источник
- `CenterOfMassSolver.calculateCoM` -> переведён на `b.physics.mass`.
- `CatModifierSystem.applyCounterStamping` -> переведён на `b.physics.mass`.
- `PhysicsWorld.step` (в секции Jenga Physics) -> переведён на `b.physics.friction`.

### 7. Что НЕ было изменено (ОЧЕНЬ ВАЖНО)
- **Расчёт крутящего момента (Torque / Sway) в `PhysicsWorld.step`**: Он исторически (вплоть до старого `physicsTick`) пересчитывает массу блока заново, минуя фракции ширины (`let mass = type.weight; ...`). Я **не перевел** его на `b.physics.mass`, так как это мгновенно изменило бы физическое поведение игры (башня начала бы качаться слабее из-за обрезанных блоков). Это было оставлено как есть (one single source of truth for torque behavior is maintained inline for now), чтобы 100% сохранить старое поведение башни.
- Fixed timestep.
- Ограничения, механики падения блоков, механики коллизий.

### 8. Какие тесты запущены
Все тесты (172/172) через `node run_all_tests.js`. Особое внимание уделялось Jenga Physics & Stability (конкретно `J011`, который проверяет `CenterOfMassSolver`). 

### 9. Результаты тестов
- Сначала тест `J011` упал из-за того, что старый тестовый мок содержал `mass` вместо `physics: { mass }`. 
- Был добавлен безопасный фоллбэк на `.mass` (только если нет объекта `.physics`), после чего тесты прошли **100% SUCCESS**.
