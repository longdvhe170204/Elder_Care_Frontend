import { expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { json, mockRoutes } from '@/test/fetchRoutes'
import { NotificationsPage } from './NotificationsPage'

// Demo 2026-11-25: mở từ "Việc gửi tới bạn" của Tổng quan thì vào thẳng chi tiết thông báo đó
it('moTheoNotificationId_hienChiTietThongBao', async () => {
  const api = mockRoutes()
  api.on('GET', '/me/notifications', json(200, { unreadCount: 0, items: [] }))
  api.on(
    'GET',
    '/me/notifications/42',
    json(200, {
      id: 42,
      level: 'MEDIUM',
      title: 'Bảng chi phí kỳ cuối đã chốt',
      content: [{ informationType: 'COSTS', content: 'Tổng 1.550.000 đ, đã trừ vào số dư.' }],
      hiddenParts: [],
      status: 'VIEWED',
      sentAt: '2026-11-25T01:00:00Z',
    }),
  )
  render(<NotificationsPage role="OFFICE_STAFF" notificationId={42} />)
  expect(await screen.findByText('Tổng 1.550.000 đ, đã trừ vào số dư.')).toBeInTheDocument()
})
