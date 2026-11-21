import { useCallback, useEffect, useState } from 'react'
import { getResidencyChangeRequests, getResidencyChangeRequestsById } from '@/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PageHeader } from '@/common/PageHeader'
import { PermissionDeniedState } from '@/common/PageState'
import { ProblemAlert } from '@/common/ProblemAlert'
import { StatusBadge } from '@/common/StatusBadge'
import { formatDate } from '@/common/dateTime'
import { usePermissions } from '@/common/permissions/permissions'
import { problemOf } from '@/common/problem'
import { CHANGE_TYPES, REQUEST_STATUS, labelOf } from './admissionLabels'
import { ChangeRequestSheet, ChangeRequestView, ConfirmationSheet } from './ChangeParts'
import { confirmationState, displayStatus } from './changeRequestRules'

// Yêu cầu thay đổi lưu trú (004 T047; US5, FR-037 → FR-047): bảng yêu cầu lọc theo trạng thái (GET
// /residency-change-requests, "Đổi api" 004 A duyệt 2026-11-07), chọn dòng để xem, sửa ở Nháp, Hành chính xác nhận với người
// đại diện rồi gửi duyệt ngay ở đây (api-000 submit); duyệt dùng màn Yêu cầu phê duyệt. Mã yêu cầu là approvalRequestId.

// Bộ lọc "Chờ ký": yêu cầu Đã duyệt mà phụ lục chưa có bản ký (FR-043d), để Hành chính làm theo danh sách (W10)
const awaitingSignature = (r) => r.status === 'APPROVED' && r.addendum?.status === 'PENDING_SIGNATURE'
const FILTERS = [
  ['DRAFT', 'Nháp', (r) => r.status === 'DRAFT'],
  ['PENDING_APPROVAL', 'Chờ duyệt', (r) => r.status === 'PENDING_APPROVAL'],
  ['PENDING_SIGNATURE', 'Chờ ký', awaitingSignature],
  ['APPROVED', 'Đã duyệt', (r) => r.status === 'APPROVED' && !awaitingSignature(r)],
  ['DONE', 'Đã xong', (r) => ['APPLIED', 'APPLY_FAILED', 'REJECTED', 'CANCELLED', 'SUPERSEDED'].includes(r.status)],
]

export function ChangeRequestsPage({ id: initialId, onNavigate = () => {} } = {}) {
  const { can } = usePermissions()
  const [filter, setFilter] = useState('DRAFT')
  const [requests, setRequests] = useState(null)
  const [shown, setShown] = useState(null)
  const [failure, setFailure] = useState(null)
  const [sheet, setSheet] = useState(null)
  const [confirming, setConfirming] = useState(null)
  const [announcement, setAnnouncement] = useState('')

  const load = useCallback(
    () =>
      getResidencyChangeRequests({ query: {} })
        .then(({ data }) => {
          setRequests(data)
          setFailure(null)
        })
        .catch((e) => {
          setRequests([])
          setFailure(problemOf(e))
        }),
    [],
  )

  useEffect(() => {
    load()
  }, [load])

  // Mở thẳng yêu cầu từ thông báo (#residency-changes?id=…, W12)
  useEffect(() => {
    if (initialId) open(initialId)
  }, [initialId])

  function open(id) {
    setFailure(null)
    return getResidencyChangeRequestsById({ path: { id } })
      .then(({ data, etag }) => setShown({ request: data, etag }))
      .catch((e) => {
        setShown(null)
        setFailure(problemOf(e))
      })
  }

  function changed(message, id) {
    setAnnouncement(message)
    load()
    if (id) open(id)
  }

  if (failure?.status === 403) return <PermissionDeniedState label="Yêu cầu điều chỉnh hợp đồng" />

  const matcherOf = (key) => FILTERS.find(([k]) => k === key)[2]
  const rows = (requests ?? []).filter(matcherOf(filter))
  const showsAddendumNo = rows.some((r) => r.addendum?.addendumNo)
  const openedId = shown?.request.approvalRequestId

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-5">
      <PageHeader
        title="Yêu cầu điều chỉnh hợp đồng"
        subtitle="Đổi loại lưu trú, mức chăm sóc, dịch vụ, thời hạn, giường hoặc lịch đến của hợp đồng đang hiệu lực."
        aside={
          can('RESIDENCY_CHANGE_REQUEST', 'CREATE') && (
            <Button className="h-11" onClick={() => setSheet({})}>
              Lập yêu cầu thay đổi
            </Button>
          )
        }
      />
      {sheet && (
        <ChangeRequestSheet
          request={sheet.request}
          etag={sheet.etag}
          onClose={() => setSheet(null)}
          onDone={(message, id) => {
            setSheet(null)
            changed(message, id)
          }}
        />
      )}
      {confirming && (
        <ConfirmationSheet
          request={confirming.request}
          etag={confirming.etag}
          onClose={() => setConfirming(null)}
          onDone={(message, id) => {
            setConfirming(null)
            changed(message, id)
          }}
        />
      )}
      <ToggleGroup
        variant="filter"
        size="lg"
        value={[filter]}
        onValueChange={(n) => n[0] && setFilter(n[0])}
        aria-label="Lọc yêu cầu theo trạng thái"
      >
        {FILTERS.map(([key, label, matches]) => (
          <ToggleGroupItem key={key} value={key} className="h-11 px-4">
            {`${label} ${(requests ?? []).filter(matches).length}`}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p role="status" className="empty:hidden type-body-sm">
        {announcement}
      </p>
      <ProblemAlert problem={failure} />
      {requests === null ? (
        <Skeleton className="h-24 w-full" />
      ) : rows.length === 0 ? (
        !failure && <p className="type-body-sm text-muted-foreground">Không có yêu cầu nào trong nhóm này.</p>
      ) : (
        <Card className="py-0">
          <Table aria-label="Yêu cầu điều chỉnh hợp đồng">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Yêu cầu</TableHead>
                <TableHead>Thay đổi</TableHead>
                <TableHead>Ngày hiệu lực mong muốn</TableHead>
                {showsAddendumNo && <TableHead>Số phụ lục</TableHead>}
                <TableHead className="pr-4">Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.approvalRequestId}
                  className={r.approvalRequestId === openedId ? 'bg-accent/40' : undefined}
                >
                  <TableCell className="whitespace-normal pl-4">
                    <button
                      type="button"
                      className="text-left underline-offset-4 hover:underline"
                      aria-pressed={r.approvalRequestId === openedId}
                      onClick={() => open(r.approvalRequestId)}
                    >
                      {`Yêu cầu mã ${r.approvalRequestId}`}
                    </button>
                    <span className="block type-caption text-muted-foreground">{`Hợp đồng mã ${r.contractId}`}</span>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {r.changeTypes.map((t) => labelOf(CHANGE_TYPES, t)).join(', ')}
                  </TableCell>
                  <TableCell className="tabular-nums">{formatDate(r.requestedEffectiveDate)}</TableCell>
                  {showsAddendumNo && (
                    <TableCell className="tabular-nums">
                      {r.addendum?.addendumNo ? String(r.addendum.addendumNo).padStart(2, '0') : '—'}
                    </TableCell>
                  )}
                  <TableCell className="pr-4">
                    <StatusBadge status={displayStatus(r, REQUEST_STATUS).text} />
                    {displayStatus(r, REQUEST_STATUS).days !== null && (
                      <span
                        className={`block type-caption ${displayStatus(r, REQUEST_STATUS).overdue ? 'text-destructive' : 'text-muted-foreground'}`}
                      >
                        {`${displayStatus(r, REQUEST_STATUS).days} ngày từ lúc duyệt`}
                      </span>
                    )}
                    {r.status === 'DRAFT' && confirmationState(r) && (
                      <span
                        className={`block type-caption ${confirmationState(r).attention ? 'text-destructive' : 'text-muted-foreground'}`}
                      >
                        {confirmationState(r).text}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {shown && (
        <ChangeRequestView
          key={`${shown.request.approvalRequestId}-${shown.etag}`}
          request={shown.request}
          etag={shown.etag}
          canUpdate={can('RESIDENCY_CHANGE_REQUEST', 'UPDATE')}
          canConfirm={can('ADMISSION_CONTRACT_DEPOSIT', 'VIEW')}
          canApprove={can('RESIDENCY_CHANGE_REQUEST', 'APPROVE')}
          canRecordOpinion={can('RESIDENCY_CHANGE_REQUEST', 'CREATE') || can('RESIDENCY_CHANGE_REQUEST', 'UPDATE')}
          onPrint={(r) => onNavigate('addendum-print', { id: r.approvalRequestId })}
          onEdit={(request) => setSheet({ request, etag: shown.etag })}
          onConfirm={(request) => setConfirming({ request, etag: shown.etag })}
          onReload={() => open(shown.request.approvalRequestId)}
          onSubmitted={changed}
        />
      )}
    </div>
  )
}
