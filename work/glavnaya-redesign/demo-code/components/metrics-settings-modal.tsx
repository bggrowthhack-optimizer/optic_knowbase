'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { MetricCategory, MetricsVisibility } from '@/types'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ModalShell } from '@/components/ui/modal-shell'

/** Один независимо настраиваемый набор колонок (вкладка модалки). */
export interface MetricsSettingsTab {
  id: string
  label: string
  categories: MetricCategory[]
  currentSettings: MetricsVisibility
}

interface MetricsSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  /** Однонаборный режим (KPI, «Динамика продаж»): один onSave без ключа вкладки. */
  onSave: (settings: MetricsVisibility) => void
  categories?: MetricCategory[]
  currentSettings?: MetricsVisibility
  /**
   * Вкладки — когда наборов несколько (рейтинг: врачи и консультанты настраиваются
   * порознь). Заданы вкладки — categories/currentSettings игнорируются, а onSave
   * получает вторым аргументом id вкладки. Сохраняются только изменённые наборы.
   */
  tabs?: MetricsSettingsTab[]
  onSaveTab?: (tabId: string, settings: MetricsVisibility) => void
  title?: string
  /** Ограничение числа выбранных метрик (по всем категориям вкладки).
   *  Не задано — без ограничений, как раньше. */
  minSelected?: number
  maxSelected?: number
}

const SINGLE_TAB_ID = 'default'

export default function MetricsSettingsModal({
  isOpen,
  onClose,
  onSave,
  categories,
  currentSettings,
  tabs,
  onSaveTab,
  title = 'Настройка отображаемых метрик',
  minSelected,
  maxSelected,
}: MetricsSettingsModalProps) {
  // Оба режима сведены к одному списку вкладок: ниже по коду различий нет,
  // однонаборный режим — это просто одна вкладка без её переключателя.
  const effectiveTabs: MetricsSettingsTab[] = useMemo(
    () => tabs ?? [{
      id: SINGLE_TAB_ID,
      label: '',
      categories: categories ?? [],
      currentSettings: currentSettings ?? {},
    }],
    [tabs, categories, currentSettings]
  )

  const savedByTab = useMemo(
    () => Object.fromEntries(effectiveTabs.map(t => [t.id, t.currentSettings])) as Record<string, MetricsVisibility>,
    [effectiveTabs]
  )

  const [settingsByTab, setSettingsByTab] = useState<Record<string, MetricsVisibility>>(savedByTab)
  const [activeTabId, setActiveTabId] = useState(effectiveTabs[0].id)
  const [mounted, setMounted] = useState(false)

  // Проверка монтирования на клиенте
  useEffect(() => {
    setMounted(true)
  }, [])

  // Синхронизация с внешними настройками при открытии
  useEffect(() => {
    if (isOpen) {
      setSettingsByTab(savedByTab)
      setActiveTabId(effectiveTabs[0].id)
    }
  }, [isOpen, savedByTab, effectiveTabs])

  // Отслеживание изменений
  const changedTabIds = useMemo(
    () => effectiveTabs
      .filter(t => JSON.stringify(settingsByTab[t.id] ?? {}) !== JSON.stringify(savedByTab[t.id] ?? {}))
      .map(t => t.id),
    [effectiveTabs, settingsByTab, savedByTab]
  )
  const hasChanges = changedTabIds.length > 0

  if (!isOpen || !mounted) return null

  const activeTab = effectiveTabs.find(t => t.id === activeTabId) ?? effectiveTabs[0]
  const settings = settingsByTab[activeTab.id] ?? {}

  const patchActive = (updates: MetricsVisibility) => {
    setSettingsByTab(prev => ({
      ...prev,
      [activeTab.id]: { ...(prev[activeTab.id] ?? {}), ...updates },
    }))
  }

  const allMetricIds = activeTab.categories.flatMap(c => c.metrics.map(m => m.id))
  const totalSelected = allMetricIds.filter(id => settings[id]).length
  const atMax = maxSelected !== undefined && totalSelected >= maxSelected
  const belowMin = minSelected !== undefined && totalSelected < minSelected
  // Старые сохранённые настройки могут быть уже сверх лимита — тогда просим
  // снять лишние, а не молча сохраняем.
  const aboveMax = maxSelected !== undefined && totalSelected > maxSelected
  const outOfRange = belowMin || aboveMax

  const handleToggle = (metricId: string) => {
    if (!settings[metricId] && atMax) return
    patchActive({ [metricId]: !settings[metricId] })
  }

  const handleSelectAll = (category: MetricCategory) => {
    // С лимитом добираем не больше, чем осталось до максимума.
    const free = maxSelected === undefined ? Infinity : maxSelected - totalSelected
    const toAdd = category.metrics.filter(m => !settings[m.id]).slice(0, Math.max(0, free))
    patchActive(Object.fromEntries(toAdd.map(m => [m.id, true])))
  }

  const handleDeselectAll = (category: MetricCategory) => {
    patchActive(Object.fromEntries(category.metrics.map(m => [m.id, false])))
  }

  const handleSave = () => {
    // Сохраняем только изменённые наборы: у рейтинга это два разных запроса,
    // и лишний PUT перезаписал бы настройки соседнего отдела без нужды.
    changedTabIds.forEach(tabId => {
      const next = settingsByTab[tabId] ?? {}
      if (tabs) {
        onSaveTab?.(tabId, next)
      } else {
        onSave(next)
      }
    })
    onClose()
  }

  const handleCancel = () => {
    setSettingsByTab(savedByTab)
    onClose()
  }

  return (
    // Портал, скрим, Escape, фокус-трап и возврат фокуса — из ModalShell.
    // Раньше здесь были две ручные подложки на z-[1050] без ловушки фокуса.
    <ModalShell open={isOpen} onClose={handleCancel} title={title} className="max-w-4xl" bare>
        <Card className="w-full overflow-hidden bg-card">
          {/* Header */}
          <div className="border-b px-6 py-4">
            <h2 className="text-xl font-semibold text-foreground">{title}</h2>
          </div>

          {/* Вкладки отделов — только когда наборов несколько */}
          {tabs && (
            <div role="tablist" aria-label="Набор колонок" className="flex gap-1 border-b px-6 pt-3">
              {effectiveTabs.map(tab => {
                const isActive = tab.id === activeTab.id
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    type="button"
                    aria-selected={isActive}
                    onClick={() => setActiveTabId(tab.id)}
                    className={cn(
                      'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                      isActive
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {tab.label}
                    {changedTabIds.includes(tab.id) && (
                      <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-good align-middle" aria-label="есть несохранённые изменения" />
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Content */}
          <div className="overflow-y-auto max-h-[calc(90vh-140px)] px-6 py-4">
            <div className="space-y-6">
              {activeTab.categories.map(category => {
                const selectedCount = category.metrics.filter(m => settings[m.id]).length
                const totalCount = category.metrics.length
                const allSelected = selectedCount === totalCount
                const noneSelected = selectedCount === 0

                return (
                  <div key={category.id} className="border rounded-lg p-4">
                    {/* Category Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <h3 className="font-medium text-foreground">{category.title}</h3>
                        <span className="text-sm text-muted-foreground">
                          ({selectedCount} из {totalCount})
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSelectAll(category)}
                          disabled={allSelected || atMax}
                          className="text-xs"
                        >
                          Выбрать все
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeselectAll(category)}
                          disabled={noneSelected}
                          className="text-xs"
                        >
                          Снять все
                        </Button>
                      </div>
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {category.metrics.map(metric => {
                        const locked = atMax && !settings[metric.id]
                        return (
                        <label
                          key={metric.id}
                          className={cn(
                            "flex items-start gap-2 p-2 rounded",
                            locked ? "opacity-50 cursor-not-allowed" : "hover:bg-muted cursor-pointer"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={settings[metric.id] ?? false}
                            disabled={locked}
                            onChange={() => handleToggle(metric.id)}
                            className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-foreground">
                              {metric.label}
                            </div>
                            {metric.description && (
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {metric.description}
                              </div>
                            )}
                          </div>
                        </label>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t px-6 py-4 flex items-center justify-between bg-muted">
            <div className="text-sm text-muted-foreground">
              {(minSelected !== undefined || maxSelected !== undefined) ? (
                <span className={cn(outOfRange && "text-poor font-medium")}>
                  Выбрано {totalSelected}
                  {minSelected !== undefined && maxSelected !== undefined
                    ? ` · можно от ${minSelected} до ${maxSelected}`
                    : maxSelected !== undefined ? ` · максимум ${maxSelected}` : ` · минимум ${minSelected}`}
                </span>
              ) : hasChanges ? (
                <span className="text-good font-medium">Есть несохраненные изменения</span>
              ) : (
                <span>Изменений нет</span>
              )}
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleCancel}
              >
                Отмена
              </Button>
              <Button
                onClick={handleSave}
                disabled={!hasChanges || outOfRange}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                Сохранить
              </Button>
            </div>
          </div>
        </Card>
    </ModalShell>
  )
}
