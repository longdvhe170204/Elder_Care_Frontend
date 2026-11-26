import { useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  getResidentsByIdInitialAssessmentFamilyDeclared,
  putResidentsByIdInitialAssessmentFamilyDeclared,
} from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { ChoiceTray } from '@/common/ChoiceTray'
import { FamilyMemberField } from '@/common/FamilyMemberField'
import { ProblemAlert } from '@/common/ProblemAlert'
import { useFamilyMembers } from '@/common/useFamilyMembers'
import { FAMILY_DECLARED_CHOICES } from '@/common/quickChoices'
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

// Hành chính ghi phần "Gia đình khai" dạng bảng theo chủ đề (nhóm A BF-01 phương án B, chủ dự án chọn 2026-11-21): năm
// chủ đề là năm khối cố định, mỗi khối một hoặc nhiều dòng (mỗi dòng một nguồn) có ô chọn nhanh và nguồn; lưu một lần,
// chỉ gửi dòng có nội dung. Lệnh vẫn thay toàn bộ danh sách mục (api-001, không đổi API).
let rowSeq = 0
const emptyRow = (topic) => ({ key: ++rowSeq, topic, content: '', sourceType: 'RESIDENT', memberId: '' })

function rowsOf(entries) {
  return Object.keys(FAMILY_DECLARED_TOPIC_LABELS).flatMap((topic) => {
    const own = entries.filter((e) => e.topic === topic)
    if (own.length === 0) return [emptyRow(topic)]
    return own.map((e) => ({
      key: ++rowSeq,
      topic,
      content: e.content,
      sourceType: e.source.type,
      memberId: e.source.familyMemberId ? String(e.source.familyMemberId) : '',
    }))
  })
}

function entriesOf(rows) {
  return rows
    .filter((r) => r.content.trim())
    .map((r) => ({
      topic: r.topic,
      content: r.content.trim(),
      source:
        r.sourceType === 'FAMILY_MEMBER'
          ? { type: 'FAMILY_MEMBER', familyMemberId: Number(r.memberId.trim()) }
          : { type: 'RESIDENT' },
    }))
}

function SourceRow({ row, label, members = [], onChange, onRemove, error }) {
  const id = `family-declared-${row.key}`
  return (
    <div className="flex flex-col gap-2 border-t pt-3 first:border-0 first:pt-0">
      <ChoiceTray
        id={`${id}-content`}
        label={label}
        options={FAMILY_DECLARED_CHOICES[row.topic]}
        multiple
        value={row.content}
        onChange={(content) => onChange({ content })}
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="type-caption text-muted-foreground" id={`${id}-source`}>
            Nguồn
          </span>
          <div role="radiogroup" aria-labelledby={`${id}-source`} className="flex flex-wrap gap-2">
            {[
              ['RESIDENT', 'Người cao tuổi'],
              ['FAMILY_MEMBER', 'Người thân'],
            ].map(([value, text]) => (
              <Button
                key={value}
                type="button"
                role="radio"
                aria-checked={row.sourceType === value}
                variant={row.sourceType === value ? 'default' : 'outline'}
                className="h-10"
                onClick={() => onChange({ sourceType: value })}
              >
                {text}
              </Button>
            ))}
          </div>
        </div>
        {row.sourceType === 'FAMILY_MEMBER' && (
          // Demo 2026-11-25: chọn người thân theo tên; chưa có danh sách thì nhập mã như trước
          <div className="min-w-48">
            <FamilyMemberField
              id={`${id}-member`}
              label="Người thân"
              fallbackLabel="Mã người thân"
              members={members}
              value={row.memberId}
              onChange={(memberId) => onChange({ memberId })}
            />
          </div>
        )}
        {onRemove && (
          <Button type="button" variant="ghost" className="h-10" onClick={onRemove}>
            Bỏ dòng
          </Button>
        )}
      </div>
      {error && <FieldError>{error}</FieldError>}
    </div>
  )
}

export function FamilyDeclaredEditor({ residentId }) {
  const members = useFamilyMembers(residentId)
  const [state, setState] = useState('loading')
  const [saved, setSaved] = useState([])
  const [rows, setRows] = useState([])
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)

  const load = useCallback(async () => {
    let entries = []
    try {
      const { data } = await getResidentsByIdInitialAssessmentFamilyDeclared({ path: { id: residentId } })
      entries = data.entries
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) setFailure(problemOf(error))
    }
    setSaved(entries)
    setRows(rowsOf(entries))
    setState('ready')
  }, [residentId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nạp phần Gia đình khai khi mở
    load()
  }, [load])

  function change(key, patch) {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)))
    setDone(null)
  }

  async function save() {
    setFailure(null)
    const next = {}
    for (const r of rows)
      if (r.content.trim() && r.sourceType === 'FAMILY_MEMBER' && !POSITIVE_INTEGER.test(r.memberId.trim()))
        next[r.key] = 'Nhập mã người thân'
    setErrors(next)
    if (Object.keys(next).length > 0) {
      setDone(null)
      return
    }
    const entries = entriesOf(rows)
    if (JSON.stringify(entries.map(entryKey)) === JSON.stringify(saved.map(entryKey))) {
      setDone('Chưa có thay đổi để lưu.')
      return
    }
    setBusy(true)
    try {
      const { data } = await putResidentsByIdInitialAssessmentFamilyDeclared({
        path: { id: residentId },
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: { entries },
      })
      setSaved(data.entries)
      setRows(rowsOf(data.entries))
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
        Ghi điều người cao tuổi hoặc gia đình kể về sức khỏe theo từng chủ đề để Bác sĩ tham khảo khi đánh giá đầu vào.
        Bác sĩ ghi nhận xét, chọn mức chăm sóc và xác nhận; phần này giữ nguyên trong lần đánh giá.
      </p>
      {state === 'loading' ? (
        <div aria-busy="true">
          <span className="sr-only">Đang tải phần Gia đình khai</span>
          <Skeleton className="h-16" />
        </div>
      ) : (
        <>
          {Object.entries(FAMILY_DECLARED_TOPIC_LABELS).map(([topic, topicLabel]) => {
            const own = rows.filter((r) => r.topic === topic)
            return (
              <div
                key={topic}
                role="group"
                aria-label={topicLabel}
                className="flex flex-col gap-3 rounded-lg border p-3"
              >
                {own.map((row, i) => (
                  <SourceRow
                    key={row.key}
                    row={row}
                    members={members}
                    label={i === 0 ? topicLabel : `${topicLabel}, nguồn thứ ${i + 1}`}
                    error={errors[row.key]}
                    onChange={(patch) => change(row.key, patch)}
                    onRemove={i > 0 ? () => setRows((current) => current.filter((r) => r.key !== row.key)) : null}
                  />
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 self-start"
                  onClick={() => {
                    setRows((current) => {
                      const last = current.findLastIndex((r) => r.topic === topic)
                      return [...current.slice(0, last + 1), emptyRow(topic), ...current.slice(last + 1)]
                    })
                  }}
                >
                  Thêm nguồn khác
                </Button>
              </div>
            )
          })}

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
