'use client'

import { useState, useEffect, useMemo } from 'react'
import { ChevronDown, AlertCircle, CalendarRange, CalendarFold, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn, formatCurrency } from '@/lib/utils'
import { ExpandableAmount } from './expandable-amount'
import { BranchDataWithWeeks, BreakdownType } from '@/types'
import { BranchAnalysisModal } from './branch-analysis-modal'
import { AppointmentBreakdownModal } from './appointment-breakdown-modal'
import { MetricAccordionRow, MetricSection } from './metric-accordion'
import { getPlanForBranch, getBranchAnalysis, getBranchAnalysisByMonth } from '@/lib/api'

interface BranchCardProps {
  branch: BranchDataWithWeeks
  period: string
  /** Сколько сотрудников филиала требуют внимания. Задано и > 0 — число
   *  показывается нейтральным тегом рядом с зоной, клик — onAttentionClick;
   *  не задано — карточка как раньше. */
  attentionCount?: number
  onAttentionClick?: () => void
  /** Плотнее: меньше отступы и кнопки — для списка филиалов на Главной. */
  compact?: boolean
}

function getStatusText(status: string): string {
  const statusTexts = {
    excellent: 'Успешно выполняет план',
    good: 'Близко к плану',
    poor: 'Требует внимания'
  }
  return statusTexts[status as keyof typeof statusTexts] || status
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'excellent': return 'bg-excellent'
    case 'good': return 'bg-good'
    case 'poor': return 'bg-poor'
    default: return 'bg-muted'
  }
}

function getZoneColor(zone: 'green' | 'yellow' | 'red' | null, fallbackStatus: string): string {
  if (zone === 'green') return 'bg-excellent'
  if (zone === 'yellow') return 'bg-good'
  if (zone === 'red') return 'bg-poor'
  return getStatusColor(fallbackStatus)
}

function periodToDates(period: string): { startDate: string; endDate: string } {
  // period format: "YYYY-MM"
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
}

export function BranchCard({ branch, period, attentionCount, onAttentionClick, compact = false }: BranchCardProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false)
  const [breakdownModal, setBreakdownModal] = useState<{ type: BreakdownType } | null>(null)
  const [planStatus, setPlanStatus] = useState<'missing' | 'incomplete' | 'complete' | null>(null)
  const [analysisZone, setAnalysisZone] = useState<'green' | 'yellow' | 'red' | null>(null)

  const periodDates = useMemo(() => periodToDates(period), [period])

  const totalRevenue = branch.total_orders.amount.fact
  const avgCheck = branch.total_orders.avg_check.fact

  // Compute foreign orders percentage metric
  // Если факт ниже 15% — не подсвечиваем как проблему
  const foreignOrdersPercentage = useMemo(() => {
    const fact = branch.total_orders.count.fact > 0
      ? (branch.foreign_orders.count.fact / branch.total_orders.count.fact) * 100
      : 0
    const plan = branch.total_orders.count.plan > 0
      ? (branch.foreign_orders.count.plan / branch.total_orders.count.plan) * 100
      : 0

    const weeks = branch.foreign_orders.count.weeks.map((foreignWeek, i) => {
      const totalWeek = branch.total_orders.count.weeks[i]
      const value = totalWeek && totalWeek.value > 0
        ? (foreignWeek.value / totalWeek.value) * 100
        : 0

      const prevValue = i > 0 && branch.total_orders.count.weeks[i - 1].value > 0
        ? (branch.foreign_orders.count.weeks[i - 1].value / branch.total_orders.count.weeks[i - 1].value) * 100
        : 0

      const diff = i > 0 ? value - prevValue : 0
      const delta = i > 0 && diff !== 0 ? `${diff > 0 ? '+' : ''}${Math.round(diff * 10) / 10}` : null

      return {
        week: foreignWeek.week,
        value: Math.round(value * 10) / 10,
        delta
      }
    })

    // Если факт ниже 15% — считаем что всё в норме, не подсвечиваем
    const isBelowThreshold = fact < 15
    const effectivePercentage = isBelowThreshold ? 100 : (plan > 0 ? Math.round((fact / plan) * 100) : 0)

    const getTrend = (): 'up' | 'down' | 'neutral' => {
      if (isBelowThreshold) return 'neutral'
      if (weeks.length < 3) return 'neutral'
      const penultimate = weeks[weeks.length - 2].value
      const prev = weeks[weeks.length - 3].value
      if (penultimate > prev) return 'up'
      if (penultimate < prev) return 'down'
      return 'neutral'
    }

    return {
      fact: Math.round(fact * 10) / 10,
      plan: Math.round(plan * 10) / 10,
      percentage: effectivePercentage,
      trend: getTrend(),
      weeks
    }
  }, [branch.foreign_orders.count, branch.total_orders.count])

  const REQUIRED_PLAN_FIELDS = [
    'planned_total_revenue', 'glasses_percent', 'average_check_lens',
    'average_check_frame', 'average_check_master', 'average_check_vtl_lens',
    'vtl_recommendations_percent', 'vtl_percent', 'prescription_to_order_conversion',
    'selection_to_prescription_conversion', 'foreign_orders_percent',
    'available_appointment_windows',
  ] as const

  // Check if plan exists and is complete for selected period
  useEffect(() => {
    const checkPlan = async () => {
      try {
        const plan = await getPlanForBranch(branch.id, period)
        if (!plan) {
          setPlanStatus('missing')
        } else {
          const complete = REQUIRED_PLAN_FIELDS.every(f => ((plan as unknown as Record<string, unknown>)[f] as number) > 0)
          setPlanStatus(complete ? 'complete' : 'incomplete')
        }
      } catch (error) {
        console.error('Error checking plan:', error)
        setPlanStatus('missing')
      }
    }
    checkPlan()
  }, [branch.id, period])

  // Fetch analysis zone for the selected period (month).
  // Зона должна соответствовать выбранному в фильтре месяцу, а не последнему анализу.
  useEffect(() => {
    let cancelled = false
    const fetchZone = async () => {
      try {
        const [yearStr, monthStr] = period.split('-')
        const year = parseInt(yearStr)
        const month = parseInt(monthStr)
        let zone: 'green' | 'yellow' | 'red' | undefined
        if (year && month) {
          const { data } = await getBranchAnalysisByMonth(branch.id, year, month)
          zone = data?.result?.analysis?.zone
        } else {
          const data = await getBranchAnalysis(branch.id)
          zone = data?.result?.analysis?.zone
        }
        if (cancelled) return
        setAnalysisZone(zone === 'green' || zone === 'yellow' || zone === 'red' ? zone : null)
      } catch {
        // Анализа за месяц нет — сбрасываем зону на fallback (branch.status)
        if (!cancelled) setAnalysisZone(null)
      }
    }
    fetchZone()
    return () => { cancelled = true }
  }, [branch.id, period])

  return (
    <Card className={cn(
      "overflow-hidden transition-all duration-300 bg-card border-border/50",
      isOpen ? "shadow-md" : "shadow-sm hover:shadow-md"
    )}>
      <div className="flex">
        {/* Status bar left */}
        <div className={cn("w-1 flex-shrink-0", getZoneColor(analysisZone, branch.status))} />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div
            role="button"
            tabIndex={0}
            aria-expanded={isOpen}
            aria-label={`${branch.name}: ${isOpen ? 'свернуть' : 'развернуть'} показатели`}
            className={cn(compact ? "px-4 py-3 md:px-5" : "p-4 md:p-5", "cursor-pointer transition-colors duration-200 hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring")}
            onClick={() => setIsOpen(!isOpen)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setIsOpen(!isOpen)
              }
            }}
          >
            {/* Ниже lg строка не помещается: имя, две кнопки и две цифры складываются
                в колонки. Порядок на десктопе восстанавливается через lg:order-*,
                чтобы на телефоне цифры шли сразу под названием, а кнопки — последними. */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-0">
              {/* Branch Info */}
              <div className="flex items-start justify-between gap-3 lg:flex-1 lg:min-w-0 lg:items-center">
                <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
                  <h3 className="text-base font-semibold text-card-foreground tracking-tight">
                    {branch.name}
                  </h3>
                  {analysisZone ? (
                    <Badge
                      className={cn(
                        "text-xs font-medium rounded-full relative top-[1px]",
                        analysisZone === 'green' && "bg-excellent/10 text-excellent border border-excellent/20",
                        analysisZone === 'yellow' && "bg-good/10 text-good border border-good/30",
                        analysisZone === 'red' && "bg-poor/10 text-poor border border-poor/20"
                      )}
                    >
                      {analysisZone === 'green' ? 'Зелёная зона' : analysisZone === 'yellow' ? 'Жёлтая зона' : 'Красная зона'}
                    </Badge>
                  ) : (
                    <Badge
                      variant={branch.status}
                      className={cn(
                        "text-xs font-medium rounded-full relative top-[1px]",
                        branch.status === 'excellent' && "bg-excellent/10 text-excellent border border-excellent/20",
                        branch.status === 'good' && "bg-good/10 text-good border border-good/20",
                        branch.status === 'poor' && "bg-poor/10 text-poor border border-poor/20"
                      )}
                    >
                      {getStatusText(branch.status)}
                    </Badge>
                  )}
                  {/* Сколько сотрудников требуют внимания — нейтральным тегом
                      рядом с зоной, без цвета: зона уже говорит «хорошо/плохо»,
                      этот тег — только «есть кого разобрать». Клик — разбор смены. */}
                  {!!attentionCount && onAttentionClick && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onAttentionClick()
                      }}
                      className="relative top-[1px] inline-flex items-center rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    >
                      {attentionCount} {attentionCount % 10 === 1 && attentionCount % 100 !== 11 ? 'требует' : 'требуют'} внимания
                    </button>
                  )}
                </div>
                </div>
                {/* Раскрывающая стрелка на телефоне стоит в одной строке с названием */}
                <div className="flex lg:hidden items-center justify-center w-8 h-8 flex-shrink-0 rounded-lg">
                  <ChevronDown
                    className={cn(
                      "w-5 h-5 text-muted-foreground transition-transform duration-300",
                      isOpen && "rotate-180"
                    )}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 lg:gap-3 lg:mr-8 lg:order-3">
                
                {/* Plan Button */}
                <Link
                  href={`/plans?branch=${branch.id}&period=${period}`}
                  onClick={(e) => e.stopPropagation()}
                  className="group min-w-0 flex-1 lg:flex-none"
                >
                  <div className={cn(
                    "flex items-center justify-center lg:justify-start px-3 min-w-0 bg-accent text-accent-foreground rounded-xl", compact ? "h-9" : "h-10.5", "transition-all duration-300 ease-in-out shadow-sm hover:shadow-md cursor-pointer border-2",
                    planStatus === 'missing' || planStatus === 'incomplete' ? "border-good" : "border-transparent"
                  )}>
                    {planStatus === 'missing' || planStatus === 'incomplete' ? (
                      <AlertCircle className="w-4 h-4 shrink-0 text-good" />
                    ) : planStatus === 'complete' ? (
                      <CalendarRange className="w-4 h-4 shrink-0" />
                    ) : (
                      <CalendarFold className="w-4 h-4 shrink-0" />
                    )}

                    {/* Контейнер текста: на десктопе раскрывается по наведению,
                        на тач-экране наведения нет — там подпись видна всегда */}
                    <div className="min-w-0 opacity-100 lg:max-w-0 lg:opacity-0 lg:group-hover:max-w-[140px] lg:group-hover:opacity-100 overflow-hidden transition-all duration-300 ease-in-out relative -top-[1px]">
                      <span className="block truncate pl-2 text-sm font-medium">
                        {planStatus === null
                          ? 'Проверка...'
                          : planStatus === 'missing'
                          ? 'Загрузить план'
                          : planStatus === 'incomplete'
                          ? 'Дополнить план'
                          : 'Изменить план'}
                      </span>
                    </div>
                  </div>
                </Link>
              
                {/* Analysis Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsAnalysisModalOpen(true)
                  }}
                  aria-label={`Анализ филиала ${branch.name}`}
                  className="group min-w-0 shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className={cn("flex items-center justify-center lg:justify-start px-3 min-w-0 bg-accent text-accent-foreground rounded-xl", compact ? "h-9" : "h-10.5", "transition-all duration-300 ease-in-out shadow-sm hover:shadow-md cursor-pointer border-2 border-transparent")}>
                    <Sparkles className="w-4 h-4 shrink-0" />

                    {/* Контейнер текста: на десктопе раскрывается по наведению,
                        на тач-экране наведения нет — там подпись видна всегда */}
                    <div className="min-w-0 opacity-100 lg:max-w-0 lg:opacity-0 lg:group-hover:max-w-[140px] lg:group-hover:opacity-100 overflow-hidden transition-all duration-300 ease-in-out relative -top-[1px]">
                      <span className="block truncate pl-2 text-sm font-medium">
                        <span className="sm:hidden">Анализ</span>
                        <span className="hidden sm:inline">Анализ филиала</span>
                      </span>
                    </div>
                  </div>
                </button>
              
              </div>

              {/* Key Metrics */}
              <div className="flex items-center gap-8 lg:mr-8 lg:order-2">
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-0.5 font-medium">Ср.чек</div>
                  <div className="text-sm font-bold text-card-foreground">
                    <ExpandableAmount
                      value={avgCheck}
                      abbreviated={formatCurrency(avgCheck)}
                      showCurrencySymbol
                    />
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-0.5 font-medium">Выручка</div>
                  <div className="text-sm font-bold text-card-foreground">
                    <ExpandableAmount
                      value={totalRevenue}
                      abbreviated={formatCurrency(totalRevenue)}
                      showCurrencySymbol
                    />
                  </div>
                </div>
              </div>

              {/* Toggle Button */}
              <div className="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg hover:bg-accent/60 transition-colors lg:order-4">
                <ChevronDown
                  className={cn(
                    "w-5 h-5 text-muted-foreground transition-transform duration-300",
                    isOpen && "rotate-180"
                  )}
                />
              </div>
            </div>
          </div>

          {/* Smooth Expandable Content */}
          <div
            className={cn(
              "overflow-hidden transition-all duration-500 ease-in-out",
              isOpen ? "max-h-[3000px] opacity-100" : "max-h-0 opacity-0"
            )}
          >
            <CardContent className="pt-0 pb-6 border-t border-border/50">
              <div className="pt-6">
                {/* Sales Funnel */}
                <MetricSection title="Воронка продаж">
                  <MetricAccordionRow
                    name="Окна"
                    metric={branch.sales_funnel.windows}
                  />
                  <MetricAccordionRow
                    name="Подборы"
                    metric={branch.sales_funnel.selections}
                    onDetailClick={() => setBreakdownModal({ type: 'selections' })}
                  />
                  <MetricAccordionRow
                    name="Рецепты"
                    metric={branch.sales_funnel.prescriptions}
                    onDetailClick={() => setBreakdownModal({ type: 'prescriptions' })}
                  />
                  <MetricAccordionRow
                    name="Заказы (наши)"
                    metric={branch.sales_funnel.orders}
                  />
                </MetricSection>

                {/* Funnel Efficiency */}
                <MetricSection title="Показатели эффективности воронки">
                  <MetricAccordionRow
                    name="% загрузки"
                    metric={branch.funnel_efficiency.loading_percentage}
                    isPercentage
                  />
                  <MetricAccordionRow
                    name="% подбор → рецепт"
                    metric={branch.funnel_efficiency.selection_to_prescription}
                    isPercentage
                    onDetailClick={() => setBreakdownModal({ type: 'prescription_rate' })}
                  />
                  <MetricAccordionRow
                    name="% рецепт → заказ (наш)"
                    metric={branch.funnel_efficiency.prescription_to_own_order}
                    isPercentage
                    onDetailClick={() => setBreakdownModal({ type: 'rx_own_order_rate' })}
                  />
                  <MetricAccordionRow
                    name="% подбор → заказ (наш)"
                    metric={branch.funnel_efficiency.selection_to_own_order}
                    isPercentage
                    onDetailClick={() => setBreakdownModal({ type: 'own_order_rate' })}
                  />
                </MetricSection>

                {/* Traffic */}
                <MetricSection title="Поток посетителей">
                  <MetricAccordionRow
                    name="Трафик"
                    metric={branch.traffic}
                  />
                  <MetricAccordionRow
                    name="% трафик → заказ"
                    metric={branch.traffic_to_order_conversion}
                    isPercentage
                  />
                  <MetricAccordionRow
                    name="% трафик → подбор"
                    metric={branch.traffic_to_selection_conversion}
                    isPercentage
                  />
                </MetricSection>

                {/* VTL Analytics */}
                <MetricSection title="Анализ ВТЛ">
                  <MetricAccordionRow
                    name="% рекомендаций ВТЛ"
                    metric={branch.vtl_analytics.recommendations_percentage}
                    isPercentage
                    onDetailClick={() => setBreakdownModal({ type: 'vtl_rate' })}
                  />
                  <MetricAccordionRow
                    name="% продаж ВТЛ"
                    metric={branch.vtl_analytics.sales_percentage}
                    isPercentage
                    onDetailClick={() => setBreakdownModal({ type: 'vtl_sales' })}
                  />
                  <MetricAccordionRow
                    name="Кол-во рекомендаций ВТЛ"
                    metric={branch.vtl_analytics.recommendations}
                    onDetailClick={() => setBreakdownModal({ type: 'vtl' })}
                  />
                  <MetricAccordionRow
                    name="Кол-во заказов ВТЛ"
                    metric={branch.vtl_analytics.orders}
                    onDetailClick={() => setBreakdownModal({ type: 'vtl_sales' })}
                  />
                  <MetricAccordionRow
                    name="Ср. чек заказа ВТЛ"
                    metric={branch.vtl_analytics.avg_check}
                    isMonetary
                  />
                </MetricSection>

                {/* Our vs Foreign Analysis */}
                <MetricSection title="Анализ Наши/Чужие">
                  <MetricAccordionRow
                    name="% чужих заказов"
                    metric={foreignOrdersPercentage}
                    isPercentage
                  />
                  <MetricAccordionRow
                    name="Заказы (чужие)"
                    metric={branch.foreign_orders.count}
                  />
                  <MetricAccordionRow
                    name="Ср. чек (чужой)"
                    metric={branch.foreign_orders.avg_check}
                    isMonetary
                  />
                  <MetricAccordionRow
                    name="Заказы (наши)"
                    metric={branch.own_orders.count}
                  />
                  <MetricAccordionRow
                    name="Ср. чек (наш)"
                    metric={branch.own_orders.avg_check}
                    isMonetary
                  />
                </MetricSection>

                {/* Total Orders */}
                <MetricSection title="Итого по всем заказам">
                  <MetricAccordionRow
                    name="Итого заказов"
                    metric={branch.total_orders.count}
                  />
                  <MetricAccordionRow
                    name="Итого сумма заказов"
                    metric={branch.total_orders.amount}
                    isMonetary
                  />
                  <MetricAccordionRow
                    name="Итого ср. чек"
                    metric={branch.total_orders.avg_check}
                    isMonetary
                  />

                </MetricSection>
              </div>
            </CardContent>
          </div>
        </div>
      </div>

      {/* Analysis Modal */}
      <BranchAnalysisModal
        branchId={branch.id}
        branchName={branch.name}
        period={period}
        isOpen={isAnalysisModalOpen}
        onClose={() => setIsAnalysisModalOpen(false)}
      />

      {/* Breakdown Modal */}
      {breakdownModal && (
        <AppointmentBreakdownModal
          isOpen={true}
          onClose={() => setBreakdownModal(null)}
          type={breakdownModal.type}
          startDate={periodDates.startDate}
          endDate={periodDates.endDate}
          branchGuid={branch.id}
        />
      )}
    </Card>
  )
}
