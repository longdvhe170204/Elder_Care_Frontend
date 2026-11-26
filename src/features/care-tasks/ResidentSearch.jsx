import { useEffect, useId, useRef, useState } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import { getResidents } from '@/api'
import { ResidentAvatar } from '@/common/ResidentAvatar'
import { ProblemAlert } from '@/common/ProblemAlert'
import { problemOf } from '@/common/problem'
import { residentLabel as labelOf } from './carePlanLabels'

// Ô tìm và chọn người cao tuổi (Figma "Kế hoạch chăm sóc · Mở gợi ý"): gõ tên hoặc mã hồ sơ, danh sách gợi ý có chữ
// cái đại diện. Phòng, giường chưa có trong Profile của api-001 nên chưa hiện.
export function ResidentSearch({ onChange }) {
  const listId = useId()
  const boxRef = useRef(null)
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState([])
  const [failure, setFailure] = useState(null)
  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    const timer = setTimeout(() => {
      getResidents({ query: { q: text.trim() || undefined } })
        .then(({ data }) => {
          if (!cancelled) {
            setResults(data.items)
            setFailure(null)
          }
        })
        .catch((error) => {
          if (!cancelled) setFailure(problemOf(error))
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [text, open])
  // Bấm ra ngoài ô tìm và danh sách thì đóng danh sách
  useEffect(() => {
    if (!open) return undefined
    function outside(event) {
      if (!boxRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  function choose(resident) {
    setText(labelOf(resident))
    setOpen(false)
    onChange(resident)
  }
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
      <h2 className="type-card-title">Tìm người cao tuổi</h2>
      <div className="relative" ref={boxRef}>
        <input
          role="combobox"
          aria-label="Tìm người cao tuổi"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder="Tên hoặc mã hồ sơ"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setOpen(Boolean(e.target.value.trim()))
          }}
          // Chỉ mở lại khi đã có chữ: ô trống thì danh sách sẽ là mọi người cao tuổi, đè lên hàng chờ bên dưới (Q-448)
          onFocus={() => text.trim() && setOpen(true)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          className="h-11 w-full rounded-lg border border-input bg-background pr-10 pl-3 focus-visible:outline-ring"
        />
        <Search
          className="pointer-events-none absolute top-3.5 right-3 size-4 text-muted-foreground"
          aria-hidden="true"
        />
        {open && results.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Người cao tuổi phù hợp"
            className="absolute z-20 mt-2 max-h-80 w-full max-w-xl overflow-y-auto rounded-xl border bg-popover p-2 shadow-lg"
          >
            {results.map((resident) => (
              <li
                key={resident.id}
                role="option"
                aria-selected="false"
                tabIndex={0}
                onClick={() => choose(resident)}
                onKeyDown={(e) => e.key === 'Enter' && choose(resident)}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <ResidentAvatar name={resident.personalInfo?.fullName ?? ''} code={String(resident.id)} />
                <span className="min-w-0 flex-1 truncate type-body font-semibold">{labelOf(resident)}</span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
              </li>
            ))}
          </ul>
        )}
      </div>
      <ProblemAlert problem={failure} />
    </section>
  )
}
