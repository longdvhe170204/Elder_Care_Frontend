import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import {
  getAdmissionApplicationsById,
  getAdmissionApplicationsByIdAdmissionConditions,
  getContracts,
  getResidentsById,
  getResidentsByIdInitialHealthRecord,
} from '@/api'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PermissionDeniedState } from '@/common/PageState'
import { ProblemAlert } from '@/common/ProblemAlert'
import { ResidentAvatar } from '@/common/ResidentAvatar'
import { formatDate } from '@/common/dateTime'
import { usePermissions } from '@/common/permissions/permissions'
import { problemOf } from '@/common/problem'
import { cn } from '@/lib/utils'
import { BedAllocationSheet } from '../beds/BedAllocationSheet'
import { ResidentDetail, ResidentPartSheet } from '../residents/ResidentDetail'
import { GENDER_LABELS } from '../residents/residentLabels'
import {
  APPLICATION_STATUS,
  CARE_LEVELS,
  OPEN_STATUSES,
  OPINIONS,
  OPINION_SOURCES,
  RESIDENCE_TYPES,
  labelOf,
  money,
} from './admissionLabels'
import { ApplicationSheet, OpinionSheet } from './ApplicationParts'
import { ContractDetail, ContractSheet } from './ContractParts'
import { ConsentRecordSheet } from '../consents/ConsentRecordSheet'
import { InitialHealthSheet } from '../residents/InitialHealthSheet'
import { WishDraftSheet } from '../wishes/WishDraftSheet'
import { admissionProgress } from './admissionProgress'
import { bedText, roomTypeMismatch, useAllocatedBed } from './useAllocatedBed'
import { useContractDepositStatus, useDepositCollected } from './useDepositCollected'
import { DepositReceiptSheet } from '../balance/DepositReceiptSheet'

// Hồ sơ tiếp nhận (chủ dự án duyệt 2026-11-17, đề xuất A; DESIGN.md 5.3): một màn cho một lượt tiếp nhận, đi theo các
// bước BF-01. Trạng thái từng bước lấy từ điều kiện tiếp nhận của 004 (FR-004; mã ADM_A → ADM_F);
// nút mở đúng form đang có trong khung trượt, hoặc màn sở hữu khi form nằm ở màn khác. Chỉ hiện trạng thái đã ghi, không
// tự làm bước thay người (Q-306, Q-307); backend vẫn kiểm mọi lệnh. 004 T114 (chủ dự án yêu cầu 2026-11-17): danh sách đăng
// ký mở thẳng màn này; bước thuộc hồ sơ người cao tuổi mở đúng phần (part) của ResidentDetail; cập nhật đăng ký ở đây.
// Bố cục một cột (chủ dự án duyệt 2026-11-26): một tờ, ba cột cố định (dấu trạng thái, nội dung, thao tác), bộ lọc chip,
// bước bắt buộc có dấu *, dòng Hoàn tất tiếp nhận dính chân màn; bỏ cột Điều kiện bên phải và khối Việc tiếp theo.

const CLOSED_CONTRACTS = ['CANCELLED', 'TERMINATED']

// Ba cột: dấu trạng thái, nội dung, thao tác; màn hẹp thì thao tác xuống dưới nội dung
const GRID = 'grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-4 px-4 sm:grid-cols-[1.5rem_minmax(0,1fr)_12.5rem] sm:px-6'
const ACTION = 'col-start-2 pt-2 sm:col-start-3 sm:pt-0 sm:text-right'

const FILTERS = [
  ['mine', 'Việc của bạn'],
  ['required', 'Bắt buộc chưa xong'],
  ['wait', 'Chờ người khác'],
  ['all', 'Tất cả'],
]

const keepStep = {
  mine: (s) => s.view === 'mine',
  required: (s) => s.required && s.state === 'todo',
  wait: (s) => s.view === 'wait',
  all: () => true,
}

function ageOf(dateOfBirth) {
  if (!dateOfBirth) return null
  const [y, m, d] = dateOfBirth.split('-').map(Number)
  const now = new Date()
  const before = now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)
  return now.getFullYear() - y - (before ? 1 : 0)
}

function useWorkspace(id) {
  const [state, setState] = useState({ loading: true })
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data: application } = await getAdmissionApplicationsById({ path: { id } })
        // Lượt đã đóng (Đã tiếp nhận, Đã hủy) không còn danh sách điều kiện: backend trả 409 APPLICATION_CLOSED (004 FR-004)
        const open = OPEN_STATUSES.includes(application.status)
        const [conditions, resident, contracts, health] = await Promise.all([
          open ? getAdmissionApplicationsByIdAdmissionConditions({ path: { id } }) : { data: null },
          getResidentsById({ path: { id: application.residentId } }),
          // Không tải được hợp đồng thì báo ở bước Hợp đồng, không coi như chưa có hợp đồng (audit 2026-11-18)
          getContracts({ query: { residentId: application.residentId } }).catch(() => ({ data: [], failed: true })),
          // Hồ sơ sức khỏe ban đầu đã có bản Nháp chưa (bước Sức khỏe chuyển "Chờ Bác sĩ"); không đọc được thì coi như chưa có
          getResidentsByIdInitialHealthRecord({ path: { id: application.residentId } }).catch(() => ({ data: null })),
        ])
        if (cancelled) return
        const openContracts = (contracts.data ?? [])
          .filter((c) => c.residentId === application.residentId && !CLOSED_CONTRACTS.includes(c.status))
          .sort((a, b) => b.id - a.id)
        setState({
          loading: false,
          application,
          conditions: conditions.data,
          resident: resident.data,
          contract: openContracts[0] ?? null,
          contractsFailed: !!contracts.failed,
          healthDraft: !!health.data && !health.data.confirmed,
        })
      } catch (e) {
        if (!cancelled) setState({ loading: false, failure: problemOf(e) })
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id, reload])

  return [state, useCallback(() => setReload((n) => n + 1), [])]
}

// Dấu trạng thái ở đầu dòng bước: xong (tròn đặc xanh lá), việc của bạn (viền xanh đêm), chờ người khác (viền nét đứt),
// sau tiếp nhận hoặc không còn kiểm (gạch ngang)
function StepMark({ view }) {
  if (view === 'done')
    return (
      <span className="flex size-4 items-center justify-center rounded-full bg-success-foreground text-card">
        <Check aria-hidden className="size-3" strokeWidth={3} />
      </span>
    )
  if (view === 'mine') return <span aria-hidden className="size-4 rounded-full border-2 border-primary" />
  if (view === 'wait')
    return <span aria-hidden className="size-4 rounded-full border-[1.5px] border-dashed border-input" />
  return <span aria-hidden className="h-0.5 w-2.5 bg-border" />
}

export function AdmissionWorkspacePage({ id, onNavigate = () => {} }) {
  const { can } = usePermissions()
  const [state, refresh] = useWorkspace(id)
  const [sheet, setSheet] = useState(null)
  const [announcement, setAnnouncement] = useState('')
  const [filter, setFilter] = useState(null)
  const [collapsed, setCollapsed] = useState([])
  // Giường đã phân bổ hiện ở bước Giường, lệch loại phòng với hợp đồng thì báo ở bước Giường và Hợp đồng (hướng 1, 2026-11-27)
  const allocated = useAllocatedBed(state.resident?.id, state.conditions)
  const depositCollected = useDepositCollected(state.resident?.id, state.conditions)
  const depositStatus = useContractDepositStatus(state.contract, state.conditions)

  if (state.loading) {
    return (
      <div className="flex flex-col gap-5" aria-busy="true">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }
  if (state.failure?.status === 403) return <PermissionDeniedState label="Hồ sơ tiếp nhận" />
  if (state.failure) return <ProblemAlert problem={state.failure} />

  const { application, conditions, resident, contract, contractsFailed } = state
  const mismatch = roomTypeMismatch(allocated, contract?.roomTypeId)
  const allocatedType = allocated.bed && allocated.roomTypeName(allocated.bed.roomTypeId)
  // Dòng phụ bước Đặt cọc theo hợp đồng và sổ cọc (audit 2026-11-27)
  const depositNote = !contract
    ? null
    : contract.noDepositRequired
      ? 'Không yêu cầu đặt cọc'
      : contract.depositAmount != null
        ? `Cần ${money(contract.depositAmount)}${depositCollected != null ? ` · đã thu ${money(depositCollected)}` : ''}`
        : null
  // Sổ cọc mở khi hợp đồng Chờ ký (Q-225): trước đó chưa ghi thu được
  const depositOpen = ['PENDING_SIGNATURE', 'ACTIVE'].includes(contract?.status)
  const info = resident.personalInfo ?? {}
  const name = info.fullName ?? `Người cao tuổi mã ${resident.id}`
  // Lượt đã đóng: ý kiến hiện hành lấy từ lượt đăng ký (api-004 AdmissionApplication.admissionOpinion, hiện hành trước)
  const closed = !OPEN_STATUSES.includes(application.status)
  const opinion = closed ? (application.admissionOpinion?.[0] ?? null) : (conditions?.admissionOpinion ?? null)
  const canComplete = resident.allowedCommands?.includes('COMPLETE_ADMISSION')
  const progress = admissionProgress({
    conditions,
    opinion,
    residentCommands: resident.allowedCommands ?? [],
    healthDraft: state.healthDraft,
    metConditions: ['SATISFIED', 'NOT_REQUIRED'].includes(depositStatus) ? ['ADM_C_DEPOSIT'] : [],
    hasContract: !!contract,
    can,
    canComplete,
    closed,
  })
  const { conditionOf, counts } = progress
  // Mặc định "Việc của bạn"; lượt đã đóng hoặc không có việc của bạn thì xem tất cả
  const shown = filter ?? (closed || counts.mine === 0 ? 'all' : 'mine')
  const age = ageOf(info.dateOfBirth)
  const ageText = age == null ? null : `${age} tuổi`
  const waitingFor = [...new Set(progress.waiting.map((s) => s.who))]

  function changed(message) {
    setSheet(null)
    if (message) setAnnouncement(message)
    refresh()
  }

  // Mở bản ghi của bước (bước đã xong bấm tên để xem); null khi bước không có chỗ xem
  function openerOf(step) {
    if (step.page) {
      const [page, , withResident, extra] = step.page
      // Màn nhận người cao tuổi chọn sẵn theo mã (Số dư, Người thân và quyền); extra (mở luôn form) chỉ khi bước chưa xong
      return () =>
        withResident
          ? onNavigate(page, { residentId: resident.id, ...(step.view !== 'done' && extra) })
          : onNavigate(page)
    }
    if (step.action === 'resident')
      return () => setSheet(step.part ? { kind: 'part', part: step.part } : { kind: 'resident' })
    if (step.action === 'contract' && contract) return () => setSheet({ kind: 'contract' })
    return null
  }

  // Nút của bước chưa xong mà vai trò đang đăng nhập làm được; primary: việc đầu tiên của bạn (một nút chính mỗi màn)
  function actionOf(step, primary) {
    const variant = primary ? 'default' : 'outline'
    const button = (label, onClick) => (
      <Button variant={variant} className="h-10 w-full max-sm:w-auto" onClick={onClick}>
        {label}
      </Button>
    )
    if (step.page) {
      const [, pageLabel] = step.page
      return button(step.minePage ?? step.doLabel ?? pageLabel, openerOf(step))
    }
    // Bản đồng ý: mở thẳng khung ghi nhận, không qua tab Đồng ý (chủ dự án duyệt 2026-11-26)
    if (step.part === 'consent') return button(step.doLabel, () => setSheet({ kind: 'consent' }))
    if (step.part === 'health') return button(step.doLabel, () => setSheet({ kind: 'health' }))
    // Hành chính lập bản Nháp tự khai; Bác sĩ, Điều dưỡng ghi phiếu ở tab Nguyện vọng của hồ sơ
    if (
      step.part === 'wishes' &&
      !resident.allowedCommands?.some((c) => c.startsWith('RECORD_') && c.endsWith('_WISH'))
    )
      return button(step.doLabel, () => setSheet({ kind: 'wishes' }))
    if (step.action === 'resident') return button(step.doLabel ?? 'Mở hồ sơ', openerOf(step))
    // Ý kiến chỉ ghi được khi lượt Đang xử lý hoặc Đang chờ (api-004 admission-opinion)
    if (step.action === 'opinion' && !closed) return button(step.doLabel, () => setSheet({ kind: 'opinion' }))
    // Chỉ khi điều kiện giường Chưa đạt: đã có phân bổ (Đạt) hoặc bán trú (Không áp dụng) thì không có nút
    if (step.action === 'bed' && conditionOf(step.condition)?.status === 'NOT_MET')
      return button(step.doLabel, () => setSheet({ kind: 'bed' }))
    if (step.action === 'deposit') {
      if (!depositOpen) return <span className="type-body-sm text-muted-foreground">Chờ gửi ký hợp đồng</span>
      return button(step.doLabel, () => setSheet({ kind: 'deposit' }))
    }
    if (step.action === 'contract') {
      if (contractsFailed) return <span className="type-caption text-destructive">Không tải được hợp đồng</span>
      if (contract) return button('Mở hợp đồng', openerOf(step))
      if (can('ADMISSION_CONTRACT_DEPOSIT', 'CREATE'))
        return button('Lập hợp đồng', () => setSheet({ kind: 'new-contract' }))
    }
    return <span className="type-body-sm text-muted-foreground">Chưa xong</span>
  }

  function rightOf(step) {
    if (step.view === 'mine') return actionOf(step, isNext(step))
    if (step.view === 'wait') return <span className="type-body-sm text-muted-foreground">{`Chờ ${step.who}`}</span>
    if (step.view === 'done') return <span className="type-body-sm text-success-foreground">Xong</span>
    if (step.view === 'closed') return <span className="type-body-sm text-muted-foreground">Không còn kiểm</span>
    // Sau tiếp nhận: lượt đã đóng thì mở được màn sở hữu, lượt còn mở thì chỉ ghi chữ
    if (closed && step.page)
      return (
        <Button variant="outline" className="h-10 w-full max-sm:w-auto" onClick={openerOf(step)}>
          {step.page[1]}
        </Button>
      )
    return <span className="type-body-sm text-muted-foreground">Sau tiếp nhận</span>
  }

  const phases = progress.phases
    .map((phase) => ({ ...phase, rows: phase.steps.filter(keepStep[shown]) }))
    .filter((phase) => phase.rows.length > 0)
  const requiredLeft = counts.required
  const ready = !closed && !!conditions && requiredLeft === 0
  // Việc đầu tiên của bạn là nút chính; đủ bước bắt buộc thì nút chính là Hoàn tất tiếp nhận (một nút chính mỗi màn)
  const isNext = (step) => !(ready && canComplete) && step.key === progress.next?.key

  return (
    <div className="flex w-full max-w-4xl flex-col gap-4">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <div className="flex flex-col rounded-xl border bg-card">
        <header className={cn(GRID, 'items-center gap-y-3 py-5')}>
          <ResidentAvatar
            name={name}
            code={resident.profileCode ?? String(resident.id)}
            className="-ml-2 size-10 type-label"
          />
          <div className="flex flex-col gap-1">
            <h1 className="type-page text-primary">{`Tiếp nhận ${name}`}</h1>
            <p className="type-body-sm text-muted-foreground">
              {[
                GENDER_LABELS[info.gender],
                ageText,
                resident.profileCode,
                labelOf(RESIDENCE_TYPES, application.desiredResidenceType),
                closed && `lượt ${(APPLICATION_STATUS[application.status] ?? application.status).toLowerCase()}`,
                `đăng ký ${formatDate(application.applicationDate)}`,
                application.desiredAdmissionDate && `muốn vào ${formatDate(application.desiredAdmissionDate)}`,
              ]
                .filter(Boolean)
                .join(', ')}
            </p>
            <p className="type-body-sm text-muted-foreground">
              {application.expectedCareLevel && (
                <>
                  {'Mức dự kiến '}
                  <span className="text-foreground">{labelOf(CARE_LEVELS, application.expectedCareLevel)}</span>
                  {'. '}
                </>
              )}
              {opinion ? (
                <>
                  {'Ý kiến vào ở '}
                  <span className="text-foreground">{labelOf(OPINIONS, opinion.opinion)}</span>
                  {`, nguồn ${labelOf(OPINION_SOURCES, opinion.source?.type).toLowerCase()}.`}
                </>
              ) : (
                'Chưa ghi ý kiến vào ở.'
              )}
            </p>
          </div>
          {can('ADMISSION_CONTRACT_DEPOSIT', 'UPDATE') && !closed && (
            <div className={ACTION}>
              <Button
                variant="outline"
                className="h-10 w-full max-sm:w-auto"
                onClick={() => setSheet({ kind: 'edit-application' })}
              >
                Cập nhật đăng ký
              </Button>
            </div>
          )}
        </header>

        <section aria-label="Tiến độ tiếp nhận" className="flex flex-col gap-4 border-t py-4">
          <div className={cn(GRID, 'items-center')}>
            <span className="text-center type-label">{progress.done}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${(progress.done / counts.all) * 100}%` }}
              />
            </span>
            <span className="col-start-2 type-body-sm text-muted-foreground sm:col-start-3 sm:text-right">
              {`trên ${counts.all} bước xong`}
            </span>
          </div>
          <div className="flex flex-col gap-2.5 px-4 sm:px-6">
            <ToggleGroup
              variant="chip"
              spacing={2}
              value={[shown]}
              onValueChange={(next) => next[0] && setFilter(next[0])}
              aria-label="Lọc bước"
              className="grid w-full grid-cols-2 sm:grid-cols-4"
            >
              {FILTERS.map(([code, label]) => (
                <ToggleGroupItem key={code} value={code} className="h-10">
                  {label} <span className="tabular-nums opacity-75">{counts[code]}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p className="type-caption text-muted-foreground">
              <span className="text-destructive">*</span> Bước bắt buộc trước khi hoàn tất tiếp nhận
            </p>
          </div>
        </section>

        {phases.length === 0 && (
          <p className="border-t px-4 py-5 type-body-sm text-muted-foreground sm:px-6">
            {shown === 'mine' && waitingFor.length > 0
              ? `Bạn không còn bước nào cần làm. Đang chờ ${waitingFor.join(', ')}.`
              : 'Không có bước nào.'}
          </p>
        )}
        <ol aria-label="Các bước tiếp nhận" className="flex flex-col">
          {phases.map((phase) => {
            const isCollapsed = collapsed.includes(phase.title)
            const after = phase.steps.every((s) => s.view === 'after')
            return (
              <li key={phase.title} className="flex flex-col">
                <h2>
                  <button
                    type="button"
                    aria-expanded={!isCollapsed}
                    onClick={() =>
                      setCollapsed((list) =>
                        isCollapsed ? list.filter((t) => t !== phase.title) : [...list, phase.title],
                      )
                    }
                    className="flex min-h-10 w-full items-center gap-2 border-y bg-muted px-4 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:px-6"
                  >
                    <span className="flex-1 type-label">{phase.title}</span>
                    <span className="type-caption text-muted-foreground">
                      {after
                        ? 'Mở sau khi hoàn tất'
                        : phase.total
                          ? `${phase.done} trên ${phase.total} xong`
                          : 'Không còn kiểm'}
                    </span>
                    <ChevronDown
                      aria-hidden
                      className={cn('size-4 text-muted-foreground transition-transform', isCollapsed && '-rotate-90')}
                    />
                  </button>
                </h2>
                {!isCollapsed && (
                  <ol className="flex flex-col">
                    {phase.rows.map((step) => {
                      const open = step.view === 'done' && openerOf(step)
                      const showNote = step.note && (step.view === 'mine' || step.view === 'wait')
                      return (
                        <li
                          key={step.key}
                          aria-label={step.label}
                          className={cn(
                            GRID,
                            'min-h-14 items-center border-t border-border/60 py-2.5 first:border-t-0',
                            isNext(step) && 'bg-accent/30',
                          )}
                        >
                          <span className="flex justify-center">
                            <StepMark view={step.view} />
                          </span>
                          <span className="flex flex-col gap-0.5">
                            <span
                              className={cn(
                                'type-body-sm',
                                step.view === 'mine' || step.view === 'wait' ? 'font-medium' : 'text-muted-foreground',
                              )}
                            >
                              {open ? (
                                <button
                                  type="button"
                                  onClick={open}
                                  className="text-left underline-offset-4 outline-none hover:underline focus-visible:underline"
                                >
                                  {step.label}
                                </button>
                              ) : (
                                step.label
                              )}
                              {step.required && (
                                <span className="ml-0.5 text-destructive" aria-label="bắt buộc">
                                  *
                                </span>
                              )}
                            </span>
                            {showNote && <span className="type-caption text-muted-foreground">{step.note}</span>}
                            {step.key === 'bed' && allocated.bed && (
                              <span className="type-caption text-muted-foreground">
                                {bedText(allocated.bed.location) + (allocatedType ? ` (${allocatedType})` : '')}
                              </span>
                            )}
                            {step.key === 'deposit' && depositNote && (
                              <span className="type-caption text-muted-foreground">{depositNote}</span>
                            )}
                            {(step.key === 'bed' || step.key === 'contract') && mismatch && (
                              <span className="type-caption text-warning-foreground">{mismatch}</span>
                            )}
                          </span>
                          <span className={ACTION}>{rightOf(step)}</span>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </li>
            )
          })}
        </ol>

        {/* Chỉ hiện khi đủ bước bắt buộc: một nút chính Hoàn tất tiếp nhận dính chân màn (chủ dự án yêu cầu 2026-11-26); bước
            không bắt buộc còn thiếu đã hiện ở danh sách bước nên không nhắc lại cảnh báo. Backend vẫn kiểm điều kiện */}
        {ready && canComplete && (
          <section
            aria-label="Hoàn tất tiếp nhận"
            className={cn(GRID, 'sticky bottom-0 items-center rounded-b-xl border-t bg-card py-4')}
          >
            <span className={ACTION}>
              <Button className="h-10 w-full max-sm:w-auto" onClick={() => setSheet({ kind: 'part', part: 'status' })}>
                Hoàn tất tiếp nhận
              </Button>
            </span>
          </section>
        )}
      </div>

      {/* Phần của hồ sơ mở riêng: đóng là về thẳng màn này, không qua màn hồ sơ người cao tuổi (chủ dự án yêu cầu 2026-11-18) */}
      {sheet?.kind === 'part' && (
        <ResidentPartSheet
          residentId={resident.id}
          part={sheet.part}
          onClose={() => changed()}
          onChanged={(message) => {
            if (message) setAnnouncement(message)
            refresh()
          }}
        />
      )}

      <Sheet
        open={
          !!sheet &&
          ![
            'bed',
            'deposit',
            'new-contract',
            'edit-contract',
            'edit-application',
            'part',
            'opinion',
            'consent',
            'health',
            'wishes',
          ].includes(sheet.kind)
        }
        onOpenChange={(open) => !open && changed()}
      >
        <SheetContent className="overflow-y-auto p-6 sm:max-w-3xl">
          {sheet?.kind === 'resident' && (
            <ResidentDetail
              residentId={resident.id}
              onChanged={(message) => {
                if (message) setAnnouncement(message)
                refresh()
              }}
              Title={SheetTitle}
              Description={SheetDescription}
            />
          )}
          {sheet?.kind === 'contract' && contract && (
            <ContractDetail
              contract={contract}
              residentName={name}
              canUpdate={can('ADMISSION_CONTRACT_DEPOSIT', 'UPDATE')}
              onChanged={(message) => {
                if (message) setAnnouncement(message)
                refresh()
              }}
              onEdit={(c) => setSheet({ kind: 'edit-contract', contract: c })}
              Title={SheetTitle}
              Description={SheetDescription}
            />
          )}
        </SheetContent>
      </Sheet>

      {sheet?.kind === 'new-contract' && (
        <ContractSheet
          residentId={resident.id}
          residentName={name}
          residentCode={resident.profileCode}
          defaults={{
            residenceType: application.desiredResidenceType,
            startDate: application.desiredAdmissionDate,
            careLevel: resident.currentCareLevel ?? application.expectedCareLevel,
            roomTypeId: allocated.bed?.roomTypeId,
          }}
          onClose={() => setSheet(null)}
          onDone={(message, saved) => {
            changed(message)
            // Phương án C (chủ dự án chọn 2026-11-21): hợp đồng nội trú vừa lưu mà chưa có giường thì hỏi tiếp chọn giường;
            // hai lệnh vẫn tách, ngày vào lấy từ hợp đồng (chủ dự án xác nhận không vi phạm Q-307)
            if (
              saved &&
              saved.residenceType !== 'DAY_CARE' &&
              progress.steps.bed?.state === 'todo' &&
              can('BED_ALLOCATION', 'CREATE')
            )
              setSheet({ kind: 'bed', afterContract: true, defaultDate: saved.startDate })
          }}
        />
      )}
      {/* Phân bổ giường: khung riêng xl (audit 2026-11-26); chưa có giường phù hợp thì mở Danh sách chờ trong khung (BF-01 bước 7b) */}
      {sheet?.kind === 'bed' && (
        <BedAllocationSheet
          afterContract={sheet.afterContract}
          defaultDate={sheet.defaultDate}
          resident={{ id: resident.id, fullName: name, profileCode: resident.profileCode, status: resident.status }}
          onClose={() => changed()}
          onSaved={() => changed('Đã phân bổ giường')}
          onOpenWaitingList={() => onNavigate('waiting-list')}
        />
      )}
      {sheet?.kind === 'deposit' && (
        <DepositReceiptSheet
          residentId={resident.id}
          residentName={name}
          required={contract?.noDepositRequired ? 0 : contract?.depositAmount}
          onClose={() => changed()}
          onDone={(message) => changed(message)}
        />
      )}
      {/* Sửa hợp đồng nháp ngay trên màn này, không chuyển sang màn Hợp đồng (audit 2026-11-18) */}
      {sheet?.kind === 'edit-contract' && (
        <ContractSheet
          contract={sheet.contract}
          residentName={name}
          residentCode={resident.profileCode}
          onClose={() => setSheet(null)}
          onDone={changed}
        />
      )}
      {sheet?.kind === 'wishes' && (
        <WishDraftSheet
          residentId={resident.id}
          residentName={name}
          hasEndOfLifeWish={resident.hasEndOfLifeWish}
          hasTreatmentWish={resident.hasTreatmentWish}
          onClose={() => setSheet(null)}
          onDone={() => changed('Đã lưu bản Nháp nguyện vọng')}
        />
      )}
      {sheet?.kind === 'health' && (
        <InitialHealthSheet
          residentId={resident.id}
          residentName={name}
          allowedCommands={resident.allowedCommands ?? []}
          onClose={() => setSheet(null)}
          onDone={(message) => changed(message)}
        />
      )}
      {sheet?.kind === 'consent' && (
        <ConsentRecordSheet
          residentId={resident.id}
          residentName={name}
          onClose={() => setSheet(null)}
          onDone={() => changed('Đã ghi nhận bản đồng ý')}
        />
      )}
      {sheet?.kind === 'opinion' && (
        <OpinionSheet
          applicationId={application.id}
          residentId={resident.id}
          residentName={name}
          current={opinion}
          onClose={() => setSheet(null)}
          onDone={changed}
        />
      )}
      {sheet?.kind === 'edit-application' && (
        <ApplicationSheet application={application} onClose={() => setSheet(null)} onDone={changed} />
      )}
    </div>
  )
}
