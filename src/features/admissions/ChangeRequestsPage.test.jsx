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
  residentId: 5,
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
  // BF-08 sửa đổi: mức mới theo đánh giá lại (FR-043j), người đại diện (FR-043a, R16), ý kiến người cao tuổi (FR-043h)
  api.on(
    'GET',
    '/residents/5/assessments',
    json(200, [{ id: 90, status: 'CONFIRMED', careLevel: 'SPECIAL', confirmedAt: '2026-11-18T03:00:00Z', confirmedBy: 'BS Minh' }]),
  )
  api.on(
    'GET',
    '/residents/5/relationships',
    json(200, [{ id: 3, representative: true, status: 'ACTIVE', familyMember: { id: 44, fullName: 'Trần Văn Nam' } }]),
  )
  api.on('GET', '/residency-change-requests/12/resident-opinions', json(200, []))
  api.on('GET', '/staff', json(200, []))
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
    // một ở cột Trạng thái của bảng, một ở chi tiết
    expect(screen.getAllByText('Chưa xác nhận với người đại diện')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Gửi duyệt' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ghi xác nhận trực tiếp' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gửi người đại diện xác nhận' })).toBeInTheDocument()
  })

  it('FR_039_suaNhap_guiIfMatchTheoETag', async () => {
    api.on('PUT', '/residency-change-requests/12', json(200, {}))
    renderPage()
    await openRequest()
    fireEvent.click(screen.getByRole('button', { name: 'Sửa yêu cầu nháp' }))

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
    api.on(
      'GET',
      '/residents/9004/assessments',
      json(200, [{ id: 91, status: 'CONFIRMED', careLevel: 'SPECIAL', confirmedAt: '2026-11-18T03:00:00Z' }]),
    )
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Lập yêu cầu thay đổi' }))
    const dialog = screen.getByRole('dialog')
    await within(dialog).findByRole('option', { name: 'Phạm Văn Hùng' })

    expect(within(dialog).queryByLabelText('Hợp đồng')).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('checkbox', { name: 'Dịch vụ' })).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Xác nhận với người đại diện')).not.toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText('Người cao tuổi'), { target: { value: '9004' } })
    // FR-043j: mức mới lấy từ lần đánh giá gần nhất đã xác nhận, không chọn tay
    expect(await within(dialog).findByText(/Theo đánh giá ngày 18\/11\/2026/)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Đặc biệt' })).not.toBeInTheDocument()
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

  it('lapYeuCau_khongCoPhanXacNhan_khongBatTaiBangChung', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Lập yêu cầu thay đổi' }))
    const dialog = screen.getByRole('dialog')
    await within(dialog).findByRole('option', { name: /HD-031/ })
    expect(within(dialog).queryByLabelText('Bằng chứng xác nhận')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Xác nhận với người đại diện')).not.toBeInTheDocument()
  })

  it('ghiXacNhanTrucTiep_taiBangChung_guiNoiDungCuKemXacNhanVaIfMatch', async () => {
    api.on('POST', '/files', json(201, { fileId: 77 }))
    api.on('PUT', '/residency-change-requests/12', json(200, {}))
    renderPage()
    await openRequest()
    fireEvent.click(screen.getByRole('button', { name: 'Ghi xác nhận trực tiếp' }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByRole('option', { name: 'Trần Văn Nam' })
    fireEvent.change(within(dialog).getByLabelText('Người đại diện đã xác nhận'), { target: { value: '44' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gọi điện' }))
    fireEvent.change(within(dialog).getByLabelText('Ngày xác nhận'), { target: { value: '2026-11-19' } })

    // thiếu bằng chứng thì báo tại ô, chưa gửi
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu xác nhận' }))
    expect(await within(dialog).findByText('Đính kèm bằng chứng xác nhận')).toBeInTheDocument()
    expect(api.calls('PUT', '/residency-change-requests/12')).toHaveLength(0)

    fireEvent.change(within(dialog).getByLabelText('Bằng chứng xác nhận'), {
      target: { files: [new File(['x'], 'cuoc-goi.png', { type: 'image/png' })] },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dùng ghi chú gợi ý' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu xác nhận' }))

    await waitFor(() => expect(api.calls('PUT', '/residency-change-requests/12')).toHaveLength(1))
    const call = api.calls('PUT', '/residency-change-requests/12')[0][1]
    expect(call.headers['If-Match']).toBe('"2"')
    const body = JSON.parse(call.body)
    expect(body).toMatchObject({
      contractId: 31,
      changeTypes: ['CARE_LEVEL'],
      newValue: { careLevel: 'SPECIAL' },
      requestedEffectiveDate: '2026-11-20',
      reason: 'Sau đợt đánh giá mới',
      representativeConfirmation: {
        method: 'PHONE',
        confirmedOn: '2026-11-19',
        evidenceFileId: 77,
        representativeFamilyMemberId: 44,
      },
    })
    expect(body.representativeConfirmation.note).toMatch(/Đã gọi điện cho người đại diện/)
  })

  it('xacNhan_tepSaiKieu_ngayTuongLai_baoTaiO', async () => {
    renderPage()
    await openRequest()
    fireEvent.click(screen.getByRole('button', { name: 'Ghi xác nhận trực tiếp' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Ngày xác nhận'), { target: { value: '2999-01-01' } })
    fireEvent.change(within(dialog).getByLabelText('Bằng chứng xác nhận'), {
      target: { files: [new File(['x'], 'ghi-am.mp3', { type: 'audio/mpeg' })] },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu xác nhận' }))
    expect(await within(dialog).findByText('Ngày xác nhận không được sau hôm nay')).toBeInTheDocument()
    expect(within(dialog).getByText('Bằng chứng phải là tệp PDF, JPG hoặc PNG')).toBeInTheDocument()
    expect(api.calls('POST', '/files')).toHaveLength(0)
  })

  it('FR_043c_bangYeuCau_hienTrangThaiXacNhanCuaNguoiDaiDien', async () => {
    api.on(
      'GET',
      '/residency-change-requests',
      json(200, [{ ...REQUEST, confirmationRequest: { id: 3, status: 'AWAITING', sentAt: '2026-11-20T02:00:00Z' } }]),
    )
    renderPage()
    expect(await screen.findByText('Chờ người đại diện trả lời')).toBeInTheDocument()
  })

  it('suaNhapDaCoXacNhan_canhBaoSeBoXacNhan', async () => {
    api.on(
      'GET',
      '/residency-change-requests/12',
      json(200, { ...REQUEST, representativeConfirmation: CONFIRMATION }, { ETag: '"4"' }),
    )
    renderPage()
    await openRequest()
    fireEvent.click(screen.getByRole('button', { name: 'Sửa yêu cầu nháp' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/sẽ bỏ xác nhận của người đại diện/)).toBeInTheDocument()
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
    // Khung gửi duyệt (FR-043h): không có cảnh báo thì gửi ngay ở khung
    const sheet = await screen.findByRole('dialog')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Gửi duyệt' }))

    await waitFor(() => expect(api.calls('POST', '/approval-requests/12/submit')).toHaveLength(1))
    expect(api.calls('POST', '/approval-requests/12/submit')[0][1].headers['If-Match']).toBe('"4"')
  })

  it('FR_043c_guiNguoiDaiDienXacNhan_kemIfMatch_taiLai', async () => {
    api.on(
      'POST',
      '/residency-change-requests/12/send-for-confirmation',
      json(200, { ...REQUEST, confirmationRequest: { id: 3, status: 'AWAITING', sentAt: '2026-11-20T02:00:00Z' } }),
    )
    renderPage()
    await openRequest()
    fireEvent.click(screen.getByRole('button', { name: 'Gửi người đại diện xác nhận' }))

    await waitFor(() => expect(api.calls('POST', '/residency-change-requests/12/send-for-confirmation')).toHaveLength(1))
    expect(api.calls('POST', '/residency-change-requests/12/send-for-confirmation')[0][1].headers['If-Match']).toBe('"2"')
  })

  it('FR_043c_nguoiDaiDienKhongDongY_hienLyDo_choGuiLai', async () => {
    api.on(
      'GET',
      '/residency-change-requests/12',
      json(
        200,
        {
          ...REQUEST,
          confirmationRequest: {
            id: 3,
            status: 'DECLINED',
            sentAt: '2026-11-19T02:00:00Z',
            respondedAt: '2026-11-20T02:00:00Z',
            declineReason: 'Gia đình muốn giữ mức cũ',
          },
        },
        { ETag: '"2"' },
      ),
    )
    renderPage()
    await openRequest()
    expect(screen.getByText(/Người đại diện không đồng ý .* Lý do: Gia đình muốn giữ mức cũ/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gửi lại cho người đại diện' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gửi duyệt' })).not.toBeInTheDocument()
  })

  it('FR_043c_nguoiDaiDienDongY_choGuiDuyet', async () => {
    api.on(
      'GET',
      '/residency-change-requests/12',
      json(
        200,
        { ...REQUEST, confirmationRequest: { id: 3, status: 'ACCEPTED', respondedAt: '2026-11-20T02:00:00Z' } },
        { ETag: '"2"' },
      ),
    )
    renderPage()
    await openRequest()
    expect(screen.getByText(/Người đại diện đã đồng ý trên ứng dụng/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gửi duyệt' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gửi người đại diện xác nhận' })).not.toBeInTheDocument()
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
    expect(screen.queryByRole('button', { name: 'Ghi xác nhận trực tiếp' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gửi người đại diện xác nhận' })).not.toBeInTheDocument()
  })

  it('FR_043j_danhGiaTrungMucHopDong_khongChonDuocDoiMuc', async () => {
    api.on(
      'GET',
      '/residents/5/assessments',
      json(200, [{ id: 90, status: 'CONFIRMED', careLevel: 'REGULAR', confirmedAt: '2026-11-18T03:00:00Z' }]),
    )
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Lập yêu cầu thay đổi' }))
    const dialog = screen.getByRole('dialog')
    await within(dialog).findByRole('option', { name: /HD-031/ })
    fireEvent.change(within(dialog).getByLabelText('Hợp đồng'), { target: { value: '31' } })
    expect(await within(dialog).findByText(/Chưa có lần đánh giá lại ra mức khác mức của hợp đồng/)).toBeInTheDocument()
    expect(within(dialog).getByRole('checkbox', { name: 'Mức chăm sóc' })).toBeDisabled()
  })

  it('FR_037_lapYeuCauDoiMuc_guiGiaTriMoi', async () => {
    api.on('POST', '/residency-change-requests', json(201, REQUEST))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Lập yêu cầu thay đổi' }))
    const dialog = screen.getByRole('dialog')
    await within(dialog).findByRole('option', { name: /HD-031/ })
    fireEvent.change(within(dialog).getByLabelText('Hợp đồng'), { target: { value: '31' } })
    await waitFor(() => expect(within(dialog).getByRole('checkbox', { name: 'Mức chăm sóc' })).toBeEnabled())
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Mức chăm sóc' }))
    expect(await within(dialog).findByText(/Theo đánh giá của BS Minh/)).toBeInTheDocument()
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

  it('doiGiuong_chonTuDanhSachGiuongTrong_guiMaGiuong', async () => {
    api.on(
      'GET',
      '/beds',
      json(200, {
        beds: [{ id: 9005, code: 'G3', location: { label: 'Khu A – Tầng 1 – Phòng 102 – G3' } }],
        residentsWithoutBed: [],
      }),
    )
    api.on('POST', '/residency-change-requests', json(201, REQUEST))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Lập yêu cầu thay đổi' }))
    const dialog = screen.getByRole('dialog')
    await within(dialog).findByRole('option', { name: /HD-031/ })
    fireEvent.change(within(dialog).getByLabelText('Hợp đồng'), { target: { value: '31' } })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Giường' }))
    await within(dialog).findByRole('option', { name: 'Khu A – Tầng 1 – Phòng 102 – G3' })
    expect(new URL(api.calls('GET', '/beds')[0][0], 'http://x').searchParams.getAll('status')).toEqual(['EMPTY'])
    expect(within(dialog).queryByRole('button', { name: /Gợi ý lý do/ })).not.toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText('Giường mới'), { target: { value: '9005' } })
    fireEvent.change(within(dialog).getByLabelText('Ngày hiệu lực mong muốn'), { target: { value: '2026-11-20' } })
    fireEvent.change(within(dialog).getByLabelText('Lý do'), { target: { value: 'Gia đình muốn chuyển phòng' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu yêu cầu' }))

    await waitFor(() => expect(api.calls('POST', '/residency-change-requests')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/residency-change-requests')[0][1].body)).toMatchObject({
      changeTypes: ['BED'],
      newValue: { newBedId: 9005 },
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
    await waitFor(() => expect(within(dialog).getByRole('checkbox', { name: 'Mức chăm sóc' })).toBeEnabled())
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Mức chăm sóc' }))
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
