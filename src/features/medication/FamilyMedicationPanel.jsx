import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { ProblemAlert } from '@/common/ProblemAlert'
import { problemOf } from '@/common/problem'
import { todayVN } from './doseRound'
import {
  CHECKS,
  DISPOSE_KIND,
  STATUS,
  confirmUse,
  disposeBatch,
  holdOnly,
  loadFamilyMedications,
  markDepleted,
  notifyRunningLow,
  receiveBatch,
  returnBatch,
  stopUse,
} from './familyMedicationApi'
import { ResidentPicker } from './ResidentPicker'

// Thuốc gia đình gửi (spec 006 US5; FR-040 → FR-046; BR-M07-10, 11, 19, 30): Điều dưỡng tiếp nhận một lô kèm bốn mục kiểm
// tra (nhãn, hạn dùng, bao bì, đúng tên); có mục Không đạt thì không chọn được "Được sử dụng". Hoàn trả, Hủy kèm người
// chứng kiến. Hệ thống không theo dõi số lượng còn (Q-393): Điều dưỡng tự báo gia đình sắp hết.

const select = 'h-11 rounded-md border bg-background px-3 text-sm'

const ACTIONS = {
  PENDING_RECONCILIATION: ['USE', 'HOLD', 'RETURN', 'DISPOSE'],
  HOLD_ONLY: ['USE', 'RETURN', 'DISPOSE'],
  IN_USE: ['LOW', 'DEPLETED', 'STOP'],
}
const LABEL = {
  USE: 'Xác nhận sử dụng',
  HOLD: 'Chỉ giữ hộ',
  RETURN: 'Hoàn trả',
  DISPOSE: 'Hủy',
  LOW: 'Báo gia đình sắp hết',
  DEPLETED: 'Ghi dùng hết',
  STOP: 'Ngừng sử dụng',
}

const nameOf = (b) => b.customName ?? `Thuốc #${b.medicationId}`
const failed = (b) => b.intakeChecks && Object.values(b.intakeChecks).some((ok) => ok === false)

function ReceiveForm({ residentId, resident, onDone, onClose }) {
  const [form, setForm] = useState({
    customName: '',
    concentration: '',
    quantity: '',
    unit: 'viên',
    expiryDate: '',
    packagingCondition: '',
    hasPrescription: false,
    deliverer: '',
    relationship: '',
    labelOk: true,
    expiryOk: true,
    packagingOk: true,
    nameOk: true,
  })
  const [submitted, setSubmitted] = useState(false)
  const [problem, setProblem] = useState(null)
  const [saving, setSaving] = useState(false)
  const key = useRef(crypto.randomUUID())
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const missing =
    !form.customName.trim() || !form.concentration.trim() || !(Number(form.quantity) > 0) || !form.expiryDate || !form.packagingCondition.trim() || !form.deliverer.trim()

  async function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    if (missing) return
    setSaving(true)
    setProblem(null)
    try {
      await receiveBatch(
        residentId,
        {
          customName: form.customName.trim(),
          concentration: form.concentration.trim(),
          quantity: Number(form.quantity),
          unit: form.unit.trim(),
          expiryDate: form.expiryDate,
          packagingCondition: form.packagingCondition.trim(),
          hasPrescription: form.hasPrescription,
          deliverer: { type: 'FAMILY_MEMBER', fullName: form.deliverer.trim(), ...(form.relationship.trim() && { relationship: form.relationship.trim() }) },
          receivedAt: new Date().toISOString(),
          intakeChecks: { labelOk: form.labelOk, expiryOk: form.expiryOk, packagingOk: form.packagingOk, nameOk: form.nameOk },
        },
        key.current,
      )
      await onDone(`Đã tiếp nhận thuốc ${form.customName.trim()} của ${resident}.`)
    } catch (error) {
      setProblem(problemOf(error))
      setSaving(false)
    }
  }

  const text = (id, label, field, extra = {}) => (
    <Field data-invalid={(submitted && !String(form[field]).trim() && true) || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} value={form[field]} onChange={(e) => set({ [field]: e.target.value })} className="h-11" {...extra} />
    </Field>
  )

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle className="type-title">Tiếp nhận thuốc gia đình gửi</SheetTitle>
        <SheetDescription>Cho {resident}. Thuốc hết hạn dùng vẫn ghi nhận được.</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-3 overflow-y-auto px-4">
        <ProblemAlert problem={problem} />
        {text('fm-name', 'Tên thuốc', 'customName')}
        <div className="grid grid-cols-2 gap-3">
          {text('fm-conc', 'Hàm lượng', 'concentration', { placeholder: '500 mg' })}
          {text('fm-unit', 'Đơn vị', 'unit')}
          {text('fm-qty', 'Số lượng lúc nhận', 'quantity', { inputMode: 'decimal' })}
          {text('fm-exp', 'Hạn dùng', 'expiryDate', { type: 'date' })}
        </div>
        {text('fm-pack', 'Tình trạng bao bì', 'packagingCondition')}
        <div className="grid grid-cols-2 gap-3">
          {text('fm-deliverer', 'Người giao', 'deliverer')}
          {text('fm-rel', 'Quan hệ', 'relationship')}
        </div>
        <label className="flex cursor-pointer items-center gap-2 type-body-sm">
          <input type="checkbox" checked={form.hasPrescription} onChange={(e) => set({ hasPrescription: e.target.checked })} />
          Có toa hoặc đơn kèm theo
        </label>
        <fieldset className="flex flex-col gap-1.5 rounded-lg border p-3">
          <legend className="px-1 type-label">Kiểm tra khi tiếp nhận (Đạt = chọn)</legend>
          {CHECKS.map(([field, label]) => (
            <label key={field} className="flex cursor-pointer items-center gap-2 type-body-sm">
              <input type="checkbox" checked={form[field]} onChange={(e) => set({ [field]: e.target.checked })} />
              {label} đạt
            </label>
          ))}
          <FieldDescription>Có mục Không đạt thì lô chỉ được giữ hộ, hoàn trả hoặc hủy, không dùng được.</FieldDescription>
        </fieldset>
        {submitted && missing && <FieldError>Nhập đủ tên thuốc, hàm lượng, số lượng, hạn dùng, bao bì, người giao</FieldError>}
      </div>
      <SheetFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Hủy
        </Button>
        <Button type="submit" className="h-11" disabled={saving}>
          Lưu tiếp nhận
        </Button>
      </SheetFooter>
    </form>
  )
}

function ActionForm({ action, batch, prescriptions, onDone, onClose }) {
  const [selected, setSelected] = useState([])
  const [packagingRecognizable, setPackaging] = useState(true)
  const [form, setForm] = useState({
    reason: '',
    note: '',
    quantity: '',
    recipient: '',
    relationship: '',
    witness: '',
    kind: 'FAMILY_REQUEST',
    representativeId: '',
    requestMethod: '',
  })
  const [submitted, setSubmitted] = useState(false)
  const [problem, setProblem] = useState(null)
  const [saving, setSaving] = useState(false)
  const key = useRef(crypto.randomUUID())
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const invalid = {
    USE: selected.length === 0 || failed(batch),
    HOLD: !form.reason.trim(),
    STOP: !form.reason.trim(),
    RETURN: !(Number(form.quantity) >= 0 && form.quantity !== '') || !form.recipient.trim() || !form.witness.trim(),
    DISPOSE:
      !(Number(form.quantity) >= 0 && form.quantity !== '') ||
      !form.witness.trim() ||
      !form.reason.trim() ||
      (form.kind === 'FAMILY_REQUEST' && (!form.representativeId || !form.requestMethod.trim())),
    LOW: false,
    DEPLETED: false,
  }[action]

  async function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    if (invalid) return
    setSaving(true)
    setProblem(null)
    const k = key.current
    try {
      if (action === 'USE') await confirmUse(batch, prescriptions, selected, packagingRecognizable, k)
      else if (action === 'HOLD') await holdOnly(batch.id, form.reason, k)
      else if (action === 'STOP') await stopUse(batch.id, form.reason, k)
      else if (action === 'RETURN') await returnBatch(batch.id, form, k)
      else if (action === 'DISPOSE') await disposeBatch(batch.id, form, k)
      else if (action === 'LOW') await notifyRunningLow(batch.id, form.note, k)
      else await markDepleted(batch.id, k)
      await onDone(`${LABEL[action]}: ${nameOf(batch)}.`)
    } catch (error) {
      setProblem(problemOf(error))
      setSaving(false)
    }
  }

  const field = (id, label, name, props = {}) => (
    <Field data-invalid={(submitted && !String(form[name]).trim() && true) || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} value={form[name]} onChange={(e) => set({ [name]: e.target.value })} className="h-11" {...props} />
    </Field>
  )

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle className="type-title">{LABEL[action]}</SheetTitle>
        <SheetDescription>
          {nameOf(batch)}, lô #{batch.id}
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-3 overflow-y-auto px-4">
        <ProblemAlert problem={problem} />
        {action === 'USE' && (
          <>
            {failed(batch) && <FieldError>Lô có mục kiểm tra khi tiếp nhận Không đạt, không dùng được (BR-M07-30).</FieldError>}
            <fieldset className="flex flex-col gap-1.5">
              <legend className="type-label">Đơn nguồn gia đình gửi cùng thuốc</legend>
              {prescriptions.length === 0 && <span className="type-body-sm text-muted-foreground">Người cao tuổi chưa có đơn nguồn gia đình gửi.</span>}
              {prescriptions.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-2 type-body-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(p.id)}
                    onChange={(e) => setSelected(e.target.checked ? [...selected, p.id] : selected.filter((x) => x !== p.id))}
                  />
                  Đơn #{p.id}, liều {p.dosage}
                </label>
              ))}
              {submitted && selected.length === 0 && <FieldError>Chọn ít nhất một đơn</FieldError>}
            </fieldset>
            <label className="flex cursor-pointer items-center gap-2 type-body-sm">
              <input type="checkbox" checked={packagingRecognizable} onChange={(e) => setPackaging(e.target.checked)} />
              Bao bì nhận diện được thuốc
            </label>
          </>
        )}
        {(action === 'HOLD' || action === 'STOP') && (
          <Field data-invalid={(submitted && !form.reason.trim() && true) || undefined}>
            <FieldLabel htmlFor="fm-reason">Lý do</FieldLabel>
            <Textarea id="fm-reason" rows={3} value={form.reason} onChange={(e) => set({ reason: e.target.value })} />
          </Field>
        )}
        {action === 'LOW' && (
          <Field>
            <FieldLabel htmlFor="fm-note">Ghi chú gửi gia đình (không bắt buộc)</FieldLabel>
            <Textarea id="fm-note" rows={2} value={form.note} onChange={(e) => set({ note: e.target.value })} />
            <FieldDescription>Hệ thống thông báo người thân mức Trung bình và ghi vào lịch sử lô (Q-393).</FieldDescription>
          </Field>
        )}
        {action === 'DEPLETED' && <p className="type-body-sm">Lô chuyển Đã dùng hết và gỡ liên kết đơn.</p>}
        {action === 'RETURN' && (
          <>
            {field('fm-rq', 'Số lượng đếm thực tế lúc trả', 'quantity', { inputMode: 'decimal' })}
            {field('fm-recipient', 'Người nhận', 'recipient')}
            {field('fm-relationship', 'Quan hệ', 'relationship')}
            {field('fm-witness', 'Người chứng kiến', 'witness')}
          </>
        )}
        {action === 'DISPOSE' && (
          <>
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="fm-kind">Loại hủy</FieldLabel>
              <select id="fm-kind" value={form.kind} onChange={(e) => set({ kind: e.target.value })} className={select}>
                <option value="FAMILY_REQUEST">Theo yêu cầu gia đình</option>
                <option value="EXPIRED" disabled={!batch.expiryDate || batch.expiryDate >= todayVN()}>
                  Do hết hạn dùng
                </option>
              </select>
            </div>
            {form.kind === 'FAMILY_REQUEST' && (
              <>
                {field('fm-rep', 'Mã người đại diện yêu cầu', 'representativeId', { inputMode: 'numeric' })}
                {field('fm-method', 'Hình thức yêu cầu', 'requestMethod', { placeholder: 'Gọi điện, văn bản…' })}
              </>
            )}
            {field('fm-dq', 'Số lượng đếm thực tế', 'quantity', { inputMode: 'decimal' })}
            {field('fm-dwitness', 'Người chứng kiến', 'witness')}
            <Field data-invalid={(submitted && !form.reason.trim() && true) || undefined}>
              <FieldLabel htmlFor="fm-dreason">Lý do</FieldLabel>
              <Textarea id="fm-dreason" rows={2} value={form.reason} onChange={(e) => set({ reason: e.target.value })} />
            </Field>
          </>
        )}
        {submitted && invalid && action !== 'USE' && <FieldError>Nhập đủ các ô bắt buộc</FieldError>}
      </div>
      <SheetFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Hủy
        </Button>
        <Button type="submit" className="h-11" disabled={saving}>
          {LABEL[action]}
        </Button>
      </SheetFooter>
    </form>
  )
}

export function FamilyMedicationPanel({ canRecord, onSaved }) {
  const [resident, setResident] = useState(null)
  const [data, setData] = useState(null)
  const [problem, setProblem] = useState(null)
  const [sheet, setSheet] = useState(null)

  const load = useCallback(async (id) => {
    try {
      setData(await loadFamilyMedications(id))
      setProblem(null)
    } catch (error) {
      setData({ batches: [], prescriptions: [] })
      setProblem(problemOf(error))
    }
  }, [])

  useEffect(() => {
    if (!resident) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tải lô khi chọn người cao tuổi
    load(resident.id)
  }, [resident, load])

  const name = resident?.personalInfo?.fullName ?? `người cao tuổi #${resident?.id}`

  async function done(message) {
    setSheet(null)
    onSaved(message)
    await load(resident.id)
  }

  return (
    <div className="flex flex-col gap-4">
      <ResidentPicker onPick={(r) => (setData(null), setResident(r))} selectedId={resident?.id} />
      <ProblemAlert problem={problem} />
      {resident && canRecord && (
        <div>
          <Button variant="tonal" onClick={() => setSheet({ type: 'RECEIVE' })}>
            Tiếp nhận lô thuốc mới
          </Button>
        </div>
      )}
      {resident && !data && !problem && <p className="rounded-xl border bg-card px-4 py-3 type-body-sm">Đang tải thuốc gia đình gửi…</p>}
      {resident && data?.batches.length === 0 && !problem && (
        <p className="type-body-sm text-muted-foreground">Người cao tuổi này chưa có lô thuốc gia đình gửi.</p>
      )}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3 *:max-w-[520px]">
        {(data?.batches ?? []).map((b) => (
          <Card key={b.id} className="gap-3">
            <CardHeader className="flex flex-row items-center gap-2">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate type-label">{nameOf(b)}</span>
                <span className="type-caption text-muted-foreground">
                  {b.concentration}, lúc nhận {b.quantity} {b.unit}; hạn {b.expiryDate}
                </span>
              </div>
              <Badge variant="outline">
                {STATUS[b.status]}
                {b.status === 'DISPOSED' && b.disposeKind ? ` ${DISPOSE_KIND[b.disposeKind]}` : ''}
              </Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 type-body-sm">
              {b.intakeChecks ? (
                <span className={failed(b) ? 'text-warning-foreground' : 'text-muted-foreground'}>
                  Kiểm tra tiếp nhận: {CHECKS.map(([f, l]) => `${l} ${b.intakeChecks[f] ? 'đạt' : 'không đạt'}`).join('; ')}
                </span>
              ) : (
                <span className="text-muted-foreground">Lô cũ chưa kiểm tra khi tiếp nhận.</span>
              )}
              {b.witness && <span className="text-muted-foreground">Người chứng kiến: {b.witness}</span>}
              {b.finalQuantity != null && <span className="text-muted-foreground">Số đếm thực tế lúc trả, hủy: {b.finalQuantity}</span>}
              {canRecord && (ACTIONS[b.status] ?? []).length > 0 && (
                <div className="mt-auto flex flex-wrap justify-end gap-2 border-t pt-3">
                  {ACTIONS[b.status].map((a) => (
                    <Button key={a} variant="outline" size="sm" disabled={a === 'USE' && failed(b)} onClick={() => setSheet({ type: a, batch: b })}>
                      {LABEL[a]}
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <Sheet open={!!sheet} onOpenChange={(open) => !open && setSheet(null)}>
        <SheetContent>
          {sheet?.type === 'RECEIVE' && <ReceiveForm residentId={resident.id} resident={name} onDone={done} onClose={() => setSheet(null)} />}
          {sheet && sheet.type !== 'RECEIVE' && (
            <ActionForm key={`${sheet.type}-${sheet.batch.id}`} action={sheet.type} batch={sheet.batch} prescriptions={data?.prescriptions ?? []} onDone={done} onClose={() => setSheet(null)} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
