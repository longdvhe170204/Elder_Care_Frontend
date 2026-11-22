import { expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TaskBlock } from './TaskCard'

// Q-419, 005 FR-057: người cao tuổi có cảnh báo đang mở mang nhãn "Đang theo dõi" trên khối việc của checklist

const TASK = {
  id: 1,
  nctId: 9,
  resident: 'Nguyễn Thị An',
  bed: 'P101-G1',
  title: 'Hỗ trợ đi lại',
  status: 'Đến hạn',
  plannedAt: '08:30',
  assignee: 'Nguyễn Văn Lộc',
}

it('Q_419_coCanhBaoDangMo_hienNhanDangTheoDoi', () => {
  render(<TaskBlock task={TASK} onSelect={() => {}} following={['Huyết áp cao']} />)
  expect(screen.getByText(/Đang theo dõi: Huyết áp cao/)).toBeTruthy()
})

it('Q_419_khongCoCanhBao_khongCoNhan', () => {
  render(<TaskBlock task={TASK} onSelect={() => {}} />)
  expect(screen.queryByText(/Đang theo dõi/)).toBeNull()
})
