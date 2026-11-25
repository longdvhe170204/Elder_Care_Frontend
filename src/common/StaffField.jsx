import { useEffect, useState } from 'react'
import { getStaff } from '@/api'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

// Ô chọn nhân viên theo tên, có đường lùi (demo 2026-11-25: bỏ ô nhập mã, chọn theo tên). Đọc được danh sách nhân viên
// đang làm việc (api-008) thì hiện ô chọn "Họ tên (chức vụ)"; đang tải hoặc không đọc được (thiếu quyền xem hồ sơ nhân
// viên, lỗi mạng) thì giữ ô nhập mã với fallbackLabel như trước. Giá trị là mã hồ sơ nhân viên dạng chuỗi. filter: lọc người được chọn.
// valueKey: 'id' (mã hồ sơ nhân viên) hoặc 'accountId' (mã tài khoản, chỉ liệt kê người có tài khoản); emptyLabel: chữ của
// lựa chọn trống (ví dụ "Tất cả" khi dùng làm bộ lọc).
export function StaffField({
  id,
  label,
  fallbackLabel,
  value,
  onChange,
  error,
  hint,
  filter = () => true,
  valueKey = 'id',
  emptyLabel = 'Chọn nhân viên',
}) {
  const [staff, setStaff] = useState(null)
  useEffect(() => {
    let live = true
    getStaff({ query: { status: 'WORKING' } })
      .then(({ data }) => live && setStaff(Array.isArray(data) ? data : []))
      .catch(() => live && setStaff([]))
    return () => {
      live = false
    }
  }, [])
  const options = (staff ?? []).filter((s) => s[valueKey] != null).filter(filter)
  const message = error ? <FieldError>{error}</FieldError> : hint && <FieldDescription>{hint}</FieldDescription>
  if (staff === null || staff.length === 0)
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
        {message}
      </Field>
    )
  return (
    <Field data-invalid={!!error || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error || undefined}
        className="h-10 w-full rounded-md border border-input bg-transparent px-3"
      >
        <option value="">{emptyLabel}</option>
        {options.map((s) => (
          <option key={s.id} value={String(s[valueKey])}>
            {s.position ? `${s.fullName} (${s.position})` : s.fullName}
          </option>
        ))}
      </select>
      {message}
    </Field>
  )
}
