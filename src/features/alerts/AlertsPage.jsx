import { useCallback, useEffect, useState } from 'react'
import { CircleCheck, ClipboardCheck, FilePlus, Gauge, Hand, Play, Plus, Siren, UserPlus } from 'lucide-react'
import { getCareTasksById } from '@/api/api005'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { DetailLayout } from '@/common/DetailLayout'
import { NowStrip } from '@/common/NowStrip'
import { PageHeader } from '@/common/PageHeader'
import { PermissionDeniedState } from '@/common/PageState'
import { ProblemAlert } from '@/common/ProblemAlert'
import { ResidentAvatar } from '@/common/ResidentAvatar'
import { StatusBadge } from '@/common/StatusBadge'
import { usePermissions } from '@/common/permissions/permissions'
import { formatDateTime } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { cn } from '@/lib/utils'
import { StaffSelectField } from '@/common/StaffSelectField'
import { CriticalCareSection } from '@/features/critical-care/CriticalCareSection'
import { FilterTabs, ResidentChoices } from '@/features/incidents/CaseFormParts'
import {
  CaseBadge,
  CaseBlock,
  CaseChoices,
  CaseDialog,
  CaseFacts,
  CaseHeader,
  CasePage,
  CaseSteps,
} from '@/features/incidents/CasePage'
import { IncidentTypeIcon, IncidentTypePicker } from '@/features/incidents/IncidentTypePicker'
import { STATUS_LABEL as INCIDENT_STATUS } from '@/features/incidents/incidentView'
import { loadOpenIncidents } from '@/features/incidents/incidents'
import { AssistButton, AssistStatus } from './AssistRequest'
import { Call115Panel } from './Call115Panel'
import { CreateAlertForm } from './CreateAlertForm'
import { PressedAlertPanel } from './PressedAlertPanel'
import {
  loadAlert,
  loadAlertBoard,
  loadIncidentTypes,
  loadResidentChoices,
  receiveCreatedIncident,
  runAlertCommand,
} from './alerts'
import {
  LEVEL_LABEL,
  LEVEL_ORDER,
  STATUS_LABEL,
  isOpen,
  isUrgent,
  needsReceiver,
  originLabel,
  sortAlerts,
  statusLabel,
  statusTone,
  typeLabel,
} from './alertView'

// Màn Cảnh báo (spec 007 User Story 3, FR-027 → FR-036; T031 phần web): danh sách theo phạm vi đọc từ api-007
// `GET /alerts`, họ tên từ api-001. Nút lệnh chỉ theo `allowedCommands` backend trả (DESIGN.md 7.4); hạ từ Khẩn cấp,
// tiếp nhận của Quản lý viện ở Leo thang cấp 2 do backend quyết. Đóng cần kết quả, đổi mức cần lý do (FR-029).

const GROUPS = [
  ['open', 'Đang mở'],
  ['closed', 'Đã đóng'],
]

function AlertStatus({ alert }) {
  return <Badge variant={statusTone(alert)}>{statusLabel(alert)}</Badge>
}

// Một dòng cảnh báo: người và loại ở bên trái, trạng thái và hạn ở giữa, đúng một nút chính ở bên phải (DESIGN.md 7.1).
// Vạch trái theo mức: đỏ khi Khẩn cấp hoặc đã leo thang tối đa, hổ phách khi Trung bình, xám khi Nhẹ (3.5).
// onReconcile: cảnh báo "chưa đối chiếu thuốc" mở thẳng phiếu đối chiếu của người đó ở màn Phát thuốc (006 T078); là lối
// chuyển màn, không phải lệnh trên cảnh báo
function AlertRow({ alert, name, busy, onReceive, onStart, onOpen, onReconcile }) {
  const urgent = isUrgent(alert)
  const commands = alert.allowedCommands ?? []
  // Người xử lý (không phải Quản lý viện) tiếp nhận xong thường xử lý ngay: một nút làm cả hai lệnh (FR-029 giữ hai trạng thái)
  const handler = commands.includes('activate-emergency')
  const waiting = isOpen(alert) && alert.acknowledgementDeadline && ['NEW', 'ESCALATED'].includes(alert.status)
  return (
    <article
      aria-label={`${typeLabel(alert.type)}, ${name}`}
      className={cn(
        'grid gap-x-4 gap-y-3 rounded-xl border border-l-4 bg-card p-4 @lg:grid-cols-[minmax(0,1fr)_auto] @lg:items-center @4xl:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_minmax(260px,auto)]',
        urgent ? 'border-l-destructive' : alert.level === 'MEDIUM' ? 'border-l-warning-foreground' : 'border-l-border',
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <IncidentTypeIcon code={alert.type} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="type-card-title">{typeLabel(alert.type)}</span>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-2 type-label">
              {alert.residentId != null && (
                <ResidentAvatar name={name} code={String(alert.residentId)} className="size-6" />
              )}
              {name}
            </span>
            <StatusBadge status={LEVEL_LABEL[alert.level]} />
            <AlertStatus alert={alert} />
          </div>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 type-body-sm text-muted-foreground tabular-nums">
        <span>
          {originLabel(alert.origin)}, {formatDateTime(alert.latestAt)}
          {alert.residentId == null && alert.floorName && `, ${alert.floorName}`}
          {alert.occurrenceCount > 1 && `, ${alert.occurrenceCount} lần cùng loại đã gộp`}
        </span>
        {waiting ? (
          <span className={cn(urgent && 'text-destructive')}>
            Hạn tiếp nhận {formatDateTime(alert.acknowledgementDeadline)}
            {alert.assignee && `, phụ trách: ${alert.assignee}`}
          </span>
        ) : (
          <span>
            {alert.incidentId != null
              ? `Đã thành sự cố SC-${alert.incidentId}`
              : `Phụ trách: ${alert.assignee ?? 'chưa ai nhận'}`}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 @lg:col-start-2 @lg:row-start-1 @lg:justify-end @4xl:col-start-3">
        {commands.includes('receive') && (
          <Button
            variant={urgent ? 'default' : 'tonal'}
            className="h-11"
            disabled={busy}
            onClick={() => onReceive(alert, handler)}
            aria-label={handler ? `Tiếp nhận và xử lý cảnh báo của ${name}` : `Tiếp nhận cảnh báo của ${name}`}
          >
            {handler ? 'Tiếp nhận và xử lý' : 'Tiếp nhận'}
          </Button>
        )}
        {commands.includes('start-handling') && (
          <Button
            variant="tonal"
            className="h-11"
            disabled={busy}
            onClick={() => onStart(alert)}
            aria-label={`Bắt đầu xử lý cảnh báo của ${name}`}
          >
            Bắt đầu xử lý
          </Button>
        )}
        {onReconcile && alert.type === 'CHUA_DOI_CHIEU' && alert.residentId && isOpen(alert) && (
          <Button variant="outline" className="h-11" onClick={() => onReconcile(alert)}>
            {`Mở đối chiếu thuốc của ${name}`}
          </Button>
        )}
        <Button
          variant="outline"
          className="h-11"
          onClick={() => onOpen(alert)}
          id={`alert-row-${alert.id}`}
          aria-label={`Chi tiết cảnh báo của ${name}`}
        >
          Chi tiết
        </Button>
      </div>
    </article>
  )
}

// Chi tiết ở khung phải (cảnh báo nguy kịch mở cả trang): việc cần làm trước, thông tin sau; lệnh cần nhập kết quả hoặc lý do (Đóng, Đổi mức) mở hộp
const CRITICAL_CLOSE_MIN = 10
const STEP_OF = { NEW: 0, ESCALATED: 0, RECEIVED: 1, IN_PROGRESS: 2 }
const DIALOG_TITLE = {
  close: 'Đóng cảnh báo?',
  'convert-to-incident': 'Chuyển thành sự cố?',
  'activate-emergency': 'Kích hoạt khẩn cấp?',
  'change-level': 'Đổi mức',
  assign: 'Giao người phụ trách',
}
const DIALOG_HINT = {
  'convert-to-incident': 'Cảnh báo kết thúc ở đây, mọi việc tiếp theo làm ở sự cố.',
  'activate-emergency': 'Tạo ngay sự cố Khẩn cấp, báo Bác sĩ trực, Trưởng tầng và người liên hệ chính.',
  'change-level': 'Vẫn là cảnh báo, chưa tạo sự cố.',
}

function AlertDetail({ id, name, Title, onDone, onChanged, onNavigate }) {
  const [alert, setAlert] = useState(null)
  const [problem, setProblem] = useState(null)
  const [mode, setMode] = useState(null)
  const [text, setText] = useState('')
  const [level, setLevel] = useState('')
  const [incidentTypes, setIncidentTypes] = useState([])
  const [typeId, setTypeId] = useState('')
  const [staffId, setStaffId] = useState('')
  const [createdIncidentId, setCreatedIncidentId] = useState(null)
  const [blocked, setBlocked] = useState(null)
  const [openIncidents, setOpenIncidents] = useState([])
  const [target, setTarget] = useState(null)
  const [residents, setResidents] = useState(null)
  const [residentQuery, setResidentQuery] = useState('')
  const [residentId, setResidentId] = useState(null)
  const { can } = usePermissions()
  const [initialResponse, setInitialResponse] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    try {
      setAlert(await loadAlert(id))
    } catch (error) {
      setProblem(problemOf(error))
    }
  }, [id])

  useEffect(() => {
    let cancelled = false
    loadAlert(id).then(
      (data) => !cancelled && setAlert(data),
      (error) => !cancelled && setProblem(problemOf(error)),
    )
    return () => {
      cancelled = true
    }
  }, [id])

  if (!alert) {
    return problem ? <ProblemAlert problem={problem} /> : <Skeleton className="h-40 w-full" />
  }

  const commands = alert.allowedCommands ?? []
  const converting = mode === 'convert-to-incident' || mode === 'activate-emergency'
  const levelChoices = LEVEL_ORDER.filter((l) => l !== alert.level)
  // Đóng cảnh báo Khẩn cấp: kết quả phải nêu lý do không kích hoạt khẩn cấp, tối thiểu ít chữ để không đóng bằng "ok"
  const criticalClose = mode === 'close' && alert.level === 'CRITICAL'
  const textMissing = criticalClose ? text.trim().length < CRITICAL_CLOSE_MIN : !text.trim()
  const pressed = ['SOS', 'ASSIST_BUTTON'].includes(alert.origin)
  const waiting = alert.acknowledgementDeadline && ['NEW', 'ESCALATED'].includes(alert.status)
  const linkedIncidentId = createdIncidentId ?? alert.incidentId ?? null
  // Người xử lý (không phải Quản lý viện): tiếp nhận xong thường xử lý ngay nên một ô làm cả hai lệnh
  const handler = commands.includes('activate-emergency')
  const emergencyFirst = handler && alert.level === 'CRITICAL'
  const emergency = handler && {
    icon: Siren,
    label: 'Kích hoạt khẩn cấp',
    hint: 'Tạo ngay sự cố Khẩn cấp, báo Bác sĩ trực, Trưởng tầng, người liên hệ chính.',
    primary: emergencyFirst,
    onSelect: () => openConvert('activate-emergency'),
  }
  // Nút chính: Khẩn cấp thì Kích hoạt khẩn cấp, còn lại là bước kế tiếp của trạng thái; hai cách kết thúc (chuyển sự cố, đóng)
  // ngang nhau, người xử lý tự chọn
  const steps = [
    emergencyFirst && emergency,
    commands.includes('receive') && {
      icon: ClipboardCheck,
      label: handler ? 'Tiếp nhận và xử lý' : 'Tiếp nhận',
      hint: handler ? 'Báo đã nhận và bắt đầu xử lý ngay.' : 'Báo đã nhận để dừng leo thang.',
      primary: !emergencyFirst,
      disabled: busy,
      onSelect: () =>
        handler
          ? quick(['receive', 'start-handling'], 'Đã tiếp nhận và bắt đầu xử lý')
          : quick('receive', 'Đã tiếp nhận cảnh báo'),
    },
    commands.includes('receive') &&
      handler && {
        icon: Hand,
        label: 'Chỉ tiếp nhận',
        hint: 'Báo đã nhận để dừng leo thang, xử lý sau.',
        disabled: busy,
        onSelect: () => quick('receive', 'Đã tiếp nhận cảnh báo'),
      },
    commands.includes('start-handling') && {
      icon: Play,
      label: 'Bắt đầu xử lý',
      hint: 'Chuyển sang Đang xử lý.',
      primary: !emergencyFirst,
      disabled: busy,
      onSelect: () => quick('start-handling', 'Đã bắt đầu xử lý cảnh báo'),
    },
    commands.includes('assign') && {
      icon: UserPlus,
      label: 'Giao người phụ trách',
      hint: 'Người được giao nhận thông báo.',
      primary: true,
      onSelect: () => setMode('assign'),
    },
    commands.includes('convert-to-incident') && {
      icon: FilePlus,
      label: 'Chuyển thành sự cố',
      hint: 'Cần ghi nhận chính thức để theo dõi, ghi diễn biến, chuyển viện.',
      onSelect: () => openConvert('convert-to-incident'),
    },
    commands.includes('close') && {
      icon: CircleCheck,
      label: 'Đóng cảnh báo',
      hint: 'Đã xử lý xong, ghi kết quả.',
      onSelect: () => setMode('close'),
    },
    !emergencyFirst && emergency,
    commands.includes('change-level') && {
      icon: Gauge,
      label: 'Đổi mức',
      hint: 'Nâng hoặc hạ mức, cần lý do. Vẫn là cảnh báo.',
      onSelect: () => setMode('change-level'),
    },
  ].filter(Boolean)

  function closeMode() {
    setMode(null)
    setText('')
    setSubmitted(false)
    setProblem(null)
  }

  async function quick(command, message) {
    setBusy(true)
    try {
      for (const each of [command].flat()) await runAlertCommand(alert.id, each)
      await reload()
      onChanged(message, name)
    } catch (error) {
      setProblem(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  function openConvert(next) {
    setMode(next)
    setTarget(null)
    // Cảnh báo thủ công mang mã loại sự cố: chọn sẵn đúng loại đó để chỉ còn bấm lưu (ưu tiên thời gian xử lý)
    loadIncidentTypes().then(
      (types) => {
        setIncidentTypes(types)
        const same = types.find((t) => t.code === alert.type)
        if (same) setTypeId(String(same.id))
      },
      (error) => setProblem(problemOf(error)),
    )
    if (alert.residentId != null) loadOpenIncidents(alert.residentId).then(setOpenIncidents)
    else loadResidentChoices().then(setResidents, () => setResidents([]))
  }

  function pickResident(value) {
    setResidentId(value)
    setTarget(null)
    setOpenIncidents([])
    if (value != null) loadOpenIncidents(value).then(setOpenIncidents)
  }

  // Cảnh báo Khẩn cấp (và Kích hoạt khẩn cấp) chỉ gắn được vào sự cố Khẩn cấp: sự cố mức thấp hơn chưa báo người (FR-029)
  const linkable = openIncidents.filter(
    (i) => i.level === 'CRITICAL' || (mode === 'convert-to-incident' && alert.level !== 'CRITICAL'),
  )
  const needsResident = converting && alert.residentId == null && residentId == null
  const needsTarget = converting && linkable.length > 0 && target == null
  const linking = converting && typeof target === 'number'

  // Gắn vào sự cố đang mở hoặc chuyển thành sự cố mới; ở lại chi tiết để thấy sự cố mang mã nào và mở được sang màn Sự cố
  async function convert(command, body) {
    setBusy(true)
    setProblem(null)
    try {
      const result = await runAlertCommand(alert.id, command, body)
      const created = result?.data?.incident ?? result?.data ?? null
      const incidentId = created?.id ?? body.existingIncidentId ?? null
      const taken = body.existingIncidentId ? false : await receiveCreatedIncident(created)
      setCreatedIncidentId(incidentId)
      setBlocked(null)
      setMode(null)
      await reload()
      const what = body.existingIncidentId
        ? 'Đã gắn vào sự cố'
        : command === 'activate-emergency'
          ? 'Đã kích hoạt khẩn cấp'
          : 'Đã chuyển thành sự cố'
      onChanged(`${what}${incidentId ? ` SC-${incidentId}` : ''}${taken ? ', bạn đang xử lý' : ''}`, name)
      // Khẩn cấp: sang thẳng sự cố để thấy thẻ thông tin khẩn cấp và Gọi 115, không bắt tìm lại ở menu
      if (command === 'activate-emergency' && incidentId && onNavigate) onNavigate('incidents', { incidentId })
    } catch (error) {
      // FR-041: đang có sự cố Khẩn cấp mở mà chưa chọn cùng vụ hay khác vụ: chỉ ra sự cố đó, không tự gộp
      if (error?.problem?.errorCode === 'OPEN_EMERGENCY_INCIDENT_EXISTS' && error.problem.incidentId != null) {
        setBlocked({ incidentId: error.problem.incidentId, command, body })
        setMode(null)
      } else {
        setProblem(problemOf(error))
      }
    } finally {
      setBusy(false)
    }
  }

  async function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    if (converting) {
      if (needsResident || needsTarget || (!linking && !typeId)) return
      await convert(
        mode,
        linking
          ? { existingIncidentId: target }
          : {
              incidentTypeId: Number(typeId),
              ...(text.trim() && { description: text.trim() }),
              ...(initialResponse.trim() && { initialResponse: initialResponse.trim() }),
              ...(residentId != null && { residentId }),
              ...(target === 'new' && { createDespiteOpen: true }),
            },
      )
      return
    }
    if (textMissing || (mode === 'change-level' && !level) || (mode === 'assign' && !staffId)) return
    setBusy(true)
    try {
      await runAlertCommand(
        alert.id,
        mode,
        mode === 'close'
          ? { resolution: text.trim() }
          : mode === 'assign'
            ? { staffId: Number(staffId), note: text.trim() }
            : { newLevel: level, reason: text.trim() },
      )
      if (mode === 'close') {
        onDone('Đã đóng cảnh báo', name)
        return
      }
      // Đổi mức, giao người: cảnh báo vẫn mở nên ở lại chi tiết để làm tiếp
      closeMode()
      await reload()
      onChanged(
        mode === 'assign' ? 'Đã giao người phụ trách' : `Đã đổi mức sang ${LEVEL_LABEL[level].toLowerCase()}`,
        name,
      )
      setLevel('')
      setStaffId('')
    } catch (error) {
      setProblem(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  // Cảnh báo quá hạn công việc: mở đúng việc ở Checklist ca
  const taskSource = (alert.sources ?? []).findLast((s) => s.sourceType === 'M04.TASK')
  async function openTask() {
    try {
      const { data } = await getCareTasksById({ path: { id: taskSource.sourceId } })
      onNavigate('care-tasks', { shiftId: data.shiftId, taskId: taskSource.sourceId })
    } catch (error) {
      setProblem(problemOf(error))
    }
  }

  return (
    <div className="@container flex flex-col gap-5">
      <CaseHeader
        code={alert.type}
        title={typeLabel(alert.type)}
        Title={Title}
        subtitle={`${name}, ${originLabel(alert.origin).toLowerCase()} lúc ${formatDateTime(alert.firstAt)}`}
        badges={
          <>
            <CaseBadge label="Mức">
              <StatusBadge status={LEVEL_LABEL[alert.level]} />
            </CaseBadge>
            <CaseBadge label="Trạng thái">
              <AlertStatus alert={alert} />
            </CaseBadge>
          </>
        }
      />
      <CaseSteps
        steps={
          isOpen(alert)
            ? [
                alert.status === 'ESCALATED' ? statusLabel(alert) : STATUS_LABEL.NEW,
                STATUS_LABEL.RECEIVED,
                STATUS_LABEL.IN_PROGRESS,
                'Kết thúc',
              ]
            : [STATUS_LABEL.NEW, STATUS_LABEL[alert.status]]
        }
        current={isOpen(alert) ? STEP_OF[alert.status] : 1}
      />
      {problem && !mode && <ProblemAlert problem={problem} />}
      {blocked && (
        <Alert variant="attention" className="gap-3 p-4">
          <p>
            Người cao tuổi này đang có sự cố Khẩn cấp chưa đóng, mã <strong>SC-{blocked.incidentId}</strong>. Cùng vụ
            thì gắn cảnh báo vào sự cố đó; vụ khác (ví dụ một lần ngã khác) thì tạo sự cố riêng.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              className="h-11"
              disabled={busy}
              onClick={() => convert(blocked.command, { existingIncidentId: blocked.incidentId })}
            >
              Gắn vào sự cố SC-{blocked.incidentId}
            </Button>
            <Button
              variant="outline"
              className="h-11 text-foreground"
              disabled={busy}
              onClick={() => convert(blocked.command, { ...blocked.body, createDespiteOpen: true })}
            >
              Tạo sự cố riêng
            </Button>
            {onNavigate && (
              <Button
                variant="ghost"
                className="h-11 text-foreground"
                onClick={() => onNavigate('incidents', { incidentId: blocked.incidentId })}
              >
                Mở sự cố SC-{blocked.incidentId}
              </Button>
            )}
          </div>
        </Alert>
      )}
      {mode && (
        <CaseDialog title={DIALOG_TITLE[mode]} description={DIALOG_HINT[mode]} problem={problem} onClose={closeMode}>
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            {mode === 'change-level' && (
              <Field data-invalid={(submitted && !level) || undefined}>
                <FieldLabel>Mức mới</FieldLabel>
                <ToggleGroup
                  variant="outline"
                  value={level ? [level] : []}
                  onValueChange={(n) => setLevel(n[0] ?? '')}
                  className="flex flex-wrap"
                >
                  {levelChoices.map((l) => (
                    <ToggleGroupItem key={l} value={l} className="h-11 px-4">
                      {LEVEL_LABEL[l]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                {submitted && !level && <FieldError>Chọn mức mới</FieldError>}
              </Field>
            )}
            {mode === 'assign' && (
              <StaffSelectField
                id="alert-assignee"
                label="Người phụ trách"
                errorText="Chọn người phụ trách"
                value={staffId}
                onChange={setStaffId}
                invalid={submitted && !staffId}
              />
            )}
            {converting && alert.residentId == null && (
              <Field data-invalid={(submitted && needsResident) || undefined}>
                <FieldLabel>Người cao tuổi</FieldLabel>
                {residentId != null ? (
                  <span className="flex flex-wrap items-center gap-3 type-label">
                    {residents?.find((r) => r.id === residentId)?.name}
                    <Button type="button" variant="ghost" className="h-11" onClick={() => pickResident(null)}>
                      Đổi người
                    </Button>
                  </span>
                ) : residents ? (
                  <ResidentChoices
                    residents={residents}
                    query={residentQuery}
                    onQuery={setResidentQuery}
                    onPick={pickResident}
                  />
                ) : (
                  <Skeleton className="h-16 w-full" />
                )}
                {submitted && needsResident && <FieldError>Chọn người cao tuổi của yêu cầu này</FieldError>}
              </Field>
            )}
            {converting && linkable.length > 0 && (
              <Field data-invalid={(submitted && needsTarget) || undefined}>
                <FieldLabel>Đang có sự cố mở của người này</FieldLabel>
                <div className="flex flex-col gap-2" role="group" aria-label="Cùng vụ hay vụ khác">
                  {linkable.map((i) => (
                    <Button
                      key={i.id}
                      type="button"
                      variant="outline"
                      aria-pressed={target === i.id}
                      className={cn(
                        'h-auto min-h-11 justify-start rounded-lg px-4 py-2 text-left whitespace-normal',
                        target === i.id && 'border-2 border-primary',
                      )}
                      onClick={() => setTarget(i.id)}
                    >
                      Cùng vụ: gắn vào SC-{i.id}, {INCIDENT_STATUS[i.status]?.toLowerCase()}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    aria-pressed={target === 'new'}
                    className={cn(
                      'h-auto min-h-11 justify-start rounded-lg px-4 py-2 text-left whitespace-normal',
                      target === 'new' && 'border-2 border-primary',
                    )}
                    onClick={() => setTarget('new')}
                  >
                    Vụ khác: tạo sự cố riêng
                  </Button>
                </div>
                {submitted && needsTarget && <FieldError>Chọn cùng vụ hay vụ khác</FieldError>}
              </Field>
            )}
            {converting && !linking && (
              <Field data-invalid={(submitted && !typeId) || undefined}>
                <FieldLabel>Loại sự cố</FieldLabel>
                <IncidentTypePicker types={incidentTypes} value={typeId} onChange={setTypeId} />
                {submitted && !typeId && <FieldError>Chọn loại sự cố</FieldError>}
              </Field>
            )}
            {converting && !linking && (
              <Field>
                <FieldLabel htmlFor="alert-initial-response">Xử lý ban đầu (không bắt buộc)</FieldLabel>
                <Textarea
                  id="alert-initial-response"
                  rows={2}
                  maxLength={2000}
                  value={initialResponse}
                  onChange={(e) => setInitialResponse(e.target.value)}
                />
              </Field>
            )}
            {criticalClose && (
              <Alert role="note" variant="attention">
                Cảnh báo Khẩn cấp thường cần bấm "Kích hoạt khẩn cấp" hoặc "Chuyển thành sự cố". Chỉ đóng khi đã xác
                nhận không phải tình huống khẩn cấp thật.
              </Alert>
            )}
            <Field hidden={linking} data-invalid={(!converting && submitted && textMissing) || undefined}>
              <FieldLabel htmlFor="alert-text">
                {converting
                  ? 'Mô tả (không bắt buộc)'
                  : mode === 'close'
                    ? criticalClose
                      ? 'Kết quả và lý do không kích hoạt khẩn cấp'
                      : 'Kết quả xử lý'
                    : mode === 'assign'
                      ? 'Ghi chú giao việc'
                      : 'Lý do đổi mức'}
              </FieldLabel>
              <Textarea
                id="alert-text"
                rows={3}
                maxLength={2000}
                value={text}
                onChange={(e) => setText(e.target.value)}
                aria-invalid={(!converting && submitted && textMissing) || undefined}
              />
              {!converting && submitted && textMissing && (
                <FieldError>
                  {mode === 'close'
                    ? criticalClose
                      ? `Nhập kết quả và lý do không kích hoạt khẩn cấp (ít nhất ${CRITICAL_CLOSE_MIN} ký tự)`
                      : 'Nhập kết quả xử lý'
                    : mode === 'assign'
                      ? 'Nhập ghi chú giao việc'
                      : 'Nhập lý do đổi mức'}
                </FieldError>
              )}
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" className="h-11" disabled={busy}>
                {linking
                  ? `Gắn vào SC-${target}`
                  : ({
                      close: 'Lưu và đóng cảnh báo',
                      'convert-to-incident': 'Lưu và chuyển sự cố',
                      'activate-emergency': 'Lưu và kích hoạt',
                      assign: 'Lưu và giao',
                    }[mode] ?? 'Lưu mức mới')}
              </Button>
              <Button type="button" variant="ghost" className="h-11" onClick={closeMode}>
                Quay lại
              </Button>
            </div>
          </form>
        </CaseDialog>
      )}
      {pressed && (
        <Card>
          <CardContent>
            <PressedAlertPanel alert={alert} onChanged={reload} />
          </CardContent>
        </Card>
      )}
      {alert.type === 'CRITICAL_CONDITION' && alert.criticalFlagId != null && alert.residentId != null && (
        <CriticalCareSection
          residentId={alert.residentId}
          incidentId={alert.incidentId ?? null}
          defaultOpen
          onChanged={reload}
        />
      )}
      <div className="grid items-start gap-5 @3xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <CaseBlock title={isOpen(alert) ? 'Việc cần làm' : 'Kết quả'}>
          {linkedIncidentId != null && (
            <>
              <p className="type-body">
                Đã chuyển thành sự cố <strong>SC-{linkedIncidentId}</strong>. Xử lý tiếp ở màn Sự cố.
              </p>
              {onNavigate && (
                <Button
                  className="h-11 self-start"
                  onClick={() => onNavigate('incidents', { incidentId: linkedIncidentId })}
                >
                  Mở sự cố SC-{linkedIncidentId}
                </Button>
              )}
            </>
          )}
          <CaseChoices items={steps} />
          {handler && isOpen(alert) && !commands.includes('convert-to-incident') && (
            <p className="type-body-sm text-muted-foreground">
              "Chuyển thành sự cố" và "Đóng cảnh báo" hiện ra sau khi bắt đầu xử lý.
            </p>
          )}
          {steps.length === 0 && linkedIncidentId == null && (
            <p className="type-body-sm text-muted-foreground">
              {isOpen(alert) ? 'Bạn chỉ xem được cảnh báo này.' : 'Cảnh báo đã đóng.'}
            </p>
          )}
          {taskSource && isOpen(alert) && onNavigate && can('TASK_CHECKLIST', 'CONFIRM') && (
            <Button variant="outline" className="h-11 self-start" onClick={openTask}>
              Mở công việc quá hạn
            </Button>
          )}
          {!pressed && commands.includes('call-115') && (
            <div className="border-t pt-4">
              <Call115Panel subject="alerts" id={alert.id} />
            </div>
          )}
        </CaseBlock>
        <CaseBlock title="Thông tin cảnh báo">
          <CaseFacts
            rows={[
              ['Mô tả', alert.description || undefined, true],
              ['Phụ trách', alert.assignee ?? 'Chưa ai nhận'],
              ['Hạn tiếp nhận', waiting ? formatDateTime(alert.acknowledgementDeadline) : undefined],
              ['Nguồn', originLabel(alert.origin)],
              ['Tầng', alert.floorName || undefined],
              ['Lần đầu', formatDateTime(alert.firstAt)],
              ['Lần gần nhất', alert.latestAt !== alert.firstAt ? formatDateTime(alert.latestAt) : undefined],
              ['Số lần gộp', alert.occurrenceCount > 1 ? String(alert.occurrenceCount) : undefined],
            ]}
          />
          {alert.noOnDutyDoctor && <p className="type-body-sm text-destructive">Không có bác sĩ trực</p>}
          {(alert.reports ?? []).length > 0 && (
            <section aria-label="Các lần báo sau" className="flex flex-col gap-2 border-t pt-4">
              <h3 className="type-caption text-muted-foreground">Các lần báo sau</h3>
              <ol className="flex flex-col gap-2 border-l-2 pl-3 type-body-sm">
                {alert.reports.map((r) => (
                  <li key={`${r.at}:${r.reportedBy}`}>
                    <span className="text-muted-foreground tabular-nums">
                      {formatDateTime(r.at)}
                      {r.reportedBy && `, ${r.reportedBy}`}
                    </span>
                    <br />
                    {r.description}
                  </li>
                ))}
              </ol>
            </section>
          )}
          {(alert.sources ?? []).length > 0 && (
            <section aria-label="Các lần ghi nhận" className="flex flex-col gap-2 border-t pt-4">
              <h3 className="type-caption text-muted-foreground">Các lần ghi nhận</h3>
              <ol className="flex flex-col gap-1.5 border-l-2 pl-3 type-body-sm">
                {alert.sources.map((s) => (
                  <li key={`${s.sourceType}:${s.sourceId}`} className="tabular-nums">
                    {formatDateTime(s.occurredAt)}, mức {LEVEL_LABEL[s.level]?.toLowerCase() ?? 'chưa ghi'}
                    {s.resolvedAt && `, nguồn đã xử lý ${formatDateTime(s.resolvedAt)}`}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </CaseBlock>
      </div>
    </div>
  )
}

// alertId: mở thẳng một cảnh báo (từ chi tiết sự cố "Mở cảnh báo gốc")
export function AlertsPage({ onNavigate, alertId = null } = {}) {
  const [board, setBoard] = useState(null)
  const [problem, setProblem] = useState(null)
  const [group, setGroup] = useState('open')
  const [levelFilter, setLevelFilter] = useState('ALL')
  const [openId, setOpenId] = useState(alertId)
  const [busy, setBusy] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [creating, setCreating] = useState(false)
  const [assist, setAssist] = useState(null)
  const { can } = usePermissions()

  const load = useCallback(async () => {
    try {
      setBoard(await loadAlertBoard())
      setProblem(null)
    } catch (error) {
      setProblem(problemOf(error))
      setBoard((current) => current ?? { alerts: [], names: {} })
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    loadAlertBoard().then(
      (data) => !cancelled && setBoard(data),
      (error) => {
        if (cancelled) return
        setProblem(problemOf(error))
        setBoard({ alerts: [], names: {} })
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  if (problem?.status === 403) return <PermissionDeniedState label="Cảnh báo" />

  const alerts = board?.alerts ?? []
  const nameOf = (a) => board?.names?.[a.residentId] ?? (a.residentId ? 'Người cao tuổi' : 'Chưa rõ người cao tuổi')
  const inGroup = alerts.filter((a) => (group === 'open' ? isOpen(a) : !isOpen(a)))
  const visible = sortAlerts(inGroup.filter((a) => levelFilter === 'ALL' || a.level === levelFilter))
  // Đang mở chia hai nhóm theo việc cần làm: chưa ai nhận (cần tiếp nhận) và đã có người nhận (đang xử lý); đã đóng một nhóm
  const sections = (
    group === 'open'
      ? [
          {
            key: 'waiting',
            title: 'Cần tiếp nhận',
            hint: 'Chưa ai tiếp nhận. Quá hạn thì tự leo thang lên cấp trên.',
            items: visible.filter((a) => ['NEW', 'ESCALATED'].includes(a.status)),
          },
          {
            key: 'handling',
            title: 'Đang được xử lý',
            hint: 'Đã có người tiếp nhận. Mở Chi tiết để chuyển sự cố, đổi mức hoặc đóng.',
            items: visible.filter((a) => !['NEW', 'ESCALATED'].includes(a.status)),
          },
        ]
      : [{ key: 'closed', title: 'Đã đóng', hint: null, items: visible }]
  ).filter((section) => section.items.length > 0)

  async function command(alert, name, cmd, message) {
    setBusy(true)
    try {
      for (const each of [cmd].flat()) await runAlertCommand(alert.id, each)
      setProblem(null)
      setAnnouncement(`${message}: ${typeLabel(alert.type)}, ${name}.`)
      await load()
    } catch (error) {
      setProblem(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  async function created(message) {
    setCreating(false)
    setProblem(null)
    setAnnouncement(`${message}.`)
    await load()
  }

  async function done(message, name) {
    const alert = alerts.find((a) => a.id === openId)
    setOpenId(null)
    setAnnouncement(`${message}: ${typeLabel(alert?.type)}, ${name}.`)
    await load()
  }

  async function changed(message, name) {
    const alert = alerts.find((a) => a.id === openId)
    setAnnouncement(`${message}: ${typeLabel(alert?.type)}, ${name}.`)
    await load()
  }

  const opened = alerts.find((a) => a.id === openId)
  function open(id) {
    setAnnouncement('')
    setOpenId(id)
  }

  if (creating) return <CreateAlertForm onClose={() => setCreating(false)} onCreated={created} />

  // Nguy kịch (BF-17) có khối xử lý dài nên mở cả trang; cảnh báo khác ở khung phải, danh sách vẫn thấy và bấm được
  const wholePage = opened?.type === 'CRITICAL_CONDITION' && opened.criticalFlagId != null
  const detail = opened && (
    <AlertDetail
      key={opened.id}
      id={opened.id}
      name={nameOf(opened)}
      onDone={done}
      onChanged={changed}
      onNavigate={onNavigate}
    />
  )
  if (wholePage) {
    return (
      <CasePage
        key={opened.id}
        label="Chi tiết cảnh báo"
        backLabel="Cảnh báo"
        here={typeLabel(opened.type)}
        onBack={() => setOpenId(null)}
        returnFocusId={`alert-row-${opened.id}`}
        announcement={announcement}
      >
        {detail}
      </CasePage>
    )
  }
  // Esc đang đóng hộp lệnh mở từ khung thì không đóng luôn khung
  function closePanel() {
    if (document.querySelector('[data-slot="dialog-content"]')) return
    setOpenId(null)
  }

  return (
    <DetailLayout
      open={!!opened}
      detailKey={openId}
      onClose={closePanel}
      label="Chi tiết cảnh báo"
      renderDetail={({ Title }) =>
        opened && (
          <AlertDetail
            key={opened.id}
            id={opened.id}
            name={nameOf(opened)}
            Title={Title}
            onDone={done}
            onChanged={changed}
            onNavigate={onNavigate}
          />
        )
      }
    >
      <PageHeader
        title="Cảnh báo"
        subtitle="Cảnh báo trong phạm vi của bạn, khẩn cấp và đã leo thang tối đa lên đầu."
        aside={
          <div className="flex flex-wrap gap-2">
            {can('EMERGENCY_ASSIST_BUTTON', 'CREATE') && (
              <AssistButton
                onSent={(data, detailProblem) => {
                  setAssist(data)
                  setAnnouncement('Đã gửi yêu cầu hỗ trợ.')
                  if (detailProblem) setProblem(detailProblem)
                  load()
                }}
              />
            )}
            {can('ALERT_HANDLING', 'CREATE') && (
              <Button
                id="create-alert"
                className="h-11"
                onClick={() => {
                  setAnnouncement('')
                  setCreating(true)
                }}
              >
                <Plus aria-hidden="true" />
                Tạo cảnh báo
              </Button>
            )}
          </div>
        }
      >
        <div className="flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:gap-x-12">
          <FilterTabs
            label="Nhóm cảnh báo"
            value={group}
            onChange={setGroup}
            options={GROUPS.map(([value, label]) => [
              value,
              label,
              alerts.filter((a) => (value === 'open' ? isOpen(a) : !isOpen(a))).length,
            ])}
          />
          <FilterTabs
            label="Lọc theo mức"
            value={levelFilter}
            onChange={setLevelFilter}
            options={['ALL', ...LEVEL_ORDER].map((l) => [
              l,
              l === 'ALL' ? 'Tất cả mức' : LEVEL_LABEL[l],
              l === 'ALL' ? inGroup.length : inGroup.filter((a) => a.level === l).length,
            ])}
          />
        </div>
      </PageHeader>
      {can('EMERGENCY_ASSIST_BUTTON', 'CREATE') && (
        <AssistStatus key={assist?.pressId ?? 'current'} sent={assist} onOpen={open} />
      )}
      {/* DESIGN.md 5, 7.2: cảnh báo gấp chưa ai tiếp nhận nổi lên ở dải này, thẻ không thêm viền đỏ */}
      <NowStrip
        items={sortAlerts(alerts.filter(needsReceiver)).map((a) => ({
          key: a.id,
          label:
            a.residentId == null
              ? `${typeLabel(a.type)}${a.floorName ? `, ${a.floorName}` : ''}`
              : `${nameOf(a)}, ${typeLabel(a.type)}`,
          onSelect: () => open(a.id),
        }))}
      />
      <p role="status" aria-live="polite" className="empty:hidden rounded-xl border bg-card px-4 py-3 type-body-sm">
        {announcement}
      </p>
      {problem && <ProblemAlert problem={problem} />}
      {!board ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3 *:max-w-[480px]">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="type-body-sm">
            {levelFilter !== 'ALL' && inGroup.length > 0
              ? `Không có cảnh báo mức ${LEVEL_LABEL[levelFilter].toLowerCase()} trong nhóm này.`
              : group === 'open'
                ? 'Không có cảnh báo đang mở trong phạm vi của bạn.'
                : 'Chưa có cảnh báo đã đóng.'}
          </CardContent>
        </Card>
      ) : (
        <div className="@container flex flex-col gap-6">
          {sections.map((section) => (
            <section key={section.key} aria-label={section.title} className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <h2 className="type-card-title">
                  {section.title} <span className="tabular-nums text-muted-foreground">{section.items.length}</span>
                </h2>
                {section.hint && <p className="type-body-sm text-muted-foreground">{section.hint}</p>}
              </div>
              <div className="flex flex-col gap-2">
                {section.items.map((a) => (
                  <AlertRow
                    key={a.id}
                    alert={a}
                    name={nameOf(a)}
                    busy={busy}
                    onReceive={(x, andStart) =>
                      command(
                        x,
                        nameOf(x),
                        andStart ? ['receive', 'start-handling'] : 'receive',
                        andStart ? 'Đã tiếp nhận và bắt đầu xử lý' : 'Đã tiếp nhận cảnh báo',
                      )
                    }
                    onStart={(x) => command(x, nameOf(x), 'start-handling', 'Đã bắt đầu xử lý')}
                    onOpen={(x) => open(x.id)}
                    onReconcile={
                      onNavigate &&
                      ((x) => onNavigate('medication', { mode: 'reconciliation', residentId: x.residentId }))
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </DetailLayout>
  )
}
