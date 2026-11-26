import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import {
  ApiError,
  getResidentsByIdEndOfLifeWishDraft,
  getResidentsByIdTreatmentWishDraft,
  getResidentsByResidentIdFamilyContacts,
  putResidentsByIdEndOfLifeWishDraft,
  putResidentsByIdTreatmentWishDraft,
} from '@/api'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { DateField } from '@/common/DateField'
import { DiscardChangesDialog } from '@/common/DiscardChangesDialog'
import { ProblemAlert } from '@/common/ProblemAlert'
import { displayDate, isoDate } from '@/common/dateText'
import { uploadFile } from '@/common/files'
import { problemOf } from '@/common/problem'
import { cn } from '@/lib/utils'
import { Choices } from '../admissions/FormParts'
import { FilePick } from '../consents/ConsentRecordSheet'
import { RELATIONSHIP_LABELS } from '../relatives/relationshipLabels'
import { OpinionEditor } from './Opinions'
import { CHOICE_LABELS, ESCORT_LABELS, OPINION_SOURCE_LABELS, WISH_ERRORS } from './wishLabels'
import { toRequestOpinion, uploadProblem } from './wishUtils'

// Bản Nháp tự khai hai phiếu nguyện vọng mở từ Hồ sơ tiếp nhận (001 FR-023n → FR-023q; Q-412, BR-M01-16, BR-M01-18; chủ
// dự án duyệt bố cục 2026-11-26): khung xl, hai thẻ "Cuối đời", "Khi điều trị" (mỗi thẻ một lệnh PUT riêng), người trả lời
// đứng đầu, người cần liên hệ chọn nhanh từ người thân, ý kiến khác gập lại, chân cố định lưu bản Nháp của thẻ đang mở.
// Không có dòng giải thích. Bác sĩ, Điều dưỡng vẫn ghi phiếu, kiểm chứng, hủy nháp ở tab Nguyện vọng của hồ sơ.

const OTHER = '__other__'
const relationText = (c) => RELATIONSHIP_LABELS[c.relationship] ?? c.relationship ?? ''

function Required() {
  return (
    <span aria-hidden="true" className="text-destructive">
      *
    </span>
  )
}

function CheckCard({ checked, onToggle, title, detail }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={cn(
        'flex min-h-12 w-full items-center gap-3 rounded-[10px] border px-3 py-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
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

function MemberSelect({ id, contacts, value, onChange, error, label }) {
  return (
    <Field data-invalid={!!error || undefined}>
      <FieldLabel htmlFor={id}>
        {label} <Required />
      </FieldLabel>
      <select
        id={id}
        className="h-11 w-full rounded-md border border-input bg-transparent px-3"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error || undefined}
      >
        <option value="">{contacts.length ? 'Chọn người thân' : 'Chưa có người thân'}</option>
        {contacts.map((c) => (
          <option key={c.familyMemberId} value={String(c.familyMemberId)}>
            {`${c.fullName} (${relationText(c).toLowerCase()})`}
          </option>
        ))}
      </select>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}

function MoreOpinions({ idPrefix, residentId, items, onChange, error }) {
  const [open, setOpen] = useState(items.length > 0)
  return open ? (
    <OpinionEditor
      idPrefix={idPrefix}
      residentId={residentId}
      items={items}
      onChange={onChange}
      error={error}
      compact
    />
  ) : (
    <Button type="button" variant="link" className="h-auto self-start p-0" onClick={() => setOpen(true)}>
      + Thêm ý kiến khác
    </Button>
  )
}

function EndOfLifeForm({ formId, residentId, contacts, draft, onDirty, onSaved, setBusy, busy }) {
  const [v, setV] = useState(() => ({
    respondent: draft?.signerType === 'PATIENT_REPRESENTATIVE' ? 'PATIENT_REPRESENTATIVE' : 'RESIDENT',
    respondentId: draft?.signerFamilyMemberId != null ? String(draft.signerFamilyMemberId) : '',
    relationship: draft?.relationship ?? '',
    choice: draft?.choice ?? '',
    firstContact: draft?.firstContact ?? '',
    note: draft?.note ?? '',
  }))
  const [contactChoice, setContactChoice] = useState(v.firstContact ? OTHER : '')
  const [opinions, setOpinions] = useState([])
  const [signedCopy, setSignedCopy] = useState(null)
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState(null)
  const [key] = useState(() => crypto.randomUUID())
  const set = (name) => (value) => {
    onDirty()
    setV((current) => ({ ...current, [name]: value }))
  }
  const representative = v.respondent === 'PATIENT_REPRESENTATIVE'
  const contactLabel = (c) => `${c.fullName} (${relationText(c).toLowerCase()})`

  function pickRespondent(id) {
    const contact = contacts.find((c) => String(c.familyMemberId) === id)
    set('respondentId')(id)
    if (contact) setV((current) => ({ ...current, respondentId: id, relationship: relationText(contact) }))
  }

  function pickContact(value) {
    onDirty()
    setContactChoice(value)
    if (value !== OTHER) setV((current) => ({ ...current, firstContact: value }))
    else setV((current) => ({ ...current, firstContact: '' }))
  }

  async function submit(event) {
    event.preventDefault()
    const next = {}
    if (representative && !v.respondentId) next.respondentId = 'Chọn người thân trả lời'
    if (representative && !v.relationship.trim()) next.relationship = 'Nhập quan hệ với người cao tuổi'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    setFailure(null)
    setBusy(true)
    let uploading = true
    try {
      const signedCopyFileId = signedCopy ? await uploadFile(signedCopy) : undefined
      uploading = false
      const { data } = await putResidentsByIdEndOfLifeWishDraft({
        path: { id: residentId },
        headers: { 'Idempotency-Key': key },
        body: {
          choice: v.choice || undefined,
          firstContact: v.firstContact.trim() || undefined,
          note: v.note.trim() || undefined,
          respondentType: v.respondent,
          respondentFamilyMemberId: representative ? Number(v.respondentId) : undefined,
          relationship: representative ? v.relationship.trim() : undefined,
          otherOpinions: opinions.map(toRequestOpinion),
          signedCopyFileId,
        },
      })
      onSaved(data)
    } catch (error) {
      const problem = problemOf(error)
      const fileMessage = uploading ? uploadProblem(problem) : null
      const mapped = error instanceof ApiError ? WISH_ERRORS[problem.errorCode] : null
      if (fileMessage) setErrors({ signedCopy: fileMessage })
      else if (mapped) setErrors({ [mapped[0] === 'signerId' ? 'respondentId' : mapped[0]]: mapped[1] })
      else setFailure(problem)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form id={formId} onSubmit={submit} noValidate className="flex flex-col divide-y">
      <div className="py-6">
        <FieldSet disabled={busy}>
          <Choices
            label="01 · Người trả lời"
            required
            options={[
              ['RESIDENT', 'Người cao tuổi'],
              ['PATIENT_REPRESENTATIVE', 'Người thân đại diện'],
            ]}
            value={v.respondent}
            onChange={set('respondent')}
          />
          {representative && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <MemberSelect
                id="eol-respondent"
                label="Người thân"
                contacts={contacts}
                value={v.respondentId}
                onChange={pickRespondent}
                error={errors.respondentId}
              />
              <Field data-invalid={!!errors.relationship || undefined}>
                <FieldLabel htmlFor="eol-relationship">
                  Quan hệ <Required />
                </FieldLabel>
                <Input
                  id="eol-relationship"
                  className="h-11"
                  value={v.relationship}
                  onChange={(e) => set('relationship')(e.target.value)}
                  aria-invalid={!!errors.relationship || undefined}
                />
                {errors.relationship && <FieldError>{errors.relationship}</FieldError>}
              </Field>
            </div>
          )}
        </FieldSet>
      </div>

      <div className="py-6">
        <FieldSet disabled={busy}>
          <FieldLegend className="type-label mb-4">02 · Nguyện vọng</FieldLegend>
          <div className="flex flex-col gap-5">
            <Choices
              label="Lựa chọn khi nguy kịch"
              options={Object.entries(CHOICE_LABELS)}
              value={v.choice}
              onChange={set('choice')}
            />
            <div className="flex flex-col gap-2">
              <Choices
                label="Người cần liên hệ trước khi thực hiện"
                options={[...contacts.map((c) => [contactLabel(c), contactLabel(c)]), [OTHER, 'Khác']]}
                value={contactChoice}
                onChange={pickContact}
              />
              {contactChoice === OTHER && (
                <Input
                  aria-label="Người cần liên hệ khác"
                  className="h-11"
                  placeholder="Họ tên, quan hệ, số điện thoại"
                  value={v.firstContact}
                  onChange={(e) => set('firstContact')(e.target.value)}
                />
              )}
            </div>
            <Field>
              <FieldLabel htmlFor="eol-note">Ghi chú</FieldLabel>
              <Textarea
                id="eol-note"
                rows={2}
                maxLength={2000}
                placeholder="Ví dụ: muốn có con cháu bên cạnh"
                value={v.note}
                onChange={(e) => set('note')(e.target.value)}
              />
            </Field>
          </div>
        </FieldSet>
      </div>

      <div className="py-6">
        <FieldSet disabled={busy}>
          <FieldLegend className="type-label mb-4">03 · Bản ký</FieldLegend>
          <div className="flex flex-col gap-4">
            <FilePick
              id="eol-signed-copy"
              label="Bản ký đã scan"
              required={false}
              file={signedCopy}
              onPick={(file) => {
                onDirty()
                setSignedCopy(file)
              }}
              error={errors.signedCopy}
            />
            <MoreOpinions
              idPrefix="eol-draft"
              residentId={residentId}
              items={opinions}
              onChange={(items) => {
                onDirty()
                setOpinions(items)
              }}
              error={errors.opinions}
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
  )
}

function TreatmentForm({ formId, residentId, contacts, draft, onDirty, onSaved, setBusy, busy }) {
  const [hospitals, setHospitals] = useState(() =>
    draft?.preferredHospitals?.length
      ? draft.preferredHospitals.map((h) => ({ name: h.name ?? '', address: h.address ?? '' }))
      : [{ name: '', address: '' }],
  )
  const [insurance, setInsurance] = useState(() => ({
    place: draft?.healthInsurance?.initialRegistrationPlace ?? '',
    number: draft?.healthInsurance?.cardNumber ?? '',
    expiry: displayDate(draft?.healthInsurance?.cardExpiry ?? ''),
  }))
  // Bảo hiểm y tế không bắt buộc (BR-M01-16 "nếu có", FR-023j): gập, bấm mới mở; Nháp đã có bảo hiểm thì mở sẵn
  const [insuranceOpen, setInsuranceOpen] = useState(() => !!draft?.healthInsurance)
  const [ask, setAsk] = useState(draft?.askFamilyFirst ?? false)
  const [ids, setIds] = useState(() => (draft?.notifyFamilyMembers ?? []).map((m) => m.familyMemberId))
  const [escort, setEscort] = useState(draft?.accompaniedBy ?? '')
  const [note, setNote] = useState(draft?.note ?? '')
  const [respondentType, setRespondentType] = useState(draft?.respondent?.type ?? 'RESIDENT')
  const [respondentId, setRespondentId] = useState(
    draft?.respondent?.familyMemberId != null ? String(draft.respondent.familyMemberId) : '',
  )
  const [opinions, setOpinions] = useState([])
  const [signedCopy, setSignedCopy] = useState(null)
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState(null)
  const [key] = useState(() => crypto.randomUUID())
  const uploaded = useRef(new Map())
  const dirty =
    (fn) =>
    (...args) => {
      onDirty()
      fn(...args)
    }

  function setHospital(index, field, value) {
    onDirty()
    setHospitals((current) => current.map((h, i) => (i === index ? { ...h, [field]: value } : h)))
  }

  async function submit(event) {
    event.preventDefault()
    const next = {}
    if (hospitals[1] && (!hospitals[1].name.trim() || !hospitals[1].address.trim()))
      next.hospital2 = 'Nhập đủ tên và địa chỉ bệnh viện thứ hai hoặc bỏ bệnh viện này'
    if (respondentType === 'FAMILY_MEMBER' && !respondentId) next.respondentId = 'Chọn người thân trả lời'
    if (insurance.expiry && !isoDate(insurance.expiry)) next.expiry = 'Nhập hạn thẻ dạng DD/MM/YYYY'
    if (next.expiry) setInsuranceOpen(true)
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
      const hasInsurance = insurance.place.trim() || insurance.number.trim() || insurance.expiry
      const { data } = await putResidentsByIdTreatmentWishDraft({
        path: { id: residentId },
        headers: { 'Idempotency-Key': key },
        body: {
          preferredHospitals: hospitals
            .filter((h) => h.name.trim() || h.address.trim())
            .map((h) => ({ name: h.name.trim(), address: h.address.trim() })),
          healthInsurance: hasInsurance
            ? {
                initialRegistrationPlace: insurance.place.trim() || undefined,
                cardNumber: insurance.number.trim() || undefined,
                cardExpiry: isoDate(insurance.expiry) || undefined,
              }
            : undefined,
          askFamilyFirst: ask,
          notifyFamilyMemberIds: ids,
          accompaniedBy: escort || undefined,
          note: note.trim() || undefined,
          respondent: {
            type: respondentType,
            familyMemberId: respondentType === 'FAMILY_MEMBER' ? Number(respondentId) : undefined,
          },
          otherOpinions: opinions.map(toRequestOpinion),
          signedCopyFileId,
        },
      })
      onSaved(data)
    } catch (error) {
      const problem = problemOf(error)
      const fileMessage = uploading ? uploadProblem(problem) : null
      const mapped = error instanceof ApiError ? WISH_ERRORS[problem.errorCode] : null
      if (fileMessage) setErrors({ signedCopy: fileMessage })
      else if (mapped) setErrors({ [mapped[0] === 'signerId' ? 'respondentId' : mapped[0]]: mapped[1] })
      else setFailure(problem)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form id={formId} onSubmit={submit} noValidate className="flex flex-col divide-y">
      <div className="py-6">
        <FieldSet disabled={busy}>
          <Choices
            label="01 · Người trả lời"
            required
            options={Object.entries(OPINION_SOURCE_LABELS)}
            value={respondentType}
            onChange={dirty(setRespondentType)}
          />
          {respondentType === 'FAMILY_MEMBER' && (
            <div className="mt-4">
              <MemberSelect
                id="tw-respondent"
                label="Người thân"
                contacts={contacts}
                value={respondentId}
                onChange={dirty(setRespondentId)}
                error={errors.respondentId}
              />
            </div>
          )}
        </FieldSet>
      </div>

      <div className="py-6">
        <FieldSet disabled={busy}>
          <FieldLegend className="type-label mb-4">02 · Bệnh viện và bảo hiểm</FieldLegend>
          <div className="flex flex-col gap-4">
            {hospitals.map((h, index) => (
              <div key={index} className="flex flex-col gap-2">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field data-invalid={!!errors[`hospital${index + 1}`] || undefined}>
                    <FieldLabel htmlFor={`tw-hospital-${index}-name`}>{`Bệnh viện ưu tiên ${index + 1}`}</FieldLabel>
                    <Input
                      id={`tw-hospital-${index}-name`}
                      className="h-11"
                      placeholder="Ví dụ: Bệnh viện Thống Nhất"
                      value={h.name}
                      onChange={(e) => setHospital(index, 'name', e.target.value)}
                    />
                  </Field>
                  <Field data-invalid={!!errors[`hospital${index + 1}`] || undefined}>
                    <FieldLabel htmlFor={`tw-hospital-${index}-address`}>Địa chỉ</FieldLabel>
                    <Input
                      id={`tw-hospital-${index}-address`}
                      className="h-11"
                      placeholder="Số nhà, đường, phường/xã"
                      value={h.address}
                      onChange={(e) => setHospital(index, 'address', e.target.value)}
                    />
                  </Field>
                </div>
                {errors[`hospital${index + 1}`] && <FieldError>{errors[`hospital${index + 1}`]}</FieldError>}
                {index === 1 && (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto self-start p-0"
                    onClick={dirty(() => setHospitals([hospitals[0]]))}
                  >
                    Bỏ bệnh viện thứ hai
                  </Button>
                )}
              </div>
            ))}
            {hospitals.length === 1 && (
              <Button
                type="button"
                variant="link"
                className="h-auto self-start p-0"
                onClick={dirty(() => setHospitals([...hospitals, { name: '', address: '' }]))}
              >
                + Thêm bệnh viện thứ hai
              </Button>
            )}
            <Collapsible open={insuranceOpen} onOpenChange={setInsuranceOpen} className="flex flex-col gap-4">
              <CollapsibleTrigger className="flex items-center gap-1.5 self-start type-body-sm font-medium text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                Thêm bảo hiểm y tế
                <ChevronDown aria-hidden className={cn('size-4 transition-transform', insuranceOpen && 'rotate-180')} />
              </CollapsibleTrigger>
              <CollapsibleContent className="flex flex-col gap-4">
                <Field>
                  <FieldLabel htmlFor="tw-ins-place">Nơi đăng ký khám chữa bệnh ban đầu</FieldLabel>
                  <Input
                    id="tw-ins-place"
                    className="h-11"
                    placeholder="Ví dụ: Trạm y tế phường Bến Nghé"
                    value={insurance.place}
                    onChange={dirty((e) => setInsurance((i) => ({ ...i, place: e.target.value })))}
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="tw-ins-number">Số thẻ bảo hiểm y tế</FieldLabel>
                    <Input
                      id="tw-ins-number"
                      className="h-11"
                      placeholder="Số trên thẻ"
                      value={insurance.number}
                      onChange={dirty((e) => setInsurance((i) => ({ ...i, number: e.target.value })))}
                    />
                  </Field>
                  <Field data-invalid={!!errors.expiry || undefined}>
                    <FieldLabel htmlFor="tw-ins-expiry">Hạn thẻ</FieldLabel>
                    <DateField
                      id="tw-ins-expiry"
                      value={insurance.expiry}
                      onChange={dirty((text) => setInsurance((i) => ({ ...i, expiry: text })))}
                      invalid={!!errors.expiry}
                    />
                    {errors.expiry && <FieldError>{errors.expiry}</FieldError>}
                  </Field>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </FieldSet>
      </div>

      <div className="py-6">
        <FieldSet disabled={busy}>
          <FieldLegend className="type-label mb-4">03 · Khi cần chuyển viện</FieldLegend>
          <div className="flex flex-col gap-5">
            <CheckCard
              checked={ask}
              onToggle={dirty(() => setAsk((a) => !a))}
              title="Hỏi gia đình trước khi chuyển viện không khẩn cấp"
            />
            <div className="flex flex-col gap-1.5" role="group" aria-labelledby="tw-notify-label">
              <span id="tw-notify-label" className="type-body-sm">
                Người thân cần báo
              </span>
              {contacts.length === 0 ? (
                <span className="type-body-sm text-muted-foreground">Chưa có người thân</span>
              ) : (
                contacts.map((c) => (
                  <CheckCard
                    key={c.familyMemberId}
                    checked={ids.includes(c.familyMemberId)}
                    onToggle={dirty(() =>
                      setIds((list) =>
                        list.includes(c.familyMemberId)
                          ? list.filter((x) => x !== c.familyMemberId)
                          : [...list, c.familyMemberId],
                      ),
                    )}
                    title={c.fullName}
                    detail={[relationText(c), c.primaryContact && 'liên hệ chính'].filter(Boolean).join(', ')}
                  />
                ))
              )}
              {errors.notifyIds && <FieldError>{errors.notifyIds}</FieldError>}
            </div>
            <Choices
              label="Người đi kèm"
              options={Object.entries(ESCORT_LABELS)}
              value={escort}
              onChange={dirty(setEscort)}
            />
            <Field>
              <FieldLabel htmlFor="tw-note">Ghi chú</FieldLabel>
              <Textarea
                id="tw-note"
                rows={2}
                maxLength={2000}
                placeholder="Ví dụ: báo con trai trước khi gọi xe"
                value={note}
                onChange={dirty((e) => setNote(e.target.value))}
              />
            </Field>
          </div>
        </FieldSet>
      </div>

      <div className="py-6">
        <FieldSet disabled={busy}>
          <FieldLegend className="type-label mb-4">04 · Bản ký</FieldLegend>
          <div className="flex flex-col gap-4">
            <FilePick
              id="tw-signed-copy"
              label="Bản ký đã scan"
              required={false}
              file={signedCopy}
              onPick={dirty(setSignedCopy)}
              error={errors.signedCopy}
            />
            <MoreOpinions
              idPrefix="tw-draft"
              residentId={residentId}
              items={opinions}
              onChange={dirty(setOpinions)}
              error={errors.opinions}
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
  )
}

const TABS = [
  ['eol', 'Cuối đời'],
  ['tr', 'Khi điều trị'],
]

export function WishDraftSheet({ residentId, residentName, hasEndOfLifeWish, hasTreatmentWish, onClose, onDone }) {
  const [tab, setTab] = useState('eol')
  const [drafts, setDrafts] = useState(null)
  const [contacts, setContacts] = useState([])
  const [dirty, setDirty] = useState({ eol: false, tr: false })
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  useEffect(() => {
    let live = true
    const draftOf = (loader) =>
      loader({ path: { id: residentId } })
        .then(({ data }) => data)
        .catch(() => null)
    Promise.all([draftOf(getResidentsByIdEndOfLifeWishDraft), draftOf(getResidentsByIdTreatmentWishDraft)]).then(
      ([eol, tr]) => live && setDrafts({ eol, tr }),
    )
    getResidentsByResidentIdFamilyContacts({ path: { residentId } })
      .then(({ data }) => live && setContacts(data ?? []))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [residentId])

  const anyDirty = dirty.eol || dirty.tr
  const finish = () => (saved ? onDone() : onClose())
  const requestClose = () => (anyDirty ? setConfirmClose(true) : finish())
  // Chấm trạng thái cạnh tên thẻ: hổ phách là Bản Nháp, xanh lá là đã có phiếu; chưa có thì không chấm
  const statusOf = (key) =>
    drafts?.[key]
      ? ['Bản Nháp', 'bg-warning']
      : (key === 'eol' ? hasEndOfLifeWish : hasTreatmentWish)
        ? ['Đã có phiếu', 'bg-success-foreground']
        : null

  function savedOne(key, data) {
    setDrafts((d) => ({ ...d, [key]: data }))
    setDirty((d) => ({ ...d, [key]: false }))
    setSaved(true)
  }

  const common = { residentId, contacts, busy, setBusy }

  return (
    <Sheet open onOpenChange={(next) => !next && requestClose()}>
      <SheetContent className="gap-0 p-0 sm:max-w-xl">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 flex-col gap-3 border-b px-6 pt-6 pr-12">
            <SheetTitle className="type-title">{`Nguyện vọng của ${residentName}`}</SheetTitle>
            <div role="tablist" aria-label="Phiếu nguyện vọng" className="flex gap-2 overflow-x-auto pb-4">
              {TABS.map(([key, label]) => {
                const status = statusOf(key)
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={tab === key}
                    onClick={() => setTab(key)}
                    className={cn(
                      'flex h-10 items-center gap-2 rounded-full border px-4 whitespace-nowrap type-body-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                      tab === key
                        ? 'border-primary bg-primary font-medium text-primary-foreground'
                        : 'border-border bg-card text-muted-foreground hover:border-input',
                    )}
                  >
                    {label}
                    {status && (
                      <>
                        <span aria-hidden="true" className={cn('size-2 rounded-full ring-2 ring-card', status[1])} />
                        <span className="sr-only">{`, ${status[0]}`}</span>
                      </>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6" aria-busy={busy || undefined}>
            {drafts === null ? (
              <p className="py-6 type-body-sm text-muted-foreground">Đang tải…</p>
            ) : (
              <>
                <div hidden={tab !== 'eol'}>
                  <EndOfLifeForm
                    {...common}
                    formId="wish-eol-form"
                    draft={drafts.eol}
                    onDirty={() => setDirty((d) => ({ ...d, eol: true }))}
                    onSaved={(data) => savedOne('eol', data)}
                  />
                </div>
                <div hidden={tab !== 'tr'}>
                  <TreatmentForm
                    {...common}
                    formId="wish-tr-form"
                    draft={drafts.tr}
                    onDirty={() => setDirty((d) => ({ ...d, tr: true }))}
                    onSaved={(data) => savedOne('tr', data)}
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t px-6 py-4">
            {saved && !anyDirty && (
              <span role="status" className="mr-auto type-body-sm text-success-foreground">
                Đã lưu bản Nháp
              </span>
            )}
            <Button type="button" variant="outline" className="h-11" onClick={requestClose}>
              {anyDirty || !saved ? 'Hủy' : 'Đóng'}
            </Button>
            <Button
              type="submit"
              form={tab === 'eol' ? 'wish-eol-form' : 'wish-tr-form'}
              className="h-11"
              disabled={busy || drafts === null}
            >
              {busy ? 'Đang lưu…' : tab === 'eol' ? 'Lưu bản Nháp cuối đời' : 'Lưu bản Nháp khi điều trị'}
            </Button>
          </div>
        </div>
      </SheetContent>
      <DiscardChangesDialog
        open={confirmClose}
        onKeep={() => setConfirmClose(false)}
        onDiscard={() => {
          setConfirmClose(false)
          finish()
        }}
      />
    </Sheet>
  )
}
