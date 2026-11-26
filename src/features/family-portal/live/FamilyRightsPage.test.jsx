import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { json, mockRoutes } from '@/test/fetchRoutes'
import { FamilyRightsPage } from './FamilyRightsPage'

// Test BF-12 (2026-11-24; 012 FR-013, FR-014, FR-015 (a), FR-050; chủ dự án chọn phương án A): màn "Gia đình và quyền"
// của cổng. Người đại diện thấy mọi người thân, đề nghị đổi quyền, thêm người được phép đón; người thân khác chỉ thấy
// mình và chỉ tắt được quyền của mình.

let api

const RIGHTS = (on = []) =>
  Object.fromEntries(
    ['VIEW_HEALTH', 'VIEW_COSTS', 'RECEIVE_URGENT', 'REGISTER_VISITS', 'PICKUP_ALLOWED', 'REQUEST_SERVICES'].map(
      (r) => [r, { enabled: on.includes(r), effective: on.includes(r) }],
    ),
  )

const MINH = {
  relationshipId: 11,
  fullName: 'Trần Văn Minh',
  relationship: 'CHILD',
  representative: true,
  primaryContact: true,
  self: true,
  rights: RIGHTS(['VIEW_COSTS', 'RECEIVE_URGENT', 'REQUEST_SERVICES']),
}
const HA = {
  relationshipId: 12,
  fullName: 'Trần Thu Hà',
  relationship: 'GRANDCHILD',
  representative: false,
  primaryContact: false,
  self: false,
  rights: RIGHTS(['REGISTER_VISITS']),
}

const viewer = { residentId: 5, residentName: 'Nguyễn Thị Lan', representative: true }

beforeEach(() => {
  api = mockRoutes()
  api.on(
    'GET',
    '/right-change-requests',
    json(200, [
      {
        id: 7,
        residentId: 5,
        type: 'RIGHT',
        relationshipId: 12,
        right: 'VIEW_COSTS',
        newValue: true,
        status: 'PENDING_CONFIRMATION',
        familyMemberName: 'Trần Thu Hà',
      },
    ]),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('FamilyRightsPage', () => {
  it('FR_015a_nguoiDaiDien_deNghiDoiQuyen_coHieuLucNgay', async () => {
    api.on('GET', '/family-portal/residents/5/family-members', json(200, [MINH, HA]))
    api.on('POST', '/right-change-requests', json(201, { id: 8, status: 'EFFECTIVE' }))
    render(<FamilyRightsPage viewer={viewer} />)

    const ha = await screen.findByRole('region', { name: 'Trần Thu Hà' })
    expect(within(ha).getByText('Đang bật: Đăng ký thăm')).toBeInTheDocument()
    expect(within(ha).getByText('Bật quyền Xem chi phí')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Trần Văn Minh (bạn)' })).toBeInTheDocument()

    fireEvent.click(within(ha).getByRole('button', { name: 'Đề nghị đổi quyền' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Bật Được phép đón' }))
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Hà đón bà cuối tuần' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đề nghị' }))

    expect(await screen.findByText('Đã gửi. Yêu cầu có hiệu lực ngay.')).toBeInTheDocument()
    const [, init] = api.calls('POST', '/right-change-requests')[0]
    expect(JSON.parse(init.body)).toEqual({
      residentId: 5,
      type: 'RIGHT',
      relationshipId: 12,
      right: 'PICKUP_ALLOWED',
      newValue: true,
      reason: 'Hà đón bà cuối tuần',
    })
    expect(init.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    await waitFor(() => expect(api.calls('GET', '/family-portal/residents/5/family-members')).toHaveLength(2))
  })

  it('FR_020b_themNguoiDon_traiMongMuon_baoChoQuanLyDuyet', async () => {
    api.on('GET', '/family-portal/residents/5/family-members', json(200, [MINH, HA]))
    api.on('POST', '/right-change-requests', json(201, { id: 9, status: 'PENDING_CONFIRMATION', conflictingWishId: 3 }))
    render(<FamilyRightsPage viewer={viewer} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Thêm người được phép đón' }))
    fireEvent.change(screen.getByLabelText('Họ tên'), { target: { value: 'Lê Văn Phúc' } })
    fireEvent.change(screen.getByLabelText('Quan hệ với người cao tuổi'), { target: { value: 'OTHER' } })
    fireEvent.change(screen.getByLabelText('Số điện thoại'), { target: { value: '0900000123' } })
    fireEvent.change(screen.getByLabelText('Loại giấy tờ'), { target: { value: 'CCCD' } })
    fireEvent.change(screen.getByLabelText('Số giấy tờ'), { target: { value: '000000000123' } })
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Đón bà khi gia đình bận' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đề nghị' }))

    expect(await screen.findByText(/trái mong muốn của người cao tuổi nên chờ Quản lý viện duyệt/)).toBeInTheDocument()
    const body = JSON.parse(api.calls('POST', '/right-change-requests')[0][1].body)
    expect(body).toMatchObject({ residentId: 5, type: 'RIGHT', right: 'PICKUP_ALLOWED', newValue: true })
    expect(body.newPicker).toEqual({
      fullName: 'Lê Văn Phúc',
      relationship: 'OTHER',
      phoneNumber: '0900000123',
      idDocumentType: 'CCCD',
      idDocumentNumber: '000000000123',
    })
  })

  it('FR_014_nguoiThanThuong_chiTatQuyenCuaMinh', async () => {
    api.on(
      'GET',
      '/family-portal/residents/5/family-members',
      json(200, [{ ...HA, self: true, rights: RIGHTS(['REGISTER_VISITS', 'PICKUP_ALLOWED']) }]),
    )
    render(<FamilyRightsPage viewer={{ ...viewer, representative: false }} />)

    const self = await screen.findByRole('region', { name: 'Trần Thu Hà (bạn)' })
    expect(screen.queryByRole('button', { name: 'Thêm người được phép đón' })).not.toBeInTheDocument()
    fireEvent.click(within(self).getByRole('button', { name: 'Đề nghị đổi quyền' }))
    expect(await screen.findByRole('button', { name: 'Tắt Được phép đón' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tắt Đăng ký thăm' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Bật / })).not.toBeInTheDocument()
  })
})
