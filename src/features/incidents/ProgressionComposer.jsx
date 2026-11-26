import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// Ô ghi diễn biến luôn mở (đề xuất 2026-11-25, góp ý demo: quá nhiều nhóm và loại): một ô gõ, hai nút "Lưu đánh giá" và
// "Lưu xử lý" vì "Chuyển theo dõi" cần ít nhất một diễn biến Đánh giá và một Xử lý (BR-M05-20); dòng trạng thái nói còn
// thiếu gì. Loại khác (theo dõi, khác, biện pháp hồi sức chỉ ở sự cố Khẩn cấp, FR-048a) gấp trong "Loại khác". Gọi báo tin
// người nhà đã nằm ở khối Báo người nhà nên không còn là một nhóm ở đây.

const PROGRESSION_GROUPS = [
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
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [more, setMore] = useState(false)
  const [group, setGroup] = useState(null)
  const [typeId, setTypeId] = useState('')
  const [showResuscitation, setShowResuscitation] = useState(false)

  const quick = { EVALUATION: plainOf(types, 'EVALUATION')[0], ACTION: plainOf(types, 'ACTION')[0] }
  const otherGroups = PROGRESSION_GROUPS.filter(([g]) => g !== 'NOTIFICATION' && usable(types).some(inGroup(g)))
  const plain = group ? plainOf(types, group) : []
  const resuscitation = group && emergency ? usable(types).filter(inGroup(group)).filter((t) => t.resuscitation) : []

  function pickGroup(next) {
    setGroup(next)
    setTypeId(String(plainOf(types, next)[0]?.id ?? ''))
    setShowResuscitation(false)
  }

  async function save(id) {
    setSubmitted(true)
    if (!id || !text.trim()) return
    const ok = await onSubmit({ progressionTypeId: Number(id), content: text.trim() })
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

  const lack = missing.map((g) => (g === 'EVALUATION' ? 'đánh giá' : g === 'ACTION' ? 'xử lý' : null)).filter(Boolean)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save(more ? typeId : null)
      }}
      noValidate
      className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3"
    >
      <p className="type-body-sm text-muted-foreground">
        {lack.length > 0 ? `Còn thiếu để Chuyển theo dõi: ${lack.join(', ')}.` : 'Đủ điều kiện Chuyển theo dõi.'}
      </p>
      <Input
        aria-label="Nội dung diễn biến"
        className="h-11 bg-card"
        maxLength={2000}
        placeholder="Gõ việc vừa thấy hoặc vừa làm, VD: tỉnh, đau hông trái; sơ cứu, chườm lạnh"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {!more && (
        <div className="flex flex-wrap gap-2">
          {[
            ['EVALUATION', 'Lưu đánh giá'],
            ['ACTION', 'Lưu xử lý'],
          ].map(([g, label]) => (
            <Button
              key={g}
              type="button"
              variant={missing.includes(g) ? 'default' : 'outline'}
              className="h-11"
              disabled={busy || !quick[g]}
              onClick={() => save(quick[g]?.id)}
            >
              {label}
            </Button>
          ))}
          {otherGroups.length > 0 && (
            <Button type="button" variant="ghost" className="h-11" onClick={() => setMore(true)}>
              Loại khác
            </Button>
          )}
        </div>
      )}
      {more && (
        <div className="flex flex-col gap-2">
          <div role="radiogroup" aria-label="Loại diễn biến" className="flex flex-wrap gap-2">
            {otherGroups.map(([g, label]) => (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={group === g}
                onClick={() => pickGroup(g)}
                className={cn(
                  'inline-flex h-10 items-center rounded-full border bg-card px-4 type-label outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  group === g && 'border-2 border-primary bg-accent',
                )}
              >
                {label}
              </button>
            ))}
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
            <Button type="submit" className="h-11" disabled={busy || !typeId}>
              Lưu diễn biến
            </Button>
            <Button type="button" variant="ghost" className="h-11" onClick={() => setMore(false)}>
              Quay lại
            </Button>
          </div>
        </div>
      )}
      {submitted && !text.trim() && <FieldError>Nhập nội dung</FieldError>}
    </form>
  )
}
