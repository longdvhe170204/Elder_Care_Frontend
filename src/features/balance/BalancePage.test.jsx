import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { PermissionsProvider } from '@/common/permissions/permissions'
import { json, mockRoutes } from '@/test/fetchRoutes'
import { BalancePage } from './BalancePage'

// Màn Số dư, thu chi (017 T027, T033, T036, T039): các phần của Kế toán, Quản lý viện duyệt ở màn của 000.

const ALL = [
  { function: 'BALANCE_LEDGER', operation: 'VIEW' },
  { function: 'PAYMENT_NOTICE', operation: 'VIEW' },
  { function: 'STATEMENT_REPORT', operation: 'VIEW' },
  { function: 'STATEMENT_REPORT', operation: 'CREATE' },
  { function: 'SETTLEMENT_RECORD', operation: 'VIEW' },
]
const PENDING_TX = [
  {
    id: 3,
    ledger: 'BALANCE',
    type: 'REFUND',
    amount: -500000,
    at: '2026-11-01T02:00:00Z',
    method: 'BANK_TRANSFER',
    createdBy: 'Kế toán A',
    reason: 'Xin rút',
    status: 'PENDING_APPROVAL',
    adjusted: false,
    approvalRequestId: 12,
    residentId: 7,
    residentName: 'Nguyễn Thị Ánh',
  },
]

function setup(perms = ALL, props = {}) {
  const api = mockRoutes()
  api.on('GET', '/me/permissions', json(200, perms))
  api.on('GET', '/payment-notices/pending-issue', json(200, []))
  api.on('GET', '/balance-transactions/pending-approval', json(200, PENDING_TX))
  api.on(
    'GET',
    '/residents',
    json(200, { items: [{ id: 7, profileCode: 'HS-0007', personalInfo: { fullName: 'Nguyễn Thị Ánh' } }] }),
  )
  api.on(
    'GET',
    '/residents/7/balance',
    json(200, {
      residentId: 7,
      balance: 0,
      depositBalance: 0,
      status: 'NORMAL',
      depositStatus: 'NOT_REQUIRED',
      hiddenFields: [],
    }),
  )
  api.on('GET', '/residents/7/balance-transactions', json(200, []))
  api.on('GET', '/residents/7/settlement', json(200, { conditions: [], hasException: false, versions: [] }))
  api.on('GET', '/residents/7/payment-notices', json(200, []))
  api.on(
    'GET',
    '/residents/7',
    json(200, { id: 7, profileCode: 'HS-0007', personalInfo: { fullName: 'Nguyễn Thị Ánh' } }),
  )
  render(
    <PermissionsProvider>
      <BalancePage {...props} />
    </PermissionsProvider>,
  )
  return api
}

describe('BalancePage (017)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('UC_85_cacPhanCuaManSoDu_chuyenBangNutLoc', async () => {
    setup()
    expect(await screen.findByRole('heading', { name: 'Số dư, thu chi' })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Phiếu chờ phát hành' }))
    expect(await screen.findByText('Không có bảng chờ phát hành phiếu')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Giao dịch chờ duyệt' }))
    const row = (await screen.findByText('Xin rút')).closest('tr')
    expect(within(row).getByText('Hoàn tiền')).toBeInTheDocument()
    expect(within(row).getByText('Nguyễn Thị Ánh')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Xuất sao kê, báo cáo' }))
    expect(await screen.findByRole('button', { name: 'Xuất báo cáo thu chi' })).toBeInTheDocument()
  })

  it('FR_004_timNguoiCaoTuoi_moSoDuGiaoDichQuyetToanPhieu', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Theo người cao tuổi' }))
    fireEvent.change(screen.getByLabelText('Tìm người cao tuổi'), { target: { value: 'Ánh' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tìm' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Nguyễn Thị Ánh, HS-0007' }))
    expect(await screen.findByRole('heading', { name: 'Số dư của Nguyễn Thị Ánh' })).toBeInTheDocument()
    expect(await screen.findByText('Chưa có phiếu báo phí')).toBeInTheDocument()
  })

  it('FR_005_FR_017_ghiNhanTienNop_chiKhiCoQuyenLap_tinhTrangKhiCoQuyenXem', async () => {
    const api = setup([...ALL, { function: 'BALANCE_LEDGER', operation: 'CREATE' }])
    api.on('GET', '/balance-statuses', json(200, []))
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi nhận tiền nộp' }))
    expect(await screen.findByLabelText('Mã nộp tiền')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tình trạng số dư' }))
    expect(await screen.findByText('Không có hồ sơ Sắp hết tiền, Còn nợ')).toBeInTheDocument()
  })

  // Demo 2026-11-26: Tình trạng số dư, Giao dịch chờ duyệt chỉ Kế toán, Quản lý viện xem được (backend chặn theo vai trò,
  // FR-013, FR-028); Hành chính không thấy hai nút này, vào thẳng Theo người cao tuổi
  it('FR_005_hanhChinhChiXem_khongCoGhiNhanTienNop_tinhTrang_choDuyet', async () => {
    setup([{ function: 'BALANCE_LEDGER', operation: 'VIEW' }], { role: 'OFFICE_STAFF' })
    expect(await screen.findByRole('button', { name: 'Theo người cao tuổi' })).toBeInTheDocument()
    expect(screen.getByLabelText('Tìm người cao tuổi')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ghi nhận tiền nộp' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tình trạng số dư' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Giao dịch chờ duyệt' })).not.toBeInTheDocument()
  })

  it('FR_013_keToan_vanThayTinhTrang_choDuyet', async () => {
    setup(ALL, { role: 'ACCOUNTANT' })
    expect(await screen.findByRole('button', { name: 'Tình trạng số dư' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Giao dịch chờ duyệt' })).toBeInTheDocument()
  })

  // Demo 2026-11-26: nút Xử lý ở điều kiện (h) của Kết thúc lưu trú mở thẳng số dư, quyết toán của đúng người; Hành chính
  // chỉ xem nên trước đây rơi vào "Tình trạng số dư" (chỉ Kế toán, Quản lý viện) và báo không có quyền
  it('FR_063h_moTuKetThucLuuTru_vaoThangSoDuCuaNguoiDo_hanhChinhChiXem', async () => {
    setup(
      [
        { function: 'BALANCE_LEDGER', operation: 'VIEW' },
        { function: 'SETTLEMENT_RECORD', operation: 'VIEW' },
      ],
      { residentId: 7, focus: 'resident' },
    )
    expect(await screen.findByRole('heading', { name: 'Số dư của Nguyễn Thị Ánh' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Tìm người cao tuổi')).not.toBeInTheDocument()
  })

  it('FR_028_khongCoQuyenXemSoDu_hienTrangThaiKhongCoQuyen', async () => {
    setup([{ function: 'PROFILE', operation: 'VIEW' }])
    expect(await screen.findByText('Bạn không có quyền xem số dư, thu chi')).toBeInTheDocument()
  })
})
