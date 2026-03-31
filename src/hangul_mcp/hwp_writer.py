"""HWP/HWPX write utilities - template fill, text replace, HWPX creation."""

import copy
import os
import struct
import zlib
import zipfile
import shutil
import xml.etree.ElementTree as ET
from typing import Optional

import olefile

from hangul_mcp.hwp_parser import (
    HWPTAG_PARA_HEADER, HWPTAG_PARA_TEXT, HWPTAG_PARA_CHAR_SHAPE,
    parse_records, decode_para_text,
)


# ============================================================
# HWP Binary - Text Replacement
# ============================================================

def _rebuild_section_data(records_data: list[tuple[int, int, bytes]]) -> bytes:
    """Rebuild a section stream from list of (tag_id, level, payload) tuples."""
    out = bytearray()
    for tag_id, level, payload in records_data:
        size = len(payload)
        if size >= 0xFFF:
            header = (tag_id & 0x3FF) | ((level & 0x3FF) << 10) | (0xFFF << 20)
            out += struct.pack('<I', header)
            out += struct.pack('<I', size)
        else:
            header = (tag_id & 0x3FF) | ((level & 0x3FF) << 10) | ((size & 0xFFF) << 20)
            out += struct.pack('<I', header)
        out += payload
    return bytes(out)


def _replace_in_para_text(data: bytes, old_text: str, new_text: str) -> tuple[bytes, int]:
    """Replace text within PARA_TEXT record data. Returns (new_data, replacement_count).

    Handles control characters by preserving them and only replacing in text regions.
    """
    INLINE_CONTROLS = {0x0000, 0x0009, 0x000A, 0x000D}
    count = 0

    # First, extract text segments with their positions
    segments = []  # (start_pos, end_pos, text, is_control)
    i = 0
    length = len(data)

    while i < length:
        if i + 2 > length:
            break
        code = struct.unpack_from('<H', data, i)[0]

        if code <= 0x001F:
            if code in INLINE_CONTROLS:
                segments.append((i, i + 2, None, True))
                i += 2
            else:
                segments.append((i, i + 16, None, True))
                i += 16
        else:
            # Find contiguous text run
            text_start = i
            text_chars = []
            while i < length:
                if i + 2 > length:
                    break
                c = struct.unpack_from('<H', data, i)[0]
                if c <= 0x001F:
                    break
                text_chars.append(chr(c))
                i += 2
            text_str = ''.join(text_chars)
            segments.append((text_start, i, text_str, False))

    # Now replace in text segments
    new_segments = []
    for start, end, text, is_control in segments:
        if is_control:
            new_segments.append(data[start:end])
        else:
            if old_text in text:
                occurrences = text.count(old_text)
                count += occurrences
                text = text.replace(old_text, new_text)
            new_segments.append(text.encode('utf-16-le'))

    return b''.join(new_segments), count


def hwp_replace_text(input_path: str, output_path: str, replacements: dict[str, str]) -> dict:
    """Replace text in an HWP file by rebuilding the OLE container.

    Args:
        input_path: Source HWP file
        output_path: Destination HWP file
        replacements: Dict of {old_text: new_text}
    """
    from hangul_mcp.ole_writer import create_ole_file

    ole = olefile.OleFileIO(input_path)

    # Check compression
    header_data = ole.openstream('FileHeader').read()
    is_compressed = bool(struct.unpack_from('<I', header_data, 36)[0] & 0x01)

    total_replacements = {k: 0 for k in replacements}

    # Read ALL streams from original file
    all_streams = {}
    for entry in ole.listdir():
        stream_name = '/'.join(entry)
        try:
            all_streams[stream_name] = ole.openstream(stream_name).read()
        except Exception:
            pass

    # Process BodyText sections
    for stream_name in sorted(all_streams.keys()):
        if 'BodyText' not in stream_name or 'Section' not in stream_name:
            continue

        raw_data = all_streams[stream_name]

        if is_compressed:
            try:
                data = zlib.decompress(raw_data, -15)
            except zlib.error:
                data = raw_data
                is_section_compressed = False
            else:
                is_section_compressed = True
        else:
            data = raw_data
            is_section_compressed = False

        records = parse_records(data)
        modified = False

        # Build record list for rebuild
        rec_list = []
        for rec in records:
            if rec.tag_id == HWPTAG_PARA_TEXT:
                new_payload = rec.data
                for old_text, new_text in replacements.items():
                    new_payload, cnt = _replace_in_para_text(new_payload, old_text, new_text)
                    total_replacements[old_text] += cnt
                    if cnt > 0:
                        modified = True
                rec_list.append((rec.tag_id, rec.level, new_payload))

            elif rec.tag_id == HWPTAG_PARA_HEADER:
                rec_list.append((rec.tag_id, rec.level, rec.data))
            else:
                rec_list.append((rec.tag_id, rec.level, rec.data))

        if modified:
            # Update PARA_HEADER text lengths
            for idx, (tag_id, level, payload) in enumerate(rec_list):
                if tag_id == HWPTAG_PARA_HEADER and len(payload) >= 6:
                    for j in range(idx + 1, min(idx + 5, len(rec_list))):
                        if rec_list[j][0] == HWPTAG_PARA_TEXT:
                            new_text_len = len(rec_list[j][2]) // 2
                            payload_mut = bytearray(payload)
                            struct.pack_into('<I', payload_mut, 2, new_text_len)
                            rec_list[idx] = (tag_id, level, bytes(payload_mut))
                            break

            new_data = _rebuild_section_data(rec_list)

            if is_section_compressed:
                compressor = zlib.compressobj(zlib.Z_DEFAULT_COMPRESSION, zlib.DEFLATED, -15)
                all_streams[stream_name] = compressor.compress(new_data) + compressor.flush()
            else:
                all_streams[stream_name] = new_data

    ole.close()

    # Write new OLE file with all streams
    create_ole_file(all_streams, output_path)

    return {
        "output": output_path,
        "replacements": total_replacements,
        "total": sum(total_replacements.values()),
    }


# ============================================================
# HWPX - Text Replacement
# ============================================================

def hwpx_replace_text(input_path: str, output_path: str, replacements: dict[str, str]) -> dict:
    """Replace text in an HWPX file."""
    total_replacements = {k: 0 for k in replacements}

    with zipfile.ZipFile(input_path, 'r') as zin:
        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                data = zin.read(item.filename)

                # Only modify section XML files
                if 'section' in item.filename.lower() and item.filename.endswith('.xml'):
                    content = data.decode('utf-8')
                    for old_text, new_text in replacements.items():
                        cnt = content.count(old_text)
                        if cnt > 0:
                            total_replacements[old_text] += cnt
                            content = content.replace(old_text, new_text)
                    data = content.encode('utf-8')

                zout.writestr(item, data)

    return {
        "output": output_path,
        "replacements": total_replacements,
        "total": sum(total_replacements.values()),
    }


# ============================================================
# HWPX - Document Creation
# ============================================================

_HWPX_CONTENT_HPF = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<opf:package xmlns:opf="http://www.idpf.org/2007/opf" version="1.0" unique-identifier="bookid">
  <opf:metadata>
    <opf:title>Untitled</opf:title>
  </opf:metadata>
  <opf:manifest>
    <opf:item id="header" href="header.xml" media-type="application/xml"/>
    <opf:item id="section0" href="section0.xml" media-type="application/xml"/>
  </opf:manifest>
  <opf:spine>
    <opf:itemref idref="section0"/>
  </opf:spine>
</opf:package>"""

_HWPX_HEADER = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head"
         xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
  <hh:beginNum page="1" footnote="1" endnote="1"/>
  <hh:refList>
    <hh:fontfaces>
      <hh:fontface lang="HANGUL">
        <hh:font id="0" face="함초롬돋움" type="TTF"/>
      </hh:fontface>
      <hh:fontface lang="LATIN">
        <hh:font id="0" face="함초롬돋움" type="TTF"/>
      </hh:fontface>
    </hh:fontfaces>
    <hh:charProperties>
      <hh:charPr id="0">
        <hh:fontRef hangul="0" latin="0"/>
        <hc:pt val="1000"/>
      </hh:charPr>
    </hh:charProperties>
    <hh:paraProperties>
      <hh:paraPr id="0">
        <hh:align horizontal="JUSTIFY" vertical="BASELINE"/>
      </hh:paraPr>
    </hh:paraProperties>
  </hh:refList>
</hh:head>"""

_HWPX_VERSION = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<owpml version="1.0"/>"""


def _make_paragraph_xml(text: str, para_id: int = 0) -> str:
    """Create a paragraph XML element."""
    # Escape XML special characters
    text = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    return f'''<hp:p id="{para_id}" paraPrIDRef="0" styleIDRef="0">
      <hp:run charPrIDRef="0">
        <hp:t>{text}</hp:t>
      </hp:run>
    </hp:p>'''


def _make_table_xml(headers: list[str], rows: list[list[str]], para_id_start: int = 0) -> str:
    """Create a table XML element."""
    col_count = len(headers)
    row_count = 1 + len(rows)  # header + data rows
    col_width = 42520 // col_count  # distribute across page width

    parts = [f'<hp:tbl colCnt="{col_count}" rowCnt="{row_count}" cellSpacing="0" borderFillIDRef="1">']

    # Column widths
    for _ in range(col_count):
        parts.append(f'  <hp:gridCol width="{col_width}"/>')

    pid = para_id_start
    all_rows = [headers] + rows

    for r_idx, row_data in enumerate(all_rows):
        parts.append('  <hp:tr>')
        for c_idx, cell_text in enumerate(row_data):
            cell_text_escaped = cell_text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            parts.append(f'''    <hp:tc>
      <hp:cellAddr colAddr="{c_idx}" rowAddr="{r_idx}"/>
      <hp:cellSpan colSpan="1" rowSpan="1"/>
      <hp:cellSz width="{col_width}" height="1000"/>
      <hp:p id="{pid}" paraPrIDRef="0" styleIDRef="0">
        <hp:run charPrIDRef="0">
          <hp:t>{cell_text_escaped}</hp:t>
        </hp:run>
      </hp:p>
    </hp:tc>''')
            pid += 1
        parts.append('  </hp:tr>')

    parts.append('</hp:tbl>')
    return '\n'.join(parts), pid


def create_hwpx(output_path: str, content: list[dict]) -> str:
    """Create a new HWPX document.

    Args:
        output_path: Path to save the HWPX file
        content: List of content items, each being:
            {"type": "text", "text": "Hello"}
            {"type": "table", "headers": ["Name", "Age"], "rows": [["Kim", "30"], ["Lee", "25"]]}

    Returns:
        Path to the created file
    """
    section_parts = []
    section_parts.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
    section_parts.append('<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"')
    section_parts.append('         xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"')
    section_parts.append('         xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">')

    para_id = 0
    for item in content:
        if item.get('type') == 'text':
            text = item.get('text', '')
            for line in text.split('\n'):
                section_parts.append(_make_paragraph_xml(line, para_id))
                para_id += 1

        elif item.get('type') == 'table':
            headers = item.get('headers', [])
            rows = item.get('rows', [])
            if headers:
                # Wrap table in a paragraph
                section_parts.append(f'<hp:p id="{para_id}" paraPrIDRef="0" styleIDRef="0">')
                para_id += 1
                table_xml, para_id = _make_table_xml(headers, rows, para_id)
                section_parts.append(table_xml)
                section_parts.append('</hp:p>')

    section_parts.append('</hs:sec>')
    section_xml = '\n'.join(section_parts)

    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('mimetype', 'application/vnd.hancom.hwpx+zip')
        zf.writestr('version.xml', _HWPX_VERSION)
        zf.writestr('Contents/content.hpf', _HWPX_CONTENT_HPF)
        zf.writestr('Contents/header.xml', _HWPX_HEADER)
        zf.writestr('Contents/section0.xml', section_xml)

    return output_path
