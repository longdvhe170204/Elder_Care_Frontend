import { beforeEach, expect, it, vi } from 'vitest'
import { pickResident } from '@/test/pickResident'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { getCostsBillingSources, postCostsItemsFromEvents } from '@/api'
import { BillingSources } from './BillingSources'

// Demo 2026-11-25 (E, chờ chủ dự án duyệt Q-307 khi review PR): một nút gom mọi nguồn chưa lập khoản của mọi loại
// trong khoảng ngày rồi lập hàng loạt, để không sót khoản trước khi chốt, nhất là kỳ cuối trước xuất viện.
vi.mock('@/api', () => ({
  getCostsBillingSources: vi.fn(),
  postCostsItemsFromEvents: vi.fn(),
  getContracts: vi.fn().mockResolvedValue({
    data: [
      { id: 3, status: 'ENDED', startDate: '2025-01-01' },
      { id: 4, status: 'ACTIVE', startDate: '2026-11-01' },
    ],
  }),
  getResidents: vi.fn().mockResolvedValue({
    data: { items: [{ id: 42, profileCode: 'NCT-0042', personalInfo: { fullName: 'Nguyễn Văn Tư' } }] },
  }),
}))

const day = (date, existingItemId) => ({
  sourceType: 'RESIDENCY_DAY',
  sourceId: `42:${date}`,
  billingUnit: 'DAY',
  incurredOn: date,
  quantity: 1,
  unit: 'ngày',
  description: 'Phí lưu trú',
  ...(existingItemId && { existingItemId }),
})

beforeEach(() => {
  vi.clearAllMocks()
  getCostsBillingSources.mockImplementation(({ query }) =>
    Promise.resolve({
      data:
        query.type === 'RESIDENCY_DAY'
          ? [day('2026-11-01', 9), day('2026-11-02')]
          : query.type === 'DOSE'
            ? [{ sourceType: 'DOSE', sourceId: 'dose:5', billingUnit: 'DOSE', incurredOn: '2026-11-02', quantity: 1 }]
            : [],
    }),
  )
  postCostsItemsFromEvents.mockImplementation(({ body }) =>
    Promise.resolve({
      data:
        body.sourceType === 'DOSE'
          ? { succeededIds: [], skipped: [{ source: 'dose:5', reason: 'Ngày chưa kết thúc' }] }
          : { succeededIds: [101], skipped: [] },
    }),
  )
})

async function fillFilter() {
  render(<BillingSources />)
  await pickResident('Nguyễn Văn Tư', { label: 'Người cao tuổi' })
  fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-11-01' } })
  fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2026-11-02' } })
}

it('gomToanBo_traMoiLoaiNguon_chiLapNguonChuaCoKhoan_baoKetQuaTheoLoai', async () => {
  await fillFilter()
  fireEvent.click(screen.getByRole('button', { name: 'Gom toàn bộ chi phí chưa lập' }))

  await waitFor(() => expect(postCostsItemsFromEvents).toHaveBeenCalledTimes(2))
  expect(getCostsBillingSources).toHaveBeenCalledTimes(9)
  const bodies = postCostsItemsFromEvents.mock.calls.map(([call]) => call.body)
  expect(bodies).toContainEqual({
    residentId: 42,
    sourceType: 'RESIDENCY_DAY',
    sourceUnits: [{ sourceId: '42:2026-11-02', billingUnit: 'DAY' }],
  })
  expect(bodies).toContainEqual({
    residentId: 42,
    sourceType: 'DOSE',
    sourceUnits: [{ sourceId: 'dose:5', billingUnit: 'DOSE' }],
  })
  const keys = postCostsItemsFromEvents.mock.calls.map(([call]) => call.headers['Idempotency-Key'])
  expect(new Set(keys).size).toBe(2)
  expect(await screen.findByText('Đã gom: lập 1 khoản, bỏ qua 1 nguồn.')).toBeInTheDocument()
  expect(screen.getByText(/Ngày lưu trú: lập 1/)).toBeInTheDocument()
  expect(screen.getByText(/Liều thuốc: lập 0, bỏ qua 1/)).toBeInTheDocument()
  expect(screen.getByText(/Ngày chưa kết thúc/)).toBeInTheDocument()
})

it('gomToanBo_khongConNguonChuaLap_baoKhongCoGiDeGom', async () => {
  getCostsBillingSources.mockResolvedValue({ data: [day('2026-11-01', 9)] })
  await fillFilter()
  fireEvent.click(screen.getByRole('button', { name: 'Gom toàn bộ chi phí chưa lập' }))
  expect(await screen.findByText('Mọi nguồn trong khoảng ngày đã có khoản, không còn gì để gom.')).toBeInTheDocument()
  expect(postCostsItemsFromEvents).not.toHaveBeenCalled()
})

it('gomToanBo_thieuNguoiHoacNgay_khongGoi', async () => {
  render(<BillingSources />)
  fireEvent.click(await screen.findByRole('button', { name: 'Gom toàn bộ chi phí chưa lập' }))
  expect(screen.getByText('Chọn người cao tuổi, từ ngày và đến ngày trước khi gom.')).toBeInTheDocument()
  expect(getCostsBillingSources).not.toHaveBeenCalled()
})

// Demo 2026-11-26 (E): mở từ điều kiện (a) của Kết thúc lưu trú: chọn sẵn người cao tuổi, khoảng ngày tự tính từ ngày bắt
// đầu hợp đồng đang hiệu lực tới ngày kết thúc dự kiến, không cần chọn ngày
it('moTuKetThucLuuTru_khoangNgayTuTinh_khongCanChonNgay', async () => {
  render(<BillingSources preset={{ residentId: 42, until: '2026-11-28' }} />)
  expect(
    await screen.findByText('Khoảng ngày: 01/11/2026 (bắt đầu hợp đồng) đến 28/11/2026 (kết thúc dự kiến).'),
  ).toBeInTheDocument()
  expect(screen.queryByLabelText('Từ ngày')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Gom toàn bộ chi phí chưa lập' }))
  await waitFor(() => expect(postCostsItemsFromEvents).toHaveBeenCalled())
  expect(getCostsBillingSources).toHaveBeenCalledWith({
    query: { residentId: 42, type: 'RESIDENCY_DAY', from: '2026-11-01', to: '2026-11-28' },
  })
})

// Demo 2026-11-26: nguồn bị bỏ qua nêu ngày và giải thích lý do
it('gomToanBo_boQuaNgayLuuTru_neuNgayVaGiaiThich', async () => {
  postCostsItemsFromEvents.mockImplementation(({ body }) =>
    Promise.resolve({
      data:
        body.sourceType === 'RESIDENCY_DAY'
          ? { succeededIds: [], skipped: [{ source: '42:2026-11-02', reason: 'Ngày ngoài thời gian tính phí' }] }
          : { succeededIds: [], skipped: [] },
    }),
  )
  await fillFilter()
  fireEvent.click(screen.getByRole('button', { name: 'Gom toàn bộ chi phí chưa lập' }))
  expect(
    await screen.findByText('Ngày lưu trú: lập 0, bỏ qua 1 (02/11/2026: Ngày ngoài thời gian tính phí)'),
  ).toBeInTheDocument()
  expect(
    screen.getByText(/Ngày ngoài thời gian tính phí là ngày sau ngày kết thúc lưu trú, trước ngày bắt đầu hợp đồng/),
  ).toBeInTheDocument()
})
