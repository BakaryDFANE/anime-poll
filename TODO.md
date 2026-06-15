# TODO - Correction admin “Aucun sondage”

- [x] Analyser pourquoi l’admin affiche « Aucun sondage disponible » (fetchPoll() renvoie data.polls[0] vide)
- [x] Modifier `public/admin.html` pour ajouter un formulaire de création de sondage (id + titre)
- [x] Modifier `public/admin.js` pour gérer la création de sondage (et afficher l’interface d’options ensuite)


  - [ ] charger soit le 1er sondage, soit afficher le formulaire si aucun sondage
  - [ ] appeler `POST /admin/addPoll` lors de la création
  - [ ] recharger l’interface et permettre ensuite l’ajout d’options
- [ ] Tester en local : créer un poll, puis ajouter une option
- [ ] Tester edge cases : id déjà existant, mauvais accès admin

