import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { AllergyNote } from '@/common/CareNotes'
import { ResidentAvatar } from '@/common/ResidentAvatar'
import { cn } from '@/lib/utils'
import { POSTPONE } from './doseRoundView'
import { DoseTags } from './DoseTags'
import { isNumber, measurementLabel, measurementUnit } from './measurements'
import { minutes, windowOf } from './medicationTime'

// Khung xác nhận liều (DESIGN.md 7.2 detail-panel, form ghi nhận; spec 006 FR-021, FR-026, FR-029 → FR-032, FR-044).
// Mỗi liều chọn kết quả riêng và lưu thành bản ghi riêng; mỗi liều chỉ xác nhận một lần (BR-M07-12).
// Bản mẫu: kiểm tra trên màn chỉ để hiện lỗi tại ô; kiểm tra thật (giấy phép, phân công, trực tuyến) do backend.

const RESULTS = ['Đã dùng', POSTPONE, 'Tạm giữ 1 liều', 'Từ chối', 'Không thực hiện']
const OPEN = ['Đến giờ', 'Trễ']
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

const CLINICAL_RANGES = {
  BLOOD_PRESSURE: { min: 90, max: 160, unit: 'mmHg', name: 'Huyết áp tâm thu' },
  PULSE: { min: 55, max: 105, unit: 'nhịp/phút', name: 'Nhịp tim' },
  BLOOD_SUGAR: { min: 4.0, max: 11.1, unit: 'mmol/L', name: 'Đường huyết' },
  SPO2: { min: 92, max: 100, unit: '%', name: 'SpO2' },
  TEMPERATURE: { min: 36.0, max: 37.8, unit: '°C', name: 'Thân nhiệt' },
}

const REASON_PRESETS = {
  'Tạm giữ 1 liều': [
    'Chỉ số sinh tồn bất thường trước dùng thuốc',
    'Người cao tuổi nôn trớ sau ăn',
    'Người cao tuổi lơ mơ, khó nuốt',
  ],
  'Từ chối': [
    'Người cao tuổi mệt không muốn uống',
    'Người cao tuổi sợ thuốc / kêu đắng',
    'Gia đình yêu cầu tạm dừng chờ hỏi bác sĩ',
  ],
  [POSTPONE]: [
    'Người cao tuổi đang ngủ say',
    'Đang đi khám ngoại viện',
    'Chờ hoàn thành thủ thuật y tế',
  ],
  'Không thực hiện': [
    'Hết thuốc chưa kịp nhận',
    'Người cao tuổi đã xuất viện',
    'Người cao tuổi chuyển viện cấp cứu',
  ],
}

function checkMeasurementWarnings(dose, measure = {}) {
  const warnings = []
  const conditions = dose.measurementConditions ?? []
  for (const code of dose.measurements ?? []) {
    const rawVal = measure[code]
    if (rawVal == null || rawVal === '' || !isNumber(rawVal)) continue
    const val = Number(rawVal)
    const custom = conditions.find((c) => c.metric === code)
    if (custom) {
      if ((custom.minValue != null && val < custom.minValue) || (custom.maxValue != null && val > custom.maxValue)) {
        warnings.push({
          code,
          name: measurementLabel(code),
          val,
          unit: measurementUnit(code),
          min: custom.minValue,
          max: custom.maxValue,
          instruction: custom.holdInstruction || 'Chỉ số bất thường so với đơn chỉ định.',
        })
      }
    } else {
      const std = CLINICAL_RANGES[code]
      if (std && (val < std.min || val > std.max)) {
        warnings.push({
          code,
          name: std.name || measurementLabel(code),
          val,
          unit: std.unit || measurementUnit(code),
          min: std.min,
          max: std.max,
          instruction: 'Chỉ số sinh tồn ngoài khoảng an toàn lâm sàng thông thường.',
        })
      }
    }
  }
  return warnings
}

function errorsOf(dose, entry, now) {
  if (!entry.result) return {}
  const e = {}
  if (entry.result === 'Đã dùng') {
    if (!HHMM.test(entry.time) || entry.time > now) e.time = `Nhập giờ dạng HH:mm, không sau ${now}`
    // BR-M07-26: đơn yêu cầu đo chỉ số trước khi dùng thì phải nhập đủ mới ghi được Đã dùng
    const missing = (dose.measurements ?? []).filter((code) => !isNumber(entry.measure?.[code]))
    if (missing.length > 0) e.measure = `Nhập chỉ số đo trước khi dùng: ${missing.map(measurementLabel).join(', ')}`
  } else if (!entry.reason.trim()) {
    e.reason =
      entry.result === 'Từ chối'
        ? 'Nhập lý do người cao tuổi từ chối'
        : entry.result === POSTPONE
          ? 'Nhập lý do hoãn có chủ đích'
          : entry.result === 'Tạm giữ 1 liều'
            ? 'Nhập lý do tạm giữ liều (chỉ số bất thường)'
            : 'Nhập lý do không thực hiện'
  }
  return e
}

function DoseForm({ dose, entry, onChange, errors }) {
  const late =
    entry.result === 'Đã dùng' &&
    HHMM.test(entry.time) &&
    minutes(entry.time) > minutes(dose.to ?? windowOf(dose.time).to)
  const warnings = checkMeasurementWarnings(dose, entry.measure)
  return (
    <fieldset className="flex flex-col gap-3.5 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <legend className="sr-only">
        {dose.drug}, {dose.dose}
      </legend>
      <div className="flex flex-col gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-800/40">
        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
          {dose.drug} — <span className="text-[#24496f] dark:text-sky-300">{dose.dose}</span> ({dose.route})
        </span>
        <DoseTags dose={dose} />
        {dose.postponed && (
          <span className="type-caption text-amber-700 font-medium">Đã hoãn: {dose.postponedReason}. Hoãn không đổi mốc Bỏ lỡ.</span>
        )}
      </div>
      <ToggleGroup
        variant="outline"
        value={entry.result ? [entry.result] : []}
        onValueChange={(n) => onChange({ result: n[0] ?? '' })}
        className="grid w-full grid-cols-2"
        aria-label={`Kết quả liều ${dose.drug}`}
      >
        {RESULTS.map((r) => (
          <ToggleGroupItem key={r} value={r} className="h-auto min-h-11 whitespace-normal px-2 py-1.5 text-center leading-tight">
            {r}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {entry.result === 'Đã dùng' && (
        <>
          {/* FR-044, Q-393: hiện các lô Được sử dụng kèm hạn, không chọn lô, không đề xuất lô (Q-307) */}
          {dose.source === 'Gia đình gửi' && (
            <Field>
              <FieldLabel>Lô thuốc gia đình gửi được sử dụng</FieldLabel>
              <ul className="flex flex-col gap-1">
                {dose.lots.map((l) => (
                  <li key={l.code} className="flex justify-between rounded-md border px-3 py-2">
                    <span className="type-label">{l.code}</span>
                    <span
                      className={cn('type-caption', l.expired ? 'text-warning-foreground' : 'text-muted-foreground')}
                    >
                      Hạn {l.expiry}
                      {l.expired && ', hết hạn dùng'}
                    </span>
                  </li>
                ))}
              </ul>
              <FieldDescription>Xác nhận liều không chọn lô và không trừ số lượng.</FieldDescription>
            </Field>
          )}
          <Field data-invalid={(errors.time && true) || undefined}>
            <FieldLabel htmlFor={`time-${dose.id}`}>Thời điểm dùng</FieldLabel>
            <Input
              id={`time-${dose.id}`}
              inputMode="numeric"
              value={entry.time}
              onChange={(e) => onChange({ time: e.target.value })}
              aria-invalid={(errors.time && true) || undefined}
              className="h-11 w-32 tabular-nums"
            />
            {errors.time ? (
              <FieldError>{errors.time}</FieldError>
            ) : (
              <FieldDescription>
                {late ? 'Sau cửa sổ: liều được ghi "đã dùng muộn" kèm giờ thực tế.' : 'Giờ 24h, không sau thời điểm ghi.'}
              </FieldDescription>
            )}
          </Field>
          {(dose.measurements ?? []).length > 0 && (
            <Field data-invalid={(errors.measure && true) || undefined}>
              <FieldLabel>Chỉ số đo trước khi dùng</FieldLabel>
              <div className="flex flex-col gap-2">
                {dose.measurements.map((code) => (
                  <div key={code} className="flex flex-wrap items-center gap-2">
                    <label htmlFor={`measure-${dose.id}-${code}`} className="min-w-36 type-body-sm">
                      {measurementLabel(code)}
                    </label>
                    <Input
                      id={`measure-${dose.id}-${code}`}
                      inputMode="decimal"
                      value={entry.measure?.[code] ?? ''}
                      onChange={(e) => onChange({ measure: { ...entry.measure, [code]: e.target.value } })}
                      aria-invalid={(errors.measure && true) || undefined}
                      className="h-11 w-28 shrink-0 tabular-nums"
                    />
                    <span className="type-caption text-muted-foreground">{measurementUnit(code)}</span>
                  </div>
                ))}
              </div>
              {errors.measure ? (
                <FieldError>{errors.measure}</FieldError>
              ) : (
                <FieldDescription>
                  Đơn yêu cầu đo trước khi dùng. Hệ thống không quyết định dùng hay không theo chỉ số; cần thì hoãn và báo Bác sĩ.
                </FieldDescription>
              )}
            </Field>
          )}
          {warnings.length > 0 && (
            <div className="flex flex-col gap-2">
              {warnings.map((w) => (
                <div
                  key={w.code}
                  className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-sm">⚠️</span>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-bold">
                        Cảnh báo an toàn: {w.name} ({w.val} {w.unit}) bất thường
                      </span>
                      <span className="text-[11px] leading-relaxed">
                        Khoảng an toàn: {w.min != null ? w.min : '—'} - {w.max != null ? w.max : '—'} {w.unit}. {w.instruction}
                      </span>
                    </div>
                  </div>
                  {entry.result !== 'Tạm giữ 1 liều' && (
                    <div className="flex justify-end pt-1">
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold shadow-xs"
                        onClick={() =>
                          onChange({
                            result: 'Tạm giữ 1 liều',
                            reason: `Chỉ số ${w.name} bất thường: ${w.val} ${w.unit} (ngưỡng an toàn ${w.min ?? ''}-${w.max ?? ''} ${w.unit})`,
                          })
                        }
                      >
                        Chọn "Tạm giữ 1 liều" ngay
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <Field>
            <FieldLabel htmlFor={`incident-${dose.id}`}>Phân loại sự cố / phản ứng (nếu có)</FieldLabel>
            <select
              id={`incident-${dose.id}`}
              value={entry.incidentType ?? ''}
              onChange={(e) => onChange({ incidentType: e.target.value })}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Không có sự cố</option>
              <option value="Phản ứng bất lợi">Phản ứng bất lợi</option>
              <option value="Nhầm thuốc">Nhầm thuốc</option>
              <option value="Nhầm liều">Nhầm liều</option>
              <option value="Nhầm thời điểm">Nhầm thời điểm</option>
              <option value="Khác">Sự cố khác</option>
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor={`reaction-${dose.id}`}>Phản ứng sau dùng / Chi tiết sự cố</FieldLabel>
            <Textarea
              id={`reaction-${dose.id}`}
              rows={2}
              value={entry.reaction}
              onChange={(e) =>
                onChange({
                  reaction: entry.incidentType && !e.target.value.startsWith('[') ? e.target.value : e.target.value,
                })
              }
            />
            <FieldDescription>
              Không bắt buộc. Có ghi phản ứng thì hệ thống tạo cảnh báo cho người phụ trách.
            </FieldDescription>
          </Field>
        </>
      )}

      {(entry.result === 'Từ chối' ||
        entry.result === 'Không thực hiện' ||
        entry.result === POSTPONE ||
        entry.result === 'Tạm giữ 1 liều') && (
          <Field data-invalid={(errors.reason && true) || undefined}>
            <FieldLabel htmlFor={`reason-${dose.id}`}>Lý do</FieldLabel>
            {REASON_PRESETS[entry.result] && (
              <div className="flex flex-wrap items-center gap-1.5 pb-1">
                <span className="text-[11px] text-muted-foreground font-medium">Gợi ý nhanh:</span>
                {REASON_PRESETS[entry.result].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => onChange({ reason: preset })}
                    className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            )}
            <Textarea
              id={`reason-${dose.id}`}
              rows={2}
              value={entry.reason}
              onChange={(e) => onChange({ reason: e.target.value })}
              aria-invalid={(errors.reason && true) || undefined}
            />
            {errors.reason && <FieldError>{errors.reason}</FieldError>}
            {entry.result === 'Từ chối' && dose.refusedBefore && (
              <FieldDescription>
                Lần trước người cao tuổi cũng từ chối thuốc này; ghi lần này thì hệ thống tạo cảnh báo.
              </FieldDescription>
            )}
          </Field>
        )}
    </fieldset>
  )
}

function SheetBody({ group, now, onSave }) {
  const open = group.doses.filter((d) => OPEN.includes(d.status))
  const [entries, setEntries] = useState(() =>
    Object.fromEntries(
      open.map((d) => [d.id, { result: '', time: now, reaction: '', reason: '', measure: {}, key: crypto.randomUUID() }]),
    ),
  )
  const [submitted, setSubmitted] = useState(false)
  const errors = Object.fromEntries(open.map((d) => [d.id, errorsOf(d, entries[d.id], now)]))
  const decided = open.filter((d) => entries[d.id].result)
  const noneDecided = decided.length === 0
  const r = group.resident

  function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    if (noneDecided || decided.some((d) => Object.keys(errors[d.id]).length)) return
    onSave(decided.map((d) => ({ dose: d, ...entries[d.id] })))
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetHeader className="gap-3 pt-6">
        {/* Ảnh nhận diện để xác định đúng người trước khi cho dùng (DESIGN.md mục 2) */}
        <div className="flex items-center gap-3">
          <div className="flex shrink-0 flex-col items-center gap-1">
            <ResidentAvatar name={r.name} code={r.code} initials={r.initials} className="size-16 type-title" />
            {!r.photo && <span className="type-caption text-muted-foreground">Chưa có ảnh</span>}
          </div>
          <div className="flex flex-col gap-0.5">
            <SheetTitle className="type-title">{r.name}</SheetTitle>
            <SheetDescription className="tabular-nums">
              {r.room === '—' ? 'Chưa có phòng' : /^phòng\b/i.test(r.room) ? r.room : `Phòng ${r.room}`}, giờ {group.time}, cửa sổ {group.doses[0].from ?? windowOf(group.time).from} →{' '}
              {group.doses[0].to ?? windowOf(group.time).to}
            </SheetDescription>
          </div>
        </div>
        <AllergyNote allergies={r.allergies} />
      </SheetHeader>
      <div className="flex flex-col gap-3 overflow-y-auto px-4">
        {open.map((d) => (
          <DoseForm
            key={d.id}
            dose={d}
            entry={entries[d.id]}
            errors={submitted ? errors[d.id] : {}}
            onChange={(patch) => setEntries({ ...entries, [d.id]: { ...entries[d.id], ...patch } })}
          />
        ))}
        {submitted && noneDecided && <FieldError>Chọn kết quả cho ít nhất một liều</FieldError>}
      </div>
      <SheetFooter>
        <Button type="submit" className="h-11">
          {decided.length > 1 ? `Lưu xác nhận ${decided.length} liều` : 'Lưu xác nhận'}
        </Button>
      </SheetFooter>
    </form>
  )
}

export function DoseSheet({ group, now, onOpenChange, onSave }) {
  return (
    <Sheet open={!!group} onOpenChange={onOpenChange}>
      <SheetContent>{group && <SheetBody key={group.key} group={group} now={now} onSave={onSave} />}</SheetContent>
    </Sheet>
  )
}
