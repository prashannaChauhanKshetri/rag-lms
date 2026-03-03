-- Migration 003: Add human-readable display_id columns
-- These are SHORT, readable identifiers shown in the UI.
-- Internal UUIDs remain as PKs/FKs — no FK changes needed.
-- ── users ──────────────────────────────────────────────
ALTER TABLE users
ADD COLUMN IF NOT EXISTS display_id TEXT UNIQUE;
-- Back-fill existing users: role prefix + seq number per role
DO $$
DECLARE rec RECORD;
seq_num INT;
BEGIN FOR rec IN
SELECT id,
    role,
    ROW_NUMBER() OVER (
        PARTITION BY role
        ORDER BY created_at
    ) AS rn
FROM users
WHERE display_id IS NULL LOOP seq_num := rec.rn;
CASE
    rec.role
    WHEN 'student' THEN
    UPDATE users
    SET display_id = 'STU' || LPAD(seq_num::TEXT, 3, '0')
    WHERE id = rec.id;
WHEN 'instructor' THEN
UPDATE users
SET display_id = 'TCH' || LPAD(seq_num::TEXT, 3, '0')
WHERE id = rec.id;
WHEN 'admin' THEN
UPDATE users
SET display_id = 'ADM' || LPAD(seq_num::TEXT, 3, '0')
WHERE id = rec.id;
WHEN 'super_admin' THEN
UPDATE users
SET display_id = 'SYS' || LPAD(seq_num::TEXT, 3, '0')
WHERE id = rec.id;
ELSE
UPDATE users
SET display_id = 'USR' || LPAD(seq_num::TEXT, 3, '0')
WHERE id = rec.id;
END CASE
;
END LOOP;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_users_display_id ON users(display_id);
-- ── chatbots (courses / subjects) ──────────────────────
ALTER TABLE chatbots
ADD COLUMN IF NOT EXISTS display_id TEXT UNIQUE;
DO $$
DECLARE rec RECORD;
seq_num INT;
abbrev TEXT;
BEGIN FOR rec IN
SELECT id,
    name,
    ROW_NUMBER() OVER (
        ORDER BY created_at
    ) AS rn
FROM chatbots
WHERE display_id IS NULL LOOP -- Take first 3 uppercase letters of the name (strip spaces)
    abbrev := UPPER(
        REGEXP_REPLACE(
            SUBSTRING(
                rec.name
                FROM 1 FOR 6
            ),
            '[^A-Za-z]',
            '',
            'g'
        )
    );
abbrev := SUBSTRING(
    abbrev
    FROM 1 FOR 3
);
IF LENGTH(abbrev) < 2 THEN abbrev := 'BOT';
END IF;
seq_num := rec.rn;
UPDATE chatbots
SET display_id = abbrev || LPAD(seq_num::TEXT, 3, '0')
WHERE id = rec.id;
END LOOP;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_chatbots_display_id ON chatbots(display_id);
-- ── sections ───────────────────────────────────────────
ALTER TABLE sections
ADD COLUMN IF NOT EXISTS display_id TEXT UNIQUE;
DO $$
DECLARE rec RECORD;
seq_num INT;
BEGIN FOR rec IN
SELECT id,
    ROW_NUMBER() OVER (
        ORDER BY created_at
    ) AS rn
FROM sections
WHERE display_id IS NULL LOOP seq_num := rec.rn;
UPDATE sections
SET display_id = 'SEC' || LPAD(seq_num::TEXT, 3, '0')
WHERE id = rec.id;
END LOOP;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_sections_display_id ON sections(display_id);
-- ── classes ────────────────────────────────────────────
ALTER TABLE classes
ADD COLUMN IF NOT EXISTS display_id TEXT UNIQUE;
DO $$
DECLARE rec RECORD;
seq_num INT;
BEGIN FOR rec IN
SELECT id,
    ROW_NUMBER() OVER (
        ORDER BY created_at
    ) AS rn
FROM classes
WHERE display_id IS NULL LOOP seq_num := rec.rn;
UPDATE classes
SET display_id = 'CLS' || LPAD(seq_num::TEXT, 3, '0')
WHERE id = rec.id;
END LOOP;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_classes_display_id ON classes(display_id);
DO $$ BEGIN RAISE NOTICE 'Migration 003: readable display_id columns added successfully.';
END $$;