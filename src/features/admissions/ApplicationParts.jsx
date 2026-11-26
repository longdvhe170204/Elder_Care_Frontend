import { useEffect, useRef, useState } from 'react'
import {
  getAdmissionApplicationsById,
  postAdmissionApplications,
  postAdmissionApplicationsByIdAdmissionOpinion,
  postAdmissionApplicationsByIdUpdate,
} from '@/api'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { ChoiceTray } from '@/common/ChoiceTray'
import { DiscardChangesDialog } from '@/common/DiscardChangesDialog'
import { displayDate, isoDate, maskDate, todayIso } from '@/common/dateText'
import { ProblemAlert } from '@/common/ProblemAlert'
import { APPLICATION_NEEDS } from '@/common/quickChoices'
import { formatDateTime } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { CARE_LEVELS, OPINIONS, OPINION_SOURCES, RESIDENCE_TYPES, labelOf, newKey } from './admissionLabels'
import { Choices, Info, ReasonField, ResidentSelect } from './FormParts'

// Khung chi tiết và form của lượt đăng ký tiếp nhận (004 T019; FR-001, FR-003, FR-004, FR-004a, FR-005). Danh sách điều
// kiện tiếp nhận (a) → (f) tách khỏi ý kiến của người cao tuổi về việc vào ở: ý kiến không là điều kiện (Q-356).

export function OpinionBlock({ opinions }) {
  if (!opinions.length) return <p className="type-body-sm text-muted-foreground">Chưa ghi ý kiến về việc vào ở.</p>
  return (
    <ul className="flex flex-col gap-2">
      {opinions.map((o) => (
        <li key={o.id} className="type-body-sm">
          <span className={o.status === 'SUPERSEDED' ? 'text-muted-foreground' : undefined}>
            {labelOf(OPINIONS, o.opinion)}, nguồn {labelOf(OPINION_SOURCES, o.source?.type).toLowerCase()}
          </span>
          <span className="block type-caption text-muted-foreground">
            {o.status === 'SUPERSEDED' ? 'Đã được thay thế. ' : 'Hiện hành. '}
            {o.recordedBy ? `Ghi bởi ${o.recordedBy}, ` : ''}
            {o.at ? formatDateTime(o.at) : ''}
            {o.note ? `. ${o.note}` : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function OpinionForm({ applicationId, onDone, onCancel }) {
  const [source, setSource] = useState('')
  const [opinion, setOpinion] = useState('')
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)

  async function save() {
    setSubmitted(true)
    if (!source || !opinion) return
    setBusy(true)
    try {
      await postAdmissionApplicationsByIdAdmissionOpinion({
        path: { id: applicationId },
        headers: newKey(),
        body: { opinion, source: { type: source }, ...(note.trim() && { note: note.trim() }) },
      })
      onDone('Đã ghi ý kiến về việc vào ở')
    } catch (e) {
      setFailure(problemOf(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <FieldGroup>
        <Choices
          label="Nguồn ý kiến"
          options={OPINION_SOURCES.filter(([code]) => code !== 'FAMILY_MEMBER')}
          value={source}
          onChange={setSource}
          error={submitted && !source ? 'Chọn nguồn ý kiến' : null}
        />
        <Choices
          label="Ý kiến"
          options={OPINIONS}
          value={opinion}
          onChange={setOpinion}
          error={submitted && !opinion ? 'Chọn ý kiến' : null}
        />
        <ReasonField id="opinion-note" label="Ghi chú" value={note} onChange={setNote} />
      </FieldGroup>
      <ProblemAlert problem={failure} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" className="h-11" onClick={onCancel}>
          Hủy
        </Button>
        <Button className="h-11" disabled={busy} onClick={save}>
          Lưu ý kiến
        </Button>
      </div>
    </div>
  )
}

// Lập mới (chưa có application) hoặc cập nhật (có application: tải lại để lấy ETag cho If-Match, lý do bắt buộc).
// residentId, residentName: người cao tuổi đã biết (vừa tạo hồ sơ ở luồng Tiếp nhận mới), chỉ hiện họ tên, không có ô chọn.
// notice: nội dung hiện đầu form (kết quả tạo hồ sơ). onDone(message, application) nhận lượt đăng ký backend trả khi lập mới.
// Bố cục (chủ dự án duyệt 2026-11-26, cùng kiểu form Tạo hồ sơ): đầu, chân khung cố định, chỉ phần form cuộn; ba nhóm
// đánh số; dấu * cho ô bắt buộc; ngày nhập DD/MM/YYYY; onDirtyChange báo khung cha để hỏi lại khi đóng mà chưa lưu.
export function ApplicationSheet(props) {
  const [dirty, setDirty] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const requestClose = () => (dirty ? setConfirmClose(true) : props.onClose())
  return (
    <Sheet open onOpenChange={(next) => !next && requestClose()}>
      <SheetContent className="gap-0 p-0 sm:max-w-xl">
        <ApplicationForm {...props} onClose={requestClose} onDirtyChange={setDirty} />
      </SheetContent>
      <DiscardChangesDialog
        open={confirmClose}
        onKeep={() => setConfirmClose(false)}
        onDiscard={() => {
          setConfirmClose(false)
          props.onClose()
        }}
      />
    </Sheet>
  )
}

const FORM_ID = 'application-form'

function Required() {
  return (
    <span aria-hidden="true" className="text-destructive">
      *
    </span>
  )
}

export function ApplicationForm({
  application,
  residentId: presetResidentId = null,
  residentName = null,
  notice = null,
  onClose,
  onDone,
  onDirtyChange,
}) {
  const editing = !!application
  const [etag, setEtag] = useState(null)
  const [initial] = useState(() => ({
    residentId: application ? String(application.residentId) : presetResidentId != null ? String(presetResidentId) : '',
    applicationDate: displayDate(application?.applicationDate),
    type: application?.desiredResidenceType ?? '',
    level: application?.expectedCareLevel ?? '',
    desiredDate: displayDate(application?.desiredAdmissionDate),
    contact: application?.contactPerson ?? '',
    needs: application?.needs ?? '',
    note: application?.note ?? '',
    reason: '',
  }))
  const [form, setForm] = useState(initial)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const formRef = useRef(null)

  const dirty = Object.keys(initial).some((k) => form[k] !== initial[k])
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange])

  useEffect(() => {
    if (!editing) return
    getAdmissionApplicationsById({ path: { id: application.id } })
      .then(({ etag: tag }) => setEtag(tag))
      .catch((e) => setFailure(problemOf(e)))
  }, [editing, application?.id])

  const setValue = (name) => (value) => setForm((current) => ({ ...current, [name]: value }))
  const setText = (name) => (event) => setValue(name)(event.target.value)
  const setDate = (name) => (event) =>
    setForm((current) => ({ ...current, [name]: maskDate(event.target.value, current[name]) }))

  const applicationIso = isoDate(form.applicationDate)
  const desiredIso = isoDate(form.desiredDate)
  const errors = {
    resident: !form.residentId && 'Chọn người cao tuổi',
    date:
      (!form.applicationDate.trim() && 'Nhập ngày đăng ký') ||
      (!applicationIso && 'Nhập ngày có thật, dạng DD/MM/YYYY') ||
      (applicationIso > todayIso() && 'Ngày đăng ký không ở tương lai'),
    type: !form.type && 'Chọn loại lưu trú',
    level: !form.level && 'Chọn mức chăm sóc',
    desired:
      (form.desiredDate.trim() && !desiredIso && 'Nhập ngày có thật, dạng DD/MM/YYYY') ||
      (desiredIso && applicationIso && desiredIso < applicationIso && 'Ngày vào dự kiến không trước ngày đăng ký'),
    contact: form.contact.trim().length > 200 && 'Người liên hệ tối đa 200 ký tự',
    note: form.note.trim().length > 2000 && 'Ghi chú tối đa 2000 ký tự',
    reason: editing && !form.reason.trim() && 'Nhập lý do cập nhật',
  }
  const shown = (key) => (submitted ? errors[key] || null : null)

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setSubmitted(true)
    if (Object.values(errors).some(Boolean)) {
      // Đưa con trỏ tới ô lỗi đầu tiên theo thứ tự trên form
      requestAnimationFrame(() =>
        formRef.current?.querySelector('[aria-invalid="true"], [data-invalid="true"] button')?.focus(),
      )
      return
    }
    setBusy(true)
    setFailure(null)
    const body = {
      residentId: Number(form.residentId),
      applicationDate: applicationIso,
      desiredResidenceType: form.type,
      expectedCareLevel: form.level,
      ...(desiredIso && { desiredAdmissionDate: desiredIso }),
      ...(form.contact.trim() && { contactPerson: form.contact.trim() }),
      ...(form.needs.trim() && { needs: form.needs.trim() }),
      ...(form.note.trim() && { note: form.note.trim() }),
    }
    try {
      if (editing) {
        await postAdmissionApplicationsByIdUpdate({
          path: { id: application.id },
          headers: { ...newKey(), 'If-Match': etag },
          body: { ...body, reason: form.reason.trim() },
        })
        onDirtyChange?.(false)
        onDone('Đã cập nhật đăng ký')
      } else {
        const { data } = await postAdmissionApplications({ headers: newKey(), body })
        onDirtyChange?.(false)
        onDone('Đã lập đăng ký tiếp nhận', data)
      }
    } catch (e) {
      setFailure(problemOf(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-1 border-b px-6 pt-6 pb-4 pr-12">
        <SheetTitle className="type-title">
          {editing ? 'Cập nhật đăng ký tiếp nhận' : 'Lập đăng ký tiếp nhận'}
        </SheetTitle>
        <SheetDescription>
          Người cao tuổi phải đang ở trạng thái Đang tiếp nhận; mỗi người một lượt đang mở.
        </SheetDescription>
      </div>

      <form
        id={FORM_ID}
        ref={formRef}
        onSubmit={submit}
        noValidate
        aria-busy={busy || undefined}
        className="flex min-h-0 flex-1 flex-col divide-y overflow-y-auto px-6"
      >
        {notice && <div className="py-4">{notice}</div>}

        <div className="py-6">
          <FieldSet disabled={busy}>
            <FieldLegend className="type-label mb-4">01 · Người cao tuổi</FieldLegend>
            {editing ? (
              <Info label="Người cao tuổi">{`Mã ${application.residentId}`}</Info>
            ) : presetResidentId != null ? (
              <Info label="Người cao tuổi">{residentName ?? `Mã ${presetResidentId}`}</Info>
            ) : (
              <ResidentSelect
                id="application-resident"
                statuses={['ADMISSION_IN_PROGRESS']}
                value={form.residentId}
                onChange={setValue('residentId')}
                error={shown('resident')}
                onFailure={(e) => setFailure(problemOf(e))}
              />
            )}
            <Field data-invalid={!!shown('date') || undefined}>
              <FieldLabel htmlFor="application-date">
                Ngày đăng ký <Required />
              </FieldLabel>
              <Input
                id="application-date"
                inputMode="numeric"
                placeholder="DD/MM/YYYY"
                maxLength={10}
                autoComplete="off"
                required
                className="h-11 tabular-nums sm:max-w-xs"
                value={form.applicationDate}
                onChange={setDate('applicationDate')}
                aria-invalid={!!shown('date') || undefined}
                aria-describedby={shown('date') ? 'application-date-error' : undefined}
              />
              {shown('date') && <FieldError id="application-date-error">{shown('date')}</FieldError>}
            </Field>
          </FieldSet>
        </div>

        <div className="py-6">
          <FieldSet disabled={busy}>
            <FieldLegend className="type-label mb-4">02 · Nhu cầu lưu trú</FieldLegend>
            <Choices
              label="Loại lưu trú mong muốn"
              options={RESIDENCE_TYPES}
              value={form.type}
              onChange={setValue('type')}
              error={shown('type')}
              required
            />
            <Choices
              label="Mức chăm sóc dự kiến"
              options={CARE_LEVELS}
              value={form.level}
              onChange={setValue('level')}
              error={shown('level')}
              required
            />
            <Field data-invalid={!!shown('desired') || undefined}>
              <FieldLabel htmlFor="application-desired">Ngày vào dự kiến</FieldLabel>
              <Input
                id="application-desired"
                inputMode="numeric"
                placeholder="DD/MM/YYYY"
                maxLength={10}
                autoComplete="off"
                className="h-11 tabular-nums sm:max-w-xs"
                value={form.desiredDate}
                onChange={setDate('desiredDate')}
                aria-invalid={!!shown('desired') || undefined}
                aria-describedby={shown('desired') ? 'application-desired-error' : undefined}
              />
              {shown('desired') && <FieldError id="application-desired-error">{shown('desired')}</FieldError>}
            </Field>
            <ChoiceTray
              id="application-needs"
              label="Nhu cầu"
              options={APPLICATION_NEEDS}
              multiple
              value={form.needs}
              onChange={setValue('needs')}
            />
          </FieldSet>
        </div>

        <div className="py-6">
          <FieldSet disabled={busy}>
            <FieldLegend className="type-label mb-4">03 · Liên hệ và ghi chú</FieldLegend>
            <Field data-invalid={!!shown('contact') || undefined}>
              <FieldLabel htmlFor="application-contact">Người liên hệ</FieldLabel>
              <Input
                id="application-contact"
                className="h-11"
                maxLength={200}
                placeholder="Họ tên, quan hệ, số điện thoại"
                value={form.contact}
                onChange={setText('contact')}
                aria-invalid={!!shown('contact') || undefined}
              />
              {shown('contact') && <FieldError>{shown('contact')}</FieldError>}
            </Field>
            <Field data-invalid={!!shown('note') || undefined}>
              <FieldLabel htmlFor="application-note">Ghi chú</FieldLabel>
              <Textarea
                id="application-note"
                rows={2}
                maxLength={2000}
                placeholder="Thông tin bổ sung (nếu có)"
                value={form.note}
                onChange={setText('note')}
                aria-invalid={!!shown('note') || undefined}
              />
              {shown('note') && <FieldError>{shown('note')}</FieldError>}
            </Field>
            {editing && (
              <ReasonField
                id="application-reason"
                label="Lý do cập nhật"
                value={form.reason}
                onChange={setValue('reason')}
                error={shown('reason')}
              />
            )}
          </FieldSet>
        </div>

        {failure && (
          <div className="py-6">
            <ProblemAlert problem={failure} />
          </div>
        )}
      </form>

      <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t px-6 py-4">
        <Button type="button" variant="outline" className="h-11" onClick={onClose}>
          Hủy
        </Button>
        <Button type="submit" form={FORM_ID} className="h-11" disabled={busy || (editing && !etag)}>
          {busy ? 'Đang lưu…' : 'Lưu đăng ký'}
        </Button>
      </div>
    </div>
  )
}
