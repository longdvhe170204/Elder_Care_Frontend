export const PLAN_STATUS = {
  DRAFT: 'Nháp',
  PENDING_APPROVAL: 'Chờ duyệt',
  PENDING_EFFECT: 'Chờ hiệu lực',
  EFFECTIVE: 'Hiệu lực',
  EXPIRED: 'Hết hiệu lực',
  CANCELLED: 'Đã hủy',
}
export const FREQUENCIES = {
  TIMES_PER_DAY: 'Số lần trong ngày',
  EVERY_N_HOURS: 'Mỗi N giờ',
  DAYS_OF_WEEK: 'Theo ngày trong tuần',
  ONCE_PER_SHIFT: 'Một lần mỗi ca',
}
export const IMPORTANCE = { NORMAL: 'Thường', IMPORTANT: 'Quan trọng', MANDATORY: 'Bắt buộc' }
export const CARE_ROLES = {
  CAREGIVER: 'Nhân viên chăm sóc',
  NURSING_STAFF: 'Điều dưỡng',
  DOCTOR: 'Bác sĩ',
  FLOOR_MANAGER: 'Trưởng tầng',
  NURSING_HOME_MANAGER: 'Quản lý viện',
  KITCHEN_STAFF: 'Nhân viên bếp',
  OFFICE_STAFF: 'Hành chính',
  ACCOUNTANT: 'Kế toán',
  FAMILY_MEMBER: 'Người thân',
  RESIDENT: 'Người cao tuổi',
  SCHEDULER: 'Bộ lập lịch',
}
export const RESULT_TYPES = {
  EATING: 'Ăn uống',
  ML: 'Lượng ml',
  MEASURED_VALUE: 'Giá trị đo',
  MOVEMENT: 'Vận động',
  SLEEP: 'Giấc ngủ',
  MOOD: 'Tâm trạng',
  BEHAVIOR: 'Hành vi',
  ITEM_QUANTITY: 'Số lượng vật phẩm',
  PERFORMED: 'Đã thực hiện',
  NONE: 'Không ghi kết quả',
}
export const TASK_GROUPS = {
  PERSONAL_HYGIENE: 'Vệ sinh cá nhân',
  BATHING: 'Tắm',
  DRESSING: 'Thay quần áo',
  EATING_ASSISTANCE: 'Hỗ trợ ăn',
  DRINKING_ASSISTANCE: 'Hỗ trợ uống nước',
  TOILETING_ASSISTANCE: 'Hỗ trợ đi vệ sinh',
  MOVEMENT: 'Vận động',
  REHABILITATION: 'Phục hồi',
  VITAL_SIGN_MEASUREMENT: 'Đo chỉ số',
  ACTIVITY: 'Hoạt động',
  SLEEP: 'Ngủ',
  MOOD: 'Tâm trạng',
  BEHAVIOR: 'Hành vi',
  DIAPER_ITEM_CHANGE: 'Thay tã, vật phẩm',
  SHIFT_START_CHECK: 'Kiểm tra đầu ca',
  SUPERVISION: 'Giám sát',
  MEDICATION: 'Uống thuốc',
  OTHER: 'Khác',
}

// Q-447: giao diện không hiện phiên bản; chỉ còn kế hoạch hiện hành, bản đã duyệt chờ áp dụng và bản sửa đang xử lý.
export function planState(plans) {
  const find = (...statuses) => (plans ?? []).find((plan) => statuses.includes(plan.status)) ?? null
  return {
    current: find('EFFECTIVE'),
    scheduled: find('PENDING_EFFECT'),
    open: find('DRAFT', 'PENDING_APPROVAL'),
  }
}

// Nhãn trạng thái hiển thị; hasPlan: người cao tuổi đã có kế hoạch Hiệu lực hoặc đã duyệt chờ áp dụng.
export function planLabel(plan, hasPlan) {
  if (plan.status === 'DRAFT') return hasPlan ? 'Bản sửa đang soạn' : 'Đang soạn'
  if (plan.status === 'PENDING_APPROVAL') return 'Chờ Bác sĩ duyệt'
  if (plan.status === 'PENDING_EFFECT') {
    const [, month, day] = /^\d{4}-(\d{2})-(\d{2})$/.exec(plan.effectiveFrom ?? '') ?? []
    return day ? `Đã duyệt, áp dụng từ ${day}/${month}` : 'Đã duyệt, chờ áp dụng'
  }
  return PLAN_STATUS[plan.status] ?? plan.status
}
