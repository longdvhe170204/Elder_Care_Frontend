import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { PermissionsProvider } from '@/common/permissions/permissions'
import { ChangeRequestsPage } from './ChangeRequestsPage'
import { withCompanions } from './changeRequestRules'

// BF-08 sửa đổi (004 FR-043d → FR-043j; Q-414 → Q-423; plan-bf08 W1 → W13): phụ lục Chờ ký và ghi nhận đã ký, bộ lọc
// Chờ ký, trả về nháp, hủy, ý kiến người cao tuổi và cảnh báo khi gửi duyệt, nhãn thuộc gói theo hợp đồng, loại kèm tự chọn.

let api

const BASE = {
  contractId: 31,
  residentId: 5,
  changeTypes: ['SERVICE'],
  newValue: { services: [{ serviceId: 8, action: 'ADD' }] },
  previousValue: {},
  requestedEffectiveDate: '2026-11-25',
  reason: 'Gia đình đề nghị giặt là riêng',
  minorChange: false,
  approvalRequestId: 12,
  representativeConfirmationRequired: true,
  representativeConfirmation: {
    method: 'PHONE',
    confirmedOn: '2026-11-19',
    evidenceFileId: 70,
    representativeFamilyMemberId: 44,
  },
}

const PENDING_SIGNATURE = {
  ...BASE,
  status: 'APPROVED',
  addendum: {
    id: 300,
    addendumNo: 2,
    status: 'PENDING_SIGNATURE',
    effectiveDate: '2026-11-25',
    signatureRequired: true,
    createdAt: '2026-11-01T03:00:00Z',
  },
}

function permissions(ops) {
  api.on('GET', '/me/permissions', json(200, ops))
}

function renderPage(props = {}) {
  return render(
    <PermissionsProvider>
      <ChangeRequestsPage {...props} />
    </PermissionsProvider>,
  )
}

beforeEach(() => {
  api = mockRoutes()
  permissions([
    ...['VIEW', 'CREATE', 'UPDATE'].map((operation) => ({ function: 'RESIDENCY_CHANGE_REQUEST', operation })),
    { function: 'ADMISSION_CONTRACT_DEPOSIT', operation: 'VIEW' },
  ])
  api.on('GET', '/contracts', json(200, []))
  api.on('GET', '/services', json(200, []))
  api.on('GET', '/residents/5/assessments', json(200, []))
  api.on(
    'GET',
    '/residents/5/relationships',
    json(200, [{ id: 3, representative: true, status: 'ACTIVE', familyMember: { id: 44, fullName: 'Trần Văn Nam' } }]),
  )
  api.on('GET', '/residency-change-requests/12/resident-opinions', json(200, []))
  api.on('GET', '/staff', json(200, [{ id: 7, fullName: 'Lê Hành Chính' }]))
})

describe('BF-08 sửa đổi', () => {
  it('W10_locChoKy_hienDaDuyetChoKy_kemSoNgay', async () => {
    api.on('GET', '/residency-change-requests', json(200, [PENDING_SIGNATURE]))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Chờ ký 1/ }))
    expect(await screen.findByText('Đã duyệt · Chờ ký')).toBeInTheDocument()
    expect(screen.getByText(/ngày từ lúc duyệt/)).toBeInTheDocument()
  })

  it('W2_ghiNhanPhuLucDaKy_guiNgayNguoiKyTepVaIfMatch_baoNgayDoi', async () => {
    api.on('GET', '/residency-change-requests', json(200, [PENDING_SIGNATURE]))
    api.on('GET', '/residency-change-requests/12', json(200, PENDING_SIGNATURE, { ETag: '"5"' }))
    api.on('POST', '/files', json(201, { fileId: 88 }))
    api.on(
      'POST',
      '/residency-change-requests/12/addendum-signature',
      json(200, {
        ...PENDING_SIGNATURE,
        addendum: { ...PENDING_SIGNATURE.addendum, status: 'PENDING_EFFECTIVE', effectiveDate: '2026-11-28' },
      }),
    )
    renderPage({ id: 12 })
    expect(await screen.findByText('Phụ lục số 02')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ghi nhận phụ lục đã ký' }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByRole('option', { name: 'Trần Văn Nam' })

    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu ghi nhận' }))
    expect(await within(dialog).findByText('Chọn người đại diện đã ký')).toBeInTheDocument()
    expect(api.calls('POST', '/residency-change-requests/12/addendum-signature')).toHaveLength(0)

    fireEvent.change(within(dialog).getByLabelText('Người đại diện ký'), { target: { value: '44' } })
    fireEvent.change(within(dialog).getByLabelText('Người ký phía viện'), { target: { value: '7' } })
    fireEvent.change(within(dialog).getByLabelText('Bản scan phụ lục đã ký'), {
      target: { files: [new File(['x'], 'phu-luc.pdf', { type: 'application/pdf' })] },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu ghi nhận' }))

    await waitFor(() => expect(api.calls('POST', '/residency-change-requests/12/addendum-signature')).toHaveLength(1))
    const call = api.calls('POST', '/residency-change-requests/12/addendum-signature')[0][1]
    expect(call.headers['If-Match']).toBe('"5"')
    expect(JSON.parse(call.body)).toMatchObject({ signedByFamilyMemberId: 44, facilitySignatoryStaffId: 7, fileId: 88 })
    expect(await screen.findByText(/ngày hiệu lực dời sang 28\/11\/2026/)).toBeInTheDocument()
  })

  it('W2a_nguoiKyPhiaVien_khongXemDuocAi_baoKhongCoNhanVien', async () => {
    api.on('GET', '/staff', json(200, []))
    api.on('GET', '/residency-change-requests', json(200, [PENDING_SIGNATURE]))
    api.on('GET', '/residency-change-requests/12', json(200, PENDING_SIGNATURE, { ETag: '"5"' }))
    renderPage({ id: 12 })
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi nhận phụ lục đã ký' }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByRole('option', { name: 'Không có nhân viên để chọn' })).toBeInTheDocument()
    expect(within(dialog).getByText(/nhờ Quản lý viện ghi nhận/)).toBeInTheDocument()
  })

  it('W5_traVeNhap_chiNguoiDuyet_batBuocLyDo', async () => {
    permissions([
      ...['VIEW', 'APPROVE'].map((operation) => ({ function: 'RESIDENCY_CHANGE_REQUEST', operation })),
      { function: 'ADMISSION_CONTRACT_DEPOSIT', operation: 'VIEW' },
    ])
    const pending = { ...BASE, status: 'PENDING_APPROVAL' }
    api.on('GET', '/residency-change-requests', json(200, [pending]))
    api.on('GET', '/residency-change-requests/12', json(200, pending, { ETag: '"6"' }))
    api.on(
      'GET',
      '/approval-requests/12',
      json(200, { id: 12, allowedCommands: ['approve', 'reject', 'return-to-draft'] }),
    )
    api.on('POST', '/approval-requests/12/return-to-draft', json(200, {}))
    renderPage({ id: 12 })
    fireEvent.click(await screen.findByRole('button', { name: 'Trả về nháp' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Trả về nháp' }))
    expect(await within(dialog).findByText('Nhập lý do')).toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText('Lý do'), { target: { value: 'Sửa ngày hiệu lực' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Trả về nháp' }))
    await waitFor(() => expect(api.calls('POST', '/approval-requests/12/return-to-draft')).toHaveLength(1))
    const call = api.calls('POST', '/approval-requests/12/return-to-draft')[0][1]
    expect(call.headers['If-Match']).toBe('"6"')
    expect(JSON.parse(call.body)).toEqual({ reason: 'Sửa ngày hiệu lực' })
  })

  it('W5_traVeNhap_anKhiBackendKhongChoLenh', async () => {
    permissions([
      ...['VIEW', 'APPROVE'].map((operation) => ({ function: 'RESIDENCY_CHANGE_REQUEST', operation })),
      { function: 'ADMISSION_CONTRACT_DEPOSIT', operation: 'VIEW' },
    ])
    const pending = { ...BASE, status: 'PENDING_APPROVAL' }
    api.on('GET', '/residency-change-requests', json(200, [pending]))
    api.on('GET', '/residency-change-requests/12', json(200, pending, { ETag: '"6"' }))
    api.on('GET', '/approval-requests/12', json(200, { id: 12, allowedCommands: [] }))
    renderPage({ id: 12 })
    expect(await screen.findByText('Xác nhận với người đại diện')).toBeInTheDocument()
    await waitFor(() => expect(api.calls('GET', '/approval-requests/12')).toHaveLength(1))
    expect(screen.queryByRole('button', { name: 'Trả về nháp' })).not.toBeInTheDocument()
  })

  it('FR043a_chiTietXacNhan_hienTenNguoiDaiDienDaXacNhan', async () => {
    const draft = { ...BASE, status: 'DRAFT' }
    api.on('GET', '/residency-change-requests', json(200, [draft]))
    api.on('GET', '/residency-change-requests/12', json(200, draft, { ETag: '"2"' }))
    renderPage({ id: 12 })
    expect(await screen.findByText(/người đại diện xác nhận: Trần Văn Nam/)).toBeInTheDocument()
  })

  it('W6_huyYeuCauNhap_guiLyDo', async () => {
    const draft = { ...BASE, status: 'DRAFT' }
    api.on('GET', '/residency-change-requests', json(200, [draft]))
    api.on('GET', '/residency-change-requests/12', json(200, draft, { ETag: '"2"' }))
    api.on('POST', '/approval-requests/12/cancel', json(200, {}))
    renderPage({ id: 12 })
    fireEvent.click(await screen.findByRole('button', { name: 'Hủy yêu cầu' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Lý do'), { target: { value: 'Gia đình đổi ý' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hủy yêu cầu' }))
    await waitFor(() => expect(api.calls('POST', '/approval-requests/12/cancel')).toHaveLength(1))
  })

  it('W4_W11_guiDuyet_canhBaoThieuYKien_nguoiCaoTuoiKhongDongYThiBatLyDo', async () => {
    const draft = {
      ...BASE,
      status: 'DRAFT',
      warnings: ['RESIDENT_OPINION_OUTDATED'],
      currentResidentOpinion: {
        id: 1,
        opinion: 'DISAGREE',
        source: 'RESIDENT',
        outdated: true,
        recordedAt: '2026-11-19T03:00:00Z',
      },
    }
    api.on('GET', '/residency-change-requests', json(200, [draft]))
    api.on('GET', '/residency-change-requests/12', json(200, draft, { ETag: '"2"' }))
    api.on(
      'GET',
      '/residency-change-requests/12/resident-opinions',
      json(200, [
        { id: 1, opinion: 'DISAGREE', source: 'RESIDENT', outdated: true, recordedAt: '2026-11-19T03:00:00Z' },
      ]),
    )
    api.on('POST', '/approval-requests/12/submit', json(200, {}))
    renderPage({ id: 12 })
    expect(await screen.findByText(/Ghi trước khi nội dung thay đổi/)).toBeInTheDocument()
    expect(screen.getAllByText('Ý kiến người cao tuổi ghi trước khi nội dung thay đổi').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vẫn gửi duyệt' }))
    expect(await within(dialog).findByText(/nhập lý do vẫn gửi duyệt/)).toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText('Lý do vẫn gửi duyệt'), { target: { value: 'Đã giải thích' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vẫn gửi duyệt' }))
    await waitFor(() => expect(api.calls('POST', '/approval-requests/12/submit')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/approval-requests/12/submit')[0][1].body)).toEqual({
      reason: 'Đã giải thích',
    })
  })

  it('W4_ghiYKienNguoiCaoTuoi_guiYKienVaNguon', async () => {
    const draft = { ...BASE, status: 'DRAFT', warnings: ['RESIDENT_OPINION_MISSING'] }
    api.on('GET', '/residency-change-requests', json(200, [draft]))
    api.on('GET', '/residency-change-requests/12', json(200, draft, { ETag: '"2"' }))
    api.on(
      'POST',
      '/residency-change-requests/12/resident-opinions',
      json(200, [{ id: 2, opinion: 'AGREE', source: 'STAFF_OBSERVATION', recordedAt: '2026-11-20T03:00:00Z' }]),
    )
    renderPage({ id: 12 })
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi ý kiến người cao tuổi' }))
    fireEvent.click(screen.getByRole('button', { name: 'Đồng ý' }))
    fireEvent.click(screen.getByRole('button', { name: 'Nhân viên ghi nhận' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu ý kiến' }))
    await waitFor(() => expect(api.calls('POST', '/residency-change-requests/12/resident-opinions')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/residency-change-requests/12/resident-opinions')[0][1].body)).toEqual({
      opinion: 'AGREE',
      source: 'STAFF_OBSERVATION',
    })
  })

  it('W9_dichVu_nhanThuocGoiTheoHopDong_khongGuiInPackage', async () => {
    api.on('GET', '/residency-change-requests', json(200, []))
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
          services: [{ serviceId: 8, inPackage: true }],
        },
      ]),
    )
    api.on('GET', '/residents/5', json(200, { id: 5, personalInfo: { fullName: 'Nguyễn Thị Lan' } }))
    api.on(
      'GET',
      '/services',
      json(200, [
        { id: 8, name: 'Suất ăn', status: 'ACTIVE' },
        { id: 9, name: 'Giặt là', status: 'ACTIVE' },
      ]),
    )
    api.on('POST', '/residency-change-requests', json(201, { ...BASE, status: 'DRAFT' }))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Lập yêu cầu thay đổi' }))
    const dialog = screen.getByRole('dialog')
    await within(dialog).findByRole('option', { name: /HD-031/ })
    fireEvent.change(within(dialog).getByLabelText('Hợp đồng'), { target: { value: '31' } })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Dịch vụ' }))
    fireEvent.click(await within(dialog).findByRole('checkbox', { name: 'Bớt Suất ăn' }))
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Thêm Giặt là' }))
    expect(within(dialog).getByText('Thuộc gói')).toBeInTheDocument()
    expect(within(dialog).getByText('Ngoài gói')).toBeInTheDocument()
    expect(within(dialog).queryByRole('checkbox', { name: 'Thuộc gói' })).not.toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText('Ngày hiệu lực mong muốn'), { target: { value: '2026-11-25' } })
    fireEvent.change(within(dialog).getByLabelText('Lý do'), { target: { value: 'Gia đình đề nghị' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu yêu cầu' }))
    await waitFor(() => expect(api.calls('POST', '/residency-change-requests')).toHaveLength(1))
    const services = JSON.parse(api.calls('POST', '/residency-change-requests')[0][1].body).newValue.services
    expect(services).toEqual([
      { serviceId: 8, action: 'REMOVE' },
      { serviceId: 9, action: 'ADD' },
    ])
  })

  it('W9_khongDocDuocDanhGia_chonMucTay_backendKiemKhiLuu', async () => {
    api.on('GET', '/residency-change-requests', json(200, []))
    api.on(
      'GET',
      '/contracts',
      json(200, [{ id: 31, residentId: 5, contractNumber: 'HD-031', status: 'ACTIVE', careLevel: 'REGULAR' }]),
    )
    api.on('GET', '/residents/5', json(200, { id: 5, personalInfo: { fullName: 'Nguyễn Thị Lan' } }))
    // Hành chính không có quyền xem Đánh giá (Phụ lục 27)
    api.on('GET', '/residents/5/assessments', problem(403, 'PERMISSION_DENIED'))
    api.on('POST', '/residency-change-requests', json(201, { ...BASE, status: 'DRAFT' }))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Lập yêu cầu thay đổi' }))
    const dialog = screen.getByRole('dialog')
    await within(dialog).findByRole('option', { name: /HD-031/ })
    fireEvent.change(within(dialog).getByLabelText('Hợp đồng'), { target: { value: '31' } })
    await waitFor(() => expect(within(dialog).getByRole('checkbox', { name: 'Mức chăm sóc' })).toBeEnabled())
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Mức chăm sóc' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Đặc biệt' }))
    fireEvent.change(within(dialog).getByLabelText('Ngày hiệu lực mong muốn'), { target: { value: '2026-11-25' } })
    fireEvent.change(within(dialog).getByLabelText('Lý do'), { target: { value: 'Theo đánh giá lại' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu yêu cầu' }))
    await waitFor(() => expect(api.calls('POST', '/residency-change-requests')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/residency-change-requests')[0][1].body).newValue).toEqual({
      careLevel: 'SPECIAL',
    })
  })

  it('W9_doiLoaiLuuTru_tuChonLoaiKem_boLoaiKemCu', () => {
    expect(withCompanions(['RESIDENCE_TYPE'], 'LONG_TERM_RESIDENTIAL', undefined, 'DAY_CARE')).toEqual([
      'RESIDENCE_TYPE',
      'ARRIVAL_SCHEDULE',
    ])
    expect(
      withCompanions(
        ['RESIDENCE_TYPE', 'ARRIVAL_SCHEDULE'],
        'LONG_TERM_RESIDENTIAL',
        'DAY_CARE',
        'SHORT_TERM_RESIDENTIAL',
      ),
    ).toEqual(['RESIDENCE_TYPE', 'DURATION'])
    expect(withCompanions(['RESIDENCE_TYPE'], 'DAY_CARE', undefined, 'LONG_TERM_RESIDENTIAL')).toEqual([
      'RESIDENCE_TYPE',
      'BED',
    ])
  })
})
