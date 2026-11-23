import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { ProblemAlert } from '@/common/ProblemAlert'
import { problemOf } from '@/common/problem'
import { recordLateDose } from './doseRound'

// Ghi "đã dùng muộn" cho liều đã Bỏ lỡ (BR-M07-26, Q-327): Bỏ lỡ vẫn là bản ghi cuối của lịch sử, hệ thống tạo bản đính
// chính kèm giờ dùng thực tế và lý do. Người đính chính là người ghi gốc hoặc Người phụ trách ca (api-000).

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

function LateForm({ dose, now, onSaved, onClose }) {
  const [time, setTime] = useState(now)
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [problem, setProblem] = useState(null)
  const [saving, setSaving] = useState(false)
  const [key] = useState(() => crypto.randomUUID())
  const timeInvalid = !HHMM.test(time) || time > now

  async function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    if (timeInvalid || !reason.trim()) return
    setSaving(true)
    setProblem(null)
    try {
      const outcome = await recordLateDose(dose, time, reason, key)
      await onSaved(
        outcome === 'pending'
          ? `Đã gửi yêu cầu ghi ${dose.drug} đã dùng muộn, chờ phê duyệt.`
          : `Đã ghi ${dose.drug} đã dùng muộn lúc ${time}.`,
      )
    } catch (error) {
      setProblem(problemOf(error))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle className="type-title">Ghi đã dùng muộn</SheetTitle>
        <SheetDescription>
          {dose.drug}, {dose.dose}, giờ {dose.time}. Liều đã Bỏ lỡ; bản ghi Bỏ lỡ vẫn giữ trong lịch sử.
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-4 px-4">
        <ProblemAlert problem={problem} />
        <Field data-invalid={(submitted && timeInvalid) || undefined}>
          <FieldLabel htmlFor="late-time">Giờ dùng thực tế</FieldLabel>
          <Input id="late-time" inputMode="numeric" value={time} onChange={(e) => setTime(e.target.value)} className="h-11 w-32 tabular-nums" />
          {submitted && timeInvalid ? <FieldError>Nhập giờ dạng HH:mm, không sau {now}</FieldError> : <FieldDescription>Giờ 24h, trong ngày.</FieldDescription>}
        </Field>
        <Field data-invalid={(submitted && !reason.trim()) || undefined}>
          <FieldLabel htmlFor="late-reason">Lý do đính chính</FieldLabel>
          <Textarea id="late-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={(submitted && !reason.trim()) || undefined} />
          {submitted && !reason.trim() && <FieldError>Nhập lý do</FieldError>}
        </Field>
      </div>
      <SheetFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Hủy
        </Button>
        <Button type="submit" className="h-11" disabled={saving}>
          Ghi đã dùng muộn
        </Button>
      </SheetFooter>
    </form>
  )
}

export function LateDoseSheet({ dose, now, onSaved, onClose }) {
  return (
    <Sheet open={!!dose} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>{dose && <LateForm key={dose.id} dose={dose} now={now} onSaved={onSaved} onClose={onClose} />}</SheetContent>
    </Sheet>
  )
}
