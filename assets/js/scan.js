/* scan.js — lecture d'une pièce d'identité photographiée (téléphone ou appareil photo).
   Reconnaissance de texte (OCR) faite DANS le navigateur : l'image n'est envoyée nulle part et n'est jamais
   conservée. Le module de lecture (Tesseract.js, langue française) est chargé une seule fois depuis Internet,
   puis le navigateur le garde. Les champs lus (nom, prénoms, numéro, naissance) sont TOUJOURS montrés à
   l'agent, qui peut les corriger avant de valider.
   Lecture de la pièce : zone « MRZ » (passeport, CNI à bandes) en priorité, sinon libellés (Nom, Prénoms,
   N°, Date de naissance). */
(function(){
  'use strict';
  const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  const sans = s => (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let promesse = null;

  function chargerModule(){
    if(window.Tesseract) return Promise.resolve();
    if(promesse) return promesse;
    promesse = new Promise((ok, ko) => {
      const s = document.createElement('script'); s.src = TESS; s.async = true;
      s.onload = () => window.Tesseract ? ok() : ko(new Error('Module de lecture indisponible.'));
      s.onerror = () => { promesse = null; ko(new Error('Connexion Internet requise la première fois pour charger le module de lecture des pièces.')); };
      document.head.appendChild(s);
    });
    return promesse;
  }
  /** Image redimensionnée (1800 px max), en niveaux de gris et contraste étiré : l'OCR lit mieux. */
  async function preparer(fichier){
    const bmp = await createImageBitmap(fichier), k = Math.min(1, 1800 / Math.max(bmp.width, bmp.height)) || 1;
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const g = c.getContext('2d', {willReadFrequently:true}); g.drawImage(bmp, 0, 0, c.width, c.height);
    const im = g.getImageData(0, 0, c.width, c.height), p = im.data; let mn = 255, mx = 0;
    for(let i = 0; i < p.length; i += 4){ const y = (p[i]*.299 + p[i+1]*.587 + p[i+2]*.114) | 0; p[i] = y; if(y < mn) mn = y; if(y > mx) mx = y; }
    const sp = Math.max(1, mx - mn);
    for(let i = 0; i < p.length; i += 4){ const y = Math.max(0, Math.min(255, ((p[i] - mn) * 255 / sp) | 0)); p[i] = p[i+1] = p[i+2] = y; }
    g.putImageData(im, 0, 0); return c;
  }
  async function ocr(fichier, progression){
    if(progression) progression(null);
    await chargerModule();
    const img = await preparer(fichier);
    const w = await Tesseract.createWorker('fra', 1, {logger: m => { if(progression && m.status === 'recognizing text') progression(Math.round(m.progress * 100)); }});
    try { const r = await w.recognize(img); return r.data.text || ''; } finally { try { await w.terminate(); } catch(e){} }
  }

  /* ----------------------------------------------------------------- analyse du texte lu */
  const propre = v => (v||'').replace(/[^A-Za-zÀ-ÿ'’\- ]/g, ' ').replace(/\s+/g, ' ').trim();
  const titre = s => s.toLowerCase().replace(/(^|[\s'’\-])([a-zà-ÿ])/g, (_, a, b) => a + b.toUpperCase());
  function dateISO(j, m, a){ j = +j; m = +m; a = +a; return (a >= 1920 && a <= 2015 && m >= 1 && m <= 12 && j >= 1 && j <= 31) ? a+'-'+String(m).padStart(2,'0')+'-'+String(j).padStart(2,'0') : ''; }

  function lireMRZ(lignes){
    const L = lignes.map(l => l.replace(/\s+/g, '').toUpperCase().replace(/[«‹]/g, '<')).filter(l => l.length >= 25 && /^[A-Z0-9<]+$/.test(l) && l.includes('<'));
    if(!L.length) return null;
    const r = {nom:'', prenoms:'', numero:'', naissance:'', mrzType:''};
    const ln = L.find(l => /<<[A-Z]/.test(l)); if(!ln) return null;
    let nomsBruts = ln; const p = /^P[A-Z<]?([A-Z]{3})(.*)$/.exec(ln); if(p){ nomsBruts = p[2]; r.mrzType = 'passeport'; }       // passeport : P<CIV + noms
    const parts = nomsBruts.split('<<').filter(Boolean);
    r.nom = propre(parts[0].replace(/</g, ' ')); r.prenoms = propre((parts[1]||'').replace(/</g, ' '));
    const autre = L.find(l => l !== ln && /\d/.test(l));
    if(autre){
      const t3 = /^([A-Z0-9<]{9})[0-9<][A-Z]{3}(\d{6})/.exec(autre);                                   // passeport (ligne 2)
      if(t3){ r.numero = t3[1].replace(/</g, ''); const y = +t3[2].slice(0,2), a = y > (new Date().getFullYear() % 100) ? 1900 + y : 2000 + y; r.naissance = dateISO(t3[2].slice(4,6), t3[2].slice(2,4), a); }
    }
    return r.nom ? r : null;
  }
  function analyser(texte){
    const lignes = (texte||'').split(/\r?\n/).map(l => l.trim()).filter(Boolean), U = lignes.map(l => sans(l).toUpperCase()), tout = U.join(' ');
    const type = /PASSEPORT|PASSPORT/.test(tout) ? 'passeport' : /CARTE NATIONALE|IDENTITE|IDENTITY|CNI/.test(tout) ? 'cni' : /CMU|COUVERTURE MALADIE/.test(tout) ? 'cmu' : /ASSURANCE|MUTUELLE/.test(tout) ? 'assurance' : /PERMIS/.test(tout) ? 'permis' : '';
    const res = {nom:'', prenoms:'', numero:'', naissance:'', type, brut:texte, source:''};
    const m = lireMRZ(lignes); if(m){ Object.assign(res, m, {source:'zone MRZ'}); if(m.mrzType) res.type = m.mrzType; }
    // un libellé peut être n'importe où dans la ligne ; la valeur s'arrête au libellé suivant (« Nom KONE Prénoms Fanta » sur une seule ligne)
    const SUIVANT = /\b(PRENOMS?|GIVEN\s+NAMES?|FIRST\s+NAMES?|DATE|NE\(?E\)?\s+LE|NAISSANCE|SEXE|NATIONALITE|LIEU|N[°O]\b|NUMERO|TAILLE|PROFESSION)\b/;
    const coupe = v => { const c = SUIVANT.exec(sans(v).toUpperCase()); return c ? v.slice(0, c.index) : v; };
    const apres = (re, exclure) => {
      for(let i = 0; i < U.length; i++){ const x = re.exec(U[i]); if(!x) continue;
        let v = lignes[i].slice(x.index + x[0].length).replace(/^[\s:\/\-\.|]+/, ''); v = v.replace(/^(SURNAME|NAME|NAMES|GIVEN NAMES?|FIRST NAMES?)\b[\s:\/\-\.]*/i, '');
        v = propre(coupe(v)); if(v.length < 2 && lignes[i+1] && !exclure.test(U[i+1])) v = propre(coupe(lignes[i+1]));
        if(v.length >= 2) return v; }
      return '';
    };
    const lib = /^(NOM(\s+DE\s+FAMILLE)?|SURNAME|PRENOMS?|GIVEN\s+NAMES?|FIRST\s+NAMES?|DATE|N[°O]\b|NUMERO|SEXE|NATIONALITE|LIEU)/;
    if(!res.nom){ res.nom = apres(/\b(NOM(\s+DE\s+FAMILLE)?|SURNAME)\b/, lib); res.source = res.nom ? 'libellés' : ''; }
    if(!res.prenoms) res.prenoms = apres(/\b(PRENOMS?|GIVEN\s+NAMES?|FIRST\s+NAMES?)\b/, lib);
    if(!res.naissance){
      const re = /(\d{2})\s*[\/\.\- ]\s*(\d{2})\s*[\/\.\- ]\s*(\d{4})/g; let best = '', proche = '';
      U.forEach((u, i) => { let x; re.lastIndex = 0; while((x = re.exec(u))){ const iso = dateISO(x[1], x[2], x[3]); if(!iso) continue; if(!best) best = iso; if(/NAISS|BORN|DOB|NE\(E\)|NEE? LE/.test(u + ' ' + (U[i-1]||''))) proche = proche || iso; } });
      res.naissance = proche || best;
    }
    if(!res.numero){
      for(let i = 0; i < U.length && !res.numero; i++){ if(/(N[°O]\b|NUMERO|CARD\s*NO|ID\s*NO|DOCUMENT)/.test(U[i])){ const x = /\b([A-Z]{0,3}\d{7,14})\b/.exec(U[i] + ' ' + (U[i+1]||'')); if(x) res.numero = x[1]; } }
      if(!res.numero){ const x = /\b((?:CI|CIV)?\d{9,14})\b/.exec(U.join(' ').replace(/\d{2}[\/\.\-]\d{2}[\/\.\-]\d{4}/g, ' ')); if(x) res.numero = x[1]; }
    }
    res.nom = res.nom.toUpperCase(); res.prenoms = titre(res.prenoms);
    return res;
  }
  window.Scan = {ocr, analyser, titre, chargerModule};
})();
