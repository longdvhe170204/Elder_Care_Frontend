import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { typeChoice } from '@/test/choiceTray'
import { BedAllocationForm } from './BedAllocationForm'

const LABEL = 'Khu A – Tầng 2 – Phòng 201 – G2'
const START_AT = '2026-11-21T08:00:00+07:00'

let api
beforeEach(() => {
  api = mockRoutes()
  api.on(
    'GET',
    '/bed-allocations/suitable-beds',
    json(200, [
      {
        location: { bedId: 6, roomId: 1, area: 'Khu A', floor: 'Tầng 2', room: 'Phòng 201', bed: 'G2', label: LABEL },
        state: 'EMPTY',
      },
    ]),
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

const dateInput = () => screen.getByLabelText(/^Ngày vào dự kiến/)
const timeInput = () => screen.getByLabelText(/^Giờ/)

// Ghi ngày giờ vào rồi chờ danh sách giường tải lại theo thời điểm đó (đổi thời điểm bỏ lựa chọn giường)
async function fillStart() {
  fireEvent.change(dateInput(), { target: { value: '21/11/2026' } })
  fireEvent.change(timeInput(), { target: { value: '08:00' } })
  await waitFor(() =>
    expect(
      api
        .calls('GET', '/bed-allocations/suitable-beds')
        .some(([url]) => new URL(url, 'http://localhost').searchParams.get('startAt') === START_AT),
    ).toBe(true),
  )
  return screen.findByRole('radio', { name: LABEL })
}

it('FR_022_suitableBedsAreNeverPreselected_submitWithoutBedReportsAtField', async () => {
  open()
  const bed = await screen.findByRole('radio', { name: LABEL })
  expect(bed).not.toBeChecked()
  expect(
    new URL(api.calls('GET', '/bed-allocations/suitable-beds')[0][0], 'http://localhost').searchParams.get(
      'residentId',
    ),
  ).toBe('11')
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận phân bổ' }))
  expect(await screen.findByText('Chọn một giường')).toBeInTheDocument()
  expect(api.calls('POST', '/bed-allocations')).toHaveLength(0)
})

it('nguoiDangTiepNhan_batBuocNgayGioVao_thieuThiBaoTaiO', async () => {
  open()
  fireEvent.click(await screen.findByRole('radio', { name: LABEL }))
  typeChoice('Lý do phân bổ', 'Bố trí giường')
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận phân bổ' }))
  expect(await screen.findByText('Nhập ngày vào')).toBeInTheDocument()
  fireEvent.change(dateInput(), { target: { value: '21/11/2026' } })
  expect(await screen.findByText('Nhập giờ vào')).toBeInTheDocument()
  expect(api.calls('POST', '/bed-allocations')).toHaveLength(0)
})

it('FR_023_createSendsExplicitBedReasonAndStartAtWithIdempotencyKey', async () => {
  const saved = vi.fn()
  open(saved)
  fireEvent.click(await fillStart())
  typeChoice('Lý do phân bổ', 'Bố trí giường')
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận phân bổ' }))
  await waitFor(() => expect(saved).toHaveBeenCalledWith({ id: 41, status: 'FUTURE' }))
  const request = api.calls('POST', '/bed-allocations')[0][1]
  expect(JSON.parse(request.body)).toEqual({ residentId: 11, bedId: 6, reason: 'Bố trí giường', startAt: START_AT })
  expect(request.headers['Idempotency-Key']).toBeTruthy()
})

it('FR_018_conflictShowsAllConditions_changingTimeReloadsAndClearsChoice', async () => {
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
  fireEvent.click(await fillStart())
  typeChoice('Lý do phân bổ', 'Bố trí giường')
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận phân bổ' }))
  expect(await screen.findByText('Giới tính không phù hợp')).toBeInTheDocument()
  expect(screen.getByText('Phòng đang cách ly')).toBeInTheDocument()
  const before = api.calls('GET', '/bed-allocations/suitable-beds').length
  fireEvent.change(timeInput(), { target: { value: '09:00' } })
  await waitFor(() => expect(api.calls('GET', '/bed-allocations/suitable-beds').length).toBeGreaterThan(before))
  expect(await screen.findByRole('radio', { name: LABEL })).not.toBeChecked()
})

// 4b (chủ dự án chọn 2026-11-21): loại phòng của hợp đồng bật sẵn ở chip lọc (loại phòng của giường lấy qua GET /rooms);
// chọn "Tất cả loại phòng" thì hiện mọi giường thỏa FR-018 (backend không chặn theo loại phòng)
it('4b_locGiuongTheoLoaiPhongCuaHopDong_chonTatCaThiHienTatCa', async () => {
  api.on(
    'GET',
    '/bed-allocations/suitable-beds',
    json(200, [
      { location: { bedId: 6, roomId: 1, room: 'Phòng 201', bed: 'G2', label: 'Khu A – P201 – G2' }, state: 'EMPTY' },
      { location: { bedId: 7, roomId: 2, room: 'Phòng 305', bed: 'G1', label: 'Khu A – P305 – G1' }, state: 'EMPTY' },
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
  api.on(
    'GET',
    '/room-types',
    json(200, [
      { id: 101, name: 'Phòng 2 giường', standardBeds: 2 },
      { id: 202, name: 'Phòng 4 giường', standardBeds: 4 },
    ]),
  )
  open()

  const filter = await screen.findByRole('radiogroup', { name: 'Loại phòng' })
  await waitFor(() => expect(within(filter).getByRole('radio', { name: 'Phòng 2 giường' })).toBeChecked())
  expect(within(filter).getByText('2 giường')).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: 'Khu A – P201 – G2' })).toBeInTheDocument()
  expect(screen.queryByRole('radio', { name: 'Khu A – P305 – G1' })).toBeNull()
  expect(new URL(api.calls('GET', '/contracts')[0][0], 'http://localhost').searchParams.get('residentId')).toBe('11')

  fireEvent.click(within(filter).getByRole('radio', { name: 'Tất cả loại phòng' }))
  expect(await screen.findByRole('radio', { name: 'Khu A – P305 – G1' })).toBeInTheDocument()
})

// Audit BF-01 2026-11-26: giường gom theo khu – tầng, mỗi phòng một dòng (tên, loại phòng, phòng nam/nữ), giường là chip;
// giường chưa sẵn sàng ghi lúc sẵn sàng; không chọn sẵn (Q-307); không hiện người cùng phòng
it('gomTheoTangPhong_loaiPhongVaGioiTinh_giuongChuaSanSangGhiTu_khongChonSan', async () => {
  api.on(
    'GET',
    '/bed-allocations/suitable-beds',
    json(200, [
      {
        location: { bedId: 6, roomId: 1, area: 'Khu A', floor: 'Tầng 2', room: 'Phòng 201', bed: 'G2', label: LABEL },
        roommates: [{ residentId: 3, fullName: 'Trần Văn Bình', gender: 'MALE', careLevel: 'BASIC' }],
        state: 'EMPTY',
      },
      {
        location: {
          bedId: 7,
          roomId: 1,
          area: 'Khu A',
          floor: 'Tầng 2',
          room: 'Phòng 201',
          bed: 'G3',
          label: 'Khu A – Tầng 2 – Phòng 201 – G3',
        },
        earliestStartAt: '2026-11-22T07:00:00Z',
        state: 'PENDING_READY',
      },
    ]),
  )
  api.on('GET', '/rooms', json(200, [{ id: 1, roomTypeId: 101, genderPolicy: 'MALE' }]))
  api.on('GET', '/room-types', json(200, [{ id: 101, name: 'Phòng 2 giường' }]))
  open()

  expect(await screen.findByText('Khu A – Tầng 2')).toBeInTheDocument()
  const room = screen.getByText('Phòng 201').closest('li')
  expect(await within(room).findByText('Phòng 2 giường · Phòng nam')).toBeInTheDocument()
  expect(within(room).getByRole('radio', { name: LABEL })).toBeInTheDocument()
  expect(within(room).getByText('G3 · từ 22/11/2026 14:00')).toBeInTheDocument()
  expect(
    within(room).getByRole('radio', { name: 'Khu A – Tầng 2 – Phòng 201 – G3, từ 22/11/2026 14:00' }),
  ).toBeInTheDocument()
  expect(
    within(room)
      .getAllByRole('radio')
      .every((r) => !r.checked),
  ).toBe(true)
  expect(screen.queryByText(/Trần Văn Bình/)).toBeNull()
})

it('ngayGioVao_guiStartAtGioViet_ngaySaiBaoTaiO', async () => {
  open()
  await screen.findByRole('radio', { name: LABEL })
  fireEvent.change(dateInput(), { target: { value: '31/02/2026' } })
  expect(screen.getByText('Nhập ngày có thật, dạng DD/MM/YYYY')).toBeInTheDocument()
  await fillStart()
})

// Location của api-003 không bắt buộc roomId, bed: giường thiếu thì vẫn hiện, mỗi giường một dòng, chip ghi nhãn đầy đủ
it('giuongThieuRoomIdVaTenGiuong_vanHienMoiGiuongMotDong', async () => {
  api.on(
    'GET',
    '/bed-allocations/suitable-beds',
    json(200, [
      { location: { bedId: 6, label: 'Khu A – P201 – G2' }, state: 'EMPTY' },
      { location: { bedId: 7, label: 'Khu A – P202 – G1' }, state: 'EMPTY' },
    ]),
  )
  open()

  expect(await screen.findByRole('radio', { name: 'Khu A – P201 – G2' })).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: 'Khu A – P202 – G1' })).toBeInTheDocument()
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
  expect(screen.queryByText(/undefined/)).toBeNull()
})

it('ngayVaoTuHopDong_dienSanONgay', async () => {
  render(
    <BedAllocationForm
      resident={{ id: 11, fullName: '[Họ tên NCT 1]', status: 'ADMISSION_IN_PROGRESS' }}
      defaultDate="2026-11-22"
      onSaved={vi.fn()}
    />,
  )
  expect(await screen.findByLabelText(/^Ngày vào dự kiến/)).toHaveValue('22/11/2026')
})
