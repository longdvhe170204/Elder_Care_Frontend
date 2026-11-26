import { useCallback, useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  getCatalogsByType,
  getAssessmentsById,
  postAssessmentsByIdConfirm,
  postAssessmentsByIdDiscardDraft,
  putAssessmentsById,
} from '@/api'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ChoiceTray } from '@/common/ChoiceTray'
import { DiscardChangesDialog } from '@/common/DiscardChangesDialog'
import { formatDateTime } from '@/common/dateTime'
import { ProblemAlert } from '@/common/ProblemAlert'
import { ASSESSMENT_BASIS, ASSESSMENT_DISCARD_REASONS, CARE_NOTES } from '@/common/quickChoices'
import { StatusBadge } from '@/common/StatusBadge'
import { useFamilyMembers } from '@/common/useFamilyMembers'
import { problemOf } from '@/common/problem'
import { cn } from '@/lib/utils'
import { HEALTH_RECORD_FIELDS, HEALTH_TYPE_LABELS, HEALTH_TYPE_ORDER } from '../residents/healthLabels'
import {
  ASSESSMENT_STATUS_LABELS,
  ASSESSMENT_TYPE_LABELS,
  CARE_LEVEL_LABELS,
  CARE_LEVEL_ORDER,
  CARE_LEVEL_SHORT_LABELS,
  RESIDENCE_TYPE_LABELS,
} from './assessmentLabels'
import { FamilyDeclaredList } from './FamilyDeclared'

// Phiếu đánh giá đang soạn mở trong khung riêng (001 T042; US3; FR-024 → FR-029, FR-031; hợp đồng GET, PUT
// /assessments/{id}, POST …/confirm, …/discard-draft; chủ dự án duyệt hướng 1 ngày 2026-11-26): khung rộng, đầu, chân cố
// định; trái là phiếu, phải là thông tin tham khảo (sức khỏe ban đầu trước, rồi mục Hiệu lực, chỉ số đo, Gia đình khai).
// Không có ô điểm, không mức đề xuất, không chọn sẵn (Q-307): Bác sĩ tự chọn mức. Căn cứ, loại hình đề xuất không bắt buộc
// nên gập lại. Sửa nháp dùng If-Match lấy từ ETag lần đọc gần nhất; chỉ Bác sĩ xác nhận; quyền thật do backend kiểm.

const FORM_ID = 'assessment-draft-form'

function blank(value) {
  const text = value.trim()
  return text === '' ? undefined : text
}

function formOf(a) {
  return {
    basis: a.basis ?? '',
    comment: a.comment ?? '',
    careNote: a.careNote ?? '',
    careLevel: a.careLevel ?? '',
    careNeedIds: (a.careNeeds ?? []).map((n) => String(n.id)),
    proposedResidenceType: a.proposedResidenceType ?? '',
  }
}

function bodyOf(form) {
  return {
    basis: blank(form.basis),
    comment: blank(form.comment),
    careNote: blank(form.careNote),
    careLevel: form.careLevel || undefined,
    careNeedIds: form.careNeedIds.map(Number),
    proposedResidenceType: form.proposedResidenceType || undefined,
  }
}

const sameForm = (a, b) =>
  JSON.stringify({ ...a, careNeedIds: [...a.careNeedIds].sort() }) ===
  JSON.stringify({ ...b, careNeedIds: [...b.careNeedIds].sort() })

// Tác động của lệnh Xác nhận, nêu trước khi bấm (research H-10; FR-033, FR-035, FR-036).
function effectOf({ type, residentStatus, currentLevel, level }) {
  const chosen = CARE_LEVEL_LABELS[level] ?? 'mức đã chọn'
  if (type === 'INITIAL' || residentStatus === 'ADMISSION_IN_PROGRESS') {
    return `${chosen} sẽ trở thành mức chăm sóc hiện hành ngay khi xác nhận.`
  }
  if (currentLevel !== level) {
    return `Mức hiện hành (${CARE_LEVEL_LABELS[currentLevel] ?? 'chưa có'}) giữ nguyên. Hành chính được báo lập yêu cầu điều chỉnh hợp đồng loại đổi mức sang ${chosen}; yêu cầu đổi mức chưa kết thúc của người này chuyển sang Được thay thế.`
  }
  return 'Mức chăm sóc không đổi. Yêu cầu đổi mức chưa kết thúc của người này (nếu có) chuyển sang Được thay thế.'
}

function RefSection({ id, title, children }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h4 id={id} className="type-label">
        {title}
      </h4>
      {children}
    </section>
  )
}

function Reference({ reference, familyDeclared, members }) {
  const initial = reference?.initialHealthRecord
  const items = reference?.activeHealthItems ?? []
  const vitals = reference?.latestVitalSigns ?? []
  return (
    <aside aria-label="Thông tin tham khảo" className="flex flex-col gap-5 rounded-lg bg-muted/40 p-4">
      <RefSection
        id="ref-initial"
        title={
          <span className="flex flex-wrap items-center gap-2">
            Sức khỏe ban đầu
            {initial && <StatusBadge status={initial.confirmed ? 'Đã xác nhận' : 'Bản nháp'} />}
          </span>
        }
      >
        {initial ? (
          <dl className="flex flex-col gap-2">
            {HEALTH_RECORD_FIELDS.filter((f) => initial[f.name]).map((f) => (
              <div key={f.name} className="flex flex-col">
                <dt className="type-caption text-muted-foreground">{f.label}</dt>
                <dd className="type-body-sm whitespace-pre-wrap">{initial[f.name]}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="type-body-sm text-muted-foreground">Chưa lập</p>
        )}
      </RefSection>

      <RefSection id="ref-items" title="Dị ứng, bệnh nền, tiền sử">
        {items.length === 0 ? (
          <p className="type-body-sm text-muted-foreground">Không có mục đang hiệu lực</p>
        ) : (
          HEALTH_TYPE_ORDER.filter((t) => items.some((i) => i.type === t)).map((t) => (
            <div key={t} className="flex flex-col">
              <span className="type-caption text-muted-foreground">{HEALTH_TYPE_LABELS[t]}</span>
              <ul className="type-body-sm">
                {items
                  .filter((i) => i.type === t)
                  .map((i) => (
                    <li key={i.id}>
                      {i.allergen?.name ?? i.freeText}
                      {i.severity ? `, mức ${i.severity}` : ''}
                    </li>
                  ))}
              </ul>
            </div>
          ))
        )}
      </RefSection>

      <RefSection id="ref-vitals" title="Chỉ số đo gần nhất">
        {vitals.length === 0 ? (
          <p className="type-body-sm text-muted-foreground">Chưa có lần đo</p>
        ) : (
          <ul className="type-body-sm">
            {vitals.map((v) => (
              <li key={v.indicatorId}>
                {`${v.indicatorName}: ${Object.values(v.values ?? {}).join('/')}${v.unit ? ` ${v.unit}` : ''}, đo ${formatDateTime(v.measuredAt)}`}
              </li>
            ))}
          </ul>
        )}
      </RefSection>

      <FamilyDeclaredList entries={familyDeclared} members={members} />
    </aside>
  )
}

function DiscardDialog({ open, busy, onCancel, onDiscard }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hủy bản nháp</DialogTitle>
          <DialogDescription>Bản đã hủy vẫn lưu trong lịch sử và không sửa được.</DialogDescription>
        </DialogHeader>
        <Field data-invalid={!!error || undefined}>
          <ChoiceTray
            id="assessment-discard-reason"
            label="Lý do hủy"
            options={ASSESSMENT_DISCARD_REASONS}
            value={reason}
            onChange={(value) => {
              setReason(value)
              setError('')
            }}
            invalid={!!error}
          />
          {error && <FieldError>{error}</FieldError>}
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" className="h-11" onClick={onCancel}>
            Quay lại
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="h-11"
            disabled={busy}
            onClick={() => (reason.trim() ? onDiscard(reason.trim()) : setError('Chọn hoặc ghi lý do hủy'))}
          >
            Hủy bản nháp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AssessmentSheet({
  assessmentId,
  residentId,
  residentName,
  residentStatus,
  currentLevel,
  careNeedOptions: givenNeeds,
  canConfirm,
  onClose,
  onChanged,
  onConfirmed,
}) {
  const members = useFamilyMembers(residentId)
  // Mở thẳng từ danh sách (Chờ đánh giá đầu vào) thì tự nạp danh mục nhu cầu chăm sóc
  const [loadedNeeds, setLoadedNeeds] = useState([])
  useEffect(() => {
    if (givenNeeds) return undefined
    let live = true
    getCatalogsByType({ path: { type: 'care-needs' } })
      .then(({ data }) => live && setLoadedNeeds(data.filter((n) => n.status !== 'INACTIVE')))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [givenNeeds])
  const careNeedOptions = givenNeeds ?? loadedNeeds
  const [state, setState] = useState('loading')
  const [detail, setDetail] = useState(null)
  const [etag, setEtag] = useState(null)
  const [form, setForm] = useState(null)
  const [failure, setFailure] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  const load = useCallback(async () => {
    try {
      const { data, etag: tag } = await getAssessmentsById({ path: { id: assessmentId } })
      setDetail(data)
      setEtag(tag)
      setForm(formOf(data))
      setMoreOpen(!!(data.basis || data.proposedResidenceType))
      setFailure(null)
      setState('ready')
    } catch (error) {
      setFailure(problemOf(error))
      setState('error')
    }
  }, [assessmentId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nạp phiếu khi mở khung
    load()
  }, [load])

  const dirty = !!form && !!detail && !sameForm(form, formOf(detail))
  const requestClose = () => (dirty ? setConfirmClose(true) : onClose())

  const set = (name) => (value) => {
    setSaved(false)
    setFieldErrors((current) => ({ ...current, [name]: undefined }))
    setForm((current) => ({ ...current, [name]: value }))
  }

  // Lưu nháp; trả ETag mới để lệnh Xác nhận dùng ngay.
  async function persist() {
    const { data, etag: tag } = await putAssessmentsById({
      path: { id: assessmentId },
      headers: { 'If-Match': etag },
      body: bodyOf(form),
    })
    setDetail(data)
    setEtag(tag)
    setForm(formOf(data))
    return tag
  }

  async function save(event) {
    event.preventDefault()
    setFailure(null)
    setFieldErrors({})
    setBusy(true)
    try {
      await persist()
      setSaved(true)
      onChanged?.()
    } catch (error) {
      setFailure(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  async function confirm() {
    setFailure(null)
    setFieldErrors({})
    setBusy(true)
    try {
      const tag = await persist()
      const { data } = await postAssessmentsByIdConfirm({
        path: { id: assessmentId },
        headers: { 'If-Match': tag },
      })
      setConfirmOpen(false)
      onConfirmed?.(data)
    } catch (error) {
      setConfirmOpen(false)
      const problem = problemOf(error)
      const codes = problem.unmetConditions.map((c) => c.code)
      if (problem.errorCode === 'CONDITION_NOT_MET' && codes.length > 0) {
        // Thiếu nhận xét hoặc mức (FR-028): báo tại ô, không chặn lưu nháp
        setFieldErrors({
          comment: codes.includes('comment') ? 'Nhập nhận xét đánh giá trước khi xác nhận' : undefined,
          careLevel: codes.includes('careLevel') ? 'Chọn một mức chăm sóc trước khi xác nhận' : undefined,
        })
      } else {
        setFailure(problem)
      }
    } finally {
      setBusy(false)
    }
  }

  async function discard(reason) {
    setFailure(null)
    setBusy(true)
    try {
      await postAssessmentsByIdDiscardDraft({ path: { id: assessmentId }, body: { reason } })
      setDiscardOpen(false)
      onChanged?.()
      onClose()
    } catch (error) {
      setDiscardOpen(false)
      setFailure(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  const isInitial = detail?.type === 'INITIAL'
  const title = `${ASSESSMENT_TYPE_LABELS[detail?.type] ?? 'Đánh giá'}: ${residentName ?? ''}`.trim()

  return (
    <Sheet open onOpenChange={(next) => !next && requestClose()}>
      <SheetContent className="gap-0 p-0 sm:max-w-4xl">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 flex-col gap-1 border-b px-6 pt-6 pb-4 pr-12">
            <div className="flex flex-wrap items-center gap-3">
              <SheetTitle className="type-title">{title}</SheetTitle>
              {detail && <StatusBadge status={ASSESSMENT_STATUS_LABELS[detail.status]} />}
            </div>
            <SheetDescription>{detail ? `Người lập: ${detail.createdBy}` : 'Đang tải phiếu'}</SheetDescription>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            {state === 'loading' && (
              <div aria-busy="true" className="flex flex-col gap-2">
                <span className="sr-only">Đang tải phiếu đánh giá</span>
                <Skeleton className="h-10" />
                <Skeleton className="h-32" />
              </div>
            )}
            {state === 'error' && <ProblemAlert problem={failure} />}
            {state === 'ready' && (
              <div className="grid gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <form
                  id={FORM_ID}
                  onSubmit={save}
                  noValidate
                  aria-busy={busy || undefined}
                  className="flex flex-col gap-5"
                >
                  <Field data-invalid={!!fieldErrors.comment || undefined}>
                    <FieldLabel htmlFor="assessment-comment">
                      Nhận xét đánh giá
                      <span aria-hidden="true" className="text-destructive">
                        *
                      </span>
                    </FieldLabel>
                    <Textarea
                      id="assessment-comment"
                      rows={6}
                      className="min-h-36"
                      value={form.comment}
                      placeholder="Tình trạng chung, vận động, tự chăm sóc, nhận thức, nguy cơ cần lưu ý"
                      onChange={(event) => set('comment')(event.target.value)}
                      aria-invalid={!!fieldErrors.comment || undefined}
                    />
                    {fieldErrors.comment && <FieldError>{fieldErrors.comment}</FieldError>}
                  </Field>

                  <ChoiceTray
                    id="assessment-care-note"
                    label="Lưu ý chăm sóc hiện trên thẻ"
                    options={CARE_NOTES}
                    multiple
                    value={form.careNote}
                    onChange={set('careNote')}
                    placeholder="Bấm để chọn hoặc gõ"
                  />

                  <Field data-invalid={!!fieldErrors.careLevel || undefined}>
                    <FieldLabel id="assessment-level-label">
                      Mức chăm sóc
                      <span aria-hidden="true" className="text-destructive">
                        *
                      </span>
                    </FieldLabel>
                    <ToggleGroup
                      variant="outline"
                      spacing={2}
                      aria-labelledby="assessment-level-label"
                      value={form.careLevel ? [form.careLevel] : []}
                      onValueChange={(next) => set('careLevel')(next[0] ?? '')}
                      className="grid w-full grid-cols-3"
                    >
                      {CARE_LEVEL_ORDER.map((code) => (
                        <ToggleGroupItem
                          key={code}
                          value={code}
                          aria-label={CARE_LEVEL_LABELS[code]}
                          aria-invalid={!!fieldErrors.careLevel || undefined}
                          className="h-11"
                        >
                          {CARE_LEVEL_SHORT_LABELS[code]}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                    {fieldErrors.careLevel && <FieldError>{fieldErrors.careLevel}</FieldError>}
                  </Field>

                  <Field>
                    <FieldLabel id="assessment-needs-label">Nhu cầu chăm sóc</FieldLabel>
                    {careNeedOptions.length === 0 ? (
                      <p className="type-body-sm text-muted-foreground">Danh mục nhu cầu chăm sóc đang trống</p>
                    ) : (
                      <ToggleGroup
                        multiple
                        variant="outline"
                        spacing={2}
                        aria-labelledby="assessment-needs-label"
                        value={form.careNeedIds}
                        onValueChange={set('careNeedIds')}
                        className="flex-wrap"
                      >
                        {careNeedOptions.map((n) => (
                          <ToggleGroupItem key={n.id} value={String(n.id)} className="h-11 px-4">
                            {n.name}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    )}
                  </Field>

                  <Collapsible open={moreOpen} onOpenChange={setMoreOpen} className="flex flex-col gap-5">
                    <CollapsibleTrigger className="flex items-center gap-1.5 self-start type-body-sm font-medium text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                      {isInitial ? 'Thêm căn cứ, loại hình đề xuất' : 'Thêm căn cứ'}
                      <ChevronDown
                        aria-hidden
                        className={cn('size-4 transition-transform', moreOpen && 'rotate-180')}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="flex flex-col gap-5">
                      <ChoiceTray
                        id="assessment-basis"
                        label="Căn cứ, lý do"
                        options={ASSESSMENT_BASIS}
                        value={form.basis}
                        onChange={set('basis')}
                        placeholder="Bấm để chọn hoặc gõ"
                      />
                      {isInitial && (
                        <Field>
                          <FieldLabel id="assessment-residence-label">Loại hình lưu trú đề xuất</FieldLabel>
                          <ToggleGroup
                            variant="outline"
                            spacing={2}
                            aria-labelledby="assessment-residence-label"
                            value={form.proposedResidenceType ? [form.proposedResidenceType] : []}
                            onValueChange={(next) => set('proposedResidenceType')(next[0] ?? '')}
                            className="flex-wrap"
                          >
                            {Object.entries(RESIDENCE_TYPE_LABELS).map(([code, label]) => (
                              <ToggleGroupItem key={code} value={code} className="h-11 px-4">
                                {label}
                              </ToggleGroupItem>
                            ))}
                          </ToggleGroup>
                        </Field>
                      )}
                    </CollapsibleContent>
                  </Collapsible>

                  <ProblemAlert problem={failure}>
                    {failure?.status === 412 && (
                      <Button type="button" variant="outline" className="h-11 self-start" onClick={load}>
                        Xem giá trị mới
                      </Button>
                    )}
                  </ProblemAlert>
                </form>

                <Reference reference={detail.reference} familyDeclared={detail.familyDeclared} members={members} />
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-3 border-t px-6 py-4">
            {state === 'ready' && (
              <Button
                type="button"
                variant="ghost"
                className="h-11"
                disabled={busy}
                onClick={() => setDiscardOpen(true)}
              >
                Hủy nháp
              </Button>
            )}
            <p role="status" aria-live="polite" className="type-caption text-muted-foreground">
              {saved && !dirty ? 'Đã lưu bản nháp' : ''}
            </p>
            <span className="flex-1" />
            {state === 'ready' && (
              <>
                <Button type="submit" form={FORM_ID} variant="outline" className="h-11" disabled={busy}>
                  {busy ? 'Đang lưu…' : 'Lưu nháp'}
                </Button>
                {canConfirm && (
                  <Button type="button" className="h-11" disabled={busy} onClick={() => setConfirmOpen(true)}>
                    Xác nhận đánh giá
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </SheetContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận đánh giá</DialogTitle>
            <DialogDescription>
              {detail && effectOf({ type: detail.type, residentStatus, currentLevel, level: form?.careLevel })} Sau khi
              xác nhận không sửa được nữa, chỉ đính chính.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={() => setConfirmOpen(false)}>
              Quay lại soạn
            </Button>
            <Button type="button" className="h-11" disabled={busy} onClick={confirm}>
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {discardOpen && <DiscardDialog open busy={busy} onCancel={() => setDiscardOpen(false)} onDiscard={discard} />}

      <DiscardChangesDialog
        open={confirmClose}
        onKeep={() => setConfirmClose(false)}
        onDiscard={() => {
          setConfirmClose(false)
          onClose()
        }}
      />
    </Sheet>
  )
}
