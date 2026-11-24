// Nhãn tiếng Việt cho lệnh trạng thái người cao tuổi (001 US4; hợp đồng api-001, schema UserCommand).

export const COMMAND_LABELS = {
  COMPLETE_ADMISSION: 'Hoàn tất tiếp nhận',
  CANCEL_ADMISSION: 'Hủy tiếp nhận',
  GRANT_TEMPORARY_ABSENCE: 'Cho tạm vắng',
  RECORD_RETURN: 'Ghi nhận trở về',
  TRANSFER_OUT: 'Chuyển viện',
  END_RESIDENCY: 'Kết thúc lưu trú',
  RECORD_DEATH: 'Ghi nhận qua đời',
}

// Tên lệnh trong lịch sử, gồm cả lệnh do hệ thống ghi (điểm danh của chuyến đi, 014) và Tạo hồ sơ
export const HISTORY_COMMAND_LABELS = {
  ...COMMAND_LABELS,
  CREATE_PROFILE: 'tạo hồ sơ',
  ROLL_CALL_DEPARTURE: 'điểm danh rời viện',
  ROLL_CALL_RETURN: 'điểm danh về',
  CANCEL_DEPARTURE_RECORD: 'hủy ghi nhận rời viện',
}

// Thứ tự nút: lệnh thường dùng trước, lệnh kết thúc sau cùng
export const COMMAND_ORDER = [
  'COMPLETE_ADMISSION',
  'GRANT_TEMPORARY_ABSENCE',
  'RECORD_RETURN',
  'TRANSFER_OUT',
  'CANCEL_ADMISSION',
  'END_RESIDENCY',
  'RECORD_DEATH',
]

// Câu nêu tác động trước khi bấm xác nhận (research H-02 mục 4)
export const COMMAND_EFFECTS = {
  COMPLETE_ADMISSION: 'Người cao tuổi chuyển sang Đang lưu trú; lịch chăm sóc, thuốc, suất ăn tính từ lúc này.',
  CANCEL_ADMISSION: 'Hồ sơ chuyển sang Hủy tiếp nhận và chỉ còn xem được.',
  GRANT_TEMPORARY_ABSENCE: 'Người cao tuổi chuyển sang Tạm vắng; công việc, suất ăn, liều thuốc trong thời gian vắng được xử lý.',
  RECORD_RETURN: 'Người cao tuổi trở lại Đang lưu trú.',
  TRANSFER_OUT: 'Người cao tuổi chuyển sang Điều trị tại bệnh viện; người liên hệ chính được báo ở mức Khẩn cấp.',
  END_RESIDENCY: 'Hồ sơ chuyển sang Kết thúc lưu trú và chỉ còn xem được; lịch tương lai bị hủy, giường được giải phóng.',
  RECORD_DEATH: 'Hồ sơ chuyển sang Qua đời và chỉ còn xem được; người liên hệ chính được báo ở mức Khẩn cấp.',
}

// Trở về từ bệnh viện có thêm tác động riêng (5.6, BR-M07-09, BR-M01-02); sự cố chuyển viện được ghi lúc về
const HOSPITAL_RETURN_EFFECT =
  'Người cao tuổi trở lại Đang lưu trú. Thuốc cũ vẫn tạm dừng tới khi phiếu đối chiếu thuốc được xác nhận; Điều dưỡng, Bác sĩ được báo lập phiếu đối chiếu, Bác sĩ được báo cần đánh giá lại; sự cố đã chuyển viện được ghi lúc về.'

export function commandEffect(command, status) {
  if (command === 'RECORD_RETURN' && status === 'HOSPITALIZED') return HOSPITAL_RETURN_EFFECT
  return COMMAND_EFFECTS[command]
}

// Nhãn ô lý do theo từng lệnh, thay cho "Lý do của lệnh" chung (góp ý test demo 2026-11-23). Trường gửi đi vẫn là reason.
const REASON_FIELD = {
  COMPLETE_ADMISSION: { label: 'Ghi chú khi hoàn tất tiếp nhận' },
  CANCEL_ADMISSION: { label: 'Lý do hủy tiếp nhận' },
  GRANT_TEMPORARY_ABSENCE: { label: 'Lý do tạm vắng' },
  RECORD_RETURN: { label: 'Ghi chú khi về', placeholder: 'Ví dụ: Con gái đưa về lúc 17:00, cụ khỏe' },
  TRANSFER_OUT: { label: 'Lý do chuyển viện' },
  END_RESIDENCY: { label: 'Lý do kết thúc lưu trú' },
  RECORD_DEATH: { label: 'Ghi chú khi ghi nhận qua đời' },
}
const HOSPITAL_RETURN_FIELD = {
  label: 'Tình trạng khi về (kết luận của bệnh viện)',
  placeholder: 'Ví dụ: Chụp phim không gãy xương, bầm hông trái, kê thuốc giảm đau 5 ngày',
}

export function reasonField(command, status) {
  const field = command === 'RECORD_RETURN' && status === 'HOSPITALIZED' ? HOSPITAL_RETURN_FIELD : REASON_FIELD[command]
  const label = field?.label ?? 'Lý do của lệnh'
  return { label: `${label} (bắt buộc)`, placeholder: field?.placeholder, error: `Nhập ${label.toLowerCase()}` }
}

export const FINAL_STATUSES = ['RESIDENCY_ENDED', 'DECEASED', 'ADMISSION_CANCELLED']

export const BASIS_KINDS = [
  { value: 'incidentId', label: 'Sự cố', hint: 'Mã sự cố', numeric: true },
  { value: 'doctorOrder', label: 'Chỉ định của Bác sĩ', hint: 'Nội dung chỉ định' },
  { value: 'externalInfo', label: 'Thông tin gia đình, cơ sở y tế', hint: 'Nội dung thông tin' },
]
