import { useCallback, useEffect, useRef, useState } from 'react'
import { Package, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { ProblemAlert } from '@/common/ProblemAlert'
import { ResidentAvatar } from '@/common/ResidentAvatar'
import { problemOf } from '@/common/problem'
import { cn } from '@/lib/utils'
import { todayVN } from './doseRound'
import {
  CHECKS,
  DISPOSE_KIND,
  EXTRA_CHECKS,
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

const CONCENTRATION_PRESETS = ['5 mg', '10 mg', '20 mg', '40 mg', '100 mg', '250 mg', '500 mg', '1000 mg']
const UNIT_PRESETS = ['viên', 'gói', 'ống', 'lọ', 'chai', 'tuýp', 'ml', 'giọt']
const PACKAGING_PRESETS = ['Nguyên vẹn, rõ nhãn mác', 'Nguyên vẹn', 'Bao bì có vết rách nhẹ', 'Mất nhãn']
const RELATIONSHIP_PRESETS = ['Con', 'Cháu', 'Vợ/Chồng', 'Anh/Chị/Em', 'Người giám hộ', 'Người quen']

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
    ingredientOk: true,
    concentrationOk: true,
    dosageFormOk: true,
    storageOk: true,
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
          intakeChecks: {
            labelOk: form.labelOk,
            expiryOk: form.expiryOk,
            packagingOk: form.packagingOk && form.ingredientOk && form.concentrationOk && form.dosageFormOk && form.storageOk,
            nameOk: form.nameOk,
          },
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
        <datalist id="fm-conc-list">
          {CONCENTRATION_PRESETS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <datalist id="fm-unit-list">
          {UNIT_PRESETS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <datalist id="fm-pack-list">
          {PACKAGING_PRESETS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <datalist id="fm-rel-list">
          {RELATIONSHIP_PRESETS.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        {text('fm-name', 'Tên thuốc', 'customName')}
        <div className="grid grid-cols-2 gap-3">
          {text('fm-conc', 'Hàm lượng', 'concentration', { placeholder: '500 mg', list: 'fm-conc-list' })}
          {text('fm-unit', 'Đơn vị', 'unit', { placeholder: 'viên', list: 'fm-unit-list' })}
          {text('fm-qty', 'Số lượng lúc nhận', 'quantity', { inputMode: 'decimal' })}
          {text('fm-exp', 'Hạn dùng', 'expiryDate', { type: 'date' })}
        </div>
        {text('fm-pack', 'Tình trạng bao bì', 'packagingCondition', { placeholder: 'Nguyên vẹn...', list: 'fm-pack-list' })}
        <div className="grid grid-cols-2 gap-3">
          {text('fm-deliverer', 'Người giao', 'deliverer')}
          {text('fm-rel', 'Quan hệ', 'relationship', { placeholder: 'Con...', list: 'fm-rel-list' })}
        </div>
        <label className="flex cursor-pointer items-center gap-2 type-body-sm">
          <input type="checkbox" checked={form.hasPrescription} onChange={(e) => set({ hasPrescription: e.target.checked })} />
          Có toa hoặc đơn kèm theo
        </label>
        <fieldset className="flex flex-col gap-1.5 rounded-lg border p-3">
          <legend className="px-1 type-label">Kiểm tra khi tiếp nhận (Đạt = chọn)</legend>
          {[...CHECKS, ...EXTRA_CHECKS].map(([field, label]) => (
            <label key={field} className="flex cursor-pointer items-center gap-2 type-body-sm">
              <input type="checkbox" checked={form[field]} onChange={(e) => set({ [field]: e.target.checked })} />
              {label} đạt
            </label>
          ))}
          <FieldDescription>Có mục Không đạt hoặc khác hàm lượng thì lô chỉ được giữ hộ, hoàn trả hoặc hủy, không dùng được.</FieldDescription>
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
          Đóng
        </Button>
        <Button type="submit" className="h-11" disabled={saving}>
          {action === 'DISPOSE' ? 'Xác nhận hủy' : LABEL[action]}
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
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* Cột trái: Danh sách tối đa 8 người cao tuổi có phân trang */}
      <div className="w-full lg:w-80 lg:shrink-0">
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between px-0.5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Danh sách người cao tuổi
            </h3>
          </div>
          <ResidentPicker onPick={(r) => (setData(null), setResident(r))} selectedId={resident?.id} />
        </div>
      </div>

      {/* Cột phải: Banner cụ đang chọn, nút tiếp nhận lô mới và danh sách các lô thuốc */}
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <ProblemAlert problem={problem} />

        {/* Banner tóm tắt người cao tuổi đang chọn */}
        {resident && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <ResidentAvatar
                name={name}
                code={String(resident.id)}
                className="size-11 text-sm font-bold shadow-xs"
              />
              <div className="flex flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {name}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 tabular-nums dark:bg-slate-800 dark:text-slate-300">
                    {resident.profileCode ?? `Mã #${resident.id}`}
                  </span>
                </div>
                <span className="text-xs text-slate-500">
                  Thuốc do người thân/gia đình gửi vào viện (kiểm tra tiếp nhận & đối chiếu)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {data && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 border border-sky-200 px-3 py-1.5 text-xs font-bold text-sky-900 dark:bg-sky-950/40 dark:border-sky-800 dark:text-sky-200 shadow-xs">
                  <Package className="size-3.5 text-sky-600" />
                  <span className="tabular-nums">{data.batches?.length ?? 0}</span> lô thuốc
                </span>
              )}
              {canRecord && (
                <Button
                  onClick={() => setSheet({ type: 'RECEIVE' })}
                  className="h-9.5 gap-1.5 rounded-xl bg-[#24496f] hover:bg-[#193552] text-white px-4 text-xs font-bold shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
                >
                  <Plus className="size-4" />
                  Tiếp nhận lô thuốc mới
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Trạng thái chưa chọn người cao tuổi */}
        {!resident && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/50 p-12 text-center dark:border-slate-800 dark:bg-slate-900/50">
            <div className="rounded-full bg-slate-100 p-3.5 dark:bg-slate-800">
              <Package className="size-6 text-slate-400" />
            </div>
            <h4 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">
              Chưa chọn người cao tuổi
            </h4>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              Chọn người cao tuổi từ danh sách bên trái để xem các lô thuốc gia đình gửi hoặc tiếp nhận lô thuốc mới.
            </p>
          </div>
        )}

        {resident && !data && !problem && (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-8 text-center text-xs text-slate-500 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            Đang tải thuốc gia đình gửi…
          </div>
        )}

        {resident && data?.batches.length === 0 && !problem && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-8 text-center text-xs text-slate-500 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            Người cao tuổi này chưa có lô thuốc gia đình gửi.
          </div>
        )}

        {/* Lưới danh sách các lô thuốc gia đình gửi */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(data?.batches ?? []).map((b) => {
            const hasFailed = failed(b)
            return (
              <Card
                key={b.id}
                className="flex flex-col gap-3.5 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
              >
                <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-slate-100 p-0 pb-3 dark:border-slate-800">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-base font-bold text-slate-900 dark:text-slate-100">
                      {nameOf(b)}
                    </span>
                    <span className="text-xs text-slate-500">
                      {b.concentration} • lúc nhận: <strong className="tabular-nums font-semibold text-slate-700 dark:text-slate-300">{b.quantity} {b.unit}</strong>
                    </span>
                    <span className="text-[11px] text-slate-400 tabular-nums">
                      Hạn dùng: {b.expiryDate}
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      'shrink-0 text-xs font-semibold px-2.5 py-0.5 rounded-full border',
                      b.status === 'IN_USE'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                        : b.status === 'PENDING_RECONCILIATION'
                          ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                          : b.status === 'HOLD_ONLY'
                            ? 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800'
                            : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                    )}
                  >
                    {STATUS[b.status]}
                    {b.status === 'DISPOSED' && b.disposeKind ? ` ${DISPOSE_KIND[b.disposeKind]}` : ''}
                  </Badge>
                </CardHeader>

                <CardContent className="flex flex-1 flex-col gap-3 p-0 pt-1">
                  {/* Hộp kiểm tra tiếp nhận 4 tiêu chí */}
                  <div
                    className={cn(
                      'rounded-xl border p-3 text-xs',
                      hasFailed
                        ? 'border-amber-200 bg-amber-50/90 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200'
                        : 'border-slate-100 bg-slate-50/70 text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300'
                    )}
                  >
                    {b.intakeChecks ? (
                      <div className="flex flex-col gap-1">
                        <span className={cn('font-semibold', hasFailed ? 'text-amber-950 dark:text-amber-100' : 'text-slate-900 dark:text-slate-100')}>
                          Kiểm tra tiếp nhận: {CHECKS.map(([f, l]) => `${l} ${b.intakeChecks[f] ? 'đạt' : 'không đạt'}`).join('; ')}
                        </span>
                        {hasFailed && (
                          <span className="text-[11px] text-amber-800 dark:text-amber-300 font-medium">
                            Có mục không đạt: không thể chọn "Xác nhận sử dụng"
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-500">Lô cũ chưa kiểm tra khi tiếp nhận.</span>
                    )}
                  </div>

                  {b.witness && (
                    <div className="text-xs text-slate-500">
                      Người chứng kiến: <strong className="text-slate-700 dark:text-slate-300">{b.witness}</strong>
                    </div>
                  )}

                  {b.finalQuantity != null && (
                    <div className="text-xs text-slate-500">
                      Số đếm thực tế lúc trả, hủy: <strong className="tabular-nums text-slate-700 dark:text-slate-300">{b.finalQuantity}</strong>
                    </div>
                  )}

                  {/* Nút hành động */}
                  {canRecord && (ACTIONS[b.status] ?? []).length > 0 && (
                    <div className="mt-auto flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                      {ACTIONS[b.status].map((a) => {
                        const isUse = a === 'USE'
                        const isDestructive = a === 'RETURN' || a === 'DISPOSE' || a === 'STOP'
                        const isHold = a === 'HOLD'
                        const isDisabled = isUse && hasFailed

                        return (
                          <Button
                            key={a}
                            variant={isUse ? 'default' : 'outline'}
                            size="sm"
                            disabled={isDisabled}
                            onClick={() => setSheet({ type: a, batch: b })}
                            className={cn(
                              'h-8.5 rounded-xl px-3 text-xs font-bold shadow-xs transition-all',
                              isUse &&
                              'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs',
                              isHold &&
                              'border-sky-300 text-sky-900 bg-sky-50/50 hover:bg-sky-100 dark:border-sky-800 dark:text-sky-200 dark:bg-sky-950/30',
                              isDestructive &&
                              'border-red-200 text-red-700 bg-red-50/50 hover:bg-red-100 dark:border-red-900 dark:text-red-300 dark:bg-red-950/30',
                              !isUse && !isHold && !isDestructive &&
                              'border-slate-200 text-slate-700 bg-white hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:bg-slate-800'
                            )}
                          >
                            {LABEL[a]}
                          </Button>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
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
    </div>
  )
}
