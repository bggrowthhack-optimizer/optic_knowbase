'use client'

// Прототип: как выглядит автоматически созданная контрольная задача.
// Демо-стенд только на чтение, поэтому задачу не создаём, а собираем из исходной.
import { useEffect, useState } from 'react'
import { TaskFormModal, type ManagerOption } from '@/components/task-shared'
import { getWeeklyTask, getEmployeesList, getTaskManagers, getMetricDynamics } from '@/lib/api'
import type { WeeklyTask, GroupedEmployeeList } from '@/types'

const SOURCE_TASK_ID = 'demo-task-w0-02'
const CONTROL_DATE = '2026-10-22'
const RESULT = 'Разобрали 3 заказа без продажи: не предлагал вторую пару и не дожимал по цене. Договорились: каждому, кто уходит без заказа, — расчёт с рассрочкой и запись на повторный визит.'

export default function ControlTaskDemoPage() {
  const [task, setTask] = useState<WeeklyTask | null>(null)
  const [employees, setEmployees] = useState<GroupedEmployeeList | undefined>()
  const [managers, setManagers] = useState<ManagerOption[]>([])

  useEffect(() => {
    getEmployeesList(undefined, 2, true).then(setEmployees)
    getTaskManagers().then(ms => setManagers(ms.map(m => ({ id: m.id, name: m.full_name }))))
    getWeeklyTask(SOURCE_TASK_ID).then(async src => {
      if (!src) return
      const date = src.start_datetime.slice(0, 10)
      const ru = date.split('-').reverse().join('.')
      const dyn = await getMetricDynamics(src.employee_id, src.metric_affected, date)
      const plan = [
        `Контрольная проверка: ${src.work_plan}`,
        `Результат встречи ${ru}: ${RESULT}`,
        `${src.metric_affected} на ${ru}: ${dyn?.avg_before_text ?? '—'} (среднее за 3 недели)`,
        `Исходная задача от ${ru}`,
      ].join('\n')
      setTask({
        ...src,
        id: 'control-demo',
        work_plan: plan,
        work_result: null,
        status: 'pending',
        start_datetime: `${CONTROL_DATE}T00:00:00+00:00`,
        end_datetime: `${CONTROL_DATE}T00:00:00+00:00`,
      })
    })
  }, [])

  if (!task || !employees) return null
  return (
    <TaskFormModal
      isOpen
      onClose={() => {}}
      onSave={async () => {}}
      onCloseTask={async () => {}}
      employees={employees}
      managers={managers}
      editTask={task}
      currentUserRole="COMMERCIAL_DIRECTOR"
    />
  )
}
