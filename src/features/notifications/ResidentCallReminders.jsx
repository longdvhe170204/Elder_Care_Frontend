import { useEffect, useState } from 'react'
import { getMeCallReminders } from '@/api'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { CallReminderSheet } from './CallReminderSheet'
import { ReminderItem } from './ReminderItem'

const POLL_MS = 30_000

// Lượt nhắc gọi về một người cao tuổi ngay trên hồ sơ sự cố (Q-388: module nguồn thấy các lượt nhắc gọi), để người xử lý
// không phải sang màn Thông báo tìm số. Chỉ hiện lượt người xem được nhắc hoặc có quyền gọi (GET /me/call-reminders);
// không có lượt nào thì không hiện gì. Hỏi lại mỗi 30 giây như yêu cầu nền.
export function ResidentCallReminders({ residentId, residentName }) {
  const [items, setItems] = useState([])
  const [opened, setOpened] = useState(null)

  const [version, setVersion] = useState(0)

  useEffect(() => {
    let live = true
    const run = (background) =>
      getMeCallReminders({ headers: background ? { 'X-Background-Refresh': 'true' } : {} }).then(
        ({ data }) => live && setItems((data ?? []).filter((r) => r.residentId === residentId)),
        () => live && setItems([]),
      )
    run(false)
    const timer = setInterval(() => run(true), POLL_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [residentId, version])

  if (items.length === 0) return null
  return (
    <section aria-label="Cần gọi điện" className="flex flex-col gap-3 rounded-xl border border-destructive bg-card p-4">
      <div className="flex flex-col gap-1">
        <h2 className="type-card-title text-destructive">Cần gọi điện</h2>
        <p className="type-body-sm text-muted-foreground">
          Gọi bằng điện thoại rồi ghi kết quả. Người nhà được gọi khi có sự cố khẩn cấp; nhân viên được gọi khi chưa bấm
          xác nhận đã nhận thông báo khẩn cấp sau 5 phút.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((r) => (
          <li key={r.id} className="rounded-lg border p-3">
            <ReminderItem
              reminder={r}
              residentName={residentName}
              onOpen={(id, startRecording = false) => setOpened({ id, startRecording })}
            />
          </li>
        ))}
      </ul>
      <Sheet open={opened !== null} onOpenChange={(open) => !open && setOpened(null)}>
        <SheetContent className="sm:max-w-lg">
          {opened && (
            <CallReminderSheet
              key={opened.id}
              id={opened.id}
              startRecording={opened.startRecording}
              onChanged={() => setVersion((v) => v + 1)}
            />
          )}
        </SheetContent>
      </Sheet>
    </section>
  )
}
