import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { PermissionsProvider } from '@/common/permissions/permissions'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { CarePlanPage } from './CarePlanPage'

const item = {
  id: 91,
  taskTypeId: 5,
  content: 'Xoay trở người kiểm thử',
  frequencyType: 'EVERY_N_HOURS',
  intervalHours: 2,
  startsAt: '06:00',
  performerRole: 'CAREGIVER',
  importance: 'MANDATORY',
}
const effective = { id: 11, revision: 2, status: 'EFFECTIVE', effectiveFrom: '2026-10-20', items: [item] }

let api
beforeEach(() => {
  api = mockRoutes()
  // GET /residents trả Profile (api-001): họ tên ở personalInfo.fullName
  api.on(
    'GET',
    '/residents',
    json(200, {
      items: [{ id: 77, profileCode: 'NCT-077', personalInfo: { fullName: '[Họ tên kiểm thử]' } }],
      nextCursor: null,
    }),
  )
  api.on(
    'GET',
    '/residents/77/care-plans',
    json(200, [{ id: 10, revision: 1, status: 'EXPIRED', effectiveFrom: '2026-10-01', items: [] }, effective]),
  )
  api.on('GET', '/me/permissions', json(200, [{ function: 'CARE_PLAN', operation: 'CREATE' }]))
  api.on('GET', '/task-types', json(200, [{ id: 5, name: 'Hỗ trợ vận động', status: 'ACTIVE', group: 'MOVEMENT' }]))
})
afterEach(() => vi.unstubAllGlobals())

function renderPage(props = { residentId: 77 }) {
  return render(
    <PermissionsProvider>
      <CarePlanPage {...props} />
    </PermissionsProvider>,
  )
}

it('Q447_chuaCoKeHoach_hienNutLapKeHoachKhongCoPhienBan', async () => {
  api.on('GET', '/residents/77/care-plans', json(200, []))
  api.on('POST', '/residents/77/care-plans', json(201, { id: 12 }, { ETag: '"0"' }))
  api.on(
    'GET',
    '/care-plans/12',
    json(200, { id: 12, residentId: 77, status: 'DRAFT', items: [], riskAgreements: [], allowedCommands: [] }),
  )
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: 'Lập kế hoạch' }))
  await waitFor(() => expect(api.calls('POST', '/residents/77/care-plans')).toHaveLength(1))
  expect(JSON.parse(api.calls('POST', '/residents/77/care-plans')[0][1].body)).toEqual({})
  expect(screen.queryByText(/Phiên bản/)).not.toBeInTheDocument()
})

it('Q447_coKeHoachHienHanh_hienMucVaNutSuaKeHoach', async () => {
  renderPage()
  expect(await screen.findByText('Xoay trở người kiểm thử')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sửa kế hoạch' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Lập kế hoạch' })).not.toBeInTheDocument()
  expect(screen.queryByText(/Phiên bản/)).not.toBeInTheDocument()
  expect(screen.queryByLabelText('So sánh từ phiên bản')).not.toBeInTheDocument()
})

it('chỉ hiện nút lập hoặc sửa kế hoạch khi tài khoản có quyền lập', async () => {
  api.on('GET', '/me/permissions', json(200, [{ function: 'CARE_PLAN', operation: 'VIEW' }]))
  renderPage()

  expect(await screen.findByText('Xoay trở người kiểm thử')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Lập kế hoạch' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Sửa kế hoạch' })).not.toBeInTheDocument()
})

it('Q447_dangCoBanApDungNgayMai_hienNhanVaNutSuaChepBanDo', async () => {
  api.on(
    'GET',
    '/residents/77/care-plans',
    json(200, [
      effective,
      { id: 13, revision: 3, status: 'PENDING_EFFECT', effectiveFrom: '2026-11-26', items: [item] },
    ]),
  )
  api.on('POST', '/residents/77/care-plans', json(201, { id: 14 }, { ETag: '"0"' }))
  api.on(
    'GET',
    '/care-plans/14',
    json(200, { id: 14, residentId: 77, status: 'DRAFT', items: [], riskAgreements: [], allowedCommands: [] }),
  )
  renderPage()
  expect(await screen.findByText('Đã duyệt, áp dụng từ 26/11')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Sửa kế hoạch' }))
  await waitFor(() => expect(api.calls('POST', '/residents/77/care-plans')).toHaveLength(1))
})

it('Q447_dangCoBanSua_khongLapThemMaMoBanDo', async () => {
  api.on(
    'GET',
    '/residents/77/care-plans',
    json(200, [effective, { id: 15, revision: 3, status: 'PENDING_APPROVAL', createdBy: 'Hoàng Thị Dung', items: [] }]),
  )
  api.on(
    'GET',
    '/care-plans/15',
    json(200, {
      id: 15,
      residentId: 77,
      status: 'PENDING_APPROVAL',
      items: [],
      riskAgreements: [],
      allowedCommands: [],
    }),
  )
  api.on('GET', '/care-plans/compare', json(200, { added: [], removed: [item], changed: [] }))
  renderPage()
  expect(await screen.findByRole('heading', { name: 'Bản sửa chờ Bác sĩ duyệt' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Sửa kế hoạch' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Xem bản sửa' }))
  await waitFor(() => expect(api.calls('GET', '/care-plans/15').length).toBeGreaterThan(0))
  expect(api.calls('POST', '/residents/77/care-plans')).toHaveLength(0)
  // Bản sửa mở trong hộp thoại giữa màn, không phải panel trượt từ phải
  const dialog = await screen.findByRole('dialog')
  expect(dialog).toHaveAttribute('data-slot', 'dialog-content')
  expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull()
})

it('F5_timNguoiCaoTuoi_goiYHoTenVaMaHoSo_chonThiTaiKeHoach', async () => {
  renderPage({})
  // Q-448: chưa chọn người thì hiện hàng chờ (đang tải vì route hàng chờ không khai báo)
  expect(screen.getByRole('tab', { name: 'Cần lập hoặc sửa' })).toBeInTheDocument()
  fireEvent.change(screen.getByRole('combobox', { name: 'Tìm người cao tuổi' }), { target: { value: 'kiểm thử' } })
  fireEvent.click(await screen.findByRole('option', { name: '[Họ tên kiểm thử] · NCT-077' }))
  expect(await screen.findByText('Xoay trở người kiểm thử')).toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: 'Tìm người cao tuổi' })).toHaveValue('[Họ tên kiểm thử] · NCT-077')
})

it('Figma_keHoachHienHanhDangBang_cotTheoThietKe', async () => {
  renderPage()
  const table = await screen.findByRole('table', { name: 'Mục của kế hoạch đang áp dụng' })
  for (const head of [
    'Loại công việc',
    'Nội dung',
    'Tần suất và giờ',
    'Vai trò thực hiện',
    'Mức quan trọng',
    'Mục tiêu nước',
  ])
    expect(screen.getByRole('columnheader', { name: head })).toBeInTheDocument()
  expect(table).toHaveTextContent('Hỗ trợ vận động')
  expect(table).toHaveTextContent('Mỗi 2 giờ')
  expect(table).toHaveTextContent('Bắt đầu 06:00')
  expect(table).toHaveTextContent('Nhân viên chăm sóc')
  expect(table).toHaveTextContent('Bắt buộc')
  expect(screen.getByText('Hiệu lực từ 20/10/2026')).toBeInTheDocument()
})

it('FR_007_khongCoQuyenXemThiKhongHienDuLieuHayLenhLap', async () => {
  api.on('GET', '/me/permissions', json(200, []))
  api.on('GET', '/residents/77/care-plans', problem(403, 'PERMISSION_DENIED'))
  renderPage()
  expect(await screen.findByText('Bạn không có quyền xem kế hoạch chăm sóc')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Lập kế hoạch' })).not.toBeInTheDocument()
})

it('Q447_banNhap_tachKhoiRieng_ghiNguoiLapVaSoThayDoi', async () => {
  api.on(
    'GET',
    '/residents/77/care-plans',
    json(200, [effective, { id: 16, status: 'DRAFT', createdBy: 'Hoàng Thị Dung', items: [item] }]),
  )
  api.on(
    'GET',
    '/care-plans/compare',
    json(200, {
      added: [{ id: 1, taskTypeId: 5 }],
      removed: [],
      changed: [{ before: item, after: item, changedFields: ['intervalHours'] }],
    }),
  )
  renderPage()
  expect(await screen.findByRole('heading', { name: 'Kế hoạch đang áp dụng' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Bản nháp chưa áp dụng' })).toBeInTheDocument()
  expect(
    await screen.findByText('Hoàng Thị Dung đang soạn · 2 thay đổi so với kế hoạch đang áp dụng'),
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Mở bản nháp' })).toBeInTheDocument()
  const [url] = api.calls('GET', '/care-plans/compare')[0]
  expect(new URL(url, 'http://localhost').searchParams.get('to')).toBe('16')
})

it('Q447_dongKhiChuaLuu_hoiTruocKhiDong', async () => {
  api.on(
    'GET',
    '/residents/77/care-plans',
    json(200, [effective, { id: 16, status: 'DRAFT', createdBy: 'Hoàng Thị Dung', items: [item] }]),
  )
  api.on('GET', '/care-plans/compare', json(200, { added: [], removed: [], changed: [] }))
  api.on(
    'GET',
    '/care-plans/16',
    json(
      200,
      {
        id: 16,
        residentId: 77,
        status: 'DRAFT',
        items: [item],
        allowedCommands: ['replaceItems', 'submit', 'cancel'],
        createdBy: 'Hoàng Thị Dung',
      },
      { ETag: '"1"' },
    ),
  )
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: 'Mở bản nháp' }))
  // Q-450: không còn ô "Lý do sửa"; thêm một mục để có thay đổi chưa lưu
  fireEvent.click(await screen.findByRole('button', { name: /Thêm mục công việc/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Đóng' }))
  const ask = await screen.findByRole('alertdialog', { name: 'Bạn có thay đổi chưa lưu' })
  fireEvent.click(within(ask).getByRole('button', { name: 'Ở lại' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  expect(screen.getByRole('button', { name: /Thêm mục công việc/ })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Đóng' }))
  fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Đóng không lưu' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: /Thêm mục công việc/ })).not.toBeInTheDocument())
})

it('Q448_coYeuCauXemXet_hienLyDo_khongCanThayDoiBatBuocLyDo', async () => {
  api.on(
    'GET',
    '/residents/77/care-plan-reviews',
    json(200, [{ source: 'M05.INCIDENT', sourceId: 3, reference: '3', raisedAt: '2026-11-25T07:20:00Z' }]),
  )
  api.on('POST', '/residents/77/care-plan-reviews/dismiss', json(200, {}))
  renderPage()
  const notice = await screen.findByRole('region', { name: 'Cần xem xét kế hoạch' })
  expect(within(notice).getByText(/Sự cố ngã/)).toBeInTheDocument()

  fireEvent.click(within(notice).getByRole('button', { name: 'Không cần thay đổi' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận không cần thay đổi' }))
  expect(await screen.findByText('Nhập lý do không cần thay đổi kế hoạch.')).toBeInTheDocument()
  expect(api.calls('POST', '/residents/77/care-plan-reviews/dismiss')).toHaveLength(0)

  fireEvent.change(screen.getByRole('textbox', { name: /Lý do không cần thay đổi/ }), {
    target: { value: 'Đã xem, kế hoạch hiện hành vẫn phù hợp' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận không cần thay đổi' }))
  await waitFor(() => expect(api.calls('POST', '/residents/77/care-plan-reviews/dismiss')).toHaveLength(1))
  expect(JSON.parse(api.calls('POST', '/residents/77/care-plan-reviews/dismiss')[0][1].body)).toEqual({
    reason: 'Đã xem, kế hoạch hiện hành vẫn phù hợp',
  })
})

it('Q448_chuaChonNguoi_hienHangChoThayChoLoiNhac', async () => {
  api.on('GET', '/care-plan-reviews/queue', json(200, []))
  renderPage({})
  expect(await screen.findByText('Không có ai cần lập hoặc sửa kế hoạch')).toBeInTheDocument()
  expect(screen.queryByText('Chọn người cao tuổi để xem kế hoạch.')).not.toBeInTheDocument()
})

it('Q448_oTim_khongTuMoKhiChuaGo_dongKhiBamRaNgoai', async () => {
  api.on('GET', '/care-plan-reviews/queue', json(200, []))
  renderPage({})
  const box = screen.getByRole('combobox', { name: 'Tìm người cao tuổi' })
  fireEvent.focus(box)
  expect(box).toHaveAttribute('aria-expanded', 'false')

  fireEvent.change(box, { target: { value: 'kiểm thử' } })
  expect(await screen.findByRole('listbox')).toBeInTheDocument()
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(box).toHaveAttribute('aria-expanded', 'false')
})

it('Q448_lyDoTuDanhGia_hienNoiDungDanhGia_veDanhSachThiXoaOTim', async () => {
  api.on(
    'GET',
    '/residents/77/care-plan-reviews',
    json(200, [{ source: 'M01.ASSESSMENT', sourceId: 4, reference: '4', raisedAt: '2026-11-25T02:00:00Z' }]),
  )
  api.on(
    'GET',
    '/assessments/4',
    json(200, {
      id: 4,
      status: 'CONFIRMED',
      confirmedAt: '2026-11-25T02:00:00Z',
      confirmedBy: 'Lê Văn Minh',
      careLevel: 'SPECIAL',
      careNeeds: [{ id: 1, name: 'Hỗ trợ đi lại' }],
      careNote: null,
      comment: null,
    }),
  )
  api.on('GET', '/care-plan-reviews/queue', json(200, []))
  renderPage({})
  fireEvent.change(screen.getByRole('combobox', { name: 'Tìm người cao tuổi' }), { target: { value: 'kiểm thử' } })
  fireEvent.click(await screen.findByRole('option', { name: '[Họ tên kiểm thử] · NCT-077' }))
  const notice = await screen.findByRole('region', { name: 'Cần xem xét kế hoạch' })
  expect(await within(notice).findByText('Hỗ trợ đi lại')).toBeInTheDocument()
  expect(within(notice).getByText('Đặc biệt')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Về danh sách cần lập' }))
  expect(screen.getByRole('combobox', { name: 'Tìm người cao tuổi' })).toHaveValue('')
})
