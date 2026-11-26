import { Badge } from '@/components/ui/badge'
import { CARE_ROLES, FREQUENCIES, IMPORTANCE, RESULT_TYPES, frequencyText } from './carePlanLabels'

// Thay đổi của bản sửa so với kế hoạch Hiệu lực (FR-008, sửa Q-447; Figma "Bác sĩ · Thay đổi so với hiện hành"):
// mỗi mục một thẻ có nhãn nhóm, bảng Trường thay đổi / Trước / Sau. Các trường tần suất gộp một dòng "Tần suất".
const FREQUENCY_FIELDS = ['frequencyType', 'intervalHours', 'timesPerDay', 'startsAt', 'times', 'weekdays']
const FIELDS = {
  taskTypeId: 'Loại công việc',
  content: 'Nội dung',
  windowBeforeMinutes: 'Khung trước',
  windowAfterMinutes: 'Khung sau',
  performerRole: 'Vai trò thực hiện',
  resultType: 'Kết quả cần ghi',
  importance: 'Mức quan trọng',
  billable: 'Tính phí',
  waterTargetMl: 'Mục tiêu nước',
}
const GROUPS = {
  // Tông theo Badge có sẵn; mục bớt không dùng đỏ vì đỏ chỉ cho việc gấp (DESIGN.md mục 1 điều 4)
  added: { label: 'Mục thêm', tone: 'settled' },
  removed: { label: 'Mục bớt', tone: 'neutral-outline' },
  changed: { label: 'Mục đổi', tone: 'attention' },
}
const EMPTY = '—'

function show(field, item, typeName) {
  const value = item?.[field]
  if (value == null || value === '') return EMPTY
  switch (field) {
    case 'taskTypeId':
      return typeName(value)
    case 'performerRole':
      return CARE_ROLES[value] ?? value
    case 'resultType':
      return RESULT_TYPES[value] ?? value
    case 'importance':
      return IMPORTANCE[value] ?? value
    case 'billable':
      return value ? 'Có' : 'Không'
    case 'waterTargetMl':
      return `${Number(value).toLocaleString('vi-VN')} ml/ngày`
    case 'windowBeforeMinutes':
    case 'windowAfterMinutes':
      return `${value} phút`
    default:
      return String(value)
  }
}

// Dòng giờ chỉ hiện khi khác nhau giữa hai bản, để thấy ngay phần đổi (vd. "Mỗi 4 giờ" → "Mỗi 3 giờ")
function frequencies(before, after) {
  const text = (item) => (item?.frequencyType ? frequencyText(item) : null)
  const a = text(before)
  const b = text(after)
  const withSub = a?.sub !== b?.sub
  const one = (t, item) => (t ? [t.main || FREQUENCIES[item.frequencyType], withSub && t.sub].filter(Boolean).join(' · ') : EMPTY)
  return [one(a, before), one(b, after)]
}

function rows(kind, entry, typeName) {
  if (kind === 'added') return [['Loại công việc', EMPTY, show('taskTypeId', entry, typeName)]]
  if (kind === 'removed') return [['Loại công việc', show('taskTypeId', entry, typeName), EMPTY]]
  const { before, after, changedFields } = entry
  const out = []
  if (changedFields.some((field) => FREQUENCY_FIELDS.includes(field)))
    out.push(['Tần suất', ...frequencies(before, after)])
  for (const field of changedFields) {
    if (FREQUENCY_FIELDS.includes(field)) continue
    out.push([FIELDS[field] ?? field, show(field, before, typeName), show(field, after, typeName)])
  }
  return out
}

function ChangeCard({ kind, count, entry, typeName }) {
  const item = kind === 'changed' ? entry.after : entry
  const title = typeName(item.taskTypeId)
  return (
    <article aria-label={title} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <Badge variant={GROUPS[kind].tone} className="self-start">
        {GROUPS[kind].label} · {count}
      </Badge>
      <h4 className="type-card-title">{title}</h4>
      <table className="w-full type-body-sm">
        <thead>
          <tr className="bg-muted text-muted-foreground">
            <th className="rounded-l-md px-2 py-1.5 text-left font-semibold">Trường thay đổi</th>
            <th className="px-2 py-1.5 text-left font-semibold">Trước</th>
            <th className="rounded-r-md px-2 py-1.5 text-left font-semibold">Sau</th>
          </tr>
        </thead>
        <tbody>
          {rows(kind, entry, typeName).map(([field, before, after]) => (
            <tr key={field} className="border-b last:border-0">
              <td className="px-2 py-2">{field}</td>
              <td className="px-2 py-2 text-muted-foreground">{before}</td>
              <td className="px-2 py-2 font-semibold text-primary">{after}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  )
}

export function CarePlanComparison({ value, taskTypes = [] }) {
  const names = Object.fromEntries(taskTypes.map((type) => [String(type.id), type.name]))
  const typeName = (id) => names[String(id)] ?? `Loại công việc mã ${id}`
  const total = value.added.length + value.removed.length + value.changed.length
  return (
    <section className="flex flex-col gap-3" aria-label="Thay đổi so với kế hoạch hiện hành">
      <div>
        <h3 className="type-title">Thay đổi so với kế hoạch hiện hành</h3>
        <p className="type-body-sm text-muted-foreground">Đối chiếu từng thay đổi trước khi duyệt.</p>
      </div>
      {total === 0 && <p className="type-body-sm">Bản sửa chưa khác kế hoạch hiện hành.</p>}
      {['added', 'removed', 'changed'].flatMap((kind) =>
        value[kind].map((entry, index) => (
          <ChangeCard
            key={`${kind}-${(kind === 'changed' ? entry.after : entry).id ?? index}`}
            kind={kind}
            count={value[kind].length}
            entry={entry}
            typeName={typeName}
          />
        )),
      )}
    </section>
  )
}
