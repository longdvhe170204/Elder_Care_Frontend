import { useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  getCatalogsByType,
  getResidentsByIdHealthItems,
  getResidentsByIdInitialHealthRecord,
  postResidentsByIdHealthItems,
  postResidentsByIdInitialHealthRecordConfirm,
  putResidentsByIdInitialHealthRecord,
} from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { ChoiceTray } from '@/common/ChoiceTray'
import { DiscardChangesDialog } from '@/common/DiscardChangesDialog'
import { ProblemAlert } from '@/common/ProblemAlert'
import { SearchSelect } from '@/common/SearchSelect'
import { StatusBadge } from '@/common/StatusBadge'
import { problemOf } from '@/common/problem'
import { CHRONIC_CONDITION_CHOICES, HEALTH_RECORD_CHOICES, MEDICAL_HISTORY_CHOICES } from '@/common/quickChoices'
import { cn } from '@/lib/utils'
import { Choices } from '../admissions/FormParts'
import { CATALOG_TYPES, HEALTH_RECORD_FIELDS, HEALTH_TYPE_LABELS, HEALTH_TYPE_ORDER } from './healthLabels'

// Sức khỏe ban đầu mở từ Hồ sơ tiếp nhận (001 FR-017 → FR-018b; Q-400, BR-M01-17; chủ dự án duyệt bố cục 2026-11-26):
// khung xl, đầu, chân cố định; 01 Tình trạng hiện tại, 02 Nhu cầu và thuốc lưu bằng "Lưu bản nháp" (PUT, If-Match khi sửa);
// 03 Dị ứng, bệnh nền, tiền sử bệnh ghi từng mục bằng lệnh riêng, ghi xong vẫn mở để ghi tiếp. Mỗi ô có khay chọn nhanh
// (ChoiceTray, chọn nhiều, kèm Khác), không chọn sẵn (Q-307). Hành chính (ghi được mục nhưng không kiểm chứng) chỉ chọn
// nguồn Người cao tuổi, Người thân (BR-M01-17). Tab Sức khỏe của hồ sơ giữ nguyên cho Bác sĩ, Điều dưỡng kiểm chứng,
// loại trừ. Không có dòng giải thích, trừ câu bắt buộc của FR-018a cho dị ứng nhập tay.

const FORM_ID = 'initial-health-form'
const BLOOD_GROUPS = ['A', 'B', 'AB', 'O', 'Chưa rõ']
const RH = ['Rh+', 'Rh−']
const FAMILY_SOURCES = ['Người cao tuổi', 'Người thân']
const OTHER = '__other__'
const GROUP_01 = ['mobility', 'selfCareAbility', 'cognition']
const GROUP_02 = ['initialNeedsNote', 'nutritionNeeds', 'currentMedications', 'rehabilitationNeeds']
const PLACEHOLDERS = { currentMedications: 'Tên thuốc, liều, giờ dùng' }
const labelOf = (name) => HEALTH_RECORD_FIELDS.find((f) => f.name === name).label

// Nhóm máu lưu thành chữ (api-001 bloodType là chuỗi): "O+", "AB-", "Chưa rõ"
function parseBlood(value) {
  const text = (value ?? '').trim()
  if (text === 'Chưa rõ') return { group: 'Chưa rõ', rh: '' }
  const match = /^(AB|A|B|O)\s*([+-])?$/i.exec(text)
  if (!match) return { group: '', rh: '' }
  return { group: match[1].toUpperCase(), rh: match[2] === '-' ? 'Rh−' : match[2] === '+' ? 'Rh+' : '' }
}

function bloodText(group, rh) {
  if (!group) return ''
  if (group === 'Chưa rõ') return group
  return `${group}${rh === 'Rh−' ? '-' : rh === 'Rh+' ? '+' : ''}`
}

function formOf(record) {
  return Object.fromEntries(HEALTH_RECORD_FIELDS.map((f) => [f.name, record?.[f.name] ?? '']))
}

const blank = (value) => (value.trim() === '' ? undefined : value.trim())
const itemName = (item) => item.allergen?.name ?? item.freeText

function ItemList({ items }) {
  const sorted = HEALTH_TYPE_ORDER.flatMap((type) => items.filter((i) => i.type === type))
  if (sorted.length === 0) return null
  return (
    <ul aria-label="Mục sức khỏe đang có" className="flex flex-col gap-1.5">
      {sorted.map((item) => (
        <li
          key={item.id}
          className={cn(
            'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] border px-3 py-2',
            item.type === 'ALLERGY' && 'border-warning bg-warning/15',
          )}
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className={cn('type-body-sm', item.type === 'ALLERGY' && 'font-medium')}>
              {`${HEALTH_TYPE_LABELS[item.type]}: ${itemName(item)}`}
            </span>
            <span className="type-caption text-muted-foreground">
              {[item.type === 'ALLERGY' && item.severity, `nguồn ${String(item.source ?? '').toLowerCase()}`]
                .filter(Boolean)
                .join(', ')}
            </span>
          </span>
          {item.unverified && <Badge variant="attention">Chưa kiểm chứng</Badge>}
          {item.notAutoChecked && <Badge variant="attention">Không kiểm tra tự động</Badge>}
        </li>
      ))}
    </ul>
  )
}

function AddItem({ residentId, catalogs, selfReport, onRecorded, onDirtyChange }) {
  const [type, setType] = useState('')
  const [allergenId, setAllergenId] = useState('')
  const [manual, setManual] = useState(false)
  const [choice, setChoice] = useState('')
  const [text, setText] = useState('')
  const [severityId, setSeverityId] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [errors, setErrors] = useState({})
  const [duplicate, setDuplicate] = useState(false)
  const [failure, setFailure] = useState(null)
  const [busy, setBusy] = useState(false)

  const allergy = type === 'ALLERGY'
  const choices = type === 'CHRONIC_CONDITION' ? CHRONIC_CONDITION_CHOICES : MEDICAL_HISTORY_CHOICES
  const sources = selfReport ? catalogs.sources.filter((s) => FAMILY_SOURCES.includes(s.name)) : catalogs.sources
  const freeText = allergy ? (manual ? text.trim() : '') : choice === OTHER ? text.trim() : choice

  useEffect(() => {
    onDirtyChange(!!(type || allergenId || text.trim() || choice || severityId || sourceId))
  }, [type, allergenId, text, choice, severityId, sourceId, onDirtyChange])

  function reset() {
    setAllergenId('')
    setManual(false)
    setChoice('')
    setText('')
    setSeverityId('')
    setErrors({})
    setDuplicate(false)
  }

  function validate() {
    const next = {}
    if (!type) next.type = 'Chọn loại mục'
    else if (allergy && !manual && !allergenId) next.content = 'Chọn dị nguyên'
    else if (!freeText && !(allergy && !manual))
      next.content = allergy ? 'Nhập tên dị nguyên' : 'Chọn hoặc nhập nội dung'
    if (allergy && !severityId) next.severityId = 'Chọn mức độ'
    if (!sourceId) next.sourceId = 'Chọn nguồn'
    return next
  }

  async function record(confirmDuplicate) {
    const next = validate()
    setErrors(next)
    setFailure(null)
    if (Object.keys(next).length > 0) return
    setBusy(true)
    try {
      const body = { type, sourceId: Number(sourceId) }
      if (allergy && !manual) body.allergenId = Number(allergenId)
      else body.freeText = freeText
      if (allergy) body.severityId = Number(severityId)
      const { data } = await postResidentsByIdHealthItems({
        path: { id: residentId },
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: { ...body, ...(confirmDuplicate && { confirmDuplicate: true }) },
      })
      reset()
      onRecorded(data.warnings ?? [])
    } catch (error) {
      if (error instanceof ApiError && error.problem?.errorCode === 'DUPLICATE_HEALTH_ITEM') setDuplicate(true)
      else setFailure(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="flex flex-col gap-4 rounded-[10px] border border-dashed border-input p-4"
      aria-busy={busy || undefined}
    >
      <p className="type-label">Thêm mục</p>
      <Choices
        label="Loại mục"
        required
        options={HEALTH_TYPE_ORDER.map((t) => [t, HEALTH_TYPE_LABELS[t]])}
        value={type}
        onChange={(next) => {
          setType(next)
          reset()
        }}
        error={errors.type}
      />
      {allergy && (
        <Field data-invalid={!!errors.content || undefined}>
          <FieldLabel htmlFor="health-allergen">
            Dị nguyên <span className="text-destructive">*</span>
          </FieldLabel>
          {manual ? (
            <>
              <Input
                id="health-allergen"
                className="h-11"
                maxLength={1000}
                placeholder="Tên dị nguyên"
                value={text}
                onChange={(e) => setText(e.target.value)}
                aria-invalid={!!errors.content || undefined}
              />
              <span className="type-caption text-warning-foreground">Không kiểm tra tự động với thuốc và món ăn</span>
            </>
          ) : (
            <div className="flex gap-2">
              <SearchSelect
                id="health-allergen"
                options={catalogs.allergens.map((a) => ({ value: String(a.id), label: a.name }))}
                value={allergenId}
                onChange={setAllergenId}
                placeholder="Tìm dị nguyên: thuốc, thực phẩm…"
                invalid={!!errors.content}
              />
              <Button type="button" variant="outline" className="h-11 shrink-0" onClick={() => setManual(true)}>
                Nhập tay
              </Button>
            </div>
          )}
          {errors.content && <FieldError>{errors.content}</FieldError>}
        </Field>
      )}
      {type && !allergy && (
        <Field data-invalid={!!errors.content || undefined}>
          <Choices
            label={HEALTH_TYPE_LABELS[type]}
            required
            options={[...choices.map((c) => [c, c]), [OTHER, 'Khác']]}
            value={choice}
            onChange={setChoice}
          />
          {choice === OTHER && (
            <Input
              aria-label={`${HEALTH_TYPE_LABELS[type]} khác`}
              className="h-11"
              maxLength={1000}
              placeholder="Gõ nội dung"
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-invalid={!!errors.content || undefined}
            />
          )}
          {errors.content && <FieldError>{errors.content}</FieldError>}
        </Field>
      )}
      {allergy && (
        <Choices
          label="Mức độ"
          required
          options={catalogs.severities.map((s) => [String(s.id), s.name])}
          value={severityId}
          onChange={setSeverityId}
          error={errors.severityId}
        />
      )}
      {type && (
        <Choices
          label="Nguồn"
          required
          options={sources.map((s) => [String(s.id), s.name])}
          value={sourceId}
          onChange={setSourceId}
          error={errors.sourceId}
        />
      )}
      <ProblemAlert problem={failure} />
      {duplicate && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-warning/15 px-3 py-2">
          <span className="type-body-sm">Đã có mục đang hiệu lực trùng nội dung</span>
          <Button type="button" variant="outline" className="h-10" onClick={() => record(true)}>
            Vẫn ghi mục này
          </Button>
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        className="h-11 self-start border-primary text-primary"
        disabled={busy}
        onClick={() => {
          setDuplicate(false)
          record(false)
        }}
      >
        {busy ? 'Đang ghi…' : 'Ghi mục'}
      </Button>
    </div>
  )
}

export function InitialHealthSheet({ residentId, residentName, allowedCommands = [], onClose, onDone }) {
  const [record, setRecord] = useState(undefined)
  const [etag, setEtag] = useState(null)
  const [form, setForm] = useState(formOf(null))
  const [blood, setBlood] = useState({ group: '', rh: '' })
  const [items, setItems] = useState([])
  const [catalogs, setCatalogs] = useState(null)
  const [warnings, setWarnings] = useState([])
  const [itemDirty, setItemDirty] = useState(false)
  const [failure, setFailure] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [changed, setChanged] = useState(false)

  const canWrite = allowedCommands.includes('WRITE_INITIAL_HEALTH_RECORD')
  const canConfirm = allowedCommands.includes('CONFIRM_INITIAL_HEALTH_RECORD')
  const canRecord = allowedCommands.includes('RECORD_HEALTH_ITEM')
  const canVerify = allowedCommands.includes('VERIFY_HEALTH_ITEM')
  const confirmed = !!record?.confirmed
  const editable = canWrite && !confirmed

  const loadItems = useCallback(async () => {
    try {
      const { data } = await getResidentsByIdHealthItems({ path: { id: residentId }, query: { status: 'ACTIVE' } })
      setItems(data ?? [])
    } catch {
      setItems([])
    }
  }, [residentId])

  useEffect(() => {
    let live = true
    getResidentsByIdInitialHealthRecord({ path: { id: residentId } })
      .then(({ data, etag: tag }) => {
        if (!live) return
        setRecord(data)
        setEtag(tag)
        setForm(formOf(data))
        setBlood(parseBlood(data.bloodType))
      })
      .catch((error) => {
        if (!live) return
        if (error instanceof ApiError && error.status === 404) setRecord(null)
        else setFailure(problemOf(error))
      })
    const query = { status: 'ACTIVE' }
    Promise.all([
      getCatalogsByType({ path: { type: CATALOG_TYPES.allergens }, query }),
      getCatalogsByType({ path: { type: CATALOG_TYPES.severities }, query }),
      getCatalogsByType({ path: { type: CATALOG_TYPES.sources }, query }),
    ])
      .then(
        ([allergens, severities, sources]) =>
          live && setCatalogs({ allergens: allergens.data, severities: severities.data, sources: sources.data }),
      )
      .catch((error) => live && setFailure(problemOf(error)))
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nạp mục sức khỏe khi mở khung
    loadItems()
    return () => {
      live = false
    }
  }, [residentId, loadItems])

  const original = formOf(record)
  const bloodValue = bloodText(blood.group, blood.rh) || form.bloodType
  const recordDirty =
    bloodValue !== original.bloodType ||
    [...GROUP_01, ...GROUP_02].some((name) => (form[name] ?? '') !== (original[name] ?? ''))
  const requestClose = () => (recordDirty || itemDirty ? setConfirmClose(true) : finish())
  const set = (name) => (value) => setForm((current) => ({ ...current, [name]: value }))

  function finish() {
    if (changed) onDone()
    else onClose()
  }

  async function save(event) {
    event.preventDefault()
    setFailure(null)
    setBusy(true)
    try {
      const body = Object.fromEntries(
        HEALTH_RECORD_FIELDS.map((f) => [f.name, blank(f.name === 'bloodType' ? bloodValue : form[f.name])]),
      )
      const { data, etag: tag } = await putResidentsByIdInitialHealthRecord({
        path: { id: residentId },
        headers: record ? { 'If-Match': etag } : {},
        body,
      })
      setRecord(data)
      setEtag(tag)
      setForm(formOf(data))
      setChanged(true)
      onDone('Đã lưu bản nháp hồ sơ sức khỏe ban đầu')
    } catch (error) {
      setFailure(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  async function confirm() {
    setFailure(null)
    setBusy(true)
    try {
      await postResidentsByIdInitialHealthRecordConfirm({ path: { id: residentId }, headers: { 'If-Match': etag } })
      onDone('Đã xác nhận hồ sơ sức khỏe ban đầu')
    } catch (error) {
      setFailure(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  const tray = (name) => (
    <ChoiceTray
      key={name}
      id={`health-${name}`}
      label={labelOf(name)}
      options={HEALTH_RECORD_CHOICES[name]}
      multiple
      value={form[name]}
      onChange={set(name)}
      placeholder={PLACEHOLDERS[name] ?? 'Bấm để chọn hoặc gõ'}
    />
  )

  return (
    <Sheet open onOpenChange={(next) => !next && requestClose()}>
      <SheetContent side="center" className="gap-0 p-0 sm:max-w-3xl">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 items-center gap-3 border-b px-6 pt-6 pb-4 pr-12">
            <SheetTitle className="type-title">{`Sức khỏe ban đầu của ${residentName}`}</SheetTitle>
            {record && <StatusBadge status={confirmed ? 'Đã xác nhận' : 'Bản nháp'} />}
          </div>

          <form
            id={FORM_ID}
            onSubmit={save}
            noValidate
            aria-busy={busy || undefined}
            className="flex min-h-0 flex-1 flex-col divide-y overflow-y-auto px-6"
          >
            {record === undefined && !failure ? (
              <p className="py-6 type-body-sm text-muted-foreground" aria-busy="true">
                Đang tải…
              </p>
            ) : (
              <>
                <div className="py-6">
                  <FieldSet disabled={busy || !editable}>
                    <FieldLegend className="type-label mb-4">01 · Tình trạng hiện tại</FieldLegend>
                    <div className="flex flex-col gap-5">
                      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                        <Choices
                          label="Nhóm máu"
                          options={BLOOD_GROUPS.map((g) => [g, g])}
                          value={blood.group}
                          onChange={(group) => setBlood((b) => ({ group, rh: group === 'Chưa rõ' ? '' : b.rh }))}
                        />
                        {blood.group && blood.group !== 'Chưa rõ' && (
                          <Choices
                            label="Rh"
                            options={RH.map((r) => [r, r])}
                            value={blood.rh}
                            onChange={(rh) => setBlood((b) => ({ ...b, rh }))}
                          />
                        )}
                      </div>
                      {GROUP_01.map(tray)}
                    </div>
                  </FieldSet>
                </div>

                <div className="py-6">
                  <FieldSet disabled={busy || !editable}>
                    <FieldLegend className="type-label mb-4">02 · Nhu cầu và thuốc</FieldLegend>
                    <div className="flex flex-col gap-5">{GROUP_02.map(tray)}</div>
                  </FieldSet>
                </div>
              </>
            )}

            <div className="py-6">
              <FieldSet>
                <FieldLegend className="type-label mb-4">03 · Dị ứng, bệnh nền, tiền sử bệnh</FieldLegend>
                <div className="flex flex-col gap-3">
                  <ItemList items={items} />
                  {warnings.length > 0 && (
                    <div className="rounded-lg bg-warning/15 px-3 py-2 type-body-sm" role="status">
                      {warnings.map((w) => (
                        <p key={w.code}>{w.description}</p>
                      ))}
                    </div>
                  )}
                  {canRecord && catalogs && (
                    <AddItem
                      residentId={residentId}
                      catalogs={catalogs}
                      selfReport={!canVerify}
                      onDirtyChange={setItemDirty}
                      onRecorded={(next) => {
                        setWarnings(next)
                        setChanged(true)
                        loadItems()
                      }}
                    />
                  )}
                </div>
              </FieldSet>
            </div>

            {failure && (
              <div className="py-6">
                <ProblemAlert problem={failure} />
              </div>
            )}
          </form>

          <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t px-6 py-4">
            <Button type="button" variant="outline" className="h-11" onClick={requestClose}>
              {editable ? 'Hủy' : 'Đóng'}
            </Button>
            {record && !confirmed && canConfirm && !recordDirty && (
              <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={confirm}>
                Xác nhận hồ sơ
              </Button>
            )}
            {editable && (
              <Button type="submit" form={FORM_ID} className="h-11" disabled={busy || record === undefined}>
                {busy ? 'Đang lưu…' : 'Lưu bản nháp'}
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
      <DiscardChangesDialog
        open={confirmClose}
        onKeep={() => setConfirmClose(false)}
        onDiscard={() => {
          setConfirmClose(false)
          finish()
        }}
      />
    </Sheet>
  )
}
