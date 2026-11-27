import { useCallback, useEffect, useState } from 'react'
import { getResidencyEndingRequests, getResidencyEndingRequestsById, postResidencyEndingRequestsByIdReject } from '@/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ProblemAlert } from '@/common/ProblemAlert'
import { formatDate } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { END_CASES, labelOf, newKey } from './admissionLabels'
import { ReasonField } from './FormParts'

// Yêu cầu kết thúc lưu trú người đại diện gửi trên app (demo 2026-11-26, E; api-004 tag residency-ending): Hành chính xem
// yêu cầu đang chờ, lập hồ sơ điền sẵn hoặc từ chối kèm lý do. requestId: mở từ nút Xử lý của thông báo.

const CLOSED = { HANDLED: 'đã được xử lý', REJECTED: 'đã bị từ chối', CANCELLED: 'đã được người thân hủy' }

export function EndingRequests({ requestId = null, onCreate, onRejected }) {
  const [requests, setRequests] = useState([])
  const [closed, setClosed] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)

  const load = useCallback(
    () =>
      getResidencyEndingRequests({ query: { status: ['PENDING'] } })
        .then(({ data }) => {
          const rows = data ?? []
          // Yêu cầu mở từ thông báo lên đầu bảng
          setRequests([...rows].sort((a, b) => Number(b.id === requestId) - Number(a.id === requestId)))
          if (!requestId || rows.some((r) => r.id === requestId)) return null
          return getResidencyEndingRequestsById({ path: { id: requestId } }).then((res) => setClosed(res.data))
        })
        .catch((e) => setFailure(problemOf(e))),
    [requestId],
  )

  useEffect(() => {
    load()
  }, [load])

  function startReject(request) {
    setRejecting(request)
    setReason('')
    setSubmitted(false)
    setFailure(null)
  }

  async function reject() {
    setSubmitted(true)
    if (!reason.trim()) return
    setBusy(true)
    setFailure(null)
    try {
      await postResidencyEndingRequestsByIdReject({
        path: { id: rejecting.id },
        headers: newKey(),
        body: { reason: reason.trim() },
      })
      setRejecting(null)
      onRejected?.('Đã từ chối yêu cầu kết thúc lưu trú')
      await load()
    } catch (e) {
      setFailure(problemOf(e))
      // Người thân vừa hủy hoặc người khác vừa xử lý: đọc lại danh sách
      if (e?.status === 409) await load()
    } finally {
      setBusy(false)
    }
  }

  if (requests.length === 0 && !closed && !failure) return null

  return (
    <section aria-label="Yêu cầu của người thân" className="flex flex-col gap-3">
      <h2 className="type-title">Yêu cầu của người thân</h2>
      {closed && (
        <p className="type-body-sm text-muted-foreground">
          {`Yêu cầu của ${closed.residentName} ${CLOSED[closed.status] ?? 'không còn chờ xử lý'}.`}
        </p>
      )}
      <ProblemAlert problem={failure} />
      {requests.length > 0 && (
        <Card className="py-0">
          <Table aria-label="Yêu cầu kết thúc lưu trú đang chờ">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Người cao tuổi</TableHead>
                <TableHead>Trường hợp</TableHead>
                <TableHead>Ngày mong muốn</TableHead>
                <TableHead>Lý do</TableHead>
                <TableHead className="pr-4 text-right">Xử lý</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((r) => (
                <TableRow key={r.id} className={r.id === requestId ? 'bg-accent/40' : undefined}>
                  <TableCell className="whitespace-normal pl-4">
                    {r.residentName}
                    <span className="block type-caption text-muted-foreground">{`Người gửi: ${r.familyMemberName}`}</span>
                  </TableCell>
                  <TableCell className="whitespace-normal">{labelOf(END_CASES, r.endCase)}</TableCell>
                  <TableCell className="tabular-nums">{formatDate(r.expectedEndDate)}</TableCell>
                  <TableCell className="whitespace-normal">{r.reason}</TableCell>
                  <TableCell className="pr-4">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" className="h-11" onClick={() => startReject(r)}>
                        Từ chối
                      </Button>
                      <Button className="h-11" onClick={() => onCreate(r)}>
                        Lập hồ sơ từ yêu cầu
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {rejecting && (
        <Card className="gap-3 p-4">
          <ReasonField
            id="ending-request-reject-reason"
            label={`Lý do từ chối yêu cầu của ${rejecting.residentName}`}
            value={reason}
            onChange={setReason}
            error={submitted && !reason.trim() ? 'Nhập lý do' : null}
          />
          <p className="type-caption text-muted-foreground">Người đại diện nhận thông báo kèm lý do này.</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="h-11" onClick={() => setRejecting(null)}>
              Đóng
            </Button>
            <Button className="h-11" disabled={busy} onClick={reject}>
              Xác nhận từ chối
            </Button>
          </div>
        </Card>
      )}
    </section>
  )
}
