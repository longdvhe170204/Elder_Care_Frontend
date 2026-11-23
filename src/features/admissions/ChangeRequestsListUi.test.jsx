import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { json, mockRoutes } from '@/test/fetchRoutes'
import { PermissionsProvider } from '@/common/permissions/permissions'
import { ChangeRequestsPage } from './ChangeRequestsPage'

// Giao diện danh sách yêu cầu điều chỉnh hợp đồng (2026-11-22): nhãn "Đã thay thế" thay mã kỹ thuật, ô tìm, cột #, nút xem
// chi tiết; form có biểu tượng cho loại thay đổi và hàng nút dính đáy. Không đổi API, trạng thái, quyền.

const BASE = {
  contractId: 31,
  residentId: 5,
  changeTypes: ['CARE_LEVEL'],
  newValue: { careLevel: 'SPECIAL' },
  previousValue: { careLevel: 'REGULAR' },
  requestedEffectiveDate: '2026-11-20',
  reason: 'Sau đợt đánh giá mới',
  costImpact: [],
  minorChange: false,
  requestedBy: 'Hoàng Thu Hà',
}
const APPLIED = { ...BASE, approvalRequestId: 11, status: 'APPLIED' }
const SUPERSEDED = { ...BASE, approvalRequestId: 10, contractId: 32, status: 'SUPERSEDED' }

let api

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
  api = mockRoutes()
  api.on(
    'GET',
    '/me/permissions',
    json(200, [
      ...['VIEW', 'CREATE', 'UPDATE'].map((operation) => ({ function: 'RESIDENCY_CHANGE_REQUEST', operation })),
      { function: 'ADMISSION_CONTRACT_DEPOSIT', operation: 'VIEW' },
    ]),
  )
  api.on('GET', '/residency-change-requests', json(200, [APPLIED, SUPERSEDED]))
  api.on('GET', '/residency-change-requests/11', json(200, APPLIED, { ETag: '"1"' }))
  api.on('GET', '/contracts', json(200, []))
  api.on('GET', '/services', json(200, []))
  api.on('GET', '/residents/5', json(200, { id: 5, personalInfo: { fullName: 'Nguyễn Thị Lan' } }))
  api.on('GET', '/residents/5/assessments', json(200, []))
  api.on('GET', '/residency-change-requests/11/resident-opinions', json(200, []))
  api.on('GET', '/residents/5/relationships', json(200, []))
  api.on('GET', '/staff', json(200, []))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderPage() {
  return render(
    <PermissionsProvider>
      <ChangeRequestsPage />
    </PermissionsProvider>,
  )
}

async function openDoneTab() {
  const tab = await screen.findByRole('radio', { name: /Đã xong/ }).catch(() => screen.findByText(/Đã xong/))
  fireEvent.click(tab)
}

describe('ChangeRequestsPage: danh sách', () => {
  it('daThayThe_hienNhanTiengViet_khongHienMaKyThuat', async () => {
    renderPage()
    await openDoneTab()
    expect(await screen.findByText('Đã thay thế')).toBeInTheDocument()
    expect(screen.queryByText(/superseded/i)).not.toBeInTheDocument()
  })

  it('dangTaiDanhSach_vanCoNutLapYeuCau_vaOTim', async () => {
    // route không khai báo thì treo: danh sách chưa tải xong
    api.on('GET', '/residency-change-requests', () => new Promise(() => {}))
    renderPage()
    expect(await screen.findByRole('button', { name: 'Lập yêu cầu điều chỉnh' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Tìm theo mã yêu cầu, mã hợp đồng' })).toBeInTheDocument()
  })

  it('bang_coCotSoThuTu', async () => {
    renderPage()
    await openDoneTab()
    const table = await screen.findByRole('table', { name: 'Yêu cầu điều chỉnh hợp đồng' })
    expect(within(table).getByRole('columnheader', { name: '#' })).toBeInTheDocument()
  })

  it('oTim_loc_theoMaYeuCauHoacMaHopDong', async () => {
    renderPage()
    await openDoneTab()
    await screen.findByText('Yêu cầu mã 11')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm theo mã yêu cầu, mã hợp đồng' }), {
      target: { value: '32' },
    })
    expect(screen.queryByText('Yêu cầu mã 11')).not.toBeInTheDocument()
    expect(screen.getByText('Yêu cầu mã 10')).toBeInTheDocument()
  })

  it('timKhongThay_baoKhongCoYeuCau', async () => {
    renderPage()
    await openDoneTab()
    await screen.findByText('Yêu cầu mã 11')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm theo mã yêu cầu, mã hợp đồng' }), {
      target: { value: '999' },
    })
    expect(screen.getByText('Không có yêu cầu nào trong nhóm này.')).toBeInTheDocument()
  })

  it('loc_theoLoaiThayDoi_vaNgayHieuLuc', async () => {
    api.on('GET', '/residency-change-requests', json(200, [APPLIED, { ...SUPERSEDED, changeTypes: ['BED'], requestedEffectiveDate: '2026-11-25' }]))
    renderPage()
    await openDoneTab()
    await screen.findByText('Yêu cầu mã 11')
    fireEvent.click(screen.getByRole('button', { name: 'Lọc' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Lọc theo loại thay đổi' })).getByRole('button', { name: 'Giường' }))
    expect(screen.queryByText('Yêu cầu mã 11')).not.toBeInTheDocument()
    expect(screen.getByText('Yêu cầu mã 10')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Ngày hiệu lực'), { target: { value: '2026-11-20' } })
    expect(screen.getByText('Không có yêu cầu nào trong nhóm này.')).toBeInTheDocument()
  })

  it('nhanTrangThai_coNenTheoTong_daApDungXanhLa_daThayTheXam', async () => {
    renderPage()
    await openDoneTab()
    expect((await screen.findByText('Đã áp dụng')).className).toMatch(/bg-success/)
    expect(screen.getByText('Đã thay thế').className).toMatch(/bg-muted/)
  })

  it('tab_hienSoLuongTrongNgoac', async () => {
    renderPage()
    expect(await screen.findByText('Đã xong (2)')).toBeInTheDocument()
  })

  it('nutXem_moChiTietCuaDong', async () => {
    renderPage()
    await openDoneTab()
    fireEvent.click(await screen.findByRole('button', { name: 'Xem yêu cầu mã 11' }))
    expect(await screen.findByText('Sau đợt đánh giá mới')).toBeInTheDocument()
  })
})

describe('ChangeRequestSheet: form lập yêu cầu', () => {
  it('loaiThayDoi_moiLuaChonCoBieuTuong', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Lập yêu cầu điều chỉnh' }))
    const dialog = await screen.findByRole('dialog')
    const checkboxes = within(dialog).getAllByRole('checkbox')
    expect(checkboxes.length).toBeGreaterThanOrEqual(6)
    for (const box of checkboxes.slice(0, 6)) expect(box.closest('label').querySelector('svg')).not.toBeNull()
  })

  it('nutHuy_vaLuu_oCuoiForm', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Lập yêu cầu điều chỉnh' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Hủy' })).toBeInTheDocument()
    expect(within(dialog).getByText('0 / 2000')).toBeInTheDocument()
  })

  it('hangNut_dinhDay_khungCuon', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Lập yêu cầu điều chỉnh' }))
    const dialog = await screen.findByRole('dialog')
    const save = within(dialog).getByRole('button', { name: 'Lưu yêu cầu' })
    expect(save.parentElement.className).toMatch(/sticky/)
  })
})

describe('ChangeRequestView: form xem chi tiết', () => {
  async function openDetail() {
    renderPage()
    await openDoneTab()
    fireEvent.click(await screen.findByRole('button', { name: 'Xem yêu cầu mã 11' }))
    return screen.findByRole('complementary', { name: 'Chi tiết yêu cầu điều chỉnh hợp đồng' })
  }

  it('dauKhung_hienHopDong_trangThai_ngayHieuLuc', async () => {
    const view = await openDetail()
    expect(within(view).getByRole('heading', { level: 2, name: 'Nguyễn Thị Lan' })).toBeInTheDocument()
    expect(within(view).getByText('Đã áp dụng. Ngày hiệu lực mong muốn 20/11/2026', { exact: false })).toBeInTheDocument()
  })

  it('noiDungThayDoi_hienTruocVaSauThanhHaiO', async () => {
    const view = await openDetail()
    expect(within(view).getByRole('heading', { name: 'Nội dung thay đổi' })).toBeInTheDocument()
    expect(within(view).getByText('Thường xuyên').className).toMatch(/rounded-md/)
    expect(within(view).getByText('Đặc biệt').className).toMatch(/bg-primary/)
  })

  it('hangLenh_oChanKhung_coNhom', async () => {
    const view = await openDetail()
    const footer = within(view).getByRole('group', { name: 'Lệnh của yêu cầu' })
    expect(within(footer).getByRole('button', { name: 'Tải lại' })).toBeInTheDocument()
  })
})
