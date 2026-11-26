// Nhãn tiếng Việt của yêu cầu phê duyệt (000 T097; data-model mục 3; glossary mục 6.2).

export const STATUS_LABELS = {
  DRAFT: 'Nháp',
  PENDING_APPROVAL: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  APPLIED: 'Đã áp dụng',
  APPLY_FAILED: 'Áp dụng không thành',
  REJECTED: 'Từ chối',
  CANCELLED: 'Đã hủy',
}

// Loại yêu cầu do module sở hữu đăng ký; module sau thêm nhãn ở đây khi có loại mới
export const TYPE_LABELS = {
  'M15.CORRECTION': 'Đính chính',
  'M02.RESIDENCY_CHANGE': 'Điều chỉnh hợp đồng',
  'M12.UNCLAIMED_BELONGING_DISPOSAL': 'Xử lý đồ không người nhận',
  // Demo 2026-11-26 (E): đủ nhãn cho các loại backend đăng ký, không hiện mã loại
  'M02.CONTRACT_TERMS_APPROVAL': 'Duyệt điều khoản hợp đồng',
  'M02.ENDING_EXCEPTION': 'Ngoại lệ kết thúc lưu trú',
  'M03.ASSET_DISPOSAL': 'Thanh lý tài sản',
  'M03.NHAP_BU_PHAN_BO': 'Nhập bù phân bổ giường',
  'M09.LEAVE_REQUEST': 'Nghỉ đột xuất',
  'M09.SHIFT_SWAP': 'Đổi ca',
  'M15.RESIDENT_ACCOUNT_LOCK': 'Khóa tài khoản người cao tuổi',
  'M11.BALANCE_TRANSACTION': 'Giao dịch số dư',
}

// Giao dịch số dư ghi đúng loại giao dịch trong nội dung yêu cầu (api-017)
const BALANCE_TRANSACTION_LABELS = {
  REFUND: 'Hoàn số dư',
  DEPOSIT_REFUND: 'Hoàn tiền cọc',
  ADJUSTMENT: 'Điều chỉnh số dư',
}

export const ACTION_LABELS = {
  REQUEST_CREATED: 'Lập yêu cầu',
  REQUEST_DRAFT_EDITED: 'Sửa nháp',
  REQUEST_SUBMITTED: 'Gửi duyệt',
  REQUEST_APPROVED: 'Duyệt',
  REQUEST_REJECTED: 'Từ chối',
  REQUEST_CANCELLED: 'Hủy',
  REQUEST_APPLIED: 'Áp dụng',
  REQUEST_APPLY_FAILED: 'Áp dụng không thành',
  REQUEST_APPLY_ERROR: 'Lỗi khi áp dụng, sẽ thử lại',
  REQUEST_REMINDED: 'Nhắc người duyệt',
  REQUEST_ESCALATED: 'Báo Quản lý viện',
  REQUEST_EXTENDED_TRANSITION: 'Chuyển trạng thái riêng của loại yêu cầu',
  REQUEST_CLOSED_FOR_FINAL_STATE: 'Đóng vì bản ghi liên quan đã kết thúc',
  REQUEST_RETURNED_TO_DRAFT: 'Trả về nháp',
  REQUEST_EFFECTIVE_DATE_POSTPONED: 'Dời ngày hiệu lực',
}

export function statusLabel(status) {
  return STATUS_LABELS[status] ?? status
}

export function typeLabel(type, content) {
  if (type === 'M11.BALANCE_TRANSACTION' && BALANCE_TRANSACTION_LABELS[content?.type])
    return BALANCE_TRANSACTION_LABELS[content.type]
  return TYPE_LABELS[type] ?? type
}

export function actorLabel(actor) {
  if (!actor) return ''
  if (actor.type === 'SCHEDULER') return 'Bộ lập lịch hệ thống'
  return actor.fullName ?? `Tài khoản ${actor.id}`
}
