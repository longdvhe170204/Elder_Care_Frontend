import { useCallback, useEffect, useState } from 'react'
import { getReportsByGroup } from '@/api'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ProblemAlert } from '@/common/ProblemAlert'
import { chartKind, toneOf } from '@/common/charts/chartRules'
import { formatDateTime } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { METRIC_GROUP_LABELS, breakdownLabel, formatValue, labelNotes } from './reportLabels'

// Bảng một báo cáo (016 FR-022 → FR-073; DESIGN.md 6.17.0 `report-table`): nhóm chỉ tiêu, dòng tổng rồi dòng chia nhóm
// có thanh trong ô; bấm giá trị mở danh sách bản ghi của con số hoặc của ô đó (FR-009).

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
      const { data } = await getReportsByGroup({
        path: { group },
        query: { from, to, floorAreaId, costMode, careLevel },
      })
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
  // DESIGN.md 6.17.0 `report-table`: chỉ tiêu xếp theo nhóm (Metric.group), giữ thứ tự backend trả trong nhóm
  const sections = []
  for (const v of report.values) {
    const group = metricOf(v.metricCode).group ?? ''
    const section = sections.find((s) => s.group === group)
    if (section) section.values.push(v)
    else sections.push({ group, values: [v] })
  }
  const dayNotEnded = report.values.some((v) => v.labels?.includes('DAY_NOT_ENDED'))
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-4 md:p-5">
      <p className="type-body-sm text-muted-foreground">
        Tính đến {formatDateTime(report.asOf)}.{dayNotEnded && ' Khoảng có ngày chưa kết thúc nên số còn thay đổi.'} Bấm
        giá trị để xem danh sách bản ghi.
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
        <Table className="table-fixed">
          <colgroup>
            <col />
            <col className="w-[28%]" />
            <col className="w-28" />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>Chỉ tiêu</TableHead>
              <TableHead>
                <span className="sr-only">Thanh so sánh</span>
              </TableHead>
              <TableHead className="text-right">Giá trị</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sections.flatMap((s) => [
              ...(s.group
                ? [
                    <TableRow key={`group|${s.group}`} className="bg-muted hover:bg-muted">
                      <TableCell colSpan={3} className="type-label text-muted-foreground whitespace-normal">
                        {METRIC_GROUP_LABELS[s.group] ?? s.group}
                      </TableCell>
                    </TableRow>,
                  ]
                : []),
              ...s.values.flatMap((v) => (
                <MetricRows
                  key={v.metricCode}
                  v={v}
                  metric={metricOf(v.metricCode)}
                  floors={floors}
                  onOpen={(breakdownKey, value) =>
                    onOpen({
                      metric: metricOf(v.metricCode),
                      from,
                      to,
                      floorAreaId,
                      careLevel,
                      breakdownKey,
                      breakdownText: breakdownKey && breakdownLabel(v.metricCode, breakdownKey, floors),
                      valueText: formatValue(value),
                    })
                  }
                />
              )),
            ])}
          </TableBody>
        </Table>
      )}
    </section>
  )
}

// Ghi chú dưới tên: tử số / mẫu số và nhãn giá trị; "ngày chưa kết thúc" đã gộp lên dòng "Tính đến"
function Caption({ value }) {
  const notes = labelNotes({ ...value, labels: (value.labels ?? []).filter((l) => l !== 'DAY_NOT_ENDED') })
  const r = ratio(value)
  if (!r && !notes) return null
  return (
    <span className="flex flex-wrap gap-x-3 type-caption text-muted-foreground">
      {r && (
        <span>
          Tử số / mẫu số <span className="tabular-nums">{r}</span>
        </span>
      )}
      {notes && <span>{notes}</span>}
    </span>
  )
}

function MetricRows({ v, metric, floors, onOpen }) {
  // DESIGN.md 5.2 "Thanh trong ô bảng": phần của tổng (thanh chồng) hoặc so với giá trị lớn nhất (thanh so sánh)
  const kind = chartKind(v.value, v.breakdown)
  const max = Math.max(...v.breakdown.map((b) => (typeof b.value === 'number' ? b.value : 0)))
  const width = (b) => {
    if (kind === 'none' || typeof b.value !== 'number') return null
    const share = kind === 'stack' ? b.value / v.value : b.value / max
    return `${Math.round(share * 10000) / 100}%`
  }
  return (
    <>
      <TableRow>
        <TableCell className="whitespace-normal">
          <span className="flex flex-col gap-0.5">
            <span className="type-label">{metric.name}</span>
            <Caption value={v} />
          </span>
        </TableCell>
        <TableCell />
        <TableCell className="text-right">
          <Button variant="link" className="h-auto p-0 tabular-nums" onClick={() => onOpen(undefined, v.value)}>
            {formatValue(v.value)}
          </Button>
        </TableCell>
      </TableRow>
      {v.breakdown.map((b, i) => (
        <TableRow key={b.key}>
          <TableCell className="pl-6 whitespace-normal">
            <span className="flex flex-col gap-0.5">
              <span className="type-body-sm text-muted-foreground">{breakdownLabel(v.metricCode, b.key, floors)}</span>
              <Caption value={b} />
            </span>
          </TableCell>
          <TableCell>
            {width(b) && (
              <span aria-hidden="true" className="block h-2 overflow-hidden rounded-full bg-muted">
                <span
                  data-slot="cell-bar"
                  className="block h-full rounded-full"
                  style={{ width: width(b), background: toneOf(b.key, i) }}
                />
              </span>
            )}
          </TableCell>
          <TableCell className="text-right">
            <Button variant="link" className="h-auto p-0 tabular-nums" onClick={() => onOpen(b.key, b.value)}>
              {formatValue(b.value)}
            </Button>
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}
