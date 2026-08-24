import assert from 'node:assert/strict';
import {
  buildDriveEntityFolderName,
  buildIsolatedDriveFolderMappingUpdate,
  getDriveFolderMappingAction,
} from '../supabase/functions/_shared/driveFolderIdentity.ts';

assert.equal(
  buildDriveEntityFolderName('activity', 20614, 'Subproject Monitoring'),
  'ACT-20614 - Subproject Monitoring'
);
assert.equal(
  buildDriveEntityFolderName('activity', 20615, 'Subproject Monitoring'),
  'ACT-20615 - Subproject Monitoring'
);
assert.notEqual(
  buildDriveEntityFolderName('activity', 20614, 'Subproject Monitoring'),
  buildDriveEntityFolderName('activity', 20615, 'Subproject Monitoring')
);

assert.equal(
  buildDriveEntityFolderName('subproject', 801, 'Communal Farm'),
  'SP-801 - Communal Farm'
);
assert.equal(
  buildDriveEntityFolderName('ipo', 142, 'San Isidro Farmers Producers Coop'),
  'IPO-142 - San Isidro Farmers Producers Coop'
);

assert.equal(
  buildDriveEntityFolderName('activity', 77, ''),
  'ACT-77 - ACT 77'
);
assert.throws(
  () => buildDriveEntityFolderName('activity', 0, 'Invalid'),
  /valid entity ID/i
);

assert.equal(getDriveFolderMappingAction({
  hasMapping: false,
  isSharedWithDifferentEntity: false,
}), 'create');
assert.equal(getDriveFolderMappingAction({
  hasMapping: true,
  isSharedWithDifferentEntity: false,
}), 'reuse');
assert.equal(getDriveFolderMappingAction({
  hasMapping: true,
  isSharedWithDifferentEntity: true,
}), 'isolate');

assert.deepEqual(buildIsolatedDriveFolderMappingUpdate({
  folderId: 'new-entity-folder',
  folderName: 'ACT-20614 - Subproject Monitoring',
  hierarchy: {
    module_folder_id: 'module-folder',
    component_folder_id: 'component-folder',
  },
}), {
  folder_id: 'new-entity-folder',
  folder_name: 'ACT-20614 - Subproject Monitoring',
  gallery_folder_id: null,
  files_folder_id: null,
  module_folder_id: 'module-folder',
  component_folder_id: 'component-folder',
});

console.log('Google Drive entity folder identity checks passed.');
