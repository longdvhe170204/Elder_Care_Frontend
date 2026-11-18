import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DetailLayout } from '@/common/DetailLayout'
import { PageHeader } from '@/common/PageHeader'
import { PermissionDeniedState } from '@/common/PageState'
import { ProblemAlert } from '@/common/ProblemAlert'
import { ResidentAvatar } from '@/common/ResidentAvatar'
import { StatusBadge } from '@/common/StatusBadge'
import { formatDateTime } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { EmergencyCardPanel } from './EmergencyCardPanel'
import { HandoverStaffField } from './HandoverStaffField'
import { TransferOutPanel } from './TransferOutPanel'
import {
  loadFloorChoices,
  loadIncident,
  loadIncidentBoard,
  loadResidentChoices,
  loadSourceAlert,
  recordIncident,
  runIncidentCommand,
} from './incidents'
import {
  LEVEL_LABEL,
  LEVEL_ORDER,
  STATUS_LABEL,
  isOpen,
  needsLowerReason,
  sortIncidents,
  statusTone,
  vietnamIso,
  vietnamNowLocal,
} from './incidentView'

// Màn Sự cố (spec 007 User Story 4, FR-040 → FR-046; T037 phần web): danh sách theo phạm vi từ api-007
// `GET /incidents`, khung chi tiết có nội dung, diễn biến và nút lệnh theo `allowedCommands` (DESIGN.md 7.4). Ghi nhận
// sự cố bắt buộc trực tuyến; mức thấp hơn mặc định của loại cần lý do (FR-042). Giao người xử lý chọn từ danh sách
// nhân viên đang làm việc (api-008), backend kiểm người được giao đủ điều kiện.

const GROUPS = [
  ['open', 'Đang mở'],
  ['ended', 'Đã kết thúc'],
]
const INFECTION_OUTCOME = [
  ['CONFIRMED_INFECTION', 'Xác định lây nhiễm'],
  ['RULED_OUT', 'Loại trừ'],
  ['UNDETERMINED', 'Chưa xác định'],
]
const FORM_TITLE = {
  progressions: 'Ghi diễn biến',
  'change-level': 'Đổi mức',
  reopen: 'Mở lại xử lý',
  close: 'Đóng sự cố',
  'assign-handler': 'Giao người xử lý',
}
const SUBMIT_LABEL = {
  progressions: 'Lưu diễn biến',
  'change-level': 'Lưu mức mới',
  reopen: 'Lưu và mở lại',
  close: 'Lưu và đóng sự cố',
  'assign-handler': 'Lưu và giao',
}
const TEXT_LABEL = {
  progressions: 'Nội dung',
  'change-level': 'Lý do đổi mức',
  reopen: 'Lý do mở lại',
  close: 'Kết quả xử lý',
  'assign-handler': 'Ghi chú giao việc',
}
const TEXT_ERROR = {
  progressions: 'Nhập nội dung diễn biến',
  'change-level': 'Nhập lý do đổi mức',
  reopen: 'Nhập lý do mở lại',
  close: 'Nhập kết quả xử lý',
  'assign-handler': 'Nhập ghi chú giao việc',
}

function IncidentStatus({ incident }) {
  return <Badge variant={statusTone(incident)}>{STATUS_LABEL[incident.status] ?? incident.status}</Badge>
}

function Facts({ rows }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 type-body-sm">
      {rows
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
    </dl>
  )
}

const RESIDENT_LIST_MAX = 6
// Loại hay gặp lên đầu theo thứ tự cố định; loại "khác" xuống cuối, đứng sau dòng "Không có loại phù hợp?"
const COMMON_TYPE_CODES = [
  'FALL',
  'BREATHING_OR_CONSCIOUSNESS',
  'CHOKING_OR_AIRWAY_OBSTRUCTION',
  'MEDICATION',
  'BEHAVIOR',
  'MISSING_OR_NOT_RETURNED',
  'WRONG_MEAL_SERVED',
]
const isOtherType = (t) => /^OTHER/.test(t.code ?? '')
function orderedTypes(list) {
  const rank = (t) => {
    const i = COMMON_TYPE_CODES.indexOf(t.code)
    return i < 0 ? COMMON_TYPE_CODES.length : i
  }
  return list.toSorted((a, b) => rank(a) - rank(b))
}
// Loại sự cố chia hai nhóm theo cờ nonHealth của danh mục: liên quan sức khỏe, chăm sóc và việc khác (đồ gửi, cơ sở vật chất)
const TYPE_SECTIONS = [
  ['Sức khỏe, chăm sóc', false],
  ['Việc khác', true],
]
const PROGRESSION_SECTIONS = [
  ['EVALUATION', 'Đánh giá'],
  ['ACTION', 'Xử lý'],
  ['NOTIFICATION', 'Gọi, báo tin'],
  ['MONITORING', 'Theo dõi'],
  ['OTHER', 'Khác'],
]
const KNOWN_GROUPS = ['EVALUATION', 'ACTION', 'NOTIFICATION', 'MONITORING']
const GROUP_LABEL = { EVALUATION: 'đánh giá', ACTION: 'xử lý' }

// Nhóm diễn biến còn thiếu để Chuyển theo dõi (cần ít nhất một đánh giá và một xử lý)
function missingMonitoringGroups(incident, progressionTypes) {
  const groupOf = new Map(progressionTypes.map((t) => [t.id, t.group]))
  const recorded = new Set((incident.progressions ?? []).map((p) => groupOf.get(p.progressionTypeId)))
  return ['EVALUATION', 'ACTION'].filter((g) => !recorded.has(g))
}

// Chọn loại diễn biến theo nhóm Đánh giá, Xử lý, Gọi báo tin, Theo dõi: mắt dừng ở đúng nhóm cần, không đọc cả dãy dài.
// Nhóm còn thiếu cho "Chuyển theo dõi" được đánh dấu; loại hồi sức nằm riêng dưới Xử lý vì cần xác nhận nguyện vọng.
function ProgressionPicker({ types, value, onChange, missing }) {
  const active = types.filter((t) => t.status !== 'INACTIVE' && t.group !== 'SYSTEM')
  const chip = (t) => (
    <Button
      key={t.id}
      type="button"
      variant={value === String(t.id) ? 'default' : 'outline'}
      className="h-11 px-4"
      aria-pressed={value === String(t.id)}
      onClick={() => onChange(value === String(t.id) ? '' : String(t.id))}
    >
      {t.name}
    </Button>
  )
  return (
    <div className="flex flex-col gap-3">
      {PROGRESSION_SECTIONS.map(([group, label]) => {
        const inGroup = active.filter((t) => (group === 'OTHER' ? !KNOWN_GROUPS.includes(t.group) : t.group === group))
        if (inGroup.length === 0) return null
        const plain = inGroup.filter((t) => !t.resuscitation)
        const resuscitation = inGroup.filter((t) => t.resuscitation)
        return (
          <section key={group} aria-label={label} className="flex flex-col gap-1.5">
            <h4 className="type-caption text-muted-foreground">
              {label}
              {missing.includes(group) && ' (còn thiếu để chuyển theo dõi)'}
            </h4>
            {plain.length > 0 && <div className="flex flex-wrap gap-2">{plain.map(chip)}</div>}
            {resuscitation.length > 0 && (
              <>
                {plain.length > 0 && <h5 className="type-caption text-muted-foreground">Cấp cứu hồi sức</h5>}
                <div className="flex flex-wrap gap-2">{resuscitation.map(chip)}</div>
              </>
            )}
          </section>
        )
      })}
    </div>
  )
}

function CommandForm({ mode, incident, progressionTypes, missingGroups, typeCode, busy, onSubmit, onCancel }) {
  const [text, setText] = useState('')
  const [choice, setChoice] = useState('')
  const [outcome, setOutcome] = useState('')
  const [assignee, setAssignee] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const needsChoice = mode === 'progressions' || mode === 'change-level'
  const textMissing = !text.trim()
  const choiceMissing = (needsChoice && !choice) || (mode === 'assign-handler' && !assignee)

  function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    if (textMissing || choiceMissing) return
    const value = text.trim()
    const body = {
      progressions: { progressionTypeId: Number(choice), content: value },
      'change-level': { newLevel: choice, reason: value },
      reopen: { reason: value },
      'assign-handler': { assigneeId: Number(assignee), note: value },
      close: { resolution: value, ...(outcome ? { infectionOutcome: outcome } : {}) },
    }[mode]
    onSubmit(mode, body)
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <h3 className="type-card-title">{FORM_TITLE[mode]}</h3>
      {mode === 'change-level' && (
        <p className="type-caption text-muted-foreground">
          Điều dưỡng, Trưởng tầng, Bác sĩ có quyền với người này được đổi mức, phải ghi lý do. Hạ từ Khẩn cấp xuống thấp
          hơn chỉ Bác sĩ làm được. Nâng lên Khẩn cấp sẽ báo ngay Bác sĩ trực, Trưởng tầng và người liên hệ chính.
        </p>
      )}
      {mode === 'assign-handler' && (
        <p className="type-caption text-muted-foreground">
          {incident.assignee
            ? `Hiện ${incident.assignee} đang xử lý. Chỉ dùng khi muốn bàn giao cho người khác; người nhận phải là Điều dưỡng, Trưởng tầng hoặc Bác sĩ có quyền với người cao tuổi này.`
            : 'Giao cho Điều dưỡng, Trưởng tầng hoặc Bác sĩ có quyền với người cao tuổi này. Người được giao nhận thông báo.'}
        </p>
      )}
      {mode === 'assign-handler' && (
        <HandoverStaffField
          id="incident-assignee"
          valueKey="accountId"
          label="Người được giao"
          errorText="Chọn người được giao"
          value={assignee}
          onChange={setAssignee}
          invalid={submitted && choiceMissing}
        />
      )}
      {mode === 'progressions' && (
        <Field data-invalid={(submitted && choiceMissing) || undefined}>
          <FieldLabel>Loại diễn biến</FieldLabel>
          <ProgressionPicker types={progressionTypes} value={choice} onChange={setChoice} missing={missingGroups} />
          {submitted && choiceMissing && <FieldError>Chọn loại diễn biến</FieldError>}
        </Field>
      )}
      {mode === 'change-level' && (
        <Field data-invalid={(submitted && choiceMissing) || undefined}>
          <FieldLabel>Mức mới</FieldLabel>
          <ToggleGroup
            variant="outline"
            value={choice ? [choice] : []}
            onValueChange={(n) => setChoice(n[0] ?? '')}
            className="flex flex-wrap"
          >
            {LEVEL_ORDER.filter((l) => l !== incident.level).map((l) => (
              <ToggleGroupItem key={l} value={l} className="h-11 px-4">
                {LEVEL_LABEL[l]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {submitted && choiceMissing && <FieldError>Chọn mức mới</FieldError>}
        </Field>
      )}
      <Field data-invalid={(submitted && textMissing) || undefined}>
        <FieldLabel htmlFor="incident-command-text">{TEXT_LABEL[mode]}</FieldLabel>
        <Textarea
          id="incident-command-text"
          rows={3}
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-invalid={(submitted && textMissing) || undefined}
        />
        {submitted && textMissing && <FieldError>{TEXT_ERROR[mode]}</FieldError>}
      </Field>
      {mode === 'close' && typeCode === 'SUSPECTED_INFECTION' && (
        <Field>
          <FieldLabel>Kết luận lây nhiễm</FieldLabel>
          <ToggleGroup
            variant="outline"
            value={outcome ? [outcome] : []}
            onValueChange={(n) => setOutcome(n[0] ?? '')}
            className="flex flex-wrap"
          >
            {INFECTION_OUTCOME.map(([value, label]) => (
              <ToggleGroupItem key={value} value={value} className="h-11 px-4">
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="h-11" disabled={busy}>
          {SUBMIT_LABEL[mode]}
        </Button>
        <Button type="button" variant="ghost" className="h-11" onClick={onCancel}>
          Quay lại
        </Button>
      </div>
    </form>
  )
}

function IncidentDetail({ id, name, types, Title, Description, onChanged, onNavigate }) {
  const [state, setState] = useState(null)
  const [sourceAlert, setSourceAlert] = useState(null)
  const [problem, setProblem] = useState(null)
  const [mode, setMode] = useState(null)
  const [busy, setBusy] = useState(false)
  const [showMore, setShowMore] = useState(false)

  useEffect(() => {
    let live = true
    loadSourceAlert(id).then((alert) => live && setSourceAlert(alert))
    return () => {
      live = false
    }
  }, [id])

  useEffect(() => {
    let cancelled = false
    loadIncident(id).then(
      (data) => !cancelled && setState(data),
      (error) => !cancelled && setProblem(problemOf(error)),
    )
    return () => {
      cancelled = true
    }
  }, [id])

  if (!state) return problem ? <ProblemAlert problem={problem} /> : <Skeleton className="h-40 w-full" />

  const { incident, progressionTypes } = state
  const commands = incident.allowedCommands ?? []
  const type = types.find((t) => t.id === incident.currentTypeId)
  const progressionName = (typeId) => progressionTypes.find((t) => t.id === typeId)?.name ?? 'Diễn biến'

  async function run(command, body, message) {
    setBusy(true)
    setProblem(null)
    try {
      await runIncidentCommand(incident.id, command, body)
      setMode(null)
      setState(await loadIncident(incident.id))
      onChanged(message)
    } catch (error) {
      setProblem(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  const missingGroups = missingMonitoringGroups(incident, progressionTypes)
  const hasMore = ['move-to-monitoring', 'change-level', 'assign-handler'].some((c) => commands.includes(c))
  const canTransfer =
    ['NEW', 'IN_PROGRESS'].includes(incident.status) &&
    incident.content?.residentId != null &&
    commands.includes('transfer-out')

  const messages = {
    progressions: 'Đã ghi diễn biến',
    'change-level': 'Đã đổi mức sự cố',
    reopen: 'Đã mở lại xử lý',
    close: 'Đã đóng sự cố',
    'assign-handler': 'Đã giao người xử lý',
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Title className="type-title">{type?.name ?? 'Sự cố'}</Title>
        <Description className="type-body-sm text-muted-foreground">{`SC-${incident.id}, ${name}`}</Description>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={LEVEL_LABEL[incident.level]} />
          <IncidentStatus incident={incident} />
        </div>
      </div>
      <Facts
        rows={[
          ['Phát hiện lúc', formatDateTime(incident.content?.discoveredAt)],
          ['Xảy ra lúc', incident.content?.occurredAt && formatDateTime(incident.content.occurredAt)],
          ['Nơi xảy ra', incident.content?.location],
          ['Mô tả', incident.content?.description],
          ['Xử lý ban đầu', incident.content?.initialResponse],
          ['Người xử lý', incident.assignee ?? 'Chưa ai nhận'],
          ['Tiếp nhận lúc', incident.receivedAt && formatDateTime(incident.receivedAt)],
          ['Kết quả', incident.resolution],
        ]}
      />
      {sourceAlert && (
        <section aria-label="Cảnh báo gốc" className="flex flex-col gap-2 rounded-lg border p-3 type-body-sm">
          <span>
            Phát sinh từ cảnh báo {types.find((t) => t.code === sourceAlert.type)?.name ?? 'của hệ thống'}, mức{' '}
            {LEVEL_LABEL[sourceAlert.level]?.toLowerCase()}.
          </span>
          {onNavigate && (
            <Button
              variant="outline"
              className="h-11 self-start"
              onClick={() => onNavigate('alerts', { alertId: sourceAlert.id })}
            >
              Mở cảnh báo gốc
            </Button>
          )}
        </section>
      )}
      {incident.noOnDutyDoctor && <p className="type-body-sm text-destructive">Không có bác sĩ trực lúc ghi nhận</p>}
      <section className="flex flex-col gap-2">
        <h3 className="type-caption text-muted-foreground">Diễn biến</h3>
        {(incident.progressions ?? []).length === 0 ? (
          <p className="type-body-sm text-muted-foreground">Chưa ghi diễn biến.</p>
        ) : (
          <ol className="flex flex-col gap-1.5 border-l-2 pl-3 type-body-sm">
            {incident.progressions.map((p) => (
              <li key={p.id} className="flex flex-col">
                <span className="tabular-nums text-muted-foreground">
                  {formatDateTime(p.occurredAt)}, {progressionName(p.progressionTypeId)}
                </span>
                <span>{p.content}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
      {incident.level === 'CRITICAL' && isOpen(incident) && <EmergencyCardPanel incidentId={incident.id} />}
      {problem && <ProblemAlert problem={problem} />}
      {mode === 'transfer-out' ? (
        <TransferOutPanel
          incidentId={incident.id}
          onCancel={() => setMode(null)}
          onDone={async () => {
            setMode(null)
            setState(await loadIncident(incident.id))
            onChanged('Đã chuyển viện')
          }}
        />
      ) : mode ? (
        <CommandForm
          key={mode}
          mode={mode}
          incident={incident}
          progressionTypes={progressionTypes}
          missingGroups={missingGroups}
          typeCode={type?.code}
          busy={busy}
          onSubmit={(command, body) => run(command, body, messages[command])}
          onCancel={() => setMode(null)}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            {commands.includes('receive') && (
              <Button className="h-11" disabled={busy} onClick={() => run('receive', null, 'Đã tiếp nhận sự cố')}>
                Tiếp nhận
              </Button>
            )}
            {commands.includes('progressions') && (
              <Button
                variant={incident.status === 'IN_PROGRESS' ? 'default' : 'outline'}
                className="h-11"
                onClick={() => setMode('progressions')}
              >
                Ghi diễn biến
              </Button>
            )}
            {canTransfer && (
              <Button variant="outline" className="h-11" onClick={() => setMode('transfer-out')}>
                Chuyển viện
              </Button>
            )}
            {commands.includes('close') && (
              <Button variant="outline" className="h-11" onClick={() => setMode('close')}>
                Đóng sự cố
              </Button>
            )}
            {commands.includes('reopen') && (
              <Button variant="outline" className="h-11" onClick={() => setMode('reopen')}>
                Mở lại xử lý
              </Button>
            )}
            {commands.includes('join-handling') && (
              <Button
                variant="outline"
                className="h-11"
                disabled={busy}
                onClick={() => run('join-handling', null, 'Đã tham gia xử lý')}
              >
                Tham gia xử lý
              </Button>
            )}
          </div>
          {commands.includes('move-to-monitoring') && (
            <p className="type-caption text-muted-foreground">
              {missingGroups.length === 0
                ? 'Đủ điều kiện chuyển theo dõi (đã có diễn biến đánh giá và xử lý).'
                : `Chuyển theo dõi cần thêm diễn biến ${missingGroups.map((g) => GROUP_LABEL[g]).join(' và ')}.`}
            </p>
          )}
          {hasMore && (
            <div className="flex flex-col gap-2">
              <Button
                variant="ghost"
                className="h-11 self-start"
                aria-expanded={showMore}
                onClick={() => setShowMore((v) => !v)}
              >
                {showMore ? 'Ẩn bớt' : 'Thêm'}
              </Button>
              {showMore && (
                <div className="flex flex-col gap-2">
                  {commands.includes('move-to-monitoring') && (
                    <Button
                      variant="outline"
                      className="h-11"
                      disabled={busy || missingGroups.length > 0}
                      onClick={() => run('move-to-monitoring', null, 'Đã chuyển theo dõi')}
                    >
                      Chuyển theo dõi
                    </Button>
                  )}
                  {commands.includes('change-level') && (
                    <Button variant="outline" className="h-11" onClick={() => setMode('change-level')}>
                      Đổi mức
                    </Button>
                  )}
                  {commands.includes('assign-handler') && (
                    <Button variant="outline" className="h-11" onClick={() => setMode('assign-handler')}>
                      {incident.assignee ? 'Chuyển cho người khác' : 'Giao người xử lý'}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Ghi nhận sự cố (FR-040, FR-042): người cao tuổi (loại cơ sở vật chất được bỏ trống), loại, mức, thời điểm phát hiện,
// mô tả; mức thấp hơn mặc định cần lý do. Khẩn cấp kích hoạt quy trình ở backend trong cùng lệnh.
function RecordIncidentSheet({ open, types, incidents, onClose, onRecorded, onOpenExisting }) {
  const [residents, setResidents] = useState(null)
  const [residentId, setResidentId] = useState(null)
  const [residentQuery, setResidentQuery] = useState('')
  const [floors, setFloors] = useState([])
  const [floorId, setFloorId] = useState('')
  const [floorsUnavailable, setFloorsUnavailable] = useState(false)
  const [existingId, setExistingId] = useState(null)
  const [typeId, setTypeId] = useState('')
  const [level, setLevel] = useState('')
  const [discoveredAt, setDiscoveredAt] = useState(() => vietnamNowLocal())
  const [description, setDescription] = useState('')
  const [lowerReason, setLowerReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [problem, setProblem] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    loadResidentChoices().then(
      (data) => !cancelled && setResidents(data),
      (error) => !cancelled && setProblem(problemOf(error)),
    )
    loadFloorChoices().then(
      (data) => !cancelled && setFloors(data),
      () => !cancelled && setFloorsUnavailable(true),
    )
    return () => {
      cancelled = true
    }
  }, [open])

  const pickedResident = residents?.find((r) => r.id === residentId) ?? null
  const needle = residentQuery.trim().toLowerCase()
  const matchedResidents = (residents ?? []).filter(
    (r) => !needle || `${r.name} ${r.code}`.toLowerCase().includes(needle),
  )
  const shownResidents = matchedResidents.slice(0, RESIDENT_LIST_MAX)
  const activeTypes = types.filter((t) => t.status !== 'INACTIVE')
  const type = activeTypes.find((t) => String(t.id) === typeId)
  const residentRequired = !type?.allowsNoResident
  const lowerNeeded = needsLowerReason(level, type)
  const errors = {
    resident: residentRequired && residentId == null,
    floor: !residentRequired && !floorId,
    type: !type,
    level: !level,
    description: !description.trim(),
    lowerReason: lowerNeeded && !lowerReason.trim(),
  }

  function pickType(value) {
    setTypeId(value)
    const picked = activeTypes.find((t) => String(t.id) === value)
    if (picked) setLevel(picked.defaultLevel)
  }

  async function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    if (Object.values(errors).some(Boolean)) return
    setBusy(true)
    setProblem(null)
    try {
      await recordIncident({
        ...(residentId != null ? { residentId } : {}),
        ...(!residentRequired && floorId ? { floorAreaId: Number(floorId) } : {}),
        incidentTypeId: type.id,
        level,
        discoveredAt: vietnamIso(discoveredAt),
        description: description.trim(),
        ...(lowerNeeded ? { lowerLevelReason: lowerReason.trim() } : {}),
      })
      onRecorded('Đã ghi nhận sự cố')
    } catch (error) {
      // FR-041: người đã có sự cố Khẩn cấp đang mở thì chỉ ra sự cố đó, không tự gộp, không tự tạo thêm
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
      onRecorded(`Đã tham gia xử lý sự cố SC-${existingId}`)
    } catch (error) {
      setProblem(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  const existing = existingId != null ? incidents.find((i) => i.id === existingId) : null
  const existingType = existing && types.find((t) => t.id === existing.currentTypeId)

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto p-6 sm:max-w-lg">
        <SheetHeader className="px-0">
          <SheetTitle className="type-title">Ghi nhận sự cố</SheetTitle>
          <SheetDescription>Mức Khẩn cấp mở quy trình khẩn cấp ngay khi lưu.</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field data-invalid={(submitted && errors.resident) || undefined}>
            <FieldLabel>Người cao tuổi</FieldLabel>
            {!residents ? (
              <Skeleton className="h-11 w-full" />
            ) : pickedResident ? (
              <div className="flex items-center gap-2 rounded-lg border p-2">
                <ResidentAvatar name={pickedResident.name} code={String(pickedResident.id)} className="size-8" />
                <span className="flex-1 type-label">{pickedResident.name}</span>
                <Button type="button" variant="ghost" className="h-11" onClick={() => setResidentId(null)}>
                  Đổi người
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {residents.length > RESIDENT_LIST_MAX && (
                  <Input
                    className="h-11"
                    placeholder="Gõ tên hoặc mã để tìm"
                    aria-label="Tìm người cao tuổi"
                    value={residentQuery}
                    onChange={(e) => setResidentQuery(e.target.value)}
                  />
                )}
                {shownResidents.map((r) => (
                  <Button
                    key={r.id}
                    type="button"
                    variant="outline"
                    aria-label={`${r.name}, ${r.code}`}
                    className="h-11 justify-start gap-2"
                    onClick={() => setResidentId(r.id)}
                  >
                    <ResidentAvatar name={r.name} code={String(r.id)} className="size-6" />
                    <span>{r.name}</span>
                    <span className="type-caption">{r.code}</span>
                  </Button>
                ))}
                {matchedResidents.length > shownResidents.length && (
                  <p className="type-caption text-muted-foreground">
                    Còn {matchedResidents.length - shownResidents.length} người nữa, gõ thêm để lọc.
                  </p>
                )}
              </div>
            )}
            {submitted && errors.resident && <FieldError>Chọn người cao tuổi</FieldError>}
          </Field>
          <Field data-invalid={(submitted && errors.type) || undefined}>
            <FieldLabel>Loại sự cố</FieldLabel>
            {type ? (
              <div className="flex items-center gap-2 rounded-lg border p-2">
                <span className="flex-1 type-label">
                  {type.name}
                  <span className="ml-2 type-caption font-normal text-muted-foreground">
                    mặc định {LEVEL_LABEL[type.defaultLevel].toLowerCase()}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11"
                  onClick={() => {
                    setTypeId('')
                    setLevel('')
                  }}
                >
                  Đổi loại
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {TYPE_SECTIONS.map(([label, nonHealth]) => {
                  const inSection = orderedTypes(activeTypes.filter((t) => !!t.nonHealth === nonHealth))
                  if (inSection.length === 0) return null
                  const common = inSection.filter((t) => !isOtherType(t))
                  const others = inSection.filter(isOtherType)
                  const chip = (t) => (
                    <Button
                      key={t.id}
                      type="button"
                      variant="outline"
                      className="h-11 px-4"
                      onClick={() => pickType(String(t.id))}
                    >
                      {t.name}
                    </Button>
                  )
                  return (
                    <section key={label} aria-label={label} className="flex flex-col gap-1.5">
                      <h4 className="type-caption text-muted-foreground">{label}</h4>
                      {common.length > 0 && <div className="flex flex-wrap gap-2">{common.map(chip)}</div>}
                      {others.length > 0 && (
                        <>
                          <p className="type-caption text-muted-foreground">Không có loại phù hợp?</p>
                          <div className="flex flex-wrap gap-2">{others.map(chip)}</div>
                        </>
                      )}
                    </section>
                  )
                })}
              </div>
            )}
            {!type && (
              <p className="type-caption text-muted-foreground">
                Chọn loại gần nhất hoặc loại "khác", rồi ghi rõ ở Mô tả. Hay gặp loại nào chưa có thì nhờ Quản lý viện
                thêm vào danh mục.
              </p>
            )}
            {submitted && errors.type && <FieldError>Chọn loại sự cố</FieldError>}
          </Field>
          {type && (
            <Field data-invalid={(submitted && errors.level) || undefined}>
              <FieldLabel>Mức</FieldLabel>
              <ToggleGroup
                variant="outline"
                value={level ? [level] : []}
                onValueChange={(n) => n[0] && setLevel(n[0])}
                className="flex flex-wrap"
              >
                {LEVEL_ORDER.map((l) => (
                  <ToggleGroupItem key={l} value={l} className="h-11 px-4">
                    {LEVEL_LABEL[l]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {type && (
                <span className="type-caption text-muted-foreground">
                  Mặc định của loại: {LEVEL_LABEL[type.defaultLevel]}
                </span>
              )}
              {submitted && errors.level && <FieldError>Chọn mức</FieldError>}
            </Field>
          )}
          {lowerNeeded && (
            <Field data-invalid={(submitted && errors.lowerReason) || undefined}>
              <FieldLabel htmlFor="incident-lower-reason">Lý do chọn mức thấp hơn</FieldLabel>
              <Textarea
                id="incident-lower-reason"
                rows={2}
                maxLength={2000}
                value={lowerReason}
                onChange={(e) => setLowerReason(e.target.value)}
                aria-invalid={(submitted && errors.lowerReason) || undefined}
              />
              {submitted && errors.lowerReason && <FieldError>Nhập lý do chọn mức thấp hơn mặc định</FieldError>}
            </Field>
          )}
          {!residentRequired && (
            <Field data-invalid={(submitted && errors.floor) || undefined}>
              <FieldLabel htmlFor="incident-floor">Tầng xảy ra</FieldLabel>
              <select
                id="incident-floor"
                value={floorId}
                onChange={(e) => setFloorId(e.target.value)}
                aria-invalid={(submitted && errors.floor) || undefined}
                className="h-11 w-full rounded-md border border-input bg-transparent px-3"
              >
                <option value="">Chưa chọn</option>
                {floors.map((f) => (
                  <option key={f.id} value={String(f.id)}>
                    {f.name}
                  </option>
                ))}
              </select>
              {floorsUnavailable && (
                <p className="type-caption text-muted-foreground">
                  Tài khoản của bạn chưa xem được danh sách tầng. Nhờ Trưởng tầng ghi nhận giúp, hoặc báo Quản lý viện
                  cấp quyền tra cứu tầng.
                </p>
              )}
              {submitted && errors.floor && <FieldError>Chọn tầng xảy ra sự cố</FieldError>}
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="incident-discovered-at">Phát hiện lúc</FieldLabel>
            <Input
              id="incident-discovered-at"
              type="datetime-local"
              className="h-11"
              value={discoveredAt}
              onChange={(e) => setDiscoveredAt(e.target.value)}
            />
          </Field>
          <Field data-invalid={(submitted && errors.description) || undefined}>
            <FieldLabel htmlFor="incident-description">Mô tả</FieldLabel>
            <Textarea
              id="incident-description"
              rows={3}
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-invalid={(submitted && errors.description) || undefined}
            />
            {submitted && errors.description && <FieldError>Nhập mô tả sự cố</FieldError>}
          </Field>
          {existingId != null && (
            <section
              role="alert"
              className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 type-body-sm"
            >
              <p>
                Người cao tuổi này đang có sự cố Khẩn cấp chưa đóng: <strong>SC-{existingId}</strong>
                {existingType && `, ${existingType.name}`}
                {existing?.content?.discoveredAt && `, phát hiện ${formatDateTime(existing.content.discoveredAt)}`}
                {existing && `, người xử lý: ${existing.assignee ?? 'chưa ai nhận'}`}. Hệ thống không tự gộp. Bạn cùng
                xử lý sự cố đó, hoặc mở ra xem trước.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" className="h-11" disabled={busy} onClick={joinExisting}>
                  Tham gia xử lý SC-{existingId}
                </Button>
                <Button type="button" variant="outline" className="h-11" onClick={() => onOpenExisting(existingId)}>
                  Mở sự cố đó
                </Button>
              </div>
            </section>
          )}
          {problem && <ProblemAlert problem={problem} />}
          <Button type="submit" className="h-11" disabled={busy}>
            Lưu sự cố
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// incidentId: mở thẳng một sự cố (016 Q12, từ dòng chi tiết báo cáo)
export function IncidentsPage({ incidentId = null, onNavigate } = {}) {
  const [board, setBoard] = useState(null)
  const [problem, setProblem] = useState(null)
  const [group, setGroup] = useState('open')
  const [openId, setOpenId] = useState(incidentId)
  const [recording, setRecording] = useState(false)
  const [announcement, setAnnouncement] = useState('')

  const reload = useCallback(async () => {
    try {
      setBoard(await loadIncidentBoard())
      setProblem(null)
    } catch (error) {
      setProblem(problemOf(error))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    loadIncidentBoard().then(
      (data) => !cancelled && setBoard(data),
      (error) => {
        if (cancelled) return
        setProblem(problemOf(error))
        setBoard({ incidents: [], types: [], names: {} })
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  if (problem?.status === 403) return <PermissionDeniedState label="Sự cố" />

  const incidents = board?.incidents ?? []
  const types = board?.types ?? []
  const nameOf = (i) =>
    i.content?.residentId == null
      ? 'Không gắn người cao tuổi'
      : (board?.names?.[i.content.residentId] ?? 'Người cao tuổi')
  const typeName = (i) => types.find((t) => t.id === i.currentTypeId)?.name ?? 'Sự cố'
  const inGroup = (value) => incidents.filter((i) => (value === 'open' ? isOpen(i) : !isOpen(i)))
  const visible = sortIncidents(inGroup(group))
  const opened = incidents.find((i) => i.id === openId)

  async function changed(message) {
    setAnnouncement(`${message}.`)
    await reload()
  }

  return (
    <DetailLayout
      open={!!opened}
      detailKey={openId}
      onClose={() => setOpenId(null)}
      label="Chi tiết sự cố"
      renderDetail={({ Title, Description }) =>
        opened && (
          <IncidentDetail
            key={opened.id}
            id={opened.id}
            name={nameOf(opened)}
            types={types}
            Title={Title}
            Description={Description}
            onChanged={changed}
            onNavigate={onNavigate}
          />
        )
      }
    >
      <PageHeader title="Sự cố" subtitle="Sự cố trong phạm vi của bạn, khẩn cấp lên đầu.">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <ToggleGroup
            variant="filter"
            size="lg"
            value={[group]}
            onValueChange={(n) => n[0] && setGroup(n[0])}
            aria-label="Nhóm sự cố"
          >
            {GROUPS.map(([value, label]) => (
              <ToggleGroupItem key={value} value={value} className="h-11 px-4">
                {label} <span className="tabular-nums">{inGroup(value).length}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Button className="h-11" onClick={() => setRecording(true)}>
            <Plus aria-hidden="true" />
            Ghi nhận sự cố
          </Button>
        </div>
      </PageHeader>
      <p role="status" aria-live="polite" className="empty:hidden rounded-xl border bg-card px-4 py-3 type-body-sm">
        {announcement}
      </p>
      {problem && <ProblemAlert problem={problem} />}
      <Card>
        <CardContent>
          {!board ? (
            <Skeleton className="h-40 w-full" />
          ) : visible.length === 0 ? (
            <p className="type-body-sm">
              {group === 'open' ? 'Không có sự cố đang mở trong phạm vi của bạn.' : 'Chưa có sự cố đã kết thúc.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã</TableHead>
                  <TableHead>Người cao tuổi</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead>Mức</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Phát hiện lúc</TableHead>
                  <TableHead>Người xử lý</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((i) => (
                  <TableRow key={i.id} data-state={i.id === openId ? 'selected' : undefined}>
                    <TableCell className="type-body-sm tabular-nums text-muted-foreground">SC-{i.id}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        className="h-auto justify-start gap-2 px-1 py-1"
                        onClick={() => setOpenId(i.id)}
                        aria-label={`${nameOf(i)}, ${typeName(i)}`}
                      >
                        <ResidentAvatar name={nameOf(i)} code={String(i.content?.residentId ?? i.id)} />
                        <span className="type-label">{nameOf(i)}</span>
                      </Button>
                    </TableCell>
                    <TableCell className="type-body-sm">{typeName(i)}</TableCell>
                    <TableCell>
                      <StatusBadge status={LEVEL_LABEL[i.level]} />
                    </TableCell>
                    <TableCell>
                      <IncidentStatus incident={i} />
                    </TableCell>
                    <TableCell className="type-body-sm tabular-nums">
                      {formatDateTime(i.content?.discoveredAt)}
                    </TableCell>
                    <TableCell className="type-body-sm">{i.assignee ?? 'Chưa ai nhận'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {recording && (
        <RecordIncidentSheet
          open={recording}
          types={types}
          incidents={board?.incidents ?? []}
          onOpenExisting={(id) => {
            setRecording(false)
            setOpenId(id)
          }}
          onClose={() => setRecording(false)}
          onRecorded={async (message) => {
            setRecording(false)
            await changed(message)
          }}
        />
      )}
    </DetailLayout>
  )
}
