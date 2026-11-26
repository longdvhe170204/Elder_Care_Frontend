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
  allowedCommands: ['submit', 'replaceItems', 'replaceRiskAgreements', 'cancel'],
  createdBy: '[Người lập kiểm thử]',
  noEffectivePlan: false,
}
beforeEach(() => {
  api = mockRoutes()
  api.on('GET', '/care-plans/17', json(200, plan, { ETag: '"4"' }))
  api.on('GET', '/task-types', json(200, [{ id: 5, name: 'Loại kiểm thử', status: 'ACTIVE', group: 'OTHER' }]))
})
afterEach(() => vi.unstubAllGlobals())

it('Q447_guiBacSiDuyet_luuMucRoiGuiKhongCoNgay', async () => {
  api.on('PUT', '/care-plans/17/items', json(200, null))
  api.on('POST', '/care-plans/17/submit', json(200, null))
  render(<CarePlanDetail planId={17} onChanged={vi.fn()} />)
  expect(await screen.findByText('Bản sửa đang soạn')).toBeInTheDocument()
  expect(screen.queryByLabelText('Ngày hiệu lực đề xuất')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Lý do sửa'), { target: { value: 'Theo đánh giá mới' } })
  fireEvent.click(screen.getByRole('button', { name: 'Gửi Bác sĩ duyệt' }))
  await waitFor(() => expect(api.calls('POST', '/care-plans/17/submit')).toHaveLength(1))
  expect(api.calls('PUT', '/care-plans/17/items')[0][1].headers['If-Match']).toBe('"4"')
  expect(JSON.parse(api.calls('POST', '/care-plans/17/submit')[0][1].body)).toEqual({
    changeReason: 'Theo đánh giá mới',
  })
})

it('Q447_guiLaiSauKhiThieuLyDo_dungETagMoiKhongBao412', async () => {
  api.on('PUT', '/care-plans/17/items', json(200, null))
  api.on('POST', '/care-plans/17/submit', problem(422, 'REASON_REQUIRED'))
  render(<CarePlanDetail planId={17} onChanged={vi.fn()} />)
  await screen.findByText('Bản sửa đang soạn')
  // Sau khi lưu mục, backend tăng phiên bản dữ liệu
  api.on('GET', '/care-plans/17', json(200, plan, { ETag: '"5"' }))
  fireEvent.click(screen.getByRole('button', { name: 'Gửi Bác sĩ duyệt' }))
  expect(await screen.findByText('Nhập lý do trước khi thực hiện.')).toBeInTheDocument()
  api.on('POST', '/care-plans/17/submit', json(200, null))
  fireEvent.change(screen.getByLabelText('Lý do sửa'), { target: { value: 'Sau ngã' } })
  fireEvent.click(screen.getByRole('button', { name: 'Gửi Bác sĩ duyệt' }))
  await waitFor(() => expect(api.calls('PUT', '/care-plans/17/items')).toHaveLength(2))
  expect(api.calls('PUT', '/care-plans/17/items')[1][1].headers['If-Match']).toBe('"5"')
})

it('Q447_choDuyet_nguoiLapThayRutLai', async () => {
  api.on(
    'GET',
    '/care-plans/17',
    json(200, { ...plan, status: 'PENDING_APPROVAL', allowedCommands: ['retract', 'cancel'] }, { ETag: '"5"' }),
  )
  api.on('POST', '/care-plans/17/retract', json(200, null))
  render(<CarePlanDetail planId={17} onChanged={vi.fn()} />)
  expect(await screen.findByText('Chờ Bác sĩ duyệt')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Thu hồi duyệt' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Rút lại' }))
  await waitFor(() => expect(api.calls('POST', '/care-plans/17/retract')).toHaveLength(1))
})

it('Q447_choDuyet_bacSiThayThayDoiSoVoiHienHanh', async () => {
  api.on(
    'GET',
    '/care-plans/17',
    json(200, { ...plan, status: 'PENDING_APPROVAL', allowedCommands: ['approve', 'return'] }, { ETag: '"5"' }),
  )
  api.on(
    'GET',
    '/care-plans/compare',
    json(200, { added: [{ id: 9, taskTypeId: 5, content: 'Mục thêm kiểm thử' }], removed: [], changed: [] }),
  )
  render(<CarePlanDetail planId={17} currentPlanId={11} resident="[Họ tên kiểm thử] · NCT-077" onChanged={vi.fn()} />)
  expect(await screen.findByRole('article', { name: 'Loại kiểm thử' })).toBeInTheDocument()
  expect(screen.getByText('[Họ tên kiểm thử] · NCT-077')).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Thay đổi so với hiện hành' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('tab', { name: 'Mục công việc' })).toBeInTheDocument()
  // Chủ dự án bỏ phần thỏa thuận rủi ro khỏi màn kế hoạch (2026-11-26)
  expect(screen.queryByRole('tab', { name: 'Thỏa thuận có rủi ro' })).not.toBeInTheDocument()
  expect(screen.getByText('Duyệt xong, bản sửa áp dụng từ ngày mai.')).toBeInTheDocument()
  const [url] = api.calls('GET', '/care-plans/compare')[0]
  expect(new URL(url, 'http://localhost').searchParams.get('from')).toBe('11')
  expect(new URL(url, 'http://localhost').searchParams.get('to')).toBe('17')
  expect(screen.getByRole('button', { name: 'Duyệt' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Trả lại' })).toBeInTheDocument()
})

it('FR_007_nutLenhChiTheoAllowedCommands', async () => {
  api.on('GET', '/care-plans/17', json(200, { ...plan, status: 'EFFECTIVE', allowedCommands: [] }, { ETag: '"5"' }))
  render(<CarePlanDetail planId={17} onChanged={vi.fn()} />)
  expect(await screen.findByText('Hiệu lực')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Gửi Bác sĩ duyệt' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Lưu nháp' })).not.toBeInTheDocument()
})

it('FR_004_412HienGiaTriMoiVaTaiLaiKhongGhiDe', async () => {
  api.on(
    'PUT',
    '/care-plans/17/items',
    problem(412, 'VERSION_MISMATCH', { currentValue: { version: 5, status: 'PENDING_APPROVAL' } }),
  )
  render(<CarePlanDetail planId={17} onChanged={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Lưu nháp' }))
  expect(await screen.findByText('Dữ liệu đã thay đổi')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Tải lại kế hoạch' })).toBeInTheDocument()
  const [, request] = api.calls('PUT', '/care-plans/17/items')[0]
  expect(request.headers['If-Match']).toBe('"4"')
  expect(request.headers['Idempotency-Key']).toBeTruthy()
  expect(api.calls('PUT', '/care-plans/17/items')).toHaveLength(1)
})

it('FR_003_boBanSuaBatBuocLyDoTaiO', async () => {
  render(<CarePlanDetail planId={17} onChanged={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Bỏ bản sửa' }))
  expect(await screen.findByText('Nhập lý do trước khi thực hiện.')).toBeInTheDocument()
  expect(api.calls('POST', '/care-plans/17/cancel')).toHaveLength(0)
})

it('Figma_banSuaDangSoan_tieuDeVaTheThongTin_nutCoDinhCuoiPanel', async () => {
  render(<CarePlanDetail planId={17} onChanged={vi.fn()} />)
  expect(await screen.findByRole('heading', { name: 'Bản sửa kế hoạch' })).toBeInTheDocument()
  expect(screen.getByText('Người lập')).toBeInTheDocument()
  expect(screen.getByText('[Người lập kiểm thử]')).toBeInTheDocument()
  expect(screen.getByText('Chưa duyệt')).toBeInTheDocument()
  // Chỉ còn một phần nên không hiện tab; không còn phần thỏa thuận rủi ro (chủ dự án 2026-11-26)
  expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Mục công việc' })).toBeInTheDocument()
  expect(screen.queryByText(/Thỏa thuận/)).not.toBeInTheDocument()
})
