import { useCallback, useEffect, useState } from 'react'
import { Check, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ProblemAlert } from '@/common/ProblemAlert'
import { ResidentAvatar } from '@/common/ResidentAvatar'
import { problemOf } from '@/common/problem'
import { getResidents } from '@/api/api001'
import { cn } from '@/lib/utils'

// Danh sách dạng dòng, mỗi trang tối đa 8 người theo yêu cầu người dùng
const PAGE_SIZE = 8

// Chọn người cao tuổi (tìm qua GET /residents của 001, trong phạm vi của người dùng) cho màn Thuốc khi cần, Đơn thuốc:
// api-006 liệt kê đơn theo từng người cao tuổi nên màn phải chọn người trước.
// Hiển thị danh sách 8 người/trang, có phân trang rõ ràng, nút bấm và trạng thái nổi bật.
export function ResidentPicker({ onPick, selectedId }) {
  const [q, setQ] = useState('')
  const [state, setState] = useState({ status: 'loading', items: [] })
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(state.items.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const from = current * PAGE_SIZE
  const visible = state.items.slice(from, from + PAGE_SIZE)

  const load = useCallback(async (text) => {
    setState({ status: 'loading', items: [] })
    try {
      const { data } = await getResidents({ query: { q: text || undefined } })
      setPage(0)
      setState({ status: 'ready', items: data.items })
    } catch (error) {
      setState({ status: 'error', items: [], problem: problemOf(error) })
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tải danh sách khi mở màn
    load('')
  }, [load])

  function search(event) {
    event.preventDefault()
    load(q.trim())
  }

  return (
    <div className="flex flex-col gap-3">
      <form role="search" className="flex items-center gap-2" onSubmit={search}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            aria-label="Tìm người cao tuổi"
            placeholder="Họ tên hoặc mã hồ sơ..."
            className="h-10 w-full rounded-xl border-slate-200 bg-white pl-9 pr-3 text-xs shadow-xs placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-slate-800 dark:bg-slate-900"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          variant="default"
          className="h-10 rounded-xl bg-[#24496f] hover:bg-[#193552] px-4 text-xs font-bold text-white shadow-xs transition-all hover:shadow-sm"
        >
          Tìm
        </Button>
      </form>

      {state.status === 'error' && <ProblemAlert problem={state.problem} />}
      {state.status === 'ready' && state.items.length === 0 && (
        <p className="type-body-sm text-muted-foreground">Không có người cao tuổi khớp với từ tìm trong phạm vi của bạn.</p>
      )}

      {state.items.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <ul className="flex flex-col divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {visible.map((r) => {
              const isSelected = r.id === selectedId
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    aria-label={`${r.personalInfo.fullName}, ${r.profileCode}`}
                    aria-pressed={isSelected}
                    onClick={() => onPick(r)}
                    className={cn(
                      'flex min-h-13 w-full items-center gap-3 px-3.5 py-2 text-left transition-all',
                      isSelected
                        ? 'border-l-[5px] border-l-[#24496f] bg-sky-50/90 text-slate-900 font-semibold dark:border-l-sky-500 dark:bg-sky-950/40 dark:text-slate-100'
                        : 'text-slate-700 hover:bg-slate-50/80 dark:text-slate-300 dark:hover:bg-slate-800/40',
                    )}
                  >
                    <ResidentAvatar
                      name={r.personalInfo.fullName}
                      code={String(r.id)}
                      className="size-8.5 text-xs font-bold shadow-xs"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span
                        className={cn(
                          'truncate text-xs font-bold tracking-tight',
                          isSelected ? 'text-[#142B45] dark:text-sky-300' : 'text-slate-800 dark:text-slate-200',
                        )}
                      >
                        {r.personalInfo.fullName}
                      </span>
                      <span className="text-[11px] font-medium text-slate-400 tabular-nums">{r.profileCode}</span>
                    </span>
                    {isSelected && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#24496f] px-2.5 py-0.5 text-[11px] font-bold text-white shadow-xs dark:bg-sky-600">
                        <Check className="size-3 stroke-[3]" />
                        Đang chọn
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>

          {pages > 1 && (
            <nav aria-label="Phân trang danh sách người cao tuổi" className="flex items-center justify-between gap-2 px-1 pt-0.5">
              <span className="text-xs text-slate-500 tabular-nums">
                {from + 1}–{Math.min(from + PAGE_SIZE, state.items.length)} trên {state.items.length} người
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={current === 0}
                  onClick={() => setPage(current - 1)}
                  className="h-8 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40"
                >
                  Trước
                </Button>
                <span className="px-1 text-xs font-bold text-slate-700 tabular-nums dark:text-slate-300">
                  {current + 1} / {pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={current >= pages - 1}
                  onClick={() => setPage(current + 1)}
                  className="h-8 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40"
                >
                  Sau
                </Button>
              </div>
            </nav>
          )}
        </div>
      )}
    </div>
  )
}
