import { useEffect, useRef, useState } from 'react'
import { getFamilyPortalRecipientConfirmationsById, postFamilyPortalRecipientConfirmationsByIdByCommand } from '@/api'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ProblemAlert } from '@/common/ProblemAlert'
import { problemOf } from '@/common/problem'

// Người đại diện quyết định yêu cầu xác nhận người nhận khác (013 T019; FR-017, FR-030; api-013
// `GET /family-portal/recipient-confirmations/{id}`, `POST …/{confirm|reject}`), mở từ thông báo
// RECIPIENT_CONFIRMATION_REQUESTED. Cùng chữ và thứ tự với màn của app người thân (DESIGN.md 13 điều 7): người nhận, giấy
// tờ, đồ trong yêu cầu, rồi Xác nhận hoặc Từ chối (bắt buộc lý do). Không có quyền (403) thì không có nút quyết định.

function belongingsText(ids = []) {
  return ids.length === 0 ? 'không còn đồ' : `${ids.length} đồ (mã ${ids.join(', ')})`
}

export function RecipientConfirmation({ id, Title = 'h2', Description = 'p' }) {
  const [state, setState] = useState({ status: 'loading' })
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const [message, setMessage] = useState('')
  // Một khóa cho mỗi lệnh: bấm lại khi mạng chập chờn không ghi hai lần
  const keys = useRef({ confirm: crypto.randomUUID(), reject: crypto.randomUUID() })

  useEffect(() => {
    let cancelled = false
    getFamilyPortalRecipientConfirmationsById({ path: { id } })
      .then(({ data }) => !cancelled && setState({ status: 'ready', request: data }))
      .catch((error) => !cancelled && setState({ status: 'error', problem: problemOf(error) }))
    return () => {
      cancelled = true
    }
  }, [id])

  async function send(command) {
    if (command === 'reject' && !reason.trim()) {
      setSubmitted(true)
      return
    }
    setFailure(null)
    setBusy(true)
    try {
      await postFamilyPortalRecipientConfirmationsByIdByCommand({
        path: { id, command },
        headers: { 'Idempotency-Key': keys.current[command] },
        body: command === 'reject' ? { reason: reason.trim() } : {},
      })
      setMessage(
        command === 'confirm'
          ? 'Đã xác nhận. Viện được trả đồ cho người này.'
          : 'Đã từ chối. Viện không trả đồ cho người này.',
      )
    } catch (error) {
      setFailure(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  const missingReason = submitted && !reason.trim()
  const request = state.request

  return (
    <div className="flex flex-col gap-4 type-body-sm">
      <div className="flex flex-col gap-1">
        <Title className="type-title">Xác nhận người nhận đồ gửi</Title>
        <Description className="type-body-sm text-muted-foreground">{`Yêu cầu mã ${id}`}</Description>
      </div>

      {state.status === 'loading' && (
        <div aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">Đang tải yêu cầu</span>
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-12" />
        </div>
      )}
      {state.status === 'error' && <ProblemAlert problem={state.problem} title="Không mở được yêu cầu" />}

      {state.status === 'ready' && (
        <>
          <dl className="flex flex-col gap-1">
            <dt className="sr-only">Người nhận</dt>
            <dd className="type-label">{`Người nhận: ${request.recipientName}`}</dd>
            <dt className="sr-only">Giấy tờ</dt>
            <dd>{`Giấy tờ: ${request.recipientIdDocument}`}</dd>
            <dt className="sr-only">Đồ trong yêu cầu</dt>
            <dd>{`Đồ trong yêu cầu: ${belongingsText(request.belongingIds)}`}</dd>
          </dl>
          <p>
            Viện cần trả đồ gửi cho một người không thuộc danh sách được phép đón. Bạn là người đại diện nên quyết định
            có đồng ý hay không.
          </p>
        </>
      )}

      <ProblemAlert problem={failure} title="Chưa gửi được quyết định" />
      <p role="status" className={message ? 'type-label' : 'sr-only'}>
        {message}
      </p>

      {state.status === 'ready' && !message && (
        <div className="flex flex-col gap-3">
          <Button className="self-start" disabled={busy} onClick={() => send('confirm')}>
            Xác nhận người nhận
          </Button>
          {!rejecting ? (
            <Button variant="outline" className="self-start" disabled={busy} onClick={() => setRejecting(true)}>
              Từ chối
            </Button>
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
                <FieldLabel htmlFor={`reject-reason-${id}`}>Lý do từ chối</FieldLabel>
                <Textarea
                  id={`reject-reason-${id}`}
                  rows={3}
                  maxLength={2000}
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  aria-invalid={missingReason || undefined}
                />
                {missingReason && <FieldError>Nhập lý do từ chối</FieldError>}
              </Field>
              <Button type="submit" variant="outline" className="self-start" disabled={busy}>
                Gửi từ chối
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
