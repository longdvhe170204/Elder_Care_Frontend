import { useEffect, useState } from 'react'
import { getStaff } from '@/api'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'

// Ô chọn một nhân viên đang làm việc (api-008, người dùng xem được). `valueKey` là trường làm giá trị: `id` (mã nhân
// viên) hoặc `accountId` (mã tài khoản, chỉ liệt kê người đã có tài khoản). Ghi kèm chức vụ để phân biệt người trùng tên.
// positions: chỉ liệt kê người có chức vụ trong danh sách (ví dụ giao cảnh báo chỉ cho Điều dưỡng, Trưởng tầng, Bác sĩ);
// backend vẫn kiểm người được giao đủ điều kiện.
export function StaffSelectField({ id, value, onChange, invalid, label, errorText, valueKey = 'id', positions = null }) {
  const [staff, setStaff] = useState(null)
  useEffect(() => {
    let live = true
    getStaff({ query: { status: 'WORKING' } })
      .then(({ data }) => live && setStaff(data ?? []))
      .catch(() => live && setStaff([]))
    return () => {
      live = false
    }
  }, [])
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        className="h-11 w-full rounded-md border border-input bg-transparent px-3"
      >
        <option value="">{staff === null ? 'Đang tải danh sách nhân viên' : 'Chưa chọn'}</option>
        {(staff ?? [])
          .filter((s) => s[valueKey] != null)
          .filter((s) => !positions || positions.includes(s.position))
          .map((s) => (
            <option key={s.id} value={String(s[valueKey])}>
              {s.position ? `${s.fullName} (${s.position})` : s.fullName}
            </option>
          ))}
      </select>
      {invalid && <FieldError>{errorText}</FieldError>}
    </Field>
  )
}
