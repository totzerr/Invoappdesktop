import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const path='index.html';
const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('le script intégré reste syntaxiquement valide',()=>{
  const scripts=[...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match=>match[1]).filter(Boolean);
  assert.ok(scripts.length,'la page doit contenir un script applicatif');
  scripts.forEach((script,index)=>assert.doesNotThrow(()=>new vm.Script(script,{filename:path+'#script-'+index})));
});

function extractCore(source){
 const match=source.match(/\/\* DASHBOARD_PROFILE_CORE_START[\s\S]*?\/\* DASHBOARD_PROFILE_CORE_END \*\//);
 assert.ok(match,'le noyau des indicateurs doit être présent');
 return match[0];
}

function createCore(source){
 const catalog=[
  {id:'mojito',n:'Mojito',c:'cCock',k:'drink',pv:10},
  {id:'vin',n:'Vin',c:'cVins',k:'drink',pv:6},
  {id:'burger',n:'Burger',c:'cPlats',k:'food',pv:15}
 ];
 const context={
  Date,Set,Number,Object,String,isNaN,
  st:{mv:[],dashboardIntegrations:{}},
  item(id){return catalog.find(product=>product.id===id)},
  pvMv(movement){const product=catalog.find(item=>item.id===movement.plat);return product?product.pv*movement.qty:0}
 };
 vm.createContext(context);
 vm.runInContext(extractCore(source)+'\nthis.dashboardCore={dateLocaleDashboard,resumeVentesDashboard,sourceCouvertsDashboard,sourceRecommandationsDashboard,sourceBonsNonSaisisDashboard};',context);
 return context;
}

test('le noyau partagé des indicateurs est présent',()=>{
 assert.ok(extractCore(source));
});

 test(path+' calcule le CA, sa répartition et les cocktails depuis les ventes réelles',()=>{
  const context=createCore(source);
  const now=new Date(2026,7,22,14,0,0);
  const today=new Date(2026,7,22,12,0,0).toISOString();
  const yesterday=new Date(2026,7,21,12,0,0).toISOString();
  context.st.mv=[
   {motif:'vente',plat:'mojito',qty:2,ts:today},
   {motif:'vente',plat:'vin',qty:1,ts:today},
   {motif:'vente',plat:'burger',qty:3,ts:today},
   {motif:'vente',plat:'mojito',qty:5,ts:yesterday},
   {motif:'casse',plat:'mojito',qty:1,ts:today}
  ];
  const result=context.dashboardCore.resumeVentesDashboard(now);
  assert.equal(result.ca,71);
  assert.equal(result.liquide,26);
  assert.equal(result.solide,45);
  assert.equal(result.cocktails,2);
  assert.equal(result.nombreVentes,3);
 });

 test(path+' distingue source absente, journée vide, donnée valide et erreur',()=>{
  const context=createCore(source),date='2026-08-22';
  assert.equal(context.dashboardCore.sourceCouvertsDashboard(date).status,'missing');

  context.st.dashboardIntegrations.covers={date:'2026-08-21',midi:10,soir:12};
  assert.equal(context.dashboardCore.sourceCouvertsDashboard(date).status,'empty');

  context.st.dashboardIntegrations.covers={date,midi:34,soir:48};
  assert.deepEqual(
   JSON.parse(JSON.stringify(context.dashboardCore.sourceCouvertsDashboard(date))),
   {status:'ready',midi:34,soir:48,total:82}
  );

  context.st.dashboardIntegrations.covers={date,midi:-1,soir:48};
  assert.equal(context.dashboardCore.sourceCouvertsDashboard(date).status,'error');
 });

 test(path+' valide les contrats des recommandations et des bons non saisis',()=>{
  const context=createCore(source),date='2026-08-22';
  context.st.dashboardIntegrations.recommendedProductIds={date,ids:['mojito','mojito','inconnu']};
  const recommendations=context.dashboardCore.sourceRecommandationsDashboard(date);
  assert.equal(recommendations.status,'ready');
  assert.equal(recommendations.items.length,1);
  assert.equal(recommendations.items[0].id,'mojito');

  context.st.dashboardIntegrations.unsavedPurchaseOrders={date,count:0};
  assert.equal(context.dashboardCore.sourceBonsNonSaisisDashboard(date).status,'ready');
  assert.equal(context.dashboardCore.sourceBonsNonSaisisDashboard(date).count,0);

  context.st.dashboardIntegrations.unsavedPurchaseOrders={date,count:'invalide'};
  assert.equal(context.dashboardCore.sourceBonsNonSaisisDashboard(date).status,'error');
 });

 test(path+' garde le profil métier indépendant des rôles et la vue générale par défaut',()=>{
  const saveProfile=source.match(/async function enregistrerProfilMetier\(id\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.ok(saveProfile);
  assert.doesNotMatch(saveProfile,/\.role\s*=/);
  assert.match(source,/const estResp=\(\)=>\{const p=POSTES\.find\(x=>x\.id===st\.whoId\)/);
  assert.match(source,/if\(!profilId\)\{renderDashboardGeneral\(\);return\}/);
  assert.match(source,/PROFILS_METIER=\[[\s\S]*?id:'barman'[\s\S]*?id:'chef'[\s\S]*?id:'salle'[\s\S]*?id:'gestion'/);
 });
