import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { PermissionsProvider } from '@/common/permissions/permissions'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { ShiftTaskPlanningPage } from './ShiftTaskPlanningPage'

// Ca 01/11/2026 07:00–15:00 giờ Việt Nam (00:00–08:00 UTC), tầng 3
const SHIFT = { id: 5, startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-11-01T08:00:00Z', floorAreaId: 3 }
const TASKS = Array.from({ length: 7 }, (_, i) => ({
  id: 100 + i,
  residentId: 77,
  residentCard: { fullName: '[Họ tên kiểm thử]' },
  taskType: 'Loại công việc kiểm thử',
  content: `Việc ${i + 1}`,
  plannedAt: `2026-11-01T0${i}:00:00Z`,
  performer: '[Nhân viên kiểm thử]',
  status: 'NOT_YET_DUE',
}))

let api
beforeEach(() => {
  api = mockRoutes()
  api.on(
    'GET',
    '/me/permissions',
    json(200, [
      { function: 'SHIFT_TASK_PLANNING', operation: 'CREATE' },
      { function: 'SHIFT_TASK_PLANNING', operation: 'VIEW' },
    ]),
  )
  api.on(
    'GET',
    '/residents',
    json(200, { items: [{ id: 77, personalInfo: { fullName: '[Họ tên kiểm thử]' } }], nextCursor: null }),
  )
  api.on('GET', '/task-types', json(200, [{ id: 9, name: 'Loại công việc kiểm thử', status: 'ACTIVE' }]))
  api.on('GET', '/floors/3', json(200, { id: 3, name: 'Tầng kiểm thử' }))
  api.on(
    'GET',
    '/shifts/5/source-data',
    json(200, {
      shift: SHIFT,
      residents: [
        {
          residentId: 77,
          assignments: [{ staffId: 22, fullName: '[Nhân viên kiểm thử]', role: 'CAREGIVER' }],
          planItems: [
            { id: 90, taskTypeId: 9, content: 'Mục kế hoạch kiểm thử', times: ['08:00:00'], importance: 'NORMAL' },
          ],
          otherSources: [{ type: 'MEAL', id: 61, at: '2026-11-01T04:30:00Z', description: 'Bữa ăn' }],
        },
      ],
    }),
  )
  api.on('GET', '/shifts/5/care-tasks', json(200, []))
  api.on('GET', '/care-tasks', json(200, { items: [], total: 0 }))
  api.on('GET', '/staff/22', json(200, { id: 22, fullName: '[Nhân viên kiểm thử]' }))
  api.on(
    'GET',
    '/shifts/5',
    json(200, { id: 5, staff: [{ staffId: 22 }, { staffId: 33 }, { staffId: 44, absent: true }] }),
  )
})
afterEach(() => vi.unstubAllGlobals())
const view = (props = { shiftId: 5 }) =>
  render(
    <PermissionsProvider>
      <ShiftTaskPlanningPage {...props} />
    </PermissionsProvider>,
  )

async function openBatch() {
  const button = await screen.findByRole('button', { name: 'Lập công việc' })
  await waitFor(() => expect(button).toBeEnabled())
  fireEvent.click(button)
  return screen.findByRole('dialog', { name: 'Lập công việc cho ca' })
}

async function enterRow(dialog) {
  fireEvent.click(within(dialog).getByRole('button', { name: 'Thêm dòng' }))
  const row = within(dialog).getByRole('group', { name: 'Dòng 01' })
  fireEvent.change(within(row).getByLabelText('Người cao tuổi'), { target: { value: '77' } })
  fireEvent.change(within(row).getByLabelText('Loại công việc'), { target: { value: '9' } })
  fireEvent.change(within(row).getByLabelText('Giờ dự kiến'), { target: { value: '08:00' } })
  fireEvent.change(within(row).getByLabelText('Mức quan trọng'), { target: { value: 'NORMAL' } })
  fireEvent.change(within(row).getByLabelText('Phân công'), { target: { value: '22' } })
  fireEvent.change(within(row).getByLabelText('Nội dung (không bắt buộc)'), { target: { value: 'Nội dung tự nhập' } })
  return row
}

it('FR_017_moModalKhongTuDienDongCongViec', async () => {
  view()
  const dialog = await openBatch()
  expect(within(dialog).getByText('Chưa có dòng đang nhập')).toBeInTheDocument()
  expect(within(dialog).queryByRole('button', { name: /chép|gợi ý/i })).not.toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: 'Gửi lô' })).toBeDisabled()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Thêm dòng' }))
  const row = within(dialog).getByRole('group', { name: 'Dòng 01' })
  expect(within(row).getByLabelText('Nội dung (không bắt buộc)')).toHaveValue('')
  expect(within(row).getByRole('option', { name: '[Họ tên kiểm thử]' })).toHaveValue('77')
  expect(api.calls('POST', '/shifts/5/care-tasks/plan')).toHaveLength(0)
})

it('BR_M04_01_guiMangTuNhapKemIdempotencyKeyVaMuiGioVietNam', async () => {
  api.on('POST', '/shifts/5/care-tasks/plan', json(201, []))
  view()
  const dialog = await openBatch()
  await enterRow(dialog)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Gửi lô 1 dòng' }))
  await waitFor(() => expect(api.calls('POST', '/shifts/5/care-tasks/plan')).toHaveLength(1))
  const [, options] = api.calls('POST', '/shifts/5/care-tasks/plan')[0]
  expect(JSON.parse(options.body)).toMatchObject([
    {
      residentId: 77,
      taskTypeId: 9,
      basis: { type: 'CARE_PLAN_ITEM', id: 90 },
      content: 'Nội dung tự nhập',
      plannedAt: '2026-11-01T08:00:00+07:00',
      importance: 'NORMAL',
      performerId: 22,
      shared: false,
    },
  ])
  expect(options.headers['Idempotency-Key']).toBeTruthy()
  expect(await screen.findByText('Đã lập 1 công việc của ca.')).toBeInTheDocument()
})

it('FR_017_lichSuKhongTheoCa_phanTrangMayChu', async () => {
  api.on('GET', '/care-tasks', (url) =>
    json(200, { items: url.searchParams.get('page') === '1' ? TASKS.slice(0, 2) : [...TASKS, ...TASKS.slice(0, 3)].map((t, i) => ({ ...t, id: 500 + i })), total: 12 }),
  )
  view()
  const table = await screen.findByRole('table')
  expect(within(table).getAllByRole('row')).toHaveLength(11)
  expect(screen.getByText('12 việc')).toBeInTheDocument()
  expect(screen.queryByLabelText('Ngày lập')).not.toBeInTheDocument()
  expect(screen.getByText('Trang 1 / 2')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Sau' }))
  expect(await screen.findByText('Hiển thị 11–12 / 12 công việc')).toBeInTheDocument()
  const query = new URL(api.calls('GET', '/care-tasks').at(-1)[0], 'http://localhost').searchParams
  expect(query.get('page')).toBe('1')
  expect(query.get('size')).toBe('10')
})

it('FR_017_locTheoNguoiCaoTuoiCongViecNguoiLam_guiLenMayChu', async () => {
  api.on('GET', '/staff', json(200, [{ id: 22, fullName: '[Nhân viên kiểm thử]' }]))
  view()
  await screen.findByText('Chưa có công việc đã lập.')
  fireEvent.change(await screen.findByLabelText('Người cao tuổi'), { target: { value: '77' } })
  fireEvent.change(screen.getByLabelText('Công việc'), { target: { value: '9' } })
  await screen.findByRole('option', { name: '[Nhân viên kiểm thử]' })
  fireEvent.change(screen.getByLabelText('Người làm'), { target: { value: '22' } })
  await waitFor(() => {
    const query = new URL(api.calls('GET', '/care-tasks').at(-1)[0], 'http://localhost').searchParams
    expect([query.get('residentId'), query.get('taskTypeId'), query.get('performerId'), query.get('page')]).toEqual([
      '77',
      '9',
      '22',
      '0',
    ])
  })
  expect(await screen.findByText('Không có công việc khớp bộ lọc.')).toBeInTheDocument()
})

it('FR_017_doiChieuNguon_chiDeXem', async () => {
  view()
  const batch = await openBatch()
  fireEvent.click(within(batch).getByRole('button', { name: 'Đối chiếu nguồn' }))
  const dialog = await screen.findByRole('dialog', { name: 'Chi tiết công việc của ca' })
  expect(within(dialog).getByText('Chỉ xem')).toBeInTheDocument()
  expect(within(dialog).getByText('Mục kế hoạch kiểm thử · 08:00')).toBeInTheDocument()
  expect(within(dialog).getByText('Người này chưa có công việc đã lập trong ca.')).toBeInTheDocument()
})

it('FR_017_guiXong_viecMoiLapLenDauLichSu', async () => {
  api.on('POST', '/shifts/5/care-tasks/plan', () => {
    api.on(
      'GET',
      '/care-tasks',
      json(200, { items: [{ ...TASKS[0], id: 200, content: 'Việc vừa lập' }, ...TASKS], total: 8 }),
    )
    return json(201, [{ ...TASKS[0], id: 200 }])
  })
  view()
  const dialog = await openBatch()
  await enterRow(dialog)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Gửi lô 1 dòng' }))
  expect(await screen.findByText('Việc vừa lập')).toBeInTheDocument()
  const first = within(screen.getByRole('table')).getAllByRole('row')[1]
  expect(first).toHaveTextContent('Việc vừa lập')
  expect(within(first).getByText('Mới lập')).toBeInTheDocument()
})

it('FR_023_canCuTuDoiChieuLoaiVaGio_khongCoOChon', async () => {
  view()
  const dialog = await openBatch()
  const row = await enterRow(dialog)
  expect(within(row).queryByRole('combobox', { name: 'Căn cứ' })).not.toBeInTheDocument()
  expect(within(row).getByRole('group', { name: 'Căn cứ' })).toHaveTextContent(
    'Khớp mục kế hoạch · Mục kế hoạch kiểm thử · 08:00',
  )
  expect(await within(row).findByRole('option', { name: '[Nhân viên kiểm thử] · Nhân viên chăm sóc' })).toHaveValue('22')
})

it('FR_017_thieuTruongHoacLechMucKeHoach_baoTruocKhiGui', async () => {
  view()
  const dialog = await openBatch()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Thêm dòng' }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Gửi lô 1 dòng' }))
  const row = within(dialog).getByRole('group', { name: 'Dòng 01' })
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Chưa lưu lô công việc')
  expect(within(row).getByText('Chọn mức quan trọng.')).toBeInTheDocument()
  fireEvent.change(within(row).getByLabelText('Người cao tuổi'), { target: { value: '77' } })
  fireEvent.change(within(row).getByLabelText('Loại công việc'), { target: { value: '9' } })
  fireEvent.change(within(row).getByLabelText('Giờ dự kiến'), { target: { value: '08:00' } })
  fireEvent.change(within(row).getByLabelText('Mức quan trọng'), { target: { value: 'IMPORTANT' } })
  expect(within(row).getByText('Mục kế hoạch yêu cầu mức Thường.')).toBeInTheDocument()
  expect(api.calls('POST', '/shifts/5/care-tasks/plan')).toHaveLength(0)
})

it('FR_023_phatSinhKhongGuiIdCanCu_viecChungKhongGanNguoi', async () => {
  api.on('POST', '/shifts/5/care-tasks/plan', json(201, []))
  view()
  const dialog = await openBatch()
  const row = await enterRow(dialog)
  fireEvent.change(within(row).getByLabelText('Giờ dự kiến'), { target: { value: '09:00' } })
  fireEvent.change(within(row).getByLabelText('Phân công'), { target: { value: 'SHARED' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Gửi lô 1 dòng' }))
  expect(await within(row).findByText(/Giờ này không khớp nguồn nào/)).toBeInTheDocument()
  expect(api.calls('POST', '/shifts/5/care-tasks/plan')).toHaveLength(0)
  fireEvent.click(within(row).getByLabelText('Lập là việc phát sinh, không theo nguồn nào'))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Gửi lô 1 dòng' }))
  await waitFor(() => expect(api.calls('POST', '/shifts/5/care-tasks/plan')).toHaveLength(1))
  const body = JSON.parse(api.calls('POST', '/shifts/5/care-tasks/plan')[0][1].body)[0]
  expect(body.basis).toEqual({ type: 'AD_HOC' })
  expect(body.performerId).toBeUndefined()
  expect(body.shared).toBe(true)
})

it('BR_M04_01_loiTheoDong_giuNoiDung_baoTaiTruong', async () => {
  api.on(
    'POST',
    '/shifts/5/care-tasks/plan',
    problem(409, 'UNMET_CONDITIONS', { rowErrors: [{ row: 1, codes: ['OUTSIDE_SHIFT'] }] }),
  )
  view()
  const dialog = await openBatch()
  await enterRow(dialog)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Gửi lô 1 dòng' }))
  const alert = await within(dialog).findByRole('alert')
  expect(alert).toHaveTextContent('Chưa lưu lô công việc')
  expect(within(alert).getByRole('link', { name: /Đến dòng 01/ })).toBeInTheDocument()
  const row = within(dialog).getByRole('group', { name: 'Dòng 01' })
  expect(within(row).getByText('Có 1 lỗi')).toBeInTheDocument()
  expect(within(row).getByText('Giờ dự kiến phải từ 07:00 đến 15:00.')).toBeInTheDocument()
  expect(within(row).getByLabelText('Giờ dự kiến')).toHaveAttribute('aria-invalid', 'true')
  expect(within(row).getByLabelText('Nội dung (không bắt buộc)')).toHaveValue('Nội dung tự nhập')
  expect(screen.queryByText(/Đã lập .* công việc của ca/)).not.toBeInTheDocument()
})

it('BR_M04_24_viecCapCa_chonDuocThanhVienCaKhongVang', async () => {
  view()
  const dialog = await openBatch()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Thêm dòng' }))
  const row = within(dialog).getByRole('group', { name: 'Dòng 01' })
  fireEvent.change(within(row).getByLabelText('Người cao tuổi'), { target: { value: 'FLOOR' } })
  const values = [...within(row).getByLabelText('Phân công').options].map((o) => o.value)
  expect(values).toContain('33')
  expect(values).not.toContain('44')
  const bases = [...within(row).getByLabelText('Căn cứ').options].map((o) => o.value)
  expect(bases).toEqual(['', 'SHIFT_START_CHECK', 'SUPERVISION', 'AD_HOC'])
})

it('FR_017_khongCoQuyenThiKhongHienLenhLap', async () => {
  api.on('GET', '/me/permissions', json(200, []))
  view()
  expect(await screen.findByText('Bạn không có quyền xem lập công việc của ca')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Lập công việc' })).not.toBeInTheDocument()
})

// BF-01 bước 15 nối BF-02 bước 1: mở từ thông báo thì chọn sẵn ngày, ca chứa thời điểm trong modal, báo người đó
it('FR_020_moTuThongBao_chonCaChuaThoiDiem_vaBaoNguoiCaoTuoi', async () => {
  api.on(
    'GET',
    '/me/shifts',
    json(200, [
      { id: 4, status: 'PUBLISHED', startsAt: '2030-01-10T00:00:00Z', endsAt: '2030-01-10T02:00:00Z' },
      { id: 5, status: 'PUBLISHED', startsAt: '2030-01-10T02:00:00Z', endsAt: '2030-01-10T11:00:00Z' },
    ]),
  )
  view({ residentId: 77, at: '2030-01-10T03:00:00Z' })
  expect(await screen.findByText('[Họ tên kiểm thử] cần lập công việc')).toBeInTheDocument()
  expect(screen.getByText('Từ thông báo')).toBeInTheDocument()
  expect(api.calls('GET', '/shifts/5/source-data')).toHaveLength(1)
  const query = new URL(api.calls('GET', '/me/shifts')[0][0], 'http://localhost').searchParams
  expect(query.get('from')).toBe('2030-01-10')
  expect(query.get('to')).toBe('2030-01-11')
  const batch = await openBatch()
  expect(within(batch).getByLabelText('Ngày lập')).toHaveValue('2030-01-10')
  expect(within(batch).getByLabelText('Ca đã công bố')).toHaveValue('5')
  fireEvent.click(within(batch).getByRole('button', { name: 'Đối chiếu nguồn' }))
  const dialog = await screen.findByRole('dialog', { name: 'Chi tiết công việc của ca' })
  expect(within(dialog).getByRole('button', { name: /\[Họ tên kiểm thử\]/ })).toHaveAttribute('aria-pressed', 'true')
  expect(api.calls('POST', '/shifts/5/care-tasks/plan')).toHaveLength(0)
})

// Người chưa có ở trang hồ sơ đầu thì tải riêng hồ sơ để hiện tên
it('FR_020_moTuThongBao_nguoiChuaCoOTrangHoSoDau_taiRiengDeHienTen', async () => {
  api.on('GET', '/residents/88', json(200, { id: 88, personalInfo: { fullName: '[Người mới vào tầng]' } }))
  view({ shiftId: 5, residentId: 88 })
  expect(await screen.findByText(/\[Người mới vào tầng\] không có trong ca .*, chọn ca khác khi lập/)).toBeInTheDocument()
})
