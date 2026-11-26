import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ProblemAlert } from '@/common/ProblemAlert'
import { formatDateTime } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { loadFamilyNotice, recordFamilyNotice } from './incidents'
import { FAMILY_METHODS, vietnamIso, vietnamNowLocal } from './incidentView'

const METHOD_LABEL = Object.fromEntries(FAMILY_METHODS)

/**
 * Tình trạng báo người nhà của sự cố (BF-06, đề xuất 2026-11-24): đã báo thì hiện ai, lúc nào, cách nào; chưa báo thì nhắc,
 * quá hạn thì nhắc rõ hơn. Người có quyền (canRecord = lệnh family-notice) ghi được "Đã báo người nhà".
 */
export function FamilyNoticePanel({ incidentId, canRecord, children }) {
  const [status, setStatus] = useState(null)
  const [editing, setEditing] = useState(false)
  const [method, setMethod] = useState('PHONE')
  const [at, setAt] = useState(() => vietnamNowLocal())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null)

  const reload = useCallback(
    () =>
      loadFamilyNotice(incidentId).then(
        (data) => setStatus(data),
        () => setStatus(false),
      ),
    [incidentId],
  )
  useEffect(() => {
    let live = true
    loadFamilyNotice(incidentId).then(
      (data) => live && setStatus(data),
      () => live && setStatus(false),
    )
    return () => {
      live = false
    }
  }, [incidentId])

  async function save() {
    setBusy(true)
    setProblem(null)
    try {
      await recordFamilyNotice(incidentId, {
        method,
        at: vietnamIso(at),
        ...(note.trim() ? { note: note.trim() } : {}),
      })
      setEditing(false)
      await reload()
    } catch (error) {
      setProblem(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  if (!status) return null
  const informed = status.state === 'INFORMED'
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <h2 className="type-caption tracking-wide text-muted-foreground uppercase">Báo người nhà</h2>
        {informed ? (
          <p className="type-body">
            Đã báo người nhà: {METHOD_LABEL[status.method] ?? status.method}
            {status.notifiedAt && `, ${formatDateTime(status.notifiedAt)}`}
            {status.notifiedByName && `, ${status.notifiedByName}`}
            {status.note && ` (${status.note})`}
          </p>
        ) : (
          <p className={status.overdue ? 'type-body text-destructive' : 'type-body'}>
            {status.overdue ? 'Quá hạn báo người nhà. ' : 'Chưa ghi nhận báo người nhà. '}
            {status.dueAt && `Hạn báo: ${formatDateTime(status.dueAt)}.`}
          </p>
        )}
        {problem && <ProblemAlert problem={problem} />}
        {/* Việc nhắc gọi người nhà nằm ngay đây: gọi xong chọn "Đã liên lạc được" là tự ghi đã báo (BF-06) */}
        {!informed && children}
        {!informed && canRecord && !editing && (
          <Button className="h-11 self-start" onClick={() => setEditing(true)}>
            Ghi đã báo người nhà
          </Button>
        )}
        {!informed && canRecord && editing && (
          <div className="flex flex-col gap-3">
            <div role="group" aria-label="Cách báo" className="flex flex-wrap gap-2">
              {FAMILY_METHODS.map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  variant="outline"
                  aria-pressed={method === value}
                  onClick={() => setMethod(value)}
                  className={method === value ? 'h-11 border-2 border-primary bg-accent' : 'h-11'}
                >
                  {label}
                </Button>
              ))}
            </div>
            <Field>
              <FieldLabel htmlFor="family-notice-at">Báo lúc</FieldLabel>
              <Input
                id="family-notice-at"
                type="datetime-local"
                className="h-11"
                value={at}
                onChange={(event) => setAt(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="family-notice-note">Ghi chú (tuỳ chọn)</FieldLabel>
              <Input
                id="family-notice-note"
                className="h-11"
                maxLength={500}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
            <div className="flex gap-2">
              <Button className="h-11" disabled={busy} onClick={save}>
                Lưu
              </Button>
              <Button variant="outline" className="h-11" disabled={busy} onClick={() => setEditing(false)}>
                Hủy
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
