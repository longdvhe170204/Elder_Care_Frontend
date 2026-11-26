import { Combobox } from '@base-ui/react/combobox'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from 'cn'

// Ô chọn một giá trị có tìm kiếm (Combobox của Base UI): gõ để lọc danh sách, chọn bằng chuột hoặc phím mũi tên, Enter;
// Esc đóng danh sách. Cách lọc: chữ gõ phải khớp phần đầu của một chữ trong tên ("ha" ra Hà Nội, Hải Phòng, không ra
// Thái Nguyên); không phân biệt hoa thường; gõ không dấu thì bỏ qua dấu ("ba dinh" ra "Phường Ba Đình"), gõ có dấu thì
// so đúng dấu ("hả" chỉ ra Hải Phòng). options: [{ value, label, search? }]; `search` là chữ dùng để lọc khi khác
// `label` (ví dụ bỏ tiền tố "Tỉnh", "Phường"). value, onChange theo `value` (chuỗi), không chọn là ''. Dùng đầu tiên
// ở Tạo hồ sơ người cao tuổi (Tỉnh/Thành phố, Phường/Xã, 2026-11-26).

const lower = (text) => text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()
const fold = (text) => lower(text).normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd')

function matches(item, query) {
  const typed = lower(query)
  if (!typed) return true
  const plain = fold(typed) === typed
  const target = plain ? fold(item.search ?? item.label) : lower(item.search ?? item.label)
  return target.startsWith(typed) || target.includes(` ${typed}`)
}

export function SearchSelect({
  id,
  options,
  value,
  onChange,
  placeholder,
  emptyText = 'Không có kết quả phù hợp',
  disabled = false,
  invalid = false,
  className,
  ...inputProps
}) {
  const selected = options.find((o) => o.value === value) ?? null
  return (
    <Combobox.Root
      items={options}
      value={selected}
      onValueChange={(item) => onChange(item?.value ?? '')}
      isItemEqualToValue={(a, b) => a.value === b.value}
      filter={matches}
      disabled={disabled}
      autoHighlight
    >
      <Combobox.InputGroup
        className={cn(
          'relative flex h-11 w-full items-center rounded-lg border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-[input:disabled]:cursor-not-allowed has-[input:disabled]:bg-input/50 has-[input:disabled]:opacity-50 dark:bg-input/30',
          invalid && 'border-destructive ring-3 ring-destructive/20',
          className,
        )}
      >
        <Combobox.Input
          id={id}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          className="h-full w-full min-w-0 bg-transparent pr-10 pl-2.5 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed md:text-sm"
          {...inputProps}
        />
        <Combobox.Trigger
          aria-label="Mở danh sách"
          className="absolute right-1 flex size-9 items-center justify-center rounded-md text-muted-foreground disabled:cursor-not-allowed"
        >
          <ChevronDown aria-hidden="true" className="size-4" />
        </Combobox.Trigger>
      </Combobox.InputGroup>
      <Combobox.Portal>
        <Combobox.Positioner className="z-[60] outline-none" sideOffset={4}>
          <Combobox.Popup className="w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) rounded-lg bg-popover text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 transition-[scale,opacity] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none">
            <Combobox.Empty className="px-3 py-3 text-muted-foreground empty:hidden">{emptyText}</Combobox.Empty>
            <Combobox.List className="max-h-[min(20rem,var(--available-height))] scroll-py-1 overflow-y-auto overscroll-contain p-1 outline-none data-empty:p-0">
              {(item) => (
                <Combobox.Item
                  key={item.value}
                  value={item}
                  className="grid min-h-10 cursor-default grid-cols-[1rem_1fr] items-center gap-2 rounded-md px-2 py-2 outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <Combobox.ItemIndicator className="col-start-1">
                    <Check aria-hidden="true" className="size-4" />
                  </Combobox.ItemIndicator>
                  <span className="col-start-2">{item.label}</span>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
