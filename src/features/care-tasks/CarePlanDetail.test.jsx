import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { CarePlanDetail } from './CarePlanDetail'

let api
const plan = {
  id: 17,
  residentId: 77,
  revision: 2,
  status: 'DRAFT',
  items: [],
  riskAgreements: [],
  allowedCommands: ['issue', 'replaceItems', 'replaceRiskAgreements', 'cancel'],
  createdBy: '[Người lập kiểm thử]',
  noEffectivePlan: true,
}
beforeEach(() => {
  api = mockRoutes()
  api.on('GET', '/care-plans/17', json(200, plan, { ETag: '"4"' }))
  api.on('GET', '/task-types', json(200, []))
})
afterEach(() => vi.unstubAllGlobals())

it('Q_414_banHanhGuiNgayHieuLucVaLyDo_khongCoNutDuyet', async () => {
  api.on('POST', '/care-plans/17/issue', json(200, null))
  render(<CarePlanDetail planId={17} onChanged={vi.fn()} />)
  fireEvent.change(await screen.findByLabelText('Ngày hiệu lực'), { target: { value: '2026-11-02' } })
  fireEvent.change(screen.getByLabelText('Lý do thay đổi'), { target: { value: 'Theo đánh giá mới' } })
  expect(screen.queryByRole('button', { name: /Duyệt|Gửi duyệt|Trả lại/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Ban hành kế hoạch' }))
  await waitFor(() => expect(api.calls('POST', '/care-plans/17/issue')).toHaveLength(1))
  expect(JSON.parse(api.calls('POST', '/care-plans/17/issue')[0][1].body)).toEqual({
    effectiveFrom: '2026-11-02',
    changeReason: 'Theo đánh giá mới',
  })
})

it('FR_007_nutLenhChiTheoAllowedCommands', async () => {
  api.on('GET', '/care-plans/17', json(200, { ...plan, status: 'EFFECTIVE', allowedCommands: [] }, { ETag: '"5"' }))
  render(<CarePlanDetail planId={17} onChanged={vi.fn()} />)
  expect(await screen.findByText('Hiệu lực')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Ban hành kế hoạch' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Lưu mục công việc' })).not.toBeInTheDocument()
})

it('FR_004_412HienGiaTriMoiVaTaiLaiKhongGhiDe', async () => {
  api.on(
    'PUT',
    '/care-plans/17/items',
    problem(412, 'VERSION_MISMATCH', { currentValue: { version: 5, status: 'PENDING_APPROVAL' } }),
  )
  render(<CarePlanDetail planId={17} onChanged={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Lưu mục công việc' }))
  expect(await screen.findByText('Dữ liệu đã thay đổi')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Tải lại phiên bản' })).toBeInTheDocument()
  const [, request] = api.calls('PUT', '/care-plans/17/items')[0]
  expect(request.headers['If-Match']).toBe('"4"')
  expect(request.headers['Idempotency-Key']).toBeTruthy()
  expect(api.calls('PUT', '/care-plans/17/items')).toHaveLength(1)
})

it('FR_003_huyPhienBanBatBuocLyDoTaiO', async () => {
  render(<CarePlanDetail planId={17} onChanged={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Hủy phiên bản' }))
  expect(await screen.findByText('Nhập lý do trước khi thực hiện.')).toBeInTheDocument()
  expect(api.calls('POST', '/care-plans/17/cancel')).toHaveLength(0)
})

it('Q_414_thuHoiBanHanhBatBuocLyDo', async () => {
  api.on(
    'GET',
    '/care-plans/17',
    json(200, { ...plan, status: 'PENDING_EFFECT', effectiveFrom: '2026-11-30', allowedCommands: ['withdraw'] }, { ETag: '"6"' }),
  )
  api.on('POST', '/care-plans/17/withdraw', json(200, null))
  render(<CarePlanDetail planId={17} onChanged={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Thu hồi ban hành' }))
  expect(await screen.findByText('Nhập lý do trước khi thực hiện.')).toBeInTheDocument()
  expect(api.calls('POST', '/care-plans/17/withdraw')).toHaveLength(0)
  fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Cần khám lại' } })
  fireEvent.click(screen.getByRole('button', { name: 'Thu hồi ban hành' }))
  await waitFor(() => expect(api.calls('POST', '/care-plans/17/withdraw')).toHaveLength(1))
  expect(JSON.parse(api.calls('POST', '/care-plans/17/withdraw')[0][1].body)).toEqual({ reason: 'Cần khám lại' })
})
