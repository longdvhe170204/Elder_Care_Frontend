import { beforeEach, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { json, mockRoutes } from '@/test/fetchRoutes'
import { LiveCareSchedulePage } from './CareSchedulePage'

// 012 FR-076 (Q-416): Lịch chăm sóc hằng ngày của cổng người thân; mốc chung chỉ giờ và tên, công việc có trạng thái
// rút gọn, giá trị đo chỉ khi backend trả (quyền xem sức khỏe có tác dụng); đổi ngày thì tải lại.

let api
const PATH = '/family-portal/residents/41/daily-care-schedule'
const viewer = { residentId: 41, residentName: 'Nguyễn Văn Bình', perms: { health: false } }

beforeEach(() => {
  api = mockRoutes()
  api.on(
    'GET',
    PATH,
    json(200, {
      date: '2026-11-22',
      measurementsShown: true,
      available: true,
      items: [
        { at: '2026-11-22T00:00:00Z', kind: 'ROUTINE', name: 'Thức dậy', status: null, measuredValue: null },
        { at: '2026-11-22T01:00:00Z', kind: 'CARE_TASK', name: 'Đo huyết áp', status: 'DONE', measuredValue: '125' },
        { at: '2026-11-22T01:30:00Z', kind: 'CARE_TASK', name: 'Hỗ trợ đi lại', status: 'NOT_DONE', measuredValue: null },
        { at: '2026-11-22T05:00:00Z', kind: 'CARE_TASK', name: 'Hỗ trợ ăn uống', status: 'NOT_PERFORMED', measuredValue: null },
      ],
    }),
  )
})

it('FR_076_hienMocChungVaCongViecTheoGio', async () => {
  render(<LiveCareSchedulePage viewer={viewer} />)
  expect(await screen.findByText('Thức dậy')).toBeInTheDocument()
  expect(screen.getByText('07:00')).toBeInTheDocument()
  expect(screen.getByText('Hoàn thành')).toBeInTheDocument()
  expect(screen.getByText('Chưa hoàn thành')).toBeInTheDocument()
  expect(screen.getByText('Không thực hiện')).toBeInTheDocument()
  expect(screen.getByText('Kết quả đo: 125')).toBeInTheDocument()
})

it('FR_076_doiNgayThiTaiLaiTheoNgay', async () => {
  render(<LiveCareSchedulePage viewer={viewer} />)
  await screen.findByText('Thức dậy')
  fireEvent.change(screen.getByLabelText('Ngày'), { target: { value: '2026-10-05' } })
  await waitFor(() =>
    expect(api.calls('GET', PATH).some(([url]) => new URL(url, 'http://localhost').search === '?date=2026-10-05')).toBe(
      true,
    ),
  )
})
