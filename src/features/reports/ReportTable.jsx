import { useCallback, useEffect, useState } from 'react'
import { getReportsByGroup } from '@/api'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ProblemAlert } from '@/common/ProblemAlert'
import { BreakdownChart } from '@/common/charts/BreakdownChart'
import { chartKind } from '@/common/charts/chartRules'
import { formatDateTime } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { breakdownLabel, formatValue, labelNotes } from './reportLabels'

// Bảng một báo cáo (016 FR-022 → FR-073; DESIGN.md `report-table`): dòng tổng rồi dòng chia nhóm; bấm giá trị mở danh
// sách bản ghi của con số hoặc của ô đó (FR-009).

function ratio(v) {
  return v.denominator === null || v.denominator === undefined
    ? ''
    : `${formatValue(v.numerator)} / ${formatValue(v.denominator)}`
}

export function ReportTable({
  group,
  from,
  to,
  floorAreaId,
  costMode,
  careLevel,
  floors = [],
  metrics,
  onOpen,
  onFilterOptions,
}) {
  const [state, setState] = useState({ status: 'loading' })

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const { data } = await getReportsByGroup({ path: { group }, query: { from, to, floorAreaId, costMode, careLevel } })
      setState({ status: 'ready', report: data })
      onFilterOptions(data.filterOptions)
    } catch (error) {
      setState({ status: 'error', problem: problemOf(error) })
    }
  }, [group, from, to, floorAreaId, costMode, careLevel, onFilterOptions])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tải khi đổi báo cáo hoặc khoảng
    load()
  }, [load])

  if (state.status === 'loading') {
    return (
      <section aria-busy="true" className="flex flex-col gap-2 rounded-2xl border bg-card p-4 md:p-5">
        <span className="sr-only">Đang tải báo cáo</span>
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </section>
    )
  }
  if (state.status === 'error') {
    return (
      <section className="rounded-2xl border bg-card p-4 md:p-5">
        <ProblemAlert problem={state.problem} title="Không tải được báo cáo">
          <Button variant="outline" size="sm" onClick={() => load()}>
            Thử lại
          </Button>
        </ProblemAlert>
      </section>
    )
  }

  const { report } = state
  const metricOf = (code) => metrics[code] ?? { code, name: code }
  // Đề xuất B (2026-11-17): chỉ tiêu có breakdown vẽ được thì có biểu đồ trên bảng; bảng giữ số chính xác và lối mở chi tiết
  const charted = report.values.filter((v) => chartKind(v.value, v.breakdown) !== 'none')
  const charts = charted.length > 0 && (
    <section aria-labelledby="report-charts" className="flex flex-col gap-3 rounded-2xl border bg-card p-4 md:p-5">
      <h2 id="report-charts" className="type-card-title">
        Biểu đồ
      </h2>
      <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        {charted.map((v) => {
          const metric = metricOf(v.metricCode)
          return (
            <div key={v.metricCode} className="flex min-w-0 flex-col gap-2">
              <h3 className="type-label">{metric.name}</h3>
              <BreakdownChart
                title={metric.name}
                total={v.value}
                breakdown={v.breakdown}
                labelOf={(key) => breakdownLabel(v.metricCode, key, floors)}
              />
            </div>
          )
        })}
      </div>
    </section>
  )
  const table = (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4 md:p-5">
      <p className="type-body-sm text-muted-foreground">
        Tính đến {formatDateTime(report.asOf)}. Bấm giá trị để xem danh sách bản ghi.
      </p>
      {report.notes.map((n) => (
        <p key={n} className="type-body-sm">
          {n}
        </p>
      ))}
      {report.cancelledIncidentCount != null && (
        // FR-042, FR-007: sự cố Đã hủy chỉ là dòng tham khảo, không vào chỉ tiêu nào
        <p className="type-body-sm">
          Số sự cố đã hủy: {formatValue(report.cancelledIncidentCount)} (tham khảo, không tính vào chỉ tiêu nào)
        </p>
      )}
      {report.values.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Chưa có dữ liệu</EmptyTitle>
            <EmptyDescription>Các module nguồn chưa cung cấp số liệu cho báo cáo này.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Chỉ tiêu</TableHead>
              <TableHead>Nhóm</TableHead>
              <TableHead>Giá trị</TableHead>
              <TableHead>Tử số / mẫu số</TableHead>
              <TableHead>Ghi chú</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.values.flatMap((v) => {
              const metric = metricOf(v.metricCode)
              const open = (breakdownKey, value) =>
                onOpen({
                  metric,
                  from,
                  to,
                  floorAreaId,
                  careLevel,
                  breakdownKey,
                  breakdownText: breakdownKey && breakdownLabel(v.metricCode, breakdownKey, floors),
                  valueText: formatValue(value),
                })
              return [
                <TableRow key={v.metricCode}>
                  <TableCell className="type-label">{metric.name}</TableCell>
                  <TableCell>Tổng</TableCell>
                  <TableCell>
                    <Button variant="link" className="h-auto p-0 tabular-nums" onClick={() => open(undefined, v.value)}>
                      {formatValue(v.value)}
                    </Button>
                  </TableCell>
                  <TableCell className="tabular-nums">{ratio(v)}</TableCell>
                  <TableCell className="text-muted-foreground">{labelNotes(v)}</TableCell>
                </TableRow>,
                ...v.breakdown.map((b) => (
                  <TableRow key={`${v.metricCode}|${b.key}`}>
                    <TableCell />
                    <TableCell className="pl-6 text-muted-foreground">
                      {breakdownLabel(v.metricCode, b.key, floors)}
                    </TableCell>
                    <TableCell>
                      <Button variant="link" className="h-auto p-0 tabular-nums" onClick={() => open(b.key, b.value)}>
                        {formatValue(b.value)}
                      </Button>
                    </TableCell>
                    <TableCell className="tabular-nums">{ratio(b)}</TableCell>
                    <TableCell />
                  </TableRow>
                )),
              ]
            })}
          </TableBody>
        </Table>
      )}
    </section>
  )
  if (!charts) return table
  return (
    <>
      {charts}
      {table}
    </>
  )
}
