import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { ProblemAlert } from '@/common/ProblemAlert'
import { formatDateTime } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { runAlertCommand } from './alerts'

// Q-419, 007 FR-087: danh sách lần theo dõi và form ghi kết quả theo dõi của một cảnh báo đang mở; dùng ở màn Cảnh báo và
// khung chi tiết của checklist ca (005 FR-057, nhãn "Đang theo dõi").
export function AlertFollowUps({ alert, canRecord, onRecorded, title = 'Theo dõi' }) {
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null)
  const items = alert.followUps ?? []
  if (!canRecord && items.length === 0) return null
  const missing = !text.trim()

  async function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    if (missing) return
    setBusy(true)
    setProblem(null)
    try {
      await runAlertCommand(alert.id, 'follow-up', { content: text.trim() })
      setText('')
      setSubmitted(false)
      await onRecorded()
    } catch (error) {
      setProblem(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h3 className="type-caption text-muted-foreground">{title}</h3>
      {items.length > 0 ? (
        <ol className="flex flex-col gap-1.5 border-l-2 pl-3 type-body-sm">
          {items.map((f, i) => (
            <li key={`${f.at}:${i}`}>
              <span className="tabular-nums text-muted-foreground">{formatDateTime(f.at)}</span>
              {f.recordedBy && <span className="text-muted-foreground">, {f.recordedBy}</span>}
              <p className="whitespace-pre-wrap">{f.content}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="type-body-sm text-muted-foreground">Chưa có lần theo dõi nào.</p>
      )}
      {canRecord && (
        <form onSubmit={submit} noValidate className="flex flex-col gap-2">
          <Field data-invalid={(submitted && missing) || undefined}>
            <FieldLabel htmlFor={`alert-follow-up-${alert.id}`}>Ghi kết quả theo dõi</FieldLabel>
            <Textarea
              id={`alert-follow-up-${alert.id}`}
              rows={2}
              maxLength={2000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-invalid={(submitted && missing) || undefined}
            />
            {submitted && missing && <FieldError>Nhập kết quả theo dõi</FieldError>}
          </Field>
          {problem && <ProblemAlert problem={problem} />}
          <Button type="submit" variant="outline" className="h-11 self-end" disabled={busy}>
            Lưu theo dõi
          </Button>
        </form>
      )}
    </section>
  )
}
