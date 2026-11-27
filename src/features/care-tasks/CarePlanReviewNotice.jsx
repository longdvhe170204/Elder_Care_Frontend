import { useEffect, useState } from 'react'
import { getResidentsByResidentIdCarePlanReviews, postResidentsByResidentIdCarePlanReviewsDismiss } from '@/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { ProblemAlert } from '@/common/ProblemAlert'
import { formatDateTime } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { AssessmentBasis } from './AssessmentBasis'
import { CareField } from './CareField'
import { reviewSource } from './carePlanLabels'

const ASSESSMENT_SOURCES = new Set(['M01.INITIAL_ASSESSMENT', 'M01.ASSESSMENT'])

// Q-448 (FR-058, FR-059): lý do cần xem xét kế hoạch, đặt trên kế hoạch; "Không cần thay đổi" đóng mọi yêu cầu đang mở,
// lý do bắt buộc. Lập hoặc sửa kế hoạch rồi được Bác sĩ duyệt thì yêu cầu tự đóng.
export function CarePlanReviewNotice({ residentId, reload, canDismiss, onDismissed }) {
  const [reviews, setReviews] = useState([])
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)
  const [failure, setFailure] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let cancelled = false
    getResidentsByResidentIdCarePlanReviews({ path: { residentId } })
      .then(({ data }) => {
        if (!cancelled) setReviews(data)
      })
      .catch(() => {
        if (!cancelled) setReviews([])
      })
    return () => {
      cancelled = true
    }
  }, [residentId, reload])
  if (reviews.length === 0) return null
  async function dismiss(event) {
    event.preventDefault()
    if (!reason.trim()) {
      setError('Nhập lý do không cần thay đổi kế hoạch.')
      return
    }
    setBusy(true)
    setFailure(null)
    try {
      await postResidentsByResidentIdCarePlanReviewsDismiss({
        path: { residentId },
        body: { reason: reason.trim() },
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      })
      setAsking(false)
      setReason('')
      setReviews([])
      onDismissed?.()
    } catch (problem) {
      setFailure(problemOf(problem))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section
      aria-label="Cần xem xét kế hoạch"
      className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-dashed border-(--warning-foreground)/40 bg-warning/40 p-4"
    >
      <div className="flex flex-col gap-2">
        <h3 className="type-card-title">Cần xem xét kế hoạch</h3>
        <ul className="flex flex-col gap-1">
          {reviews.map((review) => (
            <li key={`${review.source}:${review.reference}`} className="flex flex-col gap-2">
              <span>
                {reviewSource(review.source)}, {formatDateTime(review.raisedAt)}
              </span>
              {/* Q-448: lý do từ đánh giá thì hiện luôn nội dung đánh giá để biết cần lập mục nào */}
              {ASSESSMENT_SOURCES.has(review.source) && <AssessmentBasis assessmentId={review.sourceId} />}
            </li>
          ))}
        </ul>
        <p className="type-body-sm text-muted-foreground">
          Lập hoặc sửa kế hoạch rồi gửi Bác sĩ duyệt. Nếu kế hoạch hiện tại vẫn phù hợp, chọn Không cần thay đổi.
        </p>
      </div>
      {canDismiss && (
        <Button variant="outline" onClick={() => setAsking(true)}>
          Không cần thay đổi
        </Button>
      )}
      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent className="sm:max-w-md">
          <form className="flex flex-col gap-4" onSubmit={dismiss} noValidate>
            <DialogTitle className="type-title">Không cần thay đổi kế hoạch</DialogTitle>
            <DialogDescription>
              Các lý do cần xem xét ở trên sẽ được đóng. Lý do bạn nhập được lưu vào nhật ký.
            </DialogDescription>
            <ProblemAlert problem={failure} />
            <CareField
              label="Lý do không cần thay đổi *"
              type="textarea"
              value={reason}
              onChange={(value) => {
                setReason(value)
                setError(null)
              }}
              maxLength={2000}
              required
              error={error}
            />
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setAsking(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={busy}>
                Xác nhận không cần thay đổi
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
