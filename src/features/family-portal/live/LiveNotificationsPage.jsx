import { useCallback, useEffect, useRef, useState } from 'react'
import { OctagonAlert } from 'lucide-react'
import { getMeNotifications, postNotificationsByIdAcknowledge } from '@/api'
import { Alert, AlertAction, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/common/PageHeader'
import { ProblemAlert } from '@/common/ProblemAlert'
import { StatusBadge } from '@/common/StatusBadge'
import { formatDateTime } from '@/common/dateTime'
import { NotificationDetail } from '@/common/notifications/NotificationDetail'
import { problemOf } from '@/common/problem'
import { cn } from '@/lib/utils'
import { PendingRightChanges } from './PendingRightChanges'
import { RecipientConfirmation } from './RecipientConfirmation'

// P6 Thông báo của cổng người thân, bản đọc API (009 FR-033, FR-034, FR-026): cùng bố cục với bản mẫu NotificationsPage.
// Khẩn cấp chưa xác nhận lên đầu (backend sắp), có "Xác nhận đã nhận" (không phải tiếp nhận xử lý, Q-102); bấm tiêu đề mở
// khung chi tiết dùng chung (`common/notifications`), phần đã hết quyền thay bằng dòng khóa. Nguồn
// M12.RECIPIENT_CONFIRMATION mở yêu cầu xác nhận người nhận ngay trong khung (013 T019; FR-017, FR-030).

const isOpenUrgent = (n) => n.level === 'URGENT' && !n.acknowledgedAt

const confirmationIdOf = (n) => {
  const source = n.sourceRecord
  if (!source || source.canOpen === false || source.type !== 'M12.RECIPIENT_CONFIRMATION') return null
  const id = Number(source.id)
  return Number.isInteger(id) ? id : null
}

export function LiveNotificationsPage({ viewer }) {
  const [state, setState] = useState({ status: 'loading', items: [] })
  const [opened, setOpened] = useState(null)
  const [announcement, setAnnouncement] = useState('')

  const load = useCallback(async () => {
    try {
      const { data } = await getMeNotifications({})
      setState({ status: 'ready', items: data.items })
    } catch {
      setState({ status: 'error', items: [] })
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tải khi mở màn
    load()
  }, [load])

  const replace = useCallback((data) => {
    setState((s) => ({ ...s, items: s.items.map((n) => (n.id === data.id ? data : n)) }))
  }, [])

  const sourceAction = (n) =>
    confirmationIdOf(n) !== null && (
      <Button
        variant="outline"
        className="self-start"
        onClick={() => setOpened({ kind: 'confirmation', id: confirmationIdOf(n) })}
      >
        Xem yêu cầu xác nhận
      </Button>
    )

  const urgent = state.items.filter(isOpenUrgent)
  const rest = state.items.filter((n) => !isOpenUrgent(n))
  const titles = { Title: SheetTitle, Description: SheetDescription }

  return (
    <>
      <PageHeader title="Thông báo" subtitle="Thông báo viện gửi bạn và việc chờ bạn xác nhận." />
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {viewer?.representative && viewer.residentId && <PendingRightChanges residentId={viewer.residentId} />}

      {state.status === 'loading' && (
        <div aria-busy="true" className="flex flex-col gap-2 rounded-xl border bg-card p-4">
          <span className="sr-only">Đang tải thông báo</span>
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      )}
      {state.status === 'error' && (
        <div className="rounded-xl border bg-card p-4">
          <Alert role="alert">
            <AlertTitle>Không tải được thông báo</AlertTitle>
            <AlertAction>
              <Button variant="outline" size="sm" onClick={load}>
                Thử lại
              </Button>
            </AlertAction>
          </Alert>
        </div>
      )}
      {state.status === 'ready' && state.items.length === 0 && (
        <div className="rounded-xl border bg-card p-4">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Không có thông báo nào</EmptyTitle>
              <EmptyDescription>Thông báo viện gửi bạn sẽ hiện ở đây.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      )}
      {state.status === 'ready' && state.items.length > 0 && (
        <ul className="flex flex-col gap-3" aria-label="Thông báo">
          {[...urgent, ...rest].map((n) => (
            <Notification
              key={n.id}
              n={n}
              onOpen={() => setOpened({ kind: 'notification', id: n.id })}
              onAcknowledged={() => {
                setAnnouncement('Đã xác nhận thông báo khẩn cấp')
                load()
              }}
            />
          ))}
        </ul>
      )}

      <Sheet open={opened !== null} onOpenChange={(open) => !open && setOpened(null)}>
        <SheetContent className="sm:max-w-lg">
          <div className="flex flex-col gap-4 overflow-y-auto p-4">
            {opened?.kind === 'notification' && (
              <NotificationDetail
                key={`n-${opened.id}`}
                id={opened.id}
                onOpened={replace}
                sourceAction={sourceAction}
                {...titles}
              />
            )}
            {opened?.kind === 'confirmation' && (
              <RecipientConfirmation key={`c-${opened.id}`} id={opened.id} {...titles} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

// Một thông báo: Khẩn cấp chưa xác nhận có viền đỏ và nút "Xác nhận đã nhận" (FR-026); mở thông báo không phải xác nhận
function Notification({ n, onOpen, onAcknowledged }) {
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const key = useRef(crypto.randomUUID())
  const urgent = n.level === 'URGENT'
  const needsAck = isOpenUrgent(n)

  async function acknowledge() {
    setFailure(null)
    setBusy(true)
    try {
      await postNotificationsByIdAcknowledge({ path: { id: n.id }, headers: { 'Idempotency-Key': key.current } })
      onAcknowledged()
    } catch (error) {
      setFailure(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li
      className={cn(
        'flex flex-col gap-2 rounded-xl border bg-card px-4 py-3',
        needsAck && 'border-transparent ring-[1.5px] ring-destructive',
      )}
    >
      <div className="flex items-start gap-2">
        {urgent && <OctagonAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />}
        <Button
          variant="link"
          className="h-auto min-w-0 flex-1 justify-start p-0 text-left whitespace-normal"
          onClick={onOpen}
        >
          {n.title}
        </Button>
        {urgent && <StatusBadge status="Khẩn cấp" />}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="type-caption text-muted-foreground tabular-nums">
          {n.sentAt ? formatDateTime(n.sentAt) : ''}
          {n.viewedAt ? ', đã xem' : ', chưa xem'}
        </span>
        {needsAck && (
          <Button size="sm" disabled={busy} onClick={acknowledge}>
            Xác nhận đã nhận
          </Button>
        )}
        {urgent && n.acknowledgedAt && (
          <span className="type-caption text-muted-foreground">Bạn đã xác nhận đã nhận.</span>
        )}
      </div>
      <ProblemAlert problem={failure} />
    </li>
  )
}
