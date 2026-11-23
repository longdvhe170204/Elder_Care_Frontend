import App from './App.jsx'
import { ChangePasswordPage } from '@/features/auth/ChangePasswordPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { PortalBelongings } from '@/features/belongings/PortalBelongings'
import { FamilyPortal } from '@/features/family-portal/FamilyPortal'

// Đăng nhập chung ở /login, đổi mật khẩu ở /change-password (002 T045); cổng người thân ở /family (trang chủ là trang
// giới thiệu viện); phần đồ gửi của 013 truyền vào cổng như App.jsx vì feature không import chéo (frontend/README 4.1).
// React Router đã cài (000 T005), chuyển sang khi làm màn hình chức năng.
export function rootPage(path) {
  if (path.startsWith('/login')) return <LoginPage />
  if (path.startsWith('/change-password')) return <ChangePasswordPage />
  if (path.startsWith('/family')) return <FamilyPortal belongings={PortalBelongings} />
  return <App />
}
