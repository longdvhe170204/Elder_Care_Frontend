import { useEffect, useRef, useState } from 'react'
import { getBedAllocationsSuitableBeds, getContracts, getRoomTypes, getRooms, postBedAllocations } from '@/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ProblemAlert } from '@/common/ProblemAlert'
import { problemOf } from '@/common/problem'
import { formatDateTime } from '@/common/dateTime'

// T028: người dùng tự chọn giường; đổi thời điểm hoặc tải lại luôn bỏ lựa chọn cũ.
export function BedAllocationForm({ resident, onSaved }) {
  const [bedId, setBedId] = useState('')
  const [reason, setReason] = useState('')
  const [localTime, setLocalTime] = useState('')
  const [revision, setRevision] = useState(0)
  const [options, setOptions] = useState({ loading: true, beds: [] })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const command = useRef(null)
  const startAt = localTime ? `${localTime.length === 16 ? `${localTime}:00` : localTime}+07:00` : undefined
  useEffect(() => {
    let current = true
    getBedAllocationsSuitableBeds({ query: { residentId: resident.id, startAt } })
      .then(({ data }) => current && setOptions({ loading: false, beds: data }))
      .catch((cause) => {
        if (current) {
          setOptions({ loading: false, beds: [] })
          setError(problemOf(cause))
        }
      })
    return () => {
      current = false
    }
  }, [resident.id, startAt, revision])
  // 4b (chủ dự án chọn 2026-11-21): loại phòng của hợp đồng (Hiệu lực, Chờ ký, rồi Nháp) và loại phòng của từng phòng
  // (GET /rooms) để mặc định chỉ hiện giường đúng loại phòng; không đọc được thì không lọc. Backend không chặn theo loại
  // phòng (003 FR-018), nên người dùng bỏ chọn được để xem mọi giường phù hợp.
  const [roomType, setRoomType] = useState(null)
  const [onlyContractType, setOnlyContractType] = useState(true)
  useEffect(() => {
    let current = true
    Promise.all([
      getContracts({ query: { residentId: resident.id, status: ['ACTIVE', 'PENDING_SIGNATURE', 'DRAFT'] } }),
      getRooms({ query: {} }),
      getRoomTypes({ query: {} }),
    ])
      .then(([contracts, rooms, types]) => {
        const order = ['ACTIVE', 'PENDING_SIGNATURE', 'DRAFT']
        const contract = contracts.data
          .filter((c) => order.includes(c.status) && c.roomTypeId)
          .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))[0]
        if (!current || !contract) return
        setRoomType({
          id: contract.roomTypeId,
          name: types.data.find((t) => t.id === contract.roomTypeId)?.name ?? 'của hợp đồng',
          rooms: new Set(rooms.data.filter((r) => r.roomTypeId === contract.roomTypeId).map((r) => r.id)),
        })
      })
      .catch(() => {})
    return () => {
      current = false
    }
  }, [resident.id])
  const beds =
    roomType && onlyContractType ? options.beds.filter((bed) => roomType.rooms.has(bed.location.roomId)) : options.beds
  function reload() {
    setBedId('')
    setError(null)
    setOptions({ loading: true, beds: [] })
    setRevision((value) => value + 1)
  }
  async function submit(event) {
    event.preventDefault()
    if (pending.current || options.loading || !bedId || !reason.trim()) return
    const body = { residentId: resident.id, bedId: Number(bedId), reason: reason.trim(), ...(startAt && { startAt }) }
    const signature = JSON.stringify(body)
    if (command.current?.signature !== signature) command.current = { signature, key: crypto.randomUUID() }
    pending.current = true
    setBusy(true)
    setError(null)
    try {
      const result = await postBedAllocations({ body, headers: { 'Idempotency-Key': command.current.key } })
      onSaved(result.data)
    } catch (cause) {
      setError(problemOf(cause))
      if (cause.status && cause.status < 500) command.current = null
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4 rounded-xl border bg-card p-4"
      aria-label="Chọn giường phân bổ"
    >
      <h2 className="type-title-sm">
        Phân bổ cho {resident.fullName} {resident.profileCode && `(${resident.profileCode})`}
      </h2>
      {resident.status === 'ADMISSION_IN_PROGRESS' && (
        <label className="flex flex-col gap-2">
          Bắt đầu dự kiến
          <Input
            type="datetime-local"
            value={localTime}
            disabled={busy}
            onChange={(event) => {
              setLocalTime(event.target.value)
              setBedId('')
              setOptions({ loading: true, beds: [] })
              setError(null)
            }}
          />
        </label>
      )}
      <label className="flex flex-col gap-2">
        Giường phù hợp
        <select
          className="h-11 w-full rounded-md border bg-background px-3"
          value={bedId}
          disabled={busy || options.loading}
          onChange={(event) => setBedId(event.target.value)}
        >
          <option value="">Chọn giường</option>
          {beds.map((bed) => (
            <option key={bed.location.bedId} value={bed.location.bedId}>
              {bed.location.label}
            </option>
          ))}
        </select>
      </label>
      {roomType && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="size-4"
            checked={onlyContractType}
            disabled={busy}
            onChange={(event) => {
              setOnlyContractType(event.target.checked)
              setBedId('')
            }}
          />
          Chỉ giường loại {roomType.name} của hợp đồng
        </label>
      )}
      {options.loading && <p aria-busy="true">Đang tải giường phù hợp…</p>}
      {!options.loading && !error && !beds.length && <p>Chưa có giường phù hợp tại thời điểm này.</p>}
      {options.beds
        .filter((bed) => String(bed.location.bedId) === bedId && bed.earliestStartAt)
        .map((bed) => (
          <p key={bed.location.bedId}>Hạn giường sẵn sàng: {formatDateTime(bed.earliestStartAt)}</p>
        ))}
      <label className="flex flex-col gap-2">
        Lý do phân bổ
        <Input value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} required />
      </label>
      {error && <ProblemAlert problem={error} />}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || options.loading || !bedId || !reason.trim()}>
          Xác nhận phân bổ
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={reload}>
          Tải lại giường
        </Button>
      </div>
    </form>
  )
}
