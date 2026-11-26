import { useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Input } from '@/components/ui/input'

// Ô chọn nhanh `choice-tray` (DESIGN.md 7.2; chủ dự án chọn phương án B, 2026-11-21): ô hiện các mục đã chọn thành thẻ;
// bấm vào ô thì khay nút lựa chọn mở ngay dưới ô (không có lớp nổi), "Khác" mở ô gõ tự do; Xong, Esc hoặc bấm ra ngoài thì
// gập. Giá trị là chữ ghép bằng "; " ở trường hiện có, không đổi API. Danh sách giống nhau cho mọi người cao tuổi, không chọn
// sẵn, không xếp hạng (Q-307, chủ dự án xác nhận 2026-11-21).

const SEPARATOR = '; '

const split = (value) =>
  (value ?? '')
    .split(/;\s*/)
    .map((v) => v.trim())
    .filter(Boolean)

export function ChoiceTray({ id, label, options, multiple = false, value, onChange, invalid = false, placeholder }) {
  const [open, setOpen] = useState(false)
  const [otherOpen, setOtherOpen] = useState(false)
  const [otherText, setOtherText] = useState('')
  const root = useRef(null)
  const trigger = useRef(null)
  const items = split(value)
  const custom = items.filter((v) => !options.includes(v))
  const labelId = `${id}-label`
  const trayId = `${id}-tray`

  function emit(next) {
    onChange(next.join(SEPARATOR))
  }

  function close() {
    setOpen(false)
    setOtherOpen(false)
    setOtherText('')
    trigger.current?.focus()
  }

  function choose(next) {
    if (multiple) {
      emit([...next.filter((v) => options.includes(v)), ...custom])
      return
    }
    const picked = next.find((v) => !items.includes(v))
    emit(picked ? [picked] : [])
    if (picked) close()
  }

  function addOther() {
    const text = otherText.trim()
    if (!text) return
    emit(multiple ? [...items.filter((v) => v !== text), text] : [text])
    setOtherText('')
    if (multiple) setOtherOpen(false)
    else close()
  }

  return (
    <div
      ref={root}
      className="flex flex-col gap-2"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation()
          close()
        }
      }}
      onBlur={(e) => {
        if (open && !root.current?.contains(e.relatedTarget)) {
          setOpen(false)
          setOtherOpen(false)
        }
      }}
    >
      <span id={labelId} className="type-label">
        {label}
      </span>
      <div
        className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-[10px] border border-input bg-popover px-2 py-1.5 aria-invalid:border-destructive"
        aria-invalid={invalid || undefined}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(true)
        }}
      >
        {items.map((item) => (
          <span
            key={item}
            className="type-body-sm inline-flex items-center gap-1 rounded-full bg-accent py-0.5 pr-0.5 pl-2.5 text-accent-foreground"
          >
            {item}
            <button
              type="button"
              className="grid size-6 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Bỏ ${item}`}
              onClick={() => emit(items.filter((v) => v !== item))}
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </span>
        ))}
        <button
          ref={trigger}
          id={id}
          type="button"
          aria-labelledby={labelId}
          aria-expanded={open}
          aria-controls={trayId}
          className="type-body-sm inline-flex min-h-8 flex-1 items-center justify-between gap-2 rounded-md px-1.5 text-left text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => (open ? close() : setOpen(true))}
        >
          <span>
            {/* Đã chọn mục thì không ghi "Chọn thêm", "Đổi" (chủ dự án bỏ 2026-11-26), chỉ còn mũi tên mở khay */}
            {items.length === 0 ? (placeholder ?? (multiple ? 'Chọn một hoặc nhiều mục' : 'Chọn')) : ''}
          </span>
          <ChevronDown className="size-4" aria-hidden="true" />
        </button>
      </div>
      {open && (
        <div id={trayId} className="flex flex-col gap-3 rounded-[10px] border bg-muted p-3">
          <div className="flex flex-wrap gap-2">
            <ToggleGroup
              multiple
              variant="outline"
              aria-labelledby={labelId}
              value={items.filter((v) => options.includes(v))}
              onValueChange={choose}
              className="contents"
            >
              {options.map((option) => (
                <ToggleGroupItem key={option} value={option} className="h-11 rounded-full bg-popover px-3.5">
                  {option}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Toggle
              variant="outline"
              pressed={otherOpen || custom.length > 0}
              onPressedChange={() => setOtherOpen(true)}
              className="h-11 rounded-full bg-popover px-3.5"
            >
              Khác
            </Toggle>
          </div>
          {otherOpen && (
            <Input
              autoFocus
              className="h-11"
              aria-label={`Nội dung khác của ${label}`}
              placeholder="Gõ nội dung khác rồi nhấn Enter"
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addOther()
                }
              }}
            />
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="type-caption text-muted-foreground">
              {multiple ? 'Bấm lại để bỏ chọn.' : 'Chọn một mục.'}
            </span>
            <Button type="button" variant="outline" onClick={close}>
              Xong
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
