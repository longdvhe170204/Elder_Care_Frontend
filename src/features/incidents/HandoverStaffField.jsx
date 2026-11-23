import { useEffect, useState } from 'react'
import { getResidentsByResidentIdHandoverStaff } from '@/api'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { StaffSelectField } from '@/common/StaffSelectField'

// Nhân viên bàn giao khi Chuyển viện (từ sự cố hoặc lựa chọn nguy kịch): lệnh Chuyển viện của 001/004 bắt buộc người bàn giao
// (quickstart 007 Q55, 2026-11-12). Có `residentId` thì danh sách là nhân viên đang trong ca ở tầng của người cao tuổi (api-007
// `GET /residents/{residentId}/handover-staff`), không theo ca của người lập lệnh: Bác sĩ trực toàn viện không chung ca với tầng
// nên danh sách nhân viên của 008 (chỉ người cùng ca với người xem) trả rỗng cho họ. Tầng chưa có ai trong ca hoặc không tải
// được thì quay về danh sách của 008 kèm lời giải thích. Không có `residentId` (Giao người xử lý sự cố, dùng `valueKey` mã
// tài khoản) thì giữ nguyên như cũ.
function ShiftStaffSelect({ id, value, onChange, invalid, label, errorText, residentId, valueKey }) {
  const [state, setState] = useState({ status: 'loading', items: [] })
  useEffect(() => {
    let live = true
    getResidentsByResidentIdHandoverStaff({ path: { residentId } }).then(
      ({ data }) => live && setState({ status: data?.length ? 'ready' : 'empty', items: data ?? [] }),
      () => live && setState({ status: 'empty', items: [] }),
    )
    return () => {
      live = false
    }
  }, [residentId])

  if (state.status === 'empty') {
    return (
      <div className="flex flex-col gap-1.5">
        <StaffSelectField
          id={id}
          value={value}
          onChange={onChange}
          invalid={invalid}
          label={label}
          errorText={errorText}
          valueKey={valueKey}
        />
        <p className="type-caption text-muted-foreground">
          Chưa có nhân viên nào đang trong ca ở tầng của người cao tuổi nên hiện danh sách theo ca của bạn.
        </p>
      </div>
    )
  }
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
        <option value="">{state.status === 'loading' ? 'Đang tải danh sách nhân viên' : 'Chưa chọn'}</option>
        {state.items.map((s) => (
          <option key={s.id} value={String(s.id)}>
            {s.position ? `${s.fullName} (${s.position})` : s.fullName}
          </option>
        ))}
      </select>
      {invalid ? (
        <FieldError>{errorText}</FieldError>
      ) : (
        <FieldDescription>Nhân viên đang trong ca ở tầng của người cao tuổi.</FieldDescription>
      )}
    </Field>
  )
}

export function HandoverStaffField({
  label = 'Nhân viên bàn giao',
  errorText = 'Chọn nhân viên bàn giao',
  residentId = null,
  ...rest
}) {
  if (residentId != null && (rest.valueKey ?? 'id') === 'id') {
    return <ShiftStaffSelect label={label} errorText={errorText} residentId={residentId} {...rest} />
  }
  return <StaffSelectField label={label} errorText={errorText} {...rest} />
}
