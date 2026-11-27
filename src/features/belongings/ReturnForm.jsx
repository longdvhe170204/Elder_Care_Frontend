import { useRef, useState } from 'react'
import { getBelongingsById, postBelongingsReturns } from '@/api'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { ProblemAlert } from '@/common/ProblemAlert'
import { uploadFile } from '@/common/files'
import { problemOf } from '@/common/problem'
import { FilesField, MemberField, SelectField } from './BelongingFields'
import { activeOptions, confirmationFit, pickLabel } from './belongingLabels'
import { useFamilyContacts } from './useFamilyContacts'
import { ReturnConfirmation } from './ReturnConfirmation'
import { useOpenConfirmations } from './useOpenConfirmations'

// Lệnh Trả một hoặc nhiều đồ cho cùng người nhận (013 T019, US3; FR-016 → FR-020, BR-M12-04; api-013 ReturnCommand).
// Mỗi đồ chọn mức tình trạng lúc trả, trả toàn bộ số đang giữ (demo 2026-11-25 bỏ ô số trả). Người nhận khác
// người có quyền nhận, và chính người cao tuổi nhận đồ loại cần đồng ý (FR-018, Q-253), phải có xác nhận người nhận khác
// Hiệu lực: Hành chính chọn trong danh sách hoặc lập ngay tại đây (ReturnConfirmation); Điều dưỡng không trả theo xác
// nhận (FR-016a). Bản ký của người nhận bắt buộc, trừ người cao tuổi không ký thì ghi lý do (FR-019). Lệnh bị chặn vì
// người nhận thì backend vẫn ghi lần chặn (FR-016): màn báo lý do, tải lại danh sách và giữ form để sửa. Demo 2026-11-25 (chủ dự án chốt): bỏ ô họ tên, loại và
// số giấy tờ; người thân chọn trong danh sách (họ tên lấy theo hồ sơ), người nhận khác lấy họ tên, giấy tờ từ xác nhận đã chọn.

const RECIPIENTS = [
  { value: 'FAMILY_MEMBER', label: 'Người thân' },
  { value: 'RESIDENT', label: 'Người cao tuổi' },
  { value: 'OTHER_PERSON', label: 'Người khác (có xác nhận người nhận khác)' },
]
const BLOCK_CODES = ['RETURN_BLOCKED', 'INVALID_RECIPIENT_CONFIRMATION', 'NURSING_STAFF_VALUABLE_ITEM']

export function ReturnForm({
  residentId,
  residentName = '',
  role,
  belongings,
  levels,
  isValuable = () => false,
  requiresConsent = () => false,
  locationName,
  onConfirmationCreated,
  onDone,
  allowOtherRecipient = false,
}) {
  const [chosen, setChosen] = useState({})
  const [v, setV] = useState({
    type: '',
    familyMemberId: '',
    noSignatureReason: '',
    opinion: '',
  })
  const [confirmationId, setConfirmationId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [now] = useState(() => new Date())
  const [signature, setSignature] = useState([])
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState(null)
  const [blocked, setBlocked] = useState(false)
  const [busy, setBusy] = useState(false)
  const key = useRef(crypto.randomUUID())
  const set = (name) => (value) => setV((s) => ({ ...s, [name]: value }))
  const setItem = (id, patch) => setChosen((c) => ({ ...c, [id]: { ...c[id], ...patch } }))
  const contacts = useFamilyContacts(residentId)
  const familyMember = contacts.members.find((m) => String(m.id) === v.familyMemberId)
  // FR-020: tình trạng lúc tiếp nhận để so với lúc trả; không đọc được thì bỏ qua, lệnh trả vẫn làm được
  function toggle(id, on) {
    setItem(id, { on })
    if (!on || chosen[id]?.intake !== undefined) return
    getBelongingsById({ path: { id } }).then(
      ({ data }) => setItem(id, { intake: data.handovers.find((h) => h.kind === 'INTAKE') ?? null }),
      () => setItem(id, { intake: null }),
    )
  }
  const intakeText = (h) =>
    h && [levels.find((l) => l.id === h.conditionLevelId)?.name, h.conditionDescription].filter(Boolean).join(', ')
  const selected = belongings.filter((b) => chosen[b.id]?.on)
  const levelOptions = activeOptions([...levels].sort((a, b) => a.order - b.order))

  // FR-016a: trả theo xác nhận người nhận khác và lập xác nhận chỉ do Hành chính
  const office = role === 'OFFICE_STAFF'
  const consentItems = v.type === 'RESIDENT' && selected.some(requiresConsent)
  const needsConfirmation = office && (v.type === 'OTHER_PERSON' || consentItems)
  const openConfirmations = useOpenConfirmations(residentId, needsConfirmation)
  // Không còn ô họ tên, giấy tờ: mỗi xác nhận khớp người theo chính họ tên, giấy tờ ghi trong nó
  const fitQuery = (c) => ({
    type: v.type,
    fullName: c.recipientName,
    documentType: '',
    documentNumber: c.recipientIdDocument,
    belongingIds: selected.map((b) => b.id),
    now,
  })
  const fits = openConfirmations.items.map((c) => ({ confirmation: c, ...confirmationFit(c, fitQuery(c)) }))
  const matches = fits.filter((f) => f.fits)
  // Xác nhận đã chọn chỉ còn giá trị khi vẫn khớp loại người nhận và đồ đang chọn (đổi thì tự bỏ chọn)
  const confirmation = needsConfirmation ? matches.find((m) => m.confirmation.id === confirmationId) : undefined
  const itemLabel = (id) => {
    const b = belongings.find((x) => x.id === id)
    return b ? pickLabel(b, locationName) : `mã ${id}`
  }
  const createInitial =
    v.type === 'RESIDENT'
      ? { name: residentName, document: '', isResident: true, belongingIds: selected.map((b) => b.id) }
      : { name: '', document: '', isResident: false, belongingIds: selected.map((b) => b.id) }
  const createHint = selected.length === 0 ? 'Chọn đồ trả trước khi lập xác nhận.' : null

  async function confirmationCreated(id) {
    setCreating(false)
    await openConfirmations.reload()
    if (id != null) setConfirmationId(id)
    onConfirmationCreated?.()
  }

  function validate() {
    const e = {}
    if (needsConfirmation && creating) e.confirmation = 'Lập xác nhận xong hoặc đóng phần lập trước khi lưu trả.'
    if (selected.length === 0) e.items = 'Chọn ít nhất một đồ để trả.'
    for (const b of selected) {
      if (!chosen[b.id].levelId) e[`level-${b.id}`] = 'Chọn mức tình trạng.'
      // FR-008: trả đồ có giá trị bắt buộc có ảnh tình trạng
      if (isValuable(b) && !chosen[b.id].photos?.length) e[`photo-${b.id}`] = 'Chọn ảnh tình trạng của đồ có giá trị.'
    }
    if (!v.type) e.type = 'Chọn người nhận.'
    if (v.type === 'FAMILY_MEMBER' && !/^[1-9]\d*$/.test(v.familyMemberId)) e.familyMemberId = 'Chọn người thân nhận.'
    if (v.type === 'OTHER_PERSON' && office && !creating && !confirmation)
      e.confirmation = 'Chọn xác nhận người nhận khác.'
    if (v.type === 'RESIDENT') {
      if (signature.length === 0 && !v.noSignatureReason.trim())
        e.signature = 'Chọn bản ký hoặc ghi lý do người cao tuổi không ký.'
    } else if (v.type && signature.length === 0) e.signature = 'Chọn bản ký của người nhận.'
    return e
  }

  async function submit(event) {
    event.preventDefault()
    const found = validate()
    setErrors(found)
    setFailure(null)
    setBlocked(false)
    if (Object.keys(found).length > 0) return
    setBusy(true)
    try {
      const signatureFileId = signature.length > 0 ? await uploadFile(signature[0]) : undefined
      const photoIds = {}
      for (const b of selected) {
        photoIds[b.id] = []
        for (const file of chosen[b.id].photos ?? []) photoIds[b.id].push(await uploadFile(file))
      }
      const recipient = { type: v.type }
      if (v.type === 'FAMILY_MEMBER') {
        recipient.familyMemberId = Number(v.familyMemberId)
        if (familyMember) recipient.fullName = familyMember.fullName
      }
      if (v.type === 'OTHER_PERSON' && confirmation) {
        recipient.fullName = confirmation.confirmation.recipientName
        recipient.presentedIdDocument = { number: confirmation.confirmation.recipientIdDocument }
      }
      await postBelongingsReturns({
        headers: { 'Idempotency-Key': key.current },
        body: {
          items: selected.map((b) => ({
            belongingId: b.id,
            version: b.version,
            condition: { levelId: Number(chosen[b.id].levelId) },
            ...(photoIds[b.id].length > 0 && { photoFileIds: photoIds[b.id] }),
          })),
          recipient,
          ...(confirmation && { recipientConfirmationId: confirmation.confirmation.id }),
          ...(signatureFileId && { signatureFileId }),
          ...(!signatureFileId && v.noSignatureReason.trim() && { noSignatureReason: v.noSignatureReason.trim() }),
          ...(v.opinion.trim() && { conditionOpinion: v.opinion.trim() }),
        },
      })
      onDone('Đã trả đồ.')
    } catch (error) {
      const p = problemOf(error)
      setFailure(p)
      if (BLOCK_CODES.includes(p.errorCode)) {
        // Lần chặn đã được ghi: Idempotency-Key mới để lần gửi sau (đã sửa người nhận) là lệnh khác
        key.current = crypto.randomUUID()
        setBlocked(true)
        onDone(null)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <FieldGroup>
        <fieldset className="flex flex-col gap-3">
          <legend className="type-label">Đồ trả</legend>
          {errors.items && <FieldError>{errors.items}</FieldError>}
          {belongings.map((b) => (
            <div key={b.id} className="flex flex-col gap-2 rounded-lg border p-3">
              <label className="flex min-h-10 cursor-pointer items-center gap-2">
                <Checkbox
                  checked={!!chosen[b.id]?.on}
                  onCheckedChange={(on) => toggle(b.id, on)}
                  aria-label={`Trả ${b.description}, mã ${b.id}`}
                />
                <span className="type-body-sm">{pickLabel(b, locationName)}</span>
              </label>
              {chosen[b.id]?.on && intakeText(chosen[b.id].intake) && (
                <p className="type-body-sm text-muted-foreground">Lúc tiếp nhận: {intakeText(chosen[b.id].intake)}</p>
              )}
              {chosen[b.id]?.on && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField
                    id={`return-level-${b.id}`}
                    label={`Mức tình trạng lúc trả của ${b.description}`}
                    value={chosen[b.id].levelId ?? ''}
                    onChange={(levelId) => setItem(b.id, { levelId })}
                    options={levelOptions}
                    error={errors[`level-${b.id}`]}
                  />
                  <FilesField
                    id={`return-photos-${b.id}`}
                    label={`Ảnh tình trạng của ${b.description}`}
                    files={chosen[b.id].photos ?? []}
                    onChange={(photos) => setItem(b.id, { photos })}
                    multiple
                    error={errors[`photo-${b.id}`]}
                    hint={
                      isValuable(b)
                        ? 'Bắt buộc với đồ có giá trị. JPEG hoặc PNG, tối đa 10 MB mỗi ảnh.'
                        : 'Không bắt buộc. JPEG hoặc PNG, tối đa 10 MB mỗi ảnh.'
                    }
                  />
                </div>
              )}
            </div>
          ))}
        </fieldset>
        <SelectField
          id="return-recipient"
          label="Người nhận"
          value={v.type}
          onChange={set('type')}
          options={office && allowOtherRecipient ? RECIPIENTS : RECIPIENTS.filter((r) => r.value !== 'OTHER_PERSON')}
          error={errors.type}
        />
        {!office && consentItems && (
          <p className="type-body-sm text-warning-foreground">
            Đồ loại cần đồng ý (tiền mặt, trang sức) trả cho chính người cao tuổi phải có xác nhận người nhận khác, chỉ
            Hành chính trả (FR-016a).
          </p>
        )}
        {v.type === 'FAMILY_MEMBER' && (
          <MemberField
            id="return-family"
            label="Người thân nhận"
            fallbackLabel="Mã người thân"
            contacts={contacts}
            filter={(m) => m.representative || m.pickupAllowed}
            value={v.familyMemberId}
            onChange={set('familyMemberId')}
            error={errors.familyMemberId}
          />
        )}
        {needsConfirmation && (
          <ReturnConfirmation
            list={openConfirmations}
            matches={matches}
            pending={fits.filter((f) => f.reason === 'pending')}
            chosenId={confirmation ? confirmationId : null}
            onChoose={setConfirmationId}
            itemLabel={itemLabel}
            createInitial={createInitial}
            createHint={createHint}
            creating={creating}
            onCreating={setCreating}
            onCreated={confirmationCreated}
            residentId={residentId}
            belongings={belongings}
            locationName={locationName}
            error={errors.confirmation}
          />
        )}
        <FilesField
          id="return-signature"
          label="Bản ký của người nhận"
          files={signature}
          onChange={setSignature}
          error={errors.signature}
          hint="PDF, JPEG hoặc PNG, tối đa 10 MB."
        />
        {v.type === 'RESIDENT' && (
          <Field>
            <FieldLabel htmlFor="return-no-signature">Lý do không ký</FieldLabel>
            <Textarea
              id="return-no-signature"
              rows={2}
              maxLength={2000}
              value={v.noSignatureReason}
              onChange={(e) => set('noSignatureReason')(e.target.value)}
            />
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="return-opinion">Ý kiến của người nhận về tình trạng (không bắt buộc)</FieldLabel>
          <Textarea
            id="return-opinion"
            rows={2}
            maxLength={2000}
            value={v.opinion}
            onChange={(e) => set('opinion')(e.target.value)}
          />
        </Field>
      </FieldGroup>
      <ProblemAlert problem={failure}>{blocked && <p>Lần chặn trả đã được ghi vào lịch sử của đồ.</p>}</ProblemAlert>
      <Button type="submit" className="h-11 self-start" disabled={busy}>
        Lưu trả đồ
      </Button>
    </form>
  )
}
