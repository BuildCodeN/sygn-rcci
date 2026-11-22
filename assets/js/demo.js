/* demo.js — jeu d'essai (personnes FICTIVES), marqué demo:true pour être effacé d'un clic. */
window.Demo = (function(){
  const NOMS = ['Kouassi','Kouadio','Yao','Bakayoko','Touré','Koffi','Dosso','N’Guessan','Konan','Traoré','Diabaté','Aka','Coulibaly','Soro','Gnahoré'];
  const PRE = ['Émmanuelle','Marc','Aya','Serge','Florence','Jean','Nadège','Christelle','Ange','Prisca','Hervé','Mariam','Séraphin','Béatrice','Josué'];
  const PRE2 = ['Marie','Pierre','Thérèse','Paul','Joseph','Anne',''];
  const PROF = ['Institutrice','Comptable','Infirmier','Commerçante','Ingénieur','Étudiant','Couturière','Enseignant'];
  function lancer(){
    const B = Base, d = B.d;
    const dio = nom => d.dioceses.find(x => Identite.norm(x.nom) === Identite.norm(nom)) || B.ajouter('dioceses',{nom, demo:true});
    const ab = dio('Abidjan'), ya = dio('Yamoussoukro'), bk = dio('Bouaké');
    const s1 = B.ajouter('secteurs',{nom:'Secteur 1 — Cocody', dioceseId:ab.id, demo:true});
    const s3 = B.ajouter('secteurs',{nom:'Secteur 3 — Marcory', dioceseId:ab.id, demo:true});
    const pr = [
      B.ajouter('paroisses',{nom:'Sainte-Thérèse', dioceseId:ab.id, secteurId:s1.id, demo:true}),
      B.ajouter('paroisses',{nom:'Saint-Jean', dioceseId:ab.id, secteurId:s3.id, demo:true}),
      B.ajouter('paroisses',{nom:'Basilique Notre-Dame', dioceseId:ya.id, demo:true}),
      B.ajouter('paroisses',{nom:'Saint-Paul', dioceseId:bk.id, demo:true})
    ];
    let k = 0;
    for(let i=0;i<NOMS.length;i++) for(let j=0;j<3;j++){
      const p = pr[k % pr.length], pre = PRE[(i*3+j) % PRE.length], p2 = PRE2[(i+j) % PRE2.length];
      const mi = d.ministeres[k % d.ministeres.length], po = d.postes[(k*3) % d.postes.length];
      B.d.membres.push({
        id:B.uid('mem'), matricule:B.matricule(), nom:NOMS[i].toUpperCase(), prenoms:(pre+' '+p2).trim(),
        dateNaissance:(1970+(k*7)%32)+'-'+String(1+k%12).padStart(2,'0')+'-'+String(1+(k*5)%27).padStart(2,'0'),
        sexe:/^(Émmanuelle|Aya|Florence|Nadège|Christelle|Prisca|Mariam|Béatrice)/.test(pre)?'F':'M',
        tel:'07 '+String(10+k%80)+' '+String(20+(k*3)%70)+' '+String(10+(k*7)%80)+' '+String(11+(k*11)%88),
        dioceseId:p.dioceseId, secteurId:p.secteurId||'', paroisseId:p.id, ministereId:mi.id, posteId:po.id,
        profession:PROF[k%PROF.length], pieces:[], creeLe:new Date().toISOString(), demo:true
      });
      k++;
    }
    const t = d.typesActivite;
    const auj = new Date().toISOString().slice(0,10);
    B.ajouter('activites',{intitule:'Séminaire national de la Pentecôte', typeId:t[0].id, date:auj, heure:'08:00', lieu:'Abidjan — Palais de la Culture', statut:'en cours', responsable:'P. Ahou', demo:true});
    B.ajouter('activites',{intitule:'Formation des responsables de secteur', typeId:t[1].id, date:auj, heure:'14:00', lieu:'Yamoussoukro', statut:'ouverte', responsable:'J. Koffi', demo:true});
    B.ajouter('activites',{intitule:'Évangélisation de quartier — Cocody', typeId:t[2].id, date:auj, heure:'16:00', lieu:'Abidjan — Secteur 1', statut:'en préparation', responsable:'', demo:true});
    B.tracer('demo','Jeu d’essai chargé'); B.sauver();
  }
  function effacer(){
    const B = Base, d = B.d, ids = new Set(d.membres.filter(m=>m.demo).map(m=>m.id)), act = new Set(d.activites.filter(a=>a.demo).map(a=>a.id));
    ['dioceses','secteurs','paroisses','membres','activites'].forEach(c => d[c] = d[c].filter(x=>!x.demo));
    d.presences = d.presences.filter(p => !ids.has(p.membreId) && !act.has(p.activiteId));
    B.tracer('demo','Jeu d’essai effacé'); B.sauver();
  }
  return {lancer, effacer};
})();
