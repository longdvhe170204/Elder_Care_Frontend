import { useEffect, useState } from 'react'
import {
  getResidentsById,
  getResidentsByResidentIdRelationships,
  getMe,
  getResidencyEndingsByIdConditions,
  getStaff,
  postResidencyEndings,
  postResidencyEndingsByIdCancel,
  postResidencyEndingsByIdChangeDate,
  postResidencyEndingsByIdHandover,
  postResidentsByIdEndResidency,
} from '@/api'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { ProblemAlert } from '@/common/ProblemAlert'
import { SuggestField } from '@/common/SuggestField'
import { StatusBadge } from '@/common/StatusBadge'
import { formatDate, formatDateTime } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { CONDITION_STATUS, END_CASES, ENDING_STATUS, SELECT, labelOf, newKey, vietnamIso } from './admissionLabels'
import { Choices, Info, ReasonField, ResidentSelect } from './FormParts'

// Hồ sơ kết thúc lưu trú (004 T061, T107; US7, FR-062 → FR-067, Q-379). Điều kiện (a) → (h); (h) có hai ý (quyết toán số dư,
// tiền cọc và Kế toán đã xác nhận quyết toán). Demo 2026-11-25 (chủ dự án chốt): bỏ xin ngoại lệ; nút Xác nhận kết thúc mở
// khi các điều kiện khác đã đạt, ghi bàn giao rồi gửi lệnh Kết thúc lưu trú của 001 (lệnh vẫn có ở tab Trạng thái).

const SETTLEMENT = ['END_H_SETTLEMENT', 'END_H_SETTLEMENT_CONFIRMATION']
const HANDOVER = 'END_E_HANDOVER'
const HOUSE_LABEL = 'Điều kiện (h): số dư và tiền cọc đã quyết toán'

// Trạng thái có màu (Đạt xanh, Chưa đạt đỏ; DESIGN.md mục 3.5). Lý do chỉ hiện khi Chưa đạt: dòng Đạt, Tự động backend
// trả căn cứ là mã spec (FR-063 …), không phải chữ cho người dùng
function ConditionLine({ line }) {
  return (
    <li className="flex flex-col">
      <span className="flex flex-wrap items-center gap-x-2">
        <span className="type-body-sm">{line.name ?? line.code}</span>
        <StatusBadge status={CONDITION_STATUS[line.status] ?? line.status} />
      </span>
      {line.status === 'NOT_MET' && line.basis && (
        <span className="type-caption text-muted-foreground">{line.basis}</span>
      )}
    </li>
  )
}

function Conditions({ conditions }) {
  const settlement = conditions.filter((c) => SETTLEMENT.includes(c.code))
  const rest = conditions.filter((c) => !SETTLEMENT.includes(c.code))
  return (
    <section className="flex flex-col gap-2">
      <h3 className="type-card-title">Điều kiện kết thúc</h3>
      <ul className="flex flex-col gap-2">
        {rest.map((c) => (
          <ConditionLine key={c.code} line={c} />
        ))}
      </ul>
      {settlement.length > 0 && (
        <ul role="group" aria-label={HOUSE_LABEL} className="flex flex-col gap-2 border-t pt-2">
          {settlement.map((c) => (
            <ConditionLine key={c.code} line={c} />
          ))}
        </ul>
      )}
    </section>
  )
}

// Giờ hiện tại theo giờ máy cho ô datetime-local (người dùng sửa được)
function nowLocal() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

// Điều kiện còn chặn nút Xác nhận kết thúc: mọi dòng Chưa đạt trừ (e) bàn giao, vì bàn giao ghi ngay trong form xác nhận
const blockingLines = (conditions) => conditions.filter((c) => c.status === 'NOT_MET' && c.code !== HANDOVER)

// Xác nhận kết thúc (demo 2026-11-25, chủ dự án chốt): chỉ mở khi mọi điều kiện khác đã đạt; form ghi bàn giao (người nhận
// là người thân, bỏ lựa chọn cơ sở tiếp nhận và mã bản ghi đón) rồi gửi luôn lệnh Kết thúc lưu trú của 001 với thời điểm
// bàn giao. Đã có bàn giao (lần trước lệnh kết thúc lỗi) thì chỉ gửi lệnh kết thúc. Người ghi không xem được hồ sơ nhân
// viên (Hành chính) thì nhân viên bàn giao là chính người ghi, hiện họ tên theo /me.
function ConfirmEndForm({ ending, onDone, onCancel }) {
  const handedOver = !!ending.handover
  const [members, setMembers] = useState([])
  // null: đang tải. Rỗng: người ghi không xem được hồ sơ nhân viên thì backend lấy chính người ghi (BF-10 bước 6)
  const [staff, setStaff] = useState(null)
  const [me, setMe] = useState('')
  const [memberId, setMemberId] = useState('')
  const [at, setAt] = useState(nowLocal)
  const [staffId, setStaffId] = useState('')
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const [keys] = useState(() => ({ handover: newKey(), end: crypto.randomUUID() }))

  useEffect(() => {
    getResidentsByResidentIdRelationships({ path: { residentId: ending.residentId } })
      .then(({ data }) => setMembers(data.filter((r) => r.status === 'ACTIVE')))
      .catch(() => {})
    getStaff({ query: { status: 'WORKING' } })
      .then(({ data }) => setStaff(data ?? []))
      .catch(() => setStaff([]))
    getMe()
      .then(({ data }) => setMe(data?.fullName ?? ''))
      .catch(() => {})
  }, [ending.residentId])

  const recorderIsStaff = staff !== null && staff.length === 0
  const errors = {
    member: !handedOver && !memberId && 'Chọn người thân nhận',
    at: !at && 'Nhập thời điểm bàn giao',
    staff: !handedOver && !recorderIsStaff && !staffId && 'Chọn nhân viên bàn giao',
    reason: !reason.trim() && 'Nhập lý do',
  }

  async function save() {
    setSubmitted(true)
    if (Object.values(errors).some(Boolean)) return
    setBusy(true)
    setFailure(null)
    try {
      if (!handedOver)
        await postResidencyEndingsByIdHandover({
          path: { id: ending.id },
          headers: keys.handover,
          body: {
            recipientType: 'FAMILY_MEMBER',
            familyMemberId: Number(memberId),
            handoverAt: vietnamIso(at),
            ...(!recorderIsStaff && { handoverStaffId: Number(staffId) }),
          },
        })
      await postResidentsByIdEndResidency({
        path: { id: ending.residentId },
        headers: { 'Idempotency-Key': keys.end },
        body: { reason: reason.trim(), details: { residencyEndingId: ending.id, effectiveAt: vietnamIso(at) } },
      })
      onDone('Đã kết thúc lưu trú')
    } catch (e) {
      setFailure(problemOf(e))
    } finally {
      setBusy(false)
    }
  }

  const shown = (key) => (submitted ? errors[key] : null)
  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <h3 className="type-card-title">Xác nhận kết thúc lưu trú</h3>
      <FieldGroup>
        {handedOver ? (
          <Info label="Bàn giao">Đã ghi nhận bàn giao, chỉ còn xác nhận kết thúc</Info>
        ) : (
          <Field data-invalid={!!shown('member') || undefined}>
            <FieldLabel htmlFor="handover-member">Người thân nhận</FieldLabel>
            <select
              id="handover-member"
              className={SELECT}
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
            >
              <option value="">Chọn người thân</option>
              {members.map((r) => (
                <option key={r.id} value={r.familyMember.id}>
                  {r.familyMember.fullName}
                </option>
              ))}
            </select>
            {shown('member') && <FieldError>{shown('member')}</FieldError>}
          </Field>
        )}
        <Field data-invalid={!!shown('at') || undefined}>
          <FieldLabel htmlFor="handover-at">Thời điểm bàn giao, kết thúc</FieldLabel>
          <Input
            id="handover-at"
            type="datetime-local"
            className="h-11"
            value={at}
            onChange={(e) => setAt(e.target.value)}
          />
          {shown('at') && <FieldError>{shown('at')}</FieldError>}
        </Field>
        {handedOver ? null : recorderIsStaff ? (
          <Info label="Nhân viên bàn giao">{me || 'Người ghi bàn giao'}</Info>
        ) : (
          <Field data-invalid={!!shown('staff') || undefined}>
            <FieldLabel htmlFor="handover-staff">Nhân viên bàn giao</FieldLabel>
            <select id="handover-staff" className={SELECT} value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">Chọn nhân viên</option>
              {(staff ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName ?? s.name ?? `Mã ${s.id}`}
                </option>
              ))}
            </select>
            {shown('staff') && <FieldError>{shown('staff')}</FieldError>}
          </Field>
        )}
        <ReasonField id="end-reason" value={reason} onChange={setReason} error={shown('reason')} />
      </FieldGroup>
      <ProblemAlert problem={failure} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" className="h-11" onClick={onCancel}>
          Đóng
        </Button>
        <Button className="h-11" disabled={busy} onClick={save}>
          Xác nhận kết thúc
        </Button>
      </div>
    </div>
  )
}

export function EndingView({ ending, canUpdate, onChanged }) {
  const [name, setName] = useState('')
  const [conditions, setConditions] = useState(null)
  const [mode, setMode] = useState(null)
  const [reason, setReason] = useState('')
  const [date, setDate] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [failure, setFailure] = useState(null)
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const preparing = ending.status === 'PREPARING'

  useEffect(() => {
    let cancelled = false
    getResidentsById({ path: { id: ending.residentId } })
      .then(({ data }) => !cancelled && setName(data.personalInfo?.fullName ?? ''))
      .catch(() => {})
    getResidencyEndingsByIdConditions({ path: { id: ending.id } })
      .then(({ data }) => !cancelled && setConditions(data.conditions))
      .catch((e) => !cancelled && setFailure(problemOf(e)))
    return () => {
      cancelled = true
    }
  }, [ending.id, ending.residentId, ending.status, reload])

  function open(next) {
    setMode(next)
    setReason('')
    setDate('')
    setSubmitted(false)
    setFailure(null)
  }

  async function run(call, body, message) {
    setBusy(true)
    setFailure(null)
    try {
      await call({ path: { id: ending.id }, headers: newKey(), body })
      open(null)
      setReload((n) => n + 1)
      onChanged(message)
    } catch (e) {
      setFailure(problemOf(e))
    } finally {
      setBusy(false)
    }
  }

  function submit() {
    setSubmitted(true)
    if (!reason.trim()) return
    if (mode === 'change-date') {
      if (!date) return
      run(
        postResidencyEndingsByIdChangeDate,
        { expectedEndDate: date, reason: reason.trim() },
        'Đã đổi ngày kết thúc dự kiến',
      )
    } else {
      run(postResidencyEndingsByIdCancel, { reason: reason.trim() }, 'Đã hủy hồ sơ kết thúc')
    }
  }

  const blocking = conditions ? blockingLines(conditions) : null
  const canConfirm = blocking !== null && blocking.length === 0
  const reasonError = submitted && !reason.trim() ? 'Nhập lý do' : null

  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
      <div className="flex flex-col gap-1">
        <StatusBadge status={ENDING_STATUS[ending.status] ?? ending.status} />
        <h2 className="type-title">{name || `Người cao tuổi mã ${ending.residentId}`}</h2>
        <p className="type-body-sm text-muted-foreground">{labelOf(END_CASES, ending.endCase)}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Info label="Ngày kết thúc dự kiến">{formatDate(ending.expectedEndDate)}</Info>
        {ending.destination && <Info label="Nơi chuyển đến">{ending.destination}</Info>}
        {ending.actualEndedAt && <Info label="Đã kết thúc lúc">{formatDateTime(ending.actualEndedAt)}</Info>}
        {ending.overdueSince && <Info label="Quá hạn từ">{formatDate(ending.overdueSince)}</Info>}
        {ending.handover && (
          <Info label="Bàn giao">
            {`${ending.handover.recipient ?? ''}, ${ending.handover.at ? formatDateTime(ending.handover.at) : ''}`}
          </Info>
        )}
      </div>
      <ProblemAlert problem={failure} />
      {conditions && <Conditions conditions={conditions} />}

      {preparing && canUpdate && mode === null && (
        <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
          {!canConfirm && blocking && (
            <p className="type-body-sm mr-auto self-center text-muted-foreground">
              Còn {blocking.length} điều kiện chưa đạt, xử lý xong mới xác nhận kết thúc được.
            </p>
          )}
          <Button variant="outline" className="h-11" onClick={() => open('change-date')}>
            Đổi ngày kết thúc…
          </Button>
          <Button variant="outline" className="h-11" onClick={() => open('cancel')}>
            Hủy hồ sơ…
          </Button>
          <Button className="h-11" disabled={!canConfirm} onClick={() => open('confirm')}>
            Xác nhận kết thúc
          </Button>
        </div>
      )}

      {mode === 'confirm' && (
        <ConfirmEndForm
          ending={ending}
          onCancel={() => open(null)}
          onDone={(message) => {
            open(null)
            setReload((n) => n + 1)
            onChanged(message)
          }}
        />
      )}
      {['change-date', 'cancel'].includes(mode) && (
        <div className="flex flex-col gap-3 border-t pt-4">
          <FieldGroup>
            {mode === 'change-date' && (
              <Field data-invalid={(submitted && !date) || undefined}>
                <FieldLabel htmlFor="ending-new-date">Ngày kết thúc dự kiến mới</FieldLabel>
                <Input
                  id="ending-new-date"
                  type="date"
                  className="h-11"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
                {submitted && !date && <FieldError>Nhập ngày mới</FieldError>}
              </Field>
            )}
            <ReasonField id="ending-reason" value={reason} onChange={setReason} error={reasonError} />
          </FieldGroup>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="h-11" onClick={() => open(null)}>
              Đóng
            </Button>
            <Button className="h-11" disabled={busy} onClick={submit}>
              {{ 'change-date': 'Lưu ngày mới', cancel: 'Xác nhận hủy hồ sơ' }[mode]}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// Gợi ý người đề nghị theo tên: chính người cao tuổi, người thân đang có quan hệ và nhân viên đang làm việc (demo
// 2026-11-25); ghi kèm vai trò để phân biệt người trùng tên. Không tải được nhóm nào thì bỏ nhóm đó, vẫn gõ tự do được.
function useRequesterOptions(residentId) {
  const [staff, setStaff] = useState([])
  const [resident, setResident] = useState({ id: null, names: [] })
  useEffect(() => {
    getStaff({ query: { status: 'WORKING' } })
      .then(({ data }) => setStaff((data ?? []).map((s) => `${s.fullName} (${s.position ?? 'nhân viên'})`)))
      .catch(() => {})
  }, [])
  useEffect(() => {
    if (!residentId) return
    let cancelled = false
    Promise.allSettled([
      getResidentsById({ path: { id: residentId } }),
      getResidentsByResidentIdRelationships({ path: { residentId } }),
    ]).then(([self, relations]) => {
      if (cancelled) return
      const names = []
      const own = self.status === 'fulfilled' && self.value.data.personalInfo?.fullName
      if (own) names.push(`${own} (người cao tuổi)`)
      if (relations.status === 'fulfilled')
        for (const r of relations.value.data.filter((x) => x.status === 'ACTIVE'))
          names.push(`${r.familyMember.fullName} (người thân)`)
      setResident({ id: residentId, names })
    })
    return () => {
      cancelled = true
    }
  }, [residentId])
  return [...(resident.id === residentId ? resident.names : []), ...staff]
}

export function CreateEndingSheet({ role, onClose, onDone }) {
  const [residentId, setResidentId] = useState('')
  const [endCase, setEndCase] = useState('')
  const [medical, setMedical] = useState(false)
  const [date, setDate] = useState('')
  const [destination, setDestination] = useState('')
  const [requestedBy, setRequestedBy] = useState('')
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const requesterOptions = useRequesterOptions(residentId)
  const cases =
    role === 'DOCTOR' ? END_CASES.filter(([c]) => ['DISCHARGE', 'TRANSFER_TO_ANOTHER_FACILITY'].includes(c)) : END_CASES

  const errors = {
    resident: !residentId && 'Chọn người cao tuổi',
    endCase: !endCase && 'Chọn trường hợp kết thúc',
    date: !date && 'Nhập ngày kết thúc dự kiến',
    destination: endCase === 'TRANSFER_TO_ANOTHER_FACILITY' && !destination.trim() && 'Nhập nơi chuyển đến',
    requestedBy: !requestedBy.trim() && 'Nhập người đề nghị',
    reason: !reason.trim() && 'Nhập lý do',
  }
  const shown = (key) => (submitted ? errors[key] : null)

  async function save() {
    setSubmitted(true)
    if (Object.values(errors).some(Boolean)) return
    setBusy(true)
    setFailure(null)
    try {
      const { data } = await postResidencyEndings({
        headers: newKey(),
        body: {
          residentId: Number(residentId),
          endCase,
          medicalReason: medical,
          expectedEndDate: date,
          ...(destination.trim() && { destination: destination.trim() }),
          requestedBy: requestedBy.trim(),
          reason: reason.trim(),
        },
      })
      onDone(data)
    } catch (e) {
      setFailure(problemOf(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto p-6 sm:max-w-lg">
        <SheetTitle>Lập hồ sơ kết thúc lưu trú</SheetTitle>
        <SheetDescription>
          Mỗi người tối đa một hồ sơ chưa ở trạng thái cuối; bảng kỳ cuối nháp được tạo cùng lúc.
        </SheetDescription>
        <FieldGroup className="mt-4">
          <ResidentSelect
            id="ending-resident"
            statuses={['IN_RESIDENCE', 'TEMPORARILY_ABSENT', 'HOSPITALIZED']}
            value={residentId}
            onChange={setResidentId}
            error={shown('resident')}
            onFailure={(e) => setFailure(problemOf(e))}
          />
          <Choices
            label="Trường hợp kết thúc"
            options={cases}
            value={endCase}
            onChange={setEndCase}
            error={shown('endCase')}
          />
          <Field>
            <label className="flex items-center gap-2 type-body-sm">
              <input type="checkbox" checked={medical} onChange={(e) => setMedical(e.target.checked)} />
              Vì lý do y tế
            </label>
          </Field>
          <Field data-invalid={!!shown('date') || undefined}>
            <FieldLabel htmlFor="ending-date">Ngày kết thúc dự kiến</FieldLabel>
            <Input
              id="ending-date"
              type="date"
              className="h-11"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            {shown('date') && <FieldError>{shown('date')}</FieldError>}
          </Field>
          <Field data-invalid={!!shown('destination') || undefined}>
            <FieldLabel htmlFor="ending-destination">Nơi chuyển đến</FieldLabel>
            <Input
              id="ending-destination"
              className="h-11"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
            {shown('destination') && <FieldError>{shown('destination')}</FieldError>}
          </Field>
          <SuggestField
            id="ending-requested-by"
            label="Người đề nghị"
            value={requestedBy}
            onChange={setRequestedBy}
            options={requesterOptions}
            error={shown('requestedBy')}
            hint="Gõ tên để tìm người cao tuổi, người thân hoặc nhân viên."
          />
          <ReasonField id="ending-create-reason" value={reason} onChange={setReason} error={shown('reason')} />
        </FieldGroup>
        <div className="mt-4">
          <ProblemAlert problem={failure} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" className="h-11" onClick={onClose}>
            Đóng
          </Button>
          <Button className="h-11" disabled={busy} onClick={save}>
            Lập hồ sơ
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
