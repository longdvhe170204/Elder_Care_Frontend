import { useCallback, useEffect, useState } from 'react'
import { cn } from 'cn'
import {
  Ambulance,
  Circle,
  CircleCheck,
  ClipboardCheck,
  Eye,
  ListChecks,
  NotebookPen,
  Plus,
  RotateCcw,
  UserPlus,
} from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PageHeader } from '@/common/PageHeader'
import { PermissionDeniedState } from '@/common/PageState'
import { ProblemAlert } from '@/common/ProblemAlert'
import { ResidentAvatar } from '@/common/ResidentAvatar'
import { StatusBadge } from '@/common/StatusBadge'
import { formatDateTime } from '@/common/dateTime'
import { usePermissions } from '@/common/permissions/permissions'
import { problemOf } from '@/common/problem'
import { Call115Panel } from '@/features/alerts/Call115Panel'
import { typeLabel as alertTypeLabel } from '@/features/alerts/alertView'
import { CriticalNotice } from '@/features/critical-care/CriticalNotice'
import { ResidentCallReminders } from '@/features/notifications/ResidentCallReminders'
import { FilterTabs, LevelChoices, ResidentChoices } from './CaseFormParts'
import {
  CaseAction,
  CaseBadge,
  CaseBlock,
  CaseChoices,
  CaseDialog,
  CaseFacts,
  CaseHeader,
  CaseLink,
  CasePage,
  CaseSteps,
  CaseWizard,
  FocusHeading,
} from './CasePage'
import { EmergencyCardPanel } from './EmergencyCardPanel'
import { HandoverStaffField } from './HandoverStaffField'
import { FollowUpBlock, FollowUpForm } from './IncidentFollowUps'
import { IncidentTypeIcon, IncidentTypePicker } from './IncidentTypePicker'
import { TransferOutPanel } from './TransferOutPanel'
import {
  loadFloorChoices,
  loadIncident,
  loadFollowUps,
  loadIncidentBoard,
  loadLinkedAlerts,
  loadResidentChoices,
  loadResidentStatus,
  recordIncident,
  runIncidentCommand,
} from './incidents'
import {
  FOLLOW_UP_OPEN,
  LEVEL_LABEL,
  LEVEL_ORDER,
  STATUS_LABEL,
  isOpen,
  needsLowerReason,
  presetLevel,
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
const DIALOG_HINT = {
  close: 'Sự cố đã đóng không mở lại được, chỉ đính chính.',
  reopen: 'Sự cố về trạng thái Đang xử lý.',
}
// Nơi chọn nhanh, sửa thêm được ở ô gõ
const QUICK_PLACES = ['Phòng', 'Nhà vệ sinh', 'Hành lang', 'Phòng sinh hoạt chung', 'Sân']
const STEPS = ['NEW', 'IN_PROGRESS', 'MONITORING', 'CLOSED']
const FORM_TITLE = {
  progressions: 'Ghi diễn biến',
  'change-level': 'Đổi mức',
  reopen: 'Mở lại xử lý',
  close: 'Đóng sự cố',
  'assign-handler': 'Giao người xử lý',
  'end-post-fall-monitoring': 'Kết thúc theo dõi sau ngã',
  'transfer-out': 'Chuyển viện',
}
const DIALOG_TITLE = { ...FORM_TITLE, close: 'Đóng sự cố?', reopen: 'Mở lại xử lý?' }
const SUBMIT_LABEL = {
  progressions: 'Lưu diễn biến',
  'change-level': 'Lưu mức mới',
  reopen: 'Lưu và mở lại',
  close: 'Lưu và đóng sự cố',
  'assign-handler': 'Lưu và giao',
  'end-post-fall-monitoring': 'Lưu và kết thúc theo dõi',
}
const TEXT_LABEL = {
  progressions: 'Nội dung',
  'change-level': 'Lý do đổi mức',
  reopen: 'Lý do mở lại',
  close: 'Kết quả xử lý',
  'assign-handler': 'Ghi chú giao việc',
  'end-post-fall-monitoring': 'Lý do kết thúc theo dõi',
}
const TEXT_ERROR = {
  progressions: 'Nhập nội dung diễn biến',
  'change-level': 'Nhập lý do đổi mức',
  reopen: 'Nhập lý do mở lại',
  close: 'Nhập kết quả xử lý',
  'assign-handler': 'Nhập ghi chú giao việc',
  'end-post-fall-monitoring': 'Nhập lý do kết thúc theo dõi',
}

// Ai đã được báo về sự cố (api-007 notifiedRecipients, nguồn 009): đếm theo nhóm Nhân viên, Người thân, ghi kênh, giờ gửi và
// số người đã xem. Người nhận ghi dạng "STAFF:9004", "FAMILY_MEMBER:9001"; chưa có thì ghi rõ chưa báo ai.
const RECIPIENT_GROUPS = [
  ['STAFF', 'Nhân viên'],
  ['FAMILY_MEMBER', 'Người thân'],
  ['RESIDENT', 'Người cao tuổi'],
]
const CHANNEL_TEXT = {
  IN_APP: 'trong ứng dụng',
  SMS: 'tin nhắn',
  PUSH: 'thông báo đẩy',
  EMAIL: 'thư điện tử',
  CALL: 'cuộc gọi',
}

// Sự cố bắt đầu từ đâu: yêu cầu hỗ trợ, nút SOS ghi rõ ai gọi, ai tới, ai đến giúp; cảnh báo khác ghi loại, mức
function linkedAlertText(alert, typeName) {
  const helpers = alert.helpers?.length ? `; ${alert.helpers.join(', ')} đến giúp` : ''
  const arrived = alert.arrivedAt
    ? `, ${alert.assignee ?? 'người tiếp nhận'} tới lúc ${formatDateTime(alert.arrivedAt)}`
    : ''
  if (alert.origin === 'ASSIST_BUTTON') {
    return `Bắt đầu từ yêu cầu hỗ trợ${alert.pressedBy ? ` của ${alert.pressedBy}` : ''} lúc ${formatDateTime(alert.firstAt)}${arrived}${helpers}.`
  }
  if (alert.origin === 'SOS') {
    return `Bắt đầu từ nút SOS của người cao tuổi lúc ${formatDateTime(alert.firstAt)}${arrived}${helpers}.`
  }
  return `Phát sinh từ cảnh báo ${typeName}, mức ${LEVEL_LABEL[alert.level]?.toLowerCase()}, ${formatDateTime(alert.firstAt)}.`
}

function NotifiedSection({ recipients }) {
  const rows = RECIPIENT_GROUPS.map(([prefix, label]) => {
    const group = recipients.filter((r) => String(r.recipient).startsWith(`${prefix}:`))
    return { prefix, label, group }
  }).filter((row) => row.group.length > 0)
  return (
    <section aria-label="Đã báo cho" className="flex flex-col gap-1.5 border-t pt-4">
      <h3 className="type-caption text-muted-foreground">Đã báo cho</h3>
      {rows.length === 0 ? (
        <p className="type-body-sm text-muted-foreground">Chưa báo cho ai qua hệ thống.</p>
      ) : (
        <ul className="flex flex-col gap-1 type-body-sm">
          {rows.map(({ prefix, label, group }) => {
            // Một người có thể nhận nhiều lượt (cảnh báo rồi sự cố): đếm theo người, không theo lượt gửi
            const people = new Set(group.map((r) => r.recipient)).size
            const viewed = new Set(group.filter((r) => r.viewedAt).map((r) => r.recipient)).size
            const channel = CHANNEL_TEXT[group[0].channel] ?? group[0].channel
            return (
              <li key={prefix} className="flex flex-wrap items-baseline justify-between gap-x-4">
                <span>
                  <strong>{label}</strong>: {people} người, đã xem {viewed}/{people}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {channel}, {formatDateTime(group[0].sentAt)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function IncidentStatus({ incident }) {
  return <Badge variant={statusTone(incident)}>{STATUS_LABEL[incident.status] ?? incident.status}</Badge>
}

// Lệnh Chuyển viện (001) chỉ làm được từ ba trạng thái này; ngoài ra báo rõ người đó đang ở trạng thái nào
const TRANSFERABLE_STATUS = ['IN_RESIDENCE', 'TEMPORARILY_ABSENT', 'OFF_SITE_ACTIVITY']
// Người cao tuổi không có mặt ở viện vẫn ghi được sự cố (BR-M05-19, ví dụ đồ gửi, thông tin) nhưng phải nhắc người ghi
const AWAY_STATUS_TEXT = {
  HOSPITALIZED: 'đang điều trị tại bệnh viện',
  TEMPORARILY_ABSENT: 'đang tạm vắng',
  OFF_SITE_ACTIVITY: 'đang ở hoạt động bên ngoài',
}
const RESIDENT_STATUS_TEXT = {
  ADMISSION_IN_PROGRESS: 'đang trong quá trình tiếp nhận',
  ADMISSION_CANCELLED: 'đã hủy tiếp nhận',
  HOSPITALIZED: 'đang điều trị tại bệnh viện (đã chuyển viện)',
  RESIDENCY_ENDED: 'đã kết thúc lưu trú',
  DECEASED: 'đã mất',
}
// Loại diễn biến "khác" xuống cuối nhóm
const isOtherType = (t) => /^OTHER/.test(t.code ?? '')
const PROGRESSION_SECTIONS = [
  ['EVALUATION', 'Đánh giá'],
  ['ACTION', 'Xử lý'],
  ['NOTIFICATION', 'Gọi, báo tin'],
  ['MONITORING', 'Theo dõi'],
  ['OTHER', 'Khác'],
]
const KNOWN_GROUPS = ['EVALUATION', 'ACTION', 'NOTIFICATION', 'MONITORING']
const GROUP_LABEL = { EVALUATION: 'đánh giá', ACTION: 'xử lý' }
// Câu giải thích từng nhóm để người ghi chọn đúng nhóm (đánh giá là nhận định, xử lý là việc đã làm)
const GROUP_HINT = {
  EVALUATION: 'Nhận định tình trạng: khám thấy gì, đau ở đâu, chỉ số',
  ACTION: 'Việc đã làm cho người cao tuổi: sơ cứu, thuốc, chăm sóc',
  NOTIFICATION: 'Đã gọi ai, báo cho ai',
  MONITORING: 'Theo dõi tiếp sau xử lý',
  OTHER: 'Việc không thuộc các nhóm trên',
}
const GROUP_PLACEHOLDER = {
  EVALUATION: 'Ví dụ: Đau hông trái, chân trái ngắn, nghi gãy xương',
  ACTION: 'Ví dụ: Chườm lạnh hông trái, cho nằm nghỉ, kê gối',
  NOTIFICATION: 'Ví dụ: Đã gọi người nhà lúc 9:20, báo cụ ngã',
}
const inGroupOf = (group) => (t) => (group === 'OTHER' ? !KNOWN_GROUPS.includes(t.group) : t.group === group)
const pickableTypes = (types) => types.filter((t) => t.status !== 'INACTIVE' && t.group !== 'SYSTEM')

// Nhóm diễn biến còn thiếu để Chuyển theo dõi (cần ít nhất một đánh giá và một xử lý)
function missingMonitoringGroups(incident, progressionTypes) {
  const groupOf = new Map(progressionTypes.map((t) => [t.id, t.group]))
  const recorded = new Set((incident.progressions ?? []).map((p) => groupOf.get(p.progressionTypeId)))
  return ['EVALUATION', 'ACTION'].filter((g) => !recorded.has(g))
}

// Chọn nhóm trước (Đánh giá, Xử lý, Gọi báo tin, …), mỗi nhóm có câu giải thích và dấu đã có hoặc còn thiếu cho
// "Chuyển theo dõi"; rồi chọn loại trong nhóm. Nhóm chỉ có một loại thì chọn sẵn. Loại hồi sức nằm riêng dưới Xử lý vì cần
// xác nhận nguyện vọng.
function ProgressionPicker({ types, group, onGroup, value, onChange, missing, emergency }) {
  const [showResuscitation, setShowResuscitation] = useState(false)
  const active = pickableTypes(types)
  const groups = PROGRESSION_SECTIONS.filter(([g]) => active.some(inGroupOf(g)))
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
  const inGroup = group ? active.filter(inGroupOf(group)) : []
  const plain = inGroup
    .filter((t) => !t.resuscitation)
    .toSorted((a, b) => Number(isOtherType(a)) - Number(isOtherType(b)))
  const resuscitation = inGroup.filter((t) => t.resuscitation)
  const groupName = PROGRESSION_SECTIONS.find(([g]) => g === group)?.[1]
  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Nhóm diễn biến" className="grid gap-2 sm:grid-cols-2">
        {groups.map(([g, label]) => {
          const needed = ['EVALUATION', 'ACTION'].includes(g)
          const selected = group === g
          return (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onGroup(g)}
              className={cn(
                'flex min-h-16 flex-col items-start gap-0.5 rounded-lg border px-4 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                selected ? 'border-primary bg-primary/10' : 'hover:bg-muted',
              )}
            >
              <span className="flex w-full flex-wrap items-baseline justify-between gap-x-2">
                <span className="type-label">{label}</span>
                {needed && (
                  <span
                    className={cn(
                      'type-caption',
                      missing.includes(g) ? 'text-warning-foreground' : 'text-success-foreground',
                    )}
                  >
                    {missing.includes(g) ? 'Còn thiếu để Chuyển theo dõi' : 'Đã có'}
                  </span>
                )}
              </span>
              <span className="type-caption text-muted-foreground">{GROUP_HINT[g]}</span>
            </button>
          )
        })}
      </div>
      {group && (
        <section aria-label={`Loại trong nhóm ${groupName}`} className="flex flex-col gap-1.5">
          {plain.length > 0 && <div className="flex flex-wrap gap-2">{plain.map(chip)}</div>}
          {resuscitation.length > 0 && emergency && (
            <>
              <Button
                type="button"
                variant="ghost"
                className="h-11 self-start"
                aria-expanded={showResuscitation}
                onClick={() => setShowResuscitation((v) => !v)}
              >
                {showResuscitation ? 'Ẩn cấp cứu hồi sức' : 'Cấp cứu hồi sức (chỉ khi ngừng tim, ngừng thở)'}
              </Button>
              {(showResuscitation || resuscitation.some((t) => String(t.id) === value)) && (
                <div className="flex flex-wrap gap-2">{resuscitation.map(chip)}</div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}

// Nhóm chỉ có một loại thường dùng (không tính hồi sức) thì chọn sẵn loại đó
function onlyTypeOf(types, group) {
  const plain = pickableTypes(types)
    .filter(inGroupOf(group))
    .filter((t) => !t.resuscitation)
  return plain.length === 1 ? String(plain[0].id) : ''
}

function CommandForm({
  mode,
  incident,
  progressionTypes,
  missingGroups,
  typeCode,
  busy,
  onSubmit,
  onCancel,
  initialGroup = null,
}) {
  const [text, setText] = useState('')
  const [group, setGroup] = useState(initialGroup)
  const [choice, setChoice] = useState(() => (initialGroup ? onlyTypeOf(progressionTypes, initialGroup) : ''))
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
      'end-post-fall-monitoring': { reason: value },
      'assign-handler': { assigneeId: Number(assignee), note: value },
      close: { resolution: value, ...(outcome ? { infectionOutcome: outcome } : {}) },
    }[mode]
    onSubmit(mode, body)
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {mode === 'progressions' && <FocusHeading step={mode}>{FORM_TITLE[mode]}</FocusHeading>}
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
          <FieldLabel>Bạn ghi gì?</FieldLabel>
          <ProgressionPicker
            types={progressionTypes}
            group={group}
            onGroup={(next) => {
              setGroup(next)
              setChoice(onlyTypeOf(progressionTypes, next))
            }}
            value={choice}
            onChange={setChoice}
            missing={missingGroups}
            emergency={incident.level === 'CRITICAL'}
          />
          {submitted && choiceMissing && (
            <FieldError>{group ? 'Chọn loại diễn biến' : 'Chọn nhóm diễn biến'}</FieldError>
          )}
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
          placeholder={mode === 'progressions' ? GROUP_PLACEHOLDER[group] : undefined}
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

// Điều kiện "Chuyển theo dõi" (BR-M05-20): một diễn biến đánh giá và một diễn biến xử lý; nhóm thiếu có nút ghi đúng nhóm
function MonitoringChecklist({ missing, canWrite, onWrite }) {
  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <p className="type-body-sm text-muted-foreground">Để Chuyển theo dõi cần:</p>
      <ul className="flex flex-col gap-2">
        {['EVALUATION', 'ACTION'].map((g) => {
          const lacking = missing.includes(g)
          const label = PROGRESSION_SECTIONS.find(([x]) => x === g)[1].toLowerCase()
          return (
            <li key={g} className="flex flex-wrap items-center gap-x-3 gap-y-1 type-body-sm">
              {lacking ? (
                <Circle aria-hidden="true" className="size-4 text-warning-foreground" />
              ) : (
                <CircleCheck aria-hidden="true" className="size-4 text-success-foreground" />
              )}
              <span>
                1 diễn biến {label}: {lacking ? 'chưa có' : 'đã có'}
              </span>
              {lacking && canWrite && (
                <Button type="button" variant="outline" className="h-11" onClick={() => onWrite(g)}>
                  Ghi {label}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function IncidentDetail({ id, name, types, onChanged, onNavigate }) {
  const [state, setState] = useState(null)
  const [linkedAlerts, setLinkedAlerts] = useState([])
  const [followUps, setFollowUps] = useState(null)
  const { can } = usePermissions()
  const [residentStatus, setResidentStatus] = useState(null)
  const [problem, setProblem] = useState(null)
  const [mode, setMode] = useState(null)
  const [progressionStart, setProgressionStart] = useState(null)
  const [busy, setBusy] = useState(false)
  function openProgression(group = null) {
    setProgressionStart(group)
    setMode('progressions')
  }

  // Trạng thái người cao tuổi, tải lại mỗi khi sự cố được tải lại (sau chuyển viện thì khóa nút Chuyển viện)
  const residentIdForStatus = state?.incident?.content?.residentId ?? null
  useEffect(() => {
    if (residentIdForStatus == null) return undefined
    let live = true
    loadResidentStatus(residentIdForStatus).then((status) => live && setResidentStatus(status))
    return () => {
      live = false
    }
  }, [residentIdForStatus, state])

  useEffect(() => {
    let live = true
    loadLinkedAlerts(id).then((alerts) => live && setLinkedAlerts(alerts))
    loadFollowUps(id).then((tasks) => live && setFollowUps(tasks))
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
  const progressionGroup = (typeId) =>
    PROGRESSION_SECTIONS.find(([group]) => group === progressionTypes.find((t) => t.id === typeId)?.group)?.[1]

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
  const transferredNote = (incident.progressions ?? []).findLast((p) => p.typeCode === 'TRANSFERRED_OUT') ?? null
  // Diễn biến hệ thống khi người cao tuổi được Ghi nhận trở về sau lần chuyển viện này (đề xuất 2026-11-23 lượt 3)
  const returnedNote =
    transferredNote &&
    ((incident.progressions ?? []).findLast(
      (p) => p.typeCode === 'RETURNED_FROM_HOSPITAL' && p.occurredAt >= transferredNote.occurredAt,
    ) ??
      null)
  const atHospital = transferredNote && !returnedNote && residentStatus === 'HOSPITALIZED'
  const transferOffered =
    ['NEW', 'IN_PROGRESS'].includes(incident.status) &&
    incident.content?.residentId != null &&
    commands.includes('transfer-out')
  const statusBlocksTransfer = residentStatus != null && !TRANSFERABLE_STATUS.includes(residentStatus)
  const canTransfer = transferOffered && !statusBlocksTransfer

  // Ghi diễn biến mở ngay trong khối Diễn biến để vẫn thấy các lần ghi trước; lệnh khác mở hộp
  const inDialog = mode != null && !['progressions', 'follow-up'].includes(mode)
  const pendingFollowUps = (followUps ?? []).filter((t) => FOLLOW_UP_OPEN.includes(t.status))
  function closeMode() {
    // Chuyển viện có thể đã xong trước khi đóng hộp (màn tải bản tóm tắt): tải lại sự cố. Ghi diễn biến: trả focus về nút mở
    if (mode === 'transfer-out') loadIncident(incident.id).then(setState, () => {})
    if (mode === 'progressions') requestAnimationFrame(() => document.getElementById('write-progression')?.focus())
    setMode(null)
    setProblem(null)
  }

  const messages = {
    progressions: 'Đã ghi diễn biến',
    'change-level': 'Đã đổi mức sự cố',
    reopen: 'Đã mở lại xử lý',
    close: 'Đã đóng sự cố',
    'assign-handler': 'Đã giao người xử lý',
    'end-post-fall-monitoring': 'Đã kết thúc theo dõi sau ngã',
  }

  const commandForm = (
    <CommandForm
      key={`${mode}-${progressionStart ?? ''}`}
      mode={mode}
      initialGroup={mode === 'progressions' ? progressionStart : null}
      incident={incident}
      progressionTypes={progressionTypes}
      missingGroups={missingGroups}
      typeCode={type?.code}
      busy={busy}
      onSubmit={(command, body) => run(command, body, messages[command])}
      onCancel={closeMode}
    />
  )
  const call115 = commands.includes('call-115') && <Call115Panel subject="incidents" id={incident.id} />
  const content = incident.content ?? {}
  const progressions = incident.progressions ?? []
  const steps = incident.status === 'CLOSED' ? ['NEW', 'CLOSED'] : STEPS
  const conclusions = [
    commands.includes('move-to-monitoring') && {
      icon: Eye,
      label: 'Chuyển theo dõi',
      hint:
        missingGroups.length === 0
          ? 'Đã có diễn biến đánh giá và xử lý, chuyển được ngay.'
          : `Cần thêm diễn biến ${missingGroups.map((g) => GROUP_LABEL[g]).join(' và ')}.`,
      disabled: busy || missingGroups.length > 0,
      onSelect: () => run('move-to-monitoring', null, 'Đã chuyển theo dõi'),
    },
    commands.includes('reopen') && {
      icon: RotateCcw,
      label: 'Mở lại xử lý',
      hint: 'Đưa sự cố về Đang xử lý, cần lý do.',
      onSelect: () => setMode('reopen'),
    },
    commands.includes('close') && {
      icon: CircleCheck,
      label: 'Đóng sự cố',
      hint: 'Ghi kết quả. Đã đóng thì chỉ đính chính.',
      onSelect: () => setMode('close'),
    },
    commands.includes('end-post-fall-monitoring') && {
      icon: ListChecks,
      label: 'Kết thúc theo dõi sau ngã',
      hint: 'Dừng lịch theo dõi sau ngã, cần lý do.',
      onSelect: () => setMode('end-post-fall-monitoring'),
    },
  ].filter(Boolean)

  return (
    <div className="flex flex-col gap-5">
      <CaseHeader
        code={type?.code}
        title={type?.name ?? 'Sự cố'}
        subtitle={`SC-${incident.id}, ${name}, phát hiện lúc ${formatDateTime(content.discoveredAt)}`}
        badges={
          <>
            <CaseBadge label="Mức">
              <StatusBadge status={LEVEL_LABEL[incident.level]} />
            </CaseBadge>
            <CaseBadge label="Trạng thái">
              <IncidentStatus incident={incident} />
            </CaseBadge>
            {transferredNote && (
              <Badge variant="attention">
                {returnedNote ? 'Đã về viện' : atHospital ? 'Đang ở bệnh viện' : 'Đã chuyển viện'}
              </Badge>
            )}
          </>
        }
        note={
          transferredNote && (
            <div className="flex flex-col gap-1 type-body-sm">
              <p>
                {transferredNote.content}, lúc {formatDateTime(transferredNote.occurredAt)}.
              </p>
              {returnedNote ? (
                <p>
                  Đã về viện lúc {formatDateTime(returnedNote.occurredAt)}. Việc tiếp theo: lập phiếu đối chiếu thuốc
                  trong 4 giờ, Bác sĩ đánh giá lại trong 48 giờ; ghi diễn biến rồi chuyển theo dõi hoặc đóng sự cố.
                </p>
              ) : atHospital ? (
                <p>
                  {name} đang điều trị tại bệnh viện. Khi về, Trưởng tầng hoặc Hành chính bấm Ghi nhận trở về ở hồ sơ
                  người cao tuổi; sự cố sẽ tự ghi lúc về. Trong lúc chờ vẫn ghi được diễn biến khi có tin từ bệnh viện.
                </p>
              ) : (
                <p>Sự cố vẫn mở để theo dõi, đóng kèm kết quả khi xong.</p>
              )}
            </div>
          )
        }
        actions={
          <>
            {commands.includes('receive') && (
              <CaseAction
                icon={ClipboardCheck}
                variant="default"
                disabled={busy}
                onClick={() => run('receive', null, 'Đã tiếp nhận sự cố')}
              >
                Tiếp nhận
              </CaseAction>
            )}
            {transferOffered && (
              <CaseAction icon={Ambulance} disabled={!canTransfer} onClick={() => setMode('transfer-out')}>
                Chuyển viện
              </CaseAction>
            )}
            {commands.includes('join-handling') && (
              <CaseAction
                icon={UserPlus}
                disabled={busy}
                onClick={() => run('join-handling', null, 'Đã tham gia xử lý')}
              >
                Tham gia xử lý
              </CaseAction>
            )}
          </>
        }
      />
      {STEPS.includes(incident.status) && (
        <CaseSteps steps={steps.map((s) => STATUS_LABEL[s])} current={steps.indexOf(incident.status)} />
      )}
      {transferOffered && statusBlocksTransfer && (
        <p className="type-body-sm text-muted-foreground">
          Chưa chuyển viện được: {name}{' '}
          {RESIDENT_STATUS_TEXT[residentStatus] ?? 'đang ở trạng thái không cho chuyển viện'}. Chỉ chuyển viện được khi
          người cao tuổi đang lưu trú, tạm vắng hoặc đang hoạt động bên ngoài.
        </p>
      )}
      {problem && !inDialog && <ProblemAlert problem={problem} />}
      {incident.level === 'CRITICAL' && isOpen(incident) ? (
        <EmergencyCardPanel incidentId={incident.id}>{call115}</EmergencyCardPanel>
      ) : (
        call115
      )}
      {content.residentId != null && isOpen(incident) && (
        <ResidentCallReminders residentId={content.residentId} residentName={name} />
      )}
      {content.residentId != null && isOpen(incident) && <CriticalNotice residentId={content.residentId} />}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <CaseBlock title="Ghi nhận">
          <CaseFacts
            rows={[
              ['Mô tả', content.description ?? '', true],
              [
                'Xảy ra lúc',
                content.occurredAt && content.occurredAt !== content.discoveredAt
                  ? formatDateTime(content.occurredAt)
                  : undefined,
              ],
              ['Nơi xảy ra', content.location ?? ''],
              ['Xử lý ban đầu', content.initialResponse ?? '', true],
              ['Người xử lý', incident.assignee ?? 'Chưa ai nhận'],
              ['Cùng xử lý', (incident.handlers ?? []).join(', ') || undefined],
              ['Tiếp nhận lúc', incident.receivedAt ? formatDateTime(incident.receivedAt) : undefined],
              ['Kết quả', incident.resolution ?? undefined, true],
            ]}
          />
          {incident.noOnDutyDoctor && (
            <p className="type-body-sm text-destructive">Không có bác sĩ trực lúc ghi nhận</p>
          )}
          {(commands.includes('change-level') || commands.includes('assign-handler')) && (
            <div className="flex flex-wrap gap-2">
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
          <NotifiedSection recipients={incident.notifiedRecipients ?? []} />
          {linkedAlerts.map((alert) => (
            <CaseLink
              key={alert.id}
              label={`Cảnh báo liên kết ${alert.id}`}
              text={linkedAlertText(
                alert,
                types.find((t) => t.code === alert.type)?.name ?? alertTypeLabel(alert.type),
              )}
              action="Mở cảnh báo gốc"
              onOpen={onNavigate && (() => onNavigate('alerts', { alertId: alert.id }))}
            />
          ))}
          {content.residentId != null && onNavigate && can('CARE_PLAN', 'VIEW') && (
            <CaseLink
              label="Kế hoạch chăm sóc"
              text="Phòng ngừa lâu dài ghi ở kế hoạch chăm sóc."
              action="Mở kế hoạch chăm sóc"
              onOpen={() => onNavigate('care-plans', { residentId: content.residentId })}
            />
          )}
        </CaseBlock>
        <div className="flex min-w-0 flex-col gap-5">
          {conclusions.length > 0 && (
            <CaseBlock title="Kết luận">
              <CaseChoices items={conclusions} />
              {commands.includes('move-to-monitoring') && missingGroups.length > 0 && (
                <MonitoringChecklist
                  missing={missingGroups}
                  canWrite={commands.includes('progressions')}
                  onWrite={openProgression}
                />
              )}
            </CaseBlock>
          )}
          <FollowUpBlock
            tasks={followUps}
            open={isOpen(incident)}
            canAdd={isOpen(incident) && content.residentId != null && can('TASK_CHECKLIST', 'CREATE')}
            onAdd={() => setMode('follow-up')}
            onOpenTask={
              onNavigate &&
              can('TASK_CHECKLIST', 'CONFIRM') &&
              ((task) => onNavigate('care-tasks', { shiftId: task.shiftId, taskId: task.id }))
            }
          />
          <CaseBlock
            title="Diễn biến"
            aside={progressions.length > 0 && `${progressions.length} lần ghi, mới nhất trước`}
          >
            {commands.includes('progressions') && mode !== 'progressions' && (
              <CaseAction
                id="write-progression"
                icon={NotebookPen}
                variant={commands.includes('receive') ? 'outline' : 'default'}
                className="self-start"
                onClick={() => openProgression()}
              >
                Ghi diễn biến
              </CaseAction>
            )}
            {mode === 'progressions' && <div className="rounded-lg border p-4">{commandForm}</div>}
            {progressions.length === 0 ? (
              <p className="type-body-sm text-muted-foreground">Chưa ghi diễn biến.</p>
            ) : (
              <ol className="flex flex-col">
                {progressions.toReversed().map((p) => {
                  const group = progressionGroup(p.progressionTypeId)
                  return (
                    <li
                      key={p.id}
                      className="relative flex flex-col gap-0.5 border-l-2 pb-5 pl-5 before:absolute before:top-1.5 before:-left-[7px] before:size-3 before:rounded-full before:border-2 before:border-primary before:bg-card last:pb-0"
                    >
                      <span className="flex flex-wrap items-baseline gap-x-3">
                        <span className="type-label">{progressionName(p.progressionTypeId)}</span>
                        {group && <span className="type-caption text-accent-foreground">{group}</span>}
                      </span>
                      <span className="type-body-sm text-muted-foreground tabular-nums">
                        {formatDateTime(p.occurredAt)}
                      </span>
                      <span className="type-body break-words">{p.content}</span>
                    </li>
                  )
                })}
              </ol>
            )}
          </CaseBlock>
        </div>
      </div>
      {mode === 'follow-up' && (
        <FollowUpForm
          incidentId={incident.id}
          residentId={content.residentId}
          onClose={() => setMode(null)}
          onSaved={async (message) => {
            setMode(null)
            setFollowUps(await loadFollowUps(incident.id))
            onChanged(message)
          }}
        />
      )}
      {inDialog && (
        <CaseDialog
          title={DIALOG_TITLE[mode]}
          description={DIALOG_HINT[mode]}
          problem={problem}
          wide={mode === 'transfer-out'}
          onClose={closeMode}
        >
          {mode === 'transfer-out' ? (
            <TransferOutPanel
              incidentId={incident.id}
              residentId={content.residentId ?? null}
              onCancel={closeMode}
              onDone={async () => {
                setMode(null)
                setState(await loadIncident(incident.id))
                onChanged('Đã chuyển viện')
              }}
            />
          ) : (
            <>
              {mode === 'close' && pendingFollowUps.length > 0 && (
                <Alert role="note" variant="attention">
                  Còn {pendingFollowUps.length} việc tiếp theo chưa xong. Đóng sự cố không hủy các việc này. Phòng ngừa
                  lâu dài thì ghi vào kế hoạch chăm sóc trước khi đóng.
                </Alert>
              )}
              {commandForm}
            </>
          )}
        </CaseDialog>
      )}
    </div>
  )
}

// Ghi nhận sự cố (FR-040, FR-042): người cao tuổi (loại cơ sở vật chất được bỏ trống), loại, mức, thời điểm phát hiện,
// mô tả; mức thấp hơn mặc định cần lý do. Khẩn cấp kích hoạt quy trình ở backend trong cùng lệnh.
function RecordIncidentForm({ types, incidents, announcement, onClose, onRecorded, onOpenExisting }) {
  const [residents, setResidents] = useState(null)
  const [residentId, setResidentId] = useState(null)
  const [noResident, setNoResident] = useState(false)
  const [residentQuery, setResidentQuery] = useState('')
  const [floors, setFloors] = useState([])
  const [floorId, setFloorId] = useState('')
  const [floorsUnavailable, setFloorsUnavailable] = useState(false)
  const [existingId, setExistingId] = useState(null)
  const [typeId, setTypeId] = useState('')
  const [level, setLevel] = useState('')
  const [discoveredAt, setDiscoveredAt] = useState(() => vietnamNowLocal())
  const [description, setDescription] = useState('')
  const [moreDetail, setMoreDetail] = useState(false)
  const [place, setPlace] = useState('')
  const [initialResponse, setInitialResponse] = useState('')
  const [occurredAt, setOccurredAt] = useState('')
  const [lowerReason, setLowerReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [problem, setProblem] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadResidentChoices().then(
      (data) => !cancelled && setResidents(data),
      (error) => !cancelled && setProblem(problemOf(error)),
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

  const pickedResident = residents?.find((r) => r.id === residentId) ?? null
  const activeTypes = types.filter((t) => t.active !== false && t.status !== 'INACTIVE')
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
    if (picked) setLevel(presetLevel(picked))
  }

  function submit(event) {
    event.preventDefault()
    save({ again: event.nativeEvent.submitter?.name === 'again' })
  }

  // separate: đã thấy sự cố Khẩn cấp đang mở và chọn tạo sự cố riêng (FR-041, createDespiteOpen)
  async function save({ again = false, separate = false }) {
    setSubmitted(true)
    if (Object.values(errors).some(Boolean)) return
    setExistingId(null)
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
        ...(place.trim() ? { location: place.trim() } : {}),
        ...(initialResponse.trim() ? { initialResponse: initialResponse.trim() } : {}),
        ...(occurredAt ? { occurredAt: vietnamIso(occurredAt) } : {}),
        ...(lowerNeeded ? { lowerLevelReason: lowerReason.trim() } : {}),
        ...(separate ? { createDespiteOpen: true } : {}),
      })
      onRecorded(`Đã ghi nhận sự cố ${type.name.toLowerCase()}, ${pickedResident?.name ?? 'việc chung'}`, again)
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

  const answered = residentId != null || noResident
  const chooseableTypes = noResident ? activeTypes.filter((t) => t.allowsNoResident) : activeTypes
  const step = !answered ? 'resident' : !type ? 'type' : 'detail'

  return (
    <CasePage
      label="Ghi nhận sự cố"
      backLabel="Sự cố"
      here="Ghi nhận sự cố"
      onBack={onClose}
      returnFocusId="record-incident"
      announcement={announcement}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <CaseWizard
          title="Ghi nhận sự cố"
          subtitle="Mức Khẩn cấp mở quy trình khẩn cấp ngay khi lưu."
          current={step}
          steps={[
            {
              key: 'resident',
              label: 'Ghi cho ai',
              value: pickedResident ? (
                <>
                  <ResidentAvatar name={pickedResident.name} code={String(pickedResident.id)} className="size-8" />
                  {pickedResident.name}
                </>
              ) : (
                noResident && 'Việc chung'
              ),
              action: 'Đổi người',
              onEdit: () => {
                setResidentId(null)
                setNoResident(false)
              },
            },
            {
              key: 'type',
              label: 'Chuyện gì xảy ra',
              value: type && (
                <>
                  <IncidentTypeIcon code={type.code} className="size-8 [&_svg]:size-4" />
                  {type.name}
                </>
              ),
              action: 'Đổi loại',
              onEdit: () => {
                setTypeId('')
                setLevel('')
              },
            },
            { key: 'detail', label: 'Mức và mô tả' },
          ]}
        >
          {pickedResident && AWAY_STATUS_TEXT[pickedResident.status] && (
            <Alert role="note" variant="attention">
              {pickedResident.name} {AWAY_STATUS_TEXT[pickedResident.status]}, không có mặt ở viện. Chỉ ghi sự cố nếu
              việc thật sự liên quan (ví dụ đồ gửi, thông tin, theo dõi sau chuyển viện).
            </Alert>
          )}
          {step === 'resident' && (
            <>
              <FocusHeading step={step}>Ghi cho ai?</FocusHeading>
              {!residents ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <ResidentChoices
                  residents={residents}
                  query={residentQuery}
                  onQuery={setResidentQuery}
                  onPick={setResidentId}
                />
              )}
              {activeTypes.some((t) => t.allowsNoResident) && (
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
                  Việc chung, không gắn người cao tuổi
                </Button>
              )}
              {floorsUnavailable && (
                <p className="type-body-sm text-muted-foreground">
                  Việc chung phải có tầng để báo đúng người phụ trách ca, hiện chưa có tầng nào đang có ca. Nhờ Trưởng
                  tầng ghi nhận giúp.
                </p>
              )}
            </>
          )}
          {step === 'type' && (
            <>
              <FocusHeading step={step}>Chuyện gì xảy ra?</FocusHeading>
              <IncidentTypePicker types={chooseableTypes} value="" onChange={pickType} />
              <p className="type-body-sm text-muted-foreground">
                Chọn loại gần nhất hoặc loại "khác", rồi ghi rõ ở Mô tả. Hay gặp loại nào chưa có thì nhờ Quản lý viện
                thêm vào danh mục.
              </p>
            </>
          )}
          {step === 'detail' && (
            <>
              <FocusHeading step={step}>Mức và mô tả</FocusHeading>
              <Card>
                <CardContent className="flex flex-col gap-4">
                  <Field data-invalid={(submitted && errors.level) || undefined}>
                    <FieldLabel>Mức</FieldLabel>
                    <LevelChoices value={level} onChange={setLevel} />
                    <span className="type-caption text-muted-foreground">
                      Mặc định của loại: {LEVEL_LABEL[type.defaultLevel]}
                    </span>
                    {submitted && errors.level && <FieldError>Chọn mức</FieldError>}
                  </Field>
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
                      {submitted && errors.lowerReason && (
                        <FieldError>Nhập lý do chọn mức thấp hơn mặc định</FieldError>
                      )}
                    </Field>
                  )}
                  <div className="grid items-start gap-4 sm:grid-cols-2">
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
                            Tài khoản của bạn chưa xem được danh sách tầng. Nhờ Trưởng tầng ghi nhận giúp, hoặc báo Quản
                            lý viện cấp quyền tra cứu tầng.
                          </p>
                        )}
                        {submitted && errors.floor && <FieldError>Chọn tầng xảy ra sự cố</FieldError>}
                      </Field>
                    )}
                  </div>
                  <Field>
                    <FieldLabel htmlFor="incident-place">Nơi xảy ra</FieldLabel>
                    <div className="flex flex-wrap gap-2">
                      {QUICK_PLACES.map((text) => (
                        <Button
                          key={text}
                          type="button"
                          variant="outline"
                          className="h-11 px-4"
                          aria-pressed={place === text}
                          onClick={() => setPlace(text)}
                        >
                          {text}
                        </Button>
                      ))}
                    </div>
                    <Input
                      id="incident-place"
                      className="h-11"
                      maxLength={200}
                      placeholder="Ghi rõ, ví dụ: hành lang gần phòng 101"
                      value={place}
                      onChange={(e) => setPlace(e.target.value)}
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
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 self-start"
                    aria-expanded={moreDetail}
                    onClick={() => setMoreDetail((v) => !v)}
                  >
                    {moreDetail ? 'Ẩn chi tiết thêm' : 'Thêm chi tiết (không bắt buộc): xử lý ban đầu, lúc xảy ra'}
                  </Button>
                  {moreDetail && (
                    <div className="flex flex-col gap-4">
                      <Field>
                        <FieldLabel htmlFor="incident-initial-response">Xử lý ban đầu</FieldLabel>
                        <Textarea
                          id="incident-initial-response"
                          rows={2}
                          maxLength={2000}
                          placeholder="Đã làm gì ngay lúc đó"
                          value={initialResponse}
                          onChange={(e) => setInitialResponse(e.target.value)}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="incident-occurred-at">Xảy ra lúc (nếu khác lúc phát hiện)</FieldLabel>
                        <Input
                          id="incident-occurred-at"
                          type="datetime-local"
                          className="h-11"
                          value={occurredAt}
                          onChange={(e) => setOccurredAt(e.target.value)}
                        />
                      </Field>
                    </div>
                  )}
                </CardContent>
              </Card>
              {existingId != null && (
                <Alert variant="attention" className="gap-3 p-4">
                  <p>
                    Người cao tuổi này đang có sự cố Khẩn cấp chưa đóng: <strong>SC-{existingId}</strong>
                    {existingType && `, ${existingType.name}`}
                    {existing?.content?.discoveredAt && `, phát hiện ${formatDateTime(existing.content.discoveredAt)}`}
                    {existing && `, người xử lý: ${existing.assignee ?? 'chưa ai nhận'}`}. Chuyện vừa ghi là một phần
                    của sự cố đó thì tham gia xử lý; là chuyện khác (ví dụ một lần ngã khác) thì tạo sự cố riêng.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" className="h-11" disabled={busy} onClick={joinExisting}>
                      Tham gia xử lý SC-{existingId}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 text-foreground"
                      disabled={busy}
                      onClick={() => save({ separate: true })}
                    >
                      Tạo sự cố riêng
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-11 text-foreground"
                      onClick={() => onOpenExisting(existingId)}
                    >
                      Mở sự cố đó
                    </Button>
                  </div>
                </Alert>
              )}
              {problem && <ProblemAlert problem={problem} />}
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="ghost" className="h-11" onClick={onClose}>
                  Hủy
                </Button>
                <Button type="submit" name="again" variant="outline" className="h-11 bg-card" disabled={busy}>
                  Lưu và ghi tiếp
                </Button>
                <Button type="submit" className="h-11" disabled={busy}>
                  Lưu sự cố
                </Button>
              </div>
            </>
          )}
          {step !== 'detail' && problem && <ProblemAlert problem={problem} />}
        </CaseWizard>
      </form>
    </CasePage>
  )
}

// incidentId: mở thẳng một sự cố (016 Q12, từ dòng chi tiết báo cáo)
export function IncidentsPage({ incidentId = null, onNavigate } = {}) {
  const [board, setBoard] = useState(null)
  const [problem, setProblem] = useState(null)
  const [group, setGroup] = useState('open')
  const [levelFilter, setLevelFilter] = useState('ALL')
  const [openId, setOpenId] = useState(incidentId)
  const [recording, setRecording] = useState(false)
  const [recordKey, setRecordKey] = useState(0)
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
  const inHospital = (i) => isOpen(i) && board?.statuses?.[i.content?.residentId] === 'HOSPITALIZED'
  const typeName = (i) => types.find((t) => t.id === i.currentTypeId)?.name ?? 'Sự cố'
  const typeCode = (i) => types.find((t) => t.id === i.currentTypeId)?.code
  const inGroup = (value) => incidents.filter((i) => (value === 'open' ? isOpen(i) : !isOpen(i)))
  const grouped = inGroup(group)
  const visible = sortIncidents(grouped.filter((i) => levelFilter === 'ALL' || i.level === levelFilter))
  const opened = incidents.find((i) => i.id === openId)

  async function changed(message) {
    setAnnouncement(`${message}.`)
    await reload()
  }

  if (recording) {
    return (
      <RecordIncidentForm
        key={recordKey}
        types={types}
        incidents={incidents}
        announcement={announcement}
        onOpenExisting={(id) => {
          setRecording(false)
          setOpenId(id)
        }}
        onClose={() => setRecording(false)}
        onRecorded={async (message, again) => {
          if (again) setRecordKey((k) => k + 1)
          else setRecording(false)
          await changed(message)
        }}
      />
    )
  }

  if (opened) {
    return (
      <CasePage
        key={opened.id}
        label="Chi tiết sự cố"
        backLabel="Sự cố"
        here={`SC-${opened.id}`}
        onBack={() => setOpenId(null)}
        returnFocusId={`incident-row-${opened.id}`}
        announcement={announcement}
      >
        <IncidentDetail
          id={opened.id}
          name={nameOf(opened)}
          types={types}
          onChanged={changed}
          onNavigate={onNavigate}
        />
      </CasePage>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <PageHeader
        title="Sự cố"
        subtitle="Sự cố trong phạm vi của bạn, khẩn cấp lên đầu."
        aside={
          <Button
            id="record-incident"
            className="h-11"
            onClick={() => {
              setAnnouncement('')
              setRecording(true)
            }}
          >
            <Plus aria-hidden="true" />
            Ghi nhận sự cố
          </Button>
        }
      >
        <div className="flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:gap-x-12">
          <FilterTabs
            label="Nhóm sự cố"
            value={group}
            onChange={setGroup}
            options={GROUPS.map(([value, label]) => [value, label, inGroup(value).length])}
          />
          <FilterTabs
            label="Lọc theo mức"
            value={levelFilter}
            onChange={setLevelFilter}
            options={['ALL', ...LEVEL_ORDER].map((l) => [
              l,
              l === 'ALL' ? 'Tất cả mức' : LEVEL_LABEL[l],
              l === 'ALL' ? grouped.length : grouped.filter((i) => i.level === l).length,
            ])}
          />
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
              {levelFilter !== 'ALL' && grouped.length > 0
                ? `Không có sự cố mức ${LEVEL_LABEL[levelFilter].toLowerCase()} trong nhóm này.`
                : group === 'open'
                  ? 'Không có sự cố đang mở trong phạm vi của bạn.'
                  : 'Chưa có sự cố đã kết thúc.'}
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
                  <TableRow key={i.id} className="relative">
                    <TableCell className="type-body-sm tabular-nums text-muted-foreground">SC-{i.id}</TableCell>
                    <TableCell>
                      <Button
                        id={`incident-row-${i.id}`}
                        variant="ghost"
                        className="h-auto justify-start gap-2 px-1 py-1 after:absolute after:inset-0 after:content-[''] hover:bg-transparent"
                        onClick={() => {
                          setAnnouncement('')
                          setOpenId(i.id)
                        }}
                        aria-label={`${nameOf(i)}, ${typeName(i)}`}
                      >
                        <ResidentAvatar name={nameOf(i)} code={String(i.content?.residentId ?? i.id)} />
                        <span className="type-label">{nameOf(i)}</span>
                      </Button>
                    </TableCell>
                    <TableCell className="type-body-sm">
                      <span className="flex items-center gap-2">
                        <IncidentTypeIcon code={typeCode(i)} className="size-8 [&_svg]:size-4" />
                        {typeName(i)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={LEVEL_LABEL[i.level]} />
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap items-center gap-x-3">
                        <IncidentStatus incident={i} />
                        {inHospital(i) && <Badge variant="attention">Đang ở bệnh viện</Badge>}
                      </span>
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
    </div>
  )
}
