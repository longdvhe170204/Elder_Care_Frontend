import { useId } from 'react'
import { Info, Siren, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ResidentAvatar } from '@/common/ResidentAvatar'
import { cn } from '@/lib/utils'
import { LEVEL_LABEL, LEVEL_ORDER } from './incidentView'

// Phần dùng chung của màn Sự cố và Cảnh báo: chọn người cao tuổi, chọn mức, tab lọc của danh sách
const RESIDENT_LIST_MAX = 9
const SEARCH_FROM = 6

export function ResidentChoices({ residents, query, onQuery, onPick }) {
  const needle = query.trim().toLowerCase()
  const matched = residents.filter((r) => !needle || `${r.name} ${r.code}`.toLowerCase().includes(needle))
  const shown = matched.slice(0, RESIDENT_LIST_MAX)
  return (
    <div className="flex flex-col gap-3">
      {residents.length > SEARCH_FROM && (
        <Input
          className="h-11 bg-card"
          placeholder="Gõ tên hoặc mã để tìm"
          aria-label="Tìm người cao tuổi"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((r) => (
          <Button
            key={r.id}
            type="button"
            variant="outline"
            aria-label={`${r.name}, ${r.code}`}
            className="h-auto min-h-16 justify-start gap-3 rounded-lg bg-card px-4 py-3 text-left whitespace-normal"
            onClick={() => onPick(r.id)}
          >
            <ResidentAvatar name={r.name} code={String(r.id)} className="size-10" />
            <span className="flex min-w-0 flex-col">
              <span className="type-label">{r.name}</span>
              <span className="type-caption font-normal text-muted-foreground">{r.code}</span>
            </span>
          </Button>
        ))}
      </div>
      {matched.length === 0 && <p className="type-body-sm">Không có người cao tuổi nào khớp trong phạm vi của bạn.</p>}
      {matched.length > shown.length && (
        <p className="type-body-sm text-muted-foreground">
          Còn {matched.length - shown.length} người nữa, gõ thêm để lọc.
        </p>
      )}
    </div>
  )
}

const LEVEL_STYLE = {
  CRITICAL: [Siren, 'text-destructive hover:text-destructive', 'Ví dụ ngã, mất ý thức, khó thở. Cần người tới ngay.'],
  MEDIUM: [
    TriangleAlert,
    'text-warning-foreground hover:text-warning-foreground',
    'Ví dụ chỉ số bất thường, từ chối thuốc. Điều dưỡng xử lý, báo bác sĩ khi cần.',
  ],
  LOW: [Info, 'text-foreground', 'Ví dụ bỏ bữa, khó ngủ. Ghi nhận và theo dõi trong ca.'],
}

// Chọn mức bằng ba ô có nhãn chữ và ví dụ ngắn (nghiep-vu 9.3), chữ màu theo tông mức (DESIGN.md 3.5); ô đang chọn có viền
// đậm cùng màu và aria-pressed. Mức là độ khẩn của việc xử lý, khác trạng thái xử lý.
export function LevelChoices({ value, onChange }) {
  const id = useId()
  return (
    <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label="Mức">
      {LEVEL_ORDER.map((level) => {
        const [Icon, tone, hint] = LEVEL_STYLE[level]
        return (
          <Button
            key={level}
            type="button"
            variant="outline"
            aria-label={LEVEL_LABEL[level]}
            aria-describedby={`${id}-${level}`}
            aria-pressed={value === level}
            className={cn(
              'h-auto min-h-14 flex-col items-start justify-start gap-1 rounded-lg bg-card px-3 py-2.5 text-left whitespace-normal',
              tone,
              value === level && 'border-2 border-current',
            )}
            onClick={() => onChange(level)}
          >
            <span className="flex items-center gap-2">
              <Icon aria-hidden="true" />
              {LEVEL_LABEL[level]}
            </span>
            <span id={`${id}-${level}`} className="type-body-sm font-normal text-muted-foreground">
              {hint}
            </span>
          </Button>
        )
      })}
    </div>
  )
}

// Tab lọc kèm số đếm của danh sách; options là [giá trị, nhãn, số]
export function FilterTabs({ label, options, value, onChange }) {
  return (
    <ToggleGroup
      variant="filter"
      size="lg"
      value={[value]}
      onValueChange={(next) => next[0] && onChange(next[0])}
      aria-label={label}
      className="xl:data-[variant=filter]:w-auto"
    >
      {options.map(([key, text, count]) => (
        <ToggleGroupItem key={key} value={key} className="h-11 px-4">
          {text} <span className="tabular-nums">{count}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
