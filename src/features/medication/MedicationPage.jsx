import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, Clock, FileText, Hourglass, Pill, RotateCw, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { AllergyNote } from '@/common/CareNotes'
import { NowStrip } from '@/common/NowStrip'
import { PageHeader } from '@/common/PageHeader'
import { ResidentAvatar } from '@/common/ResidentAvatar'
import { ProblemAlert } from '@/common/ProblemAlert'
import { problemOf } from '@/common/problem'
import { getResidentsById } from '@/api/api001'
import { cn } from '@/lib/utils'
import { DoseSheet } from './DoseSheet'
import { DoseTags } from './DoseTags'
import { loadDoseRound, recordDoses } from './doseRound'
import { hhmm } from './doseRoundView'
import { windowOf } from './medicationTime'
import { FamilyMedicationPanel } from './FamilyMedicationPanel'
import { LateDoseSheet } from './LateDoseSheet'
import { PrescriptionPanel } from './PrescriptionPanel'
import { PrnPanel } from './PrnPanel'
import { ReconciliationPanel } from './ReconciliationPanel'
import { listWorklist } from './reconciliationApi'
import { STATUS as RECONCILIATION_STATUS } from './reconciliationView'
import { ResidentPicker } from './ResidentPicker'
import { TemporaryNursePanel } from './TemporaryNursePanel'

// Màn Phát thuốc (M14; spec 006 User Story 2, 6), theo DESIGN.md 5.1: lưới thẻ theo giờ dự kiến, mỗi thẻ là một
// người cao tuổi trong giờ đó. Liều theo lịch đọc từ GET /medication-doses/rounds, ghi bằng administer, refuse, skip
// (api-006); họ tên, dị ứng từ api-001, phòng từ api-003, ca từ api-008. Chỉ Điều dưỡng xác nhận liều (FR-026); trạng
// thái liều do hệ thống tính (FR-021). Thuốc khi cần (PrnPanel) và Đơn thuốc (PrescriptionPanel) đọc, ghi api-006 theo từng
// người cao tuổi được chọn. Đối chiếu thuốc (ReconciliationPanel, 006 T072) lập, xử lý phiếu của người được chọn: phiếu trở
// về từ bệnh viện, theo yêu cầu chuyên môn, hoặc phiếu tiếp nhận (lối vào duy nhất trên web, chủ dự án 2026-11-18).

const RECORD_ROLE = 'NURSING_STAFF'
const MANAGER_ROLE = 'NURSING_HOME_MANAGER'
const OPEN = ['Đến giờ', 'Trễ']
const FILTERS = ['Tất cả', 'Trễ', 'Đến giờ', 'Chưa đến giờ', 'Đã xong']

const FILTER_BADGES = {
  'Tất cả': {
    active: 'bg-white/25 text-white',
    inactive: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  'Trễ': {
    active: 'bg-white/25 text-white',
    inactive: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  },
  'Đến giờ': {
    active: 'bg-white/25 text-white',
    inactive: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
  'Chưa đến giờ': {
    active: 'bg-white/25 text-white',
    inactive: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  },
  'Đã xong': {
    active: 'bg-white/25 text-white',
    inactive: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  },
}

const KPI_CARD_CONFIG = {
  'Trễ': {
    hint: 'Cần xử lý ngay',
    bg: 'bg-gradient-to-b from-rose-50/80 via-white to-white',
    border: 'border-rose-200/90 hover:border-rose-300',
    title: 'text-rose-700',
    count: 'text-rose-950',
    hintColor: 'text-rose-600',
    iconBox: 'bg-rose-100 text-rose-600',
    icon: AlertCircle,
    activeRing: 'border-2 border-rose-500 shadow-[0_8px_20px_-4px_rgba(244,63,94,0.3)] ring-2 ring-rose-500/15',
    indicatorBar: 'bg-rose-500',
  },
  'Đến giờ': {
    hint: 'Cần phát thuốc trong ca',
    bg: 'bg-gradient-to-b from-amber-50/80 via-white to-white',
    border: 'border-amber-200/90 hover:border-amber-300',
    title: 'text-amber-800',
    count: 'text-amber-950',
    hintColor: 'text-amber-600',
    iconBox: 'bg-amber-100 text-amber-600',
    icon: Hourglass,
    activeRing: 'border-2 border-amber-500 shadow-[0_8px_20px_-4px_rgba(245,158,11,0.3)] ring-2 ring-amber-500/15',
    indicatorBar: 'bg-amber-500',
  },
  'Chưa đến giờ': {
    hint: 'Các mốc giờ tiếp theo',
    bg: 'bg-gradient-to-b from-sky-50/80 via-white to-white',
    border: 'border-sky-200/90 hover:border-sky-300',
    title: 'text-sky-800',
    count: 'text-sky-950',
    hintColor: 'text-sky-600',
    iconBox: 'bg-sky-100 text-sky-600',
    icon: Clock,
    activeRing: 'border-2 border-sky-500 shadow-[0_8px_20px_-4px_rgba(14,165,233,0.3)] ring-2 ring-sky-500/15',
    indicatorBar: 'bg-sky-500',
  },
  'Đã phát xong': {
    hint: 'Đã hoàn thành',
    bg: 'bg-gradient-to-b from-emerald-50/80 via-white to-white',
    border: 'border-emerald-200/90 hover:border-emerald-300',
    title: 'text-emerald-800',
    count: 'text-emerald-950',
    hintColor: 'text-emerald-600',
    iconBox: 'bg-emerald-100 text-emerald-600',
    icon: CheckCircle2,
    activeRing: 'border-2 border-emerald-500 shadow-[0_8px_20px_-4px_rgba(16,185,129,0.3)] ring-2 ring-emerald-500/15',
    indicatorBar: 'bg-emerald-500',
  },
}

// Nhãn trạng thái liều trên thẻ: nền đặc, chữ in đậm (Trễ, Bỏ lỡ đỏ; Đến giờ vàng cam; Đã dùng, Đã xong xanh lá; còn lại xám).
const DOSE_TONE = {
  'Trễ': 'bg-destructive text-white',
  'Bỏ lỡ': 'bg-destructive text-white',
  'Đến giờ': 'bg-amber-500 text-white',
  'Chưa đến giờ': 'bg-sky-500 text-white',
  'Đã dùng': 'bg-emerald-600 text-white',
  'Đã xong': 'bg-emerald-600 text-white',
  'Tạm dừng': 'bg-slate-400 text-white',
}

function DoseStatus({ status }) {
  return (
    <Badge
      variant="secondary"
      className={cn('h-6 px-2.5 text-xs font-bold shadow-xs', DOSE_TONE[status] ?? 'bg-muted-foreground text-white')}
    >
      {status}
    </Badge>
  )
}

// Trạng thái của thẻ theo liều gấp nhất trong thẻ
function groupStatus(doses) {
  for (const s of ['Trễ', 'Đến giờ', 'Chưa đến giờ']) if (doses.some((d) => d.status === s)) return s
  // Tạm dừng (người cao tuổi vắng, đơn tạm dừng) không phải đã xong: giữ ở giờ của nó, không có nút (BR-M07-03)
  if (doses.every((d) => d.status === 'Tạm dừng')) return 'Tạm dừng'
  return 'Đã xong'
}

function groupsOf(doses, residents) {
  const map = new Map()
  for (const d of doses) {
    const key = `${d.time}:${d.residentCode}`
    if (!map.has(key))
      map.set(key, { key, time: d.time, resident: residents.find((r) => r.code === d.residentCode), doses: [] })
    map.get(key).doses.push(d)
  }
  return [...map.values()].map((g) => ({ ...g, status: groupStatus(g.doses) }))
}

function DoseCard({ group, canRecord, onOpen, onLate }) {
  const late = group.status === 'Trễ'
  const done = group.status === 'Đã xong'
  const r = group.resident
  const showRecord = canRecord && group.doses.some((d) => OPEN.includes(d.status))
  return (
    <Card className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <CardHeader className="flex flex-row items-center gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
        <ResidentAvatar name={r.name} code={r.code} initials={r.initials} className="size-10 text-sm font-bold shadow-xs" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className={cn('truncate text-base font-bold tracking-tight', done ? 'text-muted-foreground' : 'text-slate-900 dark:text-slate-100')}>
            {r.name}
          </span>
          <span className="text-xs font-medium text-slate-500 tabular-nums">
            {r.room === '—' ? 'Bán trú' : r.room}
          </span>
        </div>
        <DoseStatus status={group.status} />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {/* Dị ứng hiện trên mọi thẻ thuốc (chủ dự án duyệt 2026-10-18) */}
        {!done && <AllergyNote allergies={r.allergies} />}
        <ul className="flex flex-col gap-2">
          {group.doses.map((d) => (
            <li key={d.id} className="flex flex-col gap-1.5 rounded-xl bg-slate-50/70 p-3 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60">
              <div className="flex items-start justify-between gap-2">
                <span className={cn('text-sm font-semibold', done ? 'text-muted-foreground' : 'text-slate-900 dark:text-slate-100')}>
                  {d.drug}
                  <span className="block text-xs font-normal text-slate-500">
                    {d.dose}, {d.route}
                  </span>
                </span>
                {d.status !== group.status && <DoseStatus status={d.status} />}
              </div>
              {!done && <DoseTags dose={d} />}
              {(d.result || d.note) && <span className="text-xs text-muted-foreground italic">{d.result ?? d.note}</span>}
            </li>
          ))}
        </ul>
        {onLate &&
          group.doses
            .filter((d) => d.status === 'Bỏ lỡ' && d.resultId)
            .map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-amber-50 p-3 text-amber-900 ring-1 ring-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-700"
              >
                <span className="text-xs font-medium">{d.drug} đã Bỏ lỡ</span>
                <Button variant="outline" size="sm" onClick={() => onLate(d)} className="h-7 text-xs font-semibold bg-white dark:bg-slate-900">
                  Ghi đã dùng muộn
                </Button>
              </div>
            ))}
        {showRecord && (
          <div className="mt-auto flex justify-end border-t border-slate-100 pt-3 dark:border-slate-800">
            <Button
              variant={late ? 'destructive' : 'default'}
              className={cn(
                'px-6 py-2 text-xs font-bold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md rounded-xl flex items-center gap-1.5',
                late
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-[#24496f] hover:bg-[#1b3754] text-white dark:bg-sky-600 dark:hover:bg-sky-700',
              )}
              onClick={() => onOpen(group)}
            >
              <Pill aria-hidden className="size-3.5" />
              Phát thuốc
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Section({ label, sub, count, defaultOpen, urgent, current, children }) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="flex flex-col gap-3">
      <CollapsibleTrigger className="group flex min-h-11 w-full items-center justify-between rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-2xs transition-all duration-200 hover:bg-slate-50 hover:shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5">
          <ChevronDown
            className="size-4 -rotate-90 text-slate-500 transition-transform group-data-[panel-open]:rotate-0"
            aria-hidden="true"
          />
          <span className={cn('text-base font-extrabold tabular-nums', current ? 'text-primary' : 'text-slate-800 dark:text-slate-200')}>
            ⏰ {label}
          </span>
          {sub && <span className="text-xs text-slate-500 tabular-nums">({sub})</span>}
          {current && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-300">
              <span className="size-2 rounded-full bg-blue-600 animate-ping" />
              Bây giờ
            </span>
          )}
        </div>
        <span
          className={cn(
            'rounded-full px-2.5 py-0.5 text-xs tabular-nums font-bold',
            urgent
              ? 'bg-rose-500 text-white shadow-xs'
              : 'bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
          )}
        >
          {count} người cao tuổi
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// Dải "Cần đối chiếu" (006 T078): người cao tuổi trong phạm vi có phiếu Mở, Chờ xác nhận hoặc đơn chờ đối chiếu, theo
// thứ tự backend trả (quá hạn trước); họ tên từ api-001. Chỉ hiện số liệu đã có (Q-306, Q-307).
function useWorklist(revision) {
  const [entries, setEntries] = useState([])
  useEffect(() => {
    let cancelled = false
    listWorklist()
      .then(async (list) => {
        const named = await Promise.all(
          list.map((e) =>
            getResidentsById({ path: { id: e.residentId } }).then(
              ({ data }) => ({ ...e, name: data?.personalInfo?.fullName ?? `Người cao tuổi mã ${e.residentId}` }),
              () => ({ ...e, name: `Người cao tuổi mã ${e.residentId}` }),
            ),
          ),
        )
        if (!cancelled) setEntries(named)
      })
      .catch(() => !cancelled && setEntries([]))
    return () => {
      cancelled = true
    }
  }, [revision])
  return entries
}

const worklistState = (e) =>
  e.overdue ? 'quá hạn' : e.status ? RECONCILIATION_STATUS[e.status].toLowerCase() : 'chưa lập phiếu'

function ReconciliationMode({ resident, setResident, isDoctor, onSaved }) {
  const [revision, setRevision] = useState(0)
  const entries = useWorklist(revision)
  // Mở từ nơi khác chỉ có mã người cao tuổi: đọc họ tên trước khi mở phiếu
  const needsName = resident && !resident.personalInfo
  useEffect(() => {
    if (!needsName) return
    getResidentsById({ path: { id: resident.id } }).then(
      ({ data }) => setResident(data ?? { id: resident.id, personalInfo: {} }),
      () => setResident({ id: resident.id, personalInfo: {} }),
    )
  }, [needsName, resident?.id, setResident])
  const name = resident && (resident.personalInfo?.fullName ?? `Người cao tuổi mã ${resident.id}`)
  return (
    <div className="flex flex-col gap-6">
      <NowStrip
        label="Cần đối chiếu"
        items={entries.map((e) => ({
          key: e.residentId,
          label: `${e.name}, ${worklistState(e)}`,
          onSelect: () => setResident({ id: e.residentId, personalInfo: { fullName: e.name } }),
        }))}
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Cột trái: Danh sách tối đa 8 người cao tuổi có phân trang */}
        <div className="w-full lg:w-80 lg:shrink-0">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between px-0.5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Danh sách người cao tuổi
              </h3>
            </div>
            <ResidentPicker onPick={setResident} selectedId={resident?.id} />
          </div>
        </div>

        {/* Cột phải: Phiếu đối chiếu thuốc của người cao tuổi đang chọn */}
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {resident && !needsName ? (
            <ReconciliationPanel
              key={resident.id}
              residentId={resident.id}
              residentName={name}
              isDoctor={isDoctor}
              onChanged={(message) => {
                onSaved(message)
                setRevision((n) => n + 1)
              }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/50 p-12 text-center dark:border-slate-800 dark:bg-slate-900/50">
              <div className="rounded-full bg-slate-100 p-3.5 dark:bg-slate-800">
                <FileText className="size-6 text-slate-400" />
              </div>
              <h4 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">
                Chưa chọn người cao tuổi
              </h4>
              <p className="mt-1 max-w-sm text-xs text-slate-500">
                Chọn người cao tuổi từ danh sách bên trái hoặc từ dải "Cần đối chiếu" ở trên để xem và lập phiếu đối chiếu thuốc.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// mode, residentId: mở thẳng một chế độ, một người (ví dụ từ cảnh báo "chưa đối chiếu thuốc", 006 T078); chỉ mã người
// cao tuổi đi qua URL, họ tên đọc từ api-001
export function MedicationPage({ role, mode: initialMode = 'scheduled', residentId }) {
  const canRecord = role === RECORD_ROLE
  const [mode, setMode] = useState(initialMode)
  const [filter, setFilter] = useState('Tất cả')
  const [search, setSearch] = useState('')
  const [round, setRound] = useState(null)
  const [problem, setProblem] = useState(null)
  const [clock, setClock] = useState(() => hhmm(new Date()))
  const [opening, setOpening] = useState(null)
  const [lating, setLating] = useState(null)
  const [announcement, setAnnouncement] = useState('')
  // Người đang chọn ở chế độ Đối chiếu thuốc; tab Đơn thuốc chuyển sang đúng người khi có đơn chờ đối chiếu (006 T074)
  const [reconciling, setReconciling] = useState(() => (residentId ? { id: Number(residentId) } : null))

  const reload = useCallback(async () => {
    try {
      setRound(await loadDoseRound())
      setProblem(null)
    } catch (error) {
      setProblem(problemOf(error))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    loadDoseRound().then(
      (data) => !cancelled && setRound(data),
      (error) => !cancelled && setProblem(problemOf(error)),
    )
    // Giờ hiện tại theo máy; giờ máy chủ chưa có trong client (NFR-09), chỉnh khi hợp đồng công bố
    const tick = setInterval(() => setClock(hhmm(new Date())), 30_000)
    return () => {
      cancelled = true
      clearInterval(tick)
    }
  }, [])

  const shift = { now: clock, start: round?.shift?.start, end: round?.shift?.end }
  const groups = groupsOf(round?.doses ?? [], round?.residents ?? [])
  const count = (s) => (s === 'Tất cả' ? groups.length : groups.filter((g) => g.status === s).length)

  // Lọc theo thanh tìm kiếm
  const searchedGroups = groups.filter((g) => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    const nameMatch = g.resident?.name?.toLowerCase().includes(q)
    const roomMatch = g.resident?.room?.toLowerCase().includes(q)
    const drugMatch = g.doses.some((d) => d.drug?.toLowerCase().includes(q))
    return nameMatch || roomMatch || drugMatch
  })

  const visible = searchedGroups.filter((g) => filter === 'Tất cả' || g.status === filter)
  const active = visible.filter((g) => g.status !== 'Đã xong')
  const done = visible.filter((g) => g.status === 'Đã xong')
  const times = [...new Set(active.map((g) => g.time))].sort()
  // Dải "Cần làm ngay" (DESIGN.md 6.7, 7.2): thẻ có liều Trễ, đã có sẵn trong dữ liệu; không tự gợi ý (Q-307)
  const lateGroups = groups.filter((g) => g.status === 'Trễ')
  const current = times.find((t) => windowOf(t).from <= shift.now && shift.now <= windowOf(t).to)

  async function save(results) {
    try {
      await recordDoses(results)
      setAnnouncement(`Đã lưu ${results.length} liều của ${opening.resident.name}.`)
      setOpening(null)
      setProblem(null)
    } catch (error) {
      setProblem(problemOf(error))
    }
    await reload()
  }

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-6">
      <PageHeader
        title={<span className="text-[#142B45] dark:text-[#C9D6E5] font-bold tracking-tight">Phát thuốc</span>}
        subtitle={
          canRecord
            ? 'Liều của người cao tuổi bạn phụ trách và liều chung của tầng.'
            : 'Bạn chỉ xem; xác nhận liều do Điều dưỡng thực hiện.'
        }
        aside={
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center rounded-2xl border border-slate-200/80 bg-white px-4 py-2 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <span className="font-mono text-2xl font-bold tracking-wider text-slate-800 tabular-nums dark:text-slate-100">
                {shift.now}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-sky-100 bg-sky-50/80 px-4 py-2 text-xs font-semibold text-sky-900 shadow-xs dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-200">
              <Clock className="size-3.5 text-sky-600 dark:text-sky-400" />
              <span>Ca trực: {shift.start ? `${shift.start} - ${shift.end}` : '07:00 - 18:00'}</span>
              <span className="text-sky-300 dark:text-sky-700">|</span>
              <span className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Đang trực
              </span>
            </div>
          </div>
        }
      >
        {/* Tầng 1: Chọn chế độ nghiệp vụ dạng Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1 pb-2">
          <ToggleGroup
            variant="default"
            size="default"
            value={[mode]}
            onValueChange={(n) => n[0] && setMode(n[0])}
            aria-label="Loại thuốc"
            className="flex flex-wrap items-center gap-1.5 rounded-full bg-slate-100/90 border-2 border-slate-200/90 p-1.5 shadow-inner dark:bg-slate-800/60 dark:border-slate-700"
          >
            <ToggleGroupItem
              value="scheduled"
              className={cn(
                'rounded-full px-5 py-2.5 text-sm font-black transition-all duration-200',
                mode === 'scheduled'
                  ? '!bg-white !text-[#24496F] shadow-md border-2 border-[#24496F] -translate-y-0.5'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/70 hover:shadow-xs dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white',
              )}
            >
              Liều theo lịch
              {groups.length > 0 && (
                <span
                  className={cn(
                    'ml-2 rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums transition-colors',
                    mode === 'scheduled'
                      ? 'bg-[#24496F] text-white'
                      : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
                  )}
                >
                  {groups.length}
                </span>
              )}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="prn"
              className={cn(
                'rounded-full px-4 py-2.5 text-sm font-extrabold transition-all duration-200',
                mode === 'prn'
                  ? '!bg-white !text-[#24496F] shadow-md border-2 border-[#24496F] -translate-y-0.5'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/70 hover:shadow-xs dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white',
              )}
            >
              Thuốc khi cần (PRN)
            </ToggleGroupItem>
            <ToggleGroupItem
              value="prescriptions"
              className={cn(
                'rounded-full px-4 py-2.5 text-sm font-extrabold transition-all duration-200',
                mode === 'prescriptions'
                  ? '!bg-white !text-[#24496F] shadow-md border-2 border-[#24496F] -translate-y-0.5'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/70 hover:shadow-xs dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white',
              )}
            >
              Đơn thuốc
            </ToggleGroupItem>
            <ToggleGroupItem
              value="reconciliation"
              className={cn(
                'rounded-full px-4 py-2.5 text-sm font-extrabold transition-all duration-200',
                mode === 'reconciliation'
                  ? '!bg-white !text-[#24496F] shadow-md border-2 border-[#24496F] -translate-y-0.5'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/70 hover:shadow-xs dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white',
              )}
            >
              Đối chiếu thuốc
            </ToggleGroupItem>
            <ToggleGroupItem
              value="family"
              className={cn(
                'rounded-full px-4 py-2.5 text-sm font-extrabold transition-all duration-200',
                mode === 'family'
                  ? '!bg-white !text-[#24496F] shadow-md border-2 border-[#24496F] -translate-y-0.5'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/70 hover:shadow-xs dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white',
              )}
            >
              Thuốc gia đình gửi
            </ToggleGroupItem>
            {role === MANAGER_ROLE && (
              <ToggleGroupItem
                value="temporary"
                className={cn(
                  'rounded-full px-4 py-2.5 text-sm font-extrabold transition-all duration-200',
                  mode === 'temporary'
                    ? '!bg-white !text-[#24496F] shadow-md border-2 border-[#24496F] -translate-y-0.5'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/70 hover:shadow-xs dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white',
                )}
              >
                Phụ trách tạm
              </ToggleGroupItem>
            )}
          </ToggleGroup>
        </div>

        {/* 4 Thẻ chỉ số tổng quan 3D đa sắc theo ca trực */}
        {mode === 'scheduled' && round && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ['Trễ', 'Trễ', KPI_CARD_CONFIG['Trễ']],
              ['Đến giờ', 'Đến giờ', KPI_CARD_CONFIG['Đến giờ']],
              ['Chưa đến giờ', 'Chưa đến giờ', KPI_CARD_CONFIG['Chưa đến giờ']],
              ['Đã phát xong', 'Đã xong', KPI_CARD_CONFIG['Đã phát xong']],
            ].map(([displayTitle, filterValue, cfg]) => {
              const isSelected = filter === filterValue
              const Icon = cfg.icon
              return (
                <button
                  key={displayTitle}
                  type="button"
                  onClick={() => setFilter(isSelected ? 'Tất cả' : filterValue)}
                  className={cn(
                    'relative flex flex-col justify-between p-4 rounded-2xl border text-left transition-all duration-200 min-h-[114px] shadow-2xs hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary overflow-hidden',
                    cfg.bg,
                    isSelected
                      ? cn(cfg.activeRing, '-translate-y-0.5')
                      : cn(cfg.border, 'opacity-90 hover:opacity-100'),
                  )}
                >
                  <div className="flex w-full items-center justify-between gap-1.5">
                    <span className={cn('text-[15px] sm:text-base font-extrabold tracking-tight', cfg.title)}>
                      {displayTitle}
                    </span>
                    <div
                      aria-hidden="true"
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-2xs transition-transform',
                        cfg.iconBox,
                        isSelected && 'scale-105',
                      )}
                    >
                      <Icon className="size-4 stroke-[2.3]" />
                    </div>
                  </div>

                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className={cn('text-3xl font-extrabold tracking-tight tabular-nums', cfg.count)}>
                      {count(filterValue)}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">liều</span>
                  </div>

                  <span className={cn('text-[11px] font-medium mt-0.5', cfg.hintColor)}>
                    {cfg.hint}
                  </span>

                  {isSelected && (
                    <div
                      aria-hidden="true"
                      className={cn('absolute bottom-1.5 left-4 right-4 h-1 rounded-full', cfg.indicatorBar)}
                    />
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Tầng 2: Toolbar gồm Lọc Pills, Ô tìm kiếm và Nút làm mới */}
        {mode === 'scheduled' && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border-2 border-slate-200/90 shadow-2xs dark:bg-slate-900 dark:border-slate-800">
            <ToggleGroup
              variant="default"
              size="sm"
              value={[filter]}
              onValueChange={(n) => n[0] && setFilter(n[0])}
              aria-label="Lọc theo trạng thái"
              className="flex flex-wrap items-center gap-2"
            >
              {FILTERS.map((f) => {
                const isSelected = filter === f
                const badgeCfg = FILTER_BADGES[f] || FILTER_BADGES['Tất cả']
                return (
                  <ToggleGroupItem
                    key={f}
                    value={f}
                    className={cn(
                      'inline-flex h-9 items-center gap-2 rounded-full px-4 py-1.5 text-xs font-extrabold transition-all duration-200 border-2',
                      isSelected
                        ? '!bg-gradient-to-r !from-[#24496F] !to-[#183552] !text-white shadow-[0_4px_12px_rgba(36,73,111,0.3)] border-[#24496F] -translate-y-0.5 font-black'
                        : 'border-slate-300 bg-white text-slate-800 hover:border-[#24496F] hover:shadow-2xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
                    )}
                  >
                    <span>{f}</span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums transition-colors',
                        isSelected ? badgeCfg.active : badgeCfg.inactive,
                      )}
                    >
                      {count(f)}
                    </span>
                  </ToggleGroupItem>
                )
              })}
            </ToggleGroup>

            <div className="flex items-center gap-2.5">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm người cao tuổi, số phòng..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9.5 w-56 sm:w-64 rounded-xl border-2 border-slate-400 bg-slate-50/80 pl-9 pr-3 text-xs font-bold text-slate-800 shadow-sm placeholder:text-slate-400 focus:bg-white focus:border-[#24496F] focus:outline-none focus:ring-2 focus:ring-[#24496F]/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={reload}
                className="h-9.5 gap-2 rounded-xl border-2 border-[#24496F]/50 bg-white px-4 text-xs font-extrabold text-[#24496F] shadow-sm hover:bg-[#24496F]/5 hover:border-[#24496F] transition-all dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
                title="Tải lại danh sách"
              >
                <RotateCw className="size-4 text-[#24496F]" />
                <span>Làm mới</span>
              </Button>
            </div>
          </div>
        )}
      </PageHeader>

      {mode === 'scheduled' && (
        <NowStrip
          items={lateGroups.map((g) => ({
            key: g.key,
            label: `${g.resident.name} ${g.time}`,
            onSelect: () => canRecord && setOpening(g),
          }))}
          summary={`${count('Đến giờ')} thẻ Đến giờ`}
        />
      )}

      <ProblemAlert problem={problem} />

      <p role="status" aria-live="polite" className="empty:hidden rounded-2xl border border-l-4 border-l-primary bg-card px-4 py-3 type-body-sm shadow-sm">
        {announcement}
      </p>

      {mode === 'prn' ? (
        <PrnPanel canRecord={canRecord} now={shift.now} onSaved={setAnnouncement} />
      ) : mode === 'family' ? (
        <FamilyMedicationPanel canRecord={canRecord} onSaved={setAnnouncement} />
      ) : mode === 'temporary' ? (
        <TemporaryNursePanel onSaved={setAnnouncement} />
      ) : mode === 'reconciliation' ? (
        <ReconciliationMode
          resident={reconciling}
          setResident={setReconciling}
          isDoctor={role === 'DOCTOR'}
          onSaved={setAnnouncement}
        />
      ) : mode === 'prescriptions' ? (
        <PrescriptionPanel
          role={role}
          canRecord={canRecord}
          onSaved={setAnnouncement}
          onReconcile={(resident) => {
            setReconciling(resident)
            setMode('reconciliation')
          }}
        />
      ) : !round ? (
        !problem && <p className="rounded-2xl border bg-card px-4 py-3 type-body-sm shadow-sm">Đang tải vòng phát thuốc…</p>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/70 p-12 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900/50">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-sky-50 text-3xl text-sky-600 dark:bg-sky-950 dark:text-sky-400">
            💊
          </div>
          <h3 className="mt-4 text-base font-bold text-slate-800 dark:text-slate-100">
            Không có liều thuốc nào trong ca hiện tại
          </h3>
          <p className="mt-1.5 max-w-md text-xs text-slate-500 leading-relaxed dark:text-slate-400">
            {shift.start
              ? `Ca trực hiện tại (${shift.start} – ${shift.end}) không có lịch phát thuốc nào cần thực hiện.`
              : 'Hiện tại chưa có ca trực nào được phân công hoặc ca trực đã hết giờ.'}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button
              variant="default"
              size="sm"
              onClick={() => setMode('prescriptions')}
              className="rounded-xl bg-[#24496f] hover:bg-[#1b3754] text-white px-4 py-2 text-xs font-semibold shadow-xs"
            >
              Xem danh sách Đơn thuốc
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={reload}
              className="rounded-xl border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              Làm mới dữ liệu
            </Button>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/40">
          {search ? (
            <>
              Không tìm thấy kết quả phù hợp với từ khóa <span className="font-semibold text-slate-800 dark:text-slate-200">"{search}"</span>.{' '}
              <button
                type="button"
                onClick={() => setSearch('')}
                className="font-semibold text-primary underline underline-offset-4 hover:text-primary/80"
              >
                Xóa tìm kiếm
              </button>
            </>
          ) : (
            <>
              Không có liều nào ở trạng thái <span className="font-semibold text-slate-800 dark:text-slate-200">"{filter}"</span>.{' '}
              <button
                type="button"
                onClick={() => setFilter('Tất cả')}
                className="font-semibold text-primary underline underline-offset-4 hover:text-primary/80"
              >
                Xem tất cả ({groups.length} liều)
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {times.map((t) => {
            const inSlot = active.filter((g) => g.time === t)
            const urgent = inSlot.some((g) => g.status === 'Trễ')
            const first = inSlot[0].doses[0]
            const w = { from: first.from ?? windowOf(t).from, to: first.to ?? windowOf(t).to }
            return (
              <Section
                key={t}
                label={t}
                sub={`${w.from} → ${w.to}${t === current ? ', bây giờ' : ''}`}
                count={inSlot.length}
                urgent={urgent}
                current={t === current}
                defaultOpen={inSlot.some((g) => OPEN.includes(g.status))}
              >
                {inSlot.map((g) => (
                  <DoseCard key={g.key} group={g} canRecord={canRecord} onOpen={setOpening} onLate={canRecord ? setLating : undefined} />
                ))}
              </Section>
            )
          })}
          {done.length > 0 && (
            <Section label="Đã xong" count={done.length} defaultOpen={false}>
              {done.map((g) => (
                <DoseCard key={g.key} group={g} canRecord={false} onOpen={setOpening} onLate={canRecord ? setLating : undefined} />
              ))}
            </Section>
          )}
        </div>
      )}

      <LateDoseSheet
        dose={lating}
        now={shift.now}
        onClose={() => setLating(null)}
        onSaved={async (message) => {
          setLating(null)
          setAnnouncement(message)
          await reload()
        }}
      />
      <DoseSheet group={opening} now={shift.now} onOpenChange={(open) => !open && setOpening(null)} onSave={save} />
    </div>
  )
}
