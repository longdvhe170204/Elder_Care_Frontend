import { useState } from 'react'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

// Ô gõ tên có danh sách gợi ý (demo 2026-11-25): gõ vài chữ là lọc, bấm một dòng để điền; vẫn gõ tự do được khi người
// cần ghi không có trong danh sách. Danh sách vẽ bằng kiểu của app, không dùng datalist (popup của trình duyệt khác kiểu).
const MAX_SHOWN = 8

export function SuggestField({ id, label, value, onChange, options, error, hint, placeholder = 'Gõ tên để tìm' }) {
  const [open, setOpen] = useState(false)
  const query = (value ?? '').trim().toLowerCase()
  const shown = options.filter((o) => !query || o.toLowerCase().includes(query)).slice(0, MAX_SHOWN)
  const listId = `${id}-options`

  function pick(option) {
    onChange(option)
    setOpen(false)
  }

  return (
    <Field data-invalid={!!error || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <Input
          id={id}
          role="combobox"
          aria-expanded={open && shown.length > 0}
          aria-controls={listId}
          autoComplete="off"
          className="h-11"
          placeholder={placeholder}
          value={value}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
          }}
          aria-invalid={!!error || undefined}
        />
        {open && shown.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-input bg-popover p-1 shadow-md"
          >
            {shown.map((o) => (
              <li key={o} role="option" aria-selected={o === value}>
                <button
                  type="button"
                  className="w-full rounded-sm px-2 py-2 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pick(o)
                  }}
                >
                  {o}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error ? <FieldError>{error}</FieldError> : hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  )
}
