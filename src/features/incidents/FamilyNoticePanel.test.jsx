import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { json, mockRoutes } from '@/test/fetchRoutes'
import { FamilyNoticePanel } from './FamilyNoticePanel'

let api
beforeEach(() => {
  api = mockRoutes()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('FamilyNoticePanel', () => {
  it('BF_06_daBao_hienAiLucNaoCachNao', async () => {
    api.on(
      'GET',
      '/incidents/5/family-notice',
      json(200, {
        state: 'INFORMED',
        method: 'PHONE',
        notifiedAt: '2026-11-24T08:00:00Z',
        notifiedByName: 'Bác sĩ Lê',
        overdue: false,
      }),
    )
    render(<FamilyNoticePanel incidentId={5} canRecord />)
    expect(await screen.findByText(/Đã báo người nhà: Gọi điện/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ghi đã báo người nhà' })).toBeNull()
  })

  it('BF_06_quaHan_nhacRo_vaGhiDuocKhiCoQuyen', async () => {
    api.on('GET', '/incidents/5/family-notice', json(200, { state: 'NOT_YET', overdue: true, dueAt: '2026-11-24T07:00:00Z' }))
    api.on('POST', '/incidents/5/family-notice', json(200, {}))
    render(<FamilyNoticePanel incidentId={5} canRecord />)
    expect(await screen.findByText(/Quá hạn báo người nhà/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ghi đã báo người nhà' }))
    fireEvent.click(screen.getByRole('button', { name: 'Gặp trực tiếp' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    await waitFor(() => expect(api.calls('POST', '/incidents/5/family-notice')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/incidents/5/family-notice')[0][1].body)).toMatchObject({
      method: 'IN_PERSON',
    })
  })

  it('BF_06_khongCoQuyen_khongCoNutGhi', async () => {
    api.on('GET', '/incidents/5/family-notice', json(200, { state: 'NONE', overdue: false }))
    render(<FamilyNoticePanel incidentId={5} canRecord={false} />)
    expect(await screen.findByText(/Chưa ghi nhận báo người nhà/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ghi đã báo người nhà' })).toBeNull()
  })
})
