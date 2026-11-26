import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { json, mockRoutes } from '@/test/fetchRoutes'
import { MonthTaskPlanning } from './MonthTaskPlanning'

let api
const props = {
  people: { 7: 'Trần Thị Bình' },
  types: [{ id: 5, name: 'Hỗ trợ vận động' }],
  staff: [{ id: 30, fullName: 'Vũ Văn Cường' }],
  initialMonth: '2026-12',
}
const draft = {
  id: 90,
  residentId: 7,
  taskTypeId: 5,
  shiftId: 3,
  plannedAt: '2026-12-01T00:00:00Z',
  importance: 'MANDATORY',
  performerId: 30,
}
beforeEach(() => {
  api = mockRoutes()
  api.on('GET', '/shift-schedules', json(200, [{ status: 'PUBLISHED', scopeType: 'FLOOR', scopeId: 11, shifts: [] }]))
  api.on('GET', '/care-tasks/month-drafts', json(200, []))
})
afterEach(() => vi.unstubAllGlobals())

it('Q453_chepTuKeHoach_hienTomTat_banNhapVaCongBo', async () => {
  api.on('POST', '/care-tasks/month-drafts', json(200, { created: 1, skipped: 2, shifts: 31 }))
  render(<MonthTaskPlanning {...props} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Chép từ kế hoạch' }))
  await waitFor(() => expect(api.calls('POST', '/care-tasks/month-drafts')).toHaveLength(1))
  expect(JSON.parse(api.calls('POST', '/care-tasks/month-drafts')[0][1].body)).toEqual({
    floorAreaId: 11,
    month: '2026-12',
  })
  api.on('GET', '/care-tasks/month-drafts', json(200, [draft]))
  expect(await screen.findByText(/Đã tạo 1 việc Nháp/)).toBeInTheDocument()
  const table = await screen.findByRole('table', { name: 'Công việc Nháp của tháng' })
  const row = within(table).getByRole('row', { name: /Trần Thị Bình/ })
  expect(within(row).getByText('Hỗ trợ vận động')).toBeInTheDocument()
  expect(within(row).getByText('Vũ Văn Cường')).toBeInTheDocument()

  api.on('POST', '/care-tasks/month-drafts/publish', json(200, { published: 1 }))
  fireEvent.click(screen.getByRole('button', { name: 'Công bố công việc tháng (1)' }))
  const ask = await screen.findByRole('alertdialog')
  fireEvent.click(within(ask).getByRole('button', { name: 'Công bố' }))
  await waitFor(() => expect(api.calls('POST', '/care-tasks/month-drafts/publish')).toHaveLength(1))
})

it('Q453_boViecNhap_goiLenhBo', async () => {
  api.on('GET', '/care-tasks/month-drafts', json(200, [draft]))
  api.on('POST', '/care-tasks/month-drafts/90/discard', json(200, null))
  render(<MonthTaskPlanning {...props} />)
  const row = await screen.findByRole('row', { name: /Trần Thị Bình/ })
  fireEvent.click(within(row).getByRole('button', { name: 'Bỏ việc Hỗ trợ vận động của Trần Thị Bình' }))
  await waitFor(() => expect(api.calls('POST', '/care-tasks/month-drafts/90/discard')).toHaveLength(1))
})

it('Q453_nhieuTang_baoLoiKhongChep', async () => {
  api.on(
    'GET',
    '/shift-schedules',
    json(200, [
      { status: 'PUBLISHED', scopeType: 'FLOOR', scopeId: 11, shifts: [] },
      { status: 'PUBLISHED', scopeType: 'FLOOR', scopeId: 12, shifts: [] },
    ]),
  )
  render(<MonthTaskPlanning {...props} />)
  expect(await screen.findByText(/đang phụ trách nhiều tầng/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Chép từ kế hoạch' })).toBeDisabled()
})
