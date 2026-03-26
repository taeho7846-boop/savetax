"""
홈택스수임신청서 엑셀 템플릿 → PDF 생성
Usage: python generate_commission_form.py <template_path> <output_pdf_path>
       <ceo_name> <resident_number> <client_name> <biz_number> <phone>
"""

import sys
import os
import tempfile
import shutil
from pathlib import Path


def create_stamp_png(name: str, size_px: int = 300) -> bytes:
    """대표자 이름 원형 도장 PNG 생성"""
    from PIL import Image, ImageDraw, ImageFont
    import io

    img = Image.new("RGBA", (size_px, size_px), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)

    # 외부 원 (테두리 15px 기준)
    margin = size_px // 15
    line_w = round(15 * size_px / 300)
    draw.ellipse(
        [margin, margin, size_px - margin, size_px - margin],
        outline=(180, 0, 0),
        width=line_w,
    )

    # 이름 세로 배치 (Bold 폰트 우선)
    n = len(name)
    inner_h = size_px - margin * 5
    font_size = max(14, int(inner_h / (n + 0.3)))

    font_paths = [
        "C:/Windows/Fonts/malgunbd.ttf",  # Malgun Gothic Bold
        "C:/Windows/Fonts/malgun.ttf",
        "C:/Windows/Fonts/gulim.ttc",
        "C:/Windows/Fonts/batang.ttc",
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

    if len(sys.argv) < 8:
        print("ERROR: 인수 부족", file=sys.stderr)
        sys.exit(1)

    template_path   = sys.argv[1]
    output_pdf      = sys.argv[2]
    ceo_name        = sys.argv[3]
    resident_number = sys.argv[4]
    client_name     = sys.argv[5]
    biz_number      = sys.argv[6]
    phone           = sys.argv[7]

    if not os.path.isfile(template_path):
        print(f"ERROR: 템플릿 파일 없음: {template_path}", file=sys.stderr)
        sys.exit(1)

    # ── 1. 도장 이미지 생성 ───────────────────────────────────
    try:
        from PIL import Image  # noqa
        stamp_data = create_stamp_png(ceo_name, size_px=300)
        print(f"도장 생성: {ceo_name}")
    except ImportError:
        print("ERROR: Pillow를 설치해주세요 (pip install Pillow)", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: 도장 생성 실패: {e}", file=sys.stderr)
        sys.exit(1)

    stamp_tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    stamp_tmp.write(stamp_data)
    stamp_tmp.close()

    # 템플릿을 임시 파일로 복사 (원본 보호)
    ext = Path(template_path).suffix or ".xlsx"
    tmp_fd, tmp_xlsx = tempfile.mkstemp(suffix=ext)
    os.close(tmp_fd)
    shutil.copy2(template_path, tmp_xlsx)

    try:
        import win32com.client
    except ImportError:
        print("ERROR: pywin32를 설치해주세요 (pip install pywin32)", file=sys.stderr)
        os.unlink(stamp_tmp.name)
        os.unlink(tmp_xlsx)
        sys.exit(1)

    excel = None
    try:
        print("Excel 열기...")
        excel = win32com.client.Dispatch("Excel.Application")
        excel.Visible = False
        excel.DisplayAlerts = False

        wb = excel.Workbooks.Open(os.path.abspath(tmp_xlsx))
        ws = wb.Sheets(1)

        # ── 2. 셀 채우기 ──────────────────────────────────────
        ws.Cells(6, 2).Value  = ceo_name         # B6
        ws.Cells(6, 3).Value  = resident_number  # C6
        ws.Cells(8, 2).Value  = client_name      # B8
        ws.Cells(8, 3).Value  = biz_number       # C8
        ws.Cells(11, 4).Value = phone            # D11
        print("셀 입력 완료")

        # ── 3. 도장 삽입 (셀 오른쪽 끝 정렬) ─────────────────
        # 2cm = 56.69pt (1pt = 1/72 inch, 1inch = 2.54cm)
        STAMP_PT  = 2 / 2.54 * 72   # ≈ 56.69pt
        stamp_abs = os.path.abspath(stamp_tmp.name)

        # (cell_ref, left_offset_pt, top_offset_pt)
        # 양수 = 오른쪽/아래, 음수 = 왼쪽/위
        stamp_positions = [
            ("D30", 0,   -15),   # 위로 올림
            ("D35", 0,   -15),   # 위로 올림
            ("B44", -45, -15),   # 왼쪽으로 이동
        ]

        for cell_ref, off_left, off_top in stamp_positions:
            cell = ws.Range(cell_ref)
            left = cell.Left + cell.Width - STAMP_PT + off_left
            top  = cell.Top + off_top
            ws.Shapes.AddPicture(
                Filename=stamp_abs,
                LinkToFile=False,
                SaveWithDocument=True,
                Left=float(left),
                Top=float(top),
                Width=STAMP_PT,
                Height=STAMP_PT,
            )
            print(f"도장 삽입: {cell_ref} (left={left:.1f}pt, top={top:.1f}pt)")

        # ── 4. PDF 변환 ───────────────────────────────────────
        os.makedirs(os.path.dirname(os.path.abspath(output_pdf)), exist_ok=True)
        print("PDF 변환 중...")
        wb.ExportAsFixedFormat(0, os.path.abspath(output_pdf))
        wb.Close(False)
        print(f"SUCCESS: {output_pdf}")

    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        try:
            if excel:
                excel.Quit()
        except Exception:
            pass
        os.unlink(stamp_tmp.name)
        os.unlink(tmp_xlsx)
        sys.exit(1)

    finally:
        try:
            excel.Quit()
        except Exception:
            pass
        try:
            os.unlink(stamp_tmp.name)
        except Exception:
            pass
        try:
            os.unlink(tmp_xlsx)
        except Exception:
            pass


if __name__ == "__main__":
    main()
