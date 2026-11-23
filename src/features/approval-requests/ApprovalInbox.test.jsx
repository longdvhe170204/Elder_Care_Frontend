import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { ApprovalInbox } from './ApprovalInbox'
import { resetRequestSubjects } from './requestSubject'

// 000 T097: hộp duyệt (US5 #1 → #9; FR-031 → FR-040; hợp đồng /approval-requests).

function request(overrides = {}) {
  return {
    id: 7,
    displayCode: 'YC-2026-000007',
    type: 'M15.CORRECTION',
    status: 'PENDING_APPROVAL',
    content: { note: 'Sửa giờ phát thuốc', dose: 2 },
    requester: { type: 'USER', id: 20, fullName: null, role: 'AC-04' },
    createdAt: '2026-10-19T01:00:00Z',
    reason: 'Ghi nhầm giờ',
    requestedEffectiveDate: '2026-10-19',
    actualEffectiveDate: null,
    submittedAt: '2026-10-19T01:05:00Z',
    decidedBy: null,
    decidedAt: null,
    decisionComment: null,
    selfApproved: false,
    closingReason: null,
    appliedAt: null,
    catchUpApplied: false,
    applicationResult: null,
    allowedCommands: ['approve', 'reject'],
    version: 1,
    ...overrides,
  }
}

const PAGE = { items: [request()], nextCursor: null }
const isList = (inbox) => (u) => u.pathname === '/api/v1/approval-requests' && u.searchParams.get('inbox') === inbox

let api

beforeEach(() => {
  resetRequestSubjects()
  api = mockRoutes()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function listCalls() {
  return api.fetchMock.mock.calls
    .map(([url]) => new URL(url, 'http://localhost'))
    .filter((u) => u.pathname === '/api/v1/approval-requests')
}

async function openDetail(detail = request()) {
  api.on('GET', '/approval-requests/7', json(200, detail, { ETag: `"${detail.version}"` }))
  render(<ApprovalInbox />)
  fireEvent.click(await screen.findByRole('button', { name: 'YC-2026-000007' }))
  return screen.findByRole('dialog')
}

describe('ApprovalInbox', () => {
  it('US5_1_tabChoToiDuyet_hienDong_loai_trangThai_ngayHieuLuc', async () => {
    api.on('GET', isList('AWAITING_MY_APPROVAL'), json(200, PAGE))
    api.on('GET', isList('MINE'), json(200, { items: [], nextCursor: null }))
    render(<ApprovalInbox />)

    const row = (await screen.findAllByRole('row'))[1]
    expect(row).toHaveTextContent('YC-2026-000007')
    expect(row).toHaveTextContent('Đính chính')
    expect(row).toHaveTextContent('Chờ duyệt')
    expect(row).toHaveTextContent('19/10/2026')
    expect(row).toHaveTextContent('Tài khoản 20')
    expect(screen.getByRole('button', { name: /Chờ tôi duyệt/ })).toHaveTextContent('1')

    fireEvent.click(screen.getByRole('button', { name: 'Của tôi' }))
    expect(await screen.findByText('Không có yêu cầu nào')).toBeInTheDocument()
    expect(listCalls().at(-1).searchParams.get('inbox')).toBe('MINE')
  })

  it('locTrangThaiVaLoai_xemThem_guiCursor', async () => {
    api.on('GET', isList('AWAITING_MY_APPROVAL'), (u) =>
      u.searchParams.get('cursor')
        ? json(200, { items: [request({ id: 8, displayCode: 'YC-2026-000008' })], nextCursor: null })
        : json(200, { items: [request()], nextCursor: 'c-1' }),
    )
    render(<ApprovalInbox />)

    fireEvent.click(await screen.findByRole('button', { name: 'Xem thêm' }))
    expect(await screen.findByText('YC-2026-000008')).toBeInTheDocument()
    expect(listCalls().at(-1).searchParams.get('cursor')).toBe('c-1')

    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'APPROVED' } })
    fireEvent.change(screen.getByLabelText('Loại yêu cầu'), { target: { value: 'M15.CORRECTION' } })
    await waitFor(() => {
      const last = listCalls().at(-1).searchParams
      expect(last.get('status')).toBe('APPROVED')
      expect(last.get('type')).toBe('M15.CORRECTION')
    })
  })

  it('US5_3_chiTiet_noiDungTruongGiaTri_nutTheoAllowedCommands', async () => {
    api.on('GET', isList('AWAITING_MY_APPROVAL'), json(200, PAGE))
    const panel = await openDetail()

    expect(await within(panel).findByText('Ghi nhầm giờ')).toBeInTheDocument()
    expect(within(panel).getByText('note:')).toBeInTheDocument()
    expect(within(panel).getByText('Sửa giờ phát thuốc')).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Duyệt' })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Từ chối' })).toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Hủy yêu cầu' })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Gửi duyệt' })).not.toBeInTheDocument()
  })

  it('US5_5_tuChoiKhongYKien_baoTaiO_khongGoiApi', async () => {
    api.on('GET', isList('AWAITING_MY_APPROVAL'), json(200, PAGE))
    const panel = await openDetail()

    fireEvent.click(await within(panel).findByRole('button', { name: 'Từ chối' }))
    expect(within(panel).getByText('Nhập ý kiến khi từ chối')).toBeInTheDocument()
    expect(api.calls('POST', '/approval-requests/7/reject')).toHaveLength(0)

    api.on('POST', '/approval-requests/7/reject', () =>
      json(200, request({ status: 'REJECTED', allowedCommands: [], version: 2 }), { ETag: '"2"' }),
    )
    fireEvent.change(within(panel).getByLabelText('Ý kiến'), { target: { value: 'Thiếu chứng từ' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Từ chối' }))
    await waitFor(() => expect(api.calls('POST', '/approval-requests/7/reject')).toHaveLength(1))
    const [, init] = api.calls('POST', '/approval-requests/7/reject')[0]
    expect(init.headers['If-Match']).toBe('"1"')
    expect(JSON.parse(init.body)).toEqual({ comment: 'Thiếu chứng từ' })
    expect(await within(panel).findByText('Từ chối')).toBeInTheDocument()
  })

  it('US5_2_duyet_apDungNgay_hienNgayApDung_capNhatDong', async () => {
    api.on('GET', isList('AWAITING_MY_APPROVAL'), json(200, PAGE))
    api.on('POST', '/approval-requests/7/approve', () =>
      json(200, request({ status: 'APPLIED', actualEffectiveDate: '2026-10-19', allowedCommands: [], version: 2 }), {
        ETag: '"2"',
      }),
    )
    const panel = await openDetail()

    fireEvent.click(await within(panel).findByRole('button', { name: 'Duyệt' }))
    expect(await within(panel).findByText('Áp dụng ngày 19/10/2026')).toBeInTheDocument()
    expect(JSON.parse(api.calls('POST', '/approval-requests/7/approve')[0][1].body)).toEqual({})
    expect(screen.getAllByRole('row', { hidden: true })[1]).toHaveTextContent('Đã áp dụng')
  })

  it('FR_035_tuDuyetKhongYKien_422_baoTaiOYKien', async () => {
    api.on('GET', isList('AWAITING_MY_APPROVAL'), json(200, PAGE))
    api.on('POST', '/approval-requests/7/approve', () =>
      problem(422, 'REASON_REQUIRED', { detail: 'Tự duyệt phải ghi ý kiến' }),
    )
    const panel = await openDetail()

    fireEvent.click(await within(panel).findByRole('button', { name: 'Duyệt' }))
    expect(await within(panel).findByText('Tự duyệt phải ghi ý kiến')).toBeInTheDocument()
    expect(within(panel).getByLabelText('Ý kiến')).toHaveAttribute('aria-invalid', 'true')
  })

  it('FR_040_409_daXuLy_baoVaTaiLaiChiTiet', async () => {
    api.on('GET', isList('AWAITING_MY_APPROVAL'), json(200, PAGE))
    api.on('POST', '/approval-requests/7/approve', () =>
      problem(409, 'ALREADY_PROCESSED', { detail: 'Yêu cầu đã được người khác xử lý' }),
    )
    const panel = await openDetail()
    api.on(
      'GET',
      '/approval-requests/7',
      json(200, request({ status: 'REJECTED', allowedCommands: [], version: 2 }), { ETag: '"2"' }),
    )

    fireEvent.click(await within(panel).findByRole('button', { name: 'Duyệt' }))
    expect(await within(panel).findByText('Yêu cầu đã được người khác xử lý')).toBeInTheDocument()
    await waitFor(() => expect(api.calls('GET', '/approval-requests/7')).toHaveLength(2))
    expect(within(panel).queryByRole('button', { name: 'Duyệt' })).not.toBeInTheDocument()
  })

  it('FR_031_huyYeuCau_lyDoBatBuoc', async () => {
    api.on('GET', isList('AWAITING_MY_APPROVAL'), json(200, PAGE))
    api.on('POST', '/approval-requests/7/cancel', () =>
      json(200, request({ status: 'CANCELLED', closingReason: 'Không cần nữa', allowedCommands: [], version: 2 }), {
        ETag: '"2"',
      }),
    )
    const panel = await openDetail(request({ allowedCommands: ['cancel'] }))

    fireEvent.click(await within(panel).findByRole('button', { name: 'Hủy yêu cầu' }))
    fireEvent.click(within(panel).getByRole('button', { name: 'Xác nhận hủy' }))
    expect(within(panel).getByText('Nhập lý do hủy')).toBeInTheDocument()

    fireEvent.change(within(panel).getByLabelText('Lý do hủy'), { target: { value: 'Không cần nữa' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Xác nhận hủy' }))
    await waitFor(() => expect(api.calls('POST', '/approval-requests/7/cancel')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/approval-requests/7/cancel')[0][1].body)).toEqual({
      reason: 'Không cần nữa',
    })
    expect(await within(panel).findByText('Lý do đóng: Không cần nữa')).toBeInTheDocument()
  })

  it('FR_037a_apDungBu_hienGhiChu_vaDienBien', async () => {
    api.on('GET', isList('AWAITING_MY_APPROVAL'), json(200, PAGE))
    api.on(
      'GET',
      '/audit-logs/entities/M15.APPROVAL_REQUEST/7',
      json(200, {
        items: [
          {
            id: '2',
            occurredAt: '2026-10-19T01:05:00Z',
            deviceTime: null,
            actor: { type: 'USER', id: 20, fullName: null, role: 'AC-04' },
            action: 'REQUEST_SUBMITTED',
            entity: { type: 'M15.APPROVAL_REQUEST', id: '7' },
            dataBefore: null,
            dataAfter: null,
            reason: null,
            reasonHidden: false,
          },
        ],
        nextCursor: null,
      }),
    )
    const panel = await openDetail(
      request({ status: 'APPLIED', actualEffectiveDate: '2026-10-20', catchUpApplied: true, allowedCommands: [] }),
    )

    expect(await within(panel).findByText('Áp dụng ngày 20/10/2026 (áp dụng bù)')).toBeInTheDocument()
    const timeline = await within(panel).findByRole('list', { name: 'Diễn biến' })
    expect(timeline).toHaveTextContent('Gửi duyệt')
    expect(timeline).toHaveTextContent('19/10/2026 08:05')
  })

  it('dienBien_403_anMuc', async () => {
    api.on('GET', isList('AWAITING_MY_APPROVAL'), json(200, PAGE))
    api.on('GET', '/audit-logs/entities/M15.APPROVAL_REQUEST/7', problem(403, 'PERMISSION_DENIED'))
    const panel = await openDetail()

    await waitFor(() => expect(api.calls('GET', '/audit-logs/entities/M15.APPROVAL_REQUEST/7')).toHaveLength(1))
    await within(panel).findByText('Ghi nhầm giờ')
    expect(within(panel).queryByText('Diễn biến')).not.toBeInTheDocument()
  })

  it('thayDoiLuuTru_noiDungTheoNhan_khongInJson', async () => {
    const change = request({
      type: 'M02.RESIDENCY_CHANGE',
      status: 'APPLIED',
      content: {
        contractId: 3,
        changeTypes: ['CARE_LEVEL'],
        previousValue: { careLevel: 'BASIC' },
        newValue: { careLevel: 'SPECIAL' },
        costImpact: [{ item: 'CARE_SERVICE', previousUnitPrice: 3000000, newUnitPrice: 9000000 }],
      },
    })
    api.on('GET', isList('AWAITING_MY_APPROVAL'), json(200, { items: [change], nextCursor: null }))
    api.on('GET', '/contracts/3', json(200, { id: 3, residentId: 5, contractNumber: 'HD-2026-000003' }))
    api.on('GET', '/residents/5', json(200, { id: 5, personalInfo: { fullName: 'Đặng Văn Long' } }))
    render(<ApprovalInbox />)
    expect((await screen.findAllByRole('row'))[1]).toHaveTextContent('Điều chỉnh hợp đồng')
    await waitFor(() => expect(screen.getAllByRole('row')[1]).toHaveTextContent('Đặng Văn Long · HĐ HD-2026-000003'))

    api.on('GET', '/approval-requests/7', json(200, change, { ETag: '"1"' }))
    fireEvent.click(screen.getByRole('button', { name: 'YC-2026-000007' }))
    const panel = await screen.findByRole('dialog')

    expect(await within(panel).findByText('Trước: Cơ bản; sau: Đặc biệt')).toBeInTheDocument()
    expect(within(panel).getByText('Mức chăm sóc')).toBeInTheDocument()
    expect(within(panel).getByText(/Dịch vụ chăm sóc: 3\.000\.000 đ → 9\.000\.000 đ/)).toBeInTheDocument()
    expect(await within(panel).findByText('Đặng Văn Long')).toBeInTheDocument()
    expect(within(panel).getByText('HD-2026-000003')).toBeInTheDocument()
    expect(panel).not.toHaveTextContent('{"careLevel"')
    expect(panel).not.toHaveTextContent('CARE_SERVICE')
  })

  // Hoàn thiện BF-14 (2026-11-23): đề nghị xử lý đồ không người nhận hiện nội dung đọc được, mở được biên bản
  it('xuLyDoKhongNguoiNhan_noiDungDocDuoc_moBienBan', async () => {
    const disposal = request({
      type: 'M12.UNCLAIMED_BELONGING_DISPOSAL',
      content: {
        residentId: 9005,
        belongingIds: [9],
        method: 'DESTROY',
        receivingUnit: 'UBND phường',
        minutesFileId: 29,
        contactAttempts: [
          { familyMemberId: 9005, channel: 'PHONE_CALL', at: '2026-11-10T02:00:00Z', result: 'Không nghe máy' },
        ],
      },
    })
    api.on('GET', isList('AWAITING_MY_APPROVAL'), json(200, { items: [disposal], nextCursor: null }))
    api.on('GET', '/residents/9005', json(200, { id: 9005, personalInfo: { fullName: 'Phạm Văn Thử' } }))
    api.on('GET', '/residents/9005/belongings', json(200, [{ id: 9, description: 'Bộ quần áo cũ', quantity: 1 }]))
    api.on(
      'GET',
      '/residents/9005/relationships',
      json(200, [
        { id: 1, familyMember: { id: 9005, fullName: 'Phạm Thị Đại Diện' }, representative: true, rights: {} },
      ]),
    )
    render(<ApprovalInbox />)
    expect((await screen.findAllByRole('row'))[1]).toHaveTextContent('Xử lý đồ không người nhận')

    api.on('GET', '/approval-requests/7', json(200, disposal, { ETag: '"1"' }))
    fireEvent.click(screen.getByRole('button', { name: 'YC-2026-000007' }))
    const panel = await screen.findByRole('dialog')

    expect(await within(panel).findByText('Tiêu hủy')).toBeInTheDocument()
    expect(await within(panel).findByText(/Bộ quần áo cũ/)).toBeInTheDocument()
    expect(await within(panel).findByText(/Phạm Thị Đại Diện: Không nghe máy/)).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Mở biên bản' })).toBeInTheDocument()
    expect(panel).not.toHaveTextContent('DESTROY')
    expect(panel).not.toHaveTextContent('minutesFileId')
    expect(panel).not.toHaveTextContent('M12.UNCLAIMED_BELONGING_DISPOSAL')
  })
})
