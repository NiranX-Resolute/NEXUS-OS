-- ==============================================================================
-- Nexus Scholar: Accessible Student Studio Database Schema (Cloudflare D1)
-- 100% Zero-Cost Serverless SQLite Storage for Accessible EdTech
-- ==============================================================================

-- 1. Ingested Documents & Textbooks
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    course_name TEXT DEFAULT 'General Study',
    subject TEXT DEFAULT 'Science',
    raw_text TEXT NOT NULL,
    file_type TEXT DEFAULT 'pdf' CHECK(file_type IN ('pdf', 'txt', 'markdown', 'notes')),
    word_count INTEGER DEFAULT 0,
    page_count INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Accessible Study Notes & Micro-Chunks
CREATE TABLE IF NOT EXISTS accessible_notes (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    section_title TEXT NOT NULL,
    concept_summary TEXT NOT NULL,
    bionic_text TEXT,
    audio_walkthrough_text TEXT,
    duration_minutes INTEGER DEFAULT 3,
    chunk_order INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Flashcards with Leitner 5-Box Spaced Repetition Tracking
CREATE TABLE IF NOT EXISTS flashcards (
    id TEXT PRIMARY KEY,
    document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    difficulty TEXT DEFAULT 'medium' CHECK(difficulty IN ('easy', 'medium', 'hard')),
    box_level INTEGER DEFAULT 1 CHECK(box_level BETWEEN 1 AND 5),
    next_review_due DATETIME DEFAULT CURRENT_TIMESTAMP,
    review_count INTEGER DEFAULT 0,
    last_reviewed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Sonified Diagrams & Formula Walkthroughs
CREATE TABLE IF NOT EXISTS sonified_diagrams (
    id TEXT PRIMARY KEY,
    document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    diagram_type TEXT DEFAULT 'chart' CHECK(diagram_type IN ('chart', 'formula', 'anatomy', 'circuit', 'graph', 'process')),
    high_level_summary TEXT NOT NULL,
    granular_breakdown TEXT NOT NULL, -- JSON array of bullet points
    exam_takeaway TEXT NOT NULL,
    audio_walkthrough_text TEXT NOT NULL,
    formula_latex TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Non-Verbal 4-Tile Quiz Questions
CREATE TABLE IF NOT EXISTS quiz_questions (
    id TEXT PRIMARY KEY,
    document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_option TEXT NOT NULL CHECK(correct_option IN ('A', 'B', 'C', 'D')),
    explanation TEXT NOT NULL,
    icon_a TEXT DEFAULT '🅰️',
    icon_b TEXT DEFAULT '🅱️',
    icon_c TEXT DEFAULT '🅲',
    icon_d TEXT DEFAULT '🅳',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. Exam & Practice Attempts Telemetry
CREATE TABLE IF NOT EXISTS exam_attempts (
    id TEXT PRIMARY KEY,
    document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    total_questions INTEGER NOT NULL,
    input_method TEXT DEFAULT 'gaze' CHECK(input_method IN ('gaze', 'switch', 'voice', 'touch')),
    time_spent_secs INTEGER DEFAULT 0,
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_flashcards_review ON flashcards(box_level, next_review_due);
CREATE INDEX IF NOT EXISTS idx_notes_doc ON accessible_notes(document_id, chunk_order);
CREATE INDEX IF NOT EXISTS idx_diagrams_type ON sonified_diagrams(diagram_type);

-- Initial High-Yield Sample Study Decks
INSERT OR IGNORE INTO documents (id, title, course_name, subject, raw_text, word_count, page_count)
VALUES (
    'doc_bio_01', 
    'Cellular Respiration & ATP Synthesis', 
    'Biology 101', 
    'Cellular Biology',
    'Cellular respiration is a series of chemical reactions that break down glucose to produce ATP. The process comprises Glycolysis in the cytoplasm, the Citric Acid (Krebs) Cycle in the mitochondrial matrix, and Oxidative Phosphorylation along the inner mitochondrial membrane. The electron transport chain uses electron transfer from NADH and FADH2 to create a proton gradient that drives ATP synthase, yielding approximately 30-32 ATP molecules per glucose.',
    70,
    1
);

INSERT OR IGNORE INTO flashcards (id, document_id, question, answer, difficulty, box_level)
VALUES
('fc_01', 'doc_bio_01', 'Where does glycolysis occur in eukaryotic cells?', 'In the cytoplasm (cytosol). It does not require oxygen.', 'easy', 1),
('fc_02', 'doc_bio_01', 'What enzyme drives the phosphorylation of ADP to ATP via the proton gradient?', 'ATP Synthase located on the inner mitochondrial membrane.', 'medium', 1),
('fc_03', 'doc_bio_01', 'What are the two primary electron carriers delivering electrons to the ETC?', 'NADH and FADH2.', 'hard', 1);

INSERT OR IGNORE INTO sonified_diagrams (id, document_id, title, diagram_type, high_level_summary, granular_breakdown, exam_takeaway, audio_walkthrough_text)
VALUES (
    'diag_01',
    'doc_bio_01',
    'Mitochondrial Electron Transport Chain',
    'process',
    'A cross-sectional diagram illustrating the inner mitochondrial membrane with Complex I, II, III, IV, and ATP Synthase embedded.',
    '["Protons (H+) are pumped from mitochondrial matrix into intermembrane space across Complexes I, III, and IV.", "Electrons flow from NADH and FADH2 down the electrochemical gradient to oxygen.", "Oxygen acts as the terminal electron acceptor, forming water (H2O).", "Protons flow back into the matrix through ATP Synthase rotor."]',
    'If oxygen is absent, the electron transport chain halts, stopping oxidative ATP production.',
    'Diagram Audio Walkthrough: A cross-sectional diagram illustrating the inner mitochondrial membrane. Complex I through IV pump protons into the intermembrane space. Electrons flow to terminal oxygen forming water. Finally, the proton gradient turns ATP Synthase to generate high-yield cellular energy.'
);
