import { useEffect, useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ProblemAlert } from '@/common/ProblemAlert'
import { ResidentAvatar } from '@/common/ResidentAvatar'
import { usePermissions } from '@/common/permissions/permissions'
import { problemOf } from '@/common/problem'
import { cn } from '@/lib/utils'
import { createAlert, loadIncidentTypes, runAlertCommand } from '@/features/alerts/alerts'
import { getAlerts, getIncidentResidents, postEmergencyAssist } from '@/api/api007'
import { typeLabel } from '@/features/alerts/alertView'
import { LevelChoices } from './CaseFormParts'
import { CasePage } from './CasePage'
import { IncidentTypePicker } from './IncidentTypePicker'
import { loadFloorChoices, loadOpenIncidents, loadResidentChoices, recordIncident, runIncidentCommand } from './incidents'
import { FAMILY_METHODS, LEVEL_LABEL, needsLowerReason, presetLevel, vietnamIso, vietnamNowLocal } from './incidentView'

// Báo sự việc (đề xuất 2026-11-24, góp ý demo BF-06): một form thay cho "Tạo cảnh báo" và "Ghi nhận sự cố" vốn giống hệt
// nhau. Trang Cảnh báo mở form "Tạo cảnh báo", trang Sự cố mở form "Ghi sự cố"; đổi qua lại bằng một dòng nhỏ khi cả hai làm được
// (bước 1, FR-026). Loại không phải sức khỏe (đồ gửi, cơ sở vật chất) và người không có quyền
// tạo cảnh báo luôn ghi sự cố; người chỉ có quyền tạo cảnh báo luôn tạo cảnh báo. Mức chọn sẵn theo mặc định của loại,
// mức thấp hơn mặc định của sự cố cần lý do (FR-042). Mô tả để trống thì ghép tên loại và nơi xảy ra (backend bắt buộc).

const QUICK_PLACES = ['Phòng', 'Nhà vệ sinh', 'Hành lang', 'Phòng sinh hoạt chung', 'Sân']
const AWAY_STATUS_TEXT = {
  HOSPITALIZED: 'đang điều trị tại bệnh viện',
  TEMPORARILY_ABSENT: 'đang tạm vắng',
  OFF_SITE_ACTIVITY: 'đang ở hoạt động bên ngoài',
}

const RESIDENT_TILES_MAX = 9
const OPEN_ALERT = ['NEW', 'ESCALATED', 'RECEIVED', 'IN_PROGRESS']
const SEARCH_DELAY_MS = 300

// Chọn người cao tuổi (đề xuất 2026-11-24): ô tìm luôn hiện, con trỏ đặt sẵn. Gõ tên hoặc mã thì lọc ngay các cụ trong
// phạm vi của mình (Điều dưỡng, Chăm sóc: cụ được phân công trong ca), đồng thời tìm cả viện qua /incident-residents vì
// ghi nhận sự cố miễn kiểm tra phạm vi (BF-06 bước 7); kết quả có phòng, tầng, cụ ở tầng mình đang trực lên đầu.
function ResidentPicker({ residents, currentFloorId, onPick }) {
  const [query, setQuery] = useState('')
  const [remote, setRemote] = useState([])
  const q = query.trim()

  useEffect(() => {
    if (q.length < 2) return undefined
    let live = true
    const timer = setTimeout(() => {
      getIncidentResidents({ query: { q } }).then(
        ({ data }) => live && setRemote(data ?? []),
        () => live && setRemote([]),
      )
    }, SEARCH_DELAY_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [q])

  const needle = q.toLowerCase()
  const local = residents.filter((r) => !needle || `${r.name} ${r.code}`.toLowerCase().includes(needle))
  const placeOf = new Map(
    (q.length >= 2 ? remote : []).map((r) => [r.id, [r.roomName, r.floorName].filter(Boolean).join(', ')]),
  )
  const extra =
    q.length >= 2
      ? remote
          .filter((r) => !residents.some((x) => x.id === r.id))
          .map((r) => ({ id: r.id, name: r.fullName, code: r.profileCode, status: r.status, floorAreaId: r.floorAreaId }))
      : []
  const shown = [...local, ...extra]
    .toSorted(
      (a, b) =>
        Number(b.floorAreaId != null && b.floorAreaId === currentFloorId) -
        Number(a.floorAreaId != null && a.floorAreaId === currentFloorId),
    )
    .slice(0, RESIDENT_TILES_MAX)

  return (
    <div className="flex flex-col gap-3">
      <Input
        autoFocus
        className="h-11 bg-card"
        placeholder="Gõ tên, mã hoặc số phòng để tìm"
        aria-label="Tìm người cao tuổi"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((r) => (
          <Button
            key={r.id}
            type="button"
            variant="outline"
            aria-label={`${r.name}, ${r.code}`}
            className="h-auto min-h-14 justify-start gap-3 rounded-lg bg-card px-3 py-2 text-left whitespace-normal"
            onClick={() => onPick(r)}
          >
            <ResidentAvatar name={r.name} code={String(r.id)} className="size-9" />
            <span className="flex min-w-0 flex-col">
              <span className="type-label">{r.name}</span>
              <span className="type-caption font-normal text-muted-foreground">
                {[r.code, placeOf.get(r.id)].filter(Boolean).join(' · ')}
              </span>
            </span>
          </Button>
        ))}
      </div>
      {shown.length === 0 && (
        <p className="type-body-sm text-muted-foreground">
          {q.length >= 2 ? 'Không thấy ai khớp trong viện.' : 'Chưa có người cao tuổi trong phạm vi của bạn, gõ để tìm.'}
        </p>
      )}
    </div>
  )
}

function recipientsText(kind, level, later = false) {
  if (later) return 'Chỉ lưu hồ sơ, báo thông tin cho Điều dưỡng phụ trách, Trưởng tầng; không báo khẩn, không leo thang.'
  if (kind === 'alert') return 'Điều dưỡng phụ trách tiếp nhận; quá hạn tự báo Trưởng tầng, Bác sĩ trực.'
  if (level === 'CRITICAL') return 'Báo ngay Bác sĩ trực, Trưởng tầng, Quản lý viện, người liên hệ chính.'
  return 'Báo người phụ trách theo mức; mở được thẻ khẩn cấp, chuyển viện ở sự cố.'
}

function Section({ title, children, className }) {
  return (
    <Card className={className}>
      <CardContent className="flex flex-col gap-3">
        <h2 className="type-caption tracking-wide text-muted-foreground uppercase">{title}</h2>
        {children}
      </CardContent>
    </Card>
  )
}

/**
 * onDone({ kind: 'incident' | 'alert', id, level, message }): đã lưu. onOpenIncident(id): mở sự cố Khẩn cấp đang có của
 * người này (FR-041).
 */
export function ReportForm({
  onClose,
  onDone,
  onOpenIncident,
  onOpenAlert,
  returnFocusId = 'report-event',
  defaultKind = 'incident',
}) {
  const { can } = usePermissions()
  const canAlert = can('ALERT_HANDLING', 'CREATE')
  const canIncident = can('INCIDENT_EMERGENCY', 'CREATE')
  const [residents, setResidents] = useState(null)
  const [types, setTypes] = useState(null)
  const [floors, setFloors] = useState([])
  const [floorsUnavailable, setFloorsUnavailable] = useState(false)
  const [picked, setPicked] = useState(null)
  const [noResident, setNoResident] = useState(false)
  const [floorId, setFloorId] = useState('')
  const [typeId, setTypeId] = useState('')
  // Ghi thành cảnh báo hay sự cố: chọn sẵn theo màn đang mở (Cảnh báo → cảnh báo, Sự cố → sự cố), đổi được bằng hai nút
  const [wantAlert, setWantAlert] = useState(defaultKind === 'alert')
  const [level, setLevel] = useState('')
  const [note, setNote] = useState('')
  const [place, setPlace] = useState('')
  const [lowerReason, setLowerReason] = useState('')
  const [more, setMore] = useState(false)
  const [discoveredAt, setDiscoveredAt] = useState(() => vietnamNowLocal())
  const [occurredAt, setOccurredAt] = useState('')
  const [initialResponse, setInitialResponse] = useState('')
  // Ghi nhận sau (BF-06): việc đã xảy ra và đã xử lý xong, chỉ lưu hồ sơ, không báo khẩn; phải nói rõ đã báo người nhà chưa
  const [status, setStatus] = useState('')
  const [resolution, setResolution] = useState('')
  const [needHelp, setNeedHelp] = useState(false)
  const [familyState, setFamilyState] = useState('')
  const [familyMethod, setFamilyMethod] = useState('PHONE')
  const [familyAt, setFamilyAt] = useState(() => vietnamNowLocal())
  const [existingId, setExistingId] = useState(null)
  // Người này đang có cảnh báo hoặc sự cố mở: hỏi ghi vào hồ sơ đó để khỏi trùng (BF-06)
  const [found, setFound] = useState({ for: null, list: [] })
  const [ignoredFor, setIgnoredFor] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [problem, setProblem] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadResidentChoices().then(
      (data) => !cancelled && setResidents(data),
      (error) => !cancelled && (setResidents([]), setProblem(problemOf(error))),
    )
    loadIncidentTypes().then(
      (data) => !cancelled && setTypes(data),
      (error) => !cancelled && (setTypes([]), setProblem(problemOf(error))),
    )
    loadFloorChoices().then(
      (data) => {
        if (cancelled) return
        setFloors(data)
        setFloorsUnavailable(data.length === 0)
        const own = data.find((f) => f.current)
        if (own) setFloorId((value) => value || String(own.id))
      },
      () => !cancelled && setFloorsUnavailable(true),
    )
    return () => {
      cancelled = true
    }
  }, [])

  const residentId = picked?.id ?? null
  const allOpen = found.for === residentId ? found.list : []
  // Mới nhất trước; chỉ hiện 2 hồ sơ gần nhất để khung hỏi gọn (BF-06)
  const openRecords = [...allOpen].sort((a, b) => b.id - a.id).slice(0, 2)
  const moreOpen = allOpen.length - openRecords.length
  const ignoreOpen = ignoredFor === residentId

  useEffect(() => {
    if (residentId == null) return undefined
    let live = true
    Promise.all([
      getAlerts({ query: { residentId } }).then(
        ({ data }) =>
          (data ?? [])
            .filter((a) => a.residentId === residentId && OPEN_ALERT.includes(a.status))
            .map((a) => ({ kind: 'alert', id: a.id, label: `cảnh báo "${typeLabel(a.type)}"` })),
        () => [],
      ),
      loadOpenIncidents(residentId).then((list) =>
        list.map((i) => ({ kind: 'incident', id: i.id, label: `sự cố SC-${i.id}` })),
      ),
    ]).then((lists) => live && setFound({ for: residentId, list: lists.flat() }))
    return () => {
      live = false
    }
  }, [residentId])
  const currentFloorId = floors.find((f) => f.current)?.id ?? null
  const activeTypes = (types ?? []).filter((t) => t.active !== false && t.status !== 'INACTIVE')
  const choosable = noResident ? activeTypes.filter((t) => t.allowsNoResident) : activeTypes
  const type = activeTypes.find((t) => String(t.id) === typeId) ?? null
  const answered = residentId != null || noResident
  // Có cho chọn Cảnh báo hay Sự cố không: chỉ khi làm được cả hai và việc là sức khỏe của một người cao tuổi
  const ask = canAlert && canIncident && !!type && !type.nonHealth && residentId != null
  // Chỉ tạo được cảnh báo (không có quyền ghi sự cố) thì luôn là cảnh báo; còn lại mặc định ghi sự cố
  const alertOnly = canAlert && !canIncident
  const kind = alertOnly || (canAlert && canIncident && wantAlert && (!type || !type.nonHealth)) ? 'alert' : 'incident'
  // Tình trạng chỉ hỏi khi ghi sự cố cho một người cao tuổi; không chọn sẵn (BF-06): ĐANG XỬ LÝ hay ĐÃ XỬ LÝ XONG
  const needsStatus = kind === 'incident' && residentId != null
  const isLater = needsStatus && status === 'DONE'
  // Chỉ người có quyền xử lý sự cố mới đóng được; người khác chỉ Lưu, chờ người có chuyên môn đóng
  const canClose = can('INCIDENT_EMERGENCY', 'UPDATE')
  const closeNow = isLater && canClose
  const lowerNeeded = kind === 'incident' && needsLowerReason(level, type)
  const description = note.trim() || [type?.name, place.trim()].filter(Boolean).join(', ')
  const errors = {
    resident: !answered || (kind === 'alert' && residentId == null),
    floor: noResident && !floorId,
    type: !type,
    level: !level,
    lowerReason: lowerNeeded && !lowerReason.trim(),
    family: isLater && !familyState,
    status: needsStatus && !status,
    resolution: closeNow && !resolution.trim(),
  }

  function pickType(value) {
    setTypeId(value)
    const next = activeTypes.find((t) => String(t.id) === value)
    setLevel(next ? presetLevel(next) : '')
  }

  async function save(separate = false) {
    setSubmitted(true)
    if (Object.values(errors).some(Boolean)) return
    setBusy(true)
    setProblem(null)
    setExistingId(null)
    const who = picked?.name ?? 'việc chung'
    try {
      if (kind === 'alert') {
        const alert = await createAlert({ residentId, incidentTypeId: type.id, level, description })
        // Người có quyền xử lý tạo thì coi như đã nhận: khỏi bấm Tiếp nhận (BF-06); lỗi nhận không làm mất cảnh báo đã tạo
        let received = false
        if (canClose && alert?.id != null && !alert.merged) {
          received = await runAlertCommand(alert.id, 'receive').then(
            () => true,
            () => false,
          )
        }
        onDone({
          kind,
          id: alert?.id ?? null,
          level,
          message: alert?.merged
            ? `Đã gộp vào cảnh báo đang mở của ${who}, lần thứ ${alert.occurrenceCount}`
            : `Đã tạo cảnh báo ${type.name.toLowerCase()}, ${who}${received ? ', bạn đã nhận' : ''}`,
        })
        return
      }
      // POST /incidents trả { incident, emergencyCard }
      const recorded = await recordIncident({
        ...(residentId != null ? { residentId } : {}),
        ...(noResident && floorId ? { floorAreaId: Number(floorId) } : {}),
        incidentTypeId: type.id,
        level,
        discoveredAt: vietnamIso(discoveredAt),
        description,
        ...(place.trim() ? { location: place.trim() } : {}),
        ...(initialResponse.trim() ? { initialResponse: initialResponse.trim() } : {}),
        ...(occurredAt ? { occurredAt: vietnamIso(occurredAt) } : {}),
        ...(lowerNeeded ? { lowerLevelReason: lowerReason.trim() } : {}),
        ...(separate || ignoreOpen ? { createDespiteOpen: true } : {}),
        ...(isLater
          ? {
              recordedLater: true,
              ...(closeNow ? { closeNow: true, resolution: resolution.trim() } : {}),
              familyNotice:
                familyState === 'INFORMED'
                  ? { state: 'INFORMED', method: familyMethod, at: vietnamIso(familyAt) }
                  : { state: 'NOT_YET' },
            }
          : {}),
      })
      // Cần thêm người đến giúp: gửi thêm yêu cầu Cần hỗ trợ (cùng cách bấm nút Cần hỗ trợ); lỗi không làm mất sự cố đã ghi
      if (needHelp && !isLater) {
        await postEmergencyAssist({ headers: { 'Idempotency-Key': crypto.randomUUID() } }).catch(() => null)
      }
      onDone({
        kind,
        id: recorded?.incident?.id ?? recorded?.id ?? null,
        level,
        message: `${closeNow ? 'Đã ghi và đóng' : isLater ? 'Đã ghi nhận sau' : 'Đã ghi'} sự cố ${type.name.toLowerCase()}, ${who}`,
      })
    } catch (error) {
      // FR-041: người đã có sự cố Khẩn cấp đang mở thì chỉ ra sự cố đó, không tự gộp
      if (error?.problem?.errorCode === 'OPEN_EMERGENCY_INCIDENT_EXISTS' && error.problem.incidentId != null) {
        setExistingId(error.problem.incidentId)
      } else {
        setProblem(problemOf(error))
      }
    } finally {
      setBusy(false)
    }
  }

  async function joinExisting() {
    setBusy(true)
    setProblem(null)
    try {
      await runIncidentCommand(existingId, 'join-handling')
      onDone({ kind: 'incident', id: existingId, level: 'CRITICAL', message: `Đã tham gia xử lý SC-${existingId}` })
    } catch (error) {
      setProblem(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  // Lớp Tailwind phải là chuỗi cố định để được sinh ra
  const tone =
    kind === 'incident'
      ? ['border-destructive', 'text-destructive']
      : level === 'LOW'
        ? ['border-border', 'text-foreground']
        : ['border-warning-foreground', 'text-warning-foreground']
  const title = kind === 'alert' ? 'Tạo cảnh báo' : 'Ghi sự cố'
  const resultText = `${kind === 'incident' ? 'Sự cố' : 'Cảnh báo'}${level ? ` · ${LEVEL_LABEL[level]}` : ''}`

  return (
    <CasePage label={title} backLabel="Quay lại" here={title} onBack={onClose} returnFocusId={returnFocusId}>
      <h1 className="type-page text-primary">{title}</h1>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
        className="grid items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]"
      >
        <div className="flex min-w-0 flex-col gap-4">
          <Section title="Ai">
            {picked ? (
              <div className="flex items-center gap-3">
                <ResidentAvatar name={picked.name} code={String(picked.id)} className="size-10" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="type-label">{picked.name}</span>
                  <span className="type-caption text-muted-foreground">{picked.code}</span>
                </span>
                <Button type="button" variant="ghost" className="h-11" onClick={() => setPicked(null)}>
                  Đổi
                </Button>
              </div>
            ) : noResident ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex-1 type-label">Việc chung, không gắn người cao tuổi</span>
                  <Button type="button" variant="ghost" className="h-11" onClick={() => setNoResident(false)}>
                    Đổi
                  </Button>
                </div>
                <Field data-invalid={(submitted && errors.floor) || undefined}>
                  <FieldLabel htmlFor="report-floor">Tầng xảy ra</FieldLabel>
                  <select
                    id="report-floor"
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
                  {submitted && errors.floor && <FieldError>Chọn tầng xảy ra</FieldError>}
                </Field>
              </div>
            ) : !residents ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <>
                <ResidentPicker
                  residents={residents}
                  currentFloorId={currentFloorId}
                  onPick={(r) => {
                    setPicked(r)
                    setNoResident(false)
                  }}
                />
                {!alertOnly && activeTypes.some((t) => t.allowsNoResident) && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 self-start bg-card"
                    disabled={floorsUnavailable}
                    onClick={() => {
                      setNoResident(true)
                      if (type && !type.allowsNoResident) setTypeId('')
                    }}
                  >
                    Việc chung (đồ gửi, cơ sở vật chất)
                  </Button>
                )}
                {!alertOnly && floorsUnavailable && activeTypes.some((t) => t.allowsNoResident) && (
                  <p className="type-body-sm text-muted-foreground">
                    Việc chung phải có tầng để báo đúng người phụ trách ca, hiện chưa có tầng nào đang có ca.
                  </p>
                )}
                {submitted && errors.resident && <FieldError>Chọn người cao tuổi</FieldError>}
              </>
            )}
            {picked && AWAY_STATUS_TEXT[picked.status] && (
              <Alert role="note" variant="attention">
                {picked.name} {AWAY_STATUS_TEXT[picked.status]}.
              </Alert>
            )}
          </Section>
          {openRecords.length > 0 && !ignoreOpen && (
            <Alert variant="attention" className="gap-3 p-4">
              <p>
                {picked?.name} đang có {openRecords.map((r) => r.label).join(', ')}
                {moreOpen > 0 ? ` và ${moreOpen} hồ sơ khác` : ''}. Ghi vào hồ sơ đó để khỏi trùng?
              </p>
              <div className="flex flex-wrap gap-2">
                {openRecords.map((r) => {
                  const open = r.kind === 'alert' ? onOpenAlert : onOpenIncident
                  return (
                    open && (
                      <Button key={`${r.kind}-${r.id}`} type="button" className="h-11" onClick={() => open(r.id)}>
                        Mở {r.kind === 'alert' ? 'cảnh báo' : `SC-${r.id}`} đó
                      </Button>
                    )
                  )
                })}
                <Button type="button" variant="outline" className="h-11" onClick={() => setIgnoredFor(residentId)}>
                  Vẫn ghi mới
                </Button>
              </div>
            </Alert>
          )}
          <Section title="Chuyện gì">
            {types ? (
              <IncidentTypePicker types={choosable} value={typeId} onChange={pickType} />
            ) : (
              <Skeleton className="h-28 w-full" />
            )}
            {submitted && errors.type && <FieldError>Chọn chuyện gì</FieldError>}
            {ask && (
              <Button
                type="button"
                variant="link"
                className="h-9 self-start px-0"
                onClick={() => setWantAlert(kind !== 'alert')}
              >
                {kind === 'alert' ? 'Việc đã xảy ra? Ghi sự cố' : 'Việc chưa xảy ra? Tạo cảnh báo'}
              </Button>
            )}
          </Section>
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6">
          {needsStatus && (
            <Section title="Tình trạng (chọn một)">
              <div role="group" aria-label="Tình trạng" className="grid grid-cols-2 gap-2">
                {[
                  ['ACTIVE', 'Đang xử lý', 'Cần người xem ngay, báo theo mức'],
                  ['DONE', 'Đã xử lý xong', 'Chỉ ghi hồ sơ, không báo khẩn'],
                ].map(([value, label, hint]) => (
                  <Button
                    key={value}
                    type="button"
                    variant="outline"
                    aria-pressed={status === value}
                    onClick={() => setStatus(value)}
                    className={cn(
                      'h-auto min-h-16 flex-col items-start gap-0.5 rounded-lg bg-card px-3 py-2 text-left whitespace-normal',
                      status === value && 'border-2 border-primary bg-accent',
                    )}
                  >
                    <span className="type-label">{label}</span>
                    <span className="type-caption font-normal text-muted-foreground">{hint}</span>
                  </Button>
                ))}
              </div>
              {submitted && errors.status && <FieldError>Chọn tình trạng</FieldError>}
              {status === 'ACTIVE' && (
                <>
                  <p className="type-body-sm text-muted-foreground">
                    Bác sĩ, Điều dưỡng ghi sự cố đang xử lý thì được ghi là người xử lý, không cần bấm Tiếp nhận.
                  </p>
                  <label className="flex items-center gap-2 type-body">
                    <input type="checkbox" checked={needHelp} onChange={(e) => setNeedHelp(e.target.checked)} />
                    Cần thêm người đến giúp
                  </label>
                </>
              )}
            </Section>
          )}
          {closeNow && (
            <Section title="Kết quả xử lý">
              <Field data-invalid={(submitted && errors.resolution) || undefined}>
                <Textarea
                  id="report-resolution"
                  aria-label="Kết quả xử lý"
                  rows={3}
                  maxLength={2000}
                  placeholder="VD: cụ ngã nhẹ, đã kiểm tra, không đau, đã đỡ về giường"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                />
                {submitted && errors.resolution && <FieldError>Nhập kết quả xử lý</FieldError>}
              </Field>
            </Section>
          )}
          {isLater && (
            <Section title="Đã báo người nhà chưa?">
              <div role="group" aria-label="Đã báo người nhà chưa?" className="grid grid-cols-2 gap-2">
                {[
                  ['INFORMED', 'Đã báo rồi', 'Ghi cách báo và lúc báo'],
                  ['NOT_YET', 'Chưa báo', 'Gửi thông báo cho người liên hệ chính'],
                ].map(([value, label, hint]) => (
                  <Button
                    key={value}
                    type="button"
                    variant="outline"
                    aria-pressed={familyState === value}
                    onClick={() => setFamilyState(value)}
                    className={cn(
                      'h-auto min-h-16 flex-col items-start gap-0.5 rounded-lg bg-card px-3 py-2 text-left whitespace-normal',
                      familyState === value && 'border-2 border-primary bg-accent',
                    )}
                  >
                    <span className="type-label">{label}</span>
                    <span className="type-caption font-normal text-muted-foreground">{hint}</span>
                  </Button>
                ))}
              </div>
              {submitted && errors.family && <FieldError>Chọn đã báo người nhà chưa</FieldError>}
              {familyState === 'INFORMED' && (
                <div className="flex flex-col gap-3">
                  <div role="group" aria-label="Cách báo" className="flex flex-wrap gap-2">
                    {FAMILY_METHODS.map(([value, label]) => (
                      <Button
                        key={value}
                        type="button"
                        variant="outline"
                        aria-pressed={familyMethod === value}
                        onClick={() => setFamilyMethod(value)}
                        className={cn('h-11', familyMethod === value && 'border-2 border-primary bg-accent')}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  <Field>
                    <FieldLabel htmlFor="report-family-at">Báo lúc</FieldLabel>
                    <Input
                      id="report-family-at"
                      type="datetime-local"
                      className="h-11"
                      value={familyAt}
                      max={vietnamNowLocal()}
                      onChange={(event) => setFamilyAt(event.target.value)}
                    />
                  </Field>
                </div>
              )}
            </Section>
          )}
          <Section title="Mức">
            <Field data-invalid={(submitted && errors.level) || undefined}>
              <LevelChoices value={level} onChange={setLevel} suggested={type?.defaultLevel ?? null} stacked />
              {submitted && errors.level && <FieldError>Chọn mức</FieldError>}
            </Field>
            {lowerNeeded && (
              <Field data-invalid={(submitted && errors.lowerReason) || undefined}>
                <FieldLabel htmlFor="report-lower-reason">Lý do chọn thấp hơn mức gợi ý</FieldLabel>
                <Input
                  id="report-lower-reason"
                  className="h-11"
                  maxLength={2000}
                  value={lowerReason}
                  onChange={(e) => setLowerReason(e.target.value)}
                />
                {submitted && errors.lowerReason && <FieldError>Nhập lý do</FieldError>}
              </Field>
            )}
          </Section>
          <Section title="Ghi chú (không bắt buộc)">
            {kind === 'incident' && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Nơi xảy ra">
                {QUICK_PLACES.map((text) => (
                  <Button
                    key={text}
                    type="button"
                    variant="outline"
                    className={cn('h-10 px-3', place === text && 'border-2 border-primary bg-accent')}
                    aria-pressed={place === text}
                    onClick={() => setPlace(place === text ? '' : text)}
                  >
                    {text}
                  </Button>
                ))}
              </div>
            )}
            <Input
              id="report-note"
              aria-label="Ghi chú"
              className="h-11"
              maxLength={2000}
              placeholder="VD: cạnh giường, đau hông trái"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {kind === 'incident' && (
              <Button
                type="button"
                variant="link"
                className="h-9 self-start px-0"
                aria-expanded={more}
                onClick={() => setMore((v) => !v)}
              >
                {more ? 'Ẩn giờ và xử lý ban đầu' : 'Giờ phát hiện, xử lý ban đầu'}
              </Button>
            )}
            {kind === 'incident' && more && (
              <div className="flex flex-col gap-3">
                <Field>
                  <FieldLabel htmlFor="report-discovered-at">Phát hiện lúc</FieldLabel>
                  <Input
                    id="report-discovered-at"
                    type="datetime-local"
                    className="h-11"
                    value={discoveredAt}
                    onChange={(e) => setDiscoveredAt(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="report-occurred-at">Xảy ra lúc (nếu khác)</FieldLabel>
                  <Input
                    id="report-occurred-at"
                    type="datetime-local"
                    className="h-11"
                    value={occurredAt}
                    onChange={(e) => setOccurredAt(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="report-initial-response">Xử lý ban đầu</FieldLabel>
                  <Textarea
                    id="report-initial-response"
                    rows={2}
                    maxLength={2000}
                    value={initialResponse}
                    onChange={(e) => setInitialResponse(e.target.value)}
                  />
                </Field>
              </div>
            )}
          </Section>
          <Card className={cn('border-2', tone[0])}>
            <CardContent className="flex flex-col gap-3">
              <span className="type-caption text-muted-foreground">Sẽ ghi</span>
              <span role="status" className={cn('type-title', tone[1])}>
                {resultText}
              </span>
              {type && <span className="type-body-sm text-muted-foreground">{recipientsText(kind, level, isLater)}</span>}
              {existingId != null && (
                <Alert variant="attention" className="gap-3 p-4">
                  <p>
                    Người này đang có sự cố Khẩn cấp chưa đóng: <strong>SC-{existingId}</strong>. Cùng vụ thì tham gia xử
                    lý; chuyện khác thì tạo sự cố riêng.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" className="h-11" disabled={busy} onClick={joinExisting}>
                      Tham gia SC-{existingId}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 text-foreground"
                      disabled={busy}
                      onClick={() => save(true)}
                    >
                      Tạo sự cố riêng
                    </Button>
                    {onOpenIncident && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-11 text-foreground"
                        onClick={() => onOpenIncident(existingId)}
                      >
                        Mở SC-{existingId}
                      </Button>
                    )}
                  </div>
                </Alert>
              )}
              {problem && <ProblemAlert problem={problem} />}
              <Button
                type="submit"
                className={cn(
                  'h-12 text-base',
                  kind === 'incident' && level === 'CRITICAL' && 'bg-destructive text-white hover:bg-destructive/90',
                )}
                disabled={busy}
              >
                {kind === 'incident' && level === 'CRITICAL' && !isLater ? 'Lưu và mở khẩn cấp' : closeNow ? 'Lưu và đóng' : 'Lưu'}
              </Button>
              <Button type="button" variant="ghost" className="h-11" disabled={busy} onClick={onClose}>
                Hủy
              </Button>
            </CardContent>
          </Card>
        </div>
      </form>
    </CasePage>
  )
}
