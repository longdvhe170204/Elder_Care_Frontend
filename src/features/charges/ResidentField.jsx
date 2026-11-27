import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { ResidentCombobox } from '@/common/ResidentCombobox'
import { residentLabel } from './useResidentDirectory'

// Ô chọn người cao tuổi theo tên (demo 2026-11-25); residents từ useResidentDirectory. Không đọc được danh sách thì quay về
// ô nhập mã với nhãn cũ (fallbackLabel) như trước.
export function ResidentField({ label, fallbackLabel, residents, value, onChange, required = false, disabled }) {
  const id = useId()
  if (residents !== null && residents.length === 0) {
    return (
      <label className="type-body-sm">
        {fallbackLabel}
        <Input
          type="number"
          min="1"
          required={required}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    )
  }
  // Demo 2026-11-26: ô tìm theo tên hoặc mã hồ sơ (ResidentCombobox) thay dropdown; ô lọc không bắt buộc để trống là
  // tất cả
  return (
    <ResidentCombobox
      id={id}
      label={label}
      options={(residents ?? []).map((r) => ({ value: String(r.id), label: residentLabel(residents, r.id) }))}
      value={value}
      onChange={onChange}
      loading={residents === null}
      disabled={disabled}
      placeholder={required ? 'Gõ tên hoặc mã hồ sơ để tìm' : 'Tất cả (gõ tên hoặc mã hồ sơ để lọc)'}
    />
  )
}
