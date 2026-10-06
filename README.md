# DOCX Generator - TypeScript

## Cài đặt và chạy

```bash
npm install
npm run dev
```

Mở trang biểu mẫu tại `http://localhost:3000`, hoặc giao diện cấu hình tại `http://localhost:3000/config`.

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

File DOCX và PDF mặc định được lưu bên ngoài thư mục mã nguồn tại `Documents/DocxGenerator/output` trong thư mục người dùng đang chạy server; trên từng form có nút tải định dạng mong muốn. Có thể đặt biến môi trường `DOCX_OUTPUT_DIR` thành đường dẫn tuyệt đối tới thư mục lưu khác (ví dụ `E:\GeneratedDocuments`). Chuyển PDF cần cài LibreOffice trên máy chạy server. Nếu LibreOffice không nằm ở đường dẫn mặc định, đặt biến môi trường `LIBREOFFICE_PATH` trỏ tới `soffice.exe`.

## Cú pháp biến DOCX

Docxtemplater dùng ngoặc nhọn đơn:

```text
{patientName}
{doctor}
{appointmentDate}
```

Không dùng ngoặc nhọn kép như `{{patientName}}`. Tên biến trong DOCX phải trùng với `name` của input HTML.
