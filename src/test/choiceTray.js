import { fireEvent, within } from '@testing-library/react'

// Ghi chữ tự do vào ô chọn nhanh ChoiceTray (mở khay, "Khác", gõ, Enter) — thay cho fireEvent.change trên ô gõ cũ.
export function typeChoice(label, text, container = document.body) {
  const scope = within(container)
  const trigger = scope.getByRole('button', { name: label })
  if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger)
  fireEvent.click(scope.getByRole('button', { name: 'Khác' }))
  const input = scope.getByRole('textbox', { name: `Nội dung khác của ${label}` })
  fireEvent.change(input, { target: { value: text } })
  fireEvent.keyDown(input, { key: 'Enter' })
}

// Bỏ mọi mục đã chọn của ô chọn nhanh
export function clearChoice(container = document.body) {
  within(container)
    .queryAllByRole('button', { name: /^Bỏ / })
    .forEach((button) => fireEvent.click(button))
}
