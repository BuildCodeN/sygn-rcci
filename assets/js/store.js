/* store.js — base de données locale du Système National RCCI.
   Tout est gardé dans le navigateur (localStorage) en attendant le serveur.
   Le SCHÉMA ci-dessous est celui de la future base : chaque collection devient
   une table, chaque `id` une clé primaire. Les listes envoyées par
   l'utilisateur alimentent DONNEES_INITIALES (donnees-initiales.js). */
(function(){
  'use strict';
  const CLE = 'rcci.base.v1';
  const SCHEMA = {
    dioceses:   'id, nom',
    secteurs:   'id, dioceseId, nom',                 // Abidjan est organisé en secteurs
    paroisses:  'id, dioceseId, secteurId?, nom',
    ministeres: 'id, nom',
    postes:     'id, nom',
    typesActivite: 'id, nom',
    membres:    'id, matricule, nom, prenoms, dateNaissance, sexe, tel, whatsapp, dioceseId, secteurId, paroisseId, ministereId, posteId, profession, pieces[{type,numero}], creeLe, demo?',
    activites:  'id, intitule, typeId, date, heure, lieu, statut, responsable, contribMontant?, contribSeuil?, parentId?, moduleNum?, annee?, demo?',
    preinscriptions: 'id, activiteId, structure, effectif',
    presences:  'id, activiteId, membreId, heure, poste, pieceType, pieceNumero?, nouveau?',
    // --- Module INTERCESSION (une personne = une fiche dans « membres », jamais de doublon) ---
    organes:    'id, code(continental|national|coordination), nom, niveau, parentId?, description',
    affectations: 'id, organeId, membreId, dioceseId?, entite, fonction, fonctionCivile?, rang',
    participations: 'id, activiteId, membreId, statut, modules{m1,m2,m3}?',
    cotisations: 'id, activiteId, membreId, montant, moment(avant|pendant), mode, date, numero, agent, annulee?, motif?',
    archives:   'id, kind(inscriptions|formation), activiteId, titre, date, resume, tableaux',
    documents:  'id, titre, categorie, exercice, activiteId?, date, notes, fichierId, nomFichier, type, taille, ajouteLe, ajoutePar',
    diplomes:   'id, activiteId, membreId, remisLe',
    utilisateurs: 'id, email, nom, role, portee?, mdp(hash), demo?',
    journal:    'id, date, action, detail'
  };
  const TYPES_PIECE = [
    {id:'cni', nom:'Carte nationale d’identité'},
    {id:'passeport', nom:'Passeport'},
    {id:'cmu', nom:'Carte CMU'},
    {id:'assurance', nom:'Carte d’assurance'},
    {id:'permis', nom:'Permis de conduire'},
    {id:'autre', nom:'Autre pièce justificative'}
  ];
  const STATUTS = ['en préparation','ouverte','en cours','clôturée','archivée'];

  let db = null;
  const ecouteurs = [];

  function vide(){
    const d = {version:1, meta:{creeLe:new Date().toISOString()}};
    Object.keys(SCHEMA).forEach(k => d[k] = []);
    const ini = (window.DONNEES_INITIALES || {});
    ['dioceses','secteurs','paroisses','ministeres','postes','typesActivite'].forEach(k=>{
      (ini[k]||[]).forEach(x => d[k].push(Object.assign({id:uid(k)}, typeof x==='string'?{nom:x}:x)));
    });
    return d;
  }
  function uid(p){ return (p||'x').slice(0,3) + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
  function charger(){
    try { const t = localStorage.getItem(CLE); db = t ? JSON.parse(t) : null; } catch(e){ db = null; }
    if(!db){ db = vide(); sauver(); }
    Object.keys(SCHEMA).forEach(k => { if(!db[k]) db[k] = []; });
    return db;
  }
  function sauver(){
    try { localStorage.setItem(CLE, JSON.stringify(db)); } catch(e){ console.warn('Sauvegarde impossible', e); }
    ecouteurs.forEach(f => f());
  }
  function tracer(action, detail){
    db.journal.unshift({id:uid('jou'), date:new Date().toISOString(), action, detail});
    if(db.journal.length > 2000) db.journal.length = 2000;
  }
  function matricule(){
    const n = db.membres.length + 1;
    let m; let i = n;
    do { m = 'RCCI-' + String(i++).padStart(6,'0'); } while(db.membres.some(x => x.matricule === m));
    return m;
  }

  window.Base = {
    SCHEMA, TYPES_PIECE, STATUTS, uid,
    charger, sauver, tracer, matricule,
    get d(){ return db; },
    abonner(f){ ecouteurs.push(f); },
    par(coll, id){ return db[coll].find(x => x.id === id); },
    nom(coll, id){ const x = db[coll].find(y => y.id === id); return x ? x.nom : ''; },
    ajouter(coll, obj){ const o = Object.assign({id:uid(coll)}, obj); db[coll].push(o); sauver(); return o; },
    retirer(coll, id){ db[coll] = db[coll].filter(x => x.id !== id); sauver(); },
    reinitialiser(){ db = vide(); sauver(); },
    /** Ajoute en masse une liste de noms (une par ligne) à une collection simple ; ignore les doublons. */
    importerNoms(coll, lignes, extra){
      let n = 0;
      lignes.map(s => s.trim()).filter(Boolean).forEach(nom => {
        if(!db[coll].some(x => x.nom.toLowerCase() === nom.toLowerCase() && (!extra || Object.keys(extra).every(k => x[k] === extra[k])))){
          db[coll].push(Object.assign({id:uid(coll), nom}, extra||{})); n++;
        }
      });
      sauver(); return n;
    },
    exporter(){ return JSON.stringify(db, null, 1); },
    importer(texte){ const o = JSON.parse(texte); if(!o || !o.membres) throw new Error('Fichier invalide'); db = o; sauver(); }
  };
})();
