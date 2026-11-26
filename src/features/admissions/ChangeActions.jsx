import { useEffect, useState } from 'react'
import {
  getResidencyChangeRequestsByIdResidentOpinions,
  getResidentsByResidentIdRelationships,
  postApprovalRequestsByIdCancel,
  postApprovalRequestsByIdReturnToDraft,
  postApprovalRequestsByIdSubmit,
  postResidencyChangeRequestsByIdAddendumSignature,
  postResidencyChangeRequestsByIdResidentOpinions,
} from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { FileInput } from '@/common/FileInput'
import { ProblemAlert } from '@/common/ProblemAlert'
import { formatDate } from '@/common/dateTime'
import { uploadFile } from '@/common/files'
import { problemOf } from '@/common/problem'
import { useHandoverStaff } from '@/common/useHandoverStaff'
import { SELECT, labelOf, newKey } from './admissionLabels'
import {
  EVIDENCE_ACCEPT,
  EVIDENCE_TYPES,
  OPINIONS,
  OPINION_SOURCES,
  WARNING_LABELS,
  addendumNoText,
  isoDate,
} from './changeRequestRules'
import { ReasonField } from './FormParts'

// Lệnh trên yêu cầu thay đổi lưu trú theo BF-08 sửa đổi (004 FR-043d → FR-043h; Q-417 → Q-421): ghi nhận phụ lục đã
// ký, ý kiến người cao tuổi, trả về nháp, hủy, gửi duyệt kèm cảnh báo và lý do. Kiểm thật ở backend; lỗi 409 hiện mô tả
// của backend (ProblemAlert).

// Người đại diện hiện tại của người cao tuổi (api-012 quan hệ, representative và ACTIVE)
function useRepresentatives(residentId) {
  const [list, setList] = useState(null)
  useEffect(() => {
    let live = true
    if (!residentId) return
    getResidentsByResidentIdRelationships({ path: { residentId } })
      .then(({ data }) => {
        if (live)
          setList(
            (data ?? [])
              .filter((r) => r.representative && r.status !== 'ENDED')
              .map((r) => ({
                id: r.familyMember?.id,
                name: r.familyMember?.fullName ?? `Người thân mã ${r.familyMember?.id}`,
              })),
          )
      })
      .catch(() => live && setList([]))
    return () => {
      live = false
    }
  }, [residentId])
  return list
}

export function RepresentativeSelect({ id, residentId, value, onChange, error, label = 'Người đại diện' }) {
  const list = useRepresentatives(residentId)
  return (
    <Field data-invalid={!!error || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <select
        id={id}
        className={SELECT}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">
          {list === null ? 'Đang tải…' : list.length ? 'Chọn người đại diện' : 'Chưa có người đại diện'}
        </option>
        {(list ?? []).map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}

// Ghi nhận phụ lục đã ký (FR-043d, W2, W2a): ngày ký (không sau hôm nay), người đại diện ký, người ký phía viện (tùy chọn),
// bản scan, ghi chú. Ký muộn hơn ngày hiệu lực thì backend dời ngày; báo ngày mới sau khi lưu.
export function SignatureSheet({ request, etag, onClose, onDone }) {
  const [signedDate, setSignedDate] = useState(isoDate())
  const [signer, setSigner] = useState(null)
  const [staffId, setStaffId] = useState('')
  // "Tôi" và nhân viên đang làm việc người ghi xem được (góp ý test BF-12 2026-11-25: Hành chính không xem được hồ sơ
  // nhân viên nào nên trước đây danh sách rỗng)
  const staff = useHandoverStaff()
  const [file, setFile] = useState(null)
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)

  const errors = {
    signedDate: !signedDate ? 'Nhập ngày ký' : signedDate > isoDate() ? 'Ngày ký không được sau hôm nay' : null,
    signer: !signer && 'Chọn người đại diện đã ký',
    file: !file
      ? 'Đính kèm bản scan phụ lục đã ký'
      : !EVIDENCE_TYPES.includes(file.type) && 'Tệp phải là PDF, JPG hoặc PNG',
  }
  const shown = (k) => (submitted ? errors[k] || null : null)

  async function save() {
    setSubmitted(true)
    if (Object.values(errors).some(Boolean)) return
    setBusy(true)
    setFailure(null)
    try {
      const fileId = await uploadFile(file)
      const { data } = await postResidencyChangeRequestsByIdAddendumSignature({
        path: { id: request.approvalRequestId },
        headers: { ...newKey(), 'If-Match': etag },
        body: {
          signedDate,
          signedByFamilyMemberId: signer,
          ...(staffId ? { facilitySignatoryStaffId: Number(staffId) } : {}),
          fileId,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      })
      const before = request.addendum?.effectiveDate
      const after = data?.addendum?.effectiveDate
      onDone(
        after && before && after !== before
          ? `Đã ghi nhận phụ lục đã ký; ngày hiệu lực dời sang ${formatDate(after)}`
          : 'Đã ghi nhận phụ lục đã ký',
        request.approvalRequestId,
      )
    } catch (e) {
      setFailure(problemOf(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto p-6 sm:max-w-lg">
        <SheetTitle>{`Ghi nhận ${addendumNoText(request.addendum?.addendumNo).toLowerCase()} đã ký`}</SheetTitle>
        <SheetDescription>
          Ngày hiệu lực thực tế là ngày muộn nhất trong ngày mong muốn, ngày duyệt và ngày ký; không tính lùi.
        </SheetDescription>
        <FieldGroup className="mt-4">
          <Field data-invalid={!!shown('signedDate') || undefined}>
            <FieldLabel htmlFor="sign-date">Ngày ký</FieldLabel>
            <Input
              id="sign-date"
              type="date"
              className="h-11"
              max={isoDate()}
              value={signedDate}
              onChange={(e) => setSignedDate(e.target.value)}
            />
            {shown('signedDate') && <FieldError>{shown('signedDate')}</FieldError>}
          </Field>
          <RepresentativeSelect
            id="sign-representative"
            residentId={request.residentId}
            value={signer}
            onChange={setSigner}
            error={shown('signer')}
            label="Người đại diện ký"
          />
          <Field>
            <FieldLabel htmlFor="sign-staff">Người ký phía viện</FieldLabel>
            <select id="sign-staff" className={SELECT} value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">{staff?.length === 0 ? 'Không có nhân viên để chọn' : 'Không ghi'}</option>
              {(staff ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label ?? `Nhân viên mã ${s.id}`}
                </option>
              ))}
            </select>
            <FieldDescription>
              Không bắt buộc. Chỉ hiện nhân viên bạn được xem hồ sơ; cần ghi người khác thì nhờ Quản lý viện ghi nhận.
            </FieldDescription>
          </Field>
          <Field data-invalid={!!shown('file') || undefined}>
            <FieldLabel htmlFor="sign-file">Bản scan phụ lục đã ký</FieldLabel>
            <FileInput
              id="sign-file"
              accept={EVIDENCE_ACCEPT}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <FieldDescription>PDF, JPG hoặc PNG, tối đa 10 MB.</FieldDescription>
            {shown('file') && <FieldError>{shown('file')}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor="sign-note">Ghi chú</FieldLabel>
            <Textarea id="sign-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </FieldGroup>
        <div className="mt-4">
          <ProblemAlert problem={failure} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" className="h-11" onClick={onClose}>
            Đóng
          </Button>
          <Button className="h-11" disabled={busy || !etag} onClick={save}>
            Lưu ghi nhận
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// Ý kiến người cao tuổi (FR-043h, W4, W4a): lịch sử, ghi thêm; ý kiến ghi trước khi nội dung đổi thì gắn nhãn
// Nhãn nguồn ý kiến ở danh sách đã ghi (ý kiến không sửa, xóa: DESIGN.md 2.2); nhãn ở form chọn nguồn là OPINION_SOURCES
const OPINION_SOURCE_BADGES = { RESIDENT: 'Theo lời người cao tuổi', STAFF_OBSERVATION: 'Nhân viên quan sát' }

export function ResidentOpinions({ request, canRecord, onChanged }) {
  const [items, setItems] = useState(null)
  const [opinion, setOpinion] = useState('')
  const [source, setSource] = useState('RESIDENT')
  const [note, setNote] = useState('')
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const open = request.status === 'DRAFT' || request.status === 'PENDING_APPROVAL'

  useEffect(() => {
    let live = true
    getResidencyChangeRequestsByIdResidentOpinions({ path: { id: request.approvalRequestId } })
      .then(({ data }) => live && setItems(data ?? []))
      .catch(() => live && setItems([]))
    return () => {
      live = false
    }
  }, [request.approvalRequestId])

  async function save() {
    if (!opinion) return
    setBusy(true)
    setFailure(null)
    try {
      const { data } = await postResidencyChangeRequestsByIdResidentOpinions({
        path: { id: request.approvalRequestId },
        headers: newKey(),
        body: { opinion, source, ...(note.trim() ? { note: note.trim() } : {}) },
      })
      setItems(data ?? [])
      setAdding(false)
      setOpinion('')
      setNote('')
      onChanged?.()
    } catch (e) {
      setFailure(problemOf(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-2xs" aria-label="Ý kiến người cao tuổi">
      <div className="flex items-center justify-between">
        <h3 className="type-card-title font-bold text-foreground">Ý kiến người cao tuổi</h3>
        <span className="rounded-md bg-muted/60 px-2 py-0.5 text-xs font-semibold text-muted-foreground">
          {items?.length ? `${items.length} ghi nhận` : 'Chưa ghi'}
        </span>
      </div>
      {items === null ? null : items.length === 0 ? (
        <p className="type-body-sm text-muted-foreground">Chưa ghi ý kiến của người cao tuổi.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((o, i) => (
            <li key={o.id} className="flex flex-col gap-0.5 rounded-lg border border-border/60 bg-muted/30 p-2.5">
              <span className="flex flex-wrap items-center gap-2">
                <span className="type-body-sm font-semibold text-foreground">{`${labelOf(OPINIONS, o.opinion)}${i === 0 ? ', hiện hành' : ''}`}</span>
                <Badge variant="secondary" className="text-xs font-medium">{OPINION_SOURCE_BADGES[o.source] ?? o.source}</Badge>
              </span>
              <span className="type-caption text-muted-foreground">
                {`Ghi ${o.recordedBy ? `bởi ${o.recordedBy}, ` : ''}${formatDate(o.recordedAt)}${o.note ? `. ${o.note}` : ''}`}
              </span>
              {o.outdated && i === 0 && (
                <span className="type-caption font-semibold text-warning-foreground">Ghi trước khi nội dung thay đổi; nên ghi lại.</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {open && canRecord && !adding && (
        <Button variant="outline" className="h-10 self-start font-semibold border-border/80 shadow-2xs hover:bg-accent" onClick={() => setAdding(true)}>
          Ghi ý kiến người cao tuổi
        </Button>
      )}
      {adding && (
        <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-muted/40 p-3.5 shadow-2xs">
          <Field>
            <FieldLabel htmlFor="opinion-select">Ý kiến</FieldLabel>
            <div className="relative">
              <select
                id="opinion-select"
                aria-label="Ý kiến"
                className={SELECT}
                value={opinion}
                onChange={(e) => setOpinion(e.target.value)}
              >
                <option value="">-- Chọn ý kiến của người cao tuổi --</option>
                {OPINIONS.map(([code, text]) => (
                  <option key={code} value={code}>
                    {text}
                  </option>
                ))}
              </select>
            </div>
            <div className="sr-only">
              {OPINIONS.map(([code, text]) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={opinion === code}
                  onClick={() => setOpinion(code)}
                >
                  {text}
                </button>
              ))}
            </div>
          </Field>

          <Field>
            <FieldLabel htmlFor="source-select">Nguồn</FieldLabel>
            <div className="relative">
              <select
                id="source-select"
                aria-label="Nguồn"
                className={SELECT}
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                {OPINION_SOURCES.map(([code, text]) => (
                  <option key={code} value={code}>
                    {text}
                  </option>
                ))}
              </select>
            </div>
            <div className="sr-only">
              {OPINION_SOURCES.map(([code, text]) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={source === code}
                  onClick={() => setSource(code)}
                >
                  {text}
                </button>
              ))}
            </div>
          </Field>

          <Field>
            <FieldLabel htmlFor="opinion-note">Ghi chú (nếu có)</FieldLabel>
            <Input
              id="opinion-note"
              type="text"
              placeholder="Nhập ghi chú ngắn..."
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-10 bg-card border-border/80"
            />
          </Field>
          <ProblemAlert problem={failure} />
          <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/60">
            <Button variant="ghost" size="sm" className="h-9 px-3 text-xs" onClick={() => setAdding(false)}>
              Thôi
            </Button>
            <Button size="sm" className="h-9 px-4 text-xs font-bold shadow-xs" disabled={busy || !opinion} onClick={save}>
              Lưu ý kiến
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}

// Lệnh cần lý do trên yêu cầu phê duyệt (Trả về nháp, Hủy, Gửi duyệt khi người cao tuổi không đồng ý): một khung chung
const REASON_COMMANDS = {
  'return-to-draft': {
    title: 'Trả về nháp',
    description: 'Yêu cầu về Nháp để người lập sửa; xác nhận người đại diện trước đó bị bỏ, phải xác nhận lại.',
    action: 'Trả về nháp',
    call: postApprovalRequestsByIdReturnToDraft,
    done: 'Đã trả yêu cầu về Nháp',
  },
  cancel: {
    title: 'Hủy yêu cầu',
    description: 'Hủy khi gia đình hoặc viện không còn muốn thay đổi. Phụ lục chưa áp dụng (nếu có) chuyển Đã hủy.',
    action: 'Hủy yêu cầu',
    call: postApprovalRequestsByIdCancel,
    done: 'Đã hủy yêu cầu',
  },
}

export function ReasonCommandSheet({ command, request, etag, onClose, onDone }) {
  const spec = REASON_COMMANDS[command]
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const error = submitted && !reason.trim() ? 'Nhập lý do' : null

  async function save() {
    setSubmitted(true)
    if (!reason.trim()) return
    setBusy(true)
    setFailure(null)
    try {
      await spec.call({
        path: { id: request.approvalRequestId },
        headers: { 'If-Match': etag },
        body: { reason: reason.trim() },
      })
      onDone(spec.done, request.approvalRequestId)
    } catch (e) {
      setFailure(problemOf(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto p-6 sm:max-w-lg">
        <SheetTitle>{spec.title}</SheetTitle>
        <SheetDescription>{spec.description}</SheetDescription>
        <FieldGroup className="mt-4">
          <ReasonField id={`reason-${command}`} value={reason} onChange={setReason} error={error} />
        </FieldGroup>
        <div className="mt-4">
          <ProblemAlert problem={failure} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" className="h-11" onClick={onClose}>
            Đóng
          </Button>
          <Button className="h-11" disabled={busy || !etag} onClick={save}>
            {spec.action}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// Gửi duyệt (FR-043h, W4, W11): cảnh báo không chặn (thiếu ý kiến, ý kiến cũ) hỏi xác nhận; người cao tuổi không đồng ý
// thì bắt nhập lý do.
export function SubmitSheet({ request, etag, onClose, onDone }) {
  const disagree = request.currentResidentOpinion?.opinion === 'DISAGREE' && !request.minorChange
  const warnings = (request.warnings ?? []).map((w) => WARNING_LABELS[w] ?? w)
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const error = submitted && disagree && !reason.trim() ? 'Người cao tuổi không đồng ý: nhập lý do vẫn gửi duyệt' : null

  async function save() {
    setSubmitted(true)
    if (disagree && !reason.trim()) return
    setBusy(true)
    setFailure(null)
    try {
      await postApprovalRequestsByIdSubmit({
        path: { id: request.approvalRequestId },
        headers: { 'If-Match': etag },
        body: reason.trim() ? { reason: reason.trim() } : {},
      })
      onDone('Đã gửi Quản lý viện duyệt', request.approvalRequestId)
    } catch (e) {
      setFailure(problemOf(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto p-6 sm:max-w-lg">
        <SheetTitle>Gửi duyệt</SheetTitle>
        <SheetDescription>Yêu cầu chuyển Chờ duyệt; nội dung bị khóa.</SheetDescription>
        {warnings.length > 0 && (
          <ul className="mt-4 flex flex-col gap-1" aria-label="Cảnh báo">
            {warnings.map((w) => (
              <li key={w} className="type-body-sm text-destructive">{`${w}. Vẫn gửi duyệt được.`}</li>
            ))}
          </ul>
        )}
        {disagree && (
          <FieldGroup className="mt-4">
            <ReasonField
              id="submit-reason"
              label="Lý do vẫn gửi duyệt"
              value={reason}
              onChange={setReason}
              error={error}
            />
          </FieldGroup>
        )}
        <div className="mt-4">
          <ProblemAlert problem={failure} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" className="h-11" onClick={onClose}>
            Đóng
          </Button>
          <Button className="h-11" disabled={busy || !etag} onClick={save}>
            {warnings.length > 0 ? 'Vẫn gửi duyệt' : 'Gửi duyệt'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
