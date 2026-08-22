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
  {id:'burger',n:'Burger',c:'cPlats',k:'food',pv:15},
  {id:'biere',n:'Bière',c:'cBieres',k:'drink',pv:5},
  {id:'soft',n:'Soft',c:'cSofts',k:'drink',pv:4},
  {id:'cafe',n:'Café',c:'cCafe',k:'drink',pv:2},
  {id:'vVin',n:'Verre de vin',c:'cVins',k:'drink',pv:6},
  {id:'btVin',n:'Bouteille de vin',c:'cVins',k:'drink',pv:25},
  {id:'vZacapa',n:'Zacapa',c:'cAlc',k:'drink',pv:13},
  {id:'vRicard',n:'Ricard',c:'cAlc',k:'drink',pv:4}
 ];
 const context={
  Date,Set,Number,Object,String,isNaN,
  st:{mv:[],dashboardIntegrations:{}},
  item(id){return catalog.find(product=>product.id===id)},
  pvMv(movement){const product=catalog.find(item=>item.id===movement.plat);return product?product.pv*movement.qty:0}
 };
 vm.createContext(context);
 vm.runInContext(extractCore(source)+'\nthis.dashboardCore={dateLocaleDashboard,resumeVentesDashboard,sourceCouvertsDashboard,sourceRecommandationsDashboard,sourceBonsNonSaisisDashboard,resumePerformanceSemaineDashboard,resumeBoissonsSemaineDashboard,categorieBoissonDashboard};',context);
 return context;
}

function extractAdministrationCore(source){
 const match=source.match(/\/\* ADMINISTRATION_CORE_START[\s\S]*?\/\* ADMINISTRATION_CORE_END \*\//);
 assert.ok(match,'le noyau Administration doit être présent');
 return match[0];
}

function createAdministrationCore(source){
 let id=0;
 const empty=()=>({
  version:1,documents:[],invoices:[],anomalies:[],auditLog:[],contracts:[],obligations:[],deadlines:[],
  approvalWorkflows:[],approvalRequests:[],expenseCategories:[],accountingCategories:[],cashFlowForecasts:[],
  settings:{taxRates:[5.5,10,20],contractAlertDays:[90,60,30,7],approvalRules:[],integrations:{}}
 });
 const context={
  Date,Set,Number,Object,String,Array,Math,isNaN,
  session:{etabId:'etab-a'},
  st:{who:'Gestion',administration:empty()},
  administrationVierge:empty,
  num(value){const n=parseFloat(String(value).replace(',','.'));return Number.isNaN(n)?0:n},
  fmt(value){return (Math.round(value*100)/100).toFixed(2).replace('.',',')},
  uid(prefix){id+=1;return prefix+'_'+id}
 };
 vm.createContext(context);
 vm.runInContext(extractAdministrationCore(source)+'\nthis.adminCore={adminDateISO,adminDiffJours,adminStatutFacture,adminResume,adminAlertes,adminAssistant,adminDansEtablissement,adminConstruireFacture,adminAppliquerStatutFacture};',context);
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

 test(path+' calcule le CA hebdomadaire et la comparaison depuis la logique partagée',()=>{
  const context=createCore(source),now=new Date(2026,7,22,14,0,0);
  context.st.mv=[
   {motif:'vente',plat:'mojito',qty:2,ts:new Date(2026,7,17,12).toISOString()},
   {motif:'vente',plat:'burger',qty:1,ts:new Date(2026,7,20,12).toISOString()},
   {motif:'vente',plat:'biere',qty:1,ts:new Date(2026,7,12,12).toISOString()},
   {motif:'casse',plat:'mojito',qty:8,ts:new Date(2026,7,18,12).toISOString()}
  ];
  const result=context.dashboardCore.resumePerformanceSemaineDashboard(now);
  assert.equal(result.ca,35);
  assert.equal(result.caPrecedent,5);
  assert.equal(result.ventes.length,2);
  assert.equal(result.ventesPrecedentes.length,1);
 });

 test(path+' compte les boissons vendues par chacune des huit catégories demandées',()=>{
  const context=createCore(source),now=new Date(2026,7,22,14,0,0),current=new Date(2026,7,19,12).toISOString();
  context.st.mv=[
   {motif:'vente',plat:'biere',qty:1,ts:current},{motif:'vente',plat:'mojito',qty:2,ts:current},
   {motif:'vente',plat:'soft',qty:3,ts:current},{motif:'vente',plat:'cafe',qty:4,ts:current},
   {motif:'vente',plat:'vVin',qty:5,ts:current},{motif:'vente',plat:'btVin',qty:6,ts:current},
   {motif:'vente',plat:'vZacapa',qty:7,ts:current},{motif:'vente',plat:'vRicard',qty:8,ts:current},
   {motif:'vente',plat:'burger',qty:9,ts:current},
   {motif:'vente',plat:'biere',qty:10,ts:new Date(2026,7,12,12).toISOString()},
   {motif:'casse',plat:'biere',qty:11,ts:current}
  ];
  const result=context.dashboardCore.resumeBoissonsSemaineDashboard(now);
  assert.equal(result.total,36);
  assert.deepEqual(JSON.parse(JSON.stringify(result.categories)),{bieres:1,cocktails:2,softs:3,chaudes:4,vinsVerres:5,vinsBouteilles:6,digestifs:7,aperitifs:8});
 });

 test(path+' synchronise le tableau de bord avec la vue choisie sans modifier les rôles',()=>{
  const saveProfile=source.match(/async function enregistrerProfilMetier\(id\)\{[\s\S]*?\n\}/)?.[0]||'';
  const syncProfile=source.match(/async function synchroniserProfilMetierAvecVue\(id\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.ok(saveProfile);
  assert.ok(syncProfile);
  assert.doesNotMatch(saveProfile,/\.role\s*=/);
  assert.doesNotMatch(syncProfile,/\.role\s*=/);
  assert.match(source,/const estResp=\(\)=>\{const p=POSTES\.find\(x=>x\.id===st\.whoId\)/);
  assert.match(source,/return PROFILS_METIER_IDS\.includes\(id\)\?id:profilMetierDepuisVue\(st\.whoId\)/);
  assert.match(source,/await synchroniserProfilMetierAvecVue\(p\.id\);await save\(\);closeModal\(\);renderAll\(\)/);
  assert.match(source,/profilId==='barman'\?blocBoissonsHebdomadaireDashboard\(maintenant\):blocPerformanceHebdomadaireDashboard\(maintenant\)/);
  assert.match(source,/profile-dashboard dashboard-new/);
 assert.match(source,/PROFILS_METIER=\[[\s\S]*?id:'barman'[\s\S]*?id:'chef'[\s\S]*?id:'salle'[\s\S]*?id:'gestion'/);
 });

test(path+' calcule les retards, échéances et montants sans mélanger les établissements',()=>{
 const context=createAdministrationCore(source),now=new Date(2026,7,22,12);
 context.st.administration.invoices=[
  {id:'f1',establishmentId:'etab-a',supplier:'Metro',status:'a_payer',dueDate:'2026-08-20',amountTTC:3240,taxAmount:540},
  {id:'f2',establishmentId:'etab-a',supplier:'France Boissons',status:'a_payer',dueDate:'2026-08-28',amountTTC:1000,taxAmount:100},
  {id:'f3',establishmentId:'etab-a',supplier:'Payée',status:'payee',dueDate:'2026-08-01',amountTTC:500,taxAmount:50},
  {id:'f4',establishmentId:'etab-b',supplier:'Hors périmètre',status:'a_payer',dueDate:'2026-08-01',amountTTC:9999,taxAmount:999}
 ];
 context.st.administration.documents=[
  {id:'d1',establishmentId:'etab-a',processingStatus:'needs_review'},
  {id:'d2',establishmentId:'etab-b',processingStatus:'error'}
 ];
 const result=context.adminCore.adminResume(now);
 assert.equal(result.invoicesToPay,2);
 assert.equal(result.totalToPay,4240);
 assert.equal(result.overdueCount,1);
 assert.equal(result.overdueAmount,3240);
 assert.equal(result.deadlines30,1);
 assert.equal(result.documentsAction,1);
 assert.equal(result.deductibleTax,690);
});

test(path+' détecte une facture dupliquée et produit des actions déterministes',()=>{
 const context=createAdministrationCore(source),now=new Date(2026,7,22,12);
 context.st.administration.invoices=[
  {id:'f1',establishmentId:'etab-a',supplier:'Metro',invoiceNumber:'M-42',status:'a_payer',dueDate:'2026-08-21',amountTTC:120},
  {id:'f2',establishmentId:'etab-a',supplier:'Metro',invoiceNumber:'M-42',status:'a_verifier',dueDate:'2026-08-30',amountTTC:120},
  {id:'f3',establishmentId:'etab-b',supplier:'Autre',invoiceNumber:'X',status:'a_payer',dueDate:'2026-08-01',amountTTC:900}
 ];
 const alerts=context.adminCore.adminAlertes(now);
 assert.equal(alerts.filter(alert=>alert.title==='Facture potentiellement dupliquée').length,1);
 assert.ok(alerts.some(alert=>alert.title==='Facture en retard'));
 assert.ok(!alerts.some(alert=>alert.description.includes('Autre')));
 const assistant=context.adminCore.adminAssistant(now);
 assert.ok(assistant.some(line=>line.includes('potentiellement dupliquée')));
});

test(path+' construit, modifie et paie une facture avec le service partagé',()=>{
 const context=createAdministrationCore(source),now=new Date(2026,7,22,12);
 const invoice=context.adminCore.adminConstruireFacture({
  supplier:' Metro ',invoiceNumber:' A-1 ',documentDate:'2026-08-22',dueDate:'2026-09-21',
  amountHT:'100,00',taxAmount:'20',amountTTC:'',status:'a_payer',notes:' Test '
 },null,now);
 assert.equal(invoice.supplier,'Metro');
 assert.equal(invoice.amountTTC,120);
 assert.equal(invoice.establishmentId,'etab-a');
 const modified=context.adminCore.adminConstruireFacture({...invoice,amountHT:150,taxAmount:30,amountTTC:180,status:'a_valider'},invoice,new Date(2026,7,23,12));
 assert.equal(modified.id,invoice.id);
 assert.equal(modified.createdAt,invoice.createdAt);
 assert.equal(modified.amountTTC,180);
 assert.equal(context.adminCore.adminAppliquerStatutFacture(modified,'payee',new Date(2026,7,24,12)),true);
 assert.equal(modified.status,'payee');
 assert.equal(modified.paymentDate,'2026-08-24');
 assert.equal(context.adminCore.adminStatutFacture(modified,new Date(2026,8,30,12)),'payee');
});

test(path+' intègre Administration à la navigation, au dashboard et aux sauvegardes sans nouveau rôle',()=>{
 assert.match(source,/const ONGLETS_RESP=\['caisse','bil','admin'\]/);
 assert.match(source,/<section class="screen" id="s-admin"><\/section>/);
 assert.match(source,/\{id:'admin',i:iconesNav\.admin,l:'Administration'/);
 assert.match(source,/if\(screen==='admin'\)renderAdministration\(\)/);
 assert.match(source,/function adminWidgetAccueil\(\)/);
 assert.match(source,/data-admin-open/);
 assert.match(source,/data:application\/pdf/);
 const postes=source.match(/const POSTES=\[[\s\S]*?\];/)?.[0]||'';
 assert.ok(postes);
 assert.doesNotMatch(postes,/id:'admin'/);
});
