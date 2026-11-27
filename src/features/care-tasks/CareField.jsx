import { useId } from 'react'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

// Label bao điều khiển để tên truy cập được giữ cả khi form có nhiều mục lặp lại. error: lời báo tại ô (DESIGN.md 7.4)
export function CareField({
  label,
  value,
  onChange,
  type = 'text',
  options,
  required,
  maxLength,
  min,
  disabled,
  error,
  // Tên ô cho trình đọc màn hình khi nhãn hiện ngắn hơn (vd. nhãn "Loại công việc *", tên "Loại công việc mục 2")
  name,
  placeholder,
  hint,
  compactTextarea,
}) {
  const errorId = useId()
  const props = {
    value: value ?? '',
    onChange: (e) => onChange(e.target.value),
    required,
    disabled,
    'aria-invalid': error ? true : undefined,
    'aria-label': name,
    placeholder,
    'aria-describedby': error ? errorId : undefined,
  }
  const field = (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="type-label">{label}</span>
      {options ? (
        <select
          {...props}
          className="h-11 w-full rounded-lg border border-input bg-background px-3 focus-visible:outline-ring"
        >
          <option value="">Chọn…</option>
          {Object.entries(options).map(([code, text]) => (
            <option key={code} value={code}>
              {text}
            </option>
          ))}
        </select>
      ) : type === 'textarea' ? (
        <Textarea
          {...props}
          maxLength={maxLength}
          rows={compactTextarea ? 1 : undefined}
          className={compactTextarea ? 'min-h-11' : undefined}
        />
      ) : (
        <Input {...props} className="h-11" type={type} maxLength={maxLength} min={min} />
      )}
      {hint && <span className="type-caption text-muted-foreground">{hint}</span>}
    </label>
  )
  // Lời báo đặt ngoài nhãn để không nối vào tên ô
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {field}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  )
}

export function CareCheck({ label, checked, onChange, disabled }) {
  return (
    <label className="flex min-h-11 items-center gap-3">
      <input
        className="size-5 accent-primary"
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span>{label}</span>
    </label>
  )
}
