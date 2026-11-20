import { formatDate } from '@/common/dateTime'

// Kiểm tra và gợi ý cho form yêu cầu thay đổi lưu trú (004 FR-037 → FR-041) và phần Hành chính xác nhận với người đại diện
// kèm bằng chứng trước khi gửi Quản lý viện duyệt (chủ dự án yêu cầu 2026-11-20; api-004
// ResidencyChangeRepresentativeConfirmation). Hàm thuần, không gọi API; backend vẫn kiểm lại khi lưu, gửi duyệt và duyệt.

export const CONFIRMATION_METHODS = [
  ['IN_PERSON', 'Gặp trực tiếp, ký phụ lục'],
  ['PHONE', 'Gọi điện'],
  ['MESSAGE', 'Tin nhắn'],
]

// Bằng chứng phù hợp với từng cách xác nhận (backend nhận PDF, JPG, PNG đến 10 MB)
export const EVIDENCE_HINTS = {
  IN_PERSON: 'Bản scan hoặc ảnh chụp phụ lục có chữ ký người đại diện.',
  PHONE: 'Ảnh chụp nhật ký cuộc gọi hoặc biên bản ghi nhận cuộc gọi có chữ ký người gọi.',
  MESSAGE: 'Ảnh chụp tin nhắn (Zalo, SMS, email) người đại diện đồng ý nội dung thay đổi.',
}

export const NOTE_SUGGESTIONS = {
  IN_PERSON: 'Người đại diện đã đọc nội dung thay đổi, ngày hiệu lực và ký phụ lục tại viện.',
  PHONE: 'Đã gọi điện cho người đại diện; người đại diện đồng ý nội dung thay đổi và ngày hiệu lực.',
  MESSAGE: 'Người đại diện trả lời đồng ý nội dung thay đổi và ngày hiệu lực qua tin nhắn.',
}

// Gợi ý lý do theo loại thay đổi đầu tiên được chọn
export const REASON_SUGGESTIONS = {
  CARE_LEVEL: 'Theo kết quả đánh giá lại của Bác sĩ',
  RESIDENCE_TYPE: 'Gia đình đề nghị đổi loại lưu trú',
  SERVICE: 'Gia đình đề nghị thay đổi dịch vụ đăng ký',
  DURATION: 'Gia đình đề nghị thay đổi thời hạn lưu trú',
  BED: 'Chuyển giường theo đề nghị của gia đình',
  ARRIVAL_SCHEDULE: 'Gia đình đề nghị đổi lịch đến bán trú',
}

// dayOfWeek của backend: 1 là thứ Hai, 7 là Chủ nhật
export const WEEKDAYS = [
  [1, 'Thứ Hai'],
  [2, 'Thứ Ba'],
  [3, 'Thứ Tư'],
  [4, 'Thứ Năm'],
  [5, 'Thứ Sáu'],
  [6, 'Thứ Bảy'],
  [7, 'Chủ nhật'],
]

export const EVIDENCE_TYPES =['application/pdf', 'image/jpeg', 'image/png']
export const EVIDENCE_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png'
export const NOTE_MAX = 500
const MAX_FILE_BYTES = 10 * 1024 * 1024

// Ngày theo giờ máy, dạng yyyy-mm-dd
export function isoDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function tomorrowIso(now = new Date()) {
  const next = new Date(now)
  next.setDate(next.getDate() + 1)
  return isoDate(next)
}

// Loại thay đổi phải chọn kèm khi đổi loại lưu trú (FR-041): sang bán trú cần lịch đến, bán trú sang nội trú cần giường,
// sang nội trú ngắn ngày cần thời hạn
export function requiredCompanions(currentType, newType) {
  if (!newType) return []
  const needed = []
  if (newType === 'DAY_CARE') needed.push('ARRIVAL_SCHEDULE')
  if (currentType === 'DAY_CARE' && newType !== 'DAY_CARE') needed.push('BED')
  if (newType === 'SHORT_TERM_RESIDENTIAL') needed.push('DURATION')
  return needed
}

const COMPANION_TEXT = {
  ARRIVAL_SCHEDULE: 'Lịch đến',
  BED: 'Giường',
  DURATION: 'Thời hạn',
}

// Lỗi theo ô của phần nội dung thay đổi; contract là hợp đồng đang chọn (có thể chưa biết, ví dụ Bác sĩ)
export function validateChange({ types, value, date, contract }) {
  const errors = {}
  if (types.length === 0) errors.types = 'Chọn ít nhất một loại thay đổi'
  if (!date) errors.date = 'Nhập ngày hiệu lực mong muốn'
  else if (contract?.startDate && date < contract.startDate)
    errors.date = `Ngày hiệu lực không được sớm hơn ngày bắt đầu hợp đồng (${formatDate(contract.startDate)})`

  if (types.includes('RESIDENCE_TYPE')) {
    if (!value.residenceType) errors.residenceType = 'Chọn loại lưu trú mới'
    else if (contract?.residenceType && value.residenceType === contract.residenceType)
      errors.residenceType = 'Loại lưu trú mới trùng loại hiện tại của hợp đồng'
    else {
      const missing = requiredCompanions(contract?.residenceType, value.residenceType).filter((t) => !types.includes(t))
      if (missing.length > 0)
        errors.residenceType = `Đổi sang loại này cần chọn thêm loại thay đổi: ${missing.map((t) => COMPANION_TEXT[t]).join(', ')}`
    }
  }
  if (types.includes('CARE_LEVEL')) {
    if (!value.careLevel) errors.careLevel = 'Chọn mức chăm sóc mới'
    else if (contract?.careLevel && value.careLevel === contract.careLevel)
      errors.careLevel = 'Mức chăm sóc mới trùng mức hiện tại của hợp đồng'
  }
  if (types.includes('DURATION')) {
    if (!value.endDate) errors.endDate = 'Nhập ngày kết thúc mới'
    else if (date && value.endDate < date) errors.endDate = 'Ngày kết thúc mới phải từ ngày hiệu lực trở đi'
    else if (contract?.startDate && value.endDate <= contract.startDate)
      errors.endDate = 'Ngày kết thúc mới phải sau ngày bắt đầu hợp đồng'
  }
  if (types.includes('BED')) {
    if (!Number.isInteger(value.newBedId) || value.newBedId <= 0) errors.newBedId = 'Nhập mã giường mới (số nguyên dương)'
  }
  if (types.includes('SERVICE')) {
    const lines = value.services ?? []
    if (lines.length === 0) errors.services = 'Chọn ít nhất một dịch vụ để thêm hoặc bớt'
    else if (lines.some((s) => !['ADD', 'REMOVE'].includes(s.action))) errors.services = 'Chọn Thêm hoặc Bớt cho mỗi dịch vụ'
  }
  if (types.includes('ARRIVAL_SCHEDULE')) {
    const rows = value.arrivalSchedule ?? []
    if (rows.length === 0) errors.arrivalSchedule = 'Thêm ít nhất một dòng lịch đến'
    else {
      const bad = rows.findIndex(
        (r) =>
          !Number.isInteger(r.dayOfWeek) ||
          r.dayOfWeek < 1 ||
          r.dayOfWeek > 7 ||
          !r.arrivalTime ||
          !r.departureTime ||
          r.departureTime <= r.arrivalTime,
      )
      if (bad >= 0)
        errors.arrivalSchedule = `Dòng ${bad + 1}: chọn thứ, giờ đến và giờ về; giờ về phải sau giờ đến`
    }
  }
  return errors
}

// Lỗi theo ô của phần xác nhận với người đại diện; existingFileId là bằng chứng đã đính kèm trước đó
export function validateConfirmation({ method, confirmedOn, file, existingFileId, note }, today = isoDate()) {
  const errors = {}
  if (!method) errors.method = 'Chọn cách xác nhận với người đại diện'
  if (!confirmedOn) errors.confirmedOn = 'Nhập ngày xác nhận'
  else if (confirmedOn > today) errors.confirmedOn = 'Ngày xác nhận không được sau hôm nay'
  if (file) {
    if (!EVIDENCE_TYPES.includes(file.type)) errors.evidence = 'Bằng chứng phải là tệp PDF, JPG hoặc PNG'
    else if (file.size > MAX_FILE_BYTES) errors.evidence = 'Tệp bằng chứng quá 10 MB'
  } else if (!existingFileId) errors.evidence = 'Đính kèm bằng chứng xác nhận'
  if ((note ?? '').length > NOTE_MAX) errors.note = `Ghi chú tối đa ${NOTE_MAX} ký tự`
  return errors
}
