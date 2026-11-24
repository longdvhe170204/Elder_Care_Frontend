import { useState } from 'react'
import { postResidentsByResidentIdFamilyRegistrationForms } from '@/api'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { ProblemAlert } from '@/common/ProblemAlert'
import { uploadFile } from '@/common/files'
import { problemOf } from '@/common/problem'
import { CONFLICT_HINTS, RIGHT_LABELS, RIGHT_ORDER } from './relationshipLabels'
import { FileInput } from '@/common/FileInput'

// Ghi phiếu đăng ký người thân (012 T010, T013; FR-008, Q-126): người đại diện ký, bản scan bắt buộc; mỗi quyền đánh
// dấu thành một yêu cầu Hiệu lực ngay cách "bản ký". Chỉ chép đúng các quyền ghi trên phiếu giấy; không chọn sẵn ô nào.
// Được yêu cầu thay đổi dịch vụ tự theo vai trò người đại diện (FR-010) nên không có trên phiếu; nhận thông báo khẩn chỉ tự
// bật với người liên hệ chính (FR-009), người thân khác ghi được trên phiếu (FR-007, FR-008; test BF-12 2026-11-24).

const FORM_RIGHTS = RIGHT_ORDER.filter((r) => r !== 'REQUEST_SERVICES')
const rightsOnForm = (relationship) =>
  relationship.primaryContact ? FORM_RIGHTS.filter((r) => r !== 'RECEIVE_URGENT') : FORM_RIGHTS

export function RegistrationFormSheet({ open, residentId, residentName, relationships, onClose, onDone }) {
  const [key] = useState(() => crypto.randomUUID())
  const representatives = relationships.filter((r) => r.representative)
  const [signer, setSigner] = useState(representatives.length === 1 ? String(representatives[0].familyMember.id) : '')
  const [scan, setScan] = useState(null)
  const [lines, setLines] = useState(new Set())
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)

  const toggle = (id) => (checked) =>
    setLines((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })

  async function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    if (!signer || !scan || lines.size === 0) return
    setBusy(true)
    try {
      const scanFileId = await uploadFile(scan)
      await postResidentsByResidentIdFamilyRegistrationForms({
        path: { residentId },
        headers: { 'Idempotency-Key': key },
        body: {
          representativeId: Number(signer),
          scanFileId,
          lines: [...lines].map((id) => {
            const [relationshipId, right] = id.split(':')
            return { relationshipId: Number(relationshipId), right }
          }),
        },
      })
      onDone('Đã ghi phiếu đăng ký người thân')
    } catch (error) {
      setFailure(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto p-6 sm:max-w-2xl">
        <SheetTitle className="type-title">Ghi phiếu đăng ký người thân</SheetTitle>
        <SheetDescription className="type-body-sm text-muted-foreground">
          Phiếu của {residentName} do người đại diện ký. Mỗi quyền đánh dấu có hiệu lực ngay theo bản ký.
        </SheetDescription>
        <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-4">
          <Field data-invalid={(submitted && !signer) || undefined}>
            <FieldLabel htmlFor="form-signer">Người đại diện ký phiếu</FieldLabel>
            <select
              id="form-signer"
              value={signer}
              onChange={(e) => setSigner(e.target.value)}
              aria-invalid={(submitted && !signer) || undefined}
              className="h-11 w-full rounded-md border border-input bg-transparent px-3"
            >
              <option value="">Chọn người đại diện</option>
              {representatives.map((r) => (
                <option key={r.id} value={r.familyMember.id}>
                  {r.familyMember.fullName}
                </option>
              ))}
            </select>
            {submitted && !signer && <FieldError>Chọn người đại diện đã ký phiếu</FieldError>}
          </Field>
          <Field data-invalid={(submitted && !scan) || undefined}>
            <FieldLabel htmlFor="form-scan">Bản scan phiếu</FieldLabel>
            <FileInput
              id="form-scan"
              accept="application/pdf,image/jpeg,image/png"
              aria-invalid={(submitted && !scan) || undefined}
              onChange={(e) => setScan(e.target.files?.[0] ?? null)}
            />
            {submitted && !scan && <FieldError>Chọn bản scan phiếu</FieldError>}
          </Field>

          {relationships.map((r) => (
            <fieldset key={r.id} className="flex flex-col gap-2 rounded-lg border p-4">
              <legend className="type-label px-1">{r.familyMember.fullName}</legend>
              {rightsOnForm(r).map((right) => {
                const id = `${r.id}:${right}`
                return (
                  <Field key={right} orientation="horizontal">
                    <Checkbox id={`line-${id}`} checked={lines.has(id)} onCheckedChange={toggle(id)} />
                    <FieldLabel htmlFor={`line-${id}`}>{RIGHT_LABELS[right]}</FieldLabel>
                  </Field>
                )
              })}
            </fieldset>
          ))}
          {submitted && lines.size === 0 && (
            <p className="type-body-sm text-destructive">Đánh dấu ít nhất một quyền ghi trên phiếu</p>
          )}

          <ProblemAlert problem={failure}>
            {failure && CONFLICT_HINTS[failure.errorCode] && <p>{CONFLICT_HINTS[failure.errorCode]}</p>}
          </ProblemAlert>
          <Button type="submit" className="h-11 self-start" disabled={busy}>
            Ghi phiếu
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
