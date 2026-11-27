import { useCallback, useEffect, useState } from 'react'
import { Calendar, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ProblemAlert } from '@/common/ProblemAlert'
import { problemOf } from '@/common/problem'
import { cn } from '@/lib/utils'
import { loadDoseRound } from './doseRound'

const todayVN = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })

const STATUS_OPTIONS = [
  'Tất cả',
  'Đã dùng',
  'Trễ',
  'Bỏ lỡ',
  'Đến giờ',
  'Chưa đến giờ',
  'Tạm dừng',
  'Từ chối',
  'Không thực hiện',
]

const STATUS_STYLE = {
  'Đã dùng': 'bg-emerald-50 text-emerald-800 border-emerald-200',
  Trễ: 'bg-rose-600 text-white border-rose-600',
  'Bỏ lỡ': 'bg-rose-50 text-rose-800 border-rose-200',
  'Đến giờ': 'bg-amber-50 text-amber-800 border-amber-200',
  'Chưa đến giờ': 'bg-sky-50 text-sky-800 border-sky-200',
  'Tạm dừng': 'bg-slate-100 text-slate-700 border-slate-300',
  'Từ chối': 'bg-orange-50 text-orange-800 border-orange-200',
  'Không thực hiện': 'bg-slate-100 text-slate-600 border-slate-300',
}

const PAGE_SIZE = 10

export function DoseHistoryPanel() {
  const [date, setDate] = useState(() => todayVN())
  const [statusFilter, setStatusFilter] = useState('Tất cả')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [round, setRound] = useState(null)
  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState(null)

  const load = useCallback(async (targetDate) => {
    setLoading(true)
    setProblem(null)
    try {
      const data = await loadDoseRound({
        from: `${targetDate}T00:00:00+07:00`,
        to: `${targetDate}T23:59:59+07:00`,
      })
      setRound(data)
    } catch (error) {
      setProblem(problemOf(error))
      setRound({ doses: [], residents: [] })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tải lịch sử theo ngày
    load(date)
  }, [date, load])

  const residentMap = new Map((round?.residents ?? []).map((r) => [r.code, r]))
  const q = query.trim().toLowerCase()
  const filtered = (round?.doses ?? []).filter((d) => {
    const res = residentMap.get(d.residentCode)
    const matchStatus = statusFilter === 'Tất cả' || d.status === statusFilter
    const matchQuery =
      !q ||
      d.drug?.toLowerCase().includes(q) ||
      res?.name?.toLowerCase().includes(q) ||
      res?.room?.toLowerCase().includes(q)
    return matchStatus && matchQuery
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-slate-400" aria-hidden="true" />
            <Input
              type="date"
              aria-label="Chọn ngày xem lịch sử phát thuốc"
              value={date}
              onChange={(e) => {
                if (e.target.value) {
                  setDate(e.target.value)
                  setPage(1)
                }
              }}
              className="h-9 w-40 rounded-xl text-xs font-semibold"
            />
          </div>
          <select
            aria-label="Lọc theo trạng thái liều"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPage(1)
            }}
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                Trạng thái: {s}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(1)
              }}
              placeholder="Tìm người cao tuổi, phòng, thuốc..."
              className="h-9 w-60 rounded-xl pl-8 text-xs"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => load(date)}
            className="h-9 gap-1.5 rounded-xl px-3 text-xs font-semibold"
          >
            <RefreshCw className="size-3.5" />
            Làm mới
          </Button>
        </div>
      </div>

      <ProblemAlert problem={problem} />

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-10 text-center text-xs text-slate-500 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          Không có liều thuốc nào phù hợp trong ngày {date.split('-').reverse().join('/')}.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="overflow-x-auto rounded-2xl border-2 border-[#142B45] bg-white shadow-sm dark:border-[#24496F] dark:bg-slate-900">
            <table className="w-full text-left text-xs">
              <thead className="border-b-2 border-[#142B45] bg-[#142B45] text-[11px] font-bold uppercase tracking-wider text-white dark:border-[#24496F] dark:bg-[#24496F]">
                <tr>
                  <th className="px-4 py-3">Giờ</th>
                  <th className="px-4 py-3">Người cao tuổi</th>
                  <th className="px-4 py-3">Phòng</th>
                  <th className="px-4 py-3">Thuốc & Liều</th>
                  <th className="px-4 py-3">Nguồn</th>
                  <th className="px-4 py-3">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#142B45]/15 dark:divide-slate-800">
                {paged.map((d) => {
                  const res = residentMap.get(d.residentCode)
                  return (
                    <tr key={d.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                      <td className="px-4 py-3 font-bold tabular-nums text-slate-900 dark:text-slate-100">{d.time}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                        {res?.name ?? `Mã ${d.residentCode}`}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{res?.room ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{d.drug}</span>
                        <span className="ml-1.5 text-slate-500">
                          ({d.dose} · {d.route})
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{d.source}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold',
                            STATUS_STYLE[d.status] ?? 'bg-slate-100 text-slate-700 border-slate-200',
                          )}
                        >
                          {d.status}
                          {d.late && d.status === 'Đã dùng' ? ' (muộn)' : ''}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#142B45]/25 bg-white px-4 py-2.5 text-xs shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <span className="font-medium text-slate-600 dark:text-slate-300">
              Trang <strong className="text-[#142B45] dark:text-slate-100">{safePage}</strong> / {totalPages} ({filtered.length} liều · {PAGE_SIZE} hàng/trang)
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-xl border-[#142B45]/30 px-3 text-xs font-semibold text-[#142B45] hover:bg-[#142B45] hover:text-white disabled:opacity-40 dark:border-slate-700 dark:text-slate-200"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Trước
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-xl border-[#142B45]/30 px-3 text-xs font-semibold text-[#142B45] hover:bg-[#142B45] hover:text-white disabled:opacity-40 dark:border-slate-700 dark:text-slate-200"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Sau
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
