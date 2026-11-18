"""Set a replacement password in the LOCAL app database, with the app stopped."""
import argparse
from getpass import GetPassWarning, getpass
import hashlib
import secrets
import sqlite3
import warnings
from pathlib import Path
from datetime import datetime, timezone


def replace_password(database, user_id, password):
    if not Path(database).is_file():
        raise ValueError('Banco local não encontrado')
    if not 8 <= len(password.encode('utf-16-le')) // 2 <= 128:
        raise ValueError('Use uma senha entre 8 e 128 caracteres.')
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 600_000)
    encoded = f'pbkdf2-sha256$600000${salt.hex()}${digest.hex()}'
    with sqlite3.connect(database) as db:
        db.execute('PRAGMA foreign_keys = ON')
        db.execute('BEGIN IMMEDIATE')
        if not db.execute('SELECT id FROM users WHERE id=?', (user_id,)).fetchone():
            raise ValueError('Conta não encontrada')
        db.execute('UPDATE users SET password_hash=? WHERE id=?', (encoded, user_id))
        event = db.execute("INSERT INTO audit_events(actor_role, action, outcome, created_at) VALUES ('maintenance', 'password_reset', 'success', ?)", (datetime.now(timezone.utc).isoformat(),))
        db.execute('INSERT INTO audit_identity(event_id, user_id) VALUES (?, ?)', (event.lastrowid, user_id))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', required=True)
    parser.add_argument('--user-id', type=int, required=True)
    args = parser.parse_args()
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', GetPassWarning)
            password = getpass('Nova senha: ')
            if password != getpass('Confirme a senha: '):
                raise ValueError('As senhas não coincidem.')
        replace_password(args.db, args.user_id, password)
    except (GetPassWarning, EOFError):
        parser.error('Use um terminal interativo para digitar a senha sem exibi-la.')
    except (ValueError, sqlite3.Error) as error:
        parser.error(str(error))
    print('Senha atualizada. Entre com e-mail e senha na tela de login.')
