import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  ApiError,
  getResidentsByIdEndOfLifeWishDraft,
  getResidentsByIdEndOfLifeWishes,
  postResidentsByIdEndOfLifeWishDraftDiscard,
  postResidentsByIdEndOfLifeWishDraftVerify,
  postResidentsByIdEndOfLifeWishes,
  putResidentsByIdEndOfLifeWishDraft,
} from '@/api'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { DateField } from '@/common/DateField'
import { isoDate } from '@/common/dateText'
import { ProblemAlert } from '@/common/ProblemAlert'
import { StatusBadge } from '@/common/StatusBadge'
import { formatDate, formatDateTime } from '@/common/dateTime'
import { uploadFile } from '@/common/files'
import { problemOf } from '@/common/problem'
import { cn } from '@/lib/utils'
import { FilePick } from '../consents/ConsentRecordSheet'
import { FileField, Row } from '../consents/ConsentTab'
import { POSITIVE_INTEGER, today, uploadProblem, toRequestOpinion } from './wishUtils'
import { FamilyMemberSelect } from '@/common/FamilyMemberSelect'
import { useFamilyMembers } from '@/common/useFamilyMembers'
import { OpinionEditor, OpinionList } from './Opinions'
import { DiscardDraftForm, DraftCard } from './WishDraft'
import { useWishDraft } from './useWishDraft'
import { DoctorSelect, WishSheet } from './WishSheet'
import {
  CHOICE_LABELS,
  END_OF_LIFE_STATUS_LABELS,
  FINAL_STATUSES,
  SELECTION_LABELS,
  SIGNER_LABELS,
  SOURCE_LABELS,
  WISH_ERRORS,
} from './wishLabels'

// Khối "Nguyện vọng cuối đời" của tab Nguyện vọng (001 T070; US7; FR-023a → FR-023i; bố cục đề xuất 2026-10-23). Thẻ phiếu
// hiện hành kèm nút theo allowedCommands, form ghi phiên bản mới mở ngay dưới thẻ, lịch sử các phiên bản. Nhận định "tự
// quyết được" chỉ hiện bên trong chính phiếu (FR-023h), kèm dòng "Người quyết định". Hành chính, Kế toán không xem được
// nội dung: chỉ thấy "Đã có phiếu" hoặc "Chưa có phiếu" (FR-023e). Tạm thời: mã Bác sĩ nhận định và mã người thân nhập
// tay vì chưa có danh sách (feature 008, 012); backend kiểm vai trò Bác sĩ và quan hệ Hiệu lực.
// Rà soát cho Bác sĩ 2026-11-26 (chủ dự án duyệt): ghi, kiểm chứng phiếu mở khung riêng (WishSheet); chưa có phiếu Hiệu
// lực chỉ ghi một dòng; ẩn lịch sử khi trống; ý kiến khác ghi tên người thân.

function yesNo(value) {
  return value ? 'Có' : 'Không'
}

function Required() {
  return (
    <span aria-hidden="true" className="text-destructive">
      *
    </span>
  )
}

function WishDetails({ wish, residentId }) {
  const assessment = wish.selfDeterminationAssessment
  return (
    <>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div className="col-span-2">
          <Row label="Lựa chọn khi nguy kịch">{CHOICE_LABELS[wish.choice]}</Row>
        </div>
        <Row label="Người cần liên hệ trước khi thực hiện">{wish.firstContact}</Row>
        <Row label="Nguồn phiếu">{SOURCE_LABELS[wish.source]}</Row>
        <div className="col-span-2">
          <Row label="Người quyết định">
            {SIGNER_LABELS[wish.signerType]}
            {wish.signer && ` · ${wish.signer}`}
            {wish.representativeSelection && ` · ${SELECTION_LABELS[wish.representativeSelection]}`}
          </Row>
        </div>
        {wish.note && (
          <div className="col-span-2">
            <Row label="Ghi chú">{wish.note}</Row>
          </div>
        )}
        <Row label="Ngày ký">{formatDate(wish.signedAt)}</Row>
      </dl>
      <section aria-label="Nhận định của Bác sĩ cho phiếu này" className="flex flex-col gap-2 rounded-lg border p-3">
        <h4 className="type-label">Nhận định của Bác sĩ cho phiếu này</h4>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Row label="Tự quyết được việc chọn này">{yesNo(assessment.canSelfDetermine)}</Row>
          <Row label="Ghi lúc">{formatDateTime(assessment.at)}</Row>
          <div className="col-span-2">
            <Row label="Cách đã hỗ trợ hiểu thông tin">{assessment.supportMethod}</Row>
          </div>
          <Row label="Ngày xem lại nhận định">{formatDate(assessment.reviewDate)}</Row>
        </dl>
      </section>
      <OpinionList opinions={wish.otherOpinions} residentId={residentId} />
    </>
  )
}

function RadioRow({ label, labelId, options, value, onChange, error, required = false }) {
  return (
    <Field data-invalid={!!error || undefined}>
      <span className="type-label" id={labelId}>
        {label} {required && <Required />}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {options.map(([optionValue, optionLabel]) => (
          <Button
            key={String(optionValue)}
            type="button"
            role="radio"
            aria-checked={value === optionValue}
            variant={value === optionValue ? 'default' : 'outline'}
            className="h-10"
            onClick={() => onChange(optionValue)}
          >
            {optionLabel}
          </Button>
        ))}
      </div>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}

function TextField({ id, label, value, onChange, error, hint, inputMode, type, required = false }) {
  return (
    <Field data-invalid={!!error || undefined}>
      <FieldLabel htmlFor={id}>
        {label} {required && <Required />}
      </FieldLabel>
      <Input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error || undefined}
      />
      {error ? <FieldError>{error}</FieldError> : hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  )
}

// Ghi phiếu mới trong khung riêng, kiểm chứng ngay trong thẻ Nháp (chủ dự án duyệt 2026-11-26): 01 Lựa chọn và người liên
// hệ, 02 Nhận định của Bác sĩ, 03 Người quyết định và bản ký; ý kiến khác gập lại. Ngày gõ DD/MM/YYYY, không điền sẵn (Q-307).
function WishForm({ residentId, onCancel, onDone, mode = 'record', initial = null, onDiscardDraft }) {
  const verify = mode === 'verify'
  // Demo 2026-11-25: người ký, Bác sĩ nhận định chọn theo tên thay cho ô nhập mã
  const members = useFamilyMembers(residentId)
  const [v, setV] = useState({
    choice: initial?.choice ?? null,
    firstContact: initial?.firstContact ?? '',
    note: initial?.note ?? '',
    doctorId: '',
    canSelf: null,
    supportMethod: '',
    reviewDate: '',
    signerType: null,
    signerId: '',
    relationship: '',
    selection: null,
    courtNumber: '',
    courtDate: '',
    courtName: '',
    signedAt: '',
    source: null,
  })
  const [opinions, setOpinionsState] = useState([])
  const [opinionsOpen, setOpinionsOpen] = useState(false)
  const [signedCopy, setSignedCopyState] = useState(null)
  const [courtFile, setCourtFileState] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [editing, setEditing] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState(null)
  const [busy, setBusy] = useState(false)
  const [key] = useState(() => crypto.randomUUID())
  // tệp đã tải lên theo đối tượng File, để gửi lại sau lỗi không tải lên lần nữa
  const uploaded = useRef(new Map())
  const touched = (fn) => (value) => {
    setDirty(true)
    fn(value)
  }
  const set = (name) => touched((value) => setV((current) => ({ ...current, [name]: value })))
  const setOpinions = touched(setOpinionsState)
  const setSignedCopy = touched(setSignedCopyState)
  const setCourtFile = touched(setCourtFileState)

  async function upload(file) {
    if (!uploaded.current.has(file)) uploaded.current.set(file, await uploadFile(file))
    return uploaded.current.get(file)
  }

  const canSelf = v.canSelf === true
  const legal = v.signerType === 'LEGAL_REPRESENTATIVE'
  const patientRep = v.signerType === 'PATIENT_REPRESENTATIVE'
  const reviewIso = isoDate(v.reviewDate)
  const signedIso = isoDate(v.signedAt)
  const courtIso = isoDate(v.courtDate)

  function validate() {
    const next = {}
    if (!v.choice) next.choice = 'Chọn một lựa chọn'
    if (!v.firstContact.trim()) next.firstContact = WISH_ERRORS.FIRST_CONTACT_REQUIRED[1]
    if (!POSITIVE_INTEGER.test(v.doctorId.trim())) next.doctorId = 'Chọn Bác sĩ nhận định'
    if (v.canSelf === null) next.canSelf = 'Chọn nhận định của Bác sĩ'
    if (!v.supportMethod.trim()) next.supportMethod = 'Nhập cách đã hỗ trợ người cao tuổi hiểu thông tin'
    if (!reviewIso) next.reviewDate = 'Nhập ngày xem lại dạng DD/MM/YYYY'
    else if (reviewIso < today()) next.reviewDate = WISH_ERRORS.INVALID_REVIEW_DATE[1]
    if (v.canSelf === false) {
      if (!v.signerType) next.signerType = 'Chọn người ký thay'
      if (!POSITIVE_INTEGER.test(v.signerId.trim())) next.signerId = 'Chọn người thân là người ký'
      if (!v.relationship.trim()) next.relationship = 'Nhập quan hệ với người cao tuổi'
      if (patientRep && !v.selection) next.selection = WISH_ERRORS.REPRESENTATIVE_SELECTION_REQUIRED[1]
      if (legal) {
        if (!v.courtNumber.trim()) next.courtNumber = 'Nhập số quyết định'
        if (!courtIso) next.courtDate = 'Nhập ngày quyết định dạng DD/MM/YYYY'
        if (!v.courtName.trim()) next.courtName = 'Nhập tên Tòa án'
        if (!courtFile) next.courtFile = 'Chọn tệp quyết định của Tòa án'
      }
    }
    if (!signedCopy) next.signedCopy = WISH_ERRORS.EVIDENCE_REQUIRED[1]
    if (!signedIso) next.signedAt = 'Nhập ngày ký dạng DD/MM/YYYY'
    if (!verify && !v.source) next.source = 'Chọn nguồn phiếu'
    return next
  }

  async function submit(event) {
    event.preventDefault()
    const next = validate()
    setErrors(next)
    if (Object.keys(next).length > 0) return
    setFailure(null)
    setBusy(true)
    let step = 'signedCopy'
    try {
      const signedCopyFileId = await upload(signedCopy)
      let courtDecision
      if (canSelf === false && legal) {
        step = 'courtFile'
        courtDecision = {
          number: v.courtNumber.trim(),
          date: courtIso,
          court: v.courtName.trim(),
          fileId: await upload(courtFile),
        }
      }
      step = 'save'
      const signer = canSelf ? 'RESIDENT' : v.signerType
      const save = verify ? postResidentsByIdEndOfLifeWishDraftVerify : postResidentsByIdEndOfLifeWishes
      const { data } = await save({
        path: { id: residentId },
        headers: { 'Idempotency-Key': key },
        body: {
          choice: v.choice,
          firstContact: v.firstContact.trim(),
          note: v.note.trim() || undefined,
          respondentType: signer,
          respondentFamilyMemberId: canSelf ? undefined : Number(v.signerId.trim()),
          relationship: canSelf ? undefined : v.relationship.trim(),
          assessingDoctorId: Number(v.doctorId.trim()),
          selfDeterminationAssessment: {
            canSelfDetermine: canSelf,
            supportMethod: v.supportMethod.trim(),
            reviewDate: reviewIso,
          },
          signerType: signer,
          signerFamilyMemberId: canSelf ? undefined : Number(v.signerId.trim()),
          representativeSelection: patientRep && !canSelf ? v.selection : undefined,
          courtDecision,
          otherOpinions: opinions.map(toRequestOpinion),
          signedAt: new Date(`${signedIso}T00:00:00+07:00`).toISOString(),
          signedCopyFileId,
          source: verify ? undefined : v.source,
        },
      })
      onDone(data)
    } catch (error) {
      const problem = problemOf(error)
      const fileMessage = step === 'save' ? null : uploadProblem(problem)
      const mapped = error instanceof ApiError ? WISH_ERRORS[problem.errorCode] : null
      if (fileMessage) setErrors({ [step]: fileMessage })
      else if (mapped) setErrors({ [mapped[0]]: mapped[1] })
      else setFailure(problem)
    } finally {
      setBusy(false)
    }
  }

  const dateField = (id, label, name, required = true) => (
    <Field data-invalid={!!errors[name] || undefined}>
      <FieldLabel htmlFor={id}>
        {label} {required && <Required />}
      </FieldLabel>
      <DateField id={id} value={v[name]} onChange={set(name)} invalid={!!errors[name]} />
      {errors[name] && <FieldError>{errors[name]}</FieldError>}
    </Field>
  )

  const group01 = (
    <div className="flex flex-col gap-5">
      <RadioRow
        label="Lựa chọn khi nguy kịch"
        labelId="eol-choice"
        required
        options={Object.entries(CHOICE_LABELS)}
        value={v.choice}
        onChange={set('choice')}
        error={errors.choice}
      />
      <TextField
        id="eol-first-contact"
        required
        label="Người cần liên hệ trước khi thực hiện"
        value={v.firstContact}
        onChange={set('firstContact')}
        error={errors.firstContact}
      />
      <Field>
        <FieldLabel htmlFor="eol-note">Ghi chú</FieldLabel>
        <Textarea id="eol-note" rows={2} value={v.note} onChange={(e) => set('note')(e.target.value)} />
      </Field>
      {!verify && (
        <RadioRow
          label="Nguồn phiếu"
          labelId="eol-source"
          required
          options={[
            ['ADMISSION', SOURCE_LABELS.ADMISSION],
            ['FAMILY_REQUEST', SOURCE_LABELS.FAMILY_REQUEST],
          ]}
          value={v.source}
          onChange={set('source')}
          error={errors.source}
        />
      )}
    </div>
  )

  const group02 = (
    <div className="flex flex-col gap-5">
      <DoctorSelect id="eol-doctor" value={v.doctorId} onChange={set('doctorId')} error={errors.doctorId} />
      <RadioRow
        label="Người cao tuổi tự quyết được việc chọn này"
        labelId="eol-can-self"
        required
        options={[
          [true, 'Có'],
          [false, 'Không'],
        ]}
        value={v.canSelf}
        onChange={set('canSelf')}
        error={errors.canSelf}
      />
      <Field data-invalid={!!errors.supportMethod || undefined}>
        <FieldLabel htmlFor="eol-support">
          Cách đã hỗ trợ người cao tuổi hiểu thông tin <Required />
        </FieldLabel>
        <Textarea
          id="eol-support"
          rows={2}
          value={v.supportMethod}
          placeholder="Giải thích bằng lời, có người thân cùng nghe, nhắc lại sau một ngày"
          onChange={(e) => set('supportMethod')(e.target.value)}
          aria-invalid={!!errors.supportMethod || undefined}
        />
        {errors.supportMethod && <FieldError>{errors.supportMethod}</FieldError>}
      </Field>
      {dateField('eol-review-date', 'Ngày xem lại nhận định', 'reviewDate')}
    </div>
  )

  const group03 = (
    <div className="flex flex-col gap-5">
      {v.canSelf === true && <p className="type-body-sm">Người quyết định: Người cao tuổi</p>}
      {v.canSelf === false && (
        <>
          <RadioRow
            label="Người ký thay"
            labelId="eol-signer-type"
            required
            options={[
              ['PATIENT_REPRESENTATIVE', SIGNER_LABELS.PATIENT_REPRESENTATIVE],
              ['LEGAL_REPRESENTATIVE', SIGNER_LABELS.LEGAL_REPRESENTATIVE],
            ]}
            value={v.signerType}
            onChange={set('signerType')}
            error={errors.signerType}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <FamilyMemberSelect
              id="eol-signer-id"
              label="Người thân là người ký"
              members={members}
              value={v.signerId}
              onChange={set('signerId')}
              error={errors.signerId}
            />
            <TextField
              id="eol-relationship"
              label="Quan hệ với người cao tuổi"
              value={v.relationship}
              onChange={set('relationship')}
              error={errors.relationship}
            />
          </div>
          {patientRep && (
            <RadioRow
              label="Người đại diện được chọn theo cách nào"
              labelId="eol-selection"
              options={Object.entries(SELECTION_LABELS)}
              value={v.selection}
              onChange={set('selection')}
              error={errors.selection}
            />
          )}
          {legal && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  id="eol-court-number"
                  label="Số quyết định"
                  value={v.courtNumber}
                  onChange={set('courtNumber')}
                  error={errors.courtNumber}
                />
                <TextField
                  id="eol-court-name"
                  label="Tòa án"
                  value={v.courtName}
                  onChange={set('courtName')}
                  error={errors.courtName}
                />
              </div>
              {dateField('eol-court-date', 'Ngày quyết định', 'courtDate')}
              <FilePick
                id="eol-court-file"
                label="Bản scan quyết định của Tòa án"
                file={courtFile}
                onPick={setCourtFile}
                error={errors.courtFile}
              />
            </>
          )}
        </>
      )}
      <FilePick
        id="eol-signed-copy"
        label="Bản ký đã scan"
        file={signedCopy}
        onPick={setSignedCopy}
        error={errors.signedCopy}
      />
      {dateField('eol-signed-at', 'Ngày ký', 'signedAt')}
      <Collapsible
        open={opinionsOpen || opinions.length > 0}
        onOpenChange={setOpinionsOpen}
        className="flex flex-col gap-4"
      >
        <CollapsibleTrigger className="flex items-center gap-1.5 self-start type-body-sm font-medium text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          Thêm ý kiến khác
          <ChevronDown
            aria-hidden
            className={cn('size-4 transition-transform', (opinionsOpen || opinions.length > 0) && 'rotate-180')}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <OpinionEditor
            idPrefix="eol"
            residentId={residentId}
            items={opinions}
            onChange={setOpinions}
            error={errors.opinions}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  )

  // Kiểm chứng ngay trong thẻ Nháp (chủ dự án duyệt 2026-11-26): nội dung gia đình khai chỉ đọc (bấm "Sửa nội dung" thì
  // sửa tại chỗ), dưới là phần cần ghi khi kiểm chứng; "Không duyệt" là Hủy nháp kèm lý do, không mở màn khác.
  if (verify) {
    return (
      <section aria-labelledby="eol-verify-title" className="flex flex-col gap-4 rounded-lg border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 id="eol-verify-title" className="type-label">
            Bản Nháp tự khai <span className="type-caption text-warning-foreground">· chờ kiểm chứng</span>
          </h4>
          {!editing && (
            <Button type="button" variant="link" className="h-auto p-0" onClick={() => setEditing(true)}>
              Sửa nội dung
            </Button>
          )}
        </div>
        {initial?.recordedBy && (
          <p className="type-caption text-muted-foreground">
            {initial.recordedBy} lập{initial.at && ` ${formatDateTime(initial.at)}`}
          </p>
        )}
        <form
          id="eol-verify-form"
          onSubmit={submit}
          noValidate
          aria-label="Kiểm chứng phiếu nguyện vọng cuối đời"
          aria-busy={busy || undefined}
          className="flex flex-col gap-5"
        >
          {editing ? group01 : <DraftDetails draft={initial} residentId={residentId} />}
          <div className="flex flex-col gap-5 border-t pt-4">
            <h5 className="type-label">Phần cần ghi khi kiểm chứng</h5>
            {group02}
            {group03}
          </div>
          <ProblemAlert problem={failure} />
        </form>
        {discarding ? (
          <DiscardDraftForm idPrefix="eol" onDiscard={onDiscardDraft} onCancel={() => setDiscarding(false)} />
        ) : (
          <div className="flex flex-wrap gap-3">
            <Button type="submit" form="eol-verify-form" className="h-11" disabled={busy}>
              {busy ? 'Đang lưu…' : 'Xác nhận kiểm chứng'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={busy}
              onClick={() => setDiscarding(true)}
            >
              Không duyệt
            </Button>
          </div>
        )}
      </section>
    )
  }

  return (
    <WishSheet
      title="Ghi phiếu nguyện vọng cuối đời"
      formId="eol-wish-form"
      dirty={dirty}
      busy={busy}
      submitLabel="Lưu phiếu"
      onClose={onCancel}
    >
      <form
        id="eol-wish-form"
        onSubmit={submit}
        noValidate
        aria-label="Ghi phiếu nguyện vọng cuối đời"
        className="flex flex-col divide-y"
      >
        <FieldSet className="py-6">
          <FieldLegend className="type-label mb-4">01 · Lựa chọn và người liên hệ</FieldLegend>
          {group01}
        </FieldSet>
        <FieldSet className="py-6">
          <FieldLegend className="type-label mb-4">02 · Nhận định của Bác sĩ</FieldLegend>
          {group02}
        </FieldSet>
        <FieldSet className="py-6">
          <FieldLegend className="type-label mb-4">03 · Người quyết định và bản ký</FieldLegend>
          {group03}
        </FieldSet>
        {failure && (
          <div className="py-6">
            <ProblemAlert problem={failure} />
          </div>
        )}
      </form>
    </WishSheet>
  )
}

// Nội dung bản Nháp tự khai: chưa có nhận định của Bác sĩ (FR-023n)
function DraftDetails({ draft, residentId }) {
  return (
    <>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div className="col-span-2">
          <Row label="Lựa chọn khi nguy kịch">{CHOICE_LABELS[draft.choice] ?? 'Chưa ghi'}</Row>
        </div>
        <Row label="Người cần liên hệ trước khi thực hiện">{draft.firstContact ?? 'Chưa ghi'}</Row>
        {draft.signerType && (
          <Row label="Người ký">
            {SIGNER_LABELS[draft.signerType]}
            {draft.signer && ` · ${draft.signer}`}
          </Row>
        )}
        {draft.note && (
          <div className="col-span-2">
            <Row label="Ghi chú">{draft.note}</Row>
          </div>
        )}
      </dl>
      <OpinionList opinions={draft.otherOpinions ?? []} residentId={residentId} />
    </>
  )
}

// Hành chính lập, sửa bản Nháp tự khai khi Đang tiếp nhận (Q-412, FR-023n): không có nhận định tự quyết (chỉ Bác sĩ,
// BR-M01-15); người trả lời là người cao tuổi hoặc người đại diện; bản ký nếu đã có. Hợp đồng không trả người trả lời của
// Nháp nên sửa Nháp phải chọn lại người trả lời.
function EndOfLifeDraftForm({ residentId, initial, onCancel, onDone }) {
  const members = useFamilyMembers(residentId)
  const [v, setV] = useState({
    choice: initial?.choice ?? null,
    firstContact: initial?.firstContact ?? '',
    note: initial?.note ?? '',
    respondent: 'RESIDENT',
    respondentId: '',
    relationship: '',
  })
  const [opinions, setOpinions] = useState([])
  const [signedCopy, setSignedCopy] = useState(null)
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState(null)
  const [busy, setBusy] = useState(false)
  const [key] = useState(() => crypto.randomUUID())
  const set = (name) => (value) => setV((current) => ({ ...current, [name]: value }))
  const representative = v.respondent !== 'RESIDENT'

  async function submit(event) {
    event.preventDefault()
    const next = {}
    if (representative && !POSITIVE_INTEGER.test(v.respondentId.trim())) next.respondentId = 'Chọn người thân trả lời'
    if (representative && !v.relationship.trim()) next.relationship = 'Nhập quan hệ với người cao tuổi'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    setFailure(null)
    setBusy(true)
    let uploading = true
    try {
      const signedCopyFileId = signedCopy ? await uploadFile(signedCopy) : undefined
      uploading = false
      const { data, status } = await putResidentsByIdEndOfLifeWishDraft({
        path: { id: residentId },
        headers: { 'Idempotency-Key': key },
        body: {
          choice: v.choice ?? undefined,
          firstContact: v.firstContact.trim() || undefined,
          note: v.note.trim() || undefined,
          respondentType: v.respondent,
          respondentFamilyMemberId: representative ? Number(v.respondentId.trim()) : undefined,
          relationship: representative ? v.relationship.trim() : undefined,
          otherOpinions: opinions.map(toRequestOpinion),
          signedCopyFileId,
        },
      })
      onDone(data, status)
    } catch (error) {
      const problem = problemOf(error)
      const fileMessage = uploading ? uploadProblem(problem) : null
      const mapped = error instanceof ApiError ? WISH_ERRORS[problem.errorCode] : null
      if (fileMessage) setErrors({ signedCopy: fileMessage })
      else if (mapped) setErrors({ [mapped[0]]: mapped[1] })
      else setFailure(problem)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label="Bản Nháp phiếu nguyện vọng cuối đời"
      className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-4"
    >
      <h3 className="type-card-title">Bản Nháp tự khai phiếu nguyện vọng cuối đời</h3>
      <p className="type-body-sm text-muted-foreground">
        Ghi theo lời người cao tuổi hoặc gia đình. Bản Nháp chưa có hiệu lực tới khi Bác sĩ hoặc Điều dưỡng kiểm chứng;
        nhận định người cao tuổi có tự quyết được hay không do Bác sĩ ghi khi kiểm chứng.
      </p>
      <RadioRow
        label="Lựa chọn khi nguy kịch"
        labelId="eol-draft-choice"
        options={Object.entries(CHOICE_LABELS)}
        value={v.choice}
        onChange={set('choice')}
      />
      <TextField
        id="eol-draft-first-contact"
        label="Người cần liên hệ trước khi thực hiện"
        value={v.firstContact}
        onChange={set('firstContact')}
      />
      <Field>
        <FieldLabel htmlFor="eol-draft-note">Ghi chú</FieldLabel>
        <Textarea id="eol-draft-note" rows={2} value={v.note} onChange={(e) => set('note')(e.target.value)} />
      </Field>
      <RadioRow
        label="Người trả lời"
        labelId="eol-draft-respondent"
        options={[
          ['RESIDENT', SIGNER_LABELS.RESIDENT],
          ['PATIENT_REPRESENTATIVE', SIGNER_LABELS.PATIENT_REPRESENTATIVE],
        ]}
        value={v.respondent}
        onChange={set('respondent')}
      />
      {representative && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FamilyMemberSelect
            id="eol-draft-respondent-id"
            label="Người thân trả lời"
            members={members}
            value={v.respondentId}
            onChange={set('respondentId')}
            error={errors.respondentId}
          />
          <TextField
            id="eol-draft-relationship"
            label="Quan hệ với người cao tuổi"
            value={v.relationship}
            onChange={set('relationship')}
            error={errors.relationship}
          />
        </div>
      )}
      <OpinionEditor
        idPrefix="eol-draft"
        residentId={residentId}
        items={opinions}
        onChange={setOpinions}
        error={errors.opinions}
      />
      <FileField
        id="eol-draft-signed-copy"
        label="Bản ký đã scan (nếu đã có)"
        error={errors.signedCopy}
        onPick={setSignedCopy}
      />
      <ProblemAlert problem={failure} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" className="h-11" disabled={busy}>
          Lưu bản Nháp
        </Button>
        <Button type="button" variant="outline" className="h-11" onClick={onCancel}>
          Thôi
        </Button>
      </div>
    </form>
  )
}

export function EndOfLifeWish({ residentId, status, allowedCommands = [], hasWish, onChanged, onStatus }) {
  const [state, setState] = useState('loading')
  const [summary, setSummary] = useState(null)
  const [failure, setFailure] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [done, setDone] = useState(null)
  // bản Nháp tự khai (Q-412): Hành chính lập khi Đang tiếp nhận; Bác sĩ, Điều dưỡng kiểm chứng hoặc Hủy nháp
  const [draftMode, setDraftMode] = useState(null)
  const canDraft = allowedCommands.includes('DRAFT_END_OF_LIFE_WISH') && !FINAL_STATUSES.includes(status)
  const canRecord = allowedCommands.includes('RECORD_END_OF_LIFE_WISH') && !FINAL_STATUSES.includes(status)
  const {
    draft,
    setDraft,
    reload: reloadDraft,
  } = useWishDraft(getResidentsByIdEndOfLifeWishDraft, residentId, canDraft || canRecord)

  const load = useCallback(async () => {
    try {
      const { data } = await getResidentsByIdEndOfLifeWishes({ path: { id: residentId } })
      setSummary(data)
      setFailure(null)
      setState('ready')
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) setState('forbidden')
      else {
        setFailure(problemOf(error))
        setState('error')
      }
    }
  }, [residentId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nạp phiếu khi mở tab
    load()
  }, [load])

  async function finished() {
    setFormOpen(false)
    setDraftMode(null)
    setDone(
      draft ? 'Đã kiểm chứng phiếu nguyện vọng cuối đời; phiếu có hiệu lực.' : 'Đã ghi phiếu nguyện vọng cuối đời.',
    )
    reloadDraft()
    await load()
    onChanged?.()
  }

  async function draftSaved(data) {
    setDraftMode(null)
    setDraft(data)
    setDone('Đã lưu bản Nháp tự khai.')
  }

  async function discard(reason) {
    await postResidentsByIdEndOfLifeWishDraftDiscard({
      path: { id: residentId },
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: { reason },
    })
    setDraftMode(null)
    setDone('Đã hủy bản Nháp tự khai.')
    await reloadDraft()
  }

  // Hành chính: khối Nháp của mình (không xem phiếu Hiệu lực, FR-023e, FR-023q)
  const officeDraft = canDraft && (
    <div className="flex flex-col gap-3">
      {draft && draftMode !== 'edit' && (
        <DraftCard id="eol-draft-title" title="Bản Nháp tự khai" draft={draft}>
          <DraftDetails draft={draft} residentId={residentId} />
        </DraftCard>
      )}
      {draftMode === 'edit' ? (
        <EndOfLifeDraftForm
          residentId={residentId}
          initial={draft}
          onCancel={() => setDraftMode(null)}
          onDone={draftSaved}
        />
      ) : (
        <Button
          type="button"
          variant={draft ? 'outline' : 'default'}
          className="h-11 self-start"
          onClick={() => {
            setDone(null)
            setDraftMode('edit')
          }}
        >
          {draft ? 'Sửa bản Nháp' : 'Lập bản Nháp tự khai'}
        </Button>
      )}
      {done && (
        <p role="status" className="type-body-sm rounded-lg border bg-muted/30 p-3">
          {done}
        </p>
      )}
    </div>
  )

  // Tình trạng phiếu cho chip của tab Nguyện vọng: chờ kiểm chứng, Hiệu lực, chưa có (chủ dự án duyệt 2026-11-26)
  const wishStatus =
    state === 'ready'
      ? draft && canRecord
        ? 'draft'
        : summary?.current
          ? 'active'
          : 'none'
      : state === 'forbidden'
        ? draft
          ? 'draft'
          : hasWish
            ? 'active'
            : 'none'
        : null
  useEffect(() => {
    if (wishStatus) onStatus?.(wishStatus)
  }, [wishStatus, onStatus])

  if (state === 'loading') {
    return (
      <div aria-busy="true" className="flex flex-col gap-2">
        <span className="sr-only">Đang tải phiếu nguyện vọng cuối đời</span>
        <Skeleton className="h-16" />
        <Skeleton className="h-24" />
      </div>
    )
  }
  if (state === 'forbidden') {
    return (
      <section aria-label="Nguyện vọng cuối đời" className="flex flex-col gap-3">
        <p className="type-body-sm">
          {hasWish ? 'Đã có phiếu nguyện vọng cuối đời.' : 'Chưa có phiếu nguyện vọng cuối đời.'}
        </p>
        {officeDraft}
      </section>
    )
  }
  if (state === 'error') {
    return (
      <div className="flex flex-col gap-3">
        <ProblemAlert problem={failure} />
        <Button type="button" variant="outline" className="h-11 self-start" onClick={load}>
          Thử lại
        </Button>
      </div>
    )
  }

  const current = summary.current
  const past = summary.history.filter((w) => w.status !== 'ACTIVE')
  // còn Nháp thì không ghi thẳng phiên bản mới, phải kiểm chứng hoặc Hủy nháp (FR-023p)
  const canRecordNew = canRecord && !draft

  return (
    <div className="flex flex-col gap-4">
      {/* Một thẻ mỗi chip: phiếu Hiệu lực, hoặc thẻ kiểm chứng Nháp, hoặc một dòng "Chưa có phiếu" (2026-11-26) */}
      {(current || !draft) && (
        <section
          aria-label="Nguyện vọng cuối đời"
          className={current ? 'flex flex-col gap-3 rounded-lg border p-4' : 'flex flex-col gap-3'}
        >
          {current ? (
            <>
              <StatusBadge status={END_OF_LIFE_STATUS_LABELS.ACTIVE} />
              <WishDetails wish={current} residentId={residentId} />
            </>
          ) : (
            <p className="type-body-sm text-muted-foreground">
              Chưa có phiếu
              {FINAL_STATUSES.includes(status) && '; hồ sơ ở trạng thái cuối nên không ghi phiếu mới được'}
            </p>
          )}
          {canRecordNew && (
            <Button
              type="button"
              variant={current ? 'outline' : 'default'}
              className="h-11 self-start"
              aria-pressed={formOpen}
              onClick={() => {
                setDone(null)
                setFormOpen(true)
              }}
            >
              {current ? 'Ghi phiếu mới' : 'Ghi phiếu nguyện vọng'}
            </Button>
          )}
        </section>
      )}

      {done && (
        <p role="status" className="type-body-sm rounded-lg border bg-muted/30 p-3">
          {done}
        </p>
      )}
      {formOpen && canRecordNew && (
        <WishForm residentId={residentId} onCancel={() => setFormOpen(false)} onDone={finished} />
      )}
      {canRecord && draft && (
        <WishForm
          key={draft.id ?? 'draft'}
          residentId={residentId}
          mode="verify"
          initial={draft}
          onDone={finished}
          onDiscardDraft={discard}
        />
      )}

      {past.length > 0 && (
        <section aria-labelledby="eol-history-title" className="flex flex-col gap-2">
          <h4 id="eol-history-title" className="type-label">
            Lịch sử phiếu nguyện vọng cuối đời
          </h4>
          <ul aria-label="Lịch sử phiếu nguyện vọng cuối đời" className="flex flex-col gap-2">
            {past.map((wish) => (
              <li key={wish.id} className="flex flex-col gap-3 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={END_OF_LIFE_STATUS_LABELS[wish.status]} />
                  <span className="type-caption text-muted-foreground tabular-nums">{formatDate(wish.signedAt)}</span>
                </div>
                <WishDetails wish={wish} residentId={residentId} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
