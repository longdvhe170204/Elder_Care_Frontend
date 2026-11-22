import { useRef, useState } from 'react'
import { postResidenceRegistrationsByIdByCommand } from '@/api'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ProblemAlert } from '@/common/ProblemAlert'
import { uploadFile } from '@/common/files'
import { problemOf } from '@/common/problem'
import { COMMANDS } from './registrationLabels'
import { FileInput } from '@/common/FileInput'

// Form lệnh trên khai báo (018 T008, T010, T014, Q-414; api-018 POST /residence-registrations/{id}/{command}; bố cục K4, K7).
// Mỗi form kiểm trước các trường bắt buộc rồi gửi; 409 và 422 hiện bằng Alert trong khung (DESIGN.md 7.4). Idempotency-Key
// đổi sau mỗi lần lỗi để lần gửi sau (đã sửa nội dung) là lệnh khác.

function useCommand(registration, onDone) {
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const key = useRef(crypto.randomUUID())

  async function run(command, body, message) {
    setBusy(true)
    setFailure(null)
    try {
      await postResidenceRegistrationsByIdByCommand({
        path: { id: registration.id, command },
        headers: { 'Idempotency-Key': key.current },
        body,
      })
      onDone(message)
    } catch (error) {
      key.current = crypto.randomUUID()
      setFailure(problemOf(error))
    } finally {
      setBusy(false)
    }
  }
  return { busy, failure, run }
}

function FormShell({ title, submitLabel, busy, failure, onSubmit, onCancel, children }) {
  return (
    <form
      aria-label={title}
      noValidate
      className="flex flex-col gap-4 rounded-lg border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <h4 className="type-label">{title}</h4>
      <FieldGroup>{children}</FieldGroup>
      <ProblemAlert problem={failure} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="h-11" disabled={busy}>
          {submitLabel}
        </Button>
        <Button type="button" variant="outline" className="h-11" onClick={onCancel}>
          Hủy
        </Button>
      </div>
    </form>
  )
}

function TextField({ id, label, value, onChange, error, type = 'text' }) {
  return (
    <Field data-invalid={!!error || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type={type}
        className="h-11"
        value={value}
        aria-invalid={!!error || undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}

function EvidenceField({ id, label, accept = 'application/pdf,image/jpeg,image/png', files, onChange, error }) {
  return (
    <Field data-invalid={!!error || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FileInput
        id={id}
        accept={accept}
        aria-invalid={!!error || undefined}
        onChange={(event) => onChange(Array.from(event.target.files ?? []))}
      />
      {files.length > 0 && (
        <span className="type-body-sm text-muted-foreground">Đã chọn: {files.map((f) => f.name).join(', ')}</span>
      )}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}

function ConfirmLocalForm({ registration, onDone, onCancel }) {
  const { busy, failure, run } = useCommand(registration, onDone)
  const [basisNote, setBasisNote] = useState('')
  const [error, setError] = useState('')

  function submit() {
    if (!basisNote.trim()) {
      setError('Nhập căn cứ xác nhận thường trú cùng xã/phường.')
      return
    }
    setError('')
    run(COMMANDS.CONFIRM_LOCAL, { basisNote: basisNote.trim() }, 'Đã xác nhận thường trú cùng xã/phường.')
  }

  return (
    <FormShell
      title="Xác nhận thường trú cùng xã/phường"
      submitLabel="Xác nhận thường trú"
      busy={busy}
      failure={failure}
      onSubmit={submit}
      onCancel={onCancel}
    >
      <Field data-invalid={!!error || undefined}>
        <FieldLabel htmlFor="registration-basis">Căn cứ</FieldLabel>
        <Textarea
          id="registration-basis"
          value={basisNote}
          aria-invalid={!!error || undefined}
          onChange={(event) => setBasisNote(event.target.value)}
        />
        {error && <FieldError>{error}</FieldError>}
      </Field>
    </FormShell>
  )
}

// Ghi đã tiếp nhận (Q-414): Cần khai báo → Đã xác nhận bằng một ảnh bằng chứng; đăng ký tạm trú kèm ngày hết hạn
function AcceptedForm({ registration, onDone, onCancel }) {
  const { busy, failure, run } = useCommand(registration, onDone)
  const [evidence, setEvidence] = useState([])
  const [expiryDate, setExpiryDate] = useState('')
  const [errors, setErrors] = useState({})
  const temporary = registration.type === 'TEMPORARY_RESIDENCE_REGISTRATION'

  async function submit() {
    const found = {}
    if (evidence.length === 0) found.evidence = 'Chọn ảnh bằng chứng.'
    if (temporary && !expiryDate) found.expiryDate = 'Nhập ngày hết hạn.'
    setErrors(found)
    if (Object.keys(found).length > 0) return
    try {
      const evidenceFileId = await uploadFile(evidence[0])
      run(COMMANDS.ACCEPTED, { evidenceFileId, ...(temporary && { expiryDate }) }, 'Đã ghi đã tiếp nhận.')
    } catch (error) {
      setErrors({ evidence: problemOf(error).detail || 'Không tải được ảnh bằng chứng.' })
    }
  }

  return (
    <FormShell
      title="Ghi đã tiếp nhận"
      submitLabel="Ghi đã tiếp nhận"
      busy={busy}
      failure={failure}
      onSubmit={submit}
      onCancel={onCancel}
    >
      <EvidenceField
        id="registration-accepted-evidence"
        label="Ảnh bằng chứng đã tiếp nhận"
        accept="image/jpeg,image/png"
        files={evidence}
        onChange={setEvidence}
        error={errors.evidence}
      />
      {temporary && (
        <TextField
          id="registration-expiry"
          type="date"
          label="Ngày hết hạn"
          value={expiryDate}
          onChange={setExpiryDate}
          error={errors.expiryDate}
        />
      )}
    </FormShell>
  )
}

function DeregisteredForm({ registration, onDone, onCancel }) {
  const { busy, failure, run } = useCommand(registration, onDone)
  const [evidence, setEvidence] = useState([])
  const [error, setError] = useState('')

  async function submit() {
    if (evidence.length === 0) {
      setError('Chọn bằng chứng đã khai báo xóa.')
      return
    }
    setError('')
    try {
      const evidenceFileId = await uploadFile(evidence[0])
      run(COMMANDS.DEREGISTERED, { evidenceFileId }, 'Đã ghi đã khai báo xóa.')
    } catch (uploadError) {
      setError(problemOf(uploadError).detail || 'Không tải được tệp bằng chứng.')
    }
  }

  return (
    <FormShell
      title="Ghi đã khai báo xóa"
      submitLabel="Ghi đã khai báo xóa"
      busy={busy}
      failure={failure}
      onSubmit={submit}
      onCancel={onCancel}
    >
      <p className="type-body-sm text-muted-foreground">
        Một lần ghi áp cho mọi khai báo Đã xác nhận, Hết hạn của người này.
      </p>
      <EvidenceField
        id="registration-deregister-evidence"
        label="Bằng chứng đã khai báo xóa"
        files={evidence}
        onChange={setEvidence}
        error={error}
      />
    </FormShell>
  )
}

const FORMS = {
  'confirm-local': ConfirmLocalForm,
  accepted: AcceptedForm,
  deregistered: DeregisteredForm,
}

// form: confirm-local | accepted | deregistered; onDone(thông báo) khi lệnh thành công
export function RegistrationForm({ form, registration, onDone, onCancel }) {
  const Form = FORMS[form]
  return <Form registration={registration} onDone={onDone} onCancel={onCancel} />
}
