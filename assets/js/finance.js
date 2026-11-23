/* finance.js — INSCRIPTIONS (cotisations par activité) et FORMATION PUBLIQUE (suivi des modules, admission, diplômes).
   Collections : cotisations (jamais supprimées : on les ANNULE avec un motif), archives (instantanés figés), diplomes.
   Règles de la Formation biblique : qui commence le module 1 doit faire tous les modules ; un module manqué = recalé ;
   le diplôme n'est délivré qu'aux admis qui ont versé leur cotisation. */
(function(){
  'use strict';
  const B = Base;
  const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $ = (s, r) => (r||document).querySelector(s);
  const MODES = ['Espèces','Wave','Orange Money','MTN Money','Chèque','Autre'];
  const fcfa = n => Math.round(n||0).toLocaleString('fr-FR').replace(/[  ]/g,' ') + ' F CFA';
  const dh = iso => iso ? new Date(iso).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
  const dj = iso => iso ? new Date(iso).toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'}) : '';
  const recu = n => 'R-' + String(n||0).padStart(5,'0');
  const dioDe = m => (m && B.nom('dioceses', m.dioceseId)) || 'Non renseigné';
  const parDe = m => (m && B.nom('paroisses', m.paroisseId)) || '';
  let C = null;                       // contexte fourni par app.js
  const S = {act:'', onglet:'liste', q:'', dio:'', sel:null, rech:'', par:'', filtreF:'tous', ongF:'suivi'};

  const archivee = a => a && a.statut === 'archivée';
  const total = l => l.reduce((s, c) => s + (+c.montant||0), 0);
  function nomM(m){ return m ? C.nomAffiche(m) : '(fiche supprimée)'; }

  /* ================================================================ calculs INSCRIPTIONS */
  function calcul(a){
    const unit = +a.contribMontant || 0;
    const tous = B.d.cotisations.filter(c => c.activiteId === a.id).sort((x, y) => (x.date||'').localeCompare(y.date||''));
    const ok = tous.filter(c => !c.annulee), map = new Map();
    ok.forEach(c => {
      let e = map.get(c.membreId);
      if(!e){ e = {id:c.membreId, m:B.par('membres', c.membreId), avant:0, pendant:0, total:0, nb:0, dern:''}; map.set(c.membreId, e); }
      e[c.moment === 'pendant' ? 'pendant' : 'avant'] += +c.montant||0; e.total += +c.montant||0; e.nb++; if((c.date||'') > e.dern) e.dern = c.date;
    });
    const lignes = [...map.values()].sort((x, y) => nomM(x.m).localeCompare(nomM(y.m), 'fr'));
    lignes.forEach(e => { e.solde = unit ? e.total >= unit : true; e.reste = unit ? Math.max(0, unit - e.total) : 0; });
    const dio = new Map();
    lignes.forEach(e => { const k = dioDe(e.m); let g = dio.get(k); if(!g){ g = {nom:k, nb:0, soldes:0, montant:0}; dio.set(k, g); } g.nb++; if(e.solde) g.soldes++; g.montant += e.total; });
    return {unit, tous, ok, lignes, parDio:[...dio.values()].sort((x, y) => y.nb - x.nb || x.nom.localeCompare(y.nom, 'fr')),
      total:total(ok), avant:total(ok.filter(c => c.moment !== 'pendant')), pendant:total(ok.filter(c => c.moment === 'pendant')),
      soldes:lignes.filter(e => e.solde).length, annules:tous.length - ok.length};
  }
  const statutPaie = (e, unit) => unit ? (e.solde ? 'Soldé' : 'Partiel (reste ' + fcfa(e.reste) + ')') : 'Versé';

  /* ================================================================ instantanés, impression */
  function tableHtml(t){
    return '<h3 style="margin:16px 0 6px;font-size:13px;color:#0B2150">' + esc(t.titre) + '</h3><table><thead><tr>' + t.entetes.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' +
      t.lignes.map(l => '<tr' + (l[0] === 'TOTAL' ? ' class="tot"' : '') + '>' + l.map(c => '<td>' + esc(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
  }
  function corps(s){
    return '<style>.tot td{font-weight:bold;background:#e8ecf5!important}.res{display:flex;flex-wrap:wrap;gap:6px 24px;margin:0 0 6px}.res div{min-width:200px}.res b{display:block;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:.05em}</style>' +
      '<div class="res">' + s.resume.map(r => '<div><b>' + esc(r[0]) + '</b>' + esc(r[1]) + '</div>').join('') + '</div>' + s.tableaux.map(tableHtml).join('');
  }
  const imprimerSnap = s => C.exporter.imprimer(s.titre, s.sous || '', [], [], corps(s));
  function voirSnap(s){
    const v = C.modale(s.titre, '<div class="defile" style="max-height:62vh;overflow:auto">' + corps(s).replace(/<style>[\s\S]*?<\/style>/, '') + '</div>',
      '<button class="btn btn-contour" id="sv-f">Fermer</button><button class="btn btn-contour" id="sv-c">Exporter (Excel)</button><button class="btn btn-rouge" id="sv-p">Imprimer</button>');
    v.querySelector('.modale').classList.add('large');
    $('#sv-f', v).onclick = () => v.remove(); $('#sv-p', v).onclick = () => imprimerSnap(s);
    $('#sv-c', v).onclick = () => csvSnap(s);
  }
  function csvSnap(s){
    const t = s.tableaux[s.tableaux.length > 1 ? 1 : 0]; C.exporter.csv(s.titre, t.entetes, t.lignes);
  }

  function snapInscr(a, c){
    const lignes = c.lignes.map((e, i) => [i + 1, nomM(e.m), dioDe(e.m), parDe(e.m), (e.m && e.m.tel) || '', e.avant ? fcfa(e.avant) : '', e.pendant ? fcfa(e.pendant) : '', fcfa(e.total), statutPaie(e, c.unit)]);
    lignes.push(['TOTAL', c.lignes.length + ' participant(s)', '', '', '', fcfa(c.avant), fcfa(c.pendant), fcfa(c.total), c.unit ? c.soldes + ' soldé(s)' : '']);
    const dio = c.parDio.map(g => [g.nom, g.nb, c.unit ? g.soldes : '', fcfa(g.montant)]);
    dio.push(['TOTAL', c.lignes.length, c.unit ? c.soldes : '', fcfa(c.total)]);
    const vers = c.tous.map(x => { const m = B.par('membres', x.membreId); return [recu(x.numero), dh(x.date), nomM(m), dioDe(m), fcfa(x.montant), x.moment === 'pendant' ? 'Pendant l’activité' : 'Avant l’activité', x.mode || '', x.agentNom || '', x.annulee ? 'ANNULÉ — ' + (x.motif || '') : 'Valide']; });
    return {kind:'inscriptions', activiteId:a.id, titre:'Inscriptions et cotisations — ' + a.intitule, sous:(a.date ? dj(a.date + 'T00:00:00') : 'date à fixer') + (a.lieu ? ' · ' + a.lieu : ''),
      resume:[['Activité', a.intitule], ['Cotisation attendue', c.unit ? fcfa(c.unit) : 'libre'], ['Participants', c.lignes.length], ['Montant total recueilli', fcfa(c.total)], ['Avant l’activité', fcfa(c.avant)], ['Pendant l’activité', fcfa(c.pendant)],
        ['Soldés', c.unit ? c.soldes + ' / ' + c.lignes.length : '—'], ['Versements annulés', c.annules]],
      tableaux:[{titre:'Participants par diocèse', entetes:['Diocèse', 'Participants', c.unit ? 'Soldés' : '', 'Montant'], lignes:dio},
        {titre:'Liste des participants', entetes:['N°', 'Nom et prénoms', 'Diocèse', 'Paroisse', 'Contact', 'Avant l’activité', 'Pendant l’activité', 'Total versé', 'Statut'], lignes},
        {titre:'Détail des versements (historique complet)', entetes:['Reçu', 'Date et heure', 'Nom', 'Diocèse', 'Montant', 'Moment', 'Mode', 'Agent', 'État'], lignes:vers}]};
  }

  /* ================================================================ page INSCRIPTIONS */
  function activitesChoix(){
    const rang = a => ['en cours', 'ouverte'].includes(a.statut) ? 0 : a.statut === 'archivée' ? 2 : 1;
    return B.d.activites.filter(a => !a.parentId).sort((x, y) => rang(x) - rang(y) || (y.date||'').localeCompare(x.date||'') || x.intitule.localeCompare(y.intitule, 'fr'));
  }
  function vueInscriptions(v, act, ctx){
    C = ctx;
    const liste = activitesChoix();
    if(!liste.length){ v.innerHTML = '<div class="tuile"><div class="vide"><b>Aucune activité</b>Créez d’abord une activité dans la page « Activités ».</div></div>'; return; }
    if(!S.act || !liste.some(a => a.id === S.act)){ S.act = liste[0].id; S.sel = null; }
    const a = B.par('activites', S.act), c = calcul(a), admin = C.peut('activites'), fige = archivee(a);
    const sel = S.sel ? B.par('membres', S.sel) : null;
    const dernierE = sel ? c.lignes.find(e => e.id === sel.id) : null;
    const defMontant = sel ? (c.unit ? (dernierE ? dernierE.reste || '' : c.unit) : '') : '';
    const moment = a.statut === 'en cours' ? 'pendant' : 'avant';
    const resultats = (!sel && S.rech.trim().length >= 2) ? cherche(S.rech) : [];

    act.innerHTML = '';
    C.$('#actions').innerHTML = '';
    v.innerHTML = `
      <div class="outils"><select id="i-act">${liste.map(x => `<option value="${x.id}" ${x.id === a.id ? 'selected' : ''}>${esc(x.intitule)}${x.date ? ' — ' + esc(dj(x.date + 'T00:00:00')) : ''}${x.statut === 'archivée' ? ' (archivée)' : ''}</option>`).join('')}</select>
        <span>${C.pStatut(a.statut)}</span>
        ${admin ? `<button class="btn btn-contour btn-s" id="i-par">Montant de la cotisation</button>` : ''}
        ${admin && !fige ? `<button class="btn btn-contour btn-s" id="i-arch">Archiver</button>` : ''}
        ${admin && fige ? `<button class="btn btn-contour btn-s" id="i-reo">Rouvrir</button>` : ''}</div>
      <div class="grille c4 kpis2">
        <div class="tuile kpi b"><div class="k">Participants</div><div class="v">${c.lignes.length}</div><div class="note">${c.unit ? c.soldes + ' ont soldé' : 'cotisation libre'}</div></div>
        <div class="tuile kpi j"><div class="k">Montant total</div><div class="v" style="font-size:26px">${fcfa(c.total)}</div><div class="note">${c.unit ? 'attendu par personne : ' + fcfa(c.unit) : 'montant libre'}</div></div>
        <div class="tuile kpi r"><div class="k">Avant l’activité</div><div class="v" style="font-size:26px">${fcfa(c.avant)}</div><div class="note">cotisations reçues d’avance</div></div>
        <div class="tuile kpi"><div class="k">Pendant l’activité</div><div class="v" style="font-size:26px">${fcfa(c.pendant)}</div><div class="note">reçues sur place</div></div></div>
      ${fige ? '<div class="alerte-boite" style="margin:14px 0 0"><b>Activité archivée.</b> Les inscriptions sont figées. Un administrateur peut la rouvrir.</div>' : `
      <div class="tuile" style="margin-top:18px" id="i-form"><h2>Nouvelle inscription</h2><div class="sous">Recherchez la personne dans le registre (nom, prénoms, matricule ou téléphone), puis saisissez son versement.</div>
        ${sel ? `<div class="ligne-fiche" style="align-items:center"><span style="display:flex;gap:10px;align-items:center">${C.avatar(sel)}<span><b>${esc(nomM(sel))}</b><br><span class="petit muet">${esc(dioDe(sel))}${parDe(sel) ? ' · ' + esc(parDe(sel)) : ''} · ${esc(sel.matricule)}</span></span></span>
            <span style="text-align:right">${dernierE ? `<span class="pastille ${dernierE.solde ? 'p-ok' : 'p-warn'}">${esc(statutPaie(dernierE, c.unit))}</span><div class="petit muet">déjà versé : ${fcfa(dernierE.total)}</div>` : '<span class="pastille p-neutre">pas encore inscrit</span>'}<br><button class="btn btn-contour btn-s" id="i-chg" style="margin-top:6px">Changer de personne</button></span></div>
          <div class="grille-champs" style="margin-top:12px">
            <div><label>Montant versé (F CFA) *</label><input type="number" id="i-mt" min="0" step="500" inputmode="numeric" value="${defMontant}"></div>
            <div><label>Moment</label><select id="i-mo"><option value="avant" ${moment === 'avant' ? 'selected' : ''}>Avant l’activité</option><option value="pendant" ${moment === 'pendant' ? 'selected' : ''}>Pendant l’activité</option></select></div>
            <div><label>Mode de paiement</label><select id="i-md">${MODES.map(m => `<option>${m}</option>`).join('')}</select></div>
            <div><label>Remarque</label><input type="text" id="i-no" placeholder="facultatif"></div></div>
          <div style="margin-top:12px;display:flex;gap:10px;justify-content:flex-end"><button class="btn btn-rouge" id="i-ok">Enregistrer le versement</button></div>`
        : `<div class="outils" style="margin:0"><input type="search" id="i-q" placeholder="Rechercher une personne…" value="${esc(S.rech)}" autocomplete="off"><button class="btn btn-contour" id="i-nv">+ Nouveau membre</button></div>
          ${resultats.length ? `<div class="resultats-ins">${resultats.map(m => { const e = c.lignes.find(x => x.id === m.id); return `<button class="res-ins" data-m="${m.id}"><span>${C.avatar(m)}</span><span class="res-nom"><b>${esc(nomM(m))}</b><span class="petit muet">${esc(dioDe(m))}${parDe(m) ? ' · ' + esc(parDe(m)) : ''} · ${esc(m.matricule)}</span></span>${e ? `<span class="pastille ${e.solde ? 'p-ok' : 'p-warn'}">${esc(e.solde ? 'déjà soldé' : 'a versé ' + fcfa(e.total))}</span>` : ''}</button>`; }).join('')}</div>`
            : (S.rech.trim().length >= 2 ? '<div class="petit muet" style="margin-top:8px">Aucune fiche trouvée. Utilisez « + Nouveau membre ».</div>' : '')}`}
      </div>`}
      <div class="onglets" style="margin-top:20px">${[['liste', 'Liste des participants'], ['dio', 'Par diocèse'], ['vers', 'Versements'], ['arch', 'Archives']].map(([k, l]) => `<button data-o="${k}" class="${S.onglet === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div id="i-corps"></div>`;
    $('#i-act', v).onchange = e => { S.act = e.target.value; S.sel = null; S.rech = ''; vueInscriptions(v, act, ctx); };
    v.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { S.onglet = b.dataset.o; vueInscriptions(v, act, ctx); });
    if($('#i-par', v)) $('#i-par', v).onclick = () => parametres(a, () => vueInscriptions(v, act, ctx));
    if($('#i-arch', v)) $('#i-arch', v).onclick = () => archiver(a, c, () => vueInscriptions(v, act, ctx));
    if($('#i-reo', v)) $('#i-reo', v).onclick = () => { a.statut = 'en cours'; B.tracer('réouverture activité', a.intitule); B.sauver(); vueInscriptions(v, act, ctx); };
    if(!fige){
      if($('#i-q', v)){
        const q = $('#i-q', v);
        q.oninput = () => { S.rech = q.value; const pos = q.selectionStart; vueInscriptions(v, act, ctx); const q2 = $('#i-q', v); if(q2){ q2.focus(); try { q2.setSelectionRange(pos, pos); } catch(_){} } };
        $('#i-nv', v).onclick = () => { const t = S.rech.trim().split(/\s+/); C.modifierMembre(null, {nom:(t[0] || '').toUpperCase(), prenoms:t.slice(1).join(' ')}, nv => { S.sel = nv.id; S.rech = ''; vueInscriptions(v, act, ctx); }); };
        v.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { S.sel = b.dataset.m; vueInscriptions(v, act, ctx); setTimeout(() => { const m = $('#i-mt', v); if(m) m.focus(); }, 30); });
        if(S.rech || S.focusQ){ q.focus(); const l = q.value.length; try { q.setSelectionRange(l, l); } catch(_){} }
      }
      if($('#i-chg', v)) $('#i-chg', v).onclick = () => { S.sel = null; S.rech = ''; vueInscriptions(v, act, ctx); setTimeout(() => { const q = $('#i-q', v); if(q) q.focus(); }, 30); };
      if($('#i-ok', v)) $('#i-ok', v).onclick = () => {
        const mt = Math.round(+$('#i-mt', v).value);
        if(!(mt > 0)) return C.toast('Saisissez un montant supérieur à zéro.', true);
        if(dernierE && dernierE.solde && c.unit && !confirm(nomM(sel) + ' a déjà soldé sa cotisation (' + fcfa(dernierE.total) + '). Ajouter encore ' + fcfa(mt) + ' ?')) return;
        const n = Math.max(0, ...B.d.cotisations.map(x => x.numero || 0)) + 1;
        const o = B.ajouter('cotisations', {activiteId:a.id, membreId:sel.id, montant:mt, moment:$('#i-mo', v).value, mode:$('#i-md', v).value, note:$('#i-no', v).value.trim(), date:new Date().toISOString(), numero:n, agent:C.user.email, agentNom:C.user.nom});
        if(!B.d.participations.some(p => p.activiteId === a.id && p.membreId === sel.id)) B.d.participations.push({id:B.uid('prt'), activiteId:a.id, membreId:sel.id, statut:'inscrit', modules:{}});
        B.tracer('versement', recu(n) + ' — ' + nomM(sel) + ' — ' + fcfa(mt) + ' — ' + a.intitule + ' — ' + C.user.email); B.sauver();
        C.toast('Versement ' + recu(n) + ' enregistré : ' + fcfa(mt));
        S.sel = null; S.rech = ''; S.focusQ = true; vueInscriptions(v, act, ctx); S.focusQ = false;
        setTimeout(() => { const q = $('#i-q', v); if(q) q.focus(); }, 30);
      };
    }
    corpsOnglet(v, act, ctx, a, c, fige);
  }
  function cherche(t){
    const q = Identite.jetons(t); if(!q.length) return [];
    const brut = t.trim().toLowerCase();
    return B.d.membres.map(m => {
      const hay = Identite.norm([m.nom, m.prenoms, m.epouseDe, m.matricule, m.tel, m.whatsapp].join(' '));
      const ok = q.every(x => hay.includes(Identite.norm(x))) || (m.matricule || '').toLowerCase() === brut;
      return ok ? {m, s:(Identite.norm(m.nom).startsWith(Identite.norm(q[0])) ? 0 : 1)} : null;
    }).filter(Boolean).sort((x, y) => x.s - y.s || nomM(x.m).localeCompare(nomM(y.m), 'fr')).slice(0, 8).map(x => x.m);
  }
  function corpsOnglet(v, act, ctx, a, c, fige){
    const z = $('#i-corps', v), snap = () => snapInscr(a, c);
    if(S.onglet === 'liste'){
      const dios = [...new Set(c.lignes.map(e => dioDe(e.m)))].sort((x, y) => x.localeCompare(y, 'fr'));
      const q = Identite.norm(S.q || '');
      const vus = c.lignes.filter(e => (!S.dio || dioDe(e.m) === S.dio) && (!q || Identite.norm(nomM(e.m) + ' ' + (e.m ? e.m.matricule : '')).includes(q)));
      z.innerHTML = `<div class="tuile" style="padding:0;overflow:hidden"><div class="outils" style="padding:14px 16px 0;margin:0"><input type="search" id="l-q" placeholder="Filtrer par nom…" value="${esc(S.q)}"><select id="l-d"><option value="">Tous les diocèses</option>${dios.map(d => `<option ${d === S.dio ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
          <button class="btn btn-contour" id="l-c">Exporter (Excel)</button><button class="btn btn-rouge" id="l-p">Imprimer la liste</button></div>
        <div class="defile"><table class="tableau"><thead><tr><th>N°</th><th>Nom et prénoms</th><th>Diocèse</th><th>Paroisse</th><th>Avant</th><th>Pendant</th><th>Total versé</th><th>Statut</th></tr></thead><tbody>
        ${vus.length ? vus.map((e, i) => `<tr class="clic" data-e="${e.id}" title="Ajouter un versement"><td>${i + 1}</td><td><b>${esc(nomM(e.m))}</b></td><td>${esc(dioDe(e.m))}</td><td>${esc(parDe(e.m) || '—')}</td><td>${e.avant ? fcfa(e.avant) : '—'}</td><td>${e.pendant ? fcfa(e.pendant) : '—'}</td><td><b>${fcfa(e.total)}</b></td><td><span class="pastille ${e.solde ? 'p-ok' : 'p-warn'}">${esc(statutPaie(e, c.unit))}</span></td></tr>`).join('')
          : '<tr><td colspan="8"><div class="vide"><b>Aucun participant</b>Les personnes inscrites apparaissent ici dès leur premier versement.</div></td></tr>'}
        </tbody>${vus.length ? `<tfoot><tr class="tot-ligne"><td></td><td><b>${vus.length} participant(s)</b></td><td></td><td></td><td>${fcfa(total(vus.map(e => ({montant:e.avant}))))}</td><td>${fcfa(total(vus.map(e => ({montant:e.pendant}))))}</td><td><b>${fcfa(total(vus.map(e => ({montant:e.total}))))}</b></td><td></td></tr></tfoot>` : ''}</table></div></div>
        <div class="petit muet" style="margin-top:8px">Cliquez sur une ligne pour ajouter un versement à cette personne (par exemple pendant l’activité).</div>`;
      const maj = () => { corpsOnglet(v, act, ctx, a, c, fige); };
      $('#l-q', z).oninput = e => { S.q = e.target.value; const p = e.target.selectionStart; maj(); const n = $('#l-q', v); n.focus(); try { n.setSelectionRange(p, p); } catch(_){} };
      $('#l-d', z).onchange = e => { S.dio = e.target.value; maj(); };
      $('#l-c', z).onclick = () => csvSnap(snap());
      $('#l-p', z).onclick = () => imprimerSnap(snap());
      if(!fige) z.querySelectorAll('[data-e]').forEach(r => r.onclick = () => { S.sel = r.dataset.e; vueInscriptions(v, act, ctx); const f = $('#i-form', v); if(f) f.scrollIntoView({behavior:'smooth', block:'start'}); setTimeout(() => { const m = $('#i-mt', v); if(m) m.focus(); }, 300); });
    }
    else if(S.onglet === 'dio'){
      z.innerHTML = `<div class="tuile" style="padding:0;overflow:hidden"><div class="outils" style="padding:14px 16px 0;margin:0"><span class="muet petit" style="flex:1">Nombre de participants et montant recueilli par diocèse.</span><button class="btn btn-rouge" id="d-p">Imprimer</button></div>
        <div class="defile"><table class="tableau"><thead><tr><th>Diocèse</th><th>Participants</th>${c.unit ? '<th>Soldés</th>' : ''}<th>Montant recueilli</th></tr></thead><tbody>
        ${c.parDio.length ? c.parDio.map(g => `<tr><td><b>${esc(g.nom)}</b></td><td>${g.nb}</td>${c.unit ? `<td>${g.soldes}</td>` : ''}<td>${fcfa(g.montant)}</td></tr>`).join('') : '<tr><td colspan="4"><div class="vide"><b>Aucune donnée</b></div></td></tr>'}
        </tbody>${c.parDio.length ? `<tfoot><tr class="tot-ligne"><td><b>TOTAL</b></td><td><b>${c.lignes.length}</b></td>${c.unit ? `<td><b>${c.soldes}</b></td>` : ''}<td><b>${fcfa(c.total)}</b></td></tr></tfoot>` : ''}</table></div></div>`;
      $('#d-p', z).onclick = () => imprimerSnap(snap());
    }
    else if(S.onglet === 'vers'){
      z.innerHTML = `<div class="tuile" style="padding:0;overflow:hidden"><div class="outils" style="padding:14px 16px 0;margin:0"><span class="muet petit" style="flex:1">Historique complet : un versement n’est jamais effacé, il peut seulement être annulé avec un motif.</span></div>
        <div class="defile"><table class="tableau"><thead><tr><th>Reçu</th><th>Date</th><th>Nom</th><th>Montant</th><th>Moment</th><th>Mode</th><th>Agent</th><th></th></tr></thead><tbody>
        ${c.tous.length ? c.tous.slice().reverse().map(x => { const m = B.par('membres', x.membreId); return `<tr style="${x.annulee ? 'opacity:.55;text-decoration:line-through' : ''}"><td class="mono">${recu(x.numero)}</td><td>${esc(dh(x.date))}</td><td><b>${esc(nomM(m))}</b>${x.note ? `<div class="petit muet">${esc(x.note)}</div>` : ''}${x.annulee ? `<div class="petit" style="text-decoration:none;color:#b3261e">Annulé : ${esc(x.motif || '')}</div>` : ''}</td><td>${fcfa(x.montant)}</td><td>${x.moment === 'pendant' ? 'Pendant' : 'Avant'}</td><td>${esc(x.mode || '')}</td><td class="petit">${esc(x.agentNom || '')}</td>
          <td style="white-space:nowrap">${fige ? '' : (x.annulee ? `<button class="btn btn-contour btn-s" data-re="${x.id}">Rétablir</button>` : `<button class="btn btn-contour btn-s" data-mo="${x.id}">Modifier</button> <button class="btn btn-danger btn-s" data-an="${x.id}">Annuler</button>`)}</td></tr>`; }).join('')
          : '<tr><td colspan="8"><div class="vide"><b>Aucun versement</b></div></td></tr>'}</tbody></table></div></div>`;
      const rafr = () => vueInscriptions(v, act, ctx);
      z.querySelectorAll('[data-mo]').forEach(b => b.onclick = () => modifierVersement(B.par('cotisations', b.dataset.mo), rafr));
      z.querySelectorAll('[data-an]').forEach(b => b.onclick = () => annulerVersement(B.par('cotisations', b.dataset.an), rafr));
      z.querySelectorAll('[data-re]').forEach(b => b.onclick = () => { const x = B.par('cotisations', b.dataset.re); delete x.annulee; delete x.motif; B.tracer('rétablissement versement', recu(x.numero) + ' — ' + C.user.email); B.sauver(); rafr(); });
    }
    else archivesOnglet(z);
  }
  function modifierVersement(x, apres){
    const m = B.par('membres', x.membreId);
    const v = C.modale('Modifier le versement ' + recu(x.numero), `<p><b>${esc(nomM(m))}</b></p><div class="grille-champs">
        <div><label>Montant (F CFA)</label><input type="number" id="mv-mt" min="1" step="500" value="${x.montant}"></div>
        <div><label>Moment</label><select id="mv-mo"><option value="avant" ${x.moment !== 'pendant' ? 'selected' : ''}>Avant l’activité</option><option value="pendant" ${x.moment === 'pendant' ? 'selected' : ''}>Pendant l’activité</option></select></div>
        <div><label>Mode de paiement</label><select id="mv-md">${MODES.map(k => `<option ${k === x.mode ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
        <div><label>Remarque</label><input type="text" id="mv-no" value="${esc(x.note || '')}"></div></div>`,
      '<button class="btn btn-contour" id="mv-a">Annuler</button><button class="btn btn-rouge" id="mv-ok">Enregistrer</button>');
    $('#mv-a', v).onclick = () => v.remove();
    $('#mv-ok', v).onclick = () => {
      const mt = Math.round(+$('#mv-mt', v).value); if(!(mt > 0)) return C.toast('Montant invalide.', true);
      B.tracer('modification versement', recu(x.numero) + ' : ' + fcfa(x.montant) + ' → ' + fcfa(mt) + ' — ' + C.user.email);
      Object.assign(x, {montant:mt, moment:$('#mv-mo', v).value, mode:$('#mv-md', v).value, note:$('#mv-no', v).value.trim(), modifieLe:new Date().toISOString()}); B.sauver(); v.remove(); apres();
    };
  }
  function annulerVersement(x, apres){
    const m = B.par('membres', x.membreId);
    const v = C.modale('Annuler le versement ' + recu(x.numero), `<p>${esc(nomM(m))} — <b>${fcfa(x.montant)}</b></p><p class="petit muet">Le versement reste dans l’historique, barré, et n’est plus compté dans les totaux.</p><label style="font-weight:700;font-size:12px">Motif de l’annulation *</label><input type="text" id="an-mo" placeholder="ex. erreur de saisie, remboursement">`,
      '<button class="btn btn-contour" id="an-a">Retour</button><button class="btn btn-danger" id="an-ok">Annuler le versement</button>');
    $('#an-a', v).onclick = () => v.remove();
    $('#an-ok', v).onclick = () => { const mo = $('#an-mo', v).value.trim(); if(!mo) return C.toast('Indiquez le motif.', true);
      x.annulee = true; x.motif = mo; x.annuleLe = new Date().toISOString(); B.tracer('annulation versement', recu(x.numero) + ' — ' + mo + ' — ' + C.user.email); B.sauver(); v.remove(); apres(); };
  }
  function parametres(a, apres){
    const v = C.modale('Cotisation — ' + a.intitule, `<div class="grille-champs"><div><label>Montant attendu par personne (F CFA)</label><input type="number" id="pm-mt" min="0" step="500" value="${+a.contribMontant || ''}" placeholder="0 = montant libre"></div>
      <div><label>Minimum pour ouvrir droit au diplôme (F CFA)</label><input type="number" id="pm-sl" min="0" step="500" value="${+a.contribSeuil || ''}" placeholder="par défaut : le montant attendu"></div></div>
      <div class="petit muet" style="margin-top:10px">Une personne est « soldée » quand ses versements atteignent le montant attendu. Le minimum sert au diplôme de la formation biblique.</div>`,
      '<button class="btn btn-contour" id="pm-a">Annuler</button><button class="btn btn-rouge" id="pm-ok">Enregistrer</button>');
    $('#pm-a', v).onclick = () => v.remove();
    $('#pm-ok', v).onclick = () => { a.contribMontant = Math.max(0, Math.round(+$('#pm-mt', v).value || 0)); a.contribSeuil = Math.max(0, Math.round(+$('#pm-sl', v).value || 0));
      B.tracer('paramètres cotisation', a.intitule + ' : ' + a.contribMontant + ' F'); B.sauver(); v.remove(); apres(); };
  }
  function archiver(a, c, apres){
    if(!confirm('Archiver « ' + a.intitule + ' » ?\n\nUn instantané (liste, totaux par diocèse, historique des versements) sera conservé et l’activité sera figée. Un administrateur pourra la rouvrir.')) return;
    const s = Object.assign(snapInscr(a, c), {id:B.uid('arc'), date:new Date().toISOString(), par:C.user.email});
    B.d.archives.unshift(s); a.statut = 'archivée'; B.tracer('archivage', a.intitule + ' — ' + fcfa(c.total) + ' — ' + C.user.email); B.sauver(); C.toast('Archive enregistrée.'); S.onglet = 'arch'; apres();
  }
  function archivesOnglet(z){
    const L = B.d.archives;
    z.innerHTML = `<div class="tuile" style="padding:0;overflow:hidden"><div class="outils" style="padding:14px 16px 0;margin:0"><span class="muet petit">Instantanés figés : ils ne changent plus, même si les fiches sont modifiées après.</span></div>
      <div class="defile"><table class="tableau"><thead><tr><th>Archive</th><th>Date</th><th>Résumé</th><th></th></tr></thead><tbody>
      ${L.length ? L.map(s => `<tr><td><b>${esc(s.titre)}</b><div class="petit muet">${({formation:'Formation biblique', inscriptions:'Inscriptions', 'rapport-activite':'Rapport d’activité', 'rapport-exercice':'Rapport d’exercice'})[s.kind] || 'Archive'} · par ${esc(s.par || '')}</div></td><td>${esc(dh(s.date))}</td><td class="petit">${s.resume.slice(2, 5).map(r => esc(r[0]) + ' : <b>' + esc(r[1]) + '</b>').join('<br>')}</td>
        <td style="white-space:nowrap"><button class="btn btn-contour btn-s" data-av="${s.id}">Voir</button> <button class="btn btn-contour btn-s" data-ap="${s.id}">Imprimer</button></td></tr>`).join('') : '<tr><td colspan="4"><div class="vide"><b>Aucune archive</b>Utilisez « Archiver » à la fin d’une activité.</div></td></tr>'}</tbody></table></div></div>`;
    z.querySelectorAll('[data-av]').forEach(b => b.onclick = () => voirSnap(L.find(s => s.id === b.dataset.av)));
    z.querySelectorAll('[data-ap]').forEach(b => b.onclick = () => imprimerSnap(L.find(s => s.id === b.dataset.ap)));
  }

  /* ================================================================ FORMATION PUBLIQUE */
  const termine = a => ['clôturée', 'archivée'].includes(a.statut);
  function presents(actId){
    const s = new Map();
    B.d.participations.filter(p => p.activiteId === actId && p.statut !== 'absent').forEach(p => s.set(p.membreId, p.manuel ? 'manuel' : 'liste'));
    B.d.presences.filter(p => p.activiteId === actId).forEach(p => s.set(p.membreId, 'contrôle'));
    return s;
  }
  function calcFormation(par, mods){
    const pres = mods.map(m => presents(m.id)), ids = new Set(); pres.forEach(s => s.forEach((_, k) => ids.add(k)));
    const seuil = +par.contribSeuil || +par.contribMontant || 0;
    const cot = calcul(par).lignes, rows = [];
    ids.forEach(id => {
      const m = B.par('membres', id); if(!m) return;
      const vu = pres.map(s => s.has(id)), via = pres.map(s => s.get(id) || '');
      const manque = mods.map((a, k) => !vu[k] && termine(a));
      let dec, motif = '';
      if(!vu[0]){ dec = 'hors'; motif = 'N’a pas suivi le module 1'; }
      else if(manque.some(Boolean)){ dec = 'recale'; motif = 'Absent au module ' + (manque.findIndex(Boolean) + 1); }
      else if(vu.every(Boolean)) dec = 'admis';
      else dec = 'encours';
      const e = cot.find(x => x.id === id), verse = e ? e.total : 0, cotise = seuil ? verse >= seuil : true;
      const dip = B.d.diplomes.find(d => d.activiteId === par.id && d.membreId === id);
      let diplome = dec === 'admis' ? (cotise ? (dip ? 'remis' : 'delivrer') : 'retenu') : (dec === 'encours' ? 'attente' : 'non');
      rows.push({id, m, vu, via, dec, motif, verse, cotise, diplome, dip});
    });
    const ordre = {admis:0, encours:1, recale:2, hors:3};
    rows.sort((x, y) => ordre[x.dec] - ordre[y.dec] || nomM(x.m).localeCompare(nomM(y.m), 'fr'));
    return {rows, pres, seuil, mods};
  }
  const LIB_DEC = {admis:'Admis(e)', recale:'Recalé(e)', encours:'En cours', hors:'Hors cursus'};
  const CLS_DEC = {admis:'p-ok', recale:'p-ko', encours:'p-warn', hors:'p-neutre'};
  const LIB_DIP = {remis:'Diplôme remis', delivrer:'À délivrer', retenu:'Retenu — cotisation non versée', attente:'—', non:'Non'};
  function snapFormation(par, f){
    const R = f.rows, n = f.mods.length;
    const ligne = (r, i) => [i + 1, nomM(r.m), dioDe(r.m), parDe(r.m)].concat(r.vu.map(x => x ? 'Présent' : 'Absent')).concat([LIB_DEC[r.dec] + (r.motif ? ' (' + r.motif + ')' : ''), fcfa(r.verse), LIB_DIP[r.diplome]]);
    const ent = ['N°', 'Nom et prénoms', 'Diocèse', 'Paroisse'].concat(f.mods.map((m, k) => 'Module ' + (k + 1))).concat(['Décision', 'Cotisation versée', 'Diplôme']);
    const nb = d => R.filter(r => r.dec === d).length;
    return {kind:'formation', activiteId:par.id, titre:'Suivi des modules — ' + par.intitule + (par.annee ? ' ' + par.annee : ''), sous:'État au ' + dj(new Date().toISOString()),
      resume:[['Formation', par.intitule], ['Modules', n], ['Ont commencé (module 1)', R.filter(r => r.vu[0]).length], ['Admis(es)', nb('admis')], ['Recalé(e)s', nb('recale')], ['En cours', nb('encours')],
        ['Diplômes à délivrer', R.filter(r => r.diplome === 'delivrer').length], ['Diplômes retenus (cotisation)', R.filter(r => r.diplome === 'retenu').length]],
      tableaux:[{titre:'Présence par module', entetes:['Module', 'Présents', 'Dont présents depuis le module 1', 'Absents parmi ceux du module 1'], lignes:f.mods.map((a, k) => [a.intitule, f.pres[k].size, R.filter(r => r.vu[0] && r.vu[k]).length, R.filter(r => r.vu[0] && !r.vu[k]).length])},
        {titre:'Admis(es)', entetes:ent, lignes:R.filter(r => r.dec === 'admis').map(ligne)},
        {titre:'Recalé(e)s', entetes:ent, lignes:R.filter(r => r.dec === 'recale').map(ligne)},
        {titre:'En cours et hors cursus', entetes:ent, lignes:R.filter(r => ['encours', 'hors'].includes(r.dec)).map(ligne)}]};
  }
  function diplomeImprimer(par, r, n){
    C.exporter.imprimer('Diplôme — ' + par.intitule, '', [], [], `<div style="text-align:center;border:7px double #0B2150;padding:46px 30px;margin:14px 0">
      <div style="letter-spacing:.2em;font-size:13px;color:#555">RENOUVEAU CHARISMATIQUE CATHOLIQUE DE CÔTE D’IVOIRE</div>
      <div style="font-size:42px;font-weight:bold;color:#0B2150;margin:22px 0 8px;letter-spacing:.12em">DIPLÔME</div>
      <p style="font-size:15px">décerné à</p><div style="font-size:30px;font-weight:bold;margin:6px 0 18px">${esc(nomM(r.m))}</div>
      <p style="font-size:15px;line-height:1.6">pour avoir suivi avec assiduité les <b>${n} modules</b> de la <b>${esc(par.intitule)}</b>${par.annee ? ' (' + esc(par.annee) + ')' : ''}<br>et pris part à l’organisation par sa contribution.</p>
      <p style="margin-top:34px">Fait à Abidjan, le ${esc(dj(new Date().toISOString()))}</p><p style="margin-top:44px">Le Coordinateur national</p></div>`);
  }
  function vueFormation(v, act, ctx){
    C = ctx;
    const parents = B.d.activites.filter(a => !a.parentId).sort((x, y) => (/formation biblique/i.test(y.intitule) ? 1 : 0) - (/formation biblique/i.test(x.intitule) ? 1 : 0) || x.intitule.localeCompare(y.intitule, 'fr'));
    if(!parents.length){ v.innerHTML = '<div class="tuile"><div class="vide"><b>Aucune activité</b>Créez la « Formation biblique » dans la page Activités.</div></div>'; return; }
    if(!S.par || !parents.some(a => a.id === S.par)) S.par = parents[0].id;
    const par = B.par('activites', S.par), mods = B.d.activites.filter(a => a.parentId === par.id).sort((x, y) => (x.moduleNum || 0) - (y.moduleNum || 0)), admin = C.peut('activites');
    const sel = `<div class="outils"><select id="f-par">${parents.map(a => `<option value="${a.id}" ${a.id === par.id ? 'selected' : ''}>${esc(a.intitule)}${a.annee ? ' ' + esc(a.annee) : ''}</option>`).join('')}</select>${C.pStatut(par.statut)}</div>`;
    const rafr = () => vueFormation(v, act, ctx);
    if(!mods.length){
      v.innerHTML = sel + `<div class="tuile"><div class="vide"><b>Les modules ne sont pas encore préparés</b>Ils servent à comparer les listes de présence : une personne qui a commencé le module 1 doit suivre tous les autres.<br><br>${admin ? '<button class="btn btn-rouge" id="f-cr">Préparer les modules</button>' : 'Un administrateur doit les préparer.'}</div></div>`;
      $('#f-par', v).onchange = e => { S.par = e.target.value; rafr(); };
      if($('#f-cr', v)) $('#f-cr', v).onclick = () => {
        const w = C.modale('Préparer les modules', `<div class="grille-champs"><div><label>Nombre de modules</label><select id="cm-n">${[2, 3, 4, 5].map(k => `<option ${k === 3 ? 'selected' : ''}>${k}</option>`).join('')}</select></div><div><label>Année / session</label><input type="text" id="cm-a" value="${esc(par.annee || '2026-2027')}"></div></div>
          <div class="petit muet" style="margin-top:10px">Chaque module devient une activité (liste de présence propre, contrôle par pièce d’identité). Vous fixerez ensuite les dates dans « Activités ».</div>`,
          '<button class="btn btn-contour" id="cm-a2">Annuler</button><button class="btn btn-rouge" id="cm-ok">Créer</button>');
        $('#cm-a2', w).onclick = () => w.remove();
        $('#cm-ok', w).onclick = () => { const n = +$('#cm-n', w).value; par.annee = $('#cm-a', w).value.trim();
          for(let k = 1; k <= n; k++) B.d.activites.push({id:B.uid('act'), intitule:'Module ' + k + ' — ' + par.intitule + (par.annee ? ' ' + par.annee : ''), typeId:par.typeId, date:'', heure:'', lieu:par.lieu || '', statut:'en préparation', responsable:par.responsable || '', parentId:par.id, moduleNum:k});
          B.tracer('modules créés', par.intitule + ' : ' + n); B.sauver(); w.remove(); rafr(); };
      };
      return;
    }
    const f = calcFormation(par, mods), R = f.rows, fige = archivee(par);
    const nb = d => R.filter(r => r.dec === d).length, filtre = S.filtreF;
    const vus = R.filter(r => filtre === 'tous' || r.dec === filtre || (filtre === 'diplome' && ['delivrer', 'retenu', 'remis'].includes(r.diplome)));
    v.innerHTML = sel + `
      <div class="grille c4 kpis2">
        <div class="tuile kpi b"><div class="k">Ont commencé</div><div class="v">${R.filter(r => r.vu[0]).length}</div><div class="note">présents au module 1</div></div>
        <div class="tuile kpi j"><div class="k">Admis(es)</div><div class="v">${nb('admis')}</div><div class="note">tous les modules suivis</div></div>
        <div class="tuile kpi r"><div class="k">Recalé(e)s</div><div class="v">${nb('recale')}</div><div class="note">un module manqué</div></div>
        <div class="tuile kpi"><div class="k">Diplômes</div><div class="v">${R.filter(r => r.diplome === 'delivrer' || r.diplome === 'remis').length}</div><div class="note">${R.filter(r => r.diplome === 'retenu').length} retenu(s) — cotisation non versée</div></div></div>
      <div class="liste-act" style="margin-top:18px">${mods.map((a, k) => `<div class="carte-act"><div class="act-info"><div class="act-titre">Module ${k + 1}</div><div class="petit muet">${a.date ? esc(dj(a.date + 'T00:00:00')) : 'date à fixer'}${a.lieu ? ' · ' + esc(a.lieu) : ''}</div></div>
          <div class="act-meta"><div><span class="act-lib">Présents</span><b>${f.pres[k].size}</b></div><div><span class="act-lib">Absents (du module 1)</span><b>${k ? R.filter(r => r.vu[0] && !r.vu[k]).length : '—'}</b></div><div><span class="act-lib">Statut</span>${C.pStatut(a.statut)}</div></div>
          ${fige ? '' : `<div class="act-actions"><button class="btn btn-contour btn-s" data-fc="${a.id}">Contrôler</button><button class="btn btn-contour btn-s" data-fi="${a.id}">Importer une liste</button><button class="btn btn-contour btn-s" data-fm="${a.id}">Modifier</button>${admin && !termine(a) ? `<button class="btn btn-contour btn-s" data-fx="${a.id}">Clôturer le module</button>` : ''}</div>`}</div>`).join('')}</div>
      <div class="alerte-boite" style="margin:14px 0 0"><b>Règle :</b> qui a commencé le module 1 doit suivre tous les modules ; un module manqué = recalé. Un module n’est pris en compte comme « manqué » que lorsqu’il est <b>clôturé</b>. Le diplôme est retenu tant que la cotisation (${f.seuil ? fcfa(f.seuil) : 'aucun minimum fixé'}) n’est pas versée.</div>
      <div class="tuile" style="padding:0;overflow:hidden;margin-top:18px"><div class="outils" style="padding:14px 16px 0;margin:0"><select id="f-f"><option value="tous">Toutes les personnes (${R.length})</option><option value="admis" ${filtre === 'admis' ? 'selected' : ''}>Admis(es) (${nb('admis')})</option><option value="recale" ${filtre === 'recale' ? 'selected' : ''}>Recalé(e)s (${nb('recale')})</option><option value="encours" ${filtre === 'encours' ? 'selected' : ''}>En cours (${nb('encours')})</option><option value="hors" ${filtre === 'hors' ? 'selected' : ''}>Hors cursus (${nb('hors')})</option><option value="diplome" ${filtre === 'diplome' ? 'selected' : ''}>Diplômes</option></select>
        <button class="btn btn-contour" id="f-c">Exporter (Excel)</button><button class="btn btn-rouge" id="f-p">Imprimer la liste</button>${admin ? '<button class="btn btn-rouge" id="f-dg">Générer les diplômes</button>' : ''}${admin && !fige ? '<button class="btn btn-contour" id="f-ar">Archiver la session</button>' : ''}${admin && fige ? '<button class="btn btn-contour" id="f-re">Rouvrir</button>' : ''}</div>
        <div class="defile"><table class="tableau"><thead><tr><th>N°</th><th>Nom et prénoms</th><th>Diocèse</th>${mods.map((_, k) => `<th>M${k + 1}</th>`).join('')}<th>Décision</th><th>Cotisation</th><th>Diplôme</th></tr></thead><tbody>
        ${vus.length ? vus.map((r, i) => `<tr><td>${i + 1}</td><td><b>${esc(nomM(r.m))}</b></td><td>${esc(dioDe(r.m))}</td>
          ${r.vu.map((x, k) => `<td><input type="checkbox" style="width:auto" data-pm="${r.id}|${k}" ${x ? 'checked' : ''} ${(fige || r.via[k] === 'contrôle' || !admin) ? 'disabled' : ''} title="${x ? 'présent (' + esc(r.via[k]) + ')' : 'absent'}"></td>`).join('')}
          <td><span class="pastille ${CLS_DEC[r.dec]}">${LIB_DEC[r.dec]}</span>${r.motif ? `<div class="petit muet">${esc(r.motif)}</div>` : ''}</td>
          <td>${f.seuil || r.verse ? `${fcfa(r.verse)}<div class="petit" style="color:${r.cotise ? '#1b7f3b' : '#b3261e'}">${r.cotise ? 'ok' : 'insuffisante'}</div>` : '<span class="muet">—</span>'}</td>
          <td>${r.diplome === 'delivrer' ? `<span class="pastille p-ok">À délivrer</span>${admin && !fige ? `<div style="margin-top:4px"><button class="btn btn-contour btn-s" data-dp="${r.id}">Diplôme</button> <button class="btn btn-contour btn-s" data-dr="${r.id}">Marquer remis</button></div>` : ''}`
            : r.diplome === 'remis' ? `<span class="pastille p-info">Remis le ${esc(dj(r.dip.remisLe))}</span>${admin && !fige ? `<div style="margin-top:4px"><button class="btn btn-contour btn-s" data-dp="${r.id}">Réimprimer</button></div>` : ''}`
            : r.diplome === 'retenu' ? '<span class="pastille p-ko">Retenu</span><div class="petit muet">cotisation non versée</div>' : '<span class="muet">—</span>'}</td></tr>`).join('')
          : `<tr><td colspan="${mods.length + 6}"><div class="vide"><b>Aucune personne</b>Les listes de présence des modules alimentent ce tableau (contrôle, import de liste, ou case à cocher).</div></td></tr>`}</tbody></table></div></div>`;
    $('#f-par', v).onchange = e => { S.par = e.target.value; rafr(); };
    $('#f-f', v).onchange = e => { S.filtreF = e.target.value; rafr(); };
    $('#f-p', v).onclick = () => imprimerSnap(snapFormation(par, f));
    $('#f-c', v).onclick = () => { const s = snapFormation(par, f); const t = s.tableaux[1]; const tout = [].concat(s.tableaux[1].lignes, s.tableaux[2].lignes, s.tableaux[3].lignes); C.exporter.csv(s.titre, t.entetes, tout); };
    v.querySelectorAll('[data-fc]').forEach(b => b.onclick = () => C.controler(b.dataset.fc));
    v.querySelectorAll('[data-fi]').forEach(b => b.onclick = () => Registre.importer({esc, $:C.$, modale:C.modale, toast:C.toast, redraw:rafr}, b.dataset.fi));
    v.querySelectorAll('[data-fm]').forEach(b => b.onclick = () => C.modifierActivite(B.par('activites', b.dataset.fm)));
    v.querySelectorAll('[data-fx]').forEach(b => b.onclick = () => { const a = B.par('activites', b.dataset.fx); if(!confirm('Clôturer « ' + a.intitule + ' » ?\n\nLes personnes absentes à ce module seront alors recalées.')) return; a.statut = 'clôturée'; B.tracer('clôture module', a.intitule + ' — ' + C.user.email); B.sauver(); rafr(); });
    v.querySelectorAll('[data-pm]').forEach(c => c.onchange = () => { const [id, k] = c.dataset.pm.split('|'), a = mods[+k];
      if(c.checked){ if(!B.d.participations.some(p => p.activiteId === a.id && p.membreId === id)) B.d.participations.push({id:B.uid('prt'), activiteId:a.id, membreId:id, statut:'présent', manuel:true, modules:{}}); }
      else B.d.participations = B.d.participations.filter(p => !(p.activiteId === a.id && p.membreId === id));
      B.tracer('présence module (manuel)', nomM(B.par('membres', id)) + ' — ' + a.intitule + ' — ' + (c.checked ? 'présent' : 'absent') + ' — ' + C.user.email); B.sauver(); rafr(); });
    const elig = R.filter(r => ['delivrer', 'remis'].includes(r.diplome));
    if($('#f-dg', v)) $('#f-dg', v).onclick = () => Archives.diplomes(C, par, elig, rafr);
    v.querySelectorAll('[data-dp]').forEach(b => b.onclick = () => Archives.diplomes(C, par, elig, rafr, b.dataset.dp));
    v.querySelectorAll('[data-dr]').forEach(b => b.onclick = () => { const id = b.dataset.dr; B.d.diplomes.push({id:B.uid('dip'), activiteId:par.id, membreId:id, remisLe:new Date().toISOString(), par:C.user.email}); B.tracer('diplôme remis', nomM(B.par('membres', id)) + ' — ' + par.intitule); B.sauver(); rafr(); });
    if($('#f-ar', v)) $('#f-ar', v).onclick = () => {
      if(!confirm('Archiver la session « ' + par.intitule + ' » ?\n\nL’état des listes, les admis, les recalés et les diplômes sont conservés dans un instantané ; les modules sont figés.')) return;
      const s = Object.assign(snapFormation(par, f), {id:B.uid('arc'), date:new Date().toISOString(), par:C.user.email}); B.d.archives.unshift(s);
      par.statut = 'archivée'; mods.forEach(m => m.statut = 'archivée'); B.tracer('archivage', s.titre + ' — ' + C.user.email); B.sauver(); C.toast('Session archivée.'); rafr(); };
    if($('#f-re', v)) $('#f-re', v).onclick = () => { par.statut = 'clôturée'; mods.forEach(m => { if(m.statut === 'archivée') m.statut = 'clôturée'; }); B.tracer('réouverture session', par.intitule); B.sauver(); rafr(); };
  }
  window.Finance = {vueInscriptions, vueFormation, calcul, fcfa, init:c => { C = c; }, imprimerSnap, voirSnap, csvSnap, archivesOnglet, calcFormation, dj, dh, dioDe, parDe, nomM};
})();
