import { describe, expect, it } from 'vitest'
import { activeTicket, admissionTicket, itemErrors, itemsBody } from './reconciliationView'

// 006 phiếu đối chiếu thuốc (FR-034 → FR-039, api-006 Reconciliation): phiếu đang làm, phiếu "tiếp nhận" cho Hồ sơ
// tiếp nhận, kiểm dòng trước khi lưu (FR-035), thân PUT …/items chỉ gồm trường ghi được.

describe('reconciliationView', () => {
  it('FR_035_phieuDangLam_laPhieuMoHoacChoXacNhanMoiNhat', () => {
    const list = [
      { id: 1, status: 'CONFIRMED', reason: 'HOSPITAL_RETURN' },
      { id: 4, status: 'PENDING_CONFIRMATION', reason: 'ADMISSION' },
      { id: 2, status: 'CANCELLED', reason: 'ADMISSION' },
    ]
    expect(activeTicket(list).id).toBe(4)
    expect(activeTicket([{ id: 1, status: 'CONFIRMED' }])).toBeNull()
  })

  it('FR_034a_phieuTiepNhan_boQuaPhieuDaHuyVaLyDoKhac', () => {
    const list = [
      { id: 3, status: 'CANCELLED', reason: 'ADMISSION' },
      { id: 5, status: 'OPEN', reason: 'PROFESSIONAL_REQUEST' },
      { id: 4, status: 'CONFIRMED', reason: 'ADMISSION' },
    ]
    expect(admissionTicket(list).id).toBe(4)
    expect(admissionTicket([{ id: 3, status: 'CANCELLED', reason: 'ADMISSION' }])).toBeNull()
  })

  it('FR_035_kiemDong_thieuDonNguonThieuMoTaThieuLyDoNgungThieuDonMoi', () => {
    const errors = itemErrors([
      { source: 'CURRENT_PRESCRIPTION', decision: 'CONTINUE' },
      { source: 'ADMISSION_CURRENT_MEDICATION', medicationDescription: ' ', decision: 'CONTINUE' },
      {
        source: 'DISCHARGE_PRESCRIPTION',
        medicationDescription: 'Clopidogrel 75mg',
        decision: 'DISCONTINUE',
        reason: '',
      },
      { source: 'DISCHARGE_PRESCRIPTION', medicationDescription: 'Clopidogrel 75mg', decision: 'ADD_NEW' },
      { source: 'DISCHARGE_PRESCRIPTION', medicationDescription: 'Clopidogrel 75mg' },
      { source: 'CURRENT_PRESCRIPTION', prescriptionId: 7, decision: 'CONTINUE' },
    ])
    expect(errors[0]).toEqual({ prescriptionId: 'Chọn đơn thuốc của dòng' })
    expect(errors[1]).toEqual({ medicationDescription: 'Nhập tên thuốc, hàm lượng, liều' })
    expect(errors[2]).toEqual({ reason: 'Nhập lý do ngừng' })
    expect(errors[3]).toEqual({ newPrescription: 'Lập đơn mới cho dòng này' })
    expect(errors[4]).toEqual({ decision: 'Chọn quyết định' })
    expect(errors[5]).toEqual({})
  })

  it('FR_036_thanLuuDong_boTruongChiDocVaDonMoiCuaDongTiepTuc', () => {
    const body = itemsBody([
      {
        id: 11,
        source: 'CURRENT_PRESCRIPTION',
        prescriptionId: 7,
        decision: 'CONTINUE',
        reason: ' ',
        newPrescription: { medicationId: 1 },
        discontinuedOutsideTicket: false,
        medicationRemovedFromProfile: false,
        createdPrescriptionId: null,
      },
      {
        source: 'DISCHARGE_PRESCRIPTION',
        medicationDescription: ' Clopidogrel 75mg ',
        decision: 'ADD_NEW',
        newPrescription: { medicationId: 2 },
      },
    ])
    expect(body).toEqual([
      { id: 11, source: 'CURRENT_PRESCRIPTION', prescriptionId: 7, decision: 'CONTINUE' },
      {
        source: 'DISCHARGE_PRESCRIPTION',
        medicationDescription: 'Clopidogrel 75mg',
        decision: 'ADD_NEW',
        newPrescription: { medicationId: 2 },
      },
    ])
  })
})
