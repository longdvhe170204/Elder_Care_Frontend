import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
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
import { Call115Panel } from './Call115Panel'
import { CreateAlertSheet } from './CreateAlertSheet'
import { PressedAlertPanel } from './PressedAlertPanel'
import {
  joinIncident,
  loadAlert,
  loadAlertBoard,
  loadIncidentTypes,
  receiveCreatedIncident,
  runAlertCommand,
} from './alerts'
import {
  LEVEL_LABEL,
  LEVEL_ORDER,
  isOpen,
  isUrgent,
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
        'flex flex-col gap-3 rounded-xl border border-l-4 bg-card p-4 sm:flex-row sm:items-center',
        urgent ? 'border-l-destructive' : alert.level === 'MEDIUM' ? 'border-l-warning-foreground' : 'border-l-border',
      )}
    >
      <ResidentAvatar name={name} code={String(alert.residentId ?? alert.id)} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="type-label">{name}</span>
          <StatusBadge status={LEVEL_LABEL[alert.level]} />
          <AlertStatus alert={alert} />
        </div>
        <span className="type-card-title">{typeLabel(alert.type)}</span>
        <span className="type-caption text-muted-foreground tabular-nums">
          {originLabel(alert.origin)}, lần gần nhất {formatDateTime(alert.latestAt)}
          {alert.occurrenceCount > 1 && `, ${alert.occurrenceCount} lần cùng loại đã gộp`}
          {`, phụ trách: ${alert.assignee ?? 'chưa ai nhận'}`}
          {alert.incidentId != null && `, đã thành sự cố SC-${alert.incidentId}`}
        </span>
        {waiting && (
          <span className={cn('type-caption tabular-nums', urgent ? 'text-destructive' : 'text-muted-foreground')}>
            Hạn tiếp nhận {formatDateTime(alert.acknowledgementDeadline)}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
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
          aria-label={`Chi tiết cảnh báo của ${name}`}
        >
          Chi tiết
        </Button>
      </div>
    </article>
  )
}

function ActionGroup({ title, children }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="type-caption text-muted-foreground">{title}</h3>
      {children}
    </div>
  )
}

// Nút kèm một dòng nói rõ việc sẽ xảy ra (DESIGN.md 8: nút nói đúng việc), để phân biệt Kích hoạt khẩn cấp, Chuyển sự cố, Đổi mức
function Action({ label, hint, variant = 'default', ...props }) {
  return (
    <div className="flex flex-col gap-1">
      <Button variant={variant} className="h-11 w-full" {...props}>
        {label}
      </Button>
      <span className="type-caption text-muted-foreground">{hint}</span>
    </div>
  )
}

// Khung chi tiết: nguồn, thời điểm, lệnh cần nhập kết quả hoặc lý do (Đóng, Đổi mức), khối nút bấm khẩn cấp
const CRITICAL_CLOSE_MIN = 10

function AlertDetail({ id, name, Title, Description, onDone, onChanged, onNavigate }) {
  const [alert, setAlert] = useState(null)
  const [problem, setProblem] = useState(null)
  const [mode, setMode] = useState(null)
  const [text, setText] = useState('')
  const [level, setLevel] = useState('')
  const [incidentTypes, setIncidentTypes] = useState([])
  const [typeId, setTypeId] = useState('')
  const [staffId, setStaffId] = useState('')
  const [createdIncidentId, setCreatedIncidentId] = useState(null)
  const [blockingIncidentId, setBlockingIncidentId] = useState(null)
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

  async function joinBlocking() {
    setBusy(true)
    try {
      await joinIncident(blockingIncidentId)
      setCreatedIncidentId(blockingIncidentId)
      setBlockingIncidentId(null)
      onChanged(`Đã tham gia xử lý sự cố SC-${blockingIncidentId}`, name)
    } catch (error) {
      setProblem(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  function openConvert(next) {
    setMode(next)
    // Cảnh báo thủ công mang mã loại sự cố: chọn sẵn đúng loại đó để chỉ còn bấm lưu (ưu tiên thời gian xử lý)
    loadIncidentTypes().then(
      (types) => {
        setIncidentTypes(types)
        const same = types.find((t) => t.code === alert.type)
        if (same) setTypeId(String(same.id))
      },
      (error) => setProblem(problemOf(error)),
    )
  }

  async function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    if (converting ? !typeId : textMissing || (mode === 'change-level' && !level) || (mode === 'assign' && !staffId))
      return
    setBusy(true)
    try {
      const body = converting
        ? {
            incidentTypeId: Number(typeId),
            ...(text.trim() && { description: text.trim() }),
            ...(initialResponse.trim() && { initialResponse: initialResponse.trim() }),
          }
        : mode === 'close'
          ? { resolution: text.trim() }
          : mode === 'assign'
            ? { staffId: Number(staffId), note: text.trim() }
            : { newLevel: level, reason: text.trim() }
      const result = await runAlertCommand(alert.id, mode, body)
      if (converting) {
        // Ở lại chi tiết để người dùng thấy ngay sự cố vừa tạo mang mã nào và mở được sang màn Sự cố
        const created = result?.data?.incident ?? result?.data ?? null
        const incidentId = created?.id ?? null
        const taken = await receiveCreatedIncident(created)
        setCreatedIncidentId(incidentId)
        setMode(null)
        await reload()
        onChanged(
          `${mode === 'activate-emergency' ? 'Đã kích hoạt khẩn cấp' : 'Đã chuyển thành sự cố'}${incidentId ? ` SC-${incidentId}` : ''}${taken ? ', bạn đang xử lý' : ''}`,
          name,
        )
        // Khẩn cấp: sang thẳng sự cố để thấy thẻ thông tin khẩn cấp và Gọi 115, không bắt tìm lại ở menu
        if (mode === 'activate-emergency' && incidentId && onNavigate) onNavigate('incidents', { incidentId })
        return
      }
      onDone(
        {
          close: 'Đã đóng cảnh báo',
          'convert-to-incident': 'Đã chuyển thành sự cố',
          'activate-emergency': 'Đã kích hoạt khẩn cấp',
          assign: 'Đã giao người phụ trách',
        }[mode] ?? `Đã đổi mức sang ${LEVEL_LABEL[level].toLowerCase()}`,
        name,
      )
    } catch (error) {
      // FR-041: một người chỉ có một sự cố Khẩn cấp đang mở; chỉ ra sự cố đó và cho tham gia hoặc mở, không tự gộp
      if (error?.problem?.errorCode === 'OPEN_EMERGENCY_INCIDENT_EXISTS' && error.problem.incidentId != null) {
        setBlockingIncidentId(error.problem.incidentId)
        setMode(null)
        setProblem(null)
      } else {
        setProblem(problemOf(error))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Title className="type-title">{typeLabel(alert.type)}</Title>
        <Description className="type-body-sm text-muted-foreground">
          {name}, {originLabel(alert.origin).toLowerCase()}
        </Description>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={LEVEL_LABEL[alert.level]} />
          <AlertStatus alert={alert} />
        </div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 type-body-sm">
        <dt className="text-muted-foreground">Lần đầu</dt>
        <dd className="tabular-nums">{formatDateTime(alert.firstAt)}</dd>
        <dt className="text-muted-foreground">Lần gần nhất</dt>
        <dd className="tabular-nums">{formatDateTime(alert.latestAt)}</dd>
        <dt className="text-muted-foreground">Số lần gộp</dt>
        <dd className="tabular-nums">{alert.occurrenceCount}</dd>
        <dt className="text-muted-foreground">Phụ trách</dt>
        <dd>{alert.assignee ?? 'Chưa ai nhận'}</dd>
        {blockingIncidentId != null && (
          <section
            role="alert"
            className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 type-body-sm"
          >
            <p>
              Chưa tạo sự cố mới: người cao tuổi này đang có sự cố Khẩn cấp chưa đóng, mã{' '}
              <strong>SC-{blockingIncidentId}</strong>. Mỗi người chỉ có một sự cố Khẩn cấp đang mở, hệ thống không tự
              gộp. Bạn cùng xử lý sự cố đó, hoặc mở ra xem trước.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button className="h-11" disabled={busy} onClick={joinBlocking}>
                Tham gia xử lý SC-{blockingIncidentId}
              </Button>
              {onNavigate && (
                <Button
                  variant="outline"
                  className="h-11"
                  onClick={() => onNavigate('incidents', { incidentId: blockingIncidentId })}
                >
                  Mở sự cố SC-{blockingIncidentId}
                </Button>
              )}
            </div>
          </section>
        )}
        {(createdIncidentId ?? alert.incidentId) != null && (
          <section aria-label="Sự cố liên kết" className="flex flex-col gap-2 rounded-lg border p-3 type-body-sm">
            <span>
              Cảnh báo này đã thành sự cố <strong>SC-{createdIncidentId ?? alert.incidentId}</strong>. Xử lý tiếp ở màn
              Sự cố.
            </span>
            {onNavigate && (
              <Button
                variant="outline"
                className="h-11 self-start"
                onClick={() => onNavigate('incidents', { incidentId: createdIncidentId ?? alert.incidentId })}
              >
                Mở sự cố SC-{createdIncidentId ?? alert.incidentId}
              </Button>
            )}
          </section>
        )}
        {alert.noOnDutyDoctor && (
          <>
            <dt className="text-muted-foreground">Bác sĩ trực</dt>
            <dd className="text-destructive">Không có bác sĩ trực</dd>
          </>
        )}
      </dl>
      {(alert.sources ?? []).length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="type-caption text-muted-foreground">Nguồn</h3>
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
      {['SOS', 'ASSIST_BUTTON'].includes(alert.origin) && <PressedAlertPanel alert={alert} onChanged={reload} />}
      {!['SOS', 'ASSIST_BUTTON'].includes(alert.origin) && commands.includes('call-115') && (
        <Call115Panel subject="alerts" id={alert.id} />
      )}
      {problem && <ProblemAlert problem={problem} />}
      {!mode && (
        <section aria-label="Việc cần làm" className="flex flex-col gap-4">
          {['receive', 'start-handling', 'assign'].some((c) => commands.includes(c)) && (
            <ActionGroup title="Bước tiếp theo">
              {commands.includes('receive') && commands.includes('activate-emergency') && (
                <Action
                  label="Tiếp nhận và xử lý"
                  hint="Nhận việc và bắt đầu xử lý ngay. Cảnh báo dừng leo thang."
                  disabled={busy}
                  onClick={() => quick(['receive', 'start-handling'], 'Đã tiếp nhận và bắt đầu xử lý')}
                />
              )}
              {commands.includes('receive') && (
                <Action
                  label={commands.includes('activate-emergency') ? 'Chỉ tiếp nhận' : 'Tiếp nhận'}
                  hint={
                    commands.includes('activate-emergency')
                      ? 'Chỉ báo đã nhận để dừng leo thang, xử lý sau.'
                      : 'Nhận cảnh báo này. Cảnh báo dừng leo thang.'
                  }
                  variant={commands.includes('activate-emergency') ? 'outline' : 'default'}
                  disabled={busy}
                  onClick={() => quick('receive', 'Đã tiếp nhận cảnh báo')}
                />
              )}
              {commands.includes('start-handling') && (
                <Action
                  label="Bắt đầu xử lý"
                  hint="Đã nhận, bắt đầu làm. Sau đó mới đóng được hoặc chuyển thành sự cố."
                  disabled={busy}
                  onClick={() => quick('start-handling', 'Đã bắt đầu xử lý cảnh báo')}
                />
              )}
              {commands.includes('assign') && (
                <Action
                  label="Giao người phụ trách"
                  hint="Giao cho người sẽ xử lý, kèm ghi chú."
                  onClick={() => setMode('assign')}
                />
              )}
            </ActionGroup>
          )}
          {commands.includes('activate-emergency') && (
            <ActionGroup title="Nếu là tình huống khẩn cấp thật">
              <Action
                label="Kích hoạt khẩn cấp"
                hint="Tạo ngay sự cố Khẩn cấp có thẻ thông tin khẩn cấp, báo Bác sĩ trực, Trưởng tầng và người liên hệ chính."
                variant={alert.level === 'CRITICAL' ? 'default' : 'outline'}
                onClick={() => openConvert('activate-emergency')}
              />
            </ActionGroup>
          )}
          {['convert-to-incident', 'close', 'change-level'].some((c) => commands.includes(c)) && (
            <ActionGroup title="Khi đang xử lý">
              {commands.includes('convert-to-incident') && (
                <Action
                  label="Chuyển thành sự cố"
                  hint="Cần ghi nhận chính thức để theo dõi, ghi diễn biến, chuyển viện. Sự cố cùng mức với cảnh báo."
                  variant="outline"
                  onClick={() => openConvert('convert-to-incident')}
                />
              )}
              {commands.includes('close') && (
                <Action
                  label="Đóng cảnh báo"
                  hint="Đã xử lý xong, ghi kết quả."
                  variant="outline"
                  onClick={() => setMode('close')}
                />
              )}
              {commands.includes('change-level') && (
                <Action
                  label="Đổi mức"
                  hint="Nâng hoặc hạ mức, cần lý do. Vẫn là cảnh báo, chưa tạo sự cố."
                  variant="outline"
                  onClick={() => setMode('change-level')}
                />
              )}
            </ActionGroup>
          )}
          {commands.includes('activate-emergency') && !commands.includes('convert-to-incident') && (
            <p className="type-caption text-muted-foreground">
              "Chuyển thành sự cố" và "Đóng cảnh báo" dùng được sau khi bấm "Bắt đầu xử lý".
            </p>
          )}
        </section>
      )}
      {mode && (
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
          {converting && (
            <Field data-invalid={(submitted && !typeId) || undefined}>
              <FieldLabel htmlFor="alert-incident-type">Loại sự cố</FieldLabel>
              <select
                id="alert-incident-type"
                value={typeId}
                onChange={(e) => setTypeId(e.target.value)}
                aria-invalid={(submitted && !typeId) || undefined}
                className="h-11 w-full rounded-md border border-input bg-transparent px-3"
              >
                <option value="">Chưa chọn</option>
                {incidentTypes.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.name}
                  </option>
                ))}
              </select>
              {submitted && !typeId && <FieldError>Chọn loại sự cố</FieldError>}
            </Field>
          )}
          {converting && (
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
            <p role="note" className="rounded-md border border-warning/40 bg-warning/10 p-3 type-body-sm">
              Cảnh báo Khẩn cấp thường cần bấm "Kích hoạt khẩn cấp" hoặc "Chuyển thành sự cố". Chỉ đóng khi đã xác nhận
              không phải tình huống khẩn cấp thật.
            </p>
          )}
          <Field data-invalid={(!converting && submitted && textMissing) || undefined}>
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
              {{
                close: 'Lưu và đóng cảnh báo',
                'convert-to-incident': 'Lưu và chuyển sự cố',
                'activate-emergency': 'Lưu và kích hoạt',
                assign: 'Lưu và giao',
              }[mode] ?? 'Lưu mức mới'}
            </Button>
            <Button type="button" variant="ghost" className="h-11" onClick={() => setMode(null)}>
              Quay lại
            </Button>
          </div>
        </form>
      )}
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
  const nameOf = (a) => board?.names?.[a.residentId] ?? (a.residentId ? 'Người cao tuổi' : 'Chưa gắn người cao tuổi')
  const inGroup = alerts.filter((a) => (group === 'open' ? isOpen(a) : !isOpen(a)))
  const visible = sortAlerts(inGroup.filter((a) => levelFilter === 'ALL' || a.level === levelFilter))
  // Đang mở chia hai nhóm theo việc cần làm: chưa ai nhận (cần tiếp nhận) và đã có người nhận (đang xử lý); đã đóng một nhóm
  const sections = (
    group === 'open'
      ? [
          {
            key: 'waiting',
            title: 'Cần tiếp nhận',
            hint: 'Chưa ai nhận. Quá hạn thì tự leo thang lên cấp trên.',
            items: visible.filter((a) => ['NEW', 'ESCALATED'].includes(a.status)),
          },
          {
            key: 'handling',
            title: 'Đang được xử lý',
            hint: 'Đã có người nhận. Mở Chi tiết để chuyển sự cố, đổi mức hoặc đóng.',
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

  return (
    <DetailLayout
      open={!!opened}
      detailKey={openId}
      onClose={() => setOpenId(null)}
      label="Chi tiết cảnh báo"
      renderDetail={({ Title, Description }) =>
        opened && (
          <AlertDetail
            key={opened.id}
            id={opened.id}
            name={nameOf(opened)}
            Title={Title}
            Description={Description}
            onDone={done}
            onChanged={changed}
            onNavigate={onNavigate}
          />
        )
      }
    >
      <PageHeader title="Cảnh báo" subtitle="Cảnh báo trong phạm vi của bạn, khẩn cấp và đã leo thang tối đa lên đầu.">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <ToggleGroup
            variant="filter"
            size="lg"
            value={[group]}
            onValueChange={(n) => n[0] && setGroup(n[0])}
            aria-label="Nhóm cảnh báo"
          >
            {GROUPS.map(([value, label]) => (
              <ToggleGroupItem key={value} value={value} className="h-11 px-4">
                {label}{' '}
                <span className="tabular-nums">
                  {alerts.filter((a) => (value === 'open' ? isOpen(a) : !isOpen(a))).length}
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <ToggleGroup
            variant="filter"
            size="lg"
            value={[levelFilter]}
            onValueChange={(n) => n[0] && setLevelFilter(n[0])}
            aria-label="Lọc theo mức"
          >
            {['ALL', ...LEVEL_ORDER].map((l) => (
              <ToggleGroupItem key={l} value={l} className="h-11 px-4">
                {l === 'ALL' ? 'Tất cả' : LEVEL_LABEL[l]}{' '}
                <span className="tabular-nums">
                  {l === 'ALL' ? inGroup.length : inGroup.filter((a) => a.level === l).length}
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {can('ALERT_HANDLING', 'CREATE') && (
            <Button className="h-11 lg:ml-auto" onClick={() => setCreating(true)}>
              <Plus aria-hidden="true" />
              Tạo cảnh báo
            </Button>
          )}
        </div>
      </PageHeader>
      <CreateAlertSheet open={creating} onClose={() => setCreating(false)} onCreated={created} />
      {/* DESIGN.md 5, 7.2: cảnh báo gấp (Khẩn cấp, đã leo thang tối đa) nổi lên ở dải này, thẻ không thêm viền đỏ */}
      <NowStrip
        items={sortAlerts(alerts.filter(isUrgent)).map((a) => ({
          key: a.id,
          label: `${nameOf(a)}, ${typeLabel(a.type)}`,
          onSelect: () => setOpenId(a.id),
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
            {group === 'open' ? 'Không có cảnh báo đang mở trong phạm vi của bạn.' : 'Chưa có cảnh báo đã đóng.'}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {sections.map((section) => (
            <section key={section.key} aria-label={section.title} className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <h2 className="type-card-title">
                  {section.title} <span className="tabular-nums text-muted-foreground">{section.items.length}</span>
                </h2>
                {section.hint && <p className="type-caption text-muted-foreground">{section.hint}</p>}
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
                    onOpen={(x) => setOpenId(x.id)}
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
