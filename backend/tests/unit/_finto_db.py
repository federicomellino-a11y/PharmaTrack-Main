"""Un Mongo finto in memoria, quanto basta per i test unitari (niente rete)."""
from __future__ import annotations


def _valore(doc: dict, chiave: str):
    for parte in chiave.split("."):
        if not isinstance(doc, dict):
            return None
        doc = doc.get(parte)
    return doc


def corrisponde(doc: dict, filtro: dict) -> bool:
    for chiave, atteso in filtro.items():
        if chiave == "$or":
            if not any(corrisponde(doc, f) for f in atteso):
                return False
            continue
        valore = _valore(doc, chiave)
        if isinstance(atteso, dict):
            for op, arg in atteso.items():
                if op == "$in" and valore not in arg:
                    return False
                if op == "$ne" and valore == arg:
                    return False
                if op == "$lt" and not (valore is not None and valore < arg):
                    return False
                if op == "$regex":
                    import re
                    flag = re.IGNORECASE if "i" in atteso.get("$options", "") else 0
                    if not isinstance(valore, str) or not re.search(arg, valore, flag):
                        return False
        elif valore != atteso:
            return False
    return True


class _Cursore:
    def __init__(self, docs):
        self._docs = docs

    def sort(self, *_a, **_k):
        return self

    async def to_list(self, _n=None):
        return list(self._docs)

    def __aiter__(self):
        self._it = iter(self._docs)
        return self

    async def __anext__(self):
        try:
            return next(self._it)
        except StopIteration:
            raise StopAsyncIteration


class _Esito:
    def __init__(self, n):
        self.deleted_count = self.modified_count = n


class FintaCollezione:
    def __init__(self, nome):
        self.name = nome
        self.docs: list[dict] = []

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def find_one(self, filtro=None, *_a, **_k):
        return next((dict(d) for d in self.docs if corrisponde(d, filtro or {})), None)

    def find(self, filtro=None, *_a, **_k):
        return _Cursore([dict(d) for d in self.docs if corrisponde(d, filtro or {})])

    async def distinct(self, campo, filtro=None):
        return list({d.get(campo) for d in self.docs if corrisponde(d, filtro or {})})

    async def delete_many(self, filtro):
        prima = len(self.docs)
        self.docs = [d for d in self.docs if not corrisponde(d, filtro)]
        return _Esito(prima - len(self.docs))

    async def delete_one(self, filtro):
        for i, d in enumerate(self.docs):
            if corrisponde(d, filtro):
                del self.docs[i]
                return _Esito(1)
        return _Esito(0)

    async def update_one(self, filtro, modifica):
        for d in self.docs:
            if corrisponde(d, filtro):
                d.update(modifica.get("$set", {}))
                return _Esito(1)
        return _Esito(0)


class FintoDb:
    def __init__(self):
        self._collezioni: dict[str, FintaCollezione] = {}

    def __getattr__(self, nome):
        if nome.startswith("__"):
            raise AttributeError(nome)
        return self[nome]

    def __getitem__(self, nome):
        return self._collezioni.setdefault(nome, FintaCollezione(nome))

    def collezioni_non_vuote(self) -> dict:
        return {n: c.docs for n, c in self._collezioni.items() if c.docs}
