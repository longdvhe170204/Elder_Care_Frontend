import { FieldError, FieldLegend, FieldSet } from '@/components/ui/field'
import { CONSENT_METHOD_LABELS } from './accountLabels'
import { StaffField } from '@/common/StaffField'

// Xác nhận của chính người cao tuổi (ResidentConsent; FR-067 tạo, FR-073 mở khóa): yêu cầu hay đồng ý, nói trực tiếp
// với nhân viên nào. Mã hồ sơ nhân viên gõ tay vì /me chưa có mã hồ sơ nhân viên của người đang thao tác.

export function ResidentConsentFields({ idPrefix, consent, onChange, errors }) {
  return (
    <>
      <FieldSet data-invalid={!!errors.method || undefined}>
        <FieldLegend variant="label">Người cao tuổi đã</FieldLegend>
        <div className="flex flex-wrap gap-4">
          {Object.entries(CONSENT_METHOD_LABELS).map(([code, label]) => (
            <label key={code} className="flex min-h-11 items-center gap-2 type-body-sm">
              <input
                type="radio"
                name={`${idPrefix}-method`}
                value={code}
                checked={consent.method === code}
                onChange={() => onChange({ ...consent, method: code })}
                className="size-4 accent-primary"
              />
              {label}
            </label>
          ))}
        </div>
        {errors.method && <FieldError>{errors.method}</FieldError>}
      </FieldSet>
      <StaffField
        id={`${idPrefix}-staff`}
        label="Nhân viên đã nghe"
        fallbackLabel="Mã hồ sơ nhân viên đã nghe"
        value={consent.staffId}
        onChange={(staffId) => onChange({ ...consent, staffId })}
        error={errors.staffId}
        hint="Người cao tuổi nói trực tiếp với nhân viên này."
      />
    </>
  )
}
