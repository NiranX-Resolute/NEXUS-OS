-- ==============================================================================
-- Nexus Companion: Daily Living Agent Database Schema (Cloudflare D1 SQLite)
-- 100% Zero-Cost Serverless SQLite Storage for Assistive Living
-- ==============================================================================

-- 1. User Accessibility Profile & Hardware Preferences
CREATE TABLE IF NOT EXISTS user_profile (
    id TEXT PRIMARY KEY DEFAULT 'default_user',
    name TEXT DEFAULT 'Nexus User',
    contrast_theme TEXT DEFAULT 'high-contrast-yellow' CHECK(contrast_theme IN ('high-contrast-yellow', 'dark-oled', 'light', 'pastel')),
    input_mode TEXT DEFAULT 'gaze' CHECK(input_mode IN ('gaze', 'switch', 'touch_mouse')),
    dwell_time_ms INTEGER DEFAULT 1200,
    switch_scan_speed_ms INTEGER DEFAULT 1500,
    speech_rate REAL DEFAULT 1.0,
    speech_pitch REAL DEFAULT 1.0,
    speech_voice TEXT DEFAULT '',
    emergency_contact_phone TEXT DEFAULT '',
    emergency_message TEXT DEFAULT 'Emergency assistance requested. Please check my location telemetry.',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Emergency Contacts Directory
CREATE TABLE IF NOT EXISTS emergency_contacts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    relationship TEXT DEFAULT 'Caregiver',
    phone TEXT NOT NULL,
    email TEXT,
    notify_method TEXT DEFAULT 'all' CHECK(notify_method IN ('sms', 'call', 'email', 'all')),
    priority INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Emergency SOS Dispatch Logs with Telemetry
CREATE TABLE IF NOT EXISTS emergency_alerts (
    id TEXT PRIMARY KEY,
    trigger_type TEXT NOT NULL CHECK(trigger_type IN ('gaze_dwell', 'switch_press', 'voice_sos', 'screen_tap')),
    latitude REAL,
    longitude REAL,
    accuracy_meters REAL,
    battery_level REAL,
    status TEXT DEFAULT 'dispatched' CHECK(status IN ('dispatched', 'acknowledged', 'resolved', 'cancelled')),
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Custom & Favorite AAC Communication Phrases
CREATE TABLE IF NOT EXISTS aac_phrases (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL CHECK(category IN ('needs', 'medical', 'feelings', 'routine', 'custom')),
    label TEXT NOT NULL,
    speak_text TEXT NOT NULL,
    icon_symbol TEXT NOT NULL,
    is_favorite INTEGER DEFAULT 0,
    usage_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Daily Living Routine Cue Cards & Reminders
CREATE TABLE IF NOT EXISTS daily_routines (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    time_of_day TEXT NOT NULL, -- e.g. "08:00", "13:00", "20:00"
    category TEXT DEFAULT 'medication' CHECK(category IN ('medication', 'hydration', 'meal', 'exercise', 'task')),
    audio_cue_text TEXT NOT NULL,
    visual_icon TEXT DEFAULT '💊',
    is_completed_today INTEGER DEFAULT 0,
    last_completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. Visual Scene & Object Description History
CREATE TABLE IF NOT EXISTS scene_logs (
    id TEXT PRIMARY KEY,
    detected_category TEXT DEFAULT 'general' CHECK(detected_category IN ('medication', 'household', 'obstacle', 'reading', 'general')),
    high_level_summary TEXT NOT NULL,
    detailed_description TEXT,
    safety_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indices for rapid edge queries
CREATE INDEX IF NOT EXISTS idx_alerts_status ON emergency_alerts(status, created_at);
CREATE INDEX IF NOT EXISTS idx_aac_category ON aac_phrases(category, usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_routines_time ON daily_routines(time_of_day);

-- Initial Seed Data: Emergency Contacts & Default Essential AAC Tiles
INSERT OR IGNORE INTO user_profile (id, name, contrast_theme, input_mode, dwell_time_ms)
VALUES ('default_user', 'Nexus User', 'high-contrast-yellow', 'gaze', 1200);

INSERT OR IGNORE INTO emergency_contacts (id, name, relationship, phone, email, priority)
VALUES 
('cnt_01', 'Primary Caregiver', 'Family / Nurse', '+1-800-555-0199', 'caregiver@nexus.local', 1),
('cnt_02', 'Emergency Services', 'First Responder', '911', 'dispatch@local.gov', 2);

INSERT OR IGNORE INTO daily_routines (id, title, description, time_of_day, category, audio_cue_text, visual_icon)
VALUES
('rtn_01', 'Morning Hydration', 'Drink 1 glass of fresh water.', '08:00', 'hydration', 'Time for morning hydration. Please drink a glass of fresh water.', '💧'),
('rtn_02', 'Morning Medication', 'Take prescribed morning medicine.', '09:00', 'medication', 'Medication reminder. Please take your prescribed morning pills with water.', '💊'),
('rtn_03', 'Afternoon Movement', 'Stretching or repositioning exercise.', '14:00', 'exercise', 'Afternoon routine. Let us do gentle stretching or posture adjustment.', '🧘'),
('rtn_04', 'Evening Medication & Rest', 'Take evening dose and prepare for sleep.', '21:00', 'medication', 'Evening care reminder. Time for evening medication and winding down.', '🌙');
