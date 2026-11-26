import { useEffect, useState } from 'react'
import {
  getAdmissionApplicationsById,
  postAdmissionApplications,
  postAdmissionApplicationsByIdAdmissionOpinion,
  postAdmissionApplicationsByIdUpdate,
} from '@/api'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { ChoiceTray } from '@/common/ChoiceTray'
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
export function ApplicationSheet(props) {
  return (
    <Sheet open onOpenChange={(next) => !next && props.onClose()}>
      <SheetContent className="overflow-y-auto p-6 sm:max-w-lg">
        <ApplicationForm {...props} />
      </SheetContent>
    </Sheet>
  )
}

export function ApplicationForm({
  application,
  residentId: presetResidentId = null,
  residentName = null,
  notice = null,
  onClose,
  onDone,
}) {
  const editing = !!application
  const [etag, setEtag] = useState(null)
  const [residentId, setResidentId] = useState(
    application ? String(application.residentId) : presetResidentId != null ? String(presetResidentId) : '',
  )
  const [applicationDate, setApplicationDate] = useState(application?.applicationDate ?? '')
  const [type, setType] = useState(application?.desiredResidenceType ?? '')
  const [level, setLevel] = useState(application?.expectedCareLevel ?? '')
  const [desiredDate, setDesiredDate] = useState(application?.desiredAdmissionDate ?? '')
  const [contact, setContact] = useState(application?.contactPerson ?? '')
  const [needs, setNeeds] = useState(application?.needs ?? '')
  const [note, setNote] = useState(application?.note ?? '')
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)

  useEffect(() => {
    if (!editing) return
    getAdmissionApplicationsById({ path: { id: application.id } })
      .then(({ etag: tag }) => setEtag(tag))
      .catch((e) => setFailure(problemOf(e)))
  }, [editing, application?.id])

  // Ngày theo giờ Việt Nam (so chuỗi yyyy-mm-dd)
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' })
  const errors = {
    resident: !residentId && 'Chọn người cao tuổi',
    date: (!applicationDate && 'Nhập ngày đăng ký') || (applicationDate > today && 'Ngày đăng ký không ở tương lai'),
    desired:
      desiredDate && applicationDate && desiredDate < applicationDate && 'Ngày vào dự kiến không trước ngày đăng ký',
    contact: contact.trim().length > 200 && 'Người liên hệ tối đa 200 ký tự',
    note: note.trim().length > 2000 && 'Ghi chú tối đa 2000 ký tự',
    type: !type && 'Chọn loại lưu trú',
    level: !level && 'Chọn mức chăm sóc',
    reason: editing && !reason.trim() && 'Nhập lý do',
  }

  async function save() {
    setSubmitted(true)
    if (Object.values(errors).some(Boolean)) return
    setBusy(true)
    setFailure(null)
    const body = {
      residentId: Number(residentId),
      applicationDate,
      desiredResidenceType: type,
      expectedCareLevel: level,
      ...(desiredDate && { desiredAdmissionDate: desiredDate }),
      ...(contact.trim() && { contactPerson: contact.trim() }),
      ...(needs.trim() && { needs: needs.trim() }),
      ...(note.trim() && { note: note.trim() }),
    }
    try {
      if (editing) {
        await postAdmissionApplicationsByIdUpdate({
          path: { id: application.id },
          headers: { ...newKey(), 'If-Match': etag },
          body: { ...body, reason: reason.trim() },
        })
        onDone('Đã cập nhật đăng ký')
      } else {
        const { data } = await postAdmissionApplications({ headers: newKey(), body })
        onDone('Đã lập đăng ký tiếp nhận', data)
      }
    } catch (e) {
      setFailure(problemOf(e))
    } finally {
      setBusy(false)
    }
  }

  const shown = (key) => (submitted ? errors[key] : null)

  return (
    <>
      <SheetTitle>{editing ? 'Cập nhật đăng ký tiếp nhận' : 'Lập đăng ký tiếp nhận'}</SheetTitle>
      <SheetDescription>
        Người cao tuổi phải đang ở trạng thái Đang tiếp nhận; mỗi người một lượt đang mở.
      </SheetDescription>
      {notice && <div className="mt-4">{notice}</div>}
      <FieldGroup className="mt-4">
        {editing ? (
          <Info label="Người cao tuổi">{`Mã ${application.residentId}`}</Info>
        ) : presetResidentId != null ? (
          <Info label="Người cao tuổi">{residentName ?? `Mã ${presetResidentId}`}</Info>
        ) : (
          <ResidentSelect
            id="application-resident"
            statuses={['ADMISSION_IN_PROGRESS']}
            value={residentId}
            onChange={setResidentId}
            error={shown('resident')}
            onFailure={(e) => setFailure(problemOf(e))}
          />
        )}
        <Field data-invalid={!!shown('date') || undefined}>
          <FieldLabel htmlFor="application-date">Ngày đăng ký</FieldLabel>
          <Input
            id="application-date"
            type="date"
            max={today}
            className="h-11"
            value={applicationDate}
            aria-invalid={!!shown('date') || undefined}
            onChange={(e) => setApplicationDate(e.target.value)}
          />
          {shown('date') && <FieldError>{shown('date')}</FieldError>}
        </Field>
        <Choices
          label="Loại lưu trú mong muốn"
          options={RESIDENCE_TYPES}
          value={type}
          onChange={setType}
          error={shown('type')}
        />
        <Choices
          label="Mức chăm sóc dự kiến"
          options={CARE_LEVELS}
          value={level}
          onChange={setLevel}
          error={shown('level')}
        />
        <Field data-invalid={!!shown('desired') || undefined}>
          <FieldLabel htmlFor="application-desired">Ngày vào dự kiến</FieldLabel>
          <Input
            id="application-desired"
            type="date"
            min={applicationDate || undefined}
            className="h-11"
            value={desiredDate}
            aria-invalid={!!shown('desired') || undefined}
            onChange={(e) => setDesiredDate(e.target.value)}
          />
          {shown('desired') && <FieldError>{shown('desired')}</FieldError>}
        </Field>
        <Field data-invalid={!!shown('contact') || undefined}>
          <FieldLabel htmlFor="application-contact">Người liên hệ</FieldLabel>
          <Input
            id="application-contact"
            className="h-11"
            maxLength={200}
            value={contact}
            aria-invalid={!!shown('contact') || undefined}
            onChange={(e) => setContact(e.target.value)}
          />
          {shown('contact') && <FieldError>{shown('contact')}</FieldError>}
        </Field>
        <ChoiceTray
          id="application-needs"
          label="Nhu cầu"
          options={APPLICATION_NEEDS}
          multiple
          value={needs}
          onChange={setNeeds}
        />
        <Field data-invalid={!!shown('note') || undefined}>
          <FieldLabel htmlFor="application-note">Ghi chú</FieldLabel>
          <Textarea
            id="application-note"
            rows={2}
            maxLength={2000}
            value={note}
            aria-invalid={!!shown('note') || undefined}
            onChange={(e) => setNote(e.target.value)}
          />
          {shown('note') && <FieldError>{shown('note')}</FieldError>}
        </Field>
        {editing && <ReasonField id="application-reason" value={reason} onChange={setReason} error={shown('reason')} />}
      </FieldGroup>
      <div className="mt-4">
        <ProblemAlert problem={failure} />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" className="h-11" onClick={onClose}>
          Đóng
        </Button>
        <Button className="h-11" disabled={busy || (editing && !etag)} onClick={save}>
          Lưu đăng ký
        </Button>
      </div>
    </>
  )
}
