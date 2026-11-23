import { useEffect, useId, useRef } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { ProblemAlert } from '@/common/ProblemAlert'
import { cn } from '@/lib/utils'
import { IncidentTypeIcon } from './IncidentTypePicker'

// Hồ sơ dài (chi tiết sự cố, cảnh báo nguy kịch) và form ghi nhận mở cả trang; chi tiết cảnh báo ngắn ở khung phải
// (DESIGN.md mục 0, 5.4). Đầu trang là đường dẫn về danh sách, không thêm nút trùng nút "Quay lại" của khung chung. Mở thì
// focus vào trang, về danh sách thì focus trở về nút đã mở (WCAG 2.4.3).
export function CasePage({ label, backLabel, here, onBack, returnFocusId, announcement, className, children }) {
  const ref = useRef(null)
  useEffect(() => {
    ref.current?.focus()
    return () => {
      requestAnimationFrame(() => document.getElementById(returnFocusId)?.focus())
    }
  }, [returnFocusId])

  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-label={label}
      className={cn('mx-auto flex w-full max-w-[1280px] flex-col gap-5 outline-none', className)}
    >
      <nav aria-label="Đường dẫn" className="-my-2 flex min-h-11 items-center gap-2 type-body-sm">
        <Button variant="link" className="h-11 px-0" onClick={onBack}>
          {backLabel}
        </Button>
        {here && (
          <>
            <span aria-hidden="true" className="text-muted-foreground">
              /
            </span>
            <span aria-current="page" className="text-muted-foreground">
              {here}
            </span>
          </>
        )}
      </nav>
      <p role="status" aria-live="polite" className="empty:hidden rounded-xl border bg-card px-4 py-3 type-body-sm">
        {announcement}
      </p>
      {children}
    </section>
  )
}

// Nhãn kèm tên của nó, để mức và trạng thái xử lý không lẫn nhau
export function CaseBadge({ label, children }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="type-caption text-muted-foreground">{label}</span>
      {children}
    </span>
  )
}

// Đầu chi tiết: biểu tượng loại, tên, nhãn mức và trạng thái, dòng phụ bên trái; nút lệnh (nếu có) bên phải. Title là tiêu đề
// của khung phải (h2 hoặc SheetTitle), không truyền thì là tiêu đề trang
export function CaseHeader({ code, title, subtitle, badges, note, actions, Title }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-4">
        <IncidentTypeIcon code={code} className={Title ? 'rounded-lg' : 'size-14 rounded-xl [&_svg]:size-7'} />
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {Title ? (
              <Title className="type-title">{title}</Title>
            ) : (
              <h1 className="type-page text-primary">{title}</h1>
            )}
            {badges}
          </div>
          <p className="type-body-sm text-muted-foreground">{subtitle}</p>
          {note}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

// Tiến trình trạng thái: bước đã qua có dấu tích, bước hiện tại đậm (aria-current), bước sau chữ phụ. Chỉ hiển thị trạng
// thái backend trả, không phải nút bấm. Đã kết thúc thì nơi gọi chỉ truyền bước đầu và bước cuối: API không trả lịch
// sử trạng thái nên không được ghi là đã qua các bước giữa (ví dụ đóng thẳng, không theo dõi).
export function CaseSteps({ steps, current }) {
  return (
    <ol aria-label="Tiến trình" className="flex flex-wrap items-center gap-x-2 gap-y-2 type-body-sm">
      {steps.map((label, i) => {
        const done = i < current || (i === current && i === steps.length - 1)
        return (
          <li
            key={label}
            aria-current={i === current ? 'step' : undefined}
            className={cn(
              'flex items-center gap-2',
              i === current ? 'type-label text-foreground' : 'text-muted-foreground',
            )}
          >
            {i > 0 && <span aria-hidden="true" className="h-px w-6 bg-input sm:w-10" />}
            <span
              aria-hidden="true"
              className={cn(
                'flex size-5 items-center justify-center rounded-full border-2',
                i <= current ? 'border-primary' : 'border-input',
                done && 'bg-primary text-primary-foreground',
              )}
            >
              {done ? (
                <Check className="size-3" />
              ) : (
                i === current && <span className="size-2 rounded-full bg-primary" />
              )}
            </span>
            {label}
            {done && i !== current && <span className="sr-only">, đã qua</span>}
          </li>
        )
      })}
    </ol>
  )
}

// Nút lệnh ở đầu trang
export function CaseAction({ icon: Icon, variant = 'outline', className, children, ...props }) {
  return (
    <Button variant={variant} className={cn('h-11', variant === 'outline' && 'bg-card', className)} {...props}>
      {Icon && <Icon aria-hidden="true" />}
      {children}
    </Button>
  )
}

// Các lệnh đổi trạng thái hiện thành ô có biểu tượng và một dòng nói rõ việc sẽ xảy ra, không giấu trong menu. Mục là false
// (backend không cho lệnh đó) thì bỏ qua; không còn mục nào thì không hiện gì.
export function CaseChoices({ items }) {
  const id = useId()
  const shown = items.filter(Boolean)
  if (shown.length === 0) return null
  return (
    <div className="grid gap-3 @md:grid-cols-2">
      {shown.map(({ icon: Icon, label, hint, primary, disabled, onSelect }, i) => (
        <Button
          key={label}
          type="button"
          variant={primary ? 'default' : 'outline'}
          aria-label={label}
          aria-describedby={hint ? `${id}-${i}` : undefined}
          disabled={disabled}
          className="h-auto min-h-16 items-start justify-start gap-3 rounded-lg px-4 py-3 text-left whitespace-normal"
          onClick={onSelect}
        >
          <Icon aria-hidden="true" className="mt-0.5 size-5" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="type-label">{label}</span>
            {hint && (
              <span
                id={`${id}-${i}`}
                className={cn(
                  'type-body-sm font-normal',
                  primary ? 'text-primary-foreground' : 'text-muted-foreground',
                )}
              >
                {hint}
              </span>
            )}
          </span>
        </Button>
      ))}
    </div>
  )
}

// Khối nội dung có tiêu đề
export function CaseBlock({ title, aside, className, children }) {
  return (
    <Card className={className}>
      <CardContent className="@container flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="type-title">{title}</h2>
          {aside && <span className="type-body-sm text-muted-foreground">{aside}</span>}
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

// Thông tin: nhãn nhỏ trên, giá trị dưới; rows là [nhãn, giá trị, chiếm cả hàng]. Giá trị undefined thì bỏ; giá trị
// rỗng gom thành một dòng "Chưa ghi: ..." ở cuối để ô trống không chiếm chỗ
export function CaseFacts({ rows }) {
  const known = rows.filter(([, value]) => value !== undefined)
  const missing = known.filter(([, value]) => !value).map(([label]) => label.toLowerCase())
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-x-6 gap-y-4 @sm:grid-cols-2">
        {known
          .filter(([, value]) => value)
          .map(([label, value, wide]) => (
            <div key={label} className={cn('flex min-w-0 flex-col gap-0.5', wide && '@sm:col-span-full')}>
              <dt className="type-caption text-muted-foreground">{label}</dt>
              <dd className="type-body break-words tabular-nums">{value}</dd>
            </div>
          ))}
      </dl>
      {missing.length > 0 && <p className="type-body-sm text-muted-foreground">Chưa ghi: {missing.join(', ')}.</p>}
    </div>
  )
}

// Liên kết hai chiều giữa cảnh báo và sự cố
export function CaseLink({ label, text, action, onOpen }) {
  return (
    <section
      aria-label={label}
      className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 type-body-sm"
    >
      <span>{text}</span>
      {onOpen && (
        <Button variant="outline" className="h-11" onClick={onOpen}>
          {action}
        </Button>
      )}
    </section>
  )
}

// Hộp lệnh: tiêu đề, một dòng nói hậu quả, form; lỗi của lệnh hiện ngay trong hộp. wide cho form nhiều ô (Chuyển viện)
export function CaseDialog({ title, description, problem, wide, onClose, children }) {
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        className={cn('max-h-[90vh] overflow-y-auto p-6', wide ? 'sm:max-w-3xl' : 'sm:max-w-xl')}
      >
        <DialogTitle className="type-title">{title}</DialogTitle>
        {description && (
          <DialogDescription className="type-body-sm text-muted-foreground">{description}</DialogDescription>
        )}
        {problem && <ProblemAlert problem={problem} />}
        {children}
      </DialogContent>
    </Dialog>
  )
}

// Khung ghi nhận theo bước: cột trái là các bước kèm câu đã trả lời và nút đổi, cột phải là câu đang trả lời. steps là
// [{ key, label, value, action, onEdit }]; value có thì bước đã trả lời.
export function CaseWizard({ title, subtitle, steps, current, children }) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="type-page text-primary">{title}</h1>
        <p className="text-muted-foreground">{subtitle}</p>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="lg:sticky lg:top-6">
          <CardContent>
            <ol aria-label="Các bước" className="flex flex-col gap-4">
              {steps.map(({ key, label, value, action, onEdit }, i) => (
                <li key={key} aria-current={key === current ? 'step' : undefined} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-full border-2 type-label tabular-nums',
                      value ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                      key === current && 'border-primary',
                    )}
                  >
                    {value ? <Check className="size-4" /> : i + 1}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
                    <span className={key === current ? 'type-label' : 'type-body-sm text-muted-foreground'}>
                      {label}
                    </span>
                    {value && <span className="flex min-w-0 items-center gap-2 type-label">{value}</span>}
                    {value && onEdit && (
                      <Button type="button" variant="outline" className="mt-1 h-11 self-start" onClick={onEdit}>
                        {action}
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
        <div className="flex min-w-0 flex-col gap-4">{children}</div>
      </div>
    </>
  )
}

// Tiêu đề của phần vừa mở: focus chuyển tới đây để bàn phím, trình đọc màn hình không bị mất chỗ
export function FocusHeading({ step, children }) {
  const ref = useRef(null)
  useEffect(() => {
    ref.current?.focus()
  }, [step])
  return (
    <h2 ref={ref} tabIndex={-1} className="type-title outline-none">
      {children}
    </h2>
  )
}
