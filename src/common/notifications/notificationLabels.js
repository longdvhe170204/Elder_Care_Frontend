// Nhãn tiếng Việt dùng chung cho hộp thông báo của nhân viên và cổng người thân (api-009; glossary mục 15.3; DESIGN.md
// 3.5). Giá trị chưa có nhãn hiện nguyên mã để không đoán nghĩa.

export const LEVEL_LABELS = { URGENT: 'Khẩn cấp', MEDIUM: 'Trung bình', LOW: 'Nhẹ' }

export const STATUS_LABELS = {
  HELD_FOR_QUIET_HOURS: 'Chờ hết giờ yên tĩnh',
  NOT_SENT: 'Không gửi',
  SENT: 'Đã gửi',
  DELIVERY_FAILED: 'Gửi thất bại',
  VIEWED: 'Đã xem',
  ACKNOWLEDGED: 'Đã xác nhận',
  UNREACHABLE: 'Không liên lạc được',
}

export const PART_LABELS = {
  GENERAL: 'Phần chung',
  HEALTH: 'Phần sức khỏe',
  COSTS: 'Chi phí',
  VISITS: 'Thăm',
  CONTRACT: 'Hợp đồng',
}

export const label = (labels, value) => (value ? (labels[value] ?? value) : '')
