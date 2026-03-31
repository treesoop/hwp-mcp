"""HWP/HWPX MCP Server - Read and write Korean word processor documents."""

import json
import os
import base64
from mcp.server.fastmcp import FastMCP

from hangul_mcp.hwp_parser import HWPParser
from hangul_mcp.hwpx_parser import HWPXParser
from hangul_mcp.hwp_writer import hwp_replace_text, hwpx_replace_text, create_hwpx

mcp = FastMCP(
    "hwp-reader",
    version="0.1.0",
    description="HWP/HWPX 한글 문서 파일 읽기 MCP 서버 - 텍스트, 표, 이미지 추출",
)


def _get_parser(file_path: str):
    """Return appropriate parser based on file extension."""
    ext = os.path.splitext(file_path)[1].lower()
    if ext == '.hwp':
        return HWPParser(file_path)
    elif ext == '.hwpx':
        return HWPXParser(file_path)
    else:
        raise ValueError(f"지원하지 않는 파일 형식: {ext} (hwp 또는 hwpx만 지원)")


@mcp.tool()
def read_hwp(file_path: str) -> str:
    """HWP/HWPX 파일을 읽어서 텍스트, 표, 이미지 정보를 반환합니다.

    Args:
        file_path: HWP 또는 HWPX 파일의 절대 경로

    Returns:
        문서 내용 (텍스트 + 표를 마크다운으로 변환)
    """
    if not os.path.exists(file_path):
        return f"파일을 찾을 수 없습니다: {file_path}"

    try:
        parser = _get_parser(file_path)
        result = parser.extract_structured()
        parser.close()

        output_parts = []

        # Header
        ext = os.path.splitext(file_path)[1].upper()
        output_parts.append(f"# {os.path.basename(file_path)}")
        output_parts.append(f"형식: {ext} | 문단: {result['stats']['paragraphs']}개 | 표: {result['stats']['tables']}개 | 이미지: {result['stats']['images']}개\n")

        # Content
        for part in result['content']:
            if part['type'] == 'text':
                output_parts.append(part['content'])
            elif part['type'] == 'table':
                output_parts.append("")
                output_parts.append(part['markdown'])
                output_parts.append("")

        # Image list
        if result['images']:
            output_parts.append("\n---\n## 포함된 이미지")
            for i, img in enumerate(result['images'], 1):
                name = img.get('name', img.get('stream', 'unknown'))
                output_parts.append(f"{i}. {name}")

        return '\n'.join(output_parts)

    except Exception as e:
        return f"파일 읽기 오류: {str(e)}"


@mcp.tool()
def read_hwp_text(file_path: str) -> str:
    """HWP/HWPX 파일에서 텍스트만 추출합니다 (표, 이미지 제외).

    Args:
        file_path: HWP 또는 HWPX 파일의 절대 경로

    Returns:
        문서의 텍스트 내용
    """
    if not os.path.exists(file_path):
        return f"파일을 찾을 수 없습니다: {file_path}"

    try:
        parser = _get_parser(file_path)
        text = parser.extract_text()
        parser.close()
        return text if text.strip() else "(텍스트가 비어있습니다)"
    except Exception as e:
        return f"텍스트 추출 오류: {str(e)}"


@mcp.tool()
def read_hwp_tables(file_path: str) -> str:
    """HWP/HWPX 파일에서 표만 추출하여 마크다운 형식으로 반환합니다.

    Args:
        file_path: HWP 또는 HWPX 파일의 절대 경로

    Returns:
        표 내용 (마크다운 테이블 형식)
    """
    if not os.path.exists(file_path):
        return f"파일을 찾을 수 없습니다: {file_path}"

    try:
        parser = _get_parser(file_path)
        tables = parser.extract_tables()
        parser.close()

        if not tables:
            return "(표가 없습니다)"

        output = []
        for i, table in enumerate(tables, 1):
            output.append(f"### 표 {i} ({table.rows}행 x {table.cols}열)")
            output.append(table.to_markdown())
            output.append("")

        return '\n'.join(output)

    except Exception as e:
        return f"표 추출 오류: {str(e)}"


@mcp.tool()
def list_hwp_images(file_path: str) -> str:
    """HWP/HWPX 파일에 포함된 이미지 목록을 반환합니다.

    Args:
        file_path: HWP 또는 HWPX 파일의 절대 경로

    Returns:
        이미지 목록 (이름, 형식)
    """
    if not os.path.exists(file_path):
        return f"파일을 찾을 수 없습니다: {file_path}"

    try:
        parser = _get_parser(file_path)

        ext = os.path.splitext(file_path)[1].lower()
        if ext == '.hwp':
            images = parser.bin_data_refs
            if not images:
                parser.close()
                return "(이미지가 없습니다)"
            lines = []
            for i, img in enumerate(images, 1):
                lines.append(f"{i}. [{img.name}] 형식: {img.ext}, 스트림: {img.stream_name}")
            parser.close()
            return '\n'.join(lines)
        else:
            images = parser.images
            if not images:
                parser.close()
                return "(이미지가 없습니다)"
            lines = []
            for i, img in enumerate(images, 1):
                lines.append(f"{i}. [{img.name}] 형식: {img.media_type}, 경로: {img.path}")
            parser.close()
            return '\n'.join(lines)

    except Exception as e:
        return f"이미지 목록 조회 오류: {str(e)}"


@mcp.tool()
def extract_hwp_images(file_path: str, output_dir: str = "") -> str:
    """HWP/HWPX 파일에서 이미지를 추출하여 파일로 저장합니다.

    Args:
        file_path: HWP 또는 HWPX 파일의 절대 경로
        output_dir: 이미지를 저장할 디렉토리 (비어있으면 파일과 같은 디렉토리에 저장)

    Returns:
        저장된 이미지 파일 경로 목록
    """
    if not os.path.exists(file_path):
        return f"파일을 찾을 수 없습니다: {file_path}"

    if not output_dir:
        base = os.path.splitext(os.path.basename(file_path))[0]
        output_dir = os.path.join(os.path.dirname(file_path), f"{base}_images")

    try:
        parser = _get_parser(file_path)
        saved = parser.extract_all_images(output_dir)
        parser.close()

        if not saved:
            return "(추출할 이미지가 없습니다)"

        lines = [f"이미지 {len(saved)}개를 추출했습니다:", f"저장 위치: {output_dir}", ""]
        for path in saved:
            lines.append(f"  - {os.path.basename(path)}")

        return '\n'.join(lines)

    except Exception as e:
        return f"이미지 추출 오류: {str(e)}"


@mcp.tool()
def fill_hwp_template(file_path: str, replacements: str, output_path: str = "") -> str:
    """HWP/HWPX 파일에서 텍스트를 찾아 바꿉니다. 템플릿 채우기에 유용합니다.

    예: 문서에서 "{{이름}}" → "남대현", "{{회사}}" → "포텐랩" 으로 치환

    Args:
        file_path: HWP 또는 HWPX 파일 경로
        replacements: JSON 형식의 치환 맵. 예: {"{{이름}}": "남대현", "{{회사}}": "포텐랩"}
        output_path: 결과 파일 저장 경로 (비어있으면 _filled 접미사 추가)

    Returns:
        치환 결과 및 저장 경로
    """
    if not os.path.exists(file_path):
        return f"파일을 찾을 수 없습니다: {file_path}"

    try:
        repl_dict = json.loads(replacements)
    except json.JSONDecodeError as e:
        return f"replacements JSON 파싱 오류: {e}"

    if not output_path:
        base, ext = os.path.splitext(file_path)
        output_path = f"{base}_filled{ext}"

    try:
        ext = os.path.splitext(file_path)[1].lower()
        if ext == '.hwp':
            result = hwp_replace_text(file_path, output_path, repl_dict)
        elif ext == '.hwpx':
            result = hwpx_replace_text(file_path, output_path, repl_dict)
        else:
            return f"지원하지 않는 형식: {ext}"

        lines = [f"저장 완료: {result['output']}", f"총 {result['total']}건 치환", ""]
        for old, cnt in result['replacements'].items():
            lines.append(f"  '{old}' → {cnt}건")

        return '\n'.join(lines)

    except Exception as e:
        return f"치환 오류: {str(e)}"


@mcp.tool()
def replace_hwp_text(file_path: str, old_text: str, new_text: str, output_path: str = "") -> str:
    """HWP/HWPX 파일에서 특정 텍스트를 다른 텍스트로 교체합니다.

    Args:
        file_path: HWP 또는 HWPX 파일 경로
        old_text: 찾을 텍스트
        new_text: 바꿀 텍스트
        output_path: 결과 파일 저장 경로 (비어있으면 _modified 접미사 추가)

    Returns:
        교체 결과
    """
    if not os.path.exists(file_path):
        return f"파일을 찾을 수 없습니다: {file_path}"

    if not output_path:
        base, ext = os.path.splitext(file_path)
        output_path = f"{base}_modified{ext}"

    try:
        ext = os.path.splitext(file_path)[1].lower()
        repl_dict = {old_text: new_text}

        if ext == '.hwp':
            result = hwp_replace_text(file_path, output_path, repl_dict)
        elif ext == '.hwpx':
            result = hwpx_replace_text(file_path, output_path, repl_dict)
        else:
            return f"지원하지 않는 형식: {ext}"

        return f"'{old_text}' → '{new_text}': {result['total']}건 교체\n저장: {result['output']}"

    except Exception as e:
        return f"텍스트 교체 오류: {str(e)}"


@mcp.tool()
def create_hwpx_document(output_path: str, content: str) -> str:
    """새 HWPX 문서를 생성합니다.

    Args:
        output_path: 저장할 HWPX 파일 경로
        content: JSON 형식의 문서 내용. 예:
            [
                {"type": "text", "text": "제목입니다"},
                {"type": "text", "text": "본문 내용"},
                {"type": "table", "headers": ["이름", "나이"], "rows": [["김철수", "30"], ["이영희", "25"]]}
            ]

    Returns:
        생성 결과
    """
    try:
        content_list = json.loads(content)
    except json.JSONDecodeError as e:
        return f"content JSON 파싱 오류: {e}"

    try:
        result_path = create_hwpx(output_path, content_list)
        return f"HWPX 문서 생성 완료: {result_path}"
    except Exception as e:
        return f"문서 생성 오류: {str(e)}"


if __name__ == "__main__":
    mcp.run(transport="stdio")
