// Nhãn và hàm giờ dùng chung cho màn Lập công việc ca và hai modal của màn
export const BASIS = {
  CARE_PLAN_ITEM: 'Mục kế hoạch',
  MEASUREMENT: 'Lần đo',
  MEAL: 'Bữa ăn',
  ACTIVITY_SESSION: 'Buổi hoạt động',
  POST_FALL_MONITORING: 'Theo dõi sau ngã',
  CONTACT_MONITORING: 'Theo dõi tiếp xúc',
  WATER_INTAKE_ALERT: 'Cảnh báo uống nước',
  SHIFT_START_CHECK: 'Kiểm tra đầu ca',
  SUPERVISION: 'Giám sát',
  AD_HOC: 'Phát sinh',
}

export const STATUSES = {
  NOT_YET_DUE: 'Chưa đến hạn',
  DUE: 'Đến hạn',
  OVERDUE: 'Quá hạn',
  COMPLETED: 'Hoàn thành',
  COMPLETED_LATE: 'Hoàn thành trễ',
  NOT_PERFORMED: 'Không thực hiện',
  CANCELLED: 'Đã hủy',
}

// Mã lỗi theo dòng của lệnh lập lô (api-005) và trường bị lỗi trong dòng
export const ERRORS = {
  RESIDENT_NOT_STAYING: ['resident', 'Người cao tuổi không đang lưu trú.'],
  RESIDENT_ABSENT: ['resident', 'Người cao tuổi đang vắng mặt.'],
  DAY_CARE_NOT_PRESENT: ['resident', 'Người bán trú chưa có mặt trong khoảng này.'],
  OUTSIDE_SHIFT: ['time', null],
  PLAN_ITEM_MISMATCH: ['time', 'Thời điểm, khung hoặc mức chưa khớp mục kế hoạch.'],
  INVALID_BASIS: ['basis', 'Căn cứ chưa hợp lệ hoặc nguồn chưa xác nhận.'],
  MEDICATION_IS_NOT_A_TASK: ['basis', 'Liều thuốc không được lập thành công việc.'],
  INVALID_PERFORMER: ['performer', 'Người thực hiện hoặc lựa chọn công việc chung chưa hợp lệ.'],
  MISSING_CERTIFICATE: ['performer', 'Người thực hiện chưa đủ chứng chỉ.'],
  DUPLICATE_BASIS: ['basis', 'Trùng căn cứ và thời điểm dự kiến.'],
  OLD_REVISION_WINDOW_OVERLAP: ['basis', 'Trùng khung công việc của phiên bản trước.'],
  SHIFT_CHECK_ALREADY_EXISTS: ['basis', 'Điều dưỡng đã có công việc này trong ca.'],
}

const ZONE = 'Asia/Ho_Chi_Minh'
// Ngày (YYYY-MM-DD) và giờ (HH:MM) theo giờ Việt Nam
export const dateOf = (value) => new Date(value).toLocaleDateString('sv-SE', { timeZone: ZONE })
export const timeOf = (value) =>
  new Date(value).toLocaleTimeString('en-GB', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' })
export const nextDate = (date) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
export const formatDate = (date) => date.split('-').reverse().join('/')
export const shiftLabel = (shift) => `Ca ${timeOf(shift.startsAt)}–${timeOf(shift.endsAt)}`

// Giờ dự kiến trong ca: giờ nhỏ hơn giờ bắt đầu của ca qua đêm thuộc ngày hôm sau
export function plannedAtOf(shift, time) {
  const start = dateOf(shift.startsAt)
  const date = time < timeOf(shift.startsAt) ? nextDate(start) : start
  return `${date}T${time}:00+07:00`
}

export const pad = (n) => String(n).padStart(2, '0')
