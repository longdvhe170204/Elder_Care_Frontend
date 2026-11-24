import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ResidentAvatar } from '@/common/ResidentAvatar'
import { StatusBadge } from '@/common/StatusBadge'
import { BASIS, STATUSES, timeOf } from './shiftPlanning'

// "Chi tiết công việc của ca": dữ liệu nguồn của từng người cao tuổi để đối chiếu (chỉ xem) và việc đã lập của người đó
export function ShiftSourceDialog({ open, onOpenChange, subtitle, source, tasks, people, focusResidentId }) {
  const residents = source?.residents ?? []
  const [chosen, setChosen] = useState(null)
  const selectedId = chosen ?? focusResidentId ?? residents[0]?.residentId
  const selected = residents.find((r) => r.residentId === selectedId)
  const name = (id) => people[id] || `Người cao tuổi · mã ${id}`
  const own = tasks.filter((t) => t.residentId === selectedId)
  const groups = selected
    ? [
        [
          BASIS.CARE_PLAN_ITEM,
          selected.planItems.map((i) => [
            `plan-${i.id}`,
            [i.content, ...(i.times ?? []).map((t) => t.slice(0, 5))].join(' · '),
          ]),
        ],
        ...Object.entries(
          selected.otherSources.reduce((all, s) => {
            const label = BASIS[s.type] || 'Nguồn khác'
            ;(all[label] ??= []).push([`${s.type}-${s.id}`, `${s.description} · ${timeOf(s.at)}`])
            return all
          }, {}),
        ),
      ].filter(([, items]) => items.length)
    : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
      >
        <div className="flex items-start justify-between gap-4 border-b p-5">
          <div className="flex flex-col gap-1">
            <DialogTitle className="type-title">Chi tiết công việc của ca</DialogTitle>
            <DialogDescription className="type-body-sm text-muted-foreground">{subtitle}</DialogDescription>
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </div>
        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-[15rem_1fr]">
          <nav aria-label="Người cao tuổi" className="flex flex-col gap-2 self-start rounded-xl border bg-muted p-3">
            <h3 className="type-label">Người cao tuổi</h3>
            {!residents.length && <p className="type-body-sm text-muted-foreground">Ca chưa có người cao tuổi.</p>}
            {residents.map((r) => {
              const active = r.residentId === selectedId
              return (
                <button
                  key={r.residentId}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setChosen(r.residentId)}
                  className={`flex min-h-12 items-center gap-3 rounded-lg border p-2 text-left focus-visible:outline-ring ${
                    active ? 'border-transparent bg-accent text-accent-foreground' : 'bg-card'
                  }`}
                >
                  <ResidentAvatar name={name(r.residentId)} code={String(r.residentId)} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate type-label">{name(r.residentId)}</span>
                    {r.residentId === focusResidentId && (
                      <span className="type-caption text-accent-foreground">Từ thông báo</span>
                    )}
                  </span>
                </button>
              )
            })}
          </nav>
          {selected && (
            <section aria-label={name(selectedId)} className="flex min-w-0 flex-col gap-4">
              <div className="flex items-center gap-3">
                <ResidentAvatar name={name(selectedId)} code={String(selectedId)} className="size-10" />
                <h3 className="type-title">{name(selectedId)}</h3>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="flex flex-col gap-3 self-start rounded-xl border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="type-card-title">Dữ liệu nguồn</h4>
                    <Badge variant="held">Chỉ xem</Badge>
                  </div>
                  <p className="border-b pb-3 type-body-sm text-muted-foreground">
                    Dùng để đối chiếu khi lập công việc, không tự thành công việc.
                  </p>
                  {!groups.length && <p className="type-body-sm text-muted-foreground">Không có dữ liệu nguồn.</p>}
                  {groups.map(([label, items]) => (
                    <div key={label} className="flex flex-col gap-1">
                      <p className="type-caption text-muted-foreground">{label}</p>
                      {items.map(([key, text]) => (
                        <p key={key}>{text}</p>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-3 self-start rounded-xl border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="type-card-title">Công việc đã lập</h4>
                    <Badge variant="held">{own.length} việc</Badge>
                  </div>
                  {!own.length && (
                    <p className="type-body-sm text-muted-foreground">Người này chưa có công việc đã lập trong ca.</p>
                  )}
                  {own.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-3 border-t pt-3">
                      <div className="min-w-0">
                        <p className="type-label">{t.content || t.taskType}</p>
                        <p className="type-body-sm text-muted-foreground">
                          {timeOf(t.plannedAt)} · {t.performer || 'Việc chung của tầng'}
                        </p>
                      </div>
                      <StatusBadge status={STATUSES[t.status]} />
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
