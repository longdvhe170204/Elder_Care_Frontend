import { useEffect, useState } from 'react'
import {
  ArrowRight,
  ChevronDown,
  ClipboardCheck,
  FilePlus2,
  FileSignature,
  Pencil,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  X,
  XCircle,
} from 'lucide-react'
import {
  getApprovalRequestsById,
  getBeds,
  getContracts,
  getContractsByIdContent,
  getRoomTypes,
  getRooms,
  getResidents,
  getResidentsById,
  getResidentsByIdAssessments,
  getResidentsByResidentIdRelationships,
  getServices,
  postResidencyChangeRequests,
  postResidencyChangeRequestsByIdSendForConfirmation,
  putResidencyChangeRequestsById,
} from '@/api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { FileInput } from '@/common/FileInput'
import { ProblemAlert } from '@/common/ProblemAlert'
import { StatusBadge } from '@/common/StatusBadge'
import { formatDate, formatDateTime } from '@/common/dateTime'
import { openFile, uploadFile } from '@/common/files'
import { usePermissions } from '@/common/permissions/permissions'
import { problemOf } from '@/common/problem'
import {
  CARE_LEVELS,
  CHANGE_TYPES,
  RESIDENCE_TYPES,
  SELECT,
  arrivalScheduleLines,
  changeValueText,
  costItemLabel,
  labelOf,
  money,
  newKey,
  REQUEST_STATUS,
  plain,
} from './admissionLabels'
import {
  CONFIRMATION_METHODS,
  EVIDENCE_ACCEPT,
  EVIDENCE_HINTS,
  NOTE_MAX,
  NOTE_SUGGESTIONS,
  WEEKDAYS,
  isoDate,
  requiredCompanions,
  tomorrowIso,
  validateChange,
  validateConfirmation,
  confirmationState,
  ADDENDUM_STATUS,
  WARNING_LABELS,
  addendumNoText,
  assessedLevelFor,
  changeSteps,
  withCompanions,
  SERVICE_CHOICE_HINT,
  serviceChoices,
} from './changeRequestRules'
import { CHANGE_TYPE_ICONS, CHANGE_TYPE_TONES } from './changeTypeIcons'
import { ChangeProgress } from './ChangeProgress'
import { Choices, Info, ReasonField } from './FormParts'
import {
  ReasonCommandSheet,
  RepresentativeSelect,
  ResidentOpinions,
  SignatureSheet,
  SubmitSheet,
} from './ChangeActions'

// Yêu cầu thay đổi lưu trú (004 T047; US5, FR-037 → FR-047). Lập, sửa ở Nháp; gửi duyệt ở màn này hoặc màn Yêu cầu phê
// duyệt (api-000). Giá trị trước và ảnh hưởng chi phí do hệ thống điền (FR-038). Yêu cầu do Hành chính hoặc Bác sĩ lập chỉ
// gửi Quản lý viện duyệt được khi Hành chính đã xác nhận với người đại diện, kèm bằng chứng (chủ dự án yêu cầu 2026-11-20).

// Họ tên người thân theo quan hệ của người cao tuổi (kể cả quan hệ đã kết thúc); null khi chưa tải hoặc không xem được
function useFamilyMemberName(residentId, familyMemberId) {
  const [name, setName] = useState(null)
  useEffect(() => {
    let live = true
    if (!residentId || !familyMemberId) return
    getResidentsByResidentIdRelationships({ path: { residentId } })
      .then(({ data }) => {
        const found = (data ?? []).find((r) => r.familyMember?.id === familyMemberId)
        if (live) setName(found?.familyMember?.fullName ?? null)
      })
      .catch(() => { })
    return () => {
      live = false
    }
  }, [residentId, familyMemberId])
  return name
}

// Tóm tắt xác nhận với người đại diện; recordedBy là tên ở api-004, là mã tài khoản trong nội dung thô của api-000.
// Người đã xác nhận (R16) lấy tên theo quan hệ của người cao tuổi; không xem được tên thì hiện mã.
function confirmationText(c, confirmerName) {
  const by = typeof c.recordedBy === 'string' ? `, ghi bởi ${c.recordedBy}` : ''
  const confirmer = c.representativeFamilyMemberId
    ? `; người đại diện xác nhận: ${confirmerName ?? `người thân mã ${c.representativeFamilyMemberId}`}`
    : ''
  return `${labelOf(CONFIRMATION_METHODS, c.method)}, ngày ${formatDate(c.confirmedOn)}${by}${confirmer}`
}

// Nội dung thay đổi (trước, sau theo loại) và ảnh hưởng chi phí; dùng ở màn này và màn Yêu cầu phê duyệt (nội dung yêu cầu
// phê duyệt loại M02.RESIDENCY_CHANGE cùng các trường changeTypes, previousValue, newValue, costImpact).
// Một loại thay đổi dạng thẻ: biểu tượng, tên loại, giá trị trước và giá trị sau (variant "cards" của ChangeContent)
function ChangeRow({ type, content }) {
  const Icon = CHANGE_TYPE_ICONS[type]
  const [expanded, setExpanded] = useState(false)
  const prevLines = type === 'ARRIVAL_SCHEDULE' ? arrivalScheduleLines(content.previousValue) : []
  const nextLines = type === 'ARRIVAL_SCHEDULE' ? arrivalScheduleLines(content.newValue) : []
  const expandable = type === 'ARRIVAL_SCHEDULE' && (prevLines.length > 0 || nextLines.length > 0)
  return (
    <li className="flex flex-col gap-2.5 rounded-xl border border-border/80 bg-muted/40 p-3.5 transition-colors hover:border-primary/40 hover:bg-accent/30 shadow-2xs">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 type-label font-semibold text-foreground">
          {Icon && <Icon aria-hidden className={`size-4 shrink-0 ${CHANGE_TYPE_TONES[type]}`} />}
          {labelOf(CHANGE_TYPES, type)}
        </span>
        {expandable && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            {expanded ? 'Thu gọn' : 'Xem chi tiết'}
            <ChevronDown aria-hidden className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 type-body-sm tabular-nums">
        <span className="sr-only">Trước:</span>
        <span className="flex-1 rounded-md bg-card px-2.5 py-1.5 text-center text-muted-foreground ring-1 ring-border shadow-2xs font-medium truncate">
          {changeValueText(type, content.previousValue)}
        </span>
        <ArrowRight aria-hidden className="size-4 shrink-0 text-primary" />
        <span className="sr-only">Sau:</span>
        <span className="flex-1 rounded-md bg-primary px-2.5 py-1.5 text-center font-semibold text-primary-foreground shadow-sm truncate">
          {changeValueText(type, content.newValue)}
        </span>
      </div>
      {expandable && expanded && (
        <div className="grid gap-2 rounded-lg border border-border/70 bg-card/80 p-2.5 text-xs sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-muted-foreground">Lịch hiện tại</span>
            {prevLines.length > 0 ? (
              <ul className="flex flex-col gap-0.5 text-muted-foreground tabular-nums">
                {prevLines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            ) : (
              <span className="text-muted-foreground">Chưa có lịch</span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-foreground">Lịch muốn đổi</span>
            {nextLines.length > 0 ? (
              <ul className="flex flex-col gap-0.5 font-medium text-foreground tabular-nums">
                {nextLines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            ) : (
              <span className="text-muted-foreground">Chưa có lịch</span>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

// variant "cards": khung chi tiết của màn Yêu cầu điều chỉnh hợp đồng; mặc định giữ dạng chữ cho màn duyệt và bản in
export function ChangeContent({ content, headingClassName = 'type-card-title', variant = 'plain' }) {
  const cards = variant === 'cards'
  const types = content.changeTypes ?? []
  const confirmation = content.representativeConfirmation
  const confirmerName = useFamilyMemberName(content.residentId, confirmation?.representativeFamilyMemberId)
  return (
    <>
      <section className={`flex flex-col ${cards ? 'gap-3' : 'gap-2'}`}>
        <h3 className={headingClassName}>Nội dung thay đổi</h3>
        <ul className="flex flex-col gap-2">
          {types.map((type) =>
            cards ? (
              <ChangeRow key={type} type={type} content={content} />
            ) : (
              <li key={type} className="flex flex-col">
                <span className="type-body-sm">{labelOf(CHANGE_TYPES, type)}</span>
                <span className="type-caption text-muted-foreground">
                  {type === 'ARRIVAL_SCHEDULE'
                    ? `Trước: ${arrivalScheduleLines(content.previousValue).join(', ') || 'Chưa có lịch'}; sau: ${arrivalScheduleLines(content.newValue).join(', ') || 'Chưa có lịch'}`
                    : `Trước: ${changeValueText(type, content.previousValue)}; sau: ${changeValueText(type, content.newValue)}`}
                </span>
              </li>
            ),
          )}
        </ul>
      </section>
      {content.costImpact?.length > 0 && (
        <section className={`flex flex-col ${cards ? 'gap-3' : 'gap-2'}`}>
          <h3 className={headingClassName}>Ảnh hưởng chi phí</h3>
          <ul className="flex flex-col gap-1.5">
            {content.costImpact.map((c) =>
              cards ? (
                <li
                  key={c.item}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/80 bg-card p-3 shadow-2xs type-body-sm tabular-nums"
                >
                  <span className="font-medium text-foreground">{costItemLabel(c.item)}</span>
                  <span className="flex items-center gap-2 whitespace-nowrap shrink-0">
                    <span className="text-muted-foreground line-through">{money(c.previousUnitPrice)}</span>
                    <ArrowRight aria-hidden className="size-4 text-primary shrink-0" />
                    <span className="rounded-md bg-success/15 px-2 py-0.5 font-bold text-success-foreground border border-success/30">
                      {money(c.newUnitPrice)}
                    </span>
                  </span>
                </li>
              ) : (
                <li key={c.item} className="type-body-sm tabular-nums">
                  {`${costItemLabel(c.item)}: ${money(c.previousUnitPrice)} → ${money(c.newUnitPrice)}`}
                </li>
              ),
            )}
          </ul>
        </section>
      )}
      {confirmation && (
        <section className="flex flex-col gap-1">
          <h3 className={headingClassName}>Xác nhận với người đại diện</h3>
          <p className="type-body-sm">{confirmationText(confirmation, confirmerName)}</p>
          {confirmation.note && <p className="type-caption text-muted-foreground">{confirmation.note}</p>}
          {confirmation.evidenceFileId && (
            <Button
              variant="outline"
              className="h-11 self-start"
              onClick={() => openFile(confirmation.evidenceFileId).catch(() => { })}
            >
              Xem bằng chứng
            </Button>
          )}
        </section>
      )}
    </>
  )
}

// Lần gửi người đại diện xác nhận trên ứng dụng mới nhất (FR-043c) thành một câu
function confirmationRequestText(r) {
  switch (r.status) {
    case 'AWAITING':
      return `Đã gửi người đại diện xác nhận trên ứng dụng lúc ${formatDateTime(r.sentAt)}, đang chờ trả lời.`
    case 'ACCEPTED':
      return `Người đại diện đã đồng ý trên ứng dụng lúc ${formatDateTime(r.respondedAt)}.`
    case 'DECLINED':
      return `Người đại diện không đồng ý lúc ${formatDateTime(r.respondedAt)}. Lý do: ${r.declineReason ?? '—'}`
    case 'SUPERSEDED':
      return 'Nội dung đã sửa sau lần gửi người đại diện: cần gửi lại để người đại diện xác nhận.'
    default:
      return null
  }
}

export function ChangeRequestView({
  request,
  etag,
  canUpdate,
  canConfirm,
  canApprove = false,
  canRecordOpinion = false,
  residentName,
  contractNumber,
  Title = 'h2',
  Description = 'p',
  onEdit,
  onConfirm,
  onReload,
  onSubmitted,
  onPrint,
}) {
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  // Khung lệnh đang mở: sign, submit, return-to-draft, cancel (BF-08 sửa đổi)
  const [action, setAction] = useState(null)

  // Lệnh duyệt viên được làm theo backend (api-000 allowedCommands): trả về nháp chỉ người duyệt được loại yêu cầu này,
  // hủy yêu cầu Đã duyệt chỉ người duyệt; quyền APPROVE của chức năng chưa đủ (Hành chính duyệt thay đổi nhỏ).
  const decidable = canApprove && ['PENDING_APPROVAL', 'APPROVED'].includes(request.status)
  const commandsKey = `${request.approvalRequestId}:${request.status}:${etag}`
  const [fetched, setFetched] = useState({ key: null, commands: [] })
  const allowed = decidable && fetched.key === commandsKey ? fetched.commands : []
  useEffect(() => {
    let live = true
    if (!decidable) return
    getApprovalRequestsById({ path: { id: request.approvalRequestId } })
      .then(({ data }) => live && setFetched({ key: commandsKey, commands: data?.allowedCommands ?? [] }))
      .catch(() => { })
    return () => {
      live = false
    }
  }, [decidable, request.approvalRequestId, commandsKey])

  const draft = request.status === 'DRAFT'
  const sent = request.confirmationRequest
  const state = confirmationState(request)
  const needsConfirmation = !!state && !state.done

  async function sendToRepresentative() {
    setBusy(true)
    setFailure(null)
    try {
      await postResidencyChangeRequestsByIdSendForConfirmation({
        path: { id: request.approvalRequestId },
        headers: { ...newKey(), 'If-Match': etag },
      })
      onReload()
    } catch (e) {
      setFailure(problemOf(e))
    } finally {
      setBusy(false)
    }
  }

  const addendum = request.addendum
  const pendingSignature = request.status === 'APPROVED' && addendum?.status === 'PENDING_SIGNATURE'
  const open = draft || request.status === 'PENDING_APPROVAL'
  const warnings = (request.warnings ?? []).map((w) => WARNING_LABELS[w] ?? w)
  const progress = changeSteps(request)
  const closeAction = () => setAction(null)
  const actionDone = (message, id) => {
    setAction(null)
    onSubmitted?.(message, id)
  }

  const showSendForConfirm = draft && canUpdate && canConfirm && needsConfirmation
  const showSignAddendum = pendingSignature && canConfirm
  const showSubmit = draft && canUpdate && !needsConfirmation
  const hasPrimary = showSendForConfirm || showSignAddendum || showSubmit

  const showEdit = draft && canUpdate
  const showRecordConfirm = draft && canUpdate && canConfirm && needsConfirmation
  const showPrint = Boolean(addendum && onPrint)
  const showReturnDraft = request.status === 'PENDING_APPROVAL' && allowed.includes('return-to-draft')
  const hasSecondary = showEdit || showRecordConfirm || showPrint || showReturnDraft
  const showCancel = (open && canUpdate) || (request.status === 'APPROVED' && allowed.includes('cancel'))
  const hasMainActions = hasPrimary || hasSecondary

  return (
    <div className="flex flex-col gap-5 [&_svg]:stroke-[2.5]">
      {/* Thanh tiến trình 5 bước nổi cố định trên đầu khung cuộn */}
      {progress && (
        <div className="sticky top-0 z-20 -mx-6 border-b border-border/60 bg-card/95 px-6 pt-2 pb-3 shadow-sm backdrop-blur-xs max-xl:pr-14">
          <ChangeProgress progress={progress} />
        </div>
      )}

      {/* Thông tin đầu mục */}
      <div className="flex flex-col gap-1.5 border-b border-border/60 pb-3">
        <Title className="type-title font-bold text-foreground">{residentName ?? `Yêu cầu mã ${request.approvalRequestId}`}</Title>
        <Description className="flex flex-col gap-1 type-body-sm text-muted-foreground leading-relaxed">
          <span className="block">
            Trạng thái:{' '}
            <strong className="font-semibold text-foreground">
              {REQUEST_STATUS[request.status] ?? request.status}
            </strong>
          </span>
          <span className="block">
            Ngày hiệu lực mong muốn:{' '}
            <strong className="font-semibold text-foreground tabular-nums">
              {formatDate(request.requestedEffectiveDate)}
            </strong>
          </span>
          {request.requestedBy && (
            <span className="block">
              Lập bởi: <strong className="font-semibold text-foreground">{request.requestedBy}</strong>
            </span>
          )}
          {contractNumber && (
            <span className="block">
              Hợp đồng: <strong className="font-semibold text-foreground tabular-nums">{contractNumber}</strong>
            </span>
          )}
        </Description>
      </div>

      {/* Nội dung chi tiết (cuộn chung cùng thông tin đầu mục và chân nút) */}
      <div className="flex flex-col gap-5">
        <div className="rounded-xl border-l-4 border-primary bg-muted/50 p-4 shadow-2xs">
          <Info label="Lý do">{request.reason}</Info>
        </div>
        <ChangeContent content={request} variant="cards" />
        {request.representativeConfirmation?.recordedAt && (
          <p className="type-caption text-muted-foreground">
            {`Ghi xác nhận lúc ${formatDateTime(request.representativeConfirmation.recordedAt)}`}
          </p>
        )}

        {request.minorChange && (
          <p className="type-body-sm">Thay đổi nhỏ: Hành chính duyệt được, không cần xác nhận với người đại diện.</p>
        )}
        {state && (draft || sent) && (
          <section className="flex flex-col gap-2" aria-label="Xác nhận của người đại diện">
            <div className="flex items-center justify-between gap-2">
              <h3 className="type-card-title font-bold text-foreground">Xác nhận của người đại diện</h3>
              {state.done ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success-foreground border border-success/30">
                  <span className="size-1.5 rounded-full bg-success-foreground" aria-hidden />
                  Đã xác nhận
                </span>
              ) : sent?.status === 'AWAITING' ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400 border border-amber-500/30">
                  <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" aria-hidden />
                  Chờ phản hồi
                </span>
              ) : sent?.status === 'DECLINED' ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-destructive/15 px-2.5 py-0.5 text-xs font-semibold text-destructive border border-destructive/30">
                  <span className="size-1.5 rounded-full bg-destructive" aria-hidden />
                  Từ chối
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-warning/20 px-2.5 py-0.5 text-xs font-semibold text-warning-foreground border border-warning/40">
                  <span className="size-1.5 rounded-full bg-warning-foreground" aria-hidden />
                  Chưa xác nhận
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2 rounded-xl border border-border/80 bg-card p-3.5 shadow-2xs">
              {state.attention && draft ? (
                <Alert variant="attention">
                  <AlertTitle>{state.text}</AlertTitle>
                </Alert>
              ) : (
                <p className="type-body-sm font-medium">{state.text}</p>
              )}
              {sent && (
                <div className="rounded-lg border border-border/60 bg-muted/40 p-2.5 type-body-sm">
                  {confirmationRequestText(sent)}
                </div>
              )}
              {draft && needsConfirmation && !canConfirm && (
                <p className="type-caption text-muted-foreground leading-relaxed">
                  Yêu cầu đã chuyển Hành chính: Hành chính xác nhận với người đại diện rồi gửi Quản lý viện duyệt.
                </p>
              )}
            </div>
          </section>
        )}
        {draft && request.representativeConfirmationRequired === false && !request.minorChange && (
          <p className="type-body-sm">
            Người đại diện tự gửi qua cổng: không cần xác nhận thêm, Hành chính hoàn thiện rồi gửi duyệt.
          </p>
        )}
        {request.assessedCareLevel && request.changeTypes?.includes('CARE_LEVEL') && (
          <p className="type-caption text-muted-foreground">
            {`Theo đánh giá ngày ${formatDate(request.assessedCareLevel.confirmedAt)}: mức ${labelOf(CARE_LEVELS, request.assessedCareLevel.careLevel)}`}
          </p>
        )}
        <ResidentOpinions request={request} canRecord={canRecordOpinion} warnings={warnings} onChanged={onReload} />
        {pendingSignature && (
          <Alert variant="attention">
            <AlertTitle>{`${addendumNoText(addendum.addendumNo)} chờ ký`}</AlertTitle>
            <AlertDescription>
              In phụ lục cho người đại diện ký rồi ghi nhận bản đã ký; chưa ký thì phụ lục chưa có hiệu lực.
            </AlertDescription>
          </Alert>
        )}
        {addendum ? (
          <section className="flex flex-col gap-1 rounded-xl border border-border/80 bg-card p-4 shadow-2xs" aria-label="Phụ lục hợp đồng">
            <h3 className="type-card-title">{addendumNoText(addendum.addendumNo)}</h3>
            <StatusBadge status={ADDENDUM_STATUS[addendum.status] ?? addendum.status} className="self-start" />
            <p className="type-body-sm">{`Ngày hiệu lực ${formatDate(addendum.effectiveDate)}`}</p>
            {addendum.signedDate && <p className="type-body-sm">{`Đã ký ngày ${formatDate(addendum.signedDate)}`}</p>}
            {addendum.signedFileId && (
              <Button variant="outline" className="h-11 self-start rounded-xl" onClick={() => openFile(addendum.signedFileId).catch(() => { })}>
                Xem bản đã ký
              </Button>
            )}
          </section>
        ) : (
          request.addendumId && <p className="type-body-sm">{`Đã tạo phụ lục mã ${request.addendumId}.`}</p>
        )}
        <p className="type-caption text-muted-foreground">{`Yêu cầu phê duyệt mã ${request.approvalRequestId}.`}</p>
        <ProblemAlert problem={failure} />
      </div>

      {/* Nhóm nút thao tác cuối form (cuộn cùng nội dung chi tiết) */}
      <div
        role="group"
        aria-label="Lệnh của yêu cầu"
        className="flex flex-col gap-2.5 border-t border-border/70 pt-4"
      >
        {hasPrimary && (
          <div className="flex flex-col gap-2">
            {showSendForConfirm && (
              <Button
                className="h-10 w-full gap-2 rounded-lg font-semibold shadow-xs transition-all hover:shadow-sm"
                disabled={busy || !etag}
                onClick={sendToRepresentative}
              >
                <Send aria-hidden className="size-4 stroke-[1.75]" />
                {sent ? 'Gửi lại cho người đại diện' : 'Gửi người đại diện xác nhận'}
              </Button>
            )}
            {showSignAddendum && (
              <Button
                className="h-10 w-full gap-2 rounded-lg font-semibold shadow-xs transition-all hover:shadow-sm"
                disabled={!etag}
                onClick={() => setAction('sign')}
              >
                <FileSignature aria-hidden className="size-4 stroke-[1.75]" />
                Ghi nhận phụ lục đã ký
              </Button>
            )}
            {showSubmit && (
              <Button
                className="h-10 w-full gap-2 rounded-lg font-semibold shadow-xs transition-all hover:shadow-sm"
                disabled={busy || !etag}
                onClick={() => setAction('submit')}
              >
                <Send aria-hidden className="size-4 stroke-[1.75]" />
                Gửi duyệt
              </Button>
            )}
          </div>
        )}

        {hasSecondary && (
          <div className="flex flex-wrap gap-2">
            {showEdit && (
              <Button
                variant="outline"
                className="h-10 flex-1 min-w-[160px] gap-1.5 rounded-lg border-border/80 bg-card px-3 text-[13px] font-medium shadow-2xs hover:bg-accent"
                onClick={() => onEdit(request)}
              >
                <Pencil aria-hidden className="size-4 stroke-[1.75]" />
                Sửa yêu cầu nháp
              </Button>
            )}
            {showRecordConfirm && (
              <Button
                variant="outline"
                className="h-10 flex-1 min-w-[160px] gap-1.5 rounded-lg border-border/80 bg-card px-3 text-[13px] font-medium shadow-2xs hover:bg-accent"
                onClick={() => onConfirm(request)}
              >
                <ClipboardCheck aria-hidden className="size-4 stroke-[1.75]" />
                Ghi xác nhận trực tiếp
              </Button>
            )}
            {showPrint && (
              <Button
                variant="outline"
                className="h-10 flex-1 min-w-[140px] gap-1.5 rounded-lg border-border/80 bg-card px-3 text-[13px] font-medium shadow-2xs hover:bg-accent"
                onClick={() => onPrint(request)}
              >
                <Printer aria-hidden className="size-4 stroke-[1.75]" />
                In phụ lục
              </Button>
            )}
            {showReturnDraft && (
              <Button
                variant="outline"
                className="h-10 flex-1 min-w-[140px] gap-1.5 rounded-lg border-border/80 bg-card px-3 text-[13px] font-medium shadow-2xs hover:bg-accent"
                disabled={!etag}
                onClick={() => setAction('return-to-draft')}
              >
                <RotateCcw aria-hidden className="size-4 stroke-[1.75]" />
                Trả về nháp
              </Button>
            )}
          </div>
        )}

        {/* Tải lại & Hủy yêu cầu */}
        <div className={`flex items-center justify-between ${hasMainActions ? 'border-t border-border/60 pt-2.5' : ''}`}>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={onReload}
          >
            <RefreshCw aria-hidden className="size-3.5 stroke-[1.75]" />
            Tải lại
          </Button>
          {showCancel && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 rounded-lg px-2 text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40"
              disabled={!etag}
              onClick={() => setAction('cancel')}
            >
              <XCircle aria-hidden className="size-3.5 stroke-[1.75]" />
              Hủy yêu cầu
            </Button>
          )}
        </div>
      </div>
      {action === 'sign' && <SignatureSheet request={request} etag={etag} onClose={closeAction} onDone={actionDone} />}
      {action === 'submit' && <SubmitSheet request={request} etag={etag} onClose={closeAction} onDone={actionDone} />}
      {(action === 'return-to-draft' || action === 'cancel') && (
        <ReasonCommandSheet command={action} request={request} etag={etag} onClose={closeAction} onDone={actionDone} />
      )}
    </div>
  )
}

const ARRIVAL_ROW = { dayOfWeek: 1, arrivalTime: '07:30', departureTime: '17:00' }

const REQUIRED = "after:ml-1 after:text-destructive after:content-['*']"

export function ChangeRequestSheet({ request, etag, onClose, onDone }) {
  const editing = !!request
  const [contracts, setContracts] = useState([])
  const [names, setNames] = useState({})
  const [catalog, setCatalog] = useState([])
  const [emptyBeds, setEmptyBeds] = useState(null)
  // Loại phòng của từng phòng (GET /rooms, /room-types): loại thay đổi "Loại phòng" (mã BED) chỉ dùng khi đổi sang loại
  // phòng khác (FR-043l, R22); null là chưa tải, {} là không đọc được (khi đó không lọc, backend vẫn kiểm)
  const [roomTypeOf, setRoomTypeOf] = useState(null)
  const [roomTypes, setRoomTypes] = useState([])
  const [newRoomTypeId, setNewRoomTypeId] = useState(null)
  // Phụ lục 27: trong những người lập được yêu cầu, chỉ Bác sĩ không xem được hợp đồng; Bác sĩ chọn người cao tuổi và chỉ
  // lập yêu cầu đổi mức chăm sóc (FR-039). Hành chính xác nhận với người đại diện, kèm bằng chứng (2026-11-20)
  const { status: permissionStatus, can } = usePermissions()
  const seesContracts = can('ADMISSION_CONTRACT_DEPOSIT', 'VIEW')
  const [residents, setResidents] = useState([])
  const [residentId, setResidentId] = useState(request?.residentId ? String(request.residentId) : '')
  const [contractId, setContractId] = useState(request ? String(request.contractId) : '')
  const [currentContent, setCurrentContent] = useState(null)
  const [contractSearch, setContractSearch] = useState('')
  const [residentSearch, setResidentSearch] = useState('')
  const [types, setTypes] = useState(request?.changeTypes ?? [])
  const [value, setValue] = useState(request?.newValue ?? {})
  const [date, setDate] = useState(request?.requestedEffectiveDate ?? '')
  const [reason, setReason] = useState(request?.reason ?? '')
  // Sửa nội dung thì xác nhận cũ (ghi trực tiếp hoặc người đại diện đã đồng ý trên ứng dụng) bị bỏ (FR-043a, FR-043c)
  const hadConfirmation = !!request?.representativeConfirmation || request?.confirmationRequest?.status === 'ACCEPTED'
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  // Lần đánh giá gần nhất đã xác nhận: mức chăm sóc mới lấy từ đây, không chọn tay (FR-043j)
  const [assessment, setAssessment] = useState(null)
  // Người lập không được xem Đánh giá (Phụ lục 27, ví dụ Hành chính: 403) thì chọn mức tay, backend kiểm FR-043j khi lưu
  const [assessmentHidden, setAssessmentHidden] = useState(false)

  useEffect(() => {
    if (permissionStatus === 'loading') return
    if (!seesContracts) {
      getResidents({ query: { status: 'IN_RESIDENCE' } })
        .then(({ data }) => setResidents(data.items ?? data))
        .catch((e) => setFailure(problemOf(e)))
      return
    }
    getContracts({ query: { status: ['ACTIVE'] } })
      .then(({ data }) => {
        const active = data.filter((c) => c.status === 'ACTIVE')
        setContracts(active)
        for (const c of active)
          getResidentsById({ path: { id: c.residentId } })
            .then(({ data: r }) => setNames((n) => ({ ...n, [c.residentId]: r.personalInfo?.fullName })))
            .catch(() => { })
      })
      .catch((e) => setFailure(problemOf(e)))
    getServices({ query: {} })
      .then(({ data }) => setCatalog(data ?? []))
      .catch(() => { })
  }, [permissionStatus, seesContracts])

  const activeTypes = seesContracts ? types : ['CARE_LEVEL']
  const wantsBed = activeTypes.includes('BED')

  // Giường mới chọn trong các giường đang Trống (bảng giường api-003), lọc theo loại phòng mới; chỉ tải khi chọn loại
  // thay đổi Loại phòng
  useEffect(() => {
    if (!wantsBed || emptyBeds !== null) return
    getBeds({ query: { status: ['EMPTY'] } })
      .then(({ data }) => setEmptyBeds(data.beds ?? []))
      .catch((e) => {
        setEmptyBeds([])
        setFailure(problemOf(e))
      })
    Promise.all([getRooms({ query: {} }), getRoomTypes({ query: {} })])
      .then(([rooms, types]) => {
        const names = Object.fromEntries((types.data ?? []).map((t) => [t.id, t.name]))
        setRoomTypes(types.data ?? [])
        setRoomTypeOf(
          Object.fromEntries((rooms.data ?? []).map((r) => [r.id, { id: r.roomTypeId, name: names[r.roomTypeId] }])),
        )
      })
      .catch(() => setRoomTypeOf({}))
  }, [wantsBed, emptyBeds])

  const contract = contracts.find((c) => String(c.id) === contractId)
  useEffect(() => {
    let live = true
    if (!contract?.id) return undefined
    getContractsByIdContent({ path: { id: contract.id }, query: { date: isoDate() } })
      .then(({ data }) => {
        if (live) setCurrentContent(data ?? null)
      })
      .catch(() => {
        if (live) setCurrentContent(null)
      })
    return () => {
      live = false
    }
  }, [contract?.id])
  // Nội dung hiệu lực tại hôm nay (sau các phụ lục đã áp dụng); fallback về hợp đồng gốc nếu chưa tải xong
  const effectiveContract = contract
    ? currentContent?.contractId === contract.id && currentContent.content
      ? { ...contract, ...currentContent.content }
      : contract
    : undefined
  const filteredContracts = contracts.filter((c) => {
    if (String(c.id) === contractId) return true
    if (!contractSearch.trim()) return true
    const kw = plain(contractSearch.trim())
    const resName = names[c.residentId] ?? `Mã ${c.residentId}`
    return plain(resName).includes(kw) || plain(c.contractNumber).includes(kw)
  })
  const filteredResidents = residents.filter((r) => {
    if (String(r.id) === residentId) return true
    if (!residentSearch.trim()) return true
    const kw = plain(residentSearch.trim())
    const resName = r.personalInfo?.fullName ?? `Mã ${r.id}`
    return plain(resName).includes(kw)
  })
  const contractServiceIds = new Set((effectiveContract?.services ?? []).map((s) => s.serviceId))
  // Dấu thuộc gói theo hợp đồng hiện hành (R19): chỉ dòng có trong hợp đồng mang dấu thuộc gói
  const inPackageIds = new Set((effectiveContract?.services ?? []).filter((s) => s.inPackage).map((s) => s.serviceId))
  const subjectId = effectiveContract?.residentId ?? (residentId ? Number(residentId) : null)

  // Loại phòng (FR-043l, R22): chỉ các loại phòng khác loại phòng của hợp đồng và còn giường trống; chuyển sang giường cùng
  // loại phòng dùng Chuyển giường trực tiếp (7.4), không lập yêu cầu
  const knowsRoomTypes = !!roomTypeOf && Object.keys(roomTypeOf).length > 0
  const roomTypeOfBed = (bed) => roomTypeOf?.[bed?.location?.roomId]?.id ?? null
  const currentRoomTypeId = effectiveContract?.roomTypeId ?? null
  const otherRoomTypes = roomTypes.filter(
    (t) => t.id !== currentRoomTypeId && (emptyBeds ?? []).some((b) => roomTypeOfBed(b) === t.id),
  )
  const chosenRoomTypeId =
    newRoomTypeId ?? (value.newBedId ? roomTypeOfBed((emptyBeds ?? []).find((b) => b.id === value.newBedId)) : null)

  useEffect(() => {
    let live = true
    if (!subjectId) return
    getResidentsByIdAssessments({ path: { id: subjectId } })
      .then(({ data }) => {
        const confirmed = (data ?? [])
          .filter((a) => a.status === 'CONFIRMED' && a.confirmedAt)
          .sort((a, b) => (a.confirmedAt < b.confirmedAt ? 1 : -1))
        if (live) {
          setAssessment(confirmed[0] ?? null)
          setAssessmentHidden(false)
        }
      })
      .catch(() => {
        if (live) {
          setAssessment(null)
          setAssessmentHidden(true)
        }
      })
    return () => {
      live = false
    }
  }, [subjectId])

  const assessedLevel = assessedLevelFor(assessment, effectiveContract)
  const careLevelBlocked = !assessedLevel && !assessmentHidden

  const set = (patch) => setValue((v) => ({ ...v, ...patch }))
  const toggleType = (type) => {
    const adding = !types.includes(type)
    setTypes((t) => (adding ? [...t, type] : t.filter((x) => x !== type)))
    if (
      adding &&
      type === 'ARRIVAL_SCHEDULE' &&
      !value.arrivalSchedule?.length &&
      effectiveContract?.residenceType === 'DAY_CARE' &&
      effectiveContract?.arrivalSchedule?.length > 0
    ) {
      set({
        arrivalSchedule: effectiveContract.arrivalSchedule.map((r) => ({
          ...(r.dayOfWeek != null ? { dayOfWeek: r.dayOfWeek } : {}),
          ...(r.date ? { date: r.date } : {}),
          arrivalTime: String(r.arrivalTime ?? '').slice(0, 5),
          departureTime: String(r.departureTime ?? '').slice(0, 5),
        })),
      })
    }
  }
  const pickedServices = value.services ?? []
  const lineOf = (id) => pickedServices.find((s) => s.serviceId === id)
  const toggleService = (id) =>
    set({
      services: lineOf(id)
        ? pickedServices.filter((s) => s.serviceId !== id)
        : [
          ...pickedServices,
          { serviceId: id, action: contractServiceIds.has(id) ? 'REMOVE' : 'ADD' },
        ],
    })
  const setRow = (i, patch) =>
    set({ arrivalSchedule: (value.arrivalSchedule ?? []).map((r, j) => (j === i ? { ...r, ...patch } : r)) })

  // Mức chăm sóc mới luôn là mức theo đánh giá (FR-043j), không chọn tay
  const effectiveValue = assessedLevel && !assessmentHidden ? { ...value, careLevel: assessedLevel } : value
  const changeErrors = validateChange({ types: activeTypes, value: effectiveValue, date, contract: effectiveContract })
  const errors = {
    contract: seesContracts ? !contractId && 'Chọn hợp đồng' : !residentId && 'Chọn người cao tuổi',
    ...changeErrors,
    newRoomTypeId: activeTypes.includes('BED') && knowsRoomTypes && !chosenRoomTypeId && 'Chọn loại phòng mới',
    reason: !reason.trim() && 'Nhập lý do',
  }
  const shown = (key) => (submitted ? errors[key] || null : null)
  const companions = activeTypes.includes('RESIDENCE_TYPE')
    ? requiredCompanions(effectiveContract?.residenceType, value.residenceType)
    : []
  // Sửa nháp: giường đã chọn có thể không còn Trống, vẫn hiện để không mất giá trị
  const candidateBeds = knowsRoomTypes
    ? (emptyBeds ?? []).filter((b) => chosenRoomTypeId && roomTypeOfBed(b) === chosenRoomTypeId)
    : (emptyBeds ?? [])
  const bedOptions =
    value.newBedId && emptyBeds && !emptyBeds.some((b) => b.id === value.newBedId)
      ? [{ id: value.newBedId, location: { label: `Giường mã ${value.newBedId} (không còn trống)` } }, ...candidateBeds]
      : candidateBeds

  async function save() {
    setSubmitted(true)
    if (Object.values(errors).some(Boolean)) return
    setBusy(true)
    setFailure(null)
    // Chỉ gửi phần giá trị mới của các loại đã chọn
    const keep = {
      RESIDENCE_TYPE: ['residenceType'],
      CARE_LEVEL: ['careLevel'],
      DURATION: ['endDate'],
      BED: ['newBedId'],
      SERVICE: ['services'],
      ARRIVAL_SCHEDULE: ['arrivalSchedule'],
    }
    const newValue = {}
    for (const type of activeTypes)
      for (const key of keep[type]) if (effectiveValue[key] !== undefined) newValue[key] = effectiveValue[key]
    const body = {
      ...(seesContracts ? { contractId: Number(contractId) } : { residentId: Number(residentId) }),
      changeTypes: activeTypes,
      newValue,
      requestedEffectiveDate: date,
      reason: reason.trim(),
    }
    try {
      if (editing) {
        await putResidencyChangeRequestsById({
          path: { id: request.approvalRequestId },
          headers: { ...newKey(), 'If-Match': etag },
          body,
        })
        onDone('Đã sửa yêu cầu nháp', request.approvalRequestId)
      } else {
        const { data } = await postResidencyChangeRequests({ headers: newKey(), body })
        onDone('Đã lập yêu cầu điều chỉnh hợp đồng ở Nháp', data.approvalRequestId)
      }
    } catch (e) {
      setFailure(problemOf(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="flex h-full flex-col p-0 overflow-hidden sm:max-w-lg [&_svg]:stroke-[2.5]">
        {/* 1. HEADER (Cố định trên cùng) */}
        <div className="shrink-0 flex flex-col gap-1.5 p-6 pb-4 border-b border-border/60">
          <div className="flex items-center gap-3 pr-10">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
              <FilePlus2 aria-hidden className="size-5" />
            </span>
            <SheetTitle className="type-title text-primary">
              {editing ? 'Sửa yêu cầu điều chỉnh hợp đồng' : 'Lập yêu cầu điều chỉnh hợp đồng'}
            </SheetTitle>
          </div>
          <SheetDescription className="text-xs text-muted-foreground leading-relaxed">
            {seesContracts
              ? 'Yêu cầu ở Nháp; giá trị trước và ảnh hưởng chi phí do hệ thống điền khi lưu. Lưu xong, mở yêu cầu để gửi người đại diện xác nhận trên ứng dụng hoặc ghi xác nhận trực tiếp, rồi gửi Quản lý viện duyệt.'
              : 'Yêu cầu ở Nháp và chuyển Hành chính xác nhận với người đại diện trước khi gửi Quản lý viện duyệt.'}
          </SheetDescription>
        </div>

        {/* 2. BODY (Khu vực cuộn độc lập) */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          <FieldGroup>
          {!seesContracts && (
            <Field data-invalid={!!shown('contract') || undefined}>
              <FieldLabel htmlFor="change-resident" className={REQUIRED}>
                Người cao tuổi
              </FieldLabel>
              {!editing && (
                <div className="mb-2 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                    <Input
                      id="resident-search-query"
                      aria-label="Tìm kiếm người cao tuổi"
                      placeholder="Tìm theo họ tên người cao tuổi..."
                      className="h-10 rounded-xl pl-9 pr-8 text-xs bg-card"
                      value={residentSearch}
                      onChange={(e) => setResidentSearch(e.target.value)}
                    />
                    {residentSearch && (
                      <button
                        type="button"
                        aria-label="Xóa tìm kiếm"
                        onClick={() => setResidentSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 shrink-0 rounded-xl px-3.5 text-xs font-medium"
                    onClick={() => {
                      if (filteredResidents.length === 1) {
                        setResidentId(String(filteredResidents[0].id))
                      }
                    }}
                  >
                    Tìm
                  </Button>
                </div>
              )}
              <select
                id="change-resident"
                className={SELECT}
                value={residentId}
                disabled={editing}
                onChange={(e) => setResidentId(e.target.value)}
              >
                <option value="">
                  {filteredResidents.length === 0
                    ? 'Không tìm thấy người cao tuổi'
                    : residentSearch
                    ? `Người cao tuổi phù hợp (${filteredResidents.length})`
                    : 'Người cao tuổi đang lưu trú'}
                </option>
                {filteredResidents.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.personalInfo?.fullName ?? `Mã ${r.id}`}
                  </option>
                ))}
              </select>
              {shown('contract') && <FieldError>{shown('contract')}</FieldError>}
            </Field>
          )}
          {seesContracts && (
            <Field data-invalid={!!shown('contract') || undefined}>
              <FieldLabel htmlFor="change-contract" className={REQUIRED}>
                Hợp đồng
              </FieldLabel>
              {!editing && (
                <div className="mb-2 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                    <Input
                      id="contract-search-query"
                      aria-label="Tìm kiếm hợp đồng"
                      placeholder="Tìm theo họ tên hoặc số hợp đồng..."
                      className="h-10 rounded-xl pl-9 pr-8 text-xs bg-card"
                      value={contractSearch}
                      onChange={(e) => setContractSearch(e.target.value)}
                    />
                    {contractSearch && (
                      <button
                        type="button"
                        aria-label="Xóa tìm kiếm"
                        onClick={() => setContractSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 shrink-0 rounded-xl px-3.5 text-xs font-medium"
                    onClick={() => {
                      if (filteredContracts.length === 1) {
                        setContractId(String(filteredContracts[0].id))
                      }
                    }}
                  >
                    Tìm
                  </Button>
                </div>
              )}
              <select
                id="change-contract"
                className={SELECT}
                value={contractId}
                disabled={editing}
                onChange={(e) => {
                  setContractId(e.target.value)
                  setCurrentContent(null)
                  setNewRoomTypeId(null)
                  setValue({})
                }}
              >
                <option value="">
                  {filteredContracts.length === 0
                    ? 'Không tìm thấy hợp đồng phù hợp'
                    : contractSearch
                    ? `Hợp đồng phù hợp (${filteredContracts.length})`
                    : 'Hợp đồng đang hiệu lực'}
                </option>
                {filteredContracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {`${names[c.residentId] ?? `Mã ${c.residentId}`}, ${c.contractNumber}`}
                  </option>
                ))}
              </select>
              {effectiveContract && (
                <div className="mt-2 flex flex-col gap-1 rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  {effectiveContract.residenceType && (
                    <div>
                      Hiện tại:{' '}
                      <strong className="font-semibold text-foreground">
                        {labelOf(RESIDENCE_TYPES, effectiveContract.residenceType)}
                      </strong>
                    </div>
                  )}
                  {effectiveContract.careLevel && (
                    <div>
                      Mức chăm sóc:{' '}
                      <strong className="font-semibold text-foreground">
                        {labelOf(CARE_LEVELS, effectiveContract.careLevel)}
                      </strong>
                    </div>
                  )}
                  {effectiveContract.startDate && (
                    <div>
                      Ngày bắt đầu:{' '}
                      <strong className="font-semibold text-foreground tabular-nums">
                        {formatDate(effectiveContract.startDate)}
                      </strong>
                    </div>
                  )}
                  {(effectiveContract.currentEndDate ?? effectiveContract.endDate) && (
                    <div>
                      Ngày kết thúc:{' '}
                      <strong className="font-semibold text-foreground tabular-nums">
                        {formatDate(effectiveContract.currentEndDate ?? effectiveContract.endDate)}
                      </strong>
                    </div>
                  )}
                </div>
              )}
              {shown('contract') && <FieldError>{shown('contract')}</FieldError>}
            </Field>
          )}

          {seesContracts && (
            <Field data-invalid={!!shown('types') || undefined}>
              <FieldLabel className={REQUIRED}>Loại thay đổi</FieldLabel>
              <div className="flex flex-col gap-1">
                {CHANGE_TYPES.map(([code, text]) => {
                  const blocked = code === 'CARE_LEVEL' && careLevelBlocked && !types.includes(code)
                  const Icon = CHANGE_TYPE_ICONS[code]
                  return (
                    <div key={code} className="flex flex-col">
                      <label className="flex items-center gap-3 rounded-lg px-3 py-2 type-body-sm has-[:checked]:bg-accent has-[:checked]:font-medium has-[:checked]:ring-1 has-[:checked]:ring-primary/50 transition-colors hover:bg-accent/50">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          disabled={blocked}
                          checked={types.includes(code)}
                          onChange={() => toggleType(code)}
                        />
                        <Icon aria-hidden className={`size-4 ${CHANGE_TYPE_TONES[code]}`} />
                        {text}
                      </label>
                      {blocked && (
                        <span className="type-caption text-muted-foreground">
                          Chưa có lần đánh giá lại ra mức khác mức của hợp đồng; Bác sĩ đánh giá lại trước.
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
              {shown('types') && <FieldError>{shown('types')}</FieldError>}
            </Field>
          )}

          {activeTypes.includes('RESIDENCE_TYPE') && (
            <>
              <Choices
                label="Loại lưu trú mới"
                options={RESIDENCE_TYPES.filter(([k]) => k !== effectiveContract?.residenceType)}
                value={value.residenceType ?? ''}
                onChange={(v) => {
                  // Tự chọn loại kèm bắt buộc của loại lưu trú mới, bỏ loại kèm của lựa chọn trước (FR-041)
                  setTypes((t) => withCompanions(t, effectiveContract?.residenceType, value.residenceType, v))
                  set({ residenceType: v })
                }}
                error={shown('residenceType')}
              />
              {companions.length > 0 && (
                <FieldDescription>
                  {`Loại này cần chọn kèm: ${companions
                    .map((t) => labelOf(CHANGE_TYPES, t))
                    .join(', ')} (kiểm khi duyệt).`}
                </FieldDescription>
              )}
            </>
          )}
          {activeTypes.includes('CARE_LEVEL') && assessmentHidden && (
            <>
              <Choices
                label="Mức chăm sóc mới"
                options={CARE_LEVELS.filter(([k]) => k !== effectiveContract?.careLevel)}
                value={value.careLevel ?? ''}
                onChange={(v) => set({ careLevel: v })}
                error={shown('careLevel')}
              />
              <FieldDescription>
                Chọn đúng mức của lần đánh giá lại gần nhất do Bác sĩ xác nhận; hệ thống kiểm khi lưu.
              </FieldDescription>
            </>
          )}
          {activeTypes.includes('CARE_LEVEL') && !assessmentHidden && (
            <Field data-invalid={!!shown('careLevel') || undefined}>
              <FieldLabel>Mức chăm sóc mới</FieldLabel>
              <p className="type-body-sm">{assessedLevel ? labelOf(CARE_LEVELS, assessedLevel) : 'Chưa có'}</p>
              <FieldDescription>
                {assessment
                  ? `Theo đánh giá${assessment.confirmedBy ? ` của ${assessment.confirmedBy}` : ''} ngày ${formatDate(assessment.confirmedAt)}`
                  : 'Mức mới lấy từ lần đánh giá gần nhất đã xác nhận.'}
              </FieldDescription>
              {shown('careLevel') && <FieldError>{shown('careLevel')}</FieldError>}
            </Field>
          )}
          {activeTypes.includes('DURATION') && (
            <Field data-invalid={!!shown('endDate') || undefined}>
              <FieldLabel htmlFor="change-end">Ngày kết thúc mới</FieldLabel>
              <Input
                id="change-end"
                type="date"
                className="h-11"
                min={date || undefined}
                value={value.endDate ?? ''}
                onChange={(e) => set({ endDate: e.target.value })}
              />
              {shown('endDate') && <FieldError>{shown('endDate')}</FieldError>}
            </Field>
          )}
          {activeTypes.includes('BED') && knowsRoomTypes && (
            <Field data-invalid={!!shown('newRoomTypeId') || undefined}>
              <FieldLabel htmlFor="change-room-type">Loại phòng mới</FieldLabel>
              <select
                id="change-room-type"
                className={SELECT}
                value={chosenRoomTypeId ?? ''}
                onChange={(e) => {
                  setNewRoomTypeId(e.target.value === '' ? null : Number(e.target.value))
                  set({ newBedId: undefined })
                }}
              >
                <option value="">
                  {otherRoomTypes.length ? 'Chọn loại phòng khác loại phòng hiện tại' : 'Không có loại phòng khác còn giường trống'}
                </option>
                {otherRoomTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <FieldDescription>
                Chỉ dùng khi đổi sang loại phòng khác (đổi phí lưu trú, phải ký phụ lục). Chuyển sang giường khác cùng loại
                phòng thì dùng Chuyển giường trực tiếp ở màn Giường, không cần lập yêu cầu.
              </FieldDescription>
              {shown('newRoomTypeId') && <FieldError>{shown('newRoomTypeId')}</FieldError>}
            </Field>
          )}
          {activeTypes.includes('BED') && (
            <Field data-invalid={!!shown('newBedId') || undefined}>
              <FieldLabel htmlFor="change-bed">{knowsRoomTypes ? 'Giường trong loại phòng mới' : 'Giường mới'}</FieldLabel>
              <select
                id="change-bed"
                className={SELECT}
                value={value.newBedId ?? ''}
                onChange={(e) => set({ newBedId: e.target.value === '' ? undefined : Number(e.target.value) })}
              >
                <option value="">
                  {emptyBeds === null
                    ? 'Đang tải…'
                    : knowsRoomTypes && !chosenRoomTypeId
                      ? 'Chọn loại phòng mới trước'
                      : bedOptions.length
                        ? 'Chọn giường đang trống'
                        : 'Không có giường trống'}
                </option>
                {bedOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.location?.label ?? b.code}
                  </option>
                ))}
              </select>
              <FieldDescription>
                Giữ trước giường này tới ngày hiệu lực; giường phải còn trống và hợp mức chăm sóc lúc duyệt.
              </FieldDescription>
              {shown('newBedId') && <FieldError>{shown('newBedId')}</FieldError>}
            </Field>
          )}
          {activeTypes.includes('SERVICE') && (
            <Field data-invalid={!!shown('services') || undefined}>
              <FieldLabel>Dịch vụ thêm hoặc bớt</FieldLabel>
              <FieldDescription>
                {SERVICE_CHOICE_HINT} Thuộc gói hay ngoài gói theo hợp đồng hiện hành; chỉ thêm, bớt dịch vụ thuộc gói
                là thay đổi nhỏ.
              </FieldDescription>
              {(() => {
                // FR-043k (Q-426): dòng đang có (mọi loại) để bớt; chỉ 4 loại để thêm, nhóm theo loại
                const { removable, addGroups } = serviceChoices(catalog, effectiveContract?.services)
                const row = (s) => {
                  const line = lineOf(s.id)
                  const inContract = contractServiceIds.has(s.id)
                  return (
                    <div key={s.id} className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 type-body-sm">
                        <input type="checkbox" checked={!!line} onChange={() => toggleService(s.id)} />
                        {`${inContract ? 'Bớt' : 'Thêm'} ${s.name}`}
                      </label>
                      {line && (
                        <span className="type-caption text-muted-foreground">
                          {inPackageIds.has(s.id) ? 'Thuộc gói' : 'Ngoài gói'}
                        </span>
                      )}
                    </div>
                  )
                }
                return (
                  <>
                    {removable.length > 0 && (
                      <div className="flex flex-col gap-1">
                        <span className="type-caption text-muted-foreground">Đang có trong hợp đồng</span>
                        {removable.map(row)}
                      </div>
                    )}
                    {addGroups.map((g) => (
                      <div key={g.type} className="flex flex-col gap-1">
                        <span className="type-caption text-muted-foreground">{g.label}</span>
                        {g.items.map(row)}
                      </div>
                    ))}
                  </>
                )
              })()}
              {shown('services') && <FieldError>{shown('services')}</FieldError>}
            </Field>
          )}
          {activeTypes.includes('ARRIVAL_SCHEDULE') && (
            <Field data-invalid={!!shown('arrivalSchedule') || undefined}>
              <FieldLabel>Lịch đến theo tuần</FieldLabel>
              {(value.arrivalSchedule ?? []).map((row, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label={`Thứ dòng ${i + 1}`}
                    className={`${SELECT} w-32`}
                    value={row.dayOfWeek ?? ''}
                    onChange={(e) => setRow(i, { dayOfWeek: Number(e.target.value) })}
                  >
                    {WEEKDAYS.map(([d, text]) => (
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
                    onChange={(e) => setRow(i, { arrivalTime: e.target.value })}
                  />
                  <Input
                    aria-label={`Giờ về dòng ${i + 1}`}
                    type="time"
                    className="h-11 w-32"
                    value={row.departureTime ?? ''}
                    onChange={(e) => setRow(i, { departureTime: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    className="h-11"
                    onClick={() => set({ arrivalSchedule: value.arrivalSchedule.filter((_, j) => j !== i) })}
                  >
                    Bỏ dòng
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                className="h-11 self-start"
                onClick={() => {
                  const rows = value.arrivalSchedule ?? []
                  const last = rows[rows.length - 1]
                  const used = new Set(rows.map((r) => r.dayOfWeek))
                  const start = last ? (last.dayOfWeek % 7) + 1 : ARRIVAL_ROW.dayOfWeek
                  const nextDay =
                    Array.from({ length: 7 }, (_, idx) => ((start - 1 + idx) % 7) + 1).find((d) => !used.has(d)) ??
                    start
                  // Gợi ý dòng mới: thứ chưa dùng tiếp theo, cùng giờ với dòng trước
                  set({
                    arrivalSchedule: [
                      ...rows,
                      last ? { ...last, dayOfWeek: nextDay } : { ...ARRIVAL_ROW, dayOfWeek: nextDay },
                    ],
                  })
                }}
              >
                Thêm dòng lịch
              </Button>
              {shown('arrivalSchedule') && <FieldError>{shown('arrivalSchedule')}</FieldError>}
            </Field>
          )}

          <Field data-invalid={!!shown('date') || undefined}>
            <FieldLabel htmlFor="change-date" className={REQUIRED}>
              Ngày hiệu lực mong muốn
            </FieldLabel>
            <Input
              id="change-date"
              type="date"
              className="h-11"
              min={contract?.startDate || undefined}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <FieldDescription>
              Duyệt muộn hơn ngày này thì thay đổi tính từ ngày duyệt, không tính lùi.{' '}
              <button
                type="button"
                className="rounded-md bg-accent px-2 py-0.5 text-accent-foreground"
                onClick={() => setDate(tomorrowIso())}
              >
                {`Dùng ngày mai (${formatDate(tomorrowIso())})`}
              </button>
            </FieldDescription>
            {shown('date') && <FieldError>{shown('date')}</FieldError>}
          </Field>
          <ReasonField id="change-reason" value={reason} onChange={setReason} error={shown('reason')} showCount />

          {editing && seesContracts && hadConfirmation && (
            <p className="type-body-sm text-destructive">
              Lưu thay đổi sẽ bỏ xác nhận của người đại diện đang có; sau khi lưu phải xác nhận lại.
            </p>
          )}
        </FieldGroup>
        <div className="mt-4">
          <ProblemAlert problem={failure} />
        </div>
      </div>

      {/* 3. FOOTER (Cố định ở đáy, không đè lên Body) */}
      <div className="shrink-0 sticky bottom-0 flex items-center justify-end gap-2.5 border-t border-border bg-card px-6 py-3.5 mt-auto">
        <Button variant="outline" className="h-10 px-5 font-semibold" onClick={onClose}>
          Hủy
        </Button>
        <Button
          className="h-10 px-6 font-bold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
          disabled={busy || (editing && !etag)}
          onClick={save}
        >
          Lưu yêu cầu
        </Button>
      </div>
      </SheetContent>
    </Sheet>
  )
}

// Ghi xác nhận trực tiếp với người đại diện kèm bằng chứng (FR-043a), mở từ màn chi tiết yêu cầu ở Nháp; gửi lại nội dung
// yêu cầu như đang có cùng representativeConfirmation (PUT kèm If-Match), không đổi nội dung thay đổi.
export function ConfirmationSheet({ request, etag, onClose, onDone }) {
  const [method, setMethod] = useState('IN_PERSON')
  const [confirmedOn, setConfirmedOn] = useState(isoDate())
  const [evidence, setEvidence] = useState(null)
  const [note, setNote] = useState('')
  const [representative, setRepresentative] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)

  const errors = {
    ...validateConfirmation({ method, confirmedOn, file: evidence, existingFileId: null, note }),
    representative: !representative && 'Chọn người đại diện đã xác nhận',
  }
  const shown = (key) => (submitted ? errors[key] || null : null)

  async function save() {
    setSubmitted(true)
    if (Object.values(errors).some(Boolean)) return
    setBusy(true)
    setFailure(null)
    try {
      const evidenceFileId = await uploadFile(evidence)
      await putResidencyChangeRequestsById({
        path: { id: request.approvalRequestId },
        headers: { ...newKey(), 'If-Match': etag },
        body: {
          contractId: request.contractId,
          changeTypes: request.changeTypes,
          newValue: request.newValue,
          requestedEffectiveDate: request.requestedEffectiveDate,
          reason: request.reason,
          representativeConfirmation: {
            method,
            confirmedOn,
            evidenceFileId,
            representativeFamilyMemberId: representative,
            ...(note.trim() ? { note: note.trim() } : {}),
          },
        },
      })
      onDone('Đã ghi xác nhận với người đại diện', request.approvalRequestId)
    } catch (e) {
      setFailure(problemOf(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto p-6 sm:max-w-lg">
        <SheetTitle>Ghi xác nhận trực tiếp</SheetTitle>
        <SheetDescription>
          Dùng khi người đại diện đã đồng ý nội dung thay đổi tại viện, qua điện thoại hoặc tin nhắn. Đính kèm bằng
          chứng rồi lưu; sau đó gửi Quản lý viện duyệt.
        </SheetDescription>
        <FieldGroup className="mt-4">
          <RepresentativeSelect
            id="change-confirmer"
            residentId={request.residentId}
            value={representative}
            onChange={setRepresentative}
            error={shown('representative')}
            label="Người đại diện đã xác nhận"
          />
          <Choices
            label="Cách xác nhận"
            options={CONFIRMATION_METHODS}
            value={method}
            onChange={setMethod}
            error={shown('method')}
          />
          <Field data-invalid={!!shown('confirmedOn') || undefined}>
            <FieldLabel htmlFor="change-confirmed-on">Ngày xác nhận</FieldLabel>
            <Input
              id="change-confirmed-on"
              type="date"
              className="h-11"
              max={isoDate()}
              value={confirmedOn}
              onChange={(e) => setConfirmedOn(e.target.value)}
            />
            {shown('confirmedOn') && <FieldError>{shown('confirmedOn')}</FieldError>}
          </Field>
          <Field data-invalid={!!shown('evidence') || undefined}>
            <FieldLabel htmlFor="change-evidence">Bằng chứng xác nhận</FieldLabel>
            <FileInput
              id="change-evidence"
              accept={EVIDENCE_ACCEPT}
              onChange={(e) => setEvidence(e.target.files?.[0] ?? null)}
            />
            <FieldDescription>{`${EVIDENCE_HINTS[method] ?? ''} PDF, JPG hoặc PNG, tối đa 10 MB.`}</FieldDescription>
            {shown('evidence') && <FieldError>{shown('evidence')}</FieldError>}
          </Field>
          <Field data-invalid={!!shown('note') || undefined}>
            <FieldLabel htmlFor="change-confirmation-note">Ghi chú xác nhận</FieldLabel>
            <Textarea
              id="change-confirmation-note"
              rows={2}
              maxLength={NOTE_MAX}
              placeholder={NOTE_SUGGESTIONS[method]}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <FieldDescription>{`${note.length}/${NOTE_MAX} ký tự`}</FieldDescription>
            {!note.trim() && (
              <Button
                variant="outline"
                className="h-11 self-start"
                onClick={() => setNote(NOTE_SUGGESTIONS[method] ?? '')}
              >
                Dùng ghi chú gợi ý
              </Button>
            )}
            {shown('note') && <FieldError>{shown('note')}</FieldError>}
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
            Lưu xác nhận
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
