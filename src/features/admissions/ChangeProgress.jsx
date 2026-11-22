import { cn } from '@/lib/utils'

// Tiến trình của một yêu cầu điều chỉnh hợp đồng (DESIGN.md 7.2 change-progress; 6.19.0). Thanh các đoạn, mỗi đoạn một bước
// của BF-08, kèm câu "Bước k trên n: tên bước" để màu không là tín hiệu duy nhất (WCAG 1.4.1). Xanh thương hiệu (chart-2)
// chỉ là đồ họa của đoạn đang làm; chữ luôn là màu chữ chính. progress lấy từ changeSteps(); null thì không hiện.
const SEGMENT = {
  done: 'border-primary bg-primary',
  current: 'border-chart-2 bg-chart-2',
  failed: 'border-warning-foreground bg-warning-foreground',
  todo: 'border-border bg-muted',
}

export function ChangeProgress({ progress }) {
  if (!progress) return null
  const { steps, total, position, current } = progress
  const failed = current?.state === 'failed'
  const headline = current
    ? `Bước ${position} trên ${total}: ${current.label}${failed ? ' không thành' : ''}`
    : `Đã xong ${total} bước`
  const done = steps.filter((s) => s.state === 'done').map((s) => s.label)
  const left = steps.filter((s) => s.state === 'todo').map((s) => s.label)
  const caption = [done.length > 0 && `Đã xong: ${done.join(', ')}.`, left.length > 0 && `Còn lại: ${left.join(', ')}.`]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="flex flex-col gap-2">
      <div
        role="progressbar"
        aria-label="Tiến trình yêu cầu"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={position}
        aria-valuetext={headline}
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
      >
        {steps.map((s) => (
          <span key={s.key} className={cn('h-1.5 rounded-full border', SEGMENT[s.state])} />
        ))}
      </div>
      <p className="type-label">{headline}</p>
      {caption && <p className="type-caption text-muted-foreground">{caption}</p>}
    </div>
  )
}
