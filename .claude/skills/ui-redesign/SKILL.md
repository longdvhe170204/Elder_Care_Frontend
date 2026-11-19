---
name: ui-redesign
description: Quy trình dùng AI sửa bố cục một màn web Elder_Care cho đồng nhất với các màn khác. Dùng khi người dùng muốn chỉnh, đánh giá lại hay thiết kế lại một màn web, hoặc gọi /ui-redesign <tên màn>. Bọc skill frontend-design trong luật của DESIGN.md và mục 0 "Mẫu màn".
---

# Sửa bố cục một màn web

Skill của dự án, chỉ chứa quy trình. Luật giao diện nằm ở `DESIGN.md` gốc kho này; skill trỏ tới mục, không chép lại. Khi skill và DESIGN.md khác nhau thì DESIGN.md thắng; khi DESIGN.md và nghiệp vụ khác nhau thì `../Elder_Care/docs/business/nghiep-vu.md` thắng.

Kho này là kho web (Elder_Care_Frontend). Spec, hợp đồng API, nghiệp vụ, `CLAUDE.md`, `AGENTS.md` chung ở kho Elder_Care đặt cạnh (`../Elder_Care`). Không thấy thư mục đó thì báo người dùng clone ba kho cạnh nhau (README mục "Ba kho của hệ thống").

Đầu vào cần có (thiếu thì hỏi người dùng, mỗi câu một lần): tên màn hoặc mục menu, feature `NNN`, vai trò dùng chính và tài khoản demo của vai trò đó, điều người dùng thấy chưa ổn (có thể là "chưa rõ").

Làm đúng ba bước, hết mỗi bước dừng lại báo người dùng.

## Bước 1. Đánh giá (chỉ đọc, không sửa file)

1. Đọc `CLAUDE.md`, `README.md` của kho này, `../Elder_Care/AGENTS.md`; mục 0 "Mẫu màn" của `DESIGN.md`, rồi các mục mà mẫu của màn này trỏ tới, cùng mục 1, 2.2, 3.5, 8, 9, 11. File dài: đọc từng đoạn, không bỏ đoạn nào mình cần.
2. Đọc `../Elder_Care/specs/NNN-*/spec.md` (phần màn này), `contracts/api-NNN.yaml` của feature đó, và mã của màn (`src/features/...`).
3. Mở màn bằng trình duyệt trong app: bản Docker `http://localhost:8081`, hoặc `npm run dev` khi backend chạy trên máy. Đăng nhập tài khoản demo (quickstart 002 mục 1 ở kho Elder_Care). Đọc nội dung bằng `get_page_text`, xem lỗi console, request mạng; thử 375px và chế độ tối.
4. Báo ba nhóm: (a) lỗi chức năng, số liệu kèm nguyên nhân trong mã; (b) chỗ lệch DESIGN.md kèm số mục; (c) góp ý bố cục. Nói rõ màn đang thuộc mẫu nào ở mục 0, hay chưa thuộc mẫu nào.

Nếu người dùng chỉ cần sửa (a), (b) mà không đổi bố cục: bỏ Bước 2, sang Bước 3, không sửa DESIGN.md.

## Bước 2. Phương án (dùng skill `frontend-design`)

1. Nạp `frontend-design`. Phần "mỗi đề bài một bản sắc riêng, chấp nhận mạo hiểm thẩm mỹ" của skill đó chỉ áp cho cách xếp **bên trong** một mẫu màn; màu, chữ, bo góc, trạng thái, component lấy nguyên từ DESIGN.md (mục 12).
2. Đưa 2–3 phương án. Mỗi phương án nêu: dùng mẫu nào ở mục 0 (hoặc "mẫu mới" kèm lý do không mẫu nào hợp); được; chưa được; phải sửa mục nào của DESIGN.md.
3. Chỉ dùng trường mà hợp đồng API đang trả; không thêm trường, endpoint; không tự tính, tự gợi ý (Q-306, Q-307); không đổi nghiệp vụ. Phương án cần đổi API thì ghi "cần Đổi api".
4. Dựng một trang so sánh (Artifact) có khung thu nhỏ của màn theo từng phương án, màu theo token DESIGN.md, số lấy từ bản demo; số minh họa ghi "ví dụ". Đề xuất chọn một, nói lý do.
5. Dừng, chờ người dùng báo phương án đã được chủ dự án duyệt. Trang mới tạo ở chế độ riêng tư: nhắc người dùng bấm Share để chủ dự án xem được.

## Bước 3. Làm (chỉ khi đã được duyệt)

1. Từ `develop` mới nhất của kho này tạo nhánh `impl/ui-NNN-<ten-ngan>`. DESIGN.md nằm ở kho này nên quy định và mã đi cùng một nhánh, một PR.
2. Sửa DESIGN.md nếu phương án đổi quy định: tăng `version` (mục 13 điều 5), ghi căn cứ cạnh quy định, thêm dòng mục 16 "Lịch sử", sửa mục 14 nếu có nhắc màn này; mẫu mới thì thêm dòng vào bảng mục 0.
3. Dùng component có sẵn trong `src/common` và `src/components/ui` trước (skill `shadcn` khi cần thêm component shadcn). Chỉ sửa file của màn; không chạy Prettier lên mã cũ không liên quan.
4. Viết hoặc sửa test trước, chạy thấy đỏ, rồi sửa mã cho xanh. Chạy `npm test`, `npm run lint`, `npm run build`.
5. Xem lại màn trên trình duyệt với mã mới ở khổ máy tính, 375px, chế độ tối. Muốn dùng dữ liệu của bản Docker thì chạy Vite với proxy `/api` tới `http://localhost:8081` (file cấu hình tạm ở scratchpad, không sửa `vite.config.js`).
6. Không commit, không push. Soạn lệnh `git add`, `git commit`, `git push`, `gh pr create` (vào `develop`) để người dùng tự chạy; mô tả PR ghi "Mẫu màn: <tên>, DESIGN.md mục <…>"; commit không ghi tên Claude.

Gặp chỗ nghiệp vụ chưa rõ, hoặc spec và DESIGN.md mâu thuẫn: dừng, tra mã Q-xx ở `../Elder_Care/docs/business/nghiep-vu.md` mục 24 và báo lại, không đoán.
