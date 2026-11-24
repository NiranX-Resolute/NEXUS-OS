"""
Nexus OS v5.0 - Local Document RAG Engine.
Provides local document ingestion, chunking (PDF, Markdown, text), FastEmbed / deterministic
embedding generation, and storage/retrieval backed by SovereignMemoryStore (SQLite WAL + FTS5 + vector search).
Strictly local-first data sovereignty; zero cloud leakage, zero ChromaDB.
Part of the Nexus Edge-to-Desktop Autonomous Engine.
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import os
from pathlib import Path
import re
import struct
import time
from typing import Any, Dict, List, Optional, Tuple, Union

from core.memory.sovereign_store import SovereignMemoryStore
from core.runtime.scope_guard import ScopeGuard
from core.mcp.plugin_loader import nexus_tool

logger = logging.getLogger("nexus.memory.document_rag")

# Vector dimension matching SovereignMemoryStore standard
VECTOR_DIM = 384

# Attempt to load FastEmbed
_HAS_FASTEMBED = False
_fastembed_model = None

try:
    from fastembed import TextEmbedding
    _HAS_FASTEMBED = True
except ImportError:
    _HAS_FASTEMBED = False
    logger.info("FastEmbed not detected; deterministic 384-dimensional L2-normalized embeddings will be used.")


def get_fastembed_model() -> Optional[Any]:
    """Initializes or returns cached FastEmbed model instance."""
    global _fastembed_model
    if not _HAS_FASTEMBED:
        return None
    if _fastembed_model is None:
        try:
            from fastembed import TextEmbedding
            _fastembed_model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
        except Exception as exc:
            logger.warning("Failed to initialize FastEmbed model: %s", exc)
            return None
    return _fastembed_model


def generate_deterministic_embedding(text: str, dim: int = VECTOR_DIM) -> List[float]:
    """
    Generates a deterministic, L2-normalized pseudo-semantic embedding vector of dimension `dim`.
    Combines word tokens, character n-grams, and SHA-256 frequency hashing.
    Zero mocks, pure reproducible mathematics.
    """
    vec = [0.0] * dim
    tokens = re.findall(r"\w+", (text or "").lower())
    if not tokens:
        val = 1.0 / math.sqrt(dim)
        return [val] * dim

    for i, token in enumerate(tokens):
        h = hashlib.sha256(token.encode("utf-8")).digest()
        for j in range(0, min(len(h), 32), 4):
            raw_val = struct.unpack("!I", h[j : j + 4])[0]
            idx = (raw_val + i) % dim
            weight = 1.0 + float(raw_val % 100) / 100.0
            vec[idx] += weight

    # Add character bi-grams for morphological sensitivity
    clean = re.sub(r"\s+", " ", text.lower().strip())
    for i in range(len(clean) - 1):
        bigram = clean[i : i + 2]
        idx = (ord(bigram[0]) * 31 + ord(bigram[1])) % dim
        vec[idx] += 0.5

    # L2 Normalization
    norm = math.sqrt(sum(x * x for x in vec))
    if norm > 0:
        vec = [round(x / norm, 6) for x in vec]
    return vec


def compute_embedding(text: str) -> List[float]:
    """Generates 384-dimensional embedding using FastEmbed if available, or deterministic vector."""
    model = get_fastembed_model()
    if model is not None:
        try:
            embeddings = list(model.embed([text]))
            if embeddings and len(embeddings[0]) == VECTOR_DIM:
                return [float(x) for x in embeddings[0]]
        except Exception as exc:
            logger.debug("FastEmbed runtime generation error: %s; using deterministic fallback.", exc)

    return generate_deterministic_embedding(text, dim=VECTOR_DIM)


def chunk_text(
    text: str,
    chunk_size: int = 500,
    overlap: int = 50,
) -> List[str]:
    """
    Splits text into overlapping sliding-window chunks respecting paragraphs and sentences.

    Args:
        text: Source text to partition.
        chunk_size: Target character count per chunk.
        overlap: Character overlap between contiguous chunks.

    Returns:
        List of non-empty text chunks.
    """
    clean_text = (text or "").strip()
    if not clean_text:
        return []

    if len(clean_text) <= chunk_size:
        return [clean_text]

    # Split into paragraphs first
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", clean_text) if p.strip()]
    chunks: List[str] = []
    current_chunk: List[str] = []
    current_length = 0

    for para in paragraphs:
        para_len = len(para)
        if current_length + para_len + 1 <= chunk_size:
            current_chunk.append(para)
            current_length += para_len + 1
        else:
            if current_chunk:
                merged = "\n\n".join(current_chunk)
                chunks.append(merged)
                # Keep tail for overlap if possible
                overlap_text = merged[-overlap:] if len(merged) > overlap else ""
                current_chunk = [overlap_text, para] if overlap_text else [para]
                current_length = sum(len(p) for p in current_chunk) + len(current_chunk) - 1
            else:
                # Individual paragraph exceeds chunk_size, split by sentences / sliding window
                start = 0
                while start < para_len:
                    end = min(start + chunk_size, para_len)
                    chunk_slice = para[start:end].strip()
                    if chunk_slice:
                        chunks.append(chunk_slice)
                    if end >= para_len:
                        break
                    start += (chunk_size - overlap)
                current_chunk = []
                current_length = 0

    if current_chunk:
        merged = "\n\n".join(current_chunk).strip()
        if merged and (not chunks or merged != chunks[-1]):
            chunks.append(merged)

    return chunks


def extract_text_from_file(file_path: Union[str, Path]) -> List[Tuple[int, str]]:
    """
    Extracts text from PDF or text/markdown documents.
    Returns list of (page_or_section_number, text) tuples.
    """
    p = Path(file_path).resolve()
    suffix = p.suffix.lower()

    if suffix == ".pdf":
        pages: List[Tuple[int, str]] = []
        # Attempt fitz / PyMuPDF
        try:
            import fitz
            doc = fitz.open(str(p))
            for idx, page in enumerate(doc):
                page_text = page.get_text()
                if page_text and page_text.strip():
                    pages.append((idx + 1, page_text.strip()))
            doc.close()
            if pages:
                return pages
        except Exception as exc:
            logger.debug("PyMuPDF extraction note: %s", exc)

        # Fallback binary stream extraction
        try:
            with open(p, "rb") as f:
                content = f.read()
            raw_text = content.decode("latin1", errors="ignore")
            # Extract PDF stream text
            stream_matches = re.findall(r"\((.*?)\)\s*Tj", raw_text)
            if stream_matches:
                extracted = " ".join(stream_matches)
                return [(1, extracted)]
            return [(1, raw_text[:20000])]
        except Exception as exc:
            logger.error("Failed to extract PDF contents from '%s': %s", p, exc)
            return []

    # Standard text, markdown, source code files
    try:
        with open(p, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
        return [(1, content)]
    except Exception as exc:
        logger.error("Failed reading file '%s': %s", p, exc)
        return []


class DocumentRAG:
    """
    Local-first Sovereign Document RAG System.
    Stores and retrieves document chunks with vector embeddings and BM25 FTS5 index.
    """

    def __init__(
        self,
        db_path: Optional[Union[str, Path]] = None,
        scope_guard: Optional[ScopeGuard] = None,
        default_namespace: str = "document_kb",
    ) -> None:
        self.store = SovereignMemoryStore(db_path=db_path, vector_dim=VECTOR_DIM)
        self.scope_guard = scope_guard or ScopeGuard()
        self.default_namespace = default_namespace

    def ingest_document(
        self,
        file_path: str,
        namespace: Optional[str] = None,
        chunk_size: int = 500,
        overlap: int = 50,
    ) -> Dict[str, Any]:
        """
        Ingests a document into the sovereign knowledge base.
        Validates path via ScopeGuard, splits into semantic chunks, generates embeddings,
        and saves chunks into SQLite WAL database.

        Args:
            file_path: Absolute or relative path to file.
            namespace: Target memory namespace (default 'document_kb').
            chunk_size: Max characters per chunk.
            overlap: Overlap characters between chunks.

        Returns:
            Status dictionary with chunk count and document SHA-256.
        """
        # Enforce ScopeGuard path containment and reject traversal
        raw_parts = re.split(r"[/\\]", str(file_path))
        if ".." in raw_parts or not self.scope_guard.validate_path(file_path):
            raise PermissionError(
                f"[SCOPE_GUARD] Path '{file_path}' violates filesystem containment perimeter."
            )

        target_path = str(Path(file_path).resolve())
        if not self.scope_guard.validate_path(target_path):
            raise PermissionError(
                f"[SCOPE_GUARD] Path '{target_path}' violates filesystem containment perimeter."
            )
        ns = (namespace or self.default_namespace).lower()

        if not os.path.exists(target_path):
            return {"success": False, "error": f"File does not exist: {target_path}"}

        # Calculate file SHA-256
        hasher = hashlib.sha256()
        file_size = os.path.getsize(target_path)
        with open(target_path, "rb") as f:
            while chunk := f.read(65536):
                hasher.update(chunk)
        file_hash = hasher.hexdigest()

        # Extract text sections
        pages = extract_text_from_file(target_path)
        if not pages:
            return {"success": False, "error": f"No extractable text found in '{target_path}'."}

        doc_name = Path(target_path).name
        total_chunks = 0
        ingested_ids: List[str] = []

        chunk_counter = 0
        for page_num, page_text in pages:
            text_slices = chunk_text(page_text, chunk_size=chunk_size, overlap=overlap)
            for chunk_content in text_slices:
                chunk_counter += 1
                chunk_id = f"doc_{file_hash[:12]}_{chunk_counter}"
                title = f"{doc_name} (Part {chunk_counter}, Page {page_num})"
                embedding = compute_embedding(chunk_content)

                meta = {
                    "source": "document_rag",
                    "file_path": target_path,
                    "file_name": doc_name,
                    "file_hash": file_hash,
                    "file_size": file_size,
                    "page": page_num,
                    "chunk_index": chunk_counter,
                }

                self.store.store_memory(
                    node_id=chunk_id,
                    title=title,
                    content=chunk_content,
                    namespace=ns,
                    embedding=embedding,
                    metadata=meta,
                )
                ingested_ids.append(chunk_id)
                total_chunks += 1

        logger.info("Ingested document '%s': %d chunks into namespace [%s]", doc_name, total_chunks, ns)

        return {
            "success": True,
            "file_path": target_path,
            "file_name": doc_name,
            "file_hash": file_hash,
            "file_size": file_size,
            "chunks_ingested": total_chunks,
            "chunk_ids": ingested_ids,
            "namespace": ns,
        }

    def query(
        self,
        query: str,
        top_k: int = 5,
        namespace: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Executes hybrid semantic vector and FTS5 keyword retrieval against the knowledge base.

        Args:
            query: User or agent search query.
            top_k: Number of highest ranking chunks to return.
            namespace: Memory namespace to search in (default 'document_kb').

        Returns:
            Ranked list of matching chunk dictionaries.
        """
        if not query or not query.strip():
            return []

        ns = (namespace or self.default_namespace).lower()

        # 1. Semantic Vector Search
        q_vec = compute_embedding(query)
        vector_results = self.store.search_semantic(query_embedding=q_vec, namespace=ns, top_k=top_k * 2)

        # 2. Keyword FTS5 Search
        fts_results = self.store.search_text(query=query, namespace=ns, limit=top_k * 2)

        # 3. Hybrid Reciprocal Rank Fusion / Score Normalization
        seen: Dict[str, Dict[str, Any]] = {}

        # Add vector results (cosine similarity is in range [-1, 1], higher is better)
        for rank, item in enumerate(vector_results):
            nid = item["id"]
            sim_score = item.get("score", 0.0)
            seen[nid] = {
                "id": nid,
                "title": item["title"],
                "content": item["content"],
                "metadata": item.get("metadata", {}),
                "score": sim_score,
                "file_path": item.get("metadata", {}).get("file_path", ""),
                "match_type": "semantic",
            }

        # Merge FTS5 results
        for rank, item in enumerate(fts_results):
            nid = item["id"]
            # FTS rank is BM25 (lower is better in SQLite FTS5)
            bm25_score = item.get("score", 0.0)
            bonus = 0.5 / (rank + 1.0)
            if nid in seen:
                seen[nid]["score"] += bonus
                seen[nid]["match_type"] = "hybrid"
            else:
                seen[nid] = {
                    "id": nid,
                    "title": item["title"],
                    "content": item["content"],
                    "metadata": item.get("metadata", {}),
                    "score": bonus,
                    "file_path": item.get("metadata", {}).get("file_path", ""),
                    "match_type": "keyword",
                }

        sorted_results = sorted(seen.values(), key=lambda x: x["score"], reverse=True)
        return sorted_results[:top_k]


# Global default instance
_default_rag = DocumentRAG()


@nexus_tool(
    name="ingest_document_to_kb",
    description="Ingests a local PDF or text document into SQLite WAL knowledge base with vector embeddings.",
    agent="SCOUT-01",
    requires_approval=False,
)
def ingest_document_to_kb(file_path: str, namespace: str = "document_kb") -> Dict[str, Any]:
    """Top-level convenience function to ingest a document into the sovereign knowledge base."""
    return _default_rag.ingest_document(file_path=file_path, namespace=namespace)


@nexus_tool(
    name="query_knowledge_base",
    description="Executes hybrid semantic vector and FTS5 keyword retrieval against the local document knowledge base.",
    agent="SCOUT-01",
    requires_approval=False,
)
def query_knowledge_base(query: str, top_k: int = 5, namespace: str = "document_kb") -> List[Dict[str, Any]]:
    """Top-level convenience function to query the sovereign knowledge base."""
    return _default_rag.query(query=query, top_k=top_k, namespace=namespace)
