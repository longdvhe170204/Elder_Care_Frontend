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
  const tab = await screen.findByRole('radio', { name: /Đã kết thúc/ }).catch(() => screen.findByText(/Đã kết thúc/))
  fireEvent.click(tab)
}

describe('ChangeRequestsPage: danh sách', () => {
  it('daThayThe_hienNhanTiengViet_khongHienMaKyThuat', async () => {
    renderPage()
    await openDoneTab()
    expect(await screen.findByText('Bị thay thế')).toBeInTheDocument()
    expect(screen.queryByText(/superseded/i)).not.toBeInTheDocument()
  })

  it('dangTaiDanhSach_vanCoNutLapYeuCau_vaOTim', async () => {
    // route không khai báo thì treo: danh sách chưa tải xong
    api.on('GET', '/residency-change-requests', () => new Promise(() => {}))
    renderPage()
    expect(await screen.findByRole('button', { name: 'Lập yêu cầu điều chỉnh' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Tìm theo tên người cao tuổi, mã yêu cầu, mã hợp đồng' })).toBeInTheDocument()
  })

  it('bang_coCotSoThuTu', async () => {
    renderPage()
    await openDoneTab()
    const table = await screen.findByRole('table', { name: 'Yêu cầu điều chỉnh hợp đồng' })
    expect(within(table).getByRole('columnheader', { name: '#' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Người cao tuổi / Hợp đồng' })).toBeInTheDocument()
  })

  it('oTim_loc_theoMaYeuCauHoacMaHopDong', async () => {
    renderPage()
    await openDoneTab()
    await screen.findByText('Yêu cầu mã 11')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm theo tên người cao tuổi, mã yêu cầu, mã hợp đồng' }), {
      target: { value: '32' },
    })
    expect(screen.queryByText('Yêu cầu mã 11')).not.toBeInTheDocument()
    expect(screen.getByText('Yêu cầu mã 10')).toBeInTheDocument()
  })

  it('timKhongThay_baoKhongCoYeuCau', async () => {
    renderPage()
    await openDoneTab()
    await screen.findByText('Yêu cầu mã 11')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm theo tên người cao tuổi, mã yêu cầu, mã hợp đồng' }), {
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
    fireEvent.click(within(screen.getByRole('group', { name: 'Lọc theo loại thay đổi' })).getByRole('button', { name: 'Loại phòng' }))
    expect(screen.queryByText('Yêu cầu mã 11')).not.toBeInTheDocument()
    expect(screen.getByText('Yêu cầu mã 10')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Ngày hiệu lực'), { target: { value: '2026-11-20' } })
    expect(screen.getByText('Không có yêu cầu nào trong nhóm này.')).toBeInTheDocument()
  })

  it('nhanTrangThai_coNenTheoTong_daApDungXanhLa_daThayTheXam', async () => {
    renderPage()
    await openDoneTab()
    expect((await screen.findByText('Đã áp dụng')).className).toMatch(/bg-success/)
    expect(screen.getByText('Bị thay thế').className).toMatch(/bg-muted/)
  })

  it('tab_hienSoLuongTrongNgoac', async () => {
    renderPage()
    expect(await screen.findByText('Đã kết thúc (2)')).toBeInTheDocument()
  })

  it('nutXem_moChiTietCuaDong', async () => {
    renderPage()
    await openDoneTab()
    fireEvent.click(await screen.findByRole('button', { name: 'Xem yêu cầu mã 11' }))
    expect(await screen.findByText('Sau đợt đánh giá mới')).toBeInTheDocument()
  })

  it('quanLyVien_khongThayTabNhap_macDinhTabChoDuyet', async () => {
    api.on(
      'GET',
      '/me/permissions',
      json(200, [
        { function: 'RESIDENCY_CHANGE_REQUEST', operation: 'VIEW' },
        { function: 'RESIDENCY_CHANGE_REQUEST', operation: 'APPROVE' },
      ]),
    )
    const pending = { ...BASE, approvalRequestId: 12, status: 'PENDING_APPROVAL' }
    const draft = { ...BASE, approvalRequestId: 13, status: 'DRAFT' }
    api.on('GET', '/residency-change-requests', json(200, [pending, draft]))
    renderPage()
    expect(await screen.findByText('Yêu cầu mã 12')).toBeInTheDocument()
    expect(screen.queryByText('Yêu cầu mã 13')).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /Nháp/ })).not.toBeInTheDocument()
    expect(screen.getByText('Chờ duyệt (1)')).toBeInTheDocument()
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
    expect(within(view).getByText('Đã áp dụng')).toBeInTheDocument()
    expect(within(view).getByText('20/11/2026')).toBeInTheDocument()
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

  it('thanh5Buoc_noiCoDinhTrenDau_vaFormNamChungMotKhungCuon', async () => {
    const view = await openDetail()
    const bar = within(view).getByRole('progressbar', { name: 'Tiến trình yêu cầu' })
    const stickyBar = bar.parentElement.parentElement
    expect(stickyBar.className).toMatch(/sticky/)
    expect(stickyBar.className).toMatch(/top-0/)
    // Không tách khung cuộn riêng cho thân và chân trang
    expect(view.querySelector('.overflow-y-auto')).toBeNull()
    expect(view.querySelector('.overflow-hidden')).toBeNull()
    // Khung chi tiết rộng 520px dễ nhìn hơn mặc định 420px
    expect(view.parentElement.className).toMatch(/520px/)
  })

  it('nutHanhDongNhieuCap_nutChinhRongHetHang_huyChuDo', async () => {
    const draft = { ...BASE, approvalRequestId: 12, status: 'DRAFT', representativeConfirmationRequired: true }
    api.on('GET', '/residency-change-requests', json(200, [draft]))
    api.on('GET', '/residency-change-requests/12', json(200, draft, { ETag: '"2"' }))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Xem yêu cầu mã 12' }))
    const view = await screen.findByRole('complementary', { name: 'Chi tiết yêu cầu điều chỉnh hợp đồng' })
    const footer = within(view).getByRole('group', { name: 'Lệnh của yêu cầu' })
    expect(within(footer).getByRole('button', { name: 'Gửi người đại diện xác nhận' }).className).toMatch(/w-full/)
    expect(within(footer).getByRole('button', { name: 'Sửa yêu cầu nháp' }).className).toMatch(/rounded-lg/)
    expect(within(footer).getByRole('button', { name: 'Ghi xác nhận trực tiếp' }).className).toMatch(/rounded-lg/)
    expect(within(footer).getByRole('button', { name: 'Hủy yêu cầu' }).className).toMatch(/text-red-600/)
  })
})

describe('ChangeRequestsPage: tìm theo tên và phân trang', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({
    ...APPLIED,
    approvalRequestId: 100 + i,
    residentId: i < 2 ? 6 : 5,
  }))

  beforeEach(() => {
    api.on('GET', '/residency-change-requests', json(200, many))
    api.on('GET', '/residents/6', json(200, { id: 6, personalInfo: { fullName: 'Trần Văn Bình' } }))
  })

  const viewButtons = () => screen.queryAllByRole('button', { name: /^Xem yêu cầu mã/ })

  it('moiTrang10YeuCau_nutSauChuyenTrang', async () => {
    renderPage()
    await openDoneTab()
    await screen.findByText('1–10 trên 12 yêu cầu')
    expect(viewButtons()).toHaveLength(10)
    expect(screen.getByRole('button', { name: 'Trước' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Sau' }))
    expect(await screen.findByText('11–12 trên 12 yêu cầu')).toBeInTheDocument()
    expect(viewButtons()).toHaveLength(2)
    expect(screen.getByText('Trang 2 / 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sau' })).toBeDisabled()
  })

  it('timTheoTen_khongPhanBietDau_vaVeTrangDau', async () => {
    renderPage()
    await openDoneTab()
    await screen.findByText('1–10 trên 12 yêu cầu')
    fireEvent.click(screen.getByRole('button', { name: 'Sau' }))
    await screen.findByText('Trang 2 / 2')

    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm theo tên người cao tuổi, mã yêu cầu, mã hợp đồng' }), {
      target: { value: 'binh' },
    })
    expect(await screen.findAllByRole('button', { name: /^Xem yêu cầu mã/ })).toHaveLength(2)
    expect(screen.queryByText(/Trang \d \/ \d/)).not.toBeInTheDocument()
  })
})
