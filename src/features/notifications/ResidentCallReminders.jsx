import { useEffect, useId, useState } from 'react'
import { getMeCallReminders } from '@/api'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { CallReminderSheet } from './CallReminderSheet'
import { ReminderItem } from './ReminderItem'

const POLL_MS = 30_000

// Lượt nhắc gọi về một người cao tuổi ngay trên hồ sơ sự cố (Q-388: module nguồn thấy các lượt nhắc gọi), để người xử lý
// không phải sang màn Thông báo tìm số. Chỉ hiện lượt người xem được nhắc hoặc có quyền gọi (GET /me/call-reminders);
// không có lượt nào thì không hiện gì. Hỏi lại mỗi 30 giây như yêu cầu nền.
// Đề xuất 2026-11-24 (góp ý test demo: khối quá dài): người nhà hiện đủ; nhân viên chưa xác nhận gom thành một dòng, bấm mới
// mở danh sách.
export function ResidentCallReminders({ residentId, residentName }) {
  const id = useId()
  const [items, setItems] = useState([])
  const [opened, setOpened] = useState(null)
  const [staffOpen, setStaffOpen] = useState(false)

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
  const staff = items.filter((r) => r.personToCall?.type === 'STAFF')
  const others = items.filter((r) => r.personToCall?.type !== 'STAFF')
  const row = (r) => (
    <li key={r.id} className="rounded-lg border p-3">
      <ReminderItem
        reminder={r}
        residentName={residentName}
        onOpen={(reminderId, startRecording = false) => setOpened({ id: reminderId, startRecording })}
      />
    </li>
  )
  return (
    <section aria-label="Cần gọi điện" className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <h2 className="type-card-title">Cần gọi điện ({items.length})</h2>
      {others.length > 0 && <ul className="flex flex-col gap-2">{others.map(row)}</ul>}
      {staff.length > 0 && (
        <div className="flex flex-col gap-2">
          <Button
            variant="link"
            aria-expanded={staffOpen}
            aria-controls={id}
            className="h-11 justify-start self-start px-0"
            onClick={() => setStaffOpen((o) => !o)}
          >
            {staffOpen
              ? 'Thu gọn danh sách nhân viên'
              : `${staff.length} nhân viên chưa xác nhận đã nhận thông báo, xem để gọi`}
          </Button>
          {staffOpen && (
            <ul id={id} className="flex flex-col gap-2">
              {staff.map(row)}
            </ul>
          )}
        </div>
      )}
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
