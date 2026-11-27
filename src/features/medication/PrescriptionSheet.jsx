import { useRef, useState } from 'react'
import { FileText, ShieldAlert, Trash2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { AllergyNote } from '@/common/CareNotes'
import { ProblemAlert } from '@/common/ProblemAlert'
import { problemOf } from '@/common/problem'
import { cn } from '@/lib/utils'
import { todayVN } from './doseRound'
import { IssueConfirmations } from './IssueConfirmations'
import { MEASUREMENTS } from './measurements'
import { checkPrescription, createPrescription, createPrescriptionBatch, idempotencyKeys } from './prescriptions'
import { DAY_LABELS, newPrescriptionBody, parseSlots } from './prescriptionView'

// Khung Nhập đơn thuốc (spec 006 User Story 1; FR-004 → FR-008): chọn thuốc từ danh mục, kiểm tra trùng hoạt chất và
// dị ứng do backend tính (POST .../prescriptions/check hoặc 409 ISSUES_REQUIRE_CONFIRMATION), vấn đề phải có lý do
// xác nhận mới lưu (BR-M07-06). Bác sĩ kê đơn nội bộ hoặc bên ngoài; Điều dưỡng chỉ nhập đơn bên ngoài (BR-M07-05).

const select = 'h-11 rounded-md border bg-background px-3 text-sm'
const ROUTE_OPTIONS = ['Uống', 'Tiêm', 'Dùng ngoài da', 'Đường hô hấp']
const TIMED_SLOT_PRESETS = ['11:30, 20:30', '08:00', '08:00, 20:00', '08:00, 11:30, 20:30']

export function PrescriptionSheet({ open, onOpenChange, ...props }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-xl md:max-w-2xl">
        {open && <PrescriptionForm onOpenChange={onOpenChange} {...props} />}
      </SheetContent>
    </Sheet>
  )
}

// onCollect (phiếu đối chiếu, 006 T072): trả thân đơn cho dòng Thay đổi liều, Thêm mới thay vì gọi POST …/prescriptions
function emptyLine(med) {
  return {
    medicationId: med?.id ?? '',
    dosage: '1',
    route: med?.defaultRoute || 'Uống',
    prescriptionType: 'PERIODIC',
    frequencyType: 'TIMED_SLOTS',
    timedSlots: '08:00',
    daysOfWeek: [],
    everyNHours: '8',
    firstSlot: '08:00',
    minIntervalMinutes: '240',
    maxDosesPer24h: '3',
    startedDate: todayVN(),
    endedAt: '',
    instructionNote: '',
    timeCriticality: 'NORMAL',
    requiredMeasurements: [],
    measurementConditions: {},
    chronicDisease: false,
    indication: '',
  }
}

function findInitialMed(usable, medicationName) {
  if (!medicationName) return usable[0]
  const q = medicationName.trim().toLowerCase()
  return (
    usable.find((m) => m.name?.toLowerCase() === q) ??
    usable.find((m) => m.name?.toLowerCase().includes(q) || q.includes(m.name?.toLowerCase())) ??
    usable[0]
  )
}

function PrescriptionForm({ onOpenChange, residentId, resident, medications, isDoctor, onSaved, onCollect, prefill }) {
  const usable = medications.filter((m) => m.active !== false)
  const [medQuery, setMedQuery] = useState('')
  const [lines, setLines] = useState(() => {
    const first = findInitialMed(usable, prefill?.medicationName)
    return first ? [emptyLine(first)] : []
  })
  const [header, setHeader] = useState({
    medicationSource: 'FACILITY',
    prescriberType: prefill?.prescriberType ?? (isDoctor ? 'INTERNAL' : 'EXTERNAL'),
    facilityName: prefill?.facilityName ?? '',
    prescriberName: prefill?.prescriberName ?? '',
    prescribedAt: prefill?.prescribedAt ?? todayVN(),
    confirmations: {},
  })
  const [check, setCheck] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [problem, setProblem] = useState(null)
  const [saving, setSaving] = useState(false)
  const keyFor = useRef(idempotencyKeys()).current
  const set = (patch) => setHeader((h) => ({ ...h, ...patch }))
  const setLine = (idx, patch) => setLines((all) => all.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  const lineForm = (l) => ({
    ...header,
    ...l,
    measurementConditions: (l.requiredMeasurements ?? [])
      .map((code) => {
        const c = l.measurementConditions?.[code]
        if (!c || (!c.minValue && !c.maxValue && !c.holdInstruction?.trim())) return null
        return {
          metric: code,
          ...(c.minValue !== '' && c.minValue != null && { minValue: Number(c.minValue) }),
          ...(c.maxValue !== '' && c.maxValue != null && { maxValue: Number(c.maxValue) }),
          ...(c.holdInstruction?.trim() && { holdInstruction: c.holdInstruction.trim() }),
        }
      })
      .filter(Boolean),
  })

  function invalid() {
    if (lines.length === 0) return 'Chọn ít nhất một thuốc từ danh mục'
    for (let i = 0; i < lines.length; i++) {
      const f = lines[i]
      const prefix = lines.length > 1 ? `Thuốc ${i + 1}: ` : ''
      const med = usable.find((m) => m.id === Number(f.medicationId))
      if (!med) return `${prefix}Chọn thuốc từ danh mục`
      if (header.prescriberType === 'INTERNAL') {
        if (med.specialControl) return `${prefix}Thuốc kiểm soát đặc biệt không được kê trên luồng nội bộ`
        if (med.allowInternalPrescribe === false) return `${prefix}Thuốc ngoài phạm vi kê đơn nội bộ của viện`
        if (!f.indication.trim()) return `${prefix}Đơn nội bộ bắt buộc nhập chẩn đoán / chỉ định lâm sàng`
      }
      if (!(Number(f.dosage) > 0)) return `${prefix}Nhập liều mỗi lần lớn hơn 0`
      if (!f.route.trim()) return `${prefix}Nhập đường dùng`
      if (!f.startedDate) return `${prefix}Chọn ngày bắt đầu`
      if (f.startedDate < todayVN()) return `${prefix}Ngày bắt đầu tối thiểu là ngày hiện tại`
      if (!f.endedAt) return `${prefix}Chọn ngày kết thúc`
      if (f.endedAt < f.startedDate) return `${prefix}Ngày kết thúc không được trước ngày bắt đầu`
      if (header.prescriberType === 'INTERNAL') {
        const diffDays = Math.floor((new Date(f.endedAt) - new Date(f.startedDate)) / 86400000) + 1
        const maxDays = f.chronicDisease ? 90 : 30
        if (diffDays > maxDays) return `${prefix}Thời hạn kê đơn nội bộ tối đa ${maxDays} ngày`
      }
      if (f.prescriptionType === 'PRN') {
        if (!(Number(f.minIntervalMinutes) >= 1) || !(Number(f.maxDosesPer24h) >= 1))
          return `${prefix}Nhập khoảng cách tối thiểu (phút) và số lần tối đa trong 24 giờ, mỗi giá trị từ 1`
        if (!f.indication.trim()) return `${prefix}Nhập chỉ định dùng thuốc khi cần (ví dụ đau, sốt)`
      } else if (f.frequencyType === 'TIMED_SLOTS') {
        if (!parseSlots(f.timedSlots)) return `${prefix}Nhập các mốc giờ dạng HH:mm, cách nhau bằng dấu phẩy`
      } else if (f.frequencyType === 'DAYS_OF_WEEK') {
        if (f.daysOfWeek.length === 0 || !parseSlots(f.timedSlots))
          return `${prefix}Chọn ít nhất một ngày trong tuần và nhập các mốc giờ dạng HH:mm`
      } else if (!(Number(f.everyNHours) >= 1) || !parseSlots(f.firstSlot)) {
        return `${prefix}Nhập số giờ giữa các lần (từ 1) và giờ lần đầu dạng HH:mm`
      }
    }
    if (header.prescriberType === 'EXTERNAL' && (!header.facilityName.trim() || !header.prescriberName.trim() || !header.prescribedAt))
      return 'Đơn bên ngoài bắt buộc nhập cơ sở khám, người kê và ngày kê (BR-M07-05)'
    return ''
  }

  async function runCheck() {
    const message = invalid()
    setErrorMsg(message)
    if (message) return
    setProblem(null)
    try {
      const results = await Promise.all(lines.map((l) => checkPrescription(residentId, newPrescriptionBody(lineForm(l)))))
      setCheck({
        issues: results.flatMap((r) => r.issues),
        reviewItems: results.flatMap((r) => r.reviewItems),
      })
    } catch (error) {
      setProblem(problemOf(error))
    }
  }

  async function submit(event) {
    event.preventDefault()
    const message = invalid()
    setErrorMsg(message)
    if (message) return
    const unconfirmed = (check?.issues ?? []).filter((i) => !header.confirmations[i.issueCode]?.trim())
    if (unconfirmed.length > 0) {
      setErrorMsg(`Còn ${unconfirmed.length} vấn đề chưa có lý do xác nhận (FR-007)`)
      return
    }
    setSaving(true)
    setProblem(null)
    const bodies = lines.map((l) => newPrescriptionBody(lineForm(l)))
    if (onCollect) {
      const med = usable.find((m) => m.id === Number(lines[0].medicationId))
      onCollect(bodies[0], med)
      onOpenChange(false)
      return
    }
    try {
      if (bodies.length === 1) {
        const med = usable.find((m) => m.id === Number(lines[0].medicationId))
        await createPrescription(residentId, bodies[0], keyFor(bodies[0]))
        await onSaved(`Đã lưu đơn ${med?.name ?? ''} cho ${resident.name}.`)
      } else {
        await createPrescriptionBatch(residentId, bodies, keyFor(bodies))
        await onSaved(`Đã lưu đơn gồm ${bodies.length} thuốc cho ${resident.name}.`)
      }
      onOpenChange(false)
    } catch (error) {
      if (error?.problem?.errorCode === 'ISSUES_REQUIRE_CONFIRMATION') {
        setCheck({ issues: error.problem.issues ?? [], reviewItems: check?.reviewItems ?? [] })
        setErrorMsg('Đơn có vấn đề cần lý do xác nhận trước khi lưu (FR-007)')
      } else {
        setProblem(problemOf(error))
      }
      setSaving(false)
    }
  }

  return (
    <>
      <SheetHeader className="border-b pb-4">
        <SheetTitle className="flex items-center gap-2 type-title">
          <FileText className="size-5" aria-hidden="true" />
          {onCollect ? 'Đơn mới cho dòng đối chiếu' : 'Nhập đơn thuốc mới'}
        </SheetTitle>
        <SheetDescription>
          Cho {resident.name}. Hệ thống kiểm tra trùng hoạt chất và dị ứng theo BR-M07-05, BR-M07-06.
        </SheetDescription>
        <AllergyNote allergies={resident.allergies} />
      </SheetHeader>

      <form onSubmit={submit} noValidate className="flex flex-col gap-5 px-4 py-4">
        {errorMsg && (
          <Alert variant="attention">
            <AlertTitle>Chưa lưu được đơn</AlertTitle>
            <AlertDescription>{errorMsg}</AlertDescription>
          </Alert>
        )}
        <ProblemAlert problem={problem} />

        <div className="flex flex-col gap-3 rounded-xl border bg-card p-3.5">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Phần 1: Thông tin chung của đơn thuốc
          </span>
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="medSource">Nguồn thuốc</FieldLabel>
            <select id="medSource" value={header.medicationSource} onChange={(e) => set({ medicationSource: e.target.value })} className={select}>
              <option value="FACILITY">Thuốc của viện</option>
              <option value="FAMILY_SENT">Gia đình gửi</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span className="type-label">Nơi kê đơn</span>
            {onCollect && isDoctor ? (
              <>
                <label className="flex cursor-pointer items-center gap-1.5 type-body-sm">
                  <input type="radio" name="prescriberType" value="INTERNAL" checked={header.prescriberType === 'INTERNAL'} onChange={() => set({ prescriberType: 'INTERNAL' })} />
                  Nội bộ viện
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 type-body-sm">
                  <input type="radio" name="prescriberType" value="EXTERNAL" checked={header.prescriberType === 'EXTERNAL'} onChange={() => set({ prescriberType: 'EXTERNAL' })} />
                  Bên ngoài (theo toa)
                </label>
              </>
            ) : (
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                {isDoctor ? 'Nội bộ viện' : 'Đơn bên ngoài theo toa'}
              </span>
            )}
          </div>
          {!isDoctor && (
            <p className="rounded-md bg-warning px-3 py-2 type-body-sm text-warning-foreground">
              Điều dưỡng chỉ nhập đơn từ cơ sở khám bên ngoài theo toa, không tự kê đơn nội bộ (BR-M07-05, FR-006).
            </p>
          )}
          {header.prescriberType === 'EXTERNAL' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="facName">Cơ sở khám *</FieldLabel>
                <Input id="facName" value={header.facilityName} onChange={(e) => set({ facilityName: e.target.value })} className="h-11" />
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="docName">Người kê đơn *</FieldLabel>
                <Input id="docName" value={header.prescriberName} onChange={(e) => set({ prescriberName: e.target.value })} className="h-11" />
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="prescribedAtInput">Ngày kê *</FieldLabel>
                <Input id="prescribedAtInput" type="date" max={todayVN()} value={header.prescribedAt} onChange={(e) => set({ prescribedAt: e.target.value })} className="h-11" />
              </div>
            </div>
          )}
        </div>

        {!onCollect && (
          <div className="flex flex-col gap-3 rounded-xl border bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Phần 2: Chọn danh sách thuốc trong đơn
              </span>
              <span className="text-xs font-semibold text-primary">Đã chọn {lines.length} thuốc</span>
            </div>
            <Input
              aria-label="Tìm thuốc trong danh mục"
              placeholder="Tìm nhanh theo tên thuốc hoặc hàm lượng..."
              value={medQuery}
              onChange={(e) => setMedQuery(e.target.value)}
              className="h-9 text-xs"
            />
            <div className="flex max-h-44 flex-col divide-y overflow-y-auto rounded-lg border">
              {usable
                .filter((m) => {
                  const q = medQuery.trim().toLowerCase()
                  if (!q) return true
                  return (
                    m.name?.toLowerCase().includes(q) ||
                    m.concentration?.toLowerCase().includes(q) ||
                    m.dosageForm?.toLowerCase().includes(q)
                  )
                })
                .map((m) => {
                  const picked = lines.some((l) => Number(l.medicationId) === m.id)
                  return (
                    <label
                      key={m.id}
                      className={cn(
                        'flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-muted/40',
                        picked && 'bg-primary/5 font-medium',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={picked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setLines((all) => [...all, emptyLine(m)])
                            } else {
                              setLines((all) => all.filter((l) => Number(l.medicationId) !== m.id))
                            }
                            setCheck(null)
                          }}
                        />
                        <span>
                          <strong>{m.name}</strong> ({m.concentration}) · {m.dosageForm}
                        </span>
                      </span>
                      {picked && <span className="text-[11px] font-semibold text-primary">Đã chọn</span>}
                    </label>
                  )
                })}
            </div>
            {lines.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {lines.map((l, i) => {
                  const m = usable.find((x) => x.id === Number(l.medicationId))
                  return (
                    <span
                      key={`${l.medicationId}-${i}`}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                    >
                      #{i + 1} {m?.name ?? 'Thuốc'} {m?.concentration ?? ''}
                      <button
                        type="button"
                        aria-label={`Bỏ ${m?.name ?? 'thuốc'}`}
                        onClick={() => setLines((all) => all.filter((_, idx) => idx !== i))}
                        className="ml-0.5 text-slate-500 hover:text-destructive"
                      >
                        ×
                      </button>
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {onCollect ? 'Phần 2: Chi tiết đơn mới cho dòng đối chiếu' : 'Phần 3: Chi tiết sử dụng cho từng thuốc đã chọn'}
          </span>
        </div>

        {lines.map((line, idx) => {
          const med = usable.find((m) => m.id === Number(line.medicationId))
          const id = (base) => (idx === 0 ? base : `${base}-${idx}`)
          const patchLine = (p) => setLine(idx, p)
          const selectedRouteOption = ROUTE_OPTIONS.includes(line.route) ? line.route : 'OTHER'
          return (
            <div key={idx} className="flex flex-col gap-3 rounded-xl border bg-card p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="type-label">
                  {med ? `Thuốc #${idx + 1}: ${med.name} (${med.concentration} · ${med.dosageForm})` : `Thuốc ${idx + 1}`}
                </span>
                {lines.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setLines((all) => all.filter((_, i) => i !== idx))}
                    className="h-8 gap-1 text-xs text-destructive"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Xóa
                  </Button>
                )}
              </div>

              {onCollect && (
                <div className="flex flex-col gap-1.5">
                  <FieldLabel htmlFor={id('medSelect')}>Thuốc từ danh mục</FieldLabel>
                  <select
                    id={id('medSelect')}
                    value={line.medicationId}
                    onChange={(e) => {
                      const m = usable.find((x) => x.id === Number(e.target.value))
                      patchLine({ medicationId: e.target.value, route: m?.defaultRoute || line.route })
                      setCheck(null)
                    }}
                    className={select}
                  >
                    {usable.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.concentration}), {m.dosageForm}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <FieldLabel htmlFor={id('dosageInput')}>Liều mỗi lần{med?.usageUnit ? ` (${med.usageUnit})` : ''}</FieldLabel>
                  <Input id={id('dosageInput')} type="number" step="0.1" min="0.1" value={line.dosage} onChange={(e) => patchLine({ dosage: e.target.value })} className="h-11" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel htmlFor={id('routeSelect')}>Đường dùng</FieldLabel>
                  <select
                    id={id('routeSelect')}
                    value={selectedRouteOption}
                    onChange={(e) => {
                      const v = e.target.value
                      patchLine({ route: v === 'OTHER' ? '' : v })
                    }}
                    className={select}
                  >
                    {ROUTE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                    <option value="OTHER">Khác (tự nhập)</option>
                  </select>
                  {selectedRouteOption === 'OTHER' && (
                    <Input
                      id={id('routeInput')}
                      aria-label="Nhập đường dùng khác"
                      placeholder="Ví dụ: Nhỏ mắt, Đặt hậu môn..."
                      value={line.route}
                      onChange={(e) => patchLine({ route: e.target.value })}
                      className="h-10"
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <FieldLabel htmlFor={id('startedDateInput')}>Ngày bắt đầu</FieldLabel>
                  <Input id={id('startedDateInput')} type="date" min={todayVN()} value={line.startedDate} onChange={(e) => patchLine({ startedDate: e.target.value })} className="h-11" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel htmlFor={id('endedAtInput')}>Ngày kết thúc</FieldLabel>
                  <Input id={id('endedAtInput')} type="date" min={line.startedDate || todayVN()} value={line.endedAt} onChange={(e) => patchLine({ endedAt: e.target.value })} className="h-11" />
                </div>
              </div>
              {header.prescriberType === 'INTERNAL' && (
                <label className="flex cursor-pointer items-center gap-2 type-body-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(line.chronicDisease)}
                    onChange={(e) => patchLine({ chronicDisease: e.target.checked })}
                  />
                  Điều trị mạn tính / dài ngày (tối đa 90 ngày; mặc định tối đa 30 ngày)
                </label>
              )}

              <div className="flex flex-col gap-3 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="type-label">Loại đơn</span>
                  {[
                    ['PERIODIC', 'Định kỳ'],
                    ['PRN', 'Khi cần (PRN)'],
                  ].map(([value, label]) => (
                    <label key={value} className="flex cursor-pointer items-center gap-1.5 type-body-sm">
                      <input type="radio" name={id('prescType')} value={value} checked={line.prescriptionType === value} onChange={() => patchLine({ prescriptionType: value })} />
                      {label}
                    </label>
                  ))}
                </div>
                {line.prescriptionType === 'PERIODIC' ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <FieldLabel htmlFor={id('freqSelect')}>Kiểu tần suất</FieldLabel>
                      <select id={id('freqSelect')} value={line.frequencyType} onChange={(e) => patchLine({ frequencyType: e.target.value })} className={select}>
                        <option value="TIMED_SLOTS">Các mốc giờ cố định</option>
                        <option value="EVERY_N_HOURS">Mỗi N giờ</option>
                        <option value="DAYS_OF_WEEK">Theo ngày trong tuần</option>
                      </select>
                      {line.frequencyType === 'DAYS_OF_WEEK' && (
                        <fieldset className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
                          <legend className="sr-only">Ngày trong tuần</legend>
                          {Object.entries(DAY_LABELS).map(([day, label]) => (
                            <label key={day} className="flex cursor-pointer items-center gap-1 type-body-sm">
                              <input
                                type="checkbox"
                                checked={line.daysOfWeek.includes(Number(day))}
                                onChange={(e) =>
                                  patchLine({ daysOfWeek: e.target.checked ? [...line.daysOfWeek, Number(day)] : line.daysOfWeek.filter((d) => d !== Number(day)) })
                                }
                              />
                              {label}
                            </label>
                          ))}
                        </fieldset>
                      )}
                    </div>
                    {line.frequencyType !== 'EVERY_N_HOURS' ? (
                      <div className="flex flex-col gap-1.5">
                        <FieldLabel htmlFor={id('timedSlotsInput')}>Các mốc giờ (cách nhau bằng dấu phẩy)</FieldLabel>
                        <select
                          aria-label="Gợi ý mốc giờ"
                          value={TIMED_SLOT_PRESETS.includes(line.timedSlots) ? line.timedSlots : 'OTHER'}
                          onChange={(e) => {
                            const v = e.target.value
                            patchLine({ timedSlots: v === 'OTHER' ? '' : v })
                          }}
                          className={select}
                        >
                          {TIMED_SLOT_PRESETS.map((preset) => (
                            <option key={preset} value={preset}>
                              {preset}
                            </option>
                          ))}
                          <option value="OTHER">Khác (tự điền)</option>
                        </select>
                        <Input id={id('timedSlotsInput')} value={line.timedSlots} onChange={(e) => patchLine({ timedSlots: e.target.value })} placeholder="11:30, 20:30" className="h-10" />
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                          <FieldLabel htmlFor={id('everyNInput')}>Mỗi bao nhiêu giờ</FieldLabel>
                          <Input id={id('everyNInput')} type="number" min="1" value={line.everyNHours} onChange={(e) => patchLine({ everyNHours: e.target.value })} className="h-11" />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <FieldLabel htmlFor={id('firstSlotInput')}>Giờ lần đầu</FieldLabel>
                          <Input id={id('firstSlotInput')} value={line.firstSlot} onChange={(e) => patchLine({ firstSlot: e.target.value })} placeholder="08:00" className="h-11" />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <FieldLabel htmlFor={id('intervalInput')}>Khoảng cách tối thiểu (phút)</FieldLabel>
                      <Input id={id('intervalInput')} type="number" min="1" value={line.minIntervalMinutes} onChange={(e) => patchLine({ minIntervalMinutes: e.target.value })} className="h-11" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <FieldLabel htmlFor={id('max24hInput')}>Số lần tối đa trong 24 giờ</FieldLabel>
                      <Input id={id('max24hInput')} type="number" min="1" value={line.maxDosesPer24h} onChange={(e) => patchLine({ maxDosesPer24h: e.target.value })} className="h-11" />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 rounded-lg border p-3">
                {line.prescriptionType !== 'PRN' && (
                  <>
                    <div className="flex flex-wrap items-center gap-4">
                      <span className="type-label">Mức quan trọng về thời gian</span>
                      {[
                        ['NORMAL', 'Thường'],
                        ['CRITICAL', 'Quan trọng'],
                      ].map(([value, label]) => (
                        <label key={value} className="flex cursor-pointer items-center gap-1.5 type-body-sm">
                          <input type="radio" name={id('timeCriticality')} value={value} checked={line.timeCriticality === value} onChange={() => patchLine({ timeCriticality: value })} />
                          {label}
                        </label>
                      ))}
                    </div>
                    <p className="type-caption text-muted-foreground">
                      Quan trọng (ví dụ insulin, thuốc Parkinson, thuốc chống đông): liều Trễ quá 15 phút là Bỏ lỡ và báo ngay Trưởng tầng, Bác sĩ trực.
                    </p>
                  </>
                )}
                <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <legend className="pb-1 type-label">Chỉ số phải đo trước khi dùng (nếu có)</legend>
                  {MEASUREMENTS.map((m) => (
                    <label key={m.code} className="flex cursor-pointer items-center gap-1.5 type-body-sm">
                      <input
                        type="checkbox"
                        checked={line.requiredMeasurements.includes(m.code)}
                        onChange={(e) =>
                          patchLine({
                            requiredMeasurements: e.target.checked
                              ? [...line.requiredMeasurements, m.code]
                              : line.requiredMeasurements.filter((c) => c !== m.code),
                          })
                        }
                      />
                      {m.label}
                    </label>
                  ))}
                </fieldset>
                {(line.requiredMeasurements ?? []).length > 0 && (
                  <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-2.5">
                    <span className="type-caption font-semibold">Điều kiện chỉ số & hướng dẫn tạm giữ 1 liều (nếu có)</span>
                    {line.requiredMeasurements.map((code) => {
                      const cond = line.measurementConditions?.[code] ?? {}
                      const label = MEASUREMENTS.find((m) => m.code === code)?.label ?? code
                      const patchCond = (p) =>
                        patchLine({
                          measurementConditions: {
                            ...line.measurementConditions,
                            [code]: { ...cond, ...p },
                          },
                        })
                      return (
                        <div key={code} className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_90px_90px_1fr] sm:items-center">
                          <span className="type-body-sm font-medium">{label}</span>
                          <Input
                            type="number"
                            placeholder="Min"
                            aria-label={`${label} tối thiểu`}
                            value={cond.minValue ?? ''}
                            onChange={(e) => patchCond({ minValue: e.target.value })}
                            className="h-9"
                          />
                          <Input
                            type="number"
                            placeholder="Max"
                            aria-label={`${label} tối đa`}
                            value={cond.maxValue ?? ''}
                            onChange={(e) => patchCond({ maxValue: e.target.value })}
                            className="h-9"
                          />
                          <Input
                            placeholder="Hướng dẫn tạm giữ nếu vượt ngưỡng"
                            aria-label={`Hướng dẫn tạm giữ ${label}`}
                            value={cond.holdInstruction ?? ''}
                            onChange={(e) => patchCond({ holdInstruction: e.target.value })}
                            className="h-9"
                          />
                        </div>
                      )
                    })}
                  </div>
                )}
                {(line.prescriptionType === 'PRN' || header.prescriberType === 'INTERNAL') && (
                  <div className="flex flex-col gap-1.5">
                    <FieldLabel htmlFor={id('indicationInput')}>
                      {line.prescriptionType === 'PRN' ? 'Chỉ định dùng thuốc khi cần' : 'Chẩn đoán / Chỉ định lâm sàng'}
                    </FieldLabel>
                    <Input id={id('indicationInput')} value={line.indication} onChange={(e) => patchLine({ indication: e.target.value })} placeholder={line.prescriptionType === 'PRN' ? 'Ví dụ: đau, sốt trên 38,5 °C' : 'Ví dụ: Tăng huyết áp, đái tháo đường'} className="h-11" />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor={id('instNote')}>Ghi chú hướng dẫn dùng thuốc</FieldLabel>
                <Textarea id={id('instNote')} rows={2} value={line.instructionNote} onChange={(e) => patchLine({ instructionNote: e.target.value })} />
              </div>
            </div>
          )
        })}

        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 type-label">
              <ShieldAlert className="size-5" aria-hidden="true" />
              Kiểm tra trùng hoạt chất, dị ứng
            </span>
            <Button type="button" variant="outline" size="sm" onClick={runCheck}>
              Kiểm tra ngay
            </Button>
          </div>
          <IssueConfirmations check={check} reasons={header.confirmations} onReason={(code, text) => set({ confirmations: { ...header.confirmations, [code]: text } })} />
        </div>

        <SheetFooter className="mt-2 flex gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button type="submit" disabled={saving}>
            {onCollect ? 'Ghi đơn vào dòng' : 'Lưu đơn thuốc'}
          </Button>
        </SheetFooter>
      </form>
    </>
  )
}
