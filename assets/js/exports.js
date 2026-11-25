/* exports.js — exportation des listes et documents : CSV (s'ouvre dans Excel) et impression / PDF.
   Les documents imprimés sont officiels : ils ne portent pas la signature du concepteur. */
(function(){
  'use strict';
  const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const slug = s => (s||'export').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);
  const jour = () => new Date().toISOString().slice(0,10);
  function telecharger(nom, texte, type){
    const u = URL.createObjectURL(new Blob([texte], {type})), a = document.createElement('a');
    a.href = u; a.download = nom; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000);
  }
  /** CSV à séparateur « ; » avec BOM : accents corrects dans Excel. */
  function csv(titre, entetes, lignes){
    const q = v => { const s = String(v==null?'':v); return /[";\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; };
    telecharger(slug(titre)+'-'+jour()+'.csv', '﻿'+[entetes].concat(lignes).map(l => l.map(q).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  }
  const STYLE = '@page{size:A4 landscape;margin:12mm}body{font:12px/1.4 Arial,sans-serif;color:#111;margin:0}h1{font-size:17px;margin:0 0 2px}.sous{color:#555;margin:0 0 10px}table{width:100%;border-collapse:collapse}th{background:#0B2150;color:#fff;text-align:left;padding:5px 7px;font-size:11px}td{padding:5px 7px;border-bottom:1px solid #ccc;vertical-align:top}tr:nth-child(even) td{background:#f6f4ee}.pied{margin-top:10px;color:#666;font-size:10px}.fiche{display:flex;gap:22px;align-items:flex-start}.fiche img{width:150px;height:150px;object-fit:cover;border-radius:12px;border:1px solid #bbb}.fiche .vide{width:150px;height:150px;border-radius:12px;border:1px solid #bbb;display:flex;align-items:center;justify-content:center;font-size:40px;color:#888}.fiche table{width:auto;min-width:420px}.fiche th{width:170px;background:#eef1f8;color:#0B2150}';
  function imprimer(titre, sousTitre, entetes, lignes, corpsLibre){
    const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(f);
    const d = f.contentWindow.document; d.open();
    d.write('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>'+esc(titre)+'</title><style>'+STYLE+'</style></head><body><h1>'+esc(titre)+'</h1><p class="sous">Renouveau Charismatique de Côte d’Ivoire'+(sousTitre?' · '+esc(sousTitre):'')+'</p>'+
      (corpsLibre || '<table><thead><tr>'+entetes.map(h => '<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+lignes.map(l => '<tr>'+l.map(c => '<td>'+esc(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table>')+
      '<p class="pied">Édité le '+new Date().toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})+(lignes && lignes.length ? ' · '+lignes.length+' ligne(s)' : '')+'</p></body></html>');
    d.close();
    const lancer = () => { if(window.Exports && window.Exports.sansImpression) return; try { f.contentWindow.focus(); f.contentWindow.print(); } catch(e){} setTimeout(() => f.remove(), 60000); };
    const imgs = [...d.images]; if(!imgs.length) return setTimeout(lancer, 150);
    let n = imgs.length; const fin = () => { if(--n <= 0) setTimeout(lancer, 100); }; imgs.forEach(i => i.complete ? fin() : (i.onload = i.onerror = fin));
  }
  /** Fiche individuelle imprimable (avec photo). champs = [[libellé, valeur], …] */
  function fiche(titre, photoUrl, initiales, champs){
    const img = photoUrl ? '<img src="'+esc(new URL(photoUrl, location.href).href)+'" alt="">' : '<div class="vide">'+esc(initiales)+'</div>';
    imprimer(titre, 'Fiche individuelle', [], [], '<div class="fiche">'+img+'<table><tbody>'+champs.map(c => '<tr><th>'+esc(c[0])+'</th><td>'+esc(c[1]||'—')+'</td></tr>').join('')+'</tbody></table></div>');
  }
  /** Avant d'imprimer ou d'exporter : cocher les colonnes à faire apparaître (choix mémorisé), avec aperçu.
      o = {cle, titre, sousTitre, colonnes:[{id, nom, defaut, val(element, rang)}], elements, modale} */
  function choisirColonnes(o){
    const memo = ((Base.d.meta.colonnes || {})[o.cle]) || null, voulu = c => memo ? memo.includes(c.id) : c.defaut;
    const v = o.modale('Colonnes à faire apparaître', `<p class="petit" style="margin-top:0">${esc(o.titre)} — ${o.elements.length} ligne(s). Décochez les colonnes à masquer.</p>
      <div class="choix-col">${o.colonnes.map(c => `<label><input type="checkbox" data-col="${c.id}" ${voulu(c) ? 'checked' : ''}> ${esc(c.nom)}</label>`).join('')}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0"><button type="button" class="btn btn-contour btn-s" id="co-tout">Tout cocher</button><button type="button" class="btn btn-contour btn-s" id="co-def">Colonnes habituelles</button></div>
      <div class="petit muet">Aperçu (premières lignes)</div><div class="defile apercu-col" id="co-ap"></div>`,
      '<button class="btn btn-contour" id="co-x">Fermer</button><button class="btn btn-contour" id="co-c">Exporter (Excel)</button><button class="btn btn-rouge" id="co-p">Imprimer / PDF</button>');
    v.querySelector('.modale').classList.add('large');
    const q = s => v.querySelector(s), cases = [...v.querySelectorAll('[data-col]')];
    const caseDe = c => cases.find(k => k.dataset.col === c.id);
    const choisies = () => o.colonnes.filter(c => caseDe(c).checked);
    const valeurs = (cols, l) => l.map((e, i) => cols.map(c => c.val(e, i)));
    const apercu = () => { const cols = choisies(); q('#co-ap').innerHTML = cols.length ? '<table class="tableau"><thead><tr>' + cols.map(c => '<th>' + esc(c.nom) + '</th>').join('') + '</tr></thead><tbody>' + valeurs(cols, o.elements.slice(0, 5)).map(l => '<tr>' + l.map(x => '<td>' + esc(x) + '</td>').join('') + '</tr>').join('') + '</tbody></table>' : '<div class="vide"><b>Aucune colonne cochée</b></div>';
      q('#co-p').disabled = q('#co-c').disabled = !cols.length; };
    const retenir = () => { (Base.d.meta.colonnes = Base.d.meta.colonnes || {})[o.cle] = choisies().map(c => c.id); Base.sauver(); };
    cases.forEach(k => k.onchange = () => { retenir(); apercu(); });
    q('#co-tout').onclick = () => { cases.forEach(k => k.checked = true); retenir(); apercu(); };
    q('#co-def').onclick = () => { o.colonnes.forEach(c => caseDe(c).checked = c.defaut); retenir(); apercu(); };
    q('#co-x').onclick = () => v.remove();
    q('#co-p').onclick = () => { const cols = choisies(); imprimer(o.titre, o.sousTitre, cols.map(c => c.nom), valeurs(cols, o.elements)); };
    q('#co-c').onclick = () => { const cols = choisies(); csv(o.titre, cols.map(c => c.nom), valeurs(cols, o.elements)); };
    apercu();
  }
  window.Exports = {csv, imprimer, fiche, choisirColonnes, sansImpression:false};
})();
