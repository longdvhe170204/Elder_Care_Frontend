import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

// Ô gõ tên có danh sách gợi ý thả xuống (datalist): gõ vài chữ là lọc, chọn một dòng để điền; vẫn gõ tự do được khi người
// cần ghi không có trong danh sách (demo 2026-11-25: không bắt người dùng nhớ mã, chọn theo tên).
export function SuggestField({ id, label, value, onChange, options, error, hint, placeholder = 'Gõ tên để tìm' }) {
  const listId = `${id}-options`
  return (
    <Field data-invalid={!!error || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        list={listId}
        autoComplete="off"
        className="h-11"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error || undefined}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
      {error ? <FieldError>{error}</FieldError> : hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  )
}
