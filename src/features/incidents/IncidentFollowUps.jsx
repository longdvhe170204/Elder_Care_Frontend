import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { getTaskTypes, postCareTasksAdHoc } from '@/api/api005'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { StaffSelectField } from '@/common/StaffSelectField'
import { formatDateTime } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { CaseBlock, CaseDialog } from './CasePage'
import { FOLLOW_UP_OPEN } from './incidentView'
import { vietnamIso } from './incidentView'

// Việc tiếp theo của sự cố (007 FR-045b): công việc chăm sóc (005) có căn cứ là sự cố này, kèm người làm, hạn, kết quả. Lập
// bằng lệnh công việc phát sinh của 005 (Trưởng tầng, Điều dưỡng); ca nào có thời điểm dự kiến thì việc vào checklist ca đó,
// quá hạn và bàn giao theo quy tắc của 005, 008. Hệ thống không tự lập việc (Q-306, Q-307).
const STATUS = {
  NOT_YET_DUE: ['Chưa đến hạn', 'neutral'],
  DUE: ['Đến hạn', 'attention'],
  OVERDUE: ['Quá hạn', 'urgent'],
  COMPLETED: ['Hoàn thành', 'settled'],
  COMPLETED_LATE: ['Hoàn thành trễ', 'neutral'],
  NOT_PERFORMED: ['Không thực hiện', 'neutral'],
}
const IMPORTANCE = [
  ['NORMAL', 'Thường'],
  ['IMPORTANT', 'Quan trọng'],
  ['MANDATORY', 'Bắt buộc'],
]
const ROW_ERROR = {
  RESIDENT_NOT_STAYING: 'Người cao tuổi không đang lưu trú.',
  RESIDENT_ABSENT: 'Người cao tuổi đang vắng mặt ở thời điểm này.',
  OUTSIDE_SHIFT: 'Thời điểm này chưa có ca đã công bố của tầng.',
  INVALID_BASIS: 'Sự cố đã đóng hoặc loại công việc không dùng được cho sự cố.',
  INVALID_PERFORMER: 'Người thực hiện không trong ca hoặc không đúng vai trò của loại công việc.',
  MISSING_CERTIFICATE: 'Người thực hiện chưa đủ chứng chỉ.',
  DUPLICATE_BASIS: 'Sự cố này đã có một việc ở đúng thời điểm đó.',
}

export function FollowUpForm({ incidentId, residentId, onClose, onSaved }) {
  const [types, setTypes] = useState(null)
  const [typeId, setTypeId] = useState('')
  const [content, setContent] = useState('')
  const [at, setAt] = useState('')
  const [importance, setImportance] = useState('MANDATORY')
  const [performerId, setPerformerId] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [problem, setProblem] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    getTaskTypes({}).then(
      ({ data }) => live && setTypes((data ?? []).filter((t) => t.status === 'ACTIVE')),
      (error) => live && (setTypes([]), setProblem(problemOf(error))),
    )
    return () => {
      live = false
    }
  }, [])

  const missing = { type: !typeId, content: !content.trim(), at: !at }

  async function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    if (Object.values(missing).some(Boolean)) return
    setBusy(true)
    setProblem(null)
    try {
      await postCareTasksAdHoc({
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: {
          residentId,
          taskTypeId: Number(typeId),
          basis: { type: 'INCIDENT_FOLLOW_UP', id: incidentId },
          content: content.trim(),
          plannedAt: vietnamIso(at),
          importance,
          ...(performerId ? { performerId: Number(performerId) } : { shared: true }),
        },
      })
      onSaved('Đã giao việc tiếp theo')
    } catch (error) {
      const codes = (error?.problem?.rowErrors ?? []).flatMap((row) => row.codes ?? [])
      const base = problemOf(error)
      setProblem(codes.length > 0 ? { ...base, detail: codes.map((code) => ROW_ERROR[code] ?? code).join(' ') } : base)
    } finally {
      setBusy(false)
    }
  }

  return (
    <CaseDialog
      title="Giao việc tiếp theo"
      description="Việc vào checklist của ca có thời điểm này, kết quả hiện lại ở sự cố."
      problem={problem}
      wide
      onClose={() => !busy && onClose()}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <Field data-invalid={(submitted && missing.type) || undefined}>
            <FieldLabel htmlFor="follow-up-type">Loại công việc</FieldLabel>
            <select
              id="follow-up-type"
              value={typeId}
              onChange={(e) => setTypeId(e.target.value)}
              aria-invalid={(submitted && missing.type) || undefined}
              className="h-11 w-full rounded-md border border-input bg-transparent px-3"
            >
              <option value="">{types === null ? 'Đang tải' : 'Chưa chọn'}</option>
              {(types ?? []).map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.name}
                </option>
              ))}
            </select>
            {submitted && missing.type && <FieldError>Chọn loại công việc</FieldError>}
          </Field>
          <Field data-invalid={(submitted && missing.at) || undefined}>
            <FieldLabel htmlFor="follow-up-at">Làm lúc</FieldLabel>
            <Input
              id="follow-up-at"
              type="datetime-local"
              className="h-11"
              value={at}
              onChange={(e) => setAt(e.target.value)}
              aria-invalid={(submitted && missing.at) || undefined}
            />
            {submitted && missing.at && <FieldError>Chọn thời điểm làm</FieldError>}
          </Field>
        </div>
        <Field data-invalid={(submitted && missing.content) || undefined}>
          <FieldLabel htmlFor="follow-up-content">Việc cần làm</FieldLabel>
          <Textarea
            id="follow-up-content"
            rows={2}
            maxLength={1000}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            aria-invalid={(submitted && missing.content) || undefined}
          />
          {submitted && missing.content && <FieldError>Nhập việc cần làm</FieldError>}
        </Field>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>Mức quan trọng</FieldLabel>
            <ToggleGroup
              variant="outline"
              value={[importance]}
              onValueChange={(next) => next[0] && setImportance(next[0])}
              aria-label="Mức quan trọng"
              className="flex flex-wrap"
            >
              {IMPORTANCE.map(([value, label]) => (
                <ToggleGroupItem key={value} value={value} className="h-11 px-4">
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldDescription>Việc Bắt buộc quá hạn thì hệ thống tạo cảnh báo.</FieldDescription>
          </Field>
          <div className="flex flex-col gap-1.5">
            <StaffSelectField
              id="follow-up-performer"
              label="Người làm (không bắt buộc)"
              value={performerId}
              onChange={setPerformerId}
            />
            <p className="type-body-sm text-muted-foreground">Không chọn thì là việc chung của tầng.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="h-11" disabled={busy}>
            Lưu việc tiếp theo
          </Button>
          <Button type="button" variant="ghost" className="h-11" disabled={busy} onClick={onClose}>
            Quay lại
          </Button>
        </div>
      </form>
    </CaseDialog>
  )
}

// tasks: null khi chưa tải được; canAdd: người xem giao được việc; onOpenTask: mở đúng việc ở Checklist ca (nếu được xem)
export function FollowUpBlock({ tasks, open, canAdd, onAdd, onOpenTask }) {
  if (!tasks) return null
  const pending = tasks.filter((t) => FOLLOW_UP_OPEN.includes(t.status))
  return (
    <CaseBlock
      title="Việc tiếp theo"
      aside={open && pending.length === 0 && <Badge variant="attention">Chưa ghi việc tiếp theo</Badge>}
    >
      {tasks.length === 0 ? (
        <p className="type-body-sm text-muted-foreground">
          {!open
            ? 'Không có việc tiếp theo.'
            : canAdd
              ? 'Ghi việc ca sau cần làm, người làm và giờ làm.'
              : 'Trưởng tầng hoặc Điều dưỡng giao việc cho ca sau.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {tasks.map((t) => {
            const [label, tone] = STATUS[t.status] ?? [t.status, 'neutral']
            return (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-baseline gap-x-3">
                    <span className="type-label">{t.content ?? t.taskType}</span>
                    <Badge variant={tone}>{label}</Badge>
                  </span>
                  <span className="type-body-sm text-muted-foreground tabular-nums">
                    {t.performer ?? 'Việc chung của tầng'}, lúc {formatDateTime(t.plannedAt)}, hạn{' '}
                    {formatDateTime(t.dueAt)}
                  </span>
                  {(t.resultNote || t.closureReason) && (
                    <span className="type-body-sm break-words">
                      Kết quả: {t.resultNote ?? t.closureReason}
                      {t.closedAt && `, ${formatDateTime(t.closedAt)}`}
                    </span>
                  )}
                </div>
                {onOpenTask && FOLLOW_UP_OPEN.includes(t.status) && (
                  <Button
                    variant="outline"
                    className="h-11"
                    aria-label={`Mở việc ${t.content ?? t.taskType}`}
                    onClick={() => onOpenTask(t)}
                  >
                    Mở việc
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {canAdd && (
        <Button id="add-follow-up" variant="outline" className="h-11 self-start" onClick={onAdd}>
          <Plus aria-hidden="true" />
          Giao việc tiếp theo
        </Button>
      )}
    </CaseBlock>
  )
}
