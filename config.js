/**
 * PrivacyShield - Global Configuration
 * 
 * NOTE: The LLM/VLM API key NEVER lives in client-side code.
 * All AI requests are proxied via PROXY_SERVER_URL where the key is stored as an environment variable.
 */
const PrivacyShieldConfig = {
  // Configurable proxy endpoint (points to the secure backend proxy)
  PROXY_SERVER_URL: 'http://localhost:3001/api/agent',
  
  // Model settings for VLM
  DEFAULT_VLM_MODEL: 'qwen/qwen-2-vl-72b-instruct', // Open-weight VLM via cloud provider
  FALLBACK_VLM_MODEL: 'google/gemini-2.0-flash-001',

  // Mock User Profile for safe local autofill (Real PII is never sent over the wire)
  MOCK_PROFILE: {
    name: 'Aarav Sharma',
    first_name: 'Aarav',
    last_name: 'Sharma',
    email: 'aarav.sharma@example.com',
    phone: '+91 98765 43210',
    aadhaar: '2345 6789 0123',
    pan: 'ABCDE1234F',
    passport: 'Z1234567',
    address: 'Flat 402, Lotus Heights, Outer Ring Road, Bengaluru, Karnataka 560103',
    address_line2: 'Near Marathahalli Junction',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560103',
    country: 'India',
    occupation: 'Software Engineer',
    company: 'ISRO Research Partner',
    gender: 'Male',
    dob: '1998-05-15',
    dob_day: '15',
    dob_month: '05',
    dob_year: '1998',
    age: '28',
    qualification: 'Bachelor of Technology',
    website: 'https://aaravsharma.dev',
    linkedin: 'https://linkedin.com/in/aaravsharma',
    github: 'https://github.com/aaravsharma'
  },

  // Detection Thresholds
  THRESHOLDS: {
    faceConfidence: 0.55,
    entropySecretMinScore: 3.8,
    screenElementConfidence: 0.60
  },

  // Feature Flags
  FEATURES: {
    enableBlazeFace: true,
    enableLocalNER: true,
    enableInPlaceDOMRedaction: true,
    enableCanvasBlur: true,
    enableActionExecution: true,
    enableTelemetry: true
  },

  // Redaction Visuals
  REDACTION_STYLE: {
    maskColor: '#0f172a',
    textColor: '#38bdf8',
    borderColor: '#0284c7',
    faceBlurRadius: 18
  }
};

// Universal export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PrivacyShieldConfig;
} else if (typeof window !== 'undefined') {
  window.PrivacyShieldConfig = PrivacyShieldConfig;
}
