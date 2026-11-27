import { useEffect, useRef, useState } from 'react'
import {
  getContractsById,
  getContractsByIdAddenda,
  getContractsByIdContent,
  getContractsByIdDeposit,
  getContractsByIdNonStandardTerms,
  getResidentsByResidentIdRelationships,
  getServices,
  getServicesByIdPriceVersions,
  postContracts,
  postContractsByIdCancel,
  postContractsByIdRecordSigned,
  postContractsByIdReturnToDraft,
  postContractsByIdSendForSignature,
  postContractsByIdSubmitTermsForApproval,
  putContractsById,
} from '@/api'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { ProblemAlert } from '@/common/ProblemAlert'
import { formatDate } from '@/common/dateTime'
import { uploadFile } from '@/common/files'
import { problemOf } from '@/common/problem'
import {
  ADDENDUM_STATUS,
  BILLING_PERIODS,
  CARE_LEVELS,
  CHANGE_TYPES,
  changeValueText,
  CONTRACT_STATUS,
  RESIDENCE_TYPES,
  SELECT,
  labelOf,
  money,
  newKey,
} from './admissionLabels'
import { getRoomTypes } from '@/api/api003'
import { CONTRACT_REASONS } from '@/common/quickChoices'

import { Choices, Info, ReasonField, ResidentSelect } from './FormParts'
import { FileInput } from '@/common/FileInput'
import { MoneyInput } from '@/common/MoneyInput'
import { DateField } from '@/common/DateField'
import { DiscardChangesDialog } from '@/common/DiscardChangesDialog'
import { displayDate, isoDate } from '@/common/dateText'
import { Toggle } from '@/components/ui/toggle'
import { ChevronDown } from 'lucide-react'
import { cn } from 'cn'
import { useBedChangeNames } from './useBedChangeNames'
import { bedText, roomTypeMismatch, useAllocatedBed } from './useAllocatedBed'
import { useDepositCollected } from './useDepositCollected'

// Hôm nay ở Việt Nam, dạng yyyy-MM-dd (en-CA định dạng đúng kiểu này)
const vietnamToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())

// Khung chi tiết và form của hợp đồng (004 T038; US3, US4, FR-019 → FR-025a, FR-028 → FR-031). Nút lệnh theo
// allowedCommands của hợp đồng; trường tài chính ẩn theo quyền (hiddenFields); đặt cọc chỉ đọc vì 017 tính (FR-030).

const DEPOSIT_STATUS = { NOT_SATISFIED: 'Chưa đặt cọc', SATISFIED: 'Đã đặt cọc', NOT_REQUIRED: 'Không yêu cầu đặt cọc' }
const REASON_COMMANDS = {
  'submit-terms-for-approval': [
    'Gửi duyệt điều khoản…',
    'Gửi Quản lý viện duyệt điều khoản khác chuẩn',
    postContractsByIdSubmitTermsForApproval,
    'Đã gửi duyệt điều khoản',
  ],
  'return-to-draft': ['Trả về nháp', 'Trả hợp đồng về nháp', postContractsByIdReturnToDraft, 'Đã trả hợp đồng về nháp'],
  cancel: ['Hủy hợp đồng', 'Hủy hợp đồng', postContractsByIdCancel, 'Đã hủy hợp đồng'],
}

// Ghi nhận đã ký (FR-021): ngày ký (không sau hôm nay; backend kiểm thêm không trước ngày lập, SIGNED_DATE_INVALID), người
// đại diện đã ký (chip, không chọn sẵn), bản scan. Nội trú phải có giường đã phân bổ: kiểm trước, thiếu thì khóa nút.
const SIGN_FORM_ID = 'record-signed-form'

// onReturnToDraft: có khi giường bắt đầu sau ngày bắt đầu hợp đồng và hợp đồng trả về nháp được (sửa ngày bắt đầu)
function RecordSignedPanel({ contract, bedLine, bedMissing, onReturnToDraft, onBusy, onDone }) {
  const [dateText, setDateText] = useState('')
  const [representatives, setRepresentatives] = useState(null)
  const [representativeId, setRepresentativeId] = useState('')
  const [file, setFile] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [failure, setFailure] = useState(null)
  const today = vietnamToday()

  useEffect(() => {
    getResidentsByResidentIdRelationships({ path: { residentId: contract.residentId } })
      // chỉ người đại diện có quan hệ Hiệu lực mới ký được (backend REPRESENTATIVE_REQUIRED)
      .then(({ data }) => setRepresentatives(data.filter((r) => r.status === 'ACTIVE' && r.representative)))
      .catch((e) => {
        setRepresentatives([])
        setFailure(problemOf(e))
      })
  }, [contract.residentId])

  const signedDate = isoDate(dateText)
  const errors = {
    date: !dateText.trim()
      ? 'Nhập ngày ký'
      : !signedDate
        ? 'Nhập ngày có thật, dạng DD/MM/YYYY'
        : signedDate > today && 'Ngày ký không sau hôm nay',
    representative: !representativeId && 'Chọn người đại diện ký',
    file: !file && 'Chọn bản scan hợp đồng đã ký',
  }
  const shown = (key) => (submitted ? errors[key] || null : null)

  async function save(event) {
    event.preventDefault()
    setSubmitted(true)
    if (bedMissing || Object.values(errors).some(Boolean)) return
    onBusy(true)
    setFailure(null)
    try {
      const scanFileId = await uploadFile(file)
      await postContractsByIdRecordSigned({
        path: { id: contract.id },
        headers: newKey(),
        body: { signedDate, signingRepresentativeId: Number(representativeId), scanFileId },
      })
      onDone('Đã ghi nhận hợp đồng đã ký, hợp đồng Hiệu lực')
    } catch (e) {
      setFailure(problemOf(e))
    } finally {
      onBusy(false)
    }
  }

  return (
    <form
      id={SIGN_FORM_ID}
      onSubmit={save}
      noValidate
      aria-label="Ghi nhận đã ký"
      className="flex flex-col gap-4 rounded-xl bg-muted/50 p-4"
    >
      <h3 className="type-label">Ghi nhận đã ký</h3>
      {bedLine && (
        <p className={cn('type-body-sm', bedMissing ? 'text-destructive' : 'text-success-foreground')}>{bedLine}</p>
      )}
      {onReturnToDraft && (
        <Button type="button" variant="outline" className="h-10 self-start" onClick={onReturnToDraft}>
          Trả về nháp để sửa ngày
        </Button>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={!!shown('date') || undefined}>
          <FieldLabel htmlFor="signed-date">
            Ngày ký
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
          </FieldLabel>
          <DateField
            id="signed-date"
            value={dateText}
            onChange={setDateText}
            max={today}
            invalid={!!shown('date')}
            aria-required="true"
          />
          {shown('date') && <FieldError>{shown('date')}</FieldError>}
        </Field>
        <Field data-invalid={!!shown('representative') || undefined}>
          <span id="signed-representative-label" className="type-label">
            Người đại diện ký
            <span aria-hidden="true" className="ml-1 text-destructive">
              *
            </span>
          </span>
          {representatives === null ? (
            <span className="type-body-sm text-muted-foreground">Đang tải…</span>
          ) : representatives.length === 0 ? (
            <span className="type-body-sm text-destructive">Chưa có người đại diện Hiệu lực</span>
          ) : (
            <div role="radiogroup" aria-labelledby="signed-representative-label" className="flex flex-wrap gap-2">
              {representatives.map((r) => {
                const id = String(r.familyMember.id)
                return (
                  <label
                    key={r.id}
                    className="inline-flex h-11 cursor-pointer items-center rounded-lg border border-input bg-background px-3 type-body-sm has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                  >
                    <input
                      type="radio"
                      name="signed-representative"
                      className="sr-only"
                      checked={representativeId === id}
                      onChange={() => setRepresentativeId(id)}
                    />
                    {r.familyMember.fullName}
                  </label>
                )
              })}
            </div>
          )}
          {shown('representative') && <FieldError>{shown('representative')}</FieldError>}
        </Field>
      </div>
      <Field data-invalid={!!shown('file') || undefined}>
        <FieldLabel htmlFor="signed-scan">
          Bản scan hợp đồng đã ký
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        </FieldLabel>
        <FileInput
          id="signed-scan"
          accept="application/pdf,image/*"
          aria-invalid={!!shown('file') || undefined}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {shown('file') && <FieldError>{shown('file')}</FieldError>}
      </Field>
      {failure && <ProblemAlert problem={failure} />}
    </form>
  )
}

const STATUS_DOT = {
  DRAFT: 'bg-muted-foreground',
  PENDING_SIGNATURE: 'bg-warning-foreground',
  ACTIVE: 'bg-success-foreground',
}

// Chi tiết hợp đồng (audit BF-01 2026-11-27, chủ dự án duyệt bản phác): đầu khung số hợp đồng và chấm trạng thái; phần lệnh
// (Ghi nhận đã ký, Gửi ký, lý do của Trả về nháp, Hủy, Gửi duyệt điều khoản) mở ngay dưới đầu khung; thông tin hai cột;
// Chi phí có đơn giá và "Mỗi tháng"; Đặt cọc "Cần … · đã thu …"; chân khung: "Hủy hợp đồng…" chữ đỏ bên trái, lệnh khác bên
// phải, nút chính Ghi nhận đã ký hoặc Gửi ký. Gửi ký hỏi lại và hiện cảnh báo backend trả (FR-025). framed: trong popup thì
// đầu, chân cố định, giữa cuộn; ở màn Hợp đồng (khung chi tiết) thì xếp liền.
export function ContractDetail({
  contract,
  residentName,
  residentCode,
  canUpdate,
  onChanged,
  onEdit,
  Title,
  Description,
  framed = false,
}) {
  const [deposit, setDeposit] = useState(null)
  const [addenda, setAddenda] = useState([])
  const [current, setCurrent] = useState(null)
  const [terms, setTerms] = useState([])
  const [mode, setMode] = useState(null)
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [failure, setFailure] = useState(null)
  const [busy, setBusy] = useState(false)
  const [roomTypeName, setRoomTypeName] = useState(null)
  const [catalog, setCatalog] = useState({})
  const bedNames = useBedChangeNames(
    addenda.filter((a) => a.changeTypes?.includes('BED')).flatMap((a) => [a.contentBefore, a.contentAfter]),
  )
  const allocated = useAllocatedBed(contract.residentId, contract.id)
  const collected = useDepositCollected(contract.residentId, contract.id)
  const mismatch = roomTypeMismatch(allocated, contract.roomTypeId)
  const allowed = canUpdate ? (contract.allowedCommands ?? []) : []
  const draft = contract.status === 'DRAFT'
  const active = contract.status === 'ACTIVE'
  const residential = ['LONG_TERM_RESIDENTIAL', 'SHORT_TERM_RESIDENTIAL'].includes(contract.residenceType)
  // BR-M02-09: hợp đồng hiệu lực tại một ngày = bản gốc + phụ lục đã áp dụng tới ngày đó
  const shown = { ...contract, ...(current?.content ?? {}) }
  const services = shown.services ?? []
  const prices = usePriceVersions(services.map((s) => s.serviceId))
  const priceOf = (id) => (prices[id] ? priceOn(prices[id], shown.startDate ?? vietnamToday()) : undefined)
  const monthly = services.filter((s) => catalog[s.serviceId]?.billingPeriod === 'MONTH')
  const monthlyTotal = monthly.every((s) => priceOf(s.serviceId) !== undefined)
    ? monthly.reduce((sum, s) => sum + priceOf(s.serviceId), 0)
    : null

  // Loại phòng, dịch vụ đăng ký ghi bằng tên (4b, chủ dự án duyệt 2026-11-21); không đọc được danh mục thì ghi "mã …"
  useEffect(() => {
    let cancelled = false
    if (contract.roomTypeId)
      getRoomTypes({ query: {} })
        .then(({ data }) => !cancelled && setRoomTypeName(data.find((t) => t.id === contract.roomTypeId)?.name ?? null))
        .catch(() => {})
    if (contract.services?.length)
      getServices({ query: {} })
        .then(({ data }) => !cancelled && setCatalog(Object.fromEntries(data.map((s) => [s.id, s]))))
        .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [contract.roomTypeId, contract.services?.length])

  useEffect(() => {
    let cancelled = false
    if (active)
      getContractsByIdContent({ path: { id: contract.id }, query: { date: vietnamToday() } })
        .then(({ data }) => !cancelled && setCurrent(data))
        .catch(() => {})
    getContractsByIdDeposit({ path: { id: contract.id } })
      .then(({ data }) => !cancelled && setDeposit(data))
      .catch(() => {})
    getContractsByIdAddenda({ path: { id: contract.id } })
      .then(({ data }) => !cancelled && setAddenda(data))
      .catch(() => {})
    if (draft)
      getContractsByIdNonStandardTerms({ path: { id: contract.id } })
        .then(({ data }) => !cancelled && setTerms(data))
        .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [contract.id, draft, active])

  function open(next) {
    setMode(next)
    setReason('')
    setSubmitted(false)
    setFailure(null)
  }

  async function run(call, body, message) {
    setBusy(true)
    setFailure(null)
    try {
      const { data } = await call({ path: { id: contract.id }, headers: newKey(), ...(body && { body }) })
      const warnings = (data?.warnings ?? []).map((w) => w.description).filter(Boolean)
      open(null)
      onChanged(warnings.length ? `${message}. Lưu ý: ${warnings.join('; ')}` : message)
    } catch (e) {
      setFailure(problemOf(e))
    } finally {
      setBusy(false)
    }
  }

  function submitReason() {
    setSubmitted(true)
    if (!reason.trim()) return
    const [, , call, message] = REASON_COMMANDS[mode]
    run(call, { reason: reason.trim() }, message)
  }

  const bed = allocated.bed
  // FR-021: giường phải bắt đầu trong hoặc trước ngày bắt đầu hợp đồng (chủ dự án yêu cầu kiểm trước 2026-11-27)
  const bedLate = !!(bed?.startDate && contract.startDate && bed.startDate > contract.startDate)
  const bedBlocked = residential && (!bed || bedLate)
  const bedLine = residential
    ? !bed
      ? 'Chưa có giường phân bổ: chọn giường trước khi ghi nhận đã ký'
      : bedLate
        ? `Giường ${bedText(bed.location)} bắt đầu ${formatDate(bed.startDate)}, sau ngày bắt đầu hợp đồng ${formatDate(contract.startDate)}: trả về nháp để sửa ngày bắt đầu, hoặc chọn lại giường`
        : `Giường: ${bedText(bed.location)}${bed.startDate ? `, bắt đầu ${formatDate(bed.startDate)}` : ''}`
    : null

  const header = (
    <div className={cn('flex flex-col gap-1', framed && 'shrink-0 border-b px-6 pt-6 pb-4 pr-12')}>
      <Title className="type-title flex flex-wrap items-center gap-x-3">
        {`Hợp đồng ${contract.contractNumber ?? 'chưa có số'}`}
        <span className="type-body-sm inline-flex items-center gap-1.5 font-normal">
          <span aria-hidden="true" className={cn('size-2 rounded-full', STATUS_DOT[contract.status] ?? 'bg-border')} />
          {CONTRACT_STATUS[contract.status] ?? contract.status}
        </span>
      </Title>
      <Description className="type-body-sm text-muted-foreground">
        {[residentName, residentCode].filter(Boolean).join(' · ')}
      </Description>
    </div>
  )

  const panel =
    mode === 'record-signed' ? (
      <RecordSignedPanel
        contract={contract}
        bedLine={bedLine}
        bedMissing={bedBlocked}
        onReturnToDraft={bedLate && allowed.includes('return-to-draft') ? () => open('return-to-draft') : null}
        onBusy={setBusy}
        onDone={(m) => {
          open(null)
          onChanged(m)
        }}
      />
    ) : mode === 'send' ? (
      <div className="rounded-xl bg-muted/50 p-4">
        <h3 className="type-label">Gửi ký hợp đồng này?</h3>
      </div>
    ) : mode ? (
      <div className="flex flex-col gap-3 rounded-xl bg-muted/50 p-4">
        <h3 className="type-label">{REASON_COMMANDS[mode][1]}</h3>
        <ReasonField
          id="contract-reason"
          options={CONTRACT_REASONS[mode]}
          value={reason}
          onChange={setReason}
          error={submitted && !reason.trim() ? 'Nhập lý do' : null}
        />
      </div>
    ) : null

  const body = (
    <div className={cn('flex flex-col gap-6', framed && 'min-h-0 flex-1 overflow-y-auto px-6 py-6')}>
      {panel}
      {failure && <ProblemAlert problem={failure} />}
      {contract.overdueSince && (
        <p className="type-body-sm text-destructive">{`Quá hạn từ ${formatDate(contract.overdueSince)}`}</p>
      )}
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Info label="Loại lưu trú">{labelOf(RESIDENCE_TYPES, shown.residenceType)}</Info>
        <Info label="Thời gian">
          {`Từ ${formatDate(shown.startDate)}${shown.endDate ? ` đến ${formatDate(shown.endDate)}` : ''}`}
        </Info>
        <Info label="Mức chăm sóc">{labelOf(CARE_LEVELS, shown.careLevel)}</Info>
        <Info label="Kỳ tính phí lưu trú">{labelOf(BILLING_PERIODS, shown.residencyFeeBillingPeriod)}</Info>
        {contract.roomTypeId && (
          <Info label="Loại phòng">{roomTypeName ?? `Loại phòng mã ${contract.roomTypeId}`}</Info>
        )}
        {bed && <Info label="Giường đã phân bổ">{bedText(bed.location)}</Info>}
        {contract.signedDate && <Info label="Ngày ký">{formatDate(contract.signedDate)}</Info>}
        {contract.terminationReason && <Info label="Lý do chấm dứt">{contract.terminationReason}</Info>}
      </div>
      {mismatch && (
        <p className="type-body-sm rounded-md border border-warning-foreground/40 bg-warning px-3 py-2 text-warning-foreground">
          {mismatch}
        </p>
      )}
      {current?.addendumId && (
        <p className="type-caption text-muted-foreground">
          {`Theo phụ lục hiệu lực từ ${formatDate(current.effectiveFrom)}; bản gốc giữ nguyên.`}
        </p>
      )}
      {services.length > 0 && (
        <section aria-labelledby="contract-services" className="flex flex-col gap-1">
          <h3 id="contract-services" className="type-label">
            Chi phí
          </h3>
          <ul className="flex flex-col">
            {services.map((s) => (
              <li key={s.serviceId} className="type-body-sm flex flex-wrap justify-between gap-x-4 py-0.5">
                <span>{catalog[s.serviceId]?.name ?? `Dịch vụ mã ${s.serviceId}`}</span>
                <span className="tabular-nums text-muted-foreground">
                  {priceText(priceOf(s.serviceId), catalog[s.serviceId]?.billingPeriod)}
                </span>
              </li>
            ))}
          </ul>
          {monthly.length > 0 && monthlyTotal !== null && (
            <p className="flex justify-between gap-4 border-t pt-2 type-body-sm font-medium">
              <span>Mỗi tháng</span>
              <span className="tabular-nums">{money(monthlyTotal)}</span>
            </p>
          )}
        </section>
      )}
      {deposit && (
        <section className="flex flex-col gap-1">
          <h3 className="type-label">Đặt cọc</h3>
          <p className="type-body-sm tabular-nums">
            {deposit.notRequired || deposit.status === 'NOT_REQUIRED'
              ? 'Không yêu cầu đặt cọc'
              : [
                  deposit.requiredAmount != null && `Cần ${money(deposit.requiredAmount)}`,
                  collected != null && `đã thu ${money(collected)}`,
                  DEPOSIT_STATUS[deposit.status],
                ]
                  .filter(Boolean)
                  .join(' · ')}
          </p>
        </section>
      )}
      {terms.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="type-label">Điều khoản khác chuẩn</h3>
          <ul className="flex flex-col gap-1">
            {terms.map((t) => (
              <li key={t.type} className="type-body-sm">
                {t.description}
                <span className="block type-caption text-muted-foreground">{`Chuẩn: ${t.standardValue}; đề xuất: ${t.proposedValue}`}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {addenda.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="type-label">Phụ lục</h3>
          <ul className="flex flex-col gap-1">
            {addenda.map((a) => (
              <li key={a.id} className="type-body-sm">
                {`Hiệu lực ${formatDate(a.effectiveDate)}`}
                {(a.changeTypes ?? []).map((type) => (
                  <span key={type} className="block">
                    {`${labelOf(CHANGE_TYPES, type)}: ${changeValueText(type, a.contentBefore, bedNames)} → ${changeValueText(type, a.contentAfter, bedNames)}`}
                  </span>
                ))}
                <span className="block type-caption text-muted-foreground">
                  {ADDENDUM_STATUS[a.status] ?? a.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )

  const footerClass = cn('flex flex-wrap items-center gap-3', framed ? 'shrink-0 border-t px-6 py-4' : 'border-t pt-4')
  const footer = mode ? (
    <div className={cn(footerClass, 'justify-end')}>
      <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={() => open(null)}>
        Thôi
      </Button>
      {mode === 'record-signed' ? (
        <Button type="submit" form={SIGN_FORM_ID} className="h-11" disabled={busy || bedBlocked}>
          {busy ? 'Đang lưu…' : 'Lưu đã ký'}
        </Button>
      ) : mode === 'send' ? (
        <Button
          className="h-11"
          disabled={busy}
          onClick={() => run(postContractsByIdSendForSignature, null, 'Đã gửi ký')}
        >
          {busy ? 'Đang gửi…' : 'Gửi ký'}
        </Button>
      ) : (
        <Button
          className="h-11"
          variant={mode === 'cancel' ? 'destructive' : 'default'}
          disabled={busy}
          onClick={submitReason}
        >
          {REASON_COMMANDS[mode][1]}
        </Button>
      )}
    </div>
  ) : allowed.length > 0 ? (
    <div className={footerClass}>
      {allowed.includes('cancel') && (
        <Button
          variant="ghost"
          className="h-11 px-2 text-destructive hover:text-destructive"
          onClick={() => open('cancel')}
        >
          {REASON_COMMANDS.cancel[0]}
        </Button>
      )}
      <span className="flex-1" />
      {allowed.includes('update') && (
        <Button variant="outline" className="h-11" onClick={() => onEdit(contract)}>
          Sửa nội dung
        </Button>
      )}
      {['submit-terms-for-approval', 'return-to-draft'].map(
        (command) =>
          allowed.includes(command) && (
            <Button key={command} variant="outline" className="h-11" onClick={() => open(command)}>
              {REASON_COMMANDS[command][0]}
            </Button>
          ),
      )}
      {allowed.includes('record-signed') && (
        <Button className="h-11" onClick={() => open('record-signed')}>
          Ghi nhận đã ký
        </Button>
      )}
      {allowed.includes('send-for-signature') && (
        <Button className="h-11" onClick={() => open('send')}>
          Gửi ký
        </Button>
      )}
    </div>
  ) : null

  return (
    <div className={cn('flex flex-col', framed ? 'h-full min-h-0' : 'gap-6')}>
      {header}
      {body}
      {footer}
    </div>
  )
}

const DAYS = [
  [1, 'Thứ hai'],
  [2, 'Thứ ba'],
  [3, 'Thứ tư'],
  [4, 'Thứ năm'],
  [5, 'Thứ sáu'],
  [6, 'Thứ bảy'],
  [7, 'Chủ nhật'],
]

// Lập hợp đồng Nháp hoặc sửa Nháp (tải lại để lấy ETag cho If-Match). residentId: người cao tuổi đã biết khi lập mới
// (mở từ màn Hồ sơ tiếp nhận); khi đó và khi sửa chỉ hiện họ tên ở đầu khung, không có ô chọn người cao tuổi khác
// (chủ dự án yêu cầu 2026-11-17). Ô chọn chỉ còn khi lập từ danh sách Hợp đồng, chưa gắn với ai.
// Audit BF-01 2026-11-27 (chủ dự án duyệt): một trang ba phần (Lưu trú; Mức, phòng; Dịch vụ, đặt cọc), cột phải Tóm tắt chi
// phí, đầu và chân khung cố định, đóng khi đã nhập thì hỏi lại. Dịch vụ theo Q-426: dịch vụ chăm sóc theo mức, phí lưu trú
// theo loại phòng, buổi bán trú theo loại lưu trú là tác động kèm lựa chọn (Q-300), không tick tay; chỉ phục hồi, hoạt động,
// đưa đi khám, tiêm là dịch vụ đi kèm chọn được (gập lại, không bắt buộc), luôn ngoài gói, tính theo lần (chủ dự án bỏ nút
// "Thuộc gói" 2026-11-27; lưu lại thì mọi dòng gửi inPackage false); suất ăn, người thân ở lại, thuốc, vật phẩm, vật tư
// đi theo luồng riêng nên không có trong form. Đặt cọc: chọn "Có đặt cọc" hoặc "Không yêu cầu đặt cọc" (spec 004 US4). Khoản
// cọc theo chính sách của web (chủ dự án chọn 2026-11-27, không ghi vào nghiệp vụ): DEPOSIT_MONTHS tháng phí cố định (chăm sóc
// theo mức + phí lưu trú theo loại phòng, đơn giá tại ngày bắt đầu), như thực tế các viện thu 1–2 tháng tiền phòng; tự điền và
// tính lại khi đổi mức, loại phòng tới khi Hành chính sửa tay. Bán trú không có phí tháng nên nhập tay.
// defaults (lập mới từ Hồ sơ tiếp nhận; chủ dự án duyệt 2026-11-27, chép lại thông tin Hành chính đã ghi, không phải gợi ý
// Q-307): residenceType, startDate (yyyy-MM-dd) từ lượt đăng ký; careLevel là mức hiện hành, chưa có thì mức dự kiến; roomTypeId
// của giường đã phân bổ. Sửa được trước khi lưu. Kỳ tính phí, dịch vụ đi kèm, đặt cọc không điền sẵn.
const FORM_ID = 'contract-form'
const PERIODS_OF = { DAY_CARE: ['SESSION'] }
const RESIDENTIAL_PERIODS = ['MONTH', 'DAY']
const REGISTRABLE_TYPES = ['REHABILITATION', 'ACTIVITY', 'MEDICAL_ESCORT', 'INJECTION']
const UNIT_OF = { MONTH: 'tháng', DAY: 'ngày', SESSION: 'buổi', OCCURRENCE: 'lần', UNIT: 'đơn vị' }
const DEPOSIT_MONTHS = 1
const DEPOSIT_CHOICES = [
  ['yes', 'Có đặt cọc'],
  ['no', 'Không yêu cầu đặt cọc'],
]

function priceOn(versions, date) {
  return versions?.find((v) => v.effectiveFrom <= date && (!v.effectiveTo || v.effectiveTo >= date))?.unitPrice
}

// Phiên bản đơn giá của các dịch vụ cần hiện giá (tóm tắt và dịch vụ đi kèm); null khi không xem được
function usePriceVersions(ids) {
  const [prices, setPrices] = useState({})
  const key = [...new Set(ids)].sort().join(',')
  useEffect(() => {
    let active = true
    for (const id of key ? key.split(',').map(Number) : []) {
      getServicesByIdPriceVersions({ path: { id } })
        .then(({ data }) => active && setPrices((p) => ({ ...p, [id]: data })))
        .catch(() => active && setPrices((p) => ({ ...p, [id]: null })))
    }
    return () => {
      active = false
    }
  }, [key])
  return prices
}

const priceText = (price, period) =>
  price === undefined ? 'Chưa xem được đơn giá' : `${money(price)}/${UNIT_OF[period] ?? 'lần'}`

function ContractCostSummary({ lines, deposit }) {
  const monthly = lines.filter((l) => l.billingPeriod === 'MONTH')
  const total = monthly.every((l) => l.price !== undefined) ? monthly.reduce((sum, l) => sum + l.price, 0) : null
  return (
    <section
      aria-labelledby="contract-cost"
      className="flex h-fit flex-col gap-3 rounded-xl bg-muted/50 p-4 md:sticky md:top-0"
    >
      <h3 id="contract-cost" className="type-card-title">
        Tóm tắt chi phí
      </h3>
      {lines.length === 0 ? (
        <p className="type-body-sm text-muted-foreground">Chưa có khoản nào.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lines.map((l) => (
            <li key={l.id} className="flex flex-col">
              <span className="type-body-sm">{l.name}</span>
              <span className="type-caption tabular-nums text-muted-foreground">
                {priceText(l.price, l.billingPeriod)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {monthly.length > 0 && total !== null && (
        <p className="flex items-baseline justify-between gap-2 border-t pt-3">
          <span className="type-label">Mỗi tháng</span>
          <span className="type-card-title tabular-nums whitespace-nowrap">{money(total)}</span>
        </p>
      )}
      {deposit && (
        <p className="flex items-baseline justify-between gap-2 border-t pt-3">
          <span className="type-label">Đặt cọc</span>
          <span className="type-body-sm tabular-nums whitespace-nowrap">{deposit}</span>
        </p>
      )}
    </section>
  )
}

function Required() {
  return (
    <span aria-hidden="true" className="text-destructive">
      *
    </span>
  )
}

function Section({ number, title, children }) {
  return (
    <section aria-label={title} className="flex flex-col gap-5 border-t py-6 first:border-0 first:pt-0">
      <h3 className="type-label">{`${number} · ${title}`}</h3>
      {children}
    </section>
  )
}

function DateInput({ id, label, required, value, onChange, error }) {
  return (
    <Field data-invalid={!!error || undefined}>
      <FieldLabel htmlFor={id}>
        {label}
        {required && <Required />}
      </FieldLabel>
      <DateField id={id} value={value} onChange={onChange} invalid={!!error} aria-required={required || undefined} />
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}

export function ContractSheet({
  contract,
  residentId: presetResidentId = null,
  residentName = null,
  residentCode = null,
  defaults = {},
  onClose,
  onDone,
}) {
  const editing = !!contract
  const fixedResident = editing || presetResidentId != null
  const [etag, setEtag] = useState(null)
  const [catalog, setCatalog] = useState(null)
  const [residentId, setResidentId] = useState(
    contract ? String(contract.residentId) : presetResidentId ? String(presetResidentId) : '',
  )
  const [type, setType] = useState(contract?.residenceType ?? defaults.residenceType ?? '')
  const [startText, setStartText] = useState(displayDate(contract?.startDate ?? defaults.startDate))
  const [endText, setEndText] = useState(displayDate(contract?.endDate))
  const [level, setLevel] = useState(contract?.careLevel ?? defaults.careLevel ?? '')
  const [period, setPeriod] = useState(contract?.residencyFeeBillingPeriod ?? '')
  const [picked, setPicked] = useState(
    () => new Map((contract?.services ?? []).map((s) => [s.serviceId, !!s.inPackage])),
  )
  const [depositChoice, setDepositChoice] = useState(
    contract?.noDepositRequired ? 'no' : contract?.depositAmount != null ? 'yes' : '',
  )
  // null: theo chính sách (tự tính); chuỗi: Hành chính đã nhập hoặc hợp đồng đã lưu
  const [depositInput, setDepositInput] = useState(
    contract?.depositAmount != null ? String(contract.depositAmount) : null,
  )
  const [schedule, setSchedule] = useState(contract?.arrivalSchedule ?? [])
  const [roomTypes, setRoomTypes] = useState(null)
  const [roomTypeId, setRoomTypeId] = useState(() => {
    const id = contract ? contract.roomTypeId : defaults.roomTypeId
    return id ? String(id) : ''
  })
  // Dịch vụ đi kèm gập sẵn; sửa hợp đồng đã có dòng ngoài chăm sóc, phí lưu trú thì mở sẵn
  const [extrasOpen, setExtrasOpen] = useState(() => (contract?.services ?? []).length > 2)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const [confirmClose, setConfirmClose] = useState(false)
  const form = useRef(null)
  const allocated = useAllocatedBed(residentId, null)

  useEffect(() => {
    getServices({ query: {} })
      .then(({ data }) => setCatalog(data.filter((s) => s.status === 'ACTIVE')))
      .catch(() => setCatalog([]))
    getRoomTypes({ query: {} })
      .then(({ data }) => setRoomTypes(data.filter((t) => t.status === 'ACTIVE')))
      .catch(() => setRoomTypes([]))
    if (editing)
      getContractsById({ path: { id: contract.id } })
        .then(({ etag: tag }) => setEtag(tag))
        .catch((e) => setFailure(problemOf(e)))
  }, [editing, contract?.id])

  const startDate = isoDate(startText)
  const endDate = isoDate(endText)
  // Ngày bắt đầu của giường đã phân bổ: hợp đồng nội trú không được bắt đầu sớm hơn (004 FR-021)
  const bedStart = allocated.bed?.startDate ?? null
  // 004 FR-019: hợp đồng nội trú ghi loại phòng (giường do phân bổ của 003); chỉ loại phòng phục vụ loại lưu trú đã chọn
  const residential = type === 'LONG_TERM_RESIDENTIAL' || type === 'SHORT_TERM_RESIDENTIAL'
  const bedError =
    residential &&
    bedStart &&
    startDate &&
    startDate < bedStart &&
    `Giường bắt đầu ${displayDate(bedStart)}; ngày bắt đầu hợp đồng không được sớm hơn (FR-021)`
  const roomTypeOptions = (roomTypes ?? [])
    .filter((t) => (type === 'SHORT_TERM_RESIDENTIAL' ? t.servesShortTerm : t.servesLongTerm))
    .sort((a, b) => (a.standardBeds ?? 99) - (b.standardBeds ?? 99))
    .map((t) => [String(t.id), t.name])
  const periodOptions = BILLING_PERIODS.filter(([value]) => (PERIODS_OF[type] ?? RESIDENTIAL_PERIODS).includes(value))
  const errors = {
    resident: !residentId && 'Chọn người cao tuổi',
    type: !type && 'Chọn loại lưu trú',
    start: !startText.trim() ? 'Nhập ngày bắt đầu' : !startDate ? 'Nhập ngày có thật, dạng DD/MM/YYYY' : bedError,
    end: endText.trim()
      ? !endDate
        ? 'Nhập ngày có thật, dạng DD/MM/YYYY'
        : startDate && endDate < startDate && 'Ngày kết thúc không trước ngày bắt đầu'
      : type === 'SHORT_TERM_RESIDENTIAL' && 'Nội trú ngắn ngày cần ngày kết thúc',
    level: !level && 'Chọn mức chăm sóc',
    roomType: residential && !roomTypeId && 'Chọn loại phòng',
    period: type && !period && 'Chọn kỳ tính phí lưu trú',
    deposit: !depositChoice && 'Chọn đặt cọc',
  }
  const shown = (key) => (submitted ? errors[key] || null : null)

  function changeType(next) {
    setType(next)
    // Kỳ đã chọn không hợp loại lưu trú mới thì bỏ, người dùng chọn lại (không tự chọn thay)
    if (period && !(PERIODS_OF[next] ?? RESIDENTIAL_PERIODS).includes(period)) setPeriod('')
    if (next === 'DAY_CARE') setRoomTypeId('')
  }

  // Q-300, 6.4, Q-426: dịch vụ theo lựa chọn mức, loại phòng, loại lưu trú; dòng cũ của mức, loại phòng khác bị thay khi lưu
  const services = catalog ?? []
  const careService = services.find((s) => s.type === 'CARE' && s.careLevelCode === level)
  const feeService = residential
    ? services.find((s) => s.type === 'RESIDENCY_FEE' && s.roomTypeId === Number(roomTypeId))
    : type === 'DAY_CARE'
      ? services.find((s) => s.type === 'DAY_CARE_SESSION')
      : undefined
  const fixedServices = [careService, feeService].filter(Boolean)
  const fixedTypes = ['CARE', 'RESIDENCY_FEE', 'DAY_CARE_SESSION']
  // Dịch vụ đi kèm: bốn loại của Q-426; hợp đồng nháp cũ có dòng loại khác thì vẫn hiện để bỏ được
  const extraServices = services.filter(
    (s) => REGISTRABLE_TYPES.includes(s.type) || (picked.has(s.id) && !fixedTypes.includes(s.type)),
  )
  const prices = usePriceVersions([...fixedServices, ...extraServices].map((s) => s.id))
  const priceDate = startDate ?? vietnamToday()
  const priceOf = (s) => (prices[s.id] ? priceOn(prices[s.id], priceDate) : undefined)
  const summaryLines = [...fixedServices, ...extraServices.filter((s) => picked.has(s.id))].map((s) => ({
    id: s.id,
    name: s.name,
    billingPeriod: s.billingPeriod,
    price: priceOf(s),
  }))
  const monthlyFixed = fixedServices.filter((s) => s.billingPeriod === 'MONTH')
  const standardDeposit =
    monthlyFixed.length > 0 && monthlyFixed.every((s) => priceOf(s) !== undefined)
      ? DEPOSIT_MONTHS * monthlyFixed.reduce((sum, s) => sum + priceOf(s), 0)
      : null
  const deposit = depositInput ?? (standardDeposit != null ? String(standardDeposit) : '')
  errors.depositAmount = depositChoice === 'yes' && !(Number(deposit) > 0) && 'Nhập khoản đặt cọc'
  const depositSummary =
    depositChoice === 'no'
      ? 'Không yêu cầu'
      : depositChoice === 'yes' && Number(deposit) > 0
        ? money(Number(deposit))
        : null

  const snapshot = JSON.stringify([
    residentId,
    type,
    startText,
    endText,
    level,
    period,
    [...picked],
    depositChoice,
    depositInput,
    schedule,
    roomTypeId,
  ])
  const [initialSnapshot] = useState(snapshot)
  const dirty = snapshot !== initialSnapshot

  function requestClose() {
    if (busy) return
    if (dirty) setConfirmClose(true)
    else onClose()
  }

  async function save(event) {
    event.preventDefault()
    setSubmitted(true)
    // danh mục chưa tải xong thì chưa biết dòng nào là dịch vụ theo mức, theo loại phòng
    if (Object.values(errors).some(Boolean)) {
      requestAnimationFrame(() => {
        const first = form.current?.querySelector('[data-invalid="true"]')
        first?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        first?.querySelector('input, button')?.focus({ preventScroll: true })
      })
      return
    }
    if (catalog === null) return
    setBusy(true)
    setFailure(null)
    const body = {
      residentId: Number(residentId),
      residenceType: type,
      startDate,
      ...(endDate && { endDate }),
      careLevel: level,
      residencyFeeBillingPeriod: period,
      services: [
        ...fixedServices.map((s) => ({ serviceId: s.id, inPackage: false })),
        ...extraServices.filter((s) => picked.has(s.id)).map((s) => ({ serviceId: s.id, inPackage: false })),
      ],
      noDepositRequired: depositChoice === 'no',
      ...(depositChoice === 'yes' && { depositAmount: Number(deposit) }),
      ...(type === 'DAY_CARE' && { arrivalSchedule: schedule }),
      ...(residential && { roomTypeId: Number(roomTypeId) }),
    }
    try {
      if (editing) {
        await putContractsById({ path: { id: contract.id }, headers: { ...newKey(), 'If-Match': etag }, body })
        onDone('Đã sửa hợp đồng nháp')
      } else {
        const { data } = await postContracts({ headers: newKey(), body })
        onDone('Đã lập hợp đồng nháp', data?.contract)
      }
    } catch (e) {
      setFailure(problemOf(e))
    } finally {
      setBusy(false)
    }
  }

  function toggleService(id) {
    setPicked((current) => {
      const next = new Map(current)
      if (next.has(id)) next.delete(id)
      else next.set(id, false)
      return next
    })
  }

  const pickedExtras = extraServices.filter((s) => picked.has(s.id)).length
  const showExtras = extrasOpen

  return (
    <Sheet open onOpenChange={(next) => !next && requestClose()}>
      <SheetContent side="center" className="gap-0 p-0 sm:max-w-5xl">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 flex-col gap-1 border-b px-6 pt-6 pb-4 pr-12">
            <SheetTitle className="type-title">{editing ? 'Sửa hợp đồng nháp' : 'Lập hợp đồng nháp'}</SheetTitle>
            {fixedResident && (
              <SheetDescription>
                {[residentName ?? `Mã ${residentId}`, residentCode].filter(Boolean).join(' · ')}
              </SheetDescription>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_18rem]">
              <form
                id={FORM_ID}
                ref={form}
                onSubmit={save}
                noValidate
                aria-busy={busy || undefined}
                aria-label={editing ? 'Sửa hợp đồng nháp' : 'Lập hợp đồng nháp'}
              >
                <FieldGroup className="gap-0">
                  <Section number="01" title="Lưu trú">
                    {!fixedResident && (
                      <ResidentSelect
                        id="contract-resident"
                        value={residentId}
                        onChange={setResidentId}
                        error={shown('resident')}
                        onFailure={(e) => setFailure(problemOf(e))}
                      />
                    )}
                    <Choices
                      label="Loại lưu trú"
                      required
                      options={RESIDENCE_TYPES}
                      value={type}
                      onChange={changeType}
                      error={shown('type')}
                    />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <DateInput
                        id="contract-start"
                        label="Ngày bắt đầu"
                        required
                        value={startText}
                        onChange={setStartText}
                        error={shown('start') || bedError || null}
                      />
                      <DateInput
                        id="contract-end"
                        label="Ngày kết thúc"
                        required={type === 'SHORT_TERM_RESIDENTIAL'}
                        value={endText}
                        onChange={setEndText}
                        error={shown('end')}
                      />
                    </div>
                    {type === 'DAY_CARE' && (
                      <Field>
                        <FieldLabel>Lịch đến theo tuần</FieldLabel>
                        {schedule.map((row, i) => (
                          <div key={i} className="flex flex-wrap items-center gap-2">
                            <select
                              aria-label={`Thứ trong tuần dòng ${i + 1}`}
                              className={SELECT}
                              value={row.dayOfWeek ?? ''}
                              onChange={(e) =>
                                setSchedule((s) =>
                                  s.map((r, j) => (j === i ? { ...r, dayOfWeek: Number(e.target.value) } : r)),
                                )
                              }
                            >
                              <option value="">Chọn thứ</option>
                              {DAYS.map(([d, text]) => (
                                <option key={d} value={d}>
                                  {text}
                                </option>
                              ))}
                            </select>
                            <Input
                              aria-label={`Giờ đến dòng ${i + 1}`}
                              type="time"
                              className="h-11 w-32"
                              value={row.arrivalTime ?? ''}
                              onChange={(e) =>
                                setSchedule((s) =>
                                  s.map((r, j) => (j === i ? { ...r, arrivalTime: e.target.value } : r)),
                                )
                              }
                            />
                            <Input
                              aria-label={`Giờ về dòng ${i + 1}`}
                              type="time"
                              className="h-11 w-32"
                              value={row.departureTime ?? ''}
                              onChange={(e) =>
                                setSchedule((s) =>
                                  s.map((r, j) => (j === i ? { ...r, departureTime: e.target.value } : r)),
                                )
                              }
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-11"
                              onClick={() => setSchedule((s) => s.filter((_, j) => j !== i))}
                            >
                              {`Bỏ dòng ${i + 1}`}
                            </Button>
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 self-start"
                          onClick={() => setSchedule((s) => [...s, {}])}
                        >
                          Thêm dòng lịch
                        </Button>
                      </Field>
                    )}
                  </Section>

                  <Section number="02" title="Mức, phòng">
                    <Choices
                      label="Mức chăm sóc"
                      required
                      options={CARE_LEVELS}
                      value={level}
                      onChange={setLevel}
                      error={shown('level')}
                    />
                    {residential && allocated.bed && (
                      <Info label="Giường đã phân bổ">{bedText(allocated.bed.location)}</Info>
                    )}
                    {residential && (
                      <Choices
                        label="Loại phòng"
                        required
                        options={roomTypeOptions}
                        value={roomTypeId}
                        onChange={setRoomTypeId}
                        error={shown('roomType')}
                      />
                    )}
                    {residential && roomTypeMismatch(allocated, roomTypeId) && (
                      <p className="type-body-sm rounded-md border border-warning-foreground/40 bg-warning px-3 py-2 text-warning-foreground">
                        {roomTypeMismatch(allocated, roomTypeId)}
                      </p>
                    )}
                    {type && (
                      <Choices
                        label="Kỳ tính phí lưu trú"
                        required
                        options={periodOptions}
                        value={period}
                        onChange={setPeriod}
                        error={shown('period')}
                      />
                    )}
                  </Section>

                  <Section number="03" title="Dịch vụ, đặt cọc">
                    {fixedServices.length > 0 && (
                      <ul aria-label="Theo mức chăm sóc, loại phòng" className="flex flex-col gap-1 type-body-sm">
                        {fixedServices.map((s) => (
                          <li key={s.id} className="flex flex-wrap justify-between gap-x-4">
                            <span>{s.name}</span>
                            <span className="tabular-nums text-muted-foreground">
                              {priceText(priceOf(s), s.billingPeriod)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {extraServices.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-auto justify-start gap-1 self-start px-0 type-label hover:bg-transparent"
                          aria-expanded={showExtras}
                          aria-controls="contract-extras"
                          onClick={() => setExtrasOpen((v) => !v)}
                        >
                          {`Dịch vụ đi kèm${pickedExtras ? ` (${pickedExtras})` : ''}`}
                          <ChevronDown
                            aria-hidden="true"
                            className={cn('size-4 transition-transform', showExtras && 'rotate-180')}
                          />
                        </Button>
                        {showExtras && (
                          <ul id="contract-extras" className="flex flex-col">
                            {extraServices.map((s) => {
                              const on = picked.has(s.id)
                              return (
                                <li
                                  key={s.id}
                                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b py-3 last:border-0"
                                >
                                  <span className="flex min-w-0 flex-col">
                                    <span className="type-body-sm">{s.name}</span>
                                    <span className="type-caption tabular-nums text-muted-foreground">
                                      {priceText(priceOf(s), s.billingPeriod)}
                                    </span>
                                  </span>
                                  <span className="flex flex-wrap justify-end gap-2">
                                    <Toggle
                                      variant="outline"
                                      className="h-9 px-3"
                                      pressed={on}
                                      aria-label={`Chọn ${s.name}`}
                                      onPressedChange={() => toggleService(s.id)}
                                    >
                                      {on ? 'Đã chọn' : 'Chọn'}
                                    </Toggle>
                                  </span>
                                </li>
                              )
                            })}
                          </ul>
                        )}
                      </div>
                    )}
                    <Choices
                      label="Đặt cọc"
                      required
                      options={DEPOSIT_CHOICES}
                      value={depositChoice}
                      onChange={setDepositChoice}
                      error={shown('deposit')}
                    />
                    {depositChoice === 'yes' && (
                      <Field data-invalid={!!shown('depositAmount') || undefined} className="sm:max-w-xs">
                        <FieldLabel htmlFor="contract-deposit">
                          Khoản đặt cọc
                          <Required />
                        </FieldLabel>
                        <MoneyInput
                          id="contract-deposit"
                          value={deposit}
                          onChange={setDepositInput}
                          aria-required="true"
                          aria-invalid={!!shown('depositAmount') || undefined}
                        />
                        {shown('depositAmount') && <FieldError>{shown('depositAmount')}</FieldError>}
                      </Field>
                    )}
                  </Section>
                </FieldGroup>
              </form>
              <ContractCostSummary lines={summaryLines} deposit={depositSummary} />
            </div>
            {failure && (
              <div className="mt-4">
                <ProblemAlert problem={failure} />
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t px-6 py-4">
            <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={requestClose}>
              Hủy
            </Button>
            <Button type="submit" form={FORM_ID} className="h-11" disabled={busy || (editing && !etag)}>
              {busy ? 'Đang lưu…' : 'Lưu hợp đồng nháp'}
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
