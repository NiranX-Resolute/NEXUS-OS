"""Initializes and ensures all schema tables exist in ~/.nexus-agent/db/agent_local.db."""
from pathlib import Path
import sqlite3
import sys

def init_agent_local_db(db_path: Path | None = None) -> Path:
    if db_path is None:
        db_path = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(db_path), timeout=10.0)
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")

    # 1. Tasks Queue & Multi-Device Execution Log Table
    conn.execute("""
    CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        source_device TEXT NOT NULL DEFAULT 'DESKTOP',
        target_device TEXT NOT NULL DEFAULT 'DESKTOP',
        command_type TEXT NOT NULL,
        prompt_raw TEXT NOT NULL,
        action_plan TEXT,
        media_blob TEXT,
        status TEXT NOT NULL DEFAULT 'QUEUED',
        result_output TEXT,
        execution_log TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
    );
    """)

    # 2. Telemetry Logs Table
    conn.execute("""
    CREATE TABLE IF NOT EXISTS telemetry_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        level TEXT NOT NULL DEFAULT 'INFO',
        message TEXT NOT NULL,
        latency_ms REAL DEFAULT 0,
        metadata TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 3. System Settings & Consensus State
    conn.execute("""
    CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 4. Devices Registry
    conn.execute("""
    CREATE TABLE IF NOT EXISTS devices (
        device_id TEXT PRIMARY KEY,
        device_type TEXT NOT NULL DEFAULT 'DESKTOP',
        device_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ONLINE',
        battery_level INTEGER DEFAULT 100,
        last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 5. Audio Events Table (for real VAD / speech audio events)
    conn.execute("""
    CREATE TABLE IF NOT EXISTS audio_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        transcription TEXT,
        energy_rms REAL DEFAULT 0,
        duration_ms REAL DEFAULT 0,
        barge_in INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 6. Media State Table (for real GSMTC & CoreAudio state)
    conn.execute("""
    CREATE TABLE IF NOT EXISTS media_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        title TEXT,
        artist TEXT,
        is_playing INTEGER DEFAULT 0,
        volume REAL DEFAULT 0.5,
        is_muted INTEGER DEFAULT 0,
        peak_level REAL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Insert default media_state row if missing
    conn.execute("""
    INSERT OR IGNORE INTO media_state (id, title, artist, is_playing, volume, is_muted, peak_level)
    VALUES (1, 'System Audio', 'Active Transport', 0, 0.5, 0, 0.0);
    """)

    conn.commit()
    conn.close()
    return db_path

if __name__ == "__main__":
    p = init_agent_local_db()
    print(f"agent_local.db initialized at: {p}")
