# EcolPro — Agent de synchronisation locale

Cet agent télécharge automatiquement toutes les données de votre établissement depuis la plateforme EcolPro et les stocke localement sur votre PC sous forme de fichiers Excel lisibles.

## Pourquoi ?

- **Sécurité des données** : Vos données sont sauvegardées localement, même si la plateforme est indisponible
- **Portabilité** : Les fichiers Excel sont lisibles avec Excel, LibreOffice ou Google Sheets
- **Autonomie** : Si vous quittez la plateforme, vous gardez toutes vos données
- **Aucune dépendance** : L'agent utilise uniquement Node.js (déjà installé sur la plupart des PC)

## Installation

### 1. Prérequis
- **Node.js 18 ou supérieur** ([télécharger](https://nodejs.org))
- Windows, macOS ou Linux

### 2. Configuration

1. Sur la plateforme EcolPro, allez dans **Paramètres → Sauvegarde & Sync**
2. Copiez votre **clé API**
3. Éditez le fichier `config.json` dans ce dossier :

```json
{
  "serverUrl": "https://ecolpro.vercel.app",
  "apiKey": "esk_votre_cle_api_ici",
  "backupDir": "./backups",
  "maxBackups": 30,
  "logFile": "./sync.log"
}
```

### 3. Test manuel

```bash
node agent.js --once
```

Cela télécharge une sauvegarde immédiate et vérifie que tout fonctionne.

### 4. Démarrage automatique

#### Windows (Service en arrière-plan)

Créez un fichier `start-sync.bat` :
```bat
@echo off
cd /d "C:\EcolPro\local-sync-agent"
node agent.js
```

Pour démarrer automatiquement au boot :
1. Appuyez sur `Win + R`, tapez `shell:startup`
2. Placez un raccourci vers `start-sync.bat` dans ce dossier

#### macOS / Linux (launchd / systemd)

**macOS** — Créez `~/Library/LaunchAgents/com.ecolpro.sync.plist` :
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ecolpro.sync</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/path/to/local-sync-agent/agent.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

Puis : `launchctl load ~/Library/LaunchAgents/com.ecolpro.sync.plist`

**Linux** — Créez `/etc/systemd/system/ecolpro-sync.service` :
```ini
[Unit]
Description=EcolPro Local Sync Agent
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/node /path/to/local-sync-agent/agent.js
Restart=always
User=youruser

[Install]
WantedBy=multi-user.target
```

Puis : `sudo systemctl enable ecolpro-sync && sudo systemctl start ecolpro-sync`

## Utilisation

### Commandes

```bash
# Sync unique (test)
node agent.js --once

# Sync continue selon l'intervalle configuré
node agent.js

# Override l'intervalle (30 ou 60 minutes)
node agent.js --interval=30
```

### Structure des sauvegardes

```
backups/
├── 2026-08-15T14-30/
│   └── sauvegarde_ecolpro_2026-08-15T14-30.zip
│       ├── 01_Eleves_et_Parents.xlsx
│       ├── 02_Notes_et_Bulletins.xlsx
│       ├── 03_Emploi_du_temps.xlsx
│       ├── 04_Examens_planifies.xlsx
│       ├── 05_Personnel_et_Enseignants.xlsx
│       ├── 06_Comptabilite.xlsx
│       ├── 07_Parametres_etablissement.xlsx
│       ├── 08_Absences_eleves.xlsx
│       └── README.txt
├── 2026-08-15T15-30/
│   └── ...
```

### Conservation

- Les **30 dernières sauvegardes** sont conservées (configurable dans `config.json`)
- Les plus anciennes sont automatiquement supprimées
- Chaque sauvegarde est dans un dossier horodaté

### Logs

Les logs sont écrits dans `sync.log` et affichés dans le terminal :
```
[2026-08-15T14:30:00.000Z] [INFO] === Début de la synchronisation ===
[2026-08-15T14:30:05.000Z] [INFO] Sauvegarde réussie: sauvegarde_ecolpro_2026-08-15T14-30.zip (12.5 MB, 8 fichiers, 1542 lignes)
[2026-08-15T14:30:05.000Z] [INFO] === Synchronisation terminée avec succès ===
```

## Dépannage

### "Clé API non configurée"
→ Éditez `config.json` et remplacez la valeur `apiKey` par votre clé (disponible dans Paramètres → Sauvegarde & Sync)

### "HTTP 401: Clé API invalide"
→ La clé API a été régénérée sur la plateforme. Copiez la nouvelle clé dans `config.json`

### "HTTP 403: Synchronisation désactivée"
→ Activez la synchronisation dans Paramètres → Sauvegarde & Sync

### "Erreur réseau" / "Timeout"
→ Vérifiez votre connexion internet et que `serverUrl` est correct dans `config.json`

### Le PC est éteint pendant une sync
→ Aucun problème : l'agent rattrapera la sync au prochain démarrage. Aucune donnée n'est perdue.
