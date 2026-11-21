import { useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  getResidentsByIdInitialAssessmentFamilyDeclared,
  putResidentsByIdInitialAssessmentFamilyDeclared,
} from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ProblemAlert } from '@/common/ProblemAlert'
import { problemOf } from '@/common/problem'
import { FAMILY_DECLARED_TOPIC_LABELS } from './assessmentLabels'

// Phần "Gia đình khai" của lần đánh giá đầu vào (001 T116; Q-412, FR-025a; US3 #9, #10). Hành chính ghi theo lời người cao
// tuổi hoặc gia đình khi người cao tuổi còn Đang tiếp nhận, mỗi mục có chủ đề và nguồn; không thấy nhận xét, mức của Bác
// sĩ. Bác sĩ, Điều dưỡng thấy phần này chỉ đọc trong màn đánh giá. Mục luôn mang nhãn tự khai.

const SELF_REPORT_LABEL = 'Tự khai, chưa được Bác sĩ kiểm chứng'
const POSITIVE_INTEGER = /^[1-9]\d{0,17}$/

function sourceText(source) {
  return source.type === 'FAMILY_MEMBER' ? `Người thân (mã ${source.familyMemberId})` : 'Người cao tuổi'
}

const entryKey = (e) => [e.topic, e.content, e.source.type, e.source.familyMemberId ?? null]

function EntryItems({ entries, onRemove }) {
  return (
    <ul aria-label="Các mục gia đình khai" className="flex flex-col gap-2">
      {entries.map((entry, index) => (
        <li key={index} className="flex flex-col gap-1 rounded-lg border p-3">
          <span className="type-label">{FAMILY_DECLARED_TOPIC_LABELS[entry.topic]}</span>
          <span className="type-body-sm">{entry.content}</span>
          <span className="type-caption text-muted-foreground">
            Nguồn: {sourceText(entry.source)}
            {entry.recordedBy && ` · ghi bởi ${entry.recordedBy}`}
          </span>
          {onRemove && (
            <Button type="button" variant="outline" className="h-10 self-start" onClick={() => onRemove(index)}>
              Bỏ mục
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}

// Chỉ đọc, cho Bác sĩ, Điều dưỡng trong màn đánh giá
export function FamilyDeclaredList({ entries }) {
  if (!entries?.length) return null
  return (
    <section
      aria-labelledby="family-declared-title"
      className="flex flex-col gap-2 rounded-lg border border-dashed p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h4 id="family-declared-title" className="type-label">
          Gia đình khai
        </h4>
        <Badge variant="attention">{SELF_REPORT_LABEL}</Badge>
      </div>
      <EntryItems entries={entries} />
    </section>
  )
}

// Hành chính ghi phần "Gia đình khai": thay toàn bộ danh sách mục mỗi lần lưu
export function FamilyDeclaredEditor({ residentId }) {
  const [state, setState] = useState('loading')
  const [saved, setSaved] = useState([])
  const [items, setItems] = useState([])
  const [topic, setTopic] = useState('GENERAL_CONDITION')
  const [content, setContent] = useState('')
  const [sourceType, setSourceType] = useState('RESIDENT')
  const [memberId, setMemberId] = useState('')
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)

  const load = useCallback(async () => {
    try {
      const { data } = await getResidentsByIdInitialAssessmentFamilyDeclared({ path: { id: residentId } })
      setSaved(data.entries)
      setItems(data.entries)
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) setFailure(problemOf(error))
      setSaved([])
      setItems([])
    }
    setState('ready')
  }, [residentId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nạp phần Gia đình khai khi mở
    load()
  }, [load])

  function add() {
    const next = {}
    if (!content.trim()) next.content = 'Nhập nội dung'
    if (sourceType === 'FAMILY_MEMBER' && !POSITIVE_INTEGER.test(memberId.trim())) next.memberId = 'Nhập mã người thân'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    const source =
      sourceType === 'FAMILY_MEMBER'
        ? { type: 'FAMILY_MEMBER', familyMemberId: Number(memberId.trim()) }
        : { type: 'RESIDENT' }
    setItems((current) => [...current, { topic, content: content.trim(), source }])
    setContent('')
    setDone(null)
  }

  async function save() {
    setFailure(null)
    // Nội dung đang nhập chưa thêm vào danh sách thì không lưu, tránh báo "Đã lưu" mà mục chưa có (F7)
    if (content.trim()) {
      setErrors((current) => ({
        ...current,
        content: 'Nội dung đang nhập chưa được thêm. Bấm Thêm mục hoặc xóa nội dung.',
      }))
      setDone(null)
      return
    }
    if (JSON.stringify(items.map(entryKey)) === JSON.stringify(saved.map(entryKey))) {
      setDone('Chưa có thay đổi để lưu.')
      return
    }
    setBusy(true)
    try {
      const { data } = await putResidentsByIdInitialAssessmentFamilyDeclared({
        path: { id: residentId },
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: {
          entries: items.map((e) => ({
            topic: e.topic,
            content: e.content,
            source:
              e.source.type === 'FAMILY_MEMBER'
                ? { type: 'FAMILY_MEMBER', familyMemberId: e.source.familyMemberId }
                : { type: 'RESIDENT' },
          })),
        },
      })
      setSaved(data.entries)
      setItems(data.entries)
      setDone('Đã lưu phần Gia đình khai. Bác sĩ sẽ xem khi đánh giá đầu vào.')
    } catch (error) {
      setFailure(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="family-declared-editor-title" className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="family-declared-editor-title" className="type-card-title">
          Gia đình khai
        </h3>
        {saved.length > 0 && <Badge variant="attention">{SELF_REPORT_LABEL}</Badge>}
      </div>
      <p className="type-body-sm text-muted-foreground">
        Ghi điều người cao tuổi hoặc gia đình kể về sức khỏe để Bác sĩ tham khảo khi đánh giá đầu vào. Bác sĩ ghi nhận
        xét, chọn mức chăm sóc và xác nhận; phần này giữ nguyên trong lần đánh giá.
      </p>
      {state === 'loading' ? (
        <div aria-busy="true">
          <span className="sr-only">Đang tải phần Gia đình khai</span>
          <Skeleton className="h-16" />
        </div>
      ) : (
        <>
          {items.length === 0 ? (
            <p className="type-body-sm text-muted-foreground">Chưa có thông tin gia đình khai.</p>
          ) : (
            <EntryItems
              entries={items}
              onRemove={(index) => setItems((current) => current.filter((_, i) => i !== index))}
            />
          )}

          <fieldset className="flex flex-col gap-3 rounded-lg border p-3">
            <legend className="type-label px-1">Thêm mục</legend>
            <Field>
              <FieldLabel htmlFor="family-declared-topic">Chủ đề</FieldLabel>
              <select
                id="family-declared-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-transparent px-3"
              >
                {Object.entries(FAMILY_DECLARED_TOPIC_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field data-invalid={!!errors.content || undefined}>
              <FieldLabel htmlFor="family-declared-content">Nội dung</FieldLabel>
              <Textarea
                id="family-declared-content"
                rows={2}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                aria-invalid={!!errors.content || undefined}
              />
              {errors.content && <FieldError>{errors.content}</FieldError>}
            </Field>
            <Field>
              <span className="type-label" id="family-declared-source">
                Nguồn
              </span>
              <div role="radiogroup" aria-labelledby="family-declared-source" className="flex flex-wrap gap-2">
                {[
                  ['RESIDENT', 'Người cao tuổi'],
                  ['FAMILY_MEMBER', 'Người thân'],
                ].map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={sourceType === value}
                    variant={sourceType === value ? 'default' : 'outline'}
                    className="h-10"
                    onClick={() => setSourceType(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </Field>
            {sourceType === 'FAMILY_MEMBER' && (
              <Field data-invalid={!!errors.memberId || undefined}>
                <FieldLabel htmlFor="family-declared-member">Mã người thân</FieldLabel>
                <Input
                  id="family-declared-member"
                  inputMode="numeric"
                  value={memberId}
                  onChange={(e) => setMemberId(e.target.value)}
                  aria-invalid={!!errors.memberId || undefined}
                />
                {errors.memberId && <FieldError>{errors.memberId}</FieldError>}
              </Field>
            )}
            <Button type="button" variant="outline" className="h-10 self-start" onClick={add}>
              Thêm mục
            </Button>
          </fieldset>

          <ProblemAlert problem={failure} />
          {done && (
            <p role="status" className="type-body-sm rounded-lg border bg-muted/30 p-3">
              {done}
            </p>
          )}
          <Button type="button" className="h-11 self-start" disabled={busy} onClick={save}>
            Lưu Gia đình khai
          </Button>
        </>
      )}
    </section>
  )
}
