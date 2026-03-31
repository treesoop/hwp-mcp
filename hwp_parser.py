"""HWP 5.0 binary format parser - extracts text, tables, and images."""

import struct
import zlib
from dataclasses import dataclass, field
from typing import Optional

import olefile

# HWPTAG constants
HWPTAG_BEGIN = 0x010
HWPTAG_DOCUMENT_PROPERTIES = HWPTAG_BEGIN + 0  # 16
HWPTAG_ID_MAPPINGS = HWPTAG_BEGIN + 1  # 17
HWPTAG_BIN_DATA = HWPTAG_BEGIN + 2  # 18
HWPTAG_FACE_NAME = HWPTAG_BEGIN + 3  # 19
HWPTAG_CHAR_SHAPE = HWPTAG_BEGIN + 5  # 21
HWPTAG_PARA_SHAPE = HWPTAG_BEGIN + 9  # 25

HWPTAG_PARA_HEADER = HWPTAG_BEGIN + 50  # 66
HWPTAG_PARA_TEXT = HWPTAG_BEGIN + 51  # 67
HWPTAG_PARA_CHAR_SHAPE = HWPTAG_BEGIN + 52  # 68
HWPTAG_CTRL_HEADER = HWPTAG_BEGIN + 55  # 71
HWPTAG_LIST_HEADER = HWPTAG_BEGIN + 56  # 72
HWPTAG_TABLE = HWPTAG_BEGIN + 61  # 77
HWPTAG_SHAPE_COMPONENT = HWPTAG_BEGIN + 60  # 76
HWPTAG_SHAPE_COMPONENT_PICTURE = HWPTAG_BEGIN + 69  # 85


@dataclass
class Record:
    tag_id: int
    level: int
    size: int
    data: bytes
    offset: int = 0


@dataclass
class TableCell:
    row: int = 0
    col: int = 0
    row_span: int = 1
    col_span: int = 1
    text: str = ""


@dataclass
class Table:
    rows: int = 0
    cols: int = 0
    cells: list = field(default_factory=list)

    def to_markdown(self) -> str:
        if not self.cells or self.rows == 0 or self.cols == 0:
            return ""

        grid = [["" for _ in range(self.cols)] for _ in range(self.rows)]
        for cell in self.cells:
            if cell.row < self.rows and cell.col < self.cols:
                grid[cell.row][cell.col] = cell.text.strip()

        lines = []
        # Header row
        lines.append("| " + " | ".join(grid[0]) + " |")
        lines.append("| " + " | ".join(["---"] * self.cols) + " |")
        # Data rows
        for r in range(1, self.rows):
            lines.append("| " + " | ".join(grid[r]) + " |")

        return "\n".join(lines)


@dataclass
class ImageRef:
    bin_id: int
    name: str
    ext: str
    stream_name: str


def parse_records(data: bytes) -> list[Record]:
    """Parse binary record stream into list of Record objects."""
    records = []
    offset = 0
    while offset < len(data) - 4:
        try:
            header = struct.unpack_from('<I', data, offset)[0]
        except struct.error:
            break

        tag_id = header & 0x3FF
        level = (header >> 10) & 0x3FF
        size = (header >> 20) & 0xFFF
        offset += 4

        if size == 0xFFF:
            if offset + 4 > len(data):
                break
            size = struct.unpack_from('<I', data, offset)[0]
            offset += 4

        if offset + size > len(data):
            break

        rec_data = data[offset:offset + size]
        records.append(Record(tag_id=tag_id, level=level, size=size, data=rec_data, offset=offset))
        offset += size

    return records


def decode_para_text(data: bytes) -> str:
    """Decode PARA_TEXT record data to string, handling HWP control characters.

    HWP 5.0 spec control characters:
    - Inline controls (2 bytes): 0x0000 (null), 0x0009 (tab), 0x000A (line break), 0x000D (para end)
    - Extended controls (16 bytes / 8 wchars): all other codes 0x0001-0x001F
      These carry a 4-byte type ID + parameters after the code.
    """
    # Inline control codes that occupy only 2 bytes
    INLINE_CONTROLS = {0x0000, 0x0009, 0x000A, 0x000D}
    text = []
    i = 0
    length = len(data)

    while i < length:
        if i + 2 > length:
            break
        code = struct.unpack_from('<H', data, i)[0]

        if code <= 0x001F:
            if code == 0x0009:  # tab
                text.append('\t')
                i += 2
            elif code == 0x000A:  # line break
                text.append('\n')
                i += 2
            elif code in INLINE_CONTROLS:
                i += 2
            else:
                # Extended control: 16 bytes total
                i += 16
        else:
            # Normal character
            text.append(chr(code))
            i += 2

    return ''.join(text)


def decompress_stream(ole: olefile.OleFileIO, stream_name: str, is_compressed: bool = True) -> bytes:
    """Read and optionally decompress an OLE stream."""
    data = ole.openstream(stream_name).read()
    if is_compressed:
        try:
            return zlib.decompress(data, -15)
        except zlib.error:
            return data
    return data


class HWPParser:
    def __init__(self, file_path: str):
        self.file_path = file_path
        self.ole = olefile.OleFileIO(file_path)
        self.is_compressed = self._check_compressed()
        self.bin_data_refs: list[ImageRef] = []
        self._parse_doc_info()

    def _check_compressed(self) -> bool:
        """Check if document streams are compressed (bit 0 of flags)."""
        header_data = self.ole.openstream('FileHeader').read()
        if len(header_data) >= 40:
            flags = struct.unpack_from('<I', header_data, 36)[0]
            return bool(flags & 0x01)
        return True  # default assume compressed

    def _parse_doc_info(self):
        """Parse DocInfo to get BinData references."""
        try:
            data = decompress_stream(self.ole, 'DocInfo', self.is_compressed)
        except Exception:
            return

        records = parse_records(data)
        bin_id = 0
        for rec in records:
            if rec.tag_id == HWPTAG_BIN_DATA:
                bin_id += 1
                try:
                    self._parse_bin_data_record(rec.data, bin_id)
                except Exception:
                    pass

    def _parse_bin_data_record(self, data: bytes, bin_id: int):
        """Parse a BIN_DATA record to get image reference info."""
        if len(data) < 2:
            return
        flags = struct.unpack_from('<H', data, 0)[0]
        storage_type = flags & 0x0F

        if storage_type == 0:  # LINK
            # Contains file path as UTF-16LE
            pass
        elif storage_type == 1:  # EMBEDDING
            # BinData stream name
            ext_offset = 2
            # Read extension type
            if len(data) >= 4:
                bin_data_id = struct.unpack_from('<H', data, 2)[0]
            else:
                bin_data_id = bin_id

            stream_name = f"BIN{bin_id:04X}"
            # Try to find the actual stream
            for entry in self.ole.listdir():
                joined = '/'.join(entry)
                if 'BinData' in joined and stream_name in joined.upper():
                    # Extract extension from stream name
                    actual_name = entry[-1]
                    ext = actual_name.rsplit('.', 1)[-1] if '.' in actual_name else 'bin'
                    self.bin_data_refs.append(ImageRef(
                        bin_id=bin_id,
                        name=actual_name,
                        ext=ext.lower(),
                        stream_name=joined,
                    ))
                    break

    def get_sections(self) -> list[str]:
        """Get list of BodyText section stream names."""
        sections = []
        for entry in self.ole.listdir():
            path = '/'.join(entry)
            if path.startswith('BodyText/Section'):
                sections.append(path)
        sections.sort()
        return sections

    def extract_text(self) -> str:
        """Extract all text from the document."""
        result = []
        for section_name in self.get_sections():
            data = decompress_stream(self.ole, section_name, self.is_compressed)
            records = parse_records(data)

            for rec in records:
                if rec.tag_id == HWPTAG_PARA_TEXT:
                    text = decode_para_text(rec.data)
                    if text.strip():
                        result.append(text)

        return '\n'.join(result)

    def extract_tables(self) -> list[Table]:
        """Extract tables from the document."""
        tables = []

        for section_name in self.get_sections():
            data = decompress_stream(self.ole, section_name, self.is_compressed)
            records = parse_records(data)

            i = 0
            while i < len(records):
                rec = records[i]

                if rec.tag_id == HWPTAG_TABLE:
                    table = self._parse_table(rec, records, i)
                    if table and table.cells:
                        tables.append(table)

                i += 1

        return tables

    def _parse_table(self, table_rec: Record, records: list[Record], start_idx: int) -> Optional[Table]:
        """Parse a TABLE record and its child cells."""
        data = table_rec.data
        if len(data) < 8:
            return None

        # Table properties
        flags = struct.unpack_from('<I', data, 0)[0]
        row_count = struct.unpack_from('<H', data, 4)[0]
        col_count = struct.unpack_from('<H', data, 6)[0]

        table = Table(rows=row_count, cols=col_count)
        table_level = table_rec.level

        # LIST_HEADER records are at the SAME level as TABLE record
        cell_idx = 0
        i = start_idx + 1
        current_cell = None

        while i < len(records):
            rec = records[i]

            # Stop if we encounter a record at a lower level than table
            if rec.level < table_level:
                break

            # Stop if we hit another CTRL_HEADER or TABLE at same/lower level (new table)
            if rec.tag_id in (HWPTAG_CTRL_HEADER, HWPTAG_TABLE) and rec.level <= table_level:
                break

            if rec.tag_id == HWPTAG_LIST_HEADER and rec.level == table_level:
                # New cell - LIST_HEADER at same level as TABLE
                current_cell = TableCell()
                if len(rec.data) >= 12:
                    current_cell.col = struct.unpack_from('<H', rec.data, 0)[0]
                    current_cell.row = struct.unpack_from('<H', rec.data, 2)[0]
                    current_cell.col_span = struct.unpack_from('<H', rec.data, 4)[0]
                    current_cell.row_span = struct.unpack_from('<H', rec.data, 6)[0]
                else:
                    # Fallback: calculate row/col from cell index
                    current_cell.row = cell_idx // col_count if col_count else 0
                    current_cell.col = cell_idx % col_count if col_count else 0
                table.cells.append(current_cell)
                cell_idx += 1

            elif rec.tag_id == HWPTAG_PARA_TEXT and current_cell is not None:
                text = decode_para_text(rec.data)
                if current_cell.text:
                    current_cell.text += ' ' + text
                else:
                    current_cell.text = text

            i += 1

        return table

    def extract_structured(self) -> dict:
        """Extract full document structure: text, tables, images."""
        content_parts = []
        tables = []
        images = []

        for section_name in self.get_sections():
            data = decompress_stream(self.ole, section_name, self.is_compressed)
            records = parse_records(data)

            # Find which PARA_TEXT records belong to table cells (to avoid duplication)
            table_text_offsets = set()

            # First pass: find tables and mark their text records
            i = 0
            while i < len(records):
                rec = records[i]
                if rec.tag_id == HWPTAG_TABLE:
                    table = self._parse_table(rec, records, i)
                    if table and table.cells:
                        tables.append(table)
                        content_parts.append({
                            "type": "table",
                            "rows": table.rows,
                            "cols": table.cols,
                            "markdown": table.to_markdown(),
                        })
                        # Mark text records inside this table
                        j = i + 1
                        while j < len(records):
                            r = records[j]
                            if r.level < rec.level:
                                break
                            if r.tag_id in (HWPTAG_CTRL_HEADER, HWPTAG_TABLE) and r.level <= rec.level:
                                break
                            if r.tag_id == HWPTAG_PARA_TEXT:
                                table_text_offsets.add(r.offset)
                            j += 1
                i += 1

            # Second pass: extract non-table text
            for rec in records:
                if rec.tag_id == HWPTAG_PARA_TEXT and rec.offset not in table_text_offsets:
                    text = decode_para_text(rec.data)
                    if text.strip():
                        content_parts.append({"type": "text", "content": text})

        # Image references
        for ref in self.bin_data_refs:
            images.append({
                "id": ref.bin_id,
                "name": ref.name,
                "ext": ref.ext,
                "stream": ref.stream_name,
            })

        return {
            "content": content_parts,
            "tables": [t.to_markdown() for t in tables],
            "images": images,
            "stats": {
                "paragraphs": sum(1 for p in content_parts if p["type"] == "text"),
                "tables": len(tables),
                "images": len(images),
            }
        }

    def extract_image(self, bin_id: int) -> Optional[tuple[bytes, str]]:
        """Extract a specific image by BinData ID. Returns (data, extension)."""
        for ref in self.bin_data_refs:
            if ref.bin_id == bin_id:
                try:
                    data = self.ole.openstream(ref.stream_name).read()
                    # Try decompress
                    if self.is_compressed:
                        try:
                            data = zlib.decompress(data, -15)
                        except zlib.error:
                            pass
                    return data, ref.ext
                except Exception:
                    return None
        return None

    def extract_all_images(self, output_dir: str) -> list[str]:
        """Extract all images to a directory. Returns list of saved file paths."""
        import os
        os.makedirs(output_dir, exist_ok=True)
        saved = []

        for ref in self.bin_data_refs:
            try:
                data = self.ole.openstream(ref.stream_name).read()
                if self.is_compressed:
                    try:
                        data = zlib.decompress(data, -15)
                    except zlib.error:
                        pass

                out_path = os.path.join(output_dir, ref.name)
                with open(out_path, 'wb') as f:
                    f.write(data)
                saved.append(out_path)
            except Exception:
                pass

        return saved

    def close(self):
        self.ole.close()
