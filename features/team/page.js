/**
 * Team — Collaboration — share scene link, real-time co-editing, comments, review
 */
import { renderControls } from '../_shared/renderControls.js';

const meta = {
  controls: [
    { key: 'team-mode', type: 'select', label: 'Mode', default: '', options: [{"value":"share-link","label":"Share Scene Link"},{"value":"co-edit","label":"Real-Time Co-Edit"},{"value":"review","label":"Review / Annotate"}] },
    { key: 'team-room', type: 'text', label: 'Room Name', default: '' },
    { key: 'team-readonly', type: 'toggle', label: 'Read-Only for Guests', default: false },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'team-create', type: 'button', label: 'Create Room', onClick: 'logTeamCreate' },
    { key: 'team-join', type: 'button', label: 'Join Room', onClick: 'logTeamJoin' },
    { key: 'team-leave', type: 'button', label: 'Leave', onClick: 'logTeamLeave' }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
    // ── Use shared state (see app/state.js). Tags the container with the
  //    active feature name so other systems can route events back to us,
  //    and publishes it back so the next feature knows what was here.
  const featureName = state?.get?.('currentFeature') ?? "team";
  container.dataset.feature = featureName;
  if (state && typeof state.set === 'function') {
    state.set('currentFeature', "team");
  }
renderControls(container, meta.controls);
}
