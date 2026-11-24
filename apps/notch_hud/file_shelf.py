"""Nexus Notch HUD - File Shelf Staging Component.

Provides local-first staging, hashing, and ledger persistence for files dropped
or routed to the Nexus Notch HUD shelf:
- Persistent shelf directory in ~/.nexus-agent/shelf
- stage_files: validates, copies, computes SHA-256 hashes, and records files
- clear_shelf: wipes staged files and clears ledger index
- Fully compatible with SovereignMemoryStore and MCP file sharing bus
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
import logging
import os
from pathlib import Path
import shutil
import time
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

logger = logging.getLogger("nexus.notch_hud.file_shelf")

DEFAULT_SHELF_DIR = Path.home() / ".nexus-agent" / "shelf"


def wait_for_file_stability(
    path: Union[str, Path],
    interval_ms: int = 150,
    max_attempts: int = 10,
) -> bool:
    """Verifies that a file's size is stable and has non-exclusive read access.

    Prevents PermissionError and corrupted hash computation when files are still
    being downloaded or written to by Chrome, Edge, or other background processes.

    Checks:
    1. Checks os.path.getsize(path) twice separated by interval_ms (150ms default).
    2. Verifies non-exclusive read access (open(path, "rb")) so active downloads
       never raise PermissionError.

    Args:
        path: Path to the target file.
        interval_ms: Milliseconds to wait between size checks (default 150ms).
        max_attempts: Maximum retry attempts before giving up (default 10).

    Returns:
        bool: True if file exists, size is stable, and file can be read without lock errors;
              False if the file remains locked, changing, or inaccessible after max_attempts.
    """
    target = Path(path).resolve()
    if target.exists() and target.is_dir():
        return True

    delay_sec = max(0.01, interval_ms / 1000.0)

    for attempt in range(max_attempts):
        try:
            if not target.exists():
                time.sleep(delay_sec)
                continue

            size_first = os.path.getsize(target)
            time.sleep(delay_sec)
            size_second = os.path.getsize(target)

            if size_first != size_second:
                logger.debug(
                    "File size shifting for %s (%d -> %d), attempt %d/%d",
                    target.name,
                    size_first,
                    size_second,
                    attempt + 1,
                    max_attempts,
                )
                continue

            # Verify non-exclusive read access
            with open(target, "rb") as fp:
                _ = fp.read(4096)

            return True

        except (PermissionError, OSError) as exc:
            logger.debug(
                "File lock constraint on %s (%s), attempt %d/%d",
                target.name,
                exc,
                attempt + 1,
                max_attempts,
            )
            time.sleep(delay_sec)
            continue

    return False


@dataclass
class IngestedFile:
    """Metadata representation of an ingested or staged file."""

    name: str
    path: str
    size_bytes: int
    is_dir: bool
    extension: str
    sha256: str
    timestamp: float

    def format_size(self) -> str:
        """Returns human-readable file size string."""
        if self.is_dir:
            return "Folder"
        size = float(self.size_bytes)
        for unit in ["B", "KB", "MB", "GB"]:
            if size < 1024.0 or unit == "GB":
                return f"{size:.1f} {unit}"
            size /= 1024.0
        return f"{size:.1f} GB"

    def to_dict(self) -> Dict[str, Any]:
        """Converts to dictionary representation."""
        return asdict(self)


class FileShelfStaging:
    """Manages file staging in ~/.nexus-agent/shelf with persistent ledger tracking."""

    def __init__(self, shelf_dir: Optional[Union[str, Path]] = None) -> None:
        if shelf_dir:
            self.shelf_dir = Path(shelf_dir).resolve()
        else:
            self.shelf_dir = DEFAULT_SHELF_DIR.resolve()

        self.shelf_dir.mkdir(parents=True, exist_ok=True)
        self.index_file = self.shelf_dir / "index.json"
        self._staged_files: List[IngestedFile] = []
        self._load_ledger()

    @property
    def staged_files(self) -> List[IngestedFile]:
        """Returns the list of currently staged files."""
        return list(self._staged_files)

    def get_shelf_dir(self) -> Path:
        """Returns the shelf directory path."""
        return self.shelf_dir

    def _load_ledger(self) -> None:
        """Loads existing staged file ledger from index.json if present."""
        if not self.index_file.exists():
            self._staged_files = []
            return

        try:
            with open(self.index_file, "r", encoding="utf-8") as fp:
                data = json.load(fp)
            loaded: List[IngestedFile] = []
            if isinstance(data, list):
                for item in data:
                    if isinstance(item, dict):
                        # Verify file still exists on disk before keeping in ledger
                        p = item.get("path", "")
                        if p and os.path.exists(p):
                            loaded.append(
                                IngestedFile(
                                    name=item.get("name", os.path.basename(p)),
                                    path=p,
                                    size_bytes=int(item.get("size_bytes", 0)),
                                    is_dir=bool(item.get("is_dir", False)),
                                    extension=item.get("extension", os.path.splitext(p)[1].lower()),
                                    sha256=item.get("sha256", ""),
                                    timestamp=float(item.get("timestamp", time.time())),
                                )
                            )
            self._staged_files = loaded
        except Exception as exc:
            logger.warning("Failed to load shelf ledger from %s: %s", self.index_file, exc)
            self._staged_files = []

    def _persist_ledger(self) -> None:
        """Saves current staged file ledger to index.json."""
        try:
            data = [f.to_dict() for f in self._staged_files]
            temp_file = self.index_file.with_suffix(".tmp")
            with open(temp_file, "w", encoding="utf-8") as fp:
                json.dump(data, fp, indent=2)
            temp_file.replace(self.index_file)
        except Exception as exc:
            logger.warning("Failed to persist shelf ledger: %s", exc)

    @staticmethod
    def compute_sha256(path: Path) -> str:
        """Computes SHA-256 hash of a file with lock retry handling."""
        if not path.is_file():
            return "directory" if path.is_dir() else ""

        h = hashlib.sha256()
        for attempt in range(4):
            try:
                with open(path, "rb") as fp:
                    while chunk := fp.read(1024 * 1024):
                        h.update(chunk)
                return h.hexdigest()
            except PermissionError:
                if attempt < 3:
                    time.sleep(0.05)
                else:
                    logger.warning("PermissionError computing hash for %s", path)
            except Exception as exc:
                logger.warning("Error computing hash for %s: %s", path, exc)
                break
        return ""

    def stage_files(
        self,
        files: Union[str, Path, Sequence[Union[str, Path]]],
        copy_to_shelf: bool = True,
    ) -> List[IngestedFile]:
        """Stages one or more files into ~/.nexus-agent/shelf and updates the ledger.

        Args:
            files: Single path or sequence of file/directory paths.
            copy_to_shelf: If True, copies the file/directory into the shelf directory
                           if not already located inside it.

        Returns:
            List of IngestedFile instances representing the newly staged files.
        """
        if isinstance(files, (str, Path)):
            raw_paths = [files]
        else:
            raw_paths = list(files)

        staged_batch: List[IngestedFile] = []

        for item in raw_paths:
            src_path = Path(item).resolve()
            if not src_path.exists():
                logger.warning("File does not exist: %s", src_path)
                continue

            target_path = src_path
            is_dir = src_path.is_dir()

            # Stability check for files before copying/hashing
            if not is_dir:
                if not wait_for_file_stability(src_path, interval_ms=150, max_attempts=10):
                    logger.warning(
                        "File %s still locked/downloading after max attempts; skipping staging. File still downloading — retry drop",
                        src_path,
                    )
                    continue

            # If copy_to_shelf is True and source is outside shelf_dir, copy into shelf
            if copy_to_shelf:
                try:
                    src_path.relative_to(self.shelf_dir)
                    # Already inside shelf_dir, keep as target_path
                    target_path = src_path
                except ValueError:
                    # Source is outside shelf_dir; copy into shelf_dir
                    dest_path = self.shelf_dir / src_path.name
                    if dest_path.exists() and dest_path != src_path:
                        # Append timestamp suffix to avoid overwriting distinct file
                        stem = src_path.stem
                        suffix = src_path.suffix
                        dest_path = self.shelf_dir / f"{stem}_{int(time.time()*1000)}{suffix}"

                    try:
                        if is_dir:
                            shutil.copytree(src_path, dest_path, dirs_exist_ok=True)
                        else:
                            shutil.copy2(src_path, dest_path)
                        target_path = dest_path
                    except Exception as exc:
                        logger.warning("Failed to copy %s to shelf: %s", src_path, exc)
                        target_path = src_path

            # Compute size and SHA-256
            if is_dir:
                size_bytes = sum(f.stat().st_size for f in target_path.rglob("*") if f.is_file())
                sha256_hash = "directory"
            else:
                try:
                    size_bytes = target_path.stat().st_size
                except Exception:
                    size_bytes = 0
                sha256_hash = self.compute_sha256(target_path)

            ingested = IngestedFile(
                name=target_path.name,
                path=str(target_path),
                size_bytes=size_bytes,
                is_dir=is_dir,
                extension=target_path.suffix.lower() if not is_dir else "",
                sha256=sha256_hash,
                timestamp=time.time(),
            )

            # Avoid duplicates in staged ledger
            self._staged_files = [f for f in self._staged_files if f.path != ingested.path]
            self._staged_files.append(ingested)
            staged_batch.append(ingested)

            # Auto-detect and audit .nxskill / SKILL.md packages dropped on shelf
            if ingested.extension == ".nxskill" or ingested.name.lower() == "skill.md":
                try:
                    import urllib.request
                    token = ""
                    token_path = Path.home() / ".nexus-agent" / "ipc_token.secret"
                    if token_path.exists():
                        try:
                            token = token_path.read_text(encoding="utf-8").strip()
                        except Exception:
                            pass
                    headers = {"Content-Type": "application/json"}
                    if token:
                        headers["Authorization"] = f"Bearer {token}"
                    req = urllib.request.Request(
                        "http://127.0.0.1:47630/api/skills/import",
                        data=json.dumps({"bundle": str(target_path), "auto_elevate": True}).encode("utf-8"),
                        headers=headers,
                        method="POST",
                    )
                    with urllib.request.urlopen(req, timeout=3.0) as resp:
                        res = json.loads(resp.read().decode("utf-8"))
                        logger.info("Imported skill via IPC from shelf: %s (status=%s)", res.get("slug"), res.get("status"))
                except Exception as exc:
                    logger.debug("Shelf IPC skill import fallback to local: %s", exc)
                    try:
                        from core.mcp.skill_marketplace_importer import SkillMarketplaceImporter
                        importer = SkillMarketplaceImporter()
                        imp_res = importer.install_nxskill_bundle(str(target_path), auto_elevate=True)
                        logger.info("Direct-imported skill from shelf: %s", imp_res.get("slug"))
                    except Exception as inner_exc:
                        logger.debug("Direct import error: %s", inner_exc)

        self._persist_ledger()
        logger.info("Staged %d file(s) into shelf at %s", len(staged_batch), self.shelf_dir)
        return staged_batch

    def clear_shelf(self) -> int:
        """Clears all staged files and directories from the shelf directory and ledger.

        Preserves the shelf directory itself and resets index.json to an empty array.

        Returns:
            Number of file/directory entries removed.
        """
        removed_count = 0

        # Remove physical files/folders within shelf_dir (excluding index.json)
        try:
            for item in self.shelf_dir.iterdir():
                if item.name == "index.json":
                    continue
                try:
                    if item.is_dir():
                        shutil.rmtree(item, ignore_errors=True)
                    else:
                        item.unlink(missing_ok=True)
                    removed_count += 1
                except Exception as exc:
                    logger.warning("Error deleting shelf item %s: %s", item, exc)
        except Exception as exc:
            logger.warning("Error reading shelf directory for clearing: %s", exc)

        self._staged_files.clear()
        self._persist_ledger()
        logger.info("Cleared %d item(s) from shelf: %s", removed_count, self.shelf_dir)
        return removed_count

    def get_staged_files(self) -> List[IngestedFile]:
        """Returns a copy of the currently staged files."""
        return list(self._staged_files)

    def list_staged_files(self) -> List[Dict[str, Any]]:
        """Returns dictionaries of all staged files."""
        return [f.to_dict() for f in self._staged_files]

    def remove_file(self, identifier: Union[str, Path]) -> bool:
        """Removes a single staged file by filename, path, or SHA-256 hash.

        Args:
            identifier: File name, file path string/Path, or SHA-256 hash.

        Returns:
            True if matching file was found and removed, False otherwise.
        """
        target: Optional[IngestedFile] = None
        ident_str = str(identifier).strip()

        for f in self._staged_files:
            if f.name == ident_str or f.path == ident_str or f.sha256 == ident_str:
                target = f
                break

        if not target:
            return False

        # Attempt to delete file if inside shelf_dir
        try:
            target_path = Path(target.path)
            target_path.relative_to(self.shelf_dir)
            if target_path.exists():
                if target_path.is_dir():
                    shutil.rmtree(target_path, ignore_errors=True)
                else:
                    target_path.unlink(missing_ok=True)
        except ValueError:
            pass  # File was outside shelf_dir, don't delete original
        except Exception as exc:
            logger.warning("Error deleting file %s: %s", target.path, exc)

        self._staged_files = [f for f in self._staged_files if f.path != target.path]
        self._persist_ledger()
        return True
