import { CircleHelp, HeartPulse, PersonStanding, ShieldAlert } from 'lucide-react'

// Lựa chọn của yêu cầu hỗ trợ (api-007 AssistDetails; FR-047i): loại sự việc kèm biểu tượng, nơi chọn nhanh

export const EVENTS = [
  ['FALL', 'Ngã', PersonStanding],
  ['CARDIAC_ARREST_OR_FAINTING', 'Ngừng tim, ngất', HeartPulse],
  ['AGITATION_OR_VIOLENCE', 'Kích động, bạo lực', ShieldAlert],
  ['OTHER', 'Khác', CircleHelp],
]
export const EVENT_LABEL = Object.fromEntries(EVENTS.map(([key, label]) => [key, label]))

// Loại sự cố chọn sẵn khi chuyển yêu cầu hỗ trợ thành sự cố (mã danh mục M05.INCIDENT_TYPE); người chuyển sửa được
export const EVENT_INCIDENT_TYPE = {
  FALL: 'FALL',
  CARDIAC_ARREST_OR_FAINTING: 'BREATHING_OR_CONSCIOUSNESS',
  AGITATION_OR_VIOLENCE: 'BEHAVIOR',
}

export const PLACES = [
  ['ROOM', 'Phòng'],
  ['RESTROOM', 'Nhà vệ sinh'],
  ['CORRIDOR', 'Hành lang'],
  ['COMMON_ROOM', 'Phòng sinh hoạt chung'],
  ['YARD', 'Sân'],
  ['OTHER', 'Nơi khác'],
]
export const PLACE_LABEL = Object.fromEntries(PLACES)
