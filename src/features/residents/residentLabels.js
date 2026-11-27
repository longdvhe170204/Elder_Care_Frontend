// Nhãn tiếng Việt cho mã trạng thái, giới tính, loại giấy tờ của hồ sơ người cao tuổi (hợp đồng api-001).

export const STATUS_LABELS = {
  ADMISSION_IN_PROGRESS: 'Đang tiếp nhận',
  IN_RESIDENCE: 'Đang lưu trú',
  TEMPORARILY_ABSENT: 'Tạm vắng',
  OFF_SITE_ACTIVITY: 'Đi hoạt động ngoài viện',
  HOSPITALIZED: 'Điều trị tại bệnh viện',
  RESIDENCY_ENDED: 'Kết thúc lưu trú',
  DECEASED: 'Qua đời',
  ADMISSION_CANCELLED: 'Hủy tiếp nhận',
}

export const GENDER_LABELS = { MALE: 'Nam', FEMALE: 'Nữ' }

// Tuổi tròn theo ngày sinh yyyy-mm-dd (đầu khung Việc tiếp nhận, phiếu đánh giá)
export function ageOf(dateOfBirth) {
  if (!dateOfBirth) return null
  const [y, m, d] = dateOfBirth.split('-').map(Number)
  const now = new Date()
  const before = now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)
  return now.getFullYear() - y - (before ? 1 : 0)
}

// Dòng phụ của người cao tuổi: "Nam, 81 tuổi · Đang tiếp nhận"
export function residentLine(profile) {
  if (!profile) return ''
  const info = profile.personalInfo ?? {}
  const age = ageOf(info.dateOfBirth)
  const who = [GENDER_LABELS[info.gender], age !== null && `${age} tuổi`].filter(Boolean).join(', ')
  return [who, STATUS_LABELS[profile.status]].filter(Boolean).join(' · ')
}

export const ID_DOCUMENT_LABELS = { CITIZEN_ID: 'CCCD', OTHER: 'Giấy tờ khác' }

// Vai trò được tạo hồ sơ (Phụ lục 27, dòng "Hồ sơ người cao tuổi": Hành chính; Quản lý viện thay khi cần)
export const PROFILE_CREATORS = ['OFFICE_STAFF']
