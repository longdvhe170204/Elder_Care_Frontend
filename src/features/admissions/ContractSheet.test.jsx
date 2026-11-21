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

  // 004 FR-019: hợp đồng nội trú có loại phòng (hoặc giường), thiếu thì Gửi ký bị 409 CONTRACT_ROOM_REQUIRED (BF-01 bước 9)
  it('noiTru_chonLoaiPhongPhucVuLoaiLuuTru_guiRoomTypeId', async () => {
    api.on(
      'GET',
      '/room-types',
      json(200, [
        { id: 1, name: 'Phòng đôi', servesLongTerm: true, servesShortTerm: true, status: 'ACTIVE' },
        { id: 2, name: 'Phòng ngắn ngày', servesLongTerm: false, servesShortTerm: true, status: 'ACTIVE' },
        { id: 3, name: 'Phòng cũ', servesLongTerm: true, servesShortTerm: true, status: 'INACTIVE' },
      ]),
    )
    api.on('POST', '/contracts', json(201, { id: 9 }))
    render(<ContractSheet residentId={5} residentName="Nguyễn Thị Lan" onClose={() => {}} onDone={() => {}} />)
    const dialog = await screen.findByRole('dialog')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Nội trú dài hạn' }))
    fireEvent.change(within(dialog).getByLabelText('Ngày bắt đầu'), { target: { value: '2026-11-20' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Thường xuyên' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Theo tháng' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu hợp đồng nháp' }))
    const select = within(dialog).getByRole('combobox', { name: 'Loại phòng' })
    await vi.waitFor(() => expect(select).toHaveAttribute('aria-invalid', 'true'))
    expect(within(dialog).getAllByText('Chọn loại phòng')).toHaveLength(2)
    expect(api.calls('POST', '/contracts')).toHaveLength(0)

    expect(await within(select).findByRole('option', { name: 'Phòng đôi' })).toBeInTheDocument()
    expect(within(select).queryByRole('option', { name: 'Phòng ngắn ngày' })).toBeNull()
    expect(within(select).queryByRole('option', { name: 'Phòng cũ' })).toBeNull()
    fireEvent.change(select, { target: { value: '1' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu hợp đồng nháp' }))

    await vi.waitFor(() => expect(api.calls('POST', '/contracts')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/contracts')[0][1].body)).toMatchObject({
      residenceType: 'LONG_TERM_RESIDENTIAL',
      roomTypeId: 1,
    })
  })

  // Q-300, 6.4 (chủ dự án duyệt 2026-11-20, hướng B): dịch vụ chăm sóc theo mức và phí lưu trú theo loại phòng là tác động
  // kèm lựa chọn mức, loại phòng của Hành chính; không tick tay, không bỏ được; dịch vụ đi kèm vẫn chọn tay
  it('dichVuChamSocVaPhiPhong_datTheoMucVaLoaiPhong_dichVuDiKemChonTay', async () => {
    api.on(
      'GET',
      '/services',
      json(200, [
        { id: 31, type: 'CARE', name: 'Chăm sóc cơ bản', careLevelCode: 'BASIC', status: 'ACTIVE' },
        { id: 32, type: 'CARE', name: 'Chăm sóc thường xuyên', careLevelCode: 'REGULAR', status: 'ACTIVE' },
        { id: 41, type: 'RESIDENCY_FEE', name: 'Phí lưu trú phòng đôi', roomTypeId: 1, status: 'ACTIVE' },
        { id: 42, type: 'RESIDENCY_FEE', name: 'Phí lưu trú phòng bốn giường', roomTypeId: 2, status: 'ACTIVE' },
        { id: 51, type: 'MEAL', name: 'Suất ăn', status: 'ACTIVE' },
      ]),
    )
    api.on(
      'GET',
      '/room-types',
      json(200, [
        { id: 1, name: 'Phòng đôi', servesLongTerm: true, servesShortTerm: true, status: 'ACTIVE' },
        { id: 2, name: 'Phòng bốn giường', servesLongTerm: true, servesShortTerm: true, status: 'ACTIVE' },
      ]),
    )
    api.on('POST', '/contracts', json(201, { id: 9 }))
    render(<ContractSheet residentId={5} residentName="Nguyễn Thị Lan" onClose={() => {}} onDone={() => {}} />)
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByRole('checkbox', { name: 'Suất ăn' })

    expect(within(dialog).queryByRole('checkbox', { name: 'Chăm sóc thường xuyên' })).toBeNull()
    expect(within(dialog).queryByRole('checkbox', { name: 'Phí lưu trú phòng đôi' })).toBeNull()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Nội trú dài hạn' }))
    fireEvent.change(within(dialog).getByLabelText('Ngày bắt đầu'), { target: { value: '2026-11-20' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cơ bản' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Thường xuyên' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Theo tháng' }))
    const select = within(dialog).getByRole('combobox', { name: 'Loại phòng' })
    await within(select).findByRole('option', { name: 'Phòng đôi' })
    fireEvent.change(select, { target: { value: '1' } })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Suất ăn' }))

    expect(within(dialog).getByText('Chăm sóc thường xuyên, theo mức chăm sóc')).toBeInTheDocument()
    expect(within(dialog).getByText('Phí lưu trú phòng đôi, theo loại phòng')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu hợp đồng nháp' }))
    await vi.waitFor(() => expect(api.calls('POST', '/contracts')).toHaveLength(1))
    const body = JSON.parse(api.calls('POST', '/contracts')[0][1].body)
    expect(body.services.map((s) => s.serviceId).sort()).toEqual([32, 41, 51])
  })

  it('suaNhap_dongCuCuaMucKhac_thayBangDichVuTheoMucHienTai', async () => {
    api.on(
      'GET',
      '/services',
      json(200, [
        { id: 31, type: 'CARE', name: 'Chăm sóc cơ bản', careLevelCode: 'BASIC', status: 'ACTIVE' },
        { id: 32, type: 'CARE', name: 'Chăm sóc thường xuyên', careLevelCode: 'REGULAR', status: 'ACTIVE' },
        { id: 41, type: 'RESIDENCY_FEE', name: 'Phí lưu trú phòng đôi', roomTypeId: 1, status: 'ACTIVE' },
        { id: 42, type: 'RESIDENCY_FEE', name: 'Phí lưu trú phòng bốn giường', roomTypeId: 2, status: 'ACTIVE' },
        { id: 51, type: 'MEAL', name: 'Suất ăn', status: 'ACTIVE' },
      ]),
    )
    api.on(
      'GET',
      '/room-types',
      json(200, [{ id: 1, name: 'Phòng đôi', servesLongTerm: true, servesShortTerm: true, status: 'ACTIVE' }]),
    )
    api.on('GET', '/contracts/7', json(200, { id: 7 }, { ETag: '"3"' }))
    api.on('PUT', '/contracts/7', json(200, { id: 7 }))
    const contract = {
      id: 7,
      residentId: 5,
      residenceType: 'LONG_TERM_RESIDENTIAL',
      startDate: '2026-11-20',
      careLevel: 'REGULAR',
      residencyFeeBillingPeriod: 'MONTH',
      roomTypeId: 1,
      services: [
        { serviceId: 31, inPackage: false },
        { serviceId: 42, inPackage: false },
        { serviceId: 51, inPackage: true },
      ],
    }
    render(<ContractSheet contract={contract} residentName="Nguyễn Thị Lan" onClose={() => {}} onDone={() => {}} />)
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText('Chăm sóc thường xuyên, theo mức chăm sóc')
    await vi.waitFor(() => expect(within(dialog).getByRole('button', { name: 'Lưu hợp đồng nháp' })).not.toBeDisabled())

    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu hợp đồng nháp' }))
    await vi.waitFor(() => expect(api.calls('PUT', '/contracts/7')).toHaveLength(1))
    const body = JSON.parse(api.calls('PUT', '/contracts/7')[0][1].body)
    expect(body.services).toEqual(
      expect.arrayContaining([
        { serviceId: 32, inPackage: false },
        { serviceId: 41, inPackage: false },
        { serviceId: 51, inPackage: true },
      ]),
    )
    expect(body.services).toHaveLength(3)
  })

  it('banTru_khongCoOLoaiPhong', async () => {
    api.on('GET', '/room-types', json(200, []))
    render(<ContractSheet residentId={5} residentName="Nguyễn Thị Lan" onClose={() => {}} onDone={() => {}} />)
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bán trú' }))
    expect(within(dialog).queryByRole('combobox', { name: 'Loại phòng' })).toBeNull()
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

  // 4b (chủ dự án duyệt 2026-11-21): khung chi tiết ghi loại phòng và các dịch vụ đăng ký bằng tên
  it('hienLoaiPhongVaDichVuBangTen', async () => {
    api.on('GET', '/contracts/3/deposit', json(200, { status: 'SATISFIED' }))
    api.on('GET', '/contracts/3/addenda', json(200, []))
    api.on('GET', '/room-types', json(200, [{ id: 101, name: 'Phòng 2 giường', status: 'ACTIVE' }]))
    api.on(
      'GET',
      '/services',
      json(200, [
        { id: 7, type: 'CARE', name: 'Chăm sóc cơ bản' },
        { id: 8, type: 'RESIDENCY_FEE', name: 'Phí phòng 2 giường', roomTypeId: 101 },
        { id: 9, type: 'MEAL', name: 'Suất ăn thêm' },
      ]),
    )
    render(
      <ContractDetail
        contract={{
          id: 3,
          residentId: 5,
          status: 'DRAFT',
          residenceType: 'LONG_TERM_RESIDENTIAL',
          roomTypeId: 101,
          services: [
            { serviceId: 7, inPackage: true },
            { serviceId: 8, inPackage: true },
            { serviceId: 9, inPackage: false },
          ],
          allowedCommands: [],
        }}
        residentName="Nguyễn Thị Lan"
        onChanged={() => {}}
        onEdit={() => {}}
        Title="h2"
        Description="p"
      />,
    )

    expect(await screen.findByText('Phòng 2 giường')).toBeInTheDocument()
    const list = await screen.findByRole('list', { name: 'Dịch vụ đăng ký' })
    expect(within(list).getByText('Chăm sóc cơ bản, trong gói')).toBeInTheDocument()
    expect(within(list).getByText('Phí phòng 2 giường, trong gói')).toBeInTheDocument()
    expect(within(list).getByText('Suất ăn thêm, ngoài gói')).toBeInTheDocument()
  })
})
