import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { PermissionsProvider } from '@/common/permissions/permissions'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { ResidentBalance } from './ResidentBalance'

// Giao dịch của một người cao tuổi: hoàn tiền, điều chỉnh, cấn trừ cọc (017 T027; FR-010 → FR-015, BR-M11-10, 14;
// quickstart Q11 → Q15).

const BALANCE = {
  residentId: 7,
  paymentCode: 'NCT7K2M9X4A',
  balance: -1250000,
  depositBalance: 3000000,
  debt: 1250000,
  status: 'IN_DEBT',
  daysCovered: null,
  unfinalizedTotal: 400000,
  depositStatus: 'SATISFIED',
  remindersStopped: false,
  // Người đại diện hiệu lực hiện tại (api-017 BalanceRepresentative, chủ dự án duyệt 2026-11-22)
  representative: { familyMemberId: 55, fullName: 'Trần Thị Đại Diện' },
  hiddenFields: [],
}
const NO_REPRESENTATIVE = { ...BALANCE, representative: null }
const POSITIVE = { ...BALANCE, balance: 2000000, debt: null, status: 'NORMAL', unfinalizedTotal: 0 }
const TRANSACTIONS = [
  {
    id: 1,
    ledger: 'BALANCE',
    type: 'CASH_PAYMENT',
    amount: 2000000,
    at: '2026-10-05T01:30:00Z',
    method: 'CASH',
    createdBy: 'Kế toán A',
    status: 'CONFIRMED',
    adjusted: false,
  },
  {
    id: 2,
    ledger: 'BALANCE',
    type: 'STATEMENT_PAYMENT',
    amount: -3250000,
    at: '2026-10-31T15:00:00Z',
    method: 'INTERNAL',
    createdBy: 'Hệ thống',
    status: 'CONFIRMED',
    adjusted: false,
  },
  {
    id: 3,
    ledger: 'BALANCE',
    type: 'REFUND',
    amount: -500000,
    at: '2026-11-01T02:00:00Z',
    method: 'BANK_TRANSFER',
    createdBy: 'Kế toán A',
    status: 'PENDING_APPROVAL',
    adjusted: false,
  },
]
const ACCOUNTANT = [
  { function: 'BALANCE_LEDGER', operation: 'VIEW' },
  { function: 'BALANCE_LEDGER', operation: 'CREATE' },
]

function setup({ perms = ACCOUNTANT, balance = BALANCE } = {}) {
  const api = mockRoutes()
  api.on('GET', '/me/permissions', json(200, perms))
  api.on('GET', '/residents/7/balance', json(200, balance))
  api.on('GET', '/residents/7/balance-transactions', json(200, TRANSACTIONS))
  api.on('GET', '/residents/7/settlement', json(200, { conditions: [], hasException: false, versions: [] }))
  api.on('GET', '/residents/7/payment-notices', json(200, []))
  render(
    <PermissionsProvider>
      <ResidentBalance residentId={7} fullName="Nguyễn Thị Ánh" />
    </PermissionsProvider>,
  )
  return api
}

const fill = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('ResidentBalance (017)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // Q-460: biên nhận chỉ có ở khoản nộp đã xác nhận, người xem đủ sổ
  it('Q_460_taiBienNhan_chiKhoanNopDaXacNhan', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    const api = setup()
    api.on('GET', '/balance-transactions/1/receipt', json(200, {}))
    const buttons = await screen.findAllByRole('button', { name: 'Tải biên nhận' })
    expect(buttons).toHaveLength(1)

    fireEvent.click(buttons[0])

    await waitFor(() => expect(api.calls('GET', '/balance-transactions/1/receipt')).toHaveLength(1))
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())
  })

  // Q-460 mở rộng: khoản hoàn đã xác nhận có biên nhận; tick nhiều khoản đã xác nhận để in một bảng kê
  it('Q_460_chonKhoan_inBangKe', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    const api = setup()
    api.on('GET', '/residents/7/balance-transactions/summary', json(200, {}))
    const print = await screen.findByRole('button', { name: 'In bảng kê (0)' })
    expect(print).toBeDisabled()
    const boxes = screen.getAllByRole('checkbox', { name: /Chọn giao dịch/ })
    // khoản hoàn còn Chờ duyệt không chọn được
    expect(boxes).toHaveLength(2)

    fireEvent.click(boxes[0])
    fireEvent.click(boxes[1])
    fireEvent.click(screen.getByRole('button', { name: 'In bảng kê (2)' }))

    await waitFor(() => expect(api.calls('GET', '/residents/7/balance-transactions/summary')).toHaveLength(1))
    expect(String(api.calls('GET', '/residents/7/balance-transactions/summary')[0][0])).toContain('id=1&id=2')
  })

  it('Q_460_hanhChinh_khongCoNutBienNhan', async () => {
    setup({ balance: { ...BALANCE, hiddenFields: ['paymentCode'] } })
    await screen.findAllByText('Nộp tiền mặt')
    expect(screen.queryByRole('button', { name: 'Tải biên nhận' })).not.toBeInTheDocument()
  })

  it('FR_002_hienSoDuCocNoMaNopTienVaTinhTrang', async () => {
    setup()
    expect(await screen.findByText('NCT7K2M9X4A')).toBeInTheDocument()
    expect(screen.getByText('-1.250.000 đ')).toBeInTheDocument()
    expect(screen.getByText('3.000.000 đ')).toBeInTheDocument()
    expect(screen.getByText('Còn nợ')).toBeInTheDocument()
    expect(screen.getByText('Còn nợ 1.250.000 đ')).toBeInTheDocument()
  })

  it('FR_010_bangGiaoDich_hienLoaiSoTienVaTrangThai', async () => {
    setup()
    const refund = (await screen.findByText('Hoàn tiền')).closest('tr')
    expect(within(refund).getByText('Chờ duyệt')).toBeInTheDocument()
    expect(within(refund).getByText('-500.000 đ')).toBeInTheDocument()
    const cash = screen.getByText('Nộp tiền mặt').closest('tr')
    expect(within(cash).getByText('Đã xác nhận')).toBeInTheDocument()
  })

  it('FR_004_hanhChinhChiXemSoDu_anCacTruongBiAnVaNutLenh', async () => {
    setup({
      perms: [{ function: 'BALANCE_LEDGER', operation: 'VIEW' }],
      balance: { ...BALANCE, paymentCode: null, status: null, hiddenFields: ['paymentCode', 'status', 'daysCovered'] },
    })
    expect(await screen.findByText('3.000.000 đ')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Lập hoàn tiền/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Mã nộp tiền')).not.toBeInTheDocument()
  })

  it('FR_014_lapHoanTien_guiNguoiNhanLyDoVaIdempotencyKey', async () => {
    const api = setup({ balance: POSITIVE })
    api.on('POST', '/balance-transactions', json(201, { id: 9, status: 'PENDING_APPROVAL' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Lập hoàn tiền, điều chỉnh' }))
    fill('Loại giao dịch', 'REFUND')
    fill('Số tiền', '1000000')
    // Người nhận là người đại diện của sổ, chọn sẵn; không có ô gõ mã, không có người nhận khác
    expect(screen.getByLabelText('Người nhận')).toHaveValue('55')
    expect(screen.getByRole('option', { name: 'Trần Thị Đại Diện (người đại diện)' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Mã người thân (người đại diện)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Họ tên người nhận khác')).not.toBeInTheDocument()
    fill('Phương thức', 'BANK_TRANSFER')
    fill('Lý do', 'Gia đình xin rút bớt tiền')
    fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }))
    await waitFor(() => expect(api.calls('POST', '/balance-transactions')).toHaveLength(1))
    const init = api.calls('POST', '/balance-transactions')[0][1]
    expect(JSON.parse(init.body)).toEqual({
      type: 'REFUND',
      residentId: 7,
      ledger: 'BALANCE',
      amount: 1000000,
      recipient: { familyMemberId: 55 },
      method: 'BANK_TRANSFER',
      reason: 'Gia đình xin rút bớt tiền',
    })
    expect(init.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    expect(await screen.findByText(/Đã gửi duyệt/)).toBeInTheDocument()
  })

  // Demo 2026-11-25: số tiền hiện dạng 1.250.000 đ; nhập sai báo đỏ ngay tại ô, không đợi bấm gửi
  it('soTien_dinhDangNhomNghin_vaBaoLoiNgayTaiO', async () => {
    const api = setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Lập hoàn tiền, điều chỉnh' }))
    fill('Loại giao dịch', 'REFUND')
    fill('Số tiền', '1250000')
    expect(screen.getByLabelText('Số tiền')).toHaveValue('1.250.000')
    fill('Số tiền', '0')
    expect(screen.getByText('Nhập số tiền là số nguyên khác 0.')).toBeInTheDocument()
    expect(screen.queryByText('Nhập lý do.')).not.toBeInTheDocument()
    fill('Số tiền', '1.000.000')
    expect(screen.queryByText('Nhập số tiền là số nguyên khác 0.')).not.toBeInTheDocument()
    expect(api.calls('POST', '/balance-transactions')).toHaveLength(0)
  })

  // Demo 2026-11-26: mở form là "Hoàn số dư và tiền cọc", điền sẵn toàn bộ số còn hoàn được (bỏ nút Hoàn toàn bộ), vẫn
  // sửa tay được
  it('moForm_macDinhHoanSoDuVaCoc_dienSanToanBo_guiHaiGiaoDich', async () => {
    const api = setup({ balance: { ...POSITIVE, balance: 800000 } })
    api.on('POST', '/balance-transactions', json(201, { id: 12, status: 'PENDING_APPROVAL' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Lập hoàn tiền, điều chỉnh' }))
    expect(screen.getByLabelText('Loại giao dịch')).toHaveValue('BOTH')
    expect(screen.queryByRole('button', { name: /Hoàn toàn bộ/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Hoàn từ số dư')).toHaveValue('800.000')
    expect(screen.getByLabelText('Hoàn từ tiền cọc')).toHaveValue('3.000.000')
    fill('Hoàn từ tiền cọc', '2000000')
    expect(screen.getByText('2.800.000 đ')).toBeInTheDocument()
    fill('Phương thức', 'CASH')
    fill('Lý do', 'Kết thúc lưu trú')
    fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }))
    await waitFor(() => expect(api.calls('POST', '/balance-transactions')).toHaveLength(2))
    const [a, b] = api.calls('POST', '/balance-transactions').map(([, init]) => init)
    expect(JSON.parse(a.body)).toMatchObject({ type: 'REFUND', ledger: 'BALANCE', amount: 800000 })
    expect(JSON.parse(b.body)).toMatchObject({ type: 'DEPOSIT_REFUND', ledger: 'DEPOSIT', amount: 2000000 })
    expect(a.headers['Idempotency-Key']).not.toBe(b.headers['Idempotency-Key'])
  })

  it('hoanCoc_conNo_dienSanDaTruNo', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Lập hoàn tiền, điều chỉnh' }))
    fill('Loại giao dịch', 'DEPOSIT_REFUND')
    expect(screen.getByLabelText('Số tiền')).toHaveValue('1.750.000')
    fill('Loại giao dịch', 'REFUND')
    expect(screen.getByLabelText('Số tiền')).toHaveValue('')
  })

  // Demo 2026-11-26: vượt số dư hoặc tiền cọc còn hoàn được thì báo đỏ ngay tại ô, không gửi
  it('BR_M11_14_vuotSoConHoanDuoc_baoDoNgay_khongGui', async () => {
    const api = setup({ balance: { ...POSITIVE, balance: 800000 } })
    fireEvent.click(await screen.findByRole('button', { name: 'Lập hoàn tiền, điều chỉnh' }))
    fill('Hoàn từ số dư', '900000')
    expect(screen.getByText('Vượt số dư còn hoàn được (800.000 đ).')).toBeInTheDocument()
    fill('Hoàn từ tiền cọc', '3500000')
    expect(screen.getByText('Vượt tiền cọc còn hoàn được (3.000.000 đ).')).toBeInTheDocument()
    fill('Loại giao dịch', 'REFUND')
    fill('Số tiền', '900000')
    expect(screen.getByText('Vượt số dư còn hoàn được (800.000 đ).')).toBeInTheDocument()
    fill('Phương thức', 'CASH')
    fill('Lý do', 'Xin rút')
    fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }))
    expect(api.calls('POST', '/balance-transactions')).toHaveLength(0)
  })

  it('loaiGiaoDich_hoanSoDu_phuongThucKhongCoKhac', async () => {
    setup({ balance: POSITIVE })
    fireEvent.click(await screen.findByRole('button', { name: 'Lập hoàn tiền, điều chỉnh' }))
    const types = within(screen.getByLabelText('Loại giao dịch'))
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(types).toEqual(['Hoàn số dư và tiền cọc', 'Hoàn số dư', 'Hoàn tiền cọc', 'Điều chỉnh'])
    const methods = within(screen.getByLabelText('Phương thức'))
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(methods).not.toContain('Khác')
  })

  it('FR_014_hoanTien_batBuocPhuongThuc', async () => {
    const api = setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Lập hoàn tiền, điều chỉnh' }))
    fill('Loại giao dịch', 'REFUND')
    fill('Số tiền', '1000000')
    fill('Lý do', 'Xin rút')
    fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }))
    expect(await screen.findByText('Chọn phương thức hoàn.')).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Không ghi' })).not.toBeInTheDocument()
    expect(api.calls('POST', '/balance-transactions')).toHaveLength(0)
  })

  it('FR_014_hoanCoc_ghiVaoSoCoc_nguoiNhanKhacCanHoTenVaGiayTo', async () => {
    // Hồ sơ không còn người đại diện thì ghi người nhận khác (FR-014)
    const api = setup({ balance: NO_REPRESENTATIVE })
    api.on('POST', '/balance-transactions', json(201, { id: 10, status: 'PENDING_APPROVAL' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Lập hoàn tiền, điều chỉnh' }))
    fill('Loại giao dịch', 'DEPOSIT_REFUND')
    fill('Số tiền', '500000')
    fill('Phương thức', 'CASH')
    fill('Lý do', 'Hủy hợp đồng')
    fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }))
    expect(await screen.findByText('Nhập họ tên và giấy tờ của người nhận.')).toBeInTheDocument()
    expect(api.calls('POST', '/balance-transactions')).toHaveLength(0)
    fill('Họ tên người nhận khác', 'Trần Văn Khác')
    fill('Giấy tờ người nhận khác', '012345678901')
    fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }))
    await waitFor(() => expect(api.calls('POST', '/balance-transactions')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/balance-transactions')[0][1].body)).toMatchObject({
      type: 'DEPOSIT_REFUND',
      ledger: 'DEPOSIT',
      recipient: { fullName: 'Trần Văn Khác', identityDocument: '012345678901' },
    })
  })

  it('BR_M11_14_vuotGioiHanHoan_409_hienLoiTrongForm', async () => {
    const api = setup({ balance: { ...POSITIVE, balance: 3000000 } })
    api.on(
      'POST',
      '/balance-transactions',
      problem(409, 'REFUND_LIMIT_EXCEEDED', { detail: 'Vượt giới hạn hoàn: tối đa 1.000.000 đ.' }),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Lập hoàn tiền, điều chỉnh' }))
    fill('Loại giao dịch', 'REFUND')
    fill('Số tiền', '3000000')
    fill('Phương thức', 'CASH')
    fill('Lý do', 'Xin rút')
    fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }))
    expect(await screen.findByText('Vượt giới hạn hoàn: tối đa 1.000.000 đ.')).toBeInTheDocument()
  })

  it('BR_M11_10_dieuChinh_choPhepSoAm_vaTroGiaoDichGoc', async () => {
    const api = setup()
    api.on('POST', '/balance-transactions', json(201, { id: 11 }))
    fireEvent.click(await screen.findByRole('button', { name: 'Lập hoàn tiền, điều chỉnh' }))
    fill('Loại giao dịch', 'ADJUSTMENT')
    fill('Sổ', 'BALANCE')
    fill('Số tiền', '-200000')
    // Chọn giao dịch gốc trong danh sách; thanh toán bảng chi phí và giao dịch Chờ duyệt không có trong danh sách
    const original = screen.getByLabelText('Giao dịch gốc')
    const options = within(original)
      .getAllByRole('option')
      .map((o) => o.value)
    expect(options).toEqual(['', '1'])
    fill('Giao dịch gốc', '1')
    fill('Lý do', 'Ghi nhầm hồ sơ')
    fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }))
    await waitFor(() => expect(api.calls('POST', '/balance-transactions')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/balance-transactions')[0][1].body)).toEqual({
      type: 'ADJUSTMENT',
      residentId: 7,
      ledger: 'BALANCE',
      amount: -200000,
      originalTransactionId: 1,
      reason: 'Ghi nhầm hồ sơ',
    })
  })

  it('FR_015_canTruCoc_guiSoTienVaTaiLaiSoDu', async () => {
    const api = setup()
    api.on('POST', '/residents/7/deposit-offsets', json(201, [{ id: 20 }, { id: 21 }]))
    fireEvent.click(await screen.findByRole('button', { name: 'Cấn trừ tiền cọc' }))
    fill('Số tiền cấn trừ', '1250000')
    // Demo 2026-11-25: ô tiền dạng xxx.xxx.xxx đ
    expect(screen.getByLabelText('Số tiền cấn trừ')).toHaveValue('1.250.000')
    fireEvent.click(screen.getByRole('button', { name: 'Cấn trừ' }))
    await waitFor(() => expect(api.calls('POST', '/residents/7/deposit-offsets')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/residents/7/deposit-offsets')[0][1].body)).toEqual({ amount: 1250000 })
    await waitFor(() => expect(api.calls('GET', '/residents/7/balance').length).toBeGreaterThan(1))
  })

  it('FR_015_canTruCoc_409_dieuKienChuaDu_hienLoi', async () => {
    const api = setup()
    api.on(
      'POST',
      '/residents/7/deposit-offsets',
      problem(409, 'OFFSET_CONDITIONS_NOT_MET', { detail: 'Chưa có hồ sơ kết thúc lưu trú.' }),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Cấn trừ tiền cọc' }))
    fill('Số tiền cấn trừ', '100')
    fireEvent.click(screen.getByRole('button', { name: 'Cấn trừ' }))
    expect(await screen.findByText('Chưa có hồ sơ kết thúc lưu trú.')).toBeInTheDocument()
  })
})
