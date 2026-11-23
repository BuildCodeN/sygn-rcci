/* archives.js — ARCHIVES (comptes rendus, rapports) et GÉNÉRATEUR D'ATTESTATIONS / DIPLÔMES à partir d'un gabarit.
   Les fichiers (PDF, Word, images…) et le gabarit sont gardés dans IndexedDB (base « rcci-docs ») sur l'appareil ;
   les fiches descriptives (titre, catégorie, exercice…) sont dans la collection « documents » de la base. */
(function(){
  'use strict';
  const B = Base;
  const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $ = (s, r) => (r||document).querySelector(s);
  let C = null;
  const S = {onglet:'docs', q:'', cat:'', exo:''};
  const CATS = ['Compte rendu', 'Rapport de fin d’activité', 'Rapport de fin d’exercice', 'Procès-verbal', 'Liste de présence', 'Programme et livret', 'Autre document'];
  const taille = n => n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko';
  const aujourdhui = () => new Date().toISOString().slice(0, 10);
  const exoCourant = () => { const d = new Date(), a = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1; return a + '-' + (a + 1); };

  /* ------------------------------------------------------------- stockage des fichiers */
  const ouvrirBase = () => new Promise((ok, ko) => { const r = indexedDB.open('rcci-docs', 1); r.onupgradeneeded = () => r.result.createObjectStore('f', {keyPath:'id'}); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
  async function mettre(rec){ const d = await ouvrirBase(); return new Promise((ok, ko) => { const t = d.transaction('f', 'readwrite'); t.objectStore('f').put(rec); t.oncomplete = ok; t.onerror = () => ko(t.error); }); }
  async function lire(id){ const d = await ouvrirBase(); return new Promise((ok, ko) => { const r = d.transaction('f').objectStore('f').get(id); r.onsuccess = () => ok(r.result || null); r.onerror = () => ko(r.error); }); }
  async function effacer(id){ const d = await ouvrirBase(); return new Promise((ok, ko) => { const t = d.transaction('f', 'readwrite'); t.objectStore('f').delete(id); t.oncomplete = ok; t.onerror = () => ko(t.error); }); }

  /* ================================================================ page ARCHIVES */
  function vue(v, act, ctx){
    C = ctx; Finance.init(ctx);
    const admin = C.peut('activites');
    v.innerHTML = `<div class="alerte-boite" style="margin:0 0 16px"><b>Où sont gardés les fichiers ?</b> Sur cet appareil, dans le navigateur (base locale). Le partage en ligne entre plusieurs personnes viendra avec la base commune sur serveur ; d’ici là, gardez une copie des fichiers importants.</div>
      <div class="onglets">${[['docs', 'Comptes rendus et rapports'], ['rap', 'Rapports générés et instantanés']].map(([k, l]) => `<button data-o="${k}" class="${S.onglet === k ? 'on' : ''}">${l}</button>`).join('')}</div><div id="ar-corps"></div>`;
    v.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { S.onglet = b.dataset.o; vue(v, act, ctx); });
    const z = $('#ar-corps', v), rafr = () => vue(v, act, ctx);
    if(S.onglet === 'docs') docs(z, rafr, admin); else rapports(z, rafr, admin);
  }
  function docs(z, rafr, admin){
    const L = B.d.documents.slice().sort((x, y) => (y.date || '').localeCompare(x.date || '') || (y.ajouteLe || '').localeCompare(x.ajouteLe || ''));
    const exos = [...new Set(L.map(d => d.exercice).filter(Boolean))].sort().reverse(), q = Identite.norm(S.q);
    const vus = L.filter(d => (!S.cat || d.categorie === S.cat) && (!S.exo || d.exercice === S.exo) && (!q || Identite.norm(d.titre + ' ' + (d.notes || '') + ' ' + d.nomFichier).includes(q)));
    z.innerHTML = `<div id="d-four"></div><div class="tuile" style="padding:0;overflow:hidden"><div class="outils" style="padding:14px 16px 0;margin:0"><input type="search" id="d-q" placeholder="Rechercher un document…" value="${esc(S.q)}">
        <select id="d-c"><option value="">Toutes les catégories</option>${CATS.map(c => `<option ${c === S.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <select id="d-e"><option value="">Tous les exercices</option>${exos.map(e => `<option ${e === S.exo ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select>
        <button class="btn btn-rouge" id="d-n">+ Archiver un document</button></div>
      <div class="defile"><table class="tableau"><thead><tr><th>Document</th><th>Catégorie</th><th>Exercice</th><th>Activité</th><th>Date</th><th></th></tr></thead><tbody>
      ${vus.length ? vus.map(d => `<tr><td><b>${esc(d.titre)}</b><div class="petit muet">${esc(d.nomFichier || '')} · ${taille(d.taille || 0)}${d.notes ? ' · ' + esc(d.notes) : ''}</div></td><td>${esc(d.categorie)}</td><td>${esc(d.exercice || '—')}</td><td>${esc(d.activiteId ? B.nom('activites', d.activiteId) || '—' : '—')}</td><td>${d.date ? esc(Finance.dj(d.date + 'T00:00:00')) : '—'}</td>
        <td style="white-space:nowrap"><button class="btn btn-contour btn-s" data-ou="${d.id}">Ouvrir</button> <button class="btn btn-contour btn-s" data-te="${d.id}">Télécharger</button>${admin ? ` <button class="btn btn-contour btn-s" data-mo="${d.id}">Modifier</button> <button class="btn btn-danger btn-s" data-su="${d.id}">Supprimer</button>` : ''}</td></tr>`).join('')
        : '<tr><td colspan="6"><div class="vide"><b>Aucun document archivé</b>Ajoutez ici vos comptes rendus, rapports de fin d’activité et rapports de fin d’exercice (PDF, Word, images…).</div></td></tr>'}</tbody></table></div></div>`;
    $('#d-q', z).oninput = e => { S.q = e.target.value; const p = e.target.selectionStart; docs(z, rafr, admin); const n = $('#d-q', z); n.focus(); try { n.setSelectionRange(p, p); } catch(_){} };
    $('#d-c', z).onchange = e => { S.cat = e.target.value; docs(z, rafr, admin); };
    $('#d-e', z).onchange = e => { S.exo = e.target.value; docs(z, rafr, admin); };
    $('#d-n', z).onclick = () => choisirFichiers(rafr);
    fournies(z, rafr, admin);
    const fich = async (id, tel) => {
      const d = B.par('documents', id), r = await lire(d.fichierId);
      if(!r){ return C.toast('Fichier introuvable sur cet appareil (il a été archivé depuis un autre appareil).', true); }
      const u = URL.createObjectURL(r.blob);
      if(tel){ const a = document.createElement('a'); a.href = u; a.download = d.nomFichier || 'document'; document.body.appendChild(a); a.click(); a.remove(); }
      else window.open(u, '_blank');
      setTimeout(() => URL.revokeObjectURL(u), 60000);
    };
    z.querySelectorAll('[data-ou]').forEach(b => b.onclick = () => fich(b.dataset.ou, false));
    z.querySelectorAll('[data-te]').forEach(b => b.onclick = () => fich(b.dataset.te, true));
    z.querySelectorAll('[data-mo]').forEach(b => b.onclick = () => formDoc(B.par('documents', b.dataset.mo), rafr));
    z.querySelectorAll('[data-su]').forEach(b => b.onclick = () => {
      const d = B.par('documents', b.dataset.su);
      const w = C.modale('Supprimer le document', `<p>Supprimer définitivement <b>${esc(d.titre)}</b> ?</p><p class="petit muet">Le fichier sera effacé de cet appareil. Cette action est définitive.</p>`, '<button class="btn btn-contour" id="sd-a">Annuler</button><button class="btn btn-danger" id="sd-ok">Supprimer</button>');
      $('#sd-a', w).onclick = () => w.remove();
      $('#sd-ok', w).onclick = async () => { try { await effacer(d.fichierId); } catch(_){} B.retirer('documents', d.id); B.tracer('document supprimé', d.titre + ' — ' + C.user.email); w.remove(); rafr(); };
    });
  }
  /** Documents livrés avec l'application (dossier assets/archives-fournies, version locale) : archivage en un clic. */
  async function fournies(z, rafr, admin){
    if(!admin) return; let liste; try { const r = await fetch('assets/archives-fournies/manifest.json?c=' + Date.now()); if(!r.ok) return; liste = await r.json(); } catch(_){ return; }
    const faits = new Set(B.d.documents.map(d => d.nomFichier)), reste = liste.filter(x => !faits.has(x.nomFichier)); const zone = $('#d-four', z); if(!zone || !reste.length) return;
    zone.innerHTML = `<div class="alerte-boite ok" style="margin:0 0 14px"><b>${reste.length} document(s) prêt(s) à archiver</b> : ${reste.map(x => esc(x.titre)).join(' · ')}<div style="margin-top:8px"><button class="btn btn-rouge btn-s" id="d-fo">Archiver ces documents maintenant</button></div></div>`;
    $('#d-fo', z).onclick = async () => { let n = 0;
      for(const x of reste){ try { const r = await fetch('assets/archives-fournies/' + x.fichier); if(!r.ok) continue; const blob = await r.blob(), id = B.uid('doc'); await mettre({id, blob, nom:x.nomFichier, type:blob.type});
          const act = B.d.activites.find(a => Identite.norm(a.intitule) === Identite.norm(x.activite || ''));
          B.ajouter('documents', {fichierId:id, nomFichier:x.nomFichier, type:blob.type, taille:blob.size, ajouteLe:new Date().toISOString(), ajoutePar:C.user.email, titre:x.titre, categorie:x.categorie, exercice:x.exercice, activiteId:act ? act.id : '', date:x.date, notes:x.notes || ''}); n++; } catch(_){} }
      const act = B.d.activites.find(a => Identite.norm(a.intitule) === Identite.norm('Pèlerinage national')); if(act){ if(!act.date) act.date = '2026-07-18'; if(!act.lieu) act.lieu = 'Issia'; if(act.statut === 'en préparation') act.statut = 'clôturée'; }
      B.tracer('documents archivés', n + ' document(s) fourni(s) — ' + C.user.email); B.sauver(); C.toast(n + ' document(s) archivé(s).'); rafr(); };
  }
  /** Choix de plusieurs fichiers d'un coup, puis vérification du titre et de la catégorie de chacun. */
  function choisirFichiers(apres){
    const i = document.createElement('input'); i.type = 'file'; i.multiple = true;
    i.onchange = () => { if(i.files.length) lot([...i.files], apres); }; i.click();
  }
  function devine(nom){
    const n = Identite.norm(nom), exo = nom.match(/(20\d\d)\s*[-–/]\s*(20\d\d)/);
    const cat = /rapport/.test(n) ? (/(annuel|exercice|bilan)/.test(n) ? CATS[2] : CATS[1]) : /(compte ?rendu|\bcr\b)/.test(n) ? CATS[0] : /proces/.test(n) ? CATS[3] : /(liste|presence)/.test(n) ? CATS[4] : /(programme|livret)/.test(n) ? CATS[5] : CATS[6];
    return {cat, exo:exo ? exo[1] + '-' + exo[2] : exoCourant()};
  }
  function lot(fichiers, apres){
    const v = C.modale('Archiver ' + fichiers.length + ' document' + (fichiers.length > 1 ? 's' : ''), `<div class="grille-champs" style="margin-bottom:12px"><div><label>Activité concernée (pour tous)</label><select id="lt-a"><option value="">— aucune —</option>${B.d.activites.map(a => `<option value="${a.id}">${esc(a.intitule)}</option>`).join('')}</select></div><div><label>Exercice (pour tous)</label><input type="text" id="lt-e" value="${esc(devine(fichiers[0].name).exo)}"></div></div>
      ${fichiers.map((f, k) => { const g = devine(f.name); return `<div style="padding:10px 0;border-bottom:1px solid var(--trait)"><div class="petit muet">${esc(f.name)} · ${taille(f.size)}</div><div class="grille-champs" style="margin-top:6px"><div><label>Titre</label><input type="text" data-t="${k}" value="${esc(f.name.replace(/\.[^.]+$/, '').replace(/_+/g, ' '))}"></div><div><label>Catégorie</label><select data-c="${k}">${CATS.map(c => `<option ${c === g.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div></div></div>`; }).join('')}`,
      '<button class="btn btn-contour" id="lt-x">Annuler</button><button class="btn btn-rouge" id="lt-ok">Archiver</button>');
    $('#lt-x', v).onclick = () => v.remove();
    $('#lt-ok', v).onclick = async () => { let n = 0;
      for(let k = 0; k < fichiers.length; k++){ const f = fichiers[k]; if(f.size > 40 * 1048576){ C.toast(f.name + ' : trop lourd (40 Mo max).', true); continue; }
        const id = B.uid('doc'); try { await mettre({id, blob:f, nom:f.name, type:f.type}); } catch(e){ C.toast('Espace insuffisant sur cet appareil.', true); break; }
        B.ajouter('documents', {fichierId:id, nomFichier:f.name, type:f.type, taille:f.size, ajouteLe:new Date().toISOString(), ajoutePar:C.user.email, titre:($('[data-t="' + k + '"]', v).value.trim() || f.name), categorie:$('[data-c="' + k + '"]', v).value, exercice:$('#lt-e', v).value.trim(), activiteId:$('#lt-a', v).value, date:new Date(f.lastModified || Date.now()).toISOString().slice(0, 10), notes:''}); n++; }
      B.tracer('documents archivés', n + ' — ' + C.user.email); B.sauver(); v.remove(); C.toast(n + ' document(s) archivé(s).'); apres(); };
  }
  function formDoc(d, apres){
    const n = d || {};
    const v = C.modale(d ? 'Modifier le document' : 'Archiver un document', `<div class="grille-champs">
      ${d ? `<div class="large petit muet">Fichier : ${esc(d.nomFichier)} (${taille(d.taille || 0)})</div>` : '<div class="large"><label>Fichier * (PDF, Word, Excel, image…)</label><input type="file" id="ad-f"></div>'}
      <div class="large"><label>Titre *</label><input type="text" id="ad-t" value="${esc(n.titre || '')}" placeholder="ex. Compte rendu de la réunion du 12 octobre"></div>
      <div><label>Catégorie</label><select id="ad-c">${CATS.map(c => `<option ${c === (n.categorie || CATS[0]) ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
      <div><label>Exercice</label><input type="text" id="ad-e" value="${esc(n.exercice || exoCourant())}" placeholder="2026-2027"></div>
      <div><label>Activité concernée</label><select id="ad-a"><option value="">— aucune —</option>${B.d.activites.map(a => `<option value="${a.id}" ${a.id === n.activiteId ? 'selected' : ''}>${esc(a.intitule)}</option>`).join('')}</select></div>
      <div><label>Date du document</label><input type="date" id="ad-d" value="${esc(n.date || aujourdhui())}"></div>
      <div class="large"><label>Remarque</label><input type="text" id="ad-n" value="${esc(n.notes || '')}" placeholder="facultatif"></div></div>`,
      '<button class="btn btn-contour" id="ad-x">Annuler</button><button class="btn btn-rouge" id="ad-ok">Enregistrer</button>');
    if(!d) $('#ad-f', v).onchange = e => { const f = e.target.files[0]; if(f && !$('#ad-t', v).value) $('#ad-t', v).value = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '); };
    $('#ad-x', v).onclick = () => v.remove();
    $('#ad-ok', v).onclick = async () => {
      const titre = $('#ad-t', v).value.trim(); if(!titre) return C.toast('Donnez un titre au document.', true);
      const o = {titre, categorie:$('#ad-c', v).value, exercice:$('#ad-e', v).value.trim(), activiteId:$('#ad-a', v).value, date:$('#ad-d', v).value, notes:$('#ad-n', v).value.trim()};
      if(d){ Object.assign(d, o); B.tracer('document modifié', titre + ' — ' + C.user.email); B.sauver(); v.remove(); return apres(); }
      const f = $('#ad-f', v).files[0]; if(!f) return C.toast('Choisissez le fichier à archiver.', true);
      if(f.size > 40 * 1048576) return C.toast('Fichier trop lourd (40 Mo maximum).', true);
      const id = B.uid('doc');
      try { await mettre({id, blob:f, nom:f.name, type:f.type}); } catch(e){ return C.toast('Enregistrement impossible sur cet appareil (espace insuffisant ?).', true); }
      B.ajouter('documents', Object.assign({fichierId:id, nomFichier:f.name, type:f.type, taille:f.size, ajouteLe:new Date().toISOString(), ajoutePar:C.user.email}, o));
      B.tracer('document archivé', titre + ' — ' + o.categorie + ' — ' + C.user.email); C.toast('Document archivé.'); v.remove(); apres();
    };
  }

  /* ------------------------------------------------------------- rapports générés */
  const presentsDe = id => { const s = new Set(); B.d.presences.filter(p => p.activiteId === id).forEach(p => s.add(p.membreId));
    B.d.participations.filter(p => p.activiteId === id && ['liste de présence', 'présent'].includes(p.statut)).forEach(p => s.add(p.membreId)); return s; };
  const parDiocese = (ids, f) => { const g = new Map(); ids.forEach(id => { const m = B.par('membres', id); const k = Finance.dioDe(m); g.set(k, (g.get(k) || 0) + 1); }); return [...g.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], 'fr')); };
  function rapportActivite(a, obs){
    const ids = [...presentsDe(a.id)], c = Finance.calcul(a), dio = parDiocese(ids), pf = Finance.fcfa;
    const dioC = new Map(c.parDio.map(g => [g.nom, g]));
    const noms = [...new Set(dio.map(x => x[0]).concat(c.parDio.map(g => g.nom)))];
    const lig = noms.map(k => [k, (dio.find(x => x[0] === k) || [0, 0])[1], (dioC.get(k) || {nb:0}).nb, pf((dioC.get(k) || {montant:0}).montant)]);
    lig.push(['TOTAL', ids.length, c.lignes.length, pf(c.total)]);
    return {kind:'rapport-activite', activiteId:a.id, titre:'Rapport de fin d’activité — ' + a.intitule, sous:(a.date ? Finance.dj(a.date + 'T00:00:00') : 'date non renseignée') + (a.lieu ? ' · ' + a.lieu : ''),
      resume:[['Activité', a.intitule], ['Date', a.date ? Finance.dj(a.date + 'T00:00:00') : '—'], ['Lieu', a.lieu || '—'], ['Responsable', a.responsable || '—'], ['Personnes présentes', ids.length], ['Cotisants', c.lignes.length], ['Montant des cotisations', pf(c.total)], ['Avant / pendant', pf(c.avant) + ' / ' + pf(c.pendant)]].concat(obs ? [['Observations', obs]] : []),
      tableaux:[{titre:'Présents et cotisations par diocèse', entetes:['Diocèse', 'Présents', 'Cotisants', 'Montant'], lignes:lig},
        {titre:'Liste des présents', entetes:['N°', 'Nom et prénoms', 'Diocèse', 'Paroisse'], lignes:ids.map(id => B.par('membres', id)).filter(Boolean).sort((x, y) => Finance.nomM(x).localeCompare(Finance.nomM(y), 'fr')).map((m, i) => [i + 1, Finance.nomM(m), Finance.dioDe(m), Finance.parDe(m)])}]};
  }
  function rapportExercice(lib, du, au, obs){
    const pf = Finance.fcfa, acts = B.d.activites.filter(a => !a.parentId && a.date && a.date >= du && a.date <= au).sort((x, y) => x.date.localeCompare(y.date));
    let tp = 0, tc = 0, tm = 0;
    const lig = acts.map(a => { const p = presentsDe(a.id).size, c = Finance.calcul(a); tp += p; tc += c.lignes.length; tm += c.total; return [a.intitule, Finance.dj(a.date + 'T00:00:00'), a.lieu || '', a.statut, p, c.lignes.length, pf(c.total)]; });
    lig.push(['TOTAL', '', '', '', tp, tc, pf(tm)]);
    const nouveaux = B.d.membres.filter(m => (m.creeLe || '').slice(0, 10) >= du && (m.creeLe || '').slice(0, 10) <= au).length;
    const dip = B.d.diplomes.filter(d => (d.remisLe || '').slice(0, 10) >= du && (d.remisLe || '').slice(0, 10) <= au).length;
    return {kind:'rapport-exercice', titre:'Rapport de fin d’exercice — ' + lib, sous:'Du ' + Finance.dj(du + 'T00:00:00') + ' au ' + Finance.dj(au + 'T00:00:00'),
      resume:[['Exercice', lib], ['Activités menées', acts.length], ['Total des présences', tp], ['Total des cotisations', pf(tm)], ['Membres enregistrés (total)', B.d.membres.length], ['Nouveaux membres sur la période', nouveaux], ['Diplômes remis', dip]].concat(obs ? [['Observations', obs]] : []),
      tableaux:[{titre:'Bilan des activités', entetes:['Activité', 'Date', 'Lieu', 'Statut', 'Présents', 'Cotisants', 'Cotisations'], lignes:lig}]};
  }
  function genere(s, apres){
    Object.assign(s, {id:B.uid('arc'), date:new Date().toISOString(), par:C.user.email}); B.d.archives.unshift(s);
    B.tracer('rapport généré', s.titre + ' — ' + C.user.email); B.sauver(); C.toast('Rapport enregistré dans les archives.'); apres();
  }
  function rapports(z, rafr, admin){
    z.innerHTML = `<div class="tuile" style="margin-bottom:16px"><h2>Générer un rapport</h2><div class="sous">Le rapport est calculé à partir des présences, des cotisations et des fiches, puis conservé tel quel (instantané figé) et imprimable.</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-rouge" id="g-a">Rapport de fin d’activité</button><button class="btn btn-rouge" id="g-e">Rapport de fin d’exercice</button></div></div><div id="ar-liste"></div>`;
    Finance.archivesOnglet($('#ar-liste', z));
    $('#g-a', z).onclick = () => {
      const w = C.modale('Rapport de fin d’activité', `<div class="grille-champs"><div class="large"><label>Activité</label><select id="ra-a">${B.d.activites.filter(a => !a.parentId).map(a => `<option value="${a.id}">${esc(a.intitule)}${a.date ? ' — ' + esc(Finance.dj(a.date + 'T00:00:00')) : ''}</option>`).join('')}</select></div>
        <div class="large"><label>Observations (facultatif)</label><textarea id="ra-o" rows="4" placeholder="Déroulement, difficultés, recommandations…" style="width:100%"></textarea></div></div>`, '<button class="btn btn-contour" id="ra-x">Annuler</button><button class="btn btn-rouge" id="ra-ok">Générer</button>');
      $('#ra-x', w).onclick = () => w.remove();
      $('#ra-ok', w).onclick = () => { const a = B.par('activites', $('#ra-a', w).value); w.remove(); genere(rapportActivite(a, $('#ra-o', w).value.trim()), rafr); };
    };
    $('#g-e', z).onclick = () => {
      const d = new Date(), y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
      const w = C.modale('Rapport de fin d’exercice', `<div class="grille-champs"><div class="large"><label>Exercice</label><input type="text" id="re-l" value="${y}-${y + 1}"></div>
        <div><label>Du</label><input type="date" id="re-d" value="${y}-09-01"></div><div><label>Au</label><input type="date" id="re-f" value="${y + 1}-08-31"></div>
        <div class="large"><label>Observations (facultatif)</label><textarea id="re-o" rows="4" placeholder="Bilan général, perspectives…" style="width:100%"></textarea></div></div><div class="petit muet" style="margin-top:8px">Seules les activités datées dans cette période sont comptées.</div>`,
        '<button class="btn btn-contour" id="re-x">Annuler</button><button class="btn btn-rouge" id="re-ok">Générer</button>');
      $('#re-x', w).onclick = () => w.remove();
      $('#re-ok', w).onclick = () => { const du = $('#re-d', w).value, au = $('#re-f', w).value; if(!du || !au || du > au) return C.toast('Vérifiez les dates de la période.', true); w.remove(); genere(rapportExercice($('#re-l', w).value.trim() || du.slice(0, 4), du, au, $('#re-o', w).value.trim()), rafr); };
    };
  }

  /* ================================================================ ATTESTATIONS / DIPLÔMES à partir d'un gabarit
     Le gabarit est une image du document SANS les parties variables ; l'application y écrit des « champs » :
     civilité, nom, lieu de la formation, date. Chaque champ a sa position, sa police, sa taille, sa couleur. */
  const POLICES = ['Cooper Black', 'Georgia', 'Times New Roman', 'Garamond', 'Palatino Linotype', 'Brush Script MT', 'Monotype Corsiva', 'Arial', 'Calibri'];
  const CHAMPS0 = [   // positions relevées sur l'attestation de formation 2025-2026 (A4 paysage)
    {id:'intro', label:'Ligne d’introduction', texte:'Le bureau national, atteste que {civilite}', x:50, y:33.3, taille:13, couleur:'#1d1e1b', police:'Arial', gras:true, align:'center'},
    {id:'nom', label:'Nom de la personne', texte:'{nom}', x:50, y:43.8, taille:57.8, couleur:'#0001C5', police:'Cooper Black', gras:false, align:'center', ajuster:true, largeur:84},
    {id:'lieu', label:'Lieu de la formation', texte:'Ladite formation s’est tenue au sein de la paroisse Saint-Michel d’Adjamé, dans le diocèse d’Abidjan.\nEn foi de quoi, la présente attestation lui est délivrée pour servir et valoir ce que de droit.', x:50, y:59.5, taille:12.3, couleur:'#1d1e1b', police:'Arial', gras:true, align:'center'},
    {id:'date', label:'Date et lieu d’émission', texte:'Fait à Abidjan, le {date}.', x:93.2, y:66.1, taille:12.3, couleur:'#1d1e1b', police:'Arial', gras:true, align:'right'}];
  const CFG0 = {format:'np', casse:'titre', dateISO:'', champs:null};
  function cfg(){
    const s = B.d.meta.diplome || {}, c = Object.assign({}, CFG0, s);
    c.champs = CHAMPS0.map(d => Object.assign({}, d, ((s.champs || []).find(x => x.id === d.id)) || {}));
    if(!c.dateISO) c.dateISO = aujourdhui(); return c;
  }
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const dateFr = iso => { const d = new Date(iso + 'T00:00:00'); return isNaN(d) ? iso : (d.getDate() === 1 ? '1er' : d.getDate()) + ' ' + MOIS[d.getMonth()] + ' ' + d.getFullYear(); };
  const civilite = m => ({'M.':'Monsieur', 'Mme':'Madame', 'Mlle':'Mademoiselle'})[m.civilite] || (m.sexe === 'M' ? 'Monsieur' : m.sexe === 'F' ? 'Madame' : '');
  function nomDiplome(m, c){
    const titre = s => s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
    let nom = (m.nom || '').toUpperCase(), pre = c.casse === 'maj' ? (m.prenoms || '').toUpperCase() : titre(m.prenoms || '');
    const epo = m.epouseDe ? ' Épse ' + m.epouseDe.toUpperCase() : '';
    return (c.format === 'pn' ? pre + ' ' + nom + epo : nom + ' ' + pre + epo).replace(/\s+/g, ' ').trim();
  }
  const texteChamp = (ch, m, c) => ch.texte.replace(/\{civilite\}/g, civilite(m)).replace(/\{nom\}/g, nomDiplome(m, c)).replace(/\{date\}/g, dateFr(c.dateISO)).replace(/\{diocese\}/g, Finance.dioDe(m)).replace(/[ \t]+\n/g, '\n').trim();
  async function lireGabarit(){
    try { const r = await lire('gabarit-diplome'); if(r) return r; } catch(_){}
    try { const r = await fetch('assets/gabarits/attestation-formation-biblique-2025-2026-vierge.jpg'); if(r.ok) return {blob:await r.blob(), nom:'attestation (fournie)'}; } catch(_){}
    return null;
  }
  async function enregistrerPolice(){
    let r = null; try { r = await lire('police-diplome'); } catch(_){}
    if(!r){ try { const f = await fetch('assets/gabarits/police-nom-cooper-black.ttf'); if(f.ok) r = {blob:await f.blob()}; } catch(_){} }
    if(!r) return null;
    try { const ff = new FontFace('Cooper Black', await r.blob.arrayBuffer()); await ff.load(); document.fonts.add(ff); } catch(_){ return null; }
    return r.blob;
  }
  async function chargerPdfJs(){
    if(window.pdfjsLib) return window.pdfjsLib;
    await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'; s.onload = ok; s.onerror = () => ko(new Error('Module PDF indisponible (connexion internet nécessaire).')); document.head.appendChild(s); });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; return window.pdfjsLib;
  }
  async function pdfEnImage(fichier){
    const lib = await chargerPdfJs(), pdf = await lib.getDocument({data:await fichier.arrayBuffer()}).promise, page = await pdf.getPage(1), vp = page.getViewport({scale:3});
    const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height; await page.render({canvasContext:cv.getContext('2d'), viewport:vp}).promise;
    return await new Promise(ok => cv.toBlob(ok, 'image/jpeg', .93));
  }
  const dimImage = url => new Promise(ok => { const i = new Image(); i.onload = () => ok({w:i.naturalWidth, h:i.naturalHeight}); i.onerror = () => ok({w:297, h:210}); i.src = url; });
  const pageMm = d => d.w >= d.h ? {w:297, h:210, o:'landscape'} : {w:210, h:297, o:'portrait'};
  function largeurTexte(texte, ch){       // largeur (en unités de 100 px) du texte le plus long
    const cv = largeurTexte.cv || (largeurTexte.cv = document.createElement('canvas')), g = cv.getContext('2d');
    g.font = (ch.gras ? 'bold ' : '') + '100px "' + ch.police + '"'; return Math.max(...texte.split('\n').map(l => g.measureText(l).width)) / 100;
  }
  /** Taille en pt : celle du champ, réduite si le texte dépasse la largeur autorisée. */
  function taillePt(texte, ch, pg){
    if(!ch.ajuster) return ch.taille;
    const maxMm = pg.w * (ch.largeur || 80) / 100, ptMax = maxMm / 0.3528 / Math.max(largeurTexte(texte, ch), .1);
    return Math.min(ch.taille, Math.max(8, ptMax));
  }
  const familleCss = ch => "'" + ch.police + "'" + (ch.police === 'Cooper Black' ? ",'Georgia'" : '') + ',serif';
  function styleChamp(ch, pt, unite, k){          // k = facteur (px par pt) pour l'aperçu, 1 pour l'impression
    const tx = ch.align === 'center' ? '-50%' : ch.align === 'right' ? '-100%' : '0';
    return `left:${ch.x}%;top:${ch.y}%;transform:translate(${tx},-50%);font:${ch.gras ? 'bold ' : ''}${(pt * k).toFixed(2)}${unite} ${familleCss(ch)};color:${ch.couleur};text-align:${ch.align};line-height:1.4;white-space:pre;`;
  }
  function imprimerDiplomes(url, d, c, personnes, urlPolice){
    const pg = pageMm(d), f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'; document.body.appendChild(f);
    const doc = f.contentWindow.document; doc.open();
    doc.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Attestations</title><style>${urlPolice ? `@font-face{font-family:"Cooper Black";src:url("${urlPolice}")}` : ''}@page{size:A4 ${pg.o};margin:0}html,body{margin:0;padding:0}.p{position:relative;width:${pg.w}mm;height:${pg.h}mm;overflow:hidden;page-break-after:always;break-after:page;-webkit-print-color-adjust:exact;print-color-adjust:exact}.p:last-child{page-break-after:auto;break-after:auto}.p img{position:absolute;left:0;top:0;width:100%;height:100%}.n{position:absolute}</style></head><body>` +
      personnes.map(m => `<div class="p"><img src="${url}" alt="">${c.champs.map(ch => { const t = texteChamp(ch, m, c); return t ? `<div class="n" style="${styleChamp(ch, taillePt(t, ch, pg), 'pt', 1)}">${esc(t)}</div>` : ''; }).join('')}</div>`).join('') + '</body></html>');
    doc.close();
    const lancer = () => { if(window.Exports && window.Exports.sansImpression) return; try { f.contentWindow.focus(); f.contentWindow.print(); } catch(e){} setTimeout(() => f.remove(), 120000); };
    const attendre = () => { const im = doc.images[0], pret = () => (doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve()).then(() => setTimeout(lancer, 250)); if(im && !im.complete) im.onload = im.onerror = pret; else pret(); };
    attendre();
  }

  /** Fenêtre « Attestations ». lignes = admis dont la cotisation est réglée ; seul = id d'une personne à présélectionner. */
  async function diplomes(ctx, par, lignes, apres, seul){
    C = ctx; Finance.init(ctx);
    let gab = await lireGabarit(), url = gab ? URL.createObjectURL(gab.blob) : '', dim = gab ? await dimImage(url) : {w:297, h:210};
    let police = await enregistrerPolice(), urlPolice = police ? URL.createObjectURL(police) : '';
    const choisi = new Set(seul ? [seul] : lignes.filter(r => r.diplome === 'delivrer').map(r => r.id));
    let c = cfg(), exemple = (lignes.find(r => r.id === seul) || lignes[0] || {}).id || '', actif = 'nom';
    const v = C.modale('Attestations — ' + par.intitule, '<div id="dg-corps"></div>', '<button class="btn btn-contour" id="dg-f">Fermer</button>');
    v.querySelector('.modale').classList.add('large');
    const fin = () => { if(url) URL.revokeObjectURL(url); if(urlPolice) URL.revokeObjectURL(urlPolice); v.remove(); if(apres) apres(); };
    $('#dg-f', v).onclick = fin;
    const corps = $('#dg-corps', v);
    const sauver = () => { B.d.meta.diplome = {format:c.format, casse:c.casse, dateISO:c.dateISO, champs:c.champs}; B.sauver(); };
    const MODELE = {m:{nom:'KOUADIO', prenoms:'Jean Marc', civilite:'M.', sexe:'M', dioceseId:''}};
    const rendre = () => {
      const pg = pageMm(dim), noms = lignes.filter(r => choisi.has(r.id)), ex = lignes.find(r => r.id === exemple) || noms[0] || lignes[0], pers = ex ? ex.m : MODELE.m;
      const ch = c.champs.find(x => x.id === actif) || c.champs[0];
      corps.innerHTML = `<div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start">
        <div style="flex:1 1 400px;min-width:0">
          <div style="font-weight:700;margin-bottom:8px">1. Gabarit de l’attestation</div>
          <div class="outils" style="margin:0 0 10px"><input type="file" id="dg-g" accept="image/*,application/pdf" style="min-width:0"><span class="petit muet" style="flex:1 1 100%">${gab ? 'Gabarit en place : ' + esc(gab.nom || 'enregistré') + '. Choisissez un autre fichier pour le remplacer.' : 'Image (JPG, PNG) ou PDF d’une page, sans les parties qui changent (nom, civilité, date).'}</span></div>
          ${gab ? `<div id="dg-prev" style="position:relative;width:100%;border:1px solid var(--trait);border-radius:10px;overflow:hidden;line-height:0;touch-action:none;cursor:crosshair;user-select:none"><img src="${url}" alt="" draggable="false" style="width:100%;display:block;pointer-events:none"></div>
            <div class="petit muet" style="margin-top:6px">Touchez un texte pour le choisir, puis faites-le glisser (ou touchez l’endroit voulu) pour le placer.</div>` : '<div class="vide"><b>Aucun gabarit</b>Choisissez le fichier du gabarit pour commencer.</div>'}
          ${gab ? `<div class="grille-champs" style="margin-top:12px">
            <div class="large"><label>Texte à régler</label><select id="dg-ch">${c.champs.map(x => `<option value="${x.id}" ${x.id === ch.id ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></div>
            <div class="large"><label>Contenu <span class="muet" style="font-weight:400">— {civilite} {nom} {date} {diocese} sont remplacés pour chaque personne</span></label><textarea id="dg-tx" rows="${ch.id === 'lieu' ? 4 : 2}" style="width:100%">${esc(ch.texte)}</textarea></div>
            <div><label>Police</label><select id="dg-po">${POLICES.map(p => `<option ${p === ch.police ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
            <div><label>Taille (pt)</label><input type="number" id="dg-ta" min="6" max="120" step="0.5" value="${ch.taille}"></div>
            <div><label>Couleur</label><input type="color" id="dg-co" value="${ch.couleur}" style="height:38px;padding:2px"></div>
            <div><label>Alignement</label><select id="dg-al"><option value="center" ${ch.align === 'center' ? 'selected' : ''}>Centré sur le point</option><option value="left" ${ch.align === 'left' ? 'selected' : ''}>Commence au point</option><option value="right" ${ch.align === 'right' ? 'selected' : ''}>Finit au point</option></select></div>
            <div style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="dg-gr" ${ch.gras ? 'checked' : ''} style="width:auto"><label style="margin:0">Gras</label></div>
            <div><label>Police du nom (fichier .ttf)</label><input type="file" id="dg-pf" accept=".ttf,.otf,.woff,.woff2" style="min-width:0"></div>
            <div><label>Écriture du nom</label><select id="dg-fo"><option value="np" ${c.format === 'np' ? 'selected' : ''}>NOM Prénoms</option><option value="pn" ${c.format === 'pn' ? 'selected' : ''}>Prénoms NOM</option></select></div>
            <div><label>Prénoms</label><select id="dg-ca"><option value="titre" ${c.casse === 'titre' ? 'selected' : ''}>Première lettre en majuscule</option><option value="maj" ${c.casse === 'maj' ? 'selected' : ''}>Tout en MAJUSCULES</option></select></div>
            <div><label>Date de l’attestation</label><input type="date" id="dg-da" value="${esc(c.dateISO)}"></div>
            <div style="display:flex;align-items:end"><button class="btn btn-contour btn-s" id="dg-rz" type="button">Rétablir la mise en page d’origine</button></div></div>` : ''}</div>
        <div style="flex:1 1 300px;min-width:0"><div style="font-weight:700;margin-bottom:8px">2. Personnes concernées (${noms.length} sélectionnée${noms.length > 1 ? 's' : ''})</div>
          <div class="outils" style="margin:0 0 8px"><button class="btn btn-contour btn-s" id="dg-tout">Tout cocher</button><button class="btn btn-contour btn-s" id="dg-rien">Tout décocher</button></div>
          <div style="max-height:340px;overflow:auto;border:1px solid var(--trait);border-radius:10px">${lignes.length ? lignes.map(r => `<label class="dg-l" style="display:flex;gap:10px;align-items:center;padding:8px 10px;border-bottom:1px solid var(--trait);margin:0;cursor:pointer;${r.id === exemple ? 'background:#fff8d6' : ''}"><input type="checkbox" data-c="${r.id}" ${choisi.has(r.id) ? 'checked' : ''} style="width:auto"><span style="flex:1;min-width:0"><b>${esc(nomDiplome(r.m, c))}</b><br><span class="petit muet">${esc(Finance.dioDe(r.m))}${r.diplome === 'remis' ? ' · déjà remise' : ''}</span></span><button class="btn btn-contour btn-s" data-v="${r.id}" type="button">Aperçu</button></label>`).join('') : '<div class="vide"><b>Personne pour l’instant</b>Les attestations concernent les admis dont la cotisation est réglée.</div>'}</div>
          <div class="petit muet" style="margin-top:8px">Seuls les admis ayant versé leur cotisation figurent ici ; les attestations des autres restent retenues.</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px"><button class="btn btn-rouge" id="dg-p" ${gab && noms.length ? '' : 'disabled'}>Imprimer ${noms.length} attestation${noms.length > 1 ? 's' : ''}</button><button class="btn btn-contour" id="dg-r" ${noms.length ? '' : 'disabled'}>Marquer comme remises</button></div></div></div>`;
      const prev = $('#dg-prev', corps);
      const poser = () => {
        if(!prev) return; prev.querySelectorAll('.dg-n').forEach(n => n.remove());
        const W = prev.clientWidth, k = 0.3528 * (W / pg.w);
        c.champs.forEach(x => { const t = texteChamp(x, pers, c); if(!t) return; const n = document.createElement('div'); n.className = 'dg-n'; n.dataset.ch = x.id; n.textContent = t;
          n.style.cssText = 'position:absolute;cursor:move;padding:0 2px;' + styleChamp(x, taillePt(t, x, pg), 'px', k) + (x.id === actif ? 'outline:1.5px dashed #286FBE;background:rgba(40,111,190,.08);' : 'outline:1px dotted rgba(0,0,0,.18);'); prev.appendChild(n); });
      };
      poser(); const im = prev && prev.querySelector('img'); if(im) im.onload = poser; if(document.fonts && document.fonts.ready) document.fonts.ready.then(poser);
      $('#dg-g', corps).onchange = async e => { const f = e.target.files[0]; if(!f) return; let blob = f;
        try { if(f.type === 'application/pdf' || /\.pdf$/i.test(f.name)){ C.toast('Lecture du PDF…'); blob = await pdfEnImage(f); } else if(!/^image\//.test(f.type)){ return C.toast('Format non pris en charge : exportez le gabarit en PDF ou en image.', true); }
          await mettre({id:'gabarit-diplome', blob, nom:f.name, type:blob.type}); B.tracer('gabarit d’attestation', f.name + ' — ' + C.user.email); if(url) URL.revokeObjectURL(url); gab = {blob, nom:f.name}; url = URL.createObjectURL(blob); dim = await dimImage(url); C.toast('Gabarit enregistré.'); rendre();
        } catch(err){ C.toast(err.message || 'Gabarit illisible.', true); } };
      if(prev){
        let glisse = false, dx = 0, dy = 0;
        const pos = e => { const r = prev.getBoundingClientRect(); return {x:(e.clientX - r.left) / r.width * 100, y:(e.clientY - r.top) / r.height * 100}; };
        prev.onpointerdown = e => { const cible = e.target.closest && e.target.closest('[data-ch]'), p = pos(e); if(cible && cible.dataset.ch !== actif){ actif = cible.dataset.ch; const s = $('#dg-ch', corps); if(s) s.value = actif; }
          const a = c.champs.find(x => x.id === actif); if(cible){ dx = a.x - p.x; dy = a.y - p.y; } else { dx = 0; dy = 0; }
          glisse = true; try { prev.setPointerCapture(e.pointerId); } catch(_){} bouge(e); };
        const bouge = e => { const a = c.champs.find(x => x.id === actif), p = pos(e); a.x = Math.round(Math.min(100, Math.max(0, p.x + dx)) * 10) / 10; a.y = Math.round(Math.min(100, Math.max(0, p.y + dy)) * 10) / 10; poser(); };
        prev.onpointermove = e => { if(glisse) bouge(e); };
        prev.onpointerup = () => { if(glisse){ glisse = false; sauver(); rendre(); } };
        const maj = (k, val, rerendre) => { const a = c.champs.find(x => x.id === actif); a[k] = val; sauver(); rerendre ? rendre() : poser(); };
        $('#dg-ch', corps).onchange = e => { actif = e.target.value; rendre(); };
        $('#dg-tx', corps).oninput = e => maj('texte', e.target.value);
        $('#dg-po', corps).onchange = e => maj('police', e.target.value);
        $('#dg-ta', corps).oninput = e => maj('taille', Math.max(6, +e.target.value || ch.taille));
        $('#dg-co', corps).oninput = e => maj('couleur', e.target.value);
        $('#dg-al', corps).onchange = e => maj('align', e.target.value);
        $('#dg-gr', corps).onchange = e => maj('gras', e.target.checked);
        $('#dg-fo', corps).onchange = e => { c.format = e.target.value; sauver(); rendre(); };
        $('#dg-ca', corps).onchange = e => { c.casse = e.target.value; sauver(); rendre(); };
        $('#dg-da', corps).onchange = e => { c.dateISO = e.target.value || aujourdhui(); sauver(); poser(); };
        $('#dg-rz', corps).onclick = () => { c.champs = CHAMPS0.map(x => Object.assign({}, x)); sauver(); rendre(); };
        $('#dg-pf', corps).onchange = async e => { const f = e.target.files[0]; if(!f) return;
          try { await mettre({id:'police-diplome', blob:f, nom:f.name}); police = await enregistrerPolice(); if(urlPolice) URL.revokeObjectURL(urlPolice); urlPolice = police ? URL.createObjectURL(police) : ''; C.toast('Police enregistrée (famille « Cooper Black »).'); rendre(); } catch(_){ C.toast('Police illisible.', true); } };
      }
      corps.querySelectorAll('[data-c]').forEach(k => k.onchange = () => { k.checked ? choisi.add(k.dataset.c) : choisi.delete(k.dataset.c); rendre(); });
      corps.querySelectorAll('[data-v]').forEach(b => b.onclick = e => { e.preventDefault(); exemple = b.dataset.v; rendre(); });
      $('#dg-tout', corps).onclick = () => { lignes.forEach(r => choisi.add(r.id)); rendre(); };
      $('#dg-rien', corps).onclick = () => { choisi.clear(); rendre(); };
      $('#dg-p', corps).onclick = () => { if(!gab || !noms.length) return; imprimerDiplomes(url, dim, c, noms.map(r => r.m), urlPolice); B.tracer('impression attestations', noms.length + ' — ' + par.intitule + ' — ' + C.user.email); B.sauver(); };
      $('#dg-r', corps).onclick = () => { let n = 0; noms.forEach(r => { if(r.diplome !== 'remis' && !B.d.diplomes.some(d => d.activiteId === par.id && d.membreId === r.id)){ B.d.diplomes.push({id:B.uid('dip'), activiteId:par.id, membreId:r.id, remisLe:new Date().toISOString(), par:C.user.email}); r.diplome = 'remis'; n++; } });
        B.tracer('attestations remises', n + ' — ' + par.intitule + ' — ' + C.user.email); B.sauver(); C.toast(n + ' attestation(s) marquée(s) comme remise(s).'); rendre(); };
    };
    rendre();
  }
  window.Archives = {vue, diplomes, nomDiplome};
})();
