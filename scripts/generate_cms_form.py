"""
CMS 신청서 엑셀 → PDF 생성
Usage: python generate_cms_form.py <template_path> <output_pdf_path>
       <first_month> <depositor> <resident6> <bank_name> <biz_number>
       <bank_account> <phone> <stamp_name> <client_type>
"""

import sys
import os
import tempfile
import shutil
import subprocess
from pathlib import Path


def create_stamp_png(name, size_px=300):
    from PIL import Image, ImageDraw, ImageFont
    import io

    img = Image.new("RGBA", (size_px, size_px), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)

    margin = size_px // 15
    line_w = round(15 * size_px / 300)
    draw.ellipse(
        [margin, margin, size_px - margin, size_px - margin],
        outline=(180, 0, 0),
        width=line_w,
    )

    n = len(name)
    inner_h = size_px - margin * 5
    font_size = max(14, int(inner_h / (n + 0.3)))

    font_paths = [
        "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
        "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
        "/usr/share/fonts/nanum/NanumGothicBold.ttf",
        "C:/Windows/Fonts/malgunbd.ttf",
        "C:/Windows/Fonts/malgun.ttf",
    ]
    font = None
    for fp in font_paths:
        try:
            font = ImageFont.truetype(fp, font_size)
            break
        except Exception:
            pass
    if font is None:
        font = ImageFont.load_default()

    char_sizes = []
    for char in name:
        bbox = draw.textbbox((0, 0), char, font=font)
        char_sizes.append((bbox[2] - bbox[0], bbox[3] - bbox[1]))

    total_h = sum(h for _, h in char_sizes)
    y = (size_px - total_h) // 2
    for char, (cw, ch) in zip(name, char_sizes):
        x = (size_px - cw) // 2
        draw.text((x, y), char, fill=(180, 0, 0), font=font)
        y += ch

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def main():
    import io as _io
    sys.stdout = _io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = _io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

    if len(sys.argv) < 12:
        print("ERROR: 인수 부족", file=sys.stderr)
        sys.exit(1)

    template_path = sys.argv[1]
    output_pdf    = sys.argv[2]
    first_month   = sys.argv[3]   # 202604
    depositor     = sys.argv[4]   # 예금주명
    resident6     = sys.argv[5]   # 주민번호앞6 (개인) or ""
    bank_name     = sys.argv[6]   # 은행명
    biz_number    = sys.argv[7]   # 사업자번호 (법인) or ""
    bank_account  = sys.argv[8]   # 계좌번호
    phone         = sys.argv[9]   # 연락처
    stamp_name    = sys.argv[10]  # 도장 이름
    client_type   = sys.argv[11]  # individual or corporate

    if not os.path.isfile(template_path):
        print(f"ERROR: 템플릿 파일 없음: {template_path}", file=sys.stderr)
        sys.exit(1)

    # 1. 도장 생성
    try:
        stamp_data = create_stamp_png(stamp_name, size_px=300)
        print(f"도장 생성: {stamp_name}")
    except Exception as e:
        print(f"ERROR: 도장 생성 실패: {e}", file=sys.stderr)
        sys.exit(1)

    # 2. 템플릿 복사 + openpyxl로 셀 채우기
    from openpyxl import load_workbook
    from openpyxl.drawing.image import Image as XlImage
    from openpyxl.drawing.spreadsheet_drawing import OneCellAnchor, AnchorMarker
    from openpyxl.drawing.xdr import XDRPositiveSize2D
    from openpyxl.utils.units import cm_to_EMU
    import io

    ext = Path(template_path).suffix or ".xlsx"
    tmp_fd, tmp_xlsx = tempfile.mkstemp(suffix=".xlsx")
    os.close(tmp_fd)
    shutil.copy2(template_path, tmp_xlsx)

    try:
        wb = load_workbook(tmp_xlsx)
        ws = wb.active

        ws["B9"] = first_month
        ws["B14"] = depositor
        ws["D14"] = resident6 if client_type == "individual" else ""
        ws["B15"] = bank_name
        ws["D15"] = biz_number if client_type == "corporate" else ""
        ws["B16"] = bank_account
        ws["D17"] = phone
        print("셀 입력 완료")

        # 도장 삽입 D28
        STAMP_CM = 2.0
        stamp_emu = cm_to_EMU(STAMP_CM)
        stamp_img = XlImage(io.BytesIO(stamp_data))
        stamp_img.width = STAMP_CM / 2.54 * 96
        stamp_img.height = STAMP_CM / 2.54 * 96
        marker = AnchorMarker(col=3, colOff=cm_to_EMU(0.5), row=27, rowOff=cm_to_EMU(0.0))
        anchor = OneCellAnchor(_from=marker, ext=XDRPositiveSize2D(stamp_emu, stamp_emu))
        stamp_img.anchor = anchor
        ws.add_image(stamp_img)
        print("도장 삽입: D28")

        wb.save(tmp_xlsx)
    except Exception as e:
        print(f"ERROR: 엑셀 작성 실패: {e}", file=sys.stderr)
        os.unlink(tmp_xlsx)
        sys.exit(1)

    # 3. PDF 변환 (LibreOffice)
    try:
        output_dir = os.path.dirname(os.path.abspath(output_pdf))
        os.makedirs(output_dir, exist_ok=True)

        result = subprocess.run(
            ["libreoffice", "--headless", "--convert-to", "pdf", "--outdir", output_dir, tmp_xlsx],
            capture_output=True, text=True, timeout=60
        )
        if result.returncode != 0:
            raise RuntimeError(f"LibreOffice 변환 실패: {result.stderr}")

        generated = os.path.join(output_dir, Path(tmp_xlsx).stem + ".pdf")
        if generated != os.path.abspath(output_pdf):
            shutil.move(generated, os.path.abspath(output_pdf))

        print(f"SUCCESS: {output_pdf}")
    except Exception as e:
        print(f"ERROR: PDF 변환 실패: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        try:
            os.unlink(tmp_xlsx)
        except Exception:
            pass


if __name__ == "__main__":
    main()
