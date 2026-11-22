import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { json, mockRoutes } from '@/test/fetchRoutes'
import { DoseSheet } from './DoseSheet'
import { FamilyMedicationPanel } from './FamilyMedicationPanel'
import { LateDoseSheet } from './LateDoseSheet'
import { PrnPanel } from './PrnPanel'
import { recordDoses } from './doseRound'
import { newPrescriptionBody } from './prescriptionView'

// Sửa BF-07 (Q-427 → Q-437): Hoãn, Nhận liều, chỉ số đo trước khi dùng, đã dùng muộn bằng đính chính, thuốc gia đình gửi,
// hiệu quả PRN, mức quan trọng và chỉ số của đơn.

let api
beforeEach(() => {
  api = mockRoutes()
})
afterEach(() => vi.unstubAllGlobals())

const RESIDENT = { name: 'Trần Thị Mai', code: '9', initials: 'TM', room: '201', allergies: [], photo: null }
const DOSE = {
  id: '10-202611050800',
  time: '08:00',
  from: '07:30',
  to: '08:30',
  drug: 'Insulin',
  dose: '10 IU',
  route: 'Tiêm',
  source: 'Viện',
  status: 'Đến giờ',
  lots: [],
  critical: true,
  postponed: false,
  claimedBy: null,
  measurements: ['BLOOD_GLUCOSE'],
}
const group = (dose = DOSE) => ({ key: 'g', time: '08:00', resident: RESIDENT, doses: [dose] })

describe('DoseSheet BF-07', () => {
  it('BR_M07_26_hoan_batBuocLyDo_roiGuiKetQuaHoan', () => {
    const onSave = vi.fn()
    render(<DoseSheet group={group()} now="08:10" onOpenChange={() => {}} onSave={onSave} />)
    expect(screen.getByText('Quan trọng về thời gian')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Hoãn có chủ đích' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu xác nhận' }))
    expect(screen.getByText('Nhập lý do hoãn có chủ đích')).toBeTruthy()
    expect(onSave).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Đang ăn chưa xong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu xác nhận' }))
    expect(onSave).toHaveBeenCalledOnce()
    expect(onSave.mock.calls[0][0][0]).toMatchObject({ result: 'Hoãn có chủ đích', reason: 'Đang ăn chưa xong' })
  })

  it('BR_M07_26_chiSo_batBuocKhiDaDung', () => {
    const onSave = vi.fn()
    render(<DoseSheet group={group()} now="08:10" onOpenChange={() => {}} onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: 'Đã dùng' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu xác nhận' }))
    expect(screen.getByText(/Nhập chỉ số đo trước khi dùng: Đường huyết/)).toBeTruthy()
    expect(onSave).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Đường huyết'), { target: { value: '6,4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu xác nhận' }))
    expect(onSave.mock.calls[0][0][0].measure).toEqual({ BLOOD_GLUCOSE: '6,4' })
  })

  it('BR_M07_26_nhanLieu_guiClaimVaHienGioHetHan', async () => {
    api.on('POST', '/medication-doses/10-202611050800/claim', json(200, { claimExpiresAt: '2026-11-05T01:20:00Z' }))
    render(<DoseSheet group={group()} now="08:10" onOpenChange={() => {}} onSave={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Nhận liều' }))
    expect(await screen.findByText(/Bạn đã nhận liều đến 08:20/)).toBeTruthy()
    expect(api.calls('POST', '/medication-doses/10-202611050800/claim')).toHaveLength(1)
  })
})

describe('recordDoses BF-07', () => {
  it('BR_M07_26_guiHoanVaChiSo', async () => {
    api.on('POST', '/medication-doses/10-202611050800/postpone', json(200, {}))
    api.on('POST', '/medication-doses/11-202611050800/administer', json(200, {}))
    await recordDoses(
      [
        { dose: { id: '10-202611050800' }, result: 'Hoãn có chủ đích', reason: ' Đang ăn ', key: 'k1' },
        { dose: { id: '11-202611050800', status: 'Đến giờ' }, result: 'Đã dùng', time: '08:05', reaction: '', measure: { HEART_RATE: '72', BLOOD_GLUCOSE: '' }, key: 'k2' },
      ],
      new Date('2026-11-05T01:10:00Z'),
    )
    const [, postpone] = api.calls('POST', '/medication-doses/10-202611050800/postpone')[0]
    expect(JSON.parse(postpone.body)).toEqual({ reason: 'Đang ăn' })
    const [, administer] = api.calls('POST', '/medication-doses/11-202611050800/administer')[0]
    expect(JSON.parse(administer.body).measurements).toEqual([{ code: 'HEART_RATE', value: 72 }])
  })
})

describe('LateDoseSheet', () => {
  it('Q327_boLo_ghiDaDungMuon_guiBanDinhChinhApi000', async () => {
    api.on('POST', '/corrections/M07.DOSE_RESULT/555', json(201, { id: 1 }))
    const onSaved = vi.fn()
    render(<LateDoseSheet dose={{ ...DOSE, status: 'Bỏ lỡ', resultId: 555 }} now="09:30" onSaved={onSaved} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ghi đã dùng muộn' }))
    expect(screen.getByText('Nhập lý do')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Lý do đính chính'), { target: { value: 'Quên ghi, đã cho dùng' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ghi đã dùng muộn' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const [, init] = api.calls('POST', '/corrections/M07.DOSE_RESULT/555')[0]
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({ type: 'AMEND_CONTENT', reason: 'Quên ghi, đã cho dùng' })
    expect(body.correctedContent.resultType).toBe('ADMINISTERED')
    expect(body.correctedContent.administeredAt).toMatch(/T09:30:00\+07:00$/)
    expect(init.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('newPrescriptionBody BF-07', () => {
  const form = {
    medicationId: '4',
    dosage: '1',
    route: 'Tiêm',
    prescriptionType: 'PRN',
    minIntervalMinutes: '240',
    maxDosesPer24h: '3',
    medicationSource: 'FACILITY',
    prescriberType: 'INTERNAL',
    instructionNote: '',
    timeCriticality: 'CRITICAL',
    requiredMeasurements: ['BLOOD_GLUCOSE'],
    indication: ' đau ',
    confirmations: {},
  }
  it('BR_M07_27_mucQuanTrongChiSoChiDinh_vaoThanLenh', () => {
    expect(newPrescriptionBody(form)).toMatchObject({
      timeCriticality: 'CRITICAL',
      requiredMeasurements: ['BLOOD_GLUCOSE'],
      indication: 'đau',
    })
  })
  it('BR_M07_27_mucThuong_khongGuiTruongThua', () => {
    const body = newPrescriptionBody({ ...form, timeCriticality: 'NORMAL', requiredMeasurements: [], indication: '' })
    expect(body).not.toHaveProperty('timeCriticality')
    expect(body).not.toHaveProperty('requiredMeasurements')
    expect(body).not.toHaveProperty('indication')
  })
})

describe('FamilyMedicationPanel', () => {
  const RES = { id: 5, profileCode: 'HS-0005', personalInfo: { fullName: 'Nguyễn Thị Lan' } }
  const CHECKED = { labelOk: true, expiryOk: true, packagingOk: true, nameOk: true }
  const batches = [
    { id: 31, customName: 'Paracetamol', concentration: '500 mg', quantity: 20, unit: 'viên', expiryDate: '2030-01-01', status: 'PENDING_RECONCILIATION', intakeChecks: { ...CHECKED, nameOk: false } },
    { id: 32, customName: 'Vitamin C', concentration: '1 g', quantity: 10, unit: 'viên', expiryDate: '2030-01-01', status: 'HOLD_ONLY', intakeChecks: CHECKED },
  ]

  beforeEach(() => {
    api.on('GET', '/residents', json(200, { items: [RES] }))
    api.on('GET', '/residents/5/family-medications', json(200, batches))
    api.on('GET', '/residents/5/prescriptions', json(200, []))
  })

  async function open() {
    render(<FamilyMedicationPanel canRecord onSaved={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Nguyễn Thị Lan, HS-0005' }))
    await screen.findByText('Paracetamol')
  }

  it('BR_M07_30_mucKhongDat_khongChonDuocDuocSuDung', async () => {
    await open()
    expect(screen.getByText(/Đúng tên người cao tuổi không đạt/)).toBeTruthy()
    const use = screen.getAllByRole('button', { name: 'Xác nhận sử dụng' })
    expect(use[0].disabled).toBe(true)
    expect(use[1].disabled).toBe(false)
  })

  it('BR_M07_30_hoanTra_batBuocNguoiChungKien', async () => {
    api.on('POST', '/family-medications/32/return', json(200, {}))
    await open()
    fireEvent.click(screen.getAllByRole('button', { name: 'Hoàn trả' })[1])
    fireEvent.change(await screen.findByLabelText('Số lượng đếm thực tế lúc trả'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Người nhận'), { target: { value: 'Con gái' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Hoàn trả' }).at(-1))
    expect(await screen.findByText('Nhập đủ các ô bắt buộc')).toBeTruthy()
    expect(api.calls('POST', '/family-medications/32/return')).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('Người chứng kiến'), { target: { value: 'Điều dưỡng Mai' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Hoàn trả' }).at(-1))
    await waitFor(() => expect(api.calls('POST', '/family-medications/32/return')).toHaveLength(1))
    const [, init] = api.calls('POST', '/family-medications/32/return')[0]
    expect(JSON.parse(init.body)).toMatchObject({ witness: 'Điều dưỡng Mai', quantity: 10, recipient: { fullName: 'Con gái' } })
  })
})

describe('PrnPanel hiệu quả', () => {
  it('BR_M07_04_lanDungChuaGhiHieuQua_hienNutVaGui', async () => {
    const recent = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    api.on('GET', '/residents', json(200, { items: [{ id: 9, profileCode: 'HS-0009', personalInfo: { fullName: 'Trần Thị Mai' } }] }))
    api.on('GET', '/residents/9', json(200, { id: 9, personalInfo: { fullName: 'Trần Thị Mai' } }))
    api.on('GET', '/residents/9/prescriptions', json(200, [
      { id: 7, residentId: 9, medicationId: 4, dosage: 1, route: 'Uống', prescriptionType: 'PRN', minIntervalMinutes: 240, maxDosesPer24h: 3, medicationSource: 'FACILITY', status: 'ACTIVE', indication: 'đau' },
    ]))
    api.on('GET', '/medications', json(200, [{ id: 4, name: 'Paracetamol', concentration: '500mg', usageUnit: 'viên' }]))
    api.on('GET', '/prescriptions/7/prn-administrations', json(200, { prescriptionId: 7, indication: 'đau', canAdministerNow: true, administrations: [{ id: 88, administeredAt: recent }] }))
    api.on('POST', '/prescriptions/7/prn-administrations/88/effectiveness', json(201, {}))
    render(<PrnPanel canRecord now="10:00" onSaved={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Trần Thị Mai, HS-0009' }))
    expect(await screen.findByText(/Chỉ định: đau/)).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi hiệu quả' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Lưu hiệu quả' }))
    expect(await screen.findByText('Nhập hiệu quả sau khi dùng thuốc')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Hiệu quả'), { target: { value: 'Hết đau sau 30 phút' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu hiệu quả' }))
    await waitFor(() => expect(api.calls('POST', '/prescriptions/7/prn-administrations/88/effectiveness')).toHaveLength(1))
    const [, init] = api.calls('POST', '/prescriptions/7/prn-administrations/88/effectiveness')[0]
    expect(JSON.parse(init.body)).toEqual({ effectiveness: 'Hết đau sau 30 phút' })
  })
})
