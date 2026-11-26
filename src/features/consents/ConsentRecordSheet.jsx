import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import {
  ApiError,
  getResidentsByIdConsents,
  getResidentsByResidentIdRelationships,
  postResidentsByIdConsents,
} from '@/api'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { DateField } from '@/common/DateField'
import { DiscardChangesDialog } from '@/common/DiscardChangesDialog'
import { ProblemAlert } from '@/common/ProblemAlert'
import { formatDate } from '@/common/dateTime'
import { displayDate, isoDate, todayIso } from '@/common/dateText'
import { uploadFile } from '@/common/files'
import { problemOf } from '@/common/problem'
import { cn } from '@/lib/utils'
import { Choices } from '../admissions/FormParts'
import { RELATIONSHIP_LABELS } from '../relatives/relationshipLabels'
import { CONSENTER_LABELS } from './consentLabels'

// Ghi nhận bản đồng ý chia sẻ dữ liệu (001 FR-010 → FR-013; nghiệp vụ 5.1; chủ dự án duyệt bố cục 2026-11-26): khung xl,
// đầu, chân cố định; ba nhóm theo thứ tự tờ giấy (người ký, phạm vi, ngày ký và bản ký); không có dòng giải thích. Đã có
// bản Hiệu lực thì tóm tắt ở đầu, bản mới thay bản đó (FR-013). Mọi ô bắt đầu tắt (Q-307). Hỏi lại khi đóng chưa lưu.

const FORM_ID = 'consent-record-form'
const ACCEPT = 'application/pdf,image/jpeg,image/png'
const POSITIVE_INTEGER = /^[1-9]\d{0,17}$/

function uploadProblem(problem) {
  if (problem.errorCode === 'FILE_TYPE_NOT_ALLOWED') return 'Tệp phải là PDF, JPEG hoặc PNG'
  if (problem.errorCode === 'FILE_TOO_LARGE') return 'Tệp quá 10 MB'
  return null
}

function Required() {
  return (
    <span aria-hidden="true" className="text-destructive">
      *
    </span>
  )
}

// Chọn tệp với nút, chữ tiếng Việt (ô tệp gốc của trình duyệt hiện "Choose File" theo ngôn ngữ máy)
export function FilePick({ id, label, file, onPick, error, required = true }) {
  const input = useRef(null)
  return (
    <Field data-invalid={!!error || undefined}>
      <FieldLabel htmlFor={id}>
        {label} {required && <Required />}
      </FieldLabel>
      <div
        className={cn(
          'flex min-h-11 items-center gap-3 rounded-[10px] border border-dashed bg-muted/40 px-2 py-1.5',
          error ? 'border-destructive' : 'border-input',
        )}
      >
        <input
          ref={input}
          id={id}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          aria-invalid={!!error || undefined}
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
        <Button type="button" variant="outline" className="h-9" onClick={() => input.current?.click()}>
          Chọn tệp
        </Button>
        <span className={cn('min-w-0 truncate type-body-sm', !file && 'text-muted-foreground')}>
          {file ? file.name : 'Chưa chọn tệp'}
        </span>
      </div>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}

function rolesText(r) {
  return [
    RELATIONSHIP_LABELS[r.relationship] ?? r.relationship,
    r.primaryContact && 'liên hệ chính',
    r.representative && 'người đại diện',
  ]
    .filter(Boolean)
    .join(', ')
}

function CheckCard({ checked, onToggle, title, detail }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={cn(
        'flex min-h-14 w-full items-center gap-3 rounded-[10px] border px-3 py-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        checked ? 'border-primary bg-accent/30' : 'border-border bg-card hover:bg-muted',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-[4px] border-[1.5px]',
          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
        )}
      >
        {checked && <Check className="size-3" strokeWidth={3} />}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="type-body-sm">{title}</span>
        {detail && <span className="type-caption text-muted-foreground">{detail}</span>}
      </span>
    </button>
  )
}

export function ConsentRecordSheet({ residentId, residentName, onClose, onDone }) {
  const [current, setCurrent] = useState(null)
  const [members, setMembers] = useState(null)
  const [signer, setSigner] = useState('RESIDENT')
  const [signerId, setSignerId] = useState('')
  const [court, setCourt] = useState({ number: '', date: '', court: '' })
  const [courtFile, setCourtFile] = useState(null)
  const [ids, setIds] = useState([])
  const [photo, setPhoto] = useState(false)
  const [notification, setNotification] = useState(false)
  const [date, setDate] = useState(() => displayDate(todayIso()))
  const [evidence, setEvidence] = useState(null)
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [key] = useState(() => crypto.randomUUID())
  // tệp đã tải lên theo đối tượng File, để gửi lại sau lỗi không tải lên lần nữa
  const uploaded = useRef(new Map())

  useEffect(() => {
    let live = true
    getResidentsByIdConsents({ path: { id: residentId } })
      .then(({ data }) => live && setCurrent((data ?? []).find((c) => c.status === 'ACTIVE') ?? null))
      .catch(() => {})
    getResidentsByResidentIdRelationships({ path: { residentId } })
      .then(
        ({ data }) => live && setMembers((data ?? []).filter((r) => r.status === undefined || r.status === 'ACTIVE')),
      )
      .catch(() => live && setMembers([]))
    return () => {
      live = false
    }
  }, [residentId])

  const rep = signer === 'LEGAL_REPRESENTATIVE'
  const dirty = !!(rep || evidence || ids.length || photo || notification)
  const requestClose = () => (dirty ? setConfirmClose(true) : onClose())
  const nameOf = (id) => members?.find((r) => r.familyMember.id === id)?.familyMember.fullName ?? `người thân mã ${id}`

  async function upload(file) {
    if (!uploaded.current.has(file)) uploaded.current.set(file, await uploadFile(file))
    return uploaded.current.get(file)
  }

  function validate() {
    const today = todayIso()
    const next = {}
    const day = isoDate(date)
    if (!day) next.date = 'Nhập ngày đồng ý dạng DD/MM/YYYY'
    else if (day > today) next.date = 'Ngày đồng ý không ở tương lai'
    if (!evidence) next.evidence = 'Chọn tệp bản ký đã scan'
    if (rep) {
      if (!POSITIVE_INTEGER.test(signerId)) next.signerId = 'Chọn người thân là người ký'
      if (!court.number.trim()) next.number = 'Nhập số quyết định'
      const courtDay = isoDate(court.date)
      if (!courtDay) next.courtDate = 'Nhập ngày quyết định dạng DD/MM/YYYY'
      else if (courtDay > today) next.courtDate = 'Ngày quyết định không ở tương lai'
      if (!court.court.trim()) next.courtName = 'Nhập tên Tòa án'
      if (!courtFile) next.courtFile = 'Chọn tệp quyết định của Tòa án'
    }
    return next
  }

  async function submit(event) {
    event.preventDefault()
    const next = validate()
    setErrors(next)
    if (Object.keys(next).length > 0) return
    setFailure(null)
    setBusy(true)
    let step = 'evidence'
    try {
      const evidenceFileId = await upload(evidence)
      let courtDecision
      if (rep) {
        step = 'courtFile'
        courtDecision = {
          number: court.number.trim(),
          date: isoDate(court.date),
          court: court.court.trim(),
          fileId: await upload(courtFile),
        }
      }
      step = 'save'
      const { data } = await postResidentsByIdConsents({
        path: { id: residentId },
        headers: { 'Idempotency-Key': key },
        body: {
          consenterType: signer,
          consenterFamilyMemberId: rep ? Number(signerId) : undefined,
          courtDecision,
          familyMemberIdsAllowedHealthView: ids,
          photoConsent: photo,
          notificationConsent: notification,
          consentedAt: new Date(`${isoDate(date)}T00:00:00+07:00`).toISOString(),
          evidenceFileId,
        },
      })
      onDone(data)
    } catch (error) {
      const problem = problemOf(error)
      const fileMessage = step === 'save' ? null : uploadProblem(problem)
      if (fileMessage) setErrors({ [step]: fileMessage })
      else if (error instanceof ApiError && problem.errorCode === 'INVALID_SIGNER')
        setErrors({ signerId: 'Người ký thay phải là người thân có quan hệ Hiệu lực với người cao tuổi' })
      else if (error instanceof ApiError && problem.errorCode === 'COURT_DECISION_REQUIRED')
        setErrors({ number: 'Cần đủ số, ngày, Tòa án và tệp quyết định của Tòa án' })
      else setFailure(problem)
    } finally {
      setBusy(false)
    }
  }

  const toggle = (id) => setIds((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))

  return (
    <Sheet open onOpenChange={(next) => !next && requestClose()}>
      <SheetContent className="gap-0 p-0 sm:max-w-xl">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 flex-col gap-1 border-b px-6 pt-6 pb-4 pr-12">
            <SheetTitle className="type-title">{`Bản đồng ý của ${residentName}`}</SheetTitle>
          </div>

          <form
            id={FORM_ID}
            onSubmit={submit}
            noValidate
            aria-busy={busy || undefined}
            className="flex min-h-0 flex-1 flex-col divide-y overflow-y-auto px-6"
          >
            {current && (
              <div className="py-4">
                <div className="flex flex-col rounded-lg border bg-muted px-3 py-2.5">
                  <p className="type-body-sm">
                    {'Hiện hành: '}
                    <span className="font-medium">{CONSENTER_LABELS[current.consenterType]}</span>
                    {` ký ngày ${formatDate(current.consentedAt)}`}
                  </p>
                  <p className="type-caption text-muted-foreground">
                    {current.familyMemberIdsAllowedHealthView.length > 0
                      ? `Xem sức khỏe: ${current.familyMemberIdsAllowedHealthView.map(nameOf).join(', ')}`
                      : 'Không người thân nào xem sức khỏe'}
                  </p>
                </div>
              </div>
            )}

            <div className="py-6">
              <FieldSet disabled={busy}>
                <Choices
                  label="01 · Người ký"
                  required
                  options={Object.entries(CONSENTER_LABELS)}
                  value={signer}
                  onChange={setSigner}
                />
                {rep && (
                  <div className="mt-4 flex flex-col gap-4">
                    <Field data-invalid={!!errors.signerId || undefined}>
                      <FieldLabel htmlFor="consent-signer-id">
                        Người thân là người ký <Required />
                      </FieldLabel>
                      <select
                        id="consent-signer-id"
                        className="h-11 w-full rounded-md border border-input bg-transparent px-3"
                        value={signerId}
                        onChange={(e) => setSignerId(e.target.value)}
                        aria-invalid={!!errors.signerId || undefined}
                      >
                        <option value="">{members?.length ? 'Chọn người thân' : 'Chưa có người thân'}</option>
                        {(members ?? []).map((r) => (
                          <option key={r.familyMember.id} value={String(r.familyMember.id)}>
                            {`${r.familyMember.fullName} (${(RELATIONSHIP_LABELS[r.relationship] ?? r.relationship).toLowerCase()})`}
                          </option>
                        ))}
                      </select>
                      {errors.signerId && <FieldError>{errors.signerId}</FieldError>}
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field data-invalid={!!errors.number || undefined}>
                        <FieldLabel htmlFor="consent-court-number">
                          Số quyết định <Required />
                        </FieldLabel>
                        <Input
                          id="consent-court-number"
                          className="h-11"
                          placeholder="Ví dụ: 12/2026/QĐ-TA"
                          value={court.number}
                          onChange={(e) => setCourt({ ...court, number: e.target.value })}
                          aria-invalid={!!errors.number || undefined}
                        />
                        {errors.number && <FieldError>{errors.number}</FieldError>}
                      </Field>
                      <Field data-invalid={!!errors.courtDate || undefined}>
                        <FieldLabel htmlFor="consent-court-date">
                          Ngày quyết định <Required />
                        </FieldLabel>
                        <DateField
                          id="consent-court-date"
                          max={todayIso()}
                          value={court.date}
                          onChange={(text) => setCourt({ ...court, date: text })}
                          invalid={!!errors.courtDate}
                        />
                        {errors.courtDate && <FieldError>{errors.courtDate}</FieldError>}
                      </Field>
                    </div>
                    <Field data-invalid={!!errors.courtName || undefined}>
                      <FieldLabel htmlFor="consent-court-name">
                        Tòa án <Required />
                      </FieldLabel>
                      <Input
                        id="consent-court-name"
                        className="h-11"
                        placeholder="Ví dụ: Tòa án nhân dân Quận 1"
                        value={court.court}
                        onChange={(e) => setCourt({ ...court, court: e.target.value })}
                        aria-invalid={!!errors.courtName || undefined}
                      />
                      {errors.courtName && <FieldError>{errors.courtName}</FieldError>}
                    </Field>
                    <FilePick
                      id="consent-court-file"
                      label="Bản scan quyết định"
                      file={courtFile}
                      onPick={setCourtFile}
                      error={errors.courtFile}
                    />
                  </div>
                )}
              </FieldSet>
            </div>

            <div className="py-6">
              <FieldSet disabled={busy}>
                <FieldLegend className="type-label mb-4">02 · Phạm vi đồng ý</FieldLegend>
                <div className="flex flex-col gap-1.5" role="group" aria-labelledby="consent-health-label">
                  <span id="consent-health-label" className="type-body-sm">
                    Người thân được xem sức khỏe
                  </span>
                  {members === null ? null : members.length === 0 ? (
                    <span className="type-body-sm text-muted-foreground">Chưa có người thân</span>
                  ) : (
                    members.map((r) => (
                      <CheckCard
                        key={r.familyMember.id}
                        checked={ids.includes(r.familyMember.id)}
                        onToggle={() => toggle(r.familyMember.id)}
                        title={r.familyMember.fullName}
                        detail={rolesText(r)}
                      />
                    ))
                  )}
                </div>
                <div className="mt-4 flex flex-col gap-1.5">
                  <CheckCard
                    checked={photo}
                    onToggle={() => setPhoto((v) => !v)}
                    title="Dùng hình ảnh của người cao tuổi"
                  />
                  <CheckCard
                    checked={notification}
                    onToggle={() => setNotification((v) => !v)}
                    title="Người thân nhận thông báo không khẩn"
                  />
                </div>
              </FieldSet>
            </div>

            <div className="py-6">
              <FieldSet disabled={busy}>
                <FieldLegend className="type-label mb-4">03 · Ngày ký và bản ký</FieldLegend>
                <div className="flex flex-col gap-4">
                  <Field data-invalid={!!errors.date || undefined}>
                    <FieldLabel htmlFor="consent-date">
                      Ngày đồng ý <Required />
                    </FieldLabel>
                    <DateField
                      id="consent-date"
                      max={todayIso()}
                      value={date}
                      onChange={setDate}
                      invalid={!!errors.date}
                    />
                    {errors.date && <FieldError>{errors.date}</FieldError>}
                  </Field>
                  <FilePick
                    id="consent-evidence"
                    label="Bản ký đã scan"
                    file={evidence}
                    onPick={setEvidence}
                    error={errors.evidence}
                  />
                </div>
              </FieldSet>
            </div>

            {failure && (
              <div className="py-6">
                <ProblemAlert problem={failure} />
              </div>
            )}
          </form>

          <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t px-6 py-4">
            <Button type="button" variant="outline" className="h-11" onClick={requestClose}>
              Hủy
            </Button>
            <Button type="submit" form={FORM_ID} className="h-11" disabled={busy}>
              {busy ? 'Đang lưu…' : current ? 'Lưu bản mới' : 'Lưu bản đồng ý'}
            </Button>
          </div>
        </div>
      </SheetContent>
      <DiscardChangesDialog
        open={confirmClose}
        onKeep={() => setConfirmClose(false)}
        onDiscard={() => {
          setConfirmClose(false)
          onClose()
        }}
      />
    </Sheet>
  )
}
