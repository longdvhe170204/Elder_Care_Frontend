import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { FieldDescription, FieldLabel } from '@/components/ui/field'
import { ProblemAlert } from '@/common/ProblemAlert'
import { problemOf } from '@/common/problem'
import { getFloors } from '@/api/api003'
import { getStaff } from '@/api/api008'
import { getFloorsByFloorAreaIdTemporaryNurses, postFloorsByFloorAreaIdTemporaryNurses } from '@/api/api006'
import { hhmm } from './doseRoundView'

// Chỉ định Điều dưỡng tầng khác phụ trách tạm (spec 006 BR-M07-31, Q-435): khi tầng không có Điều dưỡng nào có ca, Quản lý
// viện chọn một Điều dưỡng đang có ca ở tầng khác; người đó xác nhận được liều của tầng như Điều dưỡng có ca tại tầng,
// quyền hết khi hết ca của tầng. Backend kiểm tầng không có Điều dưỡng, tầng có ca, Điều dưỡng đang có ca.

const select = 'h-11 rounded-md border bg-background px-3 text-sm'

export function TemporaryNursePanel({ onSaved }) {
  const [floors, setFloors] = useState([])
  const [nurses, setNurses] = useState([])
  const [floorId, setFloorId] = useState('')
  const [nurseId, setNurseId] = useState('')
  const [assigned, setAssigned] = useState([])
  const [problem, setProblem] = useState(null)
  const [saving, setSaving] = useState(false)
  const key = useRef(crypto.randomUUID())

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([getFloors({}), getStaff({ query: { status: 'WORKING' } })]).then(([f, s]) => {
      if (cancelled) return
      if (f.status === 'fulfilled') setFloors(f.value.data ?? [])
      else setProblem(problemOf(f.reason))
      if (s.status === 'fulfilled') {
        const withAccount = (s.value.data ?? []).filter((p) => p.accountId)
        const nursing = withAccount.filter((p) => /điều dưỡng/i.test(p.position ?? ''))
        setNurses(nursing.length > 0 ? nursing : withAccount)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const loadAssigned = useCallback(async (id) => {
    if (!id) return setAssigned([])
    try {
      const { data } = await getFloorsByFloorAreaIdTemporaryNurses({ path: { floorAreaId: id } })
      setAssigned(data ?? [])
    } catch (error) {
      setProblem(problemOf(error))
    }
  }, [])

  async function submit(event) {
    event.preventDefault()
    if (!floorId || !nurseId) return
    setSaving(true)
    setProblem(null)
    try {
      await postFloorsByFloorAreaIdTemporaryNurses({
        path: { floorAreaId: Number(floorId) },
        headers: { 'Idempotency-Key': key.current },
        body: { nurseAccountId: Number(nurseId) },
      })
      key.current = crypto.randomUUID()
      onSaved('Đã chỉ định Điều dưỡng phụ trách tạm; quyền hết khi hết ca của tầng.')
      await loadAssigned(floorId)
    } catch (error) {
      setProblem(problemOf(error))
    } finally {
      setSaving(false)
    }
  }

  const nameOf = (accountId) => nurses.find((n) => n.accountId === accountId)?.fullName ?? `Tài khoản mã ${accountId}`

  return (
    <Card className="max-w-2xl gap-3">
      <CardHeader>
        <h2 className="type-title">Chỉ định Điều dưỡng phụ trách tạm</h2>
        <p className="type-body-sm text-muted-foreground">
          Dùng khi tầng không có Điều dưỡng nào có ca. Hệ thống không tự chỉ định (Q-307).
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ProblemAlert problem={problem} />
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="temp-floor">Tầng cần phụ trách</FieldLabel>
            <select
              id="temp-floor"
              value={floorId}
              onChange={(e) => {
                setFloorId(e.target.value)
                loadAssigned(e.target.value)
              }}
              className={select}
            >
              <option value="">Chọn tầng</option>
              {floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="temp-nurse">Điều dưỡng được chỉ định</FieldLabel>
            <select id="temp-nurse" value={nurseId} onChange={(e) => setNurseId(e.target.value)} className={select}>
              <option value="">Chọn Điều dưỡng đang có ca ở tầng khác</option>
              {nurses.map((n) => (
                <option key={n.accountId} value={n.accountId}>
                  {n.fullName}
                </option>
              ))}
            </select>
            <FieldDescription>Người được chỉ định phải có giấy phép còn hiệu lực và đang có ca ở tầng khác.</FieldDescription>
          </div>
          <div>
            <Button type="submit" className="h-11" disabled={saving || !floorId || !nurseId}>
              Chỉ định phụ trách tạm
            </Button>
          </div>
        </form>
        {floorId && (
          <div className="flex flex-col gap-1.5 border-t pt-3">
            <span className="type-label">Đang được chỉ định ở tầng này</span>
            {assigned.length === 0 ? (
              <span className="type-body-sm text-muted-foreground">Chưa có.</span>
            ) : (
              <ul className="flex flex-col gap-1">
                {assigned.map((a) => (
                  <li key={a.id} className="flex justify-between rounded-md border px-3 py-2 type-body-sm">
                    <span>{nameOf(a.nurseAccountId)}</span>
                    <span className="text-muted-foreground tabular-nums">đến {hhmm(a.expiresAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
