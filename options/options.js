/**
 * PrivacyShield Options Page Controller
 */
document.addEventListener('DOMContentLoaded', async () => {
  const proxyInput = document.getElementById('input-proxy-url');
  const testProxyBtn = document.getElementById('btn-test-proxy');
  const statusMsg = document.getElementById('proxy-status-msg');
  const saveBtn = document.getElementById('btn-save-settings');
  const toast = document.getElementById('save-toast');

  // Form Fields
  const nameInput = document.getElementById('profile-name');
  const emailInput = document.getElementById('profile-email');
  const phoneInput = document.getElementById('profile-phone');
  const aadhaarInput = document.getElementById('profile-aadhaar');
  const panInput = document.getElementById('profile-pan');
  const cityInput = document.getElementById('profile-city');
  const stateInput = document.getElementById('profile-state');
  const pincodeInput = document.getElementById('profile-pincode');
  const countryInput = document.getElementById('profile-country');
  const genderInput = document.getElementById('profile-gender');
  const dobInput = document.getElementById('profile-dob');
  const occupationInput = document.getElementById('profile-occupation');
  const companyInput = document.getElementById('profile-company');
  const addressInput = document.getElementById('profile-address');

  // Load Saved Settings from storage
  chrome.storage.local.get(['proxyUrl', 'mockProfile'], (data) => {
    if (data.proxyUrl) {
      proxyInput.value = data.proxyUrl;
    } else if (typeof PrivacyShieldConfig !== 'undefined' && PrivacyShieldConfig.PROXY_SERVER_URL) {
      proxyInput.value = PrivacyShieldConfig.PROXY_SERVER_URL;
    }

    const defaultProfile = (typeof PrivacyShieldConfig !== 'undefined' && PrivacyShieldConfig.MOCK_PROFILE) || {};
    const p = data.mockProfile || defaultProfile;

    if (p) {
      if (p.name !== undefined && nameInput) nameInput.value = p.name;
      if (p.email !== undefined && emailInput) emailInput.value = p.email;
      if (p.phone !== undefined && phoneInput) phoneInput.value = p.phone;
      if (p.aadhaar !== undefined && aadhaarInput) aadhaarInput.value = p.aadhaar;
      if (p.pan !== undefined && panInput) panInput.value = p.pan;
      if (p.city !== undefined && cityInput) cityInput.value = p.city;
      if (p.state !== undefined && stateInput) stateInput.value = p.state;
      if (p.pincode !== undefined && pincodeInput) pincodeInput.value = p.pincode;
      if (p.country !== undefined && countryInput) countryInput.value = p.country;
      if (p.gender !== undefined && genderInput) genderInput.value = p.gender;
      if (p.dob !== undefined && dobInput) dobInput.value = p.dob;
      if (p.occupation !== undefined && occupationInput) occupationInput.value = p.occupation;
      if (p.company !== undefined && companyInput) companyInput.value = p.company;
      if (p.address !== undefined && addressInput) addressInput.value = p.address;
    }
  });

  // Test Proxy Endpoint Connection
  testProxyBtn.addEventListener('click', async () => {
    const url = proxyInput.value.trim();
    statusMsg.style.color = '#38bdf8';
    statusMsg.textContent = 'Testing connection...';

    try {
      // Derive base health url or test ping
      const parsed = new URL(url);
      const healthUrl = `${parsed.protocol}//${parsed.host}/health`;

      const res = await fetch(healthUrl, { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        statusMsg.style.color = '#34d399';
        statusMsg.textContent = `✔ Connected! VLM Provider: ${data.provider || 'Ready'} (${data.model || 'VLM Active'})`;
      } else {
        statusMsg.style.color = '#f59e0b';
        statusMsg.textContent = `Proxy responded with HTTP ${res.status}. Endpoint is reachable.`;
      }
    } catch (err) {
      statusMsg.style.color = '#ef4444';
      statusMsg.textContent = `✕ Could not connect to ${url}. Make sure your proxy server is running.`;
    }
  });

  // Save Settings
  saveBtn.addEventListener('click', () => {
    const proxyUrl = proxyInput.value.trim() || 'http://localhost:3001/api/agent';
    const rawName = (nameInput?.value || '').trim();
    const nameParts = rawName.split(/\s+/);
    const mockProfile = {
      name: rawName,
      first_name: nameParts[0] || '',
      last_name: nameParts.slice(1).join(' ') || '',
      email: (emailInput?.value || '').trim(),
      phone: (phoneInput?.value || '').trim(),
      aadhaar: (aadhaarInput?.value || '').trim(),
      pan: (panInput?.value || '').trim(),
      city: (cityInput?.value || '').trim(),
      state: (stateInput?.value || '').trim(),
      pincode: (pincodeInput?.value || '').trim(),
      country: (countryInput?.value || '').trim(),
      gender: (genderInput?.value || '').trim(),
      dob: (dobInput?.value || '').trim(),
      occupation: (occupationInput?.value || '').trim(),
      company: (companyInput?.value || '').trim(),
      address: (addressInput?.value || '').trim()
    };

    chrome.storage.local.set({ proxyUrl, mockProfile }, () => {
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    });
  });
});
