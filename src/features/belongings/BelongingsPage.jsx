import { useCallback, useEffect, useState } from 'react'
import { getResidents, getResidentsById, getResidentsByResidentIdBelongings } from '@/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DetailLayout } from '@/common/DetailLayout'
import { PageHeader } from '@/common/PageHeader'
import { ProblemAlert } from '@/common/ProblemAlert'
import { ResidentCombobox } from '@/common/ResidentCombobox'
import { StatusBadge } from '@/common/StatusBadge'
import { formatDateTime } from '@/common/dateTime'
import { usePermissions } from '@/common/permissions/permissions'
import { problemOf } from '@/common/problem'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { BelongingDetail } from './BelongingDetail'
import { EndingCondition } from './EndingCondition'
import { HeldBelongings } from './HeldBelongings'
import { InventoryChecks } from './InventoryChecks'
import { IntakeForm } from './IntakeForm'
import { RecipientConfirmations } from './RecipientConfirmations'
import { ReturnForm } from './ReturnForm'
import { amountText, holderLabel, statusLabel } from './belongingLabels'
import { useBelongingCatalogs } from './useBelongingCatalogs'

// Màn Đồ gửi (013; Phụ lục 27 dòng "Đồ gửi": Hành chính, Điều dưỡng thực hiện, Quản lý viện, Trưởng tầng xem). Chọn
// người cao tuổi (tìm qua GET /residents của 001), bảng đồ gửi theo api-013 GET /residents/{residentId}/belongings, bấm
// đồ mở khung chi tiết (DESIGN.md mục 5). Nút "Tiếp nhận đồ" mở form trong Sheet (T011).

// Demo 2026-11-26 (E): ô tìm theo tên hoặc mã hồ sơ, danh sách thả xuống hiện ngay khi gõ (ResidentCombobox) thay hàng
// nút liệt kê hết người cao tuổi
function ResidentPicker({ onPick, selectedId }) {
  const [state, setState] = useState({ status: 'loading', items: [] })

  useEffect(() => {
    let live = true
    getResidents({ query: {} })
      .then(({ data }) => live && setState({ status: 'ready', items: data.items ?? [] }))
      .catch((error) => live && setState({ status: 'error', items: [], problem: problemOf(error) }))
    return () => {
      live = false
    }
  }, [])

  return (
    <div className="flex w-full max-w-xl flex-col gap-3">
      <ResidentCombobox
        id="belongings-resident"
        label="Tìm người cao tuổi"
        options={state.items.map((r) => ({
          value: String(r.id),
          label: r.profileCode ? `${r.personalInfo.fullName} (${r.profileCode})` : r.personalInfo.fullName,
        }))}
        value={selectedId == null ? '' : String(selectedId)}
        loading={state.status === 'loading'}
        onChange={(next) => {
          const r = state.items.find((x) => String(x.id) === next)
          if (r) onPick(r)
        }}
      />
      {state.status === 'error' && <ProblemAlert problem={state.problem} />}
    </div>
  )
}

function BelongingTable({ items, catalogs, opened, onOpen }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Đồ gửi</TableHead>
          <TableHead>Loại</TableHead>
          <TableHead>Số lượng, số tiền</TableHead>
          <TableHead>Trạng thái</TableHead>
          <TableHead>Người giữ</TableHead>
          <TableHead>Vị trí</TableHead>
          <TableHead>Bàn giao gần nhất</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((b) => (
          <TableRow
            key={b.id}
            data-state={b.id === opened ? 'selected' : undefined}
            className="align-top data-[state=selected]:bg-accent"
          >
            <TableCell className="whitespace-normal">
              <Button
                variant="link"
                className="h-auto p-0 text-left"
                aria-label={`Chi tiết ${b.description}`}
                aria-pressed={b.id === opened}
                onClick={() => onOpen(b.id)}
              >
                {b.description}
              </Button>
            </TableCell>
            <TableCell>{catalogs.typeName(b.typeId)}</TableCell>
            <TableCell className="tabular-nums">{amountText(b)}</TableCell>
            <TableCell>
              <StatusBadge status={statusLabel(b.status)} />
            </TableCell>
            <TableCell>{holderLabel(b.holder)}</TableCell>
            <TableCell>{catalogs.locationName(b.storageLocationId)}</TableCell>
            <TableCell className="tabular-nums">{formatDateTime(b.lastHandoverAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

// Đồ còn trả được (data-model 013 mục 3: Trả từ Đang giữ, Đang được sử dụng, Hư hỏng)
const RETURNABLE = ['HELD', 'IN_USE', 'DAMAGED']

function ResidentBelongings({ resident, catalogs, role, initialBelongingId = null }) {
  const { can } = usePermissions()
  const [state, setState] = useState({ status: 'loading', items: [] })
  const [opened, setOpened] = useState(initialBelongingId)
  const [intake, setIntake] = useState(false)
  const [returning, setReturning] = useState(false)
  const [ending, setEnding] = useState(false)
  const [notice, setNotice] = useState('')
  const [confirmationsVersion, setConfirmationsVersion] = useState(0)

  const load = useCallback(async () => {
    try {
      const { data } = await getResidentsByResidentIdBelongings({ path: { residentId: resident.id } })
      setState({ status: 'ready', items: data })
    } catch (error) {
      setState({ status: 'error', items: [], problem: problemOf(error) })
    }
  }, [resident.id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tải đồ gửi khi chọn người cao tuổi
    load()
  }, [load])

  const name = resident.personalInfo.fullName
  const returnable = state.items.filter((b) => RETURNABLE.includes(b.status))
  return (
    <DetailLayout
      open={opened != null}
      detailKey={opened}
      onClose={() => setOpened(null)}
      label="Chi tiết đồ gửi"
      renderDetail={({ Title, Description }) => (
        <BelongingDetail
          key={opened}
          belongingId={opened}
          catalogs={catalogs}
          onChanged={load}
          Title={Title}
          Description={Description}
        />
      )}
    >
      <Card className="min-w-0">
        <CardContent className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="type-title">Đồ gửi của {name}</h2>
            <div className="flex flex-wrap gap-2">
              {can('BELONGINGS', 'UPDATE') && returnable.length > 0 && (
                <Button variant="outline" className="h-11" onClick={() => setReturning(true)}>
                  Trả đồ
                </Button>
              )}
              {can('BELONGINGS', 'CREATE') && (
                <Button className="h-11" onClick={() => setIntake(true)}>
                  Tiếp nhận đồ
                </Button>
              )}
            </div>
          </div>
          <div role="status" className="type-body-sm text-success-foreground">
            {notice}
          </div>
          {state.status === 'loading' && <Skeleton className="h-24 w-full" />}
          {state.status === 'error' && <ProblemAlert problem={state.problem} />}
          {state.status === 'ready' && state.items.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Chưa có đồ gửi</EmptyTitle>
                <EmptyDescription>Đồ gia đình gửi viện giữ hộ sẽ hiện ở đây sau khi được tiếp nhận.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {state.status === 'ready' && state.items.length > 0 && (
            <BelongingTable items={state.items} catalogs={catalogs} opened={opened} onOpen={setOpened} />
          )}
          {state.status === 'ready' && (
            <RecipientConfirmations
              residentId={resident.id}
              belongings={returnable}
              locationName={catalogs.locationName}
              role={role}
              refreshKey={confirmationsVersion}
            />
          )}
          {state.status === 'ready' && (
            <Button
              variant="outline"
              className="h-11 self-start"
              aria-pressed={ending}
              onClick={() => setEnding(!ending)}
            >
              Xem điều kiện kết thúc lưu trú
            </Button>
          )}
          {ending && <EndingCondition residentId={resident.id} catalogs={catalogs} />}
        </CardContent>
      </Card>
      <Sheet open={returning} onOpenChange={setReturning}>
        <SheetContent className="overflow-y-auto p-6 sm:max-w-lg [&_[data-slot=sheet-title]]:pr-8">
          <SheetHeader className="p-0">
            <SheetTitle className="type-title">Trả đồ gửi</SheetTitle>
            <SheetDescription>Của {name}</SheetDescription>
          </SheetHeader>
          <ReturnForm
            residentId={resident.id}
            residentName={name}
            role={role}
            belongings={returnable}
            isValuable={(b) => !!catalogs.typeOf(b.typeId)?.valuable}
            requiresConsent={(b) => !!catalogs.typeOf(b.typeId)?.requiresConsentForUse}
            onConfirmationCreated={() => setConfirmationsVersion((n) => n + 1)}
            locationName={catalogs.locationName}
            levels={catalogs.levels}
            onDone={(message) => {
              load()
              if (!message) return
              // Trả thành công: xác nhận người nhận khác đã dùng chuyển Đã dùng (FR-017); lần bị chặn không đổi xác nhận
              setConfirmationsVersion((n) => n + 1)
              setReturning(false)
              setNotice(message)
            }}
          />
        </SheetContent>
      </Sheet>
      <Sheet open={intake} onOpenChange={setIntake}>
        <SheetContent className="overflow-y-auto p-6 sm:max-w-lg [&_[data-slot=sheet-title]]:pr-8">
          <SheetHeader className="p-0">
            <SheetTitle className="type-title">Tiếp nhận đồ gửi</SheetTitle>
            <SheetDescription>Của {name}</SheetDescription>
          </SheetHeader>
          <IntakeForm
            residentId={resident.id}
            types={catalogs.types}
            levels={catalogs.levels}
            locations={catalogs.locations}
            onDone={() => {
              setIntake(false)
              setNotice('Đã tiếp nhận đồ gửi.')
              load()
            }}
          />
        </SheetContent>
      </Sheet>
    </DetailLayout>
  )
}

// Tab của màn (thanh lọc DESIGN.md 7.2 filter-bar); tab sau thêm theo task 013
const TABS = [
  { value: 'resident', label: 'Theo người cao tuổi' },
  { value: 'held', label: 'Nhân viên đang giữ' },
  // Phiếu kiểm kê: Hành chính lập, Quản lý viện xem (InventoryCheckService.READERS); hợp đồng không trả lệnh được phép
  { value: 'inventory', label: 'Kiểm kê', roles: ['OFFICE_STAFF', 'NURSING_HOME_MANAGER'] },
]

// residentId, belongingId, tab, checkId: mở từ thông báo (NotificationDetail; hoàn thiện BF-14, 2026-11-23)
export function BelongingsPage({ role, residentId, belongingId, tab: initialTab, checkId, staffId }) {
  const catalogs = useBelongingCatalogs()
  const [resident, setResident] = useState(null)
  const [tab, setTab] = useState(['inventory', 'held'].includes(initialTab) ? initialTab : 'resident')

  useEffect(() => {
    if (!residentId) return
    let alive = true
    getResidentsById({ path: { id: Number(residentId) } }).then(
      ({ data }) => alive && setResident(data),
      () => {},
    )
    return () => {
      alive = false
    }
  }, [residentId])

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Đồ gửi" subtitle="Tiếp nhận, bàn giao và trả đồ gia đình gửi viện giữ hộ.">
        <ToggleGroup variant="filter" className="flex-wrap" value={[tab]} onValueChange={(next) => next[0] && setTab(next[0])}>
          {TABS.filter((t) => !t.roles || t.roles.includes(role)).map((t) => (
            <ToggleGroupItem key={t.value} value={t.value}>
              {t.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {tab === 'resident' && <ResidentPicker onPick={setResident} selectedId={resident?.id} />}
      </PageHeader>
      {catalogs.status === 'error' && (
        <ProblemAlert
          problem={{
            title: 'Không tải được danh mục đồ gửi',
            detail: 'Tải lại trang để thử lại.',
            unmetConditions: [],
          }}
        />
      )}
      {tab === 'resident' && !resident && (
        <Card>
          <CardContent>
            <p className="text-muted-foreground">Tìm và chọn một người cao tuổi để xem đồ gửi.</p>
          </CardContent>
        </Card>
      )}
      {tab === 'resident' && resident && (
        <ResidentBelongings
          key={resident.id}
          resident={resident}
          catalogs={catalogs}
          role={role}
          initialBelongingId={Number(resident.id) === Number(residentId) && belongingId ? Number(belongingId) : null}
        />
      )}
      {tab === 'held' && <HeldBelongings catalogs={catalogs} initialStaffId={staffId ? Number(staffId) : null} />}
      {tab === 'inventory' && <InventoryChecks catalogs={catalogs} initialCheckId={checkId ? Number(checkId) : null} />}
    </div>
  )
}
