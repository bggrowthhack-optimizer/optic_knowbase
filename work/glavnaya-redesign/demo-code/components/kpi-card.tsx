'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { BreakdownDetailButton } from '@/components/breakdown-detail-button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { cn, formatCurrency, formatCurrencyFull, formatPercentage, getStatusVariant } from '@/lib/utils'
import { KpiMetric } from '@/types'

function AnimatedValue({
  value,
  formatter,
  isHovered,
  className
}: {
  value: number
  formatter: (val: number, expanded: boolean) => string
  isHovered: boolean
  className?: string
}) {
  const shortValue = formatter(value, false)
  const longValue = formatter(value, true)

  return (
    <div className={cn("relative", className)}>
      <span className={cn(
        "inline-block transition-all duration-500 ease-out transform-gpu",
        isHovered ? "scale-0 opacity-0 -translate-y-2" : "scale-100 opacity-100 translate-y-0"
      )}>
        {shortValue}
      </span>
      <span className={cn(
        "absolute top-0 left-0 inline-block transition-all duration-500 ease-out transform-gpu whitespace-nowrap",
        isHovered ? "scale-100 opacity-100 translate-y-0" : "scale-0 opacity-0 translate-y-2"
      )}>
        {longValue}
      </span>
    </div>
  )
}

interface KpiCardProps {
  title: string
  metric: KpiMetric
  isMonetary?: boolean
  withoutPlan?: boolean
  onClick?: () => void
  onDetailClick?: () => void
  /** Та же карточка, но с вдвое меньшими отступами и без responsive-шагов
   *  в размерах — для плотных сеток (например, свёрнутого блока «Показатели»
   *  на Главной), где при 10+ плитках воздух p-6/md:p-6 каждой карточки
   *  складывается в заметно пустую сетку. Ничего не убрано функционально,
   *  только расстояния — поведение и остальные страницы не затронуты, т.к.
   *  проп по умолчанию выключен. */
  compact?: boolean
}

export function KpiCard({ title, metric, isMonetary = false, withoutPlan = false, onClick, onDetailClick, compact = false }: KpiCardProps) {
  const [isHovered, setIsHovered] = useState(false)

  if (!metric) {
    return (
      <Card className="bg-card border-border/50 shadow-sm hover:shadow-md transition-all duration-300">
        <CardContent className="p-6">
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
            <div className="text-2xl font-bold text-card-foreground">-</div>
            <div className="text-xs text-muted-foreground">Нет данных</div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const formatValue = (value: number, expanded: boolean = false) => {
    if (isMonetary) {
      return expanded ? formatCurrencyFull(value) : formatCurrency(value)
    }
    if (title.includes('%')) {
      if (title.includes('→')) {
        return `${value.toString().replace(',', '.')}%`
      }
      return formatPercentage(value)
    }
    return value.toLocaleString('ru-RU')
  }

  const formatPlan = (value: number, expanded: boolean = false) => {
    if (isMonetary) {
      return expanded ? formatCurrencyFull(value) : formatCurrency(value)
    }
    if (title.includes('%')) {
      if (title.includes('→')) {
        return `${value.toString().replace(',', '.')}%`
      }
      return formatPercentage(value)
    }
    return value.toLocaleString('ru-RU')
  }

  const isAnimatable = isMonetary && (title.includes('чек') || title.includes('продаж') || title.includes('сумма заказов') || title.includes('покупок'))

  // Словами, не числом: цифра выполнения не обязательна — сам факт и план
  // уже видны выше, а бейдж должен только сказать, как к плану относиться.
  // Заодно снимает путаницу с инвертированными метриками («К-во ушедших»),
  // где execution = plan/current может быть 500%+ — для них «554%
  // выполнения» читалось как баг, а «план выполнен» читается однозначно.
  // Статус с бэка считается по темпу месяца (факт против плана на сегодня),
  // а не по итогу — поэтому «По плану», а не «План выполнен»: 14% суммы
  // заказов на 5-й день месяца — это по плану, но точно не «выполнен».
  const getStatusText = (status: 'excellent' | 'good' | 'poor') => {
    if (status === 'excellent') return 'По плану'
    if (status === 'good') return 'Чуть ниже плана'
    return 'Ниже плана'
  }

  return (
    <Card
      className={cn(
        "transition-all duration-300 bg-card border-border/50 shadow-sm hover:shadow-lg hover:border-primary/20 overflow-hidden",
        isAnimatable && "hover:scale-[1.02]",
        onClick && "cursor-pointer"
      )}
      onClick={onClick}
    >
      {/* Статус-полоса сверху. В compact — сама и есть прогресс-бар (ширина
          = % выполнения), чтобы не держать для того же факта отдельную
          секцию ниже; в полном виде — просто сплошная плашка, как раньше. */}
      {compact ? (
        // Сплошная, не по ширине: статус считается по темпу месяца, и полоса
        // «по % выполнения» на 5-й день почти пустая даже у зелёных метрик —
        // выглядело как провал. Цвет говорит статус, толщина — чтобы читался.
        <div className={cn(
          "h-1.5",
          withoutPlan && "bg-muted",
          !withoutPlan && metric.status === 'excellent' && "bg-excellent",
          !withoutPlan && metric.status === 'good' && "bg-good",
          !withoutPlan && metric.status === 'poor' && "bg-poor"
        )} />
      ) : (
        <div className={cn(
          "h-[3px]",
          withoutPlan && "bg-muted",
          !withoutPlan && metric.status === 'excellent' && "bg-excellent",
          !withoutPlan && metric.status === 'good' && "bg-good",
          !withoutPlan && metric.status === 'poor' && "bg-poor"
        )} />
      )}
      <CardContent
        className={compact ? "relative px-4 pt-2.5 pb-3" : "p-4 md:p-6"}
        onMouseEnter={isAnimatable ? () => setIsHovered(true) : undefined}
        onMouseLeave={isAnimatable ? () => setIsHovered(false) : undefined}
      >
        {/* В compact иконка детализации — в правом нижнем углу, абсолютно:
            не занимает места ни в заголовке, ни в значении и не меняет
            высоту плитки. */}
        {compact && onDetailClick && (
          <BreakdownDetailButton
            metricName={title}
            onClick={onDetailClick}
            className="absolute bottom-2.5 right-3"
          />
        )}
        <div className={compact ? "space-y-1" : "space-y-3 md:space-y-4"}>
          {/* Title — всегда резервирует место под 2 строки (не только в
              полном виде): иначе карточки с короткими и длинными названиями
              («К-во ушедших» vs «% рецепт → заказ (наш)») выходят разной
              высоты и сетка выглядит рваной. */}
          {/* В compact заголовок в одну строку (с многоточием и подсказкой
              при наведении), без переноса — переносы ломали ровность сетки. */}
          <div className={cn("relative flex items-start gap-2", !compact && "min-h-[2.25rem] md:min-h-[2.5rem]")}>
            <h3
              title={compact ? title : undefined}
              className={cn("font-medium text-muted-foreground flex-1 min-w-0", compact ? "text-[13px] leading-6 truncate" : "text-xs md:text-sm")}
            >
              {title}
            </h3>
            {!compact && onDetailClick && (
              <BreakdownDetailButton
                metricName={title}
                onClick={onDetailClick}
                className="-mt-0.5"
              />
            )}
          </div>

          {/* Values */}
          <div className="flex items-center justify-between">
            <div className="w-full">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "font-bold transition-transform duration-300 ease-out text-card-foreground",
                  compact ? "text-2xl leading-none tracking-tight" : "text-xl md:text-2xl",
                  isHovered && isAnimatable && "scale-105"
                )}>
                  <AnimatedValue
                    value={metric.current}
                    formatter={formatValue}
                    isHovered={isAnimatable ? isHovered : false}
                  />
                </div>
                {isAnimatable && !compact && (
                  <span className={cn(
                    // Подсказка про курсор бессмысленна на тач-экране
                    "hidden md:inline text-xs text-muted-foreground/50 whitespace-nowrap transition-opacity duration-300",
                    isHovered ? "opacity-0" : "opacity-100"
                  )}>
                    (наведите курсор)
                  </span>
                )}
              </div>
              <div className={cn("text-xs", compact ? "mt-1 h-4 flex items-center pr-9 text-muted-foreground" : "mt-1 text-muted-foreground/70")}>
                <div className={cn(compact && "truncate min-w-0")}>
                  {withoutPlan ? (
                    compact ? "Без плана" : "Информационная метрика"
                  ) : (
                    <AnimatedValue
                      value={metric.plan}
                      formatter={(val, expanded) => `План: ${formatPlan(val, expanded)}`}
                      isHovered={isAnimatable ? isHovered : false}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Progress Bar — только в полном виде; в compact прогресс уже
              показан шириной статус-полосы сверху, а бейдж перенесён в
              строку плана выше. */}
          {!compact && (
            <div className="space-y-2.5">
              <Progress
                value={withoutPlan ? 100 : metric.execution}
                status={withoutPlan ? "neutral" : metric.status}
                className="h-2"
              />
              <div className="flex justify-end">
                <Badge
                  variant={withoutPlan ? "secondary" : metric.status}
                  className={cn(
                    "font-semibold transition-colors rounded-full text-2xs md:text-xs",
                    withoutPlan && "bg-muted/50 text-muted-foreground hover:bg-muted/70",
                    !withoutPlan && metric.status === 'excellent' && "bg-excellent/10 text-excellent hover:bg-excellent/20 border border-excellent/20",
                    !withoutPlan && metric.status === 'good' && "bg-good/10 text-good hover:bg-good/20 border border-good/20",
                    !withoutPlan && metric.status === 'poor' && "bg-poor/10 text-poor hover:bg-poor/20 border border-poor/20"
                  )}
                >
                  {withoutPlan ? "Без плана" : getStatusText(metric.status)}
                </Badge>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
