import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
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
  submitReconciliation,
} from './reconciliationApi'
import {
  DECISIONS,
  needsPrescription,
  REASONS,
  SOURCES,
  STATUS,
  activeTicket,
  itemErrors,
  itemsBody,
} from './reconciliationView'

// Phiếu đối chiếu thuốc của một người cao tuổi (spec 006 User Story 4; FR-034 → FR-039; 006 T072). Bác sĩ hoặc Điều
// dưỡng lập phiếu, tự thêm từng dòng và quyết định; hệ thống không tạo sẵn dòng, không có nút chép từ hồ sơ (Q-306,
// Q-307): "thuốc đang dùng khi tiếp nhận" chỉ hiện để đọc. Nút lệnh theo allowedCommands của phiếu (DESIGN.md 7.4);
// đủ dòng, quy tắc hai người, quyền kê đơn do backend kiểm và trả lỗi trong khung. Xác nhận, trả lại đề nghị đính chính
// để sau (chủ dự án 2026-11-18: hợp đồng chưa trả id của đề nghị).

const select = 'h-11 w-full rounded-md border bg-background px-3 text-sm'
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
  const [announcement, setAnnouncement] = useState('')
  // Tăng sau mỗi lệnh thành công để khung chi tiết đọc lại phiếu (trạng thái, đề nghị đính chính mới)
  const [revision, setRevision] = useState(0)

  const load = useCallback(async () => {
    try {
      const list = await listReconciliations(residentId)
      setTickets(list)
      setSelectedId((current) => {
        const working = activeTicket(list)
        if (working) return working.id
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
  const others = [...tickets].filter((t) => t.id !== selectedId).sort((a, b) => b.id - a.id)

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
        <CreateTicket residentId={residentId} defaultReason={defaultReason} onDone={changed} />
      )}
      {!working && tickets.length === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-center text-xs text-slate-500 shadow-xs dark:border-slate-800 dark:bg-slate-900">{`${residentName} chưa có phiếu đối chiếu thuốc.`}</p>
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
        />
      )}

      {others.length > 0 && (
        <section aria-labelledby="other-reconciliations" className="flex flex-col gap-2 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <h3 id="other-reconciliations" className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Phiếu khác
          </h3>
          <ul className="flex flex-col gap-2">
            {others.map((t) => (
              <li key={t.id}>
                <Button variant="outline" className="h-10 w-full justify-start rounded-xl text-xs font-semibold" onClick={() => setSelectedId(t.id)}>
                  {`Xem phiếu #${t.id}, ${REASONS[t.reason] ?? t.reason}, ${STATUS[t.status] ?? t.status}`}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function CreateTicket({ residentId, defaultReason, onDone }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState(defaultReason)
  const [detail, setDetail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [problem, setProblem] = useState(null)
  const [saving, setSaving] = useState(false)
  const keyFor = useRef(idempotencyKeys()).current
  const detailMissing = reason === 'PROFESSIONAL_REQUEST' && !detail.trim()

  if (!open)
    return (
      <div>
        <Button className="h-10 gap-1.5 rounded-xl bg-[#24496f] hover:bg-[#193552] text-white px-4 text-xs font-bold shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5" onClick={() => setOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Lập phiếu đối chiếu
        </Button>
      </div>
    )

  async function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    if (detailMissing) return
    const body = { reason, ...(detail.trim() && { reasonDetail: detail.trim() }) }
    setSaving(true)
    setProblem(null)
    try {
      await createReconciliation(residentId, body, keyFor(body))
      await onDone(`Đã lập phiếu đối chiếu thuốc, lý do ${REASONS[reason].toLowerCase()}.`)
    } catch (error) {
      setProblem(problemOf(error))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Lập phiếu đối chiếu thuốc</h3>
      <ProblemAlert problem={problem} />
      <Field>
        <FieldLabel htmlFor="reconciliation-reason" className="text-xs font-semibold">Lý do lập phiếu</FieldLabel>
        <select
          id="reconciliation-reason"
          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs shadow-xs focus:border-sky-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          {Object.entries(REASONS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field data-invalid={(submitted && detailMissing) || undefined}>
        <FieldLabel htmlFor="reconciliation-detail" className="text-xs font-semibold">
          {reason === 'PROFESSIONAL_REQUEST' ? 'Chi tiết lý do (bắt buộc)' : 'Chi tiết lý do (không bắt buộc)'}
        </FieldLabel>
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
      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="submit" className="h-10 rounded-xl bg-[#24496f] hover:bg-[#193552] text-white px-4 text-xs font-bold shadow-xs" disabled={saving}>
          Lập phiếu
        </Button>
        <Button type="button" variant="outline" className="h-10 rounded-xl px-4 text-xs font-semibold" onClick={() => setOpen(false)}>
          Hủy
        </Button>
      </div>
    </form>
  )
}

const editable = (items) =>
  items.map((i) => ({
    ...i,
    prescriptionId: i.prescriptionId ?? '',
    medicationDescription: i.medicationDescription ?? '',
  }))

function TicketDetail({ id, sources, residentId, residentName, isDoctor, onChanged }) {
  const staff = useStaffName()
  const [state, setState] = useState({ loading: true })
  const [items, setItems] = useState([])
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
        setItems(editable(loaded.ticket.items ?? []))
      },
      (error) => !cancelled && setState({ failure: problemOf(error) }),
    )
    return () => {
      cancelled = true
    }
  }, [fetchTicket])

  if (state.loading) return <Skeleton className="h-40 w-full" />
  if (state.failure) return <ProblemAlert problem={state.failure} />

  const { ticket, etag } = state
  const allowed = (command) => (ticket.allowedCommands ?? []).includes(command)
  const canEdit = allowed('CAP_NHAT_DONG')
  const prescriptions = sources?.prescriptions ?? []
  const prescriptionOf = (pid) => prescriptions.find((p) => p.id === Number(pid))

  function update(index, patch) {
    setItems((list) => list.map((item, i) => (i === index ? { ...item, ...patch } : item)))
    setDirty(true)
  }

  function addLine() {
    setItems((list) => [
      ...list,
      { source: 'CURRENT_PRESCRIPTION', prescriptionId: '', medicationDescription: '', decision: '', reason: '' },
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
    const found = itemErrors(items)
    setErrors(found)
    if (found.some((e) => Object.keys(e).length > 0)) return
    const body = itemsBody(items)
    setSaving(true)
    setProblem(null)
    setStale(null)
    setIssues([])
    try {
      const { etag: next } = await saveItems(id, etag, body, keyFor({ etag, body }))
      const reloaded = await fetchTicket()
      setState({ ticket: reloaded.ticket, etag: reloaded.etag ?? next })
      setItems(editable(reloaded.ticket.items ?? []))
      setDirty(false)
      await onChanged(`Đã lưu ${body.length} dòng của phiếu đối chiếu.`)
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

  function submitForConfirmation() {
    if (dirty) {
      setProblem({
        status: 0,
        title: 'Chưa gửi được',
        detail: 'Lưu các dòng trước khi gửi xác nhận.',
        unmetConditions: [],
      })
      return
    }
    run((key) => submitReconciliation(id, key), 'Đã gửi phiếu đối chiếu chờ xác nhận.', keyFor({ submit: id }))
  }

  const lineText = (item) =>
    item.source === 'CURRENT_PRESCRIPTION'
      ? (prescriptionOf(item.prescriptionId)?.drug ?? `đơn mã ${item.prescriptionId}`)
      : item.medicationDescription

  return (
    <section aria-labelledby={`reconciliation-${id}`} className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div className="flex flex-col gap-1">
        <h3 id={`reconciliation-${id}`} className="type-card-title">
          {`Phiếu đối chiếu #${ticket.id}, ${REASONS[ticket.reason] ?? ticket.reason}`}
        </h3>
        <span className="type-label">{STATUS[ticket.status] ?? ticket.status}</span>
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
          {items.length === 0 && <p className="type-body-sm text-muted-foreground">Phiếu chưa có dòng.</p>}
          {items.map((item, index) => (
            <LineEditor
              key={item.id ?? `new-${index}`}
              index={index}
              item={item}
              errors={errors[index] ?? {}}
              prescriptions={prescriptions}
              medications={sources?.medications ?? []}
              onChange={(patch) => update(index, patch)}
              onRemove={() => removeLine(index)}
              onCollect={() => setCollecting(index)}
            />
          ))}
          <div className="flex flex-wrap gap-2.5 pt-1">
            <Button variant="outline" className="h-9.5 gap-1.5 rounded-xl border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-800 shadow-xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200" onClick={addLine}>
              <Plus className="size-4" aria-hidden="true" />
              Thêm dòng
            </Button>
            <Button variant="outline" className="h-9.5 rounded-xl border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-800 shadow-xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200" onClick={save} disabled={saving}>
              Lưu các dòng
            </Button>
            {allowed('GUI_XAC_NHAN') && (
              <Button className="h-9.5 rounded-xl bg-[#24496f] hover:bg-[#193552] text-white px-4 text-xs font-bold shadow-xs transition-all hover:shadow-md hover:-translate-y-0.5" onClick={submitForConfirmation} disabled={saving}>
                Gửi xác nhận
              </Button>
            )}
          </div>
        </div>
      ) : (
        <ItemList items={ticket.items ?? []} lineText={lineText} />
      )}

      {(allowed('TRA_LAI') || allowed('XAC_NHAN')) && !action && (
        <div className="flex flex-wrap gap-2.5 pt-1">
          {allowed('XAC_NHAN') && (
            <Button className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 text-xs font-bold shadow-xs transition-all hover:shadow-md hover:-translate-y-0.5" onClick={() => setAction('confirm')}>
              Xác nhận phiếu
            </Button>
          )}
          {allowed('TRA_LAI') && (
            <Button variant="outline" className="h-10 rounded-xl border-amber-300 bg-amber-50/50 text-amber-900 px-4 text-xs font-bold shadow-xs hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200" onClick={() => setAction('return')}>
              Trả lại phiếu
            </Button>
          )}
        </div>
      )}
      {allowed('HUY') && !action && (
        <div>
          <Button
            variant="outline"
            className="h-10 rounded-xl border-rose-300 bg-rose-50/50 text-rose-900 px-4 text-xs font-bold shadow-xs hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200"
            onClick={() => setAction('cancel')}
          >
            Hủy phiếu
          </Button>
        </div>
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
              'Đã hủy phiếu đối chiếu. Hạn đối chiếu giữ mốc cũ.',
              keyFor({ cancel: id, reason }),
            )
          }
        />
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
                onClick={() =>
                  run(
                    (key) => confirmReconciliation(id, key),
                    'Đã xác nhận phiếu đối chiếu thuốc.',
                    keyFor({ confirm: id }),
                  )
                }
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
          onCollect={(body, medication) =>
            update(collecting, { newPrescription: body, newPrescriptionLabel: medication?.name })
          }
        />
      )}
    </section>
  )
}

function LineEditor({ index, item, errors, prescriptions, medications, onChange, onRemove, onCollect }) {
  const n = index + 1
  const fid = (name) => `line-${index}-${name}`
  // Dòng tải lại từ phiếu không còn nhãn lúc lập đơn: tra tên thuốc theo danh mục
  const newDrug =
    item.newPrescription &&
    (item.newPrescriptionLabel ??
      medications.find((m) => m.id === item.newPrescription.medicationId)?.name ??
      `thuốc mã ${item.newPrescription.medicationId}`)
  return (
    <FieldSet className="gap-3 rounded-lg border p-3">
      <FieldLegend className="type-label">{`Dòng ${n}`}</FieldLegend>
      {item.medicationRemovedFromProfile && (
        <p className="type-body-sm text-warning-foreground">
          Thuốc này đã bỏ khỏi hồ sơ sức khỏe ban đầu; sửa hoặc bỏ dòng.
        </p>
      )}
      {item.discontinuedOutsideTicket && (
        <p className="type-body-sm text-muted-foreground">Đơn đã ngừng ngoài phiếu.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={fid('source')}>Nguồn</FieldLabel>
          <select
            id={fid('source')}
            className={select}
            value={item.source}
            onChange={(e) => onChange({ source: e.target.value })}
          >
            {Object.entries(SOURCES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        {item.source === 'CURRENT_PRESCRIPTION' ? (
          <Field data-invalid={!!errors.prescriptionId || undefined}>
            <FieldLabel htmlFor={fid('prescription')}>Đơn thuốc</FieldLabel>
            <select
              id={fid('prescription')}
              className={select}
              value={item.prescriptionId}
              onChange={(e) => onChange({ prescriptionId: e.target.value })}
              aria-invalid={!!errors.prescriptionId || undefined}
            >
              <option value="">Chọn đơn</option>
              {prescriptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {`${p.drug}, ${p.dose}, ${p.status ?? p.statusCode}`}
                </option>
              ))}
            </select>
            {errors.prescriptionId && <FieldError>{errors.prescriptionId}</FieldError>}
          </Field>
        ) : (
          <Field data-invalid={!!errors.medicationDescription || undefined}>
            <FieldLabel htmlFor={fid('description')}>Thuốc</FieldLabel>
            <Input
              id={fid('description')}
              className="h-11"
              value={item.medicationDescription}
              onChange={(e) => onChange({ medicationDescription: e.target.value })}
              aria-invalid={!!errors.medicationDescription || undefined}
            />
            {errors.medicationDescription && <FieldError>{errors.medicationDescription}</FieldError>}
          </Field>
        )}
        <Field data-invalid={!!errors.decision || undefined}>
          <FieldLabel htmlFor={fid('decision')}>Quyết định</FieldLabel>
          <select
            id={fid('decision')}
            className={select}
            value={item.decision ?? ''}
            onChange={(e) => onChange({ decision: e.target.value })}
            aria-invalid={!!errors.decision || undefined}
          >
            <option value="">Chọn quyết định</option>
            {Object.entries(DECISIONS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {errors.decision && <FieldError>{errors.decision}</FieldError>}
        </Field>
        <Field data-invalid={!!errors.reason || undefined}>
          <FieldLabel htmlFor={fid('reason')}>Lý do</FieldLabel>
          <Input
            id={fid('reason')}
            className="h-11"
            value={item.reason ?? ''}
            onChange={(e) => onChange({ reason: e.target.value })}
            aria-invalid={!!errors.reason || undefined}
            aria-describedby={['DISCONTINUE', 'CHANGE_DOSE'].includes(item.decision) ? fid('basis') : undefined}
          />
          {['DISCONTINUE', 'CHANGE_DOSE'].includes(item.decision) && (
            <FieldDescription id={fid('basis')}>
              Không phải Bác sĩ có quyền kê đơn thì ghi căn cứ từ cơ sở kê bên ngoài: cơ sở, người, ngày (Q-411).
            </FieldDescription>
          )}
          {errors.reason && <FieldError>{errors.reason}</FieldError>}
        </Field>
      </div>
      {needsPrescription(item) && (
        <Field data-invalid={!!errors.newPrescription || undefined} className="gap-2">
          {item.newPrescription && (
            <span className="type-body-sm">{`Đơn mới: ${newDrug}, liều ${item.newPrescription.dosage}, ${item.newPrescription.route}`}</span>
          )}
          <div>
            <Button variant="outline" className="h-11" aria-label={`Lập đơn mới cho dòng ${n}`} onClick={onCollect}>
              Lập đơn mới
            </Button>
          </div>
          {errors.newPrescription && <FieldError>{errors.newPrescription}</FieldError>}
        </Field>
      )}
      <div>
        <Button variant="ghost" className="h-11" aria-label={`Bỏ dòng ${n}`} onClick={onRemove}>
          <Trash2 aria-hidden="true" />
          Bỏ dòng
        </Button>
      </div>
    </FieldSet>
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
