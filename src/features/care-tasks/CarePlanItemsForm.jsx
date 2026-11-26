import { useState } from 'react'
import { ChevronDown, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/common/StatusBadge'
import { cn } from '@/lib/utils'
import { CareField, CareCheck } from './CareField'
import { CARE_ROLES, FREQUENCIES, IMPORTANCE, RESULT_TYPES, frequencyText } from './carePlanLabels'

// Q-447, thiết kế Figma "Kế hoạch chăm sóc · Mục công việc": mỗi mục là một thẻ, chỉ mở mục đang sửa; tần suất và
// mốc giờ nhập dạng chip; mục tiêu nước chỉ với loại Hỗ trợ uống nước. Mức quan trọng không chọn trên form, lấy theo
// mức mặc định của loại công việc trong danh mục (chủ dự án 2026-11-26); mức vẫn quyết định nhắc, cảnh báo khi quá hạn.
const PLAN_ROLES = Object.fromEntries(['CAREGIVER', 'NURSING_STAFF', 'DOCTOR'].map((code) => [code, CARE_ROLES[code]]))
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

// Ô bắt buộc kiểm trước khi gửi, báo bằng chữ tại ô thay cho bong bóng của trình duyệt (DESIGN.md 7.4, D14)
const blank = (value) => value == null || String(value).trim() === ''
const belowOne = (value) => blank(value) || Number(value) < 1
function rowErrors(row) {
  const errors = {}
  if (blank(row.taskTypeId)) errors.taskTypeId = 'Chọn loại công việc.'
  if (blank(row.content)) errors.content = 'Nhập nội dung.'
  if (blank(row.frequencyType)) errors.frequencyType = 'Chọn tần suất.'
  if (row.frequencyType === 'EVERY_N_HOURS') {
    if (belowOne(row.intervalHours)) errors.intervalHours = 'Nhập số giờ giữa hai lần.'
    if (blank(row.startsAt)) errors.startsAt = 'Nhập giờ bắt đầu.'
  }
  if (row.frequencyType === 'TIMES_PER_DAY' && belowOne(row.timesPerDay)) errors.timesPerDay = 'Nhập số lần trong ngày.'
  if (blank(row.performerRole)) errors.performerRole = 'Chọn vai trò thực hiện.'
  if (blank(row.resultType)) errors.resultType = 'Chọn kết quả cần ghi.'
  return errors
}
const hasErrors = (e) => Object.values(e ?? {}).some(Boolean)

function Segmented({ label, options, value, onChange, error }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="type-label">{label}</span>
      <div
        role="radiogroup"
        aria-label={label.replace(' *', '')}
        aria-invalid={error ? true : undefined}
        className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg border bg-muted p-1"
      >
        {Object.entries(options).map(([code, text]) => (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={value === code}
            onClick={() => onChange(code)}
            className={cn(
              'min-h-9 rounded-md px-2 type-body-sm font-semibold text-muted-foreground',
              value === code && 'bg-card text-foreground shadow-sm',
            )}
          >
            {text}
          </button>
        ))}
      </div>
      {error && <p className="type-body-sm text-destructive">{error}</p>}
    </div>
  )
}

function TimeChips({ index, times, onChange }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const at = draft.trim()
    if (!TIME.test(at) || times.includes(at)) return
    onChange([...times, at].sort())
    setDraft('')
  }
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="type-label">Các mốc giờ</span>
      <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-lg border border-input bg-background px-2 py-1">
        {times.map((at) => (
          <span key={at} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 type-body-sm tabular-nums">
            {at}
            <button
              type="button"
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label={`Bỏ mốc ${at} mục ${index + 1}`}
              onClick={() => onChange(times.filter((t) => t !== at))}
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          aria-label={`Các mốc giờ mục ${index + 1}`}
          placeholder="HH:mm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          className="h-9 min-w-20 flex-1 bg-transparent px-1 outline-none"
        />
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label={`Thêm mốc giờ mục ${index + 1}`}
          onClick={add}
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </div>
      <span className="type-caption text-muted-foreground">Để trống là làm trong ca. Mỗi giờ chỉ thêm một lần.</span>
    </div>
  )
}

function ItemSummary({ index, row, typeName, onOpen }) {
  const { main } = frequencyText(row)
  return (
    <button
      type="button"
      aria-expanded="false"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block type-card-title">
          Mục {index + 1} · {typeName ?? 'Chưa chọn loại'}
        </span>
        <span className="block truncate type-body-sm text-muted-foreground">
          {[row.content, main].filter(Boolean).join(' · ')}
        </span>
      </span>
      {row.importance && <StatusBadge status={IMPORTANCE[row.importance]} />}
      <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
    </button>
  )
}

// leading: lệnh đặt đầu thanh dưới cố định (vd. "Bỏ bản sửa" của panel, thiết kế Figma)
export function CarePlanItemsForm({ items, taskTypes, busy, onSave, onSubmitForApproval, leading }) {
  // Backend trả giờ dạng HH:mm:ss; chip và lần gửi dùng HH:mm để so trùng đúng
  const [rows, setRows] = useState(() =>
    items.map((row) => ({ ...row, times: (row.times ?? []).map((at) => String(at).slice(0, 5)) })),
  )
  const [errors, setErrors] = useState([])
  const [open, setOpen] = useState(0)
  const typeById = Object.fromEntries(taskTypes.map((type) => [String(type.id), type]))
  const errorOf = (index, key) => errors[index]?.[key]
  const set = (index, key, value) => {
    setRows((all) => all.map((row, i) => (i === index ? { ...row, [key]: value } : row)))
    setErrors((all) => all.map((e, i) => (i === index && e ? { ...e, [key]: undefined } : e)))
  }
  function selectType(index, value) {
    const type = typeById[value]
    setRows((all) =>
      all.map((row, i) =>
        i === index
          ? {
              ...row,
              taskTypeId: Number(value),
              performerRole: type?.defaultRole ?? '',
              resultType: type?.resultType ?? '',
              importance: type?.defaultImportance ?? '',
              billable: type?.billable ?? false,
              waterTargetMl: type?.group === 'DRINKING_ASSISTANCE' ? row.waterTargetMl : null,
            }
          : row,
      ),
    )
    setErrors((all) => all.map((e, i) => (i === index ? {} : e)))
  }
  // Gửi qua nút: "Lưu nháp" là submit của form, "Gửi Bác sĩ duyệt" lưu rồi gửi (Q-447)
  function submit(event, send = onSave) {
    event.preventDefault()
    const found = rows.map(rowErrors)
    setErrors(found)
    const first = found.findIndex(hasErrors)
    if (first >= 0) {
      setOpen(first)
      return
    }
    send(
      rows.map((row) => ({
        ...row,
        taskTypeId: Number(row.taskTypeId),
        times: row.times ?? [],
        weekdays: row.weekdays ?? [],
        ...Object.fromEntries(
          ['intervalHours', 'timesPerDay', 'windowBeforeMinutes', 'windowAfterMinutes', 'waterTargetMl'].map((key) => [
            key,
            row[key] === '' || row[key] == null ? null : Number(row[key]),
          ]),
        ),
        startsAt: row.startsAt || null,
        importance: row.importance || typeById[String(row.taskTypeId)]?.defaultImportance || null,
      })),
    )
  }
  function addRow() {
    setRows((all) => [
      ...all,
      {
        taskTypeId: '',
        content: '',
        frequencyType: '',
        performerRole: '',
        resultType: '',
        importance: '',
        times: [],
        weekdays: [],
        billable: false,
      },
    ])
    setOpen(rows.length)
  }
  function removeRow(index) {
    setRows((all) => all.filter((_, i) => i !== index))
    setErrors((all) => all.filter((_, i) => i !== index))
    setOpen(0)
  }
  const typeOptions = Object.fromEntries(
    taskTypes
      .filter((type) => type.status === 'ACTIVE' && type.group !== 'MEDICATION')
      .map((type) => [type.id, type.name]),
  )
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="type-title">Mục công việc</h3>
        <span className="type-body-sm text-muted-foreground">{rows.length} mục</span>
      </div>
      {rows.map((row, index) => {
        const key = row.id ?? `new-${index}`
        const typeName = typeById[String(row.taskTypeId)]?.name
        if (index !== open && !hasErrors(errors[index])) {
          return <ItemSummary key={key} index={index} row={row} typeName={typeName} onOpen={() => setOpen(index)} />
        }
        const drinking = typeById[String(row.taskTypeId)]?.group === 'DRINKING_ASSISTANCE'
        const kind = row.frequencyType
        return (
          <fieldset key={key} disabled={busy} className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <legend className="type-card-title">Mục {index + 1}</legend>
              <Button type="button" variant="destructive" onClick={() => removeRow(index)}>
                Bỏ mục
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <CareField
                label="Loại công việc *"
                name={`Loại công việc mục ${index + 1}`}
                value={row.taskTypeId}
                onChange={(value) => selectType(index, value)}
                error={errorOf(index, 'taskTypeId')}
                options={typeOptions}
              />
              <CareField
                label="Nội dung *"
                name={`Nội dung mục ${index + 1}`}
                value={row.content}
                onChange={(value) => set(index, 'content', value)}
                type="textarea"
                maxLength={1000}
                hint={`${(row.content ?? '').length}/1000`}
                error={errorOf(index, 'content')}
              />
            </div>
            <Segmented
              label="Tần suất *"
              options={FREQUENCIES}
              value={kind}
              onChange={(value) => set(index, 'frequencyType', value)}
              error={errorOf(index, 'frequencyType')}
            />
            {kind && kind !== 'ONCE_PER_SHIFT' && (
              <div className="grid gap-4 sm:grid-cols-2">
                {kind === 'EVERY_N_HOURS' && (
                  <>
                    <CareField
                      label="Mỗi N giờ *"
                      name={`Mỗi N giờ mục ${index + 1}`}
                      value={row.intervalHours}
                      onChange={(value) => set(index, 'intervalHours', value)}
                      type="number"
                      min={1}
                      error={errorOf(index, 'intervalHours')}
                    />
                    <CareField
                      label="Giờ bắt đầu *"
                      name={`Giờ bắt đầu mục ${index + 1}`}
                      value={row.startsAt}
                      onChange={(value) => set(index, 'startsAt', value)}
                      type="time"
                      error={errorOf(index, 'startsAt')}
                    />
                  </>
                )}
                {kind === 'TIMES_PER_DAY' && (
                  <CareField
                    label="Số lần trong ngày *"
                    name={`Số lần trong ngày mục ${index + 1}`}
                    value={row.timesPerDay}
                    onChange={(value) => set(index, 'timesPerDay', value)}
                    type="number"
                    min={1}
                    error={errorOf(index, 'timesPerDay')}
                  />
                )}
                {kind !== 'EVERY_N_HOURS' && (
                  <TimeChips index={index} times={row.times ?? []} onChange={(value) => set(index, 'times', value)} />
                )}
              </div>
            )}
            {kind === 'DAYS_OF_WEEK' && (
              <fieldset className="flex flex-wrap gap-x-4">
                <legend className="type-label">Ngày trong tuần mục {index + 1}</legend>
                {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                  <CareCheck
                    key={day}
                    label={day === 7 ? 'Chủ nhật' : `Thứ ${day + 1}`}
                    checked={(row.weekdays ?? []).includes(day)}
                    onChange={(checked) =>
                      set(
                        index,
                        'weekdays',
                        checked ? [...(row.weekdays ?? []), day] : row.weekdays.filter((d) => d !== day),
                      )
                    }
                  />
                ))}
              </fieldset>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <CareField
                label="Khung trước (phút)"
                name={`Khung trước mục ${index + 1} (phút)`}
                value={row.windowBeforeMinutes}
                onChange={(value) => set(index, 'windowBeforeMinutes', value)}
                type="number"
                min={0}
                placeholder="Theo cấu hình"
              />
              <CareField
                label="Khung sau (phút)"
                name={`Khung sau mục ${index + 1} (phút)`}
                value={row.windowAfterMinutes}
                onChange={(value) => set(index, 'windowAfterMinutes', value)}
                type="number"
                min={0}
                placeholder="Theo cấu hình"
              />
              <CareField
                label="Vai trò thực hiện *"
                name={`Vai trò thực hiện mục ${index + 1}`}
                value={row.performerRole}
                onChange={(value) => set(index, 'performerRole', value)}
                options={PLAN_ROLES}
                error={errorOf(index, 'performerRole')}
              />
              <CareField
                label="Kết quả cần ghi *"
                name={`Kết quả cần ghi mục ${index + 1}`}
                value={row.resultType}
                onChange={(value) => set(index, 'resultType', value)}
                options={RESULT_TYPES}
                error={errorOf(index, 'resultType')}
              />
            </div>
            <div className="grid items-center gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <span className="type-label">Mức quan trọng theo loại công việc</span>
                {row.importance ? (
                  <StatusBadge status={IMPORTANCE[row.importance]} className="self-start" />
                ) : (
                  <span className="type-body-sm text-muted-foreground">Chọn loại công việc để có mức</span>
                )}
              </div>
              <CareCheck
                label="Có tính phí"
                checked={row.billable ?? false}
                onChange={(value) => set(index, 'billable', value)}
              />
            </div>
            {drinking && (
              <CareField
                label="Mục tiêu nước (ml/ngày)"
                name={`Mục tiêu nước mục ${index + 1} (ml/ngày)`}
                value={row.waterTargetMl}
                onChange={(value) => set(index, 'waterTargetMl', value)}
                type="number"
                min={1}
                hint="Mỗi kế hoạch chỉ đặt một mục tiêu nước."
              />
            )}
          </fieldset>
        )
      })}
      <Button type="button" variant="outline" className="self-start" disabled={busy} onClick={addRow}>
        Thêm mục công việc
      </Button>
      <div className="sticky bottom-0 -mx-6 -mb-5 flex flex-wrap items-center gap-3 border-t bg-card px-6 py-4">
        <div className="mr-auto">{leading}</div>
        <Button type="submit" variant={onSubmitForApproval ? 'outline' : 'default'} disabled={busy}>
          Lưu nháp
        </Button>
        {onSubmitForApproval && (
          <Button type="button" disabled={busy} onClick={(event) => submit(event, onSubmitForApproval)}>
            Gửi Bác sĩ duyệt
          </Button>
        )}
      </div>
    </form>
  )
}
