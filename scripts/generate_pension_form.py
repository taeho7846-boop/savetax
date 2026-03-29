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


def modify_xlsx_cells(input_xlsx, output_xlsx, cell_data):
    """xlsx ZIP 내부의 sheet XML만 수정 (이미지/도형 완전 보존)"""

    # 모든 네임스페이스 등록 (원본 보존)
    namespaces = {}
    with zipfile.ZipFile(input_xlsx, "r") as zf:
        for name in zf.namelist():
            if name.endswith(".xml") or name.endswith(".rels"):
                try:
                    content = zf.read(name).decode("utf-8")
                    for _, (prefix, uri) in enumerate(
                        __import__("re").findall(r'xmlns:?(\w*)=["\']([^"\']+)["\']', content)
                    ):
                        if prefix:
                            ET.register_namespace(prefix, uri)
                        elif uri == NS:
                            ET.register_namespace("", uri)
                except Exception:
                    pass

    ET.register_namespace("", NS)

    with zipfile.ZipFile(input_xlsx, "r") as zin:
        with zipfile.ZipFile(output_xlsx, "w", zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                data = zin.read(item.filename)

                if item.filename == "xl/worksheets/sheet1.xml":
                    try:
                        root = ET.fromstring(data)
                        sheet_data = root.find(f"{{{NS}}}sheetData")
                        if sheet_data is not None:
                            for ref, val in cell_data.items():
                                if val:
                                    set_cell_inline(sheet_data, ref, val)
                        data = b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
                        data += ET.tostring(root, encoding="unicode").encode("utf-8")
                    except Exception as e:
                        print(f"WARNING: sheet XML 수정 실패: {e}", file=sys.stderr)

                zout.writestr(item, data)


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

    # 2. ZIP 직접 수정 (이미지 보존)
    xlsx_output = os.path.join(tmp_dir, "output.xlsx")
    try:
        modify_xlsx_cells(xlsx_input, xlsx_output, cell_data)
        print("셀 입력 완료 (ZIP 직접 수정 - 이미지 보존)")
    except Exception as e:
        print(f"ERROR: 셀 수정 실패: {e}", file=sys.stderr)
        shutil.rmtree(tmp_dir)
        sys.exit(1)

    # 3. PDF 변환
    try:
        output_dir = os.path.dirname(os.path.abspath(output_pdf))
        os.makedirs(output_dir, exist_ok=True)
        result = subprocess.run(
            ["libreoffice", "--headless", "--convert-to", "pdf", "--outdir", output_dir, xlsx_output],
            capture_output=True, text=True, timeout=60
        )
        if result.returncode != 0:
            raise RuntimeError(f"LibreOffice 변환 실패: {result.stderr}")
        generated = os.path.join(output_dir, Path(xlsx_output).stem + ".pdf")
        if generated != os.path.abspath(output_pdf):
            shutil.move(generated, os.path.abspath(output_pdf))
        print(f"SUCCESS: {output_pdf}")
    except Exception as e:
        print(f"ERROR: PDF 변환 실패: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
