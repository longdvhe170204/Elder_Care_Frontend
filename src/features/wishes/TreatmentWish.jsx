import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  ApiError,
  getResidentsByIdTreatmentWishDraft,
  getResidentsByIdTreatmentWishes,
  postResidentsByIdTreatmentWishDraftDiscard,
  postResidentsByIdTreatmentWishDraftVerify,
  postResidentsByIdTreatmentWishes,
  putResidentsByIdTreatmentWishDraft,
} from '@/api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { DateField } from '@/common/DateField'
import { displayDate, isoDate } from '@/common/dateText'
import { ProblemAlert } from '@/common/ProblemAlert'
import { StatusBadge } from '@/common/StatusBadge'
import { formatDateTime } from '@/common/dateTime'
import { uploadFile } from '@/common/files'
import { problemOf } from '@/common/problem'
import { cn } from '@/lib/utils'
import { FilePick } from '../consents/ConsentRecordSheet'
import { Row } from '../consents/ConsentTab'
import { POSITIVE_INTEGER, uploadProblem, toRequestOpinion } from './wishUtils'
import { FamilyMemberSelect } from '@/common/FamilyMemberSelect'
import { memberNameOf, useFamilyMembers } from '@/common/useFamilyMembers'
import { OpinionEditor, OpinionList } from './Opinions'
import { DiscardDraftForm, DraftCard } from './WishDraft'
import { useWishDraft } from './useWishDraft'
import { WishSheet } from './WishSheet'
import {
  ESCORT_LABELS,
  FINAL_STATUSES,
  OPINION_SOURCE_LABELS,
  TREATMENT_STATUS_LABELS,
  WISH_ERRORS,
} from './wishLabels'

// Khối "Nguyện vọng khi điều trị" của tab Nguyện vọng (001 T080; US7 #9 → #11; FR-023j → FR-023m, BR-M01-16; bố cục đề
// xuất 2026-10-23). Một hoặc hai bệnh viện ưu tiên, bảo hiểm y tế không bắt buộc, hỏi gia đình trước, người cần báo,
// người đi kèm, ý kiến khác có nguồn. Nội dung thuộc nhóm sức khỏe: Hành chính chỉ thấy "Đã có phiếu", Kế toán không thấy
// khối này (hasWish rỗng). Tạm thời mã người thân nhập tay vì chưa có danh sách (feature 012).
// Rà soát cho Bác sĩ 2026-11-26 (chủ dự án duyệt): ghi, kiểm chứng phiếu mở khung riêng (WishSheet) ba nhóm, bảo hiểm và ý
// kiến khác gập lại, không chọn sẵn người trả lời; thẻ Nháp không lặp người ghi; người trả lời ghi tên; ẩn lịch sử khi trống.

const RELATIONSHIP_LABELS = {
  SPOUSE: 'Vợ/chồng',
  CHILD: 'Con',
  GRANDCHILD: 'Cháu',
  SIBLING: 'Anh, chị, em',
  OTHER: 'Khác',
}

const WARNINGS = {
  NO_FAMILY_MEMBER_TO_NOTIFY: 'Phiếu yêu cầu hỏi gia đình trước nhưng chưa chọn người thân cần báo.',
}

function Required() {
  return (
    <span aria-hidden="true" className="text-destructive">
      *
    </span>
  )
}

// draft: thẻ Nháp đã ghi người lập ở đầu thẻ nên không lặp Ghi bởi, Ghi lúc
function TreatmentDetails({ wish, residentId, draft = false }) {
  const members = useFamilyMembers(residentId)
  const insurance = wish.healthInsurance
  return (
    <>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {wish.preferredHospitals.map((hospital, index) => (
          <div key={index} className="col-span-2">
            <Row label={`Bệnh viện ưu tiên ${index + 1}`}>{`${hospital.name} · ${hospital.address}`}</Row>
          </div>
        ))}
        <Row label="Hỏi gia đình trước khi chuyển viện không khẩn cấp">
          {wish.askFamilyFirst == null ? 'Chưa ghi' : wish.askFamilyFirst ? 'Có' : 'Không'}
        </Row>
        <Row label="Người đi kèm">{ESCORT_LABELS[wish.accompaniedBy] ?? 'Chưa ghi'}</Row>
        <div className="col-span-2">
          <Row label="Người thân cần báo">
            {wish.notifyFamilyMembers.length === 0
              ? 'Chưa chọn'
              : wish.notifyFamilyMembers
                  .map((m) =>
                    [m.fullName ?? `Mã ${m.familyMemberId}`, RELATIONSHIP_LABELS[m.relationship], m.phoneNumber]
                      .filter(Boolean)
                      .join(', '),
                  )
                  .join('; ')}
          </Row>
        </div>
        {insurance && (
          <div className="col-span-2">
            <Row label="Bảo hiểm y tế">
              {[
                insurance.initialRegistrationPlace && `Nơi đăng ký ${insurance.initialRegistrationPlace}`,
                insurance.cardNumber && `Số thẻ ${insurance.cardNumber}`,
                insurance.cardExpiry && `Hạn ${insurance.cardExpiry}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Row>
          </div>
        )}
        {wish.note && (
          <div className="col-span-2">
            <Row label="Ghi chú">{wish.note}</Row>
          </div>
        )}
        <div className="col-span-2">
          <Row label="Người trả lời">
            {OPINION_SOURCE_LABELS[wish.respondent.type]}
            {wish.respondent.familyMemberId != null && ` (${memberNameOf(members, wish.respondent.familyMemberId)})`}
          </Row>
        </div>
        {!draft && <Row label="Ghi bởi">{wish.recordedBy}</Row>}
        {!draft && <Row label="Ghi lúc">{formatDateTime(wish.at)}</Row>}
      </dl>
      <OpinionList opinions={wish.otherOpinions} residentId={residentId} />
    </>
  )
}

const FORM_TITLES = {
  record: 'Ghi phiếu nguyện vọng khi điều trị',
  draft: 'Bản Nháp phiếu nguyện vọng khi điều trị',
  verify: 'Kiểm chứng phiếu nguyện vọng khi điều trị',
}

function TreatmentForm({ residentId, onCancel, onDone, mode = 'record', initial = null, onDiscardDraft }) {
  const draftMode = mode === 'draft'
  // Demo 2026-11-25: người cần báo, người trả lời chọn theo tên thay cho ô nhập mã
  const members = useFamilyMembers(residentId)
  const [hospitals, setHospitals] = useState(() =>
    initial?.preferredHospitals?.length
      ? initial.preferredHospitals.map((h) => ({ name: h.name ?? '', address: h.address ?? '' }))
      : [{ name: '', address: '' }],
  )
  const [insurance, setInsurance] = useState({
    place: initial?.healthInsurance?.initialRegistrationPlace ?? '',
    number: initial?.healthInsurance?.cardNumber ?? '',
    expiry: displayDate(initial?.healthInsurance?.cardExpiry ?? ''),
  })
  const [ask, setAsk] = useState(initial?.askFamilyFirst ?? false)
  const [ids, setIds] = useState(() => (initial?.notifyFamilyMembers ?? []).map((m) => m.familyMemberId))
  const [escort, setEscort] = useState(initial?.accompaniedBy ?? null)
  const [note, setNote] = useState(initial?.note ?? '')
  // Không chọn sẵn người trả lời (Q-307); kiểm chứng thì lấy theo bản Nháp
  const [respondentType, setRespondentType] = useState(initial?.respondent?.type ?? '')
  const [respondentId, setRespondentId] = useState(
    initial?.respondent?.familyMemberId != null ? String(initial.respondent.familyMemberId) : '',
  )
  const [opinions, setOpinions] = useState([])
  const [signedCopy, setSignedCopy] = useState(null)
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState(null)
  const [busy, setBusy] = useState(false)
  const [key] = useState(() => crypto.randomUUID())
  const uploaded = useRef(new Map())
  const [dirty, setDirty] = useState(false)
  const [insuranceOpen, setInsuranceOpen] = useState(false)
  const [opinionsOpen, setOpinionsOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const touched = (fn) => (value) => {
    setDirty(true)
    fn(value)
  }
  const hasInsuranceValue = !!(insurance.place.trim() || insurance.number.trim() || insurance.expiry.trim())

  function setHospital(index, field, value) {
    setDirty(true)
    setHospitals((current) => current.map((h, i) => (i === index ? { ...h, [field]: value } : h)))
  }

  function validate() {
    const next = {}
    if (!draftMode && (!hospitals[0].name.trim() || !hospitals[0].address.trim())) {
      next.hospital1 = WISH_ERRORS.PREFERRED_HOSPITAL_REQUIRED[1]
    }
    if (hospitals[1] && (!hospitals[1].name.trim() || !hospitals[1].address.trim())) {
      next.hospital2 = 'Nhập đủ tên và địa chỉ bệnh viện thứ hai hoặc bỏ bệnh viện này'
    }
    if (!draftMode && !escort) next.escort = 'Chọn người đi kèm'
    if (!respondentType) next.respondentType = 'Chọn người trả lời'
    if (insurance.expiry.trim() && !isoDate(insurance.expiry)) next.insuranceExpiry = 'Nhập hạn thẻ dạng DD/MM/YYYY'
    if (respondentType === 'FAMILY_MEMBER' && !POSITIVE_INTEGER.test(respondentId.trim())) {
      next.respondentId = 'Chọn người thân trả lời'
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
    let uploading = true
    try {
      let signedCopyFileId
      if (signedCopy) {
        if (!uploaded.current.has(signedCopy)) uploaded.current.set(signedCopy, await uploadFile(signedCopy))
        signedCopyFileId = uploaded.current.get(signedCopy)
      }
      uploading = false
      const hasInsurance = hasInsuranceValue
      const save = {
        record: postResidentsByIdTreatmentWishes,
        draft: putResidentsByIdTreatmentWishDraft,
        verify: postResidentsByIdTreatmentWishDraftVerify,
      }[mode]
      const { data } = await save({
        path: { id: residentId },
        headers: { 'Idempotency-Key': key },
        body: {
          preferredHospitals: hospitals
            .filter((h) => !draftMode || h.name.trim() || h.address.trim())
            .map((h) => ({ name: h.name.trim(), address: h.address.trim() })),
          healthInsurance: hasInsurance
            ? {
                initialRegistrationPlace: insurance.place.trim() || undefined,
                cardNumber: insurance.number.trim() || undefined,
                cardExpiry: isoDate(insurance.expiry) ?? undefined,
              }
            : undefined,
          askFamilyFirst: ask,
          notifyFamilyMemberIds: ids,
          accompaniedBy: escort ?? undefined,
          note: note.trim() || undefined,
          respondent: {
            type: respondentType,
            familyMemberId: respondentType === 'FAMILY_MEMBER' ? Number(respondentId.trim()) : undefined,
          },
          otherOpinions: opinions.map(toRequestOpinion),
          signedCopyFileId,
        },
      })
      onDone(data)
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

  const hospitalFields = hospitals.map((hospital, index) => (
    <div key={index} className="flex flex-col gap-3">
      <Field data-invalid={!!errors[`hospital${index + 1}`] || undefined}>
        <FieldLabel htmlFor={`tw-hospital-${index}-name`}>
          {`Tên bệnh viện ${index + 1}`} {index === 0 && !draftMode && <Required />}
        </FieldLabel>
        <Input
          id={`tw-hospital-${index}-name`}
          className="h-11"
          placeholder="Bệnh viện Bạch Mai"
          value={hospital.name}
          onChange={(e) => setHospital(index, 'name', e.target.value)}
          aria-invalid={!!errors[`hospital${index + 1}`] || undefined}
        />
      </Field>
      <Field data-invalid={!!errors[`hospital${index + 1}`] || undefined}>
        <FieldLabel htmlFor={`tw-hospital-${index}-address`}>
          {`Địa chỉ bệnh viện ${index + 1}`} {index === 0 && !draftMode && <Required />}
        </FieldLabel>
        <Input
          id={`tw-hospital-${index}-address`}
          className="h-11"
          placeholder="78 Giải Phóng, Đống Đa, Hà Nội"
          value={hospital.address}
          onChange={(e) => setHospital(index, 'address', e.target.value)}
          aria-invalid={!!errors[`hospital${index + 1}`] || undefined}
        />
        {errors[`hospital${index + 1}`] && <FieldError>{errors[`hospital${index + 1}`]}</FieldError>}
      </Field>
      {index === 1 && (
        <Button
          type="button"
          variant="link"
          className="h-auto self-start p-0"
          onClick={touched(() => setHospitals([hospitals[0]]))}
        >
          Bỏ bệnh viện thứ hai
        </Button>
      )}
    </div>
  ))

  const insuranceFields = (
    <>
      <Field>
        <FieldLabel htmlFor="tw-ins-place">Nơi đăng ký khám chữa bệnh ban đầu</FieldLabel>
        <Input
          id="tw-ins-place"
          className="h-11"
          value={insurance.place}
          onChange={(e) => touched(setInsurance)({ ...insurance, place: e.target.value })}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="tw-ins-number">Số thẻ</FieldLabel>
          <Input
            id="tw-ins-number"
            className="h-11"
            value={insurance.number}
            onChange={(e) => touched(setInsurance)({ ...insurance, number: e.target.value })}
          />
        </Field>
        <Field data-invalid={!!errors.insuranceExpiry || undefined}>
          <FieldLabel htmlFor="tw-ins-expiry">Hạn thẻ</FieldLabel>
          <DateField
            id="tw-ins-expiry"
            value={insurance.expiry}
            onChange={(expiry) => touched(setInsurance)({ ...insurance, expiry })}
            invalid={!!errors.insuranceExpiry}
          />
          {errors.insuranceExpiry && <FieldError>{errors.insuranceExpiry}</FieldError>}
        </Field>
      </div>
    </>
  )

  const transferFields = (
    <>
      <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3">
        <Checkbox
          checked={ask}
          onCheckedChange={touched(setAsk)}
          aria-label="Hỏi gia đình trước khi chuyển viện không khẩn cấp"
        />
        <span className="type-body-sm">Hỏi gia đình trước khi chuyển viện không khẩn cấp</span>
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="type-label mb-2">Người thân cần báo</legend>
        {members.length === 0 ? (
          <p className="type-body-sm text-muted-foreground">Hồ sơ chưa có người thân có quan hệ Hiệu lực</p>
        ) : (
          members.map((m) => (
            <label key={m.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3">
              <Checkbox
                checked={ids.includes(m.id)}
                onCheckedChange={(on) => touched(setIds)(on ? [...ids, m.id] : ids.filter((x) => x !== m.id))}
                aria-label={`Báo ${m.fullName}`}
              />
              <span className="type-body-sm">{m.fullName}</span>
            </label>
          ))
        )}
        {errors.notifyIds && <FieldError>{errors.notifyIds}</FieldError>}
      </fieldset>

      <Field data-invalid={!!errors.escort || undefined}>
        <span className="type-label" id="tw-escort-label">
          Người đi kèm {!draftMode && <Required />}
        </span>
        <div role="radiogroup" aria-labelledby="tw-escort-label" className="flex flex-wrap gap-2">
          {Object.entries(ESCORT_LABELS).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              role="radio"
              aria-checked={escort === value}
              variant={escort === value ? 'default' : 'outline'}
              className="h-11"
              onClick={() => touched(setEscort)(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        {errors.escort && <FieldError>{errors.escort}</FieldError>}
      </Field>

      <Field>
        <FieldLabel htmlFor="tw-note">Ghi chú</FieldLabel>
        <Textarea id="tw-note" rows={2} value={note} onChange={(e) => touched(setNote)(e.target.value)} />
      </Field>
    </>
  )

  const respondentFields = (
    <>
      <Field data-invalid={!!errors.respondentType || !!errors.respondentId || undefined}>
        <span className="type-label" id="tw-respondent-label">
          Người trả lời <Required />
        </span>
        <div role="radiogroup" aria-labelledby="tw-respondent-label" className="flex flex-wrap gap-2">
          {Object.entries(OPINION_SOURCE_LABELS).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              role="radio"
              aria-checked={respondentType === value}
              variant={respondentType === value ? 'default' : 'outline'}
              className="h-11"
              onClick={() => touched(setRespondentType)(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        {errors.respondentType && <FieldError>{errors.respondentType}</FieldError>}
      </Field>
      {respondentType === 'FAMILY_MEMBER' && (
        <FamilyMemberSelect
          id="tw-respondent-id"
          label="Người thân trả lời"
          members={members}
          value={respondentId}
          onChange={touched(setRespondentId)}
          error={errors.respondentId}
        />
      )}
    </>
  )

  const opinionFields = (
    <>
      {mode === 'verify' && (
        <FilePick
          id="tw-signed-copy"
          label="Bản ký đã scan"
          required={false}
          file={signedCopy}
          onPick={touched(setSignedCopy)}
          error={errors.signedCopy}
        />
      )}
      <OpinionEditor
        idPrefix="tw"
        residentId={residentId}
        items={opinions}
        onChange={touched(setOpinions)}
        error={errors.opinions}
      />
    </>
  )

  // Hành chính ghi Nháp ngay trong tab như trước
  if (draftMode) {
    return (
      <form
        onSubmit={submit}
        noValidate
        aria-label={FORM_TITLES[mode]}
        className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-4"
      >
        <h3 className="type-card-title">{FORM_TITLES[mode]}</h3>
        {hospitalFields}
        {hospitals.length === 1 && (
          <Button
            type="button"
            variant="link"
            className="h-auto self-start p-0"
            onClick={touched(() => setHospitals([...hospitals, { name: '', address: '' }]))}
          >
            + Thêm bệnh viện thứ hai
          </Button>
        )}
        {insuranceFields}
        {transferFields}
        {respondentFields}
        {opinionFields}
        <FilePick
          id="tw-signed-copy"
          label="Bản ký đã scan"
          required={false}
          file={signedCopy}
          onPick={touched(setSignedCopy)}
          error={errors.signedCopy}
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

  const opinionsShown = opinionsOpen || opinions.length > 0
  const opinionsCollapsible = (label) => (
    <Collapsible open={opinionsShown} onOpenChange={setOpinionsOpen} className="flex flex-col gap-4">
      <CollapsibleTrigger className="flex items-center gap-1.5 self-start type-body-sm font-medium text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        {label}
        <ChevronDown aria-hidden className={cn('size-4 transition-transform', opinionsShown && 'rotate-180')} />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-5">{opinionFields}</CollapsibleContent>
    </Collapsible>
  )

  // Kiểm chứng ngay trong thẻ Nháp (chủ dự án duyệt 2026-11-26): nội dung gia đình khai chỉ đọc ("Sửa nội dung" thì sửa
  // tại chỗ); phần cần ghi chỉ gồm ô bắt buộc bản Nháp còn thiếu (bệnh viện ưu tiên, người đi kèm, người trả lời); đủ rồi
  // thì chỉ còn hai nút. "Không duyệt" là Hủy nháp kèm lý do.
  if (mode === 'verify') {
    const firstHospital = initial?.preferredHospitals?.[0]
    const missingHospital = !(firstHospital?.name && firstHospital?.address)
    const missingEscort = !initial?.accompaniedBy
    const missingRespondent = !initial?.respondent?.type
    const missing = missingHospital || missingEscort || missingRespondent
    return (
      <section aria-labelledby="tw-verify-title" className="flex flex-col gap-4 rounded-lg border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 id="tw-verify-title" className="type-label">
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
          id="tw-verify-form"
          onSubmit={submit}
          noValidate
          aria-label={FORM_TITLES.verify}
          aria-busy={busy || undefined}
          className="flex flex-col gap-5"
        >
          {editing ? (
            <>
              {hospitalFields}
              {hospitals.length === 1 && (
                <Button
                  type="button"
                  variant="link"
                  className="h-auto self-start p-0"
                  onClick={touched(() => setHospitals([...hospitals, { name: '', address: '' }]))}
                >
                  + Thêm bệnh viện thứ hai
                </Button>
              )}
              {insuranceFields}
              {transferFields}
              {respondentFields}
            </>
          ) : (
            <>
              <TreatmentDetails wish={initial} residentId={residentId} draft />
              {missing && (
                <div className="flex flex-col gap-5 border-t pt-4">
                  <h5 className="type-label">Phần cần ghi khi kiểm chứng</h5>
                  {missingHospital && hospitalFields[0]}
                  {missingEscort && (
                    <Field data-invalid={!!errors.escort || undefined}>
                      <span className="type-label" id="tw-verify-escort-label">
                        Người đi kèm <Required />
                      </span>
                      <div role="radiogroup" aria-labelledby="tw-verify-escort-label" className="flex flex-wrap gap-2">
                        {Object.entries(ESCORT_LABELS).map(([value, label]) => (
                          <Button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={escort === value}
                            variant={escort === value ? 'default' : 'outline'}
                            className="h-11"
                            onClick={() => touched(setEscort)(value)}
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                      {errors.escort && <FieldError>{errors.escort}</FieldError>}
                    </Field>
                  )}
                  {missingRespondent && respondentFields}
                </div>
              )}
            </>
          )}
          {opinionsCollapsible('Thêm bản ký, ý kiến khác')}
          <ProblemAlert problem={failure} />
        </form>
        {discarding ? (
          <DiscardDraftForm idPrefix="tw" onDiscard={onDiscardDraft} onCancel={() => setDiscarding(false)} />
        ) : (
          <div className="flex flex-wrap gap-3">
            <Button type="submit" form="tw-verify-form" className="h-11" disabled={busy}>
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

  // Ghi phiếu mới trong khung riêng (chủ dự án duyệt 2026-11-26)
  return (
    <WishSheet
      title="Ghi phiếu nguyện vọng khi điều trị"
      formId="tw-wish-form"
      dirty={dirty}
      busy={busy}
      submitLabel="Lưu phiếu"
      onClose={onCancel}
    >
      <form
        id="tw-wish-form"
        onSubmit={submit}
        noValidate
        aria-label={FORM_TITLES[mode]}
        className="flex flex-col divide-y"
      >
        <FieldSet className="py-6">
          <FieldLegend className="type-label mb-4">01 · Bệnh viện ưu tiên</FieldLegend>
          <div className="flex flex-col gap-5">
            {hospitalFields}
            {hospitals.length === 1 && (
              <Button
                type="button"
                variant="link"
                className="h-auto self-start p-0"
                onClick={touched(() => setHospitals([...hospitals, { name: '', address: '' }]))}
              >
                + Thêm bệnh viện thứ hai
              </Button>
            )}
            <Collapsible
              open={insuranceOpen || hasInsuranceValue}
              onOpenChange={setInsuranceOpen}
              className="flex flex-col gap-4"
            >
              <CollapsibleTrigger className="flex items-center gap-1.5 self-start type-body-sm font-medium text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                Thêm bảo hiểm y tế
                <ChevronDown
                  aria-hidden
                  className={cn('size-4 transition-transform', (insuranceOpen || hasInsuranceValue) && 'rotate-180')}
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="flex flex-col gap-4">{insuranceFields}</CollapsibleContent>
            </Collapsible>
          </div>
        </FieldSet>

        <FieldSet className="py-6">
          <FieldLegend className="type-label mb-4">02 · Khi cần chuyển viện</FieldLegend>
          <div className="flex flex-col gap-5">{transferFields}</div>
        </FieldSet>

        <FieldSet className="py-6">
          <FieldLegend className="type-label mb-4">03 · Người trả lời và bản ký</FieldLegend>
          <div className="flex flex-col gap-5">
            {respondentFields}
            <FilePick
              id="tw-signed-copy"
              label="Bản ký đã scan"
              required={false}
              file={signedCopy}
              onPick={touched(setSignedCopy)}
              error={errors.signedCopy}
            />
            {opinionsCollapsible('Thêm ý kiến khác')}
          </div>
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

export function TreatmentWish({ residentId, status, allowedCommands = [], hasWish, onChanged, onStatus }) {
  const [state, setState] = useState('loading')
  const [summary, setSummary] = useState(null)
  const [failure, setFailure] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [done, setDone] = useState(null)
  const [warnings, setWarnings] = useState([])
  // bản Nháp tự khai (Q-412): Hành chính lập khi Đang tiếp nhận; Bác sĩ, Điều dưỡng kiểm chứng hoặc Hủy nháp
  const [draftMode, setDraftMode] = useState(null)
  const canDraft = allowedCommands.includes('DRAFT_TREATMENT_WISH') && !FINAL_STATUSES.includes(status)
  const canRecord = allowedCommands.includes('RECORD_TREATMENT_WISH') && !FINAL_STATUSES.includes(status)
  const {
    draft,
    setDraft,
    reload: reloadDraft,
  } = useWishDraft(getResidentsByIdTreatmentWishDraft, residentId, canDraft || canRecord)

  const load = useCallback(async () => {
    try {
      const { data } = await getResidentsByIdTreatmentWishes({ path: { id: residentId } })
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

  async function finished(result) {
    setFormOpen(false)
    setDraftMode(null)
    setDone(
      draft
        ? 'Đã kiểm chứng phiếu nguyện vọng khi điều trị; phiếu có hiệu lực.'
        : 'Đã ghi phiếu nguyện vọng khi điều trị.',
    )
    setWarnings(result?.warnings ?? [])
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
    await postResidentsByIdTreatmentWishDraftDiscard({
      path: { id: residentId },
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: { reason },
    })
    setDraftMode(null)
    setDone('Đã hủy bản Nháp tự khai.')
    await reloadDraft()
  }

  // Hành chính: khối Nháp của mình (không xem phiếu Hiệu lực, FR-023m, FR-023q)
  const officeDraft = canDraft && (
    <div className="flex flex-col gap-3">
      {draft && draftMode !== 'edit' && (
        <DraftCard id="tw-draft-title" title="Bản Nháp tự khai" draft={draft}>
          <TreatmentDetails wish={draft} residentId={residentId} draft />
        </DraftCard>
      )}
      {draftMode === 'edit' ? (
        <TreatmentForm
          residentId={residentId}
          mode="draft"
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
        : summary?.active
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
        <span className="sr-only">Đang tải phiếu nguyện vọng khi điều trị</span>
        <Skeleton className="h-16" />
        <Skeleton className="h-24" />
      </div>
    )
  }
  if (state === 'forbidden') {
    // Kế toán không có cờ (hasWish rỗng): không hiện khối này (FR-023m)
    if (hasWish == null && !canDraft) return null
    return (
      <section aria-label="Nguyện vọng khi điều trị" className="flex flex-col gap-3">
        <p className="type-body-sm">
          {hasWish ? 'Đã có phiếu nguyện vọng khi điều trị.' : 'Chưa có phiếu nguyện vọng khi điều trị.'}
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

  const current = summary.active
  const past = summary.history.filter((w) => w.status !== 'ACTIVE')
  // còn Nháp thì không ghi thẳng phiên bản mới, phải kiểm chứng hoặc Hủy nháp (FR-023p)
  const canRecordNew = canRecord && !draft

  return (
    <div className="flex flex-col gap-4">
      {/* Một thẻ mỗi chip: phiếu Hiệu lực, hoặc thẻ kiểm chứng Nháp, hoặc một dòng "Chưa có phiếu" (2026-11-26) */}
      {(current || !draft) && (
        <section
          aria-label="Nguyện vọng khi điều trị"
          className={current ? 'flex flex-col gap-3 rounded-lg border p-4' : 'flex flex-col gap-3'}
        >
          {current ? (
            <>
              <StatusBadge status={TREATMENT_STATUS_LABELS.ACTIVE} />
              <TreatmentDetails wish={current} residentId={residentId} />
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
                setWarnings([])
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
      {warnings.map((w) => (
        <Alert key={w.code} variant="attention">
          <AlertTitle>Lưu ý</AlertTitle>
          <AlertDescription>{WARNINGS[w.code] ?? w.description}</AlertDescription>
        </Alert>
      ))}
      {formOpen && canRecordNew && (
        <TreatmentForm residentId={residentId} onCancel={() => setFormOpen(false)} onDone={finished} />
      )}
      {canRecord && draft && (
        <TreatmentForm
          key={draft.id ?? 'draft'}
          residentId={residentId}
          mode="verify"
          initial={draft}
          onDone={finished}
          onDiscardDraft={discard}
        />
      )}

      {past.length > 0 && (
        <section aria-labelledby="tw-history-title" className="flex flex-col gap-2">
          <h4 id="tw-history-title" className="type-label">
            Lịch sử phiếu nguyện vọng khi điều trị
          </h4>
          <ul aria-label="Lịch sử phiếu nguyện vọng khi điều trị" className="flex flex-col gap-2">
            {past.map((wish) => (
              <li key={wish.id} className="flex flex-col gap-3 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={TREATMENT_STATUS_LABELS[wish.status]} />
                  <span className="type-caption text-muted-foreground tabular-nums">{formatDateTime(wish.at)}</span>
                </div>
                <TreatmentDetails wish={wish} residentId={residentId} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
