/* app.js — interface du Système National RCCI : connexion multi-comptes, navigation à droite,
   pages selon le rôle, contrôle par pièce d'identité. */
(function(){
  'use strict';
  const $ = (s, r) => (r||document).querySelector(s);
  const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const B = Base, R = Roles;
  const SIGNATURE = '<span class="signature"><span>Conçu par</span> <b>BuildCode</b><i>N</i></span>';
  const LOGO = 'assets/img/logo-rcci-2.png';
  const ico = {
    accueil:'<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
    membres:'<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.6 0 4 1.9 4 4.6"/>',
    activites:'<rect x="3.5" y="4.5" width="17" height="16" rx="3"/><path d="M3.5 9.5h17M8 3v3M16 3v3"/>',
    controle:'<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="11" r="2.6"/><path d="M7.5 17c.7-2 2.4-3 4.5-3s3.8 1 4.5 3"/>',
    stats:'<path d="M4 20V10M11 20V4M18 20v-7"/>',
    utilisateurs:'<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
    ref:'<path d="M5 5h14v4H5zM5 11h14v4H5zM5 17h14v3H5z"/>',
    inscriptions:'<rect x="3.5" y="6" width="17" height="12" rx="3"/><circle cx="12" cy="12" r="2.6"/><path d="M7 9.5h.01M17 14.5h.01"/>',
    archives:'<rect x="3.5" y="4" width="17" height="5" rx="1.5"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/>',
    formation:'<path d="M3 9l9-4.5L21 9l-9 4.5z"/><path d="M7 11.5V16c1.4 1.4 3 2 5 2s3.6-.6 5-2v-4.5M21 9v5"/>',
    intercession:'<path d="M12 3c2 3-1 4-1 6.5 0 1.5 1 2.5 2.4 2.5S16 11 16 9.5c0-1-.6-1.8-.6-1.8s1.6 1 1.6 3.3c0 2.8-2.4 5-5 5s-5-2.2-5-5c0-4 3.8-5.4 5-9z"/><path d="M4 20h16M7 17.5c1.6 1 3.2 1.5 5 1.5s3.4-.5 5-1.5"/>'
  };
  const svg = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ico[n]}</svg>`;
  const PAGES = [
    {id:'accueil', nom:'Tableau de bord', sur:'Vue d’ensemble', groupe:'Pilotage'},
    {id:'membres', nom:'Registre national', sur:'Membres du Renouveau', groupe:'Base nationale'},
    {id:'activites', nom:'Activités', sur:'Rencontres et événements', groupe:'Terrain'},
    {id:'inscriptions', nom:'Inscriptions', sur:'Cotisations et participants', groupe:'Terrain'},
    {id:'formation', nom:'Formation biblique', sur:'Modules, admission et diplômes', groupe:'Terrain'},
    {id:'archives', nom:'Archives', sur:'Comptes rendus et rapports', groupe:'Administration'},
    {id:'controle', nom:'Contrôle', sur:'Poste de contrôle', groupe:'Terrain'},
    {id:'intercession', nom:'Intercession', sur:'Ministère d’intercession', groupe:'Intercession'},
    {id:'stats', nom:'Statistiques', sur:'Analyse', groupe:'Analyse'},
    {id:'utilisateurs', nom:'Utilisateurs', sur:'Administration', groupe:'Administration'},
    {id:'ref', nom:'Listes de référence', sur:'Administration', groupe:'Administration'}
  ];
  let user = null, page = 'accueil', horlogeTimer = null;
  const etat = { membreSel:null, recherche:'', refSec:'', fDio:'', fSec:'', fMin:'', refOnglet:'dioceses', stat:'',
    ctrl:{activiteId:'', type:'cni', nom:'', numero:'', naissance:'', mem:true, res:null, choisi:null, valide:null, nouveau:false, auto:false, scan:false, scanAuto:false, scanNom:'', scanPrenoms:''} };

  /* ------------------------------------------------------------ utilitaires */
  function toast(msg, ko){ const z=$('#toasts'), t=document.createElement('div'); t.className='toast'+(ko?' ko':''); t.textContent=msg; z.appendChild(t); setTimeout(()=>t.remove(),3800); }
  const initiales = m => ((m.prenoms||'?')[0] + (m.nom||'?')[0]).toUpperCase();
  const nomComplet = m => m.nom + ' ' + m.prenoms;
  const CIVILITES = [['M.','Monsieur'],['Mme','Madame'],['Mlle','Mademoiselle']];
  const nomAffiche = m => (m.civilite ? m.civilite+' ' : '') + nomComplet(m) + (m.epouseDe ? ' Épse '+m.epouseDe : '');

  /* ---- photos, listes et fiches imprimables ---- */
  const avatar = (m, cls) => { const u = Photos.url(m); return `<span class="avatar ${cls||''} ${u?'avec-photo':''}" ${u?`style="background-image:url('${esc(u)}')"`:''}>${u?'':esc(initiales(m))}</span>`; };
  const COLS_MEMBRE = ['Civilité','Nom','Prénoms','Épouse de','Matricule','Diocèse','Secteur','Paroisse','Ministère','Poste','Fonction','Téléphone','WhatsApp','E-mail'];
  const ligneMembre = m => [m.civilite||'', m.nom, m.prenoms, m.epouseDe||'', m.matricule, B.nom('dioceses',m.dioceseId), B.nom('secteurs',m.secteurId), B.nom('paroisses',m.paroisseId), B.nom('ministeres',m.ministereId), B.nom('postes',m.posteId), m.profession||'', m.tel||'', m.whatsapp||'', m.email||''];
  /* Colonnes de la liste des membres (ordre demandé ; les dernières sont facultatives) */
  const civiliteLongue = m => ({'M.':'Monsieur', 'Mme':'Madame', 'Mlle':'Mademoiselle'})[m.civilite] || (m.sexe==='M'?'Monsieur':m.sexe==='F'?'Madame':'');
  const COLONNES_LISTE = [
    ['num','N°',1,(m,i)=>i+1], ['mat','Matricule',1,m=>m.matricule], ['civ','Civilité',1,civiliteLongue], ['nom','Nom',1,m=>m.nom], ['pre','Prénoms',1,m=>m.prenoms],
    ['dio','Diocèse',1,m=>B.nom('dioceses',m.dioceseId)], ['par','Paroisse',1,m=>B.nom('paroisses',m.paroisseId)], ['pro','Profession',1,m=>m.profession||''], ['min','Ministère',1,m=>B.nom('ministeres',m.ministereId)], ['wha','WhatsApp',1,m=>m.whatsapp||m.tel||''],
    ['epo','Épouse de',0,m=>m.epouseDe||''], ['sec','Secteur',0,m=>B.nom('secteurs',secteurIdDe(m))], ['pos','Poste',0,m=>B.nom('postes',m.posteId)], ['tel','Téléphone',0,m=>m.tel||''], ['mail','E-mail',0,m=>m.email||''], ['sig','Émargement',0,()=>'']
  ].map(([id,nom,d,val]) => ({id, nom, defaut:!!d, val}));
  const listeMembres = l => Exports.choisirColonnes({cle:'membres', titre:'Liste des membres', sousTitre:[l.length+' membre(s)', etat.fDio?B.nom('dioceses',etat.fDio):'', etat.fSec?B.nom('secteurs',etat.fSec):'', etat.fMin?B.nom('ministeres',etat.fMin):''].filter(Boolean).join(' · '), colonnes:COLONNES_LISTE, elements:l.slice(), modale});
  function imprimerFiche(m){
    Exports.fiche(nomAffiche(m), Photos.url(m), initiales(m), [['Nom complet', nomAffiche(m)], ['Matricule', m.matricule], ['Date de naissance', m.dateNaissance?fdate(m.dateNaissance):''], ['Sexe', m.sexe],
      ['Diocèse', B.nom('dioceses',m.dioceseId)], ['Secteur', B.nom('secteurs',m.secteurId)], ['Paroisse', B.nom('paroisses',m.paroisseId)], ['Ministère', B.nom('ministeres',m.ministereId)], ['Poste de responsabilité', B.nom('postes',m.posteId)],
      ['Fonction / profession', m.profession], ['Contact', m.tel], ['WhatsApp', m.whatsapp], ['E-mail', m.email]]);
  }
  function choisirPhoto(m, apres){
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
    i.onchange = async () => { if(!i.files[0]) return; try { await Photos.depuisFichier(m.id, i.files[0]); B.tracer('photo', m.matricule); toast('Photo enregistrée.'); } catch(e){ toast('Photo illisible.', true); } if(apres) apres(); else dessiner(); };
    i.click();
  }
  function importerPhotos(){
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.multiple = true;
    i.onchange = async () => {
      if(!i.files.length) return;
      const rap = await Photos.importerLot([...i.files], B.d.membres);
      const v = modale('Importation des photos', `<div class="alerte-boite ok" style="margin-top:0"><b>${rap.ok.length} photo(s) rattachée(s)</b> à la bonne fiche.</div>
        ${rap.ambigu.length?`<div class="groupe">À confirmer (${rap.ambigu.length})</div>${rap.ambigu.map((x,k)=>`<div class="ligne-fiche"><span>${esc(x.fichier)}</span><span><select data-k="${k}" style="width:auto"><option value="">— ignorer —</option>${x.cand.map(c=>`<option value="${c.id}">${esc(nomAffiche(c))}</option>`).join('')}</select></span></div>`).join('')}`:''}
        ${rap.inconnu.length?`<div class="groupe">Non reconnues (${rap.inconnu.length})</div>${rap.inconnu.map(x=>`<div class="ligne-fiche"><span>${esc(x.fichier)}</span><span class="muet petit">${esc(x.raison)}</span></div>`).join('')}<div class="petit muet" style="margin-top:8px">Nommez le fichier comme la personne (« MARTIN Marie.jpg ») ou par son matricule (« RCCI-000012.jpg »), ou utilisez le bouton Photo de sa fiche.</div>`:''}`,
        '<button class="btn btn-rouge" id="ip-ok">Terminer</button>');
      $('#ip-ok', v).onclick = async () => { for(const s of v.querySelectorAll('select[data-k]')){ if(s.value) await Photos.depuisFichier(s.value, rap.ambigu[+s.dataset.k].f); } B.tracer('import photos', rap.ok.length+' rattachées'); v.remove(); dessiner(); };
    };
    i.click();
  }
  /** Champ de saisie libre avec suggestions : on tape un nom, la liste propose l'existant ; un nom nouveau est créé à l'enregistrement. */
  function champListe(id, label, coll, nom, filtre){
    const l = B.d[coll].filter(filtre || (() => true));
    return `<div><label>${label}</label><input type="text" id="${id}" list="${id}-l" value="${esc(nom||'')}" autocomplete="off"><datalist id="${id}-l">${l.map(x => `<option value="${esc(x.nom)}">`).join('')}</datalist></div>`;
  }
  function resoudre(coll, nom, extra){
    nom = (nom||'').trim(); if(!nom) return '';
    const e = B.d[coll].find(x => Identite.norm(x.nom) === Identite.norm(nom) && Object.keys(extra||{}).every(k => x[k] === extra[k]));
    if(e) return e.id;
    const o = B.ajouter(coll, Object.assign({nom}, extra||{})); B.tracer('création '+coll, nom); return o.id;
  }
  /** Secteur d'une personne : celui de sa fiche, sinon celui de sa paroisse (structure : diocèse → secteur → paroisse → membre). */
  const secteurIdDe = m => m.secteurId || ((B.par('paroisses', m.paroisseId)||{}).secteurId) || '';
  const lieu = m => [B.nom('dioceses',m.dioceseId), B.nom('secteurs',secteurIdDe(m))].filter(Boolean).join(' · ') || '—';
  const fdate = s => s ? new Date(s+'T00:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'}) : '—';
  const heure = iso => new Date(iso).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  const mesMembres = () => R.membresVisibles(user);
  const peut = a => R.peut(user, a);
  function options(coll, sel, tous){
    return (tous!==undefined?`<option value="">${esc(tous)}</option>`:'<option value="">—</option>') + B.d[coll].map(x=>`<option value="${x.id}" ${x.id===sel?'selected':''}>${esc(x.nom)}</option>`).join('');
  }
  function modale(titre, corps, boutons){
    const v = document.createElement('div'); v.className='voile';
    v.innerHTML = `<div class="modale" role="dialog" aria-modal="true"><h2>${esc(titre)}</h2><div class="corps">${corps}</div><div class="pied-modale">${boutons||''}</div></div>`;
    v.addEventListener('mousedown', e => { if(e.target===v) v.remove(); });
    document.body.appendChild(v); return v;
  }

  /* ---------------------------------------------------------------- connexion */
  /* Deux écrans, comme GCHFlow : une carte d'accueil (logo, bouton), puis la carte de connexion. */
  function ecranEntree(msg, direct){
    clearInterval(horlogeTimer); user = null;
    const e = $('#ecran-accueil'); e.hidden = false; $('#appli').hidden = true;
    if(!direct && !msg) return ecranAccueil();
    const enLigne = location.protocol === 'https:' && !/[?&]demo=1/.test(location.search);   // en ligne, les comptes de démonstration restent cachés, sauf adresse « ?demo=1 » (version d'essai)
    e.innerHTML = `<div class="orbite o1"></div><div class="orbite o2"></div>
      <form class="carte-entree" id="f-entree" autocomplete="off">
        <img class="logo petit" src="${LOGO}" alt="Renouveau Charismatique Catholique — Côte d'Ivoire">
        <h1>Connexion</h1>
        <p class="sous">Accédez à la base nationale des membres.</p>
        ${msg?`<div class="erreur-entree">${esc(msg)}</div>`:''}
        <div class="champ-bloc"><label class="etiq-champ" for="em">Adresse électronique</label><input type="email" id="em" placeholder="prenom@rcci.ci" autocomplete="username" required></div>
        <div class="champ-bloc"><label class="etiq-champ" for="mp">Mot de passe</label><input type="password" id="mp" placeholder="••••••••••" autocomplete="current-password" required></div>
        <button class="btn btn-rouge btn-bloc" type="submit" style="margin-top:6px">Se connecter</button>
        ${enLigne?'':`<details class="demo"><summary>Comptes de démonstration</summary><div class="demo-corps">
          <div class="demo-mdp"><b>Mot de passe commun : </b><span class="mono">${esc(R.MDP_DEMO)}</span></div>
          <div class="demo-liste">${R.COMPTES_DEMO.map(c=>`<a href="#" class="demo-compte" data-e="${esc(c.email)}" title="Remplir la connexion de ${esc(R.ROLES[c.role].nom)}"><b>${esc(R.ROLES[c.role].nom)}</b><span>${esc(c.email)}</span></a>`).join('')}</div></div></details>`}
        <div class="pied-entree"><button class="lien-retour" type="button" id="b-retour">← Retour</button>${SIGNATURE}</div>
      </form>`;
    e.querySelectorAll('a.demo-compte').forEach(a => a.onclick = ev => { ev.preventDefault(); $('#em').value = a.dataset.e; $('#mp').value = R.MDP_DEMO; $('#mp').focus();
      e.querySelectorAll('a.demo-compte').forEach(x => x.classList.toggle('choisi', x===a)); });
    $('#b-retour').onclick = ecranAccueil;
    const dm = e.querySelector('details.demo'); if(dm) dm.addEventListener('toggle', () => $('#f-entree').classList.toggle('demo-ouvert', dm.open));
    $('#f-entree').onsubmit = async ev => {
      ev.preventDefault();
      const u = await R.connexion($('#em').value, $('#mp').value);
      if(!u){ B.tracer('connexion refusée', $('#em').value); return ecranEntree('Adresse ou mot de passe incorrect.', true); }
      try { sessionStorage.setItem('rcci.uid', u.id); } catch(_){}
      B.tracer('connexion', u.email); B.sauver(); ouvrir(u);
    };
    $('#em').focus();
  }
  function ecranAccueil(){
    const e = $('#ecran-accueil'); e.hidden = false;
    e.innerHTML = `<div class="orbite o1"></div><div class="orbite o2"></div>
      <div class="carte-entree" role="region" aria-label="Accueil du Système National de Gestion">
        <img class="logo" src="${LOGO}" alt="Renouveau Charismatique Catholique — Côte d'Ivoire">
        <p class="baseline">Gestion des membres, des activités et des présences du Renouveau Charismatique</p>
        <p class="pastille-etab">Côte d’Ivoire · Paix et joie</p>
        <button class="btn btn-rouge btn-bloc" type="button" id="b-entrer">Accéder à l’application</button>
        <p class="note-entree">Membres · Activités · Contrôle · Statistiques</p>
        ${SIGNATURE}
      </div>`;
    const entrer = () => { document.removeEventListener('keydown', clav); ecranEntree(null, true); };
    const clav = ev => { if(ev.key==='Enter'||ev.key===' '){ ev.preventDefault(); entrer(); } };
    $('#b-entrer').onclick = entrer; document.addEventListener('keydown', clav);
    setTimeout(() => { const b=$('#b-entrer'); if(b) b.focus({preventScroll:true}); }, 700);
  }
  function ouvrir(u){
    user = u; $('#ecran-accueil').hidden = true; $('#appli').hidden = false;
    page = R.role(u).pages[0]; dessiner();
  }

  /* ------------------------------------------------------------------ squelette */
  function horlogeHtml(){
    const j = ['L','M','M','J','V','S','D'], auj = (new Date().getDay()+6)%7, now = new Date();
    return `<div class="horloge"><div class="haut"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="2.5"/><circle cx="22" cy="22" r="19" fill="none" stroke="url(#gh)" stroke-width="2.5" stroke-dasharray="40 120" stroke-linecap="round" transform="rotate(-90 22 22)"/><defs><linearGradient id="gh"><stop stop-color="#FFE600"/><stop offset="1" stop-color="#FF5A3C"/></linearGradient></defs><path d="M22 11v11l7 4" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>
      <div><div class="heure" id="h-heure">${now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</div><div class="date"><b>${now.toLocaleDateString('fr-FR',{weekday:'long'})}</b> ${now.toLocaleDateString('fr-FR',{day:'numeric',month:'long'})}</div></div></div>
      <div class="semaine">${j.map((x,i)=>`<span class="${i===auj?'auj':''}">${x}</span>`).join('')}</div></div>`;
  }
  /** Menu latéral en tiroir sur téléphone et tablette (≤ 900 px) : ouvert/fermé par le bouton, le voile ou la touche Échap. */
  function menu(ouvrir){
    const b = $('#barre'), vo = $('#voile-menu'), bt = $('#b-menu');
    b.classList.toggle('ouvert', !!ouvrir); vo.hidden = !ouvrir; document.body.classList.toggle('menu-ouvert', !!ouvrir);
    if(bt){ bt.setAttribute('aria-expanded', ouvrir ? 'true' : 'false'); bt.setAttribute('aria-label', ouvrir ? 'Fermer le menu' : 'Ouvrir le menu'); }
  }
  document.addEventListener('click', e => { if(e.target && e.target.id === 'voile-menu') menu(false); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && $('#barre') && $('#barre').classList.contains('ouvert')) menu(false); });
  window.addEventListener('resize', () => { if(window.innerWidth > 900 && $('#barre') && $('#barre').classList.contains('ouvert')) menu(false); });
  function dessiner(){
    menu(false);
    const autor = PAGES.filter(p => R.peutPage(user, p.id));
    if(!R.peutPage(user, page)) page = autor[0].id;
    const groupes = [...new Set(autor.map(p=>p.groupe))];
    const cpt = {membres:mesMembres().length, activites:B.d.activites.length, utilisateurs:B.d.utilisateurs.length};
    $('#barre').innerHTML = `
      <div class="marque"><div class="pastille"><img src="${LOGO}" alt=""></div><div><div class="t1">Renouveau Charismatique</div><div class="t2">Système National<br>de Gestion</div></div></div>
      <nav class="nav">${groupes.map((g,i)=>`<div class="etiq g${i%3+1}">${esc(g)}</div>`+autor.filter(p=>p.groupe===g).map(p=>
        `<button data-p="${p.id}" class="${p.id===page?'actif':''}">${svg(p.id)}${esc(p.nom)}${cpt[p.id]!=null&&p.id!=='activites'||p.id==='activites'&&peut('activites')?`<span class="compteur">${cpt[p.id]}</span>`:''}</button>`).join('')).join('')}</nav>
      ${horlogeHtml()}
      <div class="pied-barre"><div class="qui"><div class="av">${esc(user.nom.split(' ').slice(0,2).map(x=>x[0]).join('').toUpperCase())}</div><div><div class="nom">${esc(user.nom)}</div><div class="role">${esc(R.role(user).nom)}${R.libellePortee(user)?' · '+esc(R.libellePortee(user)):''}</div></div></div>
        <button class="btn btn-s btn-bloc" id="b-quitter" style="background:rgba(255,255,255,.08);color:#fff;border-color:rgba(255,255,255,.2)">Se déconnecter</button>
        <div style="margin-top:12px">${SIGNATURE}</div></div>`;
    $('#barre').querySelectorAll('[data-p]').forEach(b => b.onclick = () => { page = b.dataset.p; dessiner(); });
    $('#b-quitter').onclick = () => { try{sessionStorage.removeItem('rcci.uid');}catch(_){} B.tracer('déconnexion', user.email); B.sauver(); ecranEntree(); };
    clearInterval(horlogeTimer);
    horlogeTimer = setInterval(() => { const h=$('#h-heure'); if(h) h.textContent = new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}); }, 20000);
    const p = PAGES.find(x=>x.id===page);
    $('#entete').innerHTML = `<div class="titre"><div class="reperes"><i></i><i></i><i></i><i></i></div><div><div class="sur">${esc(p.sur)}</div><h1>${esc(p.nom)}</h1></div></div><div class="actions" id="actions"></div>
      <button class="burger" id="b-menu" type="button" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="barre"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>`;
    $('#b-menu').onclick = () => menu($('#barre').classList.contains('ouvert') ? false : true);
    $('#vue').innerHTML = '';
    ({accueil:vueAccueil, membres:vueMembres, activites:vueActivites, controle:vueControle, stats:vueStats, utilisateurs:vueUtilisateurs, ref:vueRef,
      inscriptions:(v, a) => Finance.vueInscriptions(v, a, ctxF()), formation:(v, a) => Finance.vueFormation(v, a, ctxF()), archives:(v, a) => Archives.vue(v, a, ctxF()),
      intercession:(v, a) => Intercession.vue(v, a, {esc, $, modale, toast, redraw:dessiner, nomComplet, nomAffiche, initiales, fdate, peut, options, pStatut, controler, modifierMembre:formMembre, avatar, exporter:Exports, COLS_MEMBRE, ligneMembre, imprimerFiche, choisirPhoto, modifierActivite:formActivite, civilites:CIVILITES})})[page]($('#vue'), $('#actions'));
  }
  const ctxF = () => ({esc, $, modale, toast, redraw:dessiner, nomAffiche, peut, pStatut, controler, modifierMembre:formMembre, avatar, exporter:Exports, modifierActivite:formActivite, user});
  const aller = p => { page = p; dessiner(); };
  function controler(actId){
    const a = B.par('activites', actId); if(!a) return;
    if(!['ouverte','en cours'].includes(a.statut)){
      if(!confirm('Cette activité est « '+a.statut+' ». L’ouvrir maintenant au contrôle des présences ?')) return;
      a.statut = 'ouverte'; B.tracer('statut activité', a.intitule+' → ouverte'); B.sauver();
    }
    etat.ctrl.activiteId = actId; aller('controle');
  }

  /* ---------------------------------------------------------- tableau de bord */
  function pStatut(s){ const c={'en préparation':'p-neutre','ouverte':'p-info','en cours':'p-warn','clôturée':'p-ok','archivée':'p-neutre'}[s]||'p-neutre'; return `<span class="pastille ${c}">${esc(s)}</span>`; }
  function vueAccueil(v, act){
    const d = B.d, auj = new Date().toISOString().slice(0,10), mm = mesMembres(), ids = new Set(mm.map(m=>m.id));
    const enCours = d.activites.filter(a=>['ouverte','en cours'].includes(a.statut)).length;
    const presAuj = d.presences.filter(p=>p.heure.slice(0,10)===auj && ids.has(p.membreId)).length;
    if(user.role==='admin'){
      const demo = d.membres.some(m=>m.demo) || d.activites.some(a=>a.demo);
      act.innerHTML = demo ? '<button class="btn btn-contour" id="b-demo">Effacer la démonstration</button>' : '<button class="btn btn-contour" id="b-demo">Charger la démonstration</button>';
      $('#b-demo').onclick = () => { demo?Demo.effacer():Demo.lancer(); dessiner(); toast(demo?'Démonstration effacée.':'Démonstration chargée (personnes fictives).'); };
    }
    const parDio = d.dioceses.map(x=>({n:x.nom, v:mm.filter(m=>m.dioceseId===x.id).length})).filter(x=>user.role==='admin'||x.v);
    const max = Math.max(1,...parDio.map(x=>x.v)), h = new Date().getHours();
    const tuileDonnees = (user.role === 'admin' && Intercession.disponible()) ? `<div class="tuile" style="margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap"><div><h2>Données du ministère d’intercession</h2><div class="sous" style="margin:0">Les listes sont publiées chiffrées : elles ne sont pas encore dans cet appareil.</div></div><button class="btn btn-rouge" id="b-donnees">Charger avec le code d’accès</button></div>` : '';
    v.innerHTML = `${tuileDonnees}
      <div class="bandeau"><div><div class="sur">${esc(R.role(user).nom)}${R.libellePortee(user)?' · '+esc(R.libellePortee(user)):''}</div>
        <h2>${h<18?'Bonjour':'Bonsoir'}, ${esc(user.nom)}</h2><p>${new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p>
        <div class="raccourcis">${R.peutPage(user,'controle')?'<button class="btn btn-rouge" data-go="controle">Ouvrir le poste de contrôle</button>':''}${R.peutPage(user,'membres')?'<button class="btn btn-contour" data-go="membres">Consulter les membres</button>':''}</div></div>
        <img src="${LOGO}" alt=""></div>
      <div class="grille c4">
        <div class="tuile kpi b"><div class="k">Membres enregistrés</div><div class="v">${mm.length}</div><div class="note">${user.role==='admin'?'base nationale':'dans votre périmètre'}</div></div>
        <div class="tuile kpi j"><div class="k">Activités à contrôler</div><div class="v">${enCours}</div><div class="note">ouvertes ou en cours</div></div>
        <div class="tuile kpi r"><div class="k">Présences aujourd’hui</div><div class="v">${presAuj}</div><div class="note">validées par les postes</div></div>
        <div class="tuile kpi"><div class="k">Paroisses</div><div class="v">${d.paroisses.length}</div><div class="note">${d.dioceses.length} diocèse(s) renseigné(s)</div></div>
      </div>
      <div class="grille c21" style="margin-top:18px">
        <div class="tuile"><h2>Répartition des membres par diocèse</h2><div class="sous">Effectifs de votre périmètre</div>
          ${parDio.length ? parDio.map(x=>`<div class="barre-ligne"><div class="l">${esc(x.n)}</div><div class="piste"><div class="rempli" style="width:${Math.max(2,Math.round(100*x.v/max))}%"></div></div><div class="v">${x.v}</div></div>`).join('') : '<div class="vide"><b>Aucun diocèse pour l’instant</b>Les listes officielles vont être chargées.</div>'}</div>
        <div class="tuile"><h2>Activités</h2><div class="sous">Statut actuel</div>
          ${d.activites.length ? d.activites.slice(-5).reverse().map(a=>`<div style="display:flex;justify-content:space-between;gap:10px;padding:11px 0;border-bottom:1px solid var(--trait)"><div><b>${esc(a.intitule)}</b><div class="petit muet">${esc(a.lieu||'')}</div></div>${pStatut(a.statut)}</div>`).join('') : '<div class="vide"><b>Aucune activité</b>Aucune activité n’est encore créée.</div>'}</div>
      </div>`;
    v.querySelectorAll('[data-go]').forEach(b => b.onclick = () => aller(b.dataset.go));
    if($('#b-donnees')) $('#b-donnees').onclick = () => Intercession.demanderCode({esc, $, modale, toast, redraw:dessiner});
  }

  /* ------------------------------------------------------------------ membres */
  function vueMembres(v, act){
    if(peut('creer')){ act.innerHTML = (R.peutPage(user,'intercession') ? '<button class="btn btn-contour" id="b-dbl">Doublons ('+Registre.doublons().length+')</button>' : '')+'<button class="btn btn-contour" id="b-ip">Importer des photos</button><button class="btn btn-rouge" id="b-nv">+ Nouveau membre</button>'; $('#b-nv').onclick = () => formMembre(); $('#b-ip').onclick = importerPhotos; if($('#b-dbl')) $('#b-dbl').onclick = () => { Intercession.ouvrirOnglet('participants'); aller('intercession'); }; }
    const d = B.d, base = mesMembres();
    v.innerHTML = `<div class="grille c21" style="align-items:start">
      <div><div class="outils"><input type="search" id="q" placeholder="Rechercher : nom, prénom, téléphone, matricule…" value="${esc(etat.recherche)}">
        <select id="fd" style="max-width:200px">${options('dioceses',etat.fDio,'Tous les diocèses')}</select>
        <select id="fs" style="max-width:200px">${options('secteurs',etat.fSec,'Tous les secteurs')}</select>
        <select id="fm" style="max-width:220px">${options('ministeres',etat.fMin,'Tous les ministères')}</select>
        <button class="btn btn-contour btn-s" id="x-csv">Exporter (CSV)</button><button class="btn btn-contour btn-s" id="x-pdf">Imprimer / PDF</button></div>
        <div class="tuile" style="padding:0;overflow:hidden"><table class="tableau"><thead><tr><th>Membre</th><th>Matricule</th><th>Implantation</th><th>Ministère</th></tr></thead><tbody id="tm"></tbody></table></div></div>
      <div class="tuile fiche" id="fiche"></div></div>`;
    let courant = [];
    const maj = () => {
      const q = Identite.norm(etat.recherche);
      const tout = base.filter(m => (!etat.fDio||m.dioceseId===etat.fDio) && (!etat.fSec||secteurIdDe(m)===etat.fSec) && (!etat.fMin||m.ministereId===etat.fMin) && (!q || Identite.norm(nomComplet(m)+' '+m.tel+' '+m.matricule).includes(q)));
      courant = tout; const l = tout.slice(0,300);
      $('#tm').innerHTML = l.length ? l.map(m=>`<tr class="cliquable ${m.id===etat.membreSel?'sel':''}" data-id="${m.id}"><td><div class="cellule-nom">${avatar(m)}<div><div class="n">${esc(nomAffiche(m))}</div><div class="s">${esc(m.tel||'')}</div></div></div></td><td class="mono">${esc(m.matricule)}</td><td>${esc(lieu(m))}</td><td>${esc(B.nom('ministeres',m.ministereId)||'—')}</td></tr>`).join('')
        : `<tr><td colspan="4"><div class="vide"><b>Aucun membre</b>${base.length?'Aucun résultat pour cette recherche.':'Aucun membre dans votre périmètre pour l’instant.'}</div></td></tr>`;
      $('#tm').querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => { etat.membreSel = tr.dataset.id; maj(); fiche(); });
    };
    const fiche = () => {
      const m = base.find(x=>x.id===etat.membreSel), f = $('#fiche');
      if(!m){ f.innerHTML = '<div class="vide"><b>Sélectionnez un membre</b>Sa fiche s’affiche ici.</div>'; return; }
      f.innerHTML = `<div class="photo ${Photos.url(m)?'avec-photo':''}" ${Photos.url(m)?`style="background-image:url('${esc(Photos.url(m))}')"`:''}>${Photos.url(m)?'':esc(initiales(m))}</div>
        <div style="text-align:center;margin-bottom:6px"><h2>${esc(nomAffiche(m))}</h2><div class="mono muet">${esc(m.matricule)}</div></div>
        <div class="groupe">Identité</div>
        <div class="ligne-fiche"><span class="k">Date de naissance</span><span class="v">${esc(fdate(m.dateNaissance))}</span></div>
        <div class="ligne-fiche"><span class="k">Sexe</span><span class="v">${esc(m.sexe||'—')}</span></div>
        <div class="ligne-fiche"><span class="k">Pièce(s) connue(s)</span><span class="v">${(m.pieces||[]).length?m.pieces.map(p=>esc((B.TYPES_PIECE.find(t=>t.id===p.type)||{}).nom||p.type)).join(', '):'aucune'}</span></div>
        <div class="groupe">Coordonnées</div>
        <div class="ligne-fiche"><span class="k">Contact</span><span class="v">${esc(m.tel||'—')}</span></div>
        <div class="ligne-fiche"><span class="k">WhatsApp</span><span class="v">${esc(m.whatsapp||'—')}</span></div>
        <div class="ligne-fiche"><span class="k">E-mail</span><span class="v">${esc(m.email||'—')}</span></div>
        <div class="groupe">Implantation</div>
        <div class="ligne-fiche"><span class="k">Diocèse</span><span class="v">${esc(B.nom('dioceses',m.dioceseId)||'—')}</span></div>
        <div class="ligne-fiche"><span class="k">Secteur</span><span class="v">${esc(B.nom('secteurs',m.secteurId)||'—')}</span></div>
        <div class="ligne-fiche"><span class="k">Paroisse</span><span class="v">${esc(B.nom('paroisses',m.paroisseId)||'—')}</span></div>
        <div class="groupe">Engagement</div>
        <div class="ligne-fiche"><span class="k">Ministère</span><span class="v">${esc(B.nom('ministeres',m.ministereId)||'—')}</span></div>
        <div class="ligne-fiche"><span class="k">Poste</span><span class="v">${esc(B.nom('postes',m.posteId)||'—')}</span></div>
        <div class="ligne-fiche"><span class="k">Profession</span><span class="v">${esc(m.profession||'—')}</span></div>
        <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap"><button class="btn btn-contour btn-s" id="b-imp" style="flex:1">Imprimer la fiche</button>${peut('creer')?'<button class="btn btn-contour btn-s" id="b-pho" style="flex:1">Photo</button>':''}</div>
        ${peut('modifier')||peut('supprimer')?`<div style="display:flex;gap:8px;margin-top:8px">${peut('modifier')?'<button class="btn btn-contour btn-s" style="flex:1" id="b-mod">Modifier</button>':''}${peut('supprimer')?'<button class="btn btn-danger btn-s" id="b-sup">Supprimer</button>':''}</div>`:''}`;
      $('#b-imp').onclick = () => imprimerFiche(m);
      if($('#b-pho')) $('#b-pho').onclick = () => choisirPhoto(m);
      if($('#b-mod')) $('#b-mod').onclick = () => formMembre(m);
      if($('#b-sup')) $('#b-sup').onclick = () => { if(confirm('Supprimer définitivement cette fiche et ses présences ?')){ B.d.presences = B.d.presences.filter(p=>p.membreId!==m.id); B.d.participations = B.d.participations.filter(p=>p.membreId!==m.id); B.d.affectations = B.d.affectations.filter(a=>a.membreId!==m.id); B.retirer('membres', m.id); B.tracer('suppression membre', m.matricule); B.sauver(); etat.membreSel=null; dessiner(); } };
    };
    $('#q').oninput = e => { etat.recherche = e.target.value; maj(); };
    $('#fd').onchange = e => { etat.fDio = e.target.value; maj(); };
    $('#fs').onchange = e => { etat.fSec = e.target.value; maj(); };
    $('#fm').onchange = e => { etat.fMin = e.target.value; maj(); };
    $('#x-csv').onclick = () => listeMembres(courant);
    $('#x-pdf').onclick = () => listeMembres(courant);
    maj(); fiche();
  }
  function formMembre(m, prefill, apres){
    const n = m || prefill || {};
    const sect = x => x.dioceseId === n.dioceseId, nomDe = (coll, id) => B.nom(coll, id);
    const v = modale(m?'Modifier la fiche':'Nouveau membre', `<div class="grille-champs">
        <div><label>Civilité</label><select id="m-civ"><option value="">—</option>${CIVILITES.map(([k,l]) => `<option value="${k}" ${n.civilite===k?'selected':''}>${l}</option>`).join('')}</select></div>
        <div><label>Épouse de (nom du mari, si mariée)</label><input type="text" id="m-epo" value="${esc(n.epouseDe||'')}" placeholder="ex. KOUADIO"></div>
        <div><label>Nom de famille *</label><input type="text" id="m-nom" value="${esc(n.nom||'')}"></div>
        <div><label>Prénoms *</label><input type="text" id="m-pre" value="${esc(n.prenoms||'')}"></div>
        <div><label>Date de naissance</label><input type="date" id="m-nai" value="${esc(n.dateNaissance||'')}"></div>
        <div><label>Sexe</label><select id="m-sex"><option value="">—</option><option ${n.sexe==='F'?'selected':''}>F</option><option ${n.sexe==='M'?'selected':''}>M</option></select></div>
        <div><label>Contact principal</label><input type="tel" id="m-tel" value="${esc(n.tel||'')}"></div>
        <div><label>WhatsApp</label><input type="tel" id="m-wa" value="${esc(n.whatsapp||'')}"></div>
        <div class="large"><label>E-mail</label><input type="email" id="m-em" value="${esc(n.email||'')}"></div>
        <div><label>Diocèse</label><select id="m-dio">${options('dioceses',n.dioceseId)}</select></div>
        ${champListe('m-sec','Secteur (Abidjan : Nord, Sud, Centre)','secteurs',nomDe('secteurs',n.secteurId),sect)}
        ${champListe('m-par','Paroisse — saisir ou choisir','paroisses',nomDe('paroisses',n.paroisseId),sect)}
        ${champListe('m-min','Ministère — saisir ou choisir','ministeres',nomDe('ministeres',n.ministereId))}
        ${champListe('m-pos','Poste de responsabilité — saisir ou choisir','postes',nomDe('postes',n.posteId))}
        <div><label>Fonction / profession</label><input type="text" id="m-pro" value="${esc(n.profession||'')}"></div>
        <div class="large"><label>Photo d\u2019identité (facultatif)</label><input type="file" id="m-photo" accept="image/*"></div></div>
        <div class="petit muet" style="margin-top:10px">Une paroisse, un secteur, un ministère ou un poste qui n’existe pas encore est créé automatiquement à l’enregistrement.</div>`,
      '<button class="btn btn-contour" id="m-ann">Annuler</button><button class="btn btn-rouge" id="m-ok">Enregistrer</button>');
    const majListes = () => { const dio = $('#m-dio',v).value, f = x => !dio || x.dioceseId === dio;
      [['m-sec','secteurs'],['m-par','paroisses']].forEach(([id,c]) => { $('#'+id+'-l',v).innerHTML = B.d[c].filter(f).map(x => `<option value="${esc(x.nom)}">`).join(''); }); };
    $('#m-dio',v).onchange = majListes;
    $('#m-ann',v).onclick = () => v.remove();
    $('#m-ok',v).onclick = () => {
      const nom = $('#m-nom',v).value.trim(), pre = $('#m-pre',v).value.trim(), fp = $('#m-photo',v).files[0];
      if(!nom || !pre) return toast('Nom et prénoms sont obligatoires.', true);
      const dio = $('#m-dio',v).value, sec = $('#m-sec',v).value.trim(), par = $('#m-par',v).value.trim();
      if((sec || par) && !dio) return toast('Choisissez d’abord le diocèse pour saisir un secteur ou une paroisse.', true);
      // Secteurs : seuls ceux qui existent (Abidjan : Nord, Sud, Centre). Un nouveau secteur s'ajoute dans « Listes de référence ».
      let secId = '';
      if(sec){ const s0 = B.d.secteurs.find(x => x.dioceseId === dio && Identite.norm(x.nom) === Identite.norm(sec)); if(!s0) return toast('Secteur inconnu pour ce diocèse. Secteurs possibles : '+(B.d.secteurs.filter(x => x.dioceseId === dio && !x.demo).map(x => x.nom).join(', ')||'aucun')+'.', true); secId = s0.id; }
      const parId = resoudre('paroisses', par, {dioceseId:dio});
      if(!secId && parId){ const p0 = B.par('paroisses', parId); if(p0 && p0.secteurId) secId = p0.secteurId; }          // le secteur suit la paroisse
      if(secId && parId){ const p1 = B.par('paroisses', parId); if(p1 && !p1.secteurId){ p1.secteurId = secId; B.sauver(); } }  // et la paroisse reçoit son secteur
      const o = {civilite:$('#m-civ',v).value, epouseDe:$('#m-epo',v).value.trim().toUpperCase(), nom:nom.toUpperCase(), prenoms:pre, dateNaissance:$('#m-nai',v).value, sexe:$('#m-sex',v).value, tel:$('#m-tel',v).value.trim(), whatsapp:$('#m-wa',v).value.trim(), email:$('#m-em',v).value.trim(),
        dioceseId:dio, secteurId:secId, paroisseId:parId, ministereId:resoudre('ministeres', $('#m-min',v).value), posteId:resoudre('postes', $('#m-pos',v).value), profession:$('#m-pro',v).value.trim()};
      if(!m){
        const q = Identite.jetons(nom+' '+pre);
        const dup = B.d.membres.find(x => Identite.scoreMembre(q,x) >= 92 && (!o.dateNaissance || !x.dateNaissance || x.dateNaissance===o.dateNaissance))
          || (o.tel && B.d.membres.find(x => x.tel && x.tel.replace(/\s/g,'')===o.tel.replace(/\s/g,'')));
        if(dup && !confirm('Une fiche semble déjà exister : '+nomComplet(dup)+' ('+dup.matricule+').\nCréer quand même un doublon ?')) return;
        const nv = Object.assign({id:B.uid('mem'), matricule:B.matricule(), pieces:(prefill&&prefill.pieces)||[], creeLe:new Date().toISOString()}, o);
        B.d.membres.push(nv); B.tracer('création membre', nv.matricule+' par '+user.email); B.sauver(); etat.membreSel = nv.id;
        if(fp) Photos.depuisFichier(nv.id, fp).then(() => dessiner()); v.remove(); toast('Fiche créée : '+nv.matricule); if(apres) apres(nv); else dessiner();
      } else { Object.assign(m, o); B.tracer('modification membre', m.matricule+' par '+user.email); B.sauver(); if(fp) Photos.depuisFichier(m.id, fp).then(() => dessiner()); v.remove(); toast('Fiche mise à jour.'); dessiner(); }
    };
  }

  /* --------------------------------------------------------------- activités */
  function vueActivites(v, act){
    const gere = peut('activites');
    if(gere){ act.innerHTML = '<button class="btn btn-rouge" id="b-na">+ Nouvelle activité</button>'; $('#b-na').onclick = () => formActivite(); }
    const d = B.d;
    const nb = id => d.presences.filter(p=>p.activiteId===id).length;
    const liste = d.activites.slice().sort((x,y)=>(y.date||'').localeCompare(x.date||''));
    v.innerHTML = liste.length ? `<div class="liste-act">${liste.map(a=>`<div class="carte-act">
        <div class="act-info"><div class="act-titre">${esc(a.intitule)}</div>${a.parentId?'<div class="petit" style="color:#286FBE;font-weight:700">Module '+(a.moduleNum||'')+' de la formation</div>':''}
          <div class="petit muet">${esc(B.nom('typesActivite',a.typeId))}${a.responsable?' · Resp. '+esc(a.responsable):''}</div></div>
        <div class="act-meta">
          <div><span class="act-lib">Date</span>${a.date?esc(fdate(a.date)):'—'}${a.heure?` · ${esc(a.heure)}`:''}</div>
          <div><span class="act-lib">Lieu</span>${esc(a.lieu||'—')}</div>
          <div><span class="act-lib">Présents</span><b>${nb(a.id)}</b></div>
          <div><span class="act-lib">Statut</span>${gere?`<select data-st="${a.id}">${B.STATUTS.map(s=>`<option ${s===a.statut?'selected':''}>${s}</option>`).join('')}</select>`:pStatut(a.statut)}</div>
        </div>
        ${gere?`<div class="act-actions"><button class="btn btn-contour btn-s" data-ct="${a.id}">Contrôler</button><button class="btn btn-contour btn-s" data-im="${a.id}">Importer une liste</button><button class="btn btn-contour btn-s" data-ed="${a.id}">Modifier</button><button class="btn btn-danger btn-s" data-del="${a.id}">Supprimer</button></div>`:''}
      </div>`).join('')}</div>`
      : `<div class="tuile"><div class="vide"><b>Aucune activité</b>Une activité doit exister avant d’ouvrir le contrôle des présences.</div></div>`;
    v.querySelectorAll('[data-st]').forEach(s => s.onchange = () => { const a=B.par('activites',s.dataset.st); a.statut=s.value; B.tracer('statut activité', a.intitule+' → '+a.statut); B.sauver(); dessiner(); });
    v.querySelectorAll('[data-im]').forEach(b => b.onclick = () => Registre.importer({esc, $, modale, toast, redraw:dessiner}, b.dataset.im));
    v.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => formActivite(B.par('activites', b.dataset.ed)));
    v.querySelectorAll('[data-ct]').forEach(b => b.onclick = () => { etat.ctrl.activiteId = b.dataset.ct; aller('controle'); });
    v.querySelectorAll('[data-del]').forEach(b => b.onclick = () => supprimerActivite(B.par('activites', b.dataset.del)));
  }
  function supprimerActivite(a){
    if(!a) return;
    const nv = B.d.cotisations.filter(c => c.activiteId === a.id).length, nm = B.d.activites.filter(x => x.parentId === a.id).length;
    if(nv || nm) return modale('Suppression impossible', `<p><b>${esc(a.intitule)}</b> contient ${nv ? nv + ' versement(s) enregistré(s)' : ''}${nv && nm ? ' et ' : ''}${nm ? nm + ' module(s) rattaché(s)' : ''}.</p><p class="petit muet">Pour conserver l’historique, ces données ne se suppriment pas. Utilisez « Archiver » dans la page Inscriptions ou Formation biblique.</p>`, '<button class="btn btn-rouge" id="sx-ok">Compris</button>').querySelector('#sx-ok').onclick = e => e.target.closest('.voile').remove();
    const d = B.d, np = d.presences.filter(p=>p.activiteId===a.id).length, nq = (d.participations||[]).filter(p=>p.activiteId===a.id).length;
    const v = modale('Supprimer l’activité', `<p>Voulez-vous vraiment supprimer <b>${esc(a.intitule)}</b> ?</p>
      <p class="petit muet">Seront aussi supprimés : ${np} présence(s) contrôlée(s) et ${nq} participation(s) liée(s) à cette activité. Les fiches des membres ne sont pas touchées. Cette action est définitive.</p>`,
      `<button class="btn btn-contour" id="s-ann">Annuler</button><button class="btn btn-danger" id="s-ok">Supprimer</button>`);
    $('#s-ann',v).onclick = () => v.remove();
    $('#s-ok',v).onclick = () => {
      d.presences = d.presences.filter(p=>p.activiteId!==a.id);
      if(d.participations) d.participations = d.participations.filter(p=>p.activiteId!==a.id);
      if(etat.ctrl && etat.ctrl.activiteId===a.id) etat.ctrl.activiteId = null;
      B.tracer('suppression activité', a.intitule); B.retirer('activites', a.id); B.sauver(); v.remove(); toast('Activité supprimée.'); dessiner();
    };
  }
  function formActivite(a){
    const n = a || {};
    const v = modale(a?'Modifier l’activité':'Nouvelle activité', `<div class="grille-champs">
      <div class="large"><label>Intitulé *</label><input type="text" id="a-int" value="${esc(n.intitule||'')}"></div>
      ${champListe('a-typ','Type — saisir ou choisir','typesActivite',B.nom('typesActivite',n.typeId))}
      <div><label>Statut</label><select id="a-st">${B.STATUTS.map(s=>`<option ${s===(n.statut||'en préparation')?'selected':''}>${s}</option>`).join('')}</select></div>
      <div><label>Date ${n.ministere==='intercession'?'(si connue)':'*'}</label><input type="date" id="a-dat" value="${esc(a?n.date:new Date().toISOString().slice(0,10))}"></div>
      <div><label>Heure</label><input type="text" id="a-heu" placeholder="08:00" value="${esc(n.heure||'')}"></div>
      <div><label>Lieu</label><input type="text" id="a-lie" value="${esc(n.lieu||'')}"></div>
      <div><label>Responsable</label><input type="text" id="a-res" value="${esc(n.responsable||'')}"></div></div>`,
      `<button class="btn btn-contour" id="a-ann">Annuler</button><button class="btn btn-rouge" id="a-ok">${a?'Enregistrer':'Créer'}</button>`);
    $('#a-ann',v).onclick = () => v.remove();
    $('#a-ok',v).onclick = () => {
      const i = $('#a-int',v).value.trim(), dt = $('#a-dat',v).value;
      if(!i || (!dt && !a && n.ministere!=='intercession')) return toast('Intitulé et date obligatoires.', true);
      const o = {intitule:i, typeId:resoudre('typesActivite', $('#a-typ',v).value), date:dt, heure:$('#a-heu',v).value.trim(), lieu:$('#a-lie',v).value.trim(), statut:$('#a-st',v).value, responsable:$('#a-res',v).value.trim()};
      if(a){ Object.assign(a, o); B.tracer('modification activité', i); B.sauver(); } else { B.ajouter('activites', o); B.tracer('création activité', i); B.sauver(); }
      v.remove(); dessiner();
    };
  }

  /* ----------------------------------------------------------------- contrôle */
  function vueControle(v){
    const c = etat.ctrl, d = B.d;
    const ouvertes = d.activites.filter(a=>['ouverte','en cours'].includes(a.statut));
    if(c.activiteId && !ouvertes.some(a=>a.id===c.activiteId)) c.activiteId = '';
    if(!c.activiteId && ouvertes.length) c.activiteId = ouvertes[0].id;
    const etape = c.valide ? 3 : (c.res ? 2 : 1);
    v.innerHTML = `<div class="controle">
      <div class="tuile poste">
        <div class="poste-tete"><h2>Contrôle par pièce d’identité</h2><p>L’identification se fait à partir du nom écrit sur la pièce. L’image de la pièce n’est jamais conservée.</p>
          <div class="etapes"><div class="etape ${etape===1?'on':''}">1 · Pièce</div><div class="etape ${etape===2?'on':''}">2 · Identification</div><div class="etape ${etape===3?'on':''}">3 · Présence</div></div></div>
        <div class="poste-corps">
          <label class="t">Activité contrôlée</label>
          <select id="c-act">${ouvertes.length?ouvertes.map(a=>`<option value="${a.id}" ${a.id===c.activiteId?'selected':''}>${esc(a.intitule)} — ${esc(fdate(a.date))}</option>`).join(''):'<option value="">Aucune activité ouverte</option>'}</select>
          <div class="scan-bloc">
            <button class="btn btn-marine btn-bloc" type="button" id="c-scan-b" ${ouvertes.length?'':'disabled'}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.6-2.4h6.8L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.4"/></svg>Scanner la pièce d’identité</button>
            <button class="lien-photo" type="button" id="c-scan-f">ou choisir une photo déjà prise</button>
            <input type="file" id="c-scan" accept="image/*" hidden>
            <label class="auto-valid"><input type="checkbox" id="c-auto" ${c.auto?'checked':''}> Valider la présence automatiquement quand la personne est identifiée avec certitude</label>
            <div id="c-prog" class="petit"></div>
            <div class="ou"><span>ou saisie manuelle</span></div>
          </div>
          <label class="t">Type de pièce présentée</label>
          <div class="types-piece">${B.TYPES_PIECE.map(t=>`<label><input type="radio" name="tp" value="${t.id}" ${c.type===t.id?'checked':''}>${esc(t.nom)}</label>`).join('')}</div>
          <label class="t">Nom complet tel qu’écrit sur la pièce *</label>
          <input type="text" id="c-nom" placeholder="ex. KOUASSI Émmanuelle Marie" value="${esc(c.nom)}">
          <div class="grille-champs" style="margin-top:2px"><div><label class="t">N° de la pièce (facultatif)</label><input type="text" id="c-num" value="${esc(c.numero)}"></div>
            <div><label class="t">Date de naissance (facultatif)</label><input type="date" id="c-nai" value="${esc(c.naissance)}"></div></div>
          <button class="btn btn-rouge btn-bloc" style="margin-top:20px;padding:14px" id="c-go" ${ouvertes.length?'':'disabled'}>Identifier la personne</button>
          ${ouvertes.length?'':'<div class="petit" style="margin-top:10px;color:var(--rouge-2);font-weight:700">Aucune activité n’est ouverte : demandez à l’administrateur d’ouvrir l’activité du jour.</div>'}
        </div></div>
      <div class="tuile resultat" id="c-res"></div></div>`;
    $('#c-act').onchange = e => { c.activiteId = e.target.value; reinit(false); dessiner(); };
    v.querySelectorAll('[name=tp]').forEach(r => r.onchange = () => c.type = r.value);
    [['c-nom','nom'],['c-num','numero'],['c-nai','naissance']].forEach(([i,k]) => { $('#'+i).oninput = e => c[k]=e.target.value; });
    $('#c-go').onclick = () => { c.scan = false; c.scanAuto = false; c.scanNom = ''; c.scanPrenoms = ''; identifier(); };
    $('#c-scan-b').onclick = ouvrirCamera;
    $('#c-scan-f').onclick = () => $('#c-scan').click();
    $('#c-auto').onchange = e => { c.auto = e.target.checked; };
    $('#c-scan').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if(f) scanner(f); };
    $('#c-nom').addEventListener('keydown', e => { if(e.key==='Enter') identifier(); });
    resultat();
  }
  function reinit(){ const c=etat.ctrl; c.nom=''; c.numero=''; c.naissance=''; c.res=null; c.choisi=null; c.valide=null; c.nouveau=false; c.scan=false; c.scanAuto=false; c.scanNom=''; c.scanPrenoms=''; }
  /** Caméra en direct : webcam de l'ordinateur, caméra de la tablette ou du téléphone (arrière de préférence). */
  async function ouvrirCamera(){
    const c = etat.ctrl;
    if(!c.activiteId) return toast('Choisissez d’abord une activité ouverte.', true);
    if(!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)){
      toast('La caméra n’est pas accessible ici : le navigateur ne l’autorise que sur une adresse sécurisée (https) ou localhost. Choisissez une photo à la place.', true); return $('#c-scan').click();
    }
    const v = document.createElement('div'); v.className = 'voile camera';
    v.innerHTML = `<div class="cam-boite"><div class="cam-tete"><b>Scanner la pièce d’identité</b><button class="btn btn-contour btn-s" id="cam-x" type="button">Fermer</button></div>
      <div class="cam-scene"><video id="cam-v" playsinline muted autoplay></video><div class="cam-cadre"></div><div class="cam-msg" id="cam-m">Démarrage de la caméra…</div></div>
      <div id="cam-p" class="cam-prog"></div>
      <div class="cam-actions"><button class="btn btn-contour" id="cam-sw" type="button" hidden>Changer de caméra</button><button class="btn btn-rouge" id="cam-cap" type="button" disabled>Capturer et lire la pièce</button><button class="btn btn-contour" id="cam-f" type="button">Choisir une photo</button></div>
      <div class="petit muet" style="text-align:center">Placez la pièce dans le cadre, bien éclairée, sans reflet. L’image n’est ni envoyée ni conservée.</div></div>`;
    document.body.appendChild(v);
    let flux = null, appareils = [], occupe = false;
    const arreter = () => { if(flux){ flux.getTracks().forEach(t => t.stop()); flux = null; } };
    const fermer = () => { arreter(); v.remove(); };
    const msg = (t, ko) => { const m = $('#cam-m', v); m.textContent = t || ''; m.classList.toggle('ko', !!ko); };
    async function demarrer(contraintes){
      arreter(); const vid = $('#cam-v', v); msg('Démarrage de la caméra…'); $('#cam-cap', v).disabled = true;
      try {
        flux = await navigator.mediaDevices.getUserMedia({video:contraintes, audio:false});
        if(!v.isConnected){ arreter(); return; }
        vid.srcObject = flux; try { await vid.play(); } catch(_){}
        const s = flux.getVideoTracks()[0].getSettings();
        vid.classList.toggle('miroir', s.facingMode === 'user');
        appareils = (await navigator.mediaDevices.enumerateDevices()).filter(x => x.kind === 'videoinput');
        $('#cam-sw', v).hidden = appareils.length < 2; $('#cam-cap', v).disabled = false; msg('');
        v.dataset.dev = s.deviceId || '';
      } catch(e){
        const refus = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError'), aucune = e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError');
        msg(refus ? 'Accès à la caméra refusé. Autorisez la caméra dans le navigateur (icône à gauche de l’adresse), puis rouvrez cette fenêtre.' : aucune ? 'Aucune caméra détectée sur cet appareil.' : 'La caméra ne démarre pas ('+(e && e.name || 'erreur')+'). Elle est peut-être utilisée par une autre application.', true);
      }
    }
    $('#cam-x', v).onclick = fermer;
    v.addEventListener('mousedown', e => { if(e.target === v) fermer(); });
    $('#cam-f', v).onclick = () => { fermer(); $('#c-scan').click(); };
    $('#cam-sw', v).onclick = () => { if(appareils.length < 2) return; const i = appareils.findIndex(x => x.deviceId === v.dataset.dev); demarrer({deviceId:{exact:appareils[(i + 1) % appareils.length].deviceId}, width:{ideal:1920}, height:{ideal:1080}}); };
    $('#cam-cap', v).onclick = async () => {
      const vid = $('#cam-v', v), b = $('#cam-cap', v); if(occupe || !vid.videoWidth) return; occupe = true; b.disabled = true;
      const cv = document.createElement('canvas'); cv.width = vid.videoWidth; cv.height = vid.videoHeight; cv.getContext('2d').drawImage(vid, 0, 0);
      const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', .92));
      msg('Image capturée…');
      const ok = await scanner(new File([blob], 'piece.jpg', {type:'image/jpeg'}), $('#cam-p', v));
      occupe = false;
      if(ok) return fermer();
      b.disabled = false; msg('Lecture incomplète : rapprochez la pièce, évitez les reflets, tenez-la bien droite, puis capturez de nouveau.', true);
    };
    demarrer({facingMode:{ideal:'environment'}, width:{ideal:1920}, height:{ideal:1080}});
  }
  /** Scan d'une pièce : lecture (OCR) → champs remplis → identification ; inconnu → formulaire d'inscription ouvert automatiquement. */
  async function scanner(fichier, progEl){
    const c = etat.ctrl, prog = progEl || $('#c-prog');
    if(!c.activiteId) return toast('Choisissez d\u2019abord une activité ouverte.', true);
    const etatProg = p => { if(prog) prog.innerHTML = p == null ? '<span class="pastille p-info">Préparation du module de lecture…</span>' : `<div class="barre-scan"><i style="width:${p}%"></i></div><span class="petit">Lecture de la pièce… ${p} %</span>`; };
    try {
      const texte = await Scan.ocr(fichier, etatProg), r = Scan.analyser(texte);
      if(r.type) c.type = r.type;
      c.scanNom = r.nom; c.scanPrenoms = r.prenoms; c.nom = [r.nom, r.prenoms].filter(Boolean).join(' '); c.numero = r.numero || ''; c.naissance = r.naissance || '';
      if(!c.nom || Identite.jetons(c.nom).length < 2){ c.scan = false; c.scanAuto = false; c.res = null; if(!progEl) dessiner(); toast('Lecture incomplète : vérifiez et complétez le nom, puis identifiez.', true); return false; }
      c.scan = true; c.scanAuto = true; toast('Pièce lue : '+c.nom); identifier(); return true;
    } catch(e){ if(prog) prog.innerHTML = '<div class="alerte-boite ko" style="margin-top:8px;padding:10px">'+esc(e.message||'Lecture impossible.')+'<br><span class="petit">Vous pouvez saisir le nom à la main.</span></div>'; return false; }
  }
  function enregistrerPresence(m){
    const c = etat.ctrl, d = B.d, act = B.par('activites', c.activiteId);
    if(deja(c.activiteId, m.id)) return toast('Déjà enregistré (double contrôle évité).', true);
    const mem = c.mem && c.numero && !(m.pieces||[]).some(p => p.numero === c.numero);
    if(mem) (m.pieces = m.pieces || []).push({type:c.type, numero:c.numero});
    d.presences.unshift({id:B.uid('pre'), activiteId:c.activiteId, membreId:m.id, heure:new Date().toISOString(), poste:'Poste 1', agent:user.email, pieceType:c.type, pieceNumero:mem?c.numero:'', nouveau:!!c.nouveau, scan:!!c.scan});
    B.tracer('présence', nomComplet(m)+' — '+(act?act.intitule:'')+' — '+user.email+(c.scan?' (pièce scannée)':'')); B.sauver();
    c.valide = m.id; c.nom = ''; c.numero = ''; c.naissance = ''; c.scan = false; c.scanAuto = false; dessiner();
  }
  function creerSurPlace(){
    const c = etat.ctrl; let nom, pre;
    if(c.scanNom){ nom = c.scanNom; pre = c.scanPrenoms || ''; }
    else { const tk = Identite.jetons(c.nom); nom = (c.nom.match(/\b[A-ZÀ-Ý'’\-]{2,}\b/)||[tk[0]||''])[0]; pre = c.nom.replace(nom,'').trim(); }
    formMembre(null, {nom, prenoms:pre, dateNaissance:c.naissance, pieces:c.numero?[{type:c.type,numero:c.numero}]:[]}, nv => {
      c.res = {etat:'identifie', candidats:[{m:nv, score:100}]}; c.choisi = nv.id; c.nouveau = true;
      if(c.auto && c.scan) enregistrerPresence(nv); else dessiner();
    });
  }
  function identifier(){
    const c = etat.ctrl;
    if(!c.activiteId) return toast('Choisissez une activité ouverte.', true);
    if(!(c.nom||'').trim()) return toast('Saisissez le nom figurant sur la pièce.', true);
    c.res = Identite.chercher(B.d.membres, {nom:c.nom, numero:c.numero, dateNaissance:c.naissance, type:c.type});
    c.choisi = c.res.etat==='identifie' ? c.res.candidats[0].m.id : null; c.valide = null;
    if(c.res.etat === 'identifie' && c.scan && c.auto){ const m = B.par('membres', c.choisi); if(m && !deja(c.activiteId, m.id)) return enregistrerPresence(m); }
    dessiner();
  }
  const deja = (actId, memId) => B.d.presences.find(p=>p.activiteId===actId && p.membreId===memId);
  function resultat(){
    const c = etat.ctrl, z = $('#c-res'), d = B.d, act = B.par('activites', c.activiteId);
    const tous = d.presences.filter(p=>p.activiteId===c.activiteId), derniers = tous.slice(0,8);
    const liste = derniers.length ? `<div class="groupe" style="margin-top:22px">Dernières présences · ${tous.length} au total</div><div class="derniers">${derniers.map(p=>{const m=B.par('membres',p.membreId);return `<div class="ligne-fiche"><span>${m?esc(nomComplet(m)):'—'}</span><span class="v mono">${esc(heure(p.heure))}</span></div>`;}).join('')}</div>` : '';
    if(c.valide){
      const m = B.par('membres', c.valide);
      z.innerHTML = `<div class="alerte-boite ok"><div class="rond">✓</div><h2 style="color:var(--vert)">Présence enregistrée</h2><div style="margin-top:6px;font-weight:700">${m?esc(nomComplet(m)):''}</div><div class="petit">${esc(act?act.intitule:'')}</div></div>
        <button class="btn btn-rouge btn-bloc" style="margin-top:16px;padding:14px" id="c-suiv">Personne suivante</button>${liste}`;
      $('#c-suiv').onclick = () => { reinit(); dessiner(); }; return;
    }
    if(!c.res){ z.innerHTML = `<div class="vide"><b>En attente d’une pièce</b>Choisissez le type de pièce, saisissez le nom qui y figure, puis lancez l’identification.</div>${liste}`; return; }
    if(c.res.erreur){ z.innerHTML = `<div class="alerte-boite warn"><b>${esc(c.res.erreur)}</b></div>`; return; }
    if(c.res.etat==='non-repertorie'){
      const crea = peut('creer');
      z.innerHTML = `<div class="alerte-boite ko"><div class="rond">✕</div><h2 style="color:var(--rouge-2)">Participant non répertorié</h2><p style="margin:8px 0 0">Aucune fiche ne correspond au nom « ${esc(c.nom)} ». Vérifiez l’orthographe${crea?', ou créez sa fiche : il pourra être contrôlé aussitôt.':'. Sinon, orientez la personne vers le poste d’inscription.'}</p></div>
        <div style="display:flex;gap:10px;margin-top:16px"><button class="btn btn-contour" style="flex:1" id="c-corr">Corriger la saisie</button>${crea?'<button class="btn btn-rouge" style="flex:1" id="c-cree">Créer sa fiche</button>':''}</div>${liste}`;
      $('#c-corr').onclick = () => { c.res=null; dessiner(); $('#c-nom').focus(); };
      if(crea && c.scanAuto){ c.scanAuto = false; setTimeout(creerSurPlace, 350); }
      if(crea) $('#c-cree').onclick = () => { creerSurPlace(); return;
        const t = Identite.jetons(c.nom), nom = (c.nom.match(/\b[A-ZÀ-Ý'’\-]{2,}\b/)||[t[0]||''])[0], pre = c.nom.replace(nom,'').trim();
        formMembre(null, {nom, prenoms:pre, dateNaissance:c.naissance, pieces:c.numero?[{type:c.type,numero:c.numero}]:[]}, nv => { c.res={etat:'identifie',candidats:[{m:nv,score:100}]}; c.choisi=nv.id; c.nouveau=true; dessiner(); });
      };
      return;
    }
    if(!c.choisi){
      z.innerHTML = `<h2>Plusieurs fiches possibles</h2><div class="sous">Aucune n’est certaine : comparez avec la pièce (date de naissance, paroisse) puis choisissez.</div>
        ${c.res.candidats.map(k=>`<div class="candidat" data-id="${k.m.id}">${avatar(k.m)}<div><b>${esc(nomComplet(k.m))}</b><div class="petit muet">Né(e) le ${esc(fdate(k.m.dateNaissance))} · ${esc(B.nom('paroisses',k.m.paroisseId)||lieu(k.m))}</div>${k.raison?`<div class="petit" style="color:var(--bleu)">${esc(k.raison)}</div>`:''}</div><div class="score"><b>${k.score}%</b><div class="petit muet">ressemblance</div></div></div>`).join('')}
        <button class="btn btn-contour btn-s" id="c-corr2">Aucune ne correspond</button>`;
      z.querySelectorAll('.candidat').forEach(e => e.onclick = () => { c.choisi = e.dataset.id; dessiner(); });
      $('#c-corr2').onclick = () => { c.res={etat:'non-repertorie',candidats:[]}; dessiner(); };
      return;
    }
    const m = B.par('membres', c.choisi), dj = deja(c.activiteId, m.id), piece = B.TYPES_PIECE.find(t=>t.id===c.type);
    z.innerHTML = `<div class="identifie">${avatar(m,'j')}<div><div class="nom">${esc(nomComplet(m))}</div><div class="mono muet">${esc(m.matricule)}</div>
      <span class="pastille p-ok" style="margin-top:6px">${c.res.raison?esc(c.res.raison):(c.nouveau?'nouvelle fiche':'identifié sur pièce')}</span>${d.participations.some(x=>x.activiteId===c.activiteId&&x.membreId===m.id)?' <span class="pastille p-info" style="margin-top:6px">inscrit à cette activité</span>':''}</div></div>
      <div style="margin-top:14px">
        <div class="ligne-fiche"><span class="k">Pièce présentée</span><span class="v">${esc(piece?piece.nom:'')}</span></div>
        <div class="ligne-fiche"><span class="k">Né(e) le</span><span class="v">${esc(fdate(m.dateNaissance))}</span></div>
        <div class="ligne-fiche"><span class="k">Diocèse / secteur</span><span class="v">${esc(lieu(m))}</span></div>
        <div class="ligne-fiche"><span class="k">Paroisse</span><span class="v">${esc(B.nom('paroisses',m.paroisseId)||'—')}</span></div>
        <div class="ligne-fiche"><span class="k">Ministère · poste</span><span class="v">${esc([B.nom('ministeres',m.ministereId),B.nom('postes',m.posteId)].filter(Boolean).join(' · ')||'—')}</span></div></div>
      ${dj ? `<div class="alerte-boite warn"><div class="rond">!</div><h2>Déjà enregistré pour cette activité</h2><div class="petit" style="margin-top:4px">Présence validée à ${esc(heure(dj.heure))} · ${esc(dj.poste||'Poste 1')}</div></div>
        <button class="btn btn-contour btn-bloc" style="margin-top:12px" id="c-suiv">Personne suivante</button>`
      : `${c.numero && !(m.pieces||[]).some(p=>p.numero===c.numero) ? `<label style="display:flex;gap:9px;align-items:flex-start;margin-top:14px;font-size:12.5px;font-weight:600"><input type="checkbox" id="c-mem" style="width:auto;margin-top:3px" ${c.mem?'checked':''}> Mémoriser le n° de cette pièce sur la fiche (reconnaissance immédiate au prochain contrôle)</label>`:''}
         <button class="btn btn-vert btn-geant" style="margin-top:16px" id="c-ok">✓ PRÉSENT — valider la présence</button>
         <button class="btn btn-contour btn-s" style="margin-top:10px" id="c-pas">Ce n’est pas cette personne</button>`}${liste}`;
    if(dj){ $('#c-suiv').onclick = () => { reinit(); dessiner(); }; return; }
    $('#c-pas').onclick = () => { c.choisi=null; const reste = c.res.candidats.filter(k=>k.m.id!==m.id); c.res = reste.length ? Object.assign({},c.res,{etat:'a-choisir',candidats:reste,raison:''}) : {etat:'non-repertorie',candidats:[]}; dessiner(); };
    $('#c-ok').onclick = () => { const mem = $('#c-mem'); c.mem = mem ? mem.checked : c.mem; enregistrerPresence(m); };
  }

  /* ------------------------------------------------------------- statistiques */
  function vueStats(v, act){
    const d = B.d, ids = new Set(mesMembres().map(m=>m.id));
    act.innerHTML = '<button class="btn btn-contour" id="b-exp">Exporter la liste (CSV)</button><button class="btn btn-contour" id="b-pdf">Imprimer / PDF</button>';
    if(!etat.stat && d.activites.length) etat.stat = d.activites[0].id;
    const a = B.par('activites', etat.stat), lp = d.presences.filter(p=>p.activiteId===etat.stat && ids.has(p.membreId));
    const pres = lp.map(p=>B.par('membres',p.membreId)).filter(Boolean);
    const rep = (cle, coll) => { const o={}; pres.forEach(m=>{ const n=B.nom(coll,m[cle])||'Non renseigné'; o[n]=(o[n]||0)+1; }); return Object.entries(o).sort((x,y)=>y[1]-x[1]); };
    const bloc = (t, l, f) => { const mx=Math.max(1,...l.map(x=>x[1])); return `<div class="tuile"><h2>${t}</h2><div class="sous">${a?esc(a.intitule):''}</div>${l.length?l.map(x=>`<div class="barre-ligne"><div class="l">${esc(x[0])}</div><div class="piste"><div class="rempli ${f?'f':''}" style="width:${Math.max(2,Math.round(100*x[1]/mx))}%"></div></div><div class="v">${x[1]}</div></div>`).join(''):'<div class="vide">Aucune présence enregistrée</div>'}</div>`; };
    v.innerHTML = `<div class="outils"><select id="s-act">${d.activites.map(x=>`<option value="${x.id}" ${x.id===etat.stat?'selected':''}>${esc(x.intitule)} — ${esc(fdate(x.date))}</option>`).join('')||'<option>Aucune activité</option>'}</select></div>
      <div class="grille c3"><div class="tuile kpi r"><div class="k">Présents</div><div class="v">${pres.length}</div><div class="note">validés par les postes</div></div>
      <div class="tuile kpi j"><div class="k">Inscrits sur place</div><div class="v">${lp.filter(p=>p.nouveau).length}</div><div class="note">nouveaux membres</div></div>
      <div class="tuile kpi b"><div class="k">Part de la base</div><div class="v">${ids.size?Math.round(100*pres.length/ids.size):0}%</div><div class="note">des membres de votre périmètre</div></div></div>
      <div class="grille c2" style="margin-top:18px">${bloc('Présents par ministère', rep('ministereId','ministeres'), true)}${bloc('Présents par diocèse', rep('dioceseId','dioceses'))}</div>`;
    const s = $('#s-act'); if(s) s.onchange = e => { etat.stat = e.target.value; dessiner(); };
    $('#b-pdf').onclick = () => Exports.imprimer('Liste de présence — '+(a?a.intitule:''), a&&a.date?fdate(a.date):'', ['N°','Matricule','Nom','Diocèse','Paroisse','Ministère','Heure'], lp.map((p, i) => { const m = B.par('membres', p.membreId); return m ? [i+1, m.matricule, nomAffiche(m), B.nom('dioceses',m.dioceseId), B.nom('paroisses',m.paroisseId), B.nom('ministeres',m.ministereId), heure(p.heure)] : null; }).filter(Boolean));
    $('#b-exp').onclick = () => {
      const l = ['Matricule;Nom;Prénoms;Diocèse;Secteur;Paroisse;Ministère;Heure;Pièce'];
      lp.forEach(p=>{ const m=B.par('membres',p.membreId); if(m) l.push([m.matricule,m.nom,m.prenoms,B.nom('dioceses',m.dioceseId),B.nom('secteurs',m.secteurId),B.nom('paroisses',m.paroisseId),B.nom('ministeres',m.ministereId),heure(p.heure),p.pieceType].join(';')); });
      const u = URL.createObjectURL(new Blob(['﻿'+l.join('\n')],{type:'text/csv'})); const e=document.createElement('a'); e.href=u; e.download='presences.csv'; e.click(); URL.revokeObjectURL(u);
    };
  }

  /* ------------------------------------------------------------- utilisateurs */
  function vueUtilisateurs(v, act){
    act.innerHTML = '<button class="btn btn-rouge" id="b-nu">+ Nouvel utilisateur</button>';
    $('#b-nu').onclick = formUtilisateur;
    v.innerHTML = `<div class="tuile" style="padding:0;overflow:hidden"><table class="tableau"><thead><tr><th>Utilisateur</th><th>Rôle</th><th>Périmètre</th><th></th></tr></thead><tbody>
      ${B.d.utilisateurs.map(u=>`<tr><td><div class="cellule-nom"><span class="avatar j">${esc(u.nom.split(' ').slice(0,2).map(x=>x[0]).join('').toUpperCase())}</span><div><div class="n">${esc(u.nom)}</div><div class="s">${esc(u.email)}${u.demo?' · démonstration':''}</div></div></div></td>
        <td><span class="pastille ${u.role==='admin'?'p-ko':'p-info'}">${esc(R.ROLES[u.role].nom)}</span></td><td>${esc(R.libellePortee(u)||'National')}</td>
        <td style="white-space:nowrap;text-align:right"><button class="btn btn-contour btn-s" data-mdp="${u.id}">Mot de passe</button> ${u.id===user.id?'':`<button class="btn btn-danger btn-s" data-del="${u.id}">✕</button>`}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="tuile" style="margin-top:18px"><h2>Qui voit quoi</h2><div class="sous">Chaque rôle n’accède qu’aux écrans et aux membres de son périmètre.</div>
        ${Object.values(R.ROLES).map(r=>`<div class="ligne-fiche"><span class="k"><b style="color:var(--encre)">${esc(r.nom)}</b></span><span class="v" style="font-weight:600">${r.pages.map(p=>esc(PAGES.find(x=>x.id===p).nom)).join(' · ')}</span></div>`).join('')}</div>`;
    v.querySelectorAll('[data-mdp]').forEach(b => b.onclick = async () => { const n = prompt('Nouveau mot de passe (6 caractères minimum) :'); if(!n) return; if(n.length<6) return toast('Trop court.', true);
      const u = B.par('utilisateurs', b.dataset.mdp); u.mdp = await R.empreinte(n); u.demo = false; B.tracer('mot de passe changé', u.email); B.sauver(); toast('Mot de passe mis à jour.'); });
    v.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { const u=B.par('utilisateurs', b.dataset.del); if(confirm('Supprimer le compte '+u.email+' ?')){ B.retirer('utilisateurs', u.id); B.tracer('compte supprimé', u.email); B.sauver(); dessiner(); } });
  }
  function formUtilisateur(){
    const v = modale('Nouvel utilisateur', `<div class="grille-champs">
      <div class="large"><label>Nom affiché *</label><input type="text" id="u-nom"></div>
      <div class="large"><label>Adresse électronique *</label><input type="email" id="u-em"></div>
      <div><label>Rôle</label><select id="u-role">${Object.entries(R.ROLES).map(([k,r])=>`<option value="${k}">${esc(r.nom)}</option>`).join('')}</select></div>
      <div><label>Mot de passe (6 car. min.) *</label><input type="password" id="u-mp"></div>
      <div><label>Diocèse (périmètre)</label><select id="u-dio">${options('dioceses','',undefined).replace('value="">—','value="">Tout')}</select></div>
      <div><label>Secteur / paroisse (périmètre)</label><select id="u-lieu"><option value="">—</option>${B.d.secteurs.map(s=>`<option value="s:${esc(s.nom)}">Secteur : ${esc(s.nom)}</option>`).join('')}${B.d.paroisses.map(p=>`<option value="p:${esc(p.nom)}">Paroisse : ${esc(p.nom)}</option>`).join('')}</select></div></div>`,
      '<button class="btn btn-contour" id="u-ann">Annuler</button><button class="btn btn-rouge" id="u-ok">Créer le compte</button>');
    $('#u-ann',v).onclick = () => v.remove();
    $('#u-ok',v).onclick = async () => {
      const nom = $('#u-nom',v).value.trim(), em = $('#u-em',v).value.trim().toLowerCase(), mp = $('#u-mp',v).value;
      if(!nom || !em || mp.length<6) return toast('Nom, adresse et mot de passe (6 caractères) obligatoires.', true);
      if(B.d.utilisateurs.some(u=>u.email===em)) return toast('Cette adresse existe déjà.', true);
      const role = $('#u-role',v).value, portee = {}, dio = B.par('dioceses', $('#u-dio',v).value), lieuSel = $('#u-lieu',v).value;
      if(dio) portee.diocese = dio.nom; if(lieuSel.startsWith('s:')) portee.secteur = lieuSel.slice(2); if(lieuSel.startsWith('p:')) portee.paroisse = lieuSel.slice(2);
      if(R.ROLES[role].portee && !Object.keys(portee).length) return toast('Ce rôle exige un périmètre (diocèse, secteur ou paroisse).', true);
      B.ajouter('utilisateurs',{email:em, nom, role, portee:Object.keys(portee).length?portee:null, mdp:await R.empreinte(mp), creeLe:new Date().toISOString()});
      B.tracer('compte créé', em); B.sauver(); v.remove(); dessiner();
    };
  }

  /* ---------------------------------------------------------- listes référence */
  function vueRef(v, act){
    act.innerHTML = '<button class="btn btn-contour" id="b-coh">Contrôler la cohérence</button><button class="btn btn-contour" id="b-sv">Sauvegarder la base</button> <button class="btn btn-contour" id="b-rs">Restaurer</button>';
    $('#b-coh').onclick = () => Registre.afficherCoherence({modale});
    $('#b-sv').onclick = () => { const u=URL.createObjectURL(new Blob([B.exporter()],{type:'application/json'})); const e=document.createElement('a'); e.href=u; e.download='base-rcci-'+new Date().toISOString().slice(0,10)+'.json'; e.click(); URL.revokeObjectURL(u); };
    $('#b-rs').onclick = () => { const i=document.createElement('input'); i.type='file'; i.accept='.json'; i.onchange=()=>{ const r=new FileReader(); r.onload=()=>{ try{ B.importer(r.result); toast('Base restaurée.'); ecranEntree(); }catch(e){ toast('Fichier invalide.',true);} }; r.readAsText(i.files[0]); }; i.click(); };
    const ong = [['dioceses','Diocèses'],['secteurs','Secteurs'],['paroisses','Paroisses'],['ministeres','Ministères'],['postes','Postes de responsabilité'],['typesActivite','Types d’activités']];
    const k = etat.refOnglet, d = B.d, parent = k==='secteurs'||k==='paroisses' ? 'dioceseId' : null;
    let liste = d[k]; if(k === 'paroisses' && etat.refSec) liste = liste.filter(x => etat.refSec === 'none' ? !x.secteurId : x.secteurId === etat.refSec);
    v.innerHTML = `<div class="outils">${ong.map(o=>`<button class="btn ${o[0]===k?'btn-marine':'btn-contour'} btn-s" data-o="${o[0]}">${o[1]} (${d[o[0]].length})</button>`).join('')}</div>
      ${k==='paroisses'?`<div class="outils"><select id="r-fs" style="max-width:260px"><option value="">Toutes les paroisses</option><option value="none" ${etat.refSec==='none'?'selected':''}>Paroisses sans secteur (${d.paroisses.filter(x=>!x.secteurId && d.secteurs.some(s=>s.dioceseId===x.dioceseId)).length})</option>${d.secteurs.map(s=>`<option value="${s.id}" ${etat.refSec===s.id?'selected':''}>${esc(s.nom)} (${d.paroisses.filter(x=>x.secteurId===s.id).length})</option>`).join('')}</select><span class="muet petit">Rattachez chaque paroisse d’Abidjan à son secteur dans la colonne « Secteur ».</span></div>`:''}
      <div class="grille c21" style="align-items:start"><div class="tuile" style="padding:0;overflow:hidden"><table class="tableau"><thead><tr><th>Nom</th>${parent?'<th>Diocèse</th>':''}${k==='paroisses'?'<th>Secteur</th>':''}<th></th></tr></thead><tbody>
        ${liste.length?liste.map(x=>`<tr><td>${esc(x.nom)}</td>${parent?`<td>${esc(B.nom('dioceses',x.dioceseId))}</td>`:''}${k==='paroisses'?(d.secteurs.some(s=>s.dioceseId===x.dioceseId)?`<td><select data-sp="${x.id}" style="padding:6px 8px;width:auto;max-width:170px"><option value="">— sans secteur —</option>${d.secteurs.filter(s=>s.dioceseId===x.dioceseId).map(s=>`<option value="${s.id}" ${s.id===x.secteurId?'selected':''}>${esc(s.nom)}</option>`).join('')}</select></td>`:'<td class="muet">—</td>'):''}<td style="text-align:right"><button class="btn btn-contour btn-s" data-ren="${x.id}">Modifier</button> <button class="btn btn-danger btn-s" data-del="${x.id}">✕</button></td></tr>`).join(''):'<tr><td colspan="4"><div class="vide"><b>Liste vide</b>Collez la liste officielle à droite.</div></td></tr>'}</tbody></table></div>
      <div class="tuile"><h2>Ajouter une liste</h2><div class="sous">Un élément par ligne. Les doublons sont ignorés.</div>
        ${parent?`<label class="petit" style="font-weight:700">Diocèse</label><select id="r-dio" style="margin-bottom:10px">${options('dioceses','')}</select>`:''}
        ${k==='paroisses'?`<label class="petit" style="font-weight:700">Secteur (Abidjan uniquement)</label><select id="r-sec" style="margin-bottom:10px">${options('secteurs','')}</select>`:''}
        <textarea id="r-txt" placeholder="Collez ici…"></textarea><button class="btn btn-rouge btn-bloc" style="margin-top:12px" id="r-ok">Ajouter</button></div></div>`;
    v.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { etat.refOnglet = b.dataset.o; dessiner(); });
    if($('#r-fs')) $('#r-fs').onchange = e => { etat.refSec = e.target.value; dessiner(); };
    // rattacher une paroisse à son secteur : ses membres suivent (sauf ceux qui ont un autre secteur explicite)
    v.querySelectorAll('[data-sp]').forEach(s => s.onchange = () => { const p = B.par('paroisses', s.dataset.sp), ancien = p.secteurId || ''; p.secteurId = s.value;
      d.membres.forEach(m => { if(m.paroisseId === p.id && (!m.secteurId || m.secteurId === ancien)) m.secteurId = s.value; });
      B.tracer('paroisse → secteur', p.nom+' → '+(B.nom('secteurs', s.value)||'aucun')); B.sauver(); toast(p.nom+' : '+(B.nom('secteurs', s.value)||'sans secteur')+'.'); });
    v.querySelectorAll('[data-ren]').forEach(b => b.onclick = () => { const x = B.par(k, b.dataset.ren), n = prompt('Nouveau nom :', x.nom); if(n && n.trim()){ B.tracer('renommage '+k, x.nom+' → '+n.trim()); x.nom = n.trim(); B.sauver(); dessiner(); } });
    v.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { B.retirer(k, b.dataset.del); dessiner(); });
    $('#r-ok').onclick = () => {
      const extra = {};
      if(parent){ extra.dioceseId = $('#r-dio').value; if(!extra.dioceseId) return toast('Choisissez le diocèse.', true); }
      if(k==='paroisses' && $('#r-sec').value) extra.secteurId = $('#r-sec').value;
      const n = B.importerNoms(k, $('#r-txt').value.split('\n'), extra); toast(n+' élément(s) ajouté(s).'); dessiner();
    };
  }

  /* ------------------------------------------------------------------ démarrage */
  (async function(){
    B.charger(); await Photos.charger(); await R.semer(); Intercession.semer(); Intercession.migrer(); Intercession.activitesDuRenouveau();
    let u = null; try { const id = sessionStorage.getItem('rcci.uid'); u = id && B.par('utilisateurs', id); } catch(_){}
    if(u) ouvrir(u); else ecranEntree();
  })();
})();
