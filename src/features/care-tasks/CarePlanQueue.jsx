import { useEffect, useState } from 'react'
import { getCarePlanReviewsApproved, getCarePlanReviewsQueue } from '@/api'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ProblemAlert } from '@/common/ProblemAlert'
import { SectionTabs } from '@/common/SectionTabs'
import { formatDate, formatDateTime } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { reviewSource, waitingText } from './carePlanLabels'

const PAGE_SIZE = 10

export function CarePlanQueue({ onChoose }) {
  const [rows, setRows] = useState(null)
  const [failure, setFailure] = useState(null)
  const [approved, setApproved] = useState(null)
  const [approvedFailure, setApprovedFailure] = useState(null)
  const [tab, setTab] = useState('waiting')
  const [page, setPage] = useState(1)
  useEffect(() => {
    let cancelled = false
    getCarePlanReviewsQueue()
      .then(({ data }) => {
        if (!cancelled) setRows(data)
      })
      .catch((error) => {
        if (!cancelled) setFailure(problemOf(error))
      })
    getCarePlanReviewsApproved()
      .then(({ data }) => {
        if (!cancelled) setApproved(data)
      })
      .catch((error) => {
        if (!cancelled) setApprovedFailure(problemOf(error))
      })
    return () => {
      cancelled = true
    }
  }, [])
  const now = new Date()
  // Q-450: bản đã gửi Bác sĩ duyệt hiện ở nhóm riêng, không tính vào hàng chờ
  const waiting = rows?.filter((row) => !row.pendingApproval)
  const pending = rows?.filter((row) => row.pendingApproval)
  const activeRows = { waiting, pending, approved }[tab]
  const activeFailure = tab === 'approved' ? approvedFailure : failure
  const loading = activeRows == null && !activeFailure
  const pages = Math.max(1, Math.ceil((activeRows?.length ?? 0) / PAGE_SIZE))
  const current = Math.min(page, pages)
  const pageRows = activeRows?.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE) ?? []
  const choose = (row) =>
    onChoose({ id: row.residentId, profileCode: row.profileCode, personalInfo: { fullName: row.fullName } })
  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5" aria-busy={loading}>
      <h2 className="sr-only">Hàng chờ kế hoạch chăm sóc</h2>
      <SectionTabs
        label="Nhóm kế hoạch"
        value={tab}
        onChange={(next) => {
          setTab(next)
          setPage(1)
        }}
        tabs={[
          ['waiting', `Cần lập hoặc sửa${waiting ? ` (${waiting.length})` : ''}`],
          ['pending', `Đang chờ duyệt${rows ? ` (${pending.length})` : ''}`],
          ['approved', approved ? `Đã duyệt (${approved.length})` : 'Đã duyệt'],
        ]}
      />
      <ProblemAlert problem={activeFailure} />
      {loading && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}
      {tab === 'waiting' && waiting?.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Không có ai cần lập hoặc sửa kế hoạch</EmptyTitle>
            <EmptyDescription>
              Người mới có đánh giá cần chăm sóc, vừa bị ngã hay được Bác sĩ đánh giá lại sẽ hiện ở đây. Muốn xem kế
              hoạch của một người khác, tìm theo tên ở ô phía trên.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {tab === 'waiting' && waiting?.length > 0 && (
        <Table aria-label="Người cần lập hoặc sửa kế hoạch">
          <TableHeader>
            <TableRow className="bg-muted hover:bg-muted">
              <TableHead>Người cao tuổi</TableHead>
              <TableHead>Lý do</TableHead>
              <TableHead>Đã chờ</TableHead>
              <TableHead>
                <span className="sr-only">Thao tác</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((row) => (
              <TableRow key={row.residentId} className="align-top">
                <TableCell className="whitespace-normal">
                  <span className="block font-semibold">{row.fullName}</span>
                  <span className="block type-body-sm text-muted-foreground">{row.profileCode}</span>
                </TableCell>
                <TableCell className="whitespace-normal">
                  <ul className="flex flex-col gap-1">
                    {row.reasons.map((reason) => (
                      <li key={`${reason.source}:${reason.reference}`}>
                        <span className="block">{reviewSource(reason.source)}</span>
                        <span className="block type-body-sm text-muted-foreground">
                          {formatDateTime(reason.raisedAt)}
                        </span>
                      </li>
                    ))}
                    {row.draftId != null && <li>{row.draftReturned ? 'Bác sĩ trả lại' : 'Kế hoạch đang soạn dở'}</li>}
                  </ul>
                </TableCell>
                <TableCell className="whitespace-nowrap">{waitingText(row.waitingSince, now)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" aria-label={`Mở kế hoạch của ${row.fullName}`} onClick={() => choose(row)}>
                    Mở kế hoạch
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {tab === 'pending' && pending?.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Không có kế hoạch nào đang chờ duyệt</EmptyTitle>
            <EmptyDescription>
              Bản kế hoạch gửi Bác sĩ duyệt sẽ hiện ở đây cho tới khi được duyệt hoặc trả lại.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {tab === 'pending' && pending?.length > 0 && (
        <>
          <Table aria-label="Kế hoạch đang chờ Bác sĩ duyệt">
            <TableHeader>
              <TableRow className="bg-muted hover:bg-muted">
                <TableHead>Người cao tuổi</TableHead>
                <TableHead>Người gửi</TableHead>
                <TableHead>Gửi lúc</TableHead>
                <TableHead>
                  <span className="sr-only">Thao tác</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((row) => (
                <TableRow key={row.residentId} className="align-top">
                  <TableCell className="whitespace-normal">
                    <span className="block font-semibold">{row.fullName}</span>
                    <span className="block type-body-sm text-muted-foreground">{row.profileCode}</span>
                  </TableCell>
                  <TableCell className="whitespace-normal">{row.createdBy ?? '—'}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className="block">{formatDateTime(row.waitingSince)}</span>
                    <span className="block type-body-sm text-muted-foreground">
                      {waitingText(row.waitingSince, now)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      aria-label={`Xem bản sửa của ${row.fullName}`}
                      onClick={() => choose(row)}
                    >
                      Xem bản sửa
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
      {tab === 'approved' && approved?.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Chưa có kế hoạch nào được duyệt trong 7 ngày qua</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
      {tab === 'approved' && pageRows.length > 0 && <ApprovedPlansTable rows={pageRows} onChoose={choose} />}
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>
            Trang trước
          </Button>
          <span className="type-body-sm tabular-nums">
            Trang {current}/{pages}
          </span>
          <Button variant="outline" size="sm" disabled={current >= pages} onClick={() => setPage(current + 1)}>
            Trang sau
          </Button>
        </div>
      )}
    </section>
  )
}

const APPROVAL_EFFECT_LABELS = {
  EFFECTIVE: 'Đang áp dụng',
  PENDING_EFFECT: 'Từ ngày mai',
}

function ApprovedPlansTable({ rows, onChoose }) {
  return (
    <Table aria-label="Kế hoạch đã duyệt">
      <TableHeader>
        <TableRow className="bg-muted hover:bg-muted">
          <TableHead>Người cao tuổi</TableHead>
          <TableHead>Người duyệt</TableHead>
          <TableHead>Duyệt lúc</TableHead>
          <TableHead>Áp dụng từ</TableHead>
          <TableHead>
            <span className="sr-only">Thao tác</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.planId} className="align-top">
            <TableCell className="whitespace-normal">
              <span className="block font-semibold">{row.fullName}</span>
              <span className="block type-body-sm text-muted-foreground">{row.profileCode}</span>
            </TableCell>
            <TableCell className="whitespace-normal">
              <span className="block">{row.approvedBy ?? '—'}</span>
              {row.selfApproved && <span className="block type-body-sm text-muted-foreground">Tự duyệt</span>}
            </TableCell>
            <TableCell className="whitespace-nowrap">{formatDateTime(row.approvedAt)}</TableCell>
            <TableCell className="whitespace-nowrap">
              <span className="block">{formatDate(row.effectiveFrom) || '—'}</span>
              {APPROVAL_EFFECT_LABELS[row.status] && (
                <span className="block type-body-sm text-muted-foreground">{APPROVAL_EFFECT_LABELS[row.status]}</span>
              )}
            </TableCell>
            <TableCell className="text-right">
              <Button variant="outline" aria-label={`Xem kế hoạch của ${row.fullName}`} onClick={() => onChoose(row)}>
                Xem kế hoạch
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
