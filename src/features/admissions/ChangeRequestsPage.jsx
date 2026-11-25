import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Eye, FileSignature, FileText, Funnel, Plus, Search } from 'lucide-react'
import { getContracts, getResidencyChangeRequests, getResidencyChangeRequestsById, getResidentsById } from '@/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DetailLayout } from '@/common/DetailLayout'
import { PageHeader } from '@/common/PageHeader'
import { PermissionDeniedState } from '@/common/PageState'
import { ProblemAlert } from '@/common/ProblemAlert'
import { formatDate } from '@/common/dateTime'
import { usePermissions } from '@/common/permissions/permissions'
import { problemOf } from '@/common/problem'
import { cn } from '@/lib/utils'
import { CHANGE_TYPES, REQUEST_STATUS, labelOf, plain } from './admissionLabels'
import { ChangeRequestSheet, ChangeRequestView, ConfirmationSheet } from './ChangeParts'
import { CHANGE_TYPE_ICONS, CHANGE_TYPE_TONES } from './changeTypeIcons'
import { StatusPill } from './RequestStatusPill'
import { confirmationState, displayStatus } from './changeRequestRules'

// Yêu cầu thay đổi lưu trú (004 T047; US5, FR-037 → FR-047): bảng yêu cầu lọc theo trạng thái (GET
// /residency-change-requests, "Đổi api" 004 A duyệt 2026-11-07), chọn dòng để xem, sửa ở Nháp, Hành chính xác nhận với người
// đại diện rồi gửi duyệt ngay ở đây (api-000 submit); duyệt dùng màn Yêu cầu phê duyệt. Mã yêu cầu là approvalRequestId.

// Bộ lọc "Chờ ký": yêu cầu Đã duyệt mà phụ lục chưa có bản ký (FR-043d), để Hành chính làm theo danh sách (W10)
const awaitingSignature = (r) => r.status === 'APPROVED' && r.addendum?.status === 'PENDING_SIGNATURE'
// Mỗi trang 10 yêu cầu; ô tìm khớp cả họ tên người cao tuổi (không phân biệt dấu, hoa thường)
const PAGE_SIZE = 10

const FILTERS = [
  ['DRAFT', 'Nháp', (r) => r.status === 'DRAFT'],
  ['PENDING_APPROVAL', 'Chờ duyệt', (r) => r.status === 'PENDING_APPROVAL'],
  ['PENDING_SIGNATURE', 'Chờ ký', awaitingSignature],
  ['APPROVED', 'Đã duyệt', (r) => r.status === 'APPROVED' && !awaitingSignature(r)],
  ['DONE', 'Đã xong', (r) => ['APPLIED', 'APPLY_FAILED', 'REJECTED', 'CANCELLED', 'SUPERSEDED'].includes(r.status)],
]

const STATUS_CARD_CONFIG = {
  DRAFT: {
    hint: 'Đang chỉnh sửa',
    dot: 'bg-blue-600',
  },
  PENDING_APPROVAL: {
    hint: 'Cần xét duyệt',
    dot: 'bg-amber-500',
  },
  PENDING_SIGNATURE: {
    hint: 'Cần ký phụ lục',
    dot: 'bg-purple-600',
  },
  APPROVED: {
    hint: 'Chờ có hiệu lực',
    dot: 'bg-emerald-600',
  },
  DONE: {
    hint: 'Hoàn tất / đóng',
    dot: 'bg-teal-600',
  },
}

export function ChangeRequestsPage({ id: initialId, onNavigate = () => {} } = {}) {
  const { can } = usePermissions()
  const [filter, setFilter] = useState('DRAFT')
  const [requests, setRequests] = useState(null)
  const [shown, setShown] = useState(null)
  const [failure, setFailure] = useState(null)
  const [sheet, setSheet] = useState(null)
  const [confirming, setConfirming] = useState(null)
  const [announcement, setAnnouncement] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [dateFilter, setDateFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState([])
  const [filterOpen, setFilterOpen] = useState(false)
  // Họ tên người cao tuổi và số hợp đồng ghi ở dòng danh sách; không tra được (không đủ quyền) thì ghi mã yêu cầu
  const [residentNames, setResidentNames] = useState({})
  const [contractNumbers, setContractNumbers] = useState({})

  const load = useCallback(
    () =>
      getResidencyChangeRequests({ query: {} })
        .then(({ data }) => {
          setRequests(data)
          setFailure(null)
        })
        .catch((e) => {
          setRequests([])
          setFailure(problemOf(e))
        }),
    [],
  )

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!requests?.length) return
    let live = true
    getContracts({ query: {} })
      .then(({ data }) => live && setContractNumbers(Object.fromEntries(data.map((c) => [c.id, c.contractNumber]))))
      .catch(() => {})
    const residentIds = [...new Set(requests.map((r) => r.residentId))]
    Promise.all(
      residentIds.map((id) =>
        getResidentsById({ path: { id } })
          .then(({ data }) => [id, data.personalInfo?.fullName])
          .catch(() => null),
      ),
    ).then((entries) => live && setResidentNames(Object.fromEntries(entries.filter((e) => e?.[1]))))
    return () => {
      live = false
    }
  }, [requests])

  // Mở thẳng yêu cầu từ thông báo (#residency-changes?id=…, W12)
  useEffect(() => {
    if (initialId) open(initialId)
  }, [initialId])

  function open(id) {
    setFailure(null)
    return getResidencyChangeRequestsById({ path: { id } })
      .then(({ data, etag }) => setShown({ request: data, etag }))
      .catch((e) => {
        setShown(null)
        setFailure(problemOf(e))
      })
  }

  function changed(message, id) {
    setAnnouncement(message)
    load()
    if (id) open(id)
  }

  if (failure?.status === 403) return <PermissionDeniedState label="Yêu cầu điều chỉnh hợp đồng" />

  const matcherOf = (key) => FILTERS.find(([k]) => k === key)[2]
  // Ô tìm khớp họ tên người cao tuổi, mã yêu cầu hoặc mã hợp đồng; bộ lọc theo loại thay đổi và ngày hiệu lực (chỉ lọc trên danh sách đã tải)
  const term = query.trim()
  const plainTerm = plain(term)
  const rows = (requests ?? [])
    .filter(matcherOf(filter))
    .filter(
      (r) =>
        !term ||
        `${r.approvalRequestId} ${r.contractId}`.includes(term) ||
        plain(residentNames[r.residentId]).includes(plainTerm),
    )
    .filter((r) => typeFilter.length === 0 || r.changeTypes.some((t) => typeFilter.includes(t)))
    .filter((r) => !dateFilter || r.requestedEffectiveDate === dateFilter)
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const from = current * PAGE_SIZE
  const pageRows = rows.slice(from, from + PAGE_SIZE)
  const openedId = shown?.request.approvalRequestId
  const toggleTypeFilter = (code) =>
    (setPage(0), setTypeFilter((t) => (t.includes(code) ? t.filter((x) => x !== code) : [...t, code])))

  return (
    <DetailLayout
      open={!!shown}
      detailKey={openedId}
      onClose={() => setShown(null)}
      label="Chi tiết yêu cầu điều chỉnh hợp đồng"
      panelGridClassName="grid-cols-[minmax(0,1fr)_520px]"
      sheetClassName="sm:max-w-[520px]"
      renderDetail={(titles) =>
        shown && (
          <ChangeRequestView
            key={`${shown.request.approvalRequestId}-${shown.etag}`}
            request={shown.request}
            etag={shown.etag}
            residentName={residentNames[shown.request.residentId]}
            contractNumber={contractNumbers[shown.request.contractId]}
            canUpdate={can('RESIDENCY_CHANGE_REQUEST', 'UPDATE')}
            canConfirm={can('ADMISSION_CONTRACT_DEPOSIT', 'VIEW')}
            canApprove={can('RESIDENCY_CHANGE_REQUEST', 'APPROVE')}
            canRecordOpinion={can('RESIDENCY_CHANGE_REQUEST', 'CREATE') || can('RESIDENCY_CHANGE_REQUEST', 'UPDATE')}
            onPrint={(r) => onNavigate('addendum-print', { id: r.approvalRequestId })}
            onEdit={(request) => setSheet({ request, etag: shown.etag })}
            onConfirm={(request) => setConfirming({ request, etag: shown.etag })}
            onReload={() => open(shown.request.approvalRequestId)}
            onSubmitted={changed}
            {...titles}
          />
        )
      }
    >
      <PageHeader
        icon={FileSignature}
        title="Điều chỉnh hợp đồng"
        subtitle="Đổi loại lưu trú, mức chăm sóc, dịch vụ, thời hạn, giường hoặc lịch đến của hợp đồng đang hiệu lực."
      />
      {sheet && (
        <ChangeRequestSheet
          request={sheet.request}
          etag={sheet.etag}
          onClose={() => setSheet(null)}
          onDone={(message, id) => {
            setSheet(null)
            changed(message, id)
          }}
        />
      )}
      {confirming && (
        <ConfirmationSheet
          request={confirming.request}
          etag={confirming.etag}
          onClose={() => setConfirming(null)}
          onDone={(message, id) => {
            setConfirming(null)
            changed(message, id)
          }}
        />
      )}
      <ToggleGroup
        size="lg"
        value={[filter]}
        onValueChange={(n) => n[0] && (setPage(0), setFilter(n[0]))}
        aria-label="Lọc yêu cầu theo trạng thái"
        className="w-full grid grid-cols-2 sm:grid-cols-5 gap-3 border-none p-0 overflow-visible"
      >
        {FILTERS.map(([key, label, matches]) => {
          const count = (requests ?? []).filter(matches).length
          const isSelected = key === filter
          const cfg = STATUS_CARD_CONFIG[key]
          return (
            <ToggleGroupItem
              key={key}
              value={key}
              variant="default"
              className={cn(
                'relative flex flex-col items-start justify-between h-auto p-4 !rounded-2xl border text-left transition-all duration-200 min-h-[114px] bg-card overflow-hidden shadow-2xs hover:shadow-sm focus-visible:ring-2 focus-visible:ring-primary',
                isSelected
                  ? 'border-2 border-blue-600 bg-blue-50/20 shadow-xs'
                  : 'border-border/80 hover:border-border',
              )}
            >
              {/* Hàng 1: Chấm tròn trạng thái + Tên trạng thái */}
              <div className="flex w-full items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn('size-2 rounded-full shrink-0', cfg.dot)}
                />
                <span className={cn('text-xs font-semibold text-slate-700 truncate', isSelected && 'font-bold text-slate-900')}>
                  {`${label} (${count})`}
                </span>
              </div>

              {/* Hàng 2: Số lượng to rõ */}
              <span className={cn('text-3xl font-extrabold tracking-tight mt-1 tabular-nums', isSelected ? 'text-slate-900' : 'text-slate-600')}>
                {count}
              </span>

              {/* Hàng 3: Gợi ý trạng thái */}
              <span className="text-[11px] font-normal text-muted-foreground mt-0.5">
                {cfg.hint}
              </span>

              {/* Thanh gờ chỉ thị trạng thái khi được chọn (Active Indicator bo tròn) */}
              {isSelected && (
                <div
                  aria-hidden="true"
                  className="absolute bottom-1.5 left-4 right-4 h-1 rounded-full bg-blue-600"
                />
              )}
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>
      <p role="status" className="empty:hidden rounded-xl border border-primary/20 bg-accent px-4 py-2.5 type-body-sm text-accent-foreground shadow-2xs">
        {announcement}
      </p>
      <ProblemAlert problem={failure} />
      <Card className="gap-0 overflow-hidden py-0 shadow-sm ring-1 ring-border/80 [&_svg]:stroke-[2.5]">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-60 flex-1 md:max-w-sm">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary"
            />
            <Input
              type="search"
              className="h-11 rounded-xl pl-9 bg-card border-border/80 shadow-2xs"
              placeholder="Tìm theo tên người cao tuổi, mã yêu cầu, mã hợp đồng..."
              aria-label="Tìm theo tên người cao tuổi, mã yêu cầu, mã hợp đồng"
              value={query}
              onChange={(e) => (setPage(0), setQuery(e.target.value))}
            />
          </div>
          <Button
            variant="outline"
            className="h-11 px-4 rounded-xl border-border/80 shadow-2xs hover:bg-accent"
            aria-expanded={filterOpen}
            onClick={() => setFilterOpen((open) => !open)}
          >
            <Funnel aria-hidden />
            Lọc
            {typeFilter.length > 0 && ` (${typeFilter.length})`}
          </Button>
          <Input
            type="date"
            className="h-11 w-44 rounded-xl border-border/80 bg-card shadow-2xs"
            aria-label="Ngày hiệu lực"
            value={dateFilter}
            onChange={(e) => (setPage(0), setDateFilter(e.target.value))}
          />
          {can('RESIDENCY_CHANGE_REQUEST', 'CREATE') && (
            <Button
              className="ml-auto h-11 px-5 rounded-xl font-semibold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              onClick={() => setSheet({})}
            >
              <Plus aria-hidden />
              Lập yêu cầu điều chỉnh
            </Button>
          )}
        </div>
        {filterOpen && (
          <div role="group" aria-label="Lọc theo loại thay đổi" className="flex flex-wrap gap-2 px-4 pb-4">
            {CHANGE_TYPES.map(([code, text]) => {
              const Icon = CHANGE_TYPE_ICONS[code]
              return (
                <Button
                  key={code}
                  variant={typeFilter.includes(code) ? 'tonal' : 'outline'}
                  className="h-10 rounded-lg shadow-2xs"
                  aria-pressed={typeFilter.includes(code)}
                  onClick={() => toggleTypeFilter(code)}
                >
                  <Icon aria-hidden />
                  {text}
                </Button>
              )
            })}
          </div>
        )}
        {requests === null ? (
          <Skeleton className="m-4 h-24" />
        ) : rows.length === 0 ? (
          !failure && (
            <p className="border-t p-4 type-body-sm text-muted-foreground">Không có yêu cầu nào trong nhóm này.</p>
          )
        ) : (
          <Table aria-label="Yêu cầu điều chỉnh hợp đồng">
            <TableHeader className="bg-[#24496F] text-white border-b border-border/80 [&_th]:text-white [&_th]:font-bold [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wider">
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="w-14 pl-4 text-center text-white">#</TableHead>
                <TableHead className="text-white">Yêu cầu</TableHead>
                <TableHead className="text-white">Thay đổi</TableHead>
                <TableHead className="text-white">Ngày hiệu lực</TableHead>
                <TableHead className="text-white">Số phụ lục</TableHead>
                <TableHead className="text-white">Trạng thái</TableHead>
                <TableHead className="w-16 pr-4 text-center text-white">
                  <span className="sr-only">Xem chi tiết</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((r, i) => {
                const status = displayStatus(r, REQUEST_STATUS)
                const confirmation = r.status === 'DRAFT' ? confirmationState(r) : null
                const residentName = residentNames[r.residentId]
                const contractNumber = contractNumbers[r.contractId]
                return (
                  <TableRow
                    key={r.approvalRequestId}
                    className={
                      r.approvalRequestId === openedId
                        ? 'bg-accent/80 hover:bg-accent shadow-[inset_4px_0_0_var(--primary)] font-medium transition-colors'
                        : 'hover:bg-accent/40 transition-colors'
                    }
                  >
                    <TableCell className="pl-4 text-center tabular-nums text-muted-foreground">{from + i + 1}</TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground font-bold text-xs ring-1 ring-border">
                          {(residentName ?? String(r.approvalRequestId)).slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <button
                            type="button"
                            className="text-left font-semibold text-primary underline underline-offset-4 transition-colors hover:text-accent-foreground"
                            aria-pressed={r.approvalRequestId === openedId}
                            onClick={() => open(r.approvalRequestId)}
                          >
                            {residentName ?? `Yêu cầu mã ${r.approvalRequestId}`}
                          </button>
                          <span className="block type-caption text-muted-foreground mt-0.5">
                            {residentName
                              ? contractNumber
                                ? `${contractNumber}, yêu cầu mã ${r.approvalRequestId}`
                                : `Yêu cầu mã ${r.approvalRequestId}`
                              : (contractNumber ?? `Hợp đồng mã ${r.contractId}`)}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-col gap-1">
                        {r.changeTypes.map((t) => {
                          const Icon = CHANGE_TYPE_ICONS[t]
                          return (
                            <span key={t} className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-2 py-0.5 text-xs font-medium">
                              {Icon && <Icon aria-hidden className={`size-3.5 shrink-0 ${CHANGE_TYPE_TONES[t]}`} />}
                              {labelOf(CHANGE_TYPES, t)}
                            </span>
                          )
                        })}
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      <span className="flex items-center gap-1.5 text-foreground font-medium">
                        <CalendarDays aria-hidden className="size-4 text-primary" />
                        {formatDate(r.requestedEffectiveDate)}
                      </span>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {r.addendum?.addendumNo ? (
                        <span className="flex items-center gap-1.5 font-medium">
                          <FileText aria-hidden className="size-4 text-primary" />
                          {String(r.addendum.addendumNo).padStart(2, '0')}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1 py-1">
                        <StatusPill request={r} text={status.text} />
                        {confirmation && (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1.5 text-xs font-medium leading-tight',
                              confirmation.done
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : confirmation.attention
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-amber-800 dark:text-amber-400',
                            )}
                          >
                            <span
                              className={cn(
                                'size-2 rounded-full shrink-0',
                                confirmation.done
                                  ? 'bg-emerald-600'
                                  : confirmation.attention
                                  ? 'bg-red-600'
                                  : 'bg-amber-600',
                              )}
                              aria-hidden="true"
                            />
                            {confirmation.text}
                          </span>
                        )}
                        {status.days !== null && (
                          <span
                            className={`block type-caption ${status.overdue ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}
                          >
                            {`${status.days} ngày từ lúc duyệt`}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="pr-4 text-center">
                      <Button
                        variant={r.approvalRequestId === openedId ? 'default' : 'outline'}
                        size="icon"
                        className={cn(
                          'size-9 rounded-xl transition-all duration-200 shadow-2xs mx-auto',
                          r.approvalRequestId === openedId
                            ? 'bg-[#24496F] text-white hover:bg-[#1B365D] shadow-sm'
                            : 'border-border/80 text-muted-foreground hover:border-[#24496F] hover:bg-[#24496F]/10 hover:text-[#24496F]',
                        )}
                        aria-label={`Xem yêu cầu mã ${r.approvalRequestId}`}
                        onClick={() => open(r.approvalRequestId)}
                      >
                        <Eye aria-hidden className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
        {pages > 1 && (
          <nav
            aria-label="Phân trang yêu cầu điều chỉnh hợp đồng"
            className="flex flex-wrap items-center justify-between gap-3 border-t p-4"
          >
            <span className="type-caption tabular-nums text-muted-foreground">
              {from + 1}–{Math.min(from + PAGE_SIZE, rows.length)} trên {rows.length} yêu cầu
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="h-11" disabled={current === 0} onClick={() => setPage(current - 1)}>
                Trước
              </Button>
              <span className="type-caption tabular-nums">
                Trang {current + 1} / {pages}
              </span>
              <Button
                variant="outline"
                className="h-11"
                disabled={current >= pages - 1}
                onClick={() => setPage(current + 1)}
              >
                Sau
              </Button>
            </div>
          </nav>
        )}
      </Card>
    </DetailLayout>
  )
}
