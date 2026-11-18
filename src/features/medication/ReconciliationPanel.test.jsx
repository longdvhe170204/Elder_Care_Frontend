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

function renderPanel() {
  render(
    <PermissionsProvider>
      <ReconciliationPanel residentId={9} residentName="Trần Thị Mai" defaultReason="ADMISSION" />
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
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Lập phiếu đối chiếu' }))
    fireEvent.change(screen.getByLabelText('Lý do lập phiếu'), { target: { value: 'PROFESSIONAL_REQUEST' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lập phiếu' }))
    expect(await screen.findByText('Nhập chi tiết lý do')).toBeTruthy()
    expect(api.calls('POST', '/residents/9/medication-reconciliations')).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('Lý do lập phiếu'), { target: { value: 'ADMISSION' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lập phiếu' }))
    await waitFor(() => expect(api.calls('POST', '/residents/9/medication-reconciliations')).toHaveLength(1))
    const [, init] = api.calls('POST', '/residents/9/medication-reconciliations')[0]
    expect(JSON.parse(init.body)).toEqual({ reason: 'ADMISSION' })
    expect(init.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('Q_307_thuocTiepNhanChiDeDoc_khongCoNutChepSan_khongQuyenLapThiKhongCoNutLap', async () => {
    setup(OPEN, [])
    renderPanel()
    expect(await screen.findByText('Amlodipine 5mg sáng')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Chép|Thêm từ hồ sơ/ })).toBeNull()
    expect(await screen.findByRole('button', { name: 'Thêm dòng' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Lập phiếu đối chiếu' })).toBeNull()
  })

  it('FR_035_suaDong_ngungThieuLyDoBaoTaiO_luuGuiIfMatch', async () => {
    setup(OPEN)
    api.on('PUT', '/medication-reconciliations/4/items', json(200, {}, { ETag: '"4"' }))
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Thêm dòng' }))
    const line = screen.getByRole('group', { name: 'Dòng 1' })
    fireEvent.change(within(line).getByLabelText('Nguồn'), { target: { value: 'ADMISSION_CURRENT_MEDICATION' } })
    fireEvent.change(within(line).getByLabelText('Thuốc'), { target: { value: 'Amlodipine 5mg sáng' } })
    fireEvent.change(within(line).getByLabelText('Quyết định'), { target: { value: 'DISCONTINUE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu các dòng' }))
    expect(await within(line).findByText('Nhập lý do ngừng')).toBeTruthy()
    expect(api.calls('PUT', '/medication-reconciliations/4/items')).toHaveLength(0)

    fireEvent.change(within(line).getByLabelText('Lý do'), { target: { value: 'Bác sĩ cho ngừng khi vào viện' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu các dòng' }))
    await waitFor(() => expect(api.calls('PUT', '/medication-reconciliations/4/items')).toHaveLength(1))
    const [, init] = api.calls('PUT', '/medication-reconciliations/4/items')[0]
    expect(init.headers['If-Match']).toBe('"3"')
    expect(JSON.parse(init.body)).toEqual([
      {
        source: 'ADMISSION_CURRENT_MEDICATION',
        medicationDescription: 'Amlodipine 5mg sáng',
        decision: 'DISCONTINUE',
        reason: 'Bác sĩ cho ngừng khi vào viện',
      },
    ])
  })

  it('FR_035_dongDonHienCo_chonTuDanhSachDon_themMoiThieuDonMoiBiChan', async () => {
    setup(OPEN)
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Thêm dòng' }))
    const line = screen.getByRole('group', { name: 'Dòng 1' })
    const options = within(within(line).getByLabelText('Đơn thuốc'))
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(options.some((o) => o.includes('Amlodipin 5mg'))).toBe(true)
    fireEvent.change(within(line).getByLabelText('Quyết định'), { target: { value: 'CHANGE_DOSE' } })
    fireEvent.change(within(line).getByLabelText('Đơn thuốc'), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu các dòng' }))
    expect(await within(line).findByText('Lập đơn mới cho dòng này')).toBeTruthy()
    expect(within(line).getByRole('button', { name: 'Lập đơn mới cho dòng 1' })).toBeTruthy()
  })

  it('FR_035_luu412_baoDuLieuDaDoi_taiLaiPhieu', async () => {
    setup(OPEN)
    api.on('PUT', '/medication-reconciliations/4/items', problem(412, 'PRECONDITION_FAILED'))
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Thêm dòng' }))
    const line = screen.getByRole('group', { name: 'Dòng 1' })
    fireEvent.change(within(line).getByLabelText('Đơn thuốc'), { target: { value: '7' } })
    fireEvent.change(within(line).getByLabelText('Quyết định'), { target: { value: 'CONTINUE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu các dòng' }))
    expect(await screen.findByText('Dữ liệu đã thay đổi')).toBeTruthy()
    await waitFor(() => expect(api.calls('GET', '/medication-reconciliations/4').length).toBeGreaterThan(1))
  })

  it('FR_034_guiXacNhanThieuDong_409HienTrongKhung', async () => {
    setup(OPEN)
    api.on(
      'POST',
      '/medication-reconciliations/4/submit',
      problem(409, 'MISSING_ITEMS', { detail: 'Thiếu dòng đối chiếu cho đơn thuốc ID=7' }),
    )
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Gửi xác nhận' }))
    expect(await screen.findByText('Thiếu dòng đối chiếu cho đơn thuốc ID=7')).toBeTruthy()
    const [, init] = api.calls('POST', '/medication-reconciliations/4/submit')[0]
    expect(init.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('FR_038_choXacNhan_traLaiBatBuocLyDo_tuXacNhanBiChanHaiNguoi', async () => {
    setup(PENDING)
    api.on(
      'POST',
      '/medication-reconciliations/4/confirm',
      problem(409, 'TWO_PERSON_RULE', { detail: 'Người xác nhận phải khác người gửi' }),
    )
    api.on('POST', '/medication-reconciliations/4/return', json(200, {}))
    renderPanel()
    expect(await screen.findByText('Tiếp tục')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Lưu các dòng' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận phiếu' }))
    // Q mới (chủ dự án 2026-11-18): người xác nhận kiểm đủ dòng cho thuốc đang dùng khi tiếp nhận
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
})
