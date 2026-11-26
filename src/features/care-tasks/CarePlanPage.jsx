import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import {
  getCarePlansCompare,
  getResidentsByResidentIdCarePlans,
  getTaskTypes,
  postResidentsByResidentIdCarePlans,
} from '@/api'
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
import { CarePlanQueue } from './CarePlanQueue'
import { CarePlanReviewNotice } from './CarePlanReviewNotice'
import { ResidentSearch } from './ResidentSearch'
import { CARE_ROLES, IMPORTANCE, frequencyText, planLabel, planState, residentLabel } from './carePlanLabels'

// Kế hoạch hiện hành dạng bảng (Figma "Kế hoạch chăm sóc · Kế hoạch hiện hành")
function CurrentItems({ plan, typeName }) {
  return (
    <Table aria-label="Mục của kế hoạch đang áp dụng">
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
  // Đổi key để ô tìm xóa chữ khi quay về hàng chờ
  const [searchKey, setSearchKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [askClose, setAskClose] = useState(false)
  const [changes, setChanges] = useState({ key: null, count: null })
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
  // Số thay đổi của bản nháp so với kế hoạch đang áp dụng, để người mở sau biết bản nháp đã đổi gì
  const compareKey = current?.id && open?.id ? `${current.id}:${open.id}:${reload}` : null
  useEffect(() => {
    if (!compareKey) return undefined
    const [from, to] = compareKey.split(':').map(Number)
    let cancelled = false
    getCarePlansCompare({ query: { from, to } })
      .then(({ data }) => {
        if (!cancelled)
          setChanges({ key: compareKey, count: data.added.length + data.removed.length + data.changed.length })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [compareKey])
  const changeCount = changes.key === compareKey ? changes.count : null
  function close() {
    setAskClose(false)
    setDirty(false)
    setSelected(null)
  }
  // Đóng khi còn thay đổi chưa lưu thì hỏi trước (chủ dự án 2026-11-26)
  function requestClose() {
    if (dirty) setAskClose(true)
    else close()
  }
  const draftOpen = open?.status === 'DRAFT'
  const draftLine = !open
    ? ''
    : !current
      ? `${open.createdBy ?? 'Người lập'} ${draftOpen ? 'đang soạn' : 'đã gửi'} kế hoạch đầu tiên`
      : `${open.createdBy ?? 'Người lập'} ${draftOpen ? 'đang soạn' : 'đã gửi'}${
          changeCount == null ? '' : ` · ${changeCount} thay đổi so với kế hoạch đang áp dụng`
        }`
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <PageHeader title="Kế hoạch chăm sóc" subtitle="Bác sĩ lập và sửa kế hoạch chăm sóc" />
      <ResidentSearch key={searchKey} onChange={choose} />
      {failure?.status === 403 ? (
        <PermissionDeniedState label="kế hoạch chăm sóc" />
      ) : (
        <>
          <ProblemAlert problem={failure} />
          {residentId ? (
            <section className="flex flex-col gap-4 rounded-xl border bg-card p-5" aria-busy={busy || plans === null}>
              <Button
                variant="outline"
                className="self-start border-2"
                onClick={() => {
                  choose(null)
                  setSearchKey((value) => value + 1)
                }}
              >
                Về danh sách cần lập
              </Button>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <h2 className="type-title">Kế hoạch đang áp dụng</h2>
                  {current && (
                    <p className="type-body-sm text-muted-foreground">
                      Hiệu lực từ {formatDate(current.effectiveFrom)}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {scheduled && <StatusBadge status={planLabel(scheduled, true)} />}
                  {canCreate && plans !== null && (
                    <Button disabled={busy} onClick={create}>
                      {hasPlan ? 'Sửa kế hoạch' : 'Lập kế hoạch'}
                    </Button>
                  )}
                </div>
              </div>
              <CarePlanReviewNotice
                residentId={residentId}
                reload={reload}
                canDismiss={can('CARE_PLAN', 'CREATE') || can('CARE_PLAN', 'APPROVE')}
                onDismissed={() => setReload((value) => value + 1)}
              />
              {/* Bản nháp đặt ngay dưới tiêu đề để người mở sau thấy trước bảng dài */}
              {open && (
                <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-(--warning-foreground)/40 bg-warning/40 p-4">
                  <div className="flex flex-col gap-1">
                    <h3 className="type-card-title">
                      {draftOpen ? 'Bản nháp chưa áp dụng' : 'Bản sửa chờ Bác sĩ duyệt'}
                    </h3>
                    <p className="type-body-sm text-muted-foreground">{draftLine}</p>
                  </div>
                  <Button variant="outline" onClick={() => setSelected(open.id)}>
                    {draftOpen ? 'Mở bản nháp' : 'Xem bản sửa'}
                  </Button>
                </section>
              )}
              {plans === null ? (
                <p role="status">Đang tải kế hoạch…</p>
              ) : current ? (
                <CurrentItems plan={current} typeName={typeName} />
              ) : (
                <p>Chưa có kế hoạch chăm sóc đang hiệu lực.</p>
              )}
            </section>
          ) : (
            <CarePlanQueue onChoose={choose} />
          )}
        </>
      )}
      <Dialog open={selected !== null} onOpenChange={(next) => !next && requestClose()}>
        <DialogContent
          showCloseButton={false}
          className="block max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-[960px]"
        >
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute top-3 right-3 z-10"
            aria-label="Đóng"
            onClick={requestClose}
          >
            <X aria-hidden="true" />
          </Button>
          {selected !== null && (
            <CarePlanDetail
              key={selected}
              planId={selected}
              currentPlanId={current?.id}
              currentEffectiveFrom={current?.effectiveFrom}
              resident={resident?.personalInfo ? residentLabel(resident) : null}
              Title={DialogTitle}
              Description={DialogDescription}
              onDirtyChange={setDirty}
              onChanged={() => setReload((value) => value + 1)}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={askClose} onOpenChange={setAskClose}>
        <DialogContent role="alertdialog" className="sm:max-w-md">
          <DialogTitle className="type-title">Bạn có thay đổi chưa lưu</DialogTitle>
          <DialogDescription>
            Đóng bây giờ thì phần vừa sửa sẽ mất. Muốn giữ lại, ở lại rồi bấm Lưu nháp.
          </DialogDescription>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={close}>
              Đóng không lưu
            </Button>
            <Button onClick={() => setAskClose(false)}>Ở lại</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
