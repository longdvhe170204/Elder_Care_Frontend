import { hasReceipt, receiptName } from './balanceLabels'
import { describe, expect, it } from 'vitest'
import {
  BALANCE_STATUS_LABELS,
  LEDGER_LABELS,
  STATEMENT_TYPE_LABELS,
  TRANSACTION_STATUS_LABELS,
  TYPE_LABELS,
  formatMoney,
  labelOf,
} from './balanceLabels'

describe('balanceLabels (017)', () => {
  it('FR_002_formatMoney_dongNganCachBangDauCham_vaGachKhiThieu', () => {
    expect(formatMoney(1500000)).toBe('1.500.000 đ')
    expect(formatMoney(-250000)).toBe('-250.000 đ')
    expect(formatMoney(0)).toBe('0 đ')
    expect(formatMoney(null)).toBe('—')
    expect(formatMoney(undefined)).toBe('—')
  })

  it('FR_010_moiGiaTriEnumCuaHopDongCoNhanTiengViet', () => {
    expect(Object.keys(TYPE_LABELS).toSorted()).toEqual(
      [
        'ADJUSTMENT',
        'BANK_TRANSFER_PAYMENT',
        'CASH_PAYMENT',
        'DEPOSIT_OFFSET',
        'DEPOSIT_RECEIPT',
        'DEPOSIT_REFUND',
        'REFUND',
        'STATEMENT_PAYMENT',
      ].toSorted(),
    )
    expect(TYPE_LABELS.STATEMENT_PAYMENT).toBe('Thanh toán bảng chi phí')
    expect(LEDGER_LABELS).toEqual({ BALANCE: 'Số dư', DEPOSIT: 'Tiền cọc' })
    expect(TRANSACTION_STATUS_LABELS.PENDING_APPROVAL).toBe('Chờ duyệt')
    expect(TRANSACTION_STATUS_LABELS.CONFIRMED).toBe('Đã xác nhận')
    expect(STATEMENT_TYPE_LABELS).toEqual({
      REGULAR: 'Bảng thường',
      SUPPLEMENTARY: 'Bảng bổ sung',
      FINAL_PERIOD: 'Bảng kỳ cuối',
    })
    expect(BALANCE_STATUS_LABELS).toEqual({ NORMAL: 'Bình thường', RUNNING_LOW: 'Sắp hết tiền', IN_DEBT: 'Còn nợ' })
  })

  it('FR_010_labelOf_maLaThiGiuNguyen', () => {
    expect(labelOf(TYPE_LABELS, 'REFUND')).toBe('Hoàn tiền')
    expect(labelOf(TYPE_LABELS, 'LAI')).toBe('LAI')
  })
})

// Q-451: khoản nộp và khoản hoàn đã xác nhận có biên nhận, số BN- hoặc HT-
describe('biên nhận', () => {
  it('khoanNopVaKhoanHoan', () => {
    const paid = { id: 7, type: 'CASH_PAYMENT', status: 'CONFIRMED', amount: 100 }
    const refund = { id: 8, type: 'DEPOSIT_REFUND', status: 'CONFIRMED', amount: -100 }
    expect(hasReceipt(paid)).toBe(true)
    expect(hasReceipt(refund)).toBe(true)
    expect(hasReceipt({ ...refund, status: 'PENDING_APPROVAL' })).toBe(false)
    expect(hasReceipt({ ...paid, type: 'STATEMENT_PAYMENT', amount: -100 })).toBe(false)
    expect(receiptName(paid)).toBe('BN-000007.pdf')
    expect(receiptName(refund)).toBe('HT-000008.pdf')
  })
})
