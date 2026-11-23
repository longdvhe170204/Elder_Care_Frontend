import { useEffect, useState } from 'react'
import {
  getResidentsByIdAssessments,
  getResidentsByResidentIdCareLevelChangeDecisions,
  getResidentsByResidentIdCarePlans,
  postResidentsByResidentIdCareLevelChangeDecisions,
} from '@/api'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { ProblemAlert } from '@/common/ProblemAlert'
import { formatDate } from '@/common/dateTime'
import { usePermissions } from '@/common/permissions/permissions'
import { problemOf } from '@/common/problem'
import { CARE_LEVEL_LABELS } from '../assessments/assessmentLabels'

// Quyết định khi gia đình không đồng ý đổi mức chăm sóc theo lần đánh giá lại (001 FR-036b, Q-424; W7, W14): giữ mức cũ
// kèm thỏa thuận lựa chọn có rủi ro đang hiệu lực (từ kế hoạch chăm sóc Hiệu lực của 005) và ngày xem lại, hoặc rời
// viện. Chỉ hiện khi lần đánh giá gần nhất đã xác nhận ra mức khác mức hiện hành và chưa có quyết định cho lần đó.

const DECISIONS = [
  ['KEEP_CURRENT_LEVEL', 'Giữ mức cũ (thỏa thuận lựa chọn có rủi ro)'],
  ['LEAVE_FACILITY', 'Rời viện'],
]

function tomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function CareLevelDecision({ residentId, currentCareLevel, residentStatus }) {
  const { can } = usePermissions()
  const [latest, setLatest] = useState(null)
  const [decisions, setDecisions] = useState(null)
  const [agreements, setAgreements] = useState([])
  const [opened, setOpened] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let live = true
    getResidentsByIdAssessments({ path: { id: residentId } })
      .then(({ data }) => {
        const confirmed = (data ?? [])
          .filter((a) => a.status === 'CONFIRMED' && a.confirmedAt)
          .sort((a, b) => (a.confirmedAt < b.confirmedAt ? 1 : -1))
        if (live) setLatest(confirmed[0] ?? null)
      })
      .catch(() => live && setLatest(null))
    getResidentsByResidentIdCareLevelChangeDecisions({ path: { residentId } })
      .then(({ data }) => live && setDecisions(data ?? []))
      .catch(() => live && setDecisions(null))
    getResidentsByResidentIdCarePlans({ path: { residentId } })
      .then(({ data }) => {
        const effective = (data ?? []).find((p) => p.status === 'EFFECTIVE')
        if (live) setAgreements(effective?.riskAgreements ?? [])
      })
      .catch(() => live && setAgreements([]))
    return () => {
      live = false
    }
  }, [residentId, reload])

  if (residentStatus !== 'IN_RESIDENCE' || !latest || !decisions) return null
  if (!latest.careLevel || latest.careLevel === currentCareLevel) return null
  const decided = decisions.find((d) => d.assessmentId === latest.id)
  const canDecide = can('RESIDENCY_CHANGE_REQUEST', 'CREATE')

  return (
    <section className="flex flex-col gap-2 rounded-xl border p-4" aria-label="Đổi mức chăm sóc theo đánh giá lại">
      <h3 className="type-card-title">Đổi mức chăm sóc theo đánh giá lại</h3>
      <p className="type-body-sm">
        {`Lần đánh giá ngày ${formatDate(latest.confirmedAt)} ra mức ${CARE_LEVEL_LABELS[latest.careLevel] ?? latest.careLevel}, khác mức hiện hành ${CARE_LEVEL_LABELS[currentCareLevel] ?? currentCareLevel ?? '—'}.`}
      </p>
      {decided ? (
        <p className="type-body-sm">
          {decided.decision === 'KEEP_CURRENT_LEVEL'
            ? `Gia đình giữ mức cũ; xem lại ngày ${formatDate(decided.reviewDate)}.`
            : 'Gia đình chọn rời viện; Hành chính lập hồ sơ kết thúc lưu trú.'}
        </p>
      ) : (
        <>
          <p className="type-caption text-muted-foreground">
            Hành chính lập yêu cầu đổi mức ở màn Điều chỉnh hợp đồng; gia đình không đồng ý thì ghi quyết định để dừng
            nhắc.
          </p>
          {canDecide && (
            <Button variant="outline" className="h-11 self-start" onClick={() => setOpened(true)}>
              Ghi quyết định khi gia đình không đồng ý
            </Button>
          )}
        </>
      )}
      {opened && (
        <DecisionSheet
          residentId={residentId}
          assessmentId={latest.id}
          agreements={agreements}
          onClose={() => setOpened(false)}
          onDone={() => {
            setOpened(false)
            setReload((k) => k + 1)
          }}
        />
      )}
    </section>
  )
}

function DecisionSheet({ residentId, assessmentId, agreements, onClose, onDone }) {
  const [decision, setDecision] = useState(agreements.length ? 'KEEP_CURRENT_LEVEL' : 'LEAVE_FACILITY')
  const [agreementId, setAgreementId] = useState('')
  const [reviewDate, setReviewDate] = useState('')
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const keep = decision === 'KEEP_CURRENT_LEVEL'
  const errors = keep
    ? {
        agreement: !agreementId && 'Chọn thỏa thuận lựa chọn có rủi ro',
        reviewDate: !reviewDate ? 'Nhập ngày xem lại' : reviewDate < tomorrow() && 'Ngày xem lại phải sau hôm nay',
      }
    : {}
  const shown = (k) => (submitted ? errors[k] || null : null)

  async function save() {
    setSubmitted(true)
    if (Object.values(errors).some(Boolean)) return
    setBusy(true)
    setFailure(null)
    try {
      await postResidentsByResidentIdCareLevelChangeDecisions({
        path: { residentId },
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: {
          assessmentId,
          decision,
          ...(keep ? { riskAgreementId: Number(agreementId), reviewDate } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      })
      onDone()
    } catch (e) {
      setFailure(problemOf(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto p-6 sm:max-w-lg">
        <SheetTitle>Gia đình không đồng ý đổi mức</SheetTitle>
        <SheetDescription>
          Viện vẫn chăm sóc theo tình trạng thực. Có quyết định thì hệ thống dừng nhắc lập yêu cầu đổi mức.
        </SheetDescription>
        <FieldGroup className="mt-4">
          <Field>
            <FieldLabel>Quyết định</FieldLabel>
            <div className="flex flex-col gap-2">
              {DECISIONS.map(([code, text]) => (
                <label key={code} className="flex items-center gap-2 type-body-sm">
                  <input
                    type="radio"
                    name="care-level-decision"
                    value={code}
                    disabled={code === 'KEEP_CURRENT_LEVEL' && agreements.length === 0}
                    checked={decision === code}
                    onChange={() => setDecision(code)}
                  />
                  {text}
                </label>
              ))}
            </div>
            {agreements.length === 0 && (
              <FieldDescription>
                Chưa có thỏa thuận lựa chọn có rủi ro đang hiệu lực: Điều dưỡng lập thỏa thuận trong kế hoạch chăm sóc,
                Bác sĩ xác nhận, rồi mới giữ mức cũ được.
              </FieldDescription>
            )}
          </Field>
          {keep && (
            <>
              <Field data-invalid={!!shown('agreement') || undefined}>
                <FieldLabel htmlFor="decision-agreement">Thỏa thuận lựa chọn có rủi ro</FieldLabel>
                <select
                  id="decision-agreement"
                  className="h-11 w-full rounded-md border border-input bg-transparent px-3"
                  value={agreementId}
                  onChange={(e) => setAgreementId(e.target.value)}
                >
                  <option value="">Chọn thỏa thuận</option>
                  {agreements.map((a) => (
                    <option key={a.id} value={a.sourceAgreementId ?? a.id}>
                      {a.choice}
                    </option>
                  ))}
                </select>
                {shown('agreement') && <FieldError>{shown('agreement')}</FieldError>}
              </Field>
              <Field data-invalid={!!shown('reviewDate') || undefined}>
                <FieldLabel htmlFor="decision-review">Ngày xem lại</FieldLabel>
                <Input
                  id="decision-review"
                  type="date"
                  className="h-11"
                  min={tomorrow()}
                  value={reviewDate}
                  onChange={(e) => setReviewDate(e.target.value)}
                />
                {shown('reviewDate') && <FieldError>{shown('reviewDate')}</FieldError>}
              </Field>
            </>
          )}
          <Field>
            <FieldLabel htmlFor="decision-note">Ghi chú</FieldLabel>
            <Textarea
              id="decision-note"
              rows={2}
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </FieldGroup>
        <div className="mt-4">
          <ProblemAlert problem={failure} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" className="h-11" onClick={onClose}>
            Đóng
          </Button>
          <Button className="h-11" disabled={busy} onClick={save}>
            Lưu quyết định
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
