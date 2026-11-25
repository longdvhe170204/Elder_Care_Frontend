import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// Ô nhập tiền VND: hiện "1.250.000" kèm "đ" ở cuối, trả lên form chuỗi số thô ("1250000", "-200000" khi cho phép âm)
// để form kiểm và gửi như trước (demo 2026-11-25, chủ dự án yêu cầu định dạng xxx.xxx.xxx đ).

const GROUP = new Intl.NumberFormat('vi-VN')

function moneyDigits(text, allowNegative = false) {
  const negative = allowNegative && String(text).trim().startsWith('-')
  const digits = String(text)
    .replace(/\D/g, '')
    .replace(/^0+(?=\d)/, '')
  return negative ? `-${digits}` : digits
}

function moneyDisplay(raw) {
  if (raw === '' || raw === '-') return raw
  const negative = raw.startsWith('-')
  const digits = raw.replace('-', '')
  if (digits === '') return negative ? '-' : ''
  return `${negative ? '-' : ''}${GROUP.format(BigInt(digits))}`
}

export function MoneyInput({ value, onChange, allowNegative = false, className, ...props }) {
  return (
    // Chữ "đ" vẽ bằng CSS (::after), không là chữ trong trang: ô đặt trong <label> bọc ngoài vẫn có tên đúng
    <div className="relative after:pointer-events-none after:absolute after:inset-y-0 after:right-3 after:flex after:items-center after:text-muted-foreground after:content-['đ']">
      <Input
        inputMode="numeric"
        autoComplete="off"
        className={cn('h-11 pr-8 text-right tabular-nums', className)}
        value={moneyDisplay(value ?? '')}
        onChange={(e) => onChange(moneyDigits(e.target.value, allowNegative))}
        {...props}
      />
    </div>
  )
}
