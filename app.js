
const ADMIN_CODE = '10709';
const ADMIN_KEY = 'klshDrugSearch.adminOn.v1';
const LOCAL_FALLBACK_KEY = 'klshDrugSearch.localFallback.v1';

const state = {
  sampleDrugs: [],
  drugs: [],
  filtered: [],
  query: '',
  activeAccount: 'all',
  edChecked: false,
  nedChecked: false,
  isAdmin: sessionStorage.getItem(ADMIN_KEY) === '1',
  editingId: null,
  loadedFrom: 'กำลังโหลดข้อมูล',
  firebaseReady: false,
  firebaseRef: null,
  firebaseError: '',
};

const $ = (id) => document.getElementById(id);
const els = {
  searchInput: $('searchInput'), clearSearchBtn: $('clearSearchBtn'), firebaseStatus: $('firebaseStatus'), focusSearchBtn: $('focusSearchBtn'),
  loginBtn: $('loginBtn'), loginBtnDesktop: $('loginBtnDesktop'), logoutBtn: $('logoutBtn'), addDrugBtn: $('addDrugBtn'), editDrugBtn: $('editDrugBtn'), adminBadge: $('adminBadge'), edToggleCard: $('edToggleCard'), nedToggleCard: $('nedToggleCard'),
  totalCount: $('totalCount'), edCount: $('edCount'), nedCount: $('nedCount'), visibleCount: $('visibleCount'),
  drugTableBody: $('drugTableBody'), mobileList: $('mobileList'), emptyState: $('emptyState'),
  loginModal: $('loginModal'), loginForm: $('loginForm'), passcodeInput: $('passcodeInput'), loginError: $('loginError'),
  drugModal: $('drugModal'), drugForm: $('drugForm'), drugModalMode: $('drugModalMode'), drugModalTitle: $('drugModalTitle'), deleteDrugBtn: $('deleteDrugBtn'),
  editPickerModal: $('editPickerModal'), editSearchInput: $('editSearchInput'), editPickerList: $('editPickerList'),
  edCheck: $('edCheck'), nedCheck: $('nedCheck'), toast: $('toast'),
};

init();

async function init(){
  bindEvents();
  await loadSampleDrugs();
  setupFirebase();
  if(!state.firebaseReady){
    loadLocalFallback();
    refreshAll();
  }
  updateAdminUI();
}

function bindEvents(){
  els.searchInput.addEventListener('input', (e)=>{ state.query = e.target.value; applySearch(); });
  els.clearSearchBtn.addEventListener('click', ()=>{ state.query=''; els.searchInput.value=''; applySearch(); els.searchInput.focus(); });
  document.querySelectorAll('[data-account-filter]').forEach(btn=>btn.addEventListener('click', ()=>setAccountFilter(btn.dataset.accountFilter)));
  els.edCheck.addEventListener('change', ()=>{ state.edChecked = els.edCheck.checked; syncStatusCards(); applySearch(); });
  els.nedCheck.addEventListener('change', ()=>{ state.nedChecked = els.nedCheck.checked; syncStatusCards(); applySearch(); });
  els.edToggleCard?.addEventListener('click', ()=>{ els.edCheck.checked = !els.edCheck.checked; state.edChecked = els.edCheck.checked; syncStatusCards(); applySearch(); });
  els.nedToggleCard?.addEventListener('click', ()=>{ els.nedCheck.checked = !els.nedCheck.checked; state.nedChecked = els.nedCheck.checked; syncStatusCards(); applySearch(); });
  document.querySelectorAll('[data-query]').forEach(btn=>btn.addEventListener('click', ()=>{ els.searchInput.value = btn.dataset.query || ''; state.query = els.searchInput.value; applySearch(); els.searchInput.focus(); }));

  els.loginBtn.addEventListener('click', openLogin);
  els.loginBtnDesktop?.addEventListener('click', openLogin);
  els.focusSearchBtn?.addEventListener('click', ()=>els.searchInput.focus());
  els.logoutBtn.addEventListener('click', logoutAdmin);
  els.addDrugBtn.addEventListener('click', ()=>openDrugModal());
  els.editDrugBtn?.addEventListener('click', openEditPicker);

  els.loginForm.addEventListener('submit', (e)=>{ e.preventDefault(); verifyLogin(); });
  document.querySelectorAll('[data-close-login]').forEach(btn=>btn.addEventListener('click', ()=>els.loginModal.close()));
  document.querySelectorAll('[data-close-drug]').forEach(btn=>btn.addEventListener('click', ()=>els.drugModal.close()));
  document.querySelectorAll('[data-close-edit]').forEach(btn=>btn.addEventListener('click', ()=>els.editPickerModal.close()));
  els.drugForm.addEventListener('submit', saveDrugFromForm);
  els.deleteDrugBtn.addEventListener('click', deleteCurrentDrug);
  els.editSearchInput?.addEventListener('input', renderEditPicker);

  document.addEventListener('click', (e)=>{
    const editBtn = e.target.closest('[data-edit-id]');
    if(editBtn) openDrugModal(editBtn.dataset.editId);
    const deleteBtn = e.target.closest('[data-delete-id]');
    if(deleteBtn) deleteDrug(deleteBtn.dataset.deleteId);
  });
}

async function loadSampleDrugs(){
  try{
    const response = await fetch('drugs.json', { cache:'no-store' });
    const data = await response.json();
    state.sampleDrugs = Array.isArray(data) ? data.map(normalizeDrugObject).map((d,i)=>({ ...d, id:d.id || `sample-${i+1}`, source:'sample' })) : [];
  }catch(err){
    console.warn('Cannot load drugs.json', err);
    state.sampleDrugs = [];
  }
}

function setupFirebase(){
  const config = window.KLSH_FIREBASE_CONFIG || {};
  const isPlaceholder = !config.apiKey || String(config.apiKey).includes('YOUR_') || String(config.projectId || '').includes('YOUR_');
  if(!window.firebase || isPlaceholder){
    state.firebaseReady = false;
    state.loadedFrom = 'ข้อมูลทดสอบ';
    state.firebaseError = 'ยังไม่ได้ใส่ Firebase config';
    updateFirebaseStatus();
    return;
  }

  try{
    if(!firebase.apps.length) firebase.initializeApp(config);
    const path = window.KLSH_FIREBASE_DB_PATH || 'klsh_drug_search/drugs';
    state.firebaseRef = firebase.database().ref(path);
    state.firebaseReady = true;
    state.loadedFrom = 'Firebase';
    updateFirebaseStatus('กำลังเชื่อม Firebase...');

    state.firebaseRef.on('value', (snapshot)=>{
      const val = snapshot.val();
      const list = firebaseValueToArray(val);
      if(list.length === 0 && state.sampleDrugs.length){
        state.drugs = state.sampleDrugs.map(d=>({ ...d, source:'sample' }));
        refreshAll();
        updateAdminUI();
        updateFirebaseStatus('ใช้รายการยาจากไฟล์');
        return;
      }
      const firebaseList = list
        .map(d=>({ ...normalizeDrugObject(d), source:'firebase' }))
        .filter(d=>!isLegacyDemoDrug(d));
      const sampleList = state.sampleDrugs.map(d=>({ ...d, source:'sample' }));
      state.drugs = mergeDrugLists(sampleList, firebaseList);
      refreshAll();
      updateAdminUI();
      updateFirebaseStatus(list.length ? '' : 'ใช้รายการยาจากไฟล์');
    }, (error)=>{
      console.error(error);
      state.firebaseReady = false;
      state.firebaseError = error.message || 'Firebase error';
      loadLocalFallback();
      refreshAll();
      updateFirebaseStatus(`เชื่อม Firebase ไม่สำเร็จ`);
    });
  }catch(err){
    console.error(err);
    state.firebaseReady = false;
    state.firebaseError = err.message || String(err);
    loadLocalFallback();
    refreshAll();
    updateFirebaseStatus(`เชื่อม Firebase ไม่สำเร็จ`);
  }
}

function firebaseValueToArray(value){
  if(!value) return [];
  if(Array.isArray(value)) return value.filter(Boolean);
  return Object.entries(value).map(([key, drug])=>({ ...(drug || {}), id: drug?.id || key }));
}


function stableDrugKey(drug){
  return normalize([drug.genericName, drug.strength, drug.form, drug.account, drug.edStatus].filter(Boolean).join('|'));
}
function isLegacyDemoDrug(drug){
  return /^d\d{3}$/.test(String(drug.id || ''));
}
function mergeDrugLists(baseList=[], extraList=[]){
  const map = new Map();
  baseList.forEach(drug=>map.set(stableDrugKey(drug) || drug.id, drug));
  extraList.forEach(drug=>map.set(stableDrugKey(drug) || drug.id, drug));
  return Array.from(map.values());
}

function loadLocalFallback(){
  try{
    const local = JSON.parse(localStorage.getItem(LOCAL_FALLBACK_KEY) || '[]').map(normalizeDrugObject).map(d=>({ ...d, source:'local' }));
    state.drugs = local.length ? local : state.sampleDrugs.map(d=>({ ...d, source:'sample' }));
  }catch{
    state.drugs = state.sampleDrugs.map(d=>({ ...d, source:'sample' }));
  }
  updateFirebaseStatus();
}

function saveLocalFallback(){
  localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(state.drugs.map(stripUiFields)));
}

function updateFirebaseStatus(text){
  if(!els.firebaseStatus) return;
  els.firebaseStatus.textContent = text || '';
}

function setAccountFilter(filter){
  state.activeAccount = filter || 'all';
  document.querySelectorAll('[data-account-filter]').forEach(btn=>btn.classList.toggle('is-active', btn.dataset.accountFilter === state.activeAccount));
  applySearch();
}

function refreshAll(){
  applySearch();
  renderSummary();
  syncStatusCards();
}

function applySearch(){
  const query = normalize(state.query);
  const filtered = state.drugs.filter(drug=>{
    const matchQuery = query ? normalize(searchBlob(drug)).includes(query) : true;
    const matchAccount = state.activeAccount === 'all' ? true : normalizeAccount(drug.account) === state.activeAccount;
    const status = normalizeEdStatus(drug.edStatus);
    const statusFilters = [];
    if(state.edChecked) statusFilters.push('ED');
    if(state.nedChecked) statusFilters.push('NED');
    const matchStatus = statusFilters.length ? statusFilters.includes(status) : true;
    return matchQuery && matchAccount && matchStatus;
  }).sort(compareDrugNames);
  state.filtered = filtered;
  render(filtered);
}

function compareDrugNames(a,b){
  const an = (a.genericName || '').trim();
  const bn = (b.genericName || '').trim();
  return an.localeCompare(bn, 'th', { sensitivity:'base', numeric:true });
}

function renderSummary(){
  els.totalCount.textContent = state.drugs.length.toLocaleString('th-TH');
  els.edCount.textContent = state.drugs.filter(d=>normalizeEdStatus(d.edStatus)==='ED').length.toLocaleString('th-TH');
  els.nedCount.textContent = state.drugs.filter(d=>normalizeEdStatus(d.edStatus)==='NED').length.toLocaleString('th-TH');
}

function syncStatusCards(){
  els.edToggleCard?.classList.toggle('active', !!els.edCheck.checked);
  els.nedToggleCard?.classList.toggle('active', !!els.nedCheck.checked);
}

function render(items){
  els.visibleCount.textContent = items.length.toLocaleString('th-TH');
  els.emptyState.hidden = items.length !== 0;
  els.drugTableBody.innerHTML = items.map(renderRow).join('');
  els.mobileList.innerHTML = items.map(renderCard).join('');
  document.querySelectorAll('.admin-col').forEach(el=>el.hidden = !state.isAdmin);
}

function renderRow(drug){
  return `<tr>
    <td>${renderDrugName(drug)}</td>
    <td><span class="strength">${escapeHtml(drug.strength || '-')}</span><span class="form">${escapeHtml(drug.form || '')}</span></td>
    <td>${renderAccount(drug.account)}</td>
    <td>${renderStatus(drug.edStatus)}</td>
    <td class="admin-col" ${state.isAdmin ? '' : 'hidden'}>${renderActions(drug)}</td>
  </tr>`;
}

function renderCard(drug){
  return `<article class="drug-card">
    <div class="drug-card-top"><div>${renderDrugName(drug)}</div><div class="drug-card-badges">${renderAccount(drug.account)}${renderStatus(drug.edStatus)}</div></div>
    <div class="drug-card-meta">${escapeHtml([drug.strength, drug.form].filter(Boolean).join(' • ') || '-')}</div>
    ${state.isAdmin ? `<div class="card-actions">${renderActions(drug)}</div>` : ''}
  </article>`;
}

function renderDrugName(drug){
  const trade = drug.tradeNames?.length ? `<div class="trade-name">${escapeHtml(drug.tradeNames.join(', '))}</div>` : '';
  const tag = drug.source === 'local' ? `<span class="badge account">ในเครื่อง</span>` : '';
  return `<div class="drug-name">${escapeHtml(drug.genericName || '-')} ${tag}</div>${trade}`;
}

function renderActions(drug){
  return `<div class="row-actions"><button class="mini-btn" type="button" data-edit-id="${escapeHtml(drug.id)}">แก้ไขยา</button><button class="mini-btn danger" type="button" data-delete-id="${escapeHtml(drug.id)}">ลบ</button></div>`;
}
function renderAccount(account){ const cls = accountClass(account); return `<span class="badge account ${cls}">${escapeHtml(shortAccountLabel(account || '-'))}</span>`; }
function accountClass(account){
  const acct = normalizeAccount(account);
  if(acct === 'บัญชี ก') return 'account-a';
  if(acct === 'บัญชี ข') return 'account-b';
  if(acct === 'บัญชี ค') return 'account-c';
  if(acct === 'บัญชี ง') return 'account-d';
  if(acct === 'บัญชี จ1') return 'account-j1';
  if(acct === 'บัญชี จ2') return 'account-j2';
  return 'account-other';
}
function renderStatus(status){
  const normalized = normalizeEdStatus(status); const cls = normalized === 'ED' ? 'ed' : normalized === 'NED' ? 'ned' : 'other';
  return `<span class="badge ${cls}">${escapeHtml(normalized || status || '-')}</span>`;
}

function shortAccountLabel(value){
  const acct = normalizeAccount(value);
  return acct === '-' ? '-' : acct.replace('บัญชี ', 'บช ');
}

function openLogin(){
  els.loginError.hidden = true; els.passcodeInput.value = ''; els.loginModal.showModal(); setTimeout(()=>els.passcodeInput.focus(),80);
}
function verifyLogin(){
  if(els.passcodeInput.value.trim() === ADMIN_CODE){
    state.isAdmin = true; sessionStorage.setItem(ADMIN_KEY,'1'); els.loginModal.close(); updateAdminUI(); render(state.filtered); showToast('เข้าสู่ระบบแล้ว');
  }else{ els.loginError.hidden = false; els.passcodeInput.select(); }
}
function logoutAdmin(){
  state.isAdmin = false; sessionStorage.removeItem(ADMIN_KEY); updateAdminUI(); render(state.filtered); showToast('ออกจากระบบแล้ว');
}
function updateAdminUI(){
  els.loginBtn.hidden = state.isAdmin;
  if(els.loginBtnDesktop) els.loginBtnDesktop.hidden = state.isAdmin;
  els.logoutBtn.hidden = !state.isAdmin;
  els.addDrugBtn.hidden = !state.isAdmin;
  if(els.editDrugBtn) els.editDrugBtn.hidden = !state.isAdmin;
  els.adminBadge.hidden = !state.isAdmin;
  document.querySelectorAll('.admin-col').forEach(el=>el.hidden = !state.isAdmin);
}

function openDrugModal(id=null){
  if(!state.isAdmin){ openLogin(); return; }
  state.editingId = id;
  els.drugForm.reset();
  const drug = id ? state.drugs.find(d=>d.id === id) : null;
  els.drugModalMode.textContent = id ? 'Edit drug' : 'Add drug';
  els.drugModalTitle.textContent = id ? 'แก้ไขรายการยา' : 'เพิ่มรายการยาใหม่';
  els.deleteDrugBtn.hidden = !id;
  if(drug){
    els.drugForm.genericName.value = drug.genericName || '';
    els.drugForm.tradeNames.value = (drug.tradeNames || []).join(', ');
    els.drugForm.strength.value = drug.strength || '';
    els.drugForm.form.value = drug.form || 'ไม่ระบุ';
    els.drugForm.account.value = drug.account || '-';
    els.drugForm.edStatus.value = drug.edStatus || '-';
  }
  if(els.editPickerModal?.open) els.editPickerModal.close();
  els.drugModal.showModal();
  setTimeout(()=>els.drugForm.genericName.focus(),80);
}

async function saveDrugFromForm(e){
  e.preventDefault();
  const fd = new FormData(els.drugForm);
  const drug = normalizeDrugObject({
    id: state.editingId || makeId(),
    genericName: fd.get('genericName'), tradeNames: splitList(fd.get('tradeNames')), strength: fd.get('strength'), form: fd.get('form'),
    account: fd.get('account'), edStatus: fd.get('edStatus'), keywords: [],
    updatedAt: new Date().toISOString()
  });
  try{
    if(state.firebaseReady && state.firebaseRef){
      await state.firebaseRef.child(drug.id).set(stripUiFields(drug));
      showToast('บันทึกแล้ว');
    }else{
      const idx = state.drugs.findIndex(d=>d.id === drug.id);
      if(idx >= 0) state.drugs[idx] = { ...drug, source:'local' }; else state.drugs.unshift({ ...drug, source:'local' });
      saveLocalFallback(); refreshAll();
      showToast('บันทึกในเครื่องแล้ว');
    }
    els.drugModal.close();
  }catch(err){
    console.error(err); showToast('บันทึกไม่สำเร็จ');
  }
}

function deleteCurrentDrug(){ if(state.editingId) deleteDrug(state.editingId, true); }
async function deleteDrug(id, closeModal=false){
  if(!state.isAdmin) return openLogin();
  const drug = state.drugs.find(d=>d.id === id);
  if(!drug) return;
  if(!confirm(`ลบรายการ ${drug.genericName || 'นี้'} ?`)) return;
  try{
    if(state.firebaseReady && state.firebaseRef && drug.source !== 'sample'){
      await state.firebaseRef.child(id).remove();
      showToast('ลบแล้ว');
    }else if(state.firebaseReady && drug.source === 'sample'){
      showToast('กดใส่ข้อมูลทดสอบขึ้น Firebase ก่อน');
      return;
    }else{
      state.drugs = state.drugs.filter(d=>d.id !== id);
      saveLocalFallback(); refreshAll(); showToast('ลบแล้ว');
    }
    if(closeModal) els.drugModal.close();
  }catch(err){
    console.error(err); showToast('ลบไม่สำเร็จ');
  }
}

async function seedFirebaseFromSample(){
  if(!state.isAdmin) return openLogin();
  if(!state.firebaseReady || !state.firebaseRef) return showToast('ยังไม่เชื่อม Firebase');
  if(!confirm('นำยาทดสอบทั้งหมดขึ้น Firebase?')) return;
  const payload = {};
  state.sampleDrugs.forEach((d, i)=>{
    const id = d.id || `drug-${i+1}`;
    payload[id] = stripUiFields({ ...d, id, updatedAt:new Date().toISOString() });
  });
  try{
    await state.firebaseRef.set(payload);
    showToast('ใส่ข้อมูลทดสอบแล้ว');
  }catch(err){
    console.error(err); showToast('นำขึ้น Firebase ไม่สำเร็จ');
  }
}

function exportJson(){
  const data = state.drugs.map(stripUiFields);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'drugs.json'; a.click(); URL.revokeObjectURL(url);
  showToast('ดาวน์โหลดแล้ว');
}


function openEditPicker(){
  if(!state.isAdmin) return openLogin();
  if(els.editSearchInput) els.editSearchInput.value = '';
  renderEditPicker();
  els.editPickerModal.showModal();
  setTimeout(()=>els.editSearchInput?.focus(),80);
}

function renderEditPicker(){
  if(!els.editPickerList) return;
  const query = normalize(els.editSearchInput?.value || '');
  const items = state.drugs
    .slice()
    .sort(compareDrugNames)
    .filter(drug => !query || normalize(searchBlob(drug)).includes(query));
  if(!items.length){
    els.editPickerList.innerHTML = '<div class="picker-empty">ไม่พบรายการยา</div>';
    return;
  }
  els.editPickerList.innerHTML = items.map(drug => `
    <button class="picker-item" type="button" data-picker-id="${escapeHtml(drug.id)}">
      <div>
        <strong>${escapeHtml(drug.genericName || '-')}</strong>
        <small>${escapeHtml([shortAccountLabel(drug.account), normalizeEdStatus(drug.edStatus)].filter(Boolean).join(' • '))}</small>
      </div>
      <span>แก้ไข</span>
    </button>
  `).join('');
  els.editPickerList.querySelectorAll('[data-picker-id]').forEach(btn=>btn.addEventListener('click', ()=>openDrugModal(btn.dataset.pickerId)));
}

function normalizeDrugObject(drug){
  const tradeNames=Array.isArray(drug.tradeNames)?drug.tradeNames:splitList(drug.tradeNames||drug.tradeName||''); const keywords=[];
  const obj={ id:String(drug.id||'').trim(),
    genericName:String(drug.genericName||drug.name||'').trim(), tradeNames:tradeNames.map(String).map(v=>v.trim()).filter(Boolean),
    strength:String(drug.strength||'ไม่ระบุ').trim(), form:String(drug.form||'ไม่ระบุ').trim(), account:normalizeAccount(String(drug.account||'').trim()), edStatus:normalizeEdStatus(String(drug.edStatus||'').trim()), note:String(drug.note||'').trim(), keywords:keywords.map(String).map(v=>v.trim()).filter(Boolean), updatedAt: drug.updatedAt || '' };
  if(!obj.id) obj.id = makeId(); return obj;
}
function stripUiFields(drug){ const clean = { ...drug }; delete clean.source; return clean; }
function makeId(){ return `drug-${Date.now()}-${Math.random().toString(36).slice(2,8)}`; }
function splitList(value){ if(Array.isArray(value)) return value; return String(value||'').split(/[;|,/]+/).map(v=>v.trim()).filter(Boolean); }
function normalizeAccount(value){
  const text=String(value||'').replace(/\s+/g,' ').trim();
  if(!text) return '-';
  const normalized = text
    .replace(/^บช\.?\s*/i,'บัญชี ')
    .replace(/^บัญชี\s*([กขคงจ])(1|2)?$/,'บัญชี $1$2')
    .replace(/^([กขคง])$/,'บัญชี $1')
    .replace(/^จ1$/,'บัญชี จ1')
    .replace(/^จ2$/,'บัญชี จ2')
    .replace(/^จ$/,'บัญชี จ');
  if(/^บัญชี\s*[กขคงจ](1|2)?$/.test(normalized)) return normalized.replace(/บัญชี\s*/,'บัญชี ');
  return normalized;
}
function normalizeEdStatus(value){ const text=String(value||'').trim().toUpperCase(); if(!text) return '-'; if(text.includes('NED')||text.includes('NON')) return 'NED'; if(text==='E'||text.includes('ED')) return 'ED'; return String(value||'').trim(); }
function searchBlob(drug){ return [drug.genericName,...(drug.tradeNames||[]),drug.strength,drug.form,drug.account,drug.edStatus,drug.note].filter(Boolean).join(' '); }
function normalize(text){ return String(text||'').toLowerCase().replace(/\s+/g,' ').trim(); }
function escapeHtml(value){ return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
function showToast(msg){ els.toast.textContent=msg; els.toast.classList.add('show'); clearTimeout(showToast.t); showToast.t=setTimeout(()=>els.toast.classList.remove('show'),2200); }
