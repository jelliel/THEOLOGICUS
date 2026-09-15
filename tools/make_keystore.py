# -*- coding: utf-8 -*-
"""Genere un keystore PKCS12 de signature release pour THEOLOGICUS (Android).

Equivalent a keytool -genkeypair (absent de cette machine, pas de JDK) :
cree une cle RSA 2048 + certificat auto-signe 30 ans, emballe en PKCS12.

Usage :
  py tools/make_keystore.py                     # android/release.keystore + mot de passe aleatoire
  py tools/make_keystore.py <fichier> <pass>    # fichier et mot de passe personnalises
  py tools/make_keystore.py --b64 <fichier> <pass>   # imprime le contenu en base64 (pour le secret CI)
"""
import base64
import datetime
import secrets
import sys

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

DEFAULT_PATH = "android/release.keystore"
ALIAS = "theologicus"
VALIDITY_DAYS = 30 * 365  # 30 ans


def generate(path, password):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "THEOLOGICUS"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "THEOLOGICUS"),
        x509.NameAttribute(NameOID.COUNTRY_NAME, "FR"),
    ])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + datetime.timedelta(days=VALIDITY_DAYS))
        .sign(key, hashes.SHA256())
    )
    data = pkcs12.serialize_key_and_certificates(
        name=ALIAS.encode(),
        key=key,
        cert=cert,
        cas=None,
        encryption_algorithm=serialization.BestAvailableEncryption(password.encode()),
    )
    with open(path, "wb") as f:
        f.write(data)
    return len(data)


def main(argv):
    if len(argv) >= 3 and argv[1] == "--b64":
        with open(argv[2], "rb") as f:
            print(base64.b64encode(f.read()).decode())
        return 0
    path = argv[1] if len(argv) >= 2 else DEFAULT_PATH
    password = argv[2] if len(argv) >= 3 else secrets.token_urlsafe(18)
    size = generate(path, password)
    print("keystore : %s (%d octets, alias %s, PKCS12, validite 30 ans)" % (path, size, ALIAS))
    print("password : %s" % password)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
