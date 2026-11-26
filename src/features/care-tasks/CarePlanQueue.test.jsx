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

it('Q450_banChoDuyet_hienNhomRieng_khongTinhVaoHangCho', async () => {
  api.on(
    'GET',
    '/care-plan-reviews/queue',
    json(200, [
      rows[0],
      {
        residentId: 9,
        fullName: 'Ngô Quang Hiếu',
        profileCode: 'NCT-009',
        reasons: [],
        draftId: 50,
        draftReturned: false,
        pendingApproval: true,
        createdBy: 'Hoàng Thị Dung',
        waitingSince: '2026-11-26T09:40:00Z',
      },
    ]),
  )
  const onChoose = vi.fn()
  render(<CarePlanQueue onChoose={onChoose} />)
  expect(await screen.findByRole('heading', { name: 'Cần lập hoặc sửa kế hoạch (1)' })).toBeInTheDocument()
  const pending = screen.getByRole('table', { name: 'Kế hoạch đang chờ Bác sĩ duyệt' })
  expect(screen.getByRole('heading', { name: 'Đang chờ Bác sĩ duyệt (1)' })).toBeInTheDocument()
  const row = within(pending).getByRole('row', { name: /Ngô Quang Hiếu/ })
  expect(within(row).getByText('Hoàng Thị Dung')).toBeInTheDocument()
  expect(screen.getByRole('table', { name: 'Người cần lập hoặc sửa kế hoạch' })).not.toHaveTextContent('Ngô Quang Hiếu')
  fireEvent.click(within(row).getByRole('button', { name: 'Xem bản sửa của Ngô Quang Hiếu' }))
  expect(onChoose).toHaveBeenCalledWith({ id: 9, profileCode: 'NCT-009', personalInfo: { fullName: 'Ngô Quang Hiếu' } })
})
