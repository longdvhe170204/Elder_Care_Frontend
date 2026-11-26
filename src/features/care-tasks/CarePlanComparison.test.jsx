import { expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { CarePlanComparison } from './CarePlanComparison'

const types = [
  { id: 5, name: 'Xoay trở' },
  { id: 6, name: 'Đi bộ có hỗ trợ' },
  { id: 7, name: 'Hỗ trợ uống nước' },
]
const water = {
  id: 30,
  taskTypeId: 7,
  content: 'Mời uống',
  frequencyType: 'EVERY_N_HOURS',
  intervalHours: 4,
  startsAt: '08:00',
  waterTargetMl: 1200,
  importance: 'IMPORTANT',
}

it('Figma_moiMucMotThe_bangTruongTruocSau', () => {
  render(
    <CarePlanComparison
      taskTypes={types}
      value={{
        added: [{ id: 10, taskTypeId: 5, content: 'Đổi tư thế' }],
        removed: [{ id: 20, taskTypeId: 6, content: 'Đi bộ buổi chiều' }],
        changed: [
          {
            before: water,
            after: { ...water, id: 31, intervalHours: 3, waterTargetMl: 1500 },
            changedFields: ['intervalHours', 'waterTargetMl'],
          },
        ],
      }}
    />,
  )
  const added = screen.getByRole('article', { name: 'Xoay trở' })
  expect(within(added).getByText('Mục thêm · 1')).toBeInTheDocument()
  expect(within(added).getByRole('row', { name: /Loại công việc — Xoay trở/ })).toBeInTheDocument()

  const removed = screen.getByRole('article', { name: 'Đi bộ có hỗ trợ' })
  expect(within(removed).getByText('Mục bớt · 1')).toBeInTheDocument()
  expect(within(removed).getByRole('row', { name: /Loại công việc Đi bộ có hỗ trợ —/ })).toBeInTheDocument()

  const changed = screen.getByRole('article', { name: 'Hỗ trợ uống nước' })
  expect(within(changed).getByText('Mục đổi · 1')).toBeInTheDocument()
  expect(within(changed).getByRole('row', { name: /Tần suất Mỗi 4 giờ Mỗi 3 giờ/ })).toBeInTheDocument()
  expect(within(changed).getByRole('row', { name: /Mục tiêu nước 1.200 ml\/ngày 1.500 ml\/ngày/ })).toBeInTheDocument()
})

it('Figma_khongCoThayDoi_ghiRo', () => {
  render(<CarePlanComparison taskTypes={types} value={{ added: [], removed: [], changed: [] }} />)
  expect(screen.getByText('Bản sửa chưa khác kế hoạch hiện hành.')).toBeInTheDocument()
})
