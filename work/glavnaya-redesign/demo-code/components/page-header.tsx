'use client'

import React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { LucideIcon, ChevronRight, Menu } from 'lucide-react'
import { useSidebar } from '@/components/sidebar'

interface Breadcrumb {
  label: string
  href?: string
}

interface PageHeaderProps {
  /** Тонкая шапка в одну строку: заголовок только для скринридера, видна подпись и действия */
  compact?: boolean
  title: string
  description?: string
  icon?: LucideIcon
  actions?: React.ReactNode
  breadcrumbs?: Breadcrumb[]
  className?: string
}

export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  breadcrumbs,
  className,
  compact = false
}: PageHeaderProps) {
  const { setIsMobileOpen } = useSidebar()

  return (
    <div className={cn(
      'border-b border-border bg-background/80 backdrop-blur-sm',
      className
    )}>
      {/* Контейнер повторяет контейнер контента (max-w-page + те же горизонтальные
          отступы). Без этого на широком мониторе заголовок прижимался к левому краю,
          а первая карточка контента начиналась на ~130px правее — самый заметный
          признак «непричёсанности» в продукте. */}
      <div className={cn("mx-auto w-full max-w-page px-4 md:px-6 lg:px-8", compact ? "py-2.5 md:py-3" : "py-4 md:py-6 lg:py-8")}>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Хлебные крошки" className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={index}>
                {index > 0 && <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-foreground font-medium" aria-current="page">{crumb.label}</span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}
        <div className="flex flex-col gap-3 md:gap-4 md:flex-row md:flex-wrap md:items-center md:justify-between">
          <div className="flex items-center gap-3 md:gap-4">
            {/* Вход в меню на экранах уже lg. Ниже lg меню открывается вкладкой «Ещё»
                в нижней панели, поэтому вторая кнопка в шапке не нужна: на телефоне
                место в строке заголовка дороже. Кнопка остаётся только на планшете. */}
            <button
              type="button"
              onClick={() => setIsMobileOpen(true)}
              aria-label="Открыть меню"
              aria-controls="app-sidebar"
              className="hidden md:flex lg:hidden h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Menu className="h-5 w-5" />
            </button>
            {Icon && !compact && (
              <div className="hidden sm:flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex-shrink-0">
                <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className={compact ? "sr-only" : "text-xl md:text-2xl font-bold text-foreground tracking-tight mb-0.5 md:mb-1"}>
                {title}
              </h1>
              {description && (
                <p className="text-xs md:text-sm text-muted-foreground leading-relaxed max-w-2xl">
                  {description}
                </p>
              )}
            </div>
          </div>
          {actions && (
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap md:ml-auto">
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
