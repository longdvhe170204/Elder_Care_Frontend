import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { FileInput } from '@/common/FileInput'

// Ô dùng chung trong các form đồ gửi (013): ô chọn native và ô tệp (ảnh, bản ký). Giữ cùng kiểu với ô của 001.

const SELECT = 'h-11 w-full rounded-md border border-input bg-transparent px-3'

export function SelectField({ id, label, value, onChange, options, error, placeholder = 'Chọn…', hint }) {
  return (
    <Field data-invalid={!!error || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error || undefined}
        className={SELECT}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? <FieldError>{error}</FieldError> : hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  )
}

// Chọn người thân theo tên (test luồng BF-14 2026-11-23); danh sách chưa tải xong, không đọc được hoặc không có ai phù
// hợp thì ô nhập mã như trước (fallbackLabel). value là chuỗi mã người thân.
export function MemberField({ id, label, fallbackLabel, contacts, filter = () => true, value, onChange, error }) {
  const members = contacts.status === 'ready' ? contacts.members.filter(filter) : []
  if (members.length === 0) {
    return (
      <Field data-invalid={!!error || undefined}>
        <FieldLabel htmlFor={id}>{fallbackLabel}</FieldLabel>
        <input
          id={id}
          inputMode="numeric"
          className={`${SELECT} tabular-nums`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error || undefined}
        />
        {error && <FieldError>{error}</FieldError>}
      </Field>
    )
  }
  const roles = (m) =>
    [m.representative && 'người đại diện', m.primaryContact && 'liên hệ chính'].filter(Boolean).join(', ')
  return (
    <SelectField
      id={id}
      label={label}
      value={value}
      onChange={onChange}
      error={error}
      options={members.map((m) => ({
        value: String(m.id),
        label: roles(m) ? `${m.fullName} (${roles(m)})` : m.fullName,
      }))}
    />
  )
}

// multiple: ảnh đồ gửi (nhiều tệp); một tệp: bản ký
export function FilesField({ id, label, files, onChange, error, hint, multiple = false, accept }) {
  return (
    <Field data-invalid={!!error || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FileInput
        id={id}
        multiple={multiple}
        accept={accept ?? (multiple ? 'image/jpeg,image/png' : 'application/pdf,image/jpeg,image/png')}
        aria-invalid={!!error || undefined}
        onChange={(e) => {
          onChange(Array.from(e.target.files ?? []))
        }}
      />
      {files.length > 0 && (
        <span className="type-body-sm text-muted-foreground">Đã chọn: {files.map((f) => f.name).join(', ')}</span>
      )}
      {error ? <FieldError>{error}</FieldError> : hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  )
}
