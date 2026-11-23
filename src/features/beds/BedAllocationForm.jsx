import { useEffect, useRef, useState } from 'react'
import { getBedAllocationsSuitableBeds, getContracts, getRoomTypes, getRooms, postBedAllocations } from '@/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChoiceTray } from '@/common/ChoiceTray'
import { ProblemAlert } from '@/common/ProblemAlert'
import { BED_ALLOCATION_REASONS } from '@/common/quickChoices'
import { problemOf } from '@/common/problem'
import { formatDateTime } from '@/common/dateTime'
import { CARE_LEVEL_LABELS } from '@/features/assessments/assessmentLabels'
import { GENDER_LABELS } from '@/features/residents/residentLabels'

// T028: người dùng tự chọn giường; đổi thời điểm hoặc tải lại luôn bỏ lựa chọn cũ. Nhóm A BF-01 (chủ dự án chọn
// 2026-11-21): bảng một lựa chọn kèm loại phòng, người cùng phòng (họ tên, giới tính, mức; 003 FR-022) và lúc sẵn sàng,
// không xếp hạng, không chọn sẵn (Q-307); ngày, giờ hai ô dd/mm/yyyy và 24 giờ ở mọi trình duyệt. defaultDate (yyyy-MM-dd):
// ngày vào của hợp đồng vừa lập, điền sẵn ô ngày (chủ dự án xác nhận không vi phạm Q-307), người dùng vẫn sửa được.

const DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
const TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/

function isoDate(text) {
  const match = DATE_PATTERN.exec(text.trim())
  if (!match) return null
  const [, d, m, y] = match.map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const displayDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '')

function roommatesText(roommates) {
  if (!roommates?.length) return 'Chưa có ai'
  return roommates
    .map((r) =>
      [r.fullName, GENDER_LABELS[r.gender]?.toLowerCase(), CARE_LEVEL_LABELS[r.careLevel]?.toLowerCase()]
        .filter(Boolean)
        .join(', '),
    )
    .join('; ')
}

function readiness(bed) {
  if (bed.earliestStartAt) return `Từ ${formatDateTime(bed.earliestStartAt)}`
  if (bed.futureAllocationFrom) return `Trống tới ${formatDateTime(bed.futureAllocationFrom)}`
  return 'Ngay'
}

export function BedAllocationForm({ resident, defaultDate, onSaved }) {
  const [bedId, setBedId] = useState('')
  const [reason, setReason] = useState('')
  const [dateText, setDateText] = useState(displayDate(defaultDate))
  const [timeText, setTimeText] = useState('')
  const [revision, setRevision] = useState(0)
  const [options, setOptions] = useState({ loading: true, beds: [] })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const command = useRef(null)
  const date = isoDate(dateText)
  const time = TIME_PATTERN.exec(timeText.trim())
  const dateError = dateText.trim() && !date ? 'Nhập ngày có thật, dạng dd/mm/yyyy' : null
  const timeError = timeText.trim() && !time ? 'Nhập giờ dạng 24 giờ, ví dụ 08:00' : null
  const startAt = date && time ? `${date}T${time[1].padStart(2, '0')}:${time[2]}:00+07:00` : undefined
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
  // phòng (003 FR-018), nên người dùng bỏ chọn được để xem mọi giường phù hợp. Tên loại phòng của từng giường cũng lấy ở đây.
  const [roomTypeOf, setRoomTypeOf] = useState({})
  const [roomType, setRoomType] = useState(null)
  const [onlyContractType, setOnlyContractType] = useState(true)
  useEffect(() => {
    let current = true
    Promise.all([getRooms({ query: {} }), getRoomTypes({ query: {} })])
      .then(([rooms, types]) => {
        if (!current) return
        const names = Object.fromEntries(types.data.map((t) => [t.id, t.name]))
        setRoomTypeOf(
          Object.fromEntries(rooms.data.map((r) => [r.id, { id: r.roomTypeId, name: names[r.roomTypeId] }])),
        )
        return getContracts({
          query: { residentId: resident.id, status: ['ACTIVE', 'PENDING_SIGNATURE', 'DRAFT'] },
        }).then((contracts) => {
          const order = ['ACTIVE', 'PENDING_SIGNATURE', 'DRAFT']
          const contract = contracts.data
            .filter((c) => order.includes(c.status) && c.roomTypeId)
            .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))[0]
          if (!current || !contract) return
          setRoomType({
            id: contract.roomTypeId,
            name: names[contract.roomTypeId] ?? 'của hợp đồng',
            rooms: new Set(rooms.data.filter((r) => r.roomTypeId === contract.roomTypeId).map((r) => r.id)),
          })
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
  function changeWhen(setter) {
    return (event) => {
      setter(event.target.value)
      setBedId('')
      setError(null)
    }
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
        <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-3">
          <label className="flex flex-col gap-2">
            Ngày bắt đầu dự kiến
            <Input
              inputMode="numeric"
              placeholder="dd/mm/yyyy"
              value={dateText}
              disabled={busy}
              aria-invalid={!!dateError || undefined}
              onChange={changeWhen(setDateText)}
            />
          </label>
          <label className="flex flex-col gap-2">
            Giờ
            <Input
              inputMode="numeric"
              placeholder="08:00"
              value={timeText}
              disabled={busy}
              aria-invalid={!!timeError || undefined}
              onChange={changeWhen(setTimeText)}
            />
          </label>
          {(dateError || timeError) && (
            <p className="type-body-sm col-span-2 text-destructive">{dateError ?? timeError}</p>
          )}
          {date && !timeText.trim() && (
            <p className="type-caption col-span-2 text-muted-foreground">Nhập giờ để kiểm giường theo thời điểm vào.</p>
          )}
        </div>
      )}
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
      {beds.length > 0 && (
        <div className="overflow-x-auto rounded-xl border">
          <table aria-label="Giường phù hợp" className="type-body-sm w-full min-w-[34rem]">
            <thead>
              <tr className="border-b text-left">
                <th className="w-10 px-3 py-2">
                  <span className="sr-only">Chọn</span>
                </th>
                <th className="type-caption px-3 py-2 text-muted-foreground">Giường</th>
                <th className="type-caption px-3 py-2 text-muted-foreground">Loại phòng</th>
                <th className="type-caption px-3 py-2 text-muted-foreground">Người cùng phòng</th>
                <th className="type-caption px-3 py-2 text-muted-foreground">Sẵn sàng</th>
              </tr>
            </thead>
            <tbody>
              {beds.map((bed) => {
                const id = String(bed.location.bedId)
                return (
                  <tr
                    key={id}
                    className="cursor-pointer border-b last:border-0 has-checked:bg-muted"
                    onClick={() => !busy && setBedId(id)}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="radio"
                        name="bed"
                        className="size-4"
                        aria-label={bed.location.label}
                        checked={bedId === id}
                        disabled={busy}
                        onChange={() => setBedId(id)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      {bed.location.room && bed.location.bed ? (
                        <span className="flex flex-col">
                          <span>{`${bed.location.room}, ${bed.location.bed}`}</span>
                          <span className="type-caption text-muted-foreground">{bed.location.label}</span>
                        </span>
                      ) : (
                        bed.location.label
                      )}
                    </td>
                    <td className="px-3 py-2">{roomTypeOf[bed.location.roomId]?.name ?? 'Chưa rõ'}</td>
                    <td className="px-3 py-2">{roommatesText(bed.roommates)}</td>
                    <td className="px-3 py-2 tabular-nums">{readiness(bed)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <ChoiceTray
        id="bed-allocation-reason"
        label="Lý do phân bổ"
        options={BED_ALLOCATION_REASONS}
        value={reason}
        onChange={setReason}
      />
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
