import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { PermissionsProvider } from '@/common/permissions/permissions'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { ReconciliationPanel } from './ReconciliationPanel'

// 006 phiếu đối chiếu thuốc (User Story 4; FR-034 → FR-039) theo api-006 reconciliation, prescriptions, medications và
// api-001 (hồ sơ, hồ sơ sức khỏe ban đầu): lập phiếu, sửa dòng kèm If-Match, gửi xác nhận, trả lại, xác nhận (quy tắc hai
// người do backend kiểm), đề nghị đính chính; nút lệnh theo allowedCommands; không có gợi ý hay nút chép sẵn (Q-307).

let api

const MEDICATIONS = [{ id: 1, name: 'Amlodipin', concentration: '5mg', defaultRoute: 'Uống', usageUnit: 'viên' }]
const PRESCRIPTION = {
  id: 7,
  residentId: 9,
  medicationId: 1,
  dosage: 1,
  route: 'Uống',
  prescriptionType: 'PERIODIC',
  frequency: { type: 'TIMED_SLOTS', timedSlots: ['08:00'] },
  status: 'SUSPENDED',
  suspensionReason: 'RECONCILIATION_PENDING',
  prescriber: { type: 'INTERNAL' },
  allowedCommands: [],
}
const OPEN = {
  id: 4,
  residentId: 9,
  reason: 'ADMISSION',
  status: 'OPEN',
  createdBy: '21',
  items: [],
  allowedCommands: ['CAP_NHAT_DONG', 'GUI_XAC_NHAN'],
}
const PENDING = {
  ...OPEN,
  status: 'PENDING_CONFIRMATION',
  submittedBy: '21',
  items: [{ id: 11, source: 'CURRENT_PRESCRIPTION', prescriptionId: 7, decision: 'CONTINUE' }],
  allowedCommands: ['TRA_LAI', 'XAC_NHAN'],
}
const CONFIRMED = { ...PENDING, status: 'CONFIRMED', confirmedBy: '30', allowedCommands: ['DE_NGHI_DINH_CHINH'] }

function setup(ticket, permissions = ['CREATE', 'UPDATE', 'CONFIRM']) {
  api.on(
    'GET',
    '/me/permissions',
    json(
      200,
      permissions.map((operation) => ({ function: 'MEDICATION_RECONCILIATION', operation })),
    ),
  )
  api.on('GET', '/residents/9/medication-reconciliations', json(200, ticket ? [ticket] : []))
  if (ticket) api.on('GET', `/medication-reconciliations/${ticket.id}`, json(200, ticket, { ETag: '"3"' }))
}

function renderPanel(isDoctor = false) {
  render(
    <PermissionsProvider>
      <ReconciliationPanel residentId={9} residentName="Trần Thị Mai" defaultReason="ADMISSION" isDoctor={isDoctor} />
    </PermissionsProvider>,
  )
}

beforeEach(() => {
  api = mockRoutes()
  api.on('GET', '/residents/9', json(200, { id: 9, personalInfo: { fullName: 'Trần Thị Mai' }, activeHealthItems: [] }))
  api.on('GET', '/residents/9/prescriptions', json(200, [PRESCRIPTION]))
  api.on('GET', '/medications', json(200, MEDICATIONS))
  api.on('GET', '/residents/9/initial-health-record', json(200, { currentMedications: 'Amlodipine 5mg sáng' }))
})

afterEach(() => vi.unstubAllGlobals())

describe('ReconciliationPanel', () => {
  it('FR_034b_lapPhieu_yeuCauChuyenMonThieuChiTiet_baoTaiO_tiepNhanThiGuiLenh', async () => {
    setup(null)
    api.on('POST', '/residents/9/medication-reconciliations', json(201, {}, { ETag: '"0"' }))
    renderPanel(true)
    fireEvent.click(await screen.findByRole('button', { name: 'Bác sĩ trực tiếp lập phiếu đối chiếu' }))
    fireEvent.change(screen.getByLabelText('Loại đối chiếu'), { target: { value: 'PROFESSIONAL_REQUEST' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lập phiếu' }))
    expect(await screen.findByText('Nhập chi tiết lý do')).toBeTruthy()
    expect(api.calls('POST', '/residents/9/medication-reconciliations')).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('Loại đối chiếu'), { target: { value: 'ADMISSION' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lập phiếu' }))
    await waitFor(() => expect(api.calls('POST', '/residents/9/medication-reconciliations')).toHaveLength(1))
    const [, init] = api.calls('POST', '/residents/9/medication-reconciliations')[0]
    expect(JSON.parse(init.body)).toEqual({ reason: 'ADMISSION', comparisonSource: 'Đơn thuốc ra viện' })
    expect(init.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('M07_06_dieuDuong_tuDongLayDonHienTai_khongCoTruongQuyetDinh_khongLuuNhap_guiThangBacSi', async () => {
    setup(null, ['CREATE', 'UPDATE'])
    api.on('POST', '/residents/9/medication-reconciliations', json(201, {}, { ETag: '"0"' }))
    api.on('GET', '/medication-reconciliations/4', json(200, OPEN, { ETag: '"3"' }))
    api.on('PUT', '/medication-reconciliations/4/items', json(200, {}, { ETag: '"4"' }))
    api.on('POST', '/medication-reconciliations/4/submit', json(200, {}))
    renderPanel(false)
    fireEvent.click(await screen.findByRole('button', { name: 'Lập phiếu đối chiếu' }))
    expect(screen.queryByRole('button', { name: 'Lưu nháp' })).toBeNull()
    expect(screen.queryByLabelText(/Quyết định của bác sĩ/)).toBeNull()
    fireEvent.change(screen.getByLabelText('Hàm lượng đối chiếu dòng 1'), { target: { value: '10 mg' } })
    fireEvent.change(screen.getByLabelText('Kết quả đối chiếu dòng 1'), { target: { value: 'DOSE_CHANGED' } })
    expect(screen.getByText('Bảng tổng hợp kết quả đối chiếu')).toBeTruthy()
    api.on('GET', '/residents/9/medication-reconciliations', json(200, [OPEN]))
    fireEvent.click(screen.getByRole('button', { name: 'Gửi bác sĩ đối chiếu' }))
    await waitFor(() => expect(api.calls('POST', '/medication-reconciliations/4/submit')).toHaveLength(1))
    expect(JSON.parse(api.calls('PUT', '/medication-reconciliations/4/items')[0][1].body)[0]).toMatchObject({
      source: 'CURRENT_PRESCRIPTION',
      prescriptionId: 7,
      nurseFinding: 'DOSE_CHANGED',
      comparisonSummary: '[Đơn ra viện] 10 mg',
    })
  })

  it('M07_07_bacSi_suaQuyetDinh_ngungThieuLyDoBaoTaiO_doiLieuThieuDonMoiBiChan', async () => {
    setup(OPEN)
    renderPanel(true)
    const line = await screen.findByRole('group', { name: /Thuốc 1/ })
    fireEvent.change(within(line).getByLabelText('Quyết định của bác sĩ *'), { target: { value: 'DISCONTINUE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    expect(await within(line).findByText('Nhập lý do ngừng')).toBeTruthy()

    fireEvent.change(within(line).getByLabelText('Quyết định của bác sĩ *'), { target: { value: 'CHANGE_DOSE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    expect(await within(line).findByText('Lập đơn mới cho dòng này')).toBeTruthy()
    expect(within(line).getByRole('button', { name: 'Lập đơn mới cho dòng 1' })).toBeTruthy()
  })

  it('FR_035_luu412_baoDuLieuDaDoi_taiLaiPhieu', async () => {
    setup(OPEN)
    api.on('PUT', '/medication-reconciliations/4/items', problem(412, 'PRECONDITION_FAILED'))
    renderPanel(true)
    const line = await screen.findByRole('group', { name: /Thuốc 1/ })
    fireEvent.change(within(line).getByLabelText('Quyết định của bác sĩ *'), { target: { value: 'CONTINUE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }))
    expect(await screen.findByText('Dữ liệu đã thay đổi')).toBeTruthy()
    await waitFor(() => expect(api.calls('GET', '/medication-reconciliations/4').length).toBeGreaterThan(1))
  })

  it('FR_034_guiXacNhanThieuDong_409HienTrongKhung', async () => {
    setup({ ...OPEN, items: [{ id: 11, source: 'CURRENT_PRESCRIPTION', prescriptionId: 7, nurseFinding: 'NO_CHANGE' }] })
    api.on(
      'POST',
      '/medication-reconciliations/4/submit',
      problem(409, 'MISSING_ITEMS', { detail: 'Thiếu dòng đối chiếu cho đơn thuốc ID=7' }),
    )
    renderPanel(false)
    fireEvent.click(await screen.findByRole('button', { name: 'Gửi bác sĩ đối chiếu' }))
    expect(await screen.findByText('Thiếu dòng đối chiếu cho đơn thuốc ID=7')).toBeTruthy()
    const [, init] = api.calls('POST', '/medication-reconciliations/4/submit')[0]
    expect(init.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('FR_038_choXacNhan_traLaiBatBuocLyDo_bacSiXacNhan', async () => {
    setup(PENDING)
    api.on(
      'POST',
      '/medication-reconciliations/4/confirm',
      problem(409, 'TWO_PERSON_RULE', { detail: 'Người xác nhận phải khác người gửi' }),
    )
    api.on('POST', '/medication-reconciliations/4/return', json(200, {}))
    renderPanel(true)
    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận đối chiếu' }))
    expect(screen.getByText(/mỗi thuốc đang dùng khi tiếp nhận đã có một dòng/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận và áp dụng quyết định' }))
    expect(await screen.findByText('Người xác nhận phải khác người gửi')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Trả lại phiếu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận trả lại' }))
    expect(await screen.findByText('Nhập lý do trả lại')).toBeTruthy()
    expect(api.calls('POST', '/medication-reconciliations/4/return')).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('Lý do trả lại'), { target: { value: 'Thiếu dòng Insulin' } })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận trả lại' }))
    await waitFor(() => expect(api.calls('POST', '/medication-reconciliations/4/return')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/medication-reconciliations/4/return')[0][1].body)).toEqual({
      reason: 'Thiếu dòng Insulin',
    })
  })

  it('FR_039_daXacNhan_khongSua_deNghiDinhChinhBatBuocLyDo', async () => {
    setup(CONFIRMED)
    api.on('POST', '/medication-reconciliations/4/propose-correction', json(201, {}))
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Đề nghị đính chính' }))
    expect(screen.queryByRole('button', { name: 'Thêm dòng' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Nội dung đúng'), { target: { value: 'Dòng 1 ghi nhầm liều' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đề nghị đính chính' }))
    expect(await screen.findByText('Nhập lý do đính chính')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Lý do đính chính'), { target: { value: 'Ghi nhầm khi đối chiếu' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đề nghị đính chính' }))
    await waitFor(() => expect(api.calls('POST', '/medication-reconciliations/4/propose-correction')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/medication-reconciliations/4/propose-correction')[0][1].body)).toEqual({
      correctedContent: { description: 'Dòng 1 ghi nhầm liều' },
      reason: 'Ghi nhầm khi đối chiếu',
    })
  })

  it('DESIGN_7_4_khongCoLenhDuocPhep_khongCoNutLenh', async () => {
    setup({ ...PENDING, allowedCommands: [] })
    renderPanel()
    expect(await screen.findByText('Tiếp tục')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Xác nhận phiếu' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Trả lại phiếu' })).toBeNull()
  })

  it('T077_FR_039_deNghiDinhChinh_hienTrenPhieu_xacNhanVaTraLaiTheoLenhDuocPhep', async () => {
    const correction = {
      id: 101,
      reconciliationId: 4,
      correctedContent: { description: 'Dòng 1 ghi nhầm liều' },
      reason: 'Ghi nhầm khi đối chiếu',
      status: 'PENDING_CONFIRMATION',
      createdBy: '21',
      allowedCommands: ['CONFIRM', 'RETURN'],
    }
    const rejected = {
      ...correction,
      id: 100,
      correctedContent: {},
      status: 'REJECTED',
      returnReason: 'Thiếu nội dung đúng',
      allowedCommands: [],
    }
    setup({ ...CONFIRMED, corrections: [correction, rejected] })
    api.on('POST', '/reconciliation-corrections/101/confirm', json(200, {}))
    api.on('POST', '/reconciliation-corrections/101/return', json(200, {}))
    renderPanel()
    const list = await screen.findByRole('list', { name: 'Đề nghị đính chính' })
    expect(within(list).getByText('Dòng 1 ghi nhầm liều')).toBeTruthy()
    expect(within(list).getByText('Thiếu nội dung đúng', { exact: false })).toBeTruthy()
    expect(within(list).getAllByRole('button', { name: /Xác nhận đính chính/ })).toHaveLength(1)

    fireEvent.click(within(list).getByRole('button', { name: 'Trả lại đề nghị #101' }))
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận trả lại đề nghị' }))
    expect(await screen.findByText('Nhập lý do trả lại đề nghị')).toBeTruthy()
    expect(api.calls('POST', '/reconciliation-corrections/101/return')).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('Lý do trả lại đề nghị'), { target: { value: 'Nội dung chưa rõ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận trả lại đề nghị' }))
    await waitFor(() => expect(api.calls('POST', '/reconciliation-corrections/101/return')).toHaveLength(1))
    const [, init] = api.calls('POST', '/reconciliation-corrections/101/return')[0]
    expect(JSON.parse(init.body)).toEqual({ reason: 'Nội dung chưa rõ' })
    expect(init.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)

    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận đính chính #101' }))
    await waitFor(() => expect(api.calls('POST', '/reconciliation-corrections/101/confirm')).toHaveLength(1))
  })

  it('T077_lenhThanhCong_taiLaiChiTietPhieu', async () => {
    setup({ ...OPEN, items: [{ id: 11, source: 'CURRENT_PRESCRIPTION', prescriptionId: 7, nurseFinding: 'NO_CHANGE' }] })
    api.on('POST', '/medication-reconciliations/4/submit', json(200, {}))
    renderPanel(false)
    fireEvent.click(await screen.findByRole('button', { name: 'Gửi bác sĩ đối chiếu' }))
    await waitFor(() => expect(api.calls('GET', '/medication-reconciliations/4').length).toBeGreaterThan(1))
  })

  it('FR_034_huyPhieuDoiChieu_batBuocLyDo_vaGuiIdempotencyKey', async () => {
    setup({ ...OPEN, allowedCommands: ['CAP_NHAT_DONG', 'GUI_XAC_NHAN', 'HUY'] })
    api.on('POST', '/medication-reconciliations/4/cancel', json(200, {}))
    renderPanel(false)
    fireEvent.click(await screen.findByRole('button', { name: 'Hủy phiếu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hủy phiếu' }))
    expect(await screen.findByText('Nhập lý do hủy phiếu')).toBeTruthy()
    expect(api.calls('POST', '/medication-reconciliations/4/cancel')).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('Lý do hủy phiếu'), { target: { value: 'Lập nhầm người cao tuổi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hủy phiếu' }))
    await waitFor(() => expect(api.calls('POST', '/medication-reconciliations/4/cancel')).toHaveLength(1))
    const [, init] = api.calls('POST', '/medication-reconciliations/4/cancel')[0]
    expect(JSON.parse(init.body)).toEqual({ reason: 'Lập nhầm người cao tuổi' })
    expect(init.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
  })
})
