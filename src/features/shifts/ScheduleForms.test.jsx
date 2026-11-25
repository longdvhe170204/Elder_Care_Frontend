import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { json, mockRoutes } from '@/test/fetchRoutes'
import { ScheduleForm } from './ScheduleForms'

// Demo 2026-11-25: lập lịch chọn tầng, khu vực theo tên; không xem được danh mục (D13) thì vẫn nhập mã
let api
beforeEach(() => {
  api = mockRoutes()
})
afterEach(() => vi.unstubAllGlobals())

const PLACES = { FLOOR: { 5: 'Tầng 5' }, AREA: { 9: 'Khu phục hồi' } }

it('FR_010_lapLich_chonTangKhuTheoTen', async () => {
  let body
  api.on('POST', '/shift-schedules', (_url, options) => {
    body = JSON.parse(options.body)
    return json(201, {})
  })
  const onDone = vi.fn()
  render(<ScheduleForm month="2026-12" places={PLACES} onDone={onDone} />)
  expect(screen.queryByLabelText('Mã tầng / khu vực')).toBeNull()
  fireEvent.change(screen.getByLabelText('Phạm vi lịch'), { target: { value: 'AREA' } })
  fireEvent.change(screen.getByLabelText('Khu vực'), { target: { value: '9' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lập lịch nháp' }))
  await waitFor(() => expect(body).toEqual({ month: '2026-12', scopeType: 'AREA', scopeId: 9 }))
})

it('FR_010_lapLich_khongCoDanhMuc_vanNhapMa', async () => {
  let body
  api.on('POST', '/shift-schedules', (_url, options) => {
    body = JSON.parse(options.body)
    return json(201, {})
  })
  render(<ScheduleForm month="2026-12" onDone={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Mã tầng / khu vực'), { target: { value: '5' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lập lịch nháp' }))
  await waitFor(() => expect(body).toEqual({ month: '2026-12', scopeType: 'FLOOR', scopeId: 5 }))
})
