import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'

// Ô chọn một người thân theo tên (danh sách từ useFamilyMembers); giá trị là mã người thân dạng chuỗi.
export function FamilyMemberSelect({ id, label, members, value, onChange, error, hint }) {
  return (
    <Field data-invalid={!!error || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <select
        id={id}
        className="h-11 w-full rounded-md border border-input bg-transparent px-3"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error || undefined}
      >
        <option value="">{members.length === 0 ? 'Chưa có người thân có quan hệ Hiệu lực' : 'Chọn người thân'}</option>
        {members.map((m) => (
          <option key={m.id} value={String(m.id)}>
            {m.fullName}
          </option>
        ))}
      </select>
      {error ? <FieldError>{error}</FieldError> : hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  )
}
