import { useEffect, useState } from 'react'
import { getFamilyPortalResidentsByResidentIdDailyCareSchedule } from '@/api'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/common/PageHeader'
import { ProblemAlert } from '@/common/ProblemAlert'
import { StatusBadge } from '@/common/StatusBadge'
import { formatDate } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { PortalCard } from './PortalParts'
import { TASK_STATUS, formatTime, todayInVietnam } from './careSchedule'

// "Lịch chăm sóc hằng ngày" (012 FR-076, 005 FR-055; Q-416): giờ bữa, hoạt động, mốc sinh hoạt chung chỉ hiện giờ và tên;
// công việc chăm sóc riêng hiện tên và trạng thái Hoàn thành / Chưa hoàn thành / Không thực hiện (không lý do). Giá trị đo
// chỉ có khi backend cho (người thân có quyền xem sức khỏe có tác dụng). Chỉ xem.

export function ScheduleList({ items }) {
  if (items.length === 0) return <p className="text-muted-foreground">Ngày này chưa có mục nào trong lịch.</p>
  return (
    <ol className="flex flex-col" aria-label="Các mục trong ngày">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-4 border-t py-3 first:border-t-0 first:pt-0 last:pb-0">
          <span className="w-12 shrink-0 type-label tabular-nums">{formatTime(item.at)}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className={item.kind === 'CARE_TASK' ? 'type-label' : undefined}>{item.name}</span>
            {item.measuredValue && (
              <span className="text-muted-foreground tabular-nums">Kết quả đo: {item.measuredValue}</span>
            )}
          </div>
          {item.status && <StatusBadge status={TASK_STATUS[item.status] ?? item.status} />}
        </li>
      ))}
    </ol>
  )
}

function DatePicker({ value, onChange }) {
  return (
    <Field className="max-w-60">
      <FieldLabel htmlFor="care-schedule-date">Ngày</FieldLabel>
      <Input
        id="care-schedule-date"
        type="date"
        className="h-11"
        value={value}
        onChange={(event) => event.target.value && onChange(event.target.value)}
      />
    </Field>
  )
}

const DEMO_ITEMS = [
  { at: '2026-11-22T00:00:00Z', kind: 'ROUTINE', name: 'Thức dậy' },
  { at: '2026-11-22T01:00:00Z', kind: 'CARE_TASK', name: 'Đo huyết áp', status: 'DONE', measuredValue: '125' },
  { at: '2026-11-22T01:30:00Z', kind: 'CARE_TASK', name: 'Tập phục hồi chức năng', status: 'NOT_DONE' },
  { at: '2026-11-22T02:30:00Z', kind: 'ACTIVITY', name: 'Sinh hoạt văn nghệ' },
  { at: '2026-11-22T05:00:00Z', kind: 'MEAL', name: 'Bữa trưa' },
  { at: '2026-11-22T05:00:00Z', kind: 'CARE_TASK', name: 'Hỗ trợ ăn uống', status: 'NOT_DONE' },
  { at: '2026-11-22T05:30:00Z', kind: 'ROUTINE', name: 'Ngủ trưa' },
]

function Layout({ viewer, date, onDate, children }) {
  return (
    <>
      <PageHeader
        title="Lịch chăm sóc hằng ngày"
        subtitle={`${viewer.residentName ?? 'Người cao tuổi'}, ${formatDate(date)}. Chỉ xem.`}
      />
      <DatePicker value={date} onChange={onDate} />
      {children}
    </>
  )
}

// Bản mẫu (không có phiên): một ngày minh họa
export function CareSchedulePage({ viewer }) {
  const [date, setDate] = useState(todayInVietnam)
  return (
    <Layout viewer={viewer} date={date} onDate={setDate}>
      <PortalCard>
        <ScheduleList items={viewer.perms?.health ? DEMO_ITEMS : DEMO_ITEMS.map((i) => ({ ...i, measuredValue: null }))} />
      </PortalCard>
    </Layout>
  )
}

export function LiveCareSchedulePage({ viewer }) {
  const [date, setDate] = useState(todayInVietnam)
  const key = `${viewer.residentId}|${date}`
  const [state, setState] = useState({ key: null, data: null, failure: null })
  useEffect(() => {
    let cancelled = false
    getFamilyPortalResidentsByResidentIdDailyCareSchedule({ path: { residentId: viewer.residentId }, query: { date } })
      .then(({ data }) => !cancelled && setState({ key, data, failure: null }))
      .catch((error) => !cancelled && setState({ key, data: null, failure: problemOf(error) }))
    return () => {
      cancelled = true
    }
  }, [key, viewer.residentId, date])
  // Đổi ngày: kết quả của ngày cũ không hiện trong lúc tải ngày mới
  const { data, failure } = state.key === key ? state : { data: null, failure: null }
  return (
    <Layout viewer={viewer} date={date} onDate={setDate}>
      {failure ? (
        <ProblemAlert problem={failure} />
      ) : !data ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <PortalCard>
          {data.available === false ? (
            <p className="text-muted-foreground">Lịch chăm sóc chưa có dữ liệu, tính năng nguồn chưa hoạt động.</p>
          ) : (
            <ScheduleList items={data.items} />
          )}
        </PortalCard>
      )}
    </Layout>
  )
}
