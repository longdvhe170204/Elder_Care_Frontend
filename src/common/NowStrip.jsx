import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

// Dải "Cần làm ngay" (DESIGN.md mục 5, 7.2 now-strip): một dòng trên bề mặt trắng ngay dưới đầu màn; nhãn đỏ kèm số,
// rồi các mục nối bằng dấu phẩy, bấm một mục mở khung chi tiết của nó; bên phải chữ phụ tóm tắt việc sắp tới.
// Chỉ hiện số liệu, cảnh báo đã có, không tự gợi ý (Q-306, Q-307). Không có mục nào thì không có dải.
// items: [{ key, label, onSelect }]
export function NowStrip({ label = 'Cần làm ngay', items, summary }) {
  if (!items?.length) return null
  const isUrgent = label === 'Cần làm ngay'
  return (
    <section
      aria-label={label}
      className={cn(
        'flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border px-4 py-3 shadow-xs',
        isUrgent
          ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200'
          : 'border-slate-200 bg-white text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200',
      )}
    >
      <div className="flex items-center gap-2">
        {isUrgent && <AlertTriangle className="size-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />}
        <span className={cn('text-xs font-bold uppercase tracking-wider', isUrgent ? 'text-red-700 dark:text-red-400' : 'text-primary')}>
          {label} ({items.length})
        </span>
      </div>
      <span className="flex flex-1 flex-wrap items-center gap-1.5 text-xs font-medium">
        {items.map((item, i) => (
          <span key={item.key} className="inline-flex items-center">
            <button
              type="button"
              onClick={item.onSelect}
              className={cn(
                'rounded font-semibold underline-offset-4 hover:underline',
                isUrgent ? 'text-red-900 hover:text-red-950 dark:text-red-200' : 'text-primary hover:text-primary/80',
              )}
            >
              {item.label}
            </button>
            {i < items.length - 1 && <span className="mx-1 text-slate-400">,</span>}
          </span>
        ))}
      </span>
      {summary && <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{summary}</span>}
    </section>
  )
}
