import { useEffect, useState } from 'react'
import {
  getCarePlansById,
  getTaskTypes,
  putCarePlansByIdItems,
  putCarePlansByIdRiskAgreements,
  postCarePlansByIdIssue,
  postCarePlansByIdCancel,
  postCarePlansByIdWithdraw,
} from '@/api'
import { Button } from '@/components/ui/button'
import { ProblemAlert } from '@/common/ProblemAlert'
import { PermissionDeniedState } from '@/common/PageState'
import { StatusBadge } from '@/common/StatusBadge'
import { formatDate, formatDateTime } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { isAllowed } from '@/common/permissions/permissions'
import { CareField } from './CareField'
import { CarePlanItemsForm } from './CarePlanItemsForm'
import { CareRiskAgreementsForm } from './CareRiskAgreementsForm'
import { FREQUENCIES, PLAN_STATUS } from './carePlanLabels'

// Q-414 (2026-11-22): Bác sĩ lập và ban hành, không qua duyệt; hủy Nháp, thu hồi bản Chờ hiệu lực đều bắt buộc lý do
const COMMANDS = {
  cancel: postCarePlansByIdCancel,
  withdraw: postCarePlansByIdWithdraw,
}
const LABELS = {
  cancel: 'Hủy phiên bản',
  withdraw: 'Thu hồi ban hành',
}

export function CarePlanDetail({ planId, onChanged, Title = 'h2', Description = 'p' }) {
  const [resource, setResource] = useState(null)
  const [taskTypes, setTaskTypes] = useState([])
  const [loadFailure, setLoadFailure] = useState(null)
  const [problem, setProblem] = useState(null)
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState(false)
  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [dateError, setDateError] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let cancelled = false
    getCarePlansById({ path: { id: planId } })
      .then((value) => {
        if (!cancelled) {
          setResource(value)
          setLoadFailure(null)
          setEffectiveFrom(value.data.effectiveFrom ?? '')
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
  function refresh() {
    setResource(null)
    setProblem(null)
    setReasonError(false)
    setReason('')
    setReload((value) => value + 1)
    onChanged?.()
  }
  async function command(operation, body, match = false) {
    setBusy(true)
    setProblem(null)
    setReasonError(false)
    try {
      await operation({
        path: { id: planId },
        body,
        headers: { 'Idempotency-Key': crypto.randomUUID(), ...(match && { 'If-Match': resource.etag }) },
      })
      setMessage('Đã lưu thay đổi.')
      refresh()
    } catch (error) {
      const value = problemOf(error)
      setProblem(value)
      if (value.errorCode === 'REASON_REQUIRED') setReasonError(true)
      if (value.errorCode === 'ALREADY_PROCESSED') {
        setMessage('Yêu cầu đã được xử lý. Đã tải lại phiên bản.')
        refresh()
      }
    } finally {
      setBusy(false)
    }
  }
  function transition(name) {
    if (!reason.trim()) {
      setReasonError(true)
      return
    }
    command(COMMANDS[name], { reason: reason.trim() })
  }
  function submit(event) {
    event.preventDefault()
    if (!effectiveFrom) {
      setDateError(true)
      return
    }
    setDateError(false)
    command(postCarePlansByIdIssue, { effectiveFrom, ...(reason.trim() && { changeReason: reason.trim() }) })
  }
  if (loadFailure?.status === 403) return <PermissionDeniedState label="kế hoạch chăm sóc" />
  if (loadFailure) return <ProblemAlert problem={loadFailure} />
  if (!resource) return <p role="status">Đang tải phiên bản…</p>
  const plan = resource.data
  const editable = isAllowed(plan, 'replaceItems')
  return (
    <div className="flex min-w-0 flex-col gap-5" aria-busy={busy}>
      <Title className="type-title">Phiên bản {plan.revision}</Title>
      <Description className="type-body-sm text-muted-foreground">Kế hoạch chăm sóc theo phiên bản</Description>
      <StatusBadge status={PLAN_STATUS[plan.status] ?? plan.status} />
      <div className="type-body-sm flex flex-col gap-1">
        <p>Người lập: {plan.createdBy}</p>
        {plan.approvedBy && <p>Người ban hành: {plan.approvedBy}</p>}
        {plan.approvedAt && <p>Ban hành lúc: {formatDateTime(plan.approvedAt)}</p>}
        {plan.effectiveFrom && (
          <p>
            Hiệu lực từ {formatDate(plan.effectiveFrom)}
            {plan.effectiveTo ? ` đến ${formatDate(plan.effectiveTo)}` : ''}
          </p>
        )}
        {plan.changeReason && <p>Lý do thay đổi: {plan.changeReason}</p>}
      </div>
      {plan.noEffectivePlan && (
        <p className="rounded-lg bg-muted p-3">Người cao tuổi chưa có kế hoạch đang hiệu lực.</p>
      )}
      <p role="status" className="type-body-sm">
        {message}
      </p>
      <ProblemAlert problem={problem}>
        {problem?.status === 412 && (
          <>
            <p>Trạng thái mới: {PLAN_STATUS[problem.currentValue?.status] ?? 'Có cập nhật từ người khác'}</p>
            <Button type="button" variant="outline" onClick={refresh}>
              Tải lại phiên bản
            </Button>
          </>
        )}
      </ProblemAlert>
      {editable ? (
        <CarePlanItemsForm
          key={`items-${reload}`}
          items={plan.items ?? []}
          taskTypes={taskTypes}
          busy={busy || problem?.status === 412}
          onSave={(items) => command(putCarePlansByIdItems, items, true)}
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
      {(plan.allowedCommands ?? []).some((name) => ['issue', ...Object.keys(COMMANDS)].includes(name)) && (
        <section className="flex flex-col gap-4 border-t pt-4">
          <CareField
            label={isAllowed(plan, 'issue') ? 'Lý do thay đổi' : 'Lý do'}
            value={reason}
            onChange={setReason}
            type="textarea"
            maxLength={2000}
          />
          {reasonError && (
            <p role="alert" className="text-destructive">
              Nhập lý do trước khi thực hiện.
            </p>
          )}
          {isAllowed(plan, 'issue') && (
            <form className="flex flex-col gap-3" onSubmit={submit}>
              <CareField label="Ngày hiệu lực" value={effectiveFrom} onChange={setEffectiveFrom} type="date" />
              <p className="type-body-sm text-muted-foreground">Sớm nhất từ ngày mai. Ban hành xong kế hoạch không cần duyệt.</p>
              {dateError && <p role="alert">Chọn ngày hiệu lực.</p>}
              <Button type="submit" disabled={busy || problem?.status === 412}>
                Ban hành kế hoạch
              </Button>
            </form>
          )}
          <div className="flex flex-wrap gap-3">
            {Object.entries(LABELS)
              .filter(([name]) => isAllowed(plan, name))
              .map(([name, label]) => (
                <Button
                  key={name}
                  variant="outline"
                  disabled={busy || problem?.status === 412}
                  onClick={() => transition(name)}
                >
                  {label}
                </Button>
              ))}
          </div>
        </section>
      )}
    </div>
  )
}
