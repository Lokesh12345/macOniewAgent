export interface DynamicContentConfig {
  // Sites known to have dynamic content
  dynamicSites: string[];
  
  // Task keywords indicating dynamic content
  dynamicTaskKeywords: string[];
  
  // DOM selectors for different element types
  selectors: {
    dialogs: string[];
    modals: string[];
    dropdowns: string[];
    loadingIndicators: string[];
    errorMessages: string[];
  };
  
  // Timing configurations
  timing: {
    domStabilizationWait: number;
    autocompleteMaxWait: number;
    modalCloseWait: number;
    defaultActionDelay: number;
  };
  
  // Execution limits
  limits: {
    maxActionsForSmartContinuation: number;
    maxBatchActions: number;
    minZIndexForModal: number;
  };
}

// Default configuration - can be overridden by user settings
export const defaultDynamicContentConfig: DynamicContentConfig = {
  dynamicSites: [
    'gmail.com',
    'outlook.com',
    'mail.yahoo.com',
    'facebook.com',
    'twitter.com',
    'linkedin.com',
    'instagram.com',
    'amazon.com',
    'ebay.com',
    'airbnb.com',
    'booking.com'
  ],
  
  dynamicTaskKeywords: [
    'compose',
    'email',
    'search',
    'fill form',
    'autocomplete',
    'date picker',
    'dropdown',
    'modal',
    'checkout',
    'login',
    'register'
  ],
  
  selectors: {
    dialogs: [
      '[role="alertdialog"]',
      '.sweet-alert',
      '.swal2-container',
      '.bootbox',
      '[data-notify="container"]',
      '.toast',
      '.notification'
    ],
    
    modals: [
      '[role="dialog"][aria-modal="true"]',
      '[role="dialog"]:not([aria-hidden="true"])',
      '.modal.show',
      '.modal.in',
      '[data-modal-open]',
      '.MuiDialog-root',
      '.ant-modal-wrap',
      '[class*="modal"][class*="open"]',
      '[class*="modal"][class*="visible"]',
      '.overlay:not([style*="display: none"])',
      '.popup:not([style*="display: none"])'
    ],
    
    dropdowns: [
      '[role="listbox"]:not([aria-hidden="true"])',
      '[role="combobox"][aria-expanded="true"]',
      '[aria-autocomplete]',
      '.ui-autocomplete:visible',
      '.autocomplete-suggestions',
      '[class*="dropdown"][class*="open"]',
      '[class*="dropdown"][class*="show"]',
      '.select2-dropdown',
      '.choices__list--dropdown',
      'ul[id*="autocomplete"]',
      'div[id*="suggestions"]',
      '.tt-menu',
      '.pac-container',
      'input[list] + datalist'
    ],
    
    loadingIndicators: [
      '[class*="loading"]:not([style*="display: none"])',
      '[class*="spinner"]:not([style*="display: none"])',
      '[class*="loader"]:not([style*="display: none"])',
      '.progress-bar',
      '[role="progressbar"]',
      '[aria-busy="true"]',
      '.shimmer',
      '.skeleton'
    ],
    
    errorMessages: [
      '[class*="error"]:not([style*="display: none"])',
      '[class*="invalid"]:not([style*="display: none"])',
      '[role="alert"]',
      '[aria-invalid="true"]',
      '.help-block',
      '.invalid-feedback',
      '.form-error',
      'input:invalid',
      '[data-error]'
    ]
  },
  
  timing: {
    domStabilizationWait: 300,
    autocompleteMaxWait: 2000,
    modalCloseWait: 2000,
    defaultActionDelay: 500
  },
  
  limits: {
    maxActionsForSmartContinuation: 2,
    maxBatchActions: 10,
    minZIndexForModal: 1000
  }
};

// Function to merge user config with defaults
export function mergeConfig(userConfig: Partial<DynamicContentConfig>): DynamicContentConfig {
  return {
    dynamicSites: [...(userConfig.dynamicSites || []), ...defaultDynamicContentConfig.dynamicSites],
    dynamicTaskKeywords: [...(userConfig.dynamicTaskKeywords || []), ...defaultDynamicContentConfig.dynamicTaskKeywords],
    selectors: {
      dialogs: [...(userConfig.selectors?.dialogs || []), ...defaultDynamicContentConfig.selectors.dialogs],
      modals: [...(userConfig.selectors?.modals || []), ...defaultDynamicContentConfig.selectors.modals],
      dropdowns: [...(userConfig.selectors?.dropdowns || []), ...defaultDynamicContentConfig.selectors.dropdowns],
      loadingIndicators: [...(userConfig.selectors?.loadingIndicators || []), ...defaultDynamicContentConfig.selectors.loadingIndicators],
      errorMessages: [...(userConfig.selectors?.errorMessages || []), ...defaultDynamicContentConfig.selectors.errorMessages]
    },
    timing: { ...defaultDynamicContentConfig.timing, ...(userConfig.timing || {}) },
    limits: { ...defaultDynamicContentConfig.limits, ...(userConfig.limits || {}) }
  };
}