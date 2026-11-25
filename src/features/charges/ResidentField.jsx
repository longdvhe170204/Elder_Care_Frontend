import { Input } from '@/components/ui/input'
import { controlClass } from './chargeLabels'
import { residentLabel } from './useResidentDirectory'

// Ô chọn người cao tuổi theo tên (demo 2026-11-25); residents từ useResidentDirectory. Không đọc được danh sách thì quay về
// ô nhập mã với nhãn cũ (fallbackLabel) như trước.
export function ResidentField({ label, fallbackLabel, residents, value, onChange, required = false, disabled }) {
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
  return (
    <label className="type-body-sm">
      {label}
      <select
        className={controlClass}
        required={required}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{residents === null ? 'Đang tải…' : required ? 'Chọn người cao tuổi' : 'Tất cả'}</option>
        {(residents ?? []).map((r) => (
          <option key={r.id} value={String(r.id)}>
            {residentLabel(residents, r.id)}
          </option>
        ))}
      </select>
    </label>
  )
}
