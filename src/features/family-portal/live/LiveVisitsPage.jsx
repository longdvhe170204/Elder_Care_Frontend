import { useCallback, useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { getVisitSlots, getVisits, postVisits, postVisitsByIdByCommand } from '@/api'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PageHeader } from '@/common/PageHeader'
import { ProblemAlert } from '@/common/ProblemAlert'
import { StatusBadge } from '@/common/StatusBadge'
import { formatDate } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { VISIT_STATUS_LABELS, slotLabel, todayIso } from '@/features/relatives/visits/visitLabels'
import { PortalCard } from '../PortalParts'

// P5 Thăm với phiên thật (test BF-12 2026-11-24; 012 US4, FR-029 → FR-035, FR-050). Cùng bố cục bản mẫu (DESIGN.md 2.3):
// chọn ngày trong 7 ngày tới, khung và số chỗ còn lấy từ GET /visit-slots, người đi cùng; đạt mọi kiểm tra thì lượt Đã
// duyệt ngay, không đạt thì hiện lý do backend trả, không tạo lượt. Số người tối đa mỗi lượt (CFG-M10-06) do backend kiểm.
// Lượt của tôi từ GET /visits (người thân chỉ thấy lượt của mình); hủy lượt Đã duyệt trước giờ bắt đầu.

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

function nextDays(count) {
  const [y, m, d] = todayIso().split('-').map(Number)
  return Array.from({ length: count }, (_, i) => {
    const day = new Date(Date.UTC(y, m - 1, d + i))
    return { iso: day.toISOString().slice(0, 10), weekday: WEEKDAYS[day.getUTCDay()] }
  })
}

const when = (v) => `${formatDate(v.date)}, ${slotLabel(v)}`

function RegisterForm({ viewer, onRegistered }) {
  const [days] = useState(() => nextDays(7))
  const [day, setDay] = useState('')
  const [slots, setSlots] = useState(null)
  const [slot, setSlot] = useState('')
  const [companions, setCompanions] = useState([])
  const [submitted, setSubmitted] = useState(false)
  const [failure, setFailure] = useState(null)
  const [busy, setBusy] = useState(false)
  const [key, setKey] = useState(() => crypto.randomUUID())
  const companionMissing = companions.some((c) => !c.name.trim() || !c.relation.trim())

  function chooseDay(next) {
    setDay(next)
    setSlot('')
    setSlots(null)
    setFailure(null)
    if (!next) return
    getVisitSlots({ query: { date: next } })
      .then(({ data }) => setSlots(data ?? []))
      .catch((e) => {
        setSlots([])
        setFailure(problemOf(e))
      })
  }

  function updateCompanion(i, field, value) {
    setCompanions(companions.map((c, j) => (j === i ? { ...c, [field]: value } : c)))
  }

  async function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    setFailure(null)
    if (!day || !slot || companionMissing) return
    const chosen = slots.find((s) => slotLabel(s) === slot)
    setBusy(true)
    try {
      await postVisits({
        headers: { 'Idempotency-Key': key },
        body: {
          residentId: viewer.residentId,
          date: day,
          startTime: chosen.startTime,
          endTime: chosen.endTime,
          companions: companions.map((c) => ({ fullName: c.name.trim(), relationship: c.relation.trim() })),
        },
      })
      onRegistered(`Đã đăng ký: lượt ${formatDate(day)}, ${slot} được duyệt ngay.`)
      setDay('')
      setSlot('')
      setSlots(null)
      setCompanions([])
      setSubmitted(false)
      setKey(crypto.randomUUID())
    } catch (error) {
      setFailure(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PortalCard title={`Đăng ký thăm ${viewer.residentName}`}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field data-invalid={(submitted && !day) || undefined}>
          <FieldLabel>Ngày</FieldLabel>
          <ToggleGroup
            variant="outline"
            aria-label="Ngày"
            value={day ? [day] : []}
            onValueChange={(n) => chooseDay(n[0] ?? '')}
            className="flex flex-wrap"
          >
            {days.map((d) => (
              <ToggleGroupItem key={d.iso} value={d.iso} className="h-14 min-w-14 flex-col gap-0 px-2">
                <span className="type-caption">{d.weekday}</span>
                <span className="type-label tabular-nums">{formatDate(d.iso).slice(0, 5)}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {submitted && !day && <FieldError>Chọn ngày thăm</FieldError>}
        </Field>

        {day && (
          <Field data-invalid={(submitted && !slot) || undefined}>
            <FieldLabel>Khung giờ</FieldLabel>
            {slots === null ? (
              <Skeleton className="h-14 w-full" />
            ) : (
              <ToggleGroup
                variant="outline"
                aria-label="Khung giờ"
                value={slot ? [slot] : []}
                onValueChange={(n) => setSlot(n[0] ?? '')}
                className="grid w-full grid-cols-1 sm:grid-cols-2"
              >
                {slots.map((s) => (
                  <ToggleGroupItem
                    key={slotLabel(s)}
                    value={slotLabel(s)}
                    aria-label={`${slotLabel(s)}, còn ${s.seatsLeft} chỗ`}
                    className="h-14 justify-between px-4"
                  >
                    <span className="type-label tabular-nums">{slotLabel(s)}</span>
                    <span className="type-caption text-muted-foreground">còn {s.seatsLeft} chỗ</span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
            {submitted && !slot && <FieldError>Chọn khung giờ</FieldError>}
          </Field>
        )}

        <Field data-invalid={(submitted && companionMissing) || undefined}>
          <FieldLabel>Người đi cùng</FieldLabel>
          <FieldDescription>
            Viện giới hạn số người mỗi lượt, kể cả bạn; vượt thì đăng ký không được nhận.
          </FieldDescription>
          {companions.map((c, i) => (
            <div key={i} className="flex items-start gap-2">
              <Input
                aria-label={`Họ tên người đi cùng ${i + 1}`}
                placeholder="Họ tên"
                value={c.name}
                onChange={(e) => updateCompanion(i, 'name', e.target.value)}
                className="h-11"
              />
              <Input
                aria-label={`Quan hệ của người đi cùng ${i + 1}`}
                placeholder="Quan hệ"
                value={c.relation}
                onChange={(e) => updateCompanion(i, 'relation', e.target.value)}
                className="h-11 w-32 shrink-0"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-label={`Bỏ người đi cùng ${i + 1}`}
                onClick={() => setCompanions(companions.filter((_, j) => j !== i))}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          ))}
          {submitted && companionMissing && <FieldError>Nhập họ tên và quan hệ của người đi cùng</FieldError>}
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => setCompanions([...companions, { name: '', relation: '' }])}
          >
            <Plus aria-hidden="true" />
            Thêm người đi cùng
          </Button>
        </Field>

        <ProblemAlert problem={failure} title="Không đăng ký được" />
        <Button type="submit" className="h-11" disabled={busy}>
          Đăng ký thăm
        </Button>
      </form>
    </PortalCard>
  )
}

export function LiveVisitsPage({ viewer }) {
  const [visits, setVisits] = useState(null)
  const [failure, setFailure] = useState(null)
  const [notice, setNotice] = useState('')

  const load = useCallback(() => {
    getVisits({ query: { residentId: viewer.residentId } })
      .then(({ data }) => {
        setFailure(null)
        setVisits([...(data ?? [])].sort((a, b) => `${b.date}${b.startTime}`.localeCompare(`${a.date}${a.startTime}`)))
      })
      .catch((e) => {
        setVisits([])
        setFailure(problemOf(e))
      })
  }, [viewer.residentId])

  useEffect(() => {
    load()
  }, [load])

  async function cancel(visit) {
    setFailure(null)
    try {
      await postVisitsByIdByCommand({
        path: { id: visit.id, command: 'cancel' },
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: {},
      })
      setNotice('Đã hủy lượt thăm, chỗ được trả lại cho khung giờ.')
      load()
    } catch (error) {
      setFailure(problemOf(error))
    }
  }

  return (
    <>
      <PageHeader title="Thăm" subtitle="Chọn ngày để xem khung thăm và số chỗ còn." />
      {viewer.perms.visits ? (
        <RegisterForm
          viewer={viewer}
          onRegistered={(message) => {
            setNotice(message)
            load()
          }}
        />
      ) : (
        <PortalCard>
          <p>
            Bạn chưa có quyền đăng ký thăm. Liên hệ người đại diện của gia đình hoặc Hành chính của viện để được cấp
            quyền.
          </p>
        </PortalCard>
      )}
      <p role="status" className="empty:hidden rounded-xl border bg-card px-4 py-3 type-body-sm">
        {notice}
      </p>
      <PortalCard title="Lượt thăm của bạn">
        <ProblemAlert problem={failure} />
        {visits === null ? (
          <Skeleton className="h-16 w-full" />
        ) : visits.length === 0 ? (
          <p className="text-muted-foreground">Bạn chưa có lượt thăm nào.</p>
        ) : (
          <ul aria-label="Lượt thăm của bạn" className="flex flex-col">
            {visits.map((v) => (
              <li
                key={v.id}
                className="flex flex-wrap items-center justify-between gap-2 border-t py-2.5 first:border-t-0 first:pt-0"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="type-label tabular-nums">{when(v)}</span>
                  <span className="type-caption text-muted-foreground">
                    {v.visitorCount} người{v.cancellationReason && `, ${v.cancellationReason}`}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge status={VISIT_STATUS_LABELS[v.status] ?? v.status} />
                  {v.status === 'APPROVED' && (
                    <Button variant="outline" size="sm" aria-label={`Hủy lượt ${when(v)}`} onClick={() => cancel(v)}>
                      Hủy lượt
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PortalCard>
    </>
  )
}
