import { useEffect, useState } from 'react'
import {
  getMenus,
  getMenusById,
  getMenusByIdPreSubmitInfo,
  postMenus,
  postMenusByIdByCommand,
  postMenusByIdDishSwaps,
  putMenusById,
} from '@/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ProblemAlert } from '@/common/ProblemAlert'
import { StatusBadge } from '@/common/StatusBadge'
import { formatDate, formatDateTime } from '@/common/dateTime'
import { Info, ReasonField, SELECT } from '../NutritionParts'
import { useCommand, useLoad } from '../useNutrition'
import {
  MENU_COMMAND,
  MENU_STATUS,
  addDays,
  cellDishes,
  label,
  menuCommands,
  mondayOf,
  weekDays,
  weekdayLabel,
} from '../nutritionView'

// Thực đơn tuần chung của viện (011 FR-024 → FR-031, BR-M08-08; Q-445): bếp lập nội dung ở Nháp (mỗi ngày, bữa một danh
// sách món), xem số suất dự kiến và số người theo dị ứng, gửi duyệt; Quản lý viện công bố hoặc trả lại. Sau công bố bếp
// đổi món có lý do. Không kiểm tra độ phủ, lặp món, dị ứng.

// Số suất dự kiến và số người cao tuổi theo loại dị ứng mỗi ngày, bữa (FR-025a): không tên, phòng, tầng.
function PlanningSheet({ menu, meals, onClose }) {
  const info = useLoad(
    () => getMenusByIdPreSubmitInfo({ path: { id: menu.id } }).then((r) => r.data),
    [menu.id],
  )
  const cell = (date, mealId) => (info.data ?? []).find((x) => x.date === date && x.mealId === mealId)
  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto p-6 sm:max-w-3xl">
        <SheetTitle className="type-title">{`Số suất và dị ứng tuần ${formatDate(menu.weekStart)}`}</SheetTitle>
        <SheetDescription className="type-body-sm text-muted-foreground">
          Số suất dự kiến theo dữ liệu hiện có (người cao tuổi, người thân ở lại, nhân viên có ca) và số người cao tuổi
          theo từng loại dị ứng; không có tên người. Bếp tự quyết cách nấu.
        </SheetDescription>
        <ProblemAlert problem={info.failure} />
        {info.data === null ? (
          !info.failure && <Skeleton className="mt-4 h-40 w-full" />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <Table aria-label="Số suất và dị ứng theo ngày, bữa">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Ngày</TableHead>
                  {meals.map((m) => (
                    <TableHead key={m.id}>{m.name}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {weekDays(menu.weekStart).map((date) => (
                  <TableRow key={date}>
                    <TableHead scope="row" className="whitespace-nowrap">
                      {weekdayLabel(date)}
                    </TableHead>
                    {meals.map((m) => {
                      const c = cell(date, m.id)
                      return (
                        <TableCell key={m.id} className="min-w-44 align-top whitespace-normal">
                          {!c ? (
                            <span className="type-caption text-muted-foreground">Bữa chưa đặt giờ</span>
                          ) : (
                            <div className="flex flex-col gap-1">
                              <span className="type-body-sm tabular-nums">
                                {`${c.residentPortions + c.familyPortions + c.staffPortions} suất`}
                              </span>
                              <span className="type-caption text-muted-foreground tabular-nums">
                                {`Người cao tuổi ${c.residentPortions}, người thân ${c.familyPortions}, nhân viên ${c.staffPortions}`}
                              </span>
                              {c.allergyCounts?.length > 0 && (
                                <ul className="type-caption">
                                  {c.allergyCounts.map((a) => (
                                    <li key={a.allergenId ?? 'other'}>{`${a.name}: ${a.residentCount}`}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" className="h-11" onClick={onClose}>
            Đóng
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function MenuContentSheet({ menu, etag, meals, dishes, editable, onClose, onSaved }) {
  const [rows, setRows] = useState(menu.content?.dishes ?? [])
  const { busy, failure, run } = useCommand()
  const days = weekDays(menu.weekStart)
  const suitable = dishes.filter((d) => d.status === 'ACTIVE')
  const nameOf = (id) => dishes.find((d) => d.id === id)?.name ?? `Món mã ${id}`

  function add(date, mealId, dishId) {
    if (!dishId) return
    setRows((r) => [...r, { date, mealId, dishId: Number(dishId) }])
  }
  function remove(row) {
    setRows((r) => r.filter((x) => x !== row))
  }
  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto p-6 sm:max-w-3xl">
        <SheetTitle className="type-title">{`Nội dung thực đơn tuần ${formatDate(menu.weekStart)}`}</SheetTitle>
        <SheetDescription className="type-body-sm text-muted-foreground">
          {editable
            ? 'Mỗi ô là các món của một bữa trong ngày, dùng chung cho cả viện. Chỉ chọn được món Hiệu lực.'
            : 'Chỉ xem.'}
        </SheetDescription>
        <div className="mt-4 overflow-x-auto">
          <Table aria-label="Món theo ngày và bữa">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Ngày</TableHead>
                {meals.map((m) => (
                  <TableHead key={m.id}>{m.name}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {days.map((date) => (
                <TableRow key={date}>
                  <TableHead scope="row" className="whitespace-nowrap">
                    {weekdayLabel(date)}
                  </TableHead>
                  {meals.map((m) => (
                    <TableCell key={m.id} className="min-w-44 align-top whitespace-normal">
                      <ul className="flex flex-col gap-2">
                        {cellDishes({ dishes: rows }, date, m.id).map((row, i) => (
                          <li key={i} className="flex flex-col gap-1">
                            <span className="type-body-sm">{nameOf(row.dishId)}</span>
                            {editable && (
                              <div className="flex flex-wrap gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  aria-label={`Bỏ ${nameOf(row.dishId)}, ${weekdayLabel(date)}, ${m.name}`}
                                  onClick={() => remove(row)}
                                >
                                  Bỏ
                                </Button>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                      {editable && (
                        <select
                          aria-label={`Thêm món ${weekdayLabel(date)}, ${m.name}`}
                          className="mt-2 h-8 w-full rounded-md border border-input bg-transparent px-2 type-caption"
                          value=""
                          onChange={(e) => add(date, m.id, e.target.value)}
                        >
                          <option value="">+ thêm món</option>
                          {suitable.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <ProblemAlert problem={failure} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="h-11" onClick={onClose}>
              Đóng
            </Button>
            {editable && (
              <Button
                className="h-11"
                disabled={busy}
                onClick={async () => {
                  if (
                    await run(putMenusById, {
                      path: { id: menu.id },
                      headers: { 'If-Match': etag },
                      body: { dishes: rows },
                    })
                  )
                    onSaved()
                }}
              >
                Lưu nội dung
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function DishSwapForm({ menu, meals, dishes, onClose, onDone }) {
  const [form, setForm] = useState({
    date: menu.weekStart,
    mealId: meals[0]?.id ?? '',
    oldDishId: '',
    newDishId: '',
    reason: '',
  })
  const [submitted, setSubmitted] = useState(false)
  const { busy, failure, run } = useCommand()
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const current = cellDishes(menu.content, form.date, Number(form.mealId))
  const nameOf = (id) => dishes.find((d) => d.id === id)?.name ?? `Món mã ${id}`
  const reasonError = submitted && !form.reason.trim() ? 'Nhập lý do đổi món' : null
  const pickError = submitted && !form.oldDishId && !form.newDishId ? 'Chọn món bỏ hoặc món mới' : null

  async function submit() {
    setSubmitted(true)
    if (reasonError || pickError || !form.reason.trim() || (!form.oldDishId && !form.newDishId)) return
    const body = {
      date: form.date,
      mealId: Number(form.mealId),
      reason: form.reason.trim(),
      ...(form.oldDishId && { oldDishId: Number(form.oldDishId) }),
      ...(form.newDishId && { newDishId: Number(form.newDishId) }),
    }
    const result = await run(postMenusByIdDishSwaps, { path: { id: menu.id }, body })
    if (result) onDone('Đã đổi món')
  }

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto p-6 sm:max-w-2xl">
        <SheetTitle className="type-title">Đổi món</SheetTitle>
        <SheetDescription className="type-body-sm text-muted-foreground">
          Thay, thêm hoặc bớt món của một bữa; bữa đã chốt suất thì tạo phát sinh tới bếp; Quản lý viện được báo (FR-031).
        </SheetDescription>
        <FieldGroup className="mt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="swap-date">Ngày</FieldLabel>
              <select
                id="swap-date"
                className={SELECT}
                value={form.date}
                onChange={(e) => set({ date: e.target.value, oldDishId: '' })}
              >
                {weekDays(menu.weekStart).map((d) => (
                  <option key={d} value={d}>
                    {weekdayLabel(d)}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="swap-meal">Bữa</FieldLabel>
              <select
                id="swap-meal"
                className={SELECT}
                value={form.mealId}
                onChange={(e) => set({ mealId: e.target.value, oldDishId: '' })}
              >
                {meals.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field data-invalid={!!pickError || undefined}>
            <FieldLabel htmlFor="swap-old">Món bỏ</FieldLabel>
            <select
              id="swap-old"
              className={SELECT}
              value={form.oldDishId}
              onChange={(e) => set({ oldDishId: e.target.value })}
            >
              <option value="">Không bỏ món nào</option>
              {current.map((r) => (
                <option key={r.dishId} value={r.dishId}>
                  {nameOf(r.dishId)}
                </option>
              ))}
            </select>
          </Field>
          <Field data-invalid={!!pickError || undefined}>
            <FieldLabel htmlFor="swap-new">Món mới</FieldLabel>
            <select
              id="swap-new"
              className={SELECT}
              value={form.newDishId}
              onChange={(e) => set({ newDishId: e.target.value })}
            >
              <option value="">Không thêm món</option>
              {dishes
                .filter((d) => d.status === 'ACTIVE')
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
            {pickError && <FieldError>{pickError}</FieldError>}
          </Field>
          <ReasonField
            id="swap-reason"
            value={form.reason}
            onChange={(reason) => set({ reason })}
            error={reasonError}
          />
        </FieldGroup>
        <div className="mt-4 flex flex-col gap-3">
          <ProblemAlert problem={failure} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="h-11" onClick={onClose}>
              Đóng
            </Button>
            <Button className="h-11" disabled={busy} onClick={submit}>
              Đổi món
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function MenuDetail({ summary, meals, dishes, kitchen, manager, onChanged, Title, Description }) {
  const detail = useLoad(() => getMenusById({ path: { id: summary.id } }), [summary.id, summary.version])
  const [sheet, setSheet] = useState(null)
  const [mode, setMode] = useState(null)
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const { busy, failure, setFailure, run } = useCommand()

  const menu = detail.data?.data
  const status = menu?.status ?? summary.status
  const commands = menuCommands({ status }, { kitchen, manager })
  const nameOf = (list) => (id) => list.find((x) => x.id === id)?.name ?? `mã ${id}`

  async function command(cmd) {
    setSubmitted(true)
    const body = {}
    if (cmd === 'cancel' || cmd === 'return') {
      if (!reason.trim()) return
      body.reason = reason.trim()
    }
    const result = await run(postMenusByIdByCommand, { path: { id: summary.id, command: cmd }, body })
    if (result) {
      setMode(null)
      setReason('')
      // Tải lại chi tiết: thực đơn có thể rời danh sách đang lọc (Chờ duyệt) nên khung không được mở lại theo danh sách
      detail.reload()
      onChanged(`${MENU_COMMAND[cmd].replace('…', '')}: xong`)
    }
  }

  function start(cmd) {
    setFailure(null)
    setSubmitted(false)
    if (cmd === 'cancel' || cmd === 'return') setMode(cmd)
    else command(cmd)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <StatusBadge status={label(MENU_STATUS, status)} />
        <Title className="type-title">{`Thực đơn tuần ${formatDate(summary.weekStart)}`}</Title>
        <Description className="type-body-sm text-muted-foreground">{`Từ ${formatDate(summary.weekStart)} tới ${formatDate(addDays(summary.weekStart, 6))}`}</Description>
      </div>
      <ProblemAlert problem={detail.failure} />
      {!menu ? (
        !detail.failure && <Skeleton className="h-20 w-full" />
      ) : (
        <div className="grid gap-3">
          <Info label="Số món đã xếp">{menu.content?.dishes?.length ?? 0}</Info>
          {menu.dishesToReplace?.length > 0 && (
            <Info label="Món cần thay (không còn Hiệu lực)">
              {menu.dishesToReplace.map((r) => nameOf(dishes)(r.dishId)).join(', ')}
            </Info>
          )}
          {menu.submittedAt && (
            <Info label="Gửi duyệt">{`${formatDateTime(menu.submittedAt)}${menu.submittedBy ? `, ${menu.submittedBy}` : ''}`}</Info>
          )}
          {menu.publishedAt && <Info label="Công bố">{formatDateTime(menu.publishedAt)}</Info>}
          {menu.returnReason && <Info label="Lý do trả lại">{menu.returnReason}</Info>}
          {menu.cancelReason && <Info label="Lý do hủy">{menu.cancelReason}</Info>}
          {menu.dishSwaps?.length > 0 && <Info label="Đã đổi món">{`${menu.dishSwaps.length} lần`}</Info>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="h-11" disabled={!menu} onClick={() => setSheet('content')}>
          {kitchen && status === 'DRAFT' ? 'Sửa nội dung' : 'Xem nội dung'}
        </Button>
        {(kitchen || manager) && status !== 'CANCELLED' && (
          <Button variant="outline" className="h-11" onClick={() => setSheet('planning')}>
            Số suất và dị ứng
          </Button>
        )}
        {kitchen && (status === 'PUBLISHED' || status === 'APPLIED') && (
          <Button variant="outline" className="h-11" onClick={() => setSheet('swap')}>
            Đổi món…
          </Button>
        )}
      </div>
      <ProblemAlert problem={failure} />
      {mode && (
        <div className="flex flex-col gap-3 border-t pt-4">
          {(mode === 'cancel' || mode === 'return') && (
            <ReasonField
              id="menu-reason"
              value={reason}
              onChange={setReason}
              error={submitted && !reason.trim() ? 'Nhập lý do' : null}
            />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="h-11" onClick={() => setMode(null)}>
              Thôi
            </Button>
            <Button
              variant={mode === 'cancel' ? 'destructive' : 'default'}
              className="h-11"
              disabled={busy}
              onClick={() => command(mode)}
            >
              {MENU_COMMAND[mode].replace('…', '')}
            </Button>
          </div>
        </div>
      )}
      {!mode && commands.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
          {commands.map((cmd) => (
            <Button
              key={cmd}
              variant={cmd === 'submit' || cmd === 'publish' ? 'default' : 'outline'}
              className="h-11"
              onClick={() => start(cmd)}
            >
              {MENU_COMMAND[cmd]}
            </Button>
          ))}
        </div>
      )}
      {sheet === 'content' && menu && (
        <MenuContentSheet
          menu={menu}
          etag={detail.data.etag}
          meals={meals}
          dishes={dishes}
          editable={kitchen && status === 'DRAFT'}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null)
            detail.reload()
            onChanged('Đã lưu nội dung thực đơn')
          }}
        />
      )}
      {sheet === 'planning' && <PlanningSheet menu={summary} meals={meals} onClose={() => setSheet(null)} />}
      {sheet === 'swap' && menu && (
        <DishSwapForm
          menu={menu}
          meals={meals}
          dishes={dishes}
          onClose={() => setSheet(null)}
          onDone={(message) => {
            setSheet(null)
            detail.reload()
            onChanged(message)
          }}
        />
      )}
    </div>
  )
}

function CreateMenuSheet({ weekStart, onClose, onDone }) {
  const [week, setWeek] = useState(weekStart)
  const [copyFrom, setCopyFrom] = useState('')
  const previous = useLoad(() => getMenus({ query: { week: addDays(week, -7) } }).then((r) => r.data), [week])
  const { busy, failure, run } = useCommand()
  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto p-6 sm:max-w-lg">
        <SheetTitle className="type-title">Tạo thực đơn tuần</SheetTitle>
        <SheetDescription className="type-body-sm text-muted-foreground">
          Thực đơn mới ở Nháp. Sao chép từ thực đơn tuần trước thì món không còn Hiệu lực được đánh dấu để thay.
        </SheetDescription>
        <FieldGroup className="mt-4">
          <Field>
            <FieldLabel htmlFor="menu-week">Tuần bắt đầu (thứ Hai)</FieldLabel>
            <Input
              id="menu-week"
              type="date"
              className="h-11"
              value={week}
              onChange={(e) => e.target.value && setWeek(mondayOf(e.target.value))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="menu-copy">Sao chép từ</FieldLabel>
            <select id="menu-copy" className={SELECT} value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
              <option value="">Không sao chép</option>
              {(previous.data ?? [])
                .filter((m) => m.status !== 'CANCELLED')
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {`Tuần ${formatDate(m.weekStart)}, ${label(MENU_STATUS, m.status)}`}
                  </option>
                ))}
            </select>
          </Field>
        </FieldGroup>
        <div className="mt-4 flex flex-col gap-3">
          <ProblemAlert problem={failure} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="h-11" onClick={onClose}>
              Đóng
            </Button>
            <Button
              className="h-11"
              disabled={busy}
              onClick={async () => {
                const body = { weekStart: week, ...(copyFrom && { copyFromId: Number(copyFrom) }) }
                if (await run(postMenus, { body })) onDone(week)
              }}
            >
              Tạo thực đơn
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function MenusTab({ today, meals, dishes, kitchen, manager, openedKey, open, announce }) {
  const [week, setWeek] = useState(mondayOf(today))
  // Quản lý viện mở mặc định danh sách thực đơn tuần được gửi tới (FR-029)
  const [pending, setPending] = useState(manager && !kitchen)
  const [creating, setCreating] = useState(false)
  const menus = useLoad(
    () =>
      getMenus({ query: pending ? { status: 'PENDING_PUBLICATION' } : { week } }).then((r) => r.data),
    [week, pending],
  )

  function changed(message) {
    announce(message)
    menus.reload()
  }

  function openMenu(m) {
    open(`menu-${m.id}`, 'Chi tiết thực đơn', (titles) => (
      <MenuDetail
        key={m.id}
        summary={m}
        meals={meals}
        dishes={dishes}
        kitchen={kitchen}
        manager={manager}
        onChanged={changed}
        {...titles}
      />
    ))
  }

  useEffect(() => {
    const m = menus.data?.find((x) => openedKey === `menu-${x.id}`)
    if (m) openMenu(m)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menus.data])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {manager && (
          <Button variant={pending ? 'default' : 'outline'} className="h-11" aria-pressed={pending} onClick={() => setPending(!pending)}>
            Chờ duyệt
          </Button>
        )}
        {!pending && (
          <>
            <Button variant="outline" className="h-11" onClick={() => setWeek(addDays(week, -7))}>
              Tuần trước
            </Button>
            <span className="type-label tabular-nums">{`Tuần ${formatDate(week)} → ${formatDate(addDays(week, 6))}`}</span>
            <Button variant="outline" className="h-11" onClick={() => setWeek(addDays(week, 7))}>
              Tuần sau
            </Button>
          </>
        )}
        {kitchen && (
          <Button className="h-11 sm:ml-auto" onClick={() => setCreating(true)}>
            Tạo thực đơn tuần
          </Button>
        )}
      </div>
      {creating && (
        <CreateMenuSheet
          weekStart={week}
          onClose={() => setCreating(false)}
          onDone={(w) => {
            setCreating(false)
            setPending(false)
            setWeek(w)
            changed('Đã tạo thực đơn Nháp')
          }}
        />
      )}
      <ProblemAlert problem={menus.failure} />
      {menus.data === null ? (
        !menus.failure && <Skeleton className="h-24 w-full" />
      ) : menus.data.length === 0 ? (
        <p className="type-body-sm text-muted-foreground">
          {pending
            ? 'Không có thực đơn nào chờ duyệt.'
            : 'Tuần này chưa có thực đơn. Nhân viên bếp tạo thực đơn tuần rồi gửi Quản lý viện duyệt.'}
        </p>
      ) : (
        <Card className="py-0">
          <Table aria-label="Thực đơn tuần">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Tuần</TableHead>
                <TableHead>Gửi duyệt</TableHead>
                <TableHead className="pr-4">Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {menus.data.map((m) => (
                <TableRow key={m.id} className={openedKey === `menu-${m.id}` ? 'bg-accent/40' : undefined}>
                  <TableCell className="pl-4">
                    <button
                      type="button"
                      className="text-left underline-offset-4 hover:underline"
                      aria-pressed={openedKey === `menu-${m.id}`}
                      onClick={() => openMenu(m)}
                    >
                      {`Thực đơn tuần ${formatDate(m.weekStart)}`}
                    </button>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {m.submittedAt ? `${formatDateTime(m.submittedAt)}${m.submittedBy ? `, ${m.submittedBy}` : ''}` : '—'}
                  </TableCell>
                  <TableCell className="pr-4">
                    <StatusBadge status={label(MENU_STATUS, m.status)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
