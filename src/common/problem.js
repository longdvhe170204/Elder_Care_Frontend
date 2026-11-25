import { ApiError } from '@/api'

// Lỗi lệnh theo Problem Details (RFC 9457, research R-03 của 000; 000 T099). Backend đặt `title` là tên mã HTTP
// tiếng Anh, nội dung tiếng Việt nằm ở `detail`; màn hiển thị tiêu đề theo mã trạng thái (NFR-11, DESIGN.md 8).

const TITLES = {
  0: 'Không kết nối được máy chủ',
  400: 'Yêu cầu không hợp lệ',
  401: 'Phiên đăng nhập đã hết',
  403: 'Không có quyền thực hiện',
  404: 'Không tìm thấy',
  409: 'Chưa thực hiện được',
  412: 'Dữ liệu đã thay đổi',
  422: 'Giá trị không hợp lệ',
}

const DEFAULT_DETAILS = {
  0: 'Kiểm tra kết nối mạng rồi thử lại.',
  401: 'Đăng nhập lại để tiếp tục.',
  412: 'Người khác vừa lưu thay đổi. Xem giá trị mới rồi thực hiện lại.',
  500: 'Thử lại sau ít phút. Nếu vẫn lỗi, báo cho quản trị hệ thống.',
}

const CODE_DETAILS = {
  DAY_CARE_CAPACITY_UNSET:
    'Viện chưa thiết lập sức chứa khu nghỉ bán trú. Vui lòng cấu hình tham số sức chứa trước khi duyệt yêu cầu bán trú.',
  DAY_CARE_NOT_CONFIGURED: 'Chưa có khu nghỉ bán trú nào đang ở trạng thái Hiệu lực.',
  DAY_CARE_CAPACITY_CHECK_UNAVAILABLE:
    'Chưa kiểm tra được sức chứa khu nghỉ bán trú; chưa thể ghi nhận thay đổi.',
  CONTRACT_NOT_ACTIVE: 'Yêu cầu điều chỉnh hợp đồng cần hợp đồng đang trong trạng thái Hiệu lực.',
  EFFECTIVE_DATE_BEFORE_CONTRACT_START:
    'Ngày hiệu lực mong muốn không được sớm hơn ngày bắt đầu của hợp đồng gốc.',
  DUPLICATE_PENDING_ATTRIBUTE:
    'Đã có yêu cầu khác được duyệt và đang chờ tới ngày hiệu lực với cùng nội dung thay đổi này.',
  CONFIRMATION_REQUIRED:
    'Cần ghi nhận xác nhận của người đại diện (hoặc đính kèm bằng chứng xác nhận) trước khi gửi Quản lý viện duyệt.',
  CONFIRMATION_NOT_REQUIRED:
    'Yêu cầu này không cần xác nhận với người đại diện (thay đổi nhỏ hoặc người đại diện tự gửi qua ứng dụng).',
  REQUEST_NOT_DRAFT: 'Chỉ gửi người đại diện xác nhận khi yêu cầu còn ở trạng thái Nháp.',
  NO_REPRESENTATIVE: 'Người cao tuổi chưa có người đại diện hợp pháp trên hệ thống để gửi xác nhận.',
  CONFIRMER_NOT_REPRESENTATIVE:
    'Người được chọn phải là người đại diện hợp pháp của người cao tuổi vào ngày xác nhận.',
  SIGNER_NOT_REPRESENTATIVE: 'Người ký phải là người đại diện hợp pháp của người cao tuổi vào ngày ký.',
  SIGNED_DATE_INVALID: 'Ngày ký phải từ ngày duyệt đến hôm nay.',
  FACILITY_SIGNATORY_INVALID: 'Người ký phía viện phải là nhân viên đang làm việc.',
  ADDENDUM_NOT_PENDING_SIGNATURE:
    'Phụ lục không ở trạng thái Chờ ký; chỉ ghi nhận bản đã ký một lần sau khi yêu cầu được duyệt.',
  SAME_ROOM_TYPE:
    'Giường mới cùng loại phòng với hợp đồng hiện hành. Vui lòng dùng chức năng Chuyển giường trực tiếp thay vì lập yêu cầu điều chỉnh hợp đồng.',
  CARE_LEVEL_NOT_FROM_ASSESSMENT:
    'Chưa có lần đánh giá lại đã xác nhận ra mức chăm sóc khác mức của hợp đồng; Bác sĩ cần đánh giá lại trước khi lập yêu cầu đổi mức.',
  RESIDENT_DISAGREE_REASON_REQUIRED:
    'Người cao tuổi không đồng ý với thay đổi này; vui lòng nhập lý do để Quản lý viện xem xét khi duyệt.',
  FILE_STORAGE_ERROR: 'Không thể kết nối hoặc tải lên nơi lưu trữ tệp tin. Vui lòng thử lại sau.',
}

function humanizeText(text) {
  if (!text || typeof text !== 'string') return text
  if (text.includes('CFG-M03-01')) {
    return CODE_DETAILS.DAY_CARE_CAPACITY_UNSET
  }
  return text.replace(/\s*\((?:FR-[^)]+|Q-[^)]+|CFG-[^)]+|DBR-[^)]+|feature\s+[^)]+)\)/gi, '').trim()
}

export function problemOf(error) {
  const status = error instanceof ApiError ? error.status : 0
  const body = (error instanceof ApiError && error.problem) || {}
  const group = status >= 500 ? 500 : status
  const code = body.errorCode ?? null
  const rawDetail = body.detail || (code ? CODE_DETAILS[code] : null) || DEFAULT_DETAILS[group] || ''
  const detail = humanizeText(rawDetail)
  const unmet = (body.unmetConditions ?? []).map((c) => ({
    ...c,
    description: humanizeText(c.description),
  }))

  return {
    status,
    errorCode: code,
    title: TITLES[group] ?? (group === 500 ? 'Máy chủ gặp lỗi' : 'Không thực hiện được'),
    detail,
    unmetConditions: unmet,
    currentValue: body.currentValue,
  }
}
