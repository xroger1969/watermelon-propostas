import * as policy from './gyg-preparation-policy.js';
window.gygPreparationPolicy = policy;
const view = document.querySelector('#gygView');
if (view && !view.classList.contains('hidden')) window.renderGetYourGuide?.();
