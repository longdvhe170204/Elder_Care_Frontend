import { useEffect, useState } from 'react'
import { getAlerts } from '@/api'
import { Button } from '@/components/ui/button'
import { isOpen } from '@/features/alerts/alertView'

// Dòng nhắc ở chi tiết sự cố: người cao tuổi đang có cảnh báo nguy kịch mở thì chỉ báo và dẫn sang màn Cảnh báo, nơi xử lý
// (xác nhận lại nguyện vọng, ghi lựa chọn). Sự cố và cảnh báo nguy kịch là hai bản ghi riêng (FR-041, BR-M05-15); không có
// cảnh báo nguy kịch thì không hiện gì.
export function CriticalNotice({ residentId }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let live = true
    getAlerts({ query: { residentId } }).then(
      ({ data }) =>
        live &&
        setOpen((data ?? []).some((a) => a.type === 'CRITICAL_CONDITION' && a.criticalFlagId != null && isOpen(a))),
      () => live && setOpen(false),
    )
    return () => {
      live = false
    }
  }, [residentId])
  if (!open) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 p-3">
      <p className="type-body-sm text-destructive">Người cao tuổi này đang có cảnh báo nguy kịch chưa đóng.</p>
      <Button
        type="button"
        variant="outline"
        className="h-11 border-destructive/40 text-destructive hover:bg-destructive/10"
        onClick={() => {
          location.hash = '#alerts'
        }}
      >
        Xem cảnh báo nguy kịch
      </Button>
    </div>
  )
}
