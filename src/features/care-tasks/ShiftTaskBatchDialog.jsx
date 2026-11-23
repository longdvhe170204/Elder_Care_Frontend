import { useEffect, useId, useRef, useState } from 'react'
import { AlertTriangleIcon, ChevronRightIcon } from 'lucide-react'
import { postShiftsByShiftIdCareTasksPlan } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { ProblemAlert } from '@/common/ProblemAlert'
import { problemOf } from '@/common/problem'
import { IMPORTANCE, CARE_ROLES } from './carePlanLabels'
import { BASIS, ERRORS, pad, plannedAtOf, timeOf } from './shiftPlanning'

const SHIFT_LEVEL = ['SHIFT_START_CHECK', 'SUPERVISION', 'AD_HOC']
const newRow = () => ({ key: crypto.randomUUID(), content: '' })

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

function Select({ options, value, onChange, ...props }) {
  return (
    <select {...props} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">Chọn…</option>
      {options.map(([code, text]) => (
        <option key={code} value={code}>
          {text}
        </option>
      ))}
    </select>
  )
}

// "Lập công việc cho ca": nhập các dòng rồi gửi cả lô; không tự thêm dòng, không tự điền theo nguồn (Q-306, Q-307)
export function ShiftTaskBatchDialog({
  open,
  onOpenChange,
  subtitle,
  shiftId,
  source,
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
  const [failure, setFailure] = useState(null)
  const [busy, setBusy] = useState(false)
  const attempt = useRef(null)
  const summary = useRef(null)
  const shift = source?.shift
  useEffect(() => {
    if (rowErrors.length) summary.current?.focus()
  }, [rowErrors])

  const name = (id) => people[id] || `Người cao tuổi · mã ${id}`
  const residentOptions = [
    ...(source?.residents ?? []).map((r) => [String(r.residentId), name(r.residentId)]),
    ['FLOOR', 'Cả tầng (việc cấp ca)'],
  ]
  const typeOptions = types.map((t) => [String(t.id), t.name])
  const typeName = Object.fromEntries(types.map((t) => [String(t.id), t.name]))

  function update(key, field, value) {
    setRows((old) =>
      old.map((row) => {
        if (row.key !== key) return row
        const next = { ...row, [field]: value }
        if (field === 'residentId') {
          next.basis = ''
          next.performer = ''
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
    const body = rows.map((r) => {
      const floor = r.residentId === 'FLOOR'
      const [type, id] = (r.basis || '').split(':')
      const shared = r.performer === 'SHARED'
      return {
        residentId: floor ? undefined : Number(r.residentId) || undefined,
        location: floor ? { type: 'FLOOR', id: shift.floorAreaId } : undefined,
        taskTypeId: Number(r.taskTypeId),
        basis: id ? { type, id: Number(id) } : { type },
        content: r.content || undefined,
        plannedAt: r.time ? plannedAtOf(shift, r.time) : undefined,
        importance: r.importance,
        performerId: shared || !r.performer ? undefined : Number(r.performer),
        shared,
      }
    })
    const signature = JSON.stringify(body)
    if (attempt.current?.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() }
    setBusy(true)
    setFailure(null)
    setRowErrors([])
    try {
      await postShiftsByShiftIdCareTasksPlan({
        path: { shiftId },
        body,
        headers: { 'Idempotency-Key': attempt.current.key },
      })
      attempt.current = null
      onSaved(rows.length)
    } catch (error) {
      const errors = error.problem?.rowErrors || []
      setRowErrors(errors)
      if (!errors.length) setFailure(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  const span = shift ? `${timeOf(shift.startsAt)} đến ${timeOf(shift.endsAt)}` : ''
  const errorsOf = (number) =>
    Object.fromEntries(
      (rowErrors.find((e) => e.row === number)?.codes || []).map((code) => {
        const [field, text] = ERRORS[code] || ['basis', 'Dòng chưa đủ điều kiện, kiểm tra lại dữ liệu.']
        return [field, text || `Giờ dự kiến phải từ ${span}.`]
      }),
    )
  const firstError = rowErrors[0]
  const firstMessage = firstError && Object.values(errorsOf(firstError.row))[0]

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
            {firstError && (
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
                    Dòng {pad(firstError.row)} · {firstMessage} Cả {rows.length} dòng đều chưa lưu.
                  </p>
                </div>
                <a className="inline-flex items-center gap-1 type-label" href={`#planning-row-${firstError.row}`}>
                  Đến dòng {pad(firstError.row)}
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
              const current = source?.residents.find((v) => String(v.residentId) === r.residentId)
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
                ...assignments.map((a) => [
                  String(a.staffId),
                  a.fullName || `${CARE_ROLES[a.role] || 'Nhân viên'} · mã ${a.staffId}`,
                ]),
                ['SHARED', 'Việc chung của tầng'],
              ]
              const basisOptions = floor
                ? SHIFT_LEVEL.map((code) => [code, BASIS[code]])
                : [
                    ...(current?.planItems ?? []).map((v) => [
                      `CARE_PLAN_ITEM:${v.id}`,
                      [`${BASIS.CARE_PLAN_ITEM} · ${v.content}`, ...(v.times ?? []).map((t) => t.slice(0, 5))].join(
                        ' · ',
                      ),
                    ]),
                    ...(current?.otherSources ?? []).map((v) => [
                      `${v.type}:${v.id}`,
                      `${BASIS[v.type] || 'Nguồn khác'} · ${v.description} ${timeOf(v.at)}`,
                    ]),
                    ['AD_HOC', BASIS.AD_HOC],
                  ]
              const set = (field) => (value) => update(r.key, field, value)
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
                    <RowField label="Người cao tuổi" error={errors.resident}>
                      {(p) => (
                        <Select
                          {...p}
                          required
                          options={residentOptions}
                          value={r.residentId}
                          onChange={set('residentId')}
                        />
                      )}
                    </RowField>
                    <RowField label="Loại công việc">
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
                    <RowField label="Căn cứ" error={errors.basis}>
                      {(p) => <Select {...p} required options={basisOptions} value={r.basis} onChange={set('basis')} />}
                    </RowField>
                    <RowField label="Giờ dự kiến" error={errors.time}>
                      {(p) => (
                        <input
                          {...p}
                          type="time"
                          required
                          value={r.time ?? ''}
                          onChange={(e) => set('time')(e.target.value)}
                        />
                      )}
                    </RowField>
                    <RowField label="Mức quan trọng">
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
