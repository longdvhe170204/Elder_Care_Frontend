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

// Giờ (HH:MM) có nằm trong ca không, tính cả ca qua đêm
export function inShift(shift, time) {
  const at = new Date(plannedAtOf(shift, time)).getTime()
  return at >= new Date(shift.startsAt).getTime() && at < new Date(shift.endsAt).getTime()
}

// Đối chiếu loại công việc và giờ người lập đã nhập với nguồn của người cao tuổi (FR-017, FR-023). Không điền thay
// người lập (Q-307): chỉ trả mục kế hoạch cùng loại có đúng giờ đó, các nguồn khác có đúng giờ đó, và các mục kế hoạch
// cùng loại kèm giờ của mục nằm trong ca để báo khi chưa khớp.
export function matchBasis(resident, shift, taskTypeId, time) {
  const items = (resident?.planItems ?? [])
    .filter((i) => String(i.taskTypeId) === String(taskTypeId))
    .map((item) => ({ item, times: (item.times ?? []).map((t) => t.slice(0, 5)).filter((t) => inShift(shift, t)) }))
  const plan = time ? items.find((i) => i.times.includes(time))?.item : undefined
  const sources = time && !plan ? (resident?.otherSources ?? []).filter((s) => timeOf(s.at) === time) : []
  return { items, plan, sources }
}
