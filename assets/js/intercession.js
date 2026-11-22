/* intercession.js — module INTERCESSION : gouvernance, composition des trois instances,
   participants aux formations, activités, territoire.

   Principe : UNE personne = UNE fiche dans « membres ». Les compositions (affectations),
   les inscriptions aux formations (participations) et les responsabilités ne font que
   POINTER vers cette fiche : aucun doublon, aucune table de personnes en plus.
   Chaîne institutionnelle : Ministère continental → Ministère national → Coordination
   nationale → Diocèses → Paroisses → Membres et participants (champ parentId des organes). */
(function(){
  'use strict';
  const B = Base, D = () => window.DONNEES_INTERCESSION;
  const norm = s => Identite.norm(s);
  const cle = s => Identite.jetons(s).sort().join(' ');
  const estMaj = t => /[A-ZÀ-Ý]/.test(t) && t === t.toUpperCase();

  /* ------------------------------------------------------------ import initial */
  /** Analyse un nom d'état civil : civilité, nom, prénoms, nom du mari.
      « DUPONT Epse MARTIN Marie » → nom DUPONT, épouse de MARTIN, prénoms Angèle.
      « KOUAME Adjoa Florentine Épse KOFFI » → nom KOUAME, prénoms Adjoa Florentine, épouse de KOFFI.
      « KOGNAN NEE GNEDRE OZOUA GISELE » → nom GNEDRE (naissance), épouse de KOGNAN. */
  function decouper(brut){
    let t = (brut||'').replace(/\s+/g,' ').trim(), civ = '';
    const m = t.match(/^(Mme|MME|Mlle|MLLE|M\.|M)\s+/);
    if(m){ civ = m[1].replace('MME','Mme').replace('MLLE','Mlle'); t = t.slice(m[0].length); }
    let mots = t.split(' '), epouseDe = '';
    const iNee = mots.findIndex(x => /^n[ée]e$/i.test(x)), iEp = mots.findIndex(x => /^(épse|epse|épouse|epouse)$/i.test(x));
    if(iNee > 0){ epouseDe = mots.slice(0, iNee).join(' '); mots = mots.slice(iNee + 1); if(!civ) civ = 'Mme'; }
    else if(iEp >= 0){
      const avant = mots.slice(0, iEp), apres = mots.slice(iEp + 1), tousMaj = avant.concat(apres).every(estMaj);
      let k = 0; if(tousMaj){ k = apres.length ? 1 : 0; } else { while(k < apres.length && estMaj(apres[k])) k++; }
      epouseDe = apres.slice(0, k).join(' '); mots = avant.concat(apres.slice(k)); if(!civ) civ = 'Mme';
    }
    const res = x => Object.assign({civ, epouseDe}, x);
    if(!mots.length) return res({nom:'', prenoms:''});
    if(!estMaj(mots[0])){ // « Patricia N'DJABIA », « Medy AGATHE » : prénom d'abord
      const maj = mots.filter(estMaj), autres = mots.filter(x => !estMaj(x));
      return res({nom: maj.join(' '), prenoms: autres.join(' ')});
    }
    if(mots.every(estMaj)) return res({nom: mots[0], prenoms: mots.slice(1).join(' ')});
    let i = 0, nom = []; while(i < mots.length && estMaj(mots[i])){ nom.push(mots[i]); i++; }
    return res({nom: nom.join(' '), prenoms: mots.slice(i).join(' ')});
  }
  function dioceseDe(libelle){ return B.d.dioceses.find(x => norm(x.nom) === norm(libelle)) || null; }
  function paroisseDe(dioId, libelle){
    if(!libelle) return null;
    let p = B.d.paroisses.find(x => x.dioceseId === dioId && norm(x.nom) === norm(libelle));
    if(!p){ p = {id:B.uid('par'), nom:libelle, dioceseId:dioId}; B.d.paroisses.push(p); }
    return p;
  }
  function semer(){
    if(!D() || B.d.meta.intercession) return false;
    const d = B.d, S = D();
    // 1. diocèses (liste citée dans les fichiers)
    S.dioceses.forEach(n => { if(!dioceseDe(n)) d.dioceses.push({id:B.uid('dio'), nom:n}); });
    // 2. types d'activités du ministère (noms des dossiers du ministère)
    ['Formation biblique','Rassemblement national','Rencontre mensuelle','Retraite annuelle','Pèlerinage','Veillée des saisons','Session de renforcement des capacités'].forEach(n => {
      if(!d.typesActivite.some(x => norm(x.nom) === norm(n))) d.typesActivite.push({id:B.uid('typ'), nom:n});
    });
    let min = d.ministeres.find(x => norm(x.nom) === 'intercession');
    if(!min){ min = {id:B.uid('min'), nom:'Intercession'}; d.ministeres.push(min); }
    // 3. personnes sans doublon
    const index = new Map(); d.membres.filter(m => !m.demo).forEach(m => index.set(cle(m.nom+' '+m.prenoms), m));
    const probables = [];
    function personne(p, source){
      const dec = decouper(p.nom), k = cle(p.nom), dio = p.diocese ? dioceseDe(p.diocese) : (p.entite ? dioceseDe(p.entite) : null);
      const par = dio && p.paroisse ? paroisseDe(dio.id, p.paroisse) : null;
      let m = index.get(k);
      if(m){
        const vides = {tel:p.tel, whatsapp:p.whatsapp, email:p.email, profession:p.fonction||p.fonctionCivile, civilite:dec.civ||p.civ, dioceseId:dio&&dio.id, paroisseId:par&&par.id};
        Object.keys(vides).forEach(c => { if(!m[c] && vides[c]) m[c] = vides[c]; });
      } else {
        m = {id:B.uid('mem'), matricule:B.matricule(), nom:dec.nom.toUpperCase(), prenoms:dec.prenoms, nomEtatCivil:p.nom, civilite:dec.civ||p.civ||'', epouseDe:(dec.epouseDe||'').toUpperCase(), sexe:'', dateNaissance:'',
          tel:p.tel||'', whatsapp:p.whatsapp||'', email:p.email||'', dioceseId:dio?dio.id:'', secteurId:'', paroisseId:par?par.id:'', ministereId:min.id, posteId:'',
          profession:p.fonction||p.fonctionCivile||'', pieces:[], sources:[], creeLe:new Date().toISOString()};
        d.membres.push(m); index.set(k, m);
        // possible doublon : mêmes mots à 60 % ou plus, dans le même diocèse
        const tk = new Set(k.split(' '));
        index.forEach((o, ok) => { if(o !== m && o.dioceseId === m.dioceseId && m.dioceseId){
          const to = ok.split(' '), inter = to.filter(x => tk.has(x)).length, uni = new Set([...tk, ...to]).size;
          if(inter >= 2 && inter/uni >= .6) probables.push([o.id, m.id]);
        }});
      }
      if(!m.ministereId) m.ministereId = min.id;
      if(!m.sources) m.sources = [];
      if(!m.sources.includes(source)) m.sources.push(source);
      return m;
    }
    // 4. organes (chaîne institutionnelle) et affectations — trois bases DISTINCTES
    const co = {id:B.uid('org'), code:'continental', nom:'Ministère continental d’intercession', niveau:'continental', parentId:'', description:'Annexe 3 — responsables des diocèses au niveau continental'};
    const na = {id:B.uid('org'), code:'national', nom:'Ministère national d’intercession', niveau:'national', parentId:co.id, description:'Annexe 1 — composition du ministère national'};
    const cn = {id:B.uid('org'), code:'coordination', nom:'Coordination nationale de l’intercession', niveau:'national', parentId:na.id, description:'Annexe 2 — responsables de l’intercession par diocèse'};
    d.organes.push(co, na, cn);
    const aff = (org, lst, source, fonction) => lst.forEach((r, i) => {
      const dio = dioceseDe(r.entite), m = personne(Object.assign({}, r, {whatsapp: org===na ? '' : r.tel}), source);
      d.affectations.push({id:B.uid('aff'), organeId:org.id, membreId:m.id, dioceseId:dio?dio.id:'', entite:dio?dio.nom:'Intercession nationale', fonction:fonction||'', fonctionCivile:r.fonctionCivile||'', rang:i+1});
    });
    aff(na, S.national, 'Ministère national d’intercession (Annexe 1)', '');
    aff(cn, S.coordination, 'Coordination nationale (Annexe 2)', 'Responsable de l’intercession');
    aff(co, S.continental, 'Ministère continental (Annexe 3)', '');
    // 5. formations bibliques + participants
    const typF = d.typesActivite.find(x => norm(x.nom) === 'formation biblique');
    const mkAct = (annee, modules) => { const a = {id:B.uid('act'), intitule:'Formation biblique des intercesseurs — '+annee+(annee==='1'?'ère':'ème')+' année', typeId:typF.id, date:'', heure:'', lieu:'', statut:'en préparation', responsable:'', ministere:'intercession', niveau:'national', annee, modules}; d.activites.push(a); return a; };
    const a1 = mkAct('1', []), a2 = mkAct('2', ['Le Pentateuque','Les Prophètes','Les Écrits']);
    const insc = (a, lst, source) => lst.forEach(p => {
      const m = personne(p, source);
      if(!d.participations.some(x => x.activiteId === a.id && x.membreId === m.id)) d.participations.push({id:B.uid('prt'), activiteId:a.id, membreId:m.id, statut:'inscrit', modules:{}});
    });
    insc(a1, S.annee1, 'Formation biblique 1ère année');
    insc(a2, S.annee2, 'Formation biblique 2ème année');
    d.meta.intercession = 1; d.meta.doublonsProbables = probables;
    B.tracer('import intercession', d.membres.length+' fiches, '+d.affectations.length+' affectations, '+d.participations.length+' inscriptions');
    B.sauver(); return true;
  }

  /* Mise à jour des données déjà installées (22 nov. 2026, retours de l'utilisateur) :
     secteurs d'Abidjan, responsable de l'intercession nationale, civilités et noms d'épouse. */
  const nomAffiche0 = m => (m.civilite ? m.civilite+' ' : '') + m.nom + ' ' + m.prenoms + (m.epouseDe ? ' Épse '+m.epouseDe : '');
  function migrer(){
    const d = B.d; if(!d.meta.intercession) return false;
    // V3 : Mme MARTIN Marie est la responsable de l'intercession nationale (dit par l'utilisateur, 22 nov.)
    if(!d.meta.intercessionV3){
      const mo3 = d.membres.find(m => cle(m.nom+' '+m.prenoms) === cle('MARTIN Marie'));
      if(mo3) d.affectations.forEach(a => { if(a.membreId === mo3.id) a.fonction = 'Responsable de l’intercession nationale'; });
      d.meta.intercessionV3 = 1; B.tracer('responsable nationale', 'MARTIN Marie'); B.sauver();
    }
    if(!d.meta.intercessionV4){
      const mo4 = d.membres.find(m => cle(m.nom+' '+m.prenoms) === cle('MARTIN Marie'));
      if(mo4) mo4.photoFichier = 'assets/photos/exemple-1.jpg';
      d.meta.intercessionV4 = 1; B.tracer('photo', 'MARTIN Marie'); B.sauver();
    }
    if(!d.meta.intercessionV5){
      let corr = 0;
      // (a) fusions déjà faites : si la fiche conservée porte le nom d'épouse et que la fiche supprimée portait le nom d'état civil, on remet l'état civil
      d.journal.filter(j => j.action === 'fusion de doublon' && j.detail && j.detail.includes(' → ')).forEach(j => {
        const [sup, gar] = j.detail.split(' → '), a = decouper(sup); if(!a.epouseDe) return;
        const S = d.membres.find(m => (m.nom+' '+m.prenoms).trim() === gar.trim());
        if(S && norm(S.nom) === norm(a.epouseDe)){ S.nomEtatCivil = sup; S.nom = a.nom.toUpperCase(); S.prenoms = a.prenoms; S.epouseDe = a.epouseDe.toUpperCase(); if(!S.civilite) S.civilite = 'Mme'; B.tracer('fusion corrigée', gar+' → '+nomAffiche0(S)); corr++; }
      });
      // (b) noms mal découpés à l'import (le mot « Épse » restait dans les prénoms)
      d.membres.forEach(m => { if(/(^|\s)(épse|epse|épouse|epouse|née|nee)(\s|$)/i.test(m.prenoms || '')){
        const a = decouper(m.nomEtatCivil || (m.nom+' '+m.prenoms));
        if(a.nom){ m.nom = a.nom.toUpperCase(); m.prenoms = a.prenoms; m.epouseDe = (a.epouseDe || '').toUpperCase(); if(!m.civilite) m.civilite = 'Mme'; corr++; } } });
      // (c) photo de M. DURAND Jean Paul
      const av = d.membres.find(m => cle(m.nom+' '+m.prenoms) === cle('DURAND Jean Paul'));
      if(av) av.photoFichier = 'assets/photos/exemple-2.jpg';
      d.meta.intercessionV5 = 1; B.tracer('mise à jour des noms', corr+' fiche(s) corrigée(s)'); B.sauver();
    }
    if(!d.meta.intercessionV6){
      // Mme DUPONT Angèle, épouse MARTIN : UNE fiche, identité d'état civil conservée (nom de naissance + nom d'épouse)
      const A = d.membres.find(m => cle(m.nom+' '+m.prenoms) === cle('MARTIN Marie')), G = d.membres.find(m => cle(m.nom+' '+m.prenoms) === cle('DUPONT Angèle'));
      if(G && A && G.id !== A.id) Registre.fusionner(G.id, A.id);
      else if(A && !G){ A.nomEtatCivil = 'DUPONT Epse MARTIN Marie'; A.nom = 'DUPONT'; A.epouseDe = 'MARTIN'; A.civilite = 'Mme'; }
      const n = Registre.fusionnerCertains();
      d.meta.intercessionV6 = 1; B.tracer('correction des doublons', n+' fusion(s) certaine(s)'); B.sauver();
    }
    if(d.meta.intercessionV2) return false;
    const ab = dioceseDe('Abidjan');
    if(ab) ['Secteur Nord','Secteur Sud','Secteur Centre'].forEach(n => { if(!d.secteurs.some(s => s.dioceseId === ab.id && norm(s.nom) === norm(n))) d.secteurs.push({id:B.uid('sec'), nom:n, dioceseId:ab.id}); });
    const mo = d.membres.find(m => cle(m.nom+' '+m.prenoms) === cle('MARTIN Marie'));
    if(mo) d.affectations.forEach(a => { if(a.membreId === mo.id && !a.fonction) a.fonction = 'Responsable de l’intercession nationale'; });
    d.membres.forEach(m => {
      const e = /(?:\bép(?:ou)?se|\bepse|\bepouse)\s+(.+)$/i.exec(m.nomEtatCivil || ''), n = /\bn[ée]e\s+(.+)$/i.exec(m.nomEtatCivil || '');
      if(e && !m.epouseDe){ m.epouseDe = e[1].trim().toUpperCase(); if(!m.civilite) m.civilite = 'Mme'; }
      if(n && !m.civilite) m.civilite = 'Mme';
      if(m.epouseDe === undefined) m.epouseDe = '';
    });
    d.meta.intercessionV2 = 1; B.tracer('mise à jour intercession', 'secteurs d’Abidjan, responsable nationale, civilités'); B.sauver(); return true;
  }

  /* ------------------------------------------------- activités du Renouveau (nationales) */
  /** Retraite annuelle, pèlerinage national, formation publique : créées une fois, sans date (à fixer), modifiables. */
  function activitesDuRenouveau(){
    const d = B.d; if(d.meta.activitesRenouveau) return false;
    ['Retraite annuelle','Pèlerinage national','Formation publique'].forEach(n => {
      let t = d.typesActivite.find(x => norm(x.nom) === norm(n)); if(!t){ t = {id:B.uid('typ'), nom:n}; d.typesActivite.push(t); }
      if(!d.activites.some(a => norm(a.intitule) === norm(n) && !a.demo))
        d.activites.push({id:B.uid('act'), intitule:n, typeId:t.id, date:'', heure:'', lieu:'', statut:'en préparation', responsable:'', niveau:'national', modules:[]});
    });
    d.meta.activitesRenouveau = 1; B.tracer('activités du Renouveau', 'retraite annuelle, pèlerinage national, formation publique'); B.sauver(); return true;
  }

  /* ----------------------------------- données du ministère publiées CHIFFRÉES (version en ligne) */
  const disponible = () => !!(window.DONNEES_CHIFFREES && !B.d.meta.intercession);
  async function dechiffrer(code){
    const C = window.DONNEES_CHIFFREES, b = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const brut = (code||'').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const k0 = await crypto.subtle.importKey('raw', new TextEncoder().encode(brut), 'PBKDF2', false, ['deriveKey']);
    const k = await crypto.subtle.deriveKey({name:'PBKDF2', salt:b(C.sel), iterations:C.iter, hash:'SHA-256'}, k0, {name:'AES-GCM', length:256}, false, ['decrypt']);
    const clair = await crypto.subtle.decrypt({name:'AES-GCM', iv:b(C.iv)}, k, b(C.donnees));
    if(C.gz) return JSON.parse(await new Response(new Blob([clair]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    return JSON.parse(new TextDecoder().decode(clair));
  }
  async function appliquerDonnees(p){
    const d = B.d;
    window.DONNEES_INTERCESSION = p.intercession; semer(); migrer();
    (p.fonctions || []).forEach(f => { const m = d.membres.find(x => cle(x.nom+' '+x.prenoms) === cle(f.nom)); if(m) d.affectations.forEach(a => { if(a.membreId === m.id) a.fonction = f.fonction; }); });
    for(const ph of (p.photos || [])){ const m = d.membres.find(x => cle(x.nom+' '+x.prenoms) === cle(ph.nom)); if(m){ const blob = await (await fetch(ph.data)).blob(); await Photos.enregistrer(m.id, blob); } }
    (p.fusions || []).forEach(f => Registre.fusionnerParNoms(f.garde, f.retire)); Registre.fusionnerCertains();
    B.tracer('données du ministère chargées', d.membres.length+' fiches'); B.sauver();
  }
  function demanderCode(X){
    const {esc, $, modale, toast, redraw} = X;
    const v = modale('Données du ministère', `<p class="petit" style="margin-top:0">Les listes (membres, composition des instances, participants aux formations) sont publiées <b>chiffrées</b> : personne ne peut les lire sans le code. Saisissez le code d’accès pour les charger dans cet appareil.</p>
      <label class="petit" style="font-weight:700">Code d’accès</label><input type="text" id="cd-code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX"><div id="cd-msg" class="petit" style="margin-top:8px"></div>`,
      '<button class="btn btn-contour" id="cd-ann">Annuler</button><button class="btn btn-rouge" id="cd-ok">Charger les données</button>');
    $('#cd-ann', v).onclick = () => v.remove();
    $('#cd-ok', v).onclick = async () => {
      const msg = $('#cd-msg', v), b = $('#cd-ok', v); b.disabled = true; msg.textContent = 'Déchiffrement…';
      try { const p = await dechiffrer($('#cd-code', v).value); msg.textContent = 'Chargement des fiches…'; await appliquerDonnees(p); v.remove(); toast('Données du ministère chargées : '+B.d.membres.length+' fiches.'); redraw(); }
      catch(e){ b.disabled = false; msg.innerHTML = '<span style="color:var(--rouge-2);font-weight:700">Code incorrect ou données illisibles.</span>'; }
    };
    $('#cd-code', v).focus();
  }

  /* ------------------------------------------------------------------- interface */
  const etat = {onglet:'gouvernance', organe:'national', q:'', fDio:'', fSec:'', annee:'', sel:new Set(), act:''};
  const ONGLETS = [['gouvernance','Gouvernance'],['composition','Composition'],['participants','Participants'],['activites','Activités'],['territoire','Territoire']];
  const organes = () => B.d.organes.slice().sort((a,b) => ['continental','national','coordination'].indexOf(a.code) - ['continental','national','coordination'].indexOf(b.code));
  const orgCode = c => B.d.organes.find(o => o.code === c);
  const affDe = o => B.d.affectations.filter(a => a.organeId === o.id).sort((x,y) => x.rang - y.rang);
  const prtsDe = id => B.d.participations.filter(p => p.membreId === id);
  const estParticipant = id => B.d.participations.some(p => p.membreId === id);
  const actsInterc = () => B.d.activites.filter(a => a.ministere === 'intercession');
  const chip = (t, c) => `<span class="pastille ${c||'p-info'}">${t}</span>`;

  function vue(v, act, X){
    const {esc, $, modale, toast, redraw, nomComplet, nomAffiche, initiales, fdate, peut} = X;
    const admin = peut('creer');
    const d = B.d;
    if(!d.organes.length){ v.innerHTML = '<div class="tuile vide"><b>Aucune donnée du ministère dans cet appareil</b>Les compositions des instances et les listes de participants ne sont pas encore chargées.' + (disponible() && admin ? '<div style="margin-top:14px"><button class="btn btn-rouge" id="i-charger">Charger les données du ministère (code d’accès)</button></div>' : '') + '</div>'; if($('#i-charger')) $('#i-charger').onclick = () => demanderCode(X); return; }
    act.innerHTML = '';
    v.innerHTML = `<div class="onglets">${ONGLETS.map(([k,n]) => `<button data-t="${k}" class="${k===etat.onglet?'on':''}">${n}</button>`).join('')}</div><div id="i-corps"></div>`;
    v.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { etat.onglet = b.dataset.t; redraw(); });
    const corps = $('#i-corps');
    ({gouvernance, composition, participants, activites, territoire})[etat.onglet]();

    /* ---------- gouvernance ---------- */
    function gouvernance(){
      const orgs = organes(), nbPart = new Set(d.participations.map(p => p.membreId)).size;
      const personnes = new Set(d.affectations.map(a => a.membreId)).size;
      const chaine = [['Ministère continental', affDe(orgCode('continental')).length+' resp.'],['Ministère national', affDe(orgCode('national')).length+' membres'],['Coordination nationale', affDe(orgCode('coordination')).length+' resp.'],
        ['Diocèses', d.dioceses.length],['Paroisses', d.paroisses.length],['Membres et participants', d.membres.filter(m => m.ministereId && B.nom('ministeres', m.ministereId) === 'Intercession').length]];
      corps.innerHTML = `
        <div class="tuile"><h2>Chaîne institutionnelle</h2><div class="sous">Rattachements du ministère d’intercession. Les structures qui n’en relèvent pas directement ne sont pas incluses.</div>
          <div class="chaine">${chaine.map((c,i) => `<div class="maillon m${i%4}"><b>${esc(String(c[1]))}</b><span>${esc(c[0])}</span></div>${i<chaine.length-1?'<i class="fleche">→</i>':''}`).join('')}</div></div>
        <div class="grille c3" style="margin-top:18px">${orgs.map(o => { const l = affDe(o), parent = d.organes.find(x => x.id === o.parentId);
          return `<div class="tuile organe"><div class="sur-organe">${esc(o.niveau)}</div><h2>${esc(o.nom)}</h2><p class="muet petit" style="margin:6px 0 12px">${esc(o.description)}</p>
            <div class="ligne-fiche"><span class="k">Personnes</span><span class="v">${l.length}</span></div>
            <div class="ligne-fiche"><span class="k">Diocèses représentés</span><span class="v">${new Set(l.map(a => a.entite)).size}</span></div>
            <div class="ligne-fiche"><span class="k">Rattaché à</span><span class="v">${parent?esc(parent.nom):'— (sommet de la chaîne)'}</span></div>
            <button class="btn btn-contour btn-bloc btn-s" style="margin-top:14px" data-o="${o.code}">Voir la composition</button></div>`; }).join('')}</div>
        <div class="grille c3" style="margin-top:18px">
          <div class="tuile kpi b"><div class="k">Responsables (3 instances)</div><div class="v">${personnes}</div><div class="note">personnes distinctes</div></div>
          <div class="tuile kpi r"><div class="k">Participants aux formations</div><div class="v">${nbPart}</div><div class="note">personnes distinctes, sans doublon</div></div>
          <div class="tuile kpi j"><div class="k">Activités du ministère</div><div class="v">${actsInterc().length}</div><div class="note">formations, rencontres, retraites…</div></div></div>`;
      corps.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { etat.organe = b.dataset.o; etat.onglet = 'composition'; redraw(); });
    }

    /* ---------- composition des trois bases ---------- */
    function composition(){
      const org = orgCode(etat.organe) || organes()[0], q = norm(etat.q);
      const lst = affDe(org).filter(a => { const m = B.par('membres', a.membreId); return m && (!q || norm(nomComplet(m)+' '+a.entite+' '+(m.tel||'')+' '+(a.fonctionCivile||'')).includes(q)); });
      const autres = id => d.affectations.filter(a => a.membreId === id && a.organeId !== org.id).map(a => (B.par('organes', a.organeId)||{}).code);
      const court = {continental:'Continental', national:'National', coordination:'Coordination'};
      corps.innerHTML = `<div class="outils">${organes().map(o => `<button class="btn ${o.id===org.id?'btn-marine':'btn-contour'} btn-s" data-og="${o.code}">${esc(o.nom.replace(' d’intercession','').replace(' de l’intercession',''))} (${affDe(o).length})</button>`).join('')}
        <input type="search" id="i-q" placeholder="Rechercher un nom, un diocèse, un contact…" value="${esc(etat.q)}"><button class="btn btn-contour btn-s" id="i-csv">Exporter (CSV)</button><button class="btn btn-contour btn-s" id="i-pdf">Imprimer / PDF</button>${admin?'<button class="btn btn-rouge btn-s" id="i-add">+ Ajouter un responsable</button>':''}</div>
        <div class="tuile" style="padding:0;overflow:hidden"><div class="entete-organe"><b>${esc(org.nom)}</b><span class="muet petit">${esc(org.description)}</span></div>
        <table class="tableau"><thead><tr><th>N°</th><th>Diocèse / entité</th><th>Nom et prénoms</th><th>Fonction (vie civile)</th><th>Contact</th><th>E-mail</th><th>Autres instances</th>${admin?'<th></th>':''}</tr></thead><tbody>
        ${lst.length ? lst.map(a => { const m = B.par('membres', a.membreId); return `<tr class="cliquable" data-m="${m.id}"><td>${a.rang}</td><td><b>${esc(a.entite)}</b>${a.fonction?`<div class="petit muet">${esc(a.fonction)}</div>`:''}</td>
          <td><div class="cellule-nom">${X.avatar(m)}<div><div class="n">${esc(nomAffiche(m))}</div></div></div></td>
          <td>${esc(a.fonctionCivile||m.profession||'—')}</td><td class="mono">${esc(m.tel||'—')}</td><td>${esc(m.email||'—')}</td>
          <td>${autres(m.id).map(c => chip(court[c], 'p-neutre')).join(' ')||'—'}</td>${admin?`<td style="white-space:nowrap"><button class="btn btn-contour btn-s" data-ea="${a.id}">Modifier</button> <button class="btn btn-danger btn-s" data-rm="${a.id}">✕</button></td>`:''}</tr>`; }).join('')
          : '<tr><td colspan="8"><div class="vide"><b>Aucun résultat</b></div></td></tr>'}</tbody></table></div>`;
      corps.querySelectorAll('[data-og]').forEach(b => b.onclick = () => { etat.organe = b.dataset.og; redraw(); });
      $('#i-q').oninput = e => { etat.q = e.target.value; composition(); const i = $('#i-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
      corps.querySelectorAll('tr[data-m]').forEach(tr => tr.onclick = ev => { if(!ev.target.closest('[data-rm],[data-ea]')) fiche(tr.dataset.m); });
      corps.querySelectorAll('[data-ea]').forEach(b => b.onclick = () => formAff(B.par('affectations', b.dataset.ea)));
      corps.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { if(confirm('Retirer cette personne de cette instance ? (sa fiche est conservée)')){ B.d.affectations = B.d.affectations.filter(a => a.id !== b.dataset.rm); B.tracer('affectation retirée', b.dataset.rm); B.sauver(); redraw(); } });
      const lignesOrg = lst.map(a => { const m = B.par('membres', a.membreId); return [a.rang, a.entite, m.civilite||'', m.nom, m.prenoms, m.epouseDe||'', a.fonction||'', a.fonctionCivile||m.profession||'', m.tel||'', m.email||'']; });
      const entOrg = ['N°','Diocèse / entité','Civilité','Nom','Prénoms','Épouse de','Fonction dans l\u2019instance','Fonction (vie civile)','Contact','E-mail'];
      $('#i-csv').onclick = () => X.exporter.csv(org.nom, entOrg, lignesOrg);
      $('#i-pdf').onclick = () => X.exporter.imprimer(org.nom, org.description, ['N°','Diocèse / entité','Nom et prénoms','Fonction (vie civile)','Contact','E-mail'], lst.map(a => { const m = B.par('membres', a.membreId); return [a.rang, a.entite, nomAffiche(m), a.fonctionCivile||m.profession||'', m.tel||'', m.email||'']; }));
      if(admin) $('#i-add').onclick = () => formResp(org);
    }
    function formResp(org){
      const v2 = modale('Ajouter à : '+org.nom, `<div class="grille-champs">
        <div><label>Civilité</label><select id="r-civ0"><option value="">—</option>${X.civilites.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div><div><label>Épouse de (si mariée)</label><input type="text" id="r-epo" placeholder="ex. KOUADIO"></div>
        <div class="large"><label>Nom et prénoms *</label><input type="text" id="r-nom" placeholder="ex. KOUASSI Marie"></div>
        <div><label>Diocèse / entité</label><select id="r-dio">${X.options('dioceses','')}</select></div><div><label>Fonction dans l’instance</label><input type="text" id="r-fon"></div>
        <div><label>Fonction (vie civile)</label><input type="text" id="r-civ"></div><div><label>Contact</label><input type="tel" id="r-tel"></div>
        <div class="large"><label>E-mail</label><input type="email" id="r-em"></div></div>`, '<button class="btn btn-contour" id="r-ann">Annuler</button><button class="btn btn-rouge" id="r-ok">Ajouter</button>');
      $('#r-ann', v2).onclick = () => v2.remove();
      $('#r-ok', v2).onclick = () => {
        const nom = $('#r-nom', v2).value.trim(); if(!nom) return toast('Le nom est obligatoire.', true);
        const dio = B.par('dioceses', $('#r-dio', v2).value), k = cle(nom);
        let m = d.membres.find(x => cle(x.nom+' '+x.prenoms) === k);
        if(!m){ const dc = decouper(nom); m = {id:B.uid('mem'), matricule:B.matricule(), nom:dc.nom.toUpperCase(), prenoms:dc.prenoms, nomEtatCivil:nom, civilite:$('#r-civ0', v2).value || dc.civ, epouseDe:($('#r-epo', v2).value.trim() || dc.epouseDe || '').toUpperCase(), tel:$('#r-tel', v2).value.trim(), whatsapp:'', email:$('#r-em', v2).value.trim(), dioceseId:dio?dio.id:'', secteurId:'', paroisseId:'', ministereId:(d.ministeres.find(x => x.nom==='Intercession')||{}).id||'', posteId:'', profession:$('#r-civ', v2).value.trim(), pieces:[], sources:['Ajout manuel'], creeLe:new Date().toISOString()}; d.membres.push(m); }
        if(d.affectations.some(a => a.organeId === org.id && a.membreId === m.id && a.dioceseId === (dio?dio.id:''))) return toast('Cette personne figure déjà dans cette instance pour ce diocèse.', true);
        d.affectations.push({id:B.uid('aff'), organeId:org.id, membreId:m.id, dioceseId:dio?dio.id:'', entite:dio?dio.nom:'Intercession nationale', fonction:$('#r-fon', v2).value.trim(), fonctionCivile:$('#r-civ', v2).value.trim(), rang:affDe(org).length+1});
        B.tracer('affectation ajoutée', nom+' → '+org.nom); B.sauver(); v2.remove(); toast('Responsable ajouté.'); redraw();
      };
    }

    function formAff(a){
      const m = B.par('membres', a.membreId), org = B.par('organes', a.organeId);
      const v2 = modale('Modifier : '+nomAffiche(m)+' — '+org.nom, `<div class="grille-champs">
        <div><label>Diocèse / entité</label><select id="e-dio">${X.options('dioceses', a.dioceseId).replace('value="">—', 'value="">Intercession nationale (aucun diocèse)')}</select></div>
        <div><label>N° d’ordre</label><input type="text" id="e-rang" value="${esc(a.rang)}"></div>
        <div class="large"><label>Fonction dans l’instance</label><input type="text" id="e-fon" value="${esc(a.fonction||'')}" placeholder="ex. Responsable de l’intercession nationale"></div>
        <div class="large"><label>Fonction (vie civile)</label><input type="text" id="e-civ" value="${esc(a.fonctionCivile||m.profession||'')}"></div></div>
        <div class="petit muet" style="margin-top:10px">Pour changer le nom, la civilité, le téléphone ou l’e-mail de la personne, utilisez « Modifier la fiche ».</div>`,
        '<button class="btn btn-contour" id="e-fiche">Modifier la fiche</button><button class="btn btn-contour" id="e-ann">Annuler</button><button class="btn btn-rouge" id="e-ok">Enregistrer</button>');
      $('#e-ann', v2).onclick = () => v2.remove();
      $('#e-fiche', v2).onclick = () => { v2.remove(); X.modifierMembre(m); };
      $('#e-ok', v2).onclick = () => { const dio = B.par('dioceses', $('#e-dio', v2).value);
        a.dioceseId = dio ? dio.id : ''; a.entite = dio ? dio.nom : 'Intercession nationale'; a.fonction = $('#e-fon', v2).value.trim(); a.fonctionCivile = $('#e-civ', v2).value.trim(); a.rang = parseInt($('#e-rang', v2).value, 10) || a.rang;
        B.tracer('affectation modifiée', nomComplet(m)+' — '+org.nom); B.sauver(); v2.remove(); toast('Informations mises à jour.'); redraw(); };
    }

    /* ---------- fiche d'une personne ---------- */
    function fiche(id){
      const m = B.par('membres', id); if(!m) return;
      const affs = d.affectations.filter(a => a.membreId === id), prts = prtsDe(id), u = Photos.url(m);
      const lg = (k, val) => `<div class="ligne-fiche"><span class="k">${k}</span><span class="v">${esc(val||'—')}</span></div>`;
      const v2 = modale(nomAffiche(m), `<div class="fiche-tete"><div class="photo-grande ${u?'avec-photo':''}" ${u?`style="background-image:url('${esc(u)}')"`:''}>${u?'':esc(initiales(m))}</div>
        <div style="flex:1;min-width:0">${lg('Matricule', m.matricule)}${m.nomEtatCivil?lg('Nom à l’état civil (source)', m.nomEtatCivil):''}${lg('Date de naissance', m.dateNaissance?fdate(m.dateNaissance):'')}${lg('Fonction professionnelle', m.profession)}${lg('Contact', m.tel)}${lg('WhatsApp', m.whatsapp && m.whatsapp !== m.tel ? m.whatsapp : '')}${lg('E-mail', m.email)}</div></div>
        <div class="groupe">Implantation</div>${lg('Diocèse', B.nom('dioceses', m.dioceseId))}${lg('Secteur', B.nom('secteurs', m.secteurId))}${lg('Paroisse', B.nom('paroisses', m.paroisseId))}${lg('Ministère · poste', [B.nom('ministeres', m.ministereId), B.nom('postes', m.posteId)].filter(Boolean).join(' · '))}
        <div class="groupe">Responsabilités</div>${affs.length ? affs.map(a => lg(esc((B.par('organes', a.organeId)||{}).nom||''), a.entite+(a.fonction?' · '+a.fonction:''))).join('') : '<div class="muet petit">Aucune</div>'}
        <div class="groupe">Formations et activités</div>${prts.length ? prts.map(p => lg(esc((B.par('activites', p.activiteId)||{}).intitule||''), p.statut)).join('') : '<div class="muet petit">Aucune inscription</div>'}
        <div class="groupe">Provenance des informations</div><div class="petit muet">${esc((m.sources||[]).join(' · ')||'Saisie directe')}</div>`,
        (admin ? '<button class="btn btn-contour" id="f-pho">Photo</button>' : '') + '<button class="btn btn-contour" id="f-imp">Imprimer la fiche</button>' + (admin ? '<button class="btn btn-rouge" id="f-mod">Modifier la fiche</button>' : '') + '<button class="btn btn-contour" id="f-ok">Fermer</button>');
      $('#f-ok', v2).onclick = () => v2.remove();
      $('#f-imp', v2).onclick = () => X.imprimerFiche(m);
      if(admin){ $('#f-mod', v2).onclick = () => { v2.remove(); X.modifierMembre(m); }; $('#f-pho', v2).onclick = () => X.choisirPhoto(m, () => { v2.remove(); redraw(); fiche(id); }); }
    }

    /* ---------- participants : diocèse → paroisse → personne ---------- */
    function participants(){
      const q = norm(etat.q), acts = actsInterc().filter(a => d.participations.some(p => p.activiteId === a.id));
      let l = d.membres.filter(m => estParticipant(m.id));
      if(etat.fDio) l = l.filter(m => m.dioceseId === etat.fDio);
      if(etat.fSec) l = l.filter(m => (m.secteurId || ((B.par('paroisses', m.paroisseId)||{}).secteurId)) === etat.fSec);
      if(etat.annee) l = l.filter(m => prtsDe(m.id).some(p => p.activiteId === etat.annee));
      if(q) l = l.filter(m => norm(nomComplet(m)+' '+(m.nomEtatCivil||'')+' '+B.nom('paroisses', m.paroisseId)+' '+(m.tel||'')).includes(q));
      const gr = new Map();
      l.forEach(m => { const dk = B.nom('dioceses', m.dioceseId) || 'Diocèse non renseigné', pk = (B.nom('paroisses', m.paroisseId) || 'Paroisse non renseignée') + (((B.par('secteurs', m.secteurId || ((B.par('paroisses', m.paroisseId)||{}).secteurId))||{}).nom) ? ' — '+B.par('secteurs', m.secteurId || ((B.par('paroisses', m.paroisseId)||{}).secteurId)).nom : '');
        if(!gr.has(dk)) gr.set(dk, new Map()); const pm = gr.get(dk); if(!pm.has(pk)) pm.set(pk, []); pm.get(pk).push(m); });
      const ouvert = q || etat.fDio ? ' open' : '';
      const prob = Registre.doublons();
      corps.innerHTML = `<div class="outils"><input type="search" id="p-q" placeholder="Rechercher un participant, une paroisse, un contact…" value="${esc(etat.q)}">
        <select id="p-d">${X.options('dioceses', etat.fDio, 'Tous les diocèses')}</select>
        <select id="p-s">${X.options('secteurs', etat.fSec, 'Tous les secteurs')}</select>
        <select id="p-a"><option value="">Toutes les formations</option>${acts.map(a => `<option value="${a.id}" ${a.id===etat.annee?'selected':''}>${esc(a.intitule)}</option>`).join('')}</select>
        <button class="btn btn-contour btn-s" id="p-csv">Exporter (CSV)</button><button class="btn btn-contour btn-s" id="p-pdf">Imprimer / PDF</button>${admin?`<button class="btn btn-rouge btn-s" id="p-insc" ${etat.sel.size?'':'disabled'}>Inscrire la sélection (${etat.sel.size}) à une activité</button>`:''}</div>
        <div class="grille c3" style="margin-bottom:16px"><div class="tuile kpi b"><div class="k">Participants affichés</div><div class="v">${l.length}</div><div class="note">sur ${new Set(d.participations.map(p => p.membreId)).size} au total</div></div>
        <div class="tuile kpi r"><div class="k">Diocèses</div><div class="v">${gr.size}</div><div class="note">représentés</div></div>
        <div class="tuile kpi j"><div class="k">Doublons probables</div><div class="v">${prob.length}</div><div class="note">à vérifier ci-dessous</div></div></div>
        ${gr.size ? [...gr.entries()].sort((a,b) => a[0].localeCompare(b[0])).map(([dk, pm]) => `<details class="acc"${ouvert}><summary><b>${esc(dk)}</b><span>${[...pm.values()].reduce((s,x) => s+x.length, 0)} participant(s) · ${pm.size} paroisse(s)</span></summary>
          ${[...pm.entries()].sort((a,b) => a[0].localeCompare(b[0])).map(([pk, ms]) => `<details class="acc sous"${ouvert}><summary><b>${esc(pk)}</b><span>${ms.length}</span></summary>
            <table class="tableau"><tbody>${ms.sort((a,b) => a.nom.localeCompare(b.nom)).map(m => `<tr class="cliquable" data-m="${m.id}"><td style="width:34px"><input type="checkbox" data-s="${m.id}" ${etat.sel.has(m.id)?'checked':''} style="width:auto"></td>
              <td><div class="cellule-nom">${X.avatar(m)}<b>${esc(nomAffiche(m))}</b></div></td><td>${esc(m.profession||'')}</td><td class="mono">${esc(m.tel||'')}</td><td>${prtsDe(m.id).map(p => chip((((B.par('activites', p.activiteId)||{}).annee)||'?')+(((B.par('activites', p.activiteId)||{}).annee==='1')?'ère':'ème')+' année', 'p-ok')).join(' ')}</td></tr>`).join('')}</tbody></table></details>`).join('')}</details>`).join('')
          : '<div class="tuile vide"><b>Aucun participant</b>Ajustez la recherche ou les filtres.</div>'}
        ${prob.length ? `<div class="tuile" style="margin-top:18px"><h2>Doublons à vérifier</h2><div class="sous">Aucune fiche n’est fusionnée sur une simple ressemblance de noms : vous décidez, et chaque fusion peut être annulée.</div>
          ${prob.slice(0, 40).map(p => `<div class="ligne-fiche"><span><b>${esc(nomAffiche(p.a))}</b> <span class="muet">↔</span> <b>${esc(nomAffiche(p.b))}</b> <span class="pastille ${p.niveau==='certain'?'p-ok':'p-warn'}">${p.niveau==='certain'?'très probable':'probable'} · ${p.score} %</span> <span class="muet petit">${esc(p.raison)}</span></span>${admin?`<span style="white-space:nowrap"><button class="btn btn-contour btn-s" data-fu="${p.a.id}|${p.b.id}">Examiner et fusionner</button> <button class="btn btn-contour btn-s" data-ig="${p.a.id}|${p.b.id}">Deux personnes</button></span>`:''}</div>`).join('')}</div>` : ''}`;
      corps.insertAdjacentHTML('beforeend', historiqueFusions());
      corps.querySelectorAll('[data-undo]').forEach(b => b.onclick = () => annulerFusion(b.dataset.undo));
      $('#p-q').oninput = e => { etat.q = e.target.value; participants(); const i = $('#p-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
      $('#p-d').onchange = e => { etat.fDio = e.target.value; participants(); };
      $('#p-s').onchange = e => { etat.fSec = e.target.value; participants(); };
      $('#p-csv').onclick = () => X.exporter.csv('participants', X.COLS_MEMBRE, l.map(X.ligneMembre));
      $('#p-pdf').onclick = () => X.exporter.imprimer('Participants aux formations', l.length+' participant(s)', ['Nom et prénoms','Diocèse','Paroisse','Fonction','Contact'], l.slice().sort((x, y) => x.nom.localeCompare(y.nom)).map(m => [nomAffiche(m), B.nom('dioceses', m.dioceseId), B.nom('paroisses', m.paroisseId), m.profession||'', m.tel||'']));
      $('#p-a').onchange = e => { etat.annee = e.target.value; participants(); };
      corps.querySelectorAll('tr[data-m]').forEach(tr => tr.onclick = ev => { if(ev.target.matches('input')) return; fiche(tr.dataset.m); });
      corps.querySelectorAll('[data-s]').forEach(c => c.onchange = () => { c.checked ? etat.sel.add(c.dataset.s) : etat.sel.delete(c.dataset.s); const b = $('#p-insc'); if(b){ b.disabled = !etat.sel.size; b.textContent = 'Inscrire la sélection ('+etat.sel.size+') à une activité'; } });
      corps.querySelectorAll('[data-fu]').forEach(b => b.onclick = () => fusionner(...b.dataset.fu.split('|')));
      corps.querySelectorAll('[data-ig]').forEach(b => b.onclick = () => { const [x, y] = b.dataset.ig.split('|'); Registre.distinctes(x, y); participants(); });
      if(admin && $('#p-insc')) $('#p-insc').onclick = () => {
        const cibles = actsInterc(); if(!cibles.length) return toast('Créez d’abord une activité.', true);
        const v2 = modale('Inscrire '+etat.sel.size+' personne(s)', `<label class="petit" style="font-weight:700">Activité</label><select id="x-act">${cibles.map(a => `<option value="${a.id}">${esc(a.intitule)}</option>`).join('')}</select>`, '<button class="btn btn-contour" id="x-ann">Annuler</button><button class="btn btn-rouge" id="x-ok">Inscrire</button>');
        $('#x-ann', v2).onclick = () => v2.remove();
        $('#x-ok', v2).onclick = () => { const aid = $('#x-act', v2).value; let n = 0; etat.sel.forEach(id => { if(!d.participations.some(p => p.activiteId === aid && p.membreId === id)){ d.participations.push({id:B.uid('prt'), activiteId:aid, membreId:id, statut:'inscrit', modules:{}}); n++; } });
          B.tracer('inscriptions', n+' → '+aid); B.sauver(); etat.sel.clear(); v2.remove(); toast(n+' inscription(s) ajoutée(s).'); redraw(); };
      };
    }
    const carteFusion = (m, defaut) => `<label class="choix-fusion"><input type="radio" name="garde" value="${m.id}" ${defaut?'checked':''}><div style="min-width:0"><div class="cellule-nom">${X.avatar(m)}<b>${esc(nomAffiche(m))}</b></div>
      <div class="petit muet" style="margin-top:6px">État civil source : ${esc(m.nomEtatCivil||'—')}</div><div class="petit">${esc([B.nom('dioceses', m.dioceseId), B.nom('paroisses', m.paroisseId)].filter(Boolean).join(' · ')||'—')} · ${esc(m.tel||'sans contact')}</div><div class="petit muet">${esc((m.sources||[]).join(' · '))}</div></div></label>`;
    function fusionner(a, b){
      const A = B.par('membres', a), Bm = B.par('membres', b); if(!A || !Bm) return;
      // par défaut on conserve la fiche qui porte l'état civil (nom de naissance + « Épouse de »), sinon la plus complète
      const sc = m => (m.epouseDe ? 4 : 0) + Identite.jetons(m.nom+' '+m.prenoms).length * .1 + (Photos.url(m) ? .5 : 0);
      const def = sc(Bm) > sc(A) ? Bm.id : A.id;
      const v2 = modale('Fusionner deux fiches', `<p class="petit" style="margin-top:0">Choisissez la fiche à <b>conserver</b> : son identité (nom, prénoms, épouse) reste. L’autre est supprimée ; ses informations manquantes, sa photo, ses inscriptions et ses responsabilités passent sur la fiche conservée. <b>Vous pourrez annuler.</b></p>
        <div class="grille c2">${carteFusion(A, def === A.id)}${carteFusion(Bm, def === Bm.id)}</div>
        <div class="petit muet" style="margin-top:10px">Conseil : conservez la fiche qui porte le nom d’état civil (nom de naissance, puis « Épse » + nom du mari).</div>`,
        '<button class="btn btn-contour" id="fu-ann">Annuler</button><button class="btn btn-rouge" id="fu-ok">Fusionner</button>');
      $('#fu-ann', v2).onclick = () => v2.remove();
      $('#fu-ok', v2).onclick = () => { const g = v2.querySelector('input[name=garde]:checked').value; v2.remove(); executerFusion(g, g === a ? b : a); };
    }
    function executerFusion(g, r){
      const S = B.par('membres', g); if(!Registre.fusionner(g, r)) return;
      toast('Fiches fusionnées : « '+nomAffiche(S)+' » est conservée.'); redraw();
    }
    function annulerFusion(id){
      const rec = (d.meta.fusions||[]).find(x => x.id === id); if(!rec) return;
      const S = B.par('membres', rec.gardeId), idR = rec.retire.id; if(!S) return toast('Impossible : la fiche conservée n’existe plus.', true);
      if(!confirm('Annuler cette fusion et rétablir la fiche « '+nomAffiche(rec.retire)+' » ?')) return;
      d.membres.push(rec.retire);
      Object.keys(rec.champs).forEach(c => { if(S[c] === rec.champs[c]) S[c] = ''; });
      S.sources = rec.sourcesAvant;
      d.participations.forEach(p => { if(rec.parts.includes(p.id)) p.membreId = idR; }); d.participations.push(...rec.partsSupp);
      d.affectations.forEach(x => { if(rec.affs.includes(x.id)) x.membreId = idR; }); d.affectations.push(...rec.affsSupp);
      d.presences.forEach(x => { if(rec.pres.includes(x.id)) x.membreId = idR; }); d.presences.push(...rec.presSupp);
      if(rec.photo === 'fichier' && S.photoFichier === rec.retire.photoFichier) S.photoFichier = ''; else if(rec.photo === 'idb') Photos.deplacer(rec.gardeId, idR);
      d.meta.fusions = d.meta.fusions.filter(x => x.id !== id);
      B.tracer('fusion annulée', nomComplet(rec.retire)); B.sauver(); toast('Fusion annulée.'); redraw();
    }
    function historiqueFusions(){
      const l = d.meta.fusions || []; if(!l.length) return '';
      return `<div class="tuile" style="margin-top:18px"><h2>Fusions effectuées</h2><div class="sous">Chaque fusion garde de quoi la défaire.</div>${l.slice().reverse().map(f => { const S = B.par('membres', f.gardeId);
        return `<div class="ligne-fiche"><span><b>${esc(nomAffiche(f.retire))}</b> <span class="muet">→ fusionnée dans</span> <b>${esc(S?nomAffiche(S):'(fiche supprimée)')}</b> <span class="muet petit">${new Date(f.date).toLocaleDateString('fr-FR')}</span></span>${admin?`<button class="btn btn-contour btn-s" data-undo="${f.id}">Annuler la fusion</button>`:''}</div>`; }).join('')}</div>`;
    }

    /* ---------- activités du ministère ---------- */
    function activites(){
      const l = actsInterc().sort((a,b) => (a.date||'~').localeCompare(b.date||'~'));
      corps.innerHTML = `<div class="outils"><span class="muet petit" style="flex:1">Formations bibliques, rassemblements et rencontres nationales, activités diocésaines et paroissiales, sessions de renforcement des capacités.</span>${admin?'<button class="btn btn-rouge btn-s" id="a-new">+ Nouvelle activité du ministère</button>':''}</div>
        <div class="tuile" style="padding:0;overflow:hidden"><table class="tableau"><thead><tr><th>Activité</th><th>Niveau</th><th>Date</th><th>Inscrits</th><th>Présents</th><th>Statut</th><th></th></tr></thead><tbody>
        ${l.length ? l.map(a => `<tr><td><b>${esc(a.intitule)}</b><div class="petit muet">${esc(B.nom('typesActivite', a.typeId))}${a.lieu?' · '+esc(a.lieu):''}</div></td><td>${esc(a.niveau||'—')}</td><td>${esc(a.date?fdate(a.date):'à fixer')}</td>
          <td><b>${d.participations.filter(p => p.activiteId === a.id).length}</b></td><td><b>${d.presences.filter(p => p.activiteId === a.id).length}</b></td><td>${X.pStatut(a.statut)}</td>
          <td style="white-space:nowrap"><button class="btn btn-contour btn-s" data-li="${a.id}">Liste</button>${admin?` <button class="btn btn-contour btn-s" data-im="${a.id}">Importer une liste</button> <button class="btn btn-contour btn-s" data-ed="${a.id}">Modifier</button> <button class="btn btn-contour btn-s" data-ct="${a.id}">Contrôler</button>`:''}</td></tr>`).join('') : '<tr><td colspan="7"><div class="vide"><b>Aucune activité</b></div></td></tr>'}</tbody></table></div><div id="a-detail"></div>`;
      corps.querySelectorAll('[data-li]').forEach(b => b.onclick = () => liste(b.dataset.li));
      corps.querySelectorAll('[data-im]').forEach(b => b.onclick = () => Registre.importer(X, b.dataset.im));
      corps.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => X.modifierActivite(B.par('activites', b.dataset.ed)));
      corps.querySelectorAll('[data-ct]').forEach(b => b.onclick = () => X.controler(b.dataset.ct));
      if(admin) $('#a-new').onclick = formAct;
      if(etat.act && B.par('activites', etat.act)) liste(etat.act);
    }
    function liste(id){
      etat.act = id;
      const a = B.par('activites', id), prts = d.participations.filter(p => p.activiteId === id).map(p => ({p, m:B.par('membres', p.membreId)})).filter(x => x.m).sort((x,y) => x.m.nom.localeCompare(y.m.nom));
      const mods = a.modules || [];
      $('#a-detail').innerHTML = `<div class="tuile" style="margin-top:18px"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px"><div><h2>${esc(a.intitule)}</h2><div class="sous" style="margin:0">${prts.length} inscrit(s)${mods.length?' · suivi des modules':''}</div></div>
        <div style="display:flex;gap:8px"><button class="btn btn-contour btn-s" id="l-csv">Exporter (CSV)</button><button class="btn btn-contour btn-s" id="l-pdf">Imprimer / PDF</button>${admin?'<button class="btn btn-danger btn-s" id="l-fer">Fermer</button>':''}</div></div>
        <div style="max-height:420px;overflow:auto"><table class="tableau"><thead><tr><th>N°</th><th>Nom et prénoms</th><th>Diocèse</th><th>Paroisse</th><th>Contact</th>${mods.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>
        ${prts.map((x, i) => `<tr><td>${i+1}</td><td><b>${esc(nomComplet(x.m))}</b></td><td>${esc(B.nom('dioceses', x.m.dioceseId)||'—')}</td><td>${esc(B.nom('paroisses', x.m.paroisseId)||'—')}</td><td class="mono">${esc(x.m.tel||'—')}</td>${mods.map((_, k) => `<td><input type="checkbox" data-md="${x.p.id}|${k}" ${(x.p.modules||{})['m'+k]?'checked':''} ${admin?'':'disabled'} style="width:auto"></td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
      $('#a-detail').querySelectorAll('[data-md]').forEach(c => c.onchange = () => { const [pid, k] = c.dataset.md.split('|'), p = B.par('participations', pid); p.modules = p.modules || {}; p.modules['m'+k] = c.checked; B.sauver(); });
      $('#l-csv').onclick = () => { const L = ['N°;Nom;Prénoms;Diocèse;Paroisse;Contact'+mods.map(x => ';'+x).join('')]; prts.forEach((x, i) => L.push([i+1, x.m.nom, x.m.prenoms, B.nom('dioceses', x.m.dioceseId), B.nom('paroisses', x.m.paroisseId), x.m.tel].concat(mods.map((_, k) => (x.p.modules||{})['m'+k] ? 'oui' : '')).join(';')));
        const u = URL.createObjectURL(new Blob(['﻿'+L.join('\n')], {type:'text/csv'})), e = document.createElement('a'); e.href = u; e.download = 'liste-'+norm(a.intitule).replace(/ /g, '-').slice(0, 50)+'.csv'; e.click(); URL.revokeObjectURL(u); };
      $('#l-pdf').onclick = () => X.exporter.imprimer(a.intitule, a.date?fdate(a.date):'', ['N°','Nom et prénoms','Diocèse','Paroisse','Contact'].concat(mods), prts.map((x, i) => [i+1, nomAffiche(x.m), B.nom('dioceses', x.m.dioceseId), B.nom('paroisses', x.m.paroisseId), x.m.tel||''].concat(mods.map((_, k) => (x.p.modules||{})['m'+k] ? 'oui' : ''))));
      if(admin) $('#l-fer').onclick = () => { etat.act = ''; $('#a-detail').innerHTML = ''; }; else $('#l-fer')?.remove();
    }
    function formAct(){
      const v2 = modale('Nouvelle activité du ministère', `<div class="grille-champs"><div class="large"><label>Intitulé *</label><input type="text" id="n-int"></div>
        <div><label>Type</label><select id="n-typ">${X.options('typesActivite', '')}</select></div><div><label>Niveau</label><select id="n-niv"><option>national</option><option>diocésain</option><option>paroissial</option></select></div>
        <div><label>Date (si connue)</label><input type="date" id="n-dat"></div><div><label>Lieu</label><input type="text" id="n-lie"></div></div>`, '<button class="btn btn-contour" id="n-ann">Annuler</button><button class="btn btn-rouge" id="n-ok">Créer</button>');
      $('#n-ann', v2).onclick = () => v2.remove();
      $('#n-ok', v2).onclick = () => { const i = $('#n-int', v2).value.trim(); if(!i) return toast('Intitulé obligatoire.', true);
        d.activites.push({id:B.uid('act'), intitule:i, typeId:$('#n-typ', v2).value, date:$('#n-dat', v2).value, heure:'', lieu:$('#n-lie', v2).value.trim(), statut:'en préparation', responsable:'', ministere:'intercession', niveau:$('#n-niv', v2).value, modules:[]});
        B.tracer('activité ministère', i); B.sauver(); v2.remove(); redraw(); };
    }

    /* ---------- territoire : diocèse → paroisses ---------- */
    function territoire(){
      const cn = orgCode('coordination'), na = orgCode('national'), co = orgCode('continental');
      const noms = (org, dioId) => d.affectations.filter(a => a.organeId === org.id && a.dioceseId === dioId).map(a => nomComplet(B.par('membres', a.membreId))).join(', ') || '—';
      corps.innerHTML = `<div class="tuile" style="padding:0;overflow:hidden"><table class="tableau"><thead><tr><th>Diocèse</th><th>Coordination nationale</th><th>Ministère national</th><th>Ministère continental</th><th>Paroisses</th><th>Participants</th></tr></thead><tbody>
        ${d.dioceses.filter(x => !x.demo).map(x => `<tr><td><b>${esc(x.nom)}</b></td><td>${esc(noms(cn, x.id))}</td><td>${esc(noms(na, x.id))}</td><td>${esc(noms(co, x.id))}</td><td>${d.paroisses.filter(p => p.dioceseId === x.id).length}</td><td><b>${d.membres.filter(m => m.dioceseId === x.id && estParticipant(m.id)).length}</b></td></tr>`).join('')}</tbody></table></div>
        <div class="tuile" style="margin-top:18px"><h2>Paroisses et participants</h2><div class="sous">Paroisses connues par les listes de formation, avec leur nombre de participants.</div>
        ${d.dioceses.filter(x => !x.demo && d.paroisses.some(p => p.dioceseId === x.id)).map(x => `<details class="acc"><summary><b>${esc(x.nom)}</b><span>${d.paroisses.filter(p => p.dioceseId === x.id).length} paroisse(s)</span></summary>
          <table class="tableau"><tbody>${d.paroisses.filter(p => p.dioceseId === x.id).sort((a,b) => a.nom.localeCompare(b.nom)).map(p => `<tr><td>${esc(p.nom)}</td><td style="text-align:right"><b>${d.membres.filter(m => m.paroisseId === p.id && estParticipant(m.id)).length}</b> participant(s)</td></tr>`).join('')}</tbody></table></details>`).join('')}</div>`;
    }
  }
  window.Intercession = {ouvrirOnglet: o => { etat.onglet = o; }, semer, migrer, vue, decouper, activitesDuRenouveau, disponible, demanderCode};
})();
