import { useCallback, useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import {
  ApiError,
  getResidentsById,
  getResidentsByIdAssessments,
  getResidentsByIdEndOfLifeWishDraft,
  getResidentsByIdHealthItems,
  getResidentsByIdInitialHealthRecord,
  getResidentsByIdTreatmentWishDraft,
  postResidentsByIdAssessments,
} from '@/api'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { ProblemAlert } from '@/common/ProblemAlert'
import { formatDate } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { cn } from '@/lib/utils'
import { AssessmentSheet } from '../assessments/AssessmentForm'
import { InitialHealthSheet } from './InitialHealthSheet'
import { ResidentPartSheet } from './ResidentDetail'
import { CARE_LEVEL_LABELS } from '../assessments/assessmentLabels'
import { GENDER_LABELS, STATUS_LABELS, ageOf } from './residentLabels'

// Việc tiếp nhận của Bác sĩ, Điều dưỡng (chủ dự án duyệt 2026-11-26; DESIGN.md 5.3): mở từ tab Đang tiếp nhận của màn
// Người cao tuổi, cùng kiểu dòng với Hồ sơ tiếp nhận (dấu trạng thái, tên bước, cột thao tác). Bác sĩ không đọc được lượt
// đăng ký, hợp đồng (api-004, 403) nên chỉ dùng api-001: hồ sơ sức khỏe ban đầu, mục tự khai chưa kiểm chứng (Q-400), phiếu
// nguyện vọng (Nháp của Hành chính, Q-412), đánh giá đầu vào (bắt buộc, ADM_A). Nút theo allowedCommands; bấm mở đúng khung
// đã có, đóng thì nạp lại. Chỉ hiển thị, không tự tạo việc (Q-307).

const DONE = 'done'

const found = (result) => result.status === 'fulfilled'
const missing = (result) =>
  result.status === 'rejected' && result.reason instanceof ApiError && result.reason.status === 404

async function loadState(residentId) {
  const [profile, record, items, assessments, eolDraft, treatmentDraft] = await Promise.allSettled([
    getResidentsById({ path: { id: residentId } }),
    getResidentsByIdInitialHealthRecord({ path: { id: residentId } }),
    getResidentsByIdHealthItems({ path: { id: residentId }, query: { status: 'ACTIVE' } }),
    getResidentsByIdAssessments({ path: { id: residentId } }),
    getResidentsByIdEndOfLifeWishDraft({ path: { id: residentId } }),
    getResidentsByIdTreatmentWishDraft({ path: { id: residentId } }),
  ])
  if (!found(profile)) throw profile.reason
  if (!found(record) && !missing(record)) throw record.reason
  return {
    profile: profile.value.data,
    record: found(record) ? record.value.data : null,
    unverified: found(items) ? items.value.data.filter((i) => i.unverified).length : 0,
    assessments: found(assessments) ? assessments.value.data : [],
    wishDrafts: [eolDraft, treatmentDraft].filter(found).length,
  }
}

// Các bước và trạng thái; open: khung cần mở khi bấm nút
function stepsOf({ profile, record, unverified, assessments, wishDrafts }) {
  const commands = profile.allowedCommands ?? []
  const can = (...names) => names.some((n) => commands.includes(n))
  const initialConfirmed = assessments.some((a) => a.type === 'INITIAL' && a.status === 'CONFIRMED')
  const draft = assessments.find((a) => a.status === 'DRAFT')
  const bothWishes = profile.hasEndOfLifeWish && profile.hasTreatmentWish
  return [
    {
      key: 'health',
      label: 'Hồ sơ sức khỏe ban đầu',
      state: record?.confirmed ? DONE : null,
      note: record ? (record.confirmed ? null : 'Bản nháp') : 'Chưa lập',
      action: record
        ? can('CONFIRM_INITIAL_HEALTH_RECORD') && { label: 'Xác nhận sức khỏe ban đầu', open: 'health-sheet' }
        : can('WRITE_INITIAL_HEALTH_RECORD') && { label: 'Ghi sức khỏe ban đầu', open: 'health-sheet' },
      who: 'Bác sĩ',
    },
    {
      key: 'items',
      label: 'Dị ứng, bệnh nền tự khai',
      state: unverified === 0 ? DONE : null,
      note: unverified > 0 ? `${unverified} mục chưa kiểm chứng` : null,
      action: can('VERIFY_HEALTH_ITEM') && { label: 'Kiểm chứng', open: 'health' },
      who: 'Bác sĩ, Điều dưỡng',
    },
    {
      key: 'wishes',
      label: 'Nguyện vọng cuối đời, khi điều trị',
      state: bothWishes ? DONE : null,
      note: wishDrafts > 0 ? 'Hành chính đã ghi bản Nháp' : 'Chưa có phiếu',
      action: can('RECORD_END_OF_LIFE_WISH', 'RECORD_TREATMENT_WISH') && { label: 'Mở nguyện vọng', open: 'wishes' },
      who: 'Bác sĩ, Điều dưỡng',
    },
    {
      key: 'assessment',
      label: 'Đánh giá đầu vào và mức chăm sóc',
      required: true,
      state: initialConfirmed ? DONE : null,
      note: draft ? 'Có phiếu nháp' : 'Chưa lập phiếu',
      action: draft
        ? { label: 'Mở phiếu', open: 'assessment', draftId: draft.id }
        : can('CREATE_ASSESSMENT') && { label: 'Lập đánh giá', open: 'create-assessment' },
      who: 'Bác sĩ',
    },
  ]
}

export function AdmissionTasksSheet({ residentId, onClose, onOpenProfile, onChanged }) {
  const [data, setData] = useState(null)
  const [failure, setFailure] = useState(null)
  const [busy, setBusy] = useState(false)
  const [opened, setOpened] = useState(null)
  const [notice, setNotice] = useState(null)

  const load = useCallback(async () => {
    try {
      setData(await loadState(residentId))
      setFailure(null)
    } catch (error) {
      setFailure(problemOf(error))
    }
  }, [residentId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nạp việc khi mở khung
    load()
  }, [load])

  function closeInner() {
    setOpened(null)
    load()
    onChanged?.()
  }

  async function run(action) {
    setNotice(null)
    if (action.open !== 'create-assessment') return setOpened(action)
    setFailure(null)
    setBusy(true)
    try {
      const { data: created } = await postResidentsByIdAssessments({
        path: { id: residentId },
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: { type: 'INITIAL' },
      })
      await load()
      setOpened({ open: 'assessment', draftId: created.id })
    } catch (error) {
      setFailure(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  const profile = data?.profile
  const info = profile?.personalInfo
  const steps = data ? stepsOf(data) : []
  const doneCount = steps.filter((s) => s.state === DONE).length
  // Nút chính: việc đầu tiên của bạn, bước bắt buộc trước, không bắt buộc sau (như Hồ sơ tiếp nhận, DESIGN.md 5.3)
  const open = steps.filter((s) => s.state !== DONE && s.action)
  const next = open.find((s) => s.required) ?? open[0]
  const age = ageOf(info?.dateOfBirth)

  return (
    <>
      {/* Khung việc luôn mở; khung của từng việc mở chồng lên, đóng thì về đây */}
      <Sheet open onOpenChange={(next) => !next && !opened && onClose()}>
        <SheetContent className="gap-0 p-0 sm:max-w-xl">
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 flex-col gap-1 border-b px-6 pt-6 pb-4 pr-12">
              <SheetTitle className="type-title">
                {info ? `Việc tiếp nhận: ${info.fullName}` : 'Việc tiếp nhận'}
              </SheetTitle>
              <SheetDescription className="tabular-nums">
                {profile
                  ? [
                      profile.profileCode,
                      [GENDER_LABELS[info.gender], age !== null && `${age} tuổi`].filter(Boolean).join(', '),
                      `${STATUS_LABELS[profile.status] ?? profile.status}${profile.statusSince ? ` từ ${formatDate(profile.statusSince)}` : ''}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : 'Đang tải'}
              </SheetDescription>
              {data && (
                <p className="type-caption text-muted-foreground tabular-nums">
                  {doneCount} trên {steps.length} việc xong
                </p>
              )}
              {notice && (
                <p role="status" className="type-body-sm text-success-foreground">
                  {notice}
                </p>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {!data && !failure && (
                <div aria-busy="true" className="flex flex-col gap-2 p-6">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              )}
              {failure && (
                <div className="p-6">
                  <ProblemAlert problem={failure} />
                </div>
              )}
              {data && (
                <ol aria-label="Các việc tiếp nhận" className="flex flex-col">
                  {steps.map((step) => {
                    const done = step.state === DONE
                    const primary = step === next
                    return (
                      <li
                        key={step.key}
                        className={cn(
                          'grid grid-cols-[1.5rem_minmax(0,1fr)_11rem] items-center gap-3 border-b px-6 py-3',
                          primary && 'bg-accent/60',
                        )}
                      >
                        {/* Dấu như Hồ sơ tiếp nhận: xong, việc của bạn, chờ người khác */}
                        {done ? (
                          <span className="flex size-4 items-center justify-center rounded-full bg-success-foreground text-card">
                            <Check aria-hidden className="size-3" strokeWidth={3} />
                          </span>
                        ) : step.action ? (
                          <span aria-hidden className="size-4 rounded-full border-2 border-primary" />
                        ) : (
                          <span aria-hidden className="size-4 rounded-full border-[1.5px] border-dashed border-input" />
                        )}
                        <div className="flex min-w-0 flex-col">
                          <span className="type-body-sm">
                            {step.label}
                            {step.required && (
                              <span aria-hidden="true" className="text-destructive">
                                {' '}
                                *
                              </span>
                            )}
                          </span>
                          {!done && step.note && (
                            <span className="type-caption text-muted-foreground">{step.note}</span>
                          )}
                        </div>
                        <div className="flex justify-end">
                          {done ? (
                            <span className="type-body-sm text-success-foreground">Xong</span>
                          ) : step.action ? (
                            <Button
                              type="button"
                              variant={primary ? 'default' : 'outline'}
                              className="h-10 w-full"
                              disabled={busy}
                              onClick={() => run(step.action)}
                            >
                              {step.action.label}
                            </Button>
                          ) : (
                            <span className="type-body-sm text-muted-foreground">{`Chờ ${step.who}`}</span>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>

            <div className="flex shrink-0 justify-end gap-3 border-t px-6 py-4">
              <Button type="button" variant="outline" className="h-11" onClick={() => onOpenProfile(residentId)}>
                Mở hồ sơ
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {opened?.open === 'health-sheet' && (
        <InitialHealthSheet
          residentId={residentId}
          residentName={info?.fullName}
          allowedCommands={profile?.allowedCommands ?? []}
          onClose={closeInner}
          onDone={closeInner}
        />
      )}
      {(opened?.open === 'health' || opened?.open === 'wishes') && (
        <ResidentPartSheet residentId={residentId} part={opened.open} onClose={closeInner} onChanged={load} />
      )}
      {opened?.open === 'assessment' && (
        <AssessmentSheet
          assessmentId={opened.draftId}
          residentId={residentId}
          residentName={info?.fullName}
          resident={profile}
          residentStatus={profile?.status}
          currentLevel={profile?.currentCareLevel ?? null}
          canConfirm={(profile?.allowedCommands ?? []).includes('CONFIRM_ASSESSMENT')}
          onClose={closeInner}
          onChanged={load}
          onConfirmed={(result) => {
            closeInner()
            const level = CARE_LEVEL_LABELS[result?.assessment?.careLevel]
            setNotice(level ? `Đã xác nhận đánh giá đầu vào: ${level}` : 'Đã xác nhận đánh giá đầu vào')
          }}
        />
      )}
    </>
  )
}
