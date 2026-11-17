import { useCallback, useEffect, useState } from 'react'
import {
  getAdmissionApplicationsById,
  getAdmissionApplicationsByIdAdmissionConditions,
  getAdmissionApplicationsByIdProgress,
  getContracts,
  getResidentsById,
} from '@/api'
import { Button } from '@/components/ui/button'
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
import { ResidentDetail } from '../residents/ResidentDetail'
import { CONDITION_STATUS, RESIDENCE_TYPES, labelOf } from './admissionLabels'
import { OpinionBlock, OpinionForm } from './ApplicationParts'
import { ContractDetail, ContractSheet } from './ContractParts'

// Hồ sơ tiếp nhận (chủ dự án duyệt 2026-11-17, đề xuất A; DESIGN.md 5.2): một màn cho một lượt tiếp nhận, đi theo các
// bước BF-01. Trạng thái từng bước lấy từ tiến trình và điều kiện tiếp nhận của 004 (FR-003, FR-004; mã ADM_A → ADM_F);
// nút mở đúng form đang có trong khung trượt, hoặc màn sở hữu khi form nằm ở màn khác. Chỉ hiện trạng thái đã ghi, không
// tự làm bước thay người (Q-306, Q-307); backend vẫn kiểm mọi lệnh.

const CLOSED_CONTRACTS = ['CANCELLED', 'TERMINATED']

// action: resident (hồ sơ người cao tuổi), opinion, bed, contract, hoặc tên màn sở hữu ở `page`
const PHASES = [
  {
    title: 'Hồ sơ và đăng ký',
    steps: [
      {
        key: 'profile',
        label: 'Hồ sơ người cao tuổi và lượt đăng ký',
        who: 'Hành chính',
        recorded: true,
        action: 'resident',
      },
      {
        key: 'opinion',
        label: 'Ý kiến của người cao tuổi về việc vào ở',
        who: 'Hành chính',
        note: 'Không là điều kiện',
        action: 'opinion',
      },
      {
        key: 'contacts',
        label: 'Người thân: liên hệ chính, người đại diện',
        who: 'Hành chính',
        condition: 'ADM_F_CONTACTS',
        page: ['family-members', 'Mở Người thân và quyền'],
      },
      {
        key: 'consent',
        label: 'Bản đồng ý chia sẻ dữ liệu',
        who: 'Hành chính',
        note: 'Không chặn tiếp nhận',
        action: 'resident',
      },
    ],
  },
  {
    title: 'Sức khỏe và đánh giá',
    steps: [
      {
        key: 'health',
        label: 'Hồ sơ sức khỏe ban đầu, nguyện vọng cuối đời',
        who: 'Bác sĩ, Điều dưỡng',
        note: 'Không chặn tiếp nhận',
        action: 'resident',
      },
      {
        key: 'assessment',
        label: 'Đánh giá đầu vào và mức chăm sóc',
        who: 'Bác sĩ',
        condition: 'ADM_A_ASSESSMENT',
        action: 'resident',
      },
    ],
  },
  {
    title: 'Giường, hợp đồng, đặt cọc',
    steps: [
      { key: 'bed', label: 'Phân bổ giường', who: 'Hành chính', condition: 'ADM_D_BED', action: 'bed' },
      {
        key: 'contract',
        label: 'Hợp đồng',
        who: 'Hành chính',
        condition: 'ADM_B_CONTRACT',
        extra: 'ADM_E_CONTRACT_LEVEL',
        action: 'contract',
      },
      {
        key: 'deposit',
        label: 'Đặt cọc',
        who: 'Kế toán',
        condition: 'ADM_C_DEPOSIT',
        page: ['balance', 'Mở Số dư, thu chi'],
      },
    ],
  },
  {
    title: 'Hoàn tất tiếp nhận',
    steps: [
      {
        key: 'reconciliation',
        label: 'Phiếu đối chiếu thuốc "tiếp nhận"',
        who: 'Bác sĩ, Điều dưỡng',
        note: 'Chưa có màn trên web; không chặn Hoàn tất tiếp nhận',
      },
      { key: 'complete', label: 'Hoàn tất tiếp nhận', who: 'Hành chính', progress: 'ADMISSION', action: 'complete' },
    ],
  },
  {
    title: 'Sau tiếp nhận',
    steps: [
      {
        key: 'registration',
        label: 'Khai báo cư trú',
        who: 'Hành chính',
        page: ['residence-registrations', 'Mở Khai báo cư trú'],
      },
      {
        key: 'care-plan',
        label: 'Kế hoạch chăm sóc',
        who: 'Điều dưỡng, Bác sĩ duyệt',
        page: ['care-plans', 'Mở Kế hoạch chăm sóc'],
      },
    ],
  },
]

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
        const [conditions, progress, resident, contracts] = await Promise.all([
          getAdmissionApplicationsByIdAdmissionConditions({ path: { id } }),
          getAdmissionApplicationsByIdProgress({ path: { id } }),
          getResidentsById({ path: { id: application.residentId } }),
          getContracts({ query: { residentId: application.residentId } }).catch(() => ({ data: [] })),
        ])
        if (cancelled) return
        const open = (contracts.data ?? [])
          .filter((c) => c.residentId === application.residentId && !CLOSED_CONTRACTS.includes(c.status))
          .sort((a, b) => b.id - a.id)
        setState({
          loading: false,
          application,
          conditions: conditions.data,
          progress: progress.data,
          resident: resident.data,
          contract: open[0] ?? null,
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

function StepStatus({ step, conditionOf, progressDone, opinion }) {
  if (step.condition) {
    const line = conditionOf(step.condition)
    const extra = step.extra && conditionOf(step.extra)
    return (
      <span className="flex flex-col">
        {line ? (
          <span className={cn('type-label', TONE[line.status])}>{CONDITION_STATUS[line.status] ?? line.status}</span>
        ) : (
          <span className="type-label text-muted-foreground">Chưa có dữ liệu</span>
        )}
        {extra && (
          <span className="type-caption text-muted-foreground">{`${extra.name}: ${CONDITION_STATUS[extra.status] ?? extra.status}`}</span>
        )}
      </span>
    )
  }
  if (step.progress) {
    return progressDone(step.progress) ? (
      <span className="type-label text-success-foreground">Đã xong</span>
    ) : (
      <span className="type-label text-warning-foreground">Chưa xong</span>
    )
  }
  if (step.key === 'opinion') {
    return opinion ? (
      <span className="type-label text-success-foreground">Đã ghi</span>
    ) : (
      <span className="type-label text-warning-foreground">Chưa ghi</span>
    )
  }
  if (step.recorded) return <span className="type-label text-success-foreground">Đã có</span>
  return <span className="type-caption text-muted-foreground">{step.note}</span>
}

export function AdmissionWorkspacePage({ id, onNavigate = () => {} }) {
  const { can } = usePermissions()
  const [state, refresh] = useWorkspace(id)
  const [sheet, setSheet] = useState(null)
  const [announcement, setAnnouncement] = useState('')

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

  const { application, conditions, progress, resident, contract } = state
  const name = resident.personalInfo?.fullName ?? `Người cao tuổi mã ${resident.id}`
  const lines = conditions?.conditions ?? []
  const conditionOf = (code) => lines.find((c) => c.code === code)
  const progressDone = (step) => progress?.steps?.some((s) => s.name === step && s.done)
  const doneCount = progress?.steps?.filter((s) => s.done).length ?? 0
  const total = progress?.steps?.length ?? 0
  const unmet = lines.filter((c) => c.status === 'NOT_MET').length
  const opinion = conditions?.admissionOpinion ?? null
  const canComplete = resident.allowedCommands?.includes('COMPLETE_ADMISSION')

  function changed(message) {
    setSheet(null)
    if (message) setAnnouncement(message)
    refresh()
  }

  function actionOf(step) {
    if (step.page) {
      const [page, label] = step.page
      return (
        <Button variant="outline" className="h-11" onClick={() => onNavigate(page)}>
          {label}
        </Button>
      )
    }
    if (step.action === 'resident')
      return (
        <Button variant="outline" className="h-11" onClick={() => setSheet({ kind: 'resident' })}>
          Mở hồ sơ
        </Button>
      )
    if (step.action === 'opinion' && can('ADMISSION_CONTRACT_DEPOSIT', 'UPDATE'))
      return (
        <Button variant="outline" className="h-11" onClick={() => setSheet({ kind: 'opinion' })}>
          Ghi ý kiến
        </Button>
      )
    if (step.action === 'bed')
      return (
        <Button variant="outline" className="h-11" onClick={() => setSheet({ kind: 'bed' })}>
          Phân bổ giường
        </Button>
      )
    if (step.action === 'contract') {
      if (contract)
        return (
          <Button variant="outline" className="h-11" onClick={() => setSheet({ kind: 'contract' })}>
            Mở hợp đồng
          </Button>
        )
      if (can('ADMISSION_CONTRACT_DEPOSIT', 'CREATE'))
        return (
          <Button variant="outline" className="h-11" onClick={() => setSheet({ kind: 'new-contract' })}>
            Lập hợp đồng
          </Button>
        )
    }
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
          .join(' · ')}
        aside={
          <Button variant="outline" className="h-11" onClick={() => onNavigate('admission-applications')}>
            Danh sách đăng ký
          </Button>
        }
      >
        <div className="flex max-w-md flex-col gap-1">
          <span className="type-caption text-muted-foreground">{`${doneCount} / ${total} bước đã xong`}</span>
          <div
            role="progressbar"
            aria-label="Tiến độ tiếp nhận"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={doneCount}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full bg-chart-2" style={{ width: total ? `${(doneCount / total) * 100}%` : '0%' }} />
          </div>
        </div>
      </PageHeader>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <ol aria-label="Các bước tiếp nhận" className="flex flex-col rounded-xl border bg-card">
          {PHASES.map((phase, index) => (
            <li key={phase.title} className={cn('flex flex-col py-2', index > 0 && 'border-t')}>
              <h2 className="px-4 py-1 type-label text-muted-foreground">{phase.title}</h2>
              <ol className="flex flex-col">
                {phase.steps.map((step) => (
                  <li
                    key={step.key}
                    aria-label={step.label}
                    className="grid grid-cols-1 gap-2 px-4 py-2 sm:grid-cols-[minmax(0,1fr)_150px_auto] sm:items-center"
                  >
                    <span className="flex flex-col">
                      <span className="type-body-sm">{step.label}</span>
                      <span className="type-caption text-muted-foreground">{step.who}</span>
                    </span>
                    <StepStatus step={step} conditionOf={conditionOf} progressDone={progressDone} opinion={opinion} />
                    <span className="sm:justify-self-end">{actionOf(step)}</span>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>

        <section
          aria-labelledby="admission-conditions"
          className="flex h-fit flex-col gap-3 rounded-xl border bg-card p-4"
        >
          <h2 id="admission-conditions" className="type-card-title">
            Điều kiện Hoàn tất tiếp nhận
          </h2>
          <ul className="flex flex-col gap-2">
            {lines.map((c) => (
              <li key={c.code} className="flex items-start justify-between gap-3">
                <span className="type-body-sm">{c.name ?? c.code}</span>
                <span className={cn('shrink-0 type-label', TONE[c.status])}>
                  {CONDITION_STATUS[c.status] ?? c.status}
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
            <Button className="h-11" onClick={() => setSheet({ kind: 'resident', part: 'status' })}>
              Hoàn tất tiếp nhận
            </Button>
          )}
          <span className="type-caption text-muted-foreground">
            {unmet > 0 ? `Còn ${unmet} điều kiện chưa đạt` : 'Các điều kiện đã đạt'}
          </span>
        </section>
      </div>

      <Sheet open={!!sheet && sheet.kind !== 'new-contract'} onOpenChange={(open) => !open && changed()}>
        <SheetContent className="overflow-y-auto p-6 sm:max-w-3xl">
          {sheet?.kind === 'resident' && (
            <ResidentDetail
              residentId={resident.id}
              initialPart={sheet.part ?? null}
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
                <SheetTitle>Phân bổ giường</SheetTitle>
                <SheetDescription>{name}</SheetDescription>
              </SheetHeader>
              <BedAllocationForm
                resident={{
                  id: resident.id,
                  fullName: name,
                  profileCode: resident.profileCode,
                  status: resident.status,
                }}
                onSaved={() => changed('Đã phân bổ giường')}
              />
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
              onEdit={() => onNavigate('contracts')}
              Title={SheetTitle}
              Description={SheetDescription}
            />
          )}
        </SheetContent>
      </Sheet>

      {sheet?.kind === 'new-contract' && (
        <ContractSheet residentId={resident.id} onClose={() => setSheet(null)} onDone={changed} />
      )}
    </div>
  )
}
