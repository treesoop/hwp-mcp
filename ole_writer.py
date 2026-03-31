"""Minimal OLE/CFB v3 file writer for creating modified HWP files."""

import math
import struct

MAGIC = b'\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1'
FREESECT = 0xFFFFFFFF
ENDOFCHAIN = 0xFFFFFFFE
FATSECT = 0xFFFFFFFD
NOSTREAM = 0xFFFFFFFF
SECTOR_SIZE = 512
MINI_SECTOR_SIZE = 64
MINI_STREAM_CUTOFF = 4096
DIR_ENTRY_SIZE = 128


def _encode_dir_name(name: str) -> tuple[bytes, int]:
    """Encode directory entry name. Returns (64-byte padded name, byte size including null)."""
    encoded = name.encode('utf-16-le') + b'\x00\x00'
    size = len(encoded)
    return encoded.ljust(64, b'\x00')[:64], min(size, 64)


def _sectors_needed(data_len: int) -> int:
    return max(1, math.ceil(data_len / SECTOR_SIZE)) if data_len > 0 else 0


def create_ole_file(streams: dict[str, bytes], output_path: str):
    """Create a new OLE/CFB v3 file."""

    # --- Phase 1: Build directory tree ---
    # Discover storages and organize hierarchy
    all_paths = sorted(streams.keys())
    storage_set = set()
    for path in all_paths:
        parts = path.split('/')
        for i in range(len(parts) - 1):
            storage_set.add('/'.join(parts[:i + 1]))
    storage_list = sorted(storage_set)

    # Directory entries: [root, storages..., streams...]
    # Each entry: (name, type, full_path, parent_path)
    entries = [('Root Entry', 5, '', None)]
    for s in storage_list:
        name = s.split('/')[-1]
        parent = '/'.join(s.split('/')[:-1])
        entries.append((name, 1, s, parent))
    for path in all_paths:
        name = path.split('/')[-1]
        parent = '/'.join(path.split('/')[:-1])
        entries.append((name, 2, path, parent))

    num_entries = len(entries)

    # Build parent -> children index map
    children_of = {}  # parent_path -> [entry_indices]
    for idx, (_, _, path, parent) in enumerate(entries):
        if parent is not None:
            children_of.setdefault(parent, []).append(idx)

    # Assign child/left/right using balanced BST
    child_sid = [NOSTREAM] * num_entries
    left_sid = [NOSTREAM] * num_entries
    right_sid = [NOSTREAM] * num_entries

    def assign_bst(indices):
        """Assign a balanced BST and return root index."""
        if not indices:
            return NOSTREAM
        mid = len(indices) // 2
        root = indices[mid]
        left_sid[root] = assign_bst(indices[:mid])
        right_sid[root] = assign_bst(indices[mid + 1:])
        return root

    for parent_path, kids in children_of.items():
        parent_idx = next(i for i, (_, _, p, _) in enumerate(entries) if p == parent_path)
        child_sid[parent_idx] = assign_bst(kids)

    # --- Phase 2: Classify streams (mini vs regular) ---
    mini_data = {}   # path -> bytes
    reg_data = {}    # path -> bytes
    for path, data in streams.items():
        if len(data) < MINI_STREAM_CUTOFF:
            mini_data[path] = data
        else:
            reg_data[path] = data

    # --- Phase 3: Build mini stream + mini FAT ---
    mini_fat_entries = []
    mini_container = bytearray()
    mini_start_sects = {}  # path -> mini sector start

    for path, data in mini_data.items():
        n = max(1, math.ceil(len(data) / MINI_SECTOR_SIZE))
        mini_start_sects[path] = len(mini_fat_entries)
        for i in range(n):
            chunk = data[i * MINI_SECTOR_SIZE:(i + 1) * MINI_SECTOR_SIZE]
            mini_container += chunk.ljust(MINI_SECTOR_SIZE, b'\x00')
            mini_fat_entries.append(len(mini_fat_entries) + 1 if i < n - 1 else ENDOFCHAIN)

    mini_fat_bytes = b''.join(struct.pack('<I', e) for e in mini_fat_entries)
    n_mini_fat_sectors = _sectors_needed(len(mini_fat_bytes)) if mini_fat_entries else 0
    n_mini_container_sectors = _sectors_needed(len(mini_container)) if mini_container else 0
    has_mini = bool(mini_fat_entries)

    # --- Phase 4: Plan sector layout ---
    # We need: FAT sectors, dir sectors, mini FAT, mini container, regular data
    n_dir_sectors = _sectors_needed(num_entries * DIR_ENTRY_SIZE)

    # Calculate regular stream sector needs
    reg_sector_needs = {}
    total_reg_sectors = 0
    for path, data in reg_data.items():
        n = _sectors_needed(len(data))
        reg_sector_needs[path] = n
        total_reg_sectors += n

    # Total non-FAT sectors
    non_fat_sectors = n_dir_sectors + n_mini_fat_sectors + n_mini_container_sectors + total_reg_sectors

    # Calculate FAT sectors needed (iterative since FAT itself takes sectors)
    n_fat_sectors = 1
    while n_fat_sectors * (SECTOR_SIZE // 4) < non_fat_sectors + n_fat_sectors:
        n_fat_sectors += 1

    # Assign sector positions
    pos = 0
    fat_sector_ids = list(range(pos, pos + n_fat_sectors)); pos += n_fat_sectors
    dir_sector_ids = list(range(pos, pos + n_dir_sectors)); pos += n_dir_sectors
    mini_fat_sector_ids = list(range(pos, pos + n_mini_fat_sectors)); pos += n_mini_fat_sectors
    mini_container_sector_ids = list(range(pos, pos + n_mini_container_sectors)); pos += n_mini_container_sectors

    reg_start_sects = {}
    reg_sector_chains = {}
    for path, data in reg_data.items():
        n = reg_sector_needs[path]
        sids = list(range(pos, pos + n)); pos += n
        reg_start_sects[path] = sids[0] if sids else ENDOFCHAIN
        reg_sector_chains[path] = sids

    total_sectors = pos

    # --- Phase 5: Build FAT ---
    fat = [FREESECT] * (n_fat_sectors * (SECTOR_SIZE // 4))

    for sid in fat_sector_ids:
        fat[sid] = FATSECT

    for i, sid in enumerate(dir_sector_ids):
        fat[sid] = dir_sector_ids[i + 1] if i < len(dir_sector_ids) - 1 else ENDOFCHAIN

    for i, sid in enumerate(mini_fat_sector_ids):
        fat[sid] = mini_fat_sector_ids[i + 1] if i < len(mini_fat_sector_ids) - 1 else ENDOFCHAIN

    for i, sid in enumerate(mini_container_sector_ids):
        fat[sid] = mini_container_sector_ids[i + 1] if i < len(mini_container_sector_ids) - 1 else ENDOFCHAIN

    for path, sids in reg_sector_chains.items():
        for i, sid in enumerate(sids):
            fat[sid] = sids[i + 1] if i < len(sids) - 1 else ENDOFCHAIN

    # --- Phase 6: Build directory entries ---
    dir_bytes = bytearray()
    for idx, (name, etype, path, _) in enumerate(entries):
        entry = bytearray(128)
        name_enc, name_sz = _encode_dir_name(name)
        entry[0:64] = name_enc
        struct.pack_into('<H', entry, 64, name_sz)
        entry[66] = etype
        entry[67] = 1  # black
        struct.pack_into('<I', entry, 68, left_sid[idx])
        struct.pack_into('<I', entry, 72, right_sid[idx])
        struct.pack_into('<I', entry, 76, child_sid[idx])

        if etype == 5:  # Root
            start = mini_container_sector_ids[0] if has_mini else ENDOFCHAIN
            size = len(mini_container)
        elif etype == 1:  # Storage
            start = ENDOFCHAIN
            size = 0
        else:  # Stream
            data = streams[path]
            size = len(data)
            if path in reg_start_sects:
                start = reg_start_sects[path]
            elif path in mini_start_sects:
                start = mini_start_sects[path]
            else:
                start = ENDOFCHAIN

        struct.pack_into('<I', entry, 116, start if start != ENDOFCHAIN else 0xFFFFFFFE)
        struct.pack_into('<I', entry, 120, size)
        dir_bytes += entry

    # Pad to fill directory sectors
    dir_bytes = dir_bytes.ljust(n_dir_sectors * SECTOR_SIZE, b'\x00')

    # --- Phase 7: Build file header ---
    header = bytearray(512)
    header[0:8] = MAGIC
    struct.pack_into('<H', header, 24, 0x003E)
    struct.pack_into('<H', header, 26, 0x0003)  # v3
    struct.pack_into('<H', header, 28, 0xFFFE)
    struct.pack_into('<H', header, 30, 9)  # 2^9 = 512
    struct.pack_into('<H', header, 32, 6)  # 2^6 = 64
    struct.pack_into('<I', header, 44, n_fat_sectors)
    struct.pack_into('<I', header, 48, dir_sector_ids[0])
    struct.pack_into('<I', header, 56, MINI_STREAM_CUTOFF)
    struct.pack_into('<I', header, 60, mini_fat_sector_ids[0] if has_mini else ENDOFCHAIN)
    struct.pack_into('<I', header, 64, n_mini_fat_sectors)
    struct.pack_into('<I', header, 68, ENDOFCHAIN)  # no DIFAT
    struct.pack_into('<I', header, 72, 0)

    for i in range(109):
        val = fat_sector_ids[i] if i < n_fat_sectors else FREESECT
        struct.pack_into('<I', header, 76 + i * 4, val)

    # --- Phase 8: Write file ---
    sector_data = [None] * total_sectors

    # FAT sectors
    fat_bytes = b''.join(struct.pack('<I', e) for e in fat)
    for i, sid in enumerate(fat_sector_ids):
        sector_data[sid] = fat_bytes[i * SECTOR_SIZE:(i + 1) * SECTOR_SIZE]

    # Directory sectors
    for i, sid in enumerate(dir_sector_ids):
        sector_data[sid] = dir_bytes[i * SECTOR_SIZE:(i + 1) * SECTOR_SIZE]

    # Mini FAT sectors
    mf = mini_fat_bytes.ljust(n_mini_fat_sectors * SECTOR_SIZE, b'\xff')
    for i, sid in enumerate(mini_fat_sector_ids):
        sector_data[sid] = mf[i * SECTOR_SIZE:(i + 1) * SECTOR_SIZE]

    # Mini container sectors
    mc = mini_container.ljust(n_mini_container_sectors * SECTOR_SIZE, b'\x00')
    for i, sid in enumerate(mini_container_sector_ids):
        sector_data[sid] = mc[i * SECTOR_SIZE:(i + 1) * SECTOR_SIZE]

    # Regular stream sectors
    for path, sids in reg_sector_chains.items():
        data = reg_data[path]
        for i, sid in enumerate(sids):
            chunk = data[i * SECTOR_SIZE:(i + 1) * SECTOR_SIZE]
            sector_data[sid] = chunk.ljust(SECTOR_SIZE, b'\x00')

    with open(output_path, 'wb') as f:
        f.write(header)
        for sd in sector_data:
            f.write(sd if sd else b'\x00' * SECTOR_SIZE)
