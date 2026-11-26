import { useEffect, useRef, useState } from 'react'
import { getBedAllocationsSuitableBeds, getContracts, getRoomTypes, getRooms, postBedAllocations } from '@/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChoiceTray } from '@/common/ChoiceTray'
import { DateField } from '@/common/DateField'
import { ProblemAlert } from '@/common/ProblemAlert'
import { BED_ALLOCATION_REASONS } from '@/common/quickChoices'
import { problemOf } from '@/common/problem'
import { formatDateTime } from '@/common/dateTime'
import { displayDate, isoDate } from '@/common/dateText'

// T028: người dùng tự chọn giường; đổi thời điểm hoặc tải lại luôn bỏ lựa chọn cũ. Audit BF-01 2026-11-26 (chủ dự án duyệt
// bản phác): giường gom theo khu – tầng, mỗi phòng một dòng (tên, loại phòng), giường chọn được là chip tách rời; không xếp
// hạng, không chọn sẵn (Q-307). Không hiện người cùng phòng (chủ dự án chọn 2026-11-26; backend chưa điền `roommates`).
// Người Đang tiếp nhận bắt buộc ghi ngày, giờ vào (chủ dự án chọn 2026-11-26, FR-023 đặt trước giường cho ngày vào).
// defaultDate (yyyy-MM-dd): ngày vào của hợp đồng vừa lập, điền sẵn ô ngày (chủ dự án xác nhận không vi phạm Q-307).
// formId: form nằm trong khung riêng (BedAllocationSheet), nút gửi ở chân khung; onStateChange({ dirty, busy }) cho khung.

const TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/

const CHIP =
  'inline-flex h-9 cursor-pointer items-center rounded-lg border border-input bg-background px-3 type-body-sm ' +
  'has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground ' +
  'has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-disabled:cursor-default has-disabled:opacity-60'

const SMALL_CHIP = CHIP.replace('h-9', 'h-8').replace('px-3', 'px-2.5')

// Phòng nam, phòng nữ (003 FR-018 (c)): danh sách chỉ gồm phòng hợp giới tính, ghi chính sách để người dùng thấy
const GENDER_POLICY = { MALE: 'Phòng nam', FEMALE: 'Phòng nữ', UNRESTRICTED: 'Không giới hạn giới tính' }

// Chip lọc gọn: bỏ chữ "Phòng" đầu tên loại phòng (Phòng đôi → Đôi)
const shortType = (name) => {
  const short = (name ?? 'Chưa rõ').replace(/^phòng\s+/i, '')
  return short.charAt(0).toUpperCase() + short.slice(1)
}

function readiness(bed) {
  if (bed.earliestStartAt) return `từ ${formatDateTime(bed.earliestStartAt)}`
  if (bed.futureAllocationFrom) return `trống tới ${formatDateTime(bed.futureAllocationFrom)}`
  return null
}

// Giữ thứ tự backend (khu, tầng, phòng): [{ key, title, rooms: [{ id, name, beds }] }]
function groupBeds(beds) {
  const groups = []
  for (const bed of beds) {
    const { area, floor, room, roomId } = bed.location
    const key = `${area}|${floor}`
    let group = groups.at(-1)
    if (group?.key !== key) {
      group = { key, title: [area, floor].filter(Boolean).join(' – '), rooms: [] }
      groups.push(group)
    }
    let entry = group.rooms.at(-1)
    if (entry?.id !== roomId) {
      entry = { id: roomId, name: room ?? bed.location.label, beds: [] }
      group.rooms.push(entry)
    }
    entry.beds.push(bed)
  }
  return groups
}

function Required() {
  return (
    <span className="ml-0.5 text-destructive" aria-hidden="true">
      *
    </span>
  )
}

export function BedAllocationForm({ resident, defaultDate, onSaved, formId, onStateChange, onOpenWaitingList }) {
  const inSheet = !!formId
  const admitting = resident.status === 'ADMISSION_IN_PROGRESS'
  const [bedId, setBedId] = useState('')
  const [reason, setReason] = useState('')
  const [dateText, setDateText] = useState(displayDate(defaultDate))
  const [timeText, setTimeText] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [options, setOptions] = useState({ loading: true, beds: [] })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const command = useRef(null)
  const date = isoDate(dateText)
  const time = TIME_PATTERN.exec(timeText.trim())
  const dateError = dateText.trim()
    ? !date && 'Nhập ngày có thật, dạng DD/MM/YYYY'
    : admitting && attempted && 'Nhập ngày vào'
  const timeError = timeText.trim() ? !time && 'Nhập giờ dạng 24 giờ, HH:MM' : admitting && attempted && 'Nhập giờ vào'
  const startAt = date && time ? `${date}T${time[1].padStart(2, '0')}:${time[2]}:00+07:00` : undefined
  const dirty = !!bedId || !!reason.trim() || dateText !== displayDate(defaultDate) || !!timeText.trim()
  useEffect(() => {
    onStateChange?.({ dirty, busy })
  }, [dirty, busy, onStateChange])
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
  }, [resident.id, startAt])
  // 4b (chủ dự án chọn 2026-11-21): loại phòng của hợp đồng (Hiệu lực, Chờ ký, rồi Nháp) được bật sẵn ở chip lọc; đây chỉ là
  // bộ lọc, không chọn sẵn giường. Backend không chặn theo loại phòng (003 FR-018), nên người dùng chọn "Tất cả" được.
  const [roomTypeOf, setRoomTypeOf] = useState({})
  const [contractType, setContractType] = useState(null)
  const [pickedType, setPickedType] = useState(null)
  const typeFilter = pickedType ?? contractType ?? 'all'
  useEffect(() => {
    let current = true
    Promise.all([getRooms({ query: {} }), getRoomTypes({ query: {} })])
      .then(([rooms, types]) => {
        if (!current) return
        const typeById = Object.fromEntries(types.data.map((t) => [t.id, t]))
        setRoomTypeOf(
          Object.fromEntries(
            rooms.data.map((r) => [
              r.id,
              {
                id: r.roomTypeId,
                name: typeById[r.roomTypeId]?.name,
                beds: typeById[r.roomTypeId]?.standardBeds,
                gender: r.genderPolicy,
              },
            ]),
          ),
        )
        return getContracts({
          query: { residentId: resident.id, status: ['ACTIVE', 'PENDING_SIGNATURE', 'DRAFT'] },
        }).then((contracts) => {
          const order = ['ACTIVE', 'PENDING_SIGNATURE', 'DRAFT']
          const contract = contracts.data
            .filter((c) => order.includes(c.status) && c.roomTypeId)
            .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))[0]
          if (current && contract) setContractType(String(contract.roomTypeId))
        })
      })
      .catch(() => {})
    return () => {
      current = false
    }
  }, [resident.id])
  const typeOf = (bed) => roomTypeOf[bed.location.roomId]
  const types = [
    ...new Map(
      options.beds
        .map(typeOf)
        .filter((t) => t?.id != null)
        .map((t) => [String(t.id), t]),
    ),
  ]
    .sort(([, a], [, b]) => (a.beds ?? 99) - (b.beds ?? 99) || (a.name ?? '').localeCompare(b.name ?? '', 'vi'))
    .map(([id, t]) => [id, shortType(t.name), t.name])
  const beds =
    typeFilter === 'all' ? options.beds : options.beds.filter((bed) => String(typeOf(bed)?.id) === typeFilter)
  const groups = groupBeds(beds)
  function changeWhen(setter) {
    return (value) => {
      setter(value)
      setBedId('')
      setError(null)
    }
  }
  async function submit(event) {
    event.preventDefault()
    setAttempted(true)
    if (pending.current || options.loading || !bedId || !reason.trim()) return
    if (dateText.trim() || timeText.trim() || admitting) {
      if (!startAt) return
    }
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
  const chip = (value, label, checked, onChange, ariaLabel, className = CHIP) => (
    <label key={value} className={className}>
      <input
        type="radio"
        className="sr-only"
        checked={checked}
        disabled={busy}
        aria-label={ariaLabel}
        onChange={onChange}
      />
      {label}
    </label>
  )
  return (
    <form
      id={formId}
      onSubmit={submit}
      noValidate
      aria-busy={busy || undefined}
      aria-label="Chọn giường phân bổ"
      className={inSheet ? 'flex flex-col gap-6' : 'flex flex-col gap-5 rounded-xl border bg-card p-4'}
    >
      {!inSheet && (
        <h2 className="type-title-sm">
          Phân bổ cho {resident.fullName} {resident.profileCode && `(${resident.profileCode})`}
        </h2>
      )}
      {admitting && (
        <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-x-3 gap-y-2">
          <label htmlFor="bed-allocation-date" className="type-label">
            Ngày vào dự kiến
            <Required />
          </label>
          <label htmlFor="bed-allocation-time" className="type-label">
            Giờ
            <Required />
          </label>
          <DateField
            id="bed-allocation-date"
            value={dateText}
            disabled={busy}
            invalid={!!dateError}
            aria-required="true"
            onChange={changeWhen(setDateText)}
          />
          <Input
            id="bed-allocation-time"
            inputMode="numeric"
            placeholder="HH:MM"
            maxLength={5}
            autoComplete="off"
            className="h-11 tabular-nums"
            value={timeText}
            disabled={busy}
            aria-required="true"
            aria-invalid={!!timeError || undefined}
            onChange={(event) => changeWhen(setTimeText)(event.target.value)}
          />
          {(dateError || timeError) && (
            <p className="type-body-sm col-span-2 text-destructive" role="alert">
              {dateError || timeError}
            </p>
          )}
        </div>
      )}
      {types.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span id="bed-allocation-type" className="type-label">
            Loại phòng
          </span>
          <div role="radiogroup" aria-labelledby="bed-allocation-type" className="flex flex-wrap gap-1.5">
            {[['all', 'Tất cả', 'Tất cả loại phòng'], ...types].map(([value, label, fullName]) =>
              chip(
                value,
                label,
                typeFilter === value,
                () => {
                  setPickedType(value)
                  setBedId('')
                },
                fullName,
                SMALL_CHIP,
              ),
            )}
          </div>
        </div>
      )}
      <fieldset className="flex flex-col">
        <legend className="type-label mb-2">
          Giường
          <Required />
        </legend>
        {options.loading && (
          <p className="type-body-sm text-muted-foreground" aria-busy="true">
            Đang tải giường phù hợp…
          </p>
        )}
        {!options.loading && !error && !beds.length && (
          <div className="flex flex-col items-start gap-1 type-body-sm">
            <p>Chưa có giường phù hợp tại thời điểm này.</p>
            {onOpenWaitingList && (
              <Button type="button" variant="link" className="h-auto p-0" onClick={onOpenWaitingList}>
                Mở Danh sách chờ
              </Button>
            )}
          </div>
        )}
        {groups.map((group) => (
          <div key={group.key} className="flex flex-col border-t pt-4 first-of-type:border-0 first-of-type:pt-0">
            <p className="type-label text-muted-foreground">{group.title}</p>
            <ul className="flex flex-col">
              {group.rooms.map((room) => (
                <li
                  key={room.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2 border-b py-3 last:border-0"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="type-body font-medium">{room.name}</span>
                    <span className="type-caption text-muted-foreground">
                      {[roomTypeOf[room.id]?.name ?? 'Chưa rõ loại phòng', GENDER_POLICY[roomTypeOf[room.id]?.gender]]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="flex flex-wrap justify-end gap-2">
                    {room.beds.map((bed) => {
                      const id = String(bed.location.bedId)
                      const when = readiness(bed)
                      return chip(
                        id,
                        when ? `${bed.location.bed} · ${when}` : bed.location.bed,
                        bedId === id,
                        () => setBedId(id),
                        when ? `${bed.location.label}, ${when}` : bed.location.label,
                      )
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {attempted && !options.loading && beds.length > 0 && !bedId && (
          <p className="type-body-sm mt-2 text-destructive" role="alert">
            Chọn một giường
          </p>
        )}
      </fieldset>
      <ChoiceTray
        id="bed-allocation-reason"
        label="Lý do phân bổ"
        required
        invalid={attempted && !reason.trim()}
        options={BED_ALLOCATION_REASONS}
        value={reason}
        onChange={setReason}
      />
      {error && <ProblemAlert problem={error} />}
      {!inSheet && (
        <Button type="submit" className="h-11 self-start" disabled={busy || options.loading}>
          {busy ? 'Đang lưu…' : 'Xác nhận phân bổ'}
        </Button>
      )}
    </form>
  )
}
