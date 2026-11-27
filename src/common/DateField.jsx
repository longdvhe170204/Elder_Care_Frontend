import { useRef } from 'react'
import { CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { displayDate, isoDate, maskDate } from './dateText'

// Ô ngày DD/MM/YYYY có nút lịch (chủ dự án yêu cầu 2026-11-26, form Lập đăng ký tiếp nhận). Gõ tay vẫn được (tự chèn
// "/", thêm số 0, dateText.js). Nút lịch mở bảng chọn ngày của trình duyệt qua một ô date ẩn (không thêm thư viện lịch);
// chọn xong ghi lại dạng DD/MM/YYYY. Ô không tự điền sẵn (Q-307).
// value: chữ DD/MM/YYYY; onChange(text). min, max: yyyy-mm-dd, giới hạn ngày trong bảng chọn (kiểm thật ở form).
export function DateField({ id, value, onChange, min, max, invalid = false, ...inputProps }) {
  const picker = useRef(null)

  function openPicker() {
    const input = picker.current
    if (!input) return
    input.value = isoDate(value) ?? ''
    if (typeof input.showPicker === 'function') input.showPicker()
    else input.click()
  }

  return (
    <div className="relative sm:max-w-xs">
      <Input
        id={id}
        inputMode="numeric"
        placeholder="DD/MM/YYYY"
        maxLength={10}
        autoComplete="off"
        className="h-11 pr-11 tabular-nums"
        value={value}
        onChange={(event) => onChange(maskDate(event.target.value, value))}
        aria-invalid={invalid || undefined}
        {...inputProps}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute top-1 right-1 size-9 text-muted-foreground"
        aria-label="Chọn ngày trên lịch"
        // mở bảng chọn ngày; aria-haspopup cũng tắt hiệu ứng nhún khi bấm của Button (chủ dự án yêu cầu 2026-11-27)
        aria-haspopup="dialog"
        onClick={openPicker}
      >
        <CalendarDays aria-hidden="true" />
      </Button>
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        min={min}
        max={max}
        className="pointer-events-none absolute right-0 bottom-0 size-px opacity-0"
        onChange={(event) => event.target.value && onChange(displayDate(event.target.value))}
      />
    </div>
  )
}
