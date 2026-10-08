'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { StatTile } from '@/components/ui/stat-tile'
import { getKpiData, getBranchesDataWithWeeks, getMonthlyProgress, getMetricsSettings, updateMetricsSettings, getSalesHeads, getDefaultPeriod, getEmployeesList, getTaskManagers, createWeeklyTask } from '@/lib/api'
import { TaskFormModal, TaskCloseButtons, CategoryBadge, taskStatusStyles, type ManagerOption, type TaskCloseStatus } from '@/components/task-shared'
import { ModalShell, ModalCloseButton } from '@/components/ui/modal-shell'
import { ClampText } from '@/components/ui/clamp-text'
import { GroupedEmployeeList, WeeklyTaskCreate, TaskStatus } from '@/types'
import { KpiCard } from '@/components/kpi-card'
import { BranchCard } from '@/components/branch-card'
import MetricsSettingsModal from '@/components/metrics-settings-modal'
import { KpiDynamicsModal } from '@/components/kpi-dynamics-modal'
import { AppointmentBreakdownModal } from '@/components/appointment-breakdown-modal'
import { PageHeader } from '@/components/page-header'
import { KpiData, BranchDataWithWeeks, MonthlyProgress, MetricsVisibility, RopUser, BreakdownType } from '@/types'
import { KPI_METRICS_CONFIG } from '@/config/metrics-defaults'
import { aggregateKpiWeeklyData } from '@/lib/kpi-aggregation'
import { EmptyState } from '@/components/ui/empty-state'
import { Card } from '@/components/ui/card'
import { Settings, LayoutDashboard, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { useAuth } from '@/components/auth-provider'
import { Badge } from '@/components/ui/badge'
import { Clock, TrendingDown, Mic, ClipboardCheck, ArrowRight, TrendingUp, Minus, ChevronDown, ChevronLeft, ChevronRight, Sparkles, Plus, Check, X, Database, Headphones, Users, ListFilter } from 'lucide-react'

/** Фиксированный набор типов задачи — то, чем рОП реально занят, не способ
 *  работы с конкретным сотрудником. Закрытый список специально маленький:
 *  остальное — через «Задача» в TaskFormModal без пресета типа. */
const TASK_TYPE_ICON: Record<string, typeof Database> = {
  'Проверить данные': Database,
  'Просмотреть/прослушать': Headphones,
  'Встреча 1:1': Users,
}

/** Плитки «Показателей»: от 3 до 10 (лимит держит окно «Настроить»),
 *  не больше 2 рядов, колонки — так, чтобы ряды были как можно ровнее:
 *  3/6 → 3 колонки, 4/7/8 → 4, 5/9/10 → 5 (7 = 4+3, 9 = 5+4). На узких
 *  экранах колонок меньше (2, затем 3), чтобы плитки не сжимались. */
const KPI_MIN = 3
const KPI_MAX = 10
const KPI_GRID_COLS: Record<number, string> = {
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-3',
  7: 'lg:grid-cols-4',
  8: 'lg:grid-cols-4',
  9: 'lg:grid-cols-5',
  10: 'lg:grid-cols-5',
}

/** Период — не длинный список месяцев в дропдауне (почти всегда листают
 *  на соседний, а не выбирают наугад), а стрелки с текущим месяцем между
 *  ними. Те же границы, что в PeriodSelector: с сентября 2025 по текущий. */
const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]
const PERIOD_MIN = '2025-09'
function getPeriodMax() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function formatPeriodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
}
import { CardContent } from '@/components/ui/card'

/** Компактная версия «Прогресс месяца». Бары и подписи — на нейтральном
 *  фоне, как остальные карточки страницы; фирменный градиент настоящего
 *  ProgressHeader (components/progress-header.tsx) оставлен только под
 *  самим числом прогноза — как акцентная плашка внутри карточки, а не
 *  как баннер на всю ширину. На полноразмерной Главной такой баннер был
 *  единственным цветным элементом на странице и держал фокус заслуженно;
 *  здесь рядом с ним сразу «Сегодня»/«Показатели», и сплошной цветной
 *  блок перетягивал внимание на себя сильнее, чем нужно именно прогнозу. */
function CompactProgressHeader({ progress }: { progress: MonthlyProgress }) {
  const delta =
    progress.plan_amount > 0 && progress.fact_amount > 0
      ? ((progress.forecast_percent / 100) - 1) * progress.plan_amount
      : null
  const deltaPositive = delta !== null && delta >= 0
  const formatMoney = (amount: number) => new Intl.NumberFormat('ru-RU').format(Math.round(Math.abs(amount))) + ' ₽'
  // Проценты — всегда целыми, дробные доли только шумят на маленьком шрифте.
  const forecastPct = Math.round(progress.forecast_percent)
  const executionPct = Math.round(progress.execution_percent)

  // Дни месяца — кубиками вместо процента: прошедшие (включая сегодня)
  // залиты, остальные — контуром. Нагляднее, чем «16.1%» — сразу видно,
  // сколько дней осталось, а не только долю.
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysPassed = Math.round((progress.progress_percent / 100) * daysInMonth) || now.getDate()

  // План по очкам для зрения — две полоски в одной рамке на одной шкале
  // 0..100%: сверху тонкие штрихи-дни (темп месяца), снизу широкая сплошная
  // полоса факта выполнения плана, с подписью прямо в ней. Общая серая
  // подложка и общий отступ держат обе полоски как один объект, а не два
  // случайных рядом стоящих бара.
  const executionStatus: 'excellent' | 'good' | 'poor' =
    executionPct >= Math.round(progress.progress_percent) ? 'excellent'
    : executionPct >= progress.progress_percent * 0.85 ? 'good'
    : 'poor'
  // Текст «выполнен на N%» — без подсветки, обычным белым: статус уже
  // виден в цвете самой полосы ниже, дублировать его в тексте не нужно.
  // Полоса тонкая, поэтому цветной статус не бросается в глаза.
  const executionBarClass =
    executionStatus === 'excellent' ? 'bg-excellent'
    : executionStatus === 'good' ? 'bg-good'
    : 'bg-poor'

  return (
    <div
      className="rounded-xl text-white shadow-sm px-5 py-2.5"
      style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--purple) 55%, color-mix(in oklch, var(--purple) 65%, white) 100%)' }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
        {/* Дни месяца + план по очкам — единая рамка, одна шкала. */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
          <div className="flex items-baseline justify-between gap-3">
            {/* Заголовок и процент — одной фразой, без цветового выделения
                цифры: статус уже понятен по цвету полосы ниже. */}
            <span className="text-xs uppercase tracking-wide opacity-80 whitespace-nowrap">
              План продаж на очки выполнен на {executionPct}%
            </span>
            <span className="text-xs font-medium opacity-90 tabular-nums whitespace-nowrap">{daysPassed}/{daysInMonth} дней месяца · {Math.round(progress.progress_percent)}%</span>
          </div>
          {/* Без отдельной рамки вокруг — обе полосы лежат прямо на фоне
              карточки, тем же инсетом, что и подпись над ними, никакой
              дополнительный контур не выделяется внутри блока. */}
          <div className="flex flex-col gap-1">
            {/* Дни — тонкие штрихи вверху, приглушённый тон, не спорят с полосой плана за белый */}
            <div className="flex gap-[3px]">
              {Array.from({ length: daysInMonth }, (_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-[1px] ${i < daysPassed ? 'bg-white/55' : 'bg-white/15'}`}
                />
              ))}
            </div>
            {/* План — тонкая полоса внизу, на той же шкале 0..100%, статусного цвета */}
            <div className="h-1.5 rounded-[1px] bg-white/15 overflow-hidden">
              <div
                className={`h-full rounded-[1px] ${executionBarClass}`}
                style={{ width: `${Math.min(executionPct, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Прогноз — справа, как в настоящем ProgressHeader. */}
        <div className="shrink-0 flex sm:flex-col items-baseline sm:items-end gap-2 sm:gap-0.5 sm:border-l sm:border-white/20 sm:pl-6 sm:text-right">
          <span className="text-xs uppercase tracking-wide opacity-80 whitespace-nowrap">Прогноз</span>
          <span className="text-xl font-medium leading-none tabular-nums" style={{ letterSpacing: '-0.5px' }}>
            {forecastPct}%
          </span>
          {delta !== null && (
            <span
              className="text-xs font-medium tabular-nums whitespace-nowrap"
              style={{ color: deltaPositive ? 'color-mix(in oklch, var(--excellent) 45%, white)' : 'color-mix(in oklch, var(--poor) 45%, white)' }}
            >
              {deltaPositive ? '+' : '−'}{formatMoney(delta)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * ДЕМО-ПРОТОТИП (не подключён к реальным сигналам, мок-данные): блок «Сегодня» —
 * задачи + сигналы прямо на Главной, до прогресса месяца. Прогресс месяца и
 * показатели по филиалам ниже остаются ровно как в реальном продукте —
 * ничего не убрано и не задвинуто, это чистое добавление.
 */
/** «Сегодня» — только настоящие задачи из календаря (у них есть время встречи),
 *  не сигналы. Сигнал без задачи — это ещё не задача, ему место в «Внимании»
 *  (см. YESTERDAY_RESULTS ниже) до тех пор, пока рОП не решит, что с ним делать. */
interface TodayItem {
  id: string
  employee: string
  role: string
  branch: string
  category: 'development' | 'organizational'
  workPlan: string
  metric?: string
  time: string
  status: TaskStatus
}
const TODAY_ITEMS: TodayItem[] = [
  { id: '1', employee: 'Сидоров Дмитрий Николаевич', role: 'Врач', branch: 'Садовая 7', category: 'development', workPlan: 'Поддерживающий разбор % рекомендаций ВТЛ', metric: '% рекомендаций ВТЛ', time: '11:00', status: 'completed' },
  { id: '4', employee: 'Волков Игорь Олегович', role: 'Консультант', branch: 'Ленина 24', category: 'development', workPlan: 'Повторная встреча — 2-я неделя подряд по % рецепт → заказ', metric: '% рецепт → заказ', time: '15:30', status: 'pending' },
]

/** Не «вчера» единичным днём (шум одного сложного клиента), а среднее за
 * последние 3 дня против нормы — устойчивый паттерн, а не случайность.
 * Это и есть источник сегодняшнего плана, не отдельная метрика выполнения.
 *
 * Оформление ряда — тот же паттерн «сигнал → решение», что уже в «Обзор смены»
 * (shift-employee-row.tsx): рамка «Рекомендация аналитики» + две кнопки
 * («Поставить задачу» / «Разобрал, не нужна»), а если по сотруднику уже есть
 * незакрытая задача по этой же метрике — рекомендация не показывается,
 * вместо неё отсылка к этой задаче (hasOpenTask). */
interface YesterdayResult {
  id: string
  employee: string
  role: string
  branch: string
  metric: string
  value: number
  norm: number
  isDrop: boolean
  days: number
  isMonetary?: boolean
  /** Среднее по этой же метрике среди коллег того же филиала — контекст:
   *  плохо относительно нормы или ещё и относительно коллег рядом. */
  branchAvg: number
  /** По этой же метрике уже стоит незакрытая задача — текст её плана работы. */
  hasOpenTask?: string
  /** Короткая причина просадки — не только цифры, но и что видно за ними
   *  (из разбора записи/планёрки). Как reason в AttentionItemBlock. */
  reason?: string
  /** Значения за последние дни (старое → новое), для мини-тренда — как
   *  спарклайн в rop-card.tsx, только по дням, а не по неделям. */
  trend: number[]
  /** Саммари последних 2-3 встреч/задач по этому сотруднику — не список
   *  названий (их не прочитать быстро), а готовый вывод: что пробовали и
   *  какой это дало эффект (видно по тренду). Источник тот же
   *  getEmployeeTaskHistory, что в rop-card.tsx, но здесь — уже выжимка,
   *  не сырой список. */
  historySummary?: string
  /** Задача в два шага: сначала ТИП действия рОПа (не метод работы с
   *  сотрудником — сам способ, которым рОП проверяет/вмешивается), потом
   *  деталь под выбранный тип. */
  taskOptions?: { type: 'Проверить данные' | 'Просмотреть/прослушать' | 'Встреча 1:1'; detail: string }[]
}
const YESTERDAY_RESULTS: YesterdayResult[] = [
  {
    id: 'r1', employee: 'Сидоров Дмитрий Николаевич', role: 'Врач', branch: 'Садовая 7',
    metric: '% рекомендаций ВТЛ', value: 41, norm: 52, isDrop: true, days: 3, branchAvg: 54,
    trend: [49, 45, 41],
    reason: 'На записях приёмов — уклоняется от темы при возражении «дорого», переводит на консультанта.',
    historySummary: 'За последние 2 встречи пробовали общий разбор показаний по шаблону и поддерживающую встречу по итогам недели — показатель всё равно продолжил снижаться.',
    taskOptions: [
      { type: 'Просмотреть/прослушать', detail: 'Разбор конкретной записи приёма — показать момент с возражением и проговорить фразу-замену' },
      { type: 'Встреча 1:1', detail: 'Парная смена с врачом, у которого ВТЛ выше нормы — перенять формулировки' },
    ],
  },
  {
    id: 'r2', employee: 'Козлова Елена Андреевна', role: 'Врач', branch: 'Ленина 24',
    metric: 'Балл чек-листа', value: 58, norm: 65, isDrop: true, days: 2, branchAvg: 69,
    trend: [64, 58],
    reason: 'Обзор смены: 1 приём из 2 ниже порога — пропущен этап «рекомендации по уходу».',
    taskOptions: [
      { type: 'Проверить данные', detail: 'Сверить чек-лист по последним 3 приёмам — какой этап пропускается стабильно' },
      { type: 'Просмотреть/прослушать', detail: 'Разобрать пропущенный этап чек-листа на записи приёма' },
    ],
  },
  {
    id: 'r3', employee: 'Волков Игорь Олегович', role: 'Консультант', branch: 'Ленина 24',
    metric: '% рецепт → заказ', value: 67, norm: 75, isDrop: true, days: 3, branchAvg: 73,
    trend: [74, 70, 67],
    hasOpenTask: 'Повторная встреча сегодня в 15:30 — 2-я неделя подряд по % рецепт → заказ',
  },
  {
    id: 'r5', employee: 'Кузнецов Артём Сергеевич', role: 'Консультант', branch: 'Садовая 7',
    metric: 'Средний чек', value: 19400, norm: 22000, isDrop: true, days: 3, isMonetary: true, branchAvg: 25200,
    trend: [21800, 20600, 19400],
    reason: 'С планёрки 28.09: разговор про допродажу линз закончился без цифр и срока.',
    historySummary: 'Это первый сигнал по нему за месяц — раньше задач по среднему чеку не ставили.',
    taskOptions: [
      { type: 'Просмотреть/прослушать', detail: 'Разбор звонка с допродажей — где терялась инициатива' },
      { type: 'Встреча 1:1', detail: 'Ролевая игра: отработка возражения «подумаю»' },
    ],
  },
  {
    id: 'r4', employee: 'Новикова Ольга Павловна', role: 'Консультант', branch: 'Садовая 7',
    metric: 'Средний чек', value: 24800, norm: 22000, isDrop: false, days: 1, isMonetary: true, branchAvg: 25200,
    trend: [22100, 23400, 24800],
  },
]

type TaskOption = { type: 'Проверить данные' | 'Просмотреть/прослушать' | 'Встреча 1:1'; detail: string }

/** Общий блок рекомендации задачи — одна готовая рекомендация (первый вариант
 *  в списке) — а весь маршрут целиком: рОПы на практике игнорируют
 *  рекомендации из одного шага («фастфудные» подсказки), реальные рОПы ведут
 *  свои задачи. Гипотеза: показать не вариант на выбор, а путь — «так идёт
 *  большинство руководителей» — и одной кнопкой завести ОДНУ задачу, план
 *  работы которой уже содержит все шаги по порядку. Переиспользуется в
 *  «Обратить внимание» на Главной и в модалке «Анализ филиала». */
function TaskRecommendationBlock({
  taskOptions, hasOpenTask, reviewed, onOpen, onDismiss, compact = false,
}: {
  taskOptions?: TaskOption[]
  hasOpenTask?: string
  reviewed: boolean
  onOpen: (detail?: string) => void
  onDismiss: () => void
  /** Маршрут одной строкой (шаги через →), подробности — по клику. */
  compact?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  if (hasOpenTask) {
    return (
      <p className="text-xs text-muted-foreground mt-1.5">
        По этому показателю задача уже есть — новую не предлагаем.
      </p>
    )
  }
  if (reviewed) {
    return <Badge variant="outline" className="gap-1 mt-1.5">Разобрано, без задачи</Badge>
  }
  const routePlan = taskOptions && taskOptions.length > 0
    ? taskOptions.map((o, i) => `${i + 1}. ${o.type}: ${o.detail}`).join('\n')
    : undefined
  if (compact && taskOptions && taskOptions.length > 0) {
    return (
      <div className="mt-2 rounded bg-muted/60 px-2.5 py-2">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="w-full text-left text-xs text-muted-foreground hover:text-foreground transition-colors"
          aria-expanded={expanded}
        >
          Обычно делают: <span className="text-foreground font-medium">{taskOptions.map(o => o.type).join(' → ')}</span>
          <span className="ml-1.5 underline decoration-dotted underline-offset-2">{expanded ? 'скрыть' : 'подробнее'}</span>
        </button>
        {expanded && (
          <ol className="mt-1.5 space-y-1">
            {taskOptions.map((opt, i) => (
              <li key={opt.type} className="text-xs text-muted-foreground">
                {i + 1}. <span className="text-foreground">{opt.type}</span>: {opt.detail}
              </li>
            ))}
          </ol>
        )}
        <div className="mt-1.5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => onOpen(routePlan)}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Plus className="w-3 h-3" /> Завести задачу
          </button>
          <button type="button" onClick={onDismiss} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Не нужна
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="mt-2">
      {taskOptions && taskOptions.length > 0 ? (
        <div className="bg-muted/60 rounded px-2.5 py-2">
          <p className="text-2xs text-muted-foreground mb-1.5">
            В похожей ситуации большинство руководителей идут по такому маршруту:
          </p>
          <ol className="space-y-1">
            {taskOptions.map((opt, i) => {
              const Icon = TASK_TYPE_ICON[opt.type]
              return (
                <li key={opt.type} className="flex items-start gap-1.5 text-xs">
                  <span className="shrink-0 w-4 text-2xs text-muted-foreground tabular-nums mt-0.5">{i + 1}.</span>
                  <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="font-medium text-foreground">{opt.type}</span>
                    <span className="text-muted-foreground"> — {opt.detail}</span>
                  </span>
                </li>
              )
            })}
          </ol>
          <button
            type="button"
            onClick={() => onOpen(routePlan)}
            className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded text-2xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            <Plus className="w-3 h-3" /> Завести задачу по этому маршруту
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onOpen()}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          <Plus className="w-3 h-3" /> Задача
        </button>
      )}
      <button type="button" onClick={onDismiss} className="block mt-1.5 text-2xs text-muted-foreground hover:text-foreground transition-colors">
        Не нужна
      </button>
    </div>
  )
}

/** Строка сотрудника в «Обзоре смены» — по образцу настоящей строки обзора
 *  смены (components/shift-overview/shift-employee-row.tsx): свёрнуто —
 *  имя, что случилось вчера и статус разбора; по клику — причина, открытые
 *  задачи, маршрут и те же кнопки «Поставить задачу» / «Разобрал, задача не
 *  нужна». Открытая задача НЕ блокирует новую — рОП решает сам. */
function AttentionEmployeeRow({
  items, reviewed, onCreateTask, onMarkReviewed, dayWord,
}: {
  /** Для прошлых смен: «вчера» в тексте заменяется на это слово. */
  dayWord?: string
  /** Все западающие показатели одного сотрудника — одна строка на человека. */
  items: AttentionEmployee[]
  reviewed: 'task' | 'no_task' | null
  onCreateTask: (metric: string, workPlan: string) => void
  onMarkReviewed: () => void
}) {
  const [open, setOpen] = useState(false)
  const e = items[0]
  const tasks = EMPLOYEE_OPEN_TASKS[e.employee] ?? []
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="font-semibold text-foreground">{e.employee}</span>
            <span className="text-muted-foreground"> · {e.role}</span>
          </p>
          {/* Свёрнуто — по строке на каждый западающий показатель. */}
          <ul className="mt-0.5 space-y-0.5">
            {items.map(it => (
              <li key={it.id} className="text-sm text-foreground">{dayWord ? it.plainText.replace(/^Вчера /, 'В смену ') : it.plainText}</li>
            ))}
          </ul>
          {tasks.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">Открытых задач: {tasks.length}</p>
          )}
        </div>
        {reviewed && (
          <span className="shrink-0 rounded-full bg-excellent/10 px-2.5 py-1 text-xs font-medium text-excellent">
            {reviewed === 'task' ? 'Задача поставлена' : 'Разобрал'}
          </span>
        )}
        <ChevronDown className={`h-4 w-4 mt-0.5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {tasks.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Открытые задачи</p>
              <ul className="space-y-0.5 text-xs">
                {tasks.map((t, i) => (
                  <li key={i} className="flex items-baseline gap-2">
                    <span className="text-foreground min-w-0 truncate">{t.text}</span>
                    <span className="shrink-0 text-muted-foreground whitespace-nowrap">до {t.due} · {t.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* По каждому показателю — своя причина, своя рекомендация и своя
              кнопка: задача ставится на конкретный показатель. */}
          {items.map(it => {
            const fmt = (n: number) => it.isMonetary ? Math.round(n).toLocaleString('ru-RU') + ' ₽' : n + '%'
            const belowOwnAvg = it.value < it.own3WeekAvg * 0.9
            const reason = it.window === 'week'
              ? `за 7 дней ${fmt(it.value)}, неделей раньше ${fmt(it.own3WeekAvg)}`
              : belowOwnAvg
              ? `${dayWord ?? 'вчера'} ${fmt(it.value)}, обычно ${fmt(it.own3WeekAvg)} (среднее за 3 недели)`
              : `${dayWord ?? 'вчера'} ${fmt(it.value)}, у коллег по филиалу в среднем ${fmt(it.branchAvgYesterday)}`
            const routePlan = it.taskOptions?.map((o, i) => `${i + 1}. ${o.type}: ${o.detail}`).join('\n')
            return (
              <div key={it.id} className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-foreground">{it.metric}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{reason}</p>
                {it.taskOptions && it.taskOptions.length > 0 && (
                  <div className="mt-2 rounded-md bg-primary/[0.04] border border-primary/15 p-2.5">
                    <p className="text-2xs font-semibold uppercase tracking-wide text-primary mb-1">Рекомендация аналитики</p>
                    <ol className="space-y-1">
                      {it.taskOptions.map((opt, i) => {
                        const Icon = TASK_TYPE_ICON[opt.type]
                        return (
                          <li key={opt.type} className="flex items-start gap-1.5 text-xs">
                            <span className="shrink-0 w-4 text-muted-foreground tabular-nums">{i + 1}.</span>
                            <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                            <span><span className="font-medium text-foreground">{opt.type}</span><span className="text-muted-foreground"> — {opt.detail}</span></span>
                          </li>
                        )
                      })}
                    </ol>
                  </div>
                )}
                {/* Уже есть задача по этому же показателю — показываем прямо
                    здесь, чтобы рОП решал с учётом её. Новую не запрещаем. */}
                {(() => {
                  const same = tasks.find(t => t.metric === it.metric)
                  return same ? (
                    <p className="mt-2.5 text-xs rounded-md bg-muted/60 px-2.5 py-2">
                      <span className="text-muted-foreground">По этому показателю уже есть задача: </span>
                      <span className="text-foreground">{same.text}</span>
                      <span className="text-muted-foreground"> · до {same.due} · {same.status}</span>
                    </p>
                  ) : null
                })()}
                <Button size="sm" className="gap-1.5 mt-2.5" onClick={() => onCreateTask(it.metric, routePlan ?? `Разбор по «${it.metric}»: вчера ${fmt(it.value)}.`)}>
                  <Plus className="h-3.5 w-3.5" /> {tasks.some(t => t.metric === it.metric) ? 'Поставить ещё задачу' : 'Поставить задачу'}
                </Button>
              </div>
            )
          })}

          {!reviewed && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onMarkReviewed}>
              <Check className="h-3.5 w-3.5" /> Разобрал, задача не нужна
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/** «Анализ филиала» — по порядку, как читает рОП: сперва статус плана,
 *  потом что мешает его выполнить (с приоритетом — что мешает сильнее всего),
 *  потом сотрудники — но тоже не одним списком, а в порядке, в каком реально
 *  возникает вопрос «что с людьми»: сначала прошлая смена (есть ли те, кто
 *  уже вчера лажал), потом слабая неделя (относительно своих же последних
 *  недель и относительно коллег филиала), потом слабый месяц — но с видимой
 *  динамикой (растёт или падает), а не голой констатацией. Без переключателя
 *  период/день/неделя — каждый блок сам говорит, за какой он срок, вопросов
 *  не возникает. */
interface PlanBlocker {
  metric: string
  /** Что реально происходит, простыми словами — без % и без названия
   *  метрики в заголовке. Для рОПа, которому проценты и конверсии ничего
   *  не говорят, это и есть содержание строки; метрика — только подпись. */
  plainText: string
  /** Необязательная вторая строка — ПОЧЕМУ так происходит, когда причина сама
   *  по себе не отдельная потеря денег, а объяснение этой же потери (пример:
   *  доля чужих рецептов — это причина просевшего среднего чека, а не вторая,
   *  отдельно посчитанная потеря; две суммы по одним и тем же деньгам задвоили
   *  бы итог). */
  causeText?: string
  /** Что исправлять — крупно, первой строкой. Симптом (plainText) — под ним
   *  мелко: рОП читает сначала то, на что может повлиять. */
  title: string
  impactAmount: number
  deviationPercent: number
  affectedCount: number
  factValue: number
  planValue: number
  isMonetary?: boolean
}
/** Что мешает плану — накопленным итогом с начала месяца, по убыванию влияния
 *  на план. Без переключателя периода — план один, месячный, и вопрос всегда
 *  один: что сейчас сильнее всего мешает именно ему. Сумма — не сухая цифра
 *  сама по себе, а готовая фраза «что будет, если это поправить». */
/** «К прошлому месяцу» на вкладке «Обзор» — ключевые показатели по очкам
 *  за одинаковые дни месяца. lowerIsBetter — где рост это плохо. */
const MONTH_COMPARE = {
  range: 'Сравниваем 1–6 октября с 1–6 сентября',
  prevLabel: 'Сентябрь',
  curLabel: 'Октябрь',
  rows: [
    { label: 'Продажи очков', prev: 1310000, cur: 1200689, unit: '₽' },
    { label: 'Заказов', prev: 54, cur: 52, unit: '' },
    { label: 'Средний чек', prev: 24300, cur: 23200, unit: '₽' },
    { label: 'Конверсия подбор → заказ', prev: 72, cur: 67, unit: '%' },
    { label: 'Доля ВТЛ', prev: 24, cur: 18, unit: '%' },
    { label: 'Чужие рецепты', prev: 11, cur: 15, unit: '%', lowerIsBetter: true },
  ] as { label: string; prev: number; cur: number; unit: string; lowerIsBetter?: boolean }[],
}

/** «Обзор трендов» — те же показатели по очкам, последние 7 дней против
 *  предыдущих 7 (решение 2026-10-05). lowerIsBetter — где рост это плохо. */
const TREND_COMPARE = {
  rows: [
    { label: 'Продажи очков', prev: 4980000, cur: 4390000, unit: '₽' },
    { label: 'Заказов', prev: 198, cur: 186, unit: '' },
    { label: 'Средний чек', prev: 25150, cur: 23600, unit: '₽' },
    { label: 'Конверсия подбор → заказ', prev: 73, cur: 64, unit: '%' },
    { label: 'Доля ВТЛ', prev: 21, cur: 19, unit: '%' },
    { label: 'Чужие рецепты', prev: 14, cur: 12, unit: '%', lowerIsBetter: true },
  ] as { label: string; prev: number; cur: number; unit: string; lowerIsBetter?: boolean }[],
}
/** Кто сильнее всего тянет вниз за 7 дней — если просадка сосредоточена в
 *  1–2 людях, а не во всей команде. */
const TREND_DRAGGERS: AttentionEmployee[] = [
  {
    id: 'td1', window: 'week', branch: 'Садовая 7', employee: 'Кузнецов Артём Сергеевич', role: 'Консультант', metric: 'Конверсия подбор → заказ',
    plainText: 'За неделю после подбора стал заметно реже доводить до заказа — больше половины падения филиала',
    value: 51, own3WeekAvg: 70, branchAvgYesterday: 64,
    taskOptions: [
      { type: 'Просмотреть/прослушать', detail: 'Разбор продаж недели — на каком шаге клиент уходит думать' },
      { type: 'Встреча 1:1', detail: 'Ролевая игра: отработка возражения «подумаю» после подбора' },
    ],
  },
  {
    id: 'td2', window: 'week', branch: 'Садовая 7', employee: 'Сидоров Дмитрий Николаевич', role: 'Врач', metric: '% рекомендаций ВТЛ',
    plainText: 'Всю неделю рекомендовал ВТЛ реже, чем неделей раньше',
    value: 16, own3WeekAvg: 22, branchAvgYesterday: 19,
    taskOptions: [
      { type: 'Просмотреть/прослушать', detail: 'Разбор приёмов недели — на каких рецептах не предложил ВТЛ' },
      { type: 'Встреча 1:1', detail: 'Парная смена с врачом, у которого ВТЛ выше нормы' },
    ],
  },
  {
    id: 'td3', window: 'week', branch: 'Садовая 7', employee: 'Сидоров Дмитрий Николаевич', role: 'Врач', metric: 'Средний чек',
    plainText: 'Заказы по его рецептам за неделю стали дешевле',
    value: 22900, own3WeekAvg: 25600, branchAvgYesterday: 23600, isMonetary: true,
    taskOptions: [
      { type: 'Просмотреть/прослушать', detail: 'Разбор приёмов недели — проговаривал ли варианты линз под задачи клиента' },
    ],
  },
  {
    id: 'td4', window: 'week', branch: 'Садовая 7', employee: 'Новикова Ольга Павловна', role: 'Консультант', metric: 'Средний чек',
    plainText: 'Третью неделю подряд продаёт оправы дешевле, чем раньше',
    value: 21400, own3WeekAvg: 24300, branchAvgYesterday: 23600, isMonetary: true,
    taskOptions: [
      { type: 'Просмотреть/прослушать', detail: 'Разбор продаж недели — где терялась допродажа по оправе' },
      { type: 'Встреча 1:1', detail: 'Короткий разбор: что мешает предлагать оправу дороже' },
    ],
  },
]

/** «Обзор трендов» — 4 скользящие недели (по 7 дней), от старой к последней.
 *  network — то же по остальным филиалам сети, чтобы отличить проблему
 *  филиала от общей (сезон, рынок). group: поток клиентов (начало воронки)
 *  отдельно от качества продаж. */
type TrendRow = { label: string; group: 'flow' | 'sales'; unit: string; values: number[]; network: number[]; lowerIsBetter?: boolean
  /** Те же 7 дней месяц назад, 2 месяца назад и год назад. */
  monthAgo: number; twoMonthsAgo: number; yearAgo: number }
const TREND_WEEKS: { weekLabels: string[]; rows: TrendRow[]; extraLossIfContinues: number } = {
  weekLabels: ['9–15 сен', '16–22 сен', '23–29 сен', '30 сен–6 окт'],
  extraLossIfContinues: 180000,
  rows: [
    { label: 'Приёмы', group: 'flow', unit: '', values: [212, 208, 214, 210], network: [205, 207, 206, 208], monthAgo: 206, twoMonthsAgo: 215, yearAgo: 198 },
    { label: 'Продажи очков', group: 'sales', unit: '₽', values: [5100000, 5020000, 4980000, 4390000], network: [4900000, 4950000, 4920000, 4960000], monthAgo: 4720000, twoMonthsAgo: 4850000, yearAgo: 4100000 },
    { label: 'Конверсия подбор → заказ', group: 'sales', unit: '%', values: [74, 73, 70, 64], network: [72, 72, 73, 72], monthAgo: 72, twoMonthsAgo: 71, yearAgo: 69 },
    { label: 'Средний чек', group: 'sales', unit: '₽', values: [25800, 25300, 24600, 23600], network: [25000, 24900, 25100, 25000], monthAgo: 24900, twoMonthsAgo: 24700, yearAgo: 22300 },
    { label: 'Доля ВТЛ', group: 'sales', unit: '%', values: [20, 21, 21, 19], network: [22, 22, 23, 22], monthAgo: 23, twoMonthsAgo: 22, yearAgo: 17 },
    { label: 'Чужие рецепты', group: 'sales', unit: '%', values: [15, 14, 14, 12], network: [12, 12, 11, 12], lowerIsBetter: true, monthAgo: 13, twoMonthsAgo: 14, yearAgo: 16 },
  ],
}

const PLAN_BLOCKERS: PlanBlocker[] = [
  {
    metric: 'Конверсия подбор → заказ',
    title: 'После подбора не предлагают вариант подешевле — клиент уходит думать',
    plainText: '13 клиентов ушли без заказа после подбора. Конверсия 67%, план 75%',
    causeText: 'Чаще всего — после подбора клиенту не предложили вариант подешевле или другую оправу, и он ушёл думать',
    factValue: 67, planValue: 75, deviationPercent: 8, impactAmount: 310000, affectedCount: 13,
  },
  {
    // ВТЛ выше по приоритету влияния на чек, поэтому идёт первым из двух блоков.
    metric: '% рекомендаций ВТЛ',
    title: 'Мало продают ВТЛ: 18% продаж вместо 28%',
    plainText: 'Тянет вниз средний чек: 23 200 ₽ вместо 25 400 ₽',
    causeText: 'Доля высокотехнологичных линз в продажах — 18% вместо 28% по плану',
    factValue: 23200, planValue: 25400, deviationPercent: 9, impactAmount: 120000, affectedCount: 2, isMonetary: true,
  },
  {
    metric: '% чужих заказов',
    title: 'Много клиентов с чужим рецептом: 15% вместо 9%',
    plainText: 'У них чек обычно ниже',
    causeText: 'Доля клиентов с рецептом от другого врача — 15% вместо 9% по плану, а у них чек обычно ниже',
    factValue: 23200, planValue: 25400, deviationPercent: 9, impactAmount: 95000, affectedCount: 2, isMonetary: true,
  },
]
// сверка: 120000 + 95000 = 215000 (суммарный вклад двух блоков «Средний чек»);
// 310000 (строка 1) + 215000 = 525000 = «Итого теряем из-за этого»

/** Обзор вчерашней смены — главная причина заходить в «Анализ филиала»
 *  каждый день: ровно за вчера, не за несколько дней, иначе не формируется
 *  привычка «зайти посмотреть, что было вчера» — сводка сразу при открытии,
 *  без необходимости куда-то ещё идти.
 *  (Оценка самих сотрудников — отдельно, по последним 3 сменам, см. ниже:
 *  один день для диагностики человека — случайность, а для сводки «что было
 *  вчера» это наоборот и есть весь смысл.) */
/** Тренд филиала — вкладка 3. Решение от 2026-10-05 (см. home-redesign-rules.md):
 *  не дни подряд (цепляет сезонность буднего/выходного как «тренд»), а
 *  скользящие 7 дней против предыдущих 7 — сезонность снята целиком,
 *  обновляется каждый день, а не раз в неделю. */
const ROLLING_WEEK_TREND = {
  thisWeekRevenue: 4390000,
  prevWeekRevenue: 4980000,
  thisWeekExecutionPercent: 87,
  prevWeekExecutionPercent: 99,
}
/** Что именно тянет неделю вниз — та же логика причин, что на вкладке
 *  «Обзор» (plainText без % в заголовке + причина курсивом), только на
 *  недельном окне. Без этого «хуже на 12%» — цифра без содержания, не повод
 *  для разговора ни с кем конкретно. */
interface TrendBlocker {
  plainText: string
  causeText: string
}
const TREND_BLOCKERS: TrendBlocker[] = [
  {
    plainText: 'Конверсия подбор → заказ вторую неделю подряд ниже нормы',
    causeText: '64% на этой неделе против 73% две недели назад — тот же провал, что отмечали на прошлой планёрке, ещё не выправился',
  },
  {
    plainText: 'Средний чек продолжает снижаться третью неделю',
    causeText: '23 400 ₽ против 25 800 ₽ три недели назад — то же давление ВТЛ и чужих рецептов, что на вкладке «Обзор», только теперь видно, что это не один месяц, а устойчивая динамика',
  },
]
const BRANCH_DAILY_TREND: { label: string; executionPercent: number }[] = [
  { label: 'Пн', executionPercent: 94 },
  { label: 'Вт', executionPercent: 89 },
  { label: 'Ср', executionPercent: 97 },
  { label: 'Вчера', executionPercent: 101 },
]
const LAST_SHIFT_DIGEST = {
  // Выручка всего включает не только заказы на очки (из воронки), но и
  // сопутствующие продажи (линзы, аксессуары, ремонт) — поэтому две суммы
  // разные и обе нужны: «всего» — для денег, «с заказов» — чтобы сверить с
  // воронкой ниже (orders совпадает с последним шагом воронки).
  revenueTotal: 741000,
  revenueFromOrders: 24 * 24200,
  avgCheck: 24200,
  ordersCount: 24,
  /** План продаж на очки на этот день и «обычная смена» — среднее за
   *  4 последних таких же дня недели (сравнивать вторник со вторником). */
  glassesPlan: 575000,
  usual: { glassesRevenue: 548000, ordersCount: 23, avgCheck: 23800, conversion: 66 },
}

/** Воронка смены — классический путь оптики: приём → рецепт → подбор → заказ.
 *  Показываем счёт и конверсию между шагами, не только итог — чтобы было
 *  видно, на каком именно шаге теряем, а не только общий результат. */
/** Смены по дням для пролистывания в «Обзоре смены»: [0] — вчера, дальше —
 *  на день раньше. Демо-цифры; в продукте — тот же расчёт за выбранную дату. */
const SHIFT_DAYS: { fact: number; total: number; orders: number; avg: number; conv: number }[] = [
  { fact: 580800, total: 741000, orders: 24, avg: 24200, conv: 57 },
  { fact: 512300, total: 668000, orders: 22, avg: 23300, conv: 52 },
  { fact: 604100, total: 772000, orders: 25, avg: 24200, conv: 60 },
  { fact: 498700, total: 640000, orders: 21, avg: 23700, conv: 50 },
  { fact: 553900, total: 701000, orders: 23, avg: 24100, conv: 55 },
  { fact: 621400, total: 790000, orders: 26, avg: 23900, conv: 61 },
  { fact: 470200, total: 612000, orders: 20, avg: 23500, conv: 48 },
]
const SHIFT_MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const SHIFT_WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
function shiftDateLabel(offset: number) {
  const d = new Date(); d.setDate(d.getDate() - 1 - offset)
  return `${SHIFT_WEEKDAYS[d.getDay()]}, ${d.getDate()} ${SHIFT_MONTHS_GEN[d.getMonth()]}`
}

const SHIFT_FUNNEL: { label: string; value: number }[] = [
  { label: 'Приёмы', value: 42 },
  { label: 'Рецепты', value: 38 },
  { label: 'Подборы', value: 35 },
  { label: 'Заказы', value: 24 },
]

/** Сотрудники, которые по итогам вчерашней смены требуют внимания — не вся
 *  таблица врачей/консультантов (за 3 минуты в неё не всмотришься), а только
 *  те, кто попадает под один из двух критериев: 1) вчера заметно хуже СВОЕГО
 *  среднего за последние 3 недели, или 2) вчера заметно хуже среднего ПО
 *  ФИЛИАЛУ именно за вчера. Приоритет — критерий 1: «стал хуже себя» более
 *  весомый повод для разговора, чем «вчера был слабым звеном смены», и если
 *  сработали оба — показываем только первый, не оба сразу (рОПу нужна ОДНА
 *  причина, не выбор из двух). «Заметно» — порог в ~10-15%, не любое
 *  отклонение. */
interface AttentionEmployee {
  branch: string
  id: string
  employee: string
  role: 'Врач' | 'Консультант'
  metric: string
  /** Человеческая фраза о том, что реально происходит — метрика в заголовке
   *  карточки ничего не говорит рОПу, который не живёт в процентах (тот же
   *  принцип, что на вкладке «Обзор»). */
  plainText: string
  value: number
  branchAvgYesterday: number
  own3WeekAvg: number
  isMonetary?: boolean
  taskOptions?: TaskOption[]
  /** 'week' — для «Обзора трендов»: value — за последние 7 дней,
   *  own3WeekAvg — за 7 дней до этого. */
  window?: 'week'
}
/** Открытые задачи по сотруднику (демо) — то, что уже поставлено и не
 *  закрыто. В реальном продукте — getWeeklyTasks по employee_guid, статус
 *  не completed/failed. sameMetric: задача по той же метрике, что и
 *  отклонение, — тогда новую не предлагаем. */
const EMPLOYEE_OPEN_TASKS: Record<string, { text: string; due: string; status: string; metric?: string }[]> = {
  'Сидоров Дмитрий Николаевич': [
    { text: 'Поддерживающий разбор % рекомендаций ВТЛ', due: '9 окт', status: 'В работе', metric: '% рекомендаций ВТЛ' },
    { text: 'Пройти обучение по новым линзам', due: '15 окт', status: 'Не начата' },
  ],
  'Кузнецов Артём Сергеевич': [],
  // Та же задача, что стоит в «Плане задач на сегодня» на Главной — данные
  // должны сходиться между блоками.
  'Волков Игорь Олегович': [
    { text: 'Повторная встреча — 2-я неделя подряд по % рецепт → заказ', due: '7 окт', status: 'Сегодня в 15:30', metric: '% рецепт → заказ' },
  ],
  'Козлова Елена Андреевна': [
    { text: 'Разобрать чек-лист приёма по рекомендациям ВТЛ', due: '10 окт', status: 'В работе', metric: '% рекомендаций ВТЛ' },
  ],
  'Новикова Ольга Павловна': [
    { text: 'Отработка допродажи оправы — ролевая игра', due: '8 окт', status: 'Не начата', metric: 'Средний чек' },
  ],
}

const SHIFT_ATTENTION: AttentionEmployee[] = [
  // Хуже среднего по филиалу вчера — и это его обычный уровень (не разовая
  // просадка относительно себя), т.е. единственный сработавший критерий — 2.
  {
    id: 'sa1', branch: 'Садовая 7', employee: 'Сидоров Дмитрий Николаевич', role: 'Врач', metric: '% рекомендаций ВТЛ',
    plainText: 'Вчера рекомендовал высокотехнологичные линзы заметно реже, чем остальные врачи по филиалу',
    value: 38, branchAvgYesterday: 54, own3WeekAvg: 40,
    taskOptions: [
      { type: 'Просмотреть/прослушать', detail: 'Разбор вчерашних приёмов — на каких именно рецептах не предложил высокотехнологичные линзы' },
      { type: 'Встреча 1:1', detail: 'Парная смена с врачом, у которого ВТЛ выше нормы — перенять формулировки' },
    ],
  },
  // Второй западающий показатель у того же человека — в интерфейсе
  // показывается в той же строке сотрудника, а не отдельной карточкой.
  {
    id: 'sa1b', branch: 'Садовая 7', employee: 'Сидоров Дмитрий Николаевич', role: 'Врач', metric: 'Средний чек',
    plainText: 'Вчера заказы по его рецептам были заметно дешевле, чем обычно',
    value: 21800, branchAvgYesterday: 25200, own3WeekAvg: 24500, isMonetary: true,
    taskOptions: [
      { type: 'Просмотреть/прослушать', detail: 'Разбор вчерашних приёмов — проговаривал ли варианты линз под задачи клиента' },
      { type: 'Встреча 1:1', detail: 'Короткий разбор: что мешало рекомендовать линзы дороже' },
    ],
  },
  // Ниже своего обычного уровня — критерий 1 сработал, он и приоритетнее.
  {
    id: 'sa2', branch: 'Ленина 24', employee: 'Волков Игорь Олегович', role: 'Консультант', metric: 'Средний чек',
    plainText: 'Вчера продавал заказы с оправой заметно дешевле, чем обычно сам',
    value: 20900, branchAvgYesterday: 25200, own3WeekAvg: 24800, isMonetary: true,
    taskOptions: [
      { type: 'Просмотреть/прослушать', detail: 'Разбор вчерашних продаж — на каких заказах предложил оправу подешевле и почему' },
      { type: 'Встреча 1:1', detail: 'Короткий разбор: что изменилось со вчера, что мешало предлагать оправу дороже' },
    ],
  },
  {
    id: 'sa3', branch: 'Садовая 7', employee: 'Кузнецов Артём Сергеевич', role: 'Консультант', metric: 'Средний чек',
    plainText: 'Вчера продавал заказы с оправой заметно дешевле, чем обычно сам',
    value: 19400, branchAvgYesterday: 25200, own3WeekAvg: 24100, isMonetary: true,
    taskOptions: [
      { type: 'Просмотреть/прослушать', detail: 'Разбор вчерашних продаж — где терялась допродажа по оправе' },
      { type: 'Встреча 1:1', detail: 'Ролевая игра: отработка возражения «подумаю» на оправе подороже' },
    ],
  },
  // По филиалу вчера в норме (даже выше), но заметно просел относительно
  // СЕБЯ — единственный сработавший критерий — 1, тот случай, который
  // сравнение «только с филиалом» вообще не поймало бы.
  {
    id: 'sa4', branch: 'Ленина 24', employee: 'Козлова Елена Андреевна', role: 'Врач', metric: '% рекомендаций ВТЛ',
    plainText: 'Вчера рекомендовала высокотехнологичные линзы заметно реже, чем обычно сама',
    value: 58, branchAvgYesterday: 54, own3WeekAvg: 72,
    taskOptions: [
      { type: 'Проверить данные', detail: 'Сверить вчерашние приёмы — не было ли внешней причины (сложные случаи, нехватка времени)' },
      { type: 'Встреча 1:1', detail: 'Короткий чек-ин — спросить, что было не так вчера' },
    ],
  },
]


/** Заголовок секции с иконкой и цветным акцентом — чтобы пять блоков подряд
 *  не сливались в одну серую простыню: у каждого свой цвет/значок, видно с
 *  одного взгляда при скролле, на каком блоке находишься. */
function ModalSectionHeader({
  icon: Icon, tone, title, subtitle,
}: {
  icon: typeof Database
  tone: 'primary' | 'poor' | 'muted'
  title: string
  subtitle?: string
}) {
  const toneClass = tone === 'poor' ? 'bg-poor/10 text-poor' : tone === 'muted' ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${toneClass}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <h3 className="text-sm font-semibold leading-tight">{title}</h3>
        {subtitle && <p className="text-2xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

function BranchAnalysisModal({
  open, onClose, progress, branchName, initialTab = 'overview',
}: {
  open: boolean
  onClose: () => void
  progress: MonthlyProgress | null
  /** Открыт из карточки конкретного филиала — сотрудники только его. */
  branchName?: string | null
  initialTab?: 'overview' | 'shift' | 'trend'
}) {
  const { user } = useAuth()
  const [tab, setTab] = useState<'overview' | 'shift' | 'trend'>(initialTab)
  // Каждое открытие — на той вкладке, ради которой открыли (иконка
  // «Требуют внимания» в карточке филиала ведёт сразу на «Обзор смены»).
  useEffect(() => { if (open) setTab(initialTab) }, [open, initialTab])
  const [trendView, setTrendView] = useState<'weeks' | 'periods'>('weeks')
  const [shiftOffset, setShiftOffset] = useState(0)
  useEffect(() => { if (open) setShiftOffset(0) }, [open])
  const [reviewState, setReviewState] = useState<Record<string, 'task' | 'no_task'>>({})
  const attentionAll = branchName ? SHIFT_ATTENTION.filter(e => e.branch === branchName) : SHIFT_ATTENTION
  // Демо: в другие смены отклонились другие люди (а в одну — никто).
  const attention = shiftOffset === 0 ? attentionAll
    : shiftOffset === 2 ? []
    : attentionAll.filter((_, i) => (i + shiftOffset) % 2 === 0)

  // Задача по сотруднику из «Требуют внимания» — тот же маршрут, что и в
  // «Обратить внимание» на Главной (TaskRecommendationBlock + TaskFormModal):
  // не выбор из вариантов, а одна готовая рекомендация с кнопкой «Завести».
  const [employees, setEmployees] = useState<GroupedEmployeeList | null>(null)
  const [managers, setManagers] = useState<ManagerOption[]>([])
  const [taskModalPreset, setTaskModalPreset] = useState<{ metric: string; workPlan: string } | null>(null)
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    getEmployeesList(undefined, 2, true).then(setEmployees).catch(console.error)
    getTaskManagers().then(list => setManagers(list.map(m => ({
      id: m.id,
      name: user && m.id === user.id ? `${m.full_name} (вы)` : m.full_name,
    })))).catch(console.error)
  }, [open, user?.id])

  return (
    <>
      <ModalShell open={open} onClose={onClose} title="Анализ филиала" className="max-w-2xl max-h-[85vh]">
        <div className="flex flex-col max-h-[85vh]">
          <div className="px-5 pt-5 pb-3 border-b shrink-0">
            <h2 className="text-lg font-semibold mb-3">Анализ филиала{branchName && <span className="font-normal text-muted-foreground"> · {branchName}</span>}</h2>
            <div className="inline-flex items-center gap-1 bg-muted rounded-lg p-0.5">
              {([
                { id: 'overview', label: 'Обзор месяца' },
                { id: 'shift', label: 'Обзор смены' },
                { id: 'trend', label: 'Обзор трендов' },
              ] as const).map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${tab === t.id ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
           {tab === 'overview' && <>
            {/* Один отчёт, одна рамка — заголовок-вывод + таблица причин
                под ним, разделённые тонкой линией, а не два разных по стилю
                блока подряд. Так читается как цельный отчёт от ИИ-помощника:
                сверху — вывод, снизу — на чём он основан, одним взглядом. */}
            {progress && (() => {
              const p = progress
              const rub = (n: number) => Math.round(n).toLocaleString('ru-RU') + ' ₽'
              // Зона — по прогнозу (темпу), а не по факту на сегодня: иначе
              // в начале месяца любой филиал «красный» и спорит с карточкой.
              const forecast = Math.round(p.forecast_percent)
              const zone: 'green' | 'yellow' | 'red' = forecast >= 95 ? 'green' : forecast >= 85 ? 'yellow' : 'red'
              const zoneConfig = {
                green: { label: 'Зелёная зона', className: 'bg-excellent/10 text-excellent border border-excellent/20' },
                yellow: { label: 'Жёлтая зона', className: 'bg-good/10 text-good border border-good/30' },
                red: { label: 'Красная зона', className: 'bg-poor/10 text-poor border border-poor/20' },
              }[zone]
              const gap = p.plan_amount > 0 ? Math.max(0, (1 - p.forecast_percent / 100) * p.plan_amount) : 0
              const explained = PLAN_BLOCKERS.reduce((sum, b) => sum + b.impactAmount, 0)
              const rest = Math.max(0, gap - explained)
              return (
                <>
                  {/* Шапка — явно «план продаж на очки» (не общая выручка) и
                      только доли: темп месяца против выполнения, прогноз и
                      недобор. Абсолютные суммы факта/прогноза убраны — их
                      не с чем сравнить взглядом, а недобор и так в рублях. */}
                  <div className="rounded-lg border border-border px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-sm font-semibold">План продаж на очки</h3>
                      <span className={`shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${zoneConfig.className}`}>
                        {zoneConfig.label}
                      </span>
                    </div>
                    {/* Обычным текстом, одной мыслью: где мы сейчас относительно
                        темпа месяца и чем это кончится, если ничего не менять. */}
                    <p className="text-sm text-foreground leading-relaxed mt-1.5">
                      Выполнен на <span className="font-semibold">{Math.round(p.execution_percent)}%</span>, а прошло{' '}
                      <span className="font-semibold">{Math.round(p.progress_percent)}%</span> месяца —{' '}
                      {p.execution_percent >= p.progress_percent ? 'успеваем'
                        : p.execution_percent >= p.progress_percent * 0.85 ? 'чуть отстаём'
                        : 'заметно отстаём'}.{' '}
                      В таком темпе к концу месяца будет <span className="font-semibold">{forecast}%</span> плана
                      {gap > 0
                        ? <> — не хватит <span className="font-semibold text-poor tabular-nums">{rub(gap)}</span>.</>
                        : '.'}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold">Что мешает плану</h3>
                    <p className="text-xs text-muted-foreground mt-0.5 mb-2.5">Сколько из-за этого не доберём к концу месяца</p>
                    {PLAN_BLOCKERS.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4 rounded-lg border border-border">Ничего ощутимо не тормозит план.</p>
                    ) : (
                      <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
                        {PLAN_BLOCKERS.map((b, i) => (
                          <div key={i} className="flex items-start gap-3 px-4 py-3">
                            <span className="mt-0.5 inline-flex w-5 h-5 shrink-0 rounded-full bg-muted items-center justify-center text-2xs font-semibold text-muted-foreground">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground">{b.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{b.plainText}</p>
                              {/* На телефоне сумма — под текстом, а не колонкой справа. */}
                              <p className="sm:hidden mt-1 text-sm font-semibold text-poor tabular-nums">−{rub(b.impactAmount)}</p>
                            </div>
                            <p className="hidden sm:block shrink-0 text-sm font-semibold text-poor tabular-nums whitespace-nowrap">−{rub(b.impactAmount)}</p>
                          </div>
                        ))}
                        <div className="px-4 py-2.5 bg-muted/50 text-xs text-muted-foreground">
                          Из-за этого — <span className="font-semibold text-foreground tabular-nums">{rub(explained)}</span>
                          {rest > 0 && <> из {rub(gap)}. Остальные <span className="tabular-nums">{rub(rest)}</span> — просто меньше клиентов</>}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Сравнение с прошлым месяцем — за те же дни (1–N число),
                      а не с целым месяцем: иначе октябрь на 6-е всегда «хуже». */}
                  <div>
                    <h3 className="text-sm font-semibold">К прошлому месяцу</h3>
                    <p className="text-xs text-muted-foreground mt-0.5 mb-2.5">{MONTH_COMPARE.range}</p>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-2xs text-muted-foreground bg-muted/40">
                            <th className="text-left font-medium px-4 py-2">Показатель</th>
                            <th className="text-right font-medium px-2 py-2">{MONTH_COMPARE.prevLabel}</th>
                            <th className="text-right font-medium pl-2 pr-4 sm:pr-2 py-2">{MONTH_COMPARE.curLabel}</th>
                            <th className="hidden sm:table-cell text-right font-medium pl-2 pr-4 py-2 w-16"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {MONTH_COMPARE.rows.map(r => {
                            const diff = r.cur - r.prev
                            const better = r.lowerIsBetter ? diff < 0 : diff > 0
                            const fmt = (n: number) => r.unit === '₽' ? Math.round(n).toLocaleString('ru-RU') + ' ₽' : `${n}${r.unit}`
                            const diffText = r.unit === '%'
                              ? `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${Math.abs(diff)} п.п.`
                              : `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${Math.round(Math.abs(diff / r.prev) * 100)}%`
                            return (
                              <tr key={r.label}>
                                <td className="px-4 py-2 text-foreground leading-snug">{r.label}</td>
                                <td className="px-2 py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">{fmt(r.prev)}</td>
                                <td className="pl-2 pr-4 sm:pr-2 py-2 text-right tabular-nums font-medium whitespace-nowrap">
                                  {fmt(r.cur)}
                                  {/* На телефоне изменение — под значением, отдельная колонка не влезает. */}
                                  <span className={`sm:hidden block text-2xs ${diff === 0 ? 'text-muted-foreground' : better ? 'text-excellent' : 'text-poor'}`}>{diff === 0 ? '—' : diffText}</span>
                                </td>
                                <td className={`hidden sm:table-cell pl-2 pr-4 py-2 text-right tabular-nums text-xs font-medium whitespace-nowrap ${diff === 0 ? 'text-muted-foreground' : better ? 'text-excellent' : 'text-poor'}`}>
                                  {diff === 0 ? '—' : diffText}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )
            })()}
           </>}

           {tab === 'shift' && <>
            {/* Обзор смены — вторая вкладка, та же логика отчёта, что на
                вкладке «Обзор», но за вчера и с фокусом на действие: факт/
                план смены одной фразой + тренд, воронка (где именно теряем
                по шагам) и — вместо таблицы всех сотрудников — только те,
                кто требует внимания, с готовой причиной. */}
            <div>
              {/* Смены листаются стрелками: по умолчанию — вчера, назад до недели. */}
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"><Clock className="w-4 h-4" /></div>
                  <h3 className="text-sm font-semibold truncate">{shiftOffset === 0 ? 'Результаты вчерашней смены' : 'Результаты смены'}</h3>
                </div>
                <div className="shrink-0 flex items-center gap-0.5 rounded-lg border border-border bg-accent px-0.5 h-8">
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Предыдущая смена" disabled={shiftOffset >= SHIFT_DAYS.length - 1} onClick={() => setShiftOffset(o => o + 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs font-medium tabular-nums whitespace-nowrap px-1 min-w-[96px] text-center">{shiftOffset === 0 ? 'вчера, ' + shiftDateLabel(0).split(', ')[1] : shiftDateLabel(shiftOffset)}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Следующая смена" disabled={shiftOffset === 0} onClick={() => setShiftOffset(o => o - 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                {(() => {
                  const overallConversion = Math.round((SHIFT_FUNNEL[SHIFT_FUNNEL.length - 1].value / SHIFT_FUNNEL[0].value) * 100)
                  const rub = (n: number) => Math.round(n).toLocaleString('ru-RU') + ' ₽'
                  const day = SHIFT_DAYS[shiftOffset]
                  const fact = day.fact
                  const perDay = LAST_SHIFT_DIGEST.glassesPlan
                  return (
                    <div className="px-4 py-3.5 bg-accent/20">
                      {/* Не «% дневного плана», а две суммы рядом: сколько в
                          среднем нужно продавать очков в день и сколько продали. */}
                      <p className="text-sm">
                        {shiftOffset === 0 ? 'Вчера продали' : 'Продали'} очков на{' '}
                        <span className={`font-bold ${fact >= perDay ? 'text-excellent' : 'text-poor'}`}>{rub(fact)}</span>
                        {' '}— в среднем за день нужно {rub(perDay)}
                      </p>

                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 pt-3 border-t border-border/60">
                        {[
                          ['Выручка всего', Math.round(day.total).toLocaleString('ru-RU') + ' ₽'],
                          ['Заказов', String(day.orders)],
                          ['Средний чек', Math.round(day.avg).toLocaleString('ru-RU') + ' ₽'],
                          ['Конверсия приём → заказ', (shiftOffset === 0 ? overallConversion : day.conv) + '%'],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <p className="text-2xs text-muted-foreground">{label}</p>
                            <p className="text-sm font-semibold tabular-nums">{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>

            <div>
              <ModalSectionHeader icon={AlertTriangle} tone="poor" title="Требуют внимания" subtitle={`Хуже своих 3 недель или хуже коллег ${shiftOffset === 0 ? 'за вчера' : 'в эту смену'} · нажмите, чтобы разобрать`} />
              {attention.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Все в пределах нормы — отклонений нет.</p>
              ) : (
                <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
                  {Array.from(new Set(attention.map(x => x.employee))).map(name => {
                    const items = attention.filter(x => x.employee === name)
                    return (
                      <AttentionEmployeeRow
                        key={`${name}-${shiftOffset}`}
                        dayWord={shiftOffset === 0 ? undefined : 'в смену'}
                        items={items}
                        reviewed={reviewState[name] ?? null}
                        onCreateTask={(metric, workPlan) => {
                          setTaskModalPreset({ metric, workPlan })
                          setReviewState(prev => ({ ...prev, [name]: 'task' }))
                        }}
                        onMarkReviewed={() => setReviewState(prev => ({ ...prev, [name]: 'no_task' }))}
                      />
                    )
                  })}
                </div>
              )}
            </div>
           </>}

           {tab === 'trend' && (() => {
            const rub = (n: number) => Math.round(n).toLocaleString('ru-RU') + ' ₽'
            const fmtVal = (r: TrendRow, n: number) => r.unit === '₽'
              ? (n >= 1000000 ? (n / 1000000).toFixed(2).replace('.', ',') + ' млн ₽' : rub(n))
              : `${n}${r.unit}`
            // Направление словами: сколько недель подряд в одну сторону.
            // «Стабильно» — если общее изменение за 4 недели меньше ~3%.
            const direction = (vals: number[], lowerIsBetter?: boolean): { text: string; tone: 'good' | 'bad' | 'flat' } => {
              const first = vals[0], last = vals[vals.length - 1]
              if (Math.abs(last - first) / first < 0.03) return { text: 'стабильно', tone: 'flat' }
              const down = last < first
              let streak = 0
              for (let i = vals.length - 1; i > 0; i--) {
                if (down ? vals[i] < vals[i - 1] : vals[i] > vals[i - 1]) streak++
                else break
              }
              const verb = down ? 'падает' : 'растёт'
              const text = streak >= 2 ? `${verb} ${streak}-ю неделю` : streak === 1 ? `${down ? 'снижение' : 'рост'} за последнюю неделю` : verb
              const good = lowerIsBetter ? down : !down
              return { text, tone: good ? 'good' : 'bad' }
            }
            const sales = TREND_WEEKS.rows.find(r => r.label === 'Продажи очков')!
            const sPrev = sales.values[sales.values.length - 2], sCur = sales.values[sales.values.length - 1]
            const diffPct = Math.round(((sCur - sPrev) / sPrev) * 100)
            const toneClass = { good: 'text-excellent', bad: 'text-poor', flat: 'text-muted-foreground' }
            // Группы по выводу (что разбирать / что сезон / что в порядке) —
            // разделителями внутри одной таблицы.
            const classified = TREND_WEEKS.rows.map(r => ({ r, d: direction(r.values, r.lowerIsBetter), n: direction(r.network, r.lowerIsBetter) }))
            const groups = [
              { title: 'Падает только у нас — в сети ровно, стоит разобрать', items: classified.filter(x => x.d.tone === 'bad' && x.n.tone !== 'bad') },
              { title: 'Падает у всех — скорее сезон или рынок', items: classified.filter(x => x.d.tone === 'bad' && x.n.tone === 'bad') },
              { title: 'Стабильно или растёт', items: classified.filter(x => x.d.tone !== 'bad') },
            ].filter(g => g.items.length > 0)
            const cmpCell = (r: TrendRow, past: number) => {
              const cur = r.values[r.values.length - 1]
              const diff = cur - past
              const better = r.lowerIsBetter ? diff < 0 : diff > 0
              const txt = r.unit === '%'
                ? `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${Math.abs(diff)} п.п.`
                : `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${Math.round(Math.abs(diff / past) * 100)}%`
              return (
                <td className="px-2 py-2 text-right align-top whitespace-nowrap">
                  <span className="block tabular-nums text-muted-foreground">{fmtVal(r, past)}</span>
                  <span className={`block text-2xs tabular-nums ${diff === 0 ? 'text-muted-foreground' : better ? 'text-excellent' : 'text-poor'}`}>{diff === 0 ? '—' : txt}</span>
                </td>
              )
            }
            return <>
              {/* Сверху — итог текстом и к чему ведёт, если так пойдёт дальше. */}
              <div className="rounded-lg border border-border px-4 py-3">
                <h3 className="text-sm font-semibold">Последние 7 дней</h3>
                <p className="text-sm text-foreground leading-relaxed mt-1.5">
                  Продали очков на <span className="font-semibold">{rub(sCur)}</span> —{' '}
                  <span className={`font-semibold ${diffPct < 0 ? 'text-poor' : 'text-excellent'}`}>
                    на {Math.abs(diffPct)}% {diffPct < 0 ? 'меньше' : 'больше'}
                  </span>
                  , чем за 7 дней до этого.
                  {TREND_WEEKS.extraLossIfContinues > 0 && <>
                    {' '}Если так пойдёт дальше, к концу месяца недоберём ещё{' '}
                    <span className="font-semibold text-poor tabular-nums">{rub(TREND_WEEKS.extraLossIfContinues)}</span>.
                  </>}
                </p>
              </div>

              {/* Таблица вместо графиков: последние 7 дней против тех же 7 дней
                  месяц, 2 месяца и год назад. Под значением прошлого периода —
                  насколько сейчас лучше/хуже. На телефоне — прокрутка вбок. */}
              <div>
                {/* Два среза одной таблицы: по неделям (динамика подряд) и к
                    прошлым периодам (месяц, 2 месяца, год назад). */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 mb-2.5">
                  <div>
                    <h3 className="text-sm font-semibold">Как менялось</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {trendView === 'weeks' ? 'По неделям, последняя — справа' : 'Последние 7 дней против тех же дней раньше'}
                    </p>
                  </div>
                  <div className="shrink-0 self-start inline-flex items-center gap-1 bg-muted rounded-lg p-0.5">
                    {([['weeks', 'По неделям'], ['periods', 'К прошлым периодам']] as const).map(([id, label]) => (
                      <button
                        key={id}
                        onClick={() => setTrendView(id)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${trendView === id ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {trendView === 'weeks' ? (
                  // На телефоне таблица шире экрана — сразу прокручиваем к
                  // последней неделе, она важнее старых.
                  <div ref={el => { if (el) el.scrollLeft = el.scrollWidth }} className="rounded-lg border border-border overflow-x-auto">
                    <table className="w-full text-sm min-w-[520px]">
                      <thead>
                        <tr className="text-2xs text-muted-foreground bg-muted">
                          <th className="sticky left-0 z-10 bg-muted text-left font-medium px-4 py-2 min-w-[150px]">Показатель</th>
                          {TREND_WEEKS.weekLabels.map((w, i) => (
                            <th key={w} className={`text-right font-medium py-2 whitespace-nowrap ${i === TREND_WEEKS.weekLabels.length - 1 ? 'pl-2 pr-4' : 'px-2'}`}>{w}</th>
                          ))}
                        </tr>
                      </thead>
                      {groups.map(g => (
                        <tbody key={g.title} className="divide-y divide-border border-t border-border">
                          <tr>
                            {/* Название группы — в закреплённой первой колонке, чтобы
                                не уезжало при прокрутке вбок на телефоне. */}
                            <td className="sticky left-0 z-10 bg-muted px-4 py-1.5 text-xs font-semibold text-foreground leading-snug max-w-[170px] sm:max-w-none">{g.title}</td>
                            <td colSpan={TREND_WEEKS.weekLabels.length} className="bg-muted" />
                          </tr>
                          {g.items.map(({ r, d }) => (
                            <tr key={r.label}>
                              <td className="sticky left-0 z-10 bg-card px-4 py-2 align-top min-w-[150px] max-w-[170px] sm:max-w-none shadow-[1px_0_0_var(--border)] sm:shadow-none">
                                <span className="block text-foreground leading-snug">{r.label}</span>
                                <span className={`block text-2xs ${toneClass[d.tone]}`}>{d.text}</span>
                              </td>
                              {r.values.map((v, i) => {
                                const last = i === r.values.length - 1
                                const prev = i > 0 ? r.values[i - 1] : null
                                const diff = prev === null ? 0 : v - prev
                                const better = r.lowerIsBetter ? diff < 0 : diff > 0
                                const txt = prev === null ? '' : r.unit === '%'
                                  ? `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${Math.abs(diff)} п.п.`
                                  : `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${Math.round(Math.abs(diff / prev) * 100)}%`
                                return (
                                  <td key={i} className={`py-2 text-right align-top whitespace-nowrap ${last ? 'pl-2 pr-4' : 'px-2'}`}>
                                    <span className={`block tabular-nums ${last ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{fmtVal(r, v)}</span>
                                    {/* Изменение к предыдущей неделе */}
                                    {prev !== null && (
                                      <span className={`block text-2xs tabular-nums ${diff === 0 ? 'text-muted-foreground' : better ? 'text-excellent' : 'text-poor'}`}>{diff === 0 ? '—' : txt}</span>
                                    )}
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      ))}
                    </table>
                  </div>
                ) : (
                <div className="rounded-lg border border-border overflow-x-auto">
                  <table className="w-full text-sm min-w-[520px]">
                    <thead>
                      <tr className="text-2xs text-muted-foreground bg-muted/40">
                        <th className="sticky left-0 z-10 bg-muted text-left font-medium px-4 py-2 min-w-[150px]">Показатель</th>
                        <th className="text-right font-medium px-2 py-2">Сейчас</th>
                        <th className="text-right font-medium px-2 py-2">Месяц назад</th>
                        <th className="text-right font-medium px-2 py-2">2 месяца назад</th>
                        <th className="text-right font-medium pl-2 pr-4 py-2">Год назад</th>
                      </tr>
                    </thead>
                    {groups.map(g => (
                      <tbody key={g.title} className="divide-y divide-border border-t border-border">
                        <tr className="bg-muted/20">
                          <td colSpan={5} className="px-4 py-1.5 text-xs font-semibold text-foreground"><span className="sticky left-4">{g.title}</span></td>
                        </tr>
                        {g.items.map(({ r, d }) => (
                          <tr key={r.label}>
                            <td className="sticky left-0 z-10 bg-card px-4 py-2 align-top min-w-[150px] max-w-[170px] sm:max-w-none shadow-[1px_0_0_var(--border)] sm:shadow-none">
                              <span className="block text-foreground leading-snug">{r.label}</span>
                              <span className={`block text-2xs ${toneClass[d.tone]}`}>{d.text}</span>
                            </td>
                            <td className="px-2 py-2 text-right align-top font-semibold tabular-nums whitespace-nowrap">{fmtVal(r, r.values[r.values.length - 1])}</td>
                            {cmpCell(r, r.monthAgo)}
                            {cmpCell(r, r.twoMonthsAgo)}
                            {cmpCell(r, r.yearAgo)}
                          </tr>
                        ))}
                      </tbody>
                    ))}
                  </table>
                </div>
                )}
              </div>

              {/* Те же раскрывающиеся строки, что в «Обзоре смены»: один
                  человек — одна строка, внутри все его просевшие показатели. */}
              {TREND_DRAGGERS.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold">Кто тянет вниз</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-2.5">Просели за последние 7 дней сильнее остальных · нажмите, чтобы разобрать</p>
                  <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
                    {Array.from(new Set(TREND_DRAGGERS.map(x => x.employee))).map(name => {
                      const key = `trend:${name}`
                      return (
                        <AttentionEmployeeRow
                          key={name}
                          items={TREND_DRAGGERS.filter(x => x.employee === name)}
                          reviewed={reviewState[key] ?? null}
                          onCreateTask={(metric, workPlan) => {
                            setTaskModalPreset({ metric, workPlan })
                            setReviewState(prev => ({ ...prev, [key]: 'task' }))
                          }}
                          onMarkReviewed={() => setReviewState(prev => ({ ...prev, [key]: 'no_task' }))}
                        />
                      )
                    })}
                  </div>
                </div>
              )}
            </>
           })()}
          </div>
        </div>
      </ModalShell>

      <TaskFormModal
        key={taskModalPreset ? taskModalPreset.metric : 'closed'}
        isOpen={taskModalPreset !== null}
        onClose={() => setTaskModalPreset(null)}
        onSave={async (taskData) => {
          const result = await createWeeklyTask(taskData)
          if (result === null) throw new Error('Ошибка сервера')
          setTaskModalPreset(null)
        }}
        employees={employees}
        managers={managers}
        presetMetric={taskModalPreset?.metric}
        presetWorkPlan={taskModalPreset?.workPlan}
        currentUserRole={user?.role}
        currentUserId={user?.id}
        currentUserEmployeeGuid={user?.employee_guid}
      />
    </>
  )
}

/** Тайл-индикатор, который сам разворачивается вниз по клику — не уводит
 * со страницы. Второй раз кликнуть по тому же — сворачивает обратно. */
/** Один блок, две переключаемые секции («Сегодня» / «Внимание»), по умолчанию
 *  обе свёрнуты — список разворачивается только по клику, и то временно,
 *  чтобы не отжимать «Показатели» вниз, пока рОП не попросил деталей явно. */
function pluralEmployees(n: number): string {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'сотрудник'
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'сотрудника'
  return 'сотрудников'
}

function IndicatorsRow() {
  const { user } = useAuth()
  const [open, setOpen] = useState<'today' | null>(null)
  // Статусы задач — локально, как и весь прототип. В реальном виде это было бы
  // полем WeeklyTask.status, меняемым через updateWeeklyTask (как в /tasks).
  const [statuses, setStatuses] = useState<Record<string, TaskStatus>>(
    () => Object.fromEntries(TODAY_ITEMS.map(i => [i.id, i.status])),
  )
  const doneToday = Object.values(statuses).filter(s => s === 'completed').length
  const drops = YESTERDAY_RESULTS.filter(r => r.isDrop)

  // «В план дня» / «Поставить задачу» / завершение задачи с результатом —
  // всё открывает тот же TaskFormModal, что и везде в продукте (см. /tasks,
  // employee-tasks-panel) — список задач браузится инлайн, а всплывающее
  // окно используется только для самого действия с задачей.
  const [employees, setEmployees] = useState<GroupedEmployeeList | null>(null)
  const [managers, setManagers] = useState<ManagerOption[]>([])
  const [taskModalPreset, setTaskModalPreset] = useState<{ metric: string; workPlan: string; completingTodayId?: string } | null>(null)
  // «Разобрал, не нужна» — рОП посмотрел рекомендацию и решил, что задача
  // не нужна (как в shift-overview: employee.reviewed). Только локально,
  // в реальной версии должно уходить на бэкенд тем же эндпоинтом, что и там.
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set())
  // Задача — не выбор из равных вариантов (это лишняя работа головой для
  // рОПа), а одна готовая рекомендация с рамкой «так обычно делают» +
  // кнопка «Добавить»; остальные типы — мелкими текстовыми ссылками рядом,
  // не кнопками-чипами, чтобы не создавать видимость равнозначного выбора.

  useEffect(() => {
    getEmployeesList(undefined, 2, true).then(setEmployees).catch(console.error)
    getTaskManagers().then(list => setManagers(list.map(m => ({
      id: m.id,
      name: user && m.id === user.id ? `${m.full_name} (вы)` : m.full_name,
    })))).catch(console.error)
  }, [user?.id])

  const openTaskModal = (r: typeof YESTERDAY_RESULTS[number], workPlan?: string) => {
    setTaskModalPreset({
      metric: r.metric,
      workPlan: workPlan ?? `Разбор по ${r.metric.toLowerCase()}: среднее за ${r.days} ${r.days === 1 ? 'день' : 'дня'} ${r.value}${r.isMonetary ? '₽' : '%'} против нормы ${r.norm}${r.isMonetary ? '₽' : '%'}.`,
    })
  }

  // Та же логика, что в реальном TaskItem (tasks/page.tsx): «Завершить» для
  // задачи развития без результата не закрывает её напрямую, а открывает
  // форму — результат обязателен. «Отложить»/«Отменить» и орг.задачи
  // закрываются сразу, без результата.
  const handleCloseToday = (item: TodayItem, target: TaskCloseStatus) => {
    if (target === 'completed' && item.category !== 'organizational') {
      setTaskModalPreset({ metric: item.metric ?? '', workPlan: item.workPlan, completingTodayId: item.id })
      return
    }
    setStatuses(prev => ({ ...prev, [item.id]: target }))
  }

  return (
    // Две отдельные карточки (пополам) с промежутком, а не полоса,
    // приклеенная к прогнозу: так видно, что это самостоятельные кнопки.
    // Действие у каждой — отдельная кнопка с рамкой, а не синий текст.
    <div className="grid grid-cols-1 gap-3 items-start">
      {/* Раскрытый список занимает всю строку (без пустой трети справа),
          а «Внимание» на это время переезжает в шапку компактной кнопкой. */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 pr-4 py-3 hover:bg-muted/30 transition-colors">
          <button
            className="flex-1 flex items-center gap-3 text-left pl-5 min-w-0"
            onClick={() => setOpen(v => v === 'today' ? null : 'today')}
            aria-expanded={open === 'today'}
          >
            <ClipboardCheck className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1 flex items-baseline gap-2">
              <span className="text-base font-semibold whitespace-nowrap">План задач на сегодня</span>
              <span className="text-base text-muted-foreground tabular-nums whitespace-nowrap">{doneToday} из {TODAY_ITEMS.length}</span>
              {/* Ближайшая незакрытая задача прямо в строке — пустая середина
                  полосы занята тем, что делать дальше. Текст длинный —
                  обрезаем в одну строку, полностью — в списке. */}
              {open !== 'today' && (() => {
                const next = TODAY_ITEMS
                  .filter(i => statuses[i.id] !== 'completed' && statuses[i.id] !== 'failed')
                  .sort((a, b) => a.time.localeCompare(b.time))[0]
                if (!next) return <span className="ml-2 text-sm text-muted-foreground">· всё выполнено</span>
                const [last, first] = next.employee.split(' ')
                return (
                  <span className="ml-2 min-w-0 truncate text-sm text-muted-foreground">
                    <span className="mr-2 text-border">|</span>
                    <span className="font-medium text-foreground tabular-nums">{next.time}</span>
                    <span className="mx-1.5">·</span>
                    <span className="text-foreground">{last}{first ? ` ${first[0]}.` : ''}</span>
                    <span className="mx-1.5">—</span>
                    {next.workPlan}
                  </span>
                )
              })()}
            </div>
          </button>
          <button
            onClick={() => setOpen(v => v === 'today' ? null : 'today')}
            className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium"
          >
            {open === 'today' ? 'Свернуть' : 'Все задачи'}
          </button>
        </div>

      {/* «Сегодня» — только настоящие задачи из календаря. Вид ряда — тот же
          компонент, что в «Карте врача»/«Карте консультанта» (TaskCardItem в
          employee-tasks-panel.tsx): TaskCloseButtons слева, дата/время ·
          CategoryBadge, текст плана, чип метрики. Не выдумываю новый язык
          карточки задачи — переиспользую настоящий. Закрытые (завершена/
          отменена) не пропадают — опускаются вниз отдельным приглушённым
          блоком: рОП за день хочет видеть и то, что уже сделано, просто это
          не должно мешаться с тем, что ещё в работе. «+ Задача» — та же
          кнопка, что в шапке панели задач сотрудника. */}
      {/* Задачи раскрываются вниз прямо в блоке (не модалкой): это рабочий
          список дня, к нему возвращаются по ходу дня. */}
      </Card>


      {/* Раскрытый список — отдельной карточкой на всю ширину под обеими
          шапками: «Внимание» остаётся на своём месте, ничего не переезжает. */}
      {open === 'today' && (
        <Card className="overflow-hidden">
          <div className="flex justify-end px-5 pt-3">
            <button
              onClick={() => setTaskModalPreset({ metric: '', workPlan: '' })}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Задача
            </button>
          </div>
          <div className="divide-y divide-border/50">
            {TODAY_ITEMS.filter(item => {
              const s = statuses[item.id]
              return s !== 'completed' && s !== 'failed'
            }).map((item) => {
              const status = statuses[item.id]
              const styles = taskStatusStyles(status)
              return (
                <div key={item.id} className={`flex items-start gap-3 px-5 py-3 ${styles.card}`}>
                  <TaskCloseButtons status={status} onClose={(target) => handleCloseToday(item, target)} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs text-muted-foreground">{item.time}</span>
                      <span className="text-xs text-muted-foreground opacity-40">·</span>
                      <CategoryBadge category={item.category} />
                    </div>
                    <div className={`font-medium text-sm ${styles.title}`}>
                      {item.employee} <span className="font-normal text-muted-foreground">({item.role})</span>
                    </div>
                    <ClampText className={`text-sm mt-0.5 ${styles.title}`}>{item.workPlan}</ClampText>
                    {item.metric && (
                      <span className="inline-block mt-1.5 text-2xs font-medium text-muted-foreground bg-muted rounded px-2 py-0.5">{item.metric}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {TODAY_ITEMS.some(item => {
            const s = statuses[item.id]
            return s === 'completed' || s === 'failed'
          }) && (
            <div className="border-t bg-muted/20 divide-y divide-border/50">
              {TODAY_ITEMS.filter(item => {
                const s = statuses[item.id]
                return s === 'completed' || s === 'failed'
              }).map((item) => {
                const status = statuses[item.id]
                return (
                  <div key={item.id} className="flex items-start gap-3 px-5 py-2.5 opacity-60">
                    <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-xs text-muted-foreground">{item.time}</span>
                        <span className="text-xs text-muted-foreground opacity-40">·</span>
                        <CategoryBadge category={item.category} />
                      </div>
                      <div className="text-sm text-muted-foreground line-through">
                        {item.employee} <span className="font-normal">({item.role})</span>
                      </div>
                      <div className="text-sm text-muted-foreground/80 line-through">{item.workPlan}</div>
                    </div>
                    <span className="text-2xs font-medium text-muted-foreground shrink-0 mt-0.5">
                      {status === 'failed' ? 'Отменена' : 'Завершена'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}


      <TaskFormModal
        key={taskModalPreset ? taskModalPreset.metric : 'closed'}
        isOpen={taskModalPreset !== null}
        onClose={() => setTaskModalPreset(null)}
        onSave={async (taskData) => {
          const result = await createWeeklyTask(taskData)
          if (result === null) throw new Error('Ошибка сервера')
          // Результат введён в форме — задачу из «Сегодня» можно закрыть.
          if (taskModalPreset?.completingTodayId) {
            setStatuses(prev => ({ ...prev, [taskModalPreset.completingTodayId!]: 'completed' }))
          }
          setTaskModalPreset(null)
        }}
        initialCloseStatus={taskModalPreset?.completingTodayId ? 'completed' : undefined}
        employees={employees}
        managers={managers}
        presetMetric={taskModalPreset?.metric}
        presetWorkPlan={taskModalPreset?.workPlan}
        currentUserRole={user?.role}
        currentUserId={user?.id}
        currentUserEmployeeGuid={user?.employee_guid}
      />
    </div>
  )
}


export function MainDashboard() {
  const { hasRole } = useAuth()
  const canFilterByRop = hasRole('COMMERCIAL_DIRECTOR')

  const getCurrentPeriod = () => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }

  // Период не задаём сразу текущим месяцем: сначала спрашиваем у бэка дефолт
  // (месяц последних данных — пока новый месяц пуст, это предыдущий месяц).
  const [period, setPeriod] = useState('')
  const [kpiData, setKpiData] = useState<KpiData | null>(null)
  const [branchesData, setBranchesData] = useState<BranchDataWithWeeks[]>([])
  const [monthlyProgress, setMonthlyProgress] = useState<MonthlyProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [metricsVisibility, setMetricsVisibility] = useState<MetricsVisibility>({})
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [rops, setRops] = useState<RopUser[]>([])
  const [selectedRop, setSelectedRop] = useState<RopUser | null>(null)
  const [selectedBranchGuid, setSelectedBranchGuid] = useState<string | null>(null)
  // Список филиалов для фильтра берём из последней НЕотфильтрованной загрузки:
  // отдельного эндпоинта под доступные пользователю филиалы нет, а /api/branches/list
  // отдаёт все филиалы сети и требует роль РОП+. При смене периода или РОПа выбор
  // филиала сбрасывается, поэтому следующая загрузка снова приходит полной.
  const [branchOptions, setBranchOptions] = useState<{ guid: string; name: string }[]>([])
  const [dynamicsModal, setDynamicsModal] = useState<{
    metricId: string
    title: string
    isMonetary: boolean
    isPercentage: boolean
  } | null>(null)
  const [breakdownModal, setBreakdownModal] = useState<{ type: BreakdownType } | null>(null)
  const [progressOpen, setProgressOpen] = useState(true)
  const [showAllBranches, setShowAllBranches] = useState(false)
  const [attentionBranch, setAttentionBranch] = useState<string | null>(null)
  const hiddenGreenCount = branchesData.filter(b => b.is_active !== false && b.status === 'excellent').length

  const periodDates = useMemo(() => {
    const [year, month] = period.split('-').map(Number)
    if (!year || !month) {
      const now = new Date()
      const y = now.getFullYear()
      const m = now.getMonth() + 1
      const lastDay = new Date(y, m, 0).getDate()
      return {
        startDate: `${y}-${String(m).padStart(2, '0')}-01`,
        endDate: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      }
    }
    const lastDay = new Date(year, month, 0).getDate()
    return {
      startDate: `${year}-${String(month).padStart(2, '0')}-01`,
      endDate: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    }
  }, [period])

  const BREAKDOWN_METRICS: Record<string, BreakdownType> = {
    selections_count: 'selections',
    prescriptions: 'prescriptions',
    vtl_recommendations_count: 'vtl',
    // Плашка про ДОЛЮ рекомендаций декомпозируется долями по типам приёма
    // (vtl_rate), а не распределением рекомендаций по типам линз (vtl).
    vtl_recommendations_percentage: 'vtl_rate',
    // Плашки про ПРОДАЖИ ВТЛ раскрываются по типу проданной линзы (MED-891).
    vtl_conversion: 'vtl_sales',
    vtl_orders_count: 'vtl_sales',
    selection_to_prescription: 'prescription_rate',
    selection_to_own_order: 'own_order_rate',
    prescription_to_order: 'rx_own_order_rate',
    lost_count: 'lost',
    lost_percentage: 'lost',
  }

  // Разрешаем дефолтный период один раз при монтировании.
  useEffect(() => {
    getDefaultPeriod()
      .then(setPeriod)
      .catch(() => setPeriod(getCurrentPeriod()))
  }, [])

  useEffect(() => {
    const loadSettingsFromApi = async () => {
      try {
        const settings = await getMetricsSettings('KPI')
        setMetricsVisibility(settings)
      } catch (error) {
        console.error('Error loading metrics settings:', error)
      } finally {
        setSettingsLoading(false)
      }
    }

    loadSettingsFromApi()
  }, [])

  useEffect(() => {
    if (!canFilterByRop) return
    getSalesHeads().then(setRops).catch(console.error)
  }, [canFilterByRop])

  useEffect(() => {
    if (!period) return  // ждём, пока разрешится дефолтный период
    const fetchData = async () => {
      setLoading(true)
      const branchGuids = selectedBranchGuid ? [selectedBranchGuid] : selectedRop?.branch_guids
      setLoadFailed(false)
      try {
        const [kpi, branches, progress] = await Promise.all([
          getKpiData(period, branchGuids),
          getBranchesDataWithWeeks(period, branchGuids),
          getMonthlyProgress(period, branchGuids),
        ])
        // kpi === null означает, что запрос не удался. Показываем это явно,
        // а не подставляем нули: нулевые показатели с красными статусами
        // читаются как реальный провал продаж.
        setLoadFailed(kpi === null)
        setKpiData(kpi)
        setBranchesData(branches)
        setMonthlyProgress(progress)
        if (!selectedBranchGuid) {
          setBranchOptions(branches.map(b => ({ guid: b.id, name: b.name })))
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error)
        setLoadFailed(true)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [period, selectedRop, selectedBranchGuid, reloadKey])

  const kpiItems = kpiData
    ? KPI_METRICS_CONFIG.flatMap(category =>
        category.metrics
          .filter(metric => metricsVisibility[metric.id])
          .map(metric => {
            const value = kpiData[metric.id as keyof KpiData] as any
            return {
              metricId: metric.id,
              title: metric.label,
              metric: value,
              isMonetary: metric.isMonetary || false,
              isPercentage: metric.isPercentage || false,
              // Метрики с необязательным планом (прочие продажи) остаются
              // информационными, пока план по ним не поставлен.
              withoutPlan: metric.withoutPlan || (metric.planOptional === true && !(value?.plan > 0)),
            }
          })
      ).filter(item => item.metric !== undefined)
    : []


  const dynamicsData = useMemo(() => {
    if (!dynamicsModal || branchesData.length === 0) return null
    return aggregateKpiWeeklyData(dynamicsModal.metricId, branchesData)
  }, [dynamicsModal, branchesData])

  const handleSaveSettings = async (newSettings: MetricsVisibility) => {
    try {
      const success = await updateMetricsSettings('KPI', newSettings)
      if (success) {
        setMetricsVisibility(newSettings)
      } else {
        console.error('Failed to update metrics settings')
      }
    } catch (error) {
      console.error('Error saving metrics settings:', error)
    }
  }

  const getLastUpdateLabel = () => {
    if (!kpiData?.last_update_date) {
      return 'Актуальные данные из базы'
    }

    try {
      const date = new Date(kpiData.last_update_date)
      const day = String(date.getDate()).padStart(2, '0')
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const year = String(date.getFullYear()).slice(-2)
      return `Данные актуальны на ${day}.${month}.${year} включительно`
    } catch (error) {
      return 'Актуальные данные из базы'
    }
  }

  if (loading) {
    return (
      <div className="home-dense-root flex flex-col h-full">
        <PageHeader
          title="Сводка показателей"
          description="Загрузка данных..."
          icon={LayoutDashboard}
        />
        <div className="p-4 md:p-6 lg:p-8 space-y-6 animate-pulse max-w-page mx-auto w-full">
          <div className="h-24 bg-gradient-to-r from-muted to-muted/60 rounded-2xl" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-2 lg:grid-cols-3 md:gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-card rounded-xl border border-border/50 shadow-sm p-6 space-y-4">
                <div className="h-4 w-24 bg-muted rounded-lg" />
                <div className="space-y-2">
                  <div className="h-8 w-28 bg-muted rounded-lg" />
                  <div className="h-3 w-20 bg-muted rounded" />
                </div>
                <div className="space-y-2">
                  <div className="h-2 w-full bg-muted rounded-full" />
                  <div className="h-5 w-32 bg-muted rounded-full ml-auto" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="home-dense-root flex flex-col h-full">
      {/* Page Header */}
      <PageHeader
        compact
        title="Главная"
        description={getLastUpdateLabel()}
        icon={LayoutDashboard}
        actions={
          <div className="flex w-full items-center gap-2 lg:w-auto">
            {/* РОП и филиал — одна задача «сузить выборку», а не два разных
                фильтра, да и филиал зависит от выбранного РОПа — поэтому
                оба поля живут в одной кнопке-попапе с бейджем количества
                активных, а не занимают два отдельных виджета в строке. */}
            {(canFilterByRop && rops.length > 0) || branchOptions.length > 1 ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="flex-1 lg:flex-none lg:w-auto">
                    <ListFilter className="h-4 w-4 mr-2" />
                    Фильтры
                    {(selectedRop || selectedBranchGuid) && (
                      <Badge variant="secondary" className="ml-2 px-1.5 min-w-5 justify-center rounded-full">
                        {[selectedRop, selectedBranchGuid].filter(Boolean).length}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 space-y-3">
                  {canFilterByRop && rops.length > 0 && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">РОП</label>
                      <Select
                        value={selectedRop?.id.toString() ?? 'all'}
                        onValueChange={v => {
                          setSelectedRop(v === 'all' ? null : rops.find(r => r.id.toString() === v) ?? null)
                          // Филиалы у другого РОПа свои — прежний выбор к ним неприменим
                          setSelectedBranchGuid(null)
                        }}
                      >
                        <SelectTrigger>
                          <span className="truncate">{selectedRop ? selectedRop.full_name : 'Все РОПы'}</span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Без фильтра</SelectItem>
                          {rops.map(rop => (
                            <SelectItem key={rop.id} value={rop.id.toString()}>{rop.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {branchOptions.length > 1 && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Филиал</label>
                      <Select
                        value={selectedBranchGuid ?? 'all'}
                        onValueChange={v => setSelectedBranchGuid(v === 'all' ? null : v)}
                      >
                        <SelectTrigger>
                          <span className="truncate">
                            {selectedBranchGuid
                              ? branchOptions.find(b => b.guid === selectedBranchGuid)?.name ?? 'Филиал'
                              : 'Все филиалы'}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Все филиалы</SelectItem>
                          {branchOptions.map(branch => (
                            <SelectItem key={branch.guid} value={branch.guid}>{branch.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            ) : null}

            {/* Период — стрелками, а не дропдауном на 14 месяцев: почти
                всегда листают на соседний месяц, а не выбирают из списка. */}
            <div className="flex items-center gap-1 rounded-lg border border-input bg-accent h-10 px-1 flex-1 lg:flex-none justify-between lg:justify-start">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                disabled={!period || period <= PERIOD_MIN}
                onClick={() => {
                  setPeriod(p => shiftPeriod(p, -1))
                  setSelectedBranchGuid(null)
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium tabular-nums whitespace-nowrap px-1">
                {period ? formatPeriodLabel(period) : '—'}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                disabled={!period || period >= getPeriodMax()}
                onClick={() => {
                  setPeriod(p => shiftPeriod(p, 1))
                  setSelectedBranchGuid(null)
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Какие плитки показывать — шестерёнкой в общем ряду, без
                отдельного заголовка блока над сеткой. */}
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0"
              title="Настроить показатели"
              aria-label="Настроить показатели"
              onClick={() => setIsSettingsModalOpen(true)}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      {/* Content */}
      <div className="p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8 animate-fade-in max-w-page mx-auto w-full">
        {loadFailed && (
          <Card className="border-destructive/30 bg-destructive/5 p-4">
            <EmptyState
              size="compact"
              icon={AlertTriangle}
              title="Не удалось загрузить показатели"
              description="Сервер не ответил на запрос. Данные за период не получены — показанные ниже блоки могут быть неполными."
              action={
                <Button variant="outline" size="sm" onClick={() => setReloadKey(k => k + 1)}>
                  Повторить
                </Button>
              }
            />
          </Card>
        )}

        {/* Прогноз и сразу под ним — «Задачи на сегодня» / «Внимание» отдельными
            карточками с небольшим промежутком (не приклеены к прогнозу). */}
        {/* Прогноз, задачи/внимание и плитки показателей — одна сводка с
            одинаковым шагом между блоками (тот же, что между плитками). */}
        <div className="space-y-2.5 sm:space-y-3">
          {monthlyProgress && progressOpen && <CompactProgressHeader progress={monthlyProgress} />}
          <IndicatorsRow />
        {/* Показатели — жёсткий лимит 10 плиток, без раскрытия/сворачивания:
            какие именно 10 — решается не тут, а в «Настроить» (видимость
            метрик). Раскрывающийся список здесь был лишним действием —
            если каких-то показателей не хватает, их место не «скроллить
            ниже», а включить явно в настройках. */}
        <div>
          {/* Колонки — по количеству плиток (KPI_GRID_COLS), чтобы ряды были
              ровными; на телефоне 2, на планшете 3. */}
          <div className={`grid grid-cols-2 gap-2.5 md:grid-cols-3 sm:gap-3 ${KPI_GRID_COLS[Math.min(kpiItems.length, KPI_MAX)] ?? 'lg:grid-cols-3'}`}>
            {kpiItems.slice(0, KPI_MAX).map((item, index) => {
              const breakdownType = BREAKDOWN_METRICS[item.metricId]
              return (
                <div key={item.title} className="stagger-item" style={{ animationDelay: `${index * 40}ms` }}>
                  {/* Настоящая KpiCard, как в main-dashboard.tsx (с compact —
                      те же данные и поведение, просто без лишних отступов
                      полноразмерной версии). */}
                  <KpiCard
                    compact
                    title={item.title}
                    metric={item.metric}
                    isMonetary={item.isMonetary}
                    withoutPlan={item.withoutPlan}
                    onClick={() => setDynamicsModal({
                      metricId: item.metricId,
                      title: item.title,
                      isMonetary: item.isMonetary,
                      isPercentage: item.isPercentage,
                    })}
                    onDetailClick={breakdownType ? () => setBreakdownModal({ type: breakdownType }) : undefined}
                  />
                </div>
              )
            })}
          </div>
        </div>
        </div>

        {/* Branches Section — по умолчанию только проблемные (не excellent) */}
        <div className="space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg md:text-xl font-semibold text-foreground tracking-tight">
              Результаты по филиалам
            </h2>
            <div className="flex items-center gap-2">
              {hiddenGreenCount > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setShowAllBranches(v => !v)}>
                  {showAllBranches ? 'Скрыть зелёные' : `Показать все (+${hiddenGreenCount} в норме)`}
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2.5">
            {branchesData
              .filter(b => b.is_active !== false)
              .filter(b => showAllBranches || b.status !== 'excellent')
              .map((branch, index) => (
                <div key={branch.id} className="stagger-item" style={{ animationDelay: `${index * 60}ms` }}>
                  <BranchCard
                    compact
                    branch={branch}
                    period={period}
                    attentionCount={new Set(SHIFT_ATTENTION.filter(e => e.branch === branch.name).map(e => e.employee)).size}
                    onAttentionClick={() => setAttentionBranch(branch.name)}
                  />
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Metrics Settings Modal */}
      <MetricsSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onSave={handleSaveSettings}
        categories={KPI_METRICS_CONFIG}
        currentSettings={metricsVisibility}
        title="Настройка метрик KPI"
        minSelected={KPI_MIN}
        maxSelected={KPI_MAX}
      />

      {/* KPI Dynamics Modal */}
      {dynamicsModal && dynamicsData && (
        <KpiDynamicsModal
          isOpen={true}
          onClose={() => setDynamicsModal(null)}
          title={dynamicsModal.title}
          data={dynamicsData}
          isMonetary={dynamicsModal.isMonetary}
          isPercentage={dynamicsModal.isPercentage}
        />
      )}

      {/* Из иконки «Требуют внимания» в карточке филиала — тот же «Анализ
          филиала», сразу на вкладке «Обзор смены» и только по этому филиалу. */}
      <BranchAnalysisModal
        open={attentionBranch !== null}
        onClose={() => setAttentionBranch(null)}
        progress={monthlyProgress}
        branchName={attentionBranch}
        initialTab="shift"
      />

      {/* Breakdown Modal */}
      {breakdownModal && (
        <AppointmentBreakdownModal
          isOpen={true}
          onClose={() => setBreakdownModal(null)}
          type={breakdownModal.type}
          startDate={periodDates.startDate}
          endDate={periodDates.endDate}
          branchGuids={selectedBranchGuid ? [selectedBranchGuid] : selectedRop?.branch_guids}
        />
      )}
    </div>
  )
}

export default function HomeDemoPage() {
  // Главная плотнее остальных страниц: при 100% она должна выглядеть так, как
  // при 80% браузерного масштаба. Окна и выпадашки рендерятся в body через
  // портал, поэтому помечаем body — иначе они остались бы крупными.
  useEffect(() => {
    document.body.classList.add('home-dense')
    return () => document.body.classList.remove('home-dense')
  }, [])

  return <MainDashboard />
}
