# ТЗ: Планёрка КД — улучшения

## 1. 4-недельный тренд метрики

**Проблема:** результат задачи оценивается по одной точке до/после — это шумно и ненадёжно.

**Бэкенд** `meeting_plan_service.py`:
- В `_build_last_week_items` для каждой завершённой задачи собирать значение метрики за 4 недели: 2 до начала задачи + 2 после
- Добавить поле `metric_trend: list[float | null]` в структуру задачи (4 значения)
- Статус результата (`up / down / flat / miss`) считать по тренду 4 точек, а не по паре до/после

**Фронтенд** `rop-card.tsx`:
- Рядом с каждой задачей прошлой недели отрисовать спарклайн из 4 точек
- Цвет линии: зелёный если тренд вверх, красный если вниз, серый если плоский

---

## 2. Расширить METRIC_CONFIGS и починить матчинг

**Проблема:** 4 из 7 метрик в `top_problems` не матчатся с METRIC_CONFIGS из-за расхождений в написании. Метрики «Итого заказов», «Балл чек листа» и другие не считаются вообще.

### 2.1 Исправить hardcoded labels в `_compute_top_problems`

```python
# было
add('retsept_zakaz', '% рецепт → заказ', ...)
# стало
add('retsept_zakaz', METRIC_CONFIGS['retsept_zakaz']['label'], ...)
```

Применить для всех метрик в функции.

### 2.2 Добавить недостающие метрики в METRIC_CONFIGS

```python
'avg_check_lenses':    {'label': 'Ср.чек линз',       'role': 'Консультант', 'higher_is_better': True,  'format': 'money'},
'total_orders':        {'label': 'Итого заказов',      'role': None,          'higher_is_better': True,  'format': 'count'},
'avg_check_total':     {'label': 'Итого Ср.чек',       'role': None,          'higher_is_better': True,  'format': 'money'},
'occupancy':           {'label': '% загрузки',          'role': 'Врач',        'higher_is_better': True,  'format': 'pct'},
'checklist_score':     {'label': 'Балл чек листа',     'role': None,          'higher_is_better': True,  'format': 'score'},
```

Добавить логику расчёта этих метрик в `meeting_plan_service.py`.

### 2.3 Добавить таблицу синонимов

```python
METRIC_ALIASES = {
    'конверсия':      'retsept_zakaz',
    'подборы':        'consultant_selections',
    'итого заказов':  'total_orders',
    'средний чек':    'avg_check_total',
    'загрузка':       'occupancy',
    '% загрузки':     'occupancy',
    'балл':           'checklist_score',
}
```

### 2.4 Исправить `_metric_key_from_name`

```python
def _metric_key_from_name(metric_name: str) -> Optional[str]:
    if not metric_name:
        return None
    norm = metric_name.strip().replace(' → ', '→').replace(' -> ', '→').lower()
    # 1. Поиск по синонимам
    if norm in METRIC_ALIASES:
        return METRIC_ALIASES[norm]
    # 2. Точное совпадение с нормализацией
    for key, cfg in METRIC_CONFIGS.items():
        label_norm = cfg['label'].replace(' → ', '→').lower()
        if label_norm == norm:
            return key
    # 3. Подстрока
    for key, cfg in METRIC_CONFIGS.items():
        label_norm = cfg['label'].replace(' → ', '→').lower()
        if label_norm in norm or norm in label_norm:
            return key
    return None
```

### 2.5 Исправить передачу метрики из `low_performers`

Бэкенд: добавить поле `metric_name` в объект `low_performer` в `analyzer_service.py` (аналогично `attention_employees`).

Фронтенд `branch-analysis-modal.tsx`:
```tsx
// было
metric: p.weak_area || ''
// стало
metric: p.metric_name || ''
```

---

## 3. Рекомендации в блоке «без задачи»

**Проблема:** КД видит сотрудника без задачи, но нет вариантов — что предложить РОПу.

**Бэкенд** `meeting_plan_service.py`:
- В `_build_attention_items` добавить `recommended_tasks` из данных анализа (уже есть в `attention_employees` и `negative_employees`)

**Фронтенд** `rop-card.tsx`:
- В `AttentionItemBlock` отрисовать список рекомендаций с кнопкой «+ Задача»
- Клик открывает `TaskFormModal` с предзаполненными: сотрудник, метрика, план работы
- `TaskFormModal` уже есть в проекте — переиспользовать

---

## 4. Редактирование и добавление задач из планёрки

**Проблема:** КД не может действовать прямо на планёрке — нужно уходить в другой раздел.

**Фронтенд** `rop-card.tsx`:
- В `ThisWeekEmployeeBlock` — добавить иконку редактирования рядом с каждой задачей → открывает `TaskFormModal` с заполненными данными
- В `ThisWeekEmployeeBlock` и `AttentionItemBlock` — кнопка «+ Задача» на уровне сотрудника
- После сохранения — обновить данные локально, без полной перегенерации плана

**API:**
- Использовать существующий `POST /api/tasks` и `PATCH /api/tasks/{id}`
- Добавить `refetch` данных текущего плана после успешного сохранения задачи
