import { useEffect, useId, useRef, useState } from 'react'
import { AlertTriangleIcon, ChevronRightIcon } from 'lucide-react'
import { getStaffById, postShiftsByShiftIdCareTasksPlan } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { ProblemAlert } from '@/common/ProblemAlert'
import { formatDate, formatDateTime } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { IMPORTANCE, CARE_ROLES } from './carePlanLabels'
import { BASIS, ERRORS, anyTimeItem, inShift, matchingSources, needsOf, pad, plannedAtOf, shiftTimeOptions, timeOf } from './shiftPlanning'

const SHIFT_LEVEL = ['SHIFT_START_CHECK', 'SUPERVISION']
const isShiftLevel = (type) => SHIFT_LEVEL.includes(type?.group) && type.defaultRole === 'NURSING_STAFF'
const newRow = () => ({ key: crypto.randomUUID(), content: '', mode: 'adHoc' })
const WINDOW_FIELDS = [
  ['windowBeforeMinutes', 'Phút trước giờ dự kiến'],
  ['windowAfterMinutes', 'Phút sau giờ dự kiến'],
]
const hasMinutes = (value) => value != null && value !== ''
const validMinutes = (value) => /^\d+$/.test(value) && Number(value) <= 2_147_483_647

function canEditWindow(row, type) {
  return row.residentId !== 'FLOOR' && row.mode === 'adHoc' && row.importance === 'NORMAL' && type?.resultType === 'PERFORMED'
}

// Một trường của dòng: nhãn bao điều khiển, lỗi hiện ngay dưới trường (DESIGN.md 7.4)
function RowField({ label, error, children, className }) {
  const id = useId()
  return (
    <div className={`flex min-w-0 flex-col gap-2 ${className ?? ''}`}>
      <label htmlFor={id} className="type-label">
        {label}
      </label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? `${id}-error` : undefined,
        className: `h-11 w-full rounded-lg border bg-popover px-3 focus-visible:outline-ring ${
          error ? 'border-destructive bg-destructive-subtle text-destructive' : 'border-input'
        }`,
      })}
      {error && (
        <p id={`${id}-error`} className="type-body-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

function Select({ options, value, onChange, placeholder = 'Chọn…', ...props }) {
  return (
    <select {...props} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(([code, text]) => (
        <option key={code} value={code}>
          {text}
        </option>
      ))}
    </select>
  )
}

const sourceKey = (source) => `${source.type}:${source.id}`
const sourceText = (source) => `${BASIS[source.type] || 'Nguồn khác'} · ${source.description}`

function resolve(row, resident, shift) {
  if (row.mode !== 'source') return { basis: 'AD_HOC' }
  const sources = matchingSources(resident, shift, row.taskTypeId, row.time)
  const selected = sources.find((source) => sourceKey(source) === row.source)
  return { sources, basis: selected ? row.source : '', plan: selected?.item }
}

// Mức quan trọng theo căn cứ (FR-017 sửa 2026-11-23): mục kế hoạch thì lấy mức của mục (Bác sĩ đã duyệt); nguồn khác
// thì lấy mức mặc định của loại công việc; chỉ việc phát sinh (hoặc loại chưa có mức mặc định) người lập mới chọn.
function importanceOf(row, resident, shift, typeById) {
  const fallback = typeById[row.taskTypeId]?.defaultImportance
  const type = typeById[row.taskTypeId]
  if (row.residentId === 'FLOOR') return { value: fallback, from: 'mặc định của loại công việc' }
  const basis = type ? resolve(row, resident, shift) : null
  if (basis?.plan) return { value: basis.plan.importance, from: 'theo mục kế hoạch' }
  const code = basis?.basis
  if (code === 'AD_HOC' || (code && !fallback)) return { choose: true, value: row.importance }
  if (code) return { value: fallback, from: 'mặc định của loại công việc' }
  return { value: null }
}

// Lỗi kiểm ở máy trước khi gửi: thiếu trường thì backend không đọc được lô (400), lệch mục kế hoạch thì bị từ chối
function checkRow(row, resident, shift, typeById) {
  const errors = {}
  const floor = row.residentId === 'FLOOR'
  if (!row.residentId) errors.resident = 'Chọn người cao tuổi.'
  if (!row.taskTypeId) errors.type = 'Chọn loại công việc.'
  if (!row.time) errors.time = 'Nhập giờ dự kiến.'
  else if (!inShift(shift, row.time)) errors.time = `Nhập giờ từ ${timeOf(shift.startsAt)} đến trước ${timeOf(shift.endsAt)}.`
  const level = importanceOf(row, resident, shift, typeById)
  if (level.choose && !level.value) errors.importance = 'Chọn mức quan trọng của việc này.'
  if (!row.performer) errors.performer = 'Chọn người thực hiện hoặc Việc chung của tầng.'
  if (canEditWindow(row, typeById[row.taskTypeId])) {
    for (const [field] of WINDOW_FIELDS) {
      if (hasMinutes(row[field]) && !validMinutes(row[field])) errors[field] = 'Nhập số phút nguyên không âm hợp lệ.'
    }
  }
  if (floor) {
    if (!level.value) errors.type = 'Loại công việc cấp ca chưa có mức quan trọng mặc định.'
    return errors
  }
  if (!row.residentId || !row.taskTypeId || errors.time) return errors
  const found = resolve(row, resident, shift)
  if (!found.basis)
    errors.basis = found.sources?.length
      ? 'Chọn nguồn của công việc.'
      : 'Không có nguồn phù hợp với giờ đã nhập. Kiểm tra lại giờ hoặc chọn công việc phát sinh.'
  return errors
}

function WindowOptions({ row, shift, type, plan, errors, set }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const edit = canEditWindow(row, type)
  const wholeShift = row.residentId === 'FLOOR' || (plan && anyTimeItem(plan))
  const defaults = WINDOW_FIELDS.map(([field]) => plan?.[field] ?? type[field])
  const minutes = WINDOW_FIELDS.map(([field], index) => (edit && hasMinutes(row[field]) ? row[field] : defaults[index]))
  let preview = 'Nhập giờ dự kiến trong ca để xem khung.'
  if (wholeShift) {
    preview = `Khung thực hiện: ${formatDateTime(shift.startsAt)} – ${formatDateTime(shift.endsAt)}`
  } else if (row.time && inShift(shift, row.time)) {
    if (minutes.every(validMinutes)) {
      const at = Date.parse(plannedAtOf(shift, row.time))
      const from = at - Number(minutes[0]) * 60_000
      const to = at + Number(minutes[1]) * 60_000
      preview = `Khung thực hiện: ${formatDateTime(from)} – ${formatDateTime(to)}`
    } else if (minutes.some((value) => hasMinutes(value) && !validMinutes(value))) {
      preview = 'Sửa số phút để xem khung thực hiện.'
    } else {
      preview = 'Hệ thống áp dụng cấu hình khung giờ khi lưu.'
    }
  }
  return (
    <div className="flex flex-col gap-3 md:col-span-3">
      <Button
        type="button"
        variant="outline"
        className="self-start"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        Tùy chọn thời gian nâng cao
      </Button>
      <div id={id} hidden={!open} className={open ? 'grid gap-4 sm:grid-cols-2' : undefined}>
        {open && (
          <>
            <p className="type-body-sm sm:col-span-2">{preview}</p>
            {edit && WINDOW_FIELDS.map(([field, label], index) => (
              <RowField key={field} label={label} error={errors[field]}>
                {(p) => (
                  <input
                    {...p}
                    type="number"
                    min={0}
                    step={1}
                    placeholder={hasMinutes(defaults[index]) ? String(defaults[index]) : undefined}
                    value={row[field] ?? ''}
                    onChange={(event) => set(field)(event.target.value)}
                  />
                )}
              </RowField>
            ))}
            {edit && <p className="type-body-sm text-muted-foreground sm:col-span-2">Để trống để dùng khung mặc định.</p>}
          </>
        )}
      </div>
    </div>
  )
}

// "Lập công việc cho ca": nhập các dòng rồi gửi cả lô; không tự thêm dòng, không điền thay theo nguồn (Q-306, Q-307)
export function ShiftTaskBatchDialog({
  open,
  onOpenChange,
  subtitle,
  shiftPicker,
  shiftId,
  source,
  tasks = [],
  shiftMembers,
  people,
  types,
  rows,
  setRows,
  onSaved,
  onCompare,
}) {
  const [activeKey, setActiveKey] = useState(null)
  const [rowErrors, setRowErrors] = useState([])
  const [checked, setChecked] = useState(false)
  const [failure, setFailure] = useState(null)
  const [busy, setBusy] = useState(false)
  const [staffNames, setStaffNames] = useState({})
  const attempt = useRef(null)
  const summary = useRef(null)
  const shift = source?.shift
  const clock = shift && shiftTimeOptions(shift)
  const residentsById = Object.fromEntries((source?.residents ?? []).map((r) => [String(r.residentId), r]))
  const typeById = Object.fromEntries(types.map((t) => [String(t.id), t]))

  // Tên nhân viên cho ô Phân công: dữ liệu ca chỉ có mã nhân viên
  const staffKey = [
    ...new Set([
      ...shiftMembers.map((m) => m.staffId),
      ...(source?.residents ?? []).flatMap((r) => (r.assignments ?? []).map((a) => a.staffId)),
    ]),
  ]
    .sort((a, b) => a - b)
    .join(',')
  useEffect(() => {
    if (!open || !staffKey) return
    let current = true
    Promise.all(
      staffKey.split(',').map((id) =>
        getStaffById({ path: { id: Number(id) } })
          .then(({ data }) => [id, data.fullName])
          .catch(() => [id, null]),
      ),
    ).then((pairs) => current && setStaffNames(Object.fromEntries(pairs.filter(([, n]) => n))))
    return () => {
      current = false
    }
  }, [open, staffKey])

  const localErrors = (r) => (checked ? checkRow(r, residentsById[r.residentId], shift, typeById) : {})
  const failing = rows
    .map((r, index) => ({ row: index + 1, local: localErrors(r) }))
    .filter((e) => Object.keys(e.local).length)
  useEffect(() => {
    if (rowErrors.length) summary.current?.focus()
  }, [rowErrors])

  const name = (id) => people[id] || `Người cao tuổi · mã ${id}`
  const staffName = (a) =>
    [staffNames[a.staffId] || a.fullName || `Nhân viên · mã ${a.staffId}`, CARE_ROLES[a.role]].filter(Boolean).join(' · ')
  // Việc cần lập của từng người trong ca: so nguồn với việc đã có của ca và các dòng đang nhập đã khớp căn cứ
  const drafts = rows
    .filter((r) => r.residentId && r.residentId !== 'FLOOR' && r.time)
    .map((r) => ({ residentId: r.residentId, time: r.time, basis: resolve(r, residentsById[r.residentId], shift).basis }))
    .filter((d) => d.basis)
  const needs = Object.fromEntries(
    (source?.residents ?? []).map((r) => [
      String(r.residentId),
      needsOf(r, shift, tasks, drafts.filter((d) => d.residentId === String(r.residentId))),
    ]),
  )
  const residentOptions = [
    ...(source?.residents ?? []).map((r) => {
      const need = needs[String(r.residentId)]
      const notes = [
        !need.hasPlan && 'chưa có kế hoạch',
        need.todo ? `còn ${need.todo} việc chưa lập` : need.entries.length ? 'đã đủ' : null,
      ].filter(Boolean)
      return [String(r.residentId), [name(r.residentId), ...notes].join(' · ')]
    }),
  ]
  const typeOptions = types.map((t) => [String(t.id), t.name])
  const typeName = Object.fromEntries(types.map((t) => [String(t.id), t.name]))

  function update(key, field, value) {
    setRows((old) =>
      old.map((row) => {
        if (row.key !== key) return row
        const next = { ...row, [field]: value }
        if (field === 'taskTypeId') {
          const floor = isShiftLevel(typeById[value])
          if (floor || row.residentId === 'FLOOR') {
            next.residentId = floor ? 'FLOOR' : ''
            next.performer = ''
          }
        }
        if (field === 'residentId') next.performer = ''
        if (['residentId', 'taskTypeId', 'time', 'mode'].includes(field)) next.source = ''
        if (['residentId', 'taskTypeId', 'mode', 'source', 'importance'].includes(field)) {
          for (const [key] of WINDOW_FIELDS) delete next[key]
        }
        return next
      }),
    )
    setRowErrors([])
  }
  function addRow() {
    const row = newRow()
    setRows((old) => [...old, row])
    setActiveKey(row.key)
    setRowErrors([])
  }
  function removeRow(key) {
    setRows((old) => old.filter((r) => r.key !== key))
    setRowErrors([])
  }

  async function submit() {
    if (!rows.length || busy) return
    setChecked(true)
    const invalid = rows.findIndex((r) => Object.keys(checkRow(r, residentsById[r.residentId], shift, typeById)).length)
    if (invalid >= 0) {
      setActiveKey(rows[invalid].key)
      setRowErrors([])
      setFailure(null)
      requestAnimationFrame(() => summary.current?.focus())
      return
    }
    const body = rows.map((r) => {
      const floor = r.residentId === 'FLOOR'
      const basis = floor ? typeById[r.taskTypeId].group : resolve(r, residentsById[r.residentId], shift).basis
      const [type, id] = basis.split(':')
      const shared = r.performer === 'SHARED'
      return {
        residentId: floor ? undefined : Number(r.residentId),
        location: floor ? { type: 'FLOOR', id: shift.floorAreaId } : undefined,
        taskTypeId: Number(r.taskTypeId),
        basis: id ? { type, id: Number(id) } : { type },
        content: r.content || undefined,
        plannedAt: plannedAtOf(shift, r.time),
        ...(canEditWindow(r, typeById[r.taskTypeId]) &&
          Object.fromEntries(WINDOW_FIELDS.filter(([field]) => hasMinutes(r[field])).map(([field]) => [field, Number(r[field])]))),
        importance: importanceOf(r, residentsById[r.residentId], shift, typeById).value,
        performerId: shared ? undefined : Number(r.performer),
        shared,
      }
    })
    const signature = JSON.stringify(body)
    if (attempt.current?.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() }
    setBusy(true)
    setFailure(null)
    setRowErrors([])
    try {
      const { data } = await postShiftsByShiftIdCareTasksPlan({
        path: { shiftId },
        body,
        headers: { 'Idempotency-Key': attempt.current.key },
      })
      attempt.current = null
      setChecked(false)
      onSaved(Array.isArray(data) ? data : [], rows.length)
    } catch (error) {
      const errors = error.problem?.rowErrors || []
      setRowErrors(errors)
      if (!errors.length) setFailure(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  const span = shift ? `${timeOf(shift.startsAt)} đến ${timeOf(shift.endsAt)}` : ''
  const errorsOf = (number) => ({
    ...Object.fromEntries(
      (rowErrors.find((e) => e.row === number)?.codes || []).map((code) => {
        const row = rows[number - 1]
        if (code === 'INVALID_BASIS' && (row?.residentId === 'FLOOR' || row?.mode !== 'source'))
          return ['type', 'Loại công việc không phù hợp với cách lập hoặc vị trí đã chọn.']
        const [field, text] = ERRORS[code] || ['basis', 'Dòng chưa đủ điều kiện, kiểm tra lại dữ liệu.']
        return [field, text || `Giờ dự kiến phải từ ${span}.`]
      }),
    ),
    ...(failing.find((e) => e.row === number)?.local ?? {}),
  })
  const firstRow = failing[0]?.row ?? rowErrors[0]?.row
  const firstMessage = firstRow && Object.values(errorsOf(firstRow))[0]
  const failedCount = new Set([...failing.map((e) => e.row), ...rowErrors.map((e) => e.row)]).size

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[90vh] flex-col gap-0 overflow-hidden bg-background p-0 sm:max-w-5xl"
      >
        <div className="flex items-start justify-between gap-4 border-b bg-card p-5">
          <div className="flex flex-col gap-1">
            <DialogTitle className="type-title">Lập công việc cho ca</DialogTitle>
            <DialogDescription className="type-body-sm text-muted-foreground">{subtitle}</DialogDescription>
            {shiftPicker && <div className="pt-2">{shiftPicker}</div>}
            {shiftPicker && rows.length > 0 && (
              <p className="type-body-sm text-muted-foreground">Gửi hoặc bỏ các dòng trước khi đổi ngày, ca.</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCompare}>
              Đối chiếu nguồn
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Đóng
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <section className="flex flex-col gap-3 rounded-xl border bg-card p-4" aria-label="Các dòng công việc">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="type-title">Các dòng công việc</h3>
              <div className="flex items-center gap-3">
                <Badge variant="held">{rows.length} dòng</Badge>
                <Button variant="outline" disabled={busy} onClick={addRow}>
                  Thêm dòng
                </Button>
              </div>
            </div>
            <ProblemAlert problem={failure} />
            {firstRow && (
              <div
                ref={summary}
                tabIndex={-1}
                role="alert"
                className="flex flex-wrap items-center gap-3 rounded-lg bg-destructive-subtle p-3 text-destructive focus-visible:outline-ring"
              >
                <AlertTriangleIcon aria-hidden="true" className="size-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="type-label">Chưa lưu lô công việc</p>
                  <p className="type-body-sm">
                    Dòng {pad(firstRow)} · {firstMessage}{' '}
                    {failedCount > 1 ? `${failedCount} dòng cần sửa. ` : ''}Cả {rows.length} dòng đều chưa lưu.
                  </p>
                </div>
                <a className="inline-flex items-center gap-1 type-label" href={`#planning-row-${firstRow}`}>
                  Đến dòng {pad(firstRow)}
                  <ChevronRightIcon aria-hidden="true" className="size-4" />
                </a>
              </div>
            )}
            {!rows.length && (
              <div className="rounded-lg bg-muted p-3">
                <p className="type-label">Chưa có dòng đang nhập</p>
                <p className="type-body-sm text-muted-foreground">Bấm Thêm dòng để lập công việc cho ca này.</p>
              </div>
            )}
            {rows.map((r, index) => {
              const number = index + 1
              const errors = errorsOf(number)
              const errorCount = Object.keys(errors).length
              const expanded = r.key === activeKey || errorCount > 0
              const floor = r.residentId === 'FLOOR'
              const current = residentsById[r.residentId]
              if (!expanded)
                return (
                  <button
                    key={r.key}
                    id={`planning-row-${number}`}
                    type="button"
                    onClick={() => setActiveKey(r.key)}
                    className="flex min-h-11 items-center gap-3 rounded-lg border bg-muted px-3 text-left focus-visible:outline-ring"
                  >
                    <span className="type-label text-accent-foreground">Dòng {pad(number)}</span>
                    <span className="min-w-0 flex-1 truncate type-label">
                      {floor ? 'Cả tầng' : r.residentId ? name(r.residentId) : 'Chưa chọn người'}
                      {r.taskTypeId ? ` · ${typeName[r.taskTypeId]}` : ''}
                    </span>
                    <span className="tabular-nums text-muted-foreground">{r.time}</span>
                    <span className="type-label text-accent-foreground">Đã nhập</span>
                  </button>
                )
              const assignments = floor ? shiftMembers : current?.assignments || []
              const performerOptions = [
                ...assignments.map((a) => [String(a.staffId), staffName(a)]),
                ...(!floor ? [['SHARED', 'Việc chung của tầng']] : []),
              ]
              const set = (field) => (value) => update(r.key, field, value)
              const level = importanceOf(r, current, shift, typeById)
              const sourceOptions =
                r.mode === 'source' && !floor
                  ? matchingSources(current, shift, r.taskTypeId, r.time).map((item) => [sourceKey(item), sourceText(item)])
                  : []
              return (
                <fieldset
                  key={r.key}
                  id={`planning-row-${number}`}
                  tabIndex={-1}
                  disabled={busy}
                  className={`min-w-0 rounded-xl border p-4 ${errorCount ? 'border-destructive' : ''}`}
                >
                  <legend className="sr-only">Dòng {pad(number)}</legend>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p aria-hidden="true" className="type-card-title">
                      Dòng {pad(number)}
                    </p>
                    <div className="flex items-center gap-2">
                      {errorCount > 0 && <Badge variant="destructive">Có {errorCount} lỗi</Badge>}
                      <Button variant="ghost" onClick={() => removeRow(r.key)}>
                        Bỏ dòng
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    {floor ? (
                      <p className="type-body-sm md:col-span-3">Vị trí thực hiện: Cả tầng của ca.</p>
                    ) : (
                      <RowField label="Người cao tuổi" error={errors.resident} className="md:col-span-3">
                        {(p) => (
                          <Select
                            {...p}
                            required
                            options={residentOptions}
                            placeholder={residentOptions.length ? 'Chọn…' : 'Không có người cao tuổi trong phạm vi ca'}
                            disabled={!residentOptions.length}
                            value={r.residentId}
                            onChange={set('residentId')}
                          />
                        )}
                      </RowField>
                    )}
                    {current && (
                      <NeedList
                        name={name(r.residentId)}
                        shiftText={`${timeOf(shift.startsAt)}–${timeOf(shift.endsAt)}`}
                        need={needs[r.residentId]}
                        typeName={typeName}
                      />
                    )}
                    <RowField label="Loại công việc" error={errors.type}>
                      {(p) => (
                        <Select
                          {...p}
                          required
                          options={typeOptions}
                          value={r.taskTypeId}
                          onChange={set('taskTypeId')}
                        />
                      )}
                    </RowField>
                    <RowField label="Giờ dự kiến" error={errors.time}>
                      {(p) => (
                        <>
                          <input
                            {...p}
                            type="time"
                            required
                            min={clock.first}
                            max={clock.last}
                            list={`${p.id}-times`}
                            value={r.time ?? ''}
                            onChange={(e) => set('time')(e.target.value)}
                          />
                          <datalist id={`${p.id}-times`}>
                            {clock.options.map((time) => <option key={time} value={time} />)}
                          </datalist>
                          {r.time && inShift(shift, r.time) && (
                            <p className="type-body-sm text-muted-foreground">{formatDate(plannedAtOf(shift, r.time))}</p>
                          )}
                        </>
                      )}
                    </RowField>
                    {level.choose ? (
                      <RowField label="Mức quan trọng" error={errors.importance}>
                        {(p) => (
                          <Select
                            {...p}
                            required
                            options={Object.entries(IMPORTANCE)}
                            value={r.importance}
                            onChange={set('importance')}
                          />
                        )}
                      </RowField>
                    ) : (
                      <div className="flex min-w-0 flex-col gap-2">
                        <span className="type-label">Mức quan trọng</span>
                        <p className="flex min-h-11 flex-col justify-center type-body-sm">
                          {level.value ? (
                            <>
                              <span className="type-label">{IMPORTANCE[level.value] || level.value}</span>
                              <span className="text-muted-foreground">{level.from}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">Theo căn cứ, hiện khi đã có loại và giờ</span>
                          )}
                        </p>
                      </div>
                    )}
                    <RowField label="Phân công" error={errors.performer}>
                      {(p) => (
                        <Select
                          {...p}
                          required
                          options={performerOptions}
                          value={r.performer}
                          onChange={set('performer')}
                        />
                      )}
                    </RowField>
                    {!floor && (
                      <>
                        <RowField label="Cách lập công việc" error={r.mode === 'source' ? undefined : errors.basis}>
                          {(p) => (
                            <Select
                              {...p}
                              placeholder=""
                              options={[['adHoc', 'Công việc phát sinh'], ['source', 'Tạo từ kế hoạch hoặc sự kiện']]}
                              value={r.mode}
                              onChange={set('mode')}
                            />
                          )}
                        </RowField>
                        {r.mode === 'source' && (
                          <RowField
                            label="Chọn kế hoạch hoặc sự kiện cần theo dõi"
                            error={errors.basis}
                            className="md:col-span-3"
                          >
                            {(p) => (
                              <Select
                                {...p}
                                required
                                options={sourceOptions}
                                placeholder={
                                  !current || !r.taskTypeId || !r.time
                                    ? 'Chọn người cao tuổi, loại công việc và giờ trước'
                                    : sourceOptions.length
                                      ? 'Chọn…'
                                      : 'Không có nguồn phù hợp với giờ đã nhập'
                                }
                                disabled={!sourceOptions.length}
                                value={r.source}
                                onChange={set('source')}
                              />
                            )}
                          </RowField>
                        )}
                      </>
                    )}
                    {floor && errors.basis && <p className="type-body-sm text-destructive">{errors.basis}</p>}
                    {typeById[r.taskTypeId] && (
                      <WindowOptions
                        row={r}
                        shift={shift}
                        type={typeById[r.taskTypeId]}
                        plan={resolve(r, current, shift).plan}
                        errors={errors}
                        set={set}
                      />
                    )}
                    <RowField label="Nội dung (không bắt buộc)" className="md:col-span-3">
                      {(p) => (
                        <Textarea
                          id={p.id}
                          maxLength={1000}
                          value={r.content}
                          onChange={(e) => set('content')(e.target.value)}
                        />
                      )}
                    </RowField>
                  </div>
                </fieldset>
              )
            })}
          </section>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-card p-5">
          <div>
            <p className="type-label">{rows.length ? `${rows.length} dòng chờ gửi` : 'Chưa có dòng chờ gửi'}</p>
            <p className="type-body-sm text-muted-foreground">Một dòng sai thì cả lô chưa được lưu.</p>
          </div>
          <Button disabled={busy || !rows.length} onClick={submit}>
            {busy ? 'Đang kiểm tra và lưu…' : rows.length ? `Gửi lô ${rows.length} dòng` : 'Gửi lô'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const STATES = {
  TODO: ['Chưa lập', 'text-warning-foreground'],
  DRAFT: ['Đang nhập', 'text-accent-foreground'],
  DONE: ['Đã lập', 'text-success-foreground'],
}

// "Việc cần lập trong ca" của người đang chọn: dữ liệu nguồn chỉ để xem (kế hoạch chăm sóc đã duyệt, bữa ăn, lần đo,
// hoạt động, theo dõi), người lập tự nhập dòng theo đó (Q-307). Chưa có kế hoạch hiệu lực thì báo (BF-01 "Điểm đã làm rõ").
function NeedList({ name, shiftText, need, typeName }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2 rounded-lg border bg-muted p-3 md:col-span-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 id={id} className="type-label">
          Việc cần lập cho {name} trong ca {shiftText}
        </h4>
        {need.entries.length > 0 && (
          <span className="type-body-sm text-muted-foreground">
            {need.todo ? `Còn ${need.todo} việc chưa lập` : 'Đã lập đủ theo nguồn'}
          </span>
        )}
      </div>
      {!need.hasPlan && (
        <p role="note" className="rounded-md bg-warning p-2 type-body-sm text-warning-foreground">
          Chưa có kế hoạch chăm sóc hiệu lực. Lập được việc theo bữa ăn, lần đo, hoạt động hoặc việc phát sinh; kế hoạch do
          Điều dưỡng lập, Bác sĩ duyệt.
        </p>
      )}
      {need.entries.length ? (
        <table className="w-full type-body-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1 pr-3 font-normal">Việc</th>
              <th className="py-1 pr-3 font-normal">Giờ</th>
              <th className="py-1 pr-3 font-normal">Mức</th>
              <th className="py-1 pr-3 font-normal">Người làm</th>
              <th className="py-1 font-normal">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {need.entries.map((e) => (
              <tr key={`${e.basis}-${e.time}`} className="border-t">
                <td className="py-1.5 pr-3">
                  <span className="type-label">{typeName[e.taskTypeId] || e.kind}</span>
                  <span className="block text-muted-foreground">{e.text}</span>
                </td>
                <td className="py-1.5 pr-3 tabular-nums">{e.time ?? 'Trong ca'}</td>
                <td className="py-1.5 pr-3">{IMPORTANCE[e.importance] || '—'}</td>
                <td className="py-1.5 pr-3">{CARE_ROLES[e.role] || '—'}</td>
                <td className={`py-1.5 type-label ${STATES[e.state][1]}`}>{STATES[e.state][0]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        need.hasPlan && <p className="type-body-sm text-muted-foreground">Không có việc theo nguồn nào trong ca này.</p>
      )}
    </section>
  )
}
