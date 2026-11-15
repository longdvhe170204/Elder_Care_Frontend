import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { json, mockRoutes } from '@/test/fetchRoutes'
import { PermissionsProvider } from '@/common/permissions/permissions'
import { InterestGroupsPage } from './InterestGroupsPage'

// 014 FR-051 (api-014 /interest-groups, thêm 2026-11-15): danh mục nhóm sở thích. Quản lý viện tạo, đổi tên, ngừng hoặc
// dùng lại; vai trò chỉ có quyền xem không có nút lệnh (Phụ lục 27 dòng "Danh mục loại hoạt động, nhóm sở thích").

let api

const permissions = (...operations) =>
  json(
    200,
    operations.map((operation) => ({ function: 'ACTIVITY_CATALOG', operation })),
  )

function bodyOf(call) {
  return JSON.parse(call[1].body)
}

function renderPage() {
  render(
    <PermissionsProvider>
      <InterestGroupsPage />
    </PermissionsProvider>,
  )
}

beforeEach(() => {
  api = mockRoutes()
  api.on(
    'GET',
    '/interest-groups',
    json(200, [
      { id: 3, name: 'Âm nhạc', status: 'ACTIVE' },
      { id: 4, name: 'Cờ', status: 'INACTIVE' },
    ]),
  )
})

describe('InterestGroupsPage', () => {
  it('FR_051_quanLyVienTaoNhom_guiIdempotencyKey', async () => {
    api.on('GET', '/me/permissions', permissions('VIEW', 'CREATE'))
    api.on('POST', '/interest-groups', json(200, {}))
    renderPage()

    const list = await screen.findByRole('list', { name: 'Nhóm sở thích' })
    expect(within(list).getByText('Âm nhạc')).toBeInTheDocument()
    expect(within(list).getByText('Ngừng hiệu lực')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Thêm nhóm sở thích' }))
    fireEvent.change(screen.getByLabelText('Tên nhóm (bắt buộc)'), { target: { value: 'Làm vườn' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nhóm sở thích' }))

    await waitFor(() => expect(api.calls('POST', '/interest-groups')).toHaveLength(1))
    const call = api.calls('POST', '/interest-groups')[0]
    expect(bodyOf(call)).toEqual({ name: 'Làm vườn' })
    expect(call[1].headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('FR_051_ngungVaDungLai_guiTrangThai', async () => {
    api.on('GET', '/me/permissions', permissions('VIEW', 'CREATE'))
    api.on('POST', '/interest-groups', json(200, {}))
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Ngừng nhóm Âm nhạc' }))
    await waitFor(() => expect(api.calls('POST', '/interest-groups')).toHaveLength(1))
    fireEvent.click(await screen.findByRole('button', { name: 'Dùng lại nhóm Cờ' }))
    await waitFor(() => expect(api.calls('POST', '/interest-groups')).toHaveLength(2))
    const [stop, reuse] = api.calls('POST', '/interest-groups').map(bodyOf)
    expect(stop).toEqual({ id: 3, name: 'Âm nhạc', status: 'INACTIVE' })
    expect(reuse).toEqual({ id: 4, name: 'Cờ', status: 'ACTIVE' })
  })

  it('FR_051_chiXem_khongCoNutLenh', async () => {
    api.on('GET', '/me/permissions', permissions('VIEW'))
    renderPage()

    expect(await screen.findByText('Âm nhạc')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Thêm nhóm sở thích' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ngừng nhóm|Sửa nhóm/ })).not.toBeInTheDocument()
  })
})
