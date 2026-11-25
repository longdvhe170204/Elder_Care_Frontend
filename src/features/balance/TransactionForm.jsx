import { useRef, useState } from 'react'
import { postBalanceTransactions } from '@/api'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { ProblemAlert } from '@/common/ProblemAlert'
import { problemOf } from '@/common/problem'
import { formatDateTime } from '@/common/dateTime'
import { MoneyField, SelectField, TextField } from './BalanceFields'
import { LEDGER_LABELS, TYPE_LABELS, formatMoney, labelOf } from './balanceLabels'

// Lập hoàn tiền, hoàn cọc hoặc điều chỉnh (017 T027; FR-010, FR-011, FR-013, FR-014, BR-M11-10, BR-M11-14). Giao dịch
// vào trạng thái Chờ duyệt, Quản lý viện duyệt ở màn Yêu cầu phê duyệt của 000; giới hạn số tiền và người nhận do máy chủ
// kiểm lúc lập và lúc duyệt (409 REFUND_LIMIT_EXCEEDED, RECIPIENT_NO_LONGER_REPRESENTATIVE…). Hoàn tiền ghi vào sổ số dư,
// hoàn cọc ghi vào sổ cọc; điều chỉnh chọn sổ, số tiền có dấu và có thể trỏ giao dịch gốc.
// Demo 2026-11-25 (chủ dự án chốt): thêm "Hoàn số dư và tiền cọc" (gửi hai giao dịch REFUND, DEPOSIT_REFUND, không đổi
// api-017) và nút "Hoàn toàn bộ" điền sẵn số còn hoàn được; số tiền vẫn sửa tay được.

const TYPE_OPTIONS = [
  { value: 'REFUND', label: 'Hoàn tiền' },
  { value: 'DEPOSIT_REFUND', label: 'Hoàn tiền cọc' },
  { value: 'BOTH', label: 'Hoàn số dư và tiền cọc' },
  { value: 'ADJUSTMENT', label: 'Điều chỉnh' },
]
const LEDGER_OPTIONS = Object.entries(LEDGER_LABELS).map(([value, label]) => ({ value, label }))
const METHOD_OPTIONS = [
  { value: 'CASH', label: 'Tiền mặt' },
  { value: 'BANK_TRANSFER', label: 'Chuyển khoản' },
  { value: 'OTHER', label: 'Khác' },
]
// Ô nào báo vào lỗi nào (họ tên, giấy tờ người nhận khác chung một lỗi)
const ERROR_KEY = { otherName: 'recipient', otherDocument: 'recipient' }
const isRefund = (type) => type === 'REFUND' || type === 'DEPOSIT_REFUND' || type === 'BOTH'
const AMOUNT_ERROR = 'Nhập số tiền là số nguyên khác 0.'

// Số còn hoàn được: số dư dương; tiền cọc sau khi trừ khoản còn nợ (còn nợ thì cấn trừ cọc trước)
function refundable(balance) {
  if (!balance) return { balance: 0, deposit: 0 }
  const debt = balance.balance < 0 ? -balance.balance : 0
  return { balance: Math.max(balance.balance ?? 0, 0), deposit: Math.max((balance.depositBalance ?? 0) - debt, 0) }
}

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
export function TransactionForm({ residentId, transactions = [], representative = null, balance = null, onDone }) {
  const [v, setV] = useState({
    type: 'REFUND',
    ledger: 'BALANCE',
    amount: '',
    depositAmount: '',
    familyMemberId: representative ? String(representative.familyMemberId) : '',
    otherName: '',
    otherDocument: '',
    method: '',
    originalId: '',
    reason: '',
    note: '',
  })
  // Lỗi hiện ngay tại ô khi người dùng đã sửa ô đó; bấm gửi thì hiện mọi lỗi (demo 2026-11-25)
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [failure, setFailure] = useState(null)
  const [busy, setBusy] = useState(false)
  const key = useRef(crypto.randomUUID())
  const depositKey = useRef(crypto.randomUUID())
  const available = refundable(balance)
  const suggested =
    v.type === 'REFUND'
      ? available.balance
      : v.type === 'DEPOSIT_REFUND'
        ? available.deposit
        : v.type === 'BOTH'
          ? available.balance + available.deposit
          : 0
  const set = (name) => (value) => {
    setV((s) => ({ ...s, [name]: value }))
    setTouched((t) => ({ ...t, [ERROR_KEY[name] ?? name]: true }))
  }

  function refundAll() {
    if (v.type === 'BOTH') {
      setV((s) => ({ ...s, amount: String(available.balance), depositAmount: String(available.deposit) }))
      setTouched((t) => ({ ...t, amount: true, depositAmount: true }))
    } else set('amount')(String(suggested))
  }

  function validate() {
    const found = {}
    const amount = Number(v.amount)
    if (v.type === 'BOTH') {
      const part = (text) => text.trim() === '' || /^\d+$/.test(text.trim())
      if (!part(v.amount)) found.amount = AMOUNT_ERROR
      if (!part(v.depositAmount)) found.depositAmount = AMOUNT_ERROR
      if (!found.amount && !found.depositAmount && !(Number(v.amount) > 0 || Number(v.depositAmount) > 0))
        found.amount = 'Nhập số tiền hoàn từ số dư hoặc từ tiền cọc.'
    } else if (!/^-?\d+$/.test(v.amount.trim()) || amount === 0) found.amount = AMOUNT_ERROR
    else if (isRefund(v.type) && amount < 0) found.amount = 'Số tiền hoàn phải lớn hơn 0.'
    if (isRefund(v.type) && !representative && !(v.otherName.trim() && v.otherDocument.trim()))
      found.recipient = 'Nhập họ tên và giấy tờ của người nhận.'
    if (isRefund(v.type) && !v.method) found.method = 'Chọn phương thức hoàn.'
    if (!v.reason.trim()) found.reason = 'Nhập lý do.'
    return found
  }
  const live = validate()
  const errors = submitted ? live : Object.fromEntries(Object.entries(live).filter(([k]) => touched[k]))

  async function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    setFailure(null)
    if (Object.keys(live).length > 0) return
    const bodyOf = (type, amount) => {
      const ledger = type === 'REFUND' ? 'BALANCE' : type === 'DEPOSIT_REFUND' ? 'DEPOSIT' : v.ledger
      const body = { type, residentId, ledger, amount, reason: v.reason.trim() }
      if (isRefund(type)) {
        body.recipient = representative
          ? { familyMemberId: Number(v.familyMemberId) }
          : { fullName: v.otherName.trim(), identityDocument: v.otherDocument.trim() }
        body.method = v.method
      } else if (v.originalId) body.originalTransactionId = Number(v.originalId)
      if (v.note.trim()) body.note = v.note.trim()
      return body
    }
    // Hai phần dùng hai Idempotency-Key cố định: gửi lại sau lỗi không lập trùng phần đã lập
    const posts =
      v.type === 'BOTH'
        ? [
            Number(v.amount) > 0 && [key.current, bodyOf('REFUND', Number(v.amount))],
            Number(v.depositAmount) > 0 && [depositKey.current, bodyOf('DEPOSIT_REFUND', Number(v.depositAmount))],
          ].filter(Boolean)
        : [[key.current, bodyOf(v.type, Number(v.amount))]]
    setBusy(true)
    try {
      for (const [k, body] of posts) await postBalanceTransactions({ headers: { 'Idempotency-Key': k }, body })
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
        {v.type === 'BOTH' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <MoneyField
              id="tx-amount"
              label="Hoàn từ số dư"
              value={v.amount}
              onChange={set('amount')}
              error={errors.amount}
            />
            <MoneyField
              id="tx-deposit-amount"
              label="Hoàn từ tiền cọc"
              value={v.depositAmount}
              onChange={set('depositAmount')}
              error={errors.depositAmount}
            />
            <p className="type-body sm:col-span-2">
              Tổng hoàn{' '}
              <span className="font-semibold tabular-nums">
                {formatMoney((Number(v.amount) || 0) + (Number(v.depositAmount) || 0))}
              </span>
            </p>
          </div>
        ) : (
          <MoneyField
            id="tx-amount"
            label="Số tiền"
            value={v.amount}
            onChange={set('amount')}
            allowNegative={v.type === 'ADJUSTMENT'}
            error={errors.amount}
            hint={v.type === 'ADJUSTMENT' ? 'Điều chỉnh nhập số có dấu: âm để giảm, dương để tăng.' : undefined}
          />
        )}
        {isRefund(v.type) && suggested > 0 && (
          <Button type="button" variant="outline" className="h-11 self-start" onClick={refundAll}>
            Hoàn toàn bộ ({formatMoney(suggested)})
          </Button>
        )}
        {v.type !== 'REFUND' && isRefund(v.type) && balance?.balance < 0 && (
          <p className="type-body-sm text-muted-foreground">
            Còn nợ {formatMoney(-balance.balance)}: số gợi ý đã trừ khoản nợ khỏi tiền cọc.
          </p>
        )}
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
