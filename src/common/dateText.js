// Ô ngày nhập dạng DD/MM/YYYY dùng chung cho các form: ô ngày của trình duyệt hiện theo ngôn ngữ máy (có máy ra
// mm/dd/yyyy). Dời ra từ form Tạo hồ sơ người cao tuổi (2026-11-26), dùng ở form Lập đăng ký tiếp nhận.

const DATE_TEXT = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/

// Hôm nay theo giờ Việt Nam, dạng yyyy-mm-dd (so chuỗi với isoDate)
export const todayIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' })

// dd/mm/yyyy → yyyy-mm-dd; ngày không có thật thì null
export function isoDate(text) {
  const match = DATE_TEXT.exec(text.trim())
  if (!match) return null
  const [, d, m, y] = match.map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
export const displayDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '')

// Gõ số thì tự chèn "/" và tự thêm số 0 (chủ dự án yêu cầu 2026-11-26): ngày bắt đầu bằng 4–9, tháng bắt đầu bằng
// 2–9 thì đã đủ một phần, thêm 0 rồi sang phần sau; 1221945 → 12/02/1945, 14031948 → 14/03/1948. Gõ "/" sau một chữ số
// cũng thêm 0 (1/3 → 01/03/). Khi xóa lùi thì không chèn lại "/" để xóa được. Không tự chuyển ô (DESIGN.md 9.4)
export function maskDate(value, previous) {
  const growing = value.length > previous.length
  const parts = value.split('/')
  const digits = parts
    .map((part, index) => {
      const d = part.replace(/\D/g, '')
      return index < Math.min(parts.length - 1, 2) && d.length === 1 ? `0${d}` : d
    })
    .join('')
  let i = 0
  const take = (firstMax) => {
    if (i >= digits.length) return ''
    const first = digits[i++]
    if (Number(first) > firstMax) return `0${first}`
    return i < digits.length ? first + digits[i++] : first
  }
  const day = take(3)
  const month = take(1)
  const year = digits.slice(i, i + 4)
  let text = day
  if (day.length === 2 && (month || growing)) text += '/'
  text += month
  if (month.length === 2 && (year || growing)) text += '/'
  return text + year
}
