/* registre.js — REGISTRE NATIONAL des membres.
   Principe : une personne = UNE fiche (table « membres »). Toute liste (présence, inscription, rassemblement,
   rencontre de ministère…) ne fait que RATTACHER des participations (table « participations ») à cette fiche :
   la liste est propre à l'activité, le registre est national et s'enrichit liste après liste.

   Ce module contient : la fusion de deux fiches (avec annulation), la détection des doublons (qui sait que
   « DUPONT Épse MARTIN Marie » et « MARTIN Marie » peuvent être la même personne), l'importation
   d'une liste de participants (existant → rattaché, inconnu → nouvelle fiche, incertain → validation manuelle)
   et le contrôle de cohérence de la base. Rien n'est jamais supprimé ni fusionné sur simple ressemblance de noms. */
(function(){
  'use strict';
  const B = Base, norm = Identite.norm, jet = Identite.jetons;
  const cle = s => jet(s).sort().join(' ');
  const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dioDe = n => B.d.dioceses.find(x => norm(x.nom) === norm(n)) || null;
  const secDe = (dioId, n) => n ? (B.d.secteurs.find(x => x.dioceseId === dioId && norm(x.nom) === norm(n)) || null) : null;
  function parDe(dioId, n){
    if(!n || !dioId) return null;
    let p = B.d.paroisses.find(x => x.dioceseId === dioId && norm(x.nom) === norm(n));
    if(!p){ p = {id:B.uid('par'), nom:n.trim(), dioceseId:dioId}; B.d.paroisses.push(p); }
    return p;
  }
  const nomAff = m => (m.civilite ? m.civilite+' ' : '') + m.nom + ' ' + m.prenoms + (m.epouseDe ? ' Épse '+m.epouseDe : '');

  /* ================================================================ fusion (noyau) */
  /** Fusionne la fiche r DANS la fiche g (g garde son identité). Reporte photo, inscriptions, responsabilités, présences.
      Enregistre de quoi annuler (meta.fusions). Retourne l'enregistrement. */
  function fusionner(g, r){
    const d = B.d, S = B.par('membres', g), R = B.par('membres', r); if(!S || !R || g === r) return null;
    const rec = {id:B.uid('fus'), date:new Date().toISOString(), gardeId:g, retire:JSON.parse(JSON.stringify(R)), sourcesAvant:(S.sources||[]).slice(), champs:{}, parts:[], partsSupp:[], affs:[], affsSupp:[], pres:[], presSupp:[], photo:''};
    ['tel','whatsapp','email','profession','paroisseId','dioceseId','secteurId','civilite','dateNaissance','sexe','ministereId','posteId'].forEach(c => { if(!S[c] && R[c]){ S[c] = R[c]; rec.champs[c] = R[c]; } });
    // deux numéros différents : celui de la fiche retirée est gardé dans la case WhatsApp si elle est vide
    const chiffres = s => String(s || '').replace(/\D/g, '');
    if(!S.whatsapp && R.tel && S.tel && chiffres(S.tel) !== chiffres(R.tel)){ S.whatsapp = R.tel; rec.champs.whatsapp = R.tel; }
    // nom d'épouse / nom de naissance : on ne perd aucune des deux identités
    if(!S.epouseDe && R.epouseDe && norm(R.epouseDe) !== norm(S.nom)){ S.epouseDe = R.epouseDe; rec.champs.epouseDe = R.epouseDe; }
    if(!S.nomEtatCivil && R.nomEtatCivil){ S.nomEtatCivil = R.nomEtatCivil; rec.champs.nomEtatCivil = R.nomEtatCivil; }
    S.sources = [...new Set([...(S.sources||[]), ...(R.sources||[]), 'Fusion de doublon'])];
    d.participations = d.participations.filter(p => { if(p.membreId !== r) return true; if(d.participations.some(x => x.activiteId === p.activiteId && x.membreId === g)){ rec.partsSupp.push(p); return false; } p.membreId = g; rec.parts.push(p.id); return true; });
    d.affectations = d.affectations.filter(x => { if(x.membreId !== r) return true; if(d.affectations.some(y => y !== x && y.membreId === g && y.organeId === x.organeId && y.dioceseId === x.dioceseId)){ rec.affsSupp.push(x); return false; } x.membreId = g; rec.affs.push(x.id); return true; });
    d.presences = d.presences.filter(x => { if(x.membreId !== r) return true; if(d.presences.some(y => y !== x && y.membreId === g && y.activiteId === x.activiteId)){ rec.presSupp.push(x); return false; } x.membreId = g; rec.pres.push(x.id); return true; });
    if(!Photos.url(S) && Photos.url(R)){ if(R.photoFichier){ S.photoFichier = R.photoFichier; rec.photo = 'fichier'; } else { Photos.deplacer(r, g); rec.photo = 'idb'; } }
    d.membres = d.membres.filter(m => m.id !== r);
    d.meta.doublonsProbables = (d.meta.doublonsProbables||[]).filter(p => p[0] !== r && p[1] !== r);
    d.meta.distincts = (d.meta.distincts||[]).filter(p => p[0] !== r && p[1] !== r);
    (d.meta.fusions = d.meta.fusions || []).push(rec);
    B.tracer('fusion de doublon', R.nom+' '+R.prenoms+' → '+S.nom+' '+S.prenoms); B.sauver();
    return rec;
  }
  /** Retrouve une fiche par « NOM Prénoms » (nom de naissance ou d'épouse). */
  const parNoms = t => B.d.membres.find(m => cle(m.nom+' '+m.prenoms) === cle(t)) || null;
  function fusionnerParNoms(nomGarde, nomRetire){
    const G = parNoms(nomGarde), R = parNoms(nomRetire);
    if(G && R && G.id !== R.id) return fusionner(G.id, R.id);
    return null;
  }

  /* ================================================================ doublons */
  /** Ressemblance symétrique de deux fiches (0-100), ordre des noms sans importance, nom de naissance/nom d'épouse pris en compte. */
  function similitude(a, b){
    // tous les mots du nom (naissance, prénoms, épouse) de l'un doivent se retrouver chez l'autre : « KOUAKOU Yao Henriette »
    // et « KOUAKOU Yao Justin » partagent deux mots mais ne sont PAS la même personne.
    const ta = [...new Set(jet(a.nom+' '+a.prenoms+' '+(a.epouseDe||'')).filter(t => t.length > 1))], tb = [...new Set(jet(b.nom+' '+b.prenoms+' '+(b.epouseDe||'')).filter(t => t.length > 1))];
    if(!ta.length || !tb.length) return 0;
    const dans = (t, L) => L.some(x => t === x || (t.length >= 5 && x.length >= 5 && Identite.mot(t, x) > 0));   // mots courts : exacts (AHOU ≠ AKOU)
    const interA = ta.filter(t => dans(t, tb)).length, interB = tb.filter(t => dans(t, ta)).length, inter = Math.min(interA, interB);
    const petit = ta.length <= tb.length ? ta : tb, grand = petit === ta ? tb : ta;
    if(petit.length >= 2 && petit.every(t => dans(t, grand))) return 96;            // un nom est contenu dans l'autre
    const jac = inter / (ta.length + tb.length - inter);
    return jac >= .6 ? Math.round(Math.min(95, 100 * jac + 20)) : 0;
  }
  const memeTel = (a, b) => a.tel && b.tel && a.tel.replace(/\D/g, '') === b.tel.replace(/\D/g, '');
  /** Paires de fiches qui pourraient être la même personne. niveau « certain » : noms compatibles ET même téléphone (ou même
      paroisse) ET même diocèse, sans date de naissance contradictoire. Tout le reste est « probable » : validation manuelle. */
  function doublons(){
    const d = B.d, idx = new Map(), vus = new Set(), res = [];
    const distincts = new Set((d.meta.distincts||[]).map(p => p.slice().sort().join('|')));
    d.membres.forEach(m => new Set(jet(m.nom+' '+m.prenoms+' '+(m.epouseDe||'')).filter(t => t.length >= 4)).forEach(t => { if(!idx.has(t)) idx.set(t, []); idx.get(t).push(m); }));
    idx.forEach(liste => { if(liste.length > 60) return;
      for(let i = 0; i < liste.length; i++) for(let j = i + 1; j < liste.length; j++){
        const a = liste[i], b = liste[j], k = [a.id, b.id].sort().join('|'); if(vus.has(k)) continue; vus.add(k);
        if(distincts.has(k)) continue;
        if(a.dateNaissance && b.dateNaissance && a.dateNaissance !== b.dateNaissance) continue;
        const s = similitude(a, b); if(s < 80) continue;
        const memeDio = a.dioceseId && b.dioceseId && a.dioceseId === b.dioceseId, memePar = a.paroisseId && b.paroisseId && a.paroisseId === b.paroisseId;
        const certain = s >= 90 && (memeTel(a, b) || memePar) && (!a.dioceseId || !b.dioceseId || memeDio);
        res.push({a, b, score:Math.round(s), niveau:certain ? 'certain' : 'probable', raison: memeTel(a, b) ? 'même téléphone' : memePar ? 'même paroisse' : memeDio ? 'même diocèse' : 'noms compatibles'});
      } });
    return res.sort((x, y) => (y.niveau === 'certain') - (x.niveau === 'certain') || y.score - x.score);
  }
  /** Fiche à conserver : celle qui porte l'état civil (nom de naissance + « Épse »), sinon la plus complète. */
  const aGarder = (a, b) => { const sc = m => (m.epouseDe ? 4 : 0) + jet(m.nom+' '+m.prenoms).length * .1 + (Photos.url(m) ? .5 : 0) + (m.tel ? .2 : 0); return sc(b) > sc(a) ? b : a; };
  /** Fusionne les paires CERTAINES (jamais les probables). Retourne le nombre de fusions. */
  function fusionnerCertains(){
    let n = 0;
    for(let tour = 0; tour < 50; tour++){
      const p = doublons().find(x => x.niveau === 'certain'); if(!p) break;
      const g = aGarder(p.a, p.b), r = g === p.a ? p.b : p.a; fusionner(g.id, r.id); n++;
      B.tracer('fusion certaine', nomAff(r)+' → '+nomAff(g)+' ('+p.raison+')');
    }
    return n;
  }
  /** Marque deux fiches comme DEUX personnes distinctes (elles ne seront plus proposées). */
  function distinctes(a, b){ (B.d.meta.distincts = B.d.meta.distincts || []).push([a, b]); B.sauver(); }

  /* ================================================================ lecture d'une liste */
  const COL = {
    nomComplet: /^(nom et prenoms?|nom complet|noms? et prenoms?|identite|nom prenoms?|nom & prenoms?|nom et prenom\(s\).*)$/,
    nom: /^(nom|noms|nom de famille)$/, prenoms: /^(prenoms?|prenom\(s\))$/, civ: /^(civ|civilite)/,
    diocese: /^diocese/, paroisse: /^paroisse/, secteur: /^secteur/, tel: /(tel|telephone|contact|whatsapp|portable|mobile)/, fonction: /^(fonction|profession|metier)/, num: /^(n|no|num|numero)$/
  };
  function lire(texte){
    const lignes = (texte||'').replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean); if(!lignes.length) return {rows:[], entete:false};
    const sep = ['\t', ';', ','].find(s => lignes.slice(0, 6).every(l => l.split(s).length > 1));
    const cases = l => sep ? l.split(sep).map(x => x.trim().replace(/^"(.*)"$/, '$1')) : [l];
    const h = cases(lignes[0]).map(x => norm(x)), idx = {};
    Object.keys(COL).forEach(k => { const i = h.findIndex(x => COL[k].test(x)); if(i >= 0) idx[k] = i; });
    const entete = !!(idx.nomComplet != null || idx.nom != null || idx.prenoms != null);
    const corps = entete ? lignes.slice(1) : lignes, rows = [];
    corps.forEach(l => {
      let c = cases(l); if(!entete && c.length > 1 && /^\d+$/.test(c[0])) c = c.slice(1);        // colonne « N° » sans titre
      const get = k => entete ? (idx[k] != null ? (c[idx[k]]||'').trim() : '') : '';
      let nc = entete ? (get('nomComplet') || [get('nom'), get('prenoms')].filter(Boolean).join(' ')) : c[0];
      nc = (nc||'').replace(/\s+/g, ' ').trim(); if(!nc || /^\d+$/.test(nc)) return;
      rows.push({nomComplet:nc, civ:get('civ'), diocese:get('diocese'), paroisse:get('paroisse'), secteur:get('secteur'), tel:get('tel'), fonction:get('fonction')});
    });
    return {rows, entete};
  }
  let xlsxPromesse = null;
  function chargerXlsx(){
    if(window.XLSX) return Promise.resolve();
    return xlsxPromesse || (xlsxPromesse = new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'; s.onload = ok; s.onerror = () => { xlsxPromesse = null; ko(new Error('Connexion Internet requise pour lire un classeur Excel : copiez plutôt les cellules dans la zone de texte.')); }; document.head.appendChild(s); }));
  }
  async function texteDuFichier(f){
    if(/\.xlsx?$/i.test(f.name)){ await chargerXlsx(); const wb = XLSX.read(await f.arrayBuffer(), {type:'array'}); return XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], {FS:'\t'}); }
    return await f.text();
  }

  /* ================================================================ rapprochement avec le registre */
  /** Pour chaque ligne : existant CERTAIN (rattaché), PROBABLE (à valider par l'agent), ou NOUVEAU. */
  function rapprocher(rows){
    const d = B.d, vus = new Map(), fiches = new Map();
    const liste = rows.map(row => {
      const dec = Intercession.decouper(row.nomComplet), q = jet(row.nomComplet), k = cle(row.nomComplet);
      const dio = row.diocese ? dioDe(row.diocese) : null;
      if(vus.has(k)) return {row, dec, etat:'doublon-liste', cands:[], choix:{type:'ignorer'}};
      vus.set(k, 1);
      const cands = d.membres.map(m => {
        let s = Identite.scoreMembre(q, m);
        if(row.tel && m.tel && memeTel({tel:row.tel}, m)) s += 8;
        if(dio && m.dioceseId && m.dioceseId !== dio.id) s -= 8; else if(dio && m.dioceseId === dio.id) s += 2;
        return {m, score:Math.round(Math.min(100, s))};
      }).filter(c => c.score >= 72).sort((x, y) => y.score - x.score).slice(0, 5);
      const ecart = cands.length > 1 ? cands[0].score - cands[1].score : 100;
      if(cands.length && cands[0].score >= 92 && ecart >= 10) return {row, dec, etat:'certain', cands, choix:{type:'rattacher', id:cands[0].m.id}};
      if(cands.length) return {row, dec, etat:'probable', cands, choix:null};
      return {row, dec, etat:'nouveau', cands:[], choix:{type:'creer'}};
    });
    // deux lignes qui désignent la MÊME fiche (« Angèle MARTIN » et « DUPONT Angèle ») : la seconde est écartée
    liste.forEach(it => { if(it.etat === 'certain'){ const id = it.choix.id; if(fiches.has(id)){ it.etat = 'doublon-liste'; it.choix = {type:'ignorer'}; } else fiches.set(id, 1); } });
    return liste;
  }
  function creerFiche(item, act){
    const d = B.d, r = item.row, dc = item.dec, dio = r.diocese ? dioDe(r.diocese) : null, par = dio && r.paroisse ? parDe(dio.id, r.paroisse) : null;
    let sec = dio && r.secteur ? secDe(dio.id, r.secteur) : null; if(!sec && par && par.secteurId) sec = B.par('secteurs', par.secteurId);
    const min = act && act.ministere === 'intercession' ? d.ministeres.find(x => norm(x.nom) === 'intercession') : null;
    const m = {id:B.uid('mem'), matricule:B.matricule(), nom:(dc.nom||r.nomComplet).toUpperCase(), prenoms:dc.prenoms||'', nomEtatCivil:r.nomComplet, civilite:r.civ || dc.civ || '', epouseDe:(dc.epouseDe||'').toUpperCase(),
      sexe:'', dateNaissance:'', tel:r.tel||'', whatsapp:'', email:'', dioceseId:dio?dio.id:'', secteurId:sec?sec.id:'', paroisseId:par?par.id:'', ministereId:min?min.id:'', posteId:'', profession:r.fonction||'',
      pieces:[], sources:['Liste importée — '+(act?act.intitule:'')], creeLe:new Date().toISOString()};
    d.membres.push(m); return m;
  }
  function enrichir(m, r){
    const dio = r.diocese ? dioDe(r.diocese) : null;
    if(!m.tel && r.tel) m.tel = r.tel; if(!m.profession && r.fonction) m.profession = r.fonction;
    if(!m.dioceseId && dio) m.dioceseId = dio.id;
    if(dio && !m.paroisseId && r.paroisse){ const p = parDe(dio.id, r.paroisse); if(p){ m.paroisseId = p.id; if(!m.secteurId && p.secteurId) m.secteurId = p.secteurId; } }
    if(dio && !m.secteurId && r.secteur){ const s = secDe(dio.id, r.secteur); if(s) m.secteurId = s.id; }
  }
  /** Applique les décisions : rattache à la fiche existante OU crée une fiche, puis enregistre la participation. */
  function appliquer(items, activiteId){
    const d = B.d, act = B.par('activites', activiteId); let rat = 0, cre = 0, ign = 0, deja = 0;
    items.forEach(it => {
      const c = it.choix; if(!c || c.type === 'ignorer'){ ign++; return; }
      let m = c.type === 'rattacher' ? B.par('membres', c.id) : creerFiche(it, act); if(!m){ ign++; return; }
      c.type === 'rattacher' ? (rat++, enrichir(m, it.row)) : cre++;
      if(d.participations.some(p => p.activiteId === activiteId && p.membreId === m.id)) deja++;
      else d.participations.push({id:B.uid('prt'), activiteId, membreId:m.id, statut:'liste de présence', modules:{}});
      if(!(m.sources||[]).some(s => s.includes(act.intitule))) (m.sources = m.sources || []).push('Liste — '+act.intitule);
    });
    B.tracer('import de liste', (act?act.intitule:'')+' : '+rat+' rattachés, '+cre+' nouvelles fiches, '+ign+' ignorés'); B.sauver();
    return {rat, cre, ign, deja};
  }

  /* ================================================================ assistant d'importation */
  function importer(X, activiteId){
    const {$, modale, toast, redraw} = X, act = B.par('activites', activiteId); if(!act) return;
    const v = modale('Importer une liste — '+act.intitule, `<p class="petit" style="margin-top:0">Collez la liste (depuis Excel ou Word) ou choisissez un fichier. Un nom par ligne, ou un tableau avec des colonnes <b>Nom et prénoms</b>, Diocèse, Paroisse, Secteur, Téléphone, Fonction. Chaque personne est <b>comparée au registre national</b> : si elle existe, sa participation est rattachée à sa fiche ; sinon une fiche est créée ; si l’identité est incertaine, <b>vous décidez</b>.</p>
      <textarea id="im-txt" style="min-height:130px" placeholder="Collez ici…"></textarea>
      <div class="outils" style="margin-top:10px"><input type="file" id="im-fich" accept=".csv,.tsv,.txt,.xlsx,.xls" style="flex:1"><button class="btn btn-marine btn-s" id="im-an" type="button">Analyser la liste</button></div><div id="im-res"></div>`,
      '<button class="btn btn-contour" id="im-ann" type="button">Fermer</button><button class="btn btn-rouge" id="im-ok" type="button" disabled>Importer</button>');
    v.querySelector('.modale').classList.add('large');
    let items = [];
    const maj = () => {
      const n = (e) => items.filter(i => i.etat === e).length, aValider = items.filter(i => i.etat === 'probable' && !i.choix).length;
      const res = $('#im-res', v);
      res.innerHTML = items.length ? `<div class="chaine-resume"><span class="pastille p-ok">${n('certain')} déjà au registre</span> <span class="pastille p-info">${n('nouveau')} nouvelles fiches</span> <span class="pastille ${aValider?'p-ko':'p-warn'}">${n('probable')} à valider</span> <span class="pastille p-neutre">${n('doublon-liste')} doublon(s) dans la liste</span></div>
        <div style="max-height:340px;overflow:auto;margin-top:10px"><table class="tableau"><thead><tr><th>Nom lu</th><th>Diocèse · paroisse</th><th>Résultat</th></tr></thead><tbody>${items.map((it, i) => `<tr><td><b>${esc(it.row.nomComplet)}</b></td><td class="petit">${esc([it.row.diocese, it.row.paroisse].filter(Boolean).join(' · ')||'—')}</td><td>${
          it.etat === 'certain' ? `<span class="pastille p-ok">Rattaché à</span> ${esc(nomAff(it.cands[0].m))} <span class="petit muet">(${it.cands[0].score} %)</span>`
          : it.etat === 'nouveau' ? '<span class="pastille p-info">Nouvelle fiche</span>'
          : it.etat === 'doublon-liste' ? '<span class="pastille p-neutre">Déjà dans la liste</span>'
          : `<select data-i="${i}" style="padding:6px 8px"><option value="">— à valider —</option>${it.cands.map(c => `<option value="r:${c.m.id}" ${it.choix && it.choix.id === c.m.id ? 'selected' : ''}>C’est ${esc(nomAff(c.m))} (${c.score} %)</option>`).join('')}<option value="c" ${it.choix && it.choix.type === 'creer' ? 'selected' : ''}>Personne différente : créer une fiche</option><option value="x" ${it.choix && it.choix.type === 'ignorer' ? 'selected' : ''}>Ignorer cette ligne</option></select>`}</td></tr>`).join('')}</tbody></table></div>` : '';
      res.querySelectorAll('select[data-i]').forEach(s => s.onchange = () => { const it = items[+s.dataset.i], x = s.value; it.choix = !x ? null : x === 'c' ? {type:'creer'} : x === 'x' ? {type:'ignorer'} : {type:'rattacher', id:x.slice(2)}; maj(); });
      $('#im-ok', v).disabled = !items.length || aValider > 0;
      $('#im-ok', v).textContent = aValider ? aValider+' à valider avant d’importer' : 'Importer ('+items.filter(i => i.choix && i.choix.type !== 'ignorer').length+' participants)';
    };
    $('#im-an', v).onclick = async () => {
      let t = $('#im-txt', v).value; const f = $('#im-fich', v).files[0];
      try { if(f) t = await texteDuFichier(f); } catch(e){ return toast(e.message, true); }
      const {rows} = lire(t); if(!rows.length) return toast('Aucun nom lisible dans cette liste.', true);
      items = rapprocher(rows); maj();
    };
    $('#im-ann', v).onclick = () => v.remove();
    $('#im-ok', v).onclick = () => { const r = appliquer(items, activiteId); v.remove(); toast(r.rat+' rattaché(s), '+r.cre+' fiche(s) créée(s)'+(r.deja?', '+r.deja+' déjà inscrit(s)':'')+'.'); redraw(); };
  }

  /* ================================================================ cohérence de la base */
  function coherence(){
    const d = B.d, p = [], ids = (coll) => new Set(d[coll].map(x => x.id));
    const dio = ids('dioceses'), sec = ids('secteurs'), par = ids('paroisses'), mem = ids('membres'), act = ids('activites'), org = ids('organes'), min = ids('ministeres'), pos = ids('postes');
    const ajoute = (niveau, txt, n) => { if(n) p.push({niveau, txt, n}); };
    ajoute('erreur', 'Membres rattachés à un diocèse qui n’existe plus', d.membres.filter(m => m.dioceseId && !dio.has(m.dioceseId)).length);
    ajoute('erreur', 'Membres rattachés à une paroisse qui n’existe plus', d.membres.filter(m => m.paroisseId && !par.has(m.paroisseId)).length);
    ajoute('erreur', 'Membres rattachés à un secteur qui n’existe plus', d.membres.filter(m => m.secteurId && !sec.has(m.secteurId)).length);
    ajoute('erreur', 'Membres avec un ministère ou un poste inconnu', d.membres.filter(m => (m.ministereId && !min.has(m.ministereId)) || (m.posteId && !pos.has(m.posteId))).length);
    ajoute('erreur', 'Paroisses d’un diocèse inconnu', d.paroisses.filter(x => !dio.has(x.dioceseId)).length);
    ajoute('erreur', 'Secteurs d’un diocèse inconnu', d.secteurs.filter(x => !dio.has(x.dioceseId)).length);
    ajoute('erreur', 'Paroisses rattachées à un secteur d’un AUTRE diocèse', d.paroisses.filter(x => x.secteurId && sec.has(x.secteurId) && B.par('secteurs', x.secteurId).dioceseId !== x.dioceseId).length);
    ajoute('erreur', 'Membres dont le secteur ne correspond pas à celui de leur paroisse', d.membres.filter(m => { const pa = m.paroisseId && B.par('paroisses', m.paroisseId); return pa && pa.secteurId && m.secteurId && pa.secteurId !== m.secteurId; }).length);
    ajoute('erreur', 'Participations vers une activité ou une fiche inexistante', d.participations.filter(x => !act.has(x.activiteId) || !mem.has(x.membreId)).length);
    ajoute('erreur', 'Présences vers une activité ou une fiche inexistante', d.presences.filter(x => !act.has(x.activiteId) || !mem.has(x.membreId)).length);
    ajoute('erreur', 'Responsabilités vers une instance ou une fiche inexistante', d.affectations.filter(x => !org.has(x.organeId) || !mem.has(x.membreId)).length);
    const mat = new Map(); d.membres.forEach(m => mat.set(m.matricule, (mat.get(m.matricule)||0) + 1));
    ajoute('erreur', 'Matricules en double', [...mat.values()].filter(n => n > 1).length);
    const part = new Set(), dup = d.participations.filter(x => { const k = x.activiteId+'|'+x.membreId; if(part.has(k)) return true; part.add(k); return false; }).length;
    ajoute('erreur', 'Participations en double (même personne, même activité)', dup);
    ajoute('info', 'Paroisses d’Abidjan sans secteur', (() => { const ab = dioDe('Abidjan'); return ab ? d.paroisses.filter(x => x.dioceseId === ab.id && !x.secteurId).length : 0; })());
    ajoute('info', 'Membres sans diocèse', d.membres.filter(m => !m.dioceseId).length);
    ajoute('info', 'Membres sans paroisse', d.membres.filter(m => !m.paroisseId).length);
    ajoute('info', 'Doublons certains à fusionner', doublons().filter(x => x.niveau === 'certain').length);
    ajoute('info', 'Doublons probables à vérifier', doublons().filter(x => x.niveau === 'probable').length);
    return {problemes:p, totaux:{membres:d.membres.length, dioceses:d.dioceses.length, secteurs:d.secteurs.length, paroisses:d.paroisses.length, activites:d.activites.length, participations:d.participations.length, presences:d.presences.length}};
  }
  function afficherCoherence(X){
    const {modale} = X, r = coherence(), err = r.problemes.filter(p => p.niveau === 'erreur'), inf = r.problemes.filter(p => p.niveau === 'info');
    const v = modale('Contrôle de cohérence de la base', `<div class="chaine-resume">${Object.entries(r.totaux).map(([k, n]) => `<span class="pastille p-neutre">${n} ${k}</span>`).join(' ')}</div>
      <div class="groupe">Anomalies</div>${err.length ? err.map(p => `<div class="ligne-fiche"><span>${esc(p.txt)}</span><span class="v" style="color:var(--rouge-2)">${p.n}</span></div>`).join('') : '<div class="alerte-boite ok" style="margin:6px 0 0;padding:12px">Aucune anomalie : toutes les relations sont cohérentes.</div>'}
      <div class="groupe">À compléter ou vérifier</div>${inf.length ? inf.map(p => `<div class="ligne-fiche"><span>${esc(p.txt)}</span><span class="v">${p.n}</span></div>`).join('') : '<div class="muet petit">Rien.</div>'}`,
      '<button class="btn btn-contour" id="co-ok" type="button">Fermer</button>');
    v.querySelector('#co-ok').onclick = () => v.remove();
  }

  window.Registre = {fusionner, fusionnerParNoms, doublons, similitude, fusionnerCertains, distinctes, aGarder, lire, rapprocher, appliquer, importer, coherence, afficherCoherence, cle};
})();
