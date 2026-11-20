import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { PermissionsProvider } from '@/common/permissions/permissions'
import { ChangeRequestsPage } from './ChangeRequestsPage'

// 004 T047 (US5; FR-037 → FR-047): lập yêu cầu thay đổi lưu trú ở Nháp (loại thay đổi, giá trị mới, ngày hiệu lực mong muốn,
// lý do), xem giá trị trước và ảnh hưởng chi phí, sửa Nháp kèm If-Match. Hành chính xác nhận với người đại diện kèm bằng chứng
// rồi mới gửi duyệt (2026-11-20; api-000 submit); duyệt, từ chối dùng màn Yêu cầu phê duyệt. Bảng yêu cầu lọc theo trạng thái
// (GET /residency-change-requests), chọn dòng để mở; mã yêu cầu là approvalRequestId.

let api

const REQUEST = {
  contractId: 31,
  changeTypes: ['CARE_LEVEL'],
  newValue: { careLevel: 'SPECIAL' },
  previousValue: { careLevel: 'REGULAR' },
  requestedEffectiveDate: '2026-11-20',
  reason: 'Sau đợt đánh giá mới',
  costImpact: [{ item: 'Chăm sóc', previousUnitPrice: 5000000, newUnitPrice: 8000000 }],
  minorChange: false,
  approvalRequestId: 12,
  status: 'DRAFT',
  requestedBy: 'Hoàng Thu Hà',
  representativeConfirmationRequired: true,
}

const CONFIRMATION = {
  method: 'PHONE',
  confirmedOn: '2026-11-19',
  evidenceFileId: 70,
  note: 'Người đại diện đồng ý qua điện thoại',
  recordedBy: 'Lê Hành Chính',
  recordedAt: '2026-11-19T03:00:00Z',
}

function renderPage() {
  return render(
    <PermissionsProvider>
      <ChangeRequestsPage />
    </PermissionsProvider>,
  )
}

async function openRequest() {
  fireEvent.click(await screen.findByRole('button', { name: 'Yêu cầu mã 12' }))
  await screen.findByText('Sau đợt đánh giá mới')
}

beforeEach(() => {
  api = mockRoutes()
  api.on(
    'GET',
    '/me/permissions',
    json(200, [
      ...['VIEW', 'CREATE', 'UPDATE'].map((operation) => ({ function: 'RESIDENCY_CHANGE_REQUEST', operation })),
      { function: 'ADMISSION_CONTRACT_DEPOSIT', operation: 'VIEW' },
    ]),
  )
  api.on('GET', '/residency-change-requests', json(200, [REQUEST]))
  api.on('GET', '/residency-change-requests/12', json(200, REQUEST, { ETag: '"2"' }))
  api.on(
    'GET',
    '/contracts',
    json(200, [
      {
        id: 31,
        residentId: 5,
        contractNumber: 'HD-031',
        status: 'ACTIVE',
        residenceType: 'LONG_TERM_RESIDENTIAL',
        careLevel: 'REGULAR',
      },
    ]),
  )
  api.on('GET', '/residents/5', json(200, { id: 5, personalInfo: { fullName: 'Nguyễn Thị Lan' } }))
  api.on('GET', '/services', json(200, []))
})

describe('ChangeRequestsPage', () => {
  it('FR_038_moTheoMa_hienGiaTriTruocGiaTriMoiVaChiPhi', async () => {
    renderPage()
    await openRequest()

    // một ở cột "Thay đổi" của bảng, một ở chi tiết
    expect(screen.getAllByText('Mức chăm sóc')).toHaveLength(2)
    expect(screen.getByText(/Thường xuyên/)).toBeInTheDocument()
    expect(screen.getByText(/Đặc biệt/)).toBeInTheDocument()
    expect(screen.getByText(/5\.000\.000/)).toBeInTheDocument()
    expect(screen.getByText(/8\.000\.000/)).toBeInTheDocument()
    expect(screen.getByText(/Chưa xác nhận với người đại diện/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gửi duyệt' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xác nhận với người đại diện' })).toBeInTheDocument()
  })

  it('FR_039_suaNhap_guiIfMatchTheoETag', async () => {
    api.on('PUT', '/residency-change-requests/12', json(200, {}))
    renderPage()
    await openRequest()
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận với người đại diện' }))

    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByRole('option', { name: /HD-031/ })
    fireEvent.change(within(dialog).getByLabelText('Lý do'), { target: { value: 'Bổ sung căn cứ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu yêu cầu' }))

    await waitFor(() => expect(api.calls('PUT', '/residency-change-requests/12')).toHaveLength(1))
    const call = api.calls('PUT', '/residency-change-requests/12')[0][1]
    expect(call.headers['If-Match']).toBe('"2"')
    expect(JSON.parse(call.body)).toMatchObject({
      contractId: 31,
      changeTypes: ['CARE_LEVEL'],
      newValue: { careLevel: 'SPECIAL' },
      requestedEffectiveDate: '2026-11-20',
      reason: 'Bổ sung căn cứ',
    })
  })

  it('FR_040_lapYeuCau_thieuTruong_baoTaiO', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Lập yêu cầu thay đổi' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu yêu cầu' }))
    expect(await within(dialog).findByText('Chọn hợp đồng')).toBeInTheDocument()
    expect(within(dialog).getByText('Chọn ít nhất một loại thay đổi')).toBeInTheDocument()
    expect(within(dialog).getByText('Nhập ngày hiệu lực mong muốn')).toBeInTheDocument()
    expect(api.calls('POST', '/residency-change-requests')).toHaveLength(0)
  })

  it('FR_039_bacSi_chonNguoiCaoTuoi_chiMucChamSoc_khongCoXacNhan', async () => {
    // Bác sĩ: lập được yêu cầu, không có quyền xem hợp đồng (Phụ lục 27)
    api.on(
      'GET',
      '/me/permissions',
      json(
        200,
        ['VIEW', 'CREATE', 'UPDATE'].map((operation) => ({ function: 'RESIDENCY_CHANGE_REQUEST', operation })),
      ),
    )
    api.on(
      'GET',
      '/residents',
      json(200, { items: [{ id: 9004, status: 'IN_RESIDENCE', personalInfo: { fullName: 'Phạm Văn Hùng' } }] }),
    )
    api.on('POST', '/residency-change-requests', json(201, REQUEST))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Lập yêu cầu thay đổi' }))
    const dialog = screen.getByRole('dialog')
    await within(dialog).findByRole('option', { name: 'Phạm Văn Hùng' })

    expect(within(dialog).queryByLabelText('Hợp đồng')).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('checkbox', { name: 'Dịch vụ' })).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Xác nhận với người đại diện')).not.toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText('Người cao tuổi'), { target: { value: '9004' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Đặc biệt' }))
    fireEvent.change(within(dialog).getByLabelText('Ngày hiệu lực mong muốn'), { target: { value: '2026-11-20' } })
    fireEvent.change(within(dialog).getByLabelText('Lý do'), { target: { value: 'Đánh giá lại' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu yêu cầu' }))

    await waitFor(() => expect(api.calls('POST', '/residency-change-requests')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/residency-change-requests')[0][1].body)).toEqual({
      residentId: 9004,
      changeTypes: ['CARE_LEVEL'],
      newValue: { careLevel: 'SPECIAL' },
      requestedEffectiveDate: '2026-11-20',
      reason: 'Đánh giá lại',
    })
  })

  it('xacNhanNguoiDaiDien_taiBangChung_guiKemCachXacNhanNgayVaMaTep', async () => {
    api.on('POST', '/files', json(201, { fileId: 77 }))
    api.on('POST', '/residency-change-requests', json(201, REQUEST))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Lập yêu cầu thay đổi' }))
    const dialog = screen.getByRole('dialog')
    await within(dialog).findByRole('option', { name: /HD-031/ })
    fireEvent.change(within(dialog).getByLabelText('Hợp đồng'), { target: { value: '31' } })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Mức chăm sóc' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Đặc biệt' }))
    fireEvent.change(within(dialog).getByLabelText('Ngày hiệu lực mong muốn'), { target: { value: '2026-11-20' } })
    fireEvent.change(within(dialog).getByLabelText('Lý do'), { target: { value: 'Gia đình đã ký phụ lục' } })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Đã xác nhận nội dung thay đổi với người đại diện' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gọi điện' }))
    fireEvent.change(within(dialog).getByLabelText('Ngày xác nhận'), { target: { value: '2026-11-19' } })

    // thiếu bằng chứng thì báo tại ô, chưa gửi
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu yêu cầu' }))
    expect(await within(dialog).findByText('Đính kèm bằng chứng xác nhận')).toBeInTheDocument()
    expect(api.calls('POST', '/residency-change-requests')).toHaveLength(0)

    fireEvent.change(within(dialog).getByLabelText('Bằng chứng xác nhận'), {
      target: { files: [new File(['x'], 'cuoc-goi.png', { type: 'image/png' })] },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dùng ghi chú gợi ý' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu yêu cầu' }))

    await waitFor(() => expect(api.calls('POST', '/residency-change-requests')).toHaveLength(1))
    const body = JSON.parse(api.calls('POST', '/residency-change-requests')[0][1].body)
    expect(body.representativeConfirmation).toMatchObject({
      method: 'PHONE',
      confirmedOn: '2026-11-19',
      evidenceFileId: 77,
    })
    expect(body.representativeConfirmation.note).toMatch(/Đã gọi điện cho người đại diện/)
  })

  it('xacNhan_tepSaiKieu_ngayTuongLai_baoTaiO', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Lập yêu cầu thay đổi' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Đã xác nhận nội dung thay đổi với người đại diện' }))
    fireEvent.change(within(dialog).getByLabelText('Ngày xác nhận'), { target: { value: '2999-01-01' } })
    fireEvent.change(within(dialog).getByLabelText('Bằng chứng xác nhận'), {
      target: { files: [new File(['x'], 'ghi-am.mp3', { type: 'audio/mpeg' })] },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu yêu cầu' }))
    expect(await within(dialog).findByText('Ngày xác nhận không được sau hôm nay')).toBeInTheDocument()
    expect(within(dialog).getByText('Bằng chứng phải là tệp PDF, JPG hoặc PNG')).toBeInTheDocument()
    expect(api.calls('POST', '/files')).toHaveLength(0)
  })

  it('daXacNhan_hienXacNhan_guiDuyetKemIfMatch', async () => {
    api.on(
      'GET',
      '/residency-change-requests/12',
      json(200, { ...REQUEST, representativeConfirmation: CONFIRMATION }, { ETag: '"4"' }),
    )
    api.on('POST', '/approval-requests/12/submit', json(200, {}))
    renderPage()
    await openRequest()

    expect(screen.getByText(/Gọi điện, ngày 19\/11\/2026, ghi bởi Lê Hành Chính/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xem bằng chứng' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }))

    await waitFor(() => expect(api.calls('POST', '/approval-requests/12/submit')).toHaveLength(1))
    expect(api.calls('POST', '/approval-requests/12/submit')[0][1].headers['If-Match']).toBe('"4"')
  })

  it('bacSi_xemNhapChuaXacNhan_baoDaChuyenHanhChinh_khongGuiDuyet', async () => {
    api.on(
      'GET',
      '/me/permissions',
      json(
        200,
        ['VIEW', 'CREATE', 'UPDATE'].map((operation) => ({ function: 'RESIDENCY_CHANGE_REQUEST', operation })),
      ),
    )
    renderPage()
    await openRequest()
    expect(screen.getByText(/Yêu cầu đã chuyển Hành chính/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gửi duyệt' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xác nhận với người đại diện' })).not.toBeInTheDocument()
  })

  it('FR_041_doiMucTrungMucHienTai_baoTaiO', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Lập yêu cầu thay đổi' }))
    const dialog = screen.getByRole('dialog')
    await within(dialog).findByRole('option', { name: /HD-031/ })
    fireEvent.change(within(dialog).getByLabelText('Hợp đồng'), { target: { value: '31' } })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Mức chăm sóc' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Thường xuyên' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu yêu cầu' }))
    expect(await within(dialog).findByText('Mức chăm sóc mới trùng mức hiện tại của hợp đồng')).toBeInTheDocument()
  })

  it('FR_037_lapYeuCauDoiMuc_guiGiaTriMoi', async () => {
    api.on('POST', '/residency-change-requests', json(201, REQUEST))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Lập yêu cầu thay đổi' }))
    const dialog = screen.getByRole('dialog')
    await within(dialog).findByRole('option', { name: /HD-031/ })
    fireEvent.change(within(dialog).getByLabelText('Hợp đồng'), { target: { value: '31' } })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Mức chăm sóc' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Đặc biệt' }))
    fireEvent.change(within(dialog).getByLabelText('Ngày hiệu lực mong muốn'), { target: { value: '2026-11-20' } })
    fireEvent.change(within(dialog).getByLabelText('Lý do'), { target: { value: 'Sau đợt đánh giá mới' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu yêu cầu' }))

    await waitFor(() => expect(api.calls('POST', '/residency-change-requests')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/residency-change-requests')[0][1].body)).toEqual({
      contractId: 31,
      changeTypes: ['CARE_LEVEL'],
      newValue: { careLevel: 'SPECIAL' },
      requestedEffectiveDate: '2026-11-20',
      reason: 'Sau đợt đánh giá mới',
    })
  })

  it('FR_040_422_ngayHieuLucSomHonNgayBatDau_hienLoi', async () => {
    api.on(
      'POST',
      '/residency-change-requests',
      problem(422, 'INVALID_VALUE', { detail: 'Ngày hiệu lực sớm hơn ngày bắt đầu hợp đồng' }),
    )
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Lập yêu cầu thay đổi' }))
    const dialog = screen.getByRole('dialog')
    await within(dialog).findByRole('option', { name: /HD-031/ })
    fireEvent.change(within(dialog).getByLabelText('Hợp đồng'), { target: { value: '31' } })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Mức chăm sóc' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cơ bản' }))
    fireEvent.change(within(dialog).getByLabelText('Ngày hiệu lực mong muốn'), { target: { value: '2020-01-01' } })
    fireEvent.change(within(dialog).getByLabelText('Lý do'), { target: { value: 'Thử' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu yêu cầu' }))
    expect(await within(dialog).findByText('Ngày hiệu lực sớm hơn ngày bắt đầu hợp đồng')).toBeInTheDocument()
  })

  it('FR_038_yeuCauDaGuiDuyet_khongCoNutSua', async () => {
    api.on(
      'GET',
      '/residency-change-requests/12',
      json(200, { ...REQUEST, status: 'PENDING_APPROVAL' }, { ETag: '"3"' }),
    )
    renderPage()
    await openRequest()
    expect(screen.queryByRole('button', { name: 'Sửa yêu cầu nháp' })).not.toBeInTheDocument()
  })
})
