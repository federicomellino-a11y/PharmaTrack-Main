"""Hashing delle password in un solo posto.

Perche' esiste: il login costava 1,8 secondi perche' bcrypt girava con costo 12
sull'istanza Render, che ha una CPU lenta. Il costo e' un parametro, non una
costante sacra: qui si sceglie una volta, e le password gia' salvate con un
costo diverso vengono ri-hashate al primo login riuscito senza chiedere nulla
all'utente.
"""
import bcrypt

# Costo di default per le password nuove. Bcrypt conta in modo esponenziale:
# 10 costa circa un quarto di 12. Resta sopra il minimo raccomandato da OWASP.
DEFAULT_ROUNDS = 10

# Sotto questo costo un hash e' troppo debole e va aggiornato al primo login.
MIN_ACCEPTABLE_ROUNDS = 10


def hash_password(password: str, rounds: int = DEFAULT_ROUNDS) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=rounds)).decode()


def rounds_of(hashed: str) -> int:
    """Costo dichiarato nell'hash, tipo '$2b$12$...' -> 12."""
    try:
        return int(str(hashed).split("$")[2])
    except (IndexError, ValueError):
        return 0


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), str(hashed).encode())
    except (ValueError, TypeError):
        return False


def needs_rehash(hashed: str) -> bool:
    """Vero se l'hash e' piu' costoso o piu' debole del costo attuale."""
    return rounds_of(hashed) != DEFAULT_ROUNDS
