import { useEffect, useState } from 'react'
import { getCarePlanReviewsQueue } from '@/api'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ProblemAlert } from '@/common/ProblemAlert'
import { formatDateTime } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { reviewSource, waitingText } from './carePlanLabels'

// Q-448 (FR-059): hàng chờ "Cần lập hoặc sửa kế hoạch" theo phạm vi xem, chờ lâu nhất trước. Bấm một dòng thì mở kế hoạch
// của người đó trên chính màn này.
export function CarePlanQueue({ onChoose }) {
  const [rows, setRows] = useState(null)
  const [failure, setFailure] = useState(null)
  useEffect(() => {
    let cancelled = false
    getCarePlanReviewsQueue()
      .then(({ data }) => {
        if (!cancelled) setRows(data)
      })
      .catch((error) => {
        if (!cancelled) setFailure(problemOf(error))
      })
    return () => {
      cancelled = true
    }
  }, [])
  const now = new Date()
  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5" aria-busy={rows === null && !failure}>
      <h2 className="type-title">Cần lập hoặc sửa kế hoạch{rows ? ` (${rows.length})` : ''}</h2>
      <ProblemAlert problem={failure} />
      {rows === null && !failure && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}
      {rows?.length === 0 && (
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
      {rows?.length > 0 && (
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
            {rows.map((row) => (
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
                  <Button
                    variant="outline"
                    aria-label={`Mở kế hoạch của ${row.fullName}`}
                    onClick={() =>
                      onChoose({
                        id: row.residentId,
                        profileCode: row.profileCode,
                        personalInfo: { fullName: row.fullName },
                      })
                    }
                  >
                    Mở kế hoạch
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}
