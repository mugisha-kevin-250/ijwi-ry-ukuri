import React, { useRef, useEffect, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '../../utils/cn'
import { Button } from './Button'

interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface DropdownProps {
  options: SelectOption[]
  value?: string
  placeholder?: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
  triggerClassName?: string
  contentClassName?: string
  renderOption?: (option: SelectOption) => React.ReactNode
}

export function Dropdown({
  options,
  value,
  placeholder = 'Select...',
  onChange,
  disabled = false,
  className,
  triggerClassName,
  contentClassName,
  renderOption,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const selectedOption = options.find((opt) => opt.value === value)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={dropdownRef} className={cn('relative inline-block w-full', className)}>
      <Button
        type="button"
        variant="outline"
        className={cn('w-full justify-between', triggerClassName)}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={placeholder}
      >
        <span className={cn('truncate', value ? '' : 'text-gray-500')}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown className={cn('h-4 w-4 flex-shrink-0', isOpen && 'rotate-180')} aria-hidden="true" />
      </Button>

      {isOpen && (
        <div
          className={cn(
            'absolute z-50 mt-1 w-full rounded-lg border border-gray-300 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800',
            contentClassName
          )}
          role="listbox"
          aria-label={placeholder}
        >
          <div className="py-1 max-h-60 overflow-y-auto">
            {options.map((option) => (
              <button
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled}
                onClick={() => {
                  if (!option.disabled) {
                    onChange(option.value)
                    setIsOpen(false)
                  }
                }}
                disabled={option.disabled}
                className={cn(
                  'w-full px-3 py-2 text-left text-sm transition-colors',
                  option.value === value
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700',
                  option.disabled && 'opacity-50 cursor-not-allowed'
                )}
              >
                {renderOption ? (
                  renderOption(option)
                ) : (
                  <div className="flex items-center gap-2">
                    {option.value === value && <Check className="h-4 w-4 text-brand-600 dark:text-brand-400" />}
                    <span>{option.label}</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}