import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { json, mockRoutes } from '@/test/fetchRoutes'
import { FollowingAlerts } from './FollowingAlerts'

// 005 FR-057, Q-419: từ thẻ có nhãn "Đang theo dõi", khung chi tiết checklist cho ghi kết quả theo dõi vào cảnh báo đang mở.

let api
const ALERT = {
  id: 9,
  type: 'CHI_SO',
  status: 'IN_PROGRESS',
  followUps: [{ content: 'Đo lại 150/90', at: '2026-11-22T01:00:00Z', recordedBy: '[Điều dưỡng 1]' }],
  allowedCommands: ['follow-up'],
}

beforeEach(() => {
  api = mockRoutes()
  api.on('GET', '/alerts/9', json(200, ALERT))
  api.on('POST', '/alerts/9/follow-ups', json(201, {}))
})
afterEach(() => vi.unstubAllGlobals())

it('FR_057_ghiKetQuaTheoDoiTuKhungChiTietChecklist', async () => {
  render(<FollowingAlerts alertIds={[9]} />)
  expect(await screen.findByText('Đo lại 150/90')).toBeInTheDocument()
  expect(screen.getByRole('region', { name: /^Đang theo dõi: / })).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Ghi kết quả theo dõi'), { target: { value: 'Đo lại 140/85, đã ổn hơn' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lưu theo dõi' }))
  await waitFor(() => expect(api.calls('POST', '/alerts/9/follow-ups')).toHaveLength(1))
  expect(JSON.parse(api.calls('POST', '/alerts/9/follow-ups')[0][1].body)).toEqual({ content: 'Đo lại 140/85, đã ổn hơn' })
})

it('FR_057_khongCoLenhThiChiXem', async () => {
  api.on('GET', '/alerts/9', json(200, { ...ALERT, allowedCommands: [] }))
  render(<FollowingAlerts alertIds={[9]} />)
  expect(await screen.findByText('Đo lại 150/90')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Lưu theo dõi' })).not.toBeInTheDocument()
})
