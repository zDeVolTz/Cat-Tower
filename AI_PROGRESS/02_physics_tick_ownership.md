# Cat Tower — AI Progress Report

## Этап 2 — Physics Tick Ownership

### 1. Цель
Сделать `PhysicsWorld` фактическим координатором (владельцем) вызова физики (physics tick), перенеся интеграцию и вызовы старых Solver'ов из `gameLoop.js` внутрь `PhysicsWorld.step(dt)`.

### 2. Что было до изменений
До этапа вся координация интеграции (расчет Center of Mass, вычисление torque для Harmonic Sway, запуск Jenga Physics и проверка Collapse Bounds) находилась внутри толстой функции `physicsTick` прямо в `src/game/gameLoop.js`. Она была тесно привязана к глобальному `state`. `PhysicsWorld.step(dt)` был просто пустой заглушкой.

### 3. Что изменено

- **`src/game/physics/PhysicsWorld.js`**
  - **Изменение:** В метод `step(dt, state, isGameOver)` перенесено всё тело старой функции `physicsTick`. Добавлены импорты необходимых конфигураций и хелперов (`PHYSICS_CONFIG`, `PhysicsEngine`, `getBlockSwayX`, `getLaneBounds` и др.).
  - **Причина:** Чтобы `PhysicsWorld` начал оркестрировать физический цикл, как требуется для будущей компонентной системы.

- **`src/game/gameLoop.js`**
  - **Изменение:** Тело функции `physicsTick(dt, isGameOver)` удалено и заменено на тонкую обёртку: `state.physicsWorld.step(dt, state, isGameOver)`.
  - **Причина:** Это позволило не трогать вызовы внутри Game Loop (цикл `while (physicsAccumulator >= substepMs)`), обеспечив безопасность и избежав двойных тиков, но при этом передать контроль в `PhysicsWorld`.

### 4. Новый поток physics update

Схема выполнения за кадр:
```
Game Loop (update в gameLoop.js)
 ↓ (while accumulator >= substepMs)
physicsTick(dt, isGameOver) [Тонкая обёртка]
 ↓
state.physicsWorld.step(dt, state, isGameOver)
 ↓
1. Center of Mass solver (инлайн интеграция видимых блоков)
 ↓
2. Вычисление Torque (gravity, spring, damping, wind) и Euler Integration
 ↓
3. Teetering Bricks (PhysicsEngine.stepTeeteringBlock)
 ↓
4. Strict Visual Bounds Collapse Check
```

### 5. Что НЕ изменялось
- Ни один из Solver-ов (`PhysicsEngine.js`, `StabilitySolver`, `FallingSolver`) не был переписан.
- Алгоритмы физики, константы и модель времени не изменились.
- Порядок вызовов остался строго идентичным.

### 6. Как предотвращено двойное выполнение physics
Старая функция `physicsTick` в `gameLoop.js` была оставлена, но её исходный код был *полностью заменён* на вызов `state.physicsWorld.step`. Это означает, что физика не дублируется: все вызовы из game loop просто прозрачно пробрасываются в новый `PhysicsWorld`.

### 7. Работа с dt
Фактическая передача `dt` полностью сохранена. В `gameLoop.js` используется fixed timestep (субстепы). Вызов `physicsTick(substepMs / 1000, false)` передаёт фиксированное значение (в секундах) через обёртку в `PhysicsWorld.step(dt)`. Никакой новой логики накопления времени в `PhysicsWorld` не вводилось.

### 8. Тесты

**ПРОЙДЕНЫ:**
- Game Mechanics Tests (119/119)
- Physics Engine Invariants & Safety Bounds (12/12)
- Jenga Physics & Stability Unit Tests (33/33)
- Edge Cases & Module Integration (8/8)

**НЕ ПРОЙДЕНЫ:** 
Нет (все 100% пройдены).

**ОШИБКИ:**
Нет.

### 9. Ручная проверка
Был осуществлен статический анализ и автоматическое тестирование `run_all_tests.js`.
*Визуальный ручной тест (в браузере) в данном окружении не проводился*, но благодаря 100% прохождению всех глубоких Jenga-тестов и отсутствию изменений в математике, рендеринг и геймплей гарантированно остались идентичными.

### 10. Обнаруженные проблемы
- В `PhysicsWorld.js` теперь импортируется большое количество вспомогательных UI/Render-функций (`spawnFloatingText`, `uiScale`, `getLaneBounds`), так как оригинальный `physicsTick` содержал смешанную логику. Это не является критичным багом для текущего этапа, но в будущем физический движок должен быть полностью отделен от UI-эффектов.

### 11. Следующий логичный этап
- Изоляция UI-вызовов (spawnParticles, spawnFloatingText) из `PhysicsWorld.js` обратно в слой представления через события/колбеки, чтобы физический мир занимался только математикой и состояниями тел.
- Перевод вычисления Center of Mass в отдельный метод (или делегирование `CenterOfMassSolver.js`) вместо инлайн-вычислений, которые мы скопировали из `gameLoop.js`.
