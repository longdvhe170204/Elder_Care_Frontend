import { useEffect, useState } from 'react'
import { getResidentsByResidentIdCarePlans, getTaskTypes, postResidentsByResidentIdCarePlans } from '@/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/common/PageHeader'
import { StatusBadge } from '@/common/StatusBadge'
import { ProblemAlert } from '@/common/ProblemAlert'
import { PermissionDeniedState } from '@/common/PageState'
import { usePermissions } from '@/common/permissions/permissions'
import { formatDate } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { CarePlanDetail } from './CarePlanDetail'
import { ResidentSearch } from './ResidentSearch'
import { CARE_ROLES, IMPORTANCE, frequencyText, planLabel, planState, residentLabel } from './carePlanLabels'

// Kế hoạch hiện hành dạng bảng (Figma "Kế hoạch chăm sóc · Kế hoạch hiện hành")
function CurrentItems({ plan, typeName }) {
  return (
    <Table aria-label="Mục của kế hoạch hiện hành">
      <TableHeader>
        <TableRow className="bg-muted hover:bg-muted">
          <TableHead>Loại công việc</TableHead>
          <TableHead>Nội dung</TableHead>
          <TableHead>Tần suất và giờ</TableHead>
          <TableHead>Vai trò thực hiện</TableHead>
          <TableHead>Mức quan trọng</TableHead>
          <TableHead>Mục tiêu nước</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {(plan.items ?? []).map((item) => {
          const { main, sub } = frequencyText(item)
          return (
            <TableRow key={item.id} className="align-top">
              <TableCell className="font-semibold whitespace-normal">{typeName(item.taskTypeId)}</TableCell>
              <TableCell className="max-w-72 whitespace-normal text-muted-foreground">{item.content}</TableCell>
              <TableCell className="whitespace-normal">
                <span className="block font-semibold">{main}</span>
                {sub && <span className="block type-body-sm text-muted-foreground">{sub}</span>}
              </TableCell>
              <TableCell className="whitespace-normal">{CARE_ROLES[item.performerRole] ?? '—'}</TableCell>
              <TableCell>{item.importance ? <StatusBadge status={IMPORTANCE[item.importance]} /> : '—'}</TableCell>
              <TableCell className="font-semibold text-primary">
                {item.waterTargetMl != null ? `${Number(item.waterTargetMl).toLocaleString('vi-VN')} ml/ngày` : '—'}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

// Q-447: một kế hoạch trên màn (hiện hành + bản sửa đang xử lý), không hiện phiên bản. Bản sửa mở trong hộp thoại giữa
// màn (chủ dự án yêu cầu 2026-11-26, thay panel trượt phải của Figma; bố cục riêng của màn, DESIGN.md mục 0).
export function CarePlanPage({ residentId: initialResidentId = 0 }) {
  const { can } = usePermissions()
  const [resident, setResident] = useState(initialResidentId ? { id: initialResidentId } : null)
  const residentId = resident?.id ?? 0
  const [plans, setPlans] = useState(null)
  const [taskTypes, setTaskTypes] = useState([])
  const [failure, setFailure] = useState(null)
  const [selected, setSelected] = useState(null)
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    getTaskTypes()
      .then(({ data }) => setTaskTypes(data))
      .catch(() => setTaskTypes([]))
  }, [])
  useEffect(() => {
    if (!residentId) return undefined
    let cancelled = false
    getResidentsByResidentIdCarePlans({ path: { residentId } })
      .then(({ data }) => {
        if (!cancelled) {
          setPlans(data)
          setFailure(null)
        }
      })
      .catch((error) => {
        if (!cancelled) setFailure(problemOf(error))
      })
    return () => {
      cancelled = true
    }
  }, [residentId, reload])
  async function create() {
    setBusy(true)
    setFailure(null)
    try {
      const { data } = await postResidentsByResidentIdCarePlans({
        path: { residentId },
        body: {},
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      })
      setSelected(data.id)
      setReload((value) => value + 1)
    } catch (error) {
      setFailure(problemOf(error))
    } finally {
      setBusy(false)
    }
  }
  function choose(next) {
    setResident(next)
    setPlans(null)
    setSelected(null)
    setFailure(null)
  }
  const names = Object.fromEntries(taskTypes.map((type) => [String(type.id), type.name]))
  const typeName = (id) => names[String(id)] ?? `Loại công việc mã ${id}`
  const { current, scheduled, open } = planState(plans)
  const hasPlan = Boolean(scheduled ?? current)
  const canCreate = can('CARE_PLAN', 'CREATE') && !open
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <PageHeader title="Kế hoạch chăm sóc" subtitle="Điều dưỡng lập, sửa kế hoạch rồi gửi Bác sĩ duyệt" />
      <ResidentSearch onChange={choose} />
      {failure?.status === 403 ? (
        <PermissionDeniedState label="kế hoạch chăm sóc" />
      ) : (
        <>
          <ProblemAlert problem={failure} />
          {residentId ? (
            <section className="flex flex-col gap-4 rounded-xl border bg-card p-5" aria-busy={busy || plans === null}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <h2 className="type-title">Kế hoạch hiện hành</h2>
                  {current && (
                    <p className="type-body-sm text-muted-foreground">Hiệu lực từ {formatDate(current.effectiveFrom)}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {scheduled && <StatusBadge status={planLabel(scheduled, true)} />}
                  {open && <StatusBadge status={planLabel(open, hasPlan)} />}
                  {open && (
                    <Button variant="outline" onClick={() => setSelected(open.id)}>
                      {hasPlan ? 'Mở bản sửa' : 'Mở kế hoạch đang soạn'}
                    </Button>
                  )}
                  {canCreate && plans !== null && (
                    <Button disabled={busy} onClick={create}>
                      {hasPlan ? 'Sửa kế hoạch' : 'Lập kế hoạch'}
                    </Button>
                  )}
                </div>
              </div>
              {plans === null ? (
                <p role="status">Đang tải kế hoạch…</p>
              ) : current ? (
                <CurrentItems plan={current} typeName={typeName} />
              ) : (
                <p>Chưa có kế hoạch chăm sóc đang hiệu lực.</p>
              )}
            </section>
          ) : (
            <p>Chọn người cao tuổi để xem kế hoạch.</p>
          )}
        </>
      )}
      <Dialog open={selected !== null} onOpenChange={(next) => !next && setSelected(null)}>
        <DialogContent className="block max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-[960px]">
          {selected !== null && (
            <CarePlanDetail
              key={selected}
              planId={selected}
              currentPlanId={current?.id}
              resident={resident?.personalInfo ? residentLabel(resident) : null}
              Title={DialogTitle}
              Description={DialogDescription}
              onChanged={() => setReload((value) => value + 1)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
