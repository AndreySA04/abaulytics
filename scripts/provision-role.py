"""Offline maintenance against a copied LOCAL app database; never expose as an HTTP endpoint."""
import argparse
import sqlite3
from pathlib import Path
from datetime import datetime, timezone

def provision(database, user_id, role):
    if not Path(database).is_file():
        raise ValueError("Banco local não encontrado; informe uma cópia existente")
    with sqlite3.connect(database) as db:
        db.execute("PRAGMA foreign_keys = ON")
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT role FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise ValueError("Conta não encontrada")
        if role not in ("operador", "auditor"):
            raise ValueError("Perfil inválido")
        if row[0] == role:
            return False
        db.execute("UPDATE users SET role = ? WHERE id = ?", (role, user_id))
        event = db.execute(
            "INSERT INTO audit_events(actor_role, action, outcome, created_at) VALUES ('maintenance', 'role_changed', 'success', ?)",
            (datetime.now(timezone.utc).isoformat(),))
        # This association identifies the affected account; actor_role identifies offline maintenance.
        db.execute("INSERT INTO audit_identity(event_id, user_id) VALUES (?, ?)", (event.lastrowid, user_id))
        return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", required=True)
    parser.add_argument("--user-id", type=int, required=True)
    parser.add_argument("--role", choices=["operador", "auditor"], required=True)
    args = parser.parse_args()
    print("Perfil atualizado." if provision(args.db, args.user_id, args.role) else "Perfil já configurado.")
