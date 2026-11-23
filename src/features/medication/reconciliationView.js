// Phiếu đối chiếu thuốc (spec 006 FR-034 → FR-039; api-006 Reconciliation, ReconciliationItem): nhãn, chọn phiếu đang
// làm, kiểm dòng trước khi lưu và thân PUT …/items. Không tạo sẵn dòng, không gợi ý (Q-306, Q-307); backend kiểm lại mọi
// lệnh (đủ dòng khi gửi, quy tắc hai người khi xác nhận).

export const REASONS = {
  ADMISSION: 'Tiếp nhận',
  HOSPITAL_RETURN: 'Trở về từ bệnh viện',
  PROFESSIONAL_REQUEST: 'Theo yêu cầu chuyên môn',
}

export const STATUS = {
  OPEN: 'Mở',
  PENDING_CONFIRMATION: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  CANCELLED: 'Đã hủy',
}

export const SOURCES = {
  CURRENT_PRESCRIPTION: 'Đơn hiện có',
  DISCHARGE_PRESCRIPTION: 'Đơn ra viện',
  ADMISSION_CURRENT_MEDICATION: 'Thuốc đang dùng khi tiếp nhận',
}

export const DECISIONS = {
  CONTINUE: 'Tiếp tục',
  DISCONTINUE: 'Ngừng',
  CHANGE_DOSE: 'Thay đổi liều',
  ADD_NEW: 'Thêm mới',
}

// Dòng tạo đơn khi phiếu được xác nhận nên phải có đơn: Thay đổi liều, Thêm mới, và Tiếp tục thuốc của đơn ra viện hoặc
// thuốc đang dùng khi tiếp nhận (chưa có đơn trong hệ thống; FR-034a, FR-036, User Story 4 kịch bản 10)
export const needsPrescription = (item) =>
  ['CHANGE_DOSE', 'ADD_NEW'].includes(item.decision) ||
  (item.decision === 'CONTINUE' && !!item.source && item.source !== 'CURRENT_PRESCRIPTION')

const WORKING = ['OPEN', 'PENDING_CONFIRMATION']
const newest = (list) => [...list].sort((a, b) => b.id - a.id)[0] ?? null

// Mỗi người có tối đa một phiếu Mở hoặc Chờ xác nhận (FR-035)
export const activeTicket = (list) => newest(list.filter((t) => WORKING.includes(t.status)))

// Phiếu lý do "tiếp nhận" chưa Đã hủy (FR-034a: tối đa một phiếu)
export const admissionTicket = (list) =>
  newest(list.filter((t) => t.reason === 'ADMISSION' && t.status !== 'CANCELLED'))

const blank = (text) => !text?.trim()

// Lỗi theo từng dòng, mỗi dòng một object { tên trường: lời báo }; object rỗng là dòng hợp lệ
export function itemErrors(items) {
  return items.map((item) => {
    const errors = {}
    if (item.source === 'CURRENT_PRESCRIPTION') {
      if (!item.prescriptionId) errors.prescriptionId = 'Chọn đơn thuốc của dòng'
    } else if (blank(item.medicationDescription)) {
      errors.medicationDescription = 'Nhập tên thuốc, hàm lượng, liều'
    }
    if (!item.decision) errors.decision = 'Chọn quyết định'
    else if (item.decision === 'DISCONTINUE' && blank(item.reason)) errors.reason = 'Nhập lý do ngừng'
    else if (needsPrescription(item) && !item.newPrescription)
      errors.newPrescription = 'Lập đơn mới cho dòng này'
    return errors
  })
}

// Thân PUT …/items: chỉ trường ghi được của ReconciliationItem; bỏ đơn mới khi quyết định không tạo đơn
export function itemsBody(items) {
  return items.map((item) => ({
    ...(item.id && { id: item.id }),
    source: item.source,
    ...(item.source === 'CURRENT_PRESCRIPTION'
      ? { prescriptionId: Number(item.prescriptionId) }
      : { medicationDescription: item.medicationDescription.trim() }),
    decision: item.decision,
    ...(!blank(item.reason) && { reason: item.reason.trim() }),
    ...(needsPrescription(item) &&
      item.newPrescription && { newPrescription: item.newPrescription }),
  }))
}
