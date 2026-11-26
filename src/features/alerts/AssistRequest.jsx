import { useEffect, useRef, useState } from 'react'
import { HandHelping, PhoneCall } from 'lucide-react'
import {
  getEmergencyAssistCurrent,
  getIncidentFloors,
  getIncidentResidents,
  postAlertsByIdJoinHelp,
  postEmergencyAssist,
  postEmergencyAssistByIdDetails,
  postEmergencyAssistByIdFloor,
  postEmergencyAssistByIdMessages,
  postEmergencyAssistByIdWithdraw,
} from '@/api/api007'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { problemOf } from '@/common/problem'
import { ProblemAlert } from '@/common/ProblemAlert'
import { cn } from '@/lib/utils'
import { CaseDialog } from '@/features/incidents/CasePage'
import { loadAlert } from './alerts'
import { EVENTS, EVENT_LABEL, PLACES, PLACE_LABEL } from './assistView'

// Yêu cầu hỗ trợ của nhân viên (007 FR-047i, BR-M05-29; đề xuất 2026-11-23, A duyệt qua Đức Anh): khi cần người tới giúp
// mà chưa biết hoặc chưa cần tên người cao tuổi. Khác nút SOS: SOS do người cao tuổi bấm trên thiết bị của họ. Gửi ngay
// không cần điền gì; tầng xảy ra chọn sẵn tầng đang trực, đổi được trước và sau khi gửi; các mục khác không bắt buộc, điền
// trước thì gửi kèm, điền sau thì "Gửi bổ sung" (mỗi mục một lần). Hệ thống không tự tạo sự cố (Q-67).

const COMMON = 'common'
const POLL_MS = 5000
const SEARCH_DELAY_MS = 300
const MESSAGE_MAX = 200
const TIME = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })

// Số phút từ một mốc, theo đồng hồ máy; mốc sai lệch (đồng hồ giả lập của demo) thì không hiện
function minutesSince(at, now) {
  if (!at || !now) return null
  const minutes = Math.floor((now - new Date(at).getTime()) / 60000)
  return minutes >= 0 && minutes < 24 * 60 ? minutes : null
}

function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(null)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const timer = setInterval(tick, intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

const floorKey = (floorAreaId) => (floorAreaId == null ? COMMON : String(floorAreaId))

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

// Ô to có biểu tượng: lúc gấp nhìn hình nhanh hơn đọc chữ; chỉ 4 ô
function EventTiles({ value, onChange }) {
  return (
    <Field>
      <FieldLabel>Chuyện gì (không bắt buộc)</FieldLabel>
      <div role="group" aria-label="Chuyện gì" className="grid grid-cols-2 gap-2">
        {EVENTS.map(([key, label, Icon]) => {
          const on = value === key
          const urgent = key === 'CARDIAC_ARREST_OR_FAINTING'
          return (
            <Button
              key={key}
              type="button"
              variant="outline"
              aria-pressed={on}
              onClick={() => onChange(on ? '' : key)}
              className={cn(
                'h-auto min-h-16 justify-start gap-3 rounded-lg px-3 py-2 text-left whitespace-normal',
                on && 'border-2 border-primary bg-accent',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground',
                  urgent && 'bg-destructive-subtle text-destructive',
                )}
              >
                <Icon className="size-5" />
              </span>
              <span className={cn('type-label', urgent && 'text-destructive')}>{label}</span>
            </Button>
          )
        })}
      </div>
    </Field>
  )
}

// Tầng xảy ra: nút to cho từng tầng đang có ca và Khu vực chung; tầng đang trực ghi chú bên dưới tên
function FloorChoices({ floors, value, onChange, label }) {
  const options = [
    ...(floors ?? []).map((f) => [String(f.id), f.name, f.current ? 'bạn đang trực' : null]),
    [COMMON, 'Khu vực chung', 'sân, sảnh, cầu thang'],
  ]
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <div role="group" aria-label={label} className="flex flex-wrap gap-2">
        {options.map(([key, name, note]) => {
          const on = value === key
          return (
            <Button
              key={key}
              type="button"
              variant="outline"
              aria-pressed={on}
              onClick={() => onChange(key)}
              className={cn(
                'h-auto min-h-12 flex-col items-start gap-0 rounded-lg px-4 py-2 text-left',
                on && 'border-2 border-primary bg-accent',
              )}
            >
              <span className="type-label">{name}</span>
              {note && <span className="type-caption font-normal text-muted-foreground">{note}</span>}
            </Button>
          )
        })}
      </div>
    </Field>
  )
}

function placeOf(resident) {
  return [resident.roomName, resident.floorName].filter(Boolean).join(', ')
}

// Tìm người cao tuổi trong toàn viện (api-007 /incident-residents): gõ tên hoặc mã, ít nhất 2 chữ, hiện tối đa 5 người
export function ResidentSearch({ picked, onPick, id = 'assist-resident-search' }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [problem, setProblem] = useState(null)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return undefined
    let live = true
    const timer = setTimeout(() => {
      getIncidentResidents({ query: { q } }).then(
        ({ data }) => {
          if (!live) return
          setResults(data ?? [])
          setProblem(null)
        },
        (error) => live && setProblem(problemOf(error)),
      )
    }, SEARCH_DELAY_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [query])

  if (picked) {
    return (
      <div className="flex flex-wrap items-center gap-3 type-body-sm">
        <span>
          Đã chọn: <strong>{picked.fullName}</strong> ({picked.profileCode}
          {placeOf(picked) && `, ${placeOf(picked)}`})
        </span>
        <Button type="button" variant="ghost" className="h-11" onClick={() => onPick(null)}>
          Chọn người khác
        </Button>
      </div>
    )
  }
  const typed = query.trim().length >= 2
  return (
    <div className="flex flex-col gap-2">
      <Input
        id={id}
        autoFocus
        className="h-11"
        placeholder="Gõ tên, mã hoặc số phòng, ít nhất 2 chữ"
        aria-label="Tìm người cao tuổi theo tên hoặc mã"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ProblemAlert problem={problem} />
      {typed && results && results.length === 0 && (
        <p className="type-body-sm text-muted-foreground">Không thấy ai khớp. Gõ thêm hoặc bỏ qua mục này.</p>
      )}
      {typed && results && results.length > 0 && (
        <ul aria-label="Kết quả tìm" className="flex flex-col gap-2">
          {results.map((r) => (
            <li key={r.id}>
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-12 w-full flex-col items-start gap-0 rounded-lg px-4 py-2 text-left"
                onClick={() => onPick(r)}
              >
                <span className="type-label">{r.fullName}</span>
                <span className="type-caption font-normal text-muted-foreground">
                  {[r.profileCode, placeOf(r)].filter(Boolean).join(', ')}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Số gọi khi chưa ai tới hoặc không gửi được (FR-047i: số liên hệ của viện, số 115)
export function CallNumbers({ contacts }) {
  const facility = contacts?.facilityPhone
  const emergency = contacts?.emergencyNumber ?? '115'
  return (
    <div className="flex flex-wrap gap-2">
      {facility && (
        <Button variant="outline" className="h-11" nativeButton={false} render={<a href={`tel:${facility}`} />}>
          <PhoneCall aria-hidden="true" />
          Gọi viện: {facility}
        </Button>
      )}
      <Button variant="outline" className="h-11" nativeButton={false} render={<a href={`tel:${emergency}`} />}>
        <PhoneCall aria-hidden="true" />
        Gọi cấp cứu {emergency}
      </Button>
    </div>
  )
}

function recipientsText(floorName, withResident) {
  const base = floorName
    ? `Người phụ trách ca và nhân viên đang trực ${floorName}, Bác sĩ trực`
    : 'Người phụ trách ca của mọi tầng đang có ca, Bác sĩ trực'
  return withResident ? `${base}, người phụ trách người cao tuổi đã chọn` : base
}

/**
 * Hộp gửi hoặc bổ sung yêu cầu hỗ trợ. existing: cảnh báo của chính người gửi (mở từ chi tiết) thì vào thẳng phần bổ
 * sung, mục đã gửi không hiện lại. openAssists: yêu cầu hỗ trợ đang mở khác để nhắc khi có thể cùng vụ.
 */
export function AssistDialog({ existing = null, openAssists = [], onClose, onSent, onChanged, onOpenAlert, onJoined }) {
  const [floors, setFloors] = useState(null)
  const [floor, setFloor] = useState(existing ? floorKey(existing.floorAreaId) : null)
  const [sentFloor, setSentFloor] = useState(existing ? floorKey(existing.floorAreaId) : null)
  const [eventType, setEventType] = useState('')
  const [place, setPlace] = useState('')
  const [placeNote, setPlaceNote] = useState('')
  const [knowsResident, setKnowsResident] = useState('')
  const [resident, setResident] = useState(null)
  const [problem, setProblem] = useState(null)
  const [refusedContacts, setRefusedContacts] = useState(null)
  const [busy, setBusy] = useState(false)
  // Sau khi gửi: { alertId, contacts }; done là các mục đã gửi kèm (mỗi mục chỉ gửi một lần, api-007)
  const [sent, setSent] = useState(existing ? { alertId: existing.id, contacts: null } : null)
  const [done, setDone] = useState(
    existing
      ? {
          eventType: !!existing.eventType,
          place: !!existing.chosenPlace,
          placeNote: !!existing.placeNote,
          residentId: existing.residentId != null,
        }
      : {},
  )

  useEffect(() => {
    let live = true
    getIncidentFloors({}).then(
      ({ data }) => {
        if (!live) return
        const list = data ?? []
        setFloors(list)
        // Chọn sẵn tầng đang trực; người không có tầng trong ca thì chưa chọn (báo như khu vực chung)
        const own = list.find((f) => f.current)
        setFloor((current) => current ?? (own ? String(own.id) : ''))
      },
      () => {
        if (!live) return
        setFloors([])
        setFloor((current) => current ?? '')
      },
    )
    return () => {
      live = false
    }
  }, [])

  const floorName = floor && floor !== COMMON ? (floors?.find((f) => String(f.id) === floor)?.name ?? null) : null
  const floorChanged = Boolean(sent && floor && floor !== sentFloor)

  function choosePlace(next) {
    setPlace(next)
    // Sân không thuộc tầng nào: chuyển sang khu vực chung, người dùng sửa lại được
    if (next === 'YARD') setFloor(COMMON)
  }

  function pending() {
    return {
      ...(!done.eventType && eventType && { eventType }),
      ...(!done.place && place && { place }),
      ...(!done.placeNote && placeNote.trim() && { placeNote: placeNote.trim() }),
      ...(!done.residentId && resident && { residentId: resident.id }),
    }
  }

  async function sendDetails(alertId) {
    const details = pending()
    if (Object.keys(details).length === 0) return true
    try {
      await postEmergencyAssistByIdDetails({ path: { id: alertId }, body: details })
      setDone((prev) => ({ ...prev, ...Object.fromEntries(Object.keys(details).map((k) => [k, true])) }))
      return true
    } catch (error) {
      // Yêu cầu đã tới mọi người; chi tiết gửi không được thì báo trong hộp, không coi là gửi hỏng
      setProblem(problemOf(error))
      return false
    }
  }

  async function sendFloor(alertId) {
    if (!floorChanged) return true
    try {
      await postEmergencyAssistByIdFloor({
        path: { id: alertId },
        body: floor === COMMON ? { commonArea: true } : { floorAreaId: Number(floor) },
      })
      setSentFloor(floor)
      return true
    } catch (error) {
      setProblem(problemOf(error))
      return false
    }
  }

  async function send(event) {
    event.preventDefault()
    setBusy(true)
    setProblem(null)
    if (sent) {
      const floorOk = await sendFloor(sent.alertId)
      const detailsOk = await sendDetails(sent.alertId)
      setBusy(false)
      if (floorOk && detailsOk) onChanged?.('Đã gửi bổ sung')
      return
    }
    try {
      const body = floor === COMMON ? { commonArea: true } : floor ? { floorAreaId: Number(floor) } : null
      const { data } = await postEmergencyAssist({
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        ...(body ? { body } : {}),
      })
      setSent({ alertId: data.alertId, contacts: data.contacts })
      setSentFloor(floor || COMMON)
      onSent?.({ ...data, sentAt: Date.now() })
      await sendDetails(data.alertId)
    } catch (error) {
      setProblem(problemOf(error))
      setRefusedContacts(error?.problem?.contacts ?? (problemOf(error).errorCode === 'NOT_ON_SHIFT' ? {} : null))
    }
    setBusy(false)
  }

  async function joinHelp(alertId) {
    setBusy(true)
    setProblem(null)
    try {
      await postAlertsByIdJoinHelp({ path: { id: alertId }, headers: { 'Idempotency-Key': crypto.randomUUID() } })
      onJoined?.(alertId)
    } catch (error) {
      setProblem(problemOf(error))
      setBusy(false)
    }
  }

  const hasPending = Object.keys(pending()).length > 0 || floorChanged
  const recorded = [
    done.eventType && (EVENT_LABEL[eventType] ?? EVENT_LABEL[existing?.eventType]),
    done.place && (PLACE_LABEL[place] ?? PLACE_LABEL[existing?.chosenPlace]),
    done.placeNote && (placeNote.trim() || existing?.placeNote),
    done.residentId && (resident?.fullName ?? 'đã chọn người cao tuổi'),
  ].filter(Boolean)
  // Yêu cầu hỗ trợ khác đang mở ở cùng tầng: có thể cùng vụ, báo đến giúp thay vì gửi thêm
  const sameFloor =
    sent || floor == null
      ? []
      : openAssists.filter((a) =>
          floor === COMMON || floor === '' ? a.floorAreaId == null : String(a.floorAreaId) === floor,
        )
  // Người cao tuổi vừa chọn đang có yêu cầu hỗ trợ khác chưa đóng: có thể cùng vụ, báo đến giúp yêu cầu kia
  const sameResident = resident ? openAssists.filter((a) => a.residentId === resident.id && a.id !== sent?.alertId) : []
  const suggestFloor =
    resident?.floorAreaId != null &&
    String(resident.floorAreaId) !== floor &&
    (floors ?? []).some((f) => f.id === resident.floorAreaId)
  const newRecipients = !sent || floorChanged || (resident && !done.residentId)

  return (
    <CaseDialog
      title={sent ? (existing ? 'Bổ sung yêu cầu hỗ trợ' : 'Đã gửi yêu cầu hỗ trợ') : 'Cần hỗ trợ'}
      description={
        sent
          ? 'Người nhận đã được báo. Biết thêm gì hoặc chọn nhầm tầng thì sửa bên dưới, không bắt buộc.'
          : 'Bấm Gửi ngay, không cần điền gì.'
      }
      problem={problem}
      onClose={() => !busy && onClose()}
    >
      <form onSubmit={send} className="flex flex-col gap-5">
        {sent ? (
          !existing && (
            <div role="status" className="flex flex-col gap-3 rounded-lg border bg-muted/40 px-4 py-3 type-body-sm">
              <p>
                <strong>Đã báo:</strong>{' '}
                {recipientsText(
                  sentFloor === COMMON ? null : (floors?.find((f) => String(f.id) === sentFloor)?.name ?? null),
                  done.residentId,
                )}
                .
              </p>
              {recorded.length > 0 && (
                <p>
                  <strong>Đã ghi:</strong> {recorded.join(', ')}.
                </p>
              )}
              <p className="text-muted-foreground">Chưa ai tới thì gọi:</p>
              <CallNumbers contacts={sent.contacts} />
            </div>
          )
        ) : (
          <>
            {/* Trước nút gửi: gửi đi đâu, báo cho ai (góp ý demo 2026-11-24). Web không dùng GPS: nơi là tầng đang trực */}
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-lg bg-muted/60 px-4 py-3 type-body-sm">
              <dt className="type-caption text-muted-foreground uppercase">Ở đâu</dt>
              <dd>
                <strong>{floor === COMMON ? 'Khu vực chung' : (floorName ?? 'Chưa rõ tầng')}</strong>
                {floors?.find((f) => String(f.id) === floor)?.current && ' (tầng bạn đang trực)'}
              </dd>
              <dt className="type-caption text-muted-foreground uppercase">Sẽ báo</dt>
              <dd>{recipientsText(floor === COMMON ? null : floorName, Boolean(resident))}</dd>
            </dl>
            <Button
              type="submit"
              className="h-14 w-full bg-destructive text-lg text-white hover:bg-destructive/90"
              disabled={busy}
            >
              <HandHelping aria-hidden="true" />
              Gửi ngay
            </Button>
            <p className="type-caption text-muted-foreground">
              Thêm cho người tới dễ tìm (không bắt buộc, gửi trước hay sau đều được):
            </p>
            {refusedContacts && <CallNumbers contacts={refusedContacts} />}
          </>
        )}

        {eventType === 'CARDIAC_ARREST_OR_FAINTING' && (
          <Alert variant="urgent" role="alert">
            <AlertTitle>Gọi 115 ngay</AlertTitle>
            <AlertDescription>
              Làm theo quy trình cấp cứu của viện trong lúc chờ người tới, không chờ thông báo của hệ thống.
            </AlertDescription>
          </Alert>
        )}

        {sameFloor.map((a) => (
          <Alert key={a.id} variant="attention" className="gap-3 p-4">
            <p className="type-body-sm">
              {a.floorName ?? 'Khu vực chung'} đang có yêu cầu hỗ trợ chưa đóng, gửi lúc{' '}
              {TIME.format(new Date(a.firstAt))}. Nếu cùng vụ, báo bạn đến giúp thay vì gửi thêm.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="h-11" disabled={busy} onClick={() => joinHelp(a.id)}>
                Tôi đến giúp
              </Button>
              {onOpenAlert && (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 text-foreground"
                  onClick={() => onOpenAlert(a.id)}
                >
                  Xem yêu cầu đó
                </Button>
              )}
            </div>
          </Alert>
        ))}

        {sameResident.map((a) => (
          <Alert key={`resident-${a.id}`} variant="attention" className="gap-3 p-4">
            <p className="type-body-sm">
              {resident.fullName} đang có yêu cầu hỗ trợ khác chưa đóng, gửi lúc {TIME.format(new Date(a.firstAt))}. Nếu
              cùng vụ, báo bạn đến giúp yêu cầu đó{sent ? ' rồi rút yêu cầu của bạn' : ' thay vì gửi thêm'}.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="h-11" disabled={busy} onClick={() => joinHelp(a.id)}>
                Tôi đến giúp
              </Button>
              {onOpenAlert && (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 text-foreground"
                  onClick={() => onOpenAlert(a.id)}
                >
                  Xem yêu cầu đó
                </Button>
              )}
            </div>
          </Alert>
        ))}

        {floors && floors.length > 0 && (
          <FloorChoices
            floors={floors}
            value={floor}
            onChange={setFloor}
            label={sent ? 'Tầng xảy ra (đổi nếu chọn nhầm)' : 'Đổi tầng nếu không phải tầng trên'}
          />
        )}

        {!done.eventType && <EventTiles value={eventType} onChange={setEventType} />}
        {!done.place && <Chips label="Ở đâu (không bắt buộc)" options={PLACES} value={place} onChange={choosePlace} />}
        {!done.placeNote && (
          <Field>
            <FieldLabel htmlFor="assist-place-note">Ghi rõ nơi xảy ra (không bắt buộc)</FieldLabel>
            <Input
              id="assist-place-note"
              className="h-11"
              maxLength={200}
              placeholder="Ví dụ: cầu thang giữa Tầng 1 và Tầng 2"
              value={placeNote}
              onChange={(e) => setPlaceNote(e.target.value)}
            />
          </Field>
        )}

        {!done.residentId && (
          <Field>
            <FieldLabel>Có biết người cao tuổi không? (không bắt buộc)</FieldLabel>
            <ToggleGroup
              variant="outline"
              value={knowsResident ? [knowsResident] : []}
              onValueChange={(next) => {
                setKnowsResident(next[0] ?? '')
                if (next[0] !== 'known') setResident(null)
              }}
              aria-label="Có biết người cao tuổi không?"
              className="flex flex-wrap"
            >
              <ToggleGroupItem value="unknown" className="h-11 px-4">
                Chưa biết
              </ToggleGroupItem>
              <ToggleGroupItem value="known" className="h-11 px-4">
                Đã biết
              </ToggleGroupItem>
            </ToggleGroup>
            {knowsResident === 'known' && <ResidentSearch picked={resident} onPick={setResident} />}
            {suggestFloor && (
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-11 self-start rounded-lg px-4 py-2 text-left whitespace-normal"
                onClick={() => setFloor(String(resident.floorAreaId))}
              >
                {resident.fullName} ở {placeOf(resident)}: báo cho {resident.floorName}
              </Button>
            )}
          </Field>
        )}

        {sent && (
          <p className="type-body-sm text-muted-foreground">
            <strong className="text-foreground">Báo thêm khi gửi bổ sung:</strong>{' '}
            {newRecipients
              ? `${recipientsText(floor === COMMON ? null : floorName, Boolean(resident))}.`
              : 'không ai thêm.'}
          </p>
        )}

        {sent ? (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="h-11" disabled={busy || !hasPending}>
              Gửi bổ sung
            </Button>
            <Button type="button" variant="ghost" className="h-11" disabled={busy} onClick={onClose}>
              Đóng
            </Button>
          </div>
        ) : (
          // Một nút gửi duy nhất ở đầu hộp (góp ý demo 2026-11-24: hai nút gửi gây rối)
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" className="h-11" disabled={busy} onClick={onClose}>
              Hủy
            </Button>
          </div>
        )}
      </form>
    </CaseDialog>
  )
}

const STATUS_TEXT = {
  SENT: 'đã gửi, chưa ai tiếp nhận',
  RECEIVED: 'đang tới',
  ARRIVED: 'đã tới',
}

/**
 * Trạng thái yêu cầu đang mở của chính người gửi: ai đang tới, đã tới, ai đến giúp; chưa ai tiếp nhận thì số phút chờ
 * và số gọi. Yêu cầu vừa kết thúc thì báo kết quả (ai đóng, kết quả, hoặc đã thành sự cố). Tự hỏi lại, không tính là
 * thao tác của người dùng.
 */
export function AssistStatus({ sent, onOpen, onEnded, onNavigate }) {
  const [current, setCurrent] = useState(sent ?? null)
  const [ended, setEnded] = useState(null)
  const [checkedAt, setCheckedAt] = useState(null)
  const lastId = useRef(sent?.alertId ?? null)
  const endedRef = useRef(onEnded)
  const localSentAt = sent?.sentAt ?? null
  useEffect(() => {
    endedRef.current = onEnded
  }, [onEnded])
  useEffect(() => {
    let live = true
    const ask = () =>
      getEmergencyAssistCurrent({ headers: { 'X-Background-Refresh': 'true' } }).then(
        ({ data, status }) => {
          if (!live) return
          const next = status === 204 ? null : (data ?? null)
          setCurrent(next)
          setCheckedAt(Date.now())
          if (next?.alertId) {
            lastId.current = next.alertId
            setEnded(null)
          } else if (lastId.current) {
            // Yêu cầu vừa đóng hoặc thành sự cố: đọc kết quả một lần để báo người gửi
            const id = lastId.current
            lastId.current = null
            loadAlert(id).then(
              (alert) => {
                if (!live) return
                setEnded(alert)
                endedRef.current?.()
              },
              () => {},
            )
          }
        },
        () => {},
      )
    ask()
    const timer = setInterval(ask, POLL_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [sent])

  if (ended && !current?.alertId) {
    const converted = ended.status === 'CONVERTED_TO_INCIDENT' && ended.incidentId != null
    return (
      <section
        aria-label="Yêu cầu hỗ trợ của bạn"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-2 type-body-sm"
      >
        <span role="status">
          <strong>Yêu cầu hỗ trợ của bạn</strong>:{' '}
          {converted
            ? `đã thành sự cố SC-${ended.incidentId}.`
            : `đã được ${ended.closedBy ?? 'người xử lý'} đóng${ended.resolution ? `: ${ended.resolution}` : ''}.`}
        </span>
        <div className="flex flex-wrap gap-2">
          {converted && onNavigate && (
            <Button
              variant="outline"
              className="h-11"
              onClick={() => onNavigate('incidents', { incidentId: ended.incidentId })}
            >
              Mở sự cố SC-{ended.incidentId}
            </Button>
          )}
          <Button variant="outline" className="h-11" onClick={() => onOpen(ended.id)}>
            Xem yêu cầu
          </Button>
          <Button variant="ghost" className="h-11" onClick={() => setEnded(null)}>
            Đã biết
          </Button>
        </div>
      </section>
    )
  }
  if (!current?.alertId) return null
  const waiting = current.status === 'SENT'
  const minutes = waiting ? minutesSince(localSentAt ?? current.sentAt, checkedAt) : null
  const helpers = current.helperNames ?? []
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
        {minutes >= 1 && ` sau ${minutes} phút`}
        {helpers.length > 0 && `; ${helpers.join(', ')} đang đến giúp`}.
      </span>
      <div className="flex flex-wrap gap-2">
        {waiting && <CallNumbers contacts={current.contacts} />}
        <Button variant="outline" className="h-11" onClick={() => onOpen(current.alertId)}>
          Mở yêu cầu
        </Button>
      </div>
    </section>
  )
}

/**
 * Khối "Yêu cầu của bạn" khi người gửi mở yêu cầu hỗ trợ của chính mình (đề xuất 2026-11-23): ai đang lo chính, ai đến
 * giúp, bổ sung, đổi tầng, nhắn thêm, rút yêu cầu khi chưa ai tiếp nhận, số gọi. Người gửi không có nút Tiếp nhận riêng.
 */
export function AssistSenderBlock({ alert, onChanged, onDone }) {
  const commands = alert.allowedCommands ?? []
  const now = useNow()
  const [contacts, setContacts] = useState(null)
  const [editing, setEditing] = useState(false)
  const [messaging, setMessaging] = useState(false)
  const [message, setMessage] = useState('')
  const [withdrawing, setWithdrawing] = useState(false)
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null)

  useEffect(() => {
    let live = true
    getEmergencyAssistCurrent({ headers: { 'X-Background-Refresh': 'true' } }).then(
      ({ data }) => live && setContacts(data?.contacts ?? null),
      () => {},
    )
    return () => {
      live = false
    }
  }, [])

  const waiting = ['NEW', 'ESCALATED'].includes(alert.status)
  const minutes = waiting ? minutesSince(alert.firstAt, now) : null
  const helpers = alert.helpers ?? []
  const messageMissing = !message.trim()

  async function sendMessage(event) {
    event.preventDefault()
    setSubmitted(true)
    if (messageMissing) return
    setBusy(true)
    setProblem(null)
    try {
      await postEmergencyAssistByIdMessages({ path: { id: alert.id }, body: { text: message.trim() } })
      setMessage('')
      setMessaging(false)
      setSubmitted(false)
      onChanged('Đã nhắn thêm cho người nhận')
    } catch (error) {
      setProblem(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  async function withdraw(event) {
    event.preventDefault()
    setBusy(true)
    setProblem(null)
    try {
      await postEmergencyAssistByIdWithdraw({
        path: { id: alert.id },
        ...(reason.trim() ? { body: { reason: reason.trim() } } : {}),
      })
      onDone('Đã rút yêu cầu hỗ trợ')
    } catch (error) {
      setProblem(problemOf(error))
      setBusy(false)
    }
  }

  return (
    <section aria-label="Yêu cầu của bạn" className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <h2 className="type-card-title">Yêu cầu của bạn</h2>
      <p role="status" className="type-body">
        {waiting
          ? `Chưa ai tiếp nhận${minutes >= 1 ? `, đã ${minutes} phút` : ''}.`
          : `${alert.assignee ?? 'Người tiếp nhận'} ${alert.arrivedAt ? 'đã tới' : 'đang lo chính'}.`}
        {helpers.length > 0 && ` ${helpers.join(', ')} đang đến giúp.`}
      </p>
      {!withdrawing && <ProblemAlert problem={problem} />}
      <div className="flex flex-wrap gap-2">
        {commands.includes('assist-details') && (
          <Button variant="outline" className="h-11" onClick={() => setEditing(true)}>
            Bổ sung thông tin
          </Button>
        )}
        {commands.includes('change-floor') && (
          <Button variant="outline" className="h-11" onClick={() => setEditing(true)}>
            Đổi tầng
          </Button>
        )}
        {commands.includes('send-message') && (
          <Button variant="outline" className="h-11" aria-expanded={messaging} onClick={() => setMessaging((v) => !v)}>
            Nhắn thêm
          </Button>
        )}
        {commands.includes('withdraw') && (
          <Button variant="ghost" className="h-11" onClick={() => setWithdrawing(true)}>
            Rút yêu cầu
          </Button>
        )}
      </div>
      {messaging && (
        <form onSubmit={sendMessage} noValidate className="flex flex-col gap-2">
          <Field data-invalid={(submitted && messageMissing) || undefined}>
            <FieldLabel htmlFor="assist-message">Nhắn người nhận</FieldLabel>
            <Textarea
              id="assist-message"
              rows={2}
              maxLength={MESSAGE_MAX}
              placeholder="Ví dụ: cụ đã tỉnh; cần cáng"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              aria-invalid={(submitted && messageMissing) || undefined}
            />
            {submitted && messageMissing && <FieldError>Nhập nội dung nhắn</FieldError>}
          </Field>
          <Button type="submit" className="h-11 self-start" disabled={busy}>
            Gửi tin nhắn
          </Button>
        </form>
      )}
      {waiting && (
        <div className="flex flex-col gap-2">
          <p className="type-body-sm text-muted-foreground">Chưa ai tới thì gọi:</p>
          <CallNumbers contacts={contacts} />
        </div>
      )}
      {editing && (
        <AssistDialog
          existing={alert}
          onClose={() => setEditing(false)}
          onChanged={(text) => {
            setEditing(false)
            onChanged(text)
          }}
        />
      )}
      {withdrawing && (
        <CaseDialog
          title="Rút yêu cầu hỗ trợ?"
          description="Người nhận được báo không cần tới nữa. Chỉ rút khi bấm nhầm hoặc đã tự xử lý xong."
          problem={problem}
          onClose={() => !busy && setWithdrawing(false)}
        >
          <form onSubmit={withdraw} className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="assist-withdraw-reason">Lý do (không bắt buộc)</FieldLabel>
              <Input
                id="assist-withdraw-reason"
                className="h-11"
                maxLength={MESSAGE_MAX}
                placeholder="Ví dụ: bấm nhầm"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="destructive" className="h-11" disabled={busy}>
                Rút yêu cầu
              </Button>
              <Button type="button" variant="ghost" className="h-11" onClick={() => setWithdrawing(false)}>
                Quay lại
              </Button>
            </div>
          </form>
        </CaseDialog>
      )}
    </section>
  )
}

export function AssistButton({ onSent, openAssists, onOpenAlert, onJoined }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        id="request-assist"
        className="h-11 bg-destructive text-white hover:bg-destructive/90"
        onClick={() => setOpen(true)}
      >
        <HandHelping aria-hidden="true" />
        Cần hỗ trợ
      </Button>
      {open && (
        <AssistDialog
          openAssists={openAssists}
          onClose={() => setOpen(false)}
          onSent={onSent}
          onOpenAlert={(id) => {
            setOpen(false)
            onOpenAlert?.(id)
          }}
          onJoined={(id) => {
            setOpen(false)
            onJoined?.(id)
          }}
        />
      )}
    </>
  )
}
