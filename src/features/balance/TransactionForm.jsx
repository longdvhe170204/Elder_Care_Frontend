import { useRef, useState } from 'react'
import { postBalanceTransactions } from '@/api'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { ProblemAlert } from '@/common/ProblemAlert'
import { problemOf } from '@/common/problem'
import { formatDateTime } from '@/common/dateTime'
import { SelectField, TextField } from './BalanceFields'
import { LEDGER_LABELS, TYPE_LABELS, formatMoney, labelOf } from './balanceLabels'

// Lập hoàn tiền, hoàn cọc hoặc điều chỉnh (017 T027; FR-010, FR-011, FR-013, FR-014, BR-M11-10, BR-M11-14). Giao dịch
// vào trạng thái Chờ duyệt, Quản lý viện duyệt ở màn Yêu cầu phê duyệt của 000; giới hạn số tiền và người nhận do máy chủ
// kiểm lúc lập và lúc duyệt (409 REFUND_LIMIT_EXCEEDED, RECIPIENT_NO_LONGER_REPRESENTATIVE…). Hoàn tiền ghi vào sổ số dư,
// hoàn cọc ghi vào sổ cọc; điều chỉnh chọn sổ, số tiền có dấu và có thể trỏ giao dịch gốc.

const TYPE_OPTIONS = [
  { value: 'REFUND', label: 'Hoàn tiền' },
  { value: 'DEPOSIT_REFUND', label: 'Hoàn tiền cọc' },
  { value: 'ADJUSTMENT', label: 'Điều chỉnh' },
]
const LEDGER_OPTIONS = Object.entries(LEDGER_LABELS).map(([value, label]) => ({ value, label }))
const METHOD_OPTIONS = [
  { value: 'CASH', label: 'Tiền mặt' },
  { value: 'BANK_TRANSFER', label: 'Chuyển khoản' },
  { value: 'OTHER', label: 'Khác' },
]
const isRefund = (type) => type === 'REFUND' || type === 'DEPOSIT_REFUND'

// Giao dịch gốc của điều chỉnh: giao dịch Đã xác nhận cùng sổ, trừ thanh toán bảng chi phí (FR-011; máy chủ vẫn kiểm)
const originalOptions = (transactions, ledger) =>
  transactions
    .filter((t) => t.ledger === ledger && t.status === 'CONFIRMED' && t.type !== 'STATEMENT_PAYMENT')
    .map((t) => ({
      value: String(t.id),
      label: `${formatDateTime(t.at)} · ${labelOf(TYPE_LABELS, t.type)} · ${formatMoney(t.amount)}`,
    }))

// representative: người đại diện hiệu lực của sổ (api-017 Balance.representative); có thì người nhận hoàn là người này,
// không có thì ghi người nhận khác (FR-014)
export function TransactionForm({ residentId, transactions = [], representative = null, onDone }) {
  const [v, setV] = useState({
    type: 'REFUND',
    ledger: 'BALANCE',
    amount: '',
    familyMemberId: representative ? String(representative.familyMemberId) : '',
    otherName: '',
    otherDocument: '',
    method: '',
    originalId: '',
    reason: '',
    note: '',
  })
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState(null)
  const [busy, setBusy] = useState(false)
  const key = useRef(crypto.randomUUID())
  const set = (name) => (value) => setV((s) => ({ ...s, [name]: value }))

  function validate() {
    const found = {}
    const amount = Number(v.amount)
    if (!/^-?\d+$/.test(v.amount.trim()) || amount === 0) found.amount = 'Nhập số tiền là số nguyên khác 0.'
    else if (isRefund(v.type) && amount < 0) found.amount = 'Số tiền hoàn phải lớn hơn 0.'
    if (isRefund(v.type) && !representative && !(v.otherName.trim() && v.otherDocument.trim()))
      found.recipient = 'Nhập họ tên và giấy tờ của người nhận.'
    if (isRefund(v.type) && !v.method) found.method = 'Chọn phương thức hoàn.'
    if (!v.reason.trim()) found.reason = 'Nhập lý do.'
    return found
  }

  async function submit(event) {
    event.preventDefault()
    const found = validate()
    setErrors(found)
    setFailure(null)
    if (Object.keys(found).length > 0) return
    const ledger = v.type === 'REFUND' ? 'BALANCE' : v.type === 'DEPOSIT_REFUND' ? 'DEPOSIT' : v.ledger
    const body = { type: v.type, residentId, ledger, amount: Number(v.amount), reason: v.reason.trim() }
    if (isRefund(v.type)) {
      body.recipient = representative
        ? { familyMemberId: Number(v.familyMemberId) }
        : { fullName: v.otherName.trim(), identityDocument: v.otherDocument.trim() }
      body.method = v.method
    } else if (v.originalId) body.originalTransactionId = Number(v.originalId)
    if (v.note.trim()) body.note = v.note.trim()
    setBusy(true)
    try {
      await postBalanceTransactions({ headers: { 'Idempotency-Key': key.current }, body })
      onDone('Đã gửi duyệt. Quản lý viện duyệt ở màn Yêu cầu phê duyệt.')
    } catch (error) {
      setFailure(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <FieldGroup>
        <SelectField id="tx-type" label="Loại giao dịch" value={v.type} onChange={set('type')} options={TYPE_OPTIONS} />
        {v.type === 'ADJUSTMENT' && (
          <SelectField
            id="tx-ledger"
            label="Sổ"
            value={v.ledger}
            onChange={(ledger) => setV((s) => ({ ...s, ledger, originalId: '' }))}
            options={LEDGER_OPTIONS}
          />
        )}
        <TextField
          id="tx-amount"
          label="Số tiền"
          inputMode="numeric"
          value={v.amount}
          onChange={set('amount')}
          error={errors.amount}
          hint={v.type === 'ADJUSTMENT' ? 'Điều chỉnh nhập số có dấu: âm để giảm, dương để tăng.' : 'Đơn vị đồng.'}
        />
        {isRefund(v.type) && (
          <>
            {representative ? (
              <SelectField
                id="tx-recipient"
                label="Người nhận"
                value={v.familyMemberId}
                onChange={set('familyMemberId')}
                options={[
                  {
                    value: String(representative.familyMemberId),
                    label: `${representative.fullName ?? `Người thân mã ${representative.familyMemberId}`} (người đại diện)`,
                  },
                ]}
                hint="Hoàn tiền cho người đại diện đang có quan hệ hiệu lực."
              />
            ) : (
              <div className="flex flex-col gap-2">
                <p className="type-body-sm text-muted-foreground">
                  Hồ sơ chưa có người đại diện hiệu lực: ghi họ tên và giấy tờ của người nhận, Quản lý viện duyệt kèm lý
                  do.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    id="tx-other-name"
                    label="Họ tên người nhận khác"
                    value={v.otherName}
                    onChange={set('otherName')}
                    error={errors.recipient}
                  />
                  <TextField
                    id="tx-other-doc"
                    label="Giấy tờ người nhận khác"
                    value={v.otherDocument}
                    onChange={set('otherDocument')}
                  />
                </div>
              </div>
            )}
            <SelectField
              id="tx-method"
              label="Phương thức"
              value={v.method}
              onChange={set('method')}
              options={METHOD_OPTIONS}
              placeholder="Chọn phương thức"
              error={errors.method}
            />
          </>
        )}
        {v.type === 'ADJUSTMENT' && (
          <SelectField
            id="tx-original"
            label="Giao dịch gốc"
            value={v.originalId}
            onChange={set('originalId')}
            options={originalOptions(transactions, v.ledger)}
            placeholder="Không trỏ giao dịch nào"
            hint="Chọn khi sửa sai một giao dịch đã xác nhận của sổ này. Không điều chỉnh thanh toán bảng chi phí."
          />
        )}
        <Field data-invalid={!!errors.reason || undefined}>
          <FieldLabel htmlFor="tx-reason">Lý do</FieldLabel>
          <Textarea
            id="tx-reason"
            rows={2}
            maxLength={2000}
            value={v.reason}
            onChange={(e) => set('reason')(e.target.value)}
            aria-invalid={!!errors.reason || undefined}
          />
          {errors.reason && <FieldError>{errors.reason}</FieldError>}
        </Field>
        <Field>
          <FieldLabel htmlFor="tx-note">Ghi chú (không bắt buộc)</FieldLabel>
          <Textarea id="tx-note" rows={2} value={v.note} onChange={(e) => set('note')(e.target.value)} />
        </Field>
      </FieldGroup>
      <ProblemAlert problem={failure} />
      <Button type="submit" className="h-11" disabled={busy}>
        Gửi duyệt
      </Button>
    </form>
  )
}
