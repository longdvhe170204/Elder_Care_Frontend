import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { DashboardPage, REFRESH_MS } from './DashboardPage'

// 016 T010: khối theo nhóm backend trả, "—" khi mẫu số 0, số mở danh sách bản ghi, 304 giữ số đang hiện,
// không có phạm vi thì thông điệp (FR-020, FR-021, FR-009).

let api

const LICENSE = {
  metricCode: 'LICENSE.FACILITY',
  value: 1,
  numerator: null,
  denominator: null,
  labels: [],
  pendingReviewCount: 0,
  breakdown: [],
}

function dashboard(blocks, message = null) {
  return json(200, { asOf: '2026-10-24T03:15:30Z', blocks, message }, { ETag: '"a1"' })
}

beforeEach(() => {
  localStorage.clear()
  api = mockRoutes()
  api.on(
    'GET',
    '/metric-catalog',
    json(200, [
      {
        code: 'LICENSE.FACILITY',
        group: 'FACILITY_LICENSES',
        name: 'Giấy phép cơ sở sắp hết hạn',
        definition: 'Hết hạn trong CFG-M06-02',
        source: '007',
      },
    ]),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// Nhóm chỉ tiêu mở tại chỗ (DESIGN.md 6.17.0): mặc định đóng, bấm tên nhóm thì mở
function openGroup(name) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }))
}

const value = (metricCode, v, breakdown = []) => ({ ...LICENSE, metricCode, value: v, breakdown })

describe('DashboardPage', () => {
  it('FR_020_khoiTheoNhom_soVaNhan_khoiChuaCoNguon', async () => {
    api.on(
      'GET',
      '/dashboard',
      dashboard([
        { group: 'FACILITY_LICENSES', status: 'COMPLETE', values: [LICENSE] },
        { group: 'INCURRED_COSTS', status: 'COMPLETE', values: [] },
      ]),
    )
    render(<DashboardPage role="NURSING_HOME_MANAGER" />)

    expect(await screen.findByRole('button', { name: /^Giấy phép cơ sở/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tổng quan toàn viện hôm nay' })).toBeInTheDocument()
    expect(screen.getByText(/Cập nhật lúc 10:15:30/)).toBeInTheDocument()
    openGroup('Chi phí')
    expect(screen.getByText(/Chưa có dữ liệu: module nguồn/)).toBeInTheDocument()
  })

  // DESIGN.md 7.2 `dashboard-attention`: chỉ chỉ tiêu trong bảng tông có giá trị > 0; Gấp trước Cần chú ý; cảnh báo leo
  // thang tối đa chưa tiếp nhận (007 FR-034) đứng đầu và mở màn Cảnh báo
  it('canChuY_chiGiaTriLonHon0_thuTuTong_leoThangToiDaDauTien', async () => {
    api.on(
      'GET',
      '/dashboard',
      dashboard([
        { group: 'FACILITY_LICENSES', status: 'COMPLETE', values: [LICENSE] },
        { group: 'CARE_TASKS', status: 'COMPLETE', values: [value('TASK.OVERDUE', 3), value('TASK.TODAY', 40)] },
        { group: 'HEALTH_EVENTS', status: 'COMPLETE', values: [value('HEALTH.ALERTS', 0)] },
      ]),
    )
    api.on(
      'GET',
      (u) => u.pathname === '/api/v1/alerts' && u.searchParams.get('maxEscalationReached') === 'true',
      json(200, [{ id: 1 }, { id: 2 }]),
    )
    const onNavigate = vi.fn()
    render(<DashboardPage role="NURSING_HOME_MANAGER" onNavigate={onNavigate} />)

    const card = await screen.findByRole('region', { name: /Cần chú ý/ })
    await within(card).findByText(/leo thang tối đa/)
    const rows = within(card).getAllByRole('button')
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/^2.*leo thang tối đa/),
      expect.stringMatching(/^3/),
      expect.stringMatching(/^1.*Giấy phép cơ sở sắp hết hạn/),
    ])
    expect(within(card).queryByText(/HEALTH.ALERTS|TASK.TODAY/)).not.toBeInTheDocument()
    const [url] = api.calls('GET', '/alerts')[0]
    expect(new URL(url, 'http://localhost').searchParams.getAll('status')).toEqual(['NEW', 'ESCALATED'])

    fireEvent.click(rows[0])
    expect(onNavigate).toHaveBeenCalledWith('alerts', undefined)
  })

  it('canChuY_khongCoViecTon_motDong', async () => {
    api.on(
      'GET',
      '/dashboard',
      dashboard([{ group: 'CARE_TASKS', status: 'COMPLETE', values: [value('TASK.OVERDUE', 0)] }]),
    )
    api.on('GET', '/alerts', json(200, []))
    render(<DashboardPage role="NURSING_HOME_MANAGER" />)

    const card = await screen.findByRole('region', { name: /Cần chú ý/ })
    expect(within(card).getByText('Không có việc tồn trong phạm vi của bạn.')).toBeInTheDocument()
    // bản phác phương án B: nói rõ đã xét bao nhiêu chỉ tiêu (TASK.OVERDUE và cảnh báo leo thang tối đa)
    expect(await within(card).findByText('Đã xét 2 chỉ tiêu lúc 10:15:30.')).toBeInTheDocument()
  })

  // Danh mục chỉ tiêu tải lỗi (phiên hết hạn, backend khởi động lại) thì thử lại ở lần làm mới, không hiện mã
  it('danhMucChiTieu_loiLanDau_thuLaiKhiLamMoi', async () => {
    let metricCalls = 0
    api.on('GET', '/metric-catalog', () => {
      metricCalls += 1
      return metricCalls === 1
        ? problem(403, 'PERMISSION_DENIED')
        : json(200, [{ code: 'TASK.TODAY', group: 'CARE_TASKS', name: 'Công việc hôm nay', definition: '', source: '005' }])
    })
    api.on('GET', '/dashboard', () =>
      dashboard([{ group: 'CARE_TASKS', status: 'COMPLETE', values: [value('TASK.TODAY', 40)] }]),
    )
    render(<DashboardPage role="NURSING_HOME_MANAGER" />)
    const card = await screen.findByRole('region', { name: 'Tình hình' })
    await within(card).findByText('TASK.TODAY')
    // không lặng lẽ hiện mã: báo rõ và cho thử lại ngay (trình duyệt có thể chặn request, 2026-11-20)
    expect(await screen.findByText(/Không tải được tên chỉ tiêu/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await within(card).findByText('Công việc hôm nay')).toBeInTheDocument()
    expect(screen.queryByText(/Không tải được tên chỉ tiêu/)).toBeNull()
  })

  // Tình hình: số chính của Người cao tuổi, Phòng giường, Công việc; chia theo tầng hiện tên tầng của 003
  it('tinhHinh_soChinh_tenTang', async () => {
    api.on(
      'GET',
      '/dashboard',
      dashboard([
        {
          group: 'BEDS',
          status: 'COMPLETE',
          values: [
            value('BED.OCCUPANTS', 2, [
              { key: '9001', value: 1 },
              { key: '9002', value: 1 },
            ]),
          ],
        },
        { group: 'CARE_TASKS', status: 'COMPLETE', values: [value('TASK.TODAY', 40)] },
      ]),
    )
    api.on(
      'GET',
      '/floors',
      json(200, [
        { id: 9001, name: 'Tầng 1' },
        { id: 9002, name: 'Tầng 2' },
      ]),
    )
    render(<DashboardPage role="NURSING_HOME_MANAGER" />)

    const card = await screen.findByRole('region', { name: 'Tình hình' })
    expect(within(card).getByRole('button', { name: /TASK.TODAY/ })).toHaveTextContent('40')
    openGroup('Phòng, giường')
    expect(await screen.findAllByText(/Tầng 1/)).not.toHaveLength(0)
    expect(screen.queryByText(/Tầng\/khu 9001/)).not.toBeInTheDocument()
  })

  // Đề xuất B (chủ dự án duyệt 2026-11-17): breakdown cộng đúng bằng tổng thì vẽ thanh chồng kèm chú thích tên và số
  it('FR_020_breakdownCongDuTong_veThanhChong_kemChuThich', async () => {
    api.on(
      'GET',
      '/dashboard',
      dashboard([
        {
          group: 'FACILITY_LICENSES',
          status: 'COMPLETE',
          values: [
            {
              ...LICENSE,
              value: 3,
              breakdown: [
                { key: 'A', value: 2 },
                { key: 'B', value: 1 },
              ],
            },
          ],
        },
      ]),
    )
    render(<DashboardPage role="NURSING_HOME_MANAGER" />)

    await screen.findByText('Giấy phép cơ sở')
    openGroup('Giấy phép cơ sở')
    const legend = await screen.findByRole('list', { name: 'Chú thích Giấy phép cơ sở sắp hết hạn' })
    expect(within(legend).getAllByRole('listitem')).toHaveLength(2)
    const group = screen.getByRole('region', { name: 'Giấy phép cơ sở' })
    expect(within(group).getByRole('button', { name: /Giấy phép cơ sở sắp hết hạn/ })).toHaveTextContent('3')
  })

  it('FR_008_mauSo0_hienGachNgang', async () => {
    api.on(
      'GET',
      '/dashboard',
      dashboard([
        {
          group: 'FACILITY_LICENSES',
          status: 'COMPLETE',
          values: [{ ...LICENSE, value: null, labels: ['NO_DATA'] }],
        },
      ]),
    )
    render(<DashboardPage role="NURSING_HOME_MANAGER" />)

    await screen.findByText('Giấy phép cơ sở')
    openGroup('Giấy phép cơ sở')
    const button = await screen.findByRole('button', { name: /Giấy phép cơ sở sắp hết hạn/ })
    expect(within(button).getByText('—')).toBeInTheDocument()
    expect(within(button).getAllByText('không có dữ liệu').length).toBeGreaterThan(0)
  })

  it('FR_009_bamSo_moDanhSachBanGhi', async () => {
    api.on('GET', '/dashboard', dashboard([{ group: 'FACILITY_LICENSES', status: 'COMPLETE', values: [LICENSE] }]))
    api.on(
      'GET',
      '/metric-details/LICENSE.FACILITY',
      json(200, {
        metricCode: 'LICENSE.FACILITY',
        total: 1,
        rows: [
          {
            sourceKey: 'M06.FACILITY_LICENSE:1',
            feature: '007',
            type: 'FACILITY_LICENSE',
            status: null,
            referenceTime: null,
            floorArea: null,
            resident: null,
            reduced: false,
            performedBy: null,
            result: { name: 'Giấy phép hoạt động', daysRemaining: 45 },
            pendingReview: false,
            canOpenRecord: false,
          },
        ],
      }),
    )
    render(<DashboardPage role="NURSING_HOME_MANAGER" />)

    const card = await screen.findByRole('region', { name: /Cần chú ý/ })
    fireEvent.click(within(card).getByRole('button', { name: /Giấy phép cơ sở sắp hết hạn/ }))
    expect(await screen.findByText(/name: Giấy phép hoạt động, daysRemaining: 45/)).toBeInTheDocument()
    expect(screen.getByText('1 bản ghi')).toBeInTheDocument()
  })

  it('FR_021_lamMoi_304_giuSoDangHien_guiIfNoneMatch', async () => {
    let calls = 0
    api.on('GET', '/dashboard', () => {
      calls += 1
      return calls === 1
        ? dashboard([{ group: 'FACILITY_LICENSES', status: 'COMPLETE', values: [LICENSE] }])
        : new Response(null, { status: 304 })
    })
    render(<DashboardPage role="NURSING_HOME_MANAGER" />)
    await screen.findByText('Giấy phép cơ sở')

    fireEvent.click(screen.getByRole('button', { name: 'Làm mới' }))
    await vi.waitFor(() => expect(calls).toBe(2))

    expect(screen.getByText('Giấy phép cơ sở')).toBeInTheDocument()
    const [, init] = api.calls('GET', '/dashboard')[1]
    expect(init.headers['If-None-Match']).toBe('"a1"')
  })

  // DESIGN.md 9.3 (2.2.2) và 002 T047a: tự làm mới gửi X-Background-Refresh, tạm dừng được, tiếp tục thì tải ngay
  it('tuLamMoi_yeuCauNen_tamDungThiNgung_tiepTucTaiNgay', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    api.on('GET', '/dashboard', () =>
      dashboard([{ group: 'FACILITY_LICENSES', status: 'COMPLETE', values: [LICENSE] }]),
    )
    render(<DashboardPage role="NURSING_HOME_MANAGER" />)
    await screen.findByText('Giấy phép cơ sở')

    act(() => vi.advanceTimersByTime(REFRESH_MS))
    await vi.waitFor(() => expect(api.calls('GET', '/dashboard')).toHaveLength(2))
    expect(api.calls('GET', '/dashboard')[1][1].headers['X-Background-Refresh']).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Tạm dừng tự làm mới' }))
    expect(screen.getByText(/đã tạm dừng tự làm mới/)).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(REFRESH_MS * 3))
    expect(api.calls('GET', '/dashboard')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục tự làm mới' }))
    await vi.waitFor(() => expect(api.calls('GET', '/dashboard')).toHaveLength(3))
    expect(api.calls('GET', '/dashboard')[2][1].headers['X-Background-Refresh']).toBeUndefined()
  })

  it('FR_020_khongCoPhamVi_thongDiep', async () => {
    api.on('GET', '/dashboard', dashboard([], 'Hiện không có phạm vi phân công'))
    render(<DashboardPage role="NURSING_STAFF" />)

    expect(await screen.findByText('Hiện không có phạm vi phân công')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tổng quan trong phạm vi của bạn hôm nay' })).toBeInTheDocument()
  })

  it('loiTai_hienThuLai', async () => {
    api.on('GET', '/dashboard', problem(403, 'PERMISSION_DENIED'))
    render(<DashboardPage role="NURSING_HOME_MANAGER" />)

    expect(await screen.findByText('Không tải được tổng quan')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument()
  })
})
