import { useEffect, useState } from 'react'
import { getAssessmentsById, getResidentsByIdAssessments } from '@/api'
import { formatDate } from '@/common/dateTime'
import { CARE_LEVELS } from '@/features/admissions/admissionLabels'

const LEVELS = Object.fromEntries(CARE_LEVELS)

// Q-448: nội dung đánh giá của Bác sĩ làm căn cứ lập kế hoạch (Q-280: Điều dưỡng lập tay dựa trên nhận xét và lưu ý
// chăm sóc). Chỉ hiện để đọc; hệ thống không tự tạo mục công việc từ nhu cầu (Q-306, Q-307). Có assessmentId thì đọc
// đúng lần đó, không thì lần Đã xác nhận mới nhất của người cao tuổi. Không xem được (403, lỗi) thì không hiện gì.
export function AssessmentBasis({ assessmentId, residentId, title }) {
  const [assessment, setAssessment] = useState(null)
  useEffect(() => {
    let cancelled = false
    const load = assessmentId
      ? getAssessmentsById({ path: { id: assessmentId } }).then(({ data }) => data)
      : getResidentsByIdAssessments({ path: { id: residentId } }).then(({ data }) =>
          data
            .filter((a) => a.status === 'CONFIRMED' && a.confirmedAt)
            .sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt))
            .at(0),
        )
    load
      .then((value) => {
        if (!cancelled) setAssessment(value ?? null)
      })
      .catch(() => {
        if (!cancelled) setAssessment(null)
      })
    return () => {
      cancelled = true
    }
  }, [assessmentId, residentId])
  if (!assessment) return null
  const needs = assessment.careNeeds ?? []
  const body = (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
      <dt className="type-caption text-muted-foreground">Mức chăm sóc</dt>
      <dd className="type-body font-semibold">{LEVELS[assessment.careLevel] ?? '—'}</dd>
      <dt className="type-caption text-muted-foreground">Nhu cầu chăm sóc</dt>
      <dd className="type-body">
        {needs.length === 0 ? (
          'Không có nhu cầu riêng'
        ) : (
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {needs.map((need) => (
              <li key={need.id ?? need.name}>{need.name}</li>
            ))}
          </ul>
        )}
      </dd>
      {assessment.careNote && (
        <>
          <dt className="type-caption text-muted-foreground">Lưu ý chăm sóc</dt>
          <dd className="type-body">{assessment.careNote}</dd>
        </>
      )}
      {assessment.comment && (
        <>
          <dt className="type-caption text-muted-foreground">Nhận xét</dt>
          <dd className="type-body">{assessment.comment}</dd>
        </>
      )}
    </dl>
  )
  const byline = `${assessment.confirmedBy ? `Bác sĩ ${assessment.confirmedBy}` : 'Bác sĩ'} xác nhận ngày ${formatDate(
    assessment.confirmedAt,
  )}`
  if (!title) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
        <p className="type-body-sm text-muted-foreground">{byline}</p>
        {body}
      </div>
    )
  }
  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-col gap-1">
        <h3 className="type-card-title">{title}</h3>
        <p className="type-body-sm text-muted-foreground">{byline}</p>
      </div>
      {body}
    </section>
  )
}
