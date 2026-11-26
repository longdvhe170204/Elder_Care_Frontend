import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  // Q-450: không còn ô "Lý do sửa"; hệ thống ghi lý do từ các yêu cầu xem xét
  expect(screen.queryByLabelText('Lý do sửa')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Gửi Bác sĩ duyệt' }))
  await waitFor(() => expect(api.calls('POST', '/care-plans/17/submit')).toHaveLength(1))
  expect(api.calls('PUT', '/care-plans/17/items')[0][1].headers['If-Match']).toBe('"4"')
  expect(JSON.parse(api.calls('POST', '/care-plans/17/submit')[0][1].body)).toEqual({})
})

it('Q447_guiLaiSauKhiGuiLoi_dungETagMoiKhongBao412', async () => {
  api.on('PUT', '/care-plans/17/items', json(200, null))
  api.on('POST', '/care-plans/17/submit', problem(409, 'EMPTY_PLAN'))
  render(<CarePlanDetail planId={17} onChanged={vi.fn()} />)
  await screen.findByText('Bản sửa đang soạn')
  // Sau khi lưu mục, backend tăng phiên bản dữ liệu
  api.on('GET', '/care-plans/17', json(200, plan, { ETag: '"5"' }))
  fireEvent.click(screen.getByRole('button', { name: 'Gửi Bác sĩ duyệt' }))
  await waitFor(() => expect(api.calls('POST', '/care-plans/17/submit')).toHaveLength(1))
  api.on('POST', '/care-plans/17/submit', json(200, null))
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
  expect(screen.getByRole('tab', { name: 'Thay đổi so với kế hoạch đang áp dụng' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
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

it('FR_003_boBanSuaNguoiKhac_hopXacNhanCoLyDo_Q449', async () => {
  // Q-449: bản Nháp của người khác (allowedCommands có cancel) vẫn bắt buộc lý do
  api.on('POST', '/care-plans/17/cancel', json(200, null))
  render(<CarePlanDetail planId={17} onChanged={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Bỏ bản sửa' }))
  const ask = await screen.findByRole('alertdialog', { name: 'Bỏ bản sửa này?' })
  expect(within(ask).getByText(/Kế hoạch đang áp dụng giữ nguyên/)).toBeInTheDocument()
  fireEvent.click(within(ask).getByRole('button', { name: 'Bỏ bản sửa' }))
  expect(await within(ask).findByText('Nhập lý do bỏ bản sửa.')).toBeInTheDocument()
  expect(api.calls('POST', '/care-plans/17/cancel')).toHaveLength(0)
  fireEvent.change(within(ask).getByLabelText('Lý do bỏ bản sửa'), { target: { value: 'Bác sĩ giữ kế hoạch cũ' } })
  fireEvent.click(within(ask).getByRole('button', { name: 'Bỏ bản sửa' }))
  await waitFor(() => expect(api.calls('POST', '/care-plans/17/cancel')).toHaveLength(1))
  expect(JSON.parse(api.calls('POST', '/care-plans/17/cancel')[0][1].body)).toEqual({
    reason: 'Bác sĩ giữ kế hoạch cũ',
  })
})

it('Q447_banNhap_daiBaoChuaApDung_vaTabThayDoi', async () => {
  api.on('GET', '/care-plans/compare', json(200, { added: [{ id: 9, taskTypeId: 5 }], removed: [], changed: [] }))
  render(<CarePlanDetail planId={17} currentPlanId={11} currentEffectiveFrom="2026-11-26" onChanged={vi.fn()} />)
  expect(await screen.findByRole('heading', { name: 'Bản nháp sửa kế hoạch' })).toBeInTheDocument()
  expect(screen.getByText(/Bản nháp – chưa áp dụng\./)).toBeInTheDocument()
  expect(screen.getByText(/Do \[Người lập kiểm thử\] lập\./)).toBeInTheDocument()
  expect(screen.getByText(/Kế hoạch đang áp dụng vẫn là bản hiệu lực từ 26\/11\/2026\./)).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Mục công việc' })).toHaveAttribute('aria-selected', 'true')
  fireEvent.click(screen.getByRole('tab', { name: 'Thay đổi so với kế hoạch đang áp dụng' }))
  expect(await screen.findByRole('article', { name: 'Loại kiểm thử' })).toBeInTheDocument()
})

it('Figma_banSuaDangSoan_tieuDeVaTheThongTin_nutCoDinhCuoiPanel', async () => {
  render(<CarePlanDetail planId={17} onChanged={vi.fn()} />)
  expect(await screen.findByRole('heading', { name: 'Bản nháp sửa kế hoạch' })).toBeInTheDocument()
  expect(screen.getByText('Người lập')).toBeInTheDocument()
  expect(screen.getByText('[Người lập kiểm thử]')).toBeInTheDocument()
  expect(screen.getByText('Chưa duyệt')).toBeInTheDocument()
  // Chỉ còn một phần nên không hiện tab; không còn phần thỏa thuận rủi ro (chủ dự án 2026-11-26)
  expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Mục công việc' })).toBeInTheDocument()
  expect(screen.queryByText(/Thỏa thuận/)).not.toBeInTheDocument()
})

it('Q448_soanKeHoach_hienCanCuDanhGiaGanNhatCuaBacSi', async () => {
  api.on(
    'GET',
    '/residents/77/assessments',
    json(200, [
      { id: 3, status: 'CONFIRMED', confirmedAt: '2026-10-01T02:00:00Z', careLevel: 'BASIC', careNeeds: [] },
      {
        id: 4,
        status: 'CONFIRMED',
        confirmedAt: '2026-11-25T02:00:00Z',
        confirmedBy: 'Lê Văn Minh',
        careLevel: 'REGULAR',
        careNeeds: [
          { id: 1, name: 'Hỗ trợ đi lại' },
          { id: 2, name: 'Hỗ trợ ăn uống' },
        ],
        careNote: 'Đi lại phải có người đỡ',
        comment: 'Yếu chân trái sau ngã',
      },
      { id: 5, status: 'DRAFT', careLevel: 'SPECIAL', careNeeds: [] },
    ]),
  )
  render(<CarePlanDetail planId={17} onChanged={vi.fn()} />)
  const basis = await screen.findByRole('region', { name: 'Căn cứ: đánh giá của Bác sĩ' })
  expect(await within(basis).findByText('Hỗ trợ đi lại')).toBeInTheDocument()
  expect(within(basis).getByText('Hỗ trợ ăn uống')).toBeInTheDocument()
  expect(within(basis).getByText('Thường xuyên')).toBeInTheDocument()
  expect(within(basis).getByText('Đi lại phải có người đỡ')).toBeInTheDocument()
  expect(within(basis).getByText('Yếu chân trái sau ngã')).toBeInTheDocument()
  expect(within(basis).getByText(/Lê Văn Minh/)).toBeInTheDocument()
})

it('Q449_nguoiLapBoBanNhapCuaMinh_khongHoiLyDo', async () => {
  api.on(
    'GET',
    '/care-plans/17',
    json(200, { ...plan, allowedCommands: ['submit', 'replaceItems', 'discardDraft'] }, { ETag: '"4"' }),
  )
  api.on('POST', '/care-plans/17/cancel', json(200, null))
  render(<CarePlanDetail planId={17} onChanged={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Bỏ bản nháp' }))
  const dialog = await screen.findByRole('alertdialog')
  expect(within(dialog).getByText('Bỏ bản nháp này?')).toBeInTheDocument()
  expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Bỏ bản nháp' }))
  await waitFor(() => expect(api.calls('POST', '/care-plans/17/cancel')).toHaveLength(1))
  expect(JSON.parse(api.calls('POST', '/care-plans/17/cancel')[0][1].body)).toEqual({})
})

it('Q449_boBanCuaNguoiKhac_vanBatBuocLyDo', async () => {
  api.on(
    'GET',
    '/care-plans/17',
    json(200, { ...plan, allowedCommands: ['cancel'], status: 'PENDING_APPROVAL' }, { ETag: '"4"' }),
  )
  render(<CarePlanDetail planId={17} onChanged={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Bỏ bản sửa' }))
  const dialog = await screen.findByRole('alertdialog')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Bỏ bản sửa' }))
  expect(await within(dialog).findByText('Nhập lý do bỏ bản sửa.')).toBeInTheDocument()
  expect(api.calls('POST', '/care-plans/17/cancel')).toHaveLength(0)
})

it('FR_003_bacSiBamTraLai_goiLenhTraLaiKemLyDo_khongGoiDuyet', async () => {
  api.on(
    'GET',
    '/care-plans/17',
    json(200, { ...plan, status: 'PENDING_APPROVAL', allowedCommands: ['approve', 'return'] }, { ETag: '"4"' }),
  )
  api.on('POST', '/care-plans/17/return', json(200, null))
  api.on('POST', '/care-plans/17/approve', json(200, null))
  render(<CarePlanDetail planId={17} onChanged={vi.fn()} />)
  fireEvent.change(await screen.findByLabelText('Lý do'), { target: { value: 'làm lại đê' } })
  fireEvent.click(screen.getByRole('button', { name: 'Trả lại' }))
  await waitFor(() => expect(api.calls('POST', '/care-plans/17/return')).toHaveLength(1))
  expect(api.calls('POST', '/care-plans/17/approve')).toHaveLength(0)
  expect(JSON.parse(api.calls('POST', '/care-plans/17/return')[0][1].body)).toEqual({ reason: 'làm lại đê' })
})

it('BF_01_buoc16_tomTatMuc_hienCacMocGio', async () => {
  api.on(
    'GET',
    '/care-plans/17',
    json(
      200,
      {
        ...plan,
        status: 'PENDING_APPROVAL',
        allowedCommands: [],
        items: [{ id: 1, content: 'Dìu đi bộ', frequencyType: 'TIMES_PER_DAY', timesPerDay: 2, times: ['08:00:00', '15:00:00'] }],
      },
      { ETag: '"5"' },
    ),
  )
  render(<CarePlanDetail planId={17} onChanged={vi.fn()} />)
  expect(await screen.findByText(/08:00, 15:00/)).toBeInTheDocument()
  expect(screen.queryByText(/Trong ca/)).not.toBeInTheDocument()
})
