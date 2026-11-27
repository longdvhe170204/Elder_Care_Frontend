import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { PermissionsProvider } from '@/common/permissions/permissions'
import { AdmissionWorkspacePage } from './AdmissionWorkspacePage'

// Hồ sơ tiếp nhận (chủ dự án duyệt 2026-11-17, đề xuất A): một màn cho một lượt tiếp nhận theo BF-01; trạng thái từng
// bước lấy từ tiến trình và điều kiện của 004 (FR-003, FR-004), nút mở đúng form tại chỗ. Màn chỉ hiện trạng thái đã ghi,
// không tự làm bước thay người (Q-306, Q-307). Bố cục một cột, bộ lọc chip (chủ dự án duyệt 2026-11-26); form các bước mở
// popup (audit 2026-11-27).

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
  warnings: [],
  admissionOpinion: {
    id: 1,
    opinion: 'AGREE',
    source: { type: 'RESIDENT' },
    recordedAt: '2026-11-12T03:00:00Z',
  },
}

const RESIDENT = {
  id: 5,
  profileCode: 'NCT-2026-009003',
  status: 'ADMISSION_IN_PROGRESS',
  personalInfo: { fullName: 'Lê Thị Cúc', gender: 'FEMALE' },
  allowedCommands: ['COMPLETE_ADMISSION'],
}

const met = (codes) => ({
  ...CONDITIONS,
  conditions: CONDITIONS.conditions.map((c) => (codes.includes(c.code) ? { ...c, status: 'MET' } : c)),
})

const permissions = (...pairs) =>
  json(
    200,
    pairs.map(([fn, operation]) => ({ function: fn, operation })),
  )

beforeEach(() => {
  api = mockRoutes()
  api.on(
    'GET',
    '/me/permissions',
    permissions(['ADMISSION_CONTRACT_DEPOSIT', 'VIEW'], ['ADMISSION_CONTRACT_DEPOSIT', 'CREATE']),
  )
  api.on('GET', '/admission-applications/7', json(200, APPLICATION, { ETag: '"2"' }))
  api.on('GET', '/admission-applications/7/admission-conditions', json(200, CONDITIONS))
  api.on('GET', '/residents/5', json(200, RESIDENT))
  api.on('GET', '/residents/5/initial-health-record', problem(404, 'NOT_FOUND'))
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

const heading = () => screen.findByRole('heading', { level: 1, name: 'Tiếp nhận Lê Thị Cúc' })
const filterButton = (name) => within(screen.getByRole('group', { name: 'Lọc bước' })).getByRole('button', { name })

// Chọn bộ lọc bước rồi trả danh sách bước
async function showSteps(name = /^Tất cả/) {
  await heading()
  fireEvent.click(filterButton(name))
  return screen.getByRole('list', { name: 'Các bước tiếp nhận' })
}

const step = (steps, name) => within(steps).getByRole('listitem', { name })

describe('AdmissionWorkspacePage', () => {
  // Chủ dự án 2026-11-27: đầu màn chỉ còn "Tiếp nhận <họ tên>", bỏ hai dòng phụ
  it('dauMan_chiConTieuDe_tienDoDemBuocXong', async () => {
    renderPage()

    expect(await heading()).toBeInTheDocument()
    expect(screen.queryByText(/Lượt /)).toBeNull()
    expect(screen.queryByText(/12\/11\/2026/)).toBeNull()
    const progress = screen.getByRole('region', { name: 'Tiến độ tiếp nhận' })
    expect(within(progress).getByText('8')).toBeInTheDocument()
    expect(within(progress).getByText('trên 12 bước xong')).toBeInTheDocument()
    expect(within(progress).getByText(/Bước bắt buộc trước khi hoàn tất tiếp nhận/)).toBeInTheDocument()
  })

  it('boLoc_macDinhViecCuaBan_motNutChinh_choNguoiKhacGhiVaiTro', async () => {
    renderPage()
    await heading()

    expect(filterButton(/^Việc của bạn/)).toHaveAttribute('aria-pressed', 'true')
    const mine = screen.getByRole('list', { name: 'Các bước tiếp nhận' })
    expect(
      within(mine)
        .getAllByRole('listitem', { name: /./ })
        .map((li) => li.getAttribute('aria-label')),
    ).toEqual(['Hợp đồng'])
    expect(within(step(mine, 'Hợp đồng')).getByRole('button', { name: 'Lập hợp đồng' })).toBeInTheDocument()
    expect(within(step(mine, 'Hợp đồng')).getByLabelText('bắt buộc')).toBeInTheDocument()

    fireEvent.click(filterButton(/^Chờ người khác/))
    const waiting = screen.getByRole('list', { name: 'Các bước tiếp nhận' })
    expect(within(step(waiting, 'Đặt cọc')).getByText('Chờ Kế toán')).toBeInTheDocument()
    expect(within(waiting).queryByRole('listitem', { name: 'Hợp đồng' })).toBeNull()

    fireEvent.click(filterButton(/^Bắt buộc chưa xong/))
    const required = screen.getByRole('list', { name: 'Các bước tiếp nhận' })
    expect(within(required).getByRole('listitem', { name: 'Hợp đồng' })).toBeInTheDocument()
    expect(within(required).getByRole('listitem', { name: 'Đặt cọc' })).toBeInTheDocument()
    expect(within(required).queryByRole('listitem', { name: 'Phân bổ giường' })).toBeNull()
  })

  it('tatCa_cacBuocChiaTheoGiaiDoan_moiBuocMangTrangThaiCuaDieuKien', async () => {
    renderPage()

    const steps = await showSteps()
    expect(within(steps).getByText('Giường, hợp đồng, đặt cọc')).toBeInTheDocument()
    expect(within(step(steps, 'Phân bổ giường')).getByText('Xong')).toBeInTheDocument()
    expect(within(step(steps, 'Bản đồng ý chia sẻ dữ liệu')).getByText('Xong')).toBeInTheDocument()
    expect(within(step(steps, 'Khai báo cư trú')).getByText('Sau tiếp nhận')).toBeInTheDocument()
    // Bỏ nhóm "Hoàn tất tiếp nhận" (2026-11-18): không có dòng Hoàn tất, phiếu đối chiếu thuốc trong các bước
    expect(within(steps).queryByText('Hoàn tất tiếp nhận')).toBeNull()
    expect(within(steps).queryByText(/Phiếu đối chiếu thuốc/)).toBeNull()
  })

  // Dòng chưa đạt mang mã của module sở hữu (001, 003, 012), không phải mã cố định ADM_A, ADM_D, ADM_F của dòng đạt
  it('FR_004_dieuKienChuaDat_maCuaModuleSoHuu_buocVanBaoChuaDat', async () => {
    api.on(
      'GET',
      '/admission-applications/7/admission-conditions',
      json(200, {
        ...CONDITIONS,
        conditions: [
          {
            code: 'INITIAL_ASSESSMENT_NOT_CONFIRMED',
            name: 'Chưa có đánh giá đầu vào',
            status: 'NOT_MET',
            module: 'M01',
          },
          { code: 'ADM_B_CONTRACT', name: 'Hợp đồng Hiệu lực', status: 'MET', module: 'M02' },
          { code: 'ADM_C_DEPOSIT', name: 'Đặt cọc', status: 'MET', module: 'M11' },
          { code: 'RESERVED_BED_NOT_READY', name: 'Giường đặt trước chưa sẵn sàng', status: 'NOT_MET', module: 'M03' },
          { code: 'ADM_E_CONTRACT_LEVEL', name: 'Mức hợp đồng', status: 'MET', module: 'M02' },
          { code: 'DBR_02', name: 'Chưa có người đại diện', status: 'NOT_MET', module: 'M10' },
        ],
      }),
    )
    renderPage()

    const steps = await showSteps(/^Bắt buộc chưa xong/)
    expect(within(step(steps, 'Đánh giá đầu vào và mức chăm sóc')).getByText('Chờ Bác sĩ')).toBeInTheDocument()
    expect(within(step(steps, 'Phân bổ giường')).getByText('Chờ Hành chính, Trưởng tầng')).toBeInTheDocument()
    expect(
      within(step(steps, 'Người thân: liên hệ chính, người đại diện')).getByText('Chờ Hành chính'),
    ).toBeInTheDocument()
    expect(within(steps).queryByRole('listitem', { name: 'Hợp đồng' })).toBeNull()
  })

  // Form các bước mở popup tại chỗ; đóng là về thẳng màn này (chủ dự án yêu cầu 2026-11-18)
  it.each([
    ['Ghi bản đồng ý', 'Bản đồng ý của Lê Thị Cúc'],
    ['Ghi sức khỏe ban đầu', 'Sức khỏe ban đầu của Lê Thị Cúc'],
    ['Ghi nguyện vọng', 'Nguyện vọng của Lê Thị Cúc'],
    ['Đánh giá đầu vào', 'Đánh giá: Lê Thị Cúc'],
  ])('buoc_%s_moPopupTaiCho_dongThiVeManTiepNhan', async (button, title) => {
    api.on(
      'GET',
      '/residents/5',
      json(200, {
        ...RESIDENT,
        allowedCommands: [
          'COMPLETE_ADMISSION',
          'RECORD_CONSENT',
          'WRITE_INITIAL_HEALTH_RECORD',
          'DRAFT_END_OF_LIFE_WISH',
          'CREATE_ASSESSMENT',
        ],
      }),
    )
    api.on(
      'GET',
      '/admission-applications/7/admission-conditions',
      json(200, {
        ...CONDITIONS,
        conditions: CONDITIONS.conditions.map((c) => (c.code === 'ADM_A_ASSESSMENT' ? { ...c, status: 'NOT_MET' } : c)),
        warnings: [
          { code: 'MISSING_CONSENT', description: 'Chưa có bản đồng ý' },
          { code: 'UNCONFIRMED_HEALTH_RECORD', description: 'Chưa xác nhận hồ sơ sức khỏe ban đầu' },
          { code: 'MISSING_END_OF_LIFE_WISH', description: 'Chưa có nguyện vọng cuối đời' },
        ],
      }),
    )
    renderPage()
    await heading()

    fireEvent.click(await screen.findByRole('button', { name: button }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByRole('heading', { name: title })).toBeInTheDocument()
    expect(within(dialog).queryByText('Các phần của hồ sơ')).toBeNull()
    fireEvent.keyDown(dialog, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('heading', { level: 1, name: 'Tiếp nhận Lê Thị Cúc' })).toBeInTheDocument()
  })

  // Đủ bước bắt buộc thì chân màn có nút Hoàn tất tiếp nhận, mở popup tại chỗ xem trước điều kiện (audit 2026-11-27)
  it('duBuocBatBuoc_hoanTatTiepNhanMoPopup_xemTruocDieuKien', async () => {
    api.on('GET', '/admission-applications/7/admission-conditions', json(200, met(['ADM_B_CONTRACT', 'ADM_C_DEPOSIT'])))
    api.on('GET', '/residents/5/conditions/COMPLETE_ADMISSION', json(200, []))
    renderPage()

    const footer = await screen.findByRole('region', { name: 'Hoàn tất tiếp nhận' })
    fireEvent.click(within(footer).getByRole('button', { name: 'Hoàn tất tiếp nhận' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Hoàn tất tiếp nhận' })).toBeInTheDocument()
    await waitFor(() => expect(api.calls('GET', '/residents/5/conditions/COMPLETE_ADMISSION')).toHaveLength(1))
  })

  it('conBuocBatBuoc_khongCoNutHoanTat', async () => {
    renderPage()
    await heading()
    expect(screen.queryByRole('region', { name: 'Hoàn tất tiếp nhận' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Hoàn tất tiếp nhận' })).toBeNull()
  })

  it('004_T114_capNhatDangKy_moFormNgayTrenMan', async () => {
    api.on(
      'GET',
      '/me/permissions',
      permissions(['ADMISSION_CONTRACT_DEPOSIT', 'VIEW'], ['ADMISSION_CONTRACT_DEPOSIT', 'UPDATE']),
    )
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Cập nhật đăng ký' }))
    expect(await screen.findByRole('heading', { name: 'Cập nhật đăng ký tiếp nhận' })).toBeInTheDocument()
  })

  it('FR_004a_ghiYKien_guiNguonVaYKien', async () => {
    api.on(
      'GET',
      '/admission-applications/7/admission-conditions',
      json(200, { ...CONDITIONS, admissionOpinion: null }),
    )
    api.on('POST', '/admission-applications/7/admission-opinion', json(201, { id: 2, opinion: 'AGREE' }))
    renderPage()
    await heading()

    fireEvent.click(await screen.findByRole('button', { name: 'Ghi ý kiến' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Ý kiến của Lê Thị Cúc về việc vào ở' })).toBeInTheDocument()
    fireEvent.click(
      within(within(dialog).getByRole('group', { name: 'Nguồn' })).getByRole('button', { name: 'Người cao tuổi' }),
    )
    fireEvent.click(
      within(within(dialog).getByRole('group', { name: 'Ý kiến' })).getByRole('button', { name: 'Đồng ý' }),
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu ý kiến' }))

    await waitFor(() => expect(api.calls('POST', '/admission-applications/7/admission-opinion')).toHaveLength(1))
    const body = JSON.parse(api.calls('POST', '/admission-applications/7/admission-opinion')[0][1].body)
    expect(body).toEqual({ opinion: 'AGREE', source: { type: 'RESIDENT' } })
  })

  it('nguoiThanChuaXong_ghiNguoiThanMoManSoHuuChonSanNguoiCaoTuoi', async () => {
    api.on(
      'GET',
      '/me/permissions',
      permissions(['ADMISSION_CONTRACT_DEPOSIT', 'VIEW'], ['FAMILY_MEMBER_PERMISSION', 'CREATE']),
    )
    api.on(
      'GET',
      '/admission-applications/7/admission-conditions',
      json(200, {
        ...CONDITIONS,
        conditions: CONDITIONS.conditions.map((c) => (c.code === 'ADM_F_CONTACTS' ? { ...c, status: 'NOT_MET' } : c)),
      }),
    )
    const onNavigate = renderPage()
    await heading()

    fireEvent.click(await screen.findByRole('button', { name: 'Ghi người thân' }))
    expect(onNavigate).toHaveBeenCalledWith('family-members', { residentId: 5, openAdd: true })
  })

  it('F10_F11_luotDaDong_ghiTrangThaiLuot_yKienTuLuotDangKy_dieuKienKhongConKiem', async () => {
    api.on(
      'GET',
      '/me/permissions',
      permissions(['ADMISSION_CONTRACT_DEPOSIT', 'VIEW'], ['ADMISSION_CONTRACT_DEPOSIT', 'UPDATE']),
    )
    api.on(
      'GET',
      '/admission-applications/7',
      json(
        200,
        { ...APPLICATION, status: 'ADMITTED', admissionOpinion: [CONDITIONS.admissionOpinion] },
        { ETag: '"3"' },
      ),
    )
    renderPage()

    expect(await heading()).toBeInTheDocument()
    expect(screen.getByText('Lượt đã tiếp nhận')).toBeInTheDocument()
    expect(filterButton(/^Tất cả/)).toHaveAttribute('aria-pressed', 'true')
    const steps = screen.getByRole('list', { name: 'Các bước tiếp nhận' })
    expect(within(step(steps, 'Ý kiến của người cao tuổi về việc vào ở')).getByText('Xong')).toBeInTheDocument()
    expect(within(step(steps, 'Hợp đồng')).getByText('Không còn kiểm')).toBeInTheDocument()
    // Ý kiến chỉ ghi được khi lượt đang mở (api-004 admission-opinion); lượt đóng không cập nhật đăng ký
    expect(screen.queryByRole('button', { name: 'Ghi ý kiến' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cập nhật đăng ký' })).toBeNull()
    expect(api.calls('GET', '/admission-applications/7/admission-conditions')).toHaveLength(0)
  })

  // Bước Phân bổ giường chỉ có nút khi điều kiện Chưa đạt; đã có giường thì ghi giường; bỏ link Danh sách chờ ở dòng bước
  it('buocGiuong_daDat_khongCoNut_ghiGiuongDaPhanBo', async () => {
    api.on('GET', '/me/permissions', permissions(['ADMISSION_CONTRACT_DEPOSIT', 'VIEW'], ['BED_ALLOCATION', 'CREATE']))
    api.on(
      'GET',
      '/bed-allocations',
      json(200, [
        {
          id: 4,
          status: 'FUTURE',
          plannedStartAt: '2026-11-20T01:00:00Z',
          location: { roomId: 1, area: 'Khu A', floor: 'Tầng 2', room: 'Phòng 201', bed: 'G2', label: 'P201 – G2' },
        },
      ]),
    )
    api.on('GET', '/rooms', json(200, [{ id: 1, roomTypeId: 1 }]))
    api.on('GET', '/room-types', json(200, [{ id: 1, name: 'Phòng đôi' }]))
    renderPage()

    const bed = step(await showSteps(), 'Phân bổ giường')
    expect(within(bed).queryByRole('button', { name: 'Chọn giường' })).toBeNull()
    expect(await within(bed).findByText('Phòng 201, G2 · Khu A – Tầng 2 (Phòng đôi)')).toBeInTheDocument()
  })

  it('buocGiuong_chuaDat_chonGiuongMoPopupPhanBo_khongCoLinkDanhSachCho', async () => {
    api.on('GET', '/me/permissions', permissions(['ADMISSION_CONTRACT_DEPOSIT', 'VIEW'], ['BED_ALLOCATION', 'CREATE']))
    api.on(
      'GET',
      '/admission-applications/7/admission-conditions',
      json(200, {
        ...CONDITIONS,
        conditions: CONDITIONS.conditions.map((c) =>
          c.code === 'ADM_D_BED'
            ? { code: 'RESERVED_BED_NOT_READY', name: 'Chưa phân bổ giường', status: 'NOT_MET', module: 'M03' }
            : c,
        ),
      }),
    )
    renderPage()

    const bed = step(await showSteps(), 'Phân bổ giường')
    expect(within(bed).queryByRole('button', { name: 'Mở Danh sách chờ' })).toBeNull()
    expect(screen.queryByText(/Chưa có giường phù hợp: mở Danh sách chờ/)).toBeNull()
    fireEvent.click(within(bed).getByRole('button', { name: 'Chọn giường' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Phân bổ giường' })).toBeInTheDocument()
  })

  // Đặt cọc (audit 2026-11-27): dòng "Cần … · đã thu …"; hợp đồng chưa Chờ ký thì chờ gửi ký; Chờ ký thì ghi thu trong popup
  it('datCoc_hopDongNhap_choGuiKy_ghiCanVaDaThu', async () => {
    api.on('GET', '/me/permissions', permissions(['ADMISSION_CONTRACT_DEPOSIT', 'VIEW'], ['BALANCE_LEDGER', 'CREATE']))
    api.on('GET', '/contracts', json(200, [{ id: 3, residentId: 5, status: 'DRAFT', depositAmount: 5_000_000 }]))
    api.on('GET', '/residents/5/balance', problem(404, 'NOT_FOUND'))
    renderPage()
    await heading()

    const deposit = step(screen.getByRole('list', { name: 'Các bước tiếp nhận' }), 'Đặt cọc')
    expect(await within(deposit).findByText('Cần 5.000.000 đ · đã thu 0 đ')).toBeInTheDocument()
    expect(within(deposit).getByText('Chờ gửi ký hợp đồng')).toBeInTheDocument()
    expect(within(deposit).queryByRole('button', { name: 'Ghi thu tiền cọc' })).toBeNull()
  })

  it('datCoc_hopDongChoKy_ghiThuMoPopup', async () => {
    api.on('GET', '/me/permissions', permissions(['ADMISSION_CONTRACT_DEPOSIT', 'VIEW'], ['BALANCE_LEDGER', 'CREATE']))
    api.on(
      'GET',
      '/contracts',
      json(200, [{ id: 3, residentId: 5, status: 'PENDING_SIGNATURE', depositAmount: 5_000_000 }]),
    )
    api.on('GET', '/contracts/3/deposit', json(200, { status: 'NOT_SATISFIED' }))
    renderPage()
    await heading()

    fireEvent.click(await screen.findByRole('button', { name: 'Ghi thu tiền cọc' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Ghi thu tiền cọc' })).toBeInTheDocument()
  })

  // Hợp đồng còn Chờ ký mà đã thu đủ cọc (GET /contracts/{id}/deposit SATISFIED) thì bước Đặt cọc ghi Xong
  it('datCoc_daDapUng_buocXong', async () => {
    api.on(
      'GET',
      '/contracts',
      json(200, [{ id: 3, residentId: 5, status: 'PENDING_SIGNATURE', depositAmount: 5_000_000 }]),
    )
    api.on('GET', '/contracts/3/deposit', json(200, { status: 'SATISFIED' }))
    renderPage()

    const steps = await showSteps()
    await waitFor(() => expect(within(step(steps, 'Đặt cọc')).getByText('Xong')).toBeInTheDocument())
  })

  // Sửa hợp đồng nháp ngay trên màn, không chuyển sang màn Hợp đồng; chi tiết hợp đồng mở popup
  it('suaHopDong_moChiTietRoiFormTrenMan', async () => {
    api.on(
      'GET',
      '/contracts',
      json(200, [
        {
          id: 3,
          contractNumber: 'HD-003',
          residentId: 5,
          status: 'DRAFT',
          residenceType: 'LONG_TERM_RESIDENTIAL',
          startDate: '2026-11-20',
          careLevel: 'REGULAR',
          allowedCommands: ['update'],
        },
      ]),
    )
    api.on('GET', '/contracts/3', json(200, { id: 3, residentId: 5, status: 'DRAFT' }, { ETag: '"1"' }))
    api.on('GET', '/contracts/3/deposit', json(200, { status: 'NOT_SATISFIED' }))
    api.on('GET', '/contracts/3/addenda', json(200, []))
    api.on('GET', '/contracts/3/non-standard-terms', json(200, []))
    api.on('GET', '/services', json(200, []))
    api.on(
      'GET',
      '/me/permissions',
      permissions(['ADMISSION_CONTRACT_DEPOSIT', 'VIEW'], ['ADMISSION_CONTRACT_DEPOSIT', 'UPDATE']),
    )
    const onNavigate = renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Mở hợp đồng' }))
    expect(await screen.findByRole('heading', { name: /Hợp đồng HD-003/ })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa nội dung' }))
    expect(await screen.findByRole('heading', { name: 'Sửa hợp đồng nháp' })).toBeInTheDocument()
    expect(onNavigate).not.toHaveBeenCalledWith('contracts')
  })

  // BR-M02-22: mức của hợp đồng khác mức đánh giá đầu vào thì ghi rõ ở bước Hợp đồng và việc cần làm
  it('mucHopDongLechDanhGia_ghiRoOBuocHopDong', async () => {
    api.on('GET', '/residents/5', json(200, { ...RESIDENT, currentCareLevel: 'REGULAR' }))
    api.on('GET', '/contracts', json(200, [{ id: 3, residentId: 5, status: 'DRAFT', careLevel: 'BASIC' }]))
    renderPage()

    const contract = step(await showSteps(), 'Hợp đồng')
    expect(
      within(contract).getByText(
        'Hợp đồng ghi cơ bản, đánh giá đầu vào là thường xuyên: sửa mức chăm sóc của hợp đồng',
      ),
    ).toBeInTheDocument()
  })

  // Phương án C "liền sau hợp đồng" (chủ dự án chọn 2026-11-21): lưu hợp đồng nháp nội trú xong mở ngay khung chọn giường,
  // ngày vào lấy từ hợp đồng (chủ dự án xác nhận không vi phạm Q-307), bỏ qua được bằng "Để sau"
  it('C_luuHopDongNoiTru_moNgayChonGiuong_ngayVaoTuHopDong', async () => {
    Element.prototype.scrollIntoView = vi.fn()
    api.on(
      'GET',
      '/me/permissions',
      permissions(['ADMISSION_CONTRACT_DEPOSIT', 'CREATE'], ['BED_ALLOCATION', 'CREATE']),
    )
    api.on(
      'GET',
      '/admission-applications/7/admission-conditions',
      json(200, {
        ...CONDITIONS,
        conditions: CONDITIONS.conditions.map((c) =>
          c.code === 'ADM_D_BED'
            ? { code: 'RESERVED_BED_NOT_READY', name: 'Chưa phân bổ giường', status: 'NOT_MET', module: 'M03' }
            : c,
        ),
      }),
    )
    api.on('GET', '/services', json(200, []))
    api.on('GET', '/room-types', json(200, [{ id: 1, name: 'Phòng đôi', servesLongTerm: true, status: 'ACTIVE' }]))
    api.on('GET', '/bed-allocations', json(200, []))
    api.on('GET', '/rooms', json(200, []))
    api.on('GET', '/bed-allocations/suitable-beds', json(200, []))
    api.on(
      'POST',
      '/contracts',
      json(201, {
        contract: {
          id: 9,
          residentId: 5,
          residenceType: 'LONG_TERM_RESIDENTIAL',
          startDate: '2026-11-25',
          roomTypeId: 1,
        },
      }),
    )
    renderPage()
    await heading()

    fireEvent.click(await screen.findByRole('button', { name: 'Lập hợp đồng' }))
    const dialog = await screen.findByRole('dialog')
    // Điền sẵn từ lượt đăng ký: loại lưu trú, ngày muốn vào, mức dự kiến
    expect(within(dialog).getByRole('button', { name: 'Nội trú dài hạn' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(within(dialog).getByLabelText(/^Ngày bắt đầu/), { target: { value: '25/11/2026' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Theo tháng' }))
    fireEvent.click(
      await within(within(dialog).getByRole('group', { name: 'Loại phòng' })).findByRole('button', {
        name: 'Phòng đôi',
      }),
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Không yêu cầu đặt cọc' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu hợp đồng nháp' }))

    expect(await screen.findByRole('heading', { name: 'Chọn giường cho hợp đồng vừa lập' })).toBeInTheDocument()
    expect(await screen.findByLabelText(/^Ngày vào dự kiến/)).toHaveValue('25/11/2026')
    expect(screen.getByRole('button', { name: 'Để sau' })).toBeInTheDocument()
  })

  // Không tải được hợp đồng thì báo, không hiện nút Lập hợp đồng như khi chưa có hợp đồng
  it('taiHopDongLoi_khongHienLapHopDong', async () => {
    api.on('GET', '/contracts', problem(500, 'INTERNAL'))
    renderPage()

    const contract = step(await showSteps(), 'Hợp đồng')
    expect(within(contract).queryByRole('button', { name: 'Lập hợp đồng' })).toBeNull()
    expect(within(contract).getByText('Không tải được hợp đồng')).toBeInTheDocument()
  })

  // Chú thích 26 Phụ lục 27: quyền ghi của dòng "Tiếp nhận, hợp đồng, đặt cọc" chỉ hiệu lực với Hành chính (AC-09); Kế toán
  // (AC-14) có quyền ở /me/permissions nhưng không lập hợp đồng
  it.each([
    [['AC-09'], true],
    [['AC-14'], false],
  ])('chuThich26_vaiTro_%s_lapHopDong_%s', async (roles, canCreate) => {
    api.on(
      'GET',
      '/me/permissions',
      json(200, [
        { function: 'ADMISSION_CONTRACT_DEPOSIT', operation: 'VIEW' },
        { function: 'ADMISSION_CONTRACT_DEPOSIT', operation: 'CREATE', footnoteCodes: [26] },
      ]),
    )
    api.on('GET', '/me', json(200, { roles }))
    renderPage()

    const contract = step(await showSteps(), 'Hợp đồng')
    await waitFor(() => expect(api.calls('GET', '/me')).toHaveLength(1))
    if (canCreate) expect(await within(contract).findByRole('button', { name: 'Lập hợp đồng' })).toBeInTheDocument()
    else await waitFor(() => expect(within(contract).getByText('Chờ Hành chính')).toBeInTheDocument())
  })
})
