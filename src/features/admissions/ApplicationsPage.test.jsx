import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { PermissionsProvider } from '@/common/permissions/permissions'
import { ApplicationsPage } from './ApplicationsPage'

// 004 T019 (US1; FR-001, FR-006): danh sách lượt đăng ký lọc theo trạng thái kèm số đếm và lập đăng ký cho người Đang
// tiếp nhận. Bấm tên người cao tuổi mở thẳng màn Hồ sơ tiếp nhận (004 T114, chủ dự án yêu cầu 2026-11-17); điều kiện, ý
// kiến về việc vào ở, cập nhật đăng ký ở màn đó (AdmissionWorkspacePage.test.jsx).

let api

const OPEN = {
  id: 7,
  residentId: 5,
  applicationDate: '2026-11-01',
  desiredResidenceType: 'LONG_TERM_RESIDENTIAL',
  expectedCareLevel: 'REGULAR',
  status: 'IN_PROGRESS',
  contactPerson: 'Trần Văn Minh',
  admissionOpinion: [],
}
const WAITING = { ...OPEN, id: 8, residentId: 6, status: 'WAITING' }

function permissions(list) {
  api.on(
    'GET',
    '/me/permissions',
    json(
      200,
      list.map(([fn, operation]) => ({ function: fn, operation })),
    ),
  )
}

function renderPage(onNavigate = () => {}) {
  return render(
    <PermissionsProvider>
      <ApplicationsPage role="OFFICE_STAFF" onNavigate={onNavigate} />
    </PermissionsProvider>,
  )
}

beforeEach(() => {
  api = mockRoutes()
  permissions([
    ['ADMISSION_CONTRACT_DEPOSIT', 'VIEW'],
    ['ADMISSION_CONTRACT_DEPOSIT', 'CREATE'],
    ['ADMISSION_CONTRACT_DEPOSIT', 'UPDATE'],
  ])
  api.on('GET', '/admission-applications', json(200, [OPEN, WAITING]))
  api.on('GET', '/residents/5', json(200, { id: 5, personalInfo: { fullName: 'Nguyễn Thị Lan' } }))
  api.on('GET', '/residents/6', json(200, { id: 6, personalInfo: { fullName: 'Lê Văn Hải' } }))
  api.on(
    'GET',
    '/residents',
    json(200, { items: [{ id: 9, profileCode: 'NCT-0009', personalInfo: { fullName: 'Phạm Thị Mai' } }] }),
  )
})

describe('ApplicationsPage', () => {
  it('FR_006_bangLuotDangKy_locTheoTrangThaiKemSoDem', async () => {
    renderPage()

    expect(await screen.findByRole('button', { name: 'Nguyễn Thị Lan' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lê Văn Hải' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Đang tiếp nhận 1' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Chờ giường 1' }))
    expect(await screen.findByRole('button', { name: 'Lê Văn Hải' })).toBeInTheDocument()
  })

  it('004_T114_bamTenNguoiCaoTuoi_moThangHoSoTiepNhan', async () => {
    const onNavigate = vi.fn()
    renderPage(onNavigate)

    fireEvent.click(await screen.findByRole('button', { name: 'Nguyễn Thị Lan' }))
    expect(onNavigate).toHaveBeenCalledWith('admission-workspace', { id: 7 })
    expect(screen.queryByRole('heading', { name: 'Ý kiến về việc vào ở' })).not.toBeInTheDocument()
  })

  it('FR_001_lapDangKy_thieuTruong_baoTaiO_vaThanhCongThiTaiLaiDanhSach', async () => {
    api.on('POST', '/admission-applications', json(201, OPEN))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Lập đăng ký' }))

    fireEvent.click(screen.getByRole('button', { name: 'Lưu đăng ký' }))
    expect(await screen.findByText('Chọn người cao tuổi')).toBeInTheDocument()
    expect(api.calls('POST', '/admission-applications')).toHaveLength(0)

    const dialog = screen.getByRole('dialog')
    await within(dialog).findByRole('option', { name: 'Phạm Thị Mai (NCT-0009)' })
    fireEvent.change(within(dialog).getByLabelText('Người cao tuổi'), { target: { value: '9' } })
    fireEvent.change(within(dialog).getByLabelText('Ngày đăng ký'), { target: { value: '2026-11-06' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Nội trú dài hạn' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Thường xuyên' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu đăng ký' }))

    await waitFor(() => expect(api.calls('POST', '/admission-applications')).toHaveLength(1))
    const body = JSON.parse(api.calls('POST', '/admission-applications')[0][1].body)
    expect(body).toMatchObject({
      residentId: 9,
      applicationDate: '2026-11-06',
      desiredResidenceType: 'LONG_TERM_RESIDENTIAL',
      expectedCareLevel: 'REGULAR',
    })
  })

  it('FR_001_409DaCoLuotDangKy_hienLoiTrongKhung', async () => {
    api.on('POST', '/admission-applications', problem(409, 'APPLICATION_ALREADY_EXISTS'))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Lập đăng ký' }))
    const dialog = screen.getByRole('dialog')
    await within(dialog).findByRole('option', { name: 'Phạm Thị Mai (NCT-0009)' })
    fireEvent.change(within(dialog).getByLabelText('Người cao tuổi'), { target: { value: '9' } })
    fireEvent.change(within(dialog).getByLabelText('Ngày đăng ký'), { target: { value: '2026-11-06' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bán trú' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cơ bản' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu đăng ký' }))

    expect(await within(dialog).findByRole('alert')).toBeInTheDocument()
  })

  // Chủ dự án yêu cầu 2026-11-18: tạo hồ sơ xong thì sang ngay form lập đăng ký của chính người đó, lưu xong vào màn Hồ
  // sơ tiếp nhận để làm các bước sau; không phải đóng khung, chuyển màn, chọn lại người cao tuổi.
  it('tiepNhanMoi_taoHoSo_sangLapDangKy_luuXongMoHoSoTiepNhan', async () => {
    api.on(
      'POST',
      '/residents',
      json(201, {
        profile: { id: 20, profileCode: 'NCT-2026-000020', personalInfo: { fullName: 'Đỗ Thị Hoa' } },
        warnings: [{ code: 'MISSING_CONSENT', description: 'Chưa có bản đồng ý chia sẻ dữ liệu' }],
      }),
    )
    api.on('POST', '/admission-applications', json(201, { ...OPEN, id: 31, residentId: 20 }))
    const onNavigate = vi.fn()
    renderPage(onNavigate)

    fireEvent.click(await screen.findByRole('button', { name: 'Tiếp nhận mới' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Họ tên'), { target: { value: 'Đỗ Thị Hoa' } })
    fireEvent.change(within(dialog).getByLabelText('Ngày sinh'), { target: { value: '1944-03-02' } })
    fireEvent.change(within(dialog).getByLabelText('Giới tính'), { target: { value: 'FEMALE' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tạo hồ sơ' }))

    const form = await screen.findByRole('dialog')
    expect(await within(form).findByText('Lập đăng ký tiếp nhận')).toBeInTheDocument()
    expect(within(form).getByText(/Đã tạo hồ sơ NCT-2026-000020/)).toBeInTheDocument()
    expect(within(form).getByText('Chưa có bản đồng ý chia sẻ dữ liệu')).toBeInTheDocument()
    expect(within(form).getByText('Đỗ Thị Hoa')).toBeInTheDocument()
    expect(within(form).queryByLabelText('Người cao tuổi')).toBeNull()

    fireEvent.change(within(form).getByLabelText('Ngày đăng ký'), { target: { value: '2026-11-18' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Nội trú dài hạn' }))
    fireEvent.click(within(form).getByRole('button', { name: 'Thường xuyên' }))
    fireEvent.click(within(form).getByRole('button', { name: 'Lưu đăng ký' }))

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('admission-workspace', { id: 31 }))
    const body = JSON.parse(api.calls('POST', '/admission-applications')[0][1].body)
    expect(body).toMatchObject({ residentId: 20, applicationDate: '2026-11-18' })
  })

  it('lapDangKy_choNguoiCoSan_luuXongMoHoSoTiepNhan', async () => {
    api.on('POST', '/admission-applications', json(201, { ...OPEN, id: 32, residentId: 9 }))
    const onNavigate = vi.fn()
    renderPage(onNavigate)
    fireEvent.click(await screen.findByRole('button', { name: 'Lập đăng ký' }))
    const dialog = screen.getByRole('dialog')
    await within(dialog).findByRole('option', { name: 'Phạm Thị Mai (NCT-0009)' })
    fireEvent.change(within(dialog).getByLabelText('Người cao tuổi'), { target: { value: '9' } })
    fireEvent.change(within(dialog).getByLabelText('Ngày đăng ký'), { target: { value: '2026-11-06' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bán trú' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cơ bản' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu đăng ký' }))

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('admission-workspace', { id: 32 }))
  })

  it('FR_006_khongCoQuyenTao_anNutLapDangKy', async () => {
    api.on('GET', '/me/permissions', json(200, [{ function: 'ADMISSION_CONTRACT_DEPOSIT', operation: 'VIEW' }]))
    renderPage()
    await screen.findByRole('button', { name: 'Nguyễn Thị Lan' })
    expect(screen.queryByRole('button', { name: 'Lập đăng ký' })).not.toBeInTheDocument()
  })

  it('FR_006_403_hienKhongCoQuyenXem', async () => {
    api.on('GET', '/admission-applications', problem(403, 'PERMISSION_DENIED'))
    renderPage()
    expect(await screen.findByText(/Bạn không có quyền xem/)).toBeInTheDocument()
  })
})
