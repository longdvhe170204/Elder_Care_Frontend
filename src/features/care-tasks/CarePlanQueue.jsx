import { useEffect, useState } from 'react'
import { getCarePlanReviewsQueue } from '@/api'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ProblemAlert } from '@/common/ProblemAlert'
import { SectionTabs } from '@/common/SectionTabs'
import { formatDateTime } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { reviewSource, waitingText } from './carePlanLabels'

// Q-448 (FR-059): hàng chờ "Cần lập hoặc sửa kế hoạch" theo phạm vi xem, chờ lâu nhất trước. Bấm một dòng thì mở kế hoạch
// của người đó trên chính màn này.
export function CarePlanQueue({ onChoose }) {
  const [rows, setRows] = useState(null)
  const [failure, setFailure] = useState(null)
  const [tab, setTab] = useState('waiting')
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
  // Q-450: bản đã gửi Bác sĩ duyệt hiện ở nhóm riêng, không tính vào hàng chờ
  const waiting = rows?.filter((row) => !row.pendingApproval) ?? null
  const pending = rows?.filter((row) => row.pendingApproval) ?? []
  const choose = (row) =>
    onChoose({ id: row.residentId, profileCode: row.profileCode, personalInfo: { fullName: row.fullName } })
  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5" aria-busy={rows === null && !failure}>
      <h2 className="sr-only">Hàng chờ kế hoạch chăm sóc</h2>
      {/* Q-450: hai nhóm là hai tab cạnh nhau (chủ dự án 2026-11-26), không xếp dọc */}
      <SectionTabs
        label="Nhóm kế hoạch"
        value={tab}
        onChange={setTab}
        tabs={[
          ['waiting', `Cần lập hoặc sửa${waiting ? ` (${waiting.length})` : ''}`],
          ['pending', `Đang chờ duyệt${rows ? ` (${pending.length})` : ''}`],
        ]}
      />
      <ProblemAlert problem={failure} />
      {rows === null && !failure && (
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
            {waiting.map((row) => (
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
      {tab === 'pending' && rows && pending.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Không có kế hoạch nào đang chờ duyệt</EmptyTitle>
            <EmptyDescription>
              Bản kế hoạch gửi Bác sĩ duyệt sẽ hiện ở đây cho tới khi được duyệt hoặc trả lại.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {tab === 'pending' && pending.length > 0 && (
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
              {pending.map((row) => (
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
    </section>
  )
}
