import { useEffect, useState } from 'react'
import {
  getCarePlansById,
  getCarePlansCompare,
  getTaskTypes,
  putCarePlansByIdItems,
  postCarePlansByIdSubmit,
  postCarePlansByIdApprove,
  postCarePlansByIdReturn,
  postCarePlansByIdCancel,
  postCarePlansByIdRetract,
} from '@/api'
import { Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { SectionTabs } from '@/common/SectionTabs'
import { ProblemAlert } from '@/common/ProblemAlert'
import { PermissionDeniedState } from '@/common/PageState'
import { StatusBadge } from '@/common/StatusBadge'
import { formatDate, formatDateTime } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { isAllowed } from '@/common/permissions/permissions'
import { AssessmentBasis } from './AssessmentBasis'
import { CareField } from './CareField'
import { CarePlanComparison } from './CarePlanComparison'
import { CarePlanItemsForm } from './CarePlanItemsForm'
import { CARE_ROLES, IMPORTANCE, PLAN_STATUS, frequencyText, planLabel } from './carePlanLabels'

// Q-447: bỏ Thu hồi duyệt; thêm Rút lại (người lập kéo bản Chờ duyệt về soạn tiếp, không cần lý do)
const COMMANDS = {
  retract: postCarePlansByIdRetract,
  approve: postCarePlansByIdApprove,
  return: postCarePlansByIdReturn,
  cancel: postCarePlansByIdCancel,
  discardDraft: postCarePlansByIdCancel,
}
// Q-449: người lập tự bỏ bản Nháp của mình (discardDraft) không cần lý do; bỏ bản khác (cancel) vẫn bắt buộc lý do
const LABELS = {
  discardDraft: 'Bỏ bản nháp',
  retract: 'Rút lại',
  approve: 'Duyệt',
  return: 'Trả lại',
  cancel: 'Bỏ bản sửa',
}
const DISCARDS = ['discardDraft', 'cancel']
const NO_REASON = ['approve', 'retract']

// currentPlanId, currentEffectiveFrom: kế hoạch đang áp dụng, để hiện thay đổi và dải báo bản nháp (FR-008, Q-447)
// resident: dòng "Họ tên · Mã hồ sơ" ở đầu hộp thoại; onDirtyChange: báo còn thay đổi chưa lưu (hỏi trước khi đóng)
export function CarePlanDetail({
  planId,
  currentPlanId,
  currentEffectiveFrom,
  resident,
  onChanged,
  onDirtyChange,
  Title = 'h2',
  Description = 'p',
}) {
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelMode, setCancelMode] = useState('cancel')
  const [cancelReason, setCancelReason] = useState('')
  const [cancelError, setCancelError] = useState(false)
  const [itemsDirty, setItemsDirty] = useState(false)
  const [tab, setTab] = useState(null)
  const [resource, setResource] = useState(null)
  const [taskTypes, setTaskTypes] = useState([])
  const [loadFailure, setLoadFailure] = useState(null)
  const [problem, setProblem] = useState(null)
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState(false)
  const [message, setMessage] = useState('')
  const [comparison, setComparison] = useState(null)
  useEffect(() => {
    let cancelled = false
    getCarePlansById({ path: { id: planId } })
      .then((value) => {
        if (!cancelled) {
          setResource(value)
          setLoadFailure(null)
        }
      })
      .catch((error) => {
        if (!cancelled) setLoadFailure(problemOf(error))
      })
    getTaskTypes()
      .then(({ data }) => {
        if (!cancelled) setTaskTypes(data)
      })
      .catch((error) => {
        if (!cancelled) setProblem(problemOf(error))
      })
    return () => {
      cancelled = true
    }
  }, [planId, reload])
  const pendingApproval = resource?.data.status === 'PENDING_APPROVAL'
  const inProgress = pendingApproval || resource?.data.status === 'DRAFT'
  const reasonDirty = resource?.data.status === 'DRAFT' && reason.trim() !== ''
  useEffect(() => {
    onDirtyChange?.(itemsDirty || reasonDirty)
  }, [itemsDirty, reasonDirty, onDirtyChange])
  useEffect(() => {
    if (!inProgress || !currentPlanId) return undefined
    let cancelled = false
    getCarePlansCompare({ query: { from: currentPlanId, to: planId } })
      .then(({ data }) => {
        if (!cancelled) setComparison(data)
      })
      .catch((error) => {
        if (!cancelled) setProblem(problemOf(error))
      })
    return () => {
      cancelled = true
    }
  }, [inProgress, currentPlanId, planId, reload])
  function refresh() {
    setResource(null)
    setProblem(null)
    setReasonError(false)
    setReason('')
    setComparison(null)
    setItemsDirty(false)
    setReload((value) => value + 1)
    onChanged?.()
  }
  function failed(error) {
    const value = problemOf(error)
    setProblem(value)
    if (value.errorCode === 'REASON_REQUIRED') setReasonError(true)
    if (value.errorCode === 'ALREADY_PROCESSED') {
      setMessage('Yêu cầu đã được xử lý. Đã tải lại kế hoạch.')
      refresh()
    }
  }
  const request = (body, match = false) => ({
    path: { id: planId },
    body,
    headers: { 'Idempotency-Key': crypto.randomUUID(), ...(match && { 'If-Match': resource.etag }) },
  })
  async function command(operation, body, match = false) {
    setBusy(true)
    setProblem(null)
    setReasonError(false)
    try {
      await operation(request(body, match))
      setMessage('Đã lưu thay đổi.')
      refresh()
    } catch (error) {
      failed(error)
    } finally {
      setBusy(false)
    }
  }
  // "Gửi Bác sĩ duyệt": lưu mục rồi gửi; không có ngày hiệu lực (Q-447)
  async function sendForApproval(items) {
    setBusy(true)
    setProblem(null)
    setReasonError(false)
    try {
      await putCarePlansByIdItems(request(items, true))
      // Lưu mục làm tăng phiên bản dữ liệu: lấy ETag mới để lần gửi lại (vd. thiếu lý do) không bị 412
      setResource(await getCarePlansById({ path: { id: planId } }))
      await postCarePlansByIdSubmit(request(reason.trim() ? { changeReason: reason.trim() } : {}))
      setMessage('Đã gửi Bác sĩ duyệt.')
      refresh()
    } catch (error) {
      failed(error)
    } finally {
      setBusy(false)
    }
  }
  function confirmCancel() {
    const withoutReason = cancelMode === 'discardDraft'
    if (!withoutReason && !cancelReason.trim()) {
      setCancelError(true)
      return
    }
    setCancelOpen(false)
    command(COMMANDS.cancel, withoutReason ? {} : { reason: cancelReason.trim() })
  }
  function transition(name) {
    if (DISCARDS.includes(name)) {
      setCancelMode(name)
      setCancelReason('')
      setCancelError(false)
      setCancelOpen(true)
      return
    }
    if (!NO_REASON.includes(name) && !reason.trim()) {
      setReasonError(true)
      return
    }
    command(COMMANDS[name], reason.trim() ? { reason: reason.trim() } : {})
  }
  if (loadFailure?.status === 403) return <PermissionDeniedState label="kế hoạch chăm sóc" />
  if (loadFailure) return <ProblemAlert problem={loadFailure} />
  if (!resource)
    return (
      <p role="status" className="p-6">
        Đang tải kế hoạch…
      </p>
    )
  const plan = resource.data
  const editable = isAllowed(plan, 'replaceItems')
  const hasPlan = !plan.noEffectivePlan || Boolean(currentPlanId)
  const commands = Object.keys(LABELS).filter((name) => isAllowed(plan, name))
  const showChanges = inProgress && Boolean(currentPlanId)
  const changesTab = ['changes', 'Thay đổi so với kế hoạch đang áp dụng']
  // Bác sĩ duyệt xem thay đổi trước; người soạn xem mục trước
  const tabs = !showChanges
    ? [['items', 'Mục công việc']]
    : pendingApproval
      ? [changesTab, ['items', 'Mục công việc']]
      : [['items', 'Mục công việc'], changesTab]
  const draft = plan.status === 'DRAFT'
  const heading = draft
    ? hasPlan
      ? 'Bản nháp sửa kế hoạch'
      : 'Bản nháp kế hoạch'
    : hasPlan && pendingApproval
      ? 'Bản sửa kế hoạch'
      : 'Kế hoạch chăm sóc'
  const activeTab = tabs.some(([key]) => key === tab) ? tab : tabs[0][0]
  const names = Object.fromEntries(taskTypes.map((type) => [String(type.id), type.name]))
  const reasonAlert = reasonError && (
    <p role="alert" className="type-body-sm text-destructive">
      Nhập lý do trước khi thực hiện.
    </p>
  )
  const commandButtons = (only) =>
    commands
      .filter((name) => only.includes(name))
      .map((name) => (
        <Button
          key={name}
          variant={name === 'approve' ? 'default' : DISCARDS.includes(name) ? 'destructive' : 'outline'}
          disabled={busy || problem?.status === 412}
          onClick={() => transition(name)}
        >
          {LABELS[name]}
        </Button>
      ))
  return (
    <div className="flex min-h-full min-w-0 flex-col" aria-busy={busy}>
      <header className="flex flex-col gap-3 border-b bg-card px-6 pt-5 pr-14">
        {resident && <p className="type-body-sm text-muted-foreground">{resident}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Title>
            {/* SheetTitle có sẵn text-base; cỡ chữ đặt ở phần chữ bên trong */}
            <span className="type-section">{heading}</span>
          </Title>
          <StatusBadge status={planLabel(plan, hasPlan)} />
        </div>
        <Description className="sr-only">
          {editable ? 'Soạn mục công việc rồi gửi Bác sĩ duyệt' : 'Nội dung kế hoạch'}
        </Description>
        {/* Chủ dự án bỏ phần thỏa thuận rủi ro khỏi màn này (2026-11-26); một phần thì không cần tab */}
        {tabs.length > 1 ? (
          <SectionTabs label="Phần của kế hoạch" tabs={tabs} value={activeTab} onChange={setTab} />
        ) : (
          <div className="pb-1" />
        )}
      </header>
      <div className="flex flex-1 flex-col gap-5 bg-background px-6 py-5">
        {inProgress && (
          <p className="rounded-xl border border-(--warning-foreground)/30 bg-warning px-4 py-3 type-body-sm text-warning-foreground">
            <strong>{draft ? 'Bản nháp – chưa áp dụng.' : 'Bản sửa chờ Bác sĩ duyệt – chưa áp dụng.'}</strong> Do{' '}
            {plan.createdBy} lập.{' '}
            {currentEffectiveFrom
              ? `Kế hoạch đang áp dụng vẫn là bản hiệu lực từ ${formatDate(currentEffectiveFrom)}.`
              : hasPlan
                ? 'Kế hoạch đang áp dụng giữ nguyên.'
                : 'Người cao tuổi chưa có kế hoạch đang áp dụng.'}{' '}
            Mọi thay đổi ở đây chỉ có hiệu lực sau khi Bác sĩ duyệt.
          </p>
        )}
        {/* Q-448: căn cứ để Điều dưỡng biết lập mục nào, ngay trong hộp thoại vì hộp thoại che màn phía sau */}
        {inProgress && plan.residentId && (
          <AssessmentBasis residentId={plan.residentId} title="Căn cứ: đánh giá của Bác sĩ" />
        )}
        <section className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2" aria-label="Thông tin kế hoạch">
          <div>
            <p className="type-caption text-muted-foreground">Người lập</p>
            <p className="type-body font-semibold">{plan.createdBy}</p>
          </div>
          <div>
            <p className="type-caption text-muted-foreground">Người duyệt</p>
            <p className="type-body">
              {plan.approvedBy ? `${plan.approvedBy}${plan.selfApproved ? ' · Tự duyệt' : ''}` : 'Chưa duyệt'}
            </p>
            {plan.approvedAt && (
              <p className="type-caption text-muted-foreground">Duyệt lúc {formatDateTime(plan.approvedAt)}</p>
            )}
          </div>
          {plan.effectiveFrom && (
            <p className="type-body-sm text-muted-foreground sm:col-span-2">
              Hiệu lực từ {formatDate(plan.effectiveFrom)}
              {plan.effectiveTo ? ` đến ${formatDate(plan.effectiveTo)}` : ''}
            </p>
          )}
          <div className="flex flex-col gap-1 sm:col-span-2">
            {editable
              ? hasPlan && (
                  <CareField
                    label="Lý do sửa *"
                    name="Lý do sửa"
                    value={reason}
                    onChange={setReason}
                    type="textarea"
                    maxLength={2000}
                    hint="Bắt buộc khi sửa kế hoạch đã có."
                  />
                )
              : plan.changeReason && (
                  <>
                    <p className="type-caption text-muted-foreground">Lý do sửa</p>
                    <p className="type-body">{plan.changeReason}</p>
                  </>
                )}
            {editable && reasonAlert}
          </div>
        </section>
        <p role="status" className="type-body-sm empty:hidden">
          {message}
        </p>
        <ProblemAlert problem={problem}>
          {problem?.status === 412 && (
            <>
              <p>Trạng thái mới: {PLAN_STATUS[problem.currentValue?.status] ?? 'Có cập nhật từ người khác'}</p>
              <Button type="button" variant="outline" onClick={refresh}>
                Tải lại kế hoạch
              </Button>
            </>
          )}
        </ProblemAlert>
        {activeTab === 'changes' &&
          (comparison ? (
            <CarePlanComparison value={comparison} taskTypes={taskTypes} />
          ) : (
            <p role="status">Đang tải thay đổi…</p>
          ))}
        {activeTab === 'items' &&
          (editable ? (
            <CarePlanItemsForm
              key={`items-${reload}`}
              items={plan.items ?? []}
              taskTypes={taskTypes}
              busy={busy || problem?.status === 412}
              onSave={(items) => command(putCarePlansByIdItems, items, true)}
              onSubmitForApproval={isAllowed(plan, 'submit') ? sendForApproval : undefined}
              leading={commandButtons(DISCARDS)}
              onDirtyChange={setItemsDirty}
            />
          ) : (
            <section className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="type-title">Mục công việc</h3>
                <span className="type-body-sm text-muted-foreground">{(plan.items ?? []).length} mục</span>
              </div>
              {(plan.items ?? []).map((item, index) => {
                const { main, sub } = frequencyText(item)
                return (
                  <article key={item.id} className="flex flex-col gap-1 rounded-xl border bg-card p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="type-card-title">
                        Mục {index + 1} · {names[String(item.taskTypeId)] ?? `Loại công việc mã ${item.taskTypeId}`}
                      </h4>
                      {item.importance && <StatusBadge status={IMPORTANCE[item.importance]} />}
                    </div>
                    <p className="type-body-sm text-muted-foreground">{item.content}</p>
                    <p className="type-body-sm">
                      {[main, sub, CARE_ROLES[item.performerRole]].filter(Boolean).join(' · ')}
                    </p>
                    {item.waterTargetMl != null && (
                      <p className="type-body-sm font-semibold text-primary">
                        Mục tiêu nước {Number(item.waterTargetMl).toLocaleString('vi-VN')} ml/ngày
                      </p>
                    )}
                  </article>
                )
              })}
            </section>
          ))}
      </div>
      {!editable && commands.length > 0 && (
        <footer className="sticky bottom-0 flex flex-col gap-3 border-t bg-card px-6 py-4">
          <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
            <CareField
              label="Lý do"
              value={reason}
              onChange={setReason}
              type="textarea"
              maxLength={2000}
              placeholder="Nhập lý do"
            />
            {isAllowed(plan, 'approve') && (
              <p className="flex items-center gap-2 type-body-sm font-semibold text-primary sm:pt-8">
                <Clock className="size-4" aria-hidden="true" />
                {hasPlan ? 'Duyệt xong, bản sửa áp dụng từ ngày mai.' : 'Duyệt xong, kế hoạch có hiệu lực ngay.'}
              </p>
            )}
          </div>
          {reasonAlert}
          <div className="flex flex-wrap justify-end gap-3">
            {commandButtons([...DISCARDS, 'retract', 'return', 'approve'])}
          </div>
        </footer>
      )}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent role="alertdialog" className="sm:max-w-md">
          <DialogTitle className="type-title">
            {cancelMode === 'discardDraft' ? 'Bỏ bản nháp này?' : 'Bỏ bản sửa này?'}
          </DialogTitle>
          <DialogDescription>
            {cancelMode === 'discardDraft'
              ? 'Kế hoạch đang áp dụng giữ nguyên. Phần đã soạn trong bản nháp sẽ bị bỏ.'
              : 'Kế hoạch đang áp dụng giữ nguyên. Mọi phần đã soạn trong bản này, kể cả phần người khác đã lưu, sẽ bị bỏ.'}
          </DialogDescription>
          {cancelMode !== 'discardDraft' && (
            <CareField
              label="Lý do bỏ bản sửa"
              value={cancelReason}
              onChange={setCancelReason}
              type="textarea"
              maxLength={2000}
            />
          )}
          {cancelError && (
            <p role="alert" className="type-body-sm text-destructive">
              Nhập lý do bỏ bản sửa.
            </p>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Quay lại
            </Button>
            <Button variant="destructive" disabled={busy} onClick={confirmCancel}>
              {LABELS[cancelMode]}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
