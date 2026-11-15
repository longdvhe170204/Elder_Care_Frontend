import { beforeEach, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { json, mockRoutes } from '@/test/fetchRoutes'
import { WellbeingSheet } from './WellbeingSheet'

// 014 FR-051, FR-053: sở thích trong hồ sơ tinh thần hiện tên nhóm từ danh mục (GET /interest-groups, thêm 2026-11-15)
// thay cho mã số; không đọc được danh mục thì vẫn hiện mã để không mất thông tin.

let api

const profile = {
  from: '2026-11-01',
  to: '2026-11-08',
  weeklyParticipation: [],
  sessions: [],
  dailyObservations: [],
  preferences: {
    current: [
      {
        id: 1,
        interestGroupId: 3,
        description: 'Nhạc dân ca',
        level: 'LIKE',
        source: { type: 'RESIDENT' },
        recordedBy: 9,
        recordedAt: '2026-11-01T02:00:00Z',
      },
    ],
    history: [],
  },
  alerts: null,
}

beforeEach(() => {
  api = mockRoutes()
  api.on('GET', '/result-values', json(200, []))
  api.on('GET', '/residents/701/wellbeing-profile', json(200, profile))
})

it('FR_051_soThichHienTenNhom', async () => {
  api.on('GET', '/interest-groups', json(200, [{ id: 3, name: 'Âm nhạc', status: 'ACTIVE' }]))
  render(<WellbeingSheet residentId={701} residentName="Nguyễn Thị Lan" onClose={() => {}} />)

  expect(await screen.findByText('Thích, nhóm Âm nhạc')).toBeInTheDocument()
})

it('FR_051_khongDocDuocDanhMuc_vanHienMaNhom', async () => {
  api.on('GET', '/interest-groups', json(403, { errorCode: 'PERMISSION_DENIED' }))
  render(<WellbeingSheet residentId={701} residentName="Nguyễn Thị Lan" onClose={() => {}} />)

  expect(await screen.findByText('Thích, nhóm 3')).toBeInTheDocument()
})
