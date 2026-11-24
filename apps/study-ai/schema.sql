-- ==============================================================================
-- Cloudflare D1 Serverless Database Schema: EduNexus & Unified Auth Bridge
-- Database: edunexus-db (1a94bd51-d272-48c9-a70d-4110a76b086e)
-- 100% Free Tier Edge Storage for Users, Sessions, Magic Links & Study Ecosystem
-- ==============================================================================

-- 1. Users Table (Identity & Authentication Bridge)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    pass_hash TEXT NOT NULL,
    salt_hex TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student', 'educator', 'operator', 'architect')),
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- 2. Sessions Table (Universal JWT / Edge Bearer Tokens)
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_email TEXT NOT NULL,
    device_info TEXT,
    ip_address TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. Passwordless Magic Links
CREATE TABLE IF NOT EXISTS magic_links (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    redirect_url TEXT DEFAULT '/',
    expires_at TIMESTAMP NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Password Reset Requests
CREATE TABLE IF NOT EXISTS password_resets (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Email Dispatch Logs (Sent from: lead-engineer@nexus.internal)
CREATE TABLE IF NOT EXISTS email_logs (
    id TEXT PRIMARY KEY,
    to_email TEXT NOT NULL,
    from_email TEXT NOT NULL DEFAULT 'lead-engineer@nexus.internal',
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT NOT NULL,
    action_type TEXT NOT NULL CHECK(action_type IN ('MAGIC_LINK', 'PASSWORD_RESET', 'WELCOME', 'SESSION_SYNC')),
    status TEXT NOT NULL DEFAULT 'DELIVERED',
    preview_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Ingested Textbooks, Lecture Notes, Slides, and Readings
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    title TEXT NOT NULL,
    subject TEXT DEFAULT 'General',
    raw_content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 7. AI-Curated Study Materials (Structured Summaries, Flashcard Decks, Practice Quizzes)
CREATE TABLE IF NOT EXISTS study_materials (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    material_type TEXT NOT NULL CHECK(material_type IN ('SUMMARY', 'FLASHCARDS', 'QUIZ')),
    content_json TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- 8. Spaced Repetition Leitner Box Engine (Boxes 1 to 5)
CREATE TABLE IF NOT EXISTS spaced_repetition_cards (
    id TEXT PRIMARY KEY,
    material_id TEXT NOT NULL,
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    box_level INTEGER NOT NULL DEFAULT 1 CHECK(box_level BETWEEN 1 AND 5),
    next_review_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (material_id) REFERENCES study_materials(id) ON DELETE CASCADE
);

-- 9. Socratic Voice Tutor Dialogue & Session History
CREATE TABLE IF NOT EXISTS tutor_sessions (
    id TEXT PRIMARY KEY,
    document_id TEXT,
    user_id TEXT,
    user_query TEXT NOT NULL,
    tutor_response TEXT NOT NULL,
    socratic_question TEXT,
    persona TEXT DEFAULT 'Socratic Tutor',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 10. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_magic_token ON magic_links(token);
CREATE INDEX IF NOT EXISTS idx_reset_token ON password_resets(token);
CREATE INDEX IF NOT EXISTS idx_email_logs_to ON email_logs(to_email);
CREATE INDEX IF NOT EXISTS idx_documents_subject ON documents(subject);
CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_materials_doc ON study_materials(document_id);
CREATE INDEX IF NOT EXISTS idx_cards_material ON spaced_repetition_cards(material_id);
CREATE INDEX IF NOT EXISTS idx_cards_review ON spaced_repetition_cards(next_review_at ASC);
CREATE INDEX IF NOT EXISTS idx_cards_box ON spaced_repetition_cards(box_level);
