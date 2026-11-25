import { useEffect, useState } from 'react'
import { CircleHelp } from 'lucide-react'
import { getResidents } from '@/api'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ChoiceTray } from '@/common/ChoiceTray'
import { cn } from '@/lib/utils'
import { SELECT } from './admissionLabels'

// Thành phần form dùng chung trong features/admissions (004): chọn một trong vài giá trị, dòng thông tin, ô lý do,
// chọn người cao tuổi. Không dùng chung với feature khác (frontend/README mục 4 điều 1).

// Nút ? nhỏ cạnh nhãn/tiêu đề: bấm để ẩn/hiện phần giải thích chi tiết, giữ giao diện gọn mặc định
export function HelpHintButton({ label, open, onToggle }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={`Hướng dẫn: ${label}`}
      title={`Xem hướng dẫn: ${label}`}
      onClick={onToggle}
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        open && 'bg-primary/10 text-primary',
      )}
    >
      <CircleHelp aria-hidden className="size-3.5 stroke-[2]" />
    </button>
  )
}

export function HelpHintBox({ children }) {
  return (
    <p className="rounded-lg border border-border/70 bg-muted/50 px-3 py-2 type-caption text-muted-foreground leading-relaxed">
      {children}
    </p>
  )
}

export function LabelWithHelp({ htmlFor, label, hint, className }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <FieldLabel htmlFor={htmlFor} className={className}>
          {label}
        </FieldLabel>
        {hint && <HelpHintButton label={label} open={open} onToggle={() => setOpen((v) => !v)} />}
      </div>
      {hint && open && <HelpHintBox>{hint}</HelpHintBox>}
    </div>
  )
}

export function Choices({ label, hint, options, value, onChange, error }) {
  return (
    <Field data-invalid={!!error || undefined}>
      <LabelWithHelp label={label} hint={hint} />
      <ToggleGroup
        variant="outline"
        value={value ? [value] : []}
        onValueChange={(next) => next[0] && onChange(next[0])}
        aria-label={label}
        className="flex-wrap"
      >
        {options.map(([code, text]) => (
          <ToggleGroupItem key={code} value={code} className="h-11 px-4">
            {text}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}

export function Info({ label, children }) {
  return (
    <div className="flex flex-col">
      <span className="type-caption text-muted-foreground">{label}</span>
      <span className="type-body-sm tabular-nums">{children}</span>
    </div>
  )
}

// options: danh sách lựa chọn nhanh (ChoiceTray, một lựa chọn kèm "Khác"); không truyền thì là ô gõ tự do như cũ
export function ReasonField({ id, value, onChange, error, label = 'Lý do', showCount = false, options }) {
  if (options)
    return (
      <Field data-invalid={!!error || undefined}>
        <ChoiceTray id={id} label={label} options={options} value={value} onChange={onChange} invalid={!!error} />
        {error && <FieldError>{error}</FieldError>}
      </Field>
    )
  return (
    <Field data-invalid={!!error || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea
        id={id}
        rows={showCount ? 4 : 2}
        maxLength={2000}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error || undefined}
      />
      {showCount && <span className="self-end type-caption tabular-nums text-muted-foreground">{`${value.length} / 2000`}</span>}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}

// Chọn người cao tuổi theo trạng thái (api-001 GET /residents); không đọc được thì chỉ có ô trống
export function ResidentSelect({ id, label = 'Người cao tuổi', statuses, value, onChange, error, onFailure }) {
  const [residents, setResidents] = useState(null)

  useEffect(() => {
    let cancelled = false
    getResidents({ query: statuses ? { status: statuses } : {} })
      .then(({ data }) => !cancelled && setResidents(data.items))
      .catch((e) => {
        if (!cancelled) {
          setResidents([])
          onFailure?.(e)
        }
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Field data-invalid={!!error || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <select
        id={id}
        className={SELECT}
        value={value}
        aria-invalid={!!error || undefined}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{residents === null ? 'Đang tải…' : 'Chọn người cao tuổi'}</option>
        {(residents ?? []).map((r) => (
          <option key={r.id} value={r.id}>
            {`${r.personalInfo?.fullName ?? r.fullName ?? `Mã ${r.id}`}${r.profileCode ? ` (${r.profileCode})` : ''}`}
          </option>
        ))}
      </select>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}
