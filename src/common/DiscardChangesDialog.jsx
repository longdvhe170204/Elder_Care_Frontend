import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'

// Hỏi lại khi đóng khung đang nhập mà chưa lưu (2026-11-26: Tạo hồ sơ, Lập đăng ký tiếp nhận). Nút an toàn "Tiếp tục
// nhập" đứng trước để nhận focus; "Bỏ và đóng" gọi onDiscard.
export function DiscardChangesDialog({ open, onKeep, onDiscard, description }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onKeep()}>
      <DialogContent showCloseButton={false}>
        <DialogTitle>Bỏ thông tin đang nhập?</DialogTitle>
        <DialogDescription>
          {description ?? 'Thông tin chưa được lưu. Đóng khung thì các ô đã nhập sẽ mất.'}
        </DialogDescription>
        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={onKeep}>
            Tiếp tục nhập
          </Button>
          <Button variant="destructive" className="h-11" onClick={onDiscard}>
            Bỏ và đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
