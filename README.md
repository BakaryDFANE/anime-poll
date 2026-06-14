# Sondage Animes (anonyme)

Site simple + serveur Node.js pour recenser anonymement des votes.

## Installation

```bash
cd "c:\Users\faneb\OneDrive\Documents\anime-poll"
npm install
```

## Lancer en local

```bash
npm start
```

Sur le PC, le site sera disponible sur `http://localhost:3000`.

Sur le même Wi-Fi, les autres appareils peuvent utiliser `http://<votre-ip>:3000`, par exemple `http://192.168.1.42:3000`.

## Accès depuis internet

Pour que des personnes hors de votre Wi-Fi accèdent au site, il faut une URL publique. 

### Déploiement sur Vercel (recommandé)

Le projet est configuré pour Vercel:

1. Créez un compte gratuit sur [vercel.com](https://vercel.com)
2. Connectez votre dépôt GitHub (`BakaryDFANE/anime-poll`)
3. Vercel déploiera automatiquement votre site
4. Dans les **Settings** du projet Vercel, ajoutez les variables d'environnement:
   - `ADMIN_USER`: `Bakary D Fane`
   - `ADMIN_PASS`: `2008BFane`
   - `SESSION_SECRET`: une valeur secrète longue

⚠️ **Limitation Vercel**: Les données (votes.json, images) ne persistes pas entre les déploiements. Pour une persistance durable, intégrez une base de données comme MongoDB ou PostgreSQL.

### Autres hébergeurs

Vous pouvez aussi déployer sur Render, Railway, Fly.io ou Heroku. Le projet est prêt pour ce type de déploiement:

- `Procfile` lance `node server.js`
- le serveur utilise `process.env.PORT`
- le serveur écoute sur `0.0.0.0`

Après déploiement, l'hébergeur donnera une URL du type `https://votre-app.onrender.com`.

## Accès admin

Par défaut:

- Utilisateur: `Bakary D Fane`
- Mot de passe: `2008BFane`

Avant de rendre le site public, configurez ces variables sur l'hébergeur:

- `ADMIN_USER`
- `ADMIN_PASS`
- `SESSION_SECRET`

Exemple en local avec PowerShell:

```powershell
setx ADMIN_USER "Bakary D Fane"
setx ADMIN_PASS "2008BFane"
setx SESSION_SECRET "une-longue-valeur-secrete"
```

## Notes

- Les votes sont stockés dans `votes.json`.
- Sur un hébergeur gratuit, les fichiers JSON peuvent être réinitialisés lors d'un redémarrage ou d'un redéploiement. Pour garder les votes durablement, il faudra ensuite ajouter une base de données.
