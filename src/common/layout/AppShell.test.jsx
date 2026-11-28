import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { json, mockRoutes } from '@/test/fetchRoutes'
import { PermissionsProvider } from '@/common/permissions/permissions'
import { AppShell } from './AppShell'

// Q-463: nút "Cần hỗ trợ" ở mọi màn nhân viên (menu trái và thanh trên), trừ Cảnh báo, Sự cố đã có nút ở đầu màn
describe('AppShell, nút Cần hỗ trợ', () => {
  function withPermissions(page, permissions) {
    const api = mockRoutes()
    api.on('GET', '/me/permissions', json(200, permissions))
    api.on('GET', '/me', json(200, { roles: ['AC-06'] }))
    api.on('GET', '/me/notifications', json(200, { unreadCount: 0, unacknowledgedUrgentCount: 0, items: [] }))
    api.on('GET', '/incident-floors', json(200, [{ id: 7, name: 'Tầng 1', current: true }]))
    const onPageChange = vi.fn()
    render(
      <PermissionsProvider>
        <AppShell
          role="NURSING_STAFF"
          hasFunction={() => true}
          onRoleChange={() => {}}
          session={{ accountId: 1, fullName: 'Lê Thu Hà' }}
          page={page}
          onPageChange={onPageChange}
        >
          <p>Nội dung</p>
        </AppShell>
      </PermissionsProvider>,
    )
    return { api, onPageChange }
  }
  const ASSIST = [{ function: 'EMERGENCY_ASSIST_BUTTON', operation: 'CREATE' }]

  it('coQuyen_nutOMenuVaThanhTren_bamMoHopGui', async () => {
    withPermissions('care-tasks', ASSIST)
    const buttons = await screen.findAllByRole('button', { name: 'Cần hỗ trợ' })
    expect(buttons).toHaveLength(2)
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Cần hỗ trợ' })).toBeTruthy()
    fireEvent.click(buttons[0])
    expect(await screen.findByRole('dialog', { name: 'Cần hỗ trợ' })).toBeTruthy()
  })

  it('khongCoQuyen_hoacManCanhBao_khongCoNut', async () => {
    const { api } = withPermissions('care-tasks', [])
    await waitFor(() => expect(api.calls('GET', '/me/permissions')).toHaveLength(1))
    expect(screen.queryByRole('button', { name: 'Cần hỗ trợ' })).toBeNull()
    cleanup()

    const alerts = withPermissions('alerts', ASSIST)
    await waitFor(() => expect(alerts.api.calls('GET', '/me/permissions')).toHaveLength(1))
    // Quyền đã tải (mục menu theo quyền đã lọc lại) mà vẫn không có nút
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByRole('button', { name: 'Cần hỗ trợ' })).toBeNull()
  })
})

// Khung chung (DESIGN.md 5, 10): dưới 768px thanh trên gọn (nút mở menu, tên màn, ảnh đại diện vai trò), menu mở
// thành ngăn kéo; khối người dùng không cắt tên. jsdom không áp CSS nên thanh trên và menu trái cùng có trong DOM.

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

function shell(props = {}) {
  const onPageChange = vi.fn()
  render(
    <AppShell
      role="NURSING_STAFF"
      hasFunction={() => true}
      onRoleChange={() => {}}
      page="residents"
      onPageChange={onPageChange}
      {...props}
    >
      <p>Nội dung</p>
    </AppShell>,
  )
  return { onPageChange }
}

describe('AppShell', () => {
  it('đăng nhập thật thì mục Thông báo có số chưa xem; bản mẫu không gọi API', async () => {
    const api = mockRoutes()
    api.on('GET', '/me/notifications', json(200, { unreadCount: 3, unacknowledgedUrgentCount: 0, items: [] }))
    shell({ role: 'NURSING_HOME_MANAGER', session: { accountId: 1, fullName: 'Nguyễn Minh Quân' } })
    expect((await screen.findAllByRole('button', { name: 'Thông báo, 3 chưa xem' })).length).toBeGreaterThan(0)
    expect(api.calls('GET', '/me/notifications')[0][0]).toContain('unread=true')
    cleanup()

    const demo = mockRoutes()
    shell({ role: 'NURSING_HOME_MANAGER' })
    expect(screen.getAllByRole('button', { name: 'Thông báo' }).length).toBeGreaterThan(0)
    expect(demo.calls('GET', '/me/notifications')).toHaveLength(0)
  })

  it('thanh trên có nút mở menu và tên màn đang mở', () => {
    shell()
    const bar = screen.getByRole('banner')
    expect(within(bar).getByRole('button', { name: 'Mở menu' })).toBeTruthy()
    expect(within(bar).getByText('Người cao tuổi')).toBeTruthy()
  })

  it('nút mở menu mở ngăn kéo có các mục menu; chọn mục thì chuyển màn và đóng ngăn kéo', async () => {
    const { onPageChange } = shell()
    fireEvent.click(screen.getByRole('button', { name: 'Mở menu' }))

    const drawer = await screen.findByRole('dialog', { name: 'Menu' })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Chăm sóc hằng ngày' }))
    fireEvent.click(await within(drawer).findByRole('button', { name: 'Checklist ca' }))

    expect(onPageChange).toHaveBeenCalledWith('care-tasks')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull())
  })

  it('bấm tên nhóm thì hiện, bấm lần nữa thì ẩn các mục con; nút nhóm có aria-expanded', async () => {
    shell()
    const sidebar = screen.getByRole('navigation', { name: 'Menu chính' })
    const group = within(sidebar).getByRole('button', { name: 'Thuốc và sức khỏe' })

    expect(group).toHaveAttribute('aria-expanded', 'false')
    expect(within(sidebar).queryByRole('button', { name: 'Danh mục thuốc' })).toBeNull()

    fireEvent.click(group)
    expect(group).toHaveAttribute('aria-expanded', 'true')
    expect(await within(sidebar).findByRole('button', { name: 'Danh mục thuốc' })).toBeTruthy()

    fireEvent.click(group)
    expect(group).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() => expect(within(sidebar).queryByRole('button', { name: 'Danh mục thuốc' })).toBeNull())
  })

  it('nhóm "Việc chính" của vai trò đứng đầu, luôn hiện mục, không có nút thu gọn', () => {
    shell({ page: 'medication' })
    const sidebar = screen.getByRole('navigation', { name: 'Menu chính' })
    const primary = within(sidebar).getByRole('region', { name: 'Việc chính' })

    expect(
      within(primary)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Checklist ca', 'Phát thuốc', 'Cảnh báo', 'Bàn giao ca'])
    expect(within(primary).getByRole('button', { name: 'Phát thuốc' })).toHaveAttribute('aria-current', 'page')
    expect(within(sidebar).queryByRole('button', { name: 'Việc chính' })).toBeNull()
  })

  it('nhóm chứa trang đang mở thì mở sẵn', () => {
    shell({ page: 'medication-catalog' })
    const sidebar = screen.getByRole('navigation', { name: 'Menu chính' })

    expect(within(sidebar).getByRole('button', { name: 'Thuốc và sức khỏe' })).toHaveAttribute('aria-expanded', 'true')
    expect(within(sidebar).getByRole('button', { name: 'Danh mục thuốc' })).toHaveAttribute('aria-current', 'page')
    expect(within(sidebar).getByRole('button', { name: 'Chăm sóc hằng ngày' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('bản mẫu: menu chỉ có nhóm, mục của vai trò đang chọn', () => {
    shell({ role: 'KITCHEN_STAFF', hasFunction: null, page: 'nutrition' })
    const sidebar = screen.getByRole('navigation', { name: 'Menu chính' })

    expect(within(sidebar).getByRole('button', { name: 'Dinh dưỡng, bữa ăn' })).toBeTruthy()
    expect(within(sidebar).queryByRole('button', { name: 'Chăm sóc hằng ngày' })).toBeNull()
    expect(within(sidebar).queryByRole('button', { name: 'Chế độ ăn từng người' })).toBeNull()
  })

  it('nhớ nhóm đã mở theo trình duyệt; không đọc ghi được localStorage thì vẫn chạy', () => {
    localStorage.clear()
    shell()
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Menu chính' })).getByRole('button', { name: 'Nhân sự, ca trực' }),
    )
    cleanup()

    shell()
    expect(
      within(screen.getByRole('navigation', { name: 'Menu chính' })).getByRole('button', { name: 'Nhân sự, ca trực' }),
    ).toHaveAttribute('aria-expanded', 'true')
    cleanup()

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    shell()
    const group = within(screen.getByRole('navigation', { name: 'Menu chính' })).getByRole('button', {
      name: 'Nhân sự, ca trực',
    })
    expect(group).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(group)
    expect(group).toHaveAttribute('aria-expanded', 'true')
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('khối người dùng có nút Tài khoản của tôi, cả bản mẫu và phiên thật; đang mở thì aria-current', () => {
    const { onPageChange } = shell({ hasFunction: null })
    fireEvent.click(screen.getByRole('button', { name: 'Tài khoản của tôi' }))
    expect(onPageChange).toHaveBeenCalledWith('my-account')
    cleanup()

    shell({ page: 'my-account', session: { accountId: 9, fullName: 'Trần Thu Hà' }, onLogout: () => {} })
    expect(screen.getByRole('button', { name: 'Tài khoản của tôi' })).toHaveAttribute('aria-current', 'page')
    expect(within(screen.getByRole('banner')).getByText('Tài khoản của tôi')).toBeTruthy()
  })

  it('khối người dùng không cắt tên tài khoản', () => {
    shell({ session: { accountId: 9, fullName: 'Nguyễn Thị Phương Thảo' }, onLogout: () => {} })
    const name = screen.getAllByText('Nguyễn Thị Phương Thảo')[0]
    expect(name.className).not.toContain('truncate')
  })
})
