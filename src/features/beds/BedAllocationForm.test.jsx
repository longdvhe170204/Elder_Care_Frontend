import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { typeChoice } from '@/test/choiceTray'
import { BedAllocationForm } from './BedAllocationForm'

let api
beforeEach(() => {
  api = mockRoutes()
  api.on(
    'GET',
    '/bed-allocations/suitable-beds',
    json(200, [{ location: { bedId: 6, label: 'Khu A – P201 – G2' }, state: 'EMPTY' }]),
  )
  api.on('POST', '/bed-allocations', json(201, { id: 41, status: 'FUTURE' }))
})
afterEach(() => vi.unstubAllGlobals())

function open(onSaved = vi.fn()) {
  render(
    <BedAllocationForm
      resident={{ id: 11, fullName: '[Họ tên NCT 1]', status: 'ADMISSION_IN_PROGRESS' }}
      onSaved={onSaved}
    />,
  )
}

it('FR_022_suitableBedsAreNeverPreselected', async () => {
  open()
  expect(await screen.findByText('Khu A – P201 – G2')).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: 'Khu A – P201 – G2' })).not.toBeChecked()
  expect(screen.getByRole('button', { name: 'Xác nhận phân bổ' })).toBeDisabled()
  expect(
    new URL(api.calls('GET', '/bed-allocations/suitable-beds')[0][0], 'http://localhost').searchParams.get(
      'residentId',
    ),
  ).toBe('11')
})

it('FR_023_createSendsExplicitBedAndReasonWithIdempotencyKey', async () => {
  const saved = vi.fn()
  open(saved)
  await screen.findByText('Khu A – P201 – G2')
  fireEvent.click(screen.getByRole('radio', { name: 'Khu A – P201 – G2' }))
  typeChoice('Lý do phân bổ', 'Bố trí giường')
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận phân bổ' }))
  await waitFor(() => expect(saved).toHaveBeenCalledWith({ id: 41, status: 'FUTURE' }))
  const request = api.calls('POST', '/bed-allocations')[0][1]
  expect(JSON.parse(request.body)).toEqual({ residentId: 11, bedId: 6, reason: 'Bố trí giường' })
  expect(request.headers['Idempotency-Key']).toBeTruthy()
})

it('FR_018_conflictShowsAllConditionsAndReloadClearsChoice', async () => {
  api.on(
    'POST',
    '/bed-allocations',
    problem(409, 'UNMET_CONDITIONS', {
      unmetConditions: [
        { code: 'ALLOCATION_GENDER', description: 'Giới tính không phù hợp' },
        { code: 'ALLOCATION_ISOLATION', description: 'Phòng đang cách ly' },
      ],
    }),
  )
  open()
  await screen.findByText('Khu A – P201 – G2')
  fireEvent.click(screen.getByRole('radio', { name: 'Khu A – P201 – G2' }))
  typeChoice('Lý do phân bổ', 'Bố trí giường')
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận phân bổ' }))
  expect(await screen.findByText('Giới tính không phù hợp')).toBeInTheDocument()
  expect(screen.getByText('Phòng đang cách ly')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Tải lại giường' }))
  await waitFor(() => expect(api.calls('GET', '/bed-allocations/suitable-beds')).toHaveLength(2))
  expect(await screen.findByRole('radio', { name: 'Khu A – P201 – G2' })).not.toBeChecked()
})

// 4b (chủ dự án chọn 2026-11-21): mặc định chỉ hiện giường thuộc loại phòng của hợp đồng (loại phòng của giường lấy qua
// GET /rooms); bỏ chọn thì hiện mọi giường thỏa FR-018 (backend không chặn theo loại phòng)
it('4b_locGiuongTheoLoaiPhongCuaHopDong_boChonThiHienTatCa', async () => {
  api.on(
    'GET',
    '/bed-allocations/suitable-beds',
    json(200, [
      { location: { bedId: 6, roomId: 1, label: 'Khu A – P201 – G2' }, state: 'EMPTY' },
      { location: { bedId: 7, roomId: 2, label: 'Khu A – P305 – G1' }, state: 'EMPTY' },
    ]),
  )
  api.on('GET', '/contracts', json(200, [{ id: 3, residentId: 11, status: 'DRAFT', roomTypeId: 101 }]))
  api.on(
    'GET',
    '/rooms',
    json(200, [
      { id: 1, roomTypeId: 101 },
      { id: 2, roomTypeId: 202 },
    ]),
  )
  api.on('GET', '/room-types', json(200, [{ id: 101, name: 'Phòng 2 giường' }]))
  open()

  const only = await screen.findByRole('checkbox', { name: 'Chỉ giường loại Phòng 2 giường của hợp đồng' })
  expect(only).toBeChecked()
  expect(await screen.findByText('Khu A – P201 – G2')).toBeInTheDocument()
  expect(screen.queryByText('Khu A – P305 – G1')).toBeNull()
  expect(new URL(api.calls('GET', '/contracts')[0][0], 'http://localhost').searchParams.get('residentId')).toBe('11')

  fireEvent.click(only)
  expect(await screen.findByText('Khu A – P305 – G1')).toBeInTheDocument()
})

// Nhóm A BF-01 (chủ dự án chọn 2026-11-21): bảng giường một lựa chọn kèm loại phòng, người cùng phòng (họ tên, giới tính,
// mức; 003 FR-022), lúc sẵn sàng; không chọn sẵn (Q-307). Ngày, giờ tách hai ô dd/mm/yyyy và 24 giờ.
it('nhomA_bangGiuong_loaiPhong_nguoiCungPhong_sanSang_khongChonSan', async () => {
  api.on(
    'GET',
    '/bed-allocations/suitable-beds',
    json(200, [
      {
        location: { bedId: 6, roomId: 1, room: 'Phòng 201', bed: 'G2', label: 'Khu A – Tầng 2 – Phòng 201 – G2' },
        roommates: [{ residentId: 3, fullName: 'Trần Văn Bình', gender: 'MALE', careLevel: 'BASIC' }],
        state: 'EMPTY',
      },
      {
        location: { bedId: 7, roomId: 1, room: 'Phòng 201', bed: 'G3', label: 'Khu A – Tầng 2 – Phòng 201 – G3' },
        roommates: [],
        earliestStartAt: '2026-11-22T07:00:00Z',
        state: 'PENDING_READY',
      },
    ]),
  )
  api.on('GET', '/rooms', json(200, [{ id: 1, roomTypeId: 101 }]))
  api.on('GET', '/room-types', json(200, [{ id: 101, name: 'Phòng 2 giường' }]))
  open()

  const table = await screen.findByRole('table', { name: 'Giường phù hợp' })
  const first = await within(table).findByRole('row', { name: /Phòng 201, G2/ })
  expect(within(first).getByText('Phòng 2 giường')).toBeInTheDocument()
  expect(within(first).getByText('Trần Văn Bình, nam, chăm sóc cơ bản')).toBeInTheDocument()
  expect(within(first).getByText('Ngay')).toBeInTheDocument()
  expect(within(table).getByText('Từ 22/11/2026 14:00')).toBeInTheDocument()
  expect(
    within(table)
      .getAllByRole('radio')
      .every((r) => !r.checked),
  ).toBe(true)
})

it('nhomA_ngayGioTachHaiO_guiStartAtGioViet_ngaySaiBaoTaiO', async () => {
  open()
  await screen.findByText('Khu A – P201 – G2')
  fireEvent.change(screen.getByLabelText('Ngày bắt đầu dự kiến'), { target: { value: '31/02/2026' } })
  expect(screen.getByText('Nhập ngày có thật, dạng dd/mm/yyyy')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Ngày bắt đầu dự kiến'), { target: { value: '21/11/2026' } })
  fireEvent.change(screen.getByLabelText('Giờ'), { target: { value: '08:00' } })
  await waitFor(() =>
    expect(
      api
        .calls('GET', '/bed-allocations/suitable-beds')
        .some(([url]) => new URL(url, 'http://localhost').searchParams.get('startAt') === '2026-11-21T08:00:00+07:00'),
    ).toBe(true),
  )
})

it('nhomA_ngayVaoTuHopDong_dienSanONgay', async () => {
  render(
    <BedAllocationForm
      resident={{ id: 11, fullName: '[Họ tên NCT 1]', status: 'ADMISSION_IN_PROGRESS' }}
      defaultDate="2026-11-22"
      onSaved={vi.fn()}
    />,
  )
  expect(await screen.findByLabelText('Ngày bắt đầu dự kiến')).toHaveValue('22/11/2026')
})
