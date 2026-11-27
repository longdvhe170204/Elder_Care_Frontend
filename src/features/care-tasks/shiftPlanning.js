// Nhãn và hàm giờ dùng chung cho màn Lập công việc ca và hai modal của màn
export const BASIS = {
  CARE_PLAN_ITEM: 'Mục kế hoạch',
  MEASUREMENT: 'Lần đo',
  MEAL: 'Bữa ăn',
  ACTIVITY_SESSION: 'Buổi hoạt động',
  POST_FALL_MONITORING: 'Theo dõi sau ngã',
  INCIDENT_FOLLOW_UP: 'Việc tiếp theo của sự cố',
  CONTACT_MONITORING: 'Theo dõi tiếp xúc',
  WATER_INTAKE_ALERT: 'Cảnh báo uống nước',
  SHIFT_START_CHECK: 'Kiểm tra đầu ca',
  SUPERVISION: 'Giám sát',
  AD_HOC: 'Phát sinh',
}

export const STATUSES = {
  NOT_YET_DUE: 'Chưa đến hạn',
  DUE: 'Đến hạn',
  OVERDUE: 'Quá hạn',
  COMPLETED: 'Hoàn thành',
  COMPLETED_LATE: 'Hoàn thành trễ',
  NOT_PERFORMED: 'Không thực hiện',
  CANCELLED: 'Đã hủy',
}

// Mã lỗi theo dòng của lệnh lập lô (api-005) và trường bị lỗi trong dòng
export const ERRORS = {
  RESIDENT_NOT_STAYING: ['resident', 'Người cao tuổi không đang lưu trú.'],
  RESIDENT_ABSENT: ['resident', 'Người cao tuổi đang vắng mặt.'],
  DAY_CARE_NOT_PRESENT: ['resident', 'Người bán trú chưa có mặt trong khoảng này.'],
  OUTSIDE_SHIFT: ['time', null],
  PLAN_ITEM_MISMATCH: ['time', 'Thời điểm, khung hoặc mức chưa khớp mục kế hoạch.'],
  INVALID_BASIS: ['basis', 'Kế hoạch hoặc sự kiện có thể đã hết hiệu lực hoặc không còn đủ điều kiện. Kiểm tra lại nguồn và giờ dự kiến.'],
  MEDICATION_IS_NOT_A_TASK: ['basis', 'Liều thuốc không được lập thành công việc.'],
  INVALID_PERFORMER: ['performer', 'Người thực hiện hoặc lựa chọn công việc chung chưa hợp lệ.'],
  MISSING_CERTIFICATE: ['performer', 'Người thực hiện chưa đủ chứng chỉ.'],
  DUPLICATE_BASIS: ['basis', 'Trùng căn cứ và thời điểm dự kiến.'],
  OLD_REVISION_WINDOW_OVERLAP: ['basis', 'Trùng khung công việc của phiên bản trước.'],
  SHIFT_CHECK_ALREADY_EXISTS: ['basis', 'Điều dưỡng đã có công việc này trong ca.'],
}

const ZONE = 'Asia/Ho_Chi_Minh'
// Ngày (YYYY-MM-DD) và giờ (HH:MM) theo giờ Việt Nam
export const dateOf = (value) => new Date(value).toLocaleDateString('sv-SE', { timeZone: ZONE })
export const timeOf = (value) =>
  new Date(value).toLocaleTimeString('en-GB', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' })
export const nextDate = (date) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
export const formatDate = (date) => date.split('-').reverse().join('/')
export const shiftLabel = (shift) => `Ca ${timeOf(shift.startsAt)}–${timeOf(shift.endsAt)}`

// Giờ dự kiến trong ca: giờ nhỏ hơn giờ bắt đầu của ca qua đêm thuộc ngày hôm sau
export function plannedAtOf(shift, time) {
  const start = dateOf(shift.startsAt)
  const overnight = start !== dateOf(shift.endsAt)
  const date = overnight && time < timeOf(shift.startsAt) ? nextDate(start) : start
  return `${date}T${time}:00+07:00`
}

export function shiftTimeOptions(shift) {
  const minute = 60_000
  const first = Math.ceil(Date.parse(shift.startsAt) / minute) * minute
  const end = Date.parse(shift.endsAt)
  const options = []
  for (let at = first; at < end; at += 15 * minute) options.push(timeOf(at))
  return {
    options,
    first: timeOf(first),
    last: timeOf((Math.ceil(end / minute) - 1) * minute),
  }
}

export const pad = (n) => String(n).padStart(2, '0')
export const newPlanningRow = () => ({ key: crypto.randomUUID(), content: '', mode: 'adHoc' })

// Giờ (HH:MM) có nằm trong ca không, tính cả ca qua đêm
export function inShift(shift, time) {
  const at = new Date(plannedAtOf(shift, time)).getTime()
  return at >= new Date(shift.startsAt).getTime() && at < new Date(shift.endsAt).getTime()
}

// Mục kế hoạch "một lần mỗi ca" hoặc không có giờ nào thì làm lúc nào trong ca cũng khớp (như CareTaskValidator)
export const anyTimeItem = (item) =>
  item.frequencyType === 'ONCE_PER_SHIFT' || (!item.times?.length && !item.startsAt)

// Giờ trong ngày (HH:MM) của mục kế hoạch: danh sách giờ, hoặc từ giờ bắt đầu lặp mỗi N giờ
export function itemTimes(item) {
  if (item.times?.length) return item.times.map((t) => t.slice(0, 5))
  if (!item.startsAt) return []
  const [hour, minute] = item.startsAt.split(':').map(Number)
  if (!(item.intervalHours > 0)) return [`${pad(hour)}:${pad(minute)}`]
  const times = []
  for (let k = 0; k * item.intervalHours < 24; k++) times.push(`${pad((hour + k * item.intervalHours) % 24)}:${pad(minute)}`)
  return times
}

// Mục kế hoạch của người cao tuổi (bỏ trùng khi ca qua đêm lấy kế hoạch của hai ngày) kèm giờ rơi vào ca; null là
// làm lúc nào trong ca cũng được
function planItemsInShift(resident, shift) {
  if (resident?.planOccurrences) {
    const timesByItem = new Map()
    for (const { itemId, plannedAt } of resident.planOccurrences) {
      const times = timesByItem.get(itemId) ?? []
      times.push(plannedAt)
      timesByItem.set(itemId, times)
    }
    return (resident.planItems ?? []).map((item) => {
      const occurrences = timesByItem.get(item.id) ?? []
      return { item, times: occurrences.map(timeOf), occurrences }
    })
  }
  const seen = new Set()
  return (resident?.planItems ?? [])
    .filter((item) => !seen.has(item.id) && seen.add(item.id))
    .map((item) => ({ item, times: anyTimeItem(item) ? null : itemTimes(item).filter((t) => inShift(shift, t)) }))
}

// Chỉ liệt kê nguồn thuộc người đã chọn. Backend xác nhận lại hiệu lực tại giờ dự kiến.
export function matchingSources(resident, shift, taskTypeId, time) {
  if (!resident || !taskTypeId || !time || !inShift(shift, time)) return []
  const at = Date.parse(plannedAtOf(shift, time))
  return [
    ...planItemsInShift(resident, shift)
      .filter(({ item, times }) => String(item.taskTypeId) === String(taskTypeId) && (times === null || times.includes(time)))
      .map(({ item, occurrences }) => ({
        type: 'CARE_PLAN_ITEM',
        id: item.id,
        description: item.content,
        item,
        plannedAt: occurrences?.find((occurrence) => timeOf(occurrence) === time),
      })),
    ...(resident.otherSources ?? []).filter((source) => {
      const startsAt = Date.parse(source.at)
      // Nguồn theo dõi có thể bắt đầu trước ca. Backend kiểm mốc kết thúc khi lưu.
      if (source.type === 'POST_FALL_MONITORING') return startsAt < at
      if (source.type === 'CONTACT_MONITORING') return startsAt <= at
      if (source.type === 'INCIDENT_FOLLOW_UP') return true
      return Math.floor(startsAt / 60_000) === at / 60_000
    }),
  ]
}

const sameBasis = (task, basis, time) =>
  task.basis && `${task.basis.type}:${task.basis.id}` === basis && (time === null || timeOf(task.plannedAt) === time)

// Việc cần lập của một người cao tuổi trong ca: mỗi giờ của mục kế hoạch
// rơi vào ca và mỗi nguồn khác trong ca là một việc; Đã lập khi ca đã có công việc chưa hủy cùng căn cứ, giờ; Đang
// nhập khi một dòng của lô đang nhập đã khớp.
export function needsOf(resident, shift, tasks, drafts) {
  const id = resident.residentId
  const own = tasks.filter((t) => t.residentId === id && t.status !== 'CANCELLED')
  const entries = [
    ...planItemsInShift(resident, shift).flatMap(({ item, times, occurrences }) =>
      (times ?? [null]).map((time, index) => ({
        basis: `CARE_PLAN_ITEM:${item.id}`,
        kind: BASIS.CARE_PLAN_ITEM,
        planItemId: item.id,
        text: item.content,
        taskTypeId: item.taskTypeId,
        time,
        plannedAt: occurrences?.[index],
        importance: item.importance,
        role: item.performerRole,
      })),
    ),
    ...(resident.otherSources ?? [])
      .filter((s) => {
        const at = new Date(s.at).getTime()
        return at >= new Date(shift.startsAt).getTime() && at < new Date(shift.endsAt).getTime()
      })
      .map((s) => ({
        basis: `${s.type}:${s.id}`,
        kind: BASIS[s.type] || 'Nguồn khác',
        text: s.description,
        time: timeOf(s.at),
      })),
  ]
    .map((e) => ({
      ...e,
      state: own.some((t) => sameBasis(t, e.basis, e.time))
        ? 'DONE'
        : drafts.some((d) => d.basis === e.basis && (e.time === null || d.time === e.time))
          ? 'DRAFT'
          : 'TODO',
    }))
    .sort((a, b) => (a.time ? new Date(plannedAtOf(shift, a.time)) : 0) - (b.time ? new Date(plannedAtOf(shift, b.time)) : 0))
  return {
    entries,
    hasPlan: (resident.planItems ?? []).length > 0,
    todo: entries.filter((e) => e.state === 'TODO').length,
  }
}
