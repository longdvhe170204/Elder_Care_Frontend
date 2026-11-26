import { useCallback, useEffect, useState } from 'react'
import { cn } from 'cn'
import {
  Ambulance,
  CircleCheck,
  ClipboardCheck,
  Eye,
  ListChecks,
  Phone,
  Plus,
  RotateCcw,
  UserPlus,
} from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PageHeader } from '@/common/PageHeader'
import { PermissionDeniedState } from '@/common/PageState'
import { ProblemAlert } from '@/common/ProblemAlert'
import { StatusBadge } from '@/common/StatusBadge'
import { formatDateTime } from '@/common/dateTime'
import { usePermissions } from '@/common/permissions/permissions'
import { problemOf } from '@/common/problem'
import { Call115Panel } from '@/features/alerts/Call115Panel'
import { typeLabel as alertTypeLabel } from '@/features/alerts/alertView'
import { CriticalNotice } from '@/features/critical-care/CriticalNotice'
import { ResidentCallReminders } from '@/features/notifications/ResidentCallReminders'
import { AssistButton, AssistStatus } from '@/features/alerts/AssistRequest'
import { FilterTabs } from './CaseFormParts'
import {
  CaseActionBar,
  CaseBadge,
  CaseBlock,
  CaseDialog,
  CaseFacts,
  CaseHeader,
  CaseLink,
  CaseMore,
  CasePage,
  FocusHeading,
} from './CasePage'
import { EmergencyCardPanel } from './EmergencyCardPanel'
import { FamilyNoticePanel } from './FamilyNoticePanel'
import { HandoverStaffField } from './HandoverStaffField'
import { FollowUpBlock, FollowUpForm } from './IncidentFollowUps'
import { IncidentTypeIcon } from './IncidentTypePicker'
import { ProgressionComposer } from './ProgressionComposer'
import { ReportForm } from './ReportForm'
import { TransferOutPanel } from './TransferOutPanel'
import {
  loadIncident,
  loadFollowUps,
  loadIncidentBoard,
  loadLinkedAlerts,
  loadResidentStatus,
  recordFamilyNotice,
  runIncidentCommand,
} from './incidents'
import {
  FOLLOW_UP_OPEN,
  LEVEL_LABEL,
  LEVEL_ORDER,
  STATUS_LABEL,
  isOpen,
  sortIncidents,
  statusTone,
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
// Kết quả đóng hay gặp: bấm là điền sẵn, sửa thêm được (đề xuất 2026-11-24: chọn thay vì gõ)
const CLOSE_RESULTS = ['Ổn định tại viện', 'Đã chuyển viện, đã về, ổn định', 'Phòng ngừa đã ghi vào kế hoạch chăm sóc']
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
// Màu chấm của từng nhóm ở dòng diễn biến
const GROUP_DOT = {
  EVALUATION: 'bg-primary',
  ACTION: 'bg-success-foreground',
  NOTIFICATION: 'bg-warning-foreground',
  MONITORING: 'bg-muted-foreground',
}
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
        {mode === 'close' && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Kết quả hay gặp">
            {CLOSE_RESULTS.map((result) => (
              <Button
                key={result}
                type="button"
                variant="outline"
                aria-pressed={text === result}
                className={cn('h-11 px-3', text === result && 'border-2 border-primary bg-accent')}
                onClick={() => setText(result)}
              >
                {result}
              </Button>
            ))}
          </div>
        )}
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

function IncidentDetail({ id, name, types, onChanged, onNavigate }) {
  const [state, setState] = useState(null)
  const [linkedAlerts, setLinkedAlerts] = useState([])
  const [followUps, setFollowUps] = useState(null)
  const { can } = usePermissions()
  const [residentStatus, setResidentStatus] = useState(null)
  const [problem, setProblem] = useState(null)
  const [mode, setMode] = useState(null)
  // Đang xem trước phiếu chuyển viện: hộp chỉ hiện tờ giấy, không khung (BF-06)
  const [paper, setPaper] = useState(false)
  // true khi mở lại phiếu tóm tắt đã lập, không lập phiếu mới (BF-06)
  const [reopenSummary, setReopenSummary] = useState(false)
  // Tăng khi vừa tự ghi đã báo người nhà từ kết quả gọi, để khung Báo người nhà đọc lại
  const [familyTick, setFamilyTick] = useState(0)
  const [busy, setBusy] = useState(false)

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

  async function run(command, body, message) {
    setBusy(true)
    setProblem(null)
    try {
      await runIncidentCommand(incident.id, command, body)
      setMode(null)
      setState(await loadIncident(incident.id))
      onChanged(message)
      return true
    } catch (error) {
      if (command === 'receive' && [409, 422].includes(error?.status)) {
        // Người khác nhận trước vài giây: báo rõ và làm mới, nút Tiếp nhận biến mất (BF-06)
        setState(await loadIncident(incident.id).catch(() => state))
        onChanged('Đã có người nhận sự cố này, màn đã cập nhật')
        return false
      }
      setProblem(problemOf(error))
      return false
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
    !atHospital &&
    commands.includes('transfer-out')
  const statusBlocksTransfer = residentStatus != null && !TRANSFERABLE_STATUS.includes(residentStatus)
  const canTransfer = transferOffered && !statusBlocksTransfer

  // Gọi được người nhà ở "Cần gọi điện" thì tự ghi đã báo người nhà (gọi điện) cho sự cố, không bắt ghi hai lần (BF-06)
  async function onFamilyReached() {
    if (!commands.includes('family-notice')) return
    try {
      await recordFamilyNotice(incident.id, { method: 'PHONE', note: 'Ghi theo kết quả gọi người nhà' })
    } catch {
      // đã ghi trước đó hoặc không đủ điều kiện: giữ nguyên trạng thái hiện có
    }
    setFamilyTick((t) => t + 1)
  }

  // Ghi diễn biến mở ngay trong khối Diễn biến để vẫn thấy các lần ghi trước; lệnh khác mở hộp
  const inDialog = mode != null && !['progressions', 'follow-up'].includes(mode)
  const pendingFollowUps = (followUps ?? []).filter((t) => FOLLOW_UP_OPEN.includes(t.status))
  function closeMode() {
    // Chuyển viện có thể đã xong trước khi đóng hộp (màn tải bản tóm tắt): tải lại sự cố. Ghi diễn biến: trả focus về nút mở
    if (mode === 'transfer-out') loadIncident(incident.id).then(setState, () => {})
    if (mode === 'progressions') requestAnimationFrame(() => document.getElementById('write-progression')?.focus())
    setMode(null)
    setPaper(false)
    setReopenSummary(false)
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
      key={mode}
      mode={mode}
      incident={incident}
      progressionTypes={progressionTypes}
      missingGroups={missingGroups}
      typeCode={type?.code}
      busy={busy}
      onSubmit={(command, body) => run(command, body, messages[command])}
      onCancel={closeMode}
    />
  )
  const call115 = commands.includes('call-115') && (
    <div id="incident-call-115">
      <Call115Panel subject="incidents" id={incident.id} triggerEvent={`incident-call-115-${incident.id}`} />
    </div>
  )
  const content = incident.content ?? {}
  const progressions = incident.progressions ?? []
  // Thanh lệnh ở chân trang (đề xuất 2026-11-24, góp ý test demo): nút chính theo trạng thái (Tiếp nhận, Chuyển theo dõi,
  // Đóng sự cố), lệnh hay dùng là nút viền, lệnh ít dùng gom vào "Thêm thao tác"
  const actions = [
    commands.includes('call-115') && {
      icon: Phone,
      label: 'Gọi 115',
      danger: true,
      // Ô to ở đầu trang là nút gọi duy nhất: ghi lượt gọi, mở trình quay số; khối dưới chỉ còn thông tin đọc cho tổng đài
      // và chọn kết quả sau cuộc gọi
      onSelect: () => {
        window.dispatchEvent(new Event(`incident-call-115-${incident.id}`))
        document.getElementById('incident-call-115')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      },
    },
    commands.includes('receive') && {
      icon: ClipboardCheck,
      label: 'Tiếp nhận',
      primary: true,
      disabled: busy,
      onSelect: () => run('receive', null, 'Đã tiếp nhận sự cố'),
    },
    commands.includes('move-to-monitoring') && {
      icon: Eye,
      label: 'Chuyển theo dõi',
      hint:
        missingGroups.length === 0
          ? 'Đã có diễn biến đánh giá và xử lý, chuyển được ngay.'
          : `Cần thêm diễn biến ${missingGroups.map((g) => GROUP_LABEL[g]).join(' và ')}.`,
      primary: true,
      disabled: busy || missingGroups.length > 0,
      onSelect: () => run('move-to-monitoring', null, 'Đã chuyển theo dõi'),
    },
    commands.includes('close') && {
      icon: CircleCheck,
      label: 'Đóng sự cố',
      hint: 'Ghi kết quả. Đã đóng thì chỉ đính chính.',
      primary: true,
      onSelect: () => setMode('close'),
    },
    transferOffered && {
      icon: Ambulance,
      label: 'Chuyển viện',
      hint: statusBlocksTransfer
        ? `${name} ${RESIDENT_STATUS_TEXT[residentStatus] ?? 'đang ở trạng thái không cho chuyển viện'}.`
        : undefined,
      disabled: !canTransfer,
      onSelect: () => setMode('transfer-out'),
    },
    commands.includes('join-handling') && {
      icon: UserPlus,
      label: 'Tham gia xử lý',
      more: true,
      disabled: busy,
      onSelect: () => run('join-handling', null, 'Đã tham gia xử lý'),
    },
    commands.includes('reopen') && {
      icon: RotateCcw,
      label: 'Mở lại xử lý',
      hint: 'Đưa sự cố về Đang xử lý, cần lý do.',
      onSelect: () => setMode('reopen'),
    },
    commands.includes('assign-handler') && {
      label: incident.assignee ? 'Chuyển cho người khác' : 'Giao người xử lý',
      more: incident.assignee != null,
      onSelect: () => setMode('assign-handler'),
    },
    commands.includes('change-level') && {
      label: 'Đổi mức',
      more: true,
      onSelect: () => setMode('change-level'),
    },
    commands.includes('end-post-fall-monitoring') && {
      icon: ListChecks,
      label: 'Kết thúc theo dõi sau ngã',
      hint: 'Dừng lịch theo dõi sau ngã, cần lý do.',
      more: true,
      onSelect: () => setMode('end-post-fall-monitoring'),
    },
  ].filter(Boolean)

  return (
    <div className="flex flex-col gap-5">
      <CaseHeader
        code={type?.code}
        title={type?.name ?? 'Sự cố'}
        subtitle={`${name} · SC-${incident.id} · ${formatDateTime(content.discoveredAt)}${incident.assignee ? ` · ${incident.assignee} xử lý` : ''}`}
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
          // Chi tiết chuyển viện, về viện nằm trong Diễn biến; đầu trang chỉ còn việc cần làm tiếp (đề xuất 2026-11-24)
          <>
            {returnedNote && isOpen(incident) ? (
              <p className="rounded-lg bg-warning px-3 py-2 type-label text-warning-foreground">
                Tiếp: đối chiếu thuốc trong 4 giờ, Bác sĩ đánh giá lại trong 48 giờ (về lúc{' '}
                {formatDateTime(returnedNote.occurredAt)}).
              </p>
            ) : (
              atHospital && (
                <p className="type-body-sm">Khi về: Ghi nhận trở về ở hồ sơ người cao tuổi, sự cố tự ghi lúc về.</p>
              )
            )}
            {/* Đóng màn in rồi vẫn xem, in lại được phiếu đã lập (BF-06) */}
            {transferredNote && (
              <Button
                variant="outline"
                className="mt-2 h-11 self-start"
                onClick={() => {
                  setReopenSummary(true)
                  setMode('transfer-out')
                }}
              >
                Xem phiếu tóm tắt chuyển viện
              </Button>
            )}
          </>
        }
      />
      <CaseActionBar
        tiles
        items={actions}
        note={
          transferOffered &&
          statusBlocksTransfer && (
            <p className="type-body-sm text-muted-foreground">
              Chưa chuyển viện được: {name}{' '}
              {RESIDENT_STATUS_TEXT[residentStatus] ?? 'đang ở trạng thái không cho chuyển viện'}.
            </p>
          )
        }
      />
      {problem && !inDialog && <ProblemAlert problem={problem} />}
      {content.residentId != null && isOpen(incident) && <CriticalNotice residentId={content.residentId} />}
      {content.residentId != null && (
        <FamilyNoticePanel key={familyTick} incidentId={incident.id} canRecord={commands.includes('family-notice')}>
          {isOpen(incident) && (
            <ResidentCallReminders
              who="family"
              residentId={content.residentId}
              residentName={name}
              onFamilyReached={onFamilyReached}
            />
          )}
        </FamilyNoticePanel>
      )}
      {/* Trái: cần biết để xử lý (thẻ khẩn cấp, gọi điện, ghi nhận); phải: Diễn biến (đề xuất 2026-11-24) */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          {incident.level === 'CRITICAL' && isOpen(incident) ? (
            <EmergencyCardPanel incidentId={incident.id}>{call115}</EmergencyCardPanel>
          ) : (
            call115
          )}
          {content.residentId != null && isOpen(incident) && (
            <ResidentCallReminders who="staff" residentId={content.residentId} residentName={name} />
          )}
          <CaseBlock title="Ghi nhận">
            <CaseFacts
              rows={[
                ['Mô tả', content.description ?? '', true],
                ['Nơi xảy ra', content.location ?? ''],
                ['Người xử lý', incident.assignee ?? (incident.closedBy ? `${incident.closedBy} (người đóng)` : 'Chưa ai nhận')],
                ['Cùng xử lý', (incident.handlers ?? []).join(', ') || undefined],
                ['Kết quả', incident.resolution ?? undefined, true],
              ]}
            />
            {incident.noOnDutyDoctor && (
              <p className="type-body-sm text-destructive">Không có bác sĩ trực lúc ghi nhận</p>
            )}
            <CaseMore>
              <CaseFacts
                rows={[
                  [
                    'Xảy ra lúc',
                    content.occurredAt && content.occurredAt !== content.discoveredAt
                      ? formatDateTime(content.occurredAt)
                      : undefined,
                  ],
                  ['Tiếp nhận lúc', incident.receivedAt ? formatDateTime(incident.receivedAt) : undefined],
                  ['Xử lý ban đầu', content.initialResponse ?? '', true],
                ]}
              />
              <NotifiedSection recipients={incident.notifiedRecipients ?? []} />
            </CaseMore>
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
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <CaseBlock
            title="Diễn biến"
            aside={progressions.length > 0 && `${progressions.length} lần ghi, mới nhất trước`}
          >
            {commands.includes('progressions') && (
              <ProgressionComposer
                key={progressions.length}
                types={progressionTypes}
                missing={commands.includes('move-to-monitoring') ? missingGroups : []}
                emergency={incident.level === 'CRITICAL'}
                busy={busy}
                onSubmit={(body) => run('progressions', body, 'Đã ghi diễn biến')}
              />
            )}
            {progressions.length === 0 ? (
              <p className="type-body-sm text-muted-foreground">Chưa ghi diễn biến.</p>
            ) : (
              // Mỗi lần ghi một dòng: giờ, loại (chấm màu theo nhóm), nội dung; dòng hệ thống tự ghi chữ nhạt
              <ol className="flex flex-col divide-y">
                {progressions.toReversed().map((p) => {
                  const pType = progressionTypes.find((t) => t.id === p.progressionTypeId)
                  const system = pType?.group === 'SYSTEM' || ['TRANSFERRED_OUT', 'RETURNED_FROM_HOSPITAL'].includes(p.typeCode)
                  return (
                    <li key={p.id} className={cn('flex gap-3 py-2 type-body-sm', system && 'text-muted-foreground')}>
                      <span
                        aria-hidden="true"
                        className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', GROUP_DOT[pType?.group] ?? 'bg-border')}
                      />
                      <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                        {formatDateTime(p.occurredAt)}
                      </span>
                      <span className="min-w-0 break-words">
                        <span className={cn('type-label', system && 'font-normal')}>
                          {progressionName(p.progressionTypeId)}
                        </span>
                        {p.content && ` · ${p.content}`}
                      </span>
                    </li>
                  )
                })}
              </ol>
            )}
          </CaseBlock>
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
          paper={mode === 'transfer-out' && paper}
          onClose={closeMode}
        >
          {mode === 'transfer-out' ? (
            <TransferOutPanel
              incidentId={incident.id}
              residentId={content.residentId ?? null}
              onCancel={closeMode}
              onPreview={setPaper}
              reopen={reopenSummary}
              onDone={async () => {
                setMode(null)
                setPaper(false)
                setReopenSummary(false)
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

// Nhãn "Tiếp: …" của dòng sự cố: việc cần làm ngay theo trạng thái backend trả (không tính theo đồng hồ máy)
function nextStep(incident, inHospital) {
  if (inHospital) return { text: 'Đang ở bệnh viện', tone: 'attention' }
  if (incident.status === 'NEW') return { text: incident.assignee ? 'Chờ nhận xử lý' : 'Chưa ai nhận', tone: 'urgent' }
  if (incident.status === 'MONITORING') return { text: 'Đang theo dõi', tone: 'neutral' }
  if (incident.status === 'IN_PROGRESS') return { text: `${incident.assignee ?? 'Đang'} xử lý`, tone: 'neutral' }
  return null
}
const CHIP_TONE = {
  urgent: 'bg-destructive-subtle text-destructive',
  attention: 'bg-warning text-warning-foreground',
  neutral: 'bg-muted text-muted-foreground',
}

// Một dòng sự cố, cùng kiểu với dòng cảnh báo (đề xuất 2026-11-24): biểu tượng loại, tên người và loại, một nhãn việc cần
// biết; bấm cả dòng để mở. Vạch trái theo mức.
function IncidentRow({ incident, name, typeName, typeCode, inHospital, onOpen }) {
  const open = isOpen(incident)
  const step = open ? nextStep(incident, inHospital) : null
  return (
    <article
      aria-label={`${name}, ${typeName}`}
      className={cn(
        'relative flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-l-[6px] bg-card px-4 py-3',
        incident.level === 'CRITICAL' && open
          ? 'border-l-destructive'
          : incident.level === 'MEDIUM'
            ? 'border-l-warning-foreground'
            : 'border-l-border',
      )}
    >
      <IncidentTypeIcon code={typeCode} />
      <div className="flex min-w-0 flex-1 basis-56 flex-col">
        <button
          type="button"
          id={`incident-row-${incident.id}`}
          onClick={onOpen}
          aria-label={`${name}, ${typeName}`}
          className="text-left type-label outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
        >
          {name}
        </button>
        <span className="type-body-sm text-muted-foreground">
          SC-{incident.id} · {typeName} · {LEVEL_LABEL[incident.level]}
          {incident.content?.discoveredAt && ` · ${formatDateTime(incident.content.discoveredAt)}`}
          {!open && ` · ${STATUS_LABEL[incident.status] ?? incident.status}`}
        </span>
      </div>
      {step && (
        <span className={cn('rounded-full px-3 py-1 type-caption font-semibold whitespace-nowrap', CHIP_TONE[step.tone])}>
          {step.text}
        </span>
      )}
      <span aria-hidden="true" className="type-title text-muted-foreground">
        ›
      </span>
    </article>
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
  const [assist, setAssist] = useState(null)
  const { can } = usePermissions()

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
  const visible = sortIncidents(inGroup(group))
  const opened = incidents.find((i) => i.id === openId)

  async function changed(message) {
    setAnnouncement(`${message}.`)
    await reload()
  }

  if (recording) {
    return (
      <ReportForm
        onClose={() => setRecording(false)}
        onOpenAlert={onNavigate && ((alertId) => onNavigate('alerts', { alertId }))}
        onOpenIncident={(id) => {
          setRecording(false)
          setOpenId(id)
        }}
        onDone={async ({ kind, id, message }) => {
          setRecording(false)
          await changed(message)
          // Sự cố vừa ghi mở ngay để thấy thẻ khẩn cấp, Gọi 115, chuyển viện
          if (kind === 'incident' && id != null) setOpenId(id)
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
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5">
      <PageHeader
        title="Sự cố"
        aside={
          <div className="flex flex-wrap gap-2">
            {can('EMERGENCY_ASSIST_BUTTON', 'CREATE') && (
              <AssistButton
                openAssists={[]}
                onSent={(data) => {
                  setAssist(data)
                  setAnnouncement('Đã gửi yêu cầu hỗ trợ.')
                }}
                onOpenAlert={onNavigate && ((alertId) => onNavigate('alerts', { alertId }))}
                onJoined={onNavigate && ((alertId) => onNavigate('alerts', { alertId }))}
              />
            )}
            {/* Như nút Ghi nhận sự cố cũ: không ẩn theo quyền, backend kiểm khi lưu */}
            <Button
              id="report-event"
              className="h-11"
              onClick={() => {
                setAnnouncement('')
                setRecording(true)
              }}
            >
              <Plus aria-hidden="true" />
              Ghi sự cố
            </Button>
          </div>
        }
      >
        <FilterTabs
          label="Nhóm sự cố"
          value={group}
          onChange={setGroup}
          options={GROUPS.map(([value, label]) => [value, label, inGroup(value).length])}
        />
      </PageHeader>
      {can('EMERGENCY_ASSIST_BUTTON', 'CREATE') && (
        <AssistStatus
          key={assist?.pressId ?? 'current'}
          sent={assist}
          onOpen={(alertId) => onNavigate?.('alerts', { alertId })}
          onNavigate={onNavigate}
        />
      )}
      <p role="status" aria-live="polite" className="empty:hidden rounded-xl border bg-card px-4 py-3 type-body-sm">
        {announcement}
      </p>
      {problem && <ProblemAlert problem={problem} />}
      {!board ? (
        <Skeleton className="h-40 w-full" />
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="type-body-sm">
            {group === 'open' ? 'Không có sự cố đang mở trong phạm vi của bạn.' : 'Chưa có sự cố đã kết thúc.'}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((i) => (
            <IncidentRow
              key={i.id}
              incident={i}
              name={nameOf(i)}
              typeName={typeName(i)}
              typeCode={typeCode(i)}
              inHospital={inHospital(i)}
              onOpen={() => {
                setAnnouncement('')
                setOpenId(i.id)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
