import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ProblemAlert } from '@/common/ProblemAlert'
import { Skeleton } from '@/components/ui/skeleton'
import { problemOf } from '@/common/problem'
import { HandoverStaffField } from './HandoverStaffField'
import { vietnamIso } from './incidentView'
import { downloadTransferDocument, loadTransferInfo, submitTransferOut } from './transferOut'

// Chuyển viện từ sự cố (007 T105; FR-049, FR-050; BR-M05-14, Q-383, Q-384): đơn vị nhận, thời điểm, người đi cùng; hỏi
// người liên hệ chính trước khi phiếu điều trị có yêu cầu hỏi trước, chưa hỏi được thì ghi lý do (trừ sự cố Khẩn cấp).
// Xong thì tải, in bản tóm tắt chuyển viện (PDF); in lại ghi nhật ký.

export function TransferOutPanel({ incidentId, residentId = null, onDone, onCancel }) {
  const [info, setInfo] = useState(null)
  const [problem, setProblem] = useState(null)
  const [unit, setUnit] = useState('')
  // Mặc định chuyển ngay: không gửi thời điểm, máy chủ lấy giờ của hệ thống (đề xuất 2026-11-23 lượt 3)
  const [atNow, setAtNow] = useState(true)
  const [at, setAt] = useState('')
  const [returnAt, setReturnAt] = useState('')
  const [staffId, setStaffId] = useState('')
  const [staff, setStaff] = useState(null)
  // Người đi cùng chọn từ nhân viên bàn giao, người liên hệ chính, hoặc ghi người khác; ghép thành một dòng như cũ
  const [withStaff, setWithStaff] = useState(true)
  const [withContact, setWithContact] = useState(false)
  const [withOther, setWithOther] = useState(false)
  const [other, setOther] = useState('')
  const [reached, setReached] = useState('')
  const [reason, setReason] = useState('')
  const [includeWishes, setIncludeWishes] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [summaryId, setSummaryId] = useState(null)

  useEffect(() => {
    let cancelled = false
    loadTransferInfo(incidentId).then(
      (data) => !cancelled && setInfo(data),
      (error) => !cancelled && setProblem(problemOf(error)),
    )
    return () => {
      cancelled = true
    }
  }, [incidentId])

  async function download(reprint) {
    setBusy(true)
    setProblem(null)
    try {
      await downloadTransferDocument(summaryId, reprint)
    } catch (error) {
      setProblem(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  if (summaryId) {
    return (
      <div className="flex flex-col gap-4">
        <h3 className="type-card-title">Đã chuyển viện</h3>
        <p className="type-body-sm">Đã tạo bản tóm tắt chuyển viện. Tải hoặc in để giao cho đơn vị nhận.</p>
        {problem && <ProblemAlert problem={problem} />}
        <div className="flex flex-wrap gap-2">
          <Button className="h-11" disabled={busy} onClick={() => download(false)}>
            Tải bản tóm tắt
          </Button>
          <Button variant="outline" className="h-11" disabled={busy} onClick={() => download(true)}>
            In lại
          </Button>
          <Button variant="ghost" className="h-11" onClick={onDone}>
            Xong
          </Button>
        </div>
      </div>
    )
  }

  if (!info) return problem ? <ProblemAlert problem={problem} /> : <Skeleton className="h-40 w-full" />

  const askFirst = info.mustAskFirst
  const contact = info.primaryContact
  const staffName = staff ? (staff.position ? `${staff.fullName} (${staff.position})` : staff.fullName) : null
  const companion = [
    withStaff && (staffName ? `${staffName}, nhân viên bàn giao` : staffId && 'Nhân viên bàn giao của viện'),
    withContact && contact && `${contact.fullName} (người liên hệ chính)`,
    withOther && other.trim(),
  ]
    .filter(Boolean)
    .join('; ')
  const missing = {
    unit: !unit.trim(),
    at: !atNow && !at,
    companion: !companion,
    other: withOther && !other.trim(),
    staff: !staffId,
    reached: askFirst && !reached,
    reason: askFirst && reached === 'no' && !info.isEmergency && !reason.trim(),
  }

  async function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    if (Object.values(missing).some(Boolean)) return
    setBusy(true)
    setProblem(null)
    try {
      const body = {
        transferUnit: unit.trim(),
        ...(atNow ? {} : { transferAt: vietnamIso(at) }),
        companion,
        handoverStaffId: Number(staffId),
        ...(returnAt ? { expectedReturnAt: vietnamIso(returnAt) } : {}),
        ...(askFirst ? { requiredContactReached: reached === 'yes' } : {}),
        ...(askFirst && reached === 'no' && reason.trim() ? { notAskedFirstReason: reason.trim() } : {}),
        ...(includeWishes ? { includeWishes: true } : {}),
      }
      const summary = await submitTransferOut(incidentId, body)
      setSummaryId(summary.id)
    } catch (error) {
      setProblem(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {contact && (
        <p className="type-body-sm text-muted-foreground">
          Người liên hệ chính: {contact.fullName} {contact.phoneNumber ?? ''}
        </p>
      )}
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Field data-invalid={(submitted && missing.unit) || undefined}>
          <FieldLabel htmlFor="transfer-unit">Đơn vị nhận</FieldLabel>
          <Input id="transfer-unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
          {submitted && missing.unit && <FieldError>Nhập đơn vị nhận</FieldError>}
        </Field>
        <Field data-invalid={(submitted && missing.at) || undefined}>
          <FieldLabel>Thời điểm chuyển</FieldLabel>
          <ToggleGroup
            variant="outline"
            value={[atNow ? 'now' : 'pick']}
            onValueChange={(n) => n[0] && setAtNow(n[0] === 'now')}
            className="flex flex-wrap"
            aria-label="Thời điểm chuyển"
          >
            <ToggleGroupItem value="now" className="h-11 px-4">
              Ngay bây giờ
            </ToggleGroupItem>
            <ToggleGroupItem value="pick" className="h-11 px-4">
              Chọn giờ khác
            </ToggleGroupItem>
          </ToggleGroup>
          {!atNow && (
            <Input
              id="transfer-at"
              type="datetime-local"
              aria-label="Giờ chuyển"
              value={at}
              onChange={(e) => setAt(e.target.value)}
            />
          )}
          {submitted && missing.at && <FieldError>Chọn giờ chuyển</FieldError>}
        </Field>
        <Field>
          <FieldLabel htmlFor="transfer-return">Dự kiến về (nếu có)</FieldLabel>
          <Input
            id="transfer-return"
            type="datetime-local"
            value={returnAt}
            onChange={(e) => setReturnAt(e.target.value)}
          />
        </Field>
        <HandoverStaffField
          id="transfer-handover-staff"
          residentId={residentId}
          value={staffId}
          onChange={setStaffId}
          onPick={setStaff}
          invalid={submitted && missing.staff}
        />
        <fieldset
          className="flex flex-col gap-2 sm:col-span-2"
          aria-invalid={(submitted && (missing.companion || missing.other)) || undefined}
        >
          <legend className="type-label mb-1">Người đi cùng (chọn một hoặc nhiều)</legend>
          <p className="type-caption text-muted-foreground">
            Nhân viên bàn giao giao người cao tuổi và phiếu tóm tắt cho bệnh viện, thường đi cùng xe.
          </p>
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              className="size-5"
              checked={withStaff}
              onChange={(e) => setWithStaff(e.target.checked)}
            />
            <span>Nhân viên bàn giao đi cùng{staffName ? `: ${staffName}` : ' (chọn ở trên)'}</span>
          </label>
          {contact && (
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                className="size-5"
                checked={withContact}
                onChange={(e) => setWithContact(e.target.checked)}
              />
              <span>
                {contact.fullName} (người liên hệ chính){contact.phoneNumber ? `, ${contact.phoneNumber}` : ''}
              </span>
            </label>
          )}
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              className="size-5"
              checked={withOther}
              onChange={(e) => setWithOther(e.target.checked)}
            />
            <span>Người khác</span>
          </label>
          {withOther && (
            <Input
              id="transfer-companion-other"
              aria-label="Người đi cùng khác: họ tên, quan hệ hoặc chức danh"
              placeholder="Họ tên, quan hệ hoặc chức danh"
              value={other}
              onChange={(e) => setOther(e.target.value)}
            />
          )}
          {submitted && missing.other && <FieldError>Nhập người đi cùng khác</FieldError>}
          {submitted && !missing.other && missing.companion && <FieldError>Chọn người đi cùng</FieldError>}
        </fieldset>
        <div className="flex flex-col gap-1.5 sm:pt-7">
          <Field orientation="horizontal">
            <input
              id="transfer-include-wishes"
              type="checkbox"
              className="size-5"
              checked={includeWishes}
              onChange={(e) => setIncludeWishes(e.target.checked)}
            />
            <FieldLabel htmlFor="transfer-include-wishes">Gửi kèm nguyện vọng liên quan đến ca này</FieldLabel>
          </Field>
          <p className="type-caption text-muted-foreground">
            Mặc định phiếu tóm tắt không in nguyện vọng cuối đời. Chỉ tích khi đơn vị nhận cần biết.
          </p>
        </div>
      </div>
      {askFirst && (
        <>
          <Field data-invalid={(submitted && missing.reached) || undefined}>
            <FieldLabel>Đã hỏi người liên hệ chính trước khi chuyển</FieldLabel>
            <ToggleGroup
              variant="outline"
              value={reached ? [reached] : []}
              onValueChange={(n) => setReached(n[0] ?? '')}
              className="flex flex-wrap"
            >
              <ToggleGroupItem value="yes" className="h-11 px-4">
                Đã hỏi
              </ToggleGroupItem>
              <ToggleGroupItem value="no" className="h-11 px-4">
                Chưa hỏi được
              </ToggleGroupItem>
            </ToggleGroup>
            {submitted && missing.reached && <FieldError>Chọn một đáp án</FieldError>}
          </Field>
          {reached === 'no' && !info.isEmergency && (
            <Field data-invalid={(submitted && missing.reason) || undefined}>
              <FieldLabel htmlFor="transfer-reason">Lý do chưa hỏi được</FieldLabel>
              <Textarea
                id="transfer-reason"
                rows={3}
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              {submitted && missing.reason && <FieldError>Nhập lý do</FieldError>}
            </Field>
          )}
        </>
      )}
      {problem && <ProblemAlert problem={problem} />}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="h-11" disabled={busy}>
          Xác nhận chuyển viện
        </Button>
        <Button type="button" variant="ghost" className="h-11" onClick={onCancel}>
          Quay lại
        </Button>
      </div>
    </form>
  )
}
