import { cn } from '@/lib/utils'

// Nhãn trạng thái của yêu cầu điều chỉnh hợp đồng: dạng viên thuốc bo tròn (pill), nền pastel dịu mắt,
// chữ đậm kèm chấm tròn trạng thái (status dot) ở trước theo tông màu nghiệp vụ:
// - Đã áp dụng, Đã duyệt: xanh lá pastel (bg-success), chấm xanh lá (bg-success-foreground)
// - Chờ duyệt, Áp dụng lỗi: vàng cam pastel (bg-warning), chấm vàng cam (bg-warning-foreground)
// - Chờ ký: xanh dương/info pastel (bg-info), chấm xanh dương (bg-info-foreground)
// - Từ chối: đỏ pastel (bg-destructive-subtle), chấm đỏ (bg-destructive)
// - Đã thay thế, Hủy, Nháp: xám pastel (bg-muted), chấm xám (bg-muted-foreground)
const awaitingSignature = (r) => r.status === 'APPROVED' && r.addendum?.status === 'PENDING_SIGNATURE'

function tone(r) {
  if (r.status === 'APPLIED' || (r.status === 'APPROVED' && !awaitingSignature(r))) {
    return {
      pill: 'bg-success text-success-foreground',
      dot: 'bg-success-foreground',
    }
  }
  if (awaitingSignature(r)) {
    return {
      pill: 'bg-warning text-warning-foreground',
      dot: 'bg-warning-foreground',
    }
  }
  if (r.status === 'PENDING_APPROVAL' || r.status === 'APPLY_FAILED') {
    return {
      pill: 'bg-warning text-warning-foreground',
      dot: 'bg-warning-foreground',
    }
  }
  if (r.status === 'REJECTED') {
    return {
      pill: 'bg-destructive-subtle text-destructive',
      dot: 'bg-destructive',
    }
  }
  return {
    pill: 'bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground',
  }
}

export function StatusPill({ request, text, onDark = false, withDot = false }) {
  const { pill, dot } = tone(request)
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap transition-colors w-28 text-center',
        onDark
          ? 'bg-card text-primary font-bold shadow-xs'
          : pill,
      )}
    >
      {withDot && <span aria-hidden="true" className={cn('size-1.5 rounded-full shrink-0', dot)} />}
      {text}
    </span>
  )
}

