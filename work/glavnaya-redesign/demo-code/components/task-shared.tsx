'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { DatePicker } from '@/components/ui/date-picker'
import { TimePicker } from '@/components/ui/time-picker'
import { WeeklyTask, TaskPriority, TaskStatus, TaskCategory, RecurrenceType, WeeklyTaskCreate, GroupedEmployeeList, AssistantComment, MetricDynamicsWeek, MetricDynamicsResponse } from '@/types'
import { UserRole } from '@/lib/auth'

export interface ManagerOption {
  id: number
  name: string
}
import { Check, X, Pause, RotateCcw, Upload, Mic, Trash2, Loader2, Sparkles, Info, CalendarCheck } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { uploadTaskAudio, getTaskRecording, deleteTaskRecording, getMetricDynamics, createWeeklyTask } from '@/lib/api'
import { ModalShell } from '@/components/ui/modal-shell'

// Фазы обработки аудио-разбора внутри формы задачи
type TaskAudioPhase = 'idle' | 'uploading' | 'processing' | 'done' | 'error'

const fmtDuration = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

// --- Проверка загружаемой записи встречи ---------------------------------
// Принимаем и аудио, и видео: Телемост и другие сервисы видеовстреч не дают
// скачать отдельную аудиодорожку, звук из контейнера достаёт ffmpeg на сервере.
// Задача проверки — отсечь то, что записью встречи не является вовсе (pdf,
// картинки, архивы), и объяснить это понятным текстом.
export const AUDIO_EXT = ['.mp3', '.m4a', '.wav', '.ogg', '.aac', '.flac', '.opus', '.wma']
export const VIDEO_EXT = ['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v', '.wmv', '.flv', '.mpg', '.mpeg']
export const MEDIA_EXT = [...AUDIO_EXT, ...VIDEO_EXT]
export const MEDIA_ACCEPT = `audio/*,video/*,${MEDIA_EXT.join(',')}`
export const MEDIA_MAX_BYTES = 1024 * 1024 * 1024

const FORMATS_HINT = 'Подойдут аудио (mp3, m4a, wav, ogg) и видеозаписи встреч (mp4, webm, mov, mkv) — звук из видео мы достаём сами.'

const extOf = (name: string) => {
  const i = name.lastIndexOf('.')
  return i === -1 ? '' : name.slice(i).toLowerCase()
}

const isVideoFile = (file: File) =>
  (file.type || '').toLowerCase().startsWith('video/') || VIDEO_EXT.includes(extOf(file.name))

/** Причина отказа человеческим языком, либо null, если файл годится. */
export function validateMediaFile(file: File): string | null {
  const ext = extOf(file.name)
  const mime = (file.type || '').toLowerCase()

  if (!mime.startsWith('audio/') && !mime.startsWith('video/')) {
    if (!ext) return `У файла «${file.name}» нет расширения, поэтому непонятно, запись ли это. ${FORMATS_HINT}`
    if (!MEDIA_EXT.includes(ext)) return `«${file.name}» не похож на запись встречи — это файл ${ext}. ${FORMATS_HINT}`
  }
  if (file.size === 0) {
    return `Файл «${file.name}» пустой — в нём нет записи.`
  }
  if (file.size > MEDIA_MAX_BYTES) {
    const mb = Math.round(file.size / (1024 * 1024))
    return `Файл слишком большой — ${mb} МБ, а максимум ${MEDIA_MAX_BYTES / (1024 * 1024)} МБ. Загрузите запись покороче или сожмите её.`
  }
  return null
}

// Длительность из метаданных: для видео нужен <video>, <audio> метаданные mp4
// отдаёт не всегда. 0 — длительность неизвестна (VBR-mp3 без Xing-заголовка,
// контейнер вроде mkv, который браузер не умеет). Это не повод отказывать:
// расшифровку делает ffmpeg, он умеет заметно больше браузера.
const readMediaDuration = (file: File): Promise<number> =>
  new Promise((resolve) => {
    try {
      const el = document.createElement(isVideoFile(file) ? 'video' : 'audio')
      el.preload = 'metadata'
      el.onloadedmetadata = () => {
        URL.revokeObjectURL(el.src)
        resolve(Number.isFinite(el.duration) ? el.duration : 0)
      }
      el.onerror = () => { URL.revokeObjectURL(el.src); resolve(0) }
      el.src = URL.createObjectURL(file)
    } catch { resolve(0) }
  })

// Converts plain text with URLs and newlines into React elements:
// URLs become clickable <a> tags, \n becomes <br />.
export function linkifyText(text: string | undefined | null): React.ReactNode {
  if (!text) return null
  // Matches: explicit https?://, www. prefix, or bare domain.tld/path (slash required to avoid false positives)
  const parts = text.split(/(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}\/[^\s]*)/g)
  return parts.map((seg, i) => {
    const isUrl = /^https?:\/\//.test(seg) || /^www\./.test(seg) || /^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}\//.test(seg)
    if (isUrl) {
      const href = /^https?:\/\//.test(seg) ? seg : `https://${seg}`
      return (
        <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline break-all">
          {seg}
        </a>
      )
    }
    return seg.split('\n').map((line, j, arr) => (
      <span key={`${i}-${j}`}>{line}{j < arr.length - 1 && <br />}</span>
    ))
  })
}

// Priority badge component — shown only for critical/important; normal is the default and needs no label.
export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  if (priority === 'normal') return null

  const styles: Record<string, string> = {
    critical: 'bg-destructive/10 text-destructive border-destructive/20',
    important: 'bg-good/10 text-good border-good/20',
  }

  const labels: Record<string, string> = {
    critical: 'Критично',
    important: 'Важно',
  }

  return (
    <span className={cn('px-2 py-0.5 text-xs font-medium rounded border', styles[priority])}>
      {labels[priority]}
    </span>
  )
}

// Task type badge
export function TaskTypeBadge({ type }: { type?: string }) {
  if (!type) return null

  return (
    <span className="px-2 py-0.5 text-xs font-medium rounded bg-muted text-muted-foreground border border-border">
      {type}
    </span>
  )
}

// Recurrence badge — shown on recurring task instances
export function RecurrenceBadge({ recurrenceType }: { recurrenceType?: string | null }) {
  const labels: Record<string, string> = {
    daily: 'Ежедневная',
    weekly: 'Еженедельная',
    monthly: 'Ежемесячная',
  }
  if (!recurrenceType || !labels[recurrenceType]) return null
  return (
    <span className="px-2 py-0.5 text-xs font-medium rounded bg-purple/10 text-purple border border-purple/30">
      {labels[recurrenceType]}
    </span>
  )
}

// Category badge
export function CategoryBadge({ category }: { category: TaskCategory }) {
  if (category === 'organizational') {
    return (
      <span className="px-2 py-0.5 text-xs font-medium rounded bg-excellent/10 text-excellent border border-excellent/30">
        Организационная
      </span>
    )
  }
  return (
    <span className="px-2 py-0.5 text-xs font-medium rounded bg-primary/10 text-primary border border-primary/20">
      Развитие
    </span>
  )
}

// ───────────────────────────────────────────────────────────────────
// Закрытие задачи: «Завершить» / «Отложить» / «Отменить».
// «Завершить» (completed) и «Отменить» (failed) — терминальные (закрытые).
// «Отложить» (postponed) — полуоткрытый статус: задача не завершена и
// остаётся в списке незакрытых с пометкой (см. MED-740).
// ───────────────────────────────────────────────────────────────────

export type TaskCloseStatus = 'completed' | 'failed' | 'postponed'

// Статус «закрыт» (терминальный) — только «Завершить» или «Отменить».
export const isClosedStatus = (status: TaskStatus): boolean =>
  status === 'completed' || status === 'failed'

// Можно ли вернуть задачу в работу — для любого неактивного статуса
// (завершена / отменена / отложена).
export const canReopenStatus = (status: TaskStatus): boolean =>
  status === 'completed' || status === 'failed' || status === 'postponed'

// Оформление карточки задачи в зависимости от статуса.
export function taskStatusStyles(status: TaskStatus): { card: string; title: string; result: string } {
  switch (status) {
    case 'completed':
      return { card: 'bg-excellent/5 border-border', title: 'text-muted-foreground line-through', result: 'text-excellent bg-excellent/5' }
    case 'failed':
      return { card: 'bg-destructive/5 border-destructive/20', title: 'text-muted-foreground line-through', result: 'text-muted-foreground bg-muted/50' }
    case 'postponed':
      return { card: 'bg-muted/60 border-border', title: 'text-muted-foreground', result: 'text-muted-foreground bg-muted/50' }
    default:
      return { card: 'bg-card border-border hover:border-border/80', title: 'text-foreground', result: 'text-muted-foreground bg-muted/50' }
  }
}

// Описание трёх кнопок закрытия: подпись, подсказка (tooltip), иконка, цвета.
// Порядок: Завершить → Отложить → Отменить.
const CLOSE_ACTIONS: {
  status: TaskCloseStatus
  label: string
  hint: string
  icon: typeof Check
  active: string
  idle: string
}[] = [
  {
    status: 'completed',
    label: 'Завершить',
    hint: 'закрыть как успешно выполненную',
    icon: Check,
    active: 'bg-excellent border-excellent text-success-foreground',
    idle: 'border-border text-muted-foreground/50 hover:border-excellent hover:text-excellent',
  },
  {
    status: 'postponed',
    label: 'Отложить',
    hint: 'задача останется в списке незакрытых с пометкой',
    icon: Pause,
    active: 'bg-muted-foreground border-muted-foreground text-white',
    idle: 'border-border text-muted-foreground/50 hover:border-muted-foreground hover:text-foreground',
  },
  {
    status: 'failed',
    label: 'Отменить',
    hint: 'закрыть как невыполненную',
    icon: X,
    active: 'bg-destructive border-destructive text-destructive-foreground',
    idle: 'border-border text-muted-foreground/50 hover:border-destructive hover:text-destructive',
  },
]

// Кнопки закрытия задачи: «Завершить» / «Отложить» / «Отменить». Активная
// (= текущий статус) подсвечивается заливкой. У каждой — всплывающая подсказка
// (tooltip) о её назначении.
//   • по умолчанию — компактная колонка из иконок (для строк задач);
//   • labeled=true — горизонтальный ряд кнопок с подписями (для модалки задачи).
export function TaskCloseButtons({
  status,
  onClose,
  size = 'md',
  labeled = false,
}: {
  status: TaskStatus
  onClose: (target: TaskCloseStatus) => void
  size?: 'sm' | 'md'
  labeled?: boolean
}) {
  if (labeled) {
    return (
      <TooltipProvider delayDuration={200}>
        <div className="flex items-center gap-2 w-full">
          {CLOSE_ACTIONS.map(({ status: s, label, hint, icon: Icon, active, idle }) => {
            const isActive = status === s
            return (
              <Tooltip key={s}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onClose(s) }}
                    aria-label={label}
                    aria-pressed={isActive}
                    className={cn(
                      'flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors',
                      isActive ? active : idle,
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{hint}</TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </TooltipProvider>
    )
  }

  const box = size === 'sm' ? 'w-5 h-5' : 'w-6 h-6'
  const ic = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-1 flex-shrink-0">
        {CLOSE_ACTIONS.map(({ status: s, label, hint, icon: Icon, active, idle }) => {
          const isActive = status === s
          return (
            <Tooltip key={s}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onClose(s) }}
                  aria-label={label}
                  aria-pressed={isActive}
                  className={cn(
                    box,
                    'rounded border flex items-center justify-center transition-colors',
                    isActive ? active : idle,
                  )}
                >
                  <Icon className={ic} />
                </button>
              </TooltipTrigger>
              <TooltipContent>{`${label} — ${hint}`}</TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}

// Кнопка «Вернуть в работу» — отдельное действие для уже закрытой задачи.
export function TaskReopenButton({
  onReopen,
  compact = false,
}: {
  onReopen: () => void
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onReopen() }}
      className="p-1.5 text-muted-foreground/70 hover:text-primary hover:bg-primary/5 rounded"
      aria-label="Вернуть в работу"
      title="Вернуть в работу"
    >
      <RotateCcw className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
    </button>
  )
}

// --- MetricChip ---

export function MetricChip({
  chipText,
  isImprovement,
  tooltip,
  size = 'default',
}: {
  chipText: string
  isImprovement: boolean | null
  tooltip?: string
  size?: 'sm' | 'default'
}) {
  const colorClass =
    isImprovement === true
      ? 'text-excellent bg-excellent/10 border-excellent/20'
      : isImprovement === false
      ? 'text-poor bg-poor/10 border-poor/20'
      : 'text-muted-foreground bg-muted border-border opacity-70'

  const sizeClass = size === 'sm' ? 'px-1.5 py-0.5 text-2xs' : 'px-2 py-0.5 text-xs'

  const chip = (
    <span className={cn('inline-flex items-center rounded border font-semibold whitespace-nowrap', colorClass, sizeClass)}>
      {chipText}
    </span>
  )

  if (!tooltip) return chip

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{chip}</TooltipTrigger>
        <TooltipContent className="whitespace-pre-line text-xs">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// --- DynamicsChart (inline SVG, not exported) ---

function DynamicsChart({ weeks, isImprovement }: { weeks: MetricDynamicsWeek[]; isImprovement: boolean | null }) {
  const values = weeks.map(w => w.value).filter((v): v is number => v !== null)
  if (values.length === 0) return null

  const W = 560
  const H = 100
  const padTop = 18
  const padBottom = 28
  const padLeft = 14
  const padRight = 14
  const chartH = H - padTop - padBottom
  const n = weeks.length

  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const range = maxVal - minVal || 1

  const xFor = (i: number) => padLeft + (n > 1 ? (i / (n - 1)) * (W - padLeft - padRight) : (W - padLeft - padRight) / 2)
  const yFor = (v: number) => padTop + (1 - (v - minVal) / range) * chartH

  const color = isImprovement === false ? 'var(--poor)' : 'var(--excellent)'

  const lastBeforeIdx = weeks.reduce<number>((acc, w, i) => w.is_before ? i : acc, -1)
  const dividerX = lastBeforeIdx >= 0 && lastBeforeIdx < n - 1
    ? (xFor(lastBeforeIdx) + xFor(lastBeforeIdx + 1)) / 2
    : null

  type Pt = { x: number; y: number }
  const buildPath = (pts: Pt[]) => pts.length < 2 ? '' : pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

  const beforePts: Pt[] = weeks
    .map((w, i) => (w.is_before && w.value !== null) ? { x: xFor(i), y: yFor(w.value) } : null)
    .filter((p): p is Pt => p !== null)

  const afterPts: Pt[] = weeks
    .map((w, i) => (!w.is_before && w.value !== null) ? { x: xFor(i), y: yFor(w.value) } : null)
    .filter((p): p is Pt => p !== null)

  const lastAfterIdx = weeks.reduce<number>((acc, w, i) => !w.is_before ? i : acc, -1)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ overflow: 'visible' }}>
      {/* Vertical divider */}
      {dividerX !== null && (
        <line x1={dividerX} y1={padTop} x2={dividerX} y2={padTop + chartH}
          stroke="var(--border)" strokeWidth={1} strokeDasharray="3,3" />
      )}

      {/* Section labels */}
      {lastBeforeIdx >= 0 && (
        <text x={xFor(0)} y={H - 2} fontSize={9} fill="var(--muted-foreground)" textAnchor="start" opacity={0.6}>
          ← 3 нед. до
        </text>
      )}
      {lastAfterIdx >= 0 && (
        <text x={xFor(n - 1)} y={H - 2} fontSize={9} fill="var(--muted-foreground)" textAnchor="end" opacity={0.6}>
          после →
        </text>
      )}

      {/* Lines */}
      {beforePts.length >= 2 && (
        <path d={buildPath(beforePts)} fill="none" stroke={color} strokeWidth={2} opacity={0.45} />
      )}
      {afterPts.length >= 2 && (
        <path d={buildPath(afterPts)} fill="none" stroke={color} strokeWidth={2.5} opacity={1} />
      )}
      {/* Connection between before and after */}
      {beforePts.length > 0 && afterPts.length > 0 && (
        <line
          x1={beforePts[beforePts.length - 1].x} y1={beforePts[beforePts.length - 1].y}
          x2={afterPts[0].x} y2={afterPts[0].y}
          stroke={color} strokeWidth={2} opacity={0.4} strokeDasharray="3,3"
        />
      )}

      {/* Dots and value labels */}
      {weeks.map((w, i) => {
        if (w.value === null) return null
        const x = xFor(i)
        const y = yFor(w.value)
        const isLastAfter = i === lastAfterIdx
        const r = isLastAfter ? 4 : 3.5
        const opacity = w.is_before ? 0.5 : 1
        return (
          <g key={i} opacity={opacity}>
            <circle cx={x} cy={y} r={r} fill={color} />
            {!w.is_before && (
              <text x={x} y={y - 6} fontSize={10} fill={color} textAnchor="middle" fontWeight="600">
                {w.value_text}
              </text>
            )}
          </g>
        )
      })}

      {/* Week labels */}
      {weeks.map((w, i) => (
        <text key={i} x={xFor(i)} y={padTop + chartH + 13} fontSize={9} fill="var(--muted-foreground)" textAnchor="middle">
          {w.week_label}
        </text>
      ))}
    </svg>
  )
}

// Task form modal
export interface TaskFormProps {
  isOpen: boolean
  onClose: () => void
  onSave: (task: WeeklyTaskCreate) => Promise<void>
  // Закрытие/перевод статуса задачи из модалки (Завершить / Отложить / Отменить).
  // Доступно только при редактировании существующей задачи.
  onCloseTask?: (target: TaskCloseStatus) => Promise<void>
  employees: GroupedEmployeeList | null
  managers: ManagerOption[]  // пользователи-руководители (SALES_HEAD/COMMERCIAL_DIRECTOR)
  initialDate?: string
  editTask?: WeeklyTask | null
  currentUserRole?: UserRole
  currentUserId?: number
  currentUserEmployeeGuid?: string | null
  presetEmployeeId?: string
  presetMetric?: string
  presetManagerId?: number
  presetWorkPlan?: string
  initialCloseStatus?: TaskCloseStatus
}

export function TaskFormModal({ isOpen, onClose, onSave, onCloseTask, employees, managers, initialDate, editTask, currentUserRole, currentUserId, currentUserEmployeeGuid, presetEmployeeId, presetMetric, presetManagerId, presetWorkPlan, initialCloseStatus }: TaskFormProps) {
  const [mounted, setMounted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(initialCloseStatus === 'completed' ? 'Заполните поле «Результат», чтобы завершить задачу' : null)
  const [pendingCloseStatus, setPendingCloseStatus] = useState<TaskCloseStatus | null>(initialCloseStatus ?? null)

  // Helper: format Date to local YYYY-MM-DD (avoids UTC shift from toISOString)
  const toLocalDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  // Form state — initialized from props (component remounts via key prop)
  const initStartDate = editTask ? new Date(editTask.start_datetime) : null
  const initEndDate = editTask ? new Date(editTask.end_datetime) : null

  // Determine if SALES_HEAD should auto-set manager
  const isSalesHead = currentUserRole === 'SALES_HEAD'
  const autoManagerId = isSalesHead && currentUserId !== undefined ? currentUserId : undefined

  const selfRopExecutorId = isSalesHead && currentUserId !== undefined
    ? (currentUserEmployeeGuid || `__rop_user_${currentUserId}__`)
    : undefined

  // Задача, которую текущему РОПу поставил другой руководитель: он исполнитель,
  // но владелец (manager_id) — постановщик. Такую задачу можно только закрыть,
  // план и сроки остаются за постановщиком — то же правило и на бэкенде
  // (EXECUTOR_EDITABLE_FIELDS), здесь лишь не даём отправить заведомый отказ.
  const isForeignTask = !!editTask && isSalesHead && currentUserId !== undefined
    && editTask.manager_id !== currentUserId
    && (editTask.employee_id === currentUserEmployeeGuid
        || editTask.employee_id === `__rop_user_${currentUserId}__`)

  const [taskCategory, setTaskCategory] = useState<TaskCategory>(editTask?.task_category || 'development')
  const [employeeId, setEmployeeId] = useState(editTask?.employee_id || presetEmployeeId || selfRopExecutorId || '')
  const [managerId, setManagerId] = useState<number | undefined>(
    editTask?.manager_id ?? presetManagerId ?? autoManagerId
  )
  const [workPlan, setWorkPlan] = useState(editTask?.work_plan || presetWorkPlan || '')
  const [workResult, setWorkResult] = useState(editTask?.work_result || '')
  const [metricAffected, setMetricAffected] = useState(editTask?.metric_affected || presetMetric || '')
  const [isRecurring, setIsRecurring] = useState(editTask?.is_recurring || false)
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType | ''>(editTask?.recurrence_type || '')
  const [taskDate, setTaskDate] = useState(
    initStartDate ? toLocalDateStr(initStartDate)
    : (initialDate || toLocalDateStr(new Date()))
  )
  const [startTime, setStartTime] = useState(() => {
    if (!initStartDate) return ''
    const h = String(initStartDate.getUTCHours()).padStart(2, '0')
    const m = String(initStartDate.getUTCMinutes()).padStart(2, '0')
    const t = `${h}:${m}`
    return t === '00:00' ? '' : t
  })
  const [endTime, setEndTime] = useState(() => {
    if (!initEndDate) return ''
    const h = String(initEndDate.getUTCHours()).padStart(2, '0')
    const m = String(initEndDate.getUTCMinutes()).padStart(2, '0')
    const t = `${h}:${m}`
    return t === '00:00' ? '' : t
  })

  // --- Контрольная проверка при завершении (прототип) ---
  // Контрольную задачу узнаём по началу текста, дату исходной задачи — по строке
  // «Контрольная точка к задаче от ДД.ММ.ГГГГ». В продукте это будут отдельные поля задачи.
  const isControlTask = !!editTask?.work_plan?.startsWith('Контрольная проверка:')
  const controlOrigin = editTask?.work_plan?.match(/Контрольная точка к задаче от (\d{2})\.(\d{2})\.(\d{4})/)
  const [controlOn, setControlOn] = useState(false)
  const [controlPreset, setControlPreset] = useState<'1w' | '2w' | '1m' | 'custom'>('2w')
  const [controlCustomDate, setControlCustomDate] = useState<Date | undefined>(undefined)

  // --- Разбор аудиозаписи встречи (только для задач «Развитие», к сохранённой задаче) ---
  const [audioPhase, setAudioPhase] = useState<TaskAudioPhase>('idle')
  const [audioProgress, setAudioProgress] = useState(0)
  const [audioFile, setAudioFile] = useState<{ name: string; durationSec: number } | null>(null)
  const [audioDrag, setAudioDrag] = useState(false)
  const [resultIsDraft, setResultIsDraft] = useState<boolean>(editTask?.result_from_recording ?? false)
  const [assistantComment, setAssistantComment] = useState<AssistantComment | null>(null)
  const [audioError, setAudioError] = useState<string | null>(null)
  // Файл забракован на этапе выбора (видео, не тот формат, слишком большой).
  // На сервер он не уходил, поэтому «убрать» здесь не должно ни удалять разбор,
  // ни очищать уже написанный результат — только вернуть выбор файла.
  const [audioRejected, setAudioRejected] = useState(false)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const startPoll = useCallback((taskId: string) => {
    stopPoll()
    pollRef.current = setInterval(async () => {
      const rec = await getTaskRecording(taskId)
      if (!rec) return
      if (rec.status === 'ready') {
        stopPoll()
        setAudioPhase('done')
        if (rec.result_draft) { setWorkResult(rec.result_draft); setResultIsDraft(true) }
        if (rec.assistant_comment) setAssistantComment(rec.assistant_comment)
      } else if (rec.status === 'error') {
        stopPoll()
        setAudioPhase('error')
        setAudioError(rec.error_message || 'Не удалось обработать запись')
      }
    }, 4000)
  }, [stopPoll])

  // Очистка polling при размонтировании
  useEffect(() => () => stopPoll(), [stopPoll])

  // Подтянуть существующий разбор при открытии сохранённой задачи «Развитие»
  useEffect(() => {
    if (!editTask?.id || editTask.task_category === 'organizational') return
    let active = true
    getTaskRecording(editTask.id).then((rec) => {
      if (!active || !rec) return
      // Разбор мог завершиться при закрытой модалке — файл всё равно показываем,
      // даже если имя не сохранилось (иначе блок «Запись встречи» остаётся пустым).
      setAudioFile({ name: rec.audio_filename || 'Запись встречи', durationSec: 0 })
      if (rec.status === 'processing') {
        setAudioPhase('processing')
        startPoll(editTask.id)
      } else if (rec.status === 'ready') {
        setAudioPhase('done')
        if (rec.assistant_comment) setAssistantComment(rec.assistant_comment)
        // Разбор обычно готовится минутами, уже после закрытия модалки. Если РОП
        // ещё не принял результат (поле пустое) — подставляем черновик из записи,
        // иначе он вынужден заполнять «Результат» руками. Принятый/отредактированный
        // результат не трогаем.
        if (!editTask.work_result?.trim() && rec.result_draft) {
          setWorkResult(rec.result_draft)
          setResultIsDraft(true)
        } else {
          setResultIsDraft(editTask.result_from_recording ?? true)
        }
      } else if (rec.status === 'error') {
        setAudioPhase('error')
        setAudioError(rec.error_message || 'Ошибка обработки')
      }
    })
    return () => { active = false }
  }, [editTask?.id, editTask?.task_category, editTask?.result_from_recording, editTask?.work_result, startPoll])

  useEffect(() => {
    setMounted(true)
  }, [])

  // --- Динамика показателя (только задачи «Развитие») ---
  const [dynamicsData, setDynamicsData] = useState<MetricDynamicsResponse | null>(null)
  const [dynamicsLoading, setDynamicsLoading] = useState(false)

  const showDynamics = taskCategory === 'development' && !!employeeId && !!metricAffected && !!taskDate
  const dynamicsAnchorDate = controlOrigin ? `${controlOrigin[3]}-${controlOrigin[2]}-${controlOrigin[1]}` : taskDate

  useEffect(() => {
    if (!showDynamics) { setDynamicsData(null); return }
    let cancelled = false
    setDynamicsLoading(true)
    setDynamicsData(null)
    getMetricDynamics(employeeId, metricAffected, dynamicsAnchorDate)
      .then(data => { if (!cancelled) setDynamicsData(data) })
      .finally(() => { if (!cancelled) setDynamicsLoading(false) })
    return () => { cancelled = true }
  }, [showDynamics, employeeId, metricAffected, dynamicsAnchorDate])

  // Значение показателя на дату этой задачи — для текста контрольной задачи
  const [valueAtTask, setValueAtTask] = useState<string | null>(null)
  useEffect(() => {
    if (!controlOn || !showDynamics) return
    let cancelled = false
    getMetricDynamics(employeeId, metricAffected, taskDate)
      .then(data => { if (!cancelled) setValueAtTask(data?.avg_before_text ?? null) })
    return () => { cancelled = true }
  }, [controlOn, showDynamics, employeeId, metricAffected, taskDate])

  const fmtRu = (iso: string) => iso.split('-').reverse().join('.')
  const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return toLocalDateStr(d) }
  const controlDate = controlPreset === '1w' ? addDays(7)
    : controlPreset === '2w' ? addDays(14)
    : controlPreset === '1m' ? (() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return toLocalDateStr(d) })()
    : controlCustomDate ? toLocalDateStr(controlCustomDate) : ''
  const controlDateLabel = controlDate
    ? new Date(controlDate + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' })
    : ''
  // В цепочке «исходная» — всегда первая задача, чтобы график показывал весь эффект
  const originIso = isControlTask && controlOrigin ? dynamicsAnchorDate : taskDate
  const basePlan = isControlTask
    ? (workPlan.split('\n')[0] || '').replace(/^Контрольная проверка:\s*/, '')
    : workPlan
  const controlPlanText = [
    `Контрольная проверка: ${basePlan}`,
    `Результат встречи ${fmtRu(taskDate)}: ${workResult.trim() || '—'}`,
    `${metricAffected} на ${fmtRu(taskDate)}: ${valueAtTask ?? '…'} (среднее за 3 недели)`,
    `Контрольная точка к задаче от ${fmtRu(originIso)}`,
  ].join('\n')

  // When category switches to organizational — reset employee/metric to org placeholders
  const handleCategoryChange = (cat: TaskCategory) => {
    setTaskCategory(cat)
    if (cat === 'organizational') {
      setEmployeeId('__org_task__')
      setMetricAffected('Без показателя')
    } else {
      if (employeeId === '__org_task__') setEmployeeId('')
    }
  }

  if (!isOpen || !mounted) return null

  const allEmployees = [
    { id: '__group_session__', name: 'Групповое занятие', role: '' },
    { id: '__intern_consultant__', name: 'Стажёр', role: 'Консультант' },
    { id: '__intern_doctor__', name: 'Стажёр', role: 'Врач' },
    ...(employees?.doctors || []).map(e => ({ ...e, role: 'Врач' })),
    ...(employees?.consultants || []).map(e => ({ ...e, role: 'Консультант' })),
    ...(employees?.managers || []).map(e => ({ ...e, role: 'РОП' })),
    // Прочие роли (склад, цех, бухгалтерия…) приходят с русским названием роли
    // в поле role — подставляем его как есть, своего ярлыка для них нет.
    ...(employees?.others || [])
  ]

  if (editTask && editTask.employee_id && editTask.employee_id !== '__org_task__' && !allEmployees.some(e => e.id === editTask.employee_id)) {
    allEmployees.unshift({ id: editTask.employee_id, name: editTask.employee_name, role: editTask.employee_role || '' })
  }

  if (presetEmployeeId && !allEmployees.some(e => e.id === presetEmployeeId)) {
    allEmployees.unshift({ id: presetEmployeeId, name: presetEmployeeId, role: '' })
  }

  const allManagers: ManagerOption[] = [...managers]
  if (editTask && editTask.manager_id && !allManagers.some(m => m.id === editTask.manager_id)) {
    allManagers.unshift({ id: editTask.manager_id, name: editTask.manager_name })
  }

  const isOrgTask = taskCategory === 'organizational'
  const canSeeAssistantComment = currentUserRole === 'SALES_HEAD' || currentUserRole === 'COMMERCIAL_DIRECTOR'
    || currentUserRole === 'ADMINISTRATOR' || currentUserRole === 'ROOT'

  /** Файл забракован до отправки — показать причину, не трогая результат задачи. */
  const rejectAudio = (reason: string) => {
    setAudioPhase('error')
    setAudioError(reason)
    setAudioRejected(true)
    if (audioInputRef.current) audioInputRef.current.value = ''
  }

  /** Вернуть дропзону после забракованного файла. */
  const resetAudioPicker = () => {
    setAudioPhase('idle')
    setAudioError(null)
    setAudioRejected(false)
  }

  const handleAudioSelected = async (file: File) => {
    if (!editTask?.id) return

    // Отсекаем файлы, которые записью встречи не являются, до отправки —
    // иначе РОП ждёт выгрузку сотен мегабайт, чтобы получить отказ.
    const rejection = validateMediaFile(file)
    if (rejection) { rejectAudio(rejection); return }

    setAudioError(null)
    setAudioRejected(false)
    setAudioProgress(0)
    setAudioPhase('uploading')
    const durationSec = await readMediaDuration(file).catch(() => 0)

    try {
      const rec = await uploadTaskAudio(editTask.id, file, (p) => setAudioProgress(p))
      if (!rec) { rejectAudio('Не удалось загрузить запись. Проверьте связь и попробуйте ещё раз.'); return }
      setAudioFile({ name: file.name, durationSec })
      setAudioPhase('processing')
      startPoll(editTask.id)
    } catch (err) {
      // Сюда попадают 400/403 от сервера — там уже человекочитаемый текст.
      rejectAudio(err instanceof Error ? err.message : 'Не удалось загрузить запись.')
    }
  }

  const handleAudioRemove = async () => {
    stopPoll()
    if (editTask?.id) {
      try { await deleteTaskRecording(editTask.id) } catch { /* игнорируем */ }
    }
    // По ТЗ удаление файла сбрасывает черновик и комментарий
    setAudioPhase('idle')
    setAudioFile(null)
    setAudioProgress(0)
    setAssistantComment(null)
    setAudioError(null)
    setAudioRejected(false)
    setWorkResult('')
    setResultIsDraft(false)
    if (audioInputRef.current) audioInputRef.current.value = ''
  }

  const buildTaskPayload = (): WeeklyTaskCreate => {
    // Если заполнено только одно из полей — считаем как «без времени»
    const hasTime = !!startTime && !!endTime
    let startDatetime: string
    let endDatetime: string

    if (hasTime) {
      // Храним время «как есть» в UTC (без конвертации локального времени),
      // чтобы дата никогда не съезжала при любом смещении часового пояса.
      // Отображение на фронте тоже идёт через UTC-часы → round-trip консистентен.
      startDatetime = `${taskDate}T${startTime}:00+00:00`
      endDatetime = `${taskDate}T${endTime}:00+00:00`
    } else {
      // Без времени — UTC-полночь сохраняет дату без сдвигов
      startDatetime = `${taskDate}T00:00:00+00:00`
      endDatetime = `${taskDate}T00:00:00+00:00`
    }

    const resolvedEmployeeId = isOrgTask ? '__org_task__' : employeeId
    const resolvedMetric = isOrgTask ? 'Без показателя' : metricAffected

    // Чужая задача: шлём ровно то, что разрешено бэкенду. Любое лишнее поле в
    // теле запроса — это 403, даже если значение не изменилось.
    if (isForeignTask) {
      return {
        work_result: workResult || null,
        result_from_recording: resultIsDraft,
      } as unknown as WeeklyTaskCreate
    }

    return {
      employee_id: resolvedEmployeeId,
      manager_id: isSalesHead && currentUserId !== undefined && !editTask
        ? currentUserId
        : managerId,
      work_plan: workPlan,
      work_result: workResult || null,
      result_from_recording: resultIsDraft,
      metric_affected: resolvedMetric,
      priority: 'normal',
      task_category: taskCategory,
      start_datetime: startDatetime,
      end_datetime: endDatetime,
      is_recurring: isRecurring,
      recurrence_type: isRecurring && recurrenceType ? recurrenceType : undefined,
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Validate required fields
    // Чужую задачу адресат только закрывает — поля постановщика он не заполняет
    // и не может изменить, поэтому проверяем лишь результат.
    const effectiveStatus = pendingCloseStatus ?? editTask?.status
    if (isForeignTask) {
      if (!isOrgTask && effectiveStatus === 'completed' && !workResult) { setSaveError('Результат обязателен для завершения задачи'); return }
    } else {
      if (!isSalesHead && managerId === undefined) { setSaveError('Выберите руководителя'); return }
      if (!taskDate) { setSaveError('Укажите дату'); return }
      if (!workPlan) { setSaveError('Заполните план работы'); return }
      if (!isOrgTask && (!employeeId || employeeId === '__org_task__')) { setSaveError('Выберите сотрудника'); return }
      if (!isOrgTask && !metricAffected) { setSaveError('Выберите показатель'); return }
      if (!isOrgTask && effectiveStatus === 'completed' && !workResult) { setSaveError('Результат обязателен для завершения задачи'); return }
      if (isRecurring && !recurrenceType) { setSaveError('Выберите периодичность для регулярной задачи'); return }
      if (effectiveStatus === 'completed' && controlOn && !controlDate) { setSaveError('Выберите дату контрольной проверки'); return }
      if (startTime && endTime && endTime <= startTime) { setSaveError('Время конца должно быть позже времени начала'); return }
    }

    setSaving(true)
    setSaveError(null)
    try {
      await onSave(buildTaskPayload())
      if (pendingCloseStatus === 'completed' && controlOn && !isOrgTask && controlDate) {
        await createWeeklyTask({
          employee_id: employeeId,
          manager_id: managerId,
          work_plan: controlPlanText,
          work_result: null,
          metric_affected: metricAffected,
          priority: 'normal',
          task_category: 'development',
          start_datetime: `${controlDate}T00:00:00+00:00`,
          end_datetime: `${controlDate}T00:00:00+00:00`,
          is_recurring: false,
        })
      }
      if (pendingCloseStatus && onCloseTask) {
        await onCloseTask(pendingCloseStatus)
      } else {
        onClose()
      }
    } catch (error) {
      console.error('Error saving task:', error)
      setSaveError('Не удалось сохранить задачу. Попробуйте ещё раз.')
    } finally {
      setSaving(false)
    }
  }

  const metricOptions = [
    'Без показателя',
    'Подборы',
    'Рецепты',
    'Кол-во рекомендаций ВТЛ',
    'Заказы (наши)',
    'Трафик',
    '% подбор → рецепт',
    '% рецепт → заказ',
    '% подбор → заказ (наш)',
    '% трафик → заказ',
    'Ср. чек (наш)',
    'Ср. чек линз (наш)',
    'Ср. чек оправы (наш)',
    'Ср. чек мастера (наш)',
    'Сумма заказов (наш рецепт)',
    'Заказы (чужие)',
    '% чужих заказов',
    'Ср. чек (чужой)',
    'Ср. чек линз (чужой)',
    'Ср. чек оправы (чужой)',
    'Ср. чек мастера (чужой)',
    '% рекомендаций ВТЛ',
    '% продаж ВТЛ',
    'Кол-во заказов ВТЛ',
    'Ср. чек заказа ВТЛ',
    'Ср. чек линз ВТЛ',
    'Ср. чек мастера ВТЛ',
    'Сумма заказов ВТЛ',
    'Итого заказов',
    'Итого ср. чек',
    'Итого ср. чек мастера',
    'Итого сумма за работы мастера',
    'Итого сумма заказов',
    'Балл чек листа',
  ]

  // Левая панель видна когда есть хотя бы одно поле: руководитель (не РОП) или сотрудник/показатель (не орг)
  const showLeftPanel = !isSalesHead || !isOrgTask

  return (
    <ModalShell
      open={isOpen}
      onClose={onClose}
      title={editTask ? 'Редактирование задачи' : 'Новая задача'}
      className="max-w-2xl"
      bare
    >
        <Card className="w-full bg-card overflow-hidden shadow-xl">

          {/* Шапка */}
          <div className="flex items-center justify-between px-4 py-4 md:px-7 md:py-5">
            <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
              {editTask ? 'Редактировать задачу' : 'Новая задача'}
            </h2>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg bg-muted text-muted-foreground hover:bg-border transition-colors" aria-label="Закрыть">
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="px-4 pb-4 space-y-4 md:px-7 md:pb-5 md:space-y-5">

              {/* Задача от другого руководителя — объясняем, почему поля закрыты */}
              {isForeignTask && (
                <div className="flex items-start gap-2 rounded-lg border border-info/20 bg-info/5 px-3 py-2.5">
                  <Info className="w-4 h-4 text-info shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="text-sm text-foreground/80">
                    Задачу поставил{editTask?.created_by_name ? ` ${editTask.created_by_name}` : ' другой руководитель'}.
                    Можно заполнить результат и закрыть её — план и сроки меняет постановщик.
                  </div>
                </div>
              )}

              {/* Тип задачи — компактный сегментный контрол с точками */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Тип задачи <span className="text-destructive">*</span></label>
                <div className="grid grid-cols-2 gap-1.5 bg-muted/60 border border-border rounded-xl p-1">
                  {([['development', 'Развитие'], ['organizational', 'Организационная']] as const).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => !isForeignTask && (!editTask?.status || !['completed', 'failed', 'cancelled'].includes(editTask.status)) ? handleCategoryChange(val) : undefined}
                      disabled={isForeignTask || (!!editTask?.status && ['completed', 'failed', 'cancelled'].includes(editTask.status))}
                      className={cn(
                        'flex items-center justify-center gap-1.5 px-5 py-2 text-sm font-semibold rounded-lg transition-all',
                        taskCategory === val
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground',
                        (isForeignTask || (!!editTask?.status && ['completed', 'failed', 'cancelled'].includes(editTask.status))) && 'cursor-not-allowed opacity-70'
                      )}
                    >
                      <span className={cn('w-1.5 h-1.5 rounded-full bg-current transition-opacity', taskCategory === val ? 'opacity-100' : 'opacity-40')} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Двухколонный layout: панели с фоном.
                  Ниже md колонки складываются — две панели с полями ввода
                  на телефоне превращаются в нечитаемые узкие столбики. */}
              <div className={cn('grid gap-4 grid-cols-1', showLeftPanel && 'md:grid-cols-2')}>

                {/* Левая панель */}
                {showLeftPanel && (
                  <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-4">
                    {!isSalesHead && (
                      <div>
                        <label className="block text-sm font-semibold text-foreground mb-1.5">Руководитель <span className="text-destructive">*</span></label>
                        <SearchableSelect
                          value={managerId !== undefined ? String(managerId) : ''}
                          onChange={(v) => setManagerId(v ? Number(v) : undefined)}
                          placeholder="Выберите руководителя"
                          searchPlaceholder="Поиск руководителя..."
                          disabled={isForeignTask}
                          options={allManagers.map(manager => ({
                            value: String(manager.id),
                            label: manager.name,
                          }))}
                        />
                      </div>
                    )}
                    {!isOrgTask && (
                      <div>
                        <label className="block text-sm font-semibold text-foreground mb-1.5">Сотрудник <span className="text-destructive">*</span></label>
                        <SearchableSelect
                          value={employeeId}
                          onChange={setEmployeeId}
                          placeholder="Выберите сотрудника"
                          searchPlaceholder="Поиск сотрудника..."
                          disabled={!!presetEmployeeId || isForeignTask}
                          options={allEmployees.map(emp => ({
                            value: emp.id,
                            label: emp.role ? `${emp.name} (${emp.role})` : emp.name,
                          }))}
                        />
                      </div>
                    )}
                    {!isOrgTask && (
                      <div>
                        <label className="block text-sm font-semibold text-foreground mb-1.5">Показатель <span className="text-destructive">*</span></label>
                        <Select value={metricAffected || '__placeholder__'} onValueChange={(v) => setMetricAffected(v === '__placeholder__' ? '' : v)} disabled={isForeignTask}>
                          <SelectTrigger>
                            <SelectValue placeholder="Выберите показатель" />
                          </SelectTrigger>
                          <SelectContent>
                            {metricOptions.map(opt => (
                              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}

                {/* Правая панель — расписание */}
                <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-4">

                  {/* Регулярная задача — inline switch, скрыт для инстансов серии */}
                  {!editTask?.recurring_template_id && !isForeignTask && (
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isRecurring}
                        onClick={() => setIsRecurring(!isRecurring)}
                        className={cn(
                          'relative flex-shrink-0 w-10 h-[23px] rounded-full transition-colors',
                          isRecurring ? 'bg-primary' : 'bg-muted-foreground/30'
                        )}
                      >
                        <span className={cn(
                          'absolute top-[3px] left-[3px] w-[17px] h-[17px] bg-white rounded-full shadow transition-transform',
                          isRecurring ? 'translate-x-[17px]' : 'translate-x-0'
                        )} />
                      </button>
                      <span className="text-sm font-semibold text-foreground">Регулярная задача</span>
                    </div>
                  )}

                  {/* Периодичность */}
                  {isRecurring && !editTask?.recurring_template_id && (
                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-1.5">Повторять <span className="text-destructive">*</span></label>
                      <Select value={recurrenceType || '__placeholder__'} onValueChange={(v) => setRecurrenceType(v === '__placeholder__' ? '' : v as RecurrenceType)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите периодичность" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Ежедневно</SelectItem>
                          <SelectItem value="weekly">Еженедельно</SelectItem>
                          <SelectItem value="monthly">Ежемесячно</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Дата */}
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-1.5">
                      {isRecurring ? 'Начало серии задач' : 'Дата'} <span className="text-destructive">*</span>
                    </label>
                    <DatePicker
                      value={taskDate ? new Date(taskDate + 'T00:00:00') : undefined}
                      onChange={(date) => setTaskDate(date ? toLocalDateStr(date) : '')}
                      disabled={isForeignTask}
                    />
                  </div>

                  {/* Время начала и конца */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-sm font-semibold text-foreground">Начало</label>
                        {startTime && !isForeignTask && <button type="button" onClick={() => setStartTime('')} className="text-xs text-muted-foreground hover:text-foreground leading-none">✕ очистить</button>}
                      </div>
                      <TimePicker value={startTime} onChange={setStartTime} className="w-full" disabled={isForeignTask} />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-sm font-semibold text-foreground">Конец</label>
                        {endTime && !isForeignTask && <button type="button" onClick={() => setEndTime('')} className="text-xs text-muted-foreground hover:text-foreground leading-none">✕ очистить</button>}
                      </div>
                      <TimePicker value={endTime} onChange={setEndTime} className="w-full" disabled={isForeignTask} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Блок динамики показателя (только для задач «Развитие» с метрикой) */}
              {showDynamics && (
                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-foreground">
                      Динамика показателя
                      {isControlTask && controlOrigin && (
                        <span className="ml-1.5 font-normal text-muted-foreground">от исходной задачи {fmtRu(dynamicsAnchorDate)}</span>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      {dynamicsData && (
                        <>
                          <span className="text-xs text-muted-foreground">{metricAffected}</span>
                          {dynamicsData.chip_text ? (
                            <MetricChip
                              chipText={dynamicsData.chip_text}
                              isImprovement={dynamicsData.is_improvement}
                              tooltip={dynamicsData.tooltip_text ?? undefined}
                            />
                          ) : (
                            <MetricChip chipText="Нет данных" isImprovement={null} />
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {dynamicsLoading && (
                    <div className="h-20 bg-muted rounded animate-pulse" />
                  )}

                  {!dynamicsLoading && dynamicsData && dynamicsData.weeks.length > 0 && (
                    <DynamicsChart weeks={dynamicsData.weeks} isImprovement={dynamicsData.is_improvement} />
                  )}

                  {!dynamicsLoading && dynamicsData && dynamicsData.weeks.length === 0 && (
                    <div className="h-16 flex items-center justify-center text-xs text-muted-foreground">
                      Нет данных по этому показателю
                    </div>
                  )}
                </div>
              )}

              {/* Нижний блок: план + результат */}
              <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-1.5">План работы <span className="text-destructive">*</span></label>
                  <textarea
                    value={workPlan}
                    onChange={(e) => setWorkPlan(e.target.value)}
                    required
                    readOnly={isForeignTask}
                    rows={isControlTask ? 8 : 3}
                    placeholder="Что нужно сделать"
                    className={cn(
                      'w-full px-3 py-2.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-y',
                      isForeignTask && 'opacity-70 cursor-not-allowed'
                    )}
                  />
                </div>

                {/* Разбор аудиозаписи встречи — только для задач «Развитие» */}
                {!isOrgTask && (
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-1.5">
                      Запись встречи
                      <span className="ml-1 font-normal text-muted-foreground">(черновик результата)</span>
                    </label>

                    {!editTask?.id ? (
                      <div className="text-xs text-muted-foreground bg-background border border-dashed border-border rounded-lg px-3 py-3">
                        Сохраните задачу, чтобы прикрепить запись встречи и получить черновик результата.
                      </div>
                    ) : audioPhase === 'idle' ? (
                      <label
                        onDragOver={(e) => { e.preventDefault(); setAudioDrag(true) }}
                        onDragLeave={() => setAudioDrag(false)}
                        onDrop={(e) => { e.preventDefault(); setAudioDrag(false); const f = e.dataTransfer.files?.[0]; if (f) handleAudioSelected(f) }}
                        className={cn('flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-5 cursor-pointer transition-colors',
                          audioDrag ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40')}
                      >
                        <Upload className="w-5 h-5 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Перетащите запись или нажмите</span>
                        <span className="text-xs text-muted-foreground">Аудио или видео встречи: mp3 · m4a · wav · mp4 · mov</span>
                        <span className="text-xs text-muted-foreground">Из видео звук достанем сами</span>
                        <input ref={audioInputRef} type="file" accept={MEDIA_ACCEPT} className="hidden"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAudioSelected(f) }} />
                      </label>
                    ) : (audioPhase === 'uploading' || audioPhase === 'processing') ? (
                      <div className="rounded-lg border border-border bg-background px-4 py-3 space-y-2">
                        <div className="flex items-center gap-2 text-sm text-foreground">
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                          {audioPhase === 'uploading' ? 'Загрузка записи…' : 'Расшифровка и разбор записи…'}
                        </div>
                        {audioPhase === 'uploading' && audioProgress > 0 && (
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div className="h-full bg-primary transition-all" style={{ width: `${audioProgress}%` }} />
                          </div>
                        )}
                        {audioPhase === 'processing' && (
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div className="h-full w-1/3 bg-primary/60 animate-pulse rounded-full" />
                          </div>
                        )}
                      </div>
                    ) : audioPhase === 'done' && audioFile ? (
                      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                        <Mic className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm truncate flex-1">{audioFile.name}</span>
                        {audioFile.durationSec > 0 && <span className="text-xs text-muted-foreground">{fmtDuration(audioFile.durationSec)}</span>}
                        <button type="button" onClick={handleAudioRemove} className="text-muted-foreground hover:text-destructive" aria-label="Удалить запись">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : audioPhase === 'error' ? (
                      <div className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
                        <span className="text-sm text-destructive flex-1">{audioError || 'Не удалось обработать запись'}</span>
                        <button
                          type="button"
                          onClick={audioRejected ? resetAudioPicker : handleAudioRemove}
                          className="text-xs text-muted-foreground hover:text-foreground underline shrink-0 mt-0.5"
                        >
                          {audioRejected ? 'выбрать другой файл' : 'убрать'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}

{!(editTask && onCloseTask) && (
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-foreground mb-1.5">
                    <span>
                      Результат проведённой работы
                      <span className="ml-1 font-normal text-muted-foreground">
                        ({isOrgTask ? 'необязателен' : 'обязателен для завершения'})
                      </span>
                    </span>
                    {resultIsDraft && !isOrgTask && (
                      <Badge variant="info" className="font-normal">черновик из записи</Badge>
                    )}
                  </label>
                  <textarea
                    value={workResult}
                    onChange={(e) => setWorkResult(e.target.value)}
                    rows={3}
                    placeholder="Что получилось по итогу"
                    className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                  />
                </div>
                )}

                {/* Подсказки помощника — видны РОП и КД, в недельный отчёт не попадают */}
                {!isOrgTask && assistantComment && canSeeAssistantComment && (
                  <div className="rounded-lg border border-info/20 bg-info/5 p-4 space-y-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-info" />
                        <span className="text-sm font-semibold text-foreground">Подсказки помощника</span>
                        <span className="text-xs text-muted-foreground">видны РОП и КД</span>
                      </div>
                      <div className="text-xs text-muted-foreground">Развивающие подсказки на основе практики Оптимайзера</div>
                    </div>
                    {([['Что уже сработало', assistantComment.what_worked],
                       ['Где был рычаг', assistantComment.what_didnt],
                       ['Лайфхаки на следующую встречу', assistantComment.next_time]] as const)
                      .filter(([, body]) => body && body.trim())
                      .map(([title, body]) => (
                        <div key={title}>
                          <div className="text-xs font-semibold text-muted-foreground mb-1">{title}</div>
                          <div className="chat-markdown prose prose-sm dark:prose-invert max-w-none text-sm">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>


              {/* Блок «Завершение»: результат, как закрыть задачу, контрольная проверка */}
              {editTask && onCloseTask && (
                <div className="rounded-xl border border-border p-4 space-y-4">
                  <div className="text-sm font-semibold text-foreground">Завершение</div>
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-foreground mb-1.5">
                    <span>
                      Результат проведённой работы
                      <span className="ml-1 font-normal text-muted-foreground">
                        ({isOrgTask ? 'необязателен' : 'обязателен для завершения'})
                      </span>
                    </span>
                    {resultIsDraft && !isOrgTask && (
                      <Badge variant="info" className="font-normal">черновик из записи</Badge>
                    )}
                  </label>
                  <textarea
                    value={workResult}
                    onChange={(e) => setWorkResult(e.target.value)}
                    rows={3}
                    placeholder="Что получилось по итогу"
                    className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                  />
                </div>
                  <TaskCloseButtons
                    status={pendingCloseStatus ?? 'pending'}
                    labeled
                    onClose={(target) => {
                      setSaveError(null)
                      setPendingCloseStatus(prev => prev === target ? null : target)
                    }}
                  />

                  {pendingCloseStatus === 'completed' && !isOrgTask && (
                    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={controlOn}
                          onChange={(e) => setControlOn(e.target.checked)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-primary cursor-pointer"
                        />
                        <span className="text-sm">
                          <span className="font-semibold text-foreground">Контрольная проверка</span>
                          <span className="block text-xs text-muted-foreground">Создать задачу проверить, сработала ли договорённость</span>
                        </span>
                      </label>

                      {controlOn && (
                        <>
                          <div className="flex flex-wrap items-center gap-2 pl-6">
                            {([['1w', 'Через неделю'], ['2w', 'Через 2 недели'], ['1m', 'Через месяц']] as const).map(([key, label]) => (
                              <button
                                key={key}
                                type="button"
                                onClick={() => setControlPreset(key)}
                                className={cn(
                                  'h-8 px-3 rounded-lg border text-sm transition-colors',
                                  controlPreset === key
                                    ? 'border-primary bg-primary/10 text-primary font-medium'
                                    : 'border-border bg-background text-muted-foreground hover:text-foreground'
                                )}
                              >
                                {label}
                              </button>
                            ))}
                            <DatePicker
                              value={controlPreset === 'custom' ? controlCustomDate : undefined}
                              onChange={(d) => { setControlCustomDate(d); setControlPreset('custom') }}
                              placeholder="Другая дата"
                              className={cn('h-8 w-auto text-sm', controlPreset === 'custom' && 'border-primary text-primary')}
                            />
                          </div>

                          {controlDate && (
                            <div className="ml-6 rounded-lg border border-dashed border-border bg-background p-3 space-y-1.5">
                              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                <CalendarCheck className="w-4 h-4 text-primary" />
                                Будет создана задача на {controlDateLabel}
                              </div>
                              <div className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{controlPlanText}</div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Ошибка сохранения */}
              {saveError && (
                <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  {saveError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-stretch gap-3 px-4 py-4 md:px-7 border-t border-border bg-muted/30">
              {editTask && onCloseTask ? (
                <>
                  <div className="flex flex-col gap-2 flex-1 min-w-0">
                    <Button type="submit" disabled={saving} className="w-full">
                      {saving ? 'Сохранение...' : pendingCloseStatus === 'completed' ? 'Сохранить и завершить' : pendingCloseStatus === 'postponed' ? 'Сохранить и отложить' : pendingCloseStatus === 'failed' ? 'Сохранить и отменить' : 'Сохранить'}
                    </Button>
                  </div>
                  <Button type="button" variant="outline" onClick={onClose} className="shrink-0">
                    Закрыть
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex-1" />
                  <Button type="button" variant="outline" onClick={onClose} className="shrink-0">Отмена</Button>
                  <Button type="submit" disabled={saving} className="shrink-0">
                    {saving ? 'Сохранение...' : 'Создать'}
                  </Button>
                </>
              )}
            </div>
          </form>
        </Card>
    </ModalShell>
  )
}
