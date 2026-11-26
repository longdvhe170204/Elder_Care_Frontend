import { useState } from 'react'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

// Ô chọn người cao tuổi dùng chung (demo 2026-11-26, E): gõ tên hoặc mã hồ sơ, danh sách hiện ngay bên dưới (cùng kiểu ô
// Người đề nghị, SuggestField), bấm một dòng để chọn. Tìm không phân biệt hoa thường, có dấu hay không dấu. Giá trị là mã
// người cao tuổi dạng chuỗi như ô select cũ; gõ sửa sau khi đã chọn thì bỏ lựa chọn.
const MAX_SHOWN = 10

const plain = (text) =>
  (text ?? '').normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()

export function ResidentCombobox({
  id,
  label = 'Người cao tuổi',
  options,
  value,
  onChange,
  error,
  hint,
  loading = false,
  disabled = false,
  placeholder = 'Gõ tên hoặc mã hồ sơ để tìm',
}) {
  const [query, setQuery] = useState(null)
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === String(value ?? ''))
  const text = query ?? selected?.label ?? ''
  const wanted = plain(query ?? '').trim()
  const matches = options.filter((o) => !wanted || plain(o.label).includes(wanted))
  const shown = matches.slice(0, MAX_SHOWN)
  const listId = `${id}-options`

  function pick(option) {
    onChange(option.value)
    setQuery(null)
    setOpen(false)
  }

  return (
    <Field data-invalid={!!error || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <Input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          className="h-11"
          disabled={disabled}
          placeholder={loading ? 'Đang tải…' : placeholder}
          value={text}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setOpen(false)
            setQuery(null)
          }}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            if (value) onChange('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
            if (e.key === 'Enter' && open && shown.length > 0) {
              e.preventDefault()
              pick(shown[0])
            }
          }}
          aria-invalid={!!error || undefined}
        />
        {open && !loading && (
          <ul
            id={listId}
            role="listbox"
            aria-label={`Kết quả tìm ${label.toLowerCase()}`}
            className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border border-input bg-popover p-1 shadow-md"
          >
            {shown.map((o) => (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === String(value ?? '')}
                className="cursor-pointer rounded-sm px-2 py-2 text-sm hover:bg-muted"
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(o)
                }}
              >
                {o.label}
              </li>
            ))}
            {shown.length === 0 && (
              <li className="px-2 py-2 text-sm text-muted-foreground">Không tìm thấy người cao tuổi phù hợp.</li>
            )}
            {matches.length > MAX_SHOWN && (
              <li className="px-2 py-1 text-xs text-muted-foreground">
                {`Còn ${matches.length - MAX_SHOWN} người nữa, gõ thêm để thu hẹp.`}
              </li>
            )}
          </ul>
        )}
      </div>
      {error ? <FieldError>{error}</FieldError> : hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  )
}
