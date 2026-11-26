import { useState } from 'react'
import { getResidents } from '@/api'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { DiscardChangesDialog } from '@/common/DiscardChangesDialog'
import { ProblemAlert } from '@/common/ProblemAlert'
import { problemOf } from '@/common/problem'
import { CreateResident } from '../residents/CreateResident'
import { STATUS_LABELS } from '../residents/residentLabels'
import { ApplicationForm } from './ApplicationParts'

// Lập đăng ký (nhóm A BF-01 phương án B, chủ dự án chọn 2026-11-21; thay hai nút "Lập đăng ký", "Tiếp nhận mới"): một khung
// đi qua ba chặng. (1) Tìm hồ sơ có sẵn theo họ tên, mã hồ sơ, số giấy tờ (api-001 GET /residents?q=), để không tạo trùng
// hồ sơ; chỉ người Đang tiếp nhận lập đăng ký được (004 FR-001). (2) Không thấy thì "Tạo hồ sơ mới" (chỉ vai trò tạo được
// hồ sơ). (3) Form lập đăng ký của người đã chọn hoặc vừa tạo; lưu xong gọi onDone với lượt đăng ký để mở màn Hồ sơ tiếp
// nhận. Mỗi bước vẫn là một lệnh do Hành chính bấm (Q-306, Q-307); không chọn sẵn kết quả tìm.
// startStage: 'find' (màn Đăng ký tiếp nhận) hoặc 'create' (nút tạo hồ sơ ở màn Người cao tuổi, đi thẳng tạo hồ sơ).
// onOpenProfile(id): mở hồ sơ đã có khi tra căn cước thấy (2026-11-26); không truyền thì không có nút Mở hồ sơ.
// Cả ba chặng cùng bố cục đầu, chân khung cố định (2026-11-26). Đang tạo hồ sơ hoặc lập đăng ký mà đã nhập chưa lưu thì
// đóng khung (Esc, nút Đóng, nền, Hủy) phải xác nhận.
export function NewAdmissionSheet({
  startStage = 'find',
  canCreateProfile = true,
  onClose,
  onResidentCreated,
  onDone,
  onOpenProfile,
}) {
  const [stage, setStage] = useState(startStage)
  const [dirty, setDirty] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [failure, setFailure] = useState(null)
  const [searching, setSearching] = useState(false)
  const [chosen, setChosen] = useState(null)
  const [created, setCreated] = useState(null)

  function requestClose() {
    if (stage !== 'find' && dirty) setConfirmClose(true)
    else onClose()
  }

  function goTo(next) {
    setDirty(false)
    setStage(next)
  }

  async function search(event) {
    event.preventDefault()
    if (!query.trim()) return
    setFailure(null)
    setSearching(true)
    try {
      const { data } = await getResidents({ query: { q: query.trim() } })
      setResults(data.items ?? [])
    } catch (e) {
      setResults([])
      setFailure(problemOf(e))
    } finally {
      setSearching(false)
    }
  }

  let body
  if (stage === 'apply') {
    const person = created?.profile ?? chosen
    body = (
      <ApplicationForm
        residentId={person.id}
        residentName={person.personalInfo?.fullName}
        notice={
          created && (
            <div role="status" className="flex flex-col gap-1 rounded-lg bg-muted px-3 py-2 type-body-sm">
              <span>{`Đã tạo hồ sơ ${created.profile.profileCode}. Tiếp theo: lập đăng ký tiếp nhận.`}</span>
              {(created.warnings ?? []).map((w) => (
                <span key={w.code} className="text-warning-foreground">
                  {w.description}
                </span>
              ))}
            </div>
          )
        }
        onClose={requestClose}
        onDirtyChange={setDirty}
        onDone={(message, application) => onDone(message, application)}
      />
    )
  } else if (stage === 'create') {
    body = (
      <CreateResident
        onCreated={(data) => {
          setCreated(data)
          goTo('apply')
          onResidentCreated?.(data)
        }}
        onClose={requestClose}
        onDirtyChange={setDirty}
        onOpenProfile={onOpenProfile}
      />
    )
  } else {
    body = (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 flex-col gap-1 border-b px-6 pt-6 pb-4 pr-12">
          <SheetTitle className="type-title">Lập đăng ký tiếp nhận</SheetTitle>
          <SheetDescription>Tìm hồ sơ có sẵn trước; không thấy thì tạo hồ sơ mới.</SheetDescription>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-6">
          <form onSubmit={search}>
            <Field>
              <FieldLabel htmlFor="admission-find">Tìm hồ sơ</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="admission-find"
                  className="h-11"
                  placeholder="Họ tên, mã hồ sơ hoặc số căn cước"
                  autoComplete="off"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <Button type="submit" className="h-11 shrink-0" disabled={searching}>
                  {searching ? 'Đang tìm…' : 'Tìm'}
                </Button>
              </div>
            </Field>
          </form>
          <ProblemAlert problem={failure} />
          {results && (
            <div aria-live="polite" className="flex flex-col gap-2">
              {results.length === 0 ? (
                <p className="type-body-sm text-muted-foreground">
                  Không thấy hồ sơ nào khớp.{canCreateProfile ? ' Bấm "Tạo hồ sơ mới" để tạo.' : ''}
                </p>
              ) : (
                <ul aria-label="Hồ sơ tìm thấy" className="flex flex-col gap-2">
                  {results.map((r) => {
                    const open = r.status === 'ADMISSION_IN_PROGRESS'
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          disabled={!open}
                          onClick={() => {
                            setChosen(r)
                            goTo('apply')
                          }}
                          className="flex min-h-11 w-full flex-col items-start gap-0.5 rounded-[10px] border bg-card px-3 py-2 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          <span className="type-label">{`${r.personalInfo?.fullName ?? `Hồ sơ mã ${r.id}`}, ${r.profileCode}`}</span>
                          <span className="type-caption text-muted-foreground">
                            {open ? 'Đang tiếp nhận' : `${STATUS_LABELS[r.status] ?? r.status}, không lập đăng ký được`}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t px-6 py-4">
          <Button type="button" variant="outline" className="h-11" onClick={onClose}>
            Đóng
          </Button>
          {results && canCreateProfile && (
            <Button type="button" variant="outline" className="h-11" onClick={() => goTo('create')}>
              Tạo hồ sơ mới
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <Sheet open onOpenChange={(next) => !next && requestClose()}>
      <SheetContent side="center" className="gap-0 p-0 sm:max-w-3xl">
        {body}
      </SheetContent>
      <DiscardChangesDialog
        open={confirmClose}
        description={
          stage === 'create'
            ? 'Hồ sơ chưa được tạo. Đóng khung thì các ô đã nhập sẽ mất.'
            : 'Đăng ký chưa được lưu. Đóng khung thì các ô đã nhập sẽ mất.'
        }
        onKeep={() => setConfirmClose(false)}
        onDiscard={() => {
          setConfirmClose(false)
          onClose()
        }}
      />
    </Sheet>
  )
}
