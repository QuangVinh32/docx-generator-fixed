# DOCX Generator - TypeScript

## Cài đặt và chạy

```bash
npm install
npm run dev
```

Giao diện React + TypeScript mở tại `http://localhost:5173`; API Node.js chạy nội bộ tại `http://localhost:3000` và được Vite proxy tự động.

Frontend nằm trong `web/src`. Các file HTML cũ trong `forms/` tiếp tục cung cấp nhãn, loại trường, giá trị mặc định và trường bắt buộc cho form React. API cấu hình vẫn dùng `config/templates.json` khi chạy Node.js.

Các lệnh build:

```bash
npm run build       # build API Node.js và React frontend
npm run build:api   # chỉ build API Node.js
npm run build:web   # chỉ type-check và build React frontend/assets
```

Để chạy bản Node.js sau khi build, dùng `npm start`. Frontend được phục vụ tại `http://localhost:3000`.

## Triển khai Cloudflare Workers

Ứng dụng Cloudflare chạy bằng Worker (không phải static Pages): Worker phục vụ SPA React, API cấu hình và tạo DOCX; các file trong `forms/`, `templates/` và `config/` được đóng gói cùng frontend thành assets.

1. Tạo KV namespace: `npx wrangler kv namespace create TEMPLATE_CONFIG`.
2. Thay giá trị `id` trong `wrangler.jsonc` bằng namespace ID được trả về.
3. Cài dependencies và build assets: `npm ci` rồi `npm run build`.
4. Deploy Worker: `npx wrangler deploy`.

Trong Cloudflare Workers Builds, dùng `npm run build` làm build command và `npx wrangler deploy` làm deploy command. Sau khi deploy, cấu hình được lưu qua KV ở trang `/config`. Thay đổi file form hoặc DOCX trong repo cần build và deploy lại. PDF chưa được hỗ trợ trên Workers; giao diện ẩn lựa chọn PDF và API trả lỗi rõ ràng nếu được yêu cầu.

## Thêm một biểu mẫu mới

Mỗi biểu mẫu đầu vào là một file HTML riêng trong `forms/`, mỗi tài liệu Word là một file `.docx` riêng trong `templates/`. Các kết nối được lưu trong `config/templates.json`.

1. Thêm form HTML vào `forms/` (ví dụ `discharge.html`). Mỗi input cần thuộc tính `name`, ví dụ `name="patientName"`. Form phải gửi `POST` tới `/generate` và có input ẩn `name="template"` với giá trị `__FORM_TEMPLATE_ID__`.
2. Thêm mẫu Word DOCX vào `templates/`. Tên placeholder phải khớp với thuộc tính `name` trong form: `name="patientName"` tương ứng `{patientName}`.
3. Mở `/config`, thêm liên kết, nhập mã và tên biểu mẫu, chọn file HTML cùng DOCX. Nếu vừa thêm file khi trang đang mở, bấm **Làm mới danh sách file** để cập nhật lựa chọn.
4. Lưu cấu hình. Mẫu mới sẽ xuất hiện trên trang chủ và có thể tạo DOCX ngay.

Mã form chỉ được có chữ thường, số và dấu gạch ngang. Không cần sửa TypeScript khi thêm biểu mẫu từ giao diện cấu hình. Các file form và DOCX mới cần được đặt vào thư mục tương ứng trước khi chọn trong trang cấu hình.

## Biểu mẫu hiện có

- `forms/appointment.html` ↔ `templates/appointment-template.docx`
- `forms/referral.html` ↔ `templates/referral-template.docx`
- `forms/result-report.html` ↔ `templates/result-report-template.docx`
- `forms/medical-record.html` ↔ `templates/medical-record-template.docx`
- `forms/lab-test.html` ↔ `templates/lab-test-template.docx`
- `forms/manual-refresh-check.html` ↔ `templates/manual-refresh-check.docx`

Khi chạy bằng Node.js, file DOCX và PDF mặc định được lưu bên ngoài thư mục mã nguồn tại `Documents/DocxGenerator/output` trong thư mục người dùng đang chạy server; có thể đặt biến môi trường `DOCX_OUTPUT_DIR` thành đường dẫn tuyệt đối tới thư mục lưu khác (ví dụ `E:\GeneratedDocuments`). Chuyển PDF trên Node.js cần cài LibreOffice. Trên Cloudflare Workers, chỉ hỗ trợ tải DOCX; PDF chưa được hỗ trợ.

## Cú pháp biến DOCX

Docxtemplater dùng ngoặc nhọn đơn:

```text
{patientName}
{doctor}
{appointmentDate}
```

Không dùng ngoặc nhọn kép như `{{patientName}}`. Tên biến trong DOCX phải trùng với `name` của input HTML.
