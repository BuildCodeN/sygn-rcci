/* photos.js — photos d'identité des membres.
   Les photos ne sont PAS dans la base JSON (trop lourdes pour le localStorage) : elles sont gardées dans
   IndexedDB du navigateur, redimensionnées (480 × 480, JPEG), une par fiche. Une photo livrée avec
   l'application peut aussi être référencée par `photoFichier` (chemin relatif).
   Importer : une par une (fiche) ou en lot (nom du fichier = nom de la personne ou matricule). */
(function(){
  'use strict';
  const cache = new Map(); let db = null, ok = false;
  function ouvrir(){
    return new Promise(res => {
      try { const r = indexedDB.open('rcci-photos', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('p');
        r.onsuccess = () => { db = r.result; ok = true; res(db); };
        r.onerror = () => res(null); r.onblocked = () => res(null);
      } catch(e){ res(null); }
    });
  }
  async function charger(){
    await ouvrir(); if(!db) return;
    return new Promise(res => {
      try { const rq = db.transaction('p').objectStore('p').openCursor();
        rq.onsuccess = () => { const c = rq.result; if(c){ cache.set(c.key, URL.createObjectURL(c.value)); c.continue(); } else res(); };
        rq.onerror = () => res();
      } catch(e){ res(); }
    });
  }
  const url = m => (m && (cache.get(m.id) || m.photoFichier)) || '';
  async function enregistrer(id, blob){
    if(db) await new Promise(res => { const tx = db.transaction('p', 'readwrite'); tx.objectStore('p').put(blob, id); tx.oncomplete = res; tx.onerror = res; });
    const ancien = cache.get(id); if(ancien) URL.revokeObjectURL(ancien);
    cache.set(id, URL.createObjectURL(blob));
  }
  async function retirer(id){
    if(db) await new Promise(res => { const tx = db.transaction('p', 'readwrite'); tx.objectStore('p').delete(id); tx.oncomplete = res; tx.onerror = res; });
    const ancien = cache.get(id); if(ancien){ URL.revokeObjectURL(ancien); cache.delete(id); }
  }
  /** Carré 480 × 480, cadré au centre et légèrement vers le haut (le visage). */
  async function redimensionner(fichier){
    const bmp = await createImageBitmap(fichier), cote = Math.min(bmp.width, bmp.height);
    const sx = (bmp.width - cote) / 2, sy = bmp.height > bmp.width ? (bmp.height - cote) * .12 : 0;
    const c = document.createElement('canvas'); c.width = c.height = 480;
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, sx, sy, cote, cote, 0, 0, 480, 480);
    return new Promise(res => c.toBlob(res, 'image/jpeg', .88));
  }
  async function depuisFichier(id, fichier){ await enregistrer(id, await redimensionner(fichier)); }
  /** Lot : le nom du fichier doit être le matricule (RCCI-000012) ou le nom de la personne (« MARTIN Marie.jpg »). */
  async function importerLot(fichiers, membres){
    const rap = {ok:[], ambigu:[], inconnu:[]};
    for(const f of fichiers){
      if(!/^image\//.test(f.type)){ rap.inconnu.push({fichier:f.name, raison:'ce n’est pas une image'}); continue; }
      const base = f.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
      let m = /^RCCI-\d+$/i.test(base) ? membres.find(x => x.matricule.toUpperCase() === base.toUpperCase()) : null, cand = [];
      if(!m){ const r = Identite.chercher(membres, {nom:base, numero:'', dateNaissance:''}); cand = r.candidats; if(r.etat === 'identifie') m = r.candidats[0].m; }
      if(m){ await depuisFichier(m.id, f); rap.ok.push({fichier:f.name, membre:m}); }
      else if(cand.length) rap.ambigu.push({fichier:f.name, cand:cand.map(c => c.m), f});
      else rap.inconnu.push({fichier:f.name, raison:'aucune fiche ne porte ce nom'});
    }
    return rap;
  }
  /** Passe la photo d'une fiche à une autre (fusion de doublons). */
  async function deplacer(de, vers){
    if(!db) return;
    const blob = await new Promise(res => { try { const q = db.transaction('p').objectStore('p').get(de); q.onsuccess = () => res(q.result); q.onerror = () => res(null); } catch(e){ res(null); } });
    if(!blob) return; await enregistrer(vers, blob); await retirer(de);
  }
  window.Photos = {deplacer, charger, url, enregistrer, retirer, depuisFichier, importerLot, get persistante(){ return ok; }};
})();
