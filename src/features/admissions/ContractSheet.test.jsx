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

    fireEvent.click(within(dialog).getByRole('button', { name: 'Tiếp' }))
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
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tiếp' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Thường xuyên' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Theo tháng' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tiếp' }))
    const select = within(dialog).getByRole('combobox', { name: 'Loại phòng' })
    await vi.waitFor(() => expect(select).toHaveAttribute('aria-invalid', 'true'))
    expect(within(dialog).getAllByText('Chọn loại phòng')).toHaveLength(2)
    expect(api.calls('POST', '/contracts')).toHaveLength(0)

    expect(await within(select).findByRole('option', { name: 'Phòng đôi' })).toBeInTheDocument()
    expect(within(select).queryByRole('option', { name: 'Phòng ngắn ngày' })).toBeNull()
    expect(within(select).queryByRole('option', { name: 'Phòng cũ' })).toBeNull()
    fireEvent.change(select, { target: { value: '1' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tiếp' }))
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

    fireEvent.click(within(dialog).getByRole('button', { name: 'Nội trú dài hạn' }))
    fireEvent.change(within(dialog).getByLabelText('Ngày bắt đầu'), { target: { value: '2026-11-20' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tiếp' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cơ bản' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Thường xuyên' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Theo tháng' }))
    const select = within(dialog).getByRole('combobox', { name: 'Loại phòng' })
    await within(select).findByRole('option', { name: 'Phòng đôi' })
    fireEvent.change(select, { target: { value: '1' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tiếp' }))
    await within(dialog).findByRole('checkbox', { name: 'Suất ăn' })
    expect(within(dialog).queryByRole('checkbox', { name: 'Chăm sóc thường xuyên' })).toBeNull()
    expect(within(dialog).queryByRole('checkbox', { name: 'Phí lưu trú phòng đôi' })).toBeNull()
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
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dịch vụ, đặt cọc' }))
    await within(dialog).findByText('Chăm sóc thường xuyên, theo mức chăm sóc')
    await vi.waitFor(() => expect(within(dialog).getByRole('button', { name: 'Lưu hợp đồng nháp' })).not.toBeDisabled())
    // Demo 2026-11-25: ô tiền dạng xxx.xxx.xxx đ
    fireEvent.change(within(dialog).getByLabelText('Khoản đặt cọc'), { target: { value: '5000000' } })
    expect(within(dialog).getByLabelText('Khoản đặt cọc')).toHaveValue('5.000.000')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu hợp đồng nháp' }))
    await vi.waitFor(() => expect(api.calls('PUT', '/contracts/7')).toHaveLength(1))
    const body = JSON.parse(api.calls('PUT', '/contracts/7')[0][1].body)
    expect(body.depositAmount).toBe(5000000)
    expect(body.services).toEqual(
      expect.arrayContaining([
        { serviceId: 32, inPackage: false },
        { serviceId: 41, inPackage: false },
        { serviceId: 51, inPackage: true },
      ]),
    )
    expect(body.services).toHaveLength(3)
  })

  // Nhóm A BF-01 phương án B (chủ dự án chọn 2026-11-21): ba bước, "Tiếp" kiểm bước đang mở; kỳ tính phí theo loại lưu trú
  // (nội trú tháng, ngày; bán trú buổi; chủ dự án xác nhận)
  it('B_baBuoc_tiepKiemBuocDangMo_kyTinhPhiTheoLoaiLuuTru', async () => {
    render(<ContractSheet residentId={5} residentName="Nguyễn Thị Lan" onClose={() => {}} onDone={() => {}} />)
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByRole('button', { name: 'Mức, phòng' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Cơ bản' })).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tiếp' }))
    expect(await within(dialog).findByText('Chọn loại lưu trú')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Cơ bản' })).toBeNull()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Nội trú dài hạn' }))
    fireEvent.change(within(dialog).getByLabelText('Ngày bắt đầu'), { target: { value: '2026-11-20' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tiếp' }))
    expect(await within(dialog).findByRole('button', { name: 'Cơ bản' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Theo ngày' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Theo buổi' })).toBeNull()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Loại lưu trú, ngày' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bán trú' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mức, phòng' }))
    expect(within(dialog).getByRole('button', { name: 'Theo buổi' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Theo tháng' })).toBeNull()
  })

  it('B_dichVuChiaNhom_tomTatChiPhiTheoDonGiaHienHanh', async () => {
    api.on(
      'GET',
      '/services',
      json(200, [
        {
          id: 32,
          type: 'CARE',
          name: 'Chăm sóc thường xuyên',
          careLevelCode: 'REGULAR',
          billingPeriod: 'MONTH',
          status: 'ACTIVE',
        },
        {
          id: 41,
          type: 'RESIDENCY_FEE',
          name: 'Phí phòng đôi',
          roomTypeId: 1,
          billingPeriod: 'MONTH',
          status: 'ACTIVE',
        },
        { id: 51, type: 'MEAL', name: 'Suất ăn', billingPeriod: 'MONTH', status: 'ACTIVE' },
        { id: 61, type: 'DAY_CARE_SESSION', name: 'Bán trú theo buổi', billingPeriod: 'SESSION', status: 'ACTIVE' },
        { id: 71, type: 'CONSUMABLE', name: 'Tã người lớn', billingPeriod: 'UNIT', status: 'ACTIVE' },
        { id: 81, type: 'REHABILITATION', name: 'Phục hồi chức năng', billingPeriod: 'SESSION', status: 'ACTIVE' },
      ]),
    )
    api.on('GET', '/room-types', json(200, [{ id: 1, name: 'Phòng đôi', servesLongTerm: true, status: 'ACTIVE' }]))
    const price = (unitPrice) =>
      json(200, [
        { id: 1, unitPrice: unitPrice - 1000, effectiveFrom: '2020-01-01', effectiveTo: '2026-10-31' },
        { id: 2, unitPrice, effectiveFrom: '2026-11-01' },
      ])
    api.on('GET', '/services/32/price-versions', price(8_000_000))
    api.on('GET', '/services/41/price-versions', price(6_000_000))
    api.on('GET', '/services/51/price-versions', price(600_000))
    api.on('GET', '/services/81/price-versions', price(150_000))
    render(<ContractSheet residentId={5} residentName="Nguyễn Thị Lan" onClose={() => {}} onDone={() => {}} />)
    const dialog = await screen.findByRole('dialog')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Nội trú dài hạn' }))
    fireEvent.change(within(dialog).getByLabelText('Ngày bắt đầu'), { target: { value: '2026-11-20' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mức, phòng' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Thường xuyên' }))
    const select = within(dialog).getByRole('combobox', { name: 'Loại phòng' })
    await within(select).findByRole('option', { name: 'Phòng đôi' })
    fireEvent.change(select, { target: { value: '1' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dịch vụ, đặt cọc' }))

    const extras = within(dialog).getByRole('group', { name: 'Dịch vụ đi kèm' })
    expect(within(extras).getByRole('checkbox', { name: 'Suất ăn' })).toBeInTheDocument()
    expect(within(extras).getByRole('checkbox', { name: 'Phục hồi chức năng' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('checkbox', { name: 'Bán trú theo buổi' })).toBeNull()
    const supplies = within(dialog).getByRole('group', { name: 'Vật tư, thuốc nguồn viện' })
    expect(within(supplies).getByRole('checkbox', { name: 'Tã người lớn' })).toBeInTheDocument()
    fireEvent.click(within(extras).getByRole('checkbox', { name: 'Suất ăn' }))
    fireEvent.click(within(extras).getByRole('checkbox', { name: 'Phục hồi chức năng' }))

    const summary = within(dialog).getByRole('region', { name: 'Tóm tắt chi phí' })
    expect(await within(summary).findByText('8.000.000 đ/tháng')).toBeInTheDocument()
    expect(await within(summary).findByText('150.000 đ/buổi')).toBeInTheDocument()
    expect(await within(summary).findByText('14.600.000 đ')).toBeInTheDocument()
  })

  it('banTru_khongCoOLoaiPhong', async () => {
    api.on('GET', '/room-types', json(200, []))
    render(<ContractSheet residentId={5} residentName="Nguyễn Thị Lan" onClose={() => {}} onDone={() => {}} />)
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bán trú' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mức, phòng' }))
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
