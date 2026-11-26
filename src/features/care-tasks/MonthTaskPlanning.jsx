import { useEffect, useState } from 'react'
import {
  getCareTasksMonthDrafts,
  getShiftSchedules,
  postCareTasksMonthDrafts,
  postCareTasksMonthDraftsByIdDiscard,
  postCareTasksMonthDraftsPublish,
} from '@/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ProblemAlert } from '@/common/ProblemAlert'
import { formatDate } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { dateOf, timeOf } from './shiftPlanning'

const PAGE_SIZE = 10

// Tháng sau theo giờ Việt Nam, dạng yyyy-MM
function nextMonth() {
  const [y, m] = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

// Q-453 (mở lại Q-439, FR-054): Trưởng tầng lập công việc cho cả tháng. "Chép từ kế hoạch" tạo việc Nháp theo mốc của kế
// hoạch Hiệu lực trong các ca đã công bố; xem, bỏ dòng rồi "Công bố công việc tháng". Tầng lấy theo lịch ca của Trưởng tầng
// (mỗi Trưởng tầng một tầng), không có ô chọn tầng.
export function MonthTaskPlanning({ people, types, staff, initialMonth, onPublished }) {
  const [month, setMonth] = useState(initialMonth ?? nextMonth())
  const [floor, setFloor] = useState({ id: null, many: false, loaded: false })
  const [drafts, setDrafts] = useState(null)
  const [reload, setReload] = useState(0)
  const [summary, setSummary] = useState('')
  const [failure, setFailure] = useState(null)
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)
  const [page, setPage] = useState(1)

  useEffect(() => {
    let current = true
    getShiftSchedules({ query: { month } })
      .then(({ data }) => {
        if (!current) return
        const floors = [
          ...new Set(data.filter((s) => s.scopeType === 'FLOOR' && s.status === 'PUBLISHED').map((s) => s.scopeId)),
        ]
        setFloor({ id: floors.length === 1 ? floors[0] : null, many: floors.length > 1, loaded: true })
      })
      .catch((error) => current && setFailure(problemOf(error)))
    return () => {
      current = false
    }
  }, [month])

  useEffect(() => {
    if (!floor.id) return undefined
    let current = true
    getCareTasksMonthDrafts({ query: { floorAreaId: floor.id, month } })
      .then(({ data }) => current && setDrafts(data))
      .catch((error) => current && setFailure(problemOf(error)))
    return () => {
      current = false
    }
  }, [floor.id, month, reload])

  async function run(action) {
    setBusy(true)
    setFailure(null)
    try {
      await action()
      setReload((value) => value + 1)
    } catch (error) {
      setFailure(problemOf(error))
    } finally {
      setBusy(false)
    }
  }
  const body = () => ({ floorAreaId: floor.id, month })
  const key = () => ({ 'Idempotency-Key': crypto.randomUUID() })
  const copy = () =>
    run(async () => {
      const { data } = await postCareTasksMonthDrafts({ body: body(), headers: key() })
      setSummary(
        `Đã tạo ${data.created} việc Nháp từ ${data.shifts} ca đã công bố.` +
          (data.skipped ? ` Bỏ qua ${data.skipped} mốc đã có việc hoặc chưa đủ điều kiện.` : ''),
      )
    })
  const publish = () =>
    run(async () => {
      setAsking(false)
      const { data } = await postCareTasksMonthDraftsPublish({ body: body(), headers: key() })
      setSummary(`Đã công bố ${data.published} việc. Nhân viên thấy việc trên checklist của ca.`)
      onPublished?.()
    })
  const discard = (id) => run(() => postCareTasksMonthDraftsByIdDiscard({ path: { id }, headers: key() }))

  const typeName = Object.fromEntries(types.map((t) => [String(t.id), t.name]))
  const staffName = Object.fromEntries(staff.map((s) => [String(s.id), s.fullName]))
  const list = drafts ?? []
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  const shown = list.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const name = (id) => people[id] || `Người cao tuổi · mã ${id}`

  return (
    <section aria-labelledby="month-planning" className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="month-planning" className="type-title">
            Công việc tháng
          </h2>
          <p className="type-body-sm text-muted-foreground">
            Chép các mốc của kế hoạch chăm sóc vào các ca đã công bố, xem lại rồi công bố cho nhân viên.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="type-label">Tháng</span>
            <input
              type="month"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value)
                setDrafts(null)
                setSummary('')
                setPage(1)
              }}
              className="h-11 rounded-lg border border-input bg-background px-3 focus-visible:outline-ring"
            />
          </label>
          <Button variant="outline" disabled={busy || !floor.id} onClick={copy}>
            Chép từ kế hoạch
          </Button>
          <Button disabled={busy || !floor.id || list.length === 0} onClick={() => setAsking(true)}>
            Công bố công việc tháng ({list.length})
          </Button>
        </div>
      </div>
      <ProblemAlert problem={failure} />
      {floor.loaded && floor.many && (
        <p role="alert" className="type-body-sm text-destructive">
          Tài khoản đang phụ trách nhiều tầng trong tháng này. Nhờ Quản lý viện kết thúc phân công Trưởng tầng cũ trước
          khi lập công việc tháng.
        </p>
      )}
      {floor.loaded && !floor.many && !floor.id && (
        <p className="type-body-sm text-muted-foreground">Tháng này chưa có lịch ca đã công bố của tầng.</p>
      )}
      <p role="status" className="type-body-sm empty:hidden">
        {summary}
      </p>
      {drafts && list.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Chưa có công việc Nháp của tháng</EmptyTitle>
            <EmptyDescription>
              Bấm "Chép từ kế hoạch" để tạo công việc theo kế hoạch chăm sóc đang hiệu lực.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {list.length > 0 && (
        <Table aria-label="Công việc Nháp của tháng">
          <TableHeader>
            <TableRow className="bg-muted hover:bg-muted">
              <TableHead>Ngày</TableHead>
              <TableHead>Giờ</TableHead>
              <TableHead>Người cao tuổi</TableHead>
              <TableHead>Việc</TableHead>
              <TableHead>Người làm</TableHead>
              <TableHead>
                <span className="sr-only">Thao tác</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((d) => {
              const task = typeName[String(d.taskTypeId)] ?? `Loại công việc mã ${d.taskTypeId}`
              return (
                <TableRow key={d.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(dateOf(d.plannedAt))}</TableCell>
                  <TableCell className="tabular-nums">{timeOf(d.plannedAt)}</TableCell>
                  <TableCell>{name(d.residentId)}</TableCell>
                  <TableCell>{task}</TableCell>
                  <TableCell>
                    {d.performerId
                      ? (staffName[String(d.performerId)] ?? `Nhân viên · mã ${d.performerId}`)
                      : 'Việc chung của tầng'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      aria-label={`Bỏ việc ${task} của ${name(d.residentId)}`}
                      onClick={() => discard(d.id)}
                    >
                      Bỏ
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>
            Trang trước
          </Button>
          <span className="type-body-sm tabular-nums">
            Trang {current}/{pages}
          </span>
          <Button variant="outline" size="sm" disabled={current >= pages} onClick={() => setPage(current + 1)}>
            Trang sau
          </Button>
        </div>
      )}
      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent role="alertdialog" className="sm:max-w-md">
          <DialogTitle className="type-title">
            Công bố công việc tháng {month.slice(5)}/{month.slice(0, 4)}?
          </DialogTitle>
          <DialogDescription>
            {list.length} việc Nháp sẽ hiện trên checklist của nhân viên theo từng ca. Việc đã công bố muốn bỏ thì hủy
            từng việc.
          </DialogDescription>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setAsking(false)}>
              Quay lại
            </Button>
            <Button disabled={busy} onClick={publish}>
              Công bố
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
