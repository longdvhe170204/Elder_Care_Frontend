// Số điện thoại Việt Nam (test BF-01 2026-11-26): di động 10 số đầu 03, 05, 07, 08, 09; cố định 11 số đầu 02; được gõ
// +84 thay số 0 và có khoảng trắng, dấu chấm, gạch. Gửi đi dạng chỉ chữ số, đầu 0 (backend nhận 8–15 chữ số).
export const VN_PHONE = /^0(?:[35789]\d{8}|2\d{9})$/

export function normalizePhone(value) {
  const digits = value.replace(/[\s.-]/g, '')
  return digits.startsWith('+84') ? `0${digits.slice(3)}` : digits
}
