import { useEffect, useState } from 'react'
import {
  getMealSlips,
  postMealSlipsByIdByCommand,
  postHeldPortionsByIdDiscard,
  postHeldPortionsByIdServe,
  postSupplementaryPortionsByIdByCommand,
} from '@/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ProblemAlert } from '@/common/ProblemAlert'
import { StatusBadge } from '@/common/StatusBadge'
import { formatDateTime } from '@/common/dateTime'
import { Info, ReasonField, SELECT } from '../NutritionParts'
import { useCommand, useLoad } from '../useNutrition'
import {
  CLOSING_FLAG,
  HELD_STATUS,
  RESOLUTION,
  SLIP_COMMAND,
  SLIP_STATUS,
  label,
  slipCommands,
  slipGroupName,
} from '../nutritionView'

// Phiếu bữa ăn (011 FR-044 → FR-048b, BR-M08-09 → 12; Q-445): mỗi tầng/khu và phiếu nhân viên ghi các món của bữa và
// tổng suất, không có tên, dị ứng (SC-008). Bếp chuẩn bị, giao; người nhận tại tầng nhận, báo sai lệch, xử lý suất giữ.
// Khi phục vụ, nhân viên đối chiếu dị ứng, chế độ ăn trong hồ sơ (BR-M08-14). Nút theo trạng thái và quyền.

// Suất giữ có tên của người chưa trở về đúng dự kiến (FR-040a): người nhận tại tầng phục vụ hoặc hủy bỏ.
function HeldRow({ portion, can, onChanged }) {
  const { busy, failure, run } = useCommand()
  async function simple(call, message) {
    if (await run(call, { path: { id: portion.id } })) onChanged(message)
  }
  return (
    <li className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="type-label">{portion.fullName}</span>
        <StatusBadge status={label(HELD_STATUS, portion.status)} />
      </div>
      <ProblemAlert problem={failure} />
      {can.receiver && portion.status === 'HELD' && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => simple(postHeldPortionsByIdServe, `Đã phục vụ suất giữ của ${portion.fullName}`)}
          >
            Phục vụ suất giữ
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => simple(postHeldPortionsByIdDiscard, `Đã hủy suất giữ của ${portion.fullName}`)}
          >
            Hủy suất giữ
          </Button>
        </div>
      )}
    </li>
  )
}

function SlipDetail({ slip, floors, can, onChanged, Title, Description }) {
  const [mode, setMode] = useState(null)
  const [content, setContent] = useState('')
  const [resolution, setResolution] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const { busy, failure, setFailure, run } = useCommand()
  const commands = slipCommands(slip, can)

  async function command(cmd) {
    setSubmitted(true)
    let body = {}
    if (cmd === 'report-discrepancy') {
      if (!content.trim()) return
      body = { content: content.trim() }
    }
    if (cmd === 'resolve-discrepancy') {
      if (!resolution) return
      body = { resolution, ...(content.trim() && { description: content.trim() }) }
    }
    if (await run(postMealSlipsByIdByCommand, { path: { id: slip.id, command: cmd }, body })) {
      setMode(null)
      setContent('')
      onChanged(`${SLIP_COMMAND[cmd].replace('…', '')}: xong`)
    }
  }

  function start(cmd) {
    setFailure(null)
    setSubmitted(false)
    if (cmd === 'report-discrepancy' || cmd === 'resolve-discrepancy') setMode(cmd)
    else command(cmd)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <StatusBadge status={label(SLIP_STATUS, slip.status)} />
        <Title className="type-title">{`Phiếu ${slip.meal}, ${slipGroupName(slip, floors)}`}</Title>
        <Description className="type-body-sm text-muted-foreground">
          {(slip.flags ?? []).map((f) => label(CLOSING_FLAG, f)).join(', ') ||
            (slip.group === 'STAFF' ? 'Suất của Quản lý viện, nhân viên trong ca' : 'Phiếu bữa ăn của tầng/khu')}
        </Description>
      </div>
      <div className="grid gap-3">
        <Info label="Các món">{(slip.dishes ?? []).join(', ') || 'Chưa có thực đơn công bố'}</Info>
        <Info label="Tổng suất">{slip.portionCount}</Info>
        {slip.heldPortionCount > 0 && <Info label="Suất giữ">{slip.heldPortionCount}</Info>}
      </div>
      {(slip.heldPortions ?? []).length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby={`slip-held-${slip.id}`}>
          <h3 id={`slip-held-${slip.id}`} className="type-card-title">
            Suất giữ
          </h3>
          <ul className="flex flex-col gap-2">
            {slip.heldPortions.map((p) => (
              <HeldRow key={p.id} portion={p} can={can} onChanged={onChanged} />
            ))}
          </ul>
        </section>
      )}
      {(slip.supplementaryPortions ?? []).length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby={`slip-extra-${slip.id}`}>
          <h3 id={`slip-extra-${slip.id}`} className="type-card-title">
            Phần bổ sung
          </h3>
          <ul className="flex flex-col gap-2">
            {slip.supplementaryPortions.map((s) => (
              <Supplement key={s.id} supplement={s} can={can} onChanged={onChanged} />
            ))}
          </ul>
        </section>
      )}
      <ProblemAlert problem={failure} />
      {mode && (
        <div className="flex flex-col gap-3 border-t pt-4">
          {mode === 'resolve-discrepancy' && (
            <Field data-invalid={(submitted && !resolution) || undefined}>
              <FieldLabel>Cách xử lý</FieldLabel>
              <ToggleGroup
                variant="outline"
                value={resolution ? [resolution] : []}
                onValueChange={(n) => n[0] && setResolution(n[0])}
                aria-label="Cách xử lý sai lệch"
              >
                {Object.entries(RESOLUTION).map(([code, text]) => (
                  <ToggleGroupItem key={code} value={code} className="h-11 px-4">
                    {text}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {submitted && !resolution && <FieldError>Chọn cách xử lý</FieldError>}
            </Field>
          )}
          <ReasonField
            id={`slip-content-${slip.id}`}
            label={mode === 'report-discrepancy' ? 'Nội dung sai lệch' : 'Mô tả'}
            value={content}
            onChange={setContent}
            error={mode === 'report-discrepancy' && submitted && !content.trim() ? 'Nhập nội dung sai lệch' : null}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="h-11" onClick={() => setMode(null)}>
              Thôi
            </Button>
            <Button className="h-11" disabled={busy} onClick={() => command(mode)}>
              {SLIP_COMMAND[mode].replace('…', '')}
            </Button>
          </div>
        </div>
      )}
      {!mode && commands.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
          {commands.map((cmd) => (
            <Button
              key={cmd}
              variant={cmd === 'deliver' || cmd === 'receive' ? 'default' : 'outline'}
              className="h-11"
              disabled={busy}
              onClick={() => start(cmd)}
            >
              {SLIP_COMMAND[cmd]}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

function Supplement({ supplement, can, onChanged }) {
  const [reporting, setReporting] = useState(false)
  const [content, setContent] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const { busy, failure, run } = useCommand()
  async function send(command, body, message) {
    if (await run(postSupplementaryPortionsByIdByCommand, { path: { id: supplement.id, command }, body }))
      onChanged(message)
  }
  return (
    <li className="flex flex-col gap-2 rounded-md border p-3">
      <span className="type-body-sm">
        {`${supplement.portionCount} suất`}
        {supplement.deliveredAt ? `, giao ${formatDateTime(supplement.deliveredAt)}` : ', chưa giao'}
        {supplement.receivedAt ? `, nhận ${formatDateTime(supplement.receivedAt)}` : ''}
      </span>
      <ProblemAlert problem={failure} />
      {reporting && (
        <ReasonField
          id={`supplement-content-${supplement.id}`}
          label="Nội dung sai lệch"
          value={content}
          onChange={setContent}
          error={submitted && !content.trim() ? 'Nhập nội dung sai lệch' : null}
        />
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {can.kitchen && !supplement.deliveredAt && (
          <Button size="sm" disabled={busy} onClick={() => send('deliver', {}, 'Đã giao phần bổ sung')}>
            Giao phần bổ sung
          </Button>
        )}
        {can.receiver && supplement.deliveredAt && !supplement.receivedAt && !reporting && (
          <>
            <Button size="sm" disabled={busy} onClick={() => send('receive', {}, 'Đã nhận phần bổ sung')}>
              Nhận phần bổ sung
            </Button>
            <Button variant="outline" size="sm" onClick={() => setReporting(true)}>
              Báo sai lệch…
            </Button>
          </>
        )}
        {reporting && (
          <>
            <Button variant="ghost" size="sm" onClick={() => setReporting(false)}>
              Thôi
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                setSubmitted(true)
                if (content.trim())
                  send('report-discrepancy', { content: content.trim() }, 'Đã báo sai lệch phần bổ sung')
              }}
            >
              Báo sai lệch
            </Button>
          </>
        )}
      </div>
    </li>
  )
}

export function SlipsTab({ meals, floors, can, openedKey, open, announce }) {
  const closed = meals.filter((m) => m.closed)
  const [dailyMealId, setDailyMealId] = useState(closed[0]?.dailyMealId ?? null)
  const selected = closed.some((m) => m.dailyMealId === dailyMealId) ? dailyMealId : (closed[0]?.dailyMealId ?? null)
  const slips = useLoad(
    () => (selected ? getMealSlips({ query: { dailyMealId: selected } }).then((r) => r.data) : Promise.resolve([])),
    [selected],
  )

  function changed(message) {
    announce(message)
    slips.reload()
  }

  function openSlip(s) {
    open(`slip-${s.id}`, 'Chi tiết phiếu', (titles) => (
      <SlipDetail
        key={s.id}
        slip={s}
        floors={floors}
        can={can}
        onChanged={changed}
        {...titles}
      />
    ))
  }

  useEffect(() => {
    const s = slips.data?.find((x) => openedKey === `slip-${x.id}`)
    if (s) openSlip(s)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slips.data])

  if (closed.length === 0)
    return (
      <p className="type-body-sm text-muted-foreground">
        Chưa có bữa nào được chốt trong ngày; phiếu được lập khi bếp chốt suất.
      </p>
    )
  return (
    <div className="flex flex-col gap-4">
      <Field className="max-w-sm">
        <FieldLabel htmlFor="slip-meal">Bữa</FieldLabel>
        <select
          id="slip-meal"
          className={SELECT}
          value={selected ?? ''}
          onChange={(e) => setDailyMealId(Number(e.target.value))}
        >
          {closed.map((m) => (
            <option key={m.dailyMealId} value={m.dailyMealId}>
              {m.mealName}
            </option>
          ))}
        </select>
      </Field>
      <ProblemAlert problem={slips.failure} />
      {slips.data === null ? (
        !slips.failure && <Skeleton className="h-24 w-full" />
      ) : slips.data.length === 0 ? (
        <p className="type-body-sm text-muted-foreground">Không có phiếu nào của bữa này trong phạm vi của bạn.</p>
      ) : (
        <Card className="py-0">
          <Table aria-label="Phiếu bữa ăn">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Phiếu</TableHead>
                <TableHead>Tổng suất</TableHead>
                <TableHead>Suất giữ</TableHead>
                <TableHead className="pr-4">Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {slips.data.map((s) => (
                <TableRow key={s.id} className={openedKey === `slip-${s.id}` ? 'bg-accent/40' : undefined}>
                  <TableCell className="pl-4">
                    <button
                      type="button"
                      className="text-left underline-offset-4 hover:underline"
                      aria-pressed={openedKey === `slip-${s.id}`}
                      onClick={() => openSlip(s)}
                    >
                      {slipGroupName(s, floors)}
                    </button>
                  </TableCell>
                  <TableCell className="tabular-nums">{s.portionCount}</TableCell>
                  <TableCell className="tabular-nums">{s.heldPortionCount ?? 0}</TableCell>
                  <TableCell className="pr-4">
                    <StatusBadge status={label(SLIP_STATUS, s.status)} />
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
