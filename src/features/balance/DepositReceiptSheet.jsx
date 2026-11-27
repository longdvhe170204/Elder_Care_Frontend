import { useEffect, useState } from 'react'
import {
  getResidentsByResidentIdBalance,
  postResidentsByResidentIdBankTransferPayments,
  postResidentsByResidentIdCashPayments,
} from '@/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { ChevronDown } from 'lucide-react'
import { cn } from 'cn'
import { DateField } from '@/common/DateField'
import { DiscardChangesDialog } from '@/common/DiscardChangesDialog'
import { MoneyInput } from '@/common/MoneyInput'
import { ProblemAlert } from '@/common/ProblemAlert'
import { displayDate, isoDate, todayIso } from '@/common/dateText'
import { formatDateTime } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { Choices } from '@/features/admissions/FormParts'
import { LEDGER, TRANSACTION_TYPE } from './amounts'

// Ghi thu tiền cọc tại chỗ từ bước Đặt cọc của Hồ sơ tiếp nhận (audit BF-01 2026-11-27, chủ dự án duyệt bản phác; 017 FR-005
// → FR-007, 6.5, Q-225). Dải ba số: khoản cần đặt cọc (hợp đồng), đã thu (sổ cọc), còn thiếu; số tiền điền sẵn bằng số còn
// thiếu tới khi Kế toán sửa tay, vượt thì nhắc (vẫn lưu được). Cách nộp không chọn sẵn (Q-307). Người nộp điền sẵn người đại
// diện, sửa được. Ngày nhận, ngày thu không sau hôm nay (kiểm ở web, chủ dự án duyệt 2026-11-27). Chuyển khoản: hiện mã nộp tiền
// để đối chiếu nội dung chuyển khoản; một lần chuyển gộp cọc và tiền vào số dư ghi trong một lệnh hai dòng cùng mã giao dịch
// (FR-007). Mã giao dịch đã dùng: backend trả 409 kèm giao dịch trước, Kế toán xem rồi xác nhận lại (như PaymentRecording).
const FORM_ID = 'deposit-receipt-form'
const METHODS = [
  ['transfer', 'Chuyển khoản'],
  ['cash', 'Tiền mặt'],
]
const TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/
const money = (value) => `${Number(value ?? 0).toLocaleString('vi-VN')} đ`
const nowTime = () =>
  new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })

function Required() {
  return (
    <span aria-hidden="true" className="text-destructive">
      *
    </span>
  )
}

function Figure({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="type-caption text-muted-foreground">{label}</span>
      <span className="type-card-title tabular-nums">{value}</span>
    </div>
  )
}

function Folded({ id, label, open, onToggle, children }) {
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="ghost"
        className="h-auto justify-start gap-1 self-start px-0 type-label hover:bg-transparent"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
      >
        {label}
        <ChevronDown aria-hidden="true" className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </Button>
      {open && <div id={id}>{children}</div>}
    </div>
  )
}

export function DepositReceiptSheet({ residentId, residentName, required, onClose, onDone }) {
  const [balance, setBalance] = useState(undefined)
  const [loadFailure, setLoadFailure] = useState(null)
  const [method, setMethod] = useState('')
  const [amountInput, setAmountInput] = useState(null)
  const [balanceAmount, setBalanceAmount] = useState('')
  const [balanceOpen, setBalanceOpen] = useState(false)
  const [bankCode, setBankCode] = useState('')
  const [dateText, setDateText] = useState(displayDate(todayIso()))
  const [timeText, setTimeText] = useState(nowTime)
  const [payerInput, setPayerInput] = useState(null)
  const [note, setNote] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const [duplicates, setDuplicates] = useState(null)
  const [confirmClose, setConfirmClose] = useState(false)

  useEffect(() => {
    let active = true
    getResidentsByResidentIdBalance({ path: { residentId } })
      .then(({ data }) => active && setBalance(data))
      .catch((e) => {
        if (!active) return
        setBalance(null)
        setLoadFailure(problemOf(e))
      })
    return () => {
      active = false
    }
  }, [residentId])

  const collected = balance?.depositBalance ?? 0
  const remaining = required != null ? Math.max(required - collected, 0) : null
  const amount = amountInput ?? (remaining ? String(remaining) : '')
  const over = remaining != null && Number(amount) > remaining ? Number(amount) - remaining : 0
  const payer = payerInput ?? balance?.representative?.fullName ?? ''
  const today = todayIso()
  const date = isoDate(dateText)
  const time = TIME_PATTERN.exec(timeText.trim())
  const hhmm = time ? `${time[1].padStart(2, '0')}:${time[2]}` : null
  const withBalance = method === 'transfer' && Number(balanceAmount) > 0
  const errors = {
    method: !method && 'Chọn cách nộp',
    amount: !(Number(amount) > 0) && 'Nhập số tiền lớn hơn 0',
    bankCode: method === 'transfer' && !bankCode.trim() && 'Nhập mã giao dịch ngân hàng',
    date: !dateText.trim()
      ? 'Nhập ngày'
      : !date
        ? 'Nhập ngày có thật, dạng DD/MM/YYYY'
        : date > today && 'Ngày không sau hôm nay',
    time:
      method === 'cash' &&
      (!timeText.trim()
        ? 'Nhập giờ thu'
        : !time
          ? 'Nhập giờ dạng 24 giờ, HH:MM'
          : date === today && hhmm > nowTime() && 'Giờ không sau lúc này'),
    payer: method === 'cash' && !payer.trim() && 'Nhập người nộp',
  }
  const shown = (key) => (submitted ? errors[key] || null : null)
  const dirty =
    !!method || amountInput !== null || payerInput !== null || !!bankCode.trim() || !!balanceAmount || !!note.trim()

  function changeMethod(next) {
    setMethod(next)
    setFailure(null)
  }

  function requestClose() {
    if (busy) return
    if (dirty) setConfirmClose(true)
    else onClose()
  }

  async function send(confirmDuplicateCode) {
    setBusy(true)
    setFailure(null)
    const headers = { 'Idempotency-Key': crypto.randomUUID() }
    try {
      if (method === 'transfer')
        await postResidentsByResidentIdBankTransferPayments({
          path: { residentId },
          headers,
          body: {
            lines: [
              { ledger: 'DEPOSIT', amount: Number(amount) },
              ...(withBalance ? [{ ledger: 'BALANCE', amount: Number(balanceAmount) }] : []),
            ],
            receivedOn: date,
            bankTransactionCode: bankCode.trim(),
            payerName: payer.trim() || undefined,
            note: note.trim() || undefined,
            confirmDuplicateCode,
          },
        })
      else
        await postResidentsByResidentIdCashPayments({
          path: { residentId },
          headers,
          body: {
            ledger: 'DEPOSIT',
            amount: Number(amount),
            payerName: payer.trim(),
            receivedAt: `${date}T${hhmm}:00+07:00`,
            note: note.trim() || undefined,
          },
        })
      setDuplicates(null)
      onDone(withBalance ? 'Đã ghi thu tiền cọc và tiền vào số dư' : 'Đã ghi thu tiền cọc')
    } catch (e) {
      const p = problemOf(e)
      if (p.errorCode === 'BANK_TRANSACTION_CODE_USED') setDuplicates(e.problem?.duplicateTransactions ?? [])
      else {
        setDuplicates(null)
        setFailure(p)
      }
    } finally {
      setBusy(false)
    }
  }

  function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    if (Object.values(errors).some(Boolean) || !balance) return
    send(false)
  }

  const dateField = (label) => (
    <Field data-invalid={!!shown('date') || undefined}>
      <FieldLabel htmlFor="deposit-receipt-date">
        {label}
        <Required />
      </FieldLabel>
      <DateField
        id="deposit-receipt-date"
        value={dateText}
        onChange={setDateText}
        max={today}
        invalid={!!shown('date')}
        aria-required="true"
      />
      {shown('date') && <FieldError>{shown('date')}</FieldError>}
    </Field>
  )

  return (
    <Sheet open onOpenChange={(next) => !next && requestClose()}>
      <SheetContent side="center" className="gap-0 p-0 sm:max-w-3xl">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 flex-col gap-1 border-b px-6 pt-6 pb-4 pr-12">
            <SheetTitle className="type-title">Ghi thu tiền cọc</SheetTitle>
            <SheetDescription>{[residentName, balance?.paymentCode].filter(Boolean).join(' · ')}</SheetDescription>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            {balance === undefined && (
              <p className="type-body-sm text-muted-foreground" aria-busy="true">
                Đang tải…
              </p>
            )}
            {loadFailure && <ProblemAlert problem={loadFailure} />}
            {balance && (
              <form
                id={FORM_ID}
                onSubmit={submit}
                noValidate
                aria-busy={busy || undefined}
                aria-label="Ghi thu tiền cọc"
              >
                <FieldGroup>
                  <div className="grid gap-4 rounded-xl bg-muted/50 p-4 sm:grid-cols-3">
                    <Figure label="Khoản cần đặt cọc" value={required != null ? money(required) : 'Chưa rõ'} />
                    <Figure label="Đã thu" value={money(collected)} />
                    <Figure label="Còn thiếu" value={remaining != null ? money(remaining) : 'Chưa rõ'} />
                  </div>
                  <Choices
                    label="Cách nộp"
                    required
                    options={METHODS}
                    value={method}
                    onChange={changeMethod}
                    error={shown('method')}
                  />
                  {method === 'transfer' && balance.paymentCode && (
                    <p className="type-body-sm rounded-lg bg-muted/50 px-3 py-2">
                      Nội dung chuyển khoản phải có mã{' '}
                      <span className="font-medium tabular-nums">{balance.paymentCode}</span>
                    </p>
                  )}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field data-invalid={!!shown('amount') || undefined}>
                      <FieldLabel htmlFor="deposit-receipt-amount">
                        {method === 'transfer' ? 'Số tiền vào sổ cọc' : 'Số tiền'}
                        <Required />
                      </FieldLabel>
                      <MoneyInput
                        id="deposit-receipt-amount"
                        value={amount}
                        onChange={setAmountInput}
                        aria-required="true"
                        aria-invalid={!!shown('amount') || undefined}
                      />
                      {shown('amount') && <FieldError>{shown('amount')}</FieldError>}
                    </Field>
                    <Field data-invalid={!!shown('payer') || undefined}>
                      <FieldLabel htmlFor="deposit-receipt-payer">
                        Người nộp
                        {method === 'cash' && <Required />}
                      </FieldLabel>
                      <Input
                        id="deposit-receipt-payer"
                        className="h-11"
                        value={payer}
                        onChange={(e) => setPayerInput(e.target.value)}
                        aria-required={method === 'cash' || undefined}
                        aria-invalid={!!shown('payer') || undefined}
                      />
                      {shown('payer') && <FieldError>{shown('payer')}</FieldError>}
                    </Field>
                  </div>
                  {over > 0 && (
                    <p className="type-body-sm rounded-lg border border-warning-foreground/40 bg-warning px-3 py-2 text-warning-foreground">
                      {`Vượt khoản cần đặt cọc ${money(over)}`}
                    </p>
                  )}
                  {method === 'transfer' && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field data-invalid={!!shown('bankCode') || undefined}>
                        <FieldLabel htmlFor="deposit-receipt-bank">
                          Mã giao dịch ngân hàng
                          <Required />
                        </FieldLabel>
                        <Input
                          id="deposit-receipt-bank"
                          className="h-11"
                          autoComplete="off"
                          value={bankCode}
                          onChange={(e) => setBankCode(e.target.value)}
                          aria-required="true"
                          aria-invalid={!!shown('bankCode') || undefined}
                        />
                        {shown('bankCode') && <FieldError>{shown('bankCode')}</FieldError>}
                      </Field>
                      {dateField('Ngày nhận')}
                    </div>
                  )}
                  {method === 'cash' && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {dateField('Ngày thu')}
                      <Field data-invalid={!!shown('time') || undefined}>
                        <FieldLabel htmlFor="deposit-receipt-time">
                          Giờ
                          <Required />
                        </FieldLabel>
                        <Input
                          id="deposit-receipt-time"
                          inputMode="numeric"
                          placeholder="HH:MM"
                          maxLength={5}
                          autoComplete="off"
                          className="h-11 tabular-nums"
                          value={timeText}
                          onChange={(e) => setTimeText(e.target.value)}
                          aria-required="true"
                          aria-invalid={!!shown('time') || undefined}
                        />
                        {shown('time') && <FieldError>{shown('time')}</FieldError>}
                      </Field>
                    </div>
                  )}
                  {method === 'transfer' && (
                    <Folded
                      id="deposit-receipt-balance"
                      label="Cùng lần chuyển có tiền vào số dư"
                      open={balanceOpen}
                      onToggle={() => setBalanceOpen((v) => !v)}
                    >
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field>
                          <FieldLabel htmlFor="deposit-receipt-balance-amount">Số tiền vào số dư</FieldLabel>
                          <MoneyInput
                            id="deposit-receipt-balance-amount"
                            value={balanceAmount}
                            onChange={setBalanceAmount}
                          />
                        </Field>
                      </div>
                    </Folded>
                  )}
                  <Folded
                    id="deposit-receipt-note"
                    label="Ghi chú"
                    open={noteOpen}
                    onToggle={() => setNoteOpen((v) => !v)}
                  >
                    <Textarea aria-label="Ghi chú" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
                  </Folded>
                </FieldGroup>
              </form>
            )}
            {failure && (
              <div className="mt-4">
                <ProblemAlert problem={failure} />
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t px-6 py-4">
            <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={requestClose}>
              Hủy
            </Button>
            <Button type="submit" form={FORM_ID} className="h-11" disabled={busy || !balance}>
              {busy ? 'Đang lưu…' : 'Ghi nhận tiền cọc'}
            </Button>
          </div>
        </div>
      </SheetContent>
      <DiscardChangesDialog
        open={confirmClose}
        onKeep={() => setConfirmClose(false)}
        onDiscard={() => {
          setConfirmClose(false)
          onClose()
        }}
      />
      <Dialog open={duplicates !== null} onOpenChange={(open) => !open && setDuplicates(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mã giao dịch ngân hàng đã dùng</DialogTitle>
            <DialogDescription>{`Mã ${bankCode.trim()} đã có ở giao dịch dưới đây.`}</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-2">
            {(duplicates ?? []).map((t) => (
              <li key={t.id} className="flex flex-col gap-0.5 border-t pt-2 first:border-t-0 first:pt-0">
                <span className="type-label">
                  {TRANSACTION_TYPE[t.type] ?? t.type}, {LEDGER[t.ledger] ?? t.ledger}
                </span>
                <span className="tabular-nums">
                  {money(t.amount)}
                  {t.at && `, ${formatDateTime(t.at)}`}
                </span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicates(null)}>
              Quay lại sửa
            </Button>
            <Button onClick={() => send(true)} disabled={busy}>
              Vẫn ghi nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  )
}
