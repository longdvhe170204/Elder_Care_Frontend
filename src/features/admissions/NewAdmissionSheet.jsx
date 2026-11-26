import { useState } from 'react'
import { getResidents } from '@/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
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
// Đang tạo hồ sơ mà đã nhập chưa lưu thì đóng khung (Esc, nút Đóng, nền, Hủy) phải xác nhận.
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

  function requestClose() {
    if (stage === 'create' && dirty) setConfirmClose(true)
    else onClose()
  }
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [failure, setFailure] = useState(null)
  const [chosen, setChosen] = useState(null)
  const [created, setCreated] = useState(null)

  async function search(event) {
    event.preventDefault()
    if (!query.trim()) return
    setFailure(null)
    try {
      const { data } = await getResidents({ query: { q: query.trim() } })
      setResults(data.items ?? [])
    } catch (e) {
      setResults([])
      setFailure(problemOf(e))
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
        onClose={onClose}
        onDone={(message, application) => onDone(message, application)}
      />
    )
  } else if (stage === 'create') {
    body = (
      <CreateResident
        onCreated={(data) => {
          setDirty(false)
          setCreated(data)
          setStage('apply')
          onResidentCreated?.(data)
        }}
        onClose={requestClose}
        onDirtyChange={setDirty}
        onOpenProfile={onOpenProfile}
      />
    )
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <SheetTitle>Lập đăng ký tiếp nhận</SheetTitle>
          <SheetDescription>Tìm hồ sơ có sẵn trước; không thấy thì tạo hồ sơ mới.</SheetDescription>
        </div>
        <form onSubmit={search} className="flex flex-wrap items-end gap-2">
          <Field className="min-w-56 flex-1">
            <FieldLabel htmlFor="admission-find">Họ tên, mã hồ sơ hoặc số giấy tờ</FieldLabel>
            <Input id="admission-find" className="h-11" value={query} onChange={(e) => setQuery(e.target.value)} />
          </Field>
          <Button type="submit" variant="outline" className="h-11">
            Tìm
          </Button>
        </form>
        <ProblemAlert problem={failure} />
        {results && (
          <div className="flex flex-col gap-2">
            {results.length === 0 ? (
              <p className="type-body-sm text-muted-foreground">Không thấy hồ sơ nào khớp.</p>
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
                          setStage('apply')
                        }}
                        className="flex w-full flex-col items-start gap-0.5 rounded-[10px] border bg-card px-3 py-2 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70"
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
            {canCreateProfile && (
              <Button variant="outline" className="h-11 self-start" onClick={() => setStage('create')}>
                Tạo hồ sơ mới
              </Button>
            )}
          </div>
        )}
        <Button variant="ghost" className="h-11 self-end" onClick={onClose}>
          Đóng
        </Button>
      </div>
    )
  }

  return (
    <Sheet open onOpenChange={(next) => !next && requestClose()}>
      <SheetContent className={stage === 'create' ? 'gap-0 sm:max-w-xl' : 'overflow-y-auto p-6 sm:max-w-lg'}>
        {body}
      </SheetContent>
      <Dialog open={confirmClose} onOpenChange={setConfirmClose}>
        <DialogContent showCloseButton={false}>
          <DialogTitle>Bỏ thông tin đang nhập?</DialogTitle>
          <DialogDescription>Hồ sơ chưa được tạo. Đóng khung thì các ô đã nhập sẽ mất.</DialogDescription>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setConfirmClose(false)}>
              Tiếp tục nhập
            </Button>
            <Button
              variant="destructive"
              className="h-11"
              onClick={() => {
                setConfirmClose(false)
                onClose()
              }}
            >
              Bỏ và đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  )
}
