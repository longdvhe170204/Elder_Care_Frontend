import { useEffect, useState } from 'react'
import { ChevronDown, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/common/StatusBadge'
import { cn } from '@/lib/utils'
import { CareField, CareCheck } from './CareField'
import { CARE_ROLES, FREQUENCIES, IMPORTANCE, RESULT_TYPES, frequencyText } from './carePlanLabels'

// Q-447, thiết kế Figma "Kế hoạch chăm sóc · Mục công việc": mỗi mục là một thẻ, chỉ mở mục đang sửa; tần suất và
// mốc giờ nhập dạng chip; mục tiêu nước chỉ với loại Hỗ trợ uống nước. Mức quan trọng không chọn trên form, lấy theo
// mức mặc định của loại công việc trong danh mục (chủ dự án 2026-11-26); mức vẫn quyết định nhắc, cảnh báo khi quá hạn.
// Chủ dự án 2026-11-26: form chỉ còn hai tần suất; "mỗi N giờ", "một lần mỗi ca" diễn đạt bằng các mốc giờ của "Số lần
// trong ngày". Mục cũ đang dùng hai tần suất đó giữ nguyên tới khi người soạn chọn tần suất mới. Khung trước, khung sau
// không nhập trên form: lấy theo mục (đã đóng băng khi gửi), loại công việc rồi cấu hình chung CFG-M04-02.
const FORM_FREQUENCIES = { TIMES_PER_DAY: FREQUENCIES.TIMES_PER_DAY, DAYS_OF_WEEK: FREQUENCIES.DAYS_OF_WEEK }
const DAY_NAMES = { 1: 'Thứ 2', 2: 'Thứ 3', 3: 'Thứ 4', 4: 'Thứ 5', 5: 'Thứ 6', 6: 'Thứ 7', 7: 'Chủ nhật' }
const hhmm = (value) => (value ? String(value).slice(0, 5) : '')
function legacyText(row) {
  if (row.frequencyType === 'EVERY_N_HOURS')
    return `Mỗi ${row.intervalHours} giờ${row.startsAt ? `, bắt đầu ${hhmm(row.startsAt)}` : ''}`
  if (row.frequencyType === 'ONCE_PER_SHIFT') return 'Một lần mỗi ca'
  return null
}
function summaryOf(row) {
  const times = (row.times ?? []).join(', ')
  if (!times) return null
  if (row.frequencyType === 'TIMES_PER_DAY') return `Làm ${row.times.length} lần mỗi ngày lúc ${times}.`
  if (row.frequencyType === 'DAYS_OF_WEEK' && (row.weekdays ?? []).length > 0)
    return `Làm ${[...row.weekdays].sort().map((day) => DAY_NAMES[day]).join(', ')} lúc ${times}.`
  return null
}
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
  if (['TIMES_PER_DAY', 'DAYS_OF_WEEK'].includes(row.frequencyType) && (row.times ?? []).length === 0)
    errors.times = 'Thêm ít nhất một mốc giờ.'
  if (row.frequencyType === 'DAYS_OF_WEEK' && (row.weekdays ?? []).length === 0) errors.weekdays = 'Chọn ngày trong tuần.'
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

function TimeChips({ index, times, onChange, error }) {
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
      <span className="type-caption text-muted-foreground">Mỗi mốc giờ là một lần làm. Mỗi giờ chỉ thêm một lần.</span>
      {error && <p className="type-body-sm text-destructive">{error}</p>}
    </div>
  )
}

function ItemSummary({ index, row, typeName, importance, onOpen }) {
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
      {importance && <StatusBadge status={IMPORTANCE[importance]} />}
      <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
    </button>
  )
}

// leading: lệnh đặt đầu thanh dưới cố định (vd. "Bỏ bản sửa" của panel, thiết kế Figma)
// onDirtyChange: báo khi các mục khác lúc mở (chưa lưu), để hỏi trước khi đóng hộp thoại
export function CarePlanItemsForm({ items, taskTypes, busy, onSave, onSubmitForApproval, leading, onDirtyChange }) {
  // Backend trả giờ dạng HH:mm:ss; chip và lần gửi dùng HH:mm để so trùng đúng
  const [rows, setRows] = useState(() =>
    items.map((row) => ({ ...row, times: (row.times ?? []).map((at) => String(at).slice(0, 5)) })),
  )
  const [errors, setErrors] = useState([])
  const [open, setOpen] = useState(0)
  const [initial] = useState(() => JSON.stringify(rows))
  const dirty = JSON.stringify(rows) !== initial
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])
  const typeById = Object.fromEntries(taskTypes.map((type) => [String(type.id), type]))
  const errorOf = (index, key) => errors[index]?.[key]
  // Mức luôn theo loại công việc, kể cả mục lập từ trước khi bỏ ô chọn (chủ dự án 2026-11-26)
  // Khung giờ được làm: của mục (đã đóng băng khi gửi) rồi của loại công việc; không có thì cấu hình chung
  const windowText = (row) => {
    const type = typeById[String(row.taskTypeId)]
    const before = row.windowBeforeMinutes ?? type?.windowBeforeMinutes
    const after = row.windowAfterMinutes ?? type?.windowAfterMinutes
    return before != null && after != null
      ? `Được làm từ ${before} phút trước đến ${after} phút sau giờ hẹn.`
      : 'Được làm trong khoảng thời gian quanh giờ hẹn theo cấu hình chung của viện.'
  }
  const importanceOf = (row) => typeById[String(row.taskTypeId)]?.defaultImportance || row.importance || null
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
              // Đổi loại thì khung giờ lấy lại theo loại mới
              windowBeforeMinutes: null,
              windowAfterMinutes: null,
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
        importance: importanceOf(row),
        // Số lần trong ngày lấy theo số mốc giờ
        ...(row.frequencyType === 'TIMES_PER_DAY' && { timesPerDay: (row.times ?? []).length }),
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
          return (
            <ItemSummary
              key={key}
              index={index}
              row={row}
              typeName={typeName}
              importance={importanceOf(row)}
              onOpen={() => setOpen(index)}
            />
          )
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
              options={FORM_FREQUENCIES}
              value={kind}
              onChange={(value) => set(index, 'frequencyType', value)}
              error={errorOf(index, 'frequencyType')}
            />
            {legacyText(row) && (
              <p className="type-body-sm text-muted-foreground">
                Tần suất cũ: {legacyText(row)}. Chọn tần suất mới nếu muốn đổi.
              </p>
            )}
            {(kind === 'TIMES_PER_DAY' || kind === 'DAYS_OF_WEEK') && (
              <TimeChips
                index={index}
                times={row.times ?? []}
                onChange={(value) => set(index, 'times', value)}
                error={errorOf(index, 'times')}
              />
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
                {errorOf(index, 'weekdays') && (
                  <p className="w-full type-body-sm text-destructive">{errorOf(index, 'weekdays')}</p>
                )}
              </fieldset>
            )}
            {summaryOf(row) && <p className="type-body-sm font-semibold text-primary">{summaryOf(row)}</p>}
            <p className="type-body-sm text-muted-foreground">{windowText(row)}</p>
            <div className="grid gap-4 sm:grid-cols-2">
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
                {importanceOf(row) ? (
                  <StatusBadge status={IMPORTANCE[importanceOf(row)]} className="self-start" />
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
