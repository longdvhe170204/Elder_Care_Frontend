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

  expect(await screen.findByRole('tab', { name: 'Cần lập hoặc sửa (2)' })).toHaveAttribute('aria-selected', 'true')
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
  expect(await screen.findByRole('tab', { name: 'Cần lập hoặc sửa (1)' })).toBeInTheDocument()
  expect(screen.getByRole('table', { name: 'Người cần lập hoặc sửa kế hoạch' })).not.toHaveTextContent('Ngô Quang Hiếu')
  expect(screen.queryByRole('table', { name: 'Kế hoạch đang chờ Bác sĩ duyệt' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Đang chờ duyệt (1)' }))
  const pending = screen.getByRole('table', { name: 'Kế hoạch đang chờ Bác sĩ duyệt' })
  expect(screen.queryByRole('table', { name: 'Người cần lập hoặc sửa kế hoạch' })).not.toBeInTheDocument()
  const row = within(pending).getByRole('row', { name: /Ngô Quang Hiếu/ })
  expect(within(row).getByText('Hoàng Thị Dung')).toBeInTheDocument()
  fireEvent.click(within(row).getByRole('button', { name: 'Xem bản sửa của Ngô Quang Hiếu' }))
  expect(onChoose).toHaveBeenCalledWith({ id: 9, profileCode: 'NCT-009', personalInfo: { fullName: 'Ngô Quang Hiếu' } })
})

const approvedRow = {
  residentId: 9,
  fullName: 'Ngô Quang Hiếu',
  profileCode: 'NCT-009',
  planId: 50,
  status: 'PENDING_EFFECT',
  approvedBy: 'Hoàng Thị Dung',
  approvedAt: '2026-11-26T10:36:00Z',
  effectiveFrom: '2026-11-27',
  selfApproved: true,
}

it('Q451_tabDaDuyet_hienNguoiDuyetNgayApDungVaMoKeHoach', async () => {
  api.on('GET', '/care-plan-reviews/queue', json(200, []))
  api.on(
    'GET',
    '/care-plan-reviews/approved',
    json(200, [
      approvedRow,
      { ...approvedRow, planId: 49, status: 'EFFECTIVE', selfApproved: false, effectiveFrom: '2026-11-26' },
      { ...approvedRow, planId: 48, status: 'CANCELLED', selfApproved: false },
    ]),
  )
  const onChoose = vi.fn()
  render(<CarePlanQueue onChoose={onChoose} />)

  fireEvent.click(await screen.findByRole('tab', { name: 'Đã duyệt (3)' }))
  const table = screen.getByRole('table', { name: 'Kế hoạch đã duyệt' })
  expect(within(table).getAllByRole('columnheader').slice(0, 4).map((heading) => heading.textContent))
    .toEqual(['Người cao tuổi', 'Người duyệt', 'Duyệt lúc', 'Áp dụng từ'])
  const [pending, effective, superseded] = within(table).getAllByRole('row', { name: /Ngô Quang Hiếu/ })
  expect(within(pending).getByText('NCT-009')).toBeInTheDocument()
  expect(within(pending).getByText('Hoàng Thị Dung')).toBeInTheDocument()
  expect(within(pending).getByText('Tự duyệt')).toBeInTheDocument()
  expect(within(pending).getByText('26/11/2026 17:36')).toBeInTheDocument()
  expect(within(pending).getByText('27/11/2026')).toBeInTheDocument()
  expect(within(pending).getByText('Từ ngày mai')).toBeInTheDocument()
  expect(within(effective).getByText('Đang áp dụng')).toBeInTheDocument()
  expect(within(superseded).queryByText(/Đang áp dụng|Từ ngày mai/)).not.toBeInTheDocument()
  fireEvent.click(within(pending).getByRole('button', { name: 'Xem kế hoạch của Ngô Quang Hiếu' }))
  expect(onChoose).toHaveBeenCalledWith({ id: 9, profileCode: 'NCT-009', personalInfo: { fullName: 'Ngô Quang Hiếu' } })
})

it('Q451_tabDaDuyet_phanTrangVaTroVeTrangDauKhiDoiTab', async () => {
  api.on('GET', '/care-plan-reviews/queue', json(200, []))
  api.on('GET', '/care-plan-reviews/approved', json(200, Array.from({ length: 12 }, (_, i) => ({
    ...approvedRow,
    planId: 100 - i,
    fullName: `Người kiểm thử ${i + 1}`,
  }))))
  render(<CarePlanQueue onChoose={() => {}} />)
  const approved = await screen.findByRole('tab', { name: 'Đã duyệt (12)' })
  fireEvent.click(approved)
  const table = screen.getByRole('table', { name: 'Kế hoạch đã duyệt' })
  expect(within(table).getAllByRole('row')).toHaveLength(11)
  expect(screen.getByText('Trang 1/2')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }))
  expect(within(table).getAllByRole('row')).toHaveLength(3)
  expect(screen.getByText('Người kiểm thử 12')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Đang chờ duyệt (0)' }))
  fireEvent.click(approved)
  expect(screen.getByText('Trang 1/2')).toBeInTheDocument()
})

it('Q451_tabDaDuyetRong_hienThongBaoBayNgay', async () => {
  api.on('GET', '/care-plan-reviews/queue', json(200, []))
  api.on('GET', '/care-plan-reviews/approved', json(200, []))
  render(<CarePlanQueue onChoose={() => {}} />)
  fireEvent.click(await screen.findByRole('tab', { name: 'Đã duyệt (0)' }))
  expect(screen.getByText('Chưa có kế hoạch nào được duyệt trong 7 ngày qua')).toBeInTheDocument()
})

it('PhanTrang_10DongMoiTrang_doiTabVeTrangDau', async () => {
  const many = Array.from({ length: 12 }, (_, i) => ({
    ...rows[0],
    residentId: 100 + i,
    fullName: `Người kiểm thử ${i + 1}`,
    profileCode: `NCT-${100 + i}`,
  }))
  api.on('GET', '/care-plan-reviews/queue', json(200, many))
  render(<CarePlanQueue onChoose={() => {}} />)
  const table = await screen.findByRole('table', { name: 'Người cần lập hoặc sửa kế hoạch' })
  expect(within(table).getAllByRole('row')).toHaveLength(11)
  expect(screen.getByText('Trang 1/2')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }))
  expect(screen.getByText('Trang 2/2')).toBeInTheDocument()
  expect(
    within(screen.getByRole('table', { name: 'Người cần lập hoặc sửa kế hoạch' })).getAllByRole('row'),
  ).toHaveLength(3)
  expect(screen.getByText('Người kiểm thử 12')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Đang chờ duyệt (0)' }))
  fireEvent.click(screen.getByRole('tab', { name: 'Cần lập hoặc sửa (12)' }))
  expect(screen.getByText('Trang 1/2')).toBeInTheDocument()
})
