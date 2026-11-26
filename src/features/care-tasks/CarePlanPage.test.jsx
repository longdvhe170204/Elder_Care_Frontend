import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

it('Q447_dangCoBanApDungNgayMai_hienNhanVaNutSuaChepBanDo', async () => {
  api.on(
    'GET',
    '/residents/77/care-plans',
    json(200, [effective, { id: 13, revision: 3, status: 'PENDING_EFFECT', effectiveFrom: '2026-11-26', items: [item] }]),
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
    json(200, [effective, { id: 15, revision: 3, status: 'PENDING_APPROVAL', items: [] }]),
  )
  api.on(
    'GET',
    '/care-plans/15',
    json(200, { id: 15, residentId: 77, status: 'PENDING_APPROVAL', items: [], riskAgreements: [], allowedCommands: [] }),
  )
  renderPage()
  expect(await screen.findByText('Chờ Bác sĩ duyệt')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Sửa kế hoạch' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Mở bản sửa' }))
  await waitFor(() => expect(api.calls('GET', '/care-plans/15').length).toBeGreaterThan(0))
  expect(api.calls('POST', '/residents/77/care-plans')).toHaveLength(0)
})

it('F5_timNguoiCaoTuoi_goiYHoTenVaMaHoSo_chonThiTaiKeHoach', async () => {
  renderPage({})
  expect(screen.getByText('Chọn người cao tuổi để xem kế hoạch.')).toBeInTheDocument()
  fireEvent.change(screen.getByRole('combobox', { name: 'Tìm người cao tuổi' }), { target: { value: 'kiểm thử' } })
  fireEvent.click(await screen.findByRole('option', { name: '[Họ tên kiểm thử] · NCT-077' }))
  expect(await screen.findByText('Xoay trở người kiểm thử')).toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: 'Tìm người cao tuổi' })).toHaveValue('[Họ tên kiểm thử] · NCT-077')
})

it('Figma_keHoachHienHanhDangBang_cotTheoThietKe', async () => {
  renderPage()
  const table = await screen.findByRole('table', { name: 'Mục của kế hoạch hiện hành' })
  for (const head of ['Loại công việc', 'Nội dung', 'Tần suất và giờ', 'Vai trò thực hiện', 'Mức quan trọng', 'Mục tiêu nước'])
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
