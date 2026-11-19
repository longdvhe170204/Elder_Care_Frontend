import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight, Pause, Play, RefreshCw } from 'lucide-react'
import { ApiError, getAlerts, getDashboard, getFloors, getMetrics } from '@/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/common/PageHeader'
import { BreakdownChart } from '@/common/charts/BreakdownChart'
import { chartKind } from '@/common/charts/chartRules'
import { ProblemAlert } from '@/common/ProblemAlert'
import { problemOf } from '@/common/problem'
import { MetricDetailSheet } from '@/features/reports/MetricDetailSheet'
import { METRIC_GROUP_LABELS, breakdownLabel, formatValue, labelNotes } from '@/features/reports/reportLabels'

// Tổng quan là dashboard của 016 (T010; FR-020, FR-021). Bố cục phương án B "Cột chú ý" (DESIGN.md 6.17.0, chủ dự án
// chọn 2026-11-19): hàng trên "Cần chú ý" (`dashboard-attention`) và "Tình hình"; dưới là các nhóm chỉ tiêu backend trả
// cho vai trò, mỗi nhóm mở tại chỗ. Làm mới mỗi 30 giây với ETag (research O-06); lần tự làm mới là yêu cầu nền
// (X-Background-Refresh, 002 T047a) và tạm dừng được (DESIGN.md 9.3, tiêu chí 2.2.2). Bấm một số mở danh sách bản ghi.

export const REFRESH_MS = 30_000

const FACILITY_WIDE = ['NURSING_HOME_MANAGER', 'DOCTOR', 'OFFICE_STAFF', 'ACCOUNTANT']

// DESIGN.md 7.2 bảng chỉ tiêu của `dashboard-attention`, theo thứ tự hiện
const URGENT = ['TASK.OVERDUE', 'ASSET.OVERDUE']
const ATTENTION = [
  'HEALTH.CRITICAL_FLAGS',
  'HEALTH.ALERTS',
  'HEALTH.INCIDENTS',
  'ACT.MISSING_PARTICIPANTS',
  'ACT.OVERDUE_TRIPS',
  'HEALTH.CONTAINMENT_ZONES',
  'SHIFT.UNCONFIRMED_HANDOVERS',
  'MED.OVERDUE_RECONCILIATIONS',
  'HEALTH.OVERDUE_REASSESSMENTS',
  'REGISTRATION.TO_DO',
  'BALANCE.LOW_OR_OWING',
  'LICENSE.FACILITY',
  'LICENSE.STAFF',
]
// Số chính của cột "Tình hình" (DESIGN.md 5.1)
const SITUATION = ['RES.AT_DATE', 'BED.STATUS', 'TASK.TODAY']

const GROUPS_KEY = 'elder-care-dashboard-groups'

const TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function readOpenGroups() {
  try {
    return JSON.parse(localStorage.getItem(GROUPS_KEY)) ?? []
  } catch {
    return []
  }
}

function writeOpenGroups(groups) {
  try {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(groups))
  } catch {
    // không lưu được thì chỉ mất ghi nhớ nhóm đã mở
  }
}

function Breakdown({ value, metric, floors }) {
  const breakdown = value.breakdown ?? []
  if (breakdown.length === 0) return null
  const labelOf = (key) => breakdownLabel(value.metricCode, key, floors)
  // biểu đồ nằm ngoài nút vì danh sách, bảng không được đặt trong <button> (DESIGN.md 5.2)
  if (chartKind(value.value, breakdown) !== 'none') {
    return (
      <div className="px-2">
        <BreakdownChart title={metric.name} total={value.value} breakdown={breakdown} labelOf={labelOf} />
      </div>
    )
  }
  return (
    <p className="px-2 type-body-sm">{breakdown.map((b) => `${labelOf(b.key)} ${formatValue(b.value)}`).join(', ')}</p>
  )
}

function notesOf(value) {
  // "không có dữ liệu" đã ghi riêng dưới số
  return labelNotes({ ...value, labels: (value.labels ?? []).filter((l) => l !== 'NO_DATA') })
}

// Số chính: số `type-metric` kèm nhãn, biểu đồ ngay dưới
function MainMetric({ value, metric, floors, onOpen }) {
  const notes = notesOf(value)
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => onOpen({ metric, valueText: formatValue(value.value) })}
        className="flex flex-col items-start gap-1 rounded-xl p-2 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="type-metric tabular-nums">{formatValue(value.value)}</span>
        <span className="type-caption text-muted-foreground text-balance">{metric.name}</span>
        {value.value === null && <span className="type-caption text-muted-foreground">không có dữ liệu</span>}
        {notes && <span className="type-caption text-muted-foreground">{notes}</span>}
      </button>
      <Breakdown value={value} metric={metric} floors={floors} />
    </div>
  )
}

// Dòng gọn "nhãn … số" trong nhóm chỉ tiêu (DESIGN.md 5.1)
function MetricRow({ value, metric, floors, onOpen }) {
  const overdue = value.metricCode.endsWith('.OVERDUE') && value.value > 0
  const notes = notesOf(value)
  return (
    <div className="flex flex-col gap-1 border-t py-1 first:border-t-0">
      <button
        type="button"
        onClick={() => onOpen({ metric, valueText: formatValue(value.value) })}
        className="flex items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="flex min-w-0 flex-col">
          <span className="type-body-sm text-balance">{metric.name}</span>
          {value.value === null && <span className="type-caption text-muted-foreground">không có dữ liệu</span>}
          {notes && <span className="type-caption text-muted-foreground">{notes}</span>}
        </span>
        <span className={`type-label shrink-0 tabular-nums ${overdue ? 'text-destructive' : ''}`}>
          {formatValue(value.value)}
        </span>
      </button>
      <Breakdown value={value} metric={metric} floors={floors} />
    </div>
  )
}

function AttentionCard({ rows, onOpen, onNavigate }) {
  return (
    <Card role="region" aria-labelledby="dashboard-attention">
      <CardHeader>
        <CardTitle id="dashboard-attention" className="type-card-title">
          {rows.length > 0 ? `Cần chú ý (${rows.length})` : 'Cần chú ý'}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col">
        {rows.length === 0 ? (
          <p className="type-body text-success-foreground">Không có việc tồn trong phạm vi của bạn.</p>
        ) : (
          rows.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() =>
                r.page ? onNavigate?.(r.page, undefined) : onOpen({ metric: r.metric, valueText: r.text })
              }
              className="flex items-baseline gap-3 border-t px-2 py-2.5 text-left first:border-t-0 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span
                className={`type-card-title min-w-8 tabular-nums ${r.urgent ? 'text-destructive' : 'text-warning-foreground'}`}
              >
                {r.text}
              </span>
              <span className="type-body">{r.label}</span>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function GroupPanel({ block, metricOf, floors, open, onOpenChange, onOpen }) {
  const label = METRIC_GROUP_LABELS[block.group] ?? block.group
  const id = `dashboard-group-${block.group}`
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="self-start rounded-2xl border bg-card">
      <CollapsibleTrigger className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <span id={id} className="type-card-title flex-1">
          {label}
        </span>
        <span className="type-caption text-muted-foreground">{block.values.length} chỉ tiêu</span>
        <ChevronRight aria-hidden="true" className={`size-4 transition-transform ${open ? 'rotate-90' : ''}`} />
      </CollapsibleTrigger>
      <CollapsibleContent role="region" aria-labelledby={id} className="flex flex-col gap-1 px-2 pb-3">
        {block.values.length === 0 ? (
          <p className="px-2 type-body-sm text-muted-foreground">
            Chưa có dữ liệu: module nguồn chưa cung cấp số liệu cho nhóm này.
          </p>
        ) : (
          block.values.map((v) => (
            <MetricRow key={v.metricCode} value={v} metric={metricOf(v.metricCode)} floors={floors} onOpen={onOpen} />
          ))
        )}
        {block.status === 'UPDATING' && <p className="px-2 type-caption text-muted-foreground">Đang cập nhật</p>}
      </CollapsibleContent>
    </Collapsible>
  )
}

export function DashboardPage({ role, onNavigate }) {
  const [state, setState] = useState({ status: 'loading' })
  const [metrics, setMetrics] = useState({})
  const [floors, setFloors] = useState([])
  const [escalated, setEscalated] = useState(null)
  const [opened, setOpened] = useState(null)
  const [paused, setPaused] = useState(false)
  const [openGroups, setOpenGroups] = useState(readOpenGroups)
  const etag = useRef(null)

  const load = useCallback(async (background = false) => {
    // 007 FR-034: cảnh báo đã leo thang tối đa chưa tiếp nhận; vai trò không xem được cảnh báo thì không có dòng này
    getAlerts({
      query: { maxEscalationReached: true, status: ['NEW', 'ESCALATED'] },
      ...(background && { headers: { 'X-Background-Refresh': 'true' } }),
    })
      .then(({ data }) => setEscalated(data.length))
      .catch(() => setEscalated(null))
    try {
      const { data, etag: next } = await getDashboard({
        headers: {
          ...(etag.current && { 'If-None-Match': etag.current }),
          ...(background && { 'X-Background-Refresh': 'true' }),
        },
      })
      etag.current = next
      setState({ status: 'ready', dashboard: data })
    } catch (error) {
      // 304: số liệu không đổi, giữ khối đang hiện
      if (error instanceof ApiError && error.status === 304) return
      setState((s) => (s.status === 'ready' ? s : { status: 'error', problem: problemOf(error) }))
    }
  }, [])

  useEffect(() => {
    // tải khi mở màn
    load()
    getMetrics()
      .then(({ data }) => setMetrics(Object.fromEntries(data.map((m) => [m.code, m]))))
      .catch(() => {})
    // tên tầng cho ô chia theo tầng (003); không xem được danh mục thì giữ "Tầng/khu <mã>"
    getFloors()
      .then(({ data }) => setFloors(data))
      .catch(() => {})
  }, [load])

  useEffect(() => {
    // làm mới định kỳ (FR-021) trừ khi người dùng tạm dừng
    if (paused) return
    const timer = setInterval(() => load(true), REFRESH_MS)
    return () => clearInterval(timer)
  }, [load, paused])

  function togglePaused() {
    if (paused) load()
    setPaused(!paused)
  }

  function toggleGroup(group, open) {
    const next = open ? [...openGroups, group] : openGroups.filter((g) => g !== group)
    setOpenGroups(next)
    writeOpenGroups(next)
  }

  const facilityWide = FACILITY_WIDE.includes(role)
  const dashboard = state.dashboard
  const metricOf = (code) => metrics[code] ?? { code, name: code }
  const values = Object.fromEntries((dashboard?.blocks ?? []).flatMap((b) => b.values).map((v) => [v.metricCode, v]))
  const positive = (code) => typeof values[code]?.value === 'number' && values[code].value > 0
  const attentionRows = [
    ...(escalated > 0
      ? [
          {
            key: 'ESCALATED_ALERTS',
            text: formatValue(escalated),
            label: 'Cảnh báo đã leo thang tối đa, chưa tiếp nhận',
            urgent: true,
            page: 'alerts',
          },
        ]
      : []),
    ...[...URGENT, ...ATTENTION].filter(positive).map((code) => ({
      key: code,
      text: formatValue(values[code].value),
      label: metricOf(code).name,
      metric: metricOf(code),
      urgent: URGENT.includes(code),
    })),
  ]
  const situation = SITUATION.filter((code) => values[code])

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
      <PageHeader
        title={facilityWide ? 'Tổng quan toàn viện hôm nay' : 'Tổng quan trong phạm vi của bạn hôm nay'}
        subtitle={
          dashboard
            ? `Cập nhật lúc ${TIME.format(new Date(dashboard.asOf))}, ${paused ? 'đã tạm dừng tự làm mới.' : 'tự làm mới mỗi 30 giây.'}`
            : paused
              ? 'Đã tạm dừng tự làm mới.'
              : 'Tự làm mới mỗi 30 giây.'
        }
        aside={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-11" onClick={togglePaused}>
              {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
              {paused ? 'Tiếp tục tự làm mới' : 'Tạm dừng tự làm mới'}
            </Button>
            <Button variant="outline" className="h-11" onClick={() => load()}>
              <RefreshCw aria-hidden="true" />
              Làm mới
            </Button>
          </div>
        }
      />
      {state.status === 'loading' && (
        <div aria-busy="true" className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <span className="sr-only">Đang tải tổng quan</span>
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      )}
      {state.status === 'error' && (
        <section className="rounded-2xl border bg-card p-4 md:p-5">
          <ProblemAlert problem={state.problem} title="Không tải được tổng quan">
            <Button variant="outline" size="sm" onClick={() => load()}>
              Thử lại
            </Button>
          </ProblemAlert>
        </section>
      )}
      {state.status === 'ready' && dashboard.blocks.length === 0 && (
        <section className="rounded-2xl border bg-card p-4 md:p-5">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{dashboard.message ?? 'Hiện không có phạm vi phân công'}</EmptyTitle>
              <EmptyDescription>Số liệu hiện khi bạn có ca, tầng hoặc người cao tuổi được phân công.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </section>
      )}
      {state.status === 'ready' && dashboard.blocks.length > 0 && (
        <>
          <div
            className={`grid items-start gap-5 ${situation.length > 0 ? 'lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]' : ''}`}
          >
            <AttentionCard rows={attentionRows} onOpen={setOpened} onNavigate={onNavigate} />
            {situation.length > 0 && (
              <Card role="region" aria-labelledby="dashboard-situation">
                <CardHeader>
                  <CardTitle id="dashboard-situation" className="type-card-title">
                    Tình hình
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
                  {situation.map((code) => (
                    <MainMetric
                      key={code}
                      value={values[code]}
                      metric={metricOf(code)}
                      floors={floors}
                      onOpen={setOpened}
                    />
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
          <section aria-labelledby="dashboard-groups" className="flex flex-col gap-3">
            <h2 id="dashboard-groups" className="type-title">
              Các nhóm chỉ tiêu
            </h2>
            <div className="grid items-start gap-3 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
              {dashboard.blocks.map((b) => (
                <GroupPanel
                  key={b.group}
                  block={b}
                  metricOf={metricOf}
                  floors={floors}
                  open={openGroups.includes(b.group)}
                  onOpenChange={(open) => toggleGroup(b.group, open)}
                  onOpen={setOpened}
                />
              ))}
            </div>
          </section>
        </>
      )}
      <MetricDetailSheet opened={opened} onClose={() => setOpened(null)} onNavigate={onNavigate} />
    </div>
  )
}
