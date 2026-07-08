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
  renderControls(container, meta.controls);
}
