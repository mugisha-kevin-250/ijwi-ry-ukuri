import React from 'react'
import { cn } from '../../utils/cn'
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'

interface StatCardProps {
  title: string
  value: string | number
  change?: number
  changeLabel?: string
  icon: React.ComponentType<{ className?: string }>
  iconColor?: string
  className?: string
}

export default function StatCard({
  title,
  value,
  change,
  changeLabel,
  icon: Icon,
  iconColor = 'text-brand-600 dark:text-brand-400',
  className,
}: StatCardProps) {
  const isPositive = change && change > 0
  const isNegative = change && change < 0

  return (
    <div className={cn('p-6 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          {change !== undefined && (
            <div className="mt-2 flex items-center gap-1">
              {isPositive ? (
                <ArrowUpRight className="h-4 w-4 text-green-600 dark:text-green-400" />
              ) : isNegative ? (
                <ArrowDownRight className="h-4 w-4 text-red-600 dark:text-red-400" />
              ) : (
                <Minus className="h-4 w-4 text-gray-400" />
              )}
              <span className={cn('text-sm font-medium', isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-gray-500')}>
                {isPositive || isNegative ? `${Math.abs(change)}%` : 'No change'}
                {changeLabel && ` ${changeLabel}`}
              </span>
            </div>
          )}
        </div>
        <div className={cn('p-3 rounded-lg', iconColor.replace('text-', 'bg-').replace('dark:text-', 'dark:bg-').replace('-600', '-100').replace('-400', '-900/30'))}>
          <Icon className={cn('h-6 w-6', iconColor)} aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}

interface StatsGridProps {
  stats: Array<{
    title: string
    value: string | number
    change?: number
    changeLabel?: string
    icon: React.ComponentType<{ className?: string }>
    iconColor?: string
  }>
  className?: string
}

export function StatsGrid({ stats, className }: StatsGridProps) {
  return (
    <div className={cn('grid gap-4', className, {
      'grid-cols-1': true,
      'sm:grid-cols-2': true,
      'lg:grid-cols-4': true,
    })}>
      {stats.map((stat, index) => (
        <StatCard key={index} {...stat} />
      ))}
    </div>
  )
}