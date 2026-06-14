# Sondage Animes (anonyme)

Site simple + serveur Node.js pour recenser anonymement des votes.

Install:

```bash
cd "c:\Users\faneb\OneDrive\Documents\anime-poll"
npm install
```

Lancer:

```bash
npm start
```

Le site sera disponible sur `http://localhost:3000`.

Notes:
- Les votes sont stockés dans `votes.json` sans informations personnelles (anonymes).
- Pour réinitialiser, videz `votes.json`.

Accès admin:
- Le serveur supporte des endpoints d'administration protégés par une clé (`ADMIN_KEY`). Par défaut la clé est `change-me-please`. Pour définir une clé sûre avant de démarrer le serveur :

```powershell
setx ADMIN_KEY "ma-cle-secrete"
# puis relancer le terminal pour prendre effet
```

Ensuite ouvrez `http://<votre-ip>:3000/admin.html` et entrez la clé pour ajouter/supprimer des options ou réinitialiser les votes.

Partage mobile (accès depuis téléphone):
- Pour que vos amis accèdent depuis leur téléphone sur le même réseau local, donnez-leur l'adresse `http://<votre-ip>:3000` (remplacez `<votre-ip>` par l'IP locale de votre PC, par exemple `192.168.1.42`).
- Si vous voulez un lien accessible depuis internet, vous devrez configurer le transfert de port (port forwarding) sur votre routeur ou héberger l'app sur un service cloud (Heroku, Render, Fly, etc.).

Sécurité:
- Cette implémentation utilise une clé simple en variable d'environnement. Ne l'exposez pas publiquement. Pour usage public, utilisez HTTPS, authentification solide et une base de données sécurisée.

Déploiement rapide (Render / Heroku / services similaires):

1) Poussez le projet sur GitHub.
2) Connectez le dépôt à Render (ou Heroku). Configurez les variables d'environnement sur la plateforme :

 - `ADMIN_USER` : nom d'utilisateur admin (ex: admin)
 - `ADMIN_PASS` : mot de passe admin sécurisé
 - `SESSION_SECRET` : secret de session

Render détecte `Procfile` et lancera `node server.js`. Après le déploiement, vous obtiendrez une URL publique que vous pourrez partager avec vos amis.

Remarque : pour un usage personnel sur votre réseau local, partagez `http://<votre-ip>:3000`.
