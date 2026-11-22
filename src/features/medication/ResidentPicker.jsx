import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ProblemAlert } from '@/common/ProblemAlert'
import { ResidentAvatar } from '@/common/ResidentAvatar'
import { problemOf } from '@/common/problem'
import { getResidents } from '@/api/api001'
import { cn } from '@/lib/utils'

// Danh sách dạng dòng, mỗi trang 5 người (phân trang phía màn hình trên danh sách backend trả)
const PAGE_SIZE = 5

// Chọn người cao tuổi (tìm qua GET /residents của 001, trong phạm vi của người dùng) cho màn Thuốc khi cần, Đơn thuốc:
// api-006 liệt kê đơn theo từng người cao tuổi nên màn phải chọn người trước.
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
      <form role="search" className="flex flex-wrap items-center gap-2" onSubmit={search}>
        <Input
          aria-label="Tìm người cao tuổi"
          placeholder="Họ tên hoặc mã hồ sơ"
          className="h-11 w-full sm:w-72"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button type="submit" variant="outline" className="h-11">
          Tìm
        </Button>
      </form>
      {state.status === 'error' && <ProblemAlert problem={state.problem} />}
      {state.status === 'ready' && state.items.length === 0 && (
        <p className="type-body-sm text-muted-foreground">Không có người cao tuổi khớp với từ tìm trong phạm vi của bạn.</p>
      )}
      {state.items.length > 0 && (
        <div className="flex flex-col gap-2">
          <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
            {visible.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  aria-label={`${r.personalInfo.fullName}, ${r.profileCode}`}
                  aria-pressed={r.id === selectedId}
                  onClick={() => onPick(r)}
                  className={cn(
                    'flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                    r.id === selectedId && 'bg-accent text-accent-foreground',
                  )}
                >
                  <ResidentAvatar name={r.personalInfo.fullName} code={String(r.id)} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate type-label">{r.personalInfo.fullName}</span>
                    <span className="type-caption text-muted-foreground tabular-nums">{r.profileCode}</span>
                  </span>
                  {r.id === selectedId && <span className="type-caption">Đang chọn</span>}
                </button>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav aria-label="Phân trang danh sách người cao tuổi" className="flex items-center justify-between gap-2">
              <span className="type-caption text-muted-foreground tabular-nums">
                {from + 1}–{Math.min(from + PAGE_SIZE, state.items.length)} trên {state.items.length} người
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
                  Trước
                </Button>
                <span className="type-caption tabular-nums">
                  Trang {current + 1} / {pages}
                </span>
                <Button variant="outline" size="sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
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
