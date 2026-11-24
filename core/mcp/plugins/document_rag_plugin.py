"""Nexus OS v5.0 - Document RAG MCP Plugin.

Exposes local document ingestion and hybrid vector / FTS5 retrieval tools
to the MCP plugin mesh and Gemini Live assistant with zero manual schema drift.
Part of the Nexus Edge-to-Desktop Autonomous Engine.
"""

from __future__ import annotations

from core.memory.document_rag import ingest_document_to_kb, query_knowledge_base

__all__ = ["ingest_document_to_kb", "query_knowledge_base"]
