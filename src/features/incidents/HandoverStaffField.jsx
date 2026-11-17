import { StaffSelectField } from '@/common/StaffSelectField'

// Nhân viên bàn giao khi Chuyển viện (từ sự cố hoặc lựa chọn nguy kịch): lệnh Chuyển viện của 001/004 bắt buộc người bàn
// giao (quickstart 007 Q55, 2026-11-12). Danh sách nhân viên đang làm việc mà người ghi xem được (api-008), như màn ghi đón.
// `valueKey="accountId"` khi lệnh cần mã tài khoản (Giao người xử lý sự cố).
export function HandoverStaffField({ label = 'Nhân viên bàn giao', errorText = 'Chọn nhân viên bàn giao', ...rest }) {
  return <StaffSelectField label={label} errorText={errorText} {...rest} />
}
