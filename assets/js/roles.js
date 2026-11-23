/* roles.js — comptes, rôles et périmètres (cahier des charges, §4).
   Chaque utilisateur a UN rôle et, pour les responsables territoriaux, UN périmètre :
   il ne voit que les membres de son diocèse, de son secteur ou de sa paroisse. */
(function(){
  'use strict';
  const MDP_DEMO = 'Renouveau2026@';
  const ROLES = {
    admin:       {nom:'Administrateur national', pages:['accueil','membres','activites','inscriptions','formation','archives','controle','intercession','stats','utilisateurs','ref'], creer:true, modifier:true, supprimer:true, activites:true},
    diocese:     {nom:'Responsable diocésain',   pages:['accueil','membres','activites','stats'], portee:'diocese'},
    secteur:     {nom:'Responsable de secteur',  pages:['accueil','membres','stats'], portee:'secteur'},
    paroisse:    {nom:'Responsable paroissial',  pages:['accueil','membres','stats'], portee:'paroisse'},
    controle:    {nom:'Agent de contrôle',       pages:['controle'], creer:true},
    inscription: {nom:'Agent d’inscription', pages:['inscriptions','membres'], creer:true}
  };
  // Comptes de démonstration (affichés sur l'écran de connexion hors HTTPS, comme GCHFlow)
  const COMPTES_DEMO = [
    {email:'admin@rcci.ci',       nom:'Administrateur national',        role:'admin'},
    {email:'diocese@rcci.ci',     nom:'Responsable diocésain d’Abidjan', role:'diocese',  portee:{diocese:'Abidjan'}},
    {email:'secteur@rcci.ci',     nom:'Responsable du secteur 1',       role:'secteur',  portee:{diocese:'Abidjan', secteur:'Secteur 1 — Cocody'}},
    {email:'paroisse@rcci.ci',    nom:'Responsable de Sainte-Thérèse',  role:'paroisse', portee:{diocese:'Abidjan', paroisse:'Sainte-Thérèse'}},
    {email:'controle@rcci.ci',    nom:'Agent de contrôle',              role:'controle'},
    {email:'inscription@rcci.ci', nom:'Agent d’inscription',       role:'inscription'}
  ];
  async function empreinte(t){
    try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('rcci|'+t)); return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join(''); }
    catch(e){ let h=5381; for(const c of 'rcci|'+t) h=((h<<5)+h+c.charCodeAt(0))>>>0; return 'h'+h; }
  }
  /** Crée les comptes de démonstration manquants (mot de passe commun). */
  async function semer(){
    const d = Base.d; let n = 0;
    for(const c of COMPTES_DEMO){
      if(d.utilisateurs.some(u => u.email === c.email)) continue;
      d.utilisateurs.push({id:Base.uid('uti'), email:c.email, nom:c.nom, role:c.role, portee:c.portee||null, mdp:await empreinte(MDP_DEMO), demo:true, creeLe:new Date().toISOString()});
      n++;
    }
    if(n) Base.sauver();
  }
  async function connexion(email, mdp){
    const u = Base.d.utilisateurs.find(x => x.email.toLowerCase() === (email||'').trim().toLowerCase());
    if(!u || u.mdp !== await empreinte(mdp)) return null;
    return u;
  }
  const role = u => ROLES[u.role];
  const peutPage = (u, p) => role(u).pages.includes(p);
  const peut = (u, a) => !!role(u)[a];
  /** Identifiants de périmètre ; un périmètre introuvable ne donne accès à RIEN. */
  function portee(u){
    const r = role(u); if(!r.portee) return null;
    const p = u.portee || {}, d = Base.d, ABS = '__aucun__';
    const dio = p.diocese ? d.dioceses.find(x => x.nom === p.diocese) : null;
    const sec = p.secteur ? d.secteurs.find(x => x.nom === p.secteur) : null;
    const par = p.paroisse ? d.paroisses.find(x => x.nom === p.paroisse) : null;
    if(r.portee === 'diocese')  return {cle:'dioceseId',  id: dio ? dio.id : ABS};
    if(r.portee === 'secteur')  return {cle:'secteurId',  id: sec ? sec.id : ABS};
    return {cle:'paroisseId', id: par ? par.id : ABS};
  }
  function membresVisibles(u){ const s = portee(u); return s ? Base.d.membres.filter(m => m[s.cle] === s.id) : Base.d.membres; }
  function libellePortee(u){
    const p = u.portee || {}; return [p.diocese, p.secteur, p.paroisse].filter(Boolean).join(' · ');
  }
  window.Roles = {MDP_DEMO, ROLES, COMPTES_DEMO, empreinte, semer, connexion, role, peutPage, peut, portee, membresVisibles, libellePortee};
})();
