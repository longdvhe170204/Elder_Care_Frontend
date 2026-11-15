import { useEffect, useState } from 'react'
import { getInterestGroups, postInterestGroups } from '@/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/common/PageHeader'
import { PermissionDeniedState } from '@/common/PageState'
import { ProblemAlert } from '@/common/ProblemAlert'
import { StatusBadge } from '@/common/StatusBadge'
import { usePermissions } from '@/common/permissions/permissions'
import { problemOf } from '@/common/problem'

// Danh mục nhóm sở thích (014 FR-051; api-014 /interest-groups, thêm 2026-11-15). Phụ lục 27 dòng "Danh mục loại hoạt
// động, nhóm sở thích": Quản lý viện tạo, đổi tên, ngừng hoặc dùng lại; Trưởng tầng, Điều dưỡng, Nhân viên chăm sóc chỉ
// xem. Danh mục không xóa: nhóm đã có sở thích ghi nhận vẫn giữ tên trong hồ sơ. Ngừng hiệu lực hoàn tác được bằng "Dùng
// lại" nên không cần hộp xác nhận (DESIGN.md 9.2 điểm 5).

function send(body) {
  return postInterestGroups({ body, headers: { 'Idempotency-Key': crypto.randomUUID() } })
}

function GroupForm({ row, onSaved }) {
  const [name, setName] = useState(row?.name ?? '')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const missing = submitted && !name.trim()

  async function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    if (!name.trim()) return
    setBusy(true)
    setFailure(null)
    try {
      await send(row ? { id: row.id, name: name.trim() } : { name: name.trim() })
      onSaved(row ? 'Đã đổi tên nhóm sở thích' : 'Đã thêm nhóm sở thích')
    } catch (error) {
      setFailure(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <ProblemAlert problem={failure} />
      <Field data-invalid={missing || undefined}>
        <FieldLabel htmlFor="interest-group-name">Tên nhóm (bắt buộc)</FieldLabel>
        <Input
          id="interest-group-name"
          value={name}
          maxLength={200}
          required
          aria-invalid={missing || undefined}
          onChange={(e) => setName(e.target.value)}
        />
        {missing && <FieldError>Nhập tên nhóm sở thích</FieldError>}
      </Field>
      <Button type="submit" className="self-start" disabled={busy}>
        Lưu nhóm sở thích
      </Button>
    </form>
  )
}

export function InterestGroupsPage() {
  const { can } = usePermissions()
  const [state, setState] = useState({ status: 'loading', items: [] })
  const [reload, setReload] = useState(0)
  const [editing, setEditing] = useState(null)
  const [failure, setFailure] = useState(null)
  const [done, setDone] = useState('')
  const manage = can('ACTIVITY_CATALOG', 'CREATE')

  useEffect(() => {
    let cancelled = false
    getInterestGroups()
      .then(({ data }) => !cancelled && setState({ status: 'ready', items: data }))
      .catch((error) => !cancelled && setState({ status: 'error', items: [], problem: problemOf(error) }))
    return () => {
      cancelled = true
    }
  }, [reload])

  function saved(message) {
    setEditing(null)
    setDone(message)
    setReload((n) => n + 1)
  }

  async function changeStatus(row, status) {
    setFailure(null)
    try {
      await send({ id: row.id, name: row.name, status })
      saved(status === 'INACTIVE' ? `Đã ngừng nhóm ${row.name}` : `Đã dùng lại nhóm ${row.name}`)
    } catch (error) {
      setFailure(problemOf(error))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Nhóm sở thích"
        subtitle="Danh mục nhóm sở thích, thói quen dùng khi ghi sở thích của người cao tuổi."
      />
      {state.problem?.status === 403 ? (
        <PermissionDeniedState label="danh mục nhóm sở thích" />
      ) : (
        <section className="flex flex-col gap-4 rounded-xl border bg-card p-5" aria-busy={state.status === 'loading'}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="type-title">Danh mục</h2>
            {manage && <Button onClick={() => setEditing({ row: null })}>Thêm nhóm sở thích</Button>}
          </div>
          <p role="status" className="empty:hidden type-body-sm">
            {done}
          </p>
          <ProblemAlert problem={failure ?? state.problem} />
          {state.status === 'loading' && <p>Đang tải danh mục…</p>}
          {state.status === 'ready' && state.items.length === 0 && (
            <p>Chưa có nhóm sở thích nào. Quản lý viện thêm nhóm để nhân viên ghi được sở thích.</p>
          )}
          {state.items.length > 0 && (
            <ul aria-label="Nhóm sở thích" className="divide-y">
              {state.items.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div className="flex flex-col gap-1">
                    <p className="type-label">{row.name}</p>
                    <StatusBadge status={row.status === 'ACTIVE' ? 'Hiệu lực' : 'Ngừng hiệu lực'} />
                  </div>
                  {manage && (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" aria-label={`Sửa nhóm ${row.name}`} onClick={() => setEditing({ row })}>
                        Sửa
                      </Button>
                      {row.status === 'ACTIVE' ? (
                        <Button
                          variant="outline"
                          aria-label={`Ngừng nhóm ${row.name}`}
                          onClick={() => changeStatus(row, 'INACTIVE')}
                        >
                          Ngừng
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          aria-label={`Dùng lại nhóm ${row.name}`}
                          onClick={() => changeStatus(row, 'ACTIVE')}
                        >
                          Dùng lại
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.row ? 'Đổi tên nhóm sở thích' : 'Thêm nhóm sở thích'}</DialogTitle>
            <DialogDescription>Ví dụ: âm nhạc, cờ, làm vườn, đi lễ buổi sáng.</DialogDescription>
          </DialogHeader>
          {editing && <GroupForm key={editing.row?.id ?? 'new'} row={editing.row} onSaved={saved} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
