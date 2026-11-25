const FIELDS = {
  taskTypeId: 'Loại công việc',
  content: 'Nội dung',
  frequencyType: 'Tần suất',
  intervalHours: 'Khoảng giờ',
  timesPerDay: 'Số lần trong ngày',
  startsAt: 'Giờ bắt đầu',
  times: 'Các mốc giờ',
  weekdays: 'Ngày trong tuần',
  windowBeforeMinutes: 'Khung trước',
  windowAfterMinutes: 'Khung sau',
  performerRole: 'Vai trò thực hiện',
  resultType: 'Kết quả',
  importance: 'Mức quan trọng',
  billable: 'Tính phí',
  waterTargetMl: 'Mục tiêu nước',
}

// Thay đổi của bản sửa so với kế hoạch Hiệu lực (FR-008, sửa Q-447)
export function CarePlanComparison({ value }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4" aria-label="Thay đổi so với kế hoạch hiện hành">
      <h3 className="type-title">Thay đổi so với kế hoạch hiện hành</h3>
      <h4 className="type-label">Mục thêm ({value.added.length})</h4>
      <ul>
        {value.added.map((item) => (
          <li key={item.id}>{item.content}</li>
        ))}
      </ul>
      <h4 className="type-label">Mục bớt ({value.removed.length})</h4>
      <ul>
        {value.removed.map((item) => (
          <li key={item.id}>{item.content}</li>
        ))}
      </ul>
      <h4 className="type-label">Mục đổi ({value.changed.length})</h4>
      {value.changed.map((item) => (
        <article key={item.after.id} className="rounded-lg border p-3">
          <p>Trước: {item.before.content}</p>
          <p>Sau: {item.after.content}</p>
          <p className="type-body-sm text-muted-foreground">
            Trường thay đổi: {item.changedFields.map((field) => FIELDS[field] ?? field).join(', ')}
          </p>
        </article>
      ))}
    </section>
  )
}
