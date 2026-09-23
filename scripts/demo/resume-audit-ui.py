#!/usr/bin/env python3
"""Consolide les rapports d'audit UI en un verdict unique (lecture seule)."""
import json
import os

RAPPORTS = [
    "audit-reports/ui-complet.json",
    "audit-reports/ui-complet-suite.json",
    "audit-reports/ui-complet-final.json",
]

ecrans = {}
modales = []
boutons = []

for f in RAPPORTS:
    if not os.path.exists(f):
        continue
    d = json.load(open(f, encoding="utf-8"))
    for e in d.get("ecrans", []):
        ecrans.setdefault(e["href"], e)
        modales += e.get("modales", [])
        for b in e.get("boutons", []):
            b["_href"] = e["href"]
            boutons.append(b)

autorises = {h: e for h, e in ecrans.items() if not e.get("nonAutorise")}
testes = [b for b in boutons if not b.get("nonClique") and not b.get("terminal") and not b.get("desactive")]

print(f"ÉCRANS            : {len(ecrans)} audités, {len(autorises)} rendus, {len(ecrans) - len(autorises)} refusés par le périmètre")
print(f"  en erreur       : {sum(1 for e in ecrans.values() if e.get('erreurs') or e.get('erreursConsole'))}")
print(f"  sans donnée     : {sum(1 for e in autorises.values() if e.get('vide'))}")
print()
print(f"BOUTONS           : {sum(len(e.get('controles', {}).get('boutons', [])) for e in ecrans.values())} recensés, {len(testes)} cliqués")
print(f"  sans effet      : {sum(1 for b in testes if b.get('sansEffet') and not b.get('dejaActif'))}")
print(f"  en erreur       : {sum(1 for b in boutons if b.get('erreur'))}")
print(f"  désactivés      : {sum(1 for b in boutons if b.get('desactive'))}")
print()
ouvertes = [m for m in modales if m.get("ouverte")]
print(f"MODALES           : {len(modales)} rencontrées, {len(ouvertes)} ouvertes")
print(f"  fermées (croix) : {sum(1 for m in ouvertes if m.get('fermeeParCroix'))}")
print(f"  fermées (Échap) : {sum(1 for m in ouvertes if m.get('fermeeParEchap'))}")
print(f"  « maison »      : {sum(1 for m in ouvertes if (m.get('contenu') or {}).get('sansRole'))}")
print()
print("LIAISONS          :", sum(len(e.get("controles", {}).get("liens", [])) for e in ecrans.values()), "liens,",
      sum(len(e.get("controles", {}).get("champs", [])) for e in ecrans.values()), "champs,",
      sum(len(e.get("onglets", [])) for e in ecrans.values()), "onglets")

# Les écrans vides sont légitimes (mois sans donnée) : on les liste pour
# mémoire, sans les compter comme défauts.
vides = sorted(h for h, e in autorises.items() if e.get("vide"))
if vides:
    print("\nÉcrans sans donnée (état légitime à documenter) :")
    for h in vides:
        print(f"  ○ {h}")