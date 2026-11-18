import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { json, mockRoutes } from '@/test/fetchRoutes'
import { ContractDetail, ContractSheet } from './ContractParts'

// Lập hợp đồng từ Hồ sơ tiếp nhận (chủ dự án yêu cầu 2026-11-17): người cao tuổi đã biết nên chỉ hiện họ tên, không có ô
// chọn người cao tuổi khác; lệnh vẫn gửi đúng mã người cao tuổi.

let api

beforeEach(() => {
  api = mockRoutes()
  api.on('GET', '/services', json(200, []))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ContractSheet', () => {
  it('mở cho một người cao tuổi: chỉ hiện họ tên, không có ô chọn, không báo thiếu người cao tuổi', async () => {
    render(<ContractSheet residentId={5} residentName="Nguyễn Thị Lan" onClose={() => {}} onDone={() => {}} />)
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByText('Nguyễn Thị Lan')).toBeInTheDocument()
    expect(within(dialog).queryByRole('combobox', { name: 'Người cao tuổi' })).toBeNull()
    expect(api.calls('GET', '/residents')).toHaveLength(0)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu hợp đồng nháp' }))
    expect(await within(dialog).findByText('Chọn loại lưu trú')).toBeInTheDocument()
    expect(within(dialog).queryByText('Chọn người cao tuổi')).toBeNull()
  })
})

describe('ContractDetail', () => {
  it('ghiNhanDaKy_chiChonNguoiDaiDienConHieuLuc', async () => {
    api.on('GET', '/contracts/3/deposit', json(200, { status: 'SATISFIED' }))
    api.on('GET', '/contracts/3/addenda', json(200, []))
    api.on(
      'GET',
      '/residents/5/relationships',
      json(200, [
        { id: 1, status: 'ACTIVE', representative: true, familyMember: { id: 11, fullName: 'Trần Văn Đại' } },
        { id: 2, status: 'ACTIVE', representative: false, familyMember: { id: 12, fullName: 'Trần Thị Liên' } },
        { id: 3, status: 'ENDED', representative: true, familyMember: { id: 13, fullName: 'Trần Văn Cũ' } },
      ]),
    )
    render(
      <ContractDetail
        contract={{ id: 3, residentId: 5, status: 'PENDING_SIGNATURE', allowedCommands: ['record-signed'] }}
        residentName="Nguyễn Thị Lan"
        canUpdate
        onChanged={() => {}}
        onEdit={() => {}}
        Title="h2"
        Description="p"
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Ghi nhận đã ký…' }))
    const select = screen.getByRole('combobox', { name: 'Người đại diện ký' })
    expect(await within(select).findByRole('option', { name: 'Trần Văn Đại' })).toBeInTheDocument()
    expect(within(select).queryByRole('option', { name: 'Trần Thị Liên' })).toBeNull()
    expect(within(select).queryByRole('option', { name: 'Trần Văn Cũ' })).toBeNull()
  })
})
