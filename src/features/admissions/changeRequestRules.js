import { formatDate } from '@/common/dateTime'
import { PERIODS_OF_RESIDENCE } from './admissionLabels'

// Kiểm tra và gợi ý cho form yêu cầu thay đổi lưu trú (004 FR-037 → FR-041) và phần Hành chính xác nhận với người đại diện
// kèm bằng chứng trước khi gửi Quản lý viện duyệt (chủ dự án yêu cầu 2026-11-20; api-004
// ResidencyChangeRepresentativeConfirmation). Hàm thuần, không gọi API; backend vẫn kiểm lại khi lưu, gửi duyệt và duyệt.

export const CONFIRMATION_METHODS = [
  ['IN_PERSON', 'Gặp trực tiếp'],
  ['PHONE', 'Gọi điện'],
  ['MESSAGE', 'Tin nhắn'],
]

// Bằng chứng phù hợp với từng cách xác nhận (backend nhận PDF, JPG, PNG đến 10 MB)
export const EVIDENCE_HINTS = {
  IN_PERSON: 'Bản scan hoặc ảnh chụp giấy xác nhận nội dung thay đổi có chữ ký người đại diện.',
  PHONE: 'Ảnh chụp nhật ký cuộc gọi hoặc biên bản ghi nhận cuộc gọi có chữ ký người gọi.',
  MESSAGE: 'Ảnh chụp tin nhắn (Zalo, SMS, email) người đại diện đồng ý nội dung thay đổi.',
}

export const NOTE_SUGGESTIONS = {
  IN_PERSON: 'Người đại diện đã đọc nội dung thay đổi, ngày hiệu lực và đồng ý tại viện.',
  PHONE: 'Đã gọi điện cho người đại diện; người đại diện đồng ý nội dung thay đổi và ngày hiệu lực.',
  MESSAGE: 'Người đại diện trả lời đồng ý nội dung thay đổi và ngày hiệu lực qua tin nhắn.',
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

export const EVIDENCE_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
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
  BED: 'Loại phòng',
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
      // Q-462: kỳ tính phí sau thay đổi (kỳ mới nếu chọn, không thì kỳ hiện hành) phải hợp loại mới
      const allowed = PERIODS_OF_RESIDENCE[value.residenceType] ?? []
      const period = value.residencyFeeBillingPeriod ?? contract?.residencyFeeBillingPeriod
      if (value.residencyFeeBillingPeriod && !allowed.includes(value.residencyFeeBillingPeriod))
        errors.residencyFeeBillingPeriod = 'Kỳ tính phí này không dùng được cho loại lưu trú mới'
      else if (period && !allowed.includes(period))
        errors.residencyFeeBillingPeriod = 'Chọn kỳ tính phí mới cho loại lưu trú mới'
    }
  }
  if (types.includes('CARE_LEVEL')) {
    if (!value.careLevel) errors.careLevel = 'Chưa có mức theo lần đánh giá lại đã xác nhận'
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
    if (!Number.isInteger(value.newBedId) || value.newBedId <= 0) errors.newBedId = 'Chọn giường mới'
  }
  if (types.includes('SERVICE')) {
    const lines = value.services ?? []
    if (lines.length === 0) errors.services = 'Chọn ít nhất một dịch vụ để thêm hoặc bớt'
    else if (lines.some((s) => !['ADD', 'REMOVE'].includes(s.action)))
      errors.services = 'Chọn Thêm hoặc Bớt cho mỗi dịch vụ'
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
      if (bad >= 0) errors.arrivalSchedule = `Dòng ${bad + 1}: chọn thứ, giờ đến và giờ về; giờ về phải sau giờ đến`
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

// Trạng thái xác nhận với người đại diện của yêu cầu cần xác nhận (FR-043a, FR-043c); null khi không cần xác nhận. done:
// đã đủ để gửi duyệt; attention: cần Hành chính làm tiếp.
export function confirmationState(r) {
  if (!r.representativeConfirmationRequired) return null
  if (r.representativeConfirmation) return { text: 'Đã ghi xác nhận trực tiếp', done: true }
  switch (r.confirmationRequest?.status) {
    case 'ACCEPTED':
      return { text: 'Người đại diện đã đồng ý', done: true }
    case 'AWAITING':
      return { text: 'Chờ người đại diện trả lời', done: false }
    case 'DECLINED':
      return { text: 'Người đại diện không đồng ý', done: false, attention: true }
    default:
      return { text: 'Chưa xác nhận với người đại diện', done: false, attention: true }
  }
}

// Trạng thái phụ lục (004 FR-043d, FR-043f; api-004 Addendum.status)
export const ADDENDUM_STATUS = {
  PENDING_SIGNATURE: 'Chờ ký',
  PENDING_EFFECTIVE: 'Chờ hiệu lực',
  APPLIED: 'Đã áp dụng',
  NOT_APPLICABLE: 'Không áp dụng',
  CANCELLED: 'Đã hủy',
}

// Cảnh báo không chặn của yêu cầu (FR-043h; api-004 ResidencyChangeRequest.warnings). Lỗi 409 dùng mô tả của backend.
export const WARNING_LABELS = {
  RESIDENT_OPINION_MISSING: 'Chưa ghi ý kiến người cao tuổi',
  RESIDENT_OPINION_OUTDATED: 'Ý kiến người cao tuổi ghi trước khi nội dung thay đổi',
}

export const OPINIONS = [
  ['AGREE', 'Đồng ý'],
  ['DISAGREE', 'Không đồng ý'],
  ['UNABLE_TO_EXPRESS', 'Chưa nói được'],
]

export const OPINION_SOURCES = [
  ['RESIDENT', 'Người cao tuổi tự nói'],
  ['STAFF_OBSERVATION', 'Nhân viên ghi nhận'],
]

// Số ngày báo Quản lý viện khi phụ lục chưa ký (CFG-M02-18, mặc định 7 ngày); web chỉ dùng để tô cảnh báo
export const SIGNATURE_OVERDUE_DAYS = 7

// Số phụ lục hai chữ số ("Phụ lục số 02")
export function addendumNoText(no) {
  return no ? `Phụ lục số ${String(no).padStart(2, '0')}` : 'Phụ lục'
}

const DAY = 24 * 60 * 60 * 1000

// Số ngày từ ngày duyệt (yyyy-mm-dd hoặc ISO) tới hôm nay
export function daysSince(dateText, now = new Date()) {
  if (!dateText) return 0
  const start = new Date(`${String(dateText).slice(0, 10)}T00:00:00`)
  const today = new Date(`${isoDate(now)}T00:00:00`)
  return Math.max(0, Math.round((today - start) / DAY))
}

// Trạng thái hiển thị gộp yêu cầu và phụ lục (W10): Đã duyệt mà phụ lục Chờ ký thì "Đã duyệt, chờ ký" tông chú ý (Hành
// chính còn việc phải làm, DESIGN.md 3.5) kèm số ngày; overdue khi quá CFG-M02-18 ngày. tone null: để StatusBadge quyết.
export function displayStatus(r, requestLabels, now = new Date()) {
  const base = requestLabels[r.status] ?? r.status
  if (r.status === 'APPROVED' && r.addendum?.status === 'PENDING_SIGNATURE') {
    const days = daysSince(r.addendum.createdAt, now)
    return { text: `${base}, chờ ký`, tone: 'attention', days, overdue: days >= SIGNATURE_OVERDUE_DAYS }
  }
  return { text: base, tone: null, days: null, overdue: false }
}

// Tiến trình của một yêu cầu theo BF-08 (DESIGN.md 7.2 change-progress). Chỉ đọc trạng thái đã ghi của yêu cầu và phụ lục,
// không tự suy bước chưa có dữ liệu (Q-306, Q-307). Thay đổi nhỏ không cần xác nhận người đại diện và ký phụ lục (Q-338);
// yêu cầu người đại diện tự gửi qua cổng không cần xác nhận thêm (representativeConfirmationRequired = false). Ý kiến người
// cao tuổi không chặn luồng nên không là một bước. Yêu cầu Từ chối, Hủy, Được thay thế không có tiến trình (null).
// state: done, current, todo, failed (Áp dụng không thành).
const STEP_LABELS = {
  draft: 'Lập yêu cầu',
  confirm: 'Xác nhận người đại diện',
  approve: 'Duyệt',
  sign: 'Ký phụ lục',
  apply: 'Áp dụng',
}

export function changeSteps(r) {
  const needsConfirmation = !!r.representativeConfirmationRequired
  const confirmed = !!r.representativeConfirmation || r.confirmationRequest?.status === 'ACCEPTED'
  const needsSignature = !r.minorChange
  const keys = ['draft', needsConfirmation && 'confirm', 'approve', needsSignature && 'sign', 'apply'].filter(Boolean)

  let currentKey
  switch (r.status) {
    case 'DRAFT':
      currentKey = needsConfirmation && !confirmed ? 'confirm' : 'approve'
      break
    case 'PENDING_APPROVAL':
      currentKey = 'approve'
      break
    case 'APPROVED':
      currentKey = needsSignature && r.addendum?.status === 'PENDING_SIGNATURE' ? 'sign' : 'apply'
      break
    case 'APPLY_FAILED':
      currentKey = 'apply'
      break
    case 'APPLIED':
      currentKey = null
      break
    default:
      return null
  }

  const currentIndex = currentKey === null ? keys.length : keys.indexOf(currentKey)
  const steps = keys.map((key, i) => ({
    key,
    label: STEP_LABELS[key],
    state: i < currentIndex ? 'done' : i === currentIndex ? (r.status === 'APPLY_FAILED' ? 'failed' : 'current') : 'todo',
  }))
  return {
    steps,
    total: keys.length,
    position: currentKey === null ? keys.length : currentIndex + 1,
    current: currentKey === null ? null : steps[currentIndex],
  }
}

// Mức của lần đánh giá gần nhất đã xác nhận dùng làm mức mới khi đổi mức chăm sóc (FR-043j); null khi không dùng được
export function assessedLevelFor(assessment, contract) {
  if (!assessment?.careLevel) return null
  if (contract?.careLevel && assessment.careLevel === contract.careLevel) return null
  return assessment.careLevel
}

// Loại thay đổi sau khi chọn loại lưu trú mới (W9): tự tick loại kèm bắt buộc, bỏ loại kèm của lựa chọn trước
export function withCompanions(types, currentType, previousNewType, nextNewType) {
  const before = new Set(requiredCompanions(currentType, previousNewType))
  const after = requiredCompanions(currentType, nextNewType)
  const kept = types.filter((t) => !before.has(t) || after.includes(t))
  return [...kept, ...after.filter((t) => !kept.includes(t))]
}

// Loại dịch vụ thêm được qua loại thay đổi Dịch vụ (FR-043k, Q-426, R21), theo thứ tự hiện trên form
export const REGISTRABLE_SERVICE_GROUPS = [
  ['REHABILITATION', 'Phục hồi chức năng'],
  ['ACTIVITY', 'Hoạt động'],
  ['MEDICAL_ESCORT', 'Đưa đi khám'],
  ['INJECTION', 'Tiêm'],
]

export const SERVICE_CHOICE_HINT =
  'Chỉ đăng ký phục hồi chức năng, hoạt động dài hạn, đưa đi khám, tiêm. Mức chăm sóc đổi ở loại Mức chăm sóc; phí lưu trú đổi ở loại Giường; tã, bỉm, thuốc, suất ăn không đăng ký ở đây.'

// Dịch vụ trên form: dòng đang có trong hợp đồng (mọi loại) để bớt; dịch vụ Hiệu lực chưa có, thuộc 4 loại, để thêm,
// nhóm theo loại. Dòng hợp đồng không còn trong danh mục thì hiện mã.
export function serviceChoices(catalog, contractLines) {
  const byId = new Map((catalog ?? []).map((s) => [s.id, s]))
  const inContract = new Set((contractLines ?? []).map((l) => l.serviceId))
  const removable = (contractLines ?? []).map(
    (l) => byId.get(l.serviceId) ?? { id: l.serviceId, name: `Dịch vụ mã ${l.serviceId}` },
  )
  const addGroups = REGISTRABLE_SERVICE_GROUPS.map(([type, label]) => ({
    type,
    label,
    items: (catalog ?? []).filter((s) => s.type === type && s.status === 'ACTIVE' && !inContract.has(s.id)),
  })).filter((g) => g.items.length > 0)
  return { removable, addGroups }
}
