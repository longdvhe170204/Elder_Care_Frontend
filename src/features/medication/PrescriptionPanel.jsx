import { useCallback, useState } from 'react'
import { Calendar, CalendarPlus, Clock, FileText, Pause, Play, Plus, RefreshCw, ShieldAlert, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { AllergyNote } from '@/common/CareNotes'
import { ProblemAlert } from '@/common/ProblemAlert'
import { ResidentAvatar } from '@/common/ResidentAvatar'
import { problemOf } from '@/common/problem'
import { cn } from '@/lib/utils'
import { hhmm } from './doseRoundView'
import { ChangeDosageSheet } from './ChangeDosageSheet'
import { CommandSheet } from './CommandSheet'
import { PrescriptionSheet } from './PrescriptionSheet'
import { measurementLabel } from './measurements'
import { loadPrescriptionBoard } from './prescriptions'
import { STATUS_FILTERS } from './prescriptionView'
import { ResidentPicker } from './ResidentPicker'

// Màn Đơn thuốc (spec 006 User Story 1; FR-004 → FR-017): bố cục Master-Detail 2 cột:
// - Cột trái: Tìm kiếm, phân trang tối đa 8 người và danh sách người cao tuổi.
// - Cột phải: Banner lâm sàng, thanh lọc trạng thái dạng pill, nút kê đơn nổi bật,
//   và lưới thẻ đơn thuốc với huy hiệu trạng thái và nút bấm thao tác trực quan.
// Bác sĩ có thẩm quyền kê đơn nội bộ, đổi liều, tạm dừng, ngừng;
// Điều dưỡng chỉ nhập đơn bên ngoài (BR-M07-05, BR-M07-07). Thẻ không viền đỏ (DESIGN.md 6.7).

const COMMAND_CONFIG = {
  SUSPEND: {
    label: 'Tạm dừng',
    Icon: Pause,
    className:
      'border-amber-300 bg-amber-50/80 text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
  },
  RESUME: {
    label: 'Tiếp tục',
    Icon: Play,
    className:
      'border-emerald-300 bg-emerald-50/80 text-emerald-900 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
  },
  RESUME_TEMPORARILY: {
    label: 'Tiếp tục tạm',
    Icon: Play,
    className:
      'border-emerald-300 bg-emerald-50/80 text-emerald-900 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
  },
  DISCONTINUE: {
    label: 'Ngừng',
    Icon: XCircle,
    className:
      'border-red-200 bg-red-50/80 text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300',
  },
  EXTEND: {
    label: 'Gia hạn',
    Icon: CalendarPlus,
    className:
      'border-sky-300 bg-sky-50/80 text-sky-900 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200',
  },
}

const COMMAND_BUTTONS = [
  { command: 'SUSPEND', ...COMMAND_CONFIG.SUSPEND },
  { command: 'RESUME', ...COMMAND_CONFIG.RESUME },
  { command: 'RESUME_TEMPORARILY', ...COMMAND_CONFIG.RESUME_TEMPORARILY },
  { command: 'DISCONTINUE', ...COMMAND_CONFIG.DISCONTINUE },
  { command: 'EXTEND', ...COMMAND_CONFIG.EXTEND },
]

const STATUS_BADGE_STYLE = {
  'Hiệu lực': 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800',
  'Tạm dừng': 'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800',
  'Đã ngừng': 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  'Chờ hiệu lực': 'bg-sky-50 text-sky-900 border-sky-300 dark:bg-sky-950/50 dark:text-sky-200 dark:border-sky-800',
  'Hết hạn': 'bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-800',
}

const STATUS_DOT = {
  'Hiệu lực': 'bg-emerald-500',
  'Tạm dừng': 'bg-amber-500',
  'Đã ngừng': 'bg-slate-400',
  'Chờ hiệu lực': 'bg-sky-500',
  'Hết hạn': 'bg-rose-500',
}

function PrescriptionStatusBadge({ status }) {
  const style = STATUS_BADGE_STYLE[status] ?? 'bg-slate-100 text-slate-700 border-slate-300'
  const dot = STATUS_DOT[status] ?? 'bg-slate-400'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-bold shadow-xs tabular-nums',
        style,
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', dot, status === 'Hiệu lực' && 'animate-pulse')} />
      {status}
    </span>
  )
}

// onReconcile(resident): mở chế độ Đối chiếu thuốc cho người đang chọn khi có đơn chờ đối chiếu (006 T074)
export function PrescriptionPanel({ role, onSaved, onReconcile }) {
  const isDoctor = role === 'DOCTOR'
  const canPrescribe = isDoctor || role === 'NURSING_STAFF'

  const [resident, setResident] = useState(null)
  const [board, setBoard] = useState(null)
  const [problem, setProblem] = useState(null)
  const [statusFilter, setStatusFilter] = useState('Tất cả')
  const [creating, setCreating] = useState(false)
  const [changing, setChanging] = useState(null)
  const [commanding, setCommanding] = useState(null)

  const load = useCallback(async (id) => {
    try {
      setBoard(await loadPrescriptionBoard(id))
      setProblem(null)
    } catch (error) {
      setBoard({ prescriptions: [], medications: [], resident: null })
      setProblem(problemOf(error))
    }
  }, [])

  function pick(r) {
    setResident(r)
    setBoard(null)
    setProblem(null)
    load(r.id)
  }

  async function saved(message) {
    onSaved?.(message)
    await load(resident.id)
  }

  const awaiting = (board?.prescriptions ?? []).filter((p) => p.awaitingReconciliation).length
  const residentName = resident?.personalInfo?.fullName ?? `người cao tuổi mã ${resident?.id}`
  const prescriptions = (board?.prescriptions ?? []).filter((p) => statusFilter === 'Tất cả' || p.status === statusFilter)
  const activeCount = (board?.prescriptions ?? []).filter((p) => p.status === 'ACTIVE' || p.status === 'Hiệu lực').length

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* Cột trái: Danh sách tối đa 8 người cao tuổi có phân trang */}
      <div className="w-full lg:w-80 lg:shrink-0">
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between px-0.5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Danh sách người cao tuổi
            </h3>
          </div>
          <ResidentPicker onPick={pick} selectedId={resident?.id} />
        </div>
      </div>

      {/* Cột phải: Banner cụ đang chọn, thanh lọc pill và lưới thẻ đơn thuốc */}
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <ProblemAlert problem={problem} />

        {/* Banner lâm sàng tóm tắt của người cao tuổi đang chọn */}
        {resident && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <ResidentAvatar
                name={resident.personalInfo?.fullName ?? ''}
                code={String(resident.id)}
                className="size-11 text-sm font-bold shadow-xs"
              />
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {residentName}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 tabular-nums dark:bg-slate-800 dark:text-slate-300">
                    {resident.profileCode}
                  </span>
                </div>
                {board?.resident?.allergies?.length > 0 && (
                  <AllergyNote allergies={board.resident.allergies} />
                )}
              </div>
            </div>

            {board && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200 shadow-xs">
                <FileText className="size-3.5 text-emerald-600" />
                <span className="tabular-nums">{activeCount}</span> đơn thuốc đang hiệu lực
              </span>
            )}
          </div>
        )}

        {/* Thanh lọc trạng thái và Nút kê đơn mới */}
        {resident && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <ToggleGroup
              variant="default"
              size="sm"
              value={[statusFilter]}
              onValueChange={(val) => val[0] && setStatusFilter(val[0])}
              className="flex flex-wrap items-center gap-2"
              aria-label="Lọc theo trạng thái"
            >
              {STATUS_FILTERS.map((s) => {
                const isSelected = statusFilter === s
                const count = (board?.prescriptions ?? []).filter((p) => s === 'Tất cả' || p.status === s).length
                return (
                  <ToggleGroupItem
                    key={s}
                    value={s}
                    aria-label={s}
                    className={cn(
                      'inline-flex h-8.5 items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-bold transition-all shadow-xs border',
                      isSelected
                        ? 'bg-sky-100 text-sky-950 border-sky-400 ring-1 ring-sky-300 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400',
                    )}
                  >
                    <span>{s}</span>
                    {board && (
                      <span className={cn('tabular-nums font-bold text-[11px]', isSelected ? 'text-sky-800 dark:text-sky-300' : 'text-slate-400')}>
                        ({count})
                      </span>
                    )}
                  </ToggleGroupItem>
                )
              })}
            </ToggleGroup>

            {canPrescribe && board && (
              <Button
                onClick={() => setCreating(true)}
                className="h-9.5 gap-2 rounded-xl bg-[#24496f] hover:bg-[#193552] text-white px-4 text-xs font-bold shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
              >
                <Plus className="size-4" aria-hidden="true" />
                {isDoctor ? 'Nhập đơn thuốc mới' : 'Nhập đơn bên ngoài (theo toa)'}
              </Button>
            )}
          </div>
        )}

        {/* Cảnh báo đơn chờ đối chiếu thuốc */}
        {awaiting > 0 && onReconcile && (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/50 dark:bg-amber-950/40">
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-xs font-semibold text-amber-950 dark:text-amber-200">
                {`${awaiting} đơn của ${residentName} đang tạm dừng chờ đối chiếu thuốc; liều chỉ chạy lại khi phiếu được xác nhận.`}
              </p>
            </div>
            <Button
              variant="outline"
              className="h-9 shrink-0 rounded-xl border border-amber-400 bg-white px-3.5 text-xs font-bold text-amber-950 shadow-xs hover:bg-amber-100 dark:bg-slate-900 dark:border-amber-800 dark:text-amber-200"
              onClick={() => onReconcile(resident)}
            >
              {`Mở đối chiếu thuốc của ${residentName}`}
            </Button>
          </div>
        )}

        {/* Trạng thái chưa chọn người cao tuổi */}
        {!resident && (
          <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 p-12 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900/50">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-400">
              <FileText className="size-7" />
            </div>
            <h4 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">
              Chọn người cao tuổi từ danh sách
            </h4>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              Chọn người cao tuổi ở danh sách bên trái để xem, theo dõi và quản lý các đơn thuốc.
            </p>
          </div>
        )}

        {resident && !board && !problem && (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 text-center text-xs text-slate-500 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            Đang tải đơn thuốc…
          </div>
        )}

        {board && !problem && prescriptions.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 p-10 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <FileText className="mb-2 size-9 text-slate-400" aria-hidden="true" />
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Không có đơn thuốc nào</p>
            <p className="mt-0.5 text-xs text-slate-500">Đổi bộ lọc trạng thái hoặc nhập đơn mới.</p>
          </div>
        )}

        {/* Lưới danh sách thẻ đơn thuốc chi tiết */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {prescriptions.map((p) => {
            // Tiếp tục tạm (BR-M07-28): Điều dưỡng cũng làm được với đơn bên ngoài, backend kiểm đơn nội bộ chỉ Bác sĩ (Q-413)
            const buttons = COMMAND_BUTTONS.filter(
              (b) => p.allowedCommands.includes(b.command) && (isDoctor || b.command === 'RESUME_TEMPORARILY'),
            )
            const canChange = isDoctor && p.allowedCommands.includes('CHANGE_DOSE')
            return (
              <Card
                key={p.id}
                className="flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
              >
                <CardHeader className="flex flex-row items-center gap-3 border-b border-slate-100 p-4 pb-3 dark:border-slate-800">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-base font-bold text-slate-900 dark:text-slate-100">
                      {p.drug}
                    </span>
                    <span className="text-xs text-slate-400 tabular-nums font-medium">Đơn #{p.id}</span>
                  </div>
                  <PrescriptionStatusBadge status={p.status} />
                </CardHeader>

                <CardContent className="flex flex-1 flex-col gap-3 p-4 pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Liều: <strong className="font-bold text-slate-900 dark:text-slate-100">{p.dose}</strong>, đường dùng: {p.route}
                    </p>
                    <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[11px] font-bold border-slate-300 text-slate-700 bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {p.typeLabel}
                    </Badge>
                  </div>

                  {p.replacesId && (
                    <Badge variant="secondary" className="w-fit rounded-lg px-2.5 py-0.5 text-xs bg-slate-100 text-slate-700 font-semibold dark:bg-slate-800 dark:text-slate-300">
                      Đơn thay thế đơn #{p.replacesId}
                    </Badge>
                  )}
                  {p.replacedById && (
                    <span className="text-xs text-slate-500 font-medium">
                      Đã được thay thế bởi đơn <strong className="font-bold text-slate-800 dark:text-slate-200">#{p.replacedById}</strong>
                    </span>
                  )}
                  {p.awaitingReconciliation && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400">
                      <ShieldAlert className="size-3.5" />
                      Chờ đối chiếu thuốc
                    </span>
                  )}
                  {p.critical && (
                    <Badge variant="outline" className="w-fit rounded-full px-2.5 py-0.5 text-xs font-bold border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                      Quan trọng về thời gian
                    </Badge>
                  )}
                  {p.measurements.length > 0 && (
                    <div className="inline-flex items-center gap-1.5 rounded-xl bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs font-bold text-amber-900 dark:bg-amber-950/40 dark:border-amber-900/50 dark:text-amber-200 w-fit">
                      <span>Đo trước khi dùng: {p.measurements.map(measurementLabel).join(', ')}</span>
                    </div>
                  )}
                  {p.indication && (
                    <div className="inline-flex items-center gap-1.5 rounded-xl bg-sky-50 border border-sky-100 px-2.5 py-1 text-xs font-bold text-sky-900 dark:bg-sky-950/40 dark:border-sky-900 dark:text-sky-200 w-fit">
                      <span className="text-sky-600 font-bold dark:text-sky-400">Chỉ định:</span>
                      <span>{p.indication}</span>
                    </div>
                  )}
                  {p.tempResumed && (
                    <span className="text-xs text-slate-500 italic font-medium">
                      Đang Tiếp tục tạm theo giấy ra viện, chờ phiếu đối chiếu
                    </span>
                  )}
                  {p.noMedicationAvailable && (
                    <span className="text-xs text-red-600 font-bold">
                      Chưa có thuốc để phát (FR-009)
                    </span>
                  )}

                  {/* Hộp thời gian & Hiệu lực */}
                  <div className="flex flex-col gap-1.5 rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/40">
                    <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-semibold">
                      <Clock className="size-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                      {p.frequencyText}
                    </span>
                    <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-medium">
                      <Calendar className="size-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                      {p.prescribedAt ? `Kê ngày ${p.prescribedAt.split('-').reverse().join('/')}, ` : `Hiệu lực từ ${hhmm(p.startedAt)}, `}
                      {p.prescriberText}
                    </span>
                  </div>

                  {p.instructionNote && (
                    <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-xs italic text-slate-700 dark:border-slate-800 dark:bg-slate-800/30 dark:text-slate-300">
                      "{p.instructionNote}"
                    </div>
                  )}

                  {p.confirmedIssues.length > 0 && (
                    <div className="flex flex-col gap-1 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                      <span className="flex items-center gap-1.5 font-bold">
                        <ShieldAlert className="size-3.5 shrink-0" aria-hidden="true" />
                        Đã xác nhận khi kê đơn:
                      </span>
                      {p.confirmedIssues.map((i) => (
                        <span key={i.issueCode} className="pl-5 text-[11px] font-medium">
                          • {i.text}
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>

                {(buttons.length > 0 || canChange) && (
                  <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 p-3 dark:border-slate-800 bg-slate-50/40">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {buttons.map(({ command, label, Icon, className: btnClass }) => (
                        <Button
                          key={command}
                          variant="outline"
                          size="sm"
                          className={cn(
                            'h-8 gap-1 rounded-xl border px-2.5 text-xs font-bold shadow-xs transition-all hover:-translate-y-0.5',
                            btnClass,
                          )}
                          onClick={() => setCommanding({ command, prescription: p })}
                        >
                          <Icon className="size-3.5" aria-hidden="true" />
                          {label}
                        </Button>
                      ))}
                    </div>
                    {canChange && (
                      <Button
                        size="sm"
                        className="h-8 gap-1.5 rounded-xl bg-[#24496f] hover:bg-[#193552] text-white px-3 text-xs font-bold shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
                        onClick={() => setChanging(p)}
                      >
                        <RefreshCw className="size-3" aria-hidden="true" />
                        Đổi liều
                      </Button>
                    )}
                  </CardFooter>
                )}
              </Card>
            )
          })}
        </div>
      </div>

      {resident && board && (
        <PrescriptionSheet
          open={creating}
          onOpenChange={setCreating}
          residentId={resident.id}
          resident={board.resident ?? { name: resident.personalInfo.fullName, allergies: [] }}
          medications={board.medications}
          isDoctor={isDoctor}
          onSaved={saved}
        />
      )}
      <ChangeDosageSheet
        prescription={changing}
        onClose={() => setChanging(null)}
        onDone={async (message) => {
          setChanging(null)
          await saved(message)
        }}
      />
      <CommandSheet
        target={commanding}
        onClose={() => setCommanding(null)}
        onDone={async (command, p) => {
          setCommanding(null)
          await saved(`Đã ${{ SUSPEND: 'tạm dừng', RESUME: 'tiếp tục', RESUME_TEMPORARILY: 'tiếp tục tạm', DISCONTINUE: 'ngừng', EXTEND: 'gia hạn' }[command]} đơn #${p.id} (${p.drug}).`)
        }}
      />
    </div>
  )
}
