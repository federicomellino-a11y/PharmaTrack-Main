"""Le sessioni della farmacia convivono e si leggono in elenco.

Prima ogni login cancellava tutte le sessioni dell'utente: entrare dal telefono
buttava fuori il PC del banco. Le sessioni ora restano, e Impostazioni le mostra
con un nome riconoscibile.
"""
from app.routers.pharmacy_auth import _etichetta_dispositivo, _id_sessione

CHROME_PC = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
             "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
SAFARI_IPHONE = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 "
                 "(KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1")
CHROME_ANDROID = ("Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36")


def test_il_pc_del_banco_si_riconosce():
    assert _etichetta_dispositivo(CHROME_PC) == "PC Windows · Chrome"


def test_l_iphone_non_viene_scambiato_per_un_mac():
    assert _etichetta_dispositivo(SAFARI_IPHONE) == "iPhone · Safari"


def test_l_android_non_viene_scambiato_per_un_pc_linux():
    assert _etichetta_dispositivo(CHROME_ANDROID) == "Android · Chrome"


def test_senza_user_agent_non_si_inventa_niente():
    assert _etichetta_dispositivo("") == "Dispositivo sconosciuto"
    assert _etichetta_dispositivo(None) == "Dispositivo sconosciuto"


def test_l_id_pubblico_non_e_il_token():
    token = "sess_abcdef123456"
    identificativo = _id_sessione(token)
    assert token not in identificativo
    assert len(identificativo) == 12
    assert _id_sessione(token) == identificativo
    assert _id_sessione("sess_altro") != identificativo
