import { useCallback, useEffect, useState } from 'react'
import {
  getAdmissionApplicationsById,
  getAdmissionApplicationsByIdAdmissionConditions,
  getContracts,
  getResidentsById,
} from '@/api'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/common/PageHeader'
import { PermissionDeniedState } from '@/common/PageState'
import { ProblemAlert } from '@/common/ProblemAlert'
import { formatDate } from '@/common/dateTime'
import { usePermissions } from '@/common/permissions/permissions'
import { problemOf } from '@/common/problem'
import { cn } from '@/lib/utils'
import { BedAllocationForm } from '../beds/BedAllocationForm'
import { ResidentDetail, ResidentPartSheet } from '../residents/ResidentDetail'
import { APPLICATION_STATUS, OPEN_STATUSES, RESIDENCE_TYPES, labelOf } from './admissionLabels'
import { ApplicationSheet, OpinionBlock, OpinionForm } from './ApplicationParts'
import { ContractDetail, ContractSheet } from './ContractParts'
import { admissionProgress } from './admissionProgress'

// Hồ sơ tiếp nhận (chủ dự án duyệt 2026-11-17, đề xuất A; DESIGN.md 5.2): một màn cho một lượt tiếp nhận, đi theo các
// bước BF-01. Trạng thái từng bước lấy từ điều kiện tiếp nhận của 004 (FR-004; mã ADM_A → ADM_F);
// nút mở đúng form đang có trong khung trượt, hoặc màn sở hữu khi form nằm ở màn khác. Chỉ hiện trạng thái đã ghi, không
// tự làm bước thay người (Q-306, Q-307); backend vẫn kiểm mọi lệnh. 004 T114 (chủ dự án yêu cầu 2026-11-17): danh sách đăng
// ký mở thẳng màn này; bước thuộc hồ sơ người cao tuổi mở đúng phần (part) của ResidentDetail; cập nhật đăng ký ở đây.

const CLOSED_CONTRACTS = ['CANCELLED', 'TERMINATED']

// action: resident (hồ sơ người cao tuổi, mở sẵn phần `part` nếu có), opinion, bed, contract, hoặc màn sở hữu ở `page`
const PART_LABELS = {
  consent: 'Đồng ý',
  health: 'Sức khỏe',
  wishes: 'Nguyện vọng',
  assessment: 'Đánh giá',
}

// Cùng bộ nhãn với các bước (nhóm A BF-01 việc 2); CONDITION_STATUS dùng chung với Kết thúc lưu trú nên giữ nguyên
const CONDITION_LABEL = {
  MET: 'Xong',
  NOT_MET: 'Chưa xong',
  NOT_APPLICABLE: 'Không áp dụng',
  MET_BY_EXCEPTION: 'Xong (ngoại lệ)',
  AUTOMATIC: 'Tự động',
}

const TONE = {
  MET: 'text-success-foreground',
  MET_BY_EXCEPTION: 'text-success-foreground',
  AUTOMATIC: 'text-success-foreground',
  NOT_MET: 'text-warning-foreground',
  NOT_APPLICABLE: 'text-muted-foreground',
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
        const [conditions, resident, contracts] = await Promise.all([
          open ? getAdmissionApplicationsByIdAdmissionConditions({ path: { id } }) : { data: null },
          getResidentsById({ path: { id: application.residentId } }),
          // Không tải được hợp đồng thì báo ở bước Hợp đồng, không coi như chưa có hợp đồng (audit 2026-11-18)
          getContracts({ query: { residentId: application.residentId } }).catch(() => ({ data: [], failed: true })),
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

// Một bộ nhãn cho mọi bước (nhóm A BF-01, chủ dự án duyệt 2026-11-21): Xong, Chưa xong (bước là điều kiện), Chưa làm (không
// bắt buộc); lượt đã đóng thì dòng điều kiện ghi "Không còn kiểm" (F10).
function StepStatus({ step, conditionOf }) {
  if (step.state === 'closed') return <span className="type-caption text-muted-foreground">Không còn kiểm</span>
  if (step.state === 'after') return <span className="type-caption text-muted-foreground">Sau tiếp nhận</span>
  const extra = step.extra && conditionOf(step.extra)
  return (
    <span className="flex flex-col">
      {step.state === 'done' ? (
        <span className="type-label text-success-foreground">Xong</span>
      ) : (
        <span className="type-label text-warning-foreground">{step.state === 'todo' ? 'Chưa xong' : 'Chưa làm'}</span>
      )}
      {step.state === 'optional' && (
        <span className="type-caption text-muted-foreground">Không bắt buộc để tiếp nhận</span>
      )}
      {extra?.status === 'NOT_MET' && (
        <span className="type-caption text-muted-foreground">{`${extra.name}: chưa xong`}</span>
      )}
    </span>
  )
}

// Thanh tiến độ bốn giai đoạn ở đầu màn theo luồng (DESIGN.md 5.3; phương án B, chủ dự án chọn 2026-11-21)
function ProgressBar({ phases }) {
  return (
    <ol aria-label="Tiến độ tiếp nhận" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {phases.map((phase) => (
        <li key={phase.title} className="flex flex-col gap-1.5">
          <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span
              className="block h-full rounded-full bg-chart-2"
              style={{ width: `${(phase.done / phase.total) * 100}%` }}
            />
          </span>
          <span className="type-caption text-muted-foreground">{`${phase.short}, ${phase.done} trên ${phase.total} bước xong`}</span>
        </li>
      ))}
    </ol>
  )
}

export function AdmissionWorkspacePage({ id, onNavigate = () => {} }) {
  const { can } = usePermissions()
  const [state, refresh] = useWorkspace(id)
  const [sheet, setSheet] = useState(null)
  const [announcement, setAnnouncement] = useState('')
  const [stepsOpen, setStepsOpen] = useState(false)

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
  const name = resident.personalInfo?.fullName ?? `Người cao tuổi mã ${resident.id}`
  const lines = conditions?.conditions ?? []
  const unmet = lines.filter((c) => c.status === 'NOT_MET').length
  // Lượt đã đóng: ý kiến hiện hành lấy từ lượt đăng ký (api-004 AdmissionApplication.admissionOpinion, hiện hành trước)
  const closed = !OPEN_STATUSES.includes(application.status)
  const opinion = closed ? (application.admissionOpinion?.[0] ?? null) : (conditions?.admissionOpinion ?? null)
  const canComplete = resident.allowedCommands?.includes('COMPLETE_ADMISSION')
  const progress = admissionProgress({
    conditions,
    opinion,
    residentCommands: resident.allowedCommands ?? [],
    hasContract: !!contract,
    can,
    canComplete,
    closed,
  })
  const { conditionOf } = progress

  function changed(message) {
    setSheet(null)
    if (message) setAnnouncement(message)
    refresh()
  }

  // primary: nút chính của khối Việc tiếp theo (DESIGN.md mục 1 điều 7: một nút chính mỗi màn)
  function actionOf(step, primary = false) {
    const variant = primary ? 'default' : 'outline'
    if (step.page) {
      const [page, pageLabel, withResident] = step.page
      const label = step.isMine && step.minePage ? step.minePage : pageLabel
      return (
        <Button
          variant={variant}
          className="h-11"
          onClick={() => (withResident ? onNavigate(page, { residentId: resident.id }) : onNavigate(page))}
        >
          {label}
        </Button>
      )
    }
    if (step.action === 'resident')
      return (
        <Button
          variant={variant}
          className="h-11"
          onClick={() => setSheet(step.part ? { kind: 'part', part: step.part } : { kind: 'resident' })}
        >
          {step.part ? `Mở ${PART_LABELS[step.part]}` : 'Mở hồ sơ'}
        </Button>
      )
    // Ý kiến chỉ ghi được khi lượt Đang xử lý hoặc Đang chờ (api-004 admission-opinion)
    if (step.action === 'opinion' && !closed && can('ADMISSION_CONTRACT_DEPOSIT', 'UPDATE'))
      return (
        <Button variant={variant} className="h-11" onClick={() => setSheet({ kind: 'opinion' })}>
          Ghi ý kiến
        </Button>
      )
    // Chỉ khi điều kiện giường Chưa đạt: đã có phân bổ (Đạt) hoặc bán trú (Không áp dụng) thì không có nút. Chưa có giường
    // phù hợp thì Hành chính đưa vào danh sách chờ ở màn Danh sách chờ (BF-01 bước 7b; audit 2026-11-18)
    if (step.action === 'bed') {
      if (conditionOf(step.condition)?.status !== 'NOT_MET') return null
      return (
        <span className="flex flex-wrap gap-2 sm:justify-end">
          <Button variant={variant} className="h-11" onClick={() => setSheet({ kind: 'bed' })}>
            Phân bổ giường
          </Button>
          <Button variant="outline" className="h-11" onClick={() => onNavigate('waiting-list')}>
            Mở Danh sách chờ
          </Button>
        </span>
      )
    }
    if (step.action === 'contract') {
      if (contractsFailed) return <span className="type-caption text-destructive">Không tải được hợp đồng</span>
      if (contract)
        return (
          <Button variant={variant} className="h-11" onClick={() => setSheet({ kind: 'contract' })}>
            Mở hợp đồng
          </Button>
        )
      if (can('ADMISSION_CONTRACT_DEPOSIT', 'CREATE'))
        return (
          <Button variant={variant} className="h-11" onClick={() => setSheet({ kind: 'new-contract' })}>
            Lập hợp đồng
          </Button>
        )
    }
    if (step.key === 'complete')
      return (
        <Button variant={variant} className="h-11" onClick={() => setSheet({ kind: 'part', part: 'status' })}>
          Hoàn tất tiếp nhận
        </Button>
      )
    return null
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={`Tiếp nhận ${name}`}
        subtitle={[
          resident.profileCode,
          labelOf(RESIDENCE_TYPES, application.desiredResidenceType),
          `đăng ký ${formatDate(application.applicationDate)}`,
          application.desiredAdmissionDate && `mong muốn vào ${formatDate(application.desiredAdmissionDate)}`,
        ]
          .filter(Boolean)
          .join(', ')}
        aside={
          <div className="flex flex-wrap gap-2">
            {can('ADMISSION_CONTRACT_DEPOSIT', 'UPDATE') && OPEN_STATUSES.includes(application.status) && (
              <Button variant="outline" className="h-11" onClick={() => setSheet({ kind: 'edit-application' })}>
                Cập nhật đăng ký
              </Button>
            )}
          </div>
        }
      />

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          <ProgressBar phases={progress.phases} />
          {progress.next && (
            <section aria-labelledby="admission-next" className="flex flex-col gap-2 rounded-xl border bg-card p-4">
              <h2 id="admission-next" className="type-caption text-muted-foreground">
                Việc tiếp theo của bạn
              </h2>
              <h3 className="type-title">{progress.next.label}</h3>
              {progress.next.note && <p className="type-body-sm text-muted-foreground">{progress.next.note}</p>}
              <span className="flex flex-wrap gap-2">{actionOf(progress.next, true)}</span>
            </section>
          )}
          {progress.waiting.length > 0 && (
            <section aria-labelledby="admission-waiting" className="flex flex-col gap-2 rounded-xl border bg-card p-4">
              <h2 id="admission-waiting" className="type-label">
                Đang chờ người khác
              </h2>
              <ul className="flex flex-col gap-1.5">
                {progress.waiting.map((step) => (
                  <li key={step.key} className="flex items-center justify-between gap-3">
                    <span className="type-body-sm">{step.label}</span>
                    <span className="type-caption rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                      {step.who}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <Collapsible open={stepsOpen} onOpenChange={setStepsOpen} className="flex flex-col gap-2">
            <CollapsibleTrigger render={<Button variant="outline" className="h-11 self-start" />}>
              {`${stepsOpen ? 'Ẩn' : 'Xem tất cả'} các bước (${progress.phases.reduce((n, phase) => n + phase.total, 0)})`}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ol aria-label="Các bước tiếp nhận" className="flex flex-col rounded-xl border bg-card">
                {progress.phases.map((phase, index) => (
                  <li key={phase.title} className={cn('flex flex-col py-2', index > 0 && 'border-t')}>
                    <h2 className="px-4 py-1 type-label text-muted-foreground">{phase.title}</h2>
                    <ol className="flex flex-col">
                      {phase.steps.map((step) => (
                        <li
                          key={step.key}
                          aria-label={step.label}
                          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2"
                        >
                          {/* Trạng thái dưới tên bước, nút bên phải xuống dòng khi hẹp: không bóp tên bước (D2, mục 10) */}
                          <span className="flex min-w-48 flex-1 flex-col gap-0.5">
                            <span className="type-body-sm">{step.label}</span>
                            {step.note && <span className="type-caption text-muted-foreground">{step.note}</span>}
                            <StepStatus step={step} conditionOf={conditionOf} />
                          </span>
                          <span className="flex flex-wrap gap-2">{actionOf(step)}</span>
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ol>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <section
          aria-labelledby="admission-conditions"
          className="flex h-fit flex-col gap-3 rounded-xl border bg-card p-4"
        >
          <h2 id="admission-conditions" className="type-card-title">
            Điều kiện Hoàn tất tiếp nhận
          </h2>
          {!conditions && (
            <p className="type-body-sm text-muted-foreground">
              {`Lượt đăng ký đã đóng (${APPLICATION_STATUS[application.status] ?? application.status}), không còn danh sách điều kiện.`}
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {lines.map((c) => (
              <li key={c.code} className="flex items-start justify-between gap-3">
                <span className="type-body-sm">{c.name ?? c.code}</span>
                <span className={cn('shrink-0 type-label', TONE[c.status])}>
                  {CONDITION_LABEL[c.status] ?? c.status}
                </span>
              </li>
            ))}
          </ul>
          {conditions?.warnings?.length > 0 && (
            <ul className="flex flex-col gap-1" aria-label="Cảnh báo">
              {conditions.warnings.map((w) => (
                <li key={w.code} className="type-body-sm text-warning-foreground">
                  {w.description}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col gap-1 border-t pt-3">
            <h3 className="type-label">Ý kiến về việc vào ở</h3>
            <OpinionBlock opinions={opinion ? [opinion] : []} />
          </div>
          {canComplete && (
            <Button
              variant={progress.next ? 'outline' : 'default'}
              className="h-11"
              onClick={() => setSheet({ kind: 'part', part: 'status' })}
            >
              Hoàn tất tiếp nhận
            </Button>
          )}
          {conditions && (
            <span className="type-caption text-muted-foreground">
              {unmet > 0 ? `Còn ${unmet} điều kiện chưa xong` : 'Các điều kiện đã xong'}
            </span>
          )}
        </section>
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
        open={!!sheet && !['new-contract', 'edit-contract', 'edit-application', 'part'].includes(sheet.kind)}
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
          {sheet?.kind === 'opinion' && (
            <>
              <SheetHeader className="p-0">
                <SheetTitle>Ghi ý kiến về việc vào ở</SheetTitle>
                <SheetDescription>{name}</SheetDescription>
              </SheetHeader>
              <OpinionForm applicationId={application.id} onCancel={() => setSheet(null)} onDone={changed} />
            </>
          )}
          {sheet?.kind === 'bed' && (
            <>
              <SheetHeader className="p-0">
                <SheetTitle>{sheet.afterContract ? 'Chọn giường cho hợp đồng vừa lập' : 'Phân bổ giường'}</SheetTitle>
                <SheetDescription>
                  {sheet.afterContract ? `${name}. Hợp đồng nháp đã lưu; ngày vào lấy từ hợp đồng, sửa được.` : name}
                </SheetDescription>
              </SheetHeader>
              <BedAllocationForm
                defaultDate={sheet.defaultDate}
                resident={{
                  id: resident.id,
                  fullName: name,
                  profileCode: resident.profileCode,
                  status: resident.status,
                }}
                onSaved={() => changed('Đã phân bổ giường')}
              />
              {sheet.afterContract && (
                <Button variant="ghost" className="h-11 self-end" onClick={() => changed()}>
                  Để sau
                </Button>
              )}
            </>
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
      {/* Sửa hợp đồng nháp ngay trên màn này, không chuyển sang màn Hợp đồng (audit 2026-11-18) */}
      {sheet?.kind === 'edit-contract' && (
        <ContractSheet contract={sheet.contract} residentName={name} onClose={() => setSheet(null)} onDone={changed} />
      )}
      {sheet?.kind === 'edit-application' && (
        <ApplicationSheet application={application} onClose={() => setSheet(null)} onDone={changed} />
      )}
    </div>
  )
}
