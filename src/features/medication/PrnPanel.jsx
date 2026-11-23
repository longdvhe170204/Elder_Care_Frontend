import { useCallback, useState } from 'react'
import { AlertCircle, Clock } from 'lucide-react'
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
          <ResidentAvatar name={r.name} code={r.code} initials={r.initials} className="size-14 text-sm font-bold shadow-xs" />
          <div className="flex flex-col gap-0.5">
            <SheetTitle className="text-base font-bold text-slate-900 dark:text-slate-100">{r.name}</SheetTitle>
            <SheetDescription className="text-xs text-slate-500">
              {order.drug}, {order.dose}, {order.route}
            </SheetDescription>
          </div>
        </div>
        <AllergyNote allergies={r.allergies} />
      </SheetHeader>
      <div className="flex flex-col gap-4 px-4 pt-2">
        <ProblemAlert problem={problem}>
          {earliest && (
            <p className="text-xs font-medium">
              Sớm nhất được dùng lúc <span className="tabular-nums font-bold">{earliest}</span>. Cần thì báo bác sĩ.
            </p>
          )}
        </ProblemAlert>
        <Field data-invalid={(submitted && timeInvalid) || undefined}>
          <FieldLabel htmlFor="prn-time" className="text-xs font-semibold">Thời điểm dùng</FieldLabel>
          <Input
            id="prn-time"
            inputMode="numeric"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="h-10 w-32 rounded-xl text-xs tabular-nums"
          />
          {submitted && timeInvalid && <FieldError>Nhập giờ dạng HH:mm, không sau {now}</FieldError>}
        </Field>
        <Field data-invalid={(submitted && !reason.trim()) || undefined}>
          <FieldLabel htmlFor="prn-reason" className="text-xs font-semibold">Lý do dùng</FieldLabel>
          <Textarea
            id="prn-reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={(submitted && !reason.trim()) || undefined}
            className="rounded-xl text-xs"
            placeholder="Nhập lý do sử dụng thuốc khi cần..."
          />
          {submitted && !reason.trim() && <FieldError>Nhập lý do dùng thuốc khi cần</FieldError>}
        </Field>
        <Field>
          <FieldLabel htmlFor="prn-reaction" className="text-xs font-semibold">Phản ứng sau dùng</FieldLabel>
          <Textarea
            id="prn-reaction"
            rows={2}
            value={reaction}
            onChange={(e) => setReaction(e.target.value)}
            className="rounded-xl text-xs"
            placeholder="Ghi nhận phản ứng hoặc tác dụng phụ nếu có..."
          />
          <FieldDescription className="text-[11px]">Không bắt buộc. Có ghi phản ứng thì hệ thống tạo cảnh báo cho người phụ trách.</FieldDescription>
        </Field>
      </div>
      <SheetFooter className="mt-auto border-t border-slate-100 p-4 dark:border-slate-800">
        <Button
          type="submit"
          className="h-10 w-full rounded-xl bg-[#24496f] hover:bg-[#193552] text-white font-semibold text-xs shadow-xs"
          disabled={saving}
        >
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
        <SheetTitle className="text-base font-bold text-slate-900 dark:text-slate-100">Hiệu quả sau khi dùng</SheetTitle>
        <SheetDescription className="text-xs text-slate-500">
          {order.drug}, lần dùng lúc <span className="tabular-nums font-semibold">{use.time}</span>
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-4 px-4 pt-2">
        <ProblemAlert problem={problem} />
        <Field data-invalid={(submitted && !text.trim()) || undefined}>
          <FieldLabel htmlFor="prn-effect" className="text-xs font-semibold">Hiệu quả</FieldLabel>
          <Textarea
            id="prn-effect"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={(submitted && !text.trim()) || undefined}
            className="rounded-xl text-xs"
            placeholder="Mô tả hiệu quả (ví dụ: Hết đau sau 30 phút, hạ sốt...)"
          />
          {submitted && !text.trim() && <FieldError>Nhập hiệu quả sau khi dùng thuốc</FieldError>}
        </Field>
      </div>
      <SheetFooter className="mt-auto border-t border-slate-100 p-4 dark:border-slate-800">
        <Button
          type="submit"
          className="h-10 w-full rounded-xl bg-[#24496f] hover:bg-[#193552] text-white font-semibold text-xs shadow-xs"
          disabled={saving}
        >
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
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* Cột trái: Danh sách tối đa 8 người cao tuổi có phân trang */}
      <div className="w-full lg:w-80 lg:shrink-0">
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between px-0.5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Danh sách người cao tuổi
            </h3>
          </div>
          <ResidentPicker onPick={pick} selectedId={resident?.id} />
        </div>
      </div>

      {/* Cột phải: Banner cụ đang chọn, thông báo cảnh báo và danh sách thẻ đơn thuốc PRN */}
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <ProblemAlert problem={problem} />

        {/* Banner lâm sàng tóm tắt của người cao tuổi đang chọn */}
        {resident && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <ResidentAvatar
                name={resident.personalInfo?.fullName ?? ''}
                code={String(resident.id)}
                className="size-11 text-sm font-bold shadow-xs"
              />
              <div className="flex flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {resident.personalInfo?.fullName ?? resident.name}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 tabular-nums dark:bg-slate-800 dark:text-slate-300">
                    {resident.profileCode}
                  </span>
                </div>
                <span className="text-xs text-slate-500">
                  Chỉ định dùng thuốc khi cần (PRN) theo triệu chứng lâm sàng
                </span>
              </div>
            </div>

            {orders && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200 shadow-xs">
                <Clock className="size-3.5 text-emerald-600" />
                <span className="tabular-nums">{orders.length}</span> đơn thuốc khi cần
              </span>
            )}
          </div>
        )}

        {/* Trạng thái chưa chọn người cao tuổi */}
        {!resident && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/50 p-12 text-center dark:border-slate-800 dark:bg-slate-900/50">
            <div className="rounded-full bg-slate-100 p-3.5 dark:bg-slate-800">
              <Clock className="size-6 text-slate-400" />
            </div>
            <h4 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">
              Chưa chọn người cao tuổi
            </h4>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              Chọn người cao tuổi từ danh sách bên trái để xem đơn thuốc khi cần (PRN) và ghi nhận lần dùng.
            </p>
          </div>
        )}

        {resident && !orders && !problem && (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-8 text-center text-xs text-slate-500 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            Đang tải đơn thuốc khi cần…
          </div>
        )}

        {resident && orders?.length === 0 && !problem && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-8 text-center text-xs text-slate-500 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            Người cao tuổi này chưa có đơn thuốc khi cần đang hiệu lực.
          </div>
        )}

        {/* Lưới danh sách đơn thuốc khi cần */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(orders ?? []).map((o) => {
            const r = o.resident
            return (
              <Card
                key={o.id}
                className="flex flex-col gap-3.5 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
              >
                <CardHeader className="flex flex-row items-center gap-3 border-b border-slate-100 p-0 pb-3 dark:border-slate-800">
                  <ResidentAvatar name={r.name} code={r.code} initials={r.initials} className="size-9 text-xs font-bold shadow-xs" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{r.name}</span>
                    <span className="text-xs text-slate-500">{o.dose}, {o.route}</span>
                  </div>
                  <DoseTags dose={o} />
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-3.5 p-0 pt-1">
                  <AllergyNote allergies={r.allergies} />

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-base font-bold text-slate-900 tracking-tight dark:text-slate-100">
                        {o.drug}
                      </h4>
                      <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800">
                        Khi cần (PRN)
                      </span>
                    </div>
                    {o.indication && (
                      <div className="inline-flex items-center gap-1.5 rounded-xl bg-sky-50 border border-sky-100 px-3 py-1.5 text-xs font-semibold text-sky-900 dark:bg-sky-950/40 dark:border-sky-900 dark:text-sky-200 w-fit">
                        Chỉ định: {o.indication}
                      </div>
                    )}
                  </div>

                  {/* Khối 3 chỉ số tần suất & giới hạn dùng */}
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                    <div className="grid grid-cols-3 divide-x divide-slate-200 text-center dark:divide-slate-700">
                      <div className="px-1.5">
                        <div className="text-[11px] font-medium text-slate-500">Cách ít nhất</div>
                        <div className="mt-1 text-base font-bold text-slate-900 tabular-nums dark:text-slate-100">
                          {o.minHours} <span className="text-xs font-normal text-slate-500">giờ</span>
                        </div>
                      </div>
                      <div className="px-1.5">
                        <div className="text-[11px] font-medium text-slate-500">Tối đa / 24 giờ</div>
                        <div className="mt-1 text-base font-bold text-slate-900 tabular-nums dark:text-slate-100">
                          {o.maxPer24h} <span className="text-xs font-normal text-slate-500">lần</span>
                        </div>
                      </div>
                      <div className="px-1.5">
                        <div className="text-[11px] font-medium text-slate-500">Đã dùng / 24 giờ</div>
                        <div className="mt-1 text-base font-bold text-slate-900 tabular-nums dark:text-slate-100">
                          {o.usesIn24h} <span className="text-xs font-normal text-slate-500">lần</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2.5 border-t border-slate-200/80 pt-2 flex items-center justify-between text-xs dark:border-slate-700">
                      <span className="text-slate-500 font-medium">Lần gần nhất:</span>
                      <span className="font-semibold text-slate-800 tabular-nums dark:text-slate-200">
                        {o.lastUse ?? 'chưa có'}
                      </span>
                    </div>
                  </div>

                  {/* Cảnh báo chưa được dùng tiếp */}
                  {!o.canAdministerNow && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-3.5 text-xs text-amber-900 shadow-xs dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                      <div className="flex items-center gap-1.5 font-bold text-amber-950 dark:text-amber-100">
                        <Clock className="size-4 text-amber-700 shrink-0" />
                        <span>Chưa được dùng tiếp</span>
                        {o.earliest && (
                          <span>
                            : sớm nhất được dùng lúc <span className="tabular-nums font-bold underline">{o.earliest}</span>
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-amber-800/90 dark:text-amber-300">
                        Không có thao tác vượt chặn; cần thì báo bác sĩ.
                      </p>
                    </div>
                  )}

                  {/* Khối nhắc ghi hiệu quả */}
                  {canRecord &&
                    o.awaitingEffect.map((use) => (
                      <div
                        key={use.id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50/90 p-3 text-xs text-sky-900 shadow-xs dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-200"
                      >
                        <div className="flex items-center gap-2">
                          <AlertCircle className="size-4 text-sky-600 shrink-0" />
                          <span>
                            Lần dùng lúc <strong className="tabular-nums">{use.time}</strong> chưa ghi hiệu quả
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEffecting({ order: o, use })}
                          className="h-8 shrink-0 rounded-xl border-sky-300 bg-white px-3 text-xs font-bold text-sky-900 shadow-xs hover:bg-sky-50 dark:bg-slate-900 dark:border-sky-800 dark:text-sky-200"
                        >
                          Ghi hiệu quả
                        </Button>
                      </div>
                    ))}

                  {/* Nút hành động chính */}
                  {canRecord && o.canAdministerNow && (
                    <Button
                      className="mt-auto h-10 w-full rounded-xl bg-[#24496f] hover:bg-[#193552] text-white font-bold text-xs shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5"
                      onClick={() => setRecording(o)}
                    >
                      Ghi lần dùng
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      <Sheet open={!!effecting} onOpenChange={(open) => !open && setEffecting(null)}>
        <SheetContent>
          {effecting && <EffectForm key={effecting.use.id} order={effecting.order} use={effecting.use} onSave={saveEffect} />}
        </SheetContent>
      </Sheet>

      <Sheet open={!!recording} onOpenChange={(open) => !open && setRecording(null)}>
        <SheetContent>
          {recording && <PrnForm key={recording.id} order={recording} now={now} onSave={save} />}
        </SheetContent>
      </Sheet>
    </div>
  )
}
