import { expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { getCostsPostFinalizationChanges } from '@/api'
import { PostFinalizationChanges } from './PostFinalizationChanges'

vi.mock('@/api', () => ({
  getCostsPostFinalizationChanges: vi.fn(),
  postCostsItemsByIdAdjust: vi.fn(),
  getResidents: vi.fn().mockResolvedValue({
    data: { items: [{ id: 42, profileCode: 'NCT-0042', personalInfo: { fullName: 'Nguyễn Văn Tư' } }] },
  }),
}))

it('FR_027_showsBedReleaseBeforeAndAfterWithoutSuggestingAnAdjustmentAmount', async () => {
  getCostsPostFinalizationChanges.mockResolvedValue({
    data: [
      {
        id: 9,
        itemId: 7,
        residentId: 42,
        event: 'RESIDENCY_CHANGED',
        reference: 'absence:10',
        occurredAt: '2026-11-07T03:00:00Z',
        before: { day: { presence: 'ABSENT', bedReleased: false } },
        after: { day: { presence: 'ABSENT', bedReleased: true } },
      },
    ],
  })
  render(<PostFinalizationChanges />)
  fireEvent.click(screen.getByRole('button', { name: 'Tra cứu biến động' }))
  expect(await screen.findByText('Chưa giải phóng')).toBeInTheDocument()
  expect(screen.getByText('Đã giải phóng')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Điều chỉnh khoản #7' }))
  expect(screen.getByLabelText('Số tiền điều chỉnh')).toHaveValue('')
})

// Demo 2026-11-25: lọc theo người cao tuổi chọn theo tên; dòng biến động hiện tên
it('locTheoNguoiCaoTuoiChonTheoTen_dongHienTen', async () => {
  getCostsPostFinalizationChanges.mockResolvedValue({
    data: [
      {
        id: 9,
        itemId: 7,
        residentId: 42,
        event: 'RESIDENCY_CHANGED',
        reference: 'absence:10',
        occurredAt: '2026-11-07T03:00:00Z',
        before: { day: { presence: 'ABSENT', bedReleased: false } },
        after: { day: { presence: 'ABSENT', bedReleased: true } },
      },
    ],
  })
  render(<PostFinalizationChanges />)
  await screen.findByRole('option', { name: 'Nguyễn Văn Tư (NCT-0042)' })
  fireEvent.change(screen.getByLabelText('Người cao tuổi (không bắt buộc)'), { target: { value: '42' } })
  fireEvent.click(screen.getByRole('button', { name: 'Tra cứu biến động' }))
  expect(await screen.findByText(/Nguyễn Văn Tư/, { selector: 'p, span, td, div' })).toBeInTheDocument()
  expect(getCostsPostFinalizationChanges.mock.calls.at(-1)[0].query).toEqual({ residentId: 42 })
})
