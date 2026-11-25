import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { FamilyMemberSelect } from './FamilyMemberSelect'

// Ô chọn người thân theo tên có đường lùi (demo 2026-11-25): có danh sách (useFamilyMembers) thì chọn theo tên; đang tải
// hoặc không đọc được thì giữ ô nhập mã với fallbackLabel như trước.
export function FamilyMemberField({ id, label, fallbackLabel, members, value, onChange, error, hint }) {
  if (members.length > 0)
    return (
      <FamilyMemberSelect
        id={id}
        label={label}
        members={members}
        value={value}
        onChange={onChange}
        error={error}
        hint={hint}
      />
    )
  return (
    <Field data-invalid={!!error || undefined}>
      <FieldLabel htmlFor={id}>{fallbackLabel}</FieldLabel>
      <Input
        id={id}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error || undefined}
        className="h-10 max-w-48 tabular-nums"
      />
      {error ? <FieldError>{error}</FieldError> : hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  )
}
