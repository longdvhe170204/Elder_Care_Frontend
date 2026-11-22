import { CircleCheck, Clock, PenLine } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

// Nhãn trạng thái của yêu cầu điều chỉnh hợp đồng: nền đặc màu đậm, chữ và icon trắng, in đậm (Đã áp dụng, Đã duyệt xanh
// lá; Chờ duyệt vàng nâu; Chờ ký xanh dương; Từ chối đỏ; còn lại xám). Màn này dùng nền theo bản thiết kế đã duyệt
// 2026-11-22, khác chữ màu không nền ở DESIGN.md 3.5. text-card: trắng ở chế độ sáng, xanh đêm ở chế độ tối (nền tông sáng).
// onDark: đặt trên nền xanh đêm của đầu khung chi tiết.
const awaitingSignature = (r) => r.status === 'APPROVED' && r.addendum?.status === 'PENDING_SIGNATURE'
const LIGHT = 'h-7 px-3 text-[13px] font-bold shadow-sm [&>svg]:size-4 [&>svg]:stroke-[3]'
const SOLID = 'h-7 px-3 text-[13px] text-card font-bold shadow-sm [&>svg]:size-4 [&>svg]:stroke-[3]'

function tone(r) {
  if (r.status === 'APPLIED' || (r.status === 'APPROVED' && !awaitingSignature(r)))
    return [`bg-success-foreground ${SOLID}`, CircleCheck]
  if (awaitingSignature(r)) return [`bg-warning text-warning-foreground ${LIGHT}`, PenLine]
  if (r.status === 'PENDING_APPROVAL' || r.status === 'APPLY_FAILED') return [`bg-warning-foreground ${SOLID}`, Clock]
  if (r.status === 'REJECTED') return [`bg-destructive ${SOLID}`, null]
  return [`bg-muted-foreground ${SOLID}`, null]
}

export function StatusPill({ request, text, onDark = false }) {
  const [classes, Icon] = tone(request)
  return (
    <Badge
      variant="secondary"
      className={
        onDark
          ? 'h-7 px-3 text-[13px] bg-card text-primary font-bold shadow-sm [&>svg]:size-4 [&>svg]:stroke-[3]'
          : classes
      }
    >
      {Icon && <Icon aria-hidden />}
      {text}
    </Badge>
  )
}
