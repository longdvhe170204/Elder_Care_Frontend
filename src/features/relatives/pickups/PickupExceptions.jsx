import { useState } from 'react'
import { postPickupExceptionsByIdByCommand, postResidentsByResidentIdPickupExceptions } from '@/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { ProblemAlert } from '@/common/ProblemAlert'
import { StatusBadge } from '@/common/StatusBadge'
import { formatDateTime } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { EXCEPTION_METHOD_LABELS, EXCEPTION_STATUS_LABELS } from './pickupLabels'

// Ngoại lệ đón (012 T021; FR-024, FR-025, BR-M10-03): người có quyền lệnh nguồn lập cho người ngoài danh sách; người
// đại diện xác nhận qua cổng hoặc Quản lý viện duyệt kèm lý do. Từ 2026-11-24 (test BF-12 C-2, chủ dự án chọn phương án
// A) đọc danh sách qua `GET /pickup-exceptions`: bảng ngoại lệ, bấm hàng mở khung chi tiết có lệnh, thay nhập mã.

function TextField({ id, label, value, onChange, error, show }) {
  return (
    <Field data-invalid={show || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        className="h-11"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={show || undefined}
      />
      {show && <FieldError>{error}</FieldError>}
    </Field>
  )
}

export function PickupExceptionSheet({ residentId, residentName, onClose, onDone }) {
  const [key] = useState(() => crypto.randomUUID())
  const [form, setForm] = useState({ fullName: '', idDocumentNumber: '', relationship: '', reason: '' })
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const missing = (name) => submitted && !form[name].trim()
  const set = (name) => (value) => setForm({ ...form, [name]: value })

  async function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    if (Object.values(form).some((v) => !v.trim())) return
    setBusy(true)
    try {
      await postResidentsByResidentIdPickupExceptions({
        path: { residentId },
        headers: { 'Idempotency-Key': key },
        body: Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()])),
      })
      onDone(
        `Đã lập yêu cầu ngoại lệ đón cho ${form.fullName.trim()}. Chờ người đại diện xác nhận hoặc Quản lý viện duyệt.`,
      )
    } catch (error) {
      setFailure(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto p-6 sm:max-w-2xl">
        <SheetTitle className="type-title">Lập yêu cầu ngoại lệ đón</SheetTitle>
        <SheetDescription className="type-body-sm text-muted-foreground">
          Người đón không thuộc danh sách được phép đón của {residentName}. Yêu cầu có hiệu lực khi người đại diện xác
          nhận qua cổng hoặc Quản lý viện duyệt.
        </SheetDescription>
        <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-4">
          <TextField
            id="exception-name"
            label="Họ tên người đón"
            value={form.fullName}
            onChange={set('fullName')}
            show={missing('fullName')}
            error="Nhập họ tên người đón"
          />
          <TextField
            id="exception-document"
            label="Số giấy tờ"
            value={form.idDocumentNumber}
            onChange={set('idDocumentNumber')}
            show={missing('idDocumentNumber')}
            error="Nhập số giấy tờ"
          />
          <TextField
            id="exception-relationship"
            label="Quan hệ với người cao tuổi"
            value={form.relationship}
            onChange={set('relationship')}
            show={missing('relationship')}
            error="Nhập quan hệ với người cao tuổi"
          />
          <Field data-invalid={missing('reason') || undefined}>
            <FieldLabel htmlFor="exception-reason">Lý do</FieldLabel>
            <Textarea
              id="exception-reason"
              rows={3}
              maxLength={2000}
              value={form.reason}
              onChange={(e) => set('reason')(e.target.value)}
              aria-invalid={missing('reason') || undefined}
            />
            {missing('reason') && <FieldError>Nhập lý do</FieldError>}
          </Field>
          <ProblemAlert problem={failure} />
          <Button type="submit" className="h-11 self-start" disabled={busy}>
            Gửi yêu cầu ngoại lệ
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}

export function PickupExceptionTable({ exceptions, selectedId, onSelect }) {
  return (
    <Card className="py-0">
      <Table aria-label="Yêu cầu ngoại lệ đón">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">Người đón</TableHead>
            <TableHead>Số giấy tờ</TableHead>
            <TableHead>Lập lúc</TableHead>
            <TableHead>Hết hạn</TableHead>
            <TableHead className="pr-4">Trạng thái</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {exceptions.map((e) => (
            <TableRow key={e.id} className={selectedId === e.id ? 'bg-accent' : undefined}>
              <TableCell className="pl-4">
                <button
                  type="button"
                  className="flex min-h-11 flex-col items-start text-left"
                  aria-pressed={selectedId === e.id}
                  onClick={() => onSelect(e.id)}
                >
                  <span className="type-label whitespace-normal">{e.fullName}</span>
                  <span className="type-caption text-muted-foreground">{e.relationship}</span>
                </button>
              </TableCell>
              <TableCell className="tabular-nums">{e.idDocumentNumber}</TableCell>
              <TableCell className="tabular-nums">{formatDateTime(e.createdAt)}</TableCell>
              <TableCell className="tabular-nums">{e.expiresAt ? formatDateTime(e.expiresAt) : '—'}</TableCell>
              <TableCell className="pr-4">
                <StatusBadge status={EXCEPTION_STATUS_LABELS[e.status] ?? e.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}

const COMMANDS = {
  approve: { label: 'Duyệt', submit: 'Xác nhận duyệt', done: 'Đã duyệt' },
  reject: { label: 'Từ chối', submit: 'Xác nhận từ chối', done: 'Đã từ chối' },
  cancel: { label: 'Hủy yêu cầu', submit: 'Xác nhận hủy', done: 'Đã hủy' },
}

// Lệnh theo trạng thái: Chờ xác nhận có Duyệt, Từ chối (Quản lý viện), Hủy yêu cầu (người lập; backend kiểm); Hiệu lực
// có Hủy ngoại lệ (Quản lý viện, lý do bắt buộc). Lý do bắt buộc trừ khi người lập hủy yêu cầu Chờ xác nhận.
function commandsOf(exception, can) {
  if (exception.status === 'PENDING_CONFIRMATION') {
    return [...(can('APPROVE') ? ['approve', 'reject'] : []), ...(can('CREATE') ? ['cancel'] : [])]
  }
  if (exception.status === 'EFFECTIVE') return can('APPROVE') ? ['cancel'] : []
  return []
}

function ExceptionCommandForm({ exception, command, onDone, onCancel }) {
  const spec = COMMANDS[command]
  const reasonRequired = !(command === 'cancel' && exception.status === 'PENDING_CONFIRMATION')
  const [key] = useState(() => crypto.randomUUID())
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const reasonMissing = reasonRequired && !reason.trim()

  async function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    if (reasonMissing) return
    setBusy(true)
    try {
      await postPickupExceptionsByIdByCommand({
        path: { id: exception.id, command },
        headers: { 'Idempotency-Key': key },
        body: reason.trim() ? { reason: reason.trim() } : {},
      })
      onDone(`${spec.done} yêu cầu ngoại lệ đón của ${exception.fullName}`)
    } catch (error) {
      setFailure(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-lg border p-4">
      <Field data-invalid={(submitted && reasonMissing) || undefined}>
        <FieldLabel htmlFor="exception-command-reason">Lý do</FieldLabel>
        <Textarea
          id="exception-command-reason"
          rows={3}
          maxLength={2000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-invalid={(submitted && reasonMissing) || undefined}
        />
        {submitted && reasonMissing && <FieldError>Nhập lý do</FieldError>}
      </Field>
      <ProblemAlert problem={failure} />
      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          className="h-11"
          variant={command === 'approve' ? 'default' : 'destructive'}
          disabled={busy}
        >
          {spec.submit}
        </Button>
        <Button type="button" variant="outline" className="h-11" onClick={onCancel}>
          Đóng form
        </Button>
      </div>
    </form>
  )
}

export function PickupExceptionDetail({ exception, can, onChanged, Title, Description }) {
  const [command, setCommand] = useState(null)
  const commands = commandsOf(exception, can)
  const label = (c) => (c === 'cancel' && exception.status === 'EFFECTIVE' ? 'Hủy ngoại lệ' : COMMANDS[c].label)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Title className="type-title">Ngoại lệ đón: {exception.fullName}</Title>
        <Description className="type-body-sm text-muted-foreground">{exception.relationship}</Description>
        <StatusBadge status={EXCEPTION_STATUS_LABELS[exception.status] ?? exception.status} />
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 type-body-sm">
        <dt className="text-muted-foreground">Số giấy tờ</dt>
        <dd className="tabular-nums">{exception.idDocumentNumber}</dd>
        <dt className="text-muted-foreground">Lý do</dt>
        <dd>{exception.reason}</dd>
        <dt className="text-muted-foreground">Lập lúc</dt>
        <dd className="tabular-nums">{formatDateTime(exception.createdAt)}</dd>
        {exception.method && (
          <>
            <dt className="text-muted-foreground">Cách có hiệu lực</dt>
            <dd>{EXCEPTION_METHOD_LABELS[exception.method] ?? exception.method}</dd>
          </>
        )}
        {exception.decisionReason && (
          <>
            <dt className="text-muted-foreground">Lý do quyết định</dt>
            <dd>{exception.decisionReason}</dd>
          </>
        )}
        {exception.effectiveAt && (
          <>
            <dt className="text-muted-foreground">Hiệu lực từ</dt>
            <dd className="tabular-nums">{formatDateTime(exception.effectiveAt)}</dd>
          </>
        )}
        {exception.expiresAt && (
          <>
            <dt className="text-muted-foreground">Hết hạn</dt>
            <dd className="tabular-nums">{formatDateTime(exception.expiresAt)}</dd>
          </>
        )}
      </dl>
      <p className="type-caption text-muted-foreground">
        Ngoại lệ dùng cho đúng một lượt đón trong thời hạn; người đón không được thêm vào danh sách được phép đón.
      </p>

      {command ? (
        <ExceptionCommandForm
          key={command}
          exception={exception}
          command={command}
          onCancel={() => setCommand(null)}
          onDone={(message) => {
            setCommand(null)
            onChanged(message)
          }}
        />
      ) : (
        commands.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {commands.map((c) => (
              <Button
                key={c}
                variant={c === 'approve' ? 'default' : 'outline'}
                className="h-11"
                onClick={() => setCommand(c)}
              >
                {label(c)}
              </Button>
            ))}
          </div>
        )
      )}
    </div>
  )
}
