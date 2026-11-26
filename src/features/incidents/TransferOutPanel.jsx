import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ProblemAlert } from '@/common/ProblemAlert'
import { Skeleton } from '@/components/ui/skeleton'
import { problemOf } from '@/common/problem'
import { cn } from '@/lib/utils'
import { CHOICE_LABELS } from '@/features/wishes/wishLabels'
import { HandoverStaffField } from './HandoverStaffField'
import { vietnamIso, vietnamNowLocal } from './incidentView'
import { loadTransferDocument, loadTransferInfo, submitTransferOut } from './transferOut'

// Chuyển viện từ sự cố (007 T105; FR-049, FR-050; BR-M05-14, Q-383, Q-384): đơn vị nhận, thời điểm, người đi cùng; hỏi
// người liên hệ chính trước khi phiếu điều trị có yêu cầu hỏi trước, chưa hỏi được thì ghi lý do (trừ sự cố Khẩn cấp).
// Xong thì tải, in bản tóm tắt chuyển viện (PDF); in lại ghi nhật ký.

export function TransferOutPanel({ incidentId, residentId = null, onDone, onCancel, onPreview, reopen = false }) {
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
  // Giờ chuyển khác và dự kiến về ít khi cần: gập lại (đề xuất 2026-11-24, ít ô hơn khi khẩn)
  const [more, setMore] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadTransferInfo(incidentId).then(
      (data) => {
        if (cancelled) return
        setInfo(data)
        // Mở xem lại phiếu đã lập (sau khi đã đóng màn in): vào thẳng màn phiếu
        if (reopen && data?.summaryId) setSummaryId(data.summaryId)
      },
      (error) => !cancelled && setProblem(problemOf(error)),
    )
    return () => {
      cancelled = true
    }
  }, [incidentId, reopen])

  const [pdfUrl, setPdfUrl] = useState(null)
  const frameRef = useRef(null)

  useEffect(() => {
    if (!summaryId) return undefined
    let url
    loadTransferDocument(summaryId)
      .then((u) => setPdfUrl((url = u)))
      .catch((error) => setProblem(problemOf(error)))
    return () => url && URL.revokeObjectURL(url)
  }, [summaryId])

  // Báo khung ngoài biết đang xem trước phiếu để chỉ hiện tờ giấy (BF-06)
  useEffect(() => {
    onPreview?.(Boolean(summaryId))
  }, [summaryId, onPreview])

  function printPdf() {
    frameRef.current?.contentWindow?.print()
  }

  function savePdf() {
    const link = document.createElement('a')
    link.href = pdfUrl
    link.download = `tom-tat-chuyen-vien-${summaryId}.pdf`
    link.click()
  }

  async function reprint() {
    setBusy(true)
    setProblem(null)
    try {
      const url = await loadTransferDocument(summaryId, true)
      setPdfUrl(url)
    } catch (error) {
      setProblem(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  if (summaryId) {
    // Màn in toàn màn hình như xem trước của máy in: thanh công cụ ở trên, tờ A4 to ở giữa trên nền xám (BF-06)
    return (
      <div className="flex h-dvh flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-2">
          <Button variant="secondary" className="h-11" onClick={onDone}>
            Xong
          </Button>
          <p className="type-label mr-auto ml-2 hidden sm:block">Phiếu tóm tắt thông tin sức khoẻ</p>
          <Button variant="secondary" className="h-11" disabled={busy} onClick={reprint}>
            In lại (ghi nhật ký)
          </Button>
          <Button variant="secondary" className="h-11" disabled={!pdfUrl} onClick={savePdf}>
            Tải về
          </Button>
          <Button className="h-11 px-6" disabled={!pdfUrl || busy} onClick={printPdf}>
            In phiếu
          </Button>
        </div>
        {problem && <ProblemAlert problem={problem} />}
        <div className="flex min-h-0 flex-1 justify-center overflow-auto p-4">
          {pdfUrl ? (
            <iframe
              ref={frameRef}
              title="Phiếu tóm tắt chuyển viện"
              src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
              className="aspect-[210/297] h-full max-w-full border-0 bg-white shadow-md"
            />
          ) : (
            <Skeleton className="aspect-[210/297] h-full max-w-full" />
          )}
        </div>
      </div>
    )
  }

  if (!info) return problem ? <ProblemAlert problem={problem} /> : <Skeleton className="h-40 w-full" />

  const askFirst = info.mustAskFirst
  const contact = info.primaryContact
  // BF-06 bước 10: xem nguyện vọng khi điều trị trước khi chuyển; bệnh viện ưu tiên thành nút điền nhanh
  const preferred = info.treatmentWish?.preferredHospitals ?? []
  const endOfLife = info.endOfLifeWish
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
      {(endOfLife || contact) && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-lg bg-muted/60 px-4 py-3 type-body-sm">
          {endOfLife && (
            <>
              <dt className="text-muted-foreground">Nguyện vọng cuối đời</dt>
              <dd>
                <strong>{CHOICE_LABELS[endOfLife.choice] ?? endOfLife.choice}</strong>
                {endOfLife.note && `. ${endOfLife.note}`}
              </dd>
            </>
          )}
          {contact && (
            <>
              <dt className="text-muted-foreground">Người liên hệ chính</dt>
              <dd>
                {contact.fullName}
                {contact.phoneNumber && (
                  <>
                    {', '}
                    <a className="type-label text-primary underline" href={`tel:${contact.phoneNumber}`}>
                      {contact.phoneNumber}
                    </a>
                  </>
                )}
              </dd>
            </>
          )}
        </dl>
      )}
      <div className="flex flex-col gap-4">
        <Field data-invalid={(submitted && missing.unit) || undefined}>
          <FieldLabel htmlFor="transfer-unit">Bệnh viện nhận</FieldLabel>
          {preferred.length > 0 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Bệnh viện ưu tiên theo nguyện vọng">
              {preferred.map((h) => (
                <Button
                  key={h.name}
                  type="button"
                  variant="outline"
                  title={h.address ?? undefined}
                  aria-pressed={unit === h.name}
                  className={cn('h-10 px-3', unit === h.name && 'border-2 border-primary bg-accent')}
                  onClick={() => setUnit(h.name)}
                >
                  {h.name}
                </Button>
              ))}
            </div>
          )}
          <Input id="transfer-unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
          {submitted && missing.unit && <FieldError>Nhập bệnh viện nhận</FieldError>}
        </Field>
        <HandoverStaffField
          id="transfer-handover-staff"
          residentId={residentId}
          value={staffId}
          onChange={setStaffId}
          onPick={setStaff}
          invalid={submitted && missing.staff}
        />
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Button
            type="button"
            variant="link"
            className="h-9 self-start px-0"
            aria-expanded={more || !atNow}
            onClick={() => setMore((v) => !v)}
          >
            {more || !atNow ? 'Ẩn giờ chuyển, dự kiến về' : 'Lúc: ngay bây giờ · Đổi giờ, thêm dự kiến về'}
          </Button>
          {(more || !atNow) && (
            <div className="flex flex-col gap-4">
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
                  min={atNow ? vietnamNowLocal() : at}
                  onChange={(e) => setReturnAt(e.target.value)}
                />
              </Field>
            </div>
          )}
        </div>
        <fieldset
          className="flex flex-col gap-2 sm:col-span-2"
          aria-invalid={(submitted && (missing.companion || missing.other)) || undefined}
        >
          <legend className="type-label mb-1">Người đi cùng</legend>
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
            <FieldLabel htmlFor="transfer-include-wishes">In kèm nguyện vọng điều trị</FieldLabel>
          </Field>
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
          Chuyển viện và in phiếu
        </Button>
        <Button type="button" variant="ghost" className="h-11" onClick={onCancel}>
          Quay lại
        </Button>
      </div>
    </form>
  )
}
