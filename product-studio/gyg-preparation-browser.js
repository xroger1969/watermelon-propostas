import * as policy from './gyg-preparation-policy.js';
import {syncPrimaryOption} from './completion-fields.js';
window.gygPreparationPolicy = policy;
window.syncStudioPrimaryOption = syncPrimaryOption;
const view = document.querySelector('#gygView');
if (view && !view.classList.contains('hidden')) window.renderGetYourGuide?.();
