import { describe, expect, it } from 'vitest'
import { validateChange } from './changeRequestRules'

// Q-462: đổi loại lưu trú thì kỳ tính phí sau thay đổi phải hợp loại mới
describe('validateChange kỳ tính phí khi đổi loại lưu trú', () => {
  const dayCare = { residenceType: 'DAY_CARE', residencyFeeBillingPeriod: 'SESSION', startDate: '2026-01-01' }
  const base = { types: ['RESIDENCE_TYPE', 'BED'], date: '2026-12-01', contract: dayCare }

  it('kyHienTaiKhongHopLoaiMoi_batChonKyMoi', () => {
    const errors = validateChange({ ...base, value: { residenceType: 'LONG_TERM_RESIDENTIAL', newBedId: 5 } })
    expect(errors.residencyFeeBillingPeriod).toBe('Chọn kỳ tính phí mới cho loại lưu trú mới')
  })

  it('kyMoiKhongHopLoaiMoi_baoLoi', () => {
    const errors = validateChange({
      ...base,
      value: { residenceType: 'LONG_TERM_RESIDENTIAL', newBedId: 5, residencyFeeBillingPeriod: 'DAY' },
    })
    expect(errors.residencyFeeBillingPeriod).toBe('Kỳ tính phí này không dùng được cho loại lưu trú mới')
  })

  it('kyMoiHopLoaiMoi_khongLoi', () => {
    const errors = validateChange({
      ...base,
      value: { residenceType: 'LONG_TERM_RESIDENTIAL', newBedId: 5, residencyFeeBillingPeriod: 'MONTH' },
    })
    expect(errors.residencyFeeBillingPeriod).toBeUndefined()
  })

  it('kyHienTaiHopLoaiMoi_khongCanChon', () => {
    const errors = validateChange({
      types: ['RESIDENCE_TYPE', 'DURATION'],
      date: '2026-12-01',
      contract: { residenceType: 'LONG_TERM_RESIDENTIAL', residencyFeeBillingPeriod: 'MONTH', startDate: '2026-01-01' },
      value: { residenceType: 'SHORT_TERM_RESIDENTIAL', endDate: '2027-01-31' },
    })
    expect(errors.residencyFeeBillingPeriod).toBeUndefined()
  })
})
