import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { AllergyNote } from '@/common/CareNotes'
import { ProblemAlert } from '@/common/ProblemAlert'
import { ResidentAvatar } from '@/common/ResidentAvatar'
import { problemOf } from '@/common/problem'
import { hhmm } from './doseRoundView'
import { DoseTags } from './DoseTags'
import { loadPrnOrders, recordEffectiveness, recordPrn } from './prnApi'
import { ResidentPicker } from './ResidentPicker'

// Thuốc khi cần (spec 006 User Story 6; FR-024, FR-025): không có lịch, ghi từng lần kèm lý do. Đơn, lịch sử và thời
// điểm sớm nhất được dùng đọc từ api-006; chặn khi chưa đủ khoảng cách tối thiểu hoặc đã đủ số lần trong 24 giờ trượt
// do backend tính, không có thao tác vượt chặn.

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

function PrnForm({ order, now, onSave }) {
  const [time, setTime] = useState(now)
  const [reason, setReason] = useState('')
  const [reaction, setReaction] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [problem, setProblem] = useState(null)
  const [earliest, setEarliest] = useState(null)
  const [saving, setSaving] = useState(false)
  // Một khóa cho mỗi lần mở khung: gửi lại sau lỗi mạng không ghi hai lần
  const [key] = useState(() => crypto.randomUUID())
  const timeInvalid = !HHMM.test(time) || time > now
  const r = order.resident

  async function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    if (timeInvalid || !reason.trim()) return
    setSaving(true)
    setProblem(null)
    setEarliest(null)
    try {
      await onSave(order, { time, reason, reaction, key })
    } catch (error) {
      setProblem(problemOf(error))
      setEarliest(error?.problem?.earliestAllowedAt ? hhmm(error.problem.earliestAllowedAt) : null)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetHeader className="gap-3 pt-6">
        <div className="flex items-center gap-3">
          <ResidentAvatar name={r.name} code={r.code} initials={r.initials} className="size-16 type-title" />
          <div className="flex flex-col gap-0.5">
            <SheetTitle className="type-title">{r.name}</SheetTitle>
            <SheetDescription>
              {order.drug}, {order.dose}, {order.route}
            </SheetDescription>
          </div>
        </div>
        <AllergyNote allergies={r.allergies} />
      </SheetHeader>
      <div className="flex flex-col gap-4 px-4">
        <ProblemAlert problem={problem}>
          {earliest && (
            <p>
              Sớm nhất được dùng lúc <span className="tabular-nums">{earliest}</span>. Cần thì báo bác sĩ.
            </p>
          )}
        </ProblemAlert>
        <Field data-invalid={(submitted && timeInvalid) || undefined}>
          <FieldLabel htmlFor="prn-time">Thời điểm dùng</FieldLabel>
          <Input id="prn-time" inputMode="numeric" value={time} onChange={(e) => setTime(e.target.value)} className="h-11 w-32 tabular-nums" />
          {submitted && timeInvalid && <FieldError>Nhập giờ dạng HH:mm, không sau {now}</FieldError>}
        </Field>
        <Field data-invalid={(submitted && !reason.trim()) || undefined}>
          <FieldLabel htmlFor="prn-reason">Lý do dùng</FieldLabel>
          <Textarea id="prn-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={(submitted && !reason.trim()) || undefined} />
          {submitted && !reason.trim() && <FieldError>Nhập lý do dùng thuốc khi cần</FieldError>}
        </Field>
        <Field>
          <FieldLabel htmlFor="prn-reaction">Phản ứng sau dùng</FieldLabel>
          <Textarea id="prn-reaction" rows={2} value={reaction} onChange={(e) => setReaction(e.target.value)} />
          <FieldDescription>Không bắt buộc. Có ghi phản ứng thì hệ thống tạo cảnh báo cho người phụ trách.</FieldDescription>
        </Field>
      </div>
      <SheetFooter>
        <Button type="submit" className="h-11" disabled={saving}>
          Lưu lần dùng
        </Button>
      </SheetFooter>
    </form>
  )
}

// Ghi hiệu quả của một lần dùng (BR-M07-04): bắt buộc nội dung, mỗi lần dùng một lần ghi.
function EffectForm({ order, use, onSave }) {
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [problem, setProblem] = useState(null)
  const [saving, setSaving] = useState(false)
  const [key] = useState(() => crypto.randomUUID())

  async function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    if (!text.trim()) return
    setSaving(true)
    setProblem(null)
    try {
      await onSave(order, use, text, key)
    } catch (error) {
      setProblem(problemOf(error))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetHeader className="gap-3 pt-6">
        <SheetTitle className="type-title">Hiệu quả sau khi dùng</SheetTitle>
        <SheetDescription>
          {order.drug}, lần dùng lúc <span className="tabular-nums">{use.time}</span>
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-4 px-4">
        <ProblemAlert problem={problem} />
        <Field data-invalid={(submitted && !text.trim()) || undefined}>
          <FieldLabel htmlFor="prn-effect">Hiệu quả</FieldLabel>
          <Textarea id="prn-effect" rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-invalid={(submitted && !text.trim()) || undefined} />
          {submitted && !text.trim() && <FieldError>Nhập hiệu quả sau khi dùng thuốc</FieldError>}
        </Field>
      </div>
      <SheetFooter>
        <Button type="submit" className="h-11" disabled={saving}>
          Lưu hiệu quả
        </Button>
      </SheetFooter>
    </form>
  )
}

export function PrnPanel({ canRecord, now, onSaved }) {
  const [resident, setResident] = useState(null)
  const [orders, setOrders] = useState(null)
  const [problem, setProblem] = useState(null)
  const [recording, setRecording] = useState(null)
  const [effecting, setEffecting] = useState(null)

  const load = useCallback(async (id) => {
    try {
      setOrders(await loadPrnOrders(id))
      setProblem(null)
    } catch (error) {
      setOrders([])
      setProblem(problemOf(error))
    }
  }, [])

  function pick(r) {
    setResident(r)
    setOrders(null)
    setProblem(null)
    load(r.id)
  }

  async function save(order, entry) {
    await recordPrn(order, entry)
    setRecording(null)
    onSaved(`Đã lưu lần dùng ${order.drug} lúc ${entry.time}.`)
    await load(resident.id)
  }

  async function saveEffect(order, use, text, key) {
    await recordEffectiveness(order, use.id, text, key)
    setEffecting(null)
    onSaved(`Đã ghi hiệu quả lần dùng ${order.drug} lúc ${use.time}.`)
    await load(resident.id)
  }

  return (
    <div className="flex flex-col gap-4">
      <ResidentPicker onPick={pick} selectedId={resident?.id} />
      <ProblemAlert problem={problem} />
      {resident && !orders && !problem && (
        <p className="rounded-xl border bg-card px-4 py-3 type-body-sm">Đang tải đơn thuốc khi cần…</p>
      )}
      {resident && orders?.length === 0 && !problem && (
        <p className="type-body-sm text-muted-foreground">Người cao tuổi này chưa có đơn thuốc khi cần đang hiệu lực.</p>
      )}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3 *:max-w-[480px]">
        {(orders ?? []).map((o) => {
          const r = o.resident
          return (
            <Card key={o.id} className="gap-3">
              <CardHeader className="flex flex-row items-center gap-2.5">
                <ResidentAvatar name={r.name} code={r.code} initials={r.initials} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate type-label">{r.name}</span>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4 type-body-sm">
                <AllergyNote allergies={r.allergies} />

                <div className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col">
                      <span className="type-card-title">{o.drug}</span>
                      <span className="text-muted-foreground">
                        {o.dose}, {o.route}
                      </span>
                    </div>
                    <DoseTags dose={o} />
                  </div>
                  {o.indication && (
                    <span className="rounded-lg bg-muted px-3 py-1.5 text-foreground">
                      Chỉ định: {o.indication}
                    </span>
                  )}
                </div>

                <dl className="grid grid-cols-3 gap-2 rounded-xl border bg-muted/40 p-3 text-center">
                  <div className="flex flex-col gap-0.5">
                    <dt className="type-caption text-muted-foreground">Cách ít nhất</dt>
                    <dd className="type-label tabular-nums">{o.minHours} giờ</dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="type-caption text-muted-foreground">Tối đa / 24 giờ</dt>
                    <dd className="type-label tabular-nums">{o.maxPer24h} lần</dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="type-caption text-muted-foreground">Đã dùng / 24 giờ</dt>
                    <dd className="type-label tabular-nums">{o.usesIn24h} lần</dd>
                  </div>
                  <div className="col-span-3 border-t pt-2 text-muted-foreground">
                    Lần gần nhất: <span className="type-label tabular-nums text-foreground">{o.lastUse ?? 'chưa có'}</span>
                  </div>
                </dl>

                {!o.canAdministerNow && (
                  <p className="rounded-xl bg-warning px-3 py-2.5 text-warning-foreground">
                    <strong>Chưa được dùng tiếp</strong>
                    {o.earliest && (
                      <>
                        : sớm nhất được dùng lúc <span className="tabular-nums">{o.earliest}</span>
                      </>
                    )}
                    . Không có thao tác vượt chặn; cần thì báo bác sĩ.
                  </p>
                )}

                {canRecord &&
                  o.awaitingEffect.map((use) => (
                    <div key={use.id} className="flex items-center justify-between gap-3 rounded-xl bg-info px-3 py-2.5 text-info-foreground">
                      <span>
                        Lần dùng lúc <span className="type-label tabular-nums">{use.time}</span> chưa ghi hiệu quả
                      </span>
                      <Button variant="outline" size="sm" onClick={() => setEffecting({ order: o, use })}>
                        Ghi hiệu quả
                      </Button>
                    </div>
                  ))}

                {canRecord && o.canAdministerNow && (
                  <Button className="mt-auto h-11 w-full" onClick={() => setRecording(o)}>
                    Ghi lần dùng
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
      <Sheet open={!!effecting} onOpenChange={(open) => !open && setEffecting(null)}>
        <SheetContent>{effecting && <EffectForm key={effecting.use.id} order={effecting.order} use={effecting.use} onSave={saveEffect} />}</SheetContent>
      </Sheet>
      <Sheet open={!!recording} onOpenChange={(open) => !open && setRecording(null)}>
        <SheetContent>{recording && <PrnForm key={recording.id} order={recording} now={now} onSave={save} />}</SheetContent>
      </Sheet>
    </div>
  )
}
