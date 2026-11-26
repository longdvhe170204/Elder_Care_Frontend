// Giá trị, kiểm tra và details của lệnh Cho tạm vắng (004 FR-048; test BF-12 2026-11-24). Form ở AbsenceFields.jsx.

export const EMPTY_ABSENCE = { type: '', returnAt: '', recordId: '', pickerId: null, staffId: '', medication: false }

export function absenceErrors(a) {
  const errors = {}
  if (!a.type) errors.absenceType = 'Chọn loại vắng'
  if (!a.returnAt) errors.returnAt = 'Nhập thời điểm dự kiến trở lại'
  if (!a.recordId) errors.pickupRecord = 'Chọn bản ghi đón'
  if (!a.staffId) errors.handoverStaff = 'Chọn nhân viên bàn giao'
  return errors
}

export function absenceDetails(a, toIso) {
  return {
    absenceType: a.type,
    expectedReturnAt: toIso(a.returnAt),
    pickupRecordId: Number(a.recordId),
    pickedUpById: a.pickerId,
    handoverStaffId: Number(a.staffId),
    takesMedication: a.medication,
  }
}
