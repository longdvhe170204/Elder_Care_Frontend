import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ProblemAlert } from '@/common/ProblemAlert'
import { ResidentAvatar } from '@/common/ResidentAvatar'
import { problemOf } from '@/common/problem'
import { LEVEL_LABEL, LEVEL_ORDER } from './alertView'
import { createAlert, loadIncidentTypes, loadResidentChoices } from './alerts'

// Tạo cảnh báo thủ công (FR-026, FR-028, FR-030; BF-06 bước 1): người cao tuổi, loại, mức, mô tả bắt buộc. Cùng người cùng
// loại đang mở thì backend gộp (merged = true), màn báo rõ là gộp để người dùng không tưởng đã tạo thêm một cảnh báo.
const RESIDENT_LIST_MAX = 6
const DESCRIPTION_MAX = 4000

export function CreateAlertSheet({ open, onClose, onCreated }) {
  const [residents, setResidents] = useState(null)
  const [types, setTypes] = useState(null)
  const [residentId, setResidentId] = useState(null)
  const [query, setQuery] = useState('')
  const [typeId, setTypeId] = useState('')
  const [level, setLevel] = useState('')
  const [description, setDescription] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [problem, setProblem] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    loadResidentChoices().then(
      (data) => !cancelled && setResidents(data),
      (error) => !cancelled && (setResidents([]), setProblem(problemOf(error))),
    )
    loadIncidentTypes().then(
      (data) => !cancelled && setTypes(data),
      (error) => !cancelled && (setTypes([]), setProblem(problemOf(error))),
    )
    return () => {
      cancelled = true
    }
  }, [open])

  const picked = residents?.find((r) => r.id === residentId) ?? null
  const needle = query.trim().toLowerCase()
  const matched = (residents ?? []).filter((r) => !needle || `${r.name} ${r.code}`.toLowerCase().includes(needle))
  const shown = matched.slice(0, RESIDENT_LIST_MAX)
  const errors = {
    resident: residentId == null,
    type: !typeId,
    level: !level,
    description: !description.trim(),
  }

  function pickType(value) {
    setTypeId(value)
    const type = (types ?? []).find((t) => String(t.id) === value)
    if (type?.defaultLevel && !level) setLevel(type.defaultLevel)
  }

  async function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    if (Object.values(errors).some(Boolean)) return
    setBusy(true)
    setProblem(null)
    try {
      const alert = await createAlert({
        residentId,
        incidentTypeId: Number(typeId),
        level,
        description: description.trim(),
      })
      onCreated(
        alert?.merged
          ? `Đã gộp vào cảnh báo đang mở của ${picked.name}, đây là lần thứ ${alert.occurrenceCount} cùng loại`
          : `Đã tạo cảnh báo cho ${picked.name}`,
      )
    } catch (error) {
      setProblem(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <SheetContent className="overflow-y-auto p-6 sm:max-w-lg">
        <SheetHeader className="px-0">
          <SheetTitle className="type-title">Tạo cảnh báo</SheetTitle>
          <SheetDescription>
            Cùng người, cùng loại đang có cảnh báo mở thì hệ thống gộp vào cảnh báo đó, không tạo thêm.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field data-invalid={(submitted && errors.resident) || undefined}>
            <FieldLabel>Người cao tuổi</FieldLabel>
            {!residents ? (
              <Skeleton className="h-11 w-full" />
            ) : picked ? (
              <div className="flex items-center gap-2 rounded-lg border p-2">
                <ResidentAvatar name={picked.name} code={String(picked.id)} className="size-8" />
                <span className="flex-1 type-label">{picked.name}</span>
                <Button type="button" variant="ghost" className="h-11" onClick={() => setResidentId(null)}>
                  Đổi người
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {residents.length > RESIDENT_LIST_MAX && (
                  <Input
                    className="h-11"
                    placeholder="Gõ tên hoặc mã để tìm"
                    aria-label="Tìm người cao tuổi"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                )}
                {shown.map((r) => (
                  <Button
                    key={r.id}
                    type="button"
                    variant="outline"
                    aria-label={`${r.name}, ${r.code}`}
                    className="h-11 justify-start gap-2"
                    onClick={() => setResidentId(r.id)}
                  >
                    <ResidentAvatar name={r.name} code={String(r.id)} className="size-6" />
                    <span>{r.name}</span>
                    <span className="type-caption">{r.code}</span>
                  </Button>
                ))}
                {matched.length > shown.length && (
                  <p className="type-caption text-muted-foreground">
                    Còn {matched.length - shown.length} người nữa, gõ thêm để lọc.
                  </p>
                )}
              </div>
            )}
            {submitted && errors.resident && <FieldError>Chọn người cao tuổi</FieldError>}
          </Field>
          <Field data-invalid={(submitted && errors.type) || undefined}>
            <FieldLabel htmlFor="alert-type">Loại sự cố</FieldLabel>
            <select
              id="alert-type"
              value={typeId}
              onChange={(e) => pickType(e.target.value)}
              disabled={!types}
              aria-invalid={(submitted && errors.type) || undefined}
              className="h-11 rounded-md border bg-background px-3"
            >
              <option value="">Chọn loại</option>
              {(types ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {submitted && errors.type && <FieldError>Chọn loại sự cố</FieldError>}
          </Field>
          <Field data-invalid={(submitted && errors.level) || undefined}>
            <FieldLabel>Mức</FieldLabel>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Mức cảnh báo">
              {[...LEVEL_ORDER].reverse().map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant={level === value ? 'default' : 'outline'}
                  aria-pressed={level === value}
                  className="h-11 px-4"
                  onClick={() => setLevel(value)}
                >
                  {LEVEL_LABEL[value]}
                </Button>
              ))}
            </div>
            {submitted && errors.level && <FieldError>Chọn mức</FieldError>}
          </Field>
          <Field data-invalid={(submitted && errors.description) || undefined}>
            <FieldLabel htmlFor="alert-description">Mô tả cảnh báo</FieldLabel>
            <Textarea
              id="alert-description"
              value={description}
              maxLength={DESCRIPTION_MAX}
              aria-invalid={(submitted && errors.description) || undefined}
              onChange={(e) => setDescription(e.target.value)}
            />
            {submitted && errors.description && <FieldError>Nhập mô tả cảnh báo</FieldError>}
          </Field>
          {problem && <ProblemAlert problem={problem} />}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="h-11" disabled={busy}>
              Lưu cảnh báo
            </Button>
            <Button type="button" variant="ghost" className="h-11" disabled={busy} onClick={onClose}>
              Hủy
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
