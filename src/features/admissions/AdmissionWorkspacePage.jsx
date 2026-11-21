import { useCallback, useEffect, useState } from 'react'
import {
  getAdmissionApplicationsById,
  getAdmissionApplicationsByIdAdmissionConditions,
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
import { ResidentDetail, ResidentPartSheet } from '../residents/ResidentDetail'
import { APPLICATION_STATUS, CONDITION_STATUS, OPEN_STATUSES, RESIDENCE_TYPES, labelOf } from './admissionLabels'
import { ApplicationSheet, OpinionBlock, OpinionForm } from './ApplicationParts'
import { ContractDetail, ContractSheet } from './ContractParts'

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

const PHASES = [
  {
    title: 'Hồ sơ và đăng ký',
    steps: [
      {
        key: 'profile',
        label: 'Hồ sơ người cao tuổi và lượt đăng ký',
        recorded: true,
        action: 'resident',
      },
      {
        key: 'opinion',
        label: 'Ý kiến của người cao tuổi về việc vào ở',
        note: 'Không là điều kiện',
        action: 'opinion',
      },
      {
        key: 'contacts',
        label: 'Người thân: liên hệ chính, người đại diện',
        condition: 'ADM_F_CONTACTS',
        page: ['family-members', 'Mở Người thân và quyền'],
      },
      {
        key: 'consent',
        label: 'Bản đồng ý chia sẻ dữ liệu',
        note: 'Không chặn tiếp nhận',
        action: 'resident',
        part: 'consent',
      },
    ],
  },
  {
    title: 'Sức khỏe và đánh giá',
    steps: [
      {
        key: 'health',
        label: 'Hồ sơ sức khỏe ban đầu',
        note: 'Không chặn tiếp nhận',
        action: 'resident',
        part: 'health',
      },
      {
        key: 'wishes',
        label: 'Nguyện vọng cuối đời, nguyện vọng khi điều trị',
        note: 'Không chặn tiếp nhận',
        action: 'resident',
        part: 'wishes',
      },
      {
        key: 'assessment',
        label: 'Đánh giá đầu vào và mức chăm sóc',
        condition: 'ADM_A_ASSESSMENT',
        action: 'resident',
        part: 'assessment',
      },
    ],
  },
  {
    title: 'Giường, hợp đồng, đặt cọc',
    steps: [
      { key: 'bed', label: 'Phân bổ giường', condition: 'ADM_D_BED', action: 'bed' },
      {
        key: 'contract',
        label: 'Hợp đồng',
        condition: 'ADM_B_CONTRACT',
        extra: 'ADM_E_CONTRACT_LEVEL',
        action: 'contract',
      },
      {
        key: 'deposit',
        label: 'Đặt cọc',
        condition: 'ADM_C_DEPOSIT',
        // Kế toán ghi thu tiền cọc ở Số dư, thu chi; mở với người cao tuổi này đã chọn sẵn (audit 2026-11-18)
        page: ['balance', 'Mở Số dư, thu chi', 'resident'],
      },
    ],
  },
  // Nhóm "Hoàn tất tiếp nhận" (phiếu đối chiếu thuốc, dòng Hoàn tất) bỏ ngày 2026-11-18 theo yêu cầu chủ dự án: trùng cột
  // Điều kiện Hoàn tất tiếp nhận bên phải, nơi có nút Hoàn tất tiếp nhận
  {
    title: 'Sau tiếp nhận',
    steps: [
      {
        key: 'registration',
        label: 'Khai báo cư trú',
        page: ['residence-registrations', 'Mở Khai báo cư trú'],
      },
      {
        key: 'care-plan',
        label: 'Kế hoạch chăm sóc',
        page: ['care-plans', 'Mở Kế hoạch chăm sóc'],
      },
    ],
  },
]

// Dòng chưa đạt của (a), (d), (f) mang mã của module sở hữu (INITIAL_ASSESSMENT_…, mã của 003, DBR_02), chỉ dòng đạt mang
// mã cố định; nên bước tìm theo mã, không thấy thì theo module của dòng (AdmissionConditionService, FR-004).
const CONDITION_MODULE = { ADM_A_ASSESSMENT: 'M01', ADM_D_BED: 'M03', ADM_F_CONTACTS: 'M10' }

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

// Lượt đã đóng không còn danh sách điều kiện: dòng điều kiện ghi "Không còn kiểm", không ghi "Chưa có dữ liệu" (F10)
function StepStatus({ step, conditionOf, opinion, closed }) {
  if (step.condition && closed) return <span className="type-caption text-muted-foreground">Không còn kiểm</span>
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

  const { application, conditions, resident, contract, contractsFailed } = state
  const name = resident.personalInfo?.fullName ?? `Người cao tuổi mã ${resident.id}`
  const lines = conditions?.conditions ?? []
  const conditionOf = (code) =>
    lines.find((c) => c.code === code) ??
    lines.find((c) => c.status === 'NOT_MET' && CONDITION_MODULE[code] && c.module === CONDITION_MODULE[code])
  const unmet = lines.filter((c) => c.status === 'NOT_MET').length
  // Lượt đã đóng: ý kiến hiện hành lấy từ lượt đăng ký (api-004 AdmissionApplication.admissionOpinion, hiện hành trước)
  const closed = !OPEN_STATUSES.includes(application.status)
  const opinion = closed ? (application.admissionOpinion?.[0] ?? null) : (conditions?.admissionOpinion ?? null)
  const canComplete = resident.allowedCommands?.includes('COMPLETE_ADMISSION')

  function changed(message) {
    setSheet(null)
    if (message) setAnnouncement(message)
    refresh()
  }

  function actionOf(step) {
    if (step.page) {
      const [page, label, withResident] = step.page
      return (
        <Button
          variant="outline"
          className="h-11"
          onClick={() => (withResident ? onNavigate(page, { residentId: resident.id }) : onNavigate(page))}
        >
          {label}
        </Button>
      )
    }
    if (step.action === 'resident')
      return (
        <Button variant="outline" className="h-11" onClick={() => setSheet(step.part ? { kind: 'part', part: step.part } : { kind: 'resident' })}
        >
          {step.part ? `Mở ${PART_LABELS[step.part]}` : 'Mở hồ sơ'}
        </Button>
      )
    // Ý kiến chỉ ghi được khi lượt Đang xử lý hoặc Đang chờ (api-004 admission-opinion)
    if (step.action === 'opinion' && !closed && can('ADMISSION_CONTRACT_DEPOSIT', 'UPDATE'))
      return (
        <Button variant="outline" className="h-11" onClick={() => setSheet({ kind: 'opinion' })}>
          Ghi ý kiến
        </Button>
      )
    // Chỉ khi điều kiện giường Chưa đạt: đã có phân bổ (Đạt) hoặc bán trú (Không áp dụng) thì không có nút. Chưa có giường
    // phù hợp thì Hành chính đưa vào danh sách chờ ở màn Danh sách chờ (BF-01 bước 7b; audit 2026-11-18)
    if (step.action === 'bed') {
      if (conditionOf(step.condition)?.status !== 'NOT_MET') return null
      return (
        <span className="flex flex-wrap gap-2 sm:justify-end">
          <Button variant="outline" className="h-11" onClick={() => setSheet({ kind: 'bed' })}>
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
          <div className="flex flex-wrap gap-2">
            {can('ADMISSION_CONTRACT_DEPOSIT', 'UPDATE') && OPEN_STATUSES.includes(application.status) && (
              <Button variant="outline" className="h-11" onClick={() => setSheet({ kind: 'edit-application' })}>
                Cập nhật đăng ký
              </Button>
            )}
            <Button variant="outline" className="h-11" onClick={() => onNavigate('admission-applications')}>
              Danh sách đăng ký
            </Button>
          </div>
        }
      />

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
                    <span className="type-body-sm">{step.label}</span>
                    <StepStatus step={step} conditionOf={conditionOf} opinion={opinion} closed={closed} />
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
            <Button className="h-11" onClick={() => setSheet({ kind: 'part', part: 'status' })}>
              Hoàn tất tiếp nhận
            </Button>
          )}
          {conditions && (
            <span className="type-caption text-muted-foreground">
              {unmet > 0 ? `Còn ${unmet} điều kiện chưa đạt` : 'Các điều kiện đã đạt'}
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
              onEdit={(c) => setSheet({ kind: 'edit-contract', contract: c })}
              Title={SheetTitle}
              Description={SheetDescription}
            />
          )}
        </SheetContent>
      </Sheet>

      {sheet?.kind === 'new-contract' && (
        <ContractSheet residentId={resident.id} residentName={name} onClose={() => setSheet(null)} onDone={changed} />
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
