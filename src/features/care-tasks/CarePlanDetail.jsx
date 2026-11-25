import { useEffect, useState } from 'react'
import {
  getCarePlansById,
  getCarePlansCompare,
  getTaskTypes,
  putCarePlansByIdItems,
  putCarePlansByIdRiskAgreements,
  postCarePlansByIdSubmit,
  postCarePlansByIdApprove,
  postCarePlansByIdReturn,
  postCarePlansByIdCancel,
  postCarePlansByIdRetract,
} from '@/api'
import { Button } from '@/components/ui/button'
import { ProblemAlert } from '@/common/ProblemAlert'
import { PermissionDeniedState } from '@/common/PageState'
import { StatusBadge } from '@/common/StatusBadge'
import { formatDate, formatDateTime } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { isAllowed } from '@/common/permissions/permissions'
import { CareField } from './CareField'
import { CarePlanComparison } from './CarePlanComparison'
import { CarePlanItemsForm } from './CarePlanItemsForm'
import { CareRiskAgreementsForm } from './CareRiskAgreementsForm'
import { FREQUENCIES, PLAN_STATUS, planLabel } from './carePlanLabels'

// Q-447: bỏ Thu hồi duyệt; thêm Rút lại (người lập kéo bản Chờ duyệt về soạn tiếp, không cần lý do)
const COMMANDS = {
  retract: postCarePlansByIdRetract,
  approve: postCarePlansByIdApprove,
  return: postCarePlansByIdReturn,
  cancel: postCarePlansByIdCancel,
}
const LABELS = {
  retract: 'Rút lại',
  approve: 'Duyệt',
  return: 'Trả lại',
  cancel: 'Bỏ bản sửa',
}
const NO_REASON = ['approve', 'retract']

// currentPlanId: kế hoạch Hiệu lực để hiện thay đổi khi bản sửa Chờ duyệt (FR-008, sửa Q-447)
export function CarePlanDetail({ planId, currentPlanId, onChanged, Title = 'h2', Description = 'p' }) {
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
  useEffect(() => {
    if (!pendingApproval || !currentPlanId) return undefined
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
  }, [pendingApproval, currentPlanId, planId])
  function refresh() {
    setResource(null)
    setProblem(null)
    setReasonError(false)
    setReason('')
    setComparison(null)
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
      await postCarePlansByIdSubmit(request(reason.trim() ? { changeReason: reason.trim() } : {}))
      setMessage('Đã gửi Bác sĩ duyệt.')
      refresh()
    } catch (error) {
      failed(error)
    } finally {
      setBusy(false)
    }
  }
  function transition(name) {
    if (!NO_REASON.includes(name) && !reason.trim()) {
      setReasonError(true)
      return
    }
    command(COMMANDS[name], reason.trim() ? { reason: reason.trim() } : {})
  }
  if (loadFailure?.status === 403) return <PermissionDeniedState label="kế hoạch chăm sóc" />
  if (loadFailure) return <ProblemAlert problem={loadFailure} />
  if (!resource) return <p role="status">Đang tải kế hoạch…</p>
  const plan = resource.data
  const editable = isAllowed(plan, 'replaceItems')
  const hasPlan = !plan.noEffectivePlan || Boolean(currentPlanId)
  const commands = Object.keys(LABELS).filter((name) => isAllowed(plan, name))
  return (
    <div className="flex min-w-0 flex-col gap-5" aria-busy={busy}>
      <Title className="type-title">Kế hoạch chăm sóc</Title>
      <Description className="type-body-sm text-muted-foreground">
        {editable ? 'Soạn mục công việc rồi gửi Bác sĩ duyệt' : 'Nội dung kế hoạch'}
      </Description>
      <StatusBadge status={planLabel(plan, hasPlan)} />
      <div className="type-body-sm flex flex-col gap-1">
        <p>Người lập: {plan.createdBy}</p>
        {plan.approvedBy && (
          <p>
            Người duyệt: {plan.approvedBy}
            {plan.selfApproved ? ' · Tự duyệt' : ''}
          </p>
        )}
        {plan.approvedAt && <p>Duyệt lúc: {formatDateTime(plan.approvedAt)}</p>}
        {plan.effectiveFrom && (
          <p>
            Hiệu lực từ {formatDate(plan.effectiveFrom)}
            {plan.effectiveTo ? ` đến ${formatDate(plan.effectiveTo)}` : ''}
          </p>
        )}
        {plan.changeReason && <p>Lý do sửa: {plan.changeReason}</p>}
      </div>
      <p role="status" className="type-body-sm">
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
      {comparison && <CarePlanComparison value={comparison} />}
      {editable && (
        <div className="flex flex-col gap-1">
          <CareField label="Lý do sửa" value={reason} onChange={setReason} type="textarea" maxLength={2000} />
          {hasPlan && <p className="type-body-sm text-muted-foreground">Bắt buộc khi sửa kế hoạch đã có.</p>}
        </div>
      )}
      {editable ? (
        <CarePlanItemsForm
          key={`items-${reload}`}
          items={plan.items ?? []}
          taskTypes={taskTypes}
          busy={busy || problem?.status === 412}
          onSave={(items) => command(putCarePlansByIdItems, items, true)}
          onSubmitForApproval={isAllowed(plan, 'submit') ? sendForApproval : undefined}
        />
      ) : (
        <section className="flex flex-col gap-3">
          <h3 className="type-title">Mục công việc</h3>
          {(plan.items ?? []).map((item) => (
            <article key={item.id} className="rounded-lg border p-3">
              <p>{item.content}</p>
              <p className="type-body-sm text-muted-foreground">
                {FREQUENCIES[item.frequencyType]}
                {item.intervalHours ? ` · ${item.intervalHours} giờ` : ''}
                {item.startsAt ? ` · ${item.startsAt}` : ' · Trong ca'}
              </p>
              {item.waterTargetMl != null && <p>Mục tiêu nước: {item.waterTargetMl} ml/ngày</p>}
            </article>
          ))}
        </section>
      )}
      {isAllowed(plan, 'replaceRiskAgreements') ? (
        <CareRiskAgreementsForm
          key={`risks-${reload}`}
          agreements={plan.riskAgreements ?? []}
          busy={busy || problem?.status === 412}
          onSave={(rows) => command(putCarePlansByIdRiskAgreements, rows, true)}
        />
      ) : (
        <section className="flex flex-col gap-3">
          <h3 className="type-title">Thỏa thuận lựa chọn có rủi ro</h3>
          {(plan.riskAgreements ?? []).map((risk) => (
            <article key={risk.id} className="flex flex-col gap-2 rounded-lg border p-3">
              <p className="type-label">{risk.choice}</p>
              <p>{risk.discussedRisks}</p>
              <p>Xem lại thỏa thuận: {formatDate(risk.reviewDate)}</p>
              <p>{risk.selfDeterminationAssessment.supportMethod}</p>
              <p>Xem lại nhận định: {formatDate(risk.selfDeterminationAssessment.reviewDate)}</p>
              {risk.opinions?.map((opinion, index) => (
                <div key={index}>
                  <p>{opinion.content}</p>
                  <p className="type-body-sm text-muted-foreground">
                    {opinion.recordedBy}
                    {opinion.at ? ` · ${formatDateTime(opinion.at)}` : ''}
                  </p>
                </div>
              ))}
            </article>
          ))}
        </section>
      )}
      {commands.length > 0 && (
        <section className="flex flex-col gap-4 border-t pt-4">
          {!editable && (
            <CareField label="Lý do" value={reason} onChange={setReason} type="textarea" maxLength={2000} />
          )}
          {isAllowed(plan, 'approve') && (
            <p className="type-body-sm text-muted-foreground">
              {hasPlan
                ? 'Duyệt xong, bản sửa áp dụng từ ngày mai. Tự duyệt bắt buộc có lý do.'
                : 'Duyệt xong, kế hoạch có hiệu lực ngay. Tự duyệt bắt buộc có lý do.'}
            </p>
          )}
          {reasonError && (
            <p role="alert" className="text-destructive">
              Nhập lý do trước khi thực hiện.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {commands.map((name) => (
              <Button
                key={name}
                variant={name === 'approve' ? 'default' : 'outline'}
                disabled={busy || problem?.status === 412}
                onClick={() => transition(name)}
              >
                {LABELS[name]}
              </Button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
