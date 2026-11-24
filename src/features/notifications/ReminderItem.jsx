import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/common/dateTime'

// Vì sao phải gọi (BR-M13-02): nhân viên chưa bấm "Xác nhận đã nhận" thông báo khẩn cấp, hoặc người nhà cần được báo
const WHY = {
  STAFF: 'Chưa xác nhận đã nhận thông báo khẩn cấp',
  FAMILY_MEMBER: 'Người nhà cần được báo',
}

// Một lượt nhắc đang Chờ kết quả: nút là việc cần làm sau khi gọi; không ghi được thì chỉ mở xem. Dòng thứ hai nói vì sao
// gọi và nội dung cần báo (góp ý test demo 2026-11-23: trước chỉ có tên và số nên không biết gọi để làm gì).
export function ReminderItem({ reminder: r, residentName, onOpen }) {
  const person = r.personToCall
  const canRecord = r.canRecordResult && person.phoneNumber
  const latest = (r.contentToReport ?? []).at(-1)?.content
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button variant="link" className="h-auto p-0 type-label" onClick={() => onOpen(r.id)}>
            {`Gọi ${person.fullName}`}
          </Button>
          {person.phoneNumber ? (
            <a
              href={`tel:${person.phoneNumber}`}
              className="type-label tabular-nums underline-offset-4 hover:underline"
            >
              {person.phoneNumber}
            </a>
          ) : (
            <span className="type-body-sm text-muted-foreground">Chưa có số điện thoại</span>
          )}
        </div>
        <span className="type-body-sm">
          {[WHY[person.type], residentName].filter(Boolean).join(' · ')}
          {latest && `. Báo: ${latest}`}
        </span>
        <span className="type-caption text-muted-foreground tabular-nums">
          {`Đang nhắc ${r.currentlyReminded}. Hạn ${formatDateTime(r.dueAt).slice(-5)}`}
        </span>
      </div>
      {canRecord ? (
        <Button onClick={() => onOpen(r.id, true)}>Ghi kết quả gọi</Button>
      ) : (
        <Button variant="outline" onClick={() => onOpen(r.id)}>
          Mở lượt nhắc gọi
        </Button>
      )}
    </div>
  )
}
