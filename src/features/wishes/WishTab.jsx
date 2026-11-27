import { useCallback, useState } from 'react'
import { cn } from '@/lib/utils'
import { EndOfLifeWish } from './EndOfLifeWish'
import { TreatmentWish } from './TreatmentWish'

// Tab "Nguyện vọng" trong khung chi tiết hồ sơ (001 T070, T080; US7). Từ 2026-11-26 (chủ dự án duyệt) hai phiếu là hai chip
// tách rời "Cuối đời", "Khi điều trị" như khung Nháp của Hành chính (WishDraftSheet); chip ghi tình trạng phiếu (chờ kiểm
// chứng, Hiệu lực), mở màn thì hiện chip có phiếu chờ kiểm chứng trước. Hai khối vẫn cùng nạp, chip ẩn giữ trạng thái đang
// nhập. Cờ hasEndOfLifeWish, hasTreatmentWish lấy từ hồ sơ để vai trò không xem được nội dung (Hành chính, Kế toán) vẫn
// biết đã có phiếu hay chưa (FR-023e, FR-023m); Kế toán không có cờ phiếu khi điều trị thì không có chip đó.

const STATUS = {
  draft: ['chờ kiểm chứng', 'bg-warning-foreground'],
  active: ['Hiệu lực', 'bg-success-foreground'],
}

export function WishTab({ residentId, status, allowedCommands = [], profile, onChanged }) {
  const [tab, setTab] = useState(null)
  const [statuses, setStatuses] = useState({})
  const showTreatment = profile?.hasTreatmentWish != null || allowedCommands.includes('DRAFT_TREATMENT_WISH')

  const reportEol = useCallback((value) => setStatuses((s) => (s.eol === value ? s : { ...s, eol: value })), [])
  const reportTr = useCallback((value) => setStatuses((s) => (s.tr === value ? s : { ...s, tr: value })), [])

  // Chưa chọn chip thì hiện phiếu chờ kiểm chứng trước, không có thì Cuối đời
  const shown = tab ?? (statuses.eol !== 'draft' && statuses.tr === 'draft' && showTreatment ? 'tr' : 'eol')
  const chips = [['eol', 'Cuối đời'], ...(showTreatment ? [['tr', 'Khi điều trị']] : [])]

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Phiếu nguyện vọng" className="flex flex-wrap gap-2">
        {chips.map(([key, label]) => {
          const mark = STATUS[statuses[key]]
          const selected = shown === key
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(key)}
              className={cn(
                'flex h-10 items-center gap-2 rounded-full border px-4 whitespace-nowrap type-body-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                selected
                  ? 'border-primary bg-primary font-medium text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-input',
              )}
            >
              {label}
              {mark && (
                <>
                  <span aria-hidden="true" className={cn('size-2 rounded-full ring-2 ring-card', mark[1])} />
                  <span className="sr-only">{`, ${mark[0]}`}</span>
                </>
              )}
            </button>
          )
        })}
      </div>
      <div role="tabpanel" aria-label="Nguyện vọng cuối đời" hidden={shown !== 'eol'}>
        <EndOfLifeWish
          residentId={residentId}
          status={status}
          allowedCommands={allowedCommands}
          hasWish={profile?.hasEndOfLifeWish}
          onChanged={onChanged}
          onStatus={reportEol}
        />
      </div>
      {showTreatment && (
        <div role="tabpanel" aria-label="Nguyện vọng khi điều trị" hidden={shown !== 'tr'}>
          <TreatmentWish
            residentId={residentId}
            status={status}
            allowedCommands={allowedCommands}
            hasWish={profile?.hasTreatmentWish}
            onChanged={onChanged}
            onStatus={reportTr}
          />
        </div>
      )}
    </div>
  )
}
