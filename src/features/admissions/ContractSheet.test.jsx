import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { ContractDetail, ContractSheet } from './ContractParts'

// Lập hợp đồng từ Hồ sơ tiếp nhận (chủ dự án yêu cầu 2026-11-17): người cao tuổi đã biết nên chỉ hiện họ tên, không có ô
// chọn người cao tuổi khác; lệnh vẫn gửi đúng mã người cao tuổi. Audit BF-01 2026-11-27: một trang ba phần, nút lưu ở chân.

let api

beforeEach(() => {
  api = mockRoutes()
  api.on('GET', '/services', json(200, []))
  // jsdom không có scrollIntoView (form cuộn tới ô lỗi đầu tiên)
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const ROOM_TYPES = [
  { id: 1, name: 'Phòng đôi', servesLongTerm: true, servesShortTerm: true, status: 'ACTIVE' },
  { id: 2, name: 'Phòng ngắn ngày', servesLongTerm: false, servesShortTerm: true, status: 'ACTIVE' },
  { id: 3, name: 'Phòng cũ', servesLongTerm: true, servesShortTerm: true, status: 'INACTIVE' },
]

function openNew(props = {}) {
  render(<ContractSheet residentId={5} residentName="Nguyễn Thị Lan" onClose={() => {}} onDone={() => {}} {...props} />)
  return screen.findByRole('dialog')
}

const pick = (scope, name) => fireEvent.click(within(scope).getByRole('button', { name }))
const roomGroup = (scope) => within(scope).getByRole('group', { name: 'Loại phòng' })
const pickRoom = async (scope, name) => fireEvent.click(await within(roomGroup(scope)).findByRole('button', { name }))
const setStart = (scope, value) =>
  fireEvent.change(within(scope).getByLabelText(/^Ngày bắt đầu/), { target: { value } })
const depositInput = (scope) => within(scope).getByLabelText(/^Khoản đặt cọc/)
const save = (scope) => pick(scope, 'Lưu hợp đồng nháp')

describe('ContractSheet', () => {
  it('mở cho một người cao tuổi: một trang ba phần, chỉ hiện họ tên, không có ô chọn, không báo thiếu người cao tuổi', async () => {
    const dialog = await openNew()

    expect(within(dialog).getByText('Nguyễn Thị Lan')).toBeInTheDocument()
    expect(within(dialog).queryByRole('combobox', { name: 'Người cao tuổi' })).toBeNull()
    expect(api.calls('GET', '/residents')).toHaveLength(0)
    expect(within(dialog).getByText('01 · Lưu trú')).toBeInTheDocument()
    expect(within(dialog).getByText('02 · Mức, phòng')).toBeInTheDocument()
    expect(within(dialog).getByText('03 · Dịch vụ, đặt cọc')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Tiếp' })).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Hủy' })).toBeInTheDocument()

    save(dialog)
    expect(await within(dialog).findByText('Chọn loại lưu trú')).toBeInTheDocument()
    expect(within(dialog).getByText('Chọn đặt cọc')).toBeInTheDocument()
    expect(within(dialog).queryByText('Chọn người cao tuổi')).toBeNull()
    expect(api.calls('POST', '/contracts')).toHaveLength(0)
  })

  // 004 FR-019: hợp đồng nội trú có loại phòng (hoặc giường), thiếu thì Gửi ký bị 409 CONTRACT_ROOM_REQUIRED (BF-01 bước 9)
  it('noiTru_chonLoaiPhongPhucVuLoaiLuuTru_guiRoomTypeId', async () => {
    api.on('GET', '/room-types', json(200, ROOM_TYPES))
    api.on('POST', '/contracts', json(201, { id: 9 }))
    const dialog = await openNew()

    pick(dialog, 'Nội trú dài hạn')
    setStart(dialog, '20/11/2026')
    pick(dialog, 'Thường xuyên')
    pick(dialog, 'Theo tháng')
    pick(dialog, 'Không yêu cầu đặt cọc')
    save(dialog)
    expect(await within(dialog).findByText('Chọn loại phòng')).toBeInTheDocument()
    expect(api.calls('POST', '/contracts')).toHaveLength(0)

    const rooms = roomGroup(dialog)
    expect(await within(rooms).findByRole('button', { name: 'Phòng đôi' })).toBeInTheDocument()
    expect(within(rooms).queryByRole('button', { name: 'Phòng ngắn ngày' })).toBeNull()
    expect(within(rooms).queryByRole('button', { name: 'Phòng cũ' })).toBeNull()
    pick(rooms, 'Phòng đôi')
    save(dialog)

    await vi.waitFor(() => expect(api.calls('POST', '/contracts')).toHaveLength(1))
    expect(JSON.parse(api.calls('POST', '/contracts')[0][1].body)).toMatchObject({
      residentId: 5,
      residenceType: 'LONG_TERM_RESIDENTIAL',
      startDate: '2026-11-20',
      careLevel: 'REGULAR',
      residencyFeeBillingPeriod: 'MONTH',
      roomTypeId: 1,
      noDepositRequired: true,
    })
  })

  // Q-300, 6.4, Q-426: dịch vụ chăm sóc theo mức và phí lưu trú theo loại phòng là tác động kèm lựa chọn mức, loại phòng;
  // không tick tay; dịch vụ đi kèm chỉ bốn loại (phục hồi, hoạt động, đưa đi khám, tiêm), gập sẵn, luôn ngoài gói
  it('dichVuChamSocVaPhiPhong_datTheoMucVaLoaiPhong_dichVuDiKemChiBonLoai', async () => {
    api.on(
      'GET',
      '/services',
      json(200, [
        { id: 31, type: 'CARE', name: 'Chăm sóc cơ bản', careLevelCode: 'BASIC', status: 'ACTIVE' },
        { id: 32, type: 'CARE', name: 'Chăm sóc thường xuyên', careLevelCode: 'REGULAR', status: 'ACTIVE' },
        { id: 41, type: 'RESIDENCY_FEE', name: 'Phí lưu trú phòng đôi', roomTypeId: 1, billingPeriod: 'MONTH', status: 'ACTIVE' },
        { id: 42, type: 'RESIDENCY_FEE', name: 'Phí lưu trú phòng bốn giường', roomTypeId: 2, billingPeriod: 'MONTH', status: 'ACTIVE' },
        { id: 51, type: 'MEAL', name: 'Suất ăn', status: 'ACTIVE' },
        { id: 71, type: 'CONSUMABLE', name: 'Tã người lớn', status: 'ACTIVE' },
        { id: 81, type: 'REHABILITATION', name: 'Phục hồi chức năng', status: 'ACTIVE' },
      ]),
    )
    api.on('GET', '/room-types', json(200, ROOM_TYPES))
    api.on('POST', '/contracts', json(201, { id: 9 }))
    const dialog = await openNew()

    pick(dialog, 'Nội trú dài hạn')
    setStart(dialog, '20/11/2026')
    pick(dialog, 'Cơ bản')
    pick(dialog, 'Thường xuyên')
    pick(dialog, 'Theo tháng')
    await pickRoom(dialog, 'Phòng đôi')

    const fixed = await within(dialog).findByRole('list', { name: 'Theo mức chăm sóc, loại phòng' })
    expect(within(fixed).getByText('Chăm sóc thường xuyên')).toBeInTheDocument()
    expect(within(fixed).getByText('Phí lưu trú phòng đôi')).toBeInTheDocument()
    expect(within(fixed).queryByText('Chăm sóc cơ bản')).toBeNull()

    const extras = within(dialog).getByRole('button', { name: 'Dịch vụ đi kèm' })
    expect(extras).toHaveAttribute('aria-expanded', 'false')
    expect(within(dialog).queryByRole('button', { name: 'Chọn Phục hồi chức năng' })).toBeNull()
    fireEvent.click(extras)
    expect(within(dialog).getByRole('button', { name: 'Chọn Phục hồi chức năng' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Chọn Suất ăn' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Chọn Tã người lớn' })).toBeNull()
    expect(within(dialog).queryByText(/Thuộc gói/)).toBeNull()
    pick(dialog, 'Chọn Phục hồi chức năng')
    expect(within(dialog).getByRole('button', { name: 'Dịch vụ đi kèm (1)' })).toBeInTheDocument()

    pick(dialog, 'Không yêu cầu đặt cọc')
    save(dialog)
    await vi.waitFor(() => expect(api.calls('POST', '/contracts')).toHaveLength(1))
    const body = JSON.parse(api.calls('POST', '/contracts')[0][1].body)
    expect(body.services).toEqual([
      { serviceId: 32, inPackage: false },
      { serviceId: 41, inPackage: false },
      { serviceId: 81, inPackage: false },
    ])
  })

  it('suaNhap_dongCuCuaMucKhac_thayBangDichVuTheoMucHienTai_guiNgoaiGoi', async () => {
    api.on(
      'GET',
      '/services',
      json(200, [
        { id: 31, type: 'CARE', name: 'Chăm sóc cơ bản', careLevelCode: 'BASIC', status: 'ACTIVE' },
        { id: 32, type: 'CARE', name: 'Chăm sóc thường xuyên', careLevelCode: 'REGULAR', status: 'ACTIVE' },
        { id: 41, type: 'RESIDENCY_FEE', name: 'Phí lưu trú phòng đôi', roomTypeId: 1, billingPeriod: 'MONTH', status: 'ACTIVE' },
        { id: 42, type: 'RESIDENCY_FEE', name: 'Phí lưu trú phòng bốn giường', roomTypeId: 2, billingPeriod: 'MONTH', status: 'ACTIVE' },
        { id: 81, type: 'REHABILITATION', name: 'Phục hồi chức năng', status: 'ACTIVE' },
      ]),
    )
    api.on('GET', '/room-types', json(200, ROOM_TYPES))
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
        { serviceId: 81, inPackage: true },
      ],
    }
    render(<ContractSheet contract={contract} residentName="Nguyễn Thị Lan" onClose={() => {}} onDone={() => {}} />)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Sửa hợp đồng nháp' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/^Ngày bắt đầu/)).toHaveValue('20/11/2026')
    const fixed = await within(dialog).findByRole('list', { name: 'Theo mức chăm sóc, loại phòng' })
    expect(within(fixed).getByText('Chăm sóc thường xuyên')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Chọn Phục hồi chức năng' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await vi.waitFor(() => expect(within(dialog).getByRole('button', { name: 'Lưu hợp đồng nháp' })).not.toBeDisabled())
    pick(dialog, 'Có đặt cọc')
    // Demo 2026-11-25: ô tiền dạng xxx.xxx.xxx đ
    fireEvent.change(depositInput(dialog), { target: { value: '5000000' } })
    expect(depositInput(dialog)).toHaveValue('5.000.000')

    save(dialog)
    await vi.waitFor(() => expect(api.calls('PUT', '/contracts/7')).toHaveLength(1))
    const request = api.calls('PUT', '/contracts/7')[0][1]
    expect(request.headers['If-Match']).toBe('"3"')
    const body = JSON.parse(request.body)
    expect(body.depositAmount).toBe(5000000)
    expect(body.noDepositRequired).toBe(false)
    expect(body.services).toEqual([
      { serviceId: 32, inPackage: false },
      { serviceId: 41, inPackage: false },
      { serviceId: 81, inPackage: false },
    ])
  })

  // Q-462: dài hạn chỉ tháng; ngắn ngày tháng, ngày; bán trú tháng, buổi; bán trú không có ô loại phòng
  it('kyTinhPhiTheoLoaiLuuTru_banTruKhongCoLoaiPhong', async () => {
    api.on('GET', '/room-types', json(200, ROOM_TYPES))
    const dialog = await openNew()

    expect(within(dialog).queryByRole('button', { name: 'Theo tháng' })).toBeNull()
    pick(dialog, 'Nội trú dài hạn')
    expect(within(dialog).getByRole('button', { name: 'Theo tháng' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Theo ngày' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Theo buổi' })).toBeNull()
    expect(roomGroup(dialog)).toBeInTheDocument()

    pick(dialog, 'Nội trú ngắn ngày')
    expect(within(dialog).getByRole('button', { name: 'Theo tháng' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Theo ngày' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Theo buổi' })).toBeNull()

    pick(dialog, 'Bán trú')
    expect(within(dialog).getByRole('button', { name: 'Theo buổi' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Theo tháng' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Theo ngày' })).toBeNull()
    expect(within(dialog).queryByRole('group', { name: 'Loại phòng' })).toBeNull()
  })

  // Q-462: ngắn ngày giá ngày gắn phí lưu trú kỳ ngày của loại phòng, không gắn phí giá tháng
  it('nganNgayGiaNgay_ganPhiLuuTruKyNgay', async () => {
    api.on(
      'GET',
      '/services',
      json(200, [
        { id: 31, type: 'CARE', name: 'Chăm sóc cơ bản', careLevelCode: 'BASIC', status: 'ACTIVE' },
        { id: 41, type: 'RESIDENCY_FEE', name: 'Phòng đôi theo tháng', roomTypeId: 1, billingPeriod: 'MONTH', status: 'ACTIVE' },
        { id: 43, type: 'RESIDENCY_FEE', name: 'Phòng đôi theo ngày', roomTypeId: 1, billingPeriod: 'DAY', status: 'ACTIVE' },
      ]),
    )
    api.on('GET', '/room-types', json(200, ROOM_TYPES))
    const dialog = await openNew()

    pick(dialog, 'Nội trú ngắn ngày')
    pick(dialog, 'Cơ bản')
    pick(dialog, 'Theo ngày')
    await pickRoom(dialog, 'Phòng đôi')
    const fixed = await within(dialog).findByRole('list', { name: 'Theo mức chăm sóc, loại phòng' })
    expect(within(fixed).getByText('Phòng đôi theo ngày')).toBeInTheDocument()
    expect(within(fixed).queryByText('Phòng đôi theo tháng')).toBeNull()
  })

  // Q-462: bán trú giá tháng gắn dòng buổi bán trú kỳ tháng, không gắn dòng giá buổi
  it('banTruGiaThang_ganDongBuoiBanTruKyThang', async () => {
    api.on(
      'GET',
      '/services',
      json(200, [
        { id: 31, type: 'CARE', name: 'Chăm sóc cơ bản', careLevelCode: 'BASIC', status: 'ACTIVE' },
        { id: 61, type: 'DAY_CARE_SESSION', name: 'Bán trú theo buổi', billingPeriod: 'SESSION', status: 'ACTIVE' },
        { id: 62, type: 'DAY_CARE_SESSION', name: 'Bán trú theo tháng', billingPeriod: 'MONTH', status: 'ACTIVE' },
      ]),
    )
    api.on('GET', '/room-types', json(200, ROOM_TYPES))
    api.on('POST', '/contracts', json(201, { id: 9 }))
    const dialog = await openNew()

    pick(dialog, 'Bán trú')
    setStart(dialog, '20/11/2026')
    pick(dialog, 'Cơ bản')
    pick(dialog, 'Theo tháng')
    pick(dialog, 'Không yêu cầu đặt cọc')
    const fixed = await within(dialog).findByRole('list', { name: 'Theo mức chăm sóc, loại phòng' })
    expect(within(fixed).getByText('Bán trú theo tháng')).toBeInTheDocument()
    expect(within(fixed).queryByText('Bán trú theo buổi')).toBeNull()
    save(dialog)
    await vi.waitFor(() => expect(api.calls('POST', '/contracts')).toHaveLength(1))
    const body = JSON.parse(api.calls('POST', '/contracts')[0][1].body)
    expect(body.residencyFeeBillingPeriod).toBe('MONTH')
    expect(body.services).toEqual([
      { serviceId: 31, inPackage: false },
      { serviceId: 62, inPackage: false },
    ])
  })

  // Bán trú tự gắn dịch vụ buổi bán trú (Q-426), không gửi loại phòng
  it('banTru_tuGanBuoiBanTru_khongGuiLoaiPhong', async () => {
    api.on(
      'GET',
      '/services',
      json(200, [
        { id: 31, type: 'CARE', name: 'Chăm sóc cơ bản', careLevelCode: 'BASIC', status: 'ACTIVE' },
        { id: 61, type: 'DAY_CARE_SESSION', name: 'Bán trú theo buổi', billingPeriod: 'SESSION', status: 'ACTIVE' },
      ]),
    )
    api.on('GET', '/room-types', json(200, ROOM_TYPES))
    api.on('POST', '/contracts', json(201, { id: 9 }))
    const dialog = await openNew()

    pick(dialog, 'Bán trú')
    setStart(dialog, '20/11/2026')
    pick(dialog, 'Cơ bản')
    pick(dialog, 'Theo buổi')
    pick(dialog, 'Không yêu cầu đặt cọc')
    const fixed = await within(dialog).findByRole('list', { name: 'Theo mức chăm sóc, loại phòng' })
    expect(within(fixed).getByText('Bán trú theo buổi')).toBeInTheDocument()
    save(dialog)
    await vi.waitFor(() => expect(api.calls('POST', '/contracts')).toHaveLength(1))
    const body = JSON.parse(api.calls('POST', '/contracts')[0][1].body)
    expect(body.services).toEqual([
      { serviceId: 31, inPackage: false },
      { serviceId: 61, inPackage: false },
    ])
    expect(body).not.toHaveProperty('roomTypeId')
    expect(body.arrivalSchedule).toEqual([])
  })

  // Tóm tắt chi phí theo đơn giá hiện hành; khoản đặt cọc tự điền 1 tháng (chăm sóc + phí lưu trú) tới khi sửa tay
  it('tomTatChiPhiTheoDonGiaHienHanh_datCocTuDienMotThang_suaTayThiGiu', async () => {
    api.on(
      'GET',
      '/services',
      json(200, [
        {
          id: 31,
          type: 'CARE',
          name: 'Chăm sóc cơ bản',
          careLevelCode: 'BASIC',
          billingPeriod: 'MONTH',
          status: 'ACTIVE',
        },
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
        { id: 81, type: 'REHABILITATION', name: 'Phục hồi chức năng', billingPeriod: 'SESSION', status: 'ACTIVE' },
      ]),
    )
    api.on('GET', '/room-types', json(200, ROOM_TYPES))
    const price = (unitPrice) =>
      json(200, [
        { id: 1, unitPrice: unitPrice - 1000, effectiveFrom: '2020-01-01', effectiveTo: '2026-10-31' },
        { id: 2, unitPrice, effectiveFrom: '2026-11-01' },
      ])
    api.on('GET', '/services/31/price-versions', price(5_000_000))
    api.on('GET', '/services/32/price-versions', price(8_000_000))
    api.on('GET', '/services/41/price-versions', price(6_000_000))
    api.on('GET', '/services/81/price-versions', price(150_000))
    const dialog = await openNew()

    pick(dialog, 'Nội trú dài hạn')
    setStart(dialog, '20/11/2026')
    pick(dialog, 'Thường xuyên')
    // Q-462: phí lưu trú theo loại phòng và kỳ tính của hợp đồng
    pick(dialog, 'Theo tháng')
    await pickRoom(dialog, 'Phòng đôi')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dịch vụ đi kèm' }))
    pick(dialog, 'Chọn Phục hồi chức năng')

    const summary = within(dialog).getByRole('region', { name: 'Tóm tắt chi phí' })
    expect(await within(summary).findByText('8.000.000 đ/tháng')).toBeInTheDocument()
    expect(await within(summary).findByText('150.000 đ/buổi')).toBeInTheDocument()
    expect(await within(summary).findByText('14.000.000 đ')).toBeInTheDocument()

    pick(dialog, 'Có đặt cọc')
    expect(depositInput(dialog)).toHaveValue('14.000.000')
    pick(dialog, 'Cơ bản')
    await vi.waitFor(() => expect(depositInput(dialog)).toHaveValue('11.000.000'))
    fireEvent.change(depositInput(dialog), { target: { value: '3000000' } })
    pick(dialog, 'Thường xuyên')
    expect(depositInput(dialog)).toHaveValue('3.000.000')
    expect(within(summary).getByText('3.000.000 đ')).toBeInTheDocument()
  })

  // 004 FR-021: hợp đồng nội trú không bắt đầu sớm hơn giường đã phân bổ; báo ngay dưới ô ngày bắt đầu
  it('noiTru_ngayBatDauSomHonGiuong_baoNgayDuoiO', async () => {
    api.on('GET', '/room-types', json(200, ROOM_TYPES))
    api.on(
      'GET',
      '/bed-allocations',
      json(200, [
        {
          id: 4,
          status: 'FUTURE',
          plannedStartAt: '2026-11-25T01:00:00Z',
          location: { roomId: 1, area: 'Khu A', floor: 'Tầng 2', room: 'Phòng 201', bed: 'G2', label: 'P201 – G2' },
        },
      ]),
    )
    api.on('GET', '/rooms', json(200, [{ id: 1, roomTypeId: 1 }]))
    const dialog = await openNew()

    pick(dialog, 'Nội trú dài hạn')
    expect(await within(dialog).findByText('Phòng 201, G2 · Khu A – Tầng 2')).toBeInTheDocument()
    setStart(dialog, '20/11/2026')
    expect(
      within(dialog).getByText('Giường bắt đầu 25/11/2026; ngày bắt đầu hợp đồng không được sớm hơn (FR-021)'),
    ).toBeInTheDocument()
    setStart(dialog, '25/11/2026')
    expect(within(dialog).queryByText(/ngày bắt đầu hợp đồng không được sớm hơn/)).toBeNull()
  })

  // defaults (chủ dự án duyệt 2026-11-27): chép lại loại lưu trú, ngày bắt đầu, mức, loại phòng đã ghi; kỳ tính phí, đặt cọc
  // không điền sẵn
  it('defaults_dienSanLoaiLuuTruNgayMucLoaiPhong_khongDienKyVaDatCoc', async () => {
    api.on('GET', '/room-types', json(200, ROOM_TYPES))
    const dialog = await openNew({
      defaults: {
        residenceType: 'LONG_TERM_RESIDENTIAL',
        startDate: '2026-11-20',
        careLevel: 'REGULAR',
        roomTypeId: 1,
      },
    })

    expect(within(dialog).getByRole('button', { name: 'Nội trú dài hạn' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialog).getByLabelText(/^Ngày bắt đầu/)).toHaveValue('20/11/2026')
    expect(within(dialog).getByRole('button', { name: 'Thường xuyên' })).toHaveAttribute('aria-pressed', 'true')
    expect(await within(roomGroup(dialog)).findByRole('button', { name: 'Phòng đôi' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(dialog).getByRole('button', { name: 'Theo tháng' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(dialog).getByRole('button', { name: 'Có đặt cọc' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(dialog).getByRole('button', { name: 'Không yêu cầu đặt cọc' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })
})

function renderDetail(contract, props = {}) {
  render(
    <ContractDetail
      contract={{ id: 3, residentId: 5, contractNumber: 'HD-001', allowedCommands: [], ...contract }}
      residentName="Nguyễn Thị Lan"
      residentCode="NCT-0005"
      onChanged={() => {}}
      onEdit={() => {}}
      Title="h2"
      Description="p"
      {...props}
    />,
  )
}

describe('ContractDetail', () => {
  beforeEach(() => {
    api.on('GET', '/contracts/3/addenda', json(200, []))
  })

  it('dauKhung_soHopDongTrangThai_dongPhuHoTenMa_datCocCanVaDaThu', async () => {
    api.on('GET', '/contracts/3/deposit', json(200, { status: 'NOT_SATISFIED', requiredAmount: 5_000_000 }))
    api.on('GET', '/residents/5/balance', problem(404, 'NOT_FOUND'))
    renderDetail({ status: 'PENDING_SIGNATURE' })

    const title = screen.getByRole('heading', { name: /Hợp đồng HD-001/ })
    expect(within(title).getByText('Chờ ký')).toBeInTheDocument()
    expect(screen.getByText('Nguyễn Thị Lan · NCT-0005')).toBeInTheDocument()
    expect(await screen.findByText('Cần 5.000.000 đ · đã thu 0 đ · Chưa đặt cọc')).toBeInTheDocument()
    expect(screen.queryByText(/Trường tài chính được ẩn/)).toBeNull()
    expect(screen.queryByText(/Kế toán xác nhận đặt cọc/)).toBeNull()
  })

  it('ghiNhanDaKy_chiChonNguoiDaiDienConHieuLuc_kiemNgayKy', async () => {
    api.on('GET', '/contracts/3/deposit', json(200, { status: 'SATISFIED' }))
    api.on(
      'GET',
      '/residents/5/relationships',
      json(200, [
        { id: 1, status: 'ACTIVE', representative: true, familyMember: { id: 11, fullName: 'Trần Văn Đại' } },
        { id: 2, status: 'ACTIVE', representative: false, familyMember: { id: 12, fullName: 'Trần Thị Liên' } },
        { id: 3, status: 'ENDED', representative: true, familyMember: { id: 13, fullName: 'Trần Văn Cũ' } },
      ]),
    )
    renderDetail({ status: 'PENDING_SIGNATURE', allowedCommands: ['record-signed'] }, { canUpdate: true })

    fireEvent.click(await screen.findByRole('button', { name: 'Ghi nhận đã ký' }))
    const form = screen.getByRole('form', { name: 'Ghi nhận đã ký' })
    const representatives = await within(form).findByRole('radiogroup', { name: /Người đại diện ký/ })
    expect(within(representatives).getByRole('radio', { name: 'Trần Văn Đại' })).not.toBeChecked()
    expect(within(representatives).queryByRole('radio', { name: 'Trần Thị Liên' })).toBeNull()
    expect(within(representatives).queryByRole('radio', { name: 'Trần Văn Cũ' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Lưu đã ký' }))
    expect(await within(form).findByText('Nhập ngày ký')).toBeInTheDocument()
    expect(within(form).getByText('Chọn người đại diện ký')).toBeInTheDocument()
    expect(within(form).getByText('Chọn bản scan hợp đồng đã ký')).toBeInTheDocument()
    fireEvent.change(within(form).getByLabelText(/^Ngày ký/), { target: { value: '01/01/2099' } })
    expect(within(form).getByText('Ngày ký không sau hôm nay')).toBeInTheDocument()
    expect(api.calls('POST', '/contracts/3/record-signed')).toHaveLength(0)
  })

  // FR-021: hợp đồng nội trú phải có giường đã phân bổ trước khi ghi nhận đã ký: thiếu thì khóa nút
  it('ghiNhanDaKy_noiTruChuaCoGiuong_khoaNutLuu', async () => {
    api.on('GET', '/contracts/3/deposit', json(200, { status: 'SATISFIED' }))
    api.on('GET', '/residents/5/relationships', json(200, []))
    api.on('GET', '/bed-allocations', json(200, []))
    api.on('GET', '/rooms', json(200, []))
    api.on('GET', '/room-types', json(200, []))
    renderDetail(
      {
        status: 'PENDING_SIGNATURE',
        residenceType: 'LONG_TERM_RESIDENTIAL',
        startDate: '2026-11-20',
        allowedCommands: ['record-signed'],
      },
      { canUpdate: true },
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Ghi nhận đã ký' }))
    expect(await screen.findByText('Chưa có giường phân bổ: chọn giường trước khi ghi nhận đã ký')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu đã ký' })).toBeDisabled()
  })

  // FR-025: Gửi ký hỏi lại rồi mới gửi; cảnh báo backend nối vào thông báo
  it('guiKy_hoiLaiRoiMoiGui_canhBaoNoiVaoThongBao', async () => {
    const changed = vi.fn()
    api.on('GET', '/contracts/3/deposit', json(200, { status: 'SATISFIED' }))
    api.on('GET', '/contracts/3/non-standard-terms', json(200, []))
    api.on(
      'POST',
      '/contracts/3/send-for-signature',
      json(200, { warnings: [{ code: 'NO_BED', description: 'Chưa có giường phân bổ' }] }),
    )
    renderDetail(
      { status: 'DRAFT', allowedCommands: ['send-for-signature', 'cancel'] },
      { canUpdate: true, onChanged: changed },
    )

    expect(screen.getByRole('button', { name: 'Hủy hợp đồng' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Gửi ký' }))
    expect(screen.getByText('Gửi ký hợp đồng này?')).toBeInTheDocument()
    expect(api.calls('POST', '/contracts/3/send-for-signature')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Gửi ký' }))
    await vi.waitFor(() => expect(changed).toHaveBeenCalledWith('Đã gửi ký. Lưu ý: Chưa có giường phân bổ'))
    expect(api.calls('POST', '/contracts/3/send-for-signature')[0][1].headers['Idempotency-Key']).toBeTruthy()
  })

  // 4b (chủ dự án duyệt 2026-11-21): khung chi tiết ghi loại phòng và các dịch vụ đăng ký bằng tên; Chi phí có đơn giá,
  // "Mỗi tháng"
  it('hienLoaiPhongVaChiPhiBangTen_donGiaMoiThang', async () => {
    api.on('GET', '/contracts/3/deposit', json(200, { status: 'SATISFIED' }))
    api.on('GET', '/contracts/3/non-standard-terms', json(200, []))
    api.on('GET', '/room-types', json(200, [{ id: 101, name: 'Phòng 2 giường', status: 'ACTIVE' }]))
    api.on(
      'GET',
      '/services',
      json(200, [
        { id: 7, type: 'CARE', name: 'Chăm sóc cơ bản', billingPeriod: 'MONTH' },
        { id: 8, type: 'RESIDENCY_FEE', name: 'Phí phòng 2 giường', roomTypeId: 101, billingPeriod: 'MONTH' },
        { id: 9, type: 'REHABILITATION', name: 'Phục hồi chức năng', billingPeriod: 'SESSION' },
      ]),
    )
    const price = (unitPrice) => json(200, [{ id: 1, unitPrice, effectiveFrom: '2026-01-01' }])
    api.on('GET', '/services/7/price-versions', price(5_000_000))
    api.on('GET', '/services/8/price-versions', price(4_000_000))
    api.on('GET', '/services/9/price-versions', price(150_000))
    renderDetail({
      status: 'DRAFT',
      residenceType: 'LONG_TERM_RESIDENTIAL',
      startDate: '2026-11-20',
      roomTypeId: 101,
      services: [
        { serviceId: 7, inPackage: false },
        { serviceId: 8, inPackage: false },
        { serviceId: 9, inPackage: false },
      ],
    })

    expect(await screen.findByText('Phòng 2 giường')).toBeInTheDocument()
    const costs = screen.getByRole('region', { name: 'Chi phí' })
    expect(await within(costs).findByText('Chăm sóc cơ bản')).toBeInTheDocument()
    expect(within(costs).getByText('Phí phòng 2 giường')).toBeInTheDocument()
    expect(await within(costs).findByText('150.000 đ/buổi')).toBeInTheDocument()
    expect(await within(costs).findByText('9.000.000 đ')).toBeInTheDocument()
    expect(within(costs).getByText('Mỗi tháng')).toBeInTheDocument()
  })
})
