import { fireEvent, screen, within } from '@testing-library/react'

// Chọn người cao tuổi ở ô tìm kiếm dùng chung (ResidentCombobox, demo 2026-11-26): gõ tên rồi bấm dòng đầu tiên khớp.
// Chờ danh sách tải xong (dòng chỉ hiện khi đã có dữ liệu).
// hidden: phần chứa ô đang bị ẩn với công cụ đọc màn hình (ví dụ khung chi tiết đang mở)
export async function pickResident(name, { container, label = 'Người cao tuổi', hidden = false } = {}) {
  const scope = container ? within(container) : screen
  const input = await scope.findByLabelText(label)
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: name } })
  const option = (await scope.findAllByRole('option', { hidden })).find((o) => o.textContent.includes(name))
  if (!option) throw new Error(`Không thấy người cao tuổi "${name}" trong danh sách`)
  fireEvent.mouseDown(option)
}
