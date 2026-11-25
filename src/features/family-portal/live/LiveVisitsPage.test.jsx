import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { LiveVisitsPage } from './LiveVisitsPage'

// Test BF-12 (2026-11-24; 012 US4, FR-030, FR-031, FR-035, FR-050): màn Thăm của cổng với phiên thật. Người thân có quyền
// đăng ký thăm chọn ngày, khung (số chỗ còn từ backend), người đi cùng; đạt thì Đã duyệt ngay, không đạt thì hiện lý do;
// hủy lượt Đã duyệt của mình trước giờ bắt đầu.

let api

const viewer = { residentId: 5, residentName: 'Nguyễn Thị Lan', perms: { visits: true } }

const SLOTS = [
  { startTime: '09:00', endTime: '11:00', capacity: 20, seatsLeft: 12 },
  { startTime: '15:00', endTime: '17:00', capacity: 20, seatsLeft: 2 },
]

const MINE = [
  {
    id: 81,
    residentId: 5,
    date: '2026-11-20',
    startTime: '09:00',
    endTime: '11:00',
    visitorCount: 1,
    status: 'CHECKED_OUT',
  },
  {
    id: 82,
    residentId: 5,
    date: '2026-11-26',
    startTime: '15:00',
    endTime: '17:00',
    visitorCount: 2,
    status: 'APPROVED',
  },
]

beforeEach(() => {
  api = mockRoutes()
  api.on('GET', '/visits', json(200, MINE))
  api.on('GET', '/visit-slots', json(200, SLOTS))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function chooseFirstDayAndSlot(slotName) {
  const days = await screen.findByRole('group', { name: 'Ngày' })
  fireEvent.click(within(days).getAllByRole('button')[0])
  fireEvent.click(await screen.findByRole('button', { name: slotName }))
}

describe('LiveVisitsPage', () => {
  it('FR_031_dangKy_khungTuBackend_daDuyetNgay', async () => {
    api.on('POST', '/visits', json(201, { id: 90, status: 'APPROVED' }))
    render(<LiveVisitsPage viewer={viewer} />)

    await chooseFirstDayAndSlot('15:00–17:00, còn 2 chỗ')
    expect(api.calls('GET', '/visit-slots')[0][0]).toMatch(/date=\d{4}-\d{2}-\d{2}/)
    fireEvent.click(screen.getByRole('button', { name: 'Thêm người đi cùng' }))
    fireEvent.change(screen.getByLabelText('Họ tên người đi cùng 1'), { target: { value: 'Trần Hoa' } })
    fireEvent.change(screen.getByLabelText('Quan hệ của người đi cùng 1'), { target: { value: 'Cháu' } })
    fireEvent.click(screen.getByRole('button', { name: 'Đăng ký thăm' }))

    expect(await screen.findByText(/được duyệt ngay/)).toBeInTheDocument()
    const [, init] = api.calls('POST', '/visits')[0]
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({
      residentId: 5,
      startTime: '15:00',
      endTime: '17:00',
      companions: [{ fullName: 'Trần Hoa', relationship: 'Cháu' }],
    })
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(init.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    await waitFor(() => expect(api.calls('GET', '/visits').length).toBeGreaterThan(1))
  })

  it('FR_030_khongDat_hienLyDo_khongTaoLuot', async () => {
    api.on(
      'POST',
      '/visits',
      problem(422, 'VISIT_NOT_ALLOWED', {
        detail: 'Đăng ký thăm không đạt điều kiện',
        unmetConditions: [{ code: 'OUTSIDE_REGISTRATION_WINDOW', description: 'Ngoài thời hạn đăng ký' }],
      }),
    )
    render(<LiveVisitsPage viewer={viewer} />)

    await chooseFirstDayAndSlot('09:00–11:00, còn 12 chỗ')
    fireEvent.click(screen.getByRole('button', { name: 'Đăng ký thăm' }))

    expect(await screen.findByText('Không đăng ký được')).toBeInTheDocument()
    expect(screen.getByText(/Ngoài thời hạn đăng ký/)).toBeInTheDocument()
  })

  it('FR_035_luotCuaToi_huyLuotDaDuyet', async () => {
    api.on('POST', '/visits/82/cancel', json(200, { id: 82 }))
    render(<LiveVisitsPage viewer={viewer} />)

    const list = await screen.findByRole('list', { name: 'Lượt thăm của bạn' })
    expect(within(list).getByText('26/11/2026, 15:00–17:00')).toBeInTheDocument()
    expect(within(list).getByText('Đã ra')).toBeInTheDocument()
    expect(api.calls('GET', '/visits')[0][0]).toContain('residentId=5')

    fireEvent.click(within(list).getByRole('button', { name: 'Hủy lượt 26/11/2026, 15:00–17:00' }))
    await waitFor(() => expect(api.calls('POST', '/visits/82/cancel')).toHaveLength(1))
    expect(await screen.findByText('Đã hủy lượt thăm, chỗ được trả lại cho khung giờ.')).toBeInTheDocument()
  })

  it('FR_029_khongCoQuyen_khongCoFormDangKy', async () => {
    render(<LiveVisitsPage viewer={{ ...viewer, perms: { visits: false } }} />)

    expect(await screen.findByText(/Bạn chưa có quyền đăng ký thăm/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Đăng ký thăm' })).not.toBeInTheDocument()
    expect(await screen.findByRole('list', { name: 'Lượt thăm của bạn' })).toBeInTheDocument()
  })
})
