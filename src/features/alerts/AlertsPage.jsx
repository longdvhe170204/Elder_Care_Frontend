import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
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
import { formatDateTime } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { cn } from '@/lib/utils'
import { StaffSelectField } from '@/common/StaffSelectField'
import { Call115Panel } from './Call115Panel'
import { PressedAlertPanel } from './PressedAlertPanel'
import { loadAlert, loadAlertBoard, loadIncidentTypes, runAlertCommand } from './alerts'
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

// onReconcile: cảnh báo "chưa đối chiếu thuốc" mở thẳng phiếu đối chiếu của người đó ở màn Phát thuốc (006 T078); là lối
// chuyển màn, không phải lệnh trên cảnh báo
function AlertCard({ alert, name, busy, onReceive, onStart, onOpen, onReconcile }) {
  const urgent = isUrgent(alert)
  const commands = alert.allowedCommands ?? []
  return (
    <Card role="article" aria-label={`${typeLabel(alert.type)}, ${name}`} className="gap-3">
      <CardHeader className="flex flex-row items-center gap-2.5">
        <ResidentAvatar name={name} code={String(alert.residentId ?? alert.id)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate type-label">{name}</span>
          <span className="type-caption text-muted-foreground">{originLabel(alert.origin)}</span>
        </div>
        <StatusBadge status={LEVEL_LABEL[alert.level]} />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2 type-body-sm">
        <span className="type-card-title">{typeLabel(alert.type)}</span>
        <span className="text-muted-foreground tabular-nums">
          Lần gần nhất {formatDateTime(alert.latestAt)}
          {alert.occurrenceCount > 1 && `, ${alert.occurrenceCount} lần cùng loại đã gộp`}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <AlertStatus alert={alert} />
          <span className="type-caption text-muted-foreground">Phụ trách: {alert.assignee ?? 'Chưa ai nhận'}</span>
        </div>
        {isOpen(alert) && alert.acknowledgementDeadline && ['NEW', 'ESCALATED'].includes(alert.status) && (
          <span className={cn('type-caption tabular-nums', urgent ? 'text-destructive' : 'text-muted-foreground')}>
            Hạn tiếp nhận {formatDateTime(alert.acknowledgementDeadline)}
          </span>
        )}
        <div className="mt-auto flex flex-wrap justify-end gap-2 border-t pt-3">
          <Button variant="ghost" size="sm" onClick={() => onOpen(alert)} aria-label={`Chi tiết cảnh báo của ${name}`}>
            Chi tiết
          </Button>
          {onReconcile && alert.type === 'CHUA_DOI_CHIEU' && alert.residentId && isOpen(alert) && (
            <Button variant="outline" size="sm" onClick={() => onReconcile(alert)}>
              {`Mở đối chiếu thuốc của ${name}`}
            </Button>
          )}
          {commands.includes('receive') && (
            <Button
              variant={urgent ? 'default' : 'tonal'}
              disabled={busy}
              onClick={() => onReceive(alert)}
              aria-label={`Tiếp nhận cảnh báo của ${name}`}
            >
              Tiếp nhận
            </Button>
          )}
          {commands.includes('start-handling') && (
            <Button
              variant="tonal"
              disabled={busy}
              onClick={() => onStart(alert)}
              aria-label={`Bắt đầu xử lý cảnh báo của ${name}`}
            >
              Bắt đầu xử lý
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Khung chi tiết: nguồn, thời điểm, lệnh cần nhập kết quả hoặc lý do (Đóng, Đổi mức), khối nút bấm khẩn cấp
const CRITICAL_CLOSE_MIN = 10

function AlertDetail({ id, name, Title, Description, onDone, onChanged }) {
  const [alert, setAlert] = useState(null)
  const [problem, setProblem] = useState(null)
  const [mode, setMode] = useState(null)
  const [text, setText] = useState('')
  const [level, setLevel] = useState('')
  const [incidentTypes, setIncidentTypes] = useState([])
  const [typeId, setTypeId] = useState('')
  const [staffId, setStaffId] = useState('')
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
      await runAlertCommand(alert.id, command)
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
    loadIncidentTypes().then(setIncidentTypes, (error) => setProblem(problemOf(error)))
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
      await runAlertCommand(alert.id, mode, body)
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
      setProblem(problemOf(error))
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
      {!mode &&
        [
          'receive',
          'start-handling',
          'assign',
          'close',
          'change-level',
          'convert-to-incident',
          'activate-emergency',
        ].some((c) => commands.includes(c)) && (
          <div className="flex flex-col gap-2">
            {commands.includes('receive') && (
              <Button className="h-11" disabled={busy} onClick={() => quick('receive', 'Đã tiếp nhận cảnh báo')}>
                Tiếp nhận
              </Button>
            )}
            {commands.includes('start-handling') && (
              <Button
                className="h-11"
                disabled={busy}
                onClick={() => quick('start-handling', 'Đã bắt đầu xử lý cảnh báo')}
              >
                Bắt đầu xử lý
              </Button>
            )}
            {commands.includes('assign') && (
              <Button className="h-11" onClick={() => setMode('assign')}>
                Giao người phụ trách
              </Button>
            )}
            {commands.includes('activate-emergency') && (
              <Button className="h-11" onClick={() => openConvert('activate-emergency')}>
                Kích hoạt khẩn cấp
              </Button>
            )}
            {commands.includes('convert-to-incident') && (
              <Button className="h-11" onClick={() => openConvert('convert-to-incident')}>
                Chuyển thành sự cố
              </Button>
            )}
            {commands.includes('close') && (
              <Button className="h-11" onClick={() => setMode('close')}>
                Đóng cảnh báo
              </Button>
            )}
            {commands.includes('change-level') && (
              <Button variant="outline" className="h-11" onClick={() => setMode('change-level')}>
                Đổi mức
              </Button>
            )}
          </div>
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

export function AlertsPage({ onNavigate }) {
  const [board, setBoard] = useState(null)
  const [problem, setProblem] = useState(null)
  const [group, setGroup] = useState('open')
  const [levelFilter, setLevelFilter] = useState('ALL')
  const [openId, setOpenId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [announcement, setAnnouncement] = useState('')

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

  async function command(alert, name, cmd, message) {
    setBusy(true)
    try {
      await runAlertCommand(alert.id, cmd)
      setProblem(null)
      setAnnouncement(`${message}: ${typeLabel(alert.type)}, ${name}.`)
      await load()
    } catch (error) {
      setProblem(problemOf(error))
    } finally {
      setBusy(false)
    }
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
        </div>
      </PageHeader>
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
        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3 *:max-w-[480px]">
          {visible.map((a) => (
            <AlertCard
              key={a.id}
              alert={a}
              name={nameOf(a)}
              busy={busy}
              onReceive={(x) => command(x, nameOf(x), 'receive', 'Đã tiếp nhận cảnh báo')}
              onStart={(x) => command(x, nameOf(x), 'start-handling', 'Đã bắt đầu xử lý')}
              onOpen={(x) => setOpenId(x.id)}
              onReconcile={
                onNavigate &&
                ((x) =>
                  onNavigate('medication', { mode: 'reconciliation', residentId: x.residentId }))
              }
            />
          ))}
        </div>
      )}
    </DetailLayout>
  )
}
