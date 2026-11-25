import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { selectClass } from './ShiftForm'

// Chọn tầng, khu vực theo tên (demo 2026-11-25). groups: [{ label, items: { id: tên } }] lấy từ danh mục 003 mà
// ShiftsPage đã tải (places). Không có mục nào (không xem được danh mục, D13) thì quay về ô nhập mã như trước.
export function PlaceField({ id, label, fallbackLabel, groups, value, onChange }) {
  const filled = groups.filter((g) => Object.keys(g.items).length > 0)
  if (filled.length === 0) {
    return (
      <Field>
        <FieldLabel htmlFor={id}>{fallbackLabel}</FieldLabel>
        <Input id={id} type="number" min="1" required value={value} onChange={(e) => onChange(e.target.value)} />
      </Field>
    )
  }
  const options = (items) =>
    Object.entries(items).map(([key, name]) => (
      <option key={key} value={key}>
        {name}
      </option>
    ))
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <select id={id} className={selectClass} required value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Chọn</option>
        {filled.length === 1
          ? options(filled[0].items)
          : filled.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {options(g.items)}
              </optgroup>
            ))}
      </select>
    </Field>
  )
}
