import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { json, mockRoutes } from '@/test/fetchRoutes'
import { PermissionsProvider } from '@/common/permissions/permissions'
import { AdmissionWorkspacePage } from './AdmissionWorkspacePage'

// Hồ sơ tiếp nhận (chủ dự án duyệt 2026-11-17, đề xuất A): một màn cho một lượt tiếp nhận theo BF-01; trạng thái từng
// bước lấy từ tiến trình và điều kiện của 004 (FR-003, FR-004), nút mở đúng form hoặc màn đang có. Màn chỉ hiện trạng
// thái đã ghi, không tự làm bước thay người (Q-306, Q-307). 004 T114 (chủ dự án yêu cầu 2026-11-17): mỗi bước mở đúng
// phần của hồ sơ; cập nhật đăng ký, ghi ý kiến về việc vào ở làm ngay ở màn này (khung chi tiết ở danh sách đã bỏ).

let api

const APPLICATION = {
  id: 7,
  residentId: 5,
  applicationDate: '2026-11-12',
  desiredResidenceType: 'LONG_TERM_RESIDENTIAL',
  expectedCareLevel: 'REGULAR',
  desiredAdmissionDate: '2026-11-20',
  status: 'IN_PROGRESS',
  admissionOpinion: [],
}

const CONDITIONS = {
  conditions: [
    { code: 'ADM_A_ASSESSMENT', name: 'Đánh giá đầu vào còn hạn', status: 'MET' },
    { code: 'ADM_B_CONTRACT', name: 'Hợp đồng Hiệu lực', status: 'NOT_MET' },
    { code: 'ADM_C_DEPOSIT', name: 'Đặt cọc', status: 'NOT_MET' },
    { code: 'ADM_D_BED', name: 'Giường đã về Trống', status: 'MET' },
    { code: 'ADM_E_CONTRACT_LEVEL', name: 'Mức hợp đồng trùng mức đánh giá', status: 'MET' },
    { code: 'ADM_F_CONTACTS', name: 'Liên hệ chính, người đại diện', status: 'MET' },
  ],
  warnings: [{ code: 'ADMISSION_OPINION_MISSING', description: 'Chưa ghi ý kiến của người cao tuổi về việc vào ở' }],
  admissionOpinion: {
    id: 1,
    opinion: 'AGREE',
    source: { type: 'RESIDENT' },
    recordedAt: '2026-11-12T03:00:00Z',
  },
}

beforeEach(() => {
  api = mockRoutes()
  api.on(
    'GET',
    '/me/permissions',
    json(200, [
      { function: 'ADMISSION_CONTRACT_DEPOSIT', operation: 'VIEW' },
      { function: 'ADMISSION_CONTRACT_DEPOSIT', operation: 'CREATE' },
    ]),
  )
  api.on('GET', '/admission-applications/7', json(200, APPLICATION, { ETag: '"2"' }))
  api.on('GET', '/admission-applications/7/admission-conditions', json(200, CONDITIONS))
  api.on(
    'GET',
    '/residents/5',
    json(200, {
      id: 5,
      profileCode: 'NCT-2026-009003',
      status: 'ADMISSION_IN_PROGRESS',
      personalInfo: { fullName: 'Lê Thị Cúc' },
      allowedCommands: ['COMPLETE_ADMISSION'],
    }),
  )
  api.on('GET', '/contracts', json(200, []))
})

function renderPage(onNavigate = vi.fn()) {
  render(
    <PermissionsProvider>
      <AdmissionWorkspacePage id={7} onNavigate={onNavigate} />
    </PermissionsProvider>,
  )
  return onNavigate
}

describe('AdmissionWorkspacePage', () => {
  it('đầu màn có họ tên, không có thanh tiến độ', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'Tiếp nhận Lê Thị Cúc' })).toBeTruthy()
    // Chủ dự án yêu cầu 2026-11-18: bỏ thanh "x / 8 bước đã xong" ở đầu màn
    expect(screen.queryByText(/bước đã xong/)).toBeNull()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('các bước chia theo giai đoạn, mỗi bước mang trạng thái của điều kiện tương ứng', async () => {
    renderPage()

    const steps = await screen.findByRole('list', { name: 'Các bước tiếp nhận' })
    expect(within(steps).getByText('Giường, hợp đồng, đặt cọc')).toBeTruthy()
    const contract = within(steps).getByRole('listitem', { name: /Hợp đồng/ })
    expect(within(contract).getByText('Chưa đạt')).toBeTruthy()
    const bed = within(steps).getByRole('listitem', { name: /Phân bổ giường/ })
    expect(within(bed).getByText('Đạt')).toBeTruthy()
  })

  // Dòng chưa đạt mang mã của module sở hữu (001, 003, 012), không phải mã cố định ADM_A, ADM_D, ADM_F của dòng đạt
  it('FR_004_dieuKienChuaDat_maCuaModuleSoHuu_buocVanBaoChuaDat', async () => {
    api.on(
      'GET',
      '/admission-applications/7/admission-conditions',
      json(200, {
        ...CONDITIONS,
        conditions: [
          { code: 'INITIAL_ASSESSMENT_NOT_CONFIRMED', name: 'Chưa có đánh giá đầu vào', status: 'NOT_MET', module: 'M01' },
          { code: 'ADM_B_CONTRACT', name: 'Hợp đồng Hiệu lực', status: 'MET', module: 'M02' },
          { code: 'ADM_C_DEPOSIT', name: 'Đặt cọc', status: 'MET', module: 'M11' },
          { code: 'RESERVED_BED_NOT_READY', name: 'Giường đặt trước chưa sẵn sàng', status: 'NOT_MET', module: 'M03' },
          { code: 'ADM_E_CONTRACT_LEVEL', name: 'Mức hợp đồng', status: 'MET', module: 'M02' },
          { code: 'DBR_02', name: 'Chưa có người đại diện', status: 'NOT_MET', module: 'M10' },
        ],
      }),
    )
    renderPage()

    const steps = await screen.findByRole('list', { name: 'Các bước tiếp nhận' })
    for (const name of [/Đánh giá đầu vào/, /Phân bổ giường/, /Người thân/]) {
      const step = within(steps).getByRole('listitem', { name })
      expect(within(step).getByText('Chưa đạt')).toBeTruthy()
      expect(within(step).queryByText('Chưa có dữ liệu')).toBeNull()
    }
  })

  it('cột điều kiện Hoàn tất đếm điều kiện chưa đạt và hiện ý kiến về việc vào ở', async () => {
    renderPage()

    const panel = await screen.findByRole('region', { name: 'Điều kiện Hoàn tất tiếp nhận' })
    expect(within(panel).getByText('Còn 2 điều kiện chưa đạt')).toBeTruthy()
    expect(within(panel).getByText(/Đồng ý/)).toBeTruthy()
    expect(within(panel).getByRole('button', { name: 'Hoàn tất tiếp nhận' })).toBeTruthy()
    expect(within(panel).getByText('Chưa ghi ý kiến của người cao tuổi về việc vào ở')).toBeTruthy()
  })

  it.each([
    ['Mở Đồng ý', 'Đồng ý: Lê Thị Cúc'],
    ['Mở Sức khỏe', 'Sức khỏe: Lê Thị Cúc'],
    ['Mở Nguyện vọng', 'Nguyện vọng: Lê Thị Cúc'],
    ['Mở Đánh giá', 'Đánh giá: Lê Thị Cúc'],
    ['Hoàn tất tiếp nhận', 'Trạng thái: Lê Thị Cúc'],
  ])('004_T114_buoc_%s_moDungPhanCuaHoSo', async (button, heading) => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: button }))
    expect(await screen.findByRole('heading', { name: heading })).toBeTruthy()
  })

  // Chủ dự án yêu cầu 2026-11-18: thao tác một phần (Đồng ý, Sức khỏe, Nguyện vọng, Đánh giá, Trạng thái) xong đóng lại là
  // về thẳng màn Hồ sơ tiếp nhận, không hiện màn hồ sơ người cao tuổi ở giữa
  it.each(['Mở Đồng ý', 'Mở Sức khỏe', 'Mở Nguyện vọng', 'Mở Đánh giá', 'Hoàn tất tiếp nhận'])(
    'buoc_%s_dongPhan_veThangHoSoTiepNhan',
    async (button) => {
      renderPage()

      fireEvent.click(await screen.findByRole('button', { name: button }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).queryByText('Các phần của hồ sơ')).toBeNull()
      fireEvent.keyDown(dialog, { key: 'Escape' })

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(screen.queryByText('Các phần của hồ sơ')).toBeNull()
      expect(screen.getByRole('list', { name: 'Các bước tiếp nhận' })).toBeTruthy()
    },
  )

  // Chủ dự án yêu cầu 2026-11-18: bỏ nhóm "Hoàn tất tiếp nhận" (phiếu đối chiếu thuốc, dòng Hoàn tất) vì trùng cột điều kiện
  it('khongCoNhomHoanTatTiepNhan_trongCacBuoc', async () => {
    renderPage()

    const steps = await screen.findByRole('list', { name: 'Các bước tiếp nhận' })
    expect(within(steps).queryByText('Hoàn tất tiếp nhận')).toBeNull()
    expect(within(steps).queryByText(/Phiếu đối chiếu thuốc/)).toBeNull()
    expect(within(steps).queryByRole('button', { name: 'Mở Trạng thái' })).toBeNull()
  })

  // Chủ dự án yêu cầu 2026-11-18: các bước chỉ ghi việc, không ghi vai trò người làm
  it('cacBuoc_khongGhiVaiTroNguoiLam', async () => {
    renderPage()

    const steps = await screen.findByRole('list', { name: 'Các bước tiếp nhận' })
    for (const who of ['Hành chính', 'Kế toán', 'Bác sĩ', 'Bác sĩ, Điều dưỡng']) {
      expect(within(steps).queryByText(who)).toBeNull()
    }
  })

  it('004_T114_capNhatDangKy_moFormNgayTrenMan', async () => {
    api.on(
      'GET',
      '/me/permissions',
      json(200, [
        { function: 'ADMISSION_CONTRACT_DEPOSIT', operation: 'VIEW' },
        { function: 'ADMISSION_CONTRACT_DEPOSIT', operation: 'UPDATE' },
      ]),
    )
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Cập nhật đăng ký' }))
    expect(await screen.findByRole('heading', { name: 'Cập nhật đăng ký tiếp nhận' })).toBeTruthy()
  })

  it('FR_004a_ghiYKien_guiNguonVaYKien', async () => {
    api.on(
      'GET',
      '/me/permissions',
      json(200, [
        { function: 'ADMISSION_CONTRACT_DEPOSIT', operation: 'VIEW' },
        { function: 'ADMISSION_CONTRACT_DEPOSIT', operation: 'UPDATE' },
      ]),
    )
    api.on('POST', '/admission-applications/7/admission-opinion', json(201, { id: 2, opinion: 'AGREE' }))
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Ghi ý kiến' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Người cao tuổi' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Đồng ý' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu ý kiến' }))

    await waitFor(() => expect(api.calls('POST', '/admission-applications/7/admission-opinion')).toHaveLength(1))
    const body = JSON.parse(api.calls('POST', '/admission-applications/7/admission-opinion')[0][1].body)
    expect(body).toEqual({ opinion: 'AGREE', source: { type: 'RESIDENT' } })
  })

  it('chưa có hợp đồng thì nút Lập hợp đồng; người thân và đặt cọc mở màn sở hữu', async () => {
    const onNavigate = renderPage()

    expect(await screen.findByRole('button', { name: 'Lập hợp đồng' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Mở Người thân và quyền' }))
    expect(onNavigate).toHaveBeenCalledWith('family-members')
    fireEvent.click(screen.getByRole('button', { name: 'Mở Số dư, thu chi' }))
    expect(onNavigate).toHaveBeenCalledWith('balance')
  })

  it('lượt đã đóng (Đã vào): không hỏi điều kiện (backend trả 409), màn vẫn mở và ghi lượt đã đóng', async () => {
    api.on('GET', '/admission-applications/7', json(200, { ...APPLICATION, status: 'ADMITTED' }, { ETag: '"3"' }))
    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'Tiếp nhận Lê Thị Cúc' })).toBeTruthy()
    expect(screen.getByText('Lượt đăng ký đã đóng (Đã vào), không còn danh sách điều kiện.')).toBeTruthy()
    expect(api.calls('GET', '/admission-applications/7/admission-conditions')).toHaveLength(0)
    expect(screen.queryByText(/điều kiện chưa đạt/)).toBeNull()
  })

  it('quay lại danh sách đăng ký tiếp nhận', async () => {
    const onNavigate = renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Danh sách đăng ký' }))
    expect(onNavigate).toHaveBeenCalledWith('admission-applications')
  })
})
