import { useCallback, useEffect, useRef, useState } from 'react'
import { getRightChangeRequests, postRightChangeRequestsByIdByCommand } from '@/api'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { ProblemAlert } from '@/common/ProblemAlert'
import { problemOf } from '@/common/problem'
import { PortalCard } from '../PortalParts'

// Yêu cầu thay đổi quyền chờ người đại diện xác nhận (012 FR-013, FR-015, FR-050; api-012 `GET /right-change-requests`
// lọc Chờ xác nhận, `POST /right-change-requests/{id}/confirm|reject`). Test BF-16 (2026-11-22): trước đây chỉ bản mẫu
// có mục "Chờ bạn quyết định". Từ chối bắt buộc lý do. Tải lỗi thì không hiện mục.

const RIGHTS = {
  VIEW_HEALTH: 'Xem sức khỏe',
  VIEW_COSTS: 'Xem chi phí',
  RECEIVE_URGENT: 'Nhận thông báo khẩn',
  REGISTER_VISITS: 'Đăng ký thăm',
  PICKUP_ALLOWED: 'Được phép đón',
  REQUEST_SERVICES: 'Được yêu cầu thay đổi dịch vụ',
}

function describe(request) {
  const value = request.newValue ? 'Bật' : 'Tắt'
  // familyMemberName: họ tên người bị tác động backend trả (thêm 2026-11-24, test BF-12)
  const person = request.familyMemberName ?? request.newPicker?.fullName ?? 'người thân'
  switch (request.type) {
    case 'RIGHT':
      return `${value} quyền ${RIGHTS[request.right] ?? request.right} cho ${person}`
    case 'SELF_RETURN':
      return `${value} dấu được tự về`
    case 'SET_REPRESENTATIVE':
      return `Đặt thêm người đại diện: ${person}`
    case 'REMOVE_REPRESENTATIVE':
      return `Thôi người đại diện: ${person}`
    default:
      return 'Yêu cầu thay đổi quyền'
  }
}

function PendingRequest({ request, onDecided }) {
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const keys = useRef({ confirm: crypto.randomUUID(), reject: crypto.randomUUID() })
  const missingReason = submitted && !reason.trim()

  async function send(command) {
    if (command === 'reject' && !reason.trim()) {
      setSubmitted(true)
      return
    }
    setFailure(null)
    setBusy(true)
    try {
      await postRightChangeRequestsByIdByCommand({
        path: { id: request.id, command },
        headers: { 'Idempotency-Key': keys.current[command] },
        body: command === 'reject' ? { reason: reason.trim() } : {},
      })
      onDecided(command === 'confirm' ? 'Đã xác nhận yêu cầu.' : 'Đã từ chối yêu cầu.')
    } catch (error) {
      setFailure(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="flex flex-col gap-2 border-t py-3 first:border-t-0 first:pt-0 last:pb-0">
      <span className="type-label">{describe(request)}</span>
      {request.reason && <span className="text-muted-foreground">{`Lý do: ${request.reason}`}</span>}
      <ProblemAlert problem={failure} title="Chưa gửi được quyết định" />
      {!rejecting ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => send('confirm')}>
            Xác nhận yêu cầu
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => setRejecting(true)}>
            Từ chối
          </Button>
        </div>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            send('reject')
          }}
        >
          <Field data-invalid={missingReason || undefined}>
            <FieldLabel htmlFor={`right-reject-${request.id}`}>Lý do từ chối</FieldLabel>
            <Textarea
              id={`right-reject-${request.id}`}
              rows={2}
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-invalid={missingReason || undefined}
            />
            {missingReason && <FieldError>Nhập lý do từ chối</FieldError>}
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="outline" disabled={busy}>
              Gửi từ chối
            </Button>
            <Button type="button" variant="ghost" onClick={() => setRejecting(false)}>
              Quay lại
            </Button>
          </div>
        </form>
      )}
    </li>
  )
}

export function PendingRightChanges({ residentId }) {
  const [items, setItems] = useState([])
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    try {
      const { data } = await getRightChangeRequests({ query: { residentId, status: 'PENDING_CONFIRMATION' } })
      setItems(data ?? [])
    } catch {
      setItems([])
    }
  }, [residentId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tải khi mở màn
    load()
  }, [load])

  return (
    <>
      <p role="status" className={message ? 'type-label' : 'sr-only'}>
        {message}
      </p>
      {items.length > 0 && (
        <PortalCard title="Chờ bạn quyết định">
          <ul className="flex flex-col">
            {items.map((request) => (
              <PendingRequest
                key={request.id}
                request={request}
                onDecided={(text) => {
                  setMessage(text)
                  load()
                }}
              />
            ))}
          </ul>
        </PortalCard>
      )}
    </>
  )
}
