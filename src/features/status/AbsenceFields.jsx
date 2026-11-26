import { useEffect, useState } from 'react'
import { getResidentsByResidentIdPickupList, getResidentsByResidentIdPickupRecords } from '@/api'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { formatDateTime } from '@/common/dateTime'
import { useHandoverStaff } from '@/common/useHandoverStaff'
import { ABSENCE_TYPES } from '../admissions/admissionLabels'

// Chi tiết của lệnh Cho tạm vắng (004 FR-048, details của api-001 grant-temporary-absence; test BF-12 2026-11-24): loại
// vắng, dự kiến trở lại, bản ghi đón Chưa dùng của 012 (người đón lấy từ bản ghi), nhân viên bàn giao, có mang thuốc.
// Bản ghi đón theo ngoại lệ không có hồ sơ người thân nên 004 chưa nhận được người đón (team-plan mục 8, dòng chờ 004).

const SELECT = 'h-11 w-full rounded-md border border-input bg-transparent px-3'
// Loại vắng phải qua quy trình đón (FR-021: mọi loại trừ Bệnh viện, Bệnh viện đi qua Chuyển viện)
const TYPES = ['HOME_VISIT', 'FAMILY_OUTING', 'SAME_DAY_MEDICAL_VISIT', 'OTHER']
const PICKUP_TYPES = ['TEMPORARY_ABSENCE', 'FAMILY_OUTING']

export function AbsenceFields({ residentId, value, onChange, errors }) {
  const [records, setRecords] = useState(null)
  const [names, setNames] = useState({})
  const staff = useHandoverStaff()
  const set = (patch) => onChange({ ...value, ...patch })

  useEffect(() => {
    let cancelled = false
    getResidentsByResidentIdPickupRecords({ path: { residentId } })
      .then(({ data }) => {
        if (cancelled) return
        setRecords((data ?? []).filter((r) => r.status === 'UNUSED' && PICKUP_TYPES.includes(r.type)))
      })
      .catch(() => !cancelled && setRecords([]))
    getResidentsByResidentIdPickupList({ path: { residentId } })
      .then(({ data }) => {
        if (!cancelled) setNames(Object.fromEntries((data ?? []).map((p) => [p.familyMemberId, p.fullName])))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [residentId])

  const usable = (records ?? []).filter((r) => r.familyMemberId)
  const exceptionOnly = (records ?? []).length > 0 && usable.length === 0

  function chooseRecord(id) {
    const record = usable.find((r) => String(r.id) === id)
    set({ recordId: id, pickerId: record?.familyMemberId ?? null })
  }

  return (
    <div className="flex flex-col gap-4">
      <Field data-invalid={!!errors.absenceType || undefined}>
        <span className="type-label" id="absence-type-label">
          Loại vắng
        </span>
        <div role="radiogroup" aria-labelledby="absence-type-label" className="grid gap-x-6 sm:grid-cols-2">
          {TYPES.map((t) => (
            <label key={t} htmlFor={`absence-type-${t}`} className="flex min-h-11 items-center gap-2">
              <input
                id={`absence-type-${t}`}
                type="radio"
                name="absence-type"
                value={t}
                checked={value.type === t}
                onChange={() => set({ type: t })}
                className="size-4"
              />
              {ABSENCE_TYPES[t]}
            </label>
          ))}
        </div>
        {errors.absenceType && <FieldError>{errors.absenceType}</FieldError>}
      </Field>

      <Field data-invalid={!!errors.returnAt || undefined}>
        <FieldLabel htmlFor="absence-return-at">Dự kiến trở lại</FieldLabel>
        <Input
          id="absence-return-at"
          type="datetime-local"
          className="h-11"
          value={value.returnAt}
          onChange={(e) => set({ returnAt: e.target.value })}
          aria-invalid={!!errors.returnAt || undefined}
        />
        {errors.returnAt && <FieldError>{errors.returnAt}</FieldError>}
      </Field>

      <Field data-invalid={!!errors.pickupRecord || undefined}>
        <FieldLabel htmlFor="absence-pickup-record">Bản ghi đón</FieldLabel>
        <select
          id="absence-pickup-record"
          value={value.recordId}
          onChange={(e) => chooseRecord(e.target.value)}
          aria-invalid={!!errors.pickupRecord || undefined}
          className={SELECT}
        >
          <option value="">{records === null ? 'Đang tải bản ghi đón' : 'Chọn bản ghi đón chưa dùng'}</option>
          {usable.map((r) => (
            <option key={r.id} value={r.id}>
              {`${formatDateTime(r.at)}, ${names[r.familyMemberId] ?? `người thân mã ${r.familyMemberId}`}`}
            </option>
          ))}
        </select>
        <p className="type-caption text-muted-foreground">
          {exceptionOnly
            ? 'Chỉ có bản ghi đón theo ngoại lệ; lệnh này chưa dùng được bản ghi đó.'
            : 'Ghi đón ở màn Quy trình đón trước; bản ghi dùng được trong 2 giờ.'}
        </p>
        {errors.pickupRecord && <FieldError>{errors.pickupRecord}</FieldError>}
      </Field>

      <Field data-invalid={!!errors.handoverStaff || undefined}>
        <FieldLabel htmlFor="absence-handover-staff">Nhân viên bàn giao</FieldLabel>
        <select
          id="absence-handover-staff"
          value={value.staffId}
          onChange={(e) => set({ staffId: e.target.value })}
          aria-invalid={!!errors.handoverStaff || undefined}
          className={SELECT}
        >
          <option value="">{staff === null ? 'Đang tải danh sách nhân viên' : 'Chọn nhân viên'}</option>
          {(staff ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        {errors.handoverStaff && <FieldError>{errors.handoverStaff}</FieldError>}
      </Field>

      <Field orientation="horizontal">
        <Checkbox
          id="absence-medication"
          checked={value.medication}
          onCheckedChange={(checked) => set({ medication: !!checked })}
        />
        <FieldLabel htmlFor="absence-medication">Có mang thuốc theo</FieldLabel>
      </Field>
    </div>
  )
}
