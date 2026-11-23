import { useEffect, useState } from 'react'
import { HandHelping } from 'lucide-react'
import {
  getEmergencyAssistCurrent,
  getIncidentFloors,
  postEmergencyAssist,
  postEmergencyAssistByIdDetails,
} from '@/api/api007'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { problemOf } from '@/common/problem'
import { CaseDialog } from '@/features/incidents/CasePage'

// Yêu cầu hỗ trợ của nhân viên (007 FR-047i, BR-M05-29): khi cần người tới giúp mà chưa biết hoặc chưa cần tên người cao
// tuổi. Khác nút SOS: SOS do người cao tuổi bấm trên thiết bị của họ. Gửi trước để người trong ca nhận ngay, rồi gửi nơi,
// loại sự việc trong cùng thao tác; hệ thống không tự tạo sự cố (Q-67).
const EVENTS = [
  ['FALL', 'Ngã'],
  ['CARDIAC_ARREST_OR_FAINTING', 'Ngừng tim, ngất'],
  ['AGITATION_OR_VIOLENCE', 'Kích động, bạo lực'],
  ['OTHER', 'Khác'],
]
const PLACES = [
  ['ROOM', 'Phòng'],
  ['RESTROOM', 'Nhà vệ sinh'],
  ['CORRIDOR', 'Hành lang'],
  ['COMMON_ROOM', 'Phòng sinh hoạt chung'],
  ['YARD', 'Sân'],
  ['OTHER', 'Nơi khác'],
]
const POLL_MS = 5000

function Chips({ label, options, value, onChange }) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <ToggleGroup
        variant="outline"
        value={value ? [value] : []}
        onValueChange={(next) => onChange(next[0] ?? '')}
        aria-label={label}
        className="flex flex-wrap"
      >
        {options.map(([key, text]) => (
          <ToggleGroupItem key={key} value={key} className="h-11 px-4">
            {text}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  )
}

function AssistDialog({ onClose, onSent }) {
  const [floors, setFloors] = useState(null)
  const [floorId, setFloorId] = useState('')
  const [eventType, setEventType] = useState('')
  const [place, setPlace] = useState('')
  const [placeNote, setPlaceNote] = useState('')
  const [problem, setProblem] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    getIncidentFloors({}).then(
      ({ data }) => live && setFloors(data ?? []),
      () => live && setFloors([]),
    )
    return () => {
      live = false
    }
  }, [])

  const own = floors?.find((f) => f.current) ?? null

  async function send(event) {
    event.preventDefault()
    setBusy(true)
    setProblem(null)
    try {
      const { data } = await postEmergencyAssist({ headers: { 'Idempotency-Key': crypto.randomUUID() } })
      const details = {
        ...(eventType && { eventType }),
        ...(place && { place }),
        ...(placeNote.trim() && { placeNote: placeNote.trim() }),
        ...(!own && floorId && { floorAreaId: Number(floorId) }),
      }
      let detailProblem = null
      if (Object.keys(details).length > 0) {
        // Yêu cầu đã tới mọi người; nơi gửi không được (ví dụ đã gửi trước đó) thì báo, không coi là gửi hỏng
        await postEmergencyAssistByIdDetails({ path: { id: data.alertId }, body: details }).catch((error) => {
          detailProblem = problemOf(error)
        })
      }
      onSent(data, detailProblem)
    } catch (error) {
      setProblem(problemOf(error))
      setBusy(false)
    }
  }

  return (
    <CaseDialog
      title="Cần hỗ trợ"
      description="Báo ngay Người phụ trách ca, Bác sĩ trực và nhân viên cùng tầng đang trong ca. Không cần biết tên người cao tuổi."
      problem={problem}
      onClose={() => !busy && onClose()}
    >
      <form onSubmit={send} className="flex flex-col gap-4">
        {own ? (
          <p className="type-body-sm">
            Tầng đang trực: <strong>{own.name}</strong>
          </p>
        ) : (
          (floors?.length ?? 0) > 0 && (
            <Field>
              <FieldLabel htmlFor="assist-floor">Tầng cần hỗ trợ</FieldLabel>
              <select
                id="assist-floor"
                value={floorId}
                onChange={(e) => setFloorId(e.target.value)}
                className="h-11 w-full rounded-md border border-input bg-transparent px-3"
              >
                <option value="">Chưa chọn</option>
                {floors.map((f) => (
                  <option key={f.id} value={String(f.id)}>
                    {f.name}
                  </option>
                ))}
              </select>
            </Field>
          )
        )}
        <Chips label="Chuyện gì (không bắt buộc)" options={EVENTS} value={eventType} onChange={setEventType} />
        <Chips label="Ở đâu (không bắt buộc)" options={PLACES} value={place} onChange={setPlace} />
        <Field>
          <FieldLabel htmlFor="assist-place-note">Ghi rõ nơi (không bắt buộc)</FieldLabel>
          <Input
            id="assist-place-note"
            className="h-11"
            maxLength={200}
            placeholder="Ví dụ: hành lang gần phòng 101"
            value={placeNote}
            onChange={(e) => setPlaceNote(e.target.value)}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="h-11" disabled={busy}>
            Gửi ngay
          </Button>
          <Button type="button" variant="ghost" className="h-11" disabled={busy} onClick={onClose}>
            Hủy
          </Button>
        </div>
      </form>
    </CaseDialog>
  )
}

const STATUS_TEXT = {
  SENT: 'đã gửi, chưa ai tiếp nhận',
  RECEIVED: 'đang tới',
  ARRIVED: 'đã tới',
}

// Trạng thái yêu cầu đang mở của chính người gửi: ai đang tới, đã tới; tự hỏi lại, không tính là thao tác của người dùng
export function AssistStatus({ sent, onOpen }) {
  const [current, setCurrent] = useState(sent ?? null)
  useEffect(() => {
    let live = true
    const ask = () =>
      getEmergencyAssistCurrent({ headers: { 'X-Background-Refresh': 'true' } }).then(
        ({ data, status }) => live && setCurrent(status === 204 ? null : (data ?? null)),
        () => {},
      )
    ask()
    const timer = setInterval(ask, POLL_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [sent])
  if (!current?.alertId) return null
  return (
    <section
      aria-label="Yêu cầu hỗ trợ của bạn"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-2 type-body-sm"
    >
      <span role="status">
        <strong>Yêu cầu hỗ trợ của bạn</strong>:{' '}
        {current.receiverName
          ? `${current.receiverName} ${STATUS_TEXT[current.status] ?? ''}`
          : STATUS_TEXT[current.status]}
        .
      </span>
      <Button variant="outline" className="h-11" onClick={() => onOpen(current.alertId)}>
        Mở yêu cầu
      </Button>
    </section>
  )
}

export function AssistButton({ onSent }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button id="request-assist" variant="outline" className="h-11 bg-card" onClick={() => setOpen(true)}>
        <HandHelping aria-hidden="true" />
        Cần hỗ trợ
      </Button>
      {open && (
        <AssistDialog
          onClose={() => setOpen(false)}
          onSent={(data, detailProblem) => {
            setOpen(false)
            onSent(data, detailProblem)
          }}
        />
      )}
    </>
  )
}
