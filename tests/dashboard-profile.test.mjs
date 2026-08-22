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
  st:{who:'Gestion',administration:empty(),commandes:[],liv:[],prods:[]},
  administrationVierge:empty,
  num(value){const n=parseFloat(String(value).replace(',','.'));return Number.isNaN(n)?0:n},
  fmt(value){return (Math.round(value*100)/100).toFixed(2).replace('.',',')},
  adminFormatDate(value){return String(value||'').slice(0,10)},
  uid(prefix){id+=1;return prefix+'_'+id}
 };
 vm.createContext(context);
 vm.runInContext(extractAdministrationCore(source)+'\nthis.adminCore={adminDateISO,adminDiffJours,adminStatutFacture,adminStatutContrat,adminStatutObligation,adminCoutsContrat,adminResume,adminAlertes,adminAssistant,adminDansEtablissement,adminConstruireFacture,adminSynchroniserDemandeApprobation,adminAppliquerStatutFacture,adminCalendrier,adminPrevisionTresorerie,adminTVA,adminAnomaliesDetectees};',context);
 return context;
}

function createBeverageBottleCore(products=[],carte=[]){
 const context={
  Number,Object,Array,Math,isNaN,
  UNITES:['ml','cl','L','g','kg','u','btl'],
  st:{prods:products,carte,stock:{},count:{}},
  num(value){const n=parseFloat(String(value).replace(',','.'));return Number.isNaN(n)?0:n},
  prod(id){return context.st.prods.find(product=>product.id===id)}
 };
 const match=source.match(/\/\* BEVERAGE_BOTTLE_CORE_START[\s\S]*?\/\* BEVERAGE_BOTTLE_CORE_END \*\//);
 assert.ok(match,'le noyau de conversion des bouteilles doit être présent');
 vm.createContext(context);
 vm.runInContext(match[0]+'\nthis.bottleCore={qteUnite,unitesFiche,uniteFiche,qteFicheEnStock,migrerUnitesBoissons};',context);
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

test(path+' calcule les contrats et rassemble les échéances administratives',()=>{
 const context=createAdministrationCore(source),now=new Date(2026,7,22,12);
 context.st.administration.contracts=[
  {id:'c1',establishmentId:'etab-a',name:'Assurance',supplier:'Assureur',costMonthly:100,endDate:'2026-09-20',status:'actif'},
  {id:'c2',establishmentId:'etab-b',name:'Hors site',supplier:'X',costAnnual:9999,endDate:'2026-08-25',status:'actif'}
 ];
 context.st.administration.obligations=[{id:'o1',establishmentId:'etab-a',name:'Contrôle sécurité',nextDue:'2026-08-29',status:'conforme'}];
 context.st.administration.deadlines=[{id:'d1',establishmentId:'etab-a',title:'Dossier annuel',date:'2026-09-01',status:'pending'}];
 assert.deepEqual(JSON.parse(JSON.stringify(context.adminCore.adminCoutsContrat(context.st.administration.contracts[0]))),{monthly:100,annual:1200});
 assert.equal(context.adminCore.adminStatutContrat(context.st.administration.contracts[0],now),'a_renouveler');
 assert.equal(context.adminCore.adminStatutObligation(context.st.administration.obligations[0],now),'bientot_expire');
 const calendar=context.adminCore.adminCalendrier(now);
 assert.deepEqual(JSON.parse(JSON.stringify(calendar.map(event=>event.type))),['obligation','manuel','contrat']);
 const summary=context.adminCore.adminResume(now);
 assert.equal(summary.contractAnnualCost,1200);
 assert.equal(summary.obligationsAction,1);
 assert.ok(context.adminCore.adminAlertes(now).some(alert=>alert.title==='Contrat à renouveler'));
});

test(path+' projette la trésorerie uniquement depuis les données enregistrées',()=>{
 const context=createAdministrationCore(source),now=new Date(2026,7,22,12);
 assert.equal(context.adminCore.adminPrevisionTresorerie(now).status,'missing');
 context.st.administration.settings.currentCashBalance=10000;
 context.st.administration.settings.cashWarningThreshold=5000;
 context.st.administration.invoices=[{id:'f1',establishmentId:'etab-a',supplier:'Metro',status:'a_payer',dueDate:'2026-08-25',amountTTC:4000}];
 context.st.administration.cashFlowForecasts=[
  {id:'m1',establishmentId:'etab-a',title:'Loyer',date:'2026-08-28',direction:'out',amount:2500},
  {id:'m2',establishmentId:'etab-a',title:'Encaissement',date:'2026-08-30',direction:'in',amount:1000},
  {id:'m3',establishmentId:'etab-b',title:'Autre site',date:'2026-08-23',direction:'out',amount:9999}
 ];
 const forecast=context.adminCore.adminPrevisionTresorerie(now);
 assert.equal(forecast.status,'ready');
 assert.equal(forecast.forecastBalance,4500);
 assert.equal(forecast.lowPoint,3500);
 assert.equal(forecast.events.length,3);
 assert.ok(context.adminCore.adminAlertes(now).some(alert=>alert.id==='cash_low'));
});

test(path+' ventile la TVA et conserve son évolution mensuelle',()=>{
 const context=createAdministrationCore(source);
 context.st.administration.invoices=[
  {id:'f1',establishmentId:'etab-a',documentDate:'2026-07-02',taxRate:10,taxAmount:100},
  {id:'f2',establishmentId:'etab-a',documentDate:'2026-08-10',taxRate:20,taxAmount:240},
  {id:'f3',establishmentId:'etab-b',documentDate:'2026-08-12',taxRate:20,taxAmount:900}
 ];
 context.st.administration.settings.vatCollectedSource={amount:500,period:'2026-08',source:'manual'};
 const vat=context.adminCore.adminTVA(new Date(2026,7,22));
 assert.equal(vat.deductible,340);
 assert.equal(vat.collected,500);
 assert.equal(vat.estimated,160);
 assert.equal(vat.byRate['10'],100);
 assert.equal(vat.byRate['20'],240);
 assert.deepEqual(JSON.parse(JSON.stringify(vat.byMonth)),[['2026-07',100],['2026-08',240]]);
});

test(path+' applique un workflow configurable et persiste la demande de validation',()=>{
 const context=createAdministrationCore(source),now=new Date(2026,7,22,12);
 context.st.administration.approvalWorkflows=[{id:'r1',minAmount:500,maxAmount:2000,role:'salle',documentType:'facture',establishmentId:'etab-a',enabled:true}];
 const invoice=context.adminCore.adminConstruireFacture({supplier:'Metro',amountHT:1000,taxAmount:100,amountTTC:1100,status:'a_valider',lines:[{description:'Marchandises',quantity:2,unitPriceHT:500}]},null,now);
 assert.equal(invoice.approvalRuleId,'r1');
 assert.equal(invoice.approvalStatus,'pending');
 assert.equal(invoice.lines.length,1);
 const request=context.adminCore.adminSynchroniserDemandeApprobation(invoice,now);
 assert.equal(request.invoiceId,invoice.id);
 assert.equal(request.requestedRole,'salle');
 assert.equal(context.st.administration.approvalRequests.length,1);
 invoice.approvalStatus='approved';
 context.adminCore.adminSynchroniserDemandeApprobation(invoice,new Date(2026,7,23,12));
 assert.equal(context.st.administration.approvalRequests[0].status,'approved');
});

test(path+' détecte les écarts commande, livraison et hausse tarifaire configurée',()=>{
 const context=createAdministrationCore(source);
 context.st.commandes=[{id:'cmd1',lines:[{q:10,px:5}]}];
 context.st.liv=[{id:'liv1',total:60}];
 context.st.prods=[{id:'p1',n:'Eau',fo:'Fournisseur A',pxPrev:1,px:1.2}];
 context.st.administration.settings.priceIncreaseAlertPercent=10;
 context.st.administration.invoices=[{id:'f1',establishmentId:'etab-a',supplier:'Fournisseur A',invoiceNumber:'A1',amountHT:100,amountTTC:120,orderReference:'cmd1',deliveryReference:'liv1'}];
 const anomalies=context.adminCore.adminAnomaliesDetectees(new Date(2026,7,22));
 assert.ok(anomalies.some(item=>item.type==='difference_commande_facture'));
 assert.ok(anomalies.some(item=>item.type==='difference_livraison_facture'));
 assert.ok(anomalies.some(item=>item.type==='augmentation_prix'));
});

test(path+' expose toutes les vues Administration et leurs états responsives',()=>{
 for(const id of ['overview','inbox','invoices','deadlines','cashflow','vat','accounting','contracts','documents','calendar','compliance','anomalies','settings']){
  assert.match(source,new RegExp("\\['"+id+"'"));
 }
 assert.match(source,/function adminVueTresorerie\(\)/);
 assert.match(source,/function adminVueTVA\(\)/);
 assert.match(source,/function adminVueContrats\(\)/);
 assert.match(source,/function adminVueConformite\(\)/);
 assert.match(source,/function adminVueAnomalies\(\)/);
 assert.match(source,/@media\(max-width:760px\)[\s\S]*?\.admin-subgrid/);
 assert.match(source,/Estimation indicative basée sur les données présentes dans le logiciel/);
 assert.match(source,/Aucun connecteur fictif/);
});

test(path+' aligne l’en-tête Compté avec les zones de saisie de l’inventaire',()=>{
 assert.match(source,/--inv-table-width:980px/);
 assert.match(source,/\.inv-line,\.inv-table-head\{[^}]*width:100%;max-width:var\(--inv-table-width\)/);
 assert.match(source,/@media\(min-width:900px\)\{\.inv-table-head\{padding:0 8px 10px!important\}\}/);
});

test(path+' réserve les quantités attendues et écarts d’inventaire aux seuls profils autorisés',()=>{
 assert.match(source,/const peutVoirEcartsInventaire=\(\)=>\['gestion','salle'\]\.includes\(st\.whoId\)/);
 const inventory=source.match(/function renderInv\(\)\{[\s\S]*?\n\}\n\nasync function validerInv/)?.[0]||'';
 const history=source.match(/function renderInvHist\(sub\)\{[\s\S]*?\n\}\n\nfunction openHist/)?.[0]||'';
 const detail=source.match(/function openHist\(ix\)\{[\s\S]*?\n\}\n\nfunction dlCsv/)?.[0]||'';
 const exportCsv=source.match(/function exportInvCsv\(\)\{[\s\S]*?\n\}/)?.[0]||'';
 assert.ok(inventory&&history&&detail&&exportCsv);
 assert.match(inventory,/const voirEcarts=peutVoirEcartsInventaire\(\)/);
 assert.match(inventory,/voirEcarts\?`<div class="iv-att">/);
 assert.match(inventory,/classList\.toggle\('inventory-limited',!voirEcarts\)/);
 assert.match(history,/voirEcarts&&rec\.length/);
 assert.match(detail,/voirEcarts\?\[\['Produit','Unite','Attendu','Compte','Ecart'/);
 assert.match(exportCsv,/const voirEcarts=peutVoirEcartsInventaire\(\)/);
 assert.match(source,/peutVoirEcartsInventaire\(\)\?`<div class="kpi \$\{ecInv/);
 assert.match(source,/if\(peutVoirEcartsInventaire\(\)&&rep\.length\)/);
});

test(path+' prépare une relève email sécurisée sans simuler de connexion',()=>{
 assert.match(source,/const ADMIN_EMAIL_PROVIDERS=\[\{id:'gmail'/);
 assert.match(source,/mailInbox:\{provider:'',address:'',status:'not_configured'/);
 assert.match(source,/function adminImporterMessagesEmail\(messages\)/);
 assert.match(source,/sourceMessageId:messageId/);
 assert.match(source,/processingStatus:'needs_review',source:'email'/);
 assert.match(source,/journal\.some\(function\(x\)\{return x\.messageId===messageId\}\)/);
 assert.match(source,/function adminEmailAdapter\(provider\)\{return\(window\.INVO_ADMIN_EMAIL_ADAPTERS/);
 assert.match(source,/Un backend OAuth sécurisé doit être connecté à INVO/);
 assert.match(source,/INVO ne demande et ne conserve jamais le mot de passe/);
 assert.match(source,/cfg\.status==='connected'&&Date\.now\(\)-derniere>15\*60\*1000/);
 assert.doesNotMatch(source,/id="aemPassword"|id="aemSecret"/);
});

test(path+' convertit les doses cl ou ml en fractions de bouteille pour les boissons seulement',()=>{
 const context=createBeverageBottleCore([{id:'aperol',u:'btl',bottle:true,ct:100,ctu:'cl',px:14}]);
 const drinkCl={k:'drink',fu:{aperol:'cl'}},drinkMl={k:'drink',fu:{aperol:'ml'}},food={k:'food',fu:{aperol:'btl'}};
 assert.equal(context.bottleCore.qteFicheEnStock(drinkCl,'aperol',6),0.06);
 assert.equal(context.bottleCore.qteFicheEnStock(drinkMl,'aperol',60),0.06);
 assert.equal(context.bottleCore.qteFicheEnStock(drinkCl,'aperol',6)*10,0.6);
 assert.equal(context.bottleCore.qteFicheEnStock(food,'aperol',1),1);
 assert.deepEqual(Array.from(context.bottleCore.unitesFiche(drinkCl,context.st.prods[0])),['cl','ml']);
 assert.deepEqual(Array.from(context.bottleCore.unitesFiche(food,context.st.prods[0])),['btl']);
});

test(path+' migre les stocks existants sans modifier les fiches cuisine ni les fûts',()=>{
 const products=[
  {id:'aperol',u:'cl',ct:100,pc:14,s:300,seuil:100,px:0.14,z:'bar'},
  {id:'prosecco',u:'btl',s:24,seuil:10,px:7.4,z:'cave'},
  {id:'pression',u:'L',ct:30,pc:72,s:120,seuil:40,px:2.4,z:'bar'}
 ];
 const carte=[
  {id:'spritz',k:'drink',f:{aperol:6,prosecco:0.15}},
  {id:'sauce',k:'food',f:{prosecco:0.1}}
 ];
 const context=createBeverageBottleCore(products,carte);
 context.st.stock={aperol:250,prosecco:24,pression:120};context.st.count={aperol:50};
 assert.equal(context.bottleCore.migrerUnitesBoissons(),true);
 assert.equal(products[0].u,'btl');assert.equal(products[0].s,3);assert.equal(products[0].px,14);
 assert.equal(context.st.stock.aperol,2.5);assert.equal(context.st.count.aperol,0.5);
 assert.equal(products[1].ct,75);assert.equal(products[2].u,'L');
 assert.equal(carte[0].f.aperol,6);assert.equal(carte[0].fu.aperol,'cl');
 assert.equal(carte[0].f.prosecco,11.25);assert.equal(carte[0].fu.prosecco,'cl');
 assert.equal(carte[1].f.prosecco,0.1);assert.equal(carte[1].fu,undefined);
 assert.equal(context.bottleCore.migrerUnitesBoissons(),false);
 assert.equal(carte[0].f.prosecco,11.25);
});

test(path+' expose le mode bouteille et réserve le sélecteur cl/ml aux fiches boissons',()=>{
 assert.match(source,/data-mode="bottle">🍾 Bouteille/);
 assert.match(source,/id="mCtU"[\s\S]*?<option \$\{fm\.ctu==='cl'/);
 assert.match(source,/c&&c\.k==='drink'&&p&&p\.bottle\?\['cl','ml'\]/);
 assert.match(source,/Chaque vente est automatiquement convertie en fraction de bouteille/);
 assert.match(source,/if\(fm\.k==='drink'\)obj\.beverageUnitsVersion=1/);
 assert.match(source,/function changerTypeFiche\(type\)/);
});
