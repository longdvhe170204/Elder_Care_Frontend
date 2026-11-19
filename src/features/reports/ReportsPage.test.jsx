import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { ReportsPage } from './ReportsPage'

// 016 màn Báo cáo: tab theo bảng FR-010, bảng tổng và chia nhóm, bấm giá trị mở danh sách bản ghi, hộp xuất (FR-061:
// định danh chỉ Quản lý viện, mục đích bắt buộc), tab Lần xuất (FR-062).

let api

const REPORT = {
  group: 'HEALTH_MEDICATION',
  from: '2026-10-01',
  to: '2026-10-24',
  asOf: '2026-10-24T03:15:00Z',
  filters: {},
  values: [
    {
      metricCode: 'MED.MISSED_RATE',
      value: 2.1,
      numerator: 12,
      denominator: 571,
      labels: ['DAY_NOT_ENDED'],
      pendingReviewCount: 0,
      breakdown: [{ key: '7', value: 1.8, numerator: 5, denominator: 280 }],
    },
  ],
  notes: [],
}

beforeEach(() => {
  api = mockRoutes()
  api.on(
    'GET',
    '/metrics',
    json(200, [
      { code: 'MED.MISSED_RATE', group: 'MEDICATION_DOSES', name: 'Tỷ lệ liều Bỏ lỡ', definition: '', source: '006' },
    ]),
  )
  api.on('GET', (u) => u.pathname.startsWith('/api/v1/reports/') && u.pathname !== '/api/v1/reports/exports', () =>
    json(200, REPORT),
  )
  vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-4000-8000-000000000001' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ReportsPage', () => {
  it('FR_010_tabTheoVaiTro', () => {
    const { unmount } = render(<ReportsPage role="ACCOUNTANT" />)
    expect(screen.getByRole('button', { name: 'Chi phí' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sức khỏe, thuốc' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Lần xuất' })).toBeInTheDocument()
    unmount()

    render(<ReportsPage role="FLOOR_MANAGER" />)
    expect(screen.queryByRole('button', { name: 'Chi phí' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Nhân sự, ca' })).toBeInTheDocument()
  })

  it('FR_051_chiPhi_chonCheDoTamTinh_guiCostMode', async () => {
    render(<ReportsPage role="ACCOUNTANT" />)
    fireEvent.click(screen.getByRole('button', { name: 'Chi phí' }))
    await screen.findByText('Tỷ lệ liều Bỏ lỡ')
    const reportCalls = () => api.fetchMock.mock.calls.map(([u]) => new URL(u, 'http://localhost')).filter((u) => u.pathname === '/api/v1/reports/INCURRED_COSTS')
    expect(reportCalls().at(-1).searchParams.get('costMode')).toBe('FINALIZED')
    // DESIGN.md 6.18.0: bộ lọc là ô chọn trên một hàng (hàng ô lọc, mục 7.2)
    fireEvent.change(screen.getByRole('combobox', { name: 'Chế độ chi phí' }), { target: { value: 'PROVISIONAL' } })
    await waitFor(() => expect(reportCalls().at(-1).searchParams.get('costMode')).toBe('PROVISIONAL'))
  })

  it('FR_060_nguoiCaoTuoi_locMucChamSoc_guiCareLevel', async () => {
    render(<ReportsPage role="NURSING_HOME_MANAGER" />)
    fireEvent.click(screen.getByRole('button', { name: 'Người cao tuổi' }))
    await screen.findByText('Tỷ lệ liều Bỏ lỡ')
    const reportCalls = () => api.fetchMock.mock.calls.map(([u]) => new URL(u, 'http://localhost')).filter((u) => u.pathname === '/api/v1/reports/RESIDENTS')
    expect(reportCalls().at(-1).searchParams.get('careLevel')).toBeNull()
    fireEvent.change(screen.getByRole('combobox', { name: 'Mức chăm sóc' }), { target: { value: 'REGULAR' } })
    await waitFor(() => expect(reportCalls().at(-1).searchParams.get('careLevel')).toBe('REGULAR'))
    fireEvent.click(screen.getByRole('button', { name: 'Chăm sóc' }))
    expect(screen.queryByRole('combobox', { name: 'Mức chăm sóc' })).toBeNull()
  })

  it('FR_009_bangTongVaChiaNhom_bamGiaTriMoDanhSach', async () => {
    api.on(
      'GET',
      '/metric-details/MED.MISSED_RATE',
      json(200, { metricCode: 'MED.MISSED_RATE', total: 0, rows: [] }),
    )
    render(<ReportsPage role="DOCTOR" />)
    fireEvent.click(screen.getByRole('button', { name: 'Sức khỏe, thuốc' }))

    expect(await screen.findByText('Tỷ lệ liều Bỏ lỡ')).toBeInTheDocument()
    // DESIGN.md 6.17.0 `report-table`: dòng tiêu đề nhóm chỉ tiêu; "ngày chưa kết thúc" gộp một lần trên bảng
    expect(screen.getByRole('cell', { name: 'Liều thuốc' })).toBeInTheDocument()
    expect(screen.getByText('12 / 571')).toBeInTheDocument()
    expect(screen.getByText(/Khoảng có ngày chưa kết thúc/)).toBeInTheDocument()
    expect(screen.queryByText('ngày chưa kết thúc')).toBeNull()
    expect(screen.getByText('Ca 7')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '1,8' }))

    expect(await screen.findByText('Không có bản ghi')).toBeInTheDocument()
    const [url] = api.calls('GET', '/metric-details/MED.MISSED_RATE')[0]
    expect(new URL(url, 'http://localhost').searchParams.get('breakdownKey')).toBe('7')
  })

  // DESIGN.md 6.17.0 (5.2 "Thanh trong ô bảng"): dòng chia nhóm có thanh dài theo phần của tổng; số vẫn là nút
  it('FR_009_thanhTrongO_dongChiaNhom_vaBangGiuNguyen', async () => {
    api.on(
      'GET',
      '/reports/HEALTH_MEDICATION',
      json(200, {
        ...REPORT,
        values: [
          {
            ...REPORT.values[0],
            value: 10,
            numerator: null,
            denominator: null,
            labels: [],
            breakdown: [
              { key: '7', value: 6 },
              { key: '8', value: 4 },
            ],
          },
        ],
      }),
    )
    render(<ReportsPage role="DOCTOR" />)
    fireEvent.click(screen.getByRole('button', { name: 'Sức khỏe, thuốc' }))

    const row = (await screen.findByText('Ca 7')).closest('tr')
    expect(row.querySelector('[data-slot="cell-bar"]').style.width).toBe('60%')
    expect(within(row).getByRole('button', { name: '6' })).toBeInTheDocument()
    expect(screen.getByText('Ca 8').closest('tr').querySelector('[data-slot="cell-bar"]').style.width).toBe('40%')
    expect(screen.queryByRole('region', { name: 'Biểu đồ' })).toBeNull()
  })

  it('FR_060_hienKhoangNgayDangXem', async () => {
    render(<ReportsPage role="DOCTOR" />)
    expect(await screen.findByText(/^\d{2}\/\d{2} → \d{2}\/\d{2}\/\d{4}$/)).toBeInTheDocument()
  })

  it('FR_042_soSuCoDaHuy_dongThamKhao', async () => {
    api.on('GET', '/reports/HEALTH_MEDICATION', json(200, { ...REPORT, cancelledIncidentCount: 3 }))
    render(<ReportsPage role="NURSING_HOME_MANAGER" />)
    fireEvent.click(screen.getByRole('button', { name: 'Sức khỏe, thuốc' }))

    expect(await screen.findByText('Số sự cố đã hủy: 3 (tham khảo, không tính vào chỉ tiêu nào)')).toBeInTheDocument()
  })

  it('FR_009_Q12_moBanGhi_chuyenSangManCuaFeatureSoHuu', async () => {
    api.on(
      'GET',
      '/metric-details/MED.MISSED_RATE',
      json(200, {
        metricCode: 'MED.MISSED_RATE',
        total: 2,
        rows: [
          { sourceKey: 'M05.INCIDENT:9', status: 'NEW', result: {}, canOpenRecord: true },
          { sourceKey: 'M07.DOSE:x', status: 'MISSED', result: {}, canOpenRecord: true },
        ],
      }),
    )
    const onNavigate = vi.fn()
    render(<ReportsPage role="DOCTOR" onNavigate={onNavigate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sức khỏe, thuốc' }))
    fireEvent.click(await screen.findByRole('button', { name: '2,1' }))

    const open = await screen.findAllByRole('button', { name: 'Mở bản ghi' })
    expect(open).toHaveLength(1)
    fireEvent.click(open[0])
    expect(onNavigate).toHaveBeenCalledWith('incidents', { incidentId: 9 })
  })

  it('FR_060_khoangQuaDai_hienLoi', async () => {
    api.on('GET', '/reports/RESIDENTS', problem(422, 'RANGE_EXCEEDS_MAXIMUM', { detail: 'Khoảng dài hơn 12 tháng' }))
    render(<ReportsPage role="NURSING_HOME_MANAGER" />)

    expect(await screen.findByText('Khoảng dài hơn 12 tháng')).toBeInTheDocument()
  })

  it('FR_061_quanLyVien_coDinhDanh_batBuocMucDich_roiXuat', async () => {
    api.on('POST', '/reports/RESIDENTS/export', json(201, { fileId: 7, auditLogId: 9 }))
    render(<ReportsPage role="NURSING_HOME_MANAGER" />)
    await screen.findByText('Tỷ lệ liều Bỏ lỡ')

    fireEvent.click(screen.getByRole('button', { name: 'Xuất file' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Có danh sách định danh người cao tuổi' }))
    const dialogExport = screen.getAllByRole('button', { name: 'Xuất file' }).at(-1)
    fireEvent.click(dialogExport)
    expect(await screen.findByText('Nhập mục đích xuất danh sách có định danh.')).toBeInTheDocument()
    expect(api.calls('POST', '/reports/RESIDENTS/export')).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('Mục đích xuất (bắt buộc)'), {
      target: { value: 'Họp giao ban an toàn thuốc' },
    })
    fireEvent.click(dialogExport)

    expect(await screen.findByRole('button', { name: 'Tải file' })).toBeInTheDocument()
    const [, init] = api.calls('POST', '/reports/RESIDENTS/export')[0]
    expect(JSON.parse(init.body)).toMatchObject({
      includeIdentity: true,
      purpose: 'Họp giao ban an toàn thuốc',
      format: 'XLSX',
    })
    expect(init.headers['Idempotency-Key']).toBeTruthy()
  })

  it('FR_061_vaiTroKhac_chiTongHop', async () => {
    render(<ReportsPage role="FLOOR_MANAGER" />)
    await screen.findByText('Tỷ lệ liều Bỏ lỡ')

    fireEvent.click(screen.getByRole('button', { name: 'Xuất file' }))

    expect(screen.getByText('File chỉ có số liệu tổng hợp.')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  async function openWithFloorFilter() {
    const filterOptions = {
      facilityWide: false,
      floorAreas: [
        { id: 1, name: 'Tầng 1' },
        { id: 2, name: 'Tầng 2' },
      ],
    }
    api.on('GET', (u) => u.pathname === '/api/v1/reports/HEALTH_MEDICATION', () => json(200, { ...REPORT, filterOptions }))
    api.on(
      'GET',
      '/metric-details/MED.MISSED_RATE',
      json(200, { metricCode: 'MED.MISSED_RATE', total: 0, rows: [] }),
    )
    api.on('POST', '/reports/HEALTH_MEDICATION/export', json(201, { fileId: 7, auditLogId: 9 }))
    render(<ReportsPage role="FLOOR_MANAGER" />)
    fireEvent.click(screen.getByRole('button', { name: 'Sức khỏe, thuốc' }))

    fireEvent.change(await screen.findByRole('combobox', { name: 'Tầng' }), { target: { value: '2' } })
    await screen.findByText('Tỷ lệ liều Bỏ lỡ')
  }

  it('FR_013_locTang_chiGiaTriTrongPhamVi_chiTietCungBoLoc', async () => {
    await openWithFloorFilter()

    expect(api.calls('GET', '/reports/HEALTH_MEDICATION').at(-1)[0]).toContain('floorAreaId=2')
    fireEvent.click(screen.getByRole('button', { name: '1,8' }))
    await vi.waitFor(() =>
      expect(api.calls('GET', '/metric-details/MED.MISSED_RATE').at(-1)[0]).toContain('floorAreaId=2'),
    )
  })

  it('FR_061_xuatCungBoLocVoiManHinh', async () => {
    await openWithFloorFilter()

    fireEvent.click(screen.getByRole('button', { name: 'Xuất file' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Xuất file' }))

    await vi.waitFor(() => {
      const [, init] = api.calls('POST', '/reports/HEALTH_MEDICATION/export').at(-1)
      expect(JSON.parse(init.body).filters).toEqual({ floorAreaId: [2] })
    })
  })

  it('FR_013_toanVien_lucTangTuDanhMuc003_haiTangTroLen', async () => {
    api.on('GET', (u) => u.pathname === '/api/v1/reports/HEALTH_MEDICATION', () =>
      json(200, { ...REPORT, filterOptions: { facilityWide: true, floorAreas: [] } }),
    )
    api.on(
      'GET',
      '/floors',
      json(200, [
        { id: 1, name: 'Tầng 1' },
        { id: 2, name: 'Tầng 2' },
      ]),
    )
    render(<ReportsPage role="DOCTOR" />)
    fireEvent.click(screen.getByRole('button', { name: 'Sức khỏe, thuốc' }))

    expect(await screen.findByRole('option', { name: 'Tầng 2' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Mọi tầng' })).toBeInTheDocument()
  })

  // Danh mục chỉ tiêu tải lỗi (phiên hết hạn, backend khởi động lại) thì thử lại ở lần tải báo cáo sau, không hiện mã
  it('danhMucChiTieu_loiLanDau_thuLaiKhiTaiBaoCao', async () => {
    let metricCalls = 0
    api.on('GET', '/metrics', () => {
      metricCalls += 1
      return metricCalls === 1
        ? problem(403, 'PERMISSION_DENIED')
        : json(200, [
            { code: 'MED.MISSED_RATE', group: 'MEDICATION_DOSES', name: 'Tỷ lệ liều Bỏ lỡ', definition: '', source: '006' },
          ])
    })
    render(<ReportsPage role="DOCTOR" />)
    fireEvent.click(screen.getByRole('button', { name: 'Sức khỏe, thuốc' }))

    expect(await screen.findByText('Tỷ lệ liều Bỏ lỡ')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Liều thuốc' })).toBeInTheDocument()
  })

  it('FR_062_lanXuat_bang', async () => {
    api.on(
      'GET',
      '/reports/exports',
      json(200, [
        {
          auditLogId: 9,
          fileId: 7,
          exportedAt: '2026-10-24T03:20:00Z',
          exportedBy: 5,
          role: 'AC-02',
          group: 'HEALTH_MEDICATION',
          from: '2026-10-01',
          to: '2026-10-24',
          includeIdentity: false,
          purpose: null,
          rowCount: 4,
        },
      ]),
    )
    render(<ReportsPage role="FLOOR_MANAGER" />)
    fireEvent.click(screen.getByRole('button', { name: 'Lần xuất' }))

    expect(await screen.findByText('Trưởng tầng')).toBeInTheDocument()
    expect(screen.getByText('01/10/2026 – 24/10/2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tải file' })).toBeInTheDocument()
  })
})
