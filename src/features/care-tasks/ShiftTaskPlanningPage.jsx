import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { BellIcon, SearchIcon } from 'lucide-react'
import {
  getCareTasks,
  getFloorsById,
  getMeShifts,
  getShiftsById,
  getShiftSchedules,
  getResidents,
  getResidentsById,
  getStaff,
  getTaskTypes,
  getShiftsByShiftIdSourceData,
  getShiftsByShiftIdCareTasks,
} from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/common/PageHeader'
import { PermissionDeniedState } from '@/common/PageState'
import { ProblemAlert } from '@/common/ProblemAlert'
import { problemOf } from '@/common/problem'
import { usePermissions } from '@/common/permissions/permissions'
import { ShiftSourceDialog } from './ShiftSourceDialog'
import { ShiftTaskBatchDialog } from './ShiftTaskBatchDialog'
import { dateOf, formatDate, nextDate, shiftLabel, timeOf } from './shiftPlanning'

const PAGE_SIZE = 10
const NO_FILTER = { residentId: '', taskTypeId: '', performerId: '' }
const control = 'h-11 w-full rounded-lg border border-input bg-popover px-3 focus-visible:outline-ring'

// Ca chứa thời điểm, hoặc ca đầu tiên bắt đầu sau đó, hoặc ca đầu ngày
function pickShift(list, target) {
  const sorted = [...list].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))
  return (
    sorted.find((s) => new Date(s.startsAt) <= target && new Date(s.endsAt) > target) ??
    sorted.find((s) => new Date(s.startsAt) > target) ??
    sorted[0]
  )
}

// Số trang hiện trên thanh phân trang: trang đầu, cuối, trang đang xem và hai trang kề; khoảng bỏ qua là "…"
function pageItems(current, pages) {
  const shown = [...new Set([1, current - 1, current, current + 1, pages])]
    .filter((n) => n >= 1 && n <= pages)
    .sort((a, b) => a - b)
  return shown.flatMap((n, i) => (i && n - shown[i - 1] > 1 ? [`gap-${n}`, n] : [n]))
}

// Tìm người cao tuổi theo tên: gõ tên thì gợi ý hồ sơ khớp; khớp đúng một người hoặc chọn một gợi ý thì lọc theo người đó
function ResidentSearch({ onPick }) {
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState(null)
  const [results, setResults] = useState(null)
  const listId = useId()
  const hintId = useId()
  useEffect(() => {
    if (!query) return
    let current = true
    const timer = setTimeout(() => {
      getResidents({ query: { q: query } })
        .then(({ data }) => current && setResults(data.items))
        .catch(() => current && setResults([]))
    }, 300)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [query])
  const found = query ? (results ?? []) : []
  const label = (r) => `${r.personalInfo?.fullName} · ${r.profileCode}`
  const picked = chosen ?? (found.length === 1 ? found[0] : null)
  const pickedId = query && picked ? String(picked.id) : ''
  useEffect(() => {
    onPick(pickedId)
  }, [pickedId, onPick])
  const hint = !query || !results
    ? ''
    : !found.length
      ? 'Không tìm thấy người cao tuổi.'
      : !picked
        ? `Có ${found.length} người khớp, chọn một trong gợi ý.`
        : ''
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <InputGroup className="h-11 bg-popover">
        <InputGroupAddon>
          <SearchIcon aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          aria-label="Tìm người cao tuổi theo tên"
          aria-describedby={hint ? hintId : undefined}
          placeholder="Tìm theo tên người cao tuổi"
          list={listId}
          value={text}
          onChange={(e) => {
            const value = e.target.value
            // Chọn một gợi ý: giữ người đó, không tìm lại theo chuỗi "tên · mã hồ sơ"
            const match = found.find((r) => label(r) === value)
            setText(value)
            setChosen(match ?? null)
            if (!match) setQuery(value.trim())
          }}
        />
      </InputGroup>
      <datalist id={listId}>
        {found.map((r) => (
          <option key={r.id} value={label(r)} />
        ))}
      </datalist>
      {hint && (
        <p id={hintId} className="type-caption text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

function FilterSelect({ label, value, options, onChange }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={control}>
      <option value="">{label}: tất cả</option>
      {options.map(([id, text]) => (
        <option key={id} value={id}>
          {text}
        </option>
      ))}
    </select>
  )
}

// Lập công việc ca (005, BF-02 bước 1): lịch sử công việc đã lập không theo ca, ngày (lọc theo người cao tuổi, công việc,
// người làm); chọn ngày, ca đã công bố trong modal "Lập công việc". residentId, at: mở từ thông báo cần lập công việc
// (BF-01 bước 15).
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
  const [shiftTasks, setShiftTasks] = useState([])
  const [shiftMembers, setShiftMembers] = useState([])
  const [floorName, setFloorName] = useState('')
  const [residents, setResidents] = useState([])
  const [types, setTypes] = useState([])
  const [staff, setStaff] = useState([])
  const [rows, setRows] = useState([])
  const [history, setHistory] = useState({ items: [], total: 0 })
  const [page, setPage] = useState(0)
  const [filter, setFilter] = useState(NO_FILTER)
  const [revision, setRevision] = useState(0)
  const [fresh, setFresh] = useState([])
  const [dialog, setDialog] = useState(null)
  const [failure, setFailure] = useState(null)
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(true)
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
    // Danh sách người làm cho bộ lọc; không tải được thì bộ lọc chỉ có "tất cả"
    getStaff({ query: { status: 'WORKING' } })
      .then(({ data }) => current && setStaff(data))
      .catch(() => {})
    return () => {
      current = false
    }
  }, [status, view, focusResidentId])

  // Lịch sử công việc đã lập: việc lập gần nhất trước, phân trang ở máy chủ
  useEffect(() => {
    if (status !== 'ready' || !view) return
    let current = true
    const query = { page, size: PAGE_SIZE }
    Object.entries(filter).forEach(([key, value]) => {
      if (value) query[key] = Number(value)
    })
    Promise.resolve().then(() => current && setHistoryLoading(true))
    getCareTasks({ query })
      .then(({ data }) => current && setHistory(data))
      .catch((error) => current && setFailure(problemOf(error)))
      .finally(() => current && setHistoryLoading(false))
    return () => {
      current = false
    }
  }, [status, view, page, filter, revision])

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

  // Nguồn, công việc, thành viên của ca đang chọn để lập
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
        setShiftTasks(work.data)
        setShiftMembers(roster.data.staff.filter((m) => !m.absent && !m.approvedLeave))
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

  // Gửi lô xong: về trang đầu, bỏ lọc để thấy ngay các việc vừa lập (lịch sử xếp việc lập gần nhất trước)
  async function saved(created, count) {
    setRows([])
    setDialog(null)
    setSuccess(`Đã lập ${count} công việc của ca.`)
    setFresh(created.map((t) => t.id))
    setFilter(NO_FILTER)
    setPage(0)
    setRevision((n) => n + 1)
    try {
      const { data } = await getShiftsByShiftIdCareTasks({ path: { shiftId } })
      setShiftTasks(data)
    } catch (error) {
      setFailure(problemOf(error))
    }
  }

  // Lọc theo người cao tuổi tìm được theo tên; đổi người thì về trang đầu
  const pickResident = useCallback((residentId) => {
    setFilter((old) => (old.residentId === residentId ? old : { ...old, residentId }))
    setPage(0)
  }, [])

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
  const pages = Math.max(1, Math.ceil(history.total / PAGE_SIZE))
  const locked = rows.length > 0
  const setFilterOf = (key) => (value) => {
    setFilter((old) => ({ ...old, [key]: value }))
    setPage(0)
    setFresh([])
  }
  const openBatch = () => {
    setSuccess('')
    setDialog('batch')
  }

  // Chọn ngày, ca để lập: đặt trong modal, khóa khi còn dòng chưa gửi (các dòng gắn với người cao tuổi của ca)
  const shiftPicker = (
    <div className="flex flex-wrap gap-2">
      <input
        type="date"
        required
        aria-label="Ngày lập"
        value={date}
        disabled={!!initialShiftId || locked}
        onChange={(e) => setDate(e.target.value)}
        className={`${control} w-40`}
      />
      <select
        aria-label="Ca đã công bố"
        value={shiftId}
        disabled={!!initialShiftId || locked}
        onChange={(e) => setShiftId(e.target.value)}
        className={`${control} w-48`}
      >
        {!shiftOptions.length && <option value="">Không có ca đã công bố</option>}
        {shiftOptions.map((s) => (
          <option key={s.id} value={s.id}>
            {shiftLabel(s)}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Lập công việc ca" subtitle="Đối chiếu nguồn, giao việc và gửi các dòng đã nhập cùng lúc." />
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
                ? `Bấm Lập công việc: ${shiftLabel(shift).toLowerCase()} ngày ${formatDate(dateOf(shift.startsAt))} đã được chọn sẵn.`
                : `${focusName} không có trong ${shiftLabel(shift).toLowerCase()}, chọn ca khác khi lập.`}
            </p>
          </div>
          <Badge variant="neutral-outline" className="bg-card">
            Từ thông báo
          </Badge>
        </div>
      )}
      <section aria-label="Lọc công việc đã lập" className="rounded-xl border bg-card p-4">
        <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
          <ResidentSearch key={revision} onPick={pickResident} />
          <FilterSelect
            label="Công việc"
            value={filter.taskTypeId}
            options={types.map((t) => [String(t.id), t.name])}
            onChange={setFilterOf('taskTypeId')}
          />
          <FilterSelect
            label="Người làm"
            value={filter.performerId}
            options={staff.map((s) => [String(s.id), s.fullName])}
            onChange={setFilterOf('performerId')}
          />
          {create && (
            <Button className="h-11 px-6" disabled={!source || loading} onClick={openBatch}>
              Lập công việc
            </Button>
          )}
        </div>
      </section>
      <ProblemAlert problem={failure} />
      {success && (
        <p role="status" className="rounded-xl bg-success p-4 text-success-foreground">
          {success}
        </p>
      )}
      <section aria-label="Công việc đã lập" className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between gap-3 p-4">
          <div className="flex flex-col gap-1">
            <h2 className="type-title">Công việc đã lập</h2>
            <p className="type-body-sm text-muted-foreground">Mọi ca, việc lập gần nhất trước.</p>
          </div>
          <Badge variant="held">{history.total} việc</Badge>
        </div>
        {historyLoading ? (
          <p role="status" className="border-t px-4 py-3">
            Đang tải công việc đã lập…
          </p>
        ) : history.items.length ? (
          <Table>
            <TableHeader className="bg-muted">
              <TableRow>
                <TableHead>Người cao tuổi</TableHead>
                <TableHead>Công việc</TableHead>
                <TableHead>Ngày, giờ</TableHead>
                <TableHead>Người làm</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.items.map((t) => (
                <TableRow key={t.id} className={fresh.includes(t.id) ? 'bg-accent/40' : undefined}>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-2">
                      {t.residentCard?.fullName || t.location || 'Cả tầng'}
                      {fresh.includes(t.id) && <Badge variant="held">Mới lập</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="type-label">{t.content || t.taskType}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatDate(dateOf(t.plannedAt))} {timeOf(t.plannedAt)}
                  </TableCell>
                  <TableCell>{t.performer || 'Việc chung của tầng'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="border-t px-4 py-3 text-muted-foreground">
            {Object.values(filter).some(Boolean) ? 'Không có công việc khớp bộ lọc.' : 'Chưa có công việc đã lập.'}
          </p>
        )}
        {history.total > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-t p-4">
            <span className="type-body-sm text-muted-foreground">
              Hiển thị {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + history.items.length} / {history.total} công việc
            </span>
            {pages > 1 && (
              <nav aria-label="Phân trang công việc đã lập" className="ml-auto flex items-center gap-2">
                <Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  Trước
                </Button>
                {pageItems(page + 1, pages).map((n) =>
                  typeof n === 'string' ? (
                    <span key={n} aria-hidden="true" className="px-1 text-muted-foreground">
                      …
                    </span>
                  ) : (
                    <Button
                      key={n}
                      variant="outline"
                      className={`min-w-11 tabular-nums ${n === page + 1 ? 'border-accent-foreground bg-accent text-accent-foreground' : ''}`}
                      aria-label={`Trang ${n}`}
                      aria-current={n === page + 1 ? 'page' : undefined}
                      onClick={() => setPage(n - 1)}
                    >
                      {n}
                    </Button>
                  ),
                )}
                <Button variant="outline" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
                  Sau
                </Button>
              </nav>
            )}
          </div>
        )}
      </section>
      {source && (
        <ShiftSourceDialog
          open={dialog === 'batch-source'}
          onOpenChange={(open) => !open && setDialog('batch')}
          subtitle={subtitle}
          source={source}
          tasks={shiftTasks}
          people={people}
          focusResidentId={focusInShift ? focusResidentId : undefined}
        />
      )}
      {create && source && (
        <ShiftTaskBatchDialog
          open={dialog === 'batch'}
          onOpenChange={(open) => !open && setDialog(null)}
          subtitle={subtitle}
          shiftPicker={shiftPicker}
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
    </div>
  )
}
