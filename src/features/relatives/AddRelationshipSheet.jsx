import { useState } from 'react'
import { getFamilyMembers, postFamilyMembers, postResidentsByResidentIdRelationships } from '@/api'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { DiscardChangesDialog } from '@/common/DiscardChangesDialog'
import { FileInput } from '@/common/FileInput'
import { ProblemAlert } from '@/common/ProblemAlert'
import { uploadFile } from '@/common/files'
import { problemOf } from '@/common/problem'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'
import { Choices } from '../admissions/FormParts'
import { VN_PHONE, normalizePhone } from '../residents/vnPhone'
import { CONFLICT_HINTS, RELATIONSHIP_LABELS } from './relationshipLabels'

// Thêm người thân cho một người cao tuổi (012 T013; FR-001, FR-002, FR-005, FR-008): tìm hồ sơ đã có theo họ tên, số
// điện thoại, số giấy tờ (một người thân nhiều quan hệ, FR-002) hoặc lập hồ sơ mới, rồi lập quan hệ. Mọi quyền tắt khi
// lập; liên hệ chính tự nhận thông báo khẩn, người đại diện tự được yêu cầu thay đổi dịch vụ (FR-009, FR-010).
// Bố cục (chủ dự án duyệt 2026-11-26, cùng kiểu form Tạo hồ sơ): khung xl, đầu, chân cố định; ba nhóm đánh số; kết quả tìm
// là thẻ chọn một, cuối là "Người thân mới"; người đã có quan hệ Hiệu lực với người cao tuổi này bị khóa; loại giấy tờ
// chọn CCCD, Hộ chiếu, Khác (lưu chữ, api-012 FamilyMember.idDocumentType là chuỗi); không có dòng giải thích.

const FORM_ID = 'add-relationship-form'
const NEW = 'new'
const EMPTY_MEMBER = { fullName: '', phoneNumber: '', idDocumentType: '', idDocumentNumber: '', address: '' }
const DOCUMENT_TYPES = [
  ['CCCD', 'CCCD'],
  ['Hộ chiếu', 'Hộ chiếu'],
  ['Khác', 'Khác'],
]
const CITIZEN_ID = /^\d{12}$/

// Che giữa số giấy tờ trong kết quả tìm (nhóm thông tin định danh)
function maskDocument(number) {
  if (!number) return null
  return number.length >= 8 ? `${number.slice(0, 4)}••••${number.slice(-4)}` : number
}

function memberLine(m) {
  const document = maskDocument(m.idDocumentNumber)
  return [m.phoneNumber, document && `${m.idDocumentType ?? ''} ${document}`.trim()].filter(Boolean).join(', ')
}

function Required() {
  return (
    <span aria-hidden="true" className="text-destructive">
      *
    </span>
  )
}

export function AddRelationshipSheet({
  open,
  residentId,
  residentName,
  hasPrimaryContact,
  hasRepresentative,
  existingMemberIds = [],
  onClose,
  onDone,
}) {
  const [keys] = useState(() => ({ member: crypto.randomUUID(), relationship: crypto.randomUUID() }))
  const [q, setQ] = useState('')
  const [found, setFound] = useState(null)
  const [choice, setChoice] = useState(null)
  const [member, setMember] = useState(EMPTY_MEMBER)
  const [relationship, setRelationship] = useState('')
  const [primaryContact, setPrimaryContact] = useState(false)
  const [firstRepresentative, setFirstRepresentative] = useState(false)
  const [evidence, setEvidence] = useState(null)
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const [confirmClose, setConfirmClose] = useState(false)
  // Giấy tờ, địa chỉ không bắt buộc (FR-001; giấy tờ chỉ cần khi bật "được phép đón", FR-007): gập, bấm mới mở
  const [moreOpen, setMoreOpen] = useState(false)
  // Ô đã rời khỏi thì báo lỗi ngay (họ tên, số điện thoại, số giấy tờ), không chờ bấm lưu
  const [touched, setTouched] = useState({})
  const touch = (key) => () => setTouched((t) => ({ ...t, [key]: true }))

  const creating = choice === NEW
  const chosen = found?.find((m) => m.id === choice) ?? null
  const dirty = !!(choice || relationship || primaryContact || firstRepresentative || q.trim())
  const requestClose = () => (dirty ? setConfirmClose(true) : onClose())
  const set = (name) => (e) => setMember((m) => ({ ...m, [name]: e.target.value }))

  async function search() {
    const text = q.trim()
    if (!text) return
    try {
      const { data } = await getFamilyMembers({ query: { q: text } })
      setFound(data)
      setFailure(null)
      // Không thấy thì mở "Người thân mới", điền sẵn chữ vừa tìm (số thì vào số điện thoại)
      if (data.length === 0) {
        setChoice(NEW)
        const digits = /^[\d\s+.-]+$/.test(text)
        setMember((m) => ({
          ...m,
          ...(digits ? { phoneNumber: m.phoneNumber || text } : { fullName: m.fullName || text }),
        }))
      } else if (choice !== NEW) {
        setChoice(null)
      }
    } catch (error) {
      setFailure(problemOf(error))
    }
  }

  function chooseNew() {
    setChoice(NEW)
    const text = q.trim()
    if (text && !member.fullName && !/^[\d\s+.-]+$/.test(text)) setMember((m) => ({ ...m, fullName: text }))
  }

  const phone = member.phoneNumber.trim()
  const documentNumber = member.idDocumentNumber.trim()
  const errors = {
    choice: !choice && 'Chọn một người thân hoặc người thân mới',
    fullName: creating && !member.fullName.trim() && 'Nhập họ tên',
    phoneNumber: creating
      ? !phone
        ? 'Nhập số điện thoại'
        : !VN_PHONE.test(normalizePhone(phone)) &&
          'Số điện thoại Việt Nam: di động 10 số (03, 05, 07, 08, 09…), cố định 11 số (02…)'
      : null,
    idDocumentType: creating && documentNumber && !member.idDocumentType && 'Chọn loại giấy tờ',
    idDocumentNumber:
      creating && member.idDocumentType === 'CCCD' && documentNumber && !CITIZEN_ID.test(documentNumber)
        ? 'Số căn cước gồm đúng 12 chữ số'
        : null,
    relationship: !relationship && 'Chọn quan hệ',
    evidence: firstRepresentative && !evidence && 'Chọn tệp bằng chứng',
    reason: firstRepresentative && !reason.trim() && 'Nhập lý do',
  }
  const shown = (key) => (submitted || touched[key] ? errors[key] || null : null)
  const describedBy = (key) => (shown(key) ? `${key}-error` : `${key}-hint`)

  async function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    if (Object.values(errors).some(Boolean)) {
      if (errors.idDocumentType || errors.idDocumentNumber) setMoreOpen(true)
      return
    }
    setBusy(true)
    setFailure(null)
    try {
      let familyMemberId = chosen?.id
      if (creating) {
        const body = {
          fullName: member.fullName.trim(),
          phoneNumber: normalizePhone(phone),
          ...(member.idDocumentType && documentNumber && { idDocumentType: member.idDocumentType }),
          ...(documentNumber && { idDocumentNumber: documentNumber }),
          ...(member.address.trim() && { address: member.address.trim() }),
        }
        const { data } = await postFamilyMembers({ headers: { 'Idempotency-Key': keys.member }, body })
        familyMemberId = data.id
      }
      const body = { familyMemberId, relationship, primaryContact, setFirstRepresentative: firstRepresentative }
      if (firstRepresentative) {
        body.evidenceFileId = await uploadFile(evidence)
        body.reason = reason.trim()
      }
      await postResidentsByResidentIdRelationships({
        path: { residentId },
        headers: { 'Idempotency-Key': keys.relationship },
        body,
      })
      onDone('Đã thêm người thân')
    } catch (error) {
      setFailure(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  const cardClass = (selected) =>
    cn(
      'flex min-h-14 w-full items-center gap-3 rounded-[10px] border px-3 py-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
      selected ? 'border-primary bg-accent/30' : 'border-border bg-card hover:bg-muted',
      'disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground',
    )
  const radio = (selected) => (
    <span
      aria-hidden="true"
      className={cn(
        'size-4 shrink-0 rounded-full border-[1.5px] border-input',
        selected && 'border-[5px] border-primary',
      )}
    />
  )

  return (
    <Sheet open={open} onOpenChange={(next) => !next && requestClose()}>
      <SheetContent side="center" className="gap-0 p-0 sm:max-w-3xl">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 flex-col gap-1 border-b px-6 pt-6 pb-4 pr-12">
            <SheetTitle className="type-title">{`Thêm người thân cho ${residentName}`}</SheetTitle>
          </div>

          <form
            id={FORM_ID}
            onSubmit={submit}
            noValidate
            aria-busy={busy || undefined}
            className="flex min-h-0 flex-1 flex-col divide-y overflow-y-auto px-6"
          >
            <div className="py-6">
              <FieldSet disabled={busy}>
                <FieldLegend className="type-label mb-4">
                  01 · Người thân <Required />
                </FieldLegend>
                <div className="flex gap-2">
                  <Input
                    aria-label="Tìm người thân theo họ tên, số điện thoại, số giấy tờ"
                    placeholder="Họ tên, số điện thoại hoặc số giấy tờ"
                    className="h-11"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        search()
                      }
                    }}
                  />
                  <Button type="button" variant="outline" className="h-11" onClick={search}>
                    Tìm
                  </Button>
                </div>
                <div role="radiogroup" aria-label="Người thân" className="mt-2 flex flex-col gap-1.5">
                  {(found ?? []).map((m) => {
                    const related = existingMemberIds.includes(m.id)
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="radio"
                        aria-checked={choice === m.id}
                        disabled={related}
                        onClick={() => setChoice(m.id)}
                        className={cardClass(choice === m.id)}
                      >
                        {radio(choice === m.id)}
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="type-body-sm">{m.fullName}</span>
                          <span className="type-caption text-muted-foreground">{memberLine(m)}</span>
                        </span>
                        {related && <span className="type-caption text-muted-foreground">Đã là người thân</span>}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={creating}
                    onClick={chooseNew}
                    className={cardClass(creating)}
                  >
                    {radio(creating)}
                    <span className="type-body-sm">Người thân mới</span>
                  </button>
                </div>
                {shown('choice') && <FieldError>{shown('choice')}</FieldError>}

                {creating && (
                  <div className="mt-4 flex flex-col gap-4">
                    <Field data-invalid={!!shown('fullName') || undefined}>
                      <FieldLabel htmlFor="member-name">
                        Họ tên <Required />
                      </FieldLabel>
                      <Input
                        id="member-name"
                        autoComplete="off"
                        placeholder="Nhập họ và tên đầy đủ"
                        className="h-11"
                        value={member.fullName}
                        onChange={set('fullName')}
                        onBlur={touch('fullName')}
                        aria-invalid={!!shown('fullName') || undefined}
                        aria-describedby={shown('fullName') ? 'fullName-error' : undefined}
                      />
                      {shown('fullName') && <FieldError id="fullName-error">{shown('fullName')}</FieldError>}
                    </Field>
                    <Field data-invalid={!!shown('phoneNumber') || undefined}>
                      <FieldLabel htmlFor="member-phone">
                        Số điện thoại <Required />
                      </FieldLabel>
                      <Input
                        id="member-phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="off"
                        maxLength={18}
                        placeholder="Nhập số điện thoại, ví dụ 0912 345 678"
                        className="h-11"
                        value={member.phoneNumber}
                        onChange={set('phoneNumber')}
                        onBlur={touch('phoneNumber')}
                        aria-invalid={!!shown('phoneNumber') || undefined}
                        aria-describedby={shown('phoneNumber') ? 'phoneNumber-error' : undefined}
                      />
                      {shown('phoneNumber') && <FieldError id="phoneNumber-error">{shown('phoneNumber')}</FieldError>}
                    </Field>
                    <Collapsible open={moreOpen} onOpenChange={setMoreOpen} className="flex flex-col gap-4">
                      <CollapsibleTrigger className="flex items-center gap-1.5 self-start type-body-sm font-medium text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                        Thêm giấy tờ, địa chỉ
                        <ChevronDown
                          aria-hidden
                          className={cn('size-4 transition-transform', moreOpen && 'rotate-180')}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="flex flex-col gap-4">
                        <FieldDescription>
                          Không bắt buộc. Cần loại và số giấy tờ khi người thân được phép đón người cao tuổi.
                        </FieldDescription>
                        <Choices
                          label="Loại giấy tờ"
                          options={DOCUMENT_TYPES}
                          value={member.idDocumentType}
                          onChange={(value) => setMember((m) => ({ ...m, idDocumentType: value }))}
                          error={shown('idDocumentType')}
                        />
                        <Field data-invalid={!!shown('idDocumentNumber') || undefined}>
                          <FieldLabel htmlFor="member-document-number">Số giấy tờ</FieldLabel>
                          <Input
                            id="member-document-number"
                            inputMode={member.idDocumentType === 'CCCD' ? 'numeric' : undefined}
                            maxLength={member.idDocumentType === 'CCCD' ? 12 : 30}
                            autoComplete="off"
                            placeholder={member.idDocumentType === 'CCCD' ? 'Nhập 12 chữ số' : 'Nhập số giấy tờ'}
                            className="h-11"
                            value={member.idDocumentNumber}
                            onChange={set('idDocumentNumber')}
                            onBlur={touch('idDocumentNumber')}
                            aria-invalid={!!shown('idDocumentNumber') || undefined}
                            aria-describedby={shown('idDocumentNumber') ? 'idDocumentNumber-error' : undefined}
                          />
                          {shown('idDocumentNumber') && (
                            <FieldError id="idDocumentNumber-error">{shown('idDocumentNumber')}</FieldError>
                          )}
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="member-address">Địa chỉ</FieldLabel>
                          <Input
                            id="member-address"
                            placeholder="Số nhà, đường, phường/xã, tỉnh/thành phố"
                            className="h-11"
                            value={member.address}
                            onChange={set('address')}
                          />
                        </Field>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                )}
              </FieldSet>
            </div>

            <div className="py-6">
              <FieldSet disabled={busy}>
                <Choices
                  label="02 · Quan hệ"
                  required
                  options={Object.entries(RELATIONSHIP_LABELS)}
                  value={relationship}
                  onChange={setRelationship}
                  error={shown('relationship')}
                />
              </FieldSet>
            </div>

            {(!hasPrimaryContact || !hasRepresentative) && (
              <div className="py-6">
                <FieldSet disabled={busy}>
                  <FieldLegend className="type-label mb-4">03 · Vai trò</FieldLegend>
                  <div className="flex flex-col gap-3">
                    {!hasPrimaryContact && (
                      <Field orientation="horizontal">
                        <Checkbox id="primary-contact" checked={primaryContact} onCheckedChange={setPrimaryContact} />
                        <FieldContent>
                          <FieldLabel htmlFor="primary-contact">Là người liên hệ chính</FieldLabel>
                          <FieldDescription>Viện liên hệ đầu tiên; luôn nhận thông báo khẩn.</FieldDescription>
                        </FieldContent>
                      </Field>
                    )}
                    {!hasRepresentative && (
                      <Field orientation="horizontal">
                        <Checkbox
                          id="first-representative"
                          checked={firstRepresentative}
                          onCheckedChange={setFirstRepresentative}
                        />
                        <FieldContent>
                          <FieldLabel htmlFor="first-representative">Là người đại diện</FieldLabel>
                          <FieldDescription>Ký hợp đồng lưu trú; được yêu cầu thay đổi dịch vụ.</FieldDescription>
                        </FieldContent>
                      </Field>
                    )}
                    {firstRepresentative && (
                      <div className="ml-7 flex flex-col gap-4">
                        <Field data-invalid={!!shown('evidence') || undefined}>
                          <FieldLabel htmlFor="new-evidence">
                            Bằng chứng <Required />
                          </FieldLabel>
                          <FileInput
                            id="new-evidence"
                            accept="application/pdf,image/jpeg,image/png"
                            onChange={(e) => setEvidence(e.target.files?.[0] ?? null)}
                            aria-invalid={!!shown('evidence') || undefined}
                            aria-describedby={describedBy('evidence')}
                          />
                          {shown('evidence') ? (
                            <FieldError id="evidence-error">{shown('evidence')}</FieldError>
                          ) : (
                            <FieldDescription id="evidence-hint">
                              Văn bản ủy quyền, giấy tờ quan hệ hoặc hợp đồng đã ký; tệp PDF, JPG, PNG.
                            </FieldDescription>
                          )}
                        </Field>
                        <Field data-invalid={!!shown('reason') || undefined}>
                          <FieldLabel htmlFor="new-reason">
                            Lý do <Required />
                          </FieldLabel>
                          <Textarea
                            id="new-reason"
                            rows={3}
                            maxLength={2000}
                            placeholder="Ví dụ: con trai đứng tên ký hợp đồng lưu trú"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            aria-invalid={!!shown('reason') || undefined}
                          />
                          {shown('reason') && <FieldError>{shown('reason')}</FieldError>}
                        </Field>
                      </div>
                    )}
                  </div>
                </FieldSet>
              </div>
            )}

            {failure && (
              <div className="py-6">
                <ProblemAlert problem={failure}>
                  {CONFLICT_HINTS[failure.errorCode] && <p>{CONFLICT_HINTS[failure.errorCode]}</p>}
                </ProblemAlert>
              </div>
            )}
          </form>

          <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t px-6 py-4">
            <Button type="button" variant="outline" className="h-11" onClick={requestClose}>
              Hủy
            </Button>
            <Button type="submit" form={FORM_ID} className="h-11" disabled={busy}>
              {busy ? 'Đang lưu…' : 'Thêm người thân'}
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
