import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { DetailHost } from '@/test/DetailHost'
import { AccountCommandForm } from './AccountCommandForm'
import { AccountList } from './AccountList'

// Tạo tài khoản người thân (002 US6; FR-050 → FR-052; hợp đồng POST /family-accounts; chủ dự án yêu cầu 2026-11-17):
// Hành chính, Quản lý viện tìm hồ sơ người thân (GET /family-members của 012), xác minh danh tính (có mặt đối chiếu giấy
// tờ, hoặc gọi lại số đã đăng ký) rồi tạo; mật khẩu tạm hiện một lần. Backend kiểm quan hệ còn hiệu lực và xác minh.

let api

const RANG = { id: 9001, fullName: 'Nguyễn Văn Rạng', phoneNumber: '0911000001' }

beforeEach(() => {
  api = mockRoutes()
  api.on('GET', '/accounts', json(200, { items: [], nextCursor: null }))
  api.on('GET', '/family-members', json(200, [RANG]))
})

function bodyOf(method, path) {
  return JSON.parse(api.calls(method, path)[0][1].body)
}

async function openForm() {
  render(<DetailHost>{(host) => <AccountList canCreate={false} canCreateFamily {...host} />}</DetailHost>)
  fireEvent.click(await screen.findByRole('button', { name: 'Tạo tài khoản người thân' }))
  return screen.findByRole('dialog')
}

async function pickRang(dialog) {
  fireEvent.change(within(dialog).getByLabelText('Tìm người thân'), { target: { value: 'Rạng' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Tìm' }))
  fireEvent.click(await within(dialog).findByRole('radio', { name: /Nguyễn Văn Rạng/ }))
}

describe('Tài khoản người thân', () => {
  it('FR_050_FR_052_tao_goiLaiSoDaDangKy_hienMatKhauTamMotLan', async () => {
    api.on(
      'POST',
      '/family-accounts',
      json(201, {
        id: 77,
        username: 'nt-rang',
        type: 'FAMILY_MEMBER',
        status: 'ACTIVE',
        temporaryPassword: 'Tam-1234',
      }),
    )
    const dialog = await openForm()

    await pickRang(dialog)
    fireEvent.change(within(dialog).getByLabelText('Tên đăng nhập'), { target: { value: ' nt-rang ' } })
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Gọi lại số đã đăng ký' }))
    fireEvent.change(within(dialog).getByLabelText('Số đã gọi lại'), { target: { value: '0911000001' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tạo tài khoản' }))

    expect(await within(dialog).findByTestId('temporary-password')).toHaveTextContent('Tam-1234')
    expect(bodyOf('POST', '/family-accounts')).toEqual({
      familyMemberId: 9001,
      username: 'nt-rang',
      verification: { method: 'CALLBACK_REGISTERED_NUMBER', calledPhoneNumber: '0911000001' },
    })
    expect(api.calls('POST', '/family-accounts')[0][1].headers['Idempotency-Key']).toBeTruthy()
  })

  it('FR_052_coMatDoiChieuGiayTo_guiSoGiayTo', async () => {
    api.on('POST', '/family-accounts', json(201, { id: 78, username: 'nt-rang', temporaryPassword: 'Tam-5678' }))
    const dialog = await openForm()

    await pickRang(dialog)
    fireEvent.change(within(dialog).getByLabelText('Tên đăng nhập'), { target: { value: 'nt-rang' } })
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Có mặt, đối chiếu giấy tờ tùy thân' }))
    fireEvent.change(within(dialog).getByLabelText('Số giấy tờ đã đối chiếu'), { target: { value: '001080000001' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tạo tài khoản' }))

    await within(dialog).findByTestId('temporary-password')
    expect(bodyOf('POST', '/family-accounts').verification).toEqual({
      method: 'IN_PERSON_ID_DOCUMENT',
      idDocumentNumber: '001080000001',
    })
  })

  it('FR_052_thieuTruong_baoTaiO_khongGui', async () => {
    const dialog = await openForm()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Tạo tài khoản' }))

    expect(await within(dialog).findByText('Chọn một hồ sơ người thân')).toBeTruthy()
    expect(within(dialog).getByText('Nhập tên đăng nhập')).toBeTruthy()
    expect(within(dialog).getByText('Chọn cách xác minh danh tính')).toBeTruthy()
    expect(api.calls('POST', '/family-accounts')).toHaveLength(0)
  })

  it('FR_052_409XacMinhKhongHopLe_hienLoi', async () => {
    api.on('POST', '/family-accounts', problem(409, 'INVALID_VERIFICATION', { detail: 'Số đã gọi khác số đã đăng ký' }))
    const dialog = await openForm()

    await pickRang(dialog)
    fireEvent.change(within(dialog).getByLabelText('Tên đăng nhập'), { target: { value: 'nt-rang' } })
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Gọi lại số đã đăng ký' }))
    fireEvent.change(within(dialog).getByLabelText('Số đã gọi lại'), { target: { value: '0900000000' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tạo tài khoản' }))

    expect(await within(dialog).findByText('Số đã gọi khác số đã đăng ký')).toBeTruthy()
    expect(within(dialog).queryByTestId('temporary-password')).toBeNull()
  })

  it('không có quyền tạo thì không có nút', async () => {
    render(<DetailHost>{(host) => <AccountList canCreate={false} {...host} />}</DetailHost>)
    await screen.findByRole('button', { name: 'Lọc' })
    expect(screen.queryByRole('button', { name: 'Tạo tài khoản người thân' })).toBeNull()
  })
})

// BF-14 test web 2026-11-23: cấp lại mật khẩu người thân luôn 422 "Cần ghi cách xác minh (FR-052)" vì form chỉ gửi lý do
describe('Cấp lại mật khẩu tài khoản người thân (FR-051, FR-052)', () => {
  function renderReset(account) {
    render(
      <AccountCommandForm command="reset-password" account={account} etag={null} onDone={() => {}} onCancel={() => {}} />,
    )
  }

  it('FR_052_capLaiMatKhauNguoiThan_batBuocXacMinh_khongGui', async () => {
    renderReset({ id: 20, type: 'FAMILY_MEMBER' })
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Quên mật khẩu' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cấp mật khẩu tạm' }))

    expect(await screen.findByText('Chọn cách xác minh danh tính')).toBeTruthy()
    expect(api.calls('POST', '/accounts/20/reset-password')).toHaveLength(0)
  })

  it('FR_052_capLaiMatKhauNguoiThan_goiLaiSoDaDangKy_guiXacMinh', async () => {
    api.on('POST', '/accounts/20/reset-password', json(200, { temporaryPassword: 'Tam-9999' }))
    renderReset({ id: 20, type: 'FAMILY_MEMBER' })
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Quên mật khẩu' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Gọi lại số đã đăng ký' }))
    fireEvent.change(screen.getByLabelText('Số đã gọi lại'), { target: { value: ' 0900000000 ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cấp mật khẩu tạm' }))

    expect(await screen.findByTestId('temporary-password')).toHaveTextContent('Tam-9999')
    expect(bodyOf('POST', '/accounts/20/reset-password')).toEqual({
      reason: 'Quên mật khẩu',
      verification: { method: 'CALLBACK_REGISTERED_NUMBER', calledPhoneNumber: '0900000000' },
    })
  })

  it('capLaiMatKhauNhanVien_khongHoiXacMinh', async () => {
    api.on('POST', '/accounts/5/reset-password', json(200, { temporaryPassword: 'Tam-1111' }))
    renderReset({ id: 5, type: 'STAFF' })
    expect(screen.queryByText('Xác minh danh tính')).toBeNull()
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Quên mật khẩu' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cấp mật khẩu tạm' }))

    await screen.findByTestId('temporary-password')
    expect(bodyOf('POST', '/accounts/5/reset-password')).toEqual({ reason: 'Quên mật khẩu' })
  })
})
