/* scan.js — lecture d'une pièce d'identité photographiée (téléphone ou appareil photo).
   Reconnaissance de texte (OCR) faite DANS le navigateur : l'image n'est envoyée nulle part et n'est jamais
   conservée. Le module de lecture (Tesseract.js, langue française) est chargé une seule fois depuis Internet.
   La pièce est lue PLUSIEURS FOIS avec des traitements d'image différents (les fonds colorés des cartes gênent
   la lecture) ; les résultats sont comparés champ par champ. Les champs lus sont montrés à l'agent, qui peut
   les corriger (ou toucher les mots lus) avant de valider.
   Sources, de la plus sûre à la moins sûre : zone « MRZ » (passeport, dos de la CNI), libellés (Nom,
   Prénoms, N°), position sur la carte, noms de famille déjà connus du registre. */
(function(){
  'use strict';
  const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  const sans = s => (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const maj = s => sans(s).toUpperCase().replace(/[’`´]/g, "'");
  let promesse = null, ouvrier = null, repos = null, suivi = null;

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

  /* ----------------------------------------------------------------- préparation de l'image */
  const toile = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  /** Image de travail : environ 2000 px de large (les petites photos sont agrandies : l'OCR lit mal les petits caractères). */
  async function charger(fichier){
    const bmp = await createImageBitmap(fichier), grand = Math.max(bmp.width, bmp.height);
    const k = grand > 2200 ? 2200 / grand : grand < 1700 ? Math.min(3, 1700 / grand) : 1;
    const c = toile(bmp.width * k, bmp.height * k), g = c.getContext('2d', {willReadFrequently:true});
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, c.width, c.height); return c;
  }
  /** Niveaux de gris. mode 'gris' : luminance ; 'max' : canal le plus clair (efface les fonds colorés, garde le texte noir). */
  function gris(source, mode){
    const w = source.width, h = source.height, p = source.getContext('2d', {willReadFrequently:true}).getImageData(0, 0, w, h).data, t = new Uint8ClampedArray(w * h);
    for(let i = 0, j = 0; j < t.length; i += 4, j++) t[j] = mode === 'max' ? Math.max(p[i], p[i+1], p[i+2]) : (p[i]*.299 + p[i+1]*.587 + p[i+2]*.114);
    // contraste étiré entre les 1 % et 99 % (un reflet ou une ombre isolée ne fausse plus le réglage)
    const histo = new Uint32Array(256); for(let j = 0; j < t.length; j++) histo[t[j]]++;
    let bas = 0, haut = 255, s = 0; while(bas < 254 && (s += histo[bas]) < t.length * .01) bas++; s = 0; while(haut > bas + 1 && (s += histo[haut]) < t.length * .01) haut--;
    const e = 255 / Math.max(1, haut - bas); for(let j = 0; j < t.length; j++) t[j] = (t[j] - bas) * e;
    return {t, w, h};
  }
  /** Netteté (masque flou léger). */
  function net(g){
    const {t, w, h} = g, o = new Uint8ClampedArray(t);
    for(let y = 1; y < h - 1; y++) for(let x = 1, i = y * w + 1; x < w - 1; x++, i++) o[i] = t[i] * 3 - (t[i-1] + t[i+1] + t[i-w] + t[i+w]) / 2;
    return {t:o, w, h};
  }
  /** Seuil adaptatif : chaque point est comparé à la moyenne de son voisinage (ombres, fonds de sécurité). */
  function seuil(g){
    const {t, w, h} = g, r = Math.max(8, Math.round(w / 70)), S = new Float64Array((w + 1) * (h + 1)), o = new Uint8ClampedArray(w * h);
    for(let y = 0; y < h; y++){ let l = 0; for(let x = 0; x < w; x++){ l += t[y * w + x]; S[(y + 1) * (w + 1) + x + 1] = S[y * (w + 1) + x + 1] + l; } }
    for(let y = 0; y < h; y++){ const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for(let x = 0; x < w; x++){ const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), n = (x1 - x0) * (y1 - y0);
        const m = (S[y1 * (w + 1) + x1] - S[y0 * (w + 1) + x1] - S[y1 * (w + 1) + x0] + S[y0 * (w + 1) + x0]) / n;
        o[y * w + x] = t[y * w + x] < m * .86 - 4 ? 0 : 255; } }
    return {t:o, w, h};
  }
  function enToile(g){
    const c = toile(g.w, g.h), x = c.getContext('2d'), im = x.createImageData(g.w, g.h), p = im.data;
    for(let i = 0, j = 0; j < g.t.length; i += 4, j++){ p[i] = p[i+1] = p[i+2] = g.t[j]; p[i+3] = 255; }
    x.putImageData(im, 0, 0); return c;
  }

  /* ----------------------------------------------------------------- moteur de lecture */
  async function moteur(){
    await chargerModule(); clearTimeout(repos);
    if(!ouvrier) ouvrier = await Tesseract.createWorker('fra', 1, {logger: m => { if(suivi && m.status === 'recognizing text') suivi(m.progress); }});
    return ouvrier;
  }
  function liberer(){ clearTimeout(repos); repos = setTimeout(() => { if(ouvrier){ const o = ouvrier; ouvrier = null; o.terminate().catch(() => {}); } }, 180000); }
  async function reconnaitre(img, psm){
    const w = await moteur(); await w.setParameters({tessedit_pageseg_mode:String(psm), preserve_interword_spaces:'1'});
    const r = await w.recognize(img); return r.data.text || '';
  }

  /* ----------------------------------------------------------------- analyse du texte lu */
  const propre = v => (v||'').replace(/[’`´]/g, "'").replace(/[^A-Za-zÀ-ÿ'\- ]/g, ' ').split(/\s+/).map(m => m.replace(/^['\-]+|['\-]+$/g, '')).filter(Boolean).join(' ');
  const titre = s => s.toLowerCase().replace(/(^|[\s'’\-])([a-zà-ÿ])/g, (_, a, b) => a + b.toUpperCase());
  function dateISO(j, m, a){ j = +j; m = +m; a = +a; return (a >= 1920 && a <= 2020 && m >= 1 && m <= 12 && j >= 1 && j <= 31) ? a+'-'+String(m).padStart(2,'0')+'-'+String(j).padStart(2,'0') : ''; }
  // mots imprimés sur les pièces : ce ne sont jamais des noms de personne
  const MENTIONS = new Set(('REPUBLIQUE REPUBLIC COTE IVOIRE DIVOIRE UNION DISCIPLINE TRAVAIL CARTE NATIONALE NATIONAL IDENTITE IDENTITY CARD CNI CEDEAO ECOWAS PASSEPORT PASSPORT PERMIS CONDUIRE ASSURANCE MALADIE COUVERTURE UNIVERSELLE CMU MUTUELLE '
    + 'NOM NOMS SURNAME NAME NAMES PRENOM PRENOMS GIVEN FIRST DATE NAISSANCE BIRTH LIEU PLACE SEXE SEX NATIONALITE NATIONALITY IVOIRIENNE IVOIRIEN TAILLE HEIGHT PROFESSION DOMICILE ADRESSE SIGNATURE EXPIRATION EXPIRY DELIVRANCE DELIVREE DELIVRE ISSUE VALABLE JUSQU NUMERO NNI IMMATRICULATION '
    + 'DE LA LE DU DES AU ET OF THE OFFICE ETAT CIVIL IDENTIFICATION ONECI TITULAIRE HOLDER TYPE CODE PAYS COUNTRY NEE DOCUMENT MINISTERE INTERIEUR SECURITE PERSONNELLE PERSONNEL CIV EPOUSE VEUVE USAGE').split(/\s+/));
  const estMention = w => MENTIONS.has(maj(w).replace(/[^A-Z]/g, ''));
  /** Une ligne ressemble-t-elle à un nom de personne ? Retourne la valeur nettoyée, sinon ''. */
  function nomPropre(v){
    let s = (v||'').replace(/\b([A-Za-zÀ-ÿ]*)[0158]([A-Za-zÀ-ÿ]+)/g, m => m.replace(/0/g, 'O').replace(/1/g, 'I').replace(/5/g, 'S').replace(/8/g, 'B'));
    let mots = propre(s).split(' ').filter(Boolean);
    if(mots.some(estMention)) mots = mots.filter(m => !estMention(m));
    while(mots.length && mots[0].replace(/['\-]/g, '').length < 2) mots.shift();
    while(mots.length && mots[mots.length-1].replace(/['\-]/g, '').length < 2) mots.pop();
    // petits fragments en minuscules à côté de mots en capitales : bruit de lecture
    if(mots.some(m => m.length > 2 && m === m.toUpperCase())) mots = mots.filter(m => !(m.length <= 3 && m === m.toLowerCase()));
    const r = mots.join(' '), lettres = r.replace(/[^A-Za-zÀ-ÿ]/g, '');
    return (lettres.length >= 2 && mots.length <= 7 && /[AEIOUYaeiouyÀ-ÿ]/.test(lettres)) ? r : '';
  }
  const RE_PRENOM = /\b(PR[EC]?[NM][O0QD][MNH]?S?(?:\s*\(\s*S\s*\))?|PRENOM\S*|PRFNOM\S*|GIVEN\s*NAMES?|FIRST\s*NAMES?)(?![A-Z])/;
  const RE_NOM = /(?:^|[^A-Z])(N[O0Q][MNH]S?(?:\s*\(\s*S\s*\))?(?:\s*DE\s*FAMILLE)?|SURNAME|NORN|MOM)(?![A-Z])/;
  const RE_AUTRE = /\b(DATE|NE\(?E\)?\s+LE|NAISSANCE|SEXE|NATIONALITE|LIEU|NUMERO|TAILLE|PROFESSION|DOMICILE|EXPIRATION|SIGNATURE)\b|N[°º]/;

  function lireMRZ(lignes){
    const L = lignes.map(l => l.replace(/\s+/g, '').toUpperCase().replace(/[«‹≪]/g, '<<').replace(/[^A-Z0-9<]/g, '')).filter(l => l.length >= 20 && l.includes('<'));
    if(!L.length) return null;
    const r = {nom:'', prenoms:'', numero:'', naissance:'', mrzType:''};
    const ln = L.find(l => /[A-Z]<<[A-Z]/.test(l) && (l.match(/\d/g)||[]).length <= 2);
    if(ln){
      let brut = ln.replace(/0/g, 'O').replace(/1/g, 'I'); const p = /^P[A-Z<]?([A-Z]{3})(.*)$/.exec(brut); if(p && ln.startsWith('P<')){ brut = p[2]; r.mrzType = 'passeport'; }
      const parts = brut.split('<<').filter(Boolean);
      const nettoie = s => propre((s||'').replace(/</g, ' ')).split(' ').filter(m => m.length > 1 && !/^[KCLX]{2,}$/.test(m)).join(' ');
      r.nom = nettoie(parts[0]); r.prenoms = nettoie(parts[1]);
    }
    const chiffres = s => s.replace(/[OQD]/g, '0').replace(/[IL]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2');
    const annee = y => y > (new Date().getFullYear() % 100) ? 1900 + y : 2000 + y;
    L.forEach(l => {
      const td1 = /^I[A-Z<]CIV([A-Z0-9<]{9,12})/.exec(l);                                  // dos de la CNI : numéro de la carte
      if(td1 && !r.numero){ const n = td1[1].split('<')[0]; r.numero = n.startsWith('CI') || n.startsWith('C1') ? 'CI' + chiffres(n.slice(2)) : n; }
      const t3 = /^([A-Z0-9<]{9})[0-9<][A-Z]{3}(\d{6})/.exec(l);                            // passeport, ligne 2
      if(t3){ r.numero = t3[1].replace(/</g, ''); r.mrzType = 'passeport'; r.naissance = dateISO(t3[2].slice(4,6), t3[2].slice(2,4), annee(+t3[2].slice(0,2))); }
      const d1 = /^(\d{6})\d[MF<]\d{6}/.exec(l);                                            // dos de la CNI, ligne 2 : naissance
      if(d1 && !r.naissance) r.naissance = dateISO(d1[1].slice(4,6), d1[1].slice(2,4), annee(+d1[1].slice(0,2)));
    });
    return (r.nom || r.numero) ? r : null;
  }

  function numeros(U){
    const res = [], tout = U.join('\n'), ch = s => s.replace(/\s/g, '').replace(/[OQD]/g, '0').replace(/[IL|]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2');
    let x; const ci = /(?:^|[^A-Z])C\s?[I1L|]\s?((?:[0-9OQDILSBZ|]\s?){8,11})(?![A-Z0-9])/g;      // carte nationale ivoirienne : CI + chiffres
    while((x = ci.exec(tout))){ const n = ch(x[1]); if(/^\d{8,11}$/.test(n)) res.push({v:'CI' + n, p:9}); }
    for(let i = 0; i < U.length; i++){
      if(/(N[°º]|\bNO\b|\bN\s?\.|NUMERO|CARD\s*NO|ID\s*NO|IMMATRICULATION|\bNNI\b|PERMIS\s*N)/.test(U[i])){
        const z = (U[i] + ' ' + (U[i+1]||'')).replace(/\d{2}\s*[\/\.\-]\s*\d{2}\s*[\/\.\-]\s*\d{4}/g, ' ');
        const y = /(?:^|[^A-Z0-9])([A-Z]{0,3}[\- ]?\d(?:[\d \-]{5,16})\d)(?![A-Z0-9])/.exec(z);
        if(y){ const n = y[1].replace(/[ \-]/g, ''); if(n.length >= 7 && n.length <= 16) res.push({v:n, p:/\bNNI\b/.test(U[i]) ? 3 : 6}); }
      }
    }
    const pp = /\b(\d{2}[A-Z]{2}\d{5}|[A-Z]{1,2}\d{7})\b/g; while((x = pp.exec(tout))) res.push({v:x[1], p:5});
    const lg = /\b(\d{9,14})\b/g, sansDates = tout.replace(/\d{2}[\/\.\-]\d{2}[\/\.\-]\d{4}/g, ' '); while((x = lg.exec(sansDates))) res.push({v:x[1], p:2});
    return res;
  }

  /** Analyse un texte lu. connus = Set de noms de famille (en majuscules sans accents) déjà au registre.
      Retourne {champs…, cand:{nom:[{v,p}], prenoms:[…], numero:[…], naissance:[…]}} (p = poids de la source). */
  function analyser(texte, connus){
    const lignes = (texte||'').split(/\r?\n/).map(l => l.trim()).filter(Boolean), U = lignes.map(maj), tout = U.join(' ');
    const type = /PASSEPORT|PASSPORT/.test(tout) ? 'passeport' : /CARTE NATIONALE|IDENTITE|IDENTITY|\bCNI\b|<CIV/.test(tout) ? 'cni' : /CMU|COUVERTURE MALADIE/.test(tout) ? 'cmu' : /ASSURANCE|MUTUELLE/.test(tout) ? 'assurance' : /PERMIS/.test(tout) ? 'permis' : '';
    const cand = {nom:[], prenoms:[], numero:[], naissance:[]}, ajoute = (k, v, p) => { if(v) cand[k].push({v, p}); };
    const m = lireMRZ(lignes); let mrzType = '';
    const mrzType_ = x => x.mrzType === 'passeport' ? 10 : 8;          // dos de la CNI : le numéro imprimé au recto prime
    if(m){ ajoute('nom', m.nom, 10); ajoute('prenoms', m.prenoms, 9); ajoute('numero', m.numero, mrzType_(m)); ajoute('naissance', m.naissance, 10); mrzType = m.mrzType; }
    const coupe = v => { const u = maj(v); let k = u.length; [RE_AUTRE, RE_PRENOM, RE_NOM].forEach(re => { const c = re.exec(u); if(c && c.index < k) k = c.index; }); return v.slice(0, k); };
    /** valeur d'un libellé : à droite sur la même ligne, sinon sur l'une des deux lignes suivantes */
    const valeur = (i, fin) => {
      let reste = lignes[i].slice(fin).replace(/^[\s:\/\-\.|\[\]\(\)]+/, '').replace(/^(\(?S\)?\b)?[\s:\/]*(SURNAME|NAMES?|GIVEN\s+NAMES?|FIRST\s+NAMES?|PR[EÉ]NOMS?)\b[\s:\/\-\.]*/i, '');
      let v = nomPropre(coupe(reste)); if(v && v.replace(/[^A-Za-zÀ-ÿ]/g,'').length >= 3) return {v, p:6};
      for(let k = 1; k <= 2 && lignes[i+k]; k++){ const u = U[i+k]; if(RE_PRENOM.test(u) || RE_NOM.test(u) || RE_AUTRE.test(u)) break; const w = nomPropre(lignes[i+k]); if(w) return {v:w, p:6 - k}; }
      return v ? {v, p:2} : null;
    };
    let lignePrenom = -1;
    U.forEach((u, i) => {
      const p = RE_PRENOM.exec(u);
      if(p){ if(lignePrenom < 0) lignePrenom = i; const r = valeur(i, p.index + p[0].length); if(r) ajoute('prenoms', r.v, r.p); }
      const sansPrenom = p ? u.slice(0, p.index) + ' '.repeat(p[0].length) + u.slice(p.index + p[0].length) : u, n = RE_NOM.exec(sansPrenom);
      if(n){ const r = valeur(i, n.index + n[0].length); if(r) ajoute('nom', r.v, r.p); }
    });
    // libellé « Nom » illisible : le nom de famille est imprimé juste au-dessus du libellé « Prénoms »
    if(lignePrenom > 0){ for(let k = 1; k <= 3 && lignePrenom - k >= 0; k++){ const i = lignePrenom - k; if(RE_AUTRE.test(U[i])) continue; const mots = nomPropre(lignes[i].replace(RE_NOM, ' ')).split(' ').filter(x => x.length >= 2 && x === x.toUpperCase()); if(mots.length && mots.join('').length >= 3){ ajoute('nom', mots.join(' '), 4 - k * .5); break; } } }
    // et les prénoms juste au-dessous du nom quand leur libellé est illisible
    if(!cand.prenoms.length){ const n = cand.nom[0]; if(n){ const i = lignes.findIndex(l => l.includes(n.v)); if(i >= 0) for(let k = 1; k <= 3 && lignes[i+k]; k++){ if(RE_AUTRE.test(U[i+k])) continue; const w = nomPropre(lignes[i+k]); if(w && w.length >= 3){ ajoute('prenoms', w, 2); break; } } } }
    // libellés illisibles (petits caractères flous) : sur la carte, le nom puis les prénoms sont les deux lignes en
    // capitales situées entre le numéro (ou le titre) et la date de naissance
    if(!cand.nom.length || !cand.prenoms.length){
      const dn = U.findIndex(u => /\d{2}\s*[\/\.\-]\s*\d{2}\s*[\/\.\-]\s*\d{4}/.test(u));
      if(dn > 1){
        let debut = -1; for(let i = dn - 1; i >= 0 && debut < 0; i--) if(/CARTE|IDENTIT|PASSEPORT|REPUBLIQUE|C\s?[I1]\s?\d{6}/.test(U[i])) debut = i;
        if(debut >= 0){
          const noms = lignes.slice(debut + 1, dn).map(l => nomPropre(l)).filter(v => v && v === v.toUpperCase() && v.split(' ').some(m => m.length >= 3));
          if(noms.length === 2){ ajoute('nom', noms[0], 3.5); ajoute('prenoms', noms[1], 3.5); }
        }
      }
    }
    // permis de conduire : les rubriques sont numérotées (1. nom, 2. prénoms)
    if(type === 'permis') lignes.forEach(l => { const x = /^\s*([12])\s*[\.\)]\s*(.+)$/.exec(l); if(x && !/\d{2}[\/\.\-]\d{2}/.test(x[2])){ const w = nomPropre(x[2]); if(w) ajoute(x[1] === '1' ? 'nom' : 'prenoms', w, 5); } });
    // noms de famille déjà connus du registre, repérés n'importe où sur la carte
    if(connus && connus.size) lignes.forEach(l => { const mots = nomPropre(l).split(' '); mots.forEach(w => { const k = maj(w); if(k.length >= 3 && connus.has(k) && w === w.toUpperCase()) ajoute('nom', w, 2.5); }); });
    numeros(U).forEach(n => ajoute('numero', n.v, n.p));
    const re = /(\d{2})\s*[\/\.\- ]\s*(\d{2})\s*[\/\.\- ]\s*(\d{4})/g;
    U.forEach((u, i) => { let x; re.lastIndex = 0; while((x = re.exec(u))){ const iso = dateISO(x[1], x[2], x[3]); if(!iso) continue; const autour = u + ' ' + (U[i-1]||''); if(/EXPIR|DELIVR|ISSUE|VALAB/.test(autour)) continue; ajoute('naissance', iso, /NAISS|BIRTH|BORN|DOB|NE\(E\)|NEE? LE/.test(autour) ? 6 : 2); } });
    const res = fusion([{cand, type:mrzType || type, texte}], connus); return res;
  }

  const cleDe = (k, v) => k === 'numero' || k === 'naissance' ? v : maj(v).replace(/[^A-Z]/g, '');
  /** Compare les lectures : pour chaque champ, la valeur la mieux soutenue (poids des sources, répétitions, registre). */
  function fusion(lectures, connus){
    const res = {nom:'', prenoms:'', numero:'', naissance:'', type:'', source:'', fiable:{}, cand:{nom:[], prenoms:[], numero:[], naissance:[]}, brut:lectures.map(l => l.texte || l.brut || '').join('\n'), types:[]};
    lectures.forEach(l => { Object.keys(res.cand).forEach(k => res.cand[k].push(...((l.cand||{})[k] || []))); if(l.type) res.types.push(l.type); (l.types||[]).forEach(t => res.types.push(t)); });
    res.type = res.types.sort((a, b) => res.types.filter(x => x === b).length - res.types.filter(x => x === a).length)[0] || '';
    Object.keys(res.cand).forEach(k => {
      const g = new Map();
      res.cand[k].forEach(c => { const id = cleDe(k, c.v); if(!id) return; let e = g.get(id); if(!e){ e = {v:c.v, total:0, max:0, n:0}; g.set(id, e); } e.total += c.p; e.n++; if(c.p > e.max){ e.max = c.p; e.v = c.v; } });
      const L = [...g.entries()].map(([id, e]) => { let s = e.max * 3 + e.total; if(k === 'nom' && connus){ const mots = maj(e.v).split(/\s+/); if(mots.some(m => connus.has(m))) s += 8; } return {...e, s}; }).sort((a, b) => b.s - a.s);
      if(L.length){ res[k] = L[0].v; res.fiable[k] = L[0].max >= 9 || (L[0].max >= 4 && L[0].n >= 2); if(L[0].max >= 9) res.source = 'zone MRZ'; }
    });
    // le nom ne doit pas répéter un prénom
    if(res.nom && res.prenoms){ const pr = maj(res.prenoms).split(/\s+/), n = res.nom.split(/\s+/), r = n.filter(m => !pr.includes(maj(m))); if(r.length && r.length < n.length) res.nom = r.join(' '); }
    res.nom = res.nom.toUpperCase(); res.prenoms = titre(res.prenoms); if(!res.source && res.nom) res.source = 'libellés';
    return res;
  }
  /** Mots lus sur la carte (pour que l'agent puisse les toucher quand un champ manque). */
  function motsLus(texte){
    const vus = new Map();
    (texte||'').split(/\r?\n/).forEach(l => nomPropre(l).split(' ').forEach(w => { const k = maj(w).replace(/[^A-Z]/g, ''); if(k.length < 3 || w.split(/['\-]/).some(estMention)) return; const e = vus.get(k) || {w, n:0, maj:w === w.toUpperCase()}; e.n++; vus.set(k, e); }));
    return [...vus.values()].sort((a, b) => (b.maj - a.maj) || b.n - a.n).slice(0, 24).map(e => e.w);
  }

  /** Lecture complète d'une pièce. options = {connus:Set, progression(pourcent|null, étape)} */
  async function lire(fichier, options){
    const o = options || {}, prog = o.progression || (() => {});
    prog(null); await moteur();
    const base = await charger(fichier); let g1 = null, g2 = null;
    const G = () => g1 || (g1 = gris(base, 'gris')), M = () => g2 || (g2 = gris(base, 'max'));
    const passes = [
      {nom:'lecture directe', psm:3, img:() => enToile(net(G()))},
      {nom:'fond coloré effacé', psm:3, img:() => enToile(M())},
      {nom:'contraste renforcé', psm:11, img:() => enToile(seuil(M()))},
      {nom:'bloc de texte', psm:6, img:() => enToile(net(M()))},
      {nom:'zone basse', psm:6, img:() => { const c = enToile(G()), h = Math.round(c.height * .42), z = toile(c.width * 1.25, h * 1.25); z.getContext('2d').drawImage(c, 0, c.height - h, c.width, h, 0, 0, z.width, z.height); return z; }}
    ];
    const lectures = []; let res = null;
    try {
      for(let i = 0; i < passes.length; i++){
        suivi = p => prog(Math.round((i + p) / passes.length * 100), passes[i].nom);
        const texte = await reconnaitre(passes[i].img(), passes[i].psm), a = analyser(texte, o.connus);
        lectures.push({cand:a.cand, types:a.types, texte}); res = fusion(lectures, o.connus);
        const besoinNum = ['cni', 'passeport', ''].includes(res.type);
        if(i >= 1 && res.fiable.nom && res.fiable.prenoms && (!besoinNum || res.fiable.numero)) break;      // tout est concordant : inutile d'insister
        if(i >= 3 && res.nom && res.prenoms && (!besoinNum || res.numero)) break;
      }
    } finally { suivi = null; liberer(); }
    res.mots = motsLus(res.brut); res.passes = lectures.length;
    const v = toile(Math.min(900, base.width), Math.min(900, base.width) * base.height / base.width); v.getContext('2d').drawImage(base, 0, 0, v.width, v.height); res.apercu = v.toDataURL('image/jpeg', .8);
    prog(100, 'terminé'); return res;
  }
  async function ocr(fichier, progression){ const r = await lire(fichier, {progression}); return r.brut; }
  window.Scan = {lire, ocr, analyser, fusion, motsLus, titre, chargerModule};
})();
