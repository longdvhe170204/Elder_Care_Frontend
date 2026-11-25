import { useRef, useState } from 'react'
import { getCostsBillingSources, postCostsItemsFromEvents } from '@/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { ProblemAlert } from '@/common/ProblemAlert'
import { formatDate } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { controlClass } from './chargeLabels'
import { ResidentField } from './ResidentField'
import { useResidentDirectory } from './useResidentDirectory'

const types = {
  RESIDENCY_DAY: 'Ngày lưu trú',
  DAY_CARE_SESSION: 'Buổi bán trú',
  CARE_TASK_RESULT: 'Kết quả chăm sóc',
  DOSE: 'Liều thuốc',
  PRN_ADMINISTRATION: 'Lần dùng thuốc khi cần',
  DISPENSE_RECORD: 'Lần giao thuốc',
  FAMILY_MEAL: 'Suất ăn người thân',
  OVERNIGHT_STAY: 'Đêm ở lại',
  ACTIVITY_ATTENDANCE: 'Điểm danh hoạt động',
}
const keyOf = (row) => JSON.stringify([row.sourceId, row.billingUnit])

// Gom toàn bộ (demo 2026-11-25, E; lệch Q-307 "không đưa danh sách chưa lập", chờ chủ dự án duyệt khi review PR):
// Hành chính bấm một lần, màn tra mọi loại nguồn trong khoảng ngày, lấy nguồn chưa có khoản và lập hàng loạt theo từng
// loại bằng API sẵn có (backend vẫn kiểm FR-006, FR-007, FR-011 và bỏ qua nguồn không đạt kèm lý do). Mỗi loại một
// Idempotency-Key cố định cho tới khi đổi bộ lọc, để bấm lại sau lỗi không lập trùng.
async function collectAll({ residentId, from, to }, keys) {
  const perType = []
  for (const type of Object.keys(types)) {
    const { data } = await getCostsBillingSources({ query: { residentId, type, from, to } })
    const sourceUnits = (data ?? [])
      .filter((row) => !row.existingItemId)
      .map(({ sourceId, billingUnit }) => ({ sourceId, billingUnit }))
    if (!sourceUnits.length) continue
    if (!keys.has(type)) keys.set(type, crypto.randomUUID())
    const { data: result } = await postCostsItemsFromEvents({
      headers: { 'Idempotency-Key': keys.get(type) },
      body: { residentId, sourceType: type, sourceUnits },
    })
    perType.push({ type, created: result.succeededIds.length, skipped: result.skipped })
  }
  return perType
}

export function BillingSources({ onChanged = () => {} }) {
  const [filter, setFilter] = useState({ residentId: '', type: 'RESIDENCY_DAY', from: '', to: '' })
  const residents = useResidentDirectory()
  const [loaded, setLoaded] = useState(null)
  const [rows, setRows] = useState(null)
  const [selected, setSelected] = useState([])
  const [result, setResult] = useState(null)
  const [failure, setFailure] = useState(null)
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const nonce = useRef(null)
  const collectKeys = useRef(new Map())
  const [collected, setCollected] = useState(null)
  const [collectHint, setCollectHint] = useState(null)
  function change(name, value) {
    collectKeys.current = new Map()
    setCollected(null)
    setCollectHint(null)
    setFilter((current) => ({ ...current, [name]: value }))
    setRows(null)
    setLoaded(null)
    setSelected([])
    setResult(null)
    nonce.current = null
  }
  async function search(event) {
    event.preventDefault()
    if (busy.current) return
    busy.current = true
    setPending(true)
    setFailure(null)
    setRows(null)
    setSelected([])
    setResult(null)
    nonce.current = null
    try {
      const query = { ...filter, residentId: Number(filter.residentId) }
      const { data } = await getCostsBillingSources({ query })
      setRows(data)
      setLoaded(query)
    } catch (error) {
      setFailure(problemOf(error))
    } finally {
      busy.current = false
      setPending(false)
    }
  }
  async function gather() {
    if (busy.current) return
    if (!filter.residentId || !filter.from || !filter.to) {
      setCollectHint('Chọn người cao tuổi, từ ngày và đến ngày trước khi gom.')
      return
    }
    busy.current = true
    setPending(true)
    setFailure(null)
    setCollectHint(null)
    setCollected(null)
    try {
      const perType = await collectAll({ ...filter, residentId: Number(filter.residentId) }, collectKeys.current)
      setCollected(perType)
      const created = perType.reduce((sum, t) => sum + t.created, 0)
      if (perType.length) onChanged(`Đã gom và lập ${created} khoản.`)
    } catch (error) {
      setFailure(problemOf(error))
    } finally {
      busy.current = false
      setPending(false)
    }
  }
  async function create() {
    if (busy.current || !selected.length || !loaded) return
    busy.current = true
    setPending(true)
    setFailure(null)
    nonce.current ??= crypto.randomUUID()
    try {
      const sourceUnits = rows
        .filter((row) => selected.includes(keyOf(row)))
        .map(({ sourceId, billingUnit }) => ({ sourceId, billingUnit }))
      const { data } = await postCostsItemsFromEvents({
        headers: { 'Idempotency-Key': nonce.current },
        body: { residentId: loaded.residentId, sourceType: loaded.type, sourceUnits },
      })
      setResult(data)
      setSelected([])
      nonce.current = null
      onChanged(`Đã lập ${data.succeededIds.length} khoản.`)
      const refreshed = await getCostsBillingSources({ query: loaded })
      setRows(refreshed.data)
    } catch (error) {
      setFailure(problemOf(error))
    } finally {
      busy.current = false
      setPending(false)
    }
  }
  return (
    <Card className="space-y-4 p-4">
      <form onSubmit={search} className="grid gap-3 sm:grid-cols-2">
        <ResidentField
          label="Người cao tuổi"
          fallbackLabel="Mã người cao tuổi"
          residents={residents}
          required
          value={filter.residentId}
          disabled={pending}
          onChange={(value) => change('residentId', value)}
        />
        <label className="type-body-sm">
          Loại nguồn
          <select
            className={controlClass}
            value={filter.type}
            disabled={pending}
            onChange={(e) => change('type', e.target.value)}
          >
            {Object.entries(types).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="type-body-sm">
          Từ ngày
          <Input
            type="date"
            required
            value={filter.from}
            disabled={pending}
            onChange={(e) => change('from', e.target.value)}
          />
        </label>
        <label className="type-body-sm">
          Đến ngày
          <Input
            type="date"
            required
            min={filter.from}
            value={filter.to}
            disabled={pending}
            onChange={(e) => change('to', e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="button" disabled={pending} onClick={gather}>
            Gom toàn bộ chi phí chưa lập
          </Button>
          <Button type="submit" variant="outline" disabled={pending}>
            Tra cứu nguồn
          </Button>
        </div>
        <p className="type-caption text-muted-foreground sm:col-span-2">
          Gom toàn bộ: tra mọi loại nguồn trong khoảng ngày và lập khoản Nháp cho các nguồn chưa có khoản. Tra cứu
          nguồn: xem và chọn từng nguồn của một loại.
        </p>
      </form>
      {collectHint && <p className="type-body-sm text-destructive">{collectHint}</p>}
      {collected && (
        <div role="status" className="space-y-1 rounded-lg border p-3 type-body-sm">
          {collected.length === 0 ? (
            <p>Mọi nguồn trong khoảng ngày đã có khoản, không còn gì để gom.</p>
          ) : (
            <>
              <p className="font-medium">
                Đã gom: lập {collected.reduce((sum, t) => sum + t.created, 0)} khoản, bỏ qua{' '}
                {collected.reduce((sum, t) => sum + t.skipped.length, 0)} nguồn.
              </p>
              <ul className="space-y-1">
                {collected.map((t) => (
                  <li key={t.type}>
                    {types[t.type]}: lập {t.created}, bỏ qua {t.skipped.length}
                    {t.skipped.length > 0 && ` (${[...new Set(t.skipped.map((x) => x.reason))].join('; ')})`}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      <ProblemAlert problem={failure} />
      {rows?.length === 0 && <p className="type-body-sm">Không có nguồn trong khoảng đã chọn.</p>}
      {rows?.map((row) => (
        <label key={keyOf(row)} className="flex items-center gap-3 border-b border-line py-3 type-body-sm">
          <input
            type="checkbox"
            disabled={pending}
            checked={selected.includes(keyOf(row))}
            onChange={(e) => {
              setSelected((current) =>
                e.target.checked ? [...current, keyOf(row)] : current.filter((key) => key !== keyOf(row)),
              )
              nonce.current = null
            }}
          />
          <span>
            {formatDate(row.incurredOn)} · {row.description} · {row.quantity} {row.unit ?? 'Chưa có đơn vị nguồn'}
          </span>
          {row.existingItemId && <span>Khoản #{row.existingItemId}</span>}
        </label>
      ))}
      {rows && (
        <Button disabled={pending || !selected.length} onClick={create}>
          Lập khoản đã chọn ({selected.length})
        </Button>
      )}
      {result && (
        <div role="status" className="space-y-2 type-body-sm">
          <p>
            Đã lập {result.succeededIds.length} khoản; bỏ qua {result.skipped.length} nguồn.
          </p>
          {result.skipped.map((s, i) => (
            <p key={`${s.source}:${i}`}>
              {s.source}: {s.reason}
            </p>
          ))}
        </div>
      )}
    </Card>
  )
}
