import { useEffect, useState } from 'react'
import {
  getContracts,
  getResidents,
  getResidentsById,
  getServices,
  postApprovalRequestsByIdSubmit,
  postResidencyChangeRequests,
  putResidencyChangeRequestsById,
} from '@/api'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { ProblemAlert } from '@/common/ProblemAlert'
import { StatusBadge } from '@/common/StatusBadge'
import { formatDate, formatDateTime } from '@/common/dateTime'
import { openFile, uploadFile } from '@/common/files'
import { usePermissions } from '@/common/permissions/permissions'
import { problemOf } from '@/common/problem'
import {
  CARE_LEVELS,
  CHANGE_TYPES,
  RESIDENCE_TYPES,
  SELECT,
  changeValueText,
  costItemLabel,
  labelOf,
  money,
  newKey,
  REQUEST_STATUS,
} from './admissionLabels'
import {
  CONFIRMATION_METHODS,
  EVIDENCE_ACCEPT,
  EVIDENCE_HINTS,
  NOTE_MAX,
  NOTE_SUGGESTIONS,
  REASON_SUGGESTIONS,
  WEEKDAYS,
  isoDate,
  requiredCompanions,
  tomorrowIso,
  validateChange,
  validateConfirmation,
} from './changeRequestRules'
import { Choices, Info, ReasonField } from './FormParts'

// Yêu cầu thay đổi lưu trú (004 T047; US5, FR-037 → FR-047). Lập, sửa ở Nháp; gửi duyệt ở màn này hoặc màn Yêu cầu phê
// duyệt (api-000). Giá trị trước và ảnh hưởng chi phí do hệ thống điền (FR-038). Yêu cầu do Hành chính hoặc Bác sĩ lập chỉ
// gửi Quản lý viện duyệt được khi Hành chính đã xác nhận với người đại diện, kèm bằng chứng (chủ dự án yêu cầu 2026-11-20).

// Tóm tắt xác nhận với người đại diện; recordedBy là tên ở api-004, là mã tài khoản trong nội dung thô của api-000
function confirmationText(c) {
  const by = typeof c.recordedBy === 'string' ? `, ghi bởi ${c.recordedBy}` : ''
  return `${labelOf(CONFIRMATION_METHODS, c.method)}, ngày ${formatDate(c.confirmedOn)}${by}`
}

// Nội dung thay đổi (trước, sau theo loại) và ảnh hưởng chi phí; dùng ở màn này và màn Yêu cầu phê duyệt (nội dung yêu cầu
// phê duyệt loại M02.RESIDENCY_CHANGE cùng các trường changeTypes, previousValue, newValue, costImpact).
export function ChangeContent({ content, headingClassName = 'type-card-title' }) {
  const types = content.changeTypes ?? []
  const confirmation = content.representativeConfirmation
  return (
    <>
      <section className="flex flex-col gap-2">
        <h3 className={headingClassName}>Nội dung thay đổi</h3>
        <ul className="flex flex-col gap-2">
          {types.map((type) => (
            <li key={type} className="flex flex-col">
              <span className="type-body-sm">{labelOf(CHANGE_TYPES, type)}</span>
              <span className="type-caption text-muted-foreground">
                {`Trước: ${changeValueText(type, content.previousValue)}; sau: ${changeValueText(type, content.newValue)}`}
              </span>
            </li>
          ))}
        </ul>
      </section>
      {content.costImpact?.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className={headingClassName}>Ảnh hưởng chi phí</h3>
          <ul className="flex flex-col gap-1">
            {content.costImpact.map((c) => (
              <li key={c.item} className="type-body-sm tabular-nums">
                {`${costItemLabel(c.item)}: ${money(c.previousUnitPrice)} → ${money(c.newUnitPrice)}`}
              </li>
            ))}
          </ul>
        </section>
      )}
      {confirmation && (
        <section className="flex flex-col gap-1">
          <h3 className={headingClassName}>Xác nhận với người đại diện</h3>
          <p className="type-body-sm">{confirmationText(confirmation)}</p>
          {confirmation.note && <p className="type-caption text-muted-foreground">{confirmation.note}</p>}
          {confirmation.evidenceFileId && (
            <Button
              variant="outline"
              className="h-11 self-start"
              onClick={() => openFile(confirmation.evidenceFileId).catch(() => {})}
            >
              Xem bằng chứng
            </Button>
          )}
        </section>
      )}
    </>
  )
}

export function ChangeRequestView({ request, etag, canUpdate, canConfirm, onEdit, onReload, onSubmitted }) {
  const [contractName, setContractName] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)

  useEffect(() => {
    let cancelled = false
    if (!canConfirm) return
    getContracts({ query: {} })
      .then(({ data }) => {
        const contract = data.find((c) => c.id === request.contractId)
        if (!contract) return
        return getResidentsById({ path: { id: contract.residentId } }).then(({ data: r }) => {
          if (!cancelled) setContractName(`${r.personalInfo?.fullName ?? ''}, ${contract.contractNumber}`)
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [request.contractId, canConfirm])

  const draft = request.status === 'DRAFT'
  const needsConfirmation = request.representativeConfirmationRequired && !request.representativeConfirmation

  async function submit() {
    setBusy(true)
    setFailure(null)
    try {
      await postApprovalRequestsByIdSubmit({
        path: { id: request.approvalRequestId },
        headers: { 'If-Match': etag },
        body: {},
      })
      onSubmitted?.('Đã gửi Quản lý viện duyệt', request.approvalRequestId)
    } catch (e) {
      setFailure(problemOf(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
      <div className="flex flex-col gap-1">
        <StatusBadge status={REQUEST_STATUS[request.status] ?? request.status} />
        <h2 className="type-title">{contractName || `Hợp đồng mã ${request.contractId}`}</h2>
        <p className="type-body-sm text-muted-foreground">
          {`Ngày hiệu lực mong muốn ${formatDate(request.requestedEffectiveDate)}${request.requestedBy ? `, lập bởi ${request.requestedBy}` : ''}`}
        </p>
      </div>
      <Info label="Lý do">{request.reason}</Info>
      <ChangeContent content={request} />
      {request.representativeConfirmation?.recordedAt && (
        <p className="type-caption text-muted-foreground">
          {`Ghi xác nhận lúc ${formatDateTime(request.representativeConfirmation.recordedAt)}`}
        </p>
      )}

      {request.minorChange && <p className="type-body-sm">Thay đổi nhỏ: Hành chính duyệt được.</p>}
      {draft && needsConfirmation && (
        <p className="type-body-sm text-destructive">
          {canConfirm
            ? 'Chưa xác nhận với người đại diện: xác nhận, đính kèm bằng chứng rồi mới gửi Quản lý viện duyệt được.'
            : 'Yêu cầu đã chuyển Hành chính: Hành chính xác nhận với người đại diện, đính kèm bằng chứng rồi gửi Quản lý viện duyệt.'}
        </p>
      )}
      {draft && request.representativeConfirmationRequired === false && (
        <p className="type-body-sm">Người đại diện tự gửi qua cổng: không cần xác nhận thêm, Hành chính hoàn thiện rồi gửi duyệt.</p>
      )}
      {request.addendumId && <p className="type-body-sm">{`Đã tạo phụ lục mã ${request.addendumId}.`}</p>}
      <p className="type-caption text-muted-foreground">{`Yêu cầu phê duyệt mã ${request.approvalRequestId}.`}</p>
      <ProblemAlert problem={failure} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" className="h-11" onClick={onReload}>
          Tải lại
        </Button>
        {draft && canUpdate && canConfirm && needsConfirmation && (
          <Button className="h-11" onClick={() => onEdit(request)}>
            Xác nhận với người đại diện
          </Button>
        )}
        {draft && canUpdate && !(canConfirm && needsConfirmation) && (
          <Button variant="outline" className="h-11" onClick={() => onEdit(request)}>
            Sửa yêu cầu nháp
          </Button>
        )}
        {draft && canUpdate && !needsConfirmation && (
          <Button className="h-11" disabled={busy || !etag} onClick={submit}>
            Gửi duyệt
          </Button>
        )}
      </div>
    </div>
  )
}

const ARRIVAL_ROW = { dayOfWeek: 1, arrivalTime: '07:30', departureTime: '17:00' }

export function ChangeRequestSheet({ request, etag, onClose, onDone }) {
  const editing = !!request
  const [contracts, setContracts] = useState([])
  const [names, setNames] = useState({})
  const [catalog, setCatalog] = useState([])
  // Phụ lục 27: trong những người lập được yêu cầu, chỉ Bác sĩ không xem được hợp đồng; Bác sĩ chọn người cao tuổi và chỉ
  // lập yêu cầu đổi mức chăm sóc (FR-039). Hành chính xác nhận với người đại diện, kèm bằng chứng (2026-11-20)
  const { status: permissionStatus, can } = usePermissions()
  const seesContracts = can('ADMISSION_CONTRACT_DEPOSIT', 'VIEW')
  const [residents, setResidents] = useState([])
  const [residentId, setResidentId] = useState(request?.residentId ? String(request.residentId) : '')
  const [contractId, setContractId] = useState(request ? String(request.contractId) : '')
  const [types, setTypes] = useState(request?.changeTypes ?? [])
  const [value, setValue] = useState(request?.newValue ?? {})
  const [date, setDate] = useState(request?.requestedEffectiveDate ?? '')
  const [reason, setReason] = useState(request?.reason ?? '')
  const previous = request?.representativeConfirmation
  const [confirmed, setConfirmed] = useState(!!previous)
  const [method, setMethod] = useState(previous?.method ?? 'IN_PERSON')
  const [confirmedOn, setConfirmedOn] = useState(previous?.confirmedOn ?? isoDate())
  const [evidence, setEvidence] = useState(null)
  const [note, setNote] = useState(previous?.note ?? '')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)

  useEffect(() => {
    if (permissionStatus === 'loading') return
    if (!seesContracts) {
      getResidents({ query: { status: 'IN_RESIDENCE' } })
        .then(({ data }) => setResidents(data.items ?? data))
        .catch((e) => setFailure(problemOf(e)))
      return
    }
    getContracts({ query: { status: ['ACTIVE'] } })
      .then(({ data }) => {
        const active = data.filter((c) => c.status === 'ACTIVE')
        setContracts(active)
        for (const c of active)
          getResidentsById({ path: { id: c.residentId } })
            .then(({ data: r }) => setNames((n) => ({ ...n, [c.residentId]: r.personalInfo?.fullName })))
            .catch(() => {})
      })
      .catch((e) => setFailure(problemOf(e)))
    getServices({ query: {} })
      .then(({ data }) => setCatalog(data.filter((s) => s.status === 'ACTIVE')))
      .catch(() => {})
  }, [permissionStatus, seesContracts])

  const activeTypes = seesContracts ? types : ['CARE_LEVEL']
  const contract = contracts.find((c) => String(c.id) === contractId)
  const contractServiceIds = new Set((contract?.services ?? []).map((s) => s.serviceId))

  const set = (patch) => setValue((v) => ({ ...v, ...patch }))
  const toggleType = (type) => setTypes((t) => (t.includes(type) ? t.filter((x) => x !== type) : [...t, type]))
  const pickedServices = value.services ?? []
  const lineOf = (id) => pickedServices.find((s) => s.serviceId === id)
  const toggleService = (id) =>
    set({
      services: lineOf(id)
        ? pickedServices.filter((s) => s.serviceId !== id)
        : [...pickedServices, { serviceId: id, action: contractServiceIds.has(id) ? 'REMOVE' : 'ADD', inPackage: false }],
    })
  const setLine = (id, patch) =>
    set({ services: pickedServices.map((s) => (s.serviceId === id ? { ...s, ...patch } : s)) })
  const setRow = (i, patch) =>
    set({ arrivalSchedule: (value.arrivalSchedule ?? []).map((r, j) => (j === i ? { ...r, ...patch } : r)) })

  const changeErrors = validateChange({ types: activeTypes, value, date, contract })
  const confirmationErrors =
    seesContracts && confirmed
      ? validateConfirmation({ method, confirmedOn, file: evidence, existingFileId: previous?.evidenceFileId, note })
      : {}
  const errors = {
    contract: seesContracts ? !contractId && 'Chọn hợp đồng' : !residentId && 'Chọn người cao tuổi',
    ...changeErrors,
    reason: !reason.trim() && 'Nhập lý do',
    ...Object.fromEntries(Object.entries(confirmationErrors).map(([k, v]) => [`confirmation.${k}`, v])),
  }
  const shown = (key) => (submitted ? errors[key] || null : null)
  const companions = activeTypes.includes('RESIDENCE_TYPE')
    ? requiredCompanions(contract?.residenceType, value.residenceType)
    : []
  const reasonSuggestion = REASON_SUGGESTIONS[activeTypes[0]]

  async function save() {
    setSubmitted(true)
    if (Object.values(errors).some(Boolean)) return
    setBusy(true)
    setFailure(null)
    // Chỉ gửi phần giá trị mới của các loại đã chọn
    const keep = {
      RESIDENCE_TYPE: ['residenceType'],
      CARE_LEVEL: ['careLevel'],
      DURATION: ['endDate'],
      BED: ['newBedId'],
      SERVICE: ['services'],
      ARRIVAL_SCHEDULE: ['arrivalSchedule'],
    }
    const newValue = {}
    for (const type of activeTypes)
      for (const key of keep[type]) if (value[key] !== undefined) newValue[key] = value[key]
    const body = {
      ...(seesContracts ? { contractId: Number(contractId) } : { residentId: Number(residentId) }),
      changeTypes: activeTypes,
      newValue,
      requestedEffectiveDate: date,
      reason: reason.trim(),
    }
    try {
      if (seesContracts && confirmed) {
        const evidenceFileId = evidence ? await uploadFile(evidence) : previous?.evidenceFileId
        body.representativeConfirmation = {
          method,
          confirmedOn,
          evidenceFileId,
          ...(note.trim() ? { note: note.trim() } : {}),
        }
      }
      if (editing) {
        await putResidencyChangeRequestsById({
          path: { id: request.approvalRequestId },
          headers: { ...newKey(), 'If-Match': etag },
          body,
        })
        onDone('Đã sửa yêu cầu nháp', request.approvalRequestId)
      } else {
        const { data } = await postResidencyChangeRequests({ headers: newKey(), body })
        onDone('Đã lập yêu cầu thay đổi lưu trú ở Nháp', data.approvalRequestId)
      }
    } catch (e) {
      setFailure(problemOf(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto p-6 sm:max-w-lg">
        <SheetTitle>{editing ? 'Sửa yêu cầu thay đổi lưu trú' : 'Lập yêu cầu thay đổi lưu trú'}</SheetTitle>
        <SheetDescription>
          {seesContracts
            ? 'Yêu cầu ở Nháp; giá trị trước và ảnh hưởng chi phí do hệ thống điền khi lưu. Xác nhận với người đại diện trước khi gửi Quản lý viện duyệt.'
            : 'Yêu cầu ở Nháp và chuyển Hành chính xác nhận với người đại diện trước khi gửi Quản lý viện duyệt.'}
        </SheetDescription>
        <FieldGroup className="mt-4">
          {!seesContracts && (
            <Field data-invalid={!!shown('contract') || undefined}>
              <FieldLabel htmlFor="change-resident">Người cao tuổi</FieldLabel>
              <select
                id="change-resident"
                className={SELECT}
                value={residentId}
                disabled={editing}
                onChange={(e) => setResidentId(e.target.value)}
              >
                <option value="">Người cao tuổi đang lưu trú</option>
                {residents.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.personalInfo?.fullName ?? `Mã ${r.id}`}
                  </option>
                ))}
              </select>
              {shown('contract') && <FieldError>{shown('contract')}</FieldError>}
            </Field>
          )}
          {seesContracts && (
            <Field data-invalid={!!shown('contract') || undefined}>
              <FieldLabel htmlFor="change-contract">Hợp đồng</FieldLabel>
              <select
                id="change-contract"
                className={SELECT}
                value={contractId}
                disabled={editing}
                onChange={(e) => setContractId(e.target.value)}
              >
                <option value="">Hợp đồng đang hiệu lực</option>
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {`${names[c.residentId] ?? `Mã ${c.residentId}`}, ${c.contractNumber}`}
                  </option>
                ))}
              </select>
              {contract && (
                <FieldDescription>
                  {[
                    contract.residenceType && `Hiện tại: ${labelOf(RESIDENCE_TYPES, contract.residenceType)}`,
                    contract.careLevel && `mức ${labelOf(CARE_LEVELS, contract.careLevel)}`,
                    contract.startDate && `bắt đầu ${formatDate(contract.startDate)}`,
                    (contract.currentEndDate ?? contract.endDate) &&
                      `kết thúc ${formatDate(contract.currentEndDate ?? contract.endDate)}`,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </FieldDescription>
              )}
              {shown('contract') && <FieldError>{shown('contract')}</FieldError>}
            </Field>
          )}

          {seesContracts && (
            <Field data-invalid={!!shown('types') || undefined}>
              <FieldLabel>Loại thay đổi</FieldLabel>
              <div className="flex flex-col gap-2">
                {CHANGE_TYPES.map(([code, text]) => (
                  <label key={code} className="flex items-center gap-2 type-body-sm">
                    <input type="checkbox" checked={types.includes(code)} onChange={() => toggleType(code)} />
                    {text}
                  </label>
                ))}
              </div>
              {shown('types') && <FieldError>{shown('types')}</FieldError>}
            </Field>
          )}

          {activeTypes.includes('RESIDENCE_TYPE') && (
            <>
              <Choices
                label="Loại lưu trú mới"
                options={RESIDENCE_TYPES}
                value={value.residenceType ?? ''}
                onChange={(v) => set({ residenceType: v })}
                error={shown('residenceType')}
              />
              {companions.length > 0 && (
                <FieldDescription>
                  {`Loại này cần chọn kèm: ${companions
                    .map((t) => labelOf(CHANGE_TYPES, t))
                    .join(', ')} (kiểm khi duyệt).`}
                </FieldDescription>
              )}
            </>
          )}
          {activeTypes.includes('CARE_LEVEL') && (
            <Choices
              label="Mức chăm sóc mới"
              options={CARE_LEVELS}
              value={value.careLevel ?? ''}
              onChange={(v) => set({ careLevel: v })}
              error={shown('careLevel')}
            />
          )}
          {activeTypes.includes('DURATION') && (
            <Field data-invalid={!!shown('endDate') || undefined}>
              <FieldLabel htmlFor="change-end">Ngày kết thúc mới</FieldLabel>
              <Input
                id="change-end"
                type="date"
                className="h-11"
                min={date || undefined}
                value={value.endDate ?? ''}
                onChange={(e) => set({ endDate: e.target.value })}
              />
              {shown('endDate') && <FieldError>{shown('endDate')}</FieldError>}
            </Field>
          )}
          {activeTypes.includes('BED') && (
            <Field data-invalid={!!shown('newBedId') || undefined}>
              <FieldLabel htmlFor="change-bed">Mã giường mới</FieldLabel>
              <Input
                id="change-bed"
                type="number"
                min="1"
                step="1"
                className="h-11"
                value={value.newBedId ?? ''}
                onChange={(e) => set({ newBedId: e.target.value === '' ? undefined : Number(e.target.value) })}
              />
              <FieldDescription>Giường phải trống và hợp mức chăm sóc; kiểm khi duyệt.</FieldDescription>
              {shown('newBedId') && <FieldError>{shown('newBedId')}</FieldError>}
            </Field>
          )}
          {activeTypes.includes('SERVICE') && (
            <Field data-invalid={!!shown('services') || undefined}>
              <FieldLabel>Dịch vụ thêm hoặc bớt</FieldLabel>
              <FieldDescription>
                Dịch vụ đang có trong hợp đồng thì chọn để bớt; dịch vụ khác thì chọn để thêm. Chỉ thêm, bớt dịch vụ thuộc gói
                (không đổi giá) là thay đổi nhỏ.
              </FieldDescription>
              {catalog.map((s) => {
                const line = lineOf(s.id)
                const inContract = contractServiceIds.has(s.id)
                return (
                  <div key={s.id} className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 type-body-sm">
                      <input type="checkbox" checked={!!line} onChange={() => toggleService(s.id)} />
                      {`${inContract ? 'Bớt' : 'Thêm'} ${s.name}`}
                    </label>
                    {line?.action === 'ADD' && (
                      <label className="flex items-center gap-2 type-caption text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={!!line.inPackage}
                          onChange={(e) => setLine(s.id, { inPackage: e.target.checked })}
                        />
                        Thuộc gói
                      </label>
                    )}
                  </div>
                )
              })}
              {shown('services') && <FieldError>{shown('services')}</FieldError>}
            </Field>
          )}
          {activeTypes.includes('ARRIVAL_SCHEDULE') && (
            <Field data-invalid={!!shown('arrivalSchedule') || undefined}>
              <FieldLabel>Lịch đến theo tuần</FieldLabel>
              {(value.arrivalSchedule ?? []).map((row, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label={`Thứ dòng ${i + 1}`}
                    className={`${SELECT} w-32`}
                    value={row.dayOfWeek ?? ''}
                    onChange={(e) => setRow(i, { dayOfWeek: Number(e.target.value) })}
                  >
                    {WEEKDAYS.map(([d, text]) => (
                      <option key={d} value={d}>
                        {text}
                      </option>
                    ))}
                  </select>
                  <Input
                    aria-label={`Giờ đến dòng ${i + 1}`}
                    type="time"
                    className="h-11 w-32"
                    value={row.arrivalTime ?? ''}
                    onChange={(e) => setRow(i, { arrivalTime: e.target.value })}
                  />
                  <Input
                    aria-label={`Giờ về dòng ${i + 1}`}
                    type="time"
                    className="h-11 w-32"
                    value={row.departureTime ?? ''}
                    onChange={(e) => setRow(i, { departureTime: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    className="h-11"
                    onClick={() => set({ arrivalSchedule: value.arrivalSchedule.filter((_, j) => j !== i) })}
                  >
                    Bỏ dòng
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                className="h-11 self-start"
                onClick={() => {
                  const rows = value.arrivalSchedule ?? []
                  const last = rows[rows.length - 1]
                  // Gợi ý dòng mới: ngày kế tiếp, cùng giờ với dòng trước
                  set({
                    arrivalSchedule: [
                      ...rows,
                      last ? { ...last, dayOfWeek: (last.dayOfWeek % 7) + 1 } : { ...ARRIVAL_ROW },
                    ],
                  })
                }}
              >
                Thêm dòng lịch
              </Button>
              {shown('arrivalSchedule') && <FieldError>{shown('arrivalSchedule')}</FieldError>}
            </Field>
          )}

          <Field data-invalid={!!shown('date') || undefined}>
            <FieldLabel htmlFor="change-date">Ngày hiệu lực mong muốn</FieldLabel>
            <Input
              id="change-date"
              type="date"
              className="h-11"
              min={contract?.startDate || undefined}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <FieldDescription>
              Duyệt muộn hơn ngày này thì thay đổi tính từ ngày duyệt, không tính lùi.{' '}
              <button type="button" className="underline underline-offset-4" onClick={() => setDate(tomorrowIso())}>
                {`Dùng ngày mai (${formatDate(tomorrowIso())})`}
              </button>
            </FieldDescription>
            {shown('date') && <FieldError>{shown('date')}</FieldError>}
          </Field>
          <ReasonField id="change-reason" value={reason} onChange={setReason} error={shown('reason')} />
          {reasonSuggestion && !reason.trim() && (
            <Button variant="outline" className="h-11 self-start" onClick={() => setReason(reasonSuggestion)}>
              {`Gợi ý lý do: ${reasonSuggestion}`}
            </Button>
          )}

          {seesContracts && (
            <fieldset className="flex flex-col gap-4 rounded-xl border p-4">
              <legend className="px-1 type-card-title">Xác nhận với người đại diện</legend>
              <label className="flex items-center gap-2 type-body-sm">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                Đã xác nhận nội dung thay đổi với người đại diện
              </label>
              {!confirmed && (
                <FieldDescription>
                  Lưu được nháp khi chưa xác nhận, nhưng chưa gửi Quản lý viện duyệt được. Sửa nội dung sau khi xác nhận thì
                  phải xác nhận lại.
                </FieldDescription>
              )}
              {confirmed && (
                <>
                  <Choices
                    label="Cách xác nhận"
                    options={CONFIRMATION_METHODS}
                    value={method}
                    onChange={setMethod}
                    error={shown('confirmation.method')}
                  />
                  <Field data-invalid={!!shown('confirmation.confirmedOn') || undefined}>
                    <FieldLabel htmlFor="change-confirmed-on">Ngày xác nhận</FieldLabel>
                    <Input
                      id="change-confirmed-on"
                      type="date"
                      className="h-11"
                      max={isoDate()}
                      value={confirmedOn}
                      onChange={(e) => setConfirmedOn(e.target.value)}
                    />
                    {shown('confirmation.confirmedOn') && <FieldError>{shown('confirmation.confirmedOn')}</FieldError>}
                  </Field>
                  <Field data-invalid={!!shown('confirmation.evidence') || undefined}>
                    <FieldLabel htmlFor="change-evidence">Bằng chứng xác nhận</FieldLabel>
                    <Input
                      id="change-evidence"
                      type="file"
                      accept={EVIDENCE_ACCEPT}
                      className="h-11"
                      onChange={(e) => setEvidence(e.target.files?.[0] ?? null)}
                    />
                    <FieldDescription>
                      {`${EVIDENCE_HINTS[method] ?? ''} PDF, JPG hoặc PNG, tối đa 10 MB.${
                        previous?.evidenceFileId && !evidence ? ' Đã đính kèm; chọn tệp khác để thay.' : ''
                      }`}
                    </FieldDescription>
                    {shown('confirmation.evidence') && <FieldError>{shown('confirmation.evidence')}</FieldError>}
                  </Field>
                  <Field data-invalid={!!shown('confirmation.note') || undefined}>
                    <FieldLabel htmlFor="change-confirmation-note">Ghi chú xác nhận</FieldLabel>
                    <Textarea
                      id="change-confirmation-note"
                      rows={2}
                      maxLength={NOTE_MAX}
                      placeholder={NOTE_SUGGESTIONS[method]}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <FieldDescription>{`${note.length}/${NOTE_MAX} ký tự`}</FieldDescription>
                    {!note.trim() && (
                      <Button
                        variant="outline"
                        className="h-11 self-start"
                        onClick={() => setNote(NOTE_SUGGESTIONS[method] ?? '')}
                      >
                        Dùng ghi chú gợi ý
                      </Button>
                    )}
                    {shown('confirmation.note') && <FieldError>{shown('confirmation.note')}</FieldError>}
                  </Field>
                </>
              )}
            </fieldset>
          )}
        </FieldGroup>
        <div className="mt-4">
          <ProblemAlert problem={failure} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" className="h-11" onClick={onClose}>
            Đóng
          </Button>
          <Button className="h-11" disabled={busy || (editing && !etag)} onClick={save}>
            Lưu yêu cầu
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
