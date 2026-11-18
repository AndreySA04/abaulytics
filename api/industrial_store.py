"""SQLite records for the single industrial line."""

import hashlib
import hmac
import json
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from fastapi import HTTPException


ROLES = ("operador", "analista", "lider", "tecnico", "auditor")
PASSWORD_ITERATIONS = 600_000

SCHEMA = """
CREATE TABLE IF NOT EXISTS installation (
    id INTEGER PRIMARY KEY CHECK (id=1), mode TEXT NOT NULL, installation_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS account (
    id INTEGER PRIMARY KEY, badge TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('operador','analista','lider','tecnico','auditor')),
    salt BLOB NOT NULL, password BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS session (
    token_hash BLOB PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES account ON DELETE CASCADE,
    expires_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS login_attempt (
    badge_hash BLOB PRIMARY KEY, failures INTEGER NOT NULL, until_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY, action TEXT NOT NULL, role TEXT NOT NULL, at TEXT NOT NULL, detail TEXT
);
CREATE TABLE IF NOT EXISTS audit_actor (
    audit_id INTEGER PRIMARY KEY REFERENCES audit, account_id INTEGER NOT NULL REFERENCES account ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS production_order (
    number TEXT PRIMARY KEY, width_um INTEGER NOT NULL CHECK (width_um > 0),
    product TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('disponivel', 'encerrada')),
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS algorithm (
    version TEXT PRIMARY KEY, method TEXT NOT NULL, registered_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS calibration (
    id TEXT PRIMARY KEY, parameters TEXT NOT NULL, registered_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS configuration (
    id INTEGER PRIMARY KEY CHECK (id=1), version TEXT NOT NULL REFERENCES algorithm,
    calibration_id TEXT REFERENCES calibration
);
CREATE TABLE IF NOT EXISTS lot (
    id INTEGER PRIMARY KEY, line_id TEXT NOT NULL CHECK(line_id='linha-1'),
    order_number TEXT NOT NULL REFERENCES production_order,
    width_um INTEGER NOT NULL CHECK(width_um > 0), product TEXT NOT NULL,
    version TEXT NOT NULL REFERENCES algorithm, calibration_id TEXT NOT NULL REFERENCES calibration,
    started_at TEXT NOT NULL, ended_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_lot ON lot(line_id) WHERE ended_at IS NULL;
CREATE TABLE IF NOT EXISTS lot_operator (
    lot_id INTEGER PRIMARY KEY REFERENCES lot, account_id INTEGER NOT NULL REFERENCES account ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS sample (
    id INTEGER PRIMARY KEY, lot_id INTEGER NOT NULL REFERENCES lot,
    sequence INTEGER NOT NULL CHECK(sequence > 0 AND sequence % 50 = 0),
    observed_at TEXT NOT NULL, recorded_at TEXT NOT NULL,
    captured_at TEXT, deflection_um INTEGER CHECK(deflection_um >= 0),
    classification TEXT GENERATED ALWAYS AS (
        CASE WHEN deflection_um IS NULL THEN NULL
             WHEN deflection_um <= 12000 THEN 'conforme' ELSE 'nao_conforme' END
    ) STORED,
    failure TEXT, fingerprint BLOB NOT NULL,
    UNIQUE (lot_id, sequence),
    CHECK((deflection_um IS NOT NULL AND captured_at IS NOT NULL AND failure IS NULL)
        OR (deflection_um IS NULL AND failure IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS capture (
    sample_id INTEGER PRIMARY KEY REFERENCES sample, left_image BLOB NOT NULL, right_image BLOB NOT NULL,
    left_type TEXT NOT NULL, right_type TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS line_incident (
    id INTEGER PRIMARY KEY, lot_id INTEGER NOT NULL REFERENCES lot,
    expected INTEGER NOT NULL, received INTEGER NOT NULL, observed_at TEXT NOT NULL,
    UNIQUE(lot_id, expected, received)
);
CREATE TABLE IF NOT EXISTS report (
    id INTEGER PRIMARY KEY, format TEXT NOT NULL, filters TEXT NOT NULL,
    at TEXT NOT NULL, sample_cursor INTEGER NOT NULL, row_count INTEGER NOT NULL,
    content BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS report_author (
    report_id INTEGER PRIMARY KEY REFERENCES report, account_id INTEGER NOT NULL REFERENCES account ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS delivery (
    sample_id INTEGER PRIMARY KEY REFERENCES sample, attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt REAL NOT NULL DEFAULT 0, delivered_at TEXT
);
CREATE TABLE IF NOT EXISTS collector_health (id INTEGER PRIMARY KEY CHECK (id=1), at TEXT NOT NULL, buffered INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sample_time ON sample(coalesce(captured_at, observed_at), id);
CREATE TRIGGER IF NOT EXISTS sample_no_update BEFORE UPDATE ON sample
    BEGIN SELECT RAISE(ABORT, 'immutable sample'); END;
CREATE TRIGGER IF NOT EXISTS sample_no_delete BEFORE DELETE ON sample
    BEGIN SELECT RAISE(ABORT, 'immutable sample'); END;
CREATE TRIGGER IF NOT EXISTS capture_no_update BEFORE UPDATE ON capture
    BEGIN SELECT RAISE(ABORT, 'immutable capture'); END;
CREATE TRIGGER IF NOT EXISTS capture_no_delete BEFORE DELETE ON capture
    BEGIN SELECT RAISE(ABORT, 'immutable capture'); END;
CREATE TRIGGER IF NOT EXISTS lot_fixed_fields BEFORE UPDATE ON lot
    WHEN NEW.id IS NOT OLD.id OR NEW.line_id IS NOT OLD.line_id OR NEW.order_number IS NOT OLD.order_number
      OR NEW.width_um IS NOT OLD.width_um OR NEW.product IS NOT OLD.product OR NEW.version IS NOT OLD.version
      OR NEW.calibration_id IS NOT OLD.calibration_id OR NEW.started_at IS NOT OLD.started_at
      OR OLD.ended_at IS NOT NULL OR NEW.ended_at IS NULL
    BEGIN SELECT RAISE(ABORT, 'immutable lot metadata'); END;
CREATE TRIGGER IF NOT EXISTS lot_no_delete BEFORE DELETE ON lot
    BEGIN SELECT RAISE(ABORT, 'immutable lot'); END;
CREATE TRIGGER IF NOT EXISTS algorithm_no_update BEFORE UPDATE ON algorithm
    BEGIN SELECT RAISE(ABORT, 'immutable algorithm'); END;
CREATE TRIGGER IF NOT EXISTS algorithm_no_delete BEFORE DELETE ON algorithm
    BEGIN SELECT RAISE(ABORT, 'immutable algorithm'); END;
CREATE TRIGGER IF NOT EXISTS calibration_no_update BEFORE UPDATE ON calibration
    BEGIN SELECT RAISE(ABORT, 'immutable calibration'); END;
CREATE TRIGGER IF NOT EXISTS calibration_no_delete BEFORE DELETE ON calibration
    BEGIN SELECT RAISE(ABORT, 'immutable calibration'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit
    BEGIN SELECT RAISE(ABORT, 'immutable audit event'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit
    BEGIN SELECT RAISE(ABORT, 'immutable audit event'); END;
"""

READINGS = """
SELECT s.id, s.lot_id, s.sequence, s.observed_at, s.captured_at, s.recorded_at,
       s.deflection_um, s.classification, s.failure, l.order_number, l.product,
       l.width_um, l.version, l.calibration_id
FROM sample s JOIN lot l ON l.id=s.lot_id
"""


def utc(value=None):
    value = value or datetime.now(timezone.utc)
    if value.tzinfo is None:
        raise ValueError("Informe a data com fuso horário.")
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds")


def current_epoch():
    return datetime.now(timezone.utc).timestamp()


def micrometers(mm):
    return int((Decimal(str(mm)) * 1000).to_integral_value(rounding=ROUND_HALF_UP))


def password_hash(password, salt):
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)


def token_hash(token):
    return hashlib.sha256(token.encode("utf-8")).digest()


def audit(conn, action, actor=None, *, detail=None, role="servico"):
    cursor = conn.execute("INSERT INTO audit(action,role,at,detail) VALUES (?,?,?,?)",
                          (action, actor["role"] if actor else role, utc(), detail))
    if actor:
        conn.execute("INSERT INTO audit_actor VALUES (?,?)", (cursor.lastrowid, actor["id"]))


def filters_sql(filters):
    clauses, params = [], []
    for field, sql in (
        ("start", "coalesce(s.captured_at,s.observed_at)>=?"),
        ("end", "coalesce(s.captured_at,s.observed_at)<?"),
        ("order_number", "l.order_number=?"),
        ("product", "l.product=?"),
        ("classification", "s.classification=?"),
        ("width_um", "l.width_um=?"),
    ):
        if filters.get(field) is not None:
            clauses.append(sql)
            params.append(filters[field])
    return clauses, params


class DatabaseFile:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    @contextmanager
    def connection(self, *, write=False):
        conn = sqlite3.connect(self.path, isolation_level=None, timeout=4)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA foreign_keys=ON")
            conn.execute("PRAGMA synchronous=FULL")
            if write:
                conn.execute("BEGIN IMMEDIATE")
            yield conn
            if write:
                conn.commit()
        except BaseException:
            if write:
                conn.rollback()
            raise
        finally:
            conn.close()


class IndustrialStore(DatabaseFile):
    def __init__(self, path, mode):
        super().__init__(path)
        self.mode = mode
        with self.connection() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript(SCHEMA)
            conn.execute("INSERT OR IGNORE INTO installation VALUES (1,?,?)", (mode, secrets.token_hex(16)))
            installation = conn.execute("SELECT * FROM installation").fetchone()
            if installation["mode"] != mode:
                raise RuntimeError("O banco industrial pertence a outro ambiente.")
            self.installation_id = installation["installation_id"]
            conn.execute("INSERT OR IGNORE INTO algorithm VALUES ('estereo_v1','estereo_vertical_v1',?)", (utc(),))
            conn.execute("INSERT OR IGNORE INTO configuration(id,version) VALUES (1,'estereo_v1')")

    def provision(self, badge, name, role, password):
        if role not in ROLES or not 1 <= len(badge.strip()) <= 64 or not 1 <= len(name.strip()) <= 120:
            raise ValueError("Crachá, nome ou papel inválido.")
        if not 12 <= len(password) <= 128:
            raise ValueError("Use entre 12 e 128 caracteres na senha industrial.")
        salt = secrets.token_bytes(24)
        digest = password_hash(password, salt)
        with self.connection(write=True) as conn:
            conn.execute("INSERT INTO account(badge,name,role,salt,password) VALUES (?,?,?,?,?)",
                         (badge.strip(), name.strip(), role, salt, digest))
            audit(conn, "conta_provisionada", role="manutencao")

    def verify_credentials(self, badge, password, *, issue_session):
        now = current_epoch()
        key = token_hash(badge)
        with self.connection() as conn:
            account = conn.execute("SELECT * FROM account WHERE badge=?", (badge,)).fetchone()
            attempt = conn.execute("SELECT failures,until_at FROM login_attempt WHERE badge_hash=?", (key,)).fetchone()
        if attempt and attempt["failures"] >= 5 and attempt["until_at"] > now:
            raise HTTPException(429, "Aguarde antes de tentar novamente.")
        candidate = password_hash(password, account["salt"] if account else b"\x00" * 24)
        valid = hmac.compare_digest(candidate, account["password"] if account else b"\x00" * 32) and account is not None
        token = secrets.token_urlsafe(32) if valid and issue_session else None
        with self.connection(write=True) as conn:
            if valid:
                if not conn.execute("SELECT 1 FROM account WHERE id=? AND password=?", (account["id"], account["password"])).fetchone():
                    raise HTTPException(401, "Crachá ou senha inválidos.")
                conn.execute("DELETE FROM login_attempt WHERE badge_hash=? OR until_at<=?", (key, now))
                conn.execute("DELETE FROM session WHERE expires_at<=?", (now,))
                if token:
                    conn.execute("INSERT INTO session VALUES (?,?,?)", (token_hash(token), account["id"], now + 8 * 3600))
                audit(conn, "login" if token else "credencial_confirmada", account)
            else:
                conn.execute("""
                    INSERT INTO login_attempt VALUES (?,1,?)
                    ON CONFLICT(badge_hash) DO UPDATE SET failures=
                    CASE WHEN until_at>? THEN min(failures+1,5) ELSE 1 END, until_at=excluded.until_at
                """, (key, now + 60, now))
                audit(conn, "login_recusado", role="anonimo")
        if not valid:
            raise HTTPException(401, "Crachá ou senha inválidos.")
        return account, token

    def login(self, badge, password):
        account, token = self.verify_credentials(badge, password, issue_session=True)
        return {"token": token, "user": {field: account[field] for field in ("badge", "name", "role")}}

    def authenticate(self, token):
        with self.connection() as conn:
            row = conn.execute("""
                SELECT a.id,a.badge,a.name,a.role FROM session s JOIN account a ON a.id=s.account_id
                WHERE s.token_hash=? AND s.expires_at>?
            """, (token_hash(token), current_epoch())).fetchone()
        if row is None:
            raise HTTPException(401, "Entre no modo Produção.")
        return row

    def reading(self, conn, sample_id):
        row = conn.execute(READINGS + " WHERE s.id=?", (sample_id,)).fetchone()
        return dict(row) if row else None

    def query(self, conn, filters=None, *, before=None, after=None, ceiling=None, limit=100):
        clauses, params = filters_sql(filters or {})
        if before is not None:
            clauses.append("s.id<?")
            params.append(before)
        if after is not None:
            clauses.append("s.id>?")
            params.append(after)
        if ceiling is not None:
            clauses.append("s.id<=?")
            params.append(ceiling)
        where = " WHERE " + " AND ".join(clauses) if clauses else ""
        direction = "ASC" if after is not None else "DESC"
        return [dict(row) for row in conn.execute(READINGS + where + f" ORDER BY s.id {direction} LIMIT ?", (*params, limit))]

    def current_lot(self, conn):
        row = conn.execute("SELECT * FROM lot WHERE ended_at IS NULL").fetchone()
        return dict(row) if row else None

    def record_sample(self, *, lot_id, sequence, observed_at, captured_at, pair, failure, measure):
        fingerprint = hashlib.sha256(json.dumps([observed_at, captured_at, failure]).encode())
        if pair:
            for mime, content in pair:
                fingerprint.update(hashlib.sha256(mime.encode() + b"\x00" + content).digest())
        digest = fingerprint.digest()

        def existing(conn):
            row = conn.execute("SELECT id,fingerprint FROM sample WHERE lot_id=? AND sequence=?", (lot_id, sequence)).fetchone()
            if row and not hmac.compare_digest(row["fingerprint"], digest):
                raise HTTPException(409, "A amostra já foi registrada com outro conteúdo.")
            return self.reading(conn, row["id"]) if row else None

        with self.connection() as conn:
            if duplicate := existing(conn):
                return duplicate
            lot = conn.execute("""
                SELECT l.*,c.parameters,a.method FROM lot l JOIN calibration c ON c.id=l.calibration_id
                JOIN algorithm a ON a.version=l.version WHERE l.id=?
            """, (lot_id,)).fetchone()
        if not lot or observed_at < lot["started_at"] or lot["ended_at"] and observed_at > lot["ended_at"]:
            raise HTTPException(409, "A amostra não pertence ao período de um lote conhecido.")
        deflection = None
        if pair:
            try:
                deflection = measure(pair, json.loads(lot["parameters"]), lot["method"])
            except ValueError:
                failure = "imagem_inutilizavel"
        recorded_at = utc()
        with self.connection(write=True) as conn:
            if duplicate := existing(conn):
                return duplicate
            ended_at = conn.execute("SELECT ended_at FROM lot WHERE id=?", (lot_id,)).fetchone()["ended_at"]
            if ended_at and observed_at > ended_at:
                raise HTTPException(409, "A amostra foi registrada após o encerramento do lote.")
            sample_id = conn.execute("""
                INSERT INTO sample(lot_id,sequence,observed_at,recorded_at,captured_at,deflection_um,failure,fingerprint)
                VALUES (?,?,?,?,?,?,?,?)
            """, (lot_id, sequence, observed_at, recorded_at, captured_at, deflection, failure, digest)).lastrowid
            if pair:
                conn.execute("INSERT INTO capture VALUES (?,?,?,?,?)",
                             (sample_id, pair[0][1], pair[1][1], pair[0][0], pair[1][0]))
            if deflection is not None:
                conn.execute("INSERT INTO delivery(sample_id) VALUES (?)", (sample_id,))
            return self.reading(conn, sample_id)
