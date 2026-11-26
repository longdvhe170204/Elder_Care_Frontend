import { useCallback, useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { getReassessmentsDue, getResidents } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DetailLayout } from '@/common/DetailLayout'
import { PageHeader } from '@/common/PageHeader'
import { ProblemAlert } from '@/common/ProblemAlert'
import { ResidentAvatar } from '@/common/ResidentAvatar'
import { StatusBadge } from '@/common/StatusBadge'
import { formatDate, formatDateTime } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { cn } from '@/lib/utils'
import { CARE_LEVEL_LABELS, RESIDENCE_TYPE_LABELS } from '../assessments/assessmentLabels'
import { NewAdmissionSheet } from '../admissions/NewAdmissionSheet'
import { AdmissionTasksSheet } from './AdmissionTasksSheet'
import { ResidentDetail } from './ResidentDetail'
import { PROFILE_CREATORS, STATUS_LABELS } from './residentLabels'
import { useInitialAssessmentQueue } from './useInitialAssessmentQueue'

// Màn Người cao tuổi (001 T022, T066; DESIGN.md 5, 5.1, 6.7.0): một ô tìm (tham số q của GET /residents), thanh lọc
// trạng thái (tham số status), bảng chỉ có trường của Profile trong api-001; bấm tên mở hồ sơ trong khung chi tiết.
// Kết quả đã lọc theo phạm vi ở backend; vai trò không được xem nhận 403 và màn hiện lỗi đó (FR-007).
// Đánh giá lại (T066; US6; FR-041): cột Đánh giá lại lấy từ GET /reassessments/due, chỉ hiện khi có người cần; không có
// mục lọc riêng (chủ dự án bỏ 2026-11-26). Hợp đồng không trả số đếm theo trạng thái nên các mục lọc không có số.
// Đánh giá đầu vào (chủ dự án yêu cầu 2026-11-26): ở tab Đang tiếp nhận, Bác sĩ, Điều dưỡng có cột "Đánh giá đầu vào"
// (Chưa lập phiếu, Có phiếu nháp, Đã xác nhận; kèm trạng thái sức khỏe ban đầu); bấm dòng mở khung Việc tiếp nhận
// (AdmissionTasksSheet, chủ dự án duyệt 2026-11-26). Tính ở web, không thông báo (useInitialAssessmentQueue).

const STATUS_FILTERS = ['ADMISSION_IN_PROGRESS', 'IN_RESIDENCE', 'TEMPORARILY_ABSENT', 'HOSPITALIZED']
const ASSESSORS = ['DOCTOR', 'NURSING_STAFF']
const HEALTH_TEXT = {
  NONE: 'Chưa có sức khỏe ban đầu',
  DRAFT: 'Sức khỏe ban đầu: bản nháp',
  CONFIRMED: 'Sức khỏe ban đầu: đã xác nhận',
  UNKNOWN: '',
}

function InitialAssessmentCell({ entry }) {
  if (!entry) return null
  if (entry.confirmed) return <span className="type-body-sm text-muted-foreground">Đã xác nhận</span>
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="type-body-sm">{entry.hasDraft ? 'Có phiếu nháp' : 'Chưa lập phiếu'}</span>
      <span className="type-caption text-muted-foreground">{HEALTH_TEXT[entry.health]}</span>
    </div>
  )
}

function ReassessmentCell({ item }) {
  if (!item) return null
  return (
    <div className="flex flex-col items-start gap-1">
      {item.status === 'OVERDUE' ? (
        <StatusBadge status="Quá hạn" />
      ) : (
        <Badge variant="attention">Cần đánh giá lại</Badge>
      )}
      <span className="type-caption text-muted-foreground tabular-nums">
        {item.status === 'OVERDUE'
          ? `từ ${formatDateTime(item.overdueSince)}`
          : item.dueAt
            ? `Hạn ${formatDateTime(item.dueAt)}`
            : 'Hạn tính từ lúc Ghi nhận trở về'}
      </span>
    </div>
  )
}

// residentId: mở sẵn khung chi tiết của hồ sơ này (từ nút "Mở hồ sơ" khi tra căn cước ở màn khác)
export function ResidentListPage({ role, onNavigate = () => {}, residentId = null }) {
  const [text, setText] = useState('')
  const [applied, setApplied] = useState('')
  const [filter, setFilter] = useState('ALL')
  const [items, setItems] = useState(null)
  const [nextCursor, setNextCursor] = useState(null)
  const [failure, setFailure] = useState(null)
  const [due, setDue] = useState(null)
  const [selectedId, setSelectedId] = useState(residentId != null ? Number(residentId) : null)
  const [creating, setCreating] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [tasksFor, setTasksFor] = useState(null)
  const queue = useInitialAssessmentQueue(ASSESSORS.includes(role), reloadKey)

  const status = STATUS_FILTERS.includes(filter) ? filter : undefined
  const showInitial = !!queue && filter === 'ADMISSION_IN_PROGRESS'

  const load = useCallback(
    async (cursor) => {
      try {
        const { data } = await getResidents({ query: { q: applied || undefined, status, cursor } })
        setFailure(null)
        setItems((current) => (cursor && current ? [...current, ...data.items] : data.items))
        setNextCursor(data.nextCursor)
      } catch (error) {
        setItems([])
        setFailure(problemOf(error))
      }
    },
    [applied, status],
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nạp danh sách khi vào màn, đổi từ khóa, đổi bộ lọc hoặc vừa tạo hồ sơ
    load()
  }, [load, reloadKey])

  useEffect(() => {
    let cancelled = false
    getReassessmentsDue()
      .then(({ data }) => !cancelled && setDue(data))
      .catch(() => !cancelled && setDue(null))
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const dueById = new Map((due ?? []).map((d) => [d.residentId, d]))
  const queueById = new Map((queue ?? []).map((e) => [e.profile.id, e]))
  const rows = items
  const lastColumn = showInitial ? 'Đánh giá đầu vào' : due?.length > 0 ? 'Đánh giá lại' : null
  const open = (id) => (showInitial ? setTasksFor(id) : setSelectedId(id))

  function submit(event) {
    event.preventDefault()
    setApplied(text.trim())
  }

  return (
    <DetailLayout
      open={selectedId !== null}
      detailKey={selectedId}
      onClose={() => setSelectedId(null)}
      label="Hồ sơ người cao tuổi"
      renderDetail={(titles) => (
        <ResidentDetail
          key={selectedId}
          residentId={selectedId}
          {...titles}
          onChanged={() => setReloadKey((k) => k + 1)}
        />
      )}
    >
      <PageHeader
        title="Người cao tuổi"
        subtitle="Hồ sơ trong phạm vi bạn được xem"
        aside={
          PROFILE_CREATORS.includes(role) && (
            <Button className="h-11" onClick={() => setCreating(true)}>
              Tạo hồ sơ
            </Button>
          )
        }
      >
        <form role="search" onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
          <InputGroup className="h-11 bg-popover sm:max-w-sm">
            <InputGroupAddon>
              <Search aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Họ tên, mã hồ sơ hoặc số giấy tờ"
              aria-label="Tìm hồ sơ"
            />
          </InputGroup>
          <Button type="submit" variant="outline" className="h-11">
            Tìm
          </Button>
        </form>
        <ToggleGroup
          variant="filter"
          value={[filter]}
          onValueChange={(next) => next[0] && setFilter(next[0])}
          aria-label="Lọc hồ sơ"
        >
          <ToggleGroupItem value="ALL" className="h-11">
            Tất cả
          </ToggleGroupItem>
          {STATUS_FILTERS.map((s) => (
            <ToggleGroupItem key={s} value={s} className="h-11">
              {STATUS_LABELS[s]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </PageHeader>

      <ProblemAlert problem={failure} />

      <Card className="@container py-0">
        {rows?.length === 0 && !failure ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Không có hồ sơ khớp điều kiện</EmptyTitle>
              <EmptyDescription>Đổi từ khóa tìm, chọn "Tất cả" hoặc dùng nút "Tạo hồ sơ".</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          rows?.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-11 pl-4">Người cao tuổi</TableHead>
                  <TableHead className="hidden @4xl:table-cell">Ngày sinh</TableHead>
                  <TableHead className="hidden @xl:table-cell">Mức chăm sóc</TableHead>
                  <TableHead className="hidden @4xl:table-cell">Loại hình</TableHead>
                  <TableHead className={lastColumn ? undefined : 'pr-4'}>Trạng thái</TableHead>
                  {lastColumn && <TableHead className="hidden pr-4 @xl:table-cell">{lastColumn}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow
                    key={p.id}
                    onClick={() => open(p.id)}
                    data-state={p.id === selectedId ? 'selected' : undefined}
                    className="cursor-pointer data-[state=selected]:bg-accent"
                  >
                    <TableCell className="py-3 pl-4 whitespace-normal">
                      {/* Nút tên để mở hồ sơ bằng bàn phím; bấm chuột vào cả dòng cũng mở */}
                      <button
                        type="button"
                        aria-label={`${p.personalInfo.fullName}, ${p.profileCode}`}
                        aria-pressed={p.id === selectedId}
                        onClick={(e) => {
                          e.stopPropagation()
                          open(p.id)
                        }}
                        className="flex items-center gap-3 rounded-lg text-left"
                      >
                        <ResidentAvatar name={p.personalInfo.fullName} code={String(p.id)} />
                        <span className="flex flex-col">
                          <span className="type-label">{p.personalInfo.fullName}</span>
                          <span className="type-caption text-muted-foreground tabular-nums">{p.profileCode}</span>
                          {p.currentCareLevel && (
                            <span className="type-body-sm text-muted-foreground @xl:hidden">
                              {CARE_LEVEL_LABELS[p.currentCareLevel]}
                            </span>
                          )}
                        </span>
                      </button>
                    </TableCell>
                    <TableCell className="hidden tabular-nums @4xl:table-cell">
                      {formatDate(p.personalInfo.dateOfBirth)}
                    </TableCell>
                    <TableCell className="hidden @xl:table-cell">
                      {CARE_LEVEL_LABELS[p.currentCareLevel] ?? 'Chưa có'}
                    </TableCell>
                    <TableCell className="hidden whitespace-normal text-muted-foreground @4xl:table-cell">
                      {RESIDENCE_TYPE_LABELS[p.currentResidenceType] ?? 'Chưa có hợp đồng'}
                    </TableCell>
                    <TableCell className={cn('whitespace-normal', !lastColumn && 'pr-4')}>
                      <StatusBadge status={STATUS_LABELS[p.status] ?? p.status} />
                    </TableCell>
                    {lastColumn && (
                      <TableCell className="hidden pr-4 @xl:table-cell">
                        {showInitial ? (
                          <InitialAssessmentCell entry={queueById.get(p.id)} />
                        ) : (
                          <ReassessmentCell item={dueById.get(p.id)} />
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
        )}
      </Card>
      {nextCursor && (
        <Button variant="outline" className="h-11 self-start" onClick={() => load(nextCursor)}>
          Xem thêm
        </Button>
      )}

      {tasksFor !== null && (
        <AdmissionTasksSheet
          residentId={tasksFor}
          onClose={() => setTasksFor(null)}
          onOpenProfile={(id) => {
            setTasksFor(null)
            setSelectedId(id)
          }}
          onChanged={() => setReloadKey((k) => k + 1)}
        />
      )}

      {/* Hồ sơ mới luôn ở Đang tiếp nhận: tạo xong sang ngay lập đăng ký, rồi mở Hồ sơ tiếp nhận (chủ dự án yêu cầu 2026-11-18) */}
      {creating && (
        <NewAdmissionSheet
          startStage="create"
          onClose={() => setCreating(false)}
          onResidentCreated={() => setReloadKey((k) => k + 1)}
          onOpenProfile={(id) => {
            setCreating(false)
            setSelectedId(id)
          }}
          onDone={(_, application) => {
            setCreating(false)
            if (application?.id) onNavigate('admission-workspace', { id: application.id })
          }}
        />
      )}
    </DetailLayout>
  )
}
