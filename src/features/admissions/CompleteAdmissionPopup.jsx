import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ApiError,
  getBedAllocationsSuitableBeds,
  getResidentsByIdConditionsByCommand,
  postResidentsByIdCompleteAdmission,
} from '@/api'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { ChoiceTray } from '@/common/ChoiceTray'
import { DiscardChangesDialog } from '@/common/DiscardChangesDialog'
import { ProblemAlert } from '@/common/ProblemAlert'
import { problemOf } from '@/common/problem'
import { STATUS_COMMAND_REASONS } from '@/common/quickChoices'
import { getRooms } from '@/api/api003'
import { OpinionBlock } from './ApplicationParts'

// Hoàn tất tiếp nhận mở thẳng từ chân màn Hồ sơ tiếp nhận (audit BF-01 2026-11-27, chủ dự án duyệt bản phác; thay việc mở
// khung Trạng thái rồi bấm lại lệnh). Theo thứ tự: ý kiến vào ở (004 FR-004a, Q-356, Q-361), kiểm tra trước khi tiếp nhận
// (bước bắt buộc của màn đã xong và điều kiện còn thiếu do backend xem trước), lưu ý không chặn (bản đồng ý, nguyện vọng;
// FR-012, FR-023d), ghi chú hoặc lý do bắt buộc. Giường đặt trước chưa sẵn sàng thì chọn giường Trống khác ngay trong lệnh
// (003 FR-023, details.switchAllocationToBedId); không chọn sẵn (Q-307). Không có nút Hủy tiếp nhận ở luồng này.
const FORM_ID = 'complete-admission-form'
const BED_NOT_READY = 'RESERVED_BED_NOT_READY'

function Section({ title, children }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="type-label">{title}</h3>
      {children}
    </section>
  )
}

function Mark({ ok }) {
  return ok ? (
    <span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-full bg-success-foreground" />
  ) : (
    <span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-full border-2 border-destructive" />
  )
}

// roomTypeId: loại phòng của hợp đồng; giường Trống khác mặc định chỉ hiện cùng loại phòng (phí lưu trú tính theo loại
// phòng), nút "Xem cả loại phòng khác" mở hết danh sách
export function CompleteAdmissionPopup({ resident, roomTypeId, opinion, checks, warnings, onClose, onDone }) {
  const [unmet, setUnmet] = useState(null)
  const [beds, setBeds] = useState(null)
  const [bedId, setBedId] = useState('')
  const [allTypes, setAllTypes] = useState(false)
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const [confirmClose, setConfirmClose] = useState(false)
  const key = useRef(crypto.randomUUID())
  const disagree = opinion?.opinion === 'DISAGREE'

  const loadConditions = useCallback(async () => {
    try {
      const { data } = await getResidentsByIdConditionsByCommand({
        path: { id: resident.id, command: 'COMPLETE_ADMISSION' },
      })
      setUnmet(data ?? [])
    } catch (error) {
      setUnmet([])
      setFailure(problemOf(error))
    }
  }, [resident.id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- xem trước điều kiện khi mở lệnh
    loadConditions()
  }, [loadConditions])

  const bedNotReady = (unmet ?? []).some((c) => c.code === BED_NOT_READY)
  useEffect(() => {
    if (!bedNotReady) return
    let active = true
    Promise.all([getBedAllocationsSuitableBeds({ query: { residentId: resident.id } }), getRooms({ query: {} })])
      .then(([suitable, rooms]) => {
        if (!active) return
        const typeOf = Object.fromEntries(rooms.data.map((r) => [r.id, r.roomTypeId]))
        setBeds(
          (suitable.data ?? [])
            .filter((b) => b.state === 'EMPTY')
            .map((b) => ({ ...b, roomTypeId: typeOf[b.location.roomId] })),
        )
      })
      .catch(() => active && setBeds([]))
    return () => {
      active = false
    }
  }, [bedNotReady, resident.id])

  const sameType = roomTypeId ? (beds ?? []).filter((b) => b.roomTypeId === Number(roomTypeId)) : []
  const shownBeds = allTypes || sameType.length === 0 ? beds : sameType
  const hiddenCount = (beds ?? []).length - (shownBeds ?? []).length

  // Điều kiện còn thiếu sau khi tính giường Trống đã chọn trong lệnh
  const blocking = (unmet ?? []).filter((c) => !(c.code === BED_NOT_READY && bedId))
  const reasonError =
    submitted && !reason.trim() ? (disagree ? 'Ghi lý do vẫn tiếp nhận' : 'Ghi chú khi hoàn tất') : null
  const dirty = !!reason.trim() || !!bedId

  function requestClose() {
    if (busy) return
    if (dirty) setConfirmClose(true)
    else onClose()
  }

  async function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    if (unmet === null || blocking.length > 0 || !reason.trim()) return
    setBusy(true)
    setFailure(null)
    try {
      const { data } = await postResidentsByIdCompleteAdmission({
        path: { id: resident.id },
        headers: { 'Idempotency-Key': key.current },
        body: { reason: reason.trim(), details: bedId ? { switchAllocationToBedId: Number(bedId) } : {} },
      })
      onDone(data)
    } catch (error) {
      const problem = problemOf(error)
      setFailure(problem)
      if (error instanceof ApiError && error.status === 409) loadConditions()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onOpenChange={(next) => !next && requestClose()}>
      <SheetContent side="center" className="gap-0 p-0 sm:max-w-3xl">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 flex-col gap-1 border-b px-6 pt-6 pb-4 pr-12">
            <SheetTitle className="type-title">Hoàn tất tiếp nhận</SheetTitle>
            <SheetDescription>
              {[resident.name, resident.code, resident.residence].filter(Boolean).join(' · ')}
            </SheetDescription>
          </div>
          <form
            id={FORM_ID}
            onSubmit={submit}
            noValidate
            aria-busy={busy || undefined}
            aria-label="Hoàn tất tiếp nhận"
            className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-6"
          >
            <Section title="Ý kiến của người cao tuổi về việc vào ở">
              <div className="rounded-lg bg-muted/50 px-3 py-2">
                <OpinionBlock opinions={opinion ? [opinion] : []} />
              </div>
              {!opinion && (
                <p className="type-body-sm rounded-lg border border-warning-foreground/40 bg-warning px-3 py-2 text-warning-foreground">
                  Chưa ghi ý kiến về việc vào ở. Vẫn hoàn tất được.
                </p>
              )}
              {disagree && (
                <p className="type-body-sm rounded-lg border border-warning-foreground/40 bg-warning px-3 py-2 text-warning-foreground">
                  Người cao tuổi không đồng ý vào ở. Ghi lý do vẫn tiếp nhận.
                </p>
              )}
            </Section>

            <Section title="Kiểm tra trước khi tiếp nhận">
              {unmet === null ? (
                <Skeleton className="h-16" />
              ) : (
                <ul className="flex flex-col gap-1.5 type-body-sm">
                  {checks.map((c) => (
                    <li key={c.key} className="flex items-start gap-2">
                      <Mark ok />
                      <span>{c.label}</span>
                    </li>
                  ))}
                  {unmet.map((c) => (
                    <li key={c.code} className="flex items-start gap-2">
                      <Mark ok={c.code === BED_NOT_READY && !!bedId} />
                      <span className="flex min-w-0 flex-col gap-1.5">
                        <span className={c.code === BED_NOT_READY && bedId ? undefined : 'text-destructive'}>
                          {c.description}
                        </span>
                        {c.code === BED_NOT_READY && (
                          <span className="flex flex-col gap-1.5" role="radiogroup" aria-label="Giường Trống khác">
                            <span className="type-caption text-muted-foreground">
                              Chọn giường Trống khác để vào ở ngay
                            </span>
                            {beds === null ? (
                              <Skeleton className="h-9 w-48" />
                            ) : shownBeds.length === 0 ? (
                              <span className="type-caption text-muted-foreground">Chưa có giường Trống phù hợp.</span>
                            ) : (
                              <span className="flex flex-wrap gap-2">
                                {shownBeds.map((b) => {
                                  const id = String(b.location.bedId)
                                  return (
                                    <label
                                      key={id}
                                      className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-input bg-background px-3 type-body-sm has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                                    >
                                      <input
                                        type="radio"
                                        name="switch-bed"
                                        className="sr-only"
                                        checked={bedId === id}
                                        aria-label={b.location.label}
                                        onChange={() => setBedId(id)}
                                      />
                                      {b.location.room && b.location.bed
                                        ? `${b.location.room} · ${b.location.bed}`
                                        : b.location.label}
                                    </label>
                                  )
                                })}
                                {hiddenCount > 0 && (
                                  <Button
                                    type="button"
                                    variant="link"
                                    className="h-9 px-1"
                                    onClick={() => setAllTypes(true)}
                                  >
                                    {`Xem cả loại phòng khác (${hiddenCount})`}
                                  </Button>
                                )}
                              </span>
                            )}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {warnings.length > 0 && (
              <div className="type-body-sm flex flex-col gap-1 rounded-lg border border-warning-foreground/40 bg-warning px-3 py-2 text-warning-foreground">
                {warnings.map((w) => (
                  <p key={w}>{`${w}. Vẫn hoàn tất được.`}</p>
                ))}
              </div>
            )}

            <ChoiceTray
              id="complete-admission-reason"
              label={disagree ? 'Lý do vẫn tiếp nhận' : 'Ghi chú'}
              required
              invalid={!!reasonError}
              options={STATUS_COMMAND_REASONS.COMPLETE_ADMISSION}
              value={reason}
              onChange={setReason}
            />
            {reasonError && (
              <p className="type-body-sm -mt-4 text-destructive" role="alert">
                {reasonError}
              </p>
            )}
            {failure && <ProblemAlert problem={failure} />}
          </form>
          <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t px-6 py-4">
            <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={requestClose}>
              Hủy
            </Button>
            <Button
              type="submit"
              form={FORM_ID}
              className="h-11"
              disabled={busy || unmet === null || blocking.length > 0}
            >
              {busy ? 'Đang lưu…' : 'Hoàn tất tiếp nhận'}
            </Button>
          </div>
        </div>
      </SheetContent>
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
