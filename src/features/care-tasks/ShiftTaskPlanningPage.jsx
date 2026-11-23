import { useEffect, useRef, useState } from 'react'
import { BellIcon, UsersIcon } from 'lucide-react'
import {
  getFloorsById,
  getMeShifts,
  getShiftsById,
  getShiftSchedules,
  getResidents,
  getResidentsById,
  getTaskTypes,
  getShiftsByShiftIdSourceData,
  getShiftsByShiftIdCareTasks,
} from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/common/PageHeader'
import { PermissionDeniedState } from '@/common/PageState'
import { ProblemAlert } from '@/common/ProblemAlert'
import { StatusBadge } from '@/common/StatusBadge'
import { problemOf } from '@/common/problem'
import { usePermissions } from '@/common/permissions/permissions'
import { ShiftSourceDialog } from './ShiftSourceDialog'
import { ShiftTaskBatchDialog } from './ShiftTaskBatchDialog'
import { STATUSES, dateOf, formatDate, nextDate, shiftLabel, timeOf } from './shiftPlanning'

const PAGE_SIZE = 5

// Ca chứa thời điểm, hoặc ca đầu tiên bắt đầu sau đó, hoặc ca đầu ngày
function pickShift(list, target) {
  const sorted = [...list].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))
  return (
    sorted.find((s) => new Date(s.startsAt) <= target && new Date(s.endsAt) > target) ??
    sorted.find((s) => new Date(s.startsAt) > target) ??
    sorted[0]
  )
}

// Lập công việc ca (005, BF-02 bước 1): Trưởng tầng chọn ngày, ca đã công bố; đối chiếu nguồn trong "Xem chi tiết",
// nhập lô trong modal "Lập công việc". residentId, at: mở từ thông báo cần lập công việc (BF-01 bước 15).
export function ShiftTaskPlanningPage({ shiftId: initialShiftId, residentId: focusResidentId, at: focusAt }) {
  const { status, can } = usePermissions()
  const [target] = useState(() => {
    const now = new Date()
    const from = focusAt ? new Date(focusAt) : now
    return from > now ? from : now
  })
  const [date, setDate] = useState(() => (initialShiftId ? '' : dateOf(target)))
  const [shifts, setShifts] = useState([])
  const [shiftId, setShiftId] = useState(initialShiftId || '')
  const [source, setSource] = useState(null)
  const [tasks, setTasks] = useState([])
  const [shiftMembers, setShiftMembers] = useState([])
  const [floorName, setFloorName] = useState('')
  const [residents, setResidents] = useState([])
  const [types, setTypes] = useState([])
  const [rows, setRows] = useState([])
  const [page, setPage] = useState(1)
  const [dialog, setDialog] = useState(null)
  const [failure, setFailure] = useState(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const first = useRef(true)
  const view = can('SHIFT_TASK_PLANNING', 'VIEW')
  const create = can('SHIFT_TASK_PLANNING', 'CREATE')
  const manager = can('SHIFT_SCHEDULE', 'CREATE')

  useEffect(() => {
    if (status !== 'ready' || !view) return
    let current = true
    Promise.all([getTaskTypes(), getResidents()])
      .then(([catalog, people]) => {
        if (!current) return
        setTypes(catalog.data.filter((t) => t.status === 'ACTIVE'))
        setResidents(people.data.items)
        // Mở từ thông báo: người đó chưa có ở trang hồ sơ đầu thì tải riêng để hiện tên
        if (focusResidentId && !people.data.items.some((r) => r.id === focusResidentId))
          getResidentsById({ path: { id: focusResidentId } })
            .then(({ data }) => current && setResidents((old) => [...old, data]))
            .catch(() => {})
      })
      .catch((error) => {
        if (current) setFailure(problemOf(error))
      })
    return () => {
      current = false
    }
  }, [status, view, focusResidentId])

  // Ca đã công bố bắt đầu trong ngày lập; lần đầu chọn ca chứa thời điểm thông báo (hoặc bây giờ)
  useEffect(() => {
    if (status !== 'ready' || !view || initialShiftId || !date) return
    let current = true
    const request = manager
      ? getShiftSchedules({ query: { month: date.slice(0, 7) } }).then(({ data }) =>
          data
            .filter((s) => s.status === 'PUBLISHED')
            .flatMap((s) => s.shifts)
            .filter((s) => s.status !== 'CANCELLED'),
        )
      : getMeShifts({ query: { from: date, to: nextDate(date) } }).then(({ data }) =>
          data.filter((s) => !['DRAFT', 'CANCELLED'].includes(s.status)),
        )
    request
      .then((all) => {
        if (!current) return
        const list = all.filter((s) => dateOf(s.startsAt) === date)
        setShifts(list)
        const chosen = pickShift(list, first.current ? target : new Date())
        first.current = false
        setShiftId(chosen ? chosen.id : '')
        if (!chosen) setSource(null)
      })
      .catch((error) => current && setFailure(problemOf(error)))
    return () => {
      current = false
    }
  }, [status, view, initialShiftId, date, manager, target])

  useEffect(() => {
    if (status !== 'ready' || !view || !shiftId) return
    let current = true
    Promise.resolve().then(() => current && setLoading(true))
    Promise.all([
      getShiftsByShiftIdSourceData({ path: { shiftId } }),
      getShiftsByShiftIdCareTasks({ path: { shiftId } }),
      getShiftsById({ path: { id: shiftId } }),
    ])
      .then(([data, work, roster]) => {
        if (!current) return
        setSource(data.data)
        setTasks(work.data)
        setPage(1)
        setShiftMembers(roster.data.staff.filter((m) => !m.absent && !m.approvedLeave))
        setFailure(null)
        if (initialShiftId) setDate(dateOf(data.data.shift.startsAt))
        getFloorsById({ path: { id: data.data.shift.floorAreaId } })
          .then(({ data: floor }) => current && setFloorName(floor.name))
          .catch(() => current && setFloorName(''))
      })
      .catch((error) => {
        if (!current) return
        setSource(null)
        setFailure(problemOf(error))
      })
      .finally(() => current && setLoading(false))
    return () => {
      current = false
    }
  }, [status, view, shiftId, initialShiftId])

  // Tên người cao tuổi trong ca chưa có ở trang hồ sơ đầu: tải riêng từng hồ sơ còn thiếu
  const known = residents.map((r) => r.id).join(',')
  useEffect(() => {
    if (!source) return
    const have = new Set(known.split(',').filter(Boolean).map(Number))
    const missing = source.residents.map((r) => r.residentId).filter((id) => !have.has(id))
    if (!missing.length) return
    let current = true
    Promise.allSettled(missing.map((id) => getResidentsById({ path: { id } }))).then((results) => {
      const found = results.filter((r) => r.status === 'fulfilled').map((r) => r.value.data)
      if (current && found.length)
        setResidents((old) => [...old, ...found.filter((f) => !old.some((o) => o.id === f.id))])
    })
    return () => {
      current = false
    }
  }, [source, known])

  async function saved(count) {
    setRows([])
    setDialog(null)
    setSuccess(`Đã lập ${count} công việc của ca.`)
    try {
      const { data } = await getShiftsByShiftIdCareTasks({ path: { shiftId } })
      setTasks(data)
    } catch (error) {
      setFailure(problemOf(error))
    }
  }

  if (status === 'ready' && !view) return <PermissionDeniedState label="Lập công việc của ca" />
  const people = Object.fromEntries(
    residents.map((r) => [r.id, r.personalInfo?.fullName || `Người cao tuổi · mã ${r.id}`]),
  )
  const shift = source?.shift
  const shiftOptions = initialShiftId ? (shift ? [shift] : []) : shifts
  const subtitle = shift
    ? [formatDate(dateOf(shift.startsAt)), floorName, shiftLabel(shift)].filter(Boolean).join(' · ')
    : ''
  const focusName = focusResidentId && (people[focusResidentId] || `Người cao tuổi · mã ${focusResidentId}`)
  const focusInShift = source?.residents.some((r) => r.residentId === focusResidentId)
  const pages = Math.max(1, Math.ceil(tasks.length / PAGE_SIZE))
  const shown = tasks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const locked = rows.length > 0

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Lập công việc ca" subtitle="Đối chiếu nguồn, giao việc và gửi các dòng đã nhập cùng lúc." />
      <section aria-label="Chọn ca" className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4">
        <label className="flex min-w-48 flex-col gap-2">
          <span className="type-label">Ngày lập</span>
          <input
            type="date"
            required
            value={date}
            disabled={!!initialShiftId || locked}
            onChange={(e) => {
              setSuccess('')
              setDate(e.target.value)
            }}
            className="h-11 rounded-lg border border-input bg-popover px-3 focus-visible:outline-ring"
          />
        </label>
        <label className="flex min-w-64 flex-col gap-2">
          <span className="type-label">Ca đã công bố</span>
          <select
            value={shiftId}
            disabled={!!initialShiftId || locked}
            onChange={(e) => {
              setSuccess('')
              setShiftId(e.target.value)
            }}
            className="h-11 rounded-lg border border-input bg-popover px-3 focus-visible:outline-ring"
          >
            {!shiftOptions.length && <option value="">Không có ca đã công bố</option>}
            {shiftOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {shiftLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex min-w-40 flex-col gap-2">
          <span className="type-label">Tầng phụ trách</span>
          <span className="flex h-11 items-center gap-2">
            <UsersIcon aria-hidden="true" className="size-5 text-muted-foreground" />
            {floorName || '—'}
          </span>
        </div>
        {shift && (
          <Badge variant="held" className="mb-3 ml-auto">
            Đã công bố
          </Badge>
        )}
      </section>
      {locked && (
        <p className="type-body-sm text-muted-foreground">
          Đang có {rows.length} dòng chưa gửi; gửi hoặc bỏ các dòng trước khi đổi ngày, ca.
        </p>
      )}
      {focusResidentId && source && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl bg-accent p-4 text-accent-foreground"
        >
          <BellIcon aria-hidden="true" className="size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="type-label text-foreground">{focusName} cần lập công việc</p>
            <p className="type-body-sm">
              {focusInShift
                ? `Đã chọn ${shiftLabel(shift).toLowerCase()}. Bấm Xem chi tiết để đối chiếu nguồn của ${focusName}.`
                : `${focusName} không có trong ca này, chọn ca khác.`}
            </p>
          </div>
          <Badge variant="neutral-outline" className="bg-card">
            Từ thông báo
          </Badge>
        </div>
      )}
      <ProblemAlert problem={failure} />
      {success && (
        <p role="status" className="rounded-xl bg-success p-4 text-success-foreground">
          {success}
        </p>
      )}
      {loading && <p role="status">Đang tải dữ liệu ca…</p>}
      {source && !loading && (
        <>
          {create && (
            <Button
              className="h-11 self-end px-6"
              onClick={() => {
                setSuccess('')
                setDialog('batch')
              }}
            >
              Lập công việc
            </Button>
          )}
          <section aria-label="Công việc đã lập" className="overflow-hidden rounded-xl border bg-card">
            <div className="flex items-center justify-between gap-3 p-4">
              <h2 className="type-title">Công việc đã lập</h2>
              <Badge variant="held">{tasks.length} việc</Badge>
            </div>
            {tasks.length ? (
              <Table>
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead>Người cao tuổi</TableHead>
                    <TableHead>Công việc</TableHead>
                    <TableHead>Giờ</TableHead>
                    <TableHead>Người làm</TableHead>
                    <TableHead>Trạng thái</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{t.residentCard?.fullName || t.location || 'Cả tầng'}</TableCell>
                      <TableCell className="type-label">{t.content || t.taskType}</TableCell>
                      <TableCell className="tabular-nums">{timeOf(t.plannedAt)}</TableCell>
                      <TableCell>{t.performer || 'Việc chung của tầng'}</TableCell>
                      <TableCell>
                        <StatusBadge status={STATUSES[t.status]} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="border-t px-4 py-3 text-muted-foreground">Ca chưa có công việc.</p>
            )}
            <div className="flex flex-wrap items-center gap-3 border-t p-4">
              <Button variant="outline" onClick={() => setDialog('source')}>
                Xem chi tiết
              </Button>
              {tasks.length > 0 && (
                <span className="type-body-sm text-muted-foreground">
                  Hiển thị {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + shown.length} / {tasks.length} công
                  việc
                </span>
              )}
              {pages > 1 && (
                <nav aria-label="Phân trang công việc đã lập" className="ml-auto flex gap-2">
                  <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
                    Trước
                  </Button>
                  {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                    <Button
                      key={n}
                      variant="outline"
                      className={n === page ? 'border-accent-foreground bg-accent text-accent-foreground' : undefined}
                      aria-label={`Trang ${n}`}
                      aria-current={n === page ? 'page' : undefined}
                      onClick={() => setPage(n)}
                    >
                      {n}
                    </Button>
                  ))}
                  <Button variant="outline" disabled={page === pages} onClick={() => setPage(page + 1)}>
                    Sau
                  </Button>
                </nav>
              )}
            </div>
          </section>
          <ShiftSourceDialog
            open={dialog === 'source' || dialog === 'batch-source'}
            onOpenChange={(open) => !open && setDialog(dialog === 'batch-source' ? 'batch' : null)}
            subtitle={subtitle}
            source={source}
            tasks={tasks}
            people={people}
            focusResidentId={focusInShift ? focusResidentId : undefined}
          />
          {create && (
            <ShiftTaskBatchDialog
              open={dialog === 'batch'}
              onOpenChange={(open) => !open && setDialog(null)}
              subtitle={subtitle}
              shiftId={shiftId}
              source={source}
              shiftMembers={shiftMembers}
              people={people}
              types={types}
              rows={rows}
              setRows={setRows}
              onSaved={saved}
              onCompare={() => setDialog('batch-source')}
            />
          )}
        </>
      )}
    </div>
  )
}
