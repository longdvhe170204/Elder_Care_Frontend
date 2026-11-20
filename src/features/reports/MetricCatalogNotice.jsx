import { TriangleAlert } from 'lucide-react'
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

// Báo không tải được danh mục tên chỉ tiêu (GET /metric-catalog) thay vì lặng lẽ hiện mã chỉ tiêu (2026-11-20: chính
// sách quản trị của trình duyệt trên máy thành viên từng chặn GET /metrics). Dùng ở Tổng quan và Báo cáo.
export function MetricCatalogNotice({ onRetry }) {
  return (
    <Alert variant="attention" role="status">
      <TriangleAlert aria-hidden="true" />
      <AlertDescription>
        Không tải được tên chỉ tiêu nên các chỉ tiêu đang hiện bằng mã. Trình duyệt hoặc mạng có thể đang chặn yêu cầu.
      </AlertDescription>
      <AlertAction>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Thử lại
        </Button>
      </AlertAction>
    </Alert>
  )
}
