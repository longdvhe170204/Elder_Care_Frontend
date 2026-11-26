import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { MedicationPage } from './MedicationPage'
import { PermissionsProvider } from '@/common/permissions/permissions'

// 006 Phát thuốc theo api-006 (rounds, administer), api-001 (hồ sơ), api-003 (vị trí), api-008 (ca): dải "Cần làm
// ngay" cho liều Trễ (DESIGN.md 6.7), thẻ không viền đỏ, xác nhận liều gửi Idempotency-Key và đúng thân lệnh.

let api

const DOSE = {
  doseKey: '7-202611080900',
  residentId: 9,
  prescriptionId: 7,
  medicationName: 'Metformin 500mg',
  dosage: 1,
  dosageUnit: 'viên',
  route: 'Uống',
  scheduledTime: '2026-11-08T02:00:00Z',
  windowFrom: '2026-11-08T01:30:00Z',
  windowTo: '2026-11-08T02:30:00Z',
  status: 'LATE',
  currentStatus: 'LATE',
  materialized: true,
  floorShared: false,
  requiresOnline: false,
  medicationSource: 'FACILITY',
  usableBatches: [],
}

beforeEach(() => {
  api = mockRoutes()
  api.on('GET', '/medication-doses/rounds', json(200, [DOSE]))
  api.on('GET', '/residents/9', json(200, { id: 9, personalInfo: { fullName: 'Trần Thị Mai' }, activeHealthItems: [] }))
  api.on('GET', '/residents/9/location', json(200, { location: { room: 'P201', label: 'Khu A – Tầng 2 – P201 – G1' } }))
  api.on('GET', '/me/shifts', json(200, []))
})

afterEach(() => vi.unstubAllGlobals())

describe('MedicationPage', () => {
  it('FR_026_vongPhatThuoc_hienTenNguoiVaThuocTuApi', async () => {
    render(<MedicationPage role="NURSING_STAFF" />)
    expect(await screen.findByText('Metformin 500mg')).toBeTruthy()
    expect(screen.getAllByText('Trần Thị Mai').length).toBeGreaterThan(0)
    expect(screen.getByText('P201')).toBeTruthy()
  })

  it('API_008_caHienTaiGuiToLaNgaySauFrom', async () => {
    render(<MedicationPage role="NURSING_STAFF" />)
    await waitFor(() => expect(api.calls('GET', '/me/shifts').length).toBeGreaterThan(0))
    const url = new URL(api.calls('GET', '/me/shifts')[0][0], 'http://x')
    const from = new Date(url.searchParams.get('from') + 'T00:00:00Z')
    expect(new Date(url.searchParams.get('to') + 'T00:00:00Z') - from).toBe(86400000)
  })

  it('DESIGN_6_7_lieuTre_hienOReDaiCanLamNgay_theKhongCoVienDo', async () => {
    const { container } = render(<MedicationPage role="NURSING_STAFF" />)
    expect(await screen.findByRole('region', { name: 'Cần làm ngay' })).toBeTruthy()
    expect(container.querySelector('[class*="ring-[1.5px]"]')).toBeNull()
  })

  it('FR_026_403_hienLoiThayVangTai', async () => {
    api.on('GET', '/medication-doses/rounds', problem(403, 'FORBIDDEN'))
    render(<MedicationPage role="NURSING_STAFF" />)
    expect(await screen.findByText('Không có quyền thực hiện')).toBeTruthy()
  })

  it('FR_026_xacNhanDaDung_guiIdempotencyKeyVaThanLenh', async () => {
    api.on('POST', '/medication-doses/7-202611080900/administer', json(200, { ...DOSE, status: 'ADMINISTERED' }))
    render(<MedicationPage role="NURSING_STAFF" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Phát thuốc' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Đã dùng' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu xác nhận' }))

    await waitFor(() => expect(api.calls('POST', '/medication-doses/7-202611080900/administer')).toHaveLength(1))
    const [, init] = api.calls('POST', '/medication-doses/7-202611080900/administer')[0]
    expect(init.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    expect(JSON.parse(init.body)).toMatchObject({ basis: 'REGULAR' })
    expect(JSON.parse(init.body).administeredAt).toMatch(/T\d{2}:\d{2}:00\+07:00$/)
  })

  it('FR_026_tuChoi_guiLyDo', async () => {
    api.on('POST', '/medication-doses/7-202611080900/refuse', json(200, {}))
    render(<MedicationPage role="NURSING_STAFF" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Phát thuốc' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Từ chối' }))
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Người cao tuổi không muốn uống' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu xác nhận' }))

    await waitFor(() => expect(api.calls('POST', '/medication-doses/7-202611080900/refuse')).toHaveLength(1))
    const [, init] = api.calls('POST', '/medication-doses/7-202611080900/refuse')[0]
    expect(JSON.parse(init.body)).toEqual({ reason: 'Người cao tuổi không muốn uống' })
  })

  it('006_T072_cheDoDoiChieuThuoc_chonNguoi_hienPhieuCuaNguoiDo', async () => {
    api.on(
      'GET',
      '/residents',
      json(200, { items: [{ id: 9, profileCode: 'HS-0009', personalInfo: { fullName: 'Trần Thị Mai' } }] }),
    )
    api.on('GET', '/residents/9/prescriptions', json(200, []))
    api.on('GET', '/medications', json(200, []))
    api.on('GET', '/residents/9/initial-health-record', json(200, {}))
    api.on('GET', '/residents/9/medication-reconciliations', json(200, []))
    render(<MedicationPage role="NURSING_STAFF" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Đối chiếu thuốc' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Trần Thị Mai, HS-0009' }))
    expect(await screen.findByText('Trần Thị Mai chưa có phiếu đối chiếu thuốc.')).toBeTruthy()
  })

  it('BF_01_buoc12_nguoiDangTiepNhan_lyDoMacDinhLaTiepNhan', async () => {
    api.on(
      'GET',
      '/residents',
      json(200, {
        items: [
          { id: 9, profileCode: 'HS-0009', status: 'ADMISSION_IN_PROGRESS', personalInfo: { fullName: 'Trần Thị Mai' } },
        ],
      }),
    )
    api.on('GET', '/residents/9/initial-health-record', json(200, {}))
    api.on('GET', '/residents/9/medication-reconciliations', json(200, []))
    api.on('GET', '/me/permissions', json(200, [{ function: 'MEDICATION_RECONCILIATION', operation: 'CREATE' }]))
    render(
      <PermissionsProvider>
        <MedicationPage role="DOCTOR" />
      </PermissionsProvider>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Đối chiếu thuốc' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Trần Thị Mai, HS-0009' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Lập phiếu đối chiếu' }))
    expect(screen.getByLabelText('Lý do lập phiếu')).toHaveValue('ADMISSION')
  })

  it('006_T074_donChoDoiChieu_nutMoChuyenSangDoiChieuDungNguoi', async () => {
    api.on(
      'GET',
      '/residents',
      json(200, { items: [{ id: 9, profileCode: 'HS-0009', personalInfo: { fullName: 'Trần Thị Mai' } }] }),
    )
    api.on(
      'GET',
      '/residents/9/prescriptions',
      json(200, [
        {
          id: 7,
          residentId: 9,
          medicationId: 1,
          dosage: 1,
          route: 'Uống',
          prescriptionType: 'PERIODIC',
          frequency: { type: 'TIMED_SLOTS', timedSlots: ['08:00'] },
          startedAt: '2026-11-01T01:00:00Z',
          status: 'SUSPENDED',
          suspensionReason: 'RECONCILIATION_PENDING',
          prescriber: { type: 'INTERNAL' },
          allowedCommands: [],
        },
      ]),
    )
    api.on('GET', '/medications', json(200, []))
    api.on('GET', '/residents/9/initial-health-record', json(200, {}))
    api.on('GET', '/residents/9/medication-reconciliations', json(200, []))
    render(<MedicationPage role="NURSING_STAFF" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Đơn thuốc' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Trần Thị Mai, HS-0009' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Mở đối chiếu thuốc của Trần Thị Mai' }))
    expect(await screen.findByText('Trần Thị Mai chưa có phiếu đối chiếu thuốc.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Đối chiếu thuốc' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('006_T078_danhSachCanDoiChieu_bamTenMoPhieuNguoiDo_quaHanDungTruoc', async () => {
    api.on('GET', '/residents', json(200, { items: [] }))
    api.on(
      'GET',
      '/medication-reconciliation-worklist',
      json(200, [
        {
          residentId: 9,
          reconciliationId: 4,
          status: 'OPEN',
          reason: 'HOSPITAL_RETURN',
          deadlineAt: '2026-11-08T05:00:00Z',
          overdue: true,
          awaitingPrescriptionCount: 2,
        },
        { residentId: 11, awaitingPrescriptionCount: 1, overdue: false },
      ]),
    )
    api.on(
      'GET',
      '/residents/11',
      json(200, { id: 11, personalInfo: { fullName: 'Lê Văn Bình' }, activeHealthItems: [] }),
    )
    api.on('GET', '/residents/9/prescriptions', json(200, []))
    api.on('GET', '/medications', json(200, []))
    api.on('GET', '/residents/9/initial-health-record', json(200, {}))
    api.on('GET', '/residents/9/medication-reconciliations', json(200, []))
    render(<MedicationPage role="NURSING_STAFF" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Đối chiếu thuốc' }))
    const strip = await screen.findByRole('region', { name: 'Cần đối chiếu' })
    const names = within(strip)
      .getAllByRole('button')
      .map((b) => b.textContent)
    expect(names).toEqual(['Trần Thị Mai, quá hạn', 'Lê Văn Bình, chưa lập phiếu'])
    fireEvent.click(within(strip).getByRole('button', { name: 'Trần Thị Mai, quá hạn' }))
    expect(await screen.findByText('Trần Thị Mai chưa có phiếu đối chiếu thuốc.')).toBeTruthy()
  })

  it('006_T078_moTuCanhBao_vaoThangCheDoDoiChieuDungNguoi', async () => {
    api.on('GET', '/residents', json(200, { items: [] }))
    api.on('GET', '/medication-reconciliation-worklist', json(200, []))
    api.on('GET', '/residents/9/prescriptions', json(200, []))
    api.on('GET', '/medications', json(200, []))
    api.on('GET', '/residents/9/initial-health-record', json(200, {}))
    api.on('GET', '/residents/9/medication-reconciliations', json(200, []))
    // residentId từ URL là chuỗi; họ tên đọc từ api-001
    render(<MedicationPage role="NURSING_STAFF" mode="reconciliation" residentId="9" />)
    expect(await screen.findByText('Trần Thị Mai chưa có phiếu đối chiếu thuốc.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Đối chiếu thuốc' })).toHaveAttribute('aria-pressed', 'true')
  })
})
