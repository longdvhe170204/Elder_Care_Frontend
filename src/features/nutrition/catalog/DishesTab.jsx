import { useEffect, useState } from 'react'
import {
  deleteNutritionDishesByIdImage,
  getNutritionDishes,
  postNutritionDishes,
  postNutritionDishesByIdByCommand,
  putNutritionDishesById,
  putNutritionDishesByIdImage,
} from '@/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { ProblemAlert } from '@/common/ProblemAlert'
import { StatusBadge } from '@/common/StatusBadge'
import { Info, ReasonField } from '../NutritionParts'
import { useCommand, useLoad } from '../useNutrition'
import { DISH_COMMAND, DISH_REASON_COMMANDS, DISH_STATUS, dishCommands, label } from '../nutritionView'

// Món ăn (011 FR-004, FR-004a; Q-445): Nhân viên bếp tạo món gồm tên, mô tả, ảnh; Nháp → Hiệu lực bằng lệnh Đưa vào
// dùng, không cần Bác sĩ xác nhận; sửa áp dụng ngay. Nút theo trạng thái và quyền "Món ăn, thực đơn"; backend kiểm lại.

const EMPTY = { name: '', description: '' }
const IMAGE_TYPES = ['image/jpeg', 'image/png']
const MAX_IMAGE = 5 * 1024 * 1024

export function DishForm({ title, description, initial, submitLabel, onSubmit, onClose, busy, failure }) {
  const [form, setForm] = useState(initial ?? EMPTY)
  const [submitted, setSubmitted] = useState(false)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const nameError = !form.name.trim() ? 'Nhập tên món' : form.name.trim().length > 200 ? 'Tên tối đa 200 ký tự' : null
  const descriptionError = form.description.trim().length > 2000 ? 'Mô tả tối đa 2000 ký tự' : null
  function submit() {
    setSubmitted(true)
    if (nameError || descriptionError) return
    onSubmit({ name: form.name.trim(), description: form.description.trim() })
  }
  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto p-6 sm:max-w-xl">
        <SheetTitle className="type-title">{title}</SheetTitle>
        <SheetDescription className="type-body-sm text-muted-foreground">{description}</SheetDescription>
        <FieldGroup className="mt-4">
          <Field data-invalid={(submitted && !!nameError) || undefined}>
            <FieldLabel htmlFor="dish-name">Tên món</FieldLabel>
            <Input
              id="dish-name"
              className="h-11"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              aria-invalid={(submitted && !!nameError) || undefined}
            />
            {submitted && nameError && <FieldError>{nameError}</FieldError>}
          </Field>
          <Field data-invalid={(submitted && !!descriptionError) || undefined}>
            <FieldLabel htmlFor="dish-description">Mô tả</FieldLabel>
            <Textarea
              id="dish-description"
              rows={4}
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
            />
            <FieldDescription>Người dùng app thấy mô tả này khi xem thực đơn.</FieldDescription>
            {submitted && descriptionError && <FieldError>{descriptionError}</FieldError>}
          </Field>
        </FieldGroup>
        <div className="mt-4 flex flex-col gap-3">
          <ProblemAlert problem={failure} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="h-11" onClick={onClose}>
              Đóng
            </Button>
            <Button className="h-11" disabled={busy} onClick={submit}>
              {submitLabel}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function DishImage({ dish, editable, onChanged }) {
  const [error, setError] = useState(null)
  const { busy, failure, run } = useCommand()
  async function upload(file) {
    setError(null)
    if (!file) return
    if (!IMAGE_TYPES.includes(file.type)) return setError('Chỉ nhận ảnh JPEG hoặc PNG')
    if (file.size > MAX_IMAGE) return setError('Ảnh tối đa 5 MB')
    const body = new FormData()
    body.append('file', file)
    if (await run(putNutritionDishesByIdImage, { path: { id: dish.id }, body })) onChanged('Đã cập nhật ảnh món')
  }
  return (
    <div className="flex flex-col gap-3">
      {dish.imageUrl ? (
        <img src={dish.imageUrl} alt={`Ảnh món ${dish.name}`} className="aspect-video w-full rounded-md object-cover" />
      ) : (
        <p className="type-body-sm text-muted-foreground">Món chưa có ảnh.</p>
      )}
      {editable && (
        <Field data-invalid={!!error || undefined}>
          <FieldLabel htmlFor={`dish-image-${dish.id}`}>{dish.imageUrl ? 'Thay ảnh' : 'Thêm ảnh'}</FieldLabel>
          <Input
            id={`dish-image-${dish.id}`}
            type="file"
            accept={IMAGE_TYPES.join(',')}
            disabled={busy}
            onChange={(e) => upload(e.target.files?.[0])}
          />
          <FieldDescription>JPEG hoặc PNG, tối đa 5 MB.</FieldDescription>
          {error && <FieldError>{error}</FieldError>}
        </Field>
      )}
      {editable && dish.imageUrl && (
        <div>
          <Button
            variant="outline"
            className="h-11"
            disabled={busy}
            onClick={async () => {
              if (await run(deleteNutritionDishesByIdImage, { path: { id: dish.id } })) onChanged('Đã bỏ ảnh món')
            }}
          >
            Bỏ ảnh
          </Button>
        </div>
      )}
      <ProblemAlert problem={failure} />
    </div>
  )
}

function DishDetail({ dish, kitchen, onChanged, Title, Description }) {
  const [mode, setMode] = useState(null)
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const { busy, failure, setFailure, run } = useCommand()

  async function command(cmd, body, message) {
    const ok = await run(postNutritionDishesByIdByCommand, { path: { id: dish.id, command: cmd }, body })
    if (ok) {
      setMode(null)
      setReason('')
      onChanged(message)
    }
  }

  function start(cmd) {
    setFailure(null)
    setSubmitted(false)
    if (DISH_REASON_COMMANDS.has(cmd)) setMode(cmd)
    else command(cmd, {}, `${DISH_COMMAND[cmd]}: xong`)
  }

  const commands = dishCommands(dish, { kitchen })
  const editable = kitchen && (dish.status === 'DRAFT' || dish.status === 'ACTIVE')
  const reasonError = submitted && !reason.trim() ? 'Nhập lý do' : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <StatusBadge status={label(DISH_STATUS, dish.status)} />
        <Title className="type-title">{dish.name}</Title>
        <Description className="type-body-sm text-muted-foreground">
          {dish.status === 'DRAFT' ? 'Đưa vào dùng để chọn được món này khi lập thực đơn.' : 'Nội dung đang áp dụng'}
        </Description>
      </div>
      <DishImage dish={dish} editable={editable} onChanged={onChanged} />
      <div className="grid gap-3">
        <Info label="Mô tả">{dish.description || '—'}</Info>
        {dish.inactiveReason && <Info label="Lý do ngừng">{dish.inactiveReason}</Info>}
      </div>
      <ProblemAlert problem={failure} />
      {mode === 'deactivate' && (
        <div className="flex flex-col gap-3 border-t pt-4">
          <ReasonField id="dish-reason" value={reason} onChange={setReason} error={reasonError} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="h-11" onClick={() => setMode(null)}>
              Thôi
            </Button>
            <Button
              variant="destructive"
              className="h-11"
              disabled={busy}
              onClick={() => {
                setSubmitted(true)
                if (reason.trim()) command(mode, { reason: reason.trim() }, 'Đã ngừng hiệu lực món')
              }}
            >
              Ngừng hiệu lực
            </Button>
          </div>
        </div>
      )}
      {!mode && (commands.length > 0 || editable) && (
        <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
          {editable && (
            <Button variant="outline" className="h-11" onClick={() => setMode('edit')}>
              Sửa món
            </Button>
          )}
          {commands.map((cmd) => (
            <Button
              key={cmd}
              variant={cmd === 'activate' ? 'default' : 'outline'}
              className="h-11"
              disabled={busy}
              onClick={() => start(cmd)}
            >
              {DISH_COMMAND[cmd]}
            </Button>
          ))}
        </div>
      )}
      {mode === 'edit' && (
        <DishForm
          title={`Sửa món ${dish.name}`}
          description="Sửa tên, mô tả; áp dụng ngay, kể cả ở thực đơn đã công bố."
          initial={{ name: dish.name, description: dish.description ?? '' }}
          submitLabel="Lưu món"
          busy={busy}
          failure={failure}
          onClose={() => setMode(null)}
          onSubmit={async (body) => {
            const ok = await run(putNutritionDishesById, {
              path: { id: dish.id },
              headers: { 'If-Match': `"${dish.version}"` },
              body,
            })
            if (ok) {
              setMode(null)
              onChanged('Đã lưu món')
            }
          }}
        />
      )}
    </div>
  )
}

export function DishesTab({ kitchen, openedKey, open, announce }) {
  const [creating, setCreating] = useState(false)
  const dishes = useLoad(() => getNutritionDishes({ query: {} }).then((r) => r.data), [])
  const create = useCommand()

  function changed(message) {
    announce(message)
    dishes.reload()
  }

  function openDish(dish) {
    open(`dish-${dish.id}`, 'Chi tiết món', (titles) => (
      <DishDetail key={dish.id} dish={dish} kitchen={kitchen} onChanged={changed} {...titles} />
    ))
  }

  // Sau lệnh, danh sách tải lại: khung đang mở nhận dữ liệu mới
  useEffect(() => {
    const d = dishes.data?.find((x) => openedKey === `dish-${x.id}`)
    if (d) openDish(d)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dishes.data])

  return (
    <div className="flex flex-col gap-4">
      {kitchen && (
        <div>
          <Button className="h-11" onClick={() => setCreating(true)}>
            Thêm món
          </Button>
        </div>
      )}
      {creating && (
        <DishForm
          title="Thêm món"
          description="Món mới ở Nháp; thêm ảnh rồi bấm Đưa vào dùng để chọn được khi lập thực đơn."
          submitLabel="Lưu món"
          busy={create.busy}
          failure={create.failure}
          onClose={() => setCreating(false)}
          onSubmit={async (body) => {
            if (await create.run(postNutritionDishes, { body })) {
              setCreating(false)
              changed('Đã thêm món')
            }
          }}
        />
      )}
      <ProblemAlert problem={dishes.failure} />
      {dishes.data === null ? (
        !dishes.failure && <Skeleton className="h-24 w-full" />
      ) : dishes.data.length === 0 ? (
        <p className="type-body-sm text-muted-foreground">Chưa có món nào. Nhân viên bếp thêm món để lập thực đơn.</p>
      ) : (
        <Card className="py-0">
          <Table aria-label="Món ăn">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-16 pl-4">Ảnh</TableHead>
                <TableHead>Món</TableHead>
                <TableHead className="pr-4">Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dishes.data.map((d) => (
                <TableRow key={d.id} className={openedKey === `dish-${d.id}` ? 'bg-accent/40' : undefined}>
                  <TableCell className="pl-4">
                    {d.imageUrl ? (
                      <img src={d.imageUrl} alt="" className="size-10 rounded-md object-cover" />
                    ) : (
                      <span className="block size-10 rounded-md bg-muted" aria-hidden="true" />
                    )}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <button
                      type="button"
                      className="text-left underline-offset-4 hover:underline"
                      aria-pressed={openedKey === `dish-${d.id}`}
                      onClick={() => openDish(d)}
                    >
                      {d.name}
                    </button>
                    {d.description && (
                      <span className="block type-caption text-muted-foreground line-clamp-1">{d.description}</span>
                    )}
                  </TableCell>
                  <TableCell className="pr-4">
                    <StatusBadge status={label(DISH_STATUS, d.status)} />
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
