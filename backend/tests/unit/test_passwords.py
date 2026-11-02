"""Test del hashing password: correttezza e costo sotto controllo."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from app.core.passwords import (  # noqa: E402
    DEFAULT_ROUNDS,
    hash_password,
    needs_rehash,
    rounds_of,
    verify_password,
)


def test_hash_e_verifica():
    hashed = hash_password("Test1234!", rounds=4)  # costo basso: il test deve durare millisecondi
    assert verify_password("Test1234!", hashed) is True
    assert verify_password("sbagliata", hashed) is False


def test_hash_diversi_per_la_stessa_password():
    # Il sale casuale impedisce di riconoscere due utenti con la stessa password.
    assert hash_password("uguale", rounds=4) != hash_password("uguale", rounds=4)


def test_costo_letto_dall_hash():
    assert rounds_of(hash_password("x", rounds=4)) == 4
    assert rounds_of("non-un-hash") == 0


def test_needs_rehash_confronta_col_costo_attuale():
    assert needs_rehash(hash_password("x", rounds=12)) is True   # troppo costoso per questa CPU
    assert needs_rehash(hash_password("x", rounds=4)) is True    # troppo debole
    assert needs_rehash(hash_password("x", rounds=DEFAULT_ROUNDS)) is False


def test_hash_corrotto_non_esplode():
    assert verify_password("x", "spazzatura") is False
