"""HWPX (OWPML) format parser - extracts text, tables, and images."""

import os
import zipfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import Optional

# HWPX XML namespaces
NS = {
    'hp': 'http://www.hancom.co.kr/hwpml/2011/paragraph',
    'hs': 'http://www.hancom.co.kr/hwpml/2011/section',
    'hh': 'http://www.hancom.co.kr/hwpml/2011/head',
    'hc': 'http://www.hancom.co.kr/hwpml/2011/core',
    'opf': 'http://www.idpf.org/2007/opf',
    'dc': 'http://purl.org/dc/elements/1.1/',
}


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
        lines.append("| " + " | ".join(grid[0]) + " |")
        lines.append("| " + " | ".join(["---"] * self.cols) + " |")
        for r in range(1, self.rows):
            lines.append("| " + " | ".join(grid[r]) + " |")

        return "\n".join(lines)


@dataclass
class ImageRef:
    name: str
    path: str
    media_type: str


class HWPXParser:
    def __init__(self, file_path: str):
        self.file_path = file_path
        self.zf = zipfile.ZipFile(file_path, 'r')
        self.sections = self._find_sections()
        self.images = self._find_images()

    def _find_sections(self) -> list[str]:
        """Find section XML files in the HWPX archive."""
        sections = []
        for name in self.zf.namelist():
            # Sections can be at Contents/section0.xml or Contents/Section0.xml
            lower = name.lower()
            if ('contents/' in lower or 'content/' in lower) and 'section' in lower and lower.endswith('.xml'):
                sections.append(name)
        sections.sort()
        return sections

    def _find_images(self) -> list[ImageRef]:
        """Find image files in BinData directory."""
        images = []
        for name in self.zf.namelist():
            lower = name.lower()
            if 'bindata/' in lower:
                ext = os.path.splitext(name)[1].lower()
                if ext in ('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tif', '.tiff', '.emf', '.wmf', '.svg'):
                    basename = os.path.basename(name)
                    media_type = {
                        '.png': 'image/png',
                        '.jpg': 'image/jpeg',
                        '.jpeg': 'image/jpeg',
                        '.gif': 'image/gif',
                        '.bmp': 'image/bmp',
                        '.tif': 'image/tiff',
                        '.tiff': 'image/tiff',
                        '.emf': 'image/emf',
                        '.wmf': 'image/wmf',
                        '.svg': 'image/svg+xml',
                    }.get(ext, 'application/octet-stream')
                    images.append(ImageRef(name=basename, path=name, media_type=media_type))
        return images

    def _extract_text_from_element(self, elem) -> str:
        """Recursively extract text from an XML element."""
        texts = []

        # Direct text content
        tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag

        if tag == 't':
            if elem.text:
                texts.append(elem.text)
        elif tag == 'tab':
            texts.append('\t')
        elif tag == 'lineBreak':
            texts.append('\n')

        for child in elem:
            texts.append(self._extract_text_from_element(child))

        if elem.tail and tag == 't':
            texts.append(elem.tail)

        return ''.join(texts)

    def _parse_paragraph(self, p_elem) -> str:
        """Extract text from a paragraph element."""
        texts = []
        for run in p_elem.iter():
            tag = run.tag.split('}')[-1] if '}' in run.tag else run.tag
            if tag == 't' and run.text:
                texts.append(run.text)
            elif tag == 'tab':
                texts.append('\t')
            elif tag == 'lineBreak':
                texts.append('\n')
        return ''.join(texts)

    def _parse_table(self, tbl_elem) -> Optional[Table]:
        """Parse a table element into a Table object."""
        rows = list(tbl_elem.iter())
        table_rows = []

        # Find tr (table row) elements
        for elem in tbl_elem:
            tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
            if tag == 'tr':
                table_rows.append(elem)

        if not table_rows:
            return None

        table = Table()
        row_idx = 0
        max_cols = 0

        for tr in table_rows:
            col_idx = 0
            for child in tr:
                tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
                if tag == 'tc':
                    cell = TableCell(row=row_idx, col=col_idx)

                    # Get cell span attributes
                    cell_addr = child.find('.//{%s}cellAddr' % NS.get('hp', ''))
                    if cell_addr is not None:
                        cell.col = int(cell_addr.get('colAddr', col_idx))
                        cell.row = int(cell_addr.get('rowAddr', row_idx))

                    cell_span = child.find('.//{%s}cellSpan' % NS.get('hp', ''))
                    if cell_span is not None:
                        cell.col_span = int(cell_span.get('colSpan', 1))
                        cell.row_span = int(cell_span.get('rowSpan', 1))

                    # Extract cell text
                    cell_texts = []
                    for p in child.iter():
                        p_tag = p.tag.split('}')[-1] if '}' in p.tag else p.tag
                        if p_tag == 't' and p.text:
                            cell_texts.append(p.text)
                    cell.text = ' '.join(cell_texts)

                    table.cells.append(cell)
                    col_idx += cell.col_span
                    max_cols = max(max_cols, col_idx)

            row_idx += 1

        table.rows = row_idx
        table.cols = max_cols if max_cols > 0 else 1

        return table

    def extract_text(self) -> str:
        """Extract all text from the document."""
        result = []
        for section_path in self.sections:
            try:
                with self.zf.open(section_path) as f:
                    tree = ET.parse(f)
                    root = tree.getroot()

                    for elem in root.iter():
                        tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
                        if tag == 'p':
                            para_text = self._parse_paragraph(elem)
                            if para_text.strip():
                                result.append(para_text)
            except Exception:
                pass

        return '\n'.join(result)

    def extract_tables(self) -> list[Table]:
        """Extract all tables from the document."""
        tables = []
        for section_path in self.sections:
            try:
                with self.zf.open(section_path) as f:
                    tree = ET.parse(f)
                    root = tree.getroot()

                    for elem in root.iter():
                        tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
                        if tag == 'tbl':
                            table = self._parse_table(elem)
                            if table and table.cells:
                                tables.append(table)
            except Exception:
                pass

        return tables

    def extract_structured(self) -> dict:
        """Extract full document structure."""
        content_parts = []
        tables = []

        for section_path in self.sections:
            try:
                with self.zf.open(section_path) as f:
                    tree = ET.parse(f)
                    root = tree.getroot()

                    for elem in root.iter():
                        tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag

                        if tag == 'p':
                            # Check if this paragraph is inside a table cell
                            # (we'll handle table text separately)
                            para_text = self._parse_paragraph(elem)
                            if para_text.strip():
                                content_parts.append({"type": "text", "content": para_text})

                        elif tag == 'tbl':
                            table = self._parse_table(elem)
                            if table and table.cells:
                                tables.append(table)
                                content_parts.append({
                                    "type": "table",
                                    "rows": table.rows,
                                    "cols": table.cols,
                                    "markdown": table.to_markdown(),
                                })
            except Exception:
                pass

        images = [{"name": img.name, "path": img.path, "type": img.media_type} for img in self.images]

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

    def extract_image(self, image_name: str) -> Optional[tuple[bytes, str]]:
        """Extract a specific image by name. Returns (data, media_type)."""
        for img in self.images:
            if img.name == image_name or img.path == image_name:
                try:
                    data = self.zf.read(img.path)
                    return data, img.media_type
                except Exception:
                    return None
        return None

    def extract_all_images(self, output_dir: str) -> list[str]:
        """Extract all images to a directory."""
        os.makedirs(output_dir, exist_ok=True)
        saved = []
        for img in self.images:
            try:
                data = self.zf.read(img.path)
                out_path = os.path.join(output_dir, img.name)
                with open(out_path, 'wb') as f:
                    f.write(data)
                saved.append(out_path)
            except Exception:
                pass
        return saved

    def close(self):
        self.zf.close()
