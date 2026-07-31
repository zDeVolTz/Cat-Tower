/**
 * PhysicsWorld
 * 
 * Базовый класс для будущей компонентной физической системы.
 * На текущем этапе существует параллельно со старой физикой,
 * не влияя на игровой процесс.
 */
export class PhysicsWorld {
  constructor() {
    this.bodies = [];
  }

  /**
   * Добавляет физическое тело в мир.
   * @param {Object} body 
   */
  addBody(body) {
    if (!this.bodies.includes(body)) {
      this.bodies.push(body);
    }
  }

  /**
   * Удаляет физическое тело из мира.
   * @param {Object} body 
   */
  removeBody(body) {
    const index = this.bodies.indexOf(body);
    if (index > -1) {
      this.bodies.splice(index, 1);
    }
  }

  /**
   * Возвращает массив всех зарегистрированных тел.
   * @returns {Array}
   */
  getBodies() {
    return this.bodies;
  }

  /**
   * Обновляет состояние физического мира.
   * Пока это заглушка, которая не изменяет физику игры.
   * 
   * @param {number} dt - Дельта времени
   */
  step(dt) {
    // В будущем здесь будет:
    // 1. Применение сил (гравитация, ветер)
    // 2. Интегрирование скоростей и позиций
    // 3. Разрешение столкновений
  }
}
