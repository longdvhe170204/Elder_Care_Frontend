import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { ProblemAlert } from '@/common/ProblemAlert'
import { formatDateTime } from '@/common/dateTime'
import { problemOf } from '@/common/problem'

// Phần dùng chung của bản Nháp tự khai phiếu nguyện vọng (001 T116; Q-412, BR-M01-18; FR-023n → FR-023q): Hành chính
// lập Nháp khi người cao tuổi còn Đang tiếp nhận; Bác sĩ, Điều dưỡng thấy Nháp, Kiểm chứng hoặc Hủy nháp có lý do. Nháp
// không có hiệu lực tới khi được kiểm chứng nên luôn mang nhãn tự khai.

const SELF_REPORT_LABEL = 'Tự khai, chưa được Bác sĩ kiểm chứng'

// Thẻ bản Nháp: tiêu đề, nhãn tự khai, người lập; nội dung và nút do khối gọi truyền vào
export function DraftCard({ id, title, draft, children, actions }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 id={id} className="type-label">
          {title}
        </h4>
        <Badge variant="attention">{SELF_REPORT_LABEL}</Badge>
      </div>
      {draft.recordedBy && (
        <p className="type-caption text-muted-foreground">
          Lập bởi {draft.recordedBy}
          {draft.at && ` · ${formatDateTime(draft.at)}`}
        </p>
      )}
      {children}
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </section>
  )
}

// Hủy nháp: lý do bắt buộc (FR-023p); onDiscard(reason) gọi backend, ném lỗi thì hiện cảnh báo chung
export function DiscardDraftForm({ idPrefix, onDiscard, onCancel }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)
  const [failure, setFailure] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    if (!reason.trim()) {
      setError('Nhập lý do hủy nháp')
      return
    }
    setError(null)
    setFailure(null)
    setBusy(true)
    try {
      await onDiscard(reason.trim())
    } catch (e) {
      setFailure(problemOf(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Hủy bản Nháp" className="flex flex-col gap-3 rounded-lg border p-3">
      <Field data-invalid={!!error || undefined}>
        <FieldLabel htmlFor={`${idPrefix}-discard-reason`}>Lý do hủy nháp</FieldLabel>
        <Textarea
          id={`${idPrefix}-discard-reason`}
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-invalid={!!error || undefined}
        />
        {error && <FieldError>{error}</FieldError>}
      </Field>
      <ProblemAlert problem={failure} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="destructive" className="h-11" disabled={busy}>
          Xác nhận hủy nháp
        </Button>
        <Button type="button" variant="outline" className="h-11" onClick={onCancel}>
          Thôi
        </Button>
      </div>
    </form>
  )
}
