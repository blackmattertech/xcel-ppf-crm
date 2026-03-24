'use client'

import { useRef, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

type VirtualizedScrollListProps<T> = {
  items: T[]
  estimateSize: number
  getItemKey: (item: T, index: number) => string
  renderItem: (item: T, index: number) => ReactNode
  className?: string
  /** When false, renders children as a plain stack (keeps drag-and-drop simpler). */
  enabled: boolean
}

export function VirtualizedScrollList<T>({
  items,
  estimateSize,
  getItemKey,
  renderItem,
  className = 'max-h-[min(520px,calc(100vh-240px))] overflow-y-auto overscroll-contain pr-1',
  enabled,
}: VirtualizedScrollListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 6,
    getItemKey: (index) => getItemKey(items[index], index),
  })

  if (!enabled) {
    return (
      <div className="space-y-3 min-h-[100px]">
        {items.map((item, index) => (
          <div key={getItemKey(item, index)}>{renderItem(item, index)}</div>
        ))}
      </div>
    )
  }

  return (
    <div ref={parentRef} className={className}>
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((vi) => {
          const item = items[vi.index]
          return (
            <div
              key={vi.key}
              className="absolute left-0 top-0 w-full pb-3"
              style={{ transform: `translateY(${vi.start}px)` }}
            >
              {renderItem(item, vi.index)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
