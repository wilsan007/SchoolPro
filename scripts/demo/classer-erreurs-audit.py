#!/usr/bin/env python3
"""Classe les erreurs console relevées : défaut applicatif, ou artefact de l'audit ?

POURQUOI CE FILTRE
L'audit bloque volontairement les écritures (`ERR_BLOCKED_BY_CLIENT`) et tourne
contre un serveur de développement (`WebSocket HMR`). Ces deux messages polluent
le rapport : les compter comme des défauts ferait passer 77 écrans pour cassés
alors qu'ils fonctionnent. Ce script sépare ce qui appartient à l'application de
ce qui appartient à l'instrument de mesure.
"""
import json
import os
from collections import Counter

RAPPORTS = [
    "audit-reports/ui-complet.json",
    "audit-reports/ui-complet-suite.json",
    "audit-reports/ui-complet-final.json",
]

# Artefacts : produits PAR l'audit lui-même, pas par l'application.
ARTEFACTS = [
    "ERR_BLOCKED_BY_CLIENT",      # garde-fou réseau de l'audit
    "webpack-hmr",                # serveur de développement uniquement
    "WebSocket connection to",    # idem
    "the server responded with a status of 403 (Forbidden)",  # API refusée au rôle
]

# Défauts applicatifs : le code de l'application est en cause.
DEFAILLANCES = {
    "Hydration failed": "Hydratation React incohérente (serveur ≠ client)",
    "hydrated but some attributes": "Hydratation React incohérente (attributs)",
    "MISSING_MESSAGE": "Clé i18n absente du catalogue",
    "application error": "Erreur serveur rendue à l'utilisateur",
    "useSession must be wrapped": "useSession sans SessionProvider",
    "Server has closed the connection": "Connexion base coupée en cours de requête",
    "Can't reach database server": "Base injoignable",
}

par_ecran = {}
erreurs = Counter()
failles = Counter()
for f in RAPPORTS:
    if not os.path.exists(f):
        continue
    for e in json.load(open(f, encoding="utf-8")).get("ecrans", []):
        for m in e.get("erreursConsole", []):
            if any(a in m for a in ARTEFACTS):
                continue
            erreurs[m[:110]] += 1
            par_ecran.setdefault(e["href"], []).append(m)
            for motif, libelle in DEFAILLANCES.items():
                if motif in m:
                    failles[libelle] += 1

print("DÉFAUTS APPLICATIFS (hors artefacts de l'audit)")
print("=" * 62)
if not failles:
    print("  aucun")
for libelle, n in failles.most_common():
    print(f"  {n:3}  {libelle}")

print(f"\nÉcrans touchés par au moins un défaut applicatif : {len(par_ecran)}")
for h, msgs in sorted(par_ecran.items()):
    uniques = sorted({m[:80] for m in msgs})
    print(f"\n  {h}")
    for m in uniques[:3]:
        print(f"      · {m}")