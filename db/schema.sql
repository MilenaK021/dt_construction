CREATE TABLE IF NOT EXISTS projects (
    id          SERIAL PRIMARY KEY,
    odoo_id     INTEGER UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    start_date  DATE,
    end_date    DATE,
    status      TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS tasks (
    id              SERIAL PRIMARY KEY,
    odoo_id         INTEGER UNIQUE NOT NULL,
    project_id      INTEGER,
    name            TEXT NOT NULL,
    planned_start   DATE,
    planned_end     DATE,
    actual_end      DATE,
    progress        FLOAT DEFAULT 0.0,
    assigned_user   INTEGER,
    status          TEXT DEFAULT 'draft'
);

CREATE TABLE IF NOT EXISTS task_dependencies (
    task_id         INTEGER,
    depends_on_id   INTEGER,
    PRIMARY KEY (task_id, depends_on_id)
);

CREATE TABLE IF NOT EXISTS reports (
    id              SERIAL PRIMARY KEY,
    task_id         INTEGER,
    employee_id     INTEGER,
    submitted_at    TIMESTAMP DEFAULT NOW(),
    content         TEXT,
    status          TEXT DEFAULT 'pending',
    feedback        TEXT
);

CREATE TABLE IF NOT EXISTS meetings (
    id              SERIAL PRIMARY KEY,
    project_id      INTEGER,
    scheduled_at    TIMESTAMP,
    type            TEXT,
    summary         TEXT,
    created_at      TIMESTAMP DEFAULT NOW()
);