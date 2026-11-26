import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { json, mockRoutes } from '@/test/fetchRoutes'
import { CarePlanQueue } from './CarePlanQueue'
import { waitingText } from './carePlanLabels'

let api
beforeEach(() => {
  api = mockRoutes()
})
afterEach(() => vi.unstubAllGlobals())

const rows = [
  {
    residentId: 7,
    fullName: 'Trần Thị Bình',
    profileCode: 'NCT-007',
    reasons: [{ source: 'M05.INCIDENT', sourceId: 3, reference: '3', raisedAt: '2026-11-24T07:20:00Z' }],
    draftId: null,
    draftReturned: false,
    waitingSince: '2026-11-24T07:20:00Z',
  },
  {
    residentId: 8,
    fullName: 'Phạm Thị Dung',
    profileCode: 'NCT-008',
    reasons: [],
    draftId: 41,
    draftReturned: true,
    waitingSince: '2026-11-25T02:00:00Z',
  },
]

it('Q448_hangCho_hienLyDoThoiGianChoVaBanTraLai_bamDongChonNguoi', async () => {
  api.on('GET', '/care-plan-reviews/queue', json(200, rows))
  const onChoose = vi.fn()
  render(<CarePlanQueue onChoose={onChoose} />)

  expect(await screen.findByRole('heading', { name: 'Cần lập hoặc sửa kế hoạch (2)' })).toBeInTheDocument()
  const first = screen.getByRole('row', { name: /Trần Thị Bình/ })
  expect(within(first).getByText('Sự cố ngã')).toBeInTheDocument()
  expect(within(first).getByText(/^Chờ /)).toBeInTheDocument()
  const second = screen.getByRole('row', { name: /Phạm Thị Dung/ })
  expect(within(second).getByText('Bác sĩ trả lại')).toBeInTheDocument()

  fireEvent.click(within(first).getByRole('button', { name: 'Mở kế hoạch của Trần Thị Bình' }))
  expect(onChoose).toHaveBeenCalledWith({ id: 7, profileCode: 'NCT-007', personalInfo: { fullName: 'Trần Thị Bình' } })
})

it('Q448_hangChoRong_noiKhongAiCanLap', async () => {
  api.on('GET', '/care-plan-reviews/queue', json(200, []))
  render(<CarePlanQueue onChoose={() => {}} />)
  expect(await screen.findByText('Không có ai cần lập hoặc sửa kế hoạch')).toBeInTheDocument()
})

it('Q448_thoiGianCho', () => {
  const now = new Date('2026-11-26T10:00:00Z')
  expect(waitingText('2026-11-24T07:00:00Z', now)).toBe('Chờ 2 ngày')
  expect(waitingText('2026-11-26T05:00:00Z', now)).toBe('Chờ 5 giờ')
  expect(waitingText('2026-11-26T09:30:00Z', now)).toBe('Chờ dưới 1 giờ')
})
