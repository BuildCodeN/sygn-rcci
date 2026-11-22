/* identite.js — identification d'une personne à partir d'une PIÈCE (CNI, passeport,
   carte CMU, assurance…). On ne garde jamais l'image de la pièce : l'agent saisit
   (ou plus tard lit par OCR) le nom complet tel qu'il est écrit, et le moteur
   cherche la fiche correspondante dans la base nationale.

   Le nom sur une pièce n'est pas écrit comme dans la base : ordre inversé
   (KOUASSI Emmanuelle / Emmanuelle KOUASSI), prénoms multiples dont un seul est
   donné, accents absents, tirets, majuscules, petites fautes de frappe. Le moteur
   en tient compte et n'affirme « identifié » que si UNE seule fiche ressort
   nettement. Sinon il présente les candidats à l'agent. */
(function(){
  'use strict';
  function norm(s){
    return (s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase()
      .replace(/[’'`\-_.,]/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  }
  const PARTICULES = new Set(['de','du','des','la','le','dit','epouse','ep','nee','veuve','vve','mme','mlle','mr','m','epse','mademoiselle','madame','monsieur']);
  function jetons(s){ return norm(s).split(' ').filter(t => t && !PARTICULES.has(t)); }
  function lev(a,b){
    if(a===b) return 0; const m=a.length,n=b.length; if(!m) return n; if(!n) return m;
    let p = Array.from({length:n+1},(_,i)=>i);
    for(let i=1;i<=m;i++){ const c=[i]; for(let j=1;j<=n;j++) c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1)); p=c; }
    return p[n];
  }
  /** Ressemblance de deux mots, 0..1 (faute de frappe tolérée à partir de 4 lettres). */
  function mot(a,b){
    if(a===b) return 1;
    if(a.length<4 || b.length<4) return 0;
    const d = lev(a,b), r = 1 - d/Math.max(a.length,b.length);
    return d<=1 || r>=.78 ? r : 0;
  }
  function meilleur(t, liste){ let m=0; liste.forEach(x => { const s=mot(t,x); if(s>m) m=s; }); return m; }

  function scoreMembre(q, m){
    const nomT = jetons(m.nom), preT = jetons(m.prenoms);
    if(!nomT.length) return 0;
    // 1) le NOM de famille doit se retrouver dans le texte de la pièce
    // le nom de famille peut être le nom de naissance OU le nom d'épouse (« DUPONT Épse MARTIN » ≙ « MARTIN Marie »)
    const epT = jetons(m.epouseDe||'');
    const sNom = Math.max(nomT.reduce((a,t)=>a+meilleur(t,q),0)/nomT.length, epT.length ? .93*epT.reduce((a,t)=>a+meilleur(t,q),0)/epT.length : 0);
    // 2) au moins UN prénom de la fiche doit s'y retrouver (la pièce n'en cite souvent qu'un)
    const sPre = preT.length ? Math.max(...preT.map(t=>meilleur(t,q))) : .6;
    // 3) mots de la pièce inconnus de la fiche : léger malus (nom d'épouse, surnom…)
    const tous = nomT.concat(preT, jetons(m.epouseDe||''));
    const inconnus = q.filter(t => meilleur(t,tous)===0).length;
    let s = 100*(.58*sNom + .42*sPre) - Math.min(12, inconnus*4);
    return Math.max(0, s);
  }

  /** Cherche sur une pièce. entree = {nom, numero, dateNaissance, type}. Retourne {etat, candidats[]}.
      etat : 'identifie' | 'a-choisir' | 'non-repertorie' */
  function chercher(membres, entree){
    const num = (entree.numero||'').replace(/\s/g,'').toUpperCase();
    // Cas le plus sûr : le numéro de pièce est déjà connu
    if(num.length >= 5){
      const m = membres.find(x => (x.pieces||[]).some(p => (p.numero||'').replace(/\s/g,'').toUpperCase() === num));
      if(m) return {etat:'identifie', raison:'numéro de pièce déjà enregistré', candidats:[{m, score:100, raison:'N° de pièce reconnu'}]};
    }
    const q = jetons(entree.nom);
    if(q.length < 2) return {etat:'non-repertorie', candidats:[], erreur:'Saisissez le nom ET au moins un prénom tels qu’écrits sur la pièce.'};
    const nais = (entree.dateNaissance||'').trim();
    const liste = membres.map(m => {
      let s = scoreMembre(q, m), raison = [];
      if(nais && m.dateNaissance){
        if(m.dateNaissance === nais){ s = Math.min(100, s + 10); raison.push('date de naissance identique'); }
        else { s -= 30; raison.push('date de naissance différente'); }
      }
      return {m, score:Math.round(s), raison:raison.join(', ')};
    }).filter(c => c.score >= 62).sort((a,b) => b.score - a.score).slice(0,6);
    if(!liste.length) return {etat:'non-repertorie', candidats:[]};
    const ecart = liste.length>1 ? liste[0].score - liste[1].score : 100;
    if(liste[0].score >= 90 && ecart >= 10) return {etat:'identifie', candidats:liste};
    return {etat:'a-choisir', candidats:liste};
  }
  window.Identite = {norm, jetons, chercher, scoreMembre, mot};
})();
