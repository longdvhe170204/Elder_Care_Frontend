import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { getStaff } from '@/api'
import { ProblemAlert } from '@/common/ProblemAlert'
import { formatDateTime } from '@/common/dateTime'
import { usePermissions } from '@/common/permissions/permissions'
import { problemOf } from '@/common/problem'
import { PrescriptionSheet } from './PrescriptionSheet'
import { idempotencyKeys } from './prescriptions'
import { issueText } from './prescriptionView'
import {
  cancelReconciliation,
  confirmCorrection,
  confirmReconciliation,
  createReconciliation,
  getReconciliation,
  listReconciliations,
  loadReconciliationSources,
  proposeCorrection,
  returnCorrection,
  returnReconciliation,
  saveItems,
  saveReconciliationDraft,
  submitReconciliation,
  updateReconciliationNotes,
} from './reconciliationApi'
import {
  DECISIONS,
  NURSE_FINDINGS,
  needsPrescription,
  REASONS,
  SOURCES,
  STATUS,
  activeTicket,
  buildAutoRows,
  formatComparisonSummary,
  itemErrors,
  itemsBody,
} from './reconciliationView'

// Phiếu đối chiếu thuốc của một người cao tuổi (spec 006 User Story 4; FR-034 → FR-039; 006 T072). Bác sĩ hoặc Điều
// dưỡng lập phiếu, tự thêm từng dòng và quyết định; hệ thống không tạo sẵn dòng, không có nút chép từ hồ sơ (Q-306,
// Q-307): "thuốc đang dùng khi tiếp nhận" chỉ hiện để đọc. Nút lệnh theo allowedCommands của phiếu (DESIGN.md 7.4);
// đủ dòng, quy tắc hai người, quyền kê đơn do backend kiểm và trả lỗi trong khung. Xác nhận, trả lại đề nghị đính chính
// để sau (chủ dự án 2026-11-18: hợp đồng chưa trả id của đề nghị).

const WORKING = ['OPEN', 'PENDING_CONFIRMATION']

// Tên người lập, gửi, xác nhận theo danh sách nhân viên người xem được (api-008, thường là người cùng ca); không tra được
// thì giữ mã tài khoản (api-006 chỉ trả mã)
function useStaffName() {
  const [names, setNames] = useState({})
  useEffect(() => {
    let live = true
    getStaff({ query: { status: 'WORKING' } })
      .then(
        ({ data }) =>
          live &&
          setNames(
            Object.fromEntries(
              (data ?? []).filter((s) => s.accountId != null).map((s) => [String(s.accountId), s.fullName]),
            ),
          ),
      )
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])
  return (accountId) => (accountId ? (names[String(accountId)] ?? `tài khoản mã ${accountId}`) : null)
}

export function ReconciliationPanel({
  residentId,
  residentName,
  defaultReason = 'HOSPITAL_RETURN',
  isDoctor = false,
  onChanged,
}) {
  const { can } = usePermissions()
  const [tickets, setTickets] = useState(null)
  const [sources, setSources] = useState(null)
  const [problem, setProblem] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [ticketFilter, setTicketFilter] = useState('ALL')
  const [announcement, setAnnouncement] = useState('')
  // Tăng sau mỗi lệnh thành công để khung chi tiết đọc lại phiếu (trạng thái, đề nghị đính chính mới)
  const [revision, setRevision] = useState(0)

  const load = useCallback(async () => {
    try {
      const list = await listReconciliations(residentId)
      setTickets(list)
      setSelectedId((current) => {
        const working = activeTicket(list)
        if (working) {
          if (working.status === 'DRAFT' && current !== working.id) return null
          return working.id
        }
        if (list.some((t) => t.id === current)) return current
        return [...list].sort((a, b) => b.id - a.id)[0]?.id ?? null
      })
      setProblem(null)
    } catch (error) {
      setTickets([])
      setProblem(problemOf(error))
    }
  }, [residentId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tải phiếu khi mở khung
    load()
    loadReconciliationSources(residentId).then(setSources, () =>
      setSources({ prescriptions: [], medications: [], resident: null, admissionMedications: null }),
    )
  }, [load, residentId])

  async function changed(message) {
    setAnnouncement(message)
    onChanged?.(message)
    await load()
    setRevision((n) => n + 1)
  }

  if (!tickets) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  const working = activeTicket(tickets)
  const sortedTickets = [...tickets].sort((a, b) => b.id - a.id)
  const draftCount = tickets.filter((t) => t.status === 'DRAFT').length
  const pendingCount = tickets.filter((t) => t.status === 'PENDING_CONFIRMATION').length
  const confirmedCount = tickets.filter((t) => t.status === 'CONFIRMED').length
  const overdueCount = tickets.filter((t) => t.overdue && WORKING.includes(t.status)).length
  const returnedCount = tickets.filter((t) => t.status === 'OPEN' && Boolean(t.returnReason)).length
  const filteredTickets = sortedTickets.filter((t) => {
    if (ticketFilter === 'DRAFT') return t.status === 'DRAFT'
    if (ticketFilter === 'PENDING_CONFIRMATION') return t.status === 'PENDING_CONFIRMATION'
    if (ticketFilter === 'RETURNED') return t.status === 'OPEN' && Boolean(t.returnReason)
    if (ticketFilter === 'CONFIRMED') return t.status === 'CONFIRMED'
    if (ticketFilter === 'OVERDUE') return Boolean(t.overdue && WORKING.includes(t.status))
    return true
  })
  const filterTabs = isDoctor
    ? [
      ['ALL', 'Tất cả', tickets.length],
      ['DRAFT', 'Bản nháp', draftCount],
      ['PENDING_CONFIRMATION', 'Chờ xác nhận', pendingCount],
      ['CONFIRMED', 'Đã xong', confirmedCount],
      ['OVERDUE', 'Quá hạn xử lý', overdueCount],
    ]
    : [
      ['ALL', 'Tất cả', tickets.length],
      ['PENDING_CONFIRMATION', 'Chờ BS xác nhận', pendingCount],
      ['RETURNED', 'Bị trả lại', returnedCount],
      ['CONFIRMED', 'Đã xong', confirmedCount],
      ['OVERDUE', 'Quá hạn xử lý', overdueCount],
    ]

  async function handleDraftSaved(message) {
    setAnnouncement(message)
    onChanged?.(message)
    setSelectedId(null)
    setTicketFilter('DRAFT')
    await load()
    setRevision((n) => n + 1)
  }

  return (
    <div className="flex flex-col gap-5">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <ProblemAlert problem={problem} />

      {sources?.admissionMedications !== undefined && (
        <section aria-labelledby="admission-medications" className="flex flex-col gap-1.5 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <h3 id="admission-medications" className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Thuốc đang dùng khi tiếp nhận (hồ sơ sức khỏe ban đầu)
          </h3>
          <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
            {sources.admissionMedications === null
              ? 'Chưa đọc được hồ sơ sức khỏe ban đầu.'
              : sources.admissionMedications || 'Hồ sơ chưa ghi thuốc đang dùng.'}
          </p>
          <p className="text-[11px] text-slate-400">
            Chỉ để đối chiếu; người thực hiện tự thêm một dòng cho mỗi thuốc.
          </p>
        </section>
      )}

      {!working && can('MEDICATION_RECONCILIATION', 'CREATE') && (
        <CreateTicket
          residentId={residentId}
          residentName={residentName}
          isDoctor={isDoctor}
          defaultReason={defaultReason}
          sources={sources}
          onDone={changed}
        />
      )}

      {tickets.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/90 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          {filterTabs.map(([key, label, total]) => {
            const active = ticketFilter === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setTicketFilter(key)
                  if (key !== 'ALL') setSelectedId(null)
                }}
                className={
                  active
                    ? 'inline-flex items-center gap-1.5 rounded-full bg-[#24496f] px-3.5 py-1.5 text-xs font-bold text-white shadow-xs'
                    : 'inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }
              >
                <span>{label}</span>
                <span className={active ? 'rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]' : 'rounded-full bg-slate-200/80 px-1.5 py-0.5 text-[10px] text-slate-700'}>
                  {total}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {!working && tickets.length === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-center text-xs text-slate-500 shadow-xs dark:border-slate-800 dark:bg-slate-900">{`${residentName} chưa có phiếu đối chiếu thuốc.`}</p>
      )}

      {tickets.length > 0 && filteredTickets.length === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-center text-xs text-slate-500 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          Không có phiếu nào trong mục này.
        </p>
      )}

      {filteredTickets.length > 0 && (ticketFilter !== 'ALL' || !selectedId) && (
        <div className="flex flex-col gap-2.5">
          {filteredTickets.map((t) => {
            const isOpened = selectedId === t.id
            return (
              <div
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex flex-col gap-1 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {`Phiếu #${t.id} · ${REASONS[t.reason] ?? t.reason}`}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                      {STATUS[t.status] ?? t.status}
                    </span>
                    {t.overdue && WORKING.includes(t.status) && (
                      <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-700">
                        Quá hạn xử lý
                      </span>
                    )}
                  </div>
                  <span className="text-muted-foreground">
                    {[
                      t.facilityName && `Cơ sở: ${t.facilityName}`,
                      t.prescriberName && `BS kê: ${t.prescriberName}`,
                      t.deadlineAt && WORKING.includes(t.status) && `Hạn: ${formatDateTime(t.deadlineAt)}`,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Chưa ghi thông tin đơn ngoài'}
                  </span>
                </div>
                <Button
                  type="button"
                  variant={isOpened ? 'outline' : 'default'}
                  className={isOpened ? 'h-9 rounded-xl text-xs font-semibold' : 'h-9 rounded-xl bg-[#24496f] hover:bg-[#193552] text-white text-xs font-bold'}
                  onClick={() => setSelectedId(isOpened ? null : t.id)}
                >
                  {isOpened ? 'Thu gọn' : WORKING.includes(t.status) ? 'Tiếp tục xử lý' : 'Xem chi tiết'}
                </Button>
              </div>
            )
          })}
        </div>
      )}

      {selectedId && (
        <TicketDetail
          key={`${selectedId}:${revision}`}
          id={selectedId}
          sources={sources}
          residentId={residentId}
          residentName={residentName}
          isDoctor={isDoctor}
          onChanged={changed}
          onDraftSaved={handleDraftSaved}
          onCloseDetail={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}

const COMPARISON_SOURCE_PRESETS = [
  'Đơn thuốc ra viện',
  'Đơn thuốc phòng khám ngoài',
  'Đơn thuốc bệnh viện tuyến tỉnh/TW',
  'Sổ khám bệnh định kỳ',
  'Thuốc gia đình mang đến',
]

function CreateTicket({ residentId, residentName, isDoctor, defaultReason, sources, onDone }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState(defaultReason)
  const [detail, setDetail] = useState('')
  const [facilityName, setFacilityName] = useState('')
  const [prescriberName, setPrescriberName] = useState('')
  const [prescribedAt, setPrescribedAt] = useState('')
  const [comparisonSource, setComparisonSource] = useState('Đơn thuốc ra viện')
  const [attachmentName, setAttachmentName] = useState('')
  const [nurseNote, setNurseNote] = useState('')
  const [rows, setRows] = useState(() => buildAutoRows(sources?.prescriptions ?? [], sources?.medications ?? []))
  const [submitted, setSubmitted] = useState(false)
  const [problem, setProblem] = useState(null)
  const [saving, setSaving] = useState(false)
  const keyFor = useRef(idempotencyKeys()).current
  const detailMissing = reason === 'PROFESSIONAL_REQUEST' && !detail.trim()

  if (!open)
    return (
      <div>
        <Button
          className="h-10 gap-1.5 rounded-xl bg-[#24496f] hover:bg-[#193552] text-white px-4 text-xs font-bold shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
          onClick={() => {
            if (!isDoctor) {
              setRows(buildAutoRows(sources?.prescriptions ?? [], sources?.medications ?? []))
            }
            setOpen(true)
          }}
        >
          <Plus className="size-4" aria-hidden="true" />
          {isDoctor ? 'Bác sĩ trực tiếp lập phiếu đối chiếu' : 'Lập phiếu đối chiếu'}
        </Button>
      </div>
    )

  const patchRow = (idx, patch) => setRows((list) => list.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  const addNewMedRow = () =>
    setRows((list) => [
      ...list,
      {
        source: 'DISCHARGE_PRESCRIPTION',
        prescriptionId: '',
        medicationDescription: '',
        currentName: 'Không có',
        currentConcentration: '—',
        currentDosage: '—',
        currentFrequency: '—',
        compareSource: 'Đơn ra viện',
        compareName: '',
        compareConcentration: '',
        compareDosage: '',
        compareFrequency: '',
        lineNote: '',
        nurseFinding: 'NEW_MEDICATION',
        comparisonSummary: '',
        lastHospitalDoseAt: '',
        decision: '',
        reason: '',
      },
    ])
  const removeNewRow = (idx) => setRows((list) => list.filter((_, i) => i !== idx))

  async function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    if (detailMissing) return
    if (!isDoctor && reason === 'HOSPITAL_RETURN' && (!facilityName.trim() || !prescriberName.trim() || !prescribedAt)) {
      setProblem({
        status: 0,
        title: 'Thiếu thông tin đơn thuốc đối chiếu',
        detail: 'Với đối chiếu trở về từ bệnh viện, cần nhập đầy đủ Cơ sở kê đơn, Bác sĩ kê đơn và Ngày kê đơn.',
        unmetConditions: [],
      })
      return
    }
    if (!isDoctor && rows.some((r) => r.source !== 'CURRENT_PRESCRIPTION' && !(r.compareName?.trim() || r.medicationDescription?.trim()))) {
      setProblem({ status: 0, title: 'Thiếu tên thuốc mới', detail: 'Nhập tên thuốc cho các dòng mới thêm.', unmetConditions: [] })
      return
    }
    const body = {
      reason,
      ...(detail.trim() && { reasonDetail: detail.trim() }),
      ...(facilityName.trim() && { facilityName: facilityName.trim() }),
      ...(prescriberName.trim() && { prescriberName: prescriberName.trim() }),
      ...(prescribedAt && { prescribedAt }),
      ...(comparisonSource.trim() && { comparisonSource: comparisonSource.trim() }),
      ...(attachmentName.trim() && { attachmentName: attachmentName.trim() }),
      ...(nurseNote.trim() && { nurseNote: nurseNote.trim() }),
    }
    setSaving(true)
    setProblem(null)
    try {
      await createReconciliation(residentId, body, keyFor(body))
      if (!isDoctor) {
        const list = await listReconciliations(residentId)
        const created = activeTicket(list)
        if (created) {
          const { etag } = await getReconciliation(created.id)
          await saveItems(created.id, etag, itemsBody(rows), keyFor({ save: created.id }))
          await submitReconciliation(created.id, keyFor({ submit: created.id }))
        }
        await onDone('Đã gửi phiếu đối chiếu cho bác sĩ.')
      } else {
        await onDone(`Đã lập phiếu đối chiếu thuốc, lý do ${REASONS[reason].toLowerCase()}.`)
      }
    } catch (error) {
      setProblem(problemOf(error))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-2">
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Lập phiếu đối chiếu thuốc</h3>
        <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-xs sm:grid-cols-2 dark:bg-slate-800/60">
          <div>
            <span className="text-muted-foreground">Họ và tên</span>
            <p className="mt-0.5 font-bold text-slate-900 dark:text-slate-100">{residentName}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Người lập phiếu</span>
            <p className="mt-0.5 font-bold text-slate-900 dark:text-slate-100">
              {isDoctor ? 'Bác sĩ lập trực tiếp' : 'Điều dưỡng phụ trách'}
            </p>
          </div>
          <div>
            <FieldLabel htmlFor="reconciliation-reason" className="text-xs text-muted-foreground">Loại đối chiếu</FieldLabel>
            <select
              id="reconciliation-reason"
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              {Object.entries(REASONS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <ProblemAlert problem={problem} />

      <div className="flex flex-col gap-3">
        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Thông tin đơn thuốc đối chiếu</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="reconciliation-facility" className="text-xs font-semibold">
              Cơ sở kê đơn {reason === 'HOSPITAL_RETURN' ? '*' : '(nếu có)'}
            </FieldLabel>
            <Input id="reconciliation-facility" value={facilityName} onChange={(e) => setFacilityName(e.target.value)} placeholder="Bệnh viện A" className="h-10 rounded-xl text-xs" />
          </Field>
          <Field>
            <FieldLabel htmlFor="reconciliation-prescriber" className="text-xs font-semibold">
              Bác sĩ kê đơn {reason === 'HOSPITAL_RETURN' ? '*' : '(nếu có)'}
            </FieldLabel>
            <Input id="reconciliation-prescriber" value={prescriberName} onChange={(e) => setPrescriberName(e.target.value)} placeholder="Bác sĩ Nguyễn Văn B" className="h-10 rounded-xl text-xs" />
          </Field>
          <Field>
            <FieldLabel htmlFor="reconciliation-prescribed-at" className="text-xs font-semibold">
              Ngày kê đơn {reason === 'HOSPITAL_RETURN' ? '*' : '(nếu có)'}
            </FieldLabel>
            <Input id="reconciliation-prescribed-at" type="date" value={prescribedAt} onChange={(e) => setPrescribedAt(e.target.value)} className="h-10 rounded-xl text-xs" />
          </Field>
          <Field>
            <FieldLabel htmlFor="reconciliation-source" className="text-xs font-semibold">Nguồn đối chiếu</FieldLabel>
            <PresetOrCustomInput
              label="Nguồn đối chiếu"
              value={comparisonSource}
              options={COMPARISON_SOURCE_PRESETS}
              placeholder="Ví dụ: Đơn thuốc ra viện BV Đa Khoa..."
              onChange={setComparisonSource}
            />
          </Field>
        </div>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-4 text-center hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/30">
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            {attachmentName ? `Đã chọn: ${attachmentName}` : 'Đính kèm đơn thuốc hoặc giấy ra viện'}
          </span>
          <span className="text-[11px] text-muted-foreground">Ảnh hoặc PDF</span>
          <input
            type="file"
            accept="image/*,.pdf"
            className="sr-only"
            aria-label="Đính kèm đơn thuốc hoặc giấy ra viện"
            onChange={(e) => setAttachmentName(e.target.files?.[0]?.name ?? '')}
          />
        </label>
      </div>

      {reason === 'PROFESSIONAL_REQUEST' && (
        <Field data-invalid={(submitted && detailMissing) || undefined}>
          <FieldLabel htmlFor="reconciliation-detail" className="text-xs font-semibold">Chi tiết lý do (bắt buộc)</FieldLabel>
          <Textarea
            id="reconciliation-detail"
            rows={2}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            aria-invalid={(submitted && detailMissing) || undefined}
            className="rounded-xl text-xs"
          />
          {submitted && detailMissing && <FieldError>Nhập chi tiết lý do</FieldError>}
        </Field>
      )}

      {!isDoctor && (
        <div className="flex flex-col gap-4">
          <NurseReconciliationLines
            rows={rows}
            medications={sources?.medications ?? []}
            onPatchRow={patchRow}
            onAddRow={addNewMedRow}
            onRemoveRow={removeNewRow}
            isHospitalReturn={reason === 'HOSPITAL_RETURN'}
          />

          <Field>
            <FieldLabel htmlFor="reconciliation-nurse-note" className="text-xs font-semibold">Ghi chú của điều dưỡng</FieldLabel>
            <Textarea
              id="reconciliation-nurse-note"
              rows={2}
              value={nurseNote}
              onChange={(e) => setNurseNote(e.target.value)}
              placeholder="Thuốc B có sự thay đổi liều lượng. Thuốc C không xuất hiện trong đơn mới, cần bác sĩ kiểm tra lại."
              className="rounded-xl text-xs"
            />
          </Field>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2 pt-2 border-t">
        <Button type="button" variant="outline" className="h-10 rounded-xl px-4 text-xs font-semibold" onClick={() => setOpen(false)}>
          Hủy
        </Button>
        <Button type="submit" className="h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-5 text-xs font-bold shadow-xs" disabled={saving}>
          {isDoctor ? 'Lập phiếu' : 'Gửi bác sĩ đối chiếu'}
        </Button>
      </div>
    </form>
  )
}

function parseComparisonSummary(summary) {
  let clean = String(summary ?? '').trim()
  if (clean.startsWith('[')) {
    const endBracket = clean.indexOf(']')
    if (endBracket !== -1) clean = clean.slice(endBracket + 1).trim()
  }
  let note = ''
  const noteIdx = clean.indexOf('— Ghi chú:')
  if (noteIdx !== -1) {
    note = clean.slice(noteIdx + '— Ghi chú:'.length).trim()
    clean = clean.slice(0, noteIdx).trim()
  }
  const parts = clean
    .split(' · ')
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length === 0) return { conc: '', dose: '', freq: '', note }
  if (parts.length === 1) return { conc: '', dose: parts[0], freq: '', note }
  if (parts.length === 2) return { conc: parts[0], dose: parts[1], freq: '', note }
  if (parts.length === 3) return { conc: parts[0], dose: parts[1], freq: parts[2], note }
  return { conc: parts[0], dose: parts.slice(1, -1).join(' · '), freq: parts[parts.length - 1], note }
}

function hydrateNurseRow(item, prescriptions = [], medications = []) {
  const pid = item.prescriptionId ? Number(item.prescriptionId) : null
  const p = pid ? prescriptions.find((x) => x.id === pid) : null
  const medId = p?.raw?.medicationId ?? p?.medicationId
  const m = medId ? medications.find((x) => x.id === medId) : null
  const isCurrent = item.source === 'CURRENT_PRESCRIPTION'
  const parsed = parseComparisonSummary(item.comparisonSummary)
  const dosePart =
    p?.dose ||
    (p?.dosage != null ? [p.dosage, m?.usageUnit].filter(Boolean).join(' ') : '') ||
    (p?.raw?.dosage != null ? [p.raw.dosage, m?.usageUnit].filter(Boolean).join(' ') : '')
  const currentDosage = [dosePart, p?.route].filter(Boolean).join(' · ')
  const currentFrequency =
    p?.frequencyText ||
    (typeof p?.frequency === 'string' ? p.frequency : p?.frequency?.timedSlots?.join(', ')) ||
    '—'
  const fallbackSource =
    item.source === 'OUTSIDE_PRESCRIPTION'
      ? 'Đơn ngoài viện'
      : item.source === 'ADMISSION_MEDICATION'
        ? 'Thuốc đang dùng khi tiếp nhận'
        : 'Đơn ra viện'

  return {
    ...item,
    prescriptionId: item.prescriptionId ?? '',
    medicationDescription: item.medicationDescription ?? '',
    currentName: item.currentName ?? (isCurrent ? (m?.name ?? p?.drug ?? `Đơn #${item.prescriptionId}`) : 'Không có'),
    currentConcentration: item.currentConcentration ?? (isCurrent ? (m?.concentration || '—') : '—'),
    currentDosage: item.currentDosage ?? (isCurrent ? (currentDosage || '—') : '—'),
    currentFrequency: item.currentFrequency ?? (isCurrent ? currentFrequency : '—'),
    compareSource: item.compareSource ?? fallbackSource,
    compareName: item.compareName ?? (isCurrent ? (m?.name ?? p?.drug ?? '') : (item.medicationDescription ?? '')),
    compareConcentration: item.compareConcentration ?? parsed.conc,
    compareDosage: item.compareDosage ?? parsed.dose,
    compareFrequency: item.compareFrequency ?? parsed.freq,
    nurseFinding: item.nurseFinding || (isCurrent ? 'NO_CHANGE' : 'NEW_MEDICATION'),
    lineNote: item.lineNote || parsed.note || '',
    lastHospitalDoseAt: item.lastHospitalDoseAt ?? '',
  }
}

function ReconciliationSummaryTable({ rows, isDoctor = false }) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Bảng tổng hợp kết quả đối chiếu</h4>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-left text-xs">
          <thead className="border-b bg-slate-50/80 font-semibold text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
            <tr>
              <th className="px-3 py-2.5">Thuốc</th>
              <th className="px-3 py-2.5">Đơn hiện tại</th>
              <th className="px-3 py-2.5">Đơn đối chiếu</th>
              <th className="px-3 py-2.5">{isDoctor ? 'Quyết định của bác sĩ' : 'Khác biệt'}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-3 text-center text-muted-foreground">Chưa có dòng thuốc nào.</td>
              </tr>
            ) : (
              rows.map((r, idx) => {
                const highlight = r.nurseFinding === 'DOSE_CHANGED' || r.nurseFinding === 'UNCLEAR_INDICATION'
                const currentText =
                  r.source === 'CURRENT_PRESCRIPTION'
                    ? ([r.currentConcentration, r.currentFrequency].filter((v) => v && v !== '—').join(' · ') || 'Đang sử dụng')
                    : 'Không có'
                const summary = formatComparisonSummary(r) || r.comparisonSummary
                const doctorClass =
                  r.decision === 'DISCONTINUE'
                    ? 'px-3 py-2.5 font-semibold text-rose-700'
                    : r.decision === 'CHANGE_DOSE'
                      ? 'px-3 py-2.5 font-semibold text-amber-700'
                      : r.decision
                        ? 'px-3 py-2.5 font-semibold text-emerald-700'
                        : 'px-3 py-2.5 font-medium text-amber-700'
                return (
                  <tr key={`sum-${r.id ?? r.prescriptionId ?? idx}`}>
                    <td className="px-3 py-2.5 font-semibold">{r.compareName || r.currentName || r.medicationDescription || 'Thuốc mới'}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{currentText}</td>
                    <td className="px-3 py-2.5">{summary || 'Chưa nhập'}</td>
                    {isDoctor ? (
                      <td className={doctorClass}>{DECISIONS[r.decision] ?? 'Chưa quyết định'}</td>
                    ) : (
                      <td className={highlight ? 'px-3 py-2.5 font-semibold text-amber-700' : 'px-3 py-2.5'}>
                        {NURSE_FINDINGS[r.nurseFinding] ?? r.nurseFinding ?? 'Chưa đối chiếu'}
                      </td>
                    )}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const CONCENTRATION_PRESETS = ['5 mg', '10 mg', '20 mg', '40 mg', '100 mg', '250 mg', '500 mg', '1000 mg']
const DOSAGE_PRESETS = [
  '1 viên · Uống',
  '2 viên · Uống',
  '1/2 viên · Uống',
  '1 gói · Uống',
  '1 ống · Tiêm',
  'Bôi ngoài da',
  '1 nhát xịt · Đường hô hấp',
]
const FREQUENCY_PRESETS = [
  '08:00 (1 lần/ngày)',
  '11:30, 20:30 (2 lần/ngày)',
  '08:00, 20:00 (2 lần/ngày)',
  '08:00, 11:30, 20:30 (3 lần/ngày)',
  'Khi cần (PRN)',
  'Không đề cập trong đơn',
]

const DOCTOR_REASON_PRESETS = {
  CONTINUE: ['Tiếp tục theo đơn ra viện', 'Duy trì theo phác đồ ổn định', 'Đã hết đợt cấp, dùng lại đơn cũ'],
  DISCONTINUE: ['Ngừng do trùng hoạt chất', 'Ngừng theo chỉ định của bệnh viện', 'Ngừng do tác dụng phụ'],
  CHANGE_DOSE: ['Chỉnh liều theo đơn ra viện mới', 'Giảm liều theo dõi chức năng thận', 'Tăng liều kiểm soát triệu chứng'],
  ADD_NEW: ['Bổ sung theo đơn ra viện', 'Thêm thuốc điều trị phối hợp'],
}

function PresetOrCustomInput({ label, value, options, placeholder, onChange }) {
  const [customMode, setCustomMode] = useState(false)
  const inOptions = Boolean(value) && options.includes(value)
  const showInput = customMode || (Boolean(value) && !inOptions)
  const selectValue = showInput ? '__OTHER__' : (value ?? '')

  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label={label}
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value
          if (v === '__OTHER__') {
            setCustomMode(true)
            if (inOptions) onChange('')
          } else {
            setCustomMode(false)
            onChange(v)
          }
        }}
        className="h-8 w-full rounded-md border bg-background px-2 text-xs"
      >
        <option value="">— Chọn gợi ý —</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
        <option value="__OTHER__">Khác (tự nhập)...</option>
      </select>
      {showInput && (
        <Input
          aria-label={`Nhập ${label}`}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-8 text-xs"
        />
      )}
    </div>
  )
}

function NurseReconciliationLines({
  rows,
  medications = [],
  onPatchRow,
  onAddRow,
  onRemoveRow,
  isHospitalReturn,
  isDoctor = false,
  hasNurseSubmission = false,
  errors = [],
  onCollect,
}) {
  const [editingCompare, setEditingCompare] = useState({})
  const decidedCount = rows.filter((i) => Boolean(i.decision)).length
  return (
    <div className="flex flex-col gap-4">
      <datalist id="reconciliation-med-catalog">
        {medications.map((m) => (
          <option key={m.id} value={m.name}>{`${m.name} (${m.concentration})`}</option>
        ))}
      </datalist>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            {isDoctor ? 'Chi tiết đối chiếu & quyết định của bác sĩ' : 'Chi tiết từng dòng đối chiếu'}
          </h4>
          {isDoctor && (
            <span className="text-xs font-semibold text-muted-foreground">
              Đã xử lý {decidedCount}/{rows.length} thuốc
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onAddRow}
          className="text-xs font-semibold text-sky-600 hover:underline"
        >
          + Thêm thuốc từ đơn mới
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
          Người cao tuổi chưa có đơn hiện tại. Bấm "+ Thêm thuốc từ đơn mới" nếu có đơn mới.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r, idx) => {
            const findingLabel = NURSE_FINDINGS[r.nurseFinding] ?? r.nurseFinding ?? 'Chưa đối chiếu'
            const highlight = r.nurseFinding === 'DOSE_CHANGED' || r.nurseFinding === 'UNCLEAR_INDICATION'
            const rowErr = errors[idx] ?? {}
            const n = idx + 1
            return (
              <FieldSet
                key={r.id ?? r.prescriptionId ?? `new-${idx}`}
                aria-label={`Thuốc ${n}`}
                className="flex flex-col gap-3 rounded-xl border p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    Dòng đối chiếu thuốc #{idx + 1}: {r.compareName || r.currentName || 'Thuốc mới'}
                  </span>
                  {(!isDoctor || hasNurseSubmission) && (
                    <span
                      className={
                        highlight
                          ? 'rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800'
                          : 'rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700'
                      }
                    >
                      {isDoctor ? `ĐD ghi nhận: ${findingLabel}` : findingLabel}
                    </span>
                  )}
                </div>

                {!isDoctor && (
                  <div className="max-w-xs">
                    <FieldLabel htmlFor={`nurse-finding-${idx}`} className="text-xs font-semibold">
                      Kết quả đối chiếu dòng {idx + 1}
                    </FieldLabel>
                    <select
                      id={`nurse-finding-${idx}`}
                      aria-label={`Kết quả đối chiếu dòng ${idx + 1}`}
                      value={r.nurseFinding ?? 'NO_CHANGE'}
                      onChange={(e) => onPatchRow(idx, { nurseFinding: e.target.value })}
                      className="mt-1 h-9 w-full rounded-lg border bg-background px-2.5 text-xs"
                    >
                      {Object.entries(NURSE_FINDINGS).map(([val, label]) => (
                        <option key={val} value={val}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5 rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
                    <span className="text-[11px] font-bold uppercase text-muted-foreground">Đơn hiện tại</span>
                    <div><span className="text-muted-foreground">Tên thuốc:</span> <strong>{r.source === 'CURRENT_PRESCRIPTION' ? r.currentName : 'Không có'}</strong></div>
                    <div><span className="text-muted-foreground">Hàm lượng:</span> {r.source === 'CURRENT_PRESCRIPTION' ? r.currentConcentration : '—'}</div>
                    <div><span className="text-muted-foreground">Liều dùng:</span> {r.source === 'CURRENT_PRESCRIPTION' ? r.currentDosage : '—'}</div>
                    <div><span className="text-muted-foreground">Tần suất:</span> {r.source === 'CURRENT_PRESCRIPTION' ? r.currentFrequency : '—'}</div>
                  </div>

                  <div className="flex flex-col gap-2 rounded-lg border bg-background p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase text-muted-foreground">
                        {isDoctor && hasNurseSubmission ? 'Đơn đối chiếu (ĐD đã nhập)' : 'Đơn đối chiếu'}
                      </span>
                      {isDoctor && hasNurseSubmission && (
                        <button
                          type="button"
                          onClick={() => setEditingCompare((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                          className="text-[11px] font-semibold text-sky-600 hover:underline"
                        >
                          {editingCompare[idx] ? 'Xong' : 'Sửa thông tin đối chiếu'}
                        </button>
                      )}
                    </div>
                    {isDoctor && hasNurseSubmission && !editingCompare[idx] ? (
                      <div className="flex flex-col gap-1.5">
                        <div><span className="text-muted-foreground">Nguồn:</span> <strong>{r.compareSource || 'Đơn ra viện'}</strong></div>
                        <div><span className="text-muted-foreground">Tên thuốc:</span> <strong>{r.compareName || 'Chưa nhập'}</strong></div>
                        <div><span className="text-muted-foreground">Hàm lượng:</span> {r.compareConcentration || '—'}</div>
                        <div><span className="text-muted-foreground">Liều dùng:</span> {r.compareDosage || '—'}</div>
                        <div><span className="text-muted-foreground">Tần suất:</span> {r.compareFrequency || '—'}</div>
                        {isHospitalReturn && (
                          <div><span className="text-muted-foreground">Liều cuối BV:</span> {r.lastHospitalDoseAt ? formatDateTime(r.lastHospitalDoseAt) : '—'}</div>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-[80px_1fr] items-center gap-1.5">
                        <span className="text-muted-foreground">Nguồn:</span>
                        <select
                          aria-label={`Nguồn đối chiếu dòng ${idx + 1}`}
                          value={r.compareSource ?? 'Đơn ra viện'}
                          onChange={(e) => onPatchRow(idx, { compareSource: e.target.value })}
                          className="h-8 rounded-md border bg-background px-2 text-xs"
                        >
                          <option value="Đơn ra viện">Đơn ra viện</option>
                          <option value="Đơn ngoài viện">Đơn ngoài viện</option>
                          <option value="Thuốc đang dùng khi tiếp nhận">Thuốc đang dùng khi tiếp nhận</option>
                        </select>

                        <span className="text-muted-foreground">Tên thuốc:</span>
                        <Input
                          aria-label={`Tên thuốc đối chiếu dòng ${idx + 1}`}
                          list="reconciliation-med-catalog"
                          value={r.compareName ?? ''}
                          onChange={(e) => {
                            const name = e.target.value
                            const matched = medications.find((m) => m.name?.toLowerCase() === name.trim().toLowerCase())
                            onPatchRow(idx, {
                              compareName: name,
                              ...(matched && !r.compareConcentration ? { compareConcentration: matched.concentration } : {}),
                            })
                          }}
                          placeholder="Chọn hoặc nhập tên thuốc"
                          className="h-8 text-xs"
                        />

                        <span className="text-muted-foreground">Hàm lượng:</span>
                        <PresetOrCustomInput
                          label={`Hàm lượng đối chiếu dòng ${idx + 1}`}
                          value={r.compareConcentration ?? ''}
                          options={
                            r.currentConcentration &&
                              r.currentConcentration !== '—' &&
                              !CONCENTRATION_PRESETS.includes(r.currentConcentration)
                              ? [r.currentConcentration, ...CONCENTRATION_PRESETS]
                              : CONCENTRATION_PRESETS
                          }
                          placeholder="Ví dụ: 100 UI/ml"
                          onChange={(val) => onPatchRow(idx, { compareConcentration: val })}
                        />

                        <span className="text-muted-foreground">Liều dùng:</span>
                        <PresetOrCustomInput
                          label={`Liều dùng đối chiếu dòng ${idx + 1}`}
                          value={r.compareDosage ?? ''}
                          options={DOSAGE_PRESETS}
                          placeholder="Ví dụ: 10 ml · Uống"
                          onChange={(val) => onPatchRow(idx, { compareDosage: val })}
                        />

                        <span className="text-muted-foreground">Tần suất:</span>
                        <PresetOrCustomInput
                          label={`Tần suất đối chiếu dòng ${idx + 1}`}
                          value={r.compareFrequency ?? ''}
                          options={FREQUENCY_PRESETS}
                          placeholder="Ví dụ: Mỗi 8 giờ"
                          onChange={(val) => onPatchRow(idx, { compareFrequency: val })}
                        />

                        {isHospitalReturn && (
                          <>
                            <span className="text-muted-foreground">Liều cuối BV:</span>
                            <Input
                              type="datetime-local"
                              aria-label={`Liều cuối tại BV dòng ${idx + 1}`}
                              value={r.lastHospitalDoseAt ?? ''}
                              onChange={(e) => onPatchRow(idx, { lastHospitalDoseAt: e.target.value })}
                              className="h-8 text-[11px]"
                            />
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Input
                    aria-label={`Ghi chú điều dưỡng dòng ${idx + 1}`}
                    value={r.lineNote ?? ''}
                    onChange={(e) => onPatchRow(idx, { lineNote: e.target.value })}
                    placeholder="Ghi chú riêng cho dòng này (nếu có)..."
                    className="h-8 flex-1 text-xs"
                  />
                  {(isDoctor || r.source !== 'CURRENT_PRESCRIPTION') && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => onRemoveRow(idx)} className="h-8 text-xs text-rose-600">
                      Xóa dòng
                    </Button>
                  )}
                </div>

                {isDoctor && (
                  <div className="flex flex-col gap-3 rounded-xl border border-sky-200/80 bg-sky-50/40 p-3.5 dark:border-sky-900/50 dark:bg-sky-950/20">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-sky-900 dark:text-sky-200">
                      Quyết định điều trị của bác sĩ
                    </span>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field data-invalid={!!rowErr.decision || undefined}>
                        <FieldLabel htmlFor={`line-${idx}-decision`} className="text-xs font-semibold">
                          Quyết định của bác sĩ *
                        </FieldLabel>
                        <select
                          id={`line-${idx}-decision`}
                          className="h-9 w-full rounded-lg border bg-background px-2.5 text-xs"
                          value={r.decision ?? ''}
                          onChange={(e) => onPatchRow(idx, { decision: e.target.value })}
                          aria-invalid={!!rowErr.decision || undefined}
                        >
                          <option value="">Chọn quyết định</option>
                          {Object.entries(DECISIONS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                        {rowErr.decision && <FieldError>{rowErr.decision}</FieldError>}
                      </Field>

                      <Field data-invalid={!!rowErr.reason || undefined}>
                        <FieldLabel htmlFor={`line-${idx}-reason`} className="text-xs font-semibold">
                          Căn cứ / Lý do quyết định
                        </FieldLabel>
                        <PresetOrCustomInput
                          label={`Căn cứ lý do quyết định dòng ${idx + 1}`}
                          value={r.reason ?? ''}
                          options={DOCTOR_REASON_PRESETS[r.decision] ?? ['Tiếp tục theo đơn ra viện', 'Ngừng do trùng hoạt chất']}
                          placeholder="Ví dụ: Tiếp tục theo đơn ra viện / Ngừng do trùng..."
                          onChange={(val) => onPatchRow(idx, { reason: val })}
                        />
                        {rowErr.reason && <FieldError>{rowErr.reason}</FieldError>}
                      </Field>
                    </div>

                    {needsPrescription(r) && (
                      <Field data-invalid={!!rowErr.newPrescription || undefined} className="gap-2">
                        {r.newPrescription && (
                          <div className="flex flex-col gap-0.5 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
                            <span className="font-semibold">
                              {`Đơn mới: ${r.newPrescriptionLabel ?? medications.find((m) => m.id === r.newPrescription.medicationId)?.name ?? `thuốc mã ${r.newPrescription.medicationId}`}, liều ${r.newPrescription.dosage}, ${r.newPrescription.route}`}
                            </span>
                            <span className="text-[11px] text-emerald-800 dark:text-emerald-300">
                              {[
                                r.newPrescription.prescriptionType === 'PRN'
                                  ? 'Khi cần (PRN)'
                                  : r.newPrescription.frequency?.timedSlots?.join(', ') ||
                                  (r.newPrescription.frequency?.everyNHours ? `Mỗi ${r.newPrescription.frequency.everyNHours} giờ` : ''),
                                r.newPrescription.startedAt && r.newPrescription.endedAt
                                  ? `${String(r.newPrescription.startedAt).slice(0, 10)} → ${String(r.newPrescription.endedAt).slice(0, 10)}`
                                  : '',
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          </div>
                        )}
                        <div>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 rounded-xl bg-background text-xs font-bold"
                            aria-label={`Lập đơn mới cho dòng ${n}`}
                            onClick={() => onCollect?.(idx)}
                          >
                            Lập đơn mới
                          </Button>
                        </div>
                        {rowErr.newPrescription && <FieldError>{rowErr.newPrescription}</FieldError>}
                      </Field>
                    )}
                  </div>
                )}
              </FieldSet>
            )
          })}
        </div>
      )}

      <ReconciliationSummaryTable rows={rows} isDoctor={isDoctor} />
    </div>
  )
}

const editable = (items, prescriptions = [], medications = []) =>
  items.map((i) => hydrateNurseRow(i, prescriptions, medications))

function TicketDetail({ id, sources, residentId, residentName, isDoctor, onChanged, onDraftSaved, onCloseDetail }) {
  const staff = useStaffName()
  const [state, setState] = useState({ loading: true })
  const [items, setItems] = useState([])
  const [nurseNote, setNurseNote] = useState('')
  const [doctorConclusion, setDoctorConclusion] = useState('')
  const [dirty, setDirty] = useState(false)
  const [errors, setErrors] = useState([])
  const [problem, setProblem] = useState(null)
  const [stale, setStale] = useState(null)
  const [issues, setIssues] = useState([])
  const [saving, setSaving] = useState(false)
  const [action, setAction] = useState(null)
  const [collecting, setCollecting] = useState(null)
  const keyFor = useRef(idempotencyKeys()).current

  const fetchTicket = useCallback(async () => {
    const { data, etag } = await getReconciliation(id)
    return { ticket: data, etag }
  }, [id])

  useEffect(() => {
    let cancelled = false
    fetchTicket().then(
      (loaded) => {
        if (cancelled) return
        setState(loaded)
        const existingItems = editable(loaded.ticket.items ?? [], sources?.prescriptions, sources?.medications)
        const auto =
          loaded.ticket.status === 'OPEN' && existingItems.length === 0 && (sources?.prescriptions ?? []).length > 0
            ? buildAutoRows(sources.prescriptions, sources.medications)
            : existingItems
        setItems(auto)
        if (loaded.ticket.status === 'OPEN' && existingItems.length === 0 && auto.length > 0) {
          setDirty(true)
        }
        setNurseNote(loaded.ticket.nurseNote ?? '')
        setDoctorConclusion(loaded.ticket.doctorConclusion ?? '')
      },
      (error) => !cancelled && setState({ failure: problemOf(error) }),
    )
    return () => {
      cancelled = true
    }
  }, [fetchTicket, sources?.prescriptions, sources?.medications])

  if (state.loading) return <Skeleton className="h-40 w-full" />
  if (state.failure) return <ProblemAlert problem={state.failure} />

  const { ticket, etag } = state
  const allowed = (command) => (ticket.allowedCommands ?? []).includes(command)
  const canDoctorEditPending = isDoctor && (ticket.status === 'PENDING_CONFIRMATION' || ticket.status === 'DRAFT')
  const canEdit = allowed('CAP_NHAT_DONG') || canDoctorEditPending
  const doctorMode = isDoctor
  const hasNurseSubmission = Boolean(ticket.submittedBy) && (ticket.status === 'CONFIRMED' || allowed('TRA_LAI'))
  const prescriptions = sources?.prescriptions ?? []
  const prescriptionOf = (pid) => prescriptions.find((p) => p.id === Number(pid))
  const decidedCount = items.filter((i) => Boolean(i.decision)).length
  const allDecided = items.length === 0 || decidedCount === items.length

  function update(index, patch) {
    setItems((list) => list.map((item, i) => (i === index ? { ...item, ...patch } : item)))
    setDirty(true)
  }

  function addLine() {
    setItems((list) => [
      ...list,
      {
        source: 'DISCHARGE_PRESCRIPTION',
        prescriptionId: '',
        medicationDescription: '',
        compareSource: 'Đơn ra viện',
        compareName: '',
        compareConcentration: '',
        compareDosage: '',
        compareFrequency: '',
        nurseFinding: 'NEW_MEDICATION',
        comparisonSummary: '',
        lineNote: '',
        lastHospitalDoseAt: '',
        decision: isDoctor ? 'ADD_NEW' : '',
        reason: '',
      },
    ])
    setDirty(true)
  }

  function removeLine(index) {
    setItems((list) => list.filter((_, i) => i !== index))
    setErrors((list) => list.filter((_, i) => i !== index))
    setDirty(true)
  }

  async function run(command, message, key) {
    setSaving(true)
    setProblem(null)
    try {
      await command(key)
      await onChanged(message)
    } catch (error) {
      setProblem(problemOf(error))
      // Xác nhận lỗi thì về lại hai nút lệnh; form lý do giữ chữ đã gõ (DESIGN.md 9.2 điều 4)
      setAction((current) => (current === 'confirm' ? null : current))
      setSaving(false)
    }
  }

  async function save() {
    const found = itemErrors(items, { requireDecision: doctorMode })
    setErrors(found)
    if (found.some((e) => Object.keys(e).length > 0)) return
    const body = itemsBody(items)
    setSaving(true)
    setProblem(null)
    setStale(null)
    setIssues([])
    try {
      const { etag: next } = await saveItems(id, etag, body, keyFor({ etag, body }))
      await updateReconciliationNotes(id, {
        ...(nurseNote.trim() && { nurseNote: nurseNote.trim() }),
        ...(doctorConclusion.trim() && { doctorConclusion: doctorConclusion.trim() }),
      }).catch(() => null)
      if (doctorMode && allowed('LUU_NHAP')) {
        await saveReconciliationDraft(id, keyFor({ draft: id, next })).catch(() => null)
      }
      const reloaded = await fetchTicket()
      setState({ ticket: reloaded.ticket, etag: reloaded.etag ?? next })
      setItems(editable(reloaded.ticket.items ?? [], sources?.prescriptions, sources?.medications))
      setDirty(false)
      if (doctorMode && onDraftSaved) {
        await onDraftSaved(`Đã lưu nháp ${body.length} dòng của phiếu đối chiếu.`)
      } else {
        await onChanged(`Đã lưu nháp ${body.length} dòng của phiếu đối chiếu.`)
      }
    } catch (error) {
      if (error?.problem?.errorCode === 'ISSUES_REQUIRE_CONFIRMATION') setIssues(error.problem.issues ?? [])
      setProblem(problemOf(error))
      if (error?.status === 412) {
        // Giữ các dòng đang gõ (DESIGN.md 9.2 điều 4); lấy ETag mới và hiện dòng đã lưu trên máy chủ
        const reloaded = await fetchTicket().catch(() => null)
        if (reloaded) {
          setState(reloaded)
          setStale(reloaded.ticket.items ?? [])
        }
      }
    }
    setSaving(false)
  }

  async function submitForConfirmation() {
    const found = itemErrors(items, { requireDecision: doctorMode })
    setErrors(found)
    if (found.some((e) => Object.keys(e).length > 0)) return
    if (dirty && !doctorMode) {
      setSaving(true)
      setProblem(null)
      try {
        const body = itemsBody(items)
        await saveItems(id, etag, body, keyFor({ etag, body }))
        await updateReconciliationNotes(id, {
          ...(nurseNote.trim() && { nurseNote: nurseNote.trim() }),
        }).catch(() => null)
        setDirty(false)
      } catch (error) {
        setProblem(problemOf(error))
        setSaving(false)
        return
      }
    } else if (dirty) {
      setProblem({
        status: 0,
        title: 'Chưa gửi được',
        detail: 'Lưu nháp các dòng trước khi gửi xác nhận.',
        unmetConditions: [],
      })
      return
    }
    await run((key) => submitReconciliation(id, key), 'Đã gửi phiếu đối chiếu chờ xác nhận.', keyFor({ submit: id }))
  }

  const lineText = (item) =>
    item.source === 'CURRENT_PRESCRIPTION'
      ? (prescriptionOf(item.prescriptionId)?.drug ?? `đơn mã ${item.prescriptionId}`)
      : item.medicationDescription

  return (
    <section aria-labelledby={`reconciliation-${id}`} className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div className="flex flex-col gap-1.5 rounded-xl bg-muted/30 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={`reconciliation-${id}`} className="type-card-title">
            {`Phiếu đối chiếu #${ticket.id} · ${REASONS[ticket.reason] ?? ticket.reason}`}
          </h3>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
              {STATUS[ticket.status] ?? ticket.status}
            </span>
            {onCloseDetail && (
              <Button type="button" variant="ghost" size="sm" className="h-7 rounded-lg px-2 text-xs" onClick={onCloseDetail}>
                Thu gọn
              </Button>
            )}
          </div>
        </div>
        {(ticket.facilityName || ticket.prescriberName || ticket.comparisonSource || ticket.attachmentName) && (
          <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            {ticket.facilityName && <span>Cơ sở kê: <strong>{ticket.facilityName}</strong></span>}
            {ticket.prescriberName && <span>Bác sĩ kê: <strong>{ticket.prescriberName}</strong></span>}
            {ticket.comparisonSource && <span>Nguồn đối chiếu: <strong>{ticket.comparisonSource}</strong></span>}
            {ticket.attachmentName && <span>Tài liệu đính kèm: <strong>{ticket.attachmentName}</strong></span>}
          </div>
        )}
        {ticket.returnReason && (
          <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
            Phiếu bị trả lại: {ticket.returnReason}
          </p>
        )}
        {ticket.cancelReason && (
          <p className="rounded-md bg-rose-50 px-2.5 py-1.5 text-xs text-rose-900">
            Phiếu đã hủy: {ticket.cancelReason}
          </p>
        )}
        {ticket.reasonDetail && <span className="type-body-sm">{ticket.reasonDetail}</span>}
        {ticket.deadlineAt && WORKING.includes(ticket.status) && (
          <span className={ticket.overdue ? 'type-label text-destructive' : 'type-body-sm'}>
            {`${ticket.overdue ? 'Quá hạn đối chiếu' : 'Hạn đối chiếu'} ${formatDateTime(ticket.deadlineAt)}`}
          </span>
        )}
        <span className="type-caption text-muted-foreground">
          {[
            staff(ticket.createdBy) && `Lập bởi ${staff(ticket.createdBy)}`,
            staff(ticket.submittedBy) && `gửi bởi ${staff(ticket.submittedBy)}`,
            staff(ticket.confirmedBy) && `xác nhận bởi ${staff(ticket.confirmedBy)}`,
          ]
            .filter(Boolean)
            .join(', ')}
        </span>
      </div>

      <ProblemAlert problem={problem}>
        {issues.length > 0 && (
          <ul className="ml-4 list-disc">
            {issues.map((issue, i) => (
              <li key={`${issue.issueCode}-${i}`}>
                {`${issue.lineNumber ? `Dòng ${issue.lineNumber}: ` : ''}${issueText(issue)}. Lập lại đơn mới của dòng và ghi lý do xác nhận.`}
              </li>
            ))}
          </ul>
        )}
        {stale && (
          <div className="flex flex-col gap-1">
            <p>Các dòng đang lưu trên máy chủ:</p>
            <ul className="ml-4 list-disc">
              {stale.length === 0 && <li>Chưa có dòng</li>}
              {stale.map((item, i) => (
                <li key={item.id ?? i}>{`${lineText(item)}, ${DECISIONS[item.decision] ?? 'chưa có quyết định'}`}</li>
              ))}
            </ul>
            <p>Các dòng bạn đang gõ vẫn giữ nguyên; bấm Lưu các dòng để ghi đè.</p>
          </div>
        )}
      </ProblemAlert>

      {canEdit ? (
        <div className="flex flex-col gap-3">
          <NurseReconciliationLines
            rows={items}
            medications={sources?.medications ?? []}
            onPatchRow={update}
            onAddRow={addLine}
            onRemoveRow={removeLine}
            isHospitalReturn={ticket.reason === 'HOSPITAL_RETURN'}
            isDoctor={doctorMode}
            hasNurseSubmission={hasNurseSubmission}
            errors={errors}
            onCollect={setCollecting}
          />
          {!doctorMode ? (
            <Field>
              <FieldLabel htmlFor={`nurse-note-${id}`} className="text-xs font-semibold">Ghi chú của điều dưỡng</FieldLabel>
              <Textarea
                id={`nurse-note-${id}`}
                rows={2}
                value={nurseNote}
                onChange={(e) => setNurseNote(e.target.value)}
                placeholder="Ghi nhận các khác biệt hoặc thuốc chưa rõ chỉ định..."
                className="rounded-xl text-xs"
              />
            </Field>
          ) : (
            <>
              {ticket.nurseNote && (
                <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
                  <strong>Ghi chú của điều dưỡng:</strong> {ticket.nurseNote}
                </p>
              )}
              <Field>
                <FieldLabel htmlFor={`doctor-conclusion-${id}`} className="text-xs font-semibold">Kết luận của bác sĩ</FieldLabel>
                <Textarea
                  id={`doctor-conclusion-${id}`}
                  rows={2}
                  value={doctorConclusion}
                  onChange={(e) => setDoctorConclusion(e.target.value)}
                  placeholder="Nhập kết luận chuyên môn..."
                  className="rounded-xl text-xs"
                />
              </Field>
            </>
          )}
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            {doctorMode && (
              <Button variant="outline" className="h-9.5 rounded-xl border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-800 shadow-xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200" onClick={save} disabled={saving}>
                Lưu nháp
              </Button>
            )}
            {allowed('GUI_XAC_NHAN') && (
              <Button className="h-9.5 rounded-xl bg-[#24496f] hover:bg-[#193552] text-white px-4 text-xs font-bold shadow-xs transition-all hover:shadow-md hover:-translate-y-0.5" onClick={submitForConfirmation} disabled={saving}>
                {doctorMode ? 'Chuyển sang bước xác nhận' : 'Gửi bác sĩ đối chiếu'}
              </Button>
            )}
            {allowed('HUY') && !allowed('TRA_LAI') && !allowed('XAC_NHAN') && !action && (
              <Button
                variant="outline"
                className="h-9.5 rounded-xl border-rose-300 bg-rose-50/50 text-rose-700 px-4 text-xs font-bold shadow-xs hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200"
                onClick={() => setAction('cancel')}
              >
                Hủy phiếu
              </Button>
            )}
          </div>
          {doctorMode && !allDecided && (
            <p className="text-xs text-amber-700">
              Còn {items.length - decidedCount} thuốc chưa có quyết định cuối cùng.
            </p>
          )}
        </div>
      ) : (
        <ItemList items={ticket.items ?? []} lineText={lineText} />
      )}

      {((allowed('TRA_LAI') && hasNurseSubmission) || allowed('XAC_NHAN') || (!canEdit && allowed('HUY'))) && !action && (
        <div className="flex flex-wrap gap-2.5 pt-1">
          {allowed('XAC_NHAN') && (
            <Button
              className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 text-xs font-bold shadow-xs transition-all hover:shadow-md hover:-translate-y-0.5"
              disabled={(doctorMode && !allDecided) || saving}
              onClick={() => setAction('confirm')}
            >
              Xác nhận đối chiếu
            </Button>
          )}
          {allowed('TRA_LAI') && hasNurseSubmission && (
            <Button variant="outline" className="h-10 rounded-xl border-amber-300 bg-amber-50/50 text-amber-900 px-4 text-xs font-bold shadow-xs hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200" onClick={() => setAction('return')}>
              Trả lại phiếu
            </Button>
          )}
          {allowed('HUY') && (
            <Button variant="outline" className="h-10 rounded-xl border-rose-300 bg-rose-50/50 text-rose-700 px-4 text-xs font-bold shadow-xs hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200" onClick={() => setAction('cancel')}>
              Hủy phiếu
            </Button>
          )}
        </div>
      )}
      {action === 'confirm' && (
        <Alert variant="attention">
          <AlertTitle>Xác nhận phiếu đối chiếu</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <p>
              Quyết định của từng dòng được áp vào đơn thuốc của {residentName} trong một lệnh; phiếu đã xác nhận chỉ
              sửa được bằng đính chính. Người xác nhận phải khác người gửi và người đã ghi quyết định.
            </p>
            {ticket.reason === 'ADMISSION' && (
              <p>
                So phiếu với thuốc đang dùng khi tiếp nhận ở trên: mỗi thuốc đang dùng khi tiếp nhận đã có một dòng. Hệ
                thống không tự kiểm phần này.
              </p>
            )}
            <p>
              Kiểm căn cứ của dòng Ngừng, Thay đổi liều: do Bác sĩ có quyền kê đơn quyết, hoặc có căn cứ từ cơ sở kê bên
              ngoài (cơ sở, người, ngày) ghi trong lý do (Q-411).
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                className="h-11"
                disabled={saving}
                onClick={async () => {
                  if (dirty) {
                    const found = itemErrors(items, { requireDecision: doctorMode })
                    setErrors(found)
                    if (found.some((e) => Object.keys(e).length > 0)) return
                    setSaving(true)
                    setProblem(null)
                    try {
                      const body = itemsBody(items)
                      await saveItems(id, etag, body, keyFor({ etag, body }))
                      await updateReconciliationNotes(id, {
                        ...(doctorConclusion.trim() && { doctorConclusion: doctorConclusion.trim() }),
                      }).catch(() => null)
                      setDirty(false)
                    } catch (error) {
                      setProblem(problemOf(error))
                      setSaving(false)
                      return
                    }
                  }
                  await run(
                    (key) => confirmReconciliation(id, key),
                    'Đã xác nhận phiếu đối chiếu thuốc.',
                    keyFor({ confirm: id }),
                  )
                }}
              >
                Xác nhận và áp dụng quyết định
              </Button>
              <Button variant="outline" className="h-11" onClick={() => setAction(null)}>
                Hủy
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      {action === 'return' && (
        <ReasonForm
          id={`return-${id}`}
          label="Lý do trả lại"
          missing="Nhập lý do trả lại"
          submitLabel="Xác nhận trả lại"
          saving={saving}
          onCancel={() => setAction(null)}
          onSubmit={(reason) =>
            run(
              (key) => returnReconciliation(id, reason, key),
              'Đã trả lại phiếu đối chiếu.',
              keyFor({ return: id, reason }),
            )
          }
        />
      )}
      {action === 'cancel' && (
        <ReasonForm
          id={`cancel-${id}`}
          label="Lý do hủy phiếu"
          missing="Nhập lý do hủy phiếu"
          submitLabel="Xác nhận hủy phiếu"
          saving={saving}
          onCancel={() => setAction(null)}
          onSubmit={(reason) =>
            run(
              (key) => cancelReconciliation(id, reason, key),
              'Đã hủy phiếu đối chiếu.',
              keyFor({ cancel: id, reason }),
            )
          }
        />
      )}

      {allowed('DE_NGHI_DINH_CHINH') &&
        (action === 'correct' ? (
          <CorrectionForm
            id={id}
            saving={saving}
            onCancel={() => setAction(null)}
            onSubmit={(body) =>
              run(
                (key) => proposeCorrection(id, body, key),
                'Đã gửi đề nghị đính chính phiếu, chờ một Bác sĩ hoặc Điều dưỡng khác xác nhận.',
                keyFor(body),
              )
            }
          />
        ) : (
          <div>
            <Button variant="outline" className="h-11" onClick={() => setAction('correct')}>
              Đề nghị đính chính
            </Button>
          </div>
        ))}

      {(ticket.corrections ?? []).length > 0 && (
        <CorrectionList
          corrections={ticket.corrections}
          staff={staff}
          saving={saving}
          onConfirm={(c) =>
            run(
              (key) => confirmCorrection(c.id, key),
              `Đã xác nhận đề nghị đính chính #${c.id}.`,
              keyFor({ confirmCorrection: c.id }),
            )
          }
          onReturn={(c, reason) =>
            run(
              (key) => returnCorrection(c.id, reason, key),
              `Đã trả lại đề nghị đính chính #${c.id}.`,
              keyFor({ returnCorrection: c.id, reason }),
            )
          }
        />
      )}

      {collecting !== null && sources && (
        <PrescriptionSheet
          open
          onOpenChange={(open) => !open && setCollecting(null)}
          residentId={residentId}
          resident={sources.resident ?? { name: residentName, allergies: [] }}
          medications={sources.medications}
          isDoctor={isDoctor}
          prefill={{
            prescriberType: ticket.facilityName || ticket.prescriberName ? 'EXTERNAL' : undefined,
            facilityName: ticket.facilityName ?? '',
            prescriberName: ticket.prescriberName ?? '',
            prescribedAt: ticket.prescribedAt ?? '',
            medicationName:
              items[collecting]?.compareName ||
              items[collecting]?.currentName ||
              lineText(items[collecting]) ||
              '',
          }}
          onCollect={(body, medication) =>
            update(collecting, { newPrescription: body, newPrescriptionLabel: medication?.name })
          }
        />
      )}
    </section>
  )
}

function ItemList({ items, lineText }) {
  if (items.length === 0) return <p className="type-body-sm text-muted-foreground">Phiếu chưa có dòng.</p>
  return (
    <ol className="flex flex-col" aria-label="Các dòng của phiếu">
      {items.map((item, index) => (
        <li key={item.id ?? index} className="flex flex-col gap-0.5 border-t py-2 first:border-t-0 first:pt-0">
          <span className="type-body-sm">{`Dòng ${index + 1}, ${SOURCES[item.source] ?? item.source}: ${lineText(item)}`}</span>
          <span className="type-label">{DECISIONS[item.decision] ?? 'Chưa có quyết định'}</span>
          {item.reason && <span className="type-body-sm text-muted-foreground">{`Lý do: ${item.reason}`}</span>}
          {item.createdPrescriptionId && (
            <span className="type-caption text-muted-foreground">{`Đã tạo đơn mã ${item.createdPrescriptionId}`}</span>
          )}
          {item.medicationRemovedFromProfile && (
            <span className="type-body-sm text-warning-foreground">Thuốc này đã bỏ khỏi hồ sơ sức khỏe ban đầu.</span>
          )}
          {item.discontinuedOutsideTicket && (
            <span className="type-caption text-muted-foreground">Đơn đã ngừng ngoài phiếu.</span>
          )}
        </li>
      ))}
    </ol>
  )
}

const CORRECTION_STATUS = {
  PENDING_CONFIRMATION: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  REJECTED: 'Đã trả lại',
}

const contentText = (content) =>
  content?.description ?? (content && Object.keys(content).length > 0 ? JSON.stringify(content) : 'Không ghi nội dung')

// Đề nghị đính chính của phiếu (FR-039; 006 T077): người xác nhận là Bác sĩ hoặc Điều dưỡng khác người lập; nút theo
// allowedCommands của từng đề nghị, backend kiểm quy tắc hai người
function CorrectionList({ corrections, staff, saving, onConfirm, onReturn }) {
  const [returning, setReturning] = useState(null)
  return (
    <section aria-labelledby="reconciliation-corrections" className="flex flex-col gap-2 border-t pt-3">
      <h4 id="reconciliation-corrections" className="type-label">
        Đề nghị đính chính
      </h4>
      <ul aria-label="Đề nghị đính chính" className="flex flex-col gap-3">
        {corrections.map((c) => {
          const commands = c.allowedCommands ?? []
          return (
            <li key={c.id} className="flex flex-col gap-1 rounded-lg border p-3">
              <span className="type-body-sm">{`Đề nghị #${c.id}`}</span>
              <span className={c.status === 'CONFIRMED' ? 'type-label text-success-foreground' : 'type-label'}>
                {CORRECTION_STATUS[c.status] ?? c.status}
              </span>
              <span className="type-caption text-muted-foreground">Nội dung đúng</span>
              <span className="type-body-sm whitespace-pre-line">{contentText(c.correctedContent)}</span>
              <span className="type-body-sm">{`Lý do: ${c.reason}`}</span>
              <span className="type-caption text-muted-foreground">
                {[
                  c.createdBy && `Lập bởi ${staff(c.createdBy)}`,
                  c.createdAt && formatDateTime(c.createdAt),
                  c.confirmedBy && `xử lý bởi ${staff(c.confirmedBy)}`,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </span>
              {c.returnReason && <span className="type-body-sm">{`Lý do trả lại: ${c.returnReason}`}</span>}
              {returning === c.id ? (
                <ReasonForm
                  id={`correction-return-${c.id}`}
                  label="Lý do trả lại đề nghị"
                  missing="Nhập lý do trả lại đề nghị"
                  submitLabel="Xác nhận trả lại đề nghị"
                  saving={saving}
                  onCancel={() => setReturning(null)}
                  onSubmit={(reason) => onReturn(c, reason)}
                />
              ) : (
                (commands.includes('CONFIRM') || commands.includes('RETURN')) && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {commands.includes('CONFIRM') && (
                      <Button
                        className="h-11"
                        disabled={saving}
                        aria-label={`Xác nhận đính chính #${c.id}`}
                        onClick={() => onConfirm(c)}
                      >
                        Xác nhận đính chính
                      </Button>
                    )}
                    {commands.includes('RETURN') && (
                      <Button
                        variant="outline"
                        className="h-11"
                        aria-label={`Trả lại đề nghị #${c.id}`}
                        onClick={() => setReturning(c.id)}
                      >
                        Trả lại
                      </Button>
                    )}
                  </div>
                )
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function ReasonForm({ id, label, missing, submitLabel, saving, onCancel, onSubmit }) {
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const empty = !reason.trim()
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        setSubmitted(true)
        if (!empty) onSubmit(reason.trim())
      }}
    >
      <Field data-invalid={(submitted && empty) || undefined}>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Textarea
          id={id}
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-invalid={(submitted && empty) || undefined}
        />
        {submitted && empty && <FieldError>{missing}</FieldError>}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="h-11" disabled={saving}>
          {submitLabel}
        </Button>
        <Button type="button" variant="outline" className="h-11" onClick={onCancel}>
          Hủy
        </Button>
      </div>
    </form>
  )
}

// Đề nghị đính chính (FR-039): chỉ sửa nội dung ghi trên phiếu, không đổi đơn thuốc; có hiệu lực khi người khác xác nhận
function CorrectionForm({ id, saving, onCancel, onSubmit }) {
  const [content, setContent] = useState('')
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const noContent = !content.trim()
  const noReason = !reason.trim()
  return (
    <form
      noValidate
      className="flex flex-col gap-3 border-t pt-3"
      onSubmit={(event) => {
        event.preventDefault()
        setSubmitted(true)
        if (!noContent && !noReason)
          onSubmit({ correctedContent: { description: content.trim() }, reason: reason.trim() })
      }}
    >
      <p className="type-body-sm text-muted-foreground">
        Đính chính chỉ sửa nội dung ghi trên phiếu, không đổi đơn thuốc; thay đổi thuốc thực tế làm bằng lệnh đơn thuốc.
      </p>
      <Field data-invalid={(submitted && noContent) || undefined}>
        <FieldLabel htmlFor={`correction-content-${id}`}>Nội dung đúng</FieldLabel>
        <Textarea
          id={`correction-content-${id}`}
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          aria-invalid={(submitted && noContent) || undefined}
        />
        {submitted && noContent && <FieldError>Nhập nội dung đúng</FieldError>}
      </Field>
      <Field data-invalid={(submitted && noReason) || undefined}>
        <FieldLabel htmlFor={`correction-reason-${id}`}>Lý do đính chính</FieldLabel>
        <Textarea
          id={`correction-reason-${id}`}
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-invalid={(submitted && noReason) || undefined}
        />
        {submitted && noReason && <FieldError>Nhập lý do đính chính</FieldError>}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="h-11" disabled={saving}>
          Gửi đề nghị đính chính
        </Button>
        <Button type="button" variant="outline" className="h-11" onClick={onCancel}>
          Hủy
        </Button>
      </div>
    </form>
  )
}
