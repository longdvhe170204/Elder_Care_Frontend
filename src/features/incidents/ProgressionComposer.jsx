import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// Ô ghi diễn biến luôn mở trong khối Diễn biến (đề xuất 2026-11-24, góp ý demo: nút "Ghi diễn biến" trùng các nút nhóm,
// form chọn nhóm rồi chọn loại rồi gõ quá nhiều bước). Một hàng chọn nhóm, một dòng gõ, một nút Lưu. Nhóm vẫn tách vì
// "Chuyển theo dõi" cần ít nhất một diễn biến Đánh giá và một Xử lý (BR-M05-20): nhóm còn thiếu có chấm cam và được chọn
// sẵn. Trong nhóm, loại thường dùng chọn sẵn; nhóm có nhiều loại thì hiện thêm hàng loại nhỏ. Biện pháp hồi sức chỉ hiện ở
// sự cố Khẩn cấp và phải bấm mở (cần đối chiếu nguyện vọng trước, FR-048a).

export const PROGRESSION_GROUPS = [
  ['EVALUATION', 'Đánh giá', 'VD: tỉnh, đau hông trái, huyết áp 150/90'],
  ['ACTION', 'Xử lý', 'VD: sơ cứu, chườm lạnh, cho nằm nghỉ'],
  ['NOTIFICATION', 'Gọi, báo tin', 'VD: đã gọi con trai lúc 9:20'],
  ['MONITORING', 'Theo dõi', 'VD: đo lại huyết áp sau 30 phút'],
  ['OTHER', 'Khác', 'Ghi rõ việc đã làm'],
]
const KNOWN = ['EVALUATION', 'ACTION', 'NOTIFICATION', 'MONITORING']
const inGroup = (group) => (t) => (group === 'OTHER' ? !KNOWN.includes(t.group) : t.group === group)
const usable = (types) => types.filter((t) => t.status !== 'INACTIVE' && t.group !== 'SYSTEM')
const plainOf = (types, group) =>
  usable(types)
    .filter(inGroup(group))
    .filter((t) => !t.resuscitation)
    .toSorted((a, b) => Number(/^OTHER/.test(a.code ?? '')) - Number(/^OTHER/.test(b.code ?? '')))

export function ProgressionComposer({ types, missing = [], emergency = false, busy = false, onSubmit }) {
  const groups = PROGRESSION_GROUPS.filter(([g]) => usable(types).some(inGroup(g)))
  const firstGroup = groups.find(([g]) => missing.includes(g))?.[0] ?? null
  const [group, setGroup] = useState(firstGroup)
  const [typeId, setTypeId] = useState(() => (firstGroup ? String(plainOf(types, firstGroup)[0]?.id ?? '') : ''))
  const [showResuscitation, setShowResuscitation] = useState(false)
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const plain = group ? plainOf(types, group) : []
  const resuscitation = group && emergency ? usable(types).filter(inGroup(group)).filter((t) => t.resuscitation) : []

  function pickGroup(next) {
    setGroup(next)
    setTypeId(String(plainOf(types, next)[0]?.id ?? ''))
    setShowResuscitation(false)
  }

  async function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    if (!typeId || !text.trim()) return
    const ok = await onSubmit({ progressionTypeId: Number(typeId), content: text.trim() })
    if (ok !== false) {
      setText('')
      setSubmitted(false)
    }
  }

  const chip = (t, danger = false) => (
    <Button
      key={t.id}
      type="button"
      variant="outline"
      aria-pressed={typeId === String(t.id)}
      className={cn(
        'h-9 px-3 type-body-sm',
        typeId === String(t.id) && 'border-2 border-primary bg-accent',
        danger && 'text-destructive',
      )}
      onClick={() => setTypeId(String(t.id))}
    >
      {t.name}
    </Button>
  )

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
      <div role="radiogroup" aria-label="Loại diễn biến" className="flex flex-wrap gap-2">
        {groups.map(([g, label]) => {
          const lacking = missing.includes(g)
          return (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={group === g}
              onClick={() => pickGroup(g)}
              className={cn(
                'inline-flex h-10 items-center gap-2 rounded-full border bg-card px-4 type-label outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                group === g && 'border-2 border-primary bg-accent',
              )}
            >
              {label}
              {lacking && (
                <>
                  <span aria-hidden="true" className="size-2 rounded-full bg-warning-foreground" />
                  <span className="sr-only">(còn thiếu để Chuyển theo dõi)</span>
                </>
              )}
            </button>
          )
        })}
      </div>
      {plain.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Loại cụ thể">
          {plain.map((t) => chip(t))}
        </div>
      )}
      {resuscitation.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            className="h-9 px-2 type-body-sm text-destructive"
            aria-expanded={showResuscitation}
            onClick={() => setShowResuscitation((v) => !v)}
          >
            {showResuscitation ? 'Ẩn cấp cứu hồi sức' : 'Cấp cứu hồi sức (chỉ khi ngừng tim, ngừng thở)'}
          </Button>
          {(showResuscitation || resuscitation.some((t) => String(t.id) === typeId)) &&
            resuscitation.map((t) => chip(t, true))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          aria-label="Nội dung diễn biến"
          className="h-11 flex-1 bg-card"
          maxLength={2000}
          disabled={!group}
          placeholder={group ? PROGRESSION_GROUPS.find(([g]) => g === group)[2] : 'Chọn loại ở trên trước'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" className="h-11" disabled={busy || !group}>
          Lưu diễn biến
        </Button>
      </div>
      {submitted && group && !typeId && <FieldError>Chọn loại cụ thể</FieldError>}
      {submitted && group && typeId && !text.trim() && <FieldError>Nhập nội dung</FieldError>}
    </form>
  )
}
