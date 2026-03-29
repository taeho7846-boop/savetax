"""
국민연금 신고서 엑셀 → PDF 생성 (ZIP 직접 수정 - 기존 이미지 100% 보존)
"""

import sys
import os
import tempfile
import shutil
import subprocess
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path


def format_biz_f11(biz):
    biz = biz.replace("-", "").replace(" ", "")
    if len(biz) >= 10:
        return f"{biz[:3]}-{biz[3:5]}-{biz[5:10]}-0"
    return biz + "-0"

def format_biz_f13(biz):
    biz = biz.replace("-", "").replace(" ", "")
    if len(biz) >= 10:
        return f"{biz[:3]}-{biz[3:5]}-{biz[5:10]}"
    return biz

def format_corp_num(num):
    num = num.replace("-", "").replace(" ", "")
    if len(num) >= 13:
        return f"{num[:6]}-{num[6:13]}"
    return num


def create_stamp_png(name, size_px=300):
    from PIL import Image, ImageDraw, ImageFont
    import io

    img = Image.new("RGBA", (size_px, size_px), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)
    margin = size_px // 15
    line_w = round(15 * size_px / 300)
    draw.ellipse([margin, margin, size_px - margin, size_px - margin], outline=(180, 0, 0), width=line_w)

    n = len(name)
    inner_h = size_px - margin * 5
    font_size = max(14, int(inner_h / (n + 0.3)))

    font_paths = [
        "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
        "/usr/share/fonts/nanum/NanumGothicBold.ttf",
        "C:/Windows/Fonts/malgunbd.ttf",
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


def overlay_stamp_on_pdf(input_pdf, output_pdf, stamp_png_data, x=480, y=95, size=50):
    """PDF 위에 도장 이미지를 오버레이"""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas as rl_canvas
    from PyPDF2 import PdfReader, PdfWriter
    import io

    # 도장 PNG를 임시 파일로
    stamp_tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    stamp_tmp.write(stamp_png_data)
    stamp_tmp.close()

    try:
        # reportlab으로 도장만 있는 투명 PDF 생성
        packet = io.BytesIO()
        c = rl_canvas.Canvas(packet, pagesize=A4)
        from reportlab.lib.utils import ImageReader
        stamp_img = ImageReader(stamp_tmp.name)
        c.drawImage(stamp_img, x, y, width=size, height=size, mask="auto")
        c.save()
        packet.seek(0)

        # 원본 PDF에 도장 PDF 오버레이
        reader = PdfReader(input_pdf)
        stamp_reader = PdfReader(packet)
        writer = PdfWriter()

        page = reader.pages[0]
        page.merge_page(stamp_reader.pages[0])
        writer.add_page(page)

        # 나머지 페이지
        for i in range(1, len(reader.pages)):
            writer.add_page(reader.pages[i])

        with open(output_pdf, "wb") as f:
            writer.write(f)
        print(f"도장 오버레이 완료 (x={x}, y={y}, size={size})")
    finally:
        os.unlink(stamp_tmp.name)


NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"


def col_to_num(col_str):
    result = 0
    for char in col_str:
        result = result * 26 + (ord(char.upper()) - ord('A') + 1)
    return result - 1


def parse_cell_ref(ref):
    col_str = ""
    row_str = ""
    for c in ref:
        if c.isalpha():
            col_str += c
        else:
            row_str += c
    return col_str, int(row_str)


def set_cell_inline(sheet_data, cell_ref, value):
    """셀에 inline string 값 설정 (기존 값 덮어쓰기)"""
    _, row_num = parse_cell_ref(cell_ref)

    # row 찾기 또는 생성
    target_row = None
    for row in sheet_data:
        if row.tag == f"{{{NS}}}row" and row.get("r") == str(row_num):
            target_row = row
            break

    if target_row is None:
        target_row = ET.SubElement(sheet_data, f"{{{NS}}}row")
        target_row.set("r", str(row_num))

    # cell 찾기 또는 생성
    target_cell = None
    for cell in target_row:
        if cell.tag == f"{{{NS}}}c" and cell.get("r") == cell_ref:
            target_cell = cell
            break

    if target_cell is None:
        target_cell = ET.SubElement(target_row, f"{{{NS}}}c")
        target_cell.set("r", cell_ref)

    # 기존 내용 제거
    for child in list(target_cell):
        target_cell.remove(child)

    # inline string 설정
    target_cell.set("t", "inlineStr")
    if "s" in target_cell.attrib:
        pass  # 스타일 유지
    is_elem = ET.SubElement(target_cell, f"{{{NS}}}is")
    t_elem = ET.SubElement(is_elem, f"{{{NS}}}t")
    t_elem.text = value


def modify_xlsx_cells_and_stamp(input_xlsx, output_xlsx, cell_data, stamp_png_data=None):
    """xlsx ZIP 내부의 sheet XML 수정 + 도장 이미지 추가 (기존 이미지 완전 보존)"""
    import re

    ET.register_namespace("", NS)

    # 1단계: ZIP 내용을 전부 메모리에 읽기
    files = {}
    with zipfile.ZipFile(input_xlsx, "r") as zf:
        for item in zf.infolist():
            files[item.filename] = zf.read(item.filename)
            # 네임스페이스 등록
            if item.filename.endswith(".xml") or item.filename.endswith(".rels"):
                try:
                    content = files[item.filename].decode("utf-8")
                    for prefix, uri in re.findall(r'xmlns:?(\w*)=["\']([^"\']+)["\']', content):
                        if prefix:
                            ET.register_namespace(prefix, uri)
                except Exception:
                    pass

    # 2단계: sheet1.xml 셀 수정
    sheet_key = "xl/worksheets/sheet1.xml"
    if sheet_key in files:
        try:
            root = ET.fromstring(files[sheet_key])
            sd = root.find(f"{{{NS}}}sheetData")
            if sd is not None:
                for ref, val in cell_data.items():
                    if val:
                        set_cell_inline(sd, ref, val)
            files[sheet_key] = b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + ET.tostring(root, encoding="unicode").encode("utf-8")
            print("셀 입력 완료")
        except Exception as e:
            print(f"WARNING: sheet XML 수정 실패: {e}", file=sys.stderr)

    # 3단계: 도장 추가
    if stamp_png_data:
        # 기존 이미지 번호 파악
        existing = [f for f in files if f.startswith("xl/media/")]
        img_num = len(existing) + 1
        img_name = f"xl/media/stamp{img_num}.png"
        rid = f"rId{img_num + 100}"

        # drawing 파일 찾기
        drawing_key = None
        for f in files:
            if f.startswith("xl/drawings/drawing") and f.endswith(".xml") and "/_rels/" not in f:
                drawing_key = f
                break

        if drawing_key:
            # drawing XML에 도장 추가
            try:
                xdr = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
                a_ns = "http://schemas.openxmlformats.org/drawingml/2006/main"
                r_ns = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

                root = ET.fromstring(files[drawing_key])
                anchor_xml = f'''<xdr:oneCellAnchor xmlns:xdr="{xdr}" xmlns:a="{a_ns}" xmlns:r="{r_ns}">
                    <xdr:from><xdr:col>16</xdr:col><xdr:colOff>180000</xdr:colOff><xdr:row>30</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
                    <xdr:ext cx="720000" cy="720000"/>
                    <xdr:pic>
                        <xdr:nvPicPr>
                            <xdr:cNvPr id="{img_num + 100}" name="stamp"/>
                            <xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr>
                        </xdr:nvPicPr>
                        <xdr:blipFill>
                            <a:blip r:embed="{rid}"/>
                            <a:stretch><a:fillRect/></a:stretch>
                        </xdr:blipFill>
                        <xdr:spPr>
                            <a:xfrm><a:off x="0" y="0"/><a:ext cx="720000" cy="720000"/></a:xfrm>
                            <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                        </xdr:spPr>
                    </xdr:pic>
                    <xdr:clientData/>
                </xdr:oneCellAnchor>'''
                root.append(ET.fromstring(anchor_xml))
                files[drawing_key] = b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + ET.tostring(root, encoding="unicode").encode("utf-8")
                print("도장 drawing 추가 완료")
            except Exception as e:
                print(f"WARNING: drawing 수정 실패: {e}", file=sys.stderr)

            # drawing rels에 관계 추가
            rels_key = f"xl/drawings/_rels/{Path(drawing_key).name}.rels"
            if rels_key in files:
                try:
                    rel_ns = "http://schemas.openxmlformats.org/package/2006/relationships"
                    ET.register_namespace("", rel_ns)
                    root = ET.fromstring(files[rels_key])
                    new_rel = ET.SubElement(root, f"{{{rel_ns}}}Relationship")
                    new_rel.set("Id", rid)
                    new_rel.set("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image")
                    new_rel.set("Target", f"../media/stamp{img_num}.png")
                    files[rels_key] = b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + ET.tostring(root, encoding="unicode").encode("utf-8")
                    print("도장 relationship 추가 완료")
                except Exception as e:
                    print(f"WARNING: rels 수정 실패: {e}", file=sys.stderr)

            # 이미지 파일 추가
            files[img_name] = stamp_png_data
            print(f"도장 이미지 추가: {img_name}")

    # 4단계: 전부 쓰기
    with zipfile.ZipFile(output_xlsx, "w", zipfile.ZIP_DEFLATED) as zout:
        for fname, data in files.items():
            zout.writestr(fname, data)


def main():
    import io as _io
    sys.stdout = _io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = _io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

    if len(sys.argv) < 11:
        print("ERROR: 인수 부족", file=sys.stderr)
        sys.exit(1)

    template_path    = sys.argv[1]
    output_pdf       = sys.argv[2]
    biz_number       = sys.argv[3]
    client_name      = sys.argv[4]
    address          = sys.argv[5]
    corporate_number = sys.argv[6]
    ceo_name         = sys.argv[7]
    birthday         = sys.argv[8]
    stamp_name       = sys.argv[9]
    client_type      = sys.argv[10]

    if not os.path.isfile(template_path):
        print(f"ERROR: 템플릿 파일 없음: {template_path}", file=sys.stderr)
        sys.exit(1)

    is_corp = client_type == "corporate"

    # 셀 데이터 준비
    cell_data = {
        "F11": format_biz_f11(biz_number),
        "N11": client_name,
        "F12": address,
        "F13": format_biz_f13(biz_number),
        "N13": format_corp_num(corporate_number) if is_corp and corporate_number else "",
        "F15": ceo_name,
        "M15": birthday,
    }

    # 1. xlsx 처리
    tmp_dir = tempfile.mkdtemp()
    ext = Path(template_path).suffix.lower()

    # xls → xlsx 변환 필요 시
    if ext == ".xls":
        result = subprocess.run(
            ["libreoffice", "--headless", "--convert-to", "xlsx", "--outdir", tmp_dir, template_path],
            capture_output=True, text=True, timeout=60
        )
        if result.returncode != 0:
            print(f"ERROR: xls→xlsx 변환 실패", file=sys.stderr)
            sys.exit(1)
        xlsx_input = os.path.join(tmp_dir, Path(template_path).stem + ".xlsx")
        print("xls → xlsx 변환 완료")
    else:
        xlsx_input = template_path

    # 1.5. 도장 생성
    stamp_data = None
    try:
        stamp_data = create_stamp_png(stamp_name, size_px=300)
        print(f"도장 생성: {stamp_name}")
    except Exception as e:
        print(f"WARNING: 도장 생성 실패: {e}", file=sys.stderr)

    # 2. ZIP 직접 수정 (이미지 보존 + 도장 추가)
    xlsx_output = os.path.join(tmp_dir, "output.xlsx")
    try:
        modify_xlsx_cells_and_stamp(xlsx_input, xlsx_output, cell_data, None)
        print("셀 입력 + 도장 완료 (ZIP 직접 수정)")
    except Exception as e:
        print(f"ERROR: 셀 수정 실패: {e}", file=sys.stderr)
        shutil.rmtree(tmp_dir)
        sys.exit(1)

    # 3. PDF 변환
    try:
        pdf_dir = os.path.join(tmp_dir, "pdf")
        os.makedirs(pdf_dir, exist_ok=True)
        result = subprocess.run(
            ["libreoffice", "--headless", "--convert-to", "pdf", "--outdir", pdf_dir, xlsx_output],
            capture_output=True, text=True, timeout=60
        )
        if result.returncode != 0:
            raise RuntimeError(f"LibreOffice 변환 실패: {result.stderr}")
        generated_pdf = os.path.join(pdf_dir, Path(xlsx_output).stem + ".pdf")
        print("PDF 변환 완료")
    except Exception as e:
        print(f"ERROR: PDF 변환 실패: {e}", file=sys.stderr)
        shutil.rmtree(tmp_dir, ignore_errors=True)
        sys.exit(1)

    # 4. PDF 위에 도장 오버레이
    try:
        output_dir = os.path.dirname(os.path.abspath(output_pdf))
        os.makedirs(output_dir, exist_ok=True)
        overlay_stamp_on_pdf(generated_pdf, os.path.abspath(output_pdf), stamp_data)
        print(f"SUCCESS: {output_pdf}")
    except Exception as e:
        print(f"ERROR: 도장 오버레이 실패: {e}", file=sys.stderr)
        # 도장 없이라도 PDF 저장
        shutil.copy2(generated_pdf, os.path.abspath(output_pdf))
        print(f"SUCCESS (도장 없음): {output_pdf}")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
