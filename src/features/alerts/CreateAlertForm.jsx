import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ProblemAlert } from '@/common/ProblemAlert'
import { ResidentAvatar } from '@/common/ResidentAvatar'
import { problemOf } from '@/common/problem'
import { LevelChoices, ResidentChoices } from '@/features/incidents/CaseFormParts'
import { presetLevel } from '@/features/incidents/incidentView'
import { CasePage, CaseWizard, FocusHeading } from '@/features/incidents/CasePage'
import { IncidentTypeIcon, IncidentTypePicker } from '@/features/incidents/IncidentTypePicker'
import { createAlert, loadIncidentTypes, loadResidentChoices } from './alerts'

// Tạo cảnh báo thủ công (FR-026, FR-028, FR-030; BF-06 bước 1): người cao tuổi, loại, mức, mô tả bắt buộc. Cùng người cùng
// loại đang mở thì backend gộp (merged = true), màn báo rõ là gộp để người dùng không tưởng đã tạo thêm một cảnh báo.
const DESCRIPTION_MAX = 4000

export function CreateAlertForm({ onClose, onCreated }) {
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
  }, [])

  const picked = residents?.find((r) => r.id === residentId) ?? null
  const pickedType = types?.find((t) => String(t.id) === typeId) ?? null
  const errors = {
    resident: residentId == null,
    type: !typeId,
    level: !level,
    description: !description.trim(),
  }

  function pickType(value) {
    setTypeId(value)
    const type = (types ?? []).find((t) => String(t.id) === value)
    setLevel(presetLevel(type))
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

  const step = residentId == null ? 'resident' : !typeId ? 'type' : 'detail'

  return (
    <CasePage
      label="Tạo cảnh báo"
      backLabel="Cảnh báo"
      here="Tạo cảnh báo"
      onBack={() => !busy && onClose()}
      returnFocusId="create-alert"
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <CaseWizard
          title="Tạo cảnh báo"
          subtitle="Cùng người, cùng loại đang có cảnh báo mở thì hệ thống gộp vào cảnh báo đó, không tạo thêm."
          current={step}
          steps={[
            {
              key: 'resident',
              label: 'Ghi cho ai',
              value: picked && (
                <>
                  <ResidentAvatar name={picked.name} code={String(picked.id)} className="size-8" />
                  {picked.name}
                </>
              ),
              action: 'Đổi người',
              onEdit: () => setResidentId(null),
            },
            {
              key: 'type',
              label: 'Chuyện gì xảy ra',
              value: pickedType && (
                <>
                  <IncidentTypeIcon code={pickedType.code} className="size-8 [&_svg]:size-4" />
                  {pickedType.name}
                </>
              ),
              action: 'Đổi loại',
              onEdit: () => {
                setTypeId('')
                setLevel('')
              },
            },
            { key: 'detail', label: 'Mức và mô tả' },
          ]}
        >
          {step === 'resident' && (
            <>
              <FocusHeading step={step}>Ghi cho ai?</FocusHeading>
              {residents ? (
                <ResidentChoices residents={residents} query={query} onQuery={setQuery} onPick={setResidentId} />
              ) : (
                <Skeleton className="h-16 w-full" />
              )}
            </>
          )}
          {step === 'type' && (
            <>
              <FocusHeading step={step}>Chuyện gì xảy ra?</FocusHeading>
              {types ? (
                <IncidentTypePicker types={types} value="" onChange={pickType} />
              ) : (
                <Skeleton className="h-28 w-full" />
              )}
            </>
          )}
          {problem && <ProblemAlert problem={problem} />}
          {step === 'detail' && (
            <>
              <FocusHeading step={step}>Mức và mô tả</FocusHeading>
              <Card>
                <CardContent className="flex flex-col gap-4">
                  <Field data-invalid={(submitted && errors.level) || undefined}>
                    <FieldLabel>Mức</FieldLabel>
                    <LevelChoices value={level} onChange={setLevel} />
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
                </CardContent>
              </Card>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="ghost" className="h-11" disabled={busy} onClick={onClose}>
                  Hủy
                </Button>
                <Button type="submit" className="h-11" disabled={busy}>
                  Lưu cảnh báo
                </Button>
              </div>
            </>
          )}
        </CaseWizard>
      </form>
    </CasePage>
  )
}
